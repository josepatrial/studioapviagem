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
    console.log("[Home Page Effect] Running. Initial Loading:", loading, "User:", !!user);

    // Check local login first
    checkLocalLogin().then(isLocalLoggedIn => {
        if (!isMounted) return;
        console.log("[Home Page Effect] Local login check result:", isLocalLoggedIn);
        // If not logged in locally AND Firebase isn't loading/has no user, redirect
        if (!isLocalLoggedIn && !loading && !user) {
            console.log("[Home Page Effect] No local or Firebase user, redirecting to /login");
            router.push('/login');
        }
         // If local check is done but Firebase is still loading, wait for Firebase listener
         else if (!isLocalLoggedIn && loading) {
             console.log("[Home Page Effect] No local user, waiting for Firebase auth state...");
         }
         // If logged in (either locally or via Firebase), stay on page
         else {
              console.log("[Home Page Effect] User session found (local or Firebase). Staying on page.");
         }
    }).catch(err => {
        console.error("[Home Page Effect] Error during checkLocalLogin:", err);
         // Handle error, maybe redirect to login as a fallback
         if (isMounted && !loading && !user) {
             router.push('/login');
         }
    });

     // Cleanup function
     return () => {
       console.log("[Home Page Effect] Cleanup.");
       isMounted = false;
     };
    // Dependencies: loading and user trigger re-check if Firebase state changes *after* initial local check
  }, [user, loading, router, checkLocalLogin]);

  // Show loading spinner while initial check (local or Firebase) is in progress
  if (loading) {
     console.log("[Home Page Render] Showing loading spinner.");
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // If loading is finished but there's no user (checked locally and via Firebase)
  if (!user) {
     console.log("[Home Page Render] No user after loading, rendering null (should have redirected).");
     // This case should ideally be handled by the redirect in useEffect,
     // but returning null prevents rendering AppLayout without a user.
     return null;
  }

   console.log("[Home Page Render] User found, rendering AppLayout.");
   return <AppLayout />;
}
