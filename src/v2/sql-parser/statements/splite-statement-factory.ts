import { SqlItem, SqlStatementFactory } from "../types";
import { SplitStatementDifferences, SplitStatementChecksums } from "./types";

export class SplitStatementFactory implements SqlStatementFactory {
	constructor(
		private readonly sqlStatements: SplitStatementChecksums
	) {}

	create(differences: SplitStatementDifferences): SqlItem[] {
		if (differences.different) {
			const resultStatements = differences.differentStatements
				.map(checksum => {
					if (!this.sqlStatements[checksum]) {
						console.warn(`Warning: Checksum ${checksum} not found in sqlStatements.`);
						return undefined;
					}
					return {
						sql: this.sqlStatements[checksum],
						checksum: checksum
					};
				})
				.filter(statement => statement !== undefined) as SqlItem[];
			
			if (resultStatements.length > 0) {
				return resultStatements;
			}
		}
		
		return [];
	}
}