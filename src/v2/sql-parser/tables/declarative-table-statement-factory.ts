import { SqlItem, SqlTokenContext } from '../types';
import { DeclarativeTableDifferences } from './types';
import { ColumnDifferenceProcessor } from './column-difference-processor';

export class DeclarativeTableStatementFactory {
	/**
	 * Creates SQL statements based on declarative table differences.
	 * Focuses on table name changes and delegates column differences to a processor.
	 * @param differences The differences between old and new table states.
	 * @returns An array of SqlTokenContext objects representing SQL statements.
	 */
	public create(differences: DeclarativeTableDifferences): SqlTokenContext[] {
		const sqlItems: SqlTokenContext[] = [];

		// Handle table name change if applicable
		if (differences.oldState && differences.oldState.tableName !== differences.newState.tableName) {
			sqlItems.push({
				sql: `ALTER TABLE ${differences.oldState.tableName} RENAME TO ${differences.newState.tableName};`,
			});
		}

		// Process column differences using the helper class
		const columnProcessor = new ColumnDifferenceProcessor();
		const columnSqlItems = columnProcessor.processColumnDifferences(differences);
		sqlItems.push(...columnSqlItems);

		return sqlItems;
	}
}