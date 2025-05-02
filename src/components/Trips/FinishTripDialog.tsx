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
import type { Trip } from './Trips'; // Assuming Trip interface is exported from Trips.tsx
import type { Visit } from './Visits'; // Assuming Visit interface is exported

interface FinishTripDialogProps {
  trip: Trip | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tripId: string, finalKm: number, totalDistance: number) => void;
  initialVisitsData: Visit[]; // Pass the visits data for calculation
}

export const FinishTripDialog: React.FC<FinishTripDialogProps> = ({
  trip,
  isOpen,
  onClose,
  onConfirm,
  initialVisitsData,
}) => {
  const [finalKm, setFinalKm] = useState<number | ''>('');
  const [firstVisitKm, setFirstVisitKm] = useState<number | null>(null);
  const [lastVisitKm, setLastVisitKm] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (trip && isOpen) {
      // Find the first and last visits for the current trip based on timestamp
      const tripVisits = initialVisitsData
        .filter(v => v.tripId === trip.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); // Sort ascending by time

      if (tripVisits.length > 0) {
        setFirstVisitKm(tripVisits[0].initialKm);
        setLastVisitKm(tripVisits[tripVisits.length - 1].initialKm); // Use the KM from the chronologically last visit
      } else {
        setFirstVisitKm(null);
        setLastVisitKm(null); // Reset if no visits
        toast({
            variant: 'destructive',
            title: 'Aviso',
            description: 'Não há visitas registradas para esta viagem. O cálculo da distância não será preciso.',
            duration: 7000,
        })
      }
      setFinalKm(''); // Reset final KM input when dialog opens
    }
  }, [trip, isOpen, initialVisitsData, toast]);

  const handleConfirm = () => {
    if (!trip) return;

    const kmValue = Number(finalKm);

    if (finalKm === '' || kmValue <= 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Quilometragem final é obrigatória e deve ser maior que zero.' });
      return;
    }

    // Validate final KM against the last recorded visit KM
    if (lastVisitKm !== null && kmValue < lastVisitKm) {
         toast({
             variant: "destructive",
             title: "Erro de Quilometragem",
             description: `A quilometragem final (${kmValue.toLocaleString('pt-BR')} Km) não pode ser menor que a da última visita registrada (${lastVisitKm.toLocaleString('pt-BR')} Km).`,
             duration: 7000,
         });
         return;
     }


    // Calculate total distance
    let totalDistance = 0;
    if (firstVisitKm !== null) {
      totalDistance = kmValue - firstVisitKm;
      if (totalDistance < 0) {
          // This case should ideally be prevented by the validation above, but good to double-check.
          toast({ variant: 'destructive', title: 'Erro de Cálculo', description: 'Distância total resultou em valor negativo. Verifique os KMs.' });
          return;
      }
    } else {
        // Handle case where there are no visits (distance cannot be calculated based on visits)
        // You might set distance to 0 or handle it differently based on requirements
        totalDistance = 0; // Or potentially based on vehicle's initial KM if tracked separately
        console.warn("Não foi possível calcular a distância total: Nenhuma visita encontrada.");
    }


    onConfirm(trip.id, kmValue, totalDistance);
  };

  const formatKm = (km: number | null): string => km ? km.toLocaleString('pt-BR') + ' Km' : 'N/A';

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finalizar Viagem: {trip?.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Insira a quilometragem final do veículo para calcular a distância percorrida.
             {firstVisitKm !== null && (
                <p className="text-sm mt-2">KM da primeira visita: <strong>{formatKm(firstVisitKm)}</strong></p>
             )}
             {lastVisitKm !== null && (
                 <p className="text-sm">KM da última visita: <strong>{formatKm(lastVisitKm)}</strong></p>
             )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="finalKm">Quilometragem Final (Km)*</Label>
          <Input
            id="finalKm"
            type="number"
            value={finalKm}
            onChange={(e) => setFinalKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')}
            required
            placeholder="Km atual do veículo"
            min={lastVisitKm ?? 0} // Set min based on last visit if available
          />
           {finalKm !== '' && firstVisitKm !== null && Number(finalKm) >= firstVisitKm && (
             <p className="text-sm text-muted-foreground mt-1">
               Distância estimada: {formatKm(Number(finalKm) - firstVisitKm)}
             </p>
           )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={finalKm === '' || Number(finalKm) <= 0 || (lastVisitKm !== null && Number(finalKm) < lastVisitKm)}
          >
            Confirmar Finalização
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};