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
    Loader2 // Added Loader2
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
import { getExpenses, addExpense, updateExpense, deleteExpense } from '@/services/firestoreService'; // Import Firestore functions
import { uploadReceipt, deleteReceipt } from '@/services/storageService'; // Import Storage functions

export interface Expense {
    id: string;
    tripId: string; // Made non-optional
    description: string;
    value: number;
    expenseDate: string; // ISO String
    timestamp: string; // ISO String
    expenseType: string;
    receiptUrl?: string;
    receiptPath?: string; // Store the storage path for deletion
    receiptFilename?: string;
};

// Remove initialExpenses - data will be fetched
// export const initialExpenses: Expense[] = [...];
export { getExpenses } from '@/services/firestoreService'; // Export function for legacy imports if needed

const expenseTypes = ['Pedágio', 'Alimentação', 'Hospedagem', 'Combustível', 'Manutenção', 'Outros'];

export const Expenses: React.FC<{ tripId: string; tripName?: string; }> = ({ tripId, tripName }) => {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false); // Saving/Deleting state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // State for delete confirmation
    const [currentExpense, setCurrentExpense] = useState<Expense | null>(null);
    const [expenseToConfirm, setExpenseToConfirm] = useState<Expense | null>(null);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null); // State for expense to delete
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // --- Form State ---
    const [description, setDescription] = useState('');
    const [value, setValue] = useState<number | ''>('');
    const [expenseType, setExpenseType] = useState('');
    const [expenseDate, setExpenseDate] = useState<Date | undefined>(undefined);

    // --- Attachment State ---
    const [attachment, setAttachment] = useState<File | string | null>(null);
    const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false); // Uploading state
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);


    // Fetch expenses for the specific tripId
    useEffect(() => {
        const fetchExpensesData = async () => {
            if (!tripId) return;
            setLoading(true);
            try {
                const fetchedExpenses = await getExpenses(tripId);
                setExpenses(fetchedExpenses); // Already sorted by service
            } catch (error) {
                console.error(`Error fetching expenses for trip ${tripId}:`, error);
                toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as despesas." });
            } finally {
                setLoading(false);
            }
        };
        fetchExpensesData();
    }, [tripId, toast]);

     // Camera Permission Effect
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


    // --- Helpers ---
    const formatCurrency = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDate = (dateString: string) => {
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
            // Allow PDF and common image types
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

    const handleUpload = async (): Promise<{ url?: string; path?: string; filename?: string }> => {
        if (!attachment) return {};

        setIsUploading(true);
        try {
            const { url, path } = await uploadReceipt(attachment, 'expenses');
            return { url, path, filename: attachmentFilename || (attachment instanceof File ? attachment.name : `upload_${Date.now()}`) };
        } catch (error) {
            console.error("Upload failed:", error);
            toast({ variant: "destructive", title: "Falha no Upload", description: "Não foi possível anexar o comprovante." });
            return {}; // Return empty object on failure
        } finally {
            setIsUploading(false);
        }
    };


    // --- Handlers ---
    const handlePrepareExpenseForConfirmation = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!description || value === '' || !expenseDate || !expenseType) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Todos os campos marcados com * são obrigatórios.' });
            return;
        }
        const valueNumber = Number(value);
        if (valueNumber <= 0) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Valor da despesa deve ser maior que zero.' });
            return;
        }

        // Prepare data for confirmation (upload happens only after confirmation)
        const newExpenseData: Omit<Expense, 'id' | 'receiptUrl' | 'receiptPath'> = {
            tripId: tripId,
            description,
            value: valueNumber,
            expenseDate: expenseDate.toISOString(),
            timestamp: new Date().toISOString(),
            expenseType,
            receiptFilename: attachmentFilename || undefined, // Store filename for confirmation display
        };

        // Use temporary ID for confirmation object
        setExpenseToConfirm({ ...newExpenseData, id: 'temp-' + Date.now() });
        setIsCreateModalOpen(false);
        setIsConfirmModalOpen(true);
    };

    const confirmAndSaveExpense = async () => {
        if (!expenseToConfirm) return;

        setIsSaving(true);
        let receiptDetails: { url?: string; path?: string; filename?: string } = {};

        // Upload attachment if it exists
        if (attachment) {
            receiptDetails = await handleUpload();
             if (!receiptDetails.url) { // Handle upload failure
                 setIsSaving(false);
                 // Optionally reopen confirmation or create modal
                 // setIsConfirmModalOpen(true); // Reopen confirm?
                 // setIsCreateModalOpen(true); // Reopen create?
                 return; // Stop saving process
             }
        }

        // Prepare final data for Firestore
        const { id, ...dataToSaveBase } = expenseToConfirm;
        const dataToSave: Omit<Expense, 'id'> = {
            ...dataToSaveBase,
            receiptUrl: receiptDetails.url,
            receiptPath: receiptDetails.path,
            receiptFilename: receiptDetails.filename,
        };

        try {
            const newExpenseId = await addExpense(dataToSave);
            const savedExpense: Expense = { ...dataToSave, id: newExpenseId };

            // Update local state
            setExpenses(prevExpenses => [savedExpense, ...prevExpenses].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

            resetForm();
            setIsConfirmModalOpen(false);
            setExpenseToConfirm(null);
            toast({ title: "Despesa criada com sucesso!" });
        } catch (error) {
            console.error("Error adding expense:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível salvar a despesa." });
            // Consider deleting uploaded file if Firestore save fails
             if (receiptDetails.path) {
                 await deleteReceipt(receiptDetails.path).catch(delErr => console.error("Failed to delete uploaded receipt after save error:", delErr));
             }
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

        setIsSaving(true);
        let receiptDetails: { url?: string; path?: string; filename?: string } = {
             url: currentExpense.receiptUrl,
             path: currentExpense.receiptPath,
             filename: currentExpense.receiptFilename,
         };
        let oldReceiptPathToDelete: string | undefined = undefined;

        // Check if attachment changed or was added/removed
        const attachmentChanged = attachment && (attachment instanceof File || typeof attachment === 'string' && attachment !== currentExpense.receiptUrl);
        const attachmentRemoved = !attachment && currentExpense.receiptPath;

        if (attachmentChanged) {
            // Upload new attachment
            const uploadResult = await handleUpload();
            if (!uploadResult.url) { // Handle upload failure during edit
                 setIsSaving(false);
                 return; // Stop edit process
            }
            receiptDetails = uploadResult;
            // Mark old receipt for deletion if it existed
            if (currentExpense.receiptPath) {
                oldReceiptPathToDelete = currentExpense.receiptPath;
            }
        } else if (attachmentRemoved) {
            // Mark old receipt for deletion
            oldReceiptPathToDelete = currentExpense.receiptPath;
            receiptDetails = { url: undefined, path: undefined, filename: undefined };
        }

        // Prepare data for Firestore update
        const dataToUpdate: Partial<Expense> = {
            description,
            value: valueNumber,
            expenseDate: expenseDate.toISOString(),
            expenseType,
            receiptUrl: receiptDetails.url,
            receiptPath: receiptDetails.path,
            receiptFilename: receiptDetails.filename,
            // timestamp is usually not updated
        };

        try {
            await updateExpense(currentExpense.id, dataToUpdate);
            const updatedExpense = { ...currentExpense, ...dataToUpdate };

            // Update local state
            setExpenses(prevExpenses => prevExpenses.map(e => e.id === currentExpense.id ? updatedExpense : e).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

            // Delete old receipt file from storage AFTER successful update
            if (oldReceiptPathToDelete) {
                await deleteReceipt(oldReceiptPathToDelete).catch(delErr => console.error("Failed to delete old receipt:", delErr));
            }

            resetForm();
            setIsEditModalOpen(false);
            setCurrentExpense(null);
            toast({ title: "Despesa atualizada com sucesso!" });
        } catch (error) {
            console.error("Error updating expense:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar a despesa." });
             // If update failed but we uploaded a new file, try to delete the newly uploaded file
             if (attachmentChanged && receiptDetails.path && receiptDetails.path !== oldReceiptPathToDelete) {
                 await deleteReceipt(receiptDetails.path).catch(delErr => console.error("Failed to delete newly uploaded receipt after update error:", delErr));
             }
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

        setIsSaving(true);
        const receiptPathToDelete = expenseToDelete.receiptPath; // Get path before deleting from state

        try {
            await deleteExpense(expenseToDelete.id);
            // Update local state
            setExpenses(expenses.filter(e => e.id !== expenseToDelete.id));

            // Delete receipt file from storage AFTER successful Firestore deletion
            if (receiptPathToDelete) {
                await deleteReceipt(receiptPathToDelete).catch(delErr => console.error("Failed to delete receipt file:", delErr));
            }

            toast({ title: "Despesa excluída." });
            closeDeleteConfirmation();
        } catch (error) {
            console.error("Error deleting expense:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir a despesa." });
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
             setAttachment(expense.receiptUrl); // Store URL/identifier to indicate existing
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
        clearAttachment(); // Use helper to clear attachment state and inputs
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
        // If coming back, reopen create modal with current form state
        // setIsCreateModalOpen(true);
    }

    const renderAttachmentInput = (idPrefix: string) => (
        <div className="space-y-2">
            <Label htmlFor={`${idPrefix}Receipt`}>Anexar Comprovante (PDF ou Imagem)</Label>
             {attachmentFilename && (
                 <div className="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/50">
                     <div className="flex items-center gap-2 overflow-hidden">
                         <Paperclip className="h-4 w-4 flex-shrink-0" />
                         <span className="text-sm truncate" title={attachmentFilename}>{attachmentFilename}</span>
                     </div>
                     <Button type="button" variant="ghost" size="icon" onClick={clearAttachment} className="h-6 w-6 text-muted-foreground hover:text-destructive" disabled={isSaving || isUploading}>
                         <X className="h-4 w-4" />
                         <span className="sr-only">Remover Anexo</span>
                     </Button>
                 </div>
             )}
            {!attachmentFilename && (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="button" variant="outline" onClick={() => document.getElementById(`${idPrefix}ReceiptPdf`)?.click()} className="flex-1" disabled={isSaving || isUploading}>
                        <Upload className="mr-2 h-4 w-4" /> Anexar PDF/Imagem
                    </Button>
                    <Input
                        type="file"
                        id={`${idPrefix}ReceiptPdf`}
                        accept="application/pdf,image/*" // Accept PDF and images
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={isSaving || isUploading}
                    />
                    <Button type="button" variant="outline" onClick={() => setIsCameraOpen(true)} className="flex-1" disabled={isSaving || isUploading}>
                        <Camera className="mr-2 h-4 w-4" /> Usar Câmera
                    </Button>
                </div>
            )}
             {isUploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Enviando anexo...</span>
                </div>
            )}
        </div>
    );

    return (
        <>
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div className="space-y-6">
           <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">
                        {tripName ? `Despesas da Viagem: ${tripName}` : 'Despesas'}
                    </h3>
                    <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
                        <DialogTrigger asChild>
                            <Button onClick={() => { resetForm(); setExpenseDate(new Date()); setIsCreateModalOpen(true); }} className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
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
                                    <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Ex: Pedágio, Alimentação..." disabled={isSaving}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="value">Valor (R$)*</Label>
                                    <Input id="value" type="number" value={value} onChange={(e) => setValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Valor da despesa" min="0" step="0.01" disabled={isSaving}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="expenseType">Tipo de Despesa*</Label>
                                    <Select onValueChange={setExpenseType} value={expenseType} required disabled={isSaving}>
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
                                    <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving || isUploading}>Cancelar</Button></DialogClose>
                                    <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving || isUploading}>
                                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Confirmar Dados
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
            </div>

            {/* Confirmation Dialog */}
            <AlertDialog open={isConfirmModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeConfirmModal(); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-500" /> Confirmar Dados da Despesa
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Por favor, revise os dados abaixo antes de salvar. O comprovante será enviado após a confirmação.
                            <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-foreground">
                                <li><strong>Descrição:</strong> {expenseToConfirm?.description}</li>
                                <li><strong>Valor:</strong> {expenseToConfirm ? formatCurrency(expenseToConfirm.value) : 'N/A'}</li>
                                <li><strong>Tipo:</strong> {expenseToConfirm?.expenseType}</li>
                                <li><strong>Data:</strong> {expenseToConfirm?.expenseDate ? formatDate(expenseToConfirm?.expenseDate) : 'N/A'}</li>
                                <li><strong>Anexo:</strong> {expenseToConfirm?.receiptFilename || 'Nenhum'}</li>
                            </ul>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                            setIsConfirmModalOpen(false);
                            setIsCreateModalOpen(true);
                        }} disabled={isSaving || isUploading}>Voltar e Editar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmAndSaveExpense} className="bg-primary hover:bg-primary/90" disabled={isSaving || isUploading}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSaving ? 'Salvando...' : 'Salvar Despesa'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

             {/* Camera Modal */}
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

              {/* Delete Confirmation Dialog */}
              <AlertDialog open={isDeleteModalOpen} onOpenChange={closeDeleteConfirmation}>
                 <AlertDialogContent>
                     <AlertDialogHeader>
                         <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                         <AlertDialogDescription>
                             Tem certeza que deseja excluir esta despesa ({expenseToDelete?.description})? O comprovante anexado (se houver) também será excluído. Esta ação não pode ser desfeita.
                         </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                         <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isSaving}>Cancelar</AlertDialogCancel>
                         <AlertDialogAction onClick={confirmDeleteExpense} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSaving}>
                             {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                             {isSaving ? 'Excluindo...' : 'Excluir'}
                         </AlertDialogAction>
                     </AlertDialogFooter>
                 </AlertDialogContent>
             </AlertDialog>


            {/* Expenses List */}
            {loading ? (
                <div className="flex justify-center items-center h-20">
                    <LoadingSpinner />
                </div>
            ) : expenses.length === 0 ? (
                <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
                    <CardContent>
                        <p className="text-muted-foreground">Nenhuma despesa registrada para esta viagem.</p>
                        <Button variant="link" onClick={() => { resetForm(); setExpenseDate(new Date()); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
                            Registrar a primeira despesa
                        </Button>
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
                                                      <p><strong>Data:</strong> {formatDate(expense.expenseDate)}</p>
                                                      <p><strong>Anexo:</strong> {expense.receiptFilename ? (
                                                          <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                              <Paperclip className="h-4 w-4"/> {expense.receiptFilename}
                                                          </a>
                                                          ) : 'Nenhum'}
                                                      </p>
                                                      <p className="text-xs text-muted-foreground">Registrado em: {new Date(expense.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short'})}</p>
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
                                                        <Select onValueChange={setExpenseType} value={expenseType} required disabled={isSaving}>
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
                                                        <DialogClose asChild><Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving || isUploading}>Cancelar</Button></DialogClose>
                                                        <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving || isUploading}>
                                                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                            Salvar Alterações
                                                        </Button>
                                                    </DialogFooter>
                                                </form>
                                            </DialogContent>
                                        </Dialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteConfirmation(expense)} disabled={isSaving}>
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Excluir</span>
                                            </Button>
                                        </AlertDialogTrigger>
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
                                        <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                        <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
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