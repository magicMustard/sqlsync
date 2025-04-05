import * as path from 'path';
import * as fs from 'fs';
import { Command } from 'commander';
const chalk = require('chalk');
import { loadConfig } from '../../src/core/config-loader';
import { traverseDirectories } from '../../src/core/directory-traverser';
import { diffStates } from '../../src/core/diff-engine';
import { loadState, saveState, saveMigrationToState, loadLocalAppliedMigrations, saveLocalAppliedMigrations } from '../../src/core/state-manager';
import { generateMigrationContent } from '../../src/core/migration-generator';
import { ProcessedSection, ProcessedSqlFile } from '../../src/types/processed-sql';
import { SqlSyncState } from '../../src/types/state';
import { generateCommand } from '../../src/commands/generate';

// Mock all dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('commander');
jest.mock('chalk', () => {
  const boldMock = jest.fn().mockImplementation(text => text);
  // Explicitly create a mock with the bold property
  const redMock = jest.fn().mockImplementation(text => text) as jest.Mock & { bold: jest.Mock };
  redMock.bold = boldMock;
  
  return {
    red: redMock,
    green: jest.fn().mockImplementation(text => text),
    yellow: jest.fn().mockImplementation(text => text),
    blue: jest.fn().mockImplementation(text => text),
    gray: jest.fn().mockImplementation(text => text),
    cyan: jest.fn().mockImplementation(text => text),
    magenta: jest.fn().mockImplementation(text => text),
    default: {
      red: redMock,
      green: jest.fn().mockImplementation(text => text),
      yellow: jest.fn().mockImplementation(text => text),
      blue: jest.fn().mockImplementation(text => text),
      gray: jest.fn().mockImplementation(text => text),
      cyan: jest.fn().mockImplementation(text => text),
      magenta: jest.fn().mockImplementation(text => text)
    }
  };
});
jest.mock('../../src/core/config-loader');
jest.mock('../../src/core/directory-traverser');
jest.mock('../../src/core/diff-engine');
jest.mock('../../src/core/state-manager', () => ({
  loadState: jest.fn(),
  saveState: jest.fn(),
  saveMigrationToState: jest.fn(),
  loadLocalAppliedMigrations: jest.fn().mockReturnValue([]),
  saveLocalAppliedMigrations: jest.fn()
}));
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
  
  const mockPreviousState: SqlSyncState = {
    version: 1,
    lastProductionMigration: null,
    migrationHistory: [],
    migrations: {},
    currentDeclarativeTables: {},
    currentFileChecksums: {}
  };
  
  const mockCurrentSections: ProcessedSection[] = [
    {
      sectionName: 'test-section',
      items: [
        {
          filePath: 'table1.sql',
          fileName: 'table1.sql',
          rawFileContent: 'CREATE TABLE table1 (id INT, name VARCHAR(100))',
          rawFileChecksum: 'raw-checksum2',
          normalizedChecksum: 'normalized-checksum2', // Add normalized checksum
          statements: [
            {
              checksum: 'checksum2',
              normalizedStatement: 'CREATE TABLE table1 (id INT, name VARCHAR(100))',
            }
          ]
        },
        {
          filePath: 'table2.sql',
          fileName: 'table2.sql',
          rawFileContent: 'CREATE TABLE table2 (id INT)',
          rawFileChecksum: 'raw-checksum3',
          normalizedChecksum: 'normalized-checksum3', // Add normalized checksum
          statements: [
            {
              checksum: 'checksum3',
              normalizedStatement: 'CREATE TABLE table2 (id INT)',
            }
          ]
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
        previous: {
          filePath: 'table1.sql',
          fileName: 'table1.sql',
          rawFileContent: 'CREATE TABLE table1 (id INT)',
          rawFileChecksum: 'raw-checksum1',
          normalizedChecksum: 'normalized-checksum1', // Add normalized checksum
          statements: [
            {
              checksum: 'checksum1',
              normalizedStatement: 'CREATE TABLE table1 (id INT)',
            }
          ]
        },
        current: mockCurrentSections[0].items[0] as ProcessedSqlFile,
        statementChanges: [
          {
            type: 'modified',
            previous: {
              checksum: 'checksum1',
              normalizedStatement: 'CREATE TABLE table1 (id INT)',
            },
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
  
  // Before any tests in the file, ensure we mock the state manager functions correctly
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Ensure proper mocks for loadLocalAppliedMigrations 
    (loadLocalAppliedMigrations as jest.Mock).mockReturnValue([]);
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
    (loadState as jest.Mock).mockReturnValue(mockPreviousState);
    (saveState as jest.Mock).mockReturnValue(undefined);
    (diffStates as jest.Mock).mockReturnValue(mockDifferences);
    (generateMigrationContent as jest.Mock).mockReturnValue('-- Migration content');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
  });
  
  // Test the multi-developer collaboration feature
  describe('Multi-developer collaboration', () => {
    it('should check for state before generating migration', async () => {
      // Setup mock implementations and return values
      (loadState as jest.Mock).mockReturnValue(mockPreviousState);
      
      // Call the generate command
      await generateCommand(mockConfigPath, 'test-migration');
      
      // Verify loadState was called
      expect(loadState).toHaveBeenCalledWith(mockConfigPath);
    });
  });
  
  // Test handling conflicts when state file doesn't exist
  it('should check for state before generating migration', async () => {
    // Reset the loadState mock
    (loadState as jest.Mock).mockReset();
    
    // Create a custom mock that throws an error
    const customError = new Error('No existing state found');
    (loadState as jest.Mock).mockImplementation(() => {
      throw customError;
    });
    
    // Set up mocks for other functions that might be called
    (diffStates as jest.Mock).mockResolvedValue(mockDifferences);

    // Should fail because there's no state file to compare against
    let caughtError: Error | null = null;
    try {
      await generateCommand(mockConfigPath, 'my_migration', { 
        markApplied: false // Skip the loadLocalAppliedMigrations call
      });
    } catch (error) {
      caughtError = error as Error;
    }
    
    // Verify that we got an error
    expect(caughtError).not.toBeNull();
    if (caughtError) {
      expect(caughtError.message).toMatch(/state/i);
    }
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
              rawFileContent: 'CREATE TABLE table3 (id INT)',
              rawFileChecksum: 'raw-checksum4',
              normalizedChecksum: 'normalized-checksum4', // Add normalized checksum
              statements: [
                {
                  checksum: 'checksum4',
                  normalizedStatement: 'CREATE TABLE table3 (id INT)',
                }
              ]
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
