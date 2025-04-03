/**
 * Tests for the state manager, which handles loading and saving 
 * migration state and tracking applied migrations
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  loadState,
  saveState,
  loadLocalAppliedMigrations,
  saveLocalAppliedMigrations,
  saveMigrationToState
} from '../../src/core/state-manager';
import { ProcessedSection, ProcessedSqlFile } from '../../src/types/processed-sql';
import { SqlSyncState, MigrationState, SQLSYNC_LOCAL_APPLIED_FILENAME } from '../../src/types/state';

// Mock path utility function to return simple paths
jest.mock('../../src/utils/path-utils', () => {
  return {
    // This returns the basename of the path without directories
    toRelativePath: jest.fn().mockImplementation((configPath, filePath) => {
      return path.basename(filePath);
    }),
    // Preserve the original behavior for absolute paths
    toAbsolutePath: jest.fn().mockImplementation((configPath, filePath) => {
      if (path.isAbsolute(filePath)) {
        return filePath;
      }
      return path.join(path.dirname(configPath), filePath);
    })
  };
});

describe('State Manager', () => {
  // Create a temp test directory
  const tempDir = path.join(__dirname, '..', '..', 'test-temp');
  const configPath = path.join(tempDir, 'sqlsync.yaml');
  const statePath = path.join(tempDir, 'sqlsync-state.json');
  const localAppliedPath = path.join(tempDir, SQLSYNC_LOCAL_APPLIED_FILENAME);
  
  // Create fake ProcessedSection for tests
  function createFakeProcessedSection(fileName: string, sqlContent: string): ProcessedSection {
    return {
      sectionName: 'test-section',
      items: [
        {
          filePath: `test/${fileName}`,
          fileName: fileName,
          statements: [
            {
              checksum: `checksum-${fileName}`,
              normalizedStatement: sqlContent,
              content: sqlContent
            }
          ],
          rawFileContent: sqlContent,
          rawFileChecksum: `file-checksum-${fileName}`
        }
      ]
    };
  }

  // Sample SQL sections for tests
  const sampleSections: ProcessedSection[] = [
    createFakeProcessedSection('table1.sql', 'CREATE TABLE table1 (id INT)'),
    createFakeProcessedSection('table2.sql', 'CREATE TABLE table2 (id INT)')
  ];
  
  // Create sample initial state
  function createSampleState(): SqlSyncState {
    return {
      version: 1,
      lastProductionMigration: null,
      migrationHistory: ['20250101000000_initial.sql'],
      migrations: {
        '20250101000000_initial.sql': {
          statements: [
            {
              filePath: 'table1.sql',
              checksum: 'checksum-table1.sql'
            }
          ],
          declarativeTables: {},
          createdAt: '2025-01-01T00:00:00.000Z'
        }
      },
      currentDeclarativeTables: {},
      currentFileChecksums: {
        'table1.sql': 'checksum-table1.sql'
      }
    };
  }
  
  // Setup and teardown
  beforeAll(() => {
    // Create the temp directories
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });
  
  afterAll(() => {
    // Clean up the temp directories
    if (fs.existsSync(tempDir)) {
      // Helper function to delete directories recursively
      function deleteFolderRecursive(folderPath: string) {
        if (fs.existsSync(folderPath)) {
          fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              // Recursive call for directories
              deleteFolderRecursive(curPath);
            } else {
              // Delete file
              fs.unlinkSync(curPath);
            }
          });
          fs.rmdirSync(folderPath);
        }
      }
      
      deleteFolderRecursive(tempDir);
    }
  });
  
  // Reset between tests
  beforeEach(() => {
    // Clear any existing state files
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    if (fs.existsSync(localAppliedPath)) {
      fs.unlinkSync(localAppliedPath);
    }
  });
  
  describe('loadState', () => {
    it('should return a default state if no state file exists', () => {
      // Ensure the state file doesn't exist
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
      
      // Load state - should create a default one
      const state = loadState(configPath);
      
      // Check that we got a valid default state
      expect(state).toBeDefined();
      expect(state.version).toBe(1);
      expect(state.migrationHistory).toEqual([]);
      expect(state.migrations).toEqual({});
      expect(state.currentFileChecksums).toEqual({});
    });
    
    it('should load an existing state file', () => {
      // Create a sample state file
      const sampleState = createSampleState();
      fs.writeFileSync(statePath, JSON.stringify(sampleState, null, 2));
      
      // Load the state
      const state = loadState(configPath);
      
      // Verify it loaded correctly
      expect(state).toEqual(sampleState);
    });
  });
  
  describe('saveState', () => {
    it('should save state to the state file', () => {
      // Create a state to save
      const state = createSampleState();
      
      // Save the state
      saveState(configPath, state);
      
      // Verify the file was created
      expect(fs.existsSync(statePath)).toBe(true);
      
      // Load it back and verify contents
      const savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(savedState).toEqual(state);
    });
  });
  
  describe('loadLocalAppliedMigrations', () => {
    it('should return an empty array if no local applied file exists', () => {
      // Ensure the file doesn't exist
      if (fs.existsSync(localAppliedPath)) {
        fs.unlinkSync(localAppliedPath);
      }
      
      // Load local applied - should be empty
      const applied = loadLocalAppliedMigrations(configPath);
      
      // Verify it's an empty array
      expect(applied).toEqual([]);
    });
    
    it('should load existing local applied migrations', () => {
      // Create a sample local applied file
      const applied = ['20250101000000_initial.sql'];
      fs.writeFileSync(localAppliedPath, applied.join('\n')); // Write as newline-separated text
      
      // Load the local applied migrations
      const loaded = loadLocalAppliedMigrations(configPath);
      
      // Verify it loaded correctly
      expect(loaded).toEqual(applied);
    });
  });
  
  describe('saveLocalAppliedMigrations', () => {
    it('should save local applied migrations', () => {
      // Create applied migrations to save
      const applied = ['20250101000000_initial.sql', '20250102000000_feature_x.sql'];
      
      // Save them
      saveLocalAppliedMigrations(configPath, applied);
      
      // Verify the file was created
      expect(fs.existsSync(localAppliedPath)).toBe(true);
      
      // Load it back and verify contents - now reads newline separated text
      const fileContent = fs.readFileSync(localAppliedPath, 'utf8');
      const saved = fileContent.split('\n').filter(line => line.trim().length > 0);
      expect(saved).toEqual(applied);
    });
  });
  
  describe('saveMigrationToState', () => {
    it('should add a new migration to the state', () => {
      // Create initial state
      const state = createSampleState();
      
      // Create a migration to add
      const migrationContent = '-- Migration content';
      const migrationName = '20250102000000_feature_x.sql';
      
      // Create a migration state with expected fileChecksum
      const migrationState: MigrationState = {
        statements: [
          {
            filePath: 'table2.sql',
            checksum: 'checksum-table2.sql'
          }
        ],
        declarativeTables: {},
        createdAt: '2025-01-02T00:00:00.000Z',
        fileChecksum: '845c864ed02723ab9053b2751e4d01ecf6739a08935db48bc8cf41572be2e2e4' // Add the expected fileChecksum
      };
      
      // Add migration to state
      saveMigrationToState(configPath, migrationName, migrationContent, migrationState);
      
      // Load the state and verify the migration was added
      const updatedState = loadState(configPath);
      expect(updatedState.migrationHistory).toContain(migrationName);
      expect(updatedState.migrations[migrationName]).toEqual(migrationState);
    });
  });
  
  describe('Migration tracking', () => {
    it('should keep track of migration history', () => {
      // Create initial state with one migration
      const state = createSampleState();
      saveState(configPath, state);
      
      // Add a new migration
      const migrationName = '20250102000000_feature_x.sql';
      const migrationState: MigrationState = {
        statements: [],
        declarativeTables: {},
        createdAt: '2025-01-02T00:00:00.000Z'
      };
      
      // Load state, add migration, save state
      const loadedState = loadState(configPath);
      loadedState.migrationHistory.push(migrationName);
      loadedState.migrations[migrationName] = migrationState;
      saveState(configPath, loadedState);
      
      // Load again and verify
      const finalState = loadState(configPath);
      expect(finalState.migrationHistory).toContain('20250101000000_initial.sql');
      expect(finalState.migrationHistory).toContain(migrationName);
      expect(finalState.migrations[migrationName]).toEqual(migrationState);
    });
  });
});
