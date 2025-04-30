// src/components/Fuelings.tsx
'use client';

import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Eye, Edit, Trash2, Paperclip, Camera, Fuel as FuelIcon, Droplet, Binary, Sigma } from 'lucide-react'; // Use Binary or Droplet for quantity
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Image from 'next/image';

export interface Fueling { // Export interface
  id: string;
  tripId?: string; // Added tripId
  fuelType: 'gasolina' | 'etanol' | 'diesel';
  unitPrice: number;
  quantity: number; // Liters
  totalValue: number; // Calculated
  attachment?: File | string;
  attachmentPreview?: string;
  timestamp: string;
}

// Mock data - Now includes tripId
export const initialFuelings: Fueling[] = [
  { id: 'f1', tripId: '1', fuelType: 'gasolina', unitPrice: 5.89, quantity: 40.5, totalValue: 238.545, timestamp: new Date(2024, 6, 20, 18, 0).toISOString(), attachment: 'https://via.placeholder.com/100x50.png?text=NotaGasolina' , attachmentPreview: 'https://via.placeholder.com/100x50.png?text=NotaGasolina'},
  { id: 'f2', tripId: '2', fuelType: 'diesel', unitPrice: 4.95, quantity: 60.0, totalValue: 297.00, timestamp: new Date(2024, 6, 22, 9, 15).toISOString() },
  { id: 'f3', tripId: '1', fuelType: 'etanol', unitPrice: 3.99, quantity: 35.2, totalValue: 140.448, timestamp: new Date(2024, 7, 23, 11, 45).toISOString() },
];

const fuelTypeLabels = {
  gasolina: 'Gasolina',
  etanol: 'Etanol',
  diesel: 'Diesel',
};

interface FuelingsProps {
  tripId?: string; // Accept tripId as a prop
  tripName?: string; // Optional trip name for context
}

export const Fuelings: React.FC<FuelingsProps> = ({ tripId, tripName }) => {
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] := useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentFueling, setCurrentFueling] = useState<Fueling | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // --- Form State ---
  const [fuelType, setFuelType] = useState<'gasolina' | 'etanol' | 'diesel' | ''>('');
  const [unitPrice, setUnitPrice] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);

  const totalValue = (typeof unitPrice === 'number' && typeof quantity === 'number') ? (unitPrice * quantity) : 0;

   useEffect(() => {
        // Filter fuelings by tripId if provided
        const filtered = tripId ? initialFuelings.filter(f => f.tripId === tripId) : initialFuelings;
        // Sort fuelings by timestamp descending
        setFuelings(filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }, [tripId]); // Rerun when tripId changes


  // --- Handlers ---
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0];
     if (file) {
       setAttachment(file);
       if (file.type.startsWith('image/')) {
         const reader = new FileReader();
         reader.onloadend = () => {
           setAttachmentPreview(reader.result as string);
         };
         reader.readAsDataURL(file);
       } else {
         setAttachmentPreview(null);
       }
     }
     event.target.value = ''; // Reset file input
   };

  const triggerFileInput = () => fileInputRef.current?.click();
  const triggerCameraInput = () => cameraInputRef.current?.click();

  const handleCreateFueling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripId) {
        toast({ variant: "destructive", title: "Erro", description: "ID da viagem não encontrado para associar o abastecimento." });
        return;
    }
    if (!fuelType) {
      toast({ variant: "destructive", title: "Erro", description: "Selecione o tipo de combustível." });
      return;
    }
    if (unitPrice === '' || Number(unitPrice) <= 0 || quantity === '' || Number(quantity) <= 0) {
        toast({ variant: "destructive", title: "Erro", description: "Informe valores válidos para preço e quantidade." });
        return;
      }

    const newFueling: Fueling = {
      id: String(Date.now()),
      tripId: tripId, // Associate with the current trip
      fuelType,
      unitPrice: Number(unitPrice),
      quantity: Number(quantity),
      totalValue: totalValue,
      attachment: attachment || undefined,
      attachmentPreview: attachmentPreview || undefined,
      timestamp: new Date().toISOString(),
    };

    // In a real app, upload file here
    // Add to global mock data
    initialFuelings.push(newFueling);

    // Update local state
     setFuelings(prevFuelings => [newFueling, ...prevFuelings].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: "Abastecimento registrado!" });
  };

   const handleEditFueling = (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentFueling || !fuelType) return;
       if (unitPrice === '' || Number(unitPrice) <= 0 || quantity === '' || Number(quantity) <= 0) {
           toast({ variant: "destructive", title: "Erro", description: "Informe valores válidos para preço e quantidade." });
           return;
         }

      const updatedFueling: Fueling = {
        ...currentFueling,
        fuelType,
        unitPrice: Number(unitPrice),
        quantity: Number(quantity),
        totalValue: totalValue,
        attachment: attachment ? attachment : currentFueling.attachment,
        attachmentPreview: attachment ? attachmentPreview : currentFueling.attachmentPreview,
        // tripId remains the same
      };

      // In a real app, handle file upload/deletion logic here
      // Update global mock data
        const index = initialFuelings.findIndex(f => f.id === currentFueling.id);
        if (index !== -1) {
            initialFuelings[index] = updatedFueling;
        }

      // Update local state
      setFuelings(prevFuelings => prevFuelings.map(f => f.id === currentFueling.id ? updatedFueling : f)
                                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      resetForm();
      setIsEditModalOpen(false);
      setCurrentFueling(null);
      toast({ title: "Abastecimento atualizado!" });
    };

  const handleDeleteFueling = (fuelingId: string) => {
    // In a real app, delete file from storage first
    // Remove from global mock data
    const index = initialFuelings.findIndex(f => f.id === fuelingId);
     if (index !== -1) {
         initialFuelings.splice(index, 1);
     }
    // Remove from local state
    setFuelings(fuelings.filter(f => f.id !== fuelingId));
    toast({ title: "Abastecimento excluído." });
  };

  const openEditModal = (fueling: Fueling) => {
    setCurrentFueling(fueling);
    setFuelType(fueling.fuelType);
    setUnitPrice(fueling.unitPrice);
    setQuantity(fueling.quantity);
    if (!(typeof fueling.attachment === 'string')) {
       setAttachment(fueling.attachment || null);
    } else {
       setAttachment(null);
    }
    setAttachmentPreview(fueling.attachmentPreview || null);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setFuelType('');
    setUnitPrice('');
    setQuantity('');
    setAttachment(null);
    setAttachmentPreview(null);
  };

   const closeCreateModal = () => {
     resetForm();
     setIsCreateModalOpen(false);
   }

   const closeEditModal = () => {
      resetForm();
      setIsEditModalOpen(false);
      setCurrentFueling(null);
    }

   const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
         <h3 className="text-xl font-semibold">
           {tripName ? `Abastecimentos da Viagem: ${tripName}` : 'Abastecimentos'}
         </h3>
         {tripId && ( // Only show button if a trip context is provided
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
               <DialogTrigger asChild>
                 <Button onClick={() => setIsCreateModalOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                   <PlusCircle className="mr-2 h-4 w-4" /> Registrar Abastecimento
                 </Button>
               </DialogTrigger>
               <DialogContent className="sm:max-w-md">
                 <DialogHeader>
                   <DialogTitle>Registrar Abastecimento{tripName ? ` para ${tripName}` : ''}</DialogTitle>
                 </DialogHeader>
                 <form onSubmit={handleCreateFueling} className="grid gap-4 py-4">
                     <div className="space-y-2">
                        <Label htmlFor="fuelType">Combustível</Label>
                        <Select value={fuelType} onValueChange={(value: 'gasolina' | 'etanol' | 'diesel' | '') => setFuelType(value)} required>
                          <SelectTrigger id="fuelType"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gasolina">Gasolina</SelectItem>
                            <SelectItem value="etanol">Etanol</SelectItem>
                            <SelectItem value="diesel">Diesel</SelectItem>
                          </SelectContent>
                        </Select>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label htmlFor="unitPrice">Preço/Litro (R$)</Label>
                           <Input id="unitPrice" type="number" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="0,000" step="0.001" min="0.001"/>
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="quantity">Litros</Label>
                           <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="0,00" step="0.01" min="0.01"/>
                        </div>
                     </div>

                     <div className="space-y-1">
                        <Label>Valor Total Calculado</Label>
                        <p className="text-lg font-semibold text-primary">{formatCurrency(totalValue)}</p>
                     </div>


                     <div className="space-y-2">
                        <Label>Anexo (Nota Fiscal)</Label>
                        <div className="flex gap-2">
                           <Button type="button" variant="outline" onClick={triggerFileInput}><Paperclip className="mr-2 h-4 w-4" /> Anexar</Button>
                           <Button type="button" variant="outline" onClick={triggerCameraInput}><Camera className="mr-2 h-4 w-4" /> Câmera</Button>
                        </div>
                         <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf,image/*" className="hidden" />
                         <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
                         {attachmentPreview && <Image src={attachmentPreview} alt="Preview" width={100} height={100} className="mt-2 rounded border" />}
                         {attachment && !attachmentPreview && <p className="mt-2 text-sm text-muted-foreground">Selecionado: {attachment.name}</p>}
                     </div>

                     <DialogFooter>
                         <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button></DialogClose>
                       <Button type="submit" className="bg-primary hover:bg-primary/90">Salvar Abastecimento</Button>
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
                     <div className="flex items-center gap-3">
                        <FuelIcon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <CardTitle>{fuelTypeLabels[fueling.fuelType]}</CardTitle>
                           <CardDescription>
                             {new Date(fueling.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                           </CardDescription>
                        </div>
                     </div>
                    <div className="flex items-center gap-1">
                          {fueling.attachmentPreview ? ( // Prefer preview for link if available
                              <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:text-primary h-8 w-8">
                                 <a href={fueling.attachmentPreview} target="_blank" rel="noopener noreferrer" title="Ver Nota">
                                    <Paperclip className="h-4 w-4" />
                                    <span className="sr-only">Ver Nota</span>
                                 </a>
                              </Button>
                          ) : typeof fueling.attachment === 'string' ? ( // Fallback to attachment string (URL)
                              <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:text-primary h-8 w-8">
                                 <a href={fueling.attachment} target="_blank" rel="noopener noreferrer" title="Ver Nota">
                                    <Paperclip className="h-4 w-4" />
                                    <span className="sr-only">Ver Nota</span>
                                 </a>
                              </Button>
                          ) : null}
                       {/* Edit Button */}
                       <Dialog open={isEditModalOpen && currentFueling?.id === fueling.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                         <DialogTrigger asChild>
                           <Button variant="ghost" size="icon" onClick={() => openEditModal(fueling)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Editar</span>
                           </Button>
                         </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                             <DialogHeader><DialogTitle>Editar Abastecimento</DialogTitle></DialogHeader>
                             <form onSubmit={handleEditFueling} className="grid gap-4 py-4">
                                <div className="space-y-2">
                                   <Label htmlFor="editFuelType">Combustível</Label>
                                   <Select value={fuelType} onValueChange={(value: 'gasolina' | 'etanol' | 'diesel' | '') => setFuelType(value)} required>
                                     <SelectTrigger id="editFuelType"><SelectValue /></SelectTrigger>
                                     <SelectContent>
                                       <SelectItem value="gasolina">Gasolina</SelectItem>
                                       <SelectItem value="etanol">Etanol</SelectItem>
                                       <SelectItem value="diesel">Diesel</SelectItem>
                                     </SelectContent>
                                   </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                   <div className="space-y-2">
                                      <Label htmlFor="editUnitPrice">Preço/Litro (R$)</Label>
                                      <Input id="editUnitPrice" type="number" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required step="0.001" min="0.001"/>
                                   </div>
                                   <div className="space-y-2">
                                      <Label htmlFor="editQuantity">Litros</Label>
                                      <Input id="editQuantity" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required step="0.01" min="0.01"/>
                                   </div>
                                </div>
                                 <div className="space-y-1">
                                     <Label>Valor Total Calculado</Label>
                                     <p className="text-lg font-semibold text-primary">{formatCurrency(totalValue)}</p>
                                 </div>
                                <div className="space-y-2">
                                   <Label>Anexo</Label>
                                   <div className="flex gap-2">
                                      <Button type="button" variant="outline" onClick={triggerFileInput}><Paperclip className="mr-2 h-4 w-4" /> Alterar</Button>
                                      <Button type="button" variant="outline" onClick={triggerCameraInput}><Camera className="mr-2 h-4 w-4" /> Câmera</Button>
                                   </div>
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf,image/*" className="hidden" />
                                    <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
                                   {attachmentPreview && <Image src={attachmentPreview} alt="Preview" width={100} height={100} className="mt-2 rounded border" />}
                                   {attachment && !attachmentPreview && <p className="mt-2 text-sm text-muted-foreground">Novo: {attachment.name}</p>}
                                   {!attachment && currentFueling?.attachmentPreview && (
                                       <p className="mt-2 text-sm text-muted-foreground">Atual: <a href={currentFueling.attachmentPreview} target="_blank" rel="noreferrer" className="text-primary underline">Ver</a></p>
                                   )}
                                   {!attachment && !currentFueling?.attachmentPreview && typeof currentFueling?.attachment === 'string' && (
                                      <p className="mt-2 text-sm text-muted-foreground">Atual: <a href={currentFueling.attachment} target="_blank" rel="noreferrer" className="text-primary underline">Ver</a></p>
                                   )}
                                </div>
                                <DialogFooter>
                                   <DialogClose asChild><Button type="button" variant="outline" onClick={closeEditModal}>Cancelar</Button></DialogClose>
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
                             <span className="sr-only">Excluir</span>
                           </Button>
                         </AlertDialogTrigger>
                         <AlertDialogContent>
                           <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir este registro de abastecimento ({fueling.quantity.toFixed(2)}L de {fuelTypeLabels[fueling.fuelType]})? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                           <AlertDialogFooter>
                             <AlertDialogCancel>Cancelar</AlertDialogCancel>
                             <AlertDialogAction onClick={() => handleDeleteFueling(fueling.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Excluir</AlertDialogAction>
                           </AlertDialogFooter>
                         </AlertDialogContent>
                       </AlertDialog>
                    </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-sm pt-2">
                   <div className="flex items-center gap-1 text-muted-foreground">
                       <Sigma className="h-4 w-4 flex-shrink-0" />
                       <span>{formatCurrency(fueling.totalValue)}</span>
                   </div>
                   <div className="flex items-center gap-1 text-muted-foreground">
                       <Droplet className="h-4 w-4 flex-shrink-0" />
                       <span>{fueling.quantity.toFixed(2)} L</span>
                   </div>
                   <div className="flex items-center gap-1 text-muted-foreground">
                       <span className="font-mono text-xs">R$</span>
                       <span>{fueling.unitPrice.toFixed(3)} /L</span>
                   </div>
              </CardContent>
            </Card>
          ))}
        </div>
       )}
    </div>
  );
};
