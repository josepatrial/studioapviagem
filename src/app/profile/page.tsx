'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import { LoadingSpinner } from '@/components/LoadingSpinner'; // Import LoadingSpinner

const ProfilePage: React.FC = () => {
  const { user, loading } = useAuth(); // Get user and loading state

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Perfil</CardTitle> {/* Changed title */}
          <CardDescription>Visualize as informações do seu perfil.</CardDescription> {/* Adjusted description */}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* You might want to fetch and display actual user data here */}
          {/* <div className="space-y-2">
            <Label htmlFor="fullName">Nome Completo</Label>
            <Input id="fullName" value={user.name || 'N/A'} readOnly />
          </div> */}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user.email} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="userId">ID do Usuário</Label>
            <Input id="userId" value={user.id} readOnly />
          </div>
           {/* Optionally add other fields if available in your User object */}
          {/* <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" value="**********" readOnly />
          </div> */}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
