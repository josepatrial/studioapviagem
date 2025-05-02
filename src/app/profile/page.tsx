// src/app/profile/page.tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button'; // Import Button
import { ArrowLeft } from 'lucide-react'; // Import an icon
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const ProfilePage: React.FC = () => {
  const { user, loading } = useAuth();
  const router = useRouter(); // Initialize router

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const handleGoBack = () => {
    router.back(); // Navigate to the previous page
  };

  return (
    <div className="flex flex-col items-center p-6">
       <div className="w-full max-w-md mb-4">
          <Button variant="outline" onClick={handleGoBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
       </div>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Visualize as informações do seu perfil.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user.email} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="userId">ID do Usuário</Label>
            <Input id="userId" value={user.id} readOnly />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
