// cli/class.ts

import { Command } from 'commander';

import { CliCommand } from './types';

import { GenerateCommand } from './generate';
import { SyncCommand } from './sync';
import { StatusCommand } from './status';
import { UndoCommand } from './undo';
import { MigrationsCommand } from './migrations';

export class SqlSyncCli {
	private program: Command;

	constructor() {
		this.program = new Command();
	}

	/**
	 * Sets up the global CLI options and registers sub-commands.
	 */
	public initCli(): void {
		this.program
			.name('sqlsync')
			.description('Declarative SQL state management tool')
			.version('1.0.0')
			.option(
				'-c, --config <path>',
				'Path to the sqlsync.yaml config file',
				'sqlsync.yaml'
			)
			.option('-d, --debug', 'Enable debug output');

		// Register command classes
		const commands: CliCommand[] = [
			new GenerateCommand(),
			new SyncCommand(),
			new StatusCommand(),
			new UndoCommand(),
			new MigrationsCommand(),
		];

		commands.forEach((cmd) => cmd.register(this.program));
	}

	/**
	 * Parses the command line arguments and returns the parsed options and command.
	 * @returns The parsed CLI options and command.
	 */
	public parseArgs(): any {
		return this.program.parse(process.argv);
	}
}
