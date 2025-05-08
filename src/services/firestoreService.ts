// src/services/firestoreService.ts
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  orderBy,
  writeBatch,
  QueryConstraint,
  setDoc, // Import setDoc
  QueryOrderByConstraint,
  QueryFilterConstraint
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { User, DriverInfo, UserRole } from '@/contexts/AuthContext'; // Import UserRole
import type { VehicleInfo } from '@/components/Vehicle';
import type { Trip } from '@/components/Trips/Trips';
import type { Visit } from '@/components/Trips/Visits';
import type { Expense } from '@/components/Trips/Expenses';
import type { Fueling as BaseFueling } from '@/components/Trips/Fuelings'; // Renamed to avoid conflict
import { deleteReceipt } from './storageService'; // Import deleteReceipt

// Define Fueling type specifically for Firestore, including fuelType
export interface Fueling extends BaseFueling {
    fuelType: string;
}

// --- Helper to convert Timestamps to ISO strings ---
const convertTimestampsToISO = (data: any) => {
  if (!data) return data;
  const newData = { ...data }; // Clone to avoid modifying original
  for (const key in newData) {
    if (newData[key] instanceof Timestamp) {
      newData[key] = newData[key].toDate().toISOString();
    } else if (typeof newData[key] === 'object' && newData[key] !== null && !Array.isArray(newData[key])) {
       // Recursively convert nested objects, but not arrays
      newData[key] = convertTimestampsToISO(newData[key]);
    }
  }
  return newData;
};

// --- Helper to convert specific ISO string fields back to Timestamps ---
const convertISOToTimestamps = (data: any, fields: string[]) => {
   if (!data) return data;
   const newData = { ...data }; // Clone
   fields.forEach(field => {
       if (newData[field] && typeof newData[field] === 'string') {
           try {
               newData[field] = Timestamp.fromDate(new Date(newData[field]));
           } catch (e) {
               console.error(`Error converting field ${field} to Timestamp:`, e);
               // Decide how to handle invalid date strings (e.g., keep as string, set to null)
           }
       }
   });
   return newData;
};


// --- User (Driver) Service ---
const usersCollectionRef = db ? collection(db, 'users') : null;

// Potential Index: users collection - index on 'role'
export const getUserData = async (userId: string): Promise<User | null> => {
  const getUserStartTime = performance.now();
  console.log(`[firestoreService getUserData ${getUserStartTime}] Getting user data for ID: ${userId}`);
  try {
    // Ensure DB is initialized
    if (!db) {
        console.error(`[firestoreService getUserData ${getUserStartTime}] Firestore DB not initialized.`);
        return null;
    }
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);
    const getUserEndTime = performance.now();
    if (userDocSnap.exists()) {
      const userData = convertTimestampsToISO({ id: userDocSnap.id, ...userDocSnap.data() }) as User;
       // Ensure role is present, default to 'driver' if missing
      if (!userData.role) {
           console.warn(`[firestoreService getUserData ${getUserStartTime}] User ${userId} missing role, defaulting to 'driver'.`);
           userData.role = 'driver';
      }
      // Ensure base is 'ALL' if role is 'admin'
      if (userData.role === 'admin' && userData.base !== 'ALL') {
        console.warn(`[firestoreService getUserData ${getUserStartTime}] Admin user ${userId} has base ${userData.base}, correcting to 'ALL'.`);
        userData.base = 'ALL';
      }
      console.log(`[firestoreService getUserData ${getUserStartTime}] User data found. Time: ${getUserEndTime - getUserStartTime} ms`);
      return userData;
    } else {
      console.log(`[firestoreService getUserData ${getUserStartTime}] No such user document! Time: ${getUserEndTime - getUserStartTime} ms`);
      return null;
    }
  } catch (error) {
    const getUserEndTime = performance.now();
    console.error(`[firestoreService getUserData ${getUserStartTime}] Error getting user document. Time: ${getUserEndTime - getUserStartTime} ms`, error);
    if ((error as any).code === 'unavailable') {
        console.warn('Firestore is offline. Cannot fetch user data.');
    }
    return null;
  }
};

export const setUserData = async (userId: string, data: Partial<Omit<User, 'id'>>) => {
    const setUserStartTime = performance.now();
    console.log(`[firestoreService setUserData ${setUserStartTime}] Setting/merging user data for ID: ${userId}`, data);
    try {
       if (!db) throw new Error("Firestore DB not initialized.");
      const userDocRef = doc(db, 'users', userId);
      // Ensure base is 'ALL' if role is admin
      const dataToSet = { ...data };
      if (dataToSet.role === 'admin') {
        dataToSet.base = 'ALL';
      }
      await setDoc(userDocRef, dataToSet, { merge: true });
      const setUserEndTime = performance.now();
      console.log(`[firestoreService setUserData ${setUserStartTime}] User data set/merged successfully. Time: ${setUserEndTime - setUserStartTime} ms`);
    } catch (error) {
        const setUserEndTime = performance.now();
        console.error(`[firestoreService setUserData ${setUserStartTime}] Error setting/merging user document. Time: ${setUserEndTime - setUserStartTime} ms`, error);
        throw error;
    }
};

// Use setDoc to ensure the document ID matches the Auth UID
export const addUser = async (userId: string, userData: Omit<User, 'id'>): Promise<void> => {
    const addUserStartTime = performance.now();
    console.log(`[firestoreService addUser ${addUserStartTime}] Adding user document for ID: ${userId}`, userData);
    try {
        if (!db) throw new Error("Firestore DB not initialized.");
        const userDocRef = doc(db, 'users', userId);
        // Ensure role is present and base matches role
        const finalUserData = {
             ...userData,
             role: userData.role || 'driver',
             base: userData.role === 'admin' ? 'ALL' : (userData.base || '')
         };
        await setDoc(userDocRef, finalUserData);
        const addUserEndTime = performance.now();
        console.log(`[firestoreService addUser ${addUserStartTime}] User document created successfully. Time: ${addUserEndTime - addUserStartTime} ms`);
    } catch (error) {
        const addUserEndTime = performance.now();
        console.error(`[firestoreService addUser ${addUserStartTime}] Error adding user document. Time: ${addUserEndTime - addUserStartTime} ms`, error);
        throw error;
    }
};


export const updateUser = async (userId: string, data: Partial<DriverInfo>) => {
    const updateUserStartTime = performance.now();
    console.log(`[firestoreService updateUser ${updateUserStartTime}] Updating user document for ID: ${userId}`, data);
    if (!db) throw new Error("Firestore DB not initialized.");
    const userDocRef = doc(db, 'users', userId);
    // Remove password if accidentally included, ensure base matches role
    const { password, role, base, ...restData } = data;
    const dataToUpdate: Partial<User> = { ...restData };

    if (role) {
       dataToUpdate.role = role;
       dataToUpdate.base = role === 'admin' ? 'ALL' : (base || '');
    } else if (base !== undefined) {
       // Fetch current role to ensure base is consistent if role isn't changing
       const currentUserData = await getUserData(userId);
       if (currentUserData?.role !== 'admin') {
           dataToUpdate.base = base;
       } else {
            console.warn(`[firestoreService updateUser] Attempted to change base for admin user ${userId}. Base remains 'ALL'.`);
            dataToUpdate.base = 'ALL'; // Ensure admin base stays 'ALL'
       }
    }


    try {
        await updateDoc(userDocRef, dataToUpdate);
        const updateUserEndTime = performance.now();
        console.log(`[firestoreService updateUser ${updateUserStartTime}] User updated successfully. Time: ${updateUserEndTime - updateUserStartTime} ms`);
    } catch (error) {
        const updateUserEndTime = performance.now();
        console.error(`[firestoreService updateUser ${updateUserStartTime}] Error updating user. Time: ${updateUserEndTime - updateUserStartTime} ms`, error);
        throw error;
    }
};

export const deleteUser = async (userId: string) => {
    const deleteUserStartTime = performance.now();
    console.log(`[firestoreService deleteUser ${deleteUserStartTime}] Deleting user document for ID: ${userId}`);
    if (!db) throw new Error("Firestore DB not initialized.");
    const userDocRef = doc(db, 'users', userId);
    try {
        await deleteDoc(userDocRef);
        const deleteUserEndTime = performance.now();
        console.log(`[firestoreService deleteUser ${deleteUserStartTime}] User document deleted successfully. Time: ${deleteUserEndTime - deleteUserStartTime} ms`);
    } catch (error) {
        const deleteUserEndTime = performance.now();
        console.error(`[firestoreService deleteUser ${deleteUserStartTime}] Error deleting user document. Time: ${deleteUserEndTime - deleteUserStartTime} ms`, error);
        throw error;
    }
};

export const getDrivers = async (): Promise<DriverInfo[]> => {
    const getDriversStartTime = performance.now();
    console.log(`[firestoreService getDrivers ${getDriversStartTime}] Fetching drivers...`);
    if (!usersCollectionRef) {
      console.error(`[firestoreService getDrivers ${getDriversStartTime}] Users collection ref not initialized.`);
      return [];
    }
    try {
        const q = query(usersCollectionRef, where('role', '==', 'driver'));
        const querySnapshot = await getDocs(q);
        const drivers = querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as DriverInfo);
        const getDriversEndTime = performance.now();
        console.log(`[firestoreService getDrivers ${getDriversStartTime}] Found ${drivers.length} drivers. Time: ${getDriversEndTime - getDriversStartTime} ms`);
        return drivers;
    } catch (error) {
         const getDriversEndTime = performance.now();
         console.error(`[firestoreService getDrivers ${getDriversStartTime}] Error fetching drivers. Time: ${getDriversEndTime - getDriversStartTime} ms`, error);
          if ((error as any).code === 'unavailable') {
              console.warn('Firestore is offline. Cannot fetch drivers.');
          }
         return [];
    }
};

// --- Vehicle Service ---
const vehiclesCollectionRef = db ? collection(db, 'vehicles') : null; // Handle potential null db

export const getVehicles = async (): Promise<VehicleInfo[]> => {
    const getVehiclesStartTime = performance.now();
    console.log(`[firestoreService getVehicles ${getVehiclesStartTime}] Fetching vehicles...`);
    if (!vehiclesCollectionRef) {
         console.error(`[firestoreService getVehicles ${getVehiclesStartTime}] Vehicles collection ref not initialized.`);
         return [];
    }
    try {
        const querySnapshot = await getDocs(vehiclesCollectionRef);
        const vehicles = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as VehicleInfo);
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

export const addVehicle = async (vehicleData: Omit<VehicleInfo, 'id'>): Promise<string> => {
    const addVehicleStartTime = performance.now();
    console.log(`[firestoreService addVehicle ${addVehicleStartTime}] Adding new vehicle`, vehicleData);
    if (!vehiclesCollectionRef) throw new Error("Vehicles collection ref not initialized.");
    try {
        const docRef = await addDoc(vehiclesCollectionRef, vehicleData);
        const addVehicleEndTime = performance.now();
        console.log(`[firestoreService addVehicle ${addVehicleStartTime}] Vehicle added successfully with ID: ${docRef.id}. Time: ${addVehicleEndTime - addVehicleStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addVehicleEndTime = performance.now();
         console.error(`[firestoreService addVehicle ${addVehicleStartTime}] Error adding vehicle. Time: ${addVehicleEndTime - addVehicleStartTime} ms`, error);
         throw error;
    }
};

export const updateVehicle = async (vehicleId: string, data: Partial<VehicleInfo>) => {
    const updateVehicleStartTime = performance.now();
    console.log(`[firestoreService updateVehicle ${updateVehicleStartTime}] Updating vehicle ID: ${vehicleId}`, data);
    if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const vehicleDocRef = doc(db, 'vehicles', vehicleId);
        await updateDoc(vehicleDocRef, data);
        const updateVehicleEndTime = performance.now();
        console.log(`[firestoreService updateVehicle ${updateVehicleStartTime}] Vehicle updated successfully. Time: ${updateVehicleEndTime - updateVehicleStartTime} ms`);
    } catch (error) {
         const updateVehicleEndTime = performance.now();
         console.error(`[firestoreService updateVehicle ${updateVehicleStartTime}] Error updating vehicle. Time: ${updateVehicleEndTime - updateVehicleStartTime} ms`, error);
         throw error;
    }
};

export const deleteVehicle = async (vehicleId: string) => {
    const deleteVehicleStartTime = performance.now();
    console.log(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Deleting vehicle ID: ${vehicleId}`);
     if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const vehicleDocRef = doc(db, 'vehicles', vehicleId);
        await deleteDoc(vehicleDocRef);
        const deleteVehicleEndTime = performance.now();
        console.log(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Vehicle deleted successfully. Time: ${deleteVehicleEndTime - deleteVehicleStartTime} ms`);
    } catch (error) {
         const deleteVehicleEndTime = performance.now();
         console.error(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Error deleting vehicle. Time: ${deleteVehicleEndTime - deleteVehicleStartTime} ms`, error);
         throw error;
    }
};

// --- Trip Service ---
const tripsCollectionRef = db ? collection(db, 'trips') : null; // Handle potential null db

export interface TripFilter {
    userId?: string;
    startDate?: string; // ISO String
    endDate?: string; // ISO String
}

export const getTrips = async (filters: TripFilter = {}): Promise<Trip[]> => {
    const getTripsStartTime = performance.now();
    console.log(`[firestoreService getTrips ${getTripsStartTime}] Fetching trips with filters:`, filters);
     if (!tripsCollectionRef) {
        console.error(`[firestoreService getTrips ${getTripsStartTime}] Trips collection ref not initialized.`);
        return [];
     }
    try {
        const constraints: QueryConstraint[] = [];
        if (filters.userId) {
            constraints.push(where('userId', '==', filters.userId));
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
        if (filters.startDate || filters.endDate) {
             // Cannot reliably sort by status AND createdAt when using date range inequality
        } else {
             constraints.push(orderBy('createdAt', 'desc'));
        }

        const q = query(tripsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        let trips = querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Trip);

        if (filters.startDate || filters.endDate) {
            trips.sort((a, b) => {
                if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
         }

        const getTripsEndTime = performance.now();
        console.log(`[firestoreService getTrips ${getTripsStartTime}] Found ${trips.length} trips. Time: ${getTripsEndTime - getTripsStartTime} ms`);
        return trips;

    } catch (error) {
         const getTripsEndTime = performance.now();
        console.error(`[firestoreService getTrips ${getTripsStartTime}] Error fetching trips. Time: ${getTripsEndTime - getTripsStartTime} ms`, error);
        if ((error as any).code === 'failed-precondition' && error instanceof Error && error.message.includes('index')) {
             console.error("Firestore index missing. Please check the recommended indexes in the getTrips function comments and create them in your Firebase console.");
        } else if ((error as any).code === 'unavailable') {
            console.warn('Firestore is offline. Cannot fetch trips.');
        }
        return [];
    }
};


export const addTrip = async (tripData: Omit<Trip, 'id' | 'updatedAt' | 'createdAt' | 'firebaseId' | 'localId' | 'syncStatus'>): Promise<string> => {
    const addTripStartTime = performance.now();
    console.log(`[firestoreService addTrip ${addTripStartTime}] Adding new trip`, tripData);
    if (!tripsCollectionRef) throw new Error("Trips collection ref not initialized.");
    try {
        const finalData = {
            ...tripData, // Spread the provided data
             createdAt: Timestamp.now(),
             updatedAt: Timestamp.now(),
         };

        const docRef = await addDoc(tripsCollectionRef, finalData);
        const addTripEndTime = performance.now();
        console.log(`[firestoreService addTrip ${addTripStartTime}] Trip added successfully with ID: ${docRef.id}. Time: ${addTripEndTime - addTripStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addTripEndTime = performance.now();
         console.error(`[firestoreService addTrip ${addTripStartTime}] Error adding trip. Time: ${addTripEndTime - addTripStartTime} ms`, error);
         throw error;
    }
};

export const updateTrip = async (tripId: string, data: Partial<Omit<Trip, 'id' | 'createdAt' | 'firebaseId' | 'localId' | 'syncStatus'>>) => {
    const updateTripStartTime = performance.now();
    console.log(`[firestoreService updateTrip ${updateTripStartTime}] Updating trip ID: ${tripId}`, data);
    if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const tripDocRef = doc(db, 'trips', tripId);
        const dataToUpdate = {
            ...data,
            updatedAt: Timestamp.now(),
        };
        await updateDoc(tripDocRef, dataToUpdate);
        const updateTripEndTime = performance.now();
        console.log(`[firestoreService updateTrip ${updateTripStartTime}] Trip updated successfully. Time: ${updateTripEndTime - updateTripStartTime} ms`);
    } catch (error) {
         const updateTripEndTime = performance.now();
         console.error(`[firestoreService updateTrip ${updateTripStartTime}] Error updating trip. Time: ${updateTripEndTime - updateTripStartTime} ms`, error);
         throw error;
    }
};

// --- Visit Service ---
const visitsCollectionRef = db ? collection(db, 'visits') : null; // Handle potential null db

export const getVisits = async (tripId: string): Promise<Visit[]> => {
    const getVisitsStartTime = performance.now();
    console.log(`[firestoreService getVisits ${getVisitsStartTime}] Fetching visits for trip ID: ${tripId}`);
     if (!visitsCollectionRef) {
         console.error(`[firestoreService getVisits ${getVisitsStartTime}] Visits collection ref not initialized.`);
         return [];
     }
    try {
        const q = query(visitsCollectionRef, where('tripId', '==', tripId), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        const visits = querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Visit);
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

export const addVisit = async (visitData: Omit<Visit, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>): Promise<string> => {
    const addVisitStartTime = performance.now();
    console.log(`[firestoreService addVisit ${addVisitStartTime}] Adding new visit`, visitData);
    if (!visitsCollectionRef) throw new Error("Visits collection ref not initialized.");
    try {
        const dataWithTimestamp = convertISOToTimestamps(visitData, ['timestamp']);
        const docRef = await addDoc(visitsCollectionRef, dataWithTimestamp);
        const addVisitEndTime = performance.now();
        console.log(`[firestoreService addVisit ${addVisitStartTime}] Visit added successfully with ID: ${docRef.id}. Time: ${addVisitEndTime - addVisitStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addVisitEndTime = performance.now();
         console.error(`[firestoreService addVisit ${addVisitStartTime}] Error adding visit. Time: ${addVisitEndTime - addVisitStartTime} ms`, error);
         throw error;
    }
};

export const updateVisit = async (visitId: string, data: Partial<Omit<Visit, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>>) => {
    const updateVisitStartTime = performance.now();
    console.log(`[firestoreService updateVisit ${updateVisitStartTime}] Updating visit ID: ${visitId}`, data);
     if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const visitDocRef = doc(db, 'visits', visitId);
        const dataWithTimestamp = convertISOToTimestamps(data, ['timestamp']);
        await updateDoc(visitDocRef, dataWithTimestamp);
        const updateVisitEndTime = performance.now();
        console.log(`[firestoreService updateVisit ${updateVisitStartTime}] Visit updated successfully. Time: ${updateVisitEndTime - updateVisitStartTime} ms`);
    } catch (error) {
         const updateVisitEndTime = performance.now();
         console.error(`[firestoreService updateVisit ${updateVisitStartTime}] Error updating visit. Time: ${updateVisitEndTime - updateVisitStartTime} ms`, error);
         throw error;
    }
};

export const deleteVisit = async (visitId: string) => {
    const deleteVisitStartTime = performance.now();
    console.log(`[firestoreService deleteVisit ${deleteVisitStartTime}] Deleting visit ID: ${visitId}`);
     if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const visitDocRef = doc(db, 'visits', visitId);
        await deleteDoc(visitDocRef);
        const deleteVisitEndTime = performance.now();
        console.log(`[firestoreService deleteVisit ${deleteVisitStartTime}] Visit deleted successfully. Time: ${deleteVisitEndTime - deleteVisitStartTime} ms`);
    } catch (error) {
         const deleteVisitEndTime = performance.now();
         console.error(`[firestoreService deleteVisit ${deleteVisitStartTime}] Error deleting visit. Time: ${deleteVisitEndTime - deleteVisitStartTime} ms`, error);
         throw error;
    }
};

// --- Expense Service ---
const expensesCollectionRef = db ? collection(db, 'expenses') : null; // Handle potential null db

export const getExpenses = async (tripId: string): Promise<Expense[]> => {
    const getExpensesStartTime = performance.now();
    console.log(`[firestoreService getExpenses ${getExpensesStartTime}] Fetching expenses for trip ID: ${tripId}`);
     if (!expensesCollectionRef) {
          console.error(`[firestoreService getExpenses ${getExpensesStartTime}] Expenses collection ref not initialized.`);
          return [];
     }
    try {
        const q = query(expensesCollectionRef, where('tripId', '==', tripId), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        const expenses = querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Expense);
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

export const addExpense = async (expenseData: Omit<Expense, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>): Promise<string> => {
    const addExpenseStartTime = performance.now();
    console.log(`[firestoreService addExpense ${addExpenseStartTime}] Adding new expense`, expenseData);
    if (!expensesCollectionRef) throw new Error("Expenses collection ref not initialized.");
    try {
        const dataWithTimestamps = convertISOToTimestamps(expenseData, ['expenseDate', 'timestamp']);
        const docRef = await addDoc(expensesCollectionRef, dataWithTimestamps);
        const addExpenseEndTime = performance.now();
        console.log(`[firestoreService addExpense ${addExpenseStartTime}] Expense added successfully with ID: ${docRef.id}. Time: ${addExpenseEndTime - addExpenseStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addExpenseEndTime = performance.now();
         console.error(`[firestoreService addExpense ${addExpenseStartTime}] Error adding expense. Time: ${addExpenseEndTime - addExpenseStartTime} ms`, error);
         throw error;
    }
};

export const updateExpense = async (expenseId: string, data: Partial<Omit<Expense, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>>) => {
    const updateExpenseStartTime = performance.now();
    console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Updating expense ID: ${expenseId}`, data);
     if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const expenseDocRef = doc(db, 'expenses', expenseId);
        const dataWithTimestamps = convertISOToTimestamps(data, ['expenseDate', 'timestamp']);
        await updateDoc(expenseDocRef, dataWithTimestamps);
        const updateExpenseEndTime = performance.now();
        console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Expense updated successfully. Time: ${updateExpenseEndTime - updateExpenseStartTime} ms`);
    } catch (error) {
         const updateExpenseEndTime = performance.now();
         console.error(`[firestoreService updateExpense ${updateExpenseStartTime}] Error updating expense. Time: ${updateExpenseEndTime - updateExpenseStartTime} ms`, error);
         throw error;
    }
};

export const deleteExpense = async (expenseId: string) => {
    const deleteExpenseStartTime = performance.now();
    console.log(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Deleting expense ID: ${expenseId}`);
     if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const expenseDocRef = doc(db, 'expenses', expenseId);
        await deleteDoc(expenseDocRef);
        const deleteExpenseEndTime = performance.now();
        console.log(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Expense deleted successfully. Time: ${deleteExpenseEndTime - deleteExpenseStartTime} ms`);
    } catch (error) {
         const deleteExpenseEndTime = performance.now();
         console.error(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Error deleting expense. Time: ${deleteExpenseEndTime - deleteExpenseStartTime} ms`, error);
         throw error;
    }
};

// --- Fueling Service ---
const fuelingsCollectionRef = db ? collection(db, 'fuelings') : null;

export const getFuelings = async (tripId?: string): Promise<Fueling[]> => {
    const getFuelingsStartTime = performance.now();
    console.log(`[firestoreService getFuelings ${getFuelingsStartTime}] Fetching fuelings for trip ID: ${tripId || 'all'}`);
    if (!fuelingsCollectionRef) {
        console.error(`[firestoreService getFuelings ${getFuelingsStartTime}] Fuelings collection ref not initialized.`);
        return [];
    }
    try {
        const constraints: QueryConstraint[] = [];
        if (tripId) {
            constraints.push(where('tripId', '==', tripId));
        }
        constraints.push(orderBy('date', 'desc'));

        const q = query(fuelingsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const fuelings = querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Fueling);
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

export const addFueling = async (fuelingData: Omit<Fueling, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>): Promise<string> => {
    const addFuelingStartTime = performance.now();
    console.log(`[firestoreService addFueling ${addFuelingStartTime}] Adding new fueling`, fuelingData);
    if (!fuelingsCollectionRef) throw new Error("Fuelings collection ref not initialized.");
    try {
        const dataWithTimestamp = convertISOToTimestamps(fuelingData, ['date']);
        const docRef = await addDoc(fuelingsCollectionRef, dataWithTimestamp);
        const addFuelingEndTime = performance.now();
        console.log(`[firestoreService addFueling ${addFuelingStartTime}] Fueling added successfully with ID: ${docRef.id}. Time: ${addFuelingEndTime - addFuelingStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addFuelingEndTime = performance.now();
         console.error(`[firestoreService addFueling ${addFuelingStartTime}] Error adding fueling. Time: ${addFuelingEndTime - addFuelingStartTime} ms`, error);
         throw error;
    }
};

export const updateFueling = async (fuelingId: string, data: Partial<Omit<Fueling, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>>) => {
    const updateFuelingStartTime = performance.now();
    console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Updating fueling ID: ${fuelingId}`, data);
    if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const fuelingDocRef = doc(db, 'fuelings', fuelingId);
        const dataWithTimestamp = convertISOToTimestamps(data, ['date']);
        await updateDoc(fuelingDocRef, dataWithTimestamp);
        const updateFuelingEndTime = performance.now();
        console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Fueling updated successfully. Time: ${updateFuelingEndTime - updateFuelingStartTime} ms`);
    } catch (error) {
         const updateFuelingEndTime = performance.now();
         console.error(`[firestoreService updateFueling ${updateFuelingStartTime}] Error updating fueling. Time: ${updateFuelingEndTime - updateFuelingStartTime} ms`, error);
         throw error;
    }
};

export const deleteFueling = async (fuelingId: string) => {
    const deleteFuelingStartTime = performance.now();
    console.log(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Deleting fueling ID: ${fuelingId}`);
     if (!db) throw new Error("Firestore DB not initialized.");
    try {
        const fuelingDocRef = doc(db, 'fuelings', fuelingId);
        await deleteDoc(fuelingDocRef);
        const deleteFuelingEndTime = performance.now();
        console.log(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Fueling deleted successfully. Time: ${deleteFuelingEndTime - deleteFuelingStartTime} ms`);
    } catch (error) {
         const deleteFuelingEndTime = performance.now();
         console.error(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Error deleting fueling. Time: ${deleteFuelingEndTime - deleteFuelingStartTime} ms`, error);
         throw error;
    }
};

// --- Batch Delete for Trip Deletion ---
export const deleteTripAndRelatedData = async (tripId: string) => {
    const deleteBatchStartTime = performance.now();
    console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Starting batch delete for trip ID: ${tripId}`);
    if (!db) throw new Error("Firestore DB not initialized.");
    const batch = writeBatch(db);
    let relatedReceiptPaths: string[] = [];

    try {
        // 1. Delete Trip
        const tripDocRef = doc(db, 'trips', tripId);
        batch.delete(tripDocRef);

        // 2. Delete Visits
        const visitsQuery = query(collection(db, 'visits'), where('tripId', '==', tripId));
        const visitsSnapshot = await getDocs(visitsQuery);
        console.log(`[deleteTripAndRelatedData] Found ${visitsSnapshot.docs.length} visits to delete.`);
        visitsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        // 3. Delete Expenses & Collect Paths
        const expensesQuery = query(collection(db, 'expenses'), where('tripId', '==', tripId));
        const expensesSnapshot = await getDocs(expensesQuery);
        console.log(`[deleteTripAndRelatedData] Found ${expensesSnapshot.docs.length} expenses to delete.`);
        expensesSnapshot.docs.forEach(expenseDoc => {
            batch.delete(expenseDoc.ref);
            const expenseData = expenseDoc.data() as Expense;
            if (expenseData.receiptPath) relatedReceiptPaths.push(expenseData.receiptPath);
        });

        // 4. Delete Fuelings & Collect Paths
        const fuelingsQuery = query(collection(db, 'fuelings'), where('tripId', '==', tripId));
        const fuelingsSnapshot = await getDocs(fuelingsQuery);
         console.log(`[deleteTripAndRelatedData] Found ${fuelingsSnapshot.docs.length} fuelings to delete.`);
         fuelingsSnapshot.docs.forEach(fuelingDoc => {
            batch.delete(fuelingDoc.ref);
            const fuelingData = fuelingDoc.data() as Fueling;
            if (fuelingData.receiptPath) relatedReceiptPaths.push(fuelingData.receiptPath);
        });

        // Commit Firestore batch
        await batch.commit();
        console.log(`[firestoreService deleteTripAndRelatedData] Firestore batch delete committed for trip ${tripId}.`);

        // 5. Delete Storage files
        if (relatedReceiptPaths.length > 0) {
            console.log(`[deleteTripAndRelatedData] Deleting ${relatedReceiptPaths.length} related receipts from storage...`);
            const deleteStoragePromises = relatedReceiptPaths.map(path =>
                 deleteReceipt(path).catch(e => console.error(`Failed to delete receipt ${path}:`, e))
             );
             await Promise.all(deleteStoragePromises);
             console.log(`[deleteTripAndRelatedData] Finished attempting receipt deletions.`);
        }

        const deleteBatchEndTime = performance.now();
        console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Successfully deleted trip ${tripId} and related data. Time: ${deleteBatchEndTime - deleteBatchStartTime} ms`);

    } catch (error) {
         const deleteBatchEndTime = performance.now();
         console.error(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Error deleting trip ${tripId} and related data. Time: ${deleteBatchEndTime - deleteBatchStartTime} ms`, error);
         throw error;
    }
};

