/**
 * Types for SQLSync multi-developer collaboration features
 */

import { ProcessedSqlFile } from './processed-sql';

/**
 * Represents a migration file and its metadata
 */
export interface MigrationInfo {
	/**
	 * Name of the migration file
	 */
	name: string;
	
	/**
	 * Timestamp when the migration was created
	 */
	timestamp: string;
	
	/**
	 * List of files or statements modified by this migration
	 */
	appliedChanges: string[];
	
	/**
	 * Optional: Developer who created this migration
	 */
	author?: string;

	/**
	 * Indicates if this migration is marked for protection from rollbacks
	 * Marked migrations cannot be rolled back until unmarked.
	 */
	marked?: boolean;
}

/**
 * Represents a tracked SQL file in the enhanced state
 */
export interface TrackedFileInfo {
	/**
	 * Current checksum of the file
	 */
	checksum: string;
	
	/**
	 * Name of the migration that last modified this file
	 */
	lastModifiedBy: string;
	
	/**
	 * For splitStatements=true files, tracks individual statements
	 */
	statements?: Array<{
		/**
		 * Checksum of the individual statement
		 */
		checksum: string;
		
		/**
		 * Migration that last modified this statement, or null if not yet in a migration
		 */
		lastModifiedBy: string | null;
	}>;
}

/**
 * Represents a resolved conflict in the state file
 */
export interface ResolvedConflict {
	/**
	 * Files involved in the conflict
	 */
	files: string[];
	
	/**
	 * Migrations involved in the conflict
	 */
	migrations: string[];
	
	/**
	 * How the conflict was resolved
	 */
	resolution: string;
	
	/**
	 * When the conflict was resolved
	 */
	timestamp: string;
}

/**
 * Enhanced SQLSync state file structure for multi-developer collaboration
 */
export interface EnhancedSqlSyncState {
	/**
	 * When the state file was last updated
	 */
	lastUpdated: string;
	
	/**
	 * File tracking with migration history
	 */
	files: {
		[filePath: string]: TrackedFileInfo;
	};
	
	/**
	 * Migration registry
	 */
	migrations: MigrationInfo[];
	
	/**
	 * Production tracking
	 */
	production?: {
		/**
		 * Last migration applied in production
		 */
		lastApplied: string;
		
		/**
		 * When it was marked as applied
		 */
		timestamp: string;
	};
	
	/**
	 * Conflict tracking
	 */
	resolvedConflicts?: ResolvedConflict[];
}

/**
 * Result of a synchronization operation
 */
export interface SyncResult {
	/**
	 * New migrations detected
	 */
	newMigrations: MigrationInfo[];
	
	/**
	 * Files with changes but no corresponding migration
	 */
	pendingChanges: string[];
	
	/**
	 * Potential conflicts detected
	 */
	conflicts: Array<{
		file: string;
		migrations: string[];
		description: string;
	}>;
}
