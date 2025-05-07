// src/components/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MapPin, Wallet, Fuel, Users, Truck, Milestone, Filter, BarChart3, LineChart, TrendingUp, CalendarCheck2 } from 'lucide-react';
import { useAuth, User } from '@/contexts/AuthContext';
import type { Trip } from './Trips/Trips';
import {
    getLocalVisits as fetchLocalVisits,
    getLocalExpenses,
    getLocalFuelings,
    getLocalTrips,
    getLocalVehicles,
    LocalVehicle,
    LocalExpense,
    LocalFueling,
    LocalTrip,
    LocalVisit
} from '@/services/localDbService';
import { getFuelings as fetchOnlineFuelings, getVehicles as fetchOnlineVehicles, getTrips as fetchOnlineTrips, getDrivers } from '@/services/firestoreService';
import type { VehicleInfo } from './Vehicle';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO, startOfDay, endOfDay, format as formatDateFn, eachDayOfInterval, differenceInDays } from 'date-fns';
import { LoadingSpinner } from './LoadingSpinner';
import { formatKm, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartConfig,
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart as ReLineChart, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from "recharts"

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface DashboardProps {
    setActiveTab: (section: 'visits' | 'expenses' | 'fuelings' | 'trips' | null) => void;
}

const chartConfigBase = {
  value: { label: "Valor" },
  count: { label: "Quantidade", color: "hsl(var(--chart-2))" },
  distance: { label: "Distância (Km)", color: "hsl(var(--chart-3))" },
  cost: { label: "Custo (R$)", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig;


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
        const [localTrips, localVehiclesData, localExpensesData, localFuelingsData, localVisitsData] = await Promise.all([
          getLocalTrips(isAdmin ? undefined : user?.id),
          getLocalVehicles(),
          getLocalExpenses().then(data => data.flat()), // Assuming getLocalExpenses now returns all if no arg
          getLocalFuelings().then(data => data.flat()), // Assuming getLocalFuelings now returns all if no arg
          fetchLocalVisits().then(data => data.flat())   // Assuming getLocalVisits now returns all if no arg
        ]);

        setTrips(localTrips);
        setVehicles(localVehiclesData);
        setExpenses(localExpensesData);
        setFuelings(localFuelingsData);
        setVisits(localVisitsData);

        // If local is empty and online, fetch from Firebase (only for admin or specific data)
        if (isAdmin && navigator.onLine) {
            if (localTrips.length === 0) {
                const onlineTrips = (await fetchOnlineTrips()).map(t => ({ ...t, localId: t.id, syncStatus: 'synced' } as LocalTrip));
                setTrips(onlineTrips);
            }
            if (localVehiclesData.length === 0) {
                const onlineVehicles = (await fetchOnlineVehicles()).map(v => ({ ...v, localId: v.id, syncStatus: 'synced' } as LocalVehicle));
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
          const fetchedDrivers = await getDrivers();
          setDrivers(fetchedDrivers.filter(d => d.role === 'driver'));
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
  }, [isAdmin, user?.id, toast]);


  const summaryData = useMemo(() => {
    let filteredTrips = trips;
    let filteredVisits = visits;
    let filteredExpenses = expenses;
    let filteredFuelings = fuelings;

    if (dateRange?.from && dateRange?.to) {
        const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) };
        filteredTrips = trips.filter(t => { try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; } });
        filteredVisits = visits.filter(v => { try { return isWithinInterval(parseISO(v.timestamp), interval); } catch { return false; } });
        filteredExpenses = expenses.filter(e => { try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; } });
        filteredFuelings = fuelings.filter(f => { try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; } });
    } else if (dateRange?.from) {
        const startDate = startOfDay(dateRange.from);
        filteredTrips = trips.filter(t => { try { return parseISO(t.createdAt) >= startDate; } catch { return false; } });
        filteredVisits = visits.filter(v => { try { return parseISO(v.timestamp) >= startDate; } catch { return false; } });
        filteredExpenses = expenses.filter(e => { try { return parseISO(e.expenseDate) >= startDate; } catch { return false; } });
        filteredFuelings = fuelings.filter(f => { try { return parseISO(f.date) >= startDate; } catch { return false; } });
    }

    const driverIdToFilter = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : null);

    if (driverIdToFilter) {
        filteredTrips = filteredTrips.filter(t => t.userId === driverIdToFilter);
        const tripLocalIdsForDriver = filteredTrips.map(t => t.localId);
        filteredVisits = filteredVisits.filter(v => tripLocalIdsForDriver.includes(v.tripLocalId || ''));
        filteredExpenses = filteredExpenses.filter(e => tripLocalIdsForDriver.includes(e.tripLocalId || ''));
        filteredFuelings = filteredFuelings.filter(f => tripLocalIdsForDriver.includes(f.tripLocalId || ''));
    }


    const activeTripsCount = filteredTrips.filter(t => t.status === 'Andamento').length;
    const totalVisitsCount = filteredVisits.length;
    const totalExpensesCount = filteredExpenses.length;
    const totalExpensesValue = filteredExpenses.reduce((sum, e) => sum + e.value, 0);
    const totalFuelingsCount = filteredFuelings.length;
    const totalFuelingsCost = filteredFuelings.reduce((sum, f) => sum + f.totalCost, 0);
    const totalDistanceValue = filteredTrips
        .filter(t => t.status === 'Finalizado' && t.totalDistance != null)
        .reduce((sum, t) => sum + (t.totalDistance ?? 0), 0);

    let filterContext = 'Todas as Atividades';
    if (isAdmin) {
        filterContext = `${filterDriverId ? `Motorista: ${drivers.find(d => d.id === filterDriverId)?.name}` : 'Todos os Motoristas'}`;
    } else {
        filterContext = `Suas Atividades`;
    }
    if (dateRange?.from) {
        filterContext += ` (${formatDateFn(dateRange.from, 'dd/MM/yy')}${dateRange.to ? ` - ${formatDateFn(dateRange.to, 'dd/MM/yy')}` : ' em diante'})`;
    }

    // --- New Metrics Calculations ---
    const tripsByDriver = drivers.map(driver => {
        const driverTrips = filteredTrips.filter(t => t.userId === driver.id);
        const driverExpenses = expenses.filter(e => driverTrips.some(dt => dt.localId === e.tripLocalId));
        const driverFuelings = fuelings.filter(f => driverTrips.some(dt => dt.localId === f.tripLocalId));
        const totalDistance = driverTrips.filter(t => t.status === 'Finalizado' && t.totalDistance != null).reduce((sum, t) => sum + (t.totalDistance ?? 0), 0);
        const totalCost = driverExpenses.reduce((sum, e) => sum + e.value, 0) + driverFuelings.reduce((sum, f) => sum + f.totalCost, 0);
        return {
            driverId: driver.id,
            driverName: driver.name || 'Desconhecido',
            tripCount: driverTrips.length,
            totalDistance,
            totalCost,
            costPerKm: totalDistance > 0 ? totalCost / totalDistance : 0,
        };
    }).sort((a, b) => b.tripCount - a.tripCount); // Sort by trip count desc


    const tripsOverTimeData = filteredTrips.reduce((acc, trip) => {
        const dateKey = formatDateFn(parseISO(trip.createdAt), 'dd/MM');
        acc[dateKey] = (acc[dateKey] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const tripsOverTimeChartData = Object.entries(tripsOverTimeData)
        .map(([date, count]) => ({ date, count }))
        .sort((a,b) => parseISO('2000/' + b.date.split('/').reverse().join('/')).getTime() - parseISO('2000/' + a.date.split('/').reverse().join('/')).getTime()) //簡易ソート
        .reverse(); // Correct sort by date


    const vehiclePerformance = vehicles.map(vehicle => {
        const vehicleTrips = filteredTrips.filter(t => t.vehicleId === (vehicle.id || vehicle.localId));
        const vehicleExpenses = expenses.filter(e => vehicleTrips.some(vt => vt.localId === e.tripLocalId));
        const vehicleFuelings = fuelings.filter(f => vehicleTrips.some(vt => vt.localId === f.tripLocalId));
        const totalDistance = vehicleTrips.filter(t => t.status === 'Finalizado' && t.totalDistance != null).reduce((sum, t) => sum + (t.totalDistance ?? 0), 0);
        const totalCost = vehicleExpenses.reduce((sum, e) => sum + e.value, 0) + vehicleFuelings.reduce((sum, f) => sum + f.totalCost, 0);
        return {
            vehicleId: vehicle.id || vehicle.localId,
            vehicleName: `${vehicle.model} (${vehicle.licensePlate})`,
            tripCount: vehicleTrips.length,
            totalDistance,
            totalCost,
            costPerKm: totalDistance > 0 ? totalCost / totalDistance : 0,
        };
    });

    const avgKmPerDay = () => {
        if(!dateRange || !dateRange.from || !dateRange.to) return 0;
        const days = differenceInDays(dateRange.to, dateRange.from) + 1;
        return days > 0 ? totalDistanceValue / days : 0;
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
        totalVehicles: isAdmin ? vehicles.length : 0,
        filterApplied: !!filterDriverId || !!dateRange,
        filterContext,
        tripsByDriver,
        tripsOverTimeChartData,
        vehiclePerformance,
        avgKmPerDay: avgKmPerDay(),
    };
  }, [isAdmin, user?.id, filterDriverId, dateRange, drivers, expenses, fuelings, trips, vehicles, visits]);

  const driverRankingChartConfig = {
      ...chartConfigBase,
      tripCount: { label: "Nº Viagens", color: "hsl(var(--chart-1))" },
      totalDistance: { label: "Distância Total (Km)", color: "hsl(var(--chart-2))" },
  } satisfies ChartConfig;

   const tripsTimeChartConfig = {
      ...chartConfigBase,
      count: { label: "Nº de Viagens", color: "hsl(var(--chart-1))" },
  } satisfies ChartConfig;


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
                                    <div className="flex items-center justify-center py-2"><LoadingSpinner className="h-4 w-4" /></div>
                                </SelectItem>
                            ) : (
                               <>
                                <SelectItem value="all">Todos os Motoristas</SelectItem>
                                {drivers.length > 0 ? (
                                    drivers.map(driver => (
                                        <SelectItem key={driver.id} value={driver.id}>{driver.name} ({driver.base})</SelectItem>
                                    ))
                                ) : (
                                    <SelectItem value="no-drivers" disabled>Nenhum motorista</SelectItem>
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
               <BarChart3 className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
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
               <Milestone className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
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
                   <CardTitle className="text-sm font-medium">Motoristas</CardTitle>
                    <Users className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('drivers')} />
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{summaryData.totalDrivers}</div>
                   <p className="text-xs text-muted-foreground">{filterDriverId ? 'Motorista selecionado' : (drivers.length > 0 ? 'Total de motoristas' : 'Nenhum motorista')}</p>
                 </CardContent>
               </Card>
               <Card className="shadow-md transition-shadow hover:shadow-lg">
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                   <CardTitle className="text-sm font-medium">Veículos</CardTitle>
                    <Truck className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('vehicle')} />
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{summaryData.totalVehicles}</div>
                   <p className="text-xs text-muted-foreground">Total de veículos na frota</p>
                 </CardContent>
               </Card>
                <Card className="shadow-md transition-shadow hover:shadow-lg">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Média Km/Dia</CardTitle>
                        <CalendarCheck2 className="h-5 w-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{dateRange?.from && dateRange?.to ? formatKm(summaryData.avgKmPerDay) : 'N/A'}</div>
                        <p className="text-xs text-muted-foreground">
                            {dateRange?.from && dateRange?.to ? `No período selecionado (${summaryData.filterContext})` : "Selecione um período com início e fim"}
                        </p>
                    </CardContent>
                </Card>
             </>
           )}
        </div>

        {isAdmin && (
            <div className="space-y-6 mt-6">
                <h2 className="text-xl font-semibold text-primary">Análise de Desempenho ({summaryData.filterContext})</h2>
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Top Motoristas por Nº de Viagens</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {summaryData.tripsByDriver.length > 0 ? (
                                <ChartContainer config={driverRankingChartConfig} className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={summaryData.tripsByDriver.slice(0, 5)} layout="vertical" margin={{ right: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis type="number" />
                                            <YAxis dataKey="driverName" type="category" width={120} tick={{ fontSize: 12 }} />
                                            <RechartsTooltip content={<ChartTooltipContent />} />
                                            <Legend content={<ChartLegendContent />} />
                                            <Bar dataKey="tripCount" fill="var(--color-tripCount)" radius={4} name="Nº de Viagens" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                            ) : <p className="text-muted-foreground">Nenhum dado de viagem de motorista para exibir.</p>}
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Top Motoristas por Distância (Km)</CardTitle>
                        </CardHeader>
                        <CardContent>
                             {summaryData.tripsByDriver.filter(d => d.totalDistance > 0).length > 0 ? (
                                <ChartContainer config={driverRankingChartConfig} className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={summaryData.tripsByDriver.filter(d => d.totalDistance > 0).sort((a,b)=> b.totalDistance - a.totalDistance).slice(0, 5)} layout="vertical" margin={{ right: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis type="number" tickFormatter={(value) => formatKm(value)} />
                                            <YAxis dataKey="driverName" type="category" width={120} tick={{ fontSize: 12 }} />
                                            <RechartsTooltip content={<ChartTooltipContent />} formatter={(value: number) => formatKm(value)} />
                                            <Legend content={<ChartLegendContent />} />
                                            <Bar dataKey="totalDistance" fill="var(--color-totalDistance)" radius={4} name="Distância Total" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                            ) : <p className="text-muted-foreground">Nenhum dado de distância de motorista para exibir.</p>}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><LineChart className="h-5 w-5" />Viagens ao Longo do Tempo</CardTitle>
                         <CardDescription>{summaryData.filterContext}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {summaryData.tripsOverTimeChartData.length > 0 ? (
                            <ChartContainer config={tripsTimeChartConfig} className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ReLineChart data={summaryData.tripsOverTimeChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                        <RechartsTooltip content={<ChartTooltipContent indicator="line" />} />
                                        <Legend content={<ChartLegendContent />} />
                                        <Line type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} dot={false} name="Nº de Viagens"/>
                                    </ReLineChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ): <p className="text-muted-foreground">Nenhum dado de viagem para exibir o gráfico de tempo.</p>}
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />Desempenho por Veículo</CardTitle>
                         <CardDescription>{summaryData.filterContext}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {summaryData.vehiclePerformance.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-2 font-medium text-muted-foreground">Veículo</th>
                                            <th className="text-right p-2 font-medium text-muted-foreground">Viagens</th>
                                            <th className="text-right p-2 font-medium text-muted-foreground">Distância</th>
                                            <th className="text-right p-2 font-medium text-muted-foreground">Custo Total</th>
                                            <th className="text-right p-2 font-medium text-muted-foreground">Custo/Km</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summaryData.vehiclePerformance.map(v => (
                                            <tr key={v.vehicleId} className="border-b last:border-b-0 hover:bg-muted/50">
                                                <td className="p-2">{v.vehicleName}</td>
                                                <td className="text-right p-2">{v.tripCount}</td>
                                                <td className="text-right p-2">{formatKm(v.totalDistance)}</td>
                                                <td className="text-right p-2">{formatCurrency(v.totalCost)}</td>
                                                <td className="text-right p-2">{formatCurrency(v.costPerKm)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ): <p className="text-muted-foreground">Nenhum dado de desempenho de veículo para exibir.</p>}
                    </CardContent>
                </Card>
            </div>
        )}
    </div>
  );
};
