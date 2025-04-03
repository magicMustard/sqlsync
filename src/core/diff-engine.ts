import {
	ProcessedSection,
	ProcessedSqlFile,
	ProcessedStatement,
} from '../types/processed-sql';
import { SqlSyncState, DeclarativeTableState } from '../types/state';
import path from 'path';
import { debug } from '../utils/debug';
import { toRelativePath, toAbsolutePath } from '../utils/path-utils';
import { getHash } from '../utils/crypto';

/**
 * Represents changes to a specific file between two states
 */
export interface FileChange {
	type: 'added' | 'deleted' | 'modified' | 'unmodified';
	filePath: string;
	// Use more specific types based on whether it's declarative or not
	previous?: ProcessedSqlFile | DeclarativeTableState; // Previous state (parsed table or generic file info)
	current?: ProcessedSqlFile | DeclarativeTableState; // Current state (parsed table or generic file info)
	statementChanges?: StatementChange[]; // Details if type is 'modified' (for non-declarative)
}

/**
 * Represents changes within a single statement
 */
export interface StatementChange {
	type: 'added' | 'deleted' | 'modified' | 'unmodified';
	previous?: ProcessedStatement; // Present if modified or deleted
	current?: ProcessedStatement; // Present if modified or added
}

/**
 * Represents the overall state difference between two states
 */
export interface StateDifference {
	// Could add section-level changes later if needed
	fileChanges: FileChange[];
}

/**
 * Compares the previous recorded state (SqlSyncState) and the current processed SQL files
 * to find differences.
 *
 * @param sqlSyncState The state loaded from sqlsync-state.json.
 * @param currentStateSections The newly generated state from traversing directories.
 * @param configPath Path to the config file
 * @returns A StateDifference object detailing the changes.
 */
export function diffStates(
	sqlSyncState: SqlSyncState,
	currentStateSections: ProcessedSection[],
	configPath?: string
): StateDifference {
	debug('diffStates starting', 'basic');
	debug(`State has ${Object.keys(sqlSyncState.currentFileChecksums).length} file checksums`, 'verbose');
	debug(`Received ${currentStateSections.length} processed sections`, 'verbose');
	debug(`Config path provided: ${configPath || 'No'}`, 'verbose');
	
	// Track all the files we've seen in the current run
	const currentFiles = new Set<string>();
	
	// Track all file changes
	const fileChanges: FileChange[] = [];
	
	// Helper map for current files
	const currentFilesMap = new Map<string, ProcessedSqlFile>();
	currentStateSections.forEach((section) => {
		section.items.forEach((item) => {
			if ('files' in item) {
				item.files.forEach((file) => {
					// IMPORTANT: Always convert absolute paths to relative paths for consistent comparison
					let relativePath = file.filePath;
					
					// Only convert if we have an absolute path and a config path
					if (file.filePath.startsWith('/') && configPath) {
						relativePath = toRelativePath(configPath, file.filePath);
						debug(`Converting path: ${file.filePath} -> ${relativePath}`, 'verbose');
					}
					
					// Store using the relative path
					const fileWithRelativePath = {
						...file,
						filePath: relativePath
					};
					
					currentFilesMap.set(relativePath, fileWithRelativePath);
				});
			} // else: handle direct files if needed
		});
	});
	debug(`Found ${currentFilesMap.size} files in current processed sections`, 'verbose');
	
	// Combine keys from previous declarative tables and previous file checksums
	// to represent all files known in the previous state.
	const previousFilePaths = new Set([
		...Object.keys(sqlSyncState.currentDeclarativeTables),
		...Object.keys(sqlSyncState.currentFileChecksums),
	]);

	// --- Identify Added and Modified Files ---
	for (const [filePath, currentFile] of currentFilesMap.entries()) {
		const previousDeclarativeState = sqlSyncState.currentDeclarativeTables[filePath];
		const previousRawChecksum = sqlSyncState.currentFileChecksums[filePath];
		
		debug(`Checking file: ${filePath}`, 'basic');
		debug(`  Previous declarative state: ${previousDeclarativeState ? 'Yes' : 'No'}`, 'verbose');
		debug(`  Previous raw checksum: ${previousRawChecksum ? previousRawChecksum.substring(0, 8) + '...' : 'None'}`, 'verbose');
		debug(`  Current checksum: ${currentFile.rawFileChecksum ? currentFile.rawFileChecksum.substring(0, 8) + '...' : 'None'}`, 'verbose');
		
		// This file has been seen in the current run
		currentFiles.add(filePath);
		
		if (!previousDeclarativeState && !previousRawChecksum) {
			// File is completely new (not in declarative state or checksum list)
			debug(`  Result: ADDED (new file)`, 'basic');
			fileChanges.push({ type: 'added', filePath, current: currentFile });
		} else {
			// File exists in some form in the previous state
			let changeDetected = false;
			let previousStateForChange: ProcessedSqlFile | DeclarativeTableState | undefined;

			if (currentFile.declarativeTable) {
				// Current file IS declarative
				if (!previousDeclarativeState) {
					// Newly became declarative or was previously non-declarative
					debug(`  Result: MODIFIED (newly became declarative)`, 'basic');
					changeDetected = true;
					// If previous was non-declarative, maybe capture that state?
					// For now, treat as simple modification/addition context.
				} else if (
					currentFile.statements.length > 0 &&
					previousDeclarativeState.rawStatementChecksum !==
						currentFile.statements[0].checksum
				) {
					// Declarative table content changed (based on statement checksum)
					debug(`  Result: MODIFIED (declarative table content changed)`, 'basic');
					debug(`    Previous checksum: ${previousDeclarativeState.rawStatementChecksum.substring(0, 8)}...`, 'verbose');
					debug(`    Current checksum: ${currentFile.statements[0].checksum.substring(0, 8)}...`, 'verbose');
					changeDetected = true;
					previousStateForChange = previousDeclarativeState;
				} else {
					debug(`  Result: UNMODIFIED (declarative table unchanged)`, 'verbose');
				}
			} else {
				// Current file is NOT declarative
				if (previousDeclarativeState) {
					// Changed FROM declarative TO non-declarative
					debug(`  Result: MODIFIED (changed from declarative to non-declarative)`, 'basic');
					changeDetected = true;
					previousStateForChange = previousDeclarativeState;
				} else if (previousRawChecksum !== currentFile.rawFileChecksum) {
					// Non-declarative file content changed (based on raw checksum)
					debug(`  Result: MODIFIED (non-declarative content changed)`, 'basic');
					debug(`    Previous checksum: ${previousRawChecksum.substring(0, 8)}...`, 'verbose');
					debug(`    Current checksum: ${currentFile.rawFileChecksum.substring(0, 8)}...`, 'verbose');
					changeDetected = true;
					// We don't have the previous ProcessedSqlFile structure here easily,
					// just the checksum. Mark as modified based on checksum diff.
					// previousStateForChange could potentially hold { checksum: previousRawChecksum } if needed.
				} else {
					debug(`  Result: UNMODIFIED (non-declarative file unchanged)`, 'verbose');
				}
			}

			if (changeDetected) {
				fileChanges.push({
					type: 'modified',
					filePath,
					previous: previousStateForChange, // Might be DeclarativeTableState or undefined
					current: currentFile,
					// Statement changes only relevant if non-declarative and we implement richer diff later
					// statementChanges: currentFile.declarativeTable ? undefined : diffStatements(...)
				});
			}
		}
		// Remove from the set of known previous paths to find deletions
		previousFilePaths.delete(filePath);
	}

	// --- Identify Deleted Files ---
	// Find files that existed in the previous state but not in the current state
	previousFilePaths.forEach((filePath) => {
		if (!currentFilesMap.has(filePath)) {
			debug(`File deleted: ${filePath}`, 'basic');
			
			// Deleted file - need to capture what we know from the previous state
			const isDeclarative = !!sqlSyncState.currentDeclarativeTables[filePath];
			const previousState = isDeclarative
				? sqlSyncState.currentDeclarativeTables[filePath]
				: undefined;
			// We don't have much info about non-declarative files in previous state currently
			
			fileChanges.push({
				type: 'deleted',
				filePath,
				previous: previousState,
			});
		}
	});
	
	debug(`diffStates identified ${fileChanges.length} changed files`, 'basic');
	debug(`  Added: ${fileChanges.filter(fc => fc.type === 'added').length}`, 'verbose');
	debug(`  Modified: ${fileChanges.filter(fc => fc.type === 'modified').length}`, 'verbose');
	debug(`  Deleted: ${fileChanges.filter(fc => fc.type === 'deleted').length}`, 'verbose');

	return { fileChanges };
}

/**
 * Compares two arrays of statements (typically from the same file in different states)
 * based on their checksums.
 *
 * @param previousStatements Statements from the previous state.
 * @param currentStatements Statements from the current state.
 * @returns An array of StatementChange objects.
 */
function diffStatements(
	previousStatements: ProcessedStatement[],
	currentStatements: ProcessedStatement[]
): StatementChange[] {
	const changes: StatementChange[] = [];
	const previousStmtMap = new Map<string, ProcessedStatement>();
	const currentStmtMap = new Map<string, ProcessedStatement>();

	previousStatements.forEach((stmt) =>
		previousStmtMap.set(stmt.checksum, stmt)
	);
	currentStatements.forEach((stmt) => currentStmtMap.set(stmt.checksum, stmt));

	// Find modified and deleted statements
	for (const [checksum, previousStmt] of previousStmtMap.entries()) {
		if (!currentStmtMap.has(checksum)) {
			// Statement with this checksum is not in current state -> deleted or modified
			// For simplicity now, we mark as deleted. More complex diff could try to match based on sequence.
			changes.push({ type: 'deleted', previous: previousStmt });
		} else {
			// Statement exists in both -> unmodified
			changes.push({
				type: 'unmodified',
				previous: previousStmt,
				current: currentStmtMap.get(checksum)!,
			});
			// Remove from current map to find added statements later
			currentStmtMap.delete(checksum);
		}
	}

	// Find added statements
	// Any statements remaining in currentStmtMap are new
	for (const [checksum, currentStmt] of currentStmtMap.entries()) {
		changes.push({ type: 'added', current: currentStmt });
	}

	// TODO: Consider statement order changes? For now, checksum matching is primary.
	return changes;
}
