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
	.option(configOption, configDescription)
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

		// --- 1. Load Configuration ---
		const configPath = resolveConfigPath(options.config || 'sqlsync.yaml');
		if (!fs.existsSync(configPath)) {
			console.error(`Config file not found: ${configPath}`);
			process.exit(1);
		}

		// Load the current state from the file (or get initial state)
		const sqlSyncState = loadState(configPath);
		// Log based on whether history exists, indicating if it's a truly new state
		if (sqlSyncState.migrationHistory.length > 0) {
			console.log('SQLSync state loaded successfully.');
		} else {
			console.log('No previous migration history found. Starting fresh.');
		}

		// --- 3. Process the SQL Files ---
		console.log('\nProcessing SQL files...');
		const currentSections = await traverseDirectories(loadConfig(configPath), path.dirname(configPath));
		if (currentSections) {
			console.log('SQL files processed successfully.');
		}

		// --- Extract Current File Checksums (Needed for State Update) ---
		const currentFileChecksumsMap: { [filePath: string]: string } = {};
		currentSections.forEach((section) => {
			section.items.forEach((item) => {
				if ('files' in item) {
					// ProcessedDirectory
					item.files.forEach((file) => {
						currentFileChecksumsMap[file.filePath] = file.rawFileChecksum;
					});
				} else {
					// ProcessedSqlFile directly under section
					currentFileChecksumsMap[item.filePath] = item.rawFileChecksum;
				}
			});
		});

		// --- 4. Calculate Differences ---
		console.log('\nCalculating differences...');
		// Pass the whole state object; diffStates internal logic will need update
		const difference = diffStates(sqlSyncState, currentSections);

		// Display differences in a colorized, user-friendly format
		console.log('\n--- Changes Detected ---');
		
		// Group changes by type (added, modified, removed)
		const addedFiles = difference.fileChanges.filter(change => change.type === 'added');
		const modifiedFiles = difference.fileChanges.filter(change => change.type === 'modified');
		const deletedFiles = difference.fileChanges.filter(change => change.type === 'deleted');
		
		// Handle added files/statements (GREEN)
		if (addedFiles.length > 0) {
			console.log(chalk.green(`\n✓ ADDED (${addedFiles.length}):`));
			addedFiles.forEach((change) => {
				console.log(chalk.green(`  + ${change.filePath}`));
				if (change.current && isProcessedSqlFile(change.current)) {
					change.current.statements.forEach((stmt) => {
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
			modifiedFiles.forEach((change) => {
				console.log(chalk.yellow(`  ~ ${change.filePath}`));
				// Display statement-level changes
				// --- Type Guard for change.previous/current.statements ---
				if (
					change.statementChanges &&
					change.previous && 'statements' in change.previous && // Check previous has statements
					change.current && 'statements' in change.current // Check current has statements
				) {
					// We know change.previous/current are ProcessedSqlFile here
					const prevStmtsMap = new Map(change.previous.statements.map((s) => [s.checksum, s]));
					const currStmtsMap = new Map(change.current.statements.map((s) => [s.checksum, s]));
					
					change.statementChanges.forEach((stmtChange) => {
						if (stmtChange.type === 'added') {
							const normalizedStmt = stmtChange.current?.normalizedStatement || '';
							const truncatedStmt = normalizedStmt.length > 60 
								? normalizedStmt.substring(0, 60) + '...' 
								: normalizedStmt;
							console.log(chalk.green(`    + ${stmtChange.current!.checksum.substring(0, 8)}: ${truncatedStmt}`));
						} else if (stmtChange.type === 'deleted') {
							const normalizedStmt = stmtChange.previous?.normalizedStatement || '';
							const truncatedStmt = normalizedStmt.length > 60 
								? normalizedStmt.substring(0, 60) + '...' 
								: normalizedStmt;
							console.log(chalk.red(`    - ${stmtChange.previous!.checksum.substring(0, 8)}: ${truncatedStmt}`));
						} else if (stmtChange.type === 'modified') {
							const normalizedStmt = stmtChange.current?.normalizedStatement || '';
							const truncatedStmt = normalizedStmt.length > 60 
								? normalizedStmt.substring(0, 60) + '...' 
								: normalizedStmt;
							console.log(chalk.yellow(`    ~ ${stmtChange.current!.checksum.substring(0, 8)}: ${truncatedStmt}`));
						}
					});
				}
			});
		}
		
		// Handle removed files/statements (RED)
		if (deletedFiles.length > 0) {
			console.log(chalk.red(`\n✗ REMOVED (${deletedFiles.length}):`));
			console.log(chalk.red.bold('  NOTE: DROP statements are NOT automatically generated and must be added manually!'));
			deletedFiles.forEach((change) => {
				console.log(chalk.red(`  - ${change.filePath}`));
				// If it was a declarative table, warn about manual DROP
				// --- Type Guard for change.previous.declarativeTable ---
				if (change.previous && 'declarativeTable' in change.previous) {
					if (change.previous.declarativeTable) {
						console.log(
							chalk.yellow.bold(
								`    ⚠ WARNING: Declarative table deleted. Manual DROP required if applied.`
							)
						);
					}
				}
				// Display statements from the deleted file
				// --- Type Guard for change.previous.statements ---
				if (change.previous && 'statements' in change.previous && change.previous.statements.length > 0) {
					change.previous.statements.forEach((stmt) => {
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
		// Call the refactored generator function
		const { content, state: migrationState } = generateMigrationContent(
			difference,
			migrationName
		);

		// Check if content is empty (no changes)
		if (!content || !content.trim().endsWith(';')) {
			// Check if it's just comments or empty
			const meaningfulContent = content
				.split('\n')
				.filter(line => !line.trim().startsWith('--') && line.trim() !== '')
				.join('\n');
			
			if (!meaningfulContent) {
				console.log(chalk.yellow('Migration generated, but contains no executable SQL changes.'));
				// Decide if we should still save the file and update state - for now, let's skip
				console.log('Skipping file creation and state update.');
				return; // Exit the action if no meaningful content
			}
		}

		// Extract content for file writing
		const migrationFileContent = content;

		// Generate filename (e.g., YYYYMMDDHHMMSS_migration-name.sql)
		const timestamp = generateTimestamp();
		const sanitizedName = migrationName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
		const filename = `${timestamp}_${sanitizedName}.sql`;

		// Check if migrations directory is specified in config
		const migrationsDir = loadConfig(configPath).config?.migrations?.outputDir;
		if (!migrationsDir) {
			console.error('Error: Migration output directory is not specified in configuration.');
			process.exit(1);
		}
		
		const outputPath = path.resolve(path.dirname(configPath), migrationsDir, filename); // Resolve relative to baseDir

		console.log(`- Generating content for: ${filename}`);
		try {
			// Ensure output directory exists
			const outputDirAbs = path.resolve(path.dirname(configPath), migrationsDir);
			if (!fs.existsSync(outputDirAbs)) {
				fs.mkdirSync(outputDirAbs, { recursive: true });
				console.log(`- Created output directory: ${outputDirAbs}`);
			}

			fs.writeFileSync(outputPath, migrationFileContent); // <-- Use extracted content
			console.log(`- Migration file generated successfully: ${outputPath}`);
		} catch (error) {
			console.error(
				`Error writing migration file ${outputPath}:`,
				error instanceof Error ? error.message : String(error)
			);
			process.exit(1); // Exit if migration file couldn't be written
		}

		// Create file first, then add it to migration state
		try {
			// Generate migration content based on differences
			const generateOptions = {
				markApplied: !options['no-mark-applied']
			};
			
			// Call the command implementation with options
			await generateCommand(configPath, migrationName, generateOptions);

			// Mark the migration as applied if not explicitly disabled
			if (!options['no-mark-applied']) {
				// Use local applied migrations functionality from state-manager 
				// instead of enhanced state for consistency
				const appliedMigrations = loadLocalAppliedMigrations(configPath);
				if (!appliedMigrations.includes(filename)) {
					appliedMigrations.push(filename);
					try {
						saveLocalAppliedMigrations(configPath, appliedMigrations);
						console.log(`Marked migration as applied locally: ${filename}`);
					} catch (error) {
						console.error(`Error marking migration as applied: ${error instanceof Error ? error.message : String(error)}`);
					}
				}
			}

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
