import * as fs from 'fs';
import * as path from 'path';
import {
	SqlSyncState,
	SQLSYNC_STATE_VERSION,
	SQLSYNC_STATE_FILENAME,
	SQLSYNC_LOCAL_APPLIED_FILENAME,
	MigrationState
} from '../types/state';
import { ProcessedSection } from '../types/processed-sql';
import { getHash } from '../utils/crypto';
import { toRelativePath, toAbsolutePath } from '../utils/path-utils';
import { debug } from '../utils/debug';

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
		currentFileChecksums: {}, // Initialize the new field
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

		// Normalize paths in the loaded state
		state.migrationHistory = state.migrationHistory.map((migration) =>
			toRelativePath(configFilePath, migration)
		);
		state.migrations = Object.fromEntries(
			Object.entries(state.migrations).map(([key, value]) => [
				toRelativePath(configFilePath, key),
				value,
			])
		);
		state.currentDeclarativeTables = Object.fromEntries(
			Object.entries(state.currentDeclarativeTables).map(([key, value]) => [
				toRelativePath(configFilePath, key),
				value,
			])
		);
		state.currentFileChecksums = Object.fromEntries(
			Object.entries(state.currentFileChecksums).map(([key, value]) => [
				toRelativePath(configFilePath, key),
				value,
			])
		);

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
 * @param state The state to save.
 * @throws Error if there's a problem saving the state.
 */
export function saveState(configFilePath: string, state: SqlSyncState): void {
	try {
		const stateFilePath = getStateFilePath(configFilePath);
		
		// Deep clone the state to avoid modifying the original
		const stateToSave = structuredClone(state);
		
		// Ensure all paths in the state are relative to the config directory
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
		
		// Create directory if it doesn't exist
		const stateFileDir = path.dirname(stateFilePath);
		if (!fs.existsSync(stateFileDir)) {
			fs.mkdirSync(stateFileDir, { recursive: true });
		}
		
		// Write the state file
		fs.writeFileSync(stateFilePath, JSON.stringify(stateToSave, null, 2));
		console.log(`Saved state (v${stateToSave.version}) to ${stateFilePath}`);
	} catch (error: any) {
		throw new Error(`Error saving state: ${error.message}`);
	}
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
 * Adds a new migration to the state and saves it.
 * @param configFilePath Absolute path to the sqlsync.yaml config file.
 * @param migrationName Name of the migration file (e.g., "20240101000000_initial.sql")
 * @param migrationContent The SQL content of the migration file.
 * @param migrationState The state to add for this migration.
 */
export function saveMigrationToState(
	configFilePath: string,
	migrationName: string,
	migrationContent: string,
	migrationState: MigrationState
): void {
	console.log(`\n[DEBUG] saveMigrationToState starting`);
	console.log(`[DEBUG] Migration filename: ${migrationName}`);
	console.log(`[DEBUG] Migration content length: ${migrationContent.length} bytes`);
	console.log(`[DEBUG] Migration state has ${migrationState.statements?.length || 0} statements`);
	
	// Load current state
	const state = loadState(configFilePath);
	console.log(`[DEBUG] Loaded state has ${Object.keys(state.currentFileChecksums).length} file checksums`);
	
	// Add migration name to history
	if (!state.migrationHistory.includes(migrationName)) {
		state.migrationHistory.push(migrationName);
		console.log(`[DEBUG] Added migration to history (now ${state.migrationHistory.length} migrations)`);
	} else {
		console.log(`[DEBUG] Migration already in history, will update its state`);
	}
	
	// Store the migration state
	// Ensure the migration name is relative
	const relativeMigrationName = ensureRelativePath(configFilePath, migrationName);
	state.migrations[relativeMigrationName] = {
		...migrationState,
		fileChecksum: getHash(migrationContent)
	};
	console.log(`[DEBUG] Saved migration state for ${relativeMigrationName}`);
	
	// Process declarative tables from this migration
	// This updates the current state of all tables based on the migration
	if (migrationState.declarativeTables && Object.keys(migrationState.declarativeTables).length > 0) {
		// Need to ensure these are stored with relative paths
		const declarativeTablesWithRelativePaths = Object.fromEntries(
			Object.entries(migrationState.declarativeTables).map(([filePath, tableState]) => [
				ensureRelativePath(configFilePath, filePath),
				tableState
			])
		);
		
		console.log(`[DEBUG] Processing ${Object.keys(declarativeTablesWithRelativePaths).length} declarative tables`);
		
		// Update the state with the relative path version
		Object.entries(declarativeTablesWithRelativePaths).forEach(([relativePath, tableState]) => {
			state.currentDeclarativeTables[relativePath] = tableState;
			console.log(`[DEBUG] Updated declarative table state for: ${relativePath}`);
			
			// Update the checksum for this file
			if (tableState.rawStatementChecksum) {
				state.currentFileChecksums[relativePath] = tableState.rawStatementChecksum;
				console.log(`[DEBUG]   - Updated checksum for declarative table: ${relativePath}`);
			}
		});
	} else {
		console.log(`[DEBUG] No declarative tables in this migration`);
	}
	
	// Update checksums for all statements in the migration
	// This ensures that regular SQL files (not just declarative tables) have their checksums tracked
	if (migrationState.statements && migrationState.statements.length > 0) {
		// Track which files we've seen to avoid duplicate updates
		const processedFilePaths = new Set<string>();
		
		console.log(`[DEBUG] Processing ${migrationState.statements.length} statements for checksums`);
		
		migrationState.statements.forEach((statement, idx) => {
			if (statement.filePath && statement.checksum) {
				// Ensure the path is relative to the config directory
				const relativePath = ensureRelativePath(configFilePath, statement.filePath);
				
				console.log(`[DEBUG] Statement ${idx + 1}: ${relativePath}`);
				
				// Only process each file once
				if (!processedFilePaths.has(relativePath)) {
					processedFilePaths.add(relativePath);
					console.log(`[DEBUG]   - First time seeing this file, will update checksum`);
					
					// For SQL files, use the file's raw checksum, not the statement checksum
					// This ensures files are properly tracked as "unchanged" in subsequent runs
					// Fetch the actual file content to generate a consistent checksum
					try {
						// Convert to absolute path ONLY for file I/O operations
						const absolutePath = toAbsolutePath(configFilePath, relativePath);
						if (fs.existsSync(absolutePath)) {
							const fileContent = fs.readFileSync(absolutePath, 'utf8');
							const newChecksum = getHash(fileContent);
							console.log(`[DEBUG]   - File exists, calculating new checksum: ${newChecksum.substring(0, 8)}...`);
							
							// Log old checksum if it exists
							if (state.currentFileChecksums[relativePath]) {
								console.log(`[DEBUG]   - Replacing old checksum: ${state.currentFileChecksums[relativePath].substring(0, 8)}...`);
							} else {
								console.log(`[DEBUG]   - No previous checksum exists for this file`);
							}
							
							// Store with relative path only
							state.currentFileChecksums[relativePath] = newChecksum;
							console.log(`- Updated checksum for file: ${relativePath}`);
						} else {
							// If file doesn't exist (e.g., it was deleted in the migration),
							// use the statement checksum as a fallback
							console.log(`[DEBUG]   - File doesn't exist, using statement checksum: ${statement.checksum.substring(0, 8)}...`);
							state.currentFileChecksums[relativePath] = statement.checksum;
							console.log(`- Updated checksum for non-existent file: ${relativePath}`);
						}
					} catch (error) {
						console.error(`Error updating checksum for ${relativePath}:`, error);
						// Use statement checksum as fallback if file can't be read
						state.currentFileChecksums[relativePath] = statement.checksum;
					}
				} else {
					console.log(`[DEBUG]   - Already processed this file, skipping duplicate update`);
				}
			} else {
				console.log(`[DEBUG]   - Statement missing filePath or checksum, skipping`);
			}
		});
	}
	
	// Save state changes
	saveState(configFilePath, state);
	console.log(`[DEBUG] Saved updated state with ${Object.keys(state.currentFileChecksums).length} file checksums`);
}
