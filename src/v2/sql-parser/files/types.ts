import { Differences, ParserType } from '../types';

export interface FileContentParsedContent extends ParserType {
	type: 'FileContent';
	checksum: string;
}

export interface FileContentDifferences extends Differences {
	different: boolean;
}