/**
 * Integration tests for the generate command
 * These tests verify that the entire workflow behaves correctly
 */
import * as fs from 'fs';
import * as path from 'path';
import { generateCommand } from '../../src/commands/generate';
import { syncCommand } from '../../src/commands/sync';
import { loadState, saveState } from '../../src/core/state-manager';
import { generateTimestamp } from '../../src/utils/datetime-utils';

// Extend the globalThis type to include our custom property
declare global {
  var sqlSyncCapturedFilenames: string[];
  namespace NodeJS {
    interface Global {
      sqlSyncCapturedFilenames: string[];
    }
  }
}

// Mock the datetime utils module
jest.mock('../../src/utils/datetime-utils', () => {
  return {
    generateTimestamp: jest.fn().mockReturnValue('20250403040506')
  };
});

// Create a mock for config loader
jest.mock('../../src/core/config-loader', () => {
  return {
    loadConfig: jest.fn().mockImplementation(() => {
      return {
        config: {
          schema: {
            directories: ['schema']
          },
          migrations: {
            outputDir: 'migrations'
          }
        }
      };
    })
  };
});

// Create mocks for file system operations
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  // Initialize the global variable with a unique name to avoid conflicts
  if (!globalThis.sqlSyncCapturedFilenames) {
    globalThis.sqlSyncCapturedFilenames = [];
  }
  
  const writeFileSyncMock = jest.fn((filePath, content, encoding) => {
    const filename = filePath.split('/').pop();
    console.log(`GLOBAL MOCK: Capturing filename: ${filename}`);
    // Always add to our specialized variable
    globalThis.sqlSyncCapturedFilenames.push(filename);
  });
  
  return {
    ...originalFs,
    readFileSync: jest.fn(),
    writeFileSync: writeFileSyncMock,
    mkdirSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(true),
    readdirSync: jest.fn()
  };
});

// Create a mock for directory traverser
jest.mock('../../src/core/directory-traverser', () => {
  return {
    traverseDirectories: jest.fn().mockResolvedValue([])
  };
});

// Create mocks for migration generator
jest.mock('../../src/core/migration-generator', () => {
  return {
    generateMigration: jest.fn().mockReturnValue({ content: 'MIGRATION CONTENT', state: { statements: [] } }),
    generateMigrationContent: jest.fn().mockReturnValue({ 
      content: 'MIGRATION CONTENT', 
      state: { statements: [], declarativeTables: {} } 
    }),
    displayChangesInConsole: jest.fn(),
    isProcessedSqlFile: jest.fn(),
    isDeclarativeTableState: jest.fn()
  };
});

// Create a mock for diff-engine
jest.mock('../../src/core/diff-engine', () => {
  return {
    diffStates: jest.fn().mockReturnValue({
      fileChanges: [
        {
          type: 'added',
          filePath: 'schema/tables/test.sql',
          current: { 
            filePath: 'schema/tables/test.sql',
            statements: [{ type: 'create', content: 'CREATE TABLE test();', checksum: '123' }] 
          }
        }
      ]
    })
  };
});

// Mock path functions properly using jest.spyOn
jest.mock('path', () => {
  const originalPath = jest.requireActual('path');
  return {
    ...originalPath,
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn(path => path.split('/').slice(0, -1).join('/')),
    basename: jest.fn(path => path.split('/').pop())
  };
});

// Create mocks for state manager
jest.mock('../../src/core/state-manager', () => ({
  loadState: jest.fn(),
  saveState: jest.fn(),
  saveMigrationToState: jest.fn(),
  loadLocalAppliedMigrations: jest.fn().mockReturnValue([]),
  saveLocalAppliedMigrations: jest.fn()
}));

describe('Generate Command Integration', () => {
  // Setup global handling
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear the specialized collection before each test
    globalThis.sqlSyncCapturedFilenames = [];
  });
  
  // Define a helper to get captured filenames consistently
  function getCapturedFilenames() {
    return globalThis.sqlSyncCapturedFilenames || [];
  }
  
  describe('Timestamp generation', () => {
    beforeEach(() => {
      // Reset all mocks but don't redefine writeFileSync to avoid overriding the global mock
      jest.clearAllMocks();
      
      // Ensure generateTimestamp returns our fixed timestamp
      (generateTimestamp as jest.Mock).mockReturnValue('20250403040506');
      
      // Ensure we start with empty captures for each test
      globalThis.sqlSyncCapturedFilenames = [];
    });
    
    it('should use consistent UTC timestamps for migration filenames', async () => {
      // Create a fixed timestamp for testing
      const mockTimestamp = '20250403040506';
      
      // Mock necessary filesystem checks
      (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('migrations')) {
          return true; // migrations directory exists
        }
        return false;
      });
      
      // Log before execution
      console.log("TEST DEBUG: About to run generateCommand for UTC timestamp test");
      
      // Execute generate command with the correct parameter order
      await generateCommand('/path/to/config.yaml', 'test_migration');
      
      // Log after execution to see what was captured
      console.log(`TEST DEBUG: After execution, capturedFilenames = [${getCapturedFilenames().join(', ')}]`);
      
      // Verify the filename uses the expected UTC timestamp
      expect(getCapturedFilenames().length).toBeGreaterThan(0);
      expect(getCapturedFilenames()[0]).toBe(`${mockTimestamp}_test_migration.sql`);
      
      // Verify that writeFileSync was called with the correct arguments
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(`${mockTimestamp}_test_migration.sql`),
        expect.any(String)
      );
    });
    
    it('should sanitize migration names consistently', async () => {
      // Reset for this test
      globalThis.sqlSyncCapturedFilenames = [];
      
      // Mock timestamp generation
      (generateTimestamp as jest.Mock).mockReturnValue('20250403040506');
      
      // Setup for multiple migrations with different formats
      const migrationNames = [
        'test_migration',
        'test-migration',
        'test migration',
        'test_migration!@#$%'
      ];
      
      // Setup mock for the migration generator
      const migrationGenerator = require('../../src/core/migration-generator');
      migrationGenerator.generateMigrationContent = jest.fn().mockReturnValue({
        content: '-- Mock migration content',
        state: { statements: [], declarativeTables: {} }
      });
      
      // This test is checking the sanitization logic in generate.ts:
      // sanitizedName = migrationName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      // So for 'test-migration', it becomes 'test_migration' (not 'test-migration')
      
      // Ensure the migrations dir exists
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      // Setup a valid state to return
      const mockState = {
        migrationHistory: [],
        migrations: {},
        version: 1,
        lastProductionMigration: null,
        currentDeclarativeTables: {},
        currentFileChecksums: {}
      };
      (loadState as jest.Mock).mockReturnValue(mockState);
      
      // Reset captured filenames for this test
      globalThis.sqlSyncCapturedFilenames = [];
      
      // Generate migrations for each name
      const mockConfigPath = '/path/to/config.yaml';
      for (const name of migrationNames) {
        await generateCommand(mockConfigPath, name, { markApplied: false });
      }
      
      // We need to verify that writeFileSync was called
      expect(fs.writeFileSync).toHaveBeenCalledTimes(4);
      
      // Verify all are sanitized consistently
      expect(getCapturedFilenames().length).toBe(4);
      expect(getCapturedFilenames()[0]).toBe('20250403040506_test_migration.sql');
      expect(getCapturedFilenames()[1]).toBe('20250403040506_test_migration.sql'); // Not 'test-migration'
      expect(getCapturedFilenames()[2]).toBe('20250403040506_test_migration.sql');
      expect(getCapturedFilenames()[3]).toBe('20250403040506_test_migration_____.sql');
    });
    
    it('should generate a migration file with timestamp', async () => {
      // Reset for this test
      globalThis.sqlSyncCapturedFilenames = [];
      
      // Mock timestamp generation
      const mockTimestamp = '20250403040506';
      (generateTimestamp as jest.Mock).mockReturnValue(mockTimestamp);
      
      // Set up a valid state to return
      const mockState = {
        migrationHistory: [],
        migrations: {},
        version: 1,
        lastProductionMigration: null,
        currentDeclarativeTables: {},
        currentFileChecksums: {}
      };
      (loadState as jest.Mock).mockReturnValue(mockState);
      
      // Reset captured filenames for this test
      globalThis.sqlSyncCapturedFilenames = [];
      
      // Ensure the migrations dir exists
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      // Execute the generate command
      await generateCommand('/path/to/config.yaml', 'test_migration');
      
      // Verify the filename uses the expected UTC timestamp
      expect(getCapturedFilenames().length).toBeGreaterThan(0);
      expect(getCapturedFilenames()[0]).toBe(`${mockTimestamp}_test_migration.sql`);
      
      // Verify that writeFileSync was called with the correct arguments
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(`${mockTimestamp}_test_migration.sql`),
        expect.any(String)
      );
    });
  });
  
  // Additional integration test for the entire generate workflow
  it('should generate a migration file and update state properly', async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up mocks
    (generateTimestamp as jest.Mock).mockReturnValue('20250403040506');
    
    // Reset captured filenames for this test
    globalThis.sqlSyncCapturedFilenames = [];
    
    // Mock file system operations
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    
    // Mock state manager
    const mockState = {
      migrationHistory: [],
      migrations: {},
      version: 1,
      lastProductionMigration: null,
      currentDeclarativeTables: {},
      currentFileChecksums: {}
    };
    (loadState as jest.Mock).mockReturnValue(mockState);
    
    // Execute the command with the correct parameter order (configPath, migrationName)
    await generateCommand('/path/to/config.yaml', 'integration_test');
    
    // Verify file was created
    expect(getCapturedFilenames().length).toBeGreaterThan(0);
    expect(getCapturedFilenames()[0]).toBe('20250403040506_integration_test.sql');
    
    // Verify writeFileSync was called with the correct arguments
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('20250403040506_integration_test.sql'),
      expect.any(String)
    );
    
    // Verify state was saved
    const { saveMigrationToState: mockSaveMigrationToState } = require('../../src/core/state-manager');
    expect(mockSaveMigrationToState).toHaveBeenCalled();
  });
});
