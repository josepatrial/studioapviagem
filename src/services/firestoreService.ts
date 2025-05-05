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
import type { User, DriverInfo } from '@/contexts/AuthContext';
import type { VehicleInfo } from '@/components/Vehicle';
import type { Trip } from '@/components/Trips/Trips';
import type { Visit } from '@/components/Trips/Visits';
import type { Expense } from '@/components/Trips/Expenses';
import type { Fueling } from '@/components/Trips/Fuelings';
import { deleteReceipt } from './storageService'; // Import deleteReceipt

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
const usersCollectionRef = collection(db, 'users');

// Potential Index: users collection - index on 'role'
export const getUserData = async (userId: string): Promise<User | null> => {
  const getUserStartTime = performance.now();
  console.log(`[firestoreService getUserData ${getUserStartTime}] Getting user data for ID: ${userId}`);
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);
    const getUserEndTime = performance.now();
    if (userDocSnap.exists()) {
      const userData = convertTimestampsToISO({ id: userDocSnap.id, ...userDocSnap.data() }) as User;
      console.log(`[firestoreService getUserData ${getUserStartTime}] User data found. Time: ${getUserEndTime - getUserStartTime} ms`);
      return userData;
    } else {
      console.log(`[firestoreService getUserData ${getUserStartTime}] No such user document! Time: ${getUserEndTime - getUserStartTime} ms`);
      return null;
    }
  } catch (error) {
    const getUserEndTime = performance.now();
    console.error(`[firestoreService getUserData ${getUserStartTime}] Error getting user document. Time: ${getUserEndTime - getUserStartTime} ms`, error);
    // Check if offline error
    if ((error as any).code === 'unavailable') {
        console.warn('Firestore is offline. Cannot fetch user data.');
        // Return null or potentially try to get from local cache if implemented
    }
    return null; // Return null on error
  }
};

export const setUserData = async (userId: string, data: Partial<Omit<User, 'id'>>) => {
    const setUserStartTime = performance.now();
    console.log(`[firestoreService setUserData ${setUserStartTime}] Setting/merging user data for ID: ${userId}`, data);
    try {
      const userDocRef = doc(db, 'users', userId);
      // No timestamp conversion needed for user data currently
      await setDoc(userDocRef, data, { merge: true }); // Use setDoc with merge: true
      const setUserEndTime = performance.now();
      console.log(`[firestoreService setUserData ${setUserStartTime}] User data set/merged successfully. Time: ${setUserEndTime - setUserStartTime} ms`);
    } catch (error) {
        const setUserEndTime = performance.now();
        console.error(`[firestoreService setUserData ${setUserStartTime}] Error setting/merging user document. Time: ${setUserEndTime - setUserStartTime} ms`, error);
        throw error;
    }
};

// Use setDoc to ensure the document ID matches the Auth UID
export const addUser = async (userId: string, userData: Omit<DriverInfo, 'id' | 'password'>): Promise<void> => {
    const addUserStartTime = performance.now();
    console.log(`[firestoreService addUser ${addUserStartTime}] Adding user document for ID: ${userId}`);
    try {
      const userDocRef = doc(db, 'users', userId);
      const finalUserData = { ...userData, role: 'driver' }; // Ensure role is set
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
    const userDocRef = doc(db, 'users', userId);
    // Remove password if accidentally included
    const { password, ...dataToUpdate } = data;
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
    try {
         // Potential Index: users collection - index on 'role'
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
const vehiclesCollectionRef = collection(db, 'vehicles');

// No specific index needed for just fetching all vehicles, but could index fields used for filtering later.
export const getVehicles = async (): Promise<VehicleInfo[]> => {
    const getVehiclesStartTime = performance.now();
    console.log(`[firestoreService getVehicles ${getVehiclesStartTime}] Fetching vehicles...`);
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
const tripsCollectionRef = collection(db, 'trips');

// Define a filter type for trips
export interface TripFilter {
    userId?: string;
    startDate?: string; // ISO String
    endDate?: string; // ISO String
    // Add other potential filters like status, vehicleId etc.
}

// Potential Composite Indexes for trips collection (Create these in Firebase Console):
// 1. (userId ==, status ASC, createdAt DESC) - For filtering by user and sorting
// 2. (status ASC, createdAt DESC) - For sorting all trips
// 3. (userId ==, createdAt >=, status ASC, createdAt DESC) - For filtering by user + date range
// 4. (createdAt >=, status ASC, createdAt DESC) - For filtering by date range
export const getTrips = async (filters: TripFilter = {}): Promise<Trip[]> => {
    const getTripsStartTime = performance.now();
    console.log(`[firestoreService getTrips ${getTripsStartTime}] Fetching trips with filters:`, filters);
    try {
        const constraints: QueryConstraint[] = [];

        // Apply filters
        if (filters.userId) {
            constraints.push(where('userId', '==', filters.userId));
        }
        if (filters.startDate) {
            constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(filters.startDate))));
        }
        if (filters.endDate) {
             // Add 1 day to endDate to make it inclusive of the end date
             const endDatePlusOne = new Date(filters.endDate);
             endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
             constraints.push(where('createdAt', '<', Timestamp.fromDate(endDatePlusOne)));
        }
        // Add other filters based on `filters` object

        // Default ordering (applied after filters)
        constraints.push(orderBy('status', 'asc')); // 'Andamento' first
        // Firestore requires the first orderBy field to match the inequality field if present
        if (filters.startDate || filters.endDate) {
             // If filtering by date, createdAt order must match inequality direction or be the inequality field
             // constraints.push(orderBy('createdAt', 'desc')); // Requires index like (userId ==, createdAt DESC, status ASC) - might conflict
             // So, we rely on sorting after fetching if combining date filters and status sort
        } else {
             // If no date filter, we can order by createdAt after status
             constraints.push(orderBy('createdAt', 'desc')); // Requires index like (userId ==, status ASC, createdAt DESC) or (status ASC, createdAt DESC)
        }


        const q = query(tripsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        let trips = querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Trip);

        // Manual sort if date range filter was applied with status sort
         if (filters.startDate || filters.endDate) {
            trips.sort((a, b) => {
                // Sort by status first ('Andamento' comes first)
                if (a.status === 'Andamento' && b.status !== 'Andamento') return -1;
                if (a.status !== 'Andamento' && b.status === 'Andamento') return 1;
                // Then sort by creation date descending
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
             // Consider providing a more user-friendly error or fallback behavior
        } else if ((error as any).code === 'unavailable') {
            console.warn('Firestore is offline. Cannot fetch trips.');
        }
        return [];
    }
};


// Data should not contain id or updatedAt
export const addTrip = async (tripData: Omit<Trip, 'id' | 'updatedAt' | 'createdAt'>): Promise<string> => {
    const addTripStartTime = performance.now();
    console.log(`[firestoreService addTrip ${addTripStartTime}] Adding new trip`, tripData);
    try {
        // Ensure createdAt and updatedAt are Timestamps
        const dataWithTimestamps = convertISOToTimestamps(tripData, ['createdAt']); // Convert only if needed
         const finalData = {
            ...dataWithTimestamps,
             createdAt: Timestamp.now(), // Always set server-side timestamp on creation
             updatedAt: Timestamp.now(), // Always set server-side timestamp on creation
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

export const updateTrip = async (tripId: string, data: Partial<Omit<Trip, 'id' | 'createdAt'>>) => {
    const updateTripStartTime = performance.now();
    console.log(`[firestoreService updateTrip ${updateTripStartTime}] Updating trip ID: ${tripId}`, data);
    try {
        const tripDocRef = doc(db, 'trips', tripId);
        // Convert relevant date fields if they are passed as ISO strings
        const dataWithPotentialTimestamps = convertISOToTimestamps(data, ['updatedAt']); // Add other relevant fields if needed

        const dataToUpdate = {
            ...dataWithPotentialTimestamps,
            updatedAt: Timestamp.now(), // Always update 'updatedAt' with server timestamp
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
const visitsCollectionRef = collection(db, 'visits');

// Potential Index: visits collection - (tripId ==, timestamp DESC)
export const getVisits = async (tripId: string): Promise<Visit[]> => {
    const getVisitsStartTime = performance.now();
    console.log(`[firestoreService getVisits ${getVisitsStartTime}] Fetching visits for trip ID: ${tripId}`);
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

export const addVisit = async (visitData: Omit<Visit, 'id'>): Promise<string> => {
    const addVisitStartTime = performance.now();
    console.log(`[firestoreService addVisit ${addVisitStartTime}] Adding new visit`, visitData);
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

export const updateVisit = async (visitId: string, data: Partial<Omit<Visit, 'id'>>) => {
    const updateVisitStartTime = performance.now();
    console.log(`[firestoreService updateVisit ${updateVisitStartTime}] Updating visit ID: ${visitId}`, data);
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
const expensesCollectionRef = collection(db, 'expenses');

// Potential Index: expenses collection - (tripId ==, timestamp DESC)
export const getExpenses = async (tripId: string): Promise<Expense[]> => {
    const getExpensesStartTime = performance.now();
    console.log(`[firestoreService getExpenses ${getExpensesStartTime}] Fetching expenses for trip ID: ${tripId}`);
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

export const addExpense = async (expenseData: Omit<Expense, 'id'>): Promise<string> => {
    const addExpenseStartTime = performance.now();
    console.log(`[firestoreService addExpense ${addExpenseStartTime}] Adding new expense`, expenseData);
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

export const updateExpense = async (expenseId: string, data: Partial<Omit<Expense, 'id'>>) => {
    const updateExpenseStartTime = performance.now();
    console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Updating expense ID: ${expenseId}`, data);
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
    try {
        const expenseDocRef = doc(db, 'expenses', expenseId);
        // Consider deleting associated receipt from storage here if needed, or handle during batch delete
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
const fuelingsCollectionRef = collection(db, 'fuelings');

// Potential Index: fuelings collection - (tripId ==, date DESC)
export const getFuelings = async (tripId: string): Promise<Fueling[]> => {
    const getFuelingsStartTime = performance.now();
    console.log(`[firestoreService getFuelings ${getFuelingsStartTime}] Fetching fuelings for trip ID: ${tripId}`);
    try {
        const q = query(fuelingsCollectionRef, where('tripId', '==', tripId), orderBy('date', 'desc'));
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

export const addFueling = async (fuelingData: Omit<Fueling, 'id'>): Promise<string> => {
    const addFuelingStartTime = performance.now();
    console.log(`[firestoreService addFueling ${addFuelingStartTime}] Adding new fueling`, fuelingData);
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

export const updateFueling = async (fuelingId: string, data: Partial<Omit<Fueling, 'id'>>) => {
    const updateFuelingStartTime = performance.now();
    console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Updating fueling ID: ${fuelingId}`, data);
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
    try {
        const fuelingDocRef = doc(db, 'fuelings', fuelingId);
         // Consider deleting associated receipt from storage here if needed
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
// Ensures atomicity for Firestore deletes, but storage deletes are separate operations.
export const deleteTripAndRelatedData = async (tripId: string) => {
    const deleteBatchStartTime = performance.now();
    console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Starting batch delete for trip ID: ${tripId}`);
    const batch = writeBatch(db);
    let relatedReceiptPaths: string[] = []; // To collect paths for storage deletion

    try {
        // 1. Delete the Trip itself
        const tripDocRef = doc(db, 'trips', tripId);
        batch.delete(tripDocRef);

        // 2. Query and batch delete related Visits
        const visitsQuery = query(visitsCollectionRef, where('tripId', '==', tripId));
        const visitsSnapshot = await getDocs(visitsQuery);
        console.log(`[deleteTripAndRelatedData] Found ${visitsSnapshot.docs.length} visits to delete.`);
        visitsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        // 3. Query and batch delete related Expenses, collect storage paths
        const expensesQuery = query(expensesCollectionRef, where('tripId', '==', tripId));
        const expensesSnapshot = await getDocs(expensesQuery);
        console.log(`[deleteTripAndRelatedData] Found ${expensesSnapshot.docs.length} expenses to delete.`);
        expensesSnapshot.docs.forEach(expenseDoc => {
            batch.delete(expenseDoc.ref);
            const expenseData = expenseDoc.data() as Expense;
            if (expenseData.receiptPath) {
                relatedReceiptPaths.push(expenseData.receiptPath);
            }
        });

        // 4. Query and batch delete related Fuelings, collect storage paths
        const fuelingsQuery = query(fuelingsCollectionRef, where('tripId', '==', tripId));
        const fuelingsSnapshot = await getDocs(fuelingsQuery);
         console.log(`[deleteTripAndRelatedData] Found ${fuelingsSnapshot.docs.length} fuelings to delete.`);
         fuelingsSnapshot.docs.forEach(fuelingDoc => {
            batch.delete(fuelingDoc.ref);
            const fuelingData = fuelingDoc.data() as Fueling;
            if (fuelingData.receiptPath) {
                 relatedReceiptPaths.push(fuelingData.receiptPath);
            }
        });

        // Commit the Firestore batch delete FIRST
        await batch.commit();
        console.log(`[firestoreService deleteTripAndRelatedData] Firestore batch delete committed for trip ${tripId}.`);

        // 5. Delete related storage files AFTER successful Firestore commit
        if (relatedReceiptPaths.length > 0) {
            console.log(`[deleteTripAndRelatedData] Deleting ${relatedReceiptPaths.length} related receipts from storage...`);
            const deleteStoragePromises = relatedReceiptPaths.map(path =>
                 deleteReceipt(path).catch(e => console.error(`Failed to delete receipt ${path}:`, e)) // Log errors but don't fail the whole operation
             );
             await Promise.all(deleteStoragePromises);
             console.log(`[deleteTripAndRelatedData] Finished attempting receipt deletions.`);
        }


        const deleteBatchEndTime = performance.now();
        console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Successfully deleted trip ${tripId} and related data. Time: ${deleteBatchEndTime - deleteBatchStartTime} ms`);

    } catch (error) {
         const deleteBatchEndTime = performance.now();
         console.error(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Error deleting trip ${tripId} and related data. Time: ${deleteBatchEndTime - deleteBatchStartTime} ms`, error);
         // Rethrow the error for the calling component to handle
         throw error;
    }
};
