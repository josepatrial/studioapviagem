// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Log the environment variables *before* using them
console.log("Attempting to read Firebase config from environment variables:");
console.log("NEXT_PUBLIC_FIREBASE_API_KEY:", process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'Exists' : 'MISSING or undefined');
console.log("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? 'Exists' : 'MISSING or undefined');
console.log("NEXT_PUBLIC_FIREBASE_PROJECT_ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'Exists' : 'MISSING or undefined');
console.log("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? 'Exists' : 'MISSING or undefined');
console.log("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:", process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? 'Exists' : 'MISSING or undefined');
console.log("NEXT_PUBLIC_FIREBASE_APP_ID:", process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? 'Exists' : 'MISSING or undefined');
console.log("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:", process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ? 'Exists' : 'MISSING or undefined (Optional)');


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
        const envVarName = `NEXT_PUBLIC_FIREBASE_${key.toUpperCase()}`;
        // Check for undefined, null, empty string, placeholder values
        if (!value || typeof value !== 'string' || value.trim() === '' || value.includes('YOUR_') || value.includes('placeholder') || value === '[DEFAULT]') {
             console.error(`Firebase config validation error: ${envVarName} is missing, invalid, or a placeholder. Value received: "${value}". Check your .env file.`);
             missingOrInvalidKeys.push(envVarName);
             isValid = false;
             // Don't break, log all missing/invalid keys
        }
    }

    if (!isValid) {
      console.error("Firebase config validation FAILED.");
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

try {
  console.log("Attempting Firebase initialization...");

  // **CRITICAL STEP: Validate configuration *before* initializing**
  const { isValid, missingOrInvalidKeys } = validateFirebaseConfig(firebaseConfig);

  if (!isValid) {
     const errorMessage = `Firebase configuration is invalid. The following keys are missing or invalid in your .env file: ${missingOrInvalidKeys.join(', ')}. Please ensure they are set correctly (with NEXT_PUBLIC_ prefix) and the development server is restarted.`;
     console.error("FATAL:", errorMessage);
     // Throw error *before* attempting initializeApp
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
       console.log("Using existing Firebase app with Project ID:", app.options.projectId);
  }


  // Initialize Firebase services only after successful app initialization/retrieval
  console.log("Initializing Firebase services (Auth, Firestore, Storage)...");
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  console.log("Firebase services initialized.");

} catch (error) {
  console.error("CRITICAL: Firebase initialization failed:", error instanceof Error ? error.message : error);
  // Throwing the error here will halt the application and make the configuration issue very clear.
  const detailedError = `Could not initialize Firebase. Please check the console logs for configuration errors (especially missing or invalid keys in .env starting with NEXT_PUBLIC_) and ensure your .env file is correct and the server was restarted. Original Error: ${(error as Error).message}`;
  console.error("DETAILED ERROR:", detailedError);
  // Ensure services are null if initialization fails
  app = null;
  auth = null;
  db = null;
  storage = null;
  throw new Error(detailedError); // Re-throw the error to make it visible
}


export { app, auth, db, storage };
