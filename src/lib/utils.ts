import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { v4 as uuidv4 } from 'uuid'; // Import uuid

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Function to generate a unique local ID
export function generateLocalId(prefix: string = 'local'): string {
    return `${prefix}_${uuidv4()}`;
}

    