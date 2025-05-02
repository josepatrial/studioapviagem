// src/components/Dashboard.tsx
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Import Select
import { Label } from '@/components/ui/label'; // Import Label
import { Plane, Map, Wallet, Fuel, Users, Truck, Milestone, Filter } from 'lucide-react'; // Added Milestone, Filter icons
import { useAuth, initialDrivers, User } from '@/contexts/AuthContext'; // Import useAuth and initialDrivers
import { initialTrips, Trip } from './Trips/Trips'; // Import trip data and Trip type
import { initialVisits } from './Trips/Visits'; // Import visit data
import { initialExpenses } from './Trips/Expenses'; // Import expense data
import { initialFuelings } from './Trips/Fuelings'; // Import fueling data
import { initialVehicles } from './Vehicle'; // Import vehicle data

// Helper function to format currency
const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Helper function to format distance
const formatKm = (km?: number): string => km ? km.toLocaleString('pt-BR') + ' Km' : '0 Km';

// Helper function to get unique bases
const getUniqueBases = (driversData: User[]): string[] => {
    const bases = driversData
        .map(driver => driver.base)
        .filter((base): base is string => !!base);
    return Array.from(new Set(bases)).sort();
};


export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [filterDriverId, setFilterDriverId] = useState<string>(''); // State for driver filter
  const [filterBase, setFilterBase] = useState<string>(''); // State for base filter

  // Memoize unique bases based on drivers
  const uniqueBases = useMemo(() => getUniqueBases(initialDrivers), []);

  // Calculate summary data based on role and filters
  const summaryData = useMemo(() => {
    let filteredTrips = initialTrips;
    let filteredVisits = initialVisits;
    let filteredExpenses = initialExpenses;
    let filteredFuelings = initialFuelings;
    let relevantDriverIds = initialDrivers.map(d => d.id);

    if (isAdmin) {
      // Apply base filter if selected
      if (filterBase) {
        relevantDriverIds = initialDrivers.filter(d => d.base === filterBase).map(d => d.id);
        filteredTrips = filteredTrips.filter(t => relevantDriverIds.includes(t.userId));
      }

      // Apply driver filter if selected (overrides base filter for trips/visits etc.)
      if (filterDriverId) {
         relevantDriverIds = [filterDriverId]; // Focus on the selected driver
         filteredTrips = initialTrips.filter(t => t.userId === filterDriverId);
      }

      // Filter visits, expenses, fuelings based on the filtered trips
      const tripIds = filteredTrips.map(t => t.id);
      filteredVisits = initialVisits.filter(v => tripIds.includes(v.tripId || ''));
      filteredExpenses = initialExpenses.filter(e => tripIds.includes(e.tripId || ''));
      filteredFuelings = initialFuelings.filter(f => tripIds.includes(f.tripId || ''));

      // Total drivers/vehicles might still show overall count unless filtered specifically
      const totalDrivers = filterBase ? relevantDriverIds.length : initialDrivers.length;
      // Vehicle count isn't directly linked to base/driver filters easily here, show total
      const totalVehicles = initialVehicles.length;


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
        filterApplied: !!filterDriverId || !!filterBase,
        filterContext: filterDriverId
            ? `Motorista: ${initialDrivers.find(d=>d.id === filterDriverId)?.name}`
            : filterBase ? `Base: ${filterBase}` : 'Total',
      };

    } else {
      // Driver sees their own data - filters are not applicable
      const driverId = user?.id;
      const driverTrips = initialTrips.filter(t => t.userId === driverId);
      const driverTripIds = driverTrips.map(t => t.id);

      filteredVisits = initialVisits.filter(v => driverTripIds.includes(v.tripId || ''));
      filteredExpenses = initialExpenses.filter(e => driverTripIds.includes(e.tripId || ''));
      filteredFuelings = initialFuelings.filter(f => driverTripIds.includes(f.tripId || ''));

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
        totalDrivers: 0, // Not relevant for driver
        totalVehicles: 0, // Not relevant for driver
        filterApplied: false,
        filterContext: 'Suas Atividades',
      };
    }
  }, [isAdmin, user?.id, filterDriverId, filterBase]);


  return (
    <div className="space-y-6">
       {/* Admin Filters */}
       {isAdmin && (
         <Card className="shadow-md">
           <CardHeader>
             <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" /> Filtros do Painel
             </CardTitle>
           </CardHeader>
           <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="space-y-1.5">
                <Label htmlFor="driverFilter">Filtrar por Motorista</Label>
                <Select value={filterDriverId} onValueChange={(value) => setFilterDriverId(value === 'all' ? '' : value)}>
                    <SelectTrigger id="driverFilter">
                        <SelectValue placeholder="Todos os Motoristas" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os Motoristas</SelectItem>
                        {initialDrivers.map(driver => (
                            <SelectItem key={driver.id} value={driver.id}>{driver.name} ({driver.base})</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
             </div>
             <div className="space-y-1.5">
                 <Label htmlFor="baseFilter">Filtrar por Base</Label>
                 <Select value={filterBase} onValueChange={(value) => { setFilterBase(value === 'all' ? '' : value); setFilterDriverId(''); /* Clear driver filter when base changes */ }}>
                    <SelectTrigger id="baseFilter">
                        <SelectValue placeholder="Todas as Bases" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas as Bases</SelectItem>
                        {uniqueBases.map(base => (
                           <SelectItem key={base} value={base}>{base}</SelectItem>
                        ))}
                    </SelectContent>
                 </Select>
             </div>
           </CardContent>
         </Card>
       )}

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Active Trips */}
          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Viagens Ativas</CardTitle>
              <Plane className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{summaryData.activeTrips}</div>
              <p className="text-xs text-muted-foreground">
                Viagens em andamento ({summaryData.filterContext})
              </p>
            </CardContent>
          </Card>

          {/* Total Visits */}
          <Card className="shadow-md transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
              <Map className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent-foreground">{summaryData.totalVisits}</div>
              <p className="text-xs text-muted-foreground">
                Visitas realizadas ({summaryData.filterContext})
              </p>
            </CardContent>
          </Card>

          {/* Total Distance */}
          <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Distância Percorrida</CardTitle>
               <Milestone className="h-5 w-5 text-muted-foreground" />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{formatKm(summaryData.totalDistance)}</div>
               <p className="text-xs text-muted-foreground">
                 Distância total em viagens finalizadas ({summaryData.filterContext})
               </p>
             </CardContent>
           </Card>

           {/* Total Expenses Value */}
           <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Valor Total Despesas</CardTitle>
               <Wallet className="h-5 w-5 text-muted-foreground" />
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
              <Fuel className="h-5 w-5 text-muted-foreground" />
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
                   <Users className="h-5 w-5 text-muted-foreground" />
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold">{summaryData.totalDrivers}</div>
                   <p className="text-xs text-muted-foreground">
                     {filterBase ? `Motoristas na Base ${filterBase}` : 'Total de motoristas no sistema'}
                   </p>
                 </CardContent>
               </Card>

               <Card className="shadow-md transition-shadow hover:shadow-lg">
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                   <CardTitle className="text-sm font-medium">Veículos</CardTitle>
                   <Truck className="h-5 w-5 text-muted-foreground" />
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
