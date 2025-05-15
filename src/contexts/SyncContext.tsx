
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
    deleteExpense as deleteFirestoreExpense, // Renamed to avoid conflict
    addFueling,
    updateFueling,
    deleteFueling as deleteFirestoreFueling, // Renamed to avoid conflict
    addVehicle,
    updateVehicle,
    deleteVehicle as deleteFirestoreVehicle, // Renamed to avoid conflict
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
    const { user, firebaseUser } = useAuth(); // Get firebaseUser from AuthContext

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
        addFn: (data: Omit<F, 'id'> | Partial<FirestoreUser>, id?: string) => Promise<string>,
        updateFn: (id: string, data: Partial<Omit<F, 'id'> | Partial<FirestoreUser>>) => Promise<void>,
        deleteFn: (id: string) => Promise<void>,
        uploadFn?: (fileOrDataUrl: File | string, folder: string) => Promise<{ url: string; path: string }>,
        deleteStorageFn?: (path: string) => Promise<void>,
        attachmentKey?: keyof L, // e.g., 'receiptUrl' (might store data URL or File)
        urlKey?: keyof L,      // e.g., 'receiptUrl' (for storing final URL)
        pathKey?: keyof L      // e.g., 'receiptPath'
    ): Promise<boolean> => {

        const itemLocalIdForDb = storeName === STORE_USERS ? item.id : item.localId;
        const logPrefix = `[SyncContext syncItem - ${storeName} ${itemLocalIdForDb || 'NO_LOCAL_ID'}]`;
        
        if (!itemLocalIdForDb) {
            console.error(`${logPrefix} Item is missing its primary local key (id for users, localId for others). Skipping sync. Item:`, item);
            toast({ variant: 'destructive', title: `Erro de Dados Locais (${storeName})`, description: `Item sem ID local. Sincronização pulada.`, duration: 7000 });
            return false;
        }


        const { localId, id: itemId, firebaseId: currentFirebaseId, deleted, syncStatus: itemSyncStatus, ...dataToSyncBase } = item;
        // Note: 'localId' above will be from item.localId, 'itemId' will be from item.id.
        // We'll use itemLocalIdForDb for local DB operations.

        const currentAuthUserId = firebaseUser?.uid || user?.firebaseId;
        console.log(`${logPrefix} User state for Firestore op: AuthContext User (from useAuth):`, user, `Effective Auth User ID for this sync: ${currentAuthUserId}`);
        console.log(`${logPrefix} AuthContext firebaseUser state in SyncContext:`, firebaseUser);


        if (deleted) {
            try {
                if (currentFirebaseId) {
                    console.log(`${logPrefix} Deleting from Firestore. Firebase ID: ${currentFirebaseId}`);
                    await deleteFn(currentFirebaseId);
                    if (pathKey && item[pathKey] && deleteStorageFn) {
                        console.log(`${logPrefix} Deleting attachment from storage: ${item[pathKey]}`);
                        await deleteStorageFn(item[pathKey] as string);
                    }
                    console.log(`${logPrefix} Firestore deletion successful for ${currentFirebaseId}.`);
                } else {
                    console.log(`${logPrefix} Item was marked for deletion locally but had no Firebase ID. No Firestore deletion needed.`);
                }
                await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseId, 'synced');
                return true;
            } catch (error: any) {
                console.error(`${logPrefix} Error deleting Firestore document ${currentFirebaseId}:`, error);
                toast({ variant: 'destructive', title: `Erro ao Excluir ${storeName} Online`, description: `ID: ${itemLocalIdForDb}. Erro: ${error.message}`, duration: 7000 });
                await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseId, 'error');
                return false;
            }
        }

        if (!currentAuthUserId) {
             console.error(`${logPrefix} No authenticated Firebase user UID found for an add/update operation. Skipping Firestore operation.`);
             toast({ variant: 'destructive', title: `Erro de Autenticação na Sincronização`, description: `Não foi possível sincronizar ${storeName} ID: ${itemLocalIdForDb} por falta de usuário autenticado no Firebase.`, duration: 7000 });
             // Do NOT mark as error, as this is an auth issue, not a data issue. Keep as pending.
             return false;
        }

        let newFirebaseId = currentFirebaseId;
        let storageUrl: string | undefined = urlKey ? item[urlKey] as string : undefined;
        let storagePath: string | undefined = pathKey ? item[pathKey] as string : undefined;
        const localAttachment = attachmentKey ? item[attachmentKey] : null;
        let oldStoragePathToDelete: string | undefined = undefined;
        let needsStorageUpdate = false;

        const fieldsToExcludeFromFirestore: (keyof L)[] = ['localId', 'syncStatus', 'deleted', 'firebaseId', 'id'];
        if (attachmentKey) fieldsToExcludeFromFirestore.push(attachmentKey);

        const dataToSync = { ...dataToSyncBase };
        fieldsToExcludeFromFirestore.forEach(key => delete (dataToSync as any)[key]);

        if (storeName !== STORE_USERS && currentAuthUserId && (!dataToSync.userId || (dataToSync.userId && (dataToSync.userId as string).startsWith('local_')))) {
            console.log(`${logPrefix} Setting/overriding userId in payload to current authenticated Firebase UID: ${currentAuthUserId}. Original item.userId was: ${item.userId}`);
            dataToSync.userId = currentAuthUserId;
        } else if (storeName !== STORE_USERS && !dataToSync.userId && item.userId) {
            dataToSync.userId = item.userId;
        }
        // Ensure tripId (for child items) and vehicleId are Firebase IDs if parents are synced
        if ((storeName === STORE_VISITS || storeName === STORE_EXPENSES || storeName === STORE_FUELINGS) && item.tripLocalId) {
            const parentTrip = await getLocalDbStore(STORE_TRIPS, 'readonly').then(s => s.get(item.tripLocalId!)).then(req => new Promise(res => { req.onsuccess = () => res(req.result); req.onerror = () => res(null); }));
            if (parentTrip && (parentTrip as LocalTrip).firebaseId) {
                (dataToSync as any).tripId = (parentTrip as LocalTrip).firebaseId;
            } else {
                console.warn(`${logPrefix} Parent trip ${item.tripLocalId} for item ${itemLocalIdForDb} not synced or missing. Sync for this item may fail or be delayed.`);
            }
        }
        if ((storeName === STORE_TRIPS || storeName === STORE_FUELINGS) && item.vehicleId && !(item.vehicleId as string).startsWith('local_') ) { // if vehicleId is already a firebaseId
             (dataToSync as any).vehicleId = item.vehicleId;
        } else if ((storeName === STORE_TRIPS || storeName === STORE_FUELINGS) && item.vehicleId) { // if vehicleId is a localId
            const parentVehicle = await getLocalDbStore(STORE_VEHICLES, 'readonly').then(s => s.get(item.vehicleId!)).then(req => new Promise(res => { req.onsuccess = () => res(req.result); req.onerror = () => res(null); }));
            if (parentVehicle && (parentVehicle as LocalVehicle).firebaseId) {
                (dataToSync as any).vehicleId = (parentVehicle as LocalVehicle).firebaseId;
            } else {
                 console.warn(`${logPrefix} Parent vehicle ${item.vehicleId} for item ${itemLocalIdForDb} not synced or missing. Sync for this item may fail or be delayed.`);
            }
        }


        console.log(`${logPrefix} Data prepared for Firestore. Firebase ID: ${newFirebaseId || '(new)'}. Payload:`, JSON.parse(JSON.stringify(dataToSync)));
        console.log(`${logPrefix} Authenticated user for this operation: ${currentAuthUserId}`);


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
                    const uploadResult = await uploadFn(localAttachment as File | string, storeName);
                    storageUrl = uploadResult.url; storagePath = uploadResult.path;
                    console.log(`${logPrefix} Upload successful. URL: ${storageUrl}, Path: ${storagePath}`);
                }
            } else if (pathKey && item[pathKey] && !localAttachment && deleteStorageFn) { // Attachment removed
                needsStorageUpdate = true;
                oldStoragePathToDelete = item[pathKey] as string;
                storageUrl = undefined; storagePath = undefined;
                console.log(`${logPrefix} Attachment removed locally. Marking ${oldStoragePathToDelete} for deletion from storage.`);
            }

            if (needsStorageUpdate) {
                if (urlKey) (dataToSync as any)[urlKey] = storageUrl;
                if (pathKey) (dataToSync as any)[pathKey] = storagePath;
            }


            if (newFirebaseId) {
                console.log(`${logPrefix} Updating Firestore document. Firebase ID: ${newFirebaseId}.`);
                await updateFn(newFirebaseId, dataToSync as Partial<Omit<F, 'id'>>);
                console.log(`${logPrefix} Firestore document updated for ${newFirebaseId}.`);
            } else {
                console.log(`${logPrefix} Adding new document to Firestore.`);
                if (storeName === STORE_USERS && item.id && !(item.id as string).startsWith('local_')) {
                    // For users being created in Firestore first time (e.g. seeded users logging in)
                    // Their item.id IS the firebaseId
                    newFirebaseId = item.id;
                    console.log(`${logPrefix} User document to be created with known Firebase ID: ${newFirebaseId}.`);
                    await addFn(dataToSync as Partial<FirestoreUser>, newFirebaseId);
                } else {
                     newFirebaseId = await addFn(dataToSync as Omit<F, 'id'>);
                }
                console.log(`${logPrefix} New document added/set in Firestore. Firebase ID: ${newFirebaseId}`);
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
            await updateSyncStatus(storeName, itemLocalIdForDb, newFirebaseId!, 'synced', localUpdates);
            return true;
        } catch (error: any) {
            console.error(`${logPrefix} Error processing item ${itemLocalIdForDb} with Firestore. Error: ${error.code} - ${error.message}. Payload sent:`, dataToSync, `Auth User ID: ${currentAuthUserId}`);
            toast({ variant: 'destructive', title: `Erro Sinc ${storeName}`, description: `ID: ${itemLocalIdForDb}. Erro: ${error.message}`, duration: 7000 });
            if (needsStorageUpdate && storagePath && storagePath !== oldStoragePathToDelete && uploadFn && deleteStorageFn) {
                console.warn(`${logPrefix} Rolling back storage upload for ${storagePath} due to error.`);
                await deleteStorageFn(storagePath).catch(rbError => console.error(`${logPrefix} Error rolling back storage upload:`, rbError));
            }
            await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseId, 'error');
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
        console.log(`[SyncContext startSync] AuthContext user state in SyncContext:`, user);
        console.log(`[SyncContext startSync] AuthContext firebaseUser state in SyncContext:`, firebaseUser);
        console.log(`[SyncContext startSync] Effective Firebase User ID for sync: ${currentAuthUserId}`);


        if (!currentAuthUserId) {
            console.warn(`[SyncContext startSync] Cannot start sync: No authenticated Firebase user ID (firebaseUser.uid or user.firebaseId).`);
            toast({ variant: 'destructive', title: "Erro de Autenticação", description: "Usuário Firebase não autenticado. Faça login online para sincronizar." });
            setSyncStatus('error'); // Set to error as sync cannot proceed
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

            // Sync Users first
            for (const pendingUser of pendingData.users) {
                const userLocalId = pendingUser.id; // For users, the key in local DB is 'id'
                if (!userLocalId) {
                     console.warn(`[SyncContext] Skipping user sync for an item missing 'id':`, pendingUser);
                     skippedCount++;
                     continue;
                }

                if (pendingUser.firebaseId || userLocalId === currentAuthUserId) { // Sync if it has a firebaseId or if it's the current user's record
                    const success = await syncItem<LocalUser, FirestoreUser>(
                        pendingUser,
                        STORE_USERS,
                        (data, id) => setUserData(id!, data as Partial<FirestoreUser>).then(() => id!),
                        (id, data) => setUserData(id, data as Partial<FirestoreUser>),
                        async (id) => { console.warn(`[SyncContext] Deletion of user ${id} via sync not implemented yet for regular users. Only for admin-deleted.`); }
                    );
                    if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
                } else if (!pendingUser.firebaseId && pendingUser.id && pendingUser.id.startsWith('local_user_')) {
                    // This is a locally created admin user, needs special handling if we allow admin to create Auth users
                    // For now, we skip direct sync for these unless they are the current user trying to sync their own new profile
                    console.warn(`[SyncContext] Skipping sync for locally created user ${userLocalId} without firebaseId. This user needs to login online first.`);
                    skippedCount++;
                } else {
                    console.warn(`[SyncContext] Skipping user ${userLocalId} - conditions not met for sync (no firebaseId or not current user).`);
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
                            resolve(parent && parent.syncStatus === 'synced' && parent.firebaseId ? parent.firebaseId : null);
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
                if (!parentTripFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, parent trip ${fueling.tripLocalId} not synced.`); continue; }

                let vehicleFirebaseId = fueling.vehicleId;
                if (fueling.vehicleId && (fueling.vehicleId as string).startsWith('local_')) {
                     const fetchedVehicleFirebaseId = await getParentFirebaseId(fueling.vehicleId, STORE_VEHICLES);
                     if (!fetchedVehicleFirebaseId) {
                         console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, its vehicle ${fueling.vehicleId} is not synced or missing Firebase ID.`);
                         skippedCount++; continue;
                     }
                     vehicleFirebaseId = fetchedVehicleFirebaseId;
                }
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

// Helper needed for getting parent trip Firebase ID - ensures DB is opened
// This helper is now incorporated into getParentFirebaseId within startSync for better error handling and clarity.
// async function getStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
//     const db = await localDbOpenDB(); // Reuse openDB logic from localDbService
//     return db.transaction(storeName, mode).objectStore(storeName);
// }
