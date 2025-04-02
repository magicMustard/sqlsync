// src/core/diff-engine.ts
import {
	ProcessedSection,
	ProcessedSqlFile,
	ProcessedStatement,
} from '@/types/processed-sql';

export type ChangeType = 'added' | 'deleted' | 'modified' | 'unmodified';

// Represents changes within a single statement
export interface StatementChange {
	type: ChangeType;
	previous?: ProcessedStatement; // Present if modified or deleted
	current?: ProcessedStatement; // Present if modified or added
}

// Represents changes within a single file
export interface FileChange {
	type: ChangeType; // 'modified' if statements changed, 'added', 'deleted'
	filePath: string;
	previous?: ProcessedSqlFile; // Present if modified or deleted
	current?: ProcessedSqlFile; // Present if modified or added
	statementChanges?: StatementChange[]; // Details if type is 'modified'
}

// Represents the overall differences between two states
export interface StateDifference {
	// Could add section-level changes later if needed
	fileChanges: FileChange[];
}

/**
 * Compares the previous and current processed SQL states to find differences.
 *
 * @param previousState The state loaded from .sqlsync-state.json (or null if none).
 * @param currentState The newly generated state from traversing directories.
 * @returns A StateDifference object detailing the changes.
 */
export function diffStates(
	previousState: ProcessedSection[] | null,
	currentState: ProcessedSection[]
): StateDifference {
	const fileChanges: FileChange[] = [];

	// Helper maps for efficient lookup
	const previousFiles = new Map<string, ProcessedSqlFile>();
	const currentFiles = new Map<string, ProcessedSqlFile>();

	// Populate previousFiles map
	previousState?.forEach((section) => {
		section.items.forEach((item) => {
			if ('files' in item) {
				// It's a ProcessedDirectory
				item.files.forEach((file) => {
					previousFiles.set(file.filePath, file);
				});
			} else {
				// It's a ProcessedSqlFile directly under the section (if we support that later)
				// previousFiles.set(item.filePath, item);
			}
		});
	});

	// Populate currentFiles map
	currentState.forEach((section) => {
		section.items.forEach((item) => {
			if ('files' in item) {
				// ProcessedDirectory
				item.files.forEach((file) => {
					currentFiles.set(file.filePath, file);
				});
			} else {
				// ProcessedSqlFile
				// currentFiles.set(item.filePath, item);
			}
		});
	});

	// --- Identify Added and Modified Files ---
	for (const [filePath, currentFile] of currentFiles.entries()) {
		const previousFile = previousFiles.get(filePath);

		if (!previousFile) {
			// File is new
			fileChanges.push({ type: 'added', filePath, current: currentFile });
		} else {
			// File exists in both, check for modifications
			if (previousFile.rawFileChecksum !== currentFile.rawFileChecksum) {
				// Raw checksums differ, indicating file content modification
				// If it's a declarative table, any raw change marks it modified.
				if (currentFile.declarativeTable) {
					fileChanges.push({
						type: 'modified',
						filePath,
						previous: previousFile,
						current: currentFile,
						// For declarative, statementChanges might not be relevant for the migration itself,
						// but could be useful for detailed CLI output later.
						statementChanges: diffStatements(
							previousFile.statements,
							currentFile.statements
						),
					});
				} else {
					// For non-declarative files, compare statements to detail changes
					const statementChanges = diffStatements(
						previousFile.statements,
						currentFile.statements
					);
					// Only mark as modified if statement changes actually occurred
					// (Raw checksum could differ due to whitespace/comments if parsing is imperfect)
					if (statementChanges.some((sc) => sc.type !== 'unmodified')) {
						fileChanges.push({
							type: 'modified',
							filePath,
							previous: previousFile,
							current: currentFile,
							statementChanges: statementChanges,
						});
					} // else: raw checksum changed, but normalized statements are identical - treat as unmodified
				}
			} else {
				// Raw checksums are the same, file is considered unmodified
				// No need to add to fileChanges unless we want to track unmodified files too.
			}
			// Remove from previousFiles map to track deletions later
			previousFiles.delete(filePath);
		}
	}

	// --- Identify Deleted Files ---
	// Any files remaining in previousFiles map were deleted
	for (const [filePath, previousFile] of previousFiles.entries()) {
		fileChanges.push({ type: 'deleted', filePath, previous: previousFile });
	}

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
