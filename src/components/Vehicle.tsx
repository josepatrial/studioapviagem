
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
    getLocalVehicles as fetchLocalDbVehicles,
    updateLocalRecord,
    STORE_VEHICLES,
    STORE_USERS,
    LocalVehicle,
    getLocalFuelings,
    LocalFueling,
    getLocalTrips,
    LocalTrip,
    getLocalRecordsByRole,
    LocalUser,
} from '@/services/localDbService';
import { getVehicles as fetchOnlineVehicles, getDrivers as fetchOnlineDrivers } from '@/services/firestoreService';
import { LoadingSpinner } from './LoadingSpinner';
import { v4 as uuidv4 } from 'uuid';
import { formatKm } from '@/lib/utils';
import { format as formatDateFn, parseISO } from 'date-fns';

export interface VehicleInfo extends Omit<LocalVehicle, 'syncStatus' | 'deleted' | 'localId'> {
  id: string;
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
    console.log("[Vehicle fetchAllVehiclesData] Starting fetch...");
    try {
        let finalVehiclesData: LocalVehicle[];
        const cachePromises: Promise<void>[] = [];

        if (navigator.onLine) {
            console.log("[Vehicle fetchAllVehiclesData] Online: Fetching vehicles from Firestore...");
            const onlineVehiclesRaw = await fetchOnlineVehicles();
            console.log(`[Vehicle fetchAllVehiclesData] Fetched ${onlineVehiclesRaw.length} vehicles from Firestore.`);

            finalVehiclesData = onlineVehiclesRaw.map(v => ({
                ...v,
                localId: String(v.firebaseId || v.id || uuidv4()), // Ensure localId exists
                firebaseId: String(v.firebaseId || v.id),
                syncStatus: 'synced',
                deleted: v.deleted || false,
            } as LocalVehicle));

            finalVehiclesData.forEach(vehicleToCache => {
              if (!vehicleToCache.localId) {
                console.warn("[Vehicle] Skipping cache for online vehicle due to missing localId:", vehicleToCache);
                return;
              }
              cachePromises.push(updateLocalRecord(STORE_VEHICLES, vehicleToCache)
                .catch(cacheError => console.warn(`[Vehicle] Error caching Firestore vehicle ${vehicleToCache.localId} locally:`, cacheError)));
            });

        } else {
            console.log("[Vehicle fetchAllVehiclesData] Offline: Fetching vehicles from LocalDB...");
            finalVehiclesData = await fetchLocalDbVehicles();
            console.log(`[Vehicle fetchAllVehiclesData] Fetched ${finalVehiclesData.length} vehicles from LocalDB.`);
        }

        if (cachePromises.length > 0) {
            await Promise.all(cachePromises);
            console.log("[Vehicle fetchAllVehiclesData] Finished attempting to cache Firestore items.");
        }

        const uniqueVehiclesMap = new Map<string, LocalVehicle>();
        finalVehiclesData.forEach(v => {
            const key = String(v.firebaseId || v.localId);
            if (!uniqueVehiclesMap.has(key) && !v.deleted) {
                 uniqueVehiclesMap.set(key, v);
            } else if (uniqueVehiclesMap.has(key) && !v.deleted) {
                const existing = uniqueVehiclesMap.get(key)!;
                if (!existing.firebaseId && v.firebaseId) {
                    uniqueVehiclesMap.set(key, v);
                } else if (existing.deleted && !v.deleted) {
                     uniqueVehiclesMap.set(key, v);
                }
            }
        });

        const uniqueVehiclesArray = Array.from(uniqueVehiclesMap.values());
        console.log(`[Vehicle fetchAllVehiclesData] De-duplicated vehicles. Count: ${uniqueVehiclesArray.length}`);

        const mappedVehiclesUI = uniqueVehiclesArray.map(lv => ({
              id: String(lv.firebaseId || lv.localId),
              localId: lv.localId,
              firebaseId: lv.firebaseId,
              model: lv.model,
              year: lv.year,
              licensePlate: lv.licensePlate,
         } as VehicleInfo)).sort((a,b)=> (a.model || '').localeCompare(b.model || ''));

        console.log(`[Vehicle fetchAllVehiclesData] Mapped to UI. Count: ${mappedVehiclesUI.length}.`);
        setVehicles(mappedVehiclesUI);

    } catch (error) {
      console.error("[Vehicle fetchAllVehiclesData] Error fetching vehicles data:", error);
      toast({ variant: "destructive", title: "Erro ao Carregar Veículos", description: (error as Error).message || "Não foi possível buscar os veículos." });
    } finally {
      setLoading(false);
      console.log("[Vehicle fetchAllVehiclesData] Fetch finished.");
    }
  }, [toast]);

  useEffect(() => {
    fetchAllVehiclesData();
    const fetchDrivers = async () => {
        try {
            let driversData: LocalUser[];
            if(navigator.onLine) {
                const onlineDrivers = await fetchOnlineDrivers();
                driversData = onlineDrivers.map(d => ({...d, id: d.id, firebaseId: d.id, role: d.role || 'driver', base: d.base || 'N/A', lastLogin: new Date().toISOString(), syncStatus: 'synced'} as LocalUser));
                Promise.all(driversData.map(d => updateLocalRecord(STORE_USERS, d))).catch(e => console.warn("Error caching drivers in Vehicle.tsx:", e));
            } else {
                driversData = await getLocalRecordsByRole('driver');
            }
            setAllDrivers(driversData);
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
    const vehicleDataForAdd: Omit<LocalVehicle, 'localId' | 'syncStatus' | 'deleted' | 'firebaseId' | 'id'> = {
      model,
      year: numericYear,
      licensePlate: licensePlate.toUpperCase(),
    };
    try {
        const currentLocalVehicles = await fetchLocalDbVehicles();
        const existingLocalByPlate = currentLocalVehicles.find(v => v.licensePlate.toUpperCase() === licensePlate.toUpperCase() && !v.deleted);

        if (existingLocalByPlate) {
             toast({ variant: "destructive", title: "Duplicidade", description: `Veículo com placa ${licensePlate.toUpperCase()} já existe localmente.` });
             setIsSaving(false);
             return;
        }
        await addLocalDbVehicle(vehicleDataForAdd);
        await fetchAllVehiclesData(); // Re-fetch data
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

      const allLocalVehicles = await fetchLocalDbVehicles();
      const originalLocalVehicle = allLocalVehicles.find(v => (v.firebaseId || v.localId) === currentVehicle.id);


       if (!originalLocalVehicle) {
           toast({ variant: "destructive", title: "Erro", description: "Veículo original não encontrado localmente." });
           return;
       }

     const updatedLocalData: LocalVehicle = {
       ...originalLocalVehicle,
       model,
       year: numericYear,
       licensePlate: licensePlate.toUpperCase(),
       syncStatus: originalLocalVehicle.syncStatus === 'synced' && !originalLocalVehicle.deleted ? 'pending' : originalLocalVehicle.syncStatus,
     };

     setIsSaving(true);
     try {
         await updateLocalDbVehicle(updatedLocalData);
         await fetchAllVehiclesData(); // Re-fetch data
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
        setIsSaving(true);
        try {
            const allLocalVehicles = await fetchLocalDbVehicles();
            const originalLocalVehicle = allLocalVehicles.find(v => (v.firebaseId || v.localId) === vehicleToDelete.id);

            if (!originalLocalVehicle) {
                 toast({ variant: "destructive", title: "Erro", description: "Veículo original não encontrado localmente." });
                 setIsSaving(false);
                 closeDeleteModal();
                 return;
            }
            await deleteLocalDbVehicle(originalLocalVehicle.localId);
            await fetchAllVehiclesData(); // Re-fetch data
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
        const vehicleIdToFetch = vehicle.firebaseId || vehicle.localId;
        if (!vehicleIdToFetch) {
            console.error("Vehicle has no valid ID for fetching details:", vehicle);
            setVehicleDetails(null);
            setLoadingDetails(false);
            toast({variant: "destructive", title: "Erro Interno", description: "ID do veículo inválido para buscar detalhes."});
            return;
        }

        const vehicleFuelings = await getLocalFuelings(vehicleIdToFetch, 'vehicleId');
        vehicleFuelings.sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            const dateDiff = dateA.getTime() - dateB.getTime();
            if (dateDiff !== 0) return dateDiff;
            return (a.odometerKm || 0) - (b.odometerKm || 0);
        });

        const allLocalTrips = await getLocalTrips();
        const vehicleTrips = allLocalTrips.filter(t => (t.vehicleId === vehicleIdToFetch || t.vehicleId === vehicle.localId || t.vehicleId === vehicle.firebaseId) && !t.deleted );


        let totalKmDrivenFromFuelings = 0;
        if (vehicleFuelings.length > 1) {
            const firstOdometer = vehicleFuelings[0].odometerKm;
            const lastOdometer = vehicleFuelings[vehicleFuelings.length - 1].odometerKm;
            if (typeof firstOdometer === 'number' && !isNaN(firstOdometer) && typeof lastOdometer === 'number' && !isNaN(lastOdometer) && lastOdometer > firstOdometer) {
                 totalKmDrivenFromFuelings = lastOdometer - firstOdometer;
            }
        }

        const totalLiters = vehicleFuelings.reduce((sum, f) => sum + f.liters, 0);
        const totalFuelCost = vehicleFuelings.reduce((sum, f) => sum + f.totalCost, 0);

        const avgKmPerLiter = totalLiters > 0 && totalKmDrivenFromFuelings > 0 ? totalKmDrivenFromFuelings / totalLiters : 0;
        const avgCostPerKm = totalKmDrivenFromFuelings > 0 ? totalFuelCost / totalKmDrivenFromFuelings : 0;

        const driverIds = new Set<string>();
        vehicleTrips.forEach(trip => {
            if(trip.userId) driverIds.add(trip.userId);
        });

        // const allLocalDrivers = await getLocalRecordsByRole('driver'); // Assuming allDrivers state is up-to-date
        const uniqueDrivers = allDrivers.filter(driver => driverIds.has(driver.id || driver.firebaseId!) && !driver.deleted);


        setVehicleDetails({
            fuelings: vehicleFuelings,
            performance: {
                totalKm: totalKmDrivenFromFuelings,
                totalLiters,
                totalFuelCost,
                avgKmPerLiter,
                avgCostPerKm
            },
            drivers: uniqueDrivers
        });
    } catch (error) {
        console.error("Error fetching vehicle details:", error);
        toast({ variant: "destructive", title: "Erro ao Carregar Detalhes", description: (error as Error).message || "Não foi possível buscar os detalhes do veículo." });
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
             <p className="text-muted-foreground">Nenhum veículo encontrado. Clique em "Cadastrar Veículo" para adicionar.</p>
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
                              Tem certeza que deseja marcar o veículo {vehicleToDelete?.model || 'este veículo'} ({vehicleToDelete?.licensePlate || 'N/I'}) para exclusão?
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
                    <DialogTitle>Detalhes do Veículo: {currentVehicleForDetails?.model || 'N/I'} ({currentVehicleForDetails?.licensePlate || 'N/I'})</DialogTitle>
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
                                                <TableCell>{f.date && typeof f.date === 'string' ? formatDateFn(parseISO(f.date), 'dd/MM/yyyy') : 'N/A'}</TableCell>
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
                                <CardHeader><CardTitle>Resumo de Performance (Baseado em Abastecimentos)</CardTitle></CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div><span className="font-medium">KM Total (Base Abastec.):</span> {formatKm(vehicleDetails.performance.totalKm)}</div>
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
                                            <TableRow key={d.id || d.firebaseId}>
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
