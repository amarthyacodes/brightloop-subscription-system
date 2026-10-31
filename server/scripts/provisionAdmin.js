require('dotenv').config();
const crypto = require('node:crypto');
const pool = require('../db/pool');
const { firebaseAuth, firebaseDb } = require('../lib/firebaseAdmin');
const { ADMIN_EMAIL } = require('../config/admin');

async function provisionAdmin() {
  const email = ADMIN_EMAIL;
  let account;
  try {
    account = await firebaseAuth().getUserByEmail(email);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new Error(`No Firebase Authentication account exists for ${email}. Create and verify it in Firebase Console → Authentication → Users, then rerun this command. Set its password in Firebase; the script will not change it.`);
    }
    throw error;
  }
  if (!account.emailVerified) throw new Error(`Verify ${email} in Firebase Authentication before assigning the Admin role.`);

  const name = account.displayName || 'Brightloop Admin';
  const result = await pool.query(
    "INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, crypt($3, gen_salt('bf', 12)), 'admin', TRUE) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = 'admin', is_active = TRUE, updated_at = NOW() RETURNING id",
    [name, email, crypto.randomBytes(48).toString('hex')]
  );
  const auth = firebaseAuth();
  await auth.setCustomUserClaims(account.uid, { ...(account.customClaims || {}), role: 'admin' });
  await firebaseDb().collection('users').doc(account.uid).set({
    uid: account.uid, accountId: String(result.rows[0].id), name, email, role: 'admin', phone: '', accountStatus: 'active',
    createdAt: account.metadata.creationTime || new Date().toISOString(), updatedAt: new Date().toISOString(),
  }, { merge: true });
  const settings = firebaseDb().collection('settings').doc('company');
  if (!(await settings.get()).exists) await settings.set({ companyName: 'Brightloop', adminName: name, adminEmail: email, currency: 'INR', emailNotifications: true, renewalReminders: true });
  console.log(`Admin role provisioned for ${email} (Firebase UID ${account.uid}, account ${result.rows[0].id}). Existing Firebase password was not changed.`);
}

provisionAdmin().catch((error) => {
  console.error(`Admin provisioning failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
