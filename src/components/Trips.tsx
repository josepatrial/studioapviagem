// src/components/Trips.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, ChevronDown, ChevronUp, Car } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select
import { Visits } from './Visits';
import { Expenses } from './Expenses';
import { Fuelings } from './Fuelings';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth
import type { VehicleInfo } from './Vehicle'; // Import VehicleInfo type
import { initialVehicles } from './Vehicle'; // Import mock vehicles for dropdown

// Updated Trip interface
interface Trip {
  id: string;
  name: string;
  description?: string;
  vehicleId: string; // Added vehicleId
  userId: string;    // Added userId
  // Removed startDate, endDate
  // Add counts for related items (optional, calculate if needed)
  visitCount?: number;
  expenseCount?: number;
  fuelingCount?: number;
}

// Mock data - Updated to match new interface
const initialTrips: Trip[] = [
  { id: '1', name: 'Viagem SP-RJ', description: 'Entrega cliente X e Y', vehicleId: 'v1', userId: '1' },
  { id: '2', name: 'Coleta Curitiba', vehicleId: 'v2', userId: '1' },
];

export const Trips: React.FC = () => {
  const { user } = useAuth(); // Get user from context
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>(initialVehicles); // State for vehicles
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();

  // --- Form State for Create/Edit ---
  const [tripName, setTripName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState(''); // State for selected vehicle

   useEffect(() => {
       // Fetch vehicles in a real app
       setVehicles(initialVehicles);

       // Initial sort (can be done once or on data change)
       setTrips(currentTrips => [...currentTrips].sort((a, b) => Number(b.id) - Number(a.id))); // Sort by id descending initially
     }, []);

  // --- Handlers ---
  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
      return;
    }
    if (!tripName || !selectedVehicleId) {
      toast({ variant: "destructive", title: "Erro", description: "Nome da viagem e veículo são obrigatórios." });
      return;
    }

    const newTrip: Trip = {
      id: String(Date.now()),
      name: tripName,
      description,
      vehicleId: selectedVehicleId,
      userId: user.id, // Assign logged-in user's ID
    };
    // In a real app, save to backend
    initialTrips.push(newTrip); // Add to mock data
    setTrips(prevTrips => [newTrip, ...prevTrips].sort((a, b) => Number(b.id) - Number(a.id))); // Add and sort
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: "Viagem criada com sucesso!" });
  };

  const handleEditTrip = (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentTrip || !user) return;
      if (!tripName || !selectedVehicleId) {
        toast({ variant: "destructive", title: "Erro", description: "Nome da viagem e veículo são obrigatórios." });
        return;
      }

     const updatedTrip: Trip = {
       ...currentTrip,
       name: tripName,
       description,
       vehicleId: selectedVehicleId,
       // userId typically doesn't change on edit
     };

     // In a real app, save to backend
     const index = initialTrips.findIndex(t => t.id === currentTrip.id);
     if (index !== -1) {
       initialTrips[index] = updatedTrip;
     }

     setTrips(prevTrips => prevTrips.map(trip => trip.id === currentTrip.id ? updatedTrip : trip)
                                    .sort((a,b) => Number(b.id) - Number(a.id))); // Update and sort
     resetForm();
     setIsEditModalOpen(false);
     setCurrentTrip(null);
     toast({ title: "Viagem atualizada com sucesso!" });
   };

  const handleDeleteTrip = (tripId: string) => {
    // Add logic here to also delete associated Visits, Expenses, Fuelings in a real app
    const index = initialTrips.findIndex(t => t.id === tripId);
     if (index !== -1) {
       initialTrips.splice(index, 1);
     }
    setTrips(trips.filter(trip => trip.id !== tripId));
    if (expandedTripId === tripId) {
      setExpandedTripId(null);
    }
    toast({ title: "Viagem excluída.", description: "Visitas, despesas e abastecimentos associados também devem ser tratados." });
  };

  const openEditModal = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    setCurrentTrip(trip);
    setTripName(trip.name);
    setDescription(trip.description || '');
    setSelectedVehicleId(trip.vehicleId); // Set selected vehicle
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setTripName('');
    setDescription('');
    setSelectedVehicleId(''); // Reset vehicle selection
  };

  const closeCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(false);
  }

  const closeEditModal = () => {
     resetForm();
     setIsEditModalOpen(false);
     setCurrentTrip(null);
   }

   // Find vehicle details for display
    const getVehicleDisplay = (vehicleId: string) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo não encontrado';
    }


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Minhas Viagens</h2>
         <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
           <DialogTrigger asChild>
             <Button onClick={() => setIsCreateModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
               <PlusCircle className="mr-2 h-4 w-4" /> Criar Nova Viagem
             </Button>
           </DialogTrigger>
           <DialogContent className="sm:max-w-[425px]">
             <DialogHeader>
               <DialogTitle>Criar Nova Viagem</DialogTitle>
             </DialogHeader>
             <form onSubmit={handleCreateTrip} className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="tripName">Nome da Viagem*</Label>
                  <Input id="tripName" value={tripName} onChange={(e) => setTripName(e.target.value)} required placeholder="Ex: Entrega São Paulo" />
                </div>
                 {/* Vehicle Select */}
                 <div className="space-y-2">
                   <Label htmlFor="vehicleId">Veículo*</Label>
                   <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId} required>
                     <SelectTrigger id="vehicleId">
                       <SelectValue placeholder="Selecione um veículo" />
                     </SelectTrigger>
                     <SelectContent>
                       {vehicles.length > 0 ? (
                         vehicles.map((vehicle) => (
                           <SelectItem key={vehicle.id} value={vehicle.id}>
                             {vehicle.model} ({vehicle.licensePlate})
                           </SelectItem>
                         ))
                       ) : (
                         <SelectItem value="no-vehicles" disabled>Nenhum veículo cadastrado</SelectItem>
                       )}
                     </SelectContent>
                   </Select>
                 </div>
                 {/* Removed Date Fields */}
                 <div className="space-y-2">
                   <Label htmlFor="description">Descrição</Label>
                   <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes adicionais (opcional)" />
                 </div>
                 <div className="space-y-2">
                    <Label>Motorista</Label>
                    <p className="text-sm text-muted-foreground">{user?.email || 'Não identificado'}</p>
                 </div>
                 <DialogFooter>
                    <DialogClose asChild>
                       <Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button>
                    </DialogClose>
                    <Button type="submit" className="bg-primary hover:bg-primary/90">Salvar Viagem</Button>
                 </DialogFooter>
             </form>
           </DialogContent>
         </Dialog>
      </div>

      {trips.length === 0 ? (
        <Card className="text-center py-10 bg-card border border-border">
          <CardContent>
            <p className="text-muted-foreground">Nenhuma viagem cadastrada ainda.</p>
            <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
               Criar sua primeira viagem
            </Button>
          </CardContent>
        </Card>
      ) : (
         <Accordion type="single" collapsible className="w-full space-y-4" value={expandedTripId ?? undefined} onValueChange={setExpandedTripId}>
            {trips.map((trip) => (
              <AccordionItem key={trip.id} value={trip.id} className="border bg-card rounded-lg shadow-sm overflow-hidden">
                 <AccordionTrigger className="flex justify-between items-center p-4 hover:bg-accent/50 cursor-pointer w-full text-left data-[state=open]:border-b">
                    <div className="flex-1 mr-4">
                      <CardTitle className="text-lg">{trip.name}</CardTitle>
                       {/* Display Vehicle instead of dates */}
                       <CardDescription className="text-sm flex items-center gap-1 mt-1">
                          <Car className="h-4 w-4 text-muted-foreground"/> {getVehicleDisplay(trip.vehicleId)}
                       </CardDescription>
                       {trip.description && <p className="text-xs text-muted-foreground mt-1">{trip.description}</p>}
                    </div>
                     <div className="flex items-center gap-1 flex-shrink-0">
                       {/* Edit Button */}
                       <Dialog open={isEditModalOpen && currentTrip?.id === trip.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                         <DialogTrigger asChild>
                           <Button variant="ghost" size="icon" onClick={(e) => openEditModal(trip, e)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Editar Viagem</span>
                           </Button>
                         </DialogTrigger>
                         <DialogContent className="sm:max-w-[425px]">
                           <DialogHeader>
                             <DialogTitle>Editar Viagem</DialogTitle>
                           </DialogHeader>
                           <form onSubmit={handleEditTrip} className="grid gap-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="editTripName">Nome da Viagem*</Label>
                                <Input id="editTripName" value={tripName} onChange={(e) => setTripName(e.target.value)} required />
                              </div>
                               {/* Vehicle Select */}
                               <div className="space-y-2">
                                 <Label htmlFor="editVehicleId">Veículo*</Label>
                                 <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId} required>
                                   <SelectTrigger id="editVehicleId">
                                     <SelectValue />
                                   </SelectTrigger>
                                   <SelectContent>
                                     {vehicles.map((vehicle) => (
                                       <SelectItem key={vehicle.id} value={vehicle.id}>
                                         {vehicle.model} ({vehicle.licensePlate})
                                       </SelectItem>
                                     ))}
                                   </SelectContent>
                                 </Select>
                               </div>
                              {/* Removed Date Fields */}
                              <div className="space-y-2">
                                <Label htmlFor="editDescription">Descrição</Label>
                                <Textarea id="editDescription" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes adicionais (opcional)" />
                              </div>
                               <div className="space-y-2">
                                  <Label>Motorista</Label>
                                  <p className="text-sm text-muted-foreground">{user?.email || 'Não identificado'}</p>
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
                            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-destructive h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Excluir Viagem</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir a viagem "{trip.name}"? Esta ação não pode ser desfeita e removerá todas as visitas, despesas e abastecimentos associados (funcionalidade a implementar).
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteTrip(trip.id)}
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <ChevronDown className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-180 flex-shrink-0 ml-2" />
                     </div>
                 </AccordionTrigger>
                 <AccordionContent className="p-4 pt-0 bg-secondary/30">
                    <div className="space-y-6">
                         <section>
                             <Visits tripId={trip.id} tripName={trip.name} />
                         </section>
                          <hr className="border-border" />
                         <section>
                             <Expenses tripId={trip.id} tripName={trip.name} />
                         </section>
                          <hr className="border-border" />
                         <section>
                             <Fuelings tripId={trip.id} tripName={trip.name} />
                         </section>
                    </div>
                 </AccordionContent>
              </AccordionItem>
            ))}
         </Accordion>
      )}
    </div>
  );
};
