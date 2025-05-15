// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'; // Keep enableIndexedDbPersistence
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
let db: ReturnType<typeof getFirestore> | null = null; // Ensure db can be null initially
let storage: ReturnType<typeof getStorage> | null = null;
let persistenceEnabledPromise: Promise<void> | null = null;

const DATABASE_ID = "rotacerta2"; // Specify the database ID from the screenshot

try {
  // Basic validation (optional, but helpful for debugging)
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY" || firebaseConfig.apiKey.includes("placeholder")) {
      console.warn("Firebase API Key is missing or is still the placeholder value. Please check your .env file and ensure NEXT_PUBLIC_FIREBASE_API_KEY is set correctly. App might not function correctly with Firebase services.");
  }

  // Check if Firebase app is already initialized
  if (getApps().length === 0) {
      console.log("Initializing new Firebase app...");
      app = initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully with Project ID:", firebaseConfig.projectId);
  } else {
      console.log("Firebase app already initialized, getting existing app.");
      app = getApp();
       console.log("Using existing Firebase app with Project ID:", app.options.projectId);
  }


  // Initialize Firebase services only after successful app initialization/retrieval
  console.log(`Initializing Firebase services (Auth, Firestore [DB: ${DATABASE_ID}], Storage)...`);
  auth = getAuth(app);
  db = getFirestore(app, DATABASE_ID); // Use the specific database ID
  storage = getStorage(app);
  console.log(`Firebase services initialized. Firestore connected to database: ${DATABASE_ID}`);

  // Enable offline persistence only after db is initialized
  if (db) {
    persistenceEnabledPromise = enableIndexedDbPersistence(db)
      .then(() => {
        console.log(`Firebase Firestore persistence enabled successfully for database: ${DATABASE_ID}.`);
      })
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn(`Firestore persistence failed for database ${DATABASE_ID} (multiple tabs open or other issue).`);
        } else if (err.code === 'unimplemented') {
          console.warn(`Firestore persistence is not available in this browser for database ${DATABASE_ID}.`);
        } else {
          console.error(`Error enabling Firestore persistence for database ${DATABASE_ID}:`, err);
        }
      });
  } else {
    console.error(`Firestore DB instance for ${DATABASE_ID} is null, cannot enable persistence.`);
    persistenceEnabledPromise = Promise.reject(new Error(`Firestore DB instance for ${DATABASE_ID} is null`));
  }

} catch (error) {
  console.error("CRITICAL: Firebase initialization failed:", error instanceof Error ? error.message : error);
  const detailedError = `Could not initialize Firebase. Please check the console logs for configuration errors (especially missing or invalid keys in .env starting with NEXT_PUBLIC_) and ensure your .env file is correct and the server was restarted. Original Error: ${(error as Error).message}`;
  console.error("DETAILED ERROR:", detailedError);
  app = null;
  auth = null;
  db = null;
  storage = null;
  persistenceEnabledPromise = Promise.reject(new Error(detailedError));
}

export { app, auth, db, storage, persistenceEnabledPromise };
