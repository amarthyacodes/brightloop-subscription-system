import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import {
  COLLECTIONS, changeSubscriptionStatus, convertQuotation, configureDataUser, loadWorkspaceData, customerService, discountService,
  generateDueInvoices, generateInvoice, sendInvoiceEmail, invoiceService, lineTotals, paymentService, planService,
  productService, profileService, quotationService, recordPayment, renewSubscription, createStaffAccount, settingsService,
  staffService, subscriptionService, taxService, notificationService,
} from './data/services.js';
import './App.css';

const NAV = [
  ['overview', 'Dashboard', 'grid'], ['products', 'Products', 'box'], ['plans', 'Subscription Plans', 'layers'],
  ['customers', 'Customers', 'users'], ['staff', 'Worker Management', 'users'], ['quotations', 'Quotations', 'file'],
  ['subscriptions', 'Subscriptions', 'credit'], ['invoices', 'Invoices', 'file'], ['discounts', 'Discounts', 'tag'],
  ['payments', 'Payments', 'wallet'], ['notifications', 'Notifications', 'bell'], ['taxes', 'Tax Configuration', 'percent'], ['reports', 'Reports & Analytics', 'chart'], ['settings', 'Settings', 'settings'], ['profile', 'My Profile', 'user'],
];
const SERVICE = { products: productService, plans: planService, customers: customerService, staff: staffService, quotations: quotationService, subscriptions: subscriptionService, invoices: invoiceService, discounts: discountService, payments: paymentService, taxes: taxService, notifications: notificationService };
const PAGE_TITLE = Object.fromEntries(NAV.map(([key, title]) => [key, title]));
const FIELDS = {
  products: [
    ['name', 'Product name', 'text', true], ['type', 'Product type', 'select', true, ['Software', 'Add-on', 'Service', 'Other']], ['description', 'Description / notes', 'textarea'],
    ['salesPrice', 'Sales price (₹)', 'number', true], ['costPrice', 'Cost price (₹)', 'number'], ['status', 'Status', 'select', true, ['active', 'inactive']], ['variantsText', 'Variants (one per line: Attribute:Value:Extra price)', 'textarea'],
  ],
  plans: [
    ['name', 'Plan name', 'text', true], ['description', 'Description', 'textarea'], ['price', 'Recurring plan price (₹)', 'number', true], ['billingPeriod', 'Billing frequency', 'select', true, ['daily', 'weekly', 'monthly', 'yearly']],
    ['minQuantity', 'Minimum quantity', 'number', true], ['startDate', 'Available from', 'date'], ['endDate', 'Available until', 'date'], ['productIds', 'Products included in this plan', 'multi-relation', true, 'products'],
    ['autoClose', 'Automatically close at end', 'checkbox'], ['closable', 'Allow early closure', 'checkbox'], ['pausable', 'Allow pausing', 'checkbox'], ['renewable', 'Allow renewal', 'checkbox'], ['status', 'Status', 'select', true, ['active', 'inactive']],
  ],
  customers: [['name', 'Full name', 'text', true], ['email', 'Email', 'email', true], ['phone', 'Phone', 'tel'], ['address', 'Address', 'text'], ['status', 'Status', 'select', true, ['active', 'inactive']]],
  staff: [['name', 'Full name', 'text', true], ['email', 'Email', 'email', true], ['phone', 'Phone (optional)', 'tel'], ['jobTitle', 'Assigned role', 'select', true, ['Sales representative', 'Billing specialist', 'Support specialist']]],
  quotations: [['customerId', 'Customer', 'relation', true, 'customers'], ['planId', 'Plan', 'relation', true, 'plans'], ['salesRepId', 'Sales representative', 'relation', false, 'staff'], ['validUntil', 'Valid until', 'date', true]],
  subscriptions: [['customerId', 'Customer', 'relation', true, 'customers'], ['planId', 'Plan', 'relation', true, 'plans'], ['startDate', 'Start date', 'date', true], ['expiryDate', 'Expiry date', 'date'], ['paymentTerms', 'Payment terms', 'select', false, ['Due on receipt', 'Net 15', 'Net 30']]],
  discounts: [['name', 'Discount name', 'text', true], ['type', 'Discount type', 'select', true, ['percentage', 'fixed']], ['value', 'Value', 'number', true], ['minPurchase', 'Minimum purchase (₹)', 'number'], ['minQuantity', 'Minimum quantity', 'number'], ['appliesTo', 'Applies to', 'select', true, ['product', 'subscription']], ['productIdsText', 'Applicable product IDs (comma separated)', 'text'], ['startDate', 'Starts on', 'date'], ['endDate', 'Expires on', 'date'], ['usageLimit', 'Usage limit (blank for unlimited)', 'number'], ['status', 'Status', 'select', true, ['active', 'inactive']]],
  taxes: [['name', 'Tax name', 'text', true], ['rate', 'Rate (%)', 'number', true], ['description', 'Description', 'text'], ['productIdsText', 'Applicable product IDs (comma separated)', 'text'], ['status', 'Status', 'select', true, ['active', 'inactive']]],
  payments: [['invoiceId', 'Invoice', 'relation', true, 'invoices'], ['method', 'Method', 'select', true, ['UPI', 'Card', 'Cash', 'Bank transfer', 'Other']], ['amount', 'Amount (₹)', 'number', true], ['paymentDate', 'Payment date', 'date', true], ['reference', 'Transaction reference', 'text'], ['note', 'Notes', 'text']],
};

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const fmtMoney = (amount) => INR.format(Number(amount || 0));
const TODAY = new Date().toISOString().slice(0, 10);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateDaysAgo = (days) => { const date = new Date(`${TODAY}T12:00:00`); date.setDate(date.getDate() - days); return date.toISOString().slice(0, 10); };
const formatDate = (date) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const quotationStatus = (quotation) => ['draft', 'sent'].includes(quotation.status) && quotation.validUntil < TODAY ? 'expired' : quotation.status;
const makeId = () => crypto.randomUUID();
function omitUndefined(value) {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, omitUndefined(item)]));
  }
  return value;
}

function Status({ value }) {
  const label = String(value || 'unknown').replaceAll('_', ' ');
  return <span className={`status-pill status-${String(value || '').toLowerCase()}`}>{label}</span>;
}

export default function Dashboard({ user, onLogout }) {
  const [page, setPage] = useState('overview');
  const [records, setRecords] = useState([]);
  const [allData, setAllData] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [range, setRange] = useState('30');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: user.name || '', phone: '', address: '' });
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    configureDataUser(user);
    loadWorkspaceData().then((data) => {
      if (!active) return;
      setAllData(data); setSettings(data.settings?.[0] || null);
      const ownProfile = [...(data.customers || []), ...(data.staff || [])].find((profile) => profile.id === user.uid);
      if (ownProfile) setProfileForm({ name: ownProfile.name || user.name || '', phone: ownProfile.phone || '', address: ownProfile.address || '' });
    }).catch((error) => setToast(error.message || 'Could not load Firebase data.'));
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (COLLECTIONS[page]) setRecords(allData?.[page] || []);
  }, [allData, page]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    let result = records;
    if (search.trim()) result = result.filter((item) => {
      const customer = allData?.customers?.find((record) => record.id === item.customerId);
      const plan = allData?.plans?.find((record) => record.id === item.planId);
      return `${JSON.stringify(item)} ${customer?.name || ''} ${customer?.email || ''} ${plan?.name || ''}`.toLowerCase().includes(search.toLowerCase());
    });
    if (statusFilter) result = result.filter((item) => String(item.status) === statusFilter);
    if (typeFilter) result = result.filter((item) => String(item.type || item.billingPeriod || item.method || '') === typeFilter);
    if (customerFilter) result = result.filter((item) => item.customerId === customerFilter);
    if (planFilter) result = result.filter((item) => item.planId === planFilter);
    if (fromDate || toDate) result = result.filter((item) => {
      const date = item.dueDate || item.nextInvoiceDate || item.startDate || item.paymentDate || item.createdAt || '';
      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    });
    return result;
  }, [records, search, statusFilter, typeFilter, customerFilter, planFilter, fromDate, toDate, allData]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activePage = NAV.find(([key]) => key === page);
  const isAdmin = ['ADMIN', 'admin'].includes(user.role);
  const isStaff = user.role === 'STAFF';
  const visibleNav = NAV.filter(([key]) => (isAdmin && key !== 'profile') || (isStaff && ['overview', 'customers', 'plans', 'quotations', 'subscriptions', 'invoices', 'payments', 'notifications', 'profile'].includes(key)) || (!isAdmin && !isStaff && ['overview', 'plans', 'subscriptions', 'invoices', 'payments', 'profile'].includes(key)));

  function changePage(nextPage) {
    setPage(nextPage); setSearch(''); setStatusFilter(''); setTypeFilter(''); setCustomerFilter(''); setPlanFilter(''); setFromDate(''); setToDate(''); setCurrentPage(1);
  }

  async function loadPage() {
    const data = await loadWorkspaceData();
    setAllData(data); setSettings(data.settings?.[0] || null);
    if (COLLECTIONS[page]) setRecords(data[page] || []);
  }
  function openCreate() {
    if (['customers', 'invoices', 'notifications'].includes(page)) return;
    if (page === 'payments') {
      const invoice = allData?.invoices?.find((item) => item.status !== 'paid' && item.status !== 'cancelled');
      setForm({ invoiceId: invoice?.id || '', method: 'UPI', amount: '', paymentDate: new Date().toISOString().slice(0, 10), reference: '', note: '' });
    } else {
      const initialForm = { status: page === 'staff' ? 'invited' : ['subscriptions', 'quotations'].includes(page) ? 'draft' : 'active', billingPeriod: 'monthly', minQuantity: 1, price: '', salesPrice: '', costPrice: 0, value: '', rate: 0, quantity: 1, startDate: new Date().toISOString().slice(0, 10), validUntil: '' };
      if (page === 'staff') initialForm.registrationStatus = 'invited';
      setForm(initialForm);
    }
    setModal({ kind: 'form', entity: page, record: null });
  }
  function openEdit(record) {
    const initial = { ...record };
    if (record.variants) initial.variantsText = record.variants.map((variant) => `${variant.attribute}:${variant.value}:${variant.extraPrice}`).join('\n');
    if (record.productIds) initial.productIdsText = record.productIds.join(', ');
    setForm(initial); setModal({ kind: 'form', entity: page, record });
  }
  async function submitForm(event) {
    event.preventDefault(); setSaving(true);
    try {
      const entity = modal.entity;
      let data = omitUndefined({ ...form });
      if (data.salesPrice !== undefined) data.salesPrice = Number(data.salesPrice || 0);
      if (data.costPrice !== undefined) data.costPrice = Number(data.costPrice || 0);
      if (data.price !== undefined) data.price = Number(data.price || 0);
      if (data.value !== undefined) data.value = Number(data.value || 0);
      if (data.rate !== undefined) data.rate = Number(data.rate || 0);
      if (data.minQuantity !== undefined) data.minQuantity = Number(data.minQuantity || 1);
      if (data.minPurchase !== undefined) data.minPurchase = Number(data.minPurchase || 0);
      if (data.usageLimit === '') data.usageLimit = null;
      if (data.usageLimit !== null && data.usageLimit !== undefined) data.usageLimit = Number(data.usageLimit);
      if (data.variantsText !== undefined) data.variants = data.variantsText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [attribute, value, extraPrice] = line.split(':');
        if (!attribute || !value || !Number.isFinite(Number(extraPrice)) || Number(extraPrice) < 0) throw new Error('Variants must use Attribute:Value:Extra price format with a nonnegative price.');
        return { id: makeId(), attribute: attribute.trim(), value: value.trim(), extraPrice: Number(extraPrice) };
      });
      if (data.productIdsText !== undefined) data.productIds = data.productIdsText.split(',').map((item) => item.trim()).filter(Boolean);
      delete data.variantsText; delete data.productIdsText;
      if (['quotations', 'subscriptions'].includes(entity)) {
        data.customerId ||= allData.customers[0]?.id;
        data.planId ||= allData.plans[0]?.id;
        const plan = await planService.getById(data.planId);
        const selectedLines = Array.isArray(data.lines)
          ? data.lines.filter((line) => line.included !== false)
          : (plan?.productIds || []).map((productId) => ({ productId, quantity: plan?.minQuantity || 1, variantId: '' }));
        if (!selectedLines.length) throw new Error('Add at least one product to this plan before creating a quote or subscription.');
        const pricedLines = selectedLines.map((line) => {
          const product = allData.products.find((item) => item.id === line.productId);
          if (!product) throw new Error('A selected product is missing. Update the plan and try again.');
          const variant = product.variants?.find((item) => item.id === line.variantId);
          if (line.variantId && !variant) throw new Error(`The selected option for ${product.name} is no longer available.`);
          const quantity = Number(line.quantity || plan?.minQuantity || 1);
          if (!Number.isInteger(quantity) || quantity < Number(plan?.minQuantity || 1)) throw new Error(`Quantity for ${product.name} must be at least ${plan?.minQuantity || 1}.`);
          const tax = allData.taxes.find((item) => item.id === line.taxId && item.status === 'active' && (!item.productIds?.length || item.productIds.includes(line.productId)))
            || allData.taxes.find((item) => item.status === 'active' && (!item.productIds?.length || item.productIds.includes(line.productId)));
          return { productId: line.productId, variantId: line.variantId || '', quantity, taxId: tax?.id || '', catalogPrice: Number(product.salesPrice || 0), variantExtra: Number(variant?.extraPrice || 0) };
        });
        const planBasePrice = Number(plan?.price || 0);
        const totalWeight = pricedLines.reduce((sum, line) => sum + (line.catalogPrice + line.variantExtra) * line.quantity, 0);
        data.lines = pricedLines.map((line) => {
          const allocationWeight = (line.catalogPrice + line.variantExtra) * line.quantity;
          const allocatedPlanPrice = totalWeight > 0 ? planBasePrice * allocationWeight / totalWeight : planBasePrice / pricedLines.length;
          const lineAmount = allocatedPlanPrice + line.variantExtra * line.quantity;
          return { productId: line.productId, variantId: line.variantId, quantity: line.quantity, taxId: line.taxId, unitPrice: lineAmount / line.quantity };
        });
        if (entity === 'quotations') { data.status = modal.record?.status || 'draft'; data.salesRepId ||= allData.staff[0]?.id || ''; }
      }
      if (entity === 'staff' && !modal.record) {
        const worker = await createStaffAccount(data);
        setModal({ kind: 'credentials', worker: worker.worker, temporaryPassword: worker.temporaryPassword });
        await loadPage(); return;
      }
      if (entity === 'payments') {
        if (modal.record) await paymentService.update(modal.record.id, data);
        else await recordPayment(data);
      } else if (modal.record) await SERVICE[entity].update(modal.record.id, data);
      else await SERVICE[entity].create(data);
      setModal(null); await loadPage(); setToast(`${PAGE_TITLE[entity].replace(/s$/, '')} ${modal.record ? 'updated' : 'created'} successfully.`);
    } catch (error) { setToast(error.message || 'Unable to save this record.'); }
    finally { setSaving(false); }
  }

  async function perform(action, record) {
    try {
      if (action === 'delete') {
        if (!window.confirm(`Delete this ${page.slice(0, -1)}? This cannot be undone.`)) return;
        await SERVICE[page].remove(record.id);
      }
      if (action === 'status') {
        const nextStatus = record.status === 'active' ? 'inactive' : 'active';
        await SERVICE[page].update(record.id, { status: nextStatus });
      }
      if (action === 'accept') await quotationService.update(record.id, { status: 'accepted' });
      if (action === 'reject') await quotationService.update(record.id, { status: 'rejected' });
      if (action === 'convert') { const sub = await convertQuotation(record.id); setToast(`Created subscription ${sub.number}.`); }
      if (action === 'quote') await changeSubscriptionStatus(record.id, 'quotation');
      if (action === 'confirm') {
        if (page === 'subscriptions') await changeSubscriptionStatus(record.id, 'confirmed');
        else await invoiceService.update(record.id, { status: 'confirmed' });
      }
      if (action === 'activate') await changeSubscriptionStatus(record.id, 'active');
      if (action === 'pause') await changeSubscriptionStatus(record.id, 'paused');
      if (action === 'resume') await changeSubscriptionStatus(record.id, 'active');
      if (action === 'close') await changeSubscriptionStatus(record.id, 'closed');
      if (action === 'renew') { const renewed = await renewSubscription(record.id); setToast(`Renewed as ${renewed.number}.`); }
      if (action === 'generate') { const invoice = await generateInvoice(record.id); setToast(`Generated ${invoice.number}.`); }
      if (action === 'send') { const result = await sendInvoiceEmail(record.id); setToast(result.message); }
      if (action === 'cancel') await invoiceService.update(record.id, { status: 'cancelled' });
      if (action === 'pay') { setForm({ invoiceId: record.id, method: 'UPI', amount: '', paymentDate: TODAY, reference: '', note: '' }); setModal({ kind: 'form', entity: 'payments', record: null }); return; }
      if (action === 'print') printInvoice(record);
      if (action === 'view') { setModal({ kind: 'detail', entity: page, record }); return; }
      if (action === 'read' && page === 'notifications') await notificationService.markRead(record.id);
      await loadPage(); if (!['convert', 'renew', 'generate'].includes(action)) setToast('Changes saved.');
    } catch (error) { setToast(error.message || 'This action could not be completed.'); }
  }

  async function billAllDue() {
    const result = await generateDueInvoices();
    await loadPage();
    setToast(`${result.generated.length} invoice${result.generated.length === 1 ? '' : 's'} generated${result.failures.length ? `; ${result.failures.length} could not be billed` : ''}.`);
  }

  function printInvoice(invoice) {
    const customer = allData.customers.find((item) => item.id === invoice.customerId);
    const win = window.open('', '_blank', 'width=760,height=900');
    if (!win) { setToast('Allow pop-ups to print this invoice.'); return; }
    win.document.write(`<html><head><title>${escapeHtml(invoice.number)}</title><style>body{font:15px Arial,sans-serif;color:#202b29;margin:48px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #12695f;padding-bottom:20px}.muted{color:#6f7c7a}table{width:100%;border-collapse:collapse;margin-top:36px}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;margin-top:24px}.brand{color:#12695f;font-weight:bold;font-size:24px}</style></head><body><div class="head"><div><div class="brand">Brightloop</div><p>Brightloop Software</p></div><div><h1>INVOICE</h1><b>${escapeHtml(invoice.number)}</b><p>Due ${formatDate(invoice.dueDate)}</p></div></div><p>Bill to: <b>${escapeHtml(customer?.name || 'Customer')}</b><br>${escapeHtml(customer?.email || '')}<br>${escapeHtml(customer?.address || '')}</p><table><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr>${(invoice.lines || []).map((line) => `<tr><td>${escapeHtml(allData.products.find((p) => p.id === line.productId)?.name || 'Product')}</td><td>${line.quantity}</td><td>${fmtMoney(line.unitPrice)}</td><td>${fmtMoney(line.amount)}</td></tr>`).join('')}</table><div class="total"><p>Subtotal ${fmtMoney(invoice.subtotal)}</p><p>Tax ${fmtMoney(invoice.taxTotal)}</p><p>Discount −${fmtMoney(invoice.discountTotal)}</p><h2>Total ${fmtMoney(invoice.total)}</h2><p>Paid ${fmtMoney(invoice.amountPaid)}</p><p><b>Outstanding ${fmtMoney(invoice.total - invoice.amountPaid)}</b></p></div><p class="muted">Thank you for your business.</p><script>window.print()</script></body></html>`);
    win.document.close();
  }

  function renderOverview() {
    if (!allData) return <div className="loading-box">Loading your workspace…</div>;
    const data = allData;
    if (user.role === 'CUSTOMER') {
      const active = data.subscriptions.filter((item) => item.status === 'active').length;
      const outstanding = data.invoices.reduce((sum, item) => sum + Math.max(0, Number(item.total || 0) - Number(item.amountPaid || 0)), 0);
      const upcoming = data.subscriptions.filter((item) => item.nextInvoiceDate && item.nextInvoiceDate >= TODAY).sort((a, b) => a.nextInvoiceDate.localeCompare(b.nextInvoiceDate)).slice(0, 5);
      const recent = [...data.invoices].sort((a, b) => String(b.invoiceDate || b.createdAt).localeCompare(String(a.invoiceDate || a.createdAt))).slice(0, 5);
      return <><section className="welcome-card dash-welcome"><div className="welcome-icon"><Icon name="user" /></div><div><p className="eyebrow">CUSTOMER OVERVIEW</p><h2>Welcome, {user.name?.split(' ')[0] || 'there'}.</h2><p>Your subscriptions, invoices, and upcoming renewals.</p></div></section><section className="stat-grid customer-stat-grid"><article className="stat-card"><div className="stat-head">Active subscriptions</div><strong>{active}</strong></article><article className="stat-card"><div className="stat-head">Upcoming renewals</div><strong>{upcoming.length}</strong></article><article className="stat-card"><div className="stat-head">Outstanding amount</div><strong>{fmtMoney(outstanding)}</strong></article><article className="stat-card"><div className="stat-head">Recent invoices</div><strong>{recent.length}</strong></article></section><section className="analytics-grid"><article className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">BILLING</p><h2>Recent invoices</h2></div><button className="link-button" onClick={() => changePage('invoices')}>View all</button></div>{recent.map((invoice) => <div className="activity-item" key={invoice.id}><span><b>{invoice.number}</b><small>Due {formatDate(invoice.dueDate)}</small></span><span>{fmtMoney(invoice.total)}</span><Status value={invoice.status} /></div>)}{!recent.length && <p className="empty-state">Your invoices will appear here.</p>}</article><article className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">NEXT UP</p><h2>Upcoming renewals</h2></div><button className="link-button" onClick={() => changePage('subscriptions')}>View all</button></div>{upcoming.map((subscription) => <div className="renewal-item" key={subscription.id}><span><b>{subscription.number}</b><small>{data.plans.find((plan) => plan.id === subscription.planId)?.name || 'Subscription plan'}</small></span><time>{formatDate(subscription.nextInvoiceDate)}</time></div>)}{!upcoming.length && <p className="empty-state">No upcoming renewals.</p>}</article></section></>;
    }
    const activeSubscriptions = data.subscriptions.filter((item) => item.status === 'active').length;
    const paid = data.payments.reduce((sum, item) => sum + Number(item.amount), 0);
    const invoices = data.invoices.filter((item) => item.status !== 'cancelled');
    const outstanding = invoices.reduce((sum, item) => sum + Math.max(0, Number(item.total) - Number(item.amountPaid || 0)), 0);
    const overdue = invoices.filter((item) => item.dueDate < TODAY && item.status !== 'paid').length;
    const cards = [['Active subscriptions', activeSubscriptions, 'credit', 'Across all plans'], ['Revenue received', fmtMoney(paid), 'wallet', 'Recorded payments'], ['Outstanding amount', fmtMoney(outstanding), 'file', 'Open invoice balances'], ['Overdue invoices', overdue, 'calendar', 'Require follow-up'], ['Total customers', data.customers.length, 'users', `${data.customers.filter((x) => x.status === 'active').length} active accounts`], ['Total products', data.products.length, 'box', `${data.products.filter((x) => x.status === 'active').length} active catalog items`]];
    const recent = [
      ...data.subscriptions.map((item) => ({ date: item.startDate, type: 'Subscription', label: item.number, sub: data.customers.find((x) => x.id === item.customerId)?.name || '', icon: 'credit' })),
      ...data.invoices.map((item) => ({ date: item.invoiceDate, type: 'Invoice', label: item.number, sub: fmtMoney(item.total), icon: 'file' })),
      ...data.payments.map((item) => ({ date: item.paymentDate, type: 'Payment', label: data.customers.find((x) => x.id === item.customerId)?.name || '', sub: fmtMoney(item.amount), icon: 'wallet' })),
      ...data.customers.map((item) => ({ date: item.createdAt, type: 'Customer', label: item.name, sub: 'New registration', icon: 'users' })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    const renewals = data.subscriptions.filter((item) => item.status === 'active' && item.nextInvoiceDate).sort((a, b) => a.nextInvoiceDate.localeCompare(b.nextInvoiceDate)).slice(0, 5);
    const monthCount = range === '30' ? 1 : range === '90' ? 3 : 12;
    const months = Array.from({ length: monthCount }, (_, index) => {
      const date = new Date(); date.setMonth(date.getMonth() - (monthCount - 1 - index));
      const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const revenue = data.payments.filter((payment) => payment.paymentDate.startsWith(prefix)).reduce((sum, payment) => sum + Number(payment.amount), 0);
      const count = data.subscriptions.filter((sub) => sub.startDate.startsWith(prefix)).length;
      return { label: date.toLocaleDateString('en-IN', { month: 'short' }), revenue, count };
    });
    const maxRevenue = Math.max(...months.map((x) => x.revenue), 1);
    const statusCounts = ['active', 'confirmed', 'paused', 'closed', 'draft', 'quotation'].map((status) => ({ status, count: data.subscriptions.filter((sub) => sub.status === status).length })).filter((x) => x.count);
    return <>
      <section className="welcome-card dash-welcome"><div className="welcome-icon"><Icon name="chart" /></div><div><p className="eyebrow">BRIGHTLOOP OVERVIEW</p><h2>Good day, {user.name?.split(' ')[0] || 'Admin'}.</h2><p>Your recurring revenue and customer operations at a glance.</p></div><label className="range-select">Period <select value={range} onChange={(event) => setRange(event.target.value)}><option value="30">Last month</option><option value="90">Last 3 months</option><option value="365">Last 12 months</option></select></label></section>
      <section className="stat-grid">{cards.map(([label, value, icon, note]) => <article className="stat-card" key={label}><div className="stat-head"><span>{label}</span><span className="stat-icon"><Icon name={icon} /></span></div><strong>{value}</strong><small>{note}</small></article>)}</section>
      <section className="analytics-grid"><article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">COLLECTIONS</p><h2>Monthly revenue</h2></div><span className="chart-total">{fmtMoney(months.reduce((sum, m) => sum + m.revenue, 0))}</span></div><div className="bar-chart">{months.map((month) => <div className="bar-col" key={month.label}><span className="bar-value">{month.revenue ? (month.revenue >= 1000 ? `${(month.revenue / 1000).toFixed(1)}k` : month.revenue) : '—'}</span><div className="bar-track"><i style={{ height: `${Math.max(4, month.revenue / maxRevenue * 100)}%` }} /></div><span>{month.label}</span></div>)}</div></article>
        <article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">PORTFOLIO</p><h2>Subscription status</h2></div></div><div className="status-breakdown">{statusCounts.map(({ status, count }) => <div key={status}><span><i className={`legend-dot status-dot-${status}`} />{status}</span><b>{count}</b></div>)}{!statusCounts.length && <p className="empty-state">No subscriptions yet.</p>}</div></article>
      </section>
      <section className="analytics-grid"><article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">GROWTH</p><h2>New subscriptions</h2></div></div><div className="bar-chart compact-chart">{months.map((month) => <div className="bar-col" key={month.label}><span className="bar-value">{month.count}</span><div className="bar-track"><i style={{ height: `${Math.max(4, month.count / Math.max(1, ...months.map((x) => x.count)) * 100)}%` }} /></div><span>{month.label}</span></div>)}</div></article>
        <article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">BILLING HEALTH</p><h2>Paid vs open invoices</h2></div></div><div className="invoice-ratio"><div><span>Paid</span><b>{data.invoices.filter((i) => i.status === 'paid').length}</b></div><div className="ratio-track"><i style={{ width: `${data.invoices.length ? data.invoices.filter((i) => i.status === 'paid').length / data.invoices.length * 100 : 0}%` }} /></div><div><span>Open</span><b>{data.invoices.filter((i) => !['paid', 'cancelled'].includes(i.status)).length}</b></div></div></article>
      </section>
      <section className="analytics-grid recent-grid"><article className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">WORKSPACE PULSE</p><h2>Recent activity</h2></div><button className="link-button" onClick={() => changePage('subscriptions')}>View subscriptions</button></div><div className="activity-list">{recent.map((item, index) => <div className="activity-item" key={`${item.type}-${index}`}><span className="activity-icon"><Icon name={item.icon} /></span><span><b>{item.label}</b><small>{item.type} · {item.sub}</small></span><time>{formatDate(item.date)}</time></div>)}</div></article>
        <article className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">NEXT UP</p><h2>Upcoming renewals</h2></div><button className="link-button" onClick={() => changePage('subscriptions')}>View all</button></div><div className="renewal-list">{renewals.map((item) => <div className="renewal-item" key={item.id}><span className="person-avatar">{(data.customers.find((x) => x.id === item.customerId)?.name || '?')[0]}</span><span><b>{data.customers.find((x) => x.id === item.customerId)?.name}</b><small>{item.number} · {data.plans.find((x) => x.id === item.planId)?.name}</small></span><time>{formatDate(item.nextInvoiceDate)}</time></div>)}{!renewals.length && <p className="empty-state">No upcoming renewals.</p>}</div></article></section>
    </>;
  }

  const columns = useMemo(() => buildColumns(page, allData), [page, allData]);
  function buildColumns(section, data) {
    const customerName = (id) => data?.customers?.find((item) => item.id === id)?.name || '—';
    const planName = (id) => data?.plans?.find((item) => item.id === id)?.name || '—';
    const productName = (id) => data?.products?.find((item) => item.id === id)?.name || '—';
    return {
      products: [['name', 'Product'], ['type', 'Type'], ['salesPrice', 'Base price', fmtMoney], ['variants', 'Variants', (v) => v?.length || 0], ['status', 'Status', Status]],
      plans: [['name', 'Plan'], ['description', 'Description'], ['billingPeriod', 'Frequency'], ['price', 'Recurring price', fmtMoney], ['minQuantity', 'Min qty'], ['productIds', 'Included products', (v) => v?.map(productName).join(', ') || '—'], ['status', 'Status', Status]],
      customers: [['name', 'Customer'], ['email', 'Email'], ['phone', 'Phone'], ['customerSubscriptionCount', 'Subscriptions', (_, row) => data?.subscriptions?.filter((x) => x.customerId === row.id).length || 0], ['customerPaid', 'Paid', (_, row) => fmtMoney(data?.payments?.filter((x) => x.customerId === row.id).reduce((n, p) => n + Number(p.amount), 0))], ['status', 'Status', Status]],
      staff: [['name', 'Staff member'], ['email', 'Email'], ['jobTitle', 'Assigned role'], ['registrationStatus', 'Registration', Status], ['status', 'Status', Status]],
      notifications: [['title', 'Notification'], ['detail', 'Details'], ['date', 'Date', formatDate], ['read', 'Status', (value) => value ? 'Read' : 'New']],
      quotations: [['number', 'Quotation'], ['customerId', 'Customer', customerName], ['planId', 'Plan', planName], ['createdAt', 'Created', formatDate], ['validUntil', 'Valid until', formatDate], ['status', (_, row) => <Status value={quotationStatus(row)} />], ['total', 'Total', (_, row) => fmtMoney(lineTotals(row.lines, data?.taxes).total)]],
      subscriptions: [['number', 'Subscription'], ['customerId', 'Customer', customerName], ['planId', 'Plan', planName], ['startDate', 'Start date', formatDate], ['nextInvoiceDate', 'Next invoice', formatDate], ['status', 'Status', Status]],
      invoices: [['number', 'Invoice'], ['customerId', 'Customer', customerName], ['subscriptionId', 'Subscription', (v) => data?.subscriptions?.find((x) => x.id === v)?.number || '—'], ['dueDate', 'Due date', formatDate], ['total', 'Total', fmtMoney], ['outstanding', 'Outstanding', (_, row) => fmtMoney(row.total - row.amountPaid)], ['status', 'Status', (v, row) => <Status value={row.status !== 'paid' && row.dueDate < TODAY && row.status !== 'cancelled' ? 'overdue' : v} />]],
      discounts: [['name', 'Discount'], ['type', 'Type'], ['value', 'Value', (v, row) => row.type === 'percentage' ? `${v}%` : fmtMoney(v)], ['appliesTo', 'Applies to'], ['endDate', 'Expiry', formatDate], ['usedCount', 'Used'], ['status', 'Status', Status]],
      payments: [['paymentDate', 'Date', formatDate], ['customerId', 'Customer', customerName], ['invoiceId', 'Invoice', (v) => data?.invoices?.find((x) => x.id === v)?.number || '—'], ['method', 'Method'], ['reference', 'Reference'], ['amount', 'Amount', fmtMoney]],
      taxes: [['name', 'Tax rule'], ['rate', 'Rate', (v) => `${v}%`], ['description', 'Description'], ['productIds', 'Products', (v) => v?.map(productName).join(', ') || 'All products'], ['status', 'Status', Status]],
    }[section] || [];
  }

  const filters = (section) => <div className="table-tools"><div className="search-box"><Icon name="search" /><input aria-label="Search records" placeholder={`Search ${PAGE_TITLE[section].toLowerCase()}...`} value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} /></div><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{[...new Set(records.map((item) => item.status).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}</select>{['products', 'plans', 'quotations', 'subscriptions', 'payments'].includes(section) && <select aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All types</option>{[...new Set(records.map((item) => item.type || item.billingPeriod || item.method).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}</select>}{['quotations', 'subscriptions', 'invoices', 'payments'].includes(section) && <select aria-label="Filter by customer" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}><option value="">All customers</option>{(allData?.customers || []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>}{['quotations', 'subscriptions'].includes(section) && <select aria-label="Filter by plan" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}><option value="">All plans</option>{(allData?.plans || []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>}<label className="date-filter"><span>From</span><input aria-label="Filter from date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="date-filter"><span>To</span><input aria-label="Filter to date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div>;

  function rowActions(record) {
    const actions = [];
    actions.push(['view', 'View']);
    if (page === 'notifications' && !record.read) actions.push(['read', 'Mark read']);
    if (isAdmin && ['products', 'plans', 'customers', 'staff', 'discounts', 'taxes'].includes(page) && record.registrationStatus !== 'invited') { actions.push(['edit', 'Edit']); actions.push(['status', record.status === 'active' ? 'Deactivate' : 'Activate']); }
    if (page === 'quotations' && quotationStatus(record) === 'draft') { actions.push(['accept', 'Accept']); actions.push(['reject', 'Reject']); }
    if (page === 'quotations' && record.status === 'accepted' && !record.convertedSubscriptionId) actions.push(['convert', 'Convert']);
    if (page === 'subscriptions') {
      if (record.status === 'draft') actions.push(['quote', 'Move to quotation']);
      if (record.status === 'quotation') actions.push(['confirm', 'Confirm']);
      if (record.status === 'confirmed') actions.push(['activate', 'Activate']);
      if (record.status === 'active') { actions.push(['generate', 'Generate invoice']); if (allData?.plans?.find((p) => p.id === record.planId)?.pausable) actions.push(['pause', 'Pause']); if (allData?.plans?.find((p) => p.id === record.planId)?.closable) actions.push(['close', 'Close']); }
      if (record.status === 'paused') actions.push(['resume', 'Resume']);
      if (record.status === 'closed' && allData?.plans?.find((p) => p.id === record.planId)?.renewable) actions.push(['renew', 'Renew']);
    }
    if (page === 'invoices') { if (record.status === 'draft') actions.push(['confirm', 'Confirm']); if (record.status !== 'cancelled') actions.push(['send', 'Send email']); if (!['paid', 'cancelled'].includes(record.status)) { actions.push(['pay', 'Record payment']); actions.push(['cancel', 'Cancel']); } actions.push(['print', 'Print']); }
    if (isAdmin && !['payments', 'staff'].includes(page)) actions.push(['delete', 'Delete']);
    if (page === 'staff') return isAdmin ? actions : [];
    if (user.role === 'CUSTOMER') {
      if (page === 'invoices') return [['view', 'View'], ['print', 'Print']];
      if (page === 'subscriptions') {
        const plan = allData?.plans?.find((item) => item.id === record.planId);
        const ownActions = [['view', 'View']];
        if (record.status === 'active' && plan?.pausable) ownActions.push(['pause', 'Pause']);
        if (record.status === 'paused') ownActions.push(['resume', 'Resume']);
        if (['active', 'paused'].includes(record.status) && plan?.closable) ownActions.push(['close', 'Close']);
        return ownActions;
      }
      return [['view', 'View']];
    }
    return actions;
  }

  function renderTable(section) {
    const pageCols = columns;
    return <section className="panel data-panel"><div className="table-tools-wrap">{filters(section)}<span className="result-count">{filtered.length} records</span></div><div className="table-scroll"><table className="data-table"><thead><tr>{pageCols.map(([, label]) => <th key={label}>{label}</th>)}<th className="action-col">Actions</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id}>{pageCols.map(([key, label, formatter]) => {
      let value = row[key];
      if (formatter) value = formatter(value, row);
      return <td key={label}>{formatter ? value : Array.isArray(value) ? value.join(', ') : (value ?? '—')}</td>;
    })}<td><details className="action-menu"><summary aria-label={`Actions for ${row.number || row.name || row.id}`}>•••</summary><div>{rowActions(row).map(([action, label]) => <button key={action} className={action === 'delete' || action === 'cancel' || action === 'reject' ? 'danger-action' : ''} onClick={() => action === 'edit' ? openEdit(row) : perform(action, row)}>{label}</button>)}</div></details></td></tr>)}</tbody></table>{!visible.length && <div className="empty-table"><span className="empty-art"><Icon name={activePage?.[2] || 'file'} /></span><b>{search ? 'No matching records' : `No ${PAGE_TITLE[section].toLowerCase()} yet`}</b><small>{search ? 'Try changing your search or filters.' : 'Add your first record to get started.'}</small>{!search && !['customers', 'invoices', 'notifications'].includes(section) && <button className="primary-button" onClick={openCreate}>Create {PAGE_TITLE[section].replace(/s$/, '')}</button>}</div>}</div><div className="pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span><div><button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>Previous</button><span>Page {currentPage} of {totalPages}</span><button disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next</button></div></div></section>;
  }

  function renderReports() {
    if (!allData) return null;
    const cutoff = dateDaysAgo(Number(range));
    const reportPayments = allData.payments.filter((x) => x.paymentDate >= cutoff && x.paymentDate <= TODAY);
    const reportInvoices = allData.invoices.filter((x) => x.invoiceDate >= cutoff && x.invoiceDate <= TODAY);
    const reportSubscriptions = allData.subscriptions.filter((x) => x.startDate >= cutoff && x.startDate <= TODAY);
    const paid = reportPayments.reduce((sum, x) => sum + Number(x.amount), 0);
    const invoiced = reportInvoices.filter((x) => x.status !== 'cancelled').reduce((sum, x) => sum + Number(x.total), 0);
    const outstanding = reportInvoices.filter((x) => x.status !== 'cancelled').reduce((sum, x) => sum + Math.max(0, Number(x.total) - Number(x.amountPaid || 0)), 0);
    const renewBy = dateDaysAgo(-Number(range));
    const upcoming = allData.subscriptions.filter((x) => x.status === 'active' && x.nextInvoiceDate >= TODAY && x.nextInvoiceDate <= renewBy);
    const productRevenue = reportPayments.reduce((obj, payment) => {
      const invoice = allData.invoices.find((x) => x.id === payment.invoiceId);
      const lineBase = (invoice?.lines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);
      for (const line of invoice?.lines || []) obj[line.productId] = (obj[line.productId] || 0) + (lineBase ? Number(payment.amount) * Number(line.amount || 0) / lineBase : 0);
      return obj;
    }, {});
    const planRevenue = reportPayments.reduce((obj, payment) => {
      const invoice = allData.invoices.find((x) => x.id === payment.invoiceId);
      const sub = allData.subscriptions.find((x) => x.id === invoice?.subscriptionId);
      if (sub) obj[sub.planId] = (obj[sub.planId] || 0) + Number(payment.amount);
      return obj;
    }, {});
    return <div className="report-view"><div className="report-toolbar"><span>Report period</span><select value={range} onChange={(event) => setRange(event.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">This year</option></select><small>Figures are calculated from payments, invoices, and subscriptions in this date range.</small></div><div className="report-cards"><article><span>Revenue received</span><b>{fmtMoney(paid)}</b></article><article><span>Total invoiced</span><b>{fmtMoney(invoiced)}</b></article><article><span>Outstanding</span><b>{fmtMoney(outstanding)}</b></article><article><span>Upcoming renewals</span><b>{upcoming.length}</b></article><article><span>New subscriptions</span><b>{reportSubscriptions.length}</b></article><article><span>Renewed subscriptions</span><b>{reportSubscriptions.filter((x) => x.renewedFromId).length}</b></article><article><span>Closed subscriptions</span><b>{allData.subscriptions.filter((x) => x.status === 'closed').length}</b></article><article><span>New customers</span><b>{allData.customers.filter((x) => x.createdAt >= cutoff && x.createdAt <= TODAY).length}</b></article><article><span>Customers with active plans</span><b>{new Set(allData.subscriptions.filter((x) => x.status === 'active').map((x) => x.customerId)).size}</b></article></div><div className="analytics-grid"><article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">REVENUE MIX</p><h2>Revenue by product</h2></div></div>{Object.entries(productRevenue).map(([productId, revenue]) => <div className="report-line" key={productId}><span>{allData.products.find((x) => x.id === productId)?.name || 'Product'}</span><b>{fmtMoney(revenue)}</b></div>)}{!Object.keys(productRevenue).length && <p className="empty-state">Payment data will appear here.</p>}</article><article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">PLAN MIX</p><h2>Revenue by plan</h2></div></div>{allData.plans.map((plan) => <div className="report-line" key={plan.id}><span>{plan.name}</span><b>{fmtMoney(planRevenue[plan.id] || 0)}</b></div>)}</article></div><article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">INVOICE PERFORMANCE</p><h2>Billing summary</h2></div></div><div className="report-cards inline"><article><span>Paid amount</span><b>{fmtMoney(paid)}</b></article><article><span>Open amount</span><b>{fmtMoney(outstanding)}</b></article><article><span>Overdue invoices</span><b>{reportInvoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled' && i.dueDate < TODAY).length}</b></article><article><span>Cancelled</span><b>{reportInvoices.filter((x) => x.status === 'cancelled').length}</b></article></div></article></div>;
  }

  function renderSettings() {
    if (!settings) return null;
    async function save(event) { event.preventDefault(); await settingsService.update(settings); setToast('Settings saved.'); }
    return <div className="settings-grid"><form className="panel settings-panel" onSubmit={save}><div className="panel-heading"><div><p className="eyebrow">WORKSPACE</p><h2>Company information</h2></div></div><label className="field"><span>Company name</span><input value={settings.companyName || ''} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} /></label><label className="field"><span>Admin name</span><input value={settings.adminName || ''} onChange={(e) => setSettings({ ...settings, adminName: e.target.value })} /></label><label className="field"><span>Admin email</span><input type="email" value={settings.adminEmail || ''} onChange={(e) => setSettings({ ...settings, adminEmail: e.target.value })} /></label><label className="field"><span>Currency</span><select value={settings.currency || 'INR'} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}><option value="INR">INR · Indian Rupee</option><option value="USD">USD · US Dollar</option></select></label><div className="check-row"><label><input type="checkbox" checked={Boolean(settings.emailNotifications)} onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })} /> Email notifications</label><label><input type="checkbox" checked={Boolean(settings.renewalReminders)} onChange={(e) => setSettings({ ...settings, renewalReminders: e.target.checked })} /> Renewal reminders</label></div><button className="primary-button">Save settings</button></form></div>;
  }

  function renderProfile() {
    async function save(event) {
      event.preventDefault(); setSaving(true);
      try { await profileService.update(profileForm); await loadPage(); setToast('Profile saved.'); }
      catch (error) { setToast(error.message || 'Unable to save your profile.'); }
      finally { setSaving(false); }
    }
    return <form className="panel settings-panel profile-panel" onSubmit={save}><div className="panel-heading"><div><p className="eyebrow">ACCOUNT</p><h2>Personal details</h2></div></div><label className="field"><span>Full name</span><input required maxLength={120} value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} /></label><label className="field"><span>Email</span><input type="email" value={user.email || ''} disabled /></label><label className="field"><span>Phone</span><input type="tel" maxLength={40} value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} /></label><label className="field"><span>Address</span><input maxLength={240} value={profileForm.address} onChange={(event) => setProfileForm({ ...profileForm, address: event.target.value })} /></label><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button><button type="button" className="secondary-button" onClick={() => window.location.assign('/change-password')}>Change password</button></form>;
  }

  function renderDetail() {
    const { entity, record } = modal;
    const lines = record.lines || [];
    const relations = { customerId: ['customers', 'name'], planId: ['plans', 'name'], productId: ['products', 'name'], subscriptionId: ['subscriptions', 'number'], invoiceId: ['invoices', 'number'], taxId: ['taxes', 'name'] };
    return <div className="detail-grid">{Object.entries(record).filter(([key]) => !['id', 'lines', 'variants', 'productIds'].includes(key)).map(([key, value]) => {
      let display = value;
      if (relations[key]) display = allData[relations[key][0]]?.find((item) => item.id === value)?.[relations[key][1]] || value;
      if (key.toLowerCase().includes('date')) display = formatDate(value);
      if (key.toLowerCase().includes('price') || ['total', 'subtotal', 'taxTotal', 'amountPaid', 'discountTotal', 'amount'].includes(key)) display = fmtMoney(value);
      return <div key={key}><small>{key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())}</small><b>{typeof display === 'object' ? JSON.stringify(display) : String(display ?? '—')}</b></div>;
    })}{record.variants?.length > 0 && <div className="detail-lines"><h3>Product variants</h3>{record.variants.map((variant) => <div key={variant.id}><span>{variant.attribute}: {variant.value}</span><b>{fmtMoney(Number(record.salesPrice) + Number(variant.extraPrice))}</b></div>)}</div>}{lines.length > 0 && <div className="detail-lines"><h3>Line items</h3>{lines.map((line, index) => <div key={index}><span>{allData.products.find((x) => x.id === line.productId)?.name || 'Item'} × {line.quantity}</span><b>{fmtMoney((line.quantity || 0) * (line.unitPrice || 0))}</b></div>)}</div>}{entity === 'customers' && <div className="detail-lines"><h3>Customer activity</h3>{allData.subscriptions.filter((x) => x.customerId === record.id).map((sub) => <div key={sub.id}><span>{sub.number} · {allData.plans.find((p) => p.id === sub.planId)?.name}</span><Status value={sub.status} /></div>)}{allData.invoices.filter((x) => x.customerId === record.id).map((invoice) => <div key={invoice.id}><span>{invoice.number} · Outstanding {fmtMoney(invoice.total - invoice.amountPaid)}</span><Status value={invoice.status} /></div>)}{allData.payments.filter((x) => x.customerId === record.id).map((payment) => <div key={payment.id}><span>{payment.method} · {formatDate(payment.paymentDate)}</span><b>{fmtMoney(payment.amount)}</b></div>)}</div>}</div>;
  }

  function renderFormField(field) {
    const [key, label, type, required, options] = field;
    if (type === 'relation') {
      const relationData = allData?.[options] || [];
      const choices = options === 'invoices' ? relationData.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled') : relationData;
      const selectedValue = form[key] || choices[0]?.id || '';
      return <label className="field" key={key}><span>{label}{required ? ' *' : ''}</span><select required={required} value={selectedValue} onChange={(event) => {
        const value = event.target.value;
        const next = { ...form, [key]: value };
        if (key === 'planId' && ['quotations', 'subscriptions'].includes(modal.entity)) {
          const plan = allData?.plans?.find((item) => item.id === value);
          next.lines = (plan?.productIds || []).map((productId) => {
            const existing = form.lines?.find((line) => line.productId === productId);
            const product = allData?.products?.find((item) => item.id === productId);
            const tax = allData?.taxes?.find((item) => item.status === 'active' && (!item.productIds?.length || item.productIds.includes(productId)));
            return existing || { productId, variantId: '', quantity: plan?.minQuantity || 1, taxId: tax?.id || '', unitPrice: Number(product?.salesPrice || 0) };
          });
        }
        setForm(next);
      }}>{!choices.length && <option value="">No available {label.toLowerCase()}</option>}{choices.map((item) => <option key={item.id} value={item.id}>{item.name || item.number || item.email}</option>)}</select></label>;
    }
    if (type === 'multi-relation') {
      const selected = form[key] || [];
      const choices = (allData?.[options] || []).filter((item) => item.status !== 'inactive');
      return <fieldset className="field full-field" key={key}><legend>{label}{required ? ' *' : ''}</legend>{choices.map((item) => <label className="check-field" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setForm({ ...form, [key]: event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id) })} /><span>{item.name} · {fmtMoney(item.salesPrice)}{item.variants?.length ? ` · ${item.variants.length} options` : ''}</span></label>)}{!choices.length && <small>Add an active product before creating a plan.</small>}</fieldset>;
    }
    if (type === 'checkbox') return <label className="check-field" key={key}><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} /><span>{label}</span></label>;
    if (type === 'select') return <label className="field" key={key}><span>{label}{required ? ' *' : ''}</span><select required={required} value={form[key] || options[0]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}>{options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select></label>;
    const value = form[key] ?? '';
    return <label className={`field ${type === 'textarea' ? 'full-field' : ''}`} key={key}><span>{label}{required ? ' *' : ''}</span>{type === 'textarea' ? <textarea required={required} value={value} onChange={(event) => setForm({ ...form, [key]: event.target.value })} rows={3} /> : <input required={required} type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />}</label>;
  }

  function renderLineEditor() {
    if (!['quotations', 'subscriptions'].includes(modal?.entity)) return null;
    const plan = allData?.plans?.find((item) => item.id === form.planId);
    if (!plan) return <p className="form-note full-field">Choose a plan to load its product lines.</p>;
    const lines = form.lines || [];
    const updateLine = (index, changes) => setForm({ ...form, lines: lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...changes } : line) });
    return <div className="line-editor full-field"><div><strong>Subscription items</strong><p className="form-note">The recurring base charge is the plan price set by the administrator ({fmtMoney(plan.price)} per {plan.billingPeriod}). Included product prices are informational; selected variant upgrades are added to the plan price. Taxes are calculated on the resulting invoice lines.</p></div>{lines.map((line, index) => {
      const product = allData.products.find((item) => item.id === line.productId);
      if (!product) return null;
      const variants = product.variants || [];
      const taxes = allData.taxes.filter((tax) => tax.status === 'active' && (!tax.productIds?.length || tax.productIds.includes(product.id)));
      const variant = variants.find((item) => item.id === line.variantId);
      const price = Number(product.salesPrice || 0) + Number(variant?.extraPrice || 0);
      return <div className="subscription-line-row" key={line.productId}>
        <label className="check-field"><input type="checkbox" checked={line.included !== false} onChange={(event) => updateLine(index, { included: event.target.checked })} /><span>{product.name}</span></label>
        {variants.length > 0 && <label className="field"><span>Variant</span><select value={line.variantId || ''} onChange={(event) => updateLine(index, { variantId: event.target.value })}><option value="">Base product</option>{variants.map((item) => <option key={item.id} value={item.id}>{item.attribute}: {item.value} (+{fmtMoney(item.extraPrice)})</option>)}</select></label>}
        <label className="field"><span>Quantity (min {plan.minQuantity || 1})</span><input type="number" min={plan.minQuantity || 1} step="1" value={line.quantity ?? plan.minQuantity ?? 1} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
        <label className="field"><span>Tax</span><select value={line.taxId || ''} onChange={(event) => updateLine(index, { taxId: event.target.value })}><option value="">No tax</option>{taxes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name} ({tax.rate}%)</option>)}</select></label>
        <b className="line-preview">Catalog {fmtMoney(price * Number(line.quantity || 0))}</b>
      </div>;
    })}{!lines.length && <p className="empty-state">This plan has no associated products yet. Edit the plan and add at least one product.</p>}</div>;
  }

  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${mobileNav ? 'nav-open' : ''}`}><a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); changePage('overview'); setMobileNav(false); }}><span className="brand-mark">B</span><span className="brand-name">Brightloop</span></a><div className="workspace-label">WORKSPACE</div><nav className="side-nav" aria-label="Dashboard navigation">{visibleNav.map(([key, title, icon]) => <button type="button" key={key} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => { changePage(key); setMobileNav(false); }} title={collapsed ? title : undefined}><Icon name={icon} /><span className="nav-label">{title}</span>{key === 'invoices' && allData?.invoices?.some((x) => x.status !== 'paid' && x.dueDate < TODAY) && <i className="nav-dot" />}</button>)}</nav><div className="sidebar-bottom"><button className="nav-item logout-item" onClick={onLogout}><Icon name="logout" /><span className="nav-label">Logout</span></button><div className="sidebar-footer"><div className="user-avatar">{(user.name || 'A')[0].toUpperCase()}</div><div className="user-info"><strong>{user.name || 'Brightloop user'}</strong><span>{user.role === 'ADMIN' ? 'Administrator' : user.role === 'STAFF' ? 'Staff member' : 'Customer'}</span></div><button type="button" className="logout-btn" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? '›' : '‹'}</button></div></div></aside>
    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="dashboard-main"><header className="dashboard-topbar"><div className="topbar-title"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="menu" /></button><div><p className="eyebrow">BRIGHTLOOP WORKSPACE</p><h1>{PAGE_TITLE[page] || 'Dashboard'}</h1></div></div><div className="topbar-meta"><div className="notification-wrap"><button className="icon-button" aria-label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}><Icon name="bell" />{allData?.notifications?.some((x) => !x.read) && <i />}</button>{notificationsOpen && <div className="notification-popover"><b>Notifications</b>{(allData?.notifications || []).map((item) => <p key={item.id}><strong>{item.title}</strong><small>{item.detail}</small></p>)}</div>}</div><div className="account-chip"><span className="account-dot" />{user.email}</div></div></header>
      <div className="dashboard-content admin-content"><div className="page-heading"><div><p className="eyebrow">{page === 'overview' ? (user.role === 'CUSTOMER' ? 'MY ACCOUNT' : 'BUSINESS SNAPSHOT') : (activePage?.[1] || 'Workspace').toUpperCase()}</p>{page !== 'overview' && <p className="page-subtitle">Manage and review your {PAGE_TITLE[page]?.toLowerCase()}.</p>}</div>{((isAdmin && ['products', 'plans', 'staff', 'quotations', 'subscriptions', 'discounts', 'payments', 'taxes'].includes(page)) || (isStaff && ['quotations', 'subscriptions', 'payments'].includes(page))) && <button className="primary-button" onClick={openCreate}><Icon name="plus" /> Add {page === 'staff' ? 'staff member' : page === 'plans' ? 'plan' : page.slice(0, -1)}</button>}{page === 'invoices' && (isAdmin || isStaff) && <button className="primary-button" onClick={() => setModal({ kind: 'generate' })}><Icon name="plus" /> Generate invoice</button>}</div>
        {page === 'overview' ? renderOverview() : page === 'reports' ? renderReports() : page === 'settings' ? renderSettings() : page === 'profile' ? renderProfile() : renderTable(page)}
      </div>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && modal.kind !== 'credentials') setModal(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">{modal.kind === 'detail' ? 'RECORD DETAILS' : modal.kind === 'credentials' ? 'WORKER ACCOUNT CREATED' : 'BRIGHTLOOP WORKSPACE'}</p><h2 id="modal-title">{modal.kind === 'credentials' ? 'Share the temporary password' : modal.kind === 'detail' ? `${PAGE_TITLE[modal.entity]?.replace(/s$/, '') || 'Record'} details` : modal.kind === 'generate' ? 'Generate subscription invoice' : `${modal.record ? 'Edit' : 'Add'} ${PAGE_TITLE[modal.entity]?.replace(/s$/, '') || 'record'}`}</h2></div>{modal.kind !== 'credentials' && <button className="icon-button" onClick={() => setModal(null)} aria-label="Close"><Icon name="close" /></button>}</div>
      {modal.kind === 'credentials' ? <div className="credential-panel"><p><strong>{modal.worker.name}</strong> ({modal.worker.email}) has been created as an active staff member. They must verify their email and change this password at first sign-in.</p><label className="field"><span>Temporary password · shown once</span><input readOnly value={modal.temporaryPassword} onFocus={(event) => event.target.select()} /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(modal.temporaryPassword); setToast('Temporary password copied. Share it securely.'); } catch { setToast('Select and copy the temporary password manually.'); } }}>Copy password</button><button type="button" className="primary-button" onClick={() => setModal(null)}>Done</button></div><p className="form-note">Brightloop does not save this temporary password. Copy it before closing this window.</p></div> : modal.kind === 'detail' ? renderDetail() : modal.kind === 'generate' ? <div className="generate-list"><p className="panel-description">Generate all invoices due today from their active subscriptions. The same subscription billing period cannot be invoiced twice.</p><button className="primary-button bill-due-button" onClick={billAllDue}>Generate all due invoices</button><p className="eyebrow manual-generate-label">OR GENERATE A SINGLE INVOICE</p>{allData?.subscriptions?.filter((sub) => ['active', 'confirmed'].includes(sub.status)).map((sub) => <div key={sub.id}><span><b>{sub.number}</b><small>{allData.customers.find((x) => x.id === sub.customerId)?.name} · Next billing {formatDate(sub.nextInvoiceDate)}</small></span><button className="secondary-button" onClick={() => perform('generate', sub)}>Generate</button></div>)}</div> : <form onSubmit={submitForm}><div className="form-grid">{(FIELDS[modal.entity] || []).map(renderFormField)}{renderLineEditor()}</div>{modal.entity === 'payments' && form.invoiceId && <p className="form-note">Outstanding balance: {fmtMoney((allData?.invoices?.find((x) => x.id === form.invoiceId)?.total || 0) - (allData?.invoices?.find((x) => x.id === form.invoiceId)?.amountPaid || 0))}. Partial payments are supported.</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : modal.record ? 'Save changes' : 'Create record'}</button></div></form>}</section></div>}
    {toast && <div className="toast" role="status"><Icon name="check" />{toast}<button onClick={() => setToast('')} aria-label="Dismiss">×</button></div>}
    <button className="reset-shortcut" title="Reset mock data from Settings" aria-label="Reset mock data" onClick={() => changePage('settings')}>?</button>
  </div>;
}
