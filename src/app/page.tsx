'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Home() {
  const { user, loading, checkLocalLogin } = useAuth(); // Get checkLocalLogin
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const effectStartTime = performance.now();
    console.log(`[Home Page Effect ${effectStartTime}] Running. Initial Loading: ${loading}, User: ${!!user}`);

    checkLocalLogin().then(isLocalLoggedIn => {
        if (!isMounted) {
             console.log(`[Home Page Effect ${effectStartTime}] Cleanup ran before local check completed.`);
             return;
        }
        const localCheckEndTime = performance.now();
        console.log(`[Home Page Effect ${effectStartTime}] Local login check result: ${isLocalLoggedIn}. Time: ${localCheckEndTime - effectStartTime} ms`);

        if (!isLocalLoggedIn && !loading && !user) {
            console.log(`[Home Page Effect ${effectStartTime}] No local or Firebase user, redirecting to /login`);
            router.push('/login');
        } else if (!isLocalLoggedIn && loading) {
             console.log(`[Home Page Effect ${effectStartTime}] No local user, waiting for Firebase auth state...`);
             // setLoading(true) should already be handled in AuthContext
        } else if (isLocalLoggedIn && loading) {
              console.log(`[Home Page Effect ${effectStartTime}] Local user found, but Firebase still loading. Waiting...`);
              // UI shows spinner based on 'loading' state
        } else if (isLocalLoggedIn && !loading && !user) {
              console.warn(`[Home Page Effect ${effectStartTime}] Local user found, but Firebase listener returned no user. This might indicate a sync issue or deleted user. Redirecting to /login.`);
              router.push('/login');
        } else {
              console.log(`[Home Page Effect ${effectStartTime}] User session found (local or Firebase). Staying on page.`);
              // Ensure loading is false if we are staying
              // setLoading(false); // Should be handled by AuthContext listener
        }
    }).catch(err => {
        console.error(`[Home Page Effect ${effectStartTime}] Error during checkLocalLogin:`, err);
         if (isMounted && !loading && !user) {
             console.log(`[Home Page Effect ${effectStartTime}] Redirecting to /login after local check error.`);
             router.push('/login');
         }
    });

     return () => {
       const cleanupStartTime = performance.now();
       console.log(`[Home Page Effect Cleanup ${effectStartTime}] Unmounting. Total effect duration: ${cleanupStartTime - effectStartTime} ms.`);
       isMounted = false;
     };
    // Dependencies: checkLocalLogin, router, loading, user
  }, [user, loading, router, checkLocalLogin]);

  // Show loading spinner while initial check OR Firebase listener is working
  if (loading) {
     console.log("[Home Page Render] Showing loading spinner because loading state is true.");
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // If loading is finished but there's no user
  if (!user) {
     console.log("[Home Page Render] No user after loading. Rendering null (should have redirected).");
     // Redirect should happen in useEffect, this is a fallback UI state
     return null;
  }

   // If user exists and loading is false, render the layout
   console.log("[Home Page Render] User found and loading is false. Rendering AppLayout.");
   return <AppLayout />;
}
