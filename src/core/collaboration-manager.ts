import * as fs from 'fs/promises';
import * as path from 'path';
import { getHash } from '@/utils/crypto';
import { 
	EnhancedSqlSyncState, 
	MigrationInfo, 
	SyncResult,
	TrackedFileInfo
} from '@/types/collaboration';
import { ProcessedSection, ProcessedSqlFile } from '@/types/processed-sql';
import { logger } from '@/utils/logger';

// File name for the enhanced state
const ENHANCED_STATE_FILENAME = 'sqlsync-collaboration.json';

/**
 * Gets the absolute path for the enhanced state file
 */
function getEnhancedStateFilePath(configFilePath: string): string {
	const configDir = path.dirname(configFilePath);
	return path.join(configDir, ENHANCED_STATE_FILENAME);
}

/**
 * Loads the enhanced state file if it exists
 */
export async function loadEnhancedState(
	configFilePath: string
): Promise<EnhancedSqlSyncState | null> {
	const stateFilePath = getEnhancedStateFilePath(configFilePath);
	
	try {
		await fs.access(stateFilePath);
		const fileContents = await fs.readFile(stateFilePath, 'utf8');
		return JSON.parse(fileContents) as EnhancedSqlSyncState;
	} catch (error) {
		logger.info(`Enhanced state file not found at ${stateFilePath}, creating new one.`);
		return null;
	}
}

/**
 * Saves the enhanced state file
 */
export async function saveEnhancedState(
	configFilePath: string,
	state: EnhancedSqlSyncState
): Promise<void> {
	const stateFilePath = getEnhancedStateFilePath(configFilePath);
	state.lastUpdated = new Date().toISOString();
	
	try {
		await fs.writeFile(
			stateFilePath,
			JSON.stringify(state, null, 2),
			'utf8'
		);
		logger.info(`Enhanced state saved to ${stateFilePath}`);
	} catch (error) {
		logger.error(`Failed to save enhanced state: ${error}`);
		throw new Error(`Failed to save enhanced state: ${error}`);
	}
}

/**
 * Creates a new enhanced state or updates existing with current files
 */
export async function initializeEnhancedState(
	configFilePath: string,
	sections: ProcessedSection[]
): Promise<EnhancedSqlSyncState> {
	// Try to load existing state first
	const existingState = await loadEnhancedState(configFilePath);
	
	// Start with empty state if none exists
	const state: EnhancedSqlSyncState = existingState || {
		lastUpdated: new Date().toISOString(),
		files: {},
		migrations: [],
	};
	
	// Update with current files
	// This doesn't overwrite existing migration info, just adds any missing files
	for (const section of sections) {
		for (const item of section.items) {
			if ('files' in item) {
				// It's a directory
				for (const file of item.files) {
					updateFileInState(state, file);
				}
			} else {
				// It's a file directly in the section
				updateFileInState(state, item);
			}
		}
	}
	
	await saveEnhancedState(configFilePath, state);
	return state;
}

/**
 * Updates a file in the enhanced state without overwriting migration info
 */
function updateFileInState(
	state: EnhancedSqlSyncState,
	file: ProcessedSqlFile
): void {
	// Only add if not already tracked
	if (!state.files[file.filePath]) {
		const fileInfo: TrackedFileInfo = {
			checksum: file.rawFileChecksum,
			lastModifiedBy: 'initialization',
		};
		
		// Add statements if this is a split statements file
		if (file.splitStatements && file.statements.length > 0) {
			fileInfo.statements = file.statements.map(stmt => ({
				checksum: stmt.checksum,
				lastModifiedBy: null,
			}));
		}
		
		state.files[file.filePath] = fileInfo;
	}
}

/**
 * Scans the migrations directory and compares with state
 * to identify new migrations and conflicts
 */
export async function syncMigrations(
	configFilePath: string,
	migrationsDir: string,
	currentState: EnhancedSqlSyncState
): Promise<SyncResult> {
	const result: SyncResult = {
		newMigrations: [],
		pendingChanges: [],
		conflicts: [],
	};
	
	// Get list of migration files
	const migrationFiles = await fs.readdir(migrationsDir);
	
	// Find migrations not in the state
	const existingMigrationNames = new Set(
		currentState.migrations.map(m => m.name)
	);
	
	for (const migrationFile of migrationFiles) {
		if (!existingMigrationNames.has(migrationFile)) {
			// New migration found
			const migrationPath = path.join(migrationsDir, migrationFile);
			const content = await fs.readFile(migrationPath, 'utf8');
			
			// Parse migration metadata from comments
			// Example format: -- Affects: schema/users.sql, schema/roles.sql
			const affectedFilesMatch = content.match(
				/-- Affects: ([^\n]+)/
			);
			
			const migrationInfo: MigrationInfo = {
				name: migrationFile,
				timestamp: new Date().toISOString(),
				appliedChanges: affectedFilesMatch 
					? affectedFilesMatch[1].split(',').map(s => s.trim())
					: [],
			};
			
			result.newMigrations.push(migrationInfo);
			
			// Check for conflicts
			for (const affectedFile of migrationInfo.appliedChanges) {
				const fileInfo = currentState.files[affectedFile];
				if (fileInfo && fileInfo.lastModifiedBy !== 'initialization') {
					// Another migration already modified this file
					result.conflicts.push({
						file: affectedFile,
						migrations: [fileInfo.lastModifiedBy, migrationFile],
						description: 'Multiple migrations modify the same file',
					});
				}
			}
		}
	}
	
	// Update state with new migrations
	if (result.newMigrations.length > 0) {
		currentState.migrations.push(...result.newMigrations);
		
		// Update file references
		for (const migration of result.newMigrations) {
			for (const filePath of migration.appliedChanges) {
				if (currentState.files[filePath]) {
					currentState.files[filePath].lastModifiedBy = migration.name;
				}
			}
		}
		
		await saveEnhancedState(configFilePath, currentState);
	}
	
	return result;
}

/**
 * Checks for files that have changed but don't have a corresponding migration
 */
export async function detectPendingChanges(
	sections: ProcessedSection[],
	currentState: EnhancedSqlSyncState
): Promise<string[]> {
	const pendingChanges: string[] = [];
	
	for (const section of sections) {
		for (const item of section.items) {
			if ('files' in item) {
				// It's a directory
				for (const file of item.files) {
					checkFileForChanges(file, currentState, pendingChanges);
				}
			} else {
				// It's a file directly in the section
				checkFileForChanges(item, currentState, pendingChanges);
			}
		}
	}
	
	return pendingChanges;
}

/**
 * Checks if a file has changes compared to the state
 */
function checkFileForChanges(
	file: ProcessedSqlFile,
	state: EnhancedSqlSyncState,
	pendingChanges: string[]
): void {
	const trackedFile = state.files[file.filePath];
	
	if (!trackedFile) {
		// New file
		pendingChanges.push(file.filePath);
		return;
	}
	
	if (trackedFile.checksum !== file.rawFileChecksum) {
		// File content changed
		pendingChanges.push(file.filePath);
		return;
	}
	
	// For split statements files, check individual statements
	if (
		file.splitStatements &&
		trackedFile.statements &&
		file.statements.length > 0
	) {
		const trackedStmtChecksums = new Set(
			trackedFile.statements.map(s => s.checksum)
		);
		
		for (const stmt of file.statements) {
			if (!trackedStmtChecksums.has(stmt.checksum)) {
				// New or changed statement
				pendingChanges.push(`${file.filePath}#statement`);
				break;
			}
		}
	}
}
