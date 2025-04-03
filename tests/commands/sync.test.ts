import * as fs from 'fs';
import * as path from 'path';
// Use CommonJS require for chalk
const chalk = require('chalk');

// Import the function to test
import { syncCommand } from '../../src/commands/sync';

// Import functions to mock
import { loadConfig } from '../../src/core/config-loader';
import { loadState, saveState, saveMigrationToState } from '../../src/core/state-manager';
import { SqlSyncState } from '../../src/types/state';
import { diffStates } from '../../src/core/diff-engine'; // Although mocked, might be good practice to import
import { traverseDirectories } from '../../src/core/directory-traverser';

// Mock modules
jest.mock('fs');
jest.mock('path');
jest.mock('chalk', () => ({
  red: jest.fn((text) => text),
  green: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  blue: jest.fn((text) => text),
  white: jest.fn((text) => text),
  bold: {
    green: jest.fn((text) => text),
    red: jest.fn((text) => text),
    yellow: jest.fn((text) => text)
  }
}));
jest.mock('../../src/core/config-loader');
jest.mock('../../src/core/state-manager', () => ({
  getHash: jest.fn().mockReturnValue('mocked-hash'), // Keep this simple mock
  loadState: jest.fn(),
  saveState: jest.fn(),
  loadLocalAppliedMigrations: jest.fn().mockReturnValue([]),
  saveLocalAppliedMigrations: jest.fn(),
  saveMigrationToState: jest.fn(), // Mock this again
  createInitialState: jest.fn() // Mock this too, just in case
}));
jest.mock('../../src/core/diff-engine', () => ({
  diffStates: jest.fn().mockReturnValue({
    hasChanges: true,
    addedStatements: [],
    modifiedStatements: [],
    deletedStatements: [],
    changedFileChecksums: {},
    addedFileChecksums: {},
    fileChanges: [] // This was missing before
  })
}));
jest.mock('../../src/core/directory-traverser', () => ({
  traverseDirectories: jest.fn().mockResolvedValue({
    processedSections: [],
    processedStatements: [],
    fileChecksums: {}
  })
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Sync Command', () => {
  // Mock process.exit
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  
  // Setup test data
  const mockConfigPath = '/fake/path/sqlsync.yaml';
  const mockMigrationsDir = '/fake/path/migrations';
  const mockConfig = {
    config: {
      migrations: {
        outputDir: 'migrations'
      },
      sources: {
        schema: {
          order: ['schema/tables']
        }
      }
    }
  };
  
  // Mock state
  const mockState: SqlSyncState = {
    version: 1,
    lastProductionMigration: null,
    migrationHistory: ['20250101000000_initial.sql'],
    migrations: {
      '20250101000000_initial.sql': {
        statements: [],
        declarativeTables: {},
        createdAt: new Date().toISOString()
      }
    },
    currentDeclarativeTables: {},
    currentFileChecksums: {
      'schema/tables/users.sql': 'checksum1'
    }
  };
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // --- Configure Mocks ---
    // Configure loadState mock (needs to be done here now)
    (loadState as jest.Mock).mockReturnValue(JSON.parse(JSON.stringify(mockState))); 
    // Configure loadConfig mock
    (loadConfig as jest.Mock).mockReturnValue(mockConfig);
    
    // Mock path functions
    (path.join as jest.Mock).mockImplementation((...args: string[]) => {
      return args.join('/').replace(/\/+/g, '/');
    });
    
    (path.dirname as jest.Mock).mockImplementation((p: string) => {
      return p.split('/').slice(0, -1).join('/');
    });
    
    // Mock fs functions
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readdirSync as jest.Mock).mockReturnValue(['20250101000000_initial.sql', '20250403123000_new_table.sql']);
    (fs.readFileSync as jest.Mock).mockReturnValue('-- Test migration content');
  });
  
  it('should execute sync successfully when new migrations are found', async () => {
    // Execute sync command
    await expect(syncCommand(mockConfigPath, {})).resolves.not.toThrow();
    
    // Verify
    expect(loadConfig).toHaveBeenCalledWith(mockConfigPath);
    expect(loadState).toHaveBeenCalledWith(mockConfigPath);
    expect(traverseDirectories).toHaveBeenCalled();
    // Verify that sync called saveMigrationToState for the new migration
    expect(saveMigrationToState).toHaveBeenCalled();
  });
  
  it('should handle missing migration directory gracefully', async () => {
    // Setup: Migration directory doesn't exist
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    
    // Execute sync command
    await expect(syncCommand(mockConfigPath, {})).resolves.not.toThrow();
    
    // Verify directory was created
    expect(fs.mkdirSync).toHaveBeenCalled();
  });
  
  it('should handle errors during sync', async () => {
    // Setup: loadState throws an error
    (loadState as jest.Mock).mockImplementation(() => {
      throw new Error('Failed to load state');
    });
    
    // Execute sync command - it should propagate the error
    await expect(syncCommand(mockConfigPath, {})).rejects.toThrow('Failed to load state');
  });
  
  it('should handle missing config gracefully', async () => {
    // Setup: loadConfig returns a config with missing migrations.outputDir
    (loadConfig as jest.Mock).mockReturnValue({
      config: {
        // Missing migrations section
      }
    });
    
    // Execute sync command - it should throw a specific error
    await expect(syncCommand(mockConfigPath, {})).rejects.toThrow('Missing required config');
  });
});
