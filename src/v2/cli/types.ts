// cli/types.ts

import { Command } from 'commander';

/**
 * Each command class must implement this so the main CLI orchestrator
 * can register them with Commander.
 */
export interface CliCommand {
	/**
	 * Register the command with Commander.
	 */
	register(program: Command): void;
}

/**
 * Shared options for CLI commands (e.g. config path, debug mode).
 */
export interface CliCommonOptions {
	configPath?: string;
	debug?: boolean;
}
