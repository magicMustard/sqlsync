import { DeclarativeTableParser } from './tables/declarative-table-parser';
import { FileContentParser } from './files/file-content-parser';
import { SplitStatementParser } from './statements/split-statement-parser';
import {
	SqlFileType,
	SqlCommentFlags,
	SqlContentParser,
	SqlContent,
} from './types';
import { normalizeSqlSyncComments, stripComments } from './funcs';

export class SqlFileParser {
	private readonly _cleanSqlContent: SqlContent;
	private readonly _sqlFileType: SqlFileType;
	private readonly _sqlContentParser: SqlContentParser;

	constructor(private readonly originalSqlContent: SqlContent) {
		this._cleanSqlContent = normalizeSqlSyncComments(this.originalSqlContent);
		this._cleanSqlContent = stripComments(this._cleanSqlContent);

		// let's get the file type
		this._sqlFileType = this.getFileType();

		switch (this._sqlFileType) {
			case 'DeclarativeTable':
				this._sqlContentParser = new DeclarativeTableParser(
					this._cleanSqlContent
				);
			case 'SplitStatements':
				this._sqlContentParser = new SplitStatementParser(
					this._cleanSqlContent
				);
			case 'FileContent':
				this._sqlContentParser = new FileContentParser(this._cleanSqlContent);
		}
	}

	get cleanSqlContent(): SqlContent {
		return this._cleanSqlContent;
	}

	get sqlFileType(): SqlFileType {
		return this._sqlFileType;
	}

	get sqlContentParser(): SqlContentParser {
		return this._sqlContentParser;
	}

	public processSqlContent(): void {
		this._sqlContentParser.process();
	}

	private getFileType(): SqlFileType {
		const lines = this._cleanSqlContent.split('\n');
		let fileType: SqlFileType = 'FileContent';
		let foundFlag = false;

		// Check the first non-empty, non-comment line or first comment with flag
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.length === 0) continue;

			if (line.startsWith('--')) {
				const flagMatch = line.match(
					new RegExp(
						`--\\s*${SqlCommentFlags.declarer}\\s*:(?:\\s)*(declarativeTable|splitStatements)`
					)
				);
				if (flagMatch) {
					if (
						i > 0 &&
						lines
							.slice(0, i)
							.some((l) => l.trim().length > 0 && !l.trim().startsWith('--'))
					) {
						throw new Error(
							`Invalid placement of file type flag: Flag must be at the top of the file before any non-comment content.`
						);
					}
					foundFlag = true;
					const flagType = flagMatch[1];
					if (flagType === 'declarativeTable') {
						fileType = 'DeclarativeTable';
					} else if (flagType === 'splitStatements') {
						// Check for at least one startStatement or endStatement marker
						const hasStart = this._cleanSqlContent.includes(
							`${SqlCommentFlags.declarer}: startStatement`
						);
						const hasEnd = this._cleanSqlContent.includes(
							`${SqlCommentFlags.declarer}: endStatement`
						);
						if (!hasStart && !hasEnd) {
							throw new Error(
								`Missing statement markers: At least one 'startStatement' or 'endStatement' marker is required for splitStatements.`
							);
						}
						fileType = 'SplitStatements';
					}
				}
			} else {
				// Non-comment line encountered, break if we haven't found a flag yet
				if (!foundFlag) break;
			}
		}

		// Check if flags appear anywhere else in the file after the top section
		if (foundFlag) {
			const topSectionEnd = lines.findIndex(
				(line, index) =>
					index > 0 && line.trim().length > 0 && !line.trim().startsWith('--')
			);
			const restOfFile =
				topSectionEnd >= 0 ? lines.slice(topSectionEnd).join('\n') : '';
			if (
				restOfFile.match(
					new RegExp(
						`--\\s*${SqlCommentFlags.declarer}\\s*:(?:\\s)*(declarativeTable|splitStatements)`,
						'i'
					)
				)
			) {
				throw new Error(
					`Invalid placement of file type flag: Flag must only appear at the top of the file.`
				);
			}
		}

		return fileType;
	}
}
