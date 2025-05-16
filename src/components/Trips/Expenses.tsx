// src/components/Trips/Expenses.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
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
    Wallet,
    Paperclip,
    Camera,
    Upload,
    Check,
    X,
    Loader2
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
  } from '@/components/ui/alert-dialog'; // Removed AlertDialogTrigger as it's used inside a Dialog
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import {
   addLocalExpense,
   updateLocalExpense,
   deleteLocalExpense,
   getLocalExpenses,
   LocalExpense,
   getLocalExpenseTypes,
} from '@/services/localDbService';
import { uploadReceipt, deleteReceipt } from '@/services/storageService';

export interface Expense extends Omit<LocalExpense, 'localId' | 'tripLocalId'> {
    id: string;
    tripId: string;
    userId: string;
    syncStatus?: 'pending' | 'synced' | 'error';
}

// const expenseTypes = ['Pedágio', 'Alimentação', 'Hospedagem', 'Combustível', 'Manutenção', 'Outros']; // Removed hardcoded

interface ExpensesProps {
  tripId: string;
  ownerUserId: string;
}

export const Expenses: React.FC<ExpensesProps> = ({ tripId: tripLocalId, ownerUserId }) => {
    console.log("[ExpensesComponent props] tripId:", tripLocalId, "ownerUserId:", ownerUserId);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentExpense, setCurrentExpense] = useState<Expense | null>(null);
    const [expenseToConfirm, setExpenseToConfirm] = useState<Omit<LocalExpense, 'localId' | 'syncStatus'> & { attachment?: File | string | null } | null>(null);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [description, setDescription] = useState('');
    const [value, setValue] = useState<number | ''>('');
    const [expenseType, setExpenseType] = useState('');
    const [expenseDate, setExpenseDate] = useState<Date | undefined>(undefined);

    const [attachment, setAttachment] = useState<File | string | null>(null);
    const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

    const [availableExpenseTypes, setAvailableExpenseTypes] = useState<string[]>([]);
    const [loadingExpenseTypes, setLoadingExpenseTypes] = useState(true);

    useEffect(() => {
        const fetchExpensesData = async () => {
            if (!tripLocalId) return;
            setLoading(true);
            try {
                const localExpenses = await getLocalExpenses(tripLocalId);
                const uiExpenses = localExpenses.map(le => ({
                    ...le,
                    id: le.firebaseId || le.localId,
                    tripId: le.tripLocalId,
                    userId: le.userId || ownerUserId,
                    syncStatus: le.syncStatus
                }));
                setExpenses(uiExpenses);
            } catch (error) {
                console.error(`Error fetching local expenses for trip ${tripLocalId}:`, error);
                toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar as despesas locais." });
            } finally {
                setLoading(false);
            }
        };
        fetchExpensesData();

        setLoadingExpenseTypes(true);
        getLocalExpenseTypes()
            .then(types => {
                setAvailableExpenseTypes(['Outros', ...types]); // Ensure "Outros" is always an option
            })
            .catch(err => {
                console.error("Failed to load expense types:", err);
                setAvailableExpenseTypes(['Outros']); // Fallback
                toast({ variant: 'destructive', title: 'Erro ao carregar tipos de despesa' });
            })
            .finally(() => setLoadingExpenseTypes(false));

    }, [tripLocalId, ownerUserId, toast]);

    useEffect(() => {
         if (!isCameraOpen) {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
                videoRef.current.srcObject = null;
            }
            setHasCameraPermission(null);
            return;
        }

        const getCameraPermission = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                setHasCameraPermission(true);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (error) {
                console.error('Error accessing camera:', error);
                setHasCameraPermission(false);
                toast({
                    variant: 'destructive',
                    title: 'Acesso à Câmera Negado',
                    description: 'Por favor, habilite as permissões de câmera nas configurações do seu navegador.',
                });
            }
        };

        getCameraPermission();

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [isCameraOpen, toast]);


    const formatCurrency = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDateDisplay = (dateString: string) => {
        try {
             const date = new Date(dateString);
             return format(date, 'dd/MM/yyyy');
        } catch {
            return 'Data inválida'
        }
    }

     const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
                setAttachment(file);
                setAttachmentFilename(file.name);
                setIsCameraOpen(false);
            } else {
                toast({ variant: "destructive", title: "Tipo de arquivo inválido", description: "Por favor, selecione um PDF ou imagem (JPG, PNG, GIF)." });
                event.target.value = '';
            }
        }
    };

    const handleCaptureImage = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageDataUrl = canvas.toDataURL('image/png');
                setAttachment(imageDataUrl);
                setAttachmentFilename(`scan_${Date.now()}.png`);
                setIsCameraOpen(false);
            }
        }
    };

    const clearAttachment = () => {
        setAttachment(null);
        setAttachmentFilename(null);
        const fileInput = document.getElementById('createReceiptPdf') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
        const editFileInput = document.getElementById('editReceiptPdf') as HTMLInputElement | null;
        if (editFileInput) editFileInput.value = '';
    };

    const handlePrepareExpenseForConfirmation = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("[ExpensesComponent] handlePrepareExpenseForConfirmation called with data:", { description, value, expenseDate, expenseType, attachmentFilename, ownerUserId });

        if (!description || value === '' || !expenseDate || !expenseType) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Todos os campos marcados com * são obrigatórios.' });
            return;
        }
        const valueNumber = Number(value);
        if (valueNumber <= 0) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Valor da despesa deve ser maior que zero.' });
            return;
        }

        const newExpenseData: Omit<LocalExpense, 'localId' | 'syncStatus' | 'receiptUrl' | 'receiptPath'> = {
            tripLocalId: tripLocalId,
            userId: ownerUserId,
            description,
            value: valueNumber,
            expenseDate: expenseDate.toISOString(),
            timestamp: new Date().toISOString(),
            expenseType,
            receiptFilename: attachmentFilename || undefined,
            deleted: false,
        };

        setExpenseToConfirm({ ...newExpenseData, attachment: attachment });
        setIsCreateModalOpen(false);
        setIsConfirmModalOpen(true);
    };

    const confirmAndSaveExpense = async () => {
        if (!expenseToConfirm) return;
        console.log("[ExpensesComponent] Attempting to save new expense locally:", expenseToConfirm);

        setIsSaving(true);
        const { attachment: tempAttachment, ...dataToSaveBase } = expenseToConfirm;

        const dataToSave: Omit<LocalExpense, 'localId' | 'syncStatus' | 'deleted'> = {
            ...dataToSaveBase,
             userId: ownerUserId,
             receiptUrl: typeof tempAttachment === 'string' ? tempAttachment : undefined,
             receiptPath: undefined,
             receiptFilename: attachmentFilename || undefined,
        };

        try {
            const localId = await addLocalExpense(dataToSave);
             const newUIExpense: Expense = {
                ...(dataToSave as Omit<LocalExpense, 'localId' | 'syncStatus' | 'deleted' | 'tripLocalId'>), // Cast to ensure all needed fields are present
                localId: localId,
                id: localId,
                tripId: tripLocalId,
                userId: ownerUserId,
                syncStatus: 'pending',
                // Ensure all fields of Expense (derived from LocalExpense) are present
                tripLocalId: tripLocalId, // this was missing in the spread
                deleted: false, // explicitly set
                timestamp: dataToSave.timestamp,
                expenseDate: dataToSave.expenseDate,
             };
            setExpenses(prevExpenses => [newUIExpense, ...prevExpenses].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
            resetForm();
            setIsConfirmModalOpen(false);
            setExpenseToConfirm(null);
            toast({ title: "Despesa criada localmente!" });
        } catch (error) {
            console.error("[ExpensesComponent] Error adding local expense:", error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível salvar a despesa localmente." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditExpense = async (e: React.FormEvent) => {
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

        const originalLocalExpense = await getLocalExpenses(tripLocalId).then(expenses => expenses.find(ex => ex.localId === currentExpense.id || ex.firebaseId === currentExpense.id));
        if (!originalLocalExpense) {
            toast({ variant: "destructive", title: "Erro", description: "Despesa original não encontrada localmente." });
            return;
        }

        setIsSaving(true);
        const updatedLocalExpenseData: LocalExpense = {
            ...originalLocalExpense,
            userId: ownerUserId,
            description,
            value: valueNumber,
            expenseDate: expenseDate.toISOString(),
            expenseType,
            receiptUrl: typeof attachment === 'string' ? attachment : (attachment === null ? undefined : originalLocalExpense.receiptUrl),
            receiptFilename: attachmentFilename || (attachment === null ? undefined : originalLocalExpense.receiptFilename),
            syncStatus: originalLocalExpense.syncStatus === 'synced' && !originalLocalExpense.deleted ? 'pending' : originalLocalExpense.syncStatus,
            deleted: originalLocalExpense.deleted || false,
        };

        try {
            await updateLocalExpense(updatedLocalExpenseData);
            const updatedUIExpense: Expense = {
                ...(updatedLocalExpenseData as Omit<LocalExpense, 'localId' | 'tripLocalId'>),
                id: updatedLocalExpenseData.firebaseId || updatedLocalExpenseData.localId,
                tripId: tripLocalId,
                userId: ownerUserId,
                syncStatus: updatedLocalExpenseData.syncStatus
            };
            setExpenses(prevExpenses => prevExpenses.map(e => e.id === currentExpense.id ? updatedUIExpense : e).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
            resetForm();
            setIsEditModalOpen(false);
            setCurrentExpense(null);
            toast({ title: "Despesa atualizada localmente!" });
        } catch (error) {
            console.error("Error updating local expense:", error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar a despesa localmente." });
        } finally {
            setIsSaving(false);
        }
    };

    const openDeleteConfirmation = (expense: Expense) => {
        setExpenseToDelete(expense);
        setIsDeleteModalOpen(true);
    };

    const closeDeleteConfirmation = () => {
        setExpenseToDelete(null);
        setIsDeleteModalOpen(false);
    };

    const confirmDeleteExpense = async () => {
        if (!expenseToDelete) return;
        const localIdToDelete = expenseToDelete.id;
        setIsSaving(true);
        try {
            const expensesInDb = await getLocalExpenses(tripLocalId);
            const expenseRecordToDelete = expensesInDb.find(ex => ex.localId === localIdToDelete || ex.firebaseId === localIdToDelete);
             if (!expenseRecordToDelete) {
                 throw new Error("Registro local da despesa não encontrado para exclusão.");
             }
            await deleteLocalExpense(expenseRecordToDelete.localId);
            setExpenses(expenses.filter(e => e.id !== expenseToDelete.id));
            toast({ title: "Despesa marcada para exclusão na próxima sincronização." });
            closeDeleteConfirmation();
        } catch (error) {
            console.error("Error marking local expense for deletion:", error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível marcar a despesa para exclusão." });
        } finally {
            setIsSaving(false);
        }
    };

    const openEditModal = (expense: Expense) => {
        setCurrentExpense(expense);
        setDescription(expense.description);
        setValue(expense.value);
        setExpenseType(expense.expenseType);
        setExpenseDate(new Date(expense.expenseDate));
        if (expense.receiptUrl) {
             setAttachment(expense.receiptUrl);
             setAttachmentFilename(expense.receiptFilename || 'Arquivo Anexado');
        } else {
             setAttachment(null);
             setAttachmentFilename(null);
        }
        setIsCameraOpen(false);
        setIsEditModalOpen(true);
    };

    const resetForm = () => {
        setDescription('');
        setValue('');
        setExpenseType('');
        setExpenseDate(undefined);
        clearAttachment();
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
        setIsCreateModalOpen(true);
    }

     const renderAttachmentInput = (idPrefix: string) => (
        <div className="space-y-2">
            <Label htmlFor={`${idPrefix}Receipt`}>Anexar Comprovante (PDF ou Imagem)</Label>
             {attachmentFilename && (
                 <div className="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/50">
                     <div className="flex items-center gap-2 overflow-hidden">
                          {typeof attachment === 'string' && attachment.startsWith('data:image') && (
                             <img src={attachment} alt="Preview" className="h-8 w-8 object-cover rounded" />
                          )}
                          {!(typeof attachment === 'string' && attachment.startsWith('data:image')) && (
                             <Paperclip className="h-4 w-4 flex-shrink-0" />
                          )}
                         <span className="text-sm truncate" title={attachmentFilename}>{attachmentFilename}</span>
                     </div>
                     <Button type="button" variant="ghost" size="icon" onClick={clearAttachment} className="h-6 w-6 text-muted-foreground hover:text-destructive" disabled={isSaving}>
                         <X className="h-4 w-4" />
                         <span className="sr-only">Remover Anexo</span>
                     </Button>
                 </div>
             )}
            {!attachmentFilename && (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="button" variant="outline" onClick={() => document.getElementById(`${idPrefix}ReceiptPdf`)?.click()} className="flex-1" disabled={isSaving}>
                        <Upload className="mr-2 h-4 w-4" /> Anexar PDF/Imagem
                    </Button>
                    <Input
                        type="file"
                        id={`${idPrefix}ReceiptPdf`}
                        accept="application/pdf,image/*"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={isSaving}
                    />
                    <Button type="button" variant="outline" onClick={() => setIsCameraOpen(true)} className="flex-1" disabled={isSaving}>
                        <Camera className="mr-2 h-4 w-4" /> Usar Câmera
                    </Button>
                </div>
            )}
        </div>
    );

    return (
        <>
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div className="space-y-6">
           <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Histórico de Despesas</h3>
                    {tripLocalId && (
                        <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
                            <DialogTrigger asChild>
                                <Button onClick={() => { resetForm(); setExpenseDate(new Date()); console.log("[ExpensesComponent] Registrar Despesa button clicked, setting isCreateModalOpen to true."); setIsCreateModalOpen(true); }} className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Registrar Despesa
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-lg">
                                <DialogHeader>
                                    <DialogTitle>Registrar Nova Despesa</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handlePrepareExpenseForConfirmation} className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Descrição*</Label>
                                        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Ex: Pedágio, Alimentação..." disabled={isSaving}/>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="value">Valor (R$)*</Label>
                                        <Input id="value" type="number" value={value} onChange={(e) => setValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Valor da despesa" min="0" step="0.01" disabled={isSaving}/>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="expenseType">Tipo de Despesa*</Label>
                                        <Select onValueChange={setExpenseType} value={expenseType} required disabled={isSaving || loadingExpenseTypes}>
                                            <SelectTrigger id="expenseType">
                                                <SelectValue placeholder={loadingExpenseTypes ? "Carregando tipos..." : "Selecione o tipo"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                 {loadingExpenseTypes ? (
                                                    <SelectItem value="loading" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin inline-block"/> Carregando...</SelectItem>
                                                ) : availableExpenseTypes.map((type) => (
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
                                                    disabled={isSaving}
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
                                                    disabled={isSaving}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    {renderAttachmentInput('create')}
                                    <DialogFooter>
                                        <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button></DialogClose>
                                        <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Confirmar Dados
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}
            </div>

            <AlertDialog open={isConfirmModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeConfirmModal(); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-500" /> Confirmar Dados da Despesa
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Por favor, revise os dados abaixo antes de salvar localmente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-2">
                        <ul className="list-disc list-inside space-y-1 text-sm text-foreground">
                            <li><strong>Descrição:</strong> {expenseToConfirm?.description}</li>
                            <li><strong>Valor:</strong> {expenseToConfirm ? formatCurrency(expenseToConfirm.value) : 'N/A'}</li>
                            <li><strong>Tipo:</strong> {expenseToConfirm?.expenseType}</li>
                            <li><strong>Data:</strong> {expenseToConfirm?.expenseDate ? formatDateDisplay(expenseToConfirm?.expenseDate) : 'N/A'}</li>
                            <li><strong>Anexo:</strong> {expenseToConfirm?.receiptFilename || 'Nenhum'}</li>
                        </ul>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                            setIsConfirmModalOpen(false);
                            setIsCreateModalOpen(true);
                        }} disabled={isSaving}>Voltar e Editar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmAndSaveExpense} className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSaving ? 'Salvando...' : 'Salvar Despesa Local'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

             <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
                 <DialogContent className="sm:max-w-md">
                     <DialogHeader>
                         <DialogTitle>Escanear Comprovante</DialogTitle>
                     </DialogHeader>
                     <div className="py-4 space-y-4">
                         <div className="relative aspect-video bg-muted rounded-md overflow-hidden">
                           <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                           {hasCameraPermission === false && (
                               <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
                                   <Alert variant="destructive" className="max-w-sm">
                                       <AlertTitle>Acesso à Câmera Negado</AlertTitle>
                                       <AlertDescription>
                                           Por favor, permita o acesso à câmera nas configurações do seu navegador.
                                       </AlertDescription>
                                   </Alert>
                               </div>
                           )}
                           {hasCameraPermission === null && (
                               <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <LoadingSpinner className="text-white"/>
                               </div>
                           )}
                         </div>
                         {hasCameraPermission && (
                             <Button onClick={handleCaptureImage} className="w-full bg-primary hover:bg-primary/90">
                                 <Check className="mr-2 h-4 w-4" /> Capturar Imagem
                             </Button>
                         )}
                     </div>
                     <DialogFooter>
                         <Button variant="outline" onClick={() => setIsCameraOpen(false)}>Fechar</Button>
                     </DialogFooter>
                 </DialogContent>
             </Dialog>

            <AlertDialog open={isDeleteModalOpen} onOpenChange={(isOpen) => {if (!isOpen) closeDeleteConfirmation();}}>
                 <AlertDialogContent>
                     <AlertDialogHeader>
                         <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                         <AlertDialogDescription>
                             Tem certeza que deseja marcar esta despesa ({expenseToDelete?.description}) para exclusão? A exclusão definitiva ocorrerá na próxima sincronização.
                         </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                         <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isSaving}>Cancelar</AlertDialogCancel>
                         <AlertDialogAction onClick={confirmDeleteExpense} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSaving}>
                             {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                             {isSaving ? 'Marcando...' : 'Marcar para Excluir'}
                         </AlertDialogAction>
                     </AlertDialogFooter>
                 </AlertDialogContent>
             </AlertDialog>

            {loading ? (
                <div className="flex justify-center items-center h-20">
                    <LoadingSpinner />
                </div>
            ) : expenses.length === 0 ? (
                <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
                    <CardContent>
                        <p className="text-muted-foreground">Nenhuma despesa registrada localmente para esta viagem.</p>
                        {tripLocalId && (
                            <Button variant="link" onClick={() => { resetForm(); setExpenseDate(new Date()); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
                                Registrar a primeira despesa
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {expenses.map((expense) => (
                        <Card key={expense.id} className={cn("shadow-sm transition-shadow hover:shadow-md bg-card border border-border", expense.syncStatus === 'pending' && 'border-yellow-500', expense.syncStatus === 'error' && 'border-destructive')}>
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle>{expense.expenseType} - {formatCurrency(expense.value)}</CardTitle>
                                        <CardDescription>
                                            {formatDateDisplay(expense.expenseDate)}
                                             {expense.syncStatus === 'pending' && <span className="ml-2 text-xs text-yellow-600">(Pendente)</span>}
                                             {expense.syncStatus === 'error' && <span className="ml-2 text-xs text-destructive">(Erro Sinc)</span>}
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-1">
                                         <Dialog>
                                              <DialogTrigger asChild>
                                                 <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8">
                                                     <Eye className="h-4 w-4" />
                                                     <span className="sr-only">Visualizar Detalhes</span>
                                                 </Button>
                                             </DialogTrigger>
                                              <DialogContent>
                                                  <DialogHeader>
                                                      <DialogTitle>Detalhes da Despesa</DialogTitle>
                                                  </DialogHeader>
                                                  <div className="py-4 space-y-3">
                                                      <p><strong>Tipo:</strong> {expense.expenseType}</p>
                                                      <p><strong>Descrição:</strong> {expense.description}</p>
                                                      <p><strong>Valor:</strong> {formatCurrency(expense.value)}</p>
                                                      <p><strong>Data:</strong> {formatDateDisplay(expense.expenseDate)}</p>
                                                      <p><strong>Anexo:</strong> {expense.receiptFilename ? (
                                                          <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                               {expense.receiptUrl?.startsWith('data:image') ? <img src={expense.receiptUrl} alt="Preview" className="h-6 w-6 object-cover rounded"/> : <Paperclip className="h-4 w-4"/>}
                                                              {expense.receiptFilename}
                                                          </a>
                                                          ) : 'Nenhum'}
                                                      </p>
                                                      <p className="text-xs text-muted-foreground">Registrado em: {new Date(expense.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short'})}</p>
                                                      <p className="text-xs text-muted-foreground">Status Sinc: {expense.syncStatus || 'N/A'}</p>
                                                  </div>
                                                 <DialogFooter>
                                                      <DialogClose asChild>
                                                          <Button variant="outline">Fechar</Button>
                                                      </DialogClose>
                                                  </DialogFooter>
                                              </DialogContent>
                                          </Dialog>
                                        <Dialog open={isEditModalOpen && currentExpense?.id === expense.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); else openEditModal(expense); }}>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={() => openEditModal(expense)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving}>
                                                    <Edit className="h-4 w-4" />
                                                    <span className="sr-only">Editar</span>
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-lg">
                                                <DialogHeader><DialogTitle>Editar Despesa</DialogTitle></DialogHeader>
                                                <form onSubmit={handleEditExpense} className="grid gap-4 py-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="editDescription">Descrição*</Label>
                                                        <Textarea id="editDescription" value={description} onChange={(e) => setDescription(e.target.value)} required disabled={isSaving}/>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="editValue">Valor (R$)*</Label>
                                                        <Input id="editValue" type="number" value={value} onChange={(e) => setValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required min="0" step="0.01" disabled={isSaving}/>
                                                    </div>
                                                     <div className="space-y-2">
                                                        <Label htmlFor="editExpenseType">Tipo de Despesa*</Label>
                                                        <Select onValueChange={setExpenseType} value={expenseType} required disabled={isSaving || loadingExpenseTypes}>
                                                            <SelectTrigger id="editExpenseType">
                                                                <SelectValue placeholder={loadingExpenseTypes ? "Carregando tipos..." : "Selecione o tipo"} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {loadingExpenseTypes ? (
                                                                    <SelectItem value="loading" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin inline-block"/> Carregando...</SelectItem>
                                                                ) : availableExpenseTypes.map((type) => (
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
                                                                    disabled={isSaving}
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
                                                                    disabled={isSaving}
                                                                />
                                                            </PopoverContent>
                                                        </Popover>
                                                    </div>
                                                    {renderAttachmentInput('edit')}
                                                    <DialogFooter>
                                                        <DialogClose asChild><Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button></DialogClose>
                                                        <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                                                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                            Salvar Alterações Locais
                                                        </Button>
                                                    </DialogFooter>
                                                </form>
                                            </DialogContent>
                                        </Dialog>
                                         <AlertDialog open={isDeleteModalOpen && expenseToDelete?.id === expense.id} onOpenChange={(isOpen) => {if(!isOpen) closeDeleteConfirmation();}}>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteConfirmation(expense)} disabled={isSaving}>
                                                    <Trash2 className="h-4 w-4" />
                                                    <span className="sr-only">Excluir</span>
                                                </Button>
                                            </AlertDialogTrigger>
                                        </AlertDialog>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-1 text-sm">
                                <div className="flex items-center gap-2">
                                    <Info className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    <span>{expense.description}</span>
                                </div>
                                {expense.receiptFilename && (
                                     <div className="flex items-center gap-2">
                                         {expense.receiptUrl?.startsWith('data:image') ? (
                                            <img src={expense.receiptUrl} alt="Preview" className="h-6 w-6 object-cover rounded"/>
                                         ) : (
                                            <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                         )}
                                        <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate" title={expense.receiptFilename}>
                                             {expense.receiptFilename}
                                         </a>
                                     </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
        </>
    );
};
export default Expenses;
