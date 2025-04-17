import { Differences, ParserType } from '../types';

export interface SplitStatementParsedContent extends ParserType {
	type: 'SplitStatements';
	checksums: string[];
}

export interface SplitStatementDifferences extends Differences {
	type: 'SplitStatements';
	differentStatements: string[];
}

export interface SplitStatementChecksums {
	[checksum: string]: string;
}