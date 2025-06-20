
// src/src/contexts/SyncContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth, User as AuthContextUserType } from './AuthContext';
import { auth as firebaseAuthService } from '@/lib/firebase';
import { Timestamp } from 'firebase/firestore';
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
    CustomType as LocalCustomType,
    STORE_TRIPS,
    STORE_VISITS,
    STORE_EXPENSES,
    STORE_FUELINGS,
    STORE_VEHICLES,
    STORE_USERS,
    STORE_VISIT_TYPES,
    STORE_EXPENSE_TYPES,
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
    addVisitTypeToFirestore,
    deleteVisitTypeFromFirestore,
    addExpenseTypeToFirestore,
    deleteExpenseTypeFromFirestore,
    getVehicles as fetchOnlineVehicles,
    getTrips as fetchOnlineTrips,
    Trip as FirestoreTrip,
    Visit as FirestoreVisit,
    Expense as FirestoreExpense,
    Fueling as FirestoreFueling,
    VehicleInfo as FirestoreVehicle,
    User as FirestoreUser,
    FirestoreCustomType,
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
    const [initialSyncAttempted, setInitialSyncAttempted] = useState(false);

    const updatePendingCount = useCallback(async () => {
        try {
            const pending = await getPendingRecords();
            const count = pending.trips.length + pending.visits.length + pending.expenses.length +
                          pending.fuelings.length + pending.vehicles.length + pending.users.length +
                          pending.visitTypes.length + pending.expenseTypes.length;
            setPendingCount(count);
        } catch (error) {
            console.error("[SyncContext updatePendingCount] Error updating pending count:", error);
            setPendingCount(0);
        }
    }, []);

    const syncItem = useCallback(async <
        L extends { localId?: string; id?: string; firebaseId?: string; syncStatus: 'pending' | 'error' | 'synced'; deleted?: boolean; userId?: string; name?: string; [key: string]: any },
        F extends { id: string; userId?: string; name?: string; [key: string]: any }
    >(
        item: L,
        storeName: string,
        addFn: (data: Omit<F, 'id'> | Partial<FirestoreUser> | { name: string }, id?: string) => Promise<string>,
        updateFn: (id: string, data: Partial<Omit<F, 'id'> | Partial<FirestoreUser> | { name: string }>) => Promise<void>,
        deleteFn: (id: string) => Promise<void>,
        uploadFn?: (fileOrDataUrl: File | string, folder: string) => Promise<{ url: string; path: string }>,
        deleteStorageFn?: (path: string) => Promise<void>,
        attachmentKey?: keyof L,
        urlKey?: keyof L,
        pathKey?: keyof L
    ): Promise<boolean> => {

        const itemLocalIdForDb = (storeName === STORE_USERS || storeName === STORE_VISIT_TYPES || storeName === STORE_EXPENSE_TYPES) ? item.id || item.localId : item.localId;
        const logPrefix = `[SyncContext syncItem - ${storeName} ${itemLocalIdForDb || 'NO_LOCAL_ID_FOR_LOG'}]`;

        if (!itemLocalIdForDb) {
            console.error(`${logPrefix} Item is missing its primary local key. Skipping sync. Item:`, item);
            toast({ variant: 'destructive', title: `Erro de Dados Locais (${storeName})`, description: `Item sem ID local. Sincronização pulada.`, duration: 7000 });
            return false;
        }

        const { localId, id: itemIdFromItem, firebaseId: currentFirebaseIdFromItem, deleted, syncStatus: itemSyncStatus, ...dataToSyncBase } = item;
        let currentAuthUserId = firebaseUser?.uid || user?.firebaseId; 

        console.log(`${logPrefix} User state for this operation: AuthContext user.firebaseId: ${user?.firebaseId}, AuthContext firebaseUser.uid: ${firebaseUser?.uid}. Effective currentAuthUserId: ${currentAuthUserId}`);

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
                await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'synced');
                return true;
            } catch (error: any) {
                console.error(`${logPrefix} Error deleting Firestore document ${currentFirebaseIdFromItem}:`, error);
                toast({ variant: 'destructive', title: `Erro ao Excluir ${storeName} Online`, description: `ID: ${itemLocalIdForDb}. Erro: ${error.message}`, duration: 7000 });
                await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'error');
                return false;
            }
        }

        if (!currentAuthUserId && storeName !== STORE_VISIT_TYPES && storeName !== STORE_EXPENSE_TYPES) {
             console.warn(`${logPrefix} No authenticated Firebase user ID found for an add/update operation on user-specific data. Skipping Firestore operation for item:`, itemLocalIdForDb);
             toast({ variant: 'destructive', title: `Erro de Autenticação na Sincronização`, description: `Não foi possível sincronizar ${storeName} ID: ${itemLocalIdForDb} por falta de usuário autenticado no Firebase.`, duration: 7000 });
             return false;
        }

        let effectiveFirebaseIdForOperation = currentFirebaseIdFromItem;
        if (effectiveFirebaseIdForOperation && (effectiveFirebaseIdForOperation.startsWith('local_') || effectiveFirebaseIdForOperation.startsWith('temp_'))) {
            console.warn(`${logPrefix} Item ${itemLocalIdForDb} has firebaseId ('${effectiveFirebaseIdForOperation}') that looks like a local ID. Treating as unsynced and forcing an add operation.`);
            effectiveFirebaseIdForOperation = undefined;
        }

        let storageUrl: string | undefined = urlKey ? item[urlKey] as string : undefined;
        let storagePath: string | undefined = pathKey ? item[pathKey] as string : undefined;
        const localAttachment = attachmentKey ? item[attachmentKey] : null;
        let oldStoragePathToDelete: string | undefined = undefined;
        let needsStorageUpdate = false;

        const fieldsToExcludeFromFirestore: (keyof L)[] = ['localId', 'syncStatus', 'deleted', 'firebaseId', 'id'];
        if (attachmentKey) fieldsToExcludeFromFirestore.push(attachmentKey);

        const dataToSyncFirestore = (storeName === STORE_VISIT_TYPES || storeName === STORE_EXPENSE_TYPES)
            ? { name: item.name }
            : { ...dataToSyncBase };

        if (storeName !== STORE_VISIT_TYPES && storeName !== STORE_EXPENSE_TYPES) {
             fieldsToExcludeFromFirestore.forEach(key => delete (dataToSyncFirestore as any)[key]);
        }

        if (storeName !== STORE_USERS && storeName !== STORE_VISIT_TYPES && storeName !== STORE_EXPENSE_TYPES && currentAuthUserId) {
            if (!(dataToSyncFirestore as any).userId || ((dataToSyncFirestore as any).userId && typeof (dataToSyncFirestore as any).userId === 'string' && (dataToSyncFirestore as any).userId.startsWith('local_'))) {
                 console.log(`${logPrefix} Setting/overriding userId in payload to current authenticated Firebase UID: ${currentAuthUserId}. Original item.userId was: ${item.userId}`);
                (dataToSyncFirestore as any).userId = currentAuthUserId;
            }
        }

        if ((storeName === STORE_VISITS || storeName === STORE_EXPENSES || storeName === STORE_FUELINGS) && (dataToSyncFirestore as any).tripLocalId) {
            const parentTripStore = await getLocalDbStore(STORE_TRIPS, 'readonly');
            const parentTripReq = parentTripStore.get((dataToSyncFirestore as any).tripLocalId!);
            const parentTrip = await new Promise<LocalTrip|null>(res => { parentTripReq.onsuccess = () => res(parentTripReq.result); parentTripReq.onerror = () => res(null); });

            if (parentTrip && parentTrip.firebaseId && !parentTrip.firebaseId.startsWith('local_')) {
                (dataToSyncFirestore as any).tripId = parentTrip.firebaseId;
            } else {
                console.warn(`${logPrefix} Parent trip ${(dataToSyncFirestore as any).tripLocalId} for item ${itemLocalIdForDb} not synced or missing valid Firebase ID. Sync for this item may fail or be delayed.`);
                await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'error', { errorDetails: 'Parent trip not synced' });
                return false;
            }
            delete (dataToSyncFirestore as any).tripLocalId;
        }

        if ((storeName === STORE_TRIPS || storeName === STORE_FUELINGS) && (dataToSyncFirestore as any).vehicleId) {
            const vehicleIdValue = (dataToSyncFirestore as any).vehicleId;
            if (typeof vehicleIdValue === 'string' && vehicleIdValue.startsWith('local_')) {
                const parentVehicleStore = await getLocalDbStore(STORE_VEHICLES, 'readonly');
                const parentVehicleReq = parentVehicleStore.get(vehicleIdValue!);
                const parentVehicle = await new Promise<LocalVehicle|null>(res => { parentVehicleReq.onsuccess = () => res(parentVehicleReq.result); parentVehicleReq.onerror = () => res(null); });

                if (parentVehicle && parentVehicle.firebaseId && !parentVehicle.firebaseId.startsWith('local_')) {
                    (dataToSyncFirestore as any).vehicleId = parentVehicle.firebaseId;
                } else {
                     console.warn(`${logPrefix} Parent vehicle ${vehicleIdValue} for item ${itemLocalIdForDb} not synced or missing valid Firebase ID. Sync for this item may fail or be delayed.`);
                     await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'error', { errorDetails: 'Parent vehicle not synced' });
                     return false;
                }
            }
        }
        console.log(`${logPrefix} Authenticated user for this operation (from syncItem scope): ${currentAuthUserId}`);
        console.log(`${logPrefix} Data prepared for Firestore. Firebase ID: ${effectiveFirebaseIdForOperation || '(new)'}. Payload:`, JSON.parse(JSON.stringify(dataToSyncFirestore)));


        let finalFirebaseIdAfterOperation = effectiveFirebaseIdForOperation;

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
            } else if (urlKey && item[urlKey] && pathKey && item[pathKey] && !localAttachment && deleteStorageFn) {
                needsStorageUpdate = true;
                oldStoragePathToDelete = item[pathKey] as string;
                storageUrl = undefined; storagePath = undefined;
                console.log(`${logPrefix} Attachment removed locally. Marking ${oldStoragePathToDelete} for deletion from storage.`);
            }

            if (needsStorageUpdate) {
                if (urlKey) (dataToSyncFirestore as any)[urlKey] = storageUrl;
                if (pathKey) (dataToSyncFirestore as any)[pathKey] = storagePath;
            }

            if (finalFirebaseIdAfterOperation) {
                console.log(`${logPrefix} Updating Firestore document. Firebase ID: ${finalFirebaseIdAfterOperation}.`);
                await updateFn(finalFirebaseIdAfterOperation, dataToSyncFirestore as Partial<Omit<F, 'id'>>);
                console.log(`${logPrefix} Firestore document updated for ${finalFirebaseIdAfterOperation}.`);
            } else {
                console.log(`${logPrefix} Adding new document to Firestore.`);
                if (storeName === STORE_USERS && item.id && item.id === currentAuthUserId) {
                    finalFirebaseIdAfterOperation = currentAuthUserId;
                    console.log(`${logPrefix} User document to be created/set with known Firebase ID (Auth UID): ${finalFirebaseIdAfterOperation}.`);
                    await addFn(dataToSyncFirestore as Partial<FirestoreUser>, finalFirebaseIdAfterOperation);
                } else {
                     finalFirebaseIdAfterOperation = await addFn(dataToSyncFirestore as Omit<F, 'id'> | { name: string });
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
            console.error(`${logPrefix} Error processing item ${itemLocalIdForDb} with Firestore. Error: ${error.code} - ${error.message}. Payload sent:`, JSON.parse(JSON.stringify(dataToSyncFirestore)), `Auth User ID: ${currentAuthUserId}`);
            toast({ variant: 'destructive', title: `Erro Sinc ${storeName}`, description: `ID: ${itemLocalIdForDb}. Erro: ${error.message}`, duration: 7000 });
            if (needsStorageUpdate && storagePath && storagePath !== oldStoragePathToDelete && uploadFn && deleteStorageFn) {
                console.warn(`${logPrefix} Rolling back storage upload for ${storagePath} due to error.`);
                await deleteStorageFn(storagePath).catch(rbError => console.error(`${logPrefix} Error rolling back storage upload:`, rbError));
            }
            await updateSyncStatus(storeName, itemLocalIdForDb, currentFirebaseIdFromItem, 'error');
            return false;
        }
    }, [user, firebaseUser, toast]); // syncItem dependencies


    const startSyncInternal = useCallback(async () => {
        const syncStartTime = performance.now();
        const logPrefix = `[SyncContext startSyncInternal ${syncStartTime}]`;
        console.log(`${logPrefix} Initiating sync...`);

        if (firebaseAuthService) {
            console.log(`${logPrefix} Firebase SDK auth.currentUser:`, firebaseAuthService.currentUser ? { uid: firebaseAuthService.currentUser.uid, email: firebaseAuthService.currentUser.email } : null);
        } else {
            console.log(`${logPrefix} Firebase SDK auth service (imported from firebase.ts) not available.`);
        }
        console.log(`${logPrefix} AuthContext user state in SyncContext:`, JSON.parse(JSON.stringify(user || {})));
        console.log(`${logPrefix} AuthContext firebaseUser state in SyncContext:`, JSON.parse(JSON.stringify(firebaseUser || {})));


        if (syncStatus === 'syncing') {
            toast({ title: "Sincronização já em andamento." }); return;
        }
        if (typeof window !== 'undefined' && !navigator.onLine) {
            toast({ variant: 'destructive', title: "Offline", description: "Conecte-se à internet para sincronizar." }); return;
        }

        let currentAuthUserId = firebaseUser?.uid || user?.firebaseId;
        const isAdmin = user?.role === 'admin';
        console.log(`${logPrefix} Effective Firebase User ID for sync: ${currentAuthUserId}, IsAdmin: ${isAdmin}`);


        if (firebaseAuthService && firebaseAuthService.currentUser) {
            try {
                await firebaseAuthService.currentUser.getIdToken(true);
                console.log(`${logPrefix} Firebase ID token refreshed successfully for user: ${firebaseAuthService.currentUser.uid}`);
                currentAuthUserId = firebaseAuthService.currentUser.uid;
            } catch (tokenError: any) {
                console.error(`${logPrefix} Error refreshing Firebase ID token or user session is invalid:`, tokenError);
                toast({ variant: 'destructive', title: "Sessão Inválida", description: "Sua sessão de login pode ter expirado. Por favor, faça login novamente para sincronizar.", duration: 7000 });
                setSyncStatus('error');
                return;
            }
        } else if (!currentAuthUserId && !(isAdmin && (await getPendingRecords().catch(() => ({visitTypes:[], expenseTypes:[]}))).visitTypes.length > 0 || (await getPendingRecords().catch(() => ({visitTypes:[], expenseTypes:[]}))).expenseTypes.length > 0)) {
            console.warn(`${logPrefix} Cannot start sync: No authenticated Firebase user ID, and not an admin syncing only global types.`);
            toast({ variant: 'destructive', title: "Erro de Autenticação", description: "Usuário Firebase não autenticado. Faça login online para sincronizar seus dados." });
            setSyncStatus('idle');
            return;
        }

        setSyncStatus('syncing');
        toast({ title: "Iniciando sincronização..." });
        let overallSuccess = true; let syncedCount = 0; let errorCount = 0; let skippedCount = 0;
        let pendingData;

        try {
            pendingData = await getPendingRecords();
            const totalPending = Object.values(pendingData).reduce((sum, arr) => sum + arr.length, 0);

            if (totalPending === 0 && !isAdmin) { 
                 console.log(`${logPrefix} No pending records for non-admin. Skipping push phase.`);
            } else {
                 console.log(`${logPrefix} Total items to sync (push phase): ${totalPending}. Pending data:`, pendingData);
                for (const pendingUser of pendingData.users) {
                     const userLocalId = pendingUser.id;
                     if (!userLocalId) { console.warn(`[SyncContext] Skipping user sync: item missing 'id'.`, pendingUser); skippedCount++; continue; }

                     if (pendingUser.firebaseId && !pendingUser.firebaseId.startsWith('local_')) {
                        console.log(`[SyncContext startSyncInternal] Syncing USER (linked): ${userLocalId}, Firebase ID: ${pendingUser.firebaseId}`);
                        const success = await syncItem<LocalUser, FirestoreUser>(
                            pendingUser, STORE_USERS,
                            (data, id) => setUserData(id || currentAuthUserId!, data as Partial<FirestoreUser>).then(() => id || currentAuthUserId!),
                            (id, data) => setUserData(id, data as Partial<FirestoreUser>),
                            async (id) => { console.warn(`[SyncContext] Deletion of user ${id} via sync is not standard.`); }
                        );
                        if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
                     } else if (!pendingUser.firebaseId && userLocalId === currentAuthUserId) {
                        console.log(`[SyncContext startSyncInternal] Syncing CURRENT USER (not fully linked locally): ${userLocalId}`);
                         const success = await syncItem<LocalUser, FirestoreUser>(
                            {...pendingUser, firebaseId: currentAuthUserId },
                            STORE_USERS,
                            (data, id) => setUserData(id || currentAuthUserId!, data as Partial<FirestoreUser>).then(() => id || currentAuthUserId!),
                            (id, data) => setUserData(id, data as Partial<FirestoreUser>),
                            async (id) => { console.warn(`[SyncContext] Deletion of user ${id} via sync is not standard.`); }
                        );
                        if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
                     } else {
                        console.warn(`[SyncContext] Skipping sync for user ${userLocalId}. Not linked to Firebase or not current user. FirebaseId: ${pendingUser.firebaseId}. CurrentAuthId: ${currentAuthUserId}`);
                        skippedCount++;
                     }
                }

                for (const vType of pendingData.visitTypes) {
                    const success = await syncItem<LocalCustomType, FirestoreCustomType>(
                        vType, STORE_VISIT_TYPES,
                        (data) => addVisitTypeToFirestore(data.name!),
                        async (id, data) => { console.warn(`[SyncContext] Update for CustomType ${id} not implemented, treating as add/delete.`); return Promise.resolve(); },
                        deleteVisitTypeFromFirestore
                    );
                    if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
                }

                for (const eType of pendingData.expenseTypes) {
                    const success = await syncItem<LocalCustomType, FirestoreCustomType>(
                        eType, STORE_EXPENSE_TYPES,
                        (data) => addExpenseTypeToFirestore(data.name!),
                        async (id, data) => { console.warn(`[SyncContext] Update for CustomType ${id} not implemented.`); return Promise.resolve(); },
                        deleteExpenseTypeFromFirestore
                    );
                    if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
                }

                if (currentAuthUserId) {
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
                        const success = await syncItem<LocalTrip, FirestoreTrip>(tripDataForSync, STORE_TRIPS, data => addTrip(data as Omit<FirestoreTrip, 'id' | 'createdAt' | 'updatedAt'>), updateTrip, deleteTripAndRelatedData);
                        if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
                    }

                    for (const visit of pendingData.visits) {
                        const parentTripFirebaseId = await getParentFirebaseId(visit.tripLocalId, STORE_TRIPS);
                        if (!parentTripFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping visit ${visit.localId}, parent trip ${visit.tripLocalId} not synced.`); continue; }
                        const success = await syncItem<LocalVisit, FirestoreVisit>({...visit, tripId: parentTripFirebaseId}, STORE_VISITS, data => addVisit(data as Omit<FirestoreVisit, 'id' | 'createdAt' | 'updatedAt'>), updateVisit, deleteVisit);
                        if (success) syncedCount++; else errorCount++; overallSuccess = overallSuccess && success;
                    }
                    for (const expense of pendingData.expenses) {
                        const parentTripFirebaseId = await getParentFirebaseId(expense.tripLocalId, STORE_TRIPS);
                        if (!parentTripFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping expense ${expense.localId}, parent trip ${expense.tripLocalId} not synced.`); continue; }
                        const success = await syncItem<LocalExpense, FirestoreExpense>(
                            {...expense, tripId: parentTripFirebaseId},
                            STORE_EXPENSES,
                            data => addExpense(data as Omit<FirestoreExpense, 'id' | 'createdAt' | 'updatedAt'>),
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
                            const parentTripStore = await getLocalDbStore(STORE_TRIPS, 'readonly');
                            const parentTripReq = parentTripStore.get(fueling.tripLocalId!);
                            const parentTripDoc = await new Promise<LocalTrip|null>(res => { parentTripReq.onsuccess = () => res(parentTripReq.result); parentTripReq.onerror = () => res(null); });
                            if(parentTripDoc && parentTripDoc.vehicleId) {
                                if (parentTripDoc.vehicleId.startsWith('local_')) {
                                     const fetchedVehicleFirebaseIdFromTrip = await getParentFirebaseId(parentTripDoc.vehicleId, STORE_VEHICLES);
                                     if (!fetchedVehicleFirebaseIdFromTrip) {
                                        console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, its trip's vehicle ${parentTripDoc.vehicleId} is not synced or missing Firebase ID.`);
                                        skippedCount++; continue;
                                    }
                                    vehicleFirebaseId = fetchedVehicleFirebaseIdFromTrip;
                                } else {
                                    vehicleFirebaseId = parentTripDoc.vehicleId;
                                }
                            }
                        }

                        if (!parentTripFirebaseId && fueling.tripLocalId) {
                            skippedCount++; console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, parent trip ${fueling.tripLocalId} not synced.`); continue;
                        }
                        if (!vehicleFirebaseId) { skippedCount++; console.warn(`[SyncContext] Skipping fueling ${fueling.localId}, could not determine a valid vehicleFirebaseId.`); continue; }

                        const success = await syncItem<LocalFueling, FirestoreFueling>(
                            {...fueling, tripId: parentTripFirebaseId, vehicleId: vehicleFirebaseId },
                            STORE_FUELINGS,
                            data => addFueling(data as Omit<FirestoreFueling, 'id' | 'createdAt' | 'updatedAt'>),
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
                } else if (pendingData.vehicles.length > 0 || pendingData.trips.length > 0 || pendingData.visits.length > 0 || pendingData.expenses.length > 0 || pendingData.fuelings.length > 0) {
                    const userSpecificPendingCount = pendingData.vehicles.length + pendingData.trips.length + pendingData.visits.length + pendingData.expenses.length + pendingData.fuelings.length + pendingData.users.filter(u => u.id !== currentAuthUserId).length;
                    if(userSpecificPendingCount > 0) {
                        console.warn(`${logPrefix} User-specific data pending but no authenticated Firebase user. ${userSpecificPendingCount} items will remain pending.`);
                        skippedCount += userSpecificPendingCount;
                    }
                }
            } 

            let pulledVehicleCount = 0;
            let pulledTripCount = 0;

            if (isAdmin) { 
                console.log(`${logPrefix} PULL Phase: Admin fetching ALL vehicles from Firestore...`);
                const onlineVehicles = await fetchOnlineVehicles();
                console.log(`${logPrefix} PULL Phase: Pulled ${onlineVehicles.length} vehicles from Firestore.`);
                for (const onlineVehicle of onlineVehicles) {
                    if (!onlineVehicle.id) { console.warn(`${logPrefix} PULL: Skipping online vehicle due to missing ID:`, onlineVehicle); continue; }
                    const existingLocalVehicle = await getLocalDbStore(STORE_VEHICLES, 'readonly').then(store => new Promise<LocalVehicle | null>(res => {const r = store.get(onlineVehicle.id); r.onsuccess=()=>res(r.result); r.onerror=()=>res(null);}));
                    const vehicleToSaveLocally: LocalVehicle = {
                        localId: onlineVehicle.id, 
                        firebaseId: onlineVehicle.id,
                        model: onlineVehicle.model,
                        year: onlineVehicle.year,
                        licensePlate: onlineVehicle.licensePlate,
                        syncStatus: 'synced',
                        deleted: onlineVehicle.deleted || false,
                    };
                    if (!existingLocalVehicle || (existingLocalVehicle && existingLocalVehicle.syncStatus !== 'pending')) {
                        await updateLocalRecord(STORE_VEHICLES, vehicleToSaveLocally);
                        pulledVehicleCount++;
                    }
                }
                console.log(`${logPrefix} PULL Phase: Processed ${pulledVehicleCount} vehicles from Firestore into local DB.`);
            }

            if (currentAuthUserId) { 
                console.log(`${logPrefix} PULL Phase: Fetching trips from Firestore for user ${currentAuthUserId} (isAdmin: ${isAdmin})...`);
                const tripFilters = isAdmin && user?.base ? { base: user.base } : { userId: currentAuthUserId };
                const onlineTrips = await fetchOnlineTrips(tripFilters);
                console.log(`${logPrefix} PULL Phase: Pulled ${onlineTrips.length} trips from Firestore.`);

                for (const onlineTrip of onlineTrips) {
                    if (!onlineTrip.id) { console.warn(`${logPrefix} PULL: Skipping online trip due to missing ID:`, onlineTrip); continue; }
                    const existingLocalTrip = await getLocalDbStore(STORE_TRIPS, 'readonly').then(store => new Promise<LocalTrip | null>(res => {const r = store.get(onlineTrip.id); r.onsuccess=()=>res(r.result); r.onerror=()=>res(null);}));
                    const tripToSaveLocally: LocalTrip = {
                        localId: onlineTrip.id, 
                        firebaseId: onlineTrip.id,
                        name: onlineTrip.name,
                        vehicleId: onlineTrip.vehicleId,
                        userId: onlineTrip.userId,
                        status: onlineTrip.status,
                        createdAt: onlineTrip.createdAt instanceof Timestamp ? onlineTrip.createdAt.toDate().toISOString() : new Date().toISOString(),
                        updatedAt: onlineTrip.updatedAt instanceof Timestamp ? onlineTrip.updatedAt.toDate().toISOString() : new Date().toISOString(),
                        base: onlineTrip.base,
                        finalKm: onlineTrip.finalKm,
                        totalDistance: onlineTrip.totalDistance,
                        syncStatus: 'synced',
                        deleted: false, 
                    };

                    if (!existingLocalTrip || (existingLocalTrip && existingLocalTrip.syncStatus !== 'pending' && new Date(tripToSaveLocally.updatedAt) > new Date(existingLocalTrip.updatedAt))) {
                        await updateLocalRecord(STORE_TRIPS, tripToSaveLocally);
                        pulledTripCount++;
                    }
                }
                console.log(`${logPrefix} PULL Phase: Processed ${pulledTripCount} trips from Firestore into local DB.`);
            }
            
            await cleanupDeletedRecords();
            const finalSyncStatus = overallSuccess ? 'success' : 'error';
            setSyncStatus(finalSyncStatus); setLastSyncTime(new Date()); updatePendingCount();
            toast({ title: `Sincronização ${finalSyncStatus === 'success' ? 'Concluída' : 'Parcial'}`, description: `${syncedCount} de ${totalPending - skippedCount} itens enviados. ${pulledVehicleCount + pulledTripCount} itens recebidos. Falhas: ${errorCount}. Ignorados: ${skippedCount}.` });
        } catch (error: any) {
            console.error(`${logPrefix} Overall Sync Error:`, error);
            toast({ variant: 'destructive', title: "Erro na Sincronização", description: `Erro: ${error.message}` });
            setSyncStatus('error');
        }
    }, [syncStatus, toast, user, firebaseUser, updatePendingCount, syncItem]); // startSyncInternal dependencies

    const startSyncCallbackRef = useRef(startSyncInternal);

    useEffect(() => {
        startSyncCallbackRef.current = startSyncInternal;
    }, [startSyncInternal]);

    useEffect(() => {
        const performInitialSync = async () => {
            if (typeof window !== 'undefined' && firebaseUser && navigator.onLine && !initialSyncAttempted) {
                console.log("[SyncContext performInitialSync] Firebase user detected, online, and initial sync not attempted. Starting initial sync...");
                setInitialSyncAttempted(true);
                if (startSyncCallbackRef.current) {
                    await startSyncCallbackRef.current();
                } else {
                    console.warn("[SyncContext performInitialSync] startSyncCallbackRef.current is not yet defined. Sync will be skipped or retried on next effect run.");
                }
            } else {
                if (typeof window !== 'undefined') {
                    if (!firebaseUser) console.log("[SyncContext performInitialSync] No firebaseUser for initial sync.");
                    if (!navigator.onLine) console.log("[SyncContext performInitialSync] Offline, skipping initial sync.");
                    if (initialSyncAttempted) console.log("[SyncContext performInitialSync] Initial sync already attempted this session.");
                }
            }
        };
        
        if (typeof window !== 'undefined' && firebaseUser && !initialSyncAttempted) {
           performInitialSync();
        }

    }, [firebaseUser, initialSyncAttempted]);


    useEffect(() => {
        if (typeof window !== 'undefined') {
            updatePendingCount();
            const intervalId = setInterval(updatePendingCount, 30000);
            return () => clearInterval(intervalId);
        }
    }, [updatePendingCount]);


    return (
        <SyncContext.Provider value={{ syncStatus, lastSyncTime, pendingCount, startSync: startSyncCallbackRef.current }}>
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

    