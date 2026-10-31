const STORAGE_KEY = 'brightloop-mock-db-v1';
const today = new Date().toISOString().slice(0, 10);
const daysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const initialData = {
  customers: [
    { id: 'cus-1001', name: 'Aarav Mehta', email: 'aarav@northstar.in', phone: '+91 98765 43021', address: 'Mumbai, Maharashtra', status: 'active', createdAt: daysFromNow(-140) },
    { id: 'cus-1002', name: 'Diya Shah', email: 'diya@verdant.co', phone: '+91 98210 64832', address: 'Pune, Maharashtra', status: 'active', createdAt: daysFromNow(-95) },
    { id: 'cus-1003', name: 'Kabir Rao', email: 'kabir@orbitworks.io', phone: '+91 99001 22654', address: 'Bengaluru, Karnataka', status: 'active', createdAt: daysFromNow(-60) },
    { id: 'cus-1004', name: 'Mira Nair', email: 'mira@coastline.in', phone: '+91 98470 11442', address: 'Kochi, Kerala', status: 'inactive', createdAt: daysFromNow(-26) },
  ],
  staff: [
    { id: 'stf-201', name: 'Rohan Kulkarni', email: 'rohan@brightloop.example', phone: '+91 98100 43120', role: 'Sales representative', status: 'active', registrationStatus: 'registered', createdAt: daysFromNow(-210) },
    { id: 'stf-202', name: 'Anika Bose', email: 'anika@brightloop.example', phone: '+91 98990 38770', role: 'Billing specialist', status: 'active', registrationStatus: 'registered', createdAt: daysFromNow(-78) },
    { id: 'stf-203', name: 'Dev Patel', email: 'dev@brightloop.example', phone: '', role: 'Support specialist', status: 'invited', registrationStatus: 'invited', createdAt: daysFromNow(-2) },
  ],
  products: [
    { id: 'prd-301', name: 'Brightloop CRM', type: 'Software', description: 'Customer relationships, sales pipeline and team workflows.', salesPrice: 2499, costPrice: 420, variants: [{ id: 'var-301', attribute: 'Edition', value: 'Enterprise', extraPrice: 560 }], status: 'active', createdAt: daysFromNow(-220), updatedAt: today },
    { id: 'prd-302', name: 'Brightloop Analytics', type: 'Add-on', description: 'Live dashboards and revenue insights.', salesPrice: 1299, costPrice: 230, variants: [], status: 'active', createdAt: daysFromNow(-160), updatedAt: today },
    { id: 'prd-303', name: 'Priority Support', type: 'Service', description: 'Priority response and a dedicated support channel.', salesPrice: 799, costPrice: 180, variants: [], status: 'active', createdAt: daysFromNow(-120), updatedAt: today },
    { id: 'prd-304', name: 'Onboarding', type: 'Service', description: 'Guided setup and team enablement.', salesPrice: 4999, costPrice: 1600, variants: [], status: 'inactive', createdAt: daysFromNow(-90), updatedAt: today },
  ],
  taxes: [
    { id: 'tax-401', name: 'GST', rate: 18, description: 'Standard GST', productIds: ['prd-301', 'prd-302', 'prd-303'], status: 'active' },
    { id: 'tax-402', name: 'Zero-rated', rate: 0, description: 'Zero-rated supply', productIds: [], status: 'active' },
  ],
  plans: [
    { id: 'pln-501', name: 'Growth Monthly', description: 'Flexible monthly plan for growing teams.', price: 2499, billingPeriod: 'monthly', minQuantity: 1, startDate: daysFromNow(-180), endDate: '', productIds: ['prd-301', 'prd-302'], autoClose: false, closable: true, pausable: true, renewable: true, status: 'active' },
    { id: 'pln-502', name: 'Scale Annual', description: 'Annual subscription with priority support.', price: 26990, billingPeriod: 'yearly', minQuantity: 5, startDate: daysFromNow(-180), endDate: '', productIds: ['prd-301', 'prd-302', 'prd-303'], autoClose: false, closable: true, pausable: true, renewable: true, status: 'active' },
    { id: 'pln-503', name: 'Starter Weekly', description: 'Short-term evaluation plan.', price: 699, billingPeriod: 'weekly', minQuantity: 1, startDate: daysFromNow(-90), endDate: daysFromNow(90), productIds: ['prd-301'], autoClose: true, closable: true, pausable: false, renewable: false, status: 'inactive' },
  ],
  quotations: [
    { id: 'quo-601', number: 'QT-2026-014', customerId: 'cus-1003', salesRepId: 'stf-201', planId: 'pln-502', createdAt: daysFromNow(-4), validUntil: daysFromNow(10), status: 'sent', lines: [{ productId: 'prd-301', quantity: 8, unitPrice: 2499, taxId: 'tax-401' }, { productId: 'prd-303', quantity: 1, unitPrice: 799, taxId: 'tax-401' }] },
    { id: 'quo-602', number: 'QT-2026-013', customerId: 'cus-1002', salesRepId: 'stf-201', planId: 'pln-501', createdAt: daysFromNow(-16), validUntil: daysFromNow(-2), status: 'expired', lines: [{ productId: 'prd-301', quantity: 2, unitPrice: 2499, taxId: 'tax-401' }] },
  ],
  subscriptions: [
    { id: 'sub-701', number: 'SUB-2026-041', customerId: 'cus-1001', planId: 'pln-501', quotationId: '', startDate: daysFromNow(-80), expiryDate: daysFromNow(10), nextInvoiceDate: daysFromNow(2), paymentTerms: 'Due on receipt', status: 'active', lines: [{ productId: 'prd-301', quantity: 3, unitPrice: 2499, taxId: 'tax-401' }, { productId: 'prd-302', quantity: 1, unitPrice: 1299, taxId: 'tax-401' }] },
    { id: 'sub-702', number: 'SUB-2026-040', customerId: 'cus-1002', planId: 'pln-502', quotationId: '', startDate: daysFromNow(-42), expiryDate: daysFromNow(323), nextInvoiceDate: daysFromNow(18), paymentTerms: 'Net 15', status: 'active', lines: [{ productId: 'prd-301', quantity: 6, unitPrice: 2499, taxId: 'tax-401' }] },
    { id: 'sub-703', number: 'SUB-2026-039', customerId: 'cus-1003', planId: 'pln-501', quotationId: 'quo-601', startDate: daysFromNow(-8), expiryDate: daysFromNow(357), nextInvoiceDate: daysFromNow(22), paymentTerms: 'Net 30', status: 'confirmed', lines: [{ productId: 'prd-301', quantity: 8, unitPrice: 2499, taxId: 'tax-401' }] },
    { id: 'sub-704', number: 'SUB-2026-036', customerId: 'cus-1004', planId: 'pln-501', quotationId: '', startDate: daysFromNow(-130), expiryDate: daysFromNow(-40), nextInvoiceDate: '', paymentTerms: 'Net 15', status: 'closed', lines: [{ productId: 'prd-301', quantity: 1, unitPrice: 2499, taxId: 'tax-401' }] },
  ],
  invoices: [
    { id: 'inv-801', number: 'INV-2026-088', subscriptionId: 'sub-701', customerId: 'cus-1001', billingPeriodStart: daysFromNow(-28), invoiceDate: daysFromNow(-28), dueDate: daysFromNow(-13), status: 'paid', subtotal: 8796, taxTotal: 1583.28, discountTotal: 0, total: 10379.28, amountPaid: 10379.28, lines: [{ productId: 'prd-301', quantity: 3, unitPrice: 2499, taxId: 'tax-401', amount: 7497 }, { productId: 'prd-302', quantity: 1, unitPrice: 1299, taxId: 'tax-401', amount: 1299 }] },
    { id: 'inv-802', number: 'INV-2026-087', subscriptionId: 'sub-702', customerId: 'cus-1002', billingPeriodStart: daysFromNow(-22), invoiceDate: daysFromNow(-22), dueDate: daysFromNow(-7), status: 'confirmed', subtotal: 14994, taxTotal: 2698.92, discountTotal: 0, total: 17692.92, amountPaid: 8000, lines: [{ productId: 'prd-301', quantity: 6, unitPrice: 2499, taxId: 'tax-401', amount: 14994 }] },
    { id: 'inv-803', number: 'INV-2026-089', subscriptionId: 'sub-701', customerId: 'cus-1001', billingPeriodStart: daysFromNow(2), invoiceDate: today, dueDate: daysFromNow(16), status: 'draft', subtotal: 8796, taxTotal: 1583.28, discountTotal: 0, total: 10379.28, amountPaid: 0, lines: [{ productId: 'prd-301', quantity: 3, unitPrice: 2499, taxId: 'tax-401', amount: 7497 }, { productId: 'prd-302', quantity: 1, unitPrice: 1299, taxId: 'tax-401', amount: 1299 }] },
  ],
  payments: [
    { id: 'pay-901', invoiceId: 'inv-801', customerId: 'cus-1001', method: 'UPI', amount: 10379.28, paymentDate: daysFromNow(-14), reference: 'UPI-784190', note: 'Monthly renewal' },
    { id: 'pay-902', invoiceId: 'inv-802', customerId: 'cus-1002', method: 'Bank transfer', amount: 8000, paymentDate: daysFromNow(-6), reference: 'NEFT-993822', note: 'Part payment' },
  ],
  discounts: [
    { id: 'dsc-1001', name: 'Launch 10%', type: 'percentage', value: 10, minPurchase: 5000, minQuantity: 1, productIds: ['prd-301'], appliesTo: 'product', startDate: daysFromNow(-40), endDate: daysFromNow(45), usageLimit: 100, usedCount: 24, status: 'active' },
    { id: 'dsc-1002', name: 'Annual credit', type: 'fixed', value: 1500, minPurchase: 20000, minQuantity: 5, productIds: [], appliesTo: 'subscription', startDate: daysFromNow(-60), endDate: daysFromNow(120), usageLimit: 50, usedCount: 12, status: 'active' },
  ],
  notifications: [
    { id: 'ntf-1', title: 'Renewal coming up', detail: 'SUB-2026-041 renews in 2 days.', date: today, read: false },
    { id: 'ntf-2', title: 'Payment received', detail: '₹8,000 received from Diya Shah.', date: daysFromNow(-1), read: false },
  ],
  settings: [{ id: 'company', companyName: 'Brightloop Software', adminName: 'Brightloop Admin', adminEmail: 'admin@brightloop.example', currency: 'INR', timezone: 'Asia/Kolkata', emailNotifications: true, renewalReminders: true }],
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(initialData);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return clone(initialData);
    return Object.fromEntries(Object.entries(initialData).map(([key, fallback]) => [key, Array.isArray(parsed[key]) ? parsed[key] : clone(fallback)]));
  } catch {
    return clone(initialData);
  }
}

let state = readState();
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Continue with in-memory data if storage is blocked. */ }
}

export const mockRepository = {
  async list(collection) { return clone(state[collection] || []); },
  async get(collection, id) { return clone((state[collection] || []).find((item) => item.id === id) || null); },
  async create(collection, data) {
    if (!state[collection]) throw new Error(`Unknown data collection: ${collection}`);
    const record = { ...data, id: data.id || `${collection.slice(0, 3)}-${crypto.randomUUID()}`, createdAt: data.createdAt || new Date().toISOString().slice(0, 10) };
    state[collection] = [record, ...state[collection]]; persist(); return clone(record);
  },
  async update(collection, id, changes) {
    const index = (state[collection] || []).findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Record not found.');
    state[collection][index] = { ...state[collection][index], ...changes, id };
    persist(); return clone(state[collection][index]);
  },
  async remove(collection, id) {
    if (!state[collection]) throw new Error(`Unknown data collection: ${collection}`);
    const before = state[collection].length;
    state[collection] = state[collection].filter((item) => item.id !== id);
    if (before === state[collection].length) throw new Error('Record not found.');
    persist(); return true;
  },
  async reset() { state = clone(initialData); persist(); return this.listAll(); },
  async listAll() { return clone(state); },
};

persist();
