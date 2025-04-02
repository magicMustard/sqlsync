import * as fs from 'fs/promises';
import * as path from 'path';
import { Parser } from 'node-sql-parser';
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
// Updated to filter comments before processing
const calculateStatementsChecksums = (
	parser: Parser,
	content: string
): ProcessedStatement[] => {
	try {
		// Use the database option only (whiteList isn't actually supported by the type)
		const ast = parser.astify(content, { database: 'postgresql' });
		const statements: ProcessedStatement[] = [];

		// Filter out comment nodes before iterating
		const executableNodes = Array.isArray(ast)
			? ast.filter((node) => node && node.type)
			: ast && ast.type
				? [ast]
				: [];

		// If we successfully parsed some statements, use them
		if (executableNodes.length > 0) {
			// Parse individual statements with sqlify if possible
			for (const node of executableNodes) {
				try {
					const statementSql = parser.sqlify(node, { database: 'postgresql' });
					statements.push({
						type: node.type,
						content: statementSql,
						normalizedStatement: statementSql, // Add normalized statement
						checksum: getHash(statementSql),
					});
				} catch (err: any) {
					logger.debug(`Failed to sqlify node: ${err}`);
					// Instead of continuing with other nodes, we'll throw an error for invalid syntax
					throw new Error(`Invalid SQL syntax: ${err.message || JSON.stringify(err)}`);
				}
			}
			
			// If we managed to extract some statements, return them
			if (statements.length > 0) {
				return statements;
			}
		}
		
		// If parsing with node-sql-parser didn't work well, fall back to our custom approach
		return splitByStatementBoundaries(content);
	} catch (err: any) {
		logger.debug(`Error in calculateStatementsChecksums: ${err}`);
		// Throw the error to be caught by the caller
		throw err;
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

// Helper function to safely extract column details from the AST node
// Optimized based on actual node-sql-parser AST structure
const extractColumnDefinition = (
	definitionNode: any
): ColumnDefinition | null => {
	// Log the definition structure for debugging
	logger.debug(
		`Column definition node: ${JSON.stringify(definitionNode, null, 2)}`
	);

	// Check if it's a column definition node
	if (definitionNode && definitionNode.column && definitionNode.definition) {
		try {
			// Extract column name - handles the nested structure in AST
			let name = '';
			if (definitionNode.column.column?.expr?.value) {
				name = definitionNode.column.column.expr.value;
			} else if (definitionNode.column.column?.value) {
				name = definitionNode.column.column.value;
			} else if (typeof definitionNode.column.column === 'string') {
				name = definitionNode.column.column;
			} else {
				logger.error('Unable to extract column name from AST');
				return null;
			}

			// Extract data type
			let dataType = definitionNode.definition.dataType || '';

			// Add length if specified (e.g., VARCHAR(50))
			if (definitionNode.definition.length) {
				if (typeof definitionNode.definition.length === 'number') {
					dataType += `(${definitionNode.definition.length})`;
				} else if (Array.isArray(definitionNode.definition.length)) {
					const lengths = definitionNode.definition.length
						.map((l: any) => l.value || l)
						.join(',');
					dataType += `(${lengths})`;
				}
			}

			// Determine column constraints
			const isPrimaryKey = !!definitionNode.primary_key;
			const isUnique = !!definitionNode.unique;

			// Determine nullability
			let isNullable = true; // Default is nullable

			// Handle NOT NULL constraint
			if (definitionNode.nullable) {
				// A nullable object with type "not null" means it's NOT NULL
				if (definitionNode.nullable.type === 'not null') {
					isNullable = false;
				}
			}

			// Primary keys are implicitly NOT NULL
			if (isPrimaryKey) {
				isNullable = false;
			}

			// SERIAL type in PostgreSQL implies NOT NULL
			if (dataType.toUpperCase() === 'SERIAL') {
				isNullable = false;
			}

			// Extract default value
			let defaultValue: string | null = null;
			if (definitionNode.default_val) {
				if (
					typeof definitionNode.default_val.value === 'object' &&
					definitionNode.default_val.value.type === 'function'
				) {
					// Handle function defaults like NOW()
					const funcName = definitionNode.default_val.value.name.name[0].value;
					defaultValue = `${funcName}()`;
				} else if (definitionNode.default_val.value) {
					defaultValue = definitionNode.default_val.value.toString();
				}
			}

			return {
				name,
				dataType,
				isNullable,
				defaultValue,
				isPrimaryKey,
				isUnique,
			};
		} catch (err) {
			logger.error(`Error extracting column definition: ${err}`);
			return null;
		}
	}

	// This isn't a column definition we recognize
	return null;
};

// Helper function to parse CREATE TABLE statement and extract structure
const parseCreateTableStatement = (
	createStatementAst: any,
	parser: Parser
): TableDefinition | null => {
	if (
		!createStatementAst ||
		createStatementAst.type !== 'create' ||
		createStatementAst.keyword !== 'table' ||
		!createStatementAst.table ||
		createStatementAst.table.length === 0
	) {
		return null; // Not a valid CREATE TABLE AST
	}

	// Extract the table name string directly
	const tableName = createStatementAst.table[0].table; // (ts:6365803e)

	logger.debug(`Parsing CREATE TABLE for '${tableName}'`);
	logger.debug(`AST structure: ${JSON.stringify(createStatementAst, null, 2)}`);

	const columns: ColumnDefinition[] = [];
	if (createStatementAst.create_definitions) {
		logger.debug(
			`Found ${createStatementAst.create_definitions.length} definitions`
		);

		for (const definitionNode of createStatementAst.create_definitions) {
			logger.debug(
				`Processing definition: ${JSON.stringify(definitionNode, null, 2)}`
			);
			const columnDef = extractColumnDefinition(definitionNode);
			if (columnDef) {
				columns.push(columnDef);
			}
			// Here you could also parse constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK)
		}
	}

	if (columns.length === 0) {
		logger.warn(`No columns parsed for declarative table '${tableName}'.`);
		// Decide if this is an error or just an empty table definition
	}

	return {
		tableName,
		columns,
		// other properties like constraints, indexes could be added here
	};
};

/**
 * Detects if a SQL string contains a CREATE TABLE statement
 * 
 * @param sql SQL string to check
 * @returns true if it contains a CREATE TABLE statement
 */
function isCreateTableStatement(sql: string): boolean {
	// Normalize the SQL to handle comments and whitespace
	const normalizedSql = sql
		.replace(/--.*$/gm, '') // Remove single-line comments
		.replace(/\/\*[\s\S]*?\*\//gm, '') // Remove multi-line comments
		.trim();
		
	// Simple regex check for CREATE TABLE
	return /CREATE\s+TABLE/i.test(normalizedSql);
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
	const relPath = relativePath || fileName;
	
	// Initialize output structure with defaults
	let fileContent: string = '';
	let fileChecksum: string = '';
	let error: string | undefined;
	let statements: ProcessedStatement[] = [];
	let tableDefinition: TableDefinition | null = null;
	let directives: SqlSyncDirectiveFlags = {
		declarativeTable: false,
		splitStatements: false,
	};
	
	try {
		// Read the file content
		fileContent = await fs.readFile(filePath, 'utf-8');
		
		// Calculate raw file checksum
		// (For raw file content, we don't remove comments)
		fileChecksum = getHash(fileContent);
		
		// Parse SQL Sync directives
		directives = parseDirectives(fileContent);
		
		// Check for conflicting directives
		if (directives.declarativeTable && directives.splitStatements) {
			throw new Error(
				"Cannot use both 'declarativeTable=true' and 'splitStatements=true' in the same file"
			);
		}
		
		// Setup parser with PostgreSQL as target DB
		const parser = new Parser();
		
		// Try to parse the SQL to catch basic syntax errors early
		try {
			parser.astify(fileContent, { database: 'postgresql' });
		} catch (err: any) {
			throw new Error(`Invalid SQL syntax: ${err.message || String(err)}`);
		}
		
		// Check if this is a CREATE TABLE statement
		const hasCreateTable = isCreateTableStatement(fileContent);
		
		// Extract CREATE TABLE statements (regardless of directive flags)
		// This is used for declarative table support and to detect table statements
		let hasExtractedTable = false;
		if (hasCreateTable) {
			try {
				// Use our custom PostgreSQL table parser
				tableDefinition = PostgresTableParser.parseCreateTable(fileContent);
				hasExtractedTable = tableDefinition !== null;
				
				if (!hasExtractedTable) {
					logger.debug(`Failed to extract table definition with custom parser: ${filePath}`);
				}
			} catch (err) {
				// If our custom parser fails, log the error
				logger.debug(`Custom CREATE TABLE parser failed for ${filePath}: ${err}`);
			}
			
			// Break the file into statements to check if there's more than one statement
			const fileStatements = splitByStatementBoundaries(fileContent);
			if (fileStatements.length > 1) {
				// If there are multiple statements in a file with CREATE TABLE, this is an error
				throw new Error(
					`Files containing a CREATE TABLE statement must not contain other executable SQL statements. Found ${fileStatements.length} statements in file: '${filePath}'`
				);
			}
		}
		
		// Process the file based on directives and content
		// --- Logic for declarative tables ---
		if (directives.declarativeTable) {
			// Require a CREATE TABLE statement for declarative mode
			if (!hasCreateTable) {
				throw new Error(
					`File marked as 'declarativeTable=true' but no CREATE TABLE found. File: '${filePath}'`
				);
			}
			
			// Require successful table structure extraction
			if (!tableDefinition) {
				throw new Error(`Failed to extract table definition from ${filePath}`);
			}
			
			logger.debug(`Extracted table definition for ${tableDefinition.tableName}`);
			
			// Calculate checksum based on the CREATE TABLE statement
			const effectiveContent = fileContent
				.replace(/--.*$/gm, '') // Remove comments for checksum
				.replace(/\/\*[\s\S]*?\*\//gm, '')
				.trim();
				
			const checksum = getHash(effectiveContent);
			
			// Create a single statement for the CREATE TABLE
			statements = [
				{
					type: 'create',
					content: fileContent.trim(), // Keep original content with comments
					normalizedStatement: effectiveContent, // Add normalized statement
					checksum,
				},
			];

			logger.debug(`Found ${statements.length} statements for declarative table`);
		}
		// --- Logic for split statements ---
		else if (directives.splitStatements) {
			if (hasCreateTable) {
				throw new Error(
					`Files containing a CREATE TABLE statement must not contain other executable SQL statements`
				);
			}
			// First try the parser-based approach for splitting statements
			try {
				statements = calculateStatementsChecksums(parser, fileContent);
				
				// If any statement has an invalid SQL syntax, it should throw an error,
				// but in case it doesn't, we'll verify each statement
				for (const stmt of statements) {
					if (!stmt.normalizedStatement) {
						throw new Error(`Invalid SQL statement found: ${stmt.content ? stmt.content.substring(0, 50) : 'unknown'}...`);
					}
				}
			} catch (err: any) {
				// When there's an error parsing SQL with splitStatements=true,
				// we set the error and clear statements
				error = `SQL syntax error: ${err.message || String(err)}`;
				statements = [];
				throw err; // Re-throw to skip the rest of the processing
			}
		} else {
			// Default Logic (Treat as single statement, or handle CREATE TABLE non-declaratively)
			if (hasCreateTable) {
				// If there's a CREATE TABLE but no declarativeTable flag, just treat it as a normal statement
				logger.debug(`Found CREATE TABLE but no declarativeTable flag, treating as regular SQL`);
			}

			// By default, we treat the entire file as a single statement
			// This is good for view definitions, functions, etc.

			// Remove comments for checksum calculation
			let effectiveContent = fileContent;
			// Strip SQL comments for checksum calculation
			effectiveContent = effectiveContent
				.replace(/--.*$/gm, '') // Remove single-line comments
				.replace(/\/\*[\s\S]*?\*\//gm, '') // Remove multi-line comments
				.trim();

			const checksum = getHash(effectiveContent);

			// Create a single statement for the entire file
			let statementType = 'unknown';
			
			// Try to determine the statement type based on content
			const upperContent = effectiveContent.toUpperCase();
			if (upperContent.startsWith('CREATE TABLE')) statementType = 'create';
			else if (upperContent.startsWith('CREATE FUNCTION')) statementType = 'function';
			else if (upperContent.startsWith('ALTER TABLE')) statementType = 'alter';
			else if (upperContent.startsWith('CREATE POLICY')) statementType = 'policy';
			else if (upperContent.startsWith('CREATE TRIGGER')) statementType = 'trigger';
			else if (upperContent.startsWith('ENABLE ROW LEVEL SECURITY')) statementType = 'rls';
			
			statements = [
				{
					type: statementType,
					content: fileContent.trim(), // Keep original content with comments
					normalizedStatement: effectiveContent, // Add normalized statement
					checksum,
				},
			];
		}
	} catch (err: any) {
		error = err instanceof Error ? err.toString() : 'Unknown error';
		logger.error(`Error processing SQL file ${filePath}: ${error}`);
		statements = [];
		tableDefinition = null;
		// Keep fileChecksum if reading worked, otherwise it's null
		if (!fileContent) fileChecksum = '';
	}

	// Construct the final object
	return {
		filePath,
		fileName,
		declarativeTable: directives.declarativeTable,
		splitStatements: directives.splitStatements,
		rawFileChecksum: fileChecksum,
		rawFileContent: fileContent,
		statements,
		tableDefinition, // Populated only for declarative=true
		error: error ? error.toString() : undefined,
	};
}
