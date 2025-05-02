// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Ensure environment variables are correctly prefixed with NEXT_PUBLIC_
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Function to check if config values are present and valid
const validateFirebaseConfig = (config: typeof firebaseConfig): boolean => {
    const requiredKeys: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    let isValid = true;

    for (const key of requiredKeys) {
        const value = config[key];
        if (!value || value.includes('YOUR_') || value.includes('placeholder')) {
             console.error(`Firebase config error: ${key} is missing, invalid, or a placeholder. Check your .env file.`);
             isValid = false;
             // Don't break, log all missing/invalid keys
        }
    }
    return isValid;
}

// Initialize Firebase App
let app: FirebaseApp;
try {
  if (!validateFirebaseConfig(firebaseConfig)) {
      throw new Error("Firebase configuration is invalid or incomplete. Check console logs and your .env file.");
  }
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  console.log("Firebase initialized successfully with Project ID:", firebaseConfig.projectId);

} catch (error) {
  console.error("CRITICAL: Firebase initialization failed:", error);
  // Depending on the app's needs, you might want to throw here to halt execution
  // or allow the app to run in a degraded state (Firebase features won't work).
  // For this app, authentication is crucial, so throwing might be appropriate.
  throw new Error(`Could not initialize Firebase. Error: ${(error as Error).message}`);
}

// Initialize Firebase services only if app initialization was successful
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
