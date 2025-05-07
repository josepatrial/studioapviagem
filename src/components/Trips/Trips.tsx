// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, CheckCircle2, PlayCircle, MapPin, Wallet, Fuel, Milestone, Filter, Loader2, BarChart3, ChevronDown, TrendingUp } from 'lucide-react';
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
import { Accordion } from '@/components/ui/accordion';
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
import { formatKm } from '@/lib/utils';
import { TripAccordionItem } from './TripAccordionItem';

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
  const [loadingVehicles, setLoadingVehicles] = useState(true);
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
                } finally {
                    // setLoading(false) will be handled by fetchLocalData
                }
            }
        };
        fetchDriversData();
    }, [isAdmin, toast]);

     const fetchLocalData = useCallback(async () => {
        setLoading(true);
        setLoadingVehicles(true);
        console.log("[Trips] Fetching local data...");
        try {
             let localVehicles = await getLocalVehicles();
             if (localVehicles.length === 0 && navigator.onLine) {
                 console.log("[Trips] No local vehicles found, fetching online...");
                 try {
                     const onlineVehicles = await fetchOnlineVehicles();
                     localVehicles = onlineVehicles.map(v => ({ ...v, localId: v.id, syncStatus: 'synced' } as LocalVehicle));
                     // TODO: Save fetched online vehicles to local DB
                 } catch (fetchError) {
                      console.error("Error fetching online vehicles:", fetchError);
                     toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível buscar veículos online." });
                 }
             }
             setVehicles(localVehicles);
             setLoadingVehicles(false);
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
            setLoadingVehicles(false);
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

  const getTripSummaryKm = useCallback(async (tripId: string) => {
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
    const currentTripData = allTrips.find(t => t.localId === tripId);
    let firstToLastKm = 0;
    if (currentTripData?.status === 'Finalizado' && currentTripData.finalKm && firstVisitKm) {
        firstToLastKm = currentTripData.finalKm - firstVisitKm;
    }

    return {
        betweenVisits: betweenVisitsKm,
        firstToLast: firstToLastKm
    };
  }, [allTrips]); // Ensure allTrips is a dependency


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
              <Button onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 w-full sm:w-auto" disabled={loadingVehicles || isSaving}>
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
                  <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId} required disabled={loadingVehicles || isSaving}>
                    <SelectTrigger id="vehicleId">
                      <SelectValue placeholder={loadingVehicles ? "Carregando..." : "Selecione um veículo"} />
                    </SelectTrigger>
                    <SelectContent>
                       {loadingVehicles ? (
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
                  <Button type="submit" disabled={loadingVehicles || isSaving || !user?.base} className="bg-primary hover:bg-primary/90">
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
          {allTrips.map((trip) => (
            <TripAccordionItem
                key={trip.localId}
                trip={trip}
                visitCount={visitCounts[trip.localId] ?? 0}
                expenseCount={expenseCounts[trip.localId] ?? 0}
                fuelingCount={fuelingCounts[trip.localId] ?? 0}
                isExpanded={expandedTripId === trip.localId}
                activeSubTab={activeSubTab}
                getVehicleDisplay={getVehicleDisplay}
                getDriverName={getDriverName}
                getTripDescription={getTripDescription}
                openFinishModal={openFinishModal}
                openEditModal={openEditModal}
                currentTripForEdit={currentTrip}
                isEditModalOpen={isEditModalOpen}
                closeEditModal={closeEditModal}
                handleEditTripSubmit={handleEditTrip}
                selectedVehicleIdForEdit={selectedVehicleId}
                setSelectedVehicleIdForEdit={setSelectedVehicleId}
                openDeleteConfirmation={openDeleteConfirmation}
                tripToDelete={tripToDelete}
                isDeleteModalOpen={!!tripToDelete && tripToDelete.localId === trip.localId}
                closeDeleteConfirmation={closeDeleteConfirmation}
                confirmDeleteTrip={confirmDeleteTrip}
                isSaving={isSaving}
                isDeleting={isDeleting}
                tripToFinish={tripToFinish}
                user={user}
                isAdmin={isAdmin}
                vehicles={vehicles}
                getTripSummaryKmFunction={getTripSummaryKm}
                loadingVehicles={loadingVehicles}
            />
          ))}
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
