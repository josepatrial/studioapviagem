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
  updateProfile
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase'; // Import Firebase auth and db
import { doc, getDoc, setDoc } from 'firebase/firestore'; // Import Firestore functions
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
  logout: () => void;
  updateEmail: (currentPassword: string, newEmail: string) => Promise<boolean>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  updateProfileName: (newName: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Remove mock data related to users/drivers as it's now in Firestore
// export const initialDrivers: DriverInfo[] = [...]; // REMOVED

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
        // Fetch additional user data (role, base) from Firestore
        const userData = await getUserData(fbUser.uid);
        if (userData) {
          console.log("Firestore user data found:", userData);
           // Combine Auth info (email might be more up-to-date) and Firestore data
          setUser({
              id: fbUser.uid,
              email: fbUser.email || userData.email, // Prefer Auth email if available
              name: fbUser.displayName || userData.name, // Prefer Auth name if available
              role: userData.role,
              base: userData.base,
          });
        } else {
            console.warn("Firestore user data not found for UID:", fbUser.uid);
            // Optionally handle this case: maybe sign out, or create a Firestore entry
            // For now, set basic user info from Auth, assuming default role 'driver' if needed
             setUser({
                 id: fbUser.uid,
                 email: fbUser.email || 'unknown@example.com',
                 name: fbUser.displayName || fbUser.email?.split('@')[0],
                 role: 'driver', // Default role if Firestore data is missing
                 // base: undefined - base comes from Firestore
             });
             // Attempt to create a basic user doc if it's missing? Risky without role context.
             // await setUserData(fbUser.uid, { email: fbUser.email || '', role: 'driver' });
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
      // No need to manually set user here, listener handles it
      // setLoading(false); // Listener sets loading to false
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
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, logout, updateEmail, updatePassword, updateProfileName }}>
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

// Export initialDrivers is no longer needed as it's replaced by Firestore
// export { initialDrivers };