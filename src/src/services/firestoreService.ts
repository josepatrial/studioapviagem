// src/services/firestoreService.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  orderBy,
  type QueryConstraint,
  addDoc,
  writeBatch,
  type CollectionReference,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
// Não importar tipos de componentes como Trip, Expense, VehicleInfo daqui.
// Manter importações de AuthContext se necessário para User/DriverInfo se firestoreService for a fonte canônica desses tipos para outros serviços.
import type { User, DriverInfo, UserRole } from '@/contexts/AuthContext';
export type { User, DriverInfo }; // Re-exportar se usado por outros módulos através daqui

import { deleteReceipt as deleteStorageReceipt } from './storageService';
import type { DateRange } from 'react-day-picker';
// import type { CustomType as LocalCustomType } from './localDbService'; // Já definido como FirestoreCustomType abaixo

// Definir estruturas de dados como elas existem no Firestore
export interface FirestoreTrip {
  id: string; // Document ID
  name: string;
  vehicleId: string;
  userId: string;
  status: 'Andamento' | 'Finalizado' | 'Cancelado';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  base: string;
  finalKm?: number;
  totalDistance?: number;
}

export interface FirestoreVisit {
  id: string; // Document ID
  tripId: string;
  userId: string;
  clientName: string;
  location: string;
  latitude?: number;
  longitude?: number;
  initialKm: number;
  reason: string;
  timestamp: Timestamp;
  visitType?: string;
}

export interface FirestoreExpense {
  id: string; // Document ID
  tripId: string;
  userId: string;
  description: string;
  value: number;
  expenseType: string;
  expenseDate: Timestamp;
  timestamp: Timestamp; // Record creation/update timestamp
  comments?: string;
  receiptFilename?: string;
  receiptUrl?: string;
  receiptPath?: string;
}

export interface FirestoreFueling {
  id: string; // Document ID
  tripId: string;
  userId: string;
  vehicleId: string;
  date: Timestamp;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  location: string;
  comments?: string;
  odometerKm: number;
  fuelType: string;
  receiptFilename?: string;
  receiptUrl?: string;
  receiptPath?: string;
}

export interface FirestoreVehicle {
  id: string; // Document ID
  model: string;
  year: number;
  licensePlate: string;
  deleted?: boolean; // Adicionado para consistência com fetchOnlineVehicles
}

// Define CustomType para Firestore (id é gerado pelo Firestore)
export interface FirestoreCustomType {
    id: string; // Firestore document ID
    name: string;
}


// Define collection references globalmente
let usersCollectionRef: CollectionReference | null = null;
let vehiclesCollectionRef: CollectionReference | null = null;
let tripsCollectionRef: CollectionReference | null = null;
let visitsCollectionRef: CollectionReference | null = null;
let expensesCollectionRef: CollectionReference | null = null;
let fuelingsCollectionRef: CollectionReference | null = null;
let visitTypesCollectionRef: CollectionReference | null = null;
let expenseTypesCollectionRef: CollectionReference | null = null;


if (db) {
    console.log(`[firestoreService] Initializing collection references for DB: ${db.databaseId}`);
    usersCollectionRef = collection(db, 'users');
    vehiclesCollectionRef = collection(db, 'vehicles');
    tripsCollectionRef = collection(db, 'trips');
    visitsCollectionRef = collection(db, 'visits');
    expensesCollectionRef = collection(db, 'expenses');
    fuelingsCollectionRef = collection(db, 'fuelings');
    visitTypesCollectionRef = collection(db, 'visitTypes');
    expenseTypesCollectionRef = collection(db, 'expenseTypes');

} else {
    console.warn("[firestoreService] Firestore DB is not initialized. Collection references will be null. Operations requiring these refs will fail.");
}


const cleanUserDataForFirestore = (data: Record<string, any>): Record<string, any> => {
    const cleanedData: Record<string, any> = {};
    // const coreUserFields: (keyof User)[] = ['name', 'email', 'username', 'role', 'base'];

    for (const key in data) {
        if (data[key] !== undefined && data[key] !== null) {
            cleanedData[key] = data[key];
        }
    }

    if (!cleanedData.name && cleanedData.email) cleanedData.name = cleanedData.email.split('@')[0] || 'Usuário Desconhecido';
    else if (!cleanedData.name) cleanedData.name = 'Usuário Desconhecido';

    if (!cleanedData.email) cleanedData.email = 'unknown@example.com';
    if (!cleanedData.role) cleanedData.role = 'driver';

    if (cleanedData.role === 'admin') {
        cleanedData.base = 'ALL';
    } else if (!cleanedData.base || String(cleanedData.base).trim() === '') {
        cleanedData.base = 'N/A';
    }

    if (!cleanedData.username && cleanedData.email) cleanedData.username = cleanedData.email.split('@')[0];
    else if (!cleanedData.username) cleanedData.username = `user_${Date.now()}`;


    const internalFields = ['passwordHash', 'lastLogin', 'syncStatus', 'deleted', 'firebaseId', 'localId', 'id'];
    internalFields.forEach(field => delete cleanedData[field]);

    return cleanedData;
};


const cleanDataForFirestore = (data: Record<string, any>): Record<string, any> => {
    const cleanedData: Record<string, any> = {};
    for (const key in data) {
        if (data[key] !== undefined) { // Permitir null para campos que podem ser nulificados no Firestore
            cleanedData[key] = data[key];
        }
    }
    const internalFields = ['syncStatus', 'deleted', 'firebaseId', 'localId', 'id'];
    internalFields.forEach(field => delete cleanedData[field]);
    return cleanedData;
};


export const getUserData = async (userId: string): Promise<User | null> => {
  const getUserStartTime = performance.now();
  console.log(`[firestoreService getUserData ${getUserStartTime}] Getting user data for ID: ${userId}`);
 if (!db || !usersCollectionRef) {
 console.error(`[firestoreService getUserData ${getUserStartTime}] Firestore DB or usersCollectionRef is not initialized. Cannot get user data.`);
 return null;
  }
  try {
    const userDocRef = doc(usersCollectionRef, userId);
    const userDocSnap = await getDoc(userDocRef);
    const getUserEndTime = performance.now();
    if (userDocSnap.exists()) {
      const userDataFromSnap = userDocSnap.data();
      const userData = {
        id: userDocSnap.id,
        firebaseId: userDocSnap.id, // Add firebaseId
        name: userDataFromSnap.name || `Usuário ${userDocSnap.id.substring(0,6)}`,
        email: userDataFromSnap.email || 'N/A',
        username: userDataFromSnap.username || userDataFromSnap.email?.split('@')[0] || `user_${userDocSnap.id.substring(0,6)}`,
        role: userDataFromSnap.role || 'driver',
        base: (userDataFromSnap.role === 'admin' ? 'ALL' : userDataFromSnap.base) || 'N/A',
      } as User;
      console.log(`[firestoreService getUserData ${getUserStartTime}] User data found for ${userId}. Time: ${getUserEndTime - getUserStartTime} ms. Data:`, JSON.stringify(userData));
      return userData;
    } else {
      console.log(`[firestoreService getUserData ${getUserStartTime}] No such user document for ${userId}! Time: ${getUserEndTime - getUserStartTime} ms`);
      return null;
    }
  } catch (error) {
    const getUserEndTime = performance.now();
    console.error(`[firestoreService getUserData ${getUserStartTime}] Error getting user document for ${userId}. Time: ${getUserEndTime - getUserStartTime} ms`, error);
    if ((error as any).code === 'unavailable') {
        console.warn('Firestore is offline. Cannot fetch user data.');
    }
    return null;
  }
};


export const setUserData = async (userId: string, data: Partial<Omit<User, 'id' | 'firebaseId'>>) => {
    const setUserStartTime = performance.now();
    const cleanedData = cleanUserDataForFirestore(data);
    console.log(`[firestoreService setUserData ${setUserStartTime}] Setting/merging user data for ID: ${userId} in 'users' collection. Cleaned Data:`, cleanedData);
    if (!db || !usersCollectionRef) {
 console.error(`[firestoreService setUserData ${setUserStartTime}] Firestore DB or usersCollectionRef is not initialized. User data not set.`);
        throw new Error("Firestore DB or usersCollectionRef not initialized.");
    }
    const userDocRef = doc(usersCollectionRef, userId);
    try {
      await setDoc(userDocRef, cleanedData, { merge: true });
      const setUserEndTime = performance.now();
      console.log(`[firestoreService setUserData ${setUserStartTime}] User data set/merged successfully for ID: ${userId} in 'users'. Time: ${setUserEndTime - setUserStartTime} ms`);
    } catch (error) {
        const setUserEndTime = performance.now();
        console.error(`[firestoreService setUserData ${setUserStartTime}] Error setting/merging user data for ID: ${userId}. Time: ${setUserEndTime - setUserStartTime} ms. Payload:`, cleanedData, error);
        throw error;
    }
};

export const addUser = async (userId: string, userData: Omit<User, 'id' | 'firebaseId'>): Promise<void> => {
    const addUserStartTime = performance.now();
    const finalUserData: Omit<User, 'id' | 'firebaseId'> = {
         ...userData,
         role: userData.role || 'driver',
         base: userData.role === 'admin' ? 'ALL' : (userData.base || 'N/A')
     };
    const cleanedData = cleanUserDataForFirestore(finalUserData);
    console.log(`[firestoreService addUser ${addUserStartTime}] Adding user document for ID: ${userId} to 'users' collection. Cleaned Data:`, cleanedData);
 if (!db || !usersCollectionRef) {
 console.error(`[firestoreService addUser ${addUserStartTime}] Firestore DB or usersCollectionRef is not initialized. User not added.`);
 throw new Error("Firestore DB or usersCollectionRef not initialized.");
    } try {
        const userDocRef = doc(usersCollectionRef, userId);
        await setDoc(userDocRef, cleanedData);
        const addUserEndTime = performance.now();
        console.log(`[firestoreService addUser ${addUserStartTime}] User document created successfully for ID: ${userId} in 'users'. Time: ${addUserEndTime - addUserStartTime} ms`);
    } catch (error) {
        const addUserEndTime = performance.now();
        console.error(`[firestoreService addUser ${addUserStartTime}] Error creating user document for ID: ${userId}. Time: ${addUserEndTime - addUserStartTime} ms. Payload:`, cleanedData, error);
        throw error;
    }
};

export const updateUser = async (userId: string, data: Partial<DriverInfo>) => {
    const updateUserStartTime = performance.now();
    const cleanedData = cleanUserDataForFirestore(data);
    console.log(`[firestoreService updateUser ${updateUserStartTime}] Updating user document for ID: ${userId} in 'users' collection. Cleaned Data:`, cleanedData);
 if (!db || !usersCollectionRef) { console.error(`[firestoreService updateUser ${updateUserStartTime}] Firestore DB or usersCollectionRef is not initialized. User not updated.`); throw new Error("Firestore DB or usersCollectionRef not initialized."); }
    const userDocRef = doc(usersCollectionRef, userId);

    try {
        await updateDoc(userDocRef, cleanedData);
        const updateUserEndTime = performance.now();
        console.log(`[firestoreService updateUser ${updateUserStartTime}] User updated successfully for ID: ${userId}. Time: ${updateUserEndTime - updateUserStartTime} ms`);
    } catch (error) {
        const updateUserEndTime = performance.now();
        console.error(`[firestoreService updateUser ${updateUserStartTime}] Error updating user for ID: ${userId}. Time: ${updateUserEndTime - updateUserStartTime} ms. Payload:`, cleanedData, error);
        throw error;
    }
};

export const deleteUser = async (userId: string) => {
    const deleteUserStartTime = performance.now();
    console.log(`[firestoreService deleteUser ${deleteUserStartTime}] Deleting user document for ID: ${userId} from 'users' collection.`);
 if (!db || !usersCollectionRef) { console.error(`[firestoreService deleteUser ${deleteUserStartTime}] Firestore DB or usersCollectionRef is not initialized. User not deleted.`); throw new Error("Firestore DB or usersCollectionRef not initialized."); }
    const userDocRef = doc(usersCollectionRef, userId);
    try {
        await deleteDoc(userDocRef);
        const deleteUserEndTime = performance.now();
        console.log(`[firestoreService deleteUser ${deleteUserStartTime}] User document deleted successfully for ID: ${userId}. Time: ${deleteUserEndTime - deleteUserStartTime} ms`);
    } catch (error) {
        const deleteUserEndTime = performance.now();
        console.error(`[firestoreService deleteUser ${deleteUserStartTime}] Error deleting user document for ID: ${userId}. Time: ${deleteUserEndTime - deleteUserStartTime} ms`, error);
        throw error;
    }
};

export const getDrivers = async (): Promise<DriverInfo[]> => {
    const getDriversStartTime = performance.now();
    console.log(`[firestoreService getDrivers ${getDriversStartTime}] Fetching drivers from 'users' collection where role is 'driver'...`);
 if (!db || !usersCollectionRef) {
 console.error(`[firestoreService getDrivers ${getDriversStartTime}] Firestore DB or usersCollectionRef is not initialized. Cannot get drivers.`);
 return [];
    }
 try {
        const q = query(usersCollectionRef, where('role', '==', 'driver'));
        const querySnapshot = await getDocs(q);
        console.log(`[firestoreService getDrivers ${getDriversStartTime}] Query snapshot received. Found ${querySnapshot.docs.length} documents.`);

        const drivers = querySnapshot.docs.map(docInstance => {
            const data = docInstance.data();
            return {
                id: docInstance.id,
                firebaseId: docInstance.id, // Add firebaseId
                email: data.email,
                name: data.name || data.email || `Motorista ${docInstance.id.substring(0,6)}`,
                username: data.username || data.email?.split('@')[0],
                role: 'driver',
                base: data.base || 'N/A',
            } as DriverInfo;
        });
        const getDriversEndTime = performance.now();
        console.log(`[firestoreService getDrivers ${getDriversStartTime}] Mapped ${drivers.length} drivers. Time: ${getDriversEndTime - getDriversStartTime} ms.`);
        return drivers;
    } catch (error) {
         const getDriversEndTime = performance.now();
         console.error(`[firestoreService getDrivers ${getDriversStartTime}] Error fetching drivers from Firestore. Time: ${getDriversEndTime - getDriversStartTime} ms`, error);
          if ((error as any).code === 'unavailable') {
              console.warn('Firestore is offline. Cannot fetch drivers.');
          }
         return [];
    }
};

// --- Vehicle Service ---
export const getVehicles = async (): Promise<FirestoreVehicle[]> => {
    const getVehiclesStartTime = performance.now();
    console.log(`[firestoreService getVehicles ${getVehiclesStartTime}] Fetching vehicles from 'vehicles' collection (DB: ${db?.databaseId})...`);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService getVehicles ${getVehiclesStartTime}] Firestore DB or vehiclesCollectionRef is not initialized. Returning empty array.`);
        return [];
    }
    try {
        const querySnapshot = await getDocs(vehiclesCollectionRef);
        const vehicles = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as FirestoreVehicle);
        const getVehiclesEndTime = performance.now();
        console.log(`[firestoreService getVehicles ${getVehiclesStartTime}] Found ${vehicles.length} vehicles. Time: ${getVehiclesEndTime - getVehiclesStartTime} ms`);
        return vehicles;
    } catch (error) {
         const getVehiclesEndTime = performance.now();
         console.error(`[firestoreService getVehicles ${getVehiclesStartTime}] Error fetching vehicles. Time: ${getVehiclesEndTime - getVehiclesStartTime} ms`, error);
          if ((error as any).code === 'unavailable') {
              console.warn('Firestore is offline. Cannot fetch vehicles.');
          }
         return [];
    }
};

export const addVehicle = async (vehicleData: Omit<FirestoreVehicle, 'id'>): Promise<string> => {
    const addVehicleStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(vehicleData);
    console.log(`[firestoreService addVehicle ${addVehicleStartTime}] Adding new vehicle to 'vehicles' collection. Cleaned Data:`, cleanedData);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService addVehicle ${addVehicleStartTime}] Firestore DB or vehiclesCollectionRef is not initialized. Vehicle not added.`);
        throw new Error("Firestore DB or vehiclesCollectionRef not initialized.");
    }
    try {
        const docRef = await addDoc(vehiclesCollectionRef, cleanedData);
        const addVehicleEndTime = performance.now();
        console.log(`[firestoreService addVehicle ${addVehicleStartTime}] Vehicle added successfully to 'vehicles' with ID: ${docRef.id}. Time: ${addVehicleEndTime - addVehicleStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addVehicleEndTime = performance.now();
         console.error(`[firestoreService addVehicle ${addVehicleStartTime}] Error adding vehicle. Time: ${addVehicleEndTime - addVehicleStartTime} ms. Payload:`, cleanedData, error);
         throw error;
    }
};

export const updateVehicle = async (vehicleId: string, data: Partial<Omit<FirestoreVehicle, 'id'>>) => {
    const updateVehicleStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    console.log(`[firestoreService updateVehicle ${updateVehicleStartTime}] Updating vehicle ID: ${vehicleId} in 'vehicles' collection. Cleaned Data:`, cleanedData);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService updateVehicle ${updateVehicleStartTime}] Firestore DB or vehiclesCollectionRef is not initialized. Vehicle not updated.`);
        throw new Error("Firestore DB or vehiclesCollectionRef not initialized.");
    }
    const vehicleDocRef = doc(vehiclesCollectionRef, vehicleId);
    try {
        await updateDoc(vehicleDocRef, cleanedData);
        const updateVehicleEndTime = performance.now();
        console.log(`[firestoreService updateVehicle ${updateVehicleStartTime}] Vehicle updated successfully for ID: ${vehicleId}. Time: ${updateVehicleEndTime - updateVehicleStartTime} ms`);
    } catch (error) {
         const updateVehicleEndTime = performance.now();
         console.error(`[firestoreService updateVehicle ${updateVehicleStartTime}] Error updating vehicle for ID: ${vehicleId}. Time: ${updateVehicleEndTime - updateVehicleStartTime} ms. Payload:`, cleanedData, error);
         throw error;
    }
};

export const deleteVehicle = async (vehicleId: string) => {
    const deleteVehicleStartTime = performance.now();
    console.log(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Deleting vehicle ID: ${vehicleId} from 'vehicles' collection.`);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Firestore DB or vehiclesCollectionRef is not initialized. Vehicle not deleted.`);
        throw new Error("Firestore DB or vehiclesCollectionRef not initialized.");
    }
    const vehicleDocRef = doc(vehiclesCollectionRef, vehicleId);
    try {
        await deleteDoc(vehicleDocRef);
        const deleteVehicleEndTime = performance.now();
        console.log(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Vehicle deleted successfully for ID: ${vehicleId}. Time: ${deleteVehicleEndTime - deleteVehicleStartTime} ms`);
    } catch (error) {
         const deleteVehicleEndTime = performance.now();
         console.error(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Error deleting vehicle for ID: ${vehicleId}. Time: ${deleteVehicleEndTime - deleteVehicleStartTime} ms`, error);
         throw error;
    }
};

// --- Trip Service ---
export interface TripFilter {
    userId?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    base?: string;
}

export const getTrips = async (filters: TripFilter = {}): Promise<FirestoreTrip[]> => {
    const getTripsStartTime = performance.now();
    console.log(`[firestoreService getTrips ${getTripsStartTime}] Fetching trips from 'trips' collection with filters:`, filters);
    if (!db || !tripsCollectionRef) {
        console.warn(`[firestoreService getTrips ${getTripsStartTime}] Firestore DB or tripsCollectionRef is not initialized. Returning empty array.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (filters.userId) {
            constraints.push(where('userId', '==', filters.userId));
        }
        if (filters.base && filters.base !== 'ALL') {
            constraints.push(where('base', '==', filters.base));
        }
        if (filters.startDate) {
            constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(filters.startDate))));
        }
        if (filters.endDate) {
             const endDatePlusOne = new Date(filters.endDate);
             endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
             constraints.push(where('createdAt', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        constraints.push(orderBy('status', 'asc'));
        constraints.push(orderBy('createdAt', 'desc'));


        const q = query(tripsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const trips = querySnapshot.docs.map(docInstance => { // Renamed doc to docInstance
            const data = docInstance.data();
            return {
                id: docInstance.id,
                name: data.name,
                vehicleId: data.vehicleId,
                userId: data.userId,
                status: data.status,
                createdAt: data.createdAt as Timestamp,
                updatedAt: data.updatedAt as Timestamp,
                base: data.base,
                finalKm: data.finalKm,
                totalDistance: data.totalDistance,
            } as FirestoreTrip;
        });

        const getTripsEndTime = performance.now();
        console.log(`[firestoreService getTrips ${getTripsStartTime}] Found ${trips.length} trips. Time: ${getTripsEndTime - getTripsStartTime} ms`);
        return trips;

    } catch (error) {
         const getTripsEndTime = performance.now();
        console.error(`[firestoreService getTrips ${getTripsStartTime}] Error fetching trips. Time: ${getTripsEndTime - getTripsStartTime} ms`, error);
        if ((error as any).code === 'unavailable') {
            console.warn('Firestore is offline. Cannot fetch trips.');
        }
        return [];
    }
};

export const addTrip = async (tripData: Omit<FirestoreTrip, 'id' | 'updatedAt' | 'createdAt'>): Promise<string> => {
    const addTripStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(tripData);
    console.log(`[firestoreService addTrip ${addTripStartTime}] Adding new trip to 'trips' collection. Cleaned Data:`, cleanedData);
    if (!db || !tripsCollectionRef) {
        console.warn(`[firestoreService addTrip ${addTripStartTime}] Firestore DB or tripsCollectionRef is not initialized. Trip not added.`);
        throw new Error("Firestore DB or tripsCollectionRef not initialized.");
    }
    try {
        const finalData = {
            ...cleanedData,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };
        const docRef = await addDoc(tripsCollectionRef, finalData);
        const addTripEndTime = performance.now();
        console.log(`[firestoreService addTrip ${addTripStartTime}] Trip added successfully to 'trips' with ID: ${docRef.id}. Time: ${addTripEndTime - addTripStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addTripEndTime = performance.now();
         console.error(`[firestoreService addTrip ${addTripStartTime}] Error adding trip. Time: ${addTripEndTime - addTripStartTime} ms. Payload:`, cleanedData, error);
         throw error;
    }
};

export const updateTrip = async (tripId: string, data: Partial<Omit<FirestoreTrip, 'id' | 'createdAt'>>) => {
    const updateTripStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    console.log(`[firestoreService updateTrip ${updateTripStartTime}] Updating trip ID: ${tripId} in 'trips' collection. Cleaned Data:`, cleanedData);
    if (!db || !tripsCollectionRef) {
        console.warn(`[firestoreService updateTrip ${updateTripStartTime}] Firestore DB or tripsCollectionRef is not initialized. Trip not updated.`);
        throw new Error("Firestore DB or tripsCollectionRef not initialized.");
    }
    const tripDocRef = doc(tripsCollectionRef, tripId);
    try {
        const dataToUpdate: any = { // Use any for flexibility before casting to Firestore types
            ...cleanedData,
            updatedAt: Timestamp.now(),
        };
        // Ensure Timestamp fields are correctly formatted if they are part of `data`
        if (data.createdAt && !(data.createdAt instanceof Timestamp)) dataToUpdate.createdAt = Timestamp.fromDate(new Date(data.createdAt as any));


        await updateDoc(tripDocRef, dataToUpdate);
        const updateTripEndTime = performance.now();
        console.log(`[firestoreService updateTrip ${updateTripStartTime}] Trip updated successfully for ID: ${tripId}. Time: ${updateTripEndTime - updateTripStartTime} ms`);
    } catch (error) {
         const updateTripEndTime = performance.now();
         console.error(`[firestoreService updateTrip ${updateTripStartTime}] Error updating trip for ID: ${tripId}. Time: ${updateTripEndTime - updateTripStartTime} ms. Payload:`, cleanedData, error);
         throw error;
    }
};

// --- Visit Service ---
export interface VisitFilter {
    userId?: string;
    tripId?: string;
    startDate?: Date;
    endDate?: Date;
}

export const getVisits = async (filters: VisitFilter = {}): Promise<FirestoreVisit[]> => {
    const getVisitsStartTime = performance.now();
    console.log(`[firestoreService getVisits ${getVisitsStartTime}] Fetching visits from 'visits' collection with filters:`, filters);
    if (!db || !visitsCollectionRef) {
        console.warn(`[firestoreService getVisits ${getVisitsStartTime}] Firestore DB or visitsCollectionRef is not initialized. Returning empty array.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (filters.userId) {
            constraints.push(where('userId', '==', filters.userId));
        }
        if (filters.tripId) {
            constraints.push(where('tripId', '==', filters.tripId));
        }
        if (filters.startDate) {
            constraints.push(where('timestamp', '>=', Timestamp.fromDate(filters.startDate)));
        }
        if (filters.endDate) {
            const endDatePlusOne = new Date(filters.endDate);
            endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
            constraints.push(where('timestamp', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        constraints.push(orderBy('timestamp', 'desc'));

        const q = query(visitsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const visits = querySnapshot.docs.map(docInstance => { // Renamed doc to docInstance
            const data = docInstance.data();
            return {
                id: docInstance.id,
                tripId: data.tripId,
                userId: data.userId,
                clientName: data.clientName,
                location: data.location,
                latitude: data.latitude,
                longitude: data.longitude,
                initialKm: data.initialKm,
                reason: data.reason,
                timestamp: data.timestamp as Timestamp,
                visitType: data.visitType
            } as FirestoreVisit;
        });
        const getVisitsEndTime = performance.now();
        console.log(`[firestoreService getVisits ${getVisitsStartTime}] Found ${visits.length} visits. Time: ${getVisitsEndTime - getVisitsStartTime} ms`);
        return visits;
    } catch (error) {
         const getVisitsEndTime = performance.now();
         console.error(`[firestoreService getVisits ${getVisitsStartTime}] Error fetching visits. Time: ${getVisitsEndTime - getVisitsStartTime} ms`, error);
          if ((error as any).code === 'unavailable') {
              console.warn('Firestore is offline. Cannot fetch visits.');
          }
         return [];
    }
};


export const addVisit = async (visitData: Omit<FirestoreVisit, 'id'>): Promise<string> => {
    const addVisitStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(visitData);
    console.log(`[firestoreService addVisit ${addVisitStartTime}] Adding new visit to 'visits' collection. Cleaned Data:`, cleanedData);
    if (!db || !visitsCollectionRef) {
        console.warn(`[firestoreService addVisit ${addVisitStartTime}] Firestore DB or visitsCollectionRef is not initialized. Visit not added.`);
        throw new Error("Firestore DB or visitsCollectionRef not initialized.");
    }
    try {
        const dataWithTimestamp = { ...cleanedData, timestamp: cleanedData.timestamp instanceof Timestamp ? cleanedData.timestamp : Timestamp.fromDate(new Date(cleanedData.timestamp)) };
        const docRef = await addDoc(visitsCollectionRef, dataWithTimestamp);
        const addVisitEndTime = performance.now();
        console.log(`[firestoreService addVisit ${addVisitStartTime}] Visit added successfully to 'visits' with ID: ${docRef.id}. Time: ${addVisitEndTime - addVisitStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addVisitEndTime = performance.now();
         console.error(`[firestoreService addVisit ${addVisitStartTime}] Error adding visit. Time: ${addVisitEndTime - addVisitStartTime} ms. Payload:`, cleanedData, error);
         throw error;
    }
};

export const updateVisit = async (visitId: string, data: Partial<Omit<FirestoreVisit, 'id'>>) => {
    const updateVisitStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    console.log(`[firestoreService updateVisit ${updateVisitStartTime}] Updating visit ID: ${visitId} in 'visits' collection. Cleaned Data:`, cleanedData);
    if (!db || !visitsCollectionRef) {
        console.warn(`[firestoreService updateVisit ${updateVisitStartTime}] Firestore DB or visitsCollectionRef is not initialized. Visit not updated.`);
        throw new Error("Firestore DB or visitsCollectionRef not initialized.");
    }
    const visitDocRef = doc(visitsCollectionRef, visitId);
    try {
        const dataWithTimestamp = cleanedData.timestamp && !(cleanedData.timestamp instanceof Timestamp) ? { ...cleanedData, timestamp: Timestamp.fromDate(new Date(cleanedData.timestamp)) } : cleanedData;
        await updateDoc(visitDocRef, dataWithTimestamp);
        const updateVisitEndTime = performance.now();
        console.log(`[firestoreService updateVisit ${updateVisitStartTime}] Visit updated successfully for ID: ${visitId}. Time: ${updateVisitEndTime - updateVisitStartTime} ms`);
    } catch (error) {
         const updateVisitEndTime = performance.now();
         console.error(`[firestoreService updateVisit ${updateVisitStartTime}] Error updating visit for ID: ${visitId}. Time: ${updateVisitEndTime - updateVisitStartTime} ms. Payload:`, cleanedData, error);
         throw error;
    }
};

export const deleteVisit = async (visitId: string) => {
    const deleteVisitStartTime = performance.now();
    console.log(`[firestoreService deleteVisit ${deleteVisitStartTime}] Deleting visit ID: ${visitId} from 'visits' collection.`);
    if (!db || !visitsCollectionRef) {
        console.warn(`[firestoreService deleteVisit ${deleteVisitStartTime}] Firestore DB or visitsCollectionRef is not initialized. Visit not deleted.`);
        throw new Error("Firestore DB or visitsCollectionRef not initialized.");
    }
    const visitDocRef = doc(visitsCollectionRef, visitId);
    try {
        await deleteDoc(visitDocRef);
        const deleteVisitEndTime = performance.now();
        console.log(`[firestoreService deleteVisit ${deleteVisitStartTime}] Visit deleted successfully for ID: ${visitId}. Time: ${deleteVisitEndTime - deleteVisitStartTime} ms`);
    } catch (error) {
         const deleteVisitEndTime = performance.now();
         console.error(`[firestoreService deleteVisit ${deleteVisitStartTime}] Error deleting visit for ID: ${visitId}. Time: ${deleteVisitEndTime - deleteVisitStartTime} ms`, error);
         throw error;
    }
};

// --- Expense Service ---
export interface ExpenseFilter {
    userId?: string;
    tripId?: string;
    startDate?: Date;
    endDate?: Date;
}

export const getExpenses = async (filters: ExpenseFilter = {}): Promise<FirestoreExpense[]> => {
    const getExpensesStartTime = performance.now();
    console.log(`[firestoreService getExpenses ${getExpensesStartTime}] Fetching expenses from 'expenses' collection with filters:`, filters);
    if (!db || !expensesCollectionRef) {
        console.warn(`[firestoreService getExpenses ${getExpensesStartTime}] Firestore DB or expensesCollectionRef is not initialized. Returning empty array.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (filters.userId) {
            constraints.push(where('userId', '==', filters.userId));
        }
        if (filters.tripId) {
            constraints.push(where('tripId', '==', filters.tripId));
        }
        if (filters.startDate) {
            constraints.push(where('expenseDate', '>=', Timestamp.fromDate(filters.startDate)));
        }
        if (filters.endDate) {
            const endDatePlusOne = new Date(filters.endDate);
            endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
            constraints.push(where('expenseDate', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        constraints.push(orderBy('expenseDate', 'desc'));

        const q = query(expensesCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const expenses = querySnapshot.docs.map(docInstance => { // Renamed doc to docInstance
            const data = docInstance.data();
            return {
                id: docInstance.id,
                tripId: data.tripId,
                userId: data.userId,
                description: data.description,
                value: data.value,
                expenseType: data.expenseType,
                expenseDate: data.expenseDate as Timestamp,
                timestamp: data.timestamp as Timestamp,
                comments: data.comments,
                receiptFilename: data.receiptFilename,
                receiptUrl: data.receiptUrl,
                receiptPath: data.receiptPath,
            } as FirestoreExpense;
        });
        const getExpensesEndTime = performance.now();
        console.log(`[firestoreService getExpenses ${getExpensesStartTime}] Found ${expenses.length} expenses. Time: ${getExpensesEndTime - getExpensesStartTime} ms`);
        return expenses;
    } catch (error) {
         const getExpensesEndTime = performance.now();
         console.error(`[firestoreService getExpenses ${getExpensesStartTime}] Error fetching expenses. Time: ${getExpensesEndTime - getExpensesStartTime} ms`, error);
          if ((error as any).code === 'unavailable') {
              console.warn('Firestore is offline. Cannot fetch expenses.');
          }
         return [];
    }
};

export const addExpense = async (expenseData: Omit<FirestoreExpense, 'id'>): Promise<string> => {
    const addExpenseStartTime = performance.now();
    const dataToFirestore = { ...cleanDataForFirestore(expenseData) };

    if (dataToFirestore.timestamp && !(dataToFirestore.timestamp instanceof Timestamp)) dataToFirestore.timestamp = Timestamp.fromDate(new Date(dataToFirestore.timestamp));
    if (dataToFirestore.expenseDate && !(dataToFirestore.expenseDate instanceof Timestamp)) dataToFirestore.expenseDate = Timestamp.fromDate(new Date(dataToFirestore.expenseDate));

    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => {
        if (dataToFirestore[field] === null || dataToFirestore[field] === undefined) {
            delete dataToFirestore[field];
        }
    });
    console.log(`[firestoreService addExpense ${addExpenseStartTime}] Adding new expense to 'expenses' collection. Data for Firestore:`, dataToFirestore);


    if (!db || !expensesCollectionRef) {
        console.warn(`[firestoreService addExpense ${addExpenseStartTime}] Firestore DB or expensesCollectionRef is not initialized. Expense not added.`);
        throw new Error("Firestore DB or expensesCollectionRef not initialized.");
    }
    try {
        const docRef = await addDoc(expensesCollectionRef, dataToFirestore);
        const addExpenseEndTime = performance.now();
        console.log(`[firestoreService addExpense ${addExpenseStartTime}] Expense added successfully to 'expenses' with ID: ${docRef.id}. Time: ${addExpenseEndTime - addExpenseStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addExpenseEndTime = performance.now();
         console.error(`[firestoreService addExpense ${addExpenseStartTime}] Error adding expense. Time: ${addExpenseEndTime - addExpenseStartTime} ms. Payload:`, dataToFirestore, error);
         throw error;
    }
};

export const updateExpense = async (expenseId: string, data: Partial<Omit<FirestoreExpense, 'id'>>) => {
    const updateExpenseStartTime = performance.now();
    const dataToFirestore = { ...cleanDataForFirestore(data) };

    if (dataToFirestore.timestamp && !(dataToFirestore.timestamp instanceof Timestamp)) dataToFirestore.timestamp = Timestamp.fromDate(new Date(dataToFirestore.timestamp));
    if (dataToFirestore.expenseDate && !(dataToFirestore.expenseDate instanceof Timestamp)) dataToFirestore.expenseDate = Timestamp.fromDate(new Date(dataToFirestore.expenseDate));

    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
     receiptFields.forEach(field => {
        if (data.hasOwnProperty(field)) {
            if ((data as any)[field] === null || (data as any)[field] === undefined) { // Corrected type assertion
                delete dataToFirestore[field];
            }
        } else {
            if (dataToFirestore[field] === undefined) delete dataToFirestore[field];
        }
    });
    console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Updating expense ID: ${expenseId} in 'expenses' collection. Data for Firestore:`, dataToFirestore);


    if (!db || !expensesCollectionRef) {
        console.warn(`[firestoreService updateExpense ${updateExpenseStartTime}] Firestore DB or expensesCollectionRef is not initialized. Expense not updated.`);
        throw new Error("Firestore DB or expensesCollectionRef not initialized.");
    }
    const expenseDocRef = doc(expensesCollectionRef, expenseId);
    try {
        await updateDoc(expenseDocRef, dataToFirestore);
        const updateExpenseEndTime = performance.now();
        console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Expense updated successfully for ID: ${expenseId}. Time: ${updateExpenseEndTime - updateExpenseStartTime} ms`);
    } catch (error) {
         const updateExpenseEndTime = performance.now();
         console.error(`[firestoreService updateExpense ${updateExpenseStartTime}] Error updating expense for ID: ${expenseId}. Time: ${updateExpenseEndTime - updateExpenseStartTime} ms. Payload:`, dataToFirestore, error);
         throw error;
    }
};

export const deleteExpense = async (expenseId: string) => {
    const deleteExpenseStartTime = performance.now();
    console.log(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Deleting expense ID: ${expenseId} from 'expenses' collection.`);
    if (!db || !expensesCollectionRef) {
        console.warn(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Firestore DB or expensesCollectionRef is not initialized. Expense not deleted.`);
        throw new Error("Firestore DB or expensesCollectionRef not initialized.");
    }
    const expenseDocRef = doc(expensesCollectionRef, expenseId);
    try {
        const expenseSnap = await getDoc(expenseDocRef);
        if (expenseSnap.exists()) {
            const expenseData = expenseSnap.data() as FirestoreExpense;
            if (expenseData.receiptPath) {
                try {
                    console.log(`[firestoreService deleteExpense] Deleting receipt from storage: ${expenseData.receiptPath}`);
                    await deleteStorageReceipt(expenseData.receiptPath);
                } catch (storageError) {
                    console.error(`[firestoreService deleteExpense] Error deleting receipt ${expenseData.receiptPath} from storage:`, storageError);
                }
            }
        }
        await deleteDoc(expenseDocRef);
        const deleteExpenseEndTime = performance.now();
        console.log(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Expense deleted successfully for ID: ${expenseId}. Time: ${deleteExpenseEndTime - deleteExpenseStartTime} ms`);
    } catch (error) {
         const deleteExpenseEndTime = performance.now();
         console.error(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Error deleting expense for ID: ${expenseId}. Time: ${deleteExpenseEndTime - deleteExpenseStartTime} ms`, error);
         throw error;
    }
};

// --- Fueling Service ---
export interface FuelingFilter {
    userId?: string;
    tripId?: string;
    vehicleId?: string;
    startDate?: Date;
    endDate?: Date;
}
export const getFuelings = async (filter?: FuelingFilter): Promise<FirestoreFueling[]> => {
    const getFuelingsStartTime = performance.now();
    console.log(`[firestoreService getFuelings ${getFuelingsStartTime}] Fetching fuelings from 'fuelings' collection with filter:`, filter);
    if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService getFuelings ${getFuelingsStartTime}] Firestore DB or fuelingsCollectionRef is not initialized. Returning empty array.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (filter?.tripId) {
            constraints.push(where('tripId', '==', filter.tripId));
        }
        if (filter?.vehicleId) {
            constraints.push(where('vehicleId', '==', filter.vehicleId));
        }
        if (filter?.userId) {
            constraints.push(where('userId', '==', filter.userId));
        }
        if (filter?.startDate) {
            constraints.push(where('date', '>=', Timestamp.fromDate(filter.startDate)));
        }
        if (filter?.endDate) {
            const endDatePlusOne = new Date(filter.endDate);
            endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
            constraints.push(where('date', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        constraints.push(orderBy('date', 'desc'));

        const q = query(fuelingsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const fuelings = querySnapshot.docs.map(docInstance => { // Renamed doc to docInstance
            const data = docInstance.data();
            return {
                id: docInstance.id,
                tripId: data.tripId,
                userId: data.userId,
                vehicleId: data.vehicleId,
                date: data.date as Timestamp,
                liters: data.liters,
                pricePerLiter: data.pricePerLiter,
                totalCost: data.totalCost,
                location: data.location,
                comments: data.comments,
                odometerKm: data.odometerKm,
                fuelType: data.fuelType,
                receiptFilename: data.receiptFilename,
                receiptUrl: data.receiptUrl,
                receiptPath: data.receiptPath,
            } as FirestoreFueling;
        });
        const getFuelingsEndTime = performance.now();
        console.log(`[firestoreService getFuelings ${getFuelingsStartTime}] Found ${fuelings.length} fuelings. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`);
        return fuelings;
    } catch (error) {
        const getFuelingsEndTime = performance.now();
        console.error(`[firestoreService getFuelings ${getFuelingsStartTime}] Error fetching fuelings. Time: ${getFuelingsEndTime - getFuelingsStartTime} ms`, error);
        if ((error as any).code === 'unavailable') {
            console.warn('Firestore is offline. Cannot fetch fuelings.');
        }
        return [];
    }
};

export const addFueling = async (fuelingData: Omit<FirestoreFueling, 'id'>): Promise<string> => {
    const addFuelingStartTime = performance.now();
    const dataToFirestore = { ...cleanDataForFirestore(fuelingData) };

    if (dataToFirestore.date && !(dataToFirestore.date instanceof Timestamp)) dataToFirestore.date = Timestamp.fromDate(new Date(dataToFirestore.date));

    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => {
        if (dataToFirestore[field] === null || dataToFirestore[field] === undefined) {
            delete dataToFirestore[field];
        }
    });
    console.log(`[firestoreService addFueling ${addFuelingStartTime}] Adding new fueling to 'fuelings' collection. Data for Firestore:`, dataToFirestore);

    if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService addFueling ${addFuelingStartTime}] Firestore DB or fuelingsCollectionRef is not initialized. Fueling not added.`);
        throw new Error("Firestore DB or fuelingsCollectionRef not initialized.");
    }
    try {
        const docRef = await addDoc(fuelingsCollectionRef, dataToFirestore);
        const addFuelingEndTime = performance.now();
        console.log(`[firestoreService addFueling ${addFuelingStartTime}] Fueling added successfully to 'fuelings' with ID: ${docRef.id}. Time: ${addFuelingEndTime - addFuelingStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addFuelingEndTime = performance.now();
         console.error(`[firestoreService addFueling ${addFuelingStartTime}] Error adding fueling. Time: ${addFuelingEndTime - addFuelingStartTime} ms. Payload:`, dataToFirestore, error);
         throw error;
    }
};

export const updateFueling = async (fuelingId: string, data: Partial<Omit<FirestoreFueling, 'id'>>) => {
    const updateFuelingStartTime = performance.now();
    const dataToFirestore = { ...cleanDataForFirestore(data) };

    if (dataToFirestore.date && !(dataToFirestore.date instanceof Timestamp)) dataToFirestore.date = Timestamp.fromDate(new Date(dataToFirestore.date));

    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => {
        if (data.hasOwnProperty(field)) {
            if ((data as any)[field] === null || (data as any)[field] === undefined) { // Corrected type assertion
                delete dataToFirestore[field];
            }
        } else {
             if (dataToFirestore[field] === undefined) delete dataToFirestore[field];
        }
    });
    console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Updating fueling ID: ${fuelingId} in 'fuelings' collection. Data for Firestore:`, dataToFirestore);


    if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService updateFueling ${updateFuelingStartTime}] Firestore DB or fuelingsCollectionRef is not initialized. Fueling not updated.`);
        throw new Error("Firestore DB or fuelingsCollectionRef not initialized.");
    }
    const fuelingDocRef = doc(fuelingsCollectionRef, fuelingId);
    try {
        await updateDoc(fuelingDocRef, dataToFirestore);
        const updateFuelingEndTime = performance.now();
        console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Fueling updated successfully for ID: ${fuelingId}. Time: ${updateFuelingEndTime - updateFuelingStartTime} ms`);
    } catch (error) {
         const updateFuelingEndTime = performance.now();
         console.error(`[firestoreService updateFueling ${updateFuelingStartTime}] Error updating fueling for ID: ${fuelingId}. Time: ${updateFuelingEndTime - updateFuelingStartTime} ms. Payload:`, dataToFirestore, error);
         throw error;
    }
};

export const deleteFueling = async (fuelingId: string) => {
    const deleteFuelingStartTime = performance.now();
    console.log(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Deleting fueling ID: ${fuelingId} from 'fuelings' collection.`);
    if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Firestore DB or fuelingsCollectionRef is not initialized. Fueling not deleted.`);
        throw new Error("Firestore DB or fuelingsCollectionRef not initialized.");
    }
    const fuelingDocRef = doc(fuelingsCollectionRef, fuelingId);
    try {
        const fuelingSnap = await getDoc(fuelingDocRef);
        if (fuelingSnap.exists()) {
            const fuelingData = fuelingSnap.data() as FirestoreFueling;
            if (fuelingData.receiptPath) {
                try {
                    console.log(`[firestoreService deleteFueling] Deleting receipt from storage: ${fuelingData.receiptPath}`);
                    await deleteStorageReceipt(fuelingData.receiptPath);
                } catch (storageError) {
                    console.error(`[firestoreService deleteFueling] Error deleting receipt ${fuelingData.receiptPath} from storage:`, storageError);
                }
            }
        }
        await deleteDoc(fuelingDocRef);
        const deleteFuelingEndTime = performance.now();
        console.log(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Fueling deleted successfully for ID: ${fuelingId}. Time: ${deleteFuelingEndTime - deleteFuelingStartTime} ms`);
    } catch (error) {
         const deleteFuelingEndTime = performance.now();
         console.error(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Error deleting fueling for ID: ${fuelingId}. Time: ${deleteFuelingEndTime - deleteFuelingStartTime} ms`, error);
         throw error;
    }
};

// --- Custom Type Services (Visit Types, Expense Types) ---
const addCustomTypeToFirestore = async (
    collectionRef: CollectionReference | null,
    typeName: string
): Promise<string> => {
    const addTypeStartTime = performance.now();
    if (!db || !collectionRef) {
        throw new Error(`Firestore DB or collection reference for custom types is not initialized.`);
    }
    const q = query(collectionRef, where("name", "==", typeName));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        const existingDoc = querySnapshot.docs[0];
        console.warn(`[addCustomTypeToFirestore ${addTypeStartTime}] Type "${typeName}" already exists in Firestore with ID ${existingDoc.id}. Returning existing ID.`);
        return existingDoc.id;
    }

    console.log(`[addCustomTypeToFirestore ${addTypeStartTime}] Adding new custom type "${typeName}" to collection ${collectionRef.id}.`);
    try {
        const docRef = await addDoc(collectionRef, { name: typeName });
        console.log(`[addCustomTypeToFirestore ${addTypeStartTime}] Custom type "${typeName}" added with ID: ${docRef.id}.`);
        return docRef.id;
    } catch (error) {
        console.error(`[addCustomTypeToFirestore ${addTypeStartTime}] Error adding custom type "${typeName}":`, error);
        throw error;
    }
};

export const addVisitTypeToFirestore = (name: string) => addCustomTypeToFirestore(visitTypesCollectionRef, name);
export const addExpenseTypeToFirestore = (name: string) => addCustomTypeToFirestore(expenseTypesCollectionRef, name);


const getCustomTypesFromFirestore = async (
    collectionRef: CollectionReference | null
): Promise<FirestoreCustomType[]> => {
    const getTypesStartTime = performance.now();
    if (!db || !collectionRef) {
        console.warn(`[getCustomTypesFromFirestore] Firestore DB or collection reference is not initialized. Returning empty array.`);
        return [];
    }
    console.log(`[getCustomTypesFromFirestore ${getTypesStartTime}] Fetching custom types from collection ${collectionRef.id}.`);
    try {
        const querySnapshot = await getDocs(query(collectionRef, orderBy("name")));
        const types = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
        } as FirestoreCustomType));
        console.log(`[getCustomTypesFromFirestore ${getTypesStartTime}] Found ${types.length} types.`);
        return types;
    } catch (error) {
        console.error(`[getCustomTypesFromFirestore ${getTypesStartTime}] Error fetching custom types:`, error);
        return [];
    }
};

export const getVisitTypesFromFirestore = () => getCustomTypesFromFirestore(visitTypesCollectionRef);
export const getExpenseTypesFromFirestore = () => getCustomTypesFromFirestore(expenseTypesCollectionRef);


const deleteCustomTypeFromFirestore = async (
    collectionRef: CollectionReference | null,
    firebaseId: string
): Promise<void> => {
    const deleteTypeStartTime = performance.now();
    if (!db || !collectionRef) {
        throw new Error(`Firestore DB or collection reference for custom types is not initialized.`);
    }
    console.log(`[deleteCustomTypeFromFirestore ${deleteTypeStartTime}] Deleting custom type with ID: ${firebaseId} from collection ${collectionRef.id}.`);
    try {
        const docRef = doc(collectionRef, firebaseId);
        await deleteDoc(docRef);
        console.log(`[deleteCustomTypeFromFirestore ${deleteTypeStartTime}] Custom type ${firebaseId} deleted.`);
    } catch (error) {
        console.error(`[deleteCustomTypeFromFirestore ${deleteTypeStartTime}] Error deleting custom type ${firebaseId}:`, error);
        throw error;
    }
};

export const deleteVisitTypeFromFirestore = (firebaseId: string) => deleteCustomTypeFromFirestore(visitTypesCollectionRef, firebaseId);
export const deleteExpenseTypeFromFirestore = (firebaseId: string) => deleteCustomTypeFromFirestore(expenseTypesCollectionRef, firebaseId);



// --- Batch Delete for Trip Deletion ---
export const deleteTripAndRelatedData = async (tripId: string) => {
    const deleteBatchStartTime = performance.now();
    console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Starting batch delete for trip ID: ${tripId}`);
    if (!db || !tripsCollectionRef || !visitsCollectionRef || !expensesCollectionRef || !fuelingsCollectionRef) {
        console.warn(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Firestore DB or one of the collection references is not initialized. Trip and related data not deleted.`);
        throw new Error("Firestore DB or required collection references not initialized.");
    }
    const batch = writeBatch(db);
    const relatedReceiptPaths: string[] = [];

    try {
        console.log(`[deleteTripAndRelatedData] Preparing to delete trip: ${tripId}`);
        const tripDocRef = doc(tripsCollectionRef, tripId);
        batch.delete(tripDocRef);

        const visitsQuery = query(visitsCollectionRef, where('tripId', '==', tripId));
        const visitsSnapshot = await getDocs(visitsQuery);
        console.log(`[deleteTripAndRelatedData] Found ${visitsSnapshot.docs.length} visits to delete for trip ${tripId}.`);
        visitsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        const expensesQuery = query(expensesCollectionRef, where('tripId', '==', tripId));
        const expensesSnapshot = await getDocs(expensesQuery);
        console.log(`[deleteTripAndRelatedData] Found ${expensesSnapshot.docs.length} expenses to delete for trip ${tripId}.`);
        expensesSnapshot.docs.forEach(expenseDoc => {
            batch.delete(expenseDoc.ref);
            const expenseData = expenseDoc.data() as FirestoreExpense;
            if (expenseData.receiptPath) relatedReceiptPaths.push(expenseData.receiptPath);
        });

        const fuelingsQuery = query(fuelingsCollectionRef, where('tripId', '==', tripId));
        const fuelingsSnapshot = await getDocs(fuelingsQuery);
         console.log(`[deleteTripAndRelatedData] Found ${fuelingsSnapshot.docs.length} fuelings to delete for trip ${tripId}.`);
         fuelingsSnapshot.docs.forEach(fuelingDoc => {
            batch.delete(fuelingDoc.ref);
            const fuelingData = fuelingDoc.data() as FirestoreFueling;
            if (fuelingData.receiptPath) relatedReceiptPaths.push(fuelingData.receiptPath);
        });

        console.log(`[deleteTripAndRelatedData] Committing Firestore batch delete for trip ${tripId}...`);
        await batch.commit();
        console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Firestore batch delete committed for trip ${tripId}.`);

        if (relatedReceiptPaths.length > 0) {
             console.log(`[deleteTripAndRelatedData] Attempting to delete ${relatedReceiptPaths.length} related receipts from storage for trip ${tripId}...`);
             const deleteStoragePromises = relatedReceiptPaths.map(path =>
                 deleteStorageReceipt(path).catch(e => console.error(`Failed to delete receipt ${path} for trip ${tripId}:`, e))
             );
             await Promise.all(deleteStoragePromises);
             console.log(`[deleteTripAndRelatedData] Finished attempting receipt deletions for trip ${tripId}.`);
        }

        const deleteBatchEndTime = performance.now();
        console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Successfully deleted trip ${tripId} and related data. Time: ${deleteBatchEndTime - deleteBatchStartTime} ms`);

    } catch (error) {
         const deleteBatchEndTime = performance.now();
         console.error(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Error deleting trip ${tripId} and related data. Time: ${deleteBatchEndTime - deleteBatchStartTime} ms`, error);
         throw error;
    }
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
    const getUserByEmailStartTime = performance.now();
    console.log(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] Getting user by email: ${email} from 'users' collection`);
    if (!db || !usersCollectionRef) {
        console.warn(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] Firestore DB or usersCollectionRef is not initialized. Cannot get user by email.`);
        return null;
    }
    const q = query(usersCollectionRef, where('email', '==', email));
    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userDataFromSnap = userDoc.data();
            const userData = {
                id: userDoc.id,
                firebaseId: userDoc.id,
                name: userDataFromSnap.name || `Usuário ${userDoc.id.substring(0,6)}`,
                email: userDataFromSnap.email || 'N/A',
                username: userDataFromSnap.username || userDataFromSnap.email?.split('@')[0] || `user_${userDoc.id.substring(0,6)}`,
                role: userDataFromSnap.role || 'driver',
                base: (userDataFromSnap.role === 'admin' ? 'ALL' : userDataFromSnap.base) || 'N/A',
            } as User;
            const getUserByEmailEndTime = performance.now();
            console.log(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] User found. Time: ${getUserByEmailEndTime - getUserByEmailStartTime} ms`);
            return userData;
        }
        const getUserByEmailEndTime = performance.now();
        console.log(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] User not found. Time: ${getUserByEmailEndTime - getUserByEmailStartTime} ms`);
        return null;
    } catch (error) {
        const getUserByEmailEndTime = performance.now();
        console.error(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] Error getting user by email. Time: ${getUserByEmailEndTime - getUserByEmailStartTime} ms`, error);
        throw error;
    }
};

export const getVehicleByLicensePlate = async (licensePlate: string): Promise<FirestoreVehicle | null> => {
    const getVehicleByPlateStartTime = performance.now();
    console.log(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Getting vehicle by license plate: ${licensePlate} from 'vehicles' collection`);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Firestore DB or vehiclesCollectionRef is not initialized. Cannot get vehicle by license plate.`);
        return null;
    }
    const q = query(vehiclesCollectionRef, where('licensePlate', '==', licensePlate.toUpperCase()));
    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const vehicleDoc = querySnapshot.docs[0];
            const vehicleData = { id: vehicleDoc.id, ...vehicleDoc.data() } as FirestoreVehicle;
            const getVehicleByPlateEndTime = performance.now();
            console.log(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Vehicle found. Time: ${getVehicleByPlateEndTime - getVehicleByPlateStartTime} ms`);
            return vehicleData;
        }
        const getVehicleByPlateEndTime = performance.now();
        console.log(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Vehicle not found. Time: ${getVehicleByPlateEndTime - getVehicleByPlateStartTime} ms`);
        return null;
    } catch (error) {
        const getVehicleByPlateEndTime = performance.now();
        console.error(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Error getting vehicle by license plate. Time: ${getVehicleByPlateEndTime - getVehicleByPlateStartTime} ms`, error);
        throw error;
    }
};
