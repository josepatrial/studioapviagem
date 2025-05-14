// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateEmail as firebaseUpdateEmail,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { getUserData as getFirestoreUserData, setUserData as setFirestoreUserData } from '@/services/firestoreService';
import { doc, setDoc, getDoc, FirestoreError } from 'firebase/firestore';
import { auth, db, persistenceEnabledPromise } from '@/lib/firebase';
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser,
    LocalUser as DbUser, // Rename to avoid conflict
    openDB,
    STORE_USERS, // Import STORE_USERS
    getLocalUserByEmail, // Add this import
    seedInitialUsers
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
  firebaseUser: FirebaseUser | null; // Use FirebaseUser type
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
const createUserDocument = async (
  userId: string,
  email: string,
  name: string,
  username?: string,
  base?: string,
  role: UserRole = 'driver' // Default role
): Promise<User> => {
  const startTime = performance.now();
  console.log(`[createUserDocument ${startTime}] Attempting to create/merge Firestore document for ${userId}, role: ${role}, base: ${base}`);
  if (!db) {
    console.error(`[createUserDocument ${startTime}] Firestore DB instance is not available. Cannot create user document for ${userId}.`);
    throw new Error('Firestore not initialized. Cannot create user document.');
  }
  const userDocRef = doc(db, 'users', userId);

  const effectiveRole = email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : role;
  const effectiveBase = effectiveRole === 'admin' ? 'ALL' : (base || 'N/A');

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
    // Construct the User object to return, matching the User interface
    return {
        id: userId,
        name: userData.name!,
        email: userData.email!,
        username: userData.username,
        role: userData.role!,
        base: userData.base!,
        // lastLogin will be set when saving to local DB
    };
  } catch (error: unknown) {
    const endTime = performance.now();
    let errorMessage = "An unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error(`[createUserDocument ${startTime}] Error creating/merging Firestore document for ${userId} in ${endTime - startTime} ms:`, error);
    throw new Error(`Failed to create/merge Firestore user document: ${errorMessage}`);
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
            const allUsers = await new Promise<LocalUser[]>((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] getAll request successful. Result count: ${request.result?.length}`);
                    resolve(request.result as LocalUser[]);
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
                        userToSet.base = 'ALL';
                        if(latestUser.role !== 'admin' || latestUser.base !== 'ALL'){
                            saveLocalUser(userToSet).catch(err => console.error("Error saving forced admin role locally:", err));
                        }
                    } else if (!userToSet.base) {
                        console.log(`[checkLocalLogin ${checkLocalStartTime}] User ${userToSet.email} missing base, setting to 'N/A'.`);
                        userToSet.base = 'N/A';
                        saveLocalUser(userToSet).catch(err => console.error("Error saving default base locally:", err));
                    }


                    const { passwordHash, ...finalUserToSet } = userToSet;
                    setUser(finalUserToSet);
                    setFirebaseUser(null); // Assuming local login doesn't mean Firebase user is present
                    const checkLocalEndTime = performance.now();
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] Local login successful via check. User set. Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
                    setLoading(false);
                    return true;

                } else {
                     console.log(`[checkLocalLogin ${checkLocalStartTime}] Local user ${latestUser.id} found, but login is too old (${latestUser.lastLogin}) or timestamp missing.`);
                }
            } else {
                console.log(`[checkLocalLogin ${checkLocalStartTime}] No local users found.`);
            }

            setUser(null);
            const checkLocalEndTime = performance.now();
            console.log(`[checkLocalLogin ${checkLocalStartTime}] Completed (no active user found). Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
            setLoading(false);
            return false;

        } catch (error) {
            console.error(`[checkLocalLogin ${checkLocalStartTime}] Error checking local DB:`, error);
            setUser(null);
            setLoading(false);
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

        const setupFirebaseListener = () => {
            if (!auth) {
                console.warn(`[AuthProvider Effect ${listenerId}] Firebase auth instance not available. Skipping Firebase listener setup.`);
                if (!user) {
                    setLoading(false);
                    console.log(`[AuthProvider Effect ${listenerId}] Auth unavailable, no local user. Loading set to false.`);
                }
               return;
            }

            unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
              const authChangeStartTime = performance.now();
              console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Received FB auth state. isMounted: ${isMounted}, fbUser present: ${!!fbUser}`);
              if (!isMounted) {
                 console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Component unmounted, skipping FB state update.`);
                 return;
              }

              if (!fbUser) {
                  console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user logged out or not present.`);
                  // Only clear the main user state if there was a Firebase user previously.
                  // This prevents clearing a local-only session if Firebase is just confirming no one is logged in there.
                  if (firebaseUser) { // Check the *previous* firebaseUser state
                      console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Clearing AuthContext.user because Firebase user was present and now is not.`);
                      setUser(null);
                  } else {
                       console.log(`[AuthProvider onAuthStateChanged ${listenerId}] No active Firebase user, and no previous Firebase user. Local session might persist. Not changing AuthContext.user.`);
                  }
                  setFirebaseUser(null); // Always update firebaseUser state to null
                  console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Setting loading false (no FB user).`);
                  setLoading(false);
              } else {
                   console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user (${fbUser.uid}) detected. Fetching/Saving local data...`);
                   setFirebaseUser(fbUser); // Set Firebase user state immediately
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
                                } catch (firestoreFetchError) {
                                     console.error(`[AuthProvider onAuthStateChanged ${listenerId}] Error fetching Firestore data for ${fbUser.uid}:`, firestoreFetchError);
                                }
                            } else {
                                console.warn(`[AuthProvider onAuthStateChanged ${listenerId}] Offline. Skipping Firestore fetch for user ${fbUser.uid}.`);
                            }
                       }

                       if (firestoreData) {
                            console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Firestore data found for ${fbUser.uid}. Saving locally...`);
                            const existingLocal = await getLocalUser(fbUser.uid).catch(() => null);
                            const mergedLocal: DbUser = {
                                id: fbUser.uid,
                                name: firestoreData.name || fbUser.displayName || fbUser.email || `Usuário ${fbUser.uid.substring(0,6)}`,
                                email: firestoreData.email || fbUser.email!,
                                username: firestoreData.username,
                                role: firestoreData.role || (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : 'driver'),
                                base: firestoreData.base || (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'ALL' : 'N/A'),
                                passwordHash: existingLocal?.passwordHash || '',
                                lastLogin: nowISO
                            };
                            await saveLocalUser(mergedLocal);
                            localUserData = mergedLocal;

                       } else if (!localUserData) {
                           console.warn(`[AuthProvider onAuthStateChanged ${listenerId}] No local or Firestore data for ${fbUser.uid}. Creating basic local user from Firebase Auth info.`);
                           let basicRole: UserRole = fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : 'driver';
                           let basicBase = basicRole === 'admin' ? 'ALL' : 'N/A';

                           const basicLocalUser: DbUser = {
                                id: fbUser.uid,
                                email: fbUser.email || 'unknown@example.com',
                                name: fbUser.displayName || fbUser.email || `Usuário ${fbUser.uid.substring(0,6)}`,
                                role: basicRole,
                                base: basicBase,
                                lastLogin: nowISO,
                                passwordHash: '' // No password hash for Firebase-originated users initially
                            };
                            await saveLocalUser(basicLocalUser);
                            localUserData = basicLocalUser;
                            if (navigator.onLine) {
                                createUserDocument(fbUser.uid, basicLocalUser.email, basicLocalUser.name, undefined, basicLocalUser.base, basicLocalUser.role)
                                  .catch(err => console.error("[AuthProvider] Background Firestore create for new FB user failed:", err));
                            }
                       } else {
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId}] User ${fbUser.uid} found locally. Updating last login and ensuring role/base consistency.`);
                           localUserData.lastLogin = nowISO;
                           if (localUserData.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                                if (localUserData.role !== 'admin' || localUserData.base !== 'ALL') {
                                    localUserData.role = 'admin';
                                    localUserData.base = 'ALL';
                                }
                            } else if (!localUserData.base) {
                                localUserData.base = 'N/A';
                            }
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
                       console.error(`[AuthProvider onAuthStateChanged ${listenerId}] Error processing user data for ${fbUser.uid}:`, error);
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
            if (isMounted) {
                if (localUserFound) {
                    console.log(`[AuthProvider Effect ${listenerId}] Local user found by checkLocalLogin. Firebase listener will still be set up to monitor changes.`);
                } else {
                    console.log(`[AuthProvider Effect ${listenerId}] No active local user found by checkLocalLogin.`);
                }
                // Always setup Firebase listener to handle Firebase logins or state changes
                setupFirebaseListener();
            } else {
                 console.log(`[AuthProvider Effect ${listenerId}] Component unmounted before local check completed or Firebase listener setup.`);
            }
        }).catch(err => {
             console.error(`[AuthProvider Effect ${listenerId}] Initial checkLocalLogin failed:`, err);
             if (isMounted) {
                 console.log(`[AuthProvider Effect ${listenerId}] Setting up Firebase listener after local check error.`);
                 setupFirebaseListener();
             }
        });

        if (persistenceEnabledPromise) {
            persistenceEnabledPromise.then(() => {
                console.log("[AuthProvider Effect] DB Ready, attempting to seed initial users...");
                return seedInitialUsers();
            }).catch(seedError => {
                console.error("[AuthProvider Effect] Error seeding initial users:", seedError);
            });
        } else {
             console.warn("[AuthProvider Effect] persistenceEnabledPromise not available for seeding.");
        }


        return () => {
            const cleanupTime = performance.now();
            console.log(`[AuthProvider Effect Cleanup ${listenerId}] Unmounting. Total effect duration: ${cleanupTime - (window as any).__authProviderMountTime} ms. Unsubscribing from auth state changes.`);
            isMounted = false;
            if (unsubscribe) {
                unsubscribe();
            }
        };
      }, []);


  // --- Authentication Functions ---

   const login = async (email: string, pass: string): Promise<boolean> => {
     const loginStartTime = performance.now();
     console.log(`[AuthProvider Login ${loginStartTime}] Attempting login for email: ${email}`);
     setLoading(true); // Set loading true at the start of login attempt

     try {
          let localDbUser = await getLocalUserByEmail(email);
          if (localDbUser && localDbUser.passwordHash) {
              const isPasswordValid = await verifyPassword(pass, localDbUser.passwordHash);
              if (isPasswordValid) {
                  const nowISO = new Date().toISOString();
                  if (localDbUser.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                       localDbUser.role = 'admin';
                       localDbUser.base = 'ALL';
                   } else if (!localDbUser.base) {
                        localDbUser.base = 'N/A';
                   }
                  const updatedLocalUser = { ...localDbUser, lastLogin: nowISO };
                  await saveLocalUser(updatedLocalUser);
                  const { passwordHash, ...userToSet } = updatedLocalUser;
                  setUser(userToSet);
                  setFirebaseUser(null); // Explicitly set no Firebase user for local login
                  setLoading(false);
                  const loginEndTime = performance.now();
                  console.log(`[AuthProvider Login ${loginStartTime}] Local login successful for ${email}. User state set. Time: ${loginEndTime - loginStartTime} ms.`);
                  toast({ title: "Login Local Bem-sucedido!", description: "Conectado localmente." });
                  return true;
              }
          }

         if (!navigator.onLine) {
             toast({ variant: "destructive", title: "Offline", description: "Você está offline. Login online indisponível.", duration: 5000 });
             setLoading(false);
             if (localDbUser) {
                 toast({ variant: "destructive", title: "Falha no Login Offline", description: "Credenciais locais inválidas.", duration: 5000 });
             } else {
                 toast({ variant: "destructive", title: "Falha no Login Offline", description: "Usuário não encontrado localmente.", duration: 5000 });
             }
             return false;
         }

         if (!auth) {
            toast({ variant: "destructive", title: "Erro de Configuração", description: "Serviço de autenticação Firebase não está disponível." });
            setLoading(false);
            return false;
         }

         const userCredential = await signInWithEmailAndPassword(auth, email, pass);
         const loginEndTime = performance.now();
         console.log(`[AuthProvider Login ${loginStartTime}] signInWithEmailAndPassword successful for ${userCredential.user.email}. Time: ${loginEndTime - loginStartTime} ms. Waiting for onAuthStateChanged...`);
         // **Crucially, we return true here, but the UI update depends on the listener**
         // setLoading(false) will be handled by onAuthStateChanged when fbUser is processed.
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
         } else if (error.code?.includes('auth/configuration-not-found') || error.code === 'auth/invalid-api-key') { // Added auth/invalid-api-key
              errorMessage = 'Erro de configuração do Firebase. Verifique as chaves de API e outras configurações na console do Firebase e no seu arquivo .env.';
          } else if (error.code?.includes('auth/')) { // General Firebase Auth error
               errorMessage = `Erro de autenticação (${error.code}). Tente novamente.`;
          } else {
              // Handle cases where error.code might be undefined (e.g., generic network errors not from Firebase SDK)
              console.error(`[AuthProvider Login ${loginStartTime}] Non-Firebase error during login for ${email}:`, error);
              errorMessage = 'Ocorreu um erro inesperado durante o login. Verifique sua conexão e tente novamente.';
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
     const userBase = isAdminUser ? 'ALL' : (base?.trim().toUpperCase() || 'N/A');

     let tempLocalId = `local_${email.replace(/[@.]/g, '_')}_${Date.now()}`;
     let finalUserId = tempLocalId;

     try {
         const existingLocalUserByEmail = await getLocalUserByEmail(email);
         if (existingLocalUserByEmail) {
              toast({ variant: "destructive", title: "Falha no Cadastro", description: "Este e-mail já está cadastrado localmente." });
              setLoading(false);
              return false;
         }

         const passwordHash = await hashPassword(pass);

         const newUserLocalData: DbUser = {
            id: tempLocalId,
            email: email,
            name: name,
            username: username,
            role: userRole,
            base: userBase,
            lastLogin: new Date().toISOString(),
            passwordHash: passwordHash,
            syncStatus: 'pending' // New users are pending sync
         };
         await saveLocalUser(newUserLocalData);
         console.log(`[AuthProvider Signup ${signupStartTime}] User initially saved locally with temp ID: ${tempLocalId}.`);

         if (auth && navigator.onLine) {
             try {
                 const userCredential = await firebaseCreateUserWithEmailAndPassword(auth, email, pass);
                 finalUserId = userCredential.user.uid;
                 console.log(`[AuthProvider Signup ${signupStartTime}] Firebase Auth user created: ${finalUserId}.`);

                 await deleteLocalUser(tempLocalId).catch(e => console.warn(`Failed to delete temp local user ${tempLocalId} during Firebase linkage:`, e));
                 const firebaseLinkedLocalData: DbUser = {
                     ...newUserLocalData,
                     id: finalUserId,
                     firebaseId: finalUserId, // Store Firebase UID also as firebaseId for clarity
                     syncStatus: 'synced' // Mark as synced after Firebase creation
                 };
                 await saveLocalUser(firebaseLinkedLocalData);
                 console.log(`[AuthProvider Signup ${signupStartTime}] Local user record updated with Firebase ID: ${finalUserId}.`);

                 await createUserDocument(finalUserId, email, name, username, userBase, userRole);

                 await firebaseSignOut(auth);
                 console.log(`[AuthProvider Signup ${signupStartTime}] User signed out post-Firebase signup to ensure clean login state.`);

             } catch (firebaseError: any) {
                  console.warn(`[AuthProvider Signup ${signupStartTime}] Firebase signup/setup failed. User remains local-only with ID ${tempLocalId}. Error: ${firebaseError.code}, ${firebaseError.message}`);
                   let fbErrorDesc = "Falha ao criar usuário online. A conta funcionará localmente.";
                    if (firebaseError.code === 'auth/email-already-in-use') {
                       fbErrorDesc = "E-mail já em uso online. A conta local foi criada. Tente fazer login.";
                       // const onlineUserFirestoreData = await getFirestoreUserData(email); // This logic is complex and might not be needed here.
                       // if (onlineUserFirestoreData && onlineUserFirestoreData.role !== userRole) {
                       //      fbErrorDesc += ` Conflito de função: online é ${onlineUserFirestoreData.role}, tentativa de cadastro foi ${userRole}.`;
                       // }
                   } else if (firebaseError.code === 'auth/weak-password') {
                       fbErrorDesc = "Senha fraca para cadastro online (mínimo 6 caracteres). Conta local criada.";
                   } else if (firebaseError.code?.includes('auth/configuration-not-found') || firebaseError.code === 'auth/invalid-api-key') {
                        fbErrorDesc = 'Erro de configuração do Firebase. Verifique as chaves de API.';
                   }
                   toast({ variant: "destructive", title: "Aviso Cadastro Online", description: fbErrorDesc, duration: 7000 });
             }
         } else {
             console.log(`[AuthProvider Signup ${signupStartTime}] Skipping Firebase signup (Offline or Auth unavailable). User created locally only with ID: ${tempLocalId}.`);
         }

         const signupEndTime = performance.now();
         console.log(`[AuthProvider Signup ${signupStartTime}] Signup process completed in ${signupEndTime - signupStartTime} ms. Final User ID: ${finalUserId}`);
         toast({ title: 'Cadastro local realizado com sucesso!', description: 'Você já pode fazer login.' });
         setLoading(false);
         return true;

     } catch (error: any) {
       const signupErrorEndTime = performance.now();
       console.error(`[AuthProvider Signup ${signupStartTime}] Local Signup failed after ${signupErrorEndTime - signupStartTime} ms. Error: `, error);
       let description = `Erro inesperado ao cadastrar localmente: ${error.message || 'Verifique os dados e tente novamente.'}`;
       toast({ variant: "destructive", title: "Falha no Cadastro Local", description, duration: 9000 });
       setLoading(false);
       return false;
     }
   };


  const logout = async () => {
    const logoutStartTime = performance.now();
    console.log(`[AuthProvider Logout ${logoutStartTime}] Attempting logout...`);
    setLoading(true); // Ensure loading is true during logout
    setUser(null);
    setFirebaseUser(null);

    try {
        if (auth) {
          await firebaseSignOut(auth);
          console.log(`[AuthProvider Logout ${logoutStartTime}] Firebase signOut successful.`);
        } else {
             console.warn(`[AuthProvider Logout ${logoutStartTime}] Firebase Auth instance not available, skipping Firebase sign out.`);
        }
        // No need to manually clear local 'lastLogin' here, new logins will overwrite.
        const logoutEndTime = performance.now();
        console.log(`[AuthProvider Logout ${logoutStartTime}] Logout complete in ${logoutEndTime - logoutStartTime} ms.`);
        toast({title: "Logout", description: "Você saiu do sistema."})

    } catch (error) {
      const logoutErrorEndTime = performance.now();
      console.error(`[AuthProvider Logout ${logoutStartTime}] Logout failed after ${logoutErrorEndTime - logoutStartTime} ms. Error:`, error);
      toast({ variant: "destructive", title: "Erro no Logout", description: "Não foi possível sair completamente. Tente novamente." });
    } finally {
        setLoading(false); // Set loading false after logout attempt
    }
  };

  const reauthenticate = async (currentPassword: string): Promise<boolean> => {
      const reauthStartTime = performance.now();
      console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Attempting reauthentication...`);
      if (!firebaseUser && !user) {
           console.warn(`[AuthProvider Reauthenticate ${reauthStartTime}] No Firebase or local user session for reauthentication.`);
           toast({ variant: "destructive", title: "Erro", description: "Nenhuma sessão de usuário ativa para reautenticar." });
           return false;
      }

      if (firebaseUser && auth && navigator.onLine) {
          try {
              const credential = EmailAuthProvider.credential(firebaseUser.email!, currentPassword);
              await reauthenticateWithCredential(firebaseUser, credential);
              const reauthFbEndTime = performance.now();
              console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Firebase Reauthentication successful. Time: ${reauthFbEndTime - reauthStartTime} ms.`);
              return true;
          } catch (error: any) {
              const reauthFbErrorEndTime = performance.now();
              console.error(`[AuthProvider Reauthenticate ${reauthStartTime}] Firebase Reauthentication failed after ${reauthFbErrorEndTime - reauthStartTime} ms. Error: ${error.code}, Message: ${error.message}`);
               if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    // Fall through to local check or final toast
               } else {
                   let desc = "Erro ao reautenticar online.";
                   if (error.code === 'auth/too-many-requests') desc = 'Muitas tentativas falhadas. Tente novamente mais tarde.';
                   else if (error.code === 'auth/network-request-failed') desc = 'Erro de rede. Verifique sua conexão.';
                   toast({ variant: "destructive", title: "Reautenticação Online Falhou", description: desc });
                   return false;
               }
          }
      }

      if (user && user.email) {
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

        const originalEmail = user.email;
        let currentDbUser: DbUser | null = null;

        try {
             currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) throw new Error("Current local user data not found for email update.");

            if (firebaseUser && auth && navigator.onLine) {
                 try {
                     await firebaseUpdateEmail(firebaseUser, newEmail);
                     console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email updated.`);
                 } catch (authError: any) {
                     console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email update failed. Error: ${authError.code}`);
                     let desc = "Não foi possível atualizar o e-mail online.";
                      if (authError.code === 'auth/email-already-in-use') desc = "Este e-mail já está em uso por outra conta.";
                      else if (authError.code === 'auth/invalid-email') desc = "O formato do novo e-mail é inválido.";
                      else if (authError.code === 'auth/requires-recent-login') desc = 'Esta operação requer login online recente. Tente fazer logout e login novamente.';
                     toast({ variant: "destructive", title: "Falha Online", description: desc });
                     setLoading(false);
                     return false;
                 }
            }

            const updatedLocalUserForUI = { ...user, email: newEmail };
            const updatedDbUser: DbUser = { ...currentDbUser, email: newEmail, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
            await saveLocalUser(updatedDbUser);
            console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Local DB email updated.`);
            setUser(updatedLocalUserForUI);


             if (db && navigator.onLine && user.firebaseId) { // Only update Firestore if there's a firebaseId
                 try {
                    await setFirestoreUserData(user.firebaseId, { email: newEmail });
                    console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore email updated.`);
                 } catch (firestoreError: any) {
                      console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Failed to update Firestore email. Error:`, firestoreError);
                      toast({variant: "destructive", title: "Aviso Firestore", description: "E-mail atualizado localmente, mas falha ao atualizar no Firestore."})
                 }
            }

            toast({ title: "Sucesso", description: "E-mail atualizado." });
            return true;
        } catch (error: any) {
             console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update failed. Error: `, error);
             setUser({ ...user, email: originalEmail });
             if (currentDbUser) {
                 await saveLocalUser(currentDbUser).catch(dbRollbackError => {
                     console.error(`[AuthProvider UpdateEmail] CRITICAL: Failed to rollback local DB change after error:`, dbRollbackError);
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
      if (!user) {
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

            if (firebaseUser && auth && navigator.onLine) {
               try {
                   await firebaseUpdatePassword(firebaseUser, newPassword);
                   console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Firebase Auth password updated.`);
               } catch (authError: any) {
                     console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Firebase Password update failed. Error: ${authError.code}`);
                     let desc = "Não foi possível atualizar a senha online.";
                     if (authError.code === 'auth/weak-password') desc = "A nova senha é muito fraca (mínimo 6 caracteres).";
                     else if (authError.code === 'auth/requires-recent-login') desc = 'Esta operação requer login online recente. Faça logout e login novamente.';
                     toast({ variant: "destructive", title: "Falha Online", description: desc });
                     setLoading(false);
                     return false;
               }
           }

           const currentDbUser = await getLocalUser(user.id);
           if (!currentDbUser) throw new Error("Current local user data not found for password update.");
           const updatedDbUser: DbUser = { ...currentDbUser, passwordHash: newPasswordHash, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
           await saveLocalUser(updatedDbUser);
           console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Local password hash updated.`);

           toast({ title: "Sucesso", description: "Senha atualizada." });
           return true;
      } catch (error: any) {
           console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update failed. Error:`, error);
           toast({ variant: "destructive", title: "Falha", description: "Erro inesperado ao atualizar senha localmente." });
           return false;
      } finally {
          setLoading(false);
      }
  };

    const updateProfileName = async (newName: string): Promise<boolean> => {
        const updateNameStartTime = performance.now();
         if (!user) {
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

             const updatedDbUser: DbUser = { ...currentDbUser, name: newName, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
             await saveLocalUser(updatedDbUser);
             console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Local DB name updated.`);
             setUser({ ...user, name: newName });


            if (db && navigator.onLine && user.firebaseId) { // Only update Firestore if there's a firebaseId
                try {
                    await setFirestoreUserData(user.firebaseId, { name: newName });
                    console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore name updated.`);
                } catch (firestoreError: any) {
                     console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Failed to update Firestore name. Error:`, firestoreError);
                     toast({variant: "destructive", title: "Aviso Firestore", description: "Nome atualizado localmente, mas falha ao atualizar no Firestore."})
                }
            }

            toast({ title: "Sucesso", description: "Nome atualizado." });
            return true;
        } catch (error: any) {
             console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Name update failed. Error:`, error);
             setUser({ ...user, name: originalName });
               if (currentDbUser) {
                   await saveLocalUser(currentDbUser).catch(dbRollbackError => {
                       console.error(`[AuthProvider UpdateName] CRITICAL: Failed to rollback local DB change after error:`, dbRollbackError);
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
        if (!user) {
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
            return false;
        }
         if (user.role === 'admin' || user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
              toast({ variant: "destructive", title: "Operação não permitida", description: "Base do administrador não pode ser alterada." });
              return false;
         }
        if (!newBase.trim()) {
            toast({ variant: "destructive", title: "Erro", description: "Base não pode ser vazia." });
            return false;
        }
        setLoading(true);
        const originalBase = user.base;
        let currentDbUser: DbUser | null = null;

        try {
             currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) throw new Error("Current local user data not found for base update.");

             const updatedDbUser: DbUser = { ...currentDbUser, base: newBase.toUpperCase(), lastLogin: new Date().toISOString(), syncStatus: 'pending' };
             await saveLocalUser(updatedDbUser);
             console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Local DB base updated.`);
             setUser({ ...user, base: newBase.toUpperCase() });


             if (db && navigator.onLine && user.firebaseId) { // Only update Firestore if there's a firebaseId
                 try {
                     await setFirestoreUserData(user.firebaseId, { base: newBase.toUpperCase() });
                     console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Firestore base updated.`);
                 } catch (firestoreError: any) {
                      console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Failed to update Firestore base. Error:`, firestoreError);
                      toast({variant: "destructive", title: "Aviso Firestore", description: "Base atualizada localmente, mas falha ao atualizar no Firestore."})
                 }
             }

             toast({ title: "Sucesso", description: "Base atualizada." });
             return true;
         } catch (error: any) {
              console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Base update failed. Error:`, error);
              setUser({ ...user, base: originalBase });
               if (currentDbUser) {
                   await saveLocalUser(currentDbUser).catch(dbRollbackError => {
                       console.error(`[AuthProvider UpdateBase] CRITICAL: Failed to rollback local DB change after error:`, dbRollbackError);
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
