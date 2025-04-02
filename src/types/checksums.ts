/**
 * Represents the checksum information stored for a single file when using 'file' tracking mode.
 */
interface FileChecksumEntry {
	type: 'file';
	checksum: string; // SHA1 (or other) hash of the normalized file content
	appliedInMigration: string; // Identifier (e.g., name or timestamp) of the migration file it was included in
}

/**
 * Represents the checksum information for a single SQL statement within a file
 * when using '-- splitStatements' flag.
 */
interface StatementChecksumEntry {
	statementChecksum: string; // Checksum of the individual statement
	appliedInMigration: string;
}

/**
 * Represents the checksum information stored for a file when using '-- splitStatements'.
 */
interface SplitStatementsChecksumEntry {
	type: 'statements';
	// Using a Map allows efficient lookup of statements by their checksum
	statements: Record<string, StatementChecksumEntry>; // Key: statementChecksum, Value: metadata
	// Note: We only store checksums of *existing* statements. If a statement is removed from the file,
	// its entry simply won't be found here during the next run.
}

/**
 * Represents the checksum information for a single column or constraint within a CREATE TABLE statement
 * when using '-- declarativeTable' flag.
 */
interface ColumnOrConstraintChecksumEntry {
	definitionChecksum: string; // Checksum of the column/constraint definition string
	appliedInMigration: string;
}

/**
 * Represents the checksum information stored for a file when using '-- declarativeTable'.
 */
interface DeclarativeTableChecksumEntry {
	type: 'declarativeTable';
	/** Checksum of the base CREATE TABLE statement (maybe just the table name + options?) */
	tableChecksum: string;
	appliedInMigration: string;
	/** Checksums for individual columns and constraints */
	// Key: column/constraint name (or unique identifier), Value: metadata
	columnsAndConstraints: Record<string, ColumnOrConstraintChecksumEntry>;
}

/**
 * Union type representing any possible checksum entry for a single SQL file.
 */
export type SqlFileChecksumEntry =
	| FileChecksumEntry
	| SplitStatementsChecksumEntry
	| DeclarativeTableChecksumEntry;

/**
 * Represents the structure of the sqlsync_checksums.json file within a directory.
 * It's a map where keys are filenames and values are their corresponding checksum entries.
 */
export interface DirectoryChecksums {
	[fileName: string]: SqlFileChecksumEntry;
}
