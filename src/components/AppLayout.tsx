// src/components/AppLayout.tsx
'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { Dashboard } from '@/components/Dashboard';
import { Trips } from './Trips/Trips';
import { Vehicle } from '@/components/Vehicle';
import { Drivers } from './Drivers/Drivers'; // Re-added import
import { LogOut, User as UserIcon, LayoutDashboard, Truck, Car, RefreshCw, WifiOff, UserCog } from 'lucide-react'; // Re-added UserCog
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import { SyncProvider, useSync } from '@/contexts/SyncContext';
import { Badge } from '@/components/ui/badge';

const SyncStatusButton: React.FC = () => {
  const { syncStatus, lastSyncTime, pendingCount, startSync } = useSync();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
     <>
      <DropdownMenuLabel className="flex items-center justify-between text-xs text-muted-foreground px-2 py-1">
          <span>{isOnline ? 'Online' : <span className="text-destructive flex items-center"><WifiOff className="h-3 w-3 mr-1"/>Offline</span>}</span>
          {lastSyncTime && (
               <span title={lastSyncTime.toLocaleString('pt-BR')}>
                  Últ. Sinc: {lastSyncTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
               </span>
          )}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={startSync} disabled={syncStatus === 'syncing' || !isOnline}>
        <RefreshCw className={cn("mr-2 h-4 w-4", syncStatus === 'syncing' && "animate-spin")} />
        <span>Sincronizar Dados</span>
         {pendingCount > 0 && syncStatus !== 'syncing' && (
           <Badge variant="destructive" className="ml-auto h-5">{pendingCount}</Badge>
         )}
          {syncStatus === 'syncing' && (
             <span className="ml-auto text-xs text-muted-foreground">Sincronizando...</span>
          )}
      </DropdownMenuItem>
    </>
  );
};


const AppLayout: React.FC = () => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSubTabInTrips, setActiveSubTabInTrips] = useState<'visits' | 'expenses' | 'fuelings' | null>(null);

  const isAdmin = user?.role === 'admin';

  const getInitials = (name: string | undefined, email: string | undefined) => {
    if (name) {
        const nameParts = name.split(' ');
        if (nameParts.length > 1) {
            return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
    if (email) {
        const emailParts = email.split('@')[0].split('.');
        if (emailParts.length > 1) {
            return `${emailParts[0][0]}${emailParts[1][0]}`.toUpperCase();
        }
        return email.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  const navigateToTripsSection = (section: 'visits' | 'expenses' | 'fuelings' | null) => {
    setActiveTab('trips');
    setActiveSubTabInTrips(section);
  };

  return (
    <SyncProvider>
      <div className="flex h-screen w-screen flex-col bg-secondary">
        <header className="flex items-center justify-between border-b bg-background p-4 shadow-sm">
          <h1 className="text-xl font-bold text-primary">Grupo 2 Irmãos</h1>
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                 <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-accent text-accent-foreground">
                         {getInitials(user.name, user.email)}
                      </AvatarFallback>
                    </Avatar>
                 </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
               <div className="flex flex-col px-4 py-2">
                  <p className="text-sm font-medium leading-none">{user.name || 'Usuário'}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  {isAdmin && <p className="text-xs leading-none text-blue-500 mt-1">(Admin)</p>}
               </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/profile')}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Perfil</span>
                </DropdownMenuItem>
                <SyncStatusButton />
                 <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

         <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
            <div className="overflow-x-auto border-b bg-background">
               <TabsList className={cn(
                  "grid w-full rounded-none bg-transparent p-0 sm:w-auto sm:inline-flex",
                  isAdmin ? "grid-cols-4" : "grid-cols-3" // Adjust grid columns based on admin status
               )}>
                   <TabsTrigger value="dashboard" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none" onClick={() => setActiveSubTabInTrips(null)}>
                     <LayoutDashboard className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Dashboard
                   </TabsTrigger>
                   <TabsTrigger value="trips" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none" onClick={() => setActiveSubTabInTrips(null)}>
                      <Truck className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Viagens
                   </TabsTrigger>
                   <TabsTrigger value="vehicle" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none" onClick={() => setActiveSubTabInTrips(null)}>
                      <Car className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Veículo
                   </TabsTrigger>
                   {isAdmin && ( // "Motoristas" tab re-added
                      <TabsTrigger value="drivers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none" onClick={() => setActiveSubTabInTrips(null)}>
                          <UserCog className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Motoristas
                      </TabsTrigger>
                   )}
               </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <TabsContent value="dashboard"><Dashboard setActiveTab={navigateToTripsSection} /></TabsContent>
              <TabsContent value="trips"><Trips activeSubTab={activeSubTabInTrips} /></TabsContent>
              <TabsContent value="vehicle"><Vehicle /></TabsContent>
              {isAdmin && ( // Content for "Motoristas" tab re-added
                  <TabsContent value="drivers"><Drivers /></TabsContent>
              )}
            </div>
         </Tabs>
      </div>
    </SyncProvider>
  );
};

export default AppLayout;
