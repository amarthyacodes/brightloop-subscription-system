const express = require('express');
const { generateInvoice, sendInvoice } = require('../controllers/billingController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.post('/invoices/generate', requireAuth, requireRole('admin', 'staff'), generateInvoice);
router.post('/invoices/:id/send', requireAuth, requireRole('admin', 'staff'), sendInvoice);
module.exports = router;
