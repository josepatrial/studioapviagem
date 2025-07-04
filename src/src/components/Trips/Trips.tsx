
// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Filter, Loader2, Printer, PlayCircle } from 'lucide-react';
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
// Removed getDrivers as fetchOnlineDrivers from firestoreService, will use local
import {
  addLocalTrip,
  updateLocalTrip,
  deleteLocalTrip,
  getLocalTrips as fetchLocalDbTrips, 
  getLocalVisits,
  getLocalExpenses,
  getLocalFuelings,
  LocalTrip as DbLocalTrip, 
  LocalVehicle,
  getLocalRecordsByRole, // For fetching drivers locally
  getLocalVehicles as fetchLocalDbVehicles, 
  // saveLocalUser, // Keep if SyncContext needs it, but Trips component won't call it directly
  // updateLocalRecord, // Keep if SyncContext needs it
  // STORE_VEHICLES, 
  // STORE_TRIPS,    
  LocalUser as DbUser,
} from '@/services/localDbService';
// Removed getTrips as fetchOnlineTrips, getVehicles as fetchOnlineVehicles
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { parseISO, startOfDay, endOfDay, format as formatDateFn } from 'date-fns';
import { formatKm } from '@/lib/utils';
import { TripAccordionItem } from './TripAccordionItem';
import { Textarea } from '../ui/textarea';


export interface Trip extends DbLocalTrip {
    id: string;
    localId: string;
    visitCount?: number;
    expenseCount?: number;
    fuelingCount?: number;
}


export interface TripReportData extends Trip {
  vehicleDisplay: string;
  driverName: string;
  visits: Visit[];
  expenses: Expense[];
  fuelings: Fueling[];
}


interface TripsProps {
  activeSubTab: 'visits' | 'expenses' | 'fuelings' | null;
}


export const Trips: React.FC<TripsProps> = ({ activeSubTab }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]); // Will be populated from localDb
  // loading state is managed by initialLoading
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [currentTripForEdit, setCurrentTripForEdit] = useState<Trip | null>(null);
  const [selectedVehicleIdForEdit, setSelectedVehicleIdForEdit] = useState('');


  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();


  const [selectedVehicleIdForCreate, setSelectedVehicleIdForCreate] = useState('');
  const [filterDriver, setFilterDriver] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({});
  const [fuelingCounts, setFuelingCounts] = useState<Record<string, number>>({});
  const [visitsDataForFinish, setVisitsDataForFinish] = useState<Visit[]>([]);

  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [detailedSummaryText, setDetailedSummaryText] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);


    useEffect(() => {
        const initializeDriversData = async () => {
            if (isAdmin) {
                setLoadingDrivers(true);
                try {
                    console.log("[Trips] Fetching drivers from LocalDB (for admin filter)...");
                    const localDrivers = await getLocalRecordsByRole('driver');
                    setDrivers(localDrivers.map(d => ({...d, name: d.name || d.email || `ID ${d.id.substring(0,6)}...` } as User)));
                } catch (error) {
                    console.error("Error fetching local drivers:", error);
                    toast({ variant: "destructive", title: "Erro ao Carregar Motoristas Locais", description: "Não foi possível buscar motoristas." });
                } finally {
                    setLoadingDrivers(false);
                }
            } else {
                // If not admin, set current user as the only "driver" for context
                if (user) setDrivers([user]); else setDrivers([]);
                setLoadingDrivers(false);
            }
        };
        initializeDriversData();
    }, [isAdmin, user, toast]);

     const initializeTripsAndVehiclesData = useCallback(async () => {
        setInitialLoading(true);
        setLoadingVehicles(true); // Keep this for vehicle list population
        // setLoading(true) is covered by setInitialLoading(true)
        try {
             console.log("[Trips] Fetching vehicles from LocalDB...");
             const localVehiclesData = await fetchLocalDbVehicles();
             setVehicles(localVehiclesData);
             setLoadingVehicles(false);

            const driverIdToFilter = isAdmin && filterDriver ? filterDriver : (!isAdmin && user ? user.id : undefined);
            console.log(`[Trips] Fetching trips from LocalDB for driver: ${driverIdToFilter || 'all relevant'}, dateRange:`, filterDateRange);
            const dbLocalTripsData = await fetchLocalDbTrips(driverIdToFilter, filterDateRange);

            const countsPromises = dbLocalTripsData.map(async (trip) => {
                 const [visits, expenses, fuelings] = await Promise.all([
                    getLocalVisits(trip.localId).catch(() => []),
                    getLocalExpenses(trip.localId).catch(() => []),
                    getLocalFuelings(trip.localId, 'tripLocalId').catch(() => []),
                ]);
                 const adaptedVisits = visits.map(v => ({ ...v, id: v.firebaseId || v.localId, tripId: trip.localId, userId: v.userId, visitType: v.visitType })) as Visit[];
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

            const uiTrips = dbLocalTripsData.map(dbt => ({
                ...dbt,
                id: dbt.firebaseId || dbt.localId, 
            })).sort((a, b) => {
                 if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                 if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                 return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }) as Trip[]; 
            setAllTrips(uiTrips);

        } catch (error) {
            console.error("Error fetching trips and vehicles data from LocalDB:", error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar dados locais." });
            setAllTrips([]);
            setVehicles([]); // Ensure vehicles are also cleared on error
        } finally {
            setInitialLoading(false);
            setLoadingVehicles(false); // Already set, but good to be sure
        }
    }, [isAdmin, user, toast, filterDriver, filterDateRange]); // Added user to dependencies

    useEffect(() => {
        initializeTripsAndVehiclesData();
    }, [initializeTripsAndVehiclesData]);


  const getVehicleDisplay = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId || v.localId === vehicleId || v.firebaseId === vehicleId);
    return vehicle ? `${vehicle.model || 'N/I'} (${vehicle.licensePlate || 'N/I'})` : 'Veículo Desconhecido';
  };

  const getDriverName = (driverId: string): string => {
     if (user && user.id === driverId) {
         return user.name || user.email || `ID: ${driverId.substring(0,6)}...`;
     }
     const driver = drivers.find(d => d.id === driverId || d.firebaseId === driverId);
     const nameToDisplay = driver?.name || driver?.email || `Motorista (${driverId.substring(0,6)}...)`;
     return nameToDisplay;
  };


   const getTripDescription = (trip: Trip): string => {
       const vehicle = vehicles.find(v => v.id === trip.vehicleId || v.localId === trip.vehicleId || v.firebaseId === trip.vehicleId);
       const vehicleDisplay = vehicle ? `${vehicle.model || 'N/I'}` : 'Veículo Desconhecido';
       const driverNamePart = getDriverName(trip.userId);
       const baseDisplay = trip.base && trip.base !== 'N/A' && trip.base !== 'ALL_ADM_TRIP' ? ` (Base: ${trip.base})` : '';
       return `${vehicleDisplay} - ${driverNamePart}${baseDisplay}`;
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

    const vehicleForTrip = vehicles.find(v => v.id === selectedVehicleIdForCreate || v.localId === selectedVehicleIdForCreate || v.firebaseId === selectedVehicleIdForCreate);
    if (!vehicleForTrip) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo selecionado não encontrado.' });
        return;
    }

    const dateStr = new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'});
    const generatedTripName = `Viagem ${vehicleForTrip.model || 'Veículo'} (${vehicleForTrip.licensePlate || 'N/P'}) - ${dateStr}`;

    const now = new Date().toISOString();

    const tripBase = user.role === 'admin' ? 'ALL_ADM_TRIP' : user.base;
    if (!tripBase) {
         toast({ variant: 'destructive', title: 'Erro Crítico', description: 'Base da viagem não pôde ser determinada.'});
         return;
    }


    const newTripDataForDb: Omit<DbLocalTrip, 'localId' | 'syncStatus' | 'deleted' | 'firebaseId' | 'finalKm' | 'totalDistance' | 'id'> = {
      name: generatedTripName,
      vehicleId: vehicleForTrip.firebaseId || vehicleForTrip.localId, // Use the primary ID of the vehicle record
      userId: user.id,
      status: 'Andamento',
      createdAt: now,
      updatedAt: now,
      base: tripBase,
    };

    setIsSaving(true);
    try {
        const localId = await addLocalTrip(newTripDataForDb);

         const newUITrip: Trip = {
            ...newTripDataForDb,
            localId,
            id: localId, 
            firebaseId: undefined, 
            syncStatus: 'pending',
            deleted: false,
         };
        setAllTrips(prevTrips => [newUITrip, ...prevTrips].sort((a, b) => {
            if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
            if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }));


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

  const handleOpenEditModal = (tripToEdit: Trip) => {
    console.log("[Trips] handleOpenEditModal called for trip:", tripToEdit.localId);
    setCurrentTripForEdit(tripToEdit);
    setSelectedVehicleIdForEdit(tripToEdit.vehicleId); // This should be the localId or firebaseId stored in trip
    setEditingTripId(tripToEdit.localId);
  };

  const handleCloseEditModal = () => {
    console.log("[Trips] handleCloseEditModal called");
    setEditingTripId(null);
    setCurrentTripForEdit(null);
    setSelectedVehicleIdForEdit('');
  };


  const handleEditTripSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTripForEdit || !user) return;

    if (!selectedVehicleIdForEdit) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
        return;
    }
     const originalLocalTrip = await fetchLocalDbTrips().then(trips => trips.find(t => t.localId === currentTripForEdit.localId));

      if (!originalLocalTrip) {
          toast({ variant: "destructive", title: "Erro", description: "Viagem original não encontrada localmente." });
          return;
      }

      const vehicleForEdit = vehicles.find(v => v.id === selectedVehicleIdForEdit || v.localId === selectedVehicleIdForEdit || v.firebaseId === selectedVehicleIdForEdit);
      if (!vehicleForEdit) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo selecionado para edição não encontrado.' });
        return;
      }

    const updatedLocalTripData: DbLocalTrip = {
       ...originalLocalTrip,
       vehicleId: vehicleForEdit.firebaseId || vehicleForEdit.localId, // Use the vehicle's primary ID
       updatedAt: new Date().toISOString(),
       syncStatus: originalLocalTrip.syncStatus === 'synced' && !originalLocalTrip.deleted ? 'pending' : originalLocalTrip.syncStatus,
     };

    setIsSaving(true);
    try {
        await updateLocalTrip(updatedLocalTripData);

        setAllTrips(prevTrips =>
             prevTrips.map(t => t.localId === currentTripForEdit.localId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } as Trip : t)
             .sort((a, b) => {
                if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            })
         );

        handleCloseEditModal();
        toast({ title: 'Viagem atualizada localmente!' });
    } catch (error) {
        console.error("Error updating local trip:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar a viagem localmente." });
    } finally {
        setIsSaving(false);
    }
  };

  const handleOpenFinishModal = async (trip: Trip, event: React.MouseEvent) => {
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
        const adaptedVisits = visits.map(v => ({ ...v, id: v.firebaseId || v.localId, tripId: trip.localId, userId: v.userId, visitType: v.visitType })) as Visit[];
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
     console.log(`[Trips confirmFinishTrip] Finalizing trip ${tripLocalId} with finalKm: ${finalKm}, totalDistance: ${totalDistance}`);

     const updatedLocalTripData: DbLocalTrip = {
        ...(tripToUpdate as DbLocalTrip), 
        status: 'Finalizado',
        finalKm: finalKm,
        totalDistance: totalDistance, 
        updatedAt: new Date().toISOString(),
        syncStatus: tripToUpdate.syncStatus === 'synced' && !tripToUpdate.deleted ? 'pending' : tripToUpdate.syncStatus,
      };

    try {
        await updateLocalTrip(updatedLocalTripData);
        console.log(`[Trips confirmFinishTrip] Local trip ${tripLocalId} updated in DB. Data:`, updatedLocalTripData);

        setAllTrips(prevTrips =>
            prevTrips.map(t => t.localId === tripLocalId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } as Trip : t)
            .sort((a, b) => {
                if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            })
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
        setIsDeleteModalOpen(true);
    };

    const closeDeleteConfirmation = () => {
        setTripToDelete(null);
        setIsDeleteModalOpen(false);
    };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) return;
    setIsDeleting(true);
    try {
        await deleteLocalTrip(tripToDelete.localId);
        setAllTrips(prevTrips => prevTrips.filter(t => t.localId !== tripToDelete!.localId));

        if (expandedTripId === tripToDelete.localId) {
          setExpandedTripId(null);
        }
        toast({ title: 'Viagem marcada para exclusão.', description: 'A exclusão definitiva ocorrerá na próxima sincronização ou imediatamente se nunca foi sincronizada.' });
        closeDeleteConfirmation();
    } catch (error) {
        console.error("Error marking trip and children for deletion locally:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível marcar a viagem e seus itens para exclusão." });
    } finally {
        setIsDeleting(false);
    }
  };


  const resetFormForCreate = () => {
    setSelectedVehicleIdForCreate('');
  };

  const handleOpenShareDialog = (tripId: string) => {
    const tripData = allTrips.find(t => t.localId === tripId);
    if (!tripData) return;
    setSharingTripId(tripId);
  };

  const handleCloseShareDialog = () => {
    setSharingTripId(null);
    setDetailedSummaryText(null);
  };


  const getTripSummaryKm = useCallback(async (tripId: string) => {
    const visits = await getLocalVisits(tripId);
    if (visits.length === 0) return { betweenVisits: null, firstToLast: null };

    const sortedVisits = [...visits].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let betweenVisitsKm = 0;
    for (let i = 1; i < sortedVisits.length; i++) {
        if (sortedVisits[i].initialKm && sortedVisits[i-1].initialKm) {
            const diff = sortedVisits[i].initialKm - sortedVisits[i-1].initialKm;
            if (diff > 0) {
                 betweenVisitsKm += diff;
            }
        }
    }

    const firstVisitKm = sortedVisits[0].initialKm;
    const currentTripData = allTrips.find(t => t.localId === tripId);
    let firstToLastKm = null;

    if (currentTripData?.status === 'Finalizado' && typeof currentTripData.totalDistance === 'number') {
        firstToLastKm = currentTripData.totalDistance;
    } else if (currentTripData?.status === 'Finalizado' && currentTripData.finalKm != null && firstVisitKm != null) {
        const diff = currentTripData.finalKm - firstVisitKm;
        firstToLastKm = diff >= 0 ? diff : 0; 
        console.warn(`[getTripSummaryKm] Trip ${tripId} is Finalizado but totalDistance was not a number. Recalculated as ${firstToLastKm}. finalKm: ${currentTripData.finalKm}, firstVisitKm: ${firstVisitKm}`);
    }


    return {
        betweenVisits: betweenVisitsKm > 0 ? betweenVisitsKm : null,
        firstToLast: firstToLastKm
    };
  }, [allTrips]); 


  const handleGenerateTripReportData = useCallback(async (trip: Trip): Promise<TripReportData | null> => {
    try {
      const [visits, expenses, fuelings] = await Promise.all([
        getLocalVisits(trip.localId),
        getLocalExpenses(trip.localId),
        getLocalFuelings(trip.localId, 'tripLocalId'),
      ]);

      const reportData: TripReportData = {
        ...trip,
        vehicleDisplay: getVehicleDisplay(trip.vehicleId),
        driverName: getDriverName(trip.userId),
        visits: visits.map(v => ({...v, id: v.firebaseId || v.localId, tripId: trip.localId, userId: v.userId, visitType: v.visitType})) as Visit[],
        expenses: expenses.map(e => ({...e, id: e.firebaseId || e.localId, tripId: trip.localId, userId: e.userId})) as Expense[],
        fuelings: fuelings.map(f => ({...f, id: f.firebaseId || f.localId, tripId: trip.localId, userId: f.userId, odometerKm: f.odometerKm, fuelType: f.fuelType})) as Fueling[],
      };
      return reportData;
    } catch (error) {
      console.error("Error fetching data for trip report:", error);
      toast({ variant: "destructive", title: "Erro ao Gerar Relatório", description: "Não foi possível buscar todos os dados da viagem." });
      return null;
    }
  }, [getVehicleDisplay, getDriverName, toast]);


  if (initialLoading) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <LoadingSpinner className="h-10 w-10" />
      </div>
    );
  }

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
          <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) setIsCreateModalOpen(false); else setIsCreateModalOpen(true); }}>
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
                           <SelectItem value="loading_vehicles_create" disabled>
                               <div className="flex items-center justify-center py-2">
                                   <LoadingSpinner className="h-4 w-4" />
                               </div>
                           </SelectItem>
                       ) : vehicles.length > 0 ? (
                        vehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id || vehicle.localId} value={vehicle.id || vehicle.localId}>
                            {vehicle.model || 'N/I'} ({vehicle.licensePlate || 'N/I'})
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
                    <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isSaving}>Cancelar</Button>
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
                                    <SelectItem value="loading_drivers_filter" disabled>
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


      {allTrips.length === 0 ? (
        <Card className="text-center py-10 bg-card border border-border shadow-lg">
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
                openFinishModal={(tripToFinishFromItem, event) => handleOpenFinishModal(tripToFinishFromItem, event)}

                currentTripForEdit={currentTripForEdit}
                isEditModalOpenForThisTrip={editingTripId === trip.localId}
                openEditModalForThisTrip={() => handleOpenEditModal(trip)}
                closeEditModal={handleCloseEditModal}
                handleEditTripSubmit={handleEditTripSubmit}
                selectedVehicleIdForEdit={selectedVehicleIdForEdit}
                setSelectedVehicleIdForEdit={setSelectedVehicleIdForEdit}

                tripToDelete={tripToDelete}
                isDeleteModalOpenForThisTrip={isDeleteModalOpen && tripToDelete?.localId === trip.localId}
                openDeleteModalForThisTrip={(tripToDeleteFromItem, event) => openDeleteConfirmation(tripToDeleteFromItem, event)}
                closeDeleteModal={closeDeleteConfirmation}
                confirmDeleteTrip={confirmDeleteTrip}

                isSaving={isSaving}
                isDeleting={isDeleting}
                tripToFinish={tripToFinish}
                user={user}
                isAdmin={isAdmin}
                vehicles={vehicles}
                getTripSummaryKmFunction={getTripSummaryKm}
                loadingVehicles={loadingVehicles}
                onGenerateReport={handleGenerateTripReportData}

                isShareModalOpenForThisTrip={sharingTripId === trip.localId}
                openShareModalForThisTrip={() => handleOpenShareDialog(trip.localId)}
                closeShareModal={handleCloseShareDialog}
                detailedSummaryText={sharingTripId === trip.localId ? detailedSummaryText : null}
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
