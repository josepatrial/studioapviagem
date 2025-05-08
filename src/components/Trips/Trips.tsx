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
import { getDrivers as fetchFirestoreDrivers, getTrips as fetchOnlineTrips, getVehicles as fetchOnlineVehicles } from '@/services/firestoreService';
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
  getLocalRecordsByRole, // For fetching drivers locally
} from '@/services/localDbService';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker'; // Import DateRangePicker
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
  const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTripForEdit, setCurrentTripForEdit] = useState<Trip | null>(null);
  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();

  const [selectedVehicleIdForCreate, setSelectedVehicleIdForCreate] = useState('');
  const [selectedVehicleIdForEdit, setSelectedVehicleIdForEdit] = useState('');
  const [filterDriver, setFilterDriver] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({});
  const [fuelingCounts, setFuelingCounts] = useState<Record<string, number>>({});
  const [visitsDataForFinish, setVisitsDataForFinish] = useState<Visit[]>([]);


    useEffect(() => {
        const fetchDriversData = async () => {
            if (isAdmin) {
                setLoadingDrivers(true);
                try {
                    let localDriversData: User[] = await getLocalRecordsByRole('driver');
                    if (localDriversData.length === 0 && navigator.onLine) {
                        console.log("[Trips Admin] No local drivers, fetching online...");
                        const onlineDrivers = await fetchFirestoreDrivers();
                        // TODO: Save online drivers to local DB for consistency and offline access
                        localDriversData = onlineDrivers.map(d => ({
                            ...d,
                            // Ensure 'id' from DriverInfo (which is Firebase UID) is used
                            // Add any missing fields required by User type if DriverInfo is a subset
                            // For example, if User requires lastLogin and DriverInfo doesn't have it:
                            lastLogin: new Date().toISOString(), // Or fetch appropriately if available
                        }));
                    }
                    setDrivers(localDriversData.filter(d => d.role === 'driver'));
                } catch (error) {
                    console.error("Error fetching drivers:", error);
                    toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível carregar motoristas." });
                } finally {
                    setLoadingDrivers(false);
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
                     localVehicles = onlineVehicles.map(v => ({ ...v, localId: v.id, id:v.id, syncStatus: 'synced' } as LocalVehicle));
                     // TODO: Save fetched online vehicles to local DB
                 } catch (fetchError) {
                      console.error("Error fetching online vehicles:", fetchError);
                     toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível buscar veículos online." });
                 }
             }
             setVehicles(localVehicles);
             setLoadingVehicles(false);
             console.log(`[Trips] Loaded ${localVehicles.length} vehicles locally.`);

            const driverIdToFilter = isAdmin && filterDriver ? filterDriver : (!isAdmin && user ? user.id : undefined);
            let localTripsData = await getLocalTrips(driverIdToFilter, filterDateRange); // Pass date range to getLocalTrips

            console.log(`[Trips] Loaded ${localTripsData.length} trips locally for user/filter ${driverIdToFilter}`);

            const countsPromises = localTripsData.map(async (trip) => {
                 const [visits, expenses, fuelings] = await Promise.all([
                    getLocalVisits(trip.localId).catch(() => []),
                    getLocalExpenses(trip.localId).catch(() => []),
                    getLocalFuelings(trip.localId, 'tripLocalId').catch(() => []),
                ]);
                 const adaptedVisits = visits.map(v => ({ ...v, id: v.firebaseId || v.localId, tripId: trip.localId })) as Visit[];
                return {
                    tripLocalId: trip.localId,
                    visitCount: visits.length,
                    expenseCount: expenses.length,
                    fuelingCount: fuelings.length,
                    visits: adaptedVisits // Pass all visits for this trip
                };
            });

            const countsResults = await Promise.all(countsPromises);
            const newVisitCounts: Record<string, number> = {};
            const newExpenseCounts: Record<string, number> = {};
            const newFuelingCounts: Record<string, number> = {};
            let allVisitsForFinishDialog: Visit[] = [];


            countsResults.forEach(result => {
                newVisitCounts[result.tripLocalId] = result.visitCount;
                newExpenseCounts[result.tripLocalId] = result.expenseCount;
                newFuelingCounts[result.tripLocalId] = result.fuelingCount;
                if (result.visits && result.visits.length > 0) {
                    allVisitsForFinishDialog = allVisitsForFinishDialog.concat(result.visits);
                }
            });

            setVisitCounts(newVisitCounts);
            setExpenseCounts(newExpenseCounts);
            setFuelingCounts(newFuelingCounts);
            setVisitsDataForFinish(allVisitsForFinishDialog);


            const uiTrips = localTripsData.map(lt => ({
                ...lt,
                id: lt.firebaseId || lt.localId, // Ensure UI uses 'id' from firebaseId or localId
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
    }, [isAdmin, user?.id, toast, filterDriver, filterDateRange]);

    useEffect(() => {
        fetchLocalData();
    }, [fetchLocalData]);

    useEffect(() => {
      if (activeSubTab && allTrips.length > 0 && !expandedTripId) {
        // Consider if auto-expansion is desired. For now, it's disabled.
        // setExpandedTripId(allTrips[0].localId);
      }
    }, [activeSubTab, allTrips, expandedTripId]);


  const getVehicleDisplay = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId || v.localId === vehicleId);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
  };

  const getDriverName = (driverId: string) => {
      const driver = drivers.find(d => d.id === driverId || d.email === driverId);
      if (driver) {
          if (driver.name && driver.name.trim() !== '') {
              return driver.name;
          } else {
              console.warn(`[Trips getDriverName] Driver found (ID/Email matched: ${driverId}, Actual Driver ID: ${driver.id}, Email: ${driver.email}) but name is missing or empty. Displaying ID as fallback.`);
              return driverId; // Fallback to the ID used for lookup if name is missing
          }
      }
      console.warn(`[Trips getDriverName] Driver not found for ID/Email: ${driverId}. Displaying ID or generic fallback.`);
      return driverId || 'Motorista Desconhecido';
  };


   const getTripDescription = (trip: Trip): string => {
       const vehicleDisplay = getVehicleDisplay(trip.vehicleId);
       const driverNameDisplay = getDriverName(trip.userId); // This will be name or ID
       const driverInfo = isAdmin ? ` - ${driverNameDisplay}` : '';
       const baseDisplay = trip.base ? ` (Base: ${trip.base})` : '';
       return `${vehicleDisplay}${driverInfo}${baseDisplay}`;
   };


  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Usuário não autenticado.' });
      return;
    }
    if (!selectedVehicleIdForCreate) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
      return;
    }
    if (!user.base && user.role !== 'admin') {
        toast({
            variant: 'destructive',
            title: 'Base Não Definida',
            description: 'Você precisa ter uma base definida em seu perfil para criar viagens.',
            duration: 7000,
        });
        return;
    }

    const vehicleForTrip = vehicles.find(v => v.id === selectedVehicleIdForCreate || v.localId === selectedVehicleIdForCreate);
    if (!vehicleForTrip) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo selecionado não encontrado.' });
        return;
    }

    const vehicleDisplay = `${vehicleForTrip.model} (${vehicleForTrip.licensePlate})`;
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const generatedTripName = `Viagem ${vehicleDisplay} - ${dateStr}`;
    const now = new Date().toISOString();

    const tripBase = user.role === 'admin' ? 'ALL_ADM_TRIP' : user.base;
    if (!tripBase) {
         toast({ variant: 'destructive', title: 'Erro Crítico', description: 'Base da viagem não pôde ser determinada.'});
         return;
    }


    const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus'> = {
      name: generatedTripName,
      vehicleId: vehicleForTrip.firebaseId || vehicleForTrip.localId, // Prefer firebaseId if available
      userId: user.id,
      status: 'Andamento',
      createdAt: now,
      updatedAt: now,
      base: tripBase,
    };

    setIsSaving(true);
    try {
        const localId = await addLocalTrip(newTripData);
        console.log(`[Trips] Trip added locally with localId: ${localId}`);

         const newUITrip: Trip = {
            ...newTripData,
            localId,
            id: localId, // UI uses 'id' which is the localId for new items
            syncStatus: 'pending'
         };
        setAllTrips(prevTrips => [newUITrip, ...prevTrips].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

        setVisitCounts(prev => ({ ...prev, [localId]: 0 }));
        setExpenseCounts(prev => ({ ...prev, [localId]: 0 }));
        setFuelingCounts(prev => ({ ...prev, [localId]: 0 }));

        resetFormForCreate();
        setIsCreateModalOpen(false);
        toast({ title: 'Viagem criada localmente!' });
    } catch (error) {
        console.error("Error creating local trip:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível criar a viagem localmente." });
    } finally {
        setIsSaving(false);
    }
  };

  const handleEditTripSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTripForEdit || !user) return;

    if (!selectedVehicleIdForEdit) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
        return;
    }
     const originalLocalTrip = await getLocalTrips().then(trips => trips.find(t => t.localId === currentTripForEdit.localId || t.firebaseId === currentTripForEdit.id));

      if (!originalLocalTrip) {
          toast({ variant: "destructive", title: "Erro", description: "Viagem original não encontrada localmente." });
          return;
      }

      const vehicleForEdit = vehicles.find(v => v.id === selectedVehicleIdForEdit || v.localId === selectedVehicleIdForEdit);
      if (!vehicleForEdit) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo selecionado para edição não encontrado.' });
        return;
      }


    const updatedLocalTripData: LocalTrip = {
       ...originalLocalTrip,
       vehicleId: vehicleForEdit.firebaseId || vehicleForEdit.localId, // Prefer firebaseId
       updatedAt: new Date().toISOString(),
       syncStatus: originalLocalTrip.syncStatus === 'synced' ? 'pending' : originalLocalTrip.syncStatus,
     };

    setIsSaving(true);
    try {
        await updateLocalTrip(updatedLocalTripData);
        console.log(`[Trips] Trip updated locally: ${currentTripForEdit.localId}`);

        setAllTrips(prevTrips =>
             prevTrips.map(t => t.localId === currentTripForEdit.localId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } : t)
             .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
         );

        resetFormForEdit();
        setIsEditModalOpen(false);
        setCurrentTripForEdit(null);
        toast({ title: 'Viagem atualizada localmente!' });
    } catch (error) {
        console.error("Error updating local trip:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar a viagem localmente." });
    } finally {
        setIsSaving(false);
    }
  };

  const openFinishModal = async (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
        const visits = await getLocalVisits(trip.localId);
        if (visits.length === 0) {
            toast({
                variant: "destructive",
                title: "Finalização Bloqueada",
                description: "Não é possível finalizar a viagem pois não há visitas registradas.",
                duration: 5000,
            });
            return;
        }
        const adaptedVisits = visits.map(v => ({ ...v, id: v.firebaseId || v.localId, tripId: trip.localId })) as Visit[];
        setVisitsDataForFinish(adaptedVisits);
        setTripToFinish(trip);
        setIsFinishModalOpen(true);
    } catch (err) {
        console.error("Error fetching visits for finish dialog:", err);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar visitas para finalizar." });
    }
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
            getLocalFuelings(tripToDelete.localId, 'tripLocalId'),
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
    setCurrentTripForEdit(trip);
    setSelectedVehicleIdForEdit(trip.vehicleId);
    setIsEditModalOpen(true);
  };

  const resetFormForCreate = () => {
    setSelectedVehicleIdForCreate('');
  };
  const resetFormForEdit = () => {
    setSelectedVehicleIdForEdit('');
  };


  const closeCreateModal = () => {
    resetFormForCreate();
    setIsCreateModalOpen(false);
  };

  const closeEditModal = () => {
    resetFormForEdit();
    setIsEditModalOpen(false);
    setCurrentTripForEdit(null);
  };

  const getTripSummaryKm = useCallback(async (tripId: string) => {
    const visits = await getLocalVisits(tripId);
    if (visits.length === 0) return { betweenVisits: null, firstToLast: null };

    visits.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let betweenVisitsKm = 0;
    for (let i = 1; i < visits.length; i++) {
        if (visits[i].initialKm && visits[i-1].initialKm) {
            const diff = visits[i].initialKm - visits[i-1].initialKm;
            if (diff > 0) {
                 betweenVisitsKm += diff;
            }
        }
    }

    const firstVisitKm = visits[0].initialKm;
    const currentTripData = allTrips.find(t => t.localId === tripId);
    let firstToLastKm = null;
    if (currentTripData?.status === 'Finalizado' && currentTripData.finalKm != null && firstVisitKm != null) {
      const diff = currentTripData.finalKm - firstVisitKm;
       if (diff >= 0) {
           firstToLastKm = diff;
       } else {
           console.warn(`Trip ${tripId}: Final KM (${currentTripData.finalKm}) is less than first visit KM (${firstVisitKm}). Setting total distance to 0.`);
           firstToLastKm = 0;
       }
    }

    return {
        betweenVisits: betweenVisitsKm > 0 ? betweenVisitsKm : null,
        firstToLast: firstToLastKm
    };
  }, [allTrips]);


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
              <Button onClick={() => { resetFormForCreate(); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 w-full sm:w-auto" disabled={loadingVehicles || isSaving}>
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
                  <Select value={selectedVehicleIdForCreate} onValueChange={setSelectedVehicleIdForCreate} required disabled={loadingVehicles || isSaving}>
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
                     {!user?.base && user?.role !== 'admin' && <p className="text-xs text-destructive">Você precisa ter uma base definida para criar viagens.</p>}
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
                  <Button type="submit" disabled={loadingVehicles || isSaving || (!user?.base && user?.role !== 'admin')} className="bg-primary hover:bg-primary/90">
                     {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {isSaving ? 'Salvando...' : 'Salvar Viagem Local'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

         <Card className="mb-6 shadow-md">
           <CardHeader>
             <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" /> Filtros de Viagens
             </CardTitle>
           </CardHeader>
           <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
               {isAdmin && (
                   <div className="space-y-1.5">
                       <Label htmlFor="driverFilter">Filtrar por Motorista</Label>
                       <Select value={filterDriver} onValueChange={(value) => setFilterDriver(value === 'all' ? '' : value)} disabled={loadingDrivers || drivers.length === 0}>
                           <SelectTrigger id="driverFilter">
                               <SelectValue placeholder={loadingDrivers ? "Carregando..." : (drivers.length === 0 ? "Nenhum motorista" : "Todos os Motoristas")} />
                           </SelectTrigger>
                           <SelectContent>
                                {loadingDrivers ? (
                                    <SelectItem value="loading_drivers" disabled>
                                        <div className="flex items-center justify-center py-2">
                                            <LoadingSpinner className="h-4 w-4" />
                                        </div>
                                    </SelectItem>
                                ) : (
                                    <>
                                       <SelectItem value="all">Todos os Motoristas</SelectItem>
                                       {drivers.map(driver => (
                                           <SelectItem key={driver.id} value={driver.id}>{driver.name || `Motorista: ${driver.id.substring(0,6)}...`} ({driver.base || 'Sem Base'})</SelectItem>
                                       ))}
                                   </>
                                )}
                           </SelectContent>
                       </Select>
                   </div>
                )}
               <div className="space-y-1.5">
                   <Label>Filtrar por Data de Criação</Label>
                   <DateRangePicker date={filterDateRange} onDateChange={setFilterDateRange} />
               </div>
           </CardContent>
       </Card>


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
              <Button variant="link" onClick={() => { resetFormForCreate(); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
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
                currentTripForEdit={currentTripForEdit}
                isEditModalOpen={isEditModalOpen && currentTripForEdit?.localId === trip.localId}
                closeEditModal={closeEditModal}
                handleEditTripSubmit={handleEditTripSubmit}
                selectedVehicleIdForEdit={selectedVehicleIdForEdit}
                setSelectedVehicleIdForEdit={setSelectedVehicleIdForEdit}
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
