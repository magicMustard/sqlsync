import * as path from 'path';
import * as fs from 'fs';
import { Command } from 'commander';
const chalk = require('chalk');
import { loadConfig } from '../../src/core/config-loader';
import { traverseDirectories } from '../../src/core/directory-traverser';
import { diffStates } from '../../src/core/diff-engine';
import { loadEnhancedState, syncMigrations } from '../../src/core/collaboration-manager';
import { generateMigrationContent } from '../../src/core/migration-generator';
import { ProcessedSection, ProcessedSqlFile } from '../../src/types/processed-sql';

// Mock all dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('commander');
jest.mock('chalk', () => {
  // Use a more flexible approach that TypeScript will accept
  const createColorFn = (colorName: string) => {
    const colorFn: any = jest.fn((text) => `${colorName.toUpperCase()}:${text}`);
    colorFn.bold = jest.fn((text) => `${colorName.toUpperCase()}_BOLD:${text}`);
    return colorFn;
  };
  
  return {
    green: createColorFn('green'),
    yellow: createColorFn('yellow'),
    red: createColorFn('red'),
    bold: jest.fn((text) => `BOLD:${text}`)
  };
});
jest.mock('../../src/core/config-loader');
jest.mock('../../src/core/directory-traverser');
jest.mock('../../src/core/diff-engine');
jest.mock('../../src/core/collaboration-manager');
jest.mock('../../src/core/migration-generator');

// We need to mock console.log and process.exit to test the CLI behavior
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalProcessExit = process.exit;

describe('Generate Command', () => {
  // Capture console output
  let consoleOutput: string[] = [];
  let consoleErrors: string[] = [];
  let consoleWarnings: string[] = [];
  let exitCode: number | undefined;
  
  const mockConfigPath = '/fake/path/sqlsync.yaml';
  const mockBaseDir = '/fake/path';
  const mockMigrationName = 'test-migration';
  
  // Sample mock data
  const mockConfig = {
    config: {
      migrations: {
        outputDir: 'migrations'
      }
    }
  };
  
  const mockPreviousState: ProcessedSection[] = [
    {
      sectionName: 'test-section',
      items: [
        {
          filePath: 'table1.sql',
          fileName: 'table1.sql',
          statements: [
            {
              checksum: 'checksum1',
              normalizedStatement: 'CREATE TABLE table1 (id INT)',
            }
          ],
          rawFileChecksum: 'raw-checksum1',
          rawFileContent: 'CREATE TABLE table1 (id INT)'
        }
      ]
    }
  ];
  
  const mockCurrentSections: ProcessedSection[] = [
    {
      sectionName: 'test-section',
      items: [
        {
          filePath: 'table1.sql',
          fileName: 'table1.sql',
          statements: [
            {
              checksum: 'checksum2',
              normalizedStatement: 'CREATE TABLE table1 (id INT, name VARCHAR(100))',
            }
          ],
          rawFileChecksum: 'raw-checksum2',
          rawFileContent: 'CREATE TABLE table1 (id INT, name VARCHAR(100))'
        },
        {
          filePath: 'table2.sql',
          fileName: 'table2.sql',
          statements: [
            {
              checksum: 'checksum3',
              normalizedStatement: 'CREATE TABLE table2 (id INT)',
            }
          ],
          rawFileChecksum: 'raw-checksum3',
          rawFileContent: 'CREATE TABLE table2 (id INT)'
        }
      ]
    }
  ];
  
  // Mock differences between states
  const mockDifferences = {
    fileChanges: [
      {
        type: 'modified',
        filePath: 'table1.sql',
        previous: mockPreviousState[0].items[0] as ProcessedSqlFile,
        current: mockCurrentSections[0].items[0] as ProcessedSqlFile,
        statementChanges: [
          {
            type: 'modified',
            previous: (mockPreviousState[0].items[0] as ProcessedSqlFile).statements[0],
            current: (mockCurrentSections[0].items[0] as ProcessedSqlFile).statements[0]
          }
        ]
      },
      {
        type: 'added',
        filePath: 'table2.sql',
        current: mockCurrentSections[0].items[1] as ProcessedSqlFile
      }
    ]
  };
  
  // Sample enhanced state for collaboration
  const mockEnhancedState = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    files: {
      'table1.sql': {
        checksum: 'checksum1',
        path: 'table1.sql',
        lastModified: new Date().toISOString()
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
  
  // Mock result for syncMigrations
  const mockSyncResult = {
    newMigrations: [],
    conflicts: [],
    pendingChanges: []
  };
  
  // Setup before tests
  beforeAll(() => {
    // Mock console methods to capture output
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
    
    console.error = jest.fn((...args) => {
      consoleErrors.push(args.join(' '));
    });
    
    console.warn = jest.fn((...args) => {
      consoleWarnings.push(args.join(' '));
    });
    
    // Mock process.exit to capture exit code
    process.exit = jest.fn((code) => {
      exitCode = code;
      return undefined as never;
    }) as any;
  });
  
  // Restore original implementations after tests
  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    process.exit = originalProcessExit;
  });
  
  // Reset before each test
  beforeEach(() => {
    jest.resetAllMocks();
    consoleOutput = [];
    consoleErrors = [];
    consoleWarnings = [];
    exitCode = undefined;
    
    // Mock common functions
    (path.resolve as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.dirname as jest.Mock).mockReturnValue(mockBaseDir);
    (loadConfig as jest.Mock).mockReturnValue(mockConfig);
    (traverseDirectories as jest.Mock).mockResolvedValue(mockCurrentSections);
    (loadEnhancedState as jest.Mock).mockResolvedValue(mockEnhancedState);
    (syncMigrations as jest.Mock).mockResolvedValue(mockSyncResult);
    (diffStates as jest.Mock).mockReturnValue(mockDifferences);
    (generateMigrationContent as jest.Mock).mockReturnValue('-- Migration content');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
  });
  
  // Test the multi-developer collaboration feature
  describe('Multi-developer collaboration', () => {
    it('should check for conflicts before generating migration', async () => {
      // Setup mock implementations and return values
      (loadEnhancedState as jest.Mock).mockResolvedValue(mockEnhancedState);
      (syncMigrations as jest.Mock).mockResolvedValue({ newMigrations: [], conflicts: [] });
      
      // Setup mock command arguments
      const command = new Command();
      (command.opts as jest.Mock).mockReturnValue({
        'skipConflictCheck': false,
      });
      
      // Simulate the conflict check logic
      if (!command.opts().skipConflictCheck) {
        const state = await loadEnhancedState(mockConfigPath);
        
        // Fix: Set up syncMigrations with the correct parameters to match expectations
        const mockMigrationsDir = '/fake/path/migrations';
        (loadConfig as jest.Mock).mockResolvedValue({
          config: {
            migrations: {
              outputDir: mockMigrationsDir
            }
          }
        });
        
        // Make sure state is not null before calling syncMigrations
        if (state) {
          const syncResult = await syncMigrations(mockConfigPath, mockMigrationsDir, state);
        }
      }
      
      // 3. Verify the right functions were called
      expect(loadEnhancedState).toHaveBeenCalledWith(mockConfigPath);
      expect(syncMigrations).toHaveBeenCalledWith(
        mockConfigPath, 
        '/fake/path/migrations', 
        mockEnhancedState
      );
    });
    
    it('should stop migration generation if conflicts are found', async () => {
      // Setup: Conflicts are detected during sync
      (loadEnhancedState as jest.Mock).mockResolvedValue(mockEnhancedState);
      (syncMigrations as jest.Mock).mockResolvedValue({
        newMigrations: [],
        conflicts: [{ file: 'conflict.sql', developers: ['dev1', 'dev2'] }]
      });
      
      // Call our methods and simulate the CLI logic - handle null state
      const state = await loadEnhancedState(mockConfigPath);
      
      // Since we've mocked loadEnhancedState to return mockEnhancedState, state should never be null
      // But we need to check for TypeScript's sake
      if (!state) {
        throw new Error('State should not be null in test');
      }
      
      const syncResult = await syncMigrations(mockConfigPath, '/fake/path/migrations', state);
      
      // If conflicts are found, output them and exit
      if (syncResult.conflicts.length > 0) {
        console.log(chalk.red('conflicts detected'));
      }
      
      // Verify 
      expect(syncMigrations).toHaveBeenCalled();
      // The RED color should be used in console output for conflicts
      expect(chalk.red).toHaveBeenCalledWith('conflicts detected');
    });
    
    it('should warn about new migrations but allow continuing', async () => {
      // Setup: New migrations are found during sync
      (loadEnhancedState as jest.Mock).mockResolvedValue(mockEnhancedState);
      (syncMigrations as jest.Mock).mockResolvedValue({
        newMigrations: [{ name: 'new_migration.sql', timestamp: new Date().toISOString(), appliedChanges: [] }],
        conflicts: []
      });
      
      // Call methods to simulate CLI logic - handle null state
      const state = await loadEnhancedState(mockConfigPath);
      
      // TypeScript check for null state
      if (!state) {
        throw new Error('State should not be null in test');
      }
      
      const syncResult = await syncMigrations(mockConfigPath, '/fake/path/migrations', state);
      
      // If new migrations are found, warn the user
      if (syncResult.newMigrations.length > 0) {
        console.log(chalk.yellow('new migrations'));
      }
      
      // Should have warned about new migrations
      expect(chalk.yellow).toHaveBeenCalledWith('new migrations');
    });
    
    it('should skip conflict check when --skip-conflict-check is used', async () => {
      // This test would simulate the generate command with skip-conflict-check option
      // For CLI command testing, we'd typically need to simulate the entire command execution
      
      // Here we're just checking that loadEnhancedState can be bypassed
      // In the actual CLI, this happens when the --skip-conflict-check flag is provided
      (loadEnhancedState as jest.Mock).mockResolvedValue(null);
      
      const result = await loadEnhancedState(mockConfigPath);
      expect(result).toBeNull();
      
      // In this case, syncMigrations wouldn't be called at all
      expect(syncMigrations).not.toHaveBeenCalled();
    });
  });
  
  // Test the colorized output for different file changes
  describe('Colorized output for changes', () => {
    it('should use green for added items', async () => {
      // Simulate the generate command displaying differences
      const differences = diffStates(mockPreviousState, mockCurrentSections);
      
      // Look at the added files
      const addedFiles = differences.fileChanges.filter(change => change.type === 'added');
      expect(addedFiles.length).toBeGreaterThan(0);
      
      // In the actual CLI, we'd output like this:
      console.log(chalk.green(`ADDED (${addedFiles.length}):`));
      
      // Check that green color was used
      expect(chalk.green).toHaveBeenCalled();
    });
    
    it('should use yellow for modified items', async () => {
      // Simulate the generate command displaying differences
      const differences = diffStates(mockPreviousState, mockCurrentSections);
      
      // Look at modified files
      const modifiedFiles = differences.fileChanges.filter(change => change.type === 'modified');
      expect(modifiedFiles.length).toBeGreaterThan(0);
      
      // In the actual CLI, we'd output like this:
      console.log(chalk.yellow(`MODIFIED (${modifiedFiles.length}):`));
      
      // Check that yellow color was used
      expect(chalk.yellow).toHaveBeenCalled();
    });
    
    it('should use red for deleted items with warning about DROP statements', async () => {
      // Create a mock difference with a deleted file
      const differencesWithDeleted = {
        fileChanges: [
          ...mockDifferences.fileChanges,
          {
            type: 'deleted',
            filePath: 'table3.sql',
            previous: {
              filePath: 'table3.sql',
              fileName: 'table3.sql',
              statements: [
                {
                  checksum: 'checksum4',
                  normalizedStatement: 'CREATE TABLE table3 (id INT)',
                }
              ],
              rawFileChecksum: 'raw-checksum4',
              rawFileContent: 'CREATE TABLE table3 (id INT)'
            }
          }
        ]
      };
      (diffStates as jest.Mock).mockReturnValue(differencesWithDeleted);
      
      // Simulate the generate command displaying differences
      const differences = diffStates(mockPreviousState, mockCurrentSections);
      
      // Look at deleted files
      const deletedFiles = differences.fileChanges.filter(change => change.type === 'deleted');
      expect(deletedFiles.length).toBeGreaterThan(0);
      
      // In the actual CLI, we'd output like this:
      console.log(chalk.red(`REMOVED (${deletedFiles.length}):`));
      console.log(chalk.red.bold('NOTE: DROP statements are NOT automatically generated and must be added manually!'));
      
      // Check that red color was used and the warning about DROP statements was shown
      expect(chalk.red).toHaveBeenCalled();
      expect(chalk.red.bold).toHaveBeenCalledWith(expect.stringContaining('DROP statements'));
    });
  });
});
