// src/app/page.tsx
// Add a comment to trigger refresh
'use client';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Home() {
  const { user, loading: authContextLoading } = useAuth(); // Removed checkLocalLogin as page will rely on AuthContext's final state
  const router = useRouter();
  // Local loading state for this page's specific initial setup/checks,
  // primarily to ensure we don't flash content before AuthContext is ready.
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const effectStartTime = performance.now();
    // console.log(`[Home Page Effect ${effectStartTime}] Running. AuthContextLoading: ${authContextLoading}, User: ${!!user}, PageLoading: ${pageLoading}`);

    const determineRoute = () => {
      // Wait for AuthContext to finish its initial loading.
      if (authContextLoading) {
        // console.log(`[Home Page Effect ${effectStartTime}] AuthContext is still loading. Waiting...`);
        // No need to setPageLoading(true) here, as isLoading combines authContextLoading
        return;
      }

      // AuthContext has finished loading.
      if (!user) {
        // console.log(`[Home Page Effect ${effectStartTime}] AuthContext finished, no user. Redirecting to /login.`);
        if (isMounted) {
          router.push('/login');
        }
      } else {
        // User is authenticated.
        // console.log(`[Home Page Effect ${effectStartTime}] AuthContext finished, user present. Allowing AppLayout render.`);
        if (isMounted) {
          setPageLoading(false); // User is present, stop page-specific loading.
        }
      }
    };

    determineRoute();

    return () => {
      isMounted = false;
      // const cleanupStartTime = performance.now();
      // console.log(`[Home Page Effect Cleanup ${effectStartTime}] Unmounting. Total effect duration: ${cleanupStartTime - effectStartTime} ms.`);
    };
  }, [authContextLoading, user, router]); // Dependencies

  // The primary loading state depends on AuthContext.
  // pageLoading ensures we don't render AppLayout prematurely even if AuthContext briefly sets user before fully stable.
  const isLoading = authContextLoading || pageLoading;

  if (isLoading) {
    // console.log(`[Home Page Render] Showing loading spinner. AuthContextLoading: ${authContextLoading}, PageLoading: ${pageLoading}`);
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-secondary">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    // This path should ideally be handled by the redirection in useEffect.
    // If reached, it means the redirection hasn't happened yet or there's a logic discrepancy.
    // console.log("[Home Page Render] No user after loading checks. Rendering null (expecting redirect from effect).");
    // It's safer to return null here to avoid flashing AppLayout if user is momentarily null.
    return null;
  }

  // console.log("[Home Page Render] User found and loading is false. Rendering AppLayout.");
  return <AppLayout />;
}
