
// src/contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './AuthContext';
import {
    getPendingRecords,
    updateSyncStatus,
    cleanupDeletedRecords,
    getLocalDbStore,
    LocalTrip,
    LocalVisit,
    LocalExpense,
    LocalFueling,
    LocalVehicle, // Import LocalVehicle
    STORE_TRIPS,
    STORE_VISITS,
    STORE_EXPENSES,
    STORE_FUELINGS,
    STORE_VEHICLES,
    openDB as localDbOpenDB,
} from '@/services/localDbService';
import {
    addTrip,
    updateTrip,
    deleteTripAndRelatedData,
    addVisit,
    updateVisit,
    deleteVisit,
    addExpense,
    updateExpense,
    deleteExpense,
    addFueling,
    updateFueling,
    deleteFueling,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    Trip as FirestoreTrip,
    Visit as FirestoreVisit,
    Expense as FirestoreExpense,
    Fueling as FirestoreFueling,
    VehicleInfo as FirestoreVehicle,
} from '@/services/firestoreService';
import { deleteReceipt, uploadReceipt } from '@/services/storageService'; // For handling attachments during sync

type SyncStatusState = 'idle' | 'syncing' | 'success' | 'error';

interface SyncContextType {
    syncStatus: SyncStatusState;
    lastSyncTime: Date | null;
    pendingCount: number;
    startSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider = ({ children }: { children: ReactNode }) => {
    const [syncStatus, setSyncStatus] = useState<SyncStatusState>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [pendingCount, setPendingCount] = useState<number>(0);
    const { toast } = useToast();
    const { user, firebaseUser } = useAuth(); // Get firebaseUser as well

    const updatePendingCount = useCallback(async () => {
        // console.log("[SyncContext updatePendingCount] Updating pending count...");
        try {
            const { trips, visits, expenses, fuelings, vehicles } = await getPendingRecords();
            const count = trips.length + visits.length + expenses.length + fuelings.length + vehicles.length;
            setPendingCount(count);
            // console.log(`[SyncContext updatePendingCount] Pending count set to: ${count}`);
        } catch (error) {
            console.error("[SyncContext updatePendingCount] Error updating pending count:", error);
            setPendingCount(0);
        }
    }, []);

    useEffect(() => {
        // console.log("[SyncContext useEffect] User changed or updatePendingCount changed. Updating pending count.");
        updatePendingCount();
    }, [user, updatePendingCount]);

    const syncItem = useCallback(async <
        L extends { localId: string; firebaseId?: string; syncStatus: 'pending' | 'error'; deleted?: boolean; [key: string]: any },
        F extends { id: string; [key: string]: any }
    >(
        item: L,
        storeName: string,
        addFn: (data: Omit<F, 'id'>) => Promise<string>,
        updateFn: (id: string, data: Partial<Omit<F, 'id'>>) => Promise<void>,
        deleteFn: (id: string) => Promise<void>,
        uploadFn?: (fileOrDataUrl: File | string, folder: string) => Promise<{ url: string; path: string }>,
        deleteStorageFn?: (path: string) => Promise<void>,
        attachmentKey?: keyof L, 
        urlKey?: keyof L,       
        pathKey?: keyof L       
    ): Promise<boolean> => {
        const { localId, firebaseId, deleted, syncStatus: itemSyncStatus, ...dataToSyncBase } = item;
        const logPrefix = `[SyncContext syncItem - ${storeName} ${localId}]`;
        
        const currentAuthUserId = firebaseUser?.uid || user?.id;
        // console.log(`${logPrefix} User state before Firestore operation: AuthContext User ID: ${user?.id}, Firebase User UID: ${firebaseUser?.uid}, Effective Auth User ID for this sync: ${currentAuthUserId}`);

        if (storeName === STORE_TRIPS) {
            console.log(`${logPrefix} Attempting Firestore operation. Trip UserID from item: ${item.userId}, Authenticated Firebase UID for sync: ${currentAuthUserId}`);
        }


        if (!currentAuthUserId && !deleted) { 
            console.error(`${logPrefix} No authenticated user found for an add/update operation. Skipping Firestore operation.`);
            toast({ variant: 'destructive', title: `Erro de Autenticação na Sincronização`, description: `Não foi possível sincronizar ${storeName} ID: ${localId} por falta de usuário autenticado.`, duration: 7000 });
            return false; 
        }


        if (deleted) {
            try {
                if (firebaseId) {
                    console.log(`${logPrefix} Deleting from Firestore. Firebase ID: ${firebaseId}`);
                    await deleteFn(firebaseId);
                    if (pathKey && item[pathKey] && deleteStorageFn) {
                        console.log(`${logPrefix} Deleting attachment from storage: ${item[pathKey]}`);
                        await deleteStorageFn(item[pathKey]);
                    }
                     console.log(`${logPrefix} Firestore deletion successful for ${firebaseId}.`);
                } else {
                    console.log(`${logPrefix} Item was marked for deletion locally but had no Firebase ID. No Firestore deletion needed.`);
                }
                await updateSyncStatus(storeName, localId, firebaseId, 'synced');
                return true;
            } catch (error: any) {
                console.error(`${logPrefix} Error deleting Firestore document ${firebaseId}:`, error);
                toast({ variant: 'destructive', title: `Erro ao Excluir ${storeName} Online`, description: `ID: ${localId}. Erro: ${error.message}`, duration: 7000 });
                await updateSyncStatus(storeName, localId, firebaseId, 'error'); 
                return false;
            }
        }

        let newFirebaseId = firebaseId;
        let storageUrl: string | undefined = urlKey ? item[urlKey] : undefined;
        let storagePath: string | undefined = pathKey ? item[pathKey] : undefined;
        const localAttachment = attachmentKey ? item[attachmentKey] : null;
        let oldStoragePathToDelete: string | undefined = undefined;
        let needsStorageUpdate = false;

        const fieldsToRemove: (keyof L)[] = ['localId', 'syncStatus', 'deleted', 'firebaseId'];
        if (attachmentKey) fieldsToRemove.push(attachmentKey); 
        const dataToSync = { ...dataToSyncBase };
        fieldsToRemove.forEach(key => delete (dataToSync as any)[key]);
        
        if (storeName === STORE_TRIPS && !firebaseId && currentAuthUserId) {
            (dataToSync as any).userId = currentAuthUserId;
            console.log(`${logPrefix} Overriding/setting userId for new trip to current authenticated Firebase UID: ${currentAuthUserId}`);
        } else if (storeName !== STORE_VEHICLES && !(dataToSync as any).userId && currentAuthUserId) {
            (dataToSync as any).userId = currentAuthUserId;
            console.log(`${logPrefix} Added userId ${currentAuthUserId} to new Firestore document data for ${storeName}.`);
        }


        try {
            if (uploadFn && attachmentKey && localAttachment) {
                const isNewUpload = typeof localAttachment === 'string' && localAttachment.startsWith('data:') || localAttachment instanceof File;
                if (isNewUpload) {
                    needsStorageUpdate = true;
                    if (storagePath && deleteStorageFn) { 
                        oldStoragePathToDelete = storagePath;
                        console.log(`${logPrefix} Old attachment path ${oldStoragePathToDelete} marked for deletion.`);
                    }
                    console.log(`${logPrefix} Uploading new attachment...`);
                    const uploadResult = await uploadFn(localAttachment, storeName); 
                    storageUrl = uploadResult.url; storagePath = uploadResult.path;
                    console.log(`${logPrefix} Upload successful. URL: ${storageUrl}, Path: ${storagePath}`);
                }
            } else if (pathKey && item[pathKey] && !localAttachment && deleteStorageFn) { 
                needsStorageUpdate = true;
                oldStoragePathToDelete = item[pathKey]; 
                storageUrl = undefined; storagePath = undefined; 
                console.log(`${logPrefix} Attachment removed locally. Marking ${oldStoragePathToDelete} for deletion from storage.`);
            }

            if (needsStorageUpdate) { 
                if (urlKey) (dataToSync as any)[urlKey] = storageUrl;
                if (pathKey) (dataToSync as any)[pathKey] = storagePath;
            }

            if (firebaseId) {
                console.log(`${logPrefix} Updating Firestore document. Firebase ID: ${firebaseId}. Data:`, dataToSync);
                await updateFn(firebaseId, dataToSync as Partial<Omit<F, 'id'>>);
                console.log(`${logPrefix} Firestore document updated for ${firebaseId}.`);
            } else {
                console.log(`${logPrefix} Adding new document to Firestore. Data:`, dataToSync);
                newFirebaseId = await addFn(dataToSync as Omit<F, 'id'>);
                console.log(`${logPrefix} New document added to Firestore. New Firebase ID: ${newFirebaseId}`);
            }

            if (oldStoragePathToDelete && oldStoragePathToDelete !== storagePath && deleteStorageFn) { 
                 console.log(`${logPrefix} Deleting old attachment from storage: ${oldStoragePathToDelete}`);
                 await deleteStorageFn(oldStoragePathToDelete);
                 console.log(`${logPrefix} Old attachment ${oldStoragePathToDelete} deleted from storage.`);
            }
            const localUpdates: Partial<L> = { firebaseId: newFirebaseId } as Partial<L>;
            if (needsStorageUpdate) { 
                 if (urlKey) (localUpdates as any)[urlKey] = storageUrl;
                 if (pathKey) (localUpdates as any)[pathKey] = storagePath;
            }
            await updateSyncStatus(storeName, localId, newFirebaseId!, 'synced', localUpdates);
            return true;
        } catch (error: any) {
            console.error(`${logPrefix} Error processing item ${localId}:`, error);
            toast({ variant: 'destructive', title: `Erro Sinc ${storeName}`, description: `ID: ${localId}. Erro: ${error.message}`, duration: 7000 });
            if (needsStorageUpdate && storagePath && storagePath !== oldStoragePathToDelete && uploadFn && deleteStorageFn) { 
                 console.warn(`${logPrefix} Rolling back storage upload for ${storagePath} due to error.`);
                 await deleteStorageFn(storagePath).catch(rbError => console.error(`${logPrefix} Error rolling back storage upload:`, rbError));
            }
            await updateSyncStatus(storeName, localId, firebaseId, 'error'); 
            return false;
        }
    }, [user, firebaseUser, toast]); 

    const startSync = useCallback(async () => {
        const syncStartTime = performance.now();
        console.log(`[SyncContext startSync ${syncStartTime}] Initiating sync...`);
        if (syncStatus === 'syncing') {
            toast({ title: "Sincronização já em andamento." }); return;
        }
        if (!navigator.onLine) {
            toast({ variant: 'destructive', title: "Offline", description: "Conecte-se à internet para sincronizar." }); return;
        }
        if (!firebaseUser?.uid && !user?.id) { 
             toast({ variant: 'destructive', title: "Erro de Autenticação", description: "Usuário não autenticado. Faça login para sincronizar." });
             setSyncStatus('error'); 
             return;
        }

        setSyncStatus('syncing');
        toast({ title: "Iniciando sincronização..." });
        let overallSuccess = true; let syncedCount = 0; let errorCount = 0; let skippedCount = 0;

        try {
            const pendingData = await getPendingRecords();
            const totalPending = Object.values(pendingData).reduce((sum, arr) => sum + arr.length, 0);
            if (totalPending === 0) {
                toast({ title: "Sincronização", description: "Nenhum dado pendente." });
                setSyncStatus('success'); setLastSyncTime(new Date()); setPendingCount(0);
                await cleanupDeletedRecords();
                console.log(`[SyncContext startSync ${syncStartTime}] No pending records. Cleanup attempted.`);
                return;
            }
            console.log(`[SyncContext startSync ${syncStartTime}] Total items to sync: ${totalPending}`);

            for (const vehicle of pendingData.vehicles) {
                const success = await syncItem<LocalVehicle, FirestoreVehicle>(vehicle, STORE_VEHICLES, addVehicle, updateVehicle, deleteVehicle);
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }

            for (const trip of pendingData.trips) {
                let parentVehicleFirebaseId: string | undefined;
                if (trip.vehicleId) { 
                    const dbInstance = await localDbOpenDB();
                    const vehicleTx = dbInstance.transaction(STORE_VEHICLES, 'readonly');
                    const vehicleStore = vehicleTx.objectStore(STORE_VEHICLES);
                    let parentVehicle = await new Promise<LocalVehicle | null>((res) => {
                        const req = vehicleStore.get(trip.vehicleId);
                        req.onsuccess = () => res(req.result as LocalVehicle | null);
                        req.onerror = () => res(null); 
                    });
                     await vehicleTx.done;

                    if (!parentVehicle) { 
                        const vehicleTx2 = dbInstance.transaction(STORE_VEHICLES, 'readonly');
                        const vehicleStore2 = vehicleTx2.objectStore(STORE_VEHICLES);
                        if (vehicleStore2.indexNames.contains('firebaseId')) {
                            const index = vehicleStore2.index('firebaseId');
                            parentVehicle = await new Promise<LocalVehicle | null>((res) => {
                                const req = index.get(trip.vehicleId);
                                req.onsuccess = () => res(req.result as LocalVehicle | null);
                                req.onerror = () => res(null);
                            });
                        }
                        await vehicleTx2.done;
                    }

                    if (!parentVehicle || !parentVehicle.firebaseId || parentVehicle.syncStatus !== 'synced') {
                        console.warn(`[SyncContext] Skipping trip ${trip.localId}, parent vehicle ${trip.vehicleId} not synced or missing Firebase ID.`);
                        skippedCount++; continue;
                    }
                    parentVehicleFirebaseId = parentVehicle.firebaseId;
                }
                const tripDataForSync = { ...trip, vehicleId: parentVehicleFirebaseId || trip.vehicleId };
                const success = await syncItem<LocalTrip, FirestoreTrip>(tripDataForSync, STORE_TRIPS, addTrip, updateTrip, deleteTripAndRelatedData);
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }

            const getParentFirebaseId = async (localParentId: string, parentStoreName: string): Promise<string | null> => {
                const dbInstance = await localDbOpenDB(); 
                const tx = dbInstance.transaction(parentStoreName, 'readonly');
                const store = tx.objectStore(parentStoreName);

                let parent = await new Promise<any | null>((res) => {
                    const req = store.get(localParentId);
                    req.onsuccess = () => res(req.result);
                    req.onerror = () => res(null);
                });

                if (!parent && store.indexNames.contains('firebaseId')) {
                    const index = store.index('firebaseId');
                    parent = await new Promise<any | null>((res) => {
                        const req = index.get(localParentId);
                        req.onsuccess = () => res(req.result);
                        req.onerror = () => res(null);
                    });
                }
                await tx.done;
                return (parent && parent.syncStatus === 'synced' && parent.firebaseId) ? parent.firebaseId : null;
            };


            for (const visit of pendingData.visits) {
                const parentTripFirebaseId = await getParentFirebaseId(visit.tripLocalId, STORE_TRIPS);
                if (!parentTripFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping visit ${visit.localId}, parent trip ${visit.tripLocalId} not synced.`); continue; }
                const success = await syncItem<LocalVisit, FirestoreVisit>({...visit, tripId: parentTripFirebaseId}, STORE_VISITS, data => addVisit(data as Omit<FirestoreVisit, 'id'>), updateVisit, deleteVisit);
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }
            for (const expense of pendingData.expenses) {
                const parentTripFirebaseId = await getParentFirebaseId(expense.tripLocalId, STORE_TRIPS);
                if (!parentTripFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping expense ${expense.localId}, parent trip ${expense.tripLocalId} not synced.`); continue; }
                const success = await syncItem<LocalExpense, FirestoreExpense>(
                    {...expense, tripId: parentTripFirebaseId},
                    STORE_EXPENSES,
                    data => addExpense(data as Omit<FirestoreExpense, 'id'>),
                    updateExpense,
                    deleteExpense,
                    uploadReceipt,
                    deleteReceipt,
                    'receiptUrl', 
                    'receiptUrl', 
                    'receiptPath' 
                );
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }
            for (const fueling of pendingData.fuelings) {
                const parentTripFirebaseId = await getParentFirebaseId(fueling.tripLocalId, STORE_TRIPS);
                let parentVehicleFirebaseId: string | undefined = undefined;
                if (fueling.vehicleId) { 
                     parentVehicleFirebaseId = await getParentFirebaseId(fueling.vehicleId, STORE_VEHICLES);
                     if (!parentVehicleFirebaseId) {
                         console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, its vehicle ${fueling.vehicleId} is not synced or missing Firebase ID.`);
                         skippedCount++; continue;
                     }
                }
                if (!parentTripFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, parent trip ${fueling.tripLocalId} not synced.`); continue; }

                const success = await syncItem<LocalFueling, FirestoreFueling>(
                    {...fueling, tripId: parentTripFirebaseId, vehicleId: parentVehicleFirebaseId || fueling.vehicleId },
                    STORE_FUELINGS,
                    data => addFueling(data as Omit<FirestoreFueling, 'id'>),
                    updateFueling,
                    deleteFueling,
                    uploadReceipt,
                    deleteReceipt,
                    'receiptUrl', 
                    'receiptUrl', 
                    'receiptPath' 
                );
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }

            await cleanupDeletedRecords();
            const finalSyncStatus = overallSuccess ? 'success' : 'error';
            setSyncStatus(finalSyncStatus); setLastSyncTime(new Date()); updatePendingCount();
            toast({ title: `Sincronização ${finalSyncStatus === 'success' ? 'Concluída' : 'Parcial'}`, description: `${syncedCount}/${totalPending} itens. Falhas: ${errorCount}. Ignorados: ${skippedCount}.` });
        } catch (error: any) {
            console.error(`[SyncContext startSync ${syncStartTime}] Overall Sync Error:`, error);
            toast({ variant: 'destructive', title: "Erro na Sincronização", description: `Erro: ${error.message}` });
            setSyncStatus('error');
        } finally {
            setTimeout(() => setSyncStatus('idle'), 3000); 
        }
    }, [syncStatus, toast, user, firebaseUser, updatePendingCount, syncItem]);

    return (
        <SyncContext.Provider value={{ syncStatus, lastSyncTime, pendingCount, startSync }}>
            {children}
        </SyncContext.Provider>
    );
};

export const useSync = (): SyncContextType => {
    const context = useContext(SyncContext);
    if (context === undefined) {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
};

