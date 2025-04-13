import { SqlContent, SqlContentParser, SqlCommentFlags } from '../types';
import { SplitStatementParsedContent } from './types';
import { stripWhitespace } from '../funcs';
import { getHash } from '../../utils/crypto';

export class SplitStatementParser implements SqlContentParser {
	/**
	 * Stores the statements from the start and end statement declarations
	 * as per comment flags
	 */
	private readonly statements: {
		[checksum: string]: string;
	} = {};

	constructor(public readonly sqlContent: SqlContent) {
		this.extractStatements();
	}

	private extractStatements(): void {
		const lines = this.sqlContent.split('\n');
		let currentStatement = '';
		let isCapturing = false;

		for (const line of lines) {
			const trimmedLine = line.trimStart();
			if (trimmedLine.startsWith('--')) {
				if (
					trimmedLine.includes(
						`${SqlCommentFlags.declarer}: ${SqlCommentFlags.statementSplitters.startStatement}`
					)
				) {
					isCapturing = true;
					currentStatement = '';
				} else if (
					trimmedLine.includes(
						`${SqlCommentFlags.declarer}: ${SqlCommentFlags.statementSplitters.endStatement}`
					) &&
					isCapturing
				) {
					isCapturing = false;
					if (currentStatement.trim()) {
						const normalized = stripWhitespace(currentStatement);
						const checksum = getHash(normalized);
						if (this.statements[checksum]) {
							throw new Error(
								`Checksum collision detected for statement: ${currentStatement}`
							);
						}
						this.statements[checksum] = currentStatement;
					}
				}
			} else if (isCapturing) {
				currentStatement += line + '\n';
			}
		}

		if (isCapturing) {
			throw new Error(
				"Unclosed statement: Missing '-- sqlsync: endStatement' marker."
			);
		}
	}

	process(): SplitStatementParsedContent {
		return {
			type: 'SplitStatements',
			checksums: Object.keys(this.statements),
		};
	}
}
