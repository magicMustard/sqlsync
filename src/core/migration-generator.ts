// src/core/migration-generator.ts
import { StateDifference, FileChange, StatementChange } from './diff-engine';
import { ProcessedStatement, ProcessedSqlFile } from '@/types/processed-sql';
import { diffTableDefinitions, AlterTableOperation } from './schema-differ';
import { logger } from '@/utils/logger';
import chalk from 'chalk'; // Using chalk for colored CLI output
import { MigrationState, MigrationStatementChecksum, DeclarativeTableState } from '@/types/state';
import { getHash } from '@/utils/crypto';
import { TableDefinition } from '@/types/table-definition';

/**
 * Represents the generated migration content and the corresponding state update.
 */
interface GeneratedMigration {
  content: string;
  state: MigrationState;
}

/**
 * Utility function to check if an object is a DeclarativeTableState
 * DeclarativeTableState has tableName, parsedStructure, rawStatementChecksum, sourceFilePath properties
 */
export function isDeclarativeTableState(obj: any): obj is DeclarativeTableState {
  return obj && 'tableName' in obj && 'parsedStructure' in obj && 'rawStatementChecksum' in obj;
}

/**
 * Utility function to check if an object is a ProcessedSqlFile
 */
export function isProcessedSqlFile(obj: any): obj is ProcessedSqlFile {
  return obj && 'filePath' in obj && 'statements' in obj && 'rawFileChecksum' in obj;
}

/**
 * Creates a DeclarativeTableState from a ProcessedSqlFile
 */
function createDeclarativeTableState(file: ProcessedSqlFile): DeclarativeTableState {
  if (!file.tableDefinition) {
    throw new Error(`Cannot create DeclarativeTableState from file without tableDefinition: ${file.filePath}`);
  }
  
  return {
    tableName: file.tableDefinition.tableName,
    parsedStructure: file.tableDefinition, // Using tableDefinition as parsedStructure
    rawStatementChecksum: file.rawFileChecksum,
    sourceFilePath: file.filePath
  };
}

/**
 * Wraps an SQL statement with checksum comments for traceability
 * 
 * @param sql The SQL statement to wrap
 * @param checksum The checksum of the statement
 * @returns The wrapped SQL statement
 */
function wrapStatementWithChecksum(sql: string, checksum: string): string {
  const startMarker = `-- sqlsync: startStatement:${checksum}`;
  const endMarker = `-- sqlsync: endStatement:${checksum}`;
  
  // Ensure the SQL ends with semicolon
  const normalizedSql = sql.trim().endsWith(';') ? sql.trim() : `${sql.trim()};`;
  
  return `${startMarker}\n${normalizedSql}\n${endMarker}`;
}

/**
 * Generates the content for an SQL migration file based on detected state differences.
 *
 * @param differences The differences detected between the previous and current states.
 * @param migrationName A descriptive name for the migration provided by the user.
 * @returns A GeneratedMigration object containing the SQL script and the resulting migration state.
 */
export function generateMigrationContent(
  differences: StateDifference,
  migrationName: string
): GeneratedMigration {
  const lines: string[] = [];
  const timestamp = new Date().toISOString();
  const migrationState: MigrationState = {
    statements: [],
    declarativeTables: {},
    createdAt: timestamp, // Add creation timestamp
  };

  lines.push(`-- SQLSync Migration: ${migrationName}`);
  lines.push(`-- Generated At: ${timestamp}`);
  lines.push(`-- Based on detected changes between states.`);
  lines.push(''); // Add a blank line for separation

  if (differences.fileChanges.length === 0) {
    lines.push('-- No SQL changes detected.');
    return { content: lines.join('\n'), state: migrationState };
  }

  // Group changes by type for better readability in the output file
  const addedFiles = differences.fileChanges.filter((fc) => fc.type === 'added');
  const modifiedFiles = differences.fileChanges.filter((fc) => fc.type === 'modified');
  const deletedFiles = differences.fileChanges.filter((fc) => fc.type === 'deleted');

  if (addedFiles.length > 0) {
    lines.push('-- >>> ADDED FILES <<<');
    addedFiles.forEach((change) => {
      lines.push(`\n-- Added File: ${change.filePath}`);
      
      // Check if we have a processed SQL file with a declarative table
      if (change.current && isProcessedSqlFile(change.current) && change.current.declarativeTable && change.current.rawFileContent) {
        lines.push(`-- NOTE: File is declarative. Using raw content.`);
        
        // For declarative tables, use the raw content with checksum
        const rawContent = change.current.rawFileContent.trim();
        const checksum = change.current.rawFileChecksum || getHash(rawContent);
        
        // Add to migrationState
        migrationState.statements.push({ checksum, filePath: change.filePath });
        
        // Wrap statement with checksum comments
        lines.push(wrapStatementWithChecksum(rawContent, checksum));
        
        // Handle the declarative table state
        if (change.current.tableDefinition) {
          // Convert ProcessedSqlFile to DeclarativeTableState
          migrationState.declarativeTables[change.filePath] = createDeclarativeTableState(change.current);
        }
      } 
      // Check if we have a declarative table state
      else if (change.current && isDeclarativeTableState(change.current)) {
        lines.push(`-- NOTE: File is declarative. Using raw content.`);
        
        // For DeclarativeTableState, use the raw statement checksum
        const checksum = change.current.rawStatementChecksum;
        
        // Add to migrationState
        migrationState.statements.push({ checksum, filePath: change.filePath });
        
        // Add to declarative tables
        migrationState.declarativeTables[change.filePath] = change.current;
        
        // We don't have the raw content in DeclarativeTableState, 
        // so we can't add the SQL content to the migration file
        lines.push(`-- WARNING: Declarative table state doesn't include raw SQL content`);
      } 
      // Regular SQL file with statements
      else if (change.current && isProcessedSqlFile(change.current)) {
        change.current.statements.forEach((stmt) => {
          if (stmt.content) {
            const content = stmt.content.trim();
            const checksum = stmt.checksum || getHash(content);
            
            // Add to migrationState
            migrationState.statements.push({ checksum, filePath: change.filePath });
            
            // Wrap statement with checksum comments
            lines.push(wrapStatementWithChecksum(content, checksum));
          }
        });
      } else {
        const errorMsg = `-- ERROR: Missing expected content for added file ${change.filePath}`;
        lines.push(errorMsg);
        logger.error(`Migration Generation: ${errorMsg}`);
      }
    });
    lines.push('\n-- >>> END ADDED FILES <<<');
  }

  if (modifiedFiles.length > 0) {
    lines.push('\n-- >>> MODIFIED FILES <<<');
    modifiedFiles.forEach((change) => {
      lines.push(`\n-- Modified File: ${change.filePath}`);

      // Handle declarative tables differently from regular SQL files
      if (change.current && isProcessedSqlFile(change.current) && change.current.declarativeTable) {
        // Handle declarative table state for modified files
        if (change.current.tableDefinition) {
          // Convert ProcessedSqlFile to DeclarativeTableState
          migrationState.declarativeTables[change.filePath] = createDeclarativeTableState(change.current);
        }

        let previousTableDef: TableDefinition | undefined = undefined;
        let previousRawContent: string | undefined = undefined;

        if (change.previous) {
          if (isProcessedSqlFile(change.previous)) {
            previousTableDef = change.previous.tableDefinition || undefined;
            previousRawContent = change.previous.rawFileContent;
          } else if (isDeclarativeTableState(change.previous)) {
            // Extract tableDefinition from parsedStructure if it's a DeclarativeTableState
            previousTableDef = change.previous.parsedStructure as TableDefinition;
            // We don't have rawFileContent in DeclarativeTableState, so we can't set this
            previousRawContent = undefined;
          }
        }

        // Only proceed with diffing if we have a current tableDefinition 
        // and can extract it from the current state
        let currentTableDef: TableDefinition | undefined = undefined;
        if (isProcessedSqlFile(change.current)) {
          currentTableDef = change.current.tableDefinition || undefined;
        } else if (isDeclarativeTableState(change.current)) {
          // Need explicit type assertion here for TypeScript
          const declarativeState = change.current as DeclarativeTableState;
          currentTableDef = declarativeState.parsedStructure as TableDefinition;
        }

        if (currentTableDef && previousTableDef) {
          const alterOperations = diffTableDefinitions(previousTableDef, currentTableDef);

          if (alterOperations.length > 0) {
            lines.push(`-- NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes:`);

            // Group operations by type for clearer output
            const addedColumns = alterOperations.filter((op) => op.type === 'ADD_COLUMN');
            const modifiedColumns = alterOperations.filter((op) => op.type === 'MODIFY_COLUMN');
            const droppedColumns = alterOperations.filter((op) => op.type === 'DROP_COLUMN');

            if (addedColumns.length > 0) {
              lines.push('\n-- ADDED COLUMNS:');
              addedColumns.forEach((op) => {
                const checksum = getHash(op.sql);
                migrationState.statements.push({ checksum, filePath: change.filePath });
                lines.push(wrapStatementWithChecksum(op.sql, checksum));
              });
            }

            if (modifiedColumns.length > 0) {
              lines.push('\n-- MODIFIED COLUMNS:');
              modifiedColumns.forEach((op) => {
                const checksum = getHash(op.sql);
                migrationState.statements.push({ checksum, filePath: change.filePath });
                lines.push(wrapStatementWithChecksum(op.sql, checksum));
              });
            }

            if (droppedColumns.length > 0) {
              lines.push('\n-- DROPPED COLUMNS:');
              droppedColumns.forEach((op) => {
                const checksum = getHash(op.sql);
                migrationState.statements.push({ checksum, filePath: change.filePath });
                lines.push(wrapStatementWithChecksum(op.sql, checksum));
              });
            }
          } else {
            lines.push(`-- NOTE: No schema changes detected that require ALTER statements.`);
            if (previousRawContent) {
              const oldContentLines = previousRawContent.trim().split('\n');
              const commentedOldContent = oldContentLines.map((line) => `-- ${line}`).join('\n');
              lines.push(`-- Old table structure for reference:`);
              lines.push(commentedOldContent);
            }
          }
        } else {
          lines.push(`-- NOTE: Could not perform incremental diff. Replacing content entirely.`);
          let rawContent: string | undefined = undefined;
          
          // Try to get raw content from the previous state
          if (change.previous) {
            if (isProcessedSqlFile(change.previous)) {
              previousRawContent = change.previous.rawFileContent;
            }
          }
          
          if (previousRawContent) {
            const oldContentLines = previousRawContent.trim().split('\n');
            const commentedOldContent = oldContentLines.map((line) => `-- ${line}`).join('\n');
            lines.push(`-- Old content for reference:`);
            lines.push(commentedOldContent);
          }
          
          // Try to get raw content from the current state
          if (isProcessedSqlFile(change.current)) {
            rawContent = change.current.rawFileContent;
          }
          
          if (rawContent) {
            lines.push(`-- New table definition:`);
            const newContent = rawContent.trim();
            
            // Use rawFileChecksum for the statement checksum if available
            let checksum: string = '';
            if (isProcessedSqlFile(change.current) && change.current.rawFileChecksum) {
              checksum = change.current.rawFileChecksum;
            } else {
              checksum = getHash(newContent);
            }
            
            migrationState.statements.push({ checksum, filePath: change.filePath });
            
            // Wrap statement with checksum comments
            lines.push(wrapStatementWithChecksum(newContent, checksum));
          } else {
            const errorMsg = `-- ERROR: Missing raw content for modified declarative file ${change.filePath}`;
            lines.push(errorMsg);
            logger.error(`Migration Generation: ${errorMsg}`);
          }
        }
      } else if (change.statementChanges) {
        const addedStmts = change.statementChanges.filter((sc) => sc.type === 'added');
        const deletedStmts = change.statementChanges.filter((sc) => sc.type === 'deleted');

        if (deletedStmts.length > 0) {
          lines.push(`-- Statements Deleted/Modified (Old Version) in ${change.filePath}:`);
          deletedStmts.forEach((stmtChange) => {
            let previousContent: string | undefined = undefined;
            let previousChecksum: string | undefined = undefined;
            if (stmtChange.previous && 'content' in stmtChange.previous) {
              previousContent = stmtChange.previous.content;
              previousChecksum = stmtChange.previous.checksum;
            }

            if (previousContent) {
              const content = previousContent.trim();
              const contentLines = content.split('\n');
              const commentedContent = contentLines.map((line) => `-- ${line}`).join('\n');
              lines.push(`-- (Checksum: ${previousChecksum || 'N/A'})`);
              lines.push(commentedContent);
            } else {
              lines.push(`-- WARNING: Could not retrieve previous content for a deleted/modified statement.`);
            }
          });
        }
        if (addedStmts.length > 0) {
          lines.push(`-- Statements Added/Modified (New Version) in ${change.filePath}:`);
          addedStmts.forEach((stmtChange) => {
            let currentContent: string | undefined = undefined;
            let currentChecksum: string | undefined = undefined;
            if (stmtChange.current && 'content' in stmtChange.current) {
              currentContent = stmtChange.current.content;
              currentChecksum = stmtChange.current.checksum;
            }

            if (currentContent) {
              const content = currentContent.trim();
              const checksum = currentChecksum || getHash(content);
              
              // Add to migrationState
              migrationState.statements.push({ 
                checksum,
                filePath: change.filePath 
              });
              
              // Wrap with checksum comments
              lines.push(wrapStatementWithChecksum(content, checksum));
            } else {
              lines.push(`-- WARNING: Could not retrieve current content for an added/modified statement.`);
            }
          });
        }
      }
    });
    lines.push('\n-- >>> END MODIFIED FILES <<<');
  }

  if (deletedFiles.length > 0) {
    lines.push('\n-- >>> DELETED FILES <<<');
    deletedFiles.forEach((change) => {
      lines.push(`\n-- Deleted File: ${change.filePath}`);

      // Initialize flags for tracking state
      let previousIsDeclarative = false;
      if (change.previous) {
        if (isProcessedSqlFile(change.previous)) {
          previousIsDeclarative = change.previous.declarativeTable !== undefined ? change.previous.declarativeTable : false;
        }
        // DeclarativeTableState is always considered declarative
        else if (isDeclarativeTableState(change.previous)) {
          previousIsDeclarative = true;
        }
      }

      let previousRawContent: string | undefined = undefined;
      let previousStatements: ProcessedStatement[] | undefined = undefined;
      let previousTableName: string | undefined = undefined;

      // Extract what we need from the previous state
      if (change.previous) {
        if (isProcessedSqlFile(change.previous)) {
          previousRawContent = change.previous.rawFileContent;
          previousStatements = change.previous.statements;
          previousTableName = change.previous.tableDefinition?.tableName;
        } else if (isDeclarativeTableState(change.previous)) {
          previousTableName = change.previous.tableName;
          // DeclarativeTableState doesn't have rawFileContent or statements
        }
      }

      if (previousIsDeclarative && previousTableName) {
        lines.push(`-- NOTE: File was declarative. Generating DROP TABLE statement.`);
        const dropSql = `DROP TABLE IF EXISTS ${previousTableName};`;
        const checksum = getHash(dropSql);
        
        // Add to migrationState
        migrationState.statements.push({ 
          checksum,
          filePath: change.filePath 
        });
        
        // Wrap with checksum comments
        lines.push(wrapStatementWithChecksum(dropSql, checksum));
      } else if (!previousIsDeclarative && previousStatements) {
        lines.push(`-- NOTE: File contained standard SQL statements. Commenting out original content.`);
        if (previousRawContent) {
          const oldContentLines = previousRawContent.trim().split('\n');
          const commentedOldContent = oldContentLines.map((line) => `-- ${line}`).join('\n');
          lines.push(`-- Original content for reference:`);
          lines.push(commentedOldContent);
        } else {
          lines.push(`-- WARNING: Could not retrieve content for deleted file ${change.filePath}`);
        }
      } else if (previousRawContent) {
        lines.push(`-- NOTE: Could not determine specific statement types. Commenting out original content.`);
        const oldContentLines = previousRawContent.trim().split('\n');
        const commentedOldContent = oldContentLines.map((line) => `-- ${line}`).join('\n');
        lines.push(`-- Original content for reference:`);
        lines.push(commentedOldContent);
      } else {
        lines.push(`-- WARNING: No previous state found for deleted file ${change.filePath}. Cannot generate specific DROP statements or comment out content.`);
      }
    });
    lines.push('\n-- >>> END DELETED FILES <<<');
  }

  return { content: lines.join('\n') + '\n', state: migrationState };
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
  const addedFiles = differences.fileChanges.filter((fc) => fc.type === 'added');
  const modifiedFiles = differences.fileChanges.filter((fc) => fc.type === 'modified');
  const deletedFiles = differences.fileChanges.filter((fc) => fc.type === 'deleted');

  logger.info('\nChanges detected:');

  // Display added files (green)
  if (addedFiles.length > 0) {
    logger.info(chalk.green.bold('\n✓ Added Files:'));
    addedFiles.forEach((file) => {
      logger.info(chalk.green(`  + ${file.filePath}`));

      // For declarative tables, show what's being created
      if (file.current && isProcessedSqlFile(file.current) && file.current.declarativeTable && file.current.tableDefinition) {
        logger.info(
          chalk.green(
            `    CREATE TABLE ${file.current.tableDefinition.tableName} with ${file.current.tableDefinition.columns.length} columns`
          )
        );
      } else if (file.current && isDeclarativeTableState(file.current)) {
        logger.info(
          chalk.green(
            `    CREATE TABLE ${file.current.tableName} (from declarative state)`
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
      if (file.current && isProcessedSqlFile(file.current) && file.current.declarativeTable) {
        // Get current table definition
        let currentTableDef: TableDefinition | undefined = undefined;
        if (isProcessedSqlFile(file.current) && file.current.tableDefinition) {
          currentTableDef = file.current.tableDefinition;
        } else if (isDeclarativeTableState(file.current)) {
          // Need explicit type assertion here for TypeScript
          const declarativeState = file.current as DeclarativeTableState;
          currentTableDef = declarativeState.parsedStructure as TableDefinition;
        }

        // Get previous table definition
        let previousTableDef: TableDefinition | undefined = undefined;
        if (file.previous) {
          if (isProcessedSqlFile(file.previous) && file.previous.tableDefinition) {
            previousTableDef = file.previous.tableDefinition;
          } else if (isDeclarativeTableState(file.previous)) {
            previousTableDef = file.previous.parsedStructure as TableDefinition;
          }
        }

        if (currentTableDef && previousTableDef) {
          const alterOperations = diffTableDefinitions(
            previousTableDef,
            currentTableDef
          );

          if (alterOperations.length > 0) {
            const addedColumns = alterOperations.filter((op) => op.type === 'ADD_COLUMN');
            const modifiedColumns = alterOperations.filter((op) => op.type === 'MODIFY_COLUMN');
            const droppedColumns = alterOperations.filter((op) => op.type === 'DROP_COLUMN');

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
      }
    });
  }

  // Display deleted files (red)
  if (deletedFiles.length > 0) {
    logger.info(chalk.red.bold('\n✗ Deleted Files:'));
    deletedFiles.forEach((file) => {
      logger.info(chalk.red(`  - ${file.filePath}`));

      // Determine if the previous state was a declarative table
      let isDeclarative = false;
      let tableName: string | undefined = undefined;

      if (file.previous) {
        if (isProcessedSqlFile(file.previous)) {
          isDeclarative = file.previous.declarativeTable !== undefined ? file.previous.declarativeTable : false;
          tableName = file.previous.tableDefinition?.tableName;
        } else if (isDeclarativeTableState(file.previous)) {
          isDeclarative = true;
          tableName = file.previous.tableName;
        }
      }

      // Emphasize that DROP statements aren't auto-generated
      if (isDeclarative && tableName) {
        logger.info(
          chalk.yellow.bold(
            `    ⚠ WARNING: Table '${tableName}' was deleted.`
          )
        );
        logger.info(
          chalk.yellow.bold(
            `      DROP statements are NOT automatically generated.`
          )
        );
        logger.info(
          chalk.yellow(
            `      You must manually add 'DROP TABLE ${tableName};' to the migration if needed.`
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
