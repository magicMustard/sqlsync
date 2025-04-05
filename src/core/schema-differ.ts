// src/core/schema-differ.ts
import { TableDefinition, ColumnDefinition } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Represents an ALTER TABLE operation to be generated
 */
export interface AlterTableOperation {
	type: 'ADD_COLUMN' | 'DROP_COLUMN' | 'MODIFY_COLUMN' | 'RENAME_COLUMN';
	tableName: string;
	columnName: string;
	newColumnName?: string; // Only for RENAME operations
	columnDefinition?: ColumnDefinition; // For ADD and MODIFY operations
	sql: string; // The actual SQL to execute
	requiresConfirmation?: boolean; // Flag to indicate if the operation needs user confirmation
	confidenceScore?: number; // A score between 0-1 for rename detection confidence
}

/**
 * Interface for column rename candidates
 */
interface RenameCandidate {
	oldColumn: string;
	newColumn: string;
	score: number;
}

/**
 * Compare two table definitions and generate a list of operations needed to transform
 * the old table schema to match the new one.
 *
 * @param oldTable The table definition from previous state
 * @param newTable The current table definition
 * @returns List of operations to apply
 */
export function diffTableDefinitions(
	oldTable: TableDefinition | null | undefined,
	newTable: TableDefinition
): AlterTableOperation[] {
	// If oldTable is null/undefined, there's nothing to diff
	if (!oldTable) {
		return [];
	}

	// Both tables should have the same name, but just to be safe
	if (oldTable.tableName !== newTable.tableName) {
		logger.warn(
			`Table name mismatch: ${oldTable.tableName} vs ${newTable.tableName}`
		);
		return [];
	}

	// Find potential column renames
	const renamedColumns = detectColumnRenames(oldTable, newTable);
	
	const operations: AlterTableOperation[] = [];
	
	// Create maps for easier access
	const oldColumns = new Map<string, ColumnDefinition>();
	oldTable.columns.forEach((col) => oldColumns.set(col.name, col));

	const newColumns = new Map<string, ColumnDefinition>();
	newTable.columns.forEach((col) => newColumns.set(col.name, col));
	
	// Track columns that were handled through renames
	const handledOldColumns = new Set<string>();
	const handledNewColumns = new Set<string>();
	
	// Process detected renames first
	for (const rename of renamedColumns) {
		const oldCol = oldColumns.get(rename.oldColumn)!;
		const newCol = newColumns.get(rename.newColumn)!;
		
		// Create rename operation
		operations.push({
			type: 'RENAME_COLUMN',
			tableName: newTable.tableName,
			columnName: rename.oldColumn,
			newColumnName: rename.newColumn,
			sql: `ALTER TABLE ${newTable.tableName} RENAME COLUMN ${rename.oldColumn} TO ${rename.newColumn};`,
			requiresConfirmation: rename.score < 0.7, // Request confirmation if confidence is low
			confidenceScore: rename.score
		});
		
		// Check if the column was modified beyond just the name
		if (!columnsEqualExceptName(oldCol, newCol)) {
			// Create modify operation
			operations.push({
				type: 'MODIFY_COLUMN',
				tableName: newTable.tableName,
				columnName: rename.newColumn,
				columnDefinition: newCol,
				sql: generateModifyColumnSQL(newTable.tableName, 
					{ ...oldCol, name: rename.newColumn }, // Use new name but old definition
					newCol
				)
			});
		}
		
		// Mark these columns as handled to prevent duplicate operations
		handledOldColumns.add(rename.oldColumn);
		handledNewColumns.add(rename.newColumn);
	}

	// Handle remaining column additions and modifications
	for (const [name, newCol] of newColumns.entries()) {
		// Skip columns that were already handled as renames
		if (handledNewColumns.has(name)) continue;
		
		const oldCol = oldColumns.get(name);
		
		if (!oldCol) {
			// Column is new, add it
			operations.push({
				type: 'ADD_COLUMN',
				tableName: newTable.tableName,
				columnName: name,
				columnDefinition: newCol,
				sql: generateAddColumnSQL(newTable.tableName, newCol),
			});
		} else if (!columnsEqual(oldCol, newCol)) {
			// Column exists but was modified
			operations.push({
				type: 'MODIFY_COLUMN',
				tableName: newTable.tableName,
				columnName: name,
				columnDefinition: newCol,
				sql: generateModifyColumnSQL(newTable.tableName, oldCol, newCol),
			});
		}
	}

	// Handle remaining column removals
	for (const [name, oldCol] of oldColumns.entries()) {
		// Skip columns that were already handled as renames
		if (handledOldColumns.has(name)) continue;
		
		// Column exists in old but not in new table and wasn't renamed
		if (!newColumns.has(name)) {
			operations.push({
				type: 'DROP_COLUMN',
				tableName: newTable.tableName,
				columnName: name,
				sql: `ALTER TABLE ${newTable.tableName} DROP COLUMN ${name};`,
			});
		}
	}

	return operations;
}

/**
 * Detect potential column renames between table versions
 * Uses heuristics like name similarity, type similarity, and position
 */
function detectColumnRenames(
	oldTable: TableDefinition,
	newTable: TableDefinition
): RenameCandidate[] {
	const renamedColumns: RenameCandidate[] = [];
	const oldColumns = new Map<string, ColumnDefinition>();
	oldTable.columns.forEach((col) => oldColumns.set(col.name, col));

	const newColumns = new Map<string, ColumnDefinition>();
	newTable.columns.forEach((col) => newColumns.set(col.name, col));
	
	// Find columns that exist in old table but not in new table
	const removedColumns = [...oldColumns.keys()]
		.filter(oldCol => !newColumns.has(oldCol))
		.map(name => oldColumns.get(name)!);
	
	// Find columns that exist in new table but not in old table
	const addedColumns = [...newColumns.keys()]
		.filter(newCol => !oldColumns.has(newCol))
		.map(name => newColumns.get(name)!);
	
	// No potential renames if no columns were removed or added
	if (removedColumns.length === 0 || addedColumns.length === 0) {
		return [];
	}
	
	// Calculate similarity scores between each removed and added column
	const candidates: Array<{
		oldColumn: ColumnDefinition;
		newColumn: ColumnDefinition;
		score: number;
	}> = [];
	
	for (const oldCol of removedColumns) {
		for (const newCol of addedColumns) {
			const score = calculateColumnSimilarityScore(oldCol, newCol);
			candidates.push({
				oldColumn: oldCol,
				newColumn: newCol,
				score
			});
		}
	}
	
	// Sort candidates by score in descending order
	candidates.sort((a, b) => b.score - a.score);
	
	// Keep track of columns that have been assigned
	const assignedOldColumns = new Set<string>();
	const assignedNewColumns = new Set<string>();
	
	// Select the best candidates, only considering each column once
	for (const candidate of candidates) {
		if (candidate.score < 0.3) {
			// Skip very low confidence matches
			continue;
		}
		
		const oldName = candidate.oldColumn.name;
		const newName = candidate.newColumn.name;
		
		if (!assignedOldColumns.has(oldName) && !assignedNewColumns.has(newName)) {
			renamedColumns.push({
				oldColumn: oldName,
				newColumn: newName,
				score: candidate.score
			});
			
			assignedOldColumns.add(oldName);
			assignedNewColumns.add(newName);
		}
	}
	
	return renamedColumns;
}

/**
 * Calculate a similarity score between two columns based on various factors
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function calculateColumnSimilarityScore(
	oldCol: ColumnDefinition,
	newCol: ColumnDefinition
): number {
	// Name similarity (using Levenshtein distance or similar metrics)
	const nameSimilarity = calculateNameSimilarity(oldCol.name, newCol.name);
	
	// Type similarity
	const typeSimilarity = oldCol.dataType === newCol.dataType ? 1 : 0.5;
	
	// Constraint similarity
	let constraintSimilarity = 0;
	const totalConstraints = 4; // nullable, primary key, unique, default value
	let matchingConstraints = 0;
	
	if (oldCol.isNullable === newCol.isNullable) matchingConstraints++;
	if (oldCol.isPrimaryKey === newCol.isPrimaryKey) matchingConstraints++;
	if (oldCol.isUnique === newCol.isUnique) matchingConstraints++;
	if (oldCol.defaultValue === newCol.defaultValue) matchingConstraints++;
	
	constraintSimilarity = matchingConstraints / totalConstraints;
	
	// Combine scores with weights
	// Name similarity is most important, followed by type, then constraints
	const weightedScore = 
		0.5 * nameSimilarity + 
		0.35 * typeSimilarity + 
		0.15 * constraintSimilarity;
	
	return weightedScore;
}

/**
 * Calculate similarity between two column names
 * Uses heuristics for common rename patterns and string similarity
 */
function calculateNameSimilarity(name1: string, name2: string): number {
	// Normalize names for comparison
	const norm1 = name1.toLowerCase();
	const norm2 = name2.toLowerCase();
	
	// Check for exact match after normalization
	if (norm1 === norm2) return 1;
	
	// Check for common rename patterns
	
	// 1. Prefix/suffix changes (e.g., ext_billing_id → billing_id)
	if (norm1.endsWith(norm2) || norm2.endsWith(norm1)) return 0.9;
	if (norm1.startsWith(norm2) || norm2.startsWith(norm1)) return 0.9;
	
	// 2. Common abbreviation patterns (e.g., user_name → username)
	const name1NoUnderscores = norm1.replace(/_/g, '');
	const name2NoUnderscores = norm2.replace(/_/g, '');
	if (name1NoUnderscores === name2NoUnderscores) return 0.9;
	
	// 3. Simple string edit distance
	const distance = levenshteinDistance(norm1, norm2);
	const maxLength = Math.max(norm1.length, norm2.length);
	const normalizedDistance = 1 - (distance / maxLength);
	
	// 4. Word similarity (for multi-word column names)
	const words1 = norm1.split('_');
	const words2 = norm2.split('_');
	
	// If both have multiple words, check word-level similarity
	if (words1.length > 1 && words2.length > 1) {
		let wordMatches = 0;
		
		for (const word1 of words1) {
			if (words2.includes(word1)) wordMatches++;
		}
		
		const wordSimilarity = (wordMatches / Math.max(words1.length, words2.length));
		
		// Use the higher of string distance and word similarity
		return Math.max(normalizedDistance, wordSimilarity);
	}
	
	// Otherwise use the normalized string distance
	return normalizedDistance;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
	const m = str1.length;
	const n = str2.length;
	
	// Create distance matrix
	const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
	
	// Initialize first row and column
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (str1[i - 1] === str2[j - 1]) {
				// No operation required
				dp[i][j] = dp[i - 1][j - 1];
			} else {
				// Minimum of insert, delete, or replace
				dp[i][j] = Math.min(
					dp[i - 1][j] + 1,    // deletion
					dp[i][j - 1] + 1,    // insertion
					dp[i - 1][j - 1] + 1 // substitution
				);
			}
		}
	}
	
	return dp[m][n];
}

/**
 * Check if two columns are equal in all aspects except name
 */
function columnsEqualExceptName(col1: ColumnDefinition, col2: ColumnDefinition): boolean {
	return (
		col1.dataType === col2.dataType &&
		col1.isNullable === col2.isNullable &&
		col1.isPrimaryKey === col2.isPrimaryKey &&
		col1.isUnique === col2.isUnique &&
		col1.defaultValue === col2.defaultValue &&
		isEqualForeignKey(col1.foreignKey, col2.foreignKey) &&
		col1.checkConstraint === col2.checkConstraint
	);
}

/**
 * Check if two column definitions are equal
 */
function columnsEqual(col1: ColumnDefinition, col2: ColumnDefinition): boolean {
	return (
		col1.name === col2.name &&
		col1.dataType === col2.dataType &&
		col1.isNullable === col2.isNullable &&
		col1.isPrimaryKey === col2.isPrimaryKey &&
		col1.isUnique === col2.isUnique &&
		col1.defaultValue === col2.defaultValue &&
		isEqualForeignKey(col1.foreignKey, col2.foreignKey) &&
		col1.checkConstraint === col2.checkConstraint
	);
}

/**
 * Compare two foreign key definitions for equality
 */
function isEqualForeignKey(fk1?: ColumnDefinition['foreignKey'], fk2?: ColumnDefinition['foreignKey']): boolean {
	// Both undefined or null - considered equal
	if (!fk1 && !fk2) return true;
	
	// One defined but the other isn't - not equal
	if ((!fk1 && fk2) || (fk1 && !fk2)) return false;
	
	// Both defined - check all properties
	return (
		fk1!.referencedTable === fk2!.referencedTable &&
		fk1!.referencedColumn === fk2!.referencedColumn &&
		(fk1!.onDelete || null) === (fk2!.onDelete || null) &&
		(fk1!.onUpdate || null) === (fk2!.onUpdate || null)
	);
}

/**
 * Generate SQL to add a column to a table
 */
function generateAddColumnSQL(
	tableName: string,
	column: ColumnDefinition
): string {
	let sql = `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.dataType}`;

	if (!column.isNullable) {
		sql += ' NOT NULL';
	}

	if (column.defaultValue !== null) {
		sql += ` DEFAULT ${column.defaultValue}`;
	}

	if (column.isPrimaryKey) {
		sql += ' PRIMARY KEY';
	}

	if (column.isUnique && !column.isPrimaryKey) {
		sql += ' UNIQUE';
	}

	if (column.foreignKey) {
		sql += ` REFERENCES ${column.foreignKey.referencedTable}(${column.foreignKey.referencedColumn})`;
		if (column.foreignKey.onDelete) {
			sql += ` ON DELETE ${column.foreignKey.onDelete}`;
		}
		if (column.foreignKey.onUpdate) {
			sql += ` ON UPDATE ${column.foreignKey.onUpdate}`;
		}
	}

	if (column.checkConstraint) {
		sql += ` CHECK (${column.checkConstraint})`;
	}

	return sql + ';';
}

/**
 * Generate SQL to modify a column's definition
 * PostgreSQL requires multiple ALTER statements to fully modify a column
 */
function generateModifyColumnSQL(
	tableName: string,
	oldColumn: ColumnDefinition,
	newColumn: ColumnDefinition
): string {
	const alterStatements: string[] = [];

	// Type change
	if (oldColumn.dataType !== newColumn.dataType) {
		alterStatements.push(
			`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} TYPE ${newColumn.dataType} USING ${newColumn.name}::${newColumn.dataType};`
		);
	}

	// NOT NULL constraint
	if (oldColumn.isNullable !== newColumn.isNullable) {
		if (newColumn.isNullable) {
			alterStatements.push(
				`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} DROP NOT NULL;`
			);
		} else {
			alterStatements.push(
				`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} SET NOT NULL;`
			);
		}
	}

	// Default value
	if (oldColumn.defaultValue !== newColumn.defaultValue) {
		if (newColumn.defaultValue === null) {
			alterStatements.push(
				`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} DROP DEFAULT;`
			);
		} else {
			alterStatements.push(
				`ALTER TABLE ${tableName} ALTER COLUMN ${newColumn.name} SET DEFAULT ${newColumn.defaultValue};`
			);
		}
	}

	// UNIQUE constraint
	if (oldColumn.isUnique !== newColumn.isUnique) {
		if (newColumn.isUnique) {
			alterStatements.push(
				`ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${newColumn.name}_unique UNIQUE (${newColumn.name});`
			);
		} else {
			alterStatements.push(
				`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_${oldColumn.name}_unique;`
			);
		}
	}

	// PRIMARY KEY constraint
	if (oldColumn.isPrimaryKey !== newColumn.isPrimaryKey) {
		if (newColumn.isPrimaryKey) {
			alterStatements.push(
				`ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${newColumn.name}_pkey PRIMARY KEY (${newColumn.name});`
			);
		} else {
			alterStatements.push(
				`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_${oldColumn.name}_pkey;`
			);
		}
	}

	// FOREIGN KEY constraint
	const oldFk = oldColumn.foreignKey;
	const newFk = newColumn.foreignKey;
	
	// Determine if foreign key changed
	const foreignKeyChanged = 
		(!oldFk && newFk) || 
		(oldFk && !newFk) || 
		(oldFk && newFk && (
			oldFk.referencedTable !== newFk.referencedTable ||
			oldFk.referencedColumn !== newFk.referencedColumn ||
			oldFk.onDelete !== newFk.onDelete ||
			oldFk.onUpdate !== newFk.onUpdate
		));
		
	if (foreignKeyChanged) {
		// Drop old foreign key constraint if it existed
		if (oldFk) {
			alterStatements.push(
				`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_${oldColumn.name}_fk;`
			);
		}
		
		// Add new foreign key constraint if it exists
		if (newFk) {
			let fkSql = `ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${newColumn.name}_fk ` +
				`FOREIGN KEY (${newColumn.name}) ` +
				`REFERENCES ${newFk.referencedTable}(${newFk.referencedColumn})`;
				
			if (newFk.onDelete) {
				fkSql += ` ON DELETE ${newFk.onDelete}`;
			}
			
			if (newFk.onUpdate) {
				fkSql += ` ON UPDATE ${newFk.onUpdate}`;
			}
			
			alterStatements.push(fkSql + ';');
		}
	}

	// CHECK constraint
	const oldCheck = oldColumn.checkConstraint;
	const newCheck = newColumn.checkConstraint;
	
	if (oldCheck !== newCheck) {
		if (oldCheck) {
			alterStatements.push(
				`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_${oldColumn.name}_check;`
			);
		}
		
		if (newCheck) {
			alterStatements.push(
				`ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${newColumn.name}_check CHECK (${newCheck});`
			);
		}
	}

	return alterStatements.join('\n');
}
