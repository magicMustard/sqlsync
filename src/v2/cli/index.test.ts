// cli/index.test.ts

/**
 * Unit tests for SqlSyncCli class.
 */

import { Command } from 'commander';
import { SqlSyncCli } from './index';
import { CliCommand, CliCommonOptions } from './types';

// Mock dependencies for testing
describe('SqlSyncCli', () => {
	let cli: SqlSyncCli;

	beforeEach(() => {
		cli = new SqlSyncCli();
	});

	it('should initialize with correct name, description, and version', () => {
		cli.initCli();
		const program = (cli as any).program as Command;
		expect(program.name()).toBe('sqlsync');
		expect(program.description()).toBe('Declarative SQL state management tool');
		expect(program.version()).toBe('1.0.0');
	});

	it('should register all expected commands', () => {
		cli.initCli();
		const program = (cli as any).program as Command;
		const commandNames = program.commands.map((cmd: Command) => cmd.name());
		expect(commandNames).toEqual(
			expect.arrayContaining([
				'generate',
				'sync',
				'status',
				'undo',
				'migrations',
			])
		);
	});
});
