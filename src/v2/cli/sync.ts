import chalk from 'chalk';
import { Command } from 'commander';
import { CliCommand } from './types';

export class SyncCommand implements CliCommand {
	public register(program: Command): void {
		program
			.command('sync')
			.description('Detect and merge pending schema changes')
			.action((options: Record<string, any>) => {
				console.log(chalk.blue('(Stub) Syncing changes...'));
				// const config = this.configLoader.loadConfig(options.config);
				// const state = this.stateManager.getState();
			});
	}
}
