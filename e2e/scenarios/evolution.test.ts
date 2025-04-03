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
    // Modify schema to add a new column
    await modifySchema(
      path.join(testDir, 'schema/tables/users/table.sql'), 
      (content) => {
        return content.replace(
          'email TEXT NOT NULL UNIQUE',
          'email TEXT NOT NULL UNIQUE,\n  created_at TIMESTAMP DEFAULT NOW()'
        );
      }
    );
    
    // Generate migration for changes
    const result = await runCommand(['generate', 'add_created_at'], { cwd: testDir });
    console.log('Generate result for adding column:', result);
    
    // Verify migration contains the updated table definition
    const migrationDir = path.join(testDir, 'migrations');
    const migrationFiles = await fs.readdir(migrationDir);
    
    // Get files with their full stats to sort by creation time 
    const fileStats = await Promise.all(
      migrationFiles.map(async (file) => {
        const stats = await fs.stat(path.join(migrationDir, file));
        return { 
          name: file, 
          stats,
          path: path.join(migrationDir, file)
        };
      })
    );
    
    // Sort by creation time, newest first
    fileStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
    
    // Get the newest migration file
    const latestMigration = fileStats[0].name;
    console.log('Latest migration file:', latestMigration);
    
    // Verify the migration file
    const migrationContent = await fs.readFile(
      path.join(migrationDir, latestMigration),
      'utf8'
    );
    
    console.log('Migration content excerpt:', migrationContent.substring(0, 200));
    
    // In SQLSync's approach, it recreates the table rather than using ALTER
    // So we check for the CREATE TABLE statement with the new column
    expect(migrationContent).toContain('CREATE TABLE users');
    expect(migrationContent).toContain('created_at TIMESTAMP');
    expect(migrationContent).toContain('DEFAULT NOW()');
  });
  
  test('Should handle changing a column type in a declarative table', async () => {
    // Modify schema to change a column type
    await modifySchema(
      path.join(testDir, 'schema/tables/users/table.sql'), 
      (content) => {
        return content.replace(
          'username TEXT NOT NULL',
          'username VARCHAR(50) NOT NULL'
        );
      }
    );
    
    // Generate migration for changes
    const result = await runCommand(['generate', 'modify_username'], { cwd: testDir });
    console.log('Generate result for modifying column:', result);
    
    // Verify migration contains updated table definition
    const migrationDir = path.join(testDir, 'migrations');
    const migrationFiles = await fs.readdir(migrationDir);
    
    // Get files with their full stats to sort by creation time 
    const fileStats = await Promise.all(
      migrationFiles.map(async (file) => {
        const stats = await fs.stat(path.join(migrationDir, file));
        return { 
          name: file, 
          stats,
          path: path.join(migrationDir, file)
        };
      })
    );
    
    // Sort by creation time, newest first
    fileStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
    
    // Get the newest migration file
    const latestMigration = fileStats[0].name;
    console.log('Latest migration file after column type change:', latestMigration);
    
    const migrationContent = await fs.readFile(
      path.join(migrationDir, latestMigration),
      'utf8'
    );
    
    // Check that the migration has the new column type
    expect(migrationContent).toContain('CREATE TABLE users');
    expect(migrationContent).toContain('username VARCHAR(50) NOT NULL');
  });
  
  test('Should handle removing a column from a declarative table', async () => {
    // Modify schema to remove a column
    await modifySchema(
      path.join(testDir, 'schema/tables/users/table.sql'), 
      (content) => {
        // Create a new schema without the created_at column
        return content.replace(/,\s*created_at TIMESTAMP DEFAULT NOW\(\)/g, '');
      }
    );
    
    // Generate migration for changes
    const result = await runCommand(['generate', 'remove_created_at'], { cwd: testDir });
    console.log('Generate result for removing column:', result);
    
    // Verify migration contains the updated table definition
    const migrationDir = path.join(testDir, 'migrations');
    const migrationFiles = await fs.readdir(migrationDir);
    
    // Get files with their full stats to sort by creation time 
    const fileStats = await Promise.all(
      migrationFiles.map(async (file) => {
        const stats = await fs.stat(path.join(migrationDir, file));
        return { 
          name: file, 
          stats,
          path: path.join(migrationDir, file)
        };
      })
    );
    
    // Sort by creation time, newest first
    fileStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
    
    // Get the newest migration file
    const latestMigration = fileStats[0].name;
    console.log('Latest migration file after column removal:', latestMigration);
    
    const migrationContent = await fs.readFile(
      path.join(migrationDir, latestMigration),
      'utf8'
    );
    
    // Check that the migration no longer has the removed column
    expect(migrationContent).toContain('CREATE TABLE users');
    expect(migrationContent).not.toContain('created_at TIMESTAMP');
  });
});
