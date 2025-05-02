
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Droplet, Loader, Paperclip, Camera, Upload, Check, X, Eye } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert components
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
  receiptUrl?: string; // URL or identifier for the attached receipt (PDF/Image)
  receiptFilename?: string; // Original filename or identifier
}

const initialFuelings: Fueling[] = [
  { id: 'f1', tripId: '1', vehicleId: 'v1', date: new Date(2024, 6, 21).toISOString(), liters: 100, pricePerLiter: 5.8, totalCost: 580, location: 'Posto Exemplo, 123', receiptUrl: 'mock/fuel1.jpg', receiptFilename: 'fuel1.jpg' },
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Form State ---
  const [date, setDate] = useState('');
  const [liters, setLiters] = useState<number | ''>('');
  const [pricePerLiter, setPricePerLiter] = useState<number | ''>('');
  const [location, setLocation] = useState('');
  const [comments, setComments] = useState('');

  // --- Attachment State ---
  const [attachment, setAttachment] = useState<File | string | null>(null); // Can be File object (PDF) or data URI (Image)
  const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);


  useEffect(() => {
    const filtered = tripId ? initialFuelings.filter(f => f.tripId === tripId) : initialFuelings;
    setFuelings(filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
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
                // setIsCameraOpen(false); // Optionally close
            }
        };

        getCameraPermission();

        // Cleanup function
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [isCameraOpen, toast]);


  // --- Helpers ---
  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pt-BR');
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
        const fileInput = document.getElementById('receiptPdf') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
        const editFileInput = document.getElementById('editReceiptPdf') as HTMLInputElement | null;
        if (editFileInput) editFileInput.value = '';
    };

    const simulateUpload = async (fileOrDataUrl: File | string): Promise<{ url: string, filename: string }> => {
        await new Promise(resolve => setTimeout(resolve, 500));
        let filename = '';
         if (typeof fileOrDataUrl === 'string') {
             filename = attachmentFilename || `upload_${Date.now()}.png`;
             console.log("Simulating upload for image data URI...");
         } else {
             filename = fileOrDataUrl.name;
             console.log(`Simulating upload for PDF: ${filename}`);
         }
        return { url: `simulated/path/${filename}`, filename: filename };
     };


  // --- Handlers ---
  const handleCreateFueling = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    if (!tripId) {
      toast({ variant: 'destructive', title: 'Erro', description: 'ID da viagem não encontrado para associar o abastecimento.' });
      setIsLoading(false);
      return;
    }
    if (!date || liters === '' || pricePerLiter === '' || !location) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Data, litros, preço/L e local são obrigatórios.' });
      setIsLoading(false);
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
             toast({ variant: "destructive", title: "Falha no Upload", description: "Não foi possível anexar o comprovante. Abastecimento será salvo sem anexo." });
             // Continue saving without attachment
         }
     }

    const newFueling: Fueling = {
      id: String(Date.now()),
      tripId,
      vehicleId: 'v1', // Replace with actual vehicle ID from trip context if available
      date,
      liters: Number(liters),
      pricePerLiter: Number(pricePerLiter),
      totalCost: Number(liters) * Number(pricePerLiter),
      location,
      comments,
      receiptUrl: receiptDetails.url,
      receiptFilename: receiptDetails.filename
    };
    initialFuelings.push(newFueling);
    setFuelings(prevFuelings => [newFueling, ...prevFuelings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    resetForm();
    setIsCreateModalOpen(false);
    setIsLoading(false);
    toast({ title: 'Abastecimento criado com sucesso!' });
  };

  const handleEditFueling = async (e: React.FormEvent) => {
    e.preventDefault();
     setIsLoading(true);
    if (!currentFueling) {
        setIsLoading(false);
        return;
    }
    if (!date || liters === '' || pricePerLiter === '' || !location) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Data, litros, preço/L e local são obrigatórios.' });
      setIsLoading(false);
      return;
    }

     // Simulate upload if attachment has changed or is new
     let receiptDetails: { url?: string; filename?: string } = {
         url: currentFueling.receiptUrl,
         filename: currentFueling.receiptFilename,
     };
     if (attachment && (attachment instanceof File || attachment !== currentFueling.receiptUrl)) {
         try {
             const { url, filename } = await simulateUpload(attachment);
             receiptDetails = { url: url, filename: filename };
         } catch (error) {
             console.error("Simulated upload failed:", error);
             toast({ variant: "destructive", title: "Falha no Upload", description: "Não foi possível atualizar o comprovante." });
              // Continue saving without updating attachment
         }
     } else if (!attachment && currentFueling.receiptUrl) {
         receiptDetails = { url: undefined, filename: undefined };
         console.log("Simulating deletion of old attachment:", currentFueling.receiptUrl);
     }


    const updatedFueling: Fueling = {
      ...currentFueling,
      date,
      liters: Number(liters),
      pricePerLiter: Number(pricePerLiter),
      totalCost: Number(liters) * Number(pricePerLiter),
      location,
      comments,
      receiptUrl: receiptDetails.url,
      receiptFilename: receiptDetails.filename,
    };
    const index = initialFuelings.findIndex(f => f.id === currentFueling.id);
    if (index !== -1) {
      initialFuelings[index] = updatedFueling;
    }
    setFuelings(prevFuelings => prevFuelings.map(f => f.id === currentFueling.id ? updatedFueling : f).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    resetForm();
    setIsEditModalOpen(false);
    setCurrentFueling(null);
    setIsLoading(false);
    toast({ title: 'Abastecimento atualizado com sucesso!' });
  };

  const handleDeleteFueling = (fuelingId: string) => {
     const fuelingToDelete = initialFuelings.find(f => f.id === fuelingId);
    const index = initialFuelings.findIndex(f => f.id === fuelingId);
    if (index !== -1) {
      initialFuelings.splice(index, 1);
    }
    setFuelings(fuelings.filter(f => f.id !== fuelingId));

     if (fuelingToDelete?.receiptUrl) {
         console.log("Simulating deletion of attachment:", fuelingToDelete.receiptUrl);
         // Call storage deletion function here
     }

    toast({ title: 'Abastecimento excluído.' });
    closeDeleteModal(); // Close the confirmation modal
  };

  const openEditModal = (fueling: Fueling) => {
    setCurrentFueling(fueling);
    setDate(fueling.date.split('T')[0]); // Set date in YYYY-MM-DD format for input type="date"
    setLiters(fueling.liters);
    setPricePerLiter(fueling.pricePerLiter);
    setLocation(fueling.location);
    setComments(fueling.comments || '');
     // Set attachment state based on existing fueling data
    if (fueling.receiptUrl) {
        setAttachment(fueling.receiptUrl); // Store URL/identifier
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
    setAttachment(null);
    setAttachmentFilename(null);
    setIsCameraOpen(false);
     const fileInput = document.getElementById('receiptPdf') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
    const editFileInput = document.getElementById('editReceiptPdf') as HTMLInputElement | null;
    if (editFileInput) editFileInput.value = '';
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


  return (
    <> {/* Use Fragment */}
     {/* Hidden Canvas for Image Capture */}
    <canvas ref={canvasRef} style={{ display: 'none' }} />

    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">
          {tripName ? `Abastecimentos da Viagem: ${tripName}` : 'Abastecimentos'}
        </h3>
        {tripId && (
          <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDate(new Date().toISOString().split('T')[0]); setIsCreateModalOpen(true); }} className="bg-accent hover:bg-accent/90 text-accent-foreground">
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
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="liters">Litros*</Label>
                        <Input id="liters" type="number" value={liters} onChange={(e) => setLiters(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Litros" min="0" step="0.01" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="pricePerLiter">Preço/Litro (R$)*</Label>
                        <Input id="pricePerLiter" type="number" value={pricePerLiter} onChange={(e) => setPricePerLiter(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Preço/L" min="0" step="0.01"/>
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
                  <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Nome ou Endereço do Posto" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comments">Observações</Label>
                  <Textarea id="comments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Detalhes adicionais (ex: Km no odômetro)" />
                </div>

                 {/* Attachment Input */}
                 {renderAttachmentInput('create')}

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


      {fuelings.length === 0 ? (
        <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
          <CardContent>
            <p className="text-muted-foreground">Nenhum abastecimento registrado {tripId ? 'para esta viagem' : ''}.</p>
            {tripId && (
              <Button variant="link" onClick={() => { resetForm(); setDate(new Date().toISOString().split('T')[0]); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
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
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="editLiters">Litros*</Label>
                                    <Input id="editLiters" type="number" value={liters} onChange={(e) => setLiters(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Litros" min="0" step="0.01" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editPricePerLiter">Preço/Litro (R$)*</Label>
                                    <Input id="editPricePerLiter" type="number" value={pricePerLiter} onChange={(e) => setPricePerLiter(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="Preço/L" min="0" step="0.01"/>
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
                            <Input id="editLocation" value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="Nome ou Endereço do Posto" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="editComments">Observações</Label>
                            <Textarea id="editComments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Detalhes adicionais" />
                          </div>

                          {/* Edit Attachment Input */}
                          {renderAttachmentInput('edit')}


                          <DialogFooter>
                            <DialogClose asChild>
                              <Button type="button" variant="outline" onClick={closeEditModal}>Cancelar</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90">
                               {isLoading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar Alterações
                            </Button>
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
                              Tem certeza que deseja excluir este abastecimento de {formatDate(fueling.date)}? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={closeDeleteModal}>Cancelar</AlertDialogCancel>
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
                 {/* Attachment Link */}
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
    </> // Close Fragment
  );
};
