// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateEmail as firebaseUpdateEmail,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateProfile,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth, db, persistenceEnabledPromise } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { getUserData as getFirestoreUserData, setUserData as setFirestoreUserData } from '@/services/firestoreService';
import { doc, setDoc, getDoc, FirestoreError } from 'firebase/firestore';
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser,
    LocalUser as DbUser, // Rename to avoid conflict
    openDB,
    STORE_USERS, // Import STORE_USERS
    getLocalUserByEmail, // Add this import
    initialSeedUsers // Import initial seed users
} from '@/services/localDbService'; // Import local DB functions and STORE_USERS
import { hashPassword, verifyPassword } from '@/lib/passwordUtils'; // Import password utils
import { useCallback } from 'react'; // Import useCallback

// Define user roles
export type UserRole = 'driver' | 'admin';

// Extended User interface including Firebase Auth ID and Firestore data
export interface User extends Omit<DbUser, 'passwordHash'> {} // Exclude passwordHash from the User interface exposed by context

// Separate DriverInfo for component usage (might be redundant if User covers all needs)
export interface DriverInfo extends Omit<User, 'role'>{
    role: 'driver';
    username?: string; // Make username optional if not always present
}

interface AuthContextType {
  user: User | null; // Use the extended User interface
  firebaseUser: FirebaseUser | null; // Keep Firebase user object if needed
  loading: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  signup: (email: string, pass: string, name: string, username?: string, base?: string) => Promise<boolean>;
  logout: () => void;
  updateEmail: (currentPassword: string, newEmail: string) => Promise<boolean>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  updateProfileName: (newName: string) => Promise<boolean>;
  updateBase: (newBase: string) => Promise<boolean>;
  checkLocalLogin: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Helper Function to Create Firestore User Document ---
const createUserDocument = async (userId: string, email: string, name: string, username?: string, base?: string, role: UserRole = 'driver') => {
  const startTime = performance.now();
  console.log(`[createUserDocument ${startTime}] Attempting for UID: ${userId} with role: ${role}`);
  if (!db) {
      console.error(`[createUserDocument ${startTime}] Firestore DB instance is not available.`);
      throw new Error('Firestore not initialized. Cannot create user document.');
  }
  const userDocRef = doc(db, 'users', userId);
  const userData: Partial<Omit<User, 'id' | 'lastLogin'>> = {
    name,
    email,
    username: username || '',
    role: role, // Use the provided role
    base: role === 'admin' ? 'ALL' : (base || ''), // Admins get 'ALL' base, others get provided or empty
  };
  try {
    await setDoc(userDocRef, userData, { merge: true }); // Use merge: true to avoid overwriting existing data if it somehow exists
    const endTime = performance.now();
    console.log(`[createUserDocument ${startTime}] Firestore document created/merged successfully for ${userId} in ${endTime - startTime} ms.`);
  } catch (firestoreError: any) {
    const endTime = performance.now();
    console.error(`[createUserDocument ${startTime}] Error creating/merging Firestore document for ${userId} in ${endTime - startTime} ms:`, firestoreError);
    throw new Error(`Failed to create/merge Firestore user document: ${firestoreError.message}`);
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true); // Start loading true until initial check is done
  const { toast } = useToast();


    // Check local DB for logged-in user on initial load
    const checkLocalLogin = useCallback(async (): Promise<boolean> => {
        const checkLocalStartTime = performance.now();
        console.log(`[checkLocalLogin ${checkLocalStartTime}] Checking local IndexedDB for user...`);
        try {
            // Ensure DB is open before proceeding
            await persistenceEnabledPromise; // Wait for persistence setup (if applicable)
            const dbInstance = await openDB(); // Ensure DB is open

            if (!dbInstance.objectStoreNames.contains(STORE_USERS)) {
                 console.warn(`[checkLocalLogin ${checkLocalStartTime}] User store '${STORE_USERS}' not found. Skipping local check.`);
                 setLoading(false); // If store doesn't exist, we are not loading anymore
                 return false;
             }
            const tx = dbInstance.transaction(STORE_USERS, 'readonly');
            const store = tx.objectStore(STORE_USERS);
            const allUsers = await new Promise<DbUser[]>((resolve, reject) => { // Use DbUser here
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => {
                    console.error(`[checkLocalLogin ${checkLocalStartTime}] Error in getAll request:`, request.error);
                    reject(request.error);
                 }
            });

            await tx.done;

            if (allUsers && allUsers.length > 0) {
                allUsers.sort((a, b) => new Date(b.lastLogin || 0).getTime() - new Date(a.lastLogin || 0).getTime());
                const latestUser = allUsers[0];
                const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
                if (latestUser.lastLogin && new Date(latestUser.lastLogin).getTime() > oneDayAgo) {
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] Found potentially active local user: ${latestUser.id}`);
                    // Exclude passwordHash when setting user state
                    const { passwordHash, ...userToSet } = latestUser;
                    setUser(userToSet);
                    const checkLocalEndTime = performance.now();
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] Completed (found user). Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
                    // Don't set loading false here, let the listener handle it after checking Firebase status
                    // setLoading(false);
                    return true;
                } else {
                     console.log(`[checkLocalLogin ${checkLocalStartTime}] Local user ${latestUser.id} found, but login is too old or timestamp missing. Deleting...`);
                     // Don't delete potentially valid users just because the timestamp is old
                     // await deleteLocalUser(latestUser.id).catch(e => console.error("[checkLocalLogin] Error deleting stale local user:", e));
                }
            } else {
                console.log(`[checkLocalLogin ${checkLocalStartTime}] No local users found.`);
            }

            setUser(null);
            const checkLocalEndTime = performance.now();
            console.log(`[checkLocalLogin ${checkLocalStartTime}] Completed (no user found). Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
             setLoading(false); // Set loading false if no local user is found
            return false;

        } catch (error) {
            console.error(`[checkLocalLogin ${checkLocalStartTime}] Error checking local DB:`, error);
            setUser(null);
            setLoading(false); // Set loading false on error
            const checkLocalEndTime = performance.now();
            console.error(`[checkLocalLogin ${checkLocalStartTime}] Completed with error. Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
            return false;
        }
    }, []); // Keep useCallback dependency array empty


    // Seed initial users into local DB if empty
    useEffect(() => {
        const seedDb = async () => {
            try {
                const dbInstance = await openDB();
                 if (!dbInstance.objectStoreNames.contains(STORE_USERS)) {
                     console.warn("[seedDb] User store not found, cannot seed.");
                     return;
                 }
                const tx = dbInstance.transaction(STORE_USERS, 'readonly');
                const store = tx.objectStore(STORE_USERS);
                const countRequest = store.count();
                const count = await new Promise<number>((resolve, reject) => {
                    countRequest.onsuccess = () => resolve(countRequest.result);
                    countRequest.onerror = () => reject(countRequest.error);
                });

                await tx.done;

                if (count === 0) {
                    console.log("[seedDb] User store is empty, seeding initial users...");
                    const writeTx = dbInstance.transaction(STORE_USERS, 'readwrite');
                    const writeStore = writeTx.objectStore(STORE_USERS);
                    const seedPromises = initialSeedUsers.map(user =>
                        new Promise<void>((resolve, reject) => {
                            const req = writeStore.add(user);
                            req.onsuccess = () => resolve();
                            req.onerror = () => reject(req.error);
                        })
                    );
                    await Promise.all(seedPromises);
                    await writeTx.done;
                    console.log("[seedDb] Initial users seeded successfully.");
                } else {
                    console.log("[seedDb] User store already contains data, skipping seed.");
                }
            } catch (error) {
                console.error("[seedDb] Error seeding initial users:", error);
            }
        };

        seedDb();
    }, []); // Run only once on mount

    // Combined Effect for initial check and Firebase listener
    useEffect(() => {
        const listenerId = Math.random().toString(36).substring(2, 7);
        console.log(`[AuthProvider Effect ${listenerId}] Running initial setup. Setting loading true.`);
        setLoading(true); // Start loading
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;
        let initialLocalCheckDone = false; // Flag to track if initial local check finished

        const setupFirebaseListener = () => {
            console.log(`[AuthProvider Effect ${listenerId}] Setting up auth state listener.`);
            if (!auth) {
              console.error(`[AuthProvider Effect ${listenerId}] Firebase Auth instance not available for listener.`);
              // If initial local check also failed, set loading false here
              if (initialLocalCheckDone && !user) setLoading(false);
              return;
            }

            unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
              const authChangeStartTime = performance.now();
              console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Received FB auth state. isMounted: ${isMounted}, fbUser present: ${!!fbUser}`);
              if (!isMounted) {
                 console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Component unmounted, skipping FB state update.`);
                 return;
              }

              setFirebaseUser(fbUser);

              if (!fbUser) {
                  console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user logged out.`);
                  // Check if a local user is currently set
                  if (user) {
                      console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Clearing local user state due to FB logout.`);
                      setUser(null);
                  }
                  setLoading(false); // Definitively stop loading on logout
              } else {
                   // Firebase user exists, fetch/update local data if needed
                   console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user (${fbUser.uid}) detected. Fetching/Saving local data...`);
                   try {
                       let localUserData = await getLocalUser(fbUser.uid);
                       const nowISO = new Date().toISOString();
                       let firestoreData: User | null = null;

                       // Fetch from Firestore ONLY if local data is missing or potentially stale
                       if (!localUserData || !localUserData.role) {
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId}] User ${fbUser.uid} missing locally or needs role. Fetching from Firestore...`);
                           firestoreData = await getFirestoreUserData(fbUser.uid);
                       }

                       if (firestoreData) { // Data came from Firestore
                            console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Firestore data found for ${fbUser.uid}. Saving locally...`);
                             // Important: Do NOT save password hash from Firestore here
                             const { passwordHash, ...restFirestoreData } = firestoreData as any;
                            localUserData = { ...restFirestoreData, id: fbUser.uid, lastLogin: nowISO };
                            // Fetch existing local user to preserve hash if it exists
                             const existingLocal = await getLocalUser(fbUser.uid);
                             const mergedLocal: DbUser = {
                                 ...localUserData,
                                 // Keep existing hash if it exists, otherwise, it implies Firebase signup without local pw update yet
                                 passwordHash: existingLocal?.passwordHash || ''
                             };
                            await saveLocalUser(mergedLocal);
                       } else if (!localUserData) { // No local data AND no Firestore data
                           console.warn(`[AuthProvider onAuthStateChanged ${listenerId}] No local or Firestore data for ${fbUser.uid}. Creating basic local user. Check signup process.`);
                           // Create a basic local user record, assuming this shouldn't normally happen post-signup
                           const basicLocalUser: DbUser = {
                                id: fbUser.uid,
                                email: fbUser.email || 'unknown@example.com',
                                name: fbUser.displayName || 'Usuário Firebase',
                                role: 'driver', // Default to driver
                                base: '',
                                lastLogin: nowISO,
                                passwordHash: '' // No password hash available
                            };
                            await saveLocalUser(basicLocalUser);
                            localUserData = basicLocalUser; // Use this basic data for the session
                            // Attempt to create Firestore doc in the background
                            createUserDocument(fbUser.uid, basicLocalUser.email, basicLocalUser.name || '', undefined, '', basicLocalUser.role)
                               .catch(err => console.error("[AuthProvider] BG Firestore create failed:", err));
                       } else { // Local data exists
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId}] User ${fbUser.uid} found locally. Updating last login.`);
                           localUserData.lastLogin = nowISO;
                            await saveLocalUser(localUserData); // Save updated lastLogin (preserves hash)
                       }

                       if (isMounted) {
                           // Exclude passwordHash from the context's user state
                           const { passwordHash, ...userToSet } = localUserData;
                           setUser(userToSet);
                       }
                   } catch (error: any) {
                       console.error(`[AuthProvider onAuthStateChanged ${listenerId}] Error fetching/saving user data for ${fbUser.uid}:`, error);
                       if (isMounted) {
                            // Enhanced error message for offline scenario
                            let description = `Não foi possível carregar/salvar dados do usuário.`;
                            if (error.name === 'NetworkError' || error.message?.includes('offline') || error.message?.includes('Failed to fetch')) {
                                description += ' Parece que você está offline.';
                            } else if (error.code === 'unavailable') {
                                description += ' O serviço do Firestore está temporariamente indisponível ou offline.';
                            } else if (error.message) {
                                description += ` Detalhes: ${error.message}`;
                            }
                            toast({ variant: "destructive", title: "Erro Dados Locais/Online", description: description, duration: 9000 });
                       }
                   } finally {
                       if (isMounted) {
                          setLoading(false); // Stop loading AFTER processing FB user
                           const authChangeEndTime = performance.now();
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Finished processing FB user ${fbUser?.uid}. Total time: ${authChangeEndTime - authChangeStartTime} ms.`);
                       }
                   }
              }
            });
        };

         // Record mount time
         (window as any).__authProviderMountTime = performance.now();

        // Run local check first, then setup Firebase listener
        checkLocalLogin().then(localUserFound => {
            initialLocalCheckDone = true; // Mark local check as done
            if (isMounted) {
                console.log(`[AuthProvider Effect ${listenerId}] Local check completed. User found: ${localUserFound}. Setting up Firebase listener.`);
                setupFirebaseListener();
                 console.log(`[AuthProvider Effect ${listenerId}] Waiting for Firebase listener... (Loading is ${loading})`);
            }
        }).catch(err => {
             initialLocalCheckDone = true; // Mark local check as done even on error
             console.error(`[AuthProvider Effect ${listenerId}] Initial checkLocalLogin failed:`, err);
             if (isMounted) {
                 console.log(`[AuthProvider Effect ${listenerId}] Setting up Firebase listener after local check error.`);
                 setupFirebaseListener(); // Still setup listener
             }
        });


        return () => {
            console.log(`[AuthProvider Effect Cleanup ${listenerId}] Unmounting. Unsubscribing from auth state changes.`);
            isMounted = false;
            if (unsubscribe) {
                unsubscribe();
            }
        };
      // Rerun only on mount/unmount
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);


  // --- Authentication Functions ---

   // Login: Try local first, then Firebase, then save/update local user data
   const login = async (email: string, pass: string): Promise<boolean> => {
     const loginStartTime = performance.now();
     console.log(`[AuthProvider Login ${loginStartTime}] Attempting login for email: ${email}`);
     setLoading(true); // Set loading true at the start of login attempt

     try {
          // 1. Attempt Local Login
          console.log(`[AuthProvider Login ${loginStartTime}] Attempting local login check for ${email}...`);
          const localDbUser = await getLocalUserByEmail(email); // Fetch user by email
          if (localDbUser && localDbUser.passwordHash) {
              console.log(`[AuthProvider Login ${loginStartTime}] Local user found for ${email}. Verifying password...`);
              const isPasswordValid = await verifyPassword(pass, localDbUser.passwordHash);
              if (isPasswordValid) {
                  console.log(`[AuthProvider Login ${loginStartTime}] Local password verification successful for ${email}.`);
                  const nowISO = new Date().toISOString();
                  const updatedLocalUser = { ...localDbUser, lastLogin: nowISO };
                  await saveLocalUser(updatedLocalUser); // Update last login

                  // Set user state excluding password hash
                  const { passwordHash, ...userToSet } = updatedLocalUser;
                  setUser(userToSet);
                  setFirebaseUser(null); // Indicate local-only login
                  setLoading(false);
                  const loginEndTime = performance.now();
                  console.log(`[AuthProvider Login ${loginStartTime}] Local login successful for ${email}. Time: ${loginEndTime - loginStartTime} ms.`);
                  toast({ title: "Login Local Bem-sucedido!", description: "Conectado localmente." });
                  return true;
              } else {
                   console.log(`[AuthProvider Login ${loginStartTime}] Local password verification failed for ${email}.`);
                   // Proceed to Firebase login if online
              }
          } else {
               console.log(`[AuthProvider Login ${loginStartTime}] Local user ${email} not found or has no password hash. Proceeding to Firebase login.`);
          }

         // 2. Attempt Firebase Login (Only if online)
         if (!navigator.onLine) {
             console.log(`[AuthProvider Login ${loginStartTime}] Offline. Firebase login skipped.`);
             toast({ variant: "destructive", title: "Offline", description: "Você está offline. Login online indisponível.", duration: 5000 });
             setLoading(false);
             // If local login also failed, return false
             if (!localDbUser || !(await verifyPassword(pass, localDbUser.passwordHash || ''))) {
                 toast({ variant: "destructive", title: "Falha no Login Offline", description: "Credenciais locais inválidas.", duration: 5000 });
                 return false;
             }
             // If local login succeeded earlier, the function already returned true
             return false; // Should not be reached if local login was successful
         }

         if (!auth) {
             console.error(`[AuthProvider Login ${loginStartTime}] Firebase login skipped: Auth instance not available.`);
             toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação online não inicializada.", duration: 9000 });
             setLoading(false);
             return false;
         }

         console.log(`[AuthProvider Login ${loginStartTime}] Attempting Firebase login for ${email}...`);
         const userCredential = await signInWithEmailAndPassword(auth, email, pass);
         const loginEndTime = performance.now();
         console.log(`[AuthProvider Login ${loginStartTime}] signInWithEmailAndPassword successful for ${userCredential.user.email}. Time: ${loginEndTime - loginStartTime} ms. Waiting for onAuthStateChanged...`);
         // Listener will handle state updates
         return true;

     } catch (error: any) {
         const loginEndTime = performance.now();
         console.error(`[AuthProvider Login ${loginStartTime}] Login failed for ${email}. Time: ${loginEndTime - loginStartTime} ms. Error Code: ${error.code}, Message: ${error.message}`);
         let errorMessage = 'Falha no Login. Verifique seu e-mail e senha.';
          if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
              errorMessage = 'E-mail ou senha inválidos.';
          } else if (error.code === 'auth/invalid-email') {
              errorMessage = 'Formato de e-mail inválido.';
          } else if (error.code === 'auth/too-many-requests') {
               errorMessage = 'Muitas tentativas de login falhadas. Tente novamente mais tarde.';
          } else if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Erro de rede ao tentar fazer login online. Verifique sua conexão.';
          } else if (error.code === 'auth/operation-not-allowed') {
                 errorMessage = 'Login com e-mail/senha não está habilitado. Contacte o administrador.';
          } else if (error.code === 'auth/configuration-not-found') {
               errorMessage = 'Erro de configuração do Firebase. Verifique as chaves de API e outras configurações no console.';
               console.error("Firebase Login Error: auth/configuration-not-found. Ensure API keys, etc. are correct in .env AND Firebase console settings.");
           } else if (error.code?.includes('auth/')) {
                errorMessage = `Erro de autenticação (${error.code}). Tente novamente.`;
           }
         toast({
           variant: "destructive",
           title: "Falha no Login",
           description: errorMessage,
           duration: 9000,
         });
         setUser(null);
         setFirebaseUser(null);
         setLoading(false); // Ensure loading stops on failure
         return false;
     }
   };

   // Signup: Create local user with hashed password, then (optional) Firebase user
   const signup = async (email: string, pass: string, name: string, username?: string, base?: string): Promise<boolean> => {
     const signupStartTime = performance.now();
     console.log(`[AuthProvider Signup ${signupStartTime}] Attempting signup for ${email}`);
     setLoading(true);

     // Determine role based on email
     const isAdminUser = email.toLowerCase() === 'admin@grupo2irmaos.com.br';
     const userRole: UserRole = isAdminUser ? 'admin' : 'driver';
     const userBase = isAdminUser ? 'ALL' : (base || ''); // Assign 'ALL' base to admin

     let userId = `local_${email.replace(/[@.]/g, '_')}`; // Generate a local-first ID
     let firebaseUserId: string | undefined = undefined; // Keep track of Firebase ID if created

     try {
         // Check if user already exists locally
         const existingLocalUser = await getLocalUserByEmail(email);
         if (existingLocalUser) {
              toast({ variant: "destructive", title: "Falha no Cadastro", description: "Este e-mail já está cadastrado localmente." });
              setLoading(false);
              return false;
         }

         // 1. Hash the password
         const passwordHash = await hashPassword(pass);
         console.log(`[AuthProvider Signup ${signupStartTime}] Password hashed.`);

         // 2. Create Local User Data (DbUser format)
         const newUserLocalData: DbUser = {
            id: userId, // Use generated local ID initially
            email: email,
            name: name,
            username: username,
            role: userRole,
            base: userBase,
            lastLogin: new Date().toISOString(),
            passwordHash: passwordHash, // Store the hash
         };

         // 3. Save Local User
         await saveLocalUser(newUserLocalData);
         console.log(`[AuthProvider Signup ${signupStartTime}] User saved locally with ID: ${userId}.`);

         // 4. Attempt to Create Firebase User (Optional, but recommended for sync)
         if (auth && navigator.onLine) { // Only try if online and auth is available
             try {
                 console.log(`[AuthProvider Signup ${signupStartTime}] Attempting to create Firebase Auth user...`);
                 const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
                 firebaseUserId = userCredential.user.uid;
                 console.log(`[AuthProvider Signup ${signupStartTime}] FB Auth user created: ${firebaseUserId}. Role: ${userRole}`);

                 // Update local user record with Firebase ID
                 newUserLocalData.id = firebaseUserId; // Change ID to Firebase ID
                 await deleteLocalUser(userId); // Remove the old local-ID record
                 await saveLocalUser(newUserLocalData); // Save record with Firebase ID
                 userId = firebaseUserId; // Update userId variable
                 console.log(`[AuthProvider Signup ${signupStartTime}] Local user record updated with Firebase ID: ${userId}.`);


                 // Update Firebase Auth profile
                 await updateProfile(userCredential.user, { displayName: name });
                 console.log(`[AuthProvider Signup ${signupStartTime}] FB Auth profile updated.`);

                 // Create Firestore document
                 await createUserDocument(firebaseUserId, email, name, username, userBase, userRole);
                 console.log(`[AuthProvider Signup ${signupStartTime}] Firestore document created.`);

                 // Sign out immediately after successful Firebase signup
                 await signOut(auth);
                 console.log(`[AuthProvider Signup ${signupStartTime}] User signed out post-Firebase signup.`);

             } catch (firebaseError: any) {
                  console.warn(`[AuthProvider Signup ${signupStartTime}] Firebase signup/setup failed (User still created locally). Error: ${firebaseError.code}, ${firebaseError.message}`);
                   let fbErrorDesc = "Falha ao criar usuário online. A conta funcionará localmente.";
                    if (firebaseError.code === 'auth/email-already-in-use') {
                       fbErrorDesc = "E-mail já em uso online. A conta local foi criada, mas pode haver conflitos de sincronização.";
                   } else if (firebaseError.code === 'auth/weak-password') {
                       fbErrorDesc = "Senha fraca para cadastro online. Conta local criada.";
                   } else if (firebaseError.code === 'auth/operation-not-allowed') {
                       fbErrorDesc = "Cadastro com email/senha desabilitado no Firebase.";
                   } else if (firebaseError.code === 'auth/invalid-email') {
                       fbErrorDesc = "O formato do e-mail é inválido.";
                   } else if (firebaseError.code === 'auth/configuration-not-found') {
                      fbErrorDesc = 'Erro de configuração do Firebase (auth/configuration-not-found). Verifique as chaves de API e outras configurações.';
                      console.error("Firebase Signup Error: auth/configuration-not-found. Ensure API keys, etc. are correct.");
                    }
                   toast({ variant: "destructive", title: "Aviso Cadastro Online", description: fbErrorDesc, duration: 7000 });
                  // Continue with local signup success
             }
         } else {
             console.log(`[AuthProvider Signup ${signupStartTime}] Skipping Firebase signup (Offline or Auth unavailable). User created locally only.`);
         }

         const signupEndTime = performance.now();
         console.log(`[AuthProvider Signup ${signupStartTime}] Signup process completed successfully in ${signupEndTime - signupStartTime} ms. User ID: ${userId}`);
         toast({ title: 'Cadastro local realizado com sucesso!', description: 'Você já pode fazer login.' });
         return true;

     } catch (error: any) { // Catch errors from hashing or local DB saving
       const signupEndTime = performance.now();
       console.error(`[AuthProvider Signup ${signupStartTime}] Local Signup failed after ${signupEndTime - signupStartTime} ms. Error: `, error);
       let description = `Erro inesperado ao cadastrar localmente: ${error.message || 'Verifique os dados e tente novamente.'}`;
       toast({ variant: "destructive", title: "Falha no Cadastro Local", description, duration: 9000 });
       return false;
     } finally {
         setLoading(false); // Ensure loading stops
     }
   };


  // Logout: Clear local state, sign out from Firebase
  const logout = async () => {
    const logoutStartTime = performance.now();
    console.log(`[AuthProvider Logout ${logoutStartTime}] Attempting logout...`);
    // No need to delete local user data on logout, just clear session
    setLoading(true);
    setUser(null);
    setFirebaseUser(null);

    try {
        if (auth) {
          await signOut(auth);
          console.log(`[AuthProvider Logout ${logoutStartTime}] Firebase signOut successful.`);
        } else {
             console.warn(`[AuthProvider Logout ${logoutStartTime}] Firebase Auth instance not available, skipping Firebase sign out.`);
        }

        const logoutEndTime = performance.now();
        console.log(`[AuthProvider Logout ${logoutStartTime}] Logout complete in ${logoutEndTime - logoutStartTime} ms.`);
        toast({title: "Logout", description: "Você saiu do sistema."})

    } catch (error) {
      const logoutEndTime = performance.now();
      console.error(`[AuthProvider Logout ${logoutStartTime}] Logout failed after ${logoutEndTime - logoutStartTime} ms. Error:`, error);
      toast({ variant: "destructive", title: "Erro no Logout", description: "Não foi possível sair completamente. Tente novamente." });
    } finally {
        setLoading(false);
    }
  };

  // Re-authenticate user helper (Prioritizes Firebase, falls back to local)
  const reauthenticate = async (currentPassword: string): Promise<boolean> => {
      const reauthStartTime = performance.now();
      // Try Firebase reauth first (if user is logged in via Firebase)
      if (auth && firebaseUser && firebaseUser.email) {
          console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Attempting Firebase reauthentication for ${firebaseUser.email}`);
          const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
          try {
              await reauthenticateWithCredential(firebaseUser, credential);
              const reauthEndTime = performance.now();
              console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Firebase Reauthentication successful. Time: ${reauthEndTime - reauthStartTime} ms.`);
              return true;
          } catch (error: any) {
              const reauthEndTime = performance.now();
              console.error(`[AuthProvider Reauthenticate ${reauthStartTime}] Firebase Reauthentication failed after ${reauthEndTime - reauthStartTime} ms. Error: ${error.code}, Message: ${error.message}`);
               if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                   // Fall through to try local check
               } else {
                   let desc = "Erro ao reautenticar online.";
                   if (error.code === 'auth/too-many-requests') desc = 'Muitas tentativas falhadas. Tente novamente mais tarde.';
                   else if (error.code === 'auth/network-request-failed') desc = 'Erro de rede. Verifique sua conexão.';
                   toast({ variant: "destructive", title: "Reautenticação Falhou", description: desc });
                   return false; // Hard fail on other errors
               }
          }
      } else {
          console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] No Firebase user session, attempting local reauthentication...`);
      }

      // Attempt local reauthentication (if user is set in local state)
       if (user) {
           try {
               const localDbUser = await getLocalUserByEmail(user.email);
               if (localDbUser && localDbUser.passwordHash) {
                   const isPasswordValid = await verifyPassword(currentPassword, localDbUser.passwordHash);
                   if (isPasswordValid) {
                        console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Local Reauthentication successful.`);
                        return true;
                   } else {
                        console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Local Reauthentication failed (password mismatch).`);
                   }
               } else {
                   console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Local user or password hash not found for local reauthentication.`);
               }
           } catch (localError) {
                console.error(`[AuthProvider Reauthenticate ${reauthStartTime}] Error during local reauthentication check:`, localError);
           }
       }


       // If both Firebase and local checks failed or weren't applicable
       toast({ variant: "destructive", title: "Autenticação Falhou", description: "Senha atual incorreta." });
       return false;
  };


  // Update Email: Update Firebase Auth, Firestore, and Local DB
    const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
        const updateEmailStartTime = performance.now();
        console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempting to update email to ${newEmail}`);
        if (!user) { // Check local user state first
            console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Failed: User not logged in.`);
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
            return false;
        }
        setLoading(true);

        const isAuthenticated = await reauthenticate(currentPassword);
        if (!isAuthenticated) {
            setLoading(false);
            return false;
        }

        let originalEmail = user.email; // Store original email for potential rollback
        let firebaseAuthUpdated = false;
        let currentDbUser = null; // To store the DbUser for rollback

        try {
             // Get current full local user data (including hash) for potential rollback
             currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) throw new Error("Current local user data not found for email update.");

            // Update Local DB First (Optimistic for local state)
            const updatedLocalUser = { ...user, email: newEmail };
            const updatedDbUser: DbUser = { ...currentDbUser, email: newEmail, lastLogin: new Date().toISOString() };
            await saveLocalUser(updatedDbUser);
            console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Local DB email updated.`);
            setUser(updatedLocalUser); // Update context state

             // Update Firebase Auth (if applicable)
            if (auth && firebaseUser) {
                 try {
                     await firebaseUpdateEmail(firebaseUser, newEmail);
                     firebaseAuthUpdated = true;
                     console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email updated.`);
                 } catch (authError: any) {
                     console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email update failed. Rolling back local changes...`, authError);
                      // Rollback local changes
                      setUser({ ...user, email: originalEmail });
                      await saveLocalUser(currentDbUser); // Revert DB using the fetched original DbUser

                     let desc = "Não foi possível atualizar o e-mail online.";
                      if (authError.code === 'auth/email-already-in-use') desc = "Este e-mail já está em uso por outra conta.";
                      else if (authError.code === 'auth/invalid-email') desc = "O formato do novo e-mail é inválido.";
                      else if (authError.code === 'auth/requires-recent-login') desc = 'Esta operação requer login online recente. Tente fazer logout e login novamente.';
                     toast({ variant: "destructive", title: "Falha", description: desc });
                     setLoading(false);
                     return false;
                 }
            } else {
                 console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Skipping Firebase Auth email update (user logged in locally or auth unavailable).`);
            }


            // Update Firestore (if online and db available)
             if (db && navigator.onLine) {
                 try {
                    await setFirestoreUserData(user.id, { email: newEmail });
                    console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore email updated.`);
                 } catch (firestoreError) {
                      console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Failed to update Firestore email, proceeding with local update:`, firestoreError);
                      // Mark local record for sync? (Handled by SyncProvider if status is 'pending')
                 }
            } else {
                 console.warn(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
            }

            toast({ title: "Sucesso", description: "E-mail atualizado." });
            const updateEmailEndTime = performance.now();
            console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update process completed. Total time: ${updateEmailEndTime - updateEmailStartTime} ms.`);
            return true;
        } catch (error: any) { // Catch errors from local DB operations
            const updateEmailEndTime = performance.now();
            console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Local DB Email update failed after ${updateEmailEndTime - updateEmailStartTime} ms. Error: `, error);
             // Attempt to rollback Firebase Auth change if it happened
             if (firebaseAuthUpdated && auth && firebaseUser) {
                 console.warn(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempting to rollback Firebase Auth email change due to local error...`);
                 try {
                     await firebaseUpdateEmail(firebaseUser, originalEmail);
                 } catch (rollbackError) {
                     console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email rollback FAILED:`, rollbackError);
                 }
             }
              // Revert local state if it was changed, and revert local DB if possible
             setUser({ ...user, email: originalEmail });
             if (currentDbUser) { // Ensure we have the original DbUser data before trying to revert
                 await saveLocalUser(currentDbUser).catch(dbRollbackError => {
                     console.error(`[AuthProvider UpdateEmail ${updateEmailEndTime}] CRITICAL: Failed to rollback local DB change after error:`, dbRollbackError);
                 });
             }
            toast({ variant: "destructive", title: "Falha Local", description: "Não foi possível salvar a alteração do e-mail localmente." });
            return false;
        } finally {
            setLoading(false);
        }
    };


  // Update Password
  const updatePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
      const updatePassStartTime = performance.now();
      console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Attempting password update.`);
      if (!user) { // Check local user state
          console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Failed: User not logged in.`);
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
          return false;
      }
      setLoading(true);

      const isAuthenticated = await reauthenticate(currentPassword);
      if (!isAuthenticated) {
          setLoading(false);
          return false;
      }

      try {
           // 1. Hash the new password
           const newPasswordHash = await hashPassword(newPassword);
           console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] New password hashed.`);

           // 2. Update Firebase Auth password first (if applicable)
           let firebaseAuthUpdated = false;
           if (auth && firebaseUser) {
               try {
                    await firebaseUpdatePassword(firebaseUser, newPassword);
                    firebaseAuthUpdated = true;
                    console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Firebase Auth password updated.`);
               } catch (authError: any) {
                     const updatePassEndTime = performance.now();
                     console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Firebase Password update failed after ${updatePassEndTime - updatePassStartTime} ms. Error: ${authError.code}, Message: ${authError.message}`);
                     let desc = "Não foi possível atualizar a senha online.";
                     if (authError.code === 'auth/weak-password') desc = "A nova senha é muito fraca (mínimo 6 caracteres).";
                     else if (authError.code === 'auth/requires-recent-login') desc = 'Esta operação requer login online recente. Faça logout e login novamente.';
                     toast({ variant: "destructive", title: "Falha", description: desc });
                     setLoading(false);
                     return false;
               }
           } else {
               console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Skipping Firebase Auth password update (user logged in locally or auth unavailable).`);
           }

           // 3. Update local password hash
           const currentDbUser = await getLocalUser(user.id);
           if (!currentDbUser) throw new Error("Current local user data not found for password update.");
           const updatedDbUser: DbUser = { ...currentDbUser, passwordHash: newPasswordHash, lastLogin: new Date().toISOString() }; // Update hash and maybe lastLogin
           await saveLocalUser(updatedDbUser);
           console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Local password hash updated.`);

           // No context state change needed for password

           toast({ title: "Sucesso", description: "Senha atualizada." });
           const updatePassEndTime = performance.now();
           console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update process completed. Total time: ${updatePassEndTime - updatePassStartTime} ms.`);
           return true;
      } catch (error: any) {
           const updatePassEndTime = performance.now();
           console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update failed after ${updatePassEndTime - updatePassStartTime} ms. Error:`, error);
           // Attempt to rollback Firebase Auth change? Very difficult and potentially risky.
           toast({ variant: "destructive", title: "Falha", description: "Erro inesperado ao atualizar senha localmente." });
           return false;
      } finally {
          setLoading(false);
      }
  };

  // Update Profile Name: Update Firebase Auth, Firestore, and Local DB
    const updateProfileName = async (newName: string): Promise<boolean> => {
        const updateNameStartTime = performance.now();
         console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Attempting name update to ${newName}.`);
         if (!user) { // Check local user
            console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Failed: User not logged in.`);
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
            return false;
        }
         if (!newName.trim()) {
             toast({ variant: "destructive", title: "Erro", description: "Nome não pode ser vazio." });
             return false;
         }
        setLoading(true);
        const originalName = user.name; // For potential rollback
        let currentDbUser = null; // For potential DB rollback

        try {
             // Fetch current DbUser
             currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) throw new Error("Current local user data not found for name update.");

             // Update Local DB First
             const updatedDbUser: DbUser = { ...currentDbUser, name: newName, lastLogin: new Date().toISOString() };
             await saveLocalUser(updatedDbUser);
             console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Local DB name updated.`);
             // Update context state optimistically
             setUser({ ...user, name: newName });

             // Update Firebase Auth Profile (if applicable)
             if (auth && firebaseUser) {
                 try {
                      await updateProfile(firebaseUser, { displayName: newName });
                      console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firebase Auth name updated.`);
                 } catch (authError: any) {
                     console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Firebase Auth name update failed (non-critical):`, authError);
                     // Non-critical error, proceed with local/Firestore update
                 }
            } else {
                 console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Skipping Firebase Auth name update.`);
            }


            // Update Firestore (if online and db available)
            if (db && navigator.onLine) {
                try {
                    await setFirestoreUserData(user.id, { name: newName });
                    console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore name updated.`);
                } catch (firestoreError) {
                     console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Failed to update Firestore name, proceeding with local update:`, firestoreError);
                     // Mark local record for sync?
                }
            } else {
                 console.warn(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
            }

            toast({ title: "Sucesso", description: "Nome atualizado." });
             const updateNameEndTime = performance.now();
            console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Name update successful. Total time: ${updateNameEndTime - updateNameStartTime} ms.`);
            return true;
        } catch (error: any) { // Catch local DB errors
             const updateNameEndTime = performance.now();
             console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Local DB Name update failed after ${updateNameEndTime - updateNameStartTime} ms. Error:`, error);
              // Rollback local state
              setUser({ ...user, name: originalName });
              // Rollback local DB
               if (currentDbUser) {
                   await saveLocalUser(currentDbUser).catch(dbRollbackError => {
                       console.error(`[AuthProvider UpdateName ${updateNameEndTime}] CRITICAL: Failed to rollback local DB change after error:`, dbRollbackError);
                   });
               }
             toast({ variant: "destructive", title: "Falha Local", description: "Não foi possível salvar a alteração do nome localmente." });
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Update Base: Update Firestore and Local DB
    const updateBase = async (newBase: string): Promise<boolean> => {
        const updateBaseStartTime = performance.now();
        console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Attempting base update to ${newBase}.`);
        if (!user) {
            console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Failed: User not logged in.`);
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
            setLoading(false);
            return false;
        }
         // Admin 'ALL' base should not be changed via profile
         if (user.role === 'admin') {
              toast({ variant: "destructive", title: "Operação não permitida", description: "Base do administrador não pode ser alterada." });
              setLoading(false);
              return false;
         }
        if (!newBase.trim()) {
            toast({ variant: "destructive", title: "Erro", description: "Base não pode ser vazia." });
            setLoading(false);
            return false;
        }
        const originalBase = user.base; // For potential rollback
        let currentDbUser = null; // For DB rollback

        setLoading(true);
        try {
             // Fetch current DbUser
             currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) throw new Error("Current local user data not found for base update.");

             // 1. Update Local DB
             const updatedDbUser: DbUser = { ...currentDbUser, base: newBase, lastLogin: new Date().toISOString() };
             await saveLocalUser(updatedDbUser);
             console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Local DB base updated.`);
             // Update context state
             setUser({ ...user, base: newBase });


             // 2. Update Firestore (if online)
             if (db && navigator.onLine) {
                 try {
                     await setFirestoreUserData(user.id, { base: newBase });
                     console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Firestore base updated.`);
                 } catch (firestoreError) { // Corrected catch syntax
                      console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Failed to update Firestore base, proceeding with local update:`, firestoreError);
                     // Mark local for sync?
                 }
             } else {
                  console.warn(`[AuthProvider UpdateBase ${updateBaseStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
             }

             toast({ title: "Sucesso", description: "Base atualizada." });
              const updateBaseEndTime = performance.now();
             console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Base update successful. Total time: ${updateBaseEndTime - updateBaseStartTime} ms.`);
             return true;
         } catch (error: any) { // Catch local DB errors
              const updateBaseEndTime = performance.now();
              console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Local DB Base update failed after ${updateBaseEndTime - updateBaseStartTime} ms. Error:`, error);
              // Rollback local state
              setUser({ ...user, base: originalBase });
               // Rollback local DB
               if (currentDbUser) {
                   await saveLocalUser(currentDbUser).catch(dbRollbackError => {
                       console.error(`[AuthProvider UpdateBase ${updateBaseEndTime}] CRITICAL: Failed to rollback local DB change after error:`, dbRollbackError);
                   });
               }
              toast({ variant: "destructive", title: "Falha Local", description: "Não foi possível salvar a alteração da base localmente." });
              return false;
         } finally {
             setLoading(false);
         }
    };


  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, signup, logout, updateEmail, updatePassword, updateProfileName, updateBase, checkLocalLogin }}>
       {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
    
