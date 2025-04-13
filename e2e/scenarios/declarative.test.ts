import * as path from 'path';
import * as fs from 'fs/promises';
import { setupTestEnvironment, setupSqlSyncEnvironment } from '../helpers/setup';
import { createTestDirectory, modifySchema } from '../helpers/file-utils';
import { runCommand, getGeneratedMigrationFilename } from '../helpers/commands';

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
    
    // Verify that ALTER TABLE statements are being generated for declarative tables
    expect(migrationContent).toContain('NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes');
    
    // Added columns
    expect(migrationContent).toContain('ADDED COLUMNS');
    expect(migrationContent).toContain('ALTER TABLE public.products ADD COLUMN stock_count INTEGER NOT NULL DEFAULT 0');
    
    // Modified columns
    expect(migrationContent).toContain('MODIFIED COLUMNS');
    expect(migrationContent).toContain('ALTER TABLE public.products ALTER COLUMN active TYPE BOOLEAN');
    expect(migrationContent).toContain('ALTER TABLE public.products ALTER COLUMN active SET DEFAULT true');
    expect(migrationContent).toContain('ALTER TABLE public.products ALTER COLUMN name TYPE VARCHAR(100)');
    expect(migrationContent).toContain('ALTER TABLE public.products ALTER COLUMN price TYPE NUMERIC(12,2)');
    
    // Verify the changes were properly applied to the schema file, including the removal of the description column
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
    expect(migrationContent).toContain('quantity INTEGER NOT NULL');
    
    // Verify both schema files exist
    const productSchema = await fs.readFile(
      path.join(testDir, 'schema/tables/products/table.sql'),
      'utf8'
    );
    const orderSchema = await fs.readFile(
      path.join(testDir, 'schema/tables/orders/table.sql'),
      'utf8'
    );
    
    expect(productSchema).toBeTruthy();
    expect(orderSchema).toBeTruthy();
    
    // Now test column removal on the orders table we just created
    // Modify the orders table to remove a column
    await modifySchema(
      path.join(testDir, 'schema/tables/orders/table.sql'),
      (content) => {
        return `-- sqlsync: declarativeTable=true
        
        CREATE TABLE orders (
          id SERIAL PRIMARY KEY,
          product_id INTEGER REFERENCES products(id),
          -- quantity column removed
          total_price NUMERIC(12,2) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );`;
      }
    );
    
    // Generate migration for changes with debug enabled
    const columnRemovalResult = await runCommand(['generate', 'remove_quantity', '--debug', 'verbose'], { cwd: testDir });
    expect(columnRemovalResult.exitCode).toBe(0);

    // Get the specific migration filename
    const columnRemovalFilename = getGeneratedMigrationFilename(columnRemovalResult.stdout);
    expect(columnRemovalFilename).not.toBeNull();
    console.log(`Column removal migration file: ${columnRemovalFilename}`);
    
    // Read the migration file
    const columnRemovalContent = await fs.readFile(
      path.join(testDir, 'migrations', columnRemovalFilename!),
      'utf8'
    );
    
    console.log('Column removal migration content:', columnRemovalContent);
    
    // Verify the migration contains DROPPED COLUMNS section
    expect(columnRemovalContent).toContain('NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes');
    
    // Check for DROP COLUMN statement
    // SQLSync should generate a DROP COLUMN statement for the removed quantity column
    expect(columnRemovalContent).toContain('DROPPED COLUMNS');
    expect(columnRemovalContent).toContain('ALTER TABLE public.orders DROP COLUMN quantity');
    
    // Verify the schema file no longer contains the quantity column
    const updatedSchema = await fs.readFile(
      path.join(testDir, 'schema/tables/orders/table.sql'),
      'utf8'
    );
    expect(updatedSchema).not.toContain('quantity INTEGER NOT NULL');
  });
});
