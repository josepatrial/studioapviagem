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
const DB_VERSION = 6; // Incremented version for new stores

export const STORE_VEHICLES = 'vehicles';
export const STORE_TRIPS = 'trips';
export const STORE_VISITS = 'visits';
export const STORE_EXPENSES = 'expenses';
export const STORE_FUELINGS = 'fuelings';
export const STORE_USERS = 'users';
export const STORE_VISIT_TYPES = 'visitTypesStore'; // New store
export const STORE_EXPENSE_TYPES = 'expenseTypesStore'; // New store


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

// New types for custom type stores
export interface CustomType {
  id: string; // The type name itself will be the ID
  name: string;
}


const seedUsersData: (Omit<LocalUser, 'passwordHash' | 'lastLogin' | 'deleted' | 'firebaseId'> & {password: string})[] = [
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
      db = null; // Ensure db is null on error
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
           console.error('[localDbService] IndexedDB connection error:', (event.target as IDBDatabase)?.error);
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
           request.onerror = () => reject("Upgrade transaction failed.");
           return;
       }

      const storesToUpgrade = [
          { name: STORE_VEHICLES, indices: [{name: 'firebaseId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}]},
          { name: STORE_TRIPS, indices: [{name: 'firebaseId', unique: false}, {name: 'userId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}, {name: 'createdAt', unique: false}, {name: 'base', unique: false}]},
          { name: STORE_VISITS, indices: [{name: 'tripLocalId', unique: false}, {name: 'firebaseId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}, {name: 'timestamp', unique: false}, {name: 'visitType', unique: false}, {name: 'userId', unique: false}]},
          { name: STORE_EXPENSES, indices: [{name: 'tripLocalId', unique: false}, {name: 'firebaseId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}, {name: 'timestamp', unique: false}, {name: 'userId', unique: false}]},
          { name: STORE_FUELINGS, indices: [{name: 'tripLocalId', unique: false}, {name: 'firebaseId', unique: false}, {name: 'syncStatus', unique: false}, {name: 'deleted', unique: false}, {name: 'date', unique: false}, {name: 'vehicleId', unique: false}, {name: 'odometerKm', unique: false}, {name: 'fuelType', unique: false}, {name: 'userId', unique: false}]},
          { name: STORE_USERS, indices: [{name: 'email', unique: true}, {name: 'username', unique: true}, {name: 'lastLogin', unique: false}, {name: 'role', unique: false}, {name: 'base', unique: false}, {name: 'deleted', unique: false}]},
          { name: STORE_VISIT_TYPES, indices: [] }, // New store for visit types, id is key
          { name: STORE_EXPENSE_TYPES, indices: [] } // New store for expense types, id is key
      ];

      storesToUpgrade.forEach(storeInfo => {
          let objectStore: IDBObjectStore;
          if (!tempDb.objectStoreNames.contains(storeInfo.name)) {
              objectStore = tempDb.createObjectStore(storeInfo.name, { keyPath: 'id' }); // Use 'id' as keyPath
          } else {
              objectStore = transaction.objectStore(storeInfo.name);
          }
          storeInfo.indices.forEach(indexInfo => {
              if (!objectStore.indexNames.contains(indexInfo.name)) {
                  objectStore.createIndex(indexInfo.name, indexInfo.name, { unique: indexInfo.unique });
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
    try {
      const transaction = dbInstance.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      transaction.onerror = (event) => console.error(`[localDbService Tx Error] ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      transaction.onabort = (event) => console.warn(`[localDbService Tx Abort] ${storeName} (${mode}):`, (event.target as IDBTransaction)?.error);
      return store;
     } catch (error) {
         console.error(`[getLocalDbStore] Error acquiring store ${storeName} (${mode})`, error);
         throw error;
     }
  });
};

export const addLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<string> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
      return new Promise<string>((resolve, reject) => {
        const request = store.add(record);
        request.onsuccess = () => resolve(record.localId);
        request.onerror = () => reject(`Error adding record to ${storeName}: ${request.error?.message}`);
      });
    });
};

export const updateLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<void> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(`Error updating/adding record in ${storeName}: ${request.error?.message}`);
        });
    });
};

const deleteLocalRecordByKey = (storeName: string, key: string): Promise<void> => {
    return getLocalDbStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(`Error deleting record from ${storeName}: ${request.error?.message}`);
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
                    updateRequest.onerror = () => reject(`Error marking record ${localId} for deletion: ${updateRequest.error?.message}`);
                } else {
                    reject(`Record ${localId} not found to mark for deletion`);
                }
            };
            request.onerror = () => reject(`Error getting record ${localId} to mark for deletion: ${request.error?.message}`);
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
            request.onerror = () => reject(`Error getting all records from ${storeName}: ${request.error?.message}`);
        });
    });
};

const getLocalRecordsBySyncStatus = <T>(storeName: string, status: SyncStatus | SyncStatus[]): Promise<T[]> => {
    return getLocalDbStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            if (!store.indexNames.contains('syncStatus')) {
                 const getAllRequest = store.getAll();
                 getAllRequest.onsuccess = () => {
                     const allRecords = getAllRequest.result as any[];
                     const statusArray = Array.isArray(status) ? status : [status];
                     const filtered = allRecords.filter(item => !item.deleted && statusArray.includes(item.syncStatus));
                     resolve(filtered as T[]);
                 };
                 getAllRequest.onerror = () => reject(`Fallback getAll failed for ${storeName}: ${getAllRequest.error?.message}`);
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
                     request.onerror = () => rej(`Error getting records by status ${s}: ${request.error?.message}`);
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
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    const allRecords = getAllRequest.result as T[];
                    const filtered = allRecords.filter(item => !(item as any).deleted && item.role === role);
                    resolve(filtered);
                };
                getAllRequest.onerror = () => reject(`Fallback getAll failed for ${STORE_USERS}: ${getAllRequest.error?.message}`);
                return;
            }
            const index = store.index('role');
            const request = index.getAll(role);
            request.onsuccess = () => {
                const results = (request.result as T[]).filter(item => !(item as any).deleted);
                resolve(results);
            };
            request.onerror = () => reject(`Error getting records by role ${role}: ${request.error?.message}`);
        });
    });
};

export const getLocalUser = (userId: string): Promise<LocalUser | null> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            const request = store.get(userId);
            request.onsuccess = () => resolve(request.result as LocalUser | null);
            request.onerror = () => reject(`Error getting user ${userId}: ${request.error?.message}`);
        });
    });
};

export const getLocalUserByEmail = (email: string): Promise<LocalUser | null> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            if (!store.indexNames.contains('email')) {
                 reject(`Index 'email' not found on ${STORE_USERS}`);
                 return;
             }
            const index = store.index('email');
            const request = index.get(email);
            request.onsuccess = () => resolve(request.result as LocalUser | null);
            request.onerror = () => reject(`Error getting user by email ${email}: ${request.error?.message}`);
        });
    });
};

export const getLocalUserByUsername = (username: string): Promise<LocalUser | null> => {
    return getLocalDbStore(STORE_USERS, 'readonly').then(store => {
        return new Promise<LocalUser | null>((resolve, reject) => {
            if (!store.indexNames.contains('username')) {
                 reject(`Index 'username' not found on ${STORE_USERS}.`);
                 return;
             }
            const index = store.index('username');
            const request = index.get(username);
            request.onsuccess = () => resolve(request.result as LocalUser | null);
            request.onerror = () => reject(`Error getting user by username ${username}: ${request.error?.message}`);
        });
    });
};

export const saveLocalUser = (user: LocalUser): Promise<void> => {
    return getLocalDbStore(STORE_USERS, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            const request = store.put(user);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(`Error saving user ${user.id}: ${request.error?.message}`);
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
    const updatedSyncStatus = vehicle.syncStatus === 'synced' ? 'pending' : vehicle.syncStatus;
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
    return Promise.all([
        markRecordForDeletion(STORE_TRIPS, localId),
        markChildrenForDeletion(STORE_VISITS, localId),
        markChildrenForDeletion(STORE_EXPENSES, localId),
        markChildrenForDeletion(STORE_FUELINGS, localId)
    ]).then(() => {}).catch(err => {
        console.error(`[deleteLocalTrip] Error marking trip ${localId} or children:`, err);
        throw err;
    });
};

const markChildrenForDeletion = async (storeName: string, tripLocalId: string): Promise<void> => {
    try {
        const store = await getLocalDbStore(storeName, 'readwrite');
        if (!store.indexNames.contains('tripLocalId')) {
            console.warn(`[markChildren] Index 'tripLocalId' not found on store ${storeName}. Cannot mark children for trip ${tripLocalId}.`);
            return;
        }
        const index = store.index('tripLocalId');
        let cursorReq = index.openCursor(IDBKeyRange.only(tripLocalId));
        return new Promise<void>((resolveCursor, rejectCursor) => {
             const transaction = store.transaction;
             transaction.onerror = (event) => rejectCursor((event.target as IDBRequest).error);
             transaction.oncomplete = () => resolveCursor();
             cursorReq.onerror = (event) => rejectCursor((event.target as IDBRequest).error);
             cursorReq.onsuccess = (event) => {
                 const cursor = (event.target as IDBRequest).result;
                 if (cursor) {
                     try {
                        const recordToUpdate = { ...cursor.value, deleted: true, syncStatus: 'pending' as SyncStatus };
                        const updateRequest = cursor.update(recordToUpdate);
                        updateRequest.onerror = (errEvent) => console.error(`[markChildren] Error updating child ${cursor.primaryKey}:`, (errEvent.target as IDBRequest).error);
                     } catch (error) {
                        console.error(`[markChildren] Error processing cursor value for ${cursor.primaryKey}:`, error);
                        if(transaction.abort && transaction.readyState !== 'done') transaction.abort();
                     }
                     cursor.continue();
                 }
             };
        });
    } catch (error) {
        console.error(`[markChildren] Error in ${storeName} for trip ${tripLocalId}:`, error);
        throw error;
    }
};

export const getLocalTrips = (userId?: string, dateRange?: DateRange): Promise<LocalTrip[]> => {
    return getLocalDbStore(STORE_TRIPS, 'readonly').then(store => {
        return new Promise<LocalTrip[]>((resolve, reject) => {
            const processResults = (allRecords: LocalTrip[]) => {
                let filteredRecords = allRecords.filter(item => !item.deleted);
                if (userId && !isAdminUser(userId, filteredRecords)) { // Check if user is admin
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
            // Helper to check if user is admin (simplified, assuming admin has a specific base or role property)
            const isAdminUser = (uid: string, allTrips: LocalTrip[]) => {
                 // Example: if admin users have base 'ALL_ADM_TRIP' or a specific role
                 const adminTrip = allTrips.find(t => t.userId === uid && t.base === 'ALL_ADM_TRIP');
                 return !!adminTrip;
            };

            if (userId && store.indexNames.contains('userId')) {
                const index = store.index('userId');
                const request = index.getAll(userId);
                request.onsuccess = () => {
                    // If it's an admin, fetch all trips to let processResults handle it
                    // This part needs refinement based on how admin role is identified.
                    // For now, if it's an admin email, fetch all.
                    if (userId.includes('admin@grupo2irmaos.com.br') || userId.includes('grupo2irmaos@grupo2irmaos.com.br')) {
                         const getAllReq = store.getAll();
                         getAllReq.onsuccess = () => processResults(getAllReq.result as LocalTrip[]);
                         getAllReq.onerror = () => reject(`Fallback/All getAll failed for ${STORE_TRIPS}: ${getAllReq.error?.message}`);
                    } else {
                        processResults(request.result as LocalTrip[]);
                    }
                };
                request.onerror = () => reject(`Error getting trips for user ${userId}: ${request.error?.message}`);
            } else {
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => processResults(getAllRequest.result as LocalTrip[]);
                getAllRequest.onerror = () => reject(`Fallback/All getAll failed for ${STORE_TRIPS}: ${getAllRequest.error?.message}`);
            }
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
                 request.onerror = () => reject(`Error getting visits for trip ${tripLocalId}: ${request.error?.message}`);
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
                  getAllRequest.onerror = () => reject(`Fallback/All getAll failed for ${STORE_VISITS}: ${getAllRequest.error?.message}`);
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
        userId: visit.userId, // Ensure userId is included from the passed visit object
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
                  request.onerror = () => reject(`Error getting expenses for trip ${tripLocalId}: ${request.error?.message}`);
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
                  getAllRequest.onerror = () => reject(`Fallback/All getAll failed for ${STORE_EXPENSES}: ${getAllRequest.error?.message}`);
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
         userId: expense.userId, // Ensure userId is included
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
                   request.onerror = () => reject(`Error getting fuelings for ${filterBy} ${tripLocalIdOrVehicleId}: ${request.error?.message}`);
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
                  getAllRequest.onerror = () => reject(`Fallback/All getAll failed for ${STORE_FUELINGS}: ${getAllRequest.error?.message}`);
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
          userId: fueling.userId, // Ensure userId is included
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

export const getPendingRecords = async (): Promise<{
  trips: LocalTrip[],
  visits: LocalVisit[],
  expenses: LocalExpense[],
  fuelings: LocalFueling[],
  vehicles: LocalVehicle[],
  users: LocalUser[],
}> => {
    const pendingStatus: SyncStatus[] = ['pending', 'error'];
    try {
        const [trips, visits, expenses, fuelings, vehicles, users] = await Promise.all([
            getLocalRecordsBySyncStatus<LocalTrip>(STORE_TRIPS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalVisit>(STORE_VISITS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalExpense>(STORE_EXPENSES, pendingStatus),
            getLocalRecordsBySyncStatus<LocalFueling>(STORE_FUELINGS, pendingStatus),
            getLocalRecordsBySyncStatus<LocalVehicle>(STORE_VEHICLES, pendingStatus),
            getLocalRecordsBySyncStatus<LocalUser>(STORE_USERS, pendingStatus),
        ]);
        return { trips, visits, expenses, fuelings, vehicles, users };
    } catch (error) {
        console.error("[getPendingRecords] Error fetching pending records:", error);
        return { trips: [], visits: [], expenses: [], fuelings: [], vehicles: [], users: [] };
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
                         reject(`Cannot mark ${localId} as synced without firebaseId.`);
                         return;
                    }
                    const updateRequest = store.put(recordToUpdate);
                    updateRequest.onsuccess = () => resolve();
                    updateRequest.onerror = () => reject(`Error updating sync status for ${localId}: ${updateRequest.error?.message}`);
                } else {
                    reject(`Record ${localId} not found to update sync status`);
                }
            };
            request.onerror = () => reject(`Error getting record ${localId} for sync status update: ${request.error?.message}`);
        });
    });
};

export const cleanupDeletedRecords = async (): Promise<void> => {
    const stores = [STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES, STORE_USERS];
    for (const storeName of stores) {
        try {
            const store = await getLocalDbStore(storeName, 'readwrite');
            if (!store.indexNames.contains('deleted')) {
                console.warn(`[Cleanup] Store ${storeName} does not have a 'deleted' index. Skipping cleanup for this store.`);
                continue;
            }
            const index = store.index('deleted');
            const writeTx = store.transaction; // Get the transaction associated with the store

            let cursorReq = index.openCursor(IDBKeyRange.only(true)); // Only fetch records where deleted is true

            await new Promise<void>((resolveCursor, rejectCursor) => {
                cursorReq.onerror = (event: Event) => {
                    console.error(`[Cleanup] Error opening cursor on 'deleted' index for ${storeName}:`, (event.target as IDBRequest).error);
                    rejectCursor((event.target as IDBRequest).error);
                };
                cursorReq.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                        if (cursor.value && cursor.value.deleted === true && cursor.value.syncStatus === 'synced') {
                            console.log(`[Cleanup] Deleting record ${cursor.primaryKey} from ${storeName}`);
                            const deleteRequest = cursor.delete();
                            deleteRequest.onerror = (delEvent) => {
                                console.error(`[Cleanup] Error deleting record ${cursor.primaryKey} from ${storeName}:`, (delEvent.target as IDBRequest).error);
                            };
                        }
                        cursor.continue();
                    } else {
                        // Cursor finished
                        resolveCursor();
                    }
                };
            });

            // Wait for the transaction to complete
            await new Promise<void>((resolveTx, rejectTx) => {
                writeTx.oncomplete = () => {
                    console.log(`[Cleanup] Transaction completed for ${storeName}.`);
                    resolveTx();
                };
                writeTx.onerror = (txEvent) => {
                    console.error(`[Cleanup] Transaction error during cleanup for ${storeName}:`, (txEvent.target as IDBTransaction).error);
                    rejectTx((txEvent.target as IDBTransaction).error);
                };
                writeTx.onabort = (txEvent) => {
                    console.warn(`[Cleanup] Transaction aborted during cleanup for ${storeName}:`, (txEvent.target as IDBTransaction).error);
                    rejectTx((txEvent.target as IDBTransaction).error || new Error('Transaction aborted'));
                };
            });

        } catch (error) {
            console.error(`[Cleanup] Error during cleanup setup for store ${storeName}:`, error);
        }
    }
};

// --- Functions for Visit Types and Expense Types ---

// Generic function to add a type to a store
const addCustomType = async (storeName: string, typeName: string): Promise<void> => {
    const store = await getLocalDbStore(storeName, 'readwrite');
    const typeRecord: CustomType = { id: typeName, name: typeName }; // Using typeName as id and name
    return new Promise<void>((resolve, reject) => {
        const request = store.get(typeName); // Check if type already exists
        request.onsuccess = () => {
            if (request.result) {
                reject(new Error(`Type "${typeName}" already exists in ${storeName}.`));
            } else {
                const addRequest = store.add(typeRecord);
                addRequest.onsuccess = () => resolve();
                addRequest.onerror = () => reject(addRequest.error || new Error(`Failed to add type to ${storeName}`));
            }
        };
        request.onerror = () => reject(request.error || new Error(`Failed to check existing type in ${storeName}`));
    });
};

// Generic function to get all types from a store
const getCustomTypes = async (storeName: string): Promise<string[]> => {
    const store = await getLocalDbStore(storeName, 'readonly');
    return new Promise<string[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const records = request.result as CustomType[];
            resolve(records.map(record => record.name).sort());
        };
        request.onerror = () => reject(request.error || new Error(`Failed to get types from ${storeName}`));
    });
};

// Generic function to delete a type from a store
const deleteCustomType = async (storeName: string, typeName: string): Promise<void> => {
    const store = await getLocalDbStore(storeName, 'readwrite');
    return new Promise<void>((resolve, reject) => {
        const request = store.delete(typeName); // Delete by typeName (which is the id)
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error(`Failed to delete type from ${storeName}`));
    });
};

// Visit Types
export const addLocalVisitType = (typeName: string): Promise<void> => addCustomType(STORE_VISIT_TYPES, typeName);
export const getLocalVisitTypes = (): Promise<string[]> => getCustomTypes(STORE_VISIT_TYPES);
export const deleteLocalVisitType = (typeName: string): Promise<void> => deleteCustomType(STORE_VISIT_TYPES, typeName);

// Expense Types
export const addLocalExpenseType = (typeName: string): Promise<void> => addCustomType(STORE_EXPENSE_TYPES, typeName);
export const getLocalExpenseTypes = (): Promise<string[]> => getCustomTypes(STORE_EXPENSE_TYPES);
export const deleteLocalExpenseType = (typeName: string): Promise<void> => deleteCustomType(STORE_EXPENSE_TYPES, typeName);


export const seedInitialUsers = async (): Promise<void> => {
    console.log("[seedInitialUsers] Attempting to seed initial users...");
    const dbInstance = await openDB();
    if (!dbInstance) {
        console.error("[seedInitialUsers] DB instance is null, cannot seed users.");
        throw new Error("DB instance is null for seeding.");
    }

    let userCount = 0;
    try {
        const countTransaction = dbInstance.transaction(STORE_USERS, 'readonly');
        const countStore = countTransaction.objectStore(STORE_USERS);
        const countRequest = countStore.count();
        userCount = await new Promise<number>((resolve, reject) => {
            countRequest.onsuccess = () => resolve(countRequest.result);
            countRequest.onerror = (event) => reject((event.target as IDBRequest).error);
        });
        await new Promise((resolve, reject) => {
            countTransaction.oncomplete = resolve;
            countTransaction.onerror = (event) => reject((event.target as IDBTransaction).error);
            countTransaction.onabort = (event) => reject((event.target as IDBTransaction).error || new Error("Count transaction aborted"));
        });
        console.log(`[seedInitialUsers] Found ${userCount} existing users.`);
    } catch (error) {
        console.error("[seedInitialUsers] Error in read-only transaction for counting users:", error);
        throw error; // Propagate error
    }

    if (userCount === 0) {
        console.log("[seedInitialUsers] No users found, proceeding with seeding.");
        const usersToSeedWithHashedPasswords: LocalUser[] = [];
        try {
            for (const user of seedUsersData) {
                const hash = await bcrypt.hash(user.password, 10);
                const { password, ...userData } = user;
                usersToSeedWithHashedPasswords.push({
                    ...userData,
                    id: user.id || user.email,
                    username: user.username || user.email.split('@')[0],
                    passwordHash: hash,
                    lastLogin: new Date().toISOString(),
                    role: user.role || 'driver',
                    base: user.role === 'admin' ? 'ALL' : (user.base || 'N/A'),
                    deleted: false,
                    firebaseId: user.id || user.email,
                    syncStatus: 'synced',
                });
            }
            console.log("[seedInitialUsers] Passwords hashed for seed users.");
        } catch (hashError) {
            console.error("[seedInitialUsers] Error hashing passwords for seed data:", hashError);
            throw hashError;
        }

        return new Promise<void>((resolve, reject) => {
            const writeTransaction = dbInstance.transaction(STORE_USERS, 'readwrite');
            const store = writeTransaction.objectStore(STORE_USERS);

            writeTransaction.oncomplete = () => {
                console.log("[seedInitialUsers] Seeding transaction completed successfully.");
                resolve();
            };
            writeTransaction.onerror = (event) => {
                console.error("[seedInitialUsers] Seeding transaction error:", (event.target as IDBTransaction).error);
                reject((event.target as IDBTransaction).error);
            };
            writeTransaction.onabort = (event) => {
                console.warn("[seedInitialUsers] Seeding transaction aborted:", (event.target as IDBTransaction).error);
                reject((event.target as IDBTransaction).error || new Error("Transaction aborted"));
            };

            if (usersToSeedWithHashedPasswords.length === 0) {
                 console.log("[seedInitialUsers] No users prepared to seed (after hashing).");
                 // If there are no users to seed, the transaction will complete without any operations.
                 // This is not an error state for this function, so we don't explicitly reject.
                 // The oncomplete will handle resolving.
                return;
            }
            
            usersToSeedWithHashedPasswords.forEach(user => {
                const request = store.put(user); // Using put for simplicity in seeding
                request.onerror = () => {
                    console.error(`[seedInitialUsers] Error putting user ${user.email} (ID: ${user.id}):`, request.error);
                    // Do not reject here, let the transaction's onerror handle overall failure.
                };
                request.onsuccess = () => {
                    console.log(`[seedInitialUsers] Successfully put user ${user.email} (ID: ${user.id}).`);
                };
            });
        });
    } else {
        console.log("[seedInitialUsers] Users already exist, skipping seed.");
        return Promise.resolve();
    }
};
// Initial call to open the DB and seed users when the service loads
openDB().then(() => seedInitialUsers()).catch(error => console.error("Failed to initialize/seed IndexedDB on load:", error));
