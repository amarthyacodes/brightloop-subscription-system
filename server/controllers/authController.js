const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db/pool');
const { firebaseAuth, firebaseDb } = require('../lib/firebaseAdmin');
const { ADMIN_EMAIL } = require('../config/admin');

const SESSION_COOKIE = 'brightloop_session';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = ({ id, name, email, role, is_active }) => ({
  id,
  name,
  email,
  role: role.toUpperCase(),
  isActive: is_active,
});
async function setRoleClaim(uid, role) {
  const auth = firebaseAuth();
  const account = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(account.customClaims || {}), role });
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be 72 bytes or fewer.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character.';
  return null;
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function makeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  };
}

async function issueSession(res, user, remember = false) {
  const expiresIn = remember ? '30d' : (process.env.JWT_EXPIRES_IN || '8h');
  const sessionId = crypto.randomUUID();
  const token = jwt.sign({ id: user.id, sid: sessionId }, process.env.JWT_SECRET, { expiresIn });
  const { exp } = jwt.decode(token);
  await pool.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
  await pool.query('INSERT INTO user_sessions (id, user_id, expires_at) VALUES ($1, $2, to_timestamp($3))', [sessionId, user.id, exp]);
  const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : undefined;
  res.cookie(SESSION_COOKIE, token, cookieOptions(maxAge));
}

function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function mailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function signup(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!name || name.length > 120) return res.status(400).json({ error: 'Enter a name of 1 to 120 characters.' });
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, crypt($3, gen_salt('bf', 12)), 'customer') ON CONFLICT (email) DO NOTHING RETURNING id, name, email, role, is_active",
      [name, email, password]
    );
    if (!result.rowCount) return res.status(409).json({ error: 'An account with this email already exists.' });
    await issueSession(res, result.rows[0], true);
    return res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
}

async function signupStaff(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const idToken = typeof req.body.idToken === 'string' ? req.body.idToken : '';
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    if (!name || name.length > 120) return res.status(400).json({ error: 'Enter a name of 1 to 120 characters.' });
    if (!idToken || !token) return res.status(400).json({ error: 'A Firebase account and valid staff invitation are required.' });
    const decoded = await firebaseAuth().verifyIdToken(idToken, true);
    const email = normalizeEmail(decoded.email);
    if (!decoded.email || !EMAIL_PATTERN.test(email)) return res.status(401).json({ error: 'Sign in using the invited email address.' });

    await client.query('BEGIN');
    const invitation = await client.query(
      'SELECT id, email FROM staff_invitations WHERE invitation_token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE',
      [hashToken(token)]
    );
    if (!invitation.rowCount || invitation.rows[0].email !== email) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This staff invitation is invalid, expired, or does not match the email.' });
    }

    const created = await client.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, crypt($3, gen_salt('bf', 12)), 'staff') RETURNING id, name, email, role, is_active",
      [name, email, crypto.randomBytes(48).toString('hex')]
    );
    await client.query('UPDATE staff_invitations SET used_at = NOW() WHERE id = $1', [invitation.rows[0].id]);
    await client.query('COMMIT');
    const createdUser = created.rows[0];
    await setRoleClaim(decoded.uid, 'staff');
    await firebaseDb().collection('users').doc(decoded.uid).set({ uid: decoded.uid, accountId: String(createdUser.id), name, email, role: 'staff', phone: '', accountStatus: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await firebaseDb().collection('staffInvitations').doc(hashToken(token)).set({ email, name, status: 'accepted', acceptedUid: decoded.uid, acceptedAt: new Date().toISOString() }, { merge: true });
    await issueSession(res, createdUser, true);
    return res.status(201).json({ user: { ...publicUser(createdUser), uid: decoded.uid } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    return next(error);
  } finally {
    if (client) client.release();
  }
}

async function login(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (email.length > 254 || !EMAIL_PATTERN.test(email) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const result = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE email = $1 AND password_hash = crypt($2, password_hash)',
      [email, password]
    );
    if (!result.rowCount || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    await issueSession(res, result.rows[0], req.body.remember === true);
    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
}

async function firebaseSession(req, res, next) {
  try {
    const idToken = typeof req.body.idToken === 'string' ? req.body.idToken : '';
    if (!idToken) return res.status(400).json({ error: 'Firebase ID token is required.' });
    const decoded = await firebaseAuth().verifyIdToken(idToken, true);
    const email = normalizeEmail(decoded.email);
    const name = (decoded.name || email.split('@')[0] || 'Brightloop customer').trim().slice(0, 120);
    if (!decoded.email || !EMAIL_PATTERN.test(email)) return res.status(401).json({ error: 'A valid email address is required.' });
    if (!decoded.email_verified) return res.status(403).json({ error: 'Verify your email address before connecting your Brightloop account.' });
    const passwordPlaceholder = crypto.randomBytes(48).toString('hex');
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, crypt($3, gen_salt('bf', 12)), 'customer') ON CONFLICT (email) DO UPDATE SET name = CASE WHEN users.role = 'customer' THEN EXCLUDED.name ELSE users.name END, updated_at = NOW() RETURNING id, name, email, role, is_active",
      [name, email, passwordPlaceholder]
    );
    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'This account is inactive.' });
    if (user.role === 'admin' && email !== ADMIN_EMAIL) return res.status(403).json({ error: 'This administrator email is not approved for Firebase access.' });
    const profile = {
      uid: decoded.uid, accountId: String(user.id), name: user.name, email: user.email, role: user.role,
      phone: '', accountStatus: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const profileRef = firebaseDb().collection('users').doc(decoded.uid);
    const existingProfile = await profileRef.get();
    if (!existingProfile.exists && user.role !== 'customer') {
      return res.status(403).json({ error: 'Your profile is missing. An administrator must securely restore this staff or admin account before you can continue.' });
    }
    if (existingProfile.exists && (existingProfile.get('email') !== user.email || existingProfile.get('role') !== user.role)) {
      return res.status(403).json({ error: 'Your account profile is inconsistent. Contact an administrator for secure recovery.' });
    }
    if (existingProfile.exists && existingProfile.get('accountStatus') !== 'active') return res.status(403).json({ error: 'This account is inactive. Contact an administrator if you believe this is a mistake.' });
    if (!existingProfile.exists) await profileRef.set(profile);
    else if (!existingProfile.get('accountId')) await profileRef.set({ accountId: String(user.id), updatedAt: new Date().toISOString() }, { merge: true });
    await setRoleClaim(decoded.uid, user.role);
    if (user.role === 'admin') {
      const settingsRef = firebaseDb().collection('settings').doc('company');
      if (!(await settingsRef.get()).exists) await settingsRef.set({ companyName: 'Brightloop', adminName: user.name, adminEmail: user.email, currency: 'INR', emailNotifications: true, renewalReminders: true });
    }
    await issueSession(res, user, req.body.remember !== false);
    return res.json({ user: { ...publicUser(user), uid: decoded.uid } });
  } catch (error) {
    if (error.code && error.code.startsWith('auth/')) return res.status(401).json({ error: 'Firebase sign-in token is invalid or expired.' });
    return next(error);
  }
}

async function logout(req, res) {
  await pool.query('DELETE FROM user_sessions WHERE id = $1', [req.user.sessionId]);
  clearSession(res);
  return res.json({ message: 'Signed out.' });
}

async function me(req, res) {
  return res.json({ user: publicUser(req.user) });
}

async function forgotPassword(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    if (EMAIL_PATTERN.test(email)) {
      const found = await pool.query('SELECT id, email FROM users WHERE email = $1 AND is_active = TRUE', [email]);
      if (found.rowCount) {
        const token = makeToken();
        await pool.query(
          "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')",
          [found.rows[0].id, hashToken(token)]
        );
        const link = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(token)}`;
        const transport = mailer();
        if (transport) {
          try {
            await transport.sendMail({
              from: process.env.SMTP_FROM || process.env.SMTP_USER,
              to: found.rows[0].email,
              subject: 'Reset your Brightloop password',
              text: `Use this link within one hour to reset your password: ${link}`,
            });
          } catch (mailError) {
            console.error('Password reset email could not be sent:', mailError.message);
          }
        } else {
          console.log(`Password reset link for ${found.rows[0].email}: ${link}`);
        }
      }
    }
    return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  const client = await pool.connect();
  try {
    const { token, password } = req.body;
    if (typeof token !== 'string' || !token) return res.status(400).json({ error: 'Reset token is required.' });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE',
      [hashToken(token)]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Reset token is invalid, expired, or already used.' });
    }
    await client.query("UPDATE users SET password_hash = crypt($1, gen_salt('bf', 12)), updated_at = NOW() WHERE id = $2", [password, result.rows[0].user_id]);
    await client.query('DELETE FROM user_sessions WHERE user_id = $1', [result.rows[0].user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [result.rows[0].id]);
    await client.query('COMMIT');
    return res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
}

async function inviteStaff(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body.email);
    if (!name || name.length > 120) return res.status(400).json({ error: 'Enter a name of 1 to 120 characters.' });
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rowCount) return res.status(409).json({ error: 'An account with this email already exists.' });

    const token = makeToken();
    await pool.query(
      'UPDATE staff_invitations SET used_at = NOW() WHERE email = $1 AND used_at IS NULL',
      [email]
    );
    await pool.query(
      "INSERT INTO staff_invitations (email, name, invitation_token_hash, invited_by, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')",
      [email, name, hashToken(token), req.user.id]
    );
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await firebaseDb().collection('staffInvitations').doc(hashToken(token)).set({ email, name, role: req.body.role || 'staff', status: 'pending', invitedBy: String(req.user.id), createdAt: new Date().toISOString(), expiresAt });
    const link = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/signup/staff?token=${encodeURIComponent(token)}`;
    const transport = mailer();
    let emailSent = false;
    if (transport) {
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'You are invited to Brightloop',
          text: `Hello ${name}, complete your staff signup within seven days: ${link}`,
        });
        emailSent = true;
      } catch (mailError) {
        console.error('Staff invitation email could not be sent:', mailError.message);
      }
    } else {
      console.log(`Staff invitation for ${email}: ${link}`);
    }
    return res.status(201).json({
      invitation: { email, name, expiresInDays: 7, link },
      message: emailSent ? 'Invitation email sent.' : 'Invitation created. Share the secure link below.',
    });
  } catch (error) {
    return next(error);
  }
}

async function listStaff(_req, res, next) {
  try {
    const [staff, invitations] = await Promise.all([
      pool.query("SELECT id, name, email, role, is_active, created_at FROM users WHERE role = 'staff' ORDER BY created_at DESC"),
      pool.query("SELECT id, name, email, expires_at, created_at FROM staff_invitations WHERE used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC"),
    ]);
    return res.json({ staff: staff.rows.map(publicUser), invitations: invitations.rows });
  } catch (error) {
    return next(error);
  }
}

async function setStaffStatus(req, res, next) {
  try {
    const active = req.body.active;
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'Active must be true or false.' });
    const result = await pool.query(
      "UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND role = 'staff' RETURNING id, name, email, role, is_active",
      [active, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Staff account was not found.' });
    if (!active) await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [result.rows[0].id]);
    try {
      const firebaseUser = await firebaseAuth().getUserByEmail(result.rows[0].email);
      await firebaseDb().collection('users').doc(firebaseUser.uid).update({ accountStatus: active ? 'active' : 'inactive', updatedAt: new Date().toISOString() });
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  signup,
  signupStaff,
  login,
  firebaseSession,
  logout,
  me,
  forgotPassword,
  resetPassword,
  inviteStaff,
  listStaff,
  setStaffStatus,
  SESSION_COOKIE,
};
