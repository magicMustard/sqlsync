// src/core/migration-generator.ts
import { StateDifference, FileChange, StatementChange } from './diff-engine';
import { ProcessedStatement, ProcessedSqlFile } from '@/types/processed-sql';
import { diffTableDefinitions, AlterTableOperation } from './schema-differ';
import { logger } from '@/utils/logger';
import chalk from 'chalk'; // Using chalk for colored CLI output
import { MigrationState, MigrationStatementChecksum, DeclarativeTableState } from '@/types/state';
import { getHash } from '@/utils/crypto';
import { TableDefinition } from '@/types/table-definition';
import * as fs from 'fs'; // Added fs import
import * as path from 'path'; // Added path import
import { toAbsolutePath } from '../utils/path-utils'; // Import toAbsolutePath
import { debug } from '../utils/debug';
import { loadState } from './state-manager'; // Correct function name
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
 * @param configPath Optional path to the config file, needed for resolving relative file paths.
 * @returns A GeneratedMigration object containing the SQL script and the resulting migration state.
 */
export function generateMigrationContent(
  differences: StateDifference,
  migrationName: string,
  configPath?: string // Add optional configPath
): GeneratedMigration {
  debug("[MIGRATION] ===== STARTING MIGRATION GENERATION =====", 'verbose');
  
  const lines: string[] = [];
  const timestamp = new Date().toISOString();
  const migrationState: MigrationState = {
    statements: [],
    declarativeTables: {},
    sourceFileChecksums: {}, // FIX: Initialize sourceFileChecksums
    createdAt: timestamp, // Add creation timestamp
  };

  lines.push(`-- SQLSync Migration: ${migrationName}`);
  lines.push(`-- Generated At: ${timestamp}`);
  lines.push(`-- Based on detected changes between states.`);
  lines.push(''); // Add a blank line for separation

  if (differences.fileChanges.length === 0) {
    lines.push('-- No SQL changes detected.');
    return { content: '', state: migrationState };
  }

  // Group changes by type for better readability in the output file
  const addedFiles = differences.fileChanges.filter((fc) => fc.type === 'added');
  const modifiedFiles = differences.fileChanges.filter((fc) => fc.type === 'modified');
  const deletedFiles = differences.fileChanges.filter((fc) => fc.type === 'deleted');
  
  debug("[MIGRATION] File changes breakdown:", 'verbose');
  debug("[MIGRATION] - Added files: " + addedFiles.length, 'verbose');
  debug("[MIGRATION] - Modified files: " + modifiedFiles.length, 'verbose');
  debug("[MIGRATION] - Deleted files: " + deletedFiles.length, 'verbose');

  // Get the latest state to check for latest checksums
  const latestState = configPath ? loadState(configPath) : null;
  
  // Filter out modified files that haven't actually changed since the last migration
  const actuallyModifiedFiles = modifiedFiles.filter(change => {
    if (!change.current || !isProcessedSqlFile(change.current) || !change.current.rawFileChecksum) {
      return true; // If we can't determine checksum, include it to be safe
    }
    
    const filePath = change.filePath;
    const currentChecksum = change.current.rawFileChecksum;
    
    // Check if we have this file's checksum in the latest state
    if (latestState && 
        latestState.currentFileChecksums && 
        latestState.currentFileChecksums[filePath] === currentChecksum) {
      
      debug(`[MIGRATION] Skipping file marked as modified but with unchanged checksum: ${filePath}`, 'verbose');
      debug(`  Current checksum: ${currentChecksum.substring(0, 8)}...`, 'verbose');
      debug(`  Latest state checksum: ${latestState.currentFileChecksums[filePath].substring(0, 8)}...`, 'verbose');
      
      // Since we're skipping this file but it's still "seen", update its checksum in our state
      migrationState.sourceFileChecksums[filePath] = { 
        checksum: currentChecksum 
      };
      
      return false; // Skip this file
    }
    
    return true; // Include this file
  });
  
  debug("[MIGRATION] After filtering, actually modified files: " + actuallyModifiedFiles.length, 'verbose');

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
        
        // Store the file checksum for added files in the migration state
        // This ensures we only include actually modified files in future migrations
        if (change.current && isProcessedSqlFile(change.current) && change.current.rawFileChecksum) {
          debug(`[MIGRATION] Storing file checksum for added file: ${change.filePath}`, 'verbose');
          debug(`  File checksum: ${change.current.rawFileChecksum.substring(0, 8)}...`, 'verbose');
          migrationState.sourceFileChecksums[change.filePath] = { 
            checksum: change.current.rawFileChecksum 
          };
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

  if (actuallyModifiedFiles.length > 0) {
    debug("[MIGRATION] ===== PROCESSING MODIFIED FILES =====", 'verbose');
    lines.push('\n-- >>> MODIFIED FILES <<<');
    
    debug("[MIGRATION] Processing " + actuallyModifiedFiles.length + " modified files listed by diff-engine.", 'verbose'); // Log count
    
    actuallyModifiedFiles.forEach((change, idx) => {
      debug("\n[MIGRATION] Processing modified file " + (idx + 1) + "/" + actuallyModifiedFiles.length + ": " + change.filePath, 'verbose'); // Log each file
      
      // Dump details about the change object to help debug
      debug("[MIGRATION] Change object structure for " + change.filePath + ":", 'verbose');
      debug("[MIGRATION] - type: " + change.type, 'verbose');
      debug("[MIGRATION] - filePath: " + change.filePath, 'verbose');
      debug("[MIGRATION] - previous exists: " + !!change.previous, 'verbose');
      if (change.previous) {
        debug("[MIGRATION] - previous is object: " + (typeof change.previous === 'object'), 'verbose');
        if (typeof change.previous === 'object') {
          const keys = Object.keys(change.previous);
          debug("[MIGRATION] - previous keys: " + keys.join(', '), 'verbose');
        }
      }
      debug("[MIGRATION] - current exists: " + !!change.current, 'verbose');
      if (change.current) {
        debug("[MIGRATION] - current is ProcessedSqlFile: " + isProcessedSqlFile(change.current), 'verbose');
        if (isProcessedSqlFile(change.current)) {
          debug("[MIGRATION] - current.declarativeTable: " + change.current.declarativeTable, 'verbose');
          debug("[MIGRATION] - current.rawFileContent exists: " + !!change.current.rawFileContent, 'verbose');
          if (change.current.rawFileChecksum) {
            debug("[MIGRATION] - current.rawFileChecksum: " + change.current.rawFileChecksum?.substring(0, 8) + "...", 'verbose');
          }
          debug("[MIGRATION] - current.statements.length: " + (change.current.statements?.length || 0), 'verbose');
        }
      }
      debug("[MIGRATION] - statementChanges exists: " + !!change.statementChanges, 'verbose');
      if (change.statementChanges) {
        debug("[MIGRATION] - statementChanges.length: " + change.statementChanges.length, 'verbose');
      }
      
      lines.push(`\n-- Modified File: ${change.filePath}`);
      
      // Track if any specific handler processed this file
      let fileHandled = false;

      debug("[MIGRATION] Processing modified file: " + change.filePath, 'verbose');
      debug("[MIGRATION]   change.type: " + change.type, 'verbose');
      debug("[MIGRATION]   change.previous exists: " + !!change.previous, 'verbose');
      if (change.previous) {
        debug("[MIGRATION]   change.previous type: " + typeof change.previous, 'verbose');
        debug("[MIGRATION]   isProcessedSqlFile(change.previous): " + isProcessedSqlFile(change.previous), 'verbose');
        if (isProcessedSqlFile(change.previous)) {
          debug("[MIGRATION]     change.previous.declarativeTable: " + change.previous.declarativeTable, 'verbose');
          debug("[MIGRATION]     change.previous.rawFileContent exists: " + !!change.previous.rawFileContent, 'verbose');
          debug("[MIGRATION]     change.previous.rawFileChecksum: " + change.previous.rawFileChecksum, 'verbose');
        }
        debug("[MIGRATION]   isDeclarativeTableState(change.previous): " + isDeclarativeTableState(change.previous), 'verbose');
      }
      debug("[MIGRATION]   change.current exists: " + !!change.current, 'verbose');
      if (change.current) {
        debug("[MIGRATION]   change.current type: " + typeof change.current, 'verbose');
        debug("[MIGRATION]   isProcessedSqlFile(change.current): " + isProcessedSqlFile(change.current), 'verbose');
        if (isProcessedSqlFile(change.current)) {
          debug("[MIGRATION]     change.current.declarativeTable: " + change.current.declarativeTable, 'verbose');
          debug("[MIGRATION]     change.current.rawFileContent exists: " + !!change.current.rawFileContent, 'verbose');
          debug("[MIGRATION]     change.current.rawFileChecksum: " + change.current.rawFileChecksum, 'verbose');
        }
        debug("[MIGRATION]   isDeclarativeTableState(change.current): " + isDeclarativeTableState(change.current), 'verbose');
      }
      debug("[MIGRATION]   change.statementChanges exists: " + !!change.statementChanges, 'verbose');
      if (change.statementChanges) {
        debug("[MIGRATION]   change.statementChanges length: " + change.statementChanges.length, 'verbose');
      }

      // Handle declarative tables differently from regular SQL files
      if (change.current && isProcessedSqlFile(change.current) && change.current.declarativeTable) {
        debug("[MIGRATION] File " + change.filePath + " is a DECLARATIVE TABLE", 'verbose');
        
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
            const renamedColumns = alterOperations.filter((op) => op.type === 'RENAME_COLUMN');

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

            if (renamedColumns.length > 0) {
              lines.push('\n-- RENAMED COLUMNS:');
              renamedColumns.forEach((op) => {
                const checksum = getHash(op.sql);
                migrationState.statements.push({ checksum, filePath: change.filePath });
                lines.push(wrapStatementWithChecksum(op.sql, checksum));
              });
            }
            
            // Mark as handled since we processed a declarative table with changes
            fileHandled = true;
            debug("[MIGRATION] File " + change.filePath + " was handled by DECLARATIVE TABLE WITH CHANGES handler", 'verbose');
          } else {
            debug("[MIGRATION] Generating DECLARATIVE fallback content for " + change.filePath, 'verbose');
            lines.push(`-- NOTE: No schema changes detected that require ALTER statements.`);
            if (previousRawContent) {
              const oldContentLines = previousRawContent.trim().split('\n');
              const commentedOldContent = oldContentLines.map((line) => `-- ${line}`).join('\n');
              lines.push(`-- Old table structure for reference:`);
              lines.push(commentedOldContent);
            }
            
            // Mark as handled since we processed a declarative table without changes
            fileHandled = true;
            debug("[MIGRATION] File " + change.filePath + " was handled by DECLARATIVE TABLE WITHOUT CHANGES handler", 'verbose');
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
      } 
      // Handle modified non-declarative files
      else if (change.current && isProcessedSqlFile(change.current) && !change.current.declarativeTable) {
        debug(`[MIGRATION] Processing modified non-declarative file: ${change.filePath}`, 'verbose');
        
        // Check if we should use statement diffing for this file
        const shouldUseStatementDiff = 
          change.current.splitStatements === true && 
          change.statementChanges && 
          change.statementChanges.length > 0;

        if (shouldUseStatementDiff) {
          // Defer to the statement diffing block below
          debug(`[MIGRATION] Modified non-declarative file ${change.filePath} has splitStatements=true. Deferring to statement diffing.`, 'verbose');
          fileHandled = false; // Ensure it falls through to the next block
        } else {
          // Handle as a regular modified non-declarative file (dump full content)
          debug(`[MIGRATION] Generating NON-DECLARATIVE full content for ${change.filePath} (splitStatements=${change.current.splitStatements ?? false})`, 'verbose');
          let currentRawContent = change.current.rawFileContent;

          // Fallback: If raw content wasn't provided in the diff, read it from disk
          if (!currentRawContent && configPath) {
            const absolutePath = toAbsolutePath(configPath, change.filePath);
            debug("[MIGRATION] Non-declarative fallback: Attempting to read " + absolutePath, 'verbose');
            try {
              currentRawContent = fs.readFileSync(absolutePath, 'utf-8');
              debug("[MIGRATION] Non-declarative fallback: Successfully read content from " + absolutePath, 'verbose');
            } catch (error) {
              logger.error(`Non-declarative fallback: Failed to read file ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
              currentRawContent = `-- ERROR: Could not read original content for ${change.filePath}\n`;
            }
          } else if (!currentRawContent && !configPath) {
            logger.warn(`Non-declarative fallback: Cannot read file ${change.filePath} because configPath was not provided.`);
            currentRawContent = `-- WARNING: Could not read original content for ${change.filePath} (configPath missing)\n`;
          }

          if (currentRawContent) {
            lines.push(`\n-- >>> Content for modified non-declarative file: ${change.filePath} <<<`);
            lines.push(currentRawContent.trim());
            lines.push(`-- <<< End content for: ${change.filePath} >>>\n`);

            // Mark as handled since we added content for this file
            fileHandled = true;
            debug(`[MIGRATION] File ${change.filePath} was handled by NON-DECLARATIVE handler.`, 'verbose');

            // Update checksum in migration state
            if (change.current.rawFileChecksum) {
              debug(`[MIGRATION] Updating file checksum for modified non-declarative file: ${change.filePath}`, 'verbose');
              debug(`  New file checksum: ${change.current.rawFileChecksum.substring(0, 8)}...`, 'verbose');
              migrationState.sourceFileChecksums[change.filePath] = {
                checksum: change.current.rawFileChecksum
              };
            } else {
              logger.error(`Missing rawFileChecksum for non-declarative file: ${change.filePath}`);
              migrationState.sourceFileChecksums[change.filePath] = {
                checksum: getHash(currentRawContent) // Fallback hash
              };
            }
          } else {
            lines.push(`-- WARNING: Could not retrieve current content for modified file ${change.filePath}`);
            fileHandled = true;
            debug(`[MIGRATION] File ${change.filePath} was handled by NON-DECLARATIVE (WARNING/No Content) handler`, 'verbose');
          }
        } // End of else block (dump full content)
      } // End of handling modified non-declarative files

      // Check if file was *not* handled by the blocks above (e.g., due to splitStatement deferral)
      // AND if there are statement changes to process
      if (!fileHandled && change.statementChanges && change.statementChanges.length > 0) {
        debug(`[MIGRATION] File ${change.filePath} processing statement changes (splitStatement enabled or other condition).`, 'verbose');
        
        const addedStmts = change.statementChanges.filter((sc) => sc.type === 'added');
        const deletedStmts = change.statementChanges.filter((sc) => sc.type === 'deleted');

        if (deletedStmts.length > 0) {
          debug("[MIGRATION] Generating DELETED statement comments for " + change.filePath, 'verbose');
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
          debug("[MIGRATION] Generating ADDED statements for " + change.filePath, 'verbose');
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
        
        // Mark file as handled if we found any statement changes
        if (addedStmts.length > 0 || deletedStmts.length > 0) {
          fileHandled = true;
          debug("[MIGRATION] File " + change.filePath + " was handled by STATEMENT CHANGES handler", 'verbose');
        } else {
          debug("[MIGRATION] File " + change.filePath + " had no statement changes to process", 'verbose');
        }
      } 
      // Fallback/Error Case (Previously handled the non-declarative full file replace)
      // else if (change.current && isProcessedSqlFile(change.current)) {
      //   const currentRawContent = change.current.rawFileContent;
      //   if (currentRawContent) {
      //     const content = currentRawContent.trim();
      //     const checksum = getHash(content);
          
      //     // Add to migrationState
      //     migrationState.statements.push({ checksum, filePath: change.filePath });
          
      //     // Include the complete file content in the migration
      //     lines.push(`-- NOTE: File content has changed. Including complete content:`);
      //     lines.push(wrapStatementWithChecksum(content, checksum));
      //   } else {
      //     lines.push(`-- WARNING: Could not retrieve current content for modified file ${change.filePath}`);
      //   }
      // }
      
      // If no specific handler processed this file but it's still in the modifiedFiles list,
      // add a fallback handler to include its content or a message
      if (!fileHandled) {
        debug("[MIGRATION] File " + change.filePath + " was NOT HANDLED by any specific handler, using FALLBACK", 'verbose');
        
        // Try to get current content if available
        if (change.current && isProcessedSqlFile(change.current) && change.current.rawFileContent) {
          lines.push(`-- NOTE: File content has changed. Including complete content:`);
          
          // If the file has parsed statements, use them with checksums
          if (change.current.statements && change.current.statements.length > 0) {
            change.current.statements.forEach((stmt) => {
              const checksum = stmt.checksum;
              // Ensure content is a string before wrapping
              const content = stmt.content || '';
              const wrapped = wrapStatementWithChecksum(content, checksum);
              lines.push(wrapped);
              
              // Add to migration state
              migrationState.statements.push({
                checksum,
                filePath: change.filePath
              });
            });
          } else {
            // Otherwise just include the raw content
            lines.push(change.current.rawFileContent.trim());
          }
          
          // Update checksum in migration state
          if (change.current.rawFileChecksum) {
            debug(`[MIGRATION] Updating file checksum for modified file (non-declarative full content): ${change.filePath}`, 'verbose');
            debug(`  New file checksum: ${change.current.rawFileChecksum.substring(0, 8)}...`, 'verbose');
            migrationState.sourceFileChecksums[change.filePath] = {
              checksum: change.current.rawFileChecksum
            };
          }
          debug("[MIGRATION] File " + change.filePath + " was handled by FALLBACK (with content) handler", 'verbose');
        } else {
          lines.push(`-- Unable to retrieve content for this modified file`);
          debug("[MIGRATION] File " + change.filePath + " was handled by FALLBACK (no content) handler", 'verbose');
        }
      }
    });
    debug("[MIGRATION] ===== FINISHED PROCESSING MODIFIED FILES =====", 'verbose');
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
        
        // Also update the file checksum if this is a deleted file
        // This prevents it from being included in future migrations
        if (change.filePath) {
          debug(`[MIGRATION] Removing file checksum for deleted file: ${change.filePath}`, 'verbose');
          // Set to null to indicate file is deleted
          migrationState.sourceFileChecksums[change.filePath] = { 
            checksum: '' 
          };
        }
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

  const migrationContent = lines.join('\n') + '\n';
  
  // Validate if the migration has actual SQL content
  if (!migrationHasActualContent(migrationContent)) {
    logger.info(chalk.dim('No actual SQL changes detected. Skipping migration generation.'));
    return { content: '', state: migrationState };
  }

  // Final debug log of all file checksums that were updated in this migration
  debug("[MIGRATION] File checksums updated in this migration:", 'verbose');
  Object.keys(migrationState.sourceFileChecksums).forEach(filePath => {
    const checksumObj = migrationState.sourceFileChecksums[filePath];
    debug(`  - ${filePath}: ${checksumObj.checksum ? checksumObj.checksum.substring(0, 8) + '...' : 'DELETED'}`, 'verbose');
  });

  debug("[MIGRATION] ===== MIGRATION GENERATION COMPLETE =====", 'verbose');
  return { content: migrationContent, state: migrationState };
}

/**
 * Validates if a migration has actual SQL content, not just comments.
 * 
 * @param content The migration content to validate
 * @returns True if the migration contains actual SQL statements, false otherwise
 */
export function migrationHasActualContent(content: string): boolean {
  // If there's no content at all, there's definitely no SQL
  if (!content.trim()) {
    return false;
  }

  // Remove all comments (lines starting with --)
  const contentWithoutComments = content
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n')
    .trim();

  // Remove migration marker comments
  const contentWithoutMarkers = contentWithoutComments
    .replace(/-- sqlsync: startStatement:[a-f0-9]+/g, '')
    .replace(/-- sqlsync: endStatement:[a-f0-9]+/g, '')
    .trim();

  // If after removing all comments and markers we have content, it contains SQL
  return contentWithoutMarkers.length > 0;
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
            const renamedColumns = alterOperations.filter((op) => op.type === 'RENAME_COLUMN');

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

            if (renamedColumns.length > 0) {
              logger.info(
                chalk.blue(`    Renamed ${renamedColumns.length} column(s):`)
              );
              renamedColumns.forEach((op) => {
                if (op.type === 'RENAME_COLUMN') {
                  logger.info(chalk.blue(`      ${op.columnName} -> ${op.newColumnName}`));
                }
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
