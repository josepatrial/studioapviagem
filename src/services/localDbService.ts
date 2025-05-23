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
const DB_VERSION = 7; // Incremented version for new custom type stores

export const STORE_VEHICLES = 'vehicles';
export const STORE_TRIPS = 'trips';
export const STORE_VISITS = 'visits';
export const STORE_EXPENSES = 'expenses';
export const STORE_FUELINGS = 'fuelings';
export const STORE_USERS = 'users';
export const STORE_VISIT_TYPES = 'visitTypesStore';
export const STORE_EXPENSE_TYPES = 'expenseTypesStore';


export type SyncStatus = 'pending' | 'synced' | 'error';

interface LocalRecord {
  syncStatus: SyncStatus;
  firebaseId?: string;
  deleted?: boolean;
}

export type LocalVehicle = Omit<VehicleInfo & { id: string }, 'id'> & LocalRecord & { localId: string; id?: string };
export type LocalTrip = Omit<Trip, 'id'> & LocalRecord & { localId: string; id?: string };
export type LocalVisit = Omit<BaseVisit, 'id'> & LocalRecord & { localId: string; tripLocalId: string; userId: string; id?: string; visitType?: string; };
export type LocalExpense = Omit<BaseExpense, 'id'> & LocalRecord & { localId: string; tripLocalId: string; userId: string; id?: string };
export type LocalFueling = Omit<BaseFueling, 'id'> & LocalRecord & { localId: string; tripLocalId: string; userId: string; odometerKm: number; fuelType: string; id?: string };
export type LocalUser = User & { lastLogin?: string; passwordHash?: string; username?: string; deleted?: boolean; firebaseId?: string };

export interface CustomType extends LocalRecord {
  localId: string; 
  id?: string; 
  name: string; 
}


const seedUsersData: (Omit<LocalUser, 'passwordHash' | 'lastLogin' | 'deleted' | 'firebaseId' | 'syncStatus'> & {password: string})[] = [
  {
    id: 'admin@grupo2irmaos.com.br',
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
    return Promise.resolve(db);
  }
  if (openDBPromise) {
      return openDBPromise;
  }

  openDBPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      console.error('[localDbService] IndexedDB error:', request.error);
      db = null; 
      openDBPromise = null;
      reject(`Error opening IndexedDB: ${request.error?.message}`);
    };
    request.onsuccess = () => {
      db = request.result;
      db.onclose = () => {
          console.warn('[localDbService] IndexedDB connection closed unexpectedly.');
          db = null;
          openDBPromise = null;
      };
      db.onerror = (event) => {
           const target = event.target as IDBOpenDBRequest | IDBDatabase | null;
           const error = target ? (target as any).error : 'Unknown DB error';
           console.error('[localDbService] IndexedDB connection error:', error);
           db = null;
           openDBPromise = null;
      };
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const tempDb = request.result;
      const transaction = (event.target as IDBOpenDBRequest).transaction;
      if (!transaction) {
           console.error("[onupgradeneeded] Upgrade transaction is null.");
           if (request.error) {
                reject("Upgrade transaction failed: " + request.error.message);
           } else {
                reject("Upgrade transaction failed for unknown reasons.");
           }
           return;
       }

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
              console.log(`[onupgradeneeded] Creating store: ${storeInfo.name}`);
              objectStore = tempDb.createObjectStore(storeInfo.name, { keyPath: storeInfo.keyPath });
          } else {
              console.log(`[onupgradeneeded] Store ${storeInfo.name} already exists. Accessing...`);
              objectStore = transaction.objectStore(storeInfo.name);
          }
          storeInfo.indices.forEach(indexInfo => {
              if (!objectStore.indexNames.contains(indexInfo.name)) {
                  console.log(`[onupgradeneeded] Creating index '${indexInfo.name}' on store '${storeInfo.name}'.`);
                  objectStore.createIndex(indexInfo.name, indexInfo.name, { unique: indexInfo.unique });
              } else {
                  console.log(`[onupgradeneeded] Index '${indexInfo.name}' already exists on store '${storeInfo.name}'.`);
              }
          });
      });
    };
     request.onblocked = (event) => {
          console.warn("[localDbService] IndexedDB open request blocked.", event);
          openDBPromise = null;
          reject("IndexedDB blocked, please close other tabs.");
     };
  });
  return openDBPromise;
};

export const getLocalDbStore = (storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> => {
  return openDB().then(dbInstance => {
    if (!dbInstance) {
        console.error(`[getLocalDbStore] Failed to open DB, dbInstance is null for store ${storeName}.`);
        throw new Error(`[getLocalDbStore] Failed to open DB for store ${storeName}.`);
    }
    try {
      const transaction = dbInstance.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      transaction.onerror = (event) => console.error(`[localDbService Tx Error] ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      transaction.onabort = (event) => console.warn(`[localDbService Tx Abort] ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      return store;
     } catch (error) {
         console.error(`[getLocalDbStore] Error acquiring store ${storeName} (${mode}). Potentially, store does not exist. Error:`, error);
         throw error; // Re-throw to be caught by caller
     }
  });
};

export const addLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<string> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
      return new Promise<string>((resolve, reject) => {
        const request = store.add(record);
        request.onsuccess = () => resolve(record.localId);
        request.onerror = () => reject(new Error(`Error adding record to ${storeName}: ${request.error?.message}`));
      });
    });
};

export const updateLocalRecord = <T extends { localId?: string; id?: string }>(storeName: string, record: T): Promise<void> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Error updating/adding record in ${storeName}: ${request.error?.message}`));
        });
    });
};

const deleteLocalRecordByKey = (storeName: string, key: string): Promise<void> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error(`Error deleting record from ${storeName}: ${request.error?.message}`));
        });
    });
};

const markRecordForDeletion = (storeName: string, localId: string): Promise<void> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.get(localId);
            request.onsuccess = () => {
                if (request.result) {
                    const recordToUpdate = { ...request.result, deleted: true, syncStatus: 'pending' as SyncStatus };
                    const updateRequest = store.put(recordToUpdate);
                    updateRequest.onsuccess = () => resolve();
                    updateRequest.onerror = () => reject(new Error(`Error marking record ${localId} for deletion: ${updateRequest.error?.message}`));
                } else {
                    reject(new Error(`Record ${localId} not found to mark for deletion`));
                }
            };
            request.onerror = () => reject(new Error(`Error getting record ${localId} to mark for deletion: ${request.error?.message}`));
        });
    });
};

export const clearStore = async (storeName: string): Promise<void> => {
    console.log(`[clearStore] Attempting to clear store: ${storeName}`);
    return openDB().then(dbInstance => {
        if (!dbInstance) {
            console.error(`[clearStore] Failed to open DB, dbInstance is null for store ${storeName}.`);
            throw new Error(`[clearStore] Failed to open DB for store ${storeName}.`);
        }
        return new Promise<void>((resolve, reject) => {
            try {
                const transaction = dbInstance.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => {
                    console.log(`[clearStore] Store cleared successfully: ${storeName}`);
                    resolve();
                };
                request.onerror = () => reject(new Error(`Error clearing store ${storeName}: ${request.error?.message}`));
            } catch (error) {
                reject(new Error(`Error creating transaction to clear store ${storeName}: ${String(error)}`));
            }
        });
    });
};

const getAllLocalRecords = <T>(storeName: string): Promise<T[]> => {
    return getLocalDbStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const results = (request.result as any[]).filter((item: any) => !item.deleted);
                resolve(results as T[]);
            };
            request.onerror = () => reject(new Error(`Error getting all records from ${storeName}: ${request.error?.message}`));
        });
    });
};

const getLocalRecordsBySyncStatus = <T>(storeName: string, status: SyncStatus | SyncStatus[]): Promise<T[]> => {
    return getLocalDbStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            if (!store.indexNames.contains('syncStatus')) {
                 console.warn(`[getLocalRecordsBySyncStatus] Index 'syncStatus' not found on ${storeName}. Falling back to getAll and client-side filter.`);
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as any[];
                     const statusArray = Array.isArray(status) ? status : [status];
                     const filtered = allRecords.filter(item => !item.deleted && statusArray.includes(item.syncStatus));
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
                     const request = index.getAll(s);
                     request.onsuccess = () => {
                         const results = (request.result as any[]).filter(item => !item.deleted);
                         combinedResults = combinedResults.concat(results as T[]);
                         res();
                     };
                     request.onerror = () => rej(new Error(`Error getting records by status ${s}: ${request.error?.message}`));
                }));
            });
             Promise.all(promises).then(() => resolve(combinedResults)).catch(reject);
        });
    });
};

export const getLocalRecordsByRole = <T extends { role: UserRole }>(role: UserRole): Promise<T[]> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            if (!store.indexNames.contains('role')) {
                console.warn(`[getLocalRecordsByRole] Index 'role' not found on ${STORE_USERS}. Falling back to getAll and client-side filter.`);
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    const allRecords = getAllRequest.result as T[];
                    const filtered = allRecords.filter(item => !(item as any).deleted && item.role === role);
                    resolve(filtered);
                };
                getAllRequest.onerror = () => reject(new Error(`Fallback getAll failed for ${STORE_USERS}: ${getAllRequest.error?.message}`));
                return;
            }
            const index = store.index('role');
            const request = index.getAll(role);
            request.onsuccess = () => {
                const results = (request.result as T[]).filter(item => !(item as any).deleted);
                resolve(results);
            };
            request.onerror = () => reject(new Error(`Error getting records by role ${role}: ${request.error?.message}`));
        });
    });
};

export const getLocalUser = (userId: string): Promise<LocalUser | null> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            const request = store.get(userId);
            request.onsuccess = () => resolve(request.result as LocalUser | null);
            request.onerror = () => reject(new Error(`Error getting user ${userId}: ${request.error?.message}`));
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
            request.onerror = () => reject(new Error(`Error getting user by email ${email}: ${request.error?.message}`));
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
            request.onerror = () => reject(new Error(`Error getting user by username ${username}: ${request.error?.message}`));
        });
    });
};

export const saveLocalUser = (user: DbUser): Promise<void> => {
    console.log(`[saveLocalUser] Attempting to save user. ID: ${user.id}, Email: ${user.email}, FirebaseID: ${user.firebaseId}`);
    return new Promise<void>((resolve, reject) => {
        openDB().then(dbInstance => {
            if (!dbInstance) {
                const err = new Error("DB instance is null in saveLocalUser.");
                console.error(err.message);
                return reject(err);
            }
            const transaction = dbInstance.transaction(STORE_USERS, 'readwrite');
            const store = transaction.objectStore(STORE_USERS);
            const emailIndex = store.index('email');

            const txPromise = new Promise<void>((txResolve, txReject) => {
                transaction.oncomplete = () => {
                    console.log(`[saveLocalUser] Transaction completed for user ID: ${user.id}`);
                    txResolve();
                };
                transaction.onerror = (event) => {
                    const error = (event.target as IDBTransaction)?.error || new Error("Unknown transaction error in saveLocalUser");
                    console.error(`[saveLocalUser] Transaction error for user ID ${user.id}:`, error);
                    txReject(error);
                };
                transaction.onabort = (event) => {
                    const error = (event.target as IDBTransaction)?.error || new Error("Transaction aborted in saveLocalUser");
                    console.warn(`[saveLocalUser] Transaction aborted for user ID ${user.id}:`, error);
                    txReject(error);
                };
            });

            // Step 1: Find any existing records with the same email.
            const getByEmailRequest = emailIndex.getAll(user.email);

            getByEmailRequest.onsuccess = () => {
                const existingRecordsWithEmail: DbUser[] = getByEmailRequest.result;
                const operations: Promise<void>[] = [];

                existingRecordsWithEmail.forEach(existingRec => {
                    if (existingRec.id !== user.id) {
                        console.log(`[saveLocalUser] Email conflict: '${user.email}' found with different ID '${existingRec.id}'. Current ID is '${user.id}'. Deleting conflicting record.`);
                        operations.push(new Promise<void>((deleteResolve, deleteReject) => {
                            const deleteRequest = store.delete(existingRec.id);
                            deleteRequest.onsuccess = () => {
                                console.log(`[saveLocalUser] Successfully deleted conflicting record ID: ${existingRec.id}`);
                                deleteResolve();
                            };
                            deleteRequest.onerror = () => {
                                console.error(`[saveLocalUser] Error deleting conflicting record ID ${existingRec.id}:`, deleteRequest.error);
                                deleteReject(deleteRequest.error);
                            };
                        }));
                    }
                });

                // After attempting to delete all conflicts, put the new/updated user record.
                Promise.all(operations)
                    .then(() => {
                        console.log(`[saveLocalUser] Proceeding to put user ID: ${user.id} after handling potential conflicts.`);
                        const putRequest = store.put(user);
                        putRequest.onerror = () => {
                            console.error(`[saveLocalUser] Error in final put for user ID ${user.id}:`, putRequest.error);
                            // If transaction is still active, try to abort it, though it might already be failing
                            if (transaction.readyState === "active") transaction.abort();
                        };
                        putRequest.onsuccess = () => {
                             console.log(`[saveLocalUser] Successfully put user ID: ${user.id}`);
                        };
                    })
                    .catch(deleteError => {
                        console.error(`[saveLocalUser] Error during delete operations for user ${user.id}:`, deleteError);
                        if (transaction.readyState === "active") transaction.abort();
                    });
            };

            getByEmailRequest.onerror = (event) => {
                console.error(`[saveLocalUser] Error querying email index for ${user.email}:`, (event.target as IDBRequest).error);
                if (transaction.readyState === "active") transaction.abort();
            };
            
            txPromise.then(resolve).catch(reject);

        }).catch(dbOpenError => {
            console.error("[saveLocalUser] Error opening DB for saveLocalUser:", dbOpenError);
            reject(dbOpenError);
        });
    });
};


export const deleteLocalUser = (userId: string, permanent: boolean = false): Promise<void> => {
     if (permanent) {
        return deleteLocalRecordByKey(STORE_USERS, userId);
     } else {
        return markRecordForDeletion(STORE_USERS, userId);
     }
};

export const addLocalDbVehicle = (vehicle: Omit<VehicleInfo, 'id'>, firebaseId?: string): Promise<string> => {
    const localId = `local_vehicle_${uuidv4()}`;
    const newLocalVehicle: LocalVehicle = {
        ...(vehicle as Omit<VehicleInfo, 'id'>),
        localId,
        id: firebaseId || localId,
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

export const addLocalTrip = (trip: Omit<LocalTrip, 'localId' | 'syncStatus' | 'id' | 'deleted'>): Promise<string> => {
    const localId = `local_trip_${uuidv4()}`;
    const newLocalTrip: LocalTrip = {
      ...trip,
      localId,
      id: localId,
      deleted: false,
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
        throw err;
    });
};

const markChildrenForDeletion = async (storeName: string, tripLocalId: string): Promise<void> => {
    console.log(`[markChildrenForDeletion] Marking children in ${storeName} for tripLocalId: ${tripLocalId}`);
    try {
        const store = await getLocalDbStore(storeName, 'readwrite');
        if (!store.indexNames.contains('tripLocalId')) {
            console.warn(`[markChildrenForDeletion] Index 'tripLocalId' not found on store ${storeName}. Cannot mark children for trip ${tripLocalId}.`);
            return;
        }
        const index = store.index('tripLocalId');
        let cursorReq = index.openCursor(IDBKeyRange.only(tripLocalId));
        return new Promise<void>((resolveCursor, rejectCursor) => {
             const transaction = store.transaction;
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
                        updateRequest.onerror = (errEvent) => console.error(`[markChildrenForDeletion] Error updating child ${cursor.primaryKey} in ${storeName}:`, (errEvent.target as IDBRequest).error);
                     } catch (error) {
                        console.error(`[markChildrenForDeletion] Error processing cursor value for ${cursor.primaryKey} in ${storeName}:`, error);
                        if(transaction.readyState !== 'done') transaction.abort(); // Abort if something unexpected happens
                     }
                     cursor.continue();
                 }
                 // Implicitly resolves when cursor is null and transaction completes
             };
        });
    } catch (error) {
        console.error(`[markChildrenForDeletion] Outer error in ${storeName} for trip ${tripLocalId}:`, error);
        throw error;
    }
};

export const getLocalTrips = (userId?: string, dateRange?: DateRange): Promise<LocalTrip[]> => {
    return getLocalDbStore(STORE_TRIPS, 'readonly').then(store => {
        return new Promise<LocalTrip[]>((resolve, reject) => {
            const processResults = (allRecords: LocalTrip[]) => {
                let filteredRecords = allRecords.filter(item => !item.deleted);
                const adminUser = allRecords.find(t => t.userId === userId && (t.base === 'ALL_ADM_TRIP' || t.base === 'ALL'));
                
                if (userId && !adminUser) { 
                    filteredRecords = filteredRecords.filter(item => item.userId === userId);
                }
                if (dateRange?.from) {
                    const startDate = startOfDay(dateRange.from);
                    const endDate = dateRange.to ? endOfDay(dateRange.to) : new Date(8640000000000000); 
                    const interval = { start: startDate, end: endDate };
                    filteredRecords = filteredRecords.filter(trip => {
                        try {
                            return isWithinInterval(parseISO(trip.createdAt), interval);
                        } catch { return false; }
                    });
                }
                filteredRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                resolve(filteredRecords);
            };
            
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => processResults(getAllRequest.result as LocalTrip[]);
            getAllRequest.onerror = () => reject(new Error(`Fallback/All getAll failed for ${STORE_TRIPS}: ${getAllRequest.error?.message}`));
        });
    });
};

export const getLocalVisits = (tripLocalId?: string): Promise<LocalVisit[]> => {
     return getLocalDbStore(STORE_VISITS, 'readonly').then(store => {
         return new Promise<LocalVisit[]>((resolve, reject) => {
            if (tripLocalId && store.indexNames.contains('tripLocalId')) {
                 const index = store.index('tripLocalId');
                 const request = index.getAll(tripLocalId);
                 request.onsuccess = () => {
                     const results = (request.result as LocalVisit[]).filter(item => !item.deleted);
                     results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                     resolve(results);
                 };
                 request.onerror = () => reject(new Error(`Error getting visits for trip ${tripLocalId}: ${request.error?.message}`));
             } else {
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                    let allRecords = getAllRequest.result as LocalVisit[];
                     if (tripLocalId) {
                         allRecords = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     } else {
                         allRecords = allRecords.filter(item => !item.deleted);
                     }
                     allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
        userId: visit.userId, 
        deleted: false,
        syncStatus: 'pending',
    };
    return addLocalRecord<LocalVisit>(STORE_VISITS, newLocalVisit);
};

export const updateLocalVisit = (visit: LocalVisit): Promise<void> => {
    const updatedSyncStatus = visit.syncStatus === 'synced' && !visit.deleted ? 'pending' : visit.syncStatus;
    const updatedVisit = { ...visit, userId: visit.userId, syncStatus: updatedSyncStatus };
    return updateLocalRecord<LocalVisit>(STORE_VISITS, updatedVisit);
};

export const deleteLocalVisit = (localId: string): Promise<void> => {
    return markRecordForDeletion(STORE_VISITS, localId);
};

export const getLocalExpenses = (tripLocalId?: string): Promise<LocalExpense[]> => {
     return getLocalDbStore(STORE_EXPENSES, 'readonly').then(store => {
         return new Promise<LocalExpense[]>((resolve, reject) => {
            if (tripLocalId && store.indexNames.contains('tripLocalId')) {
                  const index = store.index('tripLocalId');
                  const request = index.getAll(tripLocalId);
                  request.onsuccess = () => {
                      const results = (request.result as LocalExpense[]).filter(item => !item.deleted);
                      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                      resolve(results);
                  };
                  request.onerror = () => reject(new Error(`Error getting expenses for trip ${tripLocalId}: ${request.error?.message}`));
              } else {
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                    let allRecords = getAllRequest.result as LocalExpense[];
                     if (tripLocalId) {
                         allRecords = allRecords.filter(item => !item.deleted && item.tripLocalId === tripLocalId);
                     } else {
                         allRecords = allRecords.filter(item => !item.deleted);
                     }
                     allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
         userId: expense.userId, 
         deleted: false,
         syncStatus: 'pending',
     };
     return addLocalRecord<LocalExpense>(STORE_EXPENSES, newLocalExpense);
};

export const updateLocalExpense = (expense: LocalExpense): Promise<void> => {
     const updatedSyncStatus = expense.syncStatus === 'synced' && !expense.deleted ? 'pending' : expense.syncStatus;
     const updatedExpense = { ...expense, userId: expense.userId, syncStatus: updatedSyncStatus };
     return updateLocalRecord<LocalExpense>(STORE_EXPENSES, updatedExpense);
};

export const deleteLocalExpense = (localId: string): Promise<void> => {
     return markRecordForDeletion(STORE_EXPENSES, localId);
};

export const getLocalFuelings = (tripLocalIdOrVehicleId?: string, filterBy: 'tripLocalId' | 'vehicleId' = 'tripLocalId'): Promise<LocalFueling[]> => {
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
                       resolve(results);
                   };
                   request.onerror = () => reject(new Error(`Error getting fuelings for ${filterBy} ${tripLocalIdOrVehicleId}: ${request.error?.message}`));
               } else {
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
          userId: fueling.userId, 
          deleted: false,
          syncStatus: 'pending',
      };
      return addLocalRecord<LocalFueling>(STORE_FUELINGS, newLocalFueling);
};

export const updateLocalFueling = (fueling: LocalFueling): Promise<void> => {
      const updatedSyncStatus = fueling.syncStatus === 'synced' && !fueling.deleted ? 'pending' : fueling.syncStatus;
      const updatedFueling = { ...fueling, userId: fueling.userId, syncStatus: updatedSyncStatus };
      return updateLocalRecord<LocalFueling>(STORE_FUELINGS, updatedFueling);
};

export const deleteLocalFueling = (localId: string): Promise<void> => {
      return markRecordForDeletion(STORE_FUELINGS, localId);
};

export const addLocalCustomType = (storeName: string, typeName: string): Promise<string> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<string>((resolve, reject) => {
            const nameIndex = store.index('name');
            const checkNameRequest = nameIndex.get(typeName);

            checkNameRequest.onsuccess = () => {
                if (checkNameRequest.result && !checkNameRequest.result.deleted) {
                     console.warn(`[addLocalCustomType] Type with name "${typeName}" already exists in ${storeName} and is not deleted.`);
                     reject(new Error(`O tipo "${typeName}" já existe.`));
                     return;
                }
                
                const localId = `local_${storeName.replace('Store', '').toLowerCase()}_type_${uuidv4()}`;
                const newCustomType: CustomType = {
                    localId,
                    id: localId,
                    name: typeName,
                    syncStatus: 'pending',
                    deleted: false,
                };
                const addRequest = store.add(newCustomType);
                addRequest.onsuccess = () => resolve(localId);
                addRequest.onerror = () => reject(new Error(addRequest.error?.message || `Falha ao adicionar tipo a ${storeName}`));

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
    const pendingStatus: SyncStatus[] = ['pending', 'error'];
    try {
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
        return { trips, visits, expenses, fuelings, vehicles, users, visitTypes, expenseTypes };
    } catch (error) {
        console.error("[getPendingRecords] Error fetching pending records:", error);
        return { trips: [], visits: [], expenses: [], fuelings: [], vehicles: [], users: [], visitTypes: [], expenseTypes: [] };
    }
};

export const updateSyncStatus = async (storeName: string, localId: string, firebaseId: string | undefined, status: SyncStatus, additionalUpdates: Record<string, any> = {}): Promise<void> => {
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
                        if(recordToUpdate.deleted) {
                            // console.log(`[updateSyncStatus] Record ${localId} in ${storeName} is deleted and has no firebaseId. Marking as synced for local cleanup.`);
                        } else {
                            console.error(`[updateSyncStatus] Cannot mark ${localId} in ${storeName} as synced without firebaseId unless it's marked for deletion.`);
                            reject(new Error(`Cannot mark ${localId} as synced without firebaseId.`));
                            return;
                        }
                    }
                    const updateRequest = store.put(recordToUpdate);
                    updateRequest.onsuccess = () => resolve();
                    updateRequest.onerror = () => reject(new Error(`Error updating sync status for ${localId} in ${storeName}: ${updateRequest.error?.message}`));
                } else {
                    reject(new Error(`Record ${localId} not found in ${storeName} to update sync status`));
                }
            };
            request.onerror = () => reject(new Error(`Error getting record ${localId} from ${storeName} for sync status update: ${request.error?.message}`));
        });
    });
};

export const cleanupDeletedRecords = async (): Promise<void> => {
    const stores = [STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES, STORE_USERS, STORE_VISIT_TYPES, STORE_EXPENSE_TYPES];
    for (const storeName of stores) {
        try {
            const store = await getLocalDbStore(storeName, 'readwrite');
            if (!store.indexNames.contains('deleted')) {
                console.warn(`[Cleanup] Store ${storeName} does not have a 'deleted' index. Skipping cleanup for this store.`);
                continue;
            }
            const index = store.index('deleted');
            const writeTx = store.transaction;

            await new Promise<void>((resolveTx, rejectTx) => {
                const itemsToDeleteKeys: IDBValidKey[] = [];
                let cursorReq = index.openCursor(IDBKeyRange.only(true as any)); // Query for deleted: true

                cursorReq.onerror = (event: Event) => {
                    console.error(`[Cleanup] Error opening cursor on 'deleted' index for ${storeName}:`, (event.target as IDBRequest).error);
                    rejectTx((event.target as IDBRequest).error);
                };

                cursorReq.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
                    if (cursor) {
                        if (cursor.value && cursor.value.deleted === true && cursor.value.syncStatus === 'synced') {
                            itemsToDeleteKeys.push(cursor.primaryKey);
                        }
                        cursor.continue();
                    } else {
                        // Cursor finished
                        if (itemsToDeleteKeys.length > 0) {
                            let deleteCount = 0;
                            itemsToDeleteKeys.forEach(key => {
                                const deleteRequest = store.delete(key);
                                deleteRequest.onsuccess = () => {
                                    deleteCount++;
                                    if (deleteCount === itemsToDeleteKeys.length) {
                                        // All deletes attempted
                                    }
                                };
                                deleteRequest.onerror = (delEvent) => {
                                    console.error(`[Cleanup] Error deleting record ${key} from ${storeName}:`, (delEvent.target as IDBRequest).error);
                                    deleteCount++;
                                    if (deleteCount === itemsToDeleteKeys.length) {
                                        // All deletes attempted
                                    }
                                };
                            });
                        }
                    }
                };
                // Rely on transaction events for final promise resolution
                writeTx.oncomplete = () => resolveTx();
                writeTx.onerror = (txEvent) => rejectTx((txEvent.target as IDBTransaction).error);
                writeTx.onabort = (txEvent) => rejectTx((txEvent.target as IDBTransaction).error || new Error('Transaction aborted during cleanup'));
            });
            console.log(`[Cleanup] Finished processing store ${storeName}.`);
        } catch (error) {
            console.error(`[Cleanup] Error during cleanup setup for store ${storeName}:`, error);
        }
    }
     console.log("[Cleanup] All stores processed for cleanup.");
};

export const seedInitialUsers = async (): Promise<void> => {
    console.log("[seedInitialUsers] Attempting to seed initial users...");
    const dbInstance = await openDB();
    if (!dbInstance) {
        const err = new Error("DB instance is null, cannot seed users.");
        console.error(err.message);
        throw err;
    }

    const countTransaction = dbInstance.transaction(STORE_USERS, 'readonly');
    const countStore = countTransaction.objectStore(STORE_USERS);
    const countRequest = countStore.count();
    let userCount = 0;

    const countPromise = new Promise<number>((resolve, reject) => {
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = (event) => reject((event.target as IDBRequest).error);
        countTransaction.oncomplete = () => resolve(countRequest.result); // Also resolve on complete
        countTransaction.onerror = (event) => reject((event.target as IDBTransaction).error);
        countTransaction.onabort = (event) => reject((event.target as IDBTransaction).error || new Error("Count transaction aborted"));
    });

    try {
        userCount = await countPromise;
        console.log(`[seedInitialUsers] Found ${userCount} existing users.`);
    } catch (error) {
        console.error("[seedInitialUsers] Error counting users, assuming 0 and proceeding with seed if possible:", error);
        userCount = 0; // Assume 0 if count fails, to allow seeding on potentially fresh DB
    }

    if (userCount > 0) {
        console.log("[seedInitialUsers] Users already exist or count failed but assuming existence, skipping seed.");
        return;
    }

    console.log("[seedInitialUsers] No users found or count failed, proceeding with hashing passwords for seeding.");
    let usersToSeedWithHashedPasswords: LocalUser[];
    try {
        const hashPromises = seedUsersData.map(async (user) => {
            const hash = await bcrypt.hash(user.password, 10);
            const { password, ...userData } = user;
            return {
                ...userData,
                id: user.id || user.email, // Ensure ID is set
                username: user.username || user.email.split('@')[0],
                passwordHash: hash,
                lastLogin: new Date().toISOString(),
                role: user.role || 'driver',
                base: user.role === 'admin' ? 'ALL' : (user.base || 'N/A'),
                deleted: false,
                firebaseId: user.id || user.email, // Assume seeded users are "synced" with this ID
                syncStatus: 'synced' as SyncStatus,
            };
        });
        usersToSeedWithHashedPasswords = await Promise.all(hashPromises);
        console.log(`[seedInitialUsers] ${usersToSeedWithHashedPasswords.length} users prepared with hashed passwords.`);
    } catch (hashError) {
        console.error("[seedInitialUsers] Error hashing passwords for seed data:", hashError);
        throw hashError; // Propagate error
    }

    if (usersToSeedWithHashedPasswords.length === 0) {
        console.log("[seedInitialUsers] No users prepared to seed after hashing (this shouldn't happen with seed data).");
        return;
    }
    
    const writeTransaction = dbInstance.transaction(STORE_USERS, 'readwrite');
    const store = writeTransaction.objectStore(STORE_USERS);
    
    const txCompletionPromise = new Promise<void>((resolve, reject) => {
        writeTransaction.oncomplete = () => {
            console.log("[seedInitialUsers] Seed users transaction successfully completed.");
            resolve();
        };
        writeTransaction.onerror = (event) => {
            console.error("[seedInitialUsers] Seed users transaction error:", (event.target as IDBTransaction).error);
            reject((event.target as IDBTransaction).error);
        };
        writeTransaction.onabort = (event) => {
            console.warn("[seedInitialUsers] Seed users transaction aborted:", (event.target as IDBTransaction).error);
            reject((event.target as IDBTransaction).error || new Error("Seed users transaction aborted"));
        };
    });

    console.log(`[seedInitialUsers] Starting to add/update ${usersToSeedWithHashedPasswords.length} users in transaction.`);
    usersToSeedWithHashedPasswords.forEach(user => {
        try {
            const request = store.put(user); // Use put for idempotency during seeding
            request.onerror = () => {
                console.warn(`[seedInitialUsers] Error on put for user ${user.email} (ID: ${user.id}):`, request.error);
                // Don't abort transaction here, let it try to continue for other users
            };
            request.onsuccess = () => {
                // console.log(`[seedInitialUsers] Successfully put user ${user.email} (ID: ${user.id}).`);
            };
        } catch (e) {
            // This catch is for synchronous errors if store.put itself throws, which is rare.
            console.error(`[seedInitialUsers] Synchronous error calling store.put for user ${user.email}:`, e);
            if (writeTransaction.readyState === 'active') {
                writeTransaction.abort(); // Abort if a sync error occurs
            }
            // No need to reject txCompletionPromise here, transaction.onerror/onabort will handle it
            return; // Stop trying to add more users if a sync error happens during put
        }
    });

    return txCompletionPromise;
};

// Initial call to open the DB and seed users when the service loads
openDB().then(() => seedInitialUsers()).catch(error => console.error("Failed to initialize/seed IndexedDB on load:", error));

