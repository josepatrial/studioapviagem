// src/components/Dashboard.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane, Map, Wallet, Fuel, Users, Truck } from 'lucide-react'; // Added Users and Truck icons
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import { initialTrips } from './Trips/Trips'; // Import trip data
import { initialVisits } from './Trips/Visits'; // Import visit data
import { initialExpenses } from './Trips/Expenses'; // Import expense data
import { initialFuelings } from './Trips/Fuelings'; // Import fueling data
import { initialDrivers } from '@/contexts/AuthContext'; // Import driver data
import { initialVehicles } from './Vehicle'; // Import vehicle data

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Calculate summary data based on role
  let summaryData;
  if (isAdmin) {
    // Admin sees totals across all users/bases
    summaryData = {
      activeTrips: initialTrips.filter(t => t.status === 'Andamento').length,
      totalVisits: initialVisits.length,
      totalExpenses: initialExpenses.length, // Could sum values instead of count
      totalFuelings: initialFuelings.length, // Could sum values instead of count
      totalDrivers: initialDrivers.length,
      totalVehicles: initialVehicles.length,
    };
  } else {
    // Driver sees their own data
    const driverId = user?.id;
    const driverTrips = initialTrips.filter(t => t.userId === driverId);
    const driverTripIds = driverTrips.map(t => t.id);

    summaryData = {
      activeTrips: driverTrips.filter(t => t.status === 'Andamento').length,
      totalVisits: initialVisits.filter(v => driverTripIds.includes(v.tripId || '')).length,
      totalExpenses: initialExpenses.filter(e => driverTripIds.includes(e.tripId || '')).length,
      totalFuelings: initialFuelings.filter(f => driverTripIds.includes(f.tripId || '')).length,
      // totalDrivers and totalVehicles are not relevant for a single driver view in this context
      totalDrivers: 0,
      totalVehicles: 0,
    };
  }


  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Common Cards for Driver and Admin */}
      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Viagens Ativas</CardTitle>
          <Plane className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">{summaryData.activeTrips}</div>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? 'Viagens em andamento (Total)' : 'Suas viagens em andamento'}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
          <Map className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-accent-foreground">{summaryData.totalVisits}</div>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? 'Visitas realizadas (Total)' : 'Suas visitas realizadas'}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Despesas Registradas</CardTitle>
          <Wallet className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summaryData.totalExpenses}</div>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? 'Registros de despesas (Total)' : 'Seus registros de despesas'}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Abastecimentos</CardTitle>
          <Fuel className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summaryData.totalFuelings}</div>
          <p className="text-xs text-muted-foreground">
             {isAdmin ? 'Registros de abastecimento (Total)' : 'Seus registros de abastecimento'}
          </p>
        </CardContent>
      </Card>

       {/* Admin Only Cards */}
       {isAdmin && (
         <>
           <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Motoristas Cadastrados</CardTitle>
               <Users className="h-5 w-5 text-muted-foreground" />
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold">{summaryData.totalDrivers}</div>
               <p className="text-xs text-muted-foreground">Total de motoristas no sistema</p>
             </CardContent>
           </Card>

           <Card className="shadow-md transition-shadow hover:shadow-lg">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <CardTitle className="text-sm font-medium">Veículos Cadastrados</CardTitle>
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
  );
};
