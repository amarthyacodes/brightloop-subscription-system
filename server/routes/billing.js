const express = require('express');
const { generateInvoice } = require('../controllers/billingController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.post('/invoices/generate', requireAuth, requireRole('admin', 'staff'), generateInvoice);
module.exports = router;
