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
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Include measurementId if available/needed
};

// Basic validation (optional, but helpful for debugging)
if (!firebaseConfig.apiKey) { // Check if API key is actually missing
    console.error("Firebase API Key is missing. Please check your .env file and ensure NEXT_PUBLIC_FIREBASE_API_KEY is set correctly.");
    // Optional: Throw an error to prevent app initialization if the key is critical and missing
    // throw new Error("Firebase API Key is missing. Application cannot start.");
}
// Add similar checks for other critical keys like projectId if desired.
if (!firebaseConfig.projectId) {
    console.error("Firebase Project ID is missing. Please check your .env file and ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID is set correctly.");
}


// Initialize Firebase
let app;
try {
    // Check if all necessary config values are present before initializing
    if (
        !firebaseConfig.apiKey ||
        !firebaseConfig.authDomain ||
        !firebaseConfig.projectId ||
        !firebaseConfig.storageBucket ||
        !firebaseConfig.messagingSenderId ||
        !firebaseConfig.appId
    ) {
        throw new Error("One or more Firebase configuration values are missing in .env file.");
    }
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    console.log("Firebase initialized successfully with Project ID:", firebaseConfig.projectId);
} catch (error) {
    console.error("Firebase initialization failed:", error);
    // Optionally, you could re-throw the error or handle it differently
    throw new Error("Could not initialize Firebase. Please check your configuration in .env and ensure all NEXT_PUBLIC_FIREBASE_ variables are correctly set.");
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
