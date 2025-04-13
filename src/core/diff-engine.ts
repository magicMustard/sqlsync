import {
	ProcessedSection,
	ProcessedSqlFile,
	ProcessedStatement,
	ProcessedDirectory,
} from '../types/processed-sql';
import { SqlSyncState, DeclarativeTableState } from '../types/state';
import path from 'path';
import { toRelativePath, toAbsolutePath } from '../utils/path-utils';
import { getHash } from '../utils/crypto';
import { debug } from '../utils/debug';
import { diffTableDefinitions, AlterTableOperation } from './schema-differ';

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
	debug("\n===== STARTING STATE COMPARISON =====", 'verbose');
	
	// Track all the files we've seen in the current run
	const currentFiles = new Set<string>();
	
	// Track all file changes
	const fileChanges: FileChange[] = [];
	
	// Create a map for efficient lookup of current files
	const currentFilesMap = new Map<string, ProcessedSqlFile>();
	currentStateSections.forEach((section: ProcessedSection) => {
		section.items.forEach((item: ProcessedSqlFile | ProcessedDirectory) => {
			if ('files' in item) { // It's a ProcessedDirectory
				item.files.forEach((file: ProcessedSqlFile) => {
					currentFilesMap.set(file.filePath, file);
				});
			} else { // It's a ProcessedSqlFile
				const file = item as ProcessedSqlFile;
				currentFilesMap.set(file.filePath, file);
			}
		});
	});
	debug(`\nBuilding current files map from ${currentStateSections.length} sections`, 'verbose');
	debug(`Current file map has ${currentFilesMap.size} files`, 'verbose');
	debug(`Previous state has ${Object.keys(sqlSyncState.currentFileChecksums).length} file checksums`, 'verbose');
	
	// Combine keys from previous declarative tables and previous file checksums
	// from the SqlSyncState to represent all files known in the previous state.
	const previousFilePaths = new Set([
		...Object.keys(sqlSyncState.currentDeclarativeTables),
		...Object.keys(sqlSyncState.currentFileChecksums),
	]);

	// --- Identify Added and Modified Files ---
	debug("\nAnalyzing files for changes...", 'verbose');
	
	for (const [filePath, currentFile] of currentFilesMap.entries()) {
		// ** CORRECTED **: Read directly from SqlSyncState fields
		const previousDeclarativeState = sqlSyncState.currentDeclarativeTables[filePath];
		const previousRawChecksum = sqlSyncState.currentFileChecksums[filePath];
		
		debug(`\nExamining file: ${filePath}`, 'verbose');
		debug(`  Current checksum: ${currentFile.rawFileChecksum || 'N/A'}`, 'verbose');
		debug(`  Previous checksum: ${previousRawChecksum || 'N/A'}`, 'verbose');
		
		// This file has been seen in the current run
		currentFiles.add(filePath);
		
		if (!previousDeclarativeState && !previousRawChecksum) {
			// File is completely new (not in declarative state or checksum list)
			debug(`➕ ADDED FILE DETECTED: ${filePath} (Not in previous state)`, 'verbose');
			fileChanges.push({ type: 'added', filePath, current: currentFile });
		} else {
			// File exists in some form in the previous state
			let changeDetected = false;
			let previousStateForChange: DeclarativeTableState | undefined;
			let statementChanges: StatementChange[] | undefined = undefined; // Declare here

			if (currentFile.declarativeTable) {
				// Current file IS declarative
				if (!previousDeclarativeState) {
					// Newly became declarative or was previously non-declarative
					debug(`✅ MODIFIED FILE DETECTED: ${filePath} (Newly became declarative)`, 'verbose');
					changeDetected = true;
					// If previous was non-declarative, its checksum was stored in currentFileChecksums
					// We don't capture the full previous non-declarative state here, just mark modified.
				} else {
					// Compare parsed structures instead of just checksums
					// Ensure both structures exist before diffing
					if (!previousDeclarativeState.parsedStructure) {
						debug(`⚠️ WARNING: Previous declarative state for ${filePath} missing parsedStructure`, 'verbose');
					}
					if (!currentFile.tableDefinition) {
						debug(`⚠️ WARNING: Current declarative file ${filePath} missing tableDefinition`, 'verbose');
					}

					// Only diff if both structures are present
					if (previousDeclarativeState.parsedStructure && currentFile.tableDefinition) {
						const structuralChanges = diffTableDefinitions(
							previousDeclarativeState.parsedStructure,
							currentFile.tableDefinition
						);

						if (structuralChanges.length > 0) {
							// Declarative table structure changed
							debug(`✅ MODIFIED FILE DETECTED: ${filePath} (Declarative table structure changed)`, 'verbose');
							// Ensure type safety when logging newColumnName
							structuralChanges.forEach(op => {
								let logMsg = `   - Detected op: ${op.type} ${op.columnName}`;
								if (op.type === 'RENAME_COLUMN') {
									logMsg += ` -> ${op.newColumnName}`;
								}
								debug(logMsg, 'verbose');
							});
							changeDetected = true;
							previousStateForChange = previousDeclarativeState;
						} else {
							// Structure is the same, check if only comments/whitespace changed (via raw checksum)
							// If the raw checksum changed BUT the structure didn't, it's technically modified,
							// but the migration generator might skip it later if no SQL ops are needed.
							// Let's keep the original raw checksum check for this subtle case.
							if (previousRawChecksum !== currentFile.rawFileChecksum) {
								debug(`✅ MODIFIED FILE DETECTED: ${filePath} (Declarative table raw content changed, but structure identical)`, 'verbose');
								debug(`  Previous raw checksum: ${previousRawChecksum ? previousRawChecksum.substring(0, 8) + '...' : 'N/A'}`, 'verbose');
								debug(`  Current raw checksum  : ${currentFile.rawFileChecksum ? currentFile.rawFileChecksum.substring(0, 8) + '...' : 'N/A'}`, 'verbose');
								changeDetected = true; // Mark as modified so state checksum updates
								previousStateForChange = previousDeclarativeState; // Keep previous state for context
							} else {
								debug(`⏭️ UNCHANGED FILE: ${filePath} (Declarative table structure and raw content unchanged)`, 'verbose');
							}
						}
					} else {
						// Handle cases where one or both structures might be missing (e.g., parse error)
						// Fallback to raw checksum comparison if structures can't be compared reliably
						if (previousRawChecksum !== currentFile.rawFileChecksum) {
							debug(`✅ MODIFIED FILE DETECTED: ${filePath} (Declarative table raw content changed, structure comparison skipped)`, 'verbose');
							changeDetected = true;
							previousStateForChange = previousDeclarativeState;
						} else {
							debug(`⏭️ UNCHANGED FILE: ${filePath} (Declarative table raw content unchanged, structure comparison skipped)`, 'verbose');
						}
					}
				}
			} else {
				// Current file is NOT declarative
				if (previousDeclarativeState) {
					// Changed FROM declarative TO non-declarative
					debug(`✅ MODIFIED FILE DETECTED: ${filePath} (Changed from declarative to non-declarative)`, 'verbose');
					changeDetected = true;
					previousStateForChange = previousDeclarativeState;
				// ** CORRECTED **: Compare current raw checksum against the previous raw checksum from state
				} else if (previousRawChecksum !== currentFile.rawFileChecksum) {
					// Non-declarative file content changed (based on raw checksum)
					debug(`✅ MODIFIED FILE DETECTED: ${filePath} (Non-declarative raw content changed)`, 'verbose');
					debug(`  Previous raw checksum: ${previousRawChecksum ? previousRawChecksum.substring(0, 8) + '...' : 'N/A'}`, 'verbose');
					debug(`  Current raw checksum  : ${currentFile.rawFileChecksum ? currentFile.rawFileChecksum.substring(0, 8) + '...' : 'N/A'}`, 'verbose');
					changeDetected = true;

					// --- ADDED: Handle statement diffing if splitStatements is true --- 
					if (currentFile.splitStatements) {
						debug(`    splitStatements is true, attempting statement diff...`, 'verbose');
						const previousStatements = sqlSyncState.currentSplitStatementFiles?.[filePath];
						if (previousStatements) {
							debug(`    Found ${previousStatements.length} previous statements in state.`, 'verbose');
							statementChanges = diffStatements(previousStatements, currentFile.statements);
							debug(`    Detected ${statementChanges.length} statement changes.`, 'verbose');
						} else {
							// If no previous statements found (e.g., first run with splitStatements), treat all current as added
							debug(`    No previous statements found in state for ${filePath}. Treating all current statements as added.`, 'verbose');
							statementChanges = currentFile.statements.map(stmt => ({ type: 'added', current: stmt }));
						}
					} else {
						debug(`    splitStatements is false, skipping statement diff.`, 'verbose');
					}
					// --- END ADDED --- 

					// We don't capture the full previous non-declarative state here, just the checksum difference.
					// previousStateForChange remains undefined for non-declarative -> non-declarative changes.
				} else {
					debug(`⏭️ UNCHANGED FILE: ${filePath} (Non-declarative file unchanged)`, 'verbose');
				}
			}

			if (changeDetected) {
				fileChanges.push({
					type: 'modified',
					filePath,
					previous: previousStateForChange,
					current: currentFile,
					// Include statement changes if they were calculated
					statementChanges: statementChanges,
				});
			}
		}
	}

	// --- Identify Deleted Files ---
	// Any files remaining in previousFilePaths were not found in the current run
	for (const filePath of previousFilePaths) {
		if (!currentFiles.has(filePath)) {
			debug(`➖ DELETED FILE DETECTED: ${filePath} (In previous state but not current)`, 'verbose');
			
			// Deleted file - need to capture what we know from the previous state
			// ** CORRECTED **: Read directly from SqlSyncState fields
			const isDeclarative = !!sqlSyncState.currentDeclarativeTables[filePath];
			const previousState = isDeclarative
				? sqlSyncState.currentDeclarativeTables[filePath]
				: undefined;

			fileChanges.push({
				type: 'deleted',
				filePath,
				previous: previousState,
			});
		}
	}
	
	debug(`\nFile changes summary:`, 'verbose');
	debug(`  - Total changes: ${fileChanges.length}`, 'verbose');
	debug(`  - Added: ${fileChanges.filter(fc => fc.type === 'added').length}`, 'verbose');
	debug(`  - Modified: ${fileChanges.filter(fc => fc.type === 'modified').length}`, 'verbose');
	debug(`  - Deleted: ${fileChanges.filter(fc => fc.type === 'deleted').length}`, 'verbose');
	
	if (fileChanges.filter(fc => fc.type === 'modified').length > 0) {
		debug(`Modified files list:`, 'verbose');
		fileChanges.filter(fc => fc.type === 'modified').forEach((change, idx) => {
			debug(`  ${idx + 1}. ${change.filePath}`, 'verbose');
		});
	}
	
	debug("\n===== STATE COMPARISON COMPLETE =====\n", 'verbose');
	
	return { fileChanges };
}

/**
 * Compares two SQL files by their normalized content to determine if actual SQL content 
 * has changed, ignoring comments and whitespace differences.
 * 
 * @param file1 First ProcessedSqlFile to compare
 * @param file2 Second ProcessedSqlFile to compare
 * @returns True if the actual SQL content is different, false if only comments or whitespace changed
 */
export function compareFilesByNormalizedContent(
  file1: ProcessedSqlFile,
  file2: ProcessedSqlFile
): boolean {
  // If either file lacks a normalized checksum, fall back to comparing raw checksums
  if (!file1.normalizedChecksum || !file2.normalizedChecksum) {
    return file1.rawFileChecksum !== file2.rawFileChecksum;
  }
  
  // Compare using normalized checksums to ignore comments and whitespace
  return file1.normalizedChecksum !== file2.normalizedChecksum;
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
	const previousMap = new Map(previousStatements.map(s => [s.checksum, s]));
	const currentMap = new Map(currentStatements.map(s => [s.checksum, s]));

	// Find deleted statements (in previous but not current)
	for (const [checksum, statement] of previousMap) {
		if (!currentMap.has(checksum)) {
			changes.push({ type: 'deleted', previous: statement });
		}
	}

	// Find added statements (in current but not previous)
	for (const [checksum, statement] of currentMap) {
		if (!previousMap.has(checksum)) {
			changes.push({ type: 'added', current: statement });
		}
	}

	return changes;
}
