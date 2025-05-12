// src/components/Vehicle.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, CalendarDays, Gauge, Fuel, Milestone, Users, Loader2, FileUp } from 'lucide-react'; // Added FileUp
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
    addLocalVehicle,
    updateLocalVehicle,
    deleteLocalVehicle,
    getLocalVehicles,
    LocalVehicle,
} from '@/services/localDbService';
import { getVehicles as fetchOnlineVehicles } from '@/services/firestoreService';
import { LoadingSpinner } from './LoadingSpinner';
import { v4 as uuidv4 } from 'uuid';

export interface VehicleInfo extends Omit<LocalVehicle, 'syncStatus' | 'deleted' | 'localId'> {
  id: string;
}


export const Vehicle: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState<VehicleInfo | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<VehicleInfo | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [licensePlate, setLicensePlate] = useState('');

  useEffect(() => {
    const fetchVehiclesData = async () => {
      setLoading(true);
      try {
          let localVehicles = await getLocalVehicles();
          if (localVehicles.length === 0 && navigator.onLine) {
               console.log("[Vehicle] No local vehicles, fetching online...");
               try {
                   const onlineVehicles = await fetchOnlineVehicles();
                    const savePromises = onlineVehicles.map(v => {
                        const localId = `local_vehicle_${uuidv4()}`;
                        // Correctly structure data for addLocalVehicle which expects Omit<VehicleInfo, 'id'>
                        const vehicleDataForAdd: Omit<VehicleInfo, 'id'> = {
                            model: v.model,
                            year: v.year,
                            licensePlate: v.licensePlate,
                            // firebaseId is part of LocalVehicle, not directly in VehicleInfo for addLocalVehicle
                        };
                        return addLocalVehicle(vehicleDataForAdd, v.id); // Pass firebaseId separately if needed by addLocalVehicle
                    });
                   await Promise.all(savePromises);
                   localVehicles = await getLocalVehicles(); // Re-fetch after saving

               } catch (fetchError: any) { // Ensure 'any' or specific error type
                   console.error("Error fetching/saving online vehicles:", fetchError);
                   toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível buscar ou salvar veículos online." });
               }
          }
          setVehicles(localVehicles.map(lv => ({
                id: lv.firebaseId || lv.localId,
                model: lv.model,
                year: lv.year,
                licensePlate: lv.licensePlate
           } as VehicleInfo)));
      } catch (error) {
        console.error("Error fetching local vehicles:", error);
        toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar os veículos locais." });
      } finally {
        setLoading(false);
      }
    };
    fetchVehiclesData();
  }, [toast]);

  const _createNewVehicle = async (
    vehicleModel: string,
    vehicleYear: number,
    vehicleLicensePlate: string,
    firebaseId?: string // Optional firebaseId for seeding/importing
  ): Promise<boolean> => {
    const vehicleDataForAdd: Omit<VehicleInfo, 'id'> = {
      model: vehicleModel,
      year: vehicleYear,
      licensePlate: vehicleLicensePlate.toUpperCase(),
    };

    try {
        // addLocalVehicle now takes an optional firebaseId
        const assignedLocalId = await addLocalVehicle(vehicleDataForAdd, firebaseId);
        const createdVehicleUI: VehicleInfo = {
             id: firebaseId || assignedLocalId, // Prefer firebaseId if it exists (e.g. from online fetch)
             model: vehicleDataForAdd.model,
             year: vehicleDataForAdd.year,
             licensePlate: vehicleDataForAdd.licensePlate,
         };
        setVehicles(prevVehicles => [createdVehicleUI, ...prevVehicles].sort((a,b)=> a.model.localeCompare(b.model)));
        return true;
    } catch (error) {
        console.error("Error adding local vehicle:", error);
        toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível adicionar o veículo ${vehicleModel} (${vehicleLicensePlate}) localmente. Detalhe: ${(error as Error).message}` });
        return false;
    }
  };


  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !year || !licensePlate) {
      toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
      return;
    }
     if (Number(year) < 1900 || Number(year) > new Date().getFullYear() + 1) {
        toast({ variant: "destructive", title: "Erro", description: "Ano do veículo inválido." });
        return;
      }
    setIsSaving(true);
    const success = await _createNewVehicle(model, Number(year), licensePlate);
    setIsSaving(false);

    if(success){
        resetForm();
        setIsCreateModalOpen(false);
        toast({ title: "Veículo adicionado localmente!" });
    }
  };

   const handleEditVehicle = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentVehicle) return;
      if (!model || !year || !licensePlate) {
         toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
         return;
       }
        if (Number(year) < 1900 || Number(year) > new Date().getFullYear() + 1) {
           toast({ variant: "destructive", title: "Erro", description: "Ano do veículo inválido." });
           return;
         }

      const originalLocalVehicle = await getLocalVehicles().then(vehicles => vehicles.find(v => v.localId === currentVehicle.id || v.firebaseId === currentVehicle.id));

       if (!originalLocalVehicle) {
           toast({ variant: "destructive", title: "Erro", description: "Veículo original não encontrado localmente." });
           return;
       }


     const updatedLocalData: LocalVehicle = {
       ...originalLocalVehicle,
       model,
       year: Number(year),
       licensePlate: licensePlate.toUpperCase(),
       syncStatus: originalLocalVehicle.syncStatus === 'synced' ? 'pending' : originalLocalVehicle.syncStatus,
       // id field in LocalVehicle is its localId or firebaseId if synced
       id: originalLocalVehicle.id,
     };

     setIsSaving(true);
     try {
         await updateLocalVehicle(updatedLocalData);
          const updatedVehicleUI: VehicleInfo = {
             id: currentVehicle.id, // Keep the original UI id (firebaseId or localId)
             model: updatedLocalData.model,
             year: updatedLocalData.year,
             licensePlate: updatedLocalData.licensePlate
          };
          setVehicles(prevVehicles => prevVehicles.map(v => v.id === currentVehicle.id ? updatedVehicleUI : v).sort((a,b)=> a.model.localeCompare(b.model)));

         resetForm();
         setIsEditModalOpen(false);
         setCurrentVehicle(null);
         toast({ title: "Veículo atualizado localmente!" });
     } catch (error) {
          console.error("Error updating local vehicle:", error);
          toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível atualizar o veículo localmente." });
     } finally {
          setIsSaving(false);
     }
   };

   const confirmDeleteVehicle = async () => {
        if (!vehicleToDelete) return;
        const originalLocalVehicle = await getLocalVehicles().then(vehicles => vehicles.find(v => v.localId === vehicleToDelete.id || v.firebaseId === vehicleToDelete.id));

        if (!originalLocalVehicle) {
             toast({ variant: "destructive", title: "Erro", description: "Veículo original não encontrado localmente." });
             closeDeleteModal();
             return;
        }

        setIsSaving(true);
        try {
            await deleteLocalVehicle(originalLocalVehicle.localId);
            setVehicles(prevVehicles => prevVehicles.filter(v => v.id !== vehicleToDelete.id));
            toast({ title: "Veículo marcado para exclusão localmente." });
            closeDeleteModal();
        } catch (error) {
             console.error("Error marking local vehicle for deletion:", error);
             toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível marcar veículo para exclusão." });
        } finally {
            setIsSaving(false);
        }
   };

  const openEditModal = (vehicle: VehicleInfo) => {
    setCurrentVehicle(vehicle);
    setModel(vehicle.model);
    setYear(vehicle.year);
    setLicensePlate(vehicle.licensePlate);
    setIsEditModalOpen(true);
  };

   const openDeleteModal = (vehicle: VehicleInfo) => {
      setVehicleToDelete(vehicle);
      setIsDeleteModalOpen(true);
    };

    const closeDeleteModal = () => {
      setVehicleToDelete(null);
      setIsDeleteModalOpen(false);
    };


  const resetForm = () => {
    setModel('');
    setYear('');
    setLicensePlate('');
  };

   const closeCreateModal = () => {
     resetForm();
     setIsCreateModalOpen(false);
   }

   const closeEditModal = () => {
      resetForm();
      setIsEditModalOpen(false);
      setCurrentVehicle(null);
    }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("handleFileImport triggered. Event:", event);
    const file = event.target.files?.[0];
    if (!file) {
        toast({ variant: 'destructive', title: 'Nenhum arquivo selecionado.' });
        return;
    }
    if (file.type !== 'text/csv') {
        toast({ variant: 'destructive', title: 'Tipo de arquivo inválido.', description: 'Por favor, selecione um arquivo CSV.' });
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const csvString = e.target?.result as string;
        if (csvString) {
            await processImportedCsv(csvString);
        } else {
            toast({ variant: 'destructive', title: 'Erro ao ler arquivo.' });
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    reader.onerror = () => {
        toast({ variant: 'destructive', title: 'Erro ao ler arquivo.' });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    reader.readAsText(file);
  };

  const processImportedCsv = async (csvString: string) => {
    const lines = csvString.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) {
        toast({ variant: 'destructive', title: 'Arquivo CSV inválido', description: 'O arquivo deve conter um cabeçalho e pelo menos uma linha de dados.' });
        return;
    }

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const modeloIndex = header.indexOf('modelo');
    const placaIndex = header.indexOf('placa');
    const anoIndex = header.indexOf('ano');

    if (modeloIndex === -1 || placaIndex === -1) {
        toast({ variant: 'destructive', title: 'Cabeçalho CSV inválido', description: 'Esperado: Modelo, Placa (Ano é opcional).' });
        return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    setIsSaving(true);
    try {
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const vehicleModel = values[modeloIndex];
            const vehicleLicensePlate = values[placaIndex];
            const vehicleYearString = anoIndex !== -1 ? values[anoIndex] : null;

            let vehicleYear = new Date().getFullYear();
            if (vehicleYearString) {
                const parsedYear = parseInt(vehicleYearString, 10);
                if (!isNaN(parsedYear) && parsedYear > 1900 && parsedYear <= new Date().getFullYear() + 1) {
                    vehicleYear = parsedYear;
                } else {
                    errors.push(`Linha ${i + 1}: Ano '${vehicleYearString}' inválido para ${vehicleModel} (${vehicleLicensePlate}). Usando ano atual.`);
                }
            }

            if (!vehicleModel || !vehicleLicensePlate) {
                errors.push(`Linha ${i + 1}: Modelo ou Placa faltando.`);
                errorCount++;
                continue;
            }
            if (!/^[A-Z0-9]{6,7}$/i.test(vehicleLicensePlate.replace(/-/g, ''))) {
                 errors.push(`Linha ${i + 1}: Formato de placa inválido para ${vehicleLicensePlate}.`);
                 errorCount++;
                 continue;
            }

            const created = await _createNewVehicle(vehicleModel, vehicleYear, vehicleLicensePlate);
            if (created) {
                successCount++;
            } else {
                errorCount++;
            }
        }
    } catch (importError) {
        console.error("Error during CSV processing loop:", importError);
        toast({ variant: "destructive", title: "Erro na Importação", description: "Ocorreu um erro inesperado durante o processamento do arquivo." });
        errorCount = lines.length - 1; // Assume all potentially failed
        successCount = 0;
    } finally {
        setIsSaving(false);
    }


    if (successCount > 0) {
        toast({ title: 'Importação Concluída', description: `${successCount} veículo(s) importado(s) com sucesso.` });
    }
    if (errorCount > 0 || errors.length > 0) {
        const detailedErrors = errors.slice(0,3).join('; ') + (errors.length > 3 ? '...' : '');
        toast({
            variant: 'destructive',
            title: 'Erros na Importação',
            description: `${errorCount} veículo(s) não puderam ser importados. ${detailedErrors ? `Detalhes: ${detailedErrors}` : ''}`,
            duration: 10000
        });
    }
    if (successCount === 0 && errorCount === 0 && lines.length > 1 && errors.length === 0) { // Check errors.length too
        toast({ variant: 'default', title: 'Importação', description: 'Nenhum veículo novo para importar ou todos já existem/contêm erros.' });
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Gerenciar Veículos</h2>
        <div className="flex gap-2">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileImport}
                accept=".csv"
                className="hidden"
                id="import-csv-vehicles-input"
            />
            <Button
                onClick={() => {
                    console.log("Import button clicked. fileInputRef.current:", fileInputRef.current);
                    if (fileInputRef.current) {
                        fileInputRef.current.click();
                    } else {
                        console.error("File input ref is not available.");
                        toast({ variant: "destructive", title: "Erro", description: "Não foi possível abrir o seletor de arquivos. Tente novamente." });
                    }
                }}
                variant="outline"
                className="text-primary-foreground bg-green-600 hover:bg-green-700"
                disabled={isSaving}
            >
                <FileUp className="mr-2 h-4 w-4" /> Importar Veículos
            </Button>
            <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
              <DialogTrigger asChild>
                 <Button onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Veículo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Cadastrar Novo Veículo</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddVehicle} className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="model">Modelo*</Label>
                    <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} required placeholder="Ex: Scania R450" disabled={isSaving} />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="year">Ano*</Label>
                     <Input id="year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) > 0 ? Number(e.target.value) : '')} required placeholder="Ex: 2023" min="1900" max={new Date().getFullYear() + 1} disabled={isSaving}/>
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="licensePlate">Placa*</Label>
                     <Input id="licensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value.toUpperCase())} required placeholder="Ex: BRA2E19" disabled={isSaving}/>
                   </div>
                  <DialogFooter>
                     <DialogClose asChild>
                        <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button>
                     </DialogClose>
                     <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Salvando...' : 'Salvar Veículo Local'}
                     </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
        </div>
      </div>

       {loading ? (
          <div className="flex justify-center items-center h-40">
              <LoadingSpinner />
          </div>
       ) : vehicles.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhum veículo encontrado localmente.</p>
           </CardContent>
         </Card>
       ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="shadow-sm transition-shadow hover:shadow-md bg-card border border-border">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                   <CardTitle className="text-lg font-semibold text-primary">{vehicle.model}</CardTitle>
                   <CardDescription className="text-sm text-muted-foreground flex items-center gap-1">
                     <Gauge className="h-3 w-3" /> Placa: {vehicle.licensePlate}
                   </CardDescription>
                   <CardDescription className="text-sm text-muted-foreground flex items-center gap-1">
                       <CalendarDays className="h-3 w-3" /> Ano: {vehicle.year}
                   </CardDescription>
                </div>
                 <div className="flex gap-1">
                     <Dialog open={isEditModalOpen && currentVehicle?.id === vehicle.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); else openEditModal(vehicle); }}>
                       <DialogTrigger asChild>
                         <Button variant="ghost" size="icon" onClick={() => openEditModal(vehicle)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving}>
                           <Edit className="h-4 w-4" />
                           <span className="sr-only">Editar Veículo</span>
                         </Button>
                       </DialogTrigger>
                       <DialogContent className="sm:max-w-[425px]">
                         <DialogHeader>
                           <DialogTitle>Editar Veículo</DialogTitle>
                         </DialogHeader>
                         <form onSubmit={handleEditVehicle} className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="editModel">Modelo*</Label>
                                <Input id="editModel" value={model} onChange={(e) => setModel(e.target.value)} required disabled={isSaving} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editYear">Ano*</Label>
                                <Input id="editYear" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) > 0 ? Number(e.target.value) : '')} required min="1900" max={new Date().getFullYear() + 1} disabled={isSaving} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editLicensePlate">Placa*</Label>
                                <Input id="editLicensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value.toUpperCase())} required disabled={isSaving} />
                            </div>
                           <DialogFooter>
                              <DialogClose asChild>
                                 <Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button>
                              </DialogClose>
                              <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSaving ? 'Salvando...' : 'Salvar Alterações Locais'}
                              </Button>
                           </DialogFooter>
                         </form>
                       </DialogContent>
                     </Dialog>

                      <AlertDialog open={isDeleteModalOpen && vehicleToDelete?.id === vehicle.id} onOpenChange={(isOpen) => !isOpen && closeDeleteModal()}>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteModal(vehicle)} disabled={isSaving}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir Veículo</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja marcar o veículo {vehicle.model} ({vehicle.licensePlate}) para exclusão? A exclusão definitiva ocorrerá na próxima sincronização.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={closeDeleteModal} disabled={isSaving}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={confirmDeleteVehicle}
                              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                              disabled={isSaving}
                            >
                              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {isSaving ? 'Marcando...' : 'Marcar para Excluir'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                 </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground pt-2">
                 <p className="flex items-center gap-1"><Fuel className="h-3 w-3" /> Histórico de Abastecimentos</p>
                 <p className="flex items-center gap-1"><Milestone className="h-3 w-3" /> Km Percorridos & Performance</p>
                 <p className="flex items-center gap-1"><Users className="h-3 w-3" /> Motoristas que utilizaram</p>
                 <Button variant="link" size="sm" className="p-0 h-auto text-primary" onClick={() => toast({title: 'Funcionalidade em breve', description: 'Detalhes do histórico do veículo serão implementados.'})}>
                    Ver Histórico Completo
                 </Button>
              </CardContent>
            </Card>
          ))}
        </div>
       )}
    </div>
  );
};