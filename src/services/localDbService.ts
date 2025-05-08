// src/services/localDbService.ts
import type { VehicleInfo } from '@/components/Vehicle';
import type { Trip } from '@/components/Trips/Trips';
import type { Visit } from '@/components/Trips/Visits';
import type { Expense } from '@/components/Trips/Expenses';
import type { Fueling as BaseFueling } from '@/components/Trips/Fuelings'; // Renamed to avoid conflict
import type { User, UserRole } from '@/contexts/AuthContext'; // Import base User type and UserRole
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import bcrypt from 'bcryptjs'; // Import bcrypt for password hashing
import type { DateRange } from 'react-day-picker';
import { parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';


const DB_NAME = 'RotaCertaDB';
const DB_VERSION = 4; // Increment version for new index on fuelings (fuelType)

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

export type LocalVehicle = Omit<VehicleInfo & { id: string }, 'id'> & LocalRecord & { localId: string; id?: string };
export type LocalTrip = Omit<Trip, 'id'> & LocalRecord & { localId: string; id?: string };
export type LocalVisit = Omit<Visit, 'id'> & LocalRecord & { localId: string; tripLocalId: string; id?: string };
export type LocalExpense = Omit<Expense, 'id'> & LocalRecord & { localId: string; tripLocalId: string; id?: string };
// Update LocalFueling to include odometerKm and fuelType
export type LocalFueling = Omit<BaseFueling, 'id'> & LocalRecord & { localId: string; tripLocalId: string; odometerKm: number; fuelType: string; id?: string };
export type LocalUser = User & { lastLogin?: string; passwordHash?: string; };

const seedUsersData: (Omit<LocalUser, 'passwordHash' | 'lastLogin'> & {password: string})[] = [
  // Admin users
  {
    id: 'admin@grupo2irmaos.com.br',
    email: 'admin@grupo2irmaos.com.br',
    name: 'Admin Grupo 2 Irmãos',
    username: 'admin',
    role: 'admin',
    base: 'ALL',
    password: 'admin123',
  },
  {
    id: 'grupo2irmaos@grupo2irmaos.com.br', // From image, interpreted as admin
    email: 'grupo2irmaos@grupo2irmaos.com.br',
    name: 'Joao (Admin Imagem)', // Clarify name origin
    username: 'grupo2irmaos',
    role: 'admin',
    base: 'ALL',
    password: '1', // Password from image
  },
  // Original Drivers from previous seed
  {
    id: 'jose.patrial@grupo2irmaos.com.br',
    email: 'jose.patrial@grupo2irmaos.com.br',
    name: 'Jose Patrial',
    username: 'jose.patrial',
    role: 'driver',
    base: 'PR',
    password: '123456',
   },
   {
    id: 'fernando.rocha@grupo2irmaos.com.br',
    email: 'fernando.rocha@grupo2irmaos.com.br',
    name: 'Fernando Rocha',
    username: 'fernando.rocha',
    role: 'driver',
    base: 'SP',
    password: '123456',
   },
   // New Drivers from the image
   {
    id: 'patrial2020@icloud.com',
    email: 'patrial2020@icloud.com',
    name: 'Jose (Imagem)',
    username: 'patrial2020',
    role: 'driver',
    base: 'SP', // Default base for new image users
    password: '1',
  },
  {
    id: 'fernandobatista@gmail.com',
    email: 'fernandobatista@gmail.com',
    name: 'Fernando (Imagem)',
    username: 'fernandobatista',
    role: 'driver',
    base: 'SP',
    password: '1234',
  },
  {
    id: 'compras@grupo2irmaos.com.br',
    email: 'compras@grupo2irmaos.com.br',
    name: 'Eliseu',
    username: 'compras',
    role: 'driver',
    base: 'SP',
    password: '1',
  },
  {
    id: 'otadio.medina@grupo2irmaos.com.br',
    email: 'otadio.medina@grupo2irmaos.com.br',
    name: 'Otavio',
    username: 'otadio.medina',
    role: 'driver',
    base: 'SP',
    password: '1',
  },
  {
    id: 'adao.timoteo@grupo2irmaos.com.br',
    email: 'adao.timoteo@grupo2irmaos.com.br',
    name: 'Adao',
    username: 'adao.timoteo',
    role: 'driver',
    base: 'SP',
    password: '1',
  },
  {
    id: 'luan.menon@grupo2irmaos.com.br',
    email: 'luan.menon@grupo2irmaos.com.br',
    name: 'Luan',
    username: 'luan.menon',
    role: 'driver',
    base: 'SP',
    password: '1',
  },
  {
    id: 'alessandro.neves@grupo2irmaos.com.br',
    email: 'alessandro.neves@grupo2irmaos.com.br',
    name: 'Alessandro',
    username: 'alessandro.neves',
    role: 'driver',
    base: 'SP',
    password: '1',
  },
  {
    id: 'aguinaldo@grupo2irmaos.com.br',
    email: 'aguinaldo@grupo2irmaos.com.br',
    name: 'aguinaldo',
    username: 'aguinaldo',
    role: 'driver',
    base: 'SP',
    password: '1',
  },
  {
    id: 'bruno@grupo2irmaos.com.br',
    email: 'bruno@grupo2irmaos.com.br',
    name: 'Bruno',
    username: 'bruno',
    role: 'driver',
    base: 'SP',
    password: '1',
  },
  {
    id: 'nelson.lopes@grupo2irmaos.com.br',
    email: 'nelson.lopes@grupo2irmaos.com.br',
    name: 'nelson',
    username: 'nelson.lopes',
    role: 'driver',
    base: 'SP',
    password: '1',
  },
];


let db: IDBDatabase | null = null;
let openDBPromise: Promise<IDBDatabase> | null = null;


export const openDB = (): Promise<IDBDatabase> => {
  if (db) {
    return Promise.resolve(db);
  }
  if (openDBPromise) {
      console.log('[localDbService] DB opening already in progress, returning existing promise.');
      return openDBPromise;
  }

  openDBPromise = new Promise((resolve, reject) => {
    console.log(`[localDbService] Opening DB ${DB_NAME} version ${DB_VERSION}`);
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('[localDbService] IndexedDB error:', request.error);
      openDBPromise = null;
      reject(`Error opening IndexedDB: ${request.error?.message}`);
    };

    request.onsuccess = (event) => {
      db = request.result;
      console.log('[localDbService] IndexedDB opened successfully');

      db.onclose = () => {
          console.warn('[localDbService] IndexedDB connection closed unexpectedly.');
          db = null;
          openDBPromise = null;
      };
      db.onerror = (event) => {
           console.error('[localDbService] IndexedDB connection error:', (event.target as IDBDatabase)?.error);
           db = null;
           openDBPromise = null;
      };

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log('[localDbService] Upgrading IndexedDB...');
      const tempDb = request.result;
      const transaction = (event.target as IDBOpenDBRequest).transaction;

      if (!transaction) {
           console.error("[onupgradeneeded] Upgrade transaction is null. Cannot proceed.");
           request.onerror = () => reject("Upgrade transaction failed.");
           return;
       }

      let vehicleStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_VEHICLES)) {
        vehicleStore = tempDb.createObjectStore(STORE_VEHICLES, { keyPath: 'localId' });
         console.log(`[localDbService] Object store ${STORE_VEHICLES} created.`);
      } else {
          vehicleStore = transaction.objectStore(STORE_VEHICLES);
      }
      if (!vehicleStore.indexNames.contains('firebaseId')) vehicleStore.createIndex('firebaseId', 'firebaseId', { unique: false });
      if (!vehicleStore.indexNames.contains('syncStatus')) vehicleStore.createIndex('syncStatus', 'syncStatus', { unique: false });
      if (!vehicleStore.indexNames.contains('deleted')) vehicleStore.createIndex('deleted', 'deleted', { unique: false });

      let tripStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_TRIPS)) {
        tripStore = tempDb.createObjectStore(STORE_TRIPS, { keyPath: 'localId' });
         console.log(`[localDbService] Object store ${STORE_TRIPS} created.`);
      } else {
           tripStore = transaction.objectStore(STORE_TRIPS);
       }
       if (!tripStore.indexNames.contains('firebaseId')) tripStore.createIndex('firebaseId', 'firebaseId', { unique: false });
       if (!tripStore.indexNames.contains('userId')) tripStore.createIndex('userId', 'userId', { unique: false });
       if (!tripStore.indexNames.contains('syncStatus')) tripStore.createIndex('syncStatus', 'syncStatus', { unique: false });
       if (!tripStore.indexNames.contains('deleted')) tripStore.createIndex('deleted', 'deleted', { unique: false });
       if (!tripStore.indexNames.contains('createdAt')) tripStore.createIndex('createdAt', 'createdAt', { unique: false });

      let visitStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_VISITS)) {
         visitStore = tempDb.createObjectStore(STORE_VISITS, { keyPath: 'localId' });
          console.log(`[localDbService] Object store ${STORE_VISITS} created.`);
      } else {
           visitStore = transaction.objectStore(STORE_VISITS);
       }
       if (!visitStore.indexNames.contains('tripLocalId')) visitStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
       if (!visitStore.indexNames.contains('firebaseId')) visitStore.createIndex('firebaseId', 'firebaseId', { unique: false });
       if (!visitStore.indexNames.contains('syncStatus')) visitStore.createIndex('syncStatus', 'syncStatus', { unique: false });
       if (!visitStore.indexNames.contains('deleted')) visitStore.createIndex('deleted', 'deleted', { unique: false });
       if (!visitStore.indexNames.contains('timestamp')) visitStore.createIndex('timestamp', 'timestamp', { unique: false });

      let expenseStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_EXPENSES)) {
         expenseStore = tempDb.createObjectStore(STORE_EXPENSES, { keyPath: 'localId' });
          console.log(`[localDbService] Object store ${STORE_EXPENSES} created.`);
      } else {
           expenseStore = transaction.objectStore(STORE_EXPENSES);
       }
       if (!expenseStore.indexNames.contains('tripLocalId')) expenseStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
       if (!expenseStore.indexNames.contains('firebaseId')) expenseStore.createIndex('firebaseId', 'firebaseId', { unique: false });
       if (!expenseStore.indexNames.contains('syncStatus')) expenseStore.createIndex('syncStatus', 'syncStatus', { unique: false });
       if (!expenseStore.indexNames.contains('deleted')) expenseStore.createIndex('deleted', 'deleted', { unique: false });
       if (!expenseStore.indexNames.contains('timestamp')) expenseStore.createIndex('timestamp', 'timestamp', { unique: false });

      let fuelingStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_FUELINGS)) {
         fuelingStore = tempDb.createObjectStore(STORE_FUELINGS, { keyPath: 'localId' });
          console.log(`[localDbService] Object store ${STORE_FUELINGS} created.`);
      } else {
           fuelingStore = transaction.objectStore(STORE_FUELINGS);
       }
       if (!fuelingStore.indexNames.contains('tripLocalId')) fuelingStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
       if (!fuelingStore.indexNames.contains('firebaseId')) fuelingStore.createIndex('firebaseId', 'firebaseId', { unique: false });
       if (!fuelingStore.indexNames.contains('syncStatus')) fuelingStore.createIndex('syncStatus', 'syncStatus', { unique: false });
       if (!fuelingStore.indexNames.contains('deleted')) fuelingStore.createIndex('deleted', 'deleted', { unique: false });
       if (!fuelingStore.indexNames.contains('date')) fuelingStore.createIndex('date', 'date', { unique: false });
       if (!fuelingStore.indexNames.contains('vehicleId')) fuelingStore.createIndex('vehicleId', 'vehicleId', { unique: false });
       if (!fuelingStore.indexNames.contains('odometerKm')) fuelingStore.createIndex('odometerKm', 'odometerKm', { unique: false });
       if (!fuelingStore.indexNames.contains('fuelType')) fuelingStore.createIndex('fuelType', 'fuelType', { unique: false }); // Add index for fuelType


      let userStore: IDBObjectStore;
      if (!tempDb.objectStoreNames.contains(STORE_USERS)) {
        userStore = tempDb.createObjectStore(STORE_USERS, { keyPath: 'id' });
        console.log(`[localDbService] Object store ${STORE_USERS} created.`);
      } else {
           userStore = transaction.objectStore(STORE_USERS);
       }
       if (!userStore.indexNames.contains('email')) userStore.createIndex('email', 'email', { unique: true });
       if (!userStore.indexNames.contains('lastLogin')) userStore.createIndex('lastLogin', 'lastLogin', { unique: false });
       if (!userStore.indexNames.contains('role')) userStore.createIndex('role', 'role', { unique: false });

      console.log('[localDbService] IndexedDB upgrade complete');
    };

     request.onblocked = (event) => {
          console.warn("[localDbService] IndexedDB open request blocked. Please close other tabs using this database.", event);
          openDBPromise = null;
          reject("IndexedDB blocked, please close other tabs.");
     };
  });
  return openDBPromise;
};


export const getLocalDbStore = (storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> => {
  const getStoreStartTime = performance.now();
  return openDB().then(dbInstance => {
    try {
      const transaction = dbInstance.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const getStoreEndTime = performance.now();
      transaction.onerror = (event) => {
           console.error(`[localDbService Transaction] Error on ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      };
      transaction.onabort = (event) => {
           console.warn(`[localDbService Transaction] Aborted on ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      };
      return store;
     } catch (error) {
         const getStoreEndTime = performance.now();
         console.error(`[getLocalDbStore ${getStoreStartTime}] Error acquiring store ${storeName} (${mode}). Time: ${getStoreEndTime - getStoreStartTime} ms`, error);
         throw error;
     }
  });
};

export const addLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<string> => {
    const addStartTime = performance.now();
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

export const updateLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<void> => {
    const updateStartTime = performance.now();
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
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

export const getLocalRecordsByRole = <T extends { role: UserRole }>(role: UserRole): Promise<T[]> => {
    const getByRoleStartTime = performance.now();
    console.log(`[getLocalRecordsByRole ${getByRoleStartTime}] Getting users from ${STORE_USERS} with role: ${role}`);
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            if (!store.indexNames.contains('role')) {
                console.warn(`[getLocalRecordsByRole ${getByRoleStartTime}] Index 'role' not found on ${STORE_USERS}. Fetching all and filtering.`);
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    const allRecords = getAllRequest.result as T[];
                    const filtered = allRecords.filter(item => !(item as any).deleted && item.role === role);
                    const getByRoleEndTime = performance.now();
                    console.log(`[getLocalRecordsByRole ${getByRoleStartTime}] Fallback filter complete. Found ${filtered.length} records. Time: ${getByRoleEndTime - getByRoleStartTime} ms`);
                    resolve(filtered);
                };
                getAllRequest.onerror = () => {
                    const getByRoleEndTime = performance.now();
                    console.error(`[getLocalRecordsByRole ${getByRoleStartTime}] Fallback getAll failed for ${STORE_USERS}. Time: ${getByRoleEndTime - getByRoleStartTime} ms`, getAllRequest.error);
                    reject(`Fallback getAll failed for ${STORE_USERS}: ${getAllRequest.error?.message}`);
                };
                return;
            }

            const index = store.index('role');
            const request = index.getAll(role);
            request.onsuccess = () => {
                const results = (request.result as T[]).filter(item => !(item as any).deleted);
                const getByRoleEndTime = performance.now();
                console.log(`[getLocalRecordsByRole ${getByRoleStartTime}] Got ${results.length} records successfully using index. Time: ${getByRoleEndTime - getByRoleStartTime} ms`);
                resolve(results);
            };
            request.onerror = () => {
                const getByRoleEndTime = performance.now();
                console.error(`[getLocalRecordsByRole ${getByRoleStartTime}] Error getting records by role ${role} from ${STORE_USERS}:`, request.error);
                reject(`Error getting records by role ${role}: ${request.error?.message}`);
            };
        });
    });
};


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
            const request = store.put(user);
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

export const addLocalVehicle = (vehicle: Omit<VehicleInfo, 'id'>): Promise<string> => {
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


export const addLocalTrip = (trip: Omit<LocalTrip, 'localId' | 'syncStatus' | 'id'>): Promise<string> => {
    const localId = `local_trip_${uuidv4()}`;
    const newLocalTrip: LocalTrip = {
      ...trip,
      localId,
      id: localId,
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
    return Promise.all([
        markRecordForDeletion(STORE_TRIPS, localId),
        markChildrenForDeletion(STORE_VISITS, localId),
        markChildrenForDeletion(STORE_EXPENSES, localId),
        markChildrenForDeletion(STORE_FUELINGS, localId)
    ]).then(() => {
        console.log(`[deleteLocalTrip] Trip ${localId} and its children marked for deletion.`);
    }).catch(err => {
        console.error(`[deleteLocalTrip] Error marking trip ${localId} or its children for deletion:`, err);
        throw err;
    });
};

const markChildrenForDeletion = async (storeName: string, tripLocalId: string): Promise<void> => {
    console.log(`[markChildrenForDeletion] Marking children in ${storeName} for trip ${tripLocalId}`);
    try {
        const store = await getLocalDbStore(storeName, 'readwrite');
        if (!store.indexNames.contains('tripLocalId')) {
            console.warn(`[markChildren] Index 'tripLocalId' not found on ${storeName}. Cannot mark children.`);
            return;
        }
        const index = store.index('tripLocalId');
        let cursorReq = index.openCursor(IDBKeyRange.only(tripLocalId));

        return new Promise<void>((resolve, reject) => {
             const transaction = store.transaction;

             transaction.onerror = (event) => reject((event.target as IDBRequest).error);
             transaction.oncomplete = () => resolve();

             cursorReq.onerror = (event) => reject((event.target as IDBRequest).error);
             cursorReq.onsuccess = (event) => {
                 const cursor = (event.target as IDBRequest).result;
                 if (cursor) {
                     try {
                              const recordToUpdate = { ...cursor.value, deleted: true, syncStatus: 'pending' as SyncStatus };
                              const updateRequest = cursor.update(recordToUpdate);
                              updateRequest.onerror = (errEvent) => {
                                  console.error(`[markChildren] Error updating child ${cursor.primaryKey} in ${storeName}:`, (errEvent.target as IDBRequest).error);
                              };
                              console.log(`[markChildren] Marked child ${cursor.primaryKey} in ${storeName} for deletion.`);
                     } catch (error) {
                              console.error(`[markChildren] Error processing cursor value for ${cursor.primaryKey} in ${storeName}:`, error);
                              if(transaction.abort){
                                transaction.abort();
                              } else {
                                console.warn("[markChildren] Transaction abort not available on this IDBTransaction object.");
                              }
                         }
                         cursor.continue();
                 }
             };
        });
    } catch (error) {
        console.error(`[markChildren] Error marking children in ${storeName} for trip ${tripLocalId}:`, error);
        throw error;
    }
};


export const getLocalTrips = (userId?: string, dateRange?: DateRange): Promise<LocalTrip[]> => {
    const getTripsStartTime = performance.now();
    console.log(`[getLocalTrips ${getTripsStartTime}] Fetching trips for userId: ${userId || 'all'}, dateRange:`, dateRange);
    return getLocalDbStore(STORE_TRIPS, 'readonly').then(store => {
        return new Promise<LocalTrip[]>((resolve, reject) => {
            const processResults = (allRecords: LocalTrip[]) => {
                let filteredRecords = allRecords.filter(item => !item.deleted);

                if (userId) {
                    filteredRecords = filteredRecords.filter(item => item.userId === userId);
                }

                if (dateRange?.from) {
                    const startDate = startOfDay(dateRange.from);
                    const endDate = dateRange.to ? endOfDay(dateRange.to) : new Date(8640000000000000); // Far future date if 'to' is not set
                    const interval = { start: startDate, end: endDate };

                    filteredRecords = filteredRecords.filter(trip => {
                        try {
                            const tripCreatedAt = parseISO(trip.createdAt);
                            return isWithinInterval(tripCreatedAt, interval);
                        } catch (e) {
                            console.warn(`Could not parse createdAt for trip ${trip.localId}:`, trip.createdAt, e);
                            return false;
                        }
                    });
                }

                filteredRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                const getTripsEndTime = performance.now();
                console.log(`[getLocalTrips ${getTripsStartTime}] Processed ${filteredRecords.length} trips. Time: ${getTripsEndTime - getTripsStartTime} ms`);
                resolve(filteredRecords);
            };

            if (userId && store.indexNames.contains('userId')) {
                const index = store.index('userId');
                const request = index.getAll(userId);
                request.onsuccess = () => processResults(request.result as LocalTrip[]);
                request.onerror = () => {
                    const getTripsEndTime = performance.now();
                    console.error(`[getLocalTrips ${getTripsStartTime}] Error getting trips for user ${userId} using index. Time: ${getTripsEndTime - getTripsStartTime} ms`, request.error);
                    reject(`Error getting trips for user ${userId}: ${request.error?.message}`);
                };
            } else {
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => processResults(getAllRequest.result as LocalTrip[]);
                getAllRequest.onerror = () => {
                    const getTripsEndTime = performance.now();
                    console.error(`[getLocalTrips ${getTripsStartTime}] Fallback getAll failed for ${STORE_TRIPS}. Time: ${getTripsEndTime - getTripsStartTime} ms`, getAllRequest.error);
                    reject(`Fallback getAll failed for ${STORE_TRIPS}: ${getAllRequest.error?.message}`);
                };
            }
        });
    });
};

export const getLocalVisits = (tripLocalId?: string): Promise<LocalVisit[]> => {
     const getVisitsStartTime = performance.now();
     console.log(`[getLocalVisits ${getVisitsStartTime}] Fetching visits for tripLocalId: ${tripLocalId || 'all'}`);
    return getLocalDbStore(STORE_VISITS, 'readonly').then(store => {
        return new Promise<LocalVisit[]>((resolve, reject) => {
            if (tripLocalId && store.indexNames.contains('tripLocalId')) {
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
                      console.error(`[getLocalVisits ${getVisitsStartTime}] Error getting visits for trip ${tripLocalId} using index. Time: ${getVisitsEndTime - getVisitsStartTime} ms`, request.error);
                      reject(`Error getting visits for trip ${tripLocalId}: ${request.error?.message}`);
                 }
             } else {
                 console.log(`[getLocalVisits ${getVisitsStartTime}] Fetching all visits (index 'tripLocalId' not used or tripLocalId not provided).`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                    let allRecords = getAllRequest.result as LocalVisit[];
                     if (tripLocalId) {
                         allRecords = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     } else {
                         allRecords = allRecords.filter(item => !item.deleted);
                     }
                     allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                     const getVisitsEndTime = performance.now();
                     console.log(`[getLocalVisits ${getVisitsStartTime}] Fallback/All filter complete. Found ${allRecords.length} visits. Time: ${getVisitsEndTime - getVisitsStartTime} ms`);
                     resolve(allRecords);
                  };
                  getAllRequest.onerror = () => {
                       const getVisitsEndTime = performance.now();
                       console.error(`[getLocalVisits ${getVisitsStartTime}] Fallback/All getAll failed for ${STORE_VISITS}. Time: ${getVisitsEndTime - getVisitsStartTime} ms`, getAllRequest.error);
                       reject(`Fallback/All getAll failed for ${STORE_VISITS}: ${getAllRequest.error?.message}`);
                  }
              }
         });
     });
};

export const addLocalVisit = (visit: Omit<LocalVisit, 'localId' | 'syncStatus' | 'id'>): Promise<string> => {
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


export const getLocalExpenses = (tripLocalId?: string): Promise<LocalExpense[]> => {
     const getExpensesStartTime = performance.now();
      console.log(`[getLocalExpenses ${getExpensesStartTime}] Fetching expenses for tripLocalId: ${tripLocalId || 'all'}`);
     return getLocalDbStore(STORE_EXPENSES, 'readonly').then(store => {
         return new Promise<LocalExpense[]>((resolve, reject) => {
            if (tripLocalId && store.indexNames.contains('tripLocalId')) {
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
                 console.log(`[getLocalExpenses ${getExpensesStartTime}] Fetching all expenses (index 'tripLocalId' not used or tripLocalId not provided).`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                    let allRecords = getAllRequest.result as LocalExpense[];
                     if (tripLocalId) {
                         allRecords = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     } else {
                         allRecords = allRecords.filter(item => !item.deleted);
                     }
                     allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                     const getExpensesEndTime = performance.now();
                     console.log(`[getLocalExpenses ${getExpensesStartTime}] Fallback/All filter complete. Found ${allRecords.length} expenses. Time: ${getExpensesEndTime - getExpensesStartTime} ms`);
                     resolve(allRecords);
                  };
                  getAllRequest.onerror = () => {
                       const getExpensesEndTime = performance.now();
                       console.error(`[getLocalExpenses ${getExpensesStartTime}] Fallback/All getAll failed for ${STORE_EXPENSES}. Time: ${getExpensesEndTime - getExpensesStartTime} ms`, getAllRequest.error);
                       reject(`Fallback/All getAll failed for ${STORE_EXPENSES}: ${getAllRequest.error?.message}`);
                  }
              }
         });
     });
};

export const addLocalExpense = (expense: Omit<LocalExpense, 'localId' | 'syncStatus' | 'id'>): Promise<string> => {
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


export const getLocalFuelings = (tripLocalIdOrVehicleId?: string, filterBy: 'tripLocalId' | 'vehicleId' = 'tripLocalId'): Promise<LocalFueling[]> => {
       const getFuelingsStartTime = performance.now();
       console.log(`[getLocalFuelings ${getFuelingsStartTime}] Fetching fuelings for ${filterBy}: ${tripLocalIdOrVehicleId || 'all'}`);
      return getLocalDbStore(STORE_FUELINGS, 'readonly').then(store => {
          return new Promise<LocalFueling[]>((resolve, reject) => {
                if (tripLocalIdOrVehicleId && store.indexNames.contains(filterBy)) {
                   const index = store.index(filterBy);
                   const request = index.getAll(tripLocalIdOrVehicleId);
                   request.onsuccess = () => {
                       const results = (request.result as LocalFueling[]).filter(item => !item.deleted);
                       results.sort((a, b) => {
                            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
                            if (dateDiff !== 0) return dateDiff;
                            return b.odometerKm - a.odometerKm;
                       });
                       const getFuelingsEndTime = performance.now();
                       console.log(`[getLocalFuelings ${getFuelingsStartTime}] Found ${results.length} fuelings using index ${filterBy}. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`);
                       resolve(results);
                   };
                   request.onerror = () => {
                        const getFuelingsEndTime = performance.now();
                        console.error(`[getLocalFuelings ${getFuelingsStartTime}] Error getting fuelings for ${filterBy} ${tripLocalIdOrVehicleId} using index. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`, request.error);
                        reject(`Error getting fuelings for ${filterBy} ${tripLocalIdOrVehicleId}: ${request.error?.message}`);
                   }
               } else {
                  console.log(`[getLocalFuelings ${getFuelingsStartTime}] Fetching all fuelings (index '${filterBy}' not used or ID not provided).`);
                  const getAllRequest = store.getAll();
                  getAllRequest.onsuccess = () => {
                     let allRecords = getAllRequest.result as LocalFueling[];
                     if (tripLocalIdOrVehicleId) {
                         allRecords = allRecords.filter(item => !item.deleted && item[filterBy] === tripLocalIdOrVehicleId);
                     } else {
                         allRecords = allRecords.filter(item => !item.deleted);
                     }
                      allRecords.sort((a, b) => {
                            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
                            if (dateDiff !== 0) return dateDiff;
                            return b.odometerKm - a.odometerKm;
                       });
                     const getFuelingsEndTime = performance.now();
                     console.log(`[getLocalFuelings ${getFuelingsStartTime}] Fallback/All filter complete. Found ${allRecords.length} fuelings. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`);
                     resolve(allRecords);
                  };
                  getAllRequest.onerror = () => {
                       const getFuelingsEndTime = performance.now();
                       console.error(`[getLocalFuelings ${getFuelingsStartTime}] Fallback/All getAll failed for ${STORE_FUELINGS}. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`, getAllRequest.error);
                       reject(`Fallback/All getAll failed for ${STORE_FUELINGS}: ${getAllRequest.error?.message}`);
                  }
              }
          });
      });
};

export const addLocalFueling = (fueling: Omit<LocalFueling, 'localId' | 'syncStatus' | 'id'>): Promise<string> => {
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
        return { trips: [], visits: [], expenses: [], fuelings: [], vehicles: [] };
    }
};

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
                    if (status === 'synced' && !recordToUpdate.firebaseId && !recordToUpdate.deleted) {
                        console.error(`[updateSyncStatus ${updateStatusStartTime}] CRITICAL: Attempting to mark ${storeName} ${localId} as synced WITHOUT a firebaseId.`);
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

export const cleanupDeletedRecords = async (): Promise<void> => {
    console.log("[cleanupDeletedRecords] Starting cleanup...");
    const stores = [STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES, STORE_USERS];
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

                const transaction = store.transaction;
                transaction.oncomplete = () => {
                    console.log(`[Cleanup] Finished store ${storeName}. Deleted ${storeDeletedCount} records.`);
                    resolveStore();
                };
                transaction.onerror = (event) => rejectStore((event.target as IDBRequest).error);
                transaction.onabort = (event) => rejectStore((event.target as IDBTransaction).error || new Error("Transaction aborted"));

                cursorReq.onerror = (event: Event) => rejectStore((event.target as IDBRequest).error);
                cursorReq.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                         try {
                              if (cursor.value.syncStatus === 'synced' && cursor.value.deleted === true) {
                                  console.log(`[Cleanup] Deleting record ${cursor.primaryKey} from ${storeName}`);
                                  const deleteReq = cursor.delete();
                                  deleteReq.onerror = (errEvent) => {
                                      console.error(`[Cleanup] Error deleting record ${cursor.primaryKey} from ${storeName}:`, (errEvent.target as IDBRequest).error);
                                  };
                                  deletedCount++;
                                  storeDeletedCount++;
                              }
                         } catch (error) {
                              console.error(`[Cleanup] Error processing cursor value for ${cursor.primaryKey} in ${storeName}:`, error);
                              if (transaction.abort) {
                                transaction.abort();
                              }
                         }
                         cursor.continue();
                    }
                };

            } catch (error) {
                 console.error(`[Cleanup] Error during setup for store ${storeName}:`, error);
                 rejectStore(error);
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

export const seedInitialUsers = async () => {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(STORE_USERS, 'readwrite');
    const store = transaction.objectStore(STORE_USERS);

    const transactionCompletePromise = new Promise<void>((resolveTx, rejectTx) => {
        transaction.oncomplete = () => {
            console.log("[seedInitialUsers] Transaction completed.");
            resolveTx();
        };
        transaction.onerror = (event) => {
            console.error("[seedInitialUsers] Transaction error:", (event.target as IDBTransaction).error);
            rejectTx((event.target as IDBTransaction).error);
        };
        transaction.onabort = (event) => {
            console.warn("[seedInitialUsers] Transaction aborted:", (event.target as IDBTransaction).error);
            rejectTx((event.target as IDBTransaction).error || new Error("Seed transaction aborted"));
        };
    });

    try {
        const countReq = store.count();
        const count = await new Promise<number>((res, rej) => {
            countReq.onsuccess = () => res(countReq.result);
            countReq.onerror = () => rej(countReq.error);
        });

        if (count === 0) {
            console.log("[seedInitialUsers] Seeding initial users...");
            const hashPromises = seedUsersData.map(async (user) => {
                const hash = await bcrypt.hash(user.password, 10);
                const { password, ...userData } = user;
                // Ensure role and base are correctly assigned from seedUsersData
                const finalUserData: LocalUser = {
                    ...userData,
                    id: user.id || user.email, // Use email as ID if id is not present
                    passwordHash: hash,
                    lastLogin: new Date().toISOString(),
                    role: user.role || 'driver', // Default to 'driver' if not specified
                    base: user.role === 'admin' ? 'ALL' : (user.base || 'N/A') // Default base for non-admins
                };
                return finalUserData;
            });
            const usersToSeed = await Promise.all(hashPromises);

            usersToSeed.forEach(user => {
                const addReq = store.add(user);
                addReq.onerror = () => {
                    console.error(`[seedInitialUsers] Error adding user ${user.email} in transaction:`, addReq.error);
                };
                addReq.onsuccess = () => {
                    console.log(`[seedInitialUsers] User ${user.email} added to store.`);
                };
            });
            console.log("[seedInitialUsers] All add requests issued within transaction.");
        } else {
            console.log("[seedInitialUsers] User store not empty, skipping seed.");
        }
        await transactionCompletePromise;
        console.log("[seedInitialUsers] Seeding process/check finished.");

    } catch (error) {
        console.error("[seedInitialUsers] Error during seeding process:", error);
        if (transaction && transaction.abort && transaction.readyState !== 'done') {
            console.warn("[seedInitialUsers] Aborting transaction due to error.");
            transaction.abort();
        }
        throw error;
    }
};


// Initial call to open the DB and seed users when the service loads
openDB().then(() => seedInitialUsers()).catch(error => console.error("Failed to initialize/seed IndexedDB on load:", error));

