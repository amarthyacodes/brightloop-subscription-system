const { afterEach, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const firebaseAdmin = require('../lib/firebaseAdmin');
let createdFirebaseProfile;
firebaseAdmin.firebaseAuth = () => ({
  verifyIdToken: async (idToken) => ({ uid: 'firebase-user-1', email: idToken === 'mismatch-token' ? 'other@example.com' : 'invited@example.com' }),
  getUser: async () => ({ customClaims: {} }),
  getUserByEmail: async () => { const error = new Error('User not found.'); error.code = 'auth/user-not-found'; throw error; },
  createUser: async ({ email }) => ({ uid: 'new-worker-uid', email }),
  deleteUser: async () => {},
  updateUser: async () => {},
  setCustomUserClaims: async () => {},
});
firebaseAdmin.firebaseDb = () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false }), set: async () => {}, create: async (value) => { createdFirebaseProfile = value; }, delete: async () => {}, update: async () => {} }) }) });
const auth = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
const originalQuery = pool.query;
const originalConnect = pool.connect;
const originalLog = console.log;
const originalFirebaseDb = firebaseAdmin.firebaseDb;

function response() {
  return {
    statusCode: 200,
    body: null,
    cookieValue: null,
    cookieConfig: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(_name, value, config) { this.cookieValue = value; this.cookieConfig = config; return this; },
    clearCookie() {},
  };
}

function user(role = 'customer', active = true) {
  return { id: '42', name: 'Taylor Example', email: 'taylor@example.com', role, is_active: active };
}

beforeEach(() => {
  pool.query = async () => ({ rowCount: 1, rows: [] });
  pool.connect = async () => ({ query: async () => ({ rowCount: 0, rows: [] }), release() {} });
  console.log = () => {};
});

afterEach(() => {
  pool.query = originalQuery;
  pool.connect = originalConnect;
  console.log = originalLog;
  firebaseAdmin.firebaseDb = originalFirebaseDb;
});

test('customer signup always assigns the customer role and starts a session', async () => {
  let insertSql = '';
  pool.query = async (sql) => {
    if (sql.includes('INSERT INTO users')) {
      insertSql = sql;
      return { rowCount: 1, rows: [user('customer')] };
    }
    return { rowCount: 1, rows: [] };
  };
  const res = response();
  await auth.signup({ body: { name: 'Taylor Example', email: 'Taylor@Example.com', password: 'SecurePass!9', role: 'admin' } }, res, assert.fail);
  assert.match(insertSql, /'customer'/);
  assert.doesNotMatch(insertSql, /\$4/);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, 'CUSTOMER');
  assert.equal(res.cookieConfig.httpOnly, true);
  assert.equal(res.cookieConfig.sameSite, 'strict');
});

test('signup validates password strength and rejects duplicate email addresses', async (t) => {
  await t.test('weak password', async () => {
    let queried = false;
    pool.query = async () => { queried = true; return { rowCount: 0, rows: [] }; };
    const res = response();
    await auth.signup({ body: { name: 'Taylor', email: 'taylor@example.com', password: 'weak' } }, res, assert.fail);
    assert.equal(res.statusCode, 400);
    assert.equal(queried, false);
  });

  await t.test('duplicate account', async () => {
    pool.query = async (sql) => sql.startsWith('INSERT INTO users')
      ? { rowCount: 0, rows: [] }
      : { rowCount: 1, rows: [] };
    const res = response();
    await auth.signup({ body: { name: 'Taylor', email: 'taylor@example.com', password: 'SecurePass!9' } }, res, assert.fail);
    assert.equal(res.statusCode, 409);
  });
});

test('login uses the stored role and rejects inactive or incorrect accounts generically', async (t) => {
  await t.test('success', async () => {
    pool.query = async (sql) => sql.startsWith('SELECT')
      ? { rowCount: 1, rows: [user('staff')] }
      : { rowCount: 1, rows: [] };
    const res = response();
    await auth.login({ body: { email: 'taylor@example.com', password: 'SecurePass!9', role: 'admin', remember: false } }, res, assert.fail);
    assert.equal(res.body.user.role, 'STAFF');
    assert.equal(res.cookieValue.split('.').length, 3);
    assert.equal(jwt.verify(res.cookieValue, process.env.JWT_SECRET).sid.length > 0, true);
    assert.equal(res.cookieConfig.maxAge, undefined);
  });

  await t.test('inactive account', async () => {
    pool.query = async (sql) => sql.startsWith('SELECT')
      ? { rowCount: 1, rows: [user('customer', false)] }
      : { rowCount: 1, rows: [] };
    const res = response();
    await auth.login({ body: { email: 'taylor@example.com', password: 'SecurePass!9' } }, res, assert.fail);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Email or password is incorrect.');
    assert.equal(res.cookieValue, null);
  });

  await t.test('unknown account', async () => {
    pool.query = async () => ({ rowCount: 0, rows: [] });
    const res = response();
    await auth.login({ body: { email: 'unknown@example.com', password: 'incorrect' } }, res, assert.fail);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Email or password is incorrect.');
  });
});

test('staff signup rejects an invitation whose email does not match', async () => {
  const queries = [];
  pool.connect = async () => ({
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT')) return { rowCount: 1, rows: [{ email: 'invited@example.com' }] };
      return { rowCount: 0, rows: [] };
    },
    release() {},
  });
  const res = response();
  await auth.signupStaff({ body: { name: 'Taylor', idToken: 'mismatch-token', token: 'invite-token' } }, res, assert.fail);
  assert.equal(res.statusCode, 400);
  assert.equal(queries.some((sql) => sql.startsWith('INSERT INTO users')), false);
  assert.ok(queries.includes('ROLLBACK'));
});

test('a valid staff invitation creates a staff account and marks the invitation used', async () => {
  const queries = [];
  pool.connect = async () => ({
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT')) return { rowCount: 1, rows: [{ id: '8', email: 'invited@example.com' }] };
      if (sql.startsWith('INSERT INTO users')) return { rowCount: 1, rows: [user('staff')] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  });
  const res = response();
  await auth.signupStaff({ body: { name: 'Taylor', idToken: 'matching-token', token: 'invite-token' } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, 'STAFF');
  assert.ok(queries.some((sql) => sql.startsWith('UPDATE staff_invitations SET used_at')));
  assert.ok(queries.includes('COMMIT'));
});

test('role middleware blocks staff from admin-only endpoints', () => {
  const res = response();
  let advanced = false;
  requireRole('admin')({ user: { role: 'staff' } }, res, () => { advanced = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(advanced, false);
  const customerResponse = response();
  requireRole('staff')({ user: { role: 'customer' } }, customerResponse, () => { advanced = true; });
  assert.equal(customerResponse.statusCode, 403);
});

test('admin invitation stores only a token hash and returns a seven-day invite link', async () => {
  const statements = [];
  pool.query = async (sql, params) => {
    statements.push({ sql, params });
    if (sql.startsWith('SELECT 1 FROM users')) return { rowCount: 0, rows: [] };
    if (sql.startsWith('INSERT INTO staff_invitations')) return { rowCount: 1, rows: [] };
    return { rowCount: 1, rows: [] };
  };
  const res = response();
  await auth.inviteStaff({ body: { name: 'Invited Staff', email: 'newstaff@example.com' }, user: { id: '42', role: 'admin' } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.match(res.body.invitation.link, /\/signup\/staff\?token=/);
  assert.equal(res.body.invitation.expiresInDays, 7);
  const insert = statements.find(({ sql }) => sql.startsWith('INSERT INTO staff_invitations'));
  assert.notEqual(insert.params[2], new URL(res.body.invitation.link).searchParams.get('token'));
  assert.match(insert.params[2], /^[a-f0-9]{64}$/);
  assert.equal(insert.params[3], '42');
});

test('admin worker creation provisions Firebase and Firestore without persisting the temporary password', async () => {
  createdFirebaseProfile = null;
  pool.query = async (sql) => {
    if (sql.startsWith('SELECT 1 FROM users')) return { rowCount: 0, rows: [] };
    if (sql.startsWith('INSERT INTO users')) return { rowCount: 1, rows: [user('staff')] };
    return { rowCount: 1, rows: [] };
  };
  const res = response();
  await auth.createStaffAccount({ body: { name: 'Taylor Example', email: 'taylor@example.com', phone: '555-0100', jobTitle: 'Support specialist' } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.worker.role, 'STAFF');
  assert.equal(res.body.worker.uid, 'new-worker-uid');
  assert.ok(res.body.temporaryPassword.length >= 20);
  assert.equal(createdFirebaseProfile.role, 'staff');
  assert.equal(createdFirebaseProfile.forcePasswordChange, true);
  assert.equal(JSON.stringify(createdFirebaseProfile).includes(res.body.temporaryPassword), false);
});

test('deactivating staff revokes their server sessions', async () => {
  const statements = [];
  pool.query = async (sql) => {
    statements.push(sql);
    if (sql.startsWith('SELECT id, name, email FROM users')) return { rowCount: 1, rows: [{ id: '42', name: 'Staff', email: 'staff@example.com' }] };
    if (sql.startsWith('UPDATE users')) return { rowCount: 1, rows: [user('staff', false)] };
    return { rowCount: 1, rows: [] };
  };
  const res = response();
  await auth.setStaffStatus({ body: { active: false }, params: { id: '42' } }, res, assert.fail);
  assert.equal(res.body.user.isActive, false);
  assert.ok(statements.some((sql) => sql.startsWith('DELETE FROM user_sessions')));
});

test('session middleware rejects a revoked or inactive database session', async () => {
  const token = jwt.sign({ id: '42', sid: '40fd7c98-c31c-4fc3-8c98-dd8939dc3c4a' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  pool.query = async () => ({ rowCount: 0, rows: [] });
  const res = response();
  let advanced = false;
  await requireAuth({ get: (header) => header === 'cookie' ? `${auth.SESSION_COOKIE}=${token}` : undefined }, res, () => { advanced = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(advanced, false);
});
