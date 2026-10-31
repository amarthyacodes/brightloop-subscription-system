const express = require('express');
const { inviteStaff, listStaff, setStaffStatus } = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.get('/staff', requireAuth, requireRole('admin'), listStaff);
router.post('/staff/invitations', requireAuth, requireRole('admin'), inviteStaff);
router.patch('/staff/:id/status', requireAuth, requireRole('admin'), setStaffStatus);
module.exports = router;
