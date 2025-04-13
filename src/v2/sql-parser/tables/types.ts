import { Differences, ParserType } from '../types';

/**
 * Represents the parsed structure of a CREATE TABLE statement.
 */
export interface TableDefinition {
	schema: string;
	tableName: string;
	columns: ColumnDefinition[];
	// tableConstraints?: TableConstraint[]; // Optional: Add table-level constraints later
}

/**
 * Represents the detailed definition of a database column.
 */
export interface ColumnDefinition {
	name: string;
	dataType: string; // e.g., 'INT', 'VARCHAR(255)', 'TIMESTAMP WITH TIME ZONE'
	isNullable: boolean;
	defaultValue: string | number | null; // Store the default value expression/literal
	isPrimaryKey: boolean;
	isUnique: boolean;
	// Add other constraints or attributes as needed, e.g., check constraints, foreign key references (might be complex)
	foreignKey?: {
		referencedTable: string;
		referencedColumn: string;
		onDelete?: string; // e.g., 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'
		onUpdate?: string; // e.g., 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'
	};
	checkConstraint?: string; // e.g., 'a > 0', 'b IN (1, 2, 3)'
}

export interface DeclarativeTableParsedContent extends ParserType {
	type: 'DeclarativeTable';
	tableDefinition: TableDefinition;
}

export interface DeclarativeTableDifferences extends Differences {
	type: 'DeclarativeTable';
	oldState?: TableDefinition;
	newState: TableDefinition;
}