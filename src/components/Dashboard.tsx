// src/components/Dashboard.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plane, MapPinIcon, Wallet, Fuel, Users, Truck, Milestone, Filter, Calendar, CarIcon, UserCheck, TrendingUp, AlertCircle } from 'lucide-react'; // Renamed Map to MapPinIcon
import { useAuth, User } from '@/contexts/AuthContext'; // Import User type
import type { Trip } from './Trips/Trips';
import {
    getLocalVisits as fetchLocalDbVisits,
    getLocalExpenses as fetchLocalDbExpenses,
    getLocalFuelings as fetchLocalDbFuelings,
    getLocalTrips as fetchLocalDbTrips,
    getLocalVehicles as fetchLocalDbVehicles,
    saveLocalUser, // For caching Firestore data
    LocalVehicle, LocalExpense, LocalFueling, LocalTrip, LocalVisit, getLocalRecordsByRole,
    updateLocalRecord, // For caching Firestore data
    STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES, STORE_USERS // Import store names
} from '@/services/localDbService';
import { getFuelings as fetchOnlineFuelings, getVehicles as fetchOnlineVehicles, getTrips as fetchOnlineTrips, getDrivers as fetchOnlineDrivers, getExpenses as fetchOnlineExpenses, getVisits as fetchOnlineVisits } from '@/services/firestoreService';
import type { VehicleInfo } from './Vehicle';
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
}

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const safeFormatDate = (dateInput: string | { toDate: () => Date } | Date | undefined | null, formatStr: string = 'dd/MM/yyyy HH:mm'): string => {
    if (!dateInput) return 'N/A';
    try {
      if (typeof dateInput === 'string') {
        return formatDateFn(parseISO(dateInput), formatStr);
      } else if (dateInput && typeof (dateInput as any).toDate === 'function') { // Firebase Timestamp
        return formatDateFn((dateInput as any).toDate(), formatStr);
      } else if (dateInput instanceof Date) { // JavaScript Date
        return formatDateFn(dateInput, formatStr);
      }
      return 'Data inválida';
    } catch (error) {
      console.warn("Error formatting date in safeFormatDate:", dateInput, error);
      return 'Data inválida';
    }
  };


export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
    const { user, loading: authContextLoading } = useAuth();
    const isAdmin = useMemo(() => user?.role === 'admin', [user]);

    const [trips, setTrips] = useState<LocalTrip[]>([]);
    const [visits, setVisits] = useState<LocalVisit[]>([]);
    const [expenses, setExpenses] = useState<LocalExpense[]>([]);
    const [fuelings, setFuelingsData] = useState<LocalFueling[]>([]);
    const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
    const [drivers, setDrivers] = useState<User[]>([]);

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

    // State for vehicle performance filter
    const [selectedVehicleIdsForPerf, setSelectedVehicleIdsForPerf] = useState<string[]>([]);
    const [vehiclePerformanceDateRange, setVehiclePerformanceDateRange] = useState<DateRange | undefined>(undefined);


    useEffect(() => {
        const initTime = performance.now();
        console.log(`[Dashboard useEffect for data fetch ${initTime}] Running. AuthLoading: ${authContextLoading}, User: ${user?.id}, IsAdmin: ${isAdmin}`);

        if (authContextLoading) {
            console.log(`[Dashboard useEffect for data fetch ${initTime}] Auth context still loading. Aborting data fetch.`);
            // Don't set initialLoading to false here if auth is still loading
            return;
        }

        // If auth is done, and there's no user (and not admin), then stop initial loading
        if (!user && !isAdmin) {
            console.log(`[Dashboard useEffect for data fetch ${initTime}] Auth done, no user and not admin. Clearing data and stopping load.`);
            setTrips([]); setVisits([]); setExpenses([]); setFuelingsData([]); setVehicles([]); setDrivers([]);
            setInitialLoading(false);
            setDataError(null);
            return;
        }

        // If auth is done and user or admin is present, proceed to fetch data
        initializeDashboardData();

    }, [authContextLoading, user, isAdmin]); // Removed filterDriverId and dateRange from here to prevent re-fetch on their change before data is ready

    // Separate useEffect to re-fetch data when filters change, but only if initial loading is complete
    useEffect(() => {
        if (!initialLoading && (user || isAdmin)) { // Only re-fetch if initial load is done and user/admin context is valid
            const filterChangeTime = performance.now();
            console.log(`[Dashboard useEffect for filter change ${filterChangeTime}] Filters changed. Re-fetching data. FilterDriverId: ${filterDriverId}, DateRange: `, dateRange);
            initializeDashboardData();
        }
    }, [filterDriverId, dateRange, initialLoading, user, isAdmin]); // Add initialLoading, user, isAdmin


    const initializeDashboardData = useCallback(async () => {
        const initFetchTime = Date.now();
        console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Initializing... AuthContextLoading: ${authContextLoading}, InitialComponentLoading: ${initialLoading}`);

        // We must wait for authContext to finish before deciding the driverId
        if (authContextLoading) {
            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] AuthContext still loading. Will retry when it's done.`);
            setInitialLoading(true); // Keep initial loading true if auth context isn't ready
            return;
        }

        setInitialLoading(true); // Set loading true for this fetch operation
        setDataError(null);

        const driverIdToFilter = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : undefined);
        const filterContext = isAdmin ? (filterDriverId ? `Driver: ${filterDriverId}` : 'All Drivers') : (user ? `User: ${user.id}` : 'No User Context');
        console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Effective driverIdToFilter for Firestore: ${driverIdToFilter}, FilterContext: ${filterContext}`);

        if (!driverIdToFilter && !isAdmin) {
            console.warn(`[Dashboard initializeDashboardData ${initFetchTime}] No driverIdToFilter for non-admin, and not admin. Aborting Firestore fetch.`);
            setTrips([]); setVisits([]); setExpenses([]); setFuelingsData([]); setVehicles([]);
            setInitialLoading(false);
            return;
        }

        const fetchPromises: Promise<any>[] = [];
        const cachePromises: Promise<void>[] = [];

        setLoadingTrips(true); setLoadingVisits(true); setLoadingExpenses(true); setLoadingFuelings(true); setLoadingVehicles(true);
        if (isAdmin) setLoadingDrivers(true);

        try {
            if (navigator.onLine) {
                console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Online: Fetching all data from Firestore.`);
                fetchPromises.push(fetchOnlineTrips({ userId: driverIdToFilter, startDate: dateRange?.from, endDate: dateRange?.to }).then(data => { setTrips(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineTrips (${data.length}) for ${driverIdToFilter || 'all'}:`, data.slice(0,2)); data.forEach(t => cachePromises.push(updateLocalRecord(STORE_TRIPS, t).catch(e => console.warn("Cache fail trip", e)))); return data; }).finally(() => setLoadingTrips(false)));
                fetchPromises.push(fetchOnlineVisits(driverIdToFilter, dateRange).then(data => { setVisits(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineVisits (${data.length}) for ${driverIdToFilter || 'all'}:`, data.slice(0,2)); data.forEach(v => cachePromises.push(updateLocalRecord(STORE_VISITS, v).catch(e => console.warn("Cache fail visit", e)))); return data; }).finally(() => setLoadingVisits(false)));
                fetchPromises.push(fetchOnlineExpenses(driverIdToFilter, dateRange).then(data => { setExpenses(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineExpenses (${data.length}) for ${driverIdToFilter || 'all'}:`, data.slice(0,2)); data.forEach(e => cachePromises.push(updateLocalRecord(STORE_EXPENSES, e)).catch(er => console.warn("Cache fail expense", er))); return data; }).finally(() => setLoadingExpenses(false)));
                fetchPromises.push(fetchOnlineFuelings({ userId: driverIdToFilter, startDate: dateRange?.from, endDate: dateRange?.to }).then(data => { setFuelingsData(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineFuelings (${data.length}) for ${driverIdToFilter || 'all'}:`, data.slice(0,2)); data.forEach(f => cachePromises.push(updateLocalRecord(STORE_FUELINGS, f).catch(er => console.warn("Cache fail fueling", er))); return data; }).finally(() => setLoadingFuelings(false)));
                fetchPromises.push(fetchOnlineVehicles().then(data => { setVehicles(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineVehicles (${data.length}):`, data.slice(0,2)); data.forEach(v => cachePromises.push(updateLocalRecord(STORE_VEHICLES, v)).catch(e => console.warn("Cache fail vehicle", e))); return data; }).finally(() => setLoadingVehicles(false)));
                if (isAdmin) {
                    fetchPromises.push(fetchOnlineDrivers().then(data => { setDrivers(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched onlineDrivers (${data.length}):`, data.slice(0,2)); data.forEach(d => cachePromises.push(saveLocalUser(d as User & {firebaseId: string})).catch(e => console.warn("Cache fail driver", e))); return data; }).finally(() => setLoadingDrivers(false)));
                }
            } else {
                console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Offline: Fetching all data from LocalDB.`);
                fetchPromises.push(fetchLocalDbTrips(driverIdToFilter, dateRange).then(data => { setTrips(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localTrips (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingTrips(false)));
                fetchPromises.push(fetchLocalDbVisits(driverIdToFilter, dateRange).then(data => { setVisits(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localVisits (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingVisits(false)));
                fetchPromises.push(fetchLocalDbExpenses(driverIdToFilter, dateRange).then(data => { setExpenses(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localExpenses (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingExpenses(false)));
                fetchPromises.push(fetchLocalDbFuelings(driverIdToFilter, dateRange).then(data => { setFuelingsData(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localFuelings (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingFuelings(false)));
                fetchPromises.push(fetchLocalDbVehicles().then(data => { setVehicles(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localVehicles (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingVehicles(false)));
                if (isAdmin) {
                    fetchPromises.push(getLocalRecordsByRole('driver').then(data => { setDrivers(data as User[]); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localDrivers (${data.length}):`, data.slice(0,2)); return data; }).finally(() => setLoadingDrivers(false)));
                }
            }

            await Promise.all(fetchPromises);

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
    }, [isAdmin, user, filterDriverId, dateRange, authContextLoading, initialLoading]);

    const getDriverName = useCallback((driverId: string) => {
        const driver = drivers.find(d => (d.firebaseId || d.id) === driverId);
        return driver?.name || driver?.email || `Motorista (${driverId.substring(0, 6)}...)`;
    }, [drivers]);

    const getVehicleName = useCallback((vehicleId: string | undefined) => {
        if (!vehicleId) return 'Veículo Desconhecido';
        const vehicle = vehicles.find(v => (v.firebaseId || v.localId) === vehicleId);
        return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
    }, [vehicles]);


    const summaryData = useMemo(() => {
        // Use the state variables directly which are updated by initializeDashboardData
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

        const adminVisitsTableData = visits.map(visit => { // visits here is already filtered by global filters if they were applied
            const tripDetail = tripDetailsMap.get(visit.tripLocalId);
            return {
                id: visit.firebaseId || visit.localId || visit.id,
                date: safeFormatDate(visit.timestamp, 'dd/MM/yyyy HH:mm'),
                driverName: tripDetail?.driverName || 'Desconhecido',
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


        const uniqueVehiclesForPerf = Array.from(new Map(vehicles.map(v => [v.firebaseId || v.localId, v])).values());
        console.log(`[Dashboard adminDashboardData] Raw vehicles for perf table:`, vehicles.map(v => ({id: v.id, localId: v.localId, fbId: v.firebaseId, model: v.model}) ));
        console.log(`[Dashboard adminDashboardData] Unique vehicles for perf table:`, uniqueVehiclesForPerf.map(v => ({id: v.id, localId: v.localId, fbId: v.firebaseId, model: v.model}) ));


        let filteredVehiclesForPerfTable = uniqueVehiclesForPerf;
        if (selectedVehicleIdsForPerf.length > 0) {
            const selectedIdsSet = new Set(selectedVehicleIdsForPerf);
            filteredVehiclesForPerfTable = uniqueVehiclesForPerf.filter(v => selectedIdsSet.has(v.firebaseId || v.localId));
             console.log(`[Dashboard adminDashboardData] Vehicles after multi-select filter for perf table:`, filteredVehiclesForPerfTable.map(v => ({id: v.firebaseId || v.localId, model: v.model})));
        }

        const vehiclePerformance = filteredVehiclesForPerfTable.map(vehicle => {
            const vehicleIdToMatch = vehicle.firebaseId || vehicle.localId;
            let vehicleFuelings = fuelings.filter(f => (f.vehicleId || (f.tripLocalId && trips.find(t => t.localId === f.tripLocalId)?.vehicleId)) === vehicleIdToMatch);

            if (vehiclePerformanceDateRange?.from) {
                const vFrom = vehiclePerformanceDateRange.from;
                const vTo = vehiclePerformanceDateRange.to || new Date();
                vehicleFuelings = vehicleFuelings.filter(f => {
                    try {
                        return isWithinInterval(parseISO(f.date), { start: vFrom, end: vTo });
                    } catch { return false; }
                });
            }

            vehicleFuelings.sort((a, b) => {
                 try { return new Date(a.date).getTime() - new Date(b.date).getTime(); } catch { return 0; }
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

            const performanceData = {
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
            console.log(`[Dashboard adminDashboardData] Perf data for ${vehicle.model}:`, performanceData);
            return performanceData;
        });
        console.log(`[Dashboard adminDashboardData] Final vehiclePerformance array:`, vehiclePerformance.map(vp => ({id: vp.id, name: vp.name, km: vp.totalKm })));

        return {
            adminVisitsTableData,
            vehiclePerformance,
        };
    }, [
        isAdmin, user,
        trips, visits, expenses, fuelings, vehicles, drivers, // Main data sources from state
        loadingDrivers, loadingVisits, loadingTrips, loadingVehicles, loadingFuelings, // Loading states
        getDriverName, getVehicleName, // Callbacks
        selectedVehicleIdsForPerf, vehiclePerformanceDateRange // Specific filters for vehicle perf table
    ]);

    const vehicleOptions: MultiSelectOption[] = useMemo(() => {
        const uniqueVehicleMap = new Map<string, LocalVehicle>();
        vehicles.forEach(v => {
            const id = v.firebaseId || v.localId;
            if (id && !uniqueVehicleMap.has(id)) { // Ensure id is not undefined
                uniqueVehicleMap.set(id, v);
            }
        });
        return Array.from(uniqueVehicleMap.values()).map(v => ({
            value: v.firebaseId || v.localId,
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
        { title: "Total de Visitas", value: summaryData.totalVisits, icon: MapPinIcon, description: summaryData.filterContext }, // Changed icon here
        { title: "Distância Percorrida", value: `${formatKm(summaryData.totalDistance)}`, icon: Milestone, description: `Viagens finalizadas (${summaryData.filterContext})` },
        { title: "Valor Total Despesas", value: formatCurrency(summaryData.totalExpensesValue), icon: Wallet, description: `${expenses.length} registros (${summaryData.filterContext})` },
        { title: "Custo Total Abastecimento", value: formatCurrency(summaryData.totalFuelingCost), icon: Fuel, description: `${fuelings.length} registros (${summaryData.filterContext})` },
        { title: "Veículos", value: summaryData.totalVehicles, icon: CarIcon, description: "Total de veículos na frota" },
        ...(isAdmin ? [{ title: "Motoristas", value: summaryData.totalDrivers, icon: Users, description: "Total de motoristas ativos" }] : [])
    ];


    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            {/* Filtros Globais */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><Filter className="h-5 w-5" /> Filtros Globais do Painel</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    {isAdmin && (
                        <div className="space-y-1.5">
                            <Label htmlFor="driverFilterGlobal">Filtrar por Motorista (Global)</Label>
                            <Select value={filterDriverId} onValueChange={setFilterDriverId} disabled={loadingDrivers || drivers.length === 0}>
                                <SelectTrigger id="driverFilterGlobal">
                                    <SelectValue placeholder={loadingDrivers ? "Carregando..." : (drivers.length === 0 ? "Nenhum motorista" : "Todos os Motoristas")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {loadingDrivers ? <SelectItem value="loading_drivers_global" disabled><LoadingSpinner className="h-4 w-4 inline-block mr-2" />Carregando...</SelectItem> :
                                        <>
                                            <SelectItem value="">Todos os Motoristas</SelectItem>
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

            {/* Cards de Resumo */}
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

            {/* Painel do Administrador */}
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

                    {/* Lista de Visitas Recentes */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><MapPinIcon className="h-5 w-5" /> Lista de Visitas Recentes</CardTitle> {/* Changed icon here */}
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


                    {/* Performance de Veículos */}
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
