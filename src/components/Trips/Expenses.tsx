'use client';

import React, { useEffect, useState } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '@/components/ui/card';
import {
    AlertTriangle,
    CalendarDays,
    Edit,
    Eye,
    Info,
    PlusCircle,
    Trash2,
    // Wallet, // Ensure Wallet is imported if used, or remove if not
  } from 'lucide-react';
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
import {
    Button
  } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
  } from '@/components/ui/dialog';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar'; // Ensure Calendar is imported
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'; // Ensure Popover components are imported
import { cn } from '@/lib/utils'; // Ensure cn is imported

export interface Expense {
    id: string;
    tripId?: string;
    description: string;
    value: number;
    expenseDate: string;
    timestamp: string;
    expenseType: string; // New field
};

// Mock data - Exported for use in Trips.tsx
export const initialExpenses: Expense[] = [
    { id: 'e1', tripId: '1', description: 'Pedágio da Imigrantes', value: 28.00, expenseDate: new Date(2024, 6, 21).toISOString(), timestamp: new Date(2024, 6, 21, 10, 30).toISOString(), expenseType: 'Pedágio' },
    { id: 'e2', tripId: '1', description: 'Almoço no Frango Assado', value: 45.00, expenseDate: new Date(2024, 6, 21).toISOString(), timestamp: new Date(2024, 6, 21, 14, 0).toISOString(), expenseType: 'Alimentação' },
    { id: 'e3', tripId: '2', description: 'Combustível no Graal', value: 500.00, expenseDate: new Date(2024, 8, 2).toISOString(), timestamp: new Date(2024, 8, 2, 9, 0).toISOString(), expenseType: 'Combustível' },
];

const expenseTypes = ['Pedágio', 'Alimentação', 'Hospedagem', 'Combustível', 'Manutenção', 'Outros'];

export const Expenses: React.FC<{ tripId?: string; tripName?: string; }> = ({ tripId, tripName }) => {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [currentExpense, setCurrentExpense] = useState<Expense | null>(null);
    const [expenseToConfirm, setExpenseToConfirm] = useState<Expense | null>(null);
    const { toast } = useToast();

    // --- Form State ---
    const [description, setDescription] = useState('');
    const [value, setValue] = useState<number | ''>('');
    const [expenseType, setExpenseType] = useState('');
    const [expenseDate, setExpenseDate] = useState<Date | undefined>(undefined);

    useEffect(() => {
        const filtered = tripId ? initialExpenses.filter(e => e.tripId === tripId) : initialExpenses;
        setExpenses(filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, [tripId]);

    // --- Helpers ---
    const formatCurrency = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        // Add timezone adjustment if needed, for now use UTC interpretation
        return format(date, 'dd/MM/yyyy');
    }

    // --- Handlers ---
    const handlePrepareExpenseForConfirmation = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tripId) {
            toast({ variant: 'destructive', title: 'Erro', description: 'ID da viagem não encontrado para associar a despesa.' });
            return;
        }
        if (!description || value === '' || !expenseDate || !expenseType) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Todos os campos marcados com * são obrigatórios.' });
            return;
        }
        const valueNumber = Number(value);

        if (valueNumber <= 0) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Valor da despesa deve ser maior que zero.' });
            return;
        }

        const newExpense: Expense = {
            id: String(Date.now()),
            tripId: tripId,
            description,
            value: valueNumber,
            expenseDate: expenseDate.toISOString(),
            timestamp: new Date().toISOString(),
            expenseType
        };

        setExpenseToConfirm(newExpense);
        setIsCreateModalOpen(false);
        setIsConfirmModalOpen(true);
    };

    const confirmAndSaveExpense = () => {
        if (!expenseToConfirm) return;
        // In a real app, save to backend first
        initialExpenses.push(expenseToConfirm); // Add to mock data source
        setExpenses(prevExpenses => [expenseToConfirm, ...prevExpenses].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        resetForm();
        setIsConfirmModalOpen(false);
        setExpenseToConfirm(null);
        toast({ title: "Despesa criada com sucesso!" });
    };

    const handleEditExpense = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentExpense) return;

        if (!description || value === '' || !expenseDate || !expenseType) {
            toast({ variant: "destructive", title: "Erro", description: "Todos os campos marcados com * são obrigatórios." });
            return;
        }

        const valueNumber = Number(value);
        if (valueNumber <= 0) {
            toast({ variant: "destructive", title: "Erro", description: "Valor da despesa deve ser maior que zero." });
            return;
        }

        const updatedExpense: Expense = {
            ...currentExpense,
            description,
            value: valueNumber,
            expenseDate: expenseDate.toISOString(),
            expenseType,
            // Keep original timestamp or update if needed:
            // timestamp: new Date().toISOString(),
        };

        // Update mock data source
        const index = initialExpenses.findIndex(e => e.id === currentExpense.id);
        if (index !== -1) {
            initialExpenses[index] = updatedExpense;
        }

        // Update local state
        setExpenses(prevExpenses => prevExpenses.map(e => e.id === currentExpense.id ? updatedExpense : e).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        resetForm();
        setIsEditModalOpen(false);
        setCurrentExpense(null);
        toast({ title: "Despesa atualizada com sucesso!" });
    };

    const handleDeleteExpense = (expenseId: string) => {
        // Delete from mock data source
        const index = initialExpenses.findIndex(e => e.id === expenseId);
        if (index !== -1) {
            initialExpenses.splice(index, 1);
        }
        // Update local state
        setExpenses(expenses.filter(e => e.id !== expenseId));
        toast({ title: "Despesa excluída." });
    };

    const openEditModal = (expense: Expense) => {
        setCurrentExpense(expense);
        setDescription(expense.description);
        setValue(expense.value);
        setExpenseType(expense.expenseType);
        setExpenseDate(new Date(expense.expenseDate));
        setIsEditModalOpen(true);
    };

    const resetForm = () => {
        setDescription('');
        setValue('');
        setExpenseType('');
        setExpenseDate(undefined);
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

    const closeConfirmModal = () => {
        setIsConfirmModalOpen(false);
        setExpenseToConfirm(null);
        // Optional: Re-open create modal if needed
        // setIsCreateModalOpen(true);
    }

    // Component JSX return statement starts here
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">
                        {tripName ? `Despesas da Viagem: ${tripName}` : 'Despesas'}
                    </h3>
                    {tripId && ( // Only show button if a trip context is provided
                        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={() => { resetForm(); setExpenseDate(new Date()); setIsCreateModalOpen(true); }} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                                    <PlusCircle className="mr-2 h-4 w-4" /> Registrar Despesa
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>Registrar Nova Despesa{tripName ? ` para ${tripName}` : ''}</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handlePrepareExpenseForConfirmation} className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Descrição*</Label>
                                        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Ex: Pedágio, Alimentação, Hospedagem..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="value">Valor (R$)*</Label>
                                        <Input id="value" type="number" value={value} onChange={(e) => setValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Valor da despesa" min="0" step="0.01" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="expenseType">Tipo de Despesa*</Label>
                                        <Select onValueChange={setExpenseType} value={expenseType} required>
                                            <SelectTrigger id="expenseType">
                                                <SelectValue placeholder="Selecione o tipo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {expenseTypes.map((type) => (
                                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Data da Despesa*</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal",
                                                        !expenseDate && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarDays className="mr-2 h-4 w-4" />
                                                    {expenseDate ? format(expenseDate, "dd/MM/yyyy") : <span>Selecione a data</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar
                                                    mode="single"
                                                    selected={expenseDate}
                                                    onSelect={setExpenseDate}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <DialogFooter>
                                        <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button></DialogClose>
                                        <Button type="submit" className="bg-primary hover:bg-primary/90">Confirmar Dados</Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}
            </div>

            {/* Confirmation Dialog */}
            <AlertDialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-500" /> Confirmar Dados da Despesa
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Por favor, revise os dados abaixo antes de salvar.
                            <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-foreground">
                                <li><strong>Descrição:</strong> {expenseToConfirm?.description}</li>
                                <li><strong>Valor:</strong> {expenseToConfirm ? formatCurrency(expenseToConfirm.value) : 'N/A'}</li>
                                <li><strong>Tipo:</strong> {expenseToConfirm?.expenseType}</li>
                                <li><strong>Data:</strong> {expenseToConfirm?.expenseDate ? formatDate(expenseToConfirm?.expenseDate) : 'N/A'}</li>
                            </ul>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                            setIsConfirmModalOpen(false);
                            setIsCreateModalOpen(true); // Re-open create modal to allow editing
                        }}>Voltar e Editar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmAndSaveExpense} className="bg-primary hover:bg-primary/90">Salvar Despesa</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Expenses List */}
            {expenses.length === 0 ? (
                <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
                    <CardContent>
                        <p className="text-muted-foreground">Nenhuma despesa registrada {tripId ? 'para esta viagem' : ''}.</p>
                        {tripId && (
                            <Button variant="link" onClick={() => { resetForm(); setExpenseDate(new Date()); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
                                Registrar a primeira despesa
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {expenses.map((expense) => (
                        <Card key={expense.id} className="shadow-sm transition-shadow hover:shadow-md bg-card border border-border">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle>{expense.expenseType} - {formatCurrency(expense.value)}</CardTitle>
                                        <CardDescription>
                                            {formatDate(expense.expenseDate)}
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-1">
                                        {/* View/Details Button (Optional, opens a non-editable modal or expands) */}
                                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8">
                                            <Eye className="h-4 w-4" />
                                            <span className="sr-only">Visualizar Detalhes</span>
                                        </Button>

                                        {/* Edit Button */}
                                        <Dialog open={isEditModalOpen && currentExpense?.id === expense.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={() => openEditModal(expense)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
                                                    <Edit className="h-4 w-4" />
                                                    <span className="sr-only">Editar</span>
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-lg">
                                                <DialogHeader><DialogTitle>Editar Despesa</DialogTitle></DialogHeader>
                                                <form onSubmit={handleEditExpense} className="grid gap-4 py-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="editDescription">Descrição*</Label>
                                                        <Textarea id="editDescription" value={description} onChange={(e) => setDescription(e.target.value)} required />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="editValue">Valor (R$)*</Label>
                                                        <Input id="editValue" type="number" value={value} onChange={(e) => setValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required min="0" step="0.01" />
                                                    </div>
                                                     <div className="space-y-2">
                                                        <Label htmlFor="editExpenseType">Tipo de Despesa*</Label>
                                                        <Select onValueChange={setExpenseType} value={expenseType} required>
                                                            <SelectTrigger id="editExpenseType">
                                                                <SelectValue placeholder="Selecione o tipo" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {expenseTypes.map((type) => (
                                                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Data da Despesa*</Label>
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <Button
                                                                    variant={"outline"}
                                                                    className={cn(
                                                                        "w-full justify-start text-left font-normal",
                                                                        !expenseDate && "text-muted-foreground"
                                                                    )}
                                                                >
                                                                    <CalendarDays className="mr-2 h-4 w-4" />
                                                                    {expenseDate ? format(expenseDate, "dd/MM/yyyy") : <span>Selecione a data</span>}
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-auto p-0">
                                                                <Calendar
                                                                    mode="single"
                                                                    selected={expenseDate}
                                                                    onSelect={setExpenseDate}
                                                                    initialFocus
                                                                />
                                                            </PopoverContent>
                                                        </Popover>
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
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Tem certeza que deseja excluir esta despesa ({expense.description})? Esta ação não pode ser desfeita.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteExpense(expense.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Excluir</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-1 text-sm">
                                {/* Removed redundant display of value/date, keep description */}
                                <div className="flex items-center gap-2">
                                    <Info className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    <span>{expense.description}</span>
                                </div>
                                {/* Add timestamp if needed */}
                                {/* <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <CalendarDays className="h-3 w-3 flex-shrink-0" />
                                    <span>Registrado em: {new Date(expense.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short'})}</span>
                                </div> */}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    ); // End of return statement
}; // End of component function definition
