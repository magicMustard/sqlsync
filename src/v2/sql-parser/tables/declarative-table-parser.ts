import { TableDefinition, ColumnDefinition } from './types';
import { SqlContent, SqlContentParser, SqlTokenContext } from '../types';
import { DeclarativeTableParsedContent } from './types';
import { ColumnDefinitionFactory } from './column-definition-factory'; // Assuming the Column class is in a separate file

export class DeclarativeTableParser implements SqlContentParser {
	private tableDefinition: TableDefinition | null = null;

	constructor(public readonly sqlToken: SqlTokenContext) {
		this.extractTableDefinition();
	}

	process(): DeclarativeTableParsedContent {
		if (!this.tableDefinition) {
			throw new Error('Failed to parse table definition');
		}
		return {
			type: 'DeclarativeTable',
			tableDefinition: this.tableDefinition,
		};
	}

	private extractTableDefinition(): void {
		// Normalize SQL for consistent parsing
		const normalizedSql = this.sqlToken.stripped;

		// Check if it's a CREATE TABLE statement
		if (!normalizedSql.match(/^CREATE\s+TABLE\s+/i)) {
			throw new Error('Invalid CREATE TABLE statement');
		}

		// Extract table info (schema and name)
		const tableInfo = this.extractTableInfo(normalizedSql);
		if (!tableInfo) {
			throw new Error(
				'Could not extract table name from CREATE TABLE statement'
			);
		}

		// Extract column definitions content
		const columnsContent = this.extractColumnsContent(normalizedSql);
		if (!columnsContent) {
			throw new Error(
				'Could not find column definitions in CREATE TABLE statement'
			);
		}

		// Parse columns into structured data
		const columns = this.parseColumns(columnsContent);
		if (columns.length === 0) {
			throw new Error(
				'No valid column definitions found in CREATE TABLE statement'
			);
		}

		// Assign the parsed table definition
		this.tableDefinition = {
			schema: tableInfo.schema,
			tableName: tableInfo.tableName,
			columns,
		};
	}

	private extractTableInfo(
		sql: string
	): { schema: string; tableName: string } | null {
		const tableMatch = sql.match(/CREATE\s+TABLE\s+([\w.]+)/i);
		if (!tableMatch) {
			return null;
		}

		const tableFullName = tableMatch[1];
		let schema = 'public'; // Default schema if not specified
		let tableName = tableFullName;

		if (tableFullName.includes('.')) {
			const parts = tableFullName.split('.');
			schema = parts[0];
			tableName = parts[1];
		}

		return { schema, tableName };
	}

	private extractColumnsContent(sql: string): string | null {
		const columnsContentMatch = sql.match(/\(([^)]+)\)/);
		return columnsContentMatch ? columnsContentMatch[1] : null;
	}

	private parseColumns(columnsContent: string): ColumnDefinition[] {
		const columnStrings = columnsContent.split(',').map((col) => col.trim());
		const columns: ColumnDefinition[] = [];

		for (const colStr of columnStrings) {
			const column = new ColumnDefinitionFactory(colStr);
			const columnDefinition = column.getColumnDefinition();
			if (columnDefinition.name && columnDefinition.dataType) {
				columns.push(columnDefinition);
			}
		}

		return columns;
	}
}
