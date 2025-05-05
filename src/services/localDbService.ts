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
// Define LocalUser type - include password hash
export type LocalUser = User & { lastLogin?: string; passwordHash?: string; }; // 'id' is firebaseId, add hash

// Define initial seed users data (using hashed passwords)
// IMPORTANT: Replace these placeholder hashes with actual hashes generated from desired passwords
export const initialSeedUsers: LocalUser[] = [
  {
    id: 'local_admin_example_com', // Use a local ID for seeding
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    base: 'ALL',
    passwordHash: '$2a$10$8.uTjL9.eF9/jU6bW8nEwuxVq6r3q0Z4U8Q6.r0Z.Z4U8Q6.r0Z.', // Replace with hash for 'adminpassword'
    lastLogin: new Date().toISOString(),
  },
  {
    id: 'local_driver_example_com', // Use a local ID for seeding
    email: 'driver@example.com',
    name: 'Driver User',
    role: 'driver',
    base: 'SP',
    passwordHash: '$2a$10$8.uTjL9.eF9/jU6bW8nEwuxVq6r3q0Z4U8Q6.r0Z.Z4U8Q6.r0Z.', // Replace with hash for 'driverpassword'
    lastLogin: new Date().toISOString(),
  },
];


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
           console.error('[localDbService] IndexedDB connection error:', (event.target as IDBDatabase)?.error);
           db = null; // Reset db instance
           openDBPromise = null;
      };

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log('[localDbService] Upgrading IndexedDB...');
      const tempDb = request.result;
      const transaction = (event.target as IDBOpenDBRequest).transaction; // Get transaction for index checks

      // Vehicles Store
      let vehicleStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_VEHICLES)) {
        vehicleStore = tempDb.createObjectStore(STORE_VEHICLES, { keyPath: 'localId' });
         console.log(`[localDbService] Object store ${STORE_VEHICLES} created.`);
      } else if (transaction){
          vehicleStore = transaction.objectStore(STORE_VEHICLES);
      } else {
          console.error("[onupgradeneeded] Transaction is null for vehicles store check.");
          return;
      }
      // Ensure required indexes exist
      if (!vehicleStore.indexNames.contains('firebaseId')) vehicleStore.createIndex('firebaseId', 'firebaseId', { unique: false });
      if (!vehicleStore.indexNames.contains('syncStatus')) vehicleStore.createIndex('syncStatus', 'syncStatus', { unique: false });
      if (!vehicleStore.indexNames.contains('deleted')) vehicleStore.createIndex('deleted', 'deleted', { unique: false });

      // Trips Store
      let tripStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_TRIPS)) {
        tripStore = tempDb.createObjectStore(STORE_TRIPS, { keyPath: 'localId' });
         console.log(`[localDbService] Object store ${STORE_TRIPS} created.`);
      } else if (transaction){
           tripStore = transaction.objectStore(STORE_TRIPS);
       } else {
           console.error("[onupgradeneeded] Transaction is null for trips store check.");
           return;
       }
        // Ensure required indexes exist
       if (!tripStore.indexNames.contains('firebaseId')) tripStore.createIndex('firebaseId', 'firebaseId', { unique: false });
       if (!tripStore.indexNames.contains('userId')) tripStore.createIndex('userId', 'userId', { unique: false }); // Useful for filtering trips by user
       if (!tripStore.indexNames.contains('syncStatus')) tripStore.createIndex('syncStatus', 'syncStatus', { unique: false });
       if (!tripStore.indexNames.contains('deleted')) tripStore.createIndex('deleted', 'deleted', { unique: false });
       if (!tripStore.indexNames.contains('createdAt')) tripStore.createIndex('createdAt', 'createdAt', { unique: false }); // Useful for sorting

      // Visits Store
      let visitStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_VISITS)) {
         visitStore = tempDb.createObjectStore(STORE_VISITS, { keyPath: 'localId' });
          console.log(`[localDbService] Object store ${STORE_VISITS} created.`);
      } else if(transaction){
           visitStore = transaction.objectStore(STORE_VISITS);
       } else {
           console.error("[onupgradeneeded] Transaction is null for visits store check.");
           return;
       }
        // Ensure required indexes exist
       if (!visitStore.indexNames.contains('tripLocalId')) visitStore.createIndex('tripLocalId', 'tripLocalId', { unique: false }); // Essential for fetching visits by trip
       if (!visitStore.indexNames.contains('firebaseId')) visitStore.createIndex('firebaseId', 'firebaseId', { unique: false });
       if (!visitStore.indexNames.contains('syncStatus')) visitStore.createIndex('syncStatus', 'syncStatus', { unique: false });
       if (!visitStore.indexNames.contains('deleted')) visitStore.createIndex('deleted', 'deleted', { unique: false });
       if (!visitStore.indexNames.contains('timestamp')) visitStore.createIndex('timestamp', 'timestamp', { unique: false }); // Useful for sorting

      // Expenses Store
      let expenseStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_EXPENSES)) {
         expenseStore = tempDb.createObjectStore(STORE_EXPENSES, { keyPath: 'localId' });
          console.log(`[localDbService] Object store ${STORE_EXPENSES} created.`);
      } else if(transaction){
           expenseStore = transaction.objectStore(STORE_EXPENSES);
       } else {
            console.error("[onupgradeneeded] Transaction is null for expenses store check.");
            return;
       }
        // Ensure required indexes exist
       if (!expenseStore.indexNames.contains('tripLocalId')) expenseStore.createIndex('tripLocalId', 'tripLocalId', { unique: false }); // Essential
       if (!expenseStore.indexNames.contains('firebaseId')) expenseStore.createIndex('firebaseId', 'firebaseId', { unique: false });
       if (!expenseStore.indexNames.contains('syncStatus')) expenseStore.createIndex('syncStatus', 'syncStatus', { unique: false });
       if (!expenseStore.indexNames.contains('deleted')) expenseStore.createIndex('deleted', 'deleted', { unique: false });
       if (!expenseStore.indexNames.contains('timestamp')) expenseStore.createIndex('timestamp', 'timestamp', { unique: false }); // Useful for sorting

      // Fuelings Store
      let fuelingStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_FUELINGS)) {
         fuelingStore = tempDb.createObjectStore(STORE_FUELINGS, { keyPath: 'localId' });
          console.log(`[localDbService] Object store ${STORE_FUELINGS} created.`);
      } else if(transaction){
           fuelingStore = transaction.objectStore(STORE_FUELINGS);
       } else {
           console.error("[onupgradeneeded] Transaction is null for fuelings store check.");
           return;
       }
        // Ensure required indexes exist
       if (!fuelingStore.indexNames.contains('tripLocalId')) fuelingStore.createIndex('tripLocalId', 'tripLocalId', { unique: false }); // Essential
       if (!fuelingStore.indexNames.contains('firebaseId')) fuelingStore.createIndex('firebaseId', 'firebaseId', { unique: false });
       if (!fuelingStore.indexNames.contains('syncStatus')) fuelingStore.createIndex('syncStatus', 'syncStatus', { unique: false });
       if (!fuelingStore.indexNames.contains('deleted')) fuelingStore.createIndex('deleted', 'deleted', { unique: false });
       if (!fuelingStore.indexNames.contains('date')) fuelingStore.createIndex('date', 'date', { unique: false }); // Useful for sorting

      // Users Store
      let userStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_USERS)) {
        userStore = tempDb.createObjectStore(STORE_USERS, { keyPath: 'id' }); // Using firebase ID ('id') as key
        console.log(`[localDbService] Object store ${STORE_USERS} created.`);
      } else if(transaction){
           userStore = transaction.objectStore(STORE_USERS);
       } else {
            console.error("[onupgradeneeded] Transaction is null for users store check.");
            return;
       }
        // Ensure required indexes exist
       if (!userStore.indexNames.contains('email')) userStore.createIndex('email', 'email', { unique: true });
       if (!userStore.indexNames.contains('lastLogin')) userStore.createIndex('lastLogin', 'lastLogin', { unique: false }); // For finding latest user

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
  // Reduced logging frequency for getStore to avoid spamming console
  // console.log(`[getLocalDbStore ${getStoreStartTime}] Acquiring store: ${storeName}, mode: ${mode}`);
  return openDB().then(dbInstance => {
    try {
      const transaction = dbInstance.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const getStoreEndTime = performance.now();
      // console.log(`[getLocalDbStore ${getStoreStartTime}] Store acquired successfully. Time: ${getStoreEndTime - getStoreStartTime} ms`);

      transaction.onerror = (event) => {
           console.error(`[localDbService Transaction] Error on ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      };
      transaction.onabort = (event) => {
           console.warn(`[localDbService Transaction] Aborted on ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      };
      // transaction.oncomplete = () => {
      //      console.log(`[localDbService Transaction] Completed on ${storeName} (${mode})`);
      // };
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
    // console.log(`[addLocalRecord ${addStartTime}] Adding record to ${storeName}`, record);
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
    // console.log(`[updateLocalRecord ${updateStartTime}] Updating record in ${storeName}`, record);
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
// Potential Index: users store - 'id' (keyPath), 'email' (unique), 'lastLogin'
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

// Get user by email using the 'email' index
export const getLocalUserByEmail = (email: string): Promise<LocalUser | null> => {
    const getByEmailStartTime = performance.now();
    console.log(`[getLocalUserByEmail ${getByEmailStartTime}] Getting user with email: ${email}`);
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            if (!store.indexNames.contains('email')) {
                 console.error(`[getLocalUserByEmail ${getByEmailStartTime}] Index 'email' not found on ${STORE_USERS}. Cannot get user by email.`);
                 reject(`Index 'email' not found on ${STORE_USERS}`);
                 return;
             }
            const index = store.index('email');
            const request = index.get(email);
            request.onsuccess = () => {
                const getByEmailEndTime = performance.now();
                console.log(`[getLocalUserByEmail ${getByEmailStartTime}] User with email ${email} ${request.result ? 'found' : 'not found'}. Time: ${getByEmailEndTime - getByEmailStartTime} ms`);
                resolve(request.result as LocalUser | null);
            };
            request.onerror = () => {
                const getByEmailEndTime = performance.now();
                console.error(`[getLocalUserByEmail ${getByEmailStartTime}] Error getting user by email ${email}. Time: ${getByEmailEndTime - getByEmailStartTime} ms`, request.error);
                reject(`Error getting user by email ${email}: ${request.error?.message}`);
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
// Potential Index: vehicles store - 'localId' (keyPath), 'firebaseId', 'syncStatus', 'deleted'
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
    // If the record was synced, mark it as pending, otherwise keep its status (e.g., 'pending', 'error')
    const updatedSyncStatus = vehicle.syncStatus === 'synced' ? 'pending' : vehicle.syncStatus;
    const updatedVehicle = { ...vehicle, syncStatus: updatedSyncStatus };
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
// Potential Index: trips store - 'localId' (keyPath), 'firebaseId', 'userId', 'syncStatus', 'deleted', 'createdAt'
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
    const updatedSyncStatus = trip.syncStatus === 'synced' ? 'pending' : trip.syncStatus;
    const updatedTrip = { ...trip, syncStatus: updatedSyncStatus };
    return updateLocalRecord<LocalTrip>(STORE_TRIPS, updatedTrip);
};

export const deleteLocalTrip = (localId: string): Promise<void> => {
    console.log(`[deleteLocalTrip] Preparing to mark trip for deletion with localId: ${localId}`);
    // Before marking the trip, mark all its children for deletion too
    return Promise.all([
        markRecordForDeletion(STORE_TRIPS, localId),
        markChildrenForDeletion(STORE_VISITS, localId),
        markChildrenForDeletion(STORE_EXPENSES, localId),
        markChildrenForDeletion(STORE_FUELINGS, localId)
    ]).then(() => {
        console.log(`[deleteLocalTrip] Trip ${localId} and its children marked for deletion.`);
    }).catch(err => {
        console.error(`[deleteLocalTrip] Error marking trip ${localId} or its children for deletion:`, err);
        throw err; // Re-throw the error
    });
};

// Helper to mark child records for deletion
const markChildrenForDeletion = async (storeName: string, tripLocalId: string): Promise<void> => {
    console.log(`[markChildrenForDeletion] Marking children in ${storeName} for trip ${tripLocalId}`);
    try {
        const store = await getLocalDbStore(storeName, 'readwrite');
        if (!store.indexNames.contains('tripLocalId')) {
            console.warn(`[markChildren] Index 'tripLocalId' not found on ${storeName}. Cannot mark children.`);
            return;
        }
        const index = store.index('tripLocalId');
        let cursor: IDBCursorWithValue | null = null;
        const request = index.openCursor(IDBKeyRange.only(tripLocalId));

        return new Promise((resolve, reject) => {
             request.onerror = () => reject(request.error);
             request.onsuccess = () => {
                 cursor = request.result;
                 if (cursor) {
                     const recordToUpdate = { ...cursor.value, deleted: true, syncStatus: 'pending' as SyncStatus };
                     const updateRequest = cursor.update(recordToUpdate);
                     updateRequest.onerror = () => reject(updateRequest.error);
                     updateRequest.onsuccess = () => {
                          console.log(`[markChildren] Marked child ${cursor!.primaryKey} in ${storeName} for deletion.`);
                          cursor!.continue();
                     };
                 } else {
                      // No more items for this tripLocalId
                      resolve();
                 }
             };
        });

    } catch (error) {
        console.error(`[markChildren] Error marking children in ${storeName} for trip ${tripLocalId}:`, error);
        throw error; // Re-throw
    }
};


export const getLocalTrips = (userId?: string): Promise<LocalTrip[]> => {
    const getTripsStartTime = performance.now();
    console.log(`[getLocalTrips ${getTripsStartTime}] Fetching trips for userId: ${userId || 'all'}`);
    return getLocalDbStore(STORE_TRIPS, 'readonly').then(store => {
        return new Promise<LocalTrip[]>((resolve, reject) => {
             // Use 'userId' index if available and filtering by user
             if (userId && store.indexNames.contains('userId')) {
                 const index = store.index('userId');
                 const request = index.getAll(userId);
                 request.onsuccess = () => {
                     const results = (request.result as LocalTrip[]).filter((item: any) => !item.deleted);
                     // Sort by createdAt descending after filtering
                     results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                     const getTripsEndTime = performance.now();
                     console.log(`[getLocalTrips ${getTripsStartTime}] Found ${results.length} trips using 'userId' index. Time: ${getTripsEndTime - getTripsStartTime} ms`);
                     resolve(results);
                 };
                 request.onerror = () => {
                      const getTripsEndTime = performance.now();
                      console.error(`[getLocalTrips ${getTripsStartTime}] Error getting trips for user ${userId} using index. Time: ${getTripsEndTime - getTripsStartTime} ms`, request.error);
                      reject(`Error getting trips for user ${userId}: ${request.error?.message}`);
                 }
             } else {
                  // Fallback: Get all and filter
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     let results = getAllRequest.result as LocalTrip[];
                     if (userId) {
                         results = results.filter(item => !item.deleted && item.userId === userId);
                     } else {
                         results = results.filter(item => !item.deleted);
                     }
                     // Sort by createdAt descending
                     results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                      const getTripsEndTime = performance.now();
                      const method = userId ? 'Fallback filter' : 'getAll';
                      console.log(`[getLocalTrips ${getTripsStartTime}] ${method} complete. Found ${results.length} trips. Time: ${getTripsEndTime - getTripsStartTime} ms`);
                     resolve(results);
                 };
                 getAllRequest.onerror = () => {
                      const getTripsEndTime = performance.now();
                      console.error(`[getLocalTrips ${getTripsStartTime}] Fallback getAll failed for ${STORE_TRIPS}. Time: ${getTripsEndTime - getTripsStartTime} ms`, getAllRequest.error);
                      reject(`Fallback getAll failed for ${STORE_TRIPS}: ${getAllRequest.error?.message}`);
                 }
             }
        });
    });
};

// --- Visits ---
// Potential Index: visits store - 'localId' (keyPath), 'firebaseId', 'tripLocalId', 'syncStatus', 'deleted', 'timestamp'
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
    const updatedSyncStatus = visit.syncStatus === 'synced' ? 'pending' : visit.syncStatus;
    const updatedVisit = { ...visit, syncStatus: updatedSyncStatus };
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
             // Use 'tripLocalId' index for efficient fetching
             if (store.indexNames.contains('tripLocalId')) {
                 const index = store.index('tripLocalId');
                 const request = index.getAll(tripLocalId);
                 request.onsuccess = () => {
                     const results = (request.result as LocalVisit[]).filter(item => !item.deleted);
                     // Sort by timestamp descending
                     results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                     const getVisitsEndTime = performance.now();
                     console.log(`[getLocalVisits ${getVisitsStartTime}] Found ${results.length} visits using index. Time: ${getVisitsEndTime - getVisitsStartTime} ms`);
                     resolve(results);
                 };
                 request.onerror = () => {
                      const getVisitsEndTime = performance.now();
                      console.error(`[getLocalVisits ${getVisitsStartTime}] Error getting visits for trip ${tripLocalId} using index. Time: ${getVisitsEndTime - getVisitsStartTime} ms`, request.error);
                      reject(`Error getting visits for trip ${tripLocalId}: ${request.error?.message}`);
                 }
             } else {
                 // Fallback (less efficient)
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
             }
        });
    });
};

// --- Expenses ---
// Potential Index: expenses store - 'localId' (keyPath), 'firebaseId', 'tripLocalId', 'syncStatus', 'deleted', 'timestamp'
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
     const updatedSyncStatus = expense.syncStatus === 'synced' ? 'pending' : expense.syncStatus;
     const updatedExpense = { ...expense, syncStatus: updatedSyncStatus };
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
              // Use 'tripLocalId' index
              if (store.indexNames.contains('tripLocalId')) {
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
                       console.error(`[getLocalExpenses ${getExpensesStartTime}] Error getting expenses for trip ${tripLocalId} using index. Time: ${getExpensesEndTime - getExpensesStartTime} ms`, request.error);
                       reject(`Error getting expenses for trip ${tripLocalId}: ${request.error?.message}`);
                  }
              } else {
                 // Fallback
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
              }
         });
     });
};

// --- Fuelings ---
// Potential Index: fuelings store - 'localId' (keyPath), 'firebaseId', 'tripLocalId', 'syncStatus', 'deleted', 'date'
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
      const updatedSyncStatus = fueling.syncStatus === 'synced' ? 'pending' : fueling.syncStatus;
      const updatedFueling = { ...fueling, syncStatus: updatedSyncStatus };
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
              // Use 'tripLocalId' index
               if (store.indexNames.contains('tripLocalId')) {
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
                        console.error(`[getLocalFuelings ${getFuelingsStartTime}] Error getting fuelings for trip ${tripLocalId} using index. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`, request.error);
                        reject(`Error getting fuelings for trip ${tripLocalId}: ${request.error?.message}`);
                   }
               } else {
                  // Fallback
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
              }
          });
      });
};


// --- Sync Operations ---

// Potential Index: All stores - 'syncStatus'
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
                        firebaseId: firebaseId || request.result.firebaseId, // Keep existing firebaseId if provided one is undefined
                        ...additionalUpdates
                    };
                    // If marking as synced, ensure firebaseId is present unless it's a deleted record
                    if (status === 'synced' && !recordToUpdate.firebaseId && !recordToUpdate.deleted) {
                        console.error(`[updateSyncStatus ${updateStatusStartTime}] CRITICAL: Attempting to mark ${storeName} ${localId} as synced WITHOUT a firebaseId.`);
                        // Optionally reject or handle this case more explicitly
                         reject(`Cannot mark ${localId} as synced without firebaseId.`);
                         return;
                    }
                    const updateRequest = store.put(recordToUpdate);
                    updateRequest.onsuccess = () => {
                         const updateStatusEndTime = performance.now();
                         console.log(`[updateSyncStatus ${updateStatusStartTime}] Status updated successfully. Time: ${updateStatusEndTime - updateStatusStartTime} ms`);
                         resolve();
                    };
                    updateRequest.onerror = () => {
                         const updateStatusEndTime = performance.now();
                         console.error(`[updateSyncStatus ${updateStatusStartTime}] Error updating sync status for ${localId}. Time: ${updateStatusEndTime - updateStatusStartTime} ms`, request.error);
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
// Potential Index: All stores - 'deleted'
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
                let cursorReq = index.openCursor(IDBKeyRange.only(true));

                const processCursor = async () => {
                    let cursor: IDBCursorWithValue | null = null;
                     try {
                         cursor = await new Promise((res, rej) => {
                             cursorReq.onsuccess = () => res(cursorReq.result);
                             cursorReq.onerror = () => rej(cursorReq.error);
                         });
                     } catch (cursorError) {
                         console.error(`[Cleanup] Error opening cursor for ${storeName}:`, cursorError);
                         return; // Stop processing this store on cursor error
                     }


                    if (cursor) {
                        if (cursor.value.syncStatus === 'synced' && cursor.value.deleted === true) {
                            console.log(`[Cleanup] Deleting record ${cursor.primaryKey} from ${storeName}`);
                            const deleteReq = cursor.delete();
                             try {
                                 await new Promise<void>((resDel, rejDel) => {
                                     deleteReq.onsuccess = () => {
                                         deletedCount++;
                                         storeDeletedCount++;
                                         resDel();
                                     };
                                     deleteReq.onerror = () => rejDel(deleteReq.error);
                                 });
                             } catch (deleteError) {
                                 console.error(`[Cleanup] Error deleting record ${cursor.primaryKey} from ${storeName}:`, deleteError);
                                 // Decide whether to continue or stop on individual delete error
                             }

                        }
                        // Continue MUST be called to advance the cursor
                         try {
                             cursor.continue();
                             await processCursor(); // Recurse for the next item
                         } catch (continueError) {
                              console.error(`[Cleanup] Error continuing cursor for ${storeName}:`, continueError);
                         }

                    }
                };

                await processCursor(); // Start processing the cursor

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
