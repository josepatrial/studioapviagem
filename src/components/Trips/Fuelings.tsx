// src/components/Trips/Fuelings.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Droplet, Paperclip, Camera, Upload, Check, X, Eye, Loader2, TrendingUp, Car } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import {
    addLocalFueling,
    updateLocalFueling,
    deleteLocalFueling,
    getLocalFuelings,
    LocalFueling
} from '@/services/localDbService';
import { uploadReceipt, deleteReceipt } from '@/services/storageService';
import { cn } from '@/lib/utils';
import { formatKm } from '@/lib/utils';

export interface Fueling extends Omit<LocalFueling, 'localId' | 'tripLocalId'> {
  id: string;
  tripId: string; // This is actually tripLocalId in this context
  userId: string; // Added to ensure ownership is tracked
  syncStatus?: 'pending' | 'synced' | 'error';
  odometerKm: number;
  fuelType: string;
}

interface FuelingsProps {
  tripId: string; // This is tripLocalId
  tripName?: string;
  vehicleId: string;
  ownerUserId: string; // User ID of the trip's owner
}

const fuelTypes = ['Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel Comum', 'Diesel S10', 'GNV'];

export const Fuelings: React.FC<FuelingsProps> = ({ tripId: tripLocalId, tripName, vehicleId: tripVehicleId, ownerUserId }) => {
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentFueling, setCurrentFueling] = useState<Fueling | null>(null);
  const [fuelingToDelete, setFuelingToDelete] = useState<Fueling | null>(null);
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [date, setDate] = useState('');
  const [liters, setLiters] = useState<number | ''>('');
  const [pricePerLiter, setPricePerLiter] = useState<number | ''>('');
  const [location, setLocation] = useState('');
  const [comments, setComments] = useState('');
  const [odometerKm, setOdometerKm] = useState<number | ''>('');
  const [fuelType, setFuelType] = useState('');

  const [attachment, setAttachment] = useState<File | string | null>(null);
  const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

   useEffect(() => {
    const fetchFuelingsData = async () => {
        if (!tripLocalId) return;
        setLoading(true);
        try {
            const localFuelings = await getLocalFuelings(tripLocalId);
            const uiFuelings = localFuelings.map(lf => ({
                ...lf,
                id: lf.firebaseId || lf.localId,
                tripId: lf.tripLocalId,
                userId: lf.userId || ownerUserId, // Ensure userId is present
                syncStatus: lf.syncStatus,
                odometerKm: lf.odometerKm,
                fuelType: lf.fuelType
            })).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setFuelings(uiFuelings);
        } catch (error) {
            console.error(`Error fetching local fuelings for trip ${tripLocalId}:`, error);
            toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar os abastecimentos locais." });
        } finally {
            setLoading(false);
        }
    };
    fetchFuelingsData();
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

  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
   const formatDateDisplay = (dateString: string) => { // Renamed
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

  const handleCreateFueling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripVehicleId) {
        toast({ variant: 'destructive', title: 'Erro', description: 'ID do Veículo não encontrado para este abastecimento.' });
        return;
    }

    if (!date || liters === '' || pricePerLiter === '' || !location || odometerKm === '' || !fuelType) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Data, litros, preço/L, tipo de combustível, local e KM do odômetro são obrigatórios.' });
      return;
    }
    const litersNum = Number(liters);
    const priceNum = Number(pricePerLiter);
    const odometerNum = Number(odometerKm);
     if (litersNum <= 0 || priceNum <= 0 || odometerNum <= 0) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Litros, Preço/Litro e KM do odômetro devem ser maiores que zero.' });
        return;
     }

     setIsSaving(true);
     const newFuelingData: Omit<LocalFueling, 'localId' | 'syncStatus' | 'receiptUrl' | 'receiptPath'> = {
       tripLocalId: tripLocalId,
       userId: ownerUserId, // Associate with the trip owner
       vehicleId: tripVehicleId,
       date: new Date(date).toISOString(),
       liters: litersNum,
       pricePerLiter: priceNum,
       totalCost: litersNum * priceNum,
       location,
       comments,
       odometerKm: odometerNum,
       fuelType,
       receiptFilename: attachmentFilename || undefined,
       receiptUrl: typeof attachment === 'string' ? attachment : undefined,
       deleted: false, // Initialize deleted as false
     };

     try {
         const localId = await addLocalFueling(newFuelingData);
          const newUIFueling: Fueling = {
             ...newFuelingData,
             localId: localId,
             id: localId,
             tripId: tripLocalId,
             userId: ownerUserId,
             syncStatus: 'pending'
          };
         setFuelings(prevFuelings => [newUIFueling, ...prevFuelings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
         resetForm();
         setIsCreateModalOpen(false);
         toast({ title: 'Abastecimento criado localmente!' });
     } catch (error) {
         console.error("Error adding local fueling:", error);
         toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível salvar o abastecimento localmente." });
     } finally {
         setIsSaving(false);
     }
  };

  const handleEditFueling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFueling) return;
    
    if (!tripVehicleId) {
        toast({ variant: 'destructive', title: 'Erro', description: 'ID do Veículo não encontrado para este abastecimento.' });
        return;
    }

    if (!date || liters === '' || pricePerLiter === '' || !location || odometerKm === '' || !fuelType) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Data, litros, preço/L, tipo de combustível, local e KM do odômetro são obrigatórios.' });
      return;
    }
     const litersNum = Number(liters);
     const priceNum = Number(pricePerLiter);
     const odometerNum = Number(odometerKm);
      if (litersNum <= 0 || priceNum <= 0 || odometerNum <= 0) {
         toast({ variant: 'destructive', title: 'Erro', description: 'Litros, Preço/Litro e KM do odômetro devem ser maiores que zero.' });
         return;
      }

       const originalLocalFueling = await getLocalFuelings(tripLocalId).then(fuelings => fuelings.find(f => f.localId === currentFueling.id || f.firebaseId === currentFueling.id));
        if (!originalLocalFueling) {
             toast({ variant: "destructive", title: "Erro", description: "Abastecimento original não encontrado localmente." });
             return;
         }

     setIsSaving(true);
     const updatedLocalFuelingData: LocalFueling = {
        ...originalLocalFueling,
        userId: ownerUserId, // Ensure ownerUserId is set
        date: new Date(date).toISOString(),
        liters: litersNum,
        pricePerLiter: priceNum,
        totalCost: litersNum * priceNum,
        location,
        comments,
        odometerKm: odometerNum,
        fuelType,
        vehicleId: tripVehicleId,
        receiptUrl: typeof attachment === 'string' ? attachment : (attachment === null ? undefined : originalLocalFueling.receiptUrl),
        receiptFilename: attachmentFilename || (attachment === null ? undefined : originalLocalFueling.receiptFilename),
        syncStatus: originalLocalFueling.syncStatus === 'synced' ? 'pending' : originalLocalFueling.syncStatus,
        deleted: originalLocalFueling.deleted || false,
     };

    try {
        await updateLocalFueling(updatedLocalFuelingData);
        const updatedUIFueling: Fueling = {
             ...updatedLocalFuelingData,
             id: updatedLocalFuelingData.firebaseId || updatedLocalFuelingData.localId,
             tripId: tripLocalId,
             userId: ownerUserId,
             syncStatus: updatedLocalFuelingData.syncStatus
        };
        setFuelings(prevFuelings => prevFuelings.map(f => f.id === currentFueling.id ? updatedUIFueling : f).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        resetForm();
        setIsEditModalOpen(false);
        setCurrentFueling(null);
        toast({ title: 'Abastecimento atualizado localmente!' });
    } catch (error) {
        console.error("Error updating local fueling:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar o abastecimento localmente." });
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
     const localIdToDelete = fuelingToDelete.id;
    setIsSaving(true);
    try {
        const fuelingsInDb = await getLocalFuelings(tripLocalId);
        const fuelingRecordToDelete = fuelingsInDb.find(f => f.localId === localIdToDelete || f.firebaseId === localIdToDelete);
         if (!fuelingRecordToDelete) {
             throw new Error("Registro local do abastecimento não encontrado para exclusão.");
         }
        await deleteLocalFueling(fuelingRecordToDelete.localId);
        setFuelings(fuelings.filter(f => f.id !== fuelingToDelete.id));
        toast({ title: 'Abastecimento marcado para exclusão na próxima sincronização.' });
        closeDeleteConfirmation();
    } catch (error) {
        console.error("Error marking local fueling for deletion:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível marcar o abastecimento para exclusão." });
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
    setOdometerKm(fueling.odometerKm);
    setFuelType(fueling.fuelType || '');

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
    setOdometerKm('');
    setFuelType('');
    clearAttachment();
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
        <h3 className="text-xl font-semibold">
          {tripName ? `Abastecimentos da Viagem: ${tripName}` : 'Abastecimentos'}
        </h3>
        {tripLocalId && (
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
                <div className="space-y-2">
                    <Label htmlFor="fuelType">Tipo de Combustível*</Label>
                    <Select onValueChange={setFuelType} value={fuelType} required disabled={isSaving}>
                        <SelectTrigger id="fuelType">
                            <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                            {fuelTypes.map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="odometerKm">KM no Odômetro*</Label>
                    <Input id="odometerKm" type="number" value={odometerKm} onChange={(e) => setOdometerKm(Number(e.target.value) >= 0 ? Number(e.target.value) : '')} required placeholder="KM do veículo" min="0" disabled={isSaving}/>
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
                  <Textarea id="comments" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Detalhes adicionais" disabled={isSaving}/>
                </div>
                 {renderAttachmentInput('create')}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isSaving ? 'Salvando...' : 'Salvar Abastecimento Local'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

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

        <AlertDialog open={isDeleteModalOpen} onOpenChange={closeDeleteConfirmation}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja marcar este abastecimento de {fuelingToDelete ? formatDateDisplay(fuelingToDelete.date) : 'N/A'} para exclusão? A exclusão definitiva ocorrerá na próxima sincronização.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeDeleteConfirmation} disabled={isSaving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteFueling} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSaving}>
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
       ) : fuelings.length === 0 ? (
        <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
          <CardContent>
            <p className="text-muted-foreground">Nenhum abastecimento registrado localmente para esta viagem.</p>
            {tripLocalId && (
              <Button variant="link" onClick={() => { resetForm(); setDate(new Date().toISOString().split('T')[0]); setIsCreateModalOpen(true); }} className="mt-2 text-primary">
                Registrar o primeiro abastecimento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {fuelings.map((fueling) => (
            <Card key={fueling.id} className={cn("shadow-sm transition-shadow hover:shadow-md bg-card border border-border", fueling.syncStatus === 'pending' && 'border-yellow-500', fueling.syncStatus === 'error' && 'border-destructive')}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Abastecimento - {formatDateDisplay(fueling.date)}</CardTitle>
                    <CardDescription>
                      {fueling.location} - {formatKm(fueling.odometerKm)}
                        {fueling.syncStatus === 'pending' && <span className="ml-2 text-xs text-yellow-600">(Pendente)</span>}
                        {fueling.syncStatus === 'error' && <span className="ml-2 text-xs text-destructive">(Erro Sinc)</span>}
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
                               <p><strong>Data:</strong> {formatDateDisplay(fueling.date)}</p>
                               <p><strong>Local:</strong> {fueling.location}</p>
                               <p><strong>Tipo de Combustível:</strong> {fueling.fuelType}</p>
                               <p><strong>KM no Odômetro:</strong> {formatKm(fueling.odometerKm)}</p>
                               <p><strong>Litros:</strong> {fueling.liters.toFixed(2)} L</p>
                               <p><strong>Preço/Litro:</strong> {formatCurrency(fueling.pricePerLiter)}</p>
                               <p><strong>Valor Total:</strong> {formatCurrency(fueling.totalCost)}</p>
                               <p><strong>Observações:</strong> {fueling.comments || 'Nenhuma'}</p>
                               <p><strong>Anexo:</strong> {fueling.receiptFilename ? (
                                   <a href={fueling.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                       {fueling.receiptUrl?.startsWith('data:image') ? <img src={fueling.receiptUrl} alt="Preview" className="h-6 w-6 object-cover rounded"/> : <Paperclip className="h-4 w-4"/>}
                                       {fueling.receiptFilename}
                                   </a>
                                   ) : 'Nenhum'}
                               </p>
                               <p className="text-xs text-muted-foreground">Status Sinc: {fueling.syncStatus || 'N/A'}</p>
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
                            <div className="space-y-2">
                                <Label htmlFor="editFuelType">Tipo de Combustível*</Label>
                                <Select onValueChange={setFuelType} value={fuelType} required disabled={isSaving}>
                                    <SelectTrigger id="editFuelType">
                                        <SelectValue placeholder="Selecione o tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fuelTypes.map((type) => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="editOdometerKm">KM no Odômetro*</Label>
                                <Input id="editOdometerKm" type="number" value={odometerKm} onChange={(e) => setOdometerKm(Number(e.target.value) >=0 ? Number(e.target.value) : '')} required placeholder="KM do veículo" min="0" disabled={isSaving}/>
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
                              <Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90">
                               {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                               {isSaving ? 'Salvando...' : 'Salvar Alterações Locais'}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteConfirmation(fueling)} disabled={isSaving}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir</span>
                          </Button>
                        </AlertDialogTrigger>
                      </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Droplet className="h-4 w-4 flex-shrink-0 text-blue-500" />
                  <span>{fueling.liters.toFixed(2)} Litros @ {formatCurrency(fueling.pricePerLiter)}/L ({fueling.fuelType})</span>
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
                          {fueling.receiptUrl?.startsWith('data:image') ? (
                              <img src={fueling.receiptUrl} alt="Preview" className="h-6 w-6 object-cover rounded"/>
                          ) : (
                              <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          )}
                         <a href={fueling.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate" title={fueling.receiptFilename}>
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
export default Fuelings;
