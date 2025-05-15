// src/components/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MapPin, Wallet, Fuel, Truck, Milestone, Filter, Calendar, Info, Car, Briefcase, Users } from 'lucide-react'; // Added Calendar, Info, Car, Briefcase, Users icon
import { useAuth, User } from '@/contexts/AuthContext'; // Import User type
import type { Trip } from './Trips/Trips';
import {getLocalVisits as fetchLocalVisits, getLocalExpenses, getLocalFuelings, getLocalTrips, getLocalVehicles, LocalVehicle, LocalExpense, LocalFueling, LocalTrip, LocalVisit, getLocalRecordsByRole} from '@/services/localDbService';
import { getFuelings as fetchOnlineFuelings, getVehicles as fetchOnlineVehicles, getTrips as fetchOnlineTrips, getDrivers } from '@/services/firestoreService';
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
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);
  const [filterDriverId, setFilterDriverId] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [expenses, setExpenses] = useState<LocalExpense[]>([]);
  const [fuelings, setFuelings] = useState<LocalFueling[]>([]);
  const [trips, setTrips] = useState<LocalTrip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
  const [visits, setVisits] = useState<LocalVisit[]>([]);


  useEffect(() => {
    const fetchAllLocalData = async () => {
      try {
        const driverIdToFilter = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : undefined);

        const [
            localTrips,
            localVehiclesData,
            allLocalExpenses,
            allLocalFuelings,
            allLocalVisits
        ] = await Promise.all([
          getLocalTrips(driverIdToFilter), // Filter trips directly
          getLocalVehicles(),
          getLocalExpenses(), // Fetch all, will be filtered based on trips later
          getLocalFuelings(), // Fetch all, will be filtered based on trips/vehicles later
          fetchLocalVisits(),   // Fetch all, will be filtered based on trips later
        ]);

        setTrips(localTrips);
        setVehicles(localVehiclesData);
        setExpenses(allLocalExpenses);
        setFuelings(allLocalFuelings);
        setVisits(allLocalVisits);


        if (isAdmin && navigator.onLine) {
            if (localVehiclesData.length === 0) {
                const onlineVehicles = (await fetchOnlineVehicles()).map(v => ({ ...v, localId: v.id, firebaseId: v.id, syncStatus: 'synced' } as LocalVehicle));
                setVehicles(onlineVehicles);
            }
        }

      } catch (error) {
        console.error("Error fetching initial dashboard data:", error);
        toast({ variant: "destructive", title: "Erro ao Carregar Dados", description: "Não foi possível buscar dados locais." });
      }
    };

    fetchAllLocalData();

    if (isAdmin) {
      const fetchDriversData = async () => {
        setLoadingDrivers(true);
        try {
          let localDrivers = await getLocalRecordsByRole('driver');
          if (localDrivers.length === 0 && navigator.onLine) {
            console.log("[Dashboard Admin] No local drivers, fetching online...");
            const onlineDrivers = await getDrivers(); // This fetches DriverInfo
            localDrivers = onlineDrivers.map(d => ({
              ...d, // Spread DriverInfo
              id: d.id, // Ensure id is the Firebase UID
              email: d.email,
              name: d.name || d.email || `Motorista ${d.id.substring(0,6)}`, // Ensure name
              role: 'driver', // Explicitly set role
              base: d.base || 'N/A', // Ensure base
              lastLogin: new Date().toISOString(), // Add lastLogin
            }));
          }
          const mappedDrivers = localDrivers.filter(d => d.role === 'driver').map(d => ({
              ...d,
              name: d.name || d.email || `ID ${d.id.substring(0, 6)}`
          }));
          setDrivers(mappedDrivers);
        } catch (error) {
          console.error("Error fetching drivers:", error);
          toast({ variant: "destructive", title: "Erro ao Carregar Motoristas", description: "Não foi possível buscar a lista de motoristas." });
        } finally {
          setLoadingDrivers(false);
        }
      };
      fetchDriversData();
    } else {
        setLoadingDrivers(false);
    }
  }, [isAdmin, user?.id, toast, filterDriverId]);


  const summaryData = useMemo(() => {
    let currentFilteredTrips = trips;
    let allVisitsFromDb = visits;
    let allExpensesFromDb = expenses;
    let allFuelingsFromDb = fuelings;

    if (dateRange?.from) {
        const startDate = startOfDay(dateRange.from);
        const endDate = dateRange.to ? endOfDay(dateRange.to) : null;
        const interval = { start: startDate, end: endDate || new Date(8640000000000000) };

        currentFilteredTrips = currentFilteredTrips.filter(t => { try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; } });
        allVisitsFromDb = allVisitsFromDb.filter(v => { try { return isWithinInterval(parseISO(v.timestamp), interval); } catch { return false; } });
        allExpensesFromDb = allExpensesFromDb.filter(e => { try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; } });
        allFuelingsFromDb = allFuelingsFromDb.filter(f => { try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; } });
    }

    const relevantTripLocalIds = new Set(currentFilteredTrips.map(t => t.localId));

    const filteredVisits = allVisitsFromDb.filter(v => v.tripLocalId && relevantTripLocalIds.has(v.tripLocalId));
    const filteredExpenses = allExpensesFromDb.filter(e => e.tripLocalId && relevantTripLocalIds.has(e.tripLocalId));
    const currentFuelings = allFuelingsFromDb.filter(f => f.tripLocalId && relevantTripLocalIds.has(f.tripLocalId));


    const activeTripsCount = currentFilteredTrips.filter(t => t.status === 'Andamento').length;
    const totalVisitsCount = filteredVisits.length;
    const totalExpensesCount = filteredExpenses.length;
    const totalExpensesValue = filteredExpenses.reduce((sum, e) => sum + e.value, 0);
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
            driverNameForContext = driver?.name || `ID: ${filterDriverId.substring(0,6)}...`;
        }
        filterContext = `Motorista: ${driverNameForContext}`;
    } else {
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
  }, [isAdmin, filterDriverId, dateRange, drivers, expenses, fuelings, trips, vehicles, visits]);

  const adminDashboardData = useMemo(() => {
    if (!isAdmin || user?.email !== 'grupo2irmaos@grupo2irmaos.com.br' || loadingDrivers) {
      return null;
    }

    let currentTripsSource = filterDriverId
        ? trips.filter(t => t.userId === filterDriverId)
        : trips;

    let currentExpensesSource = expenses;
    let currentFuelingsSource = fuelings;
    let currentVisitsSource = visits;


    if (dateRange?.from) {
        const startDate = startOfDay(dateRange.from);
        const endDate = dateRange.to ? endOfDay(dateRange.to) : null;
        const interval = { start: startDate, end: endDate || new Date(8640000000000000) };

        currentTripsSource = currentTripsSource.filter(t => { try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; } });
        currentExpensesSource = currentExpensesSource.filter(e => { try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; } });
        currentFuelingsSource = currentFuelingsSource.filter(f => { try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; } });
        currentVisitsSource = currentVisitsSource.filter(v => { try { return isWithinInterval(parseISO(v.timestamp), interval); } catch { return false; }});
    }
    
    const relevantTripIdsForCharts = new Set(currentTripsSource.map(t => t.localId));
    currentExpensesSource = currentExpensesSource.filter(e => e.tripLocalId && relevantTripIdsForCharts.has(e.tripLocalId));
    // No need to filter fuelings by trip for vehicle performance, but filter if for driver ranking
    const fuelingsForDriverRanking = currentFuelingsSource.filter(f => f.tripLocalId && relevantTripIdsForCharts.has(f.tripLocalId));


    const driverNameMap = new Map(drivers.map(d => [d.id, d.name || d.email || `Motorista Desconhecido`]));
    const vehicleNameMap = new Map(vehicles.map(v => [v.firebaseId || v.localId, `${v.model} (${v.licensePlate})`]));
    const tripDetailsMap = new Map(currentTripsSource.map(t => [t.localId, { vehicleId: t.vehicleId, userId: t.userId }]));


    const tripsByDriver: Record<string, { count: number; totalDistance: number; totalExpenses: number, name?: string }> = {};

    currentTripsSource.forEach(trip => {
      const driverIdFromTrip = trip.userId;
      const resolvedDriverName = driverNameMap.get(driverIdFromTrip) || `Motorista (${driverIdFromTrip.substring(0,6)}...)`;
      const aggregationKey = resolvedDriverName;


      if (!tripsByDriver[aggregationKey]) {
        tripsByDriver[aggregationKey] = { count: 0, totalDistance: 0, totalExpenses: 0, name: resolvedDriverName };
      }
      tripsByDriver[aggregationKey].count++;
      tripsByDriver[aggregationKey].totalDistance += trip.totalDistance || 0;

      const tripExpenses = currentExpensesSource.filter(e => e.tripLocalId === trip.localId);
      tripExpenses.forEach(expense => {
        tripsByDriver[aggregationKey].totalExpenses += expense.value;
      });
    });


    const chartableTripsByDriver = Object.values(tripsByDriver)
      .map(data => ({ name: data.name, trips: data.count, distance: data.totalDistance, expenses: data.totalExpenses }))
      .sort((a,b) => b.trips - a.trips)
      .slice(0, 10);


    // Vehicle Performance Calculation
    const vehiclePerformance = vehicles.map(vehicle => {
        const vehicleFuelings = currentFuelingsSource.filter(f => f.vehicleId === (vehicle.firebaseId || vehicle.localId));
        const vehicleTrips = currentTripsSource.filter(t => t.vehicleId === (vehicle.firebaseId || vehicle.localId));

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
        
        const totalKmFromTrips = vehicleTrips
            .filter(t => t.status === 'Finalizado' && t.totalDistance != null)
            .reduce((sum, t) => sum + (t.totalDistance || 0), 0);

        const kmDriven = totalKmFromFuelings > 0 ? totalKmFromFuelings : totalKmFromTrips;

        const avgCostPerKm = kmDriven > 0 ? totalFuelingCost / kmDriven : 0;
        const avgKmPerLiter = totalLiters > 0 && kmDriven > 0 ? kmDriven / totalLiters : 0;
        const latestFuelingDate = sortedFuelings.length > 0 ? formatDateFn(parseISO(sortedFuelings[sortedFuelings.length - 1].date), 'dd/MM/yyyy') : 'N/A';
        const latestPricePerLiter = sortedFuelings.length > 0 ? sortedFuelings[sortedFuelings.length - 1].pricePerLiter : 0;
        const latestFuelType = sortedFuelings.length > 0 ? sortedFuelings[sortedFuelings.length - 1].fuelType : 'N/A';


        return {
            id: vehicle.firebaseId || vehicle.localId,
            name: `${vehicle.model} (${vehicle.licensePlate})`,
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

    // Prepare data for Visits Table
    const adminVisitsTableData: AdminVisitData[] = currentVisitsSource
      .map(visit => {
        const tripDetail = tripDetailsMap.get(visit.tripLocalId);
        if (!tripDetail) return null; 

        const driverName = driverNameMap.get(tripDetail.userId) || 'Desconhecido';
        const vehicleName = vehicleNameMap.get(tripDetail.vehicleId) || 'Desconhecido';

        return {
            id: visit.firebaseId || visit.localId,
            date: formatDateFn(parseISO(visit.timestamp), 'dd/MM/yyyy HH:mm'),
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
      tripsByDriver: chartableTripsByDriver,
      vehiclePerformance,
      adminVisitsTableData,
    };
  }, [isAdmin, user?.email, trips, expenses, vehicles, drivers, dateRange, filterDriverId, loadingDrivers, fuelings, visits]);


  return (
    <div className="space-y-6">
       <Card className="shadow-md">
           <CardHeader>
             <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" /> Filtros do Painel
             </CardTitle>
           </CardHeader>
           <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
             {isAdmin && (
                <div className="space-y-1.5">
                    <Label htmlFor="driverFilter">Filtrar por Motorista</Label>
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
                                        <SelectItem key={driver.id} value={driver.id}>{driver.name} ({driver.base})</SelectItem>
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
                <Label>Filtrar por Data (Criação/Registro)</Label>
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
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" /> Lista de Visitas Recentes
                    </CardTitle>
                    <CardDescription>{summaryData.filterContext}</CardDescription>
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
                                {adminDashboardData.adminVisitsTableData.slice(0,15).map(visit => ( // Show recent 15
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
            <CardHeader>
                <CardTitle>Performance de Veículos</CardTitle>
                <CardDescription>{summaryData.filterContext}</CardDescription>
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
                    <p className="text-muted-foreground">Nenhum dado de performance de veículos para exibir com os filtros atuais.</p>
                )}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
};
