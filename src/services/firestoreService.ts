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

export const getUserData = async (userId: string): Promise<User | null> => {
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const userData = convertTimestampsToISO({ id: userDocSnap.id, ...userDocSnap.data() }) as User;
      return userData;
    } else {
      console.log('No such user document!');
      return null;
    }
  } catch (error) {
    console.error("Error getting user document:", error);
    return null;
  }
};

export const setUserData = async (userId: string, data: Partial<Omit<User, 'id'>>) => {
    try {
      const userDocRef = doc(db, 'users', userId);
      // Convert relevant date fields back to Timestamps if necessary
      // Example: const dataWithTimestamps = convertISOToTimestamps(data, ['someDateField']);
      await setDoc(userDocRef, data, { merge: true }); // Use setDoc with merge: true
      console.log('User data set/updated successfully for ID:', userId);
    } catch (error) {
      console.error("Error setting/updating user document:", error);
      throw error;
    }
};

// Use setDoc to ensure the document ID matches the Auth UID
export const addUser = async (userId: string, userData: Omit<DriverInfo, 'id' | 'password'>): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', userId);
    // Ensure role is set
    const finalUserData = { ...userData, role: 'driver' };
    await setDoc(userDocRef, finalUserData);
    console.log("Driver document created/updated in Firestore with ID:", userId);
  } catch (error) {
    console.error("Error adding/setting user document:", error);
    throw error;
  }
};

export const updateUser = async (userId: string, data: Partial<DriverInfo>) => {
  const userDocRef = doc(db, 'users', userId);
  const { password, ...dataToUpdate } = data; // Ensure password is not sent
  await updateDoc(userDocRef, dataToUpdate);
};

export const deleteUser = async (userId: string) => {
  const userDocRef = doc(db, 'users', userId);
  await deleteDoc(userDocRef);
  // IMPORTANT: This only deletes the Firestore document.
  // Deleting the Firebase Auth user requires Admin SDK (backend) or re-authentication.
};

export const getDrivers = async (): Promise<DriverInfo[]> => {
  try {
      const q = query(usersCollectionRef, where('role', '==', 'driver'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as DriverInfo);
  } catch (error) {
       console.error("Error fetching drivers:", error);
       return []; // Return empty array on error
  }
};

// --- Vehicle Service ---
const vehiclesCollectionRef = collection(db, 'vehicles');

export const getVehicles = async (): Promise<VehicleInfo[]> => {
 try {
     const querySnapshot = await getDocs(vehiclesCollectionRef);
     // Basic conversion, assuming no timestamps in VehicleInfo
     return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as VehicleInfo);
 } catch (error) {
      console.error("Error fetching vehicles:", error);
      return [];
 }
};

export const addVehicle = async (vehicleData: Omit<VehicleInfo, 'id'>): Promise<string> => {
 try {
     const docRef = await addDoc(vehiclesCollectionRef, vehicleData);
     return docRef.id;
 } catch (error) {
     console.error("Error adding vehicle:", error);
     throw error;
 }
};

export const updateVehicle = async (vehicleId: string, data: Partial<VehicleInfo>) => {
 try {
     const vehicleDocRef = doc(db, 'vehicles', vehicleId);
     await updateDoc(vehicleDocRef, data);
 } catch (error) {
      console.error("Error updating vehicle:", error);
      throw error;
 }
};

export const deleteVehicle = async (vehicleId: string) => {
 try {
     const vehicleDocRef = doc(db, 'vehicles', vehicleId);
     // TODO: Add check if vehicle is in an active trip before deleting
     await deleteDoc(vehicleDocRef);
 } catch (error) {
      console.error("Error deleting vehicle:", error);
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

export const getTrips = async (filters: TripFilter = {}): Promise<Trip[]> => {
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
             constraints.push(where('createdAt', '<=', Timestamp.fromDate(new Date(filters.endDate))));
        }
        // Add other filters based on `filters` object

        // Default ordering (applied after filters)
        constraints.push(orderBy('status', 'asc')); // 'Andamento' first
        // Firestore requires the first orderBy field to match the inequality field if present
        if (filters.startDate || filters.endDate) {
            constraints.push(orderBy('createdAt', 'desc'));
        } else {
             // If no date filter, we can still order by createdAt as the second criteria
             constraints.push(orderBy('createdAt', 'desc'));
        }


        const q = query(tripsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Trip);

    } catch (error) {
        console.error("Error fetching trips:", error);
        // Check for specific Firestore index errors
        if (error instanceof Error && error.message.includes('requires an index')) {
             console.error("Firestore index missing. Please create the required composite index in your Firebase console.");
             // You might want to display a more user-friendly error or log this specifically
        }
        return [];
    }
};


// Data should not contain id or updatedAt
export const addTrip = async (tripData: Omit<Trip, 'id' | 'updatedAt' | 'createdAt'>): Promise<string> => {
 try {
     const dataWithTimestamps = {
         ...tripData,
         createdAt: Timestamp.now(), // Set creation timestamp
         updatedAt: Timestamp.now(), // Set initial update timestamp
     };
     const docRef = await addDoc(tripsCollectionRef, dataWithTimestamps);
     return docRef.id;
 } catch (error) {
      console.error("Error adding trip:", error);
      throw error;
 }
};

export const updateTrip = async (tripId: string, data: Partial<Omit<Trip, 'id' | 'createdAt'>>) => {
 try {
     const tripDocRef = doc(db, 'trips', tripId);
     // Convert specific date fields if they exist and are strings
     const dataWithPotentialTimestamps = convertISOToTimestamps(data, ['expenseDate', 'timestamp', 'date']); // Add relevant date fields if any

     const dataToUpdate = {
         ...dataWithPotentialTimestamps,
         updatedAt: Timestamp.now(), // Always update 'updatedAt'
     };
     await updateDoc(tripDocRef, dataToUpdate);
 } catch (error) {
      console.error("Error updating trip:", error);
      throw error;
 }
};

// Note: deleteTrip function is removed as deleteTripAndRelatedData handles deletion

// --- Visit Service ---
const visitsCollectionRef = collection(db, 'visits');

export const getVisits = async (tripId: string): Promise<Visit[]> => {
  try {
      const q = query(visitsCollectionRef, where('tripId', '==', tripId), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Visit);
  } catch (error) {
       console.error("Error fetching visits:", error);
       return [];
  }
};

export const addVisit = async (visitData: Omit<Visit, 'id'>): Promise<string> => {
 try {
     const dataWithTimestamp = convertISOToTimestamps(visitData, ['timestamp']);
     const docRef = await addDoc(visitsCollectionRef, dataWithTimestamp);
     return docRef.id;
 } catch (error) {
      console.error("Error adding visit:", error);
      throw error;
 }
};

export const updateVisit = async (visitId: string, data: Partial<Omit<Visit, 'id'>>) => {
 try {
     const visitDocRef = doc(db, 'visits', visitId);
     const dataWithTimestamp = convertISOToTimestamps(data, ['timestamp']);
     await updateDoc(visitDocRef, dataWithTimestamp);
 } catch (error) {
      console.error("Error updating visit:", error);
      throw error;
 }
};

export const deleteVisit = async (visitId: string) => {
 try {
     const visitDocRef = doc(db, 'visits', visitId);
     await deleteDoc(visitDocRef);
 } catch (error) {
      console.error("Error deleting visit:", error);
      throw error;
 }
};

// --- Expense Service ---
const expensesCollectionRef = collection(db, 'expenses');

export const getExpenses = async (tripId: string): Promise<Expense[]> => {
 try {
     const q = query(expensesCollectionRef, where('tripId', '==', tripId), orderBy('timestamp', 'desc'));
     const querySnapshot = await getDocs(q);
     return querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Expense);
 } catch (error) {
      console.error("Error fetching expenses:", error);
      return [];
 }
};

export const addExpense = async (expenseData: Omit<Expense, 'id'>): Promise<string> => {
 try {
     const dataWithTimestamps = convertISOToTimestamps(expenseData, ['expenseDate', 'timestamp']);
     const docRef = await addDoc(expensesCollectionRef, dataWithTimestamps);
     return docRef.id;
 } catch (error) {
      console.error("Error adding expense:", error);
      throw error;
 }
};

export const updateExpense = async (expenseId: string, data: Partial<Omit<Expense, 'id'>>) => {
 try {
     const expenseDocRef = doc(db, 'expenses', expenseId);
     const dataWithTimestamps = convertISOToTimestamps(data, ['expenseDate', 'timestamp']);
     await updateDoc(expenseDocRef, dataWithTimestamps);
 } catch (error) {
      console.error("Error updating expense:", error);
      throw error;
 }
};

export const deleteExpense = async (expenseId: string) => {
 try {
     const expenseDocRef = doc(db, 'expenses', expenseId);
     // Consider deleting associated receipt file from storage here or in confirmDeleteExpense
     await deleteDoc(expenseDocRef);
 } catch (error) {
      console.error("Error deleting expense:", error);
      throw error;
 }
};

// --- Fueling Service ---
const fuelingsCollectionRef = collection(db, 'fuelings');

export const getFuelings = async (tripId: string): Promise<Fueling[]> => {
 try {
     const q = query(fuelingsCollectionRef, where('tripId', '==', tripId), orderBy('date', 'desc'));
     const querySnapshot = await getDocs(q);
     return querySnapshot.docs.map(doc => convertTimestampsToISO({ id: doc.id, ...doc.data() }) as Fueling);
 } catch (error) {
      console.error("Error fetching fuelings:", error);
      return [];
 }
};

export const addFueling = async (fuelingData: Omit<Fueling, 'id'>): Promise<string> => {
 try {
     const dataWithTimestamp = convertISOToTimestamps(fuelingData, ['date']);
     const docRef = await addDoc(fuelingsCollectionRef, dataWithTimestamp);
     return docRef.id;
 } catch (error) {
      console.error("Error adding fueling:", error);
      throw error;
 }
};

export const updateFueling = async (fuelingId: string, data: Partial<Omit<Fueling, 'id'>>) => {
 try {
     const fuelingDocRef = doc(db, 'fuelings', fuelingId);
     const dataWithTimestamp = convertISOToTimestamps(data, ['date']);
     await updateDoc(fuelingDocRef, dataWithTimestamp);
 } catch (error) {
      console.error("Error updating fueling:", error);
      throw error;
 }
};

export const deleteFueling = async (fuelingId: string) => {
 try {
     const fuelingDocRef = doc(db, 'fuelings', fuelingId);
     // Consider deleting associated receipt file from storage here or in confirmDeleteFueling
     await deleteDoc(fuelingDocRef);
 } catch (error) {
      console.error("Error deleting fueling:", error);
      throw error;
 }
};

// --- Batch Delete for Trip Deletion ---
export const deleteTripAndRelatedData = async (tripId: string) => {
    const batch = writeBatch(db);

    try {
        // 1. Delete the Trip itself
        const tripDocRef = doc(db, 'trips', tripId);
        batch.delete(tripDocRef);

        // 2. Query and delete related Visits
        const visitsQuery = query(visitsCollectionRef, where('tripId', '==', tripId));
        const visitsSnapshot = await getDocs(visitsQuery);
        visitsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        // 3. Query and delete related Expenses (and potential storage files)
        const expensesQuery = query(expensesCollectionRef, where('tripId', '==', tripId));
        const expensesSnapshot = await getDocs(expensesQuery);
        const expensePromises = expensesSnapshot.docs.map(async (expenseDoc) => {
            batch.delete(expenseDoc.ref);
            const expenseData = expenseDoc.data() as Expense;
            if (expenseData.receiptPath) {
                // Ideally, collect paths and delete later or handle errors gracefully
                await deleteReceipt(expenseData.receiptPath).catch(e => console.error(`Failed to delete expense receipt ${expenseData.receiptPath}:`, e));
            }
        });

        // 4. Query and delete related Fuelings (and potential storage files)
        const fuelingsQuery = query(fuelingsCollectionRef, where('tripId', '==', tripId));
        const fuelingsSnapshot = await getDocs(fuelingsQuery);
         const fuelingPromises = fuelingsSnapshot.docs.map(async (fuelingDoc) => {
            batch.delete(fuelingDoc.ref);
            const fuelingData = fuelingDoc.data() as Fueling;
            if (fuelingData.receiptPath) {
                 await deleteReceipt(fuelingData.receiptPath).catch(e => console.error(`Failed to delete fueling receipt ${fuelingData.receiptPath}:`, e));
            }
        });

        // Wait for all potential storage deletions (or handle them after commit)
        await Promise.all([...expensePromises, ...fuelingPromises]);


        // Commit the Firestore batch delete
        await batch.commit();
        console.log(`Successfully deleted trip ${tripId} and related data.`);

    } catch (error) {
         console.error(`Error deleting trip ${tripId} and related data:`, error);
         // Rethrow the error for the calling component to handle
         throw error;
    }
};
