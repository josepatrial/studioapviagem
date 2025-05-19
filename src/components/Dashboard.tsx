
// src/components/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MapPin, Wallet, Fuel, Truck, Milestone, Filter, Calendar, Info, Car, Briefcase, Users } from 'lucide-react'; // Added Calendar, Info, Car, Briefcase, Users icon
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
    updateLocalRecord, // Added for vehicle caching
    STORE_VEHICLES, // Added for vehicle caching
    LocalUser as DbUser,
} from '@/services/localDbService';
import { getFuelings as fetchOnlineFuelings, getVehicles as fetchOnlineVehicles, getTrips as fetchOnlineTrips, getDrivers as fetchOnlineDrivers, getExpenses as fetchOnlineExpenses, getVisits as fetchOnlineVisits } from '@/services/firestoreService';
import type { VehicleInfo } from './Vehicle';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO, startOfDay, endOfDay, format as formatDateFn } from 'date-fns';
import { LoadingSpinner } from './LoadingSpinner';
import { formatKm } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MultiSelectCombobox, type MultiSelectOption } from '@/components/ui/multi-select-combobox';
import type { LocalUser } from '@/services/localDbService';


const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface DashboardProps {
    setActiveTab: (section: 'visits' | 'expenses' | 'fuelings' | null) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658'];

interface AdminVisitData {
    id: string;
    date: string;
    driverName: string;
    kmAtVisit: string;
    reason: string;
    visitType?: string;
    clientName: string;
    city: string;
    vehicleName: string;
}


export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const { user, loading: authContextLoading } = useAuth(); // Get user and auth loading state
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [drivers, setDrivers] = useState<DbUser[]>([]); // Changed to DbUser to align with localDbService
  const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);
  const [filterDriverId, setFilterDriverId] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined); // Global date range
  const [vehiclePerformanceDateRange, setVehiclePerformanceDateRange] = useState<DateRange | undefined>(undefined); // Date range for vehicle performance
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);


  const [expenses, setExpenses] = useState<LocalExpense[]>([]);
  const [fuelings, setFuelings] = useState<LocalFueling[]>([]);
  const [trips, setTrips] = useState<LocalTrip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
  const [visits, setVisits] = useState<LocalVisit[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);


  useEffect(() => {
    const initializeDashboardData = async () => {
      console.log("[Dashboard initializeDashboardData] Called.");
      if (!user && !isAdmin) { // If not admin, user must exist to fetch their data
        console.log("[Dashboard initializeDashboardData] No user and not admin. Aborting data fetch.");
        setInitialLoading(false);
        return;
      }

      setInitialLoading(true);
      try {
        const driverIdToFilter = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : undefined);
        console.log(`[Dashboard initializeDashboardData] Effective driverIdToFilter for Firestore: ${driverIdToFilter}`);

        if (!driverIdToFilter && !isAdmin) {
             console.log("[Dashboard initializeDashboardData] No driverIdToFilter for non-admin. Aborting fetch.");
             setInitialLoading(false);
             return;
        }

        let fetchedVehicles: LocalVehicle[];
        let fetchedTrips: LocalTrip[];
        let fetchedExpenses: LocalExpense[];
        let fetchedFuelings: LocalFueling[];
        let fetchedVisits: LocalVisit[];
        let fetchedDrivers: DbUser[] = [];


        if (navigator.onLine) {
          console.log("[Dashboard] Online: Fetching primary data from Firestore...");
          const [
            onlineVehiclesData,
            onlineDriversData, // Fetch drivers first if admin
          ] = await Promise.all([
            fetchOnlineVehicles(),
            isAdmin ? fetchOnlineDrivers().then(ods => ods.map(d => ({ ...d, id: d.id, firebaseId: d.id, role: d.role || 'driver', base: d.base || 'N/A', syncStatus: 'synced', lastLogin: new Date().toISOString()} as DbUser))) : Promise.resolve([]),
          ]);
          fetchedVehicles = onlineVehiclesData.map(v => ({ ...v, localId: v.id, firebaseId: v.id, syncStatus: 'synced', deleted: false } as LocalVehicle));
          if (isAdmin) fetchedDrivers = onlineDriversData;

          // Now fetch trips based on driverIdToFilter (which uses admin-selected driver or current user)
          const onlineTrips = await fetchOnlineTrips({ userId: driverIdToFilter });
          fetchedTrips = onlineTrips.map(t => ({ ...t, localId: t.id, firebaseId: t.id, syncStatus: 'synced', deleted: false } as LocalTrip));

          // Fetch related data based on fetchedTrips
          const tripIds = fetchedTrips.map(t => t.firebaseId || t.id); // Use firebaseId if available for online fetches
          const onlineExpensesData = tripIds.length > 0 ? await Promise.all(tripIds.map(tid => fetchOnlineExpenses(tid))).then(res => res.flat()) : [];
          const onlineFuelingsData = tripIds.length > 0 ? await Promise.all(tripIds.map(tid => fetchOnlineFuelings({ tripId: tid }))).then(res => res.flat()) : [];
          const onlineVisitsData = tripIds.length > 0 ? await Promise.all(tripIds.map(tid => fetchOnlineVisits(tid))).then(res => res.flat()) : [];

          fetchedExpenses = onlineExpensesData.map(e => ({ ...e, localId: e.id, firebaseId: e.id, syncStatus: 'synced', deleted: false, tripLocalId: e.tripId } as LocalExpense));
          fetchedFuelings = onlineFuelingsData.map(f => ({ ...f, localId: f.id, firebaseId: f.id, syncStatus: 'synced', deleted: false, tripLocalId: f.tripId } as LocalFueling));
          fetchedVisits = onlineVisitsData.map(v => ({ ...v, localId: v.id, firebaseId: v.id, syncStatus: 'synced', deleted: false, tripLocalId: v.tripId } as LocalVisit));

           // Cache fetched online data locally
           const cachePromises: Promise<any>[] = [];
           fetchedVehicles.forEach(v => cachePromises.push(updateLocalRecord(STORE_VEHICLES, v)));
           // Only cache drivers if admin to avoid overwriting user's own data if they happen to be a driver
           if (isAdmin) fetchedDrivers.forEach(d => cachePromises.push(saveLocalUser(d)));
           // Trips, Expenses, Visits, Fuelings are implicitly cached when created/synced,
           // but we can ensure they are up-to-date from this fetch too.
           // This might be redundant if sync logic is comprehensive. For now, focusing on primary entities.

           await Promise.all(cachePromises).catch(cacheError => console.warn("[Dashboard] Error caching Firestore data locally:", cacheError));
           console.log(`[Dashboard initializeDashboardData] Fetched onlineVehicles (${fetchedVehicles.length}), onlineTrips (${fetchedTrips.length}), onlineExpenses (${fetchedExpenses.length}), onlineFuelings (${fetchedFuelings.length}), onlineVisits (${fetchedVisits.length})`);
           if(isAdmin) console.log(`[Dashboard initializeDashboardData] Fetched onlineDrivers (${fetchedDrivers.length})`)

        } else {
          console.log("[Dashboard] Offline: Fetching data from LocalDB...");
          const [
              localDbTripsData,
              localDbVehiclesData,
              allLocalDbExpenses,
              allLocalDbFuelings,
              allLocalDbVisits
          ] = await Promise.all([
            fetchLocalDbTrips(driverIdToFilter),
            fetchLocalDbVehicles(),
            fetchLocalDbExpenses(), // Fetch all and filter later based on trips
            fetchLocalDbFuelings(),  // Fetch all and filter later
            fetchLocalDbVisits(),    // Fetch all and filter later
          ]);
          fetchedTrips = localDbTripsData;
          fetchedVehicles = localDbVehiclesData;
          fetchedExpenses = allLocalDbExpenses;
          fetchedFuelings = allLocalDbFuelings;
          fetchedVisits = allLocalDbVisits;
          if (isAdmin) {
            fetchedDrivers = await getLocalRecordsByRole('driver');
          }
           console.log(`[Dashboard initializeDashboardData] Fetched localDbTrips (${fetchedTrips.length}), localDbVehicles (${fetchedVehicles.length}), localDbExpenses (${fetchedExpenses.length}), localDbFuelings (${fetchedFuelings.length}), localDbVisits (${fetchedVisits.length})`);
           if(isAdmin) console.log(`[Dashboard initializeDashboardData] Fetched localDbDrivers (${fetchedDrivers.length})`)
        }

        console.log(`[Dashboard initializeDashboardData] Setting ${fetchedTrips.length} trips, ${fetchedExpenses.length} expenses, ${fetchedFuelings.length} fuelings, ${fetchedVisits.length} visits, ${fetchedVehicles.length} vehicles.`);
        if(isAdmin) console.log(`[Dashboard initializeDashboardData] Setting ${fetchedDrivers.length} drivers.`)
        setTrips(fetchedTrips);
        setVehicles(fetchedVehicles);
        setExpenses(fetchedExpenses);
        setFuelings(fetchedFuelings);
        setVisits(fetchedVisits);
        if(isAdmin) setDrivers(fetchedDrivers);

      } catch (error) {
        console.error("[Dashboard] Error fetching initial dashboard data:", error);
        toast({ variant: "destructive", title: "Erro ao Carregar Dados", description: `Não foi possível buscar dados iniciais. Detalhe: ${(error as Error).message}` });
      } finally {
        setInitialLoading(false);
        setLoadingDrivers(false); // Ensure loadingDrivers is also set to false
        console.log("[Dashboard initializeDashboardData] Finished. InitialLoading: false, LoadingDrivers: false.");
      }
    };

    console.log(`[Dashboard useEffect for data fetch] AuthContextLoading: ${authContextLoading}, User: ${!!user}`);
    if (!authContextLoading && (user || isAdmin)) { // Only fetch if auth is resolved AND (we have a user OR we are admin)
      console.log("[Dashboard useEffect for data fetch] Auth context ready. Calling initializeDashboardData.");
      initializeDashboardData();
    } else if (!authContextLoading && !user && !isAdmin) {
      console.log("[Dashboard useEffect for data fetch] Auth context ready, but no user and not admin. Clearing/resetting data.");
      // Clear data if no user and not admin after auth check
      setTrips([]); setExpenses([]); setFuelings([]); setVisits([]); setVehicles([]); setDrivers([]);
      setInitialLoading(false); setLoadingDrivers(false);
    } else {
       console.log("[Dashboard useEffect for data fetch] Auth context still loading or conditions not met for data fetch. Waiting...");
       // Optionally set initialLoading to true here if you want a spinner while waiting for auth
       // setInitialLoading(true);
    }
  // Dependency array includes authContextLoading and user to refetch if they change.
  // filterDriverId is also included so if admin changes filter, data reloads.
  }, [authContextLoading, user, isAdmin, toast, filterDriverId]);


  const summaryData = useMemo(() => {
    let currentFilteredTrips = trips;
    // Ensure related items are filtered based on the *current* set of filtered trips, not all DB items
    const relevantTripLocalIds = new Set(currentFilteredTrips.map(t => t.localId || t.id));

    const currentVisits = visits.filter(v => (v.tripLocalId && relevantTripLocalIds.has(v.tripLocalId)) || (v.tripId && relevantTripLocalIds.has(v.tripId)));
    const currentExpenses = expenses.filter(e => (e.tripLocalId && relevantTripLocalIds.has(e.tripLocalId)) || (e.tripId && relevantTripLocalIds.has(e.tripId)));
    const currentFuelings = fuelings.filter(f => (f.tripLocalId && relevantTripLocalIds.has(f.tripLocalId)) || (f.tripId && relevantTripLocalIds.has(f.tripId)));


    if (dateRange?.from) {
        const startDate = startOfDay(dateRange.from);
        const endDate = dateRange.to ? endOfDay(dateRange.to) : null;
        const interval = { start: startDate, end: endDate || new Date(8640000000000000) }; // Max date if no end

        currentFilteredTrips = currentFilteredTrips.filter(t => { try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; } });
        // Re-filter visits, expenses, fuelings based on the date-filtered trips
        const dateFilteredTripIds = new Set(currentFilteredTrips.map(t => t.localId || t.id));
        // currentVisits = currentVisits.filter(v => dateFilteredTripIds.has(v.tripLocalId || v.tripId));
        // currentExpenses = currentExpenses.filter(e => dateFilteredTripIds.has(e.tripLocalId || e.tripId));
        // currentFuelings = currentFuelings.filter(f => dateFilteredTripIds.has(f.tripLocalId || f.tripId));
        // Alternative: Filter sub-items by their own dates if they are independent of trip's createdAt
        // currentVisits = visits.filter(v => { try { return isWithinInterval(parseISO(v.timestamp), interval); } catch { return false; } });
        // currentExpenses = expenses.filter(e => { try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; } });
        // currentFuelings = fuelings.filter(f => { try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; } });
    }


    const activeTripsCount = currentFilteredTrips.filter(t => t.status === 'Andamento').length;
    const totalVisitsCount = currentVisits.length;
    const totalExpensesCount = currentExpenses.length;
    const totalExpensesValue = currentExpenses.reduce((sum, e) => sum + e.value, 0);
    const totalFuelingsCount = currentFuelings.length;
    const totalFuelingsCost = currentFuelings.reduce((sum, f) => sum + f.totalCost, 0);
    const totalDistanceValue = currentFilteredTrips
        .filter(t => t.status === 'Finalizado' && t.totalDistance != null)
        .reduce((sum, t) => sum + (t.totalDistance || 0), 0);

    let filterContext = 'Todas as Atividades';
    let driverNameForContext = 'Todos os Motoristas';

    if (isAdmin) {
        if (filterDriverId) {
            const driver = drivers.find(d => d.id === filterDriverId);
            driverNameForContext = driver?.name || driver?.email || `ID: ${filterDriverId.substring(0,6)}...`;
        }
        filterContext = `Motorista: ${driverNameForContext}`;
    } else if (user) {
        filterContext = `Suas Atividades`;
    }


    if (dateRange?.from) {
        filterContext += ` (${formatDateFn(dateRange.from, 'dd/MM/yy')}${dateRange.to ? ` - ${formatDateFn(dateRange.to, 'dd/MM/yy')}` : ' em diante'})`;
    }


    return {
        activeTrips: activeTripsCount,
        totalVisits: totalVisitsCount,
        totalExpensesCount,
        totalExpensesValue,
        totalFuelingsCount,
        totalFuelingsCost,
        totalDistance: totalDistanceValue,
        totalDrivers: isAdmin ? (filterDriverId ? 1 : drivers.length) : 0,
        totalVehicles: vehicles.length,
        filterApplied: !!filterDriverId || !!dateRange,
        filterContext,
    };
  }, [isAdmin, filterDriverId, dateRange, drivers, expenses, fuelings, trips, vehicles, visits, user]);


  const vehicleOptions: MultiSelectOption[] = useMemo(() => {
    const uniqueVehicles = Array.from(new Map(vehicles.map(v => [v.firebaseId || v.localId, v])).values());
    return uniqueVehicles.map(v => ({
      value: v.firebaseId || v.localId || v.id, // Ensure a fallback for value
      label: `${v.model || 'Modelo Desconhecido'} (${v.licensePlate || 'Placa Desconhecida'})`,
      icon: Car
    }));
  }, [vehicles]);


  const adminDashboardData = useMemo(() => {
    if (!isAdmin || user?.email !== 'grupo2irmaos@grupo2irmaos.com.br' || loadingDrivers) {
      return null;
    }

    let currentTripsSource = filterDriverId
        ? trips.filter(t => t.userId === filterDriverId)
        : trips;

    // Already filtered by global driver filter if applicable
    let currentVisitsSource = visits;
    let currentExpensesSource = expenses;
    let currentFuelingsSource = fuelings;


    if (dateRange?.from) { // Apply global date filter
        const startDate = startOfDay(dateRange.from);
        const endDate = dateRange.to ? endOfDay(dateRange.to) : new Date(8640000000000000);
        const interval = { start: startDate, end: endDate };

        currentTripsSource = currentTripsSource.filter(t => { try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; } });
        // Filter sub-items by their own dates if global date range is active
        currentVisitsSource = currentVisitsSource.filter(v => { try { return isWithinInterval(parseISO(v.timestamp), interval); } catch { return false; }});
        currentExpensesSource = currentExpensesSource.filter(e => { try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; } });
        currentFuelingsSource = currentFuelingsSource.filter(f => { try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; } });
    }

    const relevantTripIdsForCharts = new Set(currentTripsSource.map(t => t.localId || t.id));
    currentExpensesSource = currentExpensesSource.filter(e => (e.tripLocalId && relevantTripIdsForCharts.has(e.tripLocalId)) || (e.tripId && relevantTripIdsForCharts.has(e.tripId)));


    const driverNameMap = new Map(drivers.map(d => [d.id, d.name || d.email || `Motorista Desconhecido`]));
    const vehicleNameMap = new Map(vehicles.map(v => [v.firebaseId || v.localId || v.id, `${v.model || 'Modelo Desconhecido'} (${v.licensePlate || 'Placa Desconhecida'})`]));
    const tripDetailsMap = new Map(currentTripsSource.map(t => [t.localId || t.id, { vehicleId: t.vehicleId, userId: t.userId }]));

    let fuelingsForPerf = [...currentFuelingsSource]; // Use already globally date-filtered fuelings

    if (vehiclePerformanceDateRange?.from) { // Apply specific date filter for vehicle performance
        const perfStartDate = startOfDay(vehiclePerformanceDateRange.from);
        const perfEndDate = vehiclePerformanceDateRange.to ? endOfDay(vehiclePerformanceDateRange.to) : new Date(8640000000000000);
        const perfInterval = { start: perfStartDate, end: perfEndDate };
        fuelingsForPerf = fuelingsForPerf.filter(f => { try { return isWithinInterval(parseISO(f.date), perfInterval); } catch { return false; } });
    }


    console.log("[Dashboard Admin] Raw vehicles for performance:", JSON.stringify(vehicles.map(v => ({ localId: v.localId, firebaseId: v.firebaseId, model: v.model, plate: v.licensePlate, effectiveId: v.firebaseId || v.localId || v.id }))));
    let uniqueVehiclesForPerf = Array.from(new Map(vehicles.map(v => [v.firebaseId || v.localId || v.id, v])).values());
    console.log("[Dashboard Admin] Unique vehicles for performance (after Map de-duplication):", JSON.stringify(uniqueVehiclesForPerf.map(v => ({ localId: v.localId, firebaseId: v.firebaseId, model: v.model, plate: v.licensePlate, effectiveId: v.firebaseId || v.localId || v.id }))));

    if (selectedVehicleIds.length > 0) {
      uniqueVehiclesForPerf = uniqueVehiclesForPerf.filter(v => selectedVehicleIds.includes(v.firebaseId || v.localId || v.id));
      console.log("[Dashboard Admin] Filtered vehicles for performance (after multi-select):", JSON.stringify(uniqueVehiclesForPerf.map(v => ({ id: v.firebaseId || v.localId || v.id, name: `${v.model || 'Modelo Desconhecido'} (${v.licensePlate || 'Placa Desconhecida'})` }))));
    }


    const vehiclePerformance = uniqueVehiclesForPerf.map(vehicle => {
        const vehicleIdForFiltering = vehicle.firebaseId || vehicle.localId || vehicle.id;
        const vehicleFuelings = fuelingsForPerf.filter(f => f.vehicleId === vehicleIdForFiltering);

        const totalFuelingCost = vehicleFuelings.reduce((sum, f) => sum + f.totalCost, 0);
        const totalLiters = vehicleFuelings.reduce((sum, f) => sum + f.liters, 0);

        const sortedFuelings = [...vehicleFuelings].sort((a, b) => {
            const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            return (a.odometerKm || 0) - (b.odometerKm || 0);
        });

        let totalKmFromFuelings = 0;
        if (sortedFuelings.length > 1) {
            const firstOdometer = sortedFuelings[0].odometerKm || 0;
            const lastOdometer = sortedFuelings[sortedFuelings.length - 1].odometerKm || 0;
            if (lastOdometer > firstOdometer) {
                 totalKmFromFuelings = lastOdometer - firstOdometer;
            }
        }

        const kmDriven = totalKmFromFuelings;

        const avgCostPerKm = kmDriven > 0 ? totalFuelingCost / kmDriven : 0;
        const avgKmPerLiter = totalLiters > 0 && kmDriven > 0 ? kmDriven / totalLiters : 0;
        const latestFuelingDate = sortedFuelings.length > 0 ? (sortedFuelings[sortedFuelings.length - 1].date ? formatDateFn(parseISO(sortedFuelings[sortedFuelings.length - 1].date), 'dd/MM/yyyy') : 'N/A') : 'N/A';
        const latestPricePerLiter = sortedFuelings.length > 0 ? sortedFuelings[sortedFuelings.length - 1].pricePerLiter : 0;
        const latestFuelType = sortedFuelings.length > 0 ? sortedFuelings[sortedFuelings.length - 1].fuelType : 'N/A';


        return {
            id: vehicle.firebaseId || vehicle.localId || vehicle.id,
            name: `${vehicle.model || 'Modelo Desconhecido'} (${vehicle.licensePlate || 'Placa Desconhecida'})`,
            totalFuelingCost,
            totalLiters,
            kmDriven,
            avgCostPerKm,
            avgKmPerLiter,
            latestFuelingDate,
            latestPricePerLiter,
            latestFuelType,
        };
    }).sort((a,b) => b.kmDriven - a.kmDriven);

    console.log("[Dashboard Admin] Final vehiclePerformance array for table:", JSON.stringify(vehiclePerformance.map(vp => ({ id: vp.id, name: vp.name, kmDriven: vp.kmDriven }))));


    const adminVisitsTableData: AdminVisitData[] = currentVisitsSource // Use already date-filtered visits
      .map(visit => {
        const tripDetail = tripDetailsMap.get(visit.tripLocalId || visit.tripId); // tripLocalId might be undefined if directly from FS
        if (!tripDetail) return null;

        const driverName = driverNameMap.get(tripDetail.userId) || 'Desconhecido';
        const vehicleName = vehicleNameMap.get(tripDetail.vehicleId) || 'Desconhecido';

        return {
            id: visit.firebaseId || visit.localId || visit.id,
            date: visit.timestamp ? formatDateFn(parseISO(visit.timestamp), 'dd/MM/yyyy HH:mm') : 'N/A',
            driverName,
            kmAtVisit: formatKm(visit.initialKm),
            reason: visit.reason,
            visitType: visit.visitType || 'N/A',
            clientName: visit.clientName,
            city: visit.location,
            vehicleName,
        };
    }).filter(Boolean) as AdminVisitData[];


    return {
      vehiclePerformance,
      adminVisitsTableData,
    };
  }, [isAdmin, user?.email, trips, expenses, vehicles, drivers, dateRange, vehiclePerformanceDateRange, filterDriverId, loadingDrivers, fuelings, visits, selectedVehicleIds]);

  if (authContextLoading || initialLoading) { // Show spinner if either auth is loading or dashboard data is loading
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <LoadingSpinner className="h-10 w-10" />
        <p className="ml-2 text-muted-foreground">Carregando dados do painel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <Card className="shadow-md">
           <CardHeader>
             <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" /> Filtros Globais do Painel
             </CardTitle>
           </CardHeader>
           <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
             {isAdmin && (
                <div className="space-y-1.5">
                    <Label htmlFor="driverFilter">Filtrar por Motorista (Global)</Label>
                    <Select value={filterDriverId} onValueChange={(value) => setFilterDriverId(value === 'all' ? '' : value)} disabled={loadingDrivers}>
                        <SelectTrigger id="driverFilter">
                            <SelectValue placeholder={loadingDrivers ? "Carregando..." : (drivers.length === 0 ? "Nenhum motorista" : "Todos os Motoristas")} />
                        </SelectTrigger>
                        <SelectContent>
                            {loadingDrivers ? (
                                <SelectItem value="loading" disabled>
                                    <div className="flex items-center justify-center py-2"><LoadingSpinner className="h-4 w-4"/></div>
                                </SelectItem>
                            ) : (
                                <>
                                <SelectItem value="all">Todos os Motoristas</SelectItem>
                                {drivers.length > 0 ? (
                                    drivers.map(driver => (
                                        <SelectItem key={driver.id} value={driver.id}>{driver.name || driver.email} ({driver.base})</SelectItem>
                                    ))
                                ) : (
                                    <SelectItem value="no-drivers" disabled>Nenhum motorista encontrado</SelectItem>
                                )}
                                </>
                            )}
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
          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Viagens Ativas</CardTitle>
              <Truck className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab(null)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{summaryData.activeTrips}</div>
              <p className="text-xs text-muted-foreground">{summaryData.filterContext}</p>
            </CardContent>
          </Card>
          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
              <MapPin className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('visits')} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent-foreground">{summaryData.totalVisits}</div>
              <p className="text-xs text-muted-foreground">{summaryData.filterContext}</p>
            </CardContent>
          </Card>
           <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Distância Percorrida</CardTitle>
               <Milestone className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab(null)} />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{formatKm(summaryData.totalDistance)}</div>
               <p className="text-xs text-muted-foreground">Viagens finalizadas ({summaryData.filterContext})</p>
             </CardContent>
           </Card>
           <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Valor Total Despesas</CardTitle>
               <Wallet className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('expenses')} />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{formatCurrency(summaryData.totalExpensesValue)}</div>
               <p className="text-xs text-muted-foreground">{summaryData.totalExpensesCount} registros ({summaryData.filterContext})</p>
             </CardContent>
           </Card>

          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Custo Total Abastecimento</CardTitle>
              <Fuel className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('fuelings')} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summaryData.totalFuelingsCost)}</div>
              <p className="text-xs text-muted-foreground">{summaryData.totalFuelingsCount} registros ({summaryData.filterContext})</p>
            </CardContent>
          </Card>

           {isAdmin && (
             <>
               <Card className="shadow-md transition-shadow hover:shadow-lg">
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                   <CardTitle className="text-sm font-medium">Veículos</CardTitle>
                    <Car className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab(null)} />
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{summaryData.totalVehicles}</div>
                   <p className="text-xs text-muted-foreground">Total de veículos na frota</p>
                 </CardContent>
               </Card>
                 <Card className="shadow-md transition-shadow hover:shadow-lg">
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium">Motoristas</CardTitle>
                         <Users className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary"/>
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold">{summaryData.totalDrivers}</div>
                          <p className="text-xs text-muted-foreground">{filterDriverId ? 'Motorista filtrado' : 'Total de motoristas ativos'}</p>
                     </CardContent>
                 </Card>
             </>
           )}
        </div>

      {isAdmin && user?.email === 'grupo2irmaos@grupo2irmaos.com.br' && adminDashboardData && (
        <div className="mt-8 space-y-6">
          <h2 className="text-2xl font-semibold text-primary">Painel do Administrador</h2>
            <Card>
                <CardHeader className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5" /> Lista de Visitas Recentes
                        </CardTitle>
                        <CardDescription>{summaryData.filterContext}</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    {adminDashboardData.adminVisitsTableData.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Motorista</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Cidade</TableHead>
                                    <TableHead>Veículo</TableHead>
                                    <TableHead>KM Visita</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Motivo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {adminDashboardData.adminVisitsTableData.slice(0,15).map(visit => (
                                    <TableRow key={visit.id}>
                                        <TableCell>{visit.date}</TableCell>
                                        <TableCell>{visit.driverName}</TableCell>
                                        <TableCell>{visit.clientName}</TableCell>
                                        <TableCell>{visit.city}</TableCell>
                                        <TableCell>{visit.vehicleName}</TableCell>
                                        <TableCell>{visit.kmAtVisit}</TableCell>
                                        <TableCell>{visit.visitType}</TableCell>
                                        <TableCell className="truncate max-w-xs">{visit.reason}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-muted-foreground">Nenhuma visita para exibir com os filtros atuais.</p>
                    )}
                </CardContent>
            </Card>

          <Card>
            <CardHeader className="flex flex-col gap-4">
              <div>
                <CardTitle>Performance de Veículos</CardTitle>
                <CardDescription>
                  {summaryData.filterContext}
                  {vehiclePerformanceDateRange?.from && (
                    <span className="block text-xs">
                      (Período performance: {formatDateFn(vehiclePerformanceDateRange.from, 'dd/MM/yy')}
                      {vehiclePerformanceDateRange.to ? ` - ${formatDateFn(vehiclePerformanceDateRange.to, 'dd/MM/yy')}` : ' em diante'})
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <div className="w-full sm:w-auto sm:min-w-[250px] flex-grow space-y-1.5">
                  <Label htmlFor="vehicleMultiSelect">Filtrar Veículos Específicos:</Label>
                  <MultiSelectCombobox
                    options={vehicleOptions}
                    selected={selectedVehicleIds}
                    onChange={setSelectedVehicleIds}
                    placeholder="Selecionar veículos..."
                    searchPlaceholder="Buscar veículo..."
                    emptySearchMessage="Nenhum veículo encontrado."
                    className="mt-1"
                  />
                </div>
                <div className="w-full sm:w-auto space-y-1.5">
                  <Label htmlFor="vehiclePerformanceDateRange">Filtrar Período (Performance):</Label>
                  <DateRangePicker date={vehiclePerformanceDateRange} onDateChange={setVehiclePerformanceDateRange} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
                {adminDashboardData.vehiclePerformance.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Veículo</TableHead>
                                <TableHead className="text-right">Custo Abastec. Total</TableHead>
                                <TableHead className="text-right">Litros Totais</TableHead>
                                <TableHead className="text-right">KM Total</TableHead>
                                <TableHead className="text-right">Custo Médio / KM</TableHead>
                                <TableHead className="text-right">Média KM / Litro</TableHead>
                                <TableHead className="text-right">Últ. Abastec. (Data)</TableHead>
                                <TableHead className="text-right">Últ. Abastec. (Valor/L)</TableHead>
                                <TableHead className="text-right">Últ. Abastec. (Tipo)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {adminDashboardData.vehiclePerformance.map(vehicleData => (
                                <TableRow key={vehicleData.id}>
                                    <TableCell>{vehicleData.name}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(vehicleData.totalFuelingCost)}</TableCell>
                                    <TableCell className="text-right">{vehicleData.totalLiters.toFixed(2)} L</TableCell>
                                    <TableCell className="text-right">{formatKm(vehicleData.kmDriven)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(vehicleData.avgCostPerKm)}</TableCell>
                                    <TableCell className="text-right">{vehicleData.avgKmPerLiter.toFixed(2)} Km/L</TableCell>
                                    <TableCell className="text-right">{vehicleData.latestFuelingDate}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(vehicleData.latestPricePerLiter)}</TableCell>
                                    <TableCell className="text-right">{vehicleData.latestFuelType}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-muted-foreground">
                      {selectedVehicleIds.length > 0 ? "Nenhum dos veículos selecionados possui dados de performance para os filtros atuais." : "Nenhum dado de performance de veículos para exibir com os filtros atuais."}
                    </p>
                )}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
};
