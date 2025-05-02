// src/services/localDbService.ts
import type { VehicleInfo } from '@/components/Vehicle';
import type { Trip } from '@/components/Trips/Trips';
import type { Visit } from '@/components/Trips/Visits';
import type { Expense } from '@/components/Trips/Expenses';
import type { Fueling } from '@/components/Trips/Fuelings';
import { v4 as uuidv4 } from 'uuid'; // Import uuid

const DB_NAME = 'RotaCertaDB';
const DB_VERSION = 1;

// Define object stores
const STORE_VEHICLES = 'vehicles';
const STORE_TRIPS = 'trips';
const STORE_VISITS = 'visits';
const STORE_EXPENSES = 'expenses';
const STORE_FUELINGS = 'fuelings';

// Define sync status type
export type SyncStatus = 'pending' | 'synced' | 'error';

// Extend interfaces to include sync status and optional Firebase ID
interface LocalRecord {
  syncStatus: SyncStatus;
  firebaseId?: string; // Store the Firebase ID if synced
  deleted?: boolean; // Mark for deletion during sync
}

export type LocalVehicle = VehicleInfo & LocalRecord & { localId: string }; // Use localId as primary key locally
export type LocalTrip = Omit<Trip, 'id'> & LocalRecord & { localId: string }; // Use localId as primary key locally
export type LocalVisit = Omit<Visit, 'id'> & LocalRecord & { localId: string; tripLocalId: string }; // Link to tripLocalId
export type LocalExpense = Omit<Expense, 'id'> & LocalRecord & { localId: string; tripLocalId: string }; // Link to tripLocalId
export type LocalFueling = Omit<Fueling, 'id'> & LocalRecord & { localId: string; tripLocalId: string }; // Link to tripLocalId

let db: IDBDatabase | null = null;

// --- DB Initialization ---
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', request.error);
      reject('Error opening IndexedDB');
    };

    request.onsuccess = (event) => {
      db = request.result;
      console.log('IndexedDB opened successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log('Upgrading IndexedDB...');
      const tempDb = request.result;
      if (!tempDb.objectStoreNames.contains(STORE_VEHICLES)) {
        // Use localId as key path, create index for firebaseId
        const vehicleStore = tempDb.createObjectStore(STORE_VEHICLES, { keyPath: 'localId' });
        vehicleStore.createIndex('firebaseId', 'firebaseId', { unique: true });
        vehicleStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        vehicleStore.createIndex('deleted', 'deleted', { unique: false });
      }
      if (!tempDb.objectStoreNames.contains(STORE_TRIPS)) {
         // Use localId as key path, create index for firebaseId and userId
        const tripStore = tempDb.createObjectStore(STORE_TRIPS, { keyPath: 'localId' });
        tripStore.createIndex('firebaseId', 'firebaseId', { unique: true });
        tripStore.createIndex('userId', 'userId', { unique: false });
        tripStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        tripStore.createIndex('deleted', 'deleted', { unique: false }); // Index for deleted items
      }
      if (!tempDb.objectStoreNames.contains(STORE_VISITS)) {
         const visitStore = tempDb.createObjectStore(STORE_VISITS, { keyPath: 'localId' });
         visitStore.createIndex('tripLocalId', 'tripLocalId', { unique: false }); // Index by local trip ID
         visitStore.createIndex('firebaseId', 'firebaseId', { unique: true });
         visitStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         visitStore.createIndex('deleted', 'deleted', { unique: false });
      }
      if (!tempDb.objectStoreNames.contains(STORE_EXPENSES)) {
         const expenseStore = tempDb.createObjectStore(STORE_EXPENSES, { keyPath: 'localId' });
         expenseStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
         expenseStore.createIndex('firebaseId', 'firebaseId', { unique: true });
         expenseStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         expenseStore.createIndex('deleted', 'deleted', { unique: false });
      }
      if (!tempDb.objectStoreNames.contains(STORE_FUELINGS)) {
         const fuelingStore = tempDb.createObjectStore(STORE_FUELINGS, { keyPath: 'localId' });
         fuelingStore.createIndex('tripLocalId', 'tripLocalId', { unique: false });
         fuelingStore.createIndex('firebaseId', 'firebaseId', { unique: true });
         fuelingStore.createIndex('syncStatus', 'syncStatus', { unique: false });
         fuelingStore.createIndex('deleted', 'deleted', { unique: false });
      }
      // Add other stores similarly
      console.log('IndexedDB upgrade complete');
    };
  });
};

// --- Generic CRUD Operations ---

export const getStore = (storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> => {
  return openDB().then(dbInstance => {
    const transaction = dbInstance.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
};

const addLocalRecord = <T extends LocalRecord & { localId: string }>(storeName: string, record: T): Promise<string> => {
  return getStore(storeName, 'readwrite').then(store => {
    return new Promise<string>((resolve, reject) => {
      const request = store.add(record);
      request.onsuccess = () => resolve(record.localId);
      request.onerror = () => reject(`Error adding record to ${storeName}: ${request.error}`);
    });
  });
};

const updateLocalRecord = <T extends { localId: string }>(storeName: string, record: T): Promise<void> => {
    return getStore(storeName, 'readwrite').then(store => {
        return new Promise<void>((resolve, reject) => {
            // Check if the record exists before attempting to update
            const getRequest = store.get(record.localId);
            getRequest.onsuccess = () => {
                if (getRequest.result) {
                    const putRequest = store.put(record);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(`Error updating record in ${storeName}: ${putRequest.error}`);
                } else {
                    // If record doesn't exist, treat it as an add operation (or reject)
                    console.warn(`Record with localId ${record.localId} not found in ${storeName} for update, adding instead.`);
                    const addRequest = store.add(record);
                    addRequest.onsuccess = () => resolve();
                    addRequest.onerror = () => reject(`Error adding record during attempted update in ${storeName}: ${addRequest.error}`);
                    // Alternatively, reject directly:
                    // reject(`Record with localId ${record.localId} not found in ${storeName} for update.`);
                }
            };
            getRequest.onerror = () => reject(`Error checking record existence in ${storeName}: ${getRequest.error}`);
        });
    });
};


const deleteLocalRecord = (storeName: string, localId: string): Promise<void> => {
  return getStore(storeName, 'readwrite').then(store => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(localId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(`Error deleting record from ${storeName}: ${request.error}`);
    });
  });
};

// Function to mark a record for deletion (soft delete)
const markRecordForDeletion = (storeName: string, localId: string): Promise<void> => {
  return getStore(storeName, 'readwrite').then(store => {
    return new Promise<void>((resolve, reject) => {
      const request = store.get(localId);
      request.onsuccess = () => {
        if (request.result) {
          const recordToUpdate = { ...request.result, deleted: true, syncStatus: 'pending' as SyncStatus };
          const updateRequest = store.put(recordToUpdate);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(`Error marking record ${localId} for deletion: ${updateRequest.error}`);
        } else {
          reject(`Record ${localId} not found to mark for deletion`);
        }
      };
      request.onerror = () => reject(`Error getting record ${localId} to mark for deletion: ${request.error}`);
    });
  });
};


const getAllLocalRecords = <T>(storeName: string): Promise<T[]> => {
  return getStore(storeName, 'readonly').then(store => {
    return new Promise<T[]>((resolve, reject) => {
      // Get only records not marked for deletion
      // Try using the 'deleted' index first
      let request: IDBRequest;
      if (store.indexNames.contains('deleted')) {
          const index = store.index('deleted');
          // Query for items where deleted is NOT true (i.e., false or undefined)
          // IndexedDB doesn't have a direct 'not equal'. We fetch only non-deleted (false/0/undefined)
          // We might need to refine this depending on how 'deleted' is stored (boolean vs number)
          // For simplicity, getAll() and filter might be more reliable initially.
          // request = index.getAll(IDBKeyRange.only(0)); // Assuming deleted=false or 0
          request = store.getAll(); // Fetch all and filter later for robustness
      } else {
          console.warn(`Index 'deleted' not found on store ${storeName}. Fetching all records.`);
          request = store.getAll();
      }


      request.onsuccess = () => {
          // Filter out deleted items in JavaScript
          const results = (request.result as any[]).filter((item: any) => !item.deleted);
          resolve(results as T[]);
      };
      request.onerror = () => reject(`Error getting all records from ${storeName}: ${request.error}`);
    });
  });
};

// Get records with a specific sync status
const getLocalRecordsBySyncStatus = <T>(storeName: string, status: SyncStatus | SyncStatus[]): Promise<T[]> => {
    return getStore(storeName, 'readonly').then(store => {
        return new Promise<T[]>((resolve, reject) => {
            const index = store.index('syncStatus');
            let request: IDBRequest;

            if (Array.isArray(status)) {
                // If status is an array, fetch for each status and combine
                // Note: IndexedDB doesn't directly support OR queries on a single index easily.
                // This approach fetches multiple times. For performance, consider fetching all and filtering.
                Promise.all(status.map(s =>
                    new Promise<T[]>((res, rej) => {
                        const req = index.getAll(s);
                        req.onsuccess = () => res(req.result as T[]);
                        req.onerror = () => rej(`Error getting records by status ${s}: ${req.error}`);
                    })
                )).then(resultsArray => {
                    // Flatten the array of arrays and filter out deleted items
                    resolve(resultsArray.flat().filter((item: any) => !item.deleted));
                }).catch(reject);
                return; // Exit promise constructor

            } else {
                // Single status query
                request = index.getAll(status);
            }

            request.onsuccess = () => {
                // Filter out items marked for deletion
                 const results = (request.result as any[]).filter(item => !item.deleted);
                resolve(results as T[]);
            };
            request.onerror = () => reject(`Error getting records by status from ${storeName}: ${request.error}`);
        });
    });
};


// --- Specific Operations ---

// -- Vehicles --
export const addLocalVehicle = (vehicle: Omit<LocalVehicle, 'localId' | 'syncStatus' | 'deleted'>): Promise<string> => {
    const localId = `local_vehicle_${uuidv4()}`;
    const newLocalVehicle: LocalVehicle = {
        ...(vehicle as VehicleInfo), // Cast to ensure base properties are there
        localId,
        syncStatus: 'pending',
        deleted: false,
    };
    return addLocalRecord<LocalVehicle>(STORE_VEHICLES, newLocalVehicle);
};

export const updateLocalVehicle = (vehicle: LocalVehicle): Promise<void> => {
    // Ensure syncStatus is updated correctly when editing
    const updatedVehicle = { ...vehicle, syncStatus: vehicle.syncStatus === 'synced' ? 'pending' : vehicle.syncStatus };
    return updateLocalRecord<LocalVehicle>(STORE_VEHICLES, updatedVehicle);
};

export const deleteLocalVehicle = (localId: string): Promise<void> => {
    // Mark for deletion instead of direct delete
    return markRecordForDeletion(STORE_VEHICLES, localId);
};

export const getLocalVehicles = (): Promise<LocalVehicle[]> => getAllLocalRecords<LocalVehicle>(STORE_VEHICLES);


// --- Trips ---
export const addLocalTrip = (trip: Omit<LocalTrip, 'localId' | 'syncStatus'>): Promise<string> => {
    const localId = `local_trip_${uuidv4()}`;
    const newLocalTrip: LocalTrip = {
      ...trip,
      localId,
      syncStatus: 'pending',
    };
    return addLocalRecord<LocalTrip>(STORE_TRIPS, newLocalTrip);
};

export const updateLocalTrip = (trip: LocalTrip): Promise<void> => {
  // Ensure syncStatus is updated correctly when editing
  const updatedTrip = { ...trip, syncStatus: trip.syncStatus === 'synced' ? 'pending' : trip.syncStatus };
  return updateLocalRecord<LocalTrip>(STORE_TRIPS, updatedTrip);
};

export const deleteLocalTrip = (localId: string): Promise<void> => {
    // Instead of direct deletion, mark for deletion
    return markRecordForDeletion(STORE_TRIPS, localId);
};

export const getLocalTrips = (userId?: string): Promise<LocalTrip[]> => {
    if (!userId) {
       return getAllLocalRecords<LocalTrip>(STORE_TRIPS);
    }
    return getStore(STORE_TRIPS, 'readonly').then(store => {
        return new Promise<LocalTrip[]>((resolve, reject) => {
            const index = store.index('userId');
            const request = index.getAll(userId);
            request.onsuccess = () => {
                // Filter out deleted items
                const results = (request.result as LocalTrip[]).filter((item: any) => !item.deleted);
                resolve(results);
            };
            request.onerror = () => reject(`Error getting trips for user ${userId}: ${request.error}`);
        });
    });
};

// --- Visits ---
export const addLocalVisit = (visit: Omit<LocalVisit, 'localId' | 'syncStatus'>): Promise<string> => {
    const localId = `local_visit_${uuidv4()}`;
    const newLocalVisit: LocalVisit = {
        ...visit,
        localId,
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
    return getStore(STORE_VISITS, 'readonly').then(store => {
        return new Promise<LocalVisit[]>((resolve, reject) => {
            const index = store.index('tripLocalId');
            const request = index.getAll(tripLocalId);
            request.onsuccess = () => {
                const results = (request.result as LocalVisit[]).filter(item => !item.deleted);
                // Sort descending by timestamp locally
                results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                resolve(results);
            };
            request.onerror = () => reject(`Error getting visits for trip ${tripLocalId}: ${request.error}`);
        });
    });
};

// --- Expenses ---
export const addLocalExpense = (expense: Omit<LocalExpense, 'localId' | 'syncStatus'>): Promise<string> => {
     const localId = `local_expense_${uuidv4()}`;
     const newLocalExpense: LocalExpense = {
         ...expense,
         localId,
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
     return getStore(STORE_EXPENSES, 'readonly').then(store => {
         return new Promise<LocalExpense[]>((resolve, reject) => {
             const index = store.index('tripLocalId');
             const request = index.getAll(tripLocalId);
             request.onsuccess = () => {
                 const results = (request.result as LocalExpense[]).filter(item => !item.deleted);
                 results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                 resolve(results);
             };
             request.onerror = () => reject(`Error getting expenses for trip ${tripLocalId}: ${request.error}`);
         });
     });
};

// --- Fuelings ---
export const addLocalFueling = (fueling: Omit<LocalFueling, 'localId' | 'syncStatus'>): Promise<string> => {
      const localId = `local_fueling_${uuidv4()}`;
      const newLocalFueling: LocalFueling = {
          ...fueling,
          localId,
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
      return getStore(STORE_FUELINGS, 'readonly').then(store => {
          return new Promise<LocalFueling[]>((resolve, reject) => {
              const index = store.index('tripLocalId');
              const request = index.getAll(tripLocalId);
              request.onsuccess = () => {
                  const results = (request.result as LocalFueling[]).filter(item => !item.deleted);
                  results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  resolve(results);
              };
              request.onerror = () => reject(`Error getting fuelings for trip ${tripLocalId}: ${request.error}`);
          });
      });
};


// --- Sync Operations ---

export const getPendingRecords = async (): Promise<{
  trips: LocalTrip[],
  visits: LocalVisit[],
  expenses: LocalExpense[],
  fuelings: LocalFueling[],
  // Add vehicles if they need syncing
  vehicles: LocalVehicle[],
}> => {
    const pendingStatus: SyncStatus[] = ['pending', 'error'];
    const [trips, visits, expenses, fuelings, vehicles] = await Promise.all([
        getLocalRecordsBySyncStatus<LocalTrip>(STORE_TRIPS, pendingStatus),
        getLocalRecordsBySyncStatus<LocalVisit>(STORE_VISITS, pendingStatus),
        getLocalRecordsBySyncStatus<LocalExpense>(STORE_EXPENSES, pendingStatus),
        getLocalRecordsBySyncStatus<LocalFueling>(STORE_FUELINGS, pendingStatus),
        getLocalRecordsBySyncStatus<LocalVehicle>(STORE_VEHICLES, pendingStatus), // Fetch pending vehicles
    ]);
    return { trips, visits, expenses, fuelings, vehicles }; // Include vehicles
};

// Update local record status after successful sync
export const updateSyncStatus = async (storeName: string, localId: string, firebaseId: string | undefined, status: SyncStatus): Promise<void> => {
  return getStore(storeName, 'readwrite').then(store => {
    return new Promise<void>((resolve, reject) => {
      const request = store.get(localId);
      request.onsuccess = () => {
        if (request.result) {
          const recordToUpdate = { ...request.result, syncStatus: status, firebaseId: firebaseId };
           // If status is 'synced' and firebaseId is missing, it indicates local deletion of non-synced item
           if (status === 'synced' && !firebaseId && !recordToUpdate.deleted) {
               console.warn(`Marking ${storeName} ${localId} as synced without firebaseId, likely deleted locally before sync.`);
           }
          const updateRequest = store.put(recordToUpdate);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(`Error updating sync status for ${localId}: ${updateRequest.error}`);
        } else {
          reject(`Record ${localId} not found to update sync status`);
        }
      };
      request.onerror = () => reject(`Error getting record ${localId} for sync status update: ${request.error}`);
    });
  });
};

// Clean up successfully deleted records after sync
export const cleanupDeletedRecords = async (): Promise<void> => {
    const stores = [STORE_TRIPS, STORE_VISITS, STORE_EXPENSES, STORE_FUELINGS, STORE_VEHICLES]; // Add vehicles store
    for (const storeName of stores) {
        try {
            const store = await getStore(storeName, 'readwrite');
            const index = store.index('deleted');
            const request = index.openCursor(IDBKeyRange.only(1)); // Get cursor for deleted items

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    // Only delete if it was successfully synced (meaning deletion was processed server-side or never existed online)
                    if (cursor.value.syncStatus === 'synced' && cursor.value.deleted) {
                         console.log(`Cleaning up deleted record ${cursor.primaryKey} from ${storeName}`);
                         store.delete(cursor.primaryKey);
                    }
                    cursor.continue();
                }
            };
            // Handle potential errors during cleanup cursor iteration
            request.onerror = (event) => {
                console.error(`Error iterating deleted records in ${storeName}:`, request.error);
            };
        } catch (error) {
             console.error(`Error during cleanupDeletedRecords for store ${storeName}:`, error);
        }
    }
};

// Initial call to open the DB when the service loads
openDB().catch(error => console.error("Failed to initialize IndexedDB on load:", error));
