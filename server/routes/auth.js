const express = require('express');
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.post('/signup/staff', controller.signupStaff);
router.post('/firebase-session', controller.firebaseSession);
router.post('/complete-password-change', requireAuth, controller.completePasswordChange);
router.post('/logout', requireAuth, controller.logout);
router.get('/me', requireAuth, controller.me);
module.exports = router;
