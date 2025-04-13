import * as path from 'path';
import * as fs from 'fs/promises';
import { setupTestEnvironment, setupSqlSyncEnvironment } from '../helpers/setup';
import { createTestDirectory, modifySchema } from '../helpers/file-utils';
import { runCommand, initializeSqlSync, getGeneratedMigrationFilename } from '../helpers/commands';

describe('Combined Schema Changes', () => {
  let testDir: string;
  let tearDown: () => Promise<void>;

  beforeAll(async () => {
    const env = await setupTestEnvironment();
    testDir = env.testDir;
    tearDown = env.tearDown;

    // Create test directory with initial schema files
    await createTestDirectory(testDir, [
      {
        path: 'schema/tables/users/table.sql',
        content: `-- sqlsync: declarativeTable=true

        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL
        );`
      },
      {
        path: 'schema/functions/utils.sql',
        content: `CREATE FUNCTION get_username(user_id INTEGER) RETURNS TEXT AS $$
          SELECT username FROM users WHERE id = user_id;
        $$ LANGUAGE SQL;`
      }
    ]);

    // Initialize sqlsync in test directory
    await setupSqlSyncEnvironment(testDir);
    await initializeSqlSync(testDir);

    // Generate initial migration
    const initialResult = await runCommand(['generate', 'initial_schema'], { cwd: testDir });
    expect(initialResult.exitCode).toBe(0);

    // Mark initial migration as applied
    await runCommand(['mark-applied', 'all'], { cwd: testDir });
  });

  afterAll(async () => {
    await tearDown();
  });

  test('Should handle combined declarative and non-declarative changes in one migration', async () => {
    // 1. Modify declarative table (add email column)
    await modifySchema(
      path.join(testDir, 'schema/tables/users/table.sql'),
      (content) => {
        return content.replace(
          'username TEXT NOT NULL',
          'username TEXT NOT NULL,\n          email TEXT UNIQUE'
        );
      }
    );

    // 2. Modify non-declarative file (add comment)
    const updatedUtilContent = `CREATE FUNCTION get_username(user_id INTEGER) RETURNS TEXT AS $$
          -- Retrieve username by ID
          SELECT username FROM users WHERE id = user_id;
        $$ LANGUAGE SQL;`;
    await fs.writeFile(
      path.join(testDir, 'schema/functions/utils.sql'),
      updatedUtilContent
    );

    // 3. Generate ONE migration for both changes
    const result = await runCommand(['generate', 'combined_update'], { cwd: testDir });
    expect(result.exitCode).toBe(0);

    // Get the specific migration filename
    const migrationFilename = getGeneratedMigrationFilename(result.stdout);
    expect(migrationFilename).not.toBeNull();
    console.log(`Combined migration file: ${migrationFilename}`);

    // 4. Read and verify the migration file content
    const migrationContent = await fs.readFile(
      path.join(testDir, 'migrations', migrationFilename!),
      'utf8'
    );
    console.log(`Combined migration content:\n${migrationContent}`);

    // Verify declarative change (ALTER TABLE)
    expect(migrationContent).toContain('Modified File: schema/tables/users/table.sql');
    expect(migrationContent).toContain('NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes');
    expect(migrationContent).toContain('ADDED COLUMNS');
    expect(migrationContent).toContain('ALTER TABLE public.users ADD COLUMN email TEXT UNIQUE');

    // Verify non-declarative change (full file content)
    expect(migrationContent).toContain('Modified File: schema/functions/utils.sql');
    expect(migrationContent).toContain('NOTE: File content has changed. Including complete content:');
    expect(migrationContent).toContain(updatedUtilContent);
  });
});
