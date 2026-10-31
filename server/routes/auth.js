const express = require('express');
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.post('/signup', controller.signup);
router.post('/signup/staff', controller.signupStaff);
router.post('/login', controller.login);
router.post('/firebase-session', controller.firebaseSession);
router.post('/logout', requireAuth, controller.logout);
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);
router.get('/me', requireAuth, controller.me);
module.exports = router;
