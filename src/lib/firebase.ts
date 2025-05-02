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
    const missingOrInvalidKeys: string[] = [];

    for (const key of requiredKeys) {
        const value = config[key];
        // Check for undefined, null, empty string, placeholder values
        if (!value || typeof value !== 'string' || value.trim() === '' || value.includes('YOUR_') || value.includes('placeholder')) {
             console.error(`Firebase config error: NEXT_PUBLIC_FIREBASE_${key.toUpperCase()} is missing, invalid, or a placeholder. Value: "${value}". Check your .env file.`);
             missingOrInvalidKeys.push(`NEXT_PUBLIC_FIREBASE_${key.toUpperCase()}`);
             isValid = false;
             // Don't break, log all missing/invalid keys
        }
    }

    if (!isValid) {
      // Throw a more specific error if validation fails
      throw new Error(`Firebase configuration is invalid. The following keys are missing or invalid in your .env file: ${missingOrInvalidKeys.join(', ')}. Please ensure they are set correctly and the development server is restarted.`);
    }
    return isValid;
}

// Initialize Firebase App
let app: FirebaseApp;
let auth: ReturnType<typeof getAuth>;
let db: ReturnType<typeof getFirestore>;
let storage: ReturnType<typeof getStorage>;

try {
  // Validate configuration *before* initializing
  validateFirebaseConfig(firebaseConfig);

  // Check if Firebase app is already initialized
  if (getApps().length === 0) {
      console.log("Initializing Firebase app...");
      app = initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully with Project ID:", firebaseConfig.projectId);
  } else {
      console.log("Firebase app already initialized.");
      app = getApp();
  }


  // Initialize Firebase services only after successful app initialization/retrieval
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

} catch (error) {
  console.error("CRITICAL: Firebase initialization failed:", error instanceof Error ? error.message : error);
  // Throwing the error here will halt the application and make the configuration issue very clear.
  // This is generally preferred for essential services like Firebase Auth/Firestore.
  throw new Error(`Could not initialize Firebase. Please check the console logs for configuration errors and ensure your .env file is correct. Error: ${(error as Error).message}`);
}


export { app, auth, db, storage };
