// src/components/Trips.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Eye, Edit, Trash2 } from 'lucide-react';
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
import { Textarea } from "@/components/ui/textarea"; // Assuming Textarea exists

interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
}

// Mock data - replace with actual data fetching and state management (e.g., useState, context, Zustand)
const initialTrips: Trip[] = [
  { id: '1', name: 'Viagem SP-RJ', startDate: '2024-07-20', endDate: '2024-07-25', description: 'Entrega cliente X e Y' },
  { id: '2', name: 'Coleta Curitiba', startDate: '2024-08-01', endDate: '2024-08-03' },
];

export const Trips: React.FC = () => {
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);

  // --- Form State for Create/Edit ---
  const [tripName, setTripName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');

  // --- Handlers ---
  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    const newTrip: Trip = {
      id: String(Date.now()), // Simple unique ID generation
      name: tripName,
      startDate,
      endDate,
      description,
    };
    setTrips([newTrip, ...trips]);
    resetForm();
    setIsCreateModalOpen(false);
    // Add toast notification
  };

  const handleEditTrip = (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentTrip) return;

     const updatedTrip: Trip = {
       ...currentTrip,
       name: tripName,
       startDate,
       endDate,
       description,
     };

     setTrips(trips.map(trip => trip.id === currentTrip.id ? updatedTrip : trip));
     resetForm();
     setIsEditModalOpen(false);
     setCurrentTrip(null);
     // Add toast notification
   };

  const handleDeleteTrip = (tripId: string) => {
    setTrips(trips.filter(trip => trip.id !== tripId));
    // Add toast notification
  };

  const openEditModal = (trip: Trip) => {
    setCurrentTrip(trip);
    setTripName(trip.name);
    setStartDate(trip.startDate);
    setEndDate(trip.endDate);
    setDescription(trip.description || '');
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setTripName('');
    setStartDate('');
    setEndDate('');
    setDescription('');
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
             <Button onClick={() => setIsCreateModalOpen(true)} className="bg-accent hover:bg-accent/90">
               <PlusCircle className="mr-2 h-4 w-4" /> Criar Nova Viagem
             </Button>
           </DialogTrigger>
           <DialogContent className="sm:max-w-[425px]">
             <DialogHeader>
               <DialogTitle>Criar Nova Viagem</DialogTitle>
             </DialogHeader>
             <form onSubmit={handleCreateTrip} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tripName" className="text-right">Nome</Label>
                  <Input id="tripName" value={tripName} onChange={(e) => setTripName(e.target.value)} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="startDate" className="text-right">Início</Label>
                   <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="col-span-3" required />
                 </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="endDate" className="text-right">Fim</Label>
                   <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="col-span-3" required />
                 </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="description" className="text-right">Descrição</Label>
                   <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" placeholder="Detalhes adicionais (opcional)" />
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
        <Card className="text-center py-10">
          <CardContent>
            <p className="text-muted-foreground">Nenhuma viagem cadastrada ainda.</p>
            <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
               Criar sua primeira viagem
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <Card key={trip.id} className="flex flex-col justify-between shadow-md transition-shadow hover:shadow-lg">
              <CardHeader>
                <CardTitle>{trip.name}</CardTitle>
                <CardDescription>
                  {new Date(trip.startDate).toLocaleDateString('pt-BR')} - {new Date(trip.endDate).toLocaleDateString('pt-BR')}
                </CardDescription>
                 {trip.description && <p className="text-sm text-muted-foreground pt-2">{trip.description}</p>}
              </CardHeader>
              <CardContent className="flex-grow">
                {/* Placeholder for quick stats or next stop */}
                 <p className="text-sm text-muted-foreground">Detalhes da viagem...</p>
                 {/* Future: Add buttons/links to add Visit, Expense, Fueling directly to this trip */}
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t pt-4">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                  <Eye className="h-4 w-4" />
                  <span className="sr-only">Visualizar</span>
                </Button>

                 <Dialog open={isEditModalOpen && currentTrip?.id === trip.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                   <DialogTrigger asChild>
                     <Button variant="ghost" size="icon" onClick={() => openEditModal(trip)} className="text-muted-foreground hover:text-accent">
                       <Edit className="h-4 w-4" />
                       <span className="sr-only">Editar</span>
                     </Button>
                   </DialogTrigger>
                   <DialogContent className="sm:max-w-[425px]">
                     <DialogHeader>
                       <DialogTitle>Editar Viagem</DialogTitle>
                     </DialogHeader>
                     <form onSubmit={handleEditTrip} className="grid gap-4 py-4">
                       <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="editTripName" className="text-right">Nome</Label>
                         <Input id="editTripName" value={tripName} onChange={(e) => setTripName(e.target.value)} className="col-span-3" required />
                       </div>
                       <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="editStartDate" className="text-right">Início</Label>
                          <Input id="editStartDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="editEndDate" className="text-right">Fim</Label>
                          <Input id="editEndDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="editDescription" className="text-right">Descrição</Label>
                          <Textarea id="editDescription" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" placeholder="Detalhes adicionais (opcional)" />
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

                 <AlertDialog>
                   <AlertDialogTrigger asChild>
                     <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                       <Trash2 className="h-4 w-4" />
                       <span className="sr-only">Excluir</span>
                     </Button>
                   </AlertDialogTrigger>
                   <AlertDialogContent>
                     <AlertDialogHeader>
                       <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                       <AlertDialogDescription>
                         Tem certeza que deseja excluir a viagem "{trip.name}"? Esta ação não pode ser desfeita e removerá todas as visitas, despesas e abastecimentos associados.
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
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
