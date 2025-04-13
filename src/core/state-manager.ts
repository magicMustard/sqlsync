import * as fs from 'fs';
import * as path from 'path';
import {
	SqlSyncState,
	SQLSYNC_STATE_VERSION,
	SQLSYNC_STATE_FILENAME,
	SQLSYNC_LOCAL_APPLIED_FILENAME,
	MigrationState,
	DeclarativeTableState,
} from '../types/state';
import { ProcessedSection, ProcessedSqlFile, ProcessedDirectory } from '../types/processed-sql';
import { getHash } from '../utils/crypto';
import { toRelativePath, toAbsolutePath } from '../utils/path-utils';
import { debug } from '../utils/debug';
import { normalizeSQL } from './sql-processor';

/**
 * Gets the absolute path for the state file based on the config file path.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @returns Absolute path to the sqlsync-state.json file.
 */
function getStateFilePath(configFilePath: string): string {
	return toAbsolutePath(configFilePath, SQLSYNC_STATE_FILENAME);
}

/**
 * Creates a default initial SqlSyncState object.
 * @returns A new SqlSyncState object with default values.
 */
function createInitialState(): SqlSyncState {
	return {
		version: SQLSYNC_STATE_VERSION,
		lastProductionMigration: null,
		migrationHistory: [],
		migrations: {},
		currentDeclarativeTables: {},
		currentFileChecksums: {},
		currentSplitStatementFiles: {},
	};
}

/**
 * Ensures a path is relative to the config directory
 * This function should be used before storing any path in state
 * @param configFilePath Absolute path to the config file
 * @param pathToNormalize Path to ensure is relative
 * @returns Path guaranteed to be relative to the config directory
 */
function ensureRelativePath(configFilePath: string, pathToNormalize: string): string {
	// If it's already a relative path, return it as is
	if (!path.isAbsolute(pathToNormalize)) {
		return pathToNormalize;
	}
	// Otherwise convert to relative
	return toRelativePath(configFilePath, pathToNormalize);
}

/**
 * Loads the unified state from sqlsync-state.json.
 * If the file doesn't exist or is invalid, returns a default initial state.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @returns The loaded or initial SqlSyncState.
 */
export function loadState(configFilePath: string): SqlSyncState {
	const stateFilePath = getStateFilePath(configFilePath);
	try {
		if (!fs.existsSync(stateFilePath)) {
			console.log(
				`State file not found at ${stateFilePath}. Initializing default state.`
			);
			return createInitialState();
		}

		const fileContents = fs.readFileSync(stateFilePath, 'utf8');
		const state = JSON.parse(fileContents) as SqlSyncState;

		if (!state.version || state.version !== SQLSYNC_STATE_VERSION) {
			console.warn(
				`State file ${stateFilePath} has version ${state.version || 'unknown'}, expected ${SQLSYNC_STATE_VERSION}. Attempting to use, but migration might be needed.`
			);
			if (
				!state.migrationHistory ||
				!state.migrations ||
				!state.currentDeclarativeTables
			) {
				console.error(
					`State file ${stateFilePath} is missing essential fields. Re-initializing default state.`
				);
				return createInitialState();
			}
			state.version = SQLSYNC_STATE_VERSION;
		}

		// Normalize paths in the loaded state - REMOVED: Paths are already stored relative
		// state.migrationHistory = state.migrationHistory.map((migration) =>
		// 	toRelativePath(configFilePath, migration)
		// );
		// state.migrations = Object.fromEntries(
		// 	Object.entries(state.migrations).map(([key, value]) => [
		// 		toRelativePath(configFilePath, key),
		// 		value,
		// 	])
		// );
		// state.currentDeclarativeTables = Object.fromEntries(
		// 	Object.entries(state.currentDeclarativeTables).map(([key, value]) => [
		// 		toRelativePath(configFilePath, key),
		// 		value,
		// 	])
		// );
		// state.currentFileChecksums = Object.fromEntries(
		// 	Object.entries(state.currentFileChecksums).map(([key, value]) => [
		// 		toRelativePath(configFilePath, key),
		// 		value,
		// 	])
		// );

		console.log(`Loaded state (v${state.version}) from ${stateFilePath}`);
		return state;
	} catch (error: any) {
		console.error(
			`Error loading or parsing state file ${stateFilePath}:`,
			error
		);
		console.log('Initializing default state due to error.');
		return createInitialState();
	}
}

/**
 * Saves the current unified state to the state file.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @param newState An object containing the state components to update/save.
 */
export function saveState(
	newState: {
		migrationFilename: string;
		migrationState: MigrationState;
		currentDeclarativeTables: Record<string, DeclarativeTableState>;
		currentFileChecksums: Record<string, string>;
		processedFiles: Record<string, ProcessedSqlFile>;
	},
	configFilePath: string
): void {
	const stateFilePath = getStateFilePath(configFilePath);
	debug(`Attempting to save state to: ${stateFilePath}`, 'verbose');

	// Load existing state or get initial state
	const currentState = loadState(configFilePath); // Load the *previous* state

	// Create a deep copy to avoid modifying the original object directly
	const stateToSave = JSON.parse(JSON.stringify(currentState)) as SqlSyncState;

	// --- Update state based on newState --- START ---
	stateToSave.version = SQLSYNC_STATE_VERSION; // Ensure version is current

	// Add new migration to history if it's not already there
	if (!stateToSave.migrationHistory.includes(newState.migrationFilename)) {
		stateToSave.migrationHistory.push(newState.migrationFilename);
	}
	// Update or add the state for this specific migration
	stateToSave.migrations[newState.migrationFilename] = newState.migrationState;

	// Overwrite the current maps with the latest data from the migration
	stateToSave.currentDeclarativeTables = newState.currentDeclarativeTables;
	stateToSave.currentFileChecksums = newState.currentFileChecksums;

	// Check if newState.processedFiles exists and has keys before updating
	if (newState.processedFiles && Object.keys(newState.processedFiles).length > 0) {
		debug('Populating currentSplitStatementFiles from new processedFiles', 'verbose');
		stateToSave.currentSplitStatementFiles = {}; // Clear previous map
		for (const [filePath, processedFile] of Object.entries(newState.processedFiles)) {
			if (!processedFile.declarativeTable && processedFile.splitStatements) {
				stateToSave.currentSplitStatementFiles[filePath] = processedFile.statements;
			}
		}
	} else {
		debug('Skipping population of currentSplitStatementFiles (no new processedFiles provided)', 'verbose');
	}
	// --- Update state based on newState --- END ---

	// Ensure all file paths stored in the state are relative to the config file
	debug('Normalizing paths in state before saving...', 'verbose');

	stateToSave.migrationHistory = stateToSave.migrationHistory.map((migration) =>
		ensureRelativePath(configFilePath, migration)
	);

	stateToSave.migrations = Object.fromEntries(
		Object.entries(stateToSave.migrations).map(([key, value]) => [
			ensureRelativePath(configFilePath, key),
			value,
		])
	);

	stateToSave.currentDeclarativeTables = Object.fromEntries(
		Object.entries(stateToSave.currentDeclarativeTables).map(([key, value]) => [
			ensureRelativePath(configFilePath, key),
			value,
		])
	);

	stateToSave.currentFileChecksums = Object.fromEntries(
		Object.entries(stateToSave.currentFileChecksums).map(([key, value]) => [
			ensureRelativePath(configFilePath, key),
			value,
		])
	);

	stateToSave.currentSplitStatementFiles = Object.fromEntries(
		Object.entries(stateToSave.currentSplitStatementFiles || {}).map(([key, value]) => [
			ensureRelativePath(configFilePath, key), // Ensure key is relative
			value,
		])
	);

	// Create directory if it doesn't exist
	const stateFileDir = path.dirname(stateFilePath);
	if (!fs.existsSync(stateFileDir)) {
		fs.mkdirSync(stateFileDir, { recursive: true });
	}

	// Write the state file
	fs.writeFileSync(stateFilePath, JSON.stringify(stateToSave, null, 2));
	console.log(`Saved state (v${stateToSave.version}) to ${stateFilePath}`);
}

/**
 * Gets the absolute path for the local applied migrations file.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @returns Absolute path to the .sqlsync-local-applied.txt file.
 */
function getLocalAppliedFilePath(configFilePath: string): string {
	return toAbsolutePath(configFilePath, SQLSYNC_LOCAL_APPLIED_FILENAME);
}

/**
 * Loads the list of locally applied migration filenames from .sqlsync-local-applied.txt.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @returns An array of migration filenames, or an empty array if the file doesn't exist or is empty.
 */
export function loadLocalAppliedMigrations(configFilePath: string): string[] {
	const filePath = getLocalAppliedFilePath(configFilePath);
	try {
		if (!fs.existsSync(filePath)) {
			return []; // No file means no migrations applied locally yet
		}
		const fileContents = fs.readFileSync(filePath, 'utf8');
		const migrations = fileContents
			.split(/\r?\n/) // Split by newline, handling Windows/Unix endings
			.map((line) => line.trim())
			.filter((line) => line.length > 0); // Remove empty lines
		console.log(`Loaded ${migrations.length} locally applied migrations from ${filePath}`);
		return migrations;
	} catch (error: any) {
		console.error(
			`Error loading local applied migrations file ${filePath}:`,
			error
		);
		// Return empty array on error to allow sync process to potentially continue
		return [];
	}
}

/**
 * Saves the list of locally applied migration filenames to .sqlsync-local-applied.txt.
 * Overwrites the existing file content.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @param appliedMigrations An array of migration filenames that have been applied locally.
 */
export function saveLocalAppliedMigrations(
	configFilePath: string,
	appliedMigrations: string[]
): void {
	const filePath = getLocalAppliedFilePath(configFilePath);
	console.log(`[DEBUG] Attempting to save local applied migrations to: ${filePath}`);
	console.log(`[DEBUG] Number of migrations to save: ${appliedMigrations.length}`);
	if (appliedMigrations.length > 0) {
		console.log(`[DEBUG] First migration filename: ${appliedMigrations[0]}`);
	}

	try {
		// Create directory if it doesn't exist
		const dirPath = path.dirname(filePath);
		if (!fs.existsSync(dirPath)) {
			console.log(`[DEBUG] Creating directory: ${dirPath}`);
			fs.mkdirSync(dirPath, { recursive: true });
		}

		// Join with newline and add a trailing newline for consistency
		const fileContents = appliedMigrations.join('\n') + (appliedMigrations.length > 0 ? '\n' : '');
		console.log(`[DEBUG] File contents to write: ${fileContents.substring(0, 100)}${fileContents.length > 100 ? '...' : ''}`);

		fs.writeFileSync(filePath, fileContents, 'utf8');
		console.log(`Saved ${appliedMigrations.length} locally applied migrations to ${filePath}`);
	} catch (error: any) {
		console.error(
			`Error saving local applied migrations file ${filePath}:`,
			error
		);
		throw new Error(
			`Failed to save local applied migrations to ${filePath}`
		);
	}
}

/**
 * Creates a flat map of file paths to ProcessedSqlFile objects from ProcessedSection array.
 */
export function buildProcessedFilesMap(sections: ProcessedSection[]): Record<string, ProcessedSqlFile> {
	const map: Record<string, ProcessedSqlFile> = {};
	sections.forEach(section => {
		section.items.forEach(item => {
			if ('files' in item) { // It's a ProcessedDirectory
				item.files.forEach(file => {
					map[file.filePath] = file;
				});
			} else { // It's a ProcessedSqlFile
				map[item.filePath] = item;
			}
		});
	});
	return map;
}

/**
 * Adds a new migration to the state and saves it.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @param migrationName Name of the migration file (e.g., "20240101000000_initial.sql")
 * @param migrationState The state to add for this migration.
 * @param newFileChecksums The latest currentFileChecksums to save.
 * @param newDeclarativeTables The latest currentDeclarativeTables to save.
 * @param processedFilesMap Map of all processed files from the current run.
 */
export function updateStateAfterMigration(
	configFilePath: string,
	migrationName: string,
	migrationState: MigrationState,
	newFileChecksums: { [filePath: string]: string },
	newDeclarativeTables: { [sourceFilePath: string]: DeclarativeTableState },
	processedFilesMap: Record<string, ProcessedSqlFile>
): void {
	debug(`Attempting to save migration state for: ${migrationName}`);
	const state = loadState(configFilePath);

	// Ensure migration history is initialized
	if (!Array.isArray(state.migrationHistory)) {
		state.migrationHistory = [];
	}

	// Add migration to history if it's not already there
	if (!state.migrationHistory.includes(migrationName)) {
		state.migrationHistory.push(migrationName);
		debug(`Added ${migrationName} to migration history`);
	} else {
		debug(`${migrationName} already exists in migration history.`);
	}

	// Add the specific state for this migration
	state.migrations[migrationName] = {
		...migrationState,
		createdAt: new Date().toISOString(), // Add timestamp
	};
	debug(`Added migration state entry for ${migrationName}`);

	// Update the top-level current checksums and tables
	state.currentFileChecksums = newFileChecksums;
	state.currentDeclarativeTables = newDeclarativeTables;
	debug(`Updated currentFileChecksums with ${Object.keys(newFileChecksums).length} entries`);
	debug(`Updated currentDeclarativeTables with ${Object.keys(newDeclarativeTables).length} entries`);

	// Save the updated state
	saveState(
		{
			migrationFilename: migrationName,
			migrationState: state.migrations[migrationName],
			currentDeclarativeTables: state.currentDeclarativeTables, // Pass existing
			currentFileChecksums: state.currentFileChecksums, // Pass existing
			processedFiles: processedFilesMap, // Pass the map from the generate command
		},
		configFilePath
	);
}
