
// src/components/Trips/Visits.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Eye, Edit, Trash2, MapPin, Milestone, Info, LocateFixed, AlertTriangle, Loader2, TrendingUp, Briefcase, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogTrigger, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getCurrentLocation, getCurrentCity, Coordinate } from '@/services/geolocation';
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { addLocalVisit, updateLocalVisit, deleteLocalVisit, getLocalVisits, LocalVisit, getLocalCustomTypes, STORE_VISIT_TYPES, CustomType, getLocalDbStore, updateLocalRecord } from '@/services/localDbService'; // Added getLocalDbStore
import { cn } from '@/lib/utils';
import { formatKm } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getVisitTypesFromFirestore } from '@/services/firestoreService';
import { useSync } from '@/contexts/SyncContext'; // Import useSync

export interface Visit extends Omit<LocalVisit, 'localId' | 'tripLocalId'> {
  id: string; // Can be firebaseId or localId
  tripId: string; // Should be the localId of the parent trip for consistency in UI
  userId: string;
  syncStatus?: 'pending' | 'synced' | 'error';
  visitType?: string;
}

interface VisitsProps {
  tripId: string; // This is the localId of the parent trip
  ownerUserId: string; // This is the userId of the trip's owner
}


export const Visits: React.FC<VisitsProps> = ({ tripId: tripLocalId, ownerUserId }) => {
  const { updatePendingCount } = useSync();
  console.log(`[VisitsComponent props ${new Date().toISOString()}] Received tripLocalId: ${tripLocalId}, ownerUserId: ${ownerUserId}`);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
  const [visitToConfirm, setVisitToConfirm] = useState<Omit<LocalVisit, 'localId' | 'syncStatus' | 'id' | 'deleted'> | null>(null); // id and deleted are not part of form
  const [visitToDelete, setVisitToDelete] = useState<Visit | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const { toast } = useToast();

  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [initialKm, setInitialKm] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [visitType, setVisitType] = useState('');

  const [availableVisitTypes, setAvailableVisitTypes] = useState<string[]>([]);
  const [loadingVisitTypes, setLoadingVisitTypes] = useState(true);

  const fetchVisitsData = useCallback(async () => {
    if (!tripLocalId) {
        console.log("[VisitsComponent fetchVisitsData] No tripLocalId, skipping fetch.");
        setVisits([]);
        setLoading(false);
        return;
    }
    setLoading(true);
    console.log(`[VisitsComponent fetchVisitsData ${new Date().toISOString()}] Fetching for trip: ${tripLocalId}`);
    try {
        const localVisitsData = await getLocalVisits(tripLocalId);
        const uiVisits = localVisitsData.map(lv => ({
            ...lv,
            id: lv.firebaseId || lv.localId, // For React keys and UI identification
            tripId: lv.tripLocalId, // This is the parent trip's localId
            userId: lv.userId || ownerUserId, // Ensure userId is present
            syncStatus: lv.syncStatus,
            visitType: lv.visitType,
        })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setVisits(uiVisits);
        console.log(`[VisitsComponent fetchVisitsData ${new Date().toISOString()}] Fetched and set ${uiVisits.length} visits for trip ${tripLocalId}.`);
    } catch (error) {
        console.error(`[VisitsComponent fetchVisitsData ${new Date().toISOString()}] Error fetching local visits for trip ${tripLocalId}:`, error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar as visitas locais." });
    } finally {
        setLoading(false);
    }
  }, [tripLocalId, ownerUserId, toast]);


   useEffect(() => {
    fetchVisitsData();

    const loadAndCacheVisitTypes = async () => {
        console.log(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Starting for trip ${tripLocalId}...`);
        setLoadingVisitTypes(true);
        try {
            let typesToUse: CustomType[] = [];
            if (navigator.onLine) {
                console.log(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Online: Fetching visit types from Firestore...`);
                const firestoreTypesRaw = await getVisitTypesFromFirestore(); // Returns { id, name }[]
                console.log(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Fetched ${firestoreTypesRaw.length} types from Firestore.`);

                 typesToUse = firestoreTypesRaw.map(ft => ({
                    localId: ft.id, // Use Firestore ID as localId for these global types
                    id: ft.id,
                    name: ft.name,
                    firebaseId: ft.id,
                    syncStatus: 'synced',
                    deleted: false,
                }));

                if (typesToUse.length > 0) {
                    console.log(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Caching/updating Firestore types locally...`);
                    const cachePromises = typesToUse.map(type =>
                        updateLocalRecord(STORE_VISIT_TYPES, type)
                            .catch(e => console.warn(`[VisitsComponent] Failed to cache visit type "${type.name}" (ID: ${type.localId}) locally:`, e))
                    );
                    await Promise.all(cachePromises);
                    console.log(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Cached/updated ${typesToUse.length} visit types from Firestore locally.`);
                }
            }
            // Always load from local DB after attempting online fetch & cache
            // This ensures UI uses local data, which might now include newly synced types
            const localTypes = await getLocalCustomTypes(STORE_VISIT_TYPES);
            console.log(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Loaded ${localTypes.length} types from LocalDB to populate dropdown.`);
            setAvailableVisitTypes(['Outro', ...localTypes.filter(t=>!t.deleted).map(t => t.name).sort()]);

        } catch (err) {
            console.error(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Failed to load visit types:`, err);
            try {
                console.log(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Attempting fallback to local types after error.`);
                const localTypesFallback = await getLocalCustomTypes(STORE_VISIT_TYPES);
                setAvailableVisitTypes(['Outro', ...localTypesFallback.filter(t=>!t.deleted).map(t => t.name).sort()]);
            } catch (localErr) {
                setAvailableVisitTypes(['Outro']); // Absolute fallback
                toast({ variant: 'destructive', title: 'Erro ao carregar tipos de visita', description: (err as Error).message });
            }
        } finally {
            setLoadingVisitTypes(false);
            console.log(`[VisitsComponent loadAndCacheVisitTypes ${new Date().toISOString()}] Finished for trip ${tripLocalId}.`);
        }
    };
    loadAndCacheVisitTypes();

  }, [fetchVisitsData, toast, tripLocalId]); // Added tripLocalId as it influences logging


  const getLastVisitKm = (): number | null => {
      if (visits.length === 0) return null;
      // Visits are already sorted by timestamp descending in fetchVisitsData
      // So the first element is the latest *chronologically added to the trip*,
      // but not necessarily the one with the highest KM if visits can be out of order.
      // We need to sort by actual timestamp to find the *true* last visit by time.
      const sortedChronologically = [...visits].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return sortedChronologically.length > 0 ? sortedChronologically[sortedChronologically.length - 1].initialKm : null;
  };

  const handleGetLocation = async () => {
    setIsFetchingLocation(true);
    try {
      const coords: Coordinate = await getCurrentLocation();
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      const city = await getCurrentCity();
      setLocation(city);
      toast({ title: "Localização capturada!", description: `Cidade: ${city}. Coordenadas salvas.` });
    } catch (error) {
      console.error("Error getting location:", error);
      toast({ variant: "destructive", title: "Erro ao buscar localização", description: (error as Error).message || "Tente novamente ou digite manually." });
      setLocation('');
      setLatitude(undefined);
      setLongitude(undefined);
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const handlePrepareVisitForConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(`[VisitsComponent handlePrepareVisitForConfirmation ${new Date().toISOString()}] Data:`, { clientName, location, initialKm, reason, visitType, ownerUserId });

    if (!clientName || !location || initialKm === '' || !reason || !visitType) {
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
            description: `A quilometragem inicial (${formatKm(kmValue)}) não pode ser menor que a da última visita registrada (${formatKm(lastKm)}).`,
            duration: 7000,
        });
        return;
    }

    const newVisitData: Omit<LocalVisit, 'localId' | 'syncStatus'| 'id' | 'deleted'> = {
      tripLocalId: tripLocalId,
      userId: ownerUserId, // Use the ownerUserId passed from TripAccordionItem
      clientName,
      location,
      latitude,
      longitude,
      initialKm: kmValue,
      reason,
      timestamp: new Date().toISOString(), // Timestamp of creation/update
      visitType,
    };

    setVisitToConfirm(newVisitData);
    setIsCreateModalOpen(false);
    setIsConfirmModalOpen(true);
  };

  const confirmAndSaveVisit = async () => {
      if (!visitToConfirm) return;
      console.log(`[VisitsComponent confirmAndSaveVisit ${new Date().toISOString()}] Attempting to save new visit locally. ownerUserId: ${ownerUserId}, tripLocalId: ${tripLocalId}`, visitToConfirm);
      setIsSaving(true);
      try {
          // Ensure ownerUserId is part of the object being saved if it's not already
          const visitDataToSave = { ...visitToConfirm, userId: ownerUserId, tripLocalId: tripLocalId };
          await addLocalVisit(visitDataToSave);
          await fetchVisitsData(); // Re-fetch to update list
          if (updatePendingCount) updatePendingCount(); // Update sync count
          resetForm();
          setIsConfirmModalOpen(false);
          setVisitToConfirm(null);
          toast({ title: "Visita criada localmente!" });
      } catch (error) {
            console.error(`[VisitsComponent confirmAndSaveVisit ${new Date().toISOString()}] Error adding local visit:`, error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível salvar a visita localmente." });
      } finally {
            setIsSaving(false);
      }
    };

   const handleEditVisit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentVisit) return;
       const kmValue = Number(initialKm);

       if (!clientName || !location || initialKm === '' || !reason || !visitType) {
           toast({ variant: "destructive", title: "Erro", description: "Todos os campos marcados com * são obrigatórios." });
           return;
       }
       if (kmValue <= 0) {
            toast({ variant: "destructive", title: "Erro", description: "Quilometragem inicial deve ser maior que zero." });
            return;
       }

       // For KM validation during edit, we need to compare against other visits excluding the current one
       const otherVisits = visits.filter(v => v.id !== currentVisit.id);
       let lastKmBeforeThis = null;
       if (otherVisits.length > 0) {
            const sortedOtherVisits = [...otherVisits]
                .filter(v => new Date(v.timestamp).getTime() < new Date(currentVisit.timestamp).getTime()) // Consider only visits before this one
                .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            if(sortedOtherVisits.length > 0) {
                lastKmBeforeThis = sortedOtherVisits[sortedOtherVisits.length - 1].initialKm;
            }
       }
       if (lastKmBeforeThis !== null && kmValue < lastKmBeforeThis) {
           toast({
               variant: "destructive",
               title: "Erro de Quilometragem",
               description: `A KM (${formatKm(kmValue)}) não pode ser menor que a da visita anterior cronologicamente (${formatKm(lastKmBeforeThis)}).`,
               duration: 7000,
           });
           return;
       }


       const localVisitsInDb = await getLocalVisits(tripLocalId); // Fetch all for this trip
       const originalLocalVisit = localVisitsInDb.find(v => v.localId === currentVisit.localId); // Find by localId

        if (!originalLocalVisit) {
             toast({ variant: "destructive", title: "Erro", description: "Visita original não encontrada localmente para edição." });
             return;
         }

      const updatedLocalVisitData: LocalVisit = {
            ...originalLocalVisit, // Spread original local data
            userId: ownerUserId, // Ensure ownerUserId is set
            clientName,
            location,
            latitude,
            longitude,
            initialKm: kmValue,
            reason,
            visitType,
            timestamp: new Date().toISOString(), // Update timestamp on edit
            syncStatus: originalLocalVisit.syncStatus === 'synced' && !originalLocalVisit.deleted ? 'pending' : originalLocalVisit.syncStatus,
      };
      console.log(`[VisitsComponent handleEditVisit ${new Date().toISOString()}] Attempting to update visit. LocalID: ${originalLocalVisit.localId}`, updatedLocalVisitData);

      setIsSaving(true);
      try {
          await updateLocalVisit(updatedLocalVisitData);
          await fetchVisitsData(); // Re-fetch to update list
          if (updatePendingCount) updatePendingCount();
          resetForm();
          setIsEditModalOpen(false);
          setCurrentVisit(null);
          toast({ title: "Visita atualizada localmente!" });
      } catch (error) {
            console.error(`[VisitsComponent handleEditVisit ${new Date().toISOString()}] Error updating local visit:`, error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar a visita localmente." });
      } finally {
            setIsSaving(false);
      }
    };

    const openDeleteConfirmation = (visit: Visit) => {
        console.log(`[VisitsComponent openDeleteConfirmation ${new Date().toISOString()}] Preparing to delete visit:`, visit);
        setVisitToDelete(visit);
        setIsDeleteModalOpen(true);
    };

    const closeDeleteModal = () => { // Renamed for clarity
        console.log(`[VisitsComponent closeDeleteModal ${new Date().toISOString()}] Closing delete confirmation.`);
        setVisitToDelete(null);
        setIsDeleteModalOpen(false);
    };

  const confirmDeleteVisit = async () => {
    if (!visitToDelete) return;
    console.log(`[VisitsComponent confirmDeleteVisit ${new Date().toISOString()}] Confirming delete for visit. LocalID: ${visitToDelete.localId}, ID (UI): ${visitToDelete.id}`);
    setIsSaving(true);
    try {
        // visitToDelete.localId should be the correct key for local DB operations
        await deleteLocalVisit(visitToDelete.localId);
        await fetchVisitsData(); // Re-fetch to update list
        if (updatePendingCount) updatePendingCount();
        toast({ title: "Visita marcada para exclusão." });
        closeDeleteModal();
    } catch (error) {
        console.error(`[VisitsComponent confirmDeleteVisit ${new Date().toISOString()}] Error marking local visit for deletion:`, error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível marcar a visita para exclusão." });
    } finally {
        setIsSaving(false);
    }
  };

  const openEditModal = (visit: Visit) => {
    console.log(`[VisitsComponent openEditModal ${new Date().toISOString()}] Opening edit modal for visit:`, visit);
    setCurrentVisit(visit);
    setClientName(visit.clientName);
    setLocation(visit.location);
    setLatitude(visit.latitude);
    setLongitude(visit.longitude);
    setInitialKm(visit.initialKm);
    setReason(visit.reason);
    setVisitType(visit.visitType || '');
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setClientName('');
    setLocation('');
    setLatitude(undefined);
    setLongitude(undefined);
    setInitialKm('');
    setReason('');
    setVisitType('');
  };

   const closeCreateModal = () => {
     console.log(`[VisitsComponent closeCreateModal ${new Date().toISOString()}] Closing create modal.`);
     resetForm();
     setIsCreateModalOpen(false);
   }

   const closeEditModal = () => {
      console.log(`[VisitsComponent closeEditModal ${new Date().toISOString()}] Closing edit modal.`);
      resetForm();
      setIsEditModalOpen(false);
      setCurrentVisit(null);
    }
   const closeConfirmModal = () => {
        console.log(`[VisitsComponent closeConfirmModal ${new Date().toISOString()}] Closing confirm modal, re-opening create modal.`);
        setIsConfirmModalOpen(false);
        setVisitToConfirm(null); // Clear the confirmed visit data
        setIsCreateModalOpen(true); // Re-open the create/edit modal
    }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Histórico de Visitas</h3>
        {tripLocalId && (
            <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
                <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); console.log(`[VisitsComponent onClick ${new Date().toISOString()}] Registrar Visita button clicked.`); setIsCreateModalOpen(true);}} className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Registrar Visita
                </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Registrar Nova Visita</DialogTitle>
                </DialogHeader>
                <form onSubmit={handlePrepareVisitForConfirmation} className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="clientName">Nome do Cliente*</Label>
                        <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="Nome ou Empresa" disabled={isSaving}/>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="visitType">Tipo de Visita*</Label>
                        <Select onValueChange={setVisitType} value={visitType} required disabled={isSaving || loadingVisitTypes}>
                            <SelectTrigger id="visitType">
                                <SelectValue placeholder={loadingVisitTypes ? "Carregando..." : "Selecione o tipo"} />
                            </SelectTrigger>
                            <SelectContent>
                                {loadingVisitTypes ? <SelectItem value="loading" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin inline-block"/> Carregando...</SelectItem> :
                                 availableVisitTypes.map((type) => (
                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="location">Localização (Cidade)*</Label>
                        <div className="flex items-center gap-2">
                            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Nome da cidade ou use GPS" className="flex-grow" disabled={isSaving || isFetchingLocation}/>
                            <Button type="button" variant="outline" size="icon" onClick={handleGetLocation} disabled={isFetchingLocation || isSaving} title="Usar GPS para buscar cidade">
                                {isFetchingLocation ? <LoadingSpinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
                            </Button>
                        </div>
                        {latitude && longitude && (
                            <p className="text-xs text-muted-foreground">Coordenadas: Lat: {latitude.toFixed(4)}, Lon: {longitude.toFixed(4)} (salvas internamente)</p>
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
                            {(isSaving || isFetchingLocation) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar Dados
                        </Button>
                    </DialogFooter>
                </form>
                </DialogContent>
            </Dialog>
        )}
      </div>

        <AlertDialog open={isConfirmModalOpen} onOpenChange={(isOpen) => { if(!isOpen) closeConfirmModal(); else setIsConfirmModalOpen(true); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" /> Confirmar Dados da Visita
                    </AlertDialogTitle>
                </AlertDialogHeader>
                 <div className="py-2 space-y-2">
                     <p className="text-sm text-muted-foreground">Por favor, revise os dados abaixo, especialmente a <strong>Quilometragem Inicial</strong>. Esta ação não pode ser facilmente desfeita.</p>
                     <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-foreground">
                        <li><strong>Cliente:</strong> {visitToConfirm?.clientName}</li>
                        <li><strong>Tipo de Visita:</strong> {visitToConfirm?.visitType}</li>
                        <li><strong>Localização (Cidade):</strong> {visitToConfirm?.location}</li>
                        <li><strong>KM Inicial:</strong> {visitToConfirm ? formatKm(visitToConfirm.initialKm) : 'N/A'}</li>
                        <li><strong>Motivo:</strong> {visitToConfirm?.reason}</li>
                    </ul>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeConfirmModal} disabled={isSaving}>Voltar e Editar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmAndSaveVisit} className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Salvando...' : 'Salvar Visita Local'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {loading ? (
           <div className="flex justify-center items-center h-20">
               <LoadingSpinner />
           </div>
       ) : visits.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhuma visita registrada {tripLocalId ? 'localmente para esta viagem' : ''}.</p>
             {tripLocalId && (
                <Button variant="link" onClick={() => {resetForm(); setIsCreateModalOpen(true);}} className="mt-2 text-primary">
                    Registrar a primeira visita
                </Button>
             )}
           </CardContent>
         </Card>
       ) : (
        <div className="grid gap-4">
          {visits.map((visit) => {
            let distanceTraveled = null;
            const sortedVisitsByTime = [...visits].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            const currentVisitIndexInSorted = sortedVisitsByTime.findIndex(v => v.id === visit.id);

            if (currentVisitIndexInSorted > 0) {
                const previousChronologicalVisit = sortedVisitsByTime[currentVisitIndexInSorted-1];
                if (visit.initialKm != null && previousChronologicalVisit.initialKm != null) {
                    const diff = visit.initialKm - previousChronologicalVisit.initialKm;
                    if (diff >= 0) { // Distance should not be negative
                         distanceTraveled = diff;
                    } else {
                        console.warn(`[VisitsComponent] Negative distance calculated between visit ${previousChronologicalVisit.id} (KM: ${previousChronologicalVisit.initialKm}) and ${visit.id} (KM: ${visit.initialKm})`);
                    }
                }
            }

            return (
                <Card key={visit.id} className={cn("shadow-sm transition-shadow hover:shadow-md bg-card border border-border", visit.syncStatus === 'pending' && 'border-yellow-500', visit.syncStatus === 'error' && 'border-destructive')}>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                        <CardTitle>{visit.clientName}</CardTitle>
                        <CardDescription>
                            {visit.visitType && <span className="font-semibold">{visit.visitType}</span>}
                            {visit.visitType && ' - '}
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
                                    <p><strong>Tipo de Visita:</strong> {visit.visitType || 'N/A'}</p>
                                    <p><strong>Localização (Cidade):</strong> {visit.location}</p>
                                    {visit.latitude && visit.longitude && <p className="text-xs text-muted-foreground">Coordenadas: ({visit.latitude.toFixed(4)}, {visit.longitude.toFixed(4)})</p>}
                                    <p><strong>KM Inicial:</strong> {formatKm(visit.initialKm)}</p>
                                    {distanceTraveled !== null && (
                                        <p><strong>Distância desde última visita:</strong> {formatKm(distanceTraveled)}</p>
                                    )}
                                    <p><strong>Motivo:</strong> {visit.reason}</p>
                                    <p className="text-xs text-muted-foreground">Registrado em: {new Date(visit.timestamp).toLocaleString('pt-BR')}</p>
                                    <p className="text-xs text-muted-foreground">Status Sinc: {visit.syncStatus || 'N/A'}</p>
                                    <p className="text-xs text-muted-foreground">ID Local: {visit.localId}</p>
                                    <p className="text-xs text-muted-foreground">ID Firebase: {visit.firebaseId || 'N/A'}</p>
                                    <p className="text-xs text-muted-foreground">Trip Local ID: {visit.tripLocalId}</p>
                                    <p className="text-xs text-muted-foreground">User ID (Owner): {visit.userId}</p>
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
                                        <Label htmlFor="editVisitType">Tipo de Visita*</Label>
                                        <Select onValueChange={setVisitType} value={visitType} required disabled={isSaving || loadingVisitTypes}>
                                            <SelectTrigger id="editVisitType">
                                                <SelectValue placeholder={loadingVisitTypes ? "Carregando..." : "Selecione o tipo"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                 {loadingVisitTypes ? <SelectItem value="loading" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin inline-block"/> Carregando...</SelectItem> :
                                                 availableVisitTypes.map((type) => (
                                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="editLocation">Localização (Cidade)*</Label>
                                        <div className="flex items-center gap-2">
                                            <Input id="editLocation" value={location} onChange={(e) => setLocation(e.target.value)} required className="flex-grow" disabled={isSaving || isFetchingLocation}/>
                                            <Button type="button" variant="outline" size="icon" onClick={handleGetLocation} disabled={isFetchingLocation || isSaving} title="Usar GPS para buscar cidade">
                                                {isFetchingLocation ? <LoadingSpinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                        {latitude && longitude && (
                                            <p className="text-xs text-muted-foreground">Coordenadas: Lat: {latitude.toFixed(4)}, Lon: {longitude.toFixed(4)} (salvas internamente)</p>
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
                                        <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving || isFetchingLocation}>
                                            {(isSaving || isFetchingLocation) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Salvar Alterações Locais
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                        <AlertDialog open={isDeleteModalOpen && visitToDelete?.id === visit.id} onOpenChange={(isOpen) => { if (!isOpen) closeDeleteModal(); else if(visitToDelete) setIsDeleteModalOpen(true); /* only open if visitToDelete is set */ }}>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteConfirmation(visit)} disabled={isSaving}>
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Excluir</span>
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Tem certeza que deseja marcar esta visita a {visitToDelete?.clientName || visit.clientName} para exclusão?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel onClick={closeDeleteModal} disabled={isSaving}>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={confirmDeleteVisit} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSaving}>
                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Marcar para Excluir
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Briefcase className="h-4 w-4 flex-shrink-0" />
                        <span>Tipo: {visit.visitType || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 flex-shrink-0" />
                        <span>{visit.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Milestone className="h-4 w-4 flex-shrink-0" />
                        <span>Km Inicial: {formatKm(visit.initialKm)}</span>
                    </div>
                    {distanceTraveled !== null && (
                         <div className="flex items-center gap-2 text-muted-foreground">
                             <TrendingUp className="h-4 w-4 flex-shrink-0 text-blue-500" />
                             <span>Distância da visita anterior: {formatKm(distanceTraveled)}</span>
                         </div>
                    )}
                    <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span>{visit.reason}</span>
                    </div>
                </CardContent>
                </Card>
            );
          })}
        </div>
       )}
    </div>
  );
};
export default Visits;
