
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
import { auth, db } from '@/lib/firebase'; // Ensure db is imported if createUserDocument uses it directly
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser,
    LocalUser as DbUser,
    openDB,
    STORE_USERS,
    getLocalUserByEmail,
    seedInitialUsers, // Assuming this is correctly defined and exported
    getLocalUserByUsername,
} from '@/services/localDbService';
import { hashPassword, verifyPassword } from '@/lib/passwordUtils';
import { useCallback } from 'react';

export type UserRole = 'driver' | 'admin';
export interface User extends Omit<DbUser, 'passwordHash'> {} // User for UI and context, without hash
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

// Ensure createUserDocument is defined before being used by AuthProvider
const createUserDocument = async (
  userId: string,
  email: string,
  name: string,
  username?: string,
  base?: string,
  role: UserRole = 'driver'
): Promise<User & { firebaseId: string }> => { // Added firebaseId to return type
  const startTime = performance.now();
  console.log(`[AuthContext createUserDocument ${startTime}] Attempting to create/merge Firestore document for ${userId}, role: ${role}, base: ${base}`);
  if (!db) {
    console.error(`[AuthContext createUserDocument ${startTime}] Firestore DB instance is not available.`);
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
    await setDoc(userDocRef, userData, { merge: true });
    const endTime = performance.now();
    console.log(`[AuthContext createUserDocument ${startTime}] Firestore document created/merged for ${userId}. Time: ${endTime - startTime} ms.`);
    return {
        id: userId,
        firebaseId: userId, // Ensure firebaseId is included
        name: userData.name!,
        email: userData.email!,
        username: userData.username,
        role: userData.role!,
        base: userData.base!,
    };
  } catch (error: unknown) {
    const endTime = performance.now();
    let firestoreError = error as FirestoreError;
    console.error(`[AuthContext createUserDocument ${startTime}] Error Firestore doc for ${userId}. Time: ${endTime - startTime} ms:`, firestoreError);
    throw new Error(`Failed to create/merge Firestore user document: ${firestoreError.message}`);
  }
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true); // Start with loading true
  const { toast } = useToast();

    const checkLocalLogin = useCallback(async (): Promise<boolean> => {
        const checkLocalStartTime = performance.now();
        console.log(`[AuthContext checkLocalLogin ${checkLocalStartTime}] Checking local IndexedDB for user...`);
        try {
            await openDB();
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
                if (latestUser.lastLogin && new Date(latestUser.lastLogin).getTime() > sevenDaysAgo && !latestUser.deleted) {
                    let userToSet: DbUser = { ...latestUser };
                    if (userToSet.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                        userToSet.role = 'admin'; userToSet.base = 'ALL';
                    } else if (!userToSet.base) userToSet.base = 'N/A';

                    const { passwordHash, ...finalUserToSet } = userToSet;
                    setUser(finalUserToSet as User);
                    setFirebaseUser(null); // No active Firebase session initially from local restore
                    console.log(`[AuthContext checkLocalLogin ${checkLocalStartTime}] Local user session restored:`, finalUserToSet.id);
                    return true;
                }
            }
            console.log(`[AuthContext checkLocalLogin ${checkLocalStartTime}] No recent local user session found.`);
            setUser(null);
            return false;
        } catch (error) {
            console.error(`[AuthContext checkLocalLogin ${checkLocalStartTime}] Error checking local DB:`, error);
            setUser(null);
            return false;
        } finally {
             // setLoading(false); // Moved to onAuthStateChanged listener for final loading state
        }
    }, []);

    useEffect(() => {
        const listenerId = Math.random().toString(36).substring(2, 7);
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;

        console.log(`[AuthContext useEffect ${listenerId}] Running. Initializing auth state...`);
        setLoading(true); // Set loading to true when effect runs

        const initializeAuth = async () => {
            await checkLocalLogin(); // Check local login first

            if (!auth) {
                console.warn(`[AuthContext onAuthStateChanged ${listenerId}] Firebase Auth instance not available. Skipping Firebase listener setup.`);
                if(isMounted) setLoading(false); // If no Firebase auth, set loading false after local check
                return;
            }

            console.log(`[AuthContext onAuthStateChanged ${listenerId}] Setting up Firebase Auth listener.`);
            unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
              const authChangeStartTime = performance.now();
              console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Received FB auth state. isMounted: ${isMounted}, fbUser present: ${!!fbUser}`);
              if (!isMounted) { console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Unmounted, ignoring.`); return; }

              if (!fbUser) {
                  if (firebaseUser) { // Was previously a Firebase user, now logged out from Firebase
                      console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user logged out. Clearing user state if not already cleared by local check.`);
                      setUser(null); // Explicitly clear if Firebase logs out
                  } else {
                      console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] No Firebase user, and no previous Firebase user. Local session (if any) governs.`);
                  }
                  setFirebaseUser(null);
                  if(isMounted) setLoading(false); // Firebase done, loading is false
                  console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] No Firebase user. Final loading set to false.`);
              } else {
                   console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Firebase user (${fbUser.uid}) detected.`);
                   setFirebaseUser(fbUser);
                   try {
                       let localUserData: DbUser | null = await getLocalUser(fbUser.uid).catch(() => null);
                       const nowISO = new Date().toISOString();
                       let userToSetInContext: DbUser;

                       if (localUserData && !localUserData.deleted) { // Local user exists and is not marked deleted
                           console.log(`[AuthContext onAuthStateChanged ${listenerId}] Local user ${fbUser.uid} found. Updating lastLogin and ensuring consistency.`);
                           localUserData.lastLogin = nowISO;
                           if (localUserData.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                               if (localUserData.role !== 'admin' || localUserData.base !== 'ALL') {
                                   localUserData.role = 'admin'; localUserData.base = 'ALL';
                               }
                           } else if (!localUserData.base) localUserData.base = 'N/A';
                           if (fbUser.displayName && !localUserData.name) localUserData.name = fbUser.displayName;
                           localUserData.firebaseId = fbUser.uid; // Crucial: ensure firebaseId is set
                           localUserData.syncStatus = 'synced'; // Assume synced if FB user exists
                           await saveLocalUser(localUserData);
                           userToSetInContext = localUserData;
                       } else { // No local user, or local user was marked deleted - fetch/create new
                           console.log(`[AuthContext onAuthStateChanged ${listenerId}] No valid local user for ${fbUser.uid}. Fetching/Creating...`);
                           let firestoreData: (User & { firebaseId: string }) | null = null;
                           if (navigator.onLine) {
                               try {
                                   firestoreData = await getFirestoreUserData(fbUser.uid) as (User & { firebaseId: string }) | null;
                                   console.log(`[AuthContext onAuthStateChanged ${listenerId}] Firestore data for ${fbUser.uid}:`, firestoreData);
                               } catch (firestoreFetchError) {
                                    console.error(`[AuthContext onAuthStateChanged ${listenerId}] Error fetching Firestore data for ${fbUser.uid}:`, firestoreFetchError);
                               }
                           }

                           if (firestoreData) {
                               userToSetInContext = {
                                   id: fbUser.uid, firebaseId: fbUser.uid,
                                   name: firestoreData.name || fbUser.displayName || fbUser.email?.split('@')[0] || `Usuário ${fbUser.uid.substring(0,6)}`,
                                   email: firestoreData.email || fbUser.email!,
                                   username: firestoreData.username || fbUser.email?.split('@')[0] || `user_${fbUser.uid.substring(0,6)}`,
                                   role: firestoreData.role || (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : 'driver'),
                                   base: firestoreData.base || (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'ALL' : 'N/A'),
                                   lastLogin: nowISO, syncStatus: 'synced', passwordHash: localUserData?.passwordHash || '', // Keep local hash if exists
                               };
                           } else { // No Firestore data either, create new user doc based on Auth info
                               console.log(`[AuthContext onAuthStateChanged ${listenerId}] No Firestore data. Creating new user document for ${fbUser.uid}.`);
                               const createdDoc = await createUserDocument(
                                   fbUser.uid, fbUser.email!, fbUser.displayName || fbUser.email?.split('@')[0] || `Usuário ${fbUser.uid.substring(0,6)}`,
                                   fbUser.email?.split('@')[0] || `user_${fbUser.uid.substring(0,6)}`,
                                   (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'ALL' : 'N/A'),
                                   (fbUser.email?.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? 'admin' : 'driver')
                               );
                               userToSetInContext = {
                                   ...createdDoc, id: fbUser.uid, firebaseId: fbUser.uid, // Ensure firebaseId
                                   lastLogin: nowISO, syncStatus: 'synced', passwordHash: '', // New online user, no local hash initially
                               };
                           }
                           console.log(`[AuthContext onAuthStateChanged ${listenerId}] Saving new/updated local user data for ${fbUser.uid}:`, userToSetInContext)
                           await saveLocalUser(userToSetInContext);
                       }

                       if (isMounted) {
                           const { passwordHash, ...finalUserToSet } = userToSetInContext;
                           setUser(finalUserToSet as User);
                           console.log(`[AuthContext onAuthStateChanged ${listenerId}] Setting user state in AuthContext with:`, { id: finalUserToSet.id, firebaseId: finalUserToSet.firebaseId, email: finalUserToSet.email, role: finalUserToSet.role });
                       }
                   } catch (error: any) {
                       console.error(`[AuthContext onAuthStateChanged ${listenerId}] Error processing user data for ${fbUser.uid}:`, error);
                       if (isMounted) toast({ variant: "destructive", title: "Erro Dados Usuário", description: `Detalhes: ${error.message}`, duration: 9000 });
                   } finally {
                       if (isMounted) {
                          setLoading(false); // Auth process complete, loading is false
                          console.log(`[AuthContext onAuthStateChanged ${listenerId} ${authChangeStartTime}] Finished processing FB user ${fbUser?.uid}. Final loading set to false.`);
                       }
                   }
              }
            });
        };

        initializeAuth();
        openDB().then(() => seedInitialUsers()).catch(seedError => console.error("[AuthProvider Effect] Error seeding initial users:", seedError));

        return () => {
            console.log(`[AuthContext useEffect Cleanup ${listenerId}] Unmounting.`)
            isMounted = false;
            if (unsubscribe) {
                console.log(`[AuthContext useEffect Cleanup ${listenerId}] Unsubscribing from Firebase Auth listener.`);
                unsubscribe();
            }
        };
      }, [checkLocalLogin, toast]); // Removed firebaseUser from deps to avoid re-triggering on its change


   const login = async (emailOrUsername: string, pass: string): Promise<boolean> => {
     const loginStartTime = performance.now();
     const inputIsEmail = emailOrUsername.includes('@');
     console.log(`[AuthContext Login ${loginStartTime}] Attempting login with input: ${emailOrUsername}`);
     setLoading(true); // Set loading true at the start of login attempt

     let localDbUser: DbUser | null = null;
     let emailForFirebase = emailOrUsername;

     try {
          if (inputIsEmail) {
            localDbUser = await getLocalUserByEmail(emailOrUsername);
          } else {
            localDbUser = await getLocalUserByUsername(emailOrUsername);
            if (localDbUser) emailForFirebase = localDbUser.email;
            else { // No local user by username, try to see if input itself is an email of an existing local user
                const byEmail = await getLocalUserByEmail(emailOrUsername);
                if (byEmail) localDbUser = byEmail; // Should not happen if inputIsEmail was false unless username is an email string
            }
          }

          if (localDbUser && !localDbUser.deleted) {
             console.log(`[AuthContext Login ${loginStartTime}] Local user found for input ${emailOrUsername}: ${localDbUser.id}`);
             if (localDbUser.passwordHash) {
                 const isPasswordValid = await verifyPassword(pass, localDbUser.passwordHash);
                 if (isPasswordValid) {
                     console.log(`[AuthContext Login ${loginStartTime}] Local password verified for ${localDbUser.email}.`);
                     const nowISO = new Date().toISOString();
                     let userToUpdate: DbUser = { ...localDbUser, lastLogin: nowISO };
                      if (userToUpdate.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
                         userToUpdate.role = 'admin'; userToUpdate.base = 'ALL';
                      } else if (!userToUpdate.base) userToUpdate.base = 'N/A';
                     if(!userToUpdate.firebaseId && auth && auth.currentUser && auth.currentUser.email === userToUpdate.email) {
                        userToUpdate.firebaseId = auth.currentUser.uid; // Link if firebase user already logged in matches
                        userToUpdate.syncStatus = 'synced';
                     }
                     await saveLocalUser(userToUpdate);
                     const { passwordHash, ...userToSet } = userToUpdate;
                     setUser(userToSet as User);
                     setFirebaseUser(auth?.currentUser || null); // Reflect current Firebase auth state
                     setLoading(false);
                     console.log(`[AuthContext Login ${loginStartTime}] Local login successful. User state set. Loading false.`);
                     toast({ title: "Login Local Bem-sucedido!", description: "Conectado localmente." });
                     return true;
                 } else {
                    console.warn(`[AuthContext Login ${loginStartTime}] Local password verification FAILED for ${localDbUser.email}.`);
                 }
             } else {
                console.log(`[AuthContext Login ${loginStartTime}] Local user ${localDbUser.email} found but has no passwordHash. Proceeding to online check if online.`);
             }
          } else {
             console.log(`[AuthContext Login ${loginStartTime}] No active local user found for input ${emailOrUsername}.`);
          }

         if (!navigator.onLine) {
             console.log(`[AuthContext Login ${loginStartTime}] Offline. Cannot attempt Firebase login.`);
             toast({ variant: "destructive", title: "Offline", description: "Você está offline. Login online indisponível.", duration: 5000 });
             setLoading(false);
             if (localDbUser) toast({ variant: "destructive", title: "Falha no Login Offline", description: "Credenciais locais inválidas.", duration: 5000 });
             else toast({ variant: "destructive", title: "Falha no Login Offline", description: "Usuário não encontrado localmente.", duration: 5000 });
             return false;
         }

         if (!auth) {
            console.error(`[AuthContext Login ${loginStartTime}] Firebase Auth instance not available for online login.`);
            toast({ variant: "destructive", title: "Erro de Configuração", description: "Serviço de autenticação Firebase não está disponível." });
            setLoading(false);
            return false;
         }

         console.log(`[AuthContext Login ${loginStartTime}] Attempting Firebase signInWithEmailAndPassword with email: ${emailForFirebase}`);
         // onAuthStateChanged will handle setting user and firebaseUser states
         await signInWithEmailAndPassword(auth, emailForFirebase, pass);
         const loginEndTimeFirebase = performance.now();
         console.log(`[AuthContext Login ${loginStartTime}] Firebase signInWithEmailAndPassword successful for ${emailForFirebase}. Time: ${loginEndTimeFirebase - loginStartTime} ms. Auth listener will handle state update.`);
         // setLoading(false) will be handled by onAuthStateChanged
         return true;

     } catch (error: any) {
        const loginErrorTime = performance.now();
        console.error(`[AuthContext Login ${loginStartTime}] Login failed for ${emailOrUsername}. Time: ${loginErrorTime - loginStartTime} ms. Error Code: ${error.code}, Message: ${error.message}`);
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
     console.log(`[AuthContext Signup ${signupStartTime}] Attempting signup for ${email}, username: ${finalUsername}, base: ${base}`);
     setLoading(true);

     const isAdminUser = email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br';
     const userRole: UserRole = isAdminUser ? 'admin' : 'driver';
     const userBase = isAdminUser ? 'ALL' : (base?.trim().toUpperCase() || 'N/A');
     let tempLocalId = `local_user_${finalUsername.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;


     try {
         const existingLocalUserByEmail = await getLocalUserByEmail(email);
         if (existingLocalUserByEmail && !existingLocalUserByEmail.deleted) {
              console.warn(`[AuthContext Signup ${signupStartTime}] Email ${email} already exists locally and is not deleted.`);
              toast({ variant: "destructive", title: "Falha no Cadastro", description: "Este e-mail já está cadastrado localmente." });
              setLoading(false); return false;
         }
         if (finalUsername) {
            const existingLocalUserByUsername = await getLocalUserByUsername(finalUsername);
            if (existingLocalUserByUsername && !existingLocalUserByUsername.deleted) {
                console.warn(`[AuthContext Signup ${signupStartTime}] Username ${finalUsername} already exists locally and is not deleted.`);
                toast({ variant: "destructive", title: "Falha no Cadastro", description: "Este nome de usuário já está em uso localmente." });
                setLoading(false); return false;
            }
         }
         console.log(`[AuthContext Signup ${signupStartTime}] Hashing password for ${email}.`);
         const passwordHash = await hashPassword(pass);
         console.log(`[AuthContext Signup ${signupStartTime}] Password hashed. Preparing local user data.`);
         const newUserLocalData: DbUser = {
            id: tempLocalId, email, name, username: finalUsername, role: userRole, base: userBase,
            lastLogin: new Date().toISOString(), passwordHash, syncStatus: 'pending', deleted: false,
         };
         console.log(`[AuthContext Signup ${signupStartTime}] Saving new user locally with temp ID: ${tempLocalId}. Data:`, { ...newUserLocalData, passwordHash: '***' });
         await saveLocalUser(newUserLocalData);
         console.log(`[AuthContext Signup ${signupStartTime}] User initially saved locally with temp ID: ${tempLocalId}.`);

         if (auth && navigator.onLine) {
             try {
                 console.log(`[AuthContext Signup ${signupStartTime}] Attempting Firebase createUserWithEmailAndPassword for ${email}.`);
                 const userCredential = await firebaseCreateUserWithEmailAndPassword(auth, email, pass);
                 const finalUserId = userCredential.user.uid;
                 console.log(`[AuthContext Signup ${signupStartTime}] Firebase Auth user created: ${finalUserId}.`);

                 // Attempt to delete the temporary local user. If it fails, log but continue.
                 await deleteLocalUser(tempLocalId, true).catch(e => console.warn(`[AuthContext Signup] Failed to delete temp local user ${tempLocalId} after Firebase Auth creation:`, e));

                 const firebaseLinkedLocalData: DbUser = {
                     ...newUserLocalData, id: finalUserId, firebaseId: finalUserId, syncStatus: 'synced'
                 };
                 console.log(`[AuthContext Signup ${signupStartTime}] Saving updated local user record with Firebase ID: ${finalUserId}. Data:`, { ...firebaseLinkedLocalData, passwordHash: '***' });
                 await saveLocalUser(firebaseLinkedLocalData);
                 console.log(`[AuthContext Signup ${signupStartTime}] Local user record updated with Firebase ID: ${finalUserId}.`);

                 console.log(`[AuthContext Signup ${signupStartTime}] Creating Firestore document for new Firebase user ${finalUserId}.`);
                 await createUserDocument(finalUserId, email, name, finalUsername, userBase, userRole);

                 console.log(`[AuthContext Signup ${signupStartTime}] Signing out user ${finalUserId} after successful Firebase signup and Firestore doc creation.`);
                 await firebaseSignOut(auth); // User will be signed out, onAuthStateChanged will clear states
             } catch (firebaseError: any) {
                  console.warn(`[AuthContext Signup ${signupStartTime}] Firebase signup/setup failed. User remains local-only with temp ID ${tempLocalId}. Error: ${firebaseError.code}, ${firebaseError.message}`);
                   let fbErrorDesc = "Falha ao criar usuário online. A conta funcionará localmente.";
                    if (firebaseError.code === 'auth/email-already-in-use') {
                        fbErrorDesc = "E-mail já em uso online. A conta local foi criada. Tente fazer login.";
                    } else if (firebaseError.code === 'auth/weak-password') {
                        fbErrorDesc = "Senha fraca (mínimo 6 caracteres). Conta local criada.";
                    } else if (firebaseError.code?.includes('auth/configuration-not-found') || firebaseError.code === 'auth/invalid-api-key') {
                         fbErrorDesc = 'Erro de configuração do Firebase. A conta local foi criada.';
                     }
                   toast({ variant: "destructive", title: "Aviso Cadastro Online", description: fbErrorDesc, duration: 7000 });
                   // Do not clear loading here, onAuthStateChanged or subsequent actions will handle it.
             }
         } else {
             console.log(`[AuthContext Signup ${signupStartTime}] Skipping Firebase signup (Offline or Auth unavailable). User ${tempLocalId} remains local-only.`);
         }
         console.log(`[AuthContext Signup ${signupStartTime}] Signup process complete for input ${email}. Loading will be handled by auth listener or final error.`);
         toast({ title: 'Cadastro local realizado com sucesso!', description: 'Você já pode fazer login.' });
         // setLoading(false); // Let onAuthStateChanged or error handler manage final loading state
         return true;
     } catch (error: any) {
       console.error(`[AuthContext Signup ${signupStartTime}] Local Signup failed for ${email}. Error: `, error);
       toast({ variant: "destructive", title: "Falha no Cadastro Local", description: `Erro: ${error.message || 'Verifique os dados.'}`, duration: 9000 });
       setLoading(false); return false;
     }
   };

  const logout = async () => {
    const logoutStartTime = performance.now();
    console.log(`[AuthContext Logout ${logoutStartTime}] Initiating logout... Current user:`, user?.id, "Firebase user:", firebaseUser?.uid);
    setLoading(true);
    try {
        if (auth && auth.currentUser) { // Check if there's an active Firebase session
            console.log(`[AuthContext Logout ${logoutStartTime}] Firebase Auth instance exists and has currentUser. Signing out from Firebase for ${auth.currentUser.uid}.`);
            await firebaseSignOut(auth);
             console.log(`[AuthContext Logout ${logoutStartTime}] Firebase signOut successful.`);
        } else {
            console.log(`[AuthContext Logout ${logoutStartTime}] No active Firebase session or Auth instance not available. Clearing local state only.`);
        }
        // onAuthStateChanged listener will handle setting user and firebaseUser to null and setLoading to false.
        // For immediate UI feedback and local-only logout:
        setUser(null);
        setFirebaseUser(null);
        toast({title: "Logout", description: "Você saiu do sistema."})
    } catch (error) {
      console.error(`[AuthContext Logout ${logoutStartTime}] Error during Firebase signOut:`, error);
      toast({ variant: "destructive", title: "Erro no Logout", description: "Não foi possível sair completamente do Firebase." });
    } finally {
        // If onAuthStateChanged doesn't fire for some reason (e.g., no initial FB session), ensure loading is false
        if (!auth || !auth.currentUser) {
             setLoading(false);
             console.log(`[AuthContext Logout ${logoutStartTime}] No Firebase session after attempt, setting loading to false.`);
        }
        // Otherwise, onAuthStateChanged handles setLoading(false)
    }
  };

  const reauthenticate = async (currentPassword: string): Promise<boolean> => {
      const reauthStartTime = performance.now();
      console.log("[AuthContext Reauthenticate] Attempting reauthentication...");

      const currentUserForReauth = firebaseUser || (user?.firebaseId ? { uid: user.firebaseId, email: user.email } : null);

      if (!currentUserForReauth?.email) {
           console.warn(`[AuthContext Reauthenticate ${reauthStartTime}] No Firebase user email available for reauthentication.`);
           // Try local reauth if possible
      } else if (auth && navigator.onLine && currentUserForReauth.uid) {
          try {
              console.log(`[AuthContext Reauthenticate ${reauthStartTime}] Attempting Firebase reauthentication for ${currentUserForReauth.email}.`);
              const credential = EmailAuthProvider.credential(currentUserForReauth.email!, currentPassword);
              await reauthenticateWithCredential(auth.currentUser!, credential); // Use auth.currentUser for reauth
              console.log(`[AuthContext Reauthenticate ${reauthStartTime}] Firebase reauthentication successful for ${currentUserForReauth.email}.`);
              return true;
          } catch (error: any) {
               console.warn(`[AuthContext Reauthenticate ${reauthStartTime}] Firebase reauthentication failed for ${currentUserForReauth.email}. Error: ${error.code}`);
               if (error.code !== 'auth/wrong-password' && error.code !== 'auth/invalid-credential' && error.code !== 'auth/user-mismatch') {
                   toast({ variant: "destructive", title: "Reautenticação Online Falhou", description: "Erro ao reautenticar online. Verifique sua conexão ou tente mais tarde." });
                   return false;
               }
               // If wrong password or user mismatch, fall through to local check if applicable, or fail
          }
      }

      // Fallback or primary for local-only sessions: Local password check
      if (user?.id) { // Check if there's a current app user
           console.log(`[AuthContext Reauthenticate ${reauthStartTime}] Attempting local password verification for ${user.email}.`);
           const localDbUser = await getLocalUser(user.id);
           if (localDbUser?.passwordHash && await verifyPassword(currentPassword, localDbUser.passwordHash)) {
               console.log(`[AuthContext Reauthenticate ${reauthStartTime}] Local password verification successful for ${user.email}.`);
               return true;
           } else {
               console.warn(`[AuthContext Reauthenticate ${reauthStartTime}] Local password verification failed for ${user.email}. Hash present: ${!!localDbUser?.passwordHash}`);
           }
      }

      console.warn(`[AuthContext Reauthenticate ${reauthStartTime}] All reauthentication methods failed.`);
      toast({ variant: "destructive", title: "Autenticação Falhou", description: "Senha atual incorreta." });
      return false;
  };

    const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
        const updateEmailStartTime = performance.now();
        console.log(`[AuthContext UpdateEmail ${updateEmailStartTime}] Attempting to update email to ${newEmail}.`);
        if (!user) { console.warn(`[AuthContext UpdateEmail ${updateEmailStartTime}] No user authenticated.`); toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." }); return false; }
        if (user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') {
            console.warn(`[AuthContext UpdateEmail ${updateEmailStartTime}] Attempted to change email for super admin.`);
            toast({ variant: "destructive", title: "Operação não permitida", description: "Não é possível alterar o e-mail deste usuário." }); return false;
        }
        setLoading(true);
        const isAuthenticated = await reauthenticate(currentPassword);
        if (!isAuthenticated) { console.warn(`[AuthContext UpdateEmail ${updateEmailStartTime}] Reauthentication failed.`); setLoading(false); return false; }

        const originalEmail = user.email;
        const originalUsername = user.username;
        try {
            if (firebaseUser && auth && navigator.onLine) { // firebaseUser should be auth.currentUser
                 console.log(`[AuthContext UpdateEmail ${updateEmailStartTime}] Attempting Firebase email update for ${auth.currentUser?.uid}.`);
                 await firebaseUpdateEmail(auth.currentUser!, newEmail);
                 console.log(`[AuthContext UpdateEmail ${updateEmailStartTime}] Firebase email updated successfully.`);
            }

            const currentDbUser = await getLocalUser(user.id);
            if (!currentDbUser) { console.error(`[AuthContext UpdateEmail ${updateEmailStartTime}] Local user ${user.id} not found for update.`); throw new Error("Usuário local não encontrado."); }
            const updatedDbUser: DbUser = { ...currentDbUser, email: newEmail, username: newEmail.split('@')[0], lastLogin: new Date().toISOString(), syncStatus: 'pending' };
            console.log(`[AuthContext UpdateEmail ${updateEmailStartTime}] Updating local DB for user ${user.id}. New data:`, { ...updatedDbUser, passwordHash: '***' });
            await saveLocalUser(updatedDbUser);
            setUser({ ...user, email: newEmail, username: newEmail.split('@')[0] });

             if (db && navigator.onLine && (user.firebaseId || auth.currentUser?.uid)) {
                 const userIdToUpdateOnline = user.firebaseId || auth.currentUser!.uid;
                 try {
                    console.log(`[AuthContext updateEmail] Attempting to update Firestore email for ${userIdToUpdateOnline}.`);
                    await setFirestoreUserData(userIdToUpdateOnline, { email: newEmail, username: newEmail.split('@')[0] });
                    console.log(`[AuthContext updateEmail] Firestore email updated for ${userIdToUpdateOnline}.`);
                 } catch (firestoreError: any) {
                      console.error(`[AuthContext updateEmail] Failed to update Firestore email for ${userIdToUpdateOnline}:`, firestoreError);
                      toast({variant: "destructive", title: "Aviso Firestore", description: `E-mail atualizado localmente, mas falha ao atualizar online. Erro: ${firestoreError.message}`});
                 }
            }
            console.log(`[AuthContext UpdateEmail ${updateEmailStartTime}] Email update process successful for user ${user.id}.`);
            toast({ title: "Sucesso", description: "E-mail atualizado." });
            return true;
        } catch (error: any) {
             console.error(`[AuthContext UpdateEmail ${updateEmailStartTime}] Error updating email for user ${user.id}. Error: ${error.code}, ${error.message}`);
             setUser({ ...user, email: originalEmail, username: originalUsername }); // Rollback UI state
             const currentDbUserToRollback = await getLocalUser(user.id).catch(() => null);
             if(currentDbUserToRollback) {
                await saveLocalUser({...currentDbUserToRollback, email: originalEmail, username: originalUsername}).catch(e => console.error("CRITICAL: Failed to rollback local DB email", e));
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
      console.log(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Attempting to update password.`);
      if (!user) { console.warn(`[AuthContext UpdatePassword ${updatePasswordStartTime}] No user authenticated.`); toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." }); return false; }
      setLoading(true);
      const isAuthenticated = await reauthenticate(currentPassword);
      if (!isAuthenticated) { console.warn(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Reauthentication failed.`); setLoading(false); return false; }
      try {
           console.log(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Hashing new password.`);
           const newPasswordHash = await hashPassword(newPassword);
           console.log(`[AuthContext UpdatePassword ${updatePasswordStartTime}] New password hashed.`);

            if (firebaseUser && auth && navigator.onLine) { // firebaseUser should be auth.currentUser
               console.log(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Attempting Firebase password update for ${auth.currentUser?.uid}.`);
               await firebaseUpdatePassword(auth.currentUser!, newPassword);
               console.log(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Firebase password updated successfully.`);
            }

           const currentDbUser = await getLocalUser(user.id);
           if (!currentDbUser) { console.error(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Local user ${user.id} not found for update.`); throw new Error("Usuário local não encontrado."); }
           const updatedDbUser: DbUser = { ...currentDbUser, passwordHash: newPasswordHash, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
           console.log(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Updating local DB for user ${user.id}.`);
           await saveLocalUser(updatedDbUser);

           console.log(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Password update process successful for user ${user.id}.`);
           toast({ title: "Sucesso", description: "Senha atualizada." });
           return true;
      } catch (error: any) {
           console.error(`[AuthContext UpdatePassword ${updatePasswordStartTime}] Error updating password for user ${user.id}. Error: ${error.code}, ${error.message}`);
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
        console.log(`[AuthContext UpdateName ${updateNameStartTime}] Attempting to update name to ${newName}.`);
        if (!user) { console.warn(`[AuthContext UpdateName ${updateNameStartTime}] No user authenticated.`); toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." }); return false; }
        if (!newName.trim()) { console.warn(`[AuthContext UpdateName ${updateNameStartTime}] New name is empty.`); toast({ variant: "destructive", title: "Erro", description: "Nome não pode ser vazio." }); return false; }
        setLoading(true);
        const originalName = user.name;
        try {
             const currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) { console.error(`[AuthContext UpdateName ${updateNameStartTime}] Local user ${user.id} not found for update.`); throw new Error("Usuário local não encontrado."); }
             const updatedDbUser: DbUser = { ...currentDbUser, name: newName, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
             console.log(`[AuthContext UpdateName ${updateNameStartTime}] Updating local DB for user ${user.id}. New data:`,{ ...updatedDbUser, passwordHash: '***' });
             await saveLocalUser(updatedDbUser);
             setUser({ ...user, name: newName });

            if (db && navigator.onLine && (user.firebaseId || auth.currentUser?.uid)) {
                const userIdToUpdateOnline = user.firebaseId || auth.currentUser!.uid;
                try {
                    console.log(`[AuthContext updateProfileName] Attempting to update Firestore name for ${userIdToUpdateOnline}.`);
                    await setFirestoreUserData(userIdToUpdateOnline, { name: newName });
                    console.log(`[AuthContext updateProfileName] Firestore name updated for ${userIdToUpdateOnline}.`);
                } catch (firestoreError: any) {
                     console.error(`[AuthContext updateProfileName] Failed to update Firestore name for ${userIdToUpdateOnline}:`, firestoreError);
                     toast({variant: "destructive", title: "Aviso Firestore", description: `Nome atualizado localmente, mas falha ao atualizar online. Erro: ${firestoreError.message}`})
                }
            }
            console.log(`[AuthContext UpdateName ${updateNameStartTime}] Name update process successful for user ${user.id}.`);
            toast({ title: "Sucesso", description: "Nome atualizado." });
            return true;
        } catch (error: any) {
             console.error(`[AuthContext UpdateName ${updateNameStartTime}] Error updating name for user ${user.id}. Error:`, error);
             setUser({ ...user, name: originalName }); // Rollback UI state
             const currentDbUserToRollback = await getLocalUser(user.id).catch(() => null);
             if(currentDbUserToRollback) {
                await saveLocalUser({...currentDbUserToRollback, name: originalName}).catch(e => console.error("CRITICAL: Failed to rollback local DB name", e));
             }
             toast({ variant: "destructive", title: "Falha Local", description: `Não foi possível salvar o nome localmente. Erro: ${error.message}` });
            return false;
        } finally {
            setLoading(false);
        }
    };

    const updateBase = async (newBase: string): Promise<boolean> => {
        const updateBaseStartTime = performance.now();
        console.log(`[AuthContext UpdateBase ${updateBaseStartTime}] Attempting to update base to ${newBase}.`);
        if (!user) { console.warn(`[AuthContext UpdateBase ${updateBaseStartTime}] No user authenticated.`); toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." }); return false; }
        if (user.role === 'admin' && user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') { // Only allow base change if not the super admin
             console.warn(`[AuthContext UpdateBase ${updateBaseStartTime}] Attempted to change base for super admin.`);
             toast({ variant: "destructive", title: "Operação não permitida", description: "Base do super administrador não pode ser alterada." }); return false;
        }
        if (!newBase.trim()) { console.warn(`[AuthContext UpdateBase ${updateBaseStartTime}] New base is empty.`); toast({ variant: "destructive", title: "Erro", description: "Base não pode ser vazia." }); return false; }
        setLoading(true);
        const originalBase = user.base;
        const upperNewBase = newBase.trim().toUpperCase();
        try {
             const currentDbUser = await getLocalUser(user.id);
             if (!currentDbUser) { console.error(`[AuthContext UpdateBase ${updateBaseStartTime}] Local user ${user.id} not found for update.`); throw new Error("Usuário local não encontrado."); }
             const updatedDbUser: DbUser = { ...currentDbUser, base: upperNewBase, lastLogin: new Date().toISOString(), syncStatus: 'pending' };
             console.log(`[AuthContext UpdateBase ${updateBaseStartTime}] Updating local DB for user ${user.id}. New data:`, { ...updatedDbUser, passwordHash: '***' });
             await saveLocalUser(updatedDbUser);
             setUser({ ...user, base: upperNewBase });

             if (db && navigator.onLine && (user.firebaseId || auth.currentUser?.uid)) {
                 const userIdToUpdateOnline = user.firebaseId || auth.currentUser!.uid;
                 try {
                     console.log(`[AuthContext UpdateBase ${updateBaseStartTime}] Attempting to update Firestore base for ${userIdToUpdateOnline}.`);
                     await setFirestoreUserData(userIdToUpdateOnline, { base: upperNewBase });
                     console.log(`[AuthContext UpdateBase ${updateBaseStartTime}] Firestore base updated for ${userIdToUpdateOnline}.`);
                 } catch (firestoreError: any) {
                      console.error(`[AuthContext UpdateBase ${updateBaseStartTime}] Failed to update Firestore base for ${userIdToUpdateOnline}:`, firestoreError);
                      toast({variant: "destructive", title: "Aviso Firestore", description: `Base atualizada localmente, mas falha ao atualizar online. Erro: ${firestoreError.message}`});
                 }
             }
             console.log(`[AuthContext UpdateBase ${updateBaseStartTime}] Base update process successful for user ${user.id}.`);
             toast({ title: "Sucesso", description: "Base atualizada." });
             return true;
         } catch (error: any) {
              console.error(`[AuthContext UpdateBase ${updateBaseStartTime}] Error updating base for user ${user.id}. Error:`, error);
              setUser({ ...user, base: originalBase }); // Rollback UI state
              const currentDbUserToRollback = await getLocalUser(user.id).catch(() => null);
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
