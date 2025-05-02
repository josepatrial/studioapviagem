'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Eye, Edit, Trash2, MapPin, Milestone, Info, LocateFixed, AlertTriangle, Loader2 } from 'lucide-react'; // Added Loader2
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getCurrentLocation, Coordinate } from '@/services/geolocation';
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { getVisits, addVisit, updateVisit, deleteVisit } from '@/services/firestoreService'; // Import Firestore service functions

export interface Visit { // Export interface
  id: string;
  tripId: string; // Made non-optional
  clientName: string;
  location: string;
  latitude?: number;
  longitude?: number;
  initialKm: number;
  reason: string;
  timestamp: string; // ISO String
}

// Remove initialVisits - data will be fetched
// export const initialVisits: Visit[] = [...];
export { getVisits } from '@/services/firestoreService'; // Export function for legacy imports if needed

interface VisitsProps {
  tripId: string; // TripId is required to fetch visits
  tripName?: string;
}

export const Visits: React.FC<VisitsProps> = ({ tripId, tripName }) => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false); // Saving/Deleting state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // State for delete confirmation
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
  const [visitToConfirm, setVisitToConfirm] = useState<Visit | null>(null);
  const [visitToDelete, setVisitToDelete] = useState<Visit | null>(null); // State for visit to delete
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const { toast } = useToast();

  // --- Form State ---
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [initialKm, setInitialKm] = useState<number | ''>('');
  const [reason, setReason] = useState('');

   // Fetch visits for the specific tripId
   useEffect(() => {
    const fetchVisitsData = async () => {
      if (!tripId) return; // Don't fetch if tripId is not available
      setLoading(true);
      try {
        const fetchedVisits = await getVisits(tripId);
        setVisits(fetchedVisits); // Already sorted by service
      } catch (error) {
        console.error(`Error fetching visits for trip ${tripId}:`, error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as visitas." });
      } finally {
        setLoading(false);
      }
    };
    fetchVisitsData();
  }, [tripId, toast]);

  // --- Helpers ---
  const formatKm = (km: number) => km.toLocaleString('pt-BR');

  const getLastVisitKm = (): number | null => {
      // Use the locally fetched visits state
      return visits.length > 0 ? visits[0].initialKm : null; // visits state is sorted descending by timestamp
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

  const handlePrepareVisitForConfirmation = (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientName || !location || initialKm === '' || !reason) {
        toast({ variant: "destructive", title: "Erro", description: "Todos os campos marcados com * são obrigatórios." });
        return;
    }
    const kmValue = Number(initialKm);
    if (kmValue <= 0) {
         toast({ variant: "destructive", title: "Erro", description: "Quilometragem inicial deve ser maior que zero." });
         return;
    }

    const lastKm = getLastVisitKm();
    if (lastKm !== null && kmValue < lastKm) {
        toast({
            variant: "destructive",
            title: "Erro de Quilometragem",
            description: `A quilometragem inicial (${formatKm(kmValue)} Km) não pode ser menor que a da última visita registrada (${formatKm(lastKm)} Km).`,
            duration: 7000,
        });
        return;
    }

    // Create temporary visit object for confirmation
    const newVisitData: Omit<Visit, 'id'> = {
      tripId: tripId,
      clientName,
      location,
      latitude,
      longitude,
      initialKm: kmValue,
      reason,
      timestamp: new Date().toISOString(), // Set timestamp now
    };

    // Use a temporary ID for the confirmation object, actual ID comes from Firestore
    setVisitToConfirm({ ...newVisitData, id: 'temp-' + Date.now() });
    setIsCreateModalOpen(false);
    setIsConfirmModalOpen(true);
  };

  const confirmAndSaveVisit = async () => {
      if (!visitToConfirm) return;

      setIsSaving(true);
      // Prepare data for Firestore (omit the temporary ID)
      const { id, ...dataToSave } = visitToConfirm;

      try {
          const newVisitId = await addVisit(dataToSave);
          const savedVisit: Visit = { ...dataToSave, id: newVisitId }; // Create the final object with the real ID

          // Update local state optimistically or re-fetch
          setVisits(prevVisits => [savedVisit, ...prevVisits].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

          resetForm();
          setIsConfirmModalOpen(false);
          setVisitToConfirm(null);
          toast({ title: "Visita criada com sucesso!" });
      } catch (error) {
            console.error("Error adding visit:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível salvar a visita." });
            // Re-open create modal maybe?
            // setIsCreateModalOpen(true);
      } finally {
            setIsSaving(false);
      }
    };

   const handleEditVisit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentVisit) return;
       const kmValue = Number(initialKm);

       if (!clientName || !location || initialKm === '' || !reason) {
           toast({ variant: "destructive", title: "Erro", description: "Todos os campos marcados com * são obrigatórios." });
           return;
       }
       if (kmValue <= 0) {
            toast({ variant: "destructive", title: "Erro", description: "Quilometragem inicial deve ser maior que zero." });
            return;
       }
       // Add sequential validation for edit if necessary, considering the visit's position

      const dataToUpdate: Partial<Visit> = {
        clientName,
        location,
        latitude,
        longitude,
        initialKm: kmValue,
        reason,
        // timestamp is usually not updated, but could be if needed
      };

      setIsSaving(true);
      try {
          await updateVisit(currentVisit.id, dataToUpdate);
          const updatedVisit = { ...currentVisit, ...dataToUpdate };

          // Update local state
          setVisits(prevVisits => prevVisits.map(v => v.id === currentVisit.id ? updatedVisit : v)
                                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          resetForm();
          setIsEditModalOpen(false);
          setCurrentVisit(null);
          toast({ title: "Visita atualizada com sucesso!" });
      } catch (error) {
            console.error("Error updating visit:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar a visita." });
      } finally {
            setIsSaving(false);
      }
    };

    const openDeleteConfirmation = (visit: Visit) => {
        setVisitToDelete(visit);
        setIsDeleteModalOpen(true);
    };

    const closeDeleteConfirmation = () => {
        setVisitToDelete(null);
        setIsDeleteModalOpen(false);
    };

  const confirmDeleteVisit = async () => {
    if (!visitToDelete) return;

    setIsSaving(true);
    try {
        await deleteVisit(visitToDelete.id);
        // Update local state
        setVisits(visits.filter(v => v.id !== visitToDelete.id));
        toast({ title: "Visita excluída." });
        closeDeleteConfirmation();
    } catch (error) {
        console.error("Error deleting visit:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir a visita." });
    } finally {
        setIsSaving(false);
    }
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
        // Maybe reopen create modal?
        // setIsCreateModalOpen(true);
    }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">
          {tripName ? `Visitas da Viagem: ${tripName}` : 'Visitas'}
        </h3>
        <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
             <DialogTrigger asChild>
               <Button onClick={() => {resetForm(); setIsCreateModalOpen(true);}} className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
                 <PlusCircle className="mr-2 h-4 w-4" /> Registrar Visita
               </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-lg">
               <DialogHeader>
                 <DialogTitle>Registrar Nova Visita{tripName ? ` para ${tripName}` : ''}</DialogTitle>
               </DialogHeader>
               <form onSubmit={handlePrepareVisitForConfirmation} className="grid gap-4 py-4">
                   <div className="space-y-2">
                      <Label htmlFor="clientName">Nome do Cliente*</Label>
                      <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="Nome ou Empresa" disabled={isSaving}/>
                   </div>

                   <div className="space-y-2">
                      <Label htmlFor="location">Localização*</Label>
                      <div className="flex items-center gap-2">
                          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Endereço ou Coordenadas" className="flex-grow" disabled={isSaving}/>
                          <Button type="button" variant="outline" size="icon" onClick={handleGetLocation} disabled={isFetchingLocation || isSaving} title="Usar GPS">
                             {isFetchingLocation ? <LoadingSpinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
                           </Button>
                      </div>
                      {latitude && longitude && (
                         <p className="text-xs text-muted-foreground">Lat: {latitude.toFixed(4)}, Lon: {longitude.toFixed(4)}</p>
                      )}
                   </div>

                   <div className="space-y-2">
                      <Label htmlFor="initialKm">Quilometragem Inicial (Km)*</Label>
                      <Input id="initialKm" type="number" value={initialKm} onChange={(e) => setInitialKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Km no início da visita" min="0" disabled={isSaving}/>
                      <p className="text-xs text-muted-foreground">Confira este valor com atenção antes de salvar.</p>
                   </div>

                   <div className="space-y-2">
                      <Label htmlFor="reason">Motivo da Visita*</Label>
                      <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Ex: Entrega, Coleta, Reunião..." disabled={isSaving}/>
                   </div>

                   <DialogFooter>
                     <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button></DialogClose>
                     <Button type="submit" disabled={isFetchingLocation || isSaving} className="bg-primary hover:bg-primary/90">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirmar Dados
                     </Button>
                   </DialogFooter>
               </form>
             </DialogContent>
           </Dialog>
      </div>

        {/* Confirmation Dialog */}
        <AlertDialog open={isConfirmModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeConfirmModal(); }}>
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
                    <li><strong>KM Inicial:</strong> {visitToConfirm ? formatKm(visitToConfirm.initialKm) : 'N/A'} Km</li>
                    <li><strong>Motivo:</strong> {visitToConfirm?.reason}</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                  setIsConfirmModalOpen(false);
                  setIsCreateModalOpen(true); // Re-open create modal
              }} disabled={isSaving}>Voltar e Editar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmAndSaveVisit} className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                 {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                 {isSaving ? 'Salvando...' : 'Salvar Visita'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteModalOpen} onOpenChange={closeDeleteConfirmation}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja excluir esta visita para "{visitToDelete?.clientName}"? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isSaving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteVisit} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Excluindo...' : 'Excluir'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>


      {/* Visits List */}
      {loading ? (
           <div className="flex justify-center items-center h-20">
               <LoadingSpinner />
           </div>
       ) : visits.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhuma visita registrada {tripId ? 'para esta viagem' : ''}.</p>
             <Button variant="link" onClick={() => {resetForm(); setIsCreateModalOpen(true);}} className="mt-2 text-primary">
                 Registrar a primeira visita
             </Button>
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
                        <Dialog>
                           <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8">
                                  <Eye className="h-4 w-4" />
                                  <span className="sr-only">Visualizar Detalhes</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                               <DialogHeader>
                                   <DialogTitle>Detalhes da Visita</DialogTitle>
                               </DialogHeader>
                               <div className="py-4 space-y-3">
                                   <p><strong>Cliente:</strong> {visit.clientName}</p>
                                   <p><strong>Localização:</strong> {visit.location}</p>
                                   {visit.latitude && visit.longitude && <p className="text-xs">({visit.latitude.toFixed(4)}, {visit.longitude.toFixed(4)})</p>}
                                   <p><strong>KM Inicial:</strong> {formatKm(visit.initialKm)} Km</p>
                                   <p><strong>Motivo:</strong> {visit.reason}</p>
                                   <p className="text-xs text-muted-foreground">Registrado em: {new Date(visit.timestamp).toLocaleString('pt-BR')}</p>
                               </div>
                               <DialogFooter>
                                   <DialogClose asChild>
                                       <Button variant="outline">Fechar</Button>
                                   </DialogClose>
                               </DialogFooter>
                            </DialogContent>
                        </Dialog>
                       <Dialog open={isEditModalOpen && currentVisit?.id === visit.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); else openEditModal(visit); }}>
                         <DialogTrigger asChild>
                           <Button variant="ghost" size="icon" onClick={() => openEditModal(visit)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving}>
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Editar</span>
                           </Button>
                         </DialogTrigger>
                         <DialogContent className="sm:max-w-lg">
                            <DialogHeader><DialogTitle>Editar Visita</DialogTitle></DialogHeader>
                            <form onSubmit={handleEditVisit} className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="editClientName">Nome do Cliente*</Label>
                                    <Input id="editClientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required disabled={isSaving}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editLocation">Localização*</Label>
                                     <div className="flex items-center gap-2">
                                         <Input id="editLocation" value={location} onChange={(e) => setLocation(e.target.value)} required className="flex-grow" disabled={isSaving}/>
                                         <Button type="button" variant="outline" size="icon" onClick={handleGetLocation} disabled={isFetchingLocation || isSaving} title="Usar GPS">
                                            {isFetchingLocation ? <LoadingSpinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
                                          </Button>
                                     </div>
                                      {latitude && longitude && (
                                         <p className="text-xs text-muted-foreground">Lat: {latitude.toFixed(4)}, Lon: {longitude.toFixed(4)}</p>
                                      )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editInitialKm">Km Inicial*</Label>
                                    <Input id="editInitialKm" type="number" value={initialKm} onChange={(e) => setInitialKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required min="0" disabled={isSaving}/>
                                     <p className="text-xs text-muted-foreground">Confira este valor com atenção.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editReason">Motivo*</Label>
                                    <Textarea id="editReason" value={reason} onChange={(e) => setReason(e.target.value)} required disabled={isSaving}/>
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button></DialogClose>
                                    <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                                    </Button>
                                </DialogFooter>
                            </form>
                         </DialogContent>
                       </Dialog>
                       <AlertDialogTrigger asChild>
                         <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteConfirmation(visit)} disabled={isSaving}>
                           <Trash2 className="h-4 w-4" />
                           <span className="sr-only">Excluir</span>
                         </Button>
                       </AlertDialogTrigger>
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
                    <span>Km Inicial: {formatKm(visit.initialKm)} Km</span>
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
