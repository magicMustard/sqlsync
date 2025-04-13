import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from '../core/config-loader';
import { 
  loadState, 
  saveState, 
  saveMigrationToState
} from '../core/state-manager';
import { traverseDirectories } from '../core/directory-traverser';
import { diffStates } from '../core/diff-engine';
import { SqlSyncState, MigrationState } from '../types/state';
import { ProcessedSection, ProcessedSqlFile } from '../types/processed-sql';
import { logger } from '../utils/logger';
import { debug } from '../utils/debug';

/**
 * Result of syncing migrations
 */
interface SyncResult {
  newMigrations: Array<{name: string, createdAt: string}>;
}

/**
 * Detects pending changes between the current state and file system
 * 
 * @param configPath Path to sqlsync.yaml config file
 * @param sections Processed sections from traverseDirectories
 * @param state Current SQLSync state
 * @returns Array of file paths with changes
 */
async function detectPendingChanges(
  configPath: string,
  sections: ProcessedSection[],
  state: SqlSyncState
): Promise<string[]> {
  debug('detectPendingChanges starting', 'basic');
  debug(`Current state has ${Object.keys(state.currentFileChecksums).length} file checksums`, 'basic');
  
  const pendingChanges: string[] = [];
  
  // Get file changes from diff engine
  const differences = diffStates(state, sections);
  
  // Add all changed files to pendingChanges
  debug('Processing file changes from diffStates', 'basic');
  differences.fileChanges.forEach((fileChange: { filePath: string; type: string }) => {
    if (fileChange.type !== 'unmodified') {
      // Check if this is an absolute path that needs conversion
      let filePath = fileChange.filePath;
      
      // Convert absolute paths to relative for consistency with state
      if (filePath.startsWith('/')) {
        // Extract the relative path from the absolute path
        const configDir = path.dirname(configPath);
        filePath = path.relative(configDir, filePath);
        debug(`Converting absolute path to relative: ${fileChange.filePath} -> ${filePath}`, 'verbose');
      }
      
      // Check if this relative path already exists in our state checksums
      const isInState = state.currentFileChecksums[filePath] !== undefined;
      
      // If it's a path issue (file exists in state under relative path but was detected as added), skip it
      if (fileChange.type === 'added' && isInState) {
        debug(`Skipping false positive - file already exists in state: ${filePath}`, 'basic');
        return; // Skip this file
      }
      
      // If it's a path issue (file exists on disk but was detected as deleted), skip it
      if (fileChange.type === 'deleted') {
        try {
          const fullPath = path.join(path.dirname(configPath), filePath);
          if (fs.existsSync(fullPath)) {
            debug(`Skipping false positive - file exists on disk but was marked deleted: ${filePath}`, 'basic');
            return; // Skip this file
          }
        } catch (err) {
          // If there's an error checking the file, proceed with deletion
          debug(`Error checking file: ${filePath} - ${err}`, 'verbose');
        }
      }
      
      debug(`Pending change: ${filePath} (${fileChange.type})`, 'basic');
      pendingChanges.push(filePath);
    }
  });
  
  logger.info(`Detected ${pendingChanges.length} files with pending changes`);
  
  // If we have pending changes, let's print the first 5 to help debugging
  if (pendingChanges.length > 0) {
    debug('Sample of pending changes:', 'basic');
    pendingChanges.slice(0, 5).forEach((filePath, index) => {
      debug(`  ${index + 1}. ${filePath}`, 'basic');
      
      // Check if this file exists in our checksums
      if (state.currentFileChecksums[filePath]) {
        debug(`     - Has checksum in state: ${state.currentFileChecksums[filePath].substring(0, 8)}...`, 'verbose');
      } else {
        debug(`     - No checksum in state`, 'verbose');
      }
      
      // Check if this file exists on disk
      try {
        const fullPath = path.isAbsolute(filePath) 
          ? filePath 
          : path.join(path.dirname(configPath), filePath);
        
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          debug(`     - File exists on disk (${content.length} bytes)`, 'verbose');
        } else {
          debug(`     - File does not exist on disk at ${fullPath}`, 'verbose');
        }
      } catch (error) {
        debug(`     - Error checking file: ${error}`, 'verbose');
      }
    });
  }
  
  return pendingChanges;
}

/**
 * Syncs migrations from the migrations directory with the state
 * 
 * @param configPath Path to sqlsync.yaml config file
 * @param migrationsDir Path to migrations directory
 * @param state Current SQLSync state
 * @returns SyncResult with new migrations
 */
async function syncMigrations(
  configPath: string,
  migrationsDir: string,
  state: SqlSyncState
): Promise<SyncResult> {
  const result: SyncResult = {
    newMigrations: []
  };
  
  // Ensure migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    logger.info(`Created migrations directory: ${migrationsDir}`);
  }
  
  // Get all SQL migration files in the directory
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort alphabetically to ensure timestamp order
  
  // Find new migrations (not in migrationHistory)
  const newMigrations = migrationFiles.filter(
    migration => !state.migrationHistory.includes(migration)
  );
  
  if (newMigrations.length === 0) {
    logger.info('No new migrations found');
    return result;
  }
  
  logger.info(`Found ${newMigrations.length} new migrations`);
  
  // Process each new migration
  for (const migrationFile of newMigrations) {
    const migrationPath = path.join(migrationsDir, migrationFile);
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    
    // Create simple migration state
    const migrationState: MigrationState = {
      statements: [],
      declarativeTables: {},
      sourceFileChecksums: {}, // Add the required property
      createdAt: new Date().toISOString(),
      fileChecksum: ''
    };
    
    // Update state with this migration
    saveMigrationToState(configPath, migrationFile, migrationContent, migrationState, state.currentFileChecksums, state.currentDeclarativeTables);
    
    // Add to result
    result.newMigrations.push({
      name: migrationFile,
      createdAt: migrationState.createdAt || new Date().toISOString() // Ensure createdAt is never undefined
    });
    
    logger.info(`Synced migration: ${migrationFile}`);
  }
  
  return result;
}

/**
 * The sync command
 * Implements the sync command for detecting and registering migrations
 * from other developers
 *
 * @param configPath Path to sqlsync.yaml config file
 * @param options Command options
 */
export async function syncCommand(configPath: string, options: any = {}): Promise<void> {
  try {
    logger.info(`Loading config from: ${configPath}`);
    const config = loadConfig(configPath);
    
    if (!config.config?.migrations?.outputDir) {
      throw new Error('Missing required config: config.migrations.outputDir');
    }
    
    // Get migrations directory path
    const configDir = path.dirname(configPath);
    const migrationsDir = path.join(configDir, config.config.migrations.outputDir);
    
    // Process all SQL files - this will throw if any parsing errors are found
    const sections = await traverseDirectories(config, configDir);
    
    // Load unified state
    const state = loadState(configPath);
    
    // Detect pending changes
    const pendingChanges = await detectPendingChanges(configPath, sections, state);
    
    // Sync migrations
    const syncResult = await syncMigrations(configPath, migrationsDir, state);
    
    // Report on sync results
    if (syncResult.newMigrations.length > 0) {
      logger.info(chalk.green(`Successfully synced ${syncResult.newMigrations.length} new migrations.`));
    }
    
    // Check for pending changes and suggest generate command
    if (pendingChanges.length > 0) {
      logger.info(chalk.yellow(`Found ${pendingChanges.length} pending changes that need to be included in a new migration.`));
      logger.info(chalk.yellow('Run sqlsync generate <migration-name> to create a new migration with these changes.'));
    }
    
  } catch (error: any) {
    logger.error(chalk.red(`Error during sync: ${error.message}`));
    throw error;
  }
}
