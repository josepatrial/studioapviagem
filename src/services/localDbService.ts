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
let openDBPromise: Promise<IDBDatabase> | null = null; // Promise to track opening process


// --- DB Initialization ---
export const openDB = (): Promise<IDBDatabase> => {
  if (db) {
    return Promise.resolve(db);
  }
  if (openDBPromise) {
      // If opening is already in progress, return the existing promise
      console.log('[localDbService] DB opening already in progress, returning existing promise.');
      return openDBPromise;
  }

  openDBPromise = new Promise((resolve, reject) => {
    console.log(`[localDbService] Opening DB ${DB_NAME} version ${DB_VERSION}`);
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('[localDbService] IndexedDB error:', request.error);
      openDBPromise = null; // Reset promise on error
      reject(`Error opening IndexedDB: ${request.error?.message}`);
    };

    request.onsuccess = (event) => {
      db = request.result;
      console.log('[localDbService] IndexedDB opened successfully');

      db.onclose = () => {
          console.warn('[localDbService] IndexedDB connection closed unexpectedly.');
          db = null; // Reset db instance
          openDBPromise = null; // Allow reopening
      };
      db.onerror = (event) => {
           console.error('[localDbService] IndexedDB connection error:', (event.target as IDBDatabase).error);
           db = null; // Reset db instance
           openDBPromise = null;
      };

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log('[localDbService] Upgrading IndexedDB...');
      const tempDb = request.result;
      // Vehicles Store
      if (!tempDb.objectStoreNames.contains(STORE_VEHICLES)) {
        const vehicleStore = tempDb.createObjectStore(STORE_VEHICLES, { keyPath: 'localId' });
        vehicleStore.createIndex('firebaseId', 'firebaseId', { unique: false }); // Can't be unique if created offline first
        vehicleStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        vehicleStore.createIndex('deleted', 'deleted', { unique: false });
         console.log(`[localDbService] Object store ${STORE_VEHICLES} created.`);
      } else {
          const transaction = (event.target as IDBOpenDBRequest).transaction;
          if (transaction) {
              const store = transaction.objectStore(STORE_VEHICLES);
              if (!store.indexNames.contains('firebaseId')) store.createIndex('firebaseId', 'firebaseId', { unique: false });
              if (!store.indexNames.contains('syncStatus')) store.createIndex('syncStatus', 'syncStatus', { unique: false });
              if (!store.indexNames.contains('deleted')) store.createIndex('deleted', 'deleted', { unique: false });
          }
      }
      // Trips Store
      if (!tempDb.objectStoreNames.contains(STORE_TRIPS)) {
        const tripStore = tempDb.createObjectStore(STORE_TRIPS, { keyPath: 'localId' });
        tripStore.createIndex('firebaseId', 'firebaseId', { unique: false });
        tripStore.createIndex('userId', 'userId', { unique: false });
        tripStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        tripStore.createIndex('deleted', 'deleted', { unique: false });
         console.log(`[localDbService] Object store ${STORE_TRIPS} created.`);
      } else {
           const transaction = (event.target as IDBOpenDBRequest).transaction;
           if (transaction) {
               const store = transaction.objectStore(STORE_TRIPS);
               if (!store.indexNames.contains('firebaseId')) store.createIndex('firebaseId', 'firebaseId', { unique: false });
               if (!store.indexNames.contains('userId')) store.createIndex('userId', 'userId', { unique: false });
               if (!store.indexNames.contains('syncStatus')) store.createIndex('syncStatus', 'syncStatus', { unique: false });
               if (!store.indexNames.contains('deleted')) store.createIndex('deleted', 'deleted', { unique: false });
           }
       }
      // Visits Store
      if (!tempDb.objectStoreNames.contains(STORE_VISITS)) {
         const visitStore = tempDb.createObjectStore(STORE_VISITS, { keyPath: 'localId' });
         visitStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
         visitStore.createIndex('firebaseId', 'firebaseId', { unique: false });
         visitStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         visitStore.createIndex('deleted', 'deleted', { unique: false });
          console.log(`[localDbService] Object store ${STORE_VISITS} created.`);
      } else {
           const transaction = (event.target as IDBOpenDBRequest).transaction;
           if (transaction) {
               const store = transaction.objectStore(STORE_VISITS);
               if (!store.indexNames.contains('tripLocalId')) visitStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
               if (!store.indexNames.contains('firebaseId')) store.createIndex('firebaseId', 'firebaseId', { unique: false });
               if (!store.indexNames.contains('syncStatus')) store.createIndex('syncStatus', 'syncStatus', { unique: false });
               if (!store.indexNames.contains('deleted')) store.createIndex('deleted', 'deleted', { unique: false });
           }
      }
      // Expenses Store
      if (!tempDb.objectStoreNames.contains(STORE_EXPENSES)) {
         const expenseStore = tempDb.createObjectStore(STORE_EXPENSES, { keyPath: 'localId' });
         expenseStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
         expenseStore.createIndex('firebaseId', 'firebaseId', { unique: false });
         expenseStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         expenseStore.createIndex('deleted', 'deleted', { unique: false });
          console.log(`[localDbService] Object store ${STORE_EXPENSES} created.`);
      } else {
           const transaction = (event.target as IDBOpenDBRequest).transaction;
           if (transaction) {
               const store = transaction.objectStore(STORE_EXPENSES);
               if (!store.indexNames.contains('tripLocalId')) expenseStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
               if (!store.indexNames.contains('firebaseId')) store.createIndex('firebaseId', 'firebaseId', { unique: false });
               if (!store.indexNames.contains('syncStatus')) store.createIndex('syncStatus', 'syncStatus', { unique: false });
               if (!store.indexNames.contains('deleted')) store.createIndex('deleted', 'deleted', { unique: false });
           }
      }
      // Fuelings Store
      if (!tempDb.objectStoreNames.contains(STORE_FUELINGS)) {
         const fuelingStore = tempDb.createObjectStore(STORE_FUELINGS, { keyPath: 'localId' });
         fuelingStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
         fuelingStore.createIndex('firebaseId', 'firebaseId', { unique: false });
         fuelingStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         fuelingStore.createIndex('deleted', 'deleted', { unique: false });
          console.log(`[localDbService] Object store ${STORE_FUELINGS} created.`);
      } else {
           const transaction = (event.target as IDBOpenDBRequest).transaction;
           if (transaction) {
               const store = transaction.objectStore(STORE_FUELINGS);
               if (!store.indexNames.contains('tripLocalId')) fuelingStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
               if (!store.indexNames.contains('firebaseId')) store.createIndex('firebaseId', 'firebaseId', { unique: false });
               if (!store.indexNames.contains('syncStatus')) store.createIndex('syncStatus', 'syncStatus', { unique: false });
               if (!store.indexNames.contains('deleted')) store.createIndex('deleted', 'deleted', { unique: false });
           }
      }
      // Users Store
      if (!tempDb.objectStoreNames.contains(STORE_USERS)) {
        const userStore = tempDb.createObjectStore(STORE_USERS, { keyPath: 'id' });
        userStore.createIndex('email', 'email', { unique: true });
        console.log(`[localDbService] Object store ${STORE_USERS} created.`);
      } else {
           const transaction = (event.target as IDBOpenDBRequest).transaction;
           if (transaction) {
               const store = transaction.objectStore(STORE_USERS);
               if (!store.indexNames.contains('email')) store.createIndex('email', 'email', { unique: true });
           }
      }
      console.log('[localDbService] IndexedDB upgrade complete');
    };

     request.onblocked = (event) => {
          console.warn("[localDbService] IndexedDB open request blocked. Please close other tabs using this database.", event);
          openDBPromise = null; // Reset promise
          reject("IndexedDB blocked, please close other tabs.");
     };
  });
  return openDBPromise;
};

// --- Generic CRUD Operations ---

export const getLocalDbStore = (storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> => {
  const getStoreStartTime = performance.now();
  console.log(`[getLocalDbStore ${getStoreStartTime}] Acquiring store: ${storeName}, mode: ${mode}`);
  return openDB().then(dbInstance => {
    try {
      const transaction = dbInstance.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const getStoreEndTime = performance.now();
      console.log(`[getLocalDbStore ${getStoreStartTime}] Store acquired successfully. Time: ${getStoreEndTime - getStoreStartTime} ms`);

      transaction.onerror = (event) => {
           console.error(`[localDbService Transaction] Error on ${storeName} (${mode}):`, (event.target as IDBTransaction).error);
      };
      transaction.onabort = (event) => {
           console.warn(`[localDbService Transaction] Aborted on ${storeName} (${mode}):`, (event.target as IDBTransaction).error);
      };
      transaction.oncomplete = () => {
           // console.log(`[localDbService Transaction] Completed on ${storeName} (${mode})`);
      };
      return store;
     } catch (error) {
         const getStoreEndTime = performance.now();
         console.error(`[getLocalDbStore ${getStoreStartTime}] Error acquiring store ${storeName} (${mode}). Time: ${getStoreEndTime - getStoreStartTime} ms`, error);
         throw error; // Re-throw error after logging
     }
  });
};

// Use this for stores where localId is the key
export const addLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<string> => {
    const addStartTime = performance.now();
    console.log(`[addLocalRecord ${addStartTime}] Adding record to ${storeName}`, record);
    return getLocalDbStore(storeName, 'readwrite').then(store => {
      return new Promise<string>((resolve, reject) => {
        const request = store.add(record);
        request.onsuccess = () => {
            const addEndTime = performance.now();
            console.log(`[addLocalRecord ${addStartTime}] Record added successfully to ${storeName}. Time: ${addEndTime - addStartTime} ms`);
            resolve(record.localId);
        }
        request.onerror = () => {
            const addEndTime = performance.now();
            console.error(`[addLocalRecord ${addStartTime}] Error adding record to ${storeName}. Time: ${addEndTime - addStartTime} ms`, request.error);
            reject(`Error adding record to ${storeName}: ${request.error?.message}`);
        }
      });
    });
};

// Use this for stores where localId is the key
export const updateLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<void> => {
    const updateStartTime = performance.now();
    console.log(`[updateLocalRecord ${updateStartTime}] Updating record in ${storeName}`, record);
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            // Use put which works for both adding and updating
            const request = store.put(record);
            request.onsuccess = () => {
                 const updateEndTime = performance.now();
                 console.log(`[updateLocalRecord ${updateStartTime}] Record updated/added successfully in ${storeName}. Time: ${updateEndTime - updateStartTime} ms`);
                 resolve();
            };
            request.onerror = () => {
                const updateEndTime = performance.now();
                console.error(`[updateLocalRecord ${updateStartTime}] Error updating/adding record in ${storeName}. Time: ${updateEndTime - updateStartTime} ms`, request.error);
                reject(`Error updating/adding record in ${storeName}: ${request.error?.message}`);
            };
        });
    });
};

// Generic delete using primary key (could be localId or firebaseId depending on store)
const deleteLocalRecordByKey = (storeName: string, key: string): Promise<void> => {
    const deleteStartTime = performance.now();
    console.log(`[deleteLocalRecordByKey ${deleteStartTime}] Deleting record with key ${key} from ${storeName}`);
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => {
               const deleteEndTime = performance.now();
               console.log(`[deleteLocalRecordByKey ${deleteStartTime}] Record deleted successfully. Time: ${deleteEndTime - deleteStartTime} ms`);
               resolve();
          }
          request.onerror = () => {
                const deleteEndTime = performance.now();
                console.error(`[deleteLocalRecordByKey ${deleteStartTime}] Error deleting record with key ${key} from ${storeName}. Time: ${deleteEndTime - deleteStartTime} ms`, request.error);
                reject(`Error deleting record from ${storeName}: ${request.error?.message}`);
          }
        });
    });
};


// Function to mark a record for deletion (soft delete) - uses localId
const markRecordForDeletion = (storeName: string, localId: string): Promise<void> => {
    const markStartTime = performance.now();
    console.log(`[markRecordForDeletion ${markStartTime}] Marking record ${localId} in ${storeName} for deletion`);
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.get(localId);
            request.onsuccess = () => {
                if (request.result) {
                    const recordToUpdate = { ...request.result, deleted: true, syncStatus: 'pending' as SyncStatus };
                    const updateRequest = store.put(recordToUpdate);
                    updateRequest.onsuccess = () => {
                         const markEndTime = performance.now();
                         console.log(`[markRecordForDeletion ${markStartTime}] Record marked successfully. Time: ${markEndTime - markStartTime} ms`);
                         resolve();
                    }
                    updateRequest.onerror = () => {
                         const markEndTime = performance.now();
                         console.error(`[markRecordForDeletion ${markStartTime}] Error marking record ${localId} for deletion. Time: ${markEndTime - markStartTime} ms`, updateRequest.error);
                         reject(`Error marking record ${localId} for deletion: ${updateRequest.error?.message}`);
                    }
                } else {
                    const markEndTime = performance.now();
                    console.warn(`[markRecordForDeletion ${markStartTime}] Record ${localId} not found to mark for deletion. Time: ${markEndTime - markStartTime} ms`);
                    reject(`Record ${localId} not found to mark for deletion`);
                }
            };
            request.onerror = () => {
                 const markEndTime = performance.now();
                 console.error(`[markRecordForDeletion ${markStartTime}] Error getting record ${localId} to mark for deletion. Time: ${markEndTime - markStartTime} ms`, request.error);
                 reject(`Error getting record ${localId} to mark for deletion: ${request.error?.message}`);
            }
        });
    });
};


const getAllLocalRecords = <T>(storeName: string): Promise<T[]> => {
    const getAllStartTime = performance.now();
    console.log(`[getAllLocalRecords ${getAllStartTime}] Getting all non-deleted records from ${storeName}`);
    return getLocalDbStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const results = (request.result as any[]).filter((item: any) => !item.deleted);
                const getAllEndTime = performance.now();
                console.log(`[getAllLocalRecords ${getAllStartTime}] Got ${results.length} records successfully. Time: ${getAllEndTime - getAllStartTime} ms`);
                resolve(results as T[]);
            };
            request.onerror = () => {
                const getAllEndTime = performance.now();
                console.error(`[getAllLocalRecords ${getAllStartTime}] Error getting all records from ${storeName}. Time: ${getAllEndTime - getAllStartTime} ms`, request.error);
                reject(`Error getting all records from ${storeName}: ${request.error?.message}`);
            }
        });
    });
};

// Get records with a specific sync status
const getLocalRecordsBySyncStatus = <T>(storeName: string, status: SyncStatus | SyncStatus[]): Promise<T[]> => {
    const getByStatusStartTime = performance.now();
    const statusString = Array.isArray(status) ? status.join(', ') : status;
    console.log(`[getLocalRecordsBySyncStatus ${getByStatusStartTime}] Getting records from ${storeName} with status: ${statusString}`);
    return getLocalDbStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            if (!store.indexNames.contains('syncStatus')) {
                 console.warn(`[getLocalRecordsBySyncStatus ${getByStatusStartTime}] Index 'syncStatus' not found on ${storeName}. Fetching all and filtering.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as any[];
                     const statusArray = Array.isArray(status) ? status : [status];
                     const filtered = allRecords.filter(item => !item.deleted && statusArray.includes(item.syncStatus));
                     const getByStatusEndTime = performance.now();
                     console.log(`[getLocalRecordsBySyncStatus ${getByStatusStartTime}] Fallback filter complete. Found ${filtered.length} records. Time: ${getByStatusEndTime - getByStatusStartTime} ms`);
                     resolve(filtered as T[]);
                 };
                 getAllRequest.onerror = () => {
                      const getByStatusEndTime = performance.now();
                      console.error(`[getLocalRecordsBySyncStatus ${getByStatusStartTime}] Fallback getAll failed for ${storeName}. Time: ${getByStatusEndTime - getByStatusStartTime} ms`, getAllRequest.error);
                      reject(`Fallback getAll failed for ${storeName}: ${getAllRequest.error?.message}`);
                 }
                 return;
             }

            const index = store.index('syncStatus');
            const statusArray = Array.isArray(status) ? status : [status];
            let combinedResults: T[] = [];
            let promises: Promise<void>[] = [];

             statusArray.forEach(s => {
                promises.push(new Promise<void>((res, rej) => {
                     const request = index.getAll(s);
                     request.onsuccess = () => {
                         const results = (request.result as any[]).filter(item => !item.deleted);
                         combinedResults = combinedResults.concat(results as T[]);
                         res();
                     };
                     request.onerror = () => {
                         console.error(`[getLocalRecordsBySyncStatus ${getByStatusStartTime}] Error getting records by status ${s} from ${storeName}:`, request.error);
                         rej(`Error getting records by status ${s}: ${request.error?.message}`);
                     };
                }));
            });


             Promise.all(promises).then(() => {
                 const getByStatusEndTime = performance.now();
                 console.log(`[getLocalRecordsBySyncStatus ${getByStatusStartTime}] Got ${combinedResults.length} records successfully. Time: ${getByStatusEndTime - getByStatusStartTime} ms`);
                 resolve(combinedResults);
             }).catch(reject);

        });
    });
};


// --- Specific Operations ---

// -- Users (Using firebaseId as primary key 'id') --
export const getLocalUser = (userId: string): Promise<LocalUser | null> => {
    const getUserStartTime = performance.now();
    console.log(`[getLocalUser ${getUserStartTime}] Getting user with ID: ${userId}`);
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            const request = store.get(userId);
            request.onsuccess = () => {
                const getUserEndTime = performance.now();
                console.log(`[getLocalUser ${getUserStartTime}] User ${userId} ${request.result ? 'found' : 'not found'}. Time: ${getUserEndTime - getUserStartTime} ms`);
                resolve(request.result as LocalUser | null);
            };
            request.onerror = () => {
                const getUserEndTime = performance.now();
                console.error(`[getLocalUser ${getUserStartTime}] Error getting user ${userId}. Time: ${getUserEndTime - getUserStartTime} ms`, request.error);
                reject(`Error getting user ${userId}: ${request.error?.message}`);
            }
        });
    });
};

export const saveLocalUser = (user: LocalUser): Promise<void> => {
    const saveUserStartTime = performance.now();
    console.log(`[saveLocalUser ${saveUserStartTime}] Saving user with ID: ${user.id}`);
    return getLocalDbStore(STORE_USERS, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.put(user); // Use put to add or update
            request.onsuccess = () => {
                 const saveUserEndTime = performance.now();
                 console.log(`[saveLocalUser ${saveUserStartTime}] User saved successfully. Time: ${saveUserEndTime - saveUserStartTime} ms`);
                 resolve();
            };
            request.onerror = () => {
                 const saveUserEndTime = performance.now();
                 console.error(`[saveLocalUser ${saveUserStartTime}] Error saving user ${user.id}. Time: ${saveUserEndTime - saveUserStartTime} ms`, request.error);
                 reject(`Error saving user ${user.id}: ${request.error?.message}`);
            }
        });
    });
};

export const deleteLocalUser = (userId: string): Promise<void> => {
     console.log(`[deleteLocalUser] Deleting user with ID: ${userId}`);
     return deleteLocalRecordByKey(STORE_USERS, userId);
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
    console.log(`[addLocalVehicle] Preparing to add vehicle with localId: ${localId}`);
    return addLocalRecord<LocalVehicle>(STORE_VEHICLES, newLocalVehicle);
};

export const updateLocalVehicle = (vehicle: LocalVehicle): Promise<void> => {
    console.log(`[updateLocalVehicle] Preparing to update vehicle with localId: ${vehicle.localId}`);
    const updatedVehicle = { ...vehicle, syncStatus: vehicle.syncStatus === 'synced' ? 'pending' : vehicle.syncStatus };
    return updateLocalRecord<LocalVehicle>(STORE_VEHICLES, updatedVehicle);
};

export const deleteLocalVehicle = (localId: string): Promise<void> => {
    console.log(`[deleteLocalVehicle] Preparing to mark vehicle for deletion with localId: ${localId}`);
    return markRecordForDeletion(STORE_VEHICLES, localId);
};

export const getLocalVehicles = (): Promise<LocalVehicle[]> => {
    console.log(`[getLocalVehicles] Fetching all vehicles.`);
    return getAllLocalRecords<LocalVehicle>(STORE_VEHICLES);
};


// --- Trips ---
export const addLocalTrip = (trip: Omit<LocalTrip, 'localId' | 'syncStatus'>): Promise<string> => {
    const localId = `local_trip_${uuidv4()}`;
    const newLocalTrip: LocalTrip = {
      ...trip,
      localId,
      id: localId, // Also set id to localId initially
      syncStatus: 'pending',
    };
    console.log(`[addLocalTrip] Preparing to add trip with localId: ${localId}`);
    return addLocalRecord<LocalTrip>(STORE_TRIPS, newLocalTrip);
};

export const updateLocalTrip = (trip: LocalTrip): Promise<void> => {
    console.log(`[updateLocalTrip] Preparing to update trip with localId: ${trip.localId}`);
    const updatedTrip = { ...trip, syncStatus: trip.syncStatus === 'synced' ? 'pending' : trip.syncStatus };
    return updateLocalRecord<LocalTrip>(STORE_TRIPS, updatedTrip);
};

export const deleteLocalTrip = (localId: string): Promise<void> => {
    console.log(`[deleteLocalTrip] Preparing to mark trip for deletion with localId: ${localId}`);
    return markRecordForDeletion(STORE_TRIPS, localId);
};

export const getLocalTrips = (userId?: string): Promise<LocalTrip[]> => {
    const getTripsStartTime = performance.now();
    console.log(`[getLocalTrips ${getTripsStartTime}] Fetching trips for userId: ${userId || 'all'}`);
    if (!userId) {
       return getAllLocalRecords<LocalTrip>(STORE_TRIPS);
    }
    return getLocalDbStore(STORE_TRIPS, 'readonly').then(store => {
        return new Promise<LocalTrip[]>((resolve, reject) => {
             if (!store.indexNames.contains('userId')) {
                 console.warn(`[getLocalTrips ${getTripsStartTime}] Index 'userId' not found on ${STORE_TRIPS}. Fetching all and filtering.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as LocalTrip[];
                     const filtered = allRecords.filter(item => !item.deleted && item.userId === userId);
                      const getTripsEndTime = performance.now();
                      console.log(`[getLocalTrips ${getTripsStartTime}] Fallback filter complete. Found ${filtered.length} trips. Time: ${getTripsEndTime - getTripsStartTime} ms`);
                     resolve(filtered);
                 };
                 getAllRequest.onerror = () => {
                      const getTripsEndTime = performance.now();
                      console.error(`[getLocalTrips ${getTripsStartTime}] Fallback getAll failed for ${STORE_TRIPS}. Time: ${getTripsEndTime - getTripsStartTime} ms`, getAllRequest.error);
                      reject(`Fallback getAll failed for ${STORE_TRIPS}: ${getAllRequest.error?.message}`);
                 }
                 return;
             }
            const index = store.index('userId');
            const request = index.getAll(userId);
            request.onsuccess = () => {
                const results = (request.result as LocalTrip[]).filter((item: any) => !item.deleted);
                 const getTripsEndTime = performance.now();
                 console.log(`[getLocalTrips ${getTripsStartTime}] Found ${results.length} trips using index. Time: ${getTripsEndTime - getTripsStartTime} ms`);
                resolve(results);
            };
            request.onerror = () => {
                 const getTripsEndTime = performance.now();
                 console.error(`[getLocalTrips ${getTripsStartTime}] Error getting trips for user ${userId}. Time: ${getTripsEndTime - getTripsStartTime} ms`, request.error);
                 reject(`Error getting trips for user ${userId}: ${request.error?.message}`);
            }
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
     console.log(`[addLocalVisit] Preparing to add visit with localId: ${localId}`);
    return addLocalRecord<LocalVisit>(STORE_VISITS, newLocalVisit);
};

export const updateLocalVisit = (visit: LocalVisit): Promise<void> => {
     console.log(`[updateLocalVisit] Preparing to update visit with localId: ${visit.localId}`);
    const updatedVisit = { ...visit, syncStatus: visit.syncStatus === 'synced' ? 'pending' : visit.syncStatus };
    return updateLocalRecord<LocalVisit>(STORE_VISITS, updatedVisit);
};

export const deleteLocalVisit = (localId: string): Promise<void> => {
     console.log(`[deleteLocalVisit] Preparing to mark visit for deletion with localId: ${localId}`);
    return markRecordForDeletion(STORE_VISITS, localId);
};

export const getLocalVisits = (tripLocalId: string): Promise<LocalVisit[]> => {
     const getVisitsStartTime = performance.now();
     console.log(`[getLocalVisits ${getVisitsStartTime}] Fetching visits for tripLocalId: ${tripLocalId}`);
    return getLocalDbStore(STORE_VISITS, 'readonly').then(store => {
        return new Promise<LocalVisit[]>((resolve, reject) => {
             if (!store.indexNames.contains('tripLocalId')) {
                 console.warn(`[getLocalVisits ${getVisitsStartTime}] Index 'tripLocalId' not found on ${STORE_VISITS}. Fetching all and filtering.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as LocalVisit[];
                     const filtered = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                      const getVisitsEndTime = performance.now();
                      console.log(`[getLocalVisits ${getVisitsStartTime}] Fallback filter complete. Found ${filtered.length} visits. Time: ${getVisitsEndTime - getVisitsStartTime} ms`);
                     resolve(filtered);
                 };
                 getAllRequest.onerror = () => {
                      const getVisitsEndTime = performance.now();
                      console.error(`[getLocalVisits ${getVisitsStartTime}] Fallback getAll failed for ${STORE_VISITS}. Time: ${getVisitsEndTime - getVisitsStartTime} ms`, getAllRequest.error);
                      reject(`Fallback getAll failed for ${STORE_VISITS}: ${getAllRequest.error?.message}`);
                 }
                 return;
             }
            const index = store.index('tripLocalId');
            const request = index.getAll(tripLocalId);
            request.onsuccess = () => {
                const results = (request.result as LocalVisit[]).filter(item => !item.deleted);
                results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                 const getVisitsEndTime = performance.now();
                 console.log(`[getLocalVisits ${getVisitsStartTime}] Found ${results.length} visits using index. Time: ${getVisitsEndTime - getVisitsStartTime} ms`);
                resolve(results);
            };
            request.onerror = () => {
                 const getVisitsEndTime = performance.now();
                 console.error(`[getLocalVisits ${getVisitsStartTime}] Error getting visits for trip ${tripLocalId}. Time: ${getVisitsEndTime - getVisitsStartTime} ms`, request.error);
                 reject(`Error getting visits for trip ${tripLocalId}: ${request.error?.message}`);
            }
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
      console.log(`[addLocalExpense] Preparing to add expense with localId: ${localId}`);
     return addLocalRecord<LocalExpense>(STORE_EXPENSES, newLocalExpense);
};

export const updateLocalExpense = (expense: LocalExpense): Promise<void> => {
      console.log(`[updateLocalExpense] Preparing to update expense with localId: ${expense.localId}`);
     const updatedExpense = { ...expense, syncStatus: expense.syncStatus === 'synced' ? 'pending' : expense.syncStatus };
     return updateLocalRecord<LocalExpense>(STORE_EXPENSES, updatedExpense);
};

export const deleteLocalExpense = (localId: string): Promise<void> => {
      console.log(`[deleteLocalExpense] Preparing to mark expense for deletion with localId: ${localId}`);
     return markRecordForDeletion(STORE_EXPENSES, localId);
};

export const getLocalExpenses = (tripLocalId: string): Promise<LocalExpense[]> => {
     const getExpensesStartTime = performance.now();
      console.log(`[getLocalExpenses ${getExpensesStartTime}] Fetching expenses for tripLocalId: ${tripLocalId}`);
     return getLocalDbStore(STORE_EXPENSES, 'readonly').then(store => {
         return new Promise<LocalExpense[]>((resolve, reject) => {
              if (!store.indexNames.contains('tripLocalId')) {
                 console.warn(`[getLocalExpenses ${getExpensesStartTime}] Index 'tripLocalId' not found on ${STORE_EXPENSES}. Fetching all and filtering.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as LocalExpense[];
                     const filtered = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                      const getExpensesEndTime = performance.now();
                      console.log(`[getLocalExpenses ${getExpensesStartTime}] Fallback filter complete. Found ${filtered.length} expenses. Time: ${getExpensesEndTime - getExpensesStartTime} ms`);
                     resolve(filtered);
                 };
                 getAllRequest.onerror = () => {
                      const getExpensesEndTime = performance.now();
                      console.error(`[getLocalExpenses ${getExpensesStartTime}] Fallback getAll failed for ${STORE_EXPENSES}. Time: ${getExpensesEndTime - getExpensesStartTime} ms`, getAllRequest.error);
                      reject(`Fallback getAll failed for ${STORE_EXPENSES}: ${getAllRequest.error?.message}`);
                 }
                 return;
             }
             const index = store.index('tripLocalId');
             const request = index.getAll(tripLocalId);
             request.onsuccess = () => {
                 const results = (request.result as LocalExpense[]).filter(item => !item.deleted);
                 results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  const getExpensesEndTime = performance.now();
                  console.log(`[getLocalExpenses ${getExpensesStartTime}] Found ${results.length} expenses using index. Time: ${getExpensesEndTime - getExpensesStartTime} ms`);
                 resolve(results);
             };
             request.onerror = () => {
                  const getExpensesEndTime = performance.now();
                  console.error(`[getLocalExpenses ${getExpensesStartTime}] Error getting expenses for trip ${tripLocalId}. Time: ${getExpensesEndTime - getExpensesStartTime} ms`, request.error);
                  reject(`Error getting expenses for trip ${tripLocalId}: ${request.error?.message}`);
             }
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
       console.log(`[addLocalFueling] Preparing to add fueling with localId: ${localId}`);
      return addLocalRecord<LocalFueling>(STORE_FUELINGS, newLocalFueling);
};

export const updateLocalFueling = (fueling: LocalFueling): Promise<void> => {
       console.log(`[updateLocalFueling] Preparing to update fueling with localId: ${fueling.localId}`);
      const updatedFueling = { ...fueling, syncStatus: fueling.syncStatus === 'synced' ? 'pending' : fueling.syncStatus };
      return updateLocalRecord<LocalFueling>(STORE_FUELINGS, updatedFueling);
};

export const deleteLocalFueling = (localId: string): Promise<void> => {
       console.log(`[deleteLocalFueling] Preparing to mark fueling for deletion with localId: ${localId}`);
      return markRecordForDeletion(STORE_FUELINGS, localId);
};

export const getLocalFuelings = (tripLocalId: string): Promise<LocalFueling[]> => {
       const getFuelingsStartTime = performance.now();
       console.log(`[getLocalFuelings ${getFuelingsStartTime}] Fetching fuelings for tripLocalId: ${tripLocalId}`);
      return getLocalDbStore(STORE_FUELINGS, 'readonly').then(store => {
          return new Promise<LocalFueling[]>((resolve, reject) => {
              if (!store.indexNames.contains('tripLocalId')) {
                  console.warn(`[getLocalFuelings ${getFuelingsStartTime}] Index 'tripLocalId' not found on ${STORE_FUELINGS}. Fetching all and filtering.`);
                  const getAllRequest = store.getAll();
                  getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as LocalFueling[];
                     const filtered = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                      const getFuelingsEndTime = performance.now();
                      console.log(`[getLocalFuelings ${getFuelingsStartTime}] Fallback filter complete. Found ${filtered.length} fuelings. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`);
                     resolve(filtered);
                  };
                  getAllRequest.onerror = () => {
                       const getFuelingsEndTime = performance.now();
                       console.error(`[getLocalFuelings ${getFuelingsStartTime}] Fallback getAll failed for ${STORE_FUELINGS}. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`, getAllRequest.error);
                       reject(`Fallback getAll failed for ${STORE_FUELINGS}: ${getAllRequest.error?.message}`);
                  }
                  return;
              }
              const index = store.index('tripLocalId');
              const request = index.getAll(tripLocalId);
              request.onsuccess = () => {
                  const results = (request.result as LocalFueling[]).filter(item => !item.deleted);
                  results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                   const getFuelingsEndTime = performance.now();
                   console.log(`[getLocalFuelings ${getFuelingsStartTime}] Found ${results.length} fuelings using index. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`);
                  resolve(results);
              };
              request.onerror = () => {
                   const getFuelingsEndTime = performance.now();
                   console.error(`[getLocalFuelings ${getFuelingsStartTime}] Error getting fuelings for trip ${tripLocalId}. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`, request.error);
                   reject(`Error getting fuelings for trip ${tripLocalId}: ${request.error?.message}`);
              }
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
    console.log("[getPendingRecords] Fetching all pending/error records...");
    const pendingStatus: SyncStatus[] = ['pending', 'error'];
    try {
        const [trips, visits, expenses, fuelings, vehicles] = await Promise.all([
            getLocalRecordsBySyncStatus<LocalTrip>(STORE_TRIPS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalVisit>(STORE_VISITS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalExpense>(STORE_EXPENSES, pendingStatus),
            getLocalRecordsBySyncStatus<LocalFueling>(STORE_FUELINGS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalVehicle>(STORE_VEHICLES, pendingStatus),
        ]);
        console.log(`[getPendingRecords] Found: ${trips.length} trips, ${visits.length} visits, ${expenses.length} expenses, ${fuelings.length} fuelings, ${vehicles.length} vehicles.`);
        return { trips, visits, expenses, fuelings, vehicles };
    } catch (error) {
        console.error("[getPendingRecords] Error fetching pending records:", error);
        return { trips: [], visits: [], expenses: [], fuelings: [], vehicles: [] }; // Return empty on error
    }
};

// Update local record status after successful sync
export const updateSyncStatus = async (storeName: string, localId: string, firebaseId: string | undefined, status: SyncStatus, additionalUpdates: Record<string, any> = {}): Promise<void> => {
    const updateStatusStartTime = performance.now();
    console.log(`[updateSyncStatus ${updateStatusStartTime}] Updating status for ${storeName} ${localId} to ${status}, firebaseId: ${firebaseId}`);
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.get(localId);
            request.onsuccess = () => {
                if (request.result) {
                    const recordToUpdate = {
                        ...request.result,
                        syncStatus: status,
                        firebaseId: firebaseId || request.result.firebaseId,
                        ...additionalUpdates
                    };
                    if (status === 'synced' && !firebaseId && !recordToUpdate.deleted) {
                        console.warn(`[updateSyncStatus ${updateStatusStartTime}] Marking ${storeName} ${localId} as synced without firebaseId.`);
                    }
                    const updateRequest = store.put(recordToUpdate);
                    updateRequest.onsuccess = () => {
                         const updateStatusEndTime = performance.now();
                         console.log(`[updateSyncStatus ${updateStatusStartTime}] Status updated successfully. Time: ${updateStatusEndTime - updateStatusStartTime} ms`);
                         resolve();
                    };
                    updateRequest.onerror = () => {
                         const updateStatusEndTime = performance.now();
                         console.error(`[updateSyncStatus ${updateStatusStartTime}] Error updating sync status for ${localId}. Time: ${updateStatusEndTime - updateStatusStartTime} ms`, updateRequest.error);
                         reject(`Error updating sync status for ${localId}: ${updateRequest.error?.message}`);
                    }
                } else {
                    const updateStatusEndTime = performance.now();
                    console.warn(`[updateSyncStatus ${updateStatusStartTime}] Record ${localId} not found to update sync status. Time: ${updateStatusEndTime - updateStatusStartTime} ms`);
                    reject(`Record ${localId} not found to update sync status`);
                }
            };
            request.onerror = () => {
                 const updateStatusEndTime = performance.now();
                 console.error(`[updateSyncStatus ${updateStatusStartTime}] Error getting record ${localId} for sync status update. Time: ${updateStatusEndTime - updateStatusStartTime} ms`, request.error);
                 reject(`Error getting record ${localId} for sync status update: ${request.error?.message}`);
            }
        });
    });
};

// Clean up successfully deleted records after sync
export const cleanupDeletedRecords = async (): Promise<void> => {
    console.log("[cleanupDeletedRecords] Starting cleanup...");
    const stores = [STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES];
    let deletedCount = 0;
    const cleanupPromises: Promise<void>[] = [];

    for (const storeName of stores) {
        cleanupPromises.push(new Promise<void>(async (resolveStore, rejectStore) => {
             let storeDeletedCount = 0;
             try {
                const store = await getLocalDbStore(storeName, 'readwrite');
                 if (!store.indexNames.contains('deleted')) {
                     console.warn(`[Cleanup] Index 'deleted' not found on store ${storeName}. Skipping.`);
                     resolveStore();
                     return;
                 }
                const index = store.index('deleted');
                let cursor = await new Promise<IDBCursorWithValue | null>((res, rej) => {
                    const req = index.openCursor(IDBKeyRange.only(true));
                    req.onsuccess = () => res(req.result);
                    req.onerror = () => rej(req.error);
                });

                while (cursor) {
                    if (cursor.value.syncStatus === 'synced' && cursor.value.deleted === true) {
                         console.log(`[Cleanup] Deleting record ${cursor.primaryKey} from ${storeName}`);
                         cursor.delete(); // Delete the record via the cursor
                         deletedCount++;
                         storeDeletedCount++;
                    }
                    cursor = await new Promise<IDBCursorWithValue | null>((res, rej) => {
                         const continueReq = cursor!.continue(); // Use non-null assertion
                         continueReq.onsuccess = () => res(continueReq.result);
                         continueReq.onerror = () => rej(continueReq.error);
                    });
                 }
                console.log(`[Cleanup] Finished store ${storeName}. Deleted ${storeDeletedCount} records.`);
                resolveStore();
            } catch (error) {
                 console.error(`[Cleanup] Error during cleanupDeletedRecords for store ${storeName}:`, error);
                 rejectStore(error); // Reject the store promise on error
            }
        }));
    }

     try {
         await Promise.all(cleanupPromises);
         console.log(`[cleanupDeletedRecords] Cleanup complete. Total records deleted: ${deletedCount}`);
     } catch (error) {
         console.error("[cleanupDeletedRecords] Error during cleanup process:", error);
     }
};

// Initial call to open the DB when the service loads
openDB().catch(error => console.error("Failed to initialize IndexedDB on load:", error));
