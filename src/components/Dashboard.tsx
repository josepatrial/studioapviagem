// src/components/Dashboard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plane, Map, Wallet, Fuel, Users, Truck, Milestone, Filter, Calendar } from 'lucide-react'; // Added Calendar icon
import { useAuth, User } from '@/contexts/AuthContext'; // Import User type
import { Trip } from './Trips/Trips'; // Assuming these are still mock or fetched elsewhere
import { initialVisits } from './Trips/Visits';    // Assuming these are still mock or fetched elsewhere
import { getExpenses } from './Trips/Expenses';// Assuming these are still mock or fetched elsewhere
import { getFuelings } from '@/services/firestoreService';// Assuming these are still mock or fetched elsewhere
import { getVehicles } from '@/services/firestoreService';      // Assuming these are still mock or fetched elsewhere
import type { VehicleInfo } from './Vehicle';
import { DateRangePicker } from '@/components/ui/date-range-picker'; // Import DateRangePicker
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO } from 'date-fns';
import { getDrivers } from '@/services/firestoreService'; // Import function to get drivers
import { LoadingSpinner } from './LoadingSpinner'; // Import LoadingSpinner
import {getTrips} from "@/services/firestoreService";

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
  const [expenses, setExpenses] = useState<any[]>([]);
  const [fuelings, setFuelings] = useState<any[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);


  // Fetch drivers on component mount if admin
  useEffect(() => {
    const fetchTripsData = async () => {
          try {
              const fetchedTrips = await getTrips();
              setTrips(fetchedTrips);
          } catch (error) {
              console.error("Error fetching expenses:", error);
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
                   const fetchedVehicles = await getVehicles();
                   setVehicles(fetchedVehicles);
               } catch (error) {
                   console.error("Error fetching vehicles:", error);
               }
           };
           fetchVehiclesData();
    } else {
        setLoadingDrivers(false); // Not admin, no need to load drivers list
    }
  }, [isAdmin]);

    useEffect(() => {
        const fetchExpensesData = async () => {
            try {
                const fetchedExpenses = await getExpenses('');
                setExpenses(fetchedExpenses);
            } catch (error) {
                console.error("Error fetching expenses:", error);
            }
        };
        fetchExpensesData();
    }, []);

    useEffect(() => {
        const fetchFuelingsData = async () => {
            try {
                const fetchedFuelings = await getFuelings('');
                setFuelings(fetchedFuelings);
            } catch (error) {
                console.error("Error fetching fuelings:", error);
            }
        };
        fetchFuelingsData();
    }, []);

  // Calculate summary data based on role and filters
  const summaryData = useMemo(() => {
    // Use the fetched drivers list instead of initialDrivers
    let relevantDriverIds = drivers.map(d => d.id);

    let filteredTrips = trips;
    let filteredVisits = initialVisits;
    let filteredExpenses = expenses;
    let filteredFuelings = fuelings;


    // Apply date filter first if set
    if (dateRange?.from && dateRange?.to) {
        const interval = { start: dateRange.from, end: dateRange.to };
        filteredTrips = filteredTrips.filter(t => isWithinInterval(parseISO(t.createdAt), interval));
        // Filter related items based on their own dates
        filteredVisits = initialVisits.filter(v => isWithinInterval(parseISO(v.timestamp), interval));
        filteredExpenses = expenses.filter(e => isWithinInterval(parseISO(e.expenseDate), interval)); // Use expenseDate
        filteredFuelings = fuelings.filter(f => isWithinInterval(parseISO(f.date), interval)); // Use fueling date
    } else if (dateRange?.from) {
        // Handle case where only 'from' date is selected (filter from that date onwards)
        // Note: isWithinInterval requires both start and end. Adjust logic if single date filter needed.
        // For simplicity, we'll require both dates for now.
    }


    if (isAdmin) {
      // Apply driver filter if selected
      if (filterDriverId) {
         relevantDriverIds = [filterDriverId]; // Focus on the selected driver
         filteredTrips = filteredTrips.filter(t => t.userId === filterDriverId);
         // Re-filter visits, expenses, fuelings based on the selected driver's trips *within the date range*
         const tripIdsForDriver = filteredTrips.map(t => t.id);
         // Ensure related items are filtered based on *both* driver and potential date range
         filteredVisits = initialVisits.filter(v => tripIdsForDriver.includes(v.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(v.timestamp), { start: dateRange.from, end: dateRange.to })));
         filteredExpenses = expenses.filter(e => tripIdsForDriver.includes(e.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(e.expenseDate), { start: dateRange.from, end: dateRange.to })));
         filteredFuelings = fuelings.filter(f => tripIdsForDriver.includes(f.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(f.date), { start: dateRange.from, end: dateRange.to })));
      } else {
          // If no driver filter, ensure visits/expenses/fuelings are related to the date-filtered trips
          const tripIds = filteredTrips.map(t => t.id);
          filteredVisits = initialVisits.filter(v => tripIds.includes(v.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(v.timestamp), { start: dateRange.from, end: dateRange.to })));
          filteredExpenses = expenses.filter(e => tripIds.includes(e.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(e.expenseDate), { start: dateRange.from, end: dateRange.to })));
          filteredFuelings = fuelings.filter(f => tripIds.includes(f.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(f.date), { start: dateRange.from, end: dateRange.to })));
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

      // Apply date filter to driver's trips
       if (dateRange?.from && dateRange?.to) {
           const interval = { start: dateRange.from, end: dateRange.to };
           driverTrips = driverTrips.filter(t => isWithinInterval(parseISO(t.createdAt), interval));
       }

      const driverTripIds = driverTrips.map(t => t.id);

      // Filter related items based on driver's trips AND date range
       filteredVisits = initialVisits.filter(v => driverTripIds.includes(v.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(v.timestamp), { start: dateRange.from, end: dateRange.to })));
       filteredExpenses = expenses.filter(e => driverTripIds.includes(e.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(e.expenseDate), { start: dateRange.from, end: dateRange.to })));
       filteredFuelings = fuelings.filter(f => driverTripIds.includes(v.tripId || '') && (!dateRange?.from || !dateRange?.to || isWithinInterval(parseISO(f.date), { start: dateRange.from, end: dateRange.to })));


      return {
        activeTrips: driverTrips.filter(t => t.status === 'Andamento').length,
        totalVisits: filteredVisits.length,
        totalExpensesCount: filteredExpenses.length,
        totalExpensesValue: filteredExpenses.reduce((sum, e) => sum + e.value, 0),
        totalFuelingsCount: filteredFuelings.length,
        totalFuelingsCost: filteredFuelings.reduce((sum, f) => sum + f.totalCost, 0),
         totalDistance: driverTrips
            .filter(t => t.status === 'Finalizado' && t.totalDistance != null)
            .reduce((sum, t) => sum + (t.totalDistance ?? 0), 0),
        totalDrivers: 0,
        totalVehicles: 0,
        filterApplied: !!dateRange,
         filterContext: `Suas Atividades ${dateRange ? `(${dateRange.from?.toLocaleDateString('pt-BR')} - ${dateRange.to?.toLocaleDateString('pt-BR') ?? '...'})` : ''}`.trim(),
      };
    }
  }, [isAdmin, user?.id, filterDriverId, dateRange, drivers, expenses, fuelings, trips, vehicles]); // Add fuelings to dependency array


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
