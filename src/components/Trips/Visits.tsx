// src/components/Trips/Visits.tsx
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
import { addLocalVisit, updateLocalVisit, deleteLocalVisit, getLocalVisits, LocalVisit } from '@/services/localDbService'; // Import local DB functions
import { cn } from '@/lib/utils'; // Import cn function

// Interface still used for UI and props, but data comes from LocalVisit
export interface Visit extends Omit<LocalVisit, 'localId' | 'tripLocalId'> {
  id: string; // Represents localId or firebaseId
  tripId: string; // Represents tripLocalId or firebase tripId
  syncStatus?: 'pending' | 'synced' | 'error'; // Add syncStatus for UI indication
}

interface VisitsProps {
  tripId: string; // Now represents tripLocalId
  tripName?: string;
}

export const Visits: React.FC<VisitsProps> = ({ tripId: tripLocalId, tripName }) => {
  const [visits, setVisits] = useState<Visit[]>([]); // UI state uses Visit interface
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null); // Use Visit for UI state
  const [visitToConfirm, setVisitToConfirm] = useState<Omit<LocalVisit, 'localId' | 'syncStatus'> | null>(null); // Use LocalVisit base for confirmation
  const [visitToDelete, setVisitToDelete] = useState<Visit | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const { toast } = useToast();

  // --- Form State ---
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [initialKm, setInitialKm] = useState<number | ''>('');
  const [reason, setReason] = useState('');

   // Fetch visits for the specific tripLocalId
   useEffect(() => {
    const fetchVisitsData = async () => {
      if (!tripLocalId) return;
      setLoading(true);
      try {
        const localVisits = await getLocalVisits(tripLocalId);
        // Map LocalVisit to Visit for UI
        const uiVisits = localVisits.map(lv => ({
            ...lv,
            id: lv.firebaseId || lv.localId, // Use firebaseId if available
            tripId: lv.tripLocalId, // Keep tripId pointing to the local trip relation
            syncStatus: lv.syncStatus // Include syncStatus in UI object
        }));
        setVisits(uiVisits);
      } catch (error) {
        console.error(`Error fetching local visits for trip ${tripLocalId}:`, error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar as visitas locais." });
      } finally {
        setLoading(false);
      }
    };
    fetchVisitsData();
  }, [tripLocalId, toast]);

  // --- Helpers ---
  const formatKm = (km: number) => km.toLocaleString('pt-BR');

  const getLastVisitKm = (): number | null => {
      // Use the UI visits state which is already sorted
      return visits.length > 0 ? visits[0].initialKm : null;
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
      setLocation('');
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

    // Prepare data for confirmation (using LocalVisit structure)
    const newVisitData: Omit<LocalVisit, 'localId' | 'syncStatus'> = {
      tripLocalId: tripLocalId, // Use tripLocalId
      clientName,
      location,
      latitude,
      longitude,
      initialKm: kmValue,
      reason,
      timestamp: new Date().toISOString(), // Set timestamp now
    };

    setVisitToConfirm(newVisitData);
    setIsCreateModalOpen(false);
    setIsConfirmModalOpen(true);
  };

  const confirmAndSaveVisit = async () => {
      if (!visitToConfirm) return;

      setIsSaving(true);

      try {
          const localId = await addLocalVisit(visitToConfirm); // Add to local DB
          console.log(`[Visits] Visit added locally with localId: ${localId}`);

          // Update UI state optimistically
          const newUIVisit: Visit = {
             ...visitToConfirm,
             localId: localId, // Add localId to the UI object
             id: localId, // Use localId as the primary ID until synced
             tripId: tripLocalId,
             syncStatus: 'pending'
          };

          setVisits(prevVisits => [newUIVisit, ...prevVisits].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

          resetForm();
          setIsConfirmModalOpen(false);
          setVisitToConfirm(null);
          toast({ title: "Visita criada localmente!" });
      } catch (error) {
            console.error("Error adding local visit:", error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível salvar a visita localmente." });
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

      // Find the original LocalVisit data if needed (e.g., for firebaseId)
       const originalLocalVisit = await getLocalVisits(tripLocalId).then(visits => visits.find(v => v.localId === currentVisit.id || v.firebaseId === currentVisit.id));

        if (!originalLocalVisit) {
             toast({ variant: "destructive", title: "Erro", description: "Visita original não encontrada localmente." });
             return;
         }


      const updatedLocalVisitData: LocalVisit = {
            ...originalLocalVisit, // Start with original local data
            clientName,
            location,
            latitude,
            longitude,
            initialKm: kmValue,
            reason,
            syncStatus: originalLocalVisit.syncStatus === 'synced' ? 'pending' : originalLocalVisit.syncStatus, // Mark as pending if edited after sync
            // timestamp usually not updated
      };

      setIsSaving(true);
      try {
          await updateLocalVisit(updatedLocalVisitData); // Update local DB
          console.log(`[Visits] Visit updated locally: ${originalLocalVisit.localId}`);

          // Update UI state
           const updatedUIVisit: Visit = {
                ...updatedLocalVisitData,
                id: updatedLocalVisitData.firebaseId || updatedLocalVisitData.localId,
                tripId: tripLocalId,
                syncStatus: updatedLocalVisitData.syncStatus // Update sync status in UI
            };

          setVisits(prevVisits => prevVisits.map(v => v.id === currentVisit.id ? updatedUIVisit : v)
                                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          resetForm();
          setIsEditModalOpen(false);
          setCurrentVisit(null);
          toast({ title: "Visita atualizada localmente!" });
      } catch (error) {
            console.error("Error updating local visit:", error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar a visita localmente." });
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

     // ID in visitToDelete could be localId or firebaseId, use it to find the local record
     const localIdToDelete = visitToDelete.id; // Assuming id holds the localId or firebaseId which is also the primary key for UI


    setIsSaving(true);
    try {
        // Find the actual localId if visitToDelete.id is a firebaseId
        const visitsInDb = await getLocalVisits(tripLocalId);
        const visitRecordToDelete = visitsInDb.find(v => v.localId === localIdToDelete || v.firebaseId === localIdToDelete);

        if (!visitRecordToDelete) {
             throw new Error("Registro local da visita não encontrado para exclusão.");
        }

        await deleteLocalVisit(visitRecordToDelete.localId); // Mark for deletion locally using its localId
        console.log(`[Visits] Visit marked for deletion locally: ${visitRecordToDelete.localId}`);

        // Update UI state
        setVisits(visits.filter(v => v.id !== visitToDelete.id));

        toast({ title: "Visita marcada para exclusão na próxima sincronização." });
        closeDeleteConfirmation();
    } catch (error) {
        console.error("Error marking local visit for deletion:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível marcar a visita para exclusão." });
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
        // Reopen create modal with current form state
        setIsCreateModalOpen(true);
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
                 {isSaving ? 'Salvando...' : 'Salvar Visita Local'}
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
                        Tem certeza que deseja marcar esta visita para "{visitToDelete?.clientName}" para exclusão? A exclusão definitiva ocorrerá na próxima sincronização.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isSaving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteVisit} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Marcando...' : 'Marcar para Excluir'}
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
             <p className="text-muted-foreground">Nenhuma visita registrada {tripLocalId ? 'localmente para esta viagem' : ''}.</p>
             <Button variant="link" onClick={() => {resetForm(); setIsCreateModalOpen(true);}} className="mt-2 text-primary">
                 Registrar a primeira visita
             </Button>
           </CardContent>
         </Card>
       ) : (
        <div className="grid gap-4">
          {visits.map((visit) => (
            <Card key={visit.id} className={cn("shadow-sm transition-shadow hover:shadow-md bg-card border border-border", visit.syncStatus === 'pending' && 'border-yellow-500', visit.syncStatus === 'error' && 'border-destructive')}>
              <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                       <CardTitle>{visit.clientName}</CardTitle>
                       <CardDescription>
                         {new Date(visit.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                         {visit.syncStatus === 'pending' && <span className="ml-2 text-xs text-yellow-600">(Pendente)</span>}
                         {visit.syncStatus === 'error' && <span className="ml-2 text-xs text-destructive">(Erro Sinc)</span>}
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
                                   <p className="text-xs text-muted-foreground">Status Sinc: {visit.syncStatus || 'N/A'}</p>
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
                                        {isSaving ? 'Salvando...' : 'Salvar Alterações Locais'}
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
