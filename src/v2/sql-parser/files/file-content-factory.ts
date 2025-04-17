import { SqlContent, SqlItem, SqlStatementFactory } from "../types";
import { FileContentDifferences } from "./types";

export class FileContentFactory implements SqlStatementFactory {
	constructor(
		private readonly cleanSqlContent: SqlContent,
		private readonly checksum: string
	) {}

	create(differences: FileContentDifferences): SqlItem[] {
		if (differences.different) {
			return [{
				sql: this.cleanSqlContent,
				checksum: this.checksum
			}];
		}

		return [];
	}
}