
// src/components/Trips/TripAccordionItem.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { AccordionItem, AccordionHeader, AccordionContent, AccordionTrigger as UiAccordionTrigger } from '../ui/accordion'; // Changed to relative path
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Car, CheckCircle2, PlayCircle, MapPin, Wallet, Fuel, Milestone, Loader2, ChevronDown, TrendingUp, Edit, Trash2 } from 'lucide-react';
import type { Trip } from './Trips';
import type { User } from '@/contexts/AuthContext';
import type { LocalVehicle } from '@/services/localDbService';
import { cn } from '@/lib/utils';
import { formatKm } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '../LoadingSpinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const VisitsComponent = dynamic(() => import('./Visits').then(mod => mod.Visits), {
  loading: () => <LoadingSpinner className="h-5 w-5" />,
  ssr: false,
});
const ExpensesComponent = dynamic(() => import('./Expenses').then(mod => mod.Expenses), {
    loading: () => <LoadingSpinner className="h-5 w-5" />,
    ssr: false,
});
const FuelingsComponent = dynamic(() => import('./Fuelings').then(mod => mod.Fuelings), {
    loading: () => <LoadingSpinner className="h-5 w-5" />,
    ssr: false,
});

interface TripAccordionItemProps {
  trip: Trip;
  visitCount: number;
  expenseCount: number;
  fuelingCount: number;
  isExpanded: boolean;
  activeSubTab: 'visits' | 'expenses' | 'fuelings' | null;
  getVehicleDisplay: (vehicleId: string) => string;
  getDriverName: (driverId: string) => string;
  getTripDescription: (trip: Trip) => string;
  openFinishModal: (trip: Trip, event: React.MouseEvent) => void;
  openEditModal: (trip: Trip, event: React.MouseEvent) => void;
  currentTripForEdit: Trip | null;
  isEditModalOpen: boolean;
  closeEditModal: () => void;
  handleEditTripSubmit: (e: React.FormEvent) => void;
  selectedVehicleIdForEdit: string;
  setSelectedVehicleIdForEdit: (id: string) => void;
  openDeleteConfirmation: (trip: Trip, event: React.MouseEvent) => void;
  tripToDelete: Trip | null;
  isDeleteModalOpen: boolean;
  closeDeleteConfirmation: () => void;
  confirmDeleteTrip: () => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
  tripToFinish: Trip | null;
  user: User | null;
  isAdmin: boolean;
  vehicles: LocalVehicle[];
  getTripSummaryKmFunction: (tripId: string) => Promise<{ betweenVisits: number | null; firstToLast: number | null }>;
  loadingVehicles: boolean;
}

export const TripAccordionItem: React.FC<TripAccordionItemProps> = ({
  trip,
  visitCount,
  expenseCount,
  fuelingCount,
  isExpanded,
  activeSubTab,
  getVehicleDisplay,
  getDriverName,
  getTripDescription,
  openFinishModal,
  openEditModal,
  currentTripForEdit,
  isEditModalOpen,
  closeEditModal,
  handleEditTripSubmit,
  selectedVehicleIdForEdit,
  setSelectedVehicleIdForEdit,
  openDeleteConfirmation,
  tripToDelete,
  isDeleteModalOpen,
  closeDeleteConfirmation,
  confirmDeleteTrip,
  isSaving,
  isDeleting,
  tripToFinish,
  user,
  isAdmin,
  vehicles,
  getTripSummaryKmFunction,
  loadingVehicles,
}) => {
  const [tripKmSummary, setTripKmSummary] = useState<{ betweenVisits: number | null, firstToLast: number | null }>({ betweenVisits: null, firstToLast: null });

  useEffect(() => {
    if (isExpanded) {
      getTripSummaryKmFunction(trip.localId).then(summary => setTripKmSummary(summary));
    }
  }, [isExpanded, trip.localId, getTripSummaryKmFunction, trip.status, trip.finalKm, visitCount]);

  const isPending = trip.syncStatus === 'pending';
  const isError = trip.syncStatus === 'error';

  return (
    <AccordionItem key={trip.localId} value={trip.localId} className="border bg-card rounded-lg shadow-sm overflow-hidden group/item data-[state=open]:border-primary/50">
      <AccordionHeader className={cn(
        "flex justify-between items-center hover:bg-accent/50 w-full data-[state=open]:border-b", // Removed p-4 here, relies on Trigger's padding
        isPending && "bg-yellow-50 hover:bg-yellow-100/80 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30",
        isError && "bg-destructive/10 hover:bg-destructive/20"
      )}>
        <UiAccordionTrigger className={cn(
          // Removed p-0, allowing base py-4 to apply. Added px-4 for horizontal padding if needed.
          "flex-1 text-left px-4 hover:no-underline [&_svg]:transition-transform [&_svg]:duration-200 [&[data-state=open]>svg]:rotate-180",
          isPending && "bg-transparent", // Ensure conditional background doesn't conflict with default hover
          isError && "bg-transparent"
        )}>
          <div className="flex-1 mr-4 space-y-1">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg">{trip.name}</CardTitle>
                <Badge variant={trip.status === 'Andamento' ? 'default' : 'secondary'} className={cn('h-5 px-2 text-xs whitespace-nowrap', trip.status === 'Andamento' ? 'bg-emerald-500 hover:bg-emerald-500/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80 text-white' : '')}>
                  {trip.status === 'Andamento' ? <PlayCircle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {trip.status}
                </Badge>
                {isPending && <Badge variant="outline" className="h-5 px-2 text-xs whitespace-nowrap border-yellow-500 text-yellow-700 dark:text-yellow-400">Pendente</Badge>}
                {isError && <Badge variant="destructive" className="h-5 px-2 text-xs whitespace-nowrap">Erro Sinc</Badge>}
              </div>
              <CardDescription className="text-sm flex items-center gap-1">
                <Car className="h-4 w-4 text-muted-foreground" /> {getTripDescription(trip)}
              </CardDescription>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {visitCount} {visitCount === 1 ? 'Visita' : 'Visitas'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Wallet className="h-3 w-3" /> {expenseCount} {expenseCount === 1 ? 'Despesa' : 'Despesas'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Fuel className="h-3 w-3" /> {fuelingCount} {fuelingCount === 1 ? 'Abastec.' : 'Abastec.'}
                </span>
                {trip.status === 'Finalizado' && trip.totalDistance != null && (
                  <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
                    <Milestone className="h-3 w-3" /> {formatKm(trip.totalDistance)} Total Percorrido
                  </span>
                )}
                {isExpanded && tripKmSummary.betweenVisits !== null && tripKmSummary.betweenVisits > 0 && (
                  <span className="text-blue-600 font-medium inline-flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> {formatKm(tripKmSummary.betweenVisits)} Entre Visitas
                  </span>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Início: {new Date(trip.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                <span>Atualizado: {new Date(trip.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
          {/* Chevron is part of UiAccordionTrigger from ui/accordion.tsx */}
        </UiAccordionTrigger>

        <div className="flex items-center gap-1 flex-shrink-0 ml-2 pr-4"> {/* Added pr-4 for spacing from edge */}
          {trip.status === 'Andamento' && (isAdmin || trip.userId === user?.id) && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); openFinishModal(trip, e); }}
              className="h-8 px-2 sm:px-3 text-emerald-600 border-emerald-600/50 hover:bg-emerald-50 hover:text-emerald-700"
              disabled={isSaving || isDeleting}
            >
              {isSaving && tripToFinish?.localId === trip.localId ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <CheckCircle2 className="h-4 w-4 sm:mr-1" />}
              <span className="hidden sm:inline">{isSaving && tripToFinish?.localId === trip.localId ? 'Finalizando...' : 'Finalizar'}</span>
            </Button>
          )}
          {(isAdmin || trip.userId === user?.id) && (
            <>
              <Dialog open={isEditModalOpen && currentTripForEdit?.localId === trip.localId} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditModal(trip, e); }} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving || isDeleting}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Editar Viagem</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleEditTripSubmit} className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Nome da Viagem</Label>
                      <p className="text-sm text-muted-foreground">{currentTripForEdit?.name}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editVehicleId">Veículo*</Label>
                      <Select value={selectedVehicleIdForEdit} onValueChange={setSelectedVehicleIdForEdit} required disabled={isSaving || loadingVehicles}>
                        <SelectTrigger id="editVehicleId">
                          <SelectValue placeholder={loadingVehicles ? "Carregando..." : "Selecione"} />
                        </SelectTrigger>
                        <SelectContent>
                          {loadingVehicles ? (
                            <SelectItem value="loading_vehicles_edit" disabled>
                              <div className="flex items-center justify-center py-2">
                                <LoadingSpinner className="h-4 w-4" />
                              </div>
                            </SelectItem>
                          ) : vehicles.map((vehicle) => (
                            <SelectItem key={vehicle.localId} value={vehicle.localId}>
                              {vehicle.model} ({vehicle.licensePlate})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Motorista</Label>
                      <p className="text-sm text-muted-foreground">{getDriverName(trip.userId)}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Base</Label>
                      <p className="text-sm text-muted-foreground">{currentTripForEdit?.base || 'N/A'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <p className="text-sm font-medium">{currentTripForEdit?.status}</p>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button>
                      </DialogClose>
                      <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Salvando...' : 'Salvar Alterações Locais'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <AlertDialog open={!!tripToDelete && tripToDelete.localId === trip.localId} onOpenChange={(isOpen) => !isOpen && closeDeleteConfirmation()}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDeleteConfirmation(trip, e); }} className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving || isDeleting}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja marcar a viagem "{tripToDelete?.name}" para exclusão? Itens relacionados (visitas, despesas, abastecimentos) também serão marcados. A exclusão definitiva ocorrerá na próxima sincronização ou imediatamente se nunca foi sincronizada.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isDeleting}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={confirmDeleteTrip}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      disabled={isDeleting}
                    >
                      {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isDeleting ? 'Marcando...' : 'Marcar para Excluir'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </AccordionHeader>
      <AccordionContent className="p-4 pt-0 bg-secondary/30">
        {isExpanded && (
          <Tabs defaultValue={activeSubTab || "visits"} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="visits"><MapPin className="mr-1 h-4 w-4 inline-block" />Visitas ({visitCount})</TabsTrigger>
              <TabsTrigger value="expenses"><Wallet className="mr-1 h-4 w-4 inline-block" />Despesas ({expenseCount})</TabsTrigger>
              <TabsTrigger value="fuelings"><Fuel className="mr-1 h-4 w-4 inline-block" />Abastecimentos ({fuelingCount})</TabsTrigger>
            </TabsList>
            <TabsContent value="visits" className="mt-4">
              <VisitsComponent tripId={trip.localId} tripName={trip.name} ownerUserId={trip.userId} />
            </TabsContent>
            <TabsContent value="expenses" className="mt-4">
              <ExpensesComponent tripId={trip.localId} tripName={trip.name} ownerUserId={trip.userId} />
            </TabsContent>
            <TabsContent value="fuelings" className="mt-4">
              <FuelingsComponent tripId={trip.localId} tripName={trip.name} vehicleId={trip.vehicleId} ownerUserId={trip.userId} />
            </TabsContent>
          </Tabs>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

