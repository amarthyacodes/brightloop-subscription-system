const express = require('express');
const { createStaff } = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.post('/staff', requireAuth, requireRole('admin'), createStaff);
module.exports = router;
