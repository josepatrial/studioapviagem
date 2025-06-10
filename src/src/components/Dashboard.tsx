
// src/components/Dashboard.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MapPin as MapPinLucideIcon, Wallet, Fuel, Users, Truck, Milestone, Filter, Calendar, CarIcon, UserCheck, TrendingUp, AlertCircle } from 'lucide-react';
import { useAuth, type User as AuthContextUserType, type DriverInfo } from '@/contexts/AuthContext';
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
import { Alert, AlertTitle, AlertDescription as UiAlertDescription } from "@/components/ui/alert"; // Renomeado para evitar conflito com CardDescription
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox, MultiSelectOption } from '@/components/ui/multi-select-combobox';
import { formatKm } from '@/lib/utils';
import { cn } from '@/lib/utils';

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
        console.warn("Timestamp field is null or undefined in safeTimestampToISOString. Falling back to current ISO string.");
        return new Date().toISOString();
    }
    if (timestampField && typeof timestampField.toDate === 'function') {
      return timestampField.toDate().toISOString();
    }
    if (timestampField instanceof Date) {
      return timestampField.toISOString();
    }
    if (typeof timestampField === 'string') {
      try {
        const date = new Date(timestampField);
        if (isNaN(date.getTime())) {
            console.warn("Could not parse date string during safeTimestampToISOString, resulted in Invalid Date:", timestampField);
            return new Date().toISOString();
        }
        return date.toISOString();
      } catch (e) {
        console.warn("Could not parse date string during safeTimestampToISOString (exception):", timestampField, e);
        return new Date().toISOString();
      }
    }
    console.warn("Timestamp field is not a Firebase Timestamp, Date, or recognized string:", timestampField, ". Falling back to current ISO string.");
    return new Date().toISOString();
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
                    const visitDate = parseISO(visit.timestamp);
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
                 return f.vehicleId === vehicle.localId || f.vehicleId === vehicle.firebaseId;
            });


            if (vehiclePerformanceDateRange?.from) {
                const vFrom = vehiclePerformanceDateRange.from;
                const vTo = vehiclePerformanceDateRange.to || new Date();
                vehicleFuelings = vehicleFuelings.filter(f => {
                    try {
                        const fuelingDate = parseISO(f.date);
                        return isWithinInterval(fuelingDate, { start: vFrom, end: vTo });
                    } catch { return false; }
                });
            }

            vehicleFuelings.sort((a, b) => {
                 try {
                    const dateA = parseISO(a.date);
                    const dateB = parseISO(b.date);
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
        getDriverName, getVehicleName, getEffectiveVehicleId,
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
    }, [vehicles, getEffectiveVehicleId]);


    if (authContextLoading || initialLoading) {
        return <div className="flex h-[calc(100vh-200px)] items-center justify-center"><LoadingSpinner /></div>;
    }

    if (dataError) {
        return (
          <div className="container mx-auto p-4 md:p-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro ao Carregar Dados</AlertTitle>
              <UiAlertDescription>{dataError}</UiAlertDescription>
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

    const summaryCardsConfig = [
        { title: "Viagens Ativas", value: summaryData.activeTrips, icon: Truck, description: summaryData.filterContext, color: "text-sky-600 dark:text-sky-400" },
        { title: "Total de Visitas", value: summaryData.totalVisits, icon: MapPinLucideIcon, description: summaryData.filterContext, color: "text-violet-600 dark:text-violet-400" },
        { title: "Distância Percorrida", value: `${formatKm(summaryData.totalDistance)}`, icon: Milestone, description: `Viagens finalizadas (${summaryData.filterContext})`, color: "text-amber-600 dark:text-amber-400" },
        { title: "Valor Total Despesas", value: formatCurrency(summaryData.totalExpensesValue), icon: Wallet, description: `${expenses.length} registros (${summaryData.filterContext})`, color: "text-red-600 dark:text-red-400" },
        { title: "Custo Total Abastecimento", value: formatCurrency(summaryData.totalFuelingCost), icon: Fuel, description: `${fuelings.length} registros (${summaryData.filterContext})`, color: "text-lime-600 dark:text-lime-400" },
        { title: "Veículos na Frota", value: summaryData.totalVehicles, icon: CarIcon, description: "Total de veículos cadastrados", color: "text-teal-600 dark:text-teal-400" },
        ...(isAdmin ? [{ title: "Motoristas Ativos", value: summaryData.totalDrivers, icon: Users, description: "Total de motoristas cadastrados", color: "text-fuchsia-600 dark:text-fuchsia-400" }] : [])
    ];


    return (
        <div className="container mx-auto p-4 md:p-6 space-y-8">
            <Card className="shadow-lg rounded-xl border-border/60">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2 font-semibold">
                        <Filter className="h-5 w-5 text-primary" /> Filtros Globais do Painel
                    </CardTitle>
                    <CardDescription>Ajuste os filtros para refinar os dados exibidos em todo o painel.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end pt-4">
                    {isAdmin && (
                        <div className="space-y-1.5">
                            <Label htmlFor="driverFilterGlobal" className="text-sm font-medium text-foreground/90">Motorista</Label>
                            <Select
                                value={filterDriverId || ALL_DRIVERS_FILTER_VALUE}
                                onValueChange={(value) => setFilterDriverId(value === ALL_DRIVERS_FILTER_VALUE ? '' : value)}
                                disabled={loadingDrivers || drivers.length === 0}
                            >
                                <SelectTrigger id="driverFilterGlobal" className="h-10 bg-background hover:bg-muted/50 transition-colors">
                                    <SelectValue placeholder={loadingDrivers ? "Carregando motoristas..." : (drivers.length === 0 ? "Nenhum motorista" : "Todos os Motoristas")} />
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
                        <Label className="text-sm font-medium text-foreground/90">Período</Label>
                        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                    </div>
                </CardContent>
            </Card>

            <section>
                <h2 className="text-2xl font-semibold mb-6 text-foreground">Resumo Geral</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {summaryCardsConfig.map((card) => (
                        <Card key={card.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-xl border-border/60">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-base font-semibold text-card-foreground">{card.title}</CardTitle>
                                <card.icon className={cn("h-7 w-7", card.color)} />
                            </CardHeader>
                            <CardContent className="pt-2">
                                <div className="text-3xl font-bold text-primary">{card.value}</div>
                                <p className="text-xs text-muted-foreground pt-1 line-clamp-2">{card.description}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </section>

            {isAdmin && user.email === 'grupo2irmaos@grupo2irmaos.com.br' && (
                <section className="space-y-8 pt-6 border-t border-border/60 mt-10">
                    <h2 className="text-2xl font-semibold text-foreground">Painel Detalhado do Administrador</h2>
                    <Alert variant="default" className="bg-accent/30 dark:bg-accent/20 border-accent/50 text-accent-foreground/90">
                        <AlertCircle className="h-5 w-5 text-accent-foreground/80" />
                        <AlertTitle className="font-semibold">Visão Detalhada e Ferramentas</AlertTitle>
                        <UiAlertDescription>
                            Esta seção apresenta dados agregados e ferramentas de gerenciamento. Os filtros globais aplicados acima afetam estas visualizações.
                        </UiAlertDescription>
                    </Alert>

                    <Card className="shadow-lg rounded-xl border-border/60">
                        <CardHeader>
                            <CardTitle className="text-xl flex items-center gap-2 font-semibold">
                                <MapPinLucideIcon className="h-5 w-5 text-primary" /> Lista de Visitas Recentes
                            </CardTitle>
                            <CardDescription>As últimas 10 visitas registradas, considerando os filtros globais.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingVisits || loadingTrips ? <div className="flex justify-center py-8"><LoadingSpinner /></div> : adminDashboardData.adminVisitsTableData.length === 0 ? (
                                <p className="text-muted-foreground text-center py-4">Nenhuma visita para exibir com os filtros atuais.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-md border">
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
                                                <TableHead className="min-w-[200px]">Motivo</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {adminDashboardData.adminVisitsTableData.map(visit => (
                                                <TableRow key={visit.id} className="hover:bg-muted/50">
                                                    <TableCell className="whitespace-nowrap">{visit.date}</TableCell>
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
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg rounded-xl border-border/60">
                        <CardHeader className="space-y-4">
                             <CardTitle className="text-xl flex items-center gap-2 font-semibold">
                                 <CarIcon className="h-5 w-5 text-primary" /> Performance de Veículos
                             </CardTitle>
                             <CardDescription>Dados de performance por veículo, afetados por filtros globais e específicos abaixo.</CardDescription>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-2 items-end">
                                 <div className="space-y-1.5">
                                     <Label htmlFor="vehiclePerfDateFilter" className="text-sm font-medium text-foreground/90">Período (Performance)</Label>
                                     <DateRangePicker date={vehiclePerformanceDateRange} onDateChange={setVehiclePerformanceDateRange} />
                                 </div>
                                 <div className="space-y-1.5">
                                     <Label htmlFor="vehicleMultiSelect" className="text-sm font-medium text-foreground/90">Veículos Específicos</Label>
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
                             </div>
                        </CardHeader>
                        <CardContent className="mt-2">
                            {loadingVehicles || loadingFuelings ? <div className="flex justify-center py-8"><LoadingSpinner /></div> : adminDashboardData.vehiclePerformance.length === 0 ? (
                                <p className="text-muted-foreground text-center py-4">Nenhum dado de performance de veículos para exibir com os filtros atuais.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-md border">
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
                                                <TableRow key={vehicleData.id} className="hover:bg-muted/50">
                                                    <TableCell>{vehicleData.name}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(vehicleData.totalFuelingCost)}</TableCell>
                                                    <TableCell className="text-right">{vehicleData.totalLiters.toFixed(2)} L</TableCell>
                                                    <TableCell className="text-right">{formatKm(vehicleData.totalKm)}</TableCell>
                                                    <TableCell className="text-right">{vehicleData.avgKmPerLiter.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(vehicleData.avgCostPerKm)}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{vehicleData.lastFuelingDate}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(vehicleData.lastFuelingUnitPrice)}</TableCell>
                                                    <TableCell>{vehicleData.lastFuelingType}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </section>
            )}
        </div>
    );
};

    
