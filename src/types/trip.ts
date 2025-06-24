// src/types/trip.ts

export interface BaseTrip {
  name: string;
  vehicleId: string;
  userId: string;
  status: 'Andamento' | 'Finalizado' | 'Cancelado';
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  base: string;
  finalKm?: number;
  totalDistance?: number;
}
