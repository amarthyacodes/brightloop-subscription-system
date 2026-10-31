import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, runTransaction } from 'firebase/firestore';
import { firestore } from '../firestore.js';

let dataUser = null;
export function configureDataUser(user) { dataUser = user; }
const getCollection = (name) => collection(firestore, name);
const row = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
async function readCollection(name, filters = []) {
  const clauses = filters.map(([key, value]) => where(key, '==', value));
  const result = await getDocs(query(getCollection(name), ...clauses));
  return result.docs.map(row);
}
async function readWorkspace() {
  const admin = dataUser?.role === 'ADMIN';
  const staff = dataUser?.role === 'STAFF';
  const collections = ['products', 'plans', 'users', 'quotations', 'subscriptions', 'invoices', 'payments', 'notifications'];
  if (admin || staff) collections.push('taxes');
  if (admin) collections.push('discounts', 'settings', 'staffInvitations');
  const values = await Promise.all(collections.map(async (name) => {
    if (name === 'users') {
      if (dataUser?.role === 'CUSTOMER' || dataUser?.role === 'STAFF') {
        const profile = await getDoc(doc(firestore, 'users', dataUser.uid));
        const ownProfile = profile.exists() ? [{ id: profile.id, ...profile.data() }] : [];
        return dataUser.role === 'STAFF' ? [...await readCollection('users', [['role', 'customer']]), ...ownProfile] : ownProfile;
      }
      return [await readCollection('users', [['role', 'customer']]), await readCollection('users', [['role', 'staff']])].then((groups) => groups.flat());
    }
    if (!admin && !staff && ['quotations', 'subscriptions', 'invoices', 'payments'].includes(name)) return readCollection(name, [['customerId', dataUser.uid]]);
    if (name === 'notifications') return readCollection(name, [['userId', dataUser.uid]]);
    return readCollection(name);
  }));
  const data = Object.fromEntries(collections.map((name, index) => [name, values[index]]));
  const profiles = data.users || [];
  const invitations = data.staffInvitations || [];
  return {
    ...data,
    customers: profiles.filter((profile) => profile.role === 'customer').map((profile) => ({ ...profile, status: profile.accountStatus || 'active' })),
    staff: [...profiles.filter((profile) => profile.role === 'staff').map(profile => ({ ...profile, status: profile.accountStatus || 'active', registrationStatus: 'registered' })), ...invitations.map((invite) => ({ ...invite, registrationStatus: 'invited', status: 'invited' }))],
    discounts: data.discounts || [], taxes: data.taxes || [], products: data.products || [], plans: data.plans || [],
    quotations: data.quotations || [], subscriptions: data.subscriptions || [], invoices: data.invoices || [], payments: data.payments || [],
    notifications: data.notifications || [], settings: data.settings || [],
  };
}
export { readWorkspace as loadWorkspaceData };

export const COLLECTIONS = {
  products: 'products', plans: 'plans', customers: 'customers', staff: 'staff', quotations: 'quotations',
  subscriptions: 'subscriptions', invoices: 'invoices', discounts: 'discounts', payments: 'payments', taxes: 'taxes', notifications: 'notifications',
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
      const target = collection === 'customers' || collection === 'staff' ? 'users' : collection;
      let records;
      if (collection === 'customers') records = (await readCollection('users', [['role', 'customer']])).map(profile => ({ ...profile, status: profile.accountStatus || 'active' }));
      else if (collection === 'staff') records = [...await readCollection('users', [['role', 'staff']]).then(rows => rows.map(profile => ({ ...profile, status: profile.accountStatus || 'active', registrationStatus: 'registered' }))), ...await readCollection('staffInvitations').then(rows => rows.filter(invite => invite.status === 'pending' && (!invite.expiresAt || invite.expiresAt > new Date().toISOString())).map(invite => ({ ...invite, status: 'invited', registrationStatus: 'invited' })))];
      else if (dataUser?.role === 'CUSTOMER' && ['quotations', 'subscriptions', 'invoices', 'payments'].includes(collection)) records = await readCollection(target, [['customerId', dataUser.uid]]);
      else records = await readCollection(target);
      const search = String(filters.search || '').toLowerCase().trim();
      if (search) records = records.filter((record) => Object.values(record).join(' ').toLowerCase().includes(search));
      for (const [key, value] of Object.entries(filters)) if (value && key !== 'search') records = records.filter((record) => String(record[key] ?? '') === String(value));
      return records;
    },
    async getById(recordId) { const result = await getDoc(doc(firestore, collection === 'customers' || collection === 'staff' ? 'users' : collection, recordId)); return result.exists() ? row(result) : null; },
    async create(data) {
      const all = await this.getAll(); validate(collection, data, all);
      if (['quotations', 'subscriptions'].includes(collection)) {
        const plan = await planService.getById(data.planId);
        if (!plan || plan.status !== 'active') throw new Error('Choose an active subscription plan.');
        const effectiveStart = data.startDate || today();
        if ((plan.startDate && effectiveStart < plan.startDate) || (plan.endDate && effectiveStart > plan.endDate)) throw new Error('This plan is outside its available dates.');
      }
      const normalized = { ...data };
      if (collection === 'products') normalized.updatedAt = today();
      const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
      if (collection === 'quotations') { normalized.number ||= `QT-${new Date().getFullYear()}-${suffix}`; normalized.status ||= 'draft'; normalized.lines ||= []; normalized.createdAt ||= today(); }
      if (collection === 'subscriptions') { normalized.number ||= `SUB-${new Date().getFullYear()}-${suffix}`; normalized.status ||= 'draft'; normalized.lines ||= []; normalized.nextInvoiceDate ||= normalized.startDate; }
      if (collection === 'invoices') { normalized.number ||= `INV-${new Date().getFullYear()}-${suffix}`; normalized.status ||= 'draft'; normalized.lines ||= []; normalized.amountPaid ||= 0; }
      if (collection === 'customers' || collection === 'staff') throw new Error('User profiles must be created through Firebase Authentication and the secure invitation flow.');
      const requestedId = normalized.id;
      delete normalized.id;
      const ref = requestedId ? doc(firestore, collection, requestedId) : doc(getCollection(collection));
      normalized.createdAt ||= today(); normalized.updatedAt = today();
      if (collection === 'invoices' && requestedId) {
        await runTransaction(firestore, async (transaction) => {
          if ((await transaction.get(ref)).exists()) throw new Error('An invoice already exists for this subscription and billing period.');
          transaction.set(ref, normalized);
        });
      } else await setDoc(ref, normalized);
      return { id: ref.id, ...normalized };
    },
    async update(recordId, changes) {
      const all = await this.getAll();
      const current = all.find((item) => item.id === recordId);
      if (!current) throw new Error('Record not found.');
      validate(collection, { ...current, ...changes, id: recordId }, all);
      if (collection === 'customers' || collection === 'staff') {
        if (collection === 'staff' && changes.status && current.accountId) {
          const response = await fetch(`/api/users/staff/${encodeURIComponent(current.accountId)}/status`, {
            method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: changes.status === 'active' }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Unable to update this staff account.');
          return { ...current, status: changes.status };
        }
        const allowed = collection === 'customers' ? { name: changes.name, phone: changes.phone, address: changes.address, accountStatus: changes.status } : { name: changes.name, phone: changes.phone, accountStatus: changes.status };
        const updates = Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined));
        await updateDoc(doc(firestore, 'users', recordId), { ...updates, updatedAt: today() });
        return { ...current, ...updates };
      }
      const updates = collection === 'products' ? { ...changes, updatedAt: today() } : changes;
      await updateDoc(doc(firestore, collection, recordId), updates);
      return { ...current, ...updates };
    },
    async remove(recordId) {
      if (['customers', 'staff'].includes(collection)) throw new Error('User accounts cannot be deleted from this screen.');
      if (collection === 'products') {
        const [plans, quotations, subscriptions, invoices] = await Promise.all([planService.getAll(), quotationService.getAll(), subscriptionService.getAll(), invoiceService.getAll()]);
        const referenced = plans.some((item) => item.productIds?.includes(recordId)) || [quotations, subscriptions, invoices].some((items) => items.some((item) => item.lines?.some((line) => line.productId === recordId)));
        if (referenced) throw new Error('This product is used by a plan or billing record and cannot be deleted. Deactivate it instead.');
      }
      if (collection === 'plans') {
        const [quotations, subscriptions] = await Promise.all([quotationService.getAll(), subscriptionService.getAll()]);
        if ([quotations, subscriptions].some((items) => items.some((item) => item.planId === recordId))) throw new Error('This plan is used by a quotation or subscription and cannot be deleted. Deactivate it instead.');
      }
      await deleteDoc(doc(firestore, collection, recordId)); return true;
    },
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
export const notificationService = {
  async getAll() { return dataUser?.uid ? readCollection('notifications', [['userId', dataUser.uid]]) : []; },
  async markRead(id) { await updateDoc(doc(firestore, 'notifications', id), { read: true, readAt: new Date().toISOString() }); },
};
export const profileService = {
  async update(changes) {
    if (!dataUser?.uid || !['CUSTOMER', 'STAFF'].includes(dataUser.role)) throw new Error('Your profile cannot be changed from this account.');
    const updates = { updatedAt: today() };
    for (const key of ['name', 'phone', 'address']) if (changes[key] !== undefined) updates[key] = String(changes[key]).trim();
    if (!updates.name) throw new Error('Your name is required.');
    await updateDoc(doc(firestore, 'users', dataUser.uid), updates);
    return updates;
  },
};
export const settingsService = {
  async get() { const result = await getDoc(doc(firestore, 'settings', 'company')); return result.exists() ? row(result) : null; },
  async update(data) { await setDoc(doc(firestore, 'settings', 'company'), data, { merge: true }); return data; },
  async resetDemo() { throw new Error('Demo data reset is unavailable in the live Firebase workspace.'); },
};

export function lineTotals(lines = [], taxes = []) {
  const subtotal = money(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0));
  const taxTotal = money(lines.reduce((sum, line) => {
    const tax = taxes.find((item) => item.id === line.taxId && item.status === 'active' && (!item.productIds?.length || item.productIds.includes(line.productId)));
    return sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(tax?.rate || 0) / 100;
  }, 0));
  return { subtotal, taxTotal, total: money(subtotal + taxTotal) };
}

export function applicableDiscount(discount, { subtotal, quantity, productIds, date = today() }) {
  if (discount.status !== 'active' || date < (discount.startDate || '') || date > (discount.endDate || '9999-12-31')) return 0;
  if (discount.usageLimit !== null && discount.usageLimit !== undefined && Number(discount.usedCount) >= Number(discount.usageLimit)) return 0;
  if (Number(subtotal) < Number(discount.minPurchase || 0) || Number(quantity) < Number(discount.minQuantity || 1)) return 0;
  if (discount.appliesTo === 'product' && discount.productIds?.length && !productIds.some((productId) => discount.productIds.includes(productId))) return 0;
  return money(discount.type === 'percentage' ? subtotal * Number(discount.value) / 100 : Math.min(subtotal, Number(discount.value)));
}

export async function convertQuotation(quotationId) {
  const quotationRef = doc(firestore, 'quotations', quotationId);
  const newSubscriptionRef = doc(getCollection('subscriptions'));
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  let subscription;
  await runTransaction(firestore, async (transaction) => {
    const quotationSnapshot = await transaction.get(quotationRef);
    if (!quotationSnapshot.exists() || quotationSnapshot.get('status') !== 'accepted') throw new Error('Only accepted quotations can be converted.');
    if (quotationSnapshot.get('convertedSubscriptionId')) throw new Error('This quotation has already been converted.');
    const quotation = row(quotationSnapshot);
    const planSnapshot = await transaction.get(doc(firestore, 'plans', quotation.planId));
    if (!planSnapshot.exists() || planSnapshot.get('status') !== 'active') throw new Error('The selected plan is no longer active.');
    if (quotation.validUntil && quotation.validUntil < today()) throw new Error('This quotation has expired.');
    subscription = {
      number: `SUB-${new Date().getFullYear()}-${suffix}`, customerId: quotation.customerId, planId: quotation.planId,
      quotationId, startDate: today(), expiryDate: '', nextInvoiceDate: today(), paymentTerms: 'Due on receipt',
      status: 'confirmed', lines: quotation.lines || [], createdAt: today(), updatedAt: today(),
    };
    transaction.set(newSubscriptionRef, subscription);
    transaction.update(quotationRef, { convertedSubscriptionId: newSubscriptionRef.id, updatedAt: today() });
  });
  return { id: newSubscriptionRef.id, ...subscription };
}

const transitions = {
  draft: ['quotation', 'confirmed', 'closed'], quotation: ['confirmed', 'closed'], confirmed: ['active', 'closed'],
  active: ['paused', 'closed'], paused: ['active', 'closed'], closed: [],
};
export async function changeSubscriptionStatus(subscriptionId, nextStatus) {
  const subscriptionRef = doc(firestore, 'subscriptions', subscriptionId);
  let subscription;
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(subscriptionRef);
    if (!snapshot.exists()) throw new Error('Subscription not found.');
    const current = row(snapshot);
    const planSnapshot = await transaction.get(doc(firestore, 'plans', current.planId));
    const plan = planSnapshot.exists() ? planSnapshot.data() : null;
    if (!transitions[current.status]?.includes(nextStatus)) throw new Error(`Cannot move a ${current.status} subscription to ${nextStatus}.`);
    if (nextStatus === 'paused' && !plan?.pausable) throw new Error('This plan does not allow pausing.');
    if (nextStatus === 'closed' && !plan?.closable) throw new Error('This plan does not allow early closure.');
    transaction.update(subscriptionRef, { status: nextStatus, updatedAt: today() });
    subscription = { ...current, status: nextStatus, updatedAt: today() };
  });
  return subscription;
}

export async function renewSubscription(subscriptionId) {
  const originalRef = doc(firestore, 'subscriptions', subscriptionId);
  let renewal;
  await runTransaction(firestore, async (transaction) => {
    const originalSnapshot = await transaction.get(originalRef);
    if (!originalSnapshot.exists() || originalSnapshot.get('status') !== 'closed') throw new Error('Only closed subscriptions can be renewed.');
    const original = row(originalSnapshot);
    const planSnapshot = await transaction.get(doc(firestore, 'plans', original.planId));
    const plan = planSnapshot.exists() ? planSnapshot.data() : null;
    if (!plan?.renewable) throw new Error('This plan does not allow renewal.');
    const startDate = original.expiryDate && original.expiryDate > today() ? original.expiryDate : today();
    const id = `${subscriptionId}_renewal_${startDate}`;
    const renewalRef = doc(firestore, 'subscriptions', id);
    if ((await transaction.get(renewalRef)).exists()) throw new Error('A renewal has already been created for this date.');
    const expiryDate = addBillingPeriod(startDate, plan.billingPeriod);
    renewal = {
      number: `SUB-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      customerId: original.customerId, planId: original.planId, quotationId: original.quotationId || '',
      renewedFromId: original.id, startDate, expiryDate, nextInvoiceDate: startDate,
      paymentTerms: original.paymentTerms || 'Due on receipt', status: 'active', lines: original.lines || [],
      createdAt: today(), updatedAt: today(),
    };
    transaction.set(renewalRef, renewal);
    renewal = { id, ...renewal };
  });
  return renewal;
}

export async function generateInvoice(subscriptionId, periodStart) {
  const subscription = await subscriptionService.getById(subscriptionId);
  if (!subscription) throw new Error('Subscription not found.');
  const billingPeriod = periodStart || subscription.nextInvoiceDate || today();
  const response = await fetch('/api/billing/invoices/generate', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriptionId, periodStart: billingPeriod }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to generate this invoice.');
  return result.invoice;
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
  const invoiceRef = doc(firestore, 'invoices', data.invoiceId);
  const paymentRef = doc(getCollection('payments'));
  const amount = money(Number(data.amount));
  let payment;
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(invoiceRef);
    if (!snapshot.exists() || snapshot.get('status') === 'cancelled') throw new Error('Select an eligible invoice.');
    const invoice = row(snapshot);
    const outstanding = money(Number(invoice.total) - Number(invoice.amountPaid || 0));
    if (amount <= 0 || amount > outstanding) throw new Error(`Payment must be greater than zero and no more than the outstanding ₹${outstanding.toFixed(2)}.`);
    const amountPaid = money(Number(invoice.amountPaid || 0) + amount);
    payment = { ...data, amount, customerId: invoice.customerId, paymentDate: data.paymentDate || today(), createdAt: today() };
    transaction.set(paymentRef, payment);
    transaction.update(invoiceRef, { amountPaid, lastPaymentId: paymentRef.id, status: amountPaid >= Number(invoice.total) ? 'paid' : 'confirmed', updatedAt: today() });
  });
  return { id: paymentRef.id, ...payment };
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

export async function createStaffAccount({ name, email, phone = '', jobTitle = '' }) {
  const response = await fetch('/api/users/staff/accounts', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), jobTitle }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to create the worker account.');
  return result;
}
