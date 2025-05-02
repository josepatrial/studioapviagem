// src/components/Trips/Trips.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, ChevronDown, ChevronUp, Car, CheckCircle2, PlayCircle, MapPin, Wallet, Fuel, Milestone, Filter } from 'lucide-react'; // Added Milestone, Filter
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
// Mock data - Imported to fix the reference error, but could be moved back if unused here
import { initialVisits, type Visit } from './Visits';
// Import initialExpenses and initialFuelings directly
import { Expenses, initialExpenses, Expense } from './Expenses';
import { Fuelings, initialFuelings, Fueling } from './Fuelings';
import { Visits } from './Visits'; // Import the Visits component
import { useToast } from '@/hooks/use-toast';
import { useAuth, initialDrivers } from '@/contexts/AuthContext'; // Import initialDrivers as well
import { initialVehicles, type VehicleInfo } from '../Vehicle';
import { Badge } from '@/components/ui/badge';
import { FinishTripDialog } from './FinishTripDialog';

// Define Trip interface
export interface Trip {
  id: string;
  name: string;
  vehicleId: string;
  userId: string; // ID of the driver who owns the trip
  status: 'Andamento' | 'Finalizado';
  createdAt: string;
  updatedAt: string;
  visitCount?: number;
  expenseCount?: number;
  fuelingCount?: number;
  finalKm?: number;
  totalDistance?: number;
  base?: string; // Add base information to the trip
}

// Mock data - Updated to include userId and base
// Find driver IDs from initialDrivers to associate trips
const driver1Id = initialDrivers.find(d => d.username === 'joao.silva')?.id || 'driver1';
const driver2Id = initialDrivers.find(d => d.username === 'maria.souza')?.id || 'driver2';

const initialTrips: Trip[] = [
  { id: '1', name: 'Viagem Scania R450 (BRA2E19) - 23/07/2024', vehicleId: 'v1', userId: driver1Id, status: 'Andamento', createdAt: new Date(2024, 6, 20).toISOString(), updatedAt: new Date(2024, 6, 21).toISOString(), base: 'Base SP' },
  { id: '2', name: 'Viagem Volvo FH540 (MER1C01) - 22/07/2024', vehicleId: 'v2', userId: driver2Id, status: 'Finalizado', createdAt: new Date(2024, 6, 15).toISOString(), updatedAt: new Date(2024, 6, 22).toISOString(), finalKm: 16500, totalDistance: 500, base: 'Base RJ' },
  // Add more trips for different drivers/bases if needed
  { id: '3', name: 'Viagem Scania R450 (BRA2E19) - 25/07/2024', vehicleId: 'v1', userId: driver1Id, status: 'Finalizado', createdAt: new Date(2024, 6, 24).toISOString(), updatedAt: new Date(2024, 6, 25).toISOString(), finalKm: 15800, totalDistance: 650, base: 'Base SP' },
];
export { initialTrips }; // Export for Dashboard

export const Trips: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [allTrips, setAllTrips] = useState<Trip[]>(initialTrips); // Store all trips from source
  const [displayedTrips, setDisplayedTrips] = useState<Trip[]>([]); // Trips shown based on role/filter
  const [vehicles, setVehicles] = useState<VehicleInfo[]>(initialVehicles);
  const [drivers, setDrivers] = useState(initialDrivers); // Keep track of drivers for display/filtering
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [tripToFinish, setTripToFinish] = useState<Trip | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const { toast } = useToast();

  const [tripName, setTripName] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  // Add state for filtering (Admin only)
  const [filterBase, setFilterBase] = useState<string>('');
  const [filterDriver, setFilterDriver] = useState<string>('');


  // Function to get unique bases from trips
  const getUniqueBases = (tripsData: Trip[]): string[] => {
      const bases = tripsData.map(trip => trip.base).filter((base): base is string => !!base);
      return Array.from(new Set(bases)).sort();
  };


  useEffect(() => {
      // Initial load and sorting
      const sortedTrips = [...initialTrips].sort((a, b) => {
          if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
          if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setAllTrips(sortedTrips); // Update the master list
  }, []);


  useEffect(() => {
    // Filter and display logic based on role and filters
    let filtered = [...allTrips]; // Start with all sorted trips

    if (isAdmin) {
        // Admin: Apply filters if set
        if (filterBase) {
            filtered = filtered.filter(trip => trip.base === filterBase);
        }
        if (filterDriver) {
            filtered = filtered.filter(trip => trip.userId === filterDriver);
        }
    } else {
        // Driver: Only show their own trips (and their specific base)
        filtered = filtered.filter(trip => trip.userId === user?.id && trip.base === user?.base);
    }
    setDisplayedTrips(filtered);

  }, [user, allTrips, isAdmin, filterBase, filterDriver]); // Re-run when user, master list, or filters change

  const getVehicleDisplay = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
  };

  const getDriverName = (driverId: string) => {
      const driver = drivers.find(d => d.id === driverId);
      return driver ? driver.name : 'Motorista Desconhecido';
  };

  const getTripDescription = (trip: Trip): string => {
      const vehicle = vehicles.find(v => v.id === trip.vehicleId);
      const driverName = isAdmin ? ` - ${getDriverName(trip.userId)}` : ''; // Show driver name for admin
      const baseInfo = trip.base ? ` (Base: ${trip.base})` : '';
      const vehicleInfo = vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : 'Veículo Desconhecido';
      return `${vehicleInfo}${driverName}${baseInfo}`;
  };


  const formatKm = (km?: number): string => km ? km.toLocaleString('pt-BR') + ' Km' : 'N/A';

  const getVisitCount = (tripId: string): number => initialVisits.filter(v => v.tripId === tripId).length;
  const getExpenseCount = (tripId: string): number => initialExpenses.filter(e => e.tripId === tripId).length;
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
    // Determine base - Use user's base
    const base = user?.base || 'Base Padrão'; // Use user's base or a default

    const newTrip: Trip = {
      id: String(Date.now()),
      name: generatedTripName,
      vehicleId: selectedVehicleId,
      userId: user.id,
      status: 'Andamento',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      base: base,
    };
    initialTrips.push(newTrip); // Add to the source mock array
    // Update the master list state, triggering the filtering useEffect
     setAllTrips(prevAllTrips => [newTrip, ...prevAllTrips].sort((a, b) => {
       if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
       if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
       return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
      updatedAt: new Date().toISOString(),
       // Keep the original base, or allow admin to change it if needed
    };

    const index = initialTrips.findIndex(t => t.id === currentTrip.id);
    if (index !== -1) {
      initialTrips[index] = updatedTrip; // Update source mock array
    }

    // Update the master list state, triggering the filtering useEffect
    setAllTrips(prevAllTrips => prevAllTrips.map(trip => trip.id === currentTrip.id ? updatedTrip : trip)
      .sort((a, b) => {
        if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
        if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }));
    resetForm();
    setIsEditModalOpen(false);
    setCurrentTrip(null);
    toast({ title: 'Viagem atualizada com sucesso!' });
  };

  const openFinishModal = (trip: Trip, event: React.MouseEvent) => {
    event.stopPropagation();
    setTripToFinish(trip);
    setIsFinishModalOpen(true);
  };

  const confirmFinishTrip = (tripId: string, finalKm: number, totalDistance: number) => {
    const index = initialTrips.findIndex(t => t.id === tripId);
    if (index === -1) return;

    const updatedTrip: Trip = {
      ...initialTrips[index],
      status: 'Finalizado',
      updatedAt: new Date().toISOString(),
      finalKm: finalKm,
      totalDistance: totalDistance,
    };
    initialTrips[index] = updatedTrip; // Update source mock array

    // Update the master list state, triggering the filtering useEffect
    setAllTrips(prevAllTrips => [...prevAllTrips].map(trip => trip.id === tripId ? updatedTrip : trip)
      .sort((a, b) => {
        if (a.status === 'Andamento' && b.status === 'Finalizado') return -1;
        if (a.status === 'Finalizado' && b.status === 'Andamento') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }));

    setIsFinishModalOpen(false);
    setTripToFinish(null);
    toast({
      title: `Viagem "${updatedTrip.name}" finalizada.`,
      description: `Distância percorrida: ${formatKm(totalDistance)}`,
    });
  };

  const handleDeleteTrip = (tripId: string) => {
    const hasRelatedItems =
      initialVisits.some(v => v.tripId === tripId) ||
      initialExpenses.some(e => e.tripId === tripId) ||
      initialFuelings.some(f => f.tripId === tripId);

    if (hasRelatedItems) {
        toast({
            variant: "destructive",
            title: "Exclusão não permitida",
            description: "Não é possível excluir a viagem pois existem visitas, despesas ou abastecimentos associados.",
            duration: 7000,
        });
        return;
    }

    const index = initialTrips.findIndex(t => t.id === tripId);
    if (index !== -1) {
      initialTrips.splice(index, 1); // Remove from source mock array
    }
    // Update the master list state, triggering the filtering useEffect
    setAllTrips(prevAllTrips => prevAllTrips.filter(trip => trip.id !== tripId));

    if (expandedTripId === tripId) {
      setExpandedTripId(null);
    }
    toast({ title: 'Viagem excluída.' });
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-semibold">
          {isAdmin ? 'Todas as Viagens' : 'Minhas Viagens'}
        </h2>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
           {isAdmin && ( // Filter options for Admin
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                     <Select value={filterBase} onValueChange={(value) => setFilterBase(value === 'all' ? '' : value)}>
                        <SelectTrigger className="w-full sm:w-[180px] h-9">
                            <SelectValue placeholder="Filtrar por Base" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas as Bases</SelectItem>
                            {getUniqueBases(allTrips).map(base => (
                                <SelectItem key={base} value={base}>{base}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                     <Select value={filterDriver} onValueChange={(value) => setFilterDriver(value === 'all' ? '' : value)}>
                        <SelectTrigger className="w-full sm:w-[180px] h-9">
                            <SelectValue placeholder="Filtrar por Motorista" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os Motoristas</SelectItem>
                            {drivers.map(driver => (
                                <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground h-9">
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
                  <p className="text-sm text-muted-foreground">{user?.name || user?.email || 'Não identificado'}</p>
                </div>
                <div className="space-y-2">
                  <Label>Base</Label>
                  <p className="text-sm text-muted-foreground">{user?.base || 'Base Padrão'}</p>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                    <PlayCircle className="h-4 w-4" /> Andamento (Automático)
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
      </div>

      {displayedTrips.length === 0 ? (
        <Card className="text-center py-10 bg-card border border-border">
          <CardContent>
            <p className="text-muted-foreground">
                {isAdmin && (filterBase || filterDriver)
                    ? 'Nenhuma viagem encontrada para os filtros selecionados.'
                    : isAdmin
                    ? 'Nenhuma viagem cadastrada no sistema ainda.'
                    : 'Você ainda não cadastrou nenhuma viagem.'}
            </p>
            {!isAdmin && (
              <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
                Criar sua primeira viagem
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="w-full space-y-4" value={expandedTripId ?? undefined} onValueChange={setExpandedTripId}>
          {displayedTrips.map((trip) => {
            const visitCount = getVisitCount(trip.id);
            const expenseCount = getExpenseCount(trip.id);
            const fuelingCount = getFuelingCount(trip.id);
            return (
              <AccordionItem key={trip.id} value={trip.id} className="border bg-card rounded-lg shadow-sm overflow-hidden">
                 {/* Use a div for the header area to allow flex layout */}
                 <div className="flex justify-between items-center p-4 hover:bg-accent/50 w-full text-left data-[state=open]:border-b">
                     <AccordionTrigger className="flex-1 p-0 hover:no-underline">
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
                            <div className="flex items-center flex-wrap space-x-2 text-xs text-muted-foreground">
                              <span>
                                <MapPin className="h-3 w-3 inline-block mr-1" /> {visitCount} {visitCount === 1 ? 'Visita' : 'Visitas'}
                              </span>
                              <span>
                                <Wallet className="h-3 w-3 inline-block mr-1" /> {expenseCount} {expenseCount === 1 ? 'Despesa' : 'Despesas'}
                              </span>
                              <span>
                                <Fuel className="h-3 w-3 inline-block mr-1" /> {fuelingCount} {fuelingCount === 1 ? 'Abastec.' : 'Abastec.'}
                              </span>
                             {trip.status === 'Finalizado' && trip.totalDistance !== undefined && (
                                <span className="text-emerald-600 font-medium">
                                  <Milestone className="h-3 w-3 inline-block mr-1" /> {formatKm(trip.totalDistance)} Percorridos
                                </span>
                             )}
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                              <span>Início: {new Date(trip.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                              <span>Atualizado: {new Date(trip.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                          </div>
                     </AccordionTrigger>
                     {/* Action buttons moved outside the trigger but within the header flex container */}
                     <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {trip.status === 'Andamento' && (isAdmin || trip.userId === user?.id) && (
                            <Button
                               variant="outline"
                               size="sm"
                               onClick={(e) => openFinishModal(trip, e)}
                               className="h-8 px-2 sm:px-3 text-emerald-600 border-emerald-600/50 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                               <CheckCircle2 className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Finalizar</span>
                            </Button>
                        )}
                        {(isAdmin || trip.userId === user?.id) && (
                           <>
                                <Dialog open={isEditModalOpen && currentTrip?.id === trip.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                                  <DialogTrigger asChild>
                                    {/* Use a simple button for the trigger */}
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
                                        <p className="text-sm text-muted-foreground">{getDriverName(trip.userId)}</p>
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Base</Label>
                                        <p className="text-sm text-muted-foreground">{trip.base}</p>
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
                                    {/* Use a simple button for the trigger */}
                                    <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-destructive h-8 w-8">
                                      <Trash2 className="h-4 w-4" />
                                      <span className="sr-only">Excluir Viagem</span>
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                      <AlertDialogDescription>
                                       Tem certeza que deseja excluir a viagem "{trip.name}"? Esta ação não pode ser desfeita. Certifique-se de que não há visitas, despesas ou abastecimentos associados antes de excluir.
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
                            </>
                         )}
                          {/* Chevron is kept outside the trigger, aligned with buttons */}
                         {/* <ChevronDown className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-180 flex-shrink-0 ml-1 sm:ml-2" /> */}
                     </div>
                 </div>

                <AccordionContent className="p-4 pt-0 bg-secondary/30">
                  <div className="space-y-6">
                    {/* Pass isAdmin prop to child components if they need role-based logic */}
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

       {tripToFinish && (
         <FinishTripDialog
           trip={tripToFinish}
           isOpen={isFinishModalOpen}
           onClose={() => { setIsFinishModalOpen(false); setTripToFinish(null); }}
           onConfirm={confirmFinishTrip}
           initialVisitsData={initialVisits}
         />
       )}
    </div>
  );
};
