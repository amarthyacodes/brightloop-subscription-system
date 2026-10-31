import { mockRepository } from './mockRepository.js';

export const COLLECTIONS = {
  products: 'products', plans: 'plans', customers: 'customers', staff: 'staff', quotations: 'quotations',
  subscriptions: 'subscriptions', invoices: 'invoices', discounts: 'discounts', payments: 'payments', taxes: 'taxes',
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
function addBillingPeriod(dateValue, period) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (period === 'daily') date.setDate(date.getDate() + 1);
  if (period === 'weekly') date.setDate(date.getDate() + 7);
  if (period === 'monthly') {
    const originalDay = date.getDate();
    date.setDate(1); date.setMonth(date.getMonth() + 1);
    date.setDate(Math.min(originalDay, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  }
  if (period === 'yearly') {
    const originalDay = date.getDate(); const originalMonth = date.getMonth();
    date.setDate(1); date.setFullYear(date.getFullYear() + 1); date.setMonth(originalMonth);
    date.setDate(Math.min(originalDay, new Date(date.getFullYear(), originalMonth + 1, 0).getDate()));
  }
  return date.toISOString().slice(0, 10);
}

function validate(collection, data, existing = []) {
  const required = {
    products: ['name', 'type', 'salesPrice'], plans: ['name', 'price', 'billingPeriod'], customers: ['name', 'email'],
    staff: ['name', 'email', 'role'], quotations: ['customerId', 'planId'], subscriptions: ['customerId', 'planId'],
    invoices: ['subscriptionId', 'dueDate'], discounts: ['name', 'type', 'value'], payments: ['invoiceId', 'method', 'amount'], taxes: ['name', 'rate'],
  }[collection] || [];
  for (const field of required) if (data[field] === '' || data[field] === null || data[field] === undefined) throw new Error(`${field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)} is required.`);
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Enter a valid email address.');
  if (['products', 'plans', 'discounts', 'payments'].includes(collection) && Number(data[collection === 'products' ? 'salesPrice' : collection === 'plans' ? 'price' : 'value']) < 0) throw new Error('Amounts cannot be negative.');
  if (collection === 'plans') {
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(data.billingPeriod)) throw new Error('Choose a valid billing frequency.');
    if (Number(data.minQuantity) < 1) throw new Error('Minimum quantity must be at least 1.');
    if (data.startDate && data.endDate && data.endDate < data.startDate) throw new Error('Plan end date must be on or after its start date.');
  }
  if (collection === 'subscriptions' && data.startDate && data.expiryDate && data.expiryDate < data.startDate) throw new Error('Subscription expiry must be on or after its start date.');
  if (collection === 'quotations' && data.validUntil && data.validUntil < today()) throw new Error('Quotation validity must be today or later.');
  if (collection === 'products' && (Number(data.salesPrice) < 0 || Number(data.costPrice || 0) < 0)) throw new Error('Product prices cannot be negative.');
  if (collection === 'taxes' && (Number(data.rate) < 0 || Number(data.rate) > 100)) throw new Error('Tax rate must be between 0 and 100%.');
  if (collection === 'discounts') {
    if (!['fixed', 'percentage'].includes(data.type)) throw new Error('Choose a valid discount type.');
    if (Number(data.value) <= 0 || (data.type === 'percentage' && Number(data.value) > 100)) throw new Error('Enter a valid discount value.');
    if (Number(data.minPurchase || 0) < 0 || Number(data.minQuantity || 1) < 1) throw new Error('Discount minimums cannot be negative and quantity must be at least 1.');
    if (data.usageLimit !== null && data.usageLimit !== undefined && Number(data.usageLimit) < Number(data.usedCount || 0)) throw new Error('Usage limit cannot be below the number of times already used.');
    if (data.startDate && data.endDate && data.endDate < data.startDate) throw new Error('Discount end date must be on or after its start date.');
  }
  if (collection === 'payments' && Number(data.amount) <= 0) throw new Error('Payment amount must be greater than zero.');
  if (data.email && ['customers', 'staff'].includes(collection) && existing.some((item) => item.email.toLowerCase() === data.email.toLowerCase() && item.id !== data.id)) throw new Error('An account with this email already exists.');
}

function makeService(collection) {
  return {
    async getAll(filters = {}) {
      let records = await mockRepository.list(collection);
      const search = String(filters.search || '').toLowerCase().trim();
      if (search) records = records.filter((record) => Object.values(record).join(' ').toLowerCase().includes(search));
      for (const [key, value] of Object.entries(filters)) if (value && key !== 'search') records = records.filter((record) => String(record[key] ?? '') === String(value));
      return records;
    },
    getById(recordId) { return mockRepository.get(collection, recordId); },
    async create(data) {
      const all = await mockRepository.list(collection); validate(collection, data, all);
      if (['quotations', 'subscriptions'].includes(collection)) {
        const plan = await mockRepository.get('plans', data.planId);
        if (!plan || plan.status !== 'active') throw new Error('Choose an active subscription plan.');
        const effectiveStart = data.startDate || today();
        if ((plan.startDate && effectiveStart < plan.startDate) || (plan.endDate && effectiveStart > plan.endDate)) throw new Error('This plan is outside its available dates.');
      }
      if (data.email && ['customers', 'staff'].includes(collection)) {
        const otherCollection = collection === 'customers' ? 'staff' : 'customers';
        const otherRecords = await mockRepository.list(otherCollection);
        if (otherRecords.some((item) => item.email.toLowerCase() === data.email.toLowerCase())) throw new Error('This email is already used by another account.');
      }
      const normalized = { ...data };
      if (collection === 'products') normalized.updatedAt = today();
      const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
      if (collection === 'quotations') { normalized.number ||= `QT-${new Date().getFullYear()}-${suffix}`; normalized.status ||= 'draft'; normalized.lines ||= []; normalized.createdAt ||= today(); }
      if (collection === 'subscriptions') { normalized.number ||= `SUB-${new Date().getFullYear()}-${suffix}`; normalized.status ||= 'draft'; normalized.lines ||= []; normalized.nextInvoiceDate ||= normalized.startDate; }
      if (collection === 'invoices') { normalized.number ||= `INV-${new Date().getFullYear()}-${suffix}`; normalized.status ||= 'draft'; normalized.lines ||= []; normalized.amountPaid ||= 0; }
      return mockRepository.create(collection, normalized);
    },
    async update(recordId, changes) {
      const all = await mockRepository.list(collection);
      const current = all.find((item) => item.id === recordId);
      if (!current) throw new Error('Record not found.');
      validate(collection, { ...current, ...changes, id: recordId }, all);
      if (changes.email && ['customers', 'staff'].includes(collection)) {
        const otherCollection = collection === 'customers' ? 'staff' : 'customers';
        const otherRecords = await mockRepository.list(otherCollection);
        if (otherRecords.some((item) => item.email.toLowerCase() === changes.email.toLowerCase())) throw new Error('This email is already used by another account.');
      }
      return mockRepository.update(collection, recordId, collection === 'products' ? { ...changes, updatedAt: today() } : changes);
    },
    remove(recordId) { return mockRepository.remove(collection, recordId); },
  };
}

export const productService = makeService('products');
export const planService = makeService('plans');
export const customerService = makeService('customers');
export const staffService = makeService('staff');
export const quotationService = makeService('quotations');
export const subscriptionService = makeService('subscriptions');
export const invoiceService = makeService('invoices');
export const discountService = makeService('discounts');
export const paymentService = makeService('payments');
export const taxService = makeService('taxes');
export const settingsService = {
  get() { return mockRepository.get('settings', 'company'); },
  update(data) { return mockRepository.update('settings', 'company', data); },
  resetDemo() { return mockRepository.reset(); },
};

export function lineTotals(lines = [], taxes = []) {
  const subtotal = money(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0));
  const taxTotal = money(lines.reduce((sum, line) => {
    const tax = taxes.find((item) => item.id === line.taxId && item.status === 'active');
    return sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(tax?.rate || 0) / 100;
  }, 0));
  return { subtotal, taxTotal, total: money(subtotal + taxTotal) };
}

export function applicableDiscount(discount, { subtotal, quantity, productIds, date = today() }) {
  if (discount.status !== 'active' || date < (discount.startDate || '') || date > (discount.endDate || '9999-12-31')) return 0;
  if (discount.usageLimit && Number(discount.usedCount) >= Number(discount.usageLimit)) return 0;
  if (Number(subtotal) < Number(discount.minPurchase || 0) || Number(quantity) < Number(discount.minQuantity || 1)) return 0;
  if (discount.appliesTo === 'product' && discount.productIds?.length && !productIds.some((productId) => discount.productIds.includes(productId))) return 0;
  return money(discount.type === 'percentage' ? subtotal * Number(discount.value) / 100 : Math.min(subtotal, Number(discount.value)));
}

export async function convertQuotation(quotationId) {
  const quotation = await quotationService.getById(quotationId);
  if (!quotation || quotation.status !== 'accepted') throw new Error('Only accepted quotations can be converted.');
  if (quotation.validUntil && quotation.validUntil < today()) throw new Error('This quotation has expired.');
  const sub = await subscriptionService.create({
    customerId: quotation.customerId, planId: quotation.planId, quotationId: quotation.id,
    startDate: today(), expiryDate: '', nextInvoiceDate: today(), paymentTerms: 'Due on receipt',
    status: 'confirmed', lines: quotation.lines,
  });
  await quotationService.update(quotation.id, { convertedSubscriptionId: sub.id });
  return sub;
}

const transitions = {
  draft: ['quotation', 'confirmed', 'closed'], quotation: ['confirmed', 'closed'], confirmed: ['active', 'closed'],
  active: ['paused', 'closed'], paused: ['active', 'closed'], closed: [],
};
export async function changeSubscriptionStatus(subscriptionId, nextStatus) {
  const sub = await subscriptionService.getById(subscriptionId);
  if (!sub) throw new Error('Subscription not found.');
  if (!transitions[sub.status]?.includes(nextStatus)) throw new Error(`Cannot move a ${sub.status} subscription to ${nextStatus}.`);
  const plan = await planService.getById(sub.planId);
  if (nextStatus === 'paused' && !plan?.pausable) throw new Error('This plan does not allow pausing.');
  if (nextStatus === 'closed' && !plan?.closable) throw new Error('This plan does not allow early closure.');
  return subscriptionService.update(subscriptionId, { status: nextStatus });
}

export async function renewSubscription(subscriptionId) {
  const sub = await subscriptionService.getById(subscriptionId);
  const plan = sub && await planService.getById(sub.planId);
  if (!sub || sub.status !== 'closed') throw new Error('Only closed subscriptions can be renewed.');
  if (!plan?.renewable) throw new Error('This plan does not allow renewal.');
  const startDate = sub.expiryDate && sub.expiryDate > today() ? sub.expiryDate : today();
  const expiryDate = addBillingPeriod(startDate, plan.billingPeriod);
  return subscriptionService.create({ ...sub, id: undefined, number: undefined, createdAt: today(), renewedFromId: sub.id, startDate, expiryDate, nextInvoiceDate: startDate, status: 'active' });
}

export async function generateInvoice(subscriptionId, periodStart = today()) {
  const subscription = await subscriptionService.getById(subscriptionId);
  if (!subscription) throw new Error('Subscription not found.');
  if (!['active', 'confirmed'].includes(subscription.status)) throw new Error('Only confirmed or active subscriptions can be billed.');
  const plan = await planService.getById(subscription.planId);
  if (subscription.expiryDate && subscription.expiryDate < periodStart) {
    if (plan?.autoClose && subscription.status !== 'closed') await subscriptionService.update(subscription.id, { status: 'closed' });
    throw new Error(plan?.autoClose ? 'This subscription ended and was automatically closed.' : 'This subscription has expired and cannot be billed.');
  }
  const invoices = await invoiceService.getAll();
  if (invoices.some((invoice) => invoice.subscriptionId === subscriptionId && invoice.billingPeriodStart === periodStart)) throw new Error('An invoice already exists for this subscription and billing period.');
  const [taxes, discounts] = await Promise.all([taxService.getAll(), discountService.getAll()]);
  const lines = subscription.lines.map((line) => ({ ...line, amount: money(Number(line.quantity) * Number(line.unitPrice)) }));
  const { subtotal, taxTotal } = lineTotals(lines, taxes);
  const quantity = lines.reduce((n, line) => n + Number(line.quantity), 0);
  const productIds = lines.map((line) => line.productId);
  const appliedDiscounts = discounts.map((discount) => ({ discount, amount: applicableDiscount(discount, { subtotal, quantity, productIds }) })).filter((item) => item.amount > 0);
  const discountTotal = money(Math.min(subtotal + taxTotal, appliedDiscounts.reduce((sum, item) => sum + item.amount, 0)));
  const total = Math.max(0, money(subtotal + taxTotal - discountTotal));
  const due = new Date(`${periodStart}T12:00:00`); due.setDate(due.getDate() + 14);
  const customerId = subscription.customerId;
  const invoice = await invoiceService.create({ subscriptionId, customerId, billingPeriodStart: periodStart, invoiceDate: today(), dueDate: due.toISOString().slice(0, 10), status: 'draft', lines, subtotal, taxTotal, discountTotal, total, amountPaid: 0 });
  await Promise.all(appliedDiscounts.map(async ({ discount }) => {
    const usedCount = Number(discount.usedCount || 0) + 1;
    await discountService.update(discount.id, { usedCount, status: discount.usageLimit && usedCount >= Number(discount.usageLimit) ? 'inactive' : discount.status });
  }));
  await subscriptionService.update(subscriptionId, { nextInvoiceDate: addBillingPeriod(periodStart, plan.billingPeriod) });
  return invoice;
}

export async function generateDueInvoices() {
  const dueSubscriptions = (await subscriptionService.getAll()).filter((subscription) =>
    ['active', 'confirmed'].includes(subscription.status) && subscription.nextInvoiceDate && subscription.nextInvoiceDate <= today(),
  );
  const results = [];
  const failures = [];
  for (const subscription of dueSubscriptions) {
    try { results.push(await generateInvoice(subscription.id, subscription.nextInvoiceDate)); }
    catch (error) { failures.push({ subscription: subscription.number, error: error.message }); }
  }
  return { generated: results, failures };
}

export async function recordPayment(data) {
  const invoice = await invoiceService.getById(data.invoiceId);
  if (!invoice || invoice.status === 'cancelled') throw new Error('Select an eligible invoice.');
  const outstanding = money(Number(invoice.total) - Number(invoice.amountPaid || 0));
  if (Number(data.amount) <= 0 || Number(data.amount) > outstanding) throw new Error(`Payment must be greater than zero and no more than the outstanding ₹${outstanding.toFixed(2)}.`);
  const payment = await paymentService.create({ ...data, customerId: invoice.customerId, paymentDate: data.paymentDate || today() });
  const paid = money(Number(invoice.amountPaid || 0) + Number(data.amount));
  await invoiceService.update(invoice.id, { amountPaid: paid, status: paid >= Number(invoice.total) ? 'paid' : 'confirmed' });
  return payment;
}

export async function getReportData() {
  const [customers, products, plans, subscriptions, invoices, payments, quotations] = await Promise.all([
    customerService.getAll(), productService.getAll(), planService.getAll(), subscriptionService.getAll(), invoiceService.getAll(), paymentService.getAll(), quotationService.getAll(),
  ]);
  const activeInvoices = invoices.filter((invoice) => invoice.status !== 'cancelled');
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstanding = activeInvoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.amountPaid || 0)), 0);
  return { customers, products, plans, subscriptions, invoices, payments, quotations, paid: money(paid), outstanding: money(outstanding), overdue: activeInvoices.filter((invoice) => invoice.dueDate < today() && invoice.status !== 'paid').length };
}

export async function seedStaff(name, email, role = 'Sales representative') {
  return staffService.create({ name: name.trim(), email: email.trim().toLowerCase(), role, status: 'invited', registrationStatus: 'invited', phone: '' });
}
