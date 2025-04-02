import * as fs from 'fs';
import * as path from 'path';
import { ProcessedSection } from '@/types/processed-sql';

const STATE_FILENAME = 'sqlsync-state.json';

/**
 * Gets the absolute path for the state file based on the config file path.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @returns Absolute path to the sqlsync-state.json file.
 */
function getStateFilePath(configFilePath: string): string {
	const configDir = path.dirname(configFilePath);
	return path.join(configDir, STATE_FILENAME);
}

/**
 * Loads the previously saved state from sqlsync-state.json.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @returns The loaded ProcessedSection array, or null if the state file doesn't exist.
 */
export function loadState(configFilePath: string): ProcessedSection[] | null {
	const stateFilePath = getStateFilePath(configFilePath);
	try {
		if (!fs.existsSync(stateFilePath)) {
			console.log(
				`State file not found at ${stateFilePath}, assuming initial state.`
			);
			return null;
		}
		const fileContents = fs.readFileSync(stateFilePath, 'utf8');
		// TODO: Add validation (e.g., with Zod) to ensure the loaded state matches the expected structure.
		const state = JSON.parse(fileContents) as ProcessedSection[];
		console.log(`Loaded previous state from ${stateFilePath}`);
		return state;
	} catch (error: any) {
		console.error(`Error loading state file ${stateFilePath}:`, error);
		// Decide how to handle errors - maybe throw, maybe return null?
		// For now, let's treat load errors as if there's no previous state.
		return null;
	}
}

/**
 * Saves the current processed state to sqlsync-state.json.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @param state The ProcessedSection array representing the current state.
 */
export function saveState(
	configFilePath: string,
	state: ProcessedSection[]
): void {
	const stateFilePath = getStateFilePath(configFilePath);
	try {
		const stateJson = JSON.stringify(state, null, 2); // Pretty-print JSON
		fs.writeFileSync(stateFilePath, stateJson, 'utf8');
		console.log(`Saved current state to ${stateFilePath}`);
	} catch (error: any) {
		// Handle potential write errors (e.g., permissions)
		console.error(`Error saving state file ${stateFilePath}:`, error);
		throw new Error(`Failed to save state to ${stateFilePath}`); // Re-throw to signal failure
	}
}
