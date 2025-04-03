import { exec } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Interface representing the result of running a command
 */
export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a SQLSync CLI command
 * 
 * @param args Array of command arguments
 * @param options Options for running the command
 * @returns Result of the command execution
 */
export async function runCommand(args: string[], options: { cwd: string }): Promise<CommandResult> {
  // Determine the binary to run based on dev or built mode
  const isDevMode = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
  const binPath = isDevMode
    ? `ts-node ${path.resolve(process.cwd(), 'src/cli.ts')}`
    : `node ${path.resolve(process.cwd(), 'dist/cli.js')}`;
  
  const command = `${binPath} ${args.join(' ')}`;
  
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: options.cwd });
    return {
      exitCode: 0,
      stdout,
      stderr
    };
  } catch (error: any) {
    return {
      exitCode: error.code || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message
    };
  }
}

/**
 * A convenience function to simulate an initialized SQLSync environment
 * This includes running the init command and setting up basic config
 */
export async function initializeSqlSync(testDir: string): Promise<CommandResult> {
  return runCommand(['init'], { cwd: testDir });
}
