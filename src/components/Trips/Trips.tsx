// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect } from 'react';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Fetch data functions and types
import { Visits, getVisits as fetchVisits, type Visit } from './Visits';
import { Expenses, getExpenses as fetchExpenses, type Expense } from './Expenses';
import { Fuelings, type Fueling } from './Fuelings'; // Keep component import
import { getFuelings as fetchFuelings } from '@/services/firestoreService'; // Import fetch function from service
import { useToast } from '@/hooks/use-toast';
import { useAuth, User } from '@/contexts/AuthContext';
import { type VehicleInfo } from '../Vehicle'; // Import type VehicleInfo
import { getVehicles as fetchVehicles } from '@/services/firestoreService'; // Import fetch function from service
import { Badge } from '@/components/ui/badge';
import { FinishTripDialog } from './FinishTripDialog';
import { cn } from '@/lib/utils';
import { getTrips, addTrip, updateTrip, deleteTripAndRelatedData, getDrivers, TripFilter } from '@/services/firestoreService';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { parseISO, startOfDay, endOfDay } from 'date-fns';

// Define Trip interface
export interface Trip {
  id: string;
  name: string;
  vehicleId: string;
  userId: string; // ID of the driver who owns the trip
  status: 'Andamento' | 'Finalizado';
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
  visitCount?: number; // Calculated client-side for display
  expenseCount?: number; // Calculated client-side for display
  fuelingCount?: number; // Calculated client-side for display
  finalKm?: number;
  totalDistance?: number;
  base?: string;
  // Include counts directly from Firestore if aggregated, otherwise calculate client-side
}

export const Trips: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null); // For delete confirmation
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [filterDriver, setFilterDriver] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

   // State for counts (will be fetched per trip)
   const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
   const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({});
   const [fuelingCounts, setFuelingCounts] = useState<Record<string, number>>({});
   // State for visit data needed for FinishTripDialog
   const [visitsDataForFinish, setVisitsDataForFinish] = useState<Visit[]>([]);

  // Fetch initial data (vehicles, drivers)
  useEffect(() => {
    const fetchInitialDeps = async () => {
        const startTime = performance.now();
        console.log('[Trips Effect] Fetching initial dependencies (vehicles, drivers)...');
        setLoading(true); // Start loading before fetching anything
        try {
            const [vehiclesData, driversData] = await Promise.all([
                fetchVehicles(), // Use fetch function from service
                isAdmin ? getDrivers() : Promise.resolve([]),
            ]);
            setVehicles(vehiclesData);
            setDrivers(driversData.filter(d => d.role === 'driver'));
            const endTime = performance.now();
             console.log(`[Trips Effect] Fetched ${vehiclesData.length} vehicles and ${driversData.length} potential drivers in ${endTime - startTime} ms.`);
        } catch (error) {
            console.error("Error fetching initial dependencies:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar veículos/motoristas." });
        } finally {
            // Don't set loading false here, wait for trips fetch
        }
    };
    fetchInitialDeps();
  }, [isAdmin, toast]);

  // Fetch Trips based on filters
  useEffect(() => {
    const fetchTripsAndCounts = async () => {
      const startTime = performance.now();
      console.log(`[Trips Effect] Starting fetchTripsAndCounts. Loading: ${loading}, isAdmin: ${isAdmin}, User available: ${!!user}`);
      if (loading && !isAdmin && !user) {
        console.log('[Trips Effect] Skipping fetch: Still loading initial deps or driver user not available.');
        return; // Don't fetch if loading initial deps or no user context yet for driver
      }

      setLoading(true); // Start loading for trips fetch
      console.log('[Trips Effect] Set loading to true for trips fetch.');
      try {
        const filters: TripFilter = {};
        if (isAdmin) {
          if (filterDriver) filters.userId = filterDriver;
        } else if (user) {
          filters.userId = user.id; // Driver always sees their own trips
        } else {
            console.log('[Trips Effect] No user context, setting empty trips and stopping load.');
            setAllTrips([]); // No user, no trips
            setLoading(false);
            return;
        }

        if (filterDateRange?.from) {
            filters.startDate = startOfDay(filterDateRange.from).toISOString();
        }
        if (filterDateRange?.to) {
            filters.endDate = endOfDay(filterDateRange.to).toISOString();
        }
        console.log('[Trips Effect] Fetching trips with filters:', filters);
        const tripsData = await getTrips(filters); // Fetch filtered trips
        const fetchTripsEndTime = performance.now();
        console.log(`[Trips Effect] Fetched ${tripsData.length} trips in ${fetchTripsEndTime - startTime} ms.`);

         // Fetch counts for each trip
         console.log(`[Trips Effect] Fetching counts for ${tripsData.length} trips...`);
         const countsStartTime = performance.now();
         const countsPromises = tripsData.map(async (trip) => {
             const [visits, expenses, fuelings] = await Promise.all([
                 fetchVisits(trip.id),
                 fetchExpenses(trip.id),
                 fetchFuelings(trip.id),
             ]);
             return {
                 tripId: trip.id,
                 visitCount: visits.length,
                 expenseCount: expenses.length,
                 fuelingCount: fuelings.length,
                 visits: visits, // Keep visits data for Finish dialog
             };
         });

         const countsResults = await Promise.all(countsPromises);
         const countsEndTime = performance.now();
         console.log(`[Trips Effect] Fetched counts for all trips in ${countsEndTime - countsStartTime} ms.`);

         const newVisitCounts: Record<string, number> = {};
         const newExpenseCounts: Record<string, number> = {};
         const newFuelingCounts: Record<string, number> = {};
         let allVisits: Visit[] = [];

         countsResults.forEach(result => {
             newVisitCounts[result.tripId] = result.visitCount;
             newExpenseCounts[result.tripId] = result.expenseCount;
             newFuelingCounts[result.tripId] = result.expenseCount;
             newFuelingCounts[result.tripId] = result.fuelingCount;
             allVisits = allVisits.concat(result.visits);
         });

         setVisitCounts(newVisitCounts);
         setExpenseCounts(newExpenseCounts);
         setFuelingCounts(newFuelingCounts);
         setVisitsDataForFinish(allVisits); // Store all fetched visits

        setAllTrips(tripsData); // Set the fetched and sorted trips
        console.log('[Trips Effect] Updated trips and counts state.');

      } catch (error) {
        console.error("Error fetching trips:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as viagens." });
        setAllTrips([]); // Clear trips on error
      } finally {
        setLoading(false); // Finish loading after fetching trips
        const finalEndTime = performance.now();
        console.log(`[Trips Effect] Finished fetchTripsAndCounts. Total time: ${finalEndTime - startTime} ms. Set loading to false.`);
      }
    };

    // Only run fetchTripsAndCounts if vehicles/drivers are loaded (or not admin)
    // and the user context is available (for non-admins)
     // Added more robust check: ensure vehicles/drivers have loaded for admin, or user is present for driver
     if ((isAdmin && vehicles.length > 0 && drivers.length > 0) || (!isAdmin && user)) {
        console.log("[Trips Effect] Dependencies met, running fetchTripsAndCounts...");
        fetchTripsAndCounts();
     } else {
        console.log("[Trips Effect] Dependencies not yet met, skipping fetchTripsAndCounts.");
        // If dependencies are not met but we weren't explicitly loading before, ensure loading is off.
        if (!loading && vehicles.length === 0 && isAdmin) {
             // Special case: Admin, initial deps fetch might have finished but yielded no results. Stop loading.
             console.log("[Trips Effect] Dependencies finished loading but are empty (Admin). Setting loading false.");
             setLoading(false);
        } else if (!loading && !user && !isAdmin) {
             console.log("[Trips Effect] Dependencies finished loading but user is null (Driver). Setting loading false.");
             setLoading(false);
        }

     }
    // Removed 'loading' from dependency array as it caused potential loops.
    // Logic now relies on vehicles/drivers/user state.
  }, [user, isAdmin, filterDriver, filterDateRange, toast, vehicles, drivers]); // Re-fetch when filters change

  const getVehicleDisplay = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
  };

  const getDriverName = (driverId: string) => {
      const driver = drivers.find(d => d.id === driverId);
      return driver ? driver.name : 'Motorista Desconhecido';
  };

  const getTripDescription = (trip: Trip): string => {
      const vehicle = vehicles.find(v => v.id === trip.vehicleId);
      const driverName = isAdmin ? ` - ${getDriverName(trip.userId)}` : '';
      const baseInfo = trip.base ? ` (Base: ${trip.base})` : '';
      const vehicleInfo = vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
      return `${vehicleInfo}${driverName}${baseInfo}`;
  };

  const formatKm = (km?: number): string => km ? km.toLocaleString('pt-BR') + ' Km' : 'N/A';


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
     if (!user.base) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Base do motorista não definida. Não é possível criar a viagem.' });
        return;
     }

    const vehicleDisplay = getVehicleDisplay(selectedVehicleId);
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const generatedTripName = `Viagem ${vehicleDisplay} - ${dateStr}`;
    const base = user.base;

    const newTripData: Omit<Trip, 'id' | 'updatedAt' | 'createdAt'> = {
      name: generatedTripName,
      vehicleId: selectedVehicleId,
      userId: user.id,
      status: 'Andamento',
      base: base,
    };

    setIsSaving(true);
    try {
        const newTripId = await addTrip(newTripData);
        // Re-fetch trips to get the latest list including the new one
        // This simplifies state management compared to manually adding
        const tripsData = await getTrips(isAdmin ? {} : { userId: user.id });
        setAllTrips(tripsData);
        resetForm();
        setIsCreateModalOpen(false);
        toast({ title: 'Viagem criada com sucesso!' });
    } catch (error) {
        console.error("Error creating trip:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível criar a viagem." });
    } finally {
        setIsSaving(false);
    }
  };

  const handleEditTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTrip || !user) return;
    // Trip name is generated automatically, no longer edited by user
    // if (!tripName) { ... }
    if (!selectedVehicleId) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
        return;
    }

    const dataToUpdate: Partial<Trip> = {
      // name: tripName, // Name is not editable
      vehicleId: selectedVehicleId,
    };

    setIsSaving(true);
    try {
        await updateTrip(currentTrip.id, dataToUpdate);
        // Re-fetch trips to get the updated data
        const filters: TripFilter = isAdmin ? {} : { userId: user.id };
        if (filterDriver) filters.userId = filterDriver;
        if (filterDateRange?.from) filters.startDate = startOfDay(filterDateRange.from).toISOString();
        if (filterDateRange?.to) filters.endDate = endOfDay(filterDateRange.to).toISOString();

        const tripsData = await getTrips(filters);
        setAllTrips(tripsData);

        resetForm();
        setIsEditModalOpen(false);
        setCurrentTrip(null);
        toast({ title: 'Viagem atualizada com sucesso!' });
    } catch (error) {
        console.error("Error updating trip:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar a viagem." });
    } finally {
        setIsSaving(false);
    }
  };

  const openFinishModal = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    setTripToFinish(trip);
    setIsFinishModalOpen(true);
  };

  const confirmFinishTrip = async (tripId: string, finalKm: number, totalDistance: number) => {
    setIsSaving(true);
    try {
        const dataToUpdate: Partial<Trip> = {
          status: 'Finalizado',
          finalKm: finalKm,
          totalDistance: totalDistance,
        };
        await updateTrip(tripId, dataToUpdate);

        // Re-fetch trips to update the list
        const filters: TripFilter = isAdmin ? {} : { userId: user.id };
        if (filterDriver) filters.userId = filterDriver;
        if (filterDateRange?.from) filters.startDate = startOfDay(filterDateRange.from).toISOString();
        if (filterDateRange?.to) filters.endDate = endOfDay(filterDateRange.to).toISOString();

        const tripsData = await getTrips(filters);
        setAllTrips(tripsData);


        setIsFinishModalOpen(false);
        setTripToFinish(null);
        const tripName = allTrips.find(t => t.id === tripId)?.name || 'Viagem';
        toast({
          title: `Viagem "${tripName}" finalizada.`,
          description: `Distância percorrida: ${formatKm(totalDistance)}`,
        });
    } catch (error) {
         console.error("Error finishing trip:", error);
         toast({ variant: "destructive", title: "Erro", description: "Não foi possível finalizar a viagem." });
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

    // Optional: Add stricter checks using fetched counts
     const visitCount = visitCounts[tripToDelete.id] ?? 0;
     const expenseCount = expenseCounts[tripToDelete.id] ?? 0;
     const fuelingCount = fuelingCounts[tripToDelete.id] ?? 0;

     if (visitCount > 0 || expenseCount > 0 || fuelingCount > 0) {
         toast({
             variant: "destructive",
             title: "Exclusão não permitida",
             description: "Não é possível excluir a viagem pois existem visitas, despesas ou abastecimentos associados.",
             duration: 7000,
         });
         closeDeleteConfirmation();
         return;
     }

    setIsDeleting(true);
    try {
        await deleteTripAndRelatedData(tripToDelete.id); // Use service for potential batch delete

         // Re-fetch trips to update the list
        const filters: TripFilter = isAdmin ? {} : { userId: user.id };
        if (filterDriver) filters.userId = filterDriver;
        if (filterDateRange?.from) filters.startDate = startOfDay(filterDateRange.from).toISOString();
        if (filterDateRange?.to) filters.endDate = endOfDay(filterDateRange.to).toISOString();
        const tripsData = await getTrips(filters);
        setAllTrips(tripsData);


        if (expandedTripId === tripToDelete.id) {
          setExpandedTripId(null);
        }
        toast({ title: 'Viagem excluída com sucesso.' });
        closeDeleteConfirmation();
    } catch (error) {
        console.error("Error deleting trip:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir a viagem." });
    } finally {
        setIsDeleting(false);
    }
  };

  const openEditModal = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    setCurrentTrip(trip);
    // Trip name is not editable anymore
    // setTripName(trip.name);
    setSelectedVehicleId(trip.vehicleId);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    // setTripName(''); // No longer needed
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
           {/* Filters Section - Moved to a Card before the list */}
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
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.model} ({vehicle.licensePlate})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-vehicles" disabled>Nenhum veículo cadastrado</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Motorista</Label>
                  <p className="text-sm text-muted-foreground">{user?.name || user?.email || 'Não identificado'}</p>
                </div>
                <div className="space-y-2">
                  <Label>Base</Label>
                  <p className="text-sm text-muted-foreground">{user?.base || 'Não definida'}</p>
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
                  <Button type="submit" disabled={!user?.base || loading || isSaving} className="bg-primary hover:bg-primary/90">
                     {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {isSaving ? 'Salvando...' : 'Salvar Viagem'}
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
                       <Select value={filterDriver} onValueChange={(value) => setFilterDriver(value === 'all' ? '' : value)} disabled={loading}>
                           <SelectTrigger id="driverFilter">
                               <SelectValue placeholder={loading ? "Carregando..." : "Todos os Motoristas"} />
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
                                           <SelectItem key={driver.id} value={driver.id}>{driver.name} ({driver.base})</SelectItem>
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
                    ? 'Nenhuma viagem encontrada para os filtros selecionados.'
                    : isAdmin
                    ? 'Nenhuma viagem cadastrada no sistema ainda.'
                    : 'Você ainda não cadastrou nenhuma viagem.'}
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
            const visitCount = visitCounts[trip.id] ?? 0;
            const expenseCount = expenseCounts[trip.id] ?? 0;
            const fuelingCount = fuelingCounts[trip.id] ?? 0;
            return (
              <AccordionItem key={trip.id} value={trip.id} className="border bg-card rounded-lg shadow-sm overflow-hidden group/item">
                 <AccordionTrigger className="flex justify-between items-center p-4 hover:bg-accent/50 w-full text-left data-[state=open]:border-b hover:no-underline">
                      <div className="flex-1 mr-4 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">{trip.name}</CardTitle>
                          <Badge variant={trip.status === 'Andamento' ? 'default' : 'secondary'} className={cn('h-5 px-2 text-xs whitespace-nowrap', trip.status === 'Andamento' ? 'bg-emerald-500 hover:bg-emerald-500/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80 text-white' : '')}>
                            {trip.status === 'Andamento' ? <PlayCircle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {trip.status}
                          </Badge>
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

                     <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {trip.status === 'Andamento' && (isAdmin || trip.userId === user?.id) && (
                           <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => openFinishModal(trip, e)}
                              className="h-8 px-2 sm:px-3 text-emerald-600 border-emerald-600/50 hover:bg-emerald-50 hover:text-emerald-700"
                              disabled={isSaving || isDeleting}
                              // Removed asChild - it was causing the hydration error
                           >
                               {isSaving && tripToFinish?.id === trip.id ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <CheckCircle2 className="h-4 w-4 sm:mr-1" /> }
                              <span className="hidden sm:inline">{isSaving && tripToFinish?.id === trip.id ? 'Finalizando...': 'Finalizar'}</span>
                           </Button>
                        )}
                        {(isAdmin || trip.userId === user?.id) && (
                           <>
                                <Dialog open={isEditModalOpen && currentTrip?.id === trip.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); }}>
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
                                      {/* Trip Name is now generated and not editable by user */}
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
                                                <SelectItem key={vehicle.id} value={vehicle.id}>
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
                                      <div className="space-y-2">
                                        <Label>Base</Label>
                                        <p className="text-sm text-muted-foreground">{trip.base || 'Não definida'}</p>
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
                                           {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                                        </Button>
                                      </DialogFooter>
                                    </form>
                                  </DialogContent>
                                </Dialog>

                                <AlertDialog open={!!tripToDelete && tripToDelete.id === trip.id} onOpenChange={(isOpen) => !isOpen && closeDeleteConfirmation()}>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={(e) => openDeleteConfirmation(trip, e)} className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving || isDeleting}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Tem certeza que deseja excluir a viagem "{tripToDelete?.name}"? Esta ação não pode ser desfeita.
                                                {(visitCounts[tripToDelete?.id ?? ''] ?? 0) > 0 || (expenseCounts[tripToDelete?.id ?? ''] ?? 0) > 0 || (fuelingCounts[tripToDelete?.id ?? ''] ?? 0) > 0 ?
                                                    <strong className="text-destructive block mt-2"> Atenção: Esta viagem possui visitas, despesas ou abastecimentos associados. A exclusão não será permitida.</strong>
                                                    : ''}
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={confirmDeleteTrip}
                                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                                disabled={isDeleting || (visitCounts[tripToDelete?.id ?? ''] ?? 0) > 0 || (expenseCounts[tripToDelete?.id ?? ''] ?? 0) > 0 || (fuelingCounts[tripToDelete?.id ?? ''] ?? 0) > 0} // Disable if related items exist
                                            >
                                                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {isDeleting ? 'Excluindo...' : 'Excluir'}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </>
                         )}
                          {/* Chevron is part of AccordionTrigger now */}
                          <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground group-data-[state=open]/item:rotate-180" />
                     </div>
                 </AccordionTrigger>

                <AccordionContent className="p-4 pt-0 bg-secondary/30">
                  <div className="space-y-6">
                     {/* Pass tripId and tripName. Components now fetch their own data */}
                    <section>
                      <Visits tripId={trip.id} tripName={trip.name} />
                    </section>
                    <hr className="border-border" />
                    <section>
                      <Expenses tripId={trip.id} tripName={trip.name} />
                    </section>
                    <hr className="border-border" />
                    <section>
                      <Fuelings tripId={trip.id} tripName={trip.name} />
                    </section>
                  </div>
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
           onConfirm={confirmFinishTrip}
           visitsData={visitsDataForFinish.filter(v => v.tripId === tripToFinish.id)} // Pass only relevant visits
         />
       )}
    </div>
  );
};
