// src/components/Visits.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Eye, Edit, Trash2, MapPin, Milestone, Info, LocateFixed } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getCurrentLocation, Coordinate } from '@/services/geolocation'; // Assuming service exists
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from '@/components/LoadingSpinner'; // Assuming LoadingSpinner exists

interface Visit {
  id: string;
  clientName: string;
  location: string; // Could be address string or lat/lon string
  latitude?: number;
  longitude?: number;
  initialKm: number;
  reason: string;
  timestamp: string; // Add timestamp for sorting/display
}

// Mock data
const initialVisits: Visit[] = [
  { id: 'v1', clientName: 'Cliente Alpha', location: 'Rua Exemplo, 123', latitude: -23.5505, longitude: -46.6333, initialKm: 15000, reason: 'Entrega de material', timestamp: new Date(2024, 6, 21, 10, 30).toISOString() },
  { id: 'v2', clientName: 'Empresa Beta', location: 'Avenida Principal, 456', latitude: -23.5610, longitude: -46.6400, initialKm: 15150, reason: 'Reunião de Vendas', timestamp: new Date(2024, 6, 21, 14, 0).toISOString() },
];

export const Visits: React.FC = () => {
  const [visits, setVisits] = useState<Visit[]>(initialVisits);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
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
      // Sort visits by timestamp descending when component mounts or visits change
      setVisits(currentVisits => [...currentVisits].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, []); // Runs once on mount

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
      toast({ variant: "destructive", title: "Erro ao buscar localização", description: "Tente novamente ou digite manualmente." });
      setLocation(''); // Clear location on error
      setLatitude(undefined);
      setLongitude(undefined);
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const handleCreateVisit = (e: React.FormEvent) => {
    e.preventDefault();
    const newVisit: Visit = {
      id: String(Date.now()),
      clientName,
      location,
      latitude,
      longitude,
      initialKm: Number(initialKm),
      reason,
      timestamp: new Date().toISOString(),
    };
    setVisits(prevVisits => [newVisit, ...prevVisits].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: "Visita criada com sucesso!" });
  };

   const handleEditVisit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentVisit) return;

      const updatedVisit: Visit = {
        ...currentVisit,
        clientName,
        location,
        latitude,
        longitude,
        initialKm: Number(initialKm),
        reason,
        // Keep original timestamp or update if needed? Let's keep original for now.
      };

      setVisits(prevVisits => prevVisits.map(v => v.id === currentVisit.id ? updatedVisit : v)
                                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      resetForm();
      setIsEditModalOpen(false);
      setCurrentVisit(null);
      toast({ title: "Visita atualizada com sucesso!" });
    };

  const handleDeleteVisit = (visitId: string) => {
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

   // Helper to format KM
   const formatKm = (km: number) => km.toLocaleString('pt-BR');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Registro de Visitas</h2>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
           <DialogTrigger asChild>
             <Button onClick={() => setIsCreateModalOpen(true)} className="bg-accent hover:bg-accent/90">
               <PlusCircle className="mr-2 h-4 w-4" /> Registrar Nova Visita
             </Button>
           </DialogTrigger>
           <DialogContent className="sm:max-w-lg">
             <DialogHeader>
               <DialogTitle>Registrar Nova Visita</DialogTitle>
             </DialogHeader>
             <form onSubmit={handleCreateVisit} className="grid gap-4 py-4">
                 <div className="space-y-2">
                    <Label htmlFor="clientName">Nome do Cliente</Label>
                    <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="Nome ou Empresa" />
                 </div>

                 <div className="space-y-2">
                    <Label htmlFor="location">Localização</Label>
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
                    <Label htmlFor="initialKm">Quilometragem Inicial (Km)</Label>
                    <Input id="initialKm" type="number" value={initialKm} onChange={(e) => setInitialKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Km no início da visita" min="0" />
                 </div>

                 <div className="space-y-2">
                    <Label htmlFor="reason">Motivo da Visita</Label>
                    <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Ex: Entrega, Coleta, Reunião..." />
                 </div>

                 <DialogFooter>
                   <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button></DialogClose>
                   <Button type="submit" disabled={isFetchingLocation} className="bg-primary hover:bg-primary/90">Salvar Visita</Button>
                 </DialogFooter>
             </form>
           </DialogContent>
         </Dialog>
      </div>

      {visits.length === 0 ? (
         <Card className="text-center py-10">
           <CardContent>
             <p className="text-muted-foreground">Nenhuma visita registrada ainda.</p>
              <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
                Registrar sua primeira visita
             </Button>
           </CardContent>
         </Card>
       ) : (
        <div className="grid gap-4">
          {visits.map((visit) => (
            <Card key={visit.id} className="shadow-sm transition-shadow hover:shadow-md">
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
                           <Button variant="ghost" size="icon" onClick={() => openEditModal(visit)} className="text-muted-foreground hover:text-accent h-8 w-8">
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Editar</span>
                           </Button>
                         </DialogTrigger>
                         <DialogContent className="sm:max-w-lg">
                            <DialogHeader><DialogTitle>Editar Visita</DialogTitle></DialogHeader>
                            <form onSubmit={handleEditVisit} className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="editClientName">Nome do Cliente</Label>
                                    <Input id="editClientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editLocation">Localização</Label>
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
                                    <Label htmlFor="editInitialKm">Km Inicial</Label>
                                    <Input id="editInitialKm" type="number" value={initialKm} onChange={(e) => setInitialKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required min="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editReason">Motivo</Label>
                                    <Textarea id="editReason" value={reason} onChange={(e) => setReason(e.target.value)} required />
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline" onClick={closeEditModal}>Cancelar</Button></DialogClose>
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
              {/* <CardFooter>
                  Optional: Add actions related to the visit, e.g., "Mark as Completed"
              </CardFooter> */}
            </Card>
          ))}
        </div>
       )}
    </div>
  );
};
