#!/usr/bin/env node
// Register module aliases for path resolution
import './module-path';

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

// Core imports
import { loadConfig } from './core/config-loader';
import { traverseDirectories } from './core/directory-traverser';
import { diffStates } from './core/diff-engine';
import { loadState, saveState, loadLocalAppliedMigrations, saveLocalAppliedMigrations } from './core/state-manager';
import { generateMigrationContent } from './core/migration-generator';

// Type imports
import { ProcessedSection } from './types/processed-sql';

// Command imports
import { syncCommand } from './commands/sync';
import { rollbackCommand } from './commands/rollback';
import { generateCommand } from './commands/generate';

// Utility imports
import { configureDebug, setDebugEnabled } from './utils/debug';
import { generateTimestamp } from './utils/datetime-utils';

// Import type guard functions
import { isProcessedSqlFile, isDeclarativeTableState } from './core/migration-generator';

// Create a new command instance
const program = new Command();

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Basic CLI information
program
	.version('1.0.0')
	.name('sqlsync')
	.description('Declarative SQL state management tool')
	.option('-c, --config <path>', 'Path to the sqlsync.yaml config file', 'sqlsync.yaml')
	.option('-d, --debug [level]', 'Enable debug output (levels: basic, verbose)', (val) => {
		// Configure debug mode based on CLI flag
		setDebugEnabled(true, val === 'verbose' ? 'verbose' : 'basic');
		return val || 'basic';
	});

// Common option for config path
const configOption = '-c, --config <path>';
const configDescription = 'Path to the sqlsync.yaml config file';

// Common function to resolve config path
function resolveConfigPath(configPath: string = 'sqlsync.yaml'): string {
  if (!configPath) {
    configPath = 'sqlsync.yaml'; // Default if undefined
  }
  
  // Convert to absolute path if needed
  if (!path.isAbsolute(configPath)) {
    return path.resolve(process.cwd(), configPath);
  }
  return configPath;
}

// Define the 'generate' command
program
	.command('generate')
	.argument('<migration-name>', 'Name of the migration')
	.description(
		'Generate a new migration file based on changes detected in SQL definitions'
	)
	.option(
		'--no-mark-applied', 
		'Do not mark the generated migration as locally applied'
	)
	.option(
		'--force',
		'Force migration generation even when warnings are present'
	)
	.action(async (migrationName, options) => {
		console.log(`Generating migration: ${migrationName}`);
		console.log(`[DEBUG cli.ts] Global program.opts().config: ${program.opts().config}`);
		try {
			// Resolve config path using the helper function
			const configPath = resolveConfigPath(program.opts().config);

			// Prepare options for the command function
			const generateOptions = {
				markApplied: !options.noMarkApplied, // Note the commander option is --no-mark-applied
				force: options.force || false
			};

			// Call the core command function from generate.ts
			await generateCommand(configPath, migrationName, generateOptions);

			console.log('\nGenerate command finished.');
		} catch (error) {
			console.error(`Error during generate command: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

// Define the 'sync' command
program
	.command('sync')
	.description('Detect and merge pending schema changes')
	.option(configOption, configDescription)
	.option('-f, --force', 'Skip confirmation prompt')
	.action(async (options) => {
		try {
			const configPath = resolveConfigPath(options.config);
			await syncCommand(configPath, options);
		} catch (error) {
			console.error(`Error during sync: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

// Define the 'status' command
program
	.command('status')
	.description(
		'Show the status of SQL files and migrations'
	)
	.option('-v, --verbose', 'Show verbose output')
	.action(async (options) => {
		try {
			const configPath = path.resolve(process.cwd(), 'sqlsync.yaml');
			const config = loadConfig(configPath);
			
			// Load state
			const state = loadState(configPath);
			
			// Get current SQL files state
			const currentSections = await traverseDirectories(config, path.dirname(configPath));
			
			// Detect changes using diff engine
			const differences = diffStates(state, currentSections);
			const pendingChanges = differences.fileChanges
				.filter(change => change.type !== 'unmodified')
				.map(change => change.filePath);
			
			console.log(chalk.bold('SQLSync Status:'));
			console.log(`Total tracked files: ${Object.keys(state.currentFileChecksums).length}`);
			console.log(`Total migrations: ${state.migrationHistory.length}`);
			
			if (pendingChanges.length > 0) {
				console.log(
					chalk.yellow(`\nPending changes (${pendingChanges.length} files):`)
				);
				pendingChanges.forEach(file => console.log(`  - ${file}`));
				console.log('\nRun "sqlsync generate <name>" to create a migration.');
			} else {
				console.log(chalk.green('\nAll changes are tracked in migrations.'));
			}
			
			// Show production status if configured
			if (state.lastProductionMigration) {
				console.log(
					chalk.blue(`\nProduction state: ${state.lastProductionMigration}`)
				);
			}
			
			if (options.verbose) {
				console.log('\nMigration History:');
				state.migrationHistory.forEach(migrationName => {
					const migration = state.migrations[migrationName];
					console.log(`  - ${migrationName} (${migration.createdAt})`);
					
					// Show statements affected by this migration
					const statementsCount = migration.statements.length;
					if (statementsCount > 0) {
						console.log(`    Statements: ${statementsCount}`);
					}
				});
			}
		} catch (error) {
			console.error(`Error getting status: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

// Define the 'rollback' command
program
	.command('rollback')
	.description(
		'Roll back to a specific migration (inclusive)'
	)
	.argument(
		'[migration-name]',
		'Name of the migration file to roll back to (all newer migrations will also be rolled back)'
	)
	.option(configOption, configDescription)
	.option('-f, --force', 'Skip confirmation prompt')
	.option('-l, --list', 'List migrations available for rollback')
	.option('-m, --mark', 'Mark a migration to protect it from being rolled back')
	.option('-u, --unmark', 'Unmark a previously marked migration')
	.option('--delete-files', 'Delete the migration files after rolling back')
	.action(async (migrationName, options) => {
		// Check if a migration name is required but not provided
		if (!migrationName && !options.list) {
			if (options.mark || options.unmark) {
				console.error(chalk.red('Error: A migration name is required when using --mark or --unmark'));
				process.exit(1);
			} else {
				console.error(chalk.red('Error: A migration name is required for rollback'));
				console.error('Use --list to see available migrations for rollback');
				process.exit(1);
			}
		}
		
		// Skip confirmation for non-destructive operations
		if (!options.list && !options.mark && !options.unmark && !options.force) {
			try {
				// Dynamic import of inquirer to avoid dependency if not needed
				const inquirer = await import('inquirer').catch(() => {
					console.error(chalk.red(
						"Package 'inquirer' is required for interactive prompts."
					));
					console.error(
						"Install it with: npm install --save-dev inquirer"
					);
					console.error(
						"Or use --force to bypass confirmation prompts."
					);
					process.exit(1);
				});
				
				const { shouldContinue } = await inquirer.default.prompt([
					{
						type: 'confirm',
						name: 'shouldContinue',
						message: chalk.yellow.bold('WARNING: Rolling back migrations is potentially destructive!') + 
							'\nAre you sure you want to continue?',
						default: false,
					},
				]);
				
				if (!shouldContinue) {
					console.log('Rollback canceled.');
					process.exit(0);
				}
			} catch (promptError) {
				console.error(`Error during prompt: ${promptError instanceof Error ? promptError.message : String(promptError)}`);
				console.error('Use --force to bypass confirmation prompts.');
				process.exit(1);
			}
		}
		
		try {
			const configPath = resolveConfigPath(options.config);
			await rollbackCommand(configPath, migrationName || '', options);
		} catch (error) {
			console.error(`Error during rollback: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

// Parse the command line arguments
program.parse(process.argv);

// Handle cases where no command is provided
if (!process.argv.slice(2).length) {
	program.outputHelp();
}
