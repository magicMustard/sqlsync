/**
 * Utility functions for datetime operations.
 */

/**
 * Generates a timestamp string for migration filenames in the format YYYYMMDDHHMMSS
 * Always uses UTC time for consistency across different environments.
 * @returns A 14-character string in format YYYYMMDDHHMMSS (UTC time)
 */
export function generateTimestamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}
