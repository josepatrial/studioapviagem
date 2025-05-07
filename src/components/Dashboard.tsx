// src/components/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MapPin, Wallet, Fuel, Users, Truck, Milestone, Filter, Calendar, BarChart3 } from 'lucide-react'; // Changed Plane to BarChart3 for Active Trips, Map to MapPin for consistency with Trips
import { useAuth, User } from '@/contexts/AuthContext';
import type { Trip } from './Trips/Trips';
import {getLocalVisits as fetchLocalVisits, getLocalExpenses, getLocalFuelings, getLocalTrips, getLocalVehicles, LocalVehicle, LocalExpense, LocalFueling, LocalTrip, LocalVisit} from '@/services/localDbService';
import { getFuelings as fetchOnlineFuelings, getVehicles as fetchOnlineVehicles, getTrips as fetchOnlineTrips, getDrivers } from '@/services/firestoreService';
import type { VehicleInfo } from './Vehicle';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { LoadingSpinner } from './LoadingSpinner';
import { formatKm } from '@/lib/utils'; // Import centralized formatKm
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';


const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


interface DashboardProps {
    setActiveTab: (section: 'visits' | 'expenses' | 'fuelings' | 'trips' | null) => void; // Can navigate to specific sections or just the trips tab
}

export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [filterDriverId, setFilterDriverId] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [expenses, setExpenses] = useState<LocalExpense[]>([]);
  const [fuelings, setFuelings] = useState<LocalFueling[]>([]);
  const [trips, setTrips] = useState<LocalTrip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
  const [visits, setVisits] = useState<LocalVisit[]>([]);
  const router = useRouter();


  useEffect(() => {
    const fetchTripsData = async () => {
          try {
              let fetchedTrips = await getLocalTrips(isAdmin ? undefined : user?.id);
              if (fetchedTrips.length === 0 && navigator.onLine && isAdmin) {
                  fetchedTrips = (await fetchOnlineTrips()).map(t => ({ ...t, localId: t.id, syncStatus: 'synced' } as LocalTrip));
              }
              setTrips(fetchedTrips);
          } catch (error) {
              console.error("Error fetching trips:", error);
          }
      };
      fetchTripsData();

    if (isAdmin) {
      const fetchDrivers = async () => {
        setLoadingDrivers(true);
        try {
          const fetchedDrivers = await getDrivers();
          setDrivers(fetchedDrivers.filter(d => d.role === 'driver'));
        } catch (error) {
          console.error("Error fetching drivers:", error);
          toast({
            variant: "destructive",
            title: "Erro ao Carregar Motoristas",
            description: "Não foi possível buscar a lista de motoristas. Verifique sua conexão ou os logs.",
          });
        } finally {
          setLoadingDrivers(false);
        }
      };
      fetchDrivers();

           const fetchVehiclesData = async () => {
               try {
                   let fetchedVehicles = await getLocalVehicles();
                    if (fetchedVehicles.length === 0 && navigator.onLine) {
                        fetchedVehicles = (await fetchOnlineVehicles()).map(v => ({ ...v, localId: v.id, syncStatus: 'synced' } as LocalVehicle));
                    }
                   setVehicles(fetchedVehicles);
               } catch (error) {
                   console.error("Error fetching vehicles:", error);
               }
           };
           fetchVehiclesData();
    } else {
        setLoadingDrivers(false);
         setDrivers([]); // Clear drivers if not admin
    }
  }, [isAdmin, user?.id, toast]); // Added toast to dependencies

    useEffect(() => {
        const fetchExpensesData = async () => {
            try {
                const allLocalTrips = await getLocalTrips();
                const expensePromises = allLocalTrips.map(trip => getLocalExpenses(trip.localId));
                const expensesArrays = await Promise.all(expensePromises);
                const fetchedExpenses = expensesArrays.flat();
                setExpenses(fetchedExpenses);
            } catch (error) {
                console.error("Error fetching local expenses:", error);
            }
        };
        fetchExpensesData();
    }, []);

    useEffect(() => {
        const fetchFuelingsData = async () => {
            try {
                 const allLocalTrips = await getLocalTrips();
                 const fuelingPromises = allLocalTrips.map(trip => getLocalFuelings(trip.localId));
                 const fuelingsArrays = await Promise.all(fuelingPromises);
                 const fetchedFuelings = fuelingsArrays.flat();
                setFuelings(fetchedFuelings);
            } catch (error) {
                console.error("Error fetching local fuelings:", error);
            }
        };
        fetchFuelingsData();
    }, []);

     useEffect(() => {
        const fetchVisitsData = async () => {
            try {
                 const allLocalTrips = await getLocalTrips();
                 const visitPromises = allLocalTrips.map(trip => fetchLocalVisits(trip.localId));
                 const visitsArrays = await Promise.all(visitPromises);
                 const fetchedVisits = visitsArrays.flat();
                setVisits(fetchedVisits);
            } catch (error) {
                console.error("Error fetching local visits:", error);
            }
        };
        fetchVisitsData();
    }, []);

  const summaryData = useMemo(() => {
    let relevantDriverIds = drivers.map(d => d.id);
    let filteredTrips = trips;
    let filteredVisits = visits;
    let filteredExpenses = expenses;
    let filteredFuelings = fuelings;

    if (dateRange?.from && dateRange?.to) {
        const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) };
        filteredTrips = filteredTrips.filter(t => {
            try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; }
        });
        filteredVisits = visits.filter(v => {
            try { return isWithinInterval(parseISO(v.timestamp), interval); } catch { return false; }
        });
        filteredExpenses = expenses.filter(e => {
            try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; }
        });
        filteredFuelings = fuelings.filter(f => {
            try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; }
        });
    } else if (dateRange?.from) {
        const startDate = startOfDay(dateRange.from);
        filteredTrips = filteredTrips.filter(t => {
            try { return parseISO(t.createdAt) >= startDate; } catch { return false; }
        });
         filteredVisits = visits.filter(v => {
            try { return parseISO(v.timestamp) >= startDate; } catch { return false; }
        });
         filteredExpenses = expenses.filter(e => {
            try { return parseISO(e.expenseDate) >= startDate; } catch { return false; }
        });
        filteredFuelings = fuelings.filter(f => {
            try { return parseISO(f.date) >= startDate; } catch { return false; }
        });
    }

    if (isAdmin) {
      if (filterDriverId) {
         relevantDriverIds = [filterDriverId];
         filteredTrips = filteredTrips.filter(t => t.userId === filterDriverId);
         const tripLocalIdsForDriver = filteredTrips.map(t => t.localId);
         filteredVisits = filteredVisits.filter(v => tripLocalIdsForDriver.includes(v.tripLocalId || ''));
         filteredExpenses = filteredExpenses.filter(e => tripLocalIdsForDriver.includes(e.tripLocalId || ''));
         filteredFuelings = filteredFuelings.filter(f => tripLocalIdsForDriver.includes(f.tripLocalId || ''));
      } else {
          const tripLocalIds = filteredTrips.map(t => t.localId);
          filteredVisits = filteredVisits.filter(v => tripLocalIds.includes(v.tripLocalId || ''));
          filteredExpenses = filteredExpenses.filter(e => tripLocalIds.includes(e.tripLocalId || ''));
          filteredFuelings = filteredFuelings.filter(f => tripLocalIds.includes(f.tripLocalId || ''));
      }

      const totalDrivers = filterDriverId ? 1 : drivers.length;
      const totalVehicles = vehicles.length;

      return {
        activeTrips: filteredTrips.filter(t => t.status === 'Andamento').length,
        totalVisits: filteredVisits.length,
        totalExpensesCount: filteredExpenses.length,
        totalExpensesValue: filteredExpenses.reduce((sum, e) => sum + e.value, 0),
        totalFuelingsCount: filteredFuelings.length,
        totalFuelingsCost: filteredFuelings.reduce((sum, f) => sum + f.totalCost, 0),
        totalDistance: filteredTrips
            .filter(t => t.status === 'Finalizado' && t.totalDistance != null)
            .reduce((sum, t) => sum + (t.totalDistance ?? 0), 0),
        totalDrivers: totalDrivers,
        totalVehicles: totalVehicles,
        filterApplied: !!filterDriverId || !!dateRange,
        filterContext: `${filterDriverId ? `Motorista: ${drivers.find(d=>d.id === filterDriverId)?.name}` : 'Total'} ${dateRange ? `(${dateRange.from?.toLocaleDateString('pt-BR')} - ${dateRange.to?.toLocaleDateString('pt-BR') ?? '...'})` : ''}`.trim(),
      };

    } else {
      const driverId = user?.id;
      let driverTrips = trips.filter(t => t.userId === driverId);
      filteredTrips = driverTrips;
      const driverTripLocalIds = filteredTrips.map(t => t.localId);
       filteredVisits = visits.filter(v => driverTripLocalIds.includes(v.tripLocalId || ''));
       filteredExpenses = expenses.filter(e => driverTripLocalIds.includes(e.tripLocalId || ''));
       filteredFuelings = fuelings.filter(f => driverTripLocalIds.includes(f.tripLocalId || ''));

      return {
        activeTrips: filteredTrips.filter(t => t.status === 'Andamento').length,
        totalVisits: filteredVisits.length,
        totalExpensesCount: filteredExpenses.length,
        totalExpensesValue: filteredExpenses.reduce((sum, e) => sum + e.value, 0),
        totalFuelingsCount: filteredFuelings.length,
        totalFuelingsCost: filteredFuelings.reduce((sum, f) => sum + f.totalCost, 0),
         totalDistance: filteredTrips
            .filter(t => t.status === 'Finalizado' && t.totalDistance != null)
            .reduce((sum, t) => sum + (t.totalDistance ?? 0), 0),
        totalDrivers: 0, // Non-admins don't see driver counts
        totalVehicles: 0, // Non-admins don't see vehicle counts
        filterApplied: !!dateRange,
         filterContext: `Suas Atividades ${dateRange ? `(${dateRange.from?.toLocaleDateString('pt-BR')} - ${dateRange.to?.toLocaleDateString('pt-BR') ?? '...'})` : ''}`.trim(),
      };
    }
  }, [isAdmin, user?.id, filterDriverId, dateRange, drivers, expenses, fuelings, trips, vehicles, visits]);


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
                            <SelectValue placeholder={loadingDrivers ? "Carregando motoristas..." : (drivers.length === 0 ? "Nenhum motorista encontrado" : "Todos os Motoristas")} />
                        </SelectTrigger>
                        <SelectContent>
                            {loadingDrivers ? (
                                <SelectItem value="loading" disabled>
                                    <div className="flex items-center justify-center py-2">
                                        <LoadingSpinner className="h-4 w-4" />
                                    </div>
                                </SelectItem>
                            ) : (
                               <>
                                <SelectItem value="all">Todos os Motoristas</SelectItem>
                                {drivers.length > 0 ? (
                                    drivers.map(driver => (
                                        <SelectItem key={driver.id} value={driver.id}>{driver.name} ({driver.base})</SelectItem>
                                    ))
                                ) : (
                                    <SelectItem value="no-drivers" disabled>Nenhum motorista cadastrado</SelectItem>
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
              <p className="text-xs text-muted-foreground">
                 {summaryData.filterContext}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
              <MapPin className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('visits')} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent-foreground">{summaryData.totalVisits}</div>
              <p className="text-xs text-muted-foreground">
                {summaryData.filterContext}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Distância Percorrida</CardTitle>
               <Milestone className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{formatKm(summaryData.totalDistance)}</div>
               <p className="text-xs text-muted-foreground">
                  Viagens finalizadas ({summaryData.filterContext})
               </p>
             </CardContent>
           </Card>

           <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Valor Total Despesas</CardTitle>
               <Wallet className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('expenses')} />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{formatCurrency(summaryData.totalExpensesValue)}</div>
               <p className="text-xs text-muted-foreground">
                 {summaryData.totalExpensesCount} registros ({summaryData.filterContext})
               </p>
             </CardContent>
           </Card>

          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Custo Total Abastecimento</CardTitle>
              <Fuel className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('fuelings')} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summaryData.totalFuelingsCost)}</div>
              <p className="text-xs text-muted-foreground">
                {summaryData.totalFuelingsCount} registros ({summaryData.filterContext})
              </p>
            </CardContent>
          </Card>

           {isAdmin && (
             <>
               <Card className="shadow-md transition-shadow hover:shadow-lg">
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                   <CardTitle className="text-sm font-medium">Motoristas</CardTitle>
                    <Users className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('drivers')} /> {/* Changed from router.push */}
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{summaryData.totalDrivers}</div>
                   <p className="text-xs text-muted-foreground">
                     {filterDriverId ? 'Motorista selecionado' : (drivers.length > 0 ? 'Total de motoristas' : 'Nenhum motorista')}
                   </p>
                 </CardContent>
               </Card>

               <Card className="shadow-md transition-shadow hover:shadow-lg">
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                   <CardTitle className="text-sm font-medium">Veículos</CardTitle>
                    <Truck className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('vehicle')} /> {/* Changed from router.push */}
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{summaryData.totalVehicles}</div>
                   <p className="text-xs text-muted-foreground">Total de veículos na frota</p>
                 </CardContent>
               </Card>
             </>
           )}
        </div>
    </div>
  );
};
