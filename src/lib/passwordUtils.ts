// src/lib/passwordUtils.ts
import * as bcrypt from 'bcryptjs';

const saltRounds = 10; // Adjust salt rounds as needed for security/performance balance

/**
 * Hashes a plain text password using bcrypt.
 * @param password The plain text password.
 * @returns A promise that resolves to the hashed password string.
 */
export async function hashPassword(password: string): Promise<string> {
    try {
        const salt = await bcrypt.genSalt(saltRounds);
        const hash = await bcrypt.hash(password, salt);
        return hash;
    } catch (error) {
        console.error("Error hashing password:", error);
        throw new Error("Password hashing failed.");
    }
}

/**
 * Verifies a plain text password against a stored bcrypt hash.
 * @param password The plain text password to verify.
 * @param hash The stored password hash.
 * @returns A promise that resolves to true if the password matches the hash, false otherwise.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
        const isMatch = await bcrypt.compare(password, hash);
        return isMatch;
    } catch (error) {
        console.error("Error verifying password:", error);
        // In case of error during comparison, treat as mismatch for security
        return false;
    }
}
    