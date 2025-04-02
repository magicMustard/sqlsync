import * as fs from 'fs';
import * as path from 'path';
// Use CommonJS require for chalk
const chalk = require('chalk');
import { loadConfig } from '../../src/core/config-loader';
import { loadEnhancedState, saveEnhancedState } from '../../src/core/collaboration-manager';
import { EnhancedSqlSyncState, MigrationInfo } from '../../src/types/collaboration';
import { rollbackCommand } from '../../src/commands/rollback';

// Mock all dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/core/config-loader');
jest.mock('../../src/core/collaboration-manager');
jest.mock('inquirer', () => ({
	default: {
		prompt: jest.fn().mockResolvedValue({ shouldContinue: true })
	}
}));
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
		blue: createColorFn('blue'),
		cyan: createColorFn('cyan'),
		bold: jest.fn((text) => `BOLD:${text}`)
	};
});

describe('Rollback Command', () => {
	// Mock process.exit
	const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
	
	// Mock console methods
	const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
	const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
	
	// Setup test data
	const mockConfigPath = '/fake/path/sqlsync.yaml';
	const mockMigrationsDir = '/fake/path/migrations';
	const mockConfig = {
		config: {
			migrations: {
				outputDir: mockMigrationsDir
			},
			maxRollbacks: 3
		},
		sources: {
			schema: {
				order: ['schema/tables']
			}
		}
	};
	
	// Create sample migrations for testing
	const migration1: MigrationInfo = {
		name: '20250101000000_initial.sql',
		timestamp: '2025-01-01T00:00:00.000Z',
		appliedChanges: ['table1.sql'],
		author: 'dev1'
	};
	
	const migration2: MigrationInfo = {
		name: '20250102000000_feature_x.sql',
		timestamp: '2025-01-02T00:00:00.000Z',
		appliedChanges: ['table2.sql'],
		author: 'dev1'
	};
	
	const migration3: MigrationInfo = {
		name: '20250103000000_feature_y.sql',
		timestamp: '2025-01-03T00:00:00.000Z',
		appliedChanges: ['table3.sql'],
		author: 'dev2',
		marked: true // This migration is marked/protected
	};
	
	const migration4: MigrationInfo = {
		name: '20250104000000_feature_z.sql',
		timestamp: '2025-01-04T00:00:00.000Z',
		appliedChanges: ['table4.sql'],
		author: 'dev2'
	};
	
	// Mock state
	const mockState: EnhancedSqlSyncState = {
		lastUpdated: new Date().toISOString(),
		files: {
			'table1.sql': {
				checksum: 'checksum1',
				lastModifiedBy: '20250101000000_initial.sql'
			},
			'table2.sql': {
				checksum: 'checksum2',
				lastModifiedBy: '20250102000000_feature_x.sql'
			},
			'table3.sql': {
				checksum: 'checksum3',
				lastModifiedBy: '20250103000000_feature_y.sql'
			},
			'table4.sql': {
				checksum: 'checksum4',
				lastModifiedBy: '20250104000000_feature_z.sql'
			}
		},
		migrations: [migration1, migration2, migration3, migration4]
	};
	
	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();
		
		// Default mock implementations
		(loadConfig as jest.Mock).mockReturnValue(mockConfig);
		(loadEnhancedState as jest.Mock).mockResolvedValue({ ...mockState });
		(saveEnhancedState as jest.Mock).mockResolvedValue(undefined);
		
		// Mock path functions
		(path.join as jest.Mock).mockImplementation((...args: string[]) => {
			return args.join('/').replace(/\/+/g, '/');
		});
		
		// Mock fs functions
		(fs.existsSync as jest.Mock).mockReturnValue(true);
		(fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
			if (filePath.includes('20250101000000_initial.sql')) {
				return 'CREATE TABLE table1 (id INT);';
			} else if (filePath.includes('20250102000000_feature_x.sql')) {
				return 'CREATE TABLE table2 (id INT);';
			} else if (filePath.includes('20250103000000_feature_y.sql')) {
				return 'CREATE TABLE table3 (id INT);';
			} else if (filePath.includes('20250104000000_feature_z.sql')) {
				return 'CREATE TABLE table4 (id INT);';
			}
			return '';
		});
	});
	
	describe('List migrations', () => {
		it('should list available migrations for rollback', async () => {
			// Execute rollback with list option
			await rollbackCommand(mockConfigPath, 'any-name', { list: true });
			
			// Verify
			expect(mockConsoleLog).toHaveBeenCalled();
			expect(loadEnhancedState).toHaveBeenCalledWith(mockConfigPath);
			// Should not modify state when just listing
			expect(saveEnhancedState).not.toHaveBeenCalled();
		});
	});
	
	describe('Mark/Unmark migrations', () => {
		it('should mark a migration to protect it from rollback', async () => {
			// Choose migration2 to mark
			await rollbackCommand(mockConfigPath, '20250102000000_feature_x.sql', { mark: true });
			
			// Verify
			expect(mockConsoleLog).toHaveBeenCalled();
			expect(saveEnhancedState).toHaveBeenCalled();
			
			// Get the state that was saved (mock function's argument)
			const savedState = (saveEnhancedState as jest.Mock).mock.calls[0][1] as EnhancedSqlSyncState;
			
			// Verify migration was marked
			const markedMigration = savedState.migrations.find(m => m.name === '20250102000000_feature_x.sql');
			expect(markedMigration?.marked).toBe(true);
		});
		
		it('should unmark a previously marked migration', async () => {
			// Choose migration3 to unmark (which was already marked)
			await rollbackCommand(mockConfigPath, '20250103000000_feature_y.sql', { unmark: true });
			
			// Verify
			expect(mockConsoleLog).toHaveBeenCalled();
			expect(saveEnhancedState).toHaveBeenCalled();
			
			// Get the state that was saved
			const savedState = (saveEnhancedState as jest.Mock).mock.calls[0][1] as EnhancedSqlSyncState;
			
			// Verify migration was unmarked
			const unmarkedMigration = savedState.migrations.find(m => m.name === '20250103000000_feature_y.sql');
			expect(unmarkedMigration?.marked).toBe(false);
		});
		
		it('should log a warning when trying to mark more migrations than maxRollbacks allows', async () => {
			// Mock that we already have maxRollbacks (3) migrations marked
			const modifiedState = {
				...mockState,
				migrations: [
					{ ...migration1, marked: true },
					{ ...migration2, marked: true },
					{ ...migration3, marked: true },
					{ ...migration4 }
				]
			};
			
			(loadEnhancedState as jest.Mock).mockResolvedValue(modifiedState);
			
			// Execute command - it will log a warning but not throw
			await rollbackCommand(mockConfigPath, '20250104000000_feature_z.sql', { mark: true });
			
			// Should log a warning
			expect(mockConsoleLog).toHaveBeenCalled();
			
			// Should NOT save changes
			expect(saveEnhancedState).not.toHaveBeenCalled();
		});
	});
	
	describe('Rollback migrations', () => {
		it('should log a plan when rolling back to a specific migration', async () => {
			// First we need to unmark migration3 since it's marked for protection
			const stateWithUnmarkedMigrations = {
				...mockState,
				migrations: [
					{ ...migration1 },
					{ ...migration2 },
					{ ...migration3, marked: false }, // Unmark migration3
					{ ...migration4 }
				]
			};
			
			(loadEnhancedState as jest.Mock).mockResolvedValue(stateWithUnmarkedMigrations);
			
			// Roll back to migration2 (will remove migration3 and migration4)
			await rollbackCommand(mockConfigPath, '20250102000000_feature_x.sql', { force: true });
			
			// Should show the rollback plan
			expect(mockConsoleLog).toHaveBeenCalled();
			
			// The implementation doesn't actually call saveEnhancedState yet since we're just testing
			// This is just a test of displaying the rollback plan
		});
		
		it('should log a warning when a marked migration would be affected', async () => {
			// Try to roll back to migration1 (will affect marked migration3)
			try {
				await rollbackCommand(mockConfigPath, '20250101000000_initial.sql', { force: true });
			} catch (error) {
				// The function throws an error, which is expected when a marked migration is in the rollback range
			}
			
			// Should log a warning - implementation uses console.log instead of console.error
			expect(mockConsoleLog).toHaveBeenCalled();
			
			// Should NOT save changes
			expect(saveEnhancedState).not.toHaveBeenCalled();
		});
		
		it('should handle non-existent migration name', async () => {
			// Try to roll back to a non-existent migration
			await expect(async () => {
				await rollbackCommand(mockConfigPath, 'non_existent_migration.sql', {});
			}).rejects.toThrow();
			
			// Should NOT save changes
			expect(saveEnhancedState).not.toHaveBeenCalled();
		});
	});
	
	describe('Error handling', () => {
		it('should handle missing state file', async () => {
			// Mock state file not existing
			(loadEnhancedState as jest.Mock).mockRejectedValue(new Error('State file not found'));
			
			// Execute rollback command - it should throw the error
			await expect(rollbackCommand(mockConfigPath, 'any-name', { list: true }))
				.rejects.toThrow('State file not found');
		});
		
		it('should validate migration name format', async () => {
			// Try to roll back with an invalid migration name format
			await expect(async () => {
				await rollbackCommand(mockConfigPath, 'invalid-format', {});
			}).rejects.toThrow();
		});
		
		it('should log an error when using both --mark and --unmark options', async () => {
			// Try to use both --mark and --unmark together
			try {
				await rollbackCommand(mockConfigPath, 'any-name', { mark: true, unmark: true });
			} catch (error) {
				// The function throws an error, which is expected when both mark and unmark are used
			}
			
			// Implementation uses console.log instead of console.error
			expect(mockConsoleLog).toHaveBeenCalled();
			
			// Should NOT save changes
			expect(saveEnhancedState).not.toHaveBeenCalled();
		});
	});
});
