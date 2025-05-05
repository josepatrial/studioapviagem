// src/services/localDbService.ts
import type { VehicleInfo } from '@/components/Vehicle';
import type { Trip } from '@/components/Trips/Trips';
import type { Visit } from '@/components/Trips/Visits';
import type { Expense } from '@/components/Trips/Expenses';
import type { Fueling } from '@/components/Trips/Fuelings';
import type { User } from '@/contexts/AuthContext'; // Import base User type
import { v4 as uuidv4 } from 'uuid'; // Import uuid

const DB_NAME = 'RotaCertaDB';
const DB_VERSION = 2; // Increment version to trigger onupgradeneeded for new store

// Define object stores - Export constants
export const STORE_VEHICLES = 'vehicles';
export const STORE_TRIPS = 'trips';
export const STORE_VISITS = 'visits';
export const STORE_EXPENSES = 'expenses';
export const STORE_FUELINGS = 'fuelings';
export const STORE_USERS = 'users'; // Add user store name

// Define sync status type
export type SyncStatus = 'pending' | 'synced' | 'error';

// Extend interfaces to include sync status and optional Firebase ID
interface LocalRecord {
  syncStatus: SyncStatus;
  firebaseId?: string; // Store the Firebase ID if synced
  deleted?: boolean; // Mark for deletion during sync
}

// Use Omit to exclude 'id' from base types if it exists, then define localId
export type LocalVehicle = Omit<VehicleInfo, 'id'> & LocalRecord & { localId: string; id?: string };
export type LocalTrip = Omit<Trip, 'id'> & LocalRecord & { localId: string; id?: string };
export type LocalVisit = Omit<Visit, 'id'> & LocalRecord & { localId: string; tripLocalId: string; id?: string };
export type LocalExpense = Omit<Expense, 'id'> & LocalRecord & { localId: string; tripLocalId: string; id?: string };
export type LocalFueling = Omit<Fueling, 'id'> & LocalRecord & { localId: string; tripLocalId: string; id?: string };
// Define LocalUser type - use Firebase ID as the primary key locally for simplicity in this case
export type LocalUser = User & { lastLogin?: string }; // Keep 'id' as firebaseId, add lastLogin timestamp


let db: IDBDatabase | null = null;

// --- DB Initialization ---
export const openDB = (): Promise<IDBDatabase> => { // Export openDB
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    console.log(`[localDbService] Opening DB ${DB_NAME} version ${DB_VERSION}`);
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('[localDbService] IndexedDB error:', request.error);
      reject('Error opening IndexedDB');
    };

    request.onsuccess = (event) => {
      db = request.result;
      console.log('[localDbService] IndexedDB opened successfully');
      // Heartbeat to keep connection potentially active (optional)
      // setInterval(() => {
      //   if (db) {
      //       try {
      //           const transaction = db.transaction(STORE_USERS, 'readonly'); // Use a store name
      //           transaction.objectStore(STORE_USERS).get('dummy_key_for_heartbeat'); // Perform a read operation
      //       } catch (e) {
      //            console.warn("[localDbService] Heartbeat transaction failed:", e);
      //             // Handle potential errors like DB closed unexpectedly
      //             db = null; // Force re-opening on next operation
      //       }
      //   }
      // }, 30000); // e.g., every 30 seconds
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log('[localDbService] Upgrading IndexedDB...');
      const tempDb = request.result;
      if (!tempDb.objectStoreNames.contains(STORE_VEHICLES)) {
        const vehicleStore = tempDb.createObjectStore(STORE_VEHICLES, { keyPath: 'localId' });
        vehicleStore.createIndex('firebaseId', 'firebaseId', { unique: false });
        vehicleStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        vehicleStore.createIndex('deleted', 'deleted', { unique: false });
         console.log(`[localDbService] Object store ${STORE_VEHICLES} created.`);
      }
      if (!tempDb.objectStoreNames.contains(STORE_TRIPS)) {
        const tripStore = tempDb.createObjectStore(STORE_TRIPS, { keyPath: 'localId' });
        tripStore.createIndex('firebaseId', 'firebaseId', { unique: false });
        tripStore.createIndex('userId', 'userId', { unique: false });
        tripStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        tripStore.createIndex('deleted', 'deleted', { unique: false });
         console.log(`[localDbService] Object store ${STORE_TRIPS} created.`);
      }
      if (!tempDb.objectStoreNames.contains(STORE_VISITS)) {
         const visitStore = tempDb.createObjectStore(STORE_VISITS, { keyPath: 'localId' });
         visitStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
         visitStore.createIndex('firebaseId', 'firebaseId', { unique: false });
         visitStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         visitStore.createIndex('deleted', 'deleted', { unique: false });
          console.log(`[localDbService] Object store ${STORE_VISITS} created.`);
      }
      if (!tempDb.objectStoreNames.contains(STORE_EXPENSES)) {
         const expenseStore = tempDb.createObjectStore(STORE_EXPENSES, { keyPath: 'localId' });
         expenseStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
         expenseStore.createIndex('firebaseId', 'firebaseId', { unique: false });
         expenseStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         expenseStore.createIndex('deleted', 'deleted', { unique: false });
          console.log(`[localDbService] Object store ${STORE_EXPENSES} created.`);
      }
      if (!tempDb.objectStoreNames.contains(STORE_FUELINGS)) {
         const fuelingStore = tempDb.createObjectStore(STORE_FUELINGS, { keyPath: 'localId' });
         fuelingStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
         fuelingStore.createIndex('firebaseId', 'firebaseId', { unique: false });
         fuelingStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         fuelingStore.createIndex('deleted', 'deleted', { unique: false });
          console.log(`[localDbService] Object store ${STORE_FUELINGS} created.`);
      }
      // Create users store
      if (!tempDb.objectStoreNames.contains(STORE_USERS)) {
        // Use 'id' (which will be the firebaseId) as the keyPath
        const userStore = tempDb.createObjectStore(STORE_USERS, { keyPath: 'id' });
        userStore.createIndex('email', 'email', { unique: true }); // Index email for potential lookups
        console.log(`[localDbService] Object store ${STORE_USERS} created.`);
      }
      console.log('[localDbService] IndexedDB upgrade complete');
    };
  });
};

// --- Generic CRUD Operations ---

export const getLocalDbStore = (storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> => {
  return openDB().then(dbInstance => {
    const transaction = dbInstance.transaction(storeName, mode);
    transaction.onerror = (event) => {
         console.error(`[localDbService] Transaction error on ${storeName} (${mode}):`, (event.target as IDBTransaction).error);
    };
    transaction.onabort = (event) => {
         console.warn(`[localDbService] Transaction aborted on ${storeName} (${mode}):`, (event.target as IDBTransaction).error);
    };
    return transaction.objectStore(storeName);
  });
};

// Use this for stores where localId is the key
export const addLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<string> => {
  return getLocalDbStore(storeName, 'readwrite').then(store => {
    return new Promise<string>((resolve, reject) => {
      const request = store.add(record);
      request.onsuccess = () => resolve(record.localId);
      request.onerror = () => {
        console.error(`Error adding record to ${storeName}:`, request.error)
        reject(`Error adding record to ${storeName}: ${request.error?.message}`);
      }
    });
  });
};

// Use this for stores where localId is the key
export const updateLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<void> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const getRequest = store.get(record.localId);
            getRequest.onsuccess = () => {
                if (getRequest.result) {
                    const putRequest = store.put(record);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => {
                        console.error(`Error updating record in ${storeName}:`, putRequest.error);
                        reject(`Error updating record in ${storeName}: ${putRequest.error?.message}`);
                    }
                } else {
                    console.warn(`Record with localId ${record.localId} not found in ${storeName} for update, adding instead.`);
                    const addRequest = store.add(record);
                    addRequest.onsuccess = () => resolve();
                    addRequest.onerror = () => {
                         console.error(`Error adding record during attempted update in ${storeName}:`, addRequest.error);
                         reject(`Error adding record during attempted update in ${storeName}: ${addRequest.error?.message}`);
                    }
                }
            };
            getRequest.onerror = () => {
                console.error(`Error checking record existence in ${storeName}:`, getRequest.error);
                reject(`Error checking record existence in ${storeName}: ${getRequest.error?.message}`);
            }
        });
    });
};

// Generic delete using primary key (could be localId or firebaseId depending on store)
const deleteLocalRecordByKey = (storeName: string, key: string): Promise<void> => {
  return getLocalDbStore(storeName, 'readwrite').then(store => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error(`Error deleting record with key ${key} from ${storeName}:`, request.error);
        reject(`Error deleting record from ${storeName}: ${request.error?.message}`);
      }
    });
  });
};


// Function to mark a record for deletion (soft delete) - uses localId
const markRecordForDeletion = (storeName: string, localId: string): Promise<void> => {
  return getLocalDbStore(storeName, 'readwrite').then(store => {
    return new Promise<void>((resolve, reject) => {
      const request = store.get(localId);
      request.onsuccess = () => {
        if (request.result) {
          const recordToUpdate = { ...request.result, deleted: true, syncStatus: 'pending' as SyncStatus };
          const updateRequest = store.put(recordToUpdate);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => {
             console.error(`Error marking record ${localId} for deletion:`, updateRequest.error);
             reject(`Error marking record ${localId} for deletion: ${updateRequest.error?.message}`);
          }
        } else {
          reject(`Record ${localId} not found to mark for deletion`);
        }
      };
      request.onerror = () => {
          console.error(`Error getting record ${localId} to mark for deletion:`, request.error);
          reject(`Error getting record ${localId} to mark for deletion: ${request.error?.message}`);
      }
    });
  });
};


const getAllLocalRecords = <T>(storeName: string): Promise<T[]> => {
  return getLocalDbStore(storeName, 'readonly').then(store => {
    return new Promise<T[]>((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
          // Filter out deleted items in JavaScript
          const results = (request.result as any[]).filter((item: any) => !item.deleted);
          resolve(results as T[]);
      };
      request.onerror = () => {
         console.error(`Error getting all records from ${storeName}:`, request.error);
         reject(`Error getting all records from ${storeName}: ${request.error?.message}`);
      }
    });
  });
};

// Get records with a specific sync status
const getLocalRecordsBySyncStatus = <T>(storeName: string, status: SyncStatus | SyncStatus[]): Promise<T[]> => {
    return getLocalDbStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            // Check if index exists before trying to use it
             if (!store.indexNames.contains('syncStatus')) {
                 console.warn(`Index 'syncStatus' not found on store ${storeName}. Fetching all and filtering.`);
                 // Fallback: get all and filter manually
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as any[];
                     const statusArray = Array.isArray(status) ? status : [status];
                     const filtered = allRecords.filter(item => !item.deleted && statusArray.includes(item.syncStatus));
                     resolve(filtered as T[]);
                 };
                 getAllRequest.onerror = () => {
                      console.error(`Fallback getAll failed for ${storeName}:`, getAllRequest.error);
                      reject(`Fallback getAll failed for ${storeName}: ${getAllRequest.error?.message}`);
                 }
                 return;
             }

            const index = store.index('syncStatus');
            let request: IDBRequest;

            if (Array.isArray(status)) {
                Promise.all(status.map(s =>
                    new Promise<T[]>((res, rej) => {
                        const req = index.getAll(s);
                        req.onsuccess = () => res(req.result as T[]);
                        req.onerror = () => rej(`Error getting records by status ${s}: ${req.error?.message}`);
                    })
                )).then(resultsArray => {
                    resolve(resultsArray.flat().filter((item: any) => !item.deleted));
                }).catch(reject);
                return;

            } else {
                request = index.getAll(status);
            }

            request.onsuccess = () => {
                const results = (request.result as any[]).filter(item => !item.deleted);
                resolve(results as T[]);
            };
            request.onerror = () => {
                 console.error(`Error getting records by status from ${storeName}:`, request.error);
                 reject(`Error getting records by status from ${storeName}: ${request.error?.message}`);
            }
        });
    });
};


// --- Specific Operations ---

// -- Users (Using firebaseId as primary key 'id') --
export const getLocalUser = (userId: string): Promise<LocalUser | null> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            const request = store.get(userId);
            request.onsuccess = () => resolve(request.result as LocalUser | null);
            request.onerror = () => {
                console.error(`Error getting user ${userId}:`, request.error);
                reject(`Error getting user ${userId}: ${request.error?.message}`);
            }
        });
    });
};

export const saveLocalUser = (user: LocalUser): Promise<void> => {
    return getLocalDbStore(STORE_USERS, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.put(user); // Use put to add or update
            request.onsuccess = () => resolve();
            request.onerror = () => {
                 console.error(`Error saving user ${user.id}:`, request.error);
                 reject(`Error saving user ${user.id}: ${request.error?.message}`);
            }
        });
    });
};

export const deleteLocalUser = (userId: string): Promise<void> => {
     return deleteLocalRecordByKey(STORE_USERS, userId); // Use generic delete by key
};

// -- Vehicles --
export const addLocalVehicle = (vehicle: Omit<LocalVehicle, 'localId' | 'syncStatus' | 'deleted' | 'firebaseId'>): Promise<string> => {
    const localId = `local_vehicle_${uuidv4()}`;
    const newLocalVehicle: LocalVehicle = {
        ...(vehicle as Omit<VehicleInfo, 'id'>),
        localId,
        id: localId,
        syncStatus: 'pending',
        deleted: false,
    };
    return addLocalRecord<LocalVehicle>(STORE_VEHICLES, newLocalVehicle);
};

export const updateLocalVehicle = (vehicle: LocalVehicle): Promise<void> => {
    const updatedVehicle = { ...vehicle, syncStatus: vehicle.syncStatus === 'synced' ? 'pending' : vehicle.syncStatus };
    return updateLocalRecord<LocalVehicle>(STORE_VEHICLES, updatedVehicle);
};

export const deleteLocalVehicle = (localId: string): Promise<void> => {
    return markRecordForDeletion(STORE_VEHICLES, localId);
};

export const getLocalVehicles = (): Promise<LocalVehicle[]> => getAllLocalRecords<LocalVehicle>(STORE_VEHICLES);


// --- Trips ---
export const addLocalTrip = (trip: Omit<LocalTrip, 'localId' | 'syncStatus'>): Promise<string> => {
    const localId = `local_trip_${uuidv4()}`;
    const newLocalTrip: LocalTrip = {
      ...trip,
      localId,
      id: localId, // Also set id to localId initially
      syncStatus: 'pending',
    };
    return addLocalRecord<LocalTrip>(STORE_TRIPS, newLocalTrip);
};

export const updateLocalTrip = (trip: LocalTrip): Promise<void> => {
  const updatedTrip = { ...trip, syncStatus: trip.syncStatus === 'synced' ? 'pending' : trip.syncStatus };
  return updateLocalRecord<LocalTrip>(STORE_TRIPS, updatedTrip);
};

export const deleteLocalTrip = (localId: string): Promise<void> => {
    return markRecordForDeletion(STORE_TRIPS, localId);
};

export const getLocalTrips = (userId?: string): Promise<LocalTrip[]> => {
    if (!userId) {
       return getAllLocalRecords<LocalTrip>(STORE_TRIPS);
    }
    return getLocalDbStore(STORE_TRIPS, 'readonly').then(store => {
        return new Promise<LocalTrip[]>((resolve, reject) => {
             if (!store.indexNames.contains('userId')) {
                 console.warn(`Index 'userId' not found on store ${STORE_TRIPS}. Fetching all and filtering.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as LocalTrip[];
                     const filtered = allRecords.filter(item => !item.deleted && item.userId === userId);
                     resolve(filtered);
                 };
                 getAllRequest.onerror = () => reject(`Fallback getAll failed for ${STORE_TRIPS}: ${getAllRequest.error?.message}`);
                 return;
             }
            const index = store.index('userId');
            const request = index.getAll(userId);
            request.onsuccess = () => {
                const results = (request.result as LocalTrip[]).filter((item: any) => !item.deleted);
                resolve(results);
            };
            request.onerror = () => reject(`Error getting trips for user ${userId}: ${request.error?.message}`);
        });
    });
};

// --- Visits ---
export const addLocalVisit = (visit: Omit<LocalVisit, 'localId' | 'syncStatus'>): Promise<string> => {
    const localId = `local_visit_${uuidv4()}`;
    const newLocalVisit: LocalVisit = {
        ...visit,
        localId,
        id: localId,
        syncStatus: 'pending',
    };
    return addLocalRecord<LocalVisit>(STORE_VISITS, newLocalVisit);
};

export const updateLocalVisit = (visit: LocalVisit): Promise<void> => {
    const updatedVisit = { ...visit, syncStatus: visit.syncStatus === 'synced' ? 'pending' : visit.syncStatus };
    return updateLocalRecord<LocalVisit>(STORE_VISITS, updatedVisit);
};

export const deleteLocalVisit = (localId: string): Promise<void> => {
    return markRecordForDeletion(STORE_VISITS, localId);
};

export const getLocalVisits = (tripLocalId: string): Promise<LocalVisit[]> => {
    return getLocalDbStore(STORE_VISITS, 'readonly').then(store => {
        return new Promise<LocalVisit[]>((resolve, reject) => {
             if (!store.indexNames.contains('tripLocalId')) {
                 console.warn(`Index 'tripLocalId' not found on store ${STORE_VISITS}. Fetching all and filtering.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as LocalVisit[];
                     const filtered = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                     resolve(filtered);
                 };
                 getAllRequest.onerror = () => reject(`Fallback getAll failed for ${STORE_VISITS}: ${getAllRequest.error?.message}`);
                 return;
             }
            const index = store.index('tripLocalId');
            const request = index.getAll(tripLocalId);
            request.onsuccess = () => {
                const results = (request.result as LocalVisit[]).filter(item => !item.deleted);
                results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                resolve(results);
            };
            request.onerror = () => reject(`Error getting visits for trip ${tripLocalId}: ${request.error?.message}`);
        });
    });
};

// --- Expenses ---
export const addLocalExpense = (expense: Omit<LocalExpense, 'localId' | 'syncStatus'>): Promise<string> => {
     const localId = `local_expense_${uuidv4()}`;
     const newLocalExpense: LocalExpense = {
         ...expense,
         localId,
         id: localId,
         syncStatus: 'pending',
     };
     return addLocalRecord<LocalExpense>(STORE_EXPENSES, newLocalExpense);
};

export const updateLocalExpense = (expense: LocalExpense): Promise<void> => {
     const updatedExpense = { ...expense, syncStatus: expense.syncStatus === 'synced' ? 'pending' : expense.syncStatus };
     return updateLocalRecord<LocalExpense>(STORE_EXPENSES, updatedExpense);
};

export const deleteLocalExpense = (localId: string): Promise<void> => {
     return markRecordForDeletion(STORE_EXPENSES, localId);
};

export const getLocalExpenses = (tripLocalId: string): Promise<LocalExpense[]> => {
     return getLocalDbStore(STORE_EXPENSES, 'readonly').then(store => {
         return new Promise<LocalExpense[]>((resolve, reject) => {
              if (!store.indexNames.contains('tripLocalId')) {
                 console.warn(`Index 'tripLocalId' not found on store ${STORE_EXPENSES}. Fetching all and filtering.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as LocalExpense[];
                     const filtered = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                     resolve(filtered);
                 };
                 getAllRequest.onerror = () => reject(`Fallback getAll failed for ${STORE_EXPENSES}: ${getAllRequest.error?.message}`);
                 return;
             }
             const index = store.index('tripLocalId');
             const request = index.getAll(tripLocalId);
             request.onsuccess = () => {
                 const results = (request.result as LocalExpense[]).filter(item => !item.deleted);
                 results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                 resolve(results);
             };
             request.onerror = () => reject(`Error getting expenses for trip ${tripLocalId}: ${request.error?.message}`);
         });
     });
};

// --- Fuelings ---
export const addLocalFueling = (fueling: Omit<LocalFueling, 'localId' | 'syncStatus'>): Promise<string> => {
      const localId = `local_fueling_${uuidv4()}`;
      const newLocalFueling: LocalFueling = {
          ...fueling,
          localId,
          id: localId,
          syncStatus: 'pending',
      };
      return addLocalRecord<LocalFueling>(STORE_FUELINGS, newLocalFueling);
};

export const updateLocalFueling = (fueling: LocalFueling): Promise<void> => {
      const updatedFueling = { ...fueling, syncStatus: fueling.syncStatus === 'synced' ? 'pending' : fueling.syncStatus };
      return updateLocalRecord<LocalFueling>(STORE_FUELINGS, updatedFueling);
};

export const deleteLocalFueling = (localId: string): Promise<void> => {
      return markRecordForDeletion(STORE_FUELINGS, localId);
};

export const getLocalFuelings = (tripLocalId: string): Promise<LocalFueling[]> => {
      return getLocalDbStore(STORE_FUELINGS, 'readonly').then(store => {
          return new Promise<LocalFueling[]>((resolve, reject) => {
              if (!store.indexNames.contains('tripLocalId')) {
                  console.warn(`Index 'tripLocalId' not found on store ${STORE_FUELINGS}. Fetching all and filtering.`);
                  const getAllRequest = store.getAll();
                  getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as LocalFueling[];
                     const filtered = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                     resolve(filtered);
                  };
                  getAllRequest.onerror = () => reject(`Fallback getAll failed for ${STORE_FUELINGS}: ${getAllRequest.error?.message}`);
                  return;
              }
              const index = store.index('tripLocalId');
              const request = index.getAll(tripLocalId);
              request.onsuccess = () => {
                  const results = (request.result as LocalFueling[]).filter(item => !item.deleted);
                  results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  resolve(results);
              };
              request.onerror = () => reject(`Error getting fuelings for trip ${tripLocalId}: ${request.error?.message}`);
          });
      });
};


// --- Sync Operations ---

export const getPendingRecords = async (): Promise<{
  trips: LocalTrip[],
  visits: LocalVisit[],
  expenses: LocalExpense[],
  fuelings: LocalFueling[],
  vehicles: LocalVehicle[],
}> => {
    const pendingStatus: SyncStatus[] = ['pending', 'error'];
    const [trips, visits, expenses, fuelings, vehicles] = await Promise.all([
        getLocalRecordsBySyncStatus<LocalTrip>(STORE_TRIPS, pendingStatus),
        getLocalRecordsBySyncStatus<LocalVisit>(STORE_VISITS, pendingStatus),
        getLocalRecordsBySyncStatus<LocalExpense>(STORE_EXPENSES, pendingStatus),
        getLocalRecordsBySyncStatus<LocalFueling>(STORE_FUELINGS, pendingStatus),
        getLocalRecordsBySyncStatus<LocalVehicle>(STORE_VEHICLES, pendingStatus),
    ]);
    return { trips, visits, expenses, fuelings, vehicles };
};

// Update local record status after successful sync
export const updateSyncStatus = async (storeName: string, localId: string, firebaseId: string | undefined, status: SyncStatus, additionalUpdates: Record<string, any> = {}): Promise<void> => {
  return getLocalDbStore(storeName, 'readwrite').then(store => {
    return new Promise<void>((resolve, reject) => {
      const request = store.get(localId);
      request.onsuccess = () => {
        if (request.result) {
          const recordToUpdate = {
              ...request.result,
              syncStatus: status,
              firebaseId: firebaseId || request.result.firebaseId, // Preserve existing firebaseId if update fails but has one
              ...additionalUpdates
          };
           if (status === 'synced' && !firebaseId && !recordToUpdate.deleted) {
               console.warn(`[Sync] Marking ${storeName} ${localId} as synced without firebaseId, likely deleted locally before sync.`);
           }
          const updateRequest = store.put(recordToUpdate);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => {
               console.error(`Error updating sync status for ${localId}:`, updateRequest.error);
               reject(`Error updating sync status for ${localId}: ${updateRequest.error?.message}`);
          }
        } else {
          reject(`Record ${localId} not found to update sync status`);
        }
      };
      request.onerror = () => {
         console.error(`Error getting record ${localId} for sync status update:`, request.error);
         reject(`Error getting record ${localId} for sync status update: ${request.error?.message}`);
      }
    });
  });
};

// Clean up successfully deleted records after sync
export const cleanupDeletedRecords = async (): Promise<void> => {
    const stores = [STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES];
    for (const storeName of stores) {
        try {
            const store = await getLocalDbStore(storeName, 'readwrite');
             // Check if index exists before trying to use it
             if (!store.indexNames.contains('deleted')) {
                 console.warn(`Index 'deleted' not found on store ${storeName} during cleanup. Skipping.`);
                 continue;
             }
            const index = store.index('deleted');
            const request = index.openCursor(IDBKeyRange.only(true)); // Get cursor for deleted items

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    // Only delete if it was successfully synced (status 'synced' AND deleted is true)
                    if (cursor.value.syncStatus === 'synced' && cursor.value.deleted === true) {
                         console.log(`[Cleanup] Deleting record ${cursor.primaryKey} from ${storeName}`);
                         store.delete(cursor.primaryKey);
                    }
                    cursor.continue();
                }
            };
            request.onerror = (event) => {
                console.error(`[Cleanup] Error iterating deleted records in ${storeName}:`, request.error);
            };
        } catch (error) {
             console.error(`[Cleanup] Error during cleanupDeletedRecords for store ${storeName}:`, error);
        }
    }
};

// Initial call to open the DB when the service loads
openDB().catch(error => console.error("Failed to initialize IndexedDB on load:", error));
