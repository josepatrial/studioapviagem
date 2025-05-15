
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
import { auth, db } from '@/lib/firebase';
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser,
    LocalUser as DbUser, 
    openDB,
    STORE_USERS, 
    getLocalUserByEmail, 
    seedInitialUsers,
    getLocalUserByUsername,
} from '@/services/localDbService'; 
import { hashPassword, verifyPassword } from '@/lib/passwordUtils'; 
import { useCallback } from 'react'; 

export type UserRole = 'driver' | 'admin';
export interface User extends Omit<DbUser, 'passwordHash'> {}
export interface DriverInfo extends Omit<User, 'role'>{
    role: 'driver';
    username?: string;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (emailOrUsername: string, pass: string) => Promise<boolean>;
  signup: (email: string, pass: string, name: string, username?: string, base?: string) => Promise<boolean>;
  logout: () => void;
  updateEmail: (currentPassword: string, newEmail: string) => Promise<boolean>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  updateProfileName: (newName: string) => Promise<boolean>;
  updateBase: (newBase: string) => Promise<boolean>;
  checkLocalLogin: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const createUserDocument = async (
  userId: string,
  email: string,
  name: string,
  username?: string,
  base?: string,
  role: UserRole = 'driver'
): Promise<User> => {
  const startTime = performance.now();
  // console.log(`[AuthContext createUserDocument ${startTime}] Attempting to create/merge Firestore document for ${userId} in 'users' collection (DB: ${db?.databaseId}), role: ${role}, base: ${base}`);
  if (!db) {
    console.error(`[AuthContext createUserDocument ${startTime}] Firestore DB instance is not available. Cannot create user document for ${userId}.`);
    throw new Error('Firestore not initialized. Cannot create user document.');
  }
  const userDocRef = doc(db, 'users', userId);
  const effectiveRole = email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : role;
  const effectiveBase = effectiveRole === 'admin' ? 'ALL' : (base || 'N/A');

  const userData: Partial<Omit<User, 'id' | 'lastLogin'>> = {
    name,
    email,
    username: username || email.split('@')[0],
    role: effectiveRole,
    base: effectiveBase,
  };
  try {
    // console.log(`[AuthContext createUserDocument ${startTime}] Calling setDoc for user ${userId} in 'users' collection.`);
    await setDoc(userDocRef, userData, { merge: true });
    const endTime = performance.now();
    // console.log(`[AuthContext createUserDocument ${startTime}] Firestore document created/merged successfully for ${userId} in 'users'. Time: ${endTime - startTime} ms.`);
    return {
        id: userId,
        name: userData.name!,
        email: userData.email!,
        username: userData.username,
        role: userData.role!,
        base: userData.base!,
    };
  } catch (error: unknown) {
    const endTime = performance.now();
    let firestoreError = error as FirestoreError;
    console.error(`[AuthContext createUserDocument ${startTime}] Error creating/merging Firestore document for ${userId} in ${endTime - startTime} ms:`, firestoreError);
    throw new Error(`Failed to create/merge Firestore user document: ${firestoreError.message}`);
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

    const checkLocalLogin = useCallback(async (): Promise<boolean> => {
        const checkLocalStartTime = performance.now();
        // console.log(`[checkLocalLogin ${checkLocalStartTime}] Checking local IndexedDB for user...`);
        try {
            await openDB(); // Ensure DB is open
            // Attempt to get the user with the latest lastLogin timestamp
            const tx = (await openDB()).transaction(STORE_USERS, 'readonly');
            const store = tx.objectStore(STORE_USERS);
            const allUsers = await new Promise<LocalUser[]>((resolve, reject) => { 
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result as LocalUser[]);
                request.onerror = (e) => reject(request.error);
            });
            await tx.done;

            if (allUsers && allUsers.length > 0) {
                const latestUser = allUsers.reduce((latest, current) => {
                   const latestTime = latest.lastLogin ? new Date(latest.lastLogin).getTime() : 0;
                   const currentTime = current.lastLogin ? new Date(current.lastLogin).getTime() : 0;
                   return currentTime > latestTime ? current : latest;
                });
                const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                if (latestUser.lastLogin && new Date(latestUser.lastLogin).getTime() > sevenDaysAgo) {
                    let userToSet = { ...latestUser };
                    if (userToSet.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                        userToSet.role = 'admin';
                        userToSet.base = 'ALL';
                        if(latestUser.role !== 'admin' || latestUser.base !== 'ALL'){
                            saveLocalUser(userToSet).catch(err => console.error("Error saving forced admin role locally:", err));
                        }
                    } else if (!userToSet.base) {
                        userToSet.base = 'N/A'; // Ensure base has a default if missing
                        saveLocalUser(userToSet).catch(err => console.error("Error saving default base locally:", err));
                    }

                    const { passwordHash, ...finalUserToSet } = userToSet; 
                    setUser(finalUserToSet as User); 
                    setFirebaseUser(null); 
                    setLoading(false);
                    // console.log(`[checkLocalLogin ${checkLocalStartTime}] Local user session restored:`, finalUserToSet);
                    return true;
                }
            }
            // console.log(`[checkLocalLogin ${checkLocalStartTime}] No recent local user session found.`);
            setUser(null);
            setLoading(false);
            return false;
        } catch (error) {
            console.error(`[checkLocalLogin ${checkLocalStartTime}] Error checking local DB:`, error);
            setUser(null);
            setLoading(false);
            return false;
        }
    }, []);

    useEffect(() => {
        const listenerId = Math.random().toString(36).substring(2, 7);
        setLoading(true);
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;

        const setupFirebaseListener = () => {
            if (!auth) {
                // console.log(`[AuthContext onAuthStateChanged ${listenerId}] Firebase Auth instance not available. Skipping Firebase listener setup.`);
                if (!user) setLoading(false); 
                return;
            }
            // console.log(`[AuthContext onAuthStateChanged ${listenerId}] Setting up Firebase Auth listener.`);
            unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
              const authChangeStartTime = performance.now();
              // console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Received FB auth state. isMounted: ${isMounted}, fbUser present: ${!!fbUser}`);
              if (!isMounted) { /*console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Unmounted, ignoring.`);*/ return; }

              if (!fbUser) {
                  if (firebaseUser) { 
                      // console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user logged out. Clearing user state.`);
                      setUser(null);
                  } else {
                        // console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] No Firebase user, and no previous Firebase user. Local session might still be active.`);
                  }
                  setFirebaseUser(null);
                  setLoading(false);
                  // console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] No Firebase user. Loading set to false.`);
              } else {
                   // console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user (${fbUser.uid}) detected.`);
                   setFirebaseUser(fbUser);
                   try {
                       let localUserData = await getLocalUser(fbUser.uid);
                       const nowISO = new Date().toISOString();
                       let firestoreData: User | null = null;

                       if (!localUserData || !localUserData.role || !localUserData.base) {
                            // console.log(`[AuthContext onAuthStateChanged ${listenerId}] User ${fbUser.uid} needs local update/creation. Fetching from Firestore...`);
                            if (navigator.onLine) {
                                try {
                                    firestoreData = await getFirestoreUserData(fbUser.uid);
                                     // console.log(`[AuthContext onAuthStateChanged ${listenerId}] Firestore data for ${fbUser.uid}:`, firestoreData);
                                } catch (firestoreFetchError) {
                                     console.error(`[AuthContext onAuthStateChanged ${listenerId}] Error fetching Firestore data for ${fbUser.uid}:`, firestoreFetchError);
                                }
                            }
                       }

                       if (firestoreData) {
                            // console.log(`[AuthContext onAuthStateChanged ${listenerId}] Firestore data found for ${fbUser.uid}. Merging with local.`);
                            const existingLocal = await getLocalUser(fbUser.uid).catch(() => null);
                            const mergedLocal: DbUser = {
                                id: fbUser.uid, 
                                name: firestoreData.name || fbUser.displayName || fbUser.email || `Usuário ${fbUser.uid.substring(0,6)}`,
                                email: firestoreData.email || fbUser.email!,
                                username: firestoreData.username || (fbUser.email?.split('@')[0] || `user_${fbUser.uid.substring(0,6)}`),
                                role: firestoreData.role || (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : 'driver'),
                                base: firestoreData.base || (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'ALL' : 'N/A'),
                                passwordHash: existingLocal?.passwordHash || '', 
                                lastLogin: nowISO,
                                firebaseId: fbUser.uid,
                                syncStatus: 'synced'
                            };
                            await saveLocalUser(mergedLocal);
                            localUserData = mergedLocal;
                       } else if (!localUserData) {
                           // console.log(`[AuthContext onAuthStateChanged ${listenerId}] No local or Firestore data for ${fbUser.uid}. Creating new local user.`);
                           let basicRole: UserRole = fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : 'driver';
                           let basicBase = basicRole === 'admin' ? 'ALL' : 'N/A';
                           const basicLocalUser: DbUser = {
                                id: fbUser.uid,
                                email: fbUser.email || 'unknown@example.com',
                                name: fbUser.displayName || fbUser.email || `Usuário ${fbUser.uid.substring(0,6)}`,
                                username: fbUser.email?.split('@')[0] || `user_${fbUser.uid.substring(0,6)}`,
                                role: basicRole,
                                base: basicBase,
                                lastLogin: nowISO,
                                passwordHash: '',
                                firebaseId: fbUser.uid,
                                syncStatus: 'pending'
                            };
                            await saveLocalUser(basicLocalUser);
                            localUserData = basicLocalUser;
                            if (navigator.onLine) {
                                // console.log(`[AuthContext onAuthStateChanged ${listenerId}] Attempting to create Firestore document for new Firebase user ${fbUser.uid} (from Firebase Auth).`);
                                createUserDocument(fbUser.uid, basicLocalUser.email, basicLocalUser.name, basicLocalUser.username, basicLocalUser.base, basicLocalUser.role)
                                  .then(createdUserDoc => {
                                      saveLocalUser({...basicLocalUser, syncStatus: 'synced', name: createdUserDoc.name, base: createdUserDoc.base, role: createdUserDoc.role });
                                      // console.log(`[AuthContext onAuthStateChanged ${listenerId}] Firestore doc created for ${fbUser.uid}, local user updated to synced.`);
                                  })
                                  .catch(err => console.error(`[AuthContext onAuthStateChanged ${listenerId}] Background Firestore create for ${fbUser.uid} failed:`, err));
                            }
                       } else {
                           // console.log(`[AuthContext onAuthStateChanged ${listenerId}] User ${fbUser.uid} found locally. Updating last login and consistency.`);
                           localUserData.lastLogin = nowISO;
                           if (localUserData.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                                if (localUserData.role !== 'admin' || localUserData.base !== 'ALL') {
                                    localUserData.role = 'admin'; localUserData.base = 'ALL';
                                }
                            } else if (!localUserData.base) localUserData.base = 'N/A';
                            if (fbUser.displayName && !localUserData.name) localUserData.name = fbUser.displayName;
                            localUserData.firebaseId = fbUser.uid;
                            localUserData.syncStatus = 'synced';
                            await saveLocalUser(localUserData);
                       }

                       if (isMounted) {
                           const { passwordHash, ...userToSet } = localUserData;
                           setUser(userToSet as User); 
                           // console.log(`[AuthContext onAuthStateChanged ${listenerId}] User state set to:`, userToSet);
                       }
                   } catch (error: any) {
                       console.error(`[AuthContext onAuthStateChanged ${listenerId}] Error processing user data for ${fbUser.uid}:`, error);
                       if (isMounted) {
                            toast({ variant: "destructive", title: "Erro Dados Usuário", description: `Detalhes: ${error.message}`, duration: 9000 });
                       }
                   } finally {
                       if (isMounted) {
                          setLoading(false);
                           // console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Finished processing FB user ${fbUser?.uid}. Loading false.`);
                       }
                   }
              }
            });
        };

        checkLocalLogin().then(localUserFound => {
            // console.log(`[AuthProvider Effect ${listenerId}] checkLocalLogin completed. localUserFound: ${localUserFound}`);
            if (isMounted) {
                // console.log(`[AuthProvider Effect ${listenerId}] isMounted true. Setting up Firebase listener or finalizing loading.`);
                setupFirebaseListener();
            } else {
                 // console.log(`[AuthProvider Effect ${listenerId}] Unmounted after checkLocalLogin. No listener setup.`);
            }
        }).catch(err => {
             console.error(`[AuthProvider Effect ${listenerId}] Error during checkLocalLogin:`, err);
             if (isMounted) {
                // console.log(`[AuthProvider Effect ${listenerId}] Error in checkLocalLogin, but still mounted. Setting up Firebase listener.`);
                setupFirebaseListener();
             }
        });

        openDB().then(() => seedInitialUsers()).catch(seedError => console.error("[AuthProvider Effect] Error seeding initial users:", seedError));

        return () => {
            // console.log(`[AuthProvider Effect Cleanup ${listenerId}] Unmounting.`)
            isMounted = false;
            if (unsubscribe) {
                // console.log(`[AuthProvider Effect Cleanup ${listenerId}] Unsubscribing from Firebase Auth listener.`);
                unsubscribe();
            }
        };
      }, [checkLocalLogin, toast, firebaseUser]); 


   const login = async (emailOrUsername: string, pass: string): Promise<boolean> => {
     const loginStartTime = performance.now();
     const inputIsEmail = emailOrUsername.includes('@');
     // console.log(`[AuthProvider Login ${loginStartTime}] Attempting login with input: ${emailOrUsername}`);
     setLoading(true); 

     let localDbUser: DbUser | null = null;
     let emailForFirebase = emailOrUsername;

     try {
          if (inputIsEmail) {
            localDbUser = await getLocalUserByEmail(emailOrUsername);
          } else {
            localDbUser = await getLocalUserByUsername(emailOrUsername);
            if (localDbUser) emailForFirebase = localDbUser.email; 
          }

          if (localDbUser) {
             // console.log(`[AuthProvider Login ${loginStartTime}] Local user found for input ${emailOrUsername}:`, localDbUser);
             if (localDbUser.passwordHash) {
                 const isPasswordValid = await verifyPassword(pass, localDbUser.passwordHash);
                 if (isPasswordValid) {
                     // console.log(`[AuthProvider Login ${loginStartTime}] Local password verified for ${localDbUser.email}.`);
                     const nowISO = new Date().toISOString();
                     let userToUpdate = { ...localDbUser, lastLogin: nowISO };
                      if (userToUpdate.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                         userToUpdate.role = 'admin';
                         userToUpdate.base = 'ALL';
                      } else if (!userToUpdate.base) {
                         userToUpdate.base = 'N/A';
                      }
                     await saveLocalUser(userToUpdate);
                     const { passwordHash, ...userToSet } = userToUpdate; 
                     setUser(userToSet as User); 
                     setFirebaseUser(null); 
                     setLoading(false);
                     // console.log(`[AuthProvider Login ${loginStartTime}] Local login successful. User state set.`);
                     toast({ title: "Login Local Bem-sucedido!", description: "Conectado localmente." });
                     return true;
                 } else {
                    // console.log(`[AuthProvider Login ${loginStartTime}] Local password verification FAILED for ${localDbUser.email}.`);
                 }
             } else {
                // console.log(`[AuthProvider Login ${loginStartTime}] Local user ${localDbUser.email} found but has no passwordHash. Proceeding to online check.`);
             }
          } else {
             // console.log(`[AuthProvider Login ${loginStartTime}] No local user found for input ${emailOrUsername}.`);
          }

         if (!navigator.onLine) {
             // console.log(`[AuthProvider Login ${loginStartTime}] Offline. Cannot attempt Firebase login.`);
             toast({ variant: "destructive", title: "Offline", description: "Você está offline. Login online indisponível.", duration: 5000 });
             setLoading(false);
             if (localDbUser) toast({ variant: "destructive", title: "Falha no Login Offline", description: "Credenciais locais inválidas.", duration: 5000 });
             else toast({ variant: "destructive", title: "Falha no Login Offline", description: "Usuário não encontrado localmente.", duration: 5000 });
             return false;
         }

         if (!auth) {
            // console.error(`[AuthProvider Login ${loginStartTime}] Firebase Auth instance not available for online login.`);
            toast({ variant: "destructive", title: "Erro de Configuração", description: "Serviço de autenticação Firebase não está disponível." });
            setLoading(false);
            return false;
         }

         // console.log(`[AuthProvider Login ${loginStartTime}] Attempting Firebase signInWithEmailAndPassword with email: ${emailForFirebase}`);
         const userCredential = await signInWithEmailAndPassword(auth, emailForFirebase, pass);
         const loginEndTime = performance.now();
         // console.log(`[AuthProvider Login ${loginStartTime}] signInWithEmailAndPassword successful for ${userCredential.user.email}. Time: ${loginEndTime - loginStartTime} ms. Waiting for onAuthStateChanged...`);
         return true; 

     } catch (error: any) {
        const loginEndTime = performance.now();
        // console.error(`[AuthProvider Login ${loginStartTime}] Login failed for ${emailOrUsername}. Time: ${loginEndTime - loginStartTime} ms. Error Code: ${error.code}, Message: ${error.message}`); 
        let errorMessage = 'Falha no Login. Verifique seu e-mail/usuário e senha.';
         if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
             errorMessage = 'E-mail/usuário ou senha inválidos.';
         } else if (error.code === 'auth/invalid-email') {
             errorMessage = 'Formato de e-mail inválido.';
         } else if (error.code === 'auth/too-many-requests') {
              errorMessage = 'Muitas tentativas de login falhadas. Tente novamente mais tarde.';
         } else if (error.code === 'auth/network-request-failed') {
               errorMessage = 'Erro de rede ao tentar fazer login online. Verifique sua conexão.';
         } else if (error.code === 'auth/operation-not-allowed') {
                errorMessage = 'Login com e-mail/senha não está habilitado. Contacte o administrador.';
         } else if (error.code?.includes('auth/configuration-not-found') || error.code === 'auth/invalid-api-key') {
              errorMessage = 'Erro de configuração do Firebase. Verifique as chaves de API e outras configurações na console do Firebase e no seu arquivo .env.';
          } else if (error.code?.includes('auth/')) { 
               errorMessage = `Erro de autenticação (${error.code}). Tente novamente.`;
          } else { 
              errorMessage = 'Ocorreu um erro inesperado durante o login. Verifique sua conexão e tente novamente.';
          }
        toast({ variant: "destructive", title: "Falha no Login", description: errorMessage, duration: 9000 });
        setUser(null); 
        setFirebaseUser(null);
        setLoading(false);
        return false;
     }
   };

   const signup = async (email: string, pass: string, name: string, usernameInput?: string, base?: string): Promise<boolean> => {
     const signupStartTime = performance.now();
     const finalUsername = usernameInput?.trim() || email.split('@')[0];
     // console.log(`[AuthContext Signup ${signupStartTime}] Attempting signup for ${email}, username: ${finalUsername}, base: ${base}`);
     setLoading(true);

     const isAdminUser = email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br';
     const userRole: UserRole = isAdminUser ? 'admin' : 'driver';
     const userBase = isAdminUser ? 'ALL' : (base?.trim().toUpperCase() || 'N/A');
     let tempLocalId = `local_user_${finalUsername.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
     let finalUserId = tempLocalId; 

     try {
         const existingLocalUserByEmail = await getLocalUserByEmail(email);
         if (existingLocalUserByEmail) {
              // console.warn(`[AuthContext Signup ${signupStartTime}] Email ${email} already exists locally.`);
              toast({ variant: "destructive", title: "Falha no Cadastro", description: "Este e-mail já está cadastrado localmente." });
              setLoading(false); return false;
         }
         if (finalUsername) {
            const existingLocalUserByUsername = await getLocalUserByUsername(finalUsername);
            if (existingLocalUserByUsername) {
                // console.warn(`[AuthContext Signup ${signupStartTime}] Username ${finalUsername} already exists locally.`);
                toast({ variant: "destructive", title: "Falha no Cadastro", description: "Este nome de usuário já está em uso localmente." });
                setLoading(false); return false;
            }
         }
         // console.log(`[AuthContext Signup ${signupStartTime}] Hashing password for ${email}.`);
         const passwordHash = await hashPassword(pass);
         // console.log(`[AuthContext Signup ${signupStartTime}] Password hashed. Preparing local user data.`);
         const newUserLocalData: DbUser = {
            id: tempLocalId, email, name, username: finalUsername, role: userRole, base: userBase,
            lastLogin: new Date().toISOString(), passwordHash, syncStatus: 'pending',
         };
         // console.log(`[AuthContext Signup ${signupStartTime}] Saving new user locally with temp ID: ${tempLocalId}. Data:`, newUserLocalData);
         await saveLocalUser(newUserLocalData);
         // console.log(`[AuthContext Signup ${signupStartTime}] User initially saved locally with temp ID: ${tempLocalId}.`);

         if (auth && navigator.onLine) {
             try {
                 // console.log(`[AuthContext Signup ${signupStartTime}] Attempting Firebase createUserWithEmailAndPassword for ${email}.`);
                 const userCredential = await firebaseCreateUserWithEmailAndPassword(auth, email, pass);
                 finalUserId = userCredential.user.uid; 
                 // console.log(`[AuthContext Signup ${signupStartTime}] Firebase Auth user created: ${finalUserId}.`);

                 await deleteLocalUser(tempLocalId).catch(e => console.warn(`Failed to delete temp local user ${tempLocalId}:`, e));

                 const firebaseLinkedLocalData: DbUser = {
                     ...newUserLocalData, id: finalUserId, firebaseId: finalUserId, syncStatus: 'synced'
                 };
                 // console.log(`[AuthContext Signup ${signupStartTime}] Saving updated local user record with Firebase ID: ${finalUserId}. Data:`, firebaseLinkedLocalData);
                 await saveLocalUser(firebaseLinkedLocalData);
                 // console.log(`[AuthContext Signup ${signupStartTime}] Local user record updated with Firebase ID: ${finalUserId}.`);

                 // console.log(`[AuthContext Signup ${signupStartTime}] Creating Firestore document for new Firebase user ${finalUserId}.`);
                 await createUserDocument(finalUserId, email, name, finalUsername, userBase, userRole);

                 // console.log(`[AuthContext Signup ${signupStartTime}] Signing out user ${finalUserId} after successful Firebase signup and Firestore doc creation.`);
                 await firebaseSignOut(auth);
             } catch (firebaseError: any) {
                  // console.warn(`[AuthContext Signup ${signupStartTime}] Firebase signup/setup failed. User remains local-only with temp ID ${tempLocalId}. Error: ${firebaseError.code}, ${firebaseError.message}`);
                   let fbErrorDesc = "Falha ao criar usuário online. A conta funcionará localmente.";
                    if (firebaseError.code === 'auth/email-already-in-use') {
                        fbErrorDesc = "E-mail já em uso online. A conta local foi criada. Tente fazer login.";
                    } else if (firebaseError.code === 'auth/weak-password') {
                        fbErrorDesc = "Senha fraca (mínimo 6 caracteres). Conta local criada.";
                    } else if (firebaseError.code?.includes('auth/configuration-not-found') || firebaseError.code === 'auth/invalid-api-key') {
                         fbErrorDesc = 'Erro de configuração do Firebase. A conta local foi criada.';
                     }
                   toast({ variant: "destructive", title: "Aviso Cadastro Online", description: fbErrorDesc, duration: 7000 });
             }
         } else {
             // console.log(`[AuthContext Signup ${signupStartTime}] Skipping Firebase signup (Offline or Auth unavailable). User ${tempLocalId} remains local-only.`);
         }
         // console.log(`[AuthContext Signup ${signupStartTime}] Signup process complete for input ${email}. Final User ID (if Firebase): ${finalUserId}, Temp Local ID (if only local): ${tempLocalId}.`);
         toast({ title: 'Cadastro local realizado com sucesso!', description: 'Você já pode fazer login.' });
         setLoading(false); return true;
     } catch (error: any) {
       console.error(`[AuthContext Signup ${signupStartTime}] Local Signup failed for ${email}. Error: `, error);
       toast({ variant: "destructive", title: "Falha no Cadastro Local", description: `Erro: ${error.message || 'Verifique os dados.'}`, duration: 9000 });
       setLoading(false); return false;
     }
   };

  const logout = async () => {
    const logoutStartTime = performance.now();
    // console.log(`[AuthProvider Logout ${logoutStartTime}] Initiating logout...`);
    setLoading(true);
    setUser(null); setFirebaseUser(null); 
    try {
        if (auth) {
            // console.log(`[AuthProvider Logout ${logoutStartTime}] Firebase Auth instance exists. Signing out from Firebase.`);
            await firebaseSignOut(auth);
        } else {
            // console.log(`[AuthProvider Logout ${logoutStartTime}] Firebase Auth instance not available. Local state cleared.`);
        }
        // console.log(`[AuthProvider Logout ${logoutStartTime}] Logout successful.`);
        toast({title: "Logout", description: "Você saiu do sistema."})
    } catch (error) {
      console.error(`[AuthProvider Logout ${logoutStartTime}] Error during Firebase signOut:`, error);
      toast({ variant: "destructive", title: "Erro no Logout", description: "Não foi possível sair completamente do Firebase." });
    } finally {
        setLoading(false);
        // console.log(`[AuthProvider Logout ${logoutStartTime}] Logout process finished. Loading set to false.`);
    }
  };

  const reauthenticate = async (currentPassword: string): Promise<boolean> => {
      // console.log("[AuthProvider Reauthenticate] Attempting reauthentication...");
      if (!firebaseUser && !user) {
           // console.warn("[AuthProvider Reauthenticate] No Firebase or local user session active.");
           toast({ variant: "destructive", title: "Erro", description: "Nenhuma sessão de usuário ativa." });
           return false;
      }

      if (firebaseUser && auth && navigator.onLine) {
          try {
              // console.log(`[AuthProvider Reauthenticate] Attempting Firebase reauthentication for ${firebaseUser.email}.`);
              const credential = EmailAuthProvider.credential(firebaseUser.email!, currentPassword);
              await reauthenticateWithCredential(firebaseUser, credential);
              // console.log(`[AuthProvider Reauthenticate] Firebase reauthentication successful for ${firebaseUser.email}.`);
              return true;
          } catch (error: any) {
               // console.warn(`[AuthProvider Reauthenticate] Firebase reauthentication failed for ${firebaseUser.email}. Error: ${error.code}`);
               if (error.code !== 'auth/wrong-password' && error.code !== 'auth/invalid-credential') {
                   toast({ variant: "destructive", title: "Reautenticação Online Falhou", description: "Erro ao reautenticar online. Verifique sua conexão ou tente mais tarde." });
                   return false; 
               }
          }
      }

      if (user?.email) {
           // console.log(`[AuthProvider Reauthenticate] Attempting local password verification for ${user.email}.`);
           const localDbUser = await getLocalUserByEmail(user.email); 
           if (localDbUser?.passwordHash && await verifyPassword(currentPassword, localDbUser.passwordHash)) {
               // console.log(`[AuthProvider Reauthenticate] Local password verification successful for ${user.email}.`);
               return true;
           } else {
               // console.warn(`[AuthProvider Reauthenticate] Local password verification failed for ${user.email}.`);
           }
      }

      // console.warn("[AuthProvider Reauthenticate] All reauthentication methods failed.");
      toast({ variant: "destructive", title: "Autenticação Falhou", description: "Senha atual incorreta." });
      return false;
  };

    const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
        const updateEmailStartTime = performance.now();
        // console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempting to update email to ${newEmail}.`);
        if (!user) { /* console.warn(`[AuthProvider UpdateEmail ${updateEmailStartTime}] No user authenticated.`); */ toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." }); return false; }
        if (user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
            // console.warn(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempted to change email for super admin.`);
            toast({ variant: "destructive", title: "Operação não permitida", description: "Não é possível alterar o e-mail deste usuário." }); return false;
        }
        setLoading(true);
        const isAuthenticated = await reauthenticate(currentPassword);
        if (!isAuthenticated) { /* console.warn(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Reauthentication failed.`); */ setLoading(false); return false; }

        const originalEmail = user.email;
        try {
            if (firebaseUser && auth && navigator.onLine) {
                 // console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempting Firebase email update for ${firebaseUser.uid}.`);
                 await firebaseUpdateEmail(firebaseUser, newEmail);
                 // console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase email updated successfully.`);
            }

            const currentDbUser = await getLocalUser(user.id);
            if (!currentDbUser) { /* console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Local user ${user.id} not found for update.`); */ throw new Error("Usuário local não encontrado."); }
            const updatedDbUser: DbUser = { ...currentDbUser, email: newEmail, username: newEmail.split('@')[0], lastLogin: new Date().toISOString(), syncStatus: 'pending' }; 
            // console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Updating local DB for user ${user.id}. New data:`, updatedDbUser);
            await saveLocalUser(updatedDbUser);
            setUser({ ...user, email: newEmail, username: newEmail.split('@')[0] }); 

             if (db && navigator.onLine && (user.firebaseId || firebaseUser?.uid)) {
                 const userIdToUpdateOnline = user.firebaseId || firebaseUser!.uid;
                 try {
                    // console.log(`[AuthContext updateEmail] Attempting to update Firestore email for ${userIdToUpdateOnline}.`);
                    await setFirestoreUserData(userIdToUpdateOnline, { email: newEmail, username: newEmail.split('@')[0] }); 
                    // console.log(`[AuthContext updateEmail] Firestore email updated for ${userIdToUpdateOnline}.`);
                 } catch (firestoreError) {
                      console.error(`[AuthContext updateEmail] Failed to update Firestore email for ${userIdToUpdateOnline}:`, firestoreError);
                      toast({variant: "destructive", title: "Aviso Firestore", description: "E-mail atualizado localmente, mas falha ao atualizar online."})
                 }
            }
            // console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update process successful for user ${user.id}.`);
            toast({ title: "Sucesso", description: "E-mail atualizado." });
            return true;
        } catch (error: any) {
             // console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Error updating email for user ${user.id}. Error: ${error.code}, ${error.message}`);
             setUser({ ...user, email: originalEmail, username: originalEmail.split('@')[0] });
             const currentDbUserToRollback = await getLocalUser(user.id);
             if(currentDbUserToRollback) {
                await saveLocalUser({...currentDbUserToRollback, email: originalEmail, username: originalEmail.split('@')[0]}).catch(e => console.error("CRITICAL: Failed to rollback local DB email", e));
             }
             let desc = "Não foi possível atualizar o e-mail.";
             if (error.code === 'auth/email-already-in-use') desc = "E-mail já em uso.";
             else if (error.code === 'auth/invalid-email') desc = "Novo e-mail inválido.";
             toast({ variant: "destructive", title: "Falha", description: desc });
             return false;
        } finally {
            setLoading(false);
        }
    };

  const updatePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
      const updatePasswordStartTime = performance.now();
      // console.log(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Attempting to update password.`);
      if (!user) { /* console.warn(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] No user authenticated.`); */ toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." }); return false; }
      setLoading(true);
      const isAuthenticated = await reauthenticate(currentPassword);
      if (!isAuthenticated) { /* console.warn(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Reauthentication failed.`); */ setLoading(false); return false; }
      try {
           // console.log(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Hashing new password.`);
           const newPasswordHash = await hashPassword(newPassword);
           // console.log(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] New password hashed.`);

            if (firebaseUser && auth && navigator.onLine) {
               // console.log(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Attempting Firebase password update for ${firebaseUser.uid}.`);
               await firebaseUpdatePassword(firebaseUser, newPassword);
               // console.log(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Firebase password updated successfully.`);
            }

           const currentDbUser = await getLocalUser(user.id);
           if (!currentDbUser) { /* console.error(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Local user ${user.id} not found for update.`); */ throw new Error("Usuário local não encontrado."); }
           const updatedDbUser: DbUser = { ...currentDbUser, passwordHash: newPasswordHash, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
           // console.log(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Updating local DB for user ${user.id}.`);
           await saveLocalUser(updatedDbUser);

           // console.log(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Password update process successful for user ${user.id}.`);
           toast({ title: "Sucesso", description: "Senha atualizada." });
           return true;
      } catch (error: any) {
           // console.error(`[AuthProvider UpdatePassword ${updatePasswordStartTime}] Error updating password for user ${user.id}. Error: ${error.code}, ${error.message}`);
           let desc = "Erro ao atualizar senha.";
           if (error.code === 'auth/weak-password') desc = "Nova senha muito fraca (mínimo 6 caracteres).";
           toast({ variant: "destructive", title: "Falha", description: desc });
           return false;
      } finally {
          setLoading(false);
      }
  };

    const updateProfileName = async (newName: string): Promise<boolean> => {
        const updateNameStartTime = performance.now();
        // console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Attempting to update name to ${newName}.`);
        if (!user) { /* console.warn(`[AuthProvider UpdateName ${updateNameStartTime}] No user authenticated.`); */ toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." }); return false; }
        if (!newName.trim()) { /* console.warn(`[AuthProvider UpdateName ${updateNameStartTime}] New name is empty.`); */ toast({ variant: "destructive", title: "Erro", description: "Nome não pode ser vazio." }); return false; }
        setLoading(true);
        const originalName = user.name;
        try {
             const currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) { /* console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Local user ${user.id} not found for update.`); */ throw new Error("Usuário local não encontrado."); }
             const updatedDbUser: DbUser = { ...currentDbUser, name: newName, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
             // console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Updating local DB for user ${user.id}. New data:`, updatedDbUser);
             await saveLocalUser(updatedDbUser);
             setUser({ ...user, name: newName }); 

            if (db && navigator.onLine && (user.firebaseId || firebaseUser?.uid)) {
                const userIdToUpdateOnline = user.firebaseId || firebaseUser!.uid;
                try {
                    // console.log(`[AuthContext updateProfileName] Attempting to update Firestore name for ${userIdToUpdateOnline}.`);
                    await setFirestoreUserData(userIdToUpdateOnline, { name: newName });
                    // console.log(`[AuthContext updateProfileName] Firestore name updated for ${userIdToUpdateOnline}.`);
                } catch (firestoreError) {
                     console.error(`[AuthContext updateProfileName] Failed to update Firestore name for ${userIdToUpdateOnline}:`, firestoreError);
                     toast({variant: "destructive", title: "Aviso Firestore", description: "Nome atualizado localmente, mas falha ao atualizar online."})
                }
            }
            // console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Name update process successful for user ${user.id}.`);
            toast({ title: "Sucesso", description: "Nome atualizado." });
            return true;
        } catch (error) {
             // console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Error updating name for user ${user.id}. Error:`, error);
             setUser({ ...user, name: originalName });
             const currentDbUserToRollback = await getLocalUser(user.id);
             if(currentDbUserToRollback) {
                await saveLocalUser({...currentDbUserToRollback, name: originalName}).catch(e => console.error("CRITICAL: Failed to rollback local DB name", e));
             }
             toast({ variant: "destructive", title: "Falha Local", description: "Não foi possível salvar o nome localmente." });
            return false;
        } finally {
            setLoading(false);
        }
    };

    const updateBase = async (newBase: string): Promise<boolean> => {
        const updateBaseStartTime = performance.now();
        // console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Attempting to update base to ${newBase}.`);
        if (!user) { /* console.warn(`[AuthProvider UpdateBase ${updateBaseStartTime}] No user authenticated.`); */ toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." }); return false; }
        if (user.role === 'admin' || user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
             // console.warn(`[AuthProvider UpdateBase ${updateBaseStartTime}] Attempted to change base for admin user.`);
             toast({ variant: "destructive", title: "Operação não permitida", description: "Base do administrador não pode ser alterada." }); return false;
        }
        if (!newBase.trim()) { /* console.warn(`[AuthProvider UpdateBase ${updateBaseStartTime}] New base is empty.`); */ toast({ variant: "destructive", title: "Erro", description: "Base não pode ser vazia." }); return false; }
        setLoading(true);
        const originalBase = user.base;
        const upperNewBase = newBase.trim().toUpperCase();
        try {
             const currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) { /* console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Local user ${user.id} not found for update.`); */ throw new Error("Usuário local não encontrado."); }
             const updatedDbUser: DbUser = { ...currentDbUser, base: upperNewBase, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
             // console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Updating local DB for user ${user.id}. New data:`, updatedDbUser);
             await saveLocalUser(updatedDbUser);
             setUser({ ...user, base: upperNewBase }); 

             if (db && navigator.onLine && (user.firebaseId || firebaseUser?.uid)) {
                 const userIdToUpdateOnline = user.firebaseId || firebaseUser!.uid;
                 try {
                     // console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Attempting to update Firestore base for ${userIdToUpdateOnline}.`);
                     await setFirestoreUserData(userIdToUpdateOnline, { base: upperNewBase });
                     // console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Firestore base updated for ${userIdToUpdateOnline}.`);
                 } catch (firestoreError: any) { // Changed to any to access error.message
                      console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Failed to update Firestore base for ${userIdToUpdateOnline}:`, firestoreError);
                      toast({variant: "destructive", title: "Aviso Firestore", description: `Base atualizada localmente, mas falha ao atualizar online. Erro: ${firestoreError.message}`});
                 }
             }
             // console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Base update process successful for user ${user.id}.`);
             toast({ title: "Sucesso", description: "Base atualizada." });
             return true;
         } catch (error: any) { // Changed to any to access error.message
              // console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Error updating base for user ${user.id}. Error:`, error);
              setUser({ ...user, base: originalBase });
              const currentDbUserToRollback = await getLocalUser(user.id);
              if(currentDbUserToRollback) {
                  await saveLocalUser({...currentDbUserToRollback, base: originalBase}).catch(e => console.error("CRITICAL: Failed to rollback local DB base", e));
              }
              toast({ variant: "destructive", title: "Falha Local", description: `Não foi possível salvar a base localmente. Erro: ${error.message}` });
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

