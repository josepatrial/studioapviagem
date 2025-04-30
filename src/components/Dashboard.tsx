// src/components/Dashboard.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane, Map, Wallet, Fuel } from 'lucide-react';

// Mock data - replace with actual data fetching
const summaryData = {
  activeTrips: 2,
  totalVisits: 45,
  totalExpenses: 15,
  totalFuelings: 10,
};

export const Dashboard: React.FC = () => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Viagens Ativas</CardTitle>
          <Plane className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">{summaryData.activeTrips}</div>
          <p className="text-xs text-muted-foreground">Viagens em andamento</p>
        </CardContent>
      </Card>

      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total de Visitas</CardTitle>
          <Map className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-accent">{summaryData.totalVisits}</div>
          <p className="text-xs text-muted-foreground">Visitas realizadas no total</p>
        </CardContent>
      </Card>

      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Despesas Registradas</CardTitle>
          <Wallet className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summaryData.totalExpenses}</div>
           {/* Add R$ sign and format value if needed */}
          <p className="text-xs text-muted-foreground">Registros de despesas</p>
        </CardContent>
      </Card>

      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Abastecimentos</CardTitle>
          <Fuel className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summaryData.totalFuelings}</div>
           {/* Add R$ sign and format value if needed */}
          <p className="text-xs text-muted-foreground">Registros de abastecimento</p>
        </CardContent>
      </Card>
    </div>
  );
};
