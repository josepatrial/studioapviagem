// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'; // Import enableIndexedDbPersistence
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

// Initialize Firebase App
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;
let persistenceEnabledPromise: Promise<void> | null = null;

const DATABASE_ID = "rotacerta2";

try {
  // Basic validation
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY" || firebaseConfig.apiKey.includes("placeholder")) {
      console.warn("Firebase API Key is missing or is still the placeholder value. Please check your .env file and ensure NEXT_PUBLIC_FIREBASE_API_KEY is set correctly. App might not function correctly with Firebase services.");
  }

  if (getApps().length === 0) {
      console.log("Initializing new Firebase app...");
      app = initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully with Project ID:", firebaseConfig.projectId);
  } else {
      console.log("Firebase app already initialized, getting existing app.");
      app = getApp();
      console.log("Using existing Firebase app with Project ID:", app.options.projectId);
  }

  console.log(`Initializing Firebase services (Auth, Firestore [DB: ${DATABASE_ID}], Storage)...`);
  auth = getAuth(app);
  db = getFirestore(app, DATABASE_ID);
  storage = getStorage(app);
  console.log(`Firebase services initialized. Firestore connected to database: ${DATABASE_ID}`);

  if (typeof window !== 'undefined' && db) {
    console.log(`Attempting to enable Firestore persistence for database: ${DATABASE_ID}...`);
    // Use enableIndexedDbPersistence for Firebase v9+
    persistenceEnabledPromise = enableIndexedDbPersistence(db, { synchronizeTabs: true })
      .then(() => {
        console.log(`Firebase Firestore persistence enabled successfully for database: ${DATABASE_ID} with IndexedDB and synchronizeTabs.`);
      })
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn(`Offline persistence for ${DATABASE_ID} failed (failed-precondition): Multiple tabs open, or persistence already enabled in another tab.`);
        } else if (err.code === 'unimplemented') {
          console.warn(`Offline persistence for ${DATABASE_ID} failed (unimplemented): Browser does not support required features.`);
        } else {
          console.error(`Offline persistence for ${DATABASE_ID} failed with error:`, err);
        }
        // Even if persistence fails to enable, don't let it block app initialization
        // but the promise will be rejected if specific handling is needed elsewhere.
        // For now, we resolve it to allow app to continue, but log the error.
        return Promise.reject(err); // Or Promise.resolve() if you want to ignore persistence errors for app startup
      });
  } else {
    if (typeof window === 'undefined') {
      console.warn("Running in a non-browser environment, Firestore persistence is skipped.");
    } else if (!db) {
      console.error(`Firestore DB instance for ${DATABASE_ID} is null, cannot configure persistence.`);
    }
    persistenceEnabledPromise = Promise.resolve(); // Resolve if persistence is not applicable or db is null
  }

} catch (error) {
  console.error("CRITICAL: Firebase initialization failed:", error instanceof Error ? error.message : error);
  const detailedError = `Could not initialize Firebase. Please check the console logs for configuration errors (especially missing or invalid keys in .env starting with NEXT_PUBLIC_) and ensure your .env file is correct and the server was restarted. Original Error: ${(error as Error).message}`;
  console.error("DETAILED ERROR:", detailedError);
  app = null;
  auth = null;
  db = null;
  storage = null;
  persistenceEnabledPromise = Promise.reject(new Error(detailedError)); // Ensure promise is rejected on critical failure
}

export { app, auth, db, storage, persistenceEnabledPromise };
