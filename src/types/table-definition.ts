// /home/tim/Development/sqlsync/src/types/table-definition.ts

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
	// foreignKey?: { referencedTable: string; referencedColumn: string; onDelete?: string; onUpdate?: string };
	// checkConstraint?: string;
}

/**
 * Represents table-level constraints (could expand later if needed).
 * For now, mainly focusing on column-level definitions extracted.
 */
// export interface TableConstraint {
//   type: 'PRIMARY KEY' | 'UNIQUE' | 'FOREIGN KEY' | 'CHECK';
//   columns: string[];
//   // ... other properties depending on type
// }

/**
 * Represents the parsed structure of a CREATE TABLE statement.
 */
export interface TableDefinition {
	tableName: string;
	columns: ColumnDefinition[];
	// tableConstraints?: TableConstraint[]; // Optional: Add table-level constraints later
}
