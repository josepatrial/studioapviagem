// src/components/Trips/TripAccordionItem.tsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { CardTitle, CardDescription } from '@/components/ui/card'; // Only if used, or remove
import { AccordionItem, AccordionHeader, AccordionContent, AccordionTrigger as UiAccordionTrigger } from '../ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatKm } from '@/lib/utils';
import { Trip } from './Trips';
import { Visits } from './Visits';
import { Expenses } from './Expenses';
import { Fuelings } from './Fuelings';
import { VehicleInfo } from '../Vehicle'; // For vehicle selection
import {
  CheckCircle,
  Edit,
  Eye,
  Fuel,
  Loader2,
  MapPin,
  Milestone,
  PackageCheck,
  PlayCircle,
  Printer,
  Settings,
  Share2,
  Trash2,
  Truck,
  Users,
  Wallet,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format as formatDateFn, parseISO } from 'date-fns';

interface TripAccordionItemProps {
  trip: Trip;
  getVehicleInfo: (vehicleId: string | undefined) => string;
  getTripDescription: (trip: Trip) => string; // To get the auto-generated name for display
  visitCount: number;
  expenseCount: number;
  fuelingCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  activeSubTab: 'visits' | 'expenses' | 'fuelings' | null;

  // Props for Edit Modal
  currentTripForEdit: Trip | null;
  openEditModalForThisTrip: () => void;
  closeEditModal: () => void;
  isEditModalOpenForThisTrip: boolean;
  handleEditTripSubmit: (e: React.FormEvent) => void;
  // Form state for edit (passed down)
  tripNameInput: string; // Although likely auto-generated, keep for consistency if form uses it
  selectedVehicleId: string;
  setSelectedVehicleId: (id: string) => void;
  tripStatus: 'Andamento' | 'Finalizado';
  setTripStatus: (status: 'Andamento' | 'Finalizado') => void;
  tripBase: string; // Though likely not editable directly
  tripDescription: string;
  setTripDescription: (desc: string) => void;
  vehicles: VehicleInfo[];

  // Props for Finish Modal (implicitly handled by openFinishModal prop)
  openFinishModal: () => void;

  // Props for Delete Modal
  tripToDelete: Trip | null;
  openDeleteModalForThisTrip: (trip: Trip, event?: React.MouseEvent) => void;
  isDeleteModalOpenForThisTrip: boolean;
  closeDeleteConfirmation: () => void;
  confirmDeleteTrip: () => void;

  // Props for Print
  handlePrintTrip: (tripId: string) => void;

  isSaving: boolean;
  isDeleting: boolean;

  // For KM summary
  tripKmSummary: { betweenVisits: number | null, firstToLast: number | null };
}

const safeFormatDate = (dateInput: string | Date | Timestamp | undefined | null, formatStr: string = 'dd/MM/yyyy HH:mm'): string => {
    if (!dateInput) return 'N/A';
    try {
        if (typeof dateInput === 'string') {
            return formatDateFn(parseISO(dateInput), formatStr);
        } else if (dateInput && typeof (dateInput as any).toDate === 'function') { // Firebase Timestamp
            return formatDateFn((dateInput as any).toDate(), formatStr);
        } else if (dateInput instanceof Date) { // JavaScript Date
            return formatDateFn(dateInput, formatStr);
        }
        return 'Data inválida';
    } catch (error) {
        console.warn("[TripAccordionItem safeFormatDate] Error formatting date:", dateInput, error);
        return 'Data inválida';
    }
};


export const TripAccordionItem: React.FC<TripAccordionItemProps> = ({
  trip,
  getVehicleInfo,
  getTripDescription: getDisplayTripName, // Renaming for clarity as it generates the display name
  visitCount,
  expenseCount,
  fuelingCount,
  isExpanded,
  onToggleExpand, // This will be implicitly called by AccordionTrigger
  activeSubTab,

  currentTripForEdit,
  openEditModalForThisTrip,
  closeEditModal,
  isEditModalOpenForThisTrip,
  handleEditTripSubmit,
  selectedVehicleId,
  setSelectedVehicleId,
  tripStatus,
  setTripStatus,
  tripDescription,
  setTripDescription,
  vehicles,

  openFinishModal,

  tripToDelete,
  openDeleteModalForThisTrip,
  isDeleteModalOpenForThisTrip,
  closeDeleteConfirmation,
  confirmDeleteTrip,
  handlePrintTrip,
  isSaving,
  isDeleting,
  tripKmSummary,
}) => {

  const displayTripName = getDisplayTripName(trip); // Use the passed function to get the trip name

  const isPending = trip.syncStatus === 'pending';
  const isError = trip.syncStatus === 'error';

  const deleteDialogMessage = tripToDelete
    ? `Tem certeza que deseja marcar a viagem "${tripToDelete.name || 'sem nome'}" para exclusão? Itens relacionados (visitas, despesas, abastecimentos) também serão marcados.`
    : "Tem certeza que deseja marcar esta viagem para exclusão? Itens relacionados (visitas, despesas, abastecimentos) também serão marcados.";


  return (
    <AccordionItem key={trip.localId} value={trip.localId} className="border bg-card rounded-lg shadow-lg overflow-hidden group/item data-[state=open]:border-primary/50">
      <AccordionHeader className="flex items-start"> {/* Changed from flex to flex items-start */}
        <div className={cn(
          "flex justify-between items-center w-full",
          isPending && "bg-yellow-100 dark:bg-yellow-900/30",
          isError && "bg-red-100 dark:bg-red-900/30",
          "hover:bg-accent/50 transition-colors" // General hover for the entire header bar
        )}>
          <UiAccordionTrigger
            className={cn(
              "flex-1 text-left p-4", // Removed specific hover, parent div handles it
              // "hover:bg-accent/50", // Removed for parent div to handle hover
              "data-[state=open]:border-b data-[state=open]:border-border"
            )}
          >
            <div className="w-full">
              <div className="flex justify-between items-center">
                <h3 className="text-md font-semibold text-primary truncate pr-2" title={displayTripName}>
                  {displayTripName}
                </h3>
                <Badge
                  variant={trip.status === 'Andamento' ? 'default' : 'secondary'}
                  className={cn(
                    trip.status === 'Andamento' && 'bg-emerald-500 hover:bg-emerald-600 text-emerald-foreground',
                    trip.status === 'Finalizado' && 'bg-slate-500 hover:bg-slate-600 text-slate-foreground'
                  )}
                >
                  {trip.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {getVehicleInfo(trip.vehicleId)}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
                <span className="flex items-center gap-1" title="Visitas"> <MapPin className="h-3 w-3" /> {visitCount}</span>
                <span className="flex items-center gap-1" title="Despesas"> <Wallet className="h-3 w-3" /> {expenseCount}</span>
                <span className="flex items-center gap-1" title="Abastecimentos"> <Fuel className="h-3 w-3" /> {fuelingCount}</span>
                <span className="flex items-center gap-1" title="Criada em"> <Milestone className="h-3 w-3" /> {safeFormatDate(trip.createdAt, 'dd/MM/yy')}</span>
                 {trip.status === 'Finalizado' && tripKmSummary.firstToLast !== null && (
                   <span className="flex items-center gap-1 text-blue-600 font-medium" title="Distância Total da Viagem">
                     <Truck className="h-3 w-3" /> {formatKm(tripKmSummary.firstToLast)}
                   </span>
                 )}
                 {trip.status === 'Andamento' && tripKmSummary.betweenVisits !== null && tripKmSummary.betweenVisits > 0 && (
                    <span className="flex items-center gap-1 text-indigo-600 font-medium" title="Distância Entre Visitas">
                      <Milestone className="h-3 w-3" /> {formatKm(tripKmSummary.betweenVisits)}
                    </span>
                  )}
              </div>
               {isPending && <p className="text-xs text-yellow-600 mt-1">Sincronização pendente</p>}
               {isError && <p className="text-xs text-red-600 mt-1">Erro na sincronização</p>}
            </div>
          </UiAccordionTrigger>

          {/* Action Buttons Area */}
          <div className="flex flex-col sm:flex-row items-center p-2 sm:py-4 sm:pr-4 gap-1 self-start sm:self-center">
            {trip.status === 'Andamento' && (
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openFinishModal(); }} className="h-8 px-2 sm:px-3 border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 w-full sm:w-auto" disabled={isSaving || isDeleting}>
                <CheckCircle className="h-4 w-4 mr-1 sm:mr-2" /> Finalizar
              </Button>
            )}
            <Dialog open={isEditModalOpenForThisTrip} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditModalForThisTrip(); }} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving || isDeleting}>
                  <Edit className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Editar Viagem: {currentTripForEdit?.name}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleEditTripSubmit} className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="editVehicleId">Veículo*</Label>
                    <Select onValueChange={setSelectedVehicleId} value={selectedVehicleId} required disabled={isSaving || vehicles.length === 0}>
                      <SelectTrigger id="editVehicleId"><SelectValue placeholder="Selecione um veículo" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map(vehicle => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.model} ({vehicle.licensePlate})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editTripDescription">Descrição (Opcional)</Label>
                    <Textarea id="editTripDescription" value={tripDescription} onChange={(e) => setTripDescription(e.target.value)} placeholder="Ex: Entrega cliente X, Rota Sul..." disabled={isSaving}/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editTripStatus">Status*</Label>
                    <Select onValueChange={(value) => setTripStatus(value as 'Andamento' | 'Finalizado')} value={tripStatus} required disabled={isSaving || tripStatus === 'Finalizado'}>
                      <SelectTrigger id="editTripStatus" disabled={tripStatus === 'Finalizado'} title={tripStatus === 'Finalizado' ? "Não é possível alterar status de viagem finalizada" : ""}>
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Andamento">Andamento</SelectItem>
                        <SelectItem value="Finalizado" disabled={true}>Finalizado (via botão "Finalizar")</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button></DialogClose>
                    <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90">
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar Alterações
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handlePrintTrip(trip.localId); }} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving || isDeleting} title="Imprimir/Salvar PDF">
              <Printer className="h-4 w-4" />
            </Button>

            <AlertDialog open={isDeleteModalOpenForThisTrip && tripToDelete?.localId === trip.localId} onOpenChange={(isOpen) => { if (!isOpen) closeDeleteConfirmation();}}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDeleteModalForThisTrip(trip, e); }} className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving || isDeleting}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                  <AlertDialogDescription>
                    {deleteDialogMessage}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={(e) => { e.stopPropagation(); closeDeleteConfirmation(); }} disabled={isDeleting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={(e) => { e.stopPropagation(); confirmDeleteTrip(); }} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isDeleting}>
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </AccordionHeader>
      <AccordionContent className="bg-card p-0 data-[state=open]:border-t"> {/* Use bg-card and remove direct padding for consistency */}
        {/* Content is always rendered, AccordionContent controls visibility */}
        <div className="p-4"> {/* Add padding here if needed inside the content area */}
          <Tabs defaultValue={activeSubTab || "visits"} className="w-full pt-4">
            <div className="border-b bg-card"> {/* Changed from bg-background */}
              <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
                <TabsTrigger value="visits"><MapPin className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Visitas ({visitCount})</TabsTrigger>
                <TabsTrigger value="expenses"><Wallet className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Despesas ({expenseCount})</TabsTrigger>
                <TabsTrigger value="fuelings"><Fuel className="mr-2 h-4 w-4 sm:hidden md:inline-block" /> Abastecimentos ({fuelingCount})</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="visits" className="mt-4">
              <Visits tripId={trip.localId} ownerUserId={trip.userId} />
            </TabsContent>
            <TabsContent value="expenses" className="mt-4">
              <Expenses tripId={trip.localId} ownerUserId={trip.userId} />
            </TabsContent>
            <TabsContent value="fuelings" className="mt-4">
              <Fuelings tripId={trip.localId} vehicleId={trip.vehicleId!} ownerUserId={trip.userId} />
            </TabsContent>
          </Tabs>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
