import * as path from 'path';
import * as fs from 'fs/promises';
import { setupTestEnvironment, setupSqlSyncEnvironment } from '../helpers/setup';
import { createTestDirectory, modifySchema } from '../helpers/file-utils';
import { runCommand } from '../helpers/commands';

// Helper function to extract migration filename from stdout
function getGeneratedMigrationFilename(stdout: string): string | null {
  const match = stdout.match(/Migration file generated successfully: (.+)/);
  if (match && match[1]) {
    return path.basename(match[1].trim());
  }
  console.error('Could not find migration filename in stdout:', stdout);
  return null;
}

describe('Declarative Table Functionality', () => {
  let testDir: string;
  let tearDown: () => Promise<void>;
  let initialMigrationFilename: string | null = null;
  
  beforeAll(async () => {
    const env = await setupTestEnvironment();
    testDir = env.testDir;
    tearDown = env.tearDown;
    
    // Create test directory with initial schema files
    await createTestDirectory(testDir, [
      {
        path: 'schema/tables/products/table.sql',
        content: `-- sqlsync: declarativeTable=true
        
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          price DECIMAL(10,2) NOT NULL
        );`
      }
    ]);
    
    // Initialize sqlsync in test directory
    await setupSqlSyncEnvironment(testDir);
    
    // Generate initial migration
    const initialResult = await runCommand(['generate', 'initial_products'], { cwd: testDir });
    expect(initialResult.exitCode).toBe(0);
    initialMigrationFilename = getGeneratedMigrationFilename(initialResult.stdout);
    expect(initialMigrationFilename).not.toBeNull();
    console.log(`Initial migration file: ${initialMigrationFilename}`);
  });
  
  afterAll(async () => {
    await tearDown();
  });
  
  test('Should handle complex schema changes in declarative tables', async () => {
    // Modify the table with multiple column changes (add, remove, and modify)
    await modifySchema(
      path.join(testDir, 'schema/tables/products/table.sql'),
      (content) => {
        return `-- sqlsync: declarativeTable=true
        
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL, -- Type changed from TEXT
          -- description removed
          price NUMERIC(12,2) NOT NULL, -- Precision changed
          stock_count INTEGER NOT NULL DEFAULT 0, -- Added
          active BOOLEAN DEFAULT true -- Added
        );`;
      }
    );
    
    // Generate migration for changes
    const result = await runCommand(['generate', 'update_products'], { cwd: testDir });
    expect(result.exitCode).toBe(0);

    // Get the specific migration filename
    const updateMigrationFilename = getGeneratedMigrationFilename(result.stdout);
    expect(updateMigrationFilename).not.toBeNull();
    console.log(`Update migration file: ${updateMigrationFilename}`);
    
    // Read the migration file
    const migrationContent = await fs.readFile(
      path.join(testDir, 'migrations', updateMigrationFilename!),
      'utf8'
    );
    
    // SQLSync currently handles declarative table changes as DROP+CREATE, not as ALTER statements
    
    // Check for DROP TABLE of old version
    expect(migrationContent).toContain('DROP TABLE IF EXISTS public.products');
    
    // Check for CREATE TABLE with new definition
    expect(migrationContent).toContain('CREATE TABLE products');
    expect(migrationContent).toContain('name VARCHAR(100) NOT NULL');
    expect(migrationContent).toContain('price NUMERIC(12,2) NOT NULL');
    expect(migrationContent).toContain('stock_count INTEGER NOT NULL DEFAULT 0');
    expect(migrationContent).toContain('active BOOLEAN DEFAULT true');
    
    // Should NOT contain the description column
    expect(migrationContent).not.toContain('description TEXT');
    
    // Verify the changes were properly applied to the schema file
    const updatedSchema = await fs.readFile(
      path.join(testDir, 'schema/tables/products/table.sql'),
      'utf8'
    );
    expect(updatedSchema).toContain('name VARCHAR(100) NOT NULL');
    expect(updatedSchema).toContain('stock_count INTEGER NOT NULL DEFAULT 0');
    expect(updatedSchema).not.toContain('description TEXT');
  });
  
  test('Should handle adding a new table with declarative flag', async () => {
    // Add a new declarative table
    await createTestDirectory(testDir, [
      {
        path: 'schema/tables/orders/table.sql',
        content: `-- sqlsync: declarativeTable=true
        
        CREATE TABLE orders (
          id SERIAL PRIMARY KEY,
          product_id INTEGER REFERENCES products(id),
          quantity INTEGER NOT NULL,
          total_price NUMERIC(12,2) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );`
      }
    ]);
    
    // Generate migration
    const result = await runCommand(['generate', 'add_orders'], { cwd: testDir });
    expect(result.exitCode).toBe(0);

    // Get the specific migration filename
    const addMigrationFilename = getGeneratedMigrationFilename(result.stdout);
    expect(addMigrationFilename).not.toBeNull();
    console.log(`Add migration file: ${addMigrationFilename}`);
    
    // Read the migration file
    const migrationContent = await fs.readFile(
      path.join(testDir, 'migrations', addMigrationFilename!),
      'utf8'
    );
    
    // Should contain the CREATE TABLE statement for the orders table
    expect(migrationContent).toContain('CREATE TABLE orders');
    expect(migrationContent).toContain('product_id INTEGER REFERENCES products(id)');
    
    // Verify both schema files exist
    const productsFileExists = await fs.stat(path.join(testDir, 'schema/tables/products/table.sql'))
      .then(() => true)
      .catch(() => false);
    
    const ordersFileExists = await fs.stat(path.join(testDir, 'schema/tables/orders/table.sql'))
      .then(() => true)
      .catch(() => false);
    
    expect(productsFileExists).toBe(true);
    expect(ordersFileExists).toBe(true);
  });
  
  test('Should handle removing a declarative table', async () => {
    // Remove the products table file
    await fs.unlink(path.join(testDir, 'schema/tables/products/table.sql'));
    
    // Generate migration
    const result = await runCommand(['generate', 'remove_products'], { cwd: testDir });
    expect(result.exitCode).toBe(0);

    // Get the specific migration filename
    const removeMigrationFilename = getGeneratedMigrationFilename(result.stdout);
    expect(removeMigrationFilename).not.toBeNull();
    console.log(`Remove migration file: ${removeMigrationFilename}`);
    
    // Read the migration file
    const migrationContent = await fs.readFile(
      path.join(testDir, 'migrations', removeMigrationFilename!),
      'utf8'
    );
    
    // Should drop the products table
    expect(migrationContent).toContain('DROP TABLE IF EXISTS public.products');
    
    // Verify products schema file is removed but orders still exists
    const productsFileExists = await fs.stat(path.join(testDir, 'schema/tables/products/table.sql'))
      .then(() => true)
      .catch(() => false);
    
    const ordersFileExists = await fs.stat(path.join(testDir, 'schema/tables/orders/table.sql'))
      .then(() => true)
      .catch(() => false);
    
    expect(productsFileExists).toBe(false);
    expect(ordersFileExists).toBe(true);
  });
});
