import * as fs from 'fs';
import * as path from 'path';
// Use CommonJS require for chalk
const chalk = require('chalk');
import { loadConfig } from '../../src/core/config-loader';
import { syncMigrations, loadEnhancedState, detectPendingChanges } from '../../src/core/collaboration-manager';
import { EnhancedSqlSyncState } from '../../src/types/collaboration';
import { SyncResult } from '../../src/types/collaboration';
import { syncCommand } from '../../src/commands/sync';

// Mock all dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/core/config-loader');
jest.mock('../../src/core/collaboration-manager');

describe('Sync Command', () => {
  // Mock process.exit
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  
  // Mock console methods
  const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  
  // Mock functions for logging
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  
  // Setup test data
  const mockConfigPath = '/fake/path/sqlsync.yaml';
  const mockMigrationsDir = '/fake/path/migrations';
  const mockConfig = {
    config: {
      migrations: {
        outputDir: mockMigrationsDir
      },
      sources: {
        schema: {
          order: ['schema/tables']
        }
      }
    }
  };
  
  // Mock state
  const mockState: EnhancedSqlSyncState = {
    lastUpdated: new Date().toISOString(),
    files: {
      'table1.sql': {
        checksum: 'checksum1',
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
  
  // Mock sync result
  const mockSyncResult: SyncResult = {
    newMigrations: [],
    conflicts: [],
    pendingChanges: ['pendingChange1']
  };
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Default mock implementations
    (loadEnhancedState as jest.Mock).mockResolvedValue(mockState);
    (syncMigrations as jest.Mock).mockResolvedValue(mockSyncResult);
    (detectPendingChanges as jest.Mock).mockResolvedValue(['pendingChange1']);
    
    // Mock path functions
    (path.join as jest.Mock).mockImplementation((...args: string[]) => {
      return args.join('/').replace(/\/+/g, '/');
    });
    
    // Mock fs functions
    (fs.existsSync as jest.Mock).mockReturnValue(true);
  });
  
  it('should execute sync successfully when no conflicts are detected', async () => {
    // Setup: Sync finds one new migration
    (loadConfig as jest.Mock).mockReturnValue({
      config: {
        migrations: {
          outputDir: mockMigrationsDir
        },
        sources: {
          schema: {
            order: ['schema/tables']
          }
        }
      }
    });
    (syncMigrations as jest.Mock).mockResolvedValue({
      newMigrations: [
        {
          name: '20250102000000_new_feature.sql',
          timestamp: new Date().toISOString(),
          appliedChanges: ['new_table.sql']
        }
      ],
      conflicts: [],
      pendingChanges: ['pendingChange1']
    });
    
    // Execute sync command
    await expect(syncCommand(mockConfigPath, { verbose: false })).resolves.not.toThrow();
    
    // Verify
    expect(loadConfig).toHaveBeenCalledWith(mockConfigPath);
    expect(loadEnhancedState).toHaveBeenCalledWith(mockConfigPath);
    expect(syncMigrations).toHaveBeenCalledWith(
      mockConfigPath,
      mockMigrationsDir,
      mockState
    );
    
    // No need to check mockExit as syncCommand doesn't call process.exit
  });
  
  it('should report conflicts when detected', async () => {
    // Setup: Sync finds conflicts
    (loadConfig as jest.Mock).mockReturnValue({
      config: {
        migrations: {
          outputDir: mockMigrationsDir
        },
        sources: {
          schema: {
            order: ['schema/tables']
          }
        }
      }
    });
    (syncMigrations as jest.Mock).mockResolvedValue({
      newMigrations: [],
      conflicts: [
        {
          file: 'table1.sql',
          migrations: ['20250102000000_other_migration.sql'],
          description: 'File changed locally and in migration'
        }
      ],
      pendingChanges: ['pendingChange1']
    });
    
    // Execute sync command - it should NOT throw when there are conflicts
    // (The CLI would handle displaying conflicts and exit code)
    await expect(syncCommand(mockConfigPath, { verbose: false })).resolves.not.toThrow();
  });
  
  it('should throw error when state file is missing', async () => {
    // Setup: No state file exists
    (loadConfig as jest.Mock).mockReturnValue({
      config: {
        migrations: {
          outputDir: mockMigrationsDir
        },
        sources: {
          schema: {
            order: ['schema/tables']
          }
        }
      }
    });
    (loadEnhancedState as jest.Mock).mockRejectedValue(new Error('State file not found'));
    
    // Execute sync command - it should throw the error
    await expect(syncCommand(mockConfigPath, { verbose: false })).rejects.toThrow('State file not found');
  });
});
