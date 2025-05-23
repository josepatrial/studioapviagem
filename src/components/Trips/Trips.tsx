// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Accordion,
} from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, PlayCircle, CheckCircle2, Loader2, Filter, CalendarDays, AlertTriangle } from 'lucide-react';
import type { Visit } from './Visits';
import { useToast } from '@/hooks/use-toast';
import { useAuth, User } from '@/contexts/AuthContext';
import type { LocalVehicle as DbVehicleType } from '@/services/localDbService'; // Renamed to avoid conflict
import { Badge } from '@/components/ui/badge';
import { FinishTripDialog } from './FinishTripDialog';
import { cn } from '@/lib/utils';
import { getDrivers as fetchOnlineDrivers } from '@/services/firestoreService';
import {
  addLocalTrip,
  updateLocalTrip,
  deleteLocalTrip as deleteLocalDbTripAndData, // Corrected import
  getLocalTrips as fetchLocalDbTrips, // Renamed to avoid conflict
  getLocalVisits,
  getLocalExpenses,
  getLocalFuelings,
  LocalTrip,
  LocalVehicle, // Keep LocalVehicle for type consistency if used
  getLocalRecordsByRole,
  getLocalVehicles as fetchLocalDbVehicles, // Renamed
  updateLocalRecord,
  STORE_TRIPS,
  STORE_VEHICLES,
  STORE_USERS,
  saveLocalUser,
} from '@/services/localDbService';
import { getTrips as fetchOnlineTrips, getVehicles as fetchOnlineVehicles } from '@/services/firestoreService';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { TripAccordionItem, type TripReportData } from './TripAccordionItem';
import { format, parseISO } from 'date-fns';
import { useSync } from '@/contexts/SyncContext';


export interface Trip extends Omit<LocalTrip, 'localId' | 'firebaseId' | 'syncStatus' | 'deleted'> {
  localId: string;
  firebaseId?: string;
  syncStatus?: 'pending' | 'synced' | 'error';
  deleted?: boolean;
}

interface TripsProps {
  activeSubTab?: 'visits' | 'expenses' | 'fuelings' | null;
}

export const Trips: React.FC<TripsProps> = ({ activeSubTab }) => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { updatePendingCount } = useSync();

  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<DbVehicleType[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);

  const [loadingTrips, setLoadingTrips] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [currentTripForEdit, setCurrentTripForEdit] = useState<Trip | null>(null);
  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);


  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedVehicleIdForEdit, setSelectedVehicleIdForEdit] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);

  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [filterDriverId, setFilterDriverId] = useState<string>('');

  const isAdmin = useMemo(() => user?.role === 'admin', [user?.role]);

  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({});
  const [fuelingCounts, setFuelingCounts] = useState<Record<string, number>>({});
  const [visitsDataForFinish, setVisitsDataForFinish] = useState<Visit[]>([]);

  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [detailedSummaryText, setDetailedSummaryText] = useState<string | null>(null);


  const initializeTripsAndVehiclesData = useCallback(async () => {
    const funcStartTime = Date.now();
    console.log(`[Trips ${new Date().toISOString()}] INITIALIZE TRIPS AND VEHICLES DATA CALLED. User ID: ${user?.id}, IsAdmin: ${isAdmin}`);

    if (authLoading) {
      console.log(`[Trips ${funcStartTime}] Auth context still loading. Aborting initialization.`);
      setLoadingTrips(true); setLoadingVehicles(true);
      return;
    }
    if (!user && !isAdmin) {
      console.log(`[Trips ${funcStartTime}] No user and not admin. Clearing data and aborting.`);
      setAllTrips([]); setVehicles([]); setDrivers([]);
      setLoadingTrips(false); setLoadingVehicles(false); setLoadingDrivers(false);
      return;
    }

    setLoadingTrips(true);
    setLoadingVehicles(true);
    if (isAdmin) setLoadingDrivers(true);

    const cachePromises: Promise<void>[] = [];
    const effectiveUserIdForTrips = isAdmin && filterDriverId ? filterDriverId : user?.id;
    const baseForTrips = isAdmin && !filterDriverId ? user?.base : undefined;

    try {
      if (navigator.onLine) {
        console.log(`[Trips ${funcStartTime}] Online: Fetching from Firestore...`);

        const onlineVehiclesPromise = fetchOnlineVehicles().then(data => {
          const localVehicles = data.map(v => ({ ...v, localId: v.id, firebaseId: v.id, syncStatus: 'synced', deleted: false } as DbVehicleType));
          setVehicles(localVehicles);
          console.log(`[Trips ${funcStartTime}] Fetched ${data.length} online vehicles. Caching...`);
          localVehicles.forEach(v => {
            cachePromises.push(updateLocalRecord(STORE_VEHICLES, v).catch(e => console.warn(`[Trips Cache Fail] Vehicle ${v.id}:`, e)));
          });
        }).finally(() => setLoadingVehicles(false));

        const onlineTripsPromise = fetchOnlineTrips({ userId: effectiveUserIdForTrips, startDate: filterDateRange?.from, endDate: filterDateRange?.to, base: baseForTrips })
          .then(data => {
            const localTrips = data.map(t => ({ ...t, localId: t.id, firebaseId: t.id, syncStatus: 'synced', deleted: false } as Trip));
            setAllTrips(localTrips);
            console.log(`[Trips ${funcStartTime}] Fetched ${data.length} online trips for user ${effectiveUserIdForTrips}. Caching...`);
            localTrips.forEach(t => {
              cachePromises.push(updateLocalRecord(STORE_TRIPS, t).catch(e => console.warn(`[Trips Cache Fail] Trip ${t.id}:`, e)));
            });
          }).finally(() => setLoadingTrips(false));

        let onlineDriversPromise = Promise.resolve();
        if (isAdmin) {
          onlineDriversPromise = fetchOnlineDrivers().then(data => {
            setDrivers(data);
            console.log(`[Trips ${funcStartTime}] Fetched ${data.length} online drivers (admin). Caching...`);
            data.forEach(d => {
              const driverToCache = { ...d, firebaseId: d.id, id: d.id, syncStatus: 'synced', role: 'driver', deleted: false, lastLogin: new Date().toISOString() } as User & { firebaseId: string, id: string, syncStatus: 'synced', role: 'driver', deleted: boolean, lastLogin: string };
              cachePromises.push(saveLocalUser(driverToCache).catch(e => console.warn(`[Trips Cache Fail] Driver ${d.id}:`, e)));
            });
          }).finally(() => setLoadingDrivers(false));
        }

        await Promise.all([onlineVehiclesPromise, onlineTripsPromise, onlineDriversPromise]);

      } else { // OFFLINE
        console.log(`[Trips ${funcStartTime}] Offline: Fetching from LocalDB...`);
        fetchLocalDbVehicles().then(setVehicles).finally(() => setLoadingVehicles(false));
        fetchLocalDbTrips(effectiveUserIdForTrips, filterDateRange, baseForTrips).then(setAllTrips as any).finally(() => setLoadingTrips(false));
        if (isAdmin) {
          getLocalRecordsByRole('driver').then(data => setDrivers(data as User[])).finally(() => setLoadingDrivers(false));
        }
      }

      if (navigator.onLine && cachePromises.length > 0) {
        await Promise.all(cachePromises).catch(cacheError => {
          console.warn(`[Trips ${funcStartTime}] Error caching Firestore data locally:`, cacheError);
        });
        console.log(`[Trips ${funcStartTime}] Finished attempting to cache Firestore items.`);
      }

    } catch (error) {
      console.error(`[Trips ${funcStartTime}] Error in initializeTripsAndVehiclesData:`, error);
      toast({ variant: 'destructive', title: 'Erro ao Carregar Dados', description: (error as Error).message });
      setLoadingTrips(false); setLoadingVehicles(false); setLoadingDrivers(false);
    }
    console.log(`[Trips ${funcStartTime}] Initialization finished. Total time: ${Date.now() - funcStartTime}ms`);
  }, [user?.id, user?.base, isAdmin, filterDriverId, filterDateRange, authLoading, toast]);


  useEffect(() => {
    initializeTripsAndVehiclesData();
  }, [initializeTripsAndVehiclesData]); // Keep initializeTripsAndVehiclesData as a dependency

  useEffect(() => {
    const fetchCounts = async () => {
      const newVisitCounts: Record<string, number> = {};
      const newExpenseCounts: Record<string, number> = {};
      const newFuelingCounts: Record<string, number> = {};
      for (const trip of allTrips) {
        newVisitCounts[trip.localId] = (await getLocalVisits(trip.localId)).length;
        newExpenseCounts[trip.localId] = (await getLocalExpenses(trip.localId)).length;
        newFuelingCounts[trip.localId] = (await getLocalFuelings(trip.localId)).length;
      }
      setVisitCounts(newVisitCounts);
      setExpenseCounts(newExpenseCounts);
      setFuelingCounts(newFuelingCounts);
    };
    if (allTrips.length > 0) {
      fetchCounts();
    }
  }, [allTrips]);


  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.id) {
      toast({ variant: 'destructive', title: 'Erro de Autenticação', description: 'Usuário não identificado.' });
      return;
    }
    if (!selectedVehicleId) {
      toast({ variant: 'destructive', title: 'Erro de Validação', description: 'Por favor, selecione um veículo.' });
      return;
    }
    if (!user.base || user.base === 'N/A' || user.base === 'Não definida') {
        toast({
            variant: "destructive",
            title: "Base Não Definida",
            description: "Você precisa ter uma base definida no seu perfil para criar viagens.",
            duration: 7000,
        });
        setIsCreateModalOpen(false);
        return;
    }

    setIsSaving(true);
    const selectedVehicle = vehicles.find(v => v.localId === selectedVehicleId);
    if (!selectedVehicle) {
      toast({ variant: "destructive", title: "Erro", description: "Veículo selecionado não encontrado." });
      setIsSaving(false);
      return;
    }

    const tripDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tripName = `Viagem ${selectedVehicle.model} (${selectedVehicle.licensePlate}) - ${tripDate}`;

    const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus' | 'id' | 'deleted' | 'updatedAt' | 'totalDistance' | 'finalKm'> = {
      name: tripName,
      userId: user.id,
      vehicleId: selectedVehicleId,
      status: 'Andamento',
      createdAt: new Date().toISOString(),
      base: user.base,
    };

    try {
      const newLocalId = await addLocalTrip(newTripData);
      const newTripForUI: Trip = {
        ...newTripData,
        localId: newLocalId,
        updatedAt: newTripData.createdAt,
        syncStatus: 'pending',
        deleted: false,
      };
      setAllTrips(prevTrips => [newTripForUI, ...prevTrips].sort((a, b) => {
        if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
        if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }));
      if (updatePendingCount) updatePendingCount();
      setIsCreateModalOpen(false);
      setSelectedVehicleId('');
      toast({ title: 'Viagem criada localmente!' });
      await initializeTripsAndVehiclesData(); // Re-fetch to update counts and list
    } catch (error) {
      console.error("Error creating local trip:", error);
      toast({ variant: "destructive", title: "Erro ao Criar Viagem", description: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditModal = (tripToEdit: Trip) => {
    console.log("[Trips.tsx handleOpenEditModal] Trip to edit:", JSON.stringify(tripToEdit));
    setCurrentTripForEdit(tripToEdit);
    setSelectedVehicleIdForEdit(tripToEdit.vehicleId);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setCurrentTripForEdit(null);
    setSelectedVehicleIdForEdit('');
  };

  const handleEditTripSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTripForEdit || !selectedVehicleIdForEdit) {
      toast({ variant: "destructive", title: "Erro", description: "Nenhuma viagem ou veículo selecionado para edição." });
      return;
    }
    console.log("[Trips.tsx handleEditTripSubmit] Submitting edit for trip:", JSON.stringify(currentTripForEdit), "New vehicleId:", selectedVehicleIdForEdit);
    setIsSaving(true);
    const selectedVehicle = vehicles.find(v => v.localId === selectedVehicleIdForEdit);
    if (!selectedVehicle) {
        toast({ variant: "destructive", title: "Erro", description: "Veículo selecionado para edição não encontrado." });
        setIsSaving(false);
        return;
    }

    const tripDate = new Date(currentTripForEdit.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const updatedTripData: Trip = {
      ...currentTripForEdit,
      vehicleId: selectedVehicleIdForEdit,
      name: `Viagem ${selectedVehicle.model} (${selectedVehicle.licensePlate}) - ${tripDate}`,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    console.log("[Trips.tsx handleEditTripSubmit] Updated trip data for local save:", JSON.stringify(updatedTripData));

    try {
      await updateLocalTrip(updatedTripData as LocalTrip); // Cast to LocalTrip for service
      if (updatePendingCount) updatePendingCount();
      handleCloseEditModal();
      toast({ title: "Viagem atualizada localmente!" });
      await initializeTripsAndVehiclesData(); // Re-fetch
    } catch (error) {
      console.error("Error updating local trip:", error);
      toast({ variant: "destructive", title: "Erro ao Atualizar Viagem", description: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  };

  const openFinishConfirmationModal = async (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    console.log("[Trips openFinishConfirmationModal] Opening for trip:", JSON.stringify(trip));
    const currentVisits = await getLocalVisits(trip.localId);
    if (currentVisits.length === 0) {
        toast({
            variant: "destructive",
            title: "Nenhuma Visita Registrada",
            description: "Você não pode finalizar uma viagem sem registrar pelo menos uma visita.",
            duration: 7000,
        });
        return;
    }
    setVisitsDataForFinish(currentVisits.map(v => ({...v, id: v.localId, tripId: v.tripLocalId, userId: v.userId})));
    setTripToFinish(trip);
    setIsFinishModalOpen(true);
  };

  const handleConfirmFinishTrip = async (tripId: string, finalKm: number, totalDistance: number) => {
    console.log(`[Trips handleConfirmFinishTrip] Finishing trip ${tripId} with finalKm: ${finalKm}, totalDistance: ${totalDistance}`);
    setIsSaving(true);
    const trip = allTrips.find(t => t.localId === tripId);
    if (!trip) {
      toast({ variant: "destructive", title: "Erro", description: "Viagem não encontrada." });
      setIsSaving(false);
      return;
    }
    const updatedTrip: Trip = {
      ...trip,
      status: 'Finalizado',
      finalKm: finalKm,
      totalDistance: totalDistance,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    try {
      await updateLocalTrip(updatedTrip as LocalTrip); // Cast to LocalTrip
      if (updatePendingCount) updatePendingCount();
      setIsFinishModalOpen(false);
      setTripToFinish(null);
      toast({ title: "Viagem finalizada localmente!" });
      await initializeTripsAndVehiclesData(); // Re-fetch
    } catch (error) {
      console.error("Error finishing local trip:", error);
      toast({ variant: "destructive", title: "Erro ao Finalizar Viagem", description: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteConfirmation = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    console.log("[Trips openDeleteConfirmation] Trip to delete:", JSON.stringify(trip));
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
      await deleteLocalDbTripAndData(tripToDelete.localId);
      if (updatePendingCount) updatePendingCount();
      toast({ title: "Viagem marcada para exclusão!" });
      await initializeTripsAndVehiclesData(); // Re-fetch
    } catch (error) {
      console.error("Error marking local trip for deletion:", error);
      toast({ variant: "destructive", title: "Erro ao Excluir", description: (error as Error).message });
    } finally {
      setIsDeleting(false);
      closeDeleteConfirmation();
    }
  };

  const getVehicleDisplay = useCallback((vehicleId: string): string => {
    const vehicle = vehicles.find(v => v.localId === vehicleId);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
  }, [vehicles]);

  const getDriverName = useCallback((driverId: string): string => {
    if (user && user.id === driverId) {
      return user.name || user.email || `Usuário (${driverId.substring(0, 6)}...)`;
    }
    if (isAdmin && drivers.length > 0) {
      const driver = drivers.find(d => d.id === driverId || d.firebaseId === driverId);
      return driver?.name || driver?.email || `Motorista (${driverId.substring(0, 6)}...)`;
    }
    return `Motorista (${driverId.substring(0,6)}...)`;
  }, [user, isAdmin, drivers]);

  const getTripDescription = useCallback((trip: Trip) => {
    const vehicleName = getVehicleDisplay(trip.vehicleId);
    const driverNamePart = isAdmin ? ` - ${getDriverName(trip.userId)}` : '';
    const basePart = trip.base && trip.base !== 'N/A' ? ` (Base: ${trip.base})` : '';
    return `${vehicleName}${driverNamePart}${basePart}`;
  }, [getVehicleDisplay, getDriverName, isAdmin]);


  const generateTripSummaryText = useCallback(async (trip: Trip): Promise<string> => {
    let summary = `Resumo da Viagem: ${trip.name}\n`;
    summary += `Status: ${trip.status}\n`;
    summary += `Veículo: ${getVehicleDisplay(trip.vehicleId)}\n`;
    summary += `Motorista: ${getDriverName(trip.userId)}\n`;
    summary += `Base: ${trip.base || 'N/A'}\n`;
    summary += `Criada em: ${trip.createdAt ? format(parseISO(trip.createdAt), 'dd/MM/yyyy HH:mm') : 'N/A'}\n`;
    if (trip.status === 'Finalizado') {
      summary += `Finalizada em: ${trip.updatedAt ? format(parseISO(trip.updatedAt), 'dd/MM/yyyy HH:mm') : 'N/A'}\n`;
      summary += `KM Final: ${trip.finalKm ? trip.finalKm + ' Km' : 'N/A'}\n`;
      summary += `Distância Total: ${trip.totalDistance ? trip.totalDistance + ' Km' : 'N/A'}\n`;
    }

    const visits = await getLocalVisits(trip.localId);
    summary += `\n--- Visitas (${visits.length}) ---\n`;
    if (visits.length > 0) {
      visits.forEach(v => {
        summary += `- Cliente: ${v.clientName}, Local: ${v.location}, KM: ${v.initialKm}, Motivo: ${v.reason}, Tipo: ${v.visitType || 'N/A'} (${v.timestamp ? format(parseISO(v.timestamp), 'dd/MM HH:mm') : 'N/A'})\n`;
      });
    } else {
      summary += "Nenhuma visita registrada.\n";
    }

    const expenses = await getLocalExpenses(trip.localId);
    summary += `\n--- Despesas (${expenses.length}) ---\n`;
    let totalExpensesValue = 0;
    if (expenses.length > 0) {
      expenses.forEach(e => {
        summary += `- Desc: ${e.description}, Valor: R$${e.value.toFixed(2)}, Tipo: ${e.expenseType} (${e.expenseDate ? format(parseISO(e.expenseDate), 'dd/MM') : 'N/A'})\n`;
        totalExpensesValue += e.value;
      });
      summary += `Total Despesas: R$${totalExpensesValue.toFixed(2)}\n`;
    } else {
      summary += "Nenhuma despesa registrada.\n";
    }

    const fuelings = await getLocalFuelings(trip.localId);
    summary += `\n--- Abastecimentos (${fuelings.length}) ---\n`;
    let totalFuelingCost = 0;
    if (fuelings.length > 0) {
      fuelings.forEach(f => {
        summary += `- Local: ${f.location}, Litros: ${f.liters.toFixed(2)}L, Preço/L: R$${f.pricePerLiter.toFixed(2)}, Total: R$${f.totalCost.toFixed(2)}, KM Odôm: ${f.odometerKm}, Tipo: ${f.fuelType} (${f.date ? format(parseISO(f.date), 'dd/MM') : 'N/A'})\n`;
        totalFuelingCost += f.totalCost;
      });
      summary += `Total Abastecimentos: R$${totalFuelingCost.toFixed(2)}\n`;
    } else {
      summary += "Nenhum abastecimento registrado.\n";
    }
    return summary;
  }, [getVehicleDisplay, getDriverName]);

  const handleOpenShareDialog = useCallback(async (tripId: string) => {
    const tripToShare = allTrips.find(t => t.localId === tripId);
    if (tripToShare) {
      setSharingTripId(tripId);
      const summary = await generateTripSummaryText(tripToShare);
      setDetailedSummaryText(summary);
    }
  }, [allTrips, generateTripSummaryText]);

  const handleCloseShareDialog = useCallback(() => {
    setSharingTripId(null);
    setDetailedSummaryText(null);
  }, []);

  const getTripSummaryKmFunction = useCallback(async (tripId: string): Promise<{ betweenVisits: number | null, firstToLast: number | null }> => {
    const visitsForSummary = await getLocalVisits(tripId);
    if (visitsForSummary.length < 2) return { betweenVisits: null, firstToLast: null };

    const sortedVisits = [...visitsForSummary].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let totalKmBetween = 0;
    for (let i = 1; i < sortedVisits.length; i++) {
        if (sortedVisits[i].initialKm && sortedVisits[i-1].initialKm) {
            totalKmBetween += (sortedVisits[i].initialKm - sortedVisits[i-1].initialKm);
        }
    }
    const firstToLastKm = sortedVisits[sortedVisits.length - 1].initialKm - sortedVisits[0].initialKm;
    return { betweenVisits: totalKmBetween > 0 ? totalKmBetween : null, firstToLast: firstToLastKm > 0 ? firstToLastKm : null };
  }, []);

  const onGenerateReport = useCallback(async (trip: Trip): Promise<TripReportData | null> => {
    try {
        const [visitsData, expensesData, fuelingsData] = await Promise.all([
            getLocalVisits(trip.localId),
            getLocalExpenses(trip.localId),
            getLocalFuelings(trip.localId)
        ]);

        return {
            ...trip,
            driverName: getDriverName(trip.userId),
            vehicleDisplay: getVehicleDisplay(trip.vehicleId),
            visits: visitsData.map(v => ({...v, id: v.localId, tripId: v.tripLocalId, userId: v.userId, visitType: v.visitType})),
            expenses: expensesData.map(e => ({...e, id: e.localId, tripId: e.tripLocalId, userId: e.userId})),
            fuelings: fuelingsData.map(f => ({...f, id: f.localId, tripId: f.tripLocalId, userId: f.userId, odometerKm: f.odometerKm, fuelType: f.fuelType})),
        };
    } catch (error) {
        console.error("Error generating report data:", error);
        toast({ variant: "destructive", title: "Erro ao Gerar Relatório", description: (error as Error).message });
        return null;
    }
  }, [getDriverName, getVehicleDisplay, toast]);


  if (authLoading || loadingTrips || loadingVehicles || (isAdmin && loadingDrivers)) {
    return <div className="flex justify-center items-center h-64"><LoadingSpinner /></div>;
  }

  if (!user && !isAdmin) {
    return <div className="text-center py-10">Por favor, faça login para ver suas viagens.</div>;
  }

  return (
    <div className="space-y-6 px-4 sm:px-0"> {/* Added mobile padding */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-semibold">
          {isAdmin ? 'Todas as Viagens' : 'Minhas Viagens'}
        </h2>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {isAdmin && drivers.length > 0 && (
                 <Select value={filterDriverId} onValueChange={setFilterDriverId}>
                    <SelectTrigger className="w-full sm:w-[200px] h-10">
                        <SelectValue placeholder="Filtrar por Motorista" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">Todos os Motoristas</SelectItem>
                        {drivers.map(driver => (
                            <SelectItem key={driver.id} value={driver.id}>
                                {driver.name || driver.email}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            <DateRangePicker date={filterDateRange} onDateChange={setFilterDateRange} />
             {user && (!user.base || user.base === 'N/A' || user.base === 'Não definida') && (
                <Card className="border-destructive bg-destructive/10 p-3 mt-4 sm:mt-0">
                    <CardDescription className="text-destructive text-xs flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" /> Você precisa ter uma base definida no seu perfil para criar viagens.
                    </CardDescription>
                </Card>
            )}
            {user && (user.base && user.base !== 'N/A' && user.base !== 'Não definida') && (
                <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                    <DialogTrigger asChild>
                    <Button onClick={() => setIsCreateModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground h-10 w-full sm:w-auto">
                        <PlusCircle className="mr-2 h-4 w-4" /> Nova Viagem
                    </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Criar Nova Viagem</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateTrip} className="grid gap-4 py-4">
                        <div className="space-y-2">
                        <Label htmlFor="vehicleId">Veículo*</Label>
                        <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId} required disabled={isSaving || loadingVehicles}>
                            <SelectTrigger id="vehicleId">
                            <SelectValue placeholder={loadingVehicles ? "Carregando..." : "Selecione o veículo"} />
                            </SelectTrigger>
                            <SelectContent>
                            {loadingVehicles ? (
                                <SelectItem value="loading_vehicles_create_trip" disabled>
                                    <div className="flex items-center justify-center py-2"><LoadingSpinner className="h-4 w-4"/></div>
                                </SelectItem>
                                ) : vehicles.length === 0 ? (
                                <SelectItem value="no_vehicles_create_trip" disabled>Nenhum veículo cadastrado</SelectItem>
                                ) : (
                                vehicles.map((vehicle) => (
                                <SelectItem key={vehicle.localId} value={vehicle.localId}>
                                    {vehicle.model} ({vehicle.licensePlate})
                                </SelectItem>
                                ))
                            )}
                            </SelectContent>
                        </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Motorista</Label>
                            <p className="text-sm text-muted-foreground">{user?.name || user?.email || 'N/A'}</p>
                        </div>
                         <div className="space-y-2">
                            <Label>Base</Label>
                            <p className="text-sm text-muted-foreground">{user?.base || 'N/A'}</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                                <PlayCircle className="h-4 w-4" /> Andamento (Automático)
                            </p>
                        </div>
                        <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline" onClick={() => { setIsCreateModalOpen(false); setSelectedVehicleId(''); }} disabled={isSaving}>Cancelar</Button>
                        </DialogClose>
                        <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving || loadingVehicles || vehicles.length === 0}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSaving ? 'Criando...' : 'Criar Viagem'}
                        </Button>
                        </DialogFooter>
                    </form>
                    </DialogContent>
                </Dialog>
            )}
        </div>
      </div>

      {allTrips.length === 0 && !loadingTrips && (
        <Card className="text-center py-10">
          <CardContent>
            <p className="text-muted-foreground">Nenhuma viagem encontrada com os filtros atuais.</p>
          </CardContent>
        </Card>
      )}

      {allTrips.length > 0 && (
        <Accordion
          type="single"
          collapsible
          className="w-full space-y-4"
          value={expandedTripId || ""}
          onValueChange={setExpandedTripId}
        >
          {allTrips.map((trip) => (
            <TripAccordionItem
              key={trip.localId}
              trip={trip}
              visitCount={visitCounts[trip.localId] || 0}
              expenseCount={expenseCounts[trip.localId] || 0}
              fuelingCount={fuelingCounts[trip.localId] || 0}
              isExpanded={expandedTripId === trip.localId}
              activeSubTab={expandedTripId === trip.localId ? activeSubTab : null}
              getVehicleDisplay={getVehicleDisplay}
              getDriverName={getDriverName}
              getTripDescription={getTripDescription}
              openFinishModal={openFinishConfirmationModal}
              currentTripForEdit={currentTripForEdit}
              isEditModalOpenForThisTrip={isEditModalOpen && currentTripForEdit?.localId === trip.localId}
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
              getTripSummaryKmFunction={getTripSummaryKmFunction}
              loadingVehicles={loadingVehicles}
              onGenerateReport={onGenerateReport}
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
          onConfirm={handleConfirmFinishTrip}
          visitsData={visitsDataForFinish}
        />
      )}
    </div>
  );
};

export default Trips;
