// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast'; // Import useToast

// Define user roles
export type UserRole = 'driver' | 'admin';

export interface User { // Export User interface
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
const MOCK_DRIVER_PASSWORD = 'password123'; // Default password for initial drivers

// Mock drivers data (needed for login simulation) - Consider moving this to a separate file
// Use the exported User interface but narrow down roles for this list
export interface DriverInfo extends Omit<User, 'role'>{ // Export DriverInfo
    role: 'driver'; // Explicitly driver
    username: string; // Add username back for the Drivers component needs
    password?: string; // Add password field (INSECURE - for demo only)
}


// This array serves as the *source of truth* for drivers in this mock setup.
// The Drivers component modifies this array directly.
// IMPORTANT: Storing plain text passwords here is highly insecure. For demonstration only.
export const initialDrivers: DriverInfo[] = [ // Export initialDrivers
  { id: 'driver1', name: 'João Silva', username: 'joao.silva', email: 'joao@grupo2irmaos.com.br', role: 'driver', base: 'Base SP', password: MOCK_DRIVER_PASSWORD }, // Updated email
  { id: 'driver2', name: 'Maria Souza', username: 'maria.souza', email: 'maria@example.com', role: 'driver', base: 'Base RJ', password: MOCK_DRIVER_PASSWORD },
  { id: 'driver3', name: 'Carlos Pereira', username: 'carlos.pereira', email: 'carlos@example.com', role: 'driver', base: 'Base SP', password: MOCK_DRIVER_PASSWORD },
  { id: 'driver4', name: 'Ana Costa', username: 'ana.costa', email: 'ana@example.com', role: 'driver', base: 'Base MG', password: MOCK_DRIVER_PASSWORD },
];


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
    console.log(`Login attempt with email: ${email}, password: ${pass}`); // Log input
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
           console.log('Admin login attempt successful'); // Log admin success
        }
        // Simulate regular driver login
        else {
           console.log('Attempting driver login for:', email); // Log driver attempt
           // IMPORTANT: Check against the potentially modified initialDrivers array
           const driver = initialDrivers.find(d => d.email === email);
           console.log('Found driver in initialDrivers:', driver); // Log found driver

           if (driver) {
                console.log('Driver password stored:', driver.password); // Log stored password
                console.log('Password provided:', pass); // Log provided password
                const passwordMatch = pass === driver.password;
                console.log('Password comparison result:', passwordMatch); // Log comparison result

                 // Check against the DRIVER'S specific password
                 if (driver.password && passwordMatch) {
                      simulatedUser = {
                         id: driver.id,
                         email: driver.email,
                         name: driver.name,
                         role: 'driver',
                         base: driver.base
                      };
                      console.log('Driver login successful for:', email); // Log driver success
                 } else {
                     console.log('Driver login failed (password mismatch or no password) for:', email); // Log driver failure reason
                 }

           } else {
                console.log('Driver login failed (driver not found) for:', email); // Log driver failure reason
           }
        }


        if (simulatedUser) {
          setUser(simulatedUser);
          localStorage.setItem('rotaCertaUser', JSON.stringify(simulatedUser));
          setLoading(false);
           console.log('User set in context:', simulatedUser); // Log setting user
          resolve(true); // Login successful
        } else {
          setLoading(false);
          console.log('Login failed overall for:', email); // Log overall failure
          resolve(false); // Login failed
        }
      }, 500);
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
         // In a real app: Verify currentPassword against stored hash before updating email
         const driver = user ? initialDrivers.find(d => d.id === user.id) : null;
         const currentStoredPassword = user?.role === 'admin' ? ADMIN_PASSWORD : driver?.password;
         const isPasswordCorrect = currentStoredPassword === currentPassword;


         if (isPasswordCorrect && newEmail && user) { // Check password based on role
           const updatedUser = { ...user, email: newEmail };
           setUser(updatedUser);
           localStorage.setItem('rotaCertaUser', JSON.stringify(updatedUser));

            // Also update the email in the initialDrivers array if it's a driver
            if (user.role === 'driver') {
                 const driverIndex = initialDrivers.findIndex(d => d.id === user.id);
                 if (driverIndex !== -1) {
                    initialDrivers[driverIndex].email = newEmail;
                 }
            }

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
         const driver = user ? initialDrivers.find(d => d.id === user.id) : null;
         const currentStoredPassword = user?.role === 'admin' ? ADMIN_PASSWORD : driver?.password;
         const isPasswordCorrect = currentStoredPassword === currentPassword;


         if (isPasswordCorrect && newPassword && user) { // Check password based on role
           // In a real app, update the password hash in the backend

           // Update the mock password for this user in initialDrivers
            if (user.role === 'driver') {
                const driverIndex = initialDrivers.findIndex(d => d.id === user.id);
                 if (driverIndex !== -1) {
                    initialDrivers[driverIndex].password = newPassword;
                     console.log(`Password updated for driver ${user.id} (simulated)`);
                 }
            } else if (user.role === 'admin') {
                // Note: Admin password change isn't persisted in this mock setup beyond runtime.
                console.log("Admin password change requested (not persisted in mock)");
            }


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

           // Also update the name in the initialDrivers array if it's a driver
            if (user.role === 'driver') {
                const driverIndex = initialDrivers.findIndex(d => d.id === user.id);
                 if (driverIndex !== -1) {
                    initialDrivers[driverIndex].name = newName;
                 }
            }

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
