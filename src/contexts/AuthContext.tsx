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
import { auth, db } from '@/lib/firebase'; // Import Firebase auth and db
import { useToast } from '@/hooks/use-toast';
import { getUserData, setUserData } from '@/services/firestoreService'; // Import Firestore service
import { doc, setDoc } from 'firebase/firestore'; // Import doc and setDoc

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
  const userDocRef = doc(db, 'users', userId);
  const userData: Partial<Omit<User, 'id'>> = {
    name,
    email,
    username: username || '', // Store username if provided
    role: 'driver', // Default role for new signups
    // Base might be set later or through an admin panel
  };
  try {
    // Use the imported `db` instance
    await setDoc(userDocRef, userData); // Use setDoc to create the document with the specific ID
    console.log('Firestore document created for user:', userId);
  } catch (firestoreError) {
    console.error('Error creating Firestore document for user:', userId, firestoreError);
    // Optionally, you might want to delete the Auth user if Firestore creation fails
    // This requires careful consideration of your app's logic
    throw firestoreError; // Re-throw the error to be caught by the signup catch block
  }
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null); // App's user state (combined Auth + Firestore)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null); // Raw Firebase Auth user
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Listen to Firebase Auth state changes
  useEffect(() => {
    // Ensure auth is initialized before using it
    if (!auth) {
      console.error("Firebase Auth is not initialized. Cannot set up listener.");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser); // Store the raw Firebase user
      if (fbUser) {
        console.log("Firebase Auth user found:", fbUser.uid);
        try {
            const userData = await getUserData(fbUser.uid);
            if (userData) {
              console.log("Firestore user data found:", userData);
              setUser({
                  id: fbUser.uid,
                  email: fbUser.email || userData.email || 'N/A', // Prioritize Auth email, then Firestore, then fallback
                  name: fbUser.displayName || userData.name,
                  role: userData.role || 'driver', // Default to driver if role missing
                  base: userData.base,
                  username: userData.username, // Include username from Firestore
              });
            } else {
                console.warn("Firestore user data not found for UID:", fbUser.uid);
                // If Firestore doc is missing, try to read from Auth (user might be newly created)
                const basicUserData = {
                    id: fbUser.uid,
                    email: fbUser.email || 'unknown@example.com',
                    name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Novo Usuário',
                    role: 'driver' as UserRole, // Assign default role
                };
                setUser(basicUserData);
                // Attempt to create the Firestore document if it's truly missing (e.g., after signup issues)
                try {
                  await createUserDocument(fbUser.uid, basicUserData.email, basicUserData.name);
                  console.log("Created basic Firestore document for new/missing user:", fbUser.uid);
                } catch (creationError) {
                   console.error("Failed to auto-create Firestore document on auth change:", creationError);
                }
            }
        } catch (error) {
             console.error("Error fetching or processing Firestore user data:", error);
             // Fallback to basic user info from Auth if Firestore interaction fails
              setUser({
                  id: fbUser.uid,
                  email: fbUser.email || 'error@example.com',
                  name: fbUser.displayName || 'Erro ao Carregar',
                  role: 'driver', // Default role on error
              });
        }

      } else {
        console.log("No Firebase Auth user.");
        setUser(null); // No user logged in
      }
      setLoading(false);
    });

    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []); // Empty dependency array ensures this runs once on mount

  // Firebase Login
  const login = async (email: string, pass: string): Promise<boolean> => {
    if (!auth) {
       toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada." });
       return false;
    }
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      // User state will be updated by onAuthStateChanged listener
      console.log('Login successful for:', userCredential.user.email);
      // setLoading(false); // Loading is set to false by the listener
      return true;
    } catch (error: any) {
      console.error('Login failed:', error);
      let errorMessage = 'Falha no Login. Verifique seu e-mail e senha.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'E-mail ou senha inválidos.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Formato de e-mail inválido.';
      } else if (error.code === 'auth/too-many-requests') {
         errorMessage = 'Muitas tentativas de login falhadas. Tente novamente mais tarde.';
      } else if (error.code === 'auth/network-request-failed') {
          errorMessage = 'Erro de rede ao tentar fazer login. Verifique sua conexão.';
      } else if (error.code?.includes('auth/')) { // Catch other specific auth errors
          errorMessage = `Erro de autenticação: ${error.code}`;
      }
      toast({
        variant: "destructive",
        title: "Falha no Login",
        description: errorMessage,
      });
      setLoading(false); // Ensure loading is false on error
      return false;
    }
    // No need for finally here, listener handles success case loading
  };

   // Firebase Signup
   const signup = async (email: string, pass: string, name: string, username?: string): Promise<boolean> => {
     if (!auth) {
        toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada." });
        return false;
     }
     setLoading(true);
     let userId: string | null = null; // Keep track of userId for potential cleanup

     try {
       // 1. Create user in Firebase Authentication
       console.log("Attempting to create user in Firebase Auth...");
       const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
       userId = userCredential.user.uid;
       console.log('Firebase Auth user created successfully:', userId);


       // 2. Update Firebase Auth profile (display name)
       console.log("Attempting to update Firebase Auth profile...");
       await updateProfile(userCredential.user, { displayName: name });
       console.log('Firebase Auth profile updated successfully for:', userId);

       // 3. Create user document in Firestore using the helper function
       console.log("Attempting to create Firestore document...");
       await createUserDocument(userId, email, name, username);
       console.log('Firestore document created successfully for user:', userId);

       console.log('Signup successful and Firestore document created for:', email);

       // Sign the user out immediately after signup, requiring them to log in
       console.log("Signing out user after signup...");
       await signOut(auth);
       setUser(null);
       setFirebaseUser(null);
       console.log('User signed out after successful signup.');


       setLoading(false);
       return true;
     } catch (error: any) {
       console.error('Signup failed:', error); // Log the detailed error
       let description = "Ocorreu um erro ao cadastrar."; // Default message

       // Check for specific Firebase Auth errors during creation/update
       if (error.code === 'auth/email-already-in-use') {
         description = "Este e-mail já está em uso por outra conta.";
         console.error("Signup Error: Email already in use.");
       } else if (error.code === 'auth/invalid-email') {
         description = "O formato do e-mail é inválido.";
         console.error("Signup Error: Invalid email format.");
       } else if (error.code === 'auth/weak-password') {
         description = "A senha é muito fraca (mínimo 6 caracteres).";
         console.error("Signup Error: Weak password.");
       } else if (error.code === 'auth/network-request-failed') {
           description = 'Erro de rede ao tentar cadastrar. Verifique sua conexão.';
           console.error("Signup Error: Network request failed.");
       } else if (error.code?.includes('auth/')) { // Catch other specific auth errors
           description = `Erro de autenticação: ${error.code}`;
           console.error(`Signup Auth Error: ${error.code}`, error.message);
       } else {
         // Handle potential Firestore errors during createUserDocument or other non-auth errors
         console.error('An unexpected error occurred during signup, potentially during Firestore operation:', error.message);
         description = `Erro inesperado: ${error.message || 'Verifique os dados e tente novamente.'}`;
       }

       toast({ variant: "destructive", title: "Falha no Cadastro", description });
       setLoading(false);
       return false;
     }
   };


  // Firebase Logout
  const logout = async () => {
    if (!auth) {
       toast({ variant: "destructive", title: "Erro de Configuração", description: "Autenticação não inicializada." });
       return;
    }
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null); // Clear app user state immediately
      setFirebaseUser(null);
      console.log('Logout successful');
    } catch (error) {
      console.error('Logout failed:', error);
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível sair." });
    } finally {
      setLoading(false);
    }
  };

  // Re-authenticate user helper needed for sensitive operations
  const reauthenticate = async (currentPassword: string): Promise<boolean> => {
      if (!auth || !firebaseUser || !firebaseUser.email) {
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado ou Auth não inicializado." });
          return false;
      }
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      try {
          await reauthenticateWithCredential(firebaseUser, credential);
          return true;
      } catch (error: any) { // Catch specific error
          console.error("Re-authentication failed:", error);
          let desc = "Senha atual incorreta.";
          if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
              // Keep the specific message
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
      if (!auth || !firebaseUser) {
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
          await firebaseUpdateEmail(firebaseUser, newEmail);
          // Update email in Firestore user document as well
          await setUserData(firebaseUser.uid, { email: newEmail });
          // Update local state (optional, as listener might catch it)
          if (user) setUser({ ...user, email: newEmail });

          toast({ title: "Sucesso", description: "E-mail atualizado." });
          setLoading(false);
          return true;
      } catch (error: any) {
          console.error("Error updating email:", error);
          let desc = "Não foi possível atualizar o e-mail.";
          if (error.code === 'auth/email-already-in-use') {
              desc = "Este e-mail já está em uso por outra conta.";
          } else if (error.code === 'auth/invalid-email') {
              desc = "O formato do novo e-mail é inválido.";
          } else if (error.code === 'auth/requires-recent-login') {
             desc = 'Esta operação requer login recente. Faça logout e login novamente.';
          }
          toast({ variant: "destructive", title: "Falha", description: desc });
          setLoading(false);
          return false;
      }
  };

  // Update Password in Firebase Auth
  const updatePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
      if (!auth || !firebaseUser) {
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
          setLoading(false);
          return true;
      } catch (error: any) {
          console.error("Error updating password:", error);
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
       if (!auth || !firebaseUser || !user) {
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
          // Update Firebase Auth display name
          await updateProfile(firebaseUser, { displayName: newName });
          // Update Firestore user document
          await setUserData(firebaseUser.uid, { name: newName });
          // Update local state
          setUser({ ...user, name: newName });

          toast({ title: "Sucesso", description: "Nome atualizado." });
          setLoading(false);
          return true;
      } catch (error: any) { // Catch specific error
          console.error("Error updating profile name:", error);
          let desc = "Não foi possível atualizar o nome.";
           if (error.code === 'auth/requires-recent-login') {
              desc = 'Esta operação requer login recente. Faça logout e login novamente.';
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
