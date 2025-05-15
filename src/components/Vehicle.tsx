// src/components/Vehicle.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, Car, CalendarDays, Gauge, Fuel, Milestone, Users, Loader2, Eye, TrendingUp, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    getLocalFuelings,
    LocalFueling,
    getLocalTrips,
    LocalTrip,
    getLocalRecordsByRole,
    LocalUser,
} from '@/services/localDbService';
import { getVehicles as fetchOnlineVehicles } from '@/services/firestoreService';
import { LoadingSpinner } from './LoadingSpinner';
import { v4 as uuidv4 } from 'uuid';
import { formatKm } from '@/lib/utils';
import { format as formatDateFn, parseISO } from 'date-fns';

export interface VehicleInfo extends Omit<LocalVehicle, 'syncStatus' | 'deleted' | 'localId'> {
  id: string; // This can be firebaseId or localId
}

interface VehicleDetails {
    fuelings: LocalFueling[];
    performance: {
        totalKm: number;
        totalLiters: number;
        totalFuelCost: number;
        avgKmPerLiter: number;
        avgCostPerKm: number;
    };
    drivers: LocalUser[];
}

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [licensePlate, setLicensePlate] = useState('');

  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [currentVehicleForDetails, setCurrentVehicleForDetails] = useState<VehicleInfo | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<VehicleDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [allDrivers, setAllDrivers] = useState<LocalUser[]>([]);

  const fetchAllVehiclesData = useCallback(async () => {
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
              licensePlate: lv.licensePlate,
         } as VehicleInfo)).sort((a,b)=> a.model.localeCompare(b.model)));
    } catch (error) {
      console.error("Error fetching local vehicles:", error);
      toast({ variant: "destructive", title: "Erro Local", description: "Não foi possível carregar os veículos locais." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAllVehiclesData();
    const fetchDrivers = async () => {
        try {
            const drivers = await getLocalRecordsByRole('driver');
            setAllDrivers(drivers);
        } catch (error) {
            console.error("Error fetching drivers for vehicle details:", error);
        }
    };
    fetchDrivers();
  }, [fetchAllVehiclesData]);


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
    const vehicleDataForAdd: Omit<LocalVehicle, 'id' | 'localId' | 'syncStatus' | 'deleted' | 'firebaseId'> = {
      model,
      year: numericYear,
      licensePlate: licensePlate.toUpperCase(),
    };
    try {
        const existingLocalByPlate = await getLocalVehicles().then(
            allLocal => allLocal.find(v => v.licensePlate.toUpperCase() === licensePlate.toUpperCase())
        );
        if (existingLocalByPlate) {
             toast({ variant: "destructive", title: "Duplicidade", description: `Veículo com placa ${licensePlate.toUpperCase()} já existe localmente.` });
             setIsSaving(false);
             return;
        }
        const assignedLocalId = await addLocalDbVehicle(vehicleDataForAdd);
        const createdVehicleUI: VehicleInfo = {
             id: assignedLocalId, // localId is the primary ID for newly created local vehicles
             model: vehicleDataForAdd.model,
             year: vehicleDataForAdd.year,
             licensePlate: vehicleDataForAdd.licensePlate,
         };
        setVehicles(prevVehicles => [createdVehicleUI, ...prevVehicles].sort((a,b)=> a.model.localeCompare(b.model)));
        resetForm();
        setIsCreateModalOpen(false);
        toast({ title: "Veículo adicionado localmente!" });
    } catch (error) {
        console.error("Error adding local vehicle:", error);
        toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível adicionar o veículo localmente. Detalhe: ${(error as Error).message}` });
    } finally {
        setIsSaving(false);
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

  const handleOpenDetailsModal = async (vehicle: VehicleInfo) => {
    setCurrentVehicleForDetails(vehicle);
    setIsDetailsModalOpen(true);
    setLoadingDetails(true);
    try {
        const vehicleIdToFetch = vehicle.id; 
        const [fuelings, allTrips] = await Promise.all([
            getLocalFuelings(vehicleIdToFetch, 'vehicleId'),
            getLocalTrips() 
        ]);

        const vehicleTrips = allTrips.filter(t => t.vehicleId === vehicleIdToFetch);

        // Performance Calculations
        let totalKm = 0;
        vehicleTrips.forEach(trip => {
            if (trip.status === 'Finalizado' && trip.totalDistance != null) {
                totalKm += trip.totalDistance;
            }
        });

        const totalLiters = fuelings.reduce((sum, f) => sum + f.liters, 0);
        const totalFuelCost = fuelings.reduce((sum, f) => sum + f.totalCost, 0);
        const avgKmPerLiter = totalLiters > 0 && totalKm > 0 ? totalKm / totalLiters : 0;
        const avgCostPerKm = totalKm > 0 ? totalFuelCost / totalKm : 0;

        // Drivers
        const driverIds = new Set<string>();
        vehicleTrips.forEach(trip => {
            if(trip.userId) driverIds.add(trip.userId);
        });
        
        const uniqueDrivers = allDrivers.filter(driver => driverIds.has(driver.id));

        setVehicleDetails({
            fuelings: fuelings.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            performance: { totalKm, totalLiters, totalFuelCost, avgKmPerLiter, avgCostPerKm },
            drivers: uniqueDrivers
        });
    } catch (error) {
        console.error("Error fetching vehicle details:", error);
        toast({ variant: "destructive", title: "Erro ao Carregar Detalhes", description: "Não foi possível buscar os detalhes do veículo." });
        setVehicleDetails(null);
    } finally {
        setLoadingDetails(false);
    }
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
        </div>
      </div>

       {loading ? (
          <div className="flex justify-center items-center h-40">
              <LoadingSpinner />
          </div>
       ) : vehicles.length === 0 ? (
         <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
           <CardContent>
             <p className="text-muted-foreground">Nenhum veículo encontrado localmente. Clique em "Cadastrar Veículo".</p>
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
                     <Dialog open={isEditModalOpen && !!currentVehicle && currentVehicle.id === vehicle.id} onOpenChange={(isOpen) => { if (!isOpen) closeEditModal(); else openEditModal(vehicle); }}>
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
                      <AlertDialog open={isDeleteModalOpen && !!vehicleToDelete && vehicleToDelete.id === vehicle.id} onOpenChange={(isOpen) => {if(!isOpen) closeDeleteModal();}}>
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
                              Tem certeza que deseja marcar o veículo {vehicleToDelete?.model} ({vehicleToDelete?.licensePlate}) para exclusão? A exclusão definitiva ocorrerá na próxima sincronização.
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
                 <Button variant="link" size="sm" className="p-0 h-auto text-primary" onClick={() => handleOpenDetailsModal(vehicle)}>
                    Ver Histórico Completo
                 </Button>
              </CardContent>
            </Card>
          ))}
        </div>
       )}

        <Dialog open={isDetailsModalOpen} onOpenChange={(isOpen) => { if(!isOpen) {setIsDetailsModalOpen(false); setCurrentVehicleForDetails(null); setVehicleDetails(null);}}}>
            <DialogContent className="max-w-3xl min-h-[60vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Detalhes do Veículo: {currentVehicleForDetails?.model} ({currentVehicleForDetails?.licensePlate})</DialogTitle>
                </DialogHeader>
                {loadingDetails ? (
                    <div className="flex flex-1 justify-center items-center h-64">
                        <LoadingSpinner />
                    </div>
                ) : vehicleDetails ? (
                    <Tabs defaultValue="fuelings" className="w-full mt-4 flex-1 flex flex-col">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="fuelings"><Fuel className="mr-2 h-4 w-4" />Abastecimentos ({vehicleDetails.fuelings.length})</TabsTrigger>
                            <TabsTrigger value="performance"><TrendingUp className="mr-2 h-4 w-4" />Performance</TabsTrigger>
                            <TabsTrigger value="drivers"><UserCheck className="mr-2 h-4 w-4" />Motoristas ({vehicleDetails.drivers.length})</TabsTrigger>
                        </TabsList>
                        <TabsContent value="fuelings" className="mt-4 flex-1 overflow-y-auto">
                            {vehicleDetails.fuelings.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data</TableHead>
                                            <TableHead>Litros</TableHead>
                                            <TableHead>Preço/L</TableHead>
                                            <TableHead>Custo Total</TableHead>
                                            <TableHead>Odômetro</TableHead>
                                            <TableHead>Combustível</TableHead>
                                            <TableHead>Local</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {vehicleDetails.fuelings.map(f => (
                                            <TableRow key={f.localId}>
                                                <TableCell>{f.date ? formatDateFn(parseISO(f.date), 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                                <TableCell>{f.liters.toFixed(2)} L</TableCell>
                                                <TableCell>{formatCurrency(f.pricePerLiter)}</TableCell>
                                                <TableCell>{formatCurrency(f.totalCost)}</TableCell>
                                                <TableCell>{formatKm(f.odometerKm)}</TableCell>
                                                <TableCell>{f.fuelType}</TableCell>
                                                <TableCell>{f.location}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : <p className="text-muted-foreground text-center py-4">Nenhum abastecimento registrado para este veículo.</p>}
                        </TabsContent>
                        <TabsContent value="performance" className="mt-4 space-y-3 flex-1 overflow-y-auto">
                            <Card>
                                <CardHeader><CardTitle>Resumo de Performance</CardTitle></CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div><span className="font-medium">KM Total Percorrido:</span> {formatKm(vehicleDetails.performance.totalKm)}</div>
                                    <div><span className="font-medium">Total de Litros Consumidos:</span> {vehicleDetails.performance.totalLiters.toFixed(2)} L</div>
                                    <div><span className="font-medium">Custo Total com Combustível:</span> {formatCurrency(vehicleDetails.performance.totalFuelCost)}</div>
                                    <div><span className="font-medium">Média KM/Litro:</span> {vehicleDetails.performance.avgKmPerLiter.toFixed(2)} Km/L</div>
                                    <div><span className="font-medium">Custo Médio por KM:</span> {formatCurrency(vehicleDetails.performance.avgCostPerKm)}</div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="drivers" className="mt-4 flex-1 overflow-y-auto">
                             {vehicleDetails.drivers.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nome do Motorista</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Base</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {vehicleDetails.drivers.map(d => (
                                            <TableRow key={d.id}>
                                                <TableCell>{d.name || 'N/A'}</TableCell>
                                                <TableCell>{d.email}</TableCell>
                                                <TableCell>{d.base || 'N/A'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : <p className="text-muted-foreground text-center py-4">Nenhum motorista utilizou este veículo em viagens registradas.</p>}
                        </TabsContent>
                    </Tabs>
                ) : <p className="text-muted-foreground text-center py-4">Não foi possível carregar os detalhes.</p>}
                <DialogFooter className="mt-4 sticky bottom-0 bg-background py-4 border-t">
                    <DialogClose asChild>
                        <Button variant="outline" onClick={() => {setIsDetailsModalOpen(false); setCurrentVehicleForDetails(null); setVehicleDetails(null);}}>Fechar</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
};
