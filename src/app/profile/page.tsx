// src/app/profile/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator'; // Import Separator
import { ArrowLeft, Loader2 } from 'lucide-react'; // Import an icon
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';

const ProfilePage: React.FC = () => {
  const { user, loading, updateEmail, updatePassword, updateProfileName } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // State for profile updates
  const [newName, setNewName] = useState(user?.name || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

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

  const handleUpdateName = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName || newName === user.name) {
          toast({ variant: 'default', title: 'Nenhuma alteração', description: 'O nome não foi alterado.'});
          return;
      }
      setIsUpdatingName(true);
      const success = await updateProfileName(newName);
      if (success) {
          // toast({ title: "Sucesso", description: "Nome atualizado." }); already handled in context
      } else {
          // toast({ variant: "destructive", title: "Falha", description: "Não foi possível atualizar o nome." }); already handled in context
          setNewName(user.name || ''); // Reset on failure
      }
      setIsUpdatingName(false);
  };

   const handleUpdateEmail = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!newEmail || newEmail === user.email) {
        toast({ variant: 'default', title: 'Nenhuma alteração', description: 'O e-mail não foi alterado.'});
        return;
     }
     if (!currentPasswordForEmail) {
        toast({ variant: 'destructive', title: 'Senha necessária', description: 'Digite sua senha atual para alterar o e-mail.'});
        return;
     }
     setIsUpdatingEmail(true);
     const success = await updateEmail(currentPasswordForEmail, newEmail);
     if (success) {
       // toast is handled in context
       setCurrentPasswordForEmail(''); // Clear password field
     } else {
        // toast is handled in context
       setNewEmail(user.email || ''); // Reset email on failure
     }
     setIsUpdatingEmail(false);
   };

   const handleUpdatePassword = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentPassword || !newPassword || !confirmNewPassword) {
       toast({ variant: 'destructive', title: 'Campos obrigatórios', description: 'Preencha todos os campos de senha.'});
       return;
     }
     if (newPassword !== confirmNewPassword) {
       toast({ variant: 'destructive', title: 'Senhas não coincidem', description: 'A nova senha e a confirmação devem ser iguais.'});
       return;
     }
     if (newPassword.length < 6) { // Basic length check
        toast({ variant: 'destructive', title: 'Senha muito curta', description: 'A nova senha deve ter pelo menos 6 caracteres.'});
        return;
     }

     setIsUpdatingPassword(true);
     const success = await updatePassword(currentPassword, newPassword);
     if (success) {
        // toast is handled in context
       setCurrentPassword('');
       setNewPassword('');
       setConfirmNewPassword('');
     } else {
       // toast is handled in context
     }
     setIsUpdatingPassword(false);
   };


  return (
    <div className="flex min-h-screen flex-col items-center bg-secondary p-4 md:p-6">
       <div className="w-full max-w-2xl mb-4">
          <Button variant="outline" onClick={handleGoBack} className="bg-background hover:bg-accent">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
       </div>
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Perfil do Usuário</CardTitle>
          <CardDescription>Visualize e atualize suas informações.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* User Info Display */}
          <div className="space-y-2">
             <Label htmlFor="userId">ID do Usuário</Label>
             <Input id="userId" value={user.id} readOnly className="bg-muted/50 cursor-not-allowed" />
          </div>

          <Separator />

          {/* Update Name Section */}
          <form onSubmit={handleUpdateName} className="space-y-4">
            <h3 className="text-lg font-semibold">Alterar Nome</h3>
             <div className="space-y-2">
               <Label htmlFor="name">Nome</Label>
               <Input
                 id="name"
                 value={newName}
                 onChange={(e) => setNewName(e.target.value)}
                 placeholder="Seu nome de exibição"
                 disabled={isUpdatingName}
               />
             </div>
             <Button type="submit" disabled={isUpdatingName || newName === user.name} className="bg-primary hover:bg-primary/90">
                {isUpdatingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isUpdatingName ? 'Atualizando...' : 'Salvar Nome'}
             </Button>
          </form>

          <Separator />

           {/* Update Email Section */}
           <form onSubmit={handleUpdateEmail} className="space-y-4">
             <h3 className="text-lg font-semibold">Alterar E-mail</h3>
             <div className="space-y-2">
               <Label htmlFor="email">Novo E-mail</Label>
               <Input
                 id="email"
                 type="email"
                 value={newEmail}
                 onChange={(e) => setNewEmail(e.target.value)}
                 placeholder="seu.novo@email.com"
                 required
                 disabled={isUpdatingEmail}
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="currentPasswordForEmail">Senha Atual</Label>
               <Input
                 id="currentPasswordForEmail"
                 type="password"
                 value={currentPasswordForEmail}
                 onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                 placeholder="Digite sua senha atual"
                 required
                 disabled={isUpdatingEmail}
               />
                 <p className="text-xs text-muted-foreground">Necessário para confirmar a alteração do e-mail.</p>
             </div>
             <Button type="submit" disabled={isUpdatingEmail || !currentPasswordForEmail || newEmail === user.email} className="bg-primary hover:bg-primary/90">
               {isUpdatingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               {isUpdatingEmail ? 'Atualizando...' : 'Salvar E-mail'}
             </Button>
           </form>

          <Separator />

           {/* Update Password Section */}
           <form onSubmit={handleUpdatePassword} className="space-y-4">
             <h3 className="text-lg font-semibold">Alterar Senha</h3>
             <div className="space-y-2">
               <Label htmlFor="currentPassword">Senha Atual</Label>
               <Input
                 id="currentPassword"
                 type="password"
                 value={currentPassword}
                 onChange={(e) => setCurrentPassword(e.target.value)}
                 placeholder="Sua senha atual"
                 required
                 disabled={isUpdatingPassword}
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="newPassword">Nova Senha</Label>
               <Input
                 id="newPassword"
                 type="password"
                 value={newPassword}
                 onChange={(e) => setNewPassword(e.target.value)}
                 placeholder="Mínimo 6 caracteres"
                 required
                 disabled={isUpdatingPassword}
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="confirmNewPassword">Confirmar Nova Senha</Label>
               <Input
                 id="confirmNewPassword"
                 type="password"
                 value={confirmNewPassword}
                 onChange={(e) => setConfirmNewPassword(e.target.value)}
                 placeholder="Repita a nova senha"
                 required
                 disabled={isUpdatingPassword}
               />
             </div>
             <Button type="submit" disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword} className="bg-primary hover:bg-primary/90">
                {isUpdatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isUpdatingPassword ? 'Atualizando...' : 'Salvar Senha'}
             </Button>
           </form>

        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
