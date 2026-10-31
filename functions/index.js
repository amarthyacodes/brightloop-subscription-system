const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { createInvoiceForSubscription } = require('./billing');

if (!getApps().length) initializeApp();

exports.billDueSubscriptions = onSchedule({
  schedule: '15 3 * * *',
  timeZone: 'Asia/Kolkata',
  retryCount: 3,
}, async () => {
  const db = getFirestore();
  const asOf = new Date().toISOString().slice(0, 10);
  const due = await db.collection('subscriptions')
    .where('status', 'in', ['active', 'confirmed'])
    .where('nextInvoiceDate', '<=', asOf)
    .get();
  const failures = [];
  let generated = 0;

  for (const subscription of due.docs) {
    try {
      const invoice = await createInvoiceForSubscription(db, subscription.id, subscription.get('nextInvoiceDate'));
      if (invoice.closed) logger.info('Closed expired subscription', { subscriptionId: subscription.id });
      else generated += 1;
    } catch (error) {
      if (error.message?.includes('An invoice already exists for this subscription and billing period.')) continue;
      failures.push({ subscriptionId: subscription.id, message: error.message });
      logger.error('Scheduled invoice failed', { subscriptionId: subscription.id, message: error.message });
    }
  }

  logger.info('Scheduled billing finished', { generated, failed: failures.length });
  if (failures.length) throw new Error(`Scheduled billing failed for ${failures.length} subscription(s).`);
});
