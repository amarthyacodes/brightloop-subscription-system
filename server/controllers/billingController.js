const { firebaseDb } = require('../lib/firebaseAdmin');
const { createInvoiceForSubscription } = require('../../functions/billing');

async function generateInvoice(req, res, next) {
  try {
    const invoice = await createInvoiceForSubscription(firebaseDb(), req.body.subscriptionId, req.body.periodStart);
    if (invoice.closed) return res.status(409).json({ error: 'The expired subscription was automatically closed.' });
    return res.status(201).json({ invoice });
  } catch (error) {
    return next(error);
  }
}

module.exports = { generateInvoice };
