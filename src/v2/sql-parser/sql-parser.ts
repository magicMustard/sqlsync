import { DeclarativeTableParser } from './tables/declarative-table-parser';
import { FileContentParser } from './files/file-content-parser';
import { SplitStatementParser } from './statements/split-statement-parser';
import {
	SqlFileType,
	SqlCommentFlags,
	SqlContentParser,
	SqlContent,
	ParserType,
	Differences,
	SqlStatementFactory,
	SqlTokenContext,
} from './types';
import { normalizeSqlSyncComments, stripComments, stripWhitespace } from './funcs';
import { DeclarativeTableStatementFactory } from './tables/declarative-table-statement-factory';
import { SplitStatementFactory } from './statements/splite-statement-factory';
import { FileContentFactory } from './files/file-content-factory';
import { getHash } from '@/utils/crypto';

export class SqlFileParser {
	private readonly sqlToken: SqlTokenContext;
	private readonly sqlContentParser: SqlContentParser;
	private readonly sqlStatementFactory: SqlStatementFactory;

	constructor(
		private readonly originalSqlContent: SqlContent,
		private readonly filePath: string
	) {
		const cleanSqlContent = stripComments(normalizeSqlSyncComments(this.originalSqlContent));
		const strippedSqlContent = stripWhitespace(cleanSqlContent);

		this.sqlToken = {
			original: originalSqlContent,
			filePath: filePath,
			fileType: this.getFileType(strippedSqlContent),
			clean: cleanSqlContent,
			stripped: strippedSqlContent,
			checksum: getHash(strippedSqlContent),
		};

		switch (this.sqlToken.fileType) {
			case 'DeclarativeTable':
				this.sqlContentParser = new DeclarativeTableParser(this.sqlToken);
				this.sqlStatementFactory = new DeclarativeTableStatementFactory();
				break;
			case 'SplitStatements':
				const ssp = new SplitStatementParser(this.originalSqlContent);
				this.sqlContentParser = ssp;
				this.sqlStatementFactory = new SplitStatementFactory(ssp.statements);
				break;
			default: //('FileContent')
				const fcp = new FileContentParser(this.originalSqlContent);
				this.sqlContentParser = fcp;
				this.sqlStatementFactory = new FileContentFactory(fcp.sqlContent, fcp.checksum);
				break;
		}
	}

	public processSqlContent(): ParserType {
		return this.sqlContentParser.process();
	}

	public generateSqlStatements(differences: Differences): SqlTokenContext[] {
		return this.sqlStatementFactory.create(differences);
	}

	private getFileType(content: SqlContent): SqlFileType {
		const lines = content.split('\n');
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
						const hasStart = content.includes(
							`${SqlCommentFlags.declarer}: startStatement`
						);
						const hasEnd = content.includes(
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
