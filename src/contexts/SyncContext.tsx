
// src/contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth, User as AuthContextUserType } from './AuthContext';
import {
    getPendingRecords,
    updateSyncStatus,
    cleanupDeletedRecords,
    getLocalDbStore,
    LocalTrip,
    LocalVisit,
    LocalExpense,
    LocalFueling,
    LocalVehicle,
    LocalUser,
    STORE_TRIPS,
    STORE_VISITS,
    STORE_EXPENSES,
    STORE_FUELINGS,
    STORE_VEHICLES,
    STORE_USERS,
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
    deleteExpense as deleteFirestoreExpense,
    addFueling,
    updateFueling,
    deleteFueling as deleteFirestoreFueling,
    addVehicle,
    updateVehicle,
    deleteVehicle as deleteFirestoreVehicle,
    setUserData,
    Trip as FirestoreTrip,
    Visit as FirestoreVisit,
    Expense as FirestoreExpense,
    Fueling as FirestoreFueling,
    VehicleInfo as FirestoreVehicle,
    User as FirestoreUser,
} from '@/services/firestoreService';
import { deleteReceipt, uploadReceipt } from '@/services/storageService';

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
    const { user, firebaseUser } = useAuth();

    const updatePendingCount = useCallback(async () => {
        try {
            const { trips, visits, expenses, fuelings, vehicles, users } = await getPendingRecords();
            const count = trips.length + visits.length + expenses.length + fuelings.length + vehicles.length + users.length;
            setPendingCount(count);
        } catch (error) {
            console.error("[SyncContext updatePendingCount] Error updating pending count:", error);
            setPendingCount(0);
        }
    }, []);

    useEffect(() => {
        updatePendingCount();
    }, [user, updatePendingCount]);

    const syncItem = useCallback(async <
        L extends { localId?: string; id?: string; firebaseId?: string; syncStatus: 'pending' | 'error' | 'synced'; deleted?: boolean; userId?: string; [key: string]: any },
        F extends { id: string; userId?: string; [key: string]: any }
    >(
        item: L,
        storeName: string,
        addFn: (data: Omit<F, 'id'> | Partial<FirestoreUser>, id?: string) => Promise<string>, // For users, id is UID
        updateFn: (id: string, data: Partial<Omit<F, 'id'> | Partial<FirestoreUser>>) => Promise<void>,
        deleteFn: (id: string) => Promise<void>,
        uploadFn?: (fileOrDataUrl: File | string, folder: string) => Promise<{ url: string; path: string }>,
        deleteStorageFn?: (path: string) => Promise<void>,
        attachmentKey?: keyof L,
        urlKey?: keyof L,
        pathKey?: keyof L
    ): Promise<boolean> => {

        const itemLocalIdForDb = storeName === STORE_USERS ? item.id : item.localId; // Users use 'id' as local key
        const logPrefix = `[SyncContext syncItem - ${storeName} ${itemLocalIdForDb || 'NO_LOCAL_ID_FOR_LOG'}]`;
        
        if (!itemLocalIdForDb) {
            console.error(`${logPrefix} Item is missing its primary local key. Skipping sync. Item:`, item);
            toast({ variant: 'destructive', title: `Erro de Dados Locais (${storeName})`, description: `Item sem ID local. Sincronização pulada.`, duration: 7000 });
            return false;
        }

        const { localId, id: itemIdFromItem, firebaseId: currentFirebaseIdFromItem, deleted, syncStatus: itemSyncStatus, ...dataToSyncBase } = item;
        const currentAuthUserId = firebaseUser?.uid || user?.firebaseId;

        console.log(`${logPrefix} User state before Firestore operation:`, { authContextUser: user, authContextFirebaseUser: firebaseUser });
        console.log(`${logPrefix} currentAuthUserId for this operation: ${currentAuthUserId}`);


        if (deleted) {
            try {
                if (currentFirebaseIdFromItem && !currentFirebaseIdFromItem.startsWith('local_') && !currentFirebaseIdFromItem.startsWith('temp_')) {
                    console.log(`${logPrefix} Deleting from Firestore. Firebase ID: ${currentFirebaseIdFromItem}`);
                    await deleteFn(currentFirebaseIdFromItem);
                    if (pathKey && item[pathKey] && deleteStorageFn) {
                        console.log(`${logPrefix} Deleting attachment from storage: ${item[pathKey]}`);
                        await deleteStorageFn(item[pathKey] as string);
                    }
                    console.log(`${logPrefix} Firestore deletion successful for ${currentFirebaseIdFromItem}.`);
                } else {
                    console.log(`${logPrefix} Item marked for local deletion or had no valid Firebase ID ('${currentFirebaseIdFromItem}'). No Firestore deletion needed.`);
                }
                await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'synced'); // Mark as synced to allow cleanup
                return true;
            } catch (error: any) {
                console.error(`${logPrefix} Error deleting Firestore document ${currentFirebaseIdFromItem}:`, error);
                toast({ variant: 'destructive', title: `Erro ao Excluir ${storeName} Online`, description: `ID: ${itemLocalIdForDb}. Erro: ${error.message}`, duration: 7000 });
                await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'error');
                return false;
            }
        }

        if (!currentAuthUserId) {
             console.warn(`${logPrefix} No authenticated Firebase user ID found for an add/update operation. Skipping Firestore operation for item:`, itemLocalIdForDb);
             toast({ variant: 'destructive', title: `Erro de Autenticação na Sincronização`, description: `Não foi possível sincronizar ${storeName} ID: ${itemLocalIdForDb} por falta de usuário autenticado no Firebase.`, duration: 7000 });
             return false;
        }

        // Determine the effective firebaseId for the operation. If it looks local, treat as undefined to force an add.
        let effectiveFirebaseIdForOperation = currentFirebaseIdFromItem;
        if (effectiveFirebaseIdForOperation && (effectiveFirebaseIdForOperation.startsWith('local_') || effectiveFirebaseIdForOperation.startsWith('temp_'))) {
            console.warn(`${logPrefix} Item ${itemLocalIdForDb} has firebaseId ('${effectiveFirebaseIdForOperation}') that looks like a local ID. Treating as unsynced and forcing an add operation.`);
            effectiveFirebaseIdForOperation = undefined; // This will force the 'add' path below
        }

        let storageUrl: string | undefined = urlKey ? item[urlKey] as string : undefined;
        let storagePath: string | undefined = pathKey ? item[pathKey] as string : undefined;
        const localAttachment = attachmentKey ? item[attachmentKey] : null;
        let oldStoragePathToDelete: string | undefined = undefined;
        let needsStorageUpdate = false;

        const fieldsToExcludeFromFirestore: (keyof L)[] = ['localId', 'syncStatus', 'deleted', 'firebaseId', 'id'];
        if (attachmentKey) fieldsToExcludeFromFirestore.push(attachmentKey);

        const dataToSyncFirestore = { ...dataToSyncBase };
        fieldsToExcludeFromFirestore.forEach(key => delete (dataToSyncFirestore as any)[key]);

        // Ensure userId in payload is the authenticated Firebase user's UID
        if (storeName !== STORE_USERS && currentAuthUserId) {
            if (!dataToSyncFirestore.userId || (dataToSyncFirestore.userId && typeof dataToSyncFirestore.userId === 'string' && dataToSyncFirestore.userId.startsWith('local_'))) {
                 console.log(`${logPrefix} Setting/overriding userId in payload to current authenticated Firebase UID: ${currentAuthUserId}. Original item.userId was: ${item.userId}`);
                (dataToSyncFirestore as any).userId = currentAuthUserId;
            }
        }


        if ((storeName === STORE_VISITS || storeName === STORE_EXPENSES || storeName === STORE_FUELINGS) && (dataToSyncFirestore as any).tripLocalId) {
            const parentTrip = await getLocalDbStore(STORE_TRIPS, 'readonly').then(s => s.get((dataToSyncFirestore as any).tripLocalId!)).then(req => new Promise<LocalTrip|null>(res => { req.onsuccess = () => res(req.result); req.onerror = () => res(null); }));
            if (parentTrip && parentTrip.firebaseId && !parentTrip.firebaseId.startsWith('local_')) {
                (dataToSyncFirestore as any).tripId = parentTrip.firebaseId;
            } else {
                console.warn(`${logPrefix} Parent trip ${(dataToSyncFirestore as any).tripLocalId} for item ${itemLocalIdForDb} not synced or missing valid Firebase ID. Sync for this item may fail or be delayed.`);
                 // If parent trip not synced, this item cannot be reliably synced.
                await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'error', { errorDetails: 'Parent trip not synced' });
                return false;
            }
            delete (dataToSyncFirestore as any).tripLocalId;
        }

        if ((storeName === STORE_TRIPS || storeName === STORE_FUELINGS) && (dataToSyncFirestore as any).vehicleId) {
            const vehicleIdValue = (dataToSyncFirestore as any).vehicleId;
            if (typeof vehicleIdValue === 'string' && vehicleIdValue.startsWith('local_')) {
                const parentVehicle = await getLocalDbStore(STORE_VEHICLES, 'readonly').then(s => s.get(vehicleIdValue!)).then(req => new Promise<LocalVehicle|null>(res => { req.onsuccess = () => res(req.result); req.onerror = () => res(null); }));
                if (parentVehicle && parentVehicle.firebaseId && !parentVehicle.firebaseId.startsWith('local_')) {
                    (dataToSyncFirestore as any).vehicleId = parentVehicle.firebaseId;
                } else {
                     console.warn(`${logPrefix} Parent vehicle ${vehicleIdValue} for item ${itemLocalIdForDb} not synced or missing valid Firebase ID. Sync for this item may fail or be delayed.`);
                     await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'error', { errorDetails: 'Parent vehicle not synced' });
                     return false;
                }
            }
        }

        console.log(`${logPrefix} Data prepared for Firestore. Target Firebase ID: ${effectiveFirebaseIdForOperation || '(new)'}. Payload:`, JSON.parse(JSON.stringify(dataToSyncFirestore)));
        console.log(`${logPrefix} Authenticated user for this operation: ${currentAuthUserId}`);

        let finalFirebaseIdAfterOperation = effectiveFirebaseIdForOperation;

        try {
            if (uploadFn && attachmentKey && localAttachment) {
                const isNewUpload = typeof localAttachment === 'string' && localAttachment.startsWith('data:') || localAttachment instanceof File;
                if (isNewUpload) {
                    needsStorageUpdate = true;
                    if (storagePath && deleteStorageFn) { // If there was an old path
                        oldStoragePathToDelete = storagePath;
                        console.log(`${logPrefix} Old attachment path ${oldStoragePathToDelete} marked for deletion.`);
                    }
                    console.log(`${logPrefix} Uploading new attachment...`);
                    const uploadResult = await uploadFn(localAttachment as File | string, storeName);
                    storageUrl = uploadResult.url; storagePath = uploadResult.path;
                    console.log(`${logPrefix} Upload successful. URL: ${storageUrl}, Path: ${storagePath}`);
                }
            } else if (urlKey && item[urlKey] && pathKey && item[pathKey] && !localAttachment && deleteStorageFn) { // Attachment explicitly removed
                needsStorageUpdate = true;
                oldStoragePathToDelete = item[pathKey] as string;
                storageUrl = undefined; storagePath = undefined;
                console.log(`${logPrefix} Attachment removed locally. Marking ${oldStoragePathToDelete} for deletion from storage.`);
            }

            if (needsStorageUpdate) {
                if (urlKey) (dataToSyncFirestore as any)[urlKey] = storageUrl;
                if (pathKey) (dataToSyncFirestore as any)[pathKey] = storagePath;
            }


            if (finalFirebaseIdAfterOperation) { // Attempting to update an existing Firestore document
                console.log(`${logPrefix} Updating Firestore document. Firebase ID: ${finalFirebaseIdAfterOperation}.`);
                await updateFn(finalFirebaseIdAfterOperation, dataToSyncFirestore as Partial<Omit<F, 'id'>>);
                console.log(`${logPrefix} Firestore document updated for ${finalFirebaseIdAfterOperation}.`);
            } else { // Attempting to add a new document to Firestore
                console.log(`${logPrefix} Adding new document to Firestore.`);
                if (storeName === STORE_USERS && item.id && item.id === currentAuthUserId) { // Ensure we use the Auth UID for user docs
                    finalFirebaseIdAfterOperation = currentAuthUserId;
                    console.log(`${logPrefix} User document to be created/set with known Firebase ID (Auth UID): ${finalFirebaseIdAfterOperation}.`);
                    await addFn(dataToSyncFirestore as Partial<FirestoreUser>, finalFirebaseIdAfterOperation);
                } else {
                     finalFirebaseIdAfterOperation = await addFn(dataToSyncFirestore as Omit<F, 'id'>);
                }
                console.log(`${logPrefix} New document added/set in Firestore. Assigned Firebase ID: ${finalFirebaseIdAfterOperation}`);
            }

            if (oldStoragePathToDelete && oldStoragePathToDelete !== storagePath && deleteStorageFn) {
                console.log(`${logPrefix} Deleting old attachment from storage: ${oldStoragePathToDelete}`);
                await deleteStorageFn(oldStoragePathToDelete);
                console.log(`${logPrefix} Old attachment ${oldStoragePathToDelete} deleted from storage.`);
            }

            const localUpdates: Partial<L> = { firebaseId: finalFirebaseIdAfterOperation } as Partial<L>;
            if (needsStorageUpdate) {
                if (urlKey) (localUpdates as any)[urlKey] = storageUrl;
                if (pathKey) (localUpdates as any)[pathKey] = storagePath;
            }
            await updateSyncStatus(storeName, itemLocalIdForDb, finalFirebaseIdAfterOperation!, 'synced', localUpdates);
            return true;
        } catch (error: any) {
            console.error(`${logPrefix} Error processing item ${itemLocalIdForDb} with Firestore. Error: ${error.code} - ${error.message}. Payload sent:`, dataToSyncFirestore, `Auth User ID: ${currentAuthUserId}`);
            toast({ variant: 'destructive', title: `Erro Sinc ${storeName}`, description: `ID: ${itemLocalIdForDb}. Erro: ${error.message}`, duration: 7000 });
            if (needsStorageUpdate && storagePath && storagePath !== oldStoragePathToDelete && uploadFn && deleteStorageFn) {
                console.warn(`${logPrefix} Rolling back storage upload for ${storagePath} due to error.`);
                await deleteStorageFn(storagePath).catch(rbError => console.error(`${logPrefix} Error rolling back storage upload:`, rbError));
            }
            // If an error occurred, revert to original firebaseId for updating sync status to 'error'
            await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'error');
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

        const currentAuthUserId = firebaseUser?.uid || user?.firebaseId;
        console.log(`[SyncContext startSync] AuthContext user state in SyncContext:`, JSON.parse(JSON.stringify(user)));
        console.log(`[SyncContext startSync] AuthContext firebaseUser state in SyncContext:`, JSON.parse(JSON.stringify(firebaseUser)));
        console.log(`[SyncContext startSync] Effective Firebase User ID for sync: ${currentAuthUserId}`);


        if (!currentAuthUserId) {
            console.warn(`[SyncContext startSync] Cannot start sync: No authenticated Firebase user ID.`);
            toast({ variant: 'destructive', title: "Erro de Autenticação", description: "Usuário Firebase não autenticado. Faça login online para sincronizar." });
            setSyncStatus('idle');
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

            for (const pendingUser of pendingData.users) {
                const userLocalId = pendingUser.id;
                if (!userLocalId) {
                     console.warn(`[SyncContext] Skipping user sync for an item missing 'id':`, pendingUser);
                     skippedCount++;
                     continue;
                }
                
                let shouldSyncUser = false;
                if (pendingUser.firebaseId && !pendingUser.firebaseId.startsWith('local_')) {
                    shouldSyncUser = true;
                } else if (pendingUser.id === currentAuthUserId && (!pendingUser.firebaseId || pendingUser.firebaseId.startsWith('local_'))) {
                     // Current user syncing their own profile, and it doesn't have a real firebaseId yet.
                     // AuthContext should handle the primary creation, but syncItem can set/update data if it's pending.
                    shouldSyncUser = true;
                }


                if (shouldSyncUser) {
                    console.log(`[SyncContext startSync] Attempting to sync user: ${userLocalId}, Firebase ID: ${pendingUser.firebaseId || '(none)'}`);
                    const success = await syncItem<LocalUser, FirestoreUser>(
                        pendingUser,
                        STORE_USERS,
                        // For users, addFn is setUserData, as the ID (Firebase UID) is known or becomes known.
                        (data, id) => setUserData(id || currentAuthUserId, data as Partial<FirestoreUser>).then(() => id || currentAuthUserId),
                        (id, data) => setUserData(id, data as Partial<FirestoreUser>),
                        async (id) => { console.warn(`[SyncContext] Deletion of user ${id} via sync is not standard.`); }
                    );
                    if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
                } else {
                    console.warn(`[SyncContext] Skipping sync for user ${userLocalId} - conditions not met for sync by SyncContext (e.g., local-only user not currently authenticated, or an admin trying to sync another local-only user). This user should log in online for their record to be created/linked in Firestore by AuthContext.`);
                    skippedCount++;
                }
            }


            for (const vehicle of pendingData.vehicles) {
                const success = await syncItem<LocalVehicle, FirestoreVehicle>(vehicle, STORE_VEHICLES, addVehicle, updateVehicle, deleteFirestoreVehicle);
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }

            const getParentFirebaseId = async (localParentId: string | undefined, parentStoreName: string): Promise<string | null> => {
                 if (!localParentId) return null;
                 try {
                    const store = await getLocalDbStore(parentStoreName, 'readonly');
                    const request = store.get(localParentId);
                    return new Promise<string | null>((resolve) => {
                        request.onsuccess = () => {
                            const parent = request.result;
                            resolve(parent && parent.syncStatus === 'synced' && parent.firebaseId && !parent.firebaseId.startsWith('local_') ? parent.firebaseId : null);
                        };
                        request.onerror = () => {
                            console.error(`Error fetching parent ${localParentId} from ${parentStoreName}:`, request.error);
                            resolve(null);
                        };
                    });
                 } catch (error) {
                    console.error(`Error opening store ${parentStoreName} to get parent ${localParentId}:`, error);
                    return null;
                 }
            };

            for (const trip of pendingData.trips) {
                let vehicleFirebaseId = trip.vehicleId;
                if (trip.vehicleId && (trip.vehicleId as string).startsWith('local_')) {
                    const fetchedVehicleFirebaseId = await getParentFirebaseId(trip.vehicleId, STORE_VEHICLES);
                    if (!fetchedVehicleFirebaseId) {
                        console.warn(`[SyncContext] Skipping trip ${trip.localId}, parent vehicle ${trip.vehicleId} not synced or missing Firebase ID.`);
                        skippedCount++; continue;
                    }
                    vehicleFirebaseId = fetchedVehicleFirebaseId;
                }
                const tripDataForSync = { ...trip, vehicleId: vehicleFirebaseId };
                const success = await syncItem<LocalTrip, FirestoreTrip>(tripDataForSync, STORE_TRIPS, data => addTrip(data as Omit<FirestoreTrip, 'id'>), updateTrip, deleteTripAndRelatedData);
                if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
            }


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
                    deleteFirestoreExpense,
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
                let vehicleFirebaseId = fueling.vehicleId; 

                if (vehicleFirebaseId && vehicleFirebaseId.startsWith('local_')) {
                     const fetchedVehicleFirebaseId = await getParentFirebaseId(vehicleFirebaseId, STORE_VEHICLES);
                     if (!fetchedVehicleFirebaseId) {
                         console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, its vehicle ${vehicleFirebaseId} is not synced or missing Firebase ID.`);
                         skippedCount++; continue;
                     }
                     vehicleFirebaseId = fetchedVehicleFirebaseId;
                } else if (!vehicleFirebaseId && fueling.tripLocalId) { 
                    const parentTripDoc = await getLocalDbStore(STORE_TRIPS, 'readonly').then(s => s.get(fueling.tripLocalId!)).then(req => new Promise<LocalTrip|null>(res => { req.onsuccess = () => res(req.result); req.onerror = () => res(null); }));
                    if(parentTripDoc && parentTripDoc.vehicleId) {
                        if (parentTripDoc.vehicleId.startsWith('local_')) {
                             const fetchedVehicleFirebaseIdFromTrip = await getParentFirebaseId(parentTripDoc.vehicleId, STORE_VEHICLES);
                             if (!fetchedVehicleFirebaseIdFromTrip) {
                                console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, its trip's vehicle ${parentTripDoc.vehicleId} is not synced or missing Firebase ID.`);
                                skippedCount++; continue;
                            }
                            vehicleFirebaseId = fetchedVehicleFirebaseIdFromTrip;
                        } else {
                            vehicleFirebaseId = parentTripDoc.vehicleId; // Already a firebaseId
                        }
                    }
                }
                
                if (!parentTripFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, parent trip ${fueling.tripLocalId} not synced.`); continue; }
                if (!vehicleFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, could not determine a valid vehicleFirebaseId.`); continue; }


                const success = await syncItem<LocalFueling, FirestoreFueling>(
                    {...fueling, tripId: parentTripFirebaseId, vehicleId: vehicleFirebaseId },
                    STORE_FUELINGS,
                    data => addFueling(data as Omit<FirestoreFueling, 'id'>),
                    updateFueling,
                    deleteFirestoreFueling,
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
            toast({ title: `Sincronização ${finalSyncStatus === 'success' ? 'Concluída' : 'Parcial'}`, description: `${syncedCount} de ${totalPending - skippedCount} itens processados. Falhas: ${errorCount}. Ignorados: ${skippedCount}.` });
        } catch (error: any) {
            console.error(`[SyncContext startSync ${syncStartTime}] Overall Sync Error:`, error);
            toast({ variant: 'destructive', title: "Erro na Sincronização", description: `Erro: ${error.message}` });
            setSyncStatus('error');
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

    