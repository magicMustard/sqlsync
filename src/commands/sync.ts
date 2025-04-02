import * as path from 'path';
import chalk from 'chalk';
import { loadConfig } from '@/core/config-loader';
import { traverseDirectories } from '@/core/directory-traverser';
import { 
	loadEnhancedState, 
	initializeEnhancedState,
	syncMigrations,
	detectPendingChanges
} from '@/core/collaboration-manager';

/**
 * Implements the sync command for detecting and registering migrations
 * from other developers and identifying potential conflicts
 */
export async function syncCommand(configPath: string, options: any = {}): Promise<void> {
	const logger = {
		info: (message: string) => options.verbose !== false && console.log(message),
		error: (message: string) => console.error(message),
		debug: (message: string) => options.verbose && console.log(message),
	};

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
		
		// Load or initialize enhanced state
		let state = await loadEnhancedState(configPath);
		if (!state) {
			state = await initializeEnhancedState(configPath, sections);
			logger.info('Initialized new collaboration state');
		}
		
		// Sync migrations
		const syncResult = await syncMigrations(configPath, migrationsDir, state);
		
		// Detect pending changes
		const pendingChanges = await detectPendingChanges(sections, state);
		syncResult.pendingChanges = pendingChanges;
		
		// Display results
		if (syncResult.newMigrations.length === 0 && 
			syncResult.pendingChanges.length === 0 &&
			syncResult.conflicts.length === 0) {
			logger.info('Everything is up to date, no actions needed');
		}
		
		if (syncResult.newMigrations.length > 0) {
			logger.info(
				chalk.green(
					`Found ${syncResult.newMigrations.length} new migrations to register:`
				)
			);
			for (const migration of syncResult.newMigrations) {
				logger.info(`  - ${migration.name}`);
				if (migration.appliedChanges.length > 0) {
					logger.info('    Affects:');
					for (const file of migration.appliedChanges) {
						logger.info(`      - ${file}`);
					}
				}
			}
		}
		
		if (syncResult.pendingChanges.length > 0) {
			logger.info(
				chalk.yellow(
					`Found ${syncResult.pendingChanges.length} files with changes but no migration:`
				)
			);
			for (const file of syncResult.pendingChanges) {
				logger.info(`  - ${file}`);
			}
			logger.info(
				'Run sqlsync generate to create migrations for these changes'
			);
		}
		
		if (syncResult.conflicts.length > 0) {
			logger.info(
				chalk.red(
					`Found ${syncResult.conflicts.length} potential conflicts:`
				)
			);
			for (const conflict of syncResult.conflicts) {
				logger.info(`  - ${conflict.file}`);
				logger.info(`    Conflicting migrations: ${conflict.migrations.join(', ')}`);
				logger.info(`    Description: ${conflict.description}`);
			}
			logger.info(
				'Run sqlsync resolve to interactively resolve these conflicts'
			);
		}
		
	} catch (error) {
		logger.error(`Error executing sync command: ${error}`);
		throw error;
	}
}
