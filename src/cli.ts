#!/usr/bin/env node
// Register module aliases for path resolution
import './module-path';

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { loadConfig } from './core/config-loader';
import { traverseDirectories } from './core/directory-traverser';
import { loadState, saveState } from './core/state-manager';
import { diffStates, StateDifference, FileChange } from './core/diff-engine'; // Import StateDifference and FileChange types
import { generateMigrationContent } from './core/migration-generator';
import { ProcessedSection, ProcessedStatement } from './types/processed-sql'; // Import ProcessedStatement type
import { SqlSyncConfig } from './types/config'; // Import config type
import chalk from 'chalk'; // Import chalk
import { 
	loadEnhancedState, 
	initializeEnhancedState,
	syncMigrations,
	detectPendingChanges 
} from './core/collaboration-manager';
import { syncCommand } from './commands/sync';
import { rollbackCommand } from './commands/rollback';

// Create a new command instance
const program = new Command();

// Basic CLI information
program
	.name('sqlsync')
	.description('Declarative SQL state management tool')
	.version('1.0.0');

// Common option for config path
const configOption = '-c, --config <path>';
const configDescription = 'Path to the sqlsync.yaml config file';

// Define the 'generate' command
program
	.command('generate')
	.description(
		'Generate a new migration file based on changes detected in SQL definitions'
	)
	.argument(
		'<migration-name>',
		'A descriptive name for the migration (e.g., add-user-table)'
	)
	.option(configOption, configDescription)
	.option(
		'--skip-conflict-check', 
		'Skip collaboration conflict checks (use with caution)'
	)
	.option(
		'--force',
		'Force migration generation even when warnings are present'
	)
	.action(async (migrationName, options) => {
		console.log(`Generating migration: ${migrationName}`);

		// --- 1. Load Configuration ---
		const configPath = options.config || 'sqlsync.yaml';
		const absoluteConfigPath = path.resolve(process.cwd(), configPath);
		console.log(`Loading config from: ${absoluteConfigPath}`);
		let config: SqlSyncConfig;
		try {
			config = loadConfig(absoluteConfigPath);
		} catch (error: any) {
			console.error(`Error loading config: ${error.message}`);
			process.exit(1);
		}
		const baseDir = path.dirname(absoluteConfigPath);
		console.log(`Base directory set to: ${baseDir}`);

		// --- Collaboration Check ---
		if (!options.skipConflictCheck) {
			// Load or initialize enhanced state for collaboration
			const enhancedState = await loadEnhancedState(absoluteConfigPath);
			if (enhancedState) {
				try {
					// Check if any unapplied migrations exist
					const migrationsDir = path.join(
						baseDir, 
						config.config?.migrations?.outputDir || 'migrations'
					);
					
					// Process all SQL files
					const currentSections = await traverseDirectories(config, baseDir);
					
					// Check for conflicts or pending migrations
					const syncResult = await syncMigrations(
						absoluteConfigPath, 
						migrationsDir, 
						enhancedState
					);
					
					// If conflicts found, error and suggest resolution
					if (syncResult.conflicts.length > 0) {
						console.error(chalk.red(
							`Cannot generate migration: ${syncResult.conflicts.length} conflicts detected.`
						));
						console.error(
							'Please run "sqlsync sync" to view details and "sqlsync resolve" to resolve conflicts.'
						);
						process.exit(1);
					}
					
					// If new migrations found, warn user
					if (syncResult.newMigrations.length > 0) {
						console.warn(chalk.yellow(
							`Warning: Found ${syncResult.newMigrations.length} migrations that are not reflected in your state.`
						));
						console.warn(
							'Run "sqlsync sync" to update your state and avoid generating redundant migrations.'
						);
						// Ask for confirmation to continue
						if (!options.force) {
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
										message: 'Do you want to continue generating a migration anyway?',
										default: false,
									},
								]);
								
								if (!shouldContinue) {
									console.log('Migration generation canceled.');
									process.exit(0);
								}
							} catch (promptError) {
								console.error(`Error during prompt: ${promptError}`);
								console.error('Use --force to bypass confirmation prompts.');
								process.exit(1);
							}
						}
					}
				} catch (error: any) {
					console.error(`Error during collaboration check: ${error.message}`);
					console.error(
						'Use --skip-conflict-check to bypass this check (not recommended).'
					);
					process.exit(1);
				}
			}
		}

		// --- 2. Load Previous State ---
		console.log('\nLoading previous state...');
		const previousState = loadState(absoluteConfigPath);
		if (previousState) {
			console.log('Previous state loaded successfully.');
		} else {
			console.log('No previous state found.');
		}

		// --- 3. Process the SQL Files ---
		console.log('\nProcessing SQL files...');
		const currentSections = await traverseDirectories(config, baseDir);
		if (currentSections) {
			console.log('SQL files processed successfully.');
		}

		// --- 4. Calculate Differences ---
		console.log('\nCalculating differences...');
		const difference: StateDifference = diffStates(previousState, currentSections);

		// Display differences in a colorized, user-friendly format
		console.log('\n--- Changes Detected ---');
		
		// Group changes by type (added, modified, removed)
		const addedFiles = difference.fileChanges.filter(change => change.type === 'added');
		const modifiedFiles = difference.fileChanges.filter(change => change.type === 'modified');
		const deletedFiles = difference.fileChanges.filter(change => change.type === 'deleted');
		
		// Handle added files/statements (GREEN)
		if (addedFiles.length > 0) {
			console.log(chalk.green(`\n✓ ADDED (${addedFiles.length}):`));
			addedFiles.forEach((change: FileChange) => {
				console.log(chalk.green(`  + ${change.filePath}`));
				if (change.current?.statements && change.current.statements.length > 0) {
					change.current.statements.forEach((stmt: ProcessedStatement) => {
						const normalizedStmt = stmt.normalizedStatement || '';
						const truncatedStmt = normalizedStmt.length > 60 
							? normalizedStmt.substring(0, 60) + '...' 
							: normalizedStmt;
						console.log(chalk.green(`    + ${stmt.checksum.substring(0, 8)}: ${truncatedStmt}`));
					});
				}
			});
		}
		
		// Handle modified files/statements (YELLOW)
		if (modifiedFiles.length > 0) {
			console.log(chalk.yellow(`\n↻ MODIFIED (${modifiedFiles.length}):`));
			modifiedFiles.forEach((change: FileChange) => {
				console.log(chalk.yellow(`  ~ ${change.filePath}`));
				if (change.statementChanges && change.statementChanges.length > 0) {
					// Show deleted statements
					change.statementChanges
						.filter(sc => sc.type === 'deleted' && sc.previous)
						.forEach(sc => {
							const normalizedStmt = sc.previous?.normalizedStatement || '';
							const truncatedStmt = normalizedStmt.length > 60 
								? normalizedStmt.substring(0, 60) + '...' 
								: normalizedStmt;
							console.log(chalk.red(`    - ${sc.previous!.checksum.substring(0, 8)}: ${truncatedStmt}`));
						});
					
					// Show added statements
					change.statementChanges
						.filter(sc => sc.type === 'added' && sc.current)
						.forEach(sc => {
							const normalizedStmt = sc.current?.normalizedStatement || '';
							const truncatedStmt = normalizedStmt.length > 60 
								? normalizedStmt.substring(0, 60) + '...' 
								: normalizedStmt;
							console.log(chalk.green(`    + ${sc.current!.checksum.substring(0, 8)}: ${truncatedStmt}`));
						});
						
					// Show modified statements
					change.statementChanges
						.filter(sc => sc.type === 'modified' && sc.current)
						.forEach(sc => {
							const normalizedStmt = sc.current?.normalizedStatement || '';
							const truncatedStmt = normalizedStmt.length > 60 
								? normalizedStmt.substring(0, 60) + '...' 
								: normalizedStmt;
							console.log(chalk.yellow(`    ~ ${sc.current!.checksum.substring(0, 8)}: ${truncatedStmt}`));
						});
				}
			});
		}
		
		// Handle removed files/statements (RED)
		if (deletedFiles.length > 0) {
			console.log(chalk.red(`\n✗ REMOVED (${deletedFiles.length}):`));
			console.log(chalk.red.bold('  NOTE: DROP statements are NOT automatically generated and must be added manually!'));
			deletedFiles.forEach((change: FileChange) => {
				console.log(chalk.red(`  - ${change.filePath}`));
				if (change.previous?.statements && change.previous.statements.length > 0) {
					change.previous.statements.forEach((stmt: ProcessedStatement) => {
						const normalizedStmt = stmt.normalizedStatement || '';
						const truncatedStmt = normalizedStmt.length > 60 
							? normalizedStmt.substring(0, 60) + '...' 
							: normalizedStmt;
						console.log(chalk.red(`    - ${stmt.checksum.substring(0, 8)}: ${truncatedStmt}`));
					});
				}
			});
		}
		
		if (difference.fileChanges.length === 0) {
			console.log(chalk.green('No changes detected.'));
			return;
		}
		
		console.log('\n-------------------------');

		// --- 5. Generate Migration ---
		console.log('\nGenerating migration content...');
		const migrationFileContent = generateMigrationContent(
			difference,
			migrationName
		);

		// Generate filename (e.g., YYYYMMDDHHMMSS_migration-name.sql)
		const now = new Date();
		const timestamp = [
			now.getFullYear(),
			(now.getMonth() + 1).toString().padStart(2, '0'),
			now.getDate().toString().padStart(2, '0'),
			now.getHours().toString().padStart(2, '0'),
			now.getMinutes().toString().padStart(2, '0'),
			now.getSeconds().toString().padStart(2, '0'),
		].join('');
		const safeMigrationName = migrationName.replace(/[^a-zA-Z0-9_-]/g, '_'); // Sanitize name
		
		// Check if migrations directory is specified in config
		const migrationsDir = config.config?.migrations?.outputDir;
		if (!migrationsDir) {
			console.error('Error: Migration output directory is not specified in configuration.');
			process.exit(1);
		}
		
		const filename = `${timestamp}_${safeMigrationName}.sql`;
		const outputPath = path.resolve(baseDir, migrationsDir, filename); // Resolve relative to baseDir

		console.log(`- Generating content for: ${filename}`);
		try {
			// Ensure output directory exists
			const outputDirAbs = path.resolve(baseDir, migrationsDir);
			if (!fs.existsSync(outputDirAbs)) {
				fs.mkdirSync(outputDirAbs, { recursive: true });
				console.log(`- Created output directory: ${outputDirAbs}`);
			}

			fs.writeFileSync(outputPath, migrationFileContent);
			console.log(`- Migration file generated successfully: ${outputPath}`);
		} catch (error: any) {
			console.error(
				`Error writing migration file ${outputPath}:`,
				error.message
			);
			process.exit(1); // Exit if migration file couldn't be written
		}

		// --- 6. Save Current State ---
		console.log('\nSaving current state...');
		try {
			saveState(absoluteConfigPath, currentSections);
		} catch (error: any) {
			console.error(`Error saving state: ${error.message}`);
			// Don't necessarily exit, but log the error
		}

		console.log('\nGenerate command finished.');
	});

// Define the 'sync' command
program
	.command('sync')
	.description(
		'Synchronize state with migrations from other developers and identify conflicts'
	)
	.option(configOption, configDescription)
	.option('-v, --verbose', 'Show more detailed output')
	.action(async (options) => {
		const configPath = options.config || 'sqlsync.yaml';
		const absoluteConfigPath = path.resolve(process.cwd(), configPath);
		
		try {
			await syncCommand(absoluteConfigPath, options);
		} catch (error: any) {
			console.error(`Error during sync: ${error.message}`);
			process.exit(1);
		}
	});

// Define the 'resolve' command
program
	.command('resolve')
	.description(
		'Interactively resolve conflicts between local changes and migrations'
	)
	.option(configOption, configDescription)
	.action(async (options) => {
		const configPath = options.config || 'sqlsync.yaml';
		const absoluteConfigPath = path.resolve(process.cwd(), configPath);
		
		console.log(chalk.yellow(
			'Interactive conflict resolution feature is coming soon.'
		));
		console.log(
			'For now, please review SQL files and migrations manually to resolve conflicts.'
		);
		
		// Placeholder for future implementation
		console.log('To implement the resolve command:');
		console.log('1. Load enhanced state');
		console.log('2. Identify conflicts');
		console.log('3. Present each conflict with options');
		console.log('4. Update SQL files and state based on choices');
	});

// Define the 'status' command
program
	.command('status')
	.description(
		'Show the current status of SQL files and migrations'
	)
	.option(configOption, configDescription)
	.option('-v, --verbose', 'Show more detailed output')
	.action(async (options) => {
		const configPath = options.config || 'sqlsync.yaml';
		const absoluteConfigPath = path.resolve(process.cwd(), configPath);
		
		try {
			// Load configuration
			const config = loadConfig(absoluteConfigPath);
			
			// Load enhanced state (if it exists)
			const enhancedState = await loadEnhancedState(absoluteConfigPath);
			
			if (!enhancedState) {
				console.log('No collaboration state found. Run "sqlsync sync" to initialize.');
				return;
			}
			
			// Get current SQL files state
			const currentSections = await traverseDirectories(config, path.dirname(absoluteConfigPath));
			
			// Check for pending changes
			const pendingChanges = await detectPendingChanges(currentSections, enhancedState);
			
			console.log(chalk.bold('SQLSync Status:'));
			console.log(`Total tracked files: ${Object.keys(enhancedState.files).length}`);
			console.log(`Total migrations: ${enhancedState.migrations.length}`);
			
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
			if (enhancedState.production?.lastApplied) {
				console.log(
					chalk.blue(`\nProduction state: ${enhancedState.production.lastApplied}`)
				);
				console.log(`Last updated: ${enhancedState.production.timestamp}`);
			}
			
			if (options.verbose) {
				console.log('\nMigration History:');
				enhancedState.migrations.forEach(migration => {
					console.log(`  - ${migration.name} (${migration.timestamp})`);
					if (migration.appliedChanges.length > 0) {
						console.log('    Affects:');
						migration.appliedChanges.forEach(file => {
							console.log(`      - ${file}`);
						});
					}
				});
			}
		} catch (error: any) {
			console.error(`Error getting status: ${error.message}`);
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
	.action(async (migrationName, options) => {
		const configPath = options.config || 'sqlsync.yaml';
		const absoluteConfigPath = path.resolve(process.cwd(), configPath);
		
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
				console.error(`Error during prompt: ${promptError}`);
				console.error('Use --force to bypass confirmation prompts.');
				process.exit(1);
			}
		}
		
		try {
			await rollbackCommand(absoluteConfigPath, migrationName || '', options);
		} catch (error: any) {
			console.error(`Error during rollback: ${error.message}`);
			process.exit(1);
		}
	});

// Parse the command line arguments
program.parse(process.argv);

// Handle cases where no command is provided
if (!process.argv.slice(2).length) {
	program.outputHelp();
}
