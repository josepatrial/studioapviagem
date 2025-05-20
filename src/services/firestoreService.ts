
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
} from 'firebase/firestore';
import { db } from '@/lib/firebase'; 
import type { User, DriverInfo, UserRole } from '@/contexts/AuthContext';
import type { VehicleInfo } from '@/components/Vehicle';
import type { Trip } from '@/components/Trips/Trips';
import type { Visit as BaseVisit } from '@/components/Trips/Visits'; 
import type { Expense } from '@/components/Trips/Expenses';
import type { Fueling as BaseFueling } from '@/components/Trips/Fuelings'; 
import { deleteReceipt as deleteStorageReceipt } from './storageService'; 

export interface Fueling extends BaseFueling {
 fuelType: string;
}

export interface Visit extends BaseVisit {
    visitType?: string;
}

// Helper to clean undefined or null values from an object before sending to Firestore,
// and ensure essential fields for 'users' collection.
const cleanUserDataForFirestore = (data: Record<string, any>): Record<string, any> => {
    const cleanedData: Record<string, any> = {};
    const coreUserFields = ['name', 'email', 'username', 'role', 'base']; // Fields specific to user data

    for (const key in data) {
        if (data[key] !== undefined && data[key] !== null) {
            cleanedData[key] = data[key];
        }
    }
    
    // Ensure essential fields expected by Firestore for 'users' are present
    if (!cleanedData.name) cleanedData.name = data.email?.split('@')[0] || 'Usuário Desconhecido'; // Default if missing
    if (!cleanedData.email) cleanedData.email = 'unknown@example.com'; // Should always be there for users
    if (!cleanedData.role) cleanedData.role = 'driver'; // Default role
    if (cleanedData.role === 'admin') {
        cleanedData.base = 'ALL';
    } else if (!cleanedData.base) {
        cleanedData.base = 'N/A'; // Default base for non-admins
    }
    if (!cleanedData.username) cleanedData.username = cleanedData.email.split('@')[0];


    // Remove fields that should not be directly written to Firestore user doc if they slipped in
    const internalFields = ['passwordHash', 'lastLogin', 'syncStatus', 'deleted', 'firebaseId', 'localId', 'id'];
    internalFields.forEach(field => delete cleanedData[field]);

    return cleanedData;
};


// Generic cleaner for other collections (trips, vehicles, etc.)
const cleanDataForFirestore = (data: Record<string, any>): Record<string, any> => {
    const cleanedData: Record<string, any> = {};
    for (const key in data) {
        if (data[key] !== undefined) { // Allow null for explicit field deletion if Firestore supports it with merge, but not undefined
            cleanedData[key] = data[key];
        }
    }
    // Remove internal app-specific fields not meant for Firestore
    const internalFields = ['syncStatus', 'deleted', 'firebaseId', 'localId', 'id'];
    internalFields.forEach(field => delete cleanedData[field]);
    return cleanedData;
};


export const getUserData = async (userId: string): Promise<User | null> => {
  const getUserStartTime = performance.now();
  console.log(`[firestoreService getUserData ${getUserStartTime}] Getting user data for ID: ${userId} from database: ${db?.app?.options?.projectId}/${db?.databaseId}`);
 if (!db) {
 console.error(`[firestoreService getUserData ${getUserStartTime}] Firestore DB is not initialized. Cannot get user data.`);
 return null;
  }
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);
    const getUserEndTime = performance.now();
    if (userDocSnap.exists()) {
      const userDataFromSnap = userDocSnap.data();
      const userData = { 
        id: userDocSnap.id, 
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


export const setUserData = async (userId: string, data: Partial<Omit<User, 'id'>>) => {
    const setUserStartTime = performance.now();
    const cleanedData = cleanUserDataForFirestore(data); // Use the user-specific cleaner
    console.log(`[firestoreService setUserData ${setUserStartTime}] Setting/merging user data for ID: ${userId} in 'users' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData);
    if (!db) {
 console.error(`[firestoreService setUserData ${setUserStartTime}] Firestore DB is not initialized. User data not set.`);
        throw new Error("Firestore DB not initialized.");
    }
    const userDocRef = doc(db, 'users', userId);
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

export const addUser = async (userId: string, userData: Omit<User, 'id'>): Promise<void> => {
    const addUserStartTime = performance.now();
    const finalUserData: Omit<User, 'id'> = {
         ...userData,
         role: userData.role || 'driver',
         base: userData.role === 'admin' ? 'ALL' : (userData.base || 'N/A')
     };
    const cleanedData = cleanUserDataForFirestore(finalUserData);
    console.log(`[firestoreService addUser ${addUserStartTime}] Adding user document for ID: ${userId} to 'users' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData);
 if (!db) {
 console.error(`[firestoreService addUser ${addUserStartTime}] Firestore DB is not initialized. User not added.`);
 throw new Error("Firestore DB not initialized.");
    } try {
        if (!db) throw new Error("Firestore DB not initialized.");
        const userDocRef = doc(db, 'users', userId);
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
    console.log(`[firestoreService updateUser ${updateUserStartTime}] Updating user document for ID: ${userId} in 'users' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData);
 if (!db) { console.error(`[firestoreService updateUser ${updateUserStartTime}] Firestore DB is not initialized. User not updated.`); throw new Error("Firestore DB not initialized."); }
    const userDocRef = doc(db, 'users', userId);
    
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
    console.log(`[firestoreService deleteUser ${deleteUserStartTime}] Deleting user document for ID: ${userId} from 'users' collection (DB: ${db?.databaseId}).`);
 if (!db) { console.error(`[firestoreService deleteUser ${deleteUserStartTime}] Firestore DB is not initialized. User not deleted.`); throw new Error("Firestore DB not initialized."); }
    const userDocRef = doc(db, 'users', userId);
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
    console.log(`[firestoreService getDrivers ${getDriversStartTime}] Fetching drivers from 'users' collection (DB: ${db?.databaseId}) where role is 'driver'...`);
 if (!db) {
 console.error(`[firestoreService getDrivers ${getDriversStartTime}] Firestore DB is not initialized. Cannot get drivers.`);
 return [];
    }
 try {
 const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, where('role', '==', 'driver'));
        const querySnapshot = await getDocs(q);
        console.log(`[firestoreService getDrivers ${getDriversStartTime}] Query snapshot received. Found ${querySnapshot.docs.length} documents.`);

        const drivers = querySnapshot.docs.map(docInstance => {
            const data = docInstance.data();
            return {
                id: docInstance.id,
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
export const getVehicles = async (): Promise<VehicleInfo[]> => {
    const getVehiclesStartTime = performance.now();
    console.log(`[firestoreService getVehicles ${getVehiclesStartTime}] Fetching vehicles from 'vehicles' collection (DB: ${db?.databaseId})...`);
 if (!db) { console.warn(`[firestoreService getVehicles ${getVehiclesStartTime}] Firestore is not connected. Returning empty array.`); return []; }
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
    const cleanedData = cleanDataForFirestore(vehicleData);
 console.log(`[firestoreService addVehicle ${addVehicleStartTime}] Adding new vehicle to 'vehicles' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData); if (!db) {
 console.warn(`[firestoreService addVehicle ${addVehicleStartTime}] Firestore is not connected. Vehicle not added.`); throw new Error("Firestore DB not initialized.");
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

export const updateVehicle = async (vehicleId: string, data: Partial<VehicleInfo>) => {
    const updateVehicleStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    console.log(`[firestoreService updateVehicle ${updateVehicleStartTime}] Updating vehicle ID: ${vehicleId} in 'vehicles' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData);
 if (!db) {
        console.warn(`[firestoreService updateVehicle ${updateVehicleStartTime}] Firestore is not connected. Vehicle not updated.`);
        throw new Error("Firestore DB not initialized.");
    }
    const vehicleDocRef = doc(db, 'vehicles', vehicleId);
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
    console.log(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Deleting vehicle ID: ${vehicleId} from 'vehicles' collection (DB: ${db?.databaseId}).`);
 if (!db) {
     console.warn(`[firestoreService deleteVehicle ${deleteVehicleStartTime}] Firestore is not connected. Vehicle not deleted.`);
     throw new Error("Firestore DB not initialized.");
    }
    const vehicleDocRef = doc(db, 'vehicles', vehicleId);
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
    startDate?: string; 
    endDate?: string; 
    base?: string;
}

export const getTrips = async (filters: TripFilter = {}): Promise<Trip[]> => {
    const getTripsStartTime = performance.now();
    console.log(`[firestoreService getTrips ${getTripsStartTime}] Fetching trips from 'trips' collection (DB: ${db?.databaseId}) with filters:`, filters);
 if (!db) { console.warn(`[firestoreService getTrips ${getTripsStartTime}] Firestore is not connected. Returning empty array.`); return []; }
 const tripsCollectionRef = collection(db, 'trips');
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
        if (filters.startDate || filters.endDate || (filters.base && filters.base !== 'ALL')) {
            // No additional orderBy for createdAt here as we sort after fetching
        } else {
             constraints.push(orderBy('createdAt', 'desc'));
        }

        const q = query(tripsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        let trips = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Trip);

        if (filters.startDate || filters.endDate || (filters.base && filters.base !== 'ALL')) {
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
        if ((error as any).code === 'unavailable') {
            console.warn('Firestore is offline. Cannot fetch trips.');
        }
        return [];
    }
};

export const addTrip = async (tripData: Omit<Trip, 'id' | 'updatedAt' | 'createdAt' | 'firebaseId' | 'localId' | 'syncStatus'>): Promise<string> => {
    const addTripStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(tripData);
 console.log(`[firestoreService addTrip ${addTripStartTime}] Adding new trip to 'trips' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData); if (!db) {
 console.warn(`[firestoreService addTrip ${addTripStartTime}] Firestore is not connected. Trip not added.`); throw new Error("Firestore DB not initialized.");
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

export const updateTrip = async (tripId: string, data: Partial<Omit<Trip, 'id' | 'createdAt' | 'firebaseId' | 'localId' | 'syncStatus'>>) => {
    const updateTripStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    console.log(`[firestoreService updateTrip ${updateTripStartTime}] Updating trip ID: ${tripId} in 'trips' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData);
 if (!db) {
        console.warn(`[firestoreService updateTrip ${updateTripStartTime}] Firestore is not connected. Trip not updated.`);
        throw new Error("Firestore DB not initialized.");
    }
    const tripDocRef = doc(db, 'trips', tripId);
    try {
        const dataToUpdate = {
            ...cleanedData,
            updatedAt: Timestamp.now(),
        };
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
export const getVisits = async (tripId: string): Promise<Visit[]> => {
    const getVisitsStartTime = performance.now();
    console.log(`[firestoreService getVisits ${getVisitsStartTime}] Fetching visits from 'visits' collection (DB: ${db?.databaseId}) for trip ID: ${tripId}`);
 if (!db || !visitsCollectionRef) {
     console.warn(`[firestoreService getVisits ${getVisitsStartTime}] Firestore is not connected. Returning empty array.`);
     return [];
    }
 try {
 const visitsCollectionRef = collection(db, 'visits');
        const q = query(visitsCollectionRef, where('tripId', '==', tripId), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        const visits = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Visit);
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
    const cleanedData = cleanDataForFirestore(visitData);
 console.log(`[firestoreService addVisit ${addVisitStartTime}] Adding new visit to 'visits' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData); if (!db) {
 console.warn(`[firestoreService addVisit ${addVisitStartTime}] Firestore is not connected. Visit not added.`); throw new Error("Firestore DB not initialized.");
    }
    try {
        const dataWithTimestamp = { ...cleanedData, timestamp: Timestamp.fromDate(new Date(cleanedData.timestamp)) };
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

export const updateVisit = async (visitId: string, data: Partial<Omit<Visit, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>>) => {
    const updateVisitStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    console.log(`[firestoreService updateVisit ${updateVisitStartTime}] Updating visit ID: ${visitId} in 'visits' collection (DB: ${db?.databaseId}). Cleaned Data:`, cleanedData);
 if (!db) {
     console.warn(`[firestoreService updateVisit ${updateVisitStartTime}] Firestore is not connected. Visit not updated.`);
     throw new Error("Firestore DB not initialized.");
    }
    const visitDocRef = doc(db, 'visits', visitId);
    try {
        const dataWithTimestamp = cleanedData.timestamp ? { ...cleanedData, timestamp: Timestamp.fromDate(new Date(cleanedData.timestamp)) } : cleanedData;
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
    console.log(`[firestoreService deleteVisit ${deleteVisitStartTime}] Deleting visit ID: ${visitId} from 'visits' collection (DB: ${db?.databaseId}).`);
 if (!db) {
     console.warn(`[firestoreService deleteVisit ${deleteVisitStartTime}] Firestore is not connected. Visit not deleted.`);
     throw new Error("Firestore DB not initialized.");
    }
    const visitDocRef = doc(db, 'visits', visitId);
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
export const getExpenses = async (tripId: string): Promise<Expense[]> => {
    const getExpensesStartTime = performance.now();
    console.log(`[firestoreService getExpenses ${getExpensesStartTime}] Fetching expenses from 'expenses' collection (DB: ${db?.databaseId}) for trip ID: ${tripId}`);
 if (!db || !expensesCollectionRef) {
     console.warn(`[firestoreService getExpenses ${getExpensesStartTime}] Firestore is not connected. Returning empty array.`);
     return [];
    }
 try {
 const expensesCollectionRef = collection(db, 'expenses');
        const q = query(expensesCollectionRef, where('tripId', '==', tripId), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        const expenses = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Expense);
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
    const cleanedData = cleanDataForFirestore(expenseData); 
    console.log(`[firestoreService addExpense ${addExpenseStartTime}] Adding new expense to 'expenses' collection (DB: ${db?.databaseId}). Initial Cleaned Data:`, cleanedData);
    
    const dataForFirestore: any = {
        ...cleanedData,
        timestamp: Timestamp.fromDate(new Date(cleanedData.timestamp)),
        expenseDate: Timestamp.fromDate(new Date(cleanedData.expenseDate)),
    };

    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => {
        if (dataForFirestore[field] === null || dataForFirestore[field] === undefined) {
            delete dataForFirestore[field];
        }
    });
    console.log(`[firestoreService addExpense ${addExpenseStartTime}] Data after receipt field cleaning:`, dataForFirestore);

 if (!db) { console.warn(`[firestoreService addExpense ${addExpenseStartTime}] Firestore is not connected. Expense not added.`); throw new Error("Firestore DB not initialized."); }
 const expensesCollectionRef = collection(db, 'expenses'); // Create ref here
    try {
        const docRef = await addDoc(expensesCollectionRef, dataForFirestore);
        const addExpenseEndTime = performance.now();
        console.log(`[firestoreService addExpense ${addExpenseStartTime}] Expense added successfully to 'expenses' with ID: ${docRef.id}. Time: ${addExpenseEndTime - addExpenseStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addExpenseEndTime = performance.now();
         console.error(`[firestoreService addExpense ${addExpenseStartTime}] Error adding expense. Time: ${addExpenseEndTime - addExpenseStartTime} ms. Payload:`, dataForFirestore, error);
         throw error;
    }
};

export const updateExpense = async (expenseId: string, data: Partial<Omit<Expense, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>>) => {
    const updateExpenseStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Updating expense ID: ${expenseId} in 'expenses' collection (DB: ${db?.databaseId}). Initial Cleaned Data:`, cleanedData);
    
    const dataForFirestore: any = { ...cleanedData };
    if (cleanedData.timestamp) dataForFirestore.timestamp = Timestamp.fromDate(new Date(cleanedData.timestamp));
    if (cleanedData.expenseDate) dataForFirestore.expenseDate = Timestamp.fromDate(new Date(cleanedData.expenseDate));

    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => {
        if (dataForFirestore.hasOwnProperty(field) && (dataForFirestore[field] === null || dataForFirestore[field] === undefined)) {
            if (dataForFirestore[field] === undefined) delete dataForFirestore[field];
        } else if (!dataForFirestore.hasOwnProperty(field) && data[field as keyof typeof data] === undefined) {
        }
    });
    console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Data after receipt field cleaning:`, dataForFirestore);
    
    if (!db) {
 console.warn(`[firestoreService updateExpense ${updateExpenseStartTime}] Firestore is not connected. Expense not updated.`);
     throw new Error("Firestore DB not initialized.");
    }
    const expenseDocRef = doc(db, 'expenses', expenseId);
    try {
        await updateDoc(expenseDocRef, dataForFirestore);
        const updateExpenseEndTime = performance.now();
        console.log(`[firestoreService updateExpense ${updateExpenseStartTime}] Expense updated successfully for ID: ${expenseId}. Time: ${updateExpenseEndTime - updateExpenseStartTime} ms`);
    } catch (error) {
         const updateExpenseEndTime = performance.now();
         console.error(`[firestoreService updateExpense ${updateExpenseStartTime}] Error updating expense for ID: ${expenseId}. Time: ${updateExpenseEndTime - updateExpenseStartTime} ms. Payload:`, dataForFirestore, error);
         throw error;
    }
};

export const deleteExpense = async (expenseId: string) => {
    const deleteExpenseStartTime = performance.now();
    console.log(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Deleting expense ID: ${expenseId} from 'expenses' collection (DB: ${db?.databaseId}).`);
 if (!db) {
     console.warn(`[firestoreService deleteExpense ${deleteExpenseStartTime}] Firestore is not connected. Expense not deleted.`);
     throw new Error("Firestore DB not initialized.");
    }
    const expenseDocRef = doc(db, 'expenses', expenseId);
    try {
        const expenseSnap = await getDoc(expenseDocRef);
        if (expenseSnap.exists()) {
            const expenseData = expenseSnap.data() as Expense;
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
export const getFuelings = async (filter?: { tripId?: string; vehicleId?: string }): Promise<Fueling[]> => {
    const getFuelingsStartTime = performance.now();
    console.log(`[firestoreService getFuelings ${getFuelingsStartTime}] Fetching fuelings from 'fuelings' collection (DB: ${db?.databaseId}) with filter:`, filter);
 if (!db || !fuelingsCollectionRef) {
        console.warn(`[firestoreService getFuelings ${getFuelingsStartTime}] Firestore is not connected. Returning empty array.`);
        return [];
    }
 try {
 const fuelingsCollectionRef = collection(db, 'fuelings');
        const constraints: QueryConstraint[] = [];
        if (filter?.tripId) {
            constraints.push(where('tripId', '==', filter.tripId));
        }
        if (filter?.vehicleId) {
            constraints.push(where('vehicleId', '==', filter.vehicleId));
        }
        constraints.push(orderBy('date', 'desc'));

        const q = query(fuelingsCollectionRef, ...constraints);
        const querySnapshot = await getDocs(q);
        const fuelings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Fueling);
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
    const cleanedData = cleanDataForFirestore(fuelingData);
    console.log(`[firestoreService addFueling ${addFuelingStartTime}] Adding new fueling to 'fuelings' collection (DB: ${db?.databaseId}). Initial Cleaned Data:`, cleanedData);
    
    const dataForFirestore: any = {
        ...cleanedData,
        date: Timestamp.fromDate(new Date(cleanedData.date)),
    };

    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => {
        if (dataForFirestore[field] === null || dataForFirestore[field] === undefined) {
            delete dataForFirestore[field];
        }
    });
    console.log(`[firestoreService addFueling ${addFuelingStartTime}] Data after receipt field cleaning:`, dataForFirestore);

 if (!db) { console.warn(`[firestoreService addFueling ${addFuelingStartTime}] Firestore is not connected. Fueling not added.`); throw new Error("Firestore DB not initialized."); }
 const fuelingsCollectionRef = collection(db, 'fuelings');
    try {
        const docRef = await addDoc(fuelingsCollectionRef, dataForFirestore);
        const addFuelingEndTime = performance.now();
        console.log(`[firestoreService addFueling ${addFuelingStartTime}] Fueling added successfully to 'fuelings' with ID: ${docRef.id}. Time: ${addFuelingEndTime - addFuelingStartTime} ms`);
        return docRef.id;
    } catch (error) {
         const addFuelingEndTime = performance.now();
         console.error(`[firestoreService addFueling ${addFuelingStartTime}] Error adding fueling. Time: ${addFuelingEndTime - addFuelingStartTime} ms. Payload:`, dataForFirestore, error);
         throw error;
    }
};

export const updateFueling = async (fuelingId: string, data: Partial<Omit<Fueling, 'id' | 'firebaseId' | 'localId' | 'syncStatus'>>) => {
    const updateFuelingStartTime = performance.now();
    const cleanedData = cleanDataForFirestore(data);
    console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Updating fueling ID: ${fuelingId} in 'fuelings' collection (DB: ${db?.databaseId}). Initial Cleaned Data:`, cleanedData);

    const dataForFirestore: any = { ...cleanedData };
    if (cleanedData.date) dataForFirestore.date = Timestamp.fromDate(new Date(cleanedData.date));

    const receiptFields = ['receiptFilename', 'receiptUrl', 'receiptPath'];
    receiptFields.forEach(field => {
        if (dataForFirestore.hasOwnProperty(field) && (dataForFirestore[field] === null || dataForFirestore[field] === undefined)) {
            if (dataForFirestore[field] === undefined) delete dataForFirestore[field];
        } else if (!dataForFirestore.hasOwnProperty(field) && data[field as keyof typeof data] === undefined) {
        }
    });
    console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Data after receipt field cleaning:`, dataForFirestore);

    if (!db) {
 console.warn(`[firestoreService updateFueling ${updateFuelingStartTime}] Firestore is not connected. Fueling not updated.`);
        throw new Error("Firestore DB not initialized.");
    }
    const fuelingDocRef = doc(db, 'fuelings', fuelingId);
    try {
        await updateDoc(fuelingDocRef, dataForFirestore);
        const updateFuelingEndTime = performance.now();
        console.log(`[firestoreService updateFueling ${updateFuelingStartTime}] Fueling updated successfully for ID: ${fuelingId}. Time: ${updateFuelingEndTime - updateFuelingStartTime} ms`);
    } catch (error) {
         const updateFuelingEndTime = performance.now();
         console.error(`[firestoreService updateFueling ${updateFuelingStartTime}] Error updating fueling for ID: ${fuelingId}. Time: ${updateFuelingEndTime - updateFuelingStartTime} ms. Payload:`, dataForFirestore, error);
         throw error;
    }
};

export const deleteFueling = async (fuelingId: string) => {
    const deleteFuelingStartTime = performance.now();
    console.log(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Deleting fueling ID: ${fuelingId} from 'fuelings' collection (DB: ${db?.databaseId}).`);
 if (!db) {
     console.warn(`[firestoreService deleteFueling ${deleteFuelingStartTime}] Firestore is not connected. Fueling not deleted.`);
     throw new Error("Firestore DB not initialized.");
    }
    const fuelingDocRef = doc(db, 'fuelings', fuelingId);
    try {
        const fuelingSnap = await getDoc(fuelingDocRef);
        if (fuelingSnap.exists()) {
            const fuelingData = fuelingSnap.data() as Fueling;
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

// --- Batch Delete for Trip Deletion ---
export const deleteTripAndRelatedData = async (tripId: string) => {
    const deleteBatchStartTime = performance.now();
    console.log(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Starting batch delete for trip ID: ${tripId} in database (DB: ${db?.databaseId})`);
 if (!db) {
        console.warn(`[firestoreService deleteTripAndRelatedData ${deleteBatchStartTime}] Firestore is not connected. Trip and related data not deleted.`);
        throw new Error("Firestore DB not initialized.");
    }
    const batch = writeBatch(db);
    const relatedReceiptPaths: string[] = [];

    try {
        console.log(`[deleteTripAndRelatedData] Preparing to delete trip: ${tripId}`);
        const tripDocRef = doc(db, 'trips', tripId);
        batch.delete(tripDocRef);

        const visitsQuery = query(collection(db, 'visits'), where('tripId', '==', tripId));
        const visitsSnapshot = await getDocs(visitsQuery);
        console.log(`[deleteTripAndRelatedData] Found ${visitsSnapshot.docs.length} visits to delete for trip ${tripId}.`);
        visitsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        const expensesQuery = query(collection(db, 'expenses'), where('tripId', '==', tripId));
        const expensesSnapshot = await getDocs(expensesQuery);
        console.log(`[deleteTripAndRelatedData] Found ${expensesSnapshot.docs.length} expenses to delete for trip ${tripId}.`);
        expensesSnapshot.docs.forEach(expenseDoc => {
            batch.delete(expenseDoc.ref);
            const expenseData = expenseDoc.data() as Expense; 
            if (expenseData.receiptPath) relatedReceiptPaths.push(expenseData.receiptPath);
        });

        const fuelingsQuery = query(collection(db, 'fuelings'), where('tripId', '==', tripId));
        const fuelingsSnapshot = await getDocs(fuelingsQuery);
         console.log(`[deleteTripAndRelatedData] Found ${fuelingsSnapshot.docs.length} fuelings to delete for trip ${tripId}.`);
         fuelingsSnapshot.docs.forEach(fuelingDoc => {
            batch.delete(fuelingDoc.ref);
            const fuelingData = fuelingDoc.data() as Fueling; 
            if (fuelingData.receiptPath) relatedReceiptPaths.push(fuelingData.receiptPath);
        });

        console.log(`[deleteTripAndRelatedData] Committing Firestore batch delete for trip ${tripId}...`);
        await batch.commit();
        console.log(`[firestoreService deleteTripAndRelatedData] Firestore batch delete committed for trip ${tripId}.`);

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
    console.log(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] Getting user by email: ${email} from 'users' collection (DB: ${db?.databaseId})`);
 if (!db) { console.warn(`[firestoreService getUserByEmail ${getUserByEmailStartTime}] Firestore DB is not initialized. Cannot get user by email.`); return null; }
 const usersCollectionRef = collection(db, 'users');
    const q = query(usersCollectionRef, where('email', '==', email));
    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userDataFromSnap = userDoc.data();
            const userData = { 
                id: userDoc.id, 
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

export const getVehicleByLicensePlate = async (licensePlate: string): Promise<VehicleInfo | null> => {
    const getVehicleByPlateStartTime = performance.now();
    console.log(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Getting vehicle by license plate: ${licensePlate} from 'vehicles' collection (DB: ${db?.databaseId})`);
 if (!db) { console.warn(`[firestoreService getVehicleByLicensePlate ${getVehicleByPlateStartTime}] Firestore DB is not initialized. Cannot get vehicle by license plate.`); return null; }
 const vehiclesCollectionRef = collection(db, 'vehicles');
    const q = query(vehiclesCollectionRef, where('licensePlate', '==', licensePlate.toUpperCase()));
    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const vehicleDoc = querySnapshot.docs[0];
            const vehicleData = { id: vehicleDoc.id, ...vehicleDoc.data() } as VehicleInfo;
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
