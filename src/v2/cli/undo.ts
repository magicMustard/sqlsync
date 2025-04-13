// cli/undo.ts

import chalk from 'chalk';
import inquirer from 'inquirer';
import { Command } from 'commander';
import { CliCommand } from './types';

interface UndoOptions {
	migrationName?: string;
	deleteFiles?: boolean;
}

export class UndoCommand implements CliCommand {
	public register(program: Command): void {
		program
			.command('undo [migration-name]')
			.description('Undo (roll back) to a specific migration (inclusive)')
			.option('--delete-files', 'Delete the migration files after rolling back')
			.action((migrationName: string, options: Record<string, any>) => {
				const undoOpts: UndoOptions = {
					migrationName,
					deleteFiles: !!options.deleteFiles,
				};
				this.handleUndo(undoOpts);
			});
	}

	private handleUndo(opts: UndoOptions): void {
		if (!opts.migrationName) {
			console.log(chalk.red('Error: A migration name is required for "undo".'));
			process.exit(1);
		}

		inquirer
			.prompt([
				{
					type: 'confirm',
					name: 'confirmUndo',
					message: chalk.yellow(
						`Are you sure you want to undo migration "${opts.migrationName}"? (Destructive)`
					),
					default: false,
				},
			])
			.then((answer: any) => {
				if (!answer.confirmUndo) {
					console.log('Undo canceled.');
					return;
				}
				console.log(
					chalk.magenta(`(Stub) Undoing migration: ${opts.migrationName}`)
				);
				if (opts.deleteFiles) {
					console.log(chalk.magenta('(Stub) Deleting migration files.'));
					// Synchronous file deletion if needed
				}
			})
			.catch((err) => {
				console.error(chalk.red('Prompt error:'), err);
				process.exit(1);
			});
	}
}
