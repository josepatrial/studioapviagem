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
import { auth } from '@/lib/firebase'; // Import Firebase auth
import { useToast } from '@/hooks/use-toast';
import { getUserData, setUserData } from '@/services/firestoreService'; // Import Firestore service


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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null); // App's user state (combined Auth + Firestore)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null); // Raw Firebase Auth user
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Listen to Firebase Auth state changes
  useEffect(() => {
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
                // If Firestore doc is missing, create a basic one assuming 'driver' role
                const basicUserData = {
                    id: fbUser.uid,
                    email: fbUser.email || 'unknown@example.com',
                    name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Novo Usuário',
                    role: 'driver' as UserRole, // Assign default role
                    // Base and username might be missing here
                };
                setUser(basicUserData);
                // Attempt to create the Firestore document
                await setUserData(fbUser.uid, {
                    email: basicUserData.email,
                    name: basicUserData.name,
                    role: basicUserData.role
                });
                 console.log("Created basic Firestore document for new/missing user:", fbUser.uid);
            }
        } catch (error) {
             console.error("Error fetching or creating Firestore user data:", error);
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
  }, []);

  // Firebase Login
  const login = async (email: string, pass: string): Promise<boolean> => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      // User state will be updated by onAuthStateChanged listener
      console.log('Login successful for:', userCredential.user.email);
      return true;
    } catch (error: any) {
      console.error('Login failed:', error);
      let errorMessage = 'Falha no Login. Verifique seu e-mail e senha.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'E-mail ou senha inválidos.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Formato de e-mail inválido.';
      }
      toast({
        variant: "destructive",
        title: "Falha no Login",
        description: errorMessage,
      });
      setLoading(false);
      return false;
    }
  };

   // Firebase Signup
   const signup = async (email: string, pass: string, name: string, username?: string): Promise<boolean> => {
     setLoading(true);
     try {
       // 1. Create user in Firebase Authentication
       const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
       const userId = userCredential.user.uid;

       // 2. Update Firebase Auth profile (display name)
       await updateProfile(userCredential.user, { displayName: name });

       // 3. Create user document in Firestore with 'driver' role (default for self-signup)
       const userData: Partial<Omit<User, 'id'>> = {
         name,
         email,
         username: username || '', // Store username if provided
         role: 'driver', // Default role for new signups
         // Base might be set later or through an admin panel
       };
       await setUserData(userId, userData);

       console.log('Signup successful and Firestore document created for:', email);
       // Sign the user out immediately after signup, requiring them to log in
       await signOut(auth);
       setUser(null);
       setFirebaseUser(null);

       setLoading(false);
       return true;
     } catch (error: any) {
       console.error('Signup failed:', error);
       let description = "Ocorreu um erro ao cadastrar.";
       if (error.code === 'auth/email-already-in-use') {
         description = "Este e-mail já está em uso por outra conta.";
       } else if (error.code === 'auth/invalid-email') {
         description = "O formato do e-mail é inválido.";
       } else if (error.code === 'auth/weak-password') {
         description = "A senha é muito fraca (mínimo 6 caracteres).";
       }
       toast({ variant: "destructive", title: "Falha no Cadastro", description });
       setLoading(false);
       return false;
     }
   };


  // Firebase Logout
  const logout = async () => {
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
      if (!firebaseUser || !firebaseUser.email) {
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
          return false;
      }
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      try {
          await reauthenticateWithCredential(firebaseUser, credential);
          return true;
      } catch (error) {
          console.error("Re-authentication failed:", error);
          toast({ variant: "destructive", title: "Autenticação Falhou", description: "Senha atual incorreta." });
          return false;
      }
  };


  // Update Email in Firebase Auth and Firestore
  const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
      setLoading(true);
      if (!firebaseUser) {
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
          setLoading(false);
          return false;
      }

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
          }
          toast({ variant: "destructive", title: "Falha", description: desc });
          setLoading(false);
          return false;
      }
  };

  // Update Password in Firebase Auth
  const updatePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
      setLoading(true);
      if (!firebaseUser) {
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
          setLoading(false);
          return false;
      }

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
           }
          toast({ variant: "destructive", title: "Falha", description: desc });
          setLoading(false);
          return false;
      }
  };

  // Update Display Name in Firebase Auth and Firestore
  const updateProfileName = async (newName: string): Promise<boolean> => {
      setLoading(true);
      if (!firebaseUser || !user) {
          toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
          setLoading(false);
          return false;
      }
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
      } catch (error) {
          console.error("Error updating profile name:", error);
          toast({ variant: "destructive", title: "Falha", description: "Não foi possível atualizar o nome." });
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
