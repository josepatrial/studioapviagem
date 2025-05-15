
// src/contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './AuthContext';
import {
    getPendingRecords,
    updateSyncStatus,
    cleanupDeletedRecords,
    getLocalDbStore, // Keep if used elsewhere, or remove if getLocalDbStore in this file is sufficient
    LocalTrip,
    LocalVisit,
    LocalExpense,
    LocalFueling,
    LocalVehicle, // Import LocalVehicle
    // Export store names if not already exported
    STORE_TRIPS,
    STORE_VISITS,
    STORE_EXPENSES,
    STORE_FUELINGS,
    STORE_VEHICLES,
    openDB as localDbOpenDB, // Rename imported function
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
    const { user } = useAuth();

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
        attachmentKey?: keyof L, // e.g., 'receiptUrl' for Expenses, 'fuelingReceiptUrl' for Fuelings
        urlKey?: keyof L,       // e.g., 'receiptUrl'
        pathKey?: keyof L       // e.g., 'receiptPath'
    ): Promise<boolean> => {
        const { localId, firebaseId, deleted, syncStatus: itemSyncStatus, ...dataToSyncBase } = item;
        const logPrefix = `[SyncContext syncItem - ${storeName} ${localId}]`;
        console.log(`${logPrefix} Starting sync. User State:`, user); // Log user state
        console.log(`${logPrefix} Item Details - Deleted: ${deleted}, FirebaseID: ${firebaseId || 'N/A'}`);


        if (!user && !deleted) { // If trying to add/update but no user, this is an issue. Deletes can proceed.
            console.error(`${logPrefix} No authenticated user found for an add/update operation. Skipping Firestore operation.`);
            toast({ variant: 'destructive', title: `Erro de Autenticação na Sincronização`, description: `Não foi possível sincronizar ${storeName} ID: ${localId} por falta de usuário autenticado.`, duration: 7000 });
            // We don't mark as error here, as it's an auth issue, not an item sync issue.
            // It will remain 'pending' for a future sync attempt when user is available.
            return false; // Indicate sync for this item was skipped/failed due to auth
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
                // console.log(`${logPrefix} Updating local status to 'synced' for local cleanup.`);
                // The actual deletion from local DB happens in cleanupDeletedRecords
                // Here we just ensure its syncStatus implies it has been processed by Firebase
                await updateSyncStatus(storeName, localId, firebaseId, 'synced');
                return true;
            } catch (error: any) {
                console.error(`${logPrefix} Error deleting Firestore document ${firebaseId}:`, error);
                toast({ variant: 'destructive', title: `Erro ao Excluir ${storeName} Online`, description: `ID: ${localId}. Erro: ${error.message}`, duration: 7000 });
                await updateSyncStatus(storeName, localId, firebaseId, 'error'); // Keep as error locally if online delete failed
                return false;
            }
        }

        let newFirebaseId = firebaseId;
        let storageUrl: string | undefined = urlKey ? item[urlKey] : undefined;
        let storagePath: string | undefined = pathKey ? item[pathKey] : undefined;
        const localAttachment = attachmentKey ? item[attachmentKey] : null;
        let oldStoragePathToDelete: string | undefined = undefined;
        let needsStorageUpdate = false;

        // Prepare data for Firestore by removing local-only fields
        const fieldsToRemove: (keyof L)[] = ['localId', 'syncStatus', 'deleted', 'firebaseId'];
        if (attachmentKey) fieldsToRemove.push(attachmentKey); // Don't send the local File/dataURI to Firestore
        const dataToSync = { ...dataToSyncBase };
        fieldsToRemove.forEach(key => delete (dataToSync as any)[key]);
        // console.log(`${logPrefix} Prepared data for Firestore (before attachment handling):`, dataToSync);


        try {
            // Handle attachment upload/deletion
            if (uploadFn && attachmentKey && localAttachment) {
                const isNewUpload = typeof localAttachment === 'string' && localAttachment.startsWith('data:') || localAttachment instanceof File;
                if (isNewUpload) {
                    needsStorageUpdate = true;
                    if (storagePath && deleteStorageFn) { // If there was an old path, mark it for deletion
                        oldStoragePathToDelete = storagePath;
                        console.log(`${logPrefix} Old attachment path ${oldStoragePathToDelete} marked for deletion.`);
                    }
                    console.log(`${logPrefix} Uploading new attachment...`);
                    const uploadResult = await uploadFn(localAttachment, storeName); // Pass appropriate folder
                    storageUrl = uploadResult.url; storagePath = uploadResult.path;
                    console.log(`${logPrefix} Upload successful. URL: ${storageUrl}, Path: ${storagePath}`);
                }
            } else if (pathKey && item[pathKey] && !localAttachment && deleteStorageFn) { // Attachment was removed
                needsStorageUpdate = true;
                oldStoragePathToDelete = item[pathKey]; // Mark old path for deletion
                storageUrl = undefined; storagePath = undefined; // Clear storage info
                console.log(`${logPrefix} Attachment removed locally. Marking ${oldStoragePathToDelete} for deletion from storage.`);
            }

            if (needsStorageUpdate) { // Update dataToSync with new storage info if changed
                if (urlKey) (dataToSync as any)[urlKey] = storageUrl;
                if (pathKey) (dataToSync as any)[pathKey] = storagePath;
                 // console.log(`${logPrefix} Data to sync after attachment processing:`, dataToSync);
            }

            if (firebaseId) {
                console.log(`${logPrefix} Updating Firestore document. Firebase ID: ${firebaseId}. Data:`, dataToSync);
                await updateFn(firebaseId, dataToSync as Partial<Omit<F, 'id'>>);
                console.log(`${logPrefix} Firestore document updated for ${firebaseId}.`);
            } else {
                console.log(`${logPrefix} Adding new document to Firestore. Data:`, dataToSync);
                 if (storeName !== STORE_VEHICLES && !(dataToSync as any).userId && user) { // Ensure userId is present for user-specific records
                    (dataToSync as any).userId = user.id;
                    console.log(`${logPrefix} Added userId ${user.id} to new Firestore document data.`);
                 }
                newFirebaseId = await addFn(dataToSync as Omit<F, 'id'>);
                console.log(`${logPrefix} New document added to Firestore. New Firebase ID: ${newFirebaseId}`);
            }

            // If an old attachment existed and a new one was uploaded (or old one removed), delete old one from storage
            if (oldStoragePathToDelete && oldStoragePathToDelete !== storagePath && deleteStorageFn) { // Ensure not deleting the same path if it's somehow the same
                 console.log(`${logPrefix} Deleting old attachment from storage: ${oldStoragePathToDelete}`);
                 await deleteStorageFn(oldStoragePathToDelete);
                 console.log(`${logPrefix} Old attachment ${oldStoragePathToDelete} deleted from storage.`);
            }
            const localUpdates: Partial<L> = { firebaseId: newFirebaseId } as Partial<L>;
            if (needsStorageUpdate) { // Save new storage info locally as well
                 if (urlKey) (localUpdates as any)[urlKey] = storageUrl;
                 if (pathKey) (localUpdates as any)[pathKey] = storagePath;
            }
            // console.log(`${logPrefix} Updating local status to 'synced'. New Firebase ID: ${newFirebaseId}, LocalUpdates for storage:`, localUpdates);
            await updateSyncStatus(storeName, localId, newFirebaseId!, 'synced', localUpdates);
            return true;
        } catch (error: any) {
            console.error(`${logPrefix} Error processing item ${localId}:`, error);
            toast({ variant: 'destructive', title: `Erro Sinc ${storeName}`, description: `ID: ${localId}. Erro: ${error.message}`, duration: 7000 });
            // Attempt to rollback storage upload if a new file was uploaded and the DB operation failed
            if (needsStorageUpdate && storagePath && storagePath !== oldStoragePathToDelete && uploadFn && deleteStorageFn) { // Check if it was an upload scenario
                 console.warn(`${logPrefix} Rolling back storage upload for ${storagePath} due to error.`);
                 await deleteStorageFn(storagePath).catch(rbError => console.error(`${logPrefix} Error rolling back storage upload:`, rbError));
            }
            await updateSyncStatus(storeName, localId, firebaseId, 'error'); // Keep original firebaseId if update failed
            return false;
        }
    }, [user, toast]); // Added user and toast as dependencies

    const startSync = useCallback(async () => {
        const syncStartTime = performance.now();
        console.log(`[SyncContext startSync ${syncStartTime}] Initiating sync...`);
        if (syncStatus === 'syncing') {
            toast({ title: "Sincronização já em andamento." }); return;
        }
        if (!navigator.onLine) {
            toast({ variant: 'destructive', title: "Offline", description: "Conecte-se à internet para sincronizar." }); return;
        }
        if (!user) {
             toast({ variant: 'destructive', title: "Erro de Autenticação", description: "Usuário não autenticado. Faça login para sincronizar." });
             setSyncStatus('error'); // Set to error because sync cannot proceed
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
                // Also run cleanup in case there are old 'deleted' records marked as synced
                await cleanupDeletedRecords();
                console.log(`[SyncContext startSync ${syncStartTime}] No pending records. Cleanup attempted.`);
                return;
            }
            console.log(`[SyncContext startSync ${syncStartTime}] Total items to sync: ${totalPending}`);

            // Sync vehicles first as they might be parents
            for (const vehicle of pendingData.vehicles) {
                const success = await syncItem<LocalVehicle, FirestoreVehicle>(vehicle, STORE_VEHICLES, addVehicle, updateVehicle, deleteVehicle);
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }

            // Sync trips next
            for (const trip of pendingData.trips) {
                let parentVehicleFirebaseId: string | undefined;
                if (trip.vehicleId) { // vehicleId here is the localId or firebaseId of the vehicle
                    const dbInstance = await localDbOpenDB();
                    const vehicleTx = dbInstance.transaction(STORE_VEHICLES, 'readonly');
                    const vehicleStore = vehicleTx.objectStore(STORE_VEHICLES);
                    // Try fetching by localId first, then by firebaseId if localId is actually a firebaseId
                    let parentVehicle = await new Promise<LocalVehicle | null>((res) => {
                        const req = vehicleStore.get(trip.vehicleId);
                        req.onsuccess = () => res(req.result as LocalVehicle | null);
                        req.onerror = () => res(null); // Resolve with null on error
                    });
                     await vehicleTx.done;

                    if (!parentVehicle) { // If not found by direct key, try by firebaseId index
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
                // Ensure the trip data sent to Firestore uses the parent's Firebase ID
                const tripDataForSync = { ...trip, vehicleId: parentVehicleFirebaseId || trip.vehicleId };
                const success = await syncItem<LocalTrip, FirestoreTrip>(tripDataForSync, STORE_TRIPS, addTrip, updateTrip, deleteTripAndRelatedData);
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }

            const getParentFirebaseId = async (localParentId: string, parentStoreName: string): Promise<string | null> => {
                const dbInstance = await localDbOpenDB(); // Ensure DB is open
                const tx = dbInstance.transaction(parentStoreName, 'readonly');
                const store = tx.objectStore(parentStoreName);

                // Try fetching by localId first
                let parent = await new Promise<any | null>((res) => {
                    const req = store.get(localParentId);
                    req.onsuccess = () => res(req.result);
                    req.onerror = () => res(null);
                });

                // If not found, and if the store has a firebaseId index, try fetching by firebaseId
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
                    'receiptUrl', // attachmentKey (local File/dataURI field)
                    'receiptUrl', // urlKey (Firestore URL field)
                    'receiptPath' // pathKey (Firestore storage path field)
                );
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }
            for (const fueling of pendingData.fuelings) {
                const parentTripFirebaseId = await getParentFirebaseId(fueling.tripLocalId, STORE_TRIPS);
                let parentVehicleFirebaseId: string | undefined = undefined;
                if (fueling.vehicleId) { // vehicleId here is the localId or firebaseId of the vehicle
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
                    'receiptUrl', // attachmentKey
                    'receiptUrl', // urlKey
                    'receiptPath' // pathKey
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
            setTimeout(() => setSyncStatus('idle'), 3000); // Reset to idle after a delay
             // console.log(`[SyncContext startSync ${syncStartTime}] Sync process finished in ${performance.now() - syncStartTime} ms.`);
        }
    }, [syncStatus, toast, user, updatePendingCount, syncItem]);

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

