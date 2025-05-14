// src/components/Vehicle.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, CalendarDays, Gauge, Fuel, Milestone, Users, Loader2, FileUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
    addLocalDbVehicle,
    updateLocalDbVehicle,
    deleteLocalDbVehicle,
    getLocalVehicles,
    LocalVehicle,
} from '@/services/localDbService';
import { getVehicles as fetchOnlineVehicles } from '@/services/firestoreService';
import { LoadingSpinner } from './LoadingSpinner';
import { v4 as uuidv4 } from 'uuid';

export interface VehicleInfo extends Omit<LocalVehicle, 'syncStatus' | 'deleted' | 'localId'> {
  id: string;
}

// Helper function to parse CSV data with improved logging and quote handling
const parseVehicleCSV = (csvText: string): Record<string, string>[] => {
    console.log("[parseVehicleCSV] Starting CSV parsing. Raw text preview:", csvText.substring(0, 200));
    const lines = csvText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) {
        console.warn("[parseVehicleCSV] CSV has less than 2 lines (header + data). Returning empty.");
        return [];
    }

    const headerLine = lines[0].trim();
    console.log("[parseVehicleCSV] Raw Header line:", headerLine);

    const headerMap: Record<string, string> = {
        'modelo': 'modelo',
        'model': 'modelo',
        'placa': 'placa',
        'licenseplate': 'placa',
        'license plate': 'placa',
        'licencaplate': 'placa',
        'ano': 'ano',
        'year': 'ano'
    };

    // Get actual headers from the CSV
    const actualHeaders = headerLine.split(',').map(h => {
      let cleanHeader = h.trim();
      if (cleanHeader.startsWith('"') && cleanHeader.endsWith('"')) {
        cleanHeader = cleanHeader.substring(1, cleanHeader.length - 1).trim();
      }
      return cleanHeader.toLowerCase(); // Use actual lowercase header from CSV for mapping
    });
    console.log("[parseVehicleCSV] Actual Headers from CSV:", JSON.stringify(actualHeaders));

    const normalizedHeaders = actualHeaders.map(h => headerMap[h] || h);
    console.log("[parseVehicleCSV] Normalized Headers for internal use:", JSON.stringify(normalizedHeaders));


    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            console.log(`[parseVehicleCSV] Skipping empty line ${i + 1}.`);
            continue;
        }
        // console.log(`[parseVehicleCSV] Processing data line ${i + 1}:`, line);

        const values = line.split(',');
        // console.log(`[parseVehicleCSV] Values after split for line ${i + 1}:`, JSON.stringify(values));

        const entry: Record<string, string> = {};
        let hasModelo = false;
        let hasPlaca = false;

        for (let j = 0; j < actualHeaders.length; j++) { // Iterate up to the number of actual headers found
            const normalizedHeaderName = normalizedHeaders[j]; // Use the normalized header name for the key in `entry`
            let value = values[j]?.trim() || '';
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.substring(1, value.length - 1).trim();
            }
            entry[normalizedHeaderName] = value; // Use normalized header for consistent access
            if (normalizedHeaderName === 'modelo' && value) hasModelo = true;
            if (normalizedHeaderName === 'placa' && value) hasPlaca = true;
        }
        // console.log(`[parseVehicleCSV] Parsed entry for line ${i + 1}:`, JSON.stringify(entry));
        // console.log(`[parseVehicleCSV] Line ${i + 1} - hasModelo: ${hasModelo}, hasPlaca: ${hasPlaca}`);

        // Check if the *normalized* essential headers 'modelo' and 'placa' were found AND have values
        const modeloValue = entry['modelo'];
        const placaValue = entry['placa'];

        if (modeloValue && placaValue) {
            data.push(entry);
            // console.log(`[parseVehicleCSV] Added entry for line ${i + 1} to data.`);
        } else {
            let reason = `Linha ${i + 1} ignorada:`;
            if (!modeloValue) reason += " Valor para 'Modelo' ausente ou vazio.";
            if (!placaValue) reason += " Valor para 'Placa' ausente ou vazio.";
            console.warn(`[parseVehicleCSV] ${reason} Dados da linha: ${JSON.stringify(entry)}`);
        }
    }
    console.log("[parseVehicleCSV] Finished CSV parsing. Total records parsed for processing:", data.length);
    return data;
};


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
                    const savePromises = onlineVehicles.map(async (v) => {
                        const vehicleDataForAdd: Omit<LocalVehicle, 'id' | 'localId' | 'syncStatus' | 'deleted' | 'firebaseId'> = {
                            model: v.model,
                            year: v.year,
                            licensePlate: v.licensePlate,
                        };
                        try {
                            const existingLocalByFirebaseId = localVehicles.find(lv => lv.firebaseId === v.id);
                            if (!existingLocalByFirebaseId) {
                                await addLocalDbVehicle(vehicleDataForAdd, v.id);
                            } else {
                                console.log(`[Vehicle Sync] Vehicle ${v.id} already exists locally. Skipping add.`);
                            }
                        } catch (addError) {
                             console.error(`Error adding vehicle ${v.id} locally:`, addError);
                        }
                    });
                   await Promise.all(savePromises);
                   localVehicles = await getLocalVehicles();

               } catch (fetchError: any) {
                   console.error("Error fetching/saving online vehicles:", fetchError);
                   toast({ variant: "destructive", title: "Erro Online", description: "Não foi possível buscar ou salvar veículos online." });
               }
          }
          setVehicles(localVehicles.map(lv => ({
                id: lv.firebaseId || lv.localId,
                model: lv.model,
                year: lv.year,
                licensePlate: lv.licensePlate
           } as VehicleInfo)).sort((a,b)=> a.model.localeCompare(b.model)));
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
    firebaseId?: string
  ): Promise<boolean> => {
    const vehicleDataForAdd: Omit<LocalVehicle, 'id' | 'localId' | 'syncStatus' | 'deleted' | 'firebaseId'> = {
      model: vehicleModel,
      year: vehicleYear,
      licensePlate: vehicleLicensePlate.toUpperCase(),
    };

    try {
        const existingLocalByPlate = await getLocalVehicles().then(
            allLocal => allLocal.find(v => v.licensePlate.toUpperCase() === vehicleLicensePlate.toUpperCase())
        );
        if (existingLocalByPlate && (!firebaseId || existingLocalByPlate.firebaseId !== firebaseId)) {
             toast({ variant: "destructive", title: "Duplicidade", description: `Veículo com placa ${vehicleLicensePlate.toUpperCase()} já existe localmente.` });
             return false;
        }

        const assignedLocalId = await addLocalDbVehicle(vehicleDataForAdd, firebaseId);
        const createdVehicleUI: VehicleInfo = {
             id: firebaseId || assignedLocalId,
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
    if (!model || year === '' || !licensePlate) {
      toast({ variant: "destructive", title: "Erro", description: "Modelo, Ano e Placa são obrigatórios." });
      return;
    }
     const numericYear = Number(year);
     if (isNaN(numericYear) || numericYear < 1900 || numericYear > new Date().getFullYear() + 5) {
        toast({ variant: "destructive", title: "Erro", description: "Ano do veículo inválido." });
        return;
      }
    setIsSaving(true);
    const success = await _createNewVehicle(model, numericYear, licensePlate);
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
      if (!model || year === '' || !licensePlate) {
         toast({ variant: "destructive", title: "Erro", description: "Modelo, Ano e Placa são obrigatórios." });
         return;
       }
       const numericYear = Number(year);
        if (isNaN(numericYear) || numericYear < 1900 || numericYear > new Date().getFullYear() + 5) {
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
       year: numericYear,
       licensePlate: licensePlate.toUpperCase(),
       syncStatus: originalLocalVehicle.syncStatus === 'synced' ? 'pending' : originalLocalVehicle.syncStatus,
     };

     setIsSaving(true);
     try {
         await updateLocalDbVehicle(updatedLocalData);
          const updatedVehicleUI: VehicleInfo = {
             id: currentVehicle.id,
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
            await deleteLocalDbVehicle(originalLocalVehicle.localId);
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

    const handleVehicleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsSaving(true);
        toast({ title: "Importando...", description: "Processando arquivo CSV de veículos." });

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) {
                toast({ variant: "destructive", title: "Erro ao ler arquivo", description: "Não foi possível ler o conteúdo do arquivo." });
                setIsSaving(false);
                return;
            }
            console.log("[Vehicle CSV Import] File content read. Length:", text.length);

            try {
                const parsedData = parseVehicleCSV(text);
                console.log("[Vehicle CSV Import] Parsed Data from parseVehicleCSV:", JSON.stringify(parsedData, null, 2));

                if (parsedData.length === 0) {
                    toast({ variant: "destructive", title: "Arquivo Vazio ou Inválido", description: "O CSV não contém dados válidos (Modelo e Placa são obrigatórios) ou está mal formatado. Verifique o console para detalhes do parser." });
                    setIsSaving(false);
                    return;
                }

                let importedCount = 0;
                let skippedCount = 0;
                const skippedReasons: string[] = [];
                const currentLocalVehicles = await getLocalVehicles();

                for (const row of parsedData) {
                    console.log("[Vehicle CSV Import] Processing row:", JSON.stringify(row));
                    const modelo = row['modelo']?.trim(); // Access using normalized key
                    const placa = row['placa']?.trim().toUpperCase(); // Access using normalized key
                    let anoStr = row['ano']?.trim(); // Access using normalized key, this might be undefined

                    if (!modelo) {
                        const reason = `Linha ignorada: 'Modelo' ausente ou vazio. Dados da linha: ${JSON.stringify(row)}`;
                        console.warn(`[Vehicle CSV Import] ${reason}`);
                        skippedReasons.push(reason);
                        skippedCount++;
                        continue;
                    }
                    if (!placa) {
                        const reason = `Linha ignorada: 'Placa' ausente ou vazia para modelo ${modelo}. Dados da linha: ${JSON.stringify(row)}`;
                        console.warn(`[Vehicle CSV Import] ${reason}`);
                        skippedReasons.push(reason);
                        skippedCount++;
                        continue;
                    }

                    let ano = 0; // Default year
                    if (anoStr) {
                        const parsedYear = parseInt(anoStr, 10);
                        if (!isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= new Date().getFullYear() + 5) {
                            ano = parsedYear;
                        } else {
                            console.warn(`[Vehicle CSV Import] 'Ano' inválido ('${anoStr}') para ${modelo}, placa ${placa}. Usando ano padrão 0. Dados: ${JSON.stringify(row)}`);
                        }
                    } else {
                        console.warn(`[Vehicle CSV Import] 'Ano' ausente para ${modelo}, placa ${placa}. Usando ano padrão 0. Dados: ${JSON.stringify(row)}`);
                    }

                    const existingByPlate = currentLocalVehicles.find(v => v.licensePlate.toUpperCase() === placa);
                    if (existingByPlate) {
                        const reason = `Veículo com placa ${placa} já existe localmente (${existingByPlate.model}, ${existingByPlate.year}).`;
                        console.warn(`[Vehicle CSV Import] ${reason}`);
                        skippedReasons.push(reason);
                        skippedCount++;
                        continue;
                    }

                    const success = await _createNewVehicle(modelo, ano, placa);
                    if (success) {
                        importedCount++;
                    } else {
                        skippedCount++;
                         if (!skippedReasons.some(sr => sr.includes(placa))) {
                            skippedReasons.push(`Falha ao salvar veículo ${modelo}, placa ${placa} (ver erro anterior no toast/console).`);
                         }
                    }
                }

                const updatedVehicles = await getLocalVehicles();
                setVehicles(updatedVehicles.map(lv => ({
                    id: lv.firebaseId || lv.localId,
                    model: lv.model,
                    year: lv.year,
                    licensePlate: lv.licensePlate
                } as VehicleInfo)).sort((a, b) => a.model.localeCompare(b.model)));

                let importToastDescription = `${importedCount} veículos importados. ${skippedCount} ignorados.`;
                if (skippedReasons.length > 0) {
                    importToastDescription += ` Verifique o console do navegador para detalhes dos itens ignorados.`;
                    console.warn("[Vehicle CSV Import] Detalhes dos veículos ignorados/com avisos:", skippedReasons.join("\n"));
                }
                toast({
                    title: "Importação de Veículos Concluída",
                    description: importToastDescription,
                    duration: skippedReasons.length > 0 ? 10000 : 5000
                });

            } catch (parseError: any) {
                console.error("[Vehicle CSV Import] Error parsing CSV:", parseError);
                toast({ variant: "destructive", title: "Erro ao Processar CSV", description: parseError.message });
            } finally {
                setIsSaving(false);
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        };
        reader.onerror = () => {
            toast({ variant: "destructive", title: "Erro de Leitura", description: "Não foi possível ler o arquivo selecionado." });
            setIsSaving(false);
        };
        reader.readAsText(file, 'UTF-8'); // Specify UTF-8 encoding
    };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <h2 className="text-2xl font-semibold">Gerenciar Veículos</h2>
        <div className="flex flex-wrap gap-2">
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
                     <Input id="year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) > 0 ? Number(e.target.value) : '')} required placeholder="Ex: 2023" min="1900" max={new Date().getFullYear() + 5} disabled={isSaving}/>
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
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleVehicleFileImport}
              style={{ display: 'none' }}
              disabled={isSaving}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              disabled={isSaving}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Importar Veículos (CSV)
            </Button>
        </div>
      </div>

       {loading ? (
          <div className="flex justify-center items-center h-40">
              <LoadingSpinner />
          </div>
       ) : vehicles.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhum veículo encontrado localmente. Clique em "Cadastrar Veículo" ou "Importar Veículos (CSV)".</p>
           </CardContent>
         </Card>
       ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="shadow-sm transition-shadow hover:shadow-md bg-card border border-border">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                   <CardTitle className="text-lg font-semibold text-primary">{vehicle.model}</CardTitle>
                   <CardDescription className="text-sm text-muted-foreground flex items-center gap-1">
                     <Gauge className="h-3 w-3" /> Placa: {vehicle.licensePlate}
                   </CardDescription>
                   <CardDescription className="text-sm text-muted-foreground flex items-center gap-1">
                       <CalendarDays className="h-3 w-3" /> Ano: {vehicle.year === 0 ? 'N/I' : vehicle.year}
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
                                <Input id="editYear" type="number" value={year === 0 ? '' : year} onChange={(e) => setYear(Number(e.target.value) > 0 ? Number(e.target.value) : '')} required min="1900" max={new Date().getFullYear() + 5} disabled={isSaving} />
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
