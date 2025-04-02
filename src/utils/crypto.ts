import * as crypto from 'crypto';

/**
 * Calculates the SHA-256 checksum of a given string.
 *
 * @param data The string data to hash.
 * @returns The SHA-256 checksum as a hexadecimal string.
 */
export function getHash(data: string): string {
	return crypto.createHash('sha256').update(data).digest('hex');
}
