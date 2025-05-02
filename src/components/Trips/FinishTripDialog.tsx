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

interface FinishTripDialogProps {
  trip: Trip | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tripId: string, finalKm: number, totalDistance: number) => void;
  // Use passed visits data instead of importing mock data
  visitsData: Visit[];
}

export const FinishTripDialog: React.FC<FinishTripDialogProps> = ({
  trip,
  isOpen,
  onClose,
  onConfirm,
  visitsData, // Use the prop
}) => {
  const [finalKm, setFinalKm] = useState<number | ''>('');
  const [firstVisitKm, setFirstVisitKm] = useState<number | null>(null);
  const [lastVisitKm, setLastVisitKm] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (trip && isOpen) {
      // Use the passed visitsData prop
      const tripVisits = visitsData
        .filter(v => v.tripId === trip.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (tripVisits.length > 0) {
        setFirstVisitKm(tripVisits[0].initialKm);
        setLastVisitKm(tripVisits[tripVisits.length - 1].initialKm);
      } else {
        setFirstVisitKm(null);
        setLastVisitKm(null);
        toast({
            variant: 'destructive',
            title: 'Aviso',
            description: 'Não há visitas registradas para esta viagem. O cálculo da distância não será preciso.',
            duration: 7000,
        })
      }
      setFinalKm('');
    }
  }, [trip, isOpen, visitsData, toast]); // Depend on visitsData prop

  const handleConfirm = () => {
    if (!trip) return;

    const kmValue = Number(finalKm);

    if (finalKm === '' || kmValue <= 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Quilometragem final é obrigatória e deve ser maior que zero.' });
      return;
    }

    if (lastVisitKm !== null && kmValue < lastVisitKm) {
         toast({
             variant: "destructive",
             title: "Erro de Quilometragem",
             description: `A quilometragem final (${kmValue.toLocaleString('pt-BR')} Km) não pode ser menor que a da última visita registrada (${lastVisitKm.toLocaleString('pt-BR')} Km).`,
             duration: 7000,
         });
         return;
     }

    let totalDistance = 0;
    if (firstVisitKm !== null) {
      totalDistance = kmValue - firstVisitKm;
      if (totalDistance < 0) {
          toast({ variant: 'destructive', title: 'Erro de Cálculo', description: 'Distância total resultou em valor negativo. Verifique os KMs.' });
          return;
      }
    } else {
        totalDistance = 0;
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
            min={lastVisitKm ?? 0}
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
