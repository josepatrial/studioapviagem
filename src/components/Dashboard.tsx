// src/components/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MapPin, Wallet, Fuel, Users, Truck, Milestone, Filter, Calendar, Info } from 'lucide-react'; // Added Calendar and Info icon
import { useAuth, User } from '@/contexts/AuthContext'; // Import User type
import type { Trip } from './Trips/Trips';
import {getLocalVisits as fetchLocalVisits, getLocalExpenses, getLocalFuelings, getLocalTrips, getLocalVehicles, LocalVehicle, LocalExpense, LocalFueling, LocalTrip, LocalVisit} from '@/services/localDbService';
import { getFuelings as fetchOnlineFuelings, getVehicles as fetchOnlineVehicles, getTrips as fetchOnlineTrips, getDrivers } from '@/services/firestoreService';
import type { VehicleInfo } from './Vehicle';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO, startOfDay, endOfDay, format as formatDateFn } from 'date-fns';
import { LoadingSpinner } from './LoadingSpinner';
import { formatKm } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface DashboardProps {
    setActiveTab: (section: 'visits' | 'expenses' | 'fuelings' | 'trips' | null) => void;
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
        const [localTrips, localVehiclesData, localExpensesData, localFuelingsData, localVisitsData] = await Promise.all([
          getLocalTrips(isAdmin ? undefined : user?.id),
          getLocalVehicles(),
          getLocalExpenses(user?.id || ''),
          getLocalFuelings(user?.id || '', isAdmin ? 'userId' : 'userId'),
          fetchLocalVisits(user?.id || '')
        ]);

        setTrips(localTrips);
        setVehicles(localVehiclesData);
        setExpenses(localExpensesData);
        setFuelings(localFuelingsData);
        setVisits(localVisitsData);

        if (isAdmin && navigator.onLine) {
            if (localTrips.length === 0) {
                const onlineTrips = (await fetchOnlineTrips()).map(t => ({ ...t, localId: t.id, syncStatus: 'synced' } as LocalTrip));
                setTrips(onlineTrips);
            }
            if (localVehiclesData.length === 0) {
                const onlineVehicles = (await fetchOnlineVehicles()).map(v => ({ ...v, localId: v.id, syncStatus: 'synced' } as LocalVehicle));
                setVehicles(onlineVehicles);
            }
             if (localFuelingsData.length === 0) {
                const onlineFuelings = (await fetchOnlineFuelings(undefined)).map(f => ({ ...f, localId: f.id, syncStatus: 'synced', odometerKm: f.odometerKm || 0 } as LocalFueling));
                setFuelings(onlineFuelings);
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
    let currentFuelings = fuelings;

    if (dateRange?.from && dateRange?.to) {
        const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) };
        filteredTrips = trips.filter(t => { try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; } });
        filteredVisits = visits.filter(v => { try { return isWithinInterval(parseISO(v.timestamp), interval); } catch { return false; } });
        filteredExpenses = expenses.filter(e => { try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; } });
        currentFuelings = fuelings.filter(f => { try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; } });
    } else if (dateRange?.from) {
        const startDate = startOfDay(dateRange.from);
        filteredTrips = trips.filter(t => { try { return parseISO(t.createdAt) >= startDate; } catch { return false; } });
        filteredVisits = visits.filter(v => { try { return parseISO(v.timestamp) >= startDate; } catch { return false; } });
        filteredExpenses = expenses.filter(e => { try { return parseISO(e.expenseDate) >= startDate; } catch { return false; } });
        currentFuelings = fuelings.filter(f => { try { return parseISO(f.date) >= startDate; } catch { return false; } });
    }

    const driverIdToFilter = isAdmin && filterDriverId ? filterDriverId : (!isAdmin && user ? user.id : null);

    if (driverIdToFilter) {
        filteredTrips = filteredTrips.filter(t => t.userId === driverIdToFilter);
        const tripLocalIdsForDriver = filteredTrips.map(t => t.localId);
        filteredVisits = filteredVisits.filter(v => tripLocalIdsForDriver.includes(v.tripLocalId || ''));
        filteredExpenses = filteredExpenses.filter(e => tripLocalIdsForDriver.includes(e.tripLocalId || ''));
        currentFuelings = currentFuelings.filter(f => tripLocalIdsForDriver.includes(f.tripLocalId || ''));
    }

    const activeTripsCount = filteredTrips.filter(t => t.status === 'Andamento').length;
    const totalVisitsCount = filteredVisits.length;
    const totalExpensesCount = filteredExpenses.length;
    const totalExpensesValue = filteredExpenses.reduce((sum, e) => sum + e.value, 0);
    const totalFuelingsCount = currentFuelings.length;
    const totalFuelingsCost = currentFuelings.reduce((sum, f) => sum + f.totalCost, 0);
    const totalDistanceValue = filteredTrips
        .filter(t => t.status === 'Finalizado' && t.totalDistance != null)
        .reduce((sum, t) => sum + (t.totalDistance || 0), 0);

    let filterContext = 'Todas as Atividades';
    if (isAdmin) {
        filterContext = `${filterDriverId ? `Motorista: ${drivers.find(d => d.id === filterDriverId)?.name}` : 'Todos os Motoristas'}`;
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
        totalVehicles: isAdmin ? vehicles.length : 0,
        filterApplied: !!filterDriverId || !!dateRange,
        filterContext,
    };
  }, [isAdmin, user?.id, filterDriverId, dateRange, drivers, expenses, fuelings, trips, vehicles, visits]);

  const adminDashboardData = useMemo(() => {
    if (!isAdmin || user?.email !== 'grupo2irmaos@grupo2irmaos.com.br') {
      return null;
    }

    let currentTripsSource = trips;
    let currentExpensesSource = expenses;
    let currentFuelingsSource = fuelings;
    
    // Apply date range filter if selected
    if (dateRange?.from && dateRange?.to) {
        const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) };
        currentTripsSource = trips.filter(t => { try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; } });
        currentExpensesSource = expenses.filter(e => { try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; } });
        currentFuelingsSource = fuelings.filter(f => { try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; } });
    } else if (dateRange?.from) {
        const startDate = startOfDay(dateRange.from);
        currentTripsSource = trips.filter(t => { try { return parseISO(t.createdAt) >= startDate; } catch { return false; } });
        currentExpensesSource = expenses.filter(e => { try { return parseISO(e.expenseDate) >= startDate; } catch { return false; } });
        currentFuelingsSource = fuelings.filter(f => { try { return parseISO(f.date) >= startDate; } catch { return false; } });
    }
    
    // Apply driver filter if selected
    if (filterDriverId) {
        currentTripsSource = currentTripsSource.filter(t => t.userId === filterDriverId);
        const tripIdsForDriver = currentTripsSource.map(t => t.localId);
        currentExpensesSource = currentExpensesSource.filter(e => tripIdsForDriver.includes(e.tripLocalId || ''));
        currentFuelingsSource = currentFuelingsSource.filter(f => tripIdsForDriver.includes(f.tripLocalId || ''));
    }


    const tripsByDriver: Record<string, { count: number; totalDistance: number; totalExpenses: number, name?: string }> = {};
    const expensesByType: Record<string, number> = {};
    const fuelingsByVehicle: Record<string, { totalCost: number; totalLiters: number; count: number, vehiclePlate?: string }> = {};

    currentTripsSource.forEach(trip => {
      const driverId = trip.userId;
      if (!tripsByDriver[driverId]) {
        tripsByDriver[driverId] = { count: 0, totalDistance: 0, totalExpenses: 0, name: drivers.find(d => d.id === driverId)?.name || driverId };
      }
      tripsByDriver[driverId].count++;
      tripsByDriver[driverId].totalDistance += trip.totalDistance || 0;

      const tripExpenses = currentExpensesSource.filter(e => e.tripLocalId === trip.localId);
      tripExpenses.forEach(expense => {
        tripsByDriver[driverId].totalExpenses += expense.value;
      });
    });

    currentExpensesSource.forEach(expense => {
        expensesByType[expense.expenseType] = (expensesByType[expense.expenseType] || 0) + expense.value;
    });

    currentFuelingsSource.forEach(fueling => {
        const vehicleId = fueling.vehicleId;
        if(!fuelingsByVehicle[vehicleId]){
            const vehicle = vehicles.find(v => v.localId === vehicleId || v.firebaseId === vehicleId || v.id === vehicleId);
            fuelingsByVehicle[vehicleId] = {totalCost: 0, totalLiters: 0, count: 0, vehiclePlate: vehicle?.licensePlate || vehicleId};
        }
        fuelingsByVehicle[vehicleId].totalCost += fueling.totalCost;
        fuelingsByVehicle[vehicleId].totalLiters += fueling.liters;
        fuelingsByVehicle[vehicleId].count++;
    });

    const chartableTripsByDriver = Object.values(tripsByDriver)
      .map(data => ({ name: data.name || 'Desconhecido', trips: data.count, distance: data.totalDistance, expenses: data.totalExpenses }))
      .sort((a,b) => b.trips - a.trips) 
      .slice(0, 10); 

    const chartableExpensesByType = Object.entries(expensesByType)
      .map(([type, value]) => ({ name: type, value }))
      .sort((a,b) => b.value - a.value);

    const chartableFuelingsByVehicle = Object.values(fuelingsByVehicle)
        .map(data => ({name: data.vehiclePlate || 'Desconhecido', cost: data.totalCost, liters: data.totalLiters, count: data.count}))
        .sort((a,b) => b.cost - a.cost)
        .slice(0,10);

    return {
      tripsByDriver: chartableTripsByDriver,
      expensesByType: chartableExpensesByType,
      fuelingsByVehicle: chartableFuelingsByVehicle,
    };
  }, [isAdmin, user?.email, trips, expenses, fuelings, vehicles, drivers, dateRange, filterDriverId]);


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
              <Truck className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
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
                    <Users className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} /> {/* Assuming trips tab shows driver related info or a future 'drivers' tab */}
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{summaryData.totalDrivers}</div>
                   <p className="text-xs text-muted-foreground">{filterDriverId ? 'Motorista selecionado' : (drivers.length > 0 ? 'Total de motoristas' : 'Nenhum motorista')}</p>
                 </CardContent>
               </Card>
               <Card className="shadow-md transition-shadow hover:shadow-lg">
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                   <CardTitle className="text-sm font-medium">Veículos</CardTitle>
                    <Truck className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab(null)} /> {/* Assuming no specific vehicle tab */}
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
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Nota</AlertTitle>
            <AlertDescription>
              Não consigo ver a imagem que você mencionou. Este é um painel de exemplo.
              Por favor, descreva os gráficos e tabelas que você gostaria de ver para que eu possa implementá-los com precisão.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Viagens por Motorista</CardTitle>
              <CardDescription>
                {summaryData.filterContext}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {adminDashboardData.tripsByDriver.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={adminDashboardData.tripsByDriver}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} interval={0} />
                    <YAxis yAxisId="left" orientation="left" stroke="hsl(var(--primary))" />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--chart-2))" />
                    <Tooltip formatter={(value, name) => (name === 'distance' ? formatKm(value as number) : (name === 'expenses' ? formatCurrency(value as number) : value) )} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="trips" fill="hsl(var(--primary))" name="Nº Viagens" />
                    <Bar yAxisId="right" dataKey="distance" fill="hsl(var(--chart-2))" name="Distância Total (Km)" />
                    <Bar yAxisId="right" dataKey="expenses" fill="hsl(var(--chart-3))" name="Despesas Totais (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">Nenhum dado de viagem por motorista para exibir com os filtros atuais.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Despesas por Tipo</CardTitle>
              <CardDescription>{summaryData.filterContext}</CardDescription>
            </CardHeader>
            <CardContent>
              {adminDashboardData.expensesByType.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={adminDashboardData.expensesByType} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" formatter={(value) => formatCurrency(value as number)} />
                    <YAxis dataKey="name" type="category" width={120} interval={0} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Bar dataKey="value" fill="hsl(var(--chart-1))" name="Valor Total (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">Nenhum dado de despesa por tipo para exibir com os filtros atuais.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
                <CardTitle>Abastecimentos por Veículo</CardTitle>
                <CardDescription>{summaryData.filterContext}</CardDescription>
            </CardHeader>
            <CardContent>
                {adminDashboardData.fuelingsByVehicle.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={adminDashboardData.fuelingsByVehicle}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} interval={0} />
                            <YAxis yAxisId="left" orientation="left" stroke="hsl(var(--chart-4))" name="Custo"/>
                            <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--chart-5))" name="Litros"/>
                            <Tooltip formatter={(value, name) => (name === 'cost' ? formatCurrency(value as number) : (name === 'liters' ? `${(value as number).toFixed(2)} L` : value) )} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="cost" fill="hsl(var(--chart-4))" name="Custo Total (R$)" />
                            <Bar yAxisId="right" dataKey="liters" fill="hsl(var(--chart-5))" name="Litros Totais" />
                            <Bar yAxisId="left" dataKey="count" fill="hsl(var(--muted-foreground))" name="Nº Abastec." />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="text-muted-foreground">Nenhum dado de abastecimento por veículo para exibir com os filtros atuais.</p>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ranking de Motoristas (Exemplo)</CardTitle>
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

        </div>
      )}
    </div>
  );
};