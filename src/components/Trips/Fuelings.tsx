'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Droplet, Loader, Paperclip, Camera, Upload, Check, X, Eye, Loader2 } from 'lucide-react'; // Added Loader2
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { getFuelings, addFueling, updateFueling, deleteFueling } from '@/services/firestoreService'; // Import Firestore functions
import { uploadReceipt, deleteReceipt } from '@/services/storageService'; // Import Storage functions

export interface Fueling {
  id: string;
  tripId: string;
  vehicleId: string; // Should ideally be linked dynamically
  date: string; // ISO String
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  location: string;
  comments?: string;
  receiptUrl?: string;
  receiptPath?: string; // Store storage path for deletion
  receiptFilename?: string;
}

// Export getFuelings as initialFuelings for legacy compatibility
export { getFuelings as initialFuelings } from '@/services/firestoreService';

interface FuelingsProps {
  tripId: string; // TripId is required
  tripName?: string;
}

export const Fuelings: React.FC<FuelingsProps> = ({ tripId, tripName }) => {
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false); // Saving/Deleting state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentFueling, setCurrentFueling] = useState<Fueling | null>(null);
  const [fuelingToDelete, setFuelingToDelete] = useState<Fueling | null>(null); // State for fueling to delete
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Form State ---
  const [date, setDate] = useState('');
  const [liters, setLiters] = useState<number | ''>('');
  const [pricePerLiter, setPricePerLiter] = useState<number | ''>('');
  const [location, setLocation] = useState('');
  const [comments, setComments] = useState('');

  // --- Attachment State ---
  const [attachment, setAttachment] = useState<File | string | null>(null);
  const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false); // Uploading state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

   // Fetch fuelings for the specific tripId
   useEffect(() => {
    const fetchFuelingsData = async () => {
        if (!tripId) return;
        setLoading(true);
        try {
            const fetchedFuelings = await getFuelings(tripId);
            setFuelings(fetchedFuelings); // Already sorted by service
        } catch (error) {
            console.error(`Error fetching fuelings for trip ${tripId}:`, error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar os abastecimentos." });
        } finally {
            setLoading(false);
        }
    };
    fetchFuelingsData();
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
  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
   const formatDate = (dateString: string) => {
       try {
            return new Date(dateString).toLocaleDateString('pt-BR');
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
            const { url, path } = await uploadReceipt(attachment, 'fuelings'); // Use 'fuelings' folder
            return { url, path, filename: attachmentFilename || (attachment instanceof File ? attachment.name : `upload_${Date.now()}`) };
        } catch (error) {
            console.error("Upload failed:", error);
            toast({ variant: "destructive", title: "Falha no Upload", description: "Não foi possível anexar o comprovante." });
            return {};
        } finally {
            setIsUploading(false);
        }
    };

  // --- Handlers ---
  const handleCreateFueling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || liters === '' || pricePerLiter === '' || !location) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Data, litros, preço/L e local são obrigatórios.' });
      return;
    }
    const litersNum = Number(liters);
    const priceNum = Number(pricePerLiter);
     if (litersNum <= 0 || priceNum <= 0) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Litros e Preço/Litro devem ser maiores que zero.' });
        return;
     }


     setIsSaving(true);
     let receiptDetails: { url?: string; path?: string; filename?: string } = {};

     if (attachment) {
         receiptDetails = await handleUpload();
          if (!receiptDetails.url) { // Handle upload failure
              setIsSaving(false);
              return;
          }
     }

    const newFuelingData: Omit<Fueling, 'id'> = {
      tripId,
      vehicleId: 'v1', // TODO: Get vehicleId dynamically from trip context
      date: new Date(date).toISOString(), // Ensure ISO string format
      liters: litersNum,
      pricePerLiter: priceNum,
      totalCost: litersNum * priceNum,
      location,
      comments,
      receiptUrl: receiptDetails.url,
      receiptPath: receiptDetails.path,
      receiptFilename: receiptDetails.filename
    };

     try {
         const newFuelingId = await addFueling(newFuelingData);
         const savedFueling = { ...newFuelingData, id: newFuelingId };
         setFuelings(prevFuelings => [savedFueling, ...prevFuelings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
         resetForm();
         setIsCreateModalOpen(false);
         toast({ title: 'Abastecimento criado com sucesso!' });
     } catch (error) {
         console.error("Error adding fueling:", error);
         toast({ variant: "destructive", title: "Erro", description: "Não foi possível salvar o abastecimento." });
          // Delete uploaded file if save fails
          if (receiptDetails.path) {
              await deleteReceipt(receiptDetails.path).catch(delErr => console.error("Failed to delete uploaded receipt after save error:", delErr));
          }
     } finally {
         setIsSaving(false);
     }
  };

  const handleEditFueling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFueling) return;

    if (!date || liters === '' || pricePerLiter === '' || !location) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Data, litros, preço/L e local são obrigatórios.' });
      return;
    }
     const litersNum = Number(liters);
     const priceNum = Number(pricePerLiter);
      if (litersNum <= 0 || priceNum <= 0) {
         toast({ variant: 'destructive', title: 'Erro', description: 'Litros e Preço/Litro devem ser maiores que zero.' });
         return;
      }

     setIsSaving(true);
     let receiptDetails: { url?: string; path?: string; filename?: string } = {
         url: currentFueling.receiptUrl,
         path: currentFueling.receiptPath,
         filename: currentFueling.receiptFilename,
     };
     let oldReceiptPathToDelete: string | undefined = undefined;

     const attachmentChanged = attachment && (attachment instanceof File || typeof attachment === 'string' && attachment !== currentFueling.receiptUrl);
     const attachmentRemoved = !attachment && currentFueling.receiptPath;

     if (attachmentChanged) {
         const uploadResult = await handleUpload();
         if (!uploadResult.url) {
             setIsSaving(false);
             return;
         }
         receiptDetails = uploadResult;
         if (currentFueling.receiptPath) {
             oldReceiptPathToDelete = currentFueling.receiptPath;
         }
     } else if (attachmentRemoved) {
         oldReceiptPathToDelete = currentFueling.receiptPath;
         receiptDetails = { url: undefined, path: undefined, filename: undefined };
     }

    const dataToUpdate: Partial<Fueling> = {
      date: new Date(date).toISOString(),
      liters: litersNum,
      pricePerLiter: priceNum,
      totalCost: litersNum * priceNum,
      location,
      comments,
      receiptUrl: receiptDetails.url,
      receiptPath: receiptDetails.path,
      receiptFilename: receiptDetails.filename,
    };

    try {
        await updateFueling(currentFueling.id, dataToUpdate);
        const updatedFueling = { ...currentFueling, ...dataToUpdate };
        setFuelings(prevFuelings => prevFuelings.map(f => f.id === currentFueling.id ? updatedFueling : f).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        if (oldReceiptPathToDelete) {
            await deleteReceipt(oldReceiptPathToDelete).catch(delErr => console.error("Failed to delete old receipt:", delErr));
        }

        resetForm();
        setIsEditModalOpen(false);
        setCurrentFueling(null);
        toast({ title: 'Abastecimento atualizado com sucesso!' });
    } catch (error) {
        console.error("Error updating fueling:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar o abastecimento." });
         if (attachmentChanged && receiptDetails.path && receiptDetails.path !== oldReceiptPathToDelete) {
             await deleteReceipt(receiptDetails.path).catch(delErr => console.error("Failed to delete newly uploaded receipt after update error:", delErr));
         }
    } finally {
         setIsSaving(false);
    }
  };

   const openDeleteConfirmation = (fueling: Fueling) => {
        setFuelingToDelete(fueling);
        setIsDeleteModalOpen(true);
    };

    const closeDeleteConfirmation = () => {
        setFuelingToDelete(null);
        setIsDeleteModalOpen(false);
      };

  const confirmDeleteFueling = async () => {
     if (!fuelingToDelete) return;

    setIsSaving(true);
    const receiptPathToDelete = fuelingToDelete.receiptPath;

    try {
        await deleteFueling(fuelingToDelete.id);
        setFuelings(fuelings.filter(f => f.id !== fuelingToDelete.id));

        if (receiptPathToDelete) {
            await deleteReceipt(receiptPathToDelete).catch(delErr => console.error("Failed to delete receipt file:", delErr));
        }

        toast({ title: 'Abastecimento excluído.' });
        closeDeleteConfirmation();
    } catch (error) {
        console.error("Error deleting fueling:", error);
        toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir o abastecimento." });
    } finally {
        setIsSaving(false);
    }
  };

  const openEditModal = (fueling: Fueling) => {
    setCurrentFueling(fueling);
    setDate(fueling.date.split('T')[0]);
    setLiters(fueling.liters);
    setPricePerLiter(fueling.pricePerLiter);
    setLocation(fueling.location);
    setComments(fueling.comments || '');
    if (fueling.receiptUrl) {
        setAttachment(fueling.receiptUrl);
        setAttachmentFilename(fueling.receiptFilename || 'Arquivo Anexado');
    } else {
        setAttachment(null);
        setAttachmentFilename(null);
    }
    setIsCameraOpen(false);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setDate('');
    setLiters('');
    setPricePerLiter('');
    setLocation('');
    setComments('');
    clearAttachment(); // Use helper
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
                        accept="application/pdf,image/*"
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
          {tripName ? `Abastecimentos da Viagem: ${tripName}` : 'Abastecimentos'}
        </h3>
          <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDate(new Date().toISOString().split('T')[0]); setIsCreateModalOpen(true); }} className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
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
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={isSaving}/>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="liters">Litros*</Label>
                        <Input id="liters" type="number" value={liters} onChange={(e) => setLiters(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Litros" min="0" step="0.01" disabled={isSaving}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="pricePerLiter">Preço/Litro (R$)*</Label>
                        <Input id="pricePerLiter" type="number" value={pricePerLiter} onChange={(e) => setPricePerLiter(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Preço/L" min="0" step="0.01" disabled={isSaving}/>
                    </div>
                </div>
                 <div className="space-y-1">
                    <Label>Valor Total</Label>
                    <p className="text-sm h-10 flex items-center px-3 py-2 rounded-md border border-input bg-muted">
                      {liters !== '' && pricePerLiter !== '' ? formatCurrency(Number(liters) * Number(pricePerLiter)) : 'R$ 0,00'}
                    </p>
                 </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Local*</Label>
                  <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Nome ou Endereço do Posto" disabled={isSaving}/>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comments">Observações</Label>
                  <Textarea id="comments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Detalhes adicionais (ex: Km no odômetro)" disabled={isSaving}/>
                </div>
                 {renderAttachmentInput('create')}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving || isUploading}>Cancelar</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSaving || isUploading} className="bg-primary hover:bg-primary/90">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isSaving ? 'Salvando...' : 'Salvar Abastecimento'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
      </div>

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
                        Tem certeza que deseja excluir este abastecimento de {fuelingToDelete ? formatDate(fuelingToDelete.date) : 'N/A'}? O comprovante anexado (se houver) também será excluído. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isSaving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteFueling} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Excluindo...' : 'Excluir'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>


      {loading ? (
           <div className="flex justify-center items-center h-20">
               <LoadingSpinner />
           </div>
       ) : fuelings.length === 0 ? (
        <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
          <CardContent>
            <p className="text-muted-foreground">Nenhum abastecimento registrado para esta viagem.</p>
              <Button variant="link" onClick={() => { resetForm(); setDate(new Date().toISOString().split('T')[0]); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
                Registrar o primeiro abastecimento
              </Button>
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
                    <Dialog>
                       <DialogTrigger asChild>
                           <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8">
                               <Eye className="h-4 w-4" />
                               <span className="sr-only">Visualizar Detalhes</span>
                           </Button>
                       </DialogTrigger>
                       <DialogContent>
                           <DialogHeader>
                               <DialogTitle>Detalhes do Abastecimento</DialogTitle>
                           </DialogHeader>
                           <div className="py-4 space-y-3">
                               <p><strong>Data:</strong> {formatDate(fueling.date)}</p>
                               <p><strong>Local:</strong> {fueling.location}</p>
                               <p><strong>Litros:</strong> {fueling.liters.toFixed(2)} L</p>
                               <p><strong>Preço/Litro:</strong> {formatCurrency(fueling.pricePerLiter)}</p>
                               <p><strong>Valor Total:</strong> {formatCurrency(fueling.totalCost)}</p>
                               <p><strong>Observações:</strong> {fueling.comments || 'Nenhuma'}</p>
                               <p><strong>Anexo:</strong> {fueling.receiptFilename ? (
                                   <a href={fueling.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                       <Paperclip className="h-4 w-4"/> {fueling.receiptFilename}
                                   </a>
                                   ) : 'Nenhum'}
                               </p>
                           </div>
                           <DialogFooter>
                               <DialogClose asChild>
                                   <Button variant="outline">Fechar</Button>
                               </DialogClose>
                           </DialogFooter>
                       </DialogContent>
                   </Dialog>
                    <Dialog open={isEditModalOpen && currentFueling?.id === fueling.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); else openEditModal(fueling); }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(fueling)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving}>
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
                            <Input id="editDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={isSaving}/>
                          </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="editLiters">Litros*</Label>
                                    <Input id="editLiters" type="number" value={liters} onChange={(e) => setLiters(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Litros" min="0" step="0.01" disabled={isSaving}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editPricePerLiter">Preço/Litro (R$)*</Label>
                                    <Input id="editPricePerLiter" type="number" value={pricePerLiter} onChange={(e) => setPricePerLiter(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Preço/L" min="0" step="0.01" disabled={isSaving}/>
                                </div>
                            </div>
                             <div className="space-y-1">
                                <Label>Valor Total</Label>
                                <p className="text-sm h-10 flex items-center px-3 py-2 rounded-md border border-input bg-muted">
                                  {liters !== '' && pricePerLiter !== '' ? formatCurrency(Number(liters) * Number(pricePerLiter)) : 'R$ 0,00'}
                                </p>
                             </div>
                          <div className="space-y-2">
                            <Label htmlFor="editLocation">Local*</Label>
                            <Input id="editLocation" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Nome ou Endereço do Posto" disabled={isSaving}/>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="editComments">Observações</Label>
                            <Textarea id="editComments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Detalhes adicionais" disabled={isSaving}/>
                          </div>
                          {renderAttachmentInput('edit')}
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving || isUploading}>Cancelar</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSaving || isUploading} className="bg-primary hover:bg-primary/90">
                               {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                               {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                      <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteConfirmation(fueling)} disabled={isSaving}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir</span>
                          </Button>
                      </AlertDialogTrigger>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Droplet className="h-4 w-4 flex-shrink-0 text-blue-500" />
                  <span>{fueling.liters.toFixed(2)} Litros @ {formatCurrency(fueling.pricePerLiter)}/L</span>
                </div>
                 <div className="flex items-center gap-2 font-semibold">
                   <span>Total:</span> {formatCurrency(fueling.totalCost)}
                 </div>
                {fueling.comments && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                     <span className="font-medium flex-shrink-0">Obs:</span> {fueling.comments}
                  </div>
                )}
                 {fueling.receiptFilename && (
                      <div className="flex items-center gap-2">
                         <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                         <a href={fueling.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                              {fueling.receiptFilename}
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
