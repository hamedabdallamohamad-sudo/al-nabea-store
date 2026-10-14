import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA_XA_r0veBi-X2DWGr1Vqp18bAIlmDfAo",
  authDomain: "al-nabea-store.firebaseapp.com",
  projectId: "al-nabea-store",
  storageBucket: "al-nabea-store.firebasestorage.app",
  messagingSenderId: "692636153487",
  appId: "1:692636153487:web:5df97538401d49bcd4a2fa"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);