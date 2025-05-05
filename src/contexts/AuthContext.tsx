// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
    STORE_USERS
} from '@/services/localDbService'; // Import local DB functions and STORE_USERS

// Define user roles
export type UserRole = 'driver' | 'admin';

// Extended User interface including Firebase Auth ID and Firestore data
export interface User extends DbUser {} // Use DbUser as the base

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
const createUserDocument = async (userId: string, email: string, name: string, username?: string, base?: string) => {
  const startTime = performance.now();
  console.log(`[createUserDocument ${startTime}] Attempting for UID: ${userId}`);
  if (!db) {
      console.error(`[createUserDocument ${startTime}] Firestore DB instance is not available.`);
      throw new Error('Firestore not initialized. Cannot create user document.');
  }
  const userDocRef = doc(db, 'users', userId);
  const userData: Partial<Omit<User, 'id' | 'lastLogin'>> = {
    name,
    email,
    username: username || '',
    role: 'driver', // Default to driver
    base: base || '', // Add base
  };
  try {
    await setDoc(userDocRef, userData);
    const endTime = performance.now();
    console.log(`[createUserDocument ${startTime}] Firestore document created successfully for ${userId} in ${endTime - startTime} ms.`);
  } catch (firestoreError: any) {
    const endTime = performance.now();
    console.error(`[createUserDocument ${startTime}] Error creating Firestore document for ${userId} in ${endTime - startTime} ms:`, firestoreError);
    throw new Error(`Failed to create Firestore user document: ${firestoreError.message}`);
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
        // Don't set loading true here, let the main effect handle it
        try {
            await openDB(); // Ensure DB is open
            const dbInstance = await openDB(); // Get the DB instance
            const tx = dbInstance.transaction(STORE_USERS, 'readonly');
            const store = tx.objectStore(STORE_USERS);
            const allUsers = await new Promise<LocalUser[]>((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => {
                    console.error(`[checkLocalLogin ${checkLocalStartTime}] Error in getAll request:`, request.error);
                    reject(request.error);
                 }
            });

            await tx.done; // Ensure transaction completes

            if (allUsers && allUsers.length > 0) {
                allUsers.sort((a, b) => new Date(b.lastLogin || 0).getTime() - new Date(a.lastLogin || 0).getTime());
                const latestUser = allUsers[0];
                const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
                if (latestUser.lastLogin && new Date(latestUser.lastLogin).getTime() > oneDayAgo) {
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] Found potentially active local user: ${latestUser.id}`);
                    setUser(latestUser);
                    const checkLocalEndTime = performance.now();
                    console.log(`[checkLocalLogin ${checkLocalStartTime}] Completed (found user). Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
                    return true;
                } else {
                     console.log(`[checkLocalLogin ${checkLocalStartTime}] Local user ${latestUser.id} found, but login is too old or timestamp missing. Deleting...`);
                     await deleteLocalUser(latestUser.id).catch(e => console.error("[checkLocalLogin] Error deleting stale local user:", e));
                }
            } else {
                console.log(`[checkLocalLogin ${checkLocalStartTime}] No local users found.`);
            }

            setUser(null);
            const checkLocalEndTime = performance.now();
            console.log(`[checkLocalLogin ${checkLocalStartTime}] Completed (no user found). Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
            return false;

        } catch (error) {
            console.error(`[checkLocalLogin ${checkLocalStartTime}] Error checking local DB:`, error);
            setUser(null);
            const checkLocalEndTime = performance.now();
            console.error(`[checkLocalLogin ${checkLocalStartTime}] Completed with error. Time: ${checkLocalEndTime - checkLocalStartTime} ms.`);
            return false;
        } finally {
           // Don't set loading false here, let the main effect handle it after both checks
        }
    }, []);


    // Combined Effect for initial check and Firebase listener
    useEffect(() => {
        const listenerId = Math.random().toString(36).substring(2, 7);
        console.log(`[AuthProvider Effect ${listenerId}] Running initial setup. Setting loading true.`);
        setLoading(true); // Start loading
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;

        const setupFirebaseListener = () => {
            console.log(`[AuthProvider Effect ${listenerId}] Setting up auth state listener.`);
            if (!auth) {
              console.error(`[AuthProvider Effect ${listenerId}] Firebase Auth instance not available for listener.`);
              // If local check also failed, set loading false here
              if (!user) setLoading(false);
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
                  // Only clear local user if it wasn't set by checkLocalLogin moments ago
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
                       if (!localUserData) {
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId}] User ${fbUser.uid} not found locally. Fetching from Firestore...`);
                           const firestoreData = await getFirestoreUserData(fbUser.uid);
                           if (firestoreData) {
                               console.log(`[AuthProvider onAuthStateChanged ${listenerId}] Firestore data found for ${fbUser.uid}. Saving locally...`);
                               localUserData = { ...firestoreData, id: fbUser.uid, lastLogin: nowISO };
                               await saveLocalUser(localUserData);
                           } else {
                               console.warn(`[AuthProvider onAuthStateChanged ${listenerId}] No Firestore data for ${fbUser.uid}. Creating basic local user.`);
                                localUserData = {
                                   id: fbUser.uid,
                                   email: fbUser.email || 'unknown@example.com',
                                   name: fbUser.displayName || 'Usuário Firebase',
                                   role: 'driver', base: '', lastLogin: nowISO
                                };
                                await saveLocalUser(localUserData);
                                createUserDocument(fbUser.uid, localUserData.email, localUserData.name || '', undefined, '')
                                   .catch(err => console.error("[AuthProvider] BG Firestore create failed:", err));
                           }
                       } else {
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId}] User ${fbUser.uid} found locally. Updating last login.`);
                           localUserData.lastLogin = nowISO;
                           // Only save if something actually changed (like lastLogin)
                           await saveLocalUser(localUserData);
                       }
                       if (isMounted) {
                           setUser(localUserData);
                       }
                   } catch (error: any) {
                       console.error(`[AuthProvider onAuthStateChanged ${listenerId}] Error fetching/saving local user data for ${fbUser.uid}:`, error);
                       if (isMounted) {
                            toast({ variant: "destructive", title: "Erro Dados Locais", description: `Não foi possível carregar/salvar dados locais. ${error.code === 'unavailable' ? 'Firestore offline?' : ''}` });
                       }
                   } finally {
                       if (isMounted) {
                          setLoading(false); // Stop loading AFTER processing FB user
                           const authChangeEndTime = performance.now();
                           console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${authChangeStartTime}] Finished processing FB user ${fbUser.uid}. Total time: ${authChangeEndTime - authChangeStartTime} ms.`);
                       }
                   }
              }
            });
        };

        // Run local check first, then setup Firebase listener
        checkLocalLogin().then(localUserFound => {
            if (isMounted) {
                console.log(`[AuthProvider Effect ${listenerId}] Local check completed. User found: ${localUserFound}. Setting up Firebase listener.`);
                setupFirebaseListener();
                 // If no local user was found, loading state remains true until Firebase listener responds or errors
                 // If local user WAS found, set loading false now. Listener might update later.
                 if (localUserFound) {
                     console.log(`[AuthProvider Effect ${listenerId}] Setting loading false after finding local user.`);
                     setLoading(false);
                 }
            }
        }).catch(err => {
             console.error(`[AuthProvider Effect ${listenerId}] Initial checkLocalLogin failed:`, err);
             if (isMounted) {
                 console.log(`[AuthProvider Effect ${listenerId}] Setting up Firebase listener after local check error.`);
                 setupFirebaseListener(); // Still setup listener as Firebase might be the source of truth
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

  // Login: Authenticate with Firebase, then save/update local user data
  const login = async (email: string, pass: string): Promise<boolean> => {
    const loginStartTime = performance.now();
    console.log(`[AuthProvider Login ${loginStartTime}] Attempting login for email: ${email}`);
    if (!auth) {
       console.error(`[AuthProvider Login ${loginStartTime}] Login failed: Firebase Auth instance not available.`);
       toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada.", duration: 9000 });
       setLoading(false); // Ensure loading stops if auth isn't ready
       return false;
    }
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const loginEndTime = performance.now();
      console.log(`[AuthProvider Login ${loginStartTime}] signInWithEmailAndPassword successful for ${userCredential.user.email}. Time: ${loginEndTime - loginStartTime} ms. Waiting for onAuthStateChanged to handle state update and loading false.`);
      // **Crucially, return true, but UI update/loading state depends on the listener**
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
              errorMessage = 'Erro de rede ao tentar fazer login. Verifique sua conexão.';
        } else if (error.code === 'auth/operation-not-allowed') {
               errorMessage = 'Login com e-mail/senha não está habilitado. Contacte o administrador.';
        } else if (error.code === 'auth/configuration-not-found') {
             errorMessage = 'Erro de configuração do Firebase (auth/configuration-not-found). Verifique as chaves de API e outras configurações no console do Firebase e no seu arquivo .env.';
             console.error("Firebase Login Error: auth/configuration-not-found. Ensure API keys, auth domain, etc., are correctly set in your .env file (with NEXT_PUBLIC_ prefix) and match the Firebase console.");
         }
         else if (error.code?.includes('auth/')) {
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

   // Signup: Create Firebase user, create Firestore doc, save locally
   const signup = async (email: string, pass: string, name: string, username?: string, base?: string): Promise<boolean> => {
     const signupStartTime = performance.now();
     console.log(`[AuthProvider Signup ${signupStartTime}] Attempting signup for ${email}`);
     if (!auth) {
        console.error(`[AuthProvider Signup ${signupStartTime}] Signup failed: Firebase Auth instance not available.`);
        toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada.", duration: 9000 });
        setLoading(false); // Ensure loading stops
        return false;
     }
     setLoading(true);
     let userId: string | null = null;

     try {
       // 1. Create Firebase Auth user
       const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
       userId = userCredential.user.uid;
       console.log(`[AuthProvider Signup ${signupStartTime}] FB Auth user created: ${userId}.`);

       // 2. Update Firebase Auth profile
       await updateProfile(userCredential.user, { displayName: name });
       console.log(`[AuthProvider Signup ${signupStartTime}] FB Auth profile updated.`);

       // 3. Create Firestore document
       await createUserDocument(userId, email, name, username, base); // Pass base
       console.log(`[AuthProvider Signup ${signupStartTime}] Firestore document created.`);

       // 4. Prepare and save LocalUser data
        const newUser: User = {
           id: userId,
           email: email,
           name: name,
           username: username,
           role: 'driver', // Default role
           base: base, // Add base
           lastLogin: new Date().toISOString() // Set last login on signup
        };
       await saveLocalUser(newUser);
       console.log(`[AuthProvider Signup ${signupStartTime}] User saved locally.`);

       // 5. Sign out the user immediately after signup (standard practice)
       await signOut(auth);
       console.log(`[AuthProvider Signup ${signupStartTime}] User signed out post-signup.`);

       const signupEndTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Signup process completed successfully in ${signupEndTime - signupStartTime} ms.`);
       toast({ title: 'Cadastro realizado com sucesso!', description: 'Você já pode fazer login.' });
       return true;
     } catch (error: any) {
       const signupEndTime = performance.now();
       console.error(`[AuthProvider Signup ${signupStartTime}] Signup failed after ${signupEndTime - signupStartTime} ms. Error Code: ${error.code}, Message: ${error.message}`);
       let description = "Ocorreu um erro ao cadastrar.";
        if (error.code === 'auth/email-already-in-use') {
         description = "Este e-mail já está em uso por outra conta.";
       } else if (error.code === 'auth/invalid-email') {
         description = "O formato do e-mail é inválido.";
       } else if (error.code === 'auth/weak-password') {
         description = "A senha é muito fraca (mínimo 6 caracteres).";
       } else if (error.code === 'auth/network-request-failed') {
           description = 'Erro de rede ao tentar cadastrar. Verifique sua conexão.';
       } else if (error.code === 'auth/operation-not-allowed') {
            description = 'Cadastro com e-mail/senha não está habilitado. Contacte o administrador.';
       } else if (error.code === 'auth/configuration-not-found') {
            description = 'Erro de configuração do Firebase (auth/configuration-not-found). Verifique as chaves de API e configurações no console do Firebase e no seu .env file.';
       }
       else if (error.code === 'auth/invalid-credential') {
           description = 'Credenciais inválidas fornecidas durante o cadastro.';
       }
       else if (error.code?.includes('auth/')) {
           description = `Erro de autenticação (${error.code}). Tente novamente.`;
       } else if (error.message?.includes('Failed to create Firestore user document')) {
          description = `Falha ao salvar dados do usuário. ${error.message}`;
       }
       else {
         description = `Erro inesperado: ${error.message || 'Verifique os dados e tente novamente.'}`;
       }
       toast({ variant: "destructive", title: "Falha no Cadastro", description, duration: 9000 });
       return false;
     } finally {
         setLoading(false); // Ensure loading stops
     }
   };


  // Logout: Clear local state, delete local user data, sign out from Firebase
  const logout = async () => {
    const logoutStartTime = performance.now();
    console.log(`[AuthProvider Logout ${logoutStartTime}] Attempting logout...`);
    const currentLocalUserId = user?.id; // Get ID before clearing state

    setLoading(true);
    setUser(null);
    setFirebaseUser(null);

    try {
        if (currentLocalUserId) {
            await deleteLocalUser(currentLocalUserId);
            console.log(`[AuthProvider Logout ${logoutStartTime}] Local user ${currentLocalUserId} deleted.`);
        } else {
            console.log(`[AuthProvider Logout ${logoutStartTime}] No local user ID found to delete.`);
        }

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

  // Re-authenticate user helper
  const reauthenticate = async (currentPassword: string): Promise<boolean> => {
      const reauthStartTime = performance.now();
      if (!auth || !firebaseUser || !firebaseUser.email) {
          console.error(`[AuthProvider Reauthenticate ${reauthStartTime}] Failed: Auth not init or user not logged in.`);
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado ou Auth não inicializado." });
          return false;
      }
      console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Attempting reauthentication for ${firebaseUser.email}`);
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      try {
          await reauthenticateWithCredential(firebaseUser, credential);
          const reauthEndTime = performance.now();
          console.log(`[AuthProvider Reauthenticate ${reauthStartTime}] Reauthentication successful. Time: ${reauthEndTime - reauthStartTime} ms.`);
          return true;
      } catch (error: any) {
          const reauthEndTime = performance.now();
          console.error(`[AuthProvider Reauthenticate ${reauthStartTime}] Reauthentication failed after ${reauthEndTime - reauthStartTime} ms. Error: ${error.code}, Message: ${error.message}`);
          let desc = "Senha atual incorreta.";
          if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
              // Keep msg
          } else if (error.code === 'auth/too-many-requests') {
               desc = 'Muitas tentativas falhadas. Tente novamente mais tarde.';
          } else if (error.code === 'auth/network-request-failed') {
               desc = 'Erro de rede. Verifique sua conexão.';
          } else {
               desc = 'Erro ao reautenticar. Tente novamente.'
          }
          toast({ variant: "destructive", title: "Autenticação Falhou", description: desc });
          return false;
      }
  };


  // Update Email: Update Firebase Auth, Firestore, and Local DB
    const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
        const updateEmailStartTime = performance.now();
        console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempting to update email to ${newEmail}`);
        if (!auth || !firebaseUser || !user) {
            console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Failed: Auth not init or user not logged in.`);
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado ou Auth não inicializado." });
            return false;
        }
        setLoading(true);

        const isAuthenticated = await reauthenticate(currentPassword);
        if (!isAuthenticated) {
            setLoading(false);
            return false;
        }

        try {
            // 1. Update Firebase Auth
            await firebaseUpdateEmail(firebaseUser, newEmail);
            console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email updated.`);

            // 2. Update Firestore (if online)
             if (db && navigator.onLine) {
                 try {
                    await setFirestoreUserData(firebaseUser.uid, { email: newEmail });
                    console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore email updated.`);
                 } catch (firestoreError) {
                      console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Failed to update Firestore email, proceeding with local update:`, firestoreError);
                 }
            } else {
                 console.warn(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
            }


            // 3. Update Local DB
            const updatedLocalUser = { ...user, email: newEmail };
            await saveLocalUser(updatedLocalUser);
            console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Local DB email updated.`);

            // 4. Update local state
            setUser(updatedLocalUser);

            toast({ title: "Sucesso", description: "E-mail atualizado." });
            const updateEmailEndTime = performance.now();
            console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update successful. Total time: ${updateEmailEndTime - updateEmailStartTime} ms.`);
            return true;
        } catch (error: any) {
            const updateEmailEndTime = performance.now();
            console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update failed after ${updateEmailEndTime - updateEmailStartTime} ms. Error: ${error.code}, Message: ${error.message}`);
            let desc = "Não foi possível atualizar o e-mail.";
             if (error.code === 'auth/email-already-in-use') {
                desc = "Este e-mail já está em uso por outra conta.";
            } else if (error.code === 'auth/invalid-email') {
                desc = "O formato do novo e-mail é inválido.";
            } else if (error.code === 'auth/requires-recent-login') {
               desc = 'Esta operação requer login recente. Faça logout e login novamente.';
            }
            toast({ variant: "destructive", title: "Falha", description: desc });
            return false;
        } finally {
            setLoading(false);
        }
    };


  // Update Password
  const updatePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
      const updatePassStartTime = performance.now();
      console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Attempting password update.`);
      if (!auth || !firebaseUser) {
          console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Failed: Auth not init or user not logged in.`);
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado ou Auth não inicializado." });
          return false;
      }
      setLoading(true);

      const isAuthenticated = await reauthenticate(currentPassword);
      if (!isAuthenticated) {
          setLoading(false);
          return false;
      }

      try {
          await firebaseUpdatePassword(firebaseUser, newPassword);
          toast({ title: "Sucesso", description: "Senha atualizada." });
          const updatePassEndTime = performance.now();
          console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update successful. Total time: ${updatePassEndTime - updatePassStartTime} ms.`);
          return true;
      } catch (error: any) {
          const updatePassEndTime = performance.now();
           console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update failed after ${updatePassEndTime - updatePassStartTime} ms. Error: ${error.code}, Message: ${error.message}`);
           let desc = "Não foi possível atualizar a senha.";
           if (error.code === 'auth/weak-password') {
               desc = "A nova senha é muito fraca. Use pelo menos 6 caracteres.";
           } else if (error.code === 'auth/requires-recent-login') {
              desc = 'Esta operação requer login recente. Faça logout e login novamente.';
           }
          toast({ variant: "destructive", title: "Falha", description: desc });
          return false;
      } finally {
          setLoading(false);
      }
  };

  // Update Profile Name: Update Firebase Auth, Firestore, and Local DB
    const updateProfileName = async (newName: string): Promise<boolean> => {
        const updateNameStartTime = performance.now();
         console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Attempting name update to ${newName}.`);
         if (!auth || !firebaseUser || !user) {
            console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Failed: Auth not init or user not logged in.`);
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado ou Auth não inicializado." });
            return false;
        }
         if (!newName.trim()) {
             toast({ variant: "destructive", title: "Erro", description: "Nome não pode ser vazio." });
             return false;
         }
        setLoading(true);

        try {
            // 1. Update Firebase Auth Profile
            await updateProfile(firebaseUser, { displayName: newName });
            console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firebase Auth name updated.`);

            // 2. Update Firestore (if online)
            if (db && navigator.onLine) {
                try {
                    await setFirestoreUserData(firebaseUser.uid, { name: newName });
                    console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore name updated.`);
                } catch (firestoreError) {
                     console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Failed to update Firestore name, proceeding with local update:`, firestoreError);
                }
            } else {
                 console.warn(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
            }


            // 3. Update Local DB
            const updatedLocalUser = { ...user, name: newName };
            await saveLocalUser(updatedLocalUser);
            console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Local DB name updated.`);

            // 4. Update local state
            setUser(updatedLocalUser);

            toast({ title: "Sucesso", description: "Nome atualizado." });
             const updateNameEndTime = performance.now();
            console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Name update successful. Total time: ${updateNameEndTime - updateNameStartTime} ms.`);
            return true;
        } catch (error: any) {
             const updateNameEndTime = performance.now();
             console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Name update failed after ${updateNameEndTime - updateNameStartTime} ms. Error: ${error.code}, Message: ${error.message}`);
             let desc = "Não foi possível atualizar o nome.";
             if (error.code === 'auth/requires-recent-login') {
                desc = 'Esta operação requer login recente. Faça logout e login novamente.';
             }
            toast({ variant: "destructive", title: "Falha", description: desc });
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
             setLoading(false); // Added missing setLoading false
            return false;
        }
        if (!newBase.trim()) {
            toast({ variant: "destructive", title: "Erro", description: "Base não pode ser vazia." });
            setLoading(false); // Added missing setLoading false
            return false;
        }

        setLoading(true);
        try {
             // 1. Update Firestore (if online)
             if (db && navigator.onLine) {
                 try {
                     await setFirestoreUserData(user.id, { base: newBase });
                     console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Firestore base updated.`);
                 } catch (firestoreError) {
                      console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Failed to update Firestore base, proceeding with local update:`, firestoreError);
                 }
             } else {
                  console.warn(`[AuthProvider UpdateBase ${updateBaseStartTime}] Firestore DB not available or offline. Skipping Firestore update.`);
             }

             // 2. Update Local DB
             const updatedLocalUser = { ...user, base: newBase };
             await saveLocalUser(updatedLocalUser);
             console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Local DB base updated.`);

             // 3. Update local state
             setUser(updatedLocalUser);

             toast({ title: "Sucesso", description: "Base atualizada." });
              const updateBaseEndTime = performance.now();
             console.log(`[AuthProvider UpdateBase ${updateBaseStartTime}] Base update successful. Total time: ${updateBaseEndTime - updateBaseStartTime} ms.`);
             return true;
         } catch (error: any) {
              const updateBaseEndTime = performance.now();
              console.error(`[AuthProvider UpdateBase ${updateBaseStartTime}] Base update failed after ${updateBaseEndTime - updateBaseStartTime} ms. Error:`, error);
              toast({ variant: "destructive", title: "Falha", description: "Não foi possível atualizar a base." });
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
