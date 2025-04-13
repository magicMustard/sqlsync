import { TableDefinition } from '@/types';
import { SqlFileType } from '../sql-parser/types';

export type StateContent = string;

// Initial version for the new state format
export const SQLSYNC_STATE_VERSION = 1;

// Default filename for the state file
export const SQLSYNC_STATE_FILENAME = 'sqlsync-state.json';

/**
 * Represents the unified state for SQLSync, stored in sqlsync-state.json.
 */
export interface SqlSyncState {
	[migrationFilename: string]: MigrationState;
}

/**
 * Represents the checksum information for a single statement within a migration file.
 */
export interface MigrationStatementChecksum {
	// Checksum of the normalized statement content
	checksum: string;
}

/**
 * Represents the stored state associated with a single migration file.
 */
export interface MigrationState {
	// Checksums of the source SQL files included in this migration, keyed by file path
	fileContentChecksums: {
		[filePath: string]: { checksum: string };
	};
	// Checksums of individual statements in a splitStatement file
	splitStatements: {
		// Represents an array of checksums for the sql statements.
		// We simply will checksum the current file and see if it exists in here.
		[filePath: string]: string[];
	};
	// State of declarative tables *after* this migration is applied, keyed by source file path
	declarativeTables: {
		[filePath: string]: TableDefinition;
	};
}
