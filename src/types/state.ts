// src/types/state.ts

/**
 * Represents the parsed state of a declarative table definition.
 * Stored within the SqlSyncState under the migration that created/modified it.
 */
export interface DeclarativeTableState {
  tableName: string;
  // Represents the detailed structure parsed by PostgresTableParser
  // TODO: Replace 'any' with the actual type from PostgresTableParser
  parsedStructure: any;
  // Checksum of the raw CREATE TABLE statement text for quick comparison
  rawStatementChecksum: string;
  // Relative path to the source schema file (e.g., schema/tables/users/table.sql)
  sourceFilePath: string;
}

/**
 * Represents the checksum information for a single statement within a migration file.
 */
export interface MigrationStatementChecksum {
  // Checksum of the normalized statement content
  checksum: string;
  // Optional: Original line numbers in the migration file for reference
  startLine?: number;
  endLine?: number;
  // Path to the source file this statement came from
  filePath?: string;
}

/**
 * Represents the stored state associated with a single migration file.
 */
export interface MigrationState {
  // Checksum of the entire migration file content (optional, for quick change detection)
  fileChecksum?: string;
  // Checksums of individual statements within this migration, in order
  statements: MigrationStatementChecksum[];
  // State of declarative tables *after* this migration is applied, keyed by source file path
  declarativeTables: {
    [sourceFilePath: string]: DeclarativeTableState;
  };
  // Optional metadata
  createdAt?: string; // ISO timestamp
  // Whether this migration is marked as protected from rollback
  marked?: boolean;
  // Add other relevant details like status (e.g., applied, pending, merged) if needed later
}

/**
 * Represents the unified state for SQLSync, stored in sqlsync-state.json.
 */
export interface SqlSyncState {
  // Version of the state file format
  version: number;
  // Name of the last migration file officially marked as applied in production/stable environment
  lastProductionMigration: string | null;
  // Ordered list of all known migration filenames, representing the canonical history
  migrationHistory: string[];
  // Detailed state associated with each known migration in the history
  migrations: {
    [migrationFilename: string]: MigrationState;
  };
  // Current state of declarative tables based on the HEAD of the migration history.
  // This is the structure used for diffing against local schema files.
  currentDeclarativeTables: {
     [sourceFilePath: string]: DeclarativeTableState;
  };
  // Checksums of the raw content of all tracked files as of the last state save.
  // Used for quick detection of changes in non-declarative files.
  currentFileChecksums: {
	 [filePath: string]: string; // raw file checksum
  };
}

// Initial version for the new state format
export const SQLSYNC_STATE_VERSION = 1;

// Default filename for the state file
export const SQLSYNC_STATE_FILENAME = 'sqlsync-state.json';

// Default filename for the local applied migrations file (gitignore this)
export const SQLSYNC_LOCAL_APPLIED_FILENAME = '.sqlsync-local-applied.txt';
