import { MigrationState } from './types';
import { ParserType, Differences } from '../sql-parser/types';
import {
	SplitStatementParsedContent,
	SplitStatementDifferences,
} from '../sql-parser/statements/types';
import {
	DeclarativeTableParsedContent,
	DeclarativeTableDifferences,
} from '../sql-parser/tables/types';
import {
	FileContentParsedContent,
	FileContentDifferences,
} from '../sql-parser/files/types';
import { ColumnDefinition } from '../sql-parser/tables/types';

export class Comparer {
	constructor(
		private currentState: MigrationState,
		private filePath: string
	) {}

	compare(parsedContent: ParserType): Differences {
		switch (parsedContent.type) {
			case 'SplitStatements':
				return this.compareSplitStatements(
					parsedContent as SplitStatementParsedContent
				);
			case 'DeclarativeTable':
				return this.compareDeclarativeTable(
					parsedContent as DeclarativeTableParsedContent
				);
			case 'FileContent':
				return this.compareFileContent(
					parsedContent as FileContentParsedContent
				);
			default:
				throw new Error(
					`Unsupported parsed content type: ${parsedContent.type}`
				);
		}
	}

	private compareSplitStatements(
		content: SplitStatementParsedContent
	): SplitStatementDifferences {
		const migrationState = this.currentState;
		// Use the provided filePath to access the correct checksum array
		const existingChecksums =
			migrationState &&
			migrationState.splitStatements &&
			migrationState.splitStatements[this.filePath]
				? migrationState.splitStatements[this.filePath]
				: [];
		const newChecksums = content.checksums;
		const differentStatements = newChecksums.filter(
			(checksum) => !existingChecksums.includes(checksum)
		);

		return {
			type: 'SplitStatements',
			different: differentStatements.length > 0,
			differentStatements,
		};
	}

	private compareDeclarativeTable(
		content: DeclarativeTableParsedContent
	): DeclarativeTableDifferences {
		const migrationState = this.currentState;
		const existingTables =
			migrationState && migrationState.declarativeTables
				? migrationState.declarativeTables
				: {};
		const oldTableDef = existingTables[this.filePath];
		const newTableDef = content.tableDefinition;

		let different = false;
		if (!oldTableDef) {
			different = true;
		} else {
			// Compare table schema and name
			if (
				oldTableDef.schema !== newTableDef.schema ||
				oldTableDef.tableName !== newTableDef.tableName
			) {
				different = true;
			}
			// Compare columns length
			if (oldTableDef.columns.length !== newTableDef.columns.length) {
				different = true;
			} else {
				// Detailed column comparison
				for (let i = 0; i < oldTableDef.columns.length; i++) {
					if (
						this.areColumnsDifferent(
							oldTableDef.columns[i],
							newTableDef.columns[i]
						)
					) {
						different = true;
						break;
					}
				}
			}
		}

		return {
			type: 'DeclarativeTable',
			different,
			oldState: oldTableDef,
			newState: newTableDef,
		};
	}

	private compareFileContent(
		content: FileContentParsedContent
	): FileContentDifferences {
		const migrationState = this.currentState;
		// Use the provided filePath to access the correct checksum
		const existingChecksumObj =
			migrationState &&
			migrationState.fileContentChecksums &&
			migrationState.fileContentChecksums[this.filePath]
				? migrationState.fileContentChecksums[this.filePath]
				: null;
		const existingChecksum = existingChecksumObj
			? existingChecksumObj.checksum
			: '';
		const newChecksum = content.checksum;

		return {
			type: 'FileContent',
			different: existingChecksum !== newChecksum,
		};
	}

	private areColumnsDifferent(
		oldCol: ColumnDefinition,
		newCol: ColumnDefinition
	): boolean {
		return (
			oldCol.name !== newCol.name ||
			oldCol.dataType !== newCol.dataType ||
			oldCol.isNullable !== newCol.isNullable ||
			oldCol.defaultValue !== newCol.defaultValue ||
			oldCol.isPrimaryKey !== newCol.isPrimaryKey ||
			oldCol.isUnique !== newCol.isUnique ||
			// Check foreign key if it exists
			(oldCol.foreignKey && newCol.foreignKey
				? oldCol.foreignKey.referencedTable !==
						newCol.foreignKey.referencedTable ||
					oldCol.foreignKey.referencedColumn !==
						newCol.foreignKey.referencedColumn ||
					oldCol.foreignKey.onDelete !== newCol.foreignKey.onDelete ||
					oldCol.foreignKey.onUpdate !== newCol.foreignKey.onUpdate
				: oldCol.foreignKey !== newCol.foreignKey) ||
			// Check constraint if it exists
			oldCol.checkConstraint !== newCol.checkConstraint
		);
	}
}
