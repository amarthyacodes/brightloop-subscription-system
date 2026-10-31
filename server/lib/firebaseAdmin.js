const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

function firebaseApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'brightloop-fcc62';
  return getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
}
function firebaseAuth() { return getAuth(firebaseApp()); }
function firebaseDb() { return getFirestore(firebaseApp()); }

module.exports = { firebaseAuth, firebaseDb };
