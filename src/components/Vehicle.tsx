// src/components/Vehicle.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, Wrench, CalendarDays, Gauge } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// Define the vehicle interface
export interface VehicleInfo {
  id: string;
  model: string;
  year: number;
  licensePlate: string;
}

// Mock data - Exported for use elsewhere
export const initialVehicles: VehicleInfo[] = [
  { id: 'v1', model: 'Scania R450', year: 2021, licensePlate: 'BRA2E19' },
  { id: 'v2', model: 'Volvo FH540', year: 2022, licensePlate: 'MER1C01' },
];

export const Vehicle: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehicleInfo[]>(initialVehicles);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState<VehicleInfo | null>(null);
  const { toast } = useToast();

  // --- Form State for Create/Edit ---
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [licensePlate, setLicensePlate] = useState('');

  // --- Handlers ---
  const handleAddVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !year || !licensePlate) {
      toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
      return;
    }
     if (Number(year) < 1900 || Number(year) > new Date().getFullYear() + 1) {
        toast({ variant: "destructive", title: "Erro", description: "Ano do veículo inválido." });
        return;
      }

    const newVehicle: VehicleInfo = {
      id: String(Date.now()), // Simple unique ID
      model,
      year: Number(year),
      licensePlate: licensePlate.toUpperCase(), // Store plate in uppercase
    };
    // In a real app, save to backend before updating state
    initialVehicles.push(newVehicle); // Add to global mock data
    setVehicles(prevVehicles => [newVehicle, ...prevVehicles]); // Add to the beginning of the local state list
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: "Veículo cadastrado com sucesso!" });
  };

   const handleEditVehicle = (e: React.FormEvent) => {
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

     const updatedVehicle: VehicleInfo = {
       ...currentVehicle,
       model,
       year: Number(year),
       licensePlate: licensePlate.toUpperCase(),
     };

      // In a real app, save to backend before updating state
      const index = initialVehicles.findIndex(v => v.id === currentVehicle.id);
       if (index !== -1) {
         initialVehicles[index] = updatedVehicle; // Update global mock data
       }

     setVehicles(prevVehicles => prevVehicles.map(v => v.id === currentVehicle.id ? updatedVehicle : v)); // Update local state
     resetForm();
     setIsEditModalOpen(false);
     setCurrentVehicle(null);
     toast({ title: "Veículo atualizado com sucesso!" });
   };

   const handleDeleteVehicle = (vehicleId: string) => {
      // In a real app, call backend to delete before updating state
      const index = initialVehicles.findIndex(v => v.id === vehicleId);
       if (index !== -1) {
         initialVehicles.splice(index, 1); // Remove from global mock data
       }
     setVehicles(prevVehicles => prevVehicles.filter(v => v.id !== vehicleId)); // Update local state
     toast({ title: "Veículo excluído." });
   };

  const openEditModal = (vehicle: VehicleInfo) => {
    setCurrentVehicle(vehicle);
    setModel(vehicle.model);
    setYear(vehicle.year);
    setLicensePlate(vehicle.licensePlate);
    setIsEditModalOpen(true);
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
        <h2 className="text-2xl font-semibold">Meus Veículos</h2>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsCreateModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
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
                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} required placeholder="Ex: Scania R450" />
              </div>
              <div className="space-y-2">
                 <Label htmlFor="year">Ano*</Label>
                 <Input id="year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) > 0 ? Number(e.target.value) : '')} required placeholder="Ex: 2023" min="1900" max={new Date().getFullYear() + 1} />
               </div>
               <div className="space-y-2">
                 <Label htmlFor="licensePlate">Placa*</Label>
                 <Input id="licensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} required placeholder="Ex: BRA2E19" />
                 {/* Can add mask or validation later */}
               </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button>
                 </DialogClose>
                 <Button type="submit" className="bg-primary hover:bg-primary/90">Salvar Veículo</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

       {vehicles.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhum veículo cadastrado.</p>
             <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
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
                     <Dialog open={isEditModalOpen && currentVehicle?.id === vehicle.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                       <DialogTrigger asChild>
                         <Button variant="ghost" size="icon" onClick={() => openEditModal(vehicle)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
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
                                <Input id="editModel" value={model} onChange={(e) => setModel(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editYear">Ano*</Label>
                                <Input id="editYear" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) > 0 ? Number(e.target.value) : '')} required min="1900" max={new Date().getFullYear() + 1} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editLicensePlate">Placa*</Label>
                                <Input id="editLicensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} required />
                            </div>
                           <DialogFooter>
                              <DialogClose asChild>
                                 <Button type="button" variant="outline" onClick={closeEditModal}>Cancelar</Button>
                              </DialogClose>
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
                            <span className="sr-only">Excluir Veículo</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir o veículo {vehicle.model} ({vehicle.licensePlate})? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteVehicle(vehicle.id)}
                              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                 </div>
              </CardHeader>
              <CardContent>
                {/* Placeholder for other vehicle info or actions */}
                 <Button variant="outline" size="sm" className="mt-2">
                    <Wrench className="mr-2 h-4 w-4" /> Ver Manutenções
                 </Button>
              </CardContent>
              {/* <CardFooter>
                  Optional Footer Content
              </CardFooter> */}
            </Card>
          ))}
        </div>
       )}

    </div>
  );
};
