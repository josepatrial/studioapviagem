// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic'; // Import dynamic for lazy loading
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, ChevronDown, ChevronUp, Car, CheckCircle2, PlayCircle, MapPin, Wallet, Fuel, Milestone, Filter, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, AccordionHeader } from '@/components/ui/accordion'; // Import AccordionHeader
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Fetch data functions and types
import type { Visit } from './Visits'; // Keep type import
import type { Expense } from './Expenses'; // Keep type import
import type { Fueling } from './Fuelings'; // Keep type import
import { useToast } from '@/hooks/use-toast';
import { useAuth, User } from '@/contexts/AuthContext';
import { type VehicleInfo } from '../Vehicle'; // Import type VehicleInfo
import { Badge } from '@/components/ui/badge';
import { FinishTripDialog } from './FinishTripDialog';
import { cn } from '@/lib/utils';
import { getDrivers, getTrips as fetchOnlineTrips, TripFilter, getVehicles as fetchOnlineVehicles } from '@/services/firestoreService'; // Use fetchOnlineTrips
import {
  addLocalTrip,
  updateLocalTrip,
  deleteLocalTrip,
  getLocalTrips,
  getLocalVisits,
  getLocalExpenses,
  getLocalFuelings,
  LocalTrip, // Import LocalTrip type
  getLocalVehicles, // Import function to get local vehicles
  LocalVehicle, // Import LocalVehicle type
} from '@/services/localDbService';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { parseISO, startOfDay, endOfDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid'; // Import uuid for local ID generation

// Dynamically import child components for lazy loading
const Visits = dynamic(() => import('./Visits').then(mod => mod.Visits), {
  loading: () => <LoadingSpinner className="h-5 w-5" />, // Optional loading indicator
});
const Expenses = dynamic(() => import('./Expenses').then(mod => mod.Expenses), {
    loading: () => <LoadingSpinner className="h-5 w-5" />,
});
const Fuelings = dynamic(() => import('./Fuelings').then(mod => mod.Fuelings), {
    loading: () => <LoadingSpinner className="h-5 w-5" />,
});


// Trip interface now includes local ID and sync status
export interface Trip extends Omit<LocalTrip, 'localId'> {
    id: string; // Use firebaseId as the primary ID when synced
    localId: string; // Keep localId for IndexedDB key
    // Existing Trip fields...
    visitCount?: number;
    expenseCount?: number;
    fuelingCount?: number;
}


export const Trips: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // State now holds Trip (which includes LocalTrip fields)
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]); // Use LocalVehicle
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null); // Use Trip type
  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null); // Use Trip type
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null); // For delete confirmation
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null); // Use localId for expansion key
  const { toast } = useToast();

  const [selectedVehicleId, setSelectedVehicleId] = useState(''); // Still use Vehicle ID for selection
  const [filterDriver, setFilterDriver] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

   // State for counts (will be fetched per trip from local DB)
   const [visitCounts, setVisitCounts] = useState<Record<string, number>>({}); // Keyed by localId
   const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({}); // Keyed by localId
   const [fuelingCounts, setFuelingCounts] = useState<Record<string, number>>({}); // Keyed by localId
   // State for visit data needed for FinishTripDialog
   const [visitsDataForFinish, setVisitsDataForFinish] = useState<Visit[]>([]); // Needs conversion if using LocalVisit

    // Fetch initial dependencies (drivers - assuming these are relatively static and fetched online)
    useEffect(() => {
        const fetchDriversData = async () => {
            if (isAdmin) {
                setLoading(true); // Indicate loading drivers
                try {
                    const driversData = await getDrivers();
                    setDrivers(driversData.filter(d => d.role === 'driver'));
                } catch (error) {
                    console.error("Error fetching drivers:", error);
                    toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível carregar motoristas." });
                } finally {
                     // Delay setting loading false slightly if other data is still fetching
                     // setLoading(false); // Moved loading false to fetchLocalData
                }
            }
        };
        fetchDriversData();
    }, [isAdmin, toast]);

     // Fetch local data (Vehicles and Trips)
     const fetchLocalData = useCallback(async () => {
        setLoading(true);
        console.log("[Trips] Fetching local data...");
        try {
             // Fetch Vehicles locally first
             let localVehicles = await getLocalVehicles();
             if (localVehicles.length === 0 && navigator.onLine) {
                 // Attempt to fetch online if local is empty and online
                 console.log("[Trips] No local vehicles found, fetching online...");
                 try {
                     const onlineVehicles = await fetchOnlineVehicles();
                     // TODO: Save fetched online vehicles to local DB for future offline use
                     localVehicles = onlineVehicles.map(v => ({ ...v, syncStatus: 'synced' })) as LocalVehicle[]; // Assume synced
                 } catch (fetchError) {
                      console.error("Error fetching online vehicles:", fetchError);
                     toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível buscar veículos online." });
                 }
             }
             setVehicles(localVehicles);
             console.log(`[Trips] Loaded ${localVehicles.length} vehicles locally.`);


            // Fetch Trips locally
            const localTrips = await getLocalTrips(isAdmin ? undefined : user?.id);
            console.log(`[Trips] Loaded ${localTrips.length} trips locally for user ${user?.id}`);

            // Fetch counts for each local trip - Consider optimizing this if many trips
            const countsPromises = localTrips.map(async (trip) => {
                 // Fetch counts concurrently, but maybe limit concurrency if needed
                 const [visits, expenses, fuelings] = await Promise.all([
                    getLocalVisits(trip.localId).catch(() => []), // Add catch blocks
                    getLocalExpenses(trip.localId).catch(() => []),
                    getLocalFuelings(trip.localId).catch(() => []),
                ]);
                 // Map visits only if needed for the finish dialog, could be optimized further
                 const adaptedVisits = visits.map(v => ({ ...v, id: v.firebaseId || v.localId })) as Visit[];
                return {
                    tripLocalId: trip.localId,
                    visitCount: visits.length,
                    expenseCount: expenses.length,
                    fuelingCount: fuelings.length,
                     visits: adaptedVisits // Store adapted visits if needed later
                };
            });

            const countsResults = await Promise.all(countsPromises);
            const newVisitCounts: Record<string, number> = {};
            const newExpenseCounts: Record<string, number> = {};
            const newFuelingCounts: Record<string, number> = {};
            let allVisitsForFinish: Visit[] = []; // Renamed to avoid confusion

            countsResults.forEach(result => {
                newVisitCounts[result.tripLocalId] = result.visitCount;
                newExpenseCounts[result.tripLocalId] = result.expenseCount;
                newFuelingCounts[result.tripLocalId] = result.fuelingCount;
                 allVisitsForFinish = allVisitsForFinish.concat(result.visits); // Collect visits needed for dialog
            });

            setVisitCounts(newVisitCounts);
            setExpenseCounts(newExpenseCounts);
            setFuelingCounts(newFuelingCounts);
            setVisitsDataForFinish(allVisitsForFinish); // Store combined adapted visits

            // Map LocalTrip to Trip for UI state
            const uiTrips = localTrips.map(lt => ({
                ...lt,
                id: lt.firebaseId || lt.localId, // Use firebaseId if available, otherwise localId
            })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort by creation date

            setAllTrips(uiTrips);

        } catch (error) {
            console.error("Error fetching local data:", error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar dados locais." });
            setAllTrips([]);
            setVehicles([]);
        } finally {
            setLoading(false); // Set loading false after all fetches complete
             console.log("[Trips] Finished fetching local data.");
        }
    }, [isAdmin, user?.id, toast]);


    // Fetch data on mount and when user changes
    useEffect(() => {
        fetchLocalData();
    }, [fetchLocalData]); // Depend on the memoized fetch function


  // --- UI Helpers ---

  const getVehicleDisplay = (vehicleId: string) => {
    // Find vehicle in the local state
    const vehicle = vehicles.find(v => v.id === vehicleId || v.localId === vehicleId); // Check both IDs
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
  };

  const getDriverName = (driverId: string) => {
      const driver = drivers.find(d => d.id === driverId);
      return driver ? driver.name : 'Motorista Desconhecido';
  };

   const getTripDescription = (trip: Trip): string => {
       const vehicleDisplay = getVehicleDisplay(trip.vehicleId);
       const driverDisplay = isAdmin ? ` - ${getDriverName(trip.userId)}` : '';
       const baseDisplay = trip.base ? ` (Base: ${trip.base})` : '';
       return `${vehicleDisplay}${driverDisplay}${baseDisplay}`;
   };

  const formatKm = (km?: number): string => km ? km.toLocaleString('pt-BR') + ' Km' : 'N/A';


  // --- CRUD Handlers ---

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Usuário não autenticado.' });
      return;
    }
    if (!selectedVehicleId) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
      return;
    }
     // Check if user has a base defined
      if (!user.base) {
          toast({
              variant: 'destructive',
              title: 'Base Não Definida',
              description: 'Você precisa ter uma base definida em seu perfil para criar viagens.',
              duration: 7000,
          });
          return;
      }

    const vehicleDisplay = getVehicleDisplay(selectedVehicleId);
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const generatedTripName = `Viagem ${vehicleDisplay} - ${dateStr}`;
    const now = new Date().toISOString();

    // Prepare data for LocalTrip (excluding localId and syncStatus initially)
    const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus'> = {
      name: generatedTripName,
      vehicleId: selectedVehicleId,
      userId: user.id,
      status: 'Andamento',
      createdAt: now,
      updatedAt: now,
      base: user.base, // Assign user's base
      // counts will be updated later
    };

    setIsSaving(true);
    try {
        const localId = await addLocalTrip(newTripData); // Add to local DB
        console.log(`[Trips] Trip added locally with localId: ${localId}`);

        // Optimistically update UI state
         const newUITrip: Trip = {
            ...newTripData,
            localId,
            id: localId, // Use localId as the main ID until synced
            syncStatus: 'pending'
         };
        setAllTrips(prevTrips => [newUITrip, ...prevTrips].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

        // Also update counts for the new trip (initialize to 0)
        setVisitCounts(prev => ({ ...prev, [localId]: 0 }));
        setExpenseCounts(prev => ({ ...prev, [localId]: 0 }));
        setFuelingCounts(prev => ({ ...prev, [localId]: 0 }));


        resetForm();
        setIsCreateModalOpen(false);
        toast({ title: 'Viagem criada localmente!' });
    } catch (error) {
        console.error("Error creating local trip:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível criar a viagem localmente." });
    } finally {
        setIsSaving(false);
    }
  };

  const handleEditTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTrip || !user) return;

    if (!selectedVehicleId) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
        return;
    }
     // Find original local record using the UI ID (which could be firebaseId or localId)
     const originalLocalTrip = await getLocalTrips().then(trips => trips.find(t => t.localId === currentTrip.localId || t.firebaseId === currentTrip.id));

      if (!originalLocalTrip) {
          toast({ variant: "destructive", title: "Erro", description: "Viagem original não encontrada localmente." });
          return;
      }


    const updatedLocalTripData: LocalTrip = {
       ...originalLocalTrip, // Spread existing local data
       vehicleId: selectedVehicleId,
       updatedAt: new Date().toISOString(),
       // Mark as pending if it was previously synced
       syncStatus: originalLocalTrip.syncStatus === 'synced' ? 'pending' : originalLocalTrip.syncStatus,
       id: originalLocalTrip.id, // Keep original ID from local record
     };


    setIsSaving(true);
    try {
        await updateLocalTrip(updatedLocalTripData); // Update local DB
        console.log(`[Trips] Trip updated locally: ${currentTrip.localId}`);

        // Update UI state
        setAllTrips(prevTrips =>
             prevTrips.map(t => t.localId === currentTrip.localId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } : t)
             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
         );

        resetForm();
        setIsEditModalOpen(false);
        setCurrentTrip(null);
        toast({ title: 'Viagem atualizada localmente!' });
    } catch (error) {
        console.error("Error updating local trip:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar a viagem localmente." });
    } finally {
        setIsSaving(false);
    }
  };

  const openFinishModal = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    // Fetch current visits for this trip specifically for the dialog
    getLocalVisits(trip.localId).then(visits => {
         const adaptedVisits = visits.map(v => ({ ...v, id: v.firebaseId || v.localId })) as Visit[];
         setVisitsDataForFinish(adaptedVisits); // Update data for the dialog
         setTripToFinish(trip);
         setIsFinishModalOpen(true);
    }).catch(err => {
         console.error("Error fetching visits for finish dialog:", err);
         toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar visitas para finalizar." });
    });

  };

  const confirmFinishTrip = async (tripLocalId: string, finalKm: number, totalDistance: number) => {
     const tripToUpdate = allTrips.find(t => t.localId === tripLocalId);
     if (!tripToUpdate) {
        toast({ variant: "destructive", title: "Erro", description: "Viagem não encontrada localmente." });
        return;
     }

     setIsSaving(true);

     const updatedLocalTripData: LocalTrip = {
        ...tripToUpdate,
        status: 'Finalizado',
        finalKm: finalKm,
        totalDistance: totalDistance,
        updatedAt: new Date().toISOString(),
        syncStatus: tripToUpdate.syncStatus === 'synced' ? 'pending' : tripToUpdate.syncStatus,
        id: tripToUpdate.id, // Keep original ID
      };

    try {
        await updateLocalTrip(updatedLocalTripData); // Update local DB
        console.log(`[Trips] Trip finished locally: ${tripLocalId}`);

        // Update UI state
        setAllTrips(prevTrips =>
            prevTrips.map(t => t.localId === tripLocalId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } : t)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );

        setIsFinishModalOpen(false);
        setTripToFinish(null);
        toast({
          title: `Viagem "${updatedLocalTripData.name}" finalizada localmente.`,
          description: `Distância percorrida: ${formatKm(totalDistance)}`,
        });
    } catch (error) {
         console.error("Error finishing local trip:", error);
         toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível finalizar a viagem localmente." });
    } finally {
        setIsSaving(false);
    }
  };

    const openDeleteConfirmation = (trip: Trip, event: React.MouseEvent) => {
        event.stopPropagation();
        setTripToDelete(trip);
    };

    const closeDeleteConfirmation = () => {
        setTripToDelete(null);
    };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) return;

    // Check for related items locally before allowing delete UI action
    try {
        const [visits, expenses, fuelings] = await Promise.all([
            getLocalVisits(tripToDelete.localId),
            getLocalExpenses(tripToDelete.localId),
            getLocalFuelings(tripToDelete.localId),
        ]);

        if (visits.length > 0 || expenses.length > 0 || fuelings.length > 0) {
            toast({
                variant: "destructive",
                title: "Exclusão não permitida",
                description: "Existem visitas, despesas ou abastecimentos associados localmente. Sincronize e exclua online se necessário.",
                duration: 7000,
            });
            closeDeleteConfirmation();
            return;
        }
    } catch (error) {
        console.error("Error checking related local items before delete:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível verificar itens relacionados." });
        closeDeleteConfirmation();
        return;
    }


    setIsDeleting(true);
    try {
        await deleteLocalTrip(tripToDelete.localId); // Mark for deletion locally
        console.log(`[Trips] Trip marked for deletion locally: ${tripToDelete.localId}`);

         // Update UI state immediately
        setAllTrips(prevTrips => prevTrips.filter(t => t.localId !== tripToDelete.localId));

        if (expandedTripId === tripToDelete.localId) {
          setExpandedTripId(null);
        }
        toast({ title: 'Viagem marcada para exclusão na próxima sincronização.' });
        closeDeleteConfirmation();
    } catch (error) {
        console.error("Error marking trip for deletion locally:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível marcar a viagem para exclusão." });
    } finally {
        setIsDeleting(false);
    }
  };

  const openEditModal = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    setCurrentTrip(trip);
    setSelectedVehicleId(trip.vehicleId);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setSelectedVehicleId('');
  };

  const closeCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(false);
  };

  const closeEditModal = () => {
    resetForm();
    setIsEditModalOpen(false);
    setCurrentTrip(null);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-semibold">
          {isAdmin ? 'Todas as Viagens' : 'Minhas Viagens'}
           {isAdmin && filterDriver && (
               <span className="text-base font-normal text-muted-foreground ml-2">
                   (Motorista: {getDriverName(filterDriver)})
               </span>
           )}
        </h2>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full sm:w-auto">
          <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 w-full sm:w-auto" disabled={loading || isSaving}>
                <PlusCircle className="mr-2 h-4 w-4" /> Criar Nova Viagem
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Criar Nova Viagem</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateTrip} className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="vehicleId">Veículo*</Label>
                  <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId} required disabled={loading || isSaving}>
                    <SelectTrigger id="vehicleId">
                      <SelectValue placeholder={loading ? "Carregando..." : "Selecione um veículo"} />
                    </SelectTrigger>
                    <SelectContent>
                       {loading ? (
                           <SelectItem value="loading" disabled>
                               <div className="flex items-center justify-center py-2">
                                   <LoadingSpinner className="h-4 w-4" />
                               </div>
                           </SelectItem>
                       ) : vehicles.length > 0 ? (
                        vehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id || vehicle.localId} value={vehicle.id || vehicle.localId}>
                            {vehicle.model} ({vehicle.licensePlate})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-vehicles" disabled>Nenhum veículo local</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Motorista</Label>
                  <p className="text-sm text-muted-foreground">{user?.name || user?.email || 'Não identificado'}</p>
                </div>
                 {/* Base display */}
                  <div className="space-y-2">
                     <Label>Base</Label>
                     <p className="text-sm text-muted-foreground">{user?.base || <span className="text-destructive">Não definida</span>}</p>
                     {!user?.base && <p className="text-xs text-destructive">Você precisa ter uma base definida para criar viagens.</p>}
                  </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                    <PlayCircle className="h-4 w-4" /> Andamento (Automático)
                  </p>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button>
                  </DialogClose>
                  <Button type="submit" disabled={loading || isSaving || !user?.base} className="bg-primary hover:bg-primary/90">
                     {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {isSaving ? 'Salvando...' : 'Salvar Viagem Local'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

       {/* Filters Card - Only for Admin */}
        {isAdmin && (
             <Card className="mb-6 shadow-md">
               <CardHeader>
                 <CardTitle className="text-lg flex items-center gap-2">
                    <Filter className="h-5 w-5" /> Filtros de Viagens
                 </CardTitle>
               </CardHeader>
               <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                   <div className="space-y-1.5">
                       <Label htmlFor="driverFilter">Filtrar por Motorista</Label>
                       <Select value={filterDriver} onValueChange={(value) => setFilterDriver(value === 'all' ? '' : value)} disabled={loading || drivers.length === 0}>
                           <SelectTrigger id="driverFilter">
                               <SelectValue placeholder={drivers.length === 0 && !loading ? "Nenhum motorista" : loading ? "Carregando..." : "Todos os Motoristas"} />
                           </SelectTrigger>
                           <SelectContent>
                                {loading ? (
                                    <SelectItem value="loading" disabled>
                                        <div className="flex items-center justify-center py-2">
                                            <LoadingSpinner className="h-4 w-4" />
                                        </div>
                                    </SelectItem>
                                ) : (
                                    <>
                                       <SelectItem value="all">Todos os Motoristas</SelectItem>
                                       {drivers.map(driver => (
                                           <SelectItem key={driver.id} value={driver.id}>{driver.name} ({driver.base || 'Sem Base'})</SelectItem>
                                       ))}
                                   </>
                                )}
                           </SelectContent>
                       </Select>
                   </div>
                   <div className="space-y-1.5">
                       <Label>Filtrar por Data de Criação</Label>
                       <DateRangePicker date={filterDateRange} onDateChange={setFilterDateRange} />
                   </div>
               </CardContent>
           </Card>
        )}


      {loading ? (
          <div className="flex justify-center items-center h-40">
             <LoadingSpinner />
          </div>
       ) : allTrips.length === 0 ? (
        <Card className="text-center py-10 bg-card border border-border">
          <CardContent>
            <p className="text-muted-foreground">
                {isAdmin && (filterDriver || filterDateRange)
                    ? 'Nenhuma viagem encontrada localmente para os filtros selecionados.'
                    : 'Nenhuma viagem encontrada localmente.'}
            </p>
            {!isAdmin && (
              <Button variant="link" onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
                Criar sua primeira viagem
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="w-full space-y-4" value={expandedTripId ?? undefined} onValueChange={setExpandedTripId}>
          {allTrips.map((trip) => {
            // Use counts based on localId
            const visitCount = visitCounts[trip.localId] ?? 0;
            const expenseCount = expenseCounts[trip.localId] ?? 0;
            const fuelingCount = fuelingCounts[trip.localId] ?? 0;
            const isPending = trip.syncStatus === 'pending';
            const isError = trip.syncStatus === 'error';
            const isExpanded = expandedTripId === trip.localId; // Track if current item is expanded

            return (
              <AccordionItem key={trip.localId} value={trip.localId} className="border bg-card rounded-lg shadow-sm overflow-hidden group/item data-[state=open]:border-primary/50">
                 {/* AccordionHeader contains trigger and action buttons */}
                 <AccordionHeader className={cn(
                     "flex justify-between items-center p-4 hover:bg-accent/50 w-full data-[state=open]:border-b",
                     isPending && "bg-yellow-50 hover:bg-yellow-100/80 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30",
                     isError && "bg-destructive/10 hover:bg-destructive/20"
                  )}>
                    {/* AccordionTrigger contains the main clickable area for expanding/collapsing */}
                    <AccordionTrigger
                         className="flex-1 mr-4 space-y-1 text-left p-0 hover:no-underline"
                         asChild={false} // Ensure Trigger renders its own button
                    >
                        {/* Content inside the Trigger */}
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <CardTitle className="text-lg">{trip.name}</CardTitle>
                                <Badge variant={trip.status === 'Andamento' ? 'default' : 'secondary'} className={cn('h-5 px-2 text-xs whitespace-nowrap', trip.status === 'Andamento' ? 'bg-emerald-500 hover:bg-emerald-500/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80 text-white' : '')}>
                                    {trip.status === 'Andamento' ? <PlayCircle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                    {trip.status}
                                </Badge>
                                {isPending && <Badge variant="outline" className="h-5 px-2 text-xs whitespace-nowrap border-yellow-500 text-yellow-700 dark:text-yellow-400">Pendente</Badge>}
                                {isError && <Badge variant="destructive" className="h-5 px-2 text-xs whitespace-nowrap">Erro Sinc</Badge>}
                            </div>
                            <CardDescription className="text-sm flex items-center gap-1">
                                <Car className="h-4 w-4 text-muted-foreground" /> {getTripDescription(trip)}
                            </CardDescription>
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {visitCount} {visitCount === 1 ? 'Visita' : 'Visitas'}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <Wallet className="h-3 w-3" /> {expenseCount} {expenseCount === 1 ? 'Despesa' : 'Despesas'}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <Fuel className="h-3 w-3" /> {fuelingCount} {fuelingCount === 1 ? 'Abastec.' : 'Abastec.'}
                                </span>
                                {trip.status === 'Finalizado' && trip.totalDistance !== undefined && (
                                    <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
                                        <Milestone className="h-3 w-3" /> {formatKm(trip.totalDistance)} Percorridos
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>Início: {new Date(trip.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                <span>Atualizado: {new Date(trip.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                        </div>
                    </AccordionTrigger>

                    {/* Action Buttons - Moved outside the AccordionTrigger */}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {trip.status === 'Andamento' && (isAdmin || trip.userId === user?.id) && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => openFinishModal(trip, e)}
                                className="h-8 px-2 sm:px-3 text-emerald-600 border-emerald-600/50 hover:bg-emerald-50 hover:text-emerald-700"
                                disabled={isSaving || isDeleting}
                            >
                                {isSaving && tripToFinish?.localId === trip.localId ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <CheckCircle2 className="h-4 w-4 sm:mr-1" /> }
                                <span className="hidden sm:inline">{isSaving && tripToFinish?.localId === trip.localId ? 'Finalizando...': 'Finalizar'}</span>
                            </Button>
                        )}
                        {(isAdmin || trip.userId === user?.id) && (
                            <>
                                <Dialog open={isEditModalOpen && currentTrip?.localId === trip.localId} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); }}>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={(e) => openEditModal(trip, e)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving || isDeleting}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Editar Viagem</DialogTitle>
                                        </DialogHeader>
                                        <form onSubmit={handleEditTrip} className="grid gap-4 py-4">
                                            <div className="space-y-2">
                                                <Label>Nome da Viagem</Label>
                                                <p className="text-sm text-muted-foreground">{currentTrip?.name}</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="editVehicleId">Veículo*</Label>
                                                <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId} required disabled={isSaving || loading}>
                                                    <SelectTrigger id="editVehicleId">
                                                        <SelectValue placeholder={loading ? "Carregando..." : "Selecione"} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {loading ? (
                                                            <SelectItem value="loading" disabled>
                                                                <div className="flex items-center justify-center py-2">
                                                                    <LoadingSpinner className="h-4 w-4" />
                                                                </div>
                                                            </SelectItem>
                                                        ) : vehicles.map((vehicle) => (
                                                            <SelectItem key={vehicle.id || vehicle.localId} value={vehicle.id || vehicle.localId}>
                                                                {vehicle.model} ({vehicle.licensePlate})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Motorista</Label>
                                                <p className="text-sm text-muted-foreground">{getDriverName(trip.userId)}</p>
                                            </div>
                                            {/* Base display */}
                                            <div className="space-y-2">
                                                <Label>Base</Label>
                                                <p className="text-sm text-muted-foreground">{currentTrip?.base || 'N/A'}</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Status</Label>
                                                <p className="text-sm font-medium">{currentTrip?.status}</p>
                                            </div>
                                            <DialogFooter>
                                                <DialogClose asChild>
                                                    <Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button>
                                                </DialogClose>
                                                <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                    {isSaving ? 'Salvando...' : 'Salvar Alterações Locais'}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </DialogContent>
                                </Dialog>

                                <AlertDialog open={!!tripToDelete && tripToDelete.localId === trip.localId} onOpenChange={(isOpen) => !isOpen && closeDeleteConfirmation()}>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={(e) => openDeleteConfirmation(trip, e)} className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving || isDeleting}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Tem certeza que deseja marcar a viagem "{tripToDelete?.name}" para exclusão? Itens relacionados (visitas, despesas, abastecimentos) também serão marcados. A exclusão definitiva ocorrerá na próxima sincronização.
                                                {(visitCounts[tripToDelete?.localId ?? ''] ?? 0) > 0 || (expenseCounts[tripToDelete?.localId ?? ''] ?? 0) > 0 || (fuelingCounts[tripToDelete?.localId ?? ''] ?? 0) > 0 ?
                                                    <strong className="text-destructive block mt-2"> Atenção: Esta viagem possui itens relacionados localmente. Eles também serão marcados para exclusão.</strong>
                                                    : ''}
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={confirmDeleteTrip}
                                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                                disabled={isDeleting} // Always allow marking for deletion locally
                                            >
                                                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {isDeleting ? 'Marcando...' : 'Marcar para Excluir'}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </>
                        )}
                    </div>
                 </AccordionHeader>

                <AccordionContent className="p-4 pt-0 bg-secondary/30">
                  {/* Only render content if this accordion item is expanded */}
                  {isExpanded && (
                     <div className="space-y-6">
                        {/* Pass localId to child components */}
                        <section>
                          <Visits tripId={trip.localId} tripName={trip.name} />
                        </section>
                        <hr className="border-border" />
                        <section>
                          <Expenses tripId={trip.localId} tripName={trip.name} />
                        </section>
                        <hr className="border-border" />
                        <section>
                          <Fuelings tripId={trip.localId} tripName={trip.name} />
                        </section>
                      </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

       {tripToFinish && (
         <FinishTripDialog
           trip={tripToFinish}
           isOpen={isFinishModalOpen}
           onClose={() => { setIsFinishModalOpen(false); setTripToFinish(null); }}
           // Pass localId to onConfirm
           onConfirm={(id, finalKm, totalDistance) => confirmFinishTrip(tripToFinish.localId, finalKm, totalDistance)}
           visitsData={visitsDataForFinish.filter(v => v.tripId === tripToFinish.localId)} // Filter visits based on localId
         />
       )}
    </div>
  );
};
