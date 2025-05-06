'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react'; // Added useState for a local loading state if needed
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Home() {
  const { user, loading: authContextLoading, checkLocalLogin } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true); // Local loading state for initial checks

  useEffect(() => {
    let isMounted = true;
    const effectStartTime = performance.now();
    console.log(`[Home Page Effect ${effectStartTime}] Running. AuthContextLoading: ${authContextLoading}, User: ${!!user}`);

    const performChecks = async () => {
        setIsChecking(true); // Start local checking indication
        const localUserExists = await checkLocalLogin();
        const localCheckEndTime = performance.now();
        console.log(`[Home Page Effect ${effectStartTime}] Local login check result: ${localUserExists}. Time: ${localCheckEndTime - effectStartTime} ms`);

        if (!isMounted) {
            console.log(`[Home Page Effect ${effectStartTime}] Cleanup ran before checks completed.`);
            setIsChecking(false);
            return;
        }

        // If there's no local user, and Firebase auth is still loading, we wait for Firebase.
        // If there's no local user, and Firebase auth is NOT loading, and there's NO Firebase user, redirect.
        if (!localUserExists && !authContextLoading && !user) {
            console.log(`[Home Page Effect ${effectStartTime}] No local user, auth not loading, no Firebase user. Redirecting to /login.`);
            router.push('/login');
        } else if (localUserExists && !authContextLoading && !user) {
             // This case means local user existed, but onAuthStateChanged returned no Firebase user.
             // Could be a desync, or user was deleted from Firebase.
             console.warn(`[Home Page Effect ${effectStartTime}] Local user found, but Firebase listener returned no user. Redirecting to /login.`);
             router.push('/login');
        } else {
            console.log(`[Home Page Effect ${effectStartTime}] Conditions met to stay or wait for Firebase. Local: ${localUserExists}, AuthLoading: ${authContextLoading}, User: ${!!user}`);
        }
        setIsChecking(false); // Finish local checking indication
    };

    performChecks();

    return () => {
      const cleanupStartTime = performance.now();
      console.log(`[Home Page Effect Cleanup ${effectStartTime}] Unmounting. Total effect duration: ${cleanupStartTime - effectStartTime} ms.`);
      isMounted = false;
    };
  }, [checkLocalLogin, router, authContextLoading, user]); // Dependencies

  // Combine AuthContext loading with local page check loading
  const isLoading = authContextLoading || isChecking;

  if (isLoading) {
    console.log(`[Home Page Render] Showing loading spinner. AuthContextLoading: ${authContextLoading}, isChecking: ${isChecking}`);
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    // This should ideally be caught by the useEffect and redirected,
    // but it's a fallback. If it reaches here, redirection logic might have issues.
    console.log("[Home Page Render] No user after all loading checks. Rendering null (expecting redirect from effect).");
    // To prevent rendering AppLayout without a user, explicitly return null or redirect again.
    // router.push('/login'); // Can cause infinite loops if not careful
    return null;
  }

  console.log("[Home Page Render] User found and loading is false. Rendering AppLayout.");
  return <AppLayout />;
}
