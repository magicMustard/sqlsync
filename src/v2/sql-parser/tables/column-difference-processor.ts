import { ColumnDefinition, TableDefinition, DeclarativeTableDifferences } from './types';
import { SqlItem } from '../types';

/**
 * Class responsible for processing differences between old and new column definitions
 * and generating appropriate SQL ALTER statements for column changes.
 */
export class ColumnDifferenceProcessor {
	private userPrompts: string[] = [];

	/**
	 * Processes differences between old and new table states to generate ALTER statements
	 * for column changes. Prompts user for confirmation on ambiguous changes.
	 * @param differences The differences between old and new table definitions.
	 * @returns An array of SqlItem objects representing ALTER statements and prompts.
	 */
	public processColumnDifferences(differences: DeclarativeTableDifferences): SqlItem[] {
		const sqlItems: SqlItem[] = [];
		this.userPrompts = [];

		const oldColumns = differences.oldState?.columns || [];
		const newColumns = differences.newState.columns || [];

		// Maps to quickly lookup columns by name
		const oldColumnMap = new Map<string, ColumnDefinition>(oldColumns.map(col => [col.name, col]));
		const newColumnMap = new Map<string, ColumnDefinition>(newColumns.map(col => [col.name, col]));

		// Check for added or modified columns
		for (const newCol of newColumns) {
			const oldCol = oldColumnMap.get(newCol.name);
			if (!oldCol) {
				// New column added
				sqlItems.push({
					sql: `ALTER TABLE ${differences.newState.tableName} ADD COLUMN ${this.formatColumnDefinition(newCol)};`
				});
			} else if (!this.areColumnsEqual(oldCol, newCol)) {
				// Column modified
				sqlItems.push({
					sql: `ALTER TABLE ${differences.newState.tableName} MODIFY COLUMN ${this.formatColumnDefinition(newCol)};`
				});
				if (this.isComplexChange(oldCol, newCol)) {
					this.userPrompts.push(
						`Column ${newCol.name} has a complex change (e.g., type change). Please review and add any necessary data migration steps to the migration file.`
					);
				}
			}
		}

		// Check for removed columns or potential renames
		for (const oldCol of oldColumns) {
			if (!newColumnMap.has(oldCol.name)) {
				// Column removed or possibly renamed
				this.userPrompts.push(
					`Column ${oldCol.name} is missing in the new definition. Was it renamed or should it be dropped? Reply with 'rename to <newname>' or 'drop' for ${oldCol.name}.`
				);
				// Add a placeholder for drop, to be confirmed by user
				sqlItems.push({
					sql: `-- PENDING CONFIRMATION: ALTER TABLE ${differences.newState.tableName} DROP COLUMN ${oldCol.name};`
				});
			}
		}

		// Add user prompts as comments in the SQL items
		if (this.userPrompts.length > 0) {
			const promptText = `-- USER ACTION REQUIRED:\n${this.userPrompts.map(p => `-- ${p}`).join('\n')}`;
			sqlItems.unshift({
				sql: promptText
			});
		}

		return sqlItems;
	}

	/**
	 * Formats a column definition into a SQL string.
	 * @param col The column definition.
	 * @returns A formatted SQL string for the column.
	 */
	private formatColumnDefinition(col: ColumnDefinition): string {
		let sql = `${col.name} ${col.dataType}`;
		if (!col.isNullable) {
			sql += ` NOT NULL`;
		}
		if (col.defaultValue !== null) {
			sql += ` DEFAULT ${col.defaultValue}`;
		}
		if (col.isPrimaryKey) {
			sql += ` PRIMARY KEY`;
		}
		if (col.isUnique) {
			sql += ` UNIQUE`;
		}
		if (col.foreignKey) {
			sql += ` REFERENCES ${col.foreignKey.referencedTable}(${col.foreignKey.referencedColumn})`;
			if (col.foreignKey.onDelete) {
				sql += ` ON DELETE ${col.foreignKey.onDelete}`;
			}
			if (col.foreignKey.onUpdate) {
				sql += ` ON UPDATE ${col.foreignKey.onUpdate}`;
			}
		}
		if (col.checkConstraint) {
			sql += ` CHECK (${col.checkConstraint})`;
		}
		return sql;
	}

	/**
	 * Compares two column definitions for equality.
	 * @param oldCol The old column definition.
	 * @param newCol The new column definition.
	 * @returns True if the columns are considered equal, false otherwise.
	 */
	private areColumnsEqual(oldCol: ColumnDefinition, newCol: ColumnDefinition): boolean {
		return (
			oldCol.name === newCol.name &&
			oldCol.dataType === newCol.dataType &&
			oldCol.isNullable === newCol.isNullable &&
			oldCol.defaultValue === newCol.defaultValue &&
			oldCol.isPrimaryKey === newCol.isPrimaryKey &&
			oldCol.isUnique === newCol.isUnique &&
			this.areForeignKeysEqual(oldCol.foreignKey, newCol.foreignKey) &&
			oldCol.checkConstraint === newCol.checkConstraint
		);
	}

	/**
	 * Compares two foreign key definitions for equality.
	 * @param oldFk The old foreign key definition.
	 * @param newFk The new foreign key definition.
	 * @returns True if the foreign keys are considered equal, false otherwise.
	 */
	private areForeignKeysEqual(oldFk: ColumnDefinition['foreignKey'], newFk: ColumnDefinition['foreignKey']): boolean {
		if (!oldFk && !newFk) return true;
		if (!oldFk || !newFk) return false;
		return (
			oldFk.referencedTable === newFk.referencedTable &&
			oldFk.referencedColumn === newFk.referencedColumn &&
			oldFk.onDelete === newFk.onDelete &&
			oldFk.onUpdate === newFk.onUpdate
		);
	}

	/**
	 * Determines if the change between two column definitions is complex (e.g., type change).
	 * @param oldCol The old column definition.
	 * @param newCol The new column definition.
	 * @returns True if the change is complex, false otherwise.
	 */
	private isComplexChange(oldCol: ColumnDefinition, newCol: ColumnDefinition): boolean {
		return oldCol.dataType !== newCol.dataType;
	}

	/**
	 * Retrieves the list of user prompts generated during processing.
	 * @returns An array of prompt messages for the user.
	 */
	public getUserPrompts(): string[] {
		return [...this.userPrompts];
	}
}
