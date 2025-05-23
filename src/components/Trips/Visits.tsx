// src/components/Trips/Visits.tsx
'use client';

import React, { useState, useEffect } from 'react';
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
import { addLocalVisit, updateLocalVisit, deleteLocalVisit, getLocalVisits, LocalVisit, getLocalCustomTypes, STORE_VISIT_TYPES, CustomType, getLocalDbStore } from '@/services/localDbService';
import { cn } from '@/lib/utils';
import { formatKm } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getVisitTypesFromFirestore } from '@/services/firestoreService'; // For fetching from Firestore


export interface Visit extends Omit<LocalVisit, 'localId' | 'tripLocalId'> {
  id: string;
  tripId: string;
  userId: string;
  syncStatus?: 'pending' | 'synced' | 'error';
  visitType?: string;
}

interface VisitsProps {
  tripId: string;
  ownerUserId: string;
}


export const Visits: React.FC<VisitsProps> = ({ tripId: tripLocalId, ownerUserId }) => {
  console.log("[VisitsComponent props] tripId:", tripLocalId, "ownerUserId:", ownerUserId);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
  const [visitToConfirm, setVisitToConfirm] = useState<Omit<LocalVisit, 'localId' | 'syncStatus'> | null>(null);
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

   useEffect(() => {
    const fetchVisitsData = async () => {
      if (!tripLocalId) return;
      setLoading(true);
      try {
        console.log(`[VisitsComponent useEffect] Fetching local visits for trip ${tripLocalId}, owner ${ownerUserId}`);
        const localVisits = await getLocalVisits(tripLocalId);
        console.log(`[VisitsComponent useEffect] Fetched ${localVisits.length} local visits.`);
        const uiVisits = localVisits.map(lv => ({
            ...lv,
            id: lv.firebaseId || lv.localId,
            tripId: lv.tripLocalId,
            userId: lv.userId || ownerUserId,
            syncStatus: lv.syncStatus,
            visitType: lv.visitType,
        })).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setVisits(uiVisits);
        console.log(`[VisitsComponent useEffect] Mapped ${uiVisits.length} visits to UI state.`);
      } catch (error) {
        console.error(`Error fetching local visits for trip ${tripLocalId}:`, error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar as visitas locais." });
      } finally {
        setLoading(false);
      }
    };
    fetchVisitsData();

    const loadAndCacheVisitTypes = async () => {
        console.log("[VisitsComponent loadAndCacheVisitTypes] Starting...");
        setLoadingVisitTypes(true);
        try {
            let typesToUse: CustomType[] = [];
            if (navigator.onLine) {
                console.log("[VisitsComponent] Online: Fetching visit types from Firestore...");
                const firestoreTypes = await getVisitTypesFromFirestore();
                console.log(`[VisitsComponent] Fetched ${firestoreTypes.length} types from Firestore.`);
                 typesToUse = firestoreTypes.map(ft => ({
                    localId: ft.id, 
                    id: ft.id,
                    name: ft.name,
                    firebaseId: ft.id,
                    syncStatus: 'synced',
                    deleted: false,
                }));

                console.log("[VisitsComponent] Caching/updating Firestore types locally...");
                const store = await getLocalDbStore(STORE_VISIT_TYPES, 'readwrite');
                const transaction = store.transaction;
                const typePromises = typesToUse.map(type => {
                    return new Promise<void>((resolve, reject) => {
                        const request = store.put(type); // Upsert
                        request.onsuccess = () => resolve();
                        request.onerror = () => {
                            console.warn(`[VisitsComponent] Failed to cache visit type "${type.name}" (ID: ${type.localId}) locally:`, request.error);
                            resolve();
                        };
                    });
                });
                await Promise.all(typePromises);
                await new Promise(resolve => transaction.oncomplete = resolve);
                console.log("[VisitsComponent] Cached/updated visit types from Firestore locally.");
            } else {
                console.log("[VisitsComponent] Offline: Fetching visit types from LocalDB.");
                typesToUse = await getLocalCustomTypes(STORE_VISIT_TYPES);
                console.log(`[VisitsComponent] Fetched ${typesToUse.length} types from LocalDB.`);
            }
            setAvailableVisitTypes(['Outro', ...typesToUse.map(t => t.name).sort()]);
        } catch (err) {
            console.error("[VisitsComponent] Failed to load visit types:", err);
            try {
                console.log("[VisitsComponent] Attempting fallback to local types after error.");
                const localTypes = await getLocalCustomTypes(STORE_VISIT_TYPES);
                setAvailableVisitTypes(['Outro', ...localTypes.map(t => t.name).sort()]);
            } catch (localErr) {
                setAvailableVisitTypes(['Outro']);
                toast({ variant: 'destructive', title: 'Erro ao carregar tipos de visita', description: (err as Error).message });
            }
        } finally {
            setLoadingVisitTypes(false);
            console.log("[VisitsComponent loadAndCacheVisitTypes] Finished.");
        }
    };
    loadAndCacheVisitTypes();

  }, [tripLocalId, ownerUserId, toast]);


  const getLastVisitKm = (): number | null => {
      if (visits.length === 0) return null;
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
    console.log("[VisitsComponent] handlePrepareVisitForConfirmation called with data:", { clientName, location, initialKm, reason, visitType, ownerUserId });

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

    const newVisitData: Omit<LocalVisit, 'localId' | 'syncStatus'| 'id' | 'deleted'> = { // Added id and deleted here as they are not part of creation form
      tripLocalId: tripLocalId,
      userId: ownerUserId,
      clientName,
      location,
      latitude,
      longitude,
      initialKm: kmValue,
      reason,
      timestamp: new Date().toISOString(),
      visitType,
    };

    setVisitToConfirm(newVisitData as Omit<LocalVisit, 'localId' | 'syncStatus'>); // Cast as per state type
    setIsCreateModalOpen(false);
    setIsConfirmModalOpen(true);
  };

  const confirmAndSaveVisit = async () => {
      if (!visitToConfirm) return;
      console.log("[VisitsComponent] Attempting to save new visit locally:", visitToConfirm);
      setIsSaving(true);
      try {
          const localId = await addLocalVisit({...visitToConfirm, userId: ownerUserId}); // Ensure ownerUserId is passed
          const newUIVisit: Visit = {
             ...(visitToConfirm as LocalVisit), // Cast to LocalVisit for spreading then type as Visit
             localId: localId,
             id: localId,
             tripId: tripLocalId,
             userId: ownerUserId,
             visitType: visitToConfirm.visitType,
             syncStatus: 'pending'
          };
          setVisits(prevVisits => [newUIVisit, ...prevVisits].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          resetForm();
          setIsConfirmModalOpen(false);
          setVisitToConfirm(null);
          toast({ title: "Visita criada localmente!" });
      } catch (error) {
            console.error("[VisitsComponent] Error adding local visit:", error);
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

       const originalLocalVisit = await getLocalVisits(tripLocalId).then(visits => visits.find(v => v.localId === currentVisit.id || v.firebaseId === currentVisit.id));
        if (!originalLocalVisit) {
             toast({ variant: "destructive", title: "Erro", description: "Visita original não encontrada localmente." });
             return;
         }

      const updatedLocalVisitData: LocalVisit = {
            ...originalLocalVisit,
            userId: ownerUserId,
            clientName,
            location,
            latitude,
            longitude,
            initialKm: kmValue,
            reason,
            visitType,
            syncStatus: originalLocalVisit.syncStatus === 'synced' && !originalLocalVisit.deleted ? 'pending' : originalLocalVisit.syncStatus,
            // deleted: originalLocalVisit.deleted || false, // Retain deleted status if it was already marked
      };

      setIsSaving(true);
      try {
          await updateLocalVisit(updatedLocalVisitData);
           const updatedUIVisit: Visit = {
                ...updatedLocalVisitData,
                id: updatedLocalVisitData.firebaseId || updatedLocalVisitData.localId,
                tripId: tripLocalId,
                userId: ownerUserId,
                visitType: updatedLocalVisitData.visitType,
                syncStatus: updatedLocalVisitData.syncStatus
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
     const localIdToDelete = visitToDelete.id;
    setIsSaving(true);
    try {
        const visitsInDb = await getLocalVisits(tripLocalId);
        const visitRecordToDelete = visitsInDb.find(v => v.localId === localIdToDelete || v.firebaseId === localIdToDelete);
        if (!visitRecordToDelete) {
             throw new Error("Registro local da visita não encontrado para exclusão.");
        }
        await deleteLocalVisit(visitRecordToDelete.localId);
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
        setIsCreateModalOpen(true);
    }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Histórico de Visitas</h3>
        {tripLocalId && (
            <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
                <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); console.log("[VisitsComponent] Registrar Visita button clicked, setting isCreateModalOpen to true."); setIsCreateModalOpen(true);}} className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
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
                    <AlertDialogDescription asChild>
                       <div>
                         <p>Por favor, revise os dados abaixo, especialmente a <strong>Quilometragem Inicial</strong>. Esta ação não pode ser facilmente desfeita.</p>
                         <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-foreground">
                            <li><strong>Cliente:</strong> {visitToConfirm?.clientName}</li>
                            <li><strong>Tipo de Visita:</strong> {visitToConfirm?.visitType}</li>
                            <li><strong>Localização (Cidade):</strong> {visitToConfirm?.location}</li>
                            <li><strong>KM Inicial:</strong> {visitToConfirm ? formatKm(visitToConfirm.initialKm) : 'N/A'}</li>
                            <li><strong>Motivo:</strong> {visitToConfirm?.reason}</li>
                        </ul>
                       </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => {
                        setIsConfirmModalOpen(false);
                        setIsCreateModalOpen(true);
                    }} disabled={isSaving}>Voltar e Editar</AlertDialogCancel>
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
          {visits.map((visit, index) => {
            let distanceTraveled = null;
            const sortedVisits = [...visits].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            const currentVisitIndexInSorted = sortedVisits.findIndex(v => v.id === visit.id);

            if (currentVisitIndexInSorted > 0) {
                const previousChronologicalVisit = sortedVisits[currentVisitIndexInSorted-1];
                if (visit.initialKm && previousChronologicalVisit.initialKm) {
                    distanceTraveled = visit.initialKm - previousChronologicalVisit.initialKm;
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
                                    {distanceTraveled !== null && distanceTraveled >=0 && (
                                        <p><strong>Distância desde última visita:</strong> {formatKm(distanceTraveled)}</p>
                                    )}
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
                        <AlertDialog open={isDeleteModalOpen && visitToDelete?.id === visit.id} onOpenChange={(isOpen) => { if(!isOpen) closeDeleteConfirmation(); else setIsDeleteModalOpen(true); }}>
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
                                    <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isSaving}>Cancelar</AlertDialogCancel>
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
                    {distanceTraveled !== null && distanceTraveled >=0 && (
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
