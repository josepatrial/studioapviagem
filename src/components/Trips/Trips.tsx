// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea'; // Assuming you might want a description field
import {
  addLocalTrip,
  updateLocalTrip,
  deleteLocalTrip,
  getLocalTrips as fetchLocalDbTrips,
  LocalTrip,
  LocalVehicle,
  getLocalRecordsByRole,
  getLocalVehicles as fetchLocalDbVehicles,
  updateLocalRecord, // For caching
  STORE_TRIPS, // For caching
  STORE_VEHICLES, // For caching
  saveLocalUser, // For caching user data from Firestore
  getLocalVisits,
  getLocalExpenses,
  getLocalFuelings,
} from '@/services/localDbService';
import { getTrips as fetchOnlineTrips, getVehicles as fetchOnlineVehicles, getDrivers as fetchOnlineDrivers, TripFilter } from '@/services/firestoreService';
import { useAuth, User } from '@/contexts/AuthContext';
import type { VehicleInfo } from '../Vehicle';
import { Badge } from '@/components/ui/badge';
import { FinishTripDialog } from './FinishTripDialog';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { parseISO, format as formatDateFn, differenceInDays } from 'date-fns';
import { AlertCircle, Car, CheckCircle, Edit, Eye, Filter, Fuel, Loader2, MapPin, PackageCheck, PlayCircle, PlusCircle, Printer, Settings, Trash2, Users, Wallet, MessageSquare, Share2, Send } from 'lucide-react';
import {
  Accordion,
} from '@/components/ui/accordion';
import { TripAccordionItem } from './TripAccordionItem';
import { useToast } from '@/hooks/use-toast';
import type { Visit } from './Visits'; // Import Visit type for FinishTripDialog

export interface Trip extends Omit<LocalTrip, 'localId' | 'firebaseId' | 'syncStatus' | 'deleted'> {
  id: string; // This will be localId or firebaseId for UI key purposes
  localId: string; // Always present
  firebaseId?: string; // Optional
  syncStatus: 'pending' | 'synced' | 'error';
  deleted?: boolean;
}

interface TripsProps {
  activeSubTab: 'visits' | 'expenses' | 'fuelings' | null;
}

const ALL_DRIVERS_OPTION_VALUE = "__all_drivers__";

export const Trips: React.FC<TripsProps> = ({ activeSubTab }) => {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = React.useMemo(() => user?.role === 'admin', [user?.role]);
  const { toast } = useToast();

  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loadingTripsAndVehicles, setLoadingTripsAndVehicles] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [currentTripForEdit, setCurrentTripForEdit] = useState<Trip | null>(null);
  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);

  // Form state for creating/editing trips
  const [tripNameInput, setTripNameInput] = useState(''); // Not directly used for name generation anymore
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [tripStatus, setTripStatus] = useState<'Andamento' | 'Finalizado'>('Andamento');
  const [tripBase, setTripBase] = useState('');
  const [tripDescription, setTripDescription] = useState(''); // New field for description

  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);

  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [filterDriverId, setFilterDriverId] = useState<string>(ALL_DRIVERS_OPTION_VALUE);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [detailedSummaryText, setDetailedSummaryText] = useState<string | null>(null);

  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({});
  const [fuelingCounts, setFuelingCounts] = useState<Record<string, number>>({});
  const [visitsDataForFinish, setVisitsDataForFinish] = useState<Visit[]>([]);


  const initializeTripsAndVehiclesData = useCallback(async () => {
    const funcStartTime = Date.now();
    console.log(`[Trips ${funcStartTime}] INITIALIZE TRIPS AND VEHICLES DATA CALLED. User: ${user?.id}, IsAdmin: ${isAdmin}, AuthLoading: ${authLoading}`);

    if (authLoading) {
      console.log(`[Trips ${funcStartTime}] Auth still loading. Aborting initialization.`);
      setLoadingTripsAndVehicles(true); // Keep loading true if auth is not ready
      return;
    }

    setLoadingTripsAndVehicles(true);
    if (isAdmin) setLoadingDrivers(true);

    const cachePromises: Promise<void>[] = [];

    try {
      let localTripsData: LocalTrip[];
      let localVehiclesData: LocalVehicle[];
      let localDriversData: User[] = [];

      const currentUserIdForFilter = isAdmin && filterDriverId !== ALL_DRIVERS_OPTION_VALUE ? filterDriverId : user?.id;

      if (navigator.onLine) {
        console.log(`[Trips ${funcStartTime}] Online: Fetching trips, vehicles, and drivers from Firestore.`);

        const onlineTripsPromise = fetchOnlineTrips({
          userId: isAdmin && filterDriverId === ALL_DRIVERS_OPTION_VALUE ? undefined : currentUserIdForFilter,
          base: isAdmin && filterDriverId === ALL_DRIVERS_OPTION_VALUE ? user?.base : undefined, // Apply base filter only if admin and all drivers
          startDate: filterDateRange?.from,
          endDate: filterDateRange?.to
        });
        const onlineVehiclesPromise = fetchOnlineVehicles();
        const onlineDriversPromise = isAdmin ? fetchOnlineDrivers() : Promise.resolve([]);

        const [onlineTrips, onlineVehicles, onlineDrivers] = await Promise.all([
          onlineTripsPromise,
          onlineVehiclesPromise,
          onlineDriversPromise,
        ]);

        console.log(`[Trips ${funcStartTime}] Fetched from Firestore - Trips: ${onlineTrips.length}, Vehicles: ${onlineVehicles.length}, Drivers: ${onlineDrivers.length}`);

        localTripsData = onlineTrips.map(t => ({ ...t, localId: t.id, firebaseId: t.id, syncStatus: 'synced', deleted: t.deleted || false } as LocalTrip));
        localVehiclesData = onlineVehicles.map(v => ({ ...v, localId: String(v.id), firebaseId: String(v.id), syncStatus: 'synced', deleted: v.deleted || false } as LocalVehicle));
        if (isAdmin) {
          localDriversData = onlineDrivers.map(d => ({ ...d, id: d.id, firebaseId: d.id, role: d.role || 'driver', base: d.base || 'N/A', lastLogin: new Date().toISOString(), syncStatus: 'synced' } as User));

          localDriversData.forEach(d => {
            const userToCache = d as LocalUser; // Cast to include potential passwordHash etc.
            cachePromises.push(saveLocalUser(userToCache).catch(e => console.warn(`[Trips ${funcStartTime}] Error caching driver ${d.id} from Firestore:`, e)));
          });
        }

        localTripsData.forEach(t => {
          cachePromises.push(updateLocalRecord(STORE_TRIPS, t).catch(e => console.warn(`[Trips ${funcStartTime}] Error caching trip ${t.localId} from Firestore:`, e)));
        });
        localVehiclesData.forEach(v => {
          cachePromises.push(updateLocalRecord(STORE_VEHICLES, v).catch(e => console.warn(`[Trips ${funcStartTime}] Error caching vehicle ${v.localId} from Firestore:`, e)));
        });

      } else {
        console.log(`[Trips ${funcStartTime}] Offline: Fetching trips, vehicles, and (if admin) drivers from LocalDB.`);
        localTripsData = await fetchLocalDbTrips(currentUserIdForFilter, filterDateRange);
        localVehiclesData = await fetchLocalDbVehicles();
        if (isAdmin) {
          localDriversData = (await getLocalRecordsByRole('driver')) as User[];
        }
      }

      if (cachePromises.length > 0) {
        console.log(`[Trips ${funcStartTime}] Caching ${cachePromises.length} Firestore items locally in background...`);
        await Promise.all(cachePromises).catch(cacheError => {
            console.warn(`[Trips ${funcStartTime}] Error during batch caching of Firestore data locally:`, cacheError);
        });
        console.log(`[Trips ${funcStartTime}] Finished attempting to cache Firestore items.`);
      }

      const uiTrips = localTripsData
        .filter(trip => !trip.deleted)
        .map(lt => ({
          ...lt,
          id: lt.firebaseId || lt.localId,
        } as Trip))
        .sort((a, b) => {
          if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
          if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
          try {
            const dateA = typeof a.createdAt === 'string' ? parseISO(a.createdAt) : (a.createdAt as Date);
            const dateB = typeof b.createdAt === 'string' ? parseISO(b.createdAt) : (b.createdAt as Date);
            return dateB.getTime() - dateA.getTime();
          } catch { return 0; }
        });

      const uiVehicles = localVehiclesData
        .filter(v => !v.deleted)
        .map(lv => ({ ...lv, id: String(lv.firebaseId || lv.localId) } as VehicleInfo));

      setAllTrips(uiTrips);
      setVehicles(uiVehicles);
      if (isAdmin) setDrivers(localDriversData.filter(d => !d.deleted));

      // Fetch counts for each trip
      const newVisitCounts: Record<string, number> = {};
      const newExpenseCounts: Record<string, number> = {};
      const newFuelingCounts: Record<string, number> = {};

      for (const trip of uiTrips) {
        try {
          const [visits, expenses, fuelings] = await Promise.all([
            getLocalVisits(trip.localId),
            getLocalExpenses(trip.localId),
            getLocalFuelings(trip.localId, 'tripLocalId')
          ]);
          newVisitCounts[trip.localId] = visits.filter(v => !v.deleted).length;
          newExpenseCounts[trip.localId] = expenses.filter(e => !e.deleted).length;
          newFuelingCounts[trip.localId] = fuelings.filter(f => !f.deleted).length;
        } catch (countError) {
          console.error(`[Trips ${funcStartTime}] Error fetching counts for trip ${trip.localId}:`, countError);
          newVisitCounts[trip.localId] = 0;
          newExpenseCounts[trip.localId] = 0;
          newFuelingCounts[trip.localId] = 0;
        }
      }
      setVisitCounts(newVisitCounts);
      setExpenseCounts(newExpenseCounts);
      setFuelingCounts(newFuelingCounts);

    } catch (error) {
      console.error(`[Trips ${funcStartTime}] Error in initializeTripsAndVehiclesData:`, error);
      toast({ variant: 'destructive', title: 'Erro ao carregar dados', description: 'Não foi possível buscar viagens ou veículos.' });
      setAllTrips([]);
      setVehicles([]);
      if (isAdmin) setDrivers([]);
    } finally {
      setLoadingTripsAndVehicles(false);
      if (isAdmin) setLoadingDrivers(false);
      console.log(`[Trips ${funcStartTime}] Initialization complete. Total time: ${Date.now() - funcStartTime}ms`);
    }
  }, [user?.id, user?.base, isAdmin, authLoading, filterDateRange, filterDriverId, toast]);

  useEffect(() => {
    if (!authLoading) { // Only run if auth context is no longer loading
      initializeTripsAndVehiclesData();
    }
  }, [authLoading, user?.id, isAdmin, filterDriverId, filterDateRange, initializeTripsAndVehiclesData]);


  const getVehicleInfo = useCallback((vehicleId: string | undefined): string => {
    if (!vehicleId) return 'Veículo não especificado';
    const vehicle = vehicles.find(v => v.id === vehicleId || v.localId === vehicleId);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : `Veículo ID ${vehicleId.substring(0,6)}...`;
  }, [vehicles]);

  const getDriverName = useCallback((tripUserId: string | undefined): string => {
    if (!tripUserId) return "Motorista Desconhecido";
    if (user && tripUserId === user.id) {
      return user.name || user.email || `Usuário (${user.id.substring(0,6)}...)`;
    }
    if (isAdmin && drivers.length > 0) {
      const driver = drivers.find(d => d.id === tripUserId || d.firebaseId === tripUserId);
      return driver?.name || driver?.email || `Motorista (${tripUserId.substring(0,6)}...)`;
    }
    return `Motorista (${tripUserId.substring(0,6)}...)`;
  }, [user, isAdmin, drivers]);


  const getTripDescription = useCallback((trip: Trip): string => {
    const vehicleName = getVehicleInfo(trip.vehicleId);
    const driverName = isAdmin ? getDriverName(trip.userId) : ''; // Only show driver name for admin
    const date = trip.createdAt ? formatDateFn(parseISO(String(trip.createdAt)), 'dd/MM/yyyy') : 'Data Desconhecida';

    let description = `Viagem ${vehicleName} - ${date}`;
    if (isAdmin && driverName && trip.userId !== user?.id) { // Add driver name if admin and not their own trip
      description += ` (Motorista: ${driverName})`;
    }
    if (trip.base && trip.base !== user?.base && isAdmin) { // Add base if different and admin view
      description += ` (Base: ${trip.base})`;
    }
    return description;
  }, [getVehicleInfo, getDriverName, isAdmin, user?.id, user?.base]);


  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Usuário não autenticado.' });
      return;
    }
    if (!selectedVehicleId) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione um veículo para a viagem.' });
      return;
    }
    if (!user.base && !isAdmin) {
        toast({ variant: 'destructive', title: 'Base Não Definida', description: 'Você precisa ter uma base definida no seu perfil para criar viagens.' });
        return;
    }

    setIsSaving(true);
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    const tripDate = new Date();
    const autoGeneratedName = `Viagem ${vehicle ? vehicle.model : 'Veículo Desconhecido'} - ${formatDateFn(tripDate, 'dd/MM/yyyy')}`;

    const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus' | 'id' | 'deleted' | 'firebaseId'> = {
      name: autoGeneratedName,
      vehicleId: selectedVehicleId,
      userId: user.id,
      base: user.base || (isAdmin ? 'ADMIN_TRIPS' : 'N/A'),
      status: 'Andamento',
      description: tripDescription,
      createdAt: tripDate.toISOString(),
      updatedAt: tripDate.toISOString(),
      totalDistance: 0,
      finalKm: 0,
    };

    try {
      await addLocalTrip(newTripData);
      toast({ title: 'Viagem criada localmente!' });
      setIsCreateModalOpen(false);
      resetCreateForm();
      await initializeTripsAndVehiclesData(); // Refresh list
    } catch (error: any) {
      console.error("Error creating local trip:", error);
      toast({ variant: "destructive", title: "Erro ao Criar Viagem", description: error.message || "Não foi possível criar a viagem localmente." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditModal = (trip: Trip) => {
    setCurrentTripForEdit(trip);
    setTripNameInput(trip.name); // Though not directly editable, set for consistency
    setSelectedVehicleId(trip.vehicleId || '');
    setTripStatus(trip.status);
    setTripBase(trip.base || '');
    setTripDescription(trip.description || '');
    setIsEditModalOpen(true);
  };

  const handleEditTripSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTripForEdit || !user) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Nenhuma viagem selecionada ou usuário não autenticado.' });
      return;
    }
    if (!selectedVehicleId) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione um veículo.' });
      return;
    }

    setIsSaving(true);
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    const originalCreatedAt = currentTripForEdit.createdAt ? new Date(currentTripForEdit.createdAt) : new Date();
    const autoGeneratedName = `Viagem ${vehicle ? vehicle.model : 'Veículo Desconhecido'} - ${formatDateFn(originalCreatedAt, 'dd/MM/yyyy')}`;

    const updatedTripData: LocalTrip = {
      ...currentTripForEdit, // Spread all properties of currentTripForEdit
      localId: currentTripForEdit.localId, // Ensure localId is preserved
      id: currentTripForEdit.id, // Ensure UI id is preserved
      name: autoGeneratedName,
      vehicleId: selectedVehicleId,
      userId: currentTripForEdit.userId, // Preserve original userId
      base: currentTripForEdit.base, // Preserve original base
      status: tripStatus,
      description: tripDescription,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending', // Mark for sync
    };

    console.log("[Trips handleEditTripSubmit] Updating local trip. Current:", currentTripForEdit, "Updated Data:", updatedTripData);

    try {
      await updateLocalTrip(updatedTripData);
      toast({ title: 'Viagem atualizada localmente!' });
      setIsEditModalOpen(false);
      setCurrentTripForEdit(null);
      await initializeTripsAndVehiclesData(); // Refresh list
    } catch (error: any) {
      console.error("Error updating local trip:", error);
      toast({ variant: "destructive", title: "Erro ao Atualizar Viagem", description: error.message || "Não foi possível atualizar a viagem localmente." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenFinishModal = async (trip: Trip) => {
    console.log("[Trips handleOpenFinishModal] Opening finish modal for trip:", trip.localId);
    const localVisits = await getLocalVisits(trip.localId);
    const uiVisits = localVisits
        .filter(v => !v.deleted)
        .map(lv => ({ ...lv, id: lv.firebaseId || lv.localId, tripId: lv.tripLocalId, userId: lv.userId || trip.userId } as Visit))
        .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (uiVisits.length === 0) {
        toast({
            variant: "destructive",
            title: "Viagem Sem Visitas",
            description: "Não é possível finalizar uma viagem sem visitas registradas. Adicione ao menos uma visita.",
            duration: 7000
        });
        return;
    }
    setVisitsDataForFinish(uiVisits);
    setTripToFinish(trip);
    setIsFinishModalOpen(true);
  };

  const handleConfirmFinishTrip = async (tripId: string, finalKm: number, totalDistance: number) => {
    console.log(`[Trips handleConfirmFinishTrip] Finishing trip ${tripId} with finalKm: ${finalKm}, totalDistance: ${totalDistance}`);
    if (!tripToFinish) return;
    setIsSaving(true);

    const updatedTripData: LocalTrip = {
      ...tripToFinish,
      localId: tripToFinish.localId,
      id: tripToFinish.id,
      status: 'Finalizado',
      finalKm: finalKm,
      totalDistance: totalDistance,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    console.log("[Trips handleConfirmFinishTrip] Updated trip data for finish:", updatedTripData);

    try {
      await updateLocalTrip(updatedTripData);
      toast({ title: 'Viagem finalizada localmente!' });
      setIsFinishModalOpen(false);
      setTripToFinish(null);
      setVisitsDataForFinish([]);
      await initializeTripsAndVehiclesData();
    } catch (error: any) {
      console.error("Error finishing local trip:", error);
      toast({ variant: "destructive", title: "Erro ao Finalizar Viagem", description: error.message || "Não foi possível finalizar a viagem." });
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteConfirmation = (trip: Trip, event?: React.MouseEvent) => {
    event?.stopPropagation(); // Prevent accordion from toggling
    console.log("[Trips openDeleteConfirmation] Trip to delete:", trip);
    setTripToDelete(trip);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteConfirmation = () => {
    setTripToDelete(null);
    setIsDeleteModalOpen(false);
  };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) return;
    console.log("[Trips confirmDeleteTrip] Confirming delete for trip:", tripToDelete.localId);
    setIsDeleting(true);
    try {
      await deleteLocalTrip(tripToDelete.localId);
      toast({ title: 'Viagem marcada para exclusão!' });
      closeDeleteConfirmation();
      await initializeTripsAndVehiclesData(); // Refresh list
    } catch (error: any) {
      console.error("Error deleting local trip:", error);
      toast({ variant: "destructive", title: "Erro ao Excluir Viagem", description: error.message || "Não foi possível marcar a viagem para exclusão." });
    } finally {
      setIsDeleting(false);
    }
  };


  const resetCreateForm = () => {
    setSelectedVehicleId('');
    setTripDescription('');
    // tripNameInput and tripStatus are auto-set or fixed
  };

  const handleOpenShareDialog = (tripId: string) => {
    const tripToShare = allTrips.find(t => t.localId === tripId);
    if (tripToShare) {
      setCurrentTripForEdit(tripToShare); // Still useful for summary context
      generateTripSummary(tripToShare.localId, true); // Generate detailed for dialog display
      setSharingTripId(tripId);
    }
  };

  const handleCloseShareDialog = () => {
    setSharingTripId(null);
    setDetailedSummaryText(null);
    setCurrentTripForEdit(null); // Clear if it was set for sharing context
  };

  const generateTripSummary = useCallback(async (targetTripId: string, forDetailedView: boolean = false) => {
    const trip = allTrips.find(t => t.localId === targetTripId);
    if (!trip) return "Detalhes da viagem não encontrados.";

    const [visits, expenses, fuelings] = await Promise.all([
        getLocalVisits(trip.localId),
        getLocalExpenses(trip.localId),
        getLocalFuelings(trip.localId, 'tripLocalId')
    ]);

    const vehicleName = getVehicleInfo(trip.vehicleId);
    const driverName = getDriverName(trip.userId);
    const createdAt = trip.createdAt ? formatDateFn(parseISO(String(trip.createdAt)), 'dd/MM/yyyy HH:mm') : 'N/A';
    const updatedAt = trip.updatedAt ? formatDateFn(parseISO(String(trip.updatedAt)), 'dd/MM/yyyy HH:mm') : 'N/A';

    let summary = `*Resumo da Viagem: ${trip.name}*\n`;
    summary += `Motorista: ${driverName}\n`;
    summary += `Veículo: ${vehicleName}\n`;
    summary += `Status: ${trip.status}\n`;
    summary += `Criada em: ${createdAt}\n`;
    if (trip.status === 'Finalizado') {
        summary += `Finalizada em: ${updatedAt}\n`;
        summary += `KM Final: ${trip.finalKm ? formatKm(trip.finalKm) : 'N/A'}\n`;
        summary += `Distância Total: ${trip.totalDistance ? formatKm(trip.totalDistance) : 'N/A'}\n`;
    }
    if (trip.description) summary += `Descrição: ${trip.description}\n`;

    summary += `\n*Visitas (${visits.filter(v => !v.deleted).length}):*\n`;
    if (forDetailedView && visits.filter(v => !v.deleted).length > 0) {
        visits.filter(v => !v.deleted).forEach(v => {
            summary += `- ${v.clientName} (${formatDateFn(parseISO(v.timestamp), 'dd/MM HH:mm')}), KM: ${formatKm(v.initialKm)}, Motivo: ${v.reason}, Tipo: ${v.visitType || 'N/A'}\n`;
        });
    } else if (visits.filter(v => !v.deleted).length > 0) {
        summary += `${visits.filter(v => !v.deleted).length} visitas registradas.\n`;
    } else {
        summary += "Nenhuma visita registrada.\n";
    }

    summary += `\n*Despesas (${expenses.filter(e => !e.deleted).length}):*\n`;
    if (forDetailedView && expenses.filter(e => !e.deleted).length > 0) {
        expenses.filter(e => !e.deleted).forEach(e => {
            summary += `- ${e.description}: ${formatDateFn(parseISO(e.expenseDate), 'dd/MM')} - R$ ${e.value.toFixed(2)}\n`;
        });
    } else if (expenses.filter(e => !e.deleted).length > 0) {
        summary += `Total de ${expenses.filter(e => !e.deleted).length} despesas, somando R$ ${expenses.filter(e => !e.deleted).reduce((sum, item) => sum + item.value, 0).toFixed(2)}.\n`;
    } else {
        summary += "Nenhuma despesa registrada.\n";
    }

    summary += `\n*Abastecimentos (${fuelings.filter(f => !f.deleted).length}):*\n`;
    if (forDetailedView && fuelings.filter(f => !f.deleted).length > 0) {
        fuelings.filter(f => !f.deleted).forEach(f => {
            summary += `- ${formatDateFn(parseISO(f.date), 'dd/MM')}: ${f.liters.toFixed(2)}L de ${f.fuelType} @ R$ ${f.pricePerLiter.toFixed(2)}/L. Total: R$ ${f.totalCost.toFixed(2)}. KM: ${formatKm(f.odometerKm)}\n`;
        });
    } else if (fuelings.filter(f => !f.deleted).length > 0) {
        summary += `Total de ${fuelings.filter(f => !f.deleted).length} abastecimentos.\n`;
    } else {
        summary += "Nenhum abastecimento registrado.\n";
    }

    if (forDetailedView) {
        setDetailedSummaryText(summary);
    }
    return summary;
  }, [allTrips, getVehicleInfo, getDriverName]);


  const handleShareToWhatsApp = async (tripId: string) => {
    const summary = await generateTripSummary(tripId, false); // Generate concise summary
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(summary)}`;
    window.open(whatsappUrl, '_blank');
    handleCloseShareDialog();
  };

  const getTripSummaryKmFunction = useCallback(async (tripId: string) => {
    const trip = allTrips.find(t => t.localId === tripId);
    if (!trip) return { betweenVisits: null, firstToLast: null };

    const visits = (await getLocalVisits(trip.localId))
      .filter(v => !v.deleted)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let betweenVisitsKm = null;
    if (visits.length > 1) {
      betweenVisitsKm = visits[visits.length - 1].initialKm - visits[0].initialKm;
    }

    let firstToLastKm = null;
    if (trip.status === 'Finalizado' && visits.length > 0 && trip.finalKm && trip.finalKm > 0) {
      firstToLastKm = trip.finalKm - visits[0].initialKm;
    } else if (trip.status === 'Finalizado' && trip.totalDistance) {
        firstToLastKm = trip.totalDistance; // Use pre-calculated if available and no visits
    }


    return {
      betweenVisits: betweenVisitsKm,
      firstToLast: firstToLastKm,
    };
  }, [allTrips]); // getLocalVisits is stable from import

  if (authLoading || loadingTripsAndVehicles || (isAdmin && loadingDrivers)) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-200px)]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    // This should ideally be handled by the page routing to /login
    return <p className="text-center text-muted-foreground p-4">Usuário não autenticado. Redirecionando para login...</p>;
  }

  if (!user.base && !isAdmin) {
    return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center p-4">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Base Não Definida</h2>
            <p className="text-muted-foreground">
                Você precisa ter uma base operacional definida no seu perfil para criar ou visualizar viagens.
            </p>
            <Button onClick={() => window.location.href = '/profile'} className="mt-4">
                Ir para o Perfil
            </Button>
        </div>
    );
  }


  const driverOptions = [
    { value: ALL_DRIVERS_OPTION_VALUE, label: "Todos os Motoristas" },
    ...drivers.map(driver => ({
        value: driver.id || driver.firebaseId!, // Ensure value is non-empty
        label: driver.name || driver.email || `ID: ${driver.id.substring(0,6)}`
    }))
  ];

  return (
    <div className="space-y-6 px-4 sm:px-0"> {/* Added mobile padding */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-semibold">
          {isAdmin ? 'Todas as Viagens' : 'Minhas Viagens'}
        </h2>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetCreateForm(); setIsCreateModalOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Criar Nova Viagem
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Nova Viagem</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTrip} className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="vehicleId">Veículo*</Label>
                <Select onValueChange={setSelectedVehicleId} value={selectedVehicleId} required disabled={isSaving || vehicles.length === 0}>
                  <SelectTrigger id="vehicleId">
                    <SelectValue placeholder={vehicles.length === 0 ? "Nenhum veículo cadastrado" : "Selecione um veículo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map(vehicle => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.model} ({vehicle.licensePlate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                 {vehicles.length === 0 && (
                    <p className="text-xs text-destructive">Cadastre um veículo na aba 'Veículo' antes de criar uma viagem.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tripDescription">Descrição (Opcional)</Label>
                <Textarea id="tripDescription" value={tripDescription} onChange={(e) => setTripDescription(e.target.value)} placeholder="Ex: Entrega cliente X, Rota Sul..." disabled={isSaving}/>
              </div>
               <div className="space-y-1">
                  <Label>Status</Label>
                  <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                    <PlayCircle className="h-4 w-4" /> Andamento (Automático)
                  </p>
                </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isSaving}>Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={isSaving || vehicles.length === 0} className="bg-primary hover:bg-primary/90">
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSaving ? 'Salvando...' : 'Criar Viagem'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg bg-card shadow">
         {isAdmin && (
            <div className="space-y-1.5">
                <Label htmlFor="driverFilter">Filtrar por Motorista</Label>
                <Select
                    value={filterDriverId}
                    onValueChange={setFilterDriverId}
                    disabled={loadingDrivers || drivers.length === 0}
                >
                    <SelectTrigger id="driverFilter">
                        <SelectValue placeholder={loadingDrivers ? "Carregando..." : (drivers.length === 0 ? "Nenhum motorista" : "Todos os Motoristas")} />
                    </SelectTrigger>
                    <SelectContent>
                       {loadingDrivers ? <SelectItem value="loading_drivers" disabled><LoadingSpinner className="h-4 w-4 inline-block mr-2" />Carregando...</SelectItem> :
                        driverOptions.map(opt => (
                           <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))
                       }
                    </SelectContent>
                </Select>
            </div>
          )}
          <div className="space-y-1.5">
              <Label htmlFor="dateRangeFilter">Filtrar por Data de Criação</Label>
              <DateRangePicker date={filterDateRange} onDateChange={setFilterDateRange} />
          </div>
      </div>


      {loadingTripsAndVehicles ? (
        <div className="flex justify-center items-center py-10"><LoadingSpinner /></div>
      ) : allTrips.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <PackageCheck className="mx-auto h-12 w-12 mb-4 text-gray-400" />
          <p>Nenhuma viagem encontrada.</p>
          <p className="text-sm">
            {isAdmin && filterDriverId !== ALL_DRIVERS_OPTION_VALUE ? "Nenhuma viagem para o motorista selecionado ou período." :
             isAdmin ? "Nenhuma viagem cadastrada no sistema ou para o período selecionado." :
             "Você ainda não criou nenhuma viagem ou não há viagens para o período selecionado."
            }
          </p>
        </div>
      ) : (
        <Accordion
          type="single"
          collapsible
          className="w-full space-y-4"
          value={expandedTripId}
          onValueChange={setExpandedTripId}
        >
          {allTrips.map(trip => (
            <TripAccordionItem
              key={trip.localId}
              trip={trip}
              getVehicleInfo={getVehicleInfo}
              getTripDescription={getTripDescription}
              visitCount={visitCounts[trip.localId] || 0}
              expenseCount={expenseCounts[trip.localId] || 0}
              fuelingCount={fuelingCounts[trip.localId] || 0}
              isExpanded={expandedTripId === trip.localId}
              onToggleExpand={() => setExpandedTripId(current => current === trip.localId ? null : trip.localId)}
              activeSubTab={expandedTripId === trip.localId ? activeSubTab : null}
              isAdmin={isAdmin}
              currentTripForEdit={currentTripForEdit}
              openEditModalForThisTrip={() => handleOpenEditModal(trip)}
              closeEditModal={() => { setIsEditModalOpen(false); setCurrentTripForEdit(null); }}
              isEditModalOpen={isEditModalOpen && currentTripForEdit?.localId === trip.localId}
              handleEditTripSubmit={handleEditTripSubmit}
              tripNameInput={tripNameInput} // Not directly used but part of form state
              selectedVehicleId={selectedVehicleId}
              setSelectedVehicleId={setSelectedVehicleId}
              tripStatus={tripStatus}
              setTripStatus={setTripStatus}
              tripBase={tripBase} // Not directly used
              tripDescription={tripDescription}
              setTripDescription={setTripDescription}
              vehicles={vehicles}
              openFinishModal={() => handleOpenFinishModal(trip)}
              openDeleteConfirmation={(tripToDelete, event) => openDeleteConfirmation(tripToDelete, event)}
              tripToDelete={tripToDelete}
              isDeleteModalOpen={isDeleteModalOpen && tripToDelete?.localId === trip.localId} // Pass specific open state
              closeDeleteConfirmation={closeDeleteConfirmation}
              confirmDeleteTrip={confirmDeleteTrip}
              isSaving={isSaving}
              isDeleting={isDeleting}
              sharingTripId={sharingTripId}
              openShareModalForThisTrip={() => handleOpenShareDialog(trip.localId)}
              closeShareModal={handleCloseShareDialog}
              isShareModalOpenForThisTrip={sharingTripId === trip.localId}
              detailedSummaryText={detailedSummaryText}
              handleShareToWhatsApp={() => handleShareToWhatsApp(trip.localId)}
              generateTripSummaryForPrint={() => generateTripSummary(trip.localId, true)}
              getTripSummaryKmFunction={getTripSummaryKmFunction}
            />
          ))}
        </Accordion>
      )}

      {/* Modals that are global to this Trips component */}
      <FinishTripDialog
        trip={tripToFinish}
        isOpen={isFinishModalOpen}
        onClose={() => { setIsFinishModalOpen(false); setTripToFinish(null); setVisitsDataForFinish([]);}}
        onConfirm={handleConfirmFinishTrip}
        visitsData={visitsDataForFinish}
      />
    </div>
  );
};
