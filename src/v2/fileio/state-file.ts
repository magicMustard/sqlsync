import { StateFileDetails } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Manages reading and writing the SQLSync state file.
 */
export class StateFile {
	private static readonly STATE_FILE_NAME = 'sqlsync-state.json';

	/**
	 * Reads the state file from the directory containing sqlsync.yaml.
	 * @param configDir The directory containing the sqlsync.yaml configuration file.
	 * @returns StateFileDetails indicating if the file exists and its contents.
	 */
	public static read(configDir: string): StateFileDetails {
		const stateFilePath = path.join(configDir, StateFile.STATE_FILE_NAME);
		try {
			if (fs.existsSync(stateFilePath)) {
				const contents = fs.readFileSync(stateFilePath, 'utf-8');
				return {
					fileExists: true,
					contents: contents,
				};
			} else {
				logger.info(
					`State file not found at ${stateFilePath}. Returning empty state.`
				);
				return {
					fileExists: false,
					contents: '',
				};
			}
		} catch (error: unknown) {
			logger.error(`Error reading state file from ${stateFilePath}:`, error);
			return {
				fileExists: false,
				contents: '',
			};
		}
	}

	/**
	 * Writes the state content to the state file in the directory containing sqlsync.yaml.
	 * @param configDir The directory containing the sqlsync.yaml configuration file.
	 * @param content The state content to write.
	 */
	public static write(configDir: string, content: string): void {
		const stateFilePath = path.join(configDir, StateFile.STATE_FILE_NAME);
		try {
			fs.writeFileSync(stateFilePath, content, 'utf-8');
			logger.success(`Successfully wrote state to ${stateFilePath}`);
		} catch (error: unknown) {
			logger.error(`Error writing state file to ${stateFilePath}:`, error);
			throw new Error(
				`Failed to write state file: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}
}
