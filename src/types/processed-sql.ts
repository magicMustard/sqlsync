import { TableDefinition } from './table-definition';

/**
 * Represents a single, normalized SQL statement and its checksum.
 */
export interface ProcessedStatement {
	checksum: string; // SHA-256 hash of the normalized statement
	type?: string;    // Type of SQL statement (e.g., 'create', 'alter', etc.)
	content?: string; // The raw SQL content with comments
	normalizedStatement?: string; // The SQL statement after parsing and normalization by node-sql-parser
	// Optional fields for future use or debugging:
	// originalLineNumber?: number;
}

/**
 * Represents a processed SQL file, containing its path information and parsed statements.
 */
export interface ProcessedSqlFile {
	filePath: string; // Path relative to the base directory where traversal started
	fileName: string; // Just the base name of the file (e.g., 'create_users.sql')
	statements: ProcessedStatement[];
	rawFileChecksum: string; // Checksum of the raw file content *before* parsing/normalization
	rawFileContent: string; // The raw, unmodified content of the file

	// Flags parsed from file comments (e.g., -- sqlsync: declarativeTable=true)
	declarativeTable?: boolean; // Default based on implementation needs (e.g., false or true)
	splitStatements?: boolean; // Default based on implementation needs (e.g., false)
	tableDefinition?: TableDefinition | null; // Parsed structure if declarativeTable=true
	error?: string; // Optional error message if processing failed
}

/**
 * Represents the processed results for a specific directory listed in the config's order array.
 * This helps group files found within specific subdirectories if the config points to directories.
 */
export interface ProcessedDirectory {
	directoryPath: string; // Path relative to the base directory
	files: ProcessedSqlFile[]; // SQL files processed within this directory
}

/**
 * Represents the overall result of processing a top-level section (e.g., 'schema', 'data').
 * It contains a mix of directly processed files and processed directories.
 */
export interface ProcessedSection {
	sectionName: string; // e.g., 'schema'
	// An array holding either files processed directly under the section's order,
	// or directories processed based on order items that were directories.
	items: (ProcessedSqlFile | ProcessedDirectory)[];
}

/**
 * Defines the possible flags that can be parsed from -- sqlsync: comments.
 */
export interface SqlSyncDirectiveFlags {
	declarativeTable?: boolean;
	splitStatements?: boolean;
}
