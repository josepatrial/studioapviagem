// src/contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './AuthContext';
import {
    getPendingRecords,
    updateSyncStatus,
    cleanupDeletedRecords,
    getLocalDbStore, // Correctly import the renamed function
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
    addVehicle, // Add firestore functions for Vehicle
    updateVehicle,
    deleteVehicle,
    // Assuming firestoreService exports these types
    Trip as FirestoreTrip,
    Visit as FirestoreVisit,
    Expense as FirestoreExpense,
    Fueling as FirestoreFueling,
    VehicleInfo as FirestoreVehicle, // Add Firestore type for Vehicle

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
            // Fetch only items with 'pending' or 'error' status
            const { trips, visits, expenses, fuelings, vehicles } = await getPendingRecords();
            setPendingCount(trips.length + visits.length + expenses.length + fuelings.length + vehicles.length);
        } catch (error) {
            console.error("Error updating pending count:", error);
            setPendingCount(0); // Reset count on error
        }
    }, []);

    // Update count on initial load and when user changes
    useEffect(() => {
        updatePendingCount();
    }, [user, updatePendingCount]);


    /**
     * Generic function to sync a single local item with Firestore.
     * Handles creation, update, deletion, and optional attachment upload/deletion.
     */
    const syncItem = async <
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
        attachmentKey?: keyof L, // Key in local object holding attachment data (File or data URL)
        urlKey?: keyof L,       // Key in local object holding the storage URL
        pathKey?: keyof L       // Key in local object holding the storage path
    ): Promise<boolean> => {
        const { localId, firebaseId, deleted, syncStatus, ...dataToSyncBase } = item;

        // 1. Handle Deletion
        if (deleted) {
            try {
                if (firebaseId) {
                    console.log(`Sync: Deleting ${storeName} with Firebase ID: ${firebaseId}`);
                    await deleteFn(firebaseId);
                    // Also delete associated storage file if it exists
                    if (pathKey && item[pathKey] && deleteStorageFn) {
                        await deleteStorageFn(item[pathKey]);
                    }
                    await updateSyncStatus(storeName, localId, firebaseId, 'synced'); // Mark as synced to allow cleanup
                } else {
                    // If no firebaseId, it was created offline and deleted before sync. Just mark synced for cleanup.
                    console.log(`Sync: Marking locally deleted ${storeName} (never synced) as synced for cleanup: ${localId}`);
                    await updateSyncStatus(storeName, localId, '', 'synced');
                }
                return true;
            } catch (error: any) {
                console.error(`Sync Error deleting ${storeName} ${localId} (Firebase ID: ${firebaseId}):`, error);
                toast({ variant: 'destructive', title: `Erro ao Excluir ${storeName}`, description: `ID Local: ${localId}. Erro: ${error.message || 'Desconhecido'}`, duration: 7000 });
                await updateSyncStatus(storeName, localId, firebaseId || '', 'error');
                return false;
            }
        }

        // 2. Prepare Data and Handle Attachments for Add/Update
        let success = false;
        let newFirebaseId = firebaseId;
        let storageUrl: string | undefined = urlKey ? item[urlKey] : undefined;
        let storagePath: string | undefined = pathKey ? item[pathKey] : undefined;
        const localAttachment = attachmentKey ? item[attachmentKey] : null;
        let oldStoragePathToDelete: string | undefined = undefined;
        let needsStorageUpdate = false; // Declare here

        // Clone data and remove local-only fields
        const fieldsToRemove: (keyof L)[] = ['localId', 'syncStatus', 'deleted', 'firebaseId'];
        if (attachmentKey) fieldsToRemove.push(attachmentKey);
        const dataToSync = { ...dataToSyncBase };
        fieldsToRemove.forEach(key => delete (dataToSync as any)[key]);

        try {
            // --- Attachment Logic ---
            // let needsStorageUpdate = false; // Moved declaration outside try block
            if (uploadFn && attachmentKey && localAttachment) { // New or updated attachment present
                // Check if it's a new upload (Data URL or File) vs. an existing URL string
                const isNewUpload = typeof localAttachment === 'string' && localAttachment.startsWith('data:') || localAttachment instanceof File;

                if (isNewUpload) {
                    needsStorageUpdate = true;
                    if (storagePath && deleteStorageFn) { // If replacing an existing file, mark old path for deletion
                        oldStoragePathToDelete = storagePath;
                    }
                    console.log(`Sync: Uploading attachment for ${storeName} ${localId}...`);
                    const uploadResult = await uploadFn(localAttachment, storeName); // Use storeName as folder
                    storageUrl = uploadResult.url;
                    storagePath = uploadResult.path;
                    console.log(`Sync: Upload successful. URL: ${storageUrl}, Path: ${storagePath}`);
                }
                // If localAttachment is a string but not a data URL, assume it's an existing URL - no upload needed
            } else if (pathKey && item[pathKey] && !localAttachment && deleteStorageFn) { // Attachment removed
                needsStorageUpdate = true;
                oldStoragePathToDelete = item[pathKey]; // Mark existing file for deletion
                storageUrl = undefined;
                storagePath = undefined;
                console.log(`Sync: Attachment removed for ${storeName} ${localId}. Marking ${oldStoragePathToDelete} for deletion.`);
            }

            // Update dataToSync object only if storage changed
            if (needsStorageUpdate) {
                if (urlKey) (dataToSync as any)[urlKey] = storageUrl;
                if (pathKey) (dataToSync as any)[pathKey] = storagePath;
            }
            // --- End Attachment Logic ---


            // 3. Add or Update Firestore Document
            if (firebaseId) {
                // Update existing record
                console.log(`Sync: Updating ${storeName} - Local ID: ${localId}, Firebase ID: ${firebaseId}`);
                await updateFn(firebaseId, dataToSync as Partial<Omit<F, 'id'>>);
                console.log(`Sync: Update successful for ${storeName} ${firebaseId}`);
            } else {
                // Add new record
                console.log(`Sync: Adding new ${storeName} - Local ID: ${localId}`);
                // Ensure userId is included if applicable (common for trips, visits, etc., but not vehicles)
                 if (storeName !== STORE_VEHICLES && !(dataToSync as any).userId && user) {
                    (dataToSync as any).userId = user.id;
                 }
                newFirebaseId = await addFn(dataToSync as Omit<F, 'id'>);
                console.log(`Sync: Add successful for ${storeName}. New Firebase ID: ${newFirebaseId}`);
            }

            // 4. Post-Firestore Success Operations: Delete old attachment, Update local status
            if (oldStoragePathToDelete && deleteStorageFn) {
                 console.log(`Sync: Deleting old attachment ${oldStoragePathToDelete}...`);
                 await deleteStorageFn(oldStoragePathToDelete);
            }

             // Pass updated attachment info if it changed
             const localUpdates: Partial<L> = {};
             if (needsStorageUpdate) {
                 if (urlKey) (localUpdates as any)[urlKey] = storageUrl;
                 if (pathKey) (localUpdates as any)[pathKey] = storagePath;
             }

            await updateSyncStatus(storeName, localId, newFirebaseId!, 'synced', localUpdates);
            success = true;

        } catch (error: any) {
            console.error(`Sync Error processing ${storeName} ${localId} (Firebase ID: ${firebaseId}):`, error);
             toast({
                variant: 'destructive',
                title: `Erro ao Sincronizar ${storeName}`,
                description: `ID Local: ${localId}. Erro: ${error.message || 'Desconhecido'}`,
                duration: 7000
            });

            // Rollback storage upload if Firestore operation failed
             if (needsStorageUpdate && storagePath && storagePath !== oldStoragePathToDelete && deleteStorageFn) {
                 console.warn(`Sync: Rolling back storage upload (${storagePath}) for ${localId} due to Firestore error.`);
                 await deleteStorageFn(storagePath).catch(rbError => console.error(`Sync: Error rolling back storage upload:`, rbError));;
             }

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
        let skippedCount = 0;

        try {
            // Fetch all pending records (status 'pending' or 'error')
            const { trips, visits, expenses, fuelings, vehicles } = await getPendingRecords();
            const totalPending = trips.length + visits.length + expenses.length + fuelings.length + vehicles.length;

            if (totalPending === 0) {
                toast({ title: "Sincronização", description: "Nenhum dado pendente para sincronizar." });
                setSyncStatus('success'); // Use 'success' even if nothing to sync
                setLastSyncTime(new Date());
                setPendingCount(0);
                return;
            }

            console.log(`Sync: Found ${totalPending} items to sync.`);

            // --- Sync Order: Vehicles -> Trips -> (Visits, Expenses, Fuelings) ---

            // --- Sync Vehicles ---
            console.log(`Sync: Processing ${vehicles.length} vehicles...`);
            for (const vehicle of vehicles) {
                const success = await syncItem<LocalVehicle, FirestoreVehicle>(
                    vehicle,
                    STORE_VEHICLES,
                    addVehicle,
                    updateVehicle,
                    deleteVehicle
                );
                if (success) syncedCount++; else errorCount++;
                overallSuccess = overallSuccess && success;
            }

            // --- Sync Trips ---
            console.log(`Sync: Processing ${trips.length} trips...`);
            for (const trip of trips) {
                 // Check if parent vehicle is synced (if applicable and vehicleId exists)
                 if (trip.vehicleId) {
                     let parentVehicle: LocalVehicle | null = null;
                     try {
                        const store = await getLocalDbStore(STORE_VEHICLES, 'readonly'); // Use correctly imported function
                        parentVehicle = await new Promise<LocalVehicle | null>((resolve, reject) => {
                             // Try fetching by firebaseId first (if trip.vehicleId is assumed to be firebaseId)
                             // This requires an index on firebaseId in the vehicles store
                             let request: IDBRequest;
                             if (store.indexNames.contains('firebaseId')) {
                                 request = store.index('firebaseId').get(trip.vehicleId);
                             } else {
                                 // Fallback to getting by primary key if vehicleId *might* be localId
                                 request = store.get(trip.vehicleId);
                             }
                             request.onsuccess = () => resolve(request.result as LocalVehicle | null);
                             request.onerror = () => reject(request.error);
                        });
                     } catch(err) {
                         console.error(`Sync: Error fetching parent vehicle ${trip.vehicleId} for trip ${trip.localId}:`, err);
                         // Continue (might cause issues later) or mark trip as error? Let's mark as error.
                         await updateSyncStatus(STORE_TRIPS, trip.localId, trip.firebaseId || '', 'error');
                         errorCount++;
                         overallSuccess = false;
                         continue;
                     }


                     // If vehicle exists locally but isn't synced yet, skip this trip for now
                     if (parentVehicle && parentVehicle.syncStatus !== 'synced') {
                         console.warn(`Sync: Skipping trip ${trip.localId} because parent vehicle ${trip.vehicleId} (localId: ${parentVehicle.localId}) is not synced yet.`);
                         // Optional: Mark trip as error or leave as pending for next sync cycle? Leaving as pending.
                         // await updateSyncStatus(STORE_TRIPS, trip.localId, trip.firebaseId || '', 'error');
                         skippedCount++;
                         continue;
                     }
                     // If vehicle *doesn't exist locally at all*, there's a data integrity issue. Log an error.
                      if (!parentVehicle) {
                          console.error(`Sync: Cannot sync trip ${trip.localId}. Parent vehicle ${trip.vehicleId} not found locally.`);
                          await updateSyncStatus(STORE_TRIPS, trip.localId, trip.firebaseId || '', 'error');
                          errorCount++;
                          overallSuccess = false;
                          continue;
                      }
                      // Ensure the trip uses the VEHICLE'S FIREBASE ID before syncing
                      if (!parentVehicle.firebaseId) {
                           console.error(`Sync: Cannot sync trip ${trip.localId}. Parent vehicle ${trip.vehicleId} (localId: ${parentVehicle.localId}) has no firebaseId.`);
                           await updateSyncStatus(STORE_TRIPS, trip.localId, trip.firebaseId || '', 'error');
                           errorCount++;
                           overallSuccess = false;
                           continue;
                      }
                      trip.vehicleId = parentVehicle.firebaseId; // IMPORTANT: Update trip to use the synced parent ID
                 }

                const success = await syncItem<LocalTrip, FirestoreTrip>(
                    trip,
                    STORE_TRIPS,
                    addTrip,
                    updateTrip,
                    deleteTripAndRelatedData // Use the function that deletes related data too
                );
                if (success) syncedCount++; else errorCount++;
                overallSuccess = overallSuccess && success;
            }

             // --- Sync Visits, Expenses, Fuelings (Children) ---
             // Need to fetch parent trip's Firebase ID for each child item

             // Helper function to get parent trip Firebase ID
             const getParentTripFirebaseId = async (tripLocalId: string): Promise<string | null> => {
                 try {
                      const store = await getLocalDbStore(STORE_TRIPS, 'readonly'); // Use correctly imported function
                     const parentTrip = await new Promise<LocalTrip | null>((resolve, reject) => {
                         const request = store.get(tripLocalId);
                         request.onsuccess = () => resolve(request.result as LocalTrip | null);
                         request.onerror = () => reject(request.error);
                     });
                     // Ensure the parent trip itself is synced before returning its ID
                     if (parentTrip && parentTrip.syncStatus === 'synced' && parentTrip.firebaseId) {
                        return parentTrip.firebaseId;
                     }
                     return null; // Return null if parent not found or not synced
                 } catch (error) {
                      console.error(`Error getting parent trip ${tripLocalId} from local DB:`, error);
                      return null;
                 }
             };

             // --- Sync Visits ---
             console.log(`Sync: Processing ${visits.length} visits...`);
             for (const visit of visits) {
                 const parentFirebaseId = await getParentTripFirebaseId(visit.tripLocalId);
                 if (!parentFirebaseId) {
                     console.warn(`Sync: Skipping visit ${visit.localId} because parent trip ${visit.tripLocalId} is not synced or not found.`);
                     // Mark as error? Leave as pending? Let's mark as error for now.
                     await updateSyncStatus(STORE_VISITS, visit.localId, visit.firebaseId || '', 'error');
                     errorCount++;
                     overallSuccess = false;
                     continue;
                 }
                 // Add the parent's firebaseId to the data before syncing
                 const visitDataWithFirebaseTripId = { ...visit, tripId: parentFirebaseId };
                 const success = await syncItem<typeof visitDataWithFirebaseTripId, FirestoreVisit>(
                     visitDataWithFirebaseTripId,
                     STORE_VISITS,
                     (data) => addVisit(data as Omit<FirestoreVisit, 'id'>),
                     updateVisit,
                     deleteVisit
                 );
                 if (success) syncedCount++; else errorCount++;
                 overallSuccess = overallSuccess && success;
             }

             // --- Sync Expenses ---
              console.log(`Sync: Processing ${expenses.length} expenses...`);
             for (const expense of expenses) {
                 const parentFirebaseId = await getParentTripFirebaseId(expense.tripLocalId);
                  if (!parentFirebaseId) {
                      console.warn(`Sync: Skipping expense ${expense.localId} because parent trip ${expense.tripLocalId} is not synced or not found.`);
                      await updateSyncStatus(STORE_EXPENSES, expense.localId, expense.firebaseId || '', 'error');
                      errorCount++;
                      overallSuccess = false;
                      continue;
                  }
                  const expenseDataWithFirebaseTripId = { ...expense, tripId: parentFirebaseId };
                 const success = await syncItem<typeof expenseDataWithFirebaseTripId, FirestoreExpense>(
                     expenseDataWithFirebaseTripId,
                     STORE_EXPENSES,
                     (data) => addExpense(data as Omit<FirestoreExpense, 'id'>),
                     updateExpense,
                     deleteExpense,
                     uploadReceipt,      // Pass upload function
                     deleteReceipt,      // Pass delete function
                     'receiptUrl',       // Key holding local attachment data (potentially data URL)
                     'receiptUrl',       // Key for Firestore URL
                     'receiptPath'       // Key for Firestore storage path
                 );
                 if (success) syncedCount++; else errorCount++;
                 overallSuccess = overallSuccess && success;
             }

             // --- Sync Fuelings ---
             console.log(`Sync: Processing ${fuelings.length} fuelings...`);
            for (const fueling of fuelings) {
                 const parentFirebaseId = await getParentTripFirebaseId(fueling.tripLocalId);
                  if (!parentFirebaseId) {
                      console.warn(`Sync: Skipping fueling ${fueling.localId} because parent trip ${fueling.tripLocalId} is not synced or not found.`);
                       await updateSyncStatus(STORE_FUELINGS, fueling.localId, fueling.firebaseId || '', 'error');
                       errorCount++;
                       overallSuccess = false;
                      continue;
                  }
                  // Get parent Vehicle firebaseId
                  const tripStore = await getLocalDbStore(STORE_TRIPS, 'readonly');
                  const parentTrip = await new Promise<LocalTrip | null>((resolve, reject) => {
                      const request = tripStore.get(fueling.tripLocalId);
                      request.onsuccess = () => resolve(request.result as LocalTrip | null);
                      request.onerror = () => reject(request.error);
                  });

                  if (!parentTrip || !parentTrip.vehicleId) {
                       console.error(`Sync: Cannot sync fueling ${fueling.localId}. Parent trip ${fueling.tripLocalId} or its vehicleId not found locally.`);
                       await updateSyncStatus(STORE_FUELINGS, fueling.localId, fueling.firebaseId || '', 'error');
                       errorCount++;
                       overallSuccess = false;
                       continue;
                  }

                   // Fetch the vehicle record to ensure it's synced and get its firebaseId
                   const vehicleStore = await getLocalDbStore(STORE_VEHICLES, 'readonly');
                   const parentVehicle = await new Promise<LocalVehicle | null>((resolve, reject) => {
                       let request: IDBRequest;
                        if (vehicleStore.indexNames.contains('firebaseId')) {
                            request = vehicleStore.index('firebaseId').get(parentTrip.vehicleId);
                        } else {
                            request = vehicleStore.get(parentTrip.vehicleId);
                        }
                        request.onsuccess = () => resolve(request.result as LocalVehicle | null);
                        request.onerror = () => reject(request.error);
                   });


                   if (!parentVehicle || parentVehicle.syncStatus !== 'synced' || !parentVehicle.firebaseId) {
                       console.warn(`Sync: Skipping fueling ${fueling.localId} because parent vehicle ${parentTrip.vehicleId} is not synced or not found.`);
                       skippedCount++;
                       continue; // Skip this fueling for now
                   }


                  const fuelingDataWithFirebaseIds = {
                      ...fueling,
                      tripId: parentFirebaseId,
                      vehicleId: parentVehicle.firebaseId // Use the vehicle's firebaseId
                    };

                 const success = await syncItem<typeof fuelingDataWithFirebaseIds, FirestoreFueling>(
                     fuelingDataWithFirebaseIds,
                     STORE_FUELINGS,
                      (data) => addFueling(data as Omit<FirestoreFueling, 'id'>),
                      updateFueling,
                      deleteFueling,
                      uploadReceipt,
                      deleteReceipt,
                      'receiptUrl', // Key holding local attachment data (potentially data URL)
                      'receiptUrl',
                      'receiptPath'
                 );
                if (success) syncedCount++; else errorCount++;
                overallSuccess = overallSuccess && success;
            }


            // --- Cleanup ---
            console.log("Sync: Cleaning up successfully deleted records...");
            await cleanupDeletedRecords();
            console.log("Sync: Cleanup complete.");


            const finalSyncStatus = overallSuccess ? 'success' : 'error';
            setSyncStatus(finalSyncStatus);
            setLastSyncTime(new Date());
            updatePendingCount(); // Update count after sync

            // --- Final Toast Message ---
             let toastDescription = `${syncedCount} de ${totalPending} itens sincronizados.`;
             if (errorCount > 0) {
                 toastDescription += ` ${errorCount} falharam.`;
             }
             if (skippedCount > 0) {
                  toastDescription += ` ${skippedCount} ignorados (dependências pendentes).`;
             }

            if (finalSyncStatus === 'success') {
                toast({ title: "Sincronização Concluída", description: toastDescription });
            } else {
                toast({ variant: 'destructive', title: "Sincronização Parcial", description: toastDescription });
            }

        } catch (error: any) {
            console.error("Sync Error (Overall Process):", error);
            toast({ variant: 'destructive', title: "Erro na Sincronização", description: `Ocorreu um erro inesperado: ${error.message || 'Verifique os logs.'}` });
            setSyncStatus('error');
        } finally {
             // Ensure status resets if it's stuck in 'syncing' but finished (redundant?)
             // if (syncStatus === 'syncing') {
             //     setSyncStatus(overallSuccess ? 'success' : 'error');
             // }
             // Reset to idle after a short delay to allow user to see success/error state
             setTimeout(() => {
                 setSyncStatus('idle');
             }, 3000);
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
