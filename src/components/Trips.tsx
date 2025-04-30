// src/components/Trips.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, ChevronDown, ChevronUp, Car, CheckCircle2, PlayCircle } from 'lucide-react'; // Added CheckCircle2, PlayCircle
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Visits } from './Visits';
import { Expenses } from './Expenses';
import { Fuelings } from './Fuelings';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { VehicleInfo } from './Vehicle';
import { initialVehicles } from './Vehicle';
import { Badge } from "@/components/ui/badge"; // Import Badge

// Updated Trip interface with status
interface Trip {
  id: string;
  name: string;
  description?: string; // Keep description for editing, but remove from create
  vehicleId: string;
  userId: string;
  status: 'Andamento' | 'Finalizado'; // Added status field
  // Add counts for related items (optional, calculate if needed)
  visitCount?: number;
  expenseCount?: number;
  fuelingCount?: number;
}

// Mock data - Updated to include status
const initialTrips: Trip[] = [
  { id: '1', name: 'Viagem Scania R450 (BRA2E19) - 23/07/2024', description: 'Entrega cliente X e Y', vehicleId: 'v1', userId: '1', status: 'Andamento' }, // Example with generated name
  { id: '2', name: 'Viagem Volvo FH540 (MER1C01) - 22/07/2024', vehicleId: 'v2', userId: '1', status: 'Finalizado' }, // Example with generated name
];

export const Trips: React.FC = () => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]); // Initialize empty and sort later
  const [vehicles, setVehicles] = useState<VehicleInfo[]>(initialVehicles);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();

  // --- Form State for Create/Edit ---
  const [tripName, setTripName] = useState(''); // Still needed for Edit Modal title consistency & edit form
  const [description, setDescription] = useState(''); // Only used for Edit Modal
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

   useEffect(() => {
       setVehicles(initialVehicles);
       // Load and sort initial trips
       const sortedTrips = [...initialTrips].sort((a, b) => {
            // Sort primarily by status ('Andamento' first), then by ID descending
             if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
             if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
             // Assuming IDs are numeric strings or can be compared numerically
             // Use name for secondary sort if IDs are not reliably numeric/sequential
             return b.name.localeCompare(a.name); // Sort by name descending as fallback
        });
       setTrips(sortedTrips);
     }, []);


    const getVehicleDisplay = (vehicleId: string) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
    }

  // --- Handlers ---
  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
      return;
    }
    if (!selectedVehicleId) {
      toast({ variant: "destructive", title: "Erro", description: "Veículo é obrigatório." });
      return;
    }

    // Generate automatic trip name
    const vehicleDisplay = getVehicleDisplay(selectedVehicleId);
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const generatedTripName = `Viagem ${vehicleDisplay} - ${dateStr}`;

    const newTrip: Trip = {
      id: String(Date.now()),
      name: generatedTripName, // Use generated name
      // Description is not collected in create modal anymore
      vehicleId: selectedVehicleId,
      userId: user.id,
      status: 'Andamento', // Default status
    };
    initialTrips.push(newTrip);
     setTrips(prevTrips => [newTrip, ...prevTrips].sort((a, b) => {
        if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
        if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
        return b.name.localeCompare(a.name); // Sort by name descending
     }));
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: "Viagem criada com sucesso!" });
  };

  const handleEditTrip = (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentTrip || !user) return;
      // Keep tripName validation for editing
      if (!tripName || !selectedVehicleId) {
        toast({ variant: "destructive", title: "Erro", description: "Nome da viagem e veículo são obrigatórios." });
        return;
      }

     const updatedTrip: Trip = {
       ...currentTrip,
       name: tripName,
       description, // Description is editable
       vehicleId: selectedVehicleId,
       // Status is not edited here, but via a separate action
     };

     const index = initialTrips.findIndex(t => t.id === currentTrip.id);
     if (index !== -1) {
       initialTrips[index] = updatedTrip;
     }

     setTrips(prevTrips => prevTrips.map(trip => trip.id === currentTrip.id ? updatedTrip : trip)
                                    .sort((a,b) => {
                                        if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
                                        if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
                                        return b.name.localeCompare(a.name); // Sort by name descending
                                     }));
     resetForm();
     setIsEditModalOpen(false);
     setCurrentTrip(null);
     toast({ title: "Viagem atualizada com sucesso!" });
   };

   const handleFinishTrip = (tripId: string, event: React.MouseEvent) => {
       event.stopPropagation(); // Prevent accordion from toggling

        const index = initialTrips.findIndex(t => t.id === tripId);
        if (index === -1) return;

        const updatedTrip = { ...initialTrips[index], status: 'Finalizado' as const };
        initialTrips[index] = updatedTrip;


        // Update local state and re-sort
        setTrips(prevTrips => [...prevTrips].map(trip => trip.id === tripId ? updatedTrip : trip)
                                            .sort((a, b) => {
                                              if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
                                              if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
                                              return b.name.localeCompare(a.name); // Sort by name descending
                                            }));

         toast({ title: `Viagem "${updatedTrip.name}" marcada como finalizada.` });

         // Optionally close accordion if it was open
         // if (expandedTripId === tripId) {
         //   setExpandedTripId(null);
         // }
      };

  const handleDeleteTrip = (tripId: string) => {
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
    setTripName(trip.name); // Populate name for editing
    setDescription(trip.description || ''); // Populate description for editing
    setSelectedVehicleId(trip.vehicleId);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setTripName(''); // Reset name state used in edit modal
    setDescription(''); // Reset description state used in edit modal
    setSelectedVehicleId('');
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
                 {/* Description field removed */}
                 <div className="space-y-2">
                    <Label>Motorista</Label>
                    <p className="text-sm text-muted-foreground">{user?.email || 'Não identificado'}</p>
                 </div>
                 <div className="space-y-2">
                   <Label>Status</Label>
                    <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                       <PlayCircle className="h-4 w-4" /> Andamento
                    </p>
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
                    <div className="flex-1 mr-4 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap"> {/* Allow wrapping */}
                        <CardTitle className="text-lg">{trip.name}</CardTitle>
                         <Badge variant={trip.status === 'Andamento' ? 'default' : 'secondary'} className={`h-5 px-2 text-xs whitespace-nowrap ${trip.status === 'Andamento' ? 'bg-emerald-500 hover:bg-emerald-500/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80 text-white' : ''}`}>
                             {trip.status === 'Andamento' ? <PlayCircle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                             {trip.status}
                         </Badge>
                      </div>
                       <CardDescription className="text-sm flex items-center gap-1">
                          <Car className="h-4 w-4 text-muted-foreground"/> {getVehicleDisplay(trip.vehicleId)}
                       </CardDescription>
                       {trip.description && <p className="text-xs text-muted-foreground">{trip.description}</p>}
                    </div>
                     <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Finish Trip Button */}
                        {trip.status === 'Andamento' && (
                             <AlertDialog>
                               <AlertDialogTrigger asChild>
                                 {/* Make button smaller and potentially hide text on small screens */}
                                 <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()} className="h-8 px-2 sm:px-3 text-emerald-600 border-emerald-600/50 hover:bg-emerald-50 hover:text-emerald-700">
                                    <CheckCircle2 className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Finalizar</span>
                                 </Button>
                               </AlertDialogTrigger>
                               <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Confirmar Finalização</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     Tem certeza que deseja marcar a viagem "{trip.name}" como finalizada?
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                   <AlertDialogAction
                                     onClick={(e) => handleFinishTrip(trip.id, e)}
                                     className="bg-emerald-600 hover:bg-emerald-700" // Use a success color
                                   >
                                     Confirmar
                                   </AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                             </AlertDialog>
                        )}
                       {/* Edit Button (always available for name/description/vehicle changes) */}
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
                              <div className="space-y-2">
                                <Label htmlFor="editDescription">Descrição</Label>
                                <Textarea id="editDescription" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes adicionais (opcional)" />
                              </div>
                               <div className="space-y-2">
                                  <Label>Motorista</Label>
                                  <p className="text-sm text-muted-foreground">{user?.email || 'Não identificado'}</p>
                               </div>
                              <div className="space-y-2">
                                 <Label>Status</Label>
                                 <p className="text-sm font-medium">{currentTrip?.status}</p>
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
                        <ChevronDown className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-180 flex-shrink-0 ml-1 sm:ml-2" />
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
