const crypto = require('node:crypto');

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
function billingError(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; return error; }

function addBillingPeriod(dateValue, period) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  if (period === 'daily') date.setUTCDate(date.getUTCDate() + 1);
  else if (period === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else if (period === 'monthly') {
    const day = date.getUTCDate();
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  } else if (period === 'yearly') {
    const day = date.getUTCDate(); const month = date.getUTCMonth();
    date.setUTCDate(1); date.setUTCFullYear(date.getUTCFullYear() + 1); date.setUTCMonth(month);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate()));
  } else throw billingError('The subscription plan has an invalid billing frequency.', 409);
  return date.toISOString().slice(0, 10);
}

function discountAmount(discount, { subtotal, quantity, productIds, date }) {
  if (discount.status !== 'active' || date < (discount.startDate || '') || date > (discount.endDate || '9999-12-31')) return 0;
  if (discount.usageLimit !== null && discount.usageLimit !== undefined && Number(discount.usedCount || 0) >= Number(discount.usageLimit)) return 0;
  if (subtotal < Number(discount.minPurchase || 0) || quantity < Number(discount.minQuantity || 1)) return 0;
  if (discount.appliesTo === 'product' && discount.productIds?.length && !productIds.some((id) => discount.productIds.includes(id))) return 0;
  return money(discount.type === 'percentage' ? subtotal * Number(discount.value) / 100 : Math.min(subtotal, Number(discount.value)));
}

async function createInvoiceForSubscription(db, subscriptionId, periodStart) {
  if (typeof subscriptionId !== 'string' || !subscriptionId || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)
    || Number.isNaN(Date.parse(`${periodStart}T00:00:00Z`))
    || new Date(`${periodStart}T00:00:00Z`).toISOString().slice(0, 10) !== periodStart) {
    throw billingError('A subscription and valid billing period are required.');
  }
  const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
  const invoiceId = `${subscriptionId}_${periodStart}`;
  const invoiceRef = db.collection('invoices').doc(invoiceId);
  let invoice;
  await db.runTransaction(async (transaction) => {
    const [subscriptionSnapshot, invoiceSnapshot] = await transaction.getAll(subscriptionRef, invoiceRef);
    if (!subscriptionSnapshot.exists) throw billingError('Subscription not found.', 404);
    if (invoiceSnapshot.exists) throw billingError('An invoice already exists for this subscription and billing period.', 409);
    const subscription = subscriptionSnapshot.data();
    if (!['active', 'confirmed'].includes(subscription.status)) throw billingError('Only confirmed or active subscriptions can be billed.', 409);
    if (subscription.nextInvoiceDate && periodStart !== subscription.nextInvoiceDate) throw billingError('Use the subscription’s next scheduled billing date.', 409);

    const planRef = db.collection('plans').doc(subscription.planId);
    const lineData = Array.isArray(subscription.lines) ? subscription.lines : [];
    const productRefs = [...new Set(lineData.map((line) => line.productId).filter(Boolean))].map((id) => db.collection('products').doc(id));
    const taxRefs = [...new Set(lineData.map((line) => line.taxId).filter(Boolean))].map((id) => db.collection('taxes').doc(id));
    const discountQuery = db.collection('discounts').where('status', '==', 'active');
    const [planSnapshot, productSnapshots, taxSnapshots, discountSnapshot] = await Promise.all([
      transaction.get(planRef),
      productRefs.length ? transaction.getAll(...productRefs) : Promise.resolve([]),
      taxRefs.length ? transaction.getAll(...taxRefs) : Promise.resolve([]),
      transaction.get(discountQuery),
    ]);
    if (!planSnapshot.exists) throw billingError('Subscription plan not found.', 409);
    const plan = planSnapshot.data();
    if (subscription.expiryDate && subscription.expiryDate < periodStart) {
      if (plan.autoClose) {
        transaction.update(subscriptionRef, { status: 'closed', updatedAt: new Date().toISOString() });
        invoice = null;
        return;
      }
      throw billingError('This subscription has expired and cannot be billed.', 409);
    }
    const products = new Map(productSnapshots.map((snapshot) => [snapshot.id, snapshot.exists ? snapshot.data() : null]));
    const taxes = new Map(taxSnapshots.map((snapshot) => [snapshot.id, snapshot.exists ? snapshot.data() : null]));
    const planProductIds = new Set(plan.productIds || []);
    const planPrice = Number(plan.price);
    if (!Number.isFinite(planPrice) || planPrice < 0) throw billingError('The subscription plan has an invalid price. Ask an administrator to review it.', 409);
    const pricedLines = lineData.map((line) => {
      const product = products.get(line.productId);
      const quantity = Number(line.quantity);
      if (!product || product.status === 'inactive' || !Number.isInteger(quantity) || quantity < Number(plan.minQuantity || 1) || !planProductIds.has(line.productId)) {
        throw billingError('Subscription product details are invalid. Ask an administrator to review the subscription.', 409);
      }
      const variants = product.variants || [];
      const variant = variants.find((item) => item.id === line.variantId);
      if (line.variantId && !variant) throw billingError('A subscription product option is no longer available.', 409);
      const basePrice = Number(product.salesPrice);
      const extraPrice = Number(variant?.extraPrice || 0);
      if (!Number.isFinite(basePrice) || basePrice < 0 || !Number.isFinite(extraPrice) || extraPrice < 0) throw billingError('A product has an invalid price. Ask an administrator to review it.', 409);
      const tax = taxes.get(line.taxId);
      const appliesToProduct = !tax?.productIds?.length || tax.productIds.includes(line.productId);
      const taxRate = tax?.status === 'active' && appliesToProduct ? Number(tax.rate || 0) : 0;
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw billingError('A tax rule has an invalid rate. Ask an administrator to review it.', 409);
      return { ...line, quantity, basePrice, extraPrice, taxRate };
    });
    const totalWeight = pricedLines.reduce((sum, line) => sum + (line.basePrice + line.extraPrice) * line.quantity, 0);
    const lines = pricedLines.map((line) => {
      const weight = (line.basePrice + line.extraPrice) * line.quantity;
      const planAllocation = totalWeight > 0 ? planPrice * weight / totalWeight : planPrice / pricedLines.length;
      const amount = money(planAllocation + line.extraPrice * line.quantity);
      return { ...line, unitPrice: money(amount / line.quantity), amount };
    });
    const subtotal = money(lines.reduce((sum, line) => sum + line.amount, 0));
    const taxTotal = money(lines.reduce((sum, line) => sum + line.amount * Number(line.taxRate || 0) / 100, 0));
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const productIds = lines.map((line) => line.productId);
    const discounts = discountSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
    const applied = discounts.map((discount) => ({ discount, amount: discountAmount(discount, { subtotal, quantity, productIds, date: periodStart }) })).filter(({ amount }) => amount > 0);
    const discountTotal = money(Math.min(subtotal + taxTotal, applied.reduce((sum, item) => sum + item.amount, 0)));
    const total = Math.max(0, money(subtotal + taxTotal - discountTotal));
    const due = new Date(`${periodStart}T12:00:00Z`); due.setUTCDate(due.getUTCDate() + 14);
    const now = new Date().toISOString();
    invoice = {
      number: `INV-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      subscriptionId, customerId: subscription.customerId, billingPeriodStart: periodStart,
      invoiceDate: today(), dueDate: due.toISOString().slice(0, 10), status: 'draft',
      lines: lines.map(({ taxRate, ...line }) => line), subtotal, taxTotal, discountTotal, total,
      amountPaid: 0, appliedDiscountIds: applied.map(({ discount }) => discount.id), createdAt: now, updatedAt: now,
    };
    transaction.create(invoiceRef, invoice);
    transaction.update(subscriptionRef, { nextInvoiceDate: addBillingPeriod(periodStart, plan.billingPeriod), updatedAt: now });
    for (const { discount } of applied) {
      const usedCount = Number(discount.usedCount || 0) + 1;
      transaction.update(db.collection('discounts').doc(discount.id), {
        usedCount,
        status: discount.usageLimit !== null && discount.usageLimit !== undefined && usedCount >= Number(discount.usageLimit) ? 'inactive' : discount.status,
        lastAppliedInvoiceId: invoiceId,
      });
    }
  });
  return invoice ? { id: invoiceId, ...invoice } : { id: invoiceId, closed: true };
}

module.exports = { createInvoiceForSubscription, addBillingPeriod, discountAmount };
