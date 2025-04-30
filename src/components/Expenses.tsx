// src/components/Expenses.tsx
'use client';

import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Eye, Edit, Trash2, Paperclip, Camera, Utensils, Hotel, Car, WalletCards } from 'lucide-react'; // Changed Wallet to WalletCards
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import Image from 'next/image'; // Import next/image

export interface Expense { // Export interface
  id: string;
  tripId?: string; // Added tripId
  type: 'alimentacao' | 'hotel' | 'pedagio' | 'outro';
  value: number;
  description: string;
  attachment?: File | string; // File object for new uploads, string (URL/path) for existing
  attachmentPreview?: string; // For image preview
  timestamp: string;
}

// Mock data - Now includes tripId
export const initialExpenses: Expense[] = [
  { id: 'e1', tripId: '1', type: 'alimentacao', value: 55.50, description: 'Almoço posto X', timestamp: new Date(2024, 6, 21, 12, 30).toISOString() },
  { id: 'e2', tripId: '1', type: 'pedagio', value: 12.80, description: 'Pedágio BR-116 km 50', timestamp: new Date(2024, 6, 21, 15, 0).toISOString(), attachment: 'https://via.placeholder.com/100x50.png?text=ReciboPedagio' , attachmentPreview: 'https://via.placeholder.com/100x50.png?text=ReciboPedagio'},
  { id: 'e3', tripId: '2', type: 'hotel', value: 180.00, description: 'Pernoite Hotel Central', timestamp: new Date(2024, 6, 22, 8, 0).toISOString() },
  { id: 'e4', tripId: '2', type: 'outro', value: 35.00, description: 'Material de escritório', timestamp: new Date(2024, 8, 1, 17, 0).toISOString() },
];

// Map expense types to icons and labels
const expenseTypeDetails = {
  alimentacao: { icon: Utensils, label: 'Alimentação' },
  hotel: { icon: Hotel, label: 'Hotel' },
  pedagio: { icon: Car, label: 'Pedágio' },
  outro: { icon: WalletCards, label: 'Outro' }, // Changed Wallet to WalletCards
};

interface ExpensesProps {
  tripId?: string; // Accept tripId as a prop
  tripName?: string; // Optional trip name for context
}

export const Expenses: React.FC<ExpensesProps> = ({ tripId, tripName }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentExpense, setCurrentExpense] = useState<Expense | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // --- Form State ---
  const [expenseType, setExpenseType] = useState<'alimentacao' | 'hotel' | 'pedagio' | 'outro' | ''>('');
  const [expenseValue, setExpenseValue] = useState<number | ''>('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null); // For image previews

   useEffect(() => {
      // Filter expenses by tripId if provided
      const filtered = tripId ? initialExpenses.filter(ex => ex.tripId === tripId) : initialExpenses;
      // Sort expenses by timestamp descending
      setExpenses(filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
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
        setAttachmentPreview(null); // Clear preview if not an image
      }
    }
     event.target.value = ''; // Reset file input
  };

  const triggerFileInput = () => fileInputRef.current?.click();
  const triggerCameraInput = () => cameraInputRef.current?.click();

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
     if (!tripId) {
         toast({ variant: "destructive", title: "Erro", description: "ID da viagem não encontrado para associar a despesa." });
         return;
     }
    if (!expenseType) {
      toast({ variant: "destructive", title: "Erro", description: "Selecione o tipo de despesa." });
      return;
    }
    if (expenseValue === '' || Number(expenseValue) <= 0) {
        toast({ variant: "destructive", title: "Erro", description: "Informe um valor válido para a despesa." });
        return;
      }

    const newExpense: Expense = {
      id: String(Date.now()),
      tripId: tripId, // Associate with the current trip
      type: expenseType,
      value: Number(expenseValue),
      description: expenseDescription,
      attachment: attachment || undefined, // Store File object directly for now
      attachmentPreview: attachmentPreview || undefined,
      timestamp: new Date().toISOString(),
    };

    // In a real app, upload the file here and store the URL/path in newExpense.attachment
    // Add to global mock data
    initialExpenses.push(newExpense);

    // Update local state
    setExpenses(prevExpenses => [newExpense, ...prevExpenses].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    resetForm();
    setIsCreateModalOpen(false);
    toast({ title: "Despesa registrada com sucesso!" });
  };

   const handleEditExpense = (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentExpense || !expenseType) return;
     if (expenseValue === '' || Number(expenseValue) <= 0) {
        toast({ variant: "destructive", title: "Erro", description: "Informe um valor válido para a despesa." });
        return;
      }

     const updatedExpense: Expense = {
       ...currentExpense,
       type: expenseType,
       value: Number(expenseValue),
       description: expenseDescription,
       // Handle attachment update:
       // If a new attachment exists, use it (and potentially delete the old one in backend)
       // Otherwise, keep the existing attachment URL/path
       attachment: attachment ? attachment : currentExpense.attachment,
       attachmentPreview: attachment ? attachmentPreview : currentExpense.attachmentPreview,
       // tripId remains the same
     };

     // In a real app, handle file upload/deletion logic here
     // Update global mock data
      const index = initialExpenses.findIndex(ex => ex.id === currentExpense.id);
      if (index !== -1) {
          initialExpenses[index] = updatedExpense;
      }

     // Update local state
     setExpenses(prevExpenses => prevExpenses.map(ex => ex.id === currentExpense.id ? updatedExpense : ex)
                                         .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
     resetForm();
     setIsEditModalOpen(false);
     setCurrentExpense(null);
     toast({ title: "Despesa atualizada com sucesso!" });
   };


  const handleDeleteExpense = (expenseId: string) => {
    // In a real app, delete the associated file from storage first
    // Remove from global mock data
    const index = initialExpenses.findIndex(ex => ex.id === expenseId);
     if (index !== -1) {
         initialExpenses.splice(index, 1);
     }
    // Remove from local state
    setExpenses(expenses.filter(ex => ex.id !== expenseId));
    toast({ title: "Despesa excluída." });
  };

  const openEditModal = (expense: Expense) => {
    setCurrentExpense(expense);
    setExpenseType(expense.type);
    setExpenseValue(expense.value);
    setExpenseDescription(expense.description);
    // If attachment is a URL string, don't set the File state
    if (!(typeof expense.attachment === 'string')) {
       setAttachment(expense.attachment || null);
    } else {
       setAttachment(null); // Clear file input state if editing an existing URL attachment
    }
    setAttachmentPreview(expense.attachmentPreview || null);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setExpenseType('');
    setExpenseValue('');
    setExpenseDescription('');
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
      setCurrentExpense(null);
    }

   // Helper to format currency
   const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

   // Get Icon for expense type
   const getTypeIcon = (type: Expense['type']) => {
       const IconComponent = expenseTypeDetails[type]?.icon || WalletCards; // Default to WalletCards
       return <IconComponent className="h-4 w-4 text-muted-foreground" />;
   }
    const getTypeName = (type: Expense['type']) => {
       return expenseTypeDetails[type]?.label || 'Despesa';
   }


  return (
    <div className="space-y-6">
       
        <h3 className="text-xl font-semibold">
          {tripName ? `Despesas da Viagem: ${tripName}` : 'Despesas'}
        </h3>
         {tripId && (
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
               <DialogTrigger asChild>
                 <Button onClick={() => setIsCreateModalOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                   <PlusCircle className="mr-2 h-4 w-4" /> Registrar Despesa
                 </Button>
               </DialogTrigger>
               <DialogContent className="sm:max-w-md">
                 <DialogHeader>
                    <DialogTitle>Registrar Despesa{tripName ? ` para ${tripName}` : ''}</DialogTitle>
                 </DialogHeader>
                 <form onSubmit={handleCreateExpense} className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="expenseType">Tipo de Despesa</Label>
                         <Select value={expenseType} onValueChange={(value: Expense['type'] | '') => setExpenseType(value)} required>
                           <SelectTrigger id="expenseType">
                             <SelectValue placeholder="Selecione o tipo" />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="alimentacao">Alimentação</SelectItem>
                             <SelectItem value="hotel">Hotel</SelectItem>
                             <SelectItem value="pedagio">Pedágio</SelectItem>
                             <SelectItem value="outro">Outro</SelectItem>
                           </SelectContent>
                         </Select>
                    </div>

                     <div className="space-y-2">
                        <Label htmlFor="expenseValue">Valor (R$)</Label>
                        <Input id="expenseValue" type="number" value={expenseValue} onChange={(e) => setExpenseValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="0,00" step="0.01" min="0.01" />
                     </div>

                     <div className="space-y-2">
                        <Label htmlFor="expenseDescription">Descrição</Label>
                        <Textarea id="expenseDescription" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} required placeholder="Ex: Almoço no restaurante X, Pedágio Y..." />
                     </div>

                     <div className="space-y-2">
                        <Label>Anexo (Comprovante)</Label>
                        <div className="flex gap-2">
                           <Button type="button" variant="outline" onClick={triggerFileInput}>
                              <Paperclip className="mr-2 h-4 w-4" /> Anexar Arquivo
                           </Button>
                           <Button type="button" variant="outline" onClick={triggerCameraInput}>
                              <Camera className="mr-2 h-4 w-4" /> Usar Câmera
                           </Button>
                        </div>
                         <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf,image/*" className="hidden" />
                         <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />

                        {attachmentPreview && (
                             
                                 <p className="text-sm text-muted-foreground mb-1">Pré-visualização:</p>
                                 <Image src={attachmentPreview} alt="Preview" width={100} height={100} className="rounded border" />
                             
                         )}
                         {attachment && !attachmentPreview && (
                              <p className="mt-2 text-sm text-muted-foreground">Arquivo selecionado: {attachment.name}</p>
                         )}
                     </div>


                     <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button></DialogClose>
                       <Button type="submit" className="bg-primary hover:bg-primary/90">Salvar Despesa</Button>
                     </DialogFooter>
                 </form>
               </DialogContent>
             </Dialog>
         )}
      
      

      {expenses.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhuma despesa registrada {tripId ? 'para esta viagem' : ''}.</p>
              {tripId && (
                 <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
                   Registrar a primeira despesa
                </Button>
              )}
           </CardContent>
         </Card>
       ) : (
        
          {expenses.map((expense) => (
            <Card key={expense.id} className="shadow-sm transition-shadow hover:shadow-md bg-card border border-border">
              <CardHeader>
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                       {getTypeIcon(expense.type)}
                       
                         <CardTitle>{getTypeName(expense.type)}</CardTitle>
                         <CardDescription>
                           {new Date(expense.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                         </CardDescription>
                       
                    </div>
                    <div className="flex items-center gap-1">
                        {/* Attachment Indicator/Link */}
                        {expense.attachmentPreview ? ( // Prefer preview for link if available
                           <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:text-primary h-8 w-8">
                               <a href={expense.attachmentPreview} target="_blank" rel="noopener noreferrer" title="Ver Anexo">
                                  <Paperclip className="h-4 w-4" />
                                  <span className="sr-only">Ver Anexo</span>
                               </a>
                           </Button>
                        ) : typeof expense.attachment === 'string' ? ( // Fallback to attachment string (URL)
                           <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:text-primary h-8 w-8">
                              <a href={expense.attachment} target="_blank" rel="noopener noreferrer" title="Ver Anexo">
                                 <Paperclip className="h-4 w-4" />
                                 <span className="sr-only">Ver Anexo</span>
                              </a>
                           </Button>
                        ) : null}
                       {/* Edit Button */}
                       <Dialog open={isEditModalOpen && currentExpense?.id === expense.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                         <DialogTrigger asChild>
                           <Button variant="ghost" size="icon" onClick={() => openEditModal(expense)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Editar</span>
                           </Button>
                         </DialogTrigger>
                           <DialogContent className="sm:max-w-md">
                             <DialogHeader><DialogTitle>Editar Despesa</DialogTitle></DialogHeader>
                             <form onSubmit={handleEditExpense} className="grid gap-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="editExpenseType">Tipo</Label>
                                   <Select value={expenseType} onValueChange={(value: Expense['type'] | '') => setExpenseType(value)} required>
                                       <SelectTrigger id="editExpenseType"><SelectValue /></SelectTrigger>
                                       <SelectContent>
                                         <SelectItem value="alimentacao">Alimentação</SelectItem>
                                         <SelectItem value="hotel">Hotel</SelectItem>
                                         <SelectItem value="pedagio">Pedágio</SelectItem>
                                         <SelectItem value="outro">Outro</SelectItem>
                                       </SelectContent>
                                     </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editExpenseValue">Valor (R$)</Label>
                                    <Input id="editExpenseValue" type="number" value={expenseValue} onChange={(e) => setExpenseValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required step="0.01" min="0.01" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editExpenseDescription">Descrição</Label>
                                    <Textarea id="editExpenseDescription" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} required />
                                </div>
                                 <div className="space-y-2">
                                      <Label>Anexo</Label>
                                      <div className="flex gap-2">
                                         <Button type="button" variant="outline" onClick={triggerFileInput}><Paperclip className="mr-2 h-4 w-4" /> Alterar Arquivo</Button>
                                         <Button type="button" variant="outline" onClick={triggerCameraInput}><Camera className="mr-2 h-4 w-4" /> Usar Câmera</Button>
                                      </div>
                                       <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf,image/*" className="hidden" />
                                       <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
                                      {attachmentPreview && <Image src={attachmentPreview} alt="Preview" width={100} height={100} className="mt-2 rounded border" />}
                                      {attachment && !attachmentPreview && <p className="mt-2 text-sm text-muted-foreground">Novo: {attachment.name}</p>}
                                       {!attachment && currentExpense?.attachmentPreview && (
                                          <p className="mt-2 text-sm text-muted-foreground">Anexo atual: <a href={currentExpense.attachmentPreview} target="_blank" rel="noreferrer" className="text-primary underline">Ver</a></p>
                                       )}
                                      {!attachment && !currentExpense?.attachmentPreview && typeof currentExpense?.attachment === 'string' && (
                                         <p className="mt-2 text-sm text-muted-foreground">Anexo atual: <a href={currentExpense.attachment} target="_blank" rel="noreferrer" className="text-primary underline">Ver</a></p>
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
                           <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir esta despesa de {formatCurrency(expense.value)}? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                           <AlertDialogFooter>
                             <AlertDialogCancel>Cancelar</AlertDialogCancel>
                             <AlertDialogAction onClick={() => handleDeleteExpense(expense.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Excluir</AlertDialogAction>
                           </AlertDialogFooter>
                         </AlertDialogContent>
                       </AlertDialog>
                    </div>
                </div>
              </CardHeader>
              <CardContent>
                 <CardDescription>
                    Descrição: {expense.description}
                 </CardDescription>
                 <CardDescription>
                    Valor: {formatCurrency(expense.value)}
                  </CardDescription>
                  <CardDescription>
                    Tipo: {expense.type}
                  </CardDescription>
                  <CardDescription>
                    TripID: {expense.tripId}
                  </CardDescription>
              </CardContent>
            </Card>
          ))}
        
       )}
    </div>
  );
};
