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
  createUserWithEmailAndPassword // Import createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth, db, persistenceEnabledPromise } from '@/lib/firebase'; // Import Firebase auth, db, and persistence promise
import { useToast } from '@/hooks/use-toast';
import { getUserData, setUserData } from '@/services/firestoreService'; // Import Firestore service
import { doc, setDoc, getDoc, FirestoreError } from 'firebase/firestore'; // Import FirestoreError type

// Define user roles
export type UserRole = 'driver' | 'admin';

// Extended User interface including Firebase Auth ID and Firestore data
export interface User {
  id: string; // Firebase Auth UID
  email: string;
  name?: string;
  role: UserRole;
  base?: string;
  username?: string; // Added username field
}

// Separate DriverInfo for component usage (might be redundant if User covers all needs)
export interface DriverInfo extends Omit<User, 'role'>{
    role: 'driver';
    username: string; // Kept for Drivers component if needed, otherwise derive from email/name
    // Password is NOT stored here anymore, managed by Firebase Auth
}

interface AuthContextType {
  user: User | null; // Use the extended User interface
  firebaseUser: FirebaseUser | null; // Keep Firebase user object if needed
  loading: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  signup: (email: string, pass: string, name: string, username?: string) => Promise<boolean>; // Added signup function
  logout: () => void;
  updateEmail: (currentPassword: string, newEmail: string) => Promise<boolean>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  updateProfileName: (newName: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- Helper Function to Create Firestore User Document ---
const createUserDocument = async (userId: string, email: string, name: string, username?: string) => {
  const startTime = performance.now();
  console.log(`[createUserDocument ${startTime}] Attempting for UID: ${userId}`);
  // Check db instance right at the start
  if (!db) {
      console.error(`[createUserDocument ${startTime}] Firestore DB instance is not available.`);
      throw new Error('Firestore not initialized. Cannot create user document.');
  }
  const userDocRef = doc(db, 'users', userId);
  const userData: Partial<Omit<User, 'id'>> = {
    name,
    email,
    username: username || '', // Store username if provided
    role: 'driver', // Default role for new signups
    // Base might be set later or through an admin panel
  };
  try {
    await setDoc(userDocRef, userData); // Use setDoc to create the document with the specific ID
    const endTime = performance.now();
    console.log(`[createUserDocument ${startTime}] Firestore document created successfully for ${userId} in ${endTime - startTime} ms.`);
  } catch (firestoreError: any) {
    const endTime = performance.now();
    console.error(`[createUserDocument ${startTime}] Error creating Firestore document for ${userId} in ${endTime - startTime} ms:`, firestoreError);
    throw new Error(`Failed to create Firestore user document: ${firestoreError.message}`); // Re-throw with a more specific message
  }
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null); // App's user state (combined Auth + Firestore)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null); // Raw Firebase Auth user
  const [loading, setLoading] = useState(true); // Start as true
  const { toast } = useToast();

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const listenerId = Math.random().toString(36).substring(2, 7); // Unique ID for this listener instance
    console.log(`[AuthProvider Effect ${listenerId}] Setting up auth state listener.`);
    setLoading(true); // Ensure loading is true when setting up

    // Ensure auth is initialized before using it
    if (!auth) {
      console.error(`[AuthProvider Effect ${listenerId}] Firebase Auth instance not available. Cannot set up listener.`);
      setLoading(false); // Stop loading if auth fails
      setUser(null);
      setFirebaseUser(null);
      return;
    } else {
      console.log(`[AuthProvider Effect ${listenerId}] Firebase Auth instance available.`);
    }

    let isMounted = true;
    let persistenceWaitLogged = false; // Flag to log persistence wait only once

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      const startTime = performance.now();
      console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${startTime}] Received auth state. isMounted: ${isMounted}, fbUser present: ${!!fbUser}`);
      if (!isMounted) {
         console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${startTime}] Component unmounted, skipping state update.`);
         return;
      }

      // **Set loading to true whenever auth state changes and processing begins**
      if (!loading) setLoading(true); // Only set if not already true to avoid redundant renders
      setFirebaseUser(fbUser);

      if (fbUser) {
        console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${startTime}] User Found: ${fbUser.uid}. Fetching associated data...`);

        try {
            // --- Await Persistence Promise (if applicable) ---
            // Log timing for persistence check
            let persistenceCheckDoneTime = performance.now();
            if (persistenceEnabledPromise) {
                 if (!persistenceWaitLogged) {
                    console.log(`[AuthProvider ${listenerId} ${startTime}] Waiting for persistence promise...`);
                    persistenceWaitLogged = true; // Log only once per listener instance
                 }
                 const persistenceStartTime = performance.now();
                 try {
                    await persistenceEnabledPromise;
                    const persistenceEndTime = performance.now();
                    console.log(`[AuthProvider ${listenerId} ${startTime}] Persistence promise resolved successfully in ${persistenceEndTime - persistenceStartTime} ms.`);
                 } catch (persistenceError) {
                     const persistenceEndTime = performance.now();
                     console.error(`[AuthProvider ${listenerId} ${startTime}] Persistence promise rejected in ${persistenceEndTime - persistenceStartTime} ms:`, persistenceError);
                     // Continue execution even if persistence fails, app might work online
                 }
                 persistenceCheckDoneTime = performance.now();
            } else {
                 console.warn(`[AuthProvider ${listenerId} ${startTime}] Persistence promise not found. Proceeding without waiting.`);
                 persistenceCheckDoneTime = performance.now(); // Update timestamp even if no wait
            }
            console.log(`[AuthProvider ${listenerId} ${startTime}] Persistence check/wait finished at ${persistenceCheckDoneTime}. Duration: ${persistenceCheckDoneTime - startTime} ms.`);


            // --- Fetch Firestore Data ---
            if (!db) {
                throw new Error('Firestore DB instance is not available. Cannot fetch user data.');
            }
            const firestoreStartTime = performance.now();
            console.log(`[AuthProvider ${listenerId} ${startTime}] Attempting to fetch Firestore data for UID: ${fbUser.uid} at ${firestoreStartTime}`);
            const userData = await getUserData(fbUser.uid);
            const firestoreEndTime = performance.now();
            console.log(`[AuthProvider ${listenerId} ${startTime}] Firestore data fetch for ${fbUser.uid} completed at ${firestoreEndTime}. Duration: ${firestoreEndTime - firestoreStartTime} ms.`);

            if (!isMounted) {
                console.log(`[AuthProvider ${listenerId} ${startTime}] Component unmounted after fetching Firestore data, skipping state update.`);
                if (loading) setLoading(false); // Ensure loading stops even if unmounted
                return;
            }

            // --- Process Firestore Data ---
            let finalUser: User | null = null;
            if (userData) {
              console.log(`[AuthProvider ${listenerId} ${startTime}] Firestore user data found for ${fbUser.uid}.`);
              finalUser = {
                  id: fbUser.uid,
                  email: fbUser.email || userData.email || 'N/A',
                  name: fbUser.displayName || userData.name,
                  role: userData.role || 'driver',
                  base: userData.base,
                  username: userData.username,
              };
            } else {
                // Attempt second check/creation if data is missing
                console.warn(`[AuthProvider ${listenerId} ${startTime}] Firestore user data NOT found for UID: ${fbUser.uid}. Attempting second check/creation.`);
                const secondCheckStartTime = performance.now();
                const freshUserData = await getUserData(fbUser.uid); // Check again
                const secondCheckEndTime = performance.now();
                console.log(`[AuthProvider ${listenerId} ${startTime}] Second Firestore check took ${secondCheckEndTime - secondCheckStartTime} ms.`);

                if (!isMounted) {
                    console.log(`[AuthProvider ${listenerId} ${startTime}] Component unmounted after second Firestore check, skipping state update.`);
                    if (loading) setLoading(false);
                    return;
                 }

                if (freshUserData) {
                     console.log(`[AuthProvider ${listenerId} ${startTime}] Retrieved Firestore data on second attempt for ${fbUser.uid}.`);
                      finalUser = {
                         id: fbUser.uid,
                         email: fbUser.email || freshUserData.email || 'N/A',
                         name: fbUser.displayName || freshUserData.name,
                         role: freshUserData.role || 'driver',
                         base: freshUserData.base,
                         username: freshUserData.username,
                      };
                } else {
                    console.warn(`[AuthProvider ${listenerId} ${startTime}] Firestore user data still missing for UID: ${fbUser.uid}. Using basic Auth data and attempting creation.`);
                    finalUser = {
                        id: fbUser.uid,
                        email: fbUser.email || 'unknown@example.com',
                        name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Novo Usuário',
                        role: 'driver' as UserRole,
                    };
                    // Asynchronously try to create the doc, don't block loading state
                    createUserDocument(fbUser.uid, finalUser.email, finalUser.name)
                        .then(() => console.log(`[AuthProvider ${listenerId} ${startTime}] Background attempt to auto-create Firestore document completed for: ${fbUser.uid}`))
                        .catch(creationError => console.error(`[AuthProvider ${listenerId} ${startTime}] Background attempt to auto-create Firestore document failed:`, creationError.message));
                }
            }

            // Update user state
            if (isMounted) {
                setUser(finalUser);
                console.log(`[AuthProvider ${listenerId} ${startTime}] User state updated.`);
            }

        } catch (error: any) {
             if (!isMounted) {
                console.log(`[AuthProvider ${listenerId} ${startTime}] Component unmounted after Firestore error, skipping state update.`);
                if (loading) setLoading(false);
                return;
             }
             console.error(`[AuthProvider ${listenerId} ${startTime}] Error fetching or processing user data for ${fbUser.uid}:`, error.message, error.code);

              // Handle specific errors (e.g., offline)
             if (error instanceof FirestoreError && error.code === 'unavailable') { // Check for 'unavailable' for offline/network issues
                   console.warn(`[AuthProvider ${listenerId} ${startTime}] Firestore unavailable (likely offline). Using basic Auth data.`);
                   setUser({
                       id: fbUser.uid,
                       email: fbUser.email || 'offline@example.com',
                       name: fbUser.displayName || 'Usuário Offline',
                       role: 'driver',
                   });
                   toast({ variant: "default", title: "Modo Offline", description: "Não foi possível carregar dados completos. Verifique sua conexão.", duration: 5000 });
              } else {
                  // Handle other errors - Set user state to reflect error or basic info
                  setUser({
                      id: fbUser.uid,
                      email: fbUser.email || 'error@example.com',
                      name: fbUser.displayName || 'Erro ao Carregar',
                      role: 'driver',
                  });
                  toast({ variant: "destructive", title: "Erro de Dados", description: `Não foi possível carregar os dados completos do usuário. (${error.code || 'Unknown'})` });
              }
        } finally {
           if (isMounted) {
             const endTime = performance.now();
             console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${startTime}] Finished processing user state for ${fbUser ? fbUser.uid : 'null'}. Total time: ${endTime - startTime} ms. Setting loading to false.`);
             setLoading(false); // **Ensure loading is false after ALL processing**
           } else {
             console.log(`[AuthProvider ${listenerId} ${startTime}] Component unmounted before finally block could set loading to false.`);
             // If unmounted, setting state here won't work, but ensure it's false if somehow reachable
             if (loading) setLoading(false);
           }
        }

      } else {
        // No Firebase user (logged out)
        console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${startTime}] No Firebase Auth user.`);
        if (!isMounted) {
            console.log(`[AuthProvider ${listenerId} ${startTime}] Component unmounted while processing null user, skipping state update.`);
            if (loading) setLoading(false);
            return;
        }
        setUser(null);
        setFirebaseUser(null); // Ensure firebaseUser is also cleared
        // Set loading false immediately when no user
        setLoading(false);
        const endTime = performance.now();
        console.log(`[AuthProvider onAuthStateChanged ${listenerId} ${startTime}] Processed null user. Loading set to false. Duration: ${endTime - startTime} ms.`);
      }
    });

    return () => {
        console.log(`[AuthProvider Effect Cleanup ${listenerId}] Unsubscribing from auth state changes.`);
        isMounted = false;
        unsubscribe();
    };
  // Re-run effect only if `toast` function identity changes (unlikely but technically correct)
  }, [toast]); // Removed `loading` from dependencies as it causes loops


  // --- Authentication Functions (Login, Signup, Logout, Updates) ---
  // Add detailed logging with performance timers to these functions as well

  // Firebase Login
  const login = async (email: string, pass: string): Promise<boolean> => {
    const loginStartTime = performance.now();
    console.log(`[AuthProvider Login ${loginStartTime}] Attempting login for email: ${email}`);
    if (!auth) {
       console.error(`[AuthProvider Login ${loginStartTime}] Login failed: Firebase Auth instance not available.`);
       toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada.", duration: 9000 });
       return false;
    }
    setLoading(true); // Indicate loading state
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const loginEndTime = performance.now();
      console.log(`[AuthProvider Login ${loginStartTime}] signInWithEmailAndPassword successful for ${userCredential.user.email}. Time: ${loginEndTime - loginStartTime} ms. Waiting for onAuthStateChanged...`);
      // Listener will handle setting user and loading=false
      return true;
    } catch (error: any) {
       const loginEndTime = performance.now();
       console.error(`[AuthProvider Login ${loginStartTime}] Login failed for ${email}. Time: ${loginEndTime - loginStartTime} ms. Error Code: ${error.code}, Message: ${error.message}`);
       let errorMessage = 'Falha no Login. Verifique seu e-mail e senha.';
        // Handle specific errors
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
      setLoading(false); // Stop loading on explicit failure
      return false;
    }
  };

   // Firebase Signup
   const signup = async (email: string, pass: string, name: string, username?: string): Promise<boolean> => {
     const signupStartTime = performance.now();
     console.log(`[AuthProvider Signup ${signupStartTime}] Attempting signup for ${email}`);
     if (!auth) {
        console.error(`[AuthProvider Signup ${signupStartTime}] Signup failed: Firebase Auth instance not available.`);
        toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada.", duration: 9000 });
        return false;
     }
     setLoading(true);
     let userId: string | null = null;

     try {
       const authCreateStartTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Creating user in Firebase Auth...`);
       const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
       userId = userCredential.user.uid;
       const authCreateEndTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Firebase Auth user created: ${userId} in ${authCreateEndTime - authCreateStartTime} ms.`);

       const profileUpdateStartTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Updating Firebase Auth profile for ${userId}...`);
       await updateProfile(userCredential.user, { displayName: name });
       const profileUpdateEndTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Firebase Auth profile updated for ${userId} in ${profileUpdateEndTime - profileUpdateStartTime} ms.`);

       const firestoreCreateStartTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Creating Firestore document for ${userId}...`);
       await createUserDocument(userId, email, name, username); // Already has logging
       const firestoreCreateEndTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Firestore document creation initiated/completed for ${userId}. Time since start: ${firestoreCreateEndTime - signupStartTime} ms.`);


       const signOutStartTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Signing out user ${userId} after signup...`);
       await signOut(auth);
       const signOutEndTime = performance.now();
       // The listener will handle setting user to null and loading to false
       console.log(`[AuthProvider Signup ${signupStartTime}] User signed out successfully in ${signOutEndTime - signOutStartTime} ms. Waiting for listener...`);

       const signupEndTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Signup process completed successfully in ${signupEndTime - signupStartTime} ms.`);
       // Do NOT set loading false here - listener will handle it after sign out completes
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
       setLoading(false); // Stop loading on explicit failure
       return false;
     }
   };


  // Firebase Logout
  const logout = async () => {
    const logoutStartTime = performance.now();
    console.log(`[AuthProvider Logout ${logoutStartTime}] Attempting logout...`);
    if (!auth) {
       console.error(`[AuthProvider Logout ${logoutStartTime}] Logout failed: Firebase Auth instance not available.`);
       toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada." });
       return;
    }
    setLoading(true); // Indicate loading during logout process
    try {
      await signOut(auth);
      // Listener handles clearing state and loading=false
      const logoutEndTime = performance.now();
      console.log(`[AuthProvider Logout ${logoutStartTime}] signOut successful. Time: ${logoutEndTime - logoutStartTime} ms. Waiting for onAuthStateChanged...`);
    } catch (error) {
      const logoutEndTime = performance.now();
      console.error(`[AuthProvider Logout ${logoutStartTime}] Logout failed after ${logoutEndTime - logoutStartTime} ms. Error:`, error);
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível sair." });
      setLoading(false); // Stop loading on explicit failure
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


  // Update Email
  const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
      const updateEmailStartTime = performance.now();
      console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempting to update email to ${newEmail}`);
      if (!auth || !firebaseUser || !user) {
          console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Failed: Auth not init or user not logged in.`);
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado ou Auth não inicializado." });
          return false;
      }
      setLoading(true);

      const reauthStart = performance.now();
      const isAuthenticated = await reauthenticate(currentPassword);
      const reauthEnd = performance.now();
      console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Reauthentication took ${reauthEnd - reauthStart} ms.`);

      if (!isAuthenticated) {
          setLoading(false);
          return false;
      }

      try {
          const authUpdateStart = performance.now();
          console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Reauthentication successful. Updating email in Firebase Auth...`);
          await firebaseUpdateEmail(firebaseUser, newEmail);
          const authUpdateEnd = performance.now();
          console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email updated in ${authUpdateEnd - authUpdateStart} ms. Updating Firestore...`);

          if (!db) throw new Error('Firestore DB instance is not available.');

          const firestoreUpdateStart = performance.now();
          await setUserData(firebaseUser.uid, { email: newEmail });
          const firestoreUpdateEnd = performance.now();
          console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore email updated in ${firestoreUpdateEnd - firestoreUpdateStart} ms. Updating local state...`);

          setUser({ ...user, email: newEmail }); // Update local state

          toast({ title: "Sucesso", description: "E-mail atualizado." });
          const updateEmailEndTime = performance.now();
          console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update successful. Total time: ${updateEmailEndTime - updateEmailStartTime} ms.`);
          return true; // Return true before setting loading false
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
          } else if (error.message?.includes('Firestore DB instance is not available')) {
              desc = 'Erro ao atualizar e-mail nos dados do usuário (DB não conectado).'
          }
          toast({ variant: "destructive", title: "Falha", description: desc });
          return false; // Return false before setting loading false
      } finally {
          setLoading(false); // Ensure loading is false in finally block
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

      const reauthStart = performance.now();
      const isAuthenticated = await reauthenticate(currentPassword);
      const reauthEnd = performance.now();
      console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Reauthentication took ${reauthEnd - reauthStart} ms.`);

      if (!isAuthenticated) {
          setLoading(false);
          return false;
      }

      try {
          const passUpdateStart = performance.now();
          console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Reauthentication successful. Updating password...`);
          await firebaseUpdatePassword(firebaseUser, newPassword);
          const passUpdateEnd = performance.now();
          toast({ title: "Sucesso", description: "Senha atualizada." });
          const updatePassEndTime = performance.now();
          console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update successful in ${passUpdateEnd - passUpdateStart} ms. Total time: ${updatePassEndTime - updatePassStartTime} ms.`);
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

  // Update Profile Name
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
           return false; // No need to set loading if validation fails early
       }
      setLoading(true);

      try {
          const authUpdateStart = performance.now();
          console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Updating Firebase Auth display name...`);
          await updateProfile(firebaseUser, { displayName: newName });
          const authUpdateEnd = performance.now();
          console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firebase Auth name updated in ${authUpdateEnd - authUpdateStart} ms. Updating Firestore...`);

           if (!db) throw new Error('Firestore DB instance is not available.');

          const firestoreUpdateStart = performance.now();
          await setUserData(firebaseUser.uid, { name: newName });
          const firestoreUpdateEnd = performance.now();
          console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore name updated in ${firestoreUpdateEnd - firestoreUpdateStart} ms. Updating local state...`);

          setUser({ ...user, name: newName }); // Update local state

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
           } else if (error.message?.includes('Firestore DB instance is not available')) {
              desc = 'Erro ao atualizar nome nos dados do usuário (DB não conectado).'
          }
          toast({ variant: "destructive", title: "Falha", description: desc });
          return false;
      } finally {
          setLoading(false);
      }
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, signup, logout, updateEmail, updatePassword, updateProfileName }}>
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
