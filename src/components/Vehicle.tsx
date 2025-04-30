// src/components/Vehicle.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Car, Wrench } from 'lucide-react';

export const Vehicle: React.FC = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Informações do Veículo</h2>
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Car className="h-5 w-5" />
            Detalhes do Veículo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Aqui serão exibidas informações sobre o veículo, como placa, modelo, ano, etc.
          </p>
          {/* Placeholder for vehicle details */}
        </CardContent>
      </Card>

       <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
             <Wrench className="h-5 w-5" />
            Manutenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Aqui será exibido o histórico de manutenções e lembretes.
          </p>
          {/* Placeholder for maintenance records */}
        </CardContent>
      </Card>
    </div>
  );
};
