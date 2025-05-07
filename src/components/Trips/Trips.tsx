// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, CheckCircle2, PlayCircle, MapPin, Wallet, Fuel, Milestone, Filter, Loader2, BarChart3, ChevronDown, TrendingUp } from 'lucide-react'; // Added TrendingUp
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
import { Accordion, AccordionContent, AccordionItem, AccordionHeader, AccordionTrigger as UiAccordionTrigger } from '@/components/ui/accordion'; // Renamed to avoid conflict if needed
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Visit } from './Visits';
import type { Expense } from './Expenses';
import type { Fueling } from './Fuelings';
import { useToast } from '@/hooks/use-toast';
import { useAuth, User } from '@/contexts/AuthContext';
import type { VehicleInfo } from '../Vehicle';
import { Badge } from '@/components/ui/badge';
import { FinishTripDialog } from './FinishTripDialog';
import { cn } from '@/lib/utils';
import { getDrivers, getTrips as fetchOnlineTrips, getVehicles as fetchOnlineVehicles } from '@/services/firestoreService';
import {
  addLocalTrip,
  updateLocalTrip,
  deleteLocalTrip,
  getLocalTrips,
  getLocalVisits,
  getLocalExpenses,
  getLocalFuelings,
  LocalTrip,
  getLocalVehicles,
  LocalVehicle,
} from '@/services/localDbService';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { parseISO, startOfDay, endOfDay } from 'date-fns';
import { formatKm } from '@/lib/utils'; // Import centralized formatKm

const VisitsComponent = dynamic(() => import('./Visits').then(mod => mod.Visits), {
  loading: () => <LoadingSpinner className="h-5 w-5" />,
});
const ExpensesComponent = dynamic(() => import('./Expenses').then(mod => mod.Expenses), {
    loading: () => <LoadingSpinner className="h-5 w-5" />,
});
const FuelingsComponent = dynamic(() => import('./Fuelings').then(mod => mod.Fuelings), {
    loading: () => <LoadingSpinner className="h-5 w-5" />,
});

export interface Trip extends Omit<LocalTrip, 'localId'> {
    id: string;
    localId: string;
    visitCount?: number;
    expenseCount?: number;
    fuelingCount?: number;
}

interface TripsProps {
  activeSubTab: 'visits' | 'expenses' | 'fuelings' | null;
}

export const Trips: React.FC<TripsProps> = ({ activeSubTab }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [filterDriver, setFilterDriver] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

   const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
   const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({});
   const [fuelingCounts, setFuelingCounts] = useState<Record<string, number>>({});
   const [visitsDataForFinish, setVisitsDataForFinish] = useState<Visit[]>([]);

    useEffect(() => {
        const fetchDriversData = async () => {
            if (isAdmin) {
                setLoading(true);
                try {
                    const driversData = await getDrivers();
                    setDrivers(driversData.filter(d => d.role === 'driver'));
                } catch (error) {
                    console.error("Error fetching drivers:", error);
                    toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível carregar motoristas." });
                }
            }
        };
        fetchDriversData();
    }, [isAdmin, toast]);

     const fetchLocalData = useCallback(async () => {
        setLoading(true);
        console.log("[Trips] Fetching local data...");
        try {
             let localVehicles = await getLocalVehicles();
             if (localVehicles.length === 0 && navigator.onLine) {
                 console.log("[Trips] No local vehicles found, fetching online...");
                 try {
                     const onlineVehicles = await fetchOnlineVehicles();
                     localVehicles = onlineVehicles.map(v => ({ ...v, localId: v.id, syncStatus: 'synced' } as LocalVehicle));
                 } catch (fetchError) {
                      console.error("Error fetching online vehicles:", fetchError);
                     toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível buscar veículos online." });
                 }
             }
             setVehicles(localVehicles);
             console.log(`[Trips] Loaded ${localVehicles.length} vehicles locally.`);

            const localTripsData = await getLocalTrips(isAdmin ? undefined : user?.id);
            console.log(`[Trips] Loaded ${localTripsData.length} trips locally for user ${user?.id}`);

            const countsPromises = localTripsData.map(async (trip) => {
                 const [visits, expenses, fuelings] = await Promise.all([
                    getLocalVisits(trip.localId).catch(() => []),
                    getLocalExpenses(trip.localId).catch(() => []),
                    getLocalFuelings(trip.localId).catch(() => []),
                ]);
                 const adaptedVisits = visits.map(v => ({ ...v, id: v.firebaseId || v.localId })) as Visit[];
                return {
                    tripLocalId: trip.localId,
                    visitCount: visits.length,
                    expenseCount: expenses.length,
                    fuelingCount: fuelings.length,
                     visits: adaptedVisits
                };
            });

            const countsResults = await Promise.all(countsPromises);
            const newVisitCounts: Record<string, number> = {};
            const newExpenseCounts: Record<string, number> = {};
            const newFuelingCounts: Record<string, number> = {};
            let allVisitsForFinish: Visit[] = [];

            countsResults.forEach(result => {
                newVisitCounts[result.tripLocalId] = result.visitCount;
                newExpenseCounts[result.tripLocalId] = result.expenseCount;
                newFuelingCounts[result.tripLocalId] = result.fuelingCount;
                 allVisitsForFinish = allVisitsForFinish.concat(result.visits);
            });

            setVisitCounts(newVisitCounts);
            setExpenseCounts(newExpenseCounts);
            setFuelingCounts(newFuelingCounts);
            setVisitsDataForFinish(allVisitsForFinish);

            const uiTrips = localTripsData.map(lt => ({
                ...lt,
                id: lt.firebaseId || lt.localId,
            })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            setAllTrips(uiTrips);

        } catch (error) {
            console.error("Error fetching local data:", error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar dados locais." });
            setAllTrips([]);
            setVehicles([]);
        } finally {
            setLoading(false);
             console.log("[Trips] Finished fetching local data.");
        }
    }, [isAdmin, user?.id, toast]);

    useEffect(() => {
        fetchLocalData();
    }, [fetchLocalData]);

    useEffect(() => {
      if (activeSubTab && allTrips.length > 0 && !expandedTripId) {
        setExpandedTripId(allTrips[0].localId);
      }
    }, [activeSubTab, allTrips, expandedTripId]);


  const getVehicleDisplay = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId || v.localId === vehicleId);
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

    const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus'> = {
      name: generatedTripName,
      vehicleId: selectedVehicleId,
      userId: user.id,
      status: 'Andamento',
      createdAt: now,
      updatedAt: now,
      base: user.base,
    };

    setIsSaving(true);
    try {
        const localId = await addLocalTrip(newTripData);
        console.log(`[Trips] Trip added locally with localId: ${localId}`);

         const newUITrip: Trip = {
            ...newTripData,
            localId,
            id: localId, // Make sure id is set for UI
            syncStatus: 'pending'
         };
        setAllTrips(prevTrips => [newUITrip, ...prevTrips].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

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
     const originalLocalTrip = await getLocalTrips().then(trips => trips.find(t => t.localId === currentTrip.localId || t.firebaseId === currentTrip.id));

      if (!originalLocalTrip) {
          toast({ variant: "destructive", title: "Erro", description: "Viagem original não encontrada localmente." });
          return;
      }

    const updatedLocalTripData: LocalTrip = {
       ...originalLocalTrip,
       vehicleId: selectedVehicleId,
       updatedAt: new Date().toISOString(),
       syncStatus: originalLocalTrip.syncStatus === 'synced' ? 'pending' : originalLocalTrip.syncStatus,
       id: originalLocalTrip.id, // Ensure id is preserved correctly
     };

    setIsSaving(true);
    try {
        await updateLocalTrip(updatedLocalTripData);
        console.log(`[Trips] Trip updated locally: ${currentTrip.localId}`);

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
    getLocalVisits(trip.localId).then(visits => {
         const adaptedVisits = visits.map(v => ({ ...v, id: v.firebaseId || v.localId })) as Visit[];
         setVisitsDataForFinish(adaptedVisits);
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
        id: tripToUpdate.id, // Ensure id is preserved
      };

    try {
        await updateLocalTrip(updatedLocalTripData);
        console.log(`[Trips] Trip finished locally: ${tripLocalId}`);

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
        await deleteLocalTrip(tripToDelete.localId);
        console.log(`[Trips] Trip marked for deletion locally: ${tripToDelete.localId}`);

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

  const getTripSummaryKm = async (tripId: string) => {
    const visits = await getLocalVisits(tripId);
    if (visits.length === 0) return { betweenVisits: 0, firstToLast: 0 };

    visits.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); // chronological order

    let betweenVisitsKm = 0;
    for (let i = 1; i < visits.length; i++) {
        if (visits[i].initialKm && visits[i-1].initialKm) {
            betweenVisitsKm += (visits[i].initialKm - visits[i-1].initialKm);
        }
    }

    const firstVisitKm = visits[0].initialKm;
    const currentTrip = allTrips.find(t => t.localId === tripId);
    let firstToLastKm = 0;
    if (currentTrip?.status === 'Finalizado' && currentTrip.finalKm && firstVisitKm) {
        firstToLastKm = currentTrip.finalKm - firstVisitKm;
    }

    return {
        betweenVisits: betweenVisitsKm,
        firstToLast: firstToLastKm
    };
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
            const visitCount = visitCounts[trip.localId] ?? 0;
            const expenseCount = expenseCounts[trip.localId] ?? 0;
            const fuelingCount = fuelingCounts[trip.localId] ?? 0;
            const isPending = trip.syncStatus === 'pending';
            const isError = trip.syncStatus === 'error';
            const isExpanded = expandedTripId === trip.localId;
            const [tripKmSummary, setTripKmSummary] = useState<{ betweenVisits: number | null, firstToLast: number | null }>({ betweenVisits: null, firstToLast: null });

            useEffect(() => {
                if (isExpanded) { // Only calculate if expanded
                    getTripSummaryKm(trip.localId).then(summary => setTripKmSummary(summary));
                }
            }, [isExpanded, trip.localId, visitsDataForFinish, trip.status, trip.finalKm]); // Re-calculate if relevant trip data changes


            return (
              <AccordionItem key={trip.localId} value={trip.localId} className="border bg-card rounded-lg shadow-sm overflow-hidden group/item data-[state=open]:border-primary/50">
                 <UiAccordionTrigger asChild className={cn( // Use UiAccordionTrigger for custom content area
                     "flex justify-between items-center p-4 hover:bg-accent/50 w-full data-[state=open]:border-b cursor-pointer",
                     isPending && "bg-yellow-50 hover:bg-yellow-100/80 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30",
                     isError && "bg-destructive/10 hover:bg-destructive/20"
                  )}>
                    <div className="flex-1 mr-4 space-y-1 text-left"> {/* Content of the trigger */}
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
                                {trip.status === 'Finalizado' && tripKmSummary.firstToLast !== null && (
                                    <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
                                        <Milestone className="h-3 w-3" /> {formatKm(tripKmSummary.firstToLast)} Total Percorrido
                                    </span>
                                )}
                                 {tripKmSummary.betweenVisits !== null && tripKmSummary.betweenVisits > 0 && (
                                    <span className="text-blue-600 font-medium inline-flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3" /> {formatKm(tripKmSummary.betweenVisits)} Entre Visitas
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>Início: {new Date(trip.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                <span>Atualizado: {new Date(trip.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>
                     {/* Action buttons - kept separate from the main trigger content */}
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
                                                disabled={isDeleting}
                                            >
                                                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {isDeleting ? 'Marcando...' : 'Marcar para Excluir'}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </>
                        )}
                         <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/item:rotate-180" />
                    </div>
                 </UiAccordionTrigger>

                <AccordionContent className="p-4 pt-0 bg-secondary/30">
                  {isExpanded && (
                    <Tabs defaultValue={activeSubTab || "visits"} className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="visits"><MapPin className="mr-1 h-4 w-4 inline-block" />Visitas ({visitCount})</TabsTrigger>
                        <TabsTrigger value="expenses"><Wallet className="mr-1 h-4 w-4 inline-block" />Despesas ({expenseCount})</TabsTrigger>
                        <TabsTrigger value="fuelings"><Fuel className="mr-1 h-4 w-4 inline-block" />Abastecimentos ({fuelingCount})</TabsTrigger>
                      </TabsList>
                      <TabsContent value="visits" className="mt-4">
                        <VisitsComponent tripId={trip.localId} tripName={trip.name} />
                      </TabsContent>
                      <TabsContent value="expenses" className="mt-4">
                        <ExpensesComponent tripId={trip.localId} tripName={trip.name} />
                      </TabsContent>
                      <TabsContent value="fuelings" className="mt-4">
                        <FuelingsComponent tripId={trip.localId} tripName={trip.name} />
                      </TabsContent>
                    </Tabs>
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
           onConfirm={(id, finalKm, totalDistance) => confirmFinishTrip(tripToFinish.localId, finalKm, totalDistance)}
           visitsData={visitsDataForFinish.filter(v => v.tripId === tripToFinish.localId)}
         />
       )}
    </div>
  );
};
