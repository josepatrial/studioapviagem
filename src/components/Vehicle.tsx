// src/components/Vehicle.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, CalendarDays, Gauge, Fuel, Milestone, Users, Loader2 } from 'lucide-react'; // Added Loader2
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
    addLocalVehicle, // Import the newly added function
    updateLocalVehicle, // Import the newly added function
    deleteLocalVehicle, // Import the newly added function
    getLocalVehicles,
    LocalVehicle, // Import LocalVehicle type
} from '@/services/localDbService'; // Adjust imports
import { getVehicles as fetchOnlineVehicles } from '@/services/firestoreService'; // Import getVehicles from firestoreService
import { LoadingSpinner } from './LoadingSpinner'; // Import LoadingSpinner
import { v4 as uuidv4 } from 'uuid'; // For generating local IDs

// UI Interface maps from LocalVehicle
export interface VehicleInfo extends Omit<LocalVehicle, 'syncStatus' | 'deleted' | 'localId'> {
  id: string; // Represents localId or firebaseId in the UI
  // UI doesn't need syncStatus or deleted directly, but keep them in LocalVehicle
}


export const Vehicle: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]); // UI State uses VehicleInfo
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState<VehicleInfo | null>(null); // Use VehicleInfo
  const [vehicleToDelete, setVehicleToDelete] = useState<VehicleInfo | null>(null);
  const { toast } = useToast();

  // --- Form State ---
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [licensePlate, setLicensePlate] = useState('');

  // Fetch vehicles on mount (from local first, then online if needed)
  useEffect(() => {
    const fetchVehiclesData = async () => {
      setLoading(true);
      try {
          let localVehicles = await getLocalVehicles();
          if (localVehicles.length === 0 && navigator.onLine) {
               console.log("[Vehicle] No local vehicles, fetching online...");
               try {
                   const onlineVehicles = await fetchOnlineVehicles();
                   // Save fetched vehicles locally
                    const savePromises = onlineVehicles.map(v => {
                        const localId = `local_vehicle_${uuidv4()}`; // Generate local ID for potentially new vehicles
                        const localVehicleData: LocalVehicle = {
                            ...v,
                            localId: localId, // Assign local ID
                            firebaseId: v.id, // Store original Firebase ID
                            id: v.id, // Use Firebase ID as the primary ID for VehicleInfo
                            syncStatus: 'synced',
                            deleted: false
                        };
                        // Use addLocalRecord or a similar function to upsert based on firebaseId
                        // This example assumes updateLocalRecord can handle adding if not found based on localId,
                        // or you'd need a more sophisticated upsert logic.
                        // For simplicity, let's try adding, catching potential errors if it exists.
                        return addLocalRecord(STORE_VEHICLES, localVehicleData).catch(async (err) => {
                            // If add fails (e.g., unique constraint on firebaseId if indexed), try update
                            console.warn(`Vehicle ${v.id} might exist locally, attempting update.`);
                            const existing = await getLocalVehicles().then(vs => vs.find(lv => lv.firebaseId === v.id));
                            if (existing) {
                                return updateLocalRecord(STORE_VEHICLES, { ...localVehicleData, localId: existing.localId });
                            } else {
                                // Rethrow if add failed and it wasn't found
                                throw err;
                            }
                        });
                    });
                   await Promise.all(savePromises);
                   localVehicles = await getLocalVehicles(); // Re-fetch after saving

               } catch (fetchError) => {
                   console.error("Error fetching/saving online vehicles:", fetchError);
                   toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível buscar ou salvar veículos online." });
               }
          }
          // Map LocalVehicle to VehicleInfo for UI, using firebaseId if available
          setVehicles(localVehicles.map(lv => ({
                id: lv.firebaseId || lv.localId, // Prefer firebaseId for UI stability
                model: lv.model,
                year: lv.year,
                licensePlate: lv.licensePlate
           } as VehicleInfo)));
      } catch (error) {
        console.error("Error fetching local vehicles:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar os veículos locais." });
      } finally {
        setLoading(false);
      }
    };
    fetchVehiclesData();
  }, [toast]);


  // --- Handlers ---
  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !year || !licensePlate) {
      toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
      return;
    }
     if (Number(year) < 1900 || Number(year) > new Date().getFullYear() + 1) {
        toast({ variant: "destructive", title: "Erro", description: "Ano do veículo inválido." });
        return;
      }

    const localId = `local_vehicle_${uuidv4()}`;

    // Prepare data for LocalVehicle
    const newVehicleData: Omit<LocalVehicle, 'syncStatus' | 'deleted' | 'firebaseId'> = {
      localId: localId,
      id: localId, // Use localId also as the base ID initially
      model,
      year: Number(year),
      licensePlate: licensePlate.toUpperCase(),
    };

    setIsSaving(true);
    try {
        await addLocalVehicle(newVehicleData);

        // Optimistically update UI state
        const createdVehicleUI: VehicleInfo = {
             id: localId, // Use localId for the UI initially
             model: newVehicleData.model,
             year: newVehicleData.year,
             licensePlate: newVehicleData.licensePlate,
         };
        setVehicles(prevVehicles => [createdVehicleUI, ...prevVehicles].sort((a,b)=> a.model.localeCompare(b.model)));

        resetForm();
        setIsCreateModalOpen(false);
        toast({ title: "Veículo adicionado localmente!" });
    } catch (error) {
        console.error("Error adding local vehicle:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível adicionar o veículo localmente." });
    } finally {
        setIsSaving(false);
    }
  };

   const handleEditVehicle = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentVehicle) return;
      if (!model || !year || !licensePlate) {
         toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
         return;
       }
        if (Number(year) < 1900 || Number(year) > new Date().getFullYear() + 1) {
           toast({ variant: "destructive", title: "Erro", description: "Ano do veículo inválido." });
           return;
         }

     // Find original local record using the UI ID (which could be firebaseId or localId)
      const originalLocalVehicle = await getLocalVehicles().then(vehicles => vehicles.find(v => v.localId === currentVehicle.id || v.firebaseId === currentVehicle.id));

       if (!originalLocalVehicle) {
           toast({ variant: "destructive", title: "Erro", description: "Veículo original não encontrado localmente." });
           return;
       }


     const updatedLocalData: LocalVehicle = {
       ...originalLocalVehicle, // Preserve syncStatus, firebaseId, localId etc.
       model,
       year: Number(year),
       licensePlate: licensePlate.toUpperCase(),
       syncStatus: originalLocalVehicle.syncStatus === 'synced' ? 'pending' : originalLocalVehicle.syncStatus,
       id: originalLocalVehicle.id, // Keep original ID from local record
     };

     setIsSaving(true);
     try {
         await updateLocalVehicle(updatedLocalData);

          // Update UI state
          const updatedVehicleUI: VehicleInfo = {
             id: currentVehicle.id, // Keep the ID used in the UI
             model: updatedLocalData.model,
             year: updatedLocalData.year,
             licensePlate: updatedLocalData.licensePlate
          };
          setVehicles(prevVehicles => prevVehicles.map(v => v.id === currentVehicle.id ? updatedVehicleUI : v).sort((a,b)=> a.model.localeCompare(b.model)));

         resetForm();
         setIsEditModalOpen(false);
         setCurrentVehicle(null);
         toast({ title: "Veículo atualizado localmente!" });
     } catch (error) {
          console.error("Error updating local vehicle:", error);
          toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar o veículo localmente." });
     } finally {
          setIsSaving(false);
     }
   };

   const confirmDeleteVehicle = async () => {
        if (!vehicleToDelete) return;

         // Find original local record using the UI ID
        const originalLocalVehicle = await getLocalVehicles().then(vehicles => vehicles.find(v => v.localId === vehicleToDelete.id || v.firebaseId === vehicleToDelete.id));

        if (!originalLocalVehicle) {
             toast({ variant: "destructive", title: "Erro", description: "Veículo original não encontrado localmente." });
             closeDeleteModal();
             return;
        }

        setIsSaving(true);
        try {
            // TODO: Prevent local deletion if vehicle is in use by local trips?

            await deleteLocalVehicle(originalLocalVehicle.localId); // Use localId to mark for deletion

             // Update UI state by filtering based on the ID used in the UI
            setVehicles(prevVehicles => prevVehicles.filter(v => v.id !== vehicleToDelete.id));


            toast({ title: "Veículo marcado para exclusão localmente." });
            closeDeleteModal();
        } catch (error) {
             console.error("Error marking local vehicle for deletion:", error);
             toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível marcar veículo para exclusão." });
        } finally {
            setIsSaving(false);
        }
   };

  const openEditModal = (vehicle: VehicleInfo) => {
    setCurrentVehicle(vehicle);
    setModel(vehicle.model);
    setYear(vehicle.year);
    setLicensePlate(vehicle.licensePlate);
    setIsEditModalOpen(true);
  };

   const openDeleteModal = (vehicle: VehicleInfo) => {
      setVehicleToDelete(vehicle);
      setIsDeleteModalOpen(true);
    };

    const closeDeleteModal = () => {
      setVehicleToDelete(null);
      setIsDeleteModalOpen(false);
    };


  const resetForm = () => {
    setModel('');
    setYear('');
    setLicensePlate('');
  };

   const closeCreateModal = () => {
     resetForm();
     setIsCreateModalOpen(false);
   }

   const closeEditModal = () => {
      resetForm();
      setIsEditModalOpen(false);
      setCurrentVehicle(null);
    }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Gerenciar Veículos</h2>
        <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
          <DialogTrigger asChild>
             <Button onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
              <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Veículo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Veículo</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddVehicle} className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="model">Modelo*</Label>
                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} required placeholder="Ex: Scania R450" disabled={isSaving} />
              </div>
              <div className="space-y-2">
                 <Label htmlFor="year">Ano*</Label>
                 <Input id="year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) > 0 ? Number(e.target.value) : '')} required placeholder="Ex: 2023" min="1900" max={new Date().getFullYear() + 1} disabled={isSaving}/>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="licensePlate">Placa*</Label>
                 <Input id="licensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} required placeholder="Ex: BRA2E19" disabled={isSaving}/>
               </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button>
                 </DialogClose>
                 <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSaving ? 'Salvando...' : 'Salvar Veículo Local'}
                 </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

       {loading ? (
          <div className="flex justify-center items-center h-40">
              <LoadingSpinner />
          </div>
       ) : vehicles.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhum veículo encontrado localmente.</p>
             {/* Option to fetch online if needed */}
             {/* <Button variant="link" onClick={fetchVehiclesData} className="mt-2 text-primary">Tentar buscar online</Button> */}
           </CardContent>
         </Card>
       ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="shadow-sm transition-shadow hover:shadow-md bg-card border border-border">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                   <CardTitle className="text-lg font-semibold text-primary">{vehicle.model}</CardTitle>
                   <CardDescription className="text-sm text-muted-foreground flex items-center gap-1">
                     <Gauge className="h-3 w-3" /> Placa: {vehicle.licensePlate}
                   </CardDescription>
                   <CardDescription className="text-sm text-muted-foreground flex items-center gap-1">
                       <CalendarDays className="h-3 w-3" /> Ano: {vehicle.year}
                   </CardDescription>
                    {/* Display sync status if relevant (fetch original local record if needed) */}
                   {/* {vehicle.syncStatus === 'pending' && <Badge variant="outline" className="mt-1 text-xs border-yellow-500 text-yellow-700">Pendente</Badge>}
                   {vehicle.syncStatus === 'error' && <Badge variant="destructive" className="mt-1 text-xs">Erro Sinc</Badge>} */}
                </div>
                 <div className="flex gap-1">
                     {/* Edit Button */}
                     <Dialog open={isEditModalOpen && currentVehicle?.id === vehicle.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); else openEditModal(vehicle); }}>
                       <DialogTrigger asChild>
                         <Button variant="ghost" size="icon" onClick={() => openEditModal(vehicle)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving}>
                           <Edit className="h-4 w-4" />
                           <span className="sr-only">Editar Veículo</span>
                         </Button>
                       </DialogTrigger>
                       <DialogContent className="sm:max-w-[425px]">
                         <DialogHeader>
                           <DialogTitle>Editar Veículo</DialogTitle>
                         </DialogHeader>
                         <form onSubmit={handleEditVehicle} className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="editModel">Modelo*</Label>
                                <Input id="editModel" value={model} onChange={(e) => setModel(e.target.value)} required disabled={isSaving} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editYear">Ano*</Label>
                                <Input id="editYear" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) > 0 ? Number(e.target.value) : '')} required min="1900" max={new Date().getFullYear() + 1} disabled={isSaving} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editLicensePlate">Placa*</Label>
                                <Input id="editLicensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} required disabled={isSaving} />
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

                     {/* Delete Button */}
                      <AlertDialog open={isDeleteModalOpen && vehicleToDelete?.id === vehicle.id} onOpenChange={(isOpen) => !isOpen && closeDeleteModal()}>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteModal(vehicle)} disabled={isSaving}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir Veículo</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja marcar o veículo {vehicle.model} ({vehicle.licensePlate}) para exclusão? A exclusão definitiva ocorrerá na próxima sincronização.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={closeDeleteModal} disabled={isSaving}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={confirmDeleteVehicle}
                              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                              disabled={isSaving}
                            >
                              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {isSaving ? 'Marcando...' : 'Marcar para Excluir'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                 </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground pt-2">
                 <p className="flex items-center gap-1"><Fuel className="h-3 w-3" /> Histórico de Abastecimentos</p>
                 <p className="flex items-center gap-1"><Milestone className="h-3 w-3" /> Km Percorridos & Performance</p>
                 <p className="flex items-center gap-1"><Users className="h-3 w-3" /> Motoristas que utilizaram</p>
                 <Button variant="link" size="sm" className="p-0 h-auto text-primary" onClick={() => toast({title: 'Funcionalidade em breve', description: 'Detalhes do histórico do veículo serão implementados.'})}>
                    Ver Histórico Completo
                 </Button>
              </CardContent>
            </Card>
          ))}
        </div>
       )}
    </div>
  );
};