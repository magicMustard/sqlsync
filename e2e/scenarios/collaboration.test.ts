import * as path from 'path';
import * as fs from 'fs/promises';
import { setupTestEnvironment, setupSqlSyncEnvironment } from '../helpers/setup';
import { createTestDirectory, modifySchema, listMigrations } from '../helpers/file-utils';
import { runCommand, initializeSqlSync } from '../helpers/commands';

describe('Multi-Developer Collaboration', () => {
  let baseDirDev1: string;
  let baseDirDev2: string;
  let tearDown: () => Promise<void>;
  
  beforeAll(async () => {
    // Setup two separate test environments to simulate two developers
    const env1 = await setupTestEnvironment();
    baseDirDev1 = env1.testDir;
    
    const env2 = await setupTestEnvironment();
    baseDirDev2 = env2.testDir;
    
    // Define tear down function to clean up both environments
    tearDown = async () => {
      await env1.tearDown();
      await env2.tearDown();
    };
    
    // Create initial schema for both developers
    for (const baseDir of [baseDirDev1, baseDirDev2]) {
      await createTestDirectory(baseDir, [
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
      
      // Initialize sqlsync in each environment
      await setupSqlSyncEnvironment(baseDir);
      await initializeSqlSync(baseDir);
      
      // Generate initial migration in each environment
      await runCommand(['generate', 'initial_schema'], { cwd: baseDir });
      await runCommand(['mark-applied', 'all'], { cwd: baseDir });
    }
  });
  
  afterAll(async () => {
    await tearDown();
  });
  
  test('Should handle changes to different schema files', async () => {
    // Dev1 adds a column to the users table
    await modifySchema(
      path.join(baseDirDev1, 'schema/tables/users/table.sql'),
      (content) => {
        return content.replace(
          'email TEXT NOT NULL UNIQUE',
          'email TEXT NOT NULL UNIQUE,\n  last_login TIMESTAMP'
        );
      }
    );
    
    // Dev2 adds a new table (completely different file)
    await createTestDirectory(baseDirDev2, [
      {
        path: 'schema/tables/orders/table.sql',
        content: `-- sqlsync: declarativeTable=true
        
        CREATE TABLE orders (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          amount DECIMAL(10,2) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );`
      }
    ]);
    
    // Both devs generate migrations
    console.log('Dev1 generating migration for adding last_login column...');
    const dev1Result = await runCommand(['generate', 'add_last_login'], { cwd: baseDirDev1 });
    console.log('Dev1 migration result:', dev1Result.stdout);
    console.log('Dev1 errors:', dev1Result.stderr);
    
    console.log('Dev2 generating migration for adding orders table...');
    const dev2Result = await runCommand(['generate', 'add_orders'], { cwd: baseDirDev2 });
    console.log('Dev2 migration result:', dev2Result.stdout);
    console.log('Dev2 errors:', dev2Result.stderr);
    
    // Mark migrations as applied
    await runCommand(['mark-applied', 'all'], { cwd: baseDirDev1 });
    await runCommand(['mark-applied', 'all'], { cwd: baseDirDev2 });
    
    // Now simulate Dev2 pulling Dev1's changes - copy Dev1's users table to Dev2
    const dev1UsersContent = await fs.readFile(
      path.join(baseDirDev1, 'schema/tables/users/table.sql'),
      'utf8'
    );
    
    await fs.writeFile(
      path.join(baseDirDev2, 'schema/tables/users/table.sql'),
      dev1UsersContent
    );
    
    // Generate another migration for Dev2 with combined changes
    console.log('Dev2 generating migration with combined changes...');
    const combinedResult = await runCommand(['generate', 'combined_schema'], { cwd: baseDirDev2 });
    console.log('Combined migration result:', combinedResult.stdout);
    console.log('Combined migration errors:', combinedResult.stderr);
    
    // Mark as applied
    await runCommand(['mark-applied', 'all'], { cwd: baseDirDev2 });
    
    // List all migrations in Dev2's environment
    const dev2Migrations = await listMigrations(baseDirDev2);
    console.log('Dev2 migrations after combining changes:', dev2Migrations);
    
    // Verify that migrations were created
    expect(dev2Migrations.length).toBeGreaterThan(0);
  });
  
  test('Should identify changed schema when migrations are shared', async () => {
    // Both devs make a similar change, but with different values
    
    // Dev1 adds a bio column
    await modifySchema(
      path.join(baseDirDev1, 'schema/tables/users/table.sql'),
      (content) => {
        // Find closing paren and insert before it
        return content.replace(
          /\);/,
          ',\n  bio TEXT\n);'
        );
      }
    );
    
    // Generate and apply migration
    await runCommand(['generate', 'add_bio_column'], { cwd: baseDirDev1 });
    await runCommand(['mark-applied', 'all'], { cwd: baseDirDev1 });
    
    // Dev2 also adds a bio column but with a different constraint
    await modifySchema(
      path.join(baseDirDev2, 'schema/tables/users/table.sql'),
      (content) => {
        // Find closing paren and insert before it
        return content.replace(
          /\);/,
          ',\n  bio TEXT NOT NULL DEFAULT \'\'\n);'
        );
      }
    );
    
    // Generate and apply migration
    await runCommand(['generate', 'add_bio_with_default'], { cwd: baseDirDev2 });
    await runCommand(['mark-applied', 'all'], { cwd: baseDirDev2 });
    
    // Now Dev2 pulls Dev1's migrations - run a status to see discrepancies
    const diffResult = await runCommand(['status'], { cwd: baseDirDev2 });
    console.log('Difference result:', diffResult.stdout);
    console.log('Difference errors:', diffResult.stderr);
    
    // There should be some output from the status command
    expect(diffResult.stdout).toBeTruthy();
    
    // Now let's resolve the "conflict" by updating dev2's schema to include both changes
    await modifySchema(
      path.join(baseDirDev2, 'schema/tables/users/table.sql'),
      (content) => {
        // Replace the bio line with the more restrictive version
        return content.replace(
          'bio TEXT',
          'bio TEXT NOT NULL DEFAULT \'\''
        );
      }
    );
    
    // Generate a migration that resolves the conflict
    console.log('Generating conflict resolution migration...');
    const resolutionResult = await runCommand(['generate', 'resolve_bio_conflict'], { cwd: baseDirDev2 });
    console.log('Resolution result:', resolutionResult.stdout);
    console.log('Resolution errors:', resolutionResult.stderr);
  });
});
