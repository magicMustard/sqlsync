import { getHash } from '@/utils/crypto';
import { SqlContent, SqlContentParser } from '../types';
import { FileContentParsedContent } from './types';
import { stripWhitespace } from '../funcs';

export class FileContentParser implements SqlContentParser {
	public readonly spacesStrippedSqlContent: SqlContent;

	constructor(public readonly sqlContent: SqlContent) {
		this.spacesStrippedSqlContent = stripWhitespace(this.sqlContent);
	}

	process(): FileContentParsedContent {
		return {
			type: 'FileContent',
			checksum: getHash(this.spacesStrippedSqlContent),
		};
	}
}
