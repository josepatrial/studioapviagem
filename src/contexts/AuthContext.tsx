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
  // Check db instance right at the start
  if (!db) {
      console.error('Firestore DB instance is not available in createUserDocument.');
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
    console.log('Firestore document created for user:', userId);
  } catch (firestoreError: any) {
    console.error('Error creating Firestore document for user:', userId, firestoreError);
    // Optionally, you might want to delete the Auth user if Firestore creation fails
    // This requires careful consideration of your app's logic
    throw new Error(`Failed to create Firestore user document: ${firestoreError.message}`); // Re-throw with a more specific message
  }
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null); // App's user state (combined Auth + Firestore)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null); // Raw Firebase Auth user
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Listen to Firebase Auth state changes
  useEffect(() => {
    console.log("[AuthProvider Effect] Setting up auth state listener.");
    setLoading(true); // Start loading whenever the listener setup runs

    // Ensure auth is initialized before using it
    if (!auth) {
      console.error("AuthProvider useEffect: Firebase Auth instance is not available. Cannot set up listener. Check firebase.ts initialization.");
      setLoading(false); // Stop loading if auth fails
      setUser(null);
      setFirebaseUser(null);
      return;
    } else {
      console.log("AuthProvider useEffect: Firebase Auth instance available.");
    }

    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      const startTime = performance.now();
      console.log(`[AuthProvider onAuthStateChanged ${startTime}] Received auth state. isMounted: ${isMounted}, fbUser present: ${!!fbUser}`);
      if (!isMounted) {
         console.log(`[AuthProvider onAuthStateChanged ${startTime}] Component unmounted, skipping state update.`);
         return;
      }

      // **Crucially, set loading to true HERE when auth state changes and we need to process it**
      setLoading(true);
      setFirebaseUser(fbUser);

      if (fbUser) {
        console.log(`[AuthProvider onAuthStateChanged ${startTime}] Firebase Auth user found: ${fbUser.uid}, Email: ${fbUser.email}. Fetching Firestore data...`);
        try {
            // Wait for persistence enabling to complete (or fail) before fetching data
            if (persistenceEnabledPromise) {
                 const persistenceStartTime = performance.now();
                 console.log(`[AuthProvider ${startTime}] Waiting for persistence promise...`);
                 await persistenceEnabledPromise;
                 const persistenceEndTime = performance.now();
                 console.log(`[AuthProvider ${startTime}] Persistence promise resolved/rejected in ${persistenceEndTime - persistenceStartTime} ms.`);
            } else {
                 console.warn(`[AuthProvider ${startTime}] Persistence promise not found. Proceeding without waiting.`);
            }

            if (!db) {
                throw new Error('Firestore DB instance is not available. Cannot fetch user data.');
            }
            const firestoreStartTime = performance.now();
            console.log(`[AuthProvider ${startTime}] Attempting to fetch Firestore data for UID: ${fbUser.uid}`);
            const userData = await getUserData(fbUser.uid);
            const firestoreEndTime = performance.now();
            console.log(`[AuthProvider ${startTime}] Firestore data fetch for ${fbUser.uid} took ${firestoreEndTime - firestoreStartTime} ms.`);

            if (!isMounted) {
                console.log(`[AuthProvider ${startTime}] Component unmounted after fetching Firestore data, skipping state update.`);
                setLoading(false); // Ensure loading stops even if unmounted after async operation
                return;
            }

            if (userData) {
              console.log(`[AuthProvider ${startTime}] Firestore user data found for ${fbUser.uid}:`, userData);
              setUser({
                  id: fbUser.uid,
                  email: fbUser.email || userData.email || 'N/A',
                  name: fbUser.displayName || userData.name,
                  role: userData.role || 'driver',
                  base: userData.base,
                  username: userData.username,
              });
            } else {
                console.warn(`[AuthProvider ${startTime}] Firestore user data NOT found for UID: ${fbUser.uid}. Attempting second check/creation.`);
                 // Check again if the document exists, maybe it was created just now by another process/tab
                const freshUserData = await getUserData(fbUser.uid);
                const secondCheckEndTime = performance.now();
                 console.log(`[AuthProvider ${startTime}] Second Firestore check took ${secondCheckEndTime - firestoreEndTime} ms.`);

                if (!isMounted) {
                    console.log(`[AuthProvider ${startTime}] Component unmounted after second Firestore check, skipping state update.`);
                     setLoading(false);
                    return;
                 }
                if (freshUserData) {
                     console.log(`[AuthProvider ${startTime}] Retrieved Firestore data on second attempt for ${fbUser.uid}:`, freshUserData);
                      setUser({
                         id: fbUser.uid,
                         email: fbUser.email || freshUserData.email || 'N/A',
                         name: fbUser.displayName || freshUserData.name,
                         role: freshUserData.role || 'driver',
                         base: freshUserData.base,
                         username: freshUserData.username,
                      });
                } else {
                    console.warn(`[AuthProvider ${startTime}] Firestore user data still missing for UID: ${fbUser.uid}. Using basic Auth data and attempting creation.`);
                    const basicUserData = {
                        id: fbUser.uid,
                        email: fbUser.email || 'unknown@example.com',
                        name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Novo Usuário',
                        role: 'driver' as UserRole,
                    };
                     if (!isMounted) {
                        console.log(`[AuthProvider ${startTime}] Component unmounted before setting basic user data, skipping.`);
                        setLoading(false);
                        return;
                     }
                     setUser(basicUserData);
                     try {
                       await createUserDocument(fbUser.uid, basicUserData.email, basicUserData.name);
                       console.log(`[AuthProvider ${startTime}] Attempted to auto-create Firestore document for new/missing user: ${fbUser.uid}`);
                     } catch (creationError: any) {
                        console.error(`[AuthProvider ${startTime}] Failed to auto-create Firestore document:`, creationError.message);
                     }
                }
            }
        } catch (error: any) {
             if (!isMounted) {
                console.log(`[AuthProvider ${startTime}] Component unmounted after Firestore error, skipping state update.`);
                setLoading(false);
                return;
             }
             console.error(`[AuthProvider ${startTime}] Error fetching or processing user data for ${fbUser.uid}:`, error.message, error.code);

              // Check specifically for Firestore offline error
             if (error instanceof FirestoreError && error.code === 'unavailable') {
                   console.warn(`[AuthProvider ${startTime}] Firestore unavailable (likely offline). Using basic Auth data.`);
                   setUser({
                       id: fbUser.uid,
                       email: fbUser.email || 'offline@example.com',
                       name: fbUser.displayName || 'Usuário Offline',
                       role: 'driver', // Assume default role when offline and no data
                       // Base and username might be undefined
                   });
                   toast({ variant: "default", title: "Modo Offline", description: "Não foi possível carregar dados completos. Verifique sua conexão.", duration: 5000 });
              } else {
                  // Handle other errors
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
             console.log(`[AuthProvider onAuthStateChanged ${startTime}] Finished processing user state for ${fbUser.uid}. Total time: ${endTime - startTime} ms. Setting loading to false.`);
             setLoading(false); // **Ensure loading is false after processing**
           } else {
             console.log(`[AuthProvider ${startTime}] Component unmounted before finally block could set loading to false.`);
             // If unmounted, the state update wouldn't happen anyway, but explicitly setting it
             // might prevent issues if there's a slight delay in unmounting logic.
             setLoading(false);
           }
        }

      } else {
        console.log(`[AuthProvider onAuthStateChanged ${startTime}] No Firebase Auth user.`);
        if (!isMounted) {
            console.log(`[AuthProvider ${startTime}] Component unmounted while processing null user, skipping state update.`);
            setLoading(false);
            return;
        }
        setUser(null);
        setFirebaseUser(null); // Ensure firebaseUser is also cleared
        setLoading(false); // **Ensure loading is false when no user**
        console.log(`[AuthProvider onAuthStateChanged ${startTime}] Processed null user. Loading set to false.`);
      }
    });

    return () => {
        console.log("[AuthProvider Effect Cleanup] Unsubscribing from auth state changes.");
        isMounted = false;
        unsubscribe();
    };
  }, [toast]); // Added toast to dependency array as it's used inside

  // Firebase Login
  const login = async (email: string, pass: string): Promise<boolean> => {
    const loginStartTime = performance.now();
    console.log(`[AuthProvider Login ${loginStartTime}] Attempting login for ${email}`);
    if (!auth) {
       console.error(`[AuthProvider Login ${loginStartTime}] Login failed: Firebase Auth instance is not available.`);
       toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada.", duration: 9000 });
       return false;
    }
    setLoading(true); // Set loading true at the start of login attempt
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const loginEndTime = performance.now();
      console.log(`[AuthProvider Login ${loginStartTime}] signInWithEmailAndPassword successful for ${userCredential.user.email}. Time: ${loginEndTime - loginStartTime} ms. Waiting for onAuthStateChanged...`);
      // **Crucially, we return true here, but the UI update depends on the listener**
      // The listener will set loading to false after processing the new auth state
      return true;
    } catch (error: any) {
       const loginEndTime = performance.now();
       console.error(`[AuthProvider Login ${loginStartTime}] Login failed for ${email}. Time: ${loginEndTime - loginStartTime} ms. Error:`, error);
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
         else if (error.code?.includes('auth/')) { // Catch other specific auth errors
              errorMessage = `Erro de autenticação (${error.code}). Tente novamente.`;
         }
      toast({
        variant: "destructive",
        title: "Falha no Login",
        description: errorMessage,
        duration: 9000,
      });
      // Set loading false here only if login *fails*. Success relies on listener.
      setLoading(false);
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
     // **Set loading true at the start of the signup process**
     setLoading(true);
     let userId: string | null = null;

     try {
       console.log(`[AuthProvider Signup ${signupStartTime}] Creating user in Firebase Auth...`);
       const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
       userId = userCredential.user.uid;
       console.log(`[AuthProvider Signup ${signupStartTime}] Firebase Auth user created: ${userId}`);

       console.log(`[AuthProvider Signup ${signupStartTime}] Updating Firebase Auth profile for ${userId}...`);
       await updateProfile(userCredential.user, { displayName: name });
       console.log(`[AuthProvider Signup ${signupStartTime}] Firebase Auth profile updated for ${userId}.`);

       console.log(`[AuthProvider Signup ${signupStartTime}] Creating Firestore document for ${userId}...`);
       await createUserDocument(userId, email, name, username);
       console.log(`[AuthProvider Signup ${signupStartTime}] Firestore document created for ${userId}.`);

       console.log(`[AuthProvider Signup ${signupStartTime}] Signing out user ${userId} after signup...`);
       await signOut(auth);
       // The listener will handle setting user to null and loading to false
       console.log(`[AuthProvider Signup ${signupStartTime}] User signed out successfully. Waiting for listener...`);

       const signupEndTime = performance.now();
       console.log(`[AuthProvider Signup ${signupStartTime}] Signup process completed successfully in ${signupEndTime - signupStartTime} ms.`);
       // Do NOT set loading false here - listener will handle it after sign out completes
       return true;
     } catch (error: any) {
       const signupEndTime = performance.now();
       console.error(`[AuthProvider Signup ${signupStartTime}] Signup failed after ${signupEndTime - signupStartTime} ms. Error:`, error);
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
       // **Set loading false in the catch block as well**
       setLoading(false);
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
    // Set loading true at start of logout process
    setLoading(true);
    try {
      await signOut(auth);
      // User state clearing and loading=false is handled by the listener
      const logoutEndTime = performance.now();
      console.log(`[AuthProvider Logout ${logoutStartTime}] signOut successful. Time: ${logoutEndTime - logoutStartTime} ms. Waiting for onAuthStateChanged...`);
    } catch (error) {
      const logoutEndTime = performance.now();
      console.error(`[AuthProvider Logout ${logoutStartTime}] Logout failed after ${logoutEndTime - logoutStartTime} ms. Error:`, error);
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível sair." });
      // Ensure loading is false if signOut itself throws an error
      setLoading(false);
    }
  };

  // Re-authenticate user helper needed for sensitive operations
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
          console.error(`[AuthProvider Reauthenticate ${reauthStartTime}] Reauthentication failed after ${reauthEndTime - reauthStartTime} ms. Error:`, error);
          let desc = "Senha atual incorreta.";
          if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
              // Keep msg
          } else if (error.code === 'auth/too-many-requests') {
               desc = 'Muitas tentativas falhadas. Tente novamente mais tarde.';
          } else {
               desc = 'Erro ao reautenticar. Tente novamente.'
          }
          toast({ variant: "destructive", title: "Autenticação Falhou", description: desc });
          return false;
      }
  };


  // Update Email in Firebase Auth and Firestore
  const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
      const updateEmailStartTime = performance.now();
      console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Attempting to update email to ${newEmail}`);
      if (!auth || !firebaseUser) {
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
          console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Reauthentication successful. Updating email in Firebase Auth...`);
          await firebaseUpdateEmail(firebaseUser, newEmail);
          console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firebase Auth email updated. Updating Firestore...`);
          if (!db) {
               throw new Error('Firestore DB instance is not available. Cannot update user email in Firestore.');
           }
          await setUserData(firebaseUser.uid, { email: newEmail });
          console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Firestore email updated. Updating local state...`);
          if (user) setUser({ ...user, email: newEmail });

          toast({ title: "Sucesso", description: "E-mail atualizado." });
          const updateEmailEndTime = performance.now();
          console.log(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update successful. Total time: ${updateEmailEndTime - updateEmailStartTime} ms.`);
          setLoading(false);
          return true;
      } catch (error: any) {
          const updateEmailEndTime = performance.now();
          console.error(`[AuthProvider UpdateEmail ${updateEmailStartTime}] Email update failed after ${updateEmailEndTime - updateEmailStartTime} ms. Error:`, error);
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
          setLoading(false);
          return false;
      }
  };

  // Update Password in Firebase Auth
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
          console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Reauthentication successful. Updating password...`);
          await firebaseUpdatePassword(firebaseUser, newPassword);
          toast({ title: "Sucesso", description: "Senha atualizada." });
          const updatePassEndTime = performance.now();
          console.log(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update successful. Total time: ${updatePassEndTime - updatePassStartTime} ms.`);
          setLoading(false);
          return true;
      } catch (error: any) {
          const updatePassEndTime = performance.now();
           console.error(`[AuthProvider UpdatePassword ${updatePassStartTime}] Password update failed after ${updatePassEndTime - updatePassStartTime} ms. Error:`, error);
           let desc = "Não foi possível atualizar a senha.";
           if (error.code === 'auth/weak-password') {
               desc = "A nova senha é muito fraca. Use pelo menos 6 caracteres.";
           } else if (error.code === 'auth/requires-recent-login') {
              desc = 'Esta operação requer login recente. Faça logout e login novamente.';
           }
          toast({ variant: "destructive", title: "Falha", description: desc });
          setLoading(false);
          return false;
      }
  };

  // Update Display Name in Firebase Auth and Firestore
  const updateProfileName = async (newName: string): Promise<boolean> => {
      const updateNameStartTime = performance.now();
       console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Attempting name update to ${newName}.`);
       if (!auth || !firebaseUser || !user) {
          console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Failed: Auth not init or user not logged in.`);
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado ou Auth não inicializado." });
          return false;
      }
      setLoading(true);
      if (!newName.trim()) {
          toast({ variant: "destructive", title: "Erro", description: "Nome não pode ser vazio." });
          setLoading(false);
          return false;
      }

      try {
          console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Updating Firebase Auth display name...`);
          await updateProfile(firebaseUser, { displayName: newName });
          console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firebase Auth name updated. Updating Firestore...`);
           if (!db) {
               throw new Error('Firestore DB instance is not available. Cannot update user name in Firestore.');
           }
          await setUserData(firebaseUser.uid, { name: newName });
          console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Firestore name updated. Updating local state...`);
          setUser({ ...user, name: newName });

          toast({ title: "Sucesso", description: "Nome atualizado." });
           const updateNameEndTime = performance.now();
          console.log(`[AuthProvider UpdateName ${updateNameStartTime}] Name update successful. Total time: ${updateNameEndTime - updateNameStartTime} ms.`);
          setLoading(false);
          return true;
      } catch (error: any) {
           const updateNameEndTime = performance.now();
           console.error(`[AuthProvider UpdateName ${updateNameStartTime}] Name update failed after ${updateNameEndTime - updateNameStartTime} ms. Error:`, error);
           let desc = "Não foi possível atualizar o nome.";
           if (error.code === 'auth/requires-recent-login') {
              desc = 'Esta operação requer login recente. Faça logout e login novamente.';
           } else if (error.message?.includes('Firestore DB instance is not available')) {
              desc = 'Erro ao atualizar nome nos dados do usuário (DB não conectado).'
          }
          toast({ variant: "destructive", title: "Falha", description: desc });
          setLoading(false);
          return false;
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
