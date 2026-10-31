const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addBillingPeriod, createInvoiceForSubscription, discountAmount } = require('../../functions/billing');

function fakeFirestore(seed) {
  const records = new Map();
  for (const [collection, documents] of Object.entries(seed)) {
    for (const [id, value] of Object.entries(documents)) records.set(`${collection}/${id}`, structuredClone(value));
  }
  const makeRef = (collection, id) => ({ collection, id, path: `${collection}/${id}` });
  const snapshot = (ref) => {
    const value = records.get(ref.path);
    return { id: ref.id, exists: value !== undefined, data: () => value && structuredClone(value) };
  };
  function collection(name) {
    return {
      doc: (id) => makeRef(name, id),
      where: (field, operator, value) => ({ query: true, collection: name, field, operator, value }),
    };
  }
  return {
    collection,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async getAll(...refs) { return refs.map(snapshot); },
        async get(refOrQuery) {
          if (!refOrQuery.query) return snapshot(refOrQuery);
          const docs = [...records.entries()]
            .filter(([path, value]) => path.startsWith(`${refOrQuery.collection}/`) && value[refOrQuery.field] === refOrQuery.value)
            .map(([path, value]) => ({ id: path.split('/')[1], exists: true, data: () => structuredClone(value) }));
          return { docs };
        },
        create(ref, value) { writes.push(() => { if (records.has(ref.path)) throw new Error('Document already exists'); records.set(ref.path, structuredClone(value)); }); },
        update(ref, changes) { writes.push(() => records.set(ref.path, { ...records.get(ref.path), ...structuredClone(changes) })); },
      };
      const result = await callback(transaction);
      writes.forEach((write) => write());
      return result;
    },
    read(collectionName, id) { return structuredClone(records.get(`${collectionName}/${id}`)); },
  };
}

test('billing period arithmetic clamps month ends and leap days', () => {
  assert.equal(addBillingPeriod('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(addBillingPeriod('2024-02-29', 'yearly'), '2025-02-28');
  assert.equal(addBillingPeriod('2026-10-31', 'weekly'), '2026-11-07');
});

test('discount calculations enforce activity, limits, minimums, and product scope', () => {
  const discount = { status: 'active', type: 'percentage', value: 10, minPurchase: 50, minQuantity: 2, appliesTo: 'product', productIds: ['p1'], usedCount: 1, usageLimit: 3 };
  const eligible = { subtotal: 100, quantity: 2, productIds: ['p1'], date: '2026-10-31' };
  assert.equal(discountAmount(discount, eligible), 10);
  assert.equal(discountAmount(discount, { ...eligible, productIds: ['p2'] }), 0);
  assert.equal(discountAmount({ ...discount, usedCount: 3 }, eligible), 0);
  assert.equal(discountAmount({ ...discount, status: 'inactive' }, eligible), 0);
});

test('invoice generation calculates variants and tax, applies discounts, advances billing, and prevents duplicate charges', async () => {
  const db = fakeFirestore({
    subscriptions: { sub1: { status: 'active', customerId: 'customer1', planId: 'plan1', nextInvoiceDate: '2026-10-31', lines: [{ productId: 'p1', variantId: 'v1', quantity: 2, taxId: 'tax1' }] } },
    plans: { plan1: { billingPeriod: 'monthly', price: 100, minQuantity: 1, productIds: ['p1'] } },
    products: { p1: { name: 'Brightloop', status: 'active', salesPrice: 100, variants: [{ id: 'v1', extraPrice: 20 }] } },
    taxes: { tax1: { status: 'active', rate: 10, productIds: ['p1'] } },
    discounts: { d1: { status: 'active', type: 'percentage', value: 10, appliesTo: 'subscription', minPurchase: 0, minQuantity: 1, usedCount: 0, usageLimit: 2 } },
  });

  const invoice = await createInvoiceForSubscription(db, 'sub1', '2026-10-31');
  assert.equal(invoice.status, 'draft');
  assert.equal(invoice.subtotal, 140); // Admin-set plan price plus two variant upgrades.
  assert.equal(invoice.taxTotal, 14);
  assert.equal(invoice.discountTotal, 14);
  assert.equal(invoice.total, 140);
  assert.equal(invoice.lines[0].unitPrice, 70);
  assert.equal(db.read('subscriptions', 'sub1').nextInvoiceDate, '2026-11-30');
  assert.equal(db.read('discounts', 'd1').usedCount, 1);
  await assert.rejects(createInvoiceForSubscription(db, 'sub1', '2026-10-31'), /already exists/);
});
