// cli/generate.ts

import chalk from 'chalk';
import { CliCommand } from './types';
import { Command } from 'commander';

interface GenerateOptions {
	migrationName: string;
	markApplied: boolean;
}

export class GenerateCommand implements CliCommand {
	public register(program: Command): void {
		program
			.command('generate <migration-name>')
			.description(
				'Generate a new migration file based on changes in SQL definitions'
			)
			.option(
				'--no-mark-applied',
				'Do not mark the generated migration as locally applied'
			)
			.action((migrationName: string, options: Record<string, any>) => {
				console.log(chalk.green(`Generating migration: ${migrationName}`));

				// const config = this.configLoader.loadConfig(options.config || 'sqlsync.yaml');
				// const state = this.stateManager.getState();

				const generateOpts: GenerateOptions = {
					migrationName,
					markApplied: options.markApplied !== false, // default = true
				};
				this.handleGenerate(generateOpts);
			});
	}

	private handleGenerate(opts: GenerateOptions): void {
		// Stub logic
		console.log(
			chalk.yellow(
				`(Stub) Creating migration file for "${opts.migrationName}"...`
			)
		);
		if (!opts.markApplied) {
			console.log(chalk.yellow('(Stub) Not marking as applied.'));
		}
	}
}
