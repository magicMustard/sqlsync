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

/**
 * Helper function to extract the generated migration filename from the stdout of a command
 * 
 * @param stdout The stdout of the command
 * @returns The basename of the generated migration file, or null if not found.
 */
export function getGeneratedMigrationFilename(stdout: string): string | null {
  // Strip ANSI color codes first
  const cleanStdout = stdout.replace(/\u001b\[(?:[0-9]{1,3}(?:;[0-9]{1,3})*)?[m|K]/g, '');

  const lines = cleanStdout.split('\n'); // Split cleaned stdout into individual lines

  for (const line of lines) {
    // Try the primary regex on each line - more specific regex
    const regex = /\[INFO\] Migration created: (\d{14}_[\w-]+?\.sql)/;
    console.log(`[DEBUG_HELPER] Checking line: '${line}'`); // Log the line being checked
    const match = line.match(regex);
    console.log(`[DEBUG_HELPER] Match result: ${JSON.stringify(match)}`); // Log the match result
    if (match && match[1]) {
      return match[1]; // Return the filename as soon as found
    }

    // Fallback for the old format on each line (optional, but kept for robustness)
    const oldMatch = line.match(/Migration file generated successfully: (.+)/);
    if (oldMatch && oldMatch[1]) {
      console.warn('Matched old migration filename format on line:', line);
      return path.basename(oldMatch[1]);
    }
  }

  // If no match was found after checking all lines
  console.error(`Could not find migration filename in stdout: ${stdout}`);
  return null;
}
