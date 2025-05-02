// src/components/Vehicle.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, Wrench, CalendarDays, Gauge, Fuel, Milestone, Users, Loader2 } from 'lucide-react'; // Added Loader2
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getVehicles, addVehicle, updateVehicle, deleteVehicle } from '@/services/firestoreService'; // Import Firestore service functions
import { LoadingSpinner } from './LoadingSpinner'; // Import LoadingSpinner

// Define the vehicle interface
export interface VehicleInfo {
  id: string;
  model: string;
  year: number;
  licensePlate: string;
}

// Remove initialVehicles - will fetch from Firestore
// export const initialVehicles: VehicleInfo[] = [...];
export { getVehicles as initialVehicles } from '@/services/firestoreService'; // Exporting function for legacy imports if needed

export const Vehicle: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [loading, setLoading] = useState(true); // Loading state for fetching
  const [isSaving, setIsSaving] = useState(false); // Loading state for CUD operations
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // State for delete confirmation
  const [currentVehicle, setCurrentVehicle] = useState<VehicleInfo | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<VehicleInfo | null>(null); // State for vehicle to delete
  const { toast } = useToast();

  // --- Form State for Create/Edit ---
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [licensePlate, setLicensePlate] = useState('');

  // Fetch vehicles on mount
  useEffect(() => {
    const fetchVehicles = async () => {
      setLoading(true);
      try {
        const fetchedVehicles = await getVehicles();
        setVehicles(fetchedVehicles);
      } catch (error) {
        console.error("Error fetching vehicles:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar os veículos." });
      } finally {
        setLoading(false);
      }
    };
    fetchVehicles();
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

    const newVehicleData: Omit<VehicleInfo, 'id'> = {
      model,
      year: Number(year),
      licensePlate: licensePlate.toUpperCase(), // Store plate in uppercase
    };

    setIsSaving(true);
    try {
        const newVehicleId = await addVehicle(newVehicleData);
        const createdVehicle: VehicleInfo = { ...newVehicleData, id: newVehicleId };
        setVehicles(prevVehicles => [createdVehicle, ...prevVehicles]);
        resetForm();
        setIsCreateModalOpen(false);
        toast({ title: "Veículo cadastrado com sucesso!" });
    } catch (error) {
        console.error("Error adding vehicle:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível cadastrar o veículo." });
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

     const dataToUpdate: Partial<VehicleInfo> = {
       model,
       year: Number(year),
       licensePlate: licensePlate.toUpperCase(),
     };

     setIsSaving(true);
     try {
         await updateVehicle(currentVehicle.id, dataToUpdate);
         const updatedVehicle = { ...currentVehicle, ...dataToUpdate };
         setVehicles(prevVehicles => prevVehicles.map(v => v.id === currentVehicle.id ? updatedVehicle : v));
         resetForm();
         setIsEditModalOpen(false);
         setCurrentVehicle(null);
         toast({ title: "Veículo atualizado com sucesso!" });
     } catch (error) {
          console.error("Error updating vehicle:", error);
          toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar o veículo." });
     } finally {
          setIsSaving(false);
     }
   };

   const confirmDeleteVehicle = async () => {
        if (!vehicleToDelete) return;
        setIsSaving(true);
        try {
            // TODO: Add check here - Prevent deletion if vehicle is linked to active trips?
            // This requires fetching trip data, adding complexity. For now, allow deletion.
            // const activeTrips = await getTrips([where('vehicleId', '==', vehicleToDelete.id), where('status', '==', 'Andamento')]);
            // if (activeTrips.length > 0) {
            //     toast({ variant: "destructive", title: "Erro", description: "Veículo está em uma viagem ativa." });
            //     setIsSaving(false);
            //     return;
            // }

            await deleteVehicle(vehicleToDelete.id);
            setVehicles(prevVehicles => prevVehicles.filter(v => v.id !== vehicleToDelete.id));
            toast({ title: "Veículo excluído." });
            closeDeleteModal();
        } catch (error) {
             console.error("Error deleting vehicle:", error);
             toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir o veículo." });
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
                 {/* Can add mask or validation later */}
               </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button>
                 </DialogClose>
                 <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSaving ? 'Salvando...' : 'Salvar Veículo'}
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
             <p className="text-muted-foreground">Nenhum veículo cadastrado.</p>
             <Button variant="link" onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
               Cadastrar seu primeiro veículo
             </Button>
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
                                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
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
                              Tem certeza que deseja excluir o veículo {vehicle.model} ({vehicle.licensePlate})? Esta ação não pode ser desfeita.
                              {/* TODO: Add warning about associated data if applicable */}
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
                              {isSaving ? 'Excluindo...' : 'Excluir'}
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
                 <p className="flex items-center gap-1"><Wrench className="h-3 w-3" /> Manutenções</p>
                 {/* Example link/button - Add onClick handler for actual functionality */}
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