// src/core/migration-generator.ts
import { StateDifference, FileChange, StatementChange } from './diff-engine';
import { ProcessedStatement, ProcessedSqlFile } from '@/types/processed-sql';
import { diffTableDefinitions, AlterTableOperation } from './schema-differ';
import { logger } from '@/utils/logger';
import chalk from 'chalk'; // Using chalk for colored CLI output

/**
 * Generates the content for an SQL migration file based on detected state differences.
 *
 * @param differences The differences detected between the previous and current states.
 * @param migrationName A descriptive name for the migration provided by the user.
 * @returns A string containing the SQL migration script.
 */
export function generateMigrationContent(
	differences: StateDifference,
	migrationName: string
): string {
	const lines: string[] = [];
	const timestamp = new Date().toISOString();

	lines.push(`-- SQLSync Migration: ${migrationName}`);
	lines.push(`-- Generated At: ${timestamp}`);
	lines.push(`-- Based on detected changes between states.`);
	lines.push(''); // Add a blank line for separation

	if (differences.fileChanges.length === 0) {
		lines.push('-- No SQL changes detected.');
		return lines.join('\n');
	}

	// Group changes by type for better readability in the output file
	const addedFiles = differences.fileChanges.filter(
		(fc) => fc.type === 'added'
	);
	const modifiedFiles = differences.fileChanges.filter(
		(fc) => fc.type === 'modified'
	);
	const deletedFiles = differences.fileChanges.filter(
		(fc) => fc.type === 'deleted'
	);

	if (addedFiles.length > 0) {
		lines.push('-- >>> ADDED FILES <<<');
		addedFiles.forEach((change) => {
			lines.push(`\n-- Added File: ${change.filePath}`);
			// If the added file is declarative, dump its raw content
			if (change.current?.declarativeTable) {
				// Optional: Add a comment indicating it's declarative
				lines.push(`-- NOTE: File is declarative. Using raw content.`);
				if (change.current.rawFileContent) {
					lines.push(change.current.rawFileContent.trim()); // Append raw content without adding extra semicolon
				} else {
					lines.push(
						`-- ERROR: Missing raw content for added declarative file ${change.filePath}`
					);
				}
			} else {
				if (change.current?.statements) {
					change.current.statements.forEach((stmt) => {
						// Check if content already ends with a semicolon
						const content = stmt.content?.trim() || '';
						if (content.endsWith(';')) {
							lines.push(content);
						} else {
							lines.push(`${content};`);
						}
					});
				} else {
					lines.push(
						`-- ERROR: No current state found for added file ${change.filePath}`
					);
				}
			}
		});
		lines.push('\n-- >>> END ADDED FILES <<<');
	}

	if (modifiedFiles.length > 0) {
		lines.push('\n-- >>> MODIFIED FILES <<<');
		modifiedFiles.forEach((change) => {
			lines.push(`\n-- Modified File: ${change.filePath}`);

			// Handle Declarative Table Modification
			if (change.current?.declarativeTable) {
				// Use schema differ to generate ALTER TABLE statements
				if (
					change.current.tableDefinition &&
					change.previous?.tableDefinition
				) {
					const alterOperations = diffTableDefinitions(
						change.previous.tableDefinition,
						change.current.tableDefinition
					);

					if (alterOperations.length > 0) {
						lines.push(
							`-- NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes:`
						);

						// Group operations by type for clearer output
						const addedColumns = alterOperations.filter(
							(op) => op.type === 'ADD_COLUMN'
						);
						const modifiedColumns = alterOperations.filter(
							(op) => op.type === 'MODIFY_COLUMN'
						);
						const droppedColumns = alterOperations.filter(
							(op) => op.type === 'DROP_COLUMN'
						);

						if (addedColumns.length > 0) {
							lines.push('\n-- ADDED COLUMNS:');
							addedColumns.forEach((op) => {
								lines.push(op.sql);
							});
						}

						if (modifiedColumns.length > 0) {
							lines.push('\n-- MODIFIED COLUMNS:');
							modifiedColumns.forEach((op) => {
								lines.push(op.sql);
							});
						}

						if (droppedColumns.length > 0) {
							lines.push('\n-- DROPPED COLUMNS:');
							droppedColumns.forEach((op) => {
								lines.push(op.sql);
							});
						}
					} else {
						// Even if no schema changes were detected by the differ, we should still 
						// include a comment instead of regenerating the full table
						lines.push(
							`-- NOTE: No schema changes detected that require ALTER statements.`
						);
						
						// Comment out the old table structure for reference
						const oldContent = change.previous.rawFileContent?.trim() || '';
						const oldContentLines = oldContent.split('\n');
						const commentedOldContent = oldContentLines.map(line => `-- ${line}`).join('\n');
						lines.push(`-- Old table structure for reference:`);
						lines.push(commentedOldContent);
						
						// However, do not include the full new table definition in this case
					}
				} else {
					// Fallback to full replacement if tableDefinition is missing
					lines.push(
						`-- NOTE: File is declarative but missing tableDefinition. Replacing content entirely.`
					);
					
					// Comment out the old structure if available
					if (change.previous?.rawFileContent) {
						const oldContent = change.previous.rawFileContent.trim();
						const oldContentLines = oldContent.split('\n');
						const commentedOldContent = oldContentLines.map(line => `-- ${line}`).join('\n');
						lines.push(`-- Old content for reference:`);
						lines.push(commentedOldContent);
					}
					
					// Include the new definition
					if (change.current.rawFileContent) {
						lines.push(`-- New table definition:`);
						lines.push(change.current.rawFileContent.trim());
					} else {
						lines.push(
							`-- ERROR: Missing raw content for modified declarative file ${change.filePath}`
						);
					}
				}
			}
			// Handle Normal/Statement-based Modification
			else if (change.statementChanges) {
				const addedStmts = change.statementChanges.filter(
					(sc) => sc.type === 'added'
				);
				const deletedStmts = change.statementChanges.filter(
					(sc) => sc.type === 'deleted'
				);

				if (deletedStmts.length > 0) {
					lines.push(
						`-- Statements Deleted/Modified (Old Version) in ${change.filePath}:`
					);
					deletedStmts.forEach((stmtChange) => {
						const content = stmtChange.previous?.content?.trim() || '';
						// Properly comment out the entire function body by adding '-- ' to each line
						const contentLines = content.split('\n');
						const commentedContent = contentLines.map(line => `-- ${line}`).join('\n');
						lines.push(`-- (Checksum: ${stmtChange.previous?.checksum})`);
						lines.push(commentedContent);
					});
				}
				if (addedStmts.length > 0) {
					lines.push(
						`-- Statements Added/Modified (New Version) in ${change.filePath}:`
					);
					addedStmts.forEach((stmtChange) => {
						// Check if content already ends with a semicolon
						const content = stmtChange.current?.content?.trim() || '';
						if (content.endsWith(';')) {
							lines.push(content);
						} else {
							lines.push(`${content};`);
						}
					});
				}
			} else {
				lines.push(
					`-- WARNING: File ${change.filePath} marked as modified, but no statement changes or declarative content found.`
				);
			}
		});
		lines.push('\n-- >>> END MODIFIED FILES <<<');
	}

	if (deletedFiles.length > 0) {
		lines.push('\n-- >>> DELETED FILES <<<');
		lines.push('\n⚠️ WARNING: Files have been deleted. If you need to drop tables or schemas, you must add those commands manually.');
		
		deletedFiles.forEach((change) => {
			lines.push(`\n-- Deleted File: ${change.filePath}`);
			lines.push('-- Original content for reference:');
			if (change.previous?.statements) {
				change.previous.statements.forEach((stmt) => {
					const content = stmt.content?.trim() || '';
					if (content.endsWith(';')) {
						lines.push(`--   ${content}`);
					} else {
						lines.push(`--   ${content};`);
					}
				});
			} else {
				lines.push(
					`--   (No statements found in original file)`
				);
			}
		});
		
		lines.push('\n-- >>> END DELETED FILES <<<');
	}

	return lines.join('\n');
}

/**
 * Generates colored CLI output to display changes in the console.
 * This is separate from the migration content to allow for richer display
 * in the terminal without affecting the generated SQL file.
 *
 * @param differences The differences detected between states
 * @returns void - outputs directly to console
 */
export function displayChangesInConsole(differences: StateDifference): void {
	if (differences.fileChanges.length === 0) {
		logger.info(chalk.dim('No changes detected.'));
		return;
	}

	// Group changes by type for display
	const addedFiles = differences.fileChanges.filter(
		(fc) => fc.type === 'added'
	);
	const modifiedFiles = differences.fileChanges.filter(
		(fc) => fc.type === 'modified'
	);
	const deletedFiles = differences.fileChanges.filter(
		(fc) => fc.type === 'deleted'
	);

	logger.info('\nChanges detected:');

	// Display added files (green)
	if (addedFiles.length > 0) {
		logger.info(chalk.green.bold('\n✓ Added Files:'));
		addedFiles.forEach((file) => {
			logger.info(chalk.green(`  + ${file.filePath}`));

			// For declarative tables, show what's being created
			if (file.current?.declarativeTable && file.current.tableDefinition) {
				logger.info(
					chalk.green(
						`    CREATE TABLE ${file.current.tableDefinition.tableName} with ${file.current.tableDefinition.columns.length} columns`
					)
				);
			}
		});
	}

	// Display modified files (yellow)
	if (modifiedFiles.length > 0) {
		logger.info(chalk.yellow.bold('\n⟳ Modified Files:'));
		modifiedFiles.forEach((file) => {
			logger.info(chalk.yellow(`  ~ ${file.filePath}`));

			// For declarative tables, show schema changes
			if (
				file.current?.declarativeTable &&
				file.current.tableDefinition &&
				file.previous?.tableDefinition
			) {
				const alterOperations = diffTableDefinitions(
					file.previous.tableDefinition,
					file.current.tableDefinition
				);

				if (alterOperations.length > 0) {
					const addedColumns = alterOperations.filter(
						(op) => op.type === 'ADD_COLUMN'
					);
					const modifiedColumns = alterOperations.filter(
						(op) => op.type === 'MODIFY_COLUMN'
					);
					const droppedColumns = alterOperations.filter(
						(op) => op.type === 'DROP_COLUMN'
					);

					if (addedColumns.length > 0) {
						logger.info(
							chalk.green(`    Added ${addedColumns.length} column(s):`)
						);
						addedColumns.forEach((op) => {
							logger.info(chalk.green(`      + ${op.columnName}`));
						});
					}

					if (modifiedColumns.length > 0) {
						logger.info(
							chalk.yellow(`    Modified ${modifiedColumns.length} column(s):`)
						);
						modifiedColumns.forEach((op) => {
							logger.info(chalk.yellow(`      ~ ${op.columnName}`));
						});
					}

					if (droppedColumns.length > 0) {
						logger.info(
							chalk.red(`    Dropped ${droppedColumns.length} column(s):`)
						);
						droppedColumns.forEach((op) => {
							logger.info(chalk.red(`      - ${op.columnName}`));
						});
					}
				} else {
					logger.info(chalk.dim(`    No schema changes detected`));
				}
			}
		});
	}

	// Display deleted files (red)
	if (deletedFiles.length > 0) {
		logger.info(chalk.red.bold('\n✗ Deleted Files:'));
		deletedFiles.forEach((file) => {
			logger.info(chalk.red(`  - ${file.filePath}`));

			// Emphasize that DROP statements aren't auto-generated
			if (file.previous?.declarativeTable && file.previous.tableDefinition) {
				logger.info(
					chalk.yellow.bold(
						`    ⚠ WARNING: Table '${file.previous.tableDefinition.tableName}' was deleted.`
					)
				);
				logger.info(
					chalk.yellow.bold(
						`      DROP statements are NOT automatically generated.`
					)
				);
				logger.info(
					chalk.yellow(
						`      You must manually add 'DROP TABLE ${file.previous.tableDefinition.tableName};' to the migration if needed.`
					)
				);
			} else {
				logger.info(
					chalk.yellow.bold(
						`    ⚠ WARNING: DROP statements are NOT automatically generated.`
					)
				);
				logger.info(
					chalk.yellow(
						`      Review the generated migration file and manually add any necessary DROP statements.`
					)
				);
			}
		});
	}
}
