// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Ensure environment variables are correctly prefixed with NEXT_PUBLIC_
// The values MUST be set in your .env or .env.local file
// IMPORTANT: Replace the placeholder values in your .env file with your actual Firebase project credentials.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Basic validation removed as Firebase SDK handles invalid config errors effectively.
// The console error was just confirming the SDK's error.

// Initialize Firebase
let app;
try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
    console.error("Firebase initialization failed:", error);
    // Optionally, you could re-throw the error or handle it differently
    throw new Error("Could not initialize Firebase. Please check your configuration in .env.");
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
