
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
  AlertDialogDescription as AlertDialogDescUi, // Renamed to avoid conflict
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
// No longer importing getDrivers from firestoreService here, will use localDbService's version
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
  getLocalRecordsByRole, // For fetching drivers locally
  getLocalVehicles as fetchLocalDbVehicles,
  updateLocalRecord, // For caching Firestore data
  STORE_TRIPS,
  STORE_VEHICLES,
  STORE_USERS,
  LocalUser as DbUser, // Use DbUser for local operations
} from '@/services/localDbService';
import { getTrips as fetchOnlineTrips, getVehicles as fetchOnlineVehicles, getDrivers as fetchOnlineDrivers } from '@/services/firestoreService';
import { LoadingSpinner } from '../LoadingSpinner';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { parseISO, format as formatDateFn } from 'date-fns';
import { formatKm } from '@/lib/utils';
import { TripAccordionItem } from './TripAccordionItem';
import { Textarea } from '../ui/textarea';
import { useSync } from '@/contexts/SyncContext'; // Import useSync

export interface Trip extends Omit<LocalTrip, 'localId'> {
    id: string; // Can be firebaseId or localId
    localId: string; // Always the IndexedDB key
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
  const { updatePendingCount } = useSync(); // Get updatePendingCount from SyncContext
  const isAdmin = React.useMemo(() => user?.role === 'admin', [user?.role]);

  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]); // User type from AuthContext

  const [loading, setLoading] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedVehicleIdForCreate, setSelectedVehicleIdForCreate] = useState('');

  const [currentTripForEdit, setCurrentTripForEdit] = useState<Trip | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedVehicleIdForEdit, setSelectedVehicleIdForEdit] = useState('');

  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [visitsDataForFinish, setVisitsDataForFinish] = useState<Visit[]>([]);

  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // For delete confirmation

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();

  const [filterDriver, setFilterDriver] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);

  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({});
  const [fuelingCounts, setFuelingCounts] = useState<Record<string, number>>({});

  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [detailedSummaryText, setDetailedSummaryText] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const initializeDriversData = useCallback(async () => {
        if (!isAdmin) {
            setLoadingDrivers(false);
            return;
        }
        const funcStartTime = Date.now();
        console.log(`[Trips initializeDriversData ${funcStartTime}] Admin detected, fetching drivers...`);
        setLoadingDrivers(true);
        try {
            let fetchedDriversData: DbUser[]; // Use DbUser for local data
            const cachePromises: Promise<void>[] = [];

            if (navigator.onLine) {
                console.log(`[Trips initializeDriversData ${funcStartTime}] Online: Fetching drivers from Firestore...`);
                const onlineDriversRaw = await fetchOnlineDrivers(); // Fetches DriverInfo[]
                fetchedDriversData = onlineDriversRaw.map(d => ({
                    id: d.id, // This is the Firebase UID
                    firebaseId: d.id,
                    name: d.name,
                    email: d.email,
                    username: d.username || d.email.split('@')[0],
                    role: d.role || 'driver',
                    base: d.base || 'N/A',
                    lastLogin: new Date().toISOString(), // Or preserve existing if available
                    syncStatus: 'synced',
                    deleted: false,
                } as DbUser));
                console.log(`[Trips initializeDriversData ${funcStartTime}] Fetched ${fetchedDriversData.length} drivers from Firestore. Caching...`);

                fetchedDriversData.forEach(dbUser => {
                    cachePromises.push(saveLocalUser(dbUser)
                        .catch(e => console.warn(`[Trips initializeDriversData ${funcStartTime}] Error caching driver ${dbUser.id} (email: ${dbUser.email}):`, e))
                    );
                });
            } else {
                console.log(`[Trips initializeDriversData ${funcStartTime}] Offline: Fetching drivers from LocalDB...`);
                fetchedDriversData = await getLocalRecordsByRole('driver');
            }

            if (cachePromises.length > 0) {
                await Promise.all(cachePromises);
                console.log(`[Trips initializeDriversData ${funcStartTime}] Finished attempting to cache Firestore drivers.`);
            }

            const finalDriversForUI = fetchedDriversData
                .filter(d => d.role === 'driver' && !d.deleted)
                .map(d => {
                    const { passwordHash, ...driverForUI } = d; // Exclude passwordHash from UI User type
                    return driverForUI as User; // Cast to User type from AuthContext
                })
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            setDrivers(finalDriversForUI);
            console.log(`[Trips initializeDriversData ${funcStartTime}] Set ${finalDriversForUI.length} drivers to UI state.`);
        } catch (error) {
            console.error(`[Trips initializeDriversData ${funcStartTime}] Error fetching drivers:`, error);
            toast({ variant: "destructive", title: "Erro ao Carregar Motoristas", description: (error as Error).message || "Não foi possível buscar motoristas." });
        } finally {
            setLoadingDrivers(false);
            console.log(`[Trips initializeDriversData ${funcStartTime}] Driver data initialization complete. Total time: ${Date.now() - funcStartTime}ms`);
        }
  }, [isAdmin, toast]); // Removed saveLocalUser from dependencies as it's imported

 useEffect(() => {
    const effectStartTime = Date.now();
    console.log(`[Trips Main useEffect ${effectStartTime}] Triggered. AuthLoading: ${authLoading}, User ID: ${user?.id}, IsAdmin: ${isAdmin}`);
    if (!authLoading) {
        if (isAdmin) {
            console.log(`[Trips Main useEffect ${effectStartTime}] AuthContext loaded. Admin identified. Initializing drivers data.`);
            initializeDriversData();
        } else {
            setLoadingDrivers(false); // Not admin, no need to load all drivers list
            console.log(`[Trips Main useEffect ${effectStartTime}] AuthContext loaded. Not admin. Skipping all-drivers fetch.`);
        }
    } else {
        console.log(`[Trips Main useEffect ${effectStartTime}] AuthContext still loading. Waiting...`);
    }
}, [authLoading, isAdmin, user?.id, initializeDriversData]);


 const initializeTripsAndVehiclesData = useCallback(async () => {
    const funcStartTime = Date.now();
    console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Starting... User ID: ${user?.id}, IsAdmin: ${isAdmin}, AuthLoading: ${authLoading}`);
    if (authLoading && !user) { // Strict check: if auth is loading AND there's no user yet, wait.
      console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Auth context still loading and no user. Waiting...`);
      setInitialLoading(true); // Keep initial loading true
      return;
    }
    setInitialLoading(true); // For trips and vehicles part
    setLoading(true);
    setLoadingVehicles(true);

    try {
         let localVehiclesData: LocalVehicle[];
         let localTripsData: LocalTrip[];
         const cachePromises: Promise<void>[] = [];

         if(navigator.onLine){
            console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Online: Fetching vehicles and trips from Firestore...`);
            // Fetch Vehicles
            const onlineVehiclesRaw = await fetchOnlineVehicles();
            localVehiclesData = onlineVehiclesRaw.map(v => ({ ...v, localId: String(v.id || v.firebaseId || uuidv4()), firebaseId: String(v.id || v.firebaseId), syncStatus: 'synced', deleted: v.deleted || false } as LocalVehicle));
            console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Fetched ${onlineVehiclesRaw.length} vehicles from Firestore. Caching...`);
            localVehiclesData.forEach(v => {
                cachePromises.push(updateLocalRecord(STORE_VEHICLES, v)
                    .catch(e => console.warn(`[Trips Cache Fail] Vehicle ${v.localId} (FB ID: ${v.firebaseId}):`, e))
                );
            });

            // Fetch Trips
            const driverIdToFilterForTrips = isAdmin && filterDriver ? filterDriver : (!isAdmin && user ? user.id : undefined);
            console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Effective driverIdToFilter for trip fetching: ${driverIdToFilterForTrips}`);

            if (!driverIdToFilterForTrips && !isAdmin) {
                console.warn(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] No driverIdToFilter and not admin. Skipping online trip fetch.`);
                localTripsData = [];
            } else {
                const onlineTripsRaw = await fetchOnlineTrips({ userId: driverIdToFilterForTrips, startDate: filterDateRange?.from, endDate: filterDateRange?.to });
                localTripsData = onlineTripsRaw.map(t => ({ ...t, localId: String(t.id || t.firebaseId || uuidv4()), firebaseId: String(t.id || t.firebaseId), syncStatus: 'synced', deleted: t.deleted || false } as LocalTrip));
                console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Fetched ${onlineTripsRaw.length} trips from Firestore. Caching...`);
                localTripsData.forEach(t => {
                     cachePromises.push(updateLocalRecord(STORE_TRIPS, t)
                        .catch(e => console.warn(`[Trips Cache Fail] Trip ${t.localId} (FB ID: ${t.firebaseId}):`, e))
                     );
                });
            }
         } else { // OFFLINE
            console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Offline: Fetching vehicles and trips from LocalDB...`);
            localVehiclesData = await fetchLocalDbVehicles();
            const driverIdToFilterForTripsLocal = isAdmin && filterDriver ? filterDriver : (!isAdmin && user ? user.id : undefined);
            localTripsData = await fetchLocalDbTrips(driverIdToFilterForTripsLocal, filterDateRange);
         }

         // De-duplicate vehicles before setting state
        const uniqueVehiclesMap = new Map<string, LocalVehicle>();
        localVehiclesData.forEach(v => {
            const key = String(v.firebaseId || v.localId); // Prioritize firebaseId for uniqueness
            if (!uniqueVehiclesMap.has(key) || (uniqueVehiclesMap.has(key) && !uniqueVehiclesMap.get(key)!.firebaseId && v.firebaseId)) {
                 uniqueVehiclesMap.set(key, v);
            }
        });
        const finalVehicles = Array.from(uniqueVehiclesMap.values()).filter(v => !v.deleted);
        setVehicles(finalVehicles);
        console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Set ${finalVehicles.length} non-deleted, unique vehicles to state.`);
        setLoadingVehicles(false);

        // Fetch counts and prepare UI trips
        const countsPromises = localTripsData.filter(t => !t.deleted).map(async (trip) => {
             const [visits, expenses, fuelings] = await Promise.all([
                getLocalVisits(trip.localId).catch(() => []),
                getLocalExpenses(trip.localId).catch(() => []),
                getLocalFuelings(trip.localId, 'tripLocalId').catch(() => []),
            ]);
            return {
                tripLocalId: trip.localId,
                visitCount: visits.filter(v => !v.deleted).length,
                expenseCount: expenses.filter(e => !e.deleted).length,
                fuelingCount: fuelings.filter(f => !f.deleted).length,
                visitsForFinish: visits.filter(v => !v.deleted).map(v => ({ ...v, id: v.firebaseId || v.localId, tripId: trip.localId, userId: v.userId || trip.userId, visitType: v.visitType })) as Visit[]
            };
        });

        const countsResults = await Promise.all(countsPromises);
        const newVisitCounts: Record<string, number> = {};
        const newExpenseCounts: Record<string, number> = {};
        const newFuelingCounts: Record<string, number> = {};
        let allVisitsForFinishDialogAccumulator: Visit[] = [];

        countsResults.forEach(result => {
            newVisitCounts[result.tripLocalId] = result.visitCount;
            newExpenseCounts[result.tripLocalId] = result.expenseCount;
            newFuelingCounts[result.tripLocalId] = result.fuelingCount;
            if (result.visitsForFinish && result.visitsForFinish.length > 0) {
                allVisitsForFinishDialogAccumulator = allVisitsForFinishDialogAccumulator.concat(result.visitsForFinish);
            }
        });

        setVisitCounts(newVisitCounts);
        setExpenseCounts(newExpenseCounts);
        setFuelingCounts(newFuelingCounts);
        setVisitsDataForFinish(allVisitsForFinishDialogAccumulator);

        // De-duplicate trips before setting state
        const uniqueTripsMap = new Map<string, LocalTrip>();
        localTripsData.filter(lt => !lt.deleted).forEach(lt => {
            const key = String(lt.firebaseId || lt.localId);
            if (!uniqueTripsMap.has(key) || (uniqueTripsMap.has(key) && !uniqueTripsMap.get(key)!.firebaseId && lt.firebaseId)) {
                uniqueTripsMap.set(key, lt);
            }
        });
        const finalLocalTrips = Array.from(uniqueTripsMap.values());

        const uiTrips = finalLocalTrips.map(lt => ({
            ...lt,
            id: lt.firebaseId || lt.localId, // Used for React keys mainly
            localId: lt.localId, // Guaranteed to be the IndexedDB key
        })).sort((a, b) => {
             if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
             if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
             try {
                const dateA = typeof a.createdAt === 'string' ? parseISO(a.createdAt) : (a.createdAt as Date);
                const dateB = typeof b.createdAt === 'string' ? parseISO(b.createdAt) : (b.createdAt as Date);
                return dateB.getTime() - dateA.getTime();
             } catch { return 0; }
        });
        setAllTrips(uiTrips);
        console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Set ${uiTrips.length} non-deleted, unique trips to UI state.`);

        if (cachePromises.length > 0 && navigator.onLine) {
            console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Caching ${cachePromises.length} Firestore items locally in background...`);
            await Promise.all(cachePromises).catch(cacheError => {
                console.warn(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Error caching some Firestore items locally:`, cacheError);
            });
            console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Finished attempting to cache Firestore items.`);
        }

    } catch (error) {
        console.error(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Error fetching trips and vehicles data:`, error);
        toast({ variant: "destructive", title: "Erro ao Carregar Dados", description: (error as Error).message || "Não foi possível buscar dados de viagens/veículos." });
        setAllTrips([]);
        setVehicles([]);
    } finally {
        setInitialLoading(false);
        setLoading(false);
        setLoadingVehicles(false);
        console.log(`[Trips initializeTripsAndVehiclesData ${funcStartTime}] Initialization complete. Total time: ${Date.now() - funcStartTime}ms`);
    }
}, [user?.id, isAdmin, authLoading, toast, filterDriver, filterDateRange, fetchOnlineDrivers]); // Dependencies of useCallback

useEffect(() => {
    const effectStartTime = Date.now();
    console.log(`[Trips Data useEffect ${effectStartTime}] Triggered. AuthLoading: ${authLoading}, User ID: ${user?.id}, IsAdmin: ${isAdmin}`);
    // Only run if auth context is no longer loading AND (user is present OR current session is admin)
    if (!authLoading && (user || isAdmin)) { // If auth context is ready AND we have a user OR it's an admin session
      console.log(`[Trips Data useEffect ${effectStartTime}] AuthContext loaded and user/admin confirmed. Initializing trips and vehicles data.`);
      initializeTripsAndVehiclesData();
    } else if (!authLoading && !user && !isAdmin) {
      console.log(`[Trips Data useEffect ${effectStartTime}] AuthContext loaded, but no user and not admin. Skipping data initialization.`);
      setInitialLoading(false); // Ensure loading stops
      setLoading(false);
      setLoadingVehicles(false);
      setAllTrips([]); setVehicles([]);
    } else {
      console.log(`[Trips Data useEffect ${effectStartTime}] Waiting for AuthContext to finish loading or user to be defined...`);
      setInitialLoading(true); // Keep initial loading true if auth is still processing or user not yet available
    }
}, [authLoading, user, isAdmin, filterDriver, filterDateRange, initializeTripsAndVehiclesData]); // Match deps with useCallback for initializeTripsAndVehiclesData


  const getVehicleDisplay = useCallback((vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId || v.localId === vehicleId || v.firebaseId === vehicleId);
    return vehicle ? `${vehicle.model || 'N/I'} (${vehicle.licensePlate || 'N/I'})` : 'Veículo Desconhecido';
  }, [vehicles]);

  const getDriverName = useCallback((driverId: string): string => {
     // If the current user matches the driverId, use their details first
     if (user && user.id === driverId) {
         return user.name || user.email || `ID Usuário: ${driverId.substring(0,6)}...`;
     }
     // Otherwise, try to find in the fetched drivers list (for admin view)
     const driver = drivers.find(d => d.id === driverId || d.firebaseId === driverId);
     if (driver) {
        return driver.name || driver.email || `Motorista ${driver.id.substring(0,6)}...`;
     }
     // Fallback if no match found (should be rare if data is consistent)
     return `Motorista (${driverId.substring(0,6)}...)`;
  }, [drivers, user]);


   const getTripDescription = useCallback((trip: Trip): string => {
       const vehicle = vehicles.find(v => v.id === trip.vehicleId || v.localId === trip.vehicleId || v.firebaseId === trip.vehicleId);
       // Use model only for the description part, full details in vehicle selection
       const vehicleModelDisplay = vehicle ? `${vehicle.model || 'N/I'}` : 'Veículo Desconhecido';
       const driverNamePart = getDriverName(trip.userId);
       // Only show base if it's meaningful (not default/admin placeholder)
       const baseDisplay = trip.base && trip.base !== 'N/A' && trip.base !== 'ALL_ADM_TRIP' ? ` (Base: ${trip.base})` : '';
       return `${vehicleModelDisplay} - ${driverNamePart}${baseDisplay}`;
   }, [vehicles, getDriverName]);


  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    const createStartTime = Date.now();
    console.log(`[Trips handleCreateTrip ${createStartTime}] Initiated. User ID: ${user?.id}, Selected Vehicle ID: ${selectedVehicleIdForCreate}`);
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
    // Simpler trip name: "Viagem [MODELO] ([PLACA]) - [DATA]"
    const generatedTripName = `Viagem ${vehicleForTrip.model || 'Veículo'} (${vehicleForTrip.licensePlate || 'N/I'}) - ${dateStr}`;

    const now = new Date().toISOString();
    const tripBase = user.role === 'admin' ? 'ALL_ADM_TRIP' : user.base;
    if (!tripBase) {
         toast({ variant: 'destructive', title: 'Erro Crítico', description: 'Base da viagem não pôde ser determinada.'});
         return;
    }

    const newTripData: Omit<LocalTrip, 'localId' | 'syncStatus' | 'id' | 'deleted'> = {
      name: generatedTripName,
      vehicleId: vehicleForTrip.firebaseId || vehicleForTrip.localId, // Prioritize firebaseId if available
      userId: user.id, // This is the Firebase UID or local primary key for the user
      status: 'Andamento',
      createdAt: now,
      updatedAt: now,
      base: tripBase,
    };
    console.log(`[Trips handleCreateTrip ${createStartTime}] New trip data prepared:`, newTripData);

    setIsSaving(true);
    try {
        const newLocalId = await addLocalTrip(newTripData);
        console.log(`[Trips handleCreateTrip ${createStartTime}] Local trip added with localId: ${newLocalId}`);

         const newUITrip: Trip = {
            ...(newTripData as Omit<LocalTrip, 'localId' | 'id'>), // Cast to ensure correct properties from newTripData
            localId: newLocalId,
            id: newLocalId, // For UI key, initially same as localId
            syncStatus: 'pending',
            deleted: false,
         };
        setAllTrips(prevTrips => [newUITrip, ...prevTrips].sort((a, b) => {
            if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
            if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
            try {
                const dateA = typeof a.createdAt === 'string' ? parseISO(a.createdAt) : (a.createdAt as Date);
                const dateB = typeof b.createdAt === 'string' ? parseISO(b.createdAt) : (b.createdAt as Date);
                return dateB.getTime() - dateA.getTime();
            } catch { return 0; }
        }));

        setVisitCounts(prev => ({ ...prev, [newLocalId]: 0 }));
        setExpenseCounts(prev => ({ ...prev, [newLocalId]: 0 }));
        setFuelingCounts(prev => ({ ...prev, [newLocalId]: 0 }));
        if (updatePendingCount) updatePendingCount();


        setSelectedVehicleIdForCreate('');
        setIsCreateModalOpen(false);
        toast({ title: 'Viagem criada localmente!' });
    } catch (error: any) {
        console.error(`[Trips handleCreateTrip ${createStartTime}] Error creating local trip:`, error);
        toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível criar a viagem localmente. Detalhes: ${error.message || 'Erro desconhecido'}` });
    } finally {
        setIsSaving(false);
    }
  };

  const handleOpenEditModal = (tripToEdit: Trip) => {
    console.log("[Trips handleOpenEditModal] Opening edit modal for trip. LocalID:", tripToEdit.localId, "Full trip object:", tripToEdit);
    setCurrentTripForEdit(tripToEdit); // The trip object from state, which includes localId
    setSelectedVehicleIdForEdit(tripToEdit.vehicleId); // vehicleId should be the firebaseId or localId of the vehicle
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
    const editSubmitTime = Date.now();
    console.log(`[Trips handleEditTripSubmit ${editSubmitTime}] Form submitted. Current trip for edit:`, currentTripForEdit);
    if (!currentTripForEdit || !user) {
        console.warn(`[Trips handleEditTripSubmit ${editSubmitTime}] No currentTripForEdit or user. Aborting.`);
        toast({ variant: 'destructive', title: 'Erro', description: 'Nenhuma viagem selecionada para edição ou usuário não autenticado.' });
        return;
    }

    if (!selectedVehicleIdForEdit) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
        return;
    }

    const allCurrentLocalTrips = await fetchLocalDbTrips(undefined, undefined); // Fetch all to find the specific one
    const originalLocalTrip = allCurrentLocalTrips.find(t => t.localId === currentTripForEdit.localId);

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
       ...originalLocalTrip, // Spread original local trip to preserve all its fields
       vehicleId: vehicleForEdit.firebaseId || vehicleForEdit.localId, // Update vehicleId (prioritize firebaseId)
       updatedAt: new Date().toISOString(),
       syncStatus: (originalLocalTrip.syncStatus === 'synced' && !originalLocalTrip.deleted) ? 'pending' : originalLocalTrip.syncStatus, // Mark for sync if it was synced
     };
    console.log(`[Trips handleEditTripSubmit ${editSubmitTime}] Data prepared for local update:`, updatedLocalTripData);

    setIsSaving(true);
    try {
        await updateLocalTrip(updatedLocalTripData);
         console.log(`[Trips handleEditTripSubmit ${editSubmitTime}] Local trip updated successfully. LocalID: ${updatedLocalTripData.localId}`);

        setAllTrips(prevTrips =>
             prevTrips.map(t => t.localId === currentTripForEdit.localId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } : t)
             .sort((a, b) => {
                if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                try {
                  const dateA = typeof a.createdAt === 'string' ? parseISO(a.createdAt) : (a.createdAt as Date);
                  const dateB = typeof b.createdAt === 'string' ? parseISO(b.createdAt) : (b.createdAt as Date);
                  return dateB.getTime() - dateA.getTime();
                } catch { return 0; }
            })
         );
        if (updatePendingCount) updatePendingCount();

        handleCloseEditModal();
        toast({ title: 'Viagem atualizada localmente!' });
    } catch (error: any) {
        console.error(`[Trips handleEditTripSubmit ${editSubmitTime}] Error updating local trip:`, error);
        toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível atualizar a viagem localmente. Detalhes: ${error.message || 'Erro desconhecido'}` });
    } finally {
        setIsSaving(false);
    }
  };

  const handleOpenFinishModal = async (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent accordion from toggling
    console.log("[Trips handleOpenFinishModal] Opening finish modal for trip:", trip.localId);
    try {
        // Fetch the most up-to-date visits directly from local DB for this trip
        const currentVisitsForTrip = await getLocalVisits(trip.localId);
        const activeVisits = currentVisitsForTrip.filter(v => !v.deleted).map(v => ({
            ...v,
            id: v.firebaseId || v.localId,
            tripId: trip.localId, // Ensure tripId is the localId of the trip
            userId: v.userId || trip.userId, // Ensure userId is consistent
            visitType: v.visitType,
        })) as Visit[];

        if (activeVisits.length === 0) {
            toast({
                variant: "destructive",
                title: "Finalização Bloqueada",
                description: "Não é possível finalizar a viagem pois não há visitas registradas.",
                duration: 5000,
            });
            return;
        }
        setVisitsDataForFinish(activeVisits);
        setTripToFinish(trip);
        setIsFinishModalOpen(true);
    } catch (err) {
        console.error("[Trips handleOpenFinishModal] Error fetching visits for finish dialog:", err);
        toast({ variant: "destructive", title: "Erro ao Preparar Finalização", description: "Não foi possível carregar visitas para finalizar a viagem." });
    }
};


  const confirmFinishTrip = async (tripLocalId: string, finalKm: number, totalDistance: number) => {
     const tripToUpdateInState = allTrips.find(t => t.localId === tripLocalId);
     if (!tripToUpdateInState) {
        toast({ variant: "destructive", title: "Erro", description: "Viagem não encontrada no estado da aplicação." });
        return;
     }
     console.log(`[Trips confirmFinishTrip] Finishing trip ${tripLocalId}. FinalKm: ${finalKm}, TotalDistance: ${totalDistance}`);
     setIsSaving(true);

     // Fetch the latest version from DB to ensure we're updating the correct record
     const allCurrentLocalTrips = await fetchLocalDbTrips(undefined, undefined);
     const originalLocalTripToUpdate = allCurrentLocalTrips.find(t => t.localId === tripLocalId);

     if (!originalLocalTripToUpdate) {
        toast({ variant: "destructive", title: "Erro Crítico", description: "Viagem original não encontrada no banco de dados local para finalizar." });
        setIsSaving(false);
        return;
     }

     const updatedLocalTripData: LocalTrip = {
        ...originalLocalTripToUpdate, // Use the record fetched directly from DB
        status: 'Finalizado',
        finalKm: finalKm,
        totalDistance: totalDistance,
        updatedAt: new Date().toISOString(),
        syncStatus: originalLocalTripToUpdate.syncStatus === 'synced' && !originalLocalTripToUpdate.deleted ? 'pending' : originalLocalTripToUpdate.syncStatus,
      };

    try {
        await updateLocalTrip(updatedLocalTripData);
        console.log(`[Trips confirmFinishTrip] Local trip ${tripLocalId} updated to Finalizado.`);

        setAllTrips(prevTrips =>
            prevTrips.map(t => t.localId === tripLocalId ? { ...updatedLocalTripData, id: updatedLocalTripData.firebaseId || updatedLocalTripData.localId } : t)
            .sort((a, b) => {
                if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                 try {
                    const dateA = typeof a.createdAt === 'string' ? parseISO(a.createdAt) : (a.createdAt as Date);
                    const dateB = typeof b.createdAt === 'string' ? parseISO(b.createdAt) : (b.createdAt as Date);
                    return dateB.getTime() - dateA.getTime();
                 } catch { return 0; }
            })
        );
        if (updatePendingCount) updatePendingCount();

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

    const openDeleteConfirmation = (trip: Trip, event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent accordion toggle
        console.log("[Trips openDeleteConfirmation] Opening delete confirmation for trip:", trip.localId);
        setTripToDelete(trip);
        setIsDeleteModalOpen(true);
    };

    const closeDeleteModal = () => { // Renamed from closeDeleteConfirmation for consistency
        console.log("[Trips closeDeleteModal] Closing delete confirmation.");
        setTripToDelete(null);
        setIsDeleteModalOpen(false);
    };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) {
        toast({ variant: "destructive", title: "Erro", description: "Nenhuma viagem selecionada para exclusão." });
        return;
    }
    console.log("[Trips confirmDeleteTrip] Confirming delete for trip:", tripToDelete.localId);
    setIsDeleting(true);
    try {
        await deleteLocalTrip(tripToDelete.localId); // This now marks for deletion in localDbService
        toast({ title: 'Viagem marcada para exclusão.', description: 'A exclusão será processada na próxima sincronização.' });
        closeDeleteModal();
        await initializeTripsAndVehiclesData(); // Re-fetch data to update UI
        if (updatePendingCount) updatePendingCount(); // Update pending count
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
    setSharingTripId(tripId); // Set the ID of the trip being shared
    // generateTripSummary will be called by TripAccordionItem or when needed
    generateTripSummary(tripData).then(summary => setDetailedSummaryText(summary));
  };

  const handleCloseShareDialog = () => {
    console.log("[Trips handleCloseShareDialog] Closing share dialog.");
    setSharingTripId(null); // Clear the sharing trip ID
    setDetailedSummaryText(null);
  };

  const generateTripSummary = useCallback(async (trip: Trip): Promise<string> => {
    console.log("[Trips generateTripSummary] Generating summary for trip:", trip.localId);
    const { name, status, createdAt, updatedAt, finalKm, totalDistance, vehicleId, userId, base } = trip;
    const driverName = getDriverName(userId);
    const vehicleDisplay = getVehicleDisplay(vehicleId);

    const safeFormat = (dateInput: string | Date | undefined | null, time = true) => {
        if (!dateInput) return 'N/A';
        try {
            const dateObj = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
            return formatDateFn(dateObj, time ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
        } catch { return 'Data Inválida';}
    };

    let summary = `*Resumo da Viagem: ${name}*\n\n`;
    summary += `*Status:* ${status}\n`;
    summary += `*Motorista:* ${driverName}\n`;
    summary += `*Veículo:* ${vehicleDisplay}\n`;
    if(base && base !== 'N/A' && base !== 'ALL_ADM_TRIP') summary += `*Base:* ${base}\n`;
    summary += `*Criada em:* ${safeFormat(createdAt, false)}\n`;
    if (updatedAt && updatedAt !== createdAt) { // Only show if different from creation
      summary += `*Atualizada em:* ${safeFormat(updatedAt, false)}\n`;
    }
    if (status === "Finalizado") {
      if (finalKm != null) summary += `*KM Final:* ${formatKm(finalKm)}\n`;
      if (totalDistance != null) summary += `*Distância Total:* ${formatKm(totalDistance)}\n`;
    }

    const [visits, expenses, fuelings] = await Promise.all([
      getLocalVisits(trip.localId).catch(() => []),
      getLocalExpenses(trip.localId).catch(() => []),
      getLocalFuelings(trip.localId, 'tripLocalId').catch(() => [])
    ]);

    const activeVisits = visits.filter(v => !v.deleted);
    summary += `\n--- Visitas (${activeVisits.length}) ---\n`;
    if (activeVisits.length > 0) {
      activeVisits.forEach(v => {
        summary += `- Cliente: ${v.clientName}, Tipo: ${v.visitType || 'N/A'}, Local: ${v.location}, KM: ${formatKm(v.initialKm)}, Data: ${safeFormat(v.timestamp)}\n`;
      });
    } else {
      summary += "Nenhuma visita registrada.\n";
    }

    const activeExpenses = expenses.filter(e => !e.deleted);
    summary += `\n--- Despesas (${activeExpenses.length}) ---\n`;
    if (activeExpenses.length > 0) {
      activeExpenses.forEach(e => {
        summary += `- Desc: ${e.description}, Tipo: ${e.expenseType}, Valor: ${e.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, Data: ${safeFormat(e.expenseDate, false)}\n`;
      });
    } else {
      summary += "Nenhuma despesa registrada.\n";
    }

    const activeFuelings = fuelings.filter(f => !f.deleted);
    summary += `\n--- Abastecimentos (${activeFuelings.length}) ---\n`;
    if (activeFuelings.length > 0) {
      activeFuelings.forEach(f => {
        summary += `- Data: ${safeFormat(f.date, false)}, Litros: ${f.liters.toFixed(2)}L, Preço/L: ${f.pricePerLiter.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, Total: ${f.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, KM: ${formatKm(f.odometerKm)}, Tipo: ${f.fuelType}\n`;
      });
    } else {
      summary += "Nenhum abastecimento registrado.\n";
    }
    console.log("[Trips generateTripSummary] Summary generated successfully for trip:", trip.localId);
    return summary;
  }, [getDriverName, getVehicleDisplay]);


  const getTripSummaryKmFunction = useCallback(async (tripId: string) => {
    const funcStartTime = Date.now();
    console.log(`[Trips getTripSummaryKm ${funcStartTime}] Calculating KM summary for trip: ${tripId}`);
    const currentTripData = allTrips.find(t => t.localId === tripId);
    if (!currentTripData) {
        console.warn(`[Trips getTripSummaryKm ${funcStartTime}] Trip data not found in state for ID: ${tripId}`);
        return { betweenVisits: null, firstToLast: null };
    }

    const visitsForTrip = await getLocalVisits(tripId).catch(() => []);
    const activeVisits = visitsForTrip.filter(v => !v.deleted);

    if (activeVisits.length === 0) {
        console.log(`[Trips getTripSummaryKm ${funcStartTime}] No active visits found for trip: ${tripId}`);
        let firstToLastKm = null;
        if (currentTripData.status === 'Finalizado' && currentTripData.totalDistance != null) {
            firstToLastKm = currentTripData.totalDistance;
        }
        return { betweenVisits: null, firstToLast: firstToLastKm };
    }

    const sortedVisits = [...activeVisits].sort((a,b) => {
        try {
            const dateA = typeof a.timestamp === 'string' ? parseISO(a.timestamp) : (a.timestamp as Date);
            const dateB = typeof b.timestamp === 'string' ? parseISO(b.timestamp) : (b.timestamp as Date);
            return dateA.getTime() - dateB.getTime();
        } catch { return 0; }
    });

    let betweenVisitsKm = 0;
    for (let i = 1; i < sortedVisits.length; i++) {
        if (sortedVisits[i].initialKm != null && sortedVisits[i-1].initialKm != null) { // Check for null explicitly
            const diff = sortedVisits[i].initialKm - sortedVisits[i-1].initialKm;
            if (diff > 0) {
                 betweenVisitsKm += diff;
            }
        }
    }

    let firstToLastKmCalc = null;
    if (currentTripData.status === 'Finalizado' && currentTripData.finalKm != null && sortedVisits[0]?.initialKm != null) {
      const diff = currentTripData.finalKm - sortedVisits[0].initialKm;
       if (diff >= 0) {
           firstToLastKmCalc = diff;
       } else {
           console.warn(`[Trips getTripSummaryKm ${funcStartTime}] Trip ${tripId}: Final KM (${currentTripData.finalKm}) is less than first visit KM (${sortedVisits[0].initialKm}). Setting total distance to 0.`);
           firstToLastKmCalc = 0; // Or null, depending on how you want to represent this error
       }
    } else if (currentTripData.status === 'Finalizado' && currentTripData.totalDistance != null) {
        // If totalDistance is already explicitly set on the trip (e.g. from an older calculation or import)
        firstToLastKmCalc = currentTripData.totalDistance;
    }

    const result = {
        betweenVisits: betweenVisitsKm > 0 ? betweenVisitsKm : null,
        firstToLast: firstToLastKmCalc
    };
    console.log(`[Trips getTripSummaryKm ${funcStartTime}] KM Summary for ${tripId}:`, result, `Calc time: ${Date.now() - funcStartTime}ms`);
    return result;
  }, [allTrips]); // Removed getLocalVisits if it's stable


  const handleGenerateReportDataForPrint = useCallback(async (trip: Trip): Promise<TripReportData | null> => {
    const reportStartTime = Date.now();
    console.log(`[Trips handleGenerateReportDataForPrint ${reportStartTime}] Generating report data for trip: ${trip.localId}`);
    try {
      const [visitsData, expensesData, fuelingsData] = await Promise.all([
        getLocalVisits(trip.localId).catch(() => []),
        getLocalExpenses(trip.localId).catch(() => []),
        getLocalFuelings(trip.localId, 'tripLocalId').catch(() => []),
      ]);

      const reportData: TripReportData = {
        ...trip,
        vehicleDisplay: getVehicleDisplay(trip.vehicleId),
        driverName: getDriverName(trip.userId),
        visits: visitsData.filter(v=>!v.deleted).map(v => ({...v, id: v.firebaseId || v.localId, tripId: trip.localId, userId: v.userId || trip.userId, visitType: v.visitType})) as Visit[],
        expenses: expensesData.filter(e=>!e.deleted).map(e => ({...e, id: e.firebaseId || e.localId, tripId: trip.localId, userId: e.userId || trip.userId})) as Expense[],
        fuelings: fuelingsData.filter(f=>!f.deleted).map(f => ({...f, id: f.firebaseId || f.localId, tripId: trip.localId, userId: f.userId || trip.userId, odometerKm: f.odometerKm, fuelType: f.fuelType})) as Fueling[],
      };
      console.log(`[Trips handleGenerateReportDataForPrint ${reportStartTime}] Report data generated successfully for trip: ${trip.localId}. Time: ${Date.now() - reportStartTime}ms`);
      return reportData;
    } catch (error) {
      console.error(`[Trips handleGenerateReportDataForPrint ${reportStartTime}] Error fetching data for trip report:`, error, `Time: ${Date.now() - reportStartTime}ms`);
      toast({ variant: "destructive", title: "Erro ao Gerar Relatório", description: "Não foi possível buscar todos os dados da viagem." });
      return null;
    }
  }, [getVehicleDisplay, getDriverName, toast]); // Removed getLocalVisits, getLocalExpenses, getLocalFuelings


  // Loading state for the overall component
  if (initialLoading || authLoading || (isAdmin && loadingDrivers) || loadingVehicles) {
    console.log(`[Trips Render] Main loading screen. initialLoading: ${initialLoading}, authLoading: ${authLoading}, isAdmin: ${isAdmin}, loadingDrivers: ${loadingDrivers}, loadingVehicles: ${loadingVehicles}`);
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
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
                          <SelectItem key={vehicle.localId} value={vehicle.localId}>
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
                       <Select value={filterDriver || '__all_drivers__'} onValueChange={(value) => setFilterDriver(value === '__all_drivers__' ? '' : value)} disabled={loadingDrivers || drivers.length === 0}>
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
                                       <SelectItem value="__all_drivers__">Todos os Motoristas</SelectItem>
                                       {drivers.map(driver => (
                                           <SelectItem key={driver.id || driver.firebaseId} value={driver.id || driver.firebaseId!}>{driver.name || `Motorista: ${driver.id?.substring(0,6)}...`} ({driver.base || 'Sem Base'})</SelectItem>
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
                key={trip.localId} // Use localId as it's guaranteed unique for local context
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

                currentTripForEdit={currentTripForEdit} // This is the trip currently being edited *in the modal*
                isEditModalOpenForThisTrip={isEditModalOpen && currentTripForEdit?.localId === trip.localId}
                openEditModalForThisTrip={() => handleOpenEditModal(trip)}
                closeEditModal={handleCloseEditModal}
                handleEditTripSubmit={handleEditTripSubmit}
                selectedVehicleIdForEdit={selectedVehicleIdForEdit}
                setSelectedVehicleIdForEdit={setSelectedVehicleIdForEdit}

                isDeleteModalOpenForThisTrip={isDeleteModalOpen && tripToDelete?.localId === trip.localId}
                openDeleteModalForThisTrip={(tripToDeleteFromItem, event) => openDeleteConfirmation(tripToDeleteFromItem, event)}
                closeDeleteModal={closeDeleteModal}
                confirmDeleteTrip={confirmDeleteTrip}
                tripToDelete={tripToDelete}

                isSaving={isSaving}
                isDeleting={isDeleting}
                tripToFinish={tripToFinish}
                user={user}
                isAdmin={isAdmin}
                vehicles={vehicles}
                getTripSummaryKmFunction={getTripSummaryKmFunction}
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
           onClose={() => { setIsFinishModalOpen(false); setTripToFinish(null); setVisitsDataForFinish([]); }}
           onConfirm={(id, finalKm, totalDistance) => confirmFinishTrip(tripToFinish.localId, finalKm, totalDistance)}
           visitsData={visitsDataForFinish.filter(v => v.tripId === tripToFinish.localId)}
         />
       )}
    </div>
  );
};
