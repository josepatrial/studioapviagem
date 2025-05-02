// src/contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './AuthContext';
import {
    getPendingRecords,
    updateSyncStatus,
    cleanupDeletedRecords,
    LocalTrip,
    LocalVisit,
    LocalExpense,
    LocalFueling,
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
    // Assuming firestoreService exports these types
    Trip as FirestoreTrip,
    Visit as FirestoreVisit,
    Expense as FirestoreExpense,
    Fueling as FirestoreFueling,

} from '@/services/firestoreService';
import { deleteReceipt, uploadReceipt } from '@/services/storageService'; // For handling attachments during sync

type SyncStatusState = 'idle' | 'syncing' | 'success' | 'error';

interface SyncContextType {
    syncStatus: SyncStatusState;
    lastSyncTime: Date | null;
    pendingCount: number; // Total count of items needing sync
    startSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider = ({ children }: { children: ReactNode }) => {
    const [syncStatus, setSyncStatus] = useState<SyncStatusState>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [pendingCount, setPendingCount] = useState<number>(0);
    const { toast } = useToast();
    const { user } = useAuth(); // Need user context for user ID during sync

    const updatePendingCount = useCallback(async () => {
        try {
            const { trips, visits, expenses, fuelings } = await getPendingRecords();
            setPendingCount(trips.length + visits.length + expenses.length + fuelings.length);
        } catch (error) {
            console.error("Error updating pending count:", error);
            setPendingCount(0); // Reset count on error
        }
    }, []);

    // Update count on initial load and when user changes
    useEffect(() => {
        updatePendingCount();
    }, [user, updatePendingCount]);


    const syncItem = async <L extends { localId: string; firebaseId?: string; syncStatus: 'pending' | 'error'; deleted?: boolean }, F>(
        item: L,
        storeName: string,
        addFn: (data: Omit<F, 'id'>) => Promise<string>,
        updateFn: (id: string, data: Partial<Omit<F, 'id'>>) => Promise<void>,
        deleteFn: (id: string) => Promise<void>,
        uploadFn?: (fileOrDataUrl: File | string, folder: string) => Promise<{ url: string; path: string }>,
        deleteStorageFn?: (path: string) => Promise<void>,
        attachmentKey?: keyof L, // e.g., 'receiptDataUrl' or 'attachmentFile'
        urlKey?: keyof L, // e.g., 'receiptUrl'
        pathKey?: keyof L // e.g., 'receiptPath'
    ): Promise<boolean> => {
        const { localId, firebaseId, deleted, ...dataToSyncBase } = item;

        // Remove local-only fields before sending to Firestore
        const fieldsToRemove: (keyof L)[] = ['localId', 'syncStatus', 'deleted', 'firebaseId'];
        if (attachmentKey) fieldsToRemove.push(attachmentKey); // Remove local attachment reference if exists
        const dataToSync = { ...dataToSyncBase };
        fieldsToRemove.forEach(key => delete (dataToSync as any)[key]);

         let success = false;
         let newFirebaseId = firebaseId;

        try {
             let storageUrl: string | undefined = item[urlKey as keyof L] as string | undefined;
             let storagePath: string | undefined = item[pathKey as keyof L] as string | undefined;
             const localAttachment = attachmentKey ? item[attachmentKey as keyof L] : null;
             let oldStoragePathToDelete: string | undefined = undefined;

             // Handle Deletion
             if (deleted) {
                 if (firebaseId) {
                      console.log(`Sync: Deleting ${storeName} with Firebase ID: ${firebaseId}`);
                      await deleteFn(firebaseId);
                       // Also delete associated storage file if it exists
                       if (storagePath && deleteStorageFn) {
                           await deleteStorageFn(storagePath);
                       }
                      // Mark as synced locally after successful server deletion
                      await updateSyncStatus(storeName, localId, firebaseId, 'synced');
                      success = true;
                 } else {
                     // If no firebaseId, it was created offline and deleted before sync. Just remove locally.
                     console.log(`Sync: Removing locally deleted ${storeName} (never synced): ${localId}`);
                     await updateSyncStatus(storeName, localId, '', 'synced'); // Mark as synced to allow cleanup
                     success = true;
                 }
                 return success; // Exit early for deletions
             }


             // Handle Attachment Upload/Update
             if (uploadFn && attachmentKey && localAttachment && typeof localAttachment === 'string' && localAttachment.startsWith('data:')) { // Upload new from data URL
                  if (storagePath && deleteStorageFn) { // If replacing, mark old path for deletion
                       oldStoragePathToDelete = storagePath;
                   }
                  const uploadResult = await uploadFn(localAttachment, storeName); // Use storeName as folder
                  storageUrl = uploadResult.url;
                  storagePath = uploadResult.path;
                  // Update dataToSync with new storage info
                  (dataToSync as any)[urlKey as string] = storageUrl;
                  (dataToSync as any)[pathKey as string] = storagePath;

             } else if (uploadFn && attachmentKey && localAttachment instanceof File) { // Upload new from File
                   if (storagePath && deleteStorageFn) {
                       oldStoragePathToDelete = storagePath;
                   }
                   const uploadResult = await uploadFn(localAttachment, storeName);
                   storageUrl = uploadResult.url;
                   storagePath = uploadResult.path;
                   (dataToSync as any)[urlKey as string] = storageUrl;
                   (dataToSync as any)[pathKey as string] = storagePath;
             } else if (!localAttachment && storagePath && deleteStorageFn) { // Attachment removed
                  oldStoragePathToDelete = storagePath;
                   (dataToSync as any)[urlKey as string] = undefined;
                   (dataToSync as any)[pathKey as string] = undefined;
             }


             // Handle Add or Update
            if (firebaseId) {
                // Update existing record
                console.log(`Sync: Updating ${storeName} - Local ID: ${localId}, Firebase ID: ${firebaseId}`);
                await updateFn(firebaseId, dataToSync as Partial<Omit<F, 'id'>>);
                console.log(`Sync: Update successful for ${storeName} ${firebaseId}`);

                // Delete old storage file *after* successful Firestore update
                if (oldStoragePathToDelete && deleteStorageFn) {
                    await deleteStorageFn(oldStoragePathToDelete);
                }
            } else {
                // Add new record
                console.log(`Sync: Adding new ${storeName} - Local ID: ${localId}`);
                // Ensure userId is included if applicable (common for trips, etc.)
                 if (storeName !== STORE_VEHICLES && !(dataToSync as any).userId && user) {
                    (dataToSync as any).userId = user.id;
                 }
                newFirebaseId = await addFn(dataToSync as Omit<F, 'id'>);
                console.log(`Sync: Add successful for ${storeName}. New Firebase ID: ${newFirebaseId}`);

                 // If old path existed during add (shouldn't happen often, but safety), delete it
                 if (oldStoragePathToDelete && deleteStorageFn) {
                     console.warn(`Sync: Deleting old storage path ${oldStoragePathToDelete} during an add operation for ${localId}`);
                     await deleteStorageFn(oldStoragePathToDelete);
                 }
            }

            // Update local status to 'synced'
            await updateSyncStatus(storeName, localId, newFirebaseId!, 'synced');
            success = true;

        } catch (error: any) {
            console.error(`Sync Error processing ${storeName} ${localId}:`, error);
             toast({
                variant: 'destructive',
                title: `Erro ao Sincronizar ${storeName}`,
                description: `ID Local: ${localId}. Erro: ${error.message || 'Desconhecido'}`,
                duration: 7000
            });
             // If add failed but upload succeeded, delete the uploaded file
             if (!firebaseId && newFirebaseId === firebaseId && storagePath && storagePath !== oldStoragePathToDelete && deleteStorageFn) {
                 console.warn(`Sync: Rolling back storage upload for ${localId} due to Firestore add error.`);
                 await deleteStorageFn(storagePath);
             }
             // If update failed but upload succeeded, delete the new file
             if (firebaseId && storagePath && storagePath !== oldStoragePathToDelete && deleteStorageFn) {
                 console.warn(`Sync: Rolling back storage upload for ${localId} due to Firestore update error.`);
                 await deleteStorageFn(storagePath);
             }

            // Update local status to 'error'
            await updateSyncStatus(storeName, localId, firebaseId || '', 'error');
            success = false;
        }
        return success;
    };


    const startSync = useCallback(async () => {
        if (syncStatus === 'syncing') {
            toast({ title: "Sincronização já em andamento." });
            return;
        }
        if (!navigator.onLine) {
            toast({ variant: 'destructive', title: "Offline", description: "Você está offline. Conecte-se à internet para sincronizar." });
            return;
        }
        if (!user) {
             toast({ variant: 'destructive', title: "Erro", description: "Usuário não autenticado. Faça login para sincronizar." });
             return;
        }


        setSyncStatus('syncing');
        toast({ title: "Iniciando sincronização..." });

        let overallSuccess = true;
        let syncedCount = 0;
        let errorCount = 0;

        try {
            const { trips, visits, expenses, fuelings } = await getPendingRecords();
            const totalPending = trips.length + visits.length + expenses.length + fuelings.length;

            if (totalPending === 0) {
                toast({ title: "Sincronização", description: "Nenhum dado pendente para sincronizar." });
                setSyncStatus('success');
                setLastSyncTime(new Date());
                setPendingCount(0);
                return;
            }

            console.log(`Sync: Found ${totalPending} items to sync.`);

            // --- Sync Trips ---
            for (const trip of trips) {
                // IMPORTANT: We need to handle the case where a trip might depend on a vehicle that hasn't been synced.
                // For simplicity now, we assume vehicles are synced separately or exist.
                // A more robust solution might involve syncing vehicles first or handling dependencies.
                const success = await syncItem<LocalTrip, FirestoreTrip>(
                    trip,
                    'trips',
                    addTrip,
                    updateTrip,
                    deleteTripAndRelatedData // Use the function that deletes related data too
                );
                if (success) syncedCount++; else errorCount++;
                overallSuccess = overallSuccess && success;
            }

             // --- Sync Visits ---
            for (const visit of visits) {
                 // Find the corresponding trip's Firebase ID if it exists locally
                 const parentTrip = await getStore('trips', 'readonly').then(store =>
                    new Promise<LocalTrip | null>((resolve, reject) => {
                        const request = store.get(visit.tripLocalId);
                        request.onsuccess = () => resolve(request.result as LocalTrip | null);
                        request.onerror = () => reject(`Error getting parent trip ${visit.tripLocalId}: ${request.error}`);
                    })
                 ).catch(err => {
                     console.error(err);
                     return null;
                 });

                 if (!parentTrip || !parentTrip.firebaseId) {
                     console.warn(`Sync: Skipping visit ${visit.localId} because parent trip ${visit.tripLocalId} is not synced or not found.`);
                     await updateSyncStatus('visits', visit.localId, '', 'error'); // Mark as error if parent not synced
                     errorCount++;
                     overallSuccess = false;
                     continue;
                 }

                 const visitDataWithFirebaseTripId = { ...visit, tripId: parentTrip.firebaseId };

                 const success = await syncItem<typeof visitDataWithFirebaseTripId & { localId: string }, FirestoreVisit>(
                     visitDataWithFirebaseTripId,
                     'visits',
                     (data) => addVisit(data as Omit<FirestoreVisit, 'id'>), // Cast might be needed
                     updateVisit,
                     deleteVisit
                 );
                 if (success) syncedCount++; else errorCount++;
                 overallSuccess = overallSuccess && success;
             }

             // --- Sync Expenses ---
             for (const expense of expenses) {
                  const parentTrip = await getStore('trips', 'readonly').then(store =>
                    new Promise<LocalTrip | null>((resolve, reject) => {
                        const request = store.get(expense.tripLocalId);
                        request.onsuccess = () => resolve(request.result as LocalTrip | null);
                        request.onerror = () => reject(`Error getting parent trip ${expense.tripLocalId}: ${request.error}`);
                    })
                 ).catch(err => { console.error(err); return null; });

                 if (!parentTrip || !parentTrip.firebaseId) {
                     console.warn(`Sync: Skipping expense ${expense.localId} because parent trip ${expense.tripLocalId} is not synced or not found.`);
                     await updateSyncStatus('expenses', expense.localId, '', 'error');
                     errorCount++;
                     overallSuccess = false;
                     continue;
                 }
                 const expenseDataWithFirebaseTripId = { ...expense, tripId: parentTrip.firebaseId };
                 const success = await syncItem<typeof expenseDataWithFirebaseTripId & { localId: string }, FirestoreExpense>(
                     expenseDataWithFirebaseTripId,
                     'expenses',
                     (data) => addExpense(data as Omit<FirestoreExpense, 'id'>),
                     updateExpense,
                     deleteExpense,
                     uploadReceipt,      // Pass upload function
                     deleteReceipt,      // Pass delete function
                     'receiptUrl', // Key holding local data URL or File (adjust if different)
                     'receiptUrl',       // Key for Firestore URL
                     'receiptPath'       // Key for Firestore storage path
                 );
                 if (success) syncedCount++; else errorCount++;
                 overallSuccess = overallSuccess && success;
             }

             // --- Sync Fuelings ---
            for (const fueling of fuelings) {
                 const parentTrip = await getStore('trips', 'readonly').then(store =>
                     new Promise<LocalTrip | null>((resolve, reject) => {
                         const request = store.get(fueling.tripLocalId);
                         request.onsuccess = () => resolve(request.result as LocalTrip | null);
                         request.onerror = () => reject(`Error getting parent trip ${fueling.tripLocalId}: ${request.error}`);
                     })
                 ).catch(err => { console.error(err); return null; });

                 if (!parentTrip || !parentTrip.firebaseId) {
                     console.warn(`Sync: Skipping fueling ${fueling.localId} because parent trip ${fueling.tripLocalId} is not synced or not found.`);
                     await updateSyncStatus('fuelings', fueling.localId, '', 'error');
                     errorCount++;
                     overallSuccess = false;
                     continue;
                 }
                const fuelingDataWithFirebaseTripId = { ...fueling, tripId: parentTrip.firebaseId };
                 const success = await syncItem<typeof fuelingDataWithFirebaseTripId & { localId: string }, FirestoreFueling>(
                     fuelingDataWithFirebaseTripId,
                     'fuelings',
                      (data) => addFueling(data as Omit<FirestoreFueling, 'id'>),
                      updateFueling,
                      deleteFueling,
                      uploadReceipt,
                      deleteReceipt,
                      'receiptUrl', // Key holding local data URL or File
                      'receiptUrl',
                      'receiptPath'
                 );
                if (success) syncedCount++; else errorCount++;
                overallSuccess = overallSuccess && success;
            }


            // --- Cleanup ---
            await cleanupDeletedRecords();

            setSyncStatus(overallSuccess ? 'success' : 'error');
            setLastSyncTime(new Date());
            updatePendingCount(); // Update count after sync

            if (overallSuccess) {
                toast({ title: "Sincronização Concluída", description: `${syncedCount} itens sincronizados.` });
            } else {
                toast({ variant: 'destructive', title: "Sincronização Parcial", description: `${syncedCount} itens sincronizados, ${errorCount} falharam. Verifique os logs ou tente novamente.` });
            }

        } catch (error: any) {
            console.error("Sync Error:", error);
            toast({ variant: 'destructive', title: "Erro na Sincronização", description: error.message || "Ocorreu um erro inesperado." });
            setSyncStatus('error');
        } finally {
             // Ensure status resets if it's stuck in 'syncing' but finished
             if (syncStatus === 'syncing') {
                 setSyncStatus(overallSuccess ? 'success' : 'error');
             }
        }
    }, [syncStatus, toast, user, updatePendingCount]); // Include updatePendingCount

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

    