
// src/components/Dashboard.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MapPinIcon as MapPinLucideIcon, Wallet, Fuel, Users, Truck, Milestone, Filter, Calendar, CarIcon, UserCheck, TrendingUp, AlertCircle } from 'lucide-react'; // Renamed Map to MapPinIcon
import { useAuth, type User as AuthContextUserType, type DriverInfo } from '@/contexts/AuthContext'; // Ensure DriverInfo is imported
import type { FirestoreTrip, FirestoreVisit, FirestoreExpense, FirestoreFueling, FirestoreVehicle } from '@/services/firestoreService';
import {
    getLocalVisits as fetchLocalDbVisits,
    getLocalExpenses as fetchLocalDbExpenses,
    getLocalFuelings as fetchLocalDbFuelings,
    getLocalTrips as fetchLocalDbTrips,
    getLocalVehicles as fetchLocalDbVehicles,
    saveLocalUser,
    updateLocalRecord,
    type LocalVehicle, type LocalExpense, type LocalFueling, type LocalTrip, type LocalVisit, getLocalRecordsByRole,
    STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES, STORE_USERS,
    type LocalUser,
    type SyncStatus,
} from '@/services/localDbService';
import { getFuelings as fetchOnlineFuelings, getVehicles as fetchOnlineVehicles, getTrips as fetchOnlineTrips, getDrivers as fetchOnlineDrivers, getExpenses as fetchOnlineExpenses, getVisits as fetchOnlineVisits } from '@/services/firestoreService';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO, format as formatDateFn } from 'date-fns';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox, MultiSelectOption } from '@/components/ui/multi-select-combobox';
import { formatKm } from '@/lib/utils';

interface DashboardProps {
    setActiveTab: (section: 'visits' | 'expenses' | 'fuelings' | null) => void;
    refreshKey: number;
}

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const safeFormatDate = (dateInput: string | { toDate: () => Date } | Date | undefined | null, formatStr: string = 'dd/MM/yyyy HH:mm'): string => {
    if (!dateInput) return 'N/A';
    try {
      if (typeof dateInput === 'string') {
        return formatDateFn(parseISO(dateInput), formatStr);
      } else if (dateInput && typeof (dateInput as any).toDate === 'function') {
        return formatDateFn((dateInput as any).toDate(), formatStr);
      } else if (dateInput instanceof Date) {
        return formatDateFn(dateInput, formatStr);
      }
      return 'Data inválida';
    } catch (error) {
      console.warn("Error formatting date in safeFormatDate:", dateInput, error);
      return 'Data inválida';
    }
  };

const safeTimestampToISOString = (timestampField: any): string => {
    if (!timestampField) {
        // Se o campo for nulo ou indefinido, podemos querer retornar uma string vazia,
        // ou um valor padrão, ou lançar um erro dependendo da lógica de negócio.
        // Para consistência com o mapeamento de dados, retornar uma string ISO de agora pode ser um fallback,
        // mas idealmente, a lógica de chamada deve lidar com campos de data ausentes.
        console.warn("Timestamp field is null or undefined in safeTimestampToISOString. Falling back to current ISO string.");
        return new Date().toISOString();
    }
    if (timestampField && typeof timestampField.toDate === 'function') {
      // É um Timestamp do Firebase
      return timestampField.toDate().toISOString();
    }
    if (timestampField instanceof Date) {
      // Já é um objeto Date
      return timestampField.toISOString();
    }
    if (typeof timestampField === 'string') {
      try {
        // Tenta parsear se for uma string, assumindo que pode ser uma string de data válida
        const date = new Date(timestampField);
        if (isNaN(date.getTime())) {
            // Se o parse resultar em Data Inválida, loga e retorna um fallback
            console.warn("Could not parse date string during safeTimestampToISOString, resulted in Invalid Date:", timestampField);
            return new Date().toISOString(); // Fallback para data atual
        }
        return date.toISOString();
      } catch (e) {
        console.warn("Could not parse date string during safeTimestampToISOString (exception):", timestampField, e);
        // Fallback para strings não parseáveis ou outros tipos
        return new Date().toISOString();
      }
    }
    // Se não for nenhum dos tipos esperados, loga e retorna um fallback
    console.warn("Timestamp field is not a Firebase Timestamp, Date, or recognized string:", timestampField, ". Falling back to current ISO string.");
    return new Date().toISOString(); // Fallback
};


const ALL_DRIVERS_FILTER_VALUE = "__all_drivers__";

export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab, refreshKey }) => {
    const { user, loading: authContextLoading } = useAuth();
    const isAdmin = useMemo(() => user?.role === 'admin', [user]);
    const ownerUserId = user?.id;

    const [trips, setTrips] = useState<LocalTrip[]>([]);
    const [visits, setVisits] = useState<LocalVisit[]>([]);
    const [expenses, setExpenses] = useState<LocalExpense[]>([]);
    const [fuelings, setFuelings] = useState<LocalFueling[]>([]);
    const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
    const [drivers, setDrivers] = useState<AuthContextUserType[]>([]);

    const [filterDriverId, setFilterDriverId] = useState<string>('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    const [loadingTrips, setLoadingTrips] = useState(true);
    const [loadingVisits, setLoadingVisits] = useState(true);
    const [loadingExpenses, setLoadingExpenses] = useState(true);
    const [loadingFuelings, setLoadingFuelings] = useState(true);
    const [loadingVehicles, setLoadingVehicles] = useState(true);
    const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);
    const [initialLoading, setInitialLoading] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);

    const [selectedVehicleIdsForPerf, setSelectedVehicleIdsForPerf] = useState<string[]>([]);
    const [vehiclePerformanceDateRange, setVehiclePerformanceDateRange] = useState<DateRange | undefined>(undefined);

    const initializeDashboardData = useCallback(async () => {
        const initFetchTime = Date.now();
        console.log(`[Dashboard initializeDashboardData ${initFetchTime} - RefreshKey: ${refreshKey}] Initializing... AuthLoading: ${authContextLoading}, User: ${user?.id}, IsAdmin: ${isAdmin}`);


        if (authContextLoading) {
            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Auth context still loading. Waiting...`);
            return;
        }

        if (!user && !isAdmin) {
            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Auth context loaded, but no user and not admin. Clearing data and stopping dashboard loading.`);
            setTrips([]); setVisits([]); setExpenses([]); setFuelings([]); setVehicles([]); setDrivers([]);
            setInitialLoading(false);
            setDataError(null);
            return;
        }

        setInitialLoading(true);
        setDataError(null);

        const driverIdToFilter = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : undefined);
        const filterContext = isAdmin ? (filterDriverId ? `Driver: ${filterDriverId}` : 'All Drivers') : (user ? `User: ${user.id}` : 'No User Context');
        console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Effective driverIdToFilter for Firestore: ${driverIdToFilter}, FilterContext: ${filterContext}`);

        if (!driverIdToFilter && !isAdmin) {
            console.warn(`[Dashboard initializeDashboardData ${initFetchTime}] No driverIdToFilter for non-admin, and not admin. Firestore fetch for user-specific data (trips, visits, expenses, fuelings) will be skipped.`);
            setTrips([]); setVisits([]); setExpenses([]); setFuelings([]);
        }

        const fetchPromises: Promise<any>[] = [];
        const cachePromises: Promise<void>[] = [];

        setLoadingTrips(true); setLoadingVisits(true); setLoadingExpenses(true); setLoadingFuelings(true); setLoadingVehicles(true);
        if (isAdmin) setLoadingDrivers(true);

        try {
            if (navigator.onLine) {
                console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Online: Fetching all data from Firestore.`);

                if(driverIdToFilter || isAdmin) {
                    const tripsPromise = fetchOnlineTrips({ userId: driverIdToFilter, startDate: dateRange?.from, endDate: dateRange?.to })
                        .then((data: FirestoreTrip[]) => { 
                            const mappedData: LocalTrip[] = data.map(ft => ({ 
                                id: ft.id, 
                                localId: ft.id, 
                                firebaseId: ft.id,
                                name: ft.name || `Viagem ${ft.id.substring(0,6)}`,
                                vehicleId: ft.vehicleId,
                                userId: ft.userId,
                                status: ft.status || 'Andamento',
                                createdAt: safeTimestampToISOString(ft.createdAt),
                                updatedAt: safeTimestampToISOString(ft.updatedAt),
                                base: ft.base || (user?.role === 'admin' ? 'ALL_ADM_TRIP' : user?.base || 'N/A'),
                                finalKm: ft.finalKm,
                                totalDistance: ft.totalDistance,
                                syncStatus: 'synced' as SyncStatus,
                                deleted: false,
                            }));
                            setTrips(mappedData);
                            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineTrips (${mappedData.length}) for ${driverIdToFilter || 'all'}. Caching...`);
                            mappedData.forEach(t => {
                                cachePromises.push(updateLocalRecord(STORE_TRIPS, t).catch(e => console.warn(`[Dashboard Cache Fail] Trip ${t.id}:`, e)));
                            });
                            return mappedData;
                        })
                        .finally(() => setLoadingTrips(false));
                    fetchPromises.push(tripsPromise);
                } else {
                    setLoadingTrips(false); setTrips([]);
                }

                if(driverIdToFilter || isAdmin) {
                    const visitsPromise = fetchOnlineVisits({ userId: driverIdToFilter, startDate: dateRange?.from, endDate: dateRange?.to })
                        .then((data: FirestoreVisit[]) => { 
                             const mappedData: LocalVisit[] = data.map(fv => ({ 
                                id: fv.id, 
                                localId: fv.id, 
                                firebaseId: fv.id,
                                tripLocalId: fv.tripId, 
                                userId: fv.userId || ownerUserId!,
                                clientName: fv.clientName,
                                location: fv.location,
                                latitude: fv.latitude,
                                longitude: fv.longitude,
                                initialKm: fv.initialKm,
                                reason: fv.reason,
                                timestamp: safeTimestampToISOString(fv.timestamp),
                                visitType: fv.visitType || 'N/A',
                                syncStatus: 'synced' as SyncStatus,
                                deleted: false,
                            }));
                            setVisits(mappedData);
                            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineVisits (${mappedData.length}) for ${driverIdToFilter || 'all'}. Caching...`);
                            mappedData.forEach(v => {
                                cachePromises.push(updateLocalRecord(STORE_VISITS, v).catch(e => console.warn(`[Dashboard Cache Fail] Visit ${v.id}:`, e)));
                            });
                            return mappedData;
                        })
                        .finally(() => setLoadingVisits(false));
                    fetchPromises.push(visitsPromise);
                } else {
                     setLoadingVisits(false); setVisits([]);
                }

                if(driverIdToFilter || isAdmin) {
                    const expensesPromise = fetchOnlineExpenses({ userId: driverIdToFilter, startDate: dateRange?.from, endDate: dateRange?.to })
                        .then((data: FirestoreExpense[]) => { 
                            const mappedData: LocalExpense[] = data.map(fe => ({ 
                                id: fe.id, 
                                localId: fe.id, 
                                firebaseId: fe.id,
                                tripLocalId: fe.tripId,
                                userId: fe.userId || ownerUserId!,
                                description: fe.description,
                                value: fe.value,
                                expenseType: fe.expenseType,
                                expenseDate: safeTimestampToISOString(fe.expenseDate),
                                timestamp: safeTimestampToISOString(fe.timestamp),
                                comments: fe.comments,
                                receiptFilename: fe.receiptFilename,
                                receiptUrl: fe.receiptUrl,
                                receiptPath: fe.receiptPath,
                                syncStatus: 'synced' as SyncStatus,
                                deleted: false,
                            }));
                            setExpenses(mappedData);
                            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineExpenses (${mappedData.length}) for ${driverIdToFilter || 'all'}. Caching...`);
                            mappedData.forEach(e_item => {
                                cachePromises.push(updateLocalRecord(STORE_EXPENSES, e_item).catch(er => console.warn(`[Dashboard Cache Fail] Expense ${e_item.id}:`, er)));
                            });
                            return mappedData;
                        })
                        .finally(() => setLoadingExpenses(false));
                    fetchPromises.push(expensesPromise);
                } else {
                    setLoadingExpenses(false); setExpenses([]);
                }

                if(driverIdToFilter || isAdmin) {
                    const fuelingsOnlinePromise = fetchOnlineFuelings({ userId: driverIdToFilter, startDate: dateRange?.from, endDate: dateRange?.to })
                        .then((data: FirestoreFueling[]) => { 
                             const mappedData: LocalFueling[] = data.map(ff => ({ 
                                id: ff.id, 
                                localId: ff.id, 
                                firebaseId: ff.id,
                                tripLocalId: ff.tripId!, 
                                userId: ff.userId || ownerUserId!,
                                vehicleId: ff.vehicleId,
                                date: safeTimestampToISOString(ff.date),
                                liters: ff.liters,
                                pricePerLiter: ff.pricePerLiter,
                                totalCost: ff.totalCost,
                                location: ff.location,
                                comments: ff.comments,
                                odometerKm: ff.odometerKm,
                                fuelType: ff.fuelType,
                                receiptFilename: ff.receiptFilename,
                                receiptUrl: ff.receiptUrl,
                                receiptPath: ff.receiptPath,
                                syncStatus: 'synced' as SyncStatus,
                                deleted: false,
                            }));
                            setFuelings(mappedData);
                            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineFuelings (${mappedData.length}) for ${driverIdToFilter || 'all'}. Caching...`);
                            mappedData.forEach(f => {
                                cachePromises.push(updateLocalRecord(STORE_FUELINGS, f).catch(er => console.warn(`[Dashboard Cache Fail] Fueling ${f.id}:`, er)));
                            });
                            return mappedData;
                        })
                        .finally(() => setLoadingFuelings(false));
                    fetchPromises.push(fuelingsOnlinePromise);
                } else {
                     setLoadingFuelings(false); setFuelings([]);
                }

                const vehiclesPromise = fetchOnlineVehicles()
                    .then((data: FirestoreVehicle[]) => { 
                        const mappedData: LocalVehicle[] = data.map(fv => ({ 
                            id: fv.id, 
                            localId: fv.id, 
                            firebaseId: fv.id,
                            model: fv.model,
                            year: fv.year,
                            licensePlate: fv.licensePlate,
                            syncStatus: 'synced' as SyncStatus,
                            deleted: fv.deleted || false,
                        }));
                        setVehicles(mappedData);
                        console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineVehicles (${mappedData.length}). Caching...`);
                        mappedData.forEach(v => {
                            cachePromises.push(updateLocalRecord(STORE_VEHICLES, v).catch(e => console.warn(`[Dashboard Cache Fail] Vehicle ${v.id}:`, e)));
                        });
                        return mappedData;
                    })
                    .finally(() => setLoadingVehicles(false));
                fetchPromises.push(vehiclesPromise);

                if (isAdmin) {
                    const driversPromise = fetchOnlineDrivers()
                        .then((data: DriverInfo[]) => { 
                            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineDrivers (${data.length}). Caching...`);
                            const authContextUsers: AuthContextUserType[] = data.map(d => ({
                                id: d.id,
                                firebaseId: d.firebaseId || d.id, 
                                name: d.name,
                                email: d.email,
                                username: d.username,
                                role: d.role || 'driver',
                                base: d.base || 'N/A',
                                lastLogin: new Date().toISOString() 
                            }));
                            setDrivers(authContextUsers);

                            const localUserCachePromises: Promise<void>[] = data.map(d => {
                                const userToCache: LocalUser = { 
                                    id: d.id, 
                                    firebaseId: d.firebaseId || d.id,
                                    name: d.name,
                                    email: d.email,
                                    username: d.username,
                                    role: d.role || 'driver',
                                    base: d.base || 'N/A',
                                    lastLogin: new Date().toISOString(),
                                    passwordHash: '', 
                                    syncStatus: 'synced' as SyncStatus,
                                    deleted: false,
                                };
                                return saveLocalUser(userToCache).catch(e => console.warn(`[Dashboard Cache Fail] Driver ${d.id}:`, e));
                            });
                            cachePromises.push(...localUserCachePromises);
                            return data;
                        })
                        .finally(() => setLoadingDrivers(false));
                    fetchPromises.push(driversPromise);
                } else {
                    setLoadingDrivers(false);
                }

            } else {
                console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Offline: Fetching all data from LocalDB.`);
                const localDriverId = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : undefined);

                fetchPromises.push(fetchLocalDbTrips(localDriverId, dateRange).then(data => { setTrips(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localTrips (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingTrips(false)));
                fetchPromises.push(fetchLocalDbVisits(localDriverId).then(data => { setVisits(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localVisits (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingVisits(false)));
                fetchPromises.push(fetchLocalDbExpenses(localDriverId).then(data => { setExpenses(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localExpenses (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingExpenses(false)));
                fetchPromises.push(fetchLocalDbFuelings(localDriverId).then(data => { setFuelings(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localFuelings (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingFuelings(false)));

                fetchPromises.push(fetchLocalDbVehicles().then(data => { setVehicles(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localVehicles (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingVehicles(false)));
                if (isAdmin) {
                    fetchPromises.push(getLocalRecordsByRole('driver').then((data: LocalUser[]) => { 
                        setDrivers(data.map(d => ({
                            id: d.id,
                            firebaseId: d.firebaseId,
                            name: d.name,
                            email: d.email,
                            username: d.username,
                            role: d.role,
                            base: d.base,
                            lastLogin: d.lastLogin
                        } as AuthContextUserType)));
                        console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localDrivers (${data.length}):`, data.slice(0,2)); return data;
                    }).finally(() => setLoadingDrivers(false)));
                } else {
                     setLoadingDrivers(false);
                }
            }

            await Promise.all(fetchPromises);
            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] All primary data fetches complete.`);

            if (navigator.onLine && cachePromises.length > 0) {
                console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Caching ${cachePromises.length} Firestore items locally in background...`);
                await Promise.all(cachePromises).catch(cacheError => {
                    console.warn(`[Dashboard initializeDashboardData ${initFetchTime}] Error caching Firestore data locally:`, cacheError);
                });
                console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Finished attempting to cache Firestore items.`);
            }

        } catch (error: any) {
            console.error(`[Dashboard initializeDashboardData ${initFetchTime}] Error fetching initial data:`, error);
            setDataError(`Não foi possível buscar dados iniciais. Detalhe: ${error.message}`);
        } finally {
            setLoadingTrips(false); setLoadingVisits(false); setLoadingExpenses(false); setLoadingFuelings(false); setLoadingVehicles(false); if(isAdmin) setLoadingDrivers(false);
            setInitialLoading(false);
            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Initialization complete. Total time: ${Date.now() - initFetchTime}ms`);
        }
    }, [isAdmin, user, filterDriverId, dateRange, authContextLoading, refreshKey, ownerUserId]);

    useEffect(() => {
        if (!authContextLoading && (user || isAdmin)) {
            console.log(`[Dashboard useEffect for data fetch - RefreshKey: ${refreshKey}] AuthContext loaded. User: ${!!user}, IsAdmin: ${isAdmin}. Initializing dashboard data.`);
            initializeDashboardData();
        } else if (!authContextLoading && !user && !isAdmin) {
            console.log("[Dashboard useEffect for data fetch] AuthContext loaded, but no user and not admin. Skipping dashboard data initialization.");
            setInitialLoading(false);
            setTrips([]); setVisits([]); setExpenses([]); setFuelings([]); setVehicles([]); setDrivers([]);
        } else {
            console.log("[Dashboard useEffect for data fetch] Waiting for AuthContext to finish loading before initializing dashboard data.");
        }
    }, [authContextLoading, user, isAdmin, filterDriverId, dateRange, initializeDashboardData, refreshKey]);


    const getDriverName = useCallback((driverId: string) => {
        const driver = drivers.find(d => (d.firebaseId || d.id) === driverId);
        return driver?.name || driver?.email || `Motorista (${driverId.substring(0, 6)}...)`;
    }, [drivers]);

    const getVehicleName = useCallback((vehicleId: string | undefined) => {
        if (!vehicleId) return 'Veículo Desconhecido';
        const vehicle = vehicles.find(v => (v.firebaseId || v.localId) === vehicleId);
        return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
    }, [vehicles]);

    const getEffectiveVehicleId = (vehicle: LocalVehicle): string => {
        if (vehicle.firebaseId) return `fb-${vehicle.firebaseId}`;
        if (vehicle.localId) return `local-${vehicle.localId}`;
        console.warn("[Dashboard getEffectiveVehicleId] Vehicle found with no firebaseId or localId:", vehicle);
        return `unknown-${Math.random().toString(36).substring(2, 9)}`;
    };

    const summaryData = useMemo(() => {
        const activeTripsCount = trips.filter(trip => trip.status === 'Andamento').length;
        const totalVisitsCount = visits.length;
        const totalDistanceSum = trips.filter(trip => trip.status === 'Finalizado' && typeof trip.totalDistance === 'number').reduce((sum, trip) => sum + (trip.totalDistance || 0), 0);
        const totalExpensesValueSum = expenses.reduce((sum, expense) => sum + expense.value, 0);
        const totalFuelingCostSum = fuelings.reduce((sum, fueling) => sum + fueling.totalCost, 0);

        return {
            activeTrips: activeTripsCount,
            totalVisits: totalVisitsCount,
            totalDistance: totalDistanceSum,
            totalExpensesValue: totalExpensesValueSum,
            totalFuelingCost: totalFuelingCostSum,
            totalVehicles: vehicles.length,
            totalDrivers: drivers.length,
            filterContext: isAdmin ? (filterDriverId ? `Motorista: ${getDriverName(filterDriverId)}` : 'Todos os Motoristas') : (user ? `Motorista: ${user.name || user.email}` : 'N/A'),
        };
    }, [isAdmin, filterDriverId, drivers, expenses, fuelings, trips, vehicles, visits, user, getDriverName]);


    const adminDashboardData = useMemo(() => {
        if (!isAdmin || user?.email !== 'grupo2irmaos@grupo2irmaos.com.br' || loadingDrivers || loadingVisits || loadingTrips || loadingVehicles || loadingFuelings) {
            return {
                adminVisitsTableData: [],
                vehiclePerformance: [],
            };
        }

        const tripDetailsMap = new Map(trips.map(trip => [trip.localId || trip.firebaseId, { driverName: getDriverName(trip.userId), vehicleName: getVehicleName(trip.vehicleId), userId: trip.userId }]));

        let currentVisitsSource = [...visits];
        if (dateRange?.from) {
            const fromDate = dateRange.from;
            const toDate = dateRange.to || new Date();
            currentVisitsSource = currentVisitsSource.filter(visit => {
                try {
                    const visitDate = visit.timestamp instanceof Date ? visit.timestamp : parseISO(visit.timestamp);
                    return isWithinInterval(visitDate, { start: fromDate, end: toDate });
                } catch { return false; }
            });
        }

        const adminVisitsTableData = currentVisitsSource.map(visit => {
            const tripDetail = tripDetailsMap.get(visit.tripLocalId);
            return {
                id: String(visit.firebaseId || visit.localId || visit.id),
                date: safeFormatDate(visit.timestamp, 'dd/MM/yyyy HH:mm'),
                driverName: tripDetail?.driverName || getDriverName(visit.userId) || 'Desconhecido',
                kmAtVisit: formatKm(visit.initialKm),
                reason: visit.reason,
                visitType: visit.visitType || 'N/A',
                clientName: visit.clientName,
                city: visit.location,
                vehicleName: tripDetail?.vehicleName || 'Desconhecido',
            };
        }).sort((a,b) => {
            try { return new Date(b.date.split(' ')[0].split('/').reverse().join('-') + 'T' + b.date.split(' ')[1]).getTime() - new Date(a.date.split(' ')[0].split('/').reverse().join('-') + 'T' + a.date.split(' ')[1]).getTime(); } catch { return 0; }
        }).slice(0, 10);

        const uniqueVehiclesForPerf = Array.from(new Map(vehicles.filter(v => v.localId || v.firebaseId).map(v => [getEffectiveVehicleId(v), v])).values());
        console.log(`[Dashboard adminDashboardData] uniqueVehiclesForPerf for perf table:`, uniqueVehiclesForPerf.map(v => ({effId: getEffectiveVehicleId(v), model: v.model}) ));

        let filteredVehiclesForPerfTable = uniqueVehiclesForPerf;
        if (selectedVehicleIdsForPerf.length > 0) {
            const selectedIdsSet = new Set(selectedVehicleIdsForPerf);
            filteredVehiclesForPerfTable = uniqueVehiclesForPerf.filter(v => selectedIdsSet.has(getEffectiveVehicleId(v)));
        }

        const uniqueVehiclesForPerfTableFinal = Array.from(new Map(filteredVehiclesForPerfTable.map(v => [getEffectiveVehicleId(v), v])).values());
        console.log(`[Dashboard adminDashboardData] uniqueVehiclesForPerfTableFinal (after multi-select filter AND de-duplication):`, uniqueVehiclesForPerfTableFinal.map(v => ({effId: getEffectiveVehicleId(v), model: v.model}) ));


        const vehiclePerformanceCalc = uniqueVehiclesForPerfTableFinal.map(vehicle => {
            const vehicleIdToMatch = getEffectiveVehicleId(vehicle);

            let vehicleFuelings = fuelings.filter(f => {
                const vehicleForFueling = vehicles.find(v =>
                    (v.localId && v.localId === f.vehicleId) ||
                    (v.firebaseId && v.firebaseId === f.vehicleId)
                );
                if (!vehicleForFueling) {
                    return false;
                }
                return getEffectiveVehicleId(vehicleForFueling) === vehicleIdToMatch;
            });


            if (vehiclePerformanceDateRange?.from) {
                const vFrom = vehiclePerformanceDateRange.from;
                const vTo = vehiclePerformanceDateRange.to || new Date();
                vehicleFuelings = vehicleFuelings.filter(f => {
                    try {
                        const fuelingDate = f.date instanceof Date ? f.date : parseISO(f.date);
                        return isWithinInterval(fuelingDate, { start: vFrom, end: vTo });
                    } catch { return false; }
                });
            }

            vehicleFuelings.sort((a, b) => {
                 try {
                    const dateA = a.date instanceof Date ? a.date : parseISO(a.date);
                    const dateB = b.date instanceof Date ? b.date : parseISO(b.date);
                    return dateA.getTime() - dateB.getTime();
                } catch { return 0; }
            });

            let totalKm = 0;
            if (vehicleFuelings.length > 1) {
                const firstOdometer = vehicleFuelings[0].odometerKm;
                const lastOdometer = vehicleFuelings[vehicleFuelings.length - 1].odometerKm;
                if (typeof firstOdometer === 'number' && typeof lastOdometer === 'number' && lastOdometer > firstOdometer) {
                    totalKm = lastOdometer - firstOdometer;
                }
            }
            const totalLiters = vehicleFuelings.reduce((sum, f) => sum + f.liters, 0);
            const totalFuelingCost = vehicleFuelings.reduce((sum, f) => sum + f.totalCost, 0);
            const avgKmPerLiter = totalLiters > 0 && totalKm > 0 ? totalKm / totalLiters : 0;
            const avgCostPerKm = totalKm > 0 ? totalFuelingCost / totalKm : 0;
            const lastFueling = vehicleFuelings.length > 0 ? vehicleFuelings[vehicleFuelings.length - 1] : null;

            return {
                id: vehicleIdToMatch,
                name: `${vehicle.model} (${vehicle.licensePlate})`,
                totalKm,
                totalLiters,
                totalFuelingCost,
                avgKmPerLiter,
                avgCostPerKm,
                lastFuelingDate: lastFueling ? safeFormatDate(lastFueling.date, 'dd/MM/yyyy') : 'N/A',
                lastFuelingUnitPrice: lastFueling ? lastFueling.pricePerLiter : 0,
                lastFuelingType: lastFueling ? lastFueling.fuelType : 'N/A',
            };
        });

        const finalUniqueVehiclePerformance = Array.from(
            new Map(vehiclePerformanceCalc.map(item => [item.id, item])).values()
        );

        const idsForTableKeys = finalUniqueVehiclePerformance.map(vp => vp.id);
        const duplicateIdsInFinalList = idsForTableKeys.filter((id, index) => idsForTableKeys.indexOf(id) !== index);
        if (duplicateIdsInFinalList.length > 0) {
            console.warn(
                "[Dashboard adminDashboardData] CRITICAL: Duplicate IDs found in finalUniqueVehiclePerformance just before render. This should not happen. Duplicates:",
                duplicateIdsInFinalList,
                "Full list of IDs for table:", idsForTableKeys,
                "Source `vehicles` state (first 5):", vehicles.slice(0,5).map(v => ({fid: v.firebaseId, lid: v.localId, model:v.model}))
            );
        }

        return {
            adminVisitsTableData,
            vehiclePerformance: finalUniqueVehiclePerformance,
        };
    }, [
        isAdmin, user,
        trips, visits, expenses, fuelings, vehicles, drivers,
        loadingDrivers, loadingVisits, loadingTrips, loadingVehicles, loadingFuelings,
        getDriverName, getVehicleName,
        selectedVehicleIdsForPerf, vehiclePerformanceDateRange, dateRange
    ]);

    const vehicleOptions: MultiSelectOption[] = useMemo(() => {
        const uniqueVehicleMap = new Map<string, LocalVehicle>();
        vehicles.forEach(v => {
            const id = getEffectiveVehicleId(v);
            if (id && !uniqueVehicleMap.has(id)) {
                uniqueVehicleMap.set(id, v);
            }
        });
        return Array.from(uniqueVehicleMap.values()).map(v => ({
            value: getEffectiveVehicleId(v),
            label: `${v.model} (${v.licensePlate})`,
            icon: CarIcon
        }));
    }, [vehicles]);


    if (authContextLoading || initialLoading) {
        return <div className="flex h-[calc(100vh-200px)] items-center justify-center"><LoadingSpinner /></div>;
    }

    if (dataError) {
        return (
          <div className="container mx-auto p-4 md:p-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro ao Carregar Dados</AlertTitle>
              <AlertDescription>{dataError}</AlertDescription>
            </Alert>
          </div>
        );
      }

    if (!user) {
        return (
            <div className="container mx-auto p-4 md:p-6">
                <p>Por favor, faça login para ver o dashboard.</p>
            </div>
        );
    }


    const summaryCards = [
        { title: "Viagens Ativas", value: summaryData.activeTrips, icon: Truck, description: summaryData.filterContext },
        { title: "Total de Visitas", value: summaryData.totalVisits, icon: MapPinLucideIcon, description: summaryData.filterContext },
        { title: "Distância Percorrida", value: `${formatKm(summaryData.totalDistance)}`, icon: Milestone, description: `Viagens finalizadas (${summaryData.filterContext})` },
        { title: "Valor Total Despesas", value: formatCurrency(summaryData.totalExpensesValue), icon: Wallet, description: `${expenses.length} registros (${summaryData.filterContext})` },
        { title: "Custo Total Abastecimento", value: formatCurrency(summaryData.totalFuelingCost), icon: Fuel, description: `${fuelings.length} registros (${summaryData.filterContext})` },
        { title: "Veículos", value: summaryData.totalVehicles, icon: CarIcon, description: "Total de veículos na frota" },
        ...(isAdmin ? [{ title: "Motoristas", value: summaryData.totalDrivers, icon: Users, description: "Total de motoristas ativos" }] : [])
    ];


    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><Filter className="h-5 w-5" /> Filtros Globais do Painel</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    {isAdmin && (
                        <div className="space-y-1.5">
                            <Label htmlFor="driverFilterGlobal">Filtrar por Motorista (Global)</Label>
                            <Select
                                value={filterDriverId || ALL_DRIVERS_FILTER_VALUE}
                                onValueChange={(value) => setFilterDriverId(value === ALL_DRIVERS_FILTER_VALUE ? '' : value)}
                                disabled={loadingDrivers || drivers.length === 0}
                            >
                                <SelectTrigger id="driverFilterGlobal">
                                    <SelectValue placeholder={loadingDrivers ? "Carregando..." : (drivers.length === 0 ? "Nenhum motorista" : "Todos os Motoristas")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {loadingDrivers ? <SelectItem value="loading_drivers_global" disabled><LoadingSpinner className="h-4 w-4 inline-block mr-2" />Carregando...</SelectItem> :
                                        <>
                                            <SelectItem value={ALL_DRIVERS_FILTER_VALUE}>Todos os Motoristas</SelectItem>
                                            {drivers.map(driver => (
                                                <SelectItem key={driver.id || driver.firebaseId} value={driver.id || driver.firebaseId!}>{driver.name || driver.email}</SelectItem>
                                            ))}
                                        </>
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label>Filtrar por Data (Global)</Label>
                        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {summaryCards.map(card => (
                    <Card key={card.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                            <card.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{card.value}</div>
                            <p className="text-xs text-muted-foreground">{card.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {isAdmin && user.email === 'grupo2irmaos@grupo2irmaos.com.br' && (
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Painel do Administrador</h2>
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Dashboard do Administrador</AlertTitle>
                        <AlertDescription>
                            Este é um painel com visualizações de dados agregados. Os filtros globais acima se aplicam a estas seções.
                        </AlertDescription>
                    </Alert>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><MapPinLucideIcon className="h-5 w-5" /> Lista de Visitas Recentes</CardTitle>
                            <CardDescription>As últimas 10 visitas registradas, considerando os filtros globais.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingVisits || loadingTrips ? <LoadingSpinner /> : adminDashboardData.adminVisitsTableData.length === 0 ? (
                                <p className="text-muted-foreground">Nenhuma visita para exibir com os filtros atuais.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data</TableHead>
                                            <TableHead>Motorista</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead>Cidade</TableHead>
                                            <TableHead>Veículo</TableHead>
                                            <TableHead>KM</TableHead>
                                            <TableHead>Motivo</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {adminDashboardData.adminVisitsTableData.map(visit => (
                                            <TableRow key={visit.id}>
                                                <TableCell>{visit.date}</TableCell>
                                                <TableCell>{visit.driverName}</TableCell>
                                                <TableCell>{visit.clientName}</TableCell>
                                                <TableCell>{visit.visitType}</TableCell>
                                                <TableCell>{visit.city}</TableCell>
                                                <TableCell>{visit.vehicleName}</TableCell>
                                                <TableCell>{visit.kmAtVisit}</TableCell>
                                                <TableCell className="max-w-xs truncate" title={visit.reason}>{visit.reason}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                 <div className="flex-1">
                                    <CardTitle className="flex items-center gap-2"><CarIcon className="h-5 w-5" /> Performance de Veículos</CardTitle>
                                    <CardDescription>Dados de performance por veículo, considerando filtros globais e específicos abaixo.</CardDescription>
                                 </div>
                                 <div className="w-full sm:w-auto min-w-[200px]">
                                     <Label htmlFor="vehiclePerfDateFilter">Filtrar Período (Performance)</Label>
                                     <DateRangePicker date={vehiclePerformanceDateRange} onDateChange={setVehiclePerformanceDateRange} />
                                 </div>
                             </div>
                             <div className="mt-4 w-full sm:w-1/2 md:w-1/3">
                                 <Label htmlFor="vehicleMultiSelect">Filtrar Veículos Específicos</Label>
                                 <MultiSelectCombobox
                                     options={vehicleOptions}
                                     selected={selectedVehicleIdsForPerf}
                                     onChange={setSelectedVehicleIdsForPerf}
                                     placeholder="Selecionar veículos..."
                                     searchPlaceholder="Buscar veículo..."
                                     emptySearchMessage="Nenhum veículo encontrado."
                                     className="w-full"
                                 />
                             </div>
                        </CardHeader>
                        <CardContent>
                            {loadingVehicles || loadingFuelings ? <LoadingSpinner /> : adminDashboardData.vehiclePerformance.length === 0 ? (
                                <p className="text-muted-foreground">Nenhum dado de performance de veículos para exibir com os filtros atuais.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Veículo</TableHead>
                                            <TableHead className="text-right">Custo Total Abastec.</TableHead>
                                            <TableHead className="text-right">Total Litros</TableHead>
                                            <TableHead className="text-right">KM Total (Base Abastec.)</TableHead>
                                            <TableHead className="text-right">KM/Litro</TableHead>
                                            <TableHead className="text-right">Custo/KM</TableHead>
                                            <TableHead>Último Abastec.</TableHead>
                                            <TableHead className="text-right">Preço/L Últ. Abastec.</TableHead>
                                            <TableHead>Tipo Comb. Últ. Abastec.</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {adminDashboardData.vehiclePerformance.map(vehicleData => (
                                            <TableRow key={vehicleData.id}>
                                                <TableCell>{vehicleData.name}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(vehicleData.totalFuelingCost)}</TableCell>
                                                <TableCell className="text-right">{vehicleData.totalLiters.toFixed(2)} L</TableCell>
                                                <TableCell className="text-right">{formatKm(vehicleData.totalKm)}</TableCell>
                                                <TableCell className="text-right">{vehicleData.avgKmPerLiter.toFixed(2)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(vehicleData.avgCostPerKm)}</TableCell>
                                                <TableCell>{vehicleData.lastFuelingDate}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(vehicleData.lastFuelingUnitPrice)}</TableCell>
                                                <TableCell>{vehicleData.lastFuelingType}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

