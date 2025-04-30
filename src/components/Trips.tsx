// src/components/Trips.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
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
import { Visits } from './Visits'; // Import nested components
import { Expenses } from './Expenses';
import { Fuelings } from './Fuelings';
import { useToast } from '@/hooks/use-toast';

interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
  // Add counts for related items (optional, calculate if needed)
  visitCount?: number;
  expenseCount?: number;
  fuelingCount?: number;
}

// Mock data - replace with actual data fetching and state management
const initialTrips: Trip[] = [
  { id: '1', name: 'Viagem SP-RJ', startDate: '2024-07-20', endDate: '2024-07-25', description: 'Entrega cliente X e Y' },
  { id: '2', name: 'Coleta Curitiba', startDate: '2024-08-01', endDate: '2024-08-03' },
];

export const Trips: React.FC = () => {
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null); // Track expanded trip
  const { toast } = useToast();

  // --- Form State for Create/Edit ---
  const [tripName, setTripName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');

  // --- Handlers ---
  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripName || !startDate || !endDate) {
      toast({ variant: "destructive", title: "Erro", description: "Nome, data de início e data de fim são obrigatórios." });
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast({ variant: "destructive", title: "Erro", description: "A data de início não pode ser posterior à data de fim." });
       return;
     }

    const newTrip: Trip = {
      id: String(Date.now()), // Simple unique ID generation
      name: tripName,
      startDate,
      endDate,
      description,
    };
    setTrips([newTrip, ...trips].sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())); // Add and sort
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: "Viagem criada com sucesso!" });
  };

  const handleEditTrip = (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentTrip) return;
      if (!tripName || !startDate || !endDate) {
        toast({ variant: "destructive", title: "Erro", description: "Nome, data de início e data de fim são obrigatórios." });
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
       toast({ variant: "destructive", title: "Erro", description: "A data de início não pode ser posterior à data de fim." });
        return;
      }

     const updatedTrip: Trip = {
       ...currentTrip,
       name: tripName,
       startDate,
       endDate,
       description,
     };

     setTrips(trips.map(trip => trip.id === currentTrip.id ? updatedTrip : trip)
                .sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())); // Update and sort
     resetForm();
     setIsEditModalOpen(false);
     setCurrentTrip(null);
     toast({ title: "Viagem atualizada com sucesso!" });
   };

  const handleDeleteTrip = (tripId: string) => {
    // Add logic here to also delete associated Visits, Expenses, Fuelings in a real app
    setTrips(trips.filter(trip => trip.id !== tripId));
    if (expandedTripId === tripId) {
      setExpandedTripId(null); // Collapse if deleted trip was expanded
    }
    toast({ title: "Viagem excluída.", description: "Visitas, despesas e abastecimentos associados também devem ser tratados." });
  };

  const openEditModal = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent accordion toggle when clicking edit
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

   // Format Date for display
    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        try {
            // Use UTC to avoid timezone issues if dates are stored as YYYY-MM-DD
            const date = new Date(dateString + 'T00:00:00Z');
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
        } catch (e) {
            return 'Data inválida';
        }
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
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tripName" className="text-right">Nome*</Label>
                  <Input id="tripName" value={tripName} onChange={(e) => setTripName(e.target.value)} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="startDate" className="text-right">Início*</Label>
                   <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="col-span-3" required />
                 </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="endDate" className="text-right">Fim*</Label>
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
                       <CardDescription className="text-sm">
                          {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
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
                             <div className="grid grid-cols-4 items-center gap-4">
                               <Label htmlFor="editTripName" className="text-right">Nome*</Label>
                               <Input id="editTripName" value={tripName} onChange={(e) => setTripName(e.target.value)} className="col-span-3" required />
                             </div>
                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="editStartDate" className="text-right">Início*</Label>
                                <Input id="editStartDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="col-span-3" required />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="editEndDate" className="text-right">Fim*</Label>
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
                        {/* Chevron moved inside trigger */}
                        <ChevronDown className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-180 flex-shrink-0 ml-2" />
                     </div>
                 </AccordionTrigger>
                 <AccordionContent className="p-4 pt-0 bg-secondary/30">
                    {/* Nested Tabs or Sections for Visits, Expenses, Fuelings */}
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
