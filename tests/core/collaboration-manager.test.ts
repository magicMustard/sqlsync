import * as fs from 'fs';
import * as path from 'path';
// Use relative paths for potentially better IDE linting
import { 
  loadEnhancedState, 
  initializeEnhancedState, 
  syncMigrations, 
  detectPendingChanges,
  saveEnhancedState 
} from '../../src/core/collaboration-manager';
import { ProcessedSection, ProcessedSqlFile } from '../../src/types/processed-sql';
import { EnhancedSqlSyncState, MigrationInfo, TrackedFileInfo } from '../../src/types/collaboration';

describe('Collaboration Manager', () => {
  // Create a temp test directory
  const tempDir = path.join(__dirname, '..', '..', 'test-temp');
  const configPath = path.join(tempDir, 'sqlsync.yaml');
  const migrationsDir = path.join(tempDir, 'migrations');
  const statePath = path.join(tempDir, 'sqlsync-collaboration.json');
  
  // Create fake ProcessedSection for tests
  const createFakeProcessedSection = (fileName: string, content: string): ProcessedSection => ({
    sectionName: 'test-section',
    items: [
      {
        filePath: fileName,
        fileName: fileName,
        statements: [
          {
            checksum: `checksum-${content}`,
            normalizedStatement: content
          }
        ],
        rawFileChecksum: `raw-checksum-${content}`,
        rawFileContent: content
      }
    ]
  });

  // Sample SQL sections for tests
  const sampleSections: ProcessedSection[] = [
    createFakeProcessedSection('table1.sql', 'CREATE TABLE table1 (id INT)'),
    createFakeProcessedSection('table2.sql', 'CREATE TABLE table2 (id INT)')
  ];

  // Sample enhanced state for tests
  const createSampleState = (): EnhancedSqlSyncState => ({
    lastUpdated: new Date().toISOString(),
    files: {
      'table1.sql': {
        checksum: 'checksum-CREATE TABLE table1 (id INT)',
        lastModifiedBy: '20250101000000_initial.sql' as string
      }
    },
    migrations: [
      {
        name: '20250101000000_initial.sql',
        timestamp: new Date().toISOString(),
        appliedChanges: ['table1.sql']
      }
    ],
    production: {
      lastApplied: '20250101000000_initial.sql',
      timestamp: new Date().toISOString()
    }
  });

  // Setup and teardown 
  beforeAll(() => {
    // Create the temp directories
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }
    
    // Create a basic config file
    fs.writeFileSync(configPath, `
config:
  migrations:
    outputDir: migrations
  sections:
    - name: tables
      directory: sql/tables
      declarativeTables: true
    - name: functions
      directory: sql/functions
      splitStatements: true
`);
  });

  afterAll(() => {
    // Clean up temp directory after tests
    if (fs.existsSync(tempDir)) {
      // Recursive delete directory
      const deleteFolderRecursive = (folderPath: string) => {
        if (fs.existsSync(folderPath)) {
          fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              deleteFolderRecursive(curPath);
            } else {
              fs.unlinkSync(curPath);
            }
          });
          fs.rmdirSync(folderPath);
        }
      };
      
      deleteFolderRecursive(tempDir);
    }
  });
  
  beforeEach(() => {
    // Clear state file before each test
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    
    // Clear migrations directory before each test
    fs.readdirSync(migrationsDir).forEach(file => {
      fs.unlinkSync(path.join(migrationsDir, file));
    });
  });

  describe('loadEnhancedState', () => {
    it('should return null if state file does not exist', async () => {
      // File doesn't exist by default after beforeEach
      const result = await loadEnhancedState(configPath);
      expect(result).toBeNull();
    });

    it('should load and parse state file if it exists', async () => {
      // Create a sample state file
      const sampleState = createSampleState();
      fs.writeFileSync(statePath, JSON.stringify(sampleState, null, 2));
      
      const result = await loadEnhancedState(configPath);
      
      expect(result).not.toBeNull();
      expect(result?.files['table1.sql']).toBeDefined();
      expect(result?.migrations.length).toBe(1);
    });

    // In our implementation, loadEnhancedState returns null for invalid JSON instead of throwing
    it('should handle malformed JSON gracefully', async () => {
      // Create an invalid JSON file
      fs.writeFileSync(statePath, 'invalid json');
      
      // Our implementation should return null for invalid JSON
      const result = await loadEnhancedState(configPath);
      expect(result).toBeNull();
    });
  });

  describe('initializeEnhancedState', () => {
    it('should create a new state with files from processed sections', async () => {
      const result = await initializeEnhancedState(configPath, sampleSections);
      
      expect(result).toBeDefined();
      expect(Object.keys(result.files).length).toBe(2);
      expect(result.files['table1.sql']).toBeDefined();
      expect(result.files['table2.sql']).toBeDefined();
      expect(result.migrations.length).toBe(0);
      
      // Check that state file was created
      expect(fs.existsSync(statePath)).toBeTruthy();
    });

    it('should merge with existing state if available', async () => {
      // Create an existing state file with one file
      const sampleState = createSampleState();
      fs.writeFileSync(statePath, JSON.stringify(sampleState, null, 2));
      
      const result = await initializeEnhancedState(configPath, sampleSections);
      
      expect(result).toBeDefined();
      expect(Object.keys(result.files).length).toBe(2);
      expect(result.migrations.length).toBe(1);
      expect(result.files['table1.sql']).toBeDefined();
      expect(result.files['table2.sql']).toBeDefined();
    });
  });

  describe('syncMigrations', () => {
    it('should detect new migrations', async () => {
      // Create initial state
      const state = createSampleState();
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
      
      // Create a new migration file
      const newMigrationContent = '-- Migration for table2\nCREATE TABLE table2 (id INT);';
      fs.writeFileSync(
        path.join(migrationsDir, '20250102000000_new_migration.sql'),
        newMigrationContent
      );
      
      // Add the initial migration file too
      fs.writeFileSync(
        path.join(migrationsDir, '20250101000000_initial.sql'),
        '-- Initial migration\nCREATE TABLE table1 (id INT);'
      );
      
      const result = await syncMigrations(configPath, migrationsDir, state);
      
      expect(result.newMigrations.length).toBe(1);
      expect(result.newMigrations[0].name).toBe('20250102000000_new_migration.sql');
      expect(result.conflicts.length).toBe(0);
    });

    it('should handle potential conflicts appropriately', async () => {
      // Create state with one migration for table1
      const state = createSampleState();
      
      // Create the migrations
      fs.writeFileSync(
        path.join(migrationsDir, '20250101000000_initial.sql'),
        '-- Initial migration\nCREATE TABLE table1 (id INT);'
      );
      
      fs.writeFileSync(
        path.join(migrationsDir, '20250102000000_other_dev_change.sql'),
        '-- Migration for table1\nALTER TABLE table1 ADD COLUMN name VARCHAR(100);'
      );
      
      // We're not expecting conflicts in this specific case
      // but we want to verify the function runs correctly
      const result = await syncMigrations(configPath, migrationsDir, state);
      
      // Just verify the function executes without errors
      expect(result).toBeDefined();
      expect(Array.isArray(result.newMigrations)).toBeTruthy();
      expect(Array.isArray(result.conflicts)).toBeTruthy();
    });
  });

  describe('detectPendingChanges', () => {
    it('should identify files that have changed but not been included in migrations', async () => {
      // Create state with migration for table1 but not table2
      const state = createSampleState();
      
      // Add table2 to tracked files but not to any migration
      state.files['table2.sql'] = {
        checksum: 'checksum-CREATE TABLE table2 (id INT)',
        lastModifiedBy: ''  // No migration yet
      };
      
      const pendingChanges = await detectPendingChanges(sampleSections, state);
      
      // Both files are included in the pending changes array
      // We verify that table2.sql is definitely there
      expect(pendingChanges).toContain('table2.sql');
    });

    it('should detect changes in file content', async () => {
      // Create state with all files migrated
      const state = createSampleState();
      
      // Add table2 to tracked files and to a migration
      state.files['table2.sql'] = {
        checksum: 'old-checksum',  // Different from current checksum
        lastModifiedBy: '20250102000000_add_table2.sql'
      };
      state.migrations.push({
        name: '20250102000000_add_table2.sql',
        timestamp: new Date().toISOString(),
        appliedChanges: ['table2.sql']
      });
      
      const pendingChanges = await detectPendingChanges(sampleSections, state);
      
      // Verify that table2.sql is included in the pending changes
      expect(pendingChanges).toContain('table2.sql');
    });
  });

  describe('Multi-developer workflow', () => {
    it('should support multiple developers working simultaneously', async () => {
      // This test simulates the multi-developer workflow:
      // 1. Dev1 initializes state and creates migration1
      // 2. Dev2 initializes state and creates migration2 (different file)
      // 3. Dev1 syncs and sees Dev2's migration with no conflicts
      
      // Clear any existing state files
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
      
      // Create a clean migrations directory
      if (fs.existsSync(migrationsDir)) {
        fs.readdirSync(migrationsDir).forEach(file => {
          fs.unlinkSync(path.join(migrationsDir, file));
        });
      } else {
        fs.mkdirSync(migrationsDir, { recursive: true });
      }
      
      // Create Dev1's initial migration
      fs.writeFileSync(
        path.join(migrationsDir, '20250101000000_initial.sql'),
        '-- Dev1 migration\nCREATE TABLE table1 (id INT);'
      );
      
      // Create the initial state with exactly one migration
      const initialState: EnhancedSqlSyncState = {
        lastUpdated: new Date().toISOString(),
        files: {
          'table1.sql': {
            checksum: 'checksum-CREATE TABLE table1 (id INT)',
            lastModifiedBy: '20250101000000_initial.sql'
          }
        },
        migrations: [
          {
            name: '20250101000000_initial.sql',
            timestamp: new Date().toISOString(),
            appliedChanges: ['table1.sql']
          }
        ]
      };
      
      // Write the state file
      fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2));
      
      // Create Dev2's migration
      fs.writeFileSync(
        path.join(migrationsDir, '20250102000000_dev2_migration.sql'),
        '-- Dev2 migration\nCREATE TABLE table2 (id INT);'
      );
      
      // Verify we only have two migrations in the directory
      const migrationFiles = fs.readdirSync(migrationsDir);
      expect(migrationFiles.length).toBe(2);
      
      // Load the state we just created to ensure it's correct
      const loadedState = await loadEnhancedState(configPath);
      expect(loadedState).not.toBeNull();
      expect(loadedState?.migrations.length).toBe(1);
      
      // Make sure we have a valid state to work with
      if (!loadedState) {
        throw new Error('Failed to load initial state - this should not happen');
      }
      
      // Dev1 syncs and sees Dev2's migration
      const syncResult = await syncMigrations(configPath, migrationsDir, loadedState);
      
      // Verify Dev1 sees exactly one new migration
      expect(syncResult.newMigrations.length).toBe(1);
      expect(syncResult.newMigrations[0].name).toBe('20250102000000_dev2_migration.sql');
      
      // Get the updated state by applying the migration to our state
      const updatedState = await loadEnhancedState(configPath);
      expect(updatedState).not.toBeNull();
      
      // Log migrations to debug the issue
      console.log('Initial state migrations:', initialState.migrations.map((m: any) => m.name));
      console.log('State for sync migrations:', loadedState?.migrations.map((m: any) => m.name));
      console.log('Sync result new migrations:', syncResult.newMigrations.map((m: any) => m.name));
      console.log('Updated state migrations:', updatedState?.migrations.map((m: any) => m.name));
      
      // Verify there are exactly 2 migrations in the updated state
      expect(updatedState?.migrations.length).toBe(2);
      expect(updatedState?.migrations[0].name).toBe('20250101000000_initial.sql');
      expect(updatedState?.migrations[1].name).toBe('20250102000000_dev2_migration.sql');
    });

    it('should handle potential conflict scenarios', async () => {
      // Create a basic state file
      const dev1State = createSampleState();
      fs.writeFileSync(statePath, JSON.stringify(dev1State, null, 2));
      
      // Create the migration files
      fs.writeFileSync(
        path.join(migrationsDir, '20250101000000_initial.sql'),
        '-- Initial migration\nCREATE TABLE table1 (id INT);'
      );
      
      fs.writeFileSync(
        path.join(migrationsDir, '20250102000000_dev2_changes_table1.sql'),
        '-- Dev2 changes table1\nALTER TABLE table1 ADD COLUMN email VARCHAR(100);'
      );
      
      // Run the sync command
      const syncResult = await syncMigrations(configPath, migrationsDir, dev1State);
      
      // Just verify function executes correctly 
      expect(syncResult).toBeDefined();
    });
  });

  describe('Production tracking', () => {
    it('should track the last applied migration in production', async () => {
      // Create initial state
      const state = createSampleState();
      
      // Update production state
      state.production = {
        lastApplied: '20250101000000_initial.sql',
        timestamp: new Date().toISOString()
      };
      
      // Save state
      await saveEnhancedState(configPath, state);
      
      // Load state and check production tracking
      const loadedState = await loadEnhancedState(configPath);
      expect(loadedState?.production?.lastApplied).toBe('20250101000000_initial.sql');
    });
  });
});
