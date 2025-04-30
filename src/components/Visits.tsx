// src/components/Visits.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Eye, Edit, Trash2, MapPin, Milestone, Info, LocateFixed, AlertTriangle } from 'lucide-react'; // Added AlertTriangle
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getCurrentLocation, Coordinate } from '@/services/geolocation'; // Assuming service exists
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/LoadingSpinner'; // Assuming LoadingSpinner exists

export interface Visit { // Export interface
  id: string;
  tripId?: string; // Added tripId
  clientName: string;
  location: string; // Could be address string or lat/lon string
  latitude?: number;
  longitude?: number;
  initialKm: number;
  reason: string;
  timestamp: string; // Add timestamp for sorting/display
}

// Mock data - Now includes tripId
const initialVisits: Visit[] = [
  { id: 'v1', tripId: '1', clientName: 'Cliente Alpha', location: 'Rua Exemplo, 123', latitude: -23.5505, longitude: -46.6333, initialKm: 15000, reason: 'Entrega de material', timestamp: new Date(2024, 6, 21, 10, 30).toISOString() },
  { id: 'v2', tripId: '1', clientName: 'Empresa Beta', location: 'Avenida Principal, 456', latitude: -23.5610, longitude: -46.6400, initialKm: 15150, reason: 'Reunião de Vendas', timestamp: new Date(2024, 6, 21, 14, 0).toISOString() },
  { id: 'v3', tripId: '2', clientName: 'Fornecedor Gama', location: 'Rodovia dos Bandeirantes, km 30', latitude: -23.35, longitude: -46.85, initialKm: 16000, reason: 'Coleta de insumos', timestamp: new Date(2024, 8, 2, 9, 0).toISOString() },
];

interface VisitsProps {
  tripId?: string; // Accept tripId as a prop
  tripName?: string; // Optional trip name for context
}

export const Visits: React.FC<VisitsProps> = ({ tripId, tripName }) => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // State for confirmation dialog
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
  const [visitToConfirm, setVisitToConfirm] = useState<Visit | null>(null); // State for visit awaiting confirmation
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const { toast } = useToast();

  // --- Form State ---
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [initialKm, setInitialKm] = useState<number | ''>('');
  const [reason, setReason] = useState('');

   useEffect(() => {
      // Filter visits by tripId if provided, otherwise show all (or handle as needed)
      const filtered = tripId ? initialVisits.filter(v => v.tripId === tripId) : initialVisits;
      // Sort visits by timestamp descending
      setVisits(filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, [tripId]); // Rerun when tripId changes

  // --- Helpers ---
  const formatKm = (km: number) => km.toLocaleString('pt-BR');

  const getLastVisitKm = (currentTripId?: string): number | null => {
      if (!currentTripId) return null;
      const tripVisits = initialVisits
          .filter(v => v.tripId === currentTripId)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort by date desc
      return tripVisits.length > 0 ? tripVisits[0].initialKm : null; // Get KM from the latest visit
  };


  // --- Handlers ---
  const handleGetLocation = async () => {
    setIsFetchingLocation(true);
    try {
      const coords: Coordinate = await getCurrentLocation();
      setLocation(`Lat: ${coords.latitude.toFixed(4)}, Lon: ${coords.longitude.toFixed(4)}`);
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      toast({ title: "Localização capturada!" });
    } catch (error) {
      console.error("Error getting location:", error);
      toast({ variant: "destructive", title: "Erro ao buscar localização", description: (error as Error).message || "Tente novamente ou digite manualmente." });
      setLocation(''); // Clear location on error
      setLatitude(undefined);
      setLongitude(undefined);
    } finally {
      setIsFetchingLocation(false);
    }
  };

  // Renamed: Handles validation and opening confirmation
  const handlePrepareVisitForConfirmation = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission

    if (!tripId) {
        toast({ variant: "destructive", title: "Erro", description: "ID da viagem não encontrado para associar a visita." });
        return;
    }
    if (!clientName || !location || initialKm === '' || !reason) {
        toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
        return;
    }
    const kmValue = Number(initialKm);
    if (kmValue <= 0) {
         toast({ variant: "destructive", title: "Erro", description: "Quilometragem inicial deve ser maior que zero." });
         return;
    }

    // Sequential KM Validation
    const lastKm = getLastVisitKm(tripId);
    if (lastKm !== null && kmValue < lastKm) {
        toast({
            variant: "destructive",
            title: "Erro de Quilometragem",
            description: `A quilometragem inicial (${formatKm(kmValue)} Km) não pode ser menor que a da última visita registrada (${formatKm(lastKm)} Km).`,
            duration: 7000, // Show longer
        });
        return;
    }


    const newVisit: Visit = {
      id: String(Date.now()),
      tripId: tripId,
      clientName,
      location,
      latitude,
      longitude,
      initialKm: kmValue,
      reason,
      timestamp: new Date().toISOString(),
    };

    setVisitToConfirm(newVisit); // Store the visit details for confirmation
    setIsCreateModalOpen(false); // Close the creation modal
    setIsConfirmModalOpen(true); // Open the confirmation modal
  };

  // Actual saving logic after confirmation
  const confirmAndSaveVisit = () => {
      if (!visitToConfirm) return;

      // Add to global mock data (in real app, this would be an API call)
      initialVisits.push(visitToConfirm);
      // Update local state
      setVisits(prevVisits => [visitToConfirm, ...prevVisits].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      resetForm();
      setIsConfirmModalOpen(false); // Close confirmation modal
      setVisitToConfirm(null); // Clear confirmation state
      toast({ title: "Visita criada com sucesso!" });
    };


   const handleEditVisit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentVisit) return;
       const kmValue = Number(initialKm);

       if (!clientName || !location || initialKm === '' || !reason) {
           toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
           return;
       }
       if (kmValue <= 0) {
            toast({ variant: "destructive", title: "Erro", description: "Quilometragem inicial deve ser maior que zero." });
            return;
       }
       // Note: We might want similar sequential KM validation on edit, but it's more complex
       // as it depends on the visit's position in the sequence. Skipping for now.

      const updatedVisit: Visit = {
        ...currentVisit,
        clientName,
        location,
        latitude,
        longitude,
        initialKm: kmValue,
        reason,
      };

      // Update global mock data
      const index = initialVisits.findIndex(v => v.id === currentVisit.id);
      if (index !== -1) {
          initialVisits[index] = updatedVisit;
      }
      // Update local state
      setVisits(prevVisits => prevVisits.map(v => v.id === currentVisit.id ? updatedVisit : v)
                                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      resetForm();
      setIsEditModalOpen(false);
      setCurrentVisit(null);
      toast({ title: "Visita atualizada com sucesso!" });
    };

  const handleDeleteVisit = (visitId: string) => {
    // Remove from global mock data
    const index = initialVisits.findIndex(v => v.id === visitId);
     if (index !== -1) {
         initialVisits.splice(index, 1);
     }
    // Remove from local state
    setVisits(visits.filter(v => v.id !== visitId));
    toast({ title: "Visita excluída." });
  };

  const openEditModal = (visit: Visit) => {
    setCurrentVisit(visit);
    setClientName(visit.clientName);
    setLocation(visit.location);
    setLatitude(visit.latitude);
    setLongitude(visit.longitude);
    setInitialKm(visit.initialKm);
    setReason(visit.reason);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setClientName('');
    setLocation('');
    setLatitude(undefined);
    setLongitude(undefined);
    setInitialKm('');
    setReason('');
  };

   const closeCreateModal = () => {
     resetForm();
     setIsCreateModalOpen(false);
   }

   const closeEditModal = () => {
      resetForm();
      setIsEditModalOpen(false);
      setCurrentVisit(null);
    }
   const closeConfirmModal = () => {
        setIsConfirmModalOpen(false);
        setVisitToConfirm(null);
        // Optionally re-open create modal if needed, or reset form here too
        // resetForm();
    }


  return (
    <div className="space-y-6">
      {/* Create Visit Dialog Trigger */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">
          {tripName ? `Visitas da Viagem: ${tripName}` : 'Visitas'}
        </h3>
        {tripId && ( // Only show button if a trip context is provided
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
             <DialogTrigger asChild>
               <Button onClick={() => setIsCreateModalOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                 <PlusCircle className="mr-2 h-4 w-4" /> Registrar Visita
               </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-lg">
               <DialogHeader>
                 <DialogTitle>Registrar Nova Visita{tripName ? ` para ${tripName}` : ''}</DialogTitle>
               </DialogHeader>
               {/* Form now triggers confirmation */}
               <form onSubmit={handlePrepareVisitForConfirmation} className="grid gap-4 py-4">
                   <div className="space-y-2">
                      <Label htmlFor="clientName">Nome do Cliente*</Label>
                      <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="Nome ou Empresa" />
                   </div>

                   <div className="space-y-2">
                      <Label htmlFor="location">Localização*</Label>
                      <div className="flex items-center gap-2">
                          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Endereço ou Coordenadas" className="flex-grow"/>
                          <Button type="button" variant="outline" size="icon" onClick={handleGetLocation} disabled={isFetchingLocation} title="Usar GPS">
                             {isFetchingLocation ? <LoadingSpinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
                           </Button>
                      </div>
                      {latitude && longitude && (
                         <p className="text-xs text-muted-foreground">Lat: {latitude.toFixed(4)}, Lon: {longitude.toFixed(4)}</p>
                      )}
                   </div>

                   <div className="space-y-2">
                      <Label htmlFor="initialKm">Quilometragem Inicial (Km)*</Label>
                      <Input id="initialKm" type="number" value={initialKm} onChange={(e) => setInitialKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Km no início da visita" min="0" />
                      <p className="text-xs text-muted-foreground">Confira este valor com atenção antes de salvar.</p>
                   </div>

                   <div className="space-y-2">
                      <Label htmlFor="reason">Motivo da Visita*</Label>
                      <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Ex: Entrega, Coleta, Reunião..." />
                   </div>

                   <DialogFooter>
                     <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button></DialogClose>
                     {/* Changed button type to submit */}
                     <Button type="submit" disabled={isFetchingLocation} className="bg-primary hover:bg-primary/90">Confirmar Dados</Button>
                   </DialogFooter>
               </form>
             </DialogContent>
           </Dialog>
        )}
      </div>

        {/* Confirmation Dialog */}
        <AlertDialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
          {/* No trigger needed here as it's opened programmatically */}
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                 <AlertTriangle className="h-5 w-5 text-yellow-500" /> Confirmar Dados da Visita
              </AlertDialogTitle>
              <AlertDialogDescription>
                Por favor, revise os dados abaixo, especialmente a <strong>Quilometragem Inicial</strong>. Esta ação não pode ser facilmente desfeita.
                <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-foreground">
                    <li><strong>Cliente:</strong> {visitToConfirm?.clientName}</li>
                    <li><strong>Localização:</strong> {visitToConfirm?.location}</li>
                    <li><strong>KM Inicial:</strong> {visitToConfirm ? formatKm(visitToConfirm.initialKm) : 'N/A'}</li>
                    <li><strong>Motivo:</strong> {visitToConfirm?.reason}</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {/* Go back, allows editing */}
              <AlertDialogCancel onClick={() => {
                  setIsConfirmModalOpen(false);
                  setIsCreateModalOpen(true); // Re-open create modal
                  // visitToConfirm state is kept so form fields are pre-filled
              }}>Voltar e Editar</AlertDialogCancel>
              {/* Confirm and save */}
              <AlertDialogAction onClick={confirmAndSaveVisit} className="bg-primary hover:bg-primary/90">Salvar Visita</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


      {/* Visits List */}
      {visits.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhuma visita registrada {tripId ? 'para esta viagem' : ''}.</p>
              {tripId && (
                 <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
                   Registrar a primeira visita
                </Button>
              )}
           </CardContent>
         </Card>
       ) : (
        <div className="grid gap-4">
          {visits.map((visit) => (
            <Card key={visit.id} className="shadow-sm transition-shadow hover:shadow-md bg-card border border-border">
              <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                       <CardTitle>{visit.clientName}</CardTitle>
                       <CardDescription>
                         {new Date(visit.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                       </CardDescription>
                    </div>
                    <div className="flex gap-1">
                       {/* View Button (can open a detailed modal later) */}
                       <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8">
                         <Eye className="h-4 w-4" />
                         <span className="sr-only">Visualizar Detalhes</span>
                       </Button>
                       {/* Edit Button */}
                       <Dialog open={isEditModalOpen && currentVisit?.id === visit.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                         <DialogTrigger asChild>
                           <Button variant="ghost" size="icon" onClick={() => openEditModal(visit)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Editar</span>
                           </Button>
                         </DialogTrigger>
                         <DialogContent className="sm:max-w-lg">
                            <DialogHeader><DialogTitle>Editar Visita</DialogTitle></DialogHeader>
                            <form onSubmit={handleEditVisit} className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="editClientName">Nome do Cliente*</Label>
                                    <Input id="editClientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editLocation">Localização*</Label>
                                     <div className="flex items-center gap-2">
                                         <Input id="editLocation" value={location} onChange={(e) => setLocation(e.target.value)} required className="flex-grow"/>
                                         <Button type="button" variant="outline" size="icon" onClick={handleGetLocation} disabled={isFetchingLocation} title="Usar GPS">
                                            {isFetchingLocation ? <LoadingSpinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
                                          </Button>
                                     </div>
                                      {latitude && longitude && (
                                         <p className="text-xs text-muted-foreground">Lat: {latitude.toFixed(4)}, Lon: {longitude.toFixed(4)}</p>
                                      )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editInitialKm">Km Inicial*</Label>
                                    <Input id="editInitialKm" type="number" value={initialKm} onChange={(e) => setInitialKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required min="0" />
                                     <p className="text-xs text-muted-foreground">Confira este valor com atenção.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editReason">Motivo*</Label>
                                    <Textarea id="editReason" value={reason} onChange={(e) => setReason(e.target.value)} required />
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline" onClick={closeEditModal}>Cancelar</Button></DialogClose>
                                    {/* Submit button for edit form */}
                                    <Button type="submit" className="bg-primary hover:bg-primary/90">Salvar Alterações</Button>
                                </DialogFooter>
                            </form>
                         </DialogContent>
                       </Dialog>
                       {/* Delete Button */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Excluir</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir esta visita para "{visit.clientName}"? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteVisit(visit.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>

              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>{visit.location}</span>
                </div>
                 <div className="flex items-center gap-2 text-muted-foreground">
                    <Milestone className="h-4 w-4 flex-shrink-0" />
                    <span>Km Inicial: {formatKm(visit.initialKm)}</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span>{visit.reason}</span>
                 </div>
              </CardContent>
            </Card>
          ))}
        </div>
       )}
    </div>
  );
};
