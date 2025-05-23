
// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Filter, Loader2, Edit, Trash2, PlayCircle, Share2, Printer } from 'lucide-react';
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
    DialogDescription,
} from '@/components/ui/dialog';
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
import { getDrivers as fetchOnlineDrivers } from '@/services/firestoreService';
import {
  addLocalTrip,
  updateLocalTrip,
  deleteLocalTrip,
  getLocalTrips as fetchLocalDbTrips,
  getLocalVisits,
  getLocalExpenses,
  getLocalFuelings,
  LocalTrip,
  LocalVehicle,
  getLocalRecordsByRole,
  getLocalVehicles as fetchLocalDbVehicles,
  updateLocalRecord,
  saveLocalUser,
  STORE_TRIPS,
  STORE_VEHICLES,
  STORE_USERS,
  LocalUser as DbUser,
} from '@/services/localDbService';
import { getTrips as fetchOnlineTrips, getVehicles as fetchOnlineVehicles } from '@/services/firestoreService';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { parseISO, format as formatDateFn } from 'date-fns';
import { formatKm } from '@/lib/utils';
import { TripAccordionItem } from './TripAccordionItem';
import { Textarea } from '../ui/textarea';

export interface Trip extends Omit<LocalTrip, 'localId'> {
    id: string; // This will be firebaseId if synced, otherwise localId
    localId: string; // Always present, primary key for IndexedDB
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
  const { user, loading: authLoading } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [currentTripForEdit, setCurrentTripForEdit] = useState<Trip | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null); // For trip CSV import

  useEffect(() => {
    const initializeDriversData = async () => {
        if (!isAdmin) {
            setLoadingDrivers(false);
            return;
        }
        console.log("[Trips initializeDriversData] Admin detected, fetching drivers...");
        setLoadingDrivers(true);
        try {
            let fetchedDrivers: DbUser[];
            if (navigator.onLine) {
                console.log("[Trips initializeDriversData] Online: Fetching drivers from Firestore...");
                const onlineDrivers = await fetchOnlineDrivers();
                fetchedDrivers = onlineDrivers.map(d => ({...d, id: d.id, firebaseId: d.id, role: d.role || 'driver', base: d.base || 'N/A', lastLogin: new Date().toISOString(), syncStatus: 'synced'} as DbUser));
                console.log(`[Trips initializeDriversData] Fetched ${fetchedDrivers.length} drivers from Firestore. Caching...`);
                Promise.all(fetchedDrivers.map(d => saveLocalUser(d)))
                       .catch(e => console.warn("[Trips initializeDriversData] Error caching drivers:", e));
            } else {
                console.log("[Trips initializeDriversData] Offline: Fetching drivers from LocalDB...");
                fetchedDrivers = await getLocalRecordsByRole('driver');
            }
            setDrivers(fetchedDrivers.filter(d => d.role === 'driver').map(d => ({...d, name: d.name || d.email || `ID ${d.id.substring(0,6)}...`})));
            console.log(`[Trips initializeDriversData] Set ${drivers.length} drivers to state.`);
        } catch (error) {
            console.error("[Trips initializeDriversData] Error fetching drivers:", error);
            toast({ variant: "destructive", title: "Erro ao Carregar Motoristas", description: (error as Error).message || "Não foi possível buscar motoristas." });
        } finally {
            setLoadingDrivers(false);
        }
    };
    if (isAdmin) {
        initializeDriversData();
    } else {
        setLoadingDrivers(false); // Not admin, not loading drivers
    }
}, [isAdmin, toast]); // Removed 'drivers' from dependency array to prevent potential loop if drivers state itself causes re-fetch


 const initializeTripsAndVehiclesData = useCallback(async () => {
    if (authLoading) { // Wait for auth context to finish loading
      console.log("[Trips initializeData] Auth context still loading. Waiting...");
      return;
    }
    setInitialLoading(true);
    setLoadingVehicles(true);
    const fetchStartTime = Date.now();
    console.log(`[Trips initializeData ${fetchStartTime}] Starting... User: ${user?.id}, Admin: ${isAdmin}`);

    try {
         let localVehiclesData: LocalVehicle[];
         if(navigator.onLine){
            console.log(`[Trips initializeData ${fetchStartTime}] Online: Fetching vehicles from Firestore...`);
            const onlineVehicles = await fetchOnlineVehicles();
            localVehiclesData = onlineVehicles.map(v => ({ ...v, localId: String(v.id), firebaseId: String(v.id), syncStatus: 'synced', deleted: false } as LocalVehicle));
            console.log(`[Trips initializeData ${fetchStartTime}] Fetched ${onlineVehicles.length} vehicles from Firestore. Caching...`);
            const vehicleCachePromises = localVehiclesData.map(v => updateLocalRecord(STORE_VEHICLES, v).catch(e => console.warn(`[Trips Cache Fail] Vehicle ${v.localId}:`, e)));
            await Promise.all(vehicleCachePromises);
         } else {
            console.log(`[Trips initializeData ${fetchStartTime}] Offline: Fetching vehicles from LocalDB...`);
            localVehiclesData = await fetchLocalDbVehicles();
         }
         setVehicles(localVehiclesData);
         console.log(`[Trips initializeData ${fetchStartTime}] Set ${localVehiclesData.length} vehicles to state.`);
         setLoadingVehicles(false);

        const driverIdToFilter = isAdmin && filterDriver ? filterDriver : (!isAdmin && user ? user.id : undefined);
        console.log(`[Trips initializeData ${fetchStartTime}] Effective driverIdToFilter for trip fetching: ${driverIdToFilter}`);

        if (!driverIdToFilter && !isAdmin) {
            console.warn(`[Trips initializeData ${fetchStartTime}] No driverIdToFilter and not admin. Skipping trip fetch.`);
            setAllTrips([]);
            setInitialLoading(false);
            setLoading(false); // Ensure loading finishes
            return;
        }

        let localTripsData: LocalTrip[];

        if(navigator.onLine) {
            console.log(`[Trips initializeData ${fetchStartTime}] Online: Fetching trips from Firestore. Filter: userId=${driverIdToFilter}, dateRange=${JSON.stringify(filterDateRange)}`);
            const onlineTrips = await fetchOnlineTrips({ userId: driverIdToFilter, startDate: filterDateRange?.from, endDate: filterDateRange?.to });
            localTripsData = onlineTrips.map(t => ({ ...t, localId: String(t.id), firebaseId: String(t.id), syncStatus: 'synced', deleted: false } as LocalTrip));
            console.log(`[Trips initializeData ${fetchStartTime}] Fetched ${onlineTrips.length} trips from Firestore. Caching...`);
            const tripCachePromises = localTripsData.map(t => updateLocalRecord(STORE_TRIPS, t).catch(e => console.warn(`[Trips Cache Fail] Trip ${t.localId}:`, e)));
            await Promise.all(tripCachePromises);
        } else {
            console.log(`[Trips initializeData ${fetchStartTime}] Offline: Fetching trips from LocalDB. Filter: userId=${driverIdToFilter}, dateRange=${JSON.stringify(filterDateRange)}`);
            localTripsData = await fetchLocalDbTrips(driverIdToFilter, filterDateRange);
        }

        const countsPromises = localTripsData.map(async (trip) => {
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

        const uiTrips = localTripsData.map(lt => ({
            ...lt,
            id: lt.firebaseId || lt.localId, // Ensure id is set for key prop
            localId: lt.localId,
        })).sort((a, b) => {
             if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
             if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
             return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setAllTrips(uiTrips);
         console.log(`[Trips initializeData ${fetchStartTime}] Set ${uiTrips.length} trips to UI state.`);

    } catch (error) {
        console.error(`[Trips initializeData ${fetchStartTime}] Error fetching trips and vehicles data:`, error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar dados locais." });
        setAllTrips([]);
        setVehicles([]);
    } finally {
        setInitialLoading(false);
        setLoading(false); // Also set general loading to false
        setLoadingVehicles(false);
        console.log(`[Trips initializeData ${fetchStartTime}] Initialization complete. Total time: ${Date.now() - fetchStartTime}ms`);
    }
}, [isAdmin, user, authLoading, toast, filterDriver, filterDateRange]); // Added authLoading

useEffect(() => {
    console.log("[Trips useEffect] Triggered. AuthLoading:", authLoading);
    if (!authLoading) { // Only run if auth context is no longer loading
      console.log("[Trips useEffect] AuthContext loaded. Initializing trips and vehicles data.");
      initializeTripsAndVehiclesData();
    }
}, [authLoading, initializeTripsAndVehiclesData]); // Depend on authLoading and the memoized function


  const getVehicleDisplay = useCallback((vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId || v.localId === vehicleId || v.firebaseId === vehicleId);
    return vehicle ? `${vehicle.model || 'N/I'} (${vehicle.licensePlate || 'N/I'})` : 'Veículo Desconhecido';
  }, [vehicles]);

  const getDriverName = useCallback((driverId: string): string => {
     if (user && user.id === driverId) { // Prioritize current logged-in user
         return user.name || user.email || `ID: ${driverId.substring(0,6)}...`;
     }
     const driver = drivers.find(d => d.id === driverId || d.firebaseId === driverId);
     const nameToDisplay = driver?.name || driver?.email || `Motorista (${driverId.substring(0,6)}...)`;
     return nameToDisplay;
  }, [drivers, user]);


   const getTripDescription = useCallback((trip: Trip): string => {
       const vehicle = vehicles.find(v => v.id === trip.vehicleId || v.localId === trip.vehicleId || v.firebaseId === trip.vehicleId);
       const vehicleDisplay = vehicle ? `${vehicle.model || 'N/I'}` : 'Veículo Desconhecido';
       const driverNamePart = getDriverName(trip.userId);
       const baseDisplay = trip.base && trip.base !== 'N/A' && trip.base !== 'ALL_ADM_TRIP' ? ` (Base: ${trip.base})` : '';
       return `${vehicleDisplay} - ${driverNamePart}${baseDisplay}`;
   }, [vehicles, getDriverName]);


  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[Trips handleCreateTrip] Initiated. User:", user, "Selected Vehicle:", selectedVehicleIdForCreate);
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


    const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus' | 'id' | 'deleted'> = {
      name: generatedTripName,
      vehicleId: vehicleForTrip.firebaseId || vehicleForTrip.localId,
      userId: user.id,
      status: 'Andamento',
      createdAt: now,
      updatedAt: now,
      base: tripBase,
    };
    console.log("[Trips handleCreateTrip] New trip data prepared:", newTripData);

    setIsSaving(true);
    try {
        const localId = await addLocalTrip(newTripData);
        console.log("[Trips handleCreateTrip] Local trip added with localId:", localId);

         const newUITrip: Trip = {
            ...(newTripData as LocalTrip),
            localId,
            id: localId, // Initially, id is the localId
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

        setSelectedVehicleIdForCreate('');
        setIsCreateModalOpen(false);
        toast({ title: 'Viagem criada localmente!' });
    } catch (error: any) {
        console.error("[Trips handleCreateTrip] Error creating local trip:", error);
        toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível criar a viagem localmente. Detalhes: ${error.message || 'Erro desconhecido'}` });
    } finally {
        setIsSaving(false);
    }
  };

  const handleOpenEditModal = (tripToEdit: Trip) => {
    console.log("[Trips handleOpenEditModal] Opening edit modal for trip:", tripToEdit.localId, tripToEdit);
    setCurrentTripForEdit(tripToEdit);
    setSelectedVehicleIdForEdit(tripToEdit.vehicleId); // Ensure this uses the correct vehicle ID field
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    console.log("[Trips handleCloseEditModal] Closing edit modal.");
    setCurrentTripForEdit(null);
    setSelectedVehicleIdForEdit('');
    setIsEditModalOpen(false);
  };


  const handleEditTripSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[Trips handleEditTripSubmit] Form submitted. Current trip for edit:", currentTripForEdit);
    if (!currentTripForEdit || !user) {
        console.warn("[Trips handleEditTripSubmit] No currentTripForEdit or user. Aborting.");
        toast({ variant: 'destructive', title: 'Erro', description: 'Nenhuma viagem selecionada para edição ou usuário não autenticado.' });
        return;
    }

    if (!selectedVehicleIdForEdit) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
        return;
    }
    
    const allLocalTrips = await fetchLocalDbTrips(undefined, undefined);
    const originalLocalTrip = allLocalTrips.find(t => t.localId === currentTripForEdit.localId);

      if (!originalLocalTrip) {
          toast({ variant: "destructive", title: "Erro", description: "Viagem original não encontrada localmente para edição." });
          return;
      }

      const vehicleForEdit = vehicles.find(v => v.id === selectedVehicleIdForEdit || v.localId === selectedVehicleIdForEdit || v.firebaseId === selectedVehicleIdForEdit);
      if (!vehicleForEdit) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo selecionado para edição não encontrado.' });
        return;
      }

    const updatedLocalTripData: LocalTrip = {
       ...originalLocalTrip,
       vehicleId: vehicleForEdit.firebaseId || vehicleForEdit.localId,
       updatedAt: new Date().toISOString(),
       syncStatus: (originalLocalTrip.syncStatus === 'synced' && !originalLocalTrip.deleted) ? 'pending' : originalLocalTrip.syncStatus,
     };
    console.log("[Trips handleEditTripSubmit] Data prepared for local update:", updatedLocalTripData);

    setIsSaving(true);
    try {
        await updateLocalTrip(updatedLocalTripData);
         console.log("[Trips handleEditTripSubmit] Local trip updated successfully:", updatedLocalTripData.localId);

        setAllTrips(prevTrips =>
             prevTrips.map(t => t.localId === currentTripForEdit.localId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } : t)
             .sort((a, b) => {
                if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            })
         );

        handleCloseEditModal();
        toast({ title: 'Viagem atualizada localmente!' });
    } catch (error: any) {
        console.error("[Trips handleEditTripSubmit] Error updating local trip:", error);
        toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível atualizar a viagem localmente. Detalhes: ${error.message || 'Erro desconhecido'}` });
    } finally {
        setIsSaving(false);
    }
  };

  const handleOpenFinishModal = async (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    console.log("[Trips handleOpenFinishModal] Opening finish modal for trip:", trip.localId);
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
        console.error("[Trips handleOpenFinishModal] Error fetching visits for finish dialog:", err);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar visitas para finalizar." });
    }
};


  const confirmFinishTrip = async (tripLocalId: string, finalKm: number, totalDistance: number) => {
     const tripToUpdate = allTrips.find(t => t.localId === tripLocalId);
     if (!tripToUpdate) {
        toast({ variant: "destructive", title: "Erro", description: "Viagem não encontrada localmente." });
        return;
     }
     console.log(`[Trips confirmFinishTrip] Finishing trip ${tripLocalId}. FinalKm: ${finalKm}, TotalDistance: ${totalDistance}`);
     setIsSaving(true);

     const updatedLocalTripData: LocalTrip = {
        ...tripToUpdate,
        status: 'Finalizado',
        finalKm: finalKm,
        totalDistance: totalDistance,
        updatedAt: new Date().toISOString(),
        syncStatus: tripToUpdate.syncStatus === 'synced' && !tripToUpdate.deleted ? 'pending' : tripToUpdate.syncStatus,
      };

    try {
        await updateLocalTrip(updatedLocalTripData);
        console.log(`[Trips confirmFinishTrip] Local trip ${tripLocalId} updated to Finalizado.`);

        setAllTrips(prevTrips =>
            prevTrips.map(t => t.localId === tripLocalId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } : t)
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
    } catch (error:any) {
         console.error("[Trips confirmFinishTrip] Error finishing local trip:", error);
         toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível finalizar a viagem localmente. Detalhes: ${error.message || 'Erro desconhecido'}` });
    } finally {
        setIsSaving(false);
    }
  };

    const handleOpenDeleteModal = (trip: Trip, event: React.MouseEvent) => {
        event.stopPropagation();
        console.log("[Trips handleOpenDeleteModal] Opening delete confirmation for trip:", trip.localId);
        setTripToDelete(trip);
        setIsDeleteModalOpen(true);
    };

    const handleCloseDeleteModal = () => {
        console.log("[Trips handleCloseDeleteModal] Closing delete confirmation.");
        setTripToDelete(null);
        setIsDeleteModalOpen(false);
    };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) {
        console.warn("[Trips confirmDeleteTrip] No trip selected for deletion.");
        return;
    }
    console.log("[Trips confirmDeleteTrip] Confirming delete for trip:", tripToDelete.localId);
    setIsDeleting(true);
    try {
        await deleteLocalTrip(tripToDelete.localId);
        console.log(`[Trips confirmDeleteTrip] Trip ${tripToDelete.localId} and its children marked for deletion locally.`);
        setAllTrips(prevTrips => prevTrips.filter(t => t.localId !== tripToDelete!.localId));

        if (expandedTripId === tripToDelete.localId) {
          setExpandedTripId(null);
        }
        toast({ title: 'Viagem marcada para exclusão.', description: 'A exclusão definitiva ocorrerá na próxima sincronização ou imediatamente se nunca foi sincronizada.' });
        handleCloseDeleteModal();
    } catch (error: any) {
        console.error("[Trips confirmDeleteTrip] Error marking trip and children for deletion locally:", error);
        toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível marcar a viagem e seus itens para exclusão. Detalhes: ${error.message || 'Erro desconhecido'}` });
    } finally {
        setIsDeleting(false);
    }
  };


  const handleOpenShareDialog = (tripId: string) => {
    console.log("[Trips handleOpenShareDialog] Opening share dialog for tripId:", tripId);
    const tripData = allTrips.find(t => t.localId === tripId);
    if (!tripData) {
        console.warn("[Trips handleOpenShareDialog] Trip data not found for ID:", tripId);
        toast({ variant: "destructive", title: "Erro", description: "Dados da viagem não encontrados para compartilhar." });
        return;
    }
    setCurrentTripForEdit(tripData); // Set current trip for summary generation context
    setSharingTripId(tripId);
    generateTripSummary(tripData).then(summary => setDetailedSummaryText(summary));
  };

  const handleCloseShareDialog = () => {
    console.log("[Trips handleCloseShareDialog] Closing share dialog.");
    setSharingTripId(null);
    setDetailedSummaryText(null);
    setCurrentTripForEdit(null); // Clear current trip for edit context
  };

  const generateTripSummary = useCallback(async (trip: Trip): Promise<string> => {
    console.log("[Trips generateTripSummary] Generating summary for trip:", trip.localId);
    const { name, status, createdAt, updatedAt, finalKm, totalDistance, vehicleId, userId } = trip;
    const driverName = getDriverName(userId);
    const vehicleDisplay = getVehicleDisplay(vehicleId);

    let summary = `Resumo da Viagem: ${name}\n`;
    summary += `Status: ${status}\n`;
    summary += `Motorista: ${driverName}\n`;
    summary += `Veículo: ${vehicleDisplay}\n`;
    summary += `Criada em: ${formatDateFn(parseISO(createdAt), 'dd/MM/yyyy HH:mm')}\n`;
    if (updatedAt) {
      summary += `Atualizada em: ${formatDateFn(parseISO(updatedAt), 'dd/MM/yyyy HH:mm')}\n`;
    }
    if (status === "Finalizado") {
      if (finalKm != null) summary += `KM Final: ${formatKm(finalKm)}\n`;
      if (totalDistance != null) summary += `Distância Total: ${formatKm(totalDistance)}\n`;
    }

    const [visits, expenses, fuelings] = await Promise.all([
      getLocalVisits(trip.localId).catch(() => []),
      getLocalExpenses(trip.localId).catch(() => []),
      getLocalFuelings(trip.localId, 'tripLocalId').catch(() => [])
    ]);

    summary += `\n--- Visitas (${visits.length}) ---\n`;
    if (visits.length > 0) {
      visits.forEach(v => {
        summary += `- Cliente: ${v.clientName}, Tipo: ${v.visitType || 'N/A'}, Local: ${v.location}, KM: ${formatKm(v.initialKm)}, Data: ${formatDateFn(parseISO(v.timestamp), 'dd/MM/yy HH:mm')}\n`;
      });
    } else {
      summary += "Nenhuma visita registrada.\n";
    }

    summary += `\n--- Despesas (${expenses.length}) ---\n`;
    if (expenses.length > 0) {
      expenses.forEach(e => {
        summary += `- Desc: ${e.description}, Tipo: ${e.expenseType}, Valor: ${e.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, Data: ${formatDateFn(parseISO(e.expenseDate), 'dd/MM/yy')}\n`;
      });
    } else {
      summary += "Nenhuma despesa registrada.\n";
    }

    summary += `\n--- Abastecimentos (${fuelings.length}) ---\n`;
    if (fuelings.length > 0) {
      fuelings.forEach(f => {
        summary += `- Data: ${formatDateFn(parseISO(f.date), 'dd/MM/yy')}, Litros: ${f.liters.toFixed(2)}L, Preço/L: ${f.pricePerLiter.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, Total: ${f.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, KM: ${formatKm(f.odometerKm)}, Tipo: ${f.fuelType}\n`;
      });
    } else {
      summary += "Nenhum abastecimento registrado.\n";
    }
    console.log("[Trips generateTripSummary] Summary generated successfully for trip:", trip.localId);
    return summary;
  }, [getDriverName, getVehicleDisplay]); // Dependencies


  const getTripSummaryKm = useCallback(async (tripId: string) => {
    console.log("[Trips getTripSummaryKm] Calculating KM summary for trip:", tripId);
    const visits = await getLocalVisits(tripId).catch(() => []);
    if (visits.length === 0) {
        console.log("[Trips getTripSummaryKm] No visits found for trip:", tripId);
        return { betweenVisits: null, firstToLast: null };
    }

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

    if (currentTripData?.status === 'Finalizado' && currentTripData.finalKm != null && firstVisitKm != null) {
      const diff = currentTripData.finalKm - firstVisitKm;
       if (diff >= 0) {
           firstToLastKm = diff;
       } else {
           console.warn(`[Trips getTripSummaryKm] Trip ${tripId}: Final KM (${currentTripData.finalKm}) is less than first visit KM (${firstVisitKm}). Setting total distance to 0.`);
           firstToLastKm = 0;
       }
    }
    console.log(`[Trips getTripSummaryKm] KM Summary for ${tripId}:`, { betweenVisits: betweenVisitsKm > 0 ? betweenVisitsKm : null, firstToLast });
    return {
        betweenVisits: betweenVisitsKm > 0 ? betweenVisitsKm : null,
        firstToLast: firstToLastKm
    };
  }, [allTrips]);


  const handleGenerateReportDataForPrint = useCallback(async (trip: Trip): Promise<TripReportData | null> => {
    console.log("[Trips handleGenerateReportDataForPrint] Generating report data for trip:", trip.localId);
    try {
      const [visits, expenses, fuelings] = await Promise.all([
        getLocalVisits(trip.localId).catch(() => []),
        getLocalExpenses(trip.localId).catch(() => []),
        getLocalFuelings(trip.localId, 'tripLocalId').catch(() => []),
      ]);

      const reportData: TripReportData = {
        ...trip,
        vehicleDisplay: getVehicleDisplay(trip.vehicleId),
        driverName: getDriverName(trip.userId),
        visits: visits.map(v => ({...v, id: v.firebaseId || v.localId, tripId: trip.localId, userId: v.userId, visitType: v.visitType})) as Visit[],
        expenses: expenses.map(e => ({...e, id: e.firebaseId || e.localId, tripId: trip.localId, userId: e.userId})) as Expense[],
        fuelings: fuelings.map(f => ({...f, id: f.firebaseId || f.localId, tripId: trip.localId, userId: f.userId, odometerKm: f.odometerKm, fuelType: f.fuelType})) as Fueling[],
      };
      console.log("[Trips handleGenerateReportDataForPrint] Report data generated successfully for trip:", trip.localId);
      return reportData;
    } catch (error) {
      console.error("[Trips handleGenerateReportDataForPrint] Error fetching data for trip report:", error);
      toast({ variant: "destructive", title: "Erro ao Gerar Relatório", description: "Não foi possível buscar todos os dados da viagem." });
      return null;
    }
  }, [getVehicleDisplay, getDriverName, toast]);


  if (initialLoading || authLoading) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <LoadingSpinner className="h-10 w-10" />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
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
              <Button onClick={() => { setSelectedVehicleIdForCreate(''); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 w-full sm:w-auto" disabled={loadingVehicles || isSaving}>
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
                           <SelectItem value="loading_vehicles_create_trip" disabled>
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
                        <SelectItem value="no-vehicles-create-trip" disabled>Nenhum veículo local</SelectItem>
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
                       <Select value={filterDriver} onValueChange={(value) => setFilterDriver(value === 'all_drivers_filter_trips' ? '' : value)} disabled={loadingDrivers || drivers.length === 0}>
                           <SelectTrigger id="driverFilter">
                               <SelectValue placeholder={loadingDrivers ? "Carregando..." : (drivers.length === 0 ? "Nenhum motorista" : "Todos os Motoristas")} />
                           </SelectTrigger>
                           <SelectContent>
                                {loadingDrivers ? (
                                    <SelectItem value="loading_drivers_filter_trips" disabled>
                                        <div className="flex items-center justify-center py-2">
                                            <LoadingSpinner className="h-4 w-4" />
                                        </div>
                                    </SelectItem>
                                ) : (
                                    <>
                                       <SelectItem value="all_drivers_filter_trips">Todos os Motoristas</SelectItem>
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
              <Button variant="link" onClick={() => { setSelectedVehicleIdForCreate(''); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
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
                isEditModalOpenForThisTrip={isEditModalOpen && currentTripForEdit?.localId === trip.localId}
                openEditModalForThisTrip={() => handleOpenEditModal(trip)}
                closeEditModal={handleCloseEditModal}
                handleEditTripSubmit={handleEditTripSubmit}
                selectedVehicleIdForEdit={selectedVehicleIdForEdit}
                setSelectedVehicleIdForEdit={setSelectedVehicleIdForEdit}

                tripToDelete={tripToDelete}
                isDeleteModalOpenForThisTrip={isDeleteModalOpen && tripToDelete?.localId === trip.localId}
                openDeleteModalForThisTrip={(tripToDeleteFromItem, event) => handleOpenDeleteModal(tripToDeleteFromItem, event)}
                closeDeleteModal={handleCloseDeleteModal}
                confirmDeleteTrip={confirmDeleteTrip}

                isSaving={isSaving}
                isDeleting={isDeleting}
                tripToFinish={tripToFinish}
                user={user}
                isAdmin={isAdmin}
                vehicles={vehicles}
                getTripSummaryKmFunction={getTripSummaryKm}
                loadingVehicles={loadingVehicles}
                onGenerateReport={handleGenerateReportDataForPrint}

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
    