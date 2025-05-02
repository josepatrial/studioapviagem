// src/services/storageService.ts
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { v4 as uuidv4 } from 'uuid'; // For generating unique filenames

/**
 * Uploads a receipt file (PDF or Image) or a Data URL string to Firebase Storage.
 *
 * @param fileOrDataUrl The File object or Data URL string to upload.
 * @param folder The target folder in storage ('expenses' or 'fuelings'). Defaults to 'expenses'.
 * @returns A promise that resolves to an object containing the download URL and storage path.
 * @throws An error if the upload fails.
 */
export const uploadReceipt = async (
  fileOrDataUrl: File | string,
  folder: 'expenses' | 'fuelings' = 'expenses'
): Promise<{ url: string; path: string }> => {
  let blob: Blob;
  let originalFilename: string | undefined;

  if (typeof fileOrDataUrl === 'string') {
    // Handle Data URL (from camera)
    try {
        const response = await fetch(fileOrDataUrl);
        if (!response.ok) {
           throw new Error(`Failed to fetch data URL: ${response.statusText}`);
        }
        blob = await response.blob();
        const fileExtension = blob.type.split('/')[1] || 'png'; // Default to png if type is missing/malformed
        originalFilename = `captured_receipt.${fileExtension}`; // Assign a generic name
    } catch (error) {
        console.error("Error processing data URL:", error);
        throw new Error('Failed to process captured image data.');
    }
  } else {
    // Handle File object (from upload input)
    blob = fileOrDataUrl;
    originalFilename = fileOrDataUrl.name;
  }

  // Generate a unique filename using UUID and preserve original extension
  const fileExtension = originalFilename?.split('.').pop() || 'bin'; // Default extension
  const uniqueFilename = `${uuidv4()}.${fileExtension}`;
  const storagePath = `${folder}/${uniqueFilename}`;
  const storageRef = ref(storage, storagePath);

  try {
    console.log(`Attempting to upload to: ${storagePath}`);
    const snapshot = await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('File uploaded successfully:', downloadURL);
    return { url: downloadURL, path: storagePath }; // Return URL and storage path
  } catch (error) {
    console.error('Error uploading file to Firebase Storage:', error);
    throw new Error('Failed to upload receipt.');
  }
};

/**
 * Deletes a file from Firebase Storage using its storage path.
 *
 * @param storagePath The full path to the file in Firebase Storage (e.g., 'expenses/uuid_filename.pdf').
 * @returns A promise that resolves when the deletion is complete or if the file doesn't exist.
 */
export const deleteReceipt = async (storagePath: string): Promise<void> => {
  if (!storagePath) {
      console.warn('No storage path provided for deletion.');
      return;
  }
  const storageRef = ref(storage, storagePath);
  try {
    await deleteObject(storageRef);
    console.log('File deleted successfully from:', storagePath);
  } catch (error: any) {
    // Handle common errors gracefully
    if (error.code === 'storage/object-not-found') {
      console.warn('File not found for deletion, it might have been already deleted:', storagePath);
    } else if (error.code === 'storage/unauthorized') {
       console.error('Unauthorized to delete file:', storagePath);
       // Potentially throw a specific error or notify the user
    } else {
      console.error('Error deleting file:', storagePath, error);
      // Rethrow or handle other errors as needed
      // throw new Error('Failed to delete receipt file.');
    }
  }
};
