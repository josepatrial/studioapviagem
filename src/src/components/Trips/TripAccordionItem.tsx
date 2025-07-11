// src/components/Trips/TripAccordionItem.tsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { AccordionItem, AccordionHeader, AccordionContent, AccordionTrigger as UiAccordionTrigger } from '../ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Car, CheckCircle2, PlayCircle, MapPin, Wallet, Fuel, Milestone, Loader2, ChevronDown, TrendingUp, Edit, Trash2, Printer, Share2 } from 'lucide-react';
import type { Trip, TripReportData } from './Trips';
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
  DialogDescription as DialogDesc,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogDescUi,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { Textarea } from '../ui/textarea';


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

  currentTripForEdit: Trip | null;
  isEditModalOpenForThisTrip: boolean;
  openEditModalForThisTrip: () => void;
  closeEditModal: () => void;
  handleEditTripSubmit: (e: React.FormEvent) => void;
  selectedVehicleIdForEdit: string;
  setSelectedVehicleIdForEdit: (id: string) => void;

  tripToDelete: Trip | null;
  isDeleteModalOpenForThisTrip: boolean;
  openDeleteModalForThisTrip: (trip: Trip, event: React.MouseEvent) => void;
  closeDeleteModal: () => void;
  confirmDeleteTrip: () => Promise<void>;

  isSaving: boolean;
  isDeleting: boolean;
  tripToFinish: Trip | null;
  user: User | null;
  isAdmin: boolean;
  vehicles: LocalVehicle[];
  getTripSummaryKmFunction: (tripId: string) => Promise<{ betweenVisits: number | null; firstToLast: number | null }>;
  loadingVehicles: boolean;
  onGenerateReport: (trip: Trip) => Promise<TripReportData | null>;

  isShareModalOpenForThisTrip: boolean;
  openShareModalForThisTrip: () => void;
  closeShareModal: () => void;
  detailedSummaryText: string | null;
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
  currentTripForEdit,
  isEditModalOpenForThisTrip,
  openEditModalForThisTrip,
  closeEditModal,
  handleEditTripSubmit,
  selectedVehicleIdForEdit,
  setSelectedVehicleIdForEdit,
  tripToDelete,
  isDeleteModalOpenForThisTrip,
  openDeleteModalForThisTrip,
  closeDeleteModal,
  confirmDeleteTrip,
  isSaving,
  isDeleting,
  tripToFinish,
  user,
  isAdmin,
  vehicles,
  getTripSummaryKmFunction,
  loadingVehicles,
  onGenerateReport,
  isShareModalOpenForThisTrip,
  openShareModalForThisTrip,
  closeShareModal,
  detailedSummaryText,
}) => {
  const [tripKmSummary, setTripKmSummary] = React.useState<{ betweenVisits: number | null, firstToLast: number | null }>({ betweenVisits: null, firstToLast: null });
  const [isGeneratingReport, setIsGeneratingReport] = React.useState(false);


  React.useEffect(() => {
    if (isExpanded) {
      getTripSummaryKmFunction(trip.localId).then(summary => {
        setTripKmSummary(summary);
      }).catch(err => {
        console.error(`[TripAccordionItem ${trip.localId}] Error fetching KM summary:`, err);
      });
    }
  }, [isExpanded, trip.localId, getTripSummaryKmFunction, trip.status, trip.finalKm, visitCount]);

  const isPending = trip.syncStatus === 'pending';
  const isError = trip.syncStatus === 'error';

  const safeFormatDate = (dateInput: string | { toDate: () => Date } | Date | undefined | null): string => {
    if (!dateInput) return 'N/A';
    try {
      if (typeof dateInput === 'string') {
        return format(parseISO(dateInput), 'dd/MM/yyyy');
      } else if (dateInput && typeof (dateInput as any).toDate === 'function') {
        // It's a Firebase Timestamp object
        return format((dateInput as any).toDate(), 'dd/MM/yyyy');
      } else if (dateInput instanceof Date) {
        // It's already a Date object
        return format(dateInput, 'dd/MM/yyyy');
      }
      return 'Data inválida';
    } catch (error) {
      console.warn("Error formatting date:", dateInput, error);
      return 'Data inválida';
    }
  };


  const handlePrintReport = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsGeneratingReport(true);
    const reportData = await onGenerateReport(trip);
    setIsGeneratingReport(false);

    if (!reportData) {
      return;
    }

    const formatCurrencyForReport = (value: number | undefined) => {
        if (value === undefined || value === null) return 'N/A';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const formatDateForReportPrint = (dateString: string | { toDate: () => Date } | Date | undefined | null, includeTime = true) => {
        if (!dateString) return 'N/A';
        try {
            const formatString = includeTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy';
            if (typeof dateString === 'string') {
                return format(parseISO(dateString), formatString);
            } else if (dateString && typeof (dateString as any).toDate === 'function') {
                return format((dateString as any).toDate(), formatString);
            } else if (dateString instanceof Date) {
                return format(dateString, formatString);
            }
            return 'Data Inválida';
        } catch {
            return 'Data Inválida';
        }
    };

    let reportHtml = `
      <html>
        <head>
          <title>Relatório da Viagem: ${reportData.name}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 10pt; }
            h1, h2, h3 { color: #333; }
            h1 { font-size: 16pt; margin-bottom: 5px; text-align: center; }
            h2 { font-size: 13pt; margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px;}
            h3 { font-size: 11pt; margin-top: 12px; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #ddd; padding: 5px; text-align: left; word-wrap: break-word; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .trip-summary p { margin: 2px 0; font-size: 9pt;}
            .section-empty { color: #777; font-style: italic; padding: 10px 0; }
            .logo-header { text-align: center; margin-bottom: 15px; }
            .logo-header img { max-height: 60px; }
            .footer { text-align: center; font-size: 8pt; color: #777; margin-top: 20px; position: fixed; bottom: 10px; width: 100%; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 15mm; }
              .no-print { display: none; }
              table { font-size: 9pt; }
              th, td { padding: 4px; }
            }
          </style>
        </head>
        <body>
          <div class="logo-header">
            <img src="https://placehold.co/200x60.png?text=Grupo+2+Irmaos" alt="Logo Grupo 2 Irmãos" data-ai-hint="company logo"/>
          </div>
          <h1>Relatório da Viagem</h1>
          <div class="trip-summary">
            <p><strong>Nome da Viagem:</strong> ${reportData.name}</p>
            <p><strong>Status:</strong> ${reportData.status}</p>
            <p><strong>Motorista:</strong> ${reportData.driverName}</p>
            <p><strong>Veículo:</strong> ${reportData.vehicleDisplay}</p>
            <p><strong>Base:</strong> ${reportData.base || 'N/A'}</p>
            <p><strong>Criada em:</strong> ${formatDateForReportPrint(reportData.createdAt, false)}</p>
            <p><strong>Atualizada em:</strong> ${formatDateForReportPrint(reportData.updatedAt, false)}</p>
            ${reportData.status === 'Finalizado' ? `<p><strong>KM Final:</strong> ${formatKm(reportData.finalKm)}</p>` : ''}
            ${reportData.status === 'Finalizado' && reportData.totalDistance != null ? `<p><strong>Distância Total:</strong> ${formatKm(reportData.totalDistance)}</p>` : ''}
          </div>

          <h2>Visitas (${reportData.visits.length})</h2>
    `;
    if (reportData.visits.length > 0) {
      reportHtml += `
          <table>
            <thead><tr><th>Cliente</th><th>Tipo</th><th>Local (Cidade)</th><th>KM Visita</th><th>Motivo</th><th>Data/Hora</th></tr></thead>
            <tbody>`;
      reportData.visits.forEach(v => {
        reportHtml += `<tr>
                        <td>${v.clientName}</td>
                        <td>${v.visitType || 'N/A'}</td>
                        <td>${v.location}</td>
                        <td>${formatKm(v.initialKm)}</td>
                        <td>${v.reason}</td>
                        <td>${formatDateForReportPrint(v.timestamp)}</td>
                       </tr>`;
      });
      reportHtml += `</tbody></table>`;
    } else {
      reportHtml += `<p class="section-empty">Nenhuma visita registrada.</p>`;
    }

    reportHtml += `<h2>Despesas (${reportData.expenses.length})</h2>`;
    if (reportData.expenses.length > 0) {
      reportHtml += `
          <table>
            <thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Data</th><th>Anexo</th></tr></thead>
            <tbody>`;
      reportData.expenses.forEach(e => {
        reportHtml += `<tr>
                        <td>${e.description}</td>
                        <td>${e.expenseType}</td>
                        <td>${formatCurrencyForReport(e.value)}</td>
                        <td>${formatDateForReportPrint(e.expenseDate, false)}</td>
                        <td>${e.receiptFilename || 'Nenhum'}</td>
                       </tr>`;
      });
      reportHtml += `</tbody></table>`;
    } else {
      reportHtml += `<p class="section-empty">Nenhuma despesa registrada.</p>`;
    }

    reportHtml += `<h2>Abastecimentos (${reportData.fuelings.length})</h2>`;
    if (reportData.fuelings.length > 0) {
      reportHtml += `
          <table>
            <thead><tr><th>Data</th><th>Litros</th><th>Preço/L</th><th>Total</th><th>Odômetro</th><th>Combustível</th><th>Local</th><th>Anexo</th></tr></thead>
            <tbody>`;
      reportData.fuelings.forEach(f => {
        reportHtml += `<tr>
                        <td>${formatDateForReportPrint(f.date, false)}</td>
                        <td>${f.liters.toFixed(2)} L</td>
                        <td>${formatCurrencyForReport(f.pricePerLiter)}</td>
                        <td>${formatCurrencyForReport(f.totalCost)}</td>
                        <td>${formatKm(f.odometerKm)}</td>
                        <td>${f.fuelType}</td>
                        <td>${f.location}</td>
                        <td>${f.receiptFilename || 'Nenhum'}</td>
                       </tr>`;
      });
      reportHtml += `</tbody></table>`;
    } else {
      reportHtml += `<p class="section-empty">Nenhum abastecimento registrado.</p>`;
    }

    reportHtml += `
          <div class="footer">
            Relatório gerado em ${formatDateForReportPrint(new Date().toISOString())}
          </div>
          <div class="no-print" style="margin-top: 30px; text-align: center; padding-bottom: 20px;">
            <button onclick="window.print()">Imprimir Relatório</button>
            <button onclick="window.close()">Fechar</button>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=1000,height=700,scrollbars=yes,resizable=yes');
    if (printWindow) {
      printWindow.document.write(reportHtml);
      printWindow.document.close();
      printWindow.focus();
    } else {
      alert("Seu navegador bloqueou a abertura da janela de impressão. Por favor, habilite pop-ups para este site.");
    }
  };


  return (
    <AccordionItem key={trip.localId} value={trip.localId} className="border bg-card rounded-lg shadow-lg overflow-hidden group/item data-[state=open]:border-primary/50">
      <AccordionHeader className="flex"> {/* This renders the h3 */}
        <div className={cn(
          "flex justify-between items-center w-full",
          isPending && "bg-yellow-100 hover:bg-yellow-200/70 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50",
          isError && "bg-destructive/20 hover:bg-destructive/30",
          !isPending && !isError && "hover:bg-accent/50"
        )}>
          <UiAccordionTrigger className="flex-1 p-4 hover:no-underline focus-visible:ring-0 focus-visible:ring-offset-0">
            <div className="flex-1 mr-4 space-y-1 text-left">
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
                <CardDescription className="text-sm flex items-center gap-1 mt-1">
                  <Car className="h-4 w-4 text-muted-foreground" /> {getTripDescription(trip)}
                </CardDescription>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
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
                      <Milestone className="h-3 w-3" /> {formatKm(trip.totalDistance)} Total
                    </span>
                  )}
                  {isExpanded && tripKmSummary.betweenVisits !== null && tripKmSummary.betweenVisits > 0 && (
                    <span className="text-blue-600 font-medium inline-flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> {formatKm(tripKmSummary.betweenVisits)} Entre Visitas
                    </span>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                  <span>Início: {safeFormatDate(trip.createdAt)}</span>
                  <span>Atualizado: {safeFormatDate(trip.updatedAt)}</span>
                </div>
              </div>
            </div>
          </UiAccordionTrigger>

          <div className="flex items-center gap-1 flex-shrink-0 pr-4 py-4">
            {trip.status === 'Andamento' && (isAdmin || trip.userId === user?.id) && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); openFinishModal(trip, e); }}
                className="h-8 px-2 sm:px-3 text-emerald-600 border-emerald-600/50 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:border-emerald-400/50 dark:hover:bg-emerald-900/30"
                disabled={isSaving || isDeleting}
              >
                {isSaving && tripToFinish?.localId === trip.localId ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <CheckCircle2 className="h-4 w-4 sm:mr-1" />}
                <span className="hidden sm:inline">{isSaving && tripToFinish?.localId === trip.localId ? 'Finalizando...' : 'Finalizar'}</span>
              </Button>
            )}
            {(isAdmin || trip.userId === user?.id) && (
              <>
                 <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrintReport}
                  className="text-muted-foreground hover:text-accent-foreground h-8 w-8"
                  disabled={isSaving || isDeleting || isGeneratingReport}
                  title="Gerar Relatório da Viagem"
                >
                  {isGeneratingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                </Button>

                <Dialog open={isEditModalOpenForThisTrip} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); }}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditModalForThisTrip(); }} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving || isDeleting}>
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
                              <SelectItem value="loading_vehicles_edit_trip" disabled>
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

                <AlertDialog open={isDeleteModalOpenForThisTrip && tripToDelete?.localId === trip.localId} onOpenChange={(isOpen) => { if (!isOpen) closeDeleteModal(); }}>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDeleteModalForThisTrip(trip, e); }} className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving || isDeleting}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                      <AlertDialogDescUi>
                        Tem certeza que deseja marcar a viagem "{tripToDelete?.name}" para exclusão? Itens relacionados (visitas, despesas, abastecimentos) também serão marcados.
                      </AlertDialogDescUi>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={closeDeleteModal} disabled={isDeleting}>Cancelar</AlertDialogCancel>
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
        </div>
      </AccordionHeader>
      <AccordionContent className="bg-card p-6">
          <Tabs defaultValue={activeSubTab || "visits"} className="w-full pt-4">
            <div className="overflow-x-auto border-b bg-card">
               <TabsList className={cn(
                  "grid w-full rounded-none bg-transparent p-0 sm:w-auto sm:inline-flex",
                  "grid-cols-3"
               )}>
                   <TabsTrigger value="visits" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                     <MapPin className="mr-1 h-4 w-4 inline-block" />Visitas ({visitCount})
                   </TabsTrigger>
                   <TabsTrigger value="expenses" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                     <Wallet className="mr-1 h-4 w-4 inline-block" />Despesas ({expenseCount})
                   </TabsTrigger>
                   <TabsTrigger value="fuelings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-accent/10 data-[state=active]:shadow-none">
                     <Fuel className="mr-1 h-4 w-4 inline-block" />Abastec. ({fuelingCount})
                   </TabsTrigger>
               </TabsList>
            </div>

            {/* Conteúdo das abas */}
            <TabsContent value="visits">
                <VisitsComponent tripId={trip.localId} ownerUserId={trip.userId}/>
            </TabsContent>
            <TabsContent value="expenses">
                <ExpensesComponent tripId={trip.localId} ownerUserId={trip.userId} />
            </TabsContent>
            <TabsContent value="fuelings">
                <FuelingsComponent tripId={trip.localId} vehicleId={trip.vehicleId} ownerUserId={trip.userId} />
            </TabsContent>
          </Tabs>
      </AccordionContent>
    </AccordionItem>
  );
};

