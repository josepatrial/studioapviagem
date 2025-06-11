
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
    updateLocalRecord, // Keep for potential future direct local updates if needed elsewhere
    type LocalVehicle, type LocalExpense, type LocalFueling, type LocalTrip, type LocalVisit, getLocalRecordsByRole,
    STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES, STORE_USERS, // Keep store names
    type LocalUser,
    type SyncStatus,
} from '@/services/localDbService';
// Removed online fetch functions from here as they will be handled by SyncContext
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO, format as formatDateFn } from 'date-fns';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert, AlertTitle, AlertDescription as UiAlertDescription } from "@/components/ui/alert";
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

        const driverIdToFilterForLocal = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : undefined);
        const filterContext = isAdmin ? (filterDriverId ? `Driver: ${filterDriverId}` : 'All Drivers') : (user ? `User: ${user.id}` : 'No User Context');
        console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Effective driverIdToFilterForLocal: ${driverIdToFilterForLocal}, FilterContext: ${filterContext}`);

        setLoadingTrips(true); setLoadingVisits(true); setLoadingExpenses(true); setLoadingFuelings(true); setLoadingVehicles(true);
        if (isAdmin) setLoadingDrivers(true);

        const fetchPromises: Promise<any>[] = [];

        try {
            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetching all data from LocalDB.`);

            fetchPromises.push(fetchLocalDbTrips(driverIdToFilterForLocal, dateRange).then(data => { setTrips(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localTrips (${data.length}) for ${driverIdToFilterForLocal || 'all'}.`); return data; }).finally(() => setLoadingTrips(false)));
            
            const childDataFilterId = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : undefined);
            const childDataFilterType: 'userId' | undefined = childDataFilterId ? 'userId' : undefined;

            fetchPromises.push(fetchLocalDbVisits(childDataFilterId, childDataFilterType).then(data => { setVisits(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localVisits (${data.length}) for ID ${childDataFilterId || 'all'} with filterType ${childDataFilterType || '(none)'}.`); return data; }).finally(() => setLoadingVisits(false)));
            fetchPromises.push(fetchLocalDbExpenses(childDataFilterId, childDataFilterType).then(data => { setExpenses(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localExpenses (${data.length}) for ID ${childDataFilterId || 'all'} with filterType ${childDataFilterType || '(none)'}.`); return data; }).finally(() => setLoadingExpenses(false)));
            
            // For fuelings, if childDataFilterId is a userId, localDbService doesn't support direct userId filter.
            // It will fall back to fetching all fuelings or filter by tripId/vehicleId if childDataFilterId happens to match one.
            // This means fuel-related summaries might not be accurately filtered by driver unless further logic is added.
            fetchPromises.push(fetchLocalDbFuelings(childDataFilterId).then(data => { setFuelings(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localFuelings (${data.length}) for ${childDataFilterId || 'all relevant'}. Note: Driver filter may not apply directly here.`); return data; }).finally(() => setLoadingFuelings(false)));

            fetchPromises.push(fetchLocalDbVehicles().then(data => { setVehicles(data); console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localVehicles (${data.length}).`); return data; }).finally(() => setLoadingVehicles(false)));
            
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
                    console.log(`[Dashboard initializeDashboardData ${initFetchTime}] Fetched localDrivers (${data.length}).`); return data;
                }).finally(() => setLoadingDrivers(false)));
            } else {
                 setLoadingDrivers(false);
                 if (user) setDrivers([user as AuthContextUserType]); else setDrivers([]);
            }

            await Promise.all(fetchPromises);
            console.log(`[Dashboard initializeDashboardData ${initFetchTime}] All local data fetches complete.`);

        } catch (error: any) {
            console.error(`[Dashboard initializeDashboardData ${initFetchTime}] Error fetching initial data from LocalDB:`, error);
            setDataError(`Não foi possível buscar dados locais. Detalhe: ${error.message}`);
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
        if (vehicle.firebaseId && !vehicle.firebaseId.startsWith('local_')) return `fb-${vehicle.firebaseId}`;
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
        if (!isAdmin || loadingDrivers || loadingVisits || loadingTrips || loadingVehicles || loadingFuelings) {
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

        let filteredVehiclesForPerfTable = uniqueVehiclesForPerf;
        if (selectedVehicleIdsForPerf.length > 0) {
            const selectedIdsSet = new Set(selectedVehicleIdsForPerf);
            filteredVehiclesForPerfTable = uniqueVehiclesForPerf.filter(v => selectedIdsSet.has(getEffectiveVehicleId(v)));
        }

        const uniqueVehiclesForPerfTableFinal = Array.from(new Map(filteredVehiclesForPerfTable.map(v => [getEffectiveVehicleId(v), v])).values());

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

        return {
            adminVisitsTableData,
            vehiclePerformance: finalUniqueVehiclePerformance,
        };
    }, [
        isAdmin,
        trips, visits, expenses, fuelings, vehicles, drivers, // Removed user here, isAdmin covers user.role check.
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
                        <Card key={card.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-xl border border-border/60">
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

            {isAdmin && (
                 <section className="space-y-8 pt-6 border-t border-border/60 mt-10">
                    <h2 className="text-2xl font-semibold text-foreground pb-2 border-b border-border/40">Painel Detalhado do Administrador</h2>
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

