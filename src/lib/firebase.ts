// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore'; // Import enableMultiTabIndexedDbPersistence
import { getStorage } from 'firebase/storage';

// Log the environment variables *before* using them
console.log("Attempting to read Firebase config from environment variables:");
const envKeys: (keyof NodeJS.ProcessEnv)[] = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
];
envKeys.forEach(key => {
  console.log(`${key}:`, process.env[key] ? 'Exists' : 'MISSING or undefined');
});


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

// Log the constructed config object *before* validation
console.log("Constructed firebaseConfig:", firebaseConfig);


// Function to check if config values are present and valid
const validateFirebaseConfig = (config: typeof firebaseConfig): { isValid: boolean; missingOrInvalidKeys: string[] } => {
    console.log("Validating Firebase Config...");
    const requiredKeys: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    let isValid = true;
    const missingOrInvalidKeys: string[] = [];

    for (const key of requiredKeys) {
        const value = config[key];
        const envVarName = `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`; // Convert camelCase to UPPER_SNAKE_CASE for env var name
        // Check for undefined, null, empty string, placeholder values
        if (!value || typeof value !== 'string' || value.trim() === '' || value.includes('YOUR_') || value.includes('placeholder') || value === '[DEFAULT]') {
             console.error(`Firebase config validation error: ${envVarName} is missing, invalid, or a placeholder. Value received: "${value}". Check your .env file.`);
             missingOrInvalidKeys.push(envVarName);
             isValid = false;
             // Don't break, log all missing/invalid keys
        } else {
             console.log(`Firebase config validation: ${envVarName} looks OK.`);
        }
    }

    if (!isValid) {
      console.error("Firebase config validation FAILED. Check the keys listed above.");
    } else {
      console.log("Firebase config validation PASSED.");
    }
    return { isValid, missingOrInvalidKeys };
}

// Initialize Firebase App
let app: FirebaseApp | null = null;
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;
let persistenceEnabledPromise: Promise<void> | null = null; // Promise to track persistence enabling

try {
  console.log("Attempting Firebase initialization...");

  // **CRITICAL STEP: Validate configuration *before* initializing**
  const { isValid, missingOrInvalidKeys } = validateFirebaseConfig(firebaseConfig);

  if (!isValid) {
     const errorMessage = `Firebase configuration is invalid or incomplete. The following keys are missing or invalid in your .env file: ${missingOrInvalidKeys.join(', ')}. Please ensure they are set correctly (with NEXT_PUBLIC_ prefix) and the development server is restarted.`;
     console.error("FATAL: Firebase Initialization Stopped.", errorMessage);
     // Throw error *before* attempting initializeApp to make it clear
     throw new Error(errorMessage);
  }

  // Check if Firebase app is already initialized
  if (getApps().length === 0) {
      console.log("Initializing new Firebase app...");
      // Only initialize if config is valid
      app = initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully with Project ID:", firebaseConfig.projectId);
  } else {
      console.log("Firebase app already initialized, getting existing app.");
      app = getApp();
       console.log("Using existing Firebase app with Project ID:", app?.options?.projectId ?? 'Unknown'); // Add null check for safety
  }


  // Initialize Firebase services only after successful app initialization/retrieval
  if (app) {
    console.log("Initializing Firebase services (Auth, Firestore, Storage)...");
    try {
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        console.log("Firebase services initialized successfully.");

        // Enable Firestore offline persistence
        // Use a promise to ensure persistence is attempted only once and can be awaited
        if (!persistenceEnabledPromise && db) {
            console.log("Attempting to enable Firestore multi-tab persistence...");
            persistenceEnabledPromise = enableMultiTabIndexedDbPersistence(db)
              .then(() => {
                console.log("Firestore multi-tab offline persistence enabled successfully.");
              })
              .catch((err) => {
                // Handle specific errors for persistence
                if (err.code === 'failed-precondition') {
                  console.warn("Firestore persistence failed (failed-precondition): Multiple tabs open or persistence already enabled in another tab.");
                  // Treat as enabled since another tab might have it
                } else if (err.code === 'unimplemented') {
                  console.error("Firestore persistence failed (unimplemented): Browser does not support required features.");
                } else {
                  console.error("Firestore persistence failed with unexpected error:", err);
                }
                // Even if it fails, resolve the promise so dependent code doesn't hang indefinitely
                // The app will work online, but offline capabilities might be limited
              });
        } else if (persistenceEnabledPromise) {
             console.log("Firestore persistence enabling already in progress or completed.");
        } else {
             console.error("Firestore instance (db) is null, cannot enable persistence.");
             // Create a rejected promise to indicate failure if db is null
             persistenceEnabledPromise = Promise.reject(new Error("Firestore DB instance is null"));
        }

    } catch (serviceError: any) {
        console.error("CRITICAL: Error initializing Firebase services:", serviceError.message, serviceError.code);
        // Ensure services are null if their initialization fails
        auth = null;
        db = null;
        storage = null;
        persistenceEnabledPromise = Promise.reject(serviceError); // Indicate failure
        throw new Error(`Failed to initialize Firebase services: ${serviceError.message}`); // Re-throw specific service error
    }
  } else {
      // This case should ideally not be reached if validation passes, but good for safety
      persistenceEnabledPromise = Promise.reject(new Error("Firebase app object is null")); // Indicate failure
      throw new Error("Firebase app object is null after initialization attempt.");
  }

} catch (error: any) { // Catch errors from validation or initialization
  console.error("CRITICAL: Firebase initialization process failed:", error instanceof Error ? error.message : error);
  // Throwing the error here will halt the application and make the configuration issue very clear.
  const detailedError = `Could not initialize Firebase. Please check the console logs above for configuration errors (especially missing or invalid keys in .env starting with NEXT_PUBLIC_) and ensure your .env file is correct and the server was restarted. Original Error: ${(error as Error).message}`;
  console.error("DETAILED ERROR:", detailedError);
  // Ensure services are null if initialization fails
  app = null;
  auth = null;
  db = null;
  storage = null;
  persistenceEnabledPromise = Promise.reject(error); // Indicate failure
  // It's often better to let the error propagate and crash the server during startup
  // for configuration errors, rather than trying to continue in a broken state.
  // throw new Error(detailedError); // Uncomment if you want startup to fail hard on config errors
}


export { app, auth, db, storage, persistenceEnabledPromise }; // Export the promise

