import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { loadConfig } from '../core/config-loader';
import { 
  loadState, 
  saveState, 
  loadLocalAppliedMigrations,
  saveLocalAppliedMigrations
} from '../core/state-manager';
import { SqlSyncState, MigrationState } from '../types/state';
import { logger } from '../utils/logger';
import { debug } from '../utils/debug';
import readline from 'readline';

/**
 * Migration info with simplified interface
 */
interface MigrationInfo {
  name: string;
  createdAt: string;
  marked?: boolean;
}

/**
 * Implements the rollback command for reverting the most recent migrations
 * and updating the state to reflect previous versions, using the unified state structure.
 * 
 * @param configPath Absolute path to the config file
 * @param migrationName The name of the migration file to roll back to (inclusive), or empty string for list-only
 * @param options Command options
 */
export async function rollbackCommand(
  configPath: string, 
  migrationName: string,
  options: any = {}
): Promise<void> {
  try {
    // Load configuration
    const config = loadConfig(configPath);
    
    if (!config.config?.migrations?.outputDir) {
      throw new Error('Missing required config: config.migrations.outputDir');
    }
    
    // Get migrations directory path
    const configDir = path.dirname(configPath);
    const migrationsDir = path.join(configDir, config.config.migrations.outputDir);
    
    // Load state using our unified state format
    const state = loadState(configPath);
    
    // If no migration name provided, just list available migrations
    if (!migrationName) {
      await listMigrationsForRollback(state, options.maxRollbacks);
      return;
    }
    
    // Handle mark/unmark commands
    if (options.mark) {
      await markMigration(state, migrationName, options.maxRollbacks, configPath);
      return;
    }
    
    if (options.unmark) {
      await unmarkMigration(state, migrationName, configPath);
      return;
    }

    // Determine which migrations to roll back
    const migrationsToRollBack = await determineMigrationsToRollback(
      state, 
      migrationName,
      options.maxRollbacks
    );
    
    if (migrationsToRollBack.length === 0) {
      logger.info(chalk.yellow('No migrations to roll back based on criteria.'));
      return;
    }
    
    // Display migrations to be rolled back with confirmation
    if (migrationsToRollBack.length > 0) {
      logger.info(chalk.white('\nThe following', migrationsToRollBack.length, 'migrations will be rolled back:'));
      for (const migration of migrationsToRollBack) {
        logger.info(chalk.white(`  ${migration.name}`));
      }
      
      logger.info('');
      logger.warn(chalk.yellow('WARNING: This operation may cause data loss. Use --dry-run to preview impact.'));
      
      // Check if user wants to skip confirmation
      if (!options.force) {
        // Display confirmation message
        logger.info(
          chalk.yellow('Use --force to skip this confirmation prompt.')
        );
        
        // Since we don't have readline integration in this simple script,
        // we'll just log a message for now
        logger.info(chalk.red('Interactive confirmation not implemented. Use --force to proceed.'));
        return;
      }
    }
    
    // If any marked migrations are being rolled back, require force flag
    const hasMarkedMigrations = migrationsToRollBack.some(m => m.marked);
    
    if (hasMarkedMigrations && !options.force) {
      logger.error(
        chalk.red(
          '\nOne or more migrations is marked as protected. ' +
          'Use --force to roll back these migrations anyway.'
        )
      );
      return;
    }
    
    // If not dry run, perform the rollback
    if (!options.dryRun) {
      // Update state to reflect the rollback
      await updateStateForRollback(configPath, state, migrationsToRollBack);
      
      // Ask if the user wants to delete the rolled back migration files
      if (options.deleteFiles) {
        await deleteMigrationFiles(configPath, migrationsToRollBack);
      } else {
        logger.info(chalk.yellow("\nMigration files have not been deleted."));
        logger.info(chalk.yellow("Use --delete-files to remove the rolled back migration files."));
      }
      
      logger.info(
        chalk.green('\nSuccessfully rolled back', migrationsToRollBack.length, 'migrations.')
      );
      
      logger.info(
        chalk.yellow(
          '\nNote: Rolling back migrations only updates the SQLSync state. ' +
          'It does not actually revert changes in your database. ' +
          'You are responsible for reverting the database changes manually.'
        )
      );
    } else {
      logger.info(
        chalk.yellow('\nDry run complete. No changes were made to the state files.')
      );
    }
  } catch (error) {
    logger.error(`Error during rollback: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Marks a migration for protection from rollbacks.
 */
async function markMigration(
  state: SqlSyncState,
  migrationName: string,
  maxRollbacks: number | undefined,
  configPath: string
): Promise<void> {
  // Find the migration in the history
  const migrationIndex = state.migrationHistory.findIndex(m => m === migrationName);
  
  if (migrationIndex === -1) {
    throw new Error(`Migration "${migrationName}" not found in history.`);
  }
  
  // Check if marking this would exceed maxRollbacks limit
  if (maxRollbacks !== undefined) {
    const markedCount = countMarkedMigrations(state);
    const newCount = markedCount + 1;
    
    if (newCount > maxRollbacks) {
      logger.warn(
        chalk.yellow(
          `Marking this migration would exceed the configured maximum rollbacks limit of ${maxRollbacks}.`
        )
      );
      return;
    }
  }
  
  // Mark the migration in the state
  if (!state.migrations[migrationName]) {
    state.migrations[migrationName] = {
      statements: [],
      declarativeTables: {},
      sourceFileChecksums: {}, // Add the required property
      marked: true
    };
  } else {
    state.migrations[migrationName].marked = true;
  }
  
  // Save changes
  saveState(configPath, state);
  logger.info(chalk.green(`Successfully marked migration "${migrationName}" as protected.`));
}

/**
 * Unmarks a previously marked migration.
 */
async function unmarkMigration(
  state: SqlSyncState,
  migrationName: string,
  configPath: string
): Promise<void> {
  // Find the migration in the history
  const migrationIndex = state.migrationHistory.findIndex(m => m === migrationName);
  
  if (migrationIndex === -1) {
    throw new Error(`Migration "${migrationName}" not found in history.`);
  }
  
  // Check if the migration exists and is marked
  if (!state.migrations[migrationName] || !state.migrations[migrationName].marked) {
    logger.warn(chalk.yellow(`Migration "${migrationName}" is not currently marked.`));
    return;
  }
  
  // Unmark the migration
  state.migrations[migrationName].marked = false;
  
  // Save changes
  saveState(configPath, state);
  logger.info(chalk.green(`Successfully unmarked migration "${migrationName}".`));
}

/**
 * Helper to count marked migrations in the state.
 */
function countMarkedMigrations(state: SqlSyncState): number {
  return Object.values(state.migrations).filter(m => m.marked).length;
}

/**
 * Lists all available migrations that can be rolled back.
 * Respects maxRollbacks limit if specified.
 */
async function listMigrationsForRollback(
  state: SqlSyncState,
  maxRollbacks?: number
): Promise<void> {
  const migrationHistory = state.migrationHistory;
  
  if (migrationHistory.length === 0) {
    logger.info('No migrations found in history.');
    return;
  }
  
  logger.info(chalk.bold('\nMigration history:'));
  
  // Get the migration history in reverse order (newest first)
  const reversedHistory = [...migrationHistory].reverse();
  
  // Determine if we should limit the display based on maxRollbacks
  const displayLimit = maxRollbacks !== undefined
    ? Math.min(maxRollbacks, reversedHistory.length)
    : reversedHistory.length;
  
  // Count how many migrations are already marked
  const markedCount = countMarkedMigrations(state);
  
  // If we have a limit and we've already reached it, warn the user
  if (maxRollbacks !== undefined && markedCount >= maxRollbacks) {
    logger.warn(
      chalk.yellow(
        `\nWARNING: You've already marked ${markedCount} migrations, ` +
        `which is at or above your configured limit of ${maxRollbacks}. ` +
        `You'll need to unmark some migrations before marking more.`
      )
    );
  }
  
  // Display the migrations
  for (let i = 0; i < displayLimit; i++) {
    const migrationName = reversedHistory[i];
    const migrationState = state.migrations[migrationName];
    const createdAt = migrationState?.createdAt || 'Unknown';
    const isMarked = migrationState?.marked || false;
    
    const markedIndicator = isMarked ? chalk.red(' [PROTECTED]') : '';
    logger.info(`  ${chalk.green(migrationName)} (${createdAt})${markedIndicator}`);
  }
  
  // If we limited the display, show how many more are available
  if (displayLimit < reversedHistory.length) {
    const remaining = reversedHistory.length - displayLimit;
    logger.info(chalk.dim(`  ... and ${remaining} more (only showing the most recent ${displayLimit})`));
  }
  
  logger.info('');
  logger.info('To roll back to a specific migration:');
  logger.info(chalk.dim('  sqlsync rollback <migration-name>'));
  logger.info('');
  logger.info('To mark a migration as protected from rollback:');
  logger.info(chalk.dim('  sqlsync rollback <migration-name> --mark'));
  logger.info('');
  logger.info('To unmark a previously marked migration:');
  logger.info(chalk.dim('  sqlsync rollback <migration-name> --unmark'));
}

/**
 * Determines which migrations should be rolled back based on the target
 * and any configured limits.
 */
async function determineMigrationsToRollback(
  state: SqlSyncState,
  migrationName: string,
  maxRollbacks?: number
): Promise<MigrationInfo[]> {
  const migrationHistory = state.migrationHistory;
  
  // Find the target migration in the history
  const targetIndex = migrationHistory.findIndex(m => m === migrationName);
  
  if (targetIndex === -1) {
    throw new Error(`Migration "${migrationName}" not found in history.`);
  }
  
  // Get all migrations after the target (these will be rolled back)
  const migrationsToRollBack = migrationHistory
    .slice(targetIndex + 1)
    .map(name => {
      const migrationState = state.migrations[name];
      return {
        name,
        createdAt: migrationState?.createdAt || 'Unknown',
        marked: migrationState?.marked || false
      };
    })
    .reverse(); // Newest first for display
  
  // Apply the maxRollbacks limit if specified
  if (maxRollbacks !== undefined && migrationsToRollBack.length > maxRollbacks) {
    logger.warn(
      chalk.yellow(
        `\nWARNING: You're attempting to roll back ${migrationsToRollBack.length} migrations, ` +
        `but your configured limit is ${maxRollbacks}. ` +
        `Only the ${maxRollbacks} most recent migrations will be rolled back.`
      )
    );
    
    return migrationsToRollBack.slice(0, maxRollbacks);
  }
  
  return migrationsToRollBack;
}

/**
 * Deletes the migration files for the given migrations.
 */
async function deleteMigrationFiles(
  configPath: string,
  migrations: MigrationInfo[]
): Promise<void> {
  const configDir = path.dirname(configPath);
  const migrationsDir = path.join(configDir, 'migrations');
  
  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration.name);
    
    try {
      await fs.promises.unlink(filePath);
      logger.info(chalk.green(`Deleted migration file: ${filePath}`));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info(chalk.yellow(`Migration file not found: ${filePath}`));
      } else {
        logger.error(`Error deleting migration file: ${error.message || String(error)}`);
      }
    }
  }
}

/**
 * Updates the unified state file to reflect rolled back migrations.
 * Also updates the local applied migrations file.
 */
async function updateStateForRollback(
  configPath: string,
  state: SqlSyncState,
  migrationsToRollBack: MigrationInfo[]
): Promise<void> {
  // Get the names of migrations to roll back
  const migrationNames = migrationsToRollBack.map(m => m.name);
  
  logger.info(chalk.blue('\nUpdating state to roll back migrations...'));
  
  // Remove these migrations from the history
  state.migrationHistory = state.migrationHistory.filter(name => !migrationNames.includes(name));
  
  // Remove these migrations from the migrations record
  for (const name of migrationNames) {
    delete state.migrations[name];
  }
  
  // Update the lastProductionMigration if needed
  if (state.lastProductionMigration && migrationNames.includes(state.lastProductionMigration)) {
    // Find the last remaining migration in history
    state.lastProductionMigration = state.migrationHistory.length > 0
      ? state.migrationHistory[state.migrationHistory.length - 1]
      : null;
  }
  
  // Rebuild the current declarative tables state based on remaining migrations
  await rebuildCurrentDeclarativeTables(state);
  
  // Regenerate file checksums based on current state
  await rebuildFileChecksums(configPath, state);
  
  logger.info(chalk.blue('Saving updated state...'));
  
  // Save the updated state
  saveState(configPath, state);
  
  // Also update the local applied migrations file
  const localApplied = loadLocalAppliedMigrations(configPath);
  const updatedLocalApplied = localApplied.filter(name => !migrationNames.includes(name));
  saveLocalAppliedMigrations(configPath, updatedLocalApplied);
  
  // Report on state changes
  logger.info(chalk.green(`State updated: ${state.migrationHistory.length} migrations remain in history`));
  logger.info(chalk.green(`Local applied migrations: ${updatedLocalApplied.length} remain tracked`));
}

/**
 * Rebuilds the currentDeclarativeTables based on the current migration history.
 * This ensures that after a rollback, we have the correct table state.
 */
async function rebuildCurrentDeclarativeTables(state: SqlSyncState): Promise<void> {
  // Clear the current state
  state.currentDeclarativeTables = {};
  state.currentFileChecksums = {};
  
  // Process migrations in order to rebuild the current state
  for (const migrationName of state.migrationHistory) {
    const migrationState = state.migrations[migrationName];
    
    if (migrationState && migrationState.declarativeTables) {
      // Copy declarative tables from this migration to the current state
      Object.entries(migrationState.declarativeTables).forEach(([filePath, tableState]) => {
        state.currentDeclarativeTables[filePath] = tableState;
        
        // Also update the checksum for this file
        if (tableState.rawStatementChecksum) {
          state.currentFileChecksums[filePath] = tableState.rawStatementChecksum;
        }
      });
    }
  }
}

/**
 * Regenerates file checksums based on the current state.
 * This ensures that after a rollback, the file checksums accurately reflect
 * the current state of files, preventing false change detection.
 */
async function rebuildFileChecksums(
  configPath: string,
  state: SqlSyncState
): Promise<void> {
  const configDir = path.dirname(configPath);
  
  // Clear existing checksums that might be outdated
  const oldChecksums = { ...state.currentFileChecksums };
  state.currentFileChecksums = {};
  
  // Rebuild checksums from actual files
  for (const [relativePath, _] of Object.entries(oldChecksums)) {
    const absolutePath = path.join(configDir, relativePath);
    
    try {
      if (fs.existsSync(absolutePath)) {
        const content = fs.readFileSync(absolutePath, 'utf8');
        // Use the getHash function from hash utility
        const newChecksum = require('crypto')
          .createHash('sha256')
          .update(content)
          .digest('hex');
        
        state.currentFileChecksums[relativePath] = newChecksum;
      }
    } catch (error: any) {
      logger.warn(`Could not update checksum for ${relativePath}: ${error.message || String(error)}`);
    }
  }
  
  logger.info(chalk.blue(`Rebuilt checksums for ${Object.keys(state.currentFileChecksums).length} files`));
}
