const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db/pool');

const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });
function validatePassword(password) {
  if (typeof password !== 'string' || password.length <= 8) return 'Password must be longer than 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character.';
  return null;
}
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
}
function configuredMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: process.env.SMTP_SECURE === 'true', auth: { user: SMTP_USER, pass: SMTP_PASS } });
}

async function signup(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid email address is required.' });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, crypt($3, gen_salt('bf', 10)), 'customer') ON CONFLICT (email) DO NOTHING RETURNING id, name, email, role",
      [name, email, password]
    );
    if (!result.rowCount) return res.status(409).json({ error: 'An account with this email already exists.' });
    return res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (error) { return next(error); }
}

async function login(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required.' });
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE email = $1 AND password_hash = crypt($2, password_hash)', [email, password]);
    if (!result.rowCount) return res.status(401).json({ error: 'Invalid email or password.' });
    const user = publicUser(result.rows[0]);
    return res.json({ token: signToken(user), user });
  } catch (error) { return next(error); }
}

async function forgotPassword(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    if (email) {
      const found = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
      if (found.rowCount) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        await pool.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')', [found.rows[0].id, tokenHash]);
        const link = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(rawToken)}`;
        const mailer = configuredMailer();
        if (mailer) {
          try {
            await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: found.rows[0].email, subject: 'Reset your Brightloop password', text: `Use this link within one hour to reset your password: ${link}` });
          } catch (mailError) {
            // Keep the public response identical for known and unknown emails.
            console.error('Password reset email could not be sent:', mailError.message);
          }
        } else {
          console.log(`Password reset link for ${found.rows[0].email}: ${link}`);
        }
      }
    }
    return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) { return next(error); }
}

async function resetPassword(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    const { token, password } = req.body;
    if (typeof token !== 'string' || !token) return res.status(400).json({ error: 'Reset token is required.' });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await client.query('BEGIN');
    const result = await client.query('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE', [tokenHash]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Reset token is invalid, expired, or already used.' });
    }
    await client.query("UPDATE users SET password_hash = crypt($1, gen_salt('bf', 10)), updated_at = NOW() WHERE id = $2", [password, result.rows[0].user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [result.rows[0].id]);
    await client.query('COMMIT');
    return res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return next(error);
  } finally { if (client) client.release(); }
}

async function me(req, res, next) {
  try {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    if (!result.rowCount) return res.status(401).json({ error: 'User account no longer exists.' });
    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) { return next(error); }
}

async function createStaff(req, res, next) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid email address is required.' });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const result = await pool.query("INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, crypt($3, gen_salt('bf', 10)), 'staff') ON CONFLICT (email) DO NOTHING RETURNING id, name, email, role", [name, email, password]);
    if (!result.rowCount) return res.status(409).json({ error: 'An account with this email already exists.' });
    return res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (error) { return next(error); }
}

module.exports = { signup, login, forgotPassword, resetPassword, me, createStaff };
