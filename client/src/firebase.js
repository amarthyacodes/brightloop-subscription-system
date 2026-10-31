import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB3FyIe51GBEsYADJRVppdIlh_DCS67D6Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "brightloop-fcc62.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "brightloop-fcc62",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "brightloop-fcc62.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "316232789462",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:316232789462:web:0c51b5734c1ac6a9288877",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);
