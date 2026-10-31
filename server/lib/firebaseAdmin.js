const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function firebaseAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'brightloop-fcc62';
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
  return getAuth(app);
}

module.exports = { firebaseAuth };
