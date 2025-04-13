import { SqlCommentFlags, SqlContent } from './types';

/**
 * Normalizes sqlsync-specific comments by removing extra spaces to ensure consistent processing.
 * @param content The SQL content to process.
 * @returns The SQL content with sqlsync comments normalized.
 */
export function normalizeSqlSyncComments(content: SqlContent): SqlContent {
	const lines = content.split('\n');
	const normalizedLines = lines.map((line) => {
		const trimmedLine = line.trimStart();
		if (
			trimmedLine.startsWith('--') &&
			trimmedLine.match(new RegExp(`--\\s*${SqlCommentFlags.declarer}\\s*:`))
		) {
			// Remove extra spaces after the declarer and before/after the colon
			return trimmedLine
				.replace(
					new RegExp(`--\\s*${SqlCommentFlags.declarer}\\s*:(?:\\s)*`),
					`-- ${SqlCommentFlags.declarer}: `
				)
				.trimEnd();
		}
		return line;
	});
	return normalizedLines.join('\n');
}

/**
 * Strips comments from SQL content, except for sqlsync-specific comments.
 * @param content The SQL content to process.
 * @returns The processed SQL content with comments stripped (except sqlsync ones).
 */
export function stripComments(content: SqlContent): SqlContent {
	const lines = content.split('\n');
	const processedLines = lines
		.map((line) => {
			// Check if the line starts with a comment
			const trimmedLine = line.trimStart();
			if (trimmedLine.startsWith('--')) {
				// Preserve sqlsync comments
				if (
					trimmedLine.match(
						new RegExp(`--\\s*${SqlCommentFlags.declarer}\\s*:`)
					)
				) {
					return line;
				}
				// Strip other comments by returning an empty line
				return '';
			}
			return line;
		})
		.filter((line) => line.length > 0); // Remove empty lines resulting from stripped comments

	return processedLines.join('\n');
}

/**
 * Removes all whitespace, new lines, and tabs from the SQL content.
 * @param content The SQL content to process.
 * @returns The processed SQL content with all whitespace removed.
 */
export function stripWhitespace(content: SqlContent): SqlContent {
	return content.replace(/\s+/g, '');
}
