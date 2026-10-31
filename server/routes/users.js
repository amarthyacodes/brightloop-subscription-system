const express = require('express');
const { createStaffAccount, inviteStaff, listStaff, setStaffStatus } = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.get('/staff', requireAuth, requireRole('admin'), listStaff);
router.post('/staff/accounts', requireAuth, requireRole('admin'), createStaffAccount);
router.post('/staff/invitations', requireAuth, requireRole('admin'), inviteStaff);
router.patch('/staff/:id/status', requireAuth, requireRole('admin'), setStaffStatus);
module.exports = router;
