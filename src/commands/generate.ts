import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../core/config-loader';
import { traverseDirectories } from '../core/directory-traverser';
import { diffStates } from '../core/diff-engine';
import { 
  generateMigrationContent, 
  displayChangesInConsole 
} from '../core/migration-generator';
import { 
  loadState, 
  saveMigrationToState, 
  loadLocalAppliedMigrations,
  saveLocalAppliedMigrations 
} from '../core/state-manager';
import { logger } from '../utils/logger';
import { generateTimestamp } from '../utils/datetime-utils';
import { SQLSYNC_STATE_VERSION } from '../types/state';

/**
 * Generates a migration file based on differences between the current state and schema files.
 * 
 * @param configPath The path to the sqlsync.yaml configuration file
 * @param migrationName The name/description of the migration to be used in the filename
 * @param options Additional options for migration generation
 * @returns The path to the generated migration file
 */
export async function generateCommand(
  configPath: string,
  migrationName: string,
  options: any = {}
): Promise<string> {
  try {
    logger.info(`Loading config from: ${configPath}`);
    const config = loadConfig(configPath);
    
    if (!config.config?.migrations?.outputDir) {
      throw new Error('Missing required config: config.migrations.outputDir');
    }
    
    // Process all SQL files in the project
    const configDir = path.dirname(configPath);
    let state = loadState(configPath);
    
    // Handle case where state file doesn't exist or is invalid
    if (!state || typeof state.currentFileChecksums !== 'object') {
      logger.warn('State file not found or invalid. Assuming initial state.');
      // Initialize with a default empty state structure conforming to SqlSyncState
      state = {
        version: SQLSYNC_STATE_VERSION,
        lastProductionMigration: null,
        migrationHistory: [],
        migrations: {},
        currentDeclarativeTables: {},
        currentFileChecksums: {}
      };
    }
    
    const sections = await traverseDirectories(config, configDir);
    
    // Generate timestamp for migration filename
    const timestamp = generateTimestamp();
    const sanitizedName = migrationName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const migrationFilename = `${timestamp}_${sanitizedName}.sql`;
    
    // Build the full path for the migration file
    const migrationsDir = path.join(configDir, config.config.migrations.outputDir);
    const migrationFilePath = path.join(migrationsDir, migrationFilename);
    
    // Ensure migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }
    
    // Calculate differences between current schema files and state
    const differences = diffStates(state, sections);
    
    // Display changes in console
    displayChangesInConsole(differences);
    
    if (differences.fileChanges.length === 0) {
      logger.info('No changes detected. Migration not generated.');
      return '';
    }
    
    // Generate migration content and state
    const { content, state: migrationState } = generateMigrationContent(differences, sanitizedName);
    
    // Write migration file
    fs.writeFileSync(migrationFilePath, content);
    logger.info(`Migration created: ${migrationFilename}`);
    
    // Save migration state
    saveMigrationToState(configPath, migrationFilename, content, migrationState);
    logger.info(`State updated with new migration`);
    
    // Mark the migration as applied locally
    if (options.markApplied !== false) { // Mark applied by default unless explicitly set to false
      // Ensure appliedMigrations is an array, even if loadLocalAppliedMigrations returns undefined/null
      const appliedMigrations = loadLocalAppliedMigrations(configPath) || []; 
      if (!appliedMigrations.includes(migrationFilename)) {
        appliedMigrations.push(migrationFilename);
        saveLocalAppliedMigrations(configPath, appliedMigrations);
        logger.success(`Marked migration as applied locally`);
      }
    }
    
    return migrationFilePath;
  } catch (error) {
    logger.error(`Failed to generate migration: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
