
// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, CheckCircle2, PlayCircle, MapPin, Wallet, Fuel, Milestone, Filter, Loader2, BarChart3, ChevronDown, TrendingUp, FileUp, Printer } from 'lucide-react'; // Added Printer
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { getDrivers as fetchFirestoreDrivers } from '@/services/firestoreService';
import {
  addLocalTrip,
  updateLocalTrip,
  deleteLocalTrip,
  getLocalTrips,
  getLocalVisits,
  getLocalExpenses,
  getLocalFuelings,
  LocalTrip,
  LocalVehicle,
  getLocalRecordsByRole,
  getLocalVehicles,
} from '@/services/localDbService';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { parseISO, startOfDay, endOfDay, format as formatDateFn } from 'date-fns';
import { formatKm } from '@/lib/utils';
import { TripAccordionItem } from './TripAccordionItem';


const VisitsComponent = dynamic(() => import('./Visits').then(mod => mod.Visits), {
  loading: () => <LoadingSpinner className="h-5 w-5" />,
  ssr: false,
});
const ExpensesComponent = dynamic(() => import('./Expenses').then(mod => mod.Expenses), {
    loading: () => <LoadingSpinner className="h-5 w-5" />,
    ssr: false,
});
const FuelingsComponent = dynamic(() => import('./Fuelings').then(mod => mod.Fuelings), {
    loading: () => <LoadingSpinner className="h-5 w-5" />,
    ssr: false,
});

export interface Trip extends Omit<LocalTrip, 'localId'> {
    id: string; // Can be firebaseId or localId
    localId: string; // Always the local IndexedDB key
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

const parseTripCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headerLine = lines[0].trim();
    const normalizeHeader = (h: string) =>
        h.trim().toLowerCase()
         .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
         .replace(/[^a-z0-9]/gi, '');

    const header = headerLine.split(',').map(normalizeHeader);
    const data = [];
    const expectedHeaders = {
        idviagem: 'idviagem', status: 'status', veiculo: 'veiculo', nome: 'nome',
        datachegada: 'datachegada', datafinalizado: 'datafinalizado', odometrochegada: 'odometrochegada'
    };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.split(',');
        const entry: Record<string, string> = {};
        let hasRequiredData = false;
        for (let j = 0; j < header.length; j++) {
            const normHeader = header[j];
            const originalValue = values[j]?.trim() || '';
            if (normHeader === expectedHeaders.idviagem) entry.idviagem = originalValue;
            else if (normHeader === expectedHeaders.status) entry.status = originalValue;
            else if (normHeader === expectedHeaders.veiculo) entry.veiculo = originalValue;
            else if (normHeader === expectedHeaders.nome) entry.nome = originalValue;
            else if (normHeader === expectedHeaders.datachegada) entry.datachegada = originalValue;
            else if (normHeader === expectedHeaders.datafinalizado) entry.datafinalizado = originalValue;
            else if (normHeader === expectedHeaders.odometrochegada) entry.odometrochegada = originalValue;
        }
        if (entry.idviagem) hasRequiredData = true;
        if (hasRequiredData) data.push(entry);
        else console.warn(`[Trip CSV Parse] Skipping line ${i + 1} due to missing 'iD.Viagem'. Line: "${line}"`);
    }
    return data;
};

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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTripForEdit, setCurrentTripForEdit] = useState<Trip | null>(null);
  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
                        const onlineDrivers = await fetchFirestoreDrivers();
                        localDriversData = onlineDrivers.map(d => ({
                            ...d, id: d.id, name: d.name || d.email || `Motorista ${d.id.substring(0,6)}`,
                            email: d.email, role: 'driver', base: d.base || 'N/A',
                        }));
                    }
                    setDrivers(localDriversData.filter(d => d.role === 'driver').map(d => ({...d, name: d.name || d.email || `ID ${d.id.substring(0,6)}...`})));
                } catch (error) {
                    console.error("Error fetching drivers:", error);
                    toast({ variant: "destructive", title: "Erro ao Carregar Motoristas", description: "Não foi possível buscar motoristas." });
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
        try {
             let localVehicles = await getLocalVehicles();
             if (localVehicles.length === 0 && navigator.onLine) {
                 try {
                     const onlineVehicles = await getLocalVehicles();
                     localVehicles = onlineVehicles.map(v => ({ ...v, localId: v.localId || v.id, id: v.id || v.localId, syncStatus: 'synced' } as LocalVehicle));
                 } catch (fetchError) {
                      console.error("Error fetching online vehicles:", fetchError);
                     toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível buscar veículos online." });
                 }
             }
             setVehicles(localVehicles);
             setLoadingVehicles(false);

            const driverIdToFilter = isAdmin && filterDriver ? filterDriver : (!isAdmin && user ? user.id : undefined);
            let localTripsData = await getLocalTrips(driverIdToFilter, filterDateRange);

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
                id: lt.firebaseId || lt.localId,
                localId: lt.localId,
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
        }
    }, [isAdmin, user?.id, toast, filterDriver, filterDateRange]);

    useEffect(() => {
        fetchLocalData();
    }, [fetchLocalData]);

    useEffect(() => {
      if (activeSubTab && allTrips.length > 0 && !expandedTripId) {
        // setExpandedTripId(allTrips[0].localId); // Commented out to prevent auto-expansion
      }
    }, [activeSubTab, allTrips, expandedTripId]);


  const getVehicleDisplay = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId || v.localId === vehicleId);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
  };

  const getDriverName = (driverId: string): string => {
     if (user && user.id === driverId) {
         return user.name || user.email || `ID: ${driverId.substring(0,6)}...`;
     }
     const driver = drivers.find(d => d.id === driverId || d.firebaseId === driverId);
     return driver?.name || driver?.email || `Motorista ${driverId.substring(0,6)}...`;
  };


   const getTripDescription = (trip: Trip): string => {
       const vehicleDisplay = getVehicleDisplay(trip.vehicleId);
       const driverName = getDriverName(trip.userId);
       const baseDisplay = trip.base ? ` (Base: ${trip.base})` : '';
       return `${vehicleDisplay} - ${driverName}${baseDisplay}`;
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

    const dateStr = new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'});
    const generatedTripName = `Viagem ${vehicleForTrip.model} (${vehicleForTrip.licensePlate}) - ${dateStr}`;
    const now = new Date().toISOString();

    const tripBase = user.role === 'admin' ? 'ALL_ADM_TRIP' : user.base;
    if (!tripBase) {
         toast({ variant: 'destructive', title: 'Erro Crítico', description: 'Base da viagem não pôde ser determinada.'});
         return;
    }


    const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus'> = {
      name: generatedTripName,
      vehicleId: vehicleForTrip.firebaseId || vehicleForTrip.localId,
      userId: user.id,
      status: 'Andamento',
      createdAt: now,
      updatedAt: now,
      base: tripBase,
      deleted: false,
    };

    setIsSaving(true);
    try {
        const localId = await addLocalTrip(newTripData);

         const newUITrip: Trip = {
            ...newTripData,
            localId,
            id: localId,
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

  const openEditModal = (tripToEdit: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    setCurrentTripForEdit(tripToEdit);
    setSelectedVehicleIdForEdit(tripToEdit.vehicleId);
    setIsEditModalOpen(true);
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
       vehicleId: vehicleForEdit.firebaseId || vehicleForEdit.localId,
       updatedAt: new Date().toISOString(),
       syncStatus: originalLocalTrip.syncStatus === 'synced' ? 'pending' : originalLocalTrip.syncStatus,
     };

    setIsSaving(true);
    try {
        await updateLocalTrip(updatedLocalTripData);

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


  const handleTripFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    toast({ title: "Importando Viagens...", description: "Processando arquivo CSV." });

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target?.result as string;
        if (!text) {
            toast({ variant: "destructive", title: "Erro ao Ler Arquivo", description: "Não foi possível ler o conteúdo do arquivo." });
            setIsSaving(false);
            return;
        }

        try {
            const parsedData = parseTripCSV(text);
            if (parsedData.length === 0) {
                toast({ variant: "destructive", title: "Arquivo Vazio ou Inválido", description: "O CSV não contém dados de viagem válidos ou está mal formatado." });
                setIsSaving(false);
                return;
            }

            let importedCount = 0;
            let skippedCount = 0;
            const skippedReasons: string[] = [];
            const localVehicles = await getLocalVehicles();
            const localDrivers = await getLocalRecordsByRole('driver');

            for (const row of parsedData) {
                const tripNameFromCSV = row['idviagem']?.trim();
                const statusFromCSV = row['status']?.trim() || 'Andamento';
                const vehicleStringFromCSV = row['veiculo']?.trim();
                const driverNameFromCSV = row['nome']?.trim();
                const createdAtFromCSV = row['datachegada']?.trim();
                const updatedAtFromCSV = row['datafinalizado']?.trim();
                const finalKmFromCSV = row['odometrochegada']?.trim();

                if (!tripNameFromCSV) {
                    skippedCount++; skippedReasons.push(`Nome da viagem (iD.Viagem) ausente.`); continue;
                }

                let vehicleId: string | undefined;
                if (vehicleStringFromCSV) {
                    const matchedVehicle = localVehicles.find(v => `${v.model} (${v.licensePlate})`.toLowerCase() === vehicleStringFromCSV.toLowerCase() || v.licensePlate.toLowerCase() === vehicleStringFromCSV.toLowerCase());
                    if (matchedVehicle) vehicleId = matchedVehicle.localId;
                    else { skippedCount++; skippedReasons.push(`Veículo "${vehicleStringFromCSV}" não encontrado para viagem "${tripNameFromCSV}".`); continue; }
                } else {
                     skippedCount++; skippedReasons.push(`Veículo ausente para viagem "${tripNameFromCSV}".`); continue;
                }

                let driverUserId: string | undefined;
                let driverBase: string | undefined;
                if (driverNameFromCSV) {
                    const matchedDriver = localDrivers.find(d => d.name?.toLowerCase() === driverNameFromCSV.toLowerCase() || d.email.toLowerCase() === driverNameFromCSV.toLowerCase());
                    if (matchedDriver) {
                        driverUserId = matchedDriver.id;
                        driverBase = matchedDriver.base;
                    } else { skippedCount++; skippedReasons.push(`Motorista "${driverNameFromCSV}" não encontrado para viagem "${tripNameFromCSV}".`); continue; }
                } else {
                    driverUserId = user?.id;
                    driverBase = user?.role === 'admin' ? 'ALL_ADM_TRIP' : user?.base;
                    if (!driverUserId) { skippedCount++; skippedReasons.push(`Motorista não especificado e usuário logado não encontrado para viagem "${tripNameFromCSV}".`); continue; }
                }

                const parseDate = (dateStr: string | undefined): string | undefined => {
                    if (!dateStr) return undefined;
                    try {
                        const parts = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                        if (parts) return new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1])).toISOString();
                        return new Date(dateStr).toISOString();
                    } catch { return undefined; }
                };

                const createdAt = parseDate(createdAtFromCSV) || new Date().toISOString();
                const status = statusFromCSV.toLowerCase() === 'finalizado' ? 'Finalizado' : 'Andamento';
                const updatedAt = status === 'Finalizado' ? (parseDate(updatedAtFromCSV) || createdAt) : createdAt;
                const finalKm = status === 'Finalizado' && finalKmFromCSV ? parseFloat(finalKmFromCSV.replace(',', '.')) : undefined;

                if (status === 'Finalizado' && (finalKm === undefined || isNaN(finalKm) || finalKm <=0)) {
                    skippedCount++; skippedReasons.push(`KM Final inválido ou ausente para viagem finalizada "${tripNameFromCSV}".`); continue;
                }

                const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus'> = {
                    name: tripNameFromCSV, vehicleId, userId: driverUserId!, status,
                    createdAt, updatedAt, base: driverBase || 'N/A',
                    finalKm, totalDistance: 0, deleted: false,
                };

                try {
                    await addLocalTrip(newTripData);
                    importedCount++;
                } catch (saveError: any) {
                    skippedCount++;
                    skippedReasons.push(`Erro ao salvar viagem "${tripNameFromCSV}": ${saveError.message}`);
                }
            }

            if (importedCount > 0) await fetchLocalData();
            toast({
                title: "Importação de Viagens Concluída",
                description: `${importedCount} viagens importadas. ${skippedCount} ignoradas. ${skippedReasons.length > 0 ? `Detalhes no console.` : ''}`,
                duration: skippedReasons.length > 0 ? 10000 : 5000
            });
            if (skippedReasons.length > 0) console.warn("[Trip CSV Import] Motivos para viagens ignoradas:", skippedReasons.join("\n"));

        } catch (parseError: any) {
            console.error("[Trip CSV Import] Erro ao processar CSV:", parseError);
            toast({ variant: "destructive", title: "Erro ao Processar CSV de Viagens", description: parseError.message });
        } finally {
            setIsSaving(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };
    reader.onerror = () => {
        toast({ variant: "destructive", title: "Erro de Leitura de Arquivo", description: "Não foi possível ler o arquivo CSV selecionado." });
        setIsSaving(false);
    };
    reader.readAsText(file);
};

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
                           <SelectItem value="loading_vehicles_create" disabled>
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
           {isAdmin && (
              <>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="h-9 w-full sm:w-auto" disabled={isSaving}>
                    <FileUp className="mr-2 h-4 w-4" /> Importar Viagens (CSV)
                </Button>
                <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleTripFileImport}
                    className="hidden"
                    disabled={isSaving}
                />
              </>
            )}
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
                openFinishModal={(tripToFinish, event) => openFinishModal(tripToFinish, event)}
                openEditModal={(tripToEdit, event) => openEditModal(tripToEdit, event)}
                currentTripForEdit={currentTripForEdit}
                isEditModalOpen={isEditModalOpen && currentTripForEdit?.localId === trip.localId}
                closeEditModal={closeEditModal}
                handleEditTripSubmit={handleEditTripSubmit}
                selectedVehicleIdForEdit={selectedVehicleIdForEdit}
                setSelectedVehicleIdForEdit={setSelectedVehicleIdForEdit}
                openDeleteConfirmation={(tripToDelete, event) => openDeleteConfirmation(tripToDelete, event)}
                tripToDelete={tripToDelete}
                isDeleteModalOpen={isDeleteModalOpen}
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
                onGenerateReport={handleGenerateTripReportData}
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

    