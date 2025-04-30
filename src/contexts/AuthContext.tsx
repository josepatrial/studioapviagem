// src/contexts/AuthContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  // Add other user properties as needed
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<boolean>; // Simulate login
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Simulate checking auth status on mount
  useEffect(() => {
    // In a real app, you'd check local storage/cookies or make an API call
    const storedUser = localStorage.getItem('rotaCertaUser');
    if (storedUser) {
        try {
            setUser(JSON.parse(storedUser));
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
        // Basic validation simulation
        if (email && pass) {
          const simulatedUser: User = { id: '1', email };
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
