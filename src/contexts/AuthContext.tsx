// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast'; // Import useToast

// Define user roles
export type UserRole = 'driver' | 'admin';

interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole; // Add role property
  base?: string; // Add optional base for drivers
  // Add other user properties as needed
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<boolean>; // Simulate login
  logout: () => void;
  updateEmail: (currentPassword: string, newEmail: string) => Promise<boolean>; // Add updateEmail
  updatePassword: (currentPassword: string, newPassword: string) => Promise<boolean>; // Add updatePassword
  updateProfileName: (newName: string) => Promise<boolean>; // Add updateProfileName (placeholder)
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock admin user credentials
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'adminpassword'; // Use a more secure method in production

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast(); // Use toast for feedback

  // Simulate checking auth status on mount
  useEffect(() => {
    // In a real app, you'd check local storage/cookies or make an API call
    const storedUser = localStorage.getItem('rotaCertaUser');
    if (storedUser) {
        try {
            const parsedUser: User = JSON.parse(storedUser);
             // Add default name if missing
             if (!parsedUser.name && parsedUser.email) {
               parsedUser.name = parsedUser.email.split('@')[0];
             }
             // Ensure role exists, default to 'driver' if missing (for backward compatibility)
             if (!parsedUser.role) {
                 parsedUser.role = 'driver';
             }
            setUser(parsedUser);
        } catch (e) {
            console.error("Failed to parse stored user data:", e);
            localStorage.removeItem('rotaCertaUser'); // Clear invalid data
        }
    }
    setLoading(false);
  }, []);

  // Simulate login
  const login = async (email: string, pass: string): Promise<boolean> => {
    setLoading(true);
    // Simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        let simulatedUser: User | null = null;

        // Check for admin login
        if (email === ADMIN_EMAIL && pass === ADMIN_PASSWORD) {
          simulatedUser = {
              id: 'admin001',
              email: ADMIN_EMAIL,
              name: 'Administrador',
              role: 'admin'
          };
        }
        // Simulate regular driver login (replace with actual driver lookup)
        else if (email && pass) {
           const name = email.split('@')[0]; // Default name from email
           // Find driver in mock data (replace with real auth)
           const driver = initialDrivers.find(d => d.email === email); // Assuming initialDrivers exists globally or is accessible
           simulatedUser = {
               id: driver?.id || String(Date.now()), // Use driver ID or generate one
               email,
               name: driver?.name || name,
               role: 'driver',
               base: driver?.base || 'DefaultBase' // Use driver base or default
            };
        }


        if (simulatedUser) {
          setUser(simulatedUser);
          localStorage.setItem('rotaCertaUser', JSON.stringify(simulatedUser));
          setLoading(false);
          resolve(true); // Login successful
        } else {
          setLoading(false);
          resolve(false); // Login failed
        }
      }, 1000); // Simulate network delay
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('rotaCertaUser');
    // In a real app, you might also need to call a backend endpoint to invalidate the session/token
  };

   // Simulate updating email
   const updateEmail = async (currentPassword: string, newEmail: string): Promise<boolean> => {
     setLoading(true);
     return new Promise((resolve) => {
       setTimeout(() => {
         // Simulate password check and update
         if (currentPassword === 'password123' && newEmail && user) { // Replace 'password123' with real check logic
           const updatedUser = { ...user, email: newEmail };
           setUser(updatedUser);
           localStorage.setItem('rotaCertaUser', JSON.stringify(updatedUser));
           setLoading(false);
           toast({ title: "Sucesso", description: "E-mail atualizado." });
           resolve(true);
         } else {
           setLoading(false);
           toast({ variant: "destructive", title: "Falha", description: "Senha atual incorreta ou e-mail inválido." });
           resolve(false);
         }
       }, 1000);
     });
   };

   // Simulate updating password
   const updatePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
     setLoading(true);
     return new Promise((resolve) => {
       setTimeout(() => {
         // Simulate password check and update
         if (currentPassword === 'password123' && newPassword) { // Replace 'password123' with real check logic
           // In a real app, update the password in the backend
           console.log("Password updated (simulated)");
           setLoading(false);
           toast({ title: "Sucesso", description: "Senha atualizada." });
           resolve(true);
         } else {
           setLoading(false);
           toast({ variant: "destructive", title: "Falha", description: "Senha atual incorreta." });
           resolve(false);
         }
       }, 1000);
     });
   };

    // Simulate updating profile name (placeholder)
   const updateProfileName = async (newName: string): Promise<boolean> => {
     setLoading(true);
     return new Promise((resolve) => {
       setTimeout(() => {
         if (newName && user) {
           const updatedUser = { ...user, name: newName };
           setUser(updatedUser);
           localStorage.setItem('rotaCertaUser', JSON.stringify(updatedUser));
           setLoading(false);
           toast({ title: "Sucesso", description: "Nome atualizado." });
           resolve(true);
         } else {
           setLoading(false);
           toast({ variant: "destructive", title: "Falha", description: "Nome inválido." });
           resolve(false);
         }
       }, 500); // Shorter delay for name update
     });
   };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateEmail, updatePassword, updateProfileName }}>
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

// Mock drivers data (needed for login simulation) - Consider moving this to a separate file
interface Driver {
    id: string;
    name: string;
    username: string;
    email: string;
    base: string;
}

export const initialDrivers: Driver[] = [
  { id: 'driver1', name: 'João Silva', username: 'joao.silva', email: 'joao@example.com', base: 'Base SP' },
  { id: 'driver2', name: 'Maria Souza', username: 'maria.souza', email: 'maria@example.com', base: 'Base RJ' },
];