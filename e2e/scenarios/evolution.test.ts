import * as path from 'path';
import * as fs from 'fs/promises';
import { setupTestEnvironment, setupSqlSyncEnvironment } from '../helpers/setup';
import { createTestDirectory, modifySchema } from '../helpers/file-utils';
import { runCommand, initializeSqlSync } from '../helpers/commands';

describe('Schema Evolution', () => {
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
          username TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE
        );`
      }
    ]);
    
    // Initialize sqlsync in test directory
    await setupSqlSyncEnvironment(testDir);
    await initializeSqlSync(testDir);
    
    // Generate initial migration
    await runCommand(['generate', 'initial_schema'], { cwd: testDir });
  });
  
  afterAll(async () => {
    await tearDown();
  });
  
  test('Should handle adding a column to a declarative table', async () => {
    // Modify the schema to add a column
    await modifySchema(
      path.join(testDir, 'schema/tables/users/table.sql'),
      (content) => {
        return content.replace(
          'email TEXT NOT NULL UNIQUE',
          'email TEXT NOT NULL UNIQUE,\n          created_at TIMESTAMP DEFAULT NOW()'
        );
      }
    );
    
    // Generate migration
    const addResult = await runCommand(['generate', 'add_created_at'], { cwd: testDir });
    console.log('Generate result for adding column:', addResult);
    
    // Check that migration file was created
    const migrationFiles = await fs.readdir(path.join(testDir, 'migrations'));
    const addMigrationFile = migrationFiles.find(f => f.includes('add_created_at'));
    
    expect(addMigrationFile).toBeTruthy();
    
    // Read migration content
    const migrationContent = await fs.readFile(
      path.join(testDir, 'migrations', addMigrationFile!),
      'utf8'
    );
    
    // For declarative tables, SQLSync uses ALTER TABLE statements to add columns
    expect(migrationContent).toContain('NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes');
    expect(migrationContent).toContain('ADDED COLUMNS');
    expect(migrationContent).toContain('ALTER TABLE public.users ADD COLUMN created_at TIMESTAMP DEFAULT NOW()');
  });
  
  test('Should handle changing a column type in a declarative table', async () => {
    // Modify the schema to change column type
    await modifySchema(
      path.join(testDir, 'schema/tables/users/table.sql'),
      (content) => {
        return content.replace(
          'username TEXT NOT NULL',
          'username VARCHAR(50) NOT NULL'
        );
      }
    );
    
    // Generate migration
    const modifyResult = await runCommand(['generate', 'modify_username'], { cwd: testDir });
    
    // Check that migration file was created
    const migrationFiles = await fs.readdir(path.join(testDir, 'migrations'));
    const modifyMigrationFile = migrationFiles.find(f => f.includes('modify_username'));
    
    expect(modifyMigrationFile).toBeTruthy();
    
    // Read migration content
    const migrationContent = await fs.readFile(
      path.join(testDir, 'migrations', modifyMigrationFile!),
      'utf8'
    );
    
    // Check that the migration has the column type change
    expect(migrationContent).toContain('NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes');
    expect(migrationContent).toContain('MODIFIED COLUMNS');
    expect(migrationContent).toContain('ALTER TABLE public.users ALTER COLUMN username TYPE VARCHAR(50)');
  });
  
  test('Should handle removing a column from a declarative table', async () => {
    // Modify the schema to remove a column
    await modifySchema(
      path.join(testDir, 'schema/tables/users/table.sql'),
      (content) => {
        return content.replace(
          ',\n          created_at TIMESTAMP DEFAULT NOW()',
          ''
        );
      }
    );
    
    // Generate migration
    const removeResult = await runCommand(['generate', 'remove_created_at'], { cwd: testDir });
    
    // Check that migration file was created
    const migrationFiles = await fs.readdir(path.join(testDir, 'migrations'));
    const removeMigrationFile = migrationFiles.find(f => f.includes('remove_created_at'));
    
    expect(removeMigrationFile).toBeTruthy();
    
    // Read migration content
    const migrationContent = await fs.readFile(
      path.join(testDir, 'migrations', removeMigrationFile!),
      'utf8'
    );
    
    // Check that the migration drops the removed column
    expect(migrationContent).toContain('NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes');
    expect(migrationContent).toContain('DROPPED COLUMNS');
    expect(migrationContent).toContain('ALTER TABLE public.users DROP COLUMN created_at');
  });
});
