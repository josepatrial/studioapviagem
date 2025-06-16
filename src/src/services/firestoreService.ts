
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
  serverTimestamp, // Import serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { User, DriverInfo, UserRole } from '@/contexts/AuthContext';
export type { User, DriverInfo };

import { deleteReceipt as deleteStorageReceipt } from './storageService';

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
  timestamp: Timestamp; // Actual event time of the visit
  visitType?: string;
  createdAt: Timestamp; // Record creation time
  updatedAt: Timestamp; // Record last update time
}

export interface FirestoreExpense {
  id: string; // Document ID
  tripId: string;
  userId: string;
  description: string;
  value: number;
  expenseType: string;
  expenseDate: Timestamp; // Actual date of the expense
  comments?: string;
  receiptFilename?: string;
  receiptUrl?: string;
  receiptPath?: string;
  createdAt: Timestamp; // Record creation time
  updatedAt: Timestamp; // Record last update time
}

export interface FirestoreFueling {
  id: string; // Document ID
  tripId: string;
  userId: string;
  vehicleId: string;
  date: Timestamp; // Actual date of fueling
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
  createdAt: Timestamp; // Record creation time
  updatedAt: Timestamp; // Record last update time
}

export interface FirestoreVehicle {
  id: string; // Document ID
  model: string;
  year: number;
  licensePlate: string;
  deleted?: boolean;
  createdAt: Timestamp; // Record creation time
  updatedAt: Timestamp; // Record last update time
}

export interface FirestoreCustomType {
    id: string; // Firestore document ID
    name: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
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

    const internalFields = ['passwordHash', 'lastLogin', 'syncStatus', 'deleted', 'firebaseId', 'localId', 'id', 'createdAt', 'updatedAt'];
    internalFields.forEach(field => delete cleanedData[field]);
    return cleanedData;
};


const cleanDataForFirestore = (data: Record<string, any>): Record<string, any> => {
    const cleanedData: Record<string, any> = {};
    for (const key in data) {
        if (data[key] !== undefined) {
            cleanedData[key] = data[key];
        }
    }
    const internalFields = ['syncStatus', 'deleted', 'firebaseId', 'localId', 'id', 'createdAt', 'updatedAt'];
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
        firebaseId: userDocSnap.id,
        name: userDataFromSnap.name || `Usuário ${userDocSnap.id.substring(0,6)}`,
        email: userDataFromSnap.email || 'N/A',
        username: userDataFromSnap.username || userDataFromSnap.email?.split('@')[0] || `user_${userDocSnap.id.substring(0,6)}`,
        role: userDataFromSnap.role || 'driver',
        base: (userDataFromSnap.role === 'admin' ? 'ALL' : userDataFromSnap.base) || 'N/A',
        // createdAt: userDataFromSnap.createdAt, // Assuming these might exist
        // updatedAt: userDataFromSnap.updatedAt,
      } as User; // User interface needs to be flexible or include these if they are standard
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
    const dataWithTimestamp = { ...cleanedData, updatedAt: serverTimestamp() };
    console.log(`[firestoreService setUserData ${setUserStartTime}] Setting/merging user data for ID: ${userId}. Data:`, dataWithTimestamp);
    if (!db || !usersCollectionRef) {
        console.error(`[firestoreService setUserData ${setUserStartTime}] Firestore DB or usersCollectionRef not initialized.`);
        throw new Error("Firestore DB or usersCollectionRef not initialized.");
    }
    const userDocRef = doc(usersCollectionRef, userId);
    try {
      await setDoc(userDocRef, dataWithTimestamp, { merge: true });
      console.log(`[firestoreService setUserData ${setUserStartTime}] User data set/merged successfully for ${userId}.`);
    } catch (error) {
        console.error(`[firestoreService setUserData ${setUserStartTime}] Error setting/merging user data for ${userId}:`, error);
        throw error;
    }
};

export const addUser = async (userId: string, userData: Omit<User, 'id' | 'firebaseId'>): Promise<void> => {
    const addUserStartTime = performance.now();
    const finalUserData: Partial<User> = {
         ...userData,
         role: userData.role || 'driver',
         base: userData.role === 'admin' ? 'ALL' : (userData.base || 'N/A')
     };
    const cleanedData = cleanUserDataForFirestore(finalUserData);
    const dataWithTimestamps = {
        ...cleanedData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    console.log(`[firestoreService addUser ${addUserStartTime}] Adding user ${userId}. Data:`, dataWithTimestamps);
    if (!db || !usersCollectionRef) {
        console.error(`[firestoreService addUser ${addUserStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or usersCollectionRef not initialized.");
    }
    try {
        const userDocRef = doc(usersCollectionRef, userId);
        await setDoc(userDocRef, dataWithTimestamps);
        console.log(`[firestoreService addUser ${addUserStartTime}] User ${userId} created.`);
    } catch (error) {
        console.error(`[firestoreService addUser ${addUserStartTime}] Error creating user ${userId}:`, error);
        throw error;
    }
};

export const updateUser = async (userId: string, data: Partial<DriverInfo>) => {
    const updateUserStartTime = performance.now();
    const cleanedData = cleanUserDataForFirestore(data);
    const dataWithTimestamp = { ...cleanedData, updatedAt: serverTimestamp() };
    console.log(`[firestoreService updateUser ${updateUserStartTime}] Updating user ${userId}. Data:`, dataWithTimestamp);
    if (!db || !usersCollectionRef) {
        console.error(`[firestoreService updateUser ${updateUserStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or usersCollectionRef not initialized.");
    }
    const userDocRef = doc(usersCollectionRef, userId);
    try {
        await updateDoc(userDocRef, dataWithTimestamp);
        console.log(`[firestoreService updateUser ${updateUserStartTime}] User ${userId} updated.`);
    } catch (error) {
        console.error(`[firestoreService updateUser ${updateUserStartTime}] Error updating user ${userId}:`, error);
        throw error;
    }
};

export const deleteUser = async (userId: string) => {
    const deleteUserStartTime = performance.now();
    console.log(`[firestoreService deleteUser ${deleteUserStartTime}] Deleting user ${userId}.`);
    if (!db || !usersCollectionRef) {
        console.error(`[firestoreService deleteUser ${deleteUserStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or usersCollectionRef not initialized.");
    }
    const userDocRef = doc(usersCollectionRef, userId);
    try {
        await deleteDoc(userDocRef);
        console.log(`[firestoreService deleteUser ${deleteUserStartTime}] User ${userId} deleted.`);
    } catch (error) {
        console.error(`[firestoreService deleteUser ${deleteUserStartTime}] Error deleting user ${userId}:`, error);
        throw error;
    }
};

export const getDrivers = async (): Promise<DriverInfo[]> => {
    const getDriversStartTime = performance.now();
    console.log(`[firestoreService getDrivers ${getDriversStartTime}] Fetching drivers...`);
    if (!db || !usersCollectionRef) {
        console.error(`[firestoreService getDrivers ${getDriversStartTime}] Firestore not initialized.`);
        return [];
    }
    try {
        const q = query(usersCollectionRef, where('role', '==', 'driver'));
        const querySnapshot = await getDocs(q);
        const drivers = querySnapshot.docs.map(docInstance => {
            const data = docInstance.data();
            return {
                id: docInstance.id,
                firebaseId: docInstance.id,
                email: data.email,
                name: data.name || data.email || `Motorista ${docInstance.id.substring(0,6)}`,
                username: data.username || data.email?.split('@')[0],
                role: 'driver',
                base: data.base || 'N/A',
            } as DriverInfo;
        });
        console.log(`[firestoreService getDrivers ${getDriversStartTime}] Found ${drivers.length} drivers.`);
        return drivers;
    } catch (error) {
         console.error(`[firestoreService getDrivers ${getDriversStartTime}] Error fetching drivers:`, error);
         if ((error as any).code === 'unavailable') console.warn('Firestore is offline.');
         return [];
    }
};

// --- Vehicle Service ---
export const getVehicles = async (): Promise<FirestoreVehicle[]> => {
    const getVehiclesStartTime = performance.now();
    console.log(`[firestoreService getVehicles ${getVehiclesStartTime}] Fetching vehicles...`);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService getVehicles ${getVehiclesStartTime}] Firestore not initialized. Returning empty array.`);
        return [];
    }
    try {
        const querySnapshot = await getDocs(vehiclesCollectionRef);
        const vehicles = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt || Timestamp.now(), // Fallback for existing docs
            updatedAt: doc.data().updatedAt || Timestamp.now()  // Fallback for existing docs
        }) as FirestoreVehicle);
        console.log(`[firestoreService getVehicles ${getVehiclesStartTime}] Found ${vehicles.length} vehicles.`);
        return vehicles;
    } catch (error) {
         console.error(`[firestoreService getVehicles ${getVehiclesStartTime}] Error fetching vehicles:`, error);
         if ((error as any).code === 'unavailable') console.warn('Firestore is offline.');
         return [];
    }
};

export const addVehicle = async (vehicleData: Omit<FirestoreVehicle, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const addVehicleStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(vehicleData);
    const dataWithTimestamps = {
        ...cleanedData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    console.log(`[firestoreService addVehicle ${addVehicleStartTime}] Adding vehicle. Data:`, dataWithTimestamps);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService addVehicle ${addVehicleStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or vehiclesCollectionRef not initialized.");
    }
    try {
        const docRef = await addDoc(vehiclesCollectionRef, dataWithTimestamps);
        console.log(`[firestoreService addVehicle ${addVehicleStartTime}] Vehicle added with ID: ${docRef.id}.`);
        return docRef.id;
    } catch (error) {
         console.error(`[firestoreService addVehicle ${addVehicleStartTime}] Error adding vehicle:`, error);
         throw error;
    }
};

export const updateVehicle = async (vehicleId: string, data: Partial<Omit<FirestoreVehicle, 'id' | 'createdAt'>>) => {
    const updateVehicleStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    const dataWithTimestamp = { ...cleanedData, updatedAt: serverTimestamp() };
    console.log(`[firestoreService updateVehicle ${updateVehicleStartTime}] Updating vehicle ${vehicleId}. Data:`, dataWithTimestamp);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService updateVehicle ${updateVehicleStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or vehiclesCollectionRef not initialized.");
    }
    const vehicleDocRef = doc(vehiclesCollectionRef, vehicleId);
    try {
        await updateDoc(vehicleDocRef, dataWithTimestamp);
        console.log(`[firestoreService updateVehicle ${updateVehicleStartTime}] Vehicle ${vehicleId} updated.`);
    } catch (error) {
         console.error(`[firestoreService updateVehicle ${updateVehicleStartTime}] Error updating vehicle ${vehicleId}:`, error);
         throw error;
    }
};

export const deleteVehicle = async (vehicleId: string) => {
    const deleteVehicleStartTime = performance.now();
    console.log(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Deleting vehicle ${vehicleId}.`);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or vehiclesCollectionRef not initialized.");
    }
    const vehicleDocRef = doc(vehiclesCollectionRef, vehicleId);
    try {
        await deleteDoc(vehicleDocRef);
        console.log(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Vehicle ${vehicleId} deleted.`);
    } catch (error) {
         console.error(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Error deleting vehicle ${vehicleId}:`, error);
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
    console.log(`[firestoreService getTrips ${getTripsStartTime}] Fetching trips with filters:`, filters);
    if (!db || !tripsCollectionRef) {
        console.warn(`[firestoreService getTrips ${getTripsStartTime}] Firestore not initialized. Returning empty array.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (filters.userId) constraints.push(where('userId', '==', filters.userId));
        if (filters.base && filters.base !== 'ALL') constraints.push(where('base', '==', filters.base));
        if (filters.startDate) constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(filters.startDate))));
        if (filters.endDate) {
             const endDatePlusOne = new Date(filters.endDate);
             endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
             constraints.push(where('createdAt', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        constraints.push(orderBy('status', 'asc'));
        constraints.push(orderBy('createdAt', 'desc'));

        const q = query(tripsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const trips = querySnapshot.docs.map(docInstance => ({
            id: docInstance.id, ...docInstance.data()
        } as FirestoreTrip));
        console.log(`[firestoreService getTrips ${getTripsStartTime}] Found ${trips.length} trips.`);
        return trips;
    } catch (error) {
        console.error(`[firestoreService getTrips ${getTripsStartTime}] Error fetching trips:`, error);
        if ((error as any).code === 'unavailable') console.warn('Firestore is offline.');
        return [];
    }
};

export const addTrip = async (tripData: Omit<FirestoreTrip, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const addTripStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(tripData);
    const finalData = {
        ...cleanedData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    console.log(`[firestoreService addTrip ${addTripStartTime}] Adding trip. Data:`, finalData);
    if (!db || !tripsCollectionRef) {
        console.warn(`[firestoreService addTrip ${addTripStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or tripsCollectionRef not initialized.");
    }
    try {
        const docRef = await addDoc(tripsCollectionRef, finalData);
        console.log(`[firestoreService addTrip ${addTripStartTime}] Trip added with ID: ${docRef.id}.`);
        return docRef.id;
    } catch (error) {
         console.error(`[firestoreService addTrip ${addTripStartTime}] Error adding trip:`, error);
         throw error;
    }
};

export const updateTrip = async (tripId: string, data: Partial<Omit<FirestoreTrip, 'id' | 'createdAt'>>) => {
    const updateTripStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    const dataToUpdate = {
        ...cleanedData,
        updatedAt: serverTimestamp(),
    };
    console.log(`[firestoreService updateTrip ${updateTripStartTime}] Updating trip ${tripId}. Data:`, dataToUpdate);
    if (!db || !tripsCollectionRef) {
        console.warn(`[firestoreService updateTrip ${updateTripStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or tripsCollectionRef not initialized.");
    }
    const tripDocRef = doc(tripsCollectionRef, tripId);
    try {
        await updateDoc(tripDocRef, dataToUpdate);
        console.log(`[firestoreService updateTrip ${updateTripStartTime}] Trip ${tripId} updated.`);
    } catch (error) {
         console.error(`[firestoreService updateTrip ${updateTripStartTime}] Error updating trip ${tripId}:`, error);
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
    console.log(`[firestoreService getVisits ${getVisitsStartTime}] Fetching visits with filters:`, filters);
    if (!db || !visitsCollectionRef) {
        console.warn(`[firestoreService getVisits ${getVisitsStartTime}] Firestore not initialized.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (filters.userId) constraints.push(where('userId', '==', filters.userId));
        if (filters.tripId) constraints.push(where('tripId', '==', filters.tripId));
        if (filters.startDate) constraints.push(where('timestamp', '>=', Timestamp.fromDate(filters.startDate)));
        if (filters.endDate) {
            const endDatePlusOne = new Date(filters.endDate);
            endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
            constraints.push(where('timestamp', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        constraints.push(orderBy('timestamp', 'desc'));

        const q = query(visitsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const visits = querySnapshot.docs.map(docInstance => ({
            id: docInstance.id, ...docInstance.data()
        } as FirestoreVisit));
        console.log(`[firestoreService getVisits ${getVisitsStartTime}] Found ${visits.length} visits.`);
        return visits;
    } catch (error) {
         console.error(`[firestoreService getVisits ${getVisitsStartTime}] Error fetching visits:`, error);
         if ((error as any).code === 'unavailable') console.warn('Firestore is offline.');
         return [];
    }
};


export const addVisit = async (visitData: Omit<FirestoreVisit, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const addVisitStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(visitData);
    const dataWithTimestamps = {
        ...cleanedData,
        timestamp: cleanedData.timestamp instanceof Timestamp ? cleanedData.timestamp : Timestamp.fromDate(new Date(cleanedData.timestamp as any)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    console.log(`[firestoreService addVisit ${addVisitStartTime}] Adding visit. Data:`, dataWithTimestamps);
    if (!db || !visitsCollectionRef) {
        console.warn(`[firestoreService addVisit ${addVisitStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or visitsCollectionRef not initialized.");
    }
    try {
        const docRef = await addDoc(visitsCollectionRef, dataWithTimestamps);
        console.log(`[firestoreService addVisit ${addVisitStartTime}] Visit added with ID: ${docRef.id}.`);
        return docRef.id;
    } catch (error) {
         console.error(`[firestoreService addVisit ${addVisitStartTime}] Error adding visit:`, error);
         throw error;
    }
};

export const updateVisit = async (visitId: string, data: Partial<Omit<FirestoreVisit, 'id' | 'createdAt'>>) => {
    const updateVisitStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    const dataToUpdate:any = { ...cleanedData, updatedAt: serverTimestamp() };
    if (cleanedData.timestamp && !(cleanedData.timestamp instanceof Timestamp)) {
        dataToUpdate.timestamp = Timestamp.fromDate(new Date(cleanedData.timestamp as any));
    }
    console.log(`[firestoreService updateVisit ${updateVisitStartTime}] Updating visit ${visitId}. Data:`, dataToUpdate);
    if (!db || !visitsCollectionRef) {
        console.warn(`[firestoreService updateVisit ${updateVisitStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or visitsCollectionRef not initialized.");
    }
    const visitDocRef = doc(visitsCollectionRef, visitId);
    try {
        await updateDoc(visitDocRef, dataToUpdate);
        console.log(`[firestoreService updateVisit ${updateVisitStartTime}] Visit ${visitId} updated.`);
    } catch (error) {
         console.error(`[firestoreService updateVisit ${updateVisitStartTime}] Error updating visit ${visitId}:`, error);
         throw error;
    }
};

export const deleteVisit = async (visitId: string) => {
    const deleteVisitStartTime = performance.now();
    console.log(`[firestoreService deleteVisit ${deleteVisitStartTime}] Deleting visit ${visitId}.`);
    if (!db || !visitsCollectionRef) {
        console.warn(`[firestoreService deleteVisit ${deleteVisitStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or visitsCollectionRef not initialized.");
    }
    const visitDocRef = doc(visitsCollectionRef, visitId);
    try {
        await deleteDoc(visitDocRef);
        console.log(`[firestoreService deleteVisit ${deleteVisitStartTime}] Visit ${visitId} deleted.`);
    } catch (error) {
         console.error(`[firestoreService deleteVisit ${deleteVisitStartTime}] Error deleting visit ${visitId}:`, error);
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
    console.log(`[firestoreService getExpenses ${getExpensesStartTime}] Fetching expenses with filters:`, filters);
    if (!db || !expensesCollectionRef) {
        console.warn(`[firestoreService getExpenses ${getExpensesStartTime}] Firestore not initialized.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (filters.userId) constraints.push(where('userId', '==', filters.userId));
        if (filters.tripId) constraints.push(where('tripId', '==', filters.tripId));
        if (filters.startDate) constraints.push(where('expenseDate', '>=', Timestamp.fromDate(filters.startDate)));
        if (filters.endDate) {
            const endDatePlusOne = new Date(filters.endDate);
            endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
            constraints.push(where('expenseDate', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        constraints.push(orderBy('expenseDate', 'desc'));

        const q = query(expensesCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const expenses = querySnapshot.docs.map(docInstance => ({
            id: docInstance.id, ...docInstance.data()
        } as FirestoreExpense));
        console.log(`[firestoreService getExpenses ${getExpensesStartTime}] Found ${expenses.length} expenses.`);
        return expenses;
    } catch (error) {
         console.error(`[firestoreService getExpenses ${getExpensesStartTime}] Error fetching expenses:`, error);
         if ((error as any).code === 'unavailable') console.warn('Firestore is offline.');
         return [];
    }
};

export const addExpense = async (expenseData: Omit<FirestoreExpense, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const addExpenseStartTime = performance.now();
    const dataToFirestore = { ...cleanDataForFirestore(expenseData) };
    if (dataToFirestore.expenseDate && !(dataToFirestore.expenseDate instanceof Timestamp)) {
        dataToFirestore.expenseDate = Timestamp.fromDate(new Date(dataToFirestore.expenseDate as any));
    }
    const finalData = {
        ...dataToFirestore,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => { if (finalData[field] === null || finalData[field] === undefined) delete finalData[field]; });
    console.log(`[firestoreService addExpense ${addExpenseStartTime}] Adding expense. Data:`, finalData);
    if (!db || !expensesCollectionRef) {
        console.warn(`[firestoreService addExpense ${addExpenseStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or expensesCollectionRef not initialized.");
    }
    try {
        const docRef = await addDoc(expensesCollectionRef, finalData);
        console.log(`[firestoreService addExpense ${addExpenseStartTime}] Expense added with ID: ${docRef.id}.`);
        return docRef.id;
    } catch (error) {
         console.error(`[firestoreService addExpense ${addExpenseStartTime}] Error adding expense:`, error);
         throw error;
    }
};

export const updateExpense = async (expenseId: string, data: Partial<Omit<FirestoreExpense, 'id' | 'createdAt'>>) => {
    const updateExpenseStartTime = performance.now();
    const dataToFirestore = { ...cleanDataForFirestore(data) };
    if (dataToFirestore.expenseDate && !(dataToFirestore.expenseDate instanceof Timestamp)) {
        dataToFirestore.expenseDate = Timestamp.fromDate(new Date(dataToFirestore.expenseDate as any));
    }
    const finalData = { ...dataToFirestore, updatedAt: serverTimestamp() };
    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => { if (finalData.hasOwnProperty(field) && (finalData[field] === null || finalData[field] === undefined)) delete finalData[field]; });
    console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Updating expense ${expenseId}. Data:`, finalData);
    if (!db || !expensesCollectionRef) {
        console.warn(`[firestoreService updateExpense ${updateExpenseStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or expensesCollectionRef not initialized.");
    }
    const expenseDocRef = doc(expensesCollectionRef, expenseId);
    try {
        await updateDoc(expenseDocRef, finalData);
        console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Expense ${expenseId} updated.`);
    } catch (error) {
         console.error(`[firestoreService updateExpense ${updateExpenseStartTime}] Error updating expense ${expenseId}:`, error);
         throw error;
    }
};

export const deleteExpense = async (expenseId: string) => {
    const deleteExpenseStartTime = performance.now();
    console.log(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Deleting expense ${expenseId}.`);
    if (!db || !expensesCollectionRef) {
        console.warn(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or expensesCollectionRef not initialized.");
    }
    const expenseDocRef = doc(expensesCollectionRef, expenseId);
    try {
        const expenseSnap = await getDoc(expenseDocRef);
        if (expenseSnap.exists()) {
            const expenseData = expenseSnap.data() as FirestoreExpense;
            if (expenseData.receiptPath) {
                try { await deleteStorageReceipt(expenseData.receiptPath); } catch (e) { console.error("Error deleting receipt from storage:", e); }
            }
        }
        await deleteDoc(expenseDocRef);
        console.log(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Expense ${expenseId} deleted.`);
    } catch (error) {
         console.error(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Error deleting expense ${expenseId}:`, error);
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
    console.log(`[firestoreService getFuelings ${getFuelingsStartTime}] Fetching fuelings with filter:`, filter);
    if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService getFuelings ${getFuelingsStartTime}] Firestore not initialized.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (filter?.tripId) constraints.push(where('tripId', '==', filter.tripId));
        if (filter?.vehicleId) constraints.push(where('vehicleId', '==', filter.vehicleId));
        if (filter?.userId) constraints.push(where('userId', '==', filter.userId));
        if (filter?.startDate) constraints.push(where('date', '>=', Timestamp.fromDate(filter.startDate)));
        if (filter?.endDate) {
            const endDatePlusOne = new Date(filter.endDate);
            endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
            constraints.push(where('date', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        constraints.push(orderBy('date', 'desc'));

        const q = query(fuelingsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const fuelings = querySnapshot.docs.map(docInstance => ({
            id: docInstance.id, ...docInstance.data()
        } as FirestoreFueling));
        console.log(`[firestoreService getFuelings ${getFuelingsStartTime}] Found ${fuelings.length} fuelings.`);
        return fuelings;
    } catch (error) {
        console.error(`[firestoreService getFuelings ${getFuelingsStartTime}] Error fetching fuelings:`, error);
        if ((error as any).code === 'unavailable') console.warn('Firestore is offline.');
        return [];
    }
};

export const addFueling = async (fuelingData: Omit<FirestoreFueling, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const addFuelingStartTime = performance.now();
    const dataToFirestore = { ...cleanDataForFirestore(fuelingData) };
    if (dataToFirestore.date && !(dataToFirestore.date instanceof Timestamp)) {
        dataToFirestore.date = Timestamp.fromDate(new Date(dataToFirestore.date as any));
    }
    const finalData = {
        ...dataToFirestore,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => { if (finalData[field] === null || finalData[field] === undefined) delete finalData[field]; });
    console.log(`[firestoreService addFueling ${addFuelingStartTime}] Adding fueling. Data:`, finalData);
    if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService addFueling ${addFuelingStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or fuelingsCollectionRef not initialized.");
    }
    try {
        const docRef = await addDoc(fuelingsCollectionRef, finalData);
        console.log(`[firestoreService addFueling ${addFuelingStartTime}] Fueling added with ID: ${docRef.id}.`);
        return docRef.id;
    } catch (error) {
         console.error(`[firestoreService addFueling ${addFuelingStartTime}] Error adding fueling:`, error);
         throw error;
    }
};

export const updateFueling = async (fuelingId: string, data: Partial<Omit<FirestoreFueling, 'id' | 'createdAt'>>) => {
    const updateFuelingStartTime = performance.now();
    const dataToFirestore = { ...cleanDataForFirestore(data) };
    if (dataToFirestore.date && !(dataToFirestore.date instanceof Timestamp)) {
        dataToFirestore.date = Timestamp.fromDate(new Date(dataToFirestore.date as any));
    }
    const finalData = { ...dataToFirestore, updatedAt: serverTimestamp() };
    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => { if (finalData.hasOwnProperty(field) && (finalData[field] === null || finalData[field] === undefined)) delete finalData[field]; });
    console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Updating fueling ${fuelingId}. Data:`, finalData);
    if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService updateFueling ${updateFuelingStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or fuelingsCollectionRef not initialized.");
    }
    const fuelingDocRef = doc(fuelingsCollectionRef, fuelingId);
    try {
        await updateDoc(fuelingDocRef, finalData);
        console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Fueling ${fuelingId} updated.`);
    } catch (error) {
         console.error(`[firestoreService updateFueling ${updateFuelingStartTime}] Error updating fueling ${fuelingId}:`, error);
         throw error;
    }
};

export const deleteFueling = async (fuelingId: string) => {
    const deleteFuelingStartTime = performance.now();
    console.log(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Deleting fueling ${fuelingId}.`);
    if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or fuelingsCollectionRef not initialized.");
    }
    const fuelingDocRef = doc(fuelingsCollectionRef, fuelingId);
    try {
        const fuelingSnap = await getDoc(fuelingDocRef);
        if (fuelingSnap.exists()) {
            const fuelingData = fuelingSnap.data() as FirestoreFueling;
            if (fuelingData.receiptPath) {
                try { await deleteStorageReceipt(fuelingData.receiptPath); } catch (e) { console.error("Error deleting receipt from storage:", e); }
            }
        }
        await deleteDoc(fuelingDocRef);
        console.log(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Fueling ${fuelingId} deleted.`);
    } catch (error) {
         console.error(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Error deleting fueling ${fuelingId}:`, error);
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
        console.warn(`[addCustomTypeToFirestore ${addTypeStartTime}] Type "${typeName}" already exists with ID ${existingDoc.id}. Returning existing ID.`);
        // Optionally update updatedAt timestamp for existing type
        await updateDoc(doc(collectionRef, existingDoc.id), { updatedAt: serverTimestamp() });
        return existingDoc.id;
    }

    console.log(`[addCustomTypeToFirestore ${addTypeStartTime}] Adding new type "${typeName}" to ${collectionRef.id}.`);
    try {
        const docRef = await addDoc(collectionRef, {
            name: typeName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        console.log(`[addCustomTypeToFirestore ${addTypeStartTime}] Type "${typeName}" added with ID: ${docRef.id}.`);
        return docRef.id;
    } catch (error) {
        console.error(`[addCustomTypeToFirestore ${addTypeStartTime}] Error adding type "${typeName}":`, error);
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
        console.warn(`[getCustomTypesFromFirestore] Firestore not initialized. Returning empty array.`);
        return [];
    }
    console.log(`[getCustomTypesFromFirestore ${getTypesStartTime}] Fetching types from ${collectionRef.id}.`);
    try {
        const querySnapshot = await getDocs(query(collectionRef, orderBy("name")));
        const types = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            createdAt: doc.data().createdAt || Timestamp.now(), // Fallback
            updatedAt: doc.data().updatedAt || Timestamp.now()  // Fallback
        } as FirestoreCustomType));
        console.log(`[getCustomTypesFromFirestore ${getTypesStartTime}] Found ${types.length} types.`);
        return types;
    } catch (error) {
        console.error(`[getCustomTypesFromFirestore ${getTypesStartTime}] Error fetching types:`, error);
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
        throw new Error(`Firestore DB or collection reference not initialized.`);
    }
    console.log(`[deleteCustomTypeFromFirestore ${deleteTypeStartTime}] Deleting type ${firebaseId} from ${collectionRef.id}.`);
    try {
        await deleteDoc(doc(collectionRef, firebaseId));
        console.log(`[deleteCustomTypeFromFirestore ${deleteTypeStartTime}] Type ${firebaseId} deleted.`);
    } catch (error) {
        console.error(`[deleteCustomTypeFromFirestore ${deleteTypeStartTime}] Error deleting type ${firebaseId}:`, error);
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
        console.warn(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Firestore not initialized.`);
        throw new Error("Firestore DB or required collection references not initialized.");
    }
    const batch = writeBatch(db);
    const relatedReceiptPaths: string[] = [];

    try {
        batch.delete(doc(tripsCollectionRef, tripId));

        const visitsQuery = query(visitsCollectionRef, where('tripId', '==', tripId));
        const visitsSnapshot = await getDocs(visitsQuery);
        visitsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        const expensesQuery = query(expensesCollectionRef, where('tripId', '==', tripId));
        const expensesSnapshot = await getDocs(expensesQuery);
        expensesSnapshot.docs.forEach(expenseDoc => {
            batch.delete(expenseDoc.ref);
            const expenseData = expenseDoc.data() as FirestoreExpense;
            if (expenseData.receiptPath) relatedReceiptPaths.push(expenseData.receiptPath);
        });

        const fuelingsQuery = query(fuelingsCollectionRef, where('tripId', '==', tripId));
        const fuelingsSnapshot = await getDocs(fuelingsQuery);
         fuelingsSnapshot.docs.forEach(fuelingDoc => {
            batch.delete(fuelingDoc.ref);
            const fuelingData = fuelingDoc.data() as FirestoreFueling;
            if (fuelingData.receiptPath) relatedReceiptPaths.push(fuelingData.receiptPath);
        });

        await batch.commit();
        console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Firestore batch delete committed for trip ${tripId}.`);

        if (relatedReceiptPaths.length > 0) {
             const deleteStoragePromises = relatedReceiptPaths.map(path =>
                 deleteStorageReceipt(path).catch(e => console.error(`Failed to delete receipt ${path}:`, e))
             );
             await Promise.all(deleteStoragePromises);
        }
        console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Successfully deleted trip ${tripId} and related data.`);
    } catch (error) {
         console.error(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Error deleting trip ${tripId}:`, error);
         throw error;
    }
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
    const getUserByEmailStartTime = performance.now();
    console.log(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] Getting user by email: ${email}`);
    if (!db || !usersCollectionRef) {
        console.warn(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] Firestore not initialized.`);
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
            console.log(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] User found.`);
            return userData;
        }
        console.log(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] User not found.`);
        return null;
    } catch (error) {
        console.error(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] Error getting user by email:`, error);
        throw error;
    }
};

export const getVehicleByLicensePlate = async (licensePlate: string): Promise<FirestoreVehicle | null> => {
    const getVehicleByPlateStartTime = performance.now();
    console.log(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Getting vehicle by plate: ${licensePlate}`);
    if (!db || !vehiclesCollectionRef) {
        console.warn(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Firestore not initialized.`);
        return null;
    }
    const q = query(vehiclesCollectionRef, where('licensePlate', '==', licensePlate.toUpperCase()));
    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const vehicleDoc = querySnapshot.docs[0];
            const vehicleData = { id: vehicleDoc.id, ...vehicleDoc.data() } as FirestoreVehicle;
            console.log(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Vehicle found.`);
            return vehicleData;
        }
        console.log(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Vehicle not found.`);
        return null;
    } catch (error) {
        console.error(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Error getting vehicle by plate:`, error);
        throw error;
    }
};

    