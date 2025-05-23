/src/services/localDbService.ts
// src/services/localDbService.ts
import type { VehicleInfo } from '@/components/Vehicle';
import type { Trip } from '@/components/Trips/Trips';
import type { Visit as BaseVisit } from '@/components/Trips/Visits';
import type { Expense as BaseExpense } from '@/components/Trips/Expenses';
import type { Fueling as BaseFueling } from '@/components/Trips/Fuelings';
import type { User, UserRole } from '@/contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import type { DateRange } from 'react-day-picker';
import { parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';


const DB_NAME = 'RotaCertaDB';
const DB_VERSION = 7; // Incremented if schema changes

export const STORE_VEHICLES = 'vehicles';
export const STORE_TRIPS = 'trips';
export const STORE_VISITS = 'visits';
export const STORE_EXPENSES = 'expenses';
export const STORE_FUELINGS = 'fuelings';
export const STORE_USERS = 'users';
export const STORE_VISIT_TYPES = 'visitTypesStore';
export const STORE_EXPENSE_TYPES = 'expenseTypesStore';


export type SyncStatus = 'pending' | 'synced' | 'error';

export interface LocalRecord { // Base interface for all local records
  syncStatus: SyncStatus;
  firebaseId?: string;
  deleted?: boolean;
  // localId is typically the keyPath, so often not explicitly in the object's type
}

export type LocalVehicle = Omit<VehicleInfo & { id: string }, 'id'> & LocalRecord & { localId: string; id?: string };
export type LocalTrip = Omit<Trip, 'id'> & LocalRecord & { localId: string; id?: string };
export type LocalVisit = Omit<BaseVisit, 'id'> & LocalRecord & { localId: string; tripLocalId: string; userId: string; id?: string; visitType?: string; };
export type LocalExpense = Omit<BaseExpense, 'id'> & LocalRecord & { localId: string; tripLocalId: string; userId: string; id?: string };
export type LocalFueling = Omit<BaseFueling, 'id'> & LocalRecord & { localId: string; tripLocalId: string; userId: string; odometerKm: number; fuelType: string; id?: string };
export type LocalUser = User & LocalRecord & { localId?: string; id: string; lastLogin?: string; passwordHash?: string; username?: string; deleted?: boolean; firebaseId?: string };

export interface CustomType extends LocalRecord {
  localId: string;
  id?: string; // Can be same as localId if no firebaseId yet
  name: string;
}


const seedUsersData: (Omit<LocalUser, 'passwordHash' | 'lastLogin' | 'deleted' | 'firebaseId' | 'syncStatus' | 'localId'> & {password: string})[] = [
  {
    id: 'admin@grupo2irmaos.com.br', // This will be the primary key
    email: 'admin@grupo2irmaos.com.br',
    name: 'Admin Grupo 2 Irmãos',
    username: 'admin_g2i',
    role: 'admin',
    base: 'ALL',
    password: 'admin123',
  },
  {
    id: 'grupo2irmaos@grupo2irmaos.com.br',
    email: 'grupo2irmaos@grupo2irmaos.com.br',
    name: 'Grupo 2 Irmãos Admin',
    username: 'grupo2irmaos_admin',
    role: 'admin',
    base: 'ALL',
    password: 'password1',
  },
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
  {
    id: 'patrial2020@icloud.com',
    email: 'patrial2020@icloud.com',
    name: 'Jose Silva (Imagem)',
    username: 'patrial2020',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
  {
    id: 'fernandobatista@gmail.com',
    email: 'fernandobatista@gmail.com',
    name: 'Fernando Batista (Imagem)',
    username: 'fernandobatista_gmail',
    role: 'driver',
    base: 'SP',
    password: 'password1234',
  },
  {
    id: 'compras@grupo2irmaos.com.br',
    email: 'compras@grupo2irmaos.com.br',
    name: 'Eliseu Compras',
    username: 'compras_g2i',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
  {
    id: 'otavio.medina@grupo2irmaos.com.br',
    email: 'otavio.medina@grupo2irmaos.com.br',
    name: 'Otavio Medina',
    username: 'otavio.medina',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
  {
    id: 'adao.timoteo@grupo2irmaos.com.br',
    email: 'adao.timoteo@grupo2irmaos.com.br',
    name: 'Adao Timoteo',
    username: 'adao.timoteo',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
  {
    id: 'luan.menon@grupo2irmaos.com.br',
    email: 'luan.menon@grupo2irmaos.com.br',
    name: 'Luan Menon',
    username: 'luan.menon',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
  {
    id: 'alessandro.neves@grupo2irmaos.com.br',
    email: 'alessandro.neves@grupo2irmaos.com.br',
    name: 'Alessandro Neves',
    username: 'alessandro.neves',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
  {
    id: 'aguinaldo@grupo2irmaos.com.br',
    email: 'aguinaldo@grupo2irmaos.com.br',
    name: 'Aguinaldo G2I',
    username: 'aguinaldo_g2i',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
  {
    id: 'bruno@grupo2irmaos.com.br',
    email: 'bruno@grupo2irmaos.com.br',
    name: 'Bruno G2I',
    username: 'bruno_g2i',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
  {
    id: 'nelson.lopes@grupo2irmaos.com.br',
    email: 'nelson.lopes@grupo2irmaos.com.br',
    name: 'Nelson Lopes',
    username: 'nelson.lopes',
    role: 'driver',
    base: 'SP',
    password: 'password1',
  },
];


let db: IDBDatabase | null = null;
let openDBPromise: Promise<IDBDatabase> | null = null;


export const openDB = (): Promise<IDBDatabase> => {
  if (db) {
    // console.log('[localDbService openDB] Returning existing DB connection.');
    return Promise.resolve(db);
  }
  if (openDBPromise) {
    // console.log('[localDbService openDB] Returning existing openDBPromise.');
    return openDBPromise;
  }

  openDBPromise = new Promise((resolve, reject) => {
    console.log(`[localDbService openDB] Opening IndexedDB: ${DB_NAME}, Version: ${DB_VERSION}`);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      console.error('[localDbService openDB] IndexedDB error:', request.error);
      db = null; // Reset db instance on error
      openDBPromise = null; // Reset promise on error
      reject(`Error opening IndexedDB: ${request.error?.message}`);
    };
    request.onsuccess = () => {
      db = request.result;
      console.log('[localDbService openDB] IndexedDB connection successful.');
      db.onclose = () => {
          console.warn('[localDbService openDB] IndexedDB connection closed unexpectedly. db instance nulled.');
          db = null; // Nullify db instance on close
          openDBPromise = null; // Reset promise to allow re-opening
      };
      db.onerror = (event) => { // Generic error handler for the connection
           const target = event.target as IDBOpenDBRequest | IDBDatabase | null;
           const error = target ? (target as any).error : 'Unknown DB error';
           console.error('[localDbService openDB] IndexedDB connection error:', error);
           db = null;
           openDBPromise = null;
      };
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const tempDb = request.result;
      const transaction = (event.target as IDBOpenDBRequest).transaction;
      if (!transaction) {
           console.error("[localDbService openDB onupgradeneeded] Upgrade transaction is null.");
           if (request.error) {
                reject("Upgrade transaction failed: " + request.error.message);
           } else {
                reject("Upgrade transaction failed for unknown reasons.");
           }
           return;
       }
      console.log(`[localDbService openDB onupgradeneeded] Upgrading database from version ${event.oldVersion} to ${event.newVersion}`);

      const storesToUpgrade = [
          { name: STORE_VEHICLES, keyPath: 'localId', indices: [{name: 'firebaseId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}]},
          { name: STORE_TRIPS, keyPath: 'localId', indices: [{name: 'firebaseId', unique: false}, {name: 'userId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}, {name: 'createdAt', unique: false}, {name: 'base', unique: false}]},
          { name: STORE_VISITS, keyPath: 'localId', indices: [{name: 'tripLocalId', unique: false}, {name: 'firebaseId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}, {name: 'timestamp', unique: false}, {name: 'visitType', unique: false}, {name: 'userId', unique: false}]},
          { name: STORE_EXPENSES, keyPath: 'localId', indices: [{name: 'tripLocalId', unique: false}, {name: 'firebaseId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}, {name: 'timestamp', unique: false}, {name: 'userId', unique: false}]},
          { name: STORE_FUELINGS, keyPath: 'localId', indices: [{name: 'tripLocalId', unique: false}, {name: 'firebaseId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}, {name: 'date', unique: false}, {name: 'vehicleId', unique: false}, {name: 'odometerKm', unique: false}, {name: 'fuelType', unique: false}, {name: 'userId', unique: false}]},
          { name: STORE_USERS, keyPath: 'id', indices: [{name: 'email', unique: true}, {name: 'username', unique: true}, {name: 'lastLogin', unique: false}, {name: 'role', unique: false}, {name: 'base', unique: false}, {name: 'deleted', unique: false}, {name: 'firebaseId', unique: false}]},
          { name: STORE_VISIT_TYPES, keyPath: 'localId', indices: [{ name: 'name', unique: true }, { name: 'syncStatus', unique: false }, { name: 'deleted', unique: false }, { name: 'firebaseId', unique: false }] },
          { name: STORE_EXPENSE_TYPES, keyPath: 'localId', indices: [{ name: 'name', unique: true }, { name: 'syncStatus', unique: false }, { name: 'deleted', unique: false }, { name: 'firebaseId', unique: false }] }
      ];

      storesToUpgrade.forEach(storeInfo => {
          let objectStore: IDBObjectStore;
          if (!tempDb.objectStoreNames.contains(storeInfo.name)) {
              console.log(`[localDbService openDB onupgradeneeded] Creating store: ${storeInfo.name}`);
              objectStore = tempDb.createObjectStore(storeInfo.name, { keyPath: storeInfo.keyPath as string });
          } else {
              console.log(`[localDbService openDB onupgradeneeded] Store ${storeInfo.name} already exists. Accessing...`);
              objectStore = transaction.objectStore(storeInfo.name);
          }
          storeInfo.indices.forEach(indexInfo => {
              if (!objectStore.indexNames.contains(indexInfo.name)) {
                  console.log(`[localDbService openDB onupgradeneeded] Creating index '${indexInfo.name}' on store '${storeInfo.name}'.`);
                  objectStore.createIndex(indexInfo.name, indexInfo.name, { unique: indexInfo.unique });
              } else {
                  console.log(`[localDbService openDB onupgradeneeded] Index '${indexInfo.name}' already exists on store '${storeInfo.name}'.`);
              }
          });
      });
    };
     request.onblocked = (event) => {
          console.warn("[localDbService openDB] IndexedDB open request blocked. Close other tabs using this database.", event);
          openDBPromise = null; // Reset promise on blocked
          reject("IndexedDB blocked, please close other tabs using this database.");
     };
  });
  return openDBPromise;
};

export const getLocalDbStore = (storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> => {
  return openDB().then(dbInstance => {
    if (!dbInstance) {
        const errorMsg = `[getLocalDbStore] Failed to open DB, dbInstance is null for store ${storeName}.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    try {
      const transaction = dbInstance.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      // General error handlers for the transaction, useful for debugging
      transaction.onerror = (event) => console.error(`[localDbService Tx Error] ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      transaction.onabort = (event) => console.warn(`[localDbService Tx Abort] ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      return store;
     } catch (error) {
         // This catch block might be for errors creating the transaction itself (e.g., storeName doesn't exist)
         console.error(`[getLocalDbStore] Error acquiring store ${storeName} (${mode}). Potentially, store does not exist. Error:`, error);
         throw error; // Re-throw to be caught by caller
     }
  });
};

// Generic add record (used by specific add functions)
const addLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<string> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
      return new Promise<string>((resolve, reject) => {
        const request = store.add(record);
        request.onsuccess = () => resolve(record.localId);
        request.onerror = () => {
            console.error(`Error adding record to ${storeName}:`, request.error);
            reject(new Error(`Error adding record to ${storeName}: ${request.error?.message}`));
        }
      });
    });
};

// Generic update/upsert record
export const updateLocalRecord = <T extends { localId?: string; id?: string }>(storeName: string, record: T): Promise<void> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error(`Error updating/adding record in ${storeName}:`, request.error);
                reject(new Error(`Error updating/adding record in ${storeName}: ${request.error?.message}`));
            }
        });
    });
};

// Generic delete by primary key
const deleteLocalRecordByKey = (storeName: string, key: string): Promise<void> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => {
            console.error(`Error deleting record from ${storeName} with key ${key}:`, request.error);
            reject(new Error(`Error deleting record from ${storeName}: ${request.error?.message}`));
          }
        });
    });
};

// Mark a record for deletion (soft delete)
const markRecordForDeletion = (storeName: string, localId: string): Promise<void> => {
    console.log(`[localDbService markRecordForDeletion] Marking record ${localId} in store ${storeName} for deletion.`);
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.get(localId); // Get by localId, which should be the keyPath for most stores
            request.onsuccess = () => {
                if (request.result) {
                    const recordToUpdate: LocalRecord & { [key: string]: any } = {
                        ...request.result,
                        deleted: true,
                        syncStatus: 'pending' as SyncStatus, // Mark as pending to sync the deletion
                    };
                    console.log(`[localDbService markRecordForDeletion] Updating record ${localId} with:`, recordToUpdate);
                    const updateRequest = store.put(recordToUpdate);
                    updateRequest.onsuccess = () => {
                        console.log(`[localDbService markRecordForDeletion] Record ${localId} successfully marked for deletion and pending sync.`);
                        resolve();
                    };
                    updateRequest.onerror = () => {
                        console.error(`[localDbService markRecordForDeletion] Error updating record ${localId} in ${storeName} to mark for deletion: ${updateRequest.error?.message}`);
                        reject(new Error(`Error updating record ${localId} to mark for deletion: ${updateRequest.error?.message}`));
                    };
                } else {
                    console.warn(`[localDbService markRecordForDeletion] Record ${localId} not found in ${storeName} to mark for deletion.`);
                    // Resolve anwyay as there's nothing to mark. Or reject, depending on desired behavior.
                    // For now, resolving as the "delete" operation is "complete" if the item doesn't exist.
                    resolve();
                }
            };
            request.onerror = () => {
                console.error(`[localDbService markRecordForDeletion] Error getting record ${localId} from ${storeName} to mark for deletion: ${request.error?.message}`);
                reject(new Error(`Error getting record ${localId} from ${storeName} to mark for deletion: ${request.error?.message}`));
            };
        });
    });
};

// Generic get all records (filters out deleted items by default)
const getAllLocalRecords = <T extends LocalRecord>(storeName: string): Promise<T[]> => {
    return getLocalDbStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const results = (request.result as any[]).filter((item: any) => !item.deleted);
                resolve(results as T[]);
            };
            request.onerror = () => {
                console.error(`Error getting all records from ${storeName}:`, request.error);
                reject(new Error(`Error getting all records from ${storeName}: ${request.error?.message}`));
            }
        });
    });
};

// Get records by sync status (does NOT filter by deleted, as pending deletions need to be synced)
const getLocalRecordsBySyncStatus = <T extends LocalRecord>(storeName: string, status: SyncStatus | SyncStatus[]): Promise<T[]> => {
    return getLocalDbStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            if (!store.indexNames.contains('syncStatus')) {
                 console.warn(`[getLocalRecordsBySyncStatus] Index 'syncStatus' not found on ${storeName}. Falling back to getAll and client-side filter.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as any[];
                     const statusArray = Array.isArray(status) ? status : [status];
                     const filtered = allRecords.filter(item => statusArray.includes(item.syncStatus));
                     resolve(filtered as T[]);
                 };
                 getAllRequest.onerror = () => reject(new Error(`Fallback getAll failed for ${storeName}: ${getAllRequest.error?.message}`));
                 return;
             }
            const index = store.index('syncStatus');
            const statusArray = Array.isArray(status) ? status : [status];
            let combinedResults: T[] = [];
            let promises: Promise<void>[] = [];

             statusArray.forEach(s => {
                promises.push(new Promise<void>((res, rej) => {
                     const request = index.getAll(s); // Get all records with this sync status
                     request.onsuccess = () => {
                         const results = (request.result as any[]);
                         combinedResults = combinedResults.concat(results as T[]);
                         res();
                     };
                     request.onerror = () => rej(new Error(`Error getting records from ${storeName} by status ${s}: ${request.error?.message}`));
                }));
            });

             Promise.all(promises)
                .then(() => resolve(combinedResults))
                .catch(err => reject(new Error(`Error fetching records by sync status from ${storeName}: ${err}`)));
        });
    });
};


export const getLocalRecordsByRole = <T extends { role: UserRole } & LocalRecord>(role: UserRole): Promise<T[]> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            if (!store.indexNames.contains('role')) {
                console.warn(`[getLocalRecordsByRole] Index 'role' not found on ${STORE_USERS}. Falling back to getAll and client-side filter.`);
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    const allRecords = getAllRequest.result as (T & LocalRecord)[];
                    const filtered = allRecords.filter(item => !item.deleted && item.role === role);
                    resolve(filtered);
                };
                getAllRequest.onerror = () => reject(new Error(`Fallback getAll failed for ${STORE_USERS}: ${getAllRequest.error?.message}`));
                return;
            }
            const index = store.index('role');
            const request = index.getAll(role);
            request.onsuccess = () => {
                const results = (request.result as (T & LocalRecord)[]).filter(item => !item.deleted);
                resolve(results);
            };
            request.onerror = () => reject(new Error(`Error getting records from ${STORE_USERS} by role ${role}: ${request.error?.message}`));
        });
    });
};

// --- User Specific Functions ---
export const getLocalUser = (userId: string): Promise<LocalUser | null> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            const request = store.get(userId); // STORE_USERS uses 'id' as keyPath
            request.onsuccess = () => resolve(request.result as LocalUser | null);
            request.onerror = () => reject(new Error(`Error getting user ${userId} from ${STORE_USERS}: ${request.error?.message}`));
        });
    });
};

export const getLocalUserByEmail = (email: string): Promise<LocalUser | null> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            if (!store.indexNames.contains('email')) {
                 console.error(`[getLocalUserByEmail] Index 'email' not found on ${STORE_USERS}.`);
                 reject(new Error(`Index 'email' not found on ${STORE_USERS}. This is a critical schema issue.`));
                 return;
             }
            const index = store.index('email');
            const request = index.get(email);
            request.onsuccess = () => resolve(request.result as LocalUser | null);
            request.onerror = () => reject(new Error(`Error getting user by email ${email} from ${STORE_USERS}: ${request.error?.message}`));
        });
    });
};

export const getLocalUserByUsername = (username: string): Promise<LocalUser | null> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            if (!store.indexNames.contains('username')) {
                 console.error(`[getLocalUserByUsername] Index 'username' not found on ${STORE_USERS}.`);
                 reject(new Error(`Index 'username' not found on ${STORE_USERS}. This is a critical schema issue.`));
                 return;
             }
            const index = store.index('username');
            const request = index.get(username);
            request.onsuccess = () => resolve(request.result as LocalUser | null);
            request.onerror = () => reject(new Error(`Error getting user by username ${username} from ${STORE_USERS}: ${request.error?.message}`));
        });
    });
};

export const saveLocalUser = (user: DbUser): Promise<void> => {
    console.log(`[saveLocalUser] Attempting to save/update user. ID: ${user.id}, Email: ${user.email}, FirebaseID: ${user.firebaseId}`);
    return new Promise<void>((resolve, reject) => {
        getLocalDbStore(STORE_USERS, 'readwrite').then(store => {
            const transaction = store.transaction; // Get the transaction associated with this store
            let operationsCompleted = 0;
            let operationsAttempted = 0;

            const checkCompletion = () => {
                if (operationsCompleted === operationsAttempted) {
                    // This check might be too simplistic if operations are truly parallel and tx auto-commits
                }
            };

            const emailIndex = store.index('email');
            const getByEmailRequest = emailIndex.getAll(user.email);

            getByEmailRequest.onerror = (event) => {
                console.error(`[saveLocalUser] Error querying email index for ${user.email}:`, (event.target as IDBRequest).error);
                if(transaction.readyState !== 'done') transaction.abort();
                reject((event.target as IDBRequest).error || new Error("Failed to query email index."));
            };

            getByEmailRequest.onsuccess = () => {
                const existingRecordsWithEmail: DbUser[] = getByEmailRequest.result;
                const recordsToDelete: string[] = [];

                existingRecordsWithEmail.forEach(rec => {
                    if (rec.id !== user.id) { // Found a conflicting record (same email, different primary ID)
                        recordsToDelete.push(rec.id);
                    }
                });

                const processDeletesAndPut = () => {
                    if (recordsToDelete.length > 0) {
                        const currentIdToDelete = recordsToDelete.shift()!; // Get next ID to delete
                        operationsAttempted++;
                        console.log(`[saveLocalUser] Deleting conflicting user record with ID: ${currentIdToDelete} for email ${user.email}`);
                        const deleteRequest = store.delete(currentIdToDelete);
                        deleteRequest.onsuccess = () => {
                            console.log(`[saveLocalUser] Successfully deleted conflicting user ID: ${currentIdToDelete}`);
                            operationsCompleted++;
                            processDeletesAndPut(); // Process next delete or the final put
                        };
                        deleteRequest.onerror = (event) => {
                            console.error(`[saveLocalUser] Error deleting conflicting user ID: ${currentIdToDelete}`, (event.target as IDBRequest).error);
                            if(transaction.readyState !== 'done') transaction.abort();
                            reject((event.target as IDBRequest).error || new Error(`Failed to delete conflicting user ID: ${currentIdToDelete}`));
                        };
                    } else {
                        // All conflicts deleted (or no conflicts found), now put the main user record
                        operationsAttempted++;
                        console.log(`[saveLocalUser] Putting user record for ID: ${user.id}, Email: ${user.email}`);
                        const putRequest = store.put(user);
                        putRequest.onsuccess = () => {
                            console.log(`[saveLocalUser] Successfully put user ID: ${user.id}`);
                            operationsCompleted++;
                            // If this is the last operation, transaction.oncomplete will handle resolve()
                        };
                        putRequest.onerror = (event) => {
                            console.error(`[saveLocalUser] Error putting user ID: ${user.id}`, (event.target as IDBRequest).error);
                             if(transaction.readyState !== 'done') transaction.abort();
                            reject((event.target as IDBRequest).error || new Error(`Failed to put user ID: ${user.id}`));
                        };
                    }
                };
                processDeletesAndPut(); // Start the chain
            };

            // Transaction-level handlers
            transaction.oncomplete = () => {
                console.log(`[saveLocalUser] Transaction completed successfully for user ${user.id}. Operations attempted: ${operationsAttempted}, completed: ${operationsCompleted}`);
                resolve();
            };
            transaction.onerror = (event) => {
                console.error(`[saveLocalUser] Transaction error for user ${user.id}:`, (event.target as IDBTransaction)?.error);
                reject((event.target as IDBTransaction)?.error || new Error("Transaction failed in saveLocalUser."));
            };
            transaction.onabort = (event) => {
                console.warn(`[saveLocalUser] Transaction aborted for user ${user.id}:`, (event.target as IDBTransaction)?.error);
                reject((event.target as IDBTransaction)?.error || new Error("Transaction aborted in saveLocalUser."));
            };

        }).catch(dbStoreError => {
            console.error("[saveLocalUser] Error getting DB store:", dbStoreError);
            reject(dbStoreError);
        });
    });
};


export const deleteLocalUser = (userId: string, permanent: boolean = false): Promise<void> => {
     const keyPathIsId = STORE_USERS === 'users'; // Assuming keyPath for users is 'id'
     if (permanent) {
        // For users store, localId is not the keyPath, 'id' is.
        return deleteLocalRecordByKey(STORE_USERS, userId);
     } else {
        // markRecordForDeletion for users also needs to use 'id' as the key
        return markRecordForDeletion(STORE_USERS, userId);
     }
};


// --- Vehicle Specific Functions ---
export const addLocalDbVehicle = (vehicle: Omit<VehicleInfo, 'id'>, firebaseId?: string): Promise<string> => {
    const localId = `local_vehicle_${uuidv4()}`;
    const newLocalVehicle: LocalVehicle = {
        ...(vehicle as Omit<VehicleInfo, 'id'>),
        localId, // This is the keyPath for STORE_VEHICLES
        id: firebaseId || localId, // Storing an 'id' field for consistency with other types if needed, but localId is key
        firebaseId: firebaseId,
        syncStatus: firebaseId ? 'synced' : 'pending',
        deleted: false,
    };
    return addLocalRecord<LocalVehicle>(STORE_VEHICLES, newLocalVehicle);
};
export const updateLocalDbVehicle = (vehicle: LocalVehicle): Promise<void> => {
    const updatedSyncStatus = vehicle.syncStatus === 'synced' && !vehicle.deleted ? 'pending' : vehicle.syncStatus;
    const updatedVehicle = { ...vehicle, syncStatus: updatedSyncStatus };
    return updateLocalRecord<LocalVehicle>(STORE_VEHICLES, updatedVehicle);
};
export const deleteLocalDbVehicle = (localId: string): Promise<void> => {
    return markRecordForDeletion(STORE_VEHICLES, localId);
};
export const getLocalVehicles = (): Promise<LocalVehicle[]> => {
    return getAllLocalRecords<LocalVehicle>(STORE_VEHICLES);
};

// --- Trip Specific Functions ---
export const addLocalTrip = (trip: Omit<LocalTrip, 'localId' | 'syncStatus' | 'id' | 'deleted'>): Promise<string> => {
    const localId = `local_trip_${uuidv4()}`;
    const newLocalTrip: LocalTrip = {
      ...trip,
      localId,
      id: localId, // Store localId also in 'id' for potential generic operations if needed
      deleted: false, // Ensure new records are not marked as deleted
      syncStatus: 'pending',
    };
    return addLocalRecord<LocalTrip>(STORE_TRIPS, newLocalTrip);
};
export const updateLocalTrip = (trip: LocalTrip): Promise<void> => {
    const updatedSyncStatus = trip.syncStatus === 'synced' && !trip.deleted ? 'pending' : trip.syncStatus;
    const updatedTrip = { ...trip, syncStatus: updatedSyncStatus };
    return updateLocalRecord<LocalTrip>(STORE_TRIPS, updatedTrip);
};
export const deleteLocalTrip = (localId: string): Promise<void> => {
    console.log(`[deleteLocalTrip] Attempting to mark trip ${localId} and its children for deletion.`);
    return Promise.all([
        markRecordForDeletion(STORE_TRIPS, localId),
        markChildrenForDeletion(STORE_VISITS, localId),
        markChildrenForDeletion(STORE_EXPENSES, localId),
        markChildrenForDeletion(STORE_FUELINGS, localId)
    ]).then(() => {
        console.log(`[deleteLocalTrip] Successfully marked trip ${localId} and children for deletion.`);
    }).catch(err => {
        console.error(`[deleteLocalTrip] Error marking trip ${localId} or children:`, err);
        throw err; // Re-throw to be caught by the caller
    });
};
const markChildrenForDeletion = async (storeName: string, tripLocalId: string): Promise<void> => {
    console.log(`[markChildrenForDeletion] Marking children in ${storeName} for tripLocalId: ${tripLocalId}`);
    try {
        const store = await getLocalDbStore(storeName, 'readwrite');
        if (!store.indexNames.contains('tripLocalId')) {
            console.warn(`[markChildrenForDeletion] Index 'tripLocalId' not found on store ${storeName}. Cannot mark children for trip ${tripLocalId}.`);
            return; // Or throw an error if this is unexpected
        }
        const index = store.index('tripLocalId');
        let cursorReq = index.openCursor(IDBKeyRange.only(tripLocalId));

        // Use a promise to manage the cursor iteration and updates within the transaction
        return new Promise<void>((resolveCursor, rejectCursor) => {
             const transaction = store.transaction; // Get the transaction from the store
             const updateOperations: Promise<void>[] = []; // To track individual updates

             transaction.onerror = (event) => rejectCursor(new Error(`Transaction error in markChildrenForDeletion for ${storeName}: ${(event.target as IDBRequest).error?.message}`));
             transaction.oncomplete = () => resolveCursor();
             transaction.onabort = (event) => rejectCursor(new Error(`Transaction aborted in markChildrenForDeletion for ${storeName}: ${(event.target as IDBRequest).error?.message}`));

             cursorReq.onerror = (event) => rejectCursor(new Error(`Cursor error in markChildrenForDeletion for ${storeName}: ${(event.target as IDBRequest).error?.message}`));
             cursorReq.onsuccess = (event) => {
                 const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
                 if (cursor) {
                     try {
                        const recordToUpdate = { ...cursor.value, deleted: true, syncStatus: 'pending' as SyncStatus };
                        const updateRequest = cursor.update(recordToUpdate);
                        // We don't strictly need to await individual updates here if we rely on transaction.oncomplete
                        updateRequest.onerror = (errEvent) => console.error(`[markChildrenForDeletion] Error updating child ${cursor.primaryKey} in ${storeName}:`, (errEvent.target as IDBRequest).error);
                     } catch (error) {
                        // This catch is for synchronous errors in preparing the update
                        console.error(`[markChildrenForDeletion] Error processing cursor value for ${cursor.primaryKey} in ${storeName}:`, error);
                        if(transaction.readyState !== 'done') transaction.abort(); // Abort if something unexpected happens
                        // rejectCursor(error); // No need to reject here if tx.abort() is called
                        return; // Stop processing this cursor
                     }
                     cursor.continue();
                 }
                 // If cursor is null, all items have been processed, transaction will complete.
             };
        });
    } catch (error) {
        // This catch is for errors getting the store or index
        console.error(`[markChildrenForDeletion] Outer error in ${storeName} for trip ${tripLocalId}:`, error);
        throw error; // Re-throw to be caught by the caller
    }
};
export const getLocalTrips = (userId?: string, dateRange?: DateRange): Promise<LocalTrip[]> => {
    return getLocalDbStore(STORE_TRIPS, 'readonly').then(store => {
        return new Promise<LocalTrip[]>((resolve, reject) => {
            const processResults = (allRecords: LocalTrip[]) => {
                let filteredRecords = allRecords.filter(item => !item.deleted); // Start with non-deleted items

                // If a userId is provided, and the user is not an admin (determined by checking if they have any 'ALL_ADM_TRIP' or 'ALL' base trips)
                // then filter by that userId. Otherwise, if admin or no userId, show all (non-deleted) trips.
                if (userId) {
                    const isAdminUser = allRecords.some(t => t.userId === userId && (t.base === 'ALL_ADM_TRIP' || t.base === 'ALL'));
                    if (!isAdminUser) {
                        filteredRecords = filteredRecords.filter(item => item.userId === userId);
                    }
                }

                if (dateRange?.from) {
                    const startDate = startOfDay(dateRange.from);
                    // If dateRange.to is not provided, use a very far future date to include all trips from startDate onwards
                    const endDate = dateRange.to ? endOfDay(dateRange.to) : new Date(8640000000000000); // Max Date
                    const interval = { start: startDate, end: endDate };
                    filteredRecords = filteredRecords.filter(trip => {
                        try {
                            // Ensure trip.createdAt is a valid ISO string or Date object
                            const createdAtDate = typeof trip.createdAt === 'string' ? parseISO(trip.createdAt) : trip.createdAt;
                            return isWithinInterval(createdAtDate, interval);
                        } catch (e) {
                            console.warn(`[getLocalTrips] Could not parse createdAt for trip ${trip.localId}:`, trip.createdAt, e);
                            return false; // Exclude if date is unparseable
                        }
                    });
                }
                // Sort: 'Andamento' first, then by creation date descending
                filteredRecords.sort((a, b) => {
                     if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                     if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                     try {
                        const dateA = typeof a.createdAt === 'string' ? parseISO(a.createdAt) : a.createdAt;
                        const dateB = typeof b.createdAt === 'string' ? parseISO(b.createdAt) : b.createdAt;
                        return dateB.getTime() - dateA.getTime();
                     } catch (e) {
                        return 0; // Keep original order if dates are unparseable
                     }
                });
                resolve(filteredRecords);
            };

            // Prefer using an index if filtering by userId, otherwise getAll and filter client-side.
            // For simplicity and given the added date filtering, getAll and then client-side filtering is robust.
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => processResults(getAllRequest.result as LocalTrip[]);
            getAllRequest.onerror = () => reject(new Error(`Fallback/All getAll failed for ${STORE_TRIPS}: ${getAllRequest.error?.message}`));
        });
    });
};


// --- Visit Specific Functions ---
export const getLocalVisits = (tripLocalId?: string): Promise<LocalVisit[]> => {
     return getLocalDbStore(STORE_VISITS, 'readonly').then(store => {
         return new Promise<LocalVisit[]>((resolve, reject) => {
            // If tripLocalId is provided and the index exists, use it.
            if (tripLocalId && store.indexNames.contains('tripLocalId')) {
                 const index = store.index('tripLocalId');
                 const request = index.getAll(tripLocalId);
                 request.onsuccess = () => {
                     const results = (request.result as LocalVisit[]).filter(item => !item.deleted);
                     results.sort((a, b) => { // Sort by timestamp descending
                        try {
                            const dateA = typeof a.timestamp === 'string' ? parseISO(a.timestamp) : a.timestamp;
                            const dateB = typeof b.timestamp === 'string' ? parseISO(b.timestamp) : b.timestamp;
                            return dateB.getTime() - dateA.getTime();
                        } catch { return 0; }
                     });
                     resolve(results);
                 };
                 request.onerror = () => reject(new Error(`Error getting visits for trip ${tripLocalId} from ${STORE_VISITS}: ${request.error?.message}`));
             } else { // Fallback to getAll if no tripLocalId or index doesn't exist (should not happen with schema)
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                    let allRecords = getAllRequest.result as LocalVisit[];
                     if (tripLocalId) {
                         allRecords = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     } else {
                         allRecords = allRecords.filter(item => !item.deleted);
                     }
                     allRecords.sort((a, b) => { // Sort by timestamp descending
                        try {
                            const dateA = typeof a.timestamp === 'string' ? parseISO(a.timestamp) : a.timestamp;
                            const dateB = typeof b.timestamp === 'string' ? parseISO(b.timestamp) : b.timestamp;
                            return dateB.getTime() - dateA.getTime();
                        } catch { return 0;}
                     });
                     resolve(allRecords);
                  };
                  getAllRequest.onerror = () => reject(new Error(`Fallback/All getAll failed for ${STORE_VISITS}: ${getAllRequest.error?.message}`));
              }
         });
     });
};
export const addLocalVisit = (visit: Omit<LocalVisit, 'localId' | 'syncStatus' | 'id' | 'deleted'>): Promise<string> => {
    const localId = `local_visit_${uuidv4()}`;
    const newLocalVisit: LocalVisit = {
        ...visit,
        localId,
        id: localId,
        userId: visit.userId, // Ensure userId is passed through
        deleted: false,
        syncStatus: 'pending',
    };
    return addLocalRecord<LocalVisit>(STORE_VISITS, newLocalVisit);
};
export const updateLocalVisit = (visit: LocalVisit): Promise<void> => {
    const updatedSyncStatus = visit.syncStatus === 'synced' && !visit.deleted ? 'pending' : visit.syncStatus;
    const updatedVisit = { ...visit, userId: visit.userId, syncStatus: updatedSyncStatus }; // Ensure userId is passed
    return updateLocalRecord<LocalVisit>(STORE_VISITS, updatedVisit);
};
export const deleteLocalVisit = (localId: string): Promise<void> => {
    return markRecordForDeletion(STORE_VISITS, localId);
};

// --- Expense Specific Functions ---
export const getLocalExpenses = (tripLocalId?: string): Promise<LocalExpense[]> => {
     return getLocalDbStore(STORE_EXPENSES, 'readonly').then(store => {
         return new Promise<LocalExpense[]>((resolve, reject) => {
            if (tripLocalId && store.indexNames.contains('tripLocalId')) {
                  const index = store.index('tripLocalId');
                  const request = index.getAll(tripLocalId);
                  request.onsuccess = () => {
                      const results = (request.result as LocalExpense[]).filter(item => !item.deleted);
                      results.sort((a, b) => { // Sort by timestamp descending
                        try {
                            const dateA = typeof a.timestamp === 'string' ? parseISO(a.timestamp) : a.timestamp;
                            const dateB = typeof b.timestamp === 'string' ? parseISO(b.timestamp) : b.timestamp;
                            return dateB.getTime() - dateA.getTime();
                        } catch { return 0;}
                      });
                      resolve(results);
                  };
                  request.onerror = () => reject(new Error(`Error getting expenses for trip ${tripLocalId} from ${STORE_EXPENSES}: ${request.error?.message}`));
              } else {
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                    let allRecords = getAllRequest.result as LocalExpense[];
                     if (tripLocalId) {
                         allRecords = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     } else {
                         allRecords = allRecords.filter(item => !item.deleted);
                     }
                      allRecords.sort((a, b) => { // Sort by timestamp descending
                        try {
                            const dateA = typeof a.timestamp === 'string' ? parseISO(a.timestamp) : a.timestamp;
                            const dateB = typeof b.timestamp === 'string' ? parseISO(b.timestamp) : b.timestamp;
                            return dateB.getTime() - dateA.getTime();
                        } catch { return 0;}
                      });
                     resolve(allRecords);
                  };
                  getAllRequest.onerror = () => reject(new Error(`Fallback/All getAll failed for ${STORE_EXPENSES}: ${getAllRequest.error?.message}`));
              }
         });
     });
};
export const addLocalExpense = (expense: Omit<LocalExpense, 'localId' | 'syncStatus' | 'id' | 'deleted'>): Promise<string> => {
     const localId = `local_expense_${uuidv4()}`;
     const newLocalExpense: LocalExpense = {
         ...expense,
         localId,
         id: localId,
         userId: expense.userId, // Ensure userId is passed
         deleted: false,
         syncStatus: 'pending',
     };
     return addLocalRecord<LocalExpense>(STORE_EXPENSES, newLocalExpense);
};
export const updateLocalExpense = (expense: LocalExpense): Promise<void> => {
     const updatedSyncStatus = expense.syncStatus === 'synced' && !expense.deleted ? 'pending' : expense.syncStatus;
     const updatedExpense = { ...expense, userId: expense.userId, syncStatus: updatedSyncStatus }; // Ensure userId
     return updateLocalRecord<LocalExpense>(STORE_EXPENSES, updatedExpense);
};
export const deleteLocalExpense = (localId: string): Promise<void> => {
     return markRecordForDeletion(STORE_EXPENSES, localId);
};

// --- Fueling Specific Functions ---
export const getLocalFuelings = (idToFilterBy?: string, filterType: 'tripLocalId' | 'vehicleId' = 'tripLocalId'): Promise<LocalFueling[]> => {
      return getLocalDbStore(STORE_FUELINGS, 'readonly').then(store => {
          return new Promise<LocalFueling[]>((resolve, reject) => {
                if (idToFilterBy && store.indexNames.contains(filterType)) {
                   const index = store.index(filterType);
                   const request = index.getAll(idToFilterBy);
                   request.onsuccess = () => {
                       const results = (request.result as LocalFueling[]).filter(item => !item.deleted);
                       results.sort((a, b) => { // Sort by date descending, then odometerKm descending
                            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
                            if (dateDiff !== 0) return dateDiff;
                            return (b.odometerKm || 0) - (a.odometerKm || 0);
                       });
                       resolve(results);
                   };
                   request.onerror = () => reject(new Error(`Error getting fuelings for ${filterType} ${idToFilterBy} from ${STORE_FUELINGS}: ${request.error?.message}`));
               } else { // Fallback to getAll if no idToFilterBy or index doesn't exist
                  const getAllRequest = store.getAll();
                  getAllRequest.onsuccess = () => {
                     let allRecords = getAllRequest.result as LocalFueling[];
                     if (idToFilterBy) { // If idToFilterBy was provided but index wasn't used, filter manually
                         allRecords = allRecords.filter(item => !item.deleted && item[filterType] === idToFilterBy);
                     } else {
                         allRecords = allRecords.filter(item => !item.deleted);
                     }
                      allRecords.sort((a, b) => { // Sort by date descending, then odometerKm descending
                            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
                            if (dateDiff !== 0) return dateDiff;
                            return (b.odometerKm || 0) - (a.odometerKm || 0);
                       });
                     resolve(allRecords);
                  };
                  getAllRequest.onerror = () => reject(new Error(`Fallback/All getAll failed for ${STORE_FUELINGS}: ${getAllRequest.error?.message}`));
              }
          });
      });
};
export const addLocalFueling = (fueling: Omit<LocalFueling, 'localId' | 'syncStatus' | 'id' | 'deleted'>): Promise<string> => {
      const localId = `local_fueling_${uuidv4()}`;
      const newLocalFueling: LocalFueling = {
          ...fueling,
          localId,
          id: localId,
          userId: fueling.userId, // Ensure userId
          deleted: false,
          syncStatus: 'pending',
      };
      return addLocalRecord<LocalFueling>(STORE_FUELINGS, newLocalFueling);
};
export const updateLocalFueling = (fueling: LocalFueling): Promise<void> => {
      const updatedSyncStatus = fueling.syncStatus === 'synced' && !fueling.deleted ? 'pending' : fueling.syncStatus;
      const updatedFueling = { ...fueling, userId: fueling.userId, syncStatus: updatedSyncStatus }; // Ensure userId
      return updateLocalRecord<LocalFueling>(STORE_FUELINGS, updatedFueling);
};
export const deleteLocalFueling = (localId: string): Promise<void> => {
      return markRecordForDeletion(STORE_FUELINGS, localId);
};

// --- Custom Type Specific Functions (Visit Types, Expense Types) ---
export const addLocalCustomType = (storeName: string, typeName: string): Promise<string> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<string>((resolve, reject) => {
            if (!store.indexNames.contains('name')) {
                reject(new Error(`Index 'name' not found on store ${storeName}. Cannot add custom type.`));
                return;
            }
            const nameIndex = store.index('name');
            const checkNameRequest = nameIndex.get(typeName); // Check if type name already exists

            checkNameRequest.onsuccess = () => {
                if (checkNameRequest.result && !checkNameRequest.result.deleted) {
                     console.warn(`[addLocalCustomType] Type with name "${typeName}" already exists in ${storeName} and is not deleted.`);
                     reject(new Error(`O tipo "${typeName}" já existe.`));
                     return;
                }
                // If it doesn't exist, or exists but is marked deleted, proceed to add/update
                const localId = checkNameRequest.result?.localId || `local_${storeName.replace('Store', '').toLowerCase()}_type_${uuidv4()}`;
                const newCustomType: CustomType = {
                    localId,
                    id: checkNameRequest.result?.id || localId, // Use existing ID if overwriting a deleted one
                    name: typeName,
                    syncStatus: 'pending', // Always pending for new or reactivated types
                    deleted: false, // Ensure it's not marked as deleted
                    firebaseId: checkNameRequest.result?.firebaseId, // Preserve firebaseId if reactivating
                };

                const putRequest = store.put(newCustomType); // Use put to handle add or update
                putRequest.onsuccess = () => resolve(localId);
                putRequest.onerror = () => reject(new Error(putRequest.error?.message || `Falha ao adicionar/atualizar tipo em ${storeName}`));
            };
            checkNameRequest.onerror = () => reject(new Error(checkNameRequest.error?.message || `Falha ao verificar tipo existente em ${storeName}`));
        });
    });
};

export const getLocalCustomTypes = (storeName: string): Promise<CustomType[]> => {
    return getAllLocalRecords<CustomType>(storeName).then(types => types.sort((a, b) => a.name.localeCompare(b.name)));
};

export const markLocalCustomTypeForDeletion = (storeName: string, localId: string): Promise<void> => {
    return markRecordForDeletion(storeName, localId);
};


// --- Sync Related Functions ---
export const getPendingRecords = async (): Promise<{
  trips: LocalTrip[],
  visits: LocalVisit[],
  expenses: LocalExpense[],
  fuelings: LocalFueling[],
  vehicles: LocalVehicle[],
  users: LocalUser[],
  visitTypes: CustomType[],
  expenseTypes: CustomType[],
}> => {
    const pendingStatus: SyncStatus[] = ['pending', 'error']; // Include 'error' to retry failed syncs
    try {
        console.log("[getPendingRecords] Fetching records with syncStatus 'pending' or 'error'.");
        const [trips, visits, expenses, fuelings, vehicles, users, visitTypes, expenseTypes] = await Promise.all([
            getLocalRecordsBySyncStatus<LocalTrip>(STORE_TRIPS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalVisit>(STORE_VISITS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalExpense>(STORE_EXPENSES, pendingStatus),
            getLocalRecordsBySyncStatus<LocalFueling>(STORE_FUELINGS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalVehicle>(STORE_VEHICLES, pendingStatus),
            getLocalRecordsBySyncStatus<LocalUser>(STORE_USERS, pendingStatus),
            getLocalRecordsBySyncStatus<CustomType>(STORE_VISIT_TYPES, pendingStatus),
            getLocalRecordsBySyncStatus<CustomType>(STORE_EXPENSE_TYPES, pendingStatus),
        ]);
        console.log(`[getPendingRecords] Found: ${trips.length} trips, ${visits.length} visits, ${expenses.length} expenses, ${fuelings.length} fuelings, ${vehicles.length} vehicles, ${users.length} users, ${visitTypes.length} visitTypes, ${expenseTypes.length} expenseTypes.`);
        return { trips, visits, expenses, fuelings, vehicles, users, visitTypes, expenseTypes };
    } catch (error) {
        console.error("[getPendingRecords] Error fetching pending records:", error);
        return { trips: [], visits: [], expenses: [], fuelings: [], vehicles: [], users: [], visitTypes: [], expenseTypes: [] };
    }
};

export const updateSyncStatus = async (
    storeName: string,
    localIdOrPrimaryKey: string, // For STORE_USERS, this is the 'id' (Firebase UID or email), for others it's 'localId'
    firebaseIdFromServer: string | undefined,
    status: SyncStatus,
    additionalUpdates: Record<string, any> = {}
): Promise<void> => {
    console.log(`[updateSyncStatus] Updating ${storeName} item ${localIdOrPrimaryKey}: status=${status}, firebaseId=${firebaseIdFromServer}, additional:`, additionalUpdates);
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.get(localIdOrPrimaryKey);
            request.onsuccess = () => {
                if (request.result) {
                    const recordToUpdate = {
                        ...request.result,
                        syncStatus: status,
                        firebaseId: firebaseIdFromServer || request.result.firebaseId, // Preserve existing firebaseId if new one is undefined
                        ...additionalUpdates
                    };

                    // Critical check: If status is 'synced', firebaseId MUST be present unless the item is being marked as deleted.
                    if (status === 'synced' && !recordToUpdate.firebaseId && !recordToUpdate.deleted) {
                        const errorMsg = `[updateSyncStatus] CRITICAL: Cannot mark ${localIdOrPrimaryKey} in ${storeName} as 'synced' without a valid firebaseId unless it's a deleted item. Current firebaseId: ${recordToUpdate.firebaseId}`;
                        console.error(errorMsg);
                        // Do not proceed with update if this condition isn't met for a non-deleted item
                        reject(new Error(errorMsg));
                        return;
                    }

                    const updateRequest = store.put(recordToUpdate);
                    updateRequest.onsuccess = () => {
                        console.log(`[updateSyncStatus] Successfully updated ${storeName} item ${localIdOrPrimaryKey}.`);
                        resolve();
                    };
                    updateRequest.onerror = () => {
                        console.error(`[updateSyncStatus] Error updating sync status for ${localIdOrPrimaryKey} in ${storeName}:`, updateRequest.error);
                        reject(new Error(`Error updating sync status for ${localIdOrPrimaryKey} in ${storeName}: ${updateRequest.error?.message}`));
                    };
                } else {
                    console.warn(`[updateSyncStatus] Record ${localIdOrPrimaryKey} not found in ${storeName} to update sync status.`);
                    reject(new Error(`Record ${localIdOrPrimaryKey} not found in ${storeName} to update sync status`));
                }
            };
            request.onerror = () => {
                console.error(`[updateSyncStatus] Error getting record ${localIdOrPrimaryKey} from ${storeName} for sync status update:`, request.error);
                reject(new Error(`Error getting record ${localIdOrPrimaryKey} from ${storeName} for sync status update: ${request.error?.message}`));
            };
        });
    });
};


export const cleanupDeletedRecords = async (): Promise<void> => {
    const stores = [STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES, STORE_USERS, STORE_VISIT_TYPES, STORE_EXPENSE_TYPES];
    console.log("[Cleanup] Starting cleanup of locally deleted & synced records for all stores.");

    for (const storeName of stores) {
        try {
            const store = await getLocalDbStore(storeName, 'readwrite');
            const transaction = store.transaction;
            let deletedCountInStore = 0;

            await new Promise<void>((resolveTx, rejectTx) => {
                const getAllRequest = store.getAll(); // Get all records to filter in memory

                getAllRequest.onerror = (event: Event) => {
                    console.error(`[Cleanup] Error fetching records from ${storeName} for cleanup:`, (event.target as IDBRequest).error);
                    if (transaction.readyState !== 'done' && transaction.readyState !== 'finished') transaction.abort();
                    rejectTx((event.target as IDBRequest).error);
                };

                getAllRequest.onsuccess = () => {
                    const allRecords = getAllRequest.result as (LocalRecord & { [key:string]: any})[] ;
                    const itemsToDeletePromises: Promise<void>[] = [];

                    allRecords.forEach(record => {
                        if (record.deleted === true && record.syncStatus === 'synced') {
                            // Determine the primary key based on store name
                            const primaryKey = storeName === STORE_USERS ? record.id : record.localId;
                            if (!primaryKey) {
                                console.warn(`[Cleanup] Record in ${storeName} is missing its primary key, cannot delete:`, record);
                                return;
                            }
                            itemsToDeletePromises.push(new Promise((resolveDel, rejectDel) => {
                                const deleteRequest = store.delete(primaryKey);
                                deleteRequest.onsuccess = () => {
                                    deletedCountInStore++;
                                    resolveDel();
                                };
                                deleteRequest.onerror = (delEvent) => {
                                    console.error(`[Cleanup] Error deleting record with key ${String(primaryKey)} from ${storeName}:`, (delEvent.target as IDBRequest).error);
                                    rejectDel((delEvent.target as IDBRequest).error);
                                };
                            }));
                        }
                    });

                    if (itemsToDeletePromises.length > 0) {
                         Promise.all(itemsToDeletePromises)
                            .then(() => {
                                // All delete operations queued successfully or some failed but were caught.
                                // The transaction oncomplete/onerror will tell the final story.
                            })
                            .catch(err => {
                                console.error(`[Cleanup] Error during one or more delete operations for ${storeName}:`, err);
                                // If any individual delete promise rejects, abort the transaction.
                                if (transaction.readyState !== 'done' && transaction.readyState !== 'finished') transaction.abort();
                            });
                    }
                    // If no items to delete, the transaction will complete normally.
                };

                transaction.oncomplete = () => {
                    if (deletedCountInStore > 0) {
                        console.log(`[Cleanup] Successfully deleted ${deletedCountInStore} synced & marked-for-deletion records from ${storeName}.`);
                    }
                    resolveTx();
                };
                transaction.onerror = (event) => {
                    console.error(`[Cleanup] Transaction error for store ${storeName} during cleanup:`, (event.target as IDBTransaction).error);
                    rejectTx((event.target as IDBTransaction).error);
                };
                transaction.onabort = (event) => { // More specific logging for abort
                    console.warn(`[Cleanup] Transaction aborted for store ${storeName} during cleanup:`, (event.target as IDBTransaction).error);
                    rejectTx((event.target as IDBTransaction).error || new Error('Transaction aborted during cleanup'));
                };
            });
        } catch (error) { // Catch errors from getLocalDbStore or other setup issues
            console.error(`[Cleanup] Error during cleanup setup for store ${storeName}:`, error);
        }
    }
    console.log("[Cleanup] All stores processed for cleanup of deleted records.");
};


// Seed initial users if the users store is empty
export const seedInitialUsers = async (): Promise<void> => {
    const seedStartTime = Date.now();
    console.log(`[seedInitialUsers ${seedStartTime}] Attempting to seed initial users...`);
    const dbInstance = await openDB(); // Ensure DB is open and instance is ready
    if (!dbInstance) {
        const err = new Error("DB instance is null, cannot seed users.");
        console.error(`[seedInitialUsers ${seedStartTime}]`, err.message);
        throw err;
    }

    let userCount = 0;
    try {
        const countTransaction = dbInstance.transaction(STORE_USERS, 'readonly');
        const countStore = countTransaction.objectStore(STORE_USERS);
        const countRequest = countStore.count();
        userCount = await new Promise<number>((resolve, reject) => {
            countRequest.onsuccess = () => resolve(countRequest.result);
            countRequest.onerror = (event) => reject((event.target as IDBRequest).error);
            countTransaction.oncomplete = () => resolve(countRequest.result); // Also resolve on tx complete
            countTransaction.onerror = (event) => reject((event.target as IDBTransaction).error);
            countTransaction.onabort = (event) => reject((event.target as IDBTransaction).error || new Error("Count transaction aborted"));
        });
        console.log(`[seedInitialUsers ${seedStartTime}] Found ${userCount} existing users.`);
    } catch (error) {
        console.error(`[seedInitialUsers ${seedStartTime}] Error counting users, assuming 0. Error:`, error);
        userCount = 0; // Assume 0 if counting fails, to allow seeding
    }

    if (userCount > 0) {
        console.log(`[seedInitialUsers ${seedStartTime}] Users already exist (count: ${userCount}). Skipping seed.`);
        return;
    }

    console.log(`[seedInitialUsers ${seedStartTime}] No users found (or count failed). Proceeding with hashing passwords for seeding.`);
    let usersToSeedWithHashedPasswords: LocalUser[];
    try {
        const hashPromises = seedUsersData.map(async (userSeed) => {
            const hash = await bcrypt.hash(userSeed.password, 10);
            const { password, ...userData } = userSeed;
            const userId = userSeed.id || userSeed.email; // Use provided id or fallback to email
            return {
                ...userData,
                id: userId, // Primary key for STORE_USERS
                username: userSeed.username || userSeed.email.split('@')[0],
                passwordHash: hash,
                lastLogin: new Date().toISOString(),
                role: userSeed.role || 'driver',
                base: userSeed.role === 'admin' ? 'ALL' : (userSeed.base || 'N/A'),
                deleted: false,
                firebaseId: userId, // Assume firebaseId is the same as local 'id' for seeded users
                syncStatus: 'synced' as SyncStatus, // Assume seeded users are 'synced'
            } as LocalUser;
        });
        usersToSeedWithHashedPasswords = await Promise.all(hashPromises);
        console.log(`[seedInitialUsers ${seedStartTime}] ${usersToSeedWithHashedPasswords.length} users prepared with hashed passwords.`);
    } catch (hashError) {
        console.error(`[seedInitialUsers ${seedStartTime}] Error hashing passwords for seed data:`, hashError);
        throw hashError; // Propagate error
    }

    if (usersToSeedWithHashedPasswords.length === 0) {
        console.log(`[seedInitialUsers ${seedStartTime}] No users prepared to seed after hashing (this shouldn't happen with seed data).`);
        return;
    }

    console.log(`[seedInitialUsers ${seedStartTime}] Starting write transaction to seed ${usersToSeedWithHashedPasswords.length} users.`);
    return new Promise<void>(async (resolve, reject) => {
        try {
            const writeTransaction = dbInstance.transaction(STORE_USERS, 'readwrite');
            const store = writeTransaction.objectStore(STORE_USERS);
            const operationPromises: Promise<void>[] = [];

            usersToSeedWithHashedPasswords.forEach(user => {
                operationPromises.push(new Promise<void>((resolveOp, rejectOp) => {
                    const request = store.put(user); // Use put for idempotency
                    request.onsuccess = () => resolveOp();
                    request.onerror = (event) => {
                        console.warn(`[seedInitialUsers ${seedStartTime}] Error on put for user ${user.email} (ID: ${user.id}):`, request.error);
                        // Don't reject the whole seed for one duplicate, but log it.
                        // If it's a critical error, it might be caught by transaction.onerror
                        resolveOp(); // Resolve even on individual put error to allow tx to complete/abort
                    };
                }));
            });

            await Promise.all(operationPromises); // Wait for all put operations to be queued

            writeTransaction.oncomplete = () => {
                console.log(`[seedInitialUsers ${seedStartTime}] Seed users transaction successfully completed.`);
                resolve();
            };
            writeTransaction.onerror = (event) => {
                console.error(`[seedInitialUsers ${seedStartTime}] Seed users transaction error:`, (event.target as IDBTransaction).error);
                reject((event.target as IDBTransaction).error);
            };
            writeTransaction.onabort = (event) => {
                console.warn(`[seedInitialUsers ${seedStartTime}] Seed users transaction aborted:`, (event.target as IDBTransaction).error);
                reject((event.target as IDBTransaction).error || new Error("Seed users transaction aborted"));
            };
        } catch (error) {
            console.error(`[seedInitialUsers ${seedStartTime}] Error during seeding logic (transaction phase):`, error);
            reject(error);
        }
    });
};

// Initial call to open the DB and seed users when the service loads
openDB()
  .then(() => {
    console.log("[localDbService init] DB opened successfully via initial call. Proceeding to seed users.");
    return seedInitialUsers();
  })
  .then(() => {
    console.log("[localDbService init] User seeding process attempted/completed via initial call.");
  })
  .catch(error => console.error("[localDbService init] Failed to initialize/seed IndexedDB on load:", error));
