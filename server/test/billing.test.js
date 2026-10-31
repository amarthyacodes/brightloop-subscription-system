const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addBillingPeriod, discountAmount } = require('../../functions/billing');

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
