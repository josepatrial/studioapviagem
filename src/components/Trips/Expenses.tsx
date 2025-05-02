
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
    Paperclip, // Added for attachment
    Camera,    // Added for camera
    Upload,    // Added for upload indication
    Check,     // Added for capture confirmation
    X          // Added for closing camera/clearing attachment
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert components

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner'; // Ensure LoadingSpinner is imported

export interface Expense {
    id: string;
    tripId?: string;
    description: string;
    value: number;
    expenseDate: string;
    timestamp: string;
    expenseType: string;
    receiptUrl?: string; // URL or identifier for the attached receipt (PDF/Image)
    receiptFilename?: string; // Original filename or identifier
};

// Mock data - Updated to include receiptUrl
export const initialExpenses: Expense[] = [
    { id: 'e1', tripId: '1', description: 'Pedágio da Imigrantes', value: 28.00, expenseDate: new Date(2024, 6, 21).toISOString(), timestamp: new Date(2024, 6, 21, 10, 30).toISOString(), expenseType: 'Pedágio', receiptUrl: 'mock/receipt1.pdf', receiptFilename: 'receipt1.pdf' },
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
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // --- Form State ---
    const [description, setDescription] = useState('');
    const [value, setValue] = useState<number | ''>('');
    const [expenseType, setExpenseType] = useState('');
    const [expenseDate, setExpenseDate] = useState<Date | undefined>(undefined);

    // --- Attachment State ---
    const [attachment, setAttachment] = useState<File | string | null>(null); // Can be File object (PDF) or data URI (Image)
    const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);


    useEffect(() => {
        const filtered = tripId ? initialExpenses.filter(e => e.tripId === tripId) : initialExpenses;
        setExpenses(filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, [tripId]);

     // Camera Permission Effect
    useEffect(() => {
        if (!isCameraOpen) {
            // Stop camera stream when modal closes
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
                videoRef.current.srcObject = null;
            }
            setHasCameraPermission(null); // Reset permission state
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
                    title: 'Camera Access Denied',
                    description: 'Please enable camera permissions in your browser settings to scan receipts.',
                });
                // Optionally close the camera view if permission is denied permanently
                // setIsCameraOpen(false);
            }
        };

        getCameraPermission();

        // Cleanup function to stop camera when component unmounts or camera closes
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
        const date = new Date(dateString);
        // Add timezone adjustment if needed, for now use UTC interpretation
        return format(date, 'dd/MM/yyyy');
    }
     const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.type === 'application/pdf') {
                setAttachment(file);
                setAttachmentFilename(file.name);
                setIsCameraOpen(false); // Close camera if a file is selected
            } else {
                toast({ variant: "destructive", title: "Tipo de arquivo inválido", description: "Por favor, selecione um arquivo PDF." });
                event.target.value = ''; // Reset input
            }
        }
    };

    const handleCaptureImage = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context) {
                // Set canvas dimensions to video dimensions
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                // Draw the current video frame onto the canvas
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Get the image data from the canvas as a data URI (e.g., PNG)
                const imageDataUrl = canvas.toDataURL('image/png');
                setAttachment(imageDataUrl);
                setAttachmentFilename(`scan_${Date.now()}.png`);
                setIsCameraOpen(false); // Close camera view after capture
            }
        }
    };

    const clearAttachment = () => {
        setAttachment(null);
        setAttachmentFilename(null);
         // Reset file input if it exists
        const fileInput = document.getElementById('receiptPdf') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
    };

    const simulateUpload = async (fileOrDataUrl: File | string): Promise<{ url: string, filename: string }> => {
         // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));

        if (typeof fileOrDataUrl === 'string') {
             // It's a data URL (image)
             const filename = attachmentFilename || `upload_${Date.now()}.png`;
             // In real app, upload data URL to storage, get URL back
             console.log("Simulating upload for image data URI...");
             return { url: `simulated/path/${filename}`, filename: filename };
         } else {
             // It's a File object (PDF)
             const filename = fileOrDataUrl.name;
              // In real app, upload file to storage, get URL back
             console.log(`Simulating upload for PDF: ${filename}`);
             return { url: `simulated/path/${filename}`, filename: filename };
         }
     };


    // --- Handlers ---
    const handlePrepareExpenseForConfirmation = async (e: React.FormEvent) => {
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

        // Simulate upload if attachment exists
        let receiptDetails: { url?: string; filename?: string } = {};
        if (attachment) {
            try {
                 const { url, filename } = await simulateUpload(attachment);
                 receiptDetails = { url: url, filename: filename };
             } catch (error) {
                 console.error("Simulated upload failed:", error);
                 toast({ variant: "destructive", title: "Falha no Upload", description: "Não foi possível anexar o comprovante." });
                 // Decide if you want to proceed without attachment or stop
                 // return;
            }
        }


        const newExpense: Expense = {
            id: String(Date.now()),
            tripId: tripId,
            description,
            value: valueNumber,
            expenseDate: expenseDate.toISOString(),
            timestamp: new Date().toISOString(),
            expenseType,
            receiptUrl: receiptDetails.url,
            receiptFilename: receiptDetails.filename
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
        resetForm(); // Resets form fields and attachment state
        setIsConfirmModalOpen(false);
        setExpenseToConfirm(null);
        toast({ title: "Despesa criada com sucesso!" });
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

        // Simulate upload if attachment has changed or is new
        let receiptDetails: { url?: string; filename?: string } = {
             url: currentExpense.receiptUrl,
             filename: currentExpense.receiptFilename,
         };
        if (attachment && (attachment instanceof File || attachment !== currentExpense.receiptUrl)) { // Check if attachment is new/changed
             try {
                 const { url, filename } = await simulateUpload(attachment);
                 receiptDetails = { url: url, filename: filename };
             } catch (error) {
                 console.error("Simulated upload failed:", error);
                 toast({ variant: "destructive", title: "Falha no Upload", description: "Não foi possível atualizar o comprovante." });
                 // Decide if you want to proceed without updating attachment or stop
                 // return;
             }
        } else if (!attachment && currentExpense.receiptUrl) {
             // Attachment was cleared
             receiptDetails = { url: undefined, filename: undefined };
             // In a real app, you might need to delete the old file from storage here
             console.log("Simulating deletion of old attachment:", currentExpense.receiptUrl);
         }


        const updatedExpense: Expense = {
            ...currentExpense,
            description,
            value: valueNumber,
            expenseDate: expenseDate.toISOString(),
            expenseType,
            receiptUrl: receiptDetails.url,
            receiptFilename: receiptDetails.filename,
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
        // Find the expense to potentially delete its attachment
         const expenseToDelete = initialExpenses.find(e => e.id === expenseId);

        // Delete from mock data source
        const index = initialExpenses.findIndex(e => e.id === expenseId);
        if (index !== -1) {
            initialExpenses.splice(index, 1);
        }
        // Update local state
        setExpenses(expenses.filter(e => e.id !== expenseId));

        // In a real app, delete the attachment from storage if it exists
         if (expenseToDelete?.receiptUrl) {
             console.log("Simulating deletion of attachment:", expenseToDelete.receiptUrl);
             // Call your storage deletion function here
         }

        toast({ title: "Despesa excluída." });
    };

    const openEditModal = (expense: Expense) => {
        setCurrentExpense(expense);
        setDescription(expense.description);
        setValue(expense.value);
        setExpenseType(expense.expenseType);
        setExpenseDate(new Date(expense.expenseDate));
        // Set attachment state based on existing expense data
        if (expense.receiptUrl) {
             // If it's an image (assuming), set the URL; if PDF, you might just show filename
             // For simplicity, we just show the filename. A preview could be added for images.
             setAttachment(expense.receiptUrl); // Store URL to indicate existing attachment
             setAttachmentFilename(expense.receiptFilename || 'Arquivo Anexado');
        } else {
             setAttachment(null);
             setAttachmentFilename(null);
        }
        setIsCameraOpen(false); // Ensure camera is closed initially
        setIsEditModalOpen(true);
    };

    const resetForm = () => {
        setDescription('');
        setValue('');
        setExpenseType('');
        setExpenseDate(undefined);
        setAttachment(null);
        setAttachmentFilename(null);
        setIsCameraOpen(false);
         // Reset file input if it exists
        const fileInput = document.getElementById('receiptPdf') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
        const editFileInput = document.getElementById('editReceiptPdf') as HTMLInputElement | null;
        if (editFileInput) editFileInput.value = '';

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
        // resetForm(); // Clear form if going back to blank state
        // setIsCreateModalOpen(true);
    }

    // --- Render Attachment Input ---
    const renderAttachmentInput = (idPrefix: string) => (
        <div className="space-y-2">
            <Label htmlFor={`${idPrefix}Receipt`}>Anexar Comprovante (PDF ou Imagem)</Label>
             {attachmentFilename && (
                 <div className="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/50">
                     <div className="flex items-center gap-2 overflow-hidden">
                         <Paperclip className="h-4 w-4 flex-shrink-0" />
                         <span className="text-sm truncate" title={attachmentFilename}>{attachmentFilename}</span>
                     </div>
                     <Button type="button" variant="ghost" size="icon" onClick={clearAttachment} className="h-6 w-6 text-muted-foreground hover:text-destructive">
                         <X className="h-4 w-4" />
                         <span className="sr-only">Remover Anexo</span>
                     </Button>
                 </div>
             )}
            {!attachmentFilename && (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="button" variant="outline" onClick={() => document.getElementById(`${idPrefix}ReceiptPdf`)?.click()} className="flex-1">
                        <Upload className="mr-2 h-4 w-4" /> Anexar PDF
                    </Button>
                    <Input
                        type="file"
                        id={`${idPrefix}ReceiptPdf`}
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <Button type="button" variant="outline" onClick={() => setIsCameraOpen(true)} className="flex-1">
                        <Camera className="mr-2 h-4 w-4" /> Usar Câmera
                    </Button>
                </div>
            )}
        </div>
    );


    // Component JSX return statement starts here
    return (
        <> {/* Use Fragment */}
        {/* Hidden Canvas for Image Capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div className="space-y-6">
           <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">
                        {tripName ? `Despesas da Viagem: ${tripName}` : 'Despesas'}
                    </h3>
                    {tripId && ( // Only show button if a trip context is provided
                        <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
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

                                    {/* Attachment Input */}
                                    {renderAttachmentInput('create')}

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
            <AlertDialog open={isConfirmModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeConfirmModal(); }}>
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
                                 <li><strong>Anexo:</strong> {expenseToConfirm?.receiptFilename || 'Nenhum'}</li>
                            </ul>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                            setIsConfirmModalOpen(false);
                            setIsCreateModalOpen(true); // Re-open create modal to allow editing
                            // Keep expenseToConfirm so form can be pre-filled
                        }}>Voltar e Editar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmAndSaveExpense} className="bg-primary hover:bg-primary/90">Salvar Despesa</AlertDialogAction>
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
                                           Por favor, permita o acesso à câmera nas configurações do seu navegador para usar esta funcionalidade.
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
                                        {/* View/Details Button */}
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


                                        {/* Edit Button */}
                                        <Dialog open={isEditModalOpen && currentExpense?.id === expense.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); else openEditModal(expense); }}>
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

                                                    {/* Edit Attachment Input */}
                                                    {renderAttachmentInput('edit')}


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
                                {/* Description */}
                                <div className="flex items-center gap-2">
                                    <Info className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    <span>{expense.description}</span>
                                </div>
                                {/* Attachment Link */}
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
        </> // Close Fragment
    ); // End of return statement
}; // End of component function definition
