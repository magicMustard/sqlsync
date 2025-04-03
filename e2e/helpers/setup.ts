import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface TestEnv {
  testDir: string;
  tearDown: () => Promise<void>;
}

/**
 * Set up a temporary test environment for running SQLSync tests
 */
export async function setupTestEnvironment(): Promise<TestEnv> {
  const timestamp = Date.now();
  const testDir = path.join(process.cwd(), `e2e-test-temp/test-${timestamp}`);
  
  // Create test directory
  await fs.mkdir(testDir, { recursive: true });
  
  // Create tear down function
  const tearDown = async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to remove test directory ${testDir}:`, error);
    }
  };
  
  return {
    testDir,
    tearDown
  };
}

/**
 * Set up SQLSync configuration in the test environment
 */
export async function setupSqlSyncEnvironment(testDir: string): Promise<void> {
  // Create a YAML configuration file based on the example file structure
  const configContent = `# SQLSync Configuration
config:
  migrations:
    outputDir: migrations
  stateFile: sqlsync-state.json
  defaultStatementSplitting: false

sources:
  schema:
    order:
      - tables
      - functions
    tables:
      order:
        - users
        - products
        - orders
      orderedSubdirectoryFileOrder:
        - table.sql
        - rls.sql
    functions:
      splitStatements: true
`;
  
  await fs.writeFile(path.join(testDir, 'sqlsync.yaml'), configContent);
  
  // Create directories
  await fs.mkdir(path.join(testDir, 'schema'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'schema/tables'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'schema/functions'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'migrations'), { recursive: true });
}
