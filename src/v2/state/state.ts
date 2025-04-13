import { SqlSyncState, StateContent, MigrationState } from './types';
import { Comparer } from './comparer';
import { ParserType, Differences } from '../sql-parser/types';

export class State {
	private state: SqlSyncState;
	private latestMigrationFilename: string | null = null;
	private latestMigrationState: MigrationState | null = null;

	constructor(private stateContent: StateContent) {
		this.state = JSON.parse(stateContent);
		this.extractLatestMigration();
	}

	public getState(): SqlSyncState {
		return this.state;
	}

	public compareContent(filePath: string, parsedContent: ParserType): Differences {
		const migrationState = this.latestMigrationState || {
			fileContentChecksums: {},
			splitStatements: {},
			declarativeTables: {}
		};
		const comparer = new Comparer(migrationState, filePath);
		return comparer.compare(parsedContent);
	}

	private extractLatestMigration(): void {
		const migrationFilenames = Object.keys(this.state);
		if (migrationFilenames.length > 0) {
			// Sort filenames to find the latest based on timestamp (assuming format includes timestamp)
			this.latestMigrationFilename = migrationFilenames.sort().reverse()[0];
			this.latestMigrationState = this.state[this.latestMigrationFilename] || null;
		} else {
			this.latestMigrationFilename = null;
			this.latestMigrationState = null;
		}
	}
}
