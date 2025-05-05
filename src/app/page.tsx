'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react'; // Import React
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log("[Home Page Effect] Running. Loading:", loading, "User:", !!user);
    if (!loading && !user) {
      console.log("[Home Page Effect] Redirecting to /login");
      router.push('/login');
    }
     // Cleanup function - useful for debugging if component unmounts unexpectedly
     return () => {
       console.log("[Home Page Effect] Cleanup.");
     };
  }, [user, loading, router]);

  if (loading) {
     console.log("[Home Page Render] Showing loading spinner.");
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
     console.log("[Home Page Render] No user, rendering null (should be redirecting).");
     // This case should ideally be handled by the redirect in useEffect,
     // but returning null prevents rendering AppLayout without a user.
     return null;
     // Alternatively, show a dedicated "Redirecting..." message
     // return <div className="flex h-screen w-screen items-center justify-center"><p>Redirecionando...</p></div>;
  }

   console.log("[Home Page Render] User found, rendering AppLayout.");
   // Wrap in Fragment if needed, though AppLayout is likely sufficient
   return <AppLayout />;
}
