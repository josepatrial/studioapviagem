// src/components/Trips/Expenses.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Paperclip, Camera, Upload, Check, X, Eye, Loader2, DollarSign } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import {
    addLocalExpense,
    updateLocalExpense,
    deleteLocalExpense,
    getLocalExpenses,
    LocalExpense,
    getLocalCustomTypes, 
    STORE_EXPENSE_TYPES,
    CustomType,
    getLocalDbStore
} from '@/services/localDbService';
import { cn } from '@/lib/utils';
import { getExpenseTypesFromFirestore } from '@/services/firestoreService';

export interface Expense extends Omit<LocalExpense, 'localId' | 'tripLocalId'> {
  id: string;
  tripId: string;
  userId: string;
  syncStatus?: 'pending' | 'synced' | 'error';
}

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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [currentExpense, setCurrentExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [expenseToConfirm, setExpenseToConfirm] = useState<Omit<LocalExpense, 'localId' | 'syncStatus' | 'id' | 'deleted'> | null>(null);
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [description, setDescription] = useState('');
  const [value, setValue] = useState<number | ''>('');
  const [expenseType, setExpenseType] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [comments, setComments] = useState('');

  const [attachment, setAttachment] = useState<File | string | null>(null);
  const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

  const [availableExpenseTypes, setAvailableExpenseTypes] = useState<string[]>([]);
  const [loadingExpenseTypes, setLoadingExpenseTypes] = useState(true);

  useEffect(() => {
    console.log(`[ExpensesComponent useEffect for data fetch] Running for tripLocalId: ${tripLocalId}`);
    const fetchExpensesData = async () => {
        if (!tripLocalId) {
            console.log("[ExpensesComponent useEffect] No tripLocalId, skipping fetch.");
            setExpenses([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            console.log(`[ExpensesComponent useEffect] Fetching local expenses for trip ${tripLocalId}, owner ${ownerUserId}`);
            const localExpenses = await getLocalExpenses(tripLocalId);
            console.log(`[ExpensesComponent useEffect] Fetched ${localExpenses.length} local expenses.`);
            const uiExpenses = localExpenses.map(le => ({
                ...le,
                id: le.firebaseId || le.localId,
                tripId: le.tripLocalId,
                userId: le.userId || ownerUserId,
                syncStatus: le.syncStatus,
            })).sort((a,b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());
            setExpenses(uiExpenses);
            console.log(`[ExpensesComponent useEffect] Mapped ${uiExpenses.length} expenses to UI state.`);
        } catch (error) {
            console.error(`[ExpensesComponent] Error fetching local expenses for trip ${tripLocalId}:`, error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar as despesas locais." });
        } finally {
            setLoading(false);
        }
    };
    fetchExpensesData();

    const loadAndCacheExpenseTypes = async () => {
        setLoadingExpenseTypes(true);
        try {
            let typesToUse: CustomType[] = [];
            if (navigator.onLine) {
                console.log("[ExpensesComponent] Online: Fetching expense types from Firestore...");
                const firestoreTypes = await getExpenseTypesFromFirestore();
                 typesToUse = firestoreTypes.map(ft => ({
                    localId: ft.id, 
                    id: ft.id,
                    name: ft.name,
                    firebaseId: ft.id,
                    syncStatus: 'synced',
                    deleted: false,
                }));
                
                const store = await getLocalDbStore(STORE_EXPENSE_TYPES, 'readwrite');
                const transaction = store.transaction;
                const typePromises = typesToUse.map(type => {
                    return new Promise<void>((resolve, reject) => {
                        const request = store.put(type); // Upsert
                        request.onsuccess = () => resolve();
                        request.onerror = () => {
                            console.warn(`Failed to cache expense type "${type.name}" locally:`, request.error);
                            resolve(); 
                        };
                    });
                });
                await Promise.all(typePromises);
                await new Promise(resolve => transaction.oncomplete = resolve);
                console.log("[ExpensesComponent] Cached/updated expense types from Firestore locally.");
            } else {
                console.log("[ExpensesComponent] Offline: Fetching expense types from LocalDB.");
                typesToUse = await getLocalCustomTypes(STORE_EXPENSE_TYPES);
            }
            setAvailableExpenseTypes(['Outro', ...typesToUse.map(t => t.name).sort()]);
        } catch (err) {
            console.error("[ExpensesComponent] Failed to load expense types:", err);
            try {
                const localTypes = await getLocalCustomTypes(STORE_EXPENSE_TYPES);
                setAvailableExpenseTypes(['Outro', ...localTypes.map(t => t.name).sort()]);
            } catch (localErr) {
                setAvailableExpenseTypes(['Outro']); 
                toast({ variant: 'destructive', title: 'Erro ao carregar tipos de despesa', description: (err as Error).message });
            }
        } finally {
            setLoadingExpenseTypes(false);
        }
    };
    loadAndCacheExpenseTypes();

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
            console.error('[ExpensesComponent] Error accessing camera:', error);
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

  const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatDateDisplay = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return 'Data inválida';
    }
  };

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
            setAttachmentFilename(`scan_despesa_${Date.now()}.png`);
            setIsCameraOpen(false);
        }
    }
  };

  const clearAttachment = () => {
    setAttachment(null);
    setAttachmentFilename(null);
    const fileInputCreate = document.getElementById('createExpenseReceipt') as HTMLInputElement | null;
    if (fileInputCreate) fileInputCreate.value = '';
    const fileInputEdit = document.getElementById('editExpenseReceipt') as HTMLInputElement | null;
    if (fileInputEdit) fileInputEdit.value = '';
  };

  const handlePrepareExpenseForConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[ExpensesComponent] handlePrepareExpenseForConfirmation called with data:", { description, value, expenseType, expenseDate, comments, attachmentFilename, ownerUserId });
    if (!description || value === '' || !expenseType || !expenseDate) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Descrição, Valor, Tipo e Data da Despesa são obrigatórios.' });
        return;
    }
    const numValue = Number(value);
    if (numValue <= 0) {
        toast({ variant: 'destructive', title: 'Erro', description: 'O valor da despesa deve ser maior que zero.' });
        return;
    }

    const newExpenseData: Omit<LocalExpense, 'localId' | 'syncStatus' | 'id' | 'deleted' | 'receiptUrl' | 'receiptPath'> = {
        tripLocalId,
        userId: ownerUserId,
        description,
        value: numValue,
        expenseType,
        expenseDate: new Date(expenseDate).toISOString(), 
        timestamp: new Date().toISOString(),
        comments,
        receiptFilename: attachmentFilename || undefined,
    };
    setExpenseToConfirm(newExpenseData);
    setIsCreateModalOpen(false);
    setIsConfirmModalOpen(true);
  };

  const confirmAndSaveExpense = async () => {
    if (!expenseToConfirm) return;
    console.log("[ExpensesComponent] Attempting to save new expense locally:", expenseToConfirm);
    setIsSaving(true);
    try {
        const localId = await addLocalExpense({
            ...expenseToConfirm,
            userId: ownerUserId, // ensure ownerUserId is set
            receiptUrl: typeof attachment === 'string' && attachment.startsWith('data:') ? attachment : undefined,
        });
        const newUIExpense: Expense = {
            ...(expenseToConfirm as LocalExpense), // Cast for spreading
            localId: localId, 
            id: localId, 
            tripId: tripLocalId,
            userId: ownerUserId,
            receiptUrl: typeof attachment === 'string' && attachment.startsWith('data:') ? attachment : undefined,
            receiptFilename: attachmentFilename || undefined,
            syncStatus: 'pending',
        };
        setExpenses(prevExpenses => [newUIExpense, ...prevExpenses].sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()));
        resetForm();
        setIsConfirmModalOpen(false);
        setExpenseToConfirm(null);
        toast({ title: 'Despesa criada localmente!' });
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
    if (!description || value === '' || !expenseType || !expenseDate) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Descrição, Valor, Tipo e Data da Despesa são obrigatórios.' });
        return;
    }
    const numValue = Number(value);
    if (numValue <= 0) {
        toast({ variant: 'destructive', title: 'Erro', description: 'O valor da despesa deve ser maior que zero.' });
        return;
    }

    const originalLocalExpense = await getLocalExpenses(tripLocalId).then(exps => exps.find(ex => ex.localId === currentExpense.id || ex.firebaseId === currentExpense.id));
    if (!originalLocalExpense) {
        toast({ variant: "destructive", title: "Erro", description: "Despesa original não encontrada localmente." });
        return;
    }

    setIsSaving(true);
    const updatedLocalExpenseData: LocalExpense = {
        ...originalLocalExpense,
        userId: ownerUserId, // Ensure ownerUserId is set
        description,
        value: numValue,
        expenseType,
        expenseDate: new Date(expenseDate).toISOString(),
        timestamp: new Date().toISOString(), // Update timestamp on edit
        comments,
        receiptFilename: attachmentFilename || (attachment === null ? undefined : originalLocalExpense.receiptFilename),
        receiptUrl: typeof attachment === 'string' ? attachment : (attachment === null ? undefined : originalLocalExpense.receiptUrl),
        syncStatus: originalLocalExpense.syncStatus === 'synced' && !originalLocalExpense.deleted ? 'pending' : originalLocalExpense.syncStatus,
    };

    try {
        await updateLocalExpense(updatedLocalExpenseData);
        const updatedUIExpense: Expense = {
            ...updatedLocalExpenseData,
            id: updatedLocalExpenseData.firebaseId || updatedLocalExpenseData.localId,
            tripId: tripLocalId,
            userId: ownerUserId,
        };
        setExpenses(prevExpenses => prevExpenses.map(ex => ex.id === currentExpense.id ? updatedUIExpense : ex).sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()));
        resetForm();
        setIsEditModalOpen(false);
        setCurrentExpense(null);
        toast({ title: 'Despesa atualizada localmente!' });
    } catch (error) {
        console.error("[ExpensesComponent] Error updating local expense:", error);
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
        setExpenses(expenses.filter(ex => ex.id !== expenseToDelete.id));
        toast({ title: 'Despesa marcada para exclusão.' });
        closeDeleteConfirmation();
    } catch (error) {
        console.error("[ExpensesComponent] Error marking local expense for deletion:", error);
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
    setExpenseDate(expense.expenseDate.split('T')[0]);
    setComments(expense.comments || '');
    if (expense.receiptUrl || expense.receiptFilename) {
        setAttachment(expense.receiptUrl || expense.receiptFilename!);
        setAttachmentFilename(expense.receiptFilename || 'Arquivo Anexado');
    } else {
        clearAttachment();
    }
    setIsCameraOpen(false); 
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setDescription('');
    setValue('');
    setExpenseType('');
    setExpenseDate('');
    setComments('');
    clearAttachment();
  };

  const closeCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(false);
  };

  const closeEditModal = () => {
    resetForm();
    setIsEditModalOpen(false);
    setCurrentExpense(null);
  };

  const closeConfirmModal = () => {
    setIsConfirmModalOpen(false);
    setIsCreateModalOpen(true); 
  };

  const renderAttachmentInput = (idPrefix: string) => (
    <div className="space-y-2">
        <Label htmlFor={`${idPrefix}ExpenseReceipt`}>Anexar Comprovante (PDF ou Imagem)</Label>
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
                <Button type="button" variant="outline" onClick={() => document.getElementById(`${idPrefix}ExpenseReceipt`)?.click()} className="flex-1" disabled={isSaving}>
                    <Upload className="mr-2 h-4 w-4" /> Anexar PDF/Imagem
                </Button>
                <Input
                    type="file"
                    id={`${idPrefix}ExpenseReceipt`}
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
                        <Button onClick={() => { resetForm(); setExpenseDate(new Date().toISOString().split('T')[0]); console.log("[ExpensesComponent] Registrar Despesa button clicked."); setIsCreateModalOpen(true);}} className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Registrar Despesa
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader><DialogTitle>Registrar Nova Despesa</DialogTitle></DialogHeader>
                        <form onSubmit={handlePrepareExpenseForConfirmation} className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="expenseDate">Data da Despesa*</Label>
                                <Input id="expenseDate" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required disabled={isSaving}/>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Descrição*</Label>
                                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Ex: Almoço, Pedágio Mogi" disabled={isSaving}/>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="value">Valor (R$)*</Label>
                                <Input id="value" type="number" value={value} onChange={(e) => setValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="0.00" min="0.01" step="0.01" disabled={isSaving}/>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="expenseType">Tipo de Despesa*</Label>
                                <Select onValueChange={setExpenseType} value={expenseType} required disabled={isSaving || loadingExpenseTypes}>
                                    <SelectTrigger id="expenseType"><SelectValue placeholder={loadingExpenseTypes ? "Carregando..." : "Selecione o tipo"} /></SelectTrigger>
                                    <SelectContent>
                                        {loadingExpenseTypes ? <SelectItem value="loading" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin inline-block"/> Carregando...</SelectItem> :
                                         availableExpenseTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="comments">Observações</Label>
                                <Textarea id="comments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Detalhes adicionais" disabled={isSaving}/>
                            </div>
                            {renderAttachmentInput('create')}
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button></DialogClose>
                                <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90">
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Confirmar Dados
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            )}
        </div>

        <AlertDialog open={isConfirmModalOpen} onOpenChange={(isOpen) => { if(!isOpen) closeConfirmModal(); else setIsConfirmModalOpen(true); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Dados da Despesa</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogDescription asChild>
                   <div>
                     <p>Por favor, revise os dados da despesa. Esta ação não pode ser facilmente desfeita após salvar.</p>
                     <ul className="mt-3 list-disc list-inside space-y-1 text-sm text-foreground">
                        <li><strong>Data:</strong> {expenseToConfirm?.expenseDate ? formatDateDisplay(expenseToConfirm.expenseDate) : 'N/A'}</li>
                        <li><strong>Descrição:</strong> {expenseToConfirm?.description}</li>
                        <li><strong>Valor:</strong> {expenseToConfirm ? formatCurrency(expenseToConfirm.value) : 'N/A'}</li>
                        <li><strong>Tipo:</strong> {expenseToConfirm?.expenseType}</li>
                        <li><strong>Anexo:</strong> {attachmentFilename || 'Nenhum'}</li>
                    </ul>
                   </div>
                </AlertDialogDescription>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeConfirmModal} disabled={isSaving}>Voltar e Editar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmAndSaveExpense} className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Salvando...' : 'Salvar Despesa Local'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Escanear Comprovante</DialogTitle></DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="relative aspect-video bg-muted rounded-md overflow-hidden">
                        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                        {hasCameraPermission === false && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
                                <Alert variant="destructive" className="max-w-sm">
                                    <AlertTitle>Acesso à Câmera Negado</AlertTitle>
                                    <AlertDescription>Por favor, permita o acesso nas configurações.</AlertDescription>
                                </Alert>
                            </div>
                        )}
                        {hasCameraPermission === null && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50"><LoadingSpinner className="text-white"/></div>
                        )}
                    </div>
                    {hasCameraPermission && (
                        <Button onClick={handleCaptureImage} className="w-full bg-primary hover:bg-primary/90">
                            <Check className="mr-2 h-4 w-4" /> Capturar Imagem
                        </Button>
                    )}
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setIsCameraOpen(false)}>Fechar</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteModalOpen} onOpenChange={(isOpen) => { if(!isOpen) closeDeleteConfirmation(); else setIsDeleteModalOpen(true); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja marcar esta despesa de {expenseToDelete?.description} para exclusão?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isSaving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteExpense} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Marcar para Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {loading ? (
            <div className="flex justify-center items-center h-20"><LoadingSpinner /></div>
        ) : expenses.length === 0 ? (
            <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
                <CardContent><p className="text-muted-foreground">Nenhuma despesa registrada.</p></CardContent>
            </Card>
        ) : (
            <div className="grid gap-4">
                {expenses.map((expense) => (
                    <Card key={expense.id} className={cn("shadow-sm transition-shadow hover:shadow-md bg-card border", expense.syncStatus === 'pending' && 'border-yellow-500', expense.syncStatus === 'error' && 'border-destructive')}>
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle>{expense.description}</CardTitle>
                                    <CardDescription>
                                        {expense.expenseType} - {formatDateDisplay(expense.expenseDate)}
                                        {expense.syncStatus === 'pending' && <span className="ml-2 text-xs text-yellow-600">(Pendente)</span>}
                                        {expense.syncStatus === 'error' && <span className="ml-2 text-xs text-destructive">(Erro Sinc)</span>}
                                    </CardDescription>
                                </div>
                                <div className="flex gap-1">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8"><Eye className="h-4 w-4" /></Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader><DialogTitle>Detalhes da Despesa</DialogTitle></DialogHeader>
                                            <div className="py-4 space-y-3">
                                                <p><strong>Descrição:</strong> {expense.description}</p>
                                                <p><strong>Valor:</strong> {formatCurrency(expense.value)}</p>
                                                <p><strong>Tipo:</strong> {expense.expenseType}</p>
                                                <p><strong>Data:</strong> {formatDateDisplay(expense.expenseDate)}</p>
                                                <p><strong>Observações:</strong> {expense.comments || 'Nenhuma'}</p>
                                                <p><strong>Anexo:</strong> {expense.receiptFilename ? (<a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">{expense.receiptUrl?.startsWith('data:image') ? <img src={expense.receiptUrl} alt="Preview" className="h-6 w-6 object-cover rounded"/> : <Paperclip className="h-4 w-4"/>}{expense.receiptFilename}</a>) : 'Nenhum'}</p>
                                            </div>
                                            <DialogFooter><DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose></DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                    <Dialog open={isEditModalOpen && currentExpense?.id === expense.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); else openEditModal(expense); }}>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon" onClick={() => openEditModal(expense)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving}><Edit className="h-4 w-4" /></Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-lg">
                                            <DialogHeader><DialogTitle>Editar Despesa</DialogTitle></DialogHeader>
                                            <form onSubmit={handleEditExpense} className="grid gap-4 py-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="editExpenseDate">Data da Despesa*</Label>
                                                    <Input id="editExpenseDate" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required disabled={isSaving}/>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editDescription">Descrição*</Label>
                                                    <Input id="editDescription" value={description} onChange={(e) => setDescription(e.target.value)} required disabled={isSaving}/>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editValue">Valor (R$)*</Label>
                                                    <Input id="editValue" type="number" value={value} onChange={(e) => setValue(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required min="0.01" step="0.01" disabled={isSaving}/>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editExpenseType">Tipo de Despesa*</Label>
                                                    <Select onValueChange={setExpenseType} value={expenseType} required disabled={isSaving || loadingExpenseTypes}>
                                                        <SelectTrigger id="editExpenseType"><SelectValue placeholder={loadingExpenseTypes ? "Carregando..." : "Selecione"} /></SelectTrigger>
                                                        <SelectContent>
                                                            {loadingExpenseTypes ? <SelectItem value="loading" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin inline-block"/> Carregando...</SelectItem> :
                                                            availableExpenseTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editComments">Observações</Label>
                                                    <Textarea id="editComments" value={comments} onChange={(e) => setComments(e.target.value)} disabled={isSaving}/>
                                                </div>
                                                {renderAttachmentInput('edit')}
                                                <DialogFooter>
                                                    <DialogClose asChild><Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button></DialogClose>
                                                    <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90">
                                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                        Salvar Alterações
                                                    </Button>
                                                </DialogFooter>
                                            </form>
                                        </DialogContent>
                                    </Dialog>
                                     <AlertDialog>
                                        
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteConfirmation(expense)} disabled={isSaving}><Trash2 className="h-4 w-4" /></Button>
                                        </AlertDialogTrigger>
                                        {/* AlertDialogContent for delete moved outside map to ensure single instance */}
                                    </AlertDialog>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 font-semibold">
                                <DollarSign className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                                <span>{formatCurrency(expense.value)}</span>
                            </div>
                            {expense.comments && (<div className="flex items-start gap-2 text-muted-foreground"><span className="font-medium flex-shrink-0">Obs:</span> {expense.comments}</div>)}
                            {expense.receiptFilename && (
                                <div className="flex items-center gap-2">
                                    {expense.receiptUrl?.startsWith('data:image') ? (<img src={expense.receiptUrl} alt="Preview" className="h-6 w-6 object-cover rounded"/>) : (<Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />)}
                                    <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate" title={expense.receiptFilename}>{expense.receiptFilename}</a>
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

