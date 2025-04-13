export type SqlContent = string;
export type SqlFileType =
	| 'DeclarativeTable'
	| 'SplitStatements'
	| 'FileContent';

export const SqlCommentFlags = {
	declarer: 'sqlsync',
	fileTypes: {
		declarativeTable: 'declarativeTable',
		splitStatements: 'splitStatements',
	},
	statementSplitters: {
		startStatement: 'startStatement',
		endStatement: 'endStatement',
	},
};

export interface SqlContentParser {
	process(): ParserType;
}

export interface ParserType {
	type: SqlFileType;
}

export interface Differences extends ParserType {
	different: boolean;
}

export interface SqlStatementFactory {
	create(): SqlContent;
}