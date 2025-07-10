// firebase-config.js

// Import the necessary functions from the Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, query, getDocs, onSnapshot, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
// This configuration is automatically provided by the environment.
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- App ID ---
// The app ID is also provided by the environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Authentication ---
// This function handles signing the user in.
// It prioritizes the provided auth token, falling back to anonymous sign-in.
const authenticateUser = async () => {
  try {
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
      await signInWithCustomToken(auth, __initial_auth_token);
    } else {
      await signInAnonymously(auth);
    }
  } catch (error) {
    console.error("Authentication Error:", error);
  }
};

// --- Export modules for use in other files ---
export {
  auth,
  db,
  appId,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  getDocs,
  onSnapshot,
  serverTimestamp,
  onAuthStateChanged,
  authenticateUser,
  where
};
