'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, ChevronDown, ChevronUp, Car, CheckCircle2, PlayCircle, MapPin, Wallet, Fuel } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Visits } from './Visits';
import { Expenses } from './Expenses';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { initialVehicles, type VehicleInfo } from '../Vehicle';
import { Badge } from '@/components/ui/badge';
import { initialVisits } from './Visits';

import type { Visit } from './Visits';
import { Fuelings } from './Fuelings';
import type { Fueling } from './Fuelings';



interface Trip {
  id: string;
  name: string;
  vehicleId: string;
  userId: string;
  status: 'Andamento' | 'Finalizado';
  createdAt: string;
  updatedAt: string;
  visitCount?: number;
  expenseCount?: number;
  fuelingCount?: number;
}

const initialTrips: Trip[] = [
  { id: '1', name: 'Viagem Scania R450 (BRA2E19) - 23/07/2024', vehicleId: 'v1', userId: '1', status: 'Andamento', createdAt: new Date(2024, 6, 20).toISOString(), updatedAt: new Date(2024, 6, 21).toISOString() },
  { id: '2', name: 'Viagem Volvo FH540 (MER1C01) - 22/07/2024', vehicleId: 'v2', userId: '1', status: 'Finalizado', createdAt: new Date(2024, 6, 15).toISOString(), updatedAt: new Date(2024, 6, 22).toISOString() },
];

export const Trips: React.FC = () => {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();

  const [tripName, setTripName] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  useEffect(() => {
    setVehicles(initialVehicles);
    const sortedTrips = [...initialTrips].sort((a, b) => {
      if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
      if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
      return b.name.localeCompare(a.name);
    });
    setTrips(sortedTrips);
  }, []);

  const getVehicleDisplay = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
  };

  const getTripDescription = (trip: Trip): string => {
    const vehicle = vehicles.find(v => v.id === trip.vehicleId);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
  };

  const getVisitCount = (tripId: string): number => initialVisits.filter(v => v.tripId === tripId).length;
  const ExpensesModule = require("./Expenses");
  const initialExpenses = ExpensesModule.initialExpenses;
  const getExpenseCount = (tripId: string): number => initialExpenses.filter(e => e.tripId === tripId).length;
  const FuelingsModule = require("./Fuelings");
  const initialFuelings = FuelingsModule.initialFuelings;
  const getFuelingCount = (tripId: string): number => initialFuelings.filter(f => f.tripId === tripId).length;

  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Usuário não autenticado.' });
      return;
    }
    if (!selectedVehicleId) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Veículo é obrigatório.' });
      return;
    }

    const vehicleDisplay = getVehicleDisplay(selectedVehicleId);
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const generatedTripName = `Viagem ${vehicleDisplay} - ${dateStr}`;

    const newTrip: Trip = {
      id: String(Date.now()),
      name: generatedTripName,
      vehicleId: selectedVehicleId,
      userId: user.id,
      status: 'Andamento',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    initialTrips.push(newTrip);
    setTrips(prevTrips => [newTrip, ...prevTrips].sort((a, b) => {
      if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
      if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
      return b.name.localeCompare(a.name);
    }));
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: 'Viagem criada com sucesso!' });
  };

  const handleEditTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTrip || !user) return;
    if (!tripName || !selectedVehicleId) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Nome da viagem e veículo são obrigatórios.' });
      return;
    }

    const updatedTrip: Trip = {
      ...currentTrip,
      name: tripName,
      vehicleId: selectedVehicleId,
      userId: user.id,
      status: currentTrip.status,
      createdAt: currentTrip.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const index = initialTrips.findIndex(t => t.id === currentTrip.id);
    if (index !== -1) {
      initialTrips[index] = updatedTrip;
    }

    setTrips(prevTrips => prevTrips.map(trip => trip.id === currentTrip.id ? updatedTrip : trip)
      .sort((a, b) => {
        if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
        if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
        return b.name.localeCompare(a.name);
      }));
    resetForm();
    setIsEditModalOpen(false);
    setCurrentTrip(null);
    toast({ title: 'Viagem atualizada com sucesso!' });
  };

  const handleFinishTrip = (tripId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    const index = initialTrips.findIndex(t => t.id === tripId);
    if (index === -1) return;

    const updatedTrip = { ...initialTrips[index], status: 'Finalizado' as const, updatedAt: new Date().toISOString() };
    initialTrips[index] = updatedTrip;

    setTrips(prevTrips => [...prevTrips].map(trip => trip.id === tripId ? updatedTrip : trip)
      .sort((a, b) => {
        if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
        if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
        return b.name.localeCompare(a.name);
      }));

    toast({ title: `Viagem "${updatedTrip.name}" marcada como finalizada.` });

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
    toast({ title: 'Viagem excluída.', description: 'Visitas, despesas e abastecimentos associados também devem ser tratados.' });
  };

  const openEditModal = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    setCurrentTrip(trip);
    setTripName(trip.name);
    setSelectedVehicleId(trip.vehicleId);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setTripName('');
    setSelectedVehicleId('');
  };

  const closeCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(false);
  };

  const closeEditModal = () => {
    resetForm();
    setIsEditModalOpen(false);
    setCurrentTrip(null);
  };


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
          {trips.map((trip) => {
            const visitCount = getVisitCount(trip.id);
            const expenseCount = getExpenseCount(trip.id);
            const fuelingCount = getFuelingCount(trip.id);
            return (
              <AccordionItem key={trip.id} value={trip.id} className="border bg-card rounded-lg shadow-sm overflow-hidden">
                <AccordionTrigger className="flex justify-between items-center p-4 hover:bg-accent/50 cursor-pointer w-full text-left data-[state=open]:border-b">
                  <div className="flex-1 mr-4 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-lg">{trip.name}</CardTitle>
                      <Badge variant={trip.status === 'Andamento' ? 'default' : 'secondary'} className={`h-5 px-2 text-xs whitespace-nowrap ${trip.status === 'Andamento' ? 'bg-emerald-500 hover:bg-emerald-500/80 dark:bg-emerald-600 dark:hover:bg-emerald-600/80 text-white' : ''}`}>
                        {trip.status === 'Andamento' ? <PlayCircle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {trip.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm flex items-center gap-1">
                      <Car className="h-4 w-4 text-muted-foreground" /> {getTripDescription(trip)}
                    </CardDescription>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <span>
                        <MapPin className="h-3 w-3 inline-block mr-1" /> {visitCount} Visitas
                      </span>
                      <span>
                        <Wallet className="h-3 w-3 inline-block mr-1" /> {expenseCount} Despesas
                      </span>
                      <span>
                        <Fuel className="h-3 w-3 inline-block mr-1" /> {fuelingCount} Abastecimentos
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <span>Início: {new Date(trip.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      <span>Atualizado: {new Date(trip.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {trip.status === 'Andamento' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
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
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              Confirmar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
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
            );
          })}
        </Accordion>
      )}
    </div>
  );
};