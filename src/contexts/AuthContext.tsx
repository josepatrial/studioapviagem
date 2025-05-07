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
    seedInitialUsers // Import initial seed users
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
  signup: (email: string, pass: string, name: string, username?: string, base?: string) => Promise<boolean>; // Added base to signup
  logout: () => void;
  updateEmail: (currentPassword: string, newEmail: string) => Promise<boolean>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  updateProfileName: (newName: string) => Promise<boolean>;
  updateBase: (newBase: string) => Promise<boolean>; // Added updateBase
  checkLocalLogin: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Helper Function to Create Firestore User Document ---
const createUserDocument = async (userId: string, email: string, name: string, username?: string, base?: string, role: UserRole = 'driver') => {
  const startTime = performance.now();
  console.log(`[createUserDocument ${startTime}] Attempting for UID: ${userId} with role: ${role}, base: ${base}`);
  if (!db) {
      console.error(`[createUserDocument ${startTime}] Firestore DB instance is not available.`);
      throw new Error('Firestore not initialized. Cannot create user document.');
  }
  const userDocRef = doc(db, 'users', userId);

  const effectiveRole = email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : role;
  const effectiveBase = effectiveRole === 'admin' ? 'ALL' : (base || 'N/A'); // Ensure base is set, fallback to 'N/A' if not provided

  const userData: Partial<Omit<User, 'id' | 'lastLogin'>> = {
    name,
    email,
    username: username || '',
    role: effectiveRole,
    base: effectiveBase,
  };
  try {
    await setDoc(userDocRef, userData, { merge: true });
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
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();


    // Check local DB for logged-in user on initial load
    const checkLocalLogin = useCallback(async (): Promise<boolean> => {
        const checkLocalStartTime = performance.now();
        console.log(`[checkLocalLogin ${checkLocalStartTime}] Checking local IndexedDB for user...`);
        try {
            // Ensure DB is open before proceeding
             if (!persistenceEnabledPromise) {
                console.warn("[checkLocalLogin] Persistence promise not initialized yet.");
            } else {
                await persistenceEnabledPromise;
                 console.log(`[checkLocalLogin ${checkLocalStartTime}] Persistence promise resolved. Proceeding.`);
            }

            const dbInstance = await openDB();
             console.log(`[checkLocalLogin ${checkLocalStartTime}] IndexedDB instance obtained.`);

            if (!dbInstance.objectStoreNames.contains(STORE_USERS)) {
                 console.warn(`[checkLocalLogin ${checkLocalStartTime}] User store '${STORE_USERS}' not found. Skipping local check.`);
                 setLoading(false);
                 return false;
             }
            const tx = dbInstance.transaction(STORE_USERS, 'readonly');
            const store = tx.objectStore(STORE_USERS);
             console.log(`[checkLocalLogin ${checkLocalStartTime}] Transaction and store obtained for ${STORE_USERS}.`);
            const allUsers = await new Promise<DbUser[]>((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] getAll request successful. Result count: ${request.result?.length}`);
                    resolve(request.result);
                }
                request.onerror = (e) => {
                    console.error(`[checkLocalLogin ${checkLocalStartTime}] Error in getAll request:`, request.error);
                    reject(request.error);
                 }
            });

            await tx.done;
             console.log(`[checkLocalLogin ${checkLocalStartTime}] Transaction 'getAll' completed.`);


            if (allUsers && allUsers.length > 0) {
                console.log(`[checkLocalLogin ${checkLocalStartTime}] Found ${allUsers.length} users locally. Determining latest...`);
                const latestUser = allUsers.reduce((latest, current) => {
                   const latestTime = latest.lastLogin ? new Date(latest.lastLogin).getTime() : 0;
                   const currentTime = current.lastLogin ? new Date(current.lastLogin).getTime() : 0;
                   return currentTime > latestTime ? current : latest;
                });
                const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                if (latestUser.lastLogin && new Date(latestUser.lastLogin).getTime() > sevenDaysAgo) {
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] Found potentially active local user: ${latestUser.id} (Last login: ${latestUser.lastLogin})`);

                    let userToSet = { ...latestUser };
                    if (userToSet.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                        console.log(`[checkLocalLogin ${checkLocalStartTime}] Forcing admin role for ${userToSet.email}`);
                        userToSet.role = 'admin';
                        userToSet.base = 'ALL'; // Admins always have 'ALL' base
                        if(latestUser.role !== 'admin' || latestUser.base !== 'ALL'){
                            saveLocalUser(userToSet).catch(err => console.error("Error saving forced admin role locally:", err));
                        }
                    } else if (!userToSet.base) { // Ensure base is set for non-admin users
                        console.log(`[checkLocalLogin ${checkLocalStartTime}] User ${userToSet.email} missing base, setting to 'N/A'.`);
                        userToSet.base = 'N/A';
                        saveLocalUser(userToSet).catch(err => console.error("Error saving default base locally:", err));
                    }


                    const { passwordHash, ...finalUserToSet } = userToSet;
                    setUser(finalUserToSet);
                    // No need to set firebaseUser here for local login, it will be set by onAuthStateChanged if online
                    const checkLocalEndTime = performance.now();
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] Completed (found active local user). Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
                    // setLoading(false); // Do not set loading false here yet, wait for Firebase listener
                    return true;
                } else {
                     console.log(`[checkLocalLogin ${checkLocalStartTime}] Local user ${latestUser.id} found, but login is too old (${latestUser.lastLogin}) or timestamp missing.`);
                }
            } else {
                console.log(`[checkLocalLogin ${checkLocalStartTime}] No local users found.`);
            }

            setUser(null); // Ensure user is null if no active local session
            const checkLocalEndTime = performance.now();
            console.log(`[checkLocalLogin ${checkLocalStartTime}] Completed (no active user found). Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
            // setLoading(false); // Do not set loading false here yet
            return false;

        } catch (error) {
            console.error(`[checkLocalLogin ${checkLocalStartTime}] Error checking local DB:`, error);
            setUser(null);
            // setLoading(false); // Set loading false on error if Firebase listener won't run
            const checkLocalEndTime = performance.now();
            console.error(`[checkLocalLogin ${checkLocalStartTime}] Completed with error. Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
            return false;
        }
    }, []);


    // Combined Effect for initial check and Firebase listener
    useEffect(() => {
        const listenerId = Math.random().toString(36).substring(2, 7);
        console.log(`[AuthProvider Effect ${listenerId}] Running initial setup. Setting loading true.`);
        setLoading(true);
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;
        let initialLocalCheckDone = false;

        const setupFirebaseListener = () => {
            console.log(`[AuthProvider Effect ${listenerId}] Setting up Firebase auth state listener.`);
            if (!auth) {
              console.error(`[AuthProvider Effect ${listenerId}] Firebase Auth instance not available for listener.`);
              if (initialLocalCheckDone && !user && isMounted) { // Only set loading false if local check is done and component is mounted
                    console.log(`[AuthProvider Effect ${listenerId}] Auth not available, setting loading false.`);
                    setLoading(false);
              }
              return;
            }

            unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
              const authChangeStartTime = performance.now();
              console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Received FB auth state. isMounted: ${isMounted}, fbUser present: ${!!fbUser}, current local user: ${!!user}`);
              if (!isMounted) {
                 console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Component unmounted, skipping FB state update.`);
                 return;
              }

              setFirebaseUser(fbUser);

              if (!fbUser) {
                  console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user logged out.`);
                  if (user) { // If there was a local user, clear it
                      console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Clearing local user state due to FB logout.`);
                      setUser(null);
                  }
                  console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Setting loading false (no FB user).`);
                  setLoading(false);
              } else {
                   console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user (${fbUser.uid}) detected. Fetching/Saving local data...`);
                   try {
                       let localUserData = await getLocalUser(fbUser.uid);
                       const nowISO = new Date().toISOString();
                       let firestoreData: User | null = null;

                       if (!localUserData || !localUserData.role || !localUserData.base) {
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId}] User ${fbUser.uid} missing locally or needs role/base. Fetching from Firestore...`);
                            if (navigator.onLine) {
                                try {
                                    firestoreData = await getFirestoreUserData(fbUser.uid);
                                     console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Firestore data for ${fbUser.uid}:`, firestoreData);
                                } catch (firestoreError) {
                                     console.error(`[AuthProvider onAuthStateChanged ${listenerId}] Error fetching Firestore data for ${fbUser.uid}:`, firestoreError);
                                }
                            } else {
                                console.warn(`[AuthProvider onAuthStateChanged ${listenerId}] Offline. Skipping Firestore fetch for user ${fbUser.uid}.`);
                            }
                       }

                       if (firestoreData) {
                            console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Firestore data found for ${fbUser.uid}. Saving locally...`);
                             const { passwordHash, ...restFirestoreData } = firestoreData as any; // Assume firestoreData is User, so no hash
                            localUserData = { ...restFirestoreData, id: fbUser.uid, lastLogin: nowISO };
                             const existingLocal = await getLocalUser(fbUser.uid).catch(() => null);
                             const mergedLocal: DbUser = {
                                 ...(localUserData as Omit<DbUser, 'passwordHash'>), // Ensure localUserData matches expected type for DbUser
                                 passwordHash: existingLocal?.passwordHash || '' // Preserve existing hash
                             };

                            if (mergedLocal.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                                console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Forcing admin role and ALL base for ${mergedLocal.email} during Firestore save`);
                                mergedLocal.role = 'admin';
                                mergedLocal.base = 'ALL';
                            } else if (!mergedLocal.base) {
                                 console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Firestore data for ${mergedLocal.email} missing base, setting to 'N/A'.`);
                                 mergedLocal.base = 'N/A';
                            }
                            await saveLocalUser(mergedLocal);
                            localUserData = mergedLocal; // Use the merged data

                       } else if (!localUserData) {
                           console.warn(`[AuthProvider onAuthStateChanged ${listenerId}] No local or Firestore data for ${fbUser.uid}. Creating basic local user.`);
                           let basicRole: UserRole = 'driver';
                           let basicBase = 'N/A';
                            if (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                                console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Forcing admin role and ALL base for ${fbUser.email} during basic local creation`);
                                basicRole = 'admin';
                                basicBase = 'ALL';
                            }

                           const basicLocalUser: DbUser = {
                                id: fbUser.uid,
                                email: fbUser.email || 'unknown@example.com',
                                name: fbUser.displayName || 'Usuário Firebase',
                                role: basicRole,
                                base: basicBase,
                                lastLogin: nowISO,
                                passwordHash: '' // New user, no local hash yet from Firebase Auth directly
                            };
                            await saveLocalUser(basicLocalUser);
                            localUserData = basicLocalUser;
                            if (navigator.onLine) {
                                createUserDocument(fbUser.uid, basicLocalUser.email, basicLocalUser.name || '', undefined, basicLocalUser.base, basicLocalUser.role)
                                  .catch(err => console.error("[AuthProvider] BG Firestore create failed:", err));
                            }
                       } else {
                           // Existing local user, ensure data is consistent and update last login
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId}] User ${fbUser.uid} found locally. Updating last login and ensuring role/base consistency.`);
                           localUserData.lastLogin = nowISO;
                           if (localUserData.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                                if (localUserData.role !== 'admin' || localUserData.base !== 'ALL') {
                                    console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Correcting role/base for admin ${localUserData.email} locally.`);
                                    localUserData.role = 'admin';
                                    localUserData.base = 'ALL';
                                }
                            } else if (!localUserData.base) {
                                console.log(`[AuthProvider onAuthStateChanged ${listenerId}] User ${localUserData.email} missing base, setting to 'N/A' locally.`);
                                localUserData.base = 'N/A';
                            }
                            // If Firebase Auth has display name and local doesn't, update local
                            if (fbUser.displayName && !localUserData.name) {
                                localUserData.name = fbUser.displayName;
                            }
                            await saveLocalUser(localUserData);
                       }

                       if (isMounted) {
                           const { passwordHash, ...userToSet } = localUserData;
                           setUser(userToSet);
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] User state set to:`, userToSet);
                       }
                   } catch (error: any) {
                       console.error(`[AuthProvider onAuthStateChanged ${listenerId}] Error fetching/saving user data for ${fbUser.uid}:`, error);
                       if (isMounted) {
                            let description = `Não foi possível carregar/salvar dados do usuário.`;
                            if (error.name === 'NetworkError' || error.message?.includes('offline') || error.message?.includes('Failed to fetch') || error.code === 'unavailable') {
                                description += ' Parece que você está offline ou o serviço está indisponível.';
                            } else if (error.message) {
                                description += ` Detalhes: ${error.message}`;
                            }
                            toast({ variant: "destructive", title: "Erro Dados Locais/Online", description: description, duration: 9000 });
                       }
                   } finally {
                       if (isMounted) {
                          setLoading(false);
                           const authChangeEndTime = performance.now();
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Finished processing FB user ${fbUser?.uid}. Loading false. Total time: ${authChangeEndTime - authChangeStartTime} ms.`);
                       }
                   }
              }
            });
        };

         (window as any).__authProviderMountTime = performance.now();

        checkLocalLogin().then(localUserFound => {
            initialLocalCheckDone = true;
            if (isMounted) {
                console.log(`[AuthProvider Effect ${listenerId}] Local check completed. Local User Found: ${localUserFound}. Current context user: ${!!user}. Setting up Firebase listener.`);
                setupFirebaseListener();
                // If no local user was found AND Firebase listener setup might not run (e.g., auth is null), set loading false.
                if (!localUserFound && !auth) {
                    console.log(`[AuthProvider Effect ${listenerId}] No local user and no auth instance, setting loading false.`);
                    setLoading(false);
                } else {
                    console.log(`[AuthProvider Effect ${listenerId}] Waiting for Firebase listener... (Loading is ${loading}, Local User Found: ${localUserFound}, Auth available: ${!!auth})`);
                }
            }
        }).catch(err => {
             initialLocalCheckDone = true;
             console.error(`[AuthProvider Effect ${listenerId}] Initial checkLocalLogin failed:`, err);
             if (isMounted) {
                 console.log(`[AuthProvider Effect ${listenerId}] Setting up Firebase listener after local check error.`);
                 setupFirebaseListener();
                 // If Firebase listener setup might not run, set loading false.
                 if (!auth) {
                    console.log(`[AuthProvider Effect ${listenerId}] No auth instance after local check error, setting loading false.`);
                    setLoading(false);
                 }
             }
        });

        return () => {
            const cleanupTime = performance.now();
            console.log(`[AuthProvider Effect Cleanup ${listenerId}] Unmounting. Total effect duration: ${cleanupTime - (window as any).__authProviderMountTime} ms. Unsubscribing from auth state changes.`);
            isMounted = false;
            if (unsubscribe) {
                unsubscribe();
            }
        };
      }, []); // Removed user, checkLocalLogin, toast from dependencies to prevent re-runs based on their changes.


  // --- Authentication Functions ---

   const login = async (email: string, pass: string): Promise<boolean> => {
     const loginStartTime = performance.now();
     console.log(`[AuthProvider Login ${loginStartTime}] Attempting login for email: ${email}`);
     setLoading(true); // Set loading true at the start of login attempt

     try {
          console.log(`[AuthProvider Login ${loginStartTime}] Attempting local login check for ${email}...`);
          let localDbUser = await getLocalUserByEmail(email);
          if (localDbUser && localDbUser.passwordHash) {
              console.log(`[AuthProvider Login ${loginStartTime}] Local user found for ${email}. Verifying password...`);
              const isPasswordValid = await verifyPassword(pass, localDbUser.passwordHash);
              if (isPasswordValid) {
                  console.log(`[AuthProvider Login ${loginStartTime}] Local password verification successful for ${email}.`);
                  const nowISO = new Date().toISOString();

                   if (localDbUser.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                       console.log(`[AuthProvider Login ${loginStartTime}] Forcing admin role and ALL base for ${localDbUser.email} during local login`);
                       localDbUser.role = 'admin';
                       localDbUser.base = 'ALL';
                   } else if (!localDbUser.base) {
                        console.log(`[AuthProvider Login ${loginStartTime}] User ${localDbUser.email} missing base locally, setting to 'N/A'.`);
                        localDbUser.base = 'N/A';
                   }


                  const updatedLocalUser = { ...localDbUser, lastLogin: nowISO };
                  await saveLocalUser(updatedLocalUser);

                  const { passwordHash, ...userToSet } = updatedLocalUser;
                  setUser(userToSet); // Set user context
                  setFirebaseUser(null); // Clear Firebase user as it's a local login
                  setLoading(false); // Local login success, stop loading
                  const loginEndTime = performance.now();
                  console.log(`[AuthProvider Login ${loginStartTime}] Local login successful for ${email}. Time: ${loginEndTime - loginStartTime} ms.`);
                  toast({ title: "Login Local Bem-sucedido!", description: "Conectado localmente." });
                  return true;
              } else {
                   console.log(`[AuthProvider Login ${loginStartTime}] Local password verification failed for ${email}. Proceeding to Firebase.`);
              }
          } else {
               console.log(`[AuthProvider Login ${loginStartTime}] Local user ${email} not found or has no password hash. Proceeding to Firebase login.`);
          }

         if (!navigator.onLine) {
             console.log(`[AuthProvider Login ${loginStartTime}] Offline. Firebase login skipped.`);
             toast({ variant: "destructive", title: "Offline", description: "Você está offline. Login online indisponível.", duration: 5000 });
             setLoading(false);
              let isLocalPasswordStillInvalid = true;
              if (localDbUser && localDbUser.passwordHash) {
                  isLocalPasswordStillInvalid = !(await verifyPassword(pass, localDbUser.passwordHash));
              }
              // Only show "invalid credentials" if local attempt failed *and* offline
              if (isLocalPasswordStillInvalid) {
                 toast({ variant: "destructive", title: "Falha no Login Offline", description: "Credenciais locais inválidas.", duration: 5000 });
              }
             return false;
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
         // **Crucially, we return true here, but the UI update depends on the listener**
         // setLoading(false) will be called by onAuthStateChanged
         return true;

     } catch (error: any) {
        const loginEndTime = performance.now();
        console.error(`[AuthProvider Login ${loginStartTime}] Login failed for ${email}. Time: ${loginEndTime - loginStartTime} ms. Error Code: ${error.code}, Message: ${error.message}`); // Log specific error code
        let errorMessage = 'Falha no Login. Verifique seu e-mail e senha.';
         // Explicitly handle auth/invalid-credential
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
         } else if (error.code === 'auth/configuration-not-found' || error.message?.includes('auth/configuration-not-found')) {
              errorMessage = 'Erro de configuração do Firebase. Verifique as chaves de API e outras configurações na console do Firebase e no seu arquivo .env.';
              console.error("Firebase Login Error: auth/configuration-not-found. Ensure API keys, etc. are correct in .env AND Firebase console settings.");
          } else if (error.code?.includes('auth/')) { // General auth errors
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
        setLoading(false);
        return false;
     }
   };

   const signup = async (email: string, pass: string, name: string, username?: string, base?: string): Promise<boolean> => {
     const signupStartTime = performance.now();
     console.log(`[AuthProvider Signup ${signupStartTime}] Attempting signup for ${email}, base: ${base}`);
     setLoading(true);

     const isAdminUser = email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br';
     const userRole: UserRole = isAdminUser ? 'admin' : 'driver';
     // For admin, base is 'ALL', for drivers, use provided base or 'N/A' if empty
     const userBase = isAdminUser ? 'ALL' : (base?.trim() || 'N/A');


     let userId = `local_${email.replace(/[@.]/g, '_')}_${Date.now()}`; // Ensure unique local ID
     let firebaseUserId: string | undefined = undefined;

     try {
         const existingLocalUser = await getLocalUserByEmail(email);
         if (existingLocalUser) {
              toast({ variant: "destructive", title: "Falha no Cadastro", description: "Este e-mail já está cadastrado localmente." });
              setLoading(false);
              return false;
         }

         const passwordHash = await hashPassword(pass);
         console.log(`[AuthProvider Signup ${signupStartTime}] Password hashed.`);

         const newUserLocalData: DbUser = {
            id: userId, // Use the generated unique local ID
            email: email,
            name: name,
            username: username,
            role: userRole,
            base: userBase,
            lastLogin: new Date().toISOString(),
            passwordHash: passwordHash,
         };

         await saveLocalUser(newUserLocalData);
         console.log(`[AuthProvider Signup ${signupStartTime}] User saved locally with ID: ${userId}.`);

         if (auth && navigator.onLine) {
             try {
                 console.log(`[AuthProvider Signup ${signupStartTime}] Attempting to create Firebase Auth user...`);
                 const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
                 firebaseUserId = userCredential.user.uid;
                 console.log(`[AuthProvider Signup ${signupStartTime}] FB Auth user created: ${firebaseUserId}. Role: ${userRole}, Base: ${userBase}`);

                 // Update local record with Firebase ID, effectively replacing the temp local one
                 const firebaseLinkedLocalData: DbUser = {
                     ...newUserLocalData, // Keep original local data (name, username, role, base, hash)
                     id: firebaseUserId, // Set the ID to the Firebase UID
                 };
                 await deleteLocalUser(userId).catch(e => console.warn(`Failed to delete temp local user ${userId}:`, e)); // Attempt to delete temp local user
                 await saveLocalUser(firebaseLinkedLocalData); // Save with Firebase ID as the primary key
                 userId = firebaseUserId; // Update userId to the Firebase UID
                 console.log(`[AuthProvider Signup ${signupStartTime}] Local user record updated with Firebase ID: ${userId}.`);

                 await updateProfile(userCredential.user, { displayName: name });
                 console.log(`[AuthProvider Signup ${signupStartTime}] FB Auth profile updated.`);

                 await createUserDocument(firebaseUserId, email, name, username, userBase, userRole);
                 console.log(`[AuthProvider Signup ${signupStartTime}] Firestore document created.`);

                 await signOut(auth); // Sign out the newly created user so they can log in normally
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
                   } else if (firebaseError.code === 'auth/configuration-not-found' || firebaseError.message?.includes('auth/configuration-not-found')) {
                      fbErrorDesc = 'Erro de configuração do Firebase. Verifique as chaves de API e outras configurações.';
                      console.error("Firebase Signup Error: auth/configuration-not-found. Ensure API keys, etc. are correct in .env AND Firebase console settings.");
                    }
                   toast({ variant: "destructive", title: "Aviso Cadastro Online", description: fbErrorDesc, duration: 7000 });
                   // User is still created locally with the temporary local ID
             }
         } else {
             console.log(`[AuthProvider Signup ${signupStartTime}] Skipping Firebase signup (Offline or Auth unavailable). User created locally only with ID: ${userId}.`);
         }

         const signupEndTime = performance.now();
         console.log(`[AuthProvider Signup ${signupStartTime}] Signup process completed in ${signupEndTime - signupStartTime} ms. Final User ID (local or Firebase): ${userId}`);
         toast({ title: 'Cadastro local realizado com sucesso!', description: 'Você já pode fazer login.' });
         setLoading(false);
         return true;

     } catch (error: any) {
       const signupEndTime = performance.now();
       console.error(`[AuthProvider Signup ${signupStartTime}] Local Signup failed after ${signupEndTime - signupStartTime} ms. Error: `, error);
       let description = `Erro inesperado ao cadastrar localmente: ${error.message || 'Verifique os dados e tente novamente.'}`;
       toast({ variant: "destructive", title: "Falha no Cadastro Local", description, duration: 9000 });
       setLoading(false);
       return false;
     }
   };


  const logout = async () => {
    const logoutStartTime = performance.now();
    console.log(`[AuthProvider Logout ${logoutStartTime}] Attempting logout...`);
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

  const reauthenticate = async (currentPassword: string): Promise<boolean> => {
      const reauthStartTime = performance.now();
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
                    // Error handled by caller toast for "incorrect password"
               } else {
                   let desc = "Erro ao reautenticar online.";
                   if (error.code === 'auth/too-many-requests') desc = 'Muitas tentativas falhadas. Tente novamente mais tarde.';
                   else if (error.code === 'auth/network-request-failed') desc = 'Erro de rede. Verifique sua conexão.';
                   toast({ variant: "destructive", title: "Reautenticação Falhou", description: desc });
                   return false; // Return false for other Firebase errors
               }
               // Fall through to local reauth attempt if wrong-password on Firebase
          }
      } else {
          console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] No Firebase user session, attempting local reauthentication...`);
      }

       if (user && user.email) { // Check if user and user.email exist
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
                   console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Local user or password hash not found for local reauthentication for email: ${user.email}.`);
               }
           } catch (localError) {
                console.error(`[AuthProvider Reauthenticate ${reauthStartTime}] Error during local reauthentication check:`, localError);
           }
       } else {
           console.warn(`[AuthProvider Reauthenticate ${reauthStartTime}] Cannot perform local reauth: user context or user.email is null.`);
       }


       toast({ variant: "destructive", title: "Autenticação Falhou", description: "Senha atual incorreta." });
       return false;
  };


    const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
        const updateEmailStartTime = performance.now();
        console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempting to update email to ${newEmail}`);
        if (!user) {
            console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Failed: User not logged in.`);
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
            return false;
        }
         if (user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
              toast({ variant: "destructive", title: "Operação não permitida", description: "Não é possível alterar o e-mail deste usuário administrador." });
              return false;
         }

        setLoading(true);

        const isAuthenticated = await reauthenticate(currentPassword);
        if (!isAuthenticated) {
            setLoading(false);
            return false;
        }

        let originalEmail = user.email;
        let currentDbUser: DbUser | null = null; // Ensure DbUser type

        try {
             currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) throw new Error("Current local user data not found for email update.");

            const updatedLocalUser = { ...user, email: newEmail };
            const updatedDbUser: DbUser = { ...currentDbUser, email: newEmail, lastLogin: new Date().toISOString() };
            await saveLocalUser(updatedDbUser);
            console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Local DB email updated.`);
            setUser(updatedLocalUser);

            if (auth && firebaseUser) {
                 try {
                     await firebaseUpdateEmail(firebaseUser, newEmail);
                     console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email updated.`);
                 } catch (authError: any) {
                     console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email update failed. Rolling back local changes...`, authError);
                      setUser({ ...user, email: originalEmail }); // Rollback UI
                      await saveLocalUser(currentDbUser); // Rollback DB

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


             if (db && navigator.onLine) {
                 try {
                    await setFirestoreUserData(user.id, { email: newEmail });
                    console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore email updated.`);
                 } catch (firestoreError: any) {
                      console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Failed to update Firestore email, proceeding with local update:`, firestoreError);
                 }
            } else {
                 console.warn(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
            }

            toast({ title: "Sucesso", description: "E-mail atualizado." });
            const updateEmailEndTime = performance.now();
            console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update process completed. Total time: ${updateEmailEndTime - updateEmailStartTime} ms.`);
            return true;
        } catch (error: any) {
            const updateEmailEndTime = performance.now();
            console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Local DB Email update failed after ${updateEmailEndTime - updateEmailStartTime} ms. Error: `, error);
             // Rollback UI state if local save fails
             setUser({ ...user, email: originalEmail });
             if (currentDbUser) { // Ensure currentDbUser is not null before attempting rollback
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


  const updatePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
      const updatePassStartTime = performance.now();
      console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Attempting password update.`);
      if (!user) {
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
           const newPasswordHash = await hashPassword(newPassword);
           console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] New password hashed.`);

           if (auth && firebaseUser) {
               try {
                    await firebaseUpdatePassword(firebaseUser, newPassword);
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

           const currentDbUser = await getLocalUser(user.id);
           if (!currentDbUser) throw new Error("Current local user data not found for password update.");
           const updatedDbUser: DbUser = { ...currentDbUser, passwordHash: newPasswordHash, lastLogin: new Date().toISOString() };
           await saveLocalUser(updatedDbUser);
           console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Local password hash updated.`);


           toast({ title: "Sucesso", description: "Senha atualizada." });
           const updatePassEndTime = performance.now();
           console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update process completed. Total time: ${updatePassEndTime - updatePassStartTime} ms.`);
           return true;
      } catch (error: any) {
           const updatePassEndTime = performance.now();
           console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update failed after ${updatePassEndTime - updatePassStartTime} ms. Error:`, error);
           toast({ variant: "destructive", title: "Falha", description: "Erro inesperado ao atualizar senha localmente." });
           return false;
      } finally {
          setLoading(false);
      }
  };

    const updateProfileName = async (newName: string): Promise<boolean> => {
        const updateNameStartTime = performance.now();
         console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Attempting name update to ${newName}.`);
         if (!user) {
            console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Failed: User not logged in.`);
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
            return false;
        }
         if (!newName.trim()) {
             toast({ variant: "destructive", title: "Erro", description: "Nome não pode ser vazio." });
             return false;
         }
        setLoading(true);
        const originalName = user.name;
        let currentDbUser: DbUser | null = null;

        try {
             currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) throw new Error("Current local user data not found for name update.");

             const updatedDbUser: DbUser = { ...currentDbUser, name: newName, lastLogin: new Date().toISOString() };
             await saveLocalUser(updatedDbUser);
             console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Local DB name updated.`);
             setUser({ ...user, name: newName });

             if (auth && firebaseUser) {
                 try {
                      await updateProfile(firebaseUser, { displayName: newName });
                      console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firebase Auth name updated.`);
                 } catch (authError: any) {
                     console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Firebase Auth name update failed (non-critical):`, authError);
                 }
            } else {
                 console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Skipping Firebase Auth name update.`);
            }


            if (db && navigator.onLine) {
                try {
                    await setFirestoreUserData(user.id, { name: newName });
                    console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore name updated.`);
                } catch (firestoreError: any) {
                     console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Failed to update Firestore name, proceeding with local update:`, firestoreError);
                }
            } else {
                 console.warn(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
            }

            toast({ title: "Sucesso", description: "Nome atualizado." });
             const updateNameEndTime = performance.now();
            console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Name update successful. Total time: ${updateNameEndTime - updateNameStartTime} ms.`);
            return true;
        } catch (error: any) {
             const updateNameEndTime = performance.now();
             console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Local DB Name update failed after ${updateNameEndTime - updateNameStartTime} ms. Error:`, error);
             setUser({ ...user, name: originalName }); // Rollback UI
               if (currentDbUser) { // Ensure currentDbUser is not null
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

    const updateBase = async (newBase: string): Promise<boolean> => {
        const updateBaseStartTime = performance.now();
        console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Attempting base update to ${newBase}.`);
        if (!user) {
            console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Failed: User not logged in.`);
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
            setLoading(false);
            return false;
        }
         if (user.role === 'admin' || user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
              toast({ variant: "destructive", title: "Operação não permitida", description: "Base do administrador não pode ser alterada." });
              setLoading(false);
              return false;
         }
        if (!newBase.trim()) {
            toast({ variant: "destructive", title: "Erro", description: "Base não pode ser vazia." });
            setLoading(false);
            return false;
        }
        const originalBase = user.base;
        let currentDbUser: DbUser | null = null;

        setLoading(true);
        try {
             currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) throw new Error("Current local user data not found for base update.");

             const updatedDbUser: DbUser = { ...currentDbUser, base: newBase, lastLogin: new Date().toISOString() };
             await saveLocalUser(updatedDbUser);
             console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Local DB base updated.`);
             setUser({ ...user, base: newBase });


             if (db && navigator.onLine) {
                 try {
                     await setFirestoreUserData(user.id, { base: newBase });
                     console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Firestore base updated.`);
                 } catch (firestoreError: any) {
                      console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Failed to update Firestore base, proceeding with local update:`, firestoreError);
                 }
             } else {
                  console.warn(`[AuthProvider UpdateBase ${updateBaseStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
             }

             toast({ title: "Sucesso", description: "Base atualizada." });
              const updateBaseEndTime = performance.now();
             console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Base update successful. Total time: ${updateBaseEndTime - updateBaseStartTime} ms.`);
             return true;
         } catch (error: any) {
              const updateBaseEndTime = performance.now();
              console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Local DB Base update failed after ${updateBaseEndTime - updateBaseStartTime} ms. Error:`, error);
              setUser({ ...user, base: originalBase }); // Rollback UI
               if (currentDbUser) { // Ensure currentDbUser is not null
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

