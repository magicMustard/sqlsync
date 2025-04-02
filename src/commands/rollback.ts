import * as path from 'path';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import { loadConfig } from '@/core/config-loader';
import { loadEnhancedState, saveEnhancedState } from '@/core/collaboration-manager';
import { loadState, saveState } from '@/core/state-manager';
import { EnhancedSqlSyncState, MigrationInfo } from '@/types/collaboration';
import { ProcessedSection } from '@/types/processed-sql';
import { logger } from '@/utils/logger';

/**
 * Implements the rollback command for reverting the most recent migrations
 * and updating the state to reflect previous versions.
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
		
		// Load enhanced state
		const state = await loadEnhancedState(configPath);
		if (!state) {
			throw new Error('No collaboration state found. Run "sqlsync sync" to initialize.');
		}
		
		// Get max rollbacks limit from config
		const maxRollbacks = config.config?.maxRollbacks;
		
		// Handle mark/unmark operations
		if (options.mark) {
			await markMigration(state, migrationName, maxRollbacks, configPath);
			return;
		}
		
		if (options.unmark) {
			await unmarkMigration(state, migrationName, configPath);
			return;
		}
		
		// If --list flag is passed, just show available migrations
		if (options.list) {
			await listMigrationsForRollback(state, maxRollbacks);
			return;
		}
		
		// We need a migration name for actual rollback
		if (!migrationName) {
			throw new Error('Migration name is required');
		}
		
		// Determine migrations to roll back
		const migrationsToRollBack = await determineMigrationsToRollback(
			state,
			migrationName,
			maxRollbacks
		);
		
		if (migrationsToRollBack.length === 0) {
			logger.info('No migrations to roll back.');
			return;
		}
		
		// Get the migration files to be rolled back
		const migrationFiles = migrationsToRollBack.map(m => path.join(migrationsDir, m.name));
		
		// Show migrations to be rolled back
		logger.info(chalk.yellow(`Rolling back ${migrationsToRollBack.length} migrations:`));
		for (const migration of migrationsToRollBack) {
			logger.info(chalk.yellow(`  - ${migration.name}`));
		}
		
		// Check if files exist
		for (const file of migrationFiles) {
			try {
				await fs.access(file);
			} catch (error) {
				logger.error(`Migration file not found: ${file}`);
				throw new Error(`Migration file not found: ${file}`);
			}
		}
		
		// Update enhanced state
		await updateStateForRollback(configPath, state, migrationsToRollBack);
		
		// Update the regular state file if needed
		const previousState = loadState(configPath);
		if (previousState) {
			// Here we'd need to regenerate the basic state based on rolled back migrations
			// This is a simplified approach - in a real implementation, we might need 
			// to carefully reconstruct the state
			saveState(configPath, recreateBasicState(state, previousState));
		}
		
		logger.info(chalk.green(`Successfully rolled back ${migrationsToRollBack.length} migrations.`));
		logger.info(chalk.yellow.bold('IMPORTANT: Database changes have NOT been applied automatically.'));
		logger.info('To roll back database changes:');
		logger.info('1. Check the rolled back migration files for the SQL statements that were applied');
		logger.info('2. Manually create and run appropriate rollback SQL (e.g., DROP TABLE, ALTER TABLE, etc.)');
		
		if (config.config?.migrations?.cli?.migrate) {
			logger.info('Alternatively, if you have a migration tool configured, you can run:');
			logger.info(`  ${config.config.migrations.cli.migrate} <target-version>`);
		}
		
	} catch (error) {
		logger.error(`Error executing rollback command: ${error}`);
		throw error;
	}
}

/**
 * Marks a migration for protection from rollbacks.
 */
async function markMigration(
	state: EnhancedSqlSyncState,
	migrationName: string,
	maxRollbacks: number | undefined,
	configPath: string
): Promise<void> {
	// Find the migration to mark
	const migration = findMigrationByName(state, migrationName);
	
	if (!migration) {
		logger.error(`Migration "${migrationName}" not found.`);
		return;
	}
	
	if (migration.marked) {
		logger.info(chalk.yellow(`Migration "${migration.name}" is already marked.`));
		return;
	}
	
	// Count current marked migrations
	const markedCount = state.migrations.filter(m => m.marked).length;
	
	// Check if we've reached the limit
	if (maxRollbacks !== undefined && markedCount >= maxRollbacks) {
		logger.error(
			chalk.red(`Cannot mark more migrations. Maximum of ${maxRollbacks} marked migrations allowed.`)
		);
		logger.info(
			'You must unmark a migration before marking a new one, or increase maxRollbacks in your config.'
		);
		return;
	}
	
	// Mark the migration
	migration.marked = true;
	await saveEnhancedState(configPath, state);
	
	logger.info(
		chalk.green(`Migration "${migration.name}" has been marked for protection.`)
	);
	logger.info(
		`Marked migrations cannot be rolled back until unmarked (${markedCount + 1}${maxRollbacks !== undefined ? '/' + maxRollbacks : ''} marked).`
	);
}

/**
 * Unmarks a previously marked migration.
 */
async function unmarkMigration(
	state: EnhancedSqlSyncState,
	migrationName: string,
	configPath: string
): Promise<void> {
	// Find the migration to unmark
	const migration = findMigrationByName(state, migrationName);
	
	if (!migration) {
		logger.error(`Migration "${migrationName}" not found.`);
		return;
	}
	
	if (!migration.marked) {
		logger.info(chalk.yellow(`Migration "${migration.name}" is not marked.`));
		return;
	}
	
	// Unmark the migration
	migration.marked = false;
	await saveEnhancedState(configPath, state);
	
	logger.info(
		chalk.green(`Migration "${migration.name}" has been unmarked and can now be rolled back.`)
	);
}

/**
 * Helper to find a migration by name.
 */
function findMigrationByName(
	state: EnhancedSqlSyncState,
	migrationName: string
): MigrationInfo | undefined {
	return state.migrations.find(m => m.name === migrationName);
}

/**
 * Lists all available migrations that can be rolled back.
 * Respects maxRollbacks limit if specified.
 */
async function listMigrationsForRollback(
	state: EnhancedSqlSyncState,
	maxRollbacks?: number
): Promise<void> {
	// Get sorted migrations (newest first)
	const sortedMigrations = [...state.migrations].sort((a, b) => {
		return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
	});
	
	if (sortedMigrations.length === 0) {
		logger.info('No migrations available for rollback.');
		return;
	}
	
	// Apply max rollbacks limit if configured
	const displayLimit = maxRollbacks !== undefined 
		? Math.min(sortedMigrations.length, maxRollbacks)
		: sortedMigrations.length;
	
	const rollbackableMigrations = sortedMigrations.slice(0, displayLimit);
	
	// Count marked migrations
	const markedCount = state.migrations.filter(m => m.marked).length;
	
	// Display header
	logger.info(chalk.bold('Migrations available for rollback:'));
	
	if (maxRollbacks !== undefined) {
		logger.info(chalk.cyan(`Showing most recent ${displayLimit} migrations (limited by maxRollbacks=${maxRollbacks})`));
		logger.info(chalk.cyan(`Marked migrations: ${markedCount}/${maxRollbacks}`));
	} else {
		logger.info(chalk.cyan(`Showing all ${rollbackableMigrations.length} migrations`));
		logger.info(chalk.cyan(`Marked migrations: ${markedCount}`));
	}
	
	// Display table header
	const headerLine = `${chalk.bold('STATUS')} | ${chalk.bold('TIMESTAMP')} | ${chalk.bold('MIGRATION NAME')} | ${chalk.bold('AFFECTED FILES')}`;
	const separator = '─'.repeat(120);
	logger.info(separator);
	logger.info(headerLine);
	logger.info(separator);
	
	// Display migration information in a table format
	rollbackableMigrations.forEach((migration) => {
		const timestamp = new Date(migration.timestamp).toLocaleString();
		const affectedCount = migration.appliedChanges.length;
		const status = migration.marked 
			? chalk.red('🔒 LOCKED') 
			: chalk.green('✓ ROLLBACK');
		
		// Format the line
		logger.info(
			`${status.padEnd(16)} | ` +
			`${timestamp.padEnd(19)} | ` +
			`${migration.name.padEnd(30)} | ` +
			`${affectedCount} file${affectedCount !== 1 ? 's' : ''}`
		);
	});
	
	logger.info(separator);
	
	// Show usage information
	logger.info('\nTo roll back migrations:');
	logger.info(`  ${chalk.cyan('sqlsync rollback <migration-name>')} - Roll back to the specified migration (inclusive)`);
	
	// Show marking information
	logger.info('\nTo protect/unprotect migrations:');
	logger.info(`  ${chalk.cyan('sqlsync rollback <migration-name> --mark')}   - Mark a migration to prevent rollback`);
	logger.info(`  ${chalk.cyan('sqlsync rollback <migration-name> --unmark')} - Unmark a migration to allow rollback`);
	
	// Show warning if limit is applied
	if (maxRollbacks !== undefined && sortedMigrations.length > maxRollbacks) {
		logger.info(
			chalk.yellow(`\nNote: Only showing ${maxRollbacks} of ${sortedMigrations.length} total migrations due to maxRollbacks limit.`)
		);
		logger.info(
			chalk.yellow('To allow more rollbacks, adjust the maxRollbacks setting in your sqlsync.yaml file.')
		);
	}
}

/**
 * Determines which migrations should be rolled back based on the target
 * and any configured limits.
 */
async function determineMigrationsToRollback(
	state: EnhancedSqlSyncState,
	migrationName: string,
	maxRollbacks?: number
): Promise<MigrationInfo[]> {
	// Get sorted migrations (newest first)
	const sortedMigrations = [...state.migrations].sort((a, b) => {
		return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
	});
	
	if (sortedMigrations.length === 0) {
		return [];
	}
	
	// Find the target migration
	const targetMigrationIndex = sortedMigrations.findIndex(m => m.name === migrationName);
	if (targetMigrationIndex === -1) {
		throw new Error(`Migration "${migrationName}" not found`);
	}
	
	// Check for marked migrations in the target range
	const migrationsInRange = sortedMigrations.slice(0, targetMigrationIndex + 1);
	const markedInRange = migrationsInRange.filter(m => m.marked);
	
	if (markedInRange.length > 0) {
		logger.error(chalk.red(`Cannot roll back to "${migrationName}" because ${markedInRange.length} marked migration(s) exist in the rollback range:`));
		markedInRange.forEach(m => {
			logger.error(chalk.red(`  - ${m.name}`));
		});
		logger.error(chalk.red("Unmark these migrations first using 'sqlsync rollback <migration-name> --unmark'"));
		return [];
	}
	
	let migrationsToRollBack = migrationsInRange;
	
	// Apply max rollbacks limit if configured
	if (maxRollbacks !== undefined && migrationsToRollBack.length > maxRollbacks) {
		logger.warn(
			chalk.yellow(`Warning: Requested to roll back ${migrationsToRollBack.length} migrations, but maxRollbacks is set to ${maxRollbacks}`)
		);
		migrationsToRollBack = migrationsToRollBack.slice(0, maxRollbacks);
	}
	
	return migrationsToRollBack;
}

/**
 * Updates the enhanced state file to reflect rolled back migrations.
 */
async function updateStateForRollback(
	configPath: string,
	state: EnhancedSqlSyncState,
	migrationsToRollBack: MigrationInfo[]
): Promise<void> {
	// Create a set of migration names to be rolled back for quick lookup
	const migrationNamesToRollBack = new Set(migrationsToRollBack.map(m => m.name));
	
	// Create a map of affected files by each migration for quick lookup
	const affectedFilesByMigration: Record<string, Set<string>> = {};
	for (const migration of migrationsToRollBack) {
		affectedFilesByMigration[migration.name] = new Set(migration.appliedChanges);
	}
	
	// Remove rolled back migrations from the migrations list
	state.migrations = state.migrations.filter(
		m => !migrationNamesToRollBack.has(m.name)
	);
	
	// Update file tracking - reset lastModifiedBy for rolled back files
	for (const [filePath, fileInfo] of Object.entries(state.files)) {
		if (fileInfo.lastModifiedBy && migrationNamesToRollBack.has(fileInfo.lastModifiedBy)) {
			// Find the most recent migration that affected this file and isn't being rolled back
			const mostRecentMigration = state.migrations
				.filter(m => m.appliedChanges.includes(filePath))
				.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
			
			// Update the lastModifiedBy value
			if (mostRecentMigration) {
				fileInfo.lastModifiedBy = mostRecentMigration.name;
			} else {
				fileInfo.lastModifiedBy = 'initialization';
			}
			
			// Reset statement tracking if needed
			if (fileInfo.statements) {
				for (const stmt of fileInfo.statements) {
					if (stmt.lastModifiedBy && migrationNamesToRollBack.has(stmt.lastModifiedBy)) {
						// Similar logic to find most recent migration for this statement
						stmt.lastModifiedBy = mostRecentMigration ? mostRecentMigration.name : null;
					}
				}
			}
		}
	}
	
	// Update production tracking if needed
	if (state.production && migrationNamesToRollBack.has(state.production.lastApplied)) {
		// Find the most recent migration that isn't being rolled back
		const newLastApplied = state.migrations
			.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
		
		if (newLastApplied) {
			state.production.lastApplied = newLastApplied.name;
			state.production.timestamp = new Date().toISOString();
		} else {
			// If no migrations left, remove production tracking
			delete state.production;
		}
	}
	
	// Save the updated state
	await saveEnhancedState(configPath, state);
}

/**
 * Recreates the basic state based on the updated enhanced state.
 * This is a simplified approach - a complete implementation would need to
 * actually reconstruct the old state based on changes from migrations.
 */
function recreateBasicState(
	enhancedState: EnhancedSqlSyncState,
	currentState: ProcessedSection[]
): ProcessedSection[] {
	// In a real implementation, we'd need to carefully reconstruct the state
	// based on the changes from rolled back migrations.
	// This simplified version just returns the current state.
	// A more robust solution would involve tracking before/after checksums
	// for each migration to allow proper reconstruction.
	
	return currentState;
}
