// src/components/AppLayout.tsx
'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { Dashboard } from '@/components/Dashboard';
import { Trips } from '@/components/Trips';
import { Visits } from '@/components/Visits';
import { Expenses } from '@/components/Expenses';
import { Fuelings } from '@/components/Fuelings';
import { LogOut, User as UserIcon, LayoutDashboard, Map, Plane, Fuel, Wallet } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const AppLayout: React.FC = () => {
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
        <h1 className="text-xl font-bold text-primary">Rota Certa</h1>
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
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Motorista</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserIcon className="mr-2 h-4 w-4" />
                <span>Perfil</span> {/* Placeholder for Profile link */}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
             <TabsList className="grid w-full grid-cols-5 rounded-none bg-transparent p-0 sm:w-auto sm:inline-flex">
                 <TabsTrigger value="dashboard" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                   <LayoutDashboard className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Dashboard
                 </TabsTrigger>
                 <TabsTrigger value="trips" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                    <Plane className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Viagens
                 </TabsTrigger>
                 <TabsTrigger value="visits" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                    <Map className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Visitas
                 </TabsTrigger>
                 <TabsTrigger value="expenses" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                    <Wallet className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Despesas
                 </TabsTrigger>
                 <TabsTrigger value="fuelings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                    <Fuel className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Abastecimentos
                 </TabsTrigger>
             </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <TabsContent value="dashboard"><Dashboard /></TabsContent>
            <TabsContent value="trips"><Trips /></TabsContent>
            <TabsContent value="visits"><Visits /></TabsContent>
            <TabsContent value="expenses"><Expenses /></TabsContent>
            <TabsContent value="fuelings"><Fuelings /></TabsContent>
          </div>
       </Tabs>
    </div>
  );
};

export default AppLayout;
