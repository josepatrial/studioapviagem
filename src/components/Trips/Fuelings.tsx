'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Droplet, Loader } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/LoadingSpinner';
export interface Fueling {
  id: string;
  tripId: string;
  vehicleId: string;
  date: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  location: string;
  comments?: string;
}

const initialFuelings: Fueling[] = [
  { id: 'f1', tripId: '1', vehicleId: 'v1', date: new Date(2024, 6, 21).toISOString(), liters: 100, pricePerLiter: 5.8, totalCost: 580, location: 'Posto Exemplo, 123' },
  { id: 'f2', tripId: '1', vehicleId: 'v1', date: new Date(2024, 6, 23).toISOString(), liters: 110, pricePerLiter: 5.9, totalCost: 649, location: 'Posto Principal, 456' },
  { id: 'f3', tripId: '2', vehicleId: 'v2', date: new Date(2024, 6, 25).toISOString(), liters: 120, pricePerLiter: 6.0, totalCost: 720, location: 'Posto Bandeirantes, km 30' },
];

export { initialFuelings };

interface FuelingsProps {
  tripId?: string;
  tripName?: string;
}

export const Fuelings: React.FC<FuelingsProps> = ({ tripId, tripName }) => {
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentFueling, setCurrentFueling] = useState<Fueling | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // --- Form State ---
  const [date, setDate] = useState('');
  const [liters, setLiters] = useState<number | ''>('');
  const [pricePerLiter, setPricePerLiter] = useState<number | ''>('');
  const [location, setLocation] = useState('');
  const [comments, setComments] = useState('');

  useEffect(() => {
    const filtered = tripId ? initialFuelings.filter(f => f.tripId === tripId) : initialFuelings;
    setFuelings(filtered);
  }, [tripId]);

  // --- Helpers ---
  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pt-BR');

  // --- Handlers ---
  const handleCreateFueling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripId) {
      toast({ variant: 'destructive', title: 'Erro', description: 'ID da viagem não encontrado para associar o abastecimento.' });
      return;
    }
    if (!date || liters === '' || pricePerLiter === '' || !location) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Todos os campos são obrigatórios.' });
      return;
    }
    const newFueling: Fueling = {
      id: String(Date.now()),
      tripId,
      vehicleId: 'v1',
      date,
      liters: Number(liters),
      pricePerLiter: Number(pricePerLiter),
      totalCost: Number(liters) * Number(pricePerLiter),
      location,
      comments,
    };
    initialFuelings.push(newFueling);
    setFuelings(prevFuelings => [newFueling, ...prevFuelings]);
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: 'Abastecimento criado com sucesso!' });
  };

  const handleEditFueling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFueling) return;
    if (!date || liters === '' || pricePerLiter === '' || !location) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Todos os campos são obrigatórios.' });
      return;
    }
    const updatedFueling: Fueling = {
      ...currentFueling,
      date,
      liters: Number(liters),
      pricePerLiter: Number(pricePerLiter),
      totalCost: Number(liters) * Number(pricePerLiter),
      location,
      comments,
    };
    const index = initialFuelings.findIndex(f => f.id === currentFueling.id);
    if (index !== -1) {
      initialFuelings[index] = updatedFueling;
    }
    setFuelings(prevFuelings => prevFuelings.map(f => f.id === currentFueling.id ? updatedFueling : f));
    resetForm();
    setIsEditModalOpen(false);
    setCurrentFueling(null);
    toast({ title: 'Abastecimento atualizado com sucesso!' });
  };

  const handleDeleteFueling = (fuelingId: string) => {
    const index = initialFuelings.findIndex(f => f.id === fuelingId);
    if (index !== -1) {
      initialFuelings.splice(index, 1);
    }
    setFuelings(fuelings.filter(f => f.id !== fuelingId));
    toast({ title: 'Abastecimento excluído.' });
  };

  const openEditModal = (fueling: Fueling) => {
    setCurrentFueling(fueling);
    setDate(fueling.date);
    setLiters(fueling.liters);
    setPricePerLiter(fueling.pricePerLiter);
    setLocation(fueling.location);
    setComments(fueling.comments || '');
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setDate('');
    setLiters('');
    setPricePerLiter('');
    setLocation('');
    setComments('');
  };

  const closeCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(false);
  };

  const closeEditModal = () => {
    resetForm();
    setIsEditModalOpen(false);
    setCurrentFueling(null);
  };
    const closeDeleteModal = () => {
        setIsDeleteModalOpen(false);
        setCurrentFueling(null);
      };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">
          {tripName ? `Abastecimentos da Viagem: ${tripName}` : 'Abastecimentos'}
        </h3>
        {tripId && (
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsCreateModalOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <PlusCircle className="mr-2 h-4 w-4" /> Registrar Abastecimento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Registrar Novo Abastecimento{tripName ? ` para ${tripName}` : ''}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateFueling} className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Data do Abastecimento*</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="liters">Litros Abastecidos*</Label>
                  <Input id="liters" type="number" value={liters} onChange={(e) => setLiters(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Quantidade de litros" min="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pricePerLiter">Preço por Litro (R$)*</Label>
                  <Input id="pricePerLiter" type="number" value={pricePerLiter} onChange={(e) => setPricePerLiter(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Preço por litro" min="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Local*</Label>
                  <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Nome ou Endereço do Posto" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comments">Observações</Label>
                  <Textarea id="comments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Detalhes adicionais" />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90">
                    {isLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar Abastecimento
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {fuelings.length === 0 ? (
        <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
          <CardContent>
            <p className="text-muted-foreground">Nenhum abastecimento registrado {tripId ? 'para esta viagem' : ''}.</p>
            {tripId && (
              <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
                Registrar o primeiro abastecimento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {fuelings.map((fueling) => (
            <Card key={fueling.id} className="shadow-sm transition-shadow hover:shadow-md bg-card border border-border">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Abastecimento - {formatDate(fueling.date)}</CardTitle>
                    <CardDescription>
                      {fueling.location}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Dialog open={isEditModalOpen && currentFueling?.id === fueling.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(fueling)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Editar</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Editar Abastecimento</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleEditFueling} className="grid gap-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="editDate">Data do Abastecimento*</Label>
                            <Input id="editDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="editLiters">Litros Abastecidos*</Label>
                            <Input id="editLiters" type="number" value={liters} onChange={(e) => setLiters(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Quantidade de litros" min="0" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="editPricePerLiter">Preço por Litro (R$)*</Label>
                            <Input id="editPricePerLiter" type="number" value={pricePerLiter} onChange={(e) => setPricePerLiter(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Preço por litro" min="0" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="editLocation">Local*</Label>
                            <Input id="editLocation" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Nome ou Endereço do Posto" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="editComments">Observações</Label>
                            <Textarea id="editComments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Detalhes adicionais" />
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
                      <AlertDialog open={isDeleteModalOpen && currentFueling?.id === fueling.id} onOpenChange={(isOpen) => !isOpen && closeDeleteModal()}>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => {
                              setCurrentFueling(fueling);
                              setIsDeleteModalOpen(true);
                            }}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir este abastecimento? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteFueling(fueling.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Droplet className="h-4 w-4 flex-shrink-0 text-blue-500" />
                  <span>{fueling.liters.toFixed(2)} Litros</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Preço por litro:</span> {formatCurrency(fueling.pricePerLiter)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Total:</span> {formatCurrency(fueling.totalCost)}
                </div>
                {fueling.comments && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Observações:</span> {fueling.comments}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};