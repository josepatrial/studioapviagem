// src/components/Trips/FinishTripDialog.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Trip } from './Trips';
import type { Visit } from './Visits';
import { formatKm } from '@/lib/utils';

interface FinishTripDialogProps {
  trip: Trip | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tripId: string, finalKm: number, totalDistance: number) => void;
  visitsData: Visit[]; // All visits for the specific trip
}

export const FinishTripDialog: React.FC<FinishTripDialogProps> = ({
  trip,
  isOpen,
  onClose,
  onConfirm,
  visitsData,
}) => {
  const [finalKm, setFinalKm] = useState<number | ''>('');
  const [firstVisitKm, setFirstVisitKm] = useState<number | null>(null);
  const [lastRecordedVisitKm, setLastRecordedVisitKm] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (trip && isOpen && visitsData.length > 0) {
      // visitsData should already be sorted or filtered by the parent component
      const sortedVisits = [...visitsData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      setFirstVisitKm(sortedVisits[0].initialKm);
      setLastRecordedVisitKm(sortedVisits[sortedVisits.length - 1].initialKm);
    } else if (trip && isOpen && visitsData.length === 0) {
        // This case should ideally be prevented by Trips.tsx
        // If it occurs, reset KMs. The parent component handles the warning.
        setFirstVisitKm(null);
        setLastRecordedVisitKm(null);
    }
    if (!isOpen) { // Reset when modal closes
        setFinalKm('');
    }
  }, [trip, isOpen, visitsData]);

  const handleConfirm = () => {
    if (!trip || firstVisitKm === null) { // firstVisitKm null implies no visits
        toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Não há visitas registradas ou dados de KM da primeira visita indisponíveis.',
        });
        return;
    }

    const kmValue = Number(finalKm);

    if (finalKm === '' || kmValue <= 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Quilometragem final é obrigatória e deve ser maior que zero.' });
      return;
    }

    if (lastRecordedVisitKm !== null && kmValue < lastRecordedVisitKm) {
         toast({
             variant: "destructive",
             title: "Erro de Quilometragem",
             description: `A quilometragem final (${formatKm(kmValue)}) não pode ser menor que a da última visita registrada (${formatKm(lastRecordedVisitKm)}).`,
             duration: 7000,
         });
         return;
     }
    
    // Ensure finalKm is not less than the first visit's KM, which shouldn't happen if lastRecordedVisitKm is validated correctly
    // but good as an extra check for data integrity during distance calculation.
    if (kmValue < firstVisitKm) {
        toast({
            variant: "destructive",
            title: "Erro de Cálculo",
            description: `A quilometragem final (${formatKm(kmValue)}) não pode ser menor que a da primeira visita (${formatKm(firstVisitKm)}).`,
            duration: 7000,
        });
        return;
    }


    const totalDistance = kmValue - firstVisitKm;
    // totalDistance can be 0 if finalKm is same as firstVisitKm (e.g., one visit and return to start)
    // The primary validation is that finalKm >= firstVisitKm and finalKm >= lastRecordedVisitKm

    onConfirm(trip.localId, kmValue, totalDistance);
  };


  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finalizar Viagem: {trip?.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Insira a quilometragem final do veículo para calcular a distância percorrida.
          </AlertDialogDescription>
          {firstVisitKm !== null && (
            <p className="text-sm mt-1 text-muted-foreground">
                KM da primeira visita: <strong>{formatKm(firstVisitKm)}</strong>
            </p>
          )}
          {lastRecordedVisitKm !== null && firstVisitKm !== lastRecordedVisitKm && ( // Only show if different from first
              <p className="text-sm text-muted-foreground">
                  KM da última visita registrada: <strong>{formatKm(lastRecordedVisitKm)}</strong>
              </p>
          )}
        </AlertDialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="finalKm">Quilometragem Final do Veículo (Km)*</Label>
          <Input
            id="finalKm"
            type="number"
            value={finalKm}
            onChange={(e) => setFinalKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')}
            required
            placeholder="Km atual do veículo"
            min={lastRecordedVisitKm ?? 0}
          />
           {finalKm !== '' && firstVisitKm !== null && Number(finalKm) >= firstVisitKm && (
             <p className="text-sm text-muted-foreground mt-1">
               Distância total estimada da viagem: {formatKm(Number(finalKm) - firstVisitKm)}
             </p>
           )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={
                finalKm === '' ||
                Number(finalKm) <= 0 ||
                (lastRecordedVisitKm !== null && Number(finalKm) < lastRecordedVisitKm) ||
                (firstVisitKm !== null && Number(finalKm) < firstVisitKm) || // Ensure finalKm >= firstVisitKm too
                visitsData.length === 0 // Redundant if parent handles it, but safe
            }
          >
            Confirmar Finalização
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
