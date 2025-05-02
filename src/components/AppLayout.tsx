// src/components/AppLayout.tsx
'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { Dashboard } from '@/components/Dashboard';
import { Trips } from './Trips/Trips';
import { Vehicle } from '@/components/Vehicle'; // Import Vehicle component
import { LogOut, User as UserIcon, LayoutDashboard, Plane, Car } from 'lucide-react'; // Added Car icon
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const AppLayout: React.FC = () => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  const getInitials = (email: string | undefined) => {
    if (!email) return '??';
    const parts = email.split('@')[0].split('.');
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-secondary">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-background p-4 shadow-sm">
        <h1 className="text-xl font-bold text-primary">Grupo 2 Irmãos</h1> {/* Updated title */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    {/* Add AvatarImage if user profile picture is available */}
                    {/* <AvatarImage src="/avatars/01.png" alt={user.email} /> */}
                    <AvatarFallback className="bg-accent text-accent-foreground">
                       {getInitials(user.email)}
                    </AvatarFallback>
                  </Avatar>
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
             <div className="flex flex-col px-4 py-2">
                <p className="text-sm font-medium leading-none">Motorista</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
             </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/profile')}>
                <UserIcon className="mr-2 h-4 w-4" />
                <span>Perfil</span> {/* Changed from My Profile */}
              </DropdownMenuItem>
              {/* Removed Alterar Nome, E-mail, Senha options */}
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Main Content Area with Tabs */}
       <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
          <div className="overflow-x-auto border-b bg-background">
             {/* Updated grid-cols-3 */}
             <TabsList className="grid w-full grid-cols-3 rounded-none bg-transparent p-0 sm:w-auto sm:inline-flex">
                 <TabsTrigger value="dashboard" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                   <LayoutDashboard className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Dashboard
                 </TabsTrigger>
                 <TabsTrigger value="trips" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                    <Plane className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Viagens
                 </TabsTrigger>
                 <TabsTrigger value="vehicle" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                    <Car className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Veículo
                 </TabsTrigger>
                 {/* Removed Visits, Expenses, Fuelings Triggers */}
             </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <TabsContent value="dashboard"><Dashboard /></TabsContent>
            <TabsContent value="trips"><Trips /></TabsContent>
            <TabsContent value="vehicle"><Vehicle /></TabsContent> {/* Added Vehicle Content */}
            {/* Removed Visits, Expenses, Fuelings Content */}
          </div>
       </Tabs>
    </div>
  );
};

export default AppLayout;
