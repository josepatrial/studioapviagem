// src/components/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plane, Map, Wallet, Fuel, Users, Truck, Milestone, Filter, Calendar } from 'lucide-react'; // Added Calendar icon
import { useAuth, User } from '@/contexts/AuthContext'; // Import User type
import { Trip } from './Trips/Trips'; // Assuming these are still mock or fetched elsewhere
import {getVisits as fetchLocalVisits, getLocalExpenses, getLocalFuelings, getLocalTrips, getLocalVehicles, LocalVehicle, LocalExpense, LocalFueling, LocalTrip, LocalVisit} from '@/services/localDbService'; // Import local fetch functions
// Removed incorrect import: import { getExpenses } from './Trips/Expenses';
import { getFuelings as fetchOnlineFuelings, getVehicles as fetchOnlineVehicles } from '@/services/firestoreService';// Assuming these are still mock or fetched elsewhere
import type { VehicleInfo } from './Vehicle';
import { DateRangePicker } from '@/components/ui/date-range-picker'; // Import DateRangePicker
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO } from 'date-fns';
import { getDrivers } from '@/services/firestoreService'; // Import function to get drivers
import { LoadingSpinner } from './LoadingSpinner'; // Import LoadingSpinner
import {getTrips as fetchOnlineTrips} from "@/services/firestoreService";

// Helper function to format currency
const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Helper function to format distance
const formatKm = (km?: number): string => km ? km.toLocaleString('pt-BR') + ' Km' : '0 Km';

// Define props for Dashboard component
interface DashboardProps {
    setActiveTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [drivers, setDrivers] = useState<User[]>([]); // State for fetched drivers
  const [loadingDrivers, setLoadingDrivers] = useState(true); // Loading state for drivers
  const [filterDriverId, setFilterDriverId] = useState<string>(''); // State for driver filter
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined); // State for date range filter
  const [expenses, setExpenses] = useState<LocalExpense[]>([]);
  const [fuelings, setFuelings] = useState<LocalFueling[]>([]);
  const [trips, setTrips] = useState<LocalTrip[]>([]);
  const [vehicles, setVehicles] = useState<LocalVehicle[]>([]);
  const [visits, setVisits] = useState<LocalVisit[]>([]);


  // Fetch drivers on component mount if admin
  useEffect(() => {
    const fetchTripsData = async () => {
          try {
              // Fetch locally first
              let fetchedTrips = await getLocalTrips(isAdmin ? undefined : user?.id);
              if (fetchedTrips.length === 0 && navigator.onLine && isAdmin) { // Fetch online only if admin and local is empty
                  fetchedTrips = (await fetchOnlineTrips()).map(t => ({ ...t, localId: t.id, syncStatus: 'synced' })); // Adapt to LocalTrip structure
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
          // Ensure fetched drivers have the 'driver' role if the service returns mixed users
          setDrivers(fetchedDrivers.filter(d => d.role === 'driver'));
        } catch (error) {
          console.error("Error fetching drivers:", error);
          // Handle error appropriately, maybe show a toast
        } finally {
          setLoadingDrivers(false);
        }
      };
      fetchDrivers();

           const fetchVehiclesData = async () => {
               try {
                   let fetchedVehicles = await getLocalVehicles();
                    if (fetchedVehicles.length === 0 && navigator.onLine) {
                        fetchedVehicles = (await fetchOnlineVehicles()).map(v => ({ ...v, syncStatus: 'synced' })); // Adapt
                    }
                   setVehicles(fetchedVehicles);
               } catch (error) {
                   console.error("Error fetching vehicles:", error);
               }
           };
           fetchVehiclesData();
    } else {
        setLoadingDrivers(false); // Not admin, no need to load drivers list
    }
  }, [isAdmin, user?.id]); // Added user?.id dependency

    useEffect(() => {
        const fetchExpensesData = async () => {
            try {
                // Fetch all local expenses initially
                const allTrips = await getLocalTrips(); // Get all trips to fetch related expenses
                const expensePromises = allTrips.map(trip => getLocalExpenses(trip.localId));
                const expensesArrays = await Promise.all(expensePromises);
                const fetchedExpenses = expensesArrays.flat();
                setExpenses(fetchedExpenses);
            } catch (error) {
                console.error("Error fetching local expenses:", error);
            }
        };
        fetchExpensesData();
    }, []); // Fetch once on mount

    useEffect(() => {
        const fetchFuelingsData = async () => {
            try {
                // Fetch all local fuelings initially
                 const allTrips = await getLocalTrips();
                 const fuelingPromises = allTrips.map(trip => getLocalFuelings(trip.localId));
                 const fuelingsArrays = await Promise.all(fuelingPromises);
                 const fetchedFuelings = fuelingsArrays.flat();
                setFuelings(fetchedFuelings);
            } catch (error) {
                console.error("Error fetching local fuelings:", error);
            }
        };
        fetchFuelingsData();
    }, []); // Fetch once on mount

     useEffect(() => {
        const fetchVisitsData = async () => {
            try {
                // Fetch all local visits initially
                 const allTrips = await getLocalTrips();
                 const visitPromises = allTrips.map(trip => fetchLocalVisits(trip.localId));
                 const visitsArrays = await Promise.all(visitPromises);
                 const fetchedVisits = visitsArrays.flat();
                setVisits(fetchedVisits);
            } catch (error) {
                console.error("Error fetching local visits:", error);
            }
        };
        fetchVisitsData();
    }, []); // Fetch once on mount

  // Calculate summary data based on role and filters
  const summaryData = useMemo(() => {
    // Use the fetched drivers list instead of initialDrivers
    let relevantDriverIds = drivers.map(d => d.id);

    let filteredTrips = trips;
    let filteredVisits = visits;
    let filteredExpenses = expenses;
    let filteredFuelings = fuelings;


    // Apply date filter first if set
    if (dateRange?.from && dateRange?.to) {
        const interval = { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) }; // Use start/end of day for inclusivity
        filteredTrips = filteredTrips.filter(t => {
            try { return isWithinInterval(parseISO(t.createdAt), interval); } catch { return false; }
        });
        // Filter related items based on their own dates
        filteredVisits = visits.filter(v => {
            try { return isWithinInterval(parseISO(v.timestamp), interval); } catch { return false; }
        });
        filteredExpenses = expenses.filter(e => {
            try { return isWithinInterval(parseISO(e.expenseDate), interval); } catch { return false; }
        }); // Use expenseDate
        filteredFuelings = fuelings.filter(f => {
            try { return isWithinInterval(parseISO(f.date), interval); } catch { return false; }
        }); // Use fueling date
    } else if (dateRange?.from) {
        // Handle case where only 'from' date is selected (filter from that date onwards)
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
      // Apply driver filter if selected
      if (filterDriverId) {
         relevantDriverIds = [filterDriverId]; // Focus on the selected driver
         filteredTrips = filteredTrips.filter(t => t.userId === filterDriverId);
         // Re-filter visits, expenses, fuelings based on the selected driver's trips *within the date range*
         const tripLocalIdsForDriver = filteredTrips.map(t => t.localId); // Use localId for local filtering
         filteredVisits = filteredVisits.filter(v => tripLocalIdsForDriver.includes(v.tripLocalId || ''));
         filteredExpenses = filteredExpenses.filter(e => tripLocalIdsForDriver.includes(e.tripLocalId || ''));
         filteredFuelings = filteredFuelings.filter(f => tripLocalIdsForDriver.includes(f.tripLocalId || ''));
      } else {
          // If no driver filter, ensure visits/expenses/fuelings are related to the date-filtered trips
          const tripLocalIds = filteredTrips.map(t => t.localId);
          filteredVisits = filteredVisits.filter(v => tripLocalIds.includes(v.tripLocalId || ''));
          filteredExpenses = filteredExpenses.filter(e => tripLocalIds.includes(e.tripLocalId || ''));
          filteredFuelings = filteredFuelings.filter(f => tripLocalIds.includes(f.tripLocalId || ''));
      }


      const totalDrivers = filterDriverId ? 1 : drivers.length; // Use fetched drivers count
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
      // Driver sees their own data - filters are not applicable from UI, but date filter applies
      const driverId = user?.id;
      let driverTrips = trips.filter(t => t.userId === driverId);

      // Apply date filter to driver's trips (already done above)
      filteredTrips = driverTrips; // Use the date-filtered trips for the driver

      const driverTripLocalIds = filteredTrips.map(t => t.localId);

      // Filter related items based on driver's trips AND date range
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
        totalDrivers: 0,
        totalVehicles: 0,
        filterApplied: !!dateRange,
         filterContext: `Suas Atividades ${dateRange ? `(${dateRange.from?.toLocaleDateString('pt-BR')} - ${dateRange.to?.toLocaleDateString('pt-BR') ?? '...'})` : ''}`.trim(),
      };
    }
  }, [isAdmin, user?.id, filterDriverId, dateRange, drivers, expenses, fuelings, trips, vehicles, visits]); // Add fuelings, visits to dependency array


  return (
    <div className="space-y-6">
       {/* Filters Section */}
       <Card className="shadow-md">
           <CardHeader>
             <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" /> Filtros do Painel
             </CardTitle>
           </CardHeader>
           <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
             {isAdmin && ( // Driver filter only for admin
                <div className="space-y-1.5">
                    <Label htmlFor="driverFilter">Filtrar por Motorista</Label>
                    <Select value={filterDriverId} onValueChange={(value) => setFilterDriverId(value === 'all' ? '' : value)} disabled={loadingDrivers}>
                        <SelectTrigger id="driverFilter">
                            <SelectValue placeholder={loadingDrivers ? "Carregando motoristas..." : "Todos os Motoristas"} />
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
                                {drivers.map(driver => (
                                    <SelectItem key={driver.id} value={driver.id}>{driver.name} ({driver.base})</SelectItem>
                                ))}
                               </>
                            )}
                        </SelectContent>
                    </Select>
                </div>
              )}
             {/* Date Range Filter - Available for both admin and driver */}
             <div className="space-y-1.5">
                <Label>Filtrar por Data (Criação/Registro)</Label>
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
             </div>
           </CardContent>
       </Card>


        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Active Trips */}
          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Viagens Ativas</CardTitle>
               {/* Make icon visually clickable - Change active tab */}
               <Plane className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{summaryData.activeTrips}</div>
              <p className="text-xs text-muted-foreground">
                 {summaryData.filterContext}
              </p>
            </CardContent>
          </Card>

          {/* Total Visits */}
          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
              {/* Make icon visually clickable - Change active tab */}
              <Map className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent-foreground">{summaryData.totalVisits}</div>
              <p className="text-xs text-muted-foreground">
                {summaryData.filterContext}
              </p>
            </CardContent>
          </Card>

          {/* Total Distance */}
          <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Distância Percorrida</CardTitle>
                {/* Make icon visually clickable - Change active tab */}
               <Milestone className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{formatKm(summaryData.totalDistance)}</div>
               <p className="text-xs text-muted-foreground">
                  Viagens finalizadas ({summaryData.filterContext})
               </p>
             </CardContent>
           </Card>

           {/* Total Expenses Value */}
           <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Valor Total Despesas</CardTitle>
                {/* Make icon visually clickable - Change active tab */}
               <Wallet className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{formatCurrency(summaryData.totalExpensesValue)}</div>
               <p className="text-xs text-muted-foreground">
                 {summaryData.totalExpensesCount} registros ({summaryData.filterContext})
               </p>
             </CardContent>
           </Card>

          {/* Total Fuelings Cost */}
          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Custo Total Abastecimento</CardTitle>
               {/* Make icon visually clickable - Change active tab */}
              <Fuel className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('trips')} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summaryData.totalFuelingsCost)}</div>
              <p className="text-xs text-muted-foreground">
                {summaryData.totalFuelingsCount} registros ({summaryData.filterContext})
              </p>
            </CardContent>
          </Card>

           {/* Admin Only Cards */}
           {isAdmin && (
             <>
               <Card className="shadow-md transition-shadow hover:shadow-lg">
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                   <CardTitle className="text-sm font-medium">Motoristas</CardTitle>
                    {/* Make icon visually clickable - Change active tab */}
                    <Users className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('drivers')} />
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{summaryData.totalDrivers}</div>
                   <p className="text-xs text-muted-foreground">
                     {filterDriverId ? 'Motorista selecionado' : 'Total de motoristas'}
                   </p>
                 </CardContent>
               </Card>

               <Card className="shadow-md transition-shadow hover:shadow-lg">
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                   <CardTitle className="text-sm font-medium">Veículos</CardTitle>
                    {/* Make icon visually clickable - Change active tab */}
                    <Truck className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setActiveTab('vehicle')} />
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

