const { firebaseDb } = require('../lib/firebaseAdmin');
const { createInvoiceForSubscription } = require('../../functions/billing');
const nodemailer = require('nodemailer');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function invoiceMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function generateInvoice(req, res, next) {
  try {
    const invoice = await createInvoiceForSubscription(firebaseDb(), req.body.subscriptionId, req.body.periodStart);
    if (invoice.closed) return res.status(409).json({ error: 'The expired subscription was automatically closed.' });
    return res.status(201).json({ invoice });
  } catch (error) {
    return next(error);
  }
}

async function sendInvoice(req, res, next) {
  try {
    const transport = invoiceMailer();
    if (!transport) return res.status(503).json({ error: 'Invoice email is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS to server/.env.' });
    const db = firebaseDb();
    const invoiceRef = db.collection('invoices').doc(req.params.id);
    const snapshot = await invoiceRef.get();
    if (!snapshot.exists) return res.status(404).json({ error: 'Invoice not found.' });
    const invoice = snapshot.data();
    if (invoice.status === 'cancelled') return res.status(409).json({ error: 'A cancelled invoice cannot be emailed.' });
    const [customerSnapshot, settingsSnapshot] = await Promise.all([
      db.collection('users').doc(invoice.customerId).get(),
      db.collection('settings').doc('company').get(),
    ]);
    if (!customerSnapshot.exists || !customerSnapshot.get('email')) return res.status(409).json({ error: 'This invoice has no customer email address.' });
    const customer = customerSnapshot.data();
    const settings = settingsSnapshot.exists ? settingsSnapshot.data() : {};
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const productIds = [...new Set(lines.map((line) => line.productId).filter(Boolean))];
    const productSnapshots = await Promise.all(productIds.map((productId) => db.collection('products').doc(productId).get()));
    const productNames = new Map(productSnapshots.filter((product) => product.exists).map((product) => [product.id, product.get('name')]));
    const lineRows = lines.map((line) => `<tr><td>${escapeHtml(line.productName || line.name || productNames.get(line.productId) || 'Subscription item')}</td><td>${Number(line.quantity || 0)}</td><td>${Number(line.unitPrice || 0).toFixed(2)}</td><td>${Number(line.amount || Number(line.quantity || 0) * Number(line.unitPrice || 0)).toFixed(2)}</td></tr>`).join('');
    const companyName = settings.companyName || 'Brightloop';
    const currency = settings.currency || 'INR';
    const money = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount || 0));
    const outstanding = Math.max(0, Number(invoice.total || 0) - Number(invoice.amountPaid || 0));
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: customer.email,
      subject: `${companyName} invoice ${invoice.number}`,
      text: `Hello ${customer.name || ''}, invoice ${invoice.number} is attached below. Total: ${money(invoice.total)}. Due date: ${invoice.dueDate}. Outstanding: ${money(outstanding)}.`,
      html: `<div style="font:15px Arial,sans-serif;color:#202b29;max-width:720px;margin:auto"><h1 style="color:#12695f">${escapeHtml(companyName)}</h1><p>Hello ${escapeHtml(customer.name || 'there')},</p><p>Your invoice <strong>${escapeHtml(invoice.number)}</strong> is ready.</p><p>Billing period: ${escapeHtml(invoice.billingPeriodStart || invoice.invoiceDate || '')}<br>Due date: ${escapeHtml(invoice.dueDate || '')}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${lineRows}</tbody></table><p>Subtotal: ${money(invoice.subtotal)}<br>Tax: ${money(invoice.taxTotal)}<br>Discount: −${money(invoice.discountTotal)}</p><h2>Total: ${money(invoice.total)}</h2><p>Paid: ${money(invoice.amountPaid)}<br><strong>Outstanding: ${money(outstanding)}</strong></p></div>`,
    });
    await invoiceRef.set({ sentAt: new Date().toISOString(), sendCount: Number(invoice.sendCount || 0) + 1, updatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ message: `Invoice emailed to ${customer.email}.`, sentAt: new Date().toISOString() });
  } catch (error) {
    error.statusCode ||= 502;
    error.message = 'Invoice email could not be sent. Check the SMTP settings in server/.env.';
    return next(error);
  }
}

module.exports = { generateInvoice, sendInvoice };
