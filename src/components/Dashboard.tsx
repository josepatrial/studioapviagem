// src/components/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MapPin, Wallet, Fuel, Truck, Milestone, Filter, Calendar, Info, Car } from 'lucide-react'; // Added Calendar, Info and Car icon
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


export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(isAdmin);
  const [filterDriverId, setFilterDriverId] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [expenses, setExpenses] = useState<LocalExpense[]>([]);
  const [fuelings, setFuelings] = useState<LocalFueling[]>([]); // Changed from fuelingsData to fuelings
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
        setFuelings(allLocalFuelings); // Use setFuelings
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
    let allFuelingsFromDb = fuelings; // Use fuelings here

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
  }, [isAdmin, filterDriverId, dateRange, drivers, expenses, fuelings, trips, vehicles, visits]); // Use fuelings in dependency array

  const adminDashboardData = useMemo(() => {
    if (!isAdmin || user?.email !== 'grupo2irmaos@grupo2irmaos.com.br' || loadingDrivers) {
      return null;
    }

    let currentTripsSource = filterDriverId
        ? trips.filter(t => t.userId === filterDriverId)
        : trips;

    let currentExpensesSource = expenses;
    let currentFuelingsSource = fuelings; // Use fuelings here

    if (dateRange?.from) {
        const startDate = startOfDay(dateRange.from);
        const endDate = dateRange.to ? endOfDay(dateRange.to) : null;
        const interval = { start: startDate, end: endDate || new Date(8640000000000000) };

        currentTripsSource = currentTripsSource.filter(t => { try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; } });
        currentExpensesSource = currentExpensesSource.filter(e => { try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; } });
        currentFuelingsSource = currentFuelingsSource.filter(f => { try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; } });
    }
    
    const relevantTripIdsForCharts = new Set(currentTripsSource.map(t => t.localId));
    currentExpensesSource = currentExpensesSource.filter(e => e.tripLocalId && relevantTripIdsForCharts.has(e.tripLocalId));
    // No need to filter fuelings by trip for vehicle performance, but filter if for driver ranking
    const fuelingsForDriverRanking = currentFuelingsSource.filter(f => f.tripLocalId && relevantTripIdsForCharts.has(f.tripLocalId));


    const driverNameMap = new Map(drivers.map(d => [d.id, d.name || d.email || `Motorista Desconhecido`]));

    const tripsByDriver: Record<string, { count: number; totalDistance: number; totalExpenses: number, name?: string }> = {};
    const kmByDay: Record<string, number> = {};

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

      if (trip.status === 'Finalizado' && trip.totalDistance) {
        try {
            const tripDate = formatDateFn(parseISO(trip.createdAt), 'dd/MM/yyyy');
            kmByDay[tripDate] = (kmByDay[tripDate] || 0) + trip.totalDistance;
        } catch (e) {
            console.warn("Could not parse trip createdAt for kmByDay:", trip.createdAt, e);
        }
      }
    });


    const chartableTripsByDriver = Object.values(tripsByDriver)
      .map(data => ({ name: data.name, trips: data.count, distance: data.totalDistance, expenses: data.totalExpenses }))
      .sort((a,b) => b.trips - a.trips)
      .slice(0, 10);

    const chartableKmByDay = Object.entries(kmByDay)
        .map(([date, km]) => ({ date, km }))
        .sort((a,b) => {
             try {
                const dateA = parseISO(a.date.split('/').reverse().join('-'));
                const dateB = parseISO(b.date.split('/').reverse().join('-'));
                return dateA.getTime() - dateB.getTime();
             } catch { return 0; }
        })
        .slice(-30);

    // Vehicle Performance Calculation
    const vehiclePerformance = vehicles.map(vehicle => {
        const vehicleFuelings = currentFuelingsSource.filter(f => f.vehicleId === (vehicle.firebaseId || vehicle.localId));
        const vehicleTrips = currentTripsSource.filter(t => t.vehicleId === (vehicle.firebaseId || vehicle.localId));

        const totalFuelingCost = vehicleFuelings.reduce((sum, f) => sum + f.totalCost, 0);
        const totalLiters = vehicleFuelings.reduce((sum, f) => sum + f.liters, 0);
        
        // Calculate total KM driven for this vehicle from its fuelings (odometer difference)
        // Sort fuelings by date and odometer to calculate KM driven between fuelings
        const sortedFuelings = [...vehicleFuelings].sort((a, b) => {
            const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            return a.odometerKm - b.odometerKm;
        });

        let totalKmFromFuelings = 0;
        if (sortedFuelings.length > 1) {
            totalKmFromFuelings = sortedFuelings[sortedFuelings.length - 1].odometerKm - sortedFuelings[0].odometerKm;
        } else if (sortedFuelings.length === 1 && vehicleTrips.length === 0) {
             // If only one fueling and no trips, cannot determine km accurately
             // Or, could use trip distance if available, but that might double count.
             // For now, prioritize odometer if multiple fuelings exist.
        }
        
        // Fallback or complement with trip distances if odometer data is insufficient
        const totalKmFromTrips = vehicleTrips
            .filter(t => t.status === 'Finalizado' && t.totalDistance != null)
            .reduce((sum, t) => sum + (t.totalDistance || 0), 0);

        // Prefer odometer-based KM if available and significant
        const kmDriven = totalKmFromFuelings > 0 ? totalKmFromFuelings : totalKmFromTrips;


        const avgCostPerKm = kmDriven > 0 ? totalFuelingCost / kmDriven : 0;
        const avgKmPerLiter = totalLiters > 0 && kmDriven > 0 ? kmDriven / totalLiters : 0;

        return {
            id: vehicle.firebaseId || vehicle.localId,
            name: `${vehicle.model} (${vehicle.licensePlate})`,
            totalFuelingCost,
            totalLiters,
            kmDriven,
            avgCostPerKm,
            avgKmPerLiter,
        };
    }).sort((a,b) => b.kmDriven - a.kmDriven);


    return {
      tripsByDriver: chartableTripsByDriver,
      kmByDay: chartableKmByDay,
      vehiclePerformance,
    };
  }, [isAdmin, user?.email, trips, expenses, vehicles, drivers, dateRange, filterDriverId, loadingDrivers, fuelings]); // Use fuelings in dependency array


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
             </>
           )}
        </div>

      {isAdmin && user?.email === 'grupo2irmaos@grupo2irmaos.com.br' && adminDashboardData && (
        <div className="mt-8 space-y-6">
          <h2 className="text-2xl font-semibold text-primary">Painel do Administrador</h2>


          <Card>
                <CardHeader>
                    <CardTitle>KM Percorridos por Dia (Últimos 30 dias com viagens)</CardTitle>
                    <CardDescription>{summaryData.filterContext}</CardDescription>
                </CardHeader>
                <CardContent>
                    {adminDashboardData.kmByDay.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={adminDashboardData.kmByDay} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis label={{ value: 'KM', angle: -90, position: 'insideLeft' }}/>
                                <Tooltip formatter={(value) => formatKm(value as number)} />
                                <Legend verticalAlign="top"/>
                                <Bar dataKey="km" fill="hsl(var(--chart-1))" name="KM Percorridos" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-muted-foreground">Nenhum dado de KM por dia para exibir com os filtros atuais.</p>
                    )}
                </CardContent>
            </Card>


          <Card>
            <CardHeader>
              <CardTitle>Ranking de Motoristas</CardTitle>
              <CardDescription>{summaryData.filterContext}</CardDescription>
            </CardHeader>
            <CardContent>
              {adminDashboardData.tripsByDriver.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Motorista</TableHead>
                            <TableHead className="text-right">Viagens</TableHead>
                            <TableHead className="text-right">Distância Total</TableHead>
                            <TableHead className="text-right">Despesas Totais</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {adminDashboardData.tripsByDriver.map(driverData => (
                            <TableRow key={driverData.name}>
                                <TableCell>{driverData.name}</TableCell>
                                <TableCell className="text-right">{driverData.trips}</TableCell>
                                <TableCell className="text-right">{formatKm(driverData.distance)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(driverData.expenses)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              ) : (
                 <p className="text-muted-foreground">Nenhum dado para exibir no ranking de motoristas com os filtros atuais.</p>
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
