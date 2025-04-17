import { TableDefinition } from "./tables/types";

export type SqlContent = string;

export type SqlFileType =
	| 'DeclarativeTable'
	| 'DeclarativeEnum'
	| 'SplitStatements'
	| 'FileContent';

/**
 * SqlTokenContext contains the original, clean, stripped, and checksum of the sql content
 * This will be extended to add additional properties as needed from the Sql types
 */
export interface SqlTokenContext {
	// The file path of the sql content
	filePath: string;
	// The type of the sql content
	fileType: SqlFileType;
	// The original extracted token
	original: string;
	// The token after removing comments
	clean: string;
	// The token after removing comments and whitespace
	stripped: string;
	// The checksum of the token
	checksum: string;
}

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

/**
 * An sql statement factory is what takes in the differences from
 * the application and converts them to the sql that needs to be
 * added to the migration.
 * 
 * Expects an array of SqlItems to be returned.
 */
export interface SqlStatementFactory {
	create(differences: Differences): SqlTokenContext[];
}