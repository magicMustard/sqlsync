import * as fs from 'fs/promises';
import * as path from 'path';
import { getHash } from '@/utils/crypto';
import { logger } from '@/utils/logger';
import {
	ProcessedSqlFile,
	ProcessedStatement,
	SqlSyncDirectiveFlags,
	TableDefinition,
	ColumnDefinition,
} from '@/types';
import { PostgresTableParser } from './pg-table-parser';

// Helper function to calculate checksums for individual statements
const calculateStatementsChecksums = (
	content: string
): ProcessedStatement[] => {
	try {
		// We're now parsing statements using our own logic
		// We'll use the boundary and semicolon splitters instead of parser.astify
		
		// First, split by statement boundaries
		return splitByStatementBoundaries(content);
	} catch (error) {
		logger.debug('Error parsing statements with AST parser:', error);
		
		// If parsing failed, fall back to our custom approach
		return splitByStatementBoundaries(content);
	}
};

// Helper function to split SQL content by statement boundaries
// Uses semicolons and optional manual boundary directives
const splitByStatementBoundaries = (content: string): ProcessedStatement[] => {
	const statements: ProcessedStatement[] = [];
	
	// First, look for manual statement boundary directives
	const manualBoundaryRegex = /--\s*sqlsync:\s*startStatement\s*\n([\s\S]*?)--\s*sqlsync:\s*endStatement/g;
	let match;
	let lastEndIndex = 0;
	let hasManualBoundaries = false;
	
	// Process manual boundaries first
	while ((match = manualBoundaryRegex.exec(content)) !== null) {
		hasManualBoundaries = true;
		// If there's content before this manual boundary, process it by semicolons
		if (match.index > lastEndIndex) {
			const beforeContent = content.substring(lastEndIndex, match.index);
			const semicolonStatements = splitBySemicolons(beforeContent);
			statements.push(...semicolonStatements);
		}
		
		// Add the manually marked statement
		const statementContent = match[1].trim();
		if (statementContent) {
			// Remove comments for checksum calculation
			let effectiveContent = statementContent
				.replace(/--.*$/gm, '') // Remove single-line comments
				.replace(/\/\*[\s\S]*?\*\//gm, '') // Remove multi-line comments
				.trim();
				
			const checksum = getHash(effectiveContent);
			
			statements.push({
				type: 'unknown', // We don't know the exact type without parsing
				content: statementContent,
				normalizedStatement: effectiveContent, // Add normalized statement
				checksum,
			});
		}
		
		lastEndIndex = match.index + match[0].length;
	}
	
	// If there's remaining content after the last manual boundary (or no manual boundaries found)
	if (lastEndIndex < content.length || !hasManualBoundaries) {
		const remainingContent = content.substring(lastEndIndex);
		const semicolonStatements = splitBySemicolons(remainingContent);
		statements.push(...semicolonStatements);
	}
	
	return statements;
};

// Helper function to split SQL content by semicolons
// Handles basic SQL statement splitting
const splitBySemicolons = (content: string): ProcessedStatement[] => {
	const statements: ProcessedStatement[] = [];
	
	// Split by semicolons but be careful about semicolons in string literals and dollar-quoted blocks
	let currentStatement = '';
	let inStringLiteral = false;
	let inIdentifier = false;
	let dollarQuoteTag = '';
	let inDollarQuote = false;
	
	for (let i = 0; i < content.length; i++) {
		const char = content[i];
		const nextChar = i < content.length - 1 ? content[i + 1] : '';
		
		// Handle string literals
		if (char === "'" && !inDollarQuote) {
			// Check if this is an escaped single quote
			if (nextChar === "'" && inStringLiteral) {
				currentStatement += "''";
				i++; // Skip the next quote
			} else {
				inStringLiteral = !inStringLiteral;
				currentStatement += char;
			}
		}
		// Handle quoted identifiers
		else if (char === '"' && !inStringLiteral && !inDollarQuote) {
			inIdentifier = !inIdentifier;
			currentStatement += char;
		}
		// Handle dollar-quoted strings (for PostgreSQL)
		else if (char === '$' && !inStringLiteral && !inIdentifier) {
			if (inDollarQuote) {
				// Check if this is the end of the dollar-quoted string
				const possibleEndTag = content.substring(i, i + dollarQuoteTag.length);
				if (possibleEndTag === dollarQuoteTag) {
					inDollarQuote = false;
					currentStatement += possibleEndTag;
					i += dollarQuoteTag.length - 1; // Skip to the end of the tag
					dollarQuoteTag = '';
				} else {
					currentStatement += char;
				}
			} else {
				// Look ahead to find the dollar quote tag
				let tagEnd = content.indexOf('$', i + 1);
				if (tagEnd > i) {
					dollarQuoteTag = content.substring(i, tagEnd + 1);
					inDollarQuote = true;
					currentStatement += dollarQuoteTag;
					i = tagEnd; // Skip to the end of the opening tag
				} else {
					currentStatement += char;
				}
			}
		}
		// Handle semicolons (statement boundaries)
		else if (char === ';' && !inStringLiteral && !inIdentifier && !inDollarQuote) {
			currentStatement += char;
			
			// Clean up the statement and add it if non-empty
			const trimmedStatement = currentStatement.trim();
			if (trimmedStatement && trimmedStatement !== ';') {
				// Remove comments for checksum calculation
				let effectiveContent = trimmedStatement
					.replace(/--.*$/gm, '') // Remove single-line comments
					.replace(/\/\*[\s\S]*?\*\//gm, '') // Remove multi-line comments
					.trim();
					
				const checksum = getHash(effectiveContent);
				
				// Try to determine the statement type
				let type = 'unknown';
				const upperStatement = effectiveContent.toUpperCase();
				if (upperStatement.startsWith('CREATE TABLE')) type = 'create';
				else if (upperStatement.startsWith('CREATE FUNCTION')) type = 'function';
				else if (upperStatement.startsWith('ALTER TABLE')) type = 'alter';
				else if (upperStatement.startsWith('CREATE POLICY')) type = 'policy';
				else if (upperStatement.startsWith('CREATE TRIGGER')) type = 'trigger';
				
				statements.push({
					type,
					content: trimmedStatement,
					normalizedStatement: effectiveContent, // Add normalized statement
					checksum,
				});
			}
			
			currentStatement = '';
		}
		else {
			currentStatement += char;
		}
	}
	
	// Handle any remaining statement without semicolon
	const trimmedStatement = currentStatement.trim();
	if (trimmedStatement) {
		// Remove comments for checksum calculation
		let effectiveContent = trimmedStatement
			.replace(/--.*$/gm, '') // Remove single-line comments
			.replace(/\/\*[\s\S]*?\*\//gm, '') // Remove multi-line comments
			.trim();

		if (effectiveContent) {
			const checksum = getHash(effectiveContent);

			// Try to determine the statement type
			let type = 'unknown';
			const upperStatement = effectiveContent.toUpperCase();
			if (upperStatement.startsWith('CREATE TABLE')) type = 'create';
			else if (upperStatement.startsWith('CREATE FUNCTION')) type = 'function';
			else if (upperStatement.startsWith('ALTER TABLE')) type = 'alter';
			else if (upperStatement.startsWith('CREATE POLICY')) type = 'policy';
			else if (upperStatement.startsWith('CREATE TRIGGER')) type = 'trigger';
			
			statements.push({
				type,
				content: trimmedStatement,
				normalizedStatement: effectiveContent, // Add normalized statement
				checksum,
			});
		}
	}
	
	return statements;
};

// Helper function to parse directives like -- sqlsync: declarativeTable=true, splitStatements=false
const parseDirectives = (content: string): SqlSyncDirectiveFlags => {
	const directives: SqlSyncDirectiveFlags = {
		declarativeTable: false,
		splitStatements: false,
	};

	// Regular expression to match directive comments
	const directiveRegex = /--\s*sqlsync:\s*([^]*?)$/gm;
	let match;

	while ((match = directiveRegex.exec(content)) !== null) {
		const directiveString = match[1].trim();
		
		// Split by commas or spaces and process each directive
		const parts = directiveString.split(/,\s*/);
		
		for (const part of parts) {
			const [key, value] = part.split(/\s*=\s*/);
			
			if (key === 'declarativeTable' && value === 'true') {
				directives.declarativeTable = true;
			} else if (key === 'splitStatements' && value === 'true') {
				directives.splitStatements = true;
			}
			// Add any future directives here
		}
	}

	return directives;
};

/**
 * Normalizes SQL content by removing comments and standardizing whitespace.
 * This helps ensure that only meaningful SQL changes trigger new migrations.
 * 
 * @param content The SQL content to normalize
 * @returns Normalized SQL content
 */
export function normalizeSQL(content: string): string {
  if (!content) return '';
  
  // Remove comments
  let normalized = content
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//gm, ''); // Remove multi-line comments
  
  // Normalize whitespace: multiple whitespace becomes single space
  normalized = normalized
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
}

/**
 * Detects if a SQL string contains a CREATE TABLE statement
 * 
 * @param sql SQL string to check
 * @returns true if it contains a CREATE TABLE statement
 */
function isCreateTableStatement(sql: string): boolean {
	// Simple regex check for CREATE TABLE statement
	const normalized = sql
		.replace(/--.*$/gm, '') // Remove single-line comments
		.replace(/\/\*[\s\S]*?\*\//gm, ''); // Remove multi-line comments
	
	const trimmedNormalized = normalized.trim();
	const regex = /\s*CREATE\s+TABLE/i;
	const result = regex.test(trimmedNormalized);
	return result;
}

/**
 * Process a SQL file and return structured information about its contents.
 * Handles file reading, parsing, and directive processing.
 *
 * @param filePath Absolute path to the SQL file
 * @param relativePath Relative path to the SQL file (used for reporting)
 * @returns A ProcessedSqlFile object containing file info and parsed statements
 */
export async function processSqlFile(
	filePath: string,
	relativePath?: string
): Promise<ProcessedSqlFile> {
	const fileName = path.basename(filePath);
	let fileContent = '';
	let fileChecksum = '';
	let normalizedChecksum = ''; // Initialize the normalized checksum
	let statements: ProcessedStatement[] = [];
	let parsedTable: TableDefinition | null = null;
	let directives: SqlSyncDirectiveFlags = {
		declarativeTable: false,
		splitStatements: false,
	};
	
	try {
		// Read the file content
		fileContent = await fs.readFile(filePath, 'utf-8');
		
		// Calculate checksum for raw content
		fileChecksum = getHash(fileContent);
		
		// Calculate normalized checksum for change detection - immune to comments and whitespace
		const normalizedContent = normalizeSQL(fileContent);
		normalizedChecksum = getHash(normalizedContent);
		
		// Parse SQL Sync directives
		directives = parseDirectives(fileContent);
		
		// Check for conflicting directives
		if (directives.declarativeTable && directives.splitStatements) {
			throw new Error(
				"Cannot use both 'declarativeTable=true' and 'splitStatements=true' in the same file"
			);
		}
		
		// Setup parser with PostgreSQL as target DB
		const parser = PostgresTableParser;
		
		// Check for CREATE TABLE multi-statement violation
		const hasCreateTable = isCreateTableStatement(fileContent);
		
		if (hasCreateTable) {
			// Original check:
			// Split statements ONLY to check for the multi-statement rule violation
			// We use the internal splitter directly here, not relying on directives yet
			try {
				const fileStatements = splitByStatementBoundaries(fileContent); 
				
				if (fileStatements.length > 1) {
					throw new Error(
						`Files containing a CREATE TABLE statement must not contain other executable SQL statements. Found ${fileStatements.length} statements in file: '${filePath}'`
					);
				}
			} catch (splitErr: any) {
				// If splitting itself fails here, re-throw as a general syntax error
				throw new Error(`Invalid SQL syntax: ${splitErr.message || String(splitErr)}`);
			}
			
		} 

		// Determine if statements should be split based on directives
		// --- Process based on directives ---
		if (directives.declarativeTable) {
			// Require a CREATE TABLE statement for declarative mode (already checked by hasCreateTable)
			if (!hasCreateTable) {
				throw new Error(
					`File marked as 'declarativeTable=true' but no CREATE TABLE found. File: '${filePath}'`
				);
			}
			
			// Try to parse the table definition
			try {
				parsedTable = PostgresTableParser.parseCreateTable(fileContent);
				if (!parsedTable) {
					logger.debug(`Failed to extract table definition with custom parser: ${filePath}`);
					throw new Error(`Failed to extract table definition from ${filePath}`);
				}
				logger.debug(`Extracted table definition for ${parsedTable.tableName}`);
			} catch (err: any) {
				throw new Error(`Failed to parse CREATE TABLE statement in ${filePath}: ${err.message || String(err)}`);
			}
			
			// Calculate checksum based on the CREATE TABLE statement (normalized)
			const effectiveContent = fileContent
				.replace(/--.*$/gm, '') // Remove comments
				.replace(/\/\*[\s\S]*?\*\//gm, '')
				.trim();
			const checksum = getHash(effectiveContent);
			
			// Create a single statement for the CREATE TABLE
			statements = [
				{
					type: 'create', // Specifically CREATE TABLE
					content: fileContent.trim(), // Keep original content with comments
					normalizedStatement: effectiveContent,
					checksum,
				},
			];
		}
		// --- Logic for split statements ---
		else if (directives.splitStatements) {
			// Should not have CREATE TABLE with splitStatements (already checked)
			if (hasCreateTable) {
				throw new Error(
					`Cannot use 'splitStatements=true' with a CREATE TABLE statement in file: '${filePath}'`
				);
			}
			// Try to split statements using the boundary logic
			try {
				statements = splitByStatementBoundaries(fileContent);
				// Basic validation: if content exists, we expect statements
				if (statements.length === 0 && fileContent.trim().length > 0) {
					throw new Error('No valid SQL statements found despite content.');
				}
			} catch (err: any) {
				// Errors during splitting are treated as syntax errors
				throw new Error(`SQL syntax error during splitting: ${err.message || String(err)}`);
			}
		} 
		// --- Default Logic (Treat as single statement) ---
		else {
			// Handle CREATE TABLE files that are *not* declarative
			if (hasCreateTable) {
				// The multi-statement check already ran. Treat as single CREATE TABLE statement.
				logger.debug(`Found non-declarative CREATE TABLE, treating as single statement: ${filePath}`);
			}

			// Treat the entire file as a single statement
			const effectiveContent = fileContent
				.replace(/--.*$/gm, '') // Remove comments for checksum
				.replace(/\/\*[\s\S]*?\*\//gm, '')
				.trim();
				
			// Only add if there is actual content after trimming comments
			if (effectiveContent) {
				const checksum = getHash(effectiveContent);
				
				// Determine statement type heuristically
				let statementType = 'unknown';
				const upperContent = effectiveContent.toUpperCase();
				if (upperContent.startsWith('CREATE TABLE')) statementType = 'create'; // Non-declarative create
				else if (upperContent.startsWith('CREATE FUNCTION')) statementType = 'function';
				else if (upperContent.startsWith('ALTER TABLE')) statementType = 'alter';
				else if (upperContent.startsWith('CREATE POLICY')) statementType = 'policy';
				else if (upperContent.startsWith('CREATE TRIGGER')) statementType = 'trigger';
				else if (upperContent.startsWith('ENABLE ROW LEVEL SECURITY')) statementType = 'rls';
				
				statements = [
					{
						type: statementType,
						content: fileContent.trim(), // Keep original content with comments
						normalizedStatement: effectiveContent,
						checksum,
					},
				];
			} else {
				// File is empty or only contains comments
				statements = [];
			}
		}
		
	} catch (err: any) {
		// Catch errors during processing and return them immediately
		const error = err.message || String(err);
		// Return an object conforming to ProcessedSqlFile on error
		return {
			filePath: relativePath || fileName, // Use relative path (or filename)
			fileName,
			rawFileContent: fileContent, // Keep raw content even on error
			rawFileChecksum: fileChecksum, // Keep checksum even on error
			error, // The captured error message
			statements: [], // Empty statements on error
			tableDefinition: null, // Null definition on error
			// Include directive flags even if an error occurred
			declarativeTable: directives.declarativeTable,
			splitStatements: directives.splitStatements,
			normalizedChecksum: normalizedChecksum, // Use explicit assignment instead of shorthand
		};
	}

	// If no error occurred, return the successfully processed data
	// Conforming to ProcessedSqlFile interface
	return {
		filePath: relativePath || fileName, // Use relative path (or filename)
		fileName,
		rawFileContent: fileContent,
		rawFileChecksum: fileChecksum,
		normalizedChecksum: normalizedChecksum, // Use explicit assignment instead of shorthand
		statements,
		tableDefinition: parsedTable, // Populated if applicable
		declarativeTable: directives.declarativeTable,
		splitStatements: directives.splitStatements,
		error: undefined, // Explicitly undefined on success
	};
}
