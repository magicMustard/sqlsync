import * as fs from 'fs/promises';
import { Parser } from 'node-sql-parser';
import { processSqlFile } from '../../src/core/sql-processor';
import { getHash } from '../../src/utils/crypto';

// Mock the fs/promises module
jest.mock('fs/promises');
// Mock the crypto utility
jest.mock('../../src/utils/crypto');
// Mock the logger
jest.mock('../../src/utils/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('SQL Processor', () => {
	// Explicitly type the mocked functions
	let mockReadFile: jest.Mock;
	let mockGetHash: jest.Mock;

	beforeEach(() => {
		// Reset mocks before each test
		jest.clearAllMocks();
		// Re-assign typed mocks
		mockReadFile = fs.readFile as jest.Mock;
		mockGetHash = getHash as jest.Mock;
	});

	describe('processSqlFile', () => {
		it('should process a simple SQL file correctly', async () => {
			const mockFilePath = '/path/to/test.sql';
			const mockFileContent = 'SELECT * FROM users;';
			const mockChecksum = 'abc123hash';

			// Setup mocks
			mockReadFile.mockResolvedValue(mockFileContent);
			mockGetHash.mockReturnValue(mockChecksum);

			const result = await processSqlFile(mockFilePath);

			// Verify the file was read correctly
			expect(mockReadFile).toHaveBeenCalledWith(mockFilePath, 'utf-8');

			// Verify the result has the expected structure
			expect(result).toMatchObject({
				filePath: mockFilePath,
				fileName: 'test.sql',
				rawFileContent: mockFileContent,
				rawFileChecksum: mockChecksum,
				declarativeTable: false,
				splitStatements: false,
			});

			// Should have at least one statement since we're mocking SQL
			expect(result.statements.length).toBeGreaterThanOrEqual(1);
		});

		it('should process a declarative table file correctly', async () => {
			const mockFilePath = '/path/to/declarative.sql';
			const mockFileContent = `-- sqlsync: declarativeTable=true
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL
);`;
			const mockChecksum = 'table123hash';

			// Setup mocks
			mockReadFile.mockResolvedValue(mockFileContent);
			mockGetHash.mockReturnValue(mockChecksum);

			const result = await processSqlFile(mockFilePath);

			// Verify the file was read correctly
			expect(mockReadFile).toHaveBeenCalledWith(mockFilePath, 'utf-8');

			// Verify the declarative table was detected
			expect(result).toMatchObject({
				filePath: mockFilePath,
				statements: expect.any(Array),
				declarativeTable: true,
				tableDefinition: expect.any(Object),
			});

			// Further verify the table definition
			expect(result.tableDefinition).toBeTruthy();
			if (result.tableDefinition) {
				// Use endsWith to handle potential schema prefixes (e.g. public.users)
				expect(result.tableDefinition.tableName.endsWith('users')).toBe(true);
				expect(result.tableDefinition.columns.length).toBeGreaterThanOrEqual(2);
			}
		});

		it('should handle invalid SQL with an error message', async () => {
			const mockFilePath = '/path/to/invalid.sql';
			const mockFileContent = 'SELECT * FROM;'; // Invalid SQL missing table name
			const mockChecksum = 'error123hash';

			// Setup mocks
			mockReadFile.mockResolvedValue(mockFileContent);
			mockGetHash.mockReturnValue(mockChecksum);

			const result = await processSqlFile(mockFilePath);

			// Should still have basic file info
			expect(result).toMatchObject({
				filePath: mockFilePath,
				fileName: 'invalid.sql',
				rawFileContent: mockFileContent,
				rawFileChecksum: mockChecksum,
			});

			// Should have an error property
			expect(result.error).toBeTruthy();
			// No statements should be returned for invalid SQL
			expect(result.statements.length).toBe(0);
		});

		it('should detect and enforce multiple statements not allowed with CREATE TABLE', async () => {
			const mockFilePath = '/path/to/mixed.sql';
			const mockFileContent = `CREATE TABLE users (id INT PRIMARY KEY);
INSERT INTO users VALUES (1);`;
			const mockChecksum = 'mixed123hash';

			// Setup mocks
			mockReadFile.mockResolvedValue(mockFileContent);
			mockGetHash.mockReturnValue(mockChecksum);

			const result = await processSqlFile(mockFilePath);

			// Should have an error about multiple statements
			expect(result.error).toContain(
				'CREATE TABLE statement must not contain other executable SQL statements'
			);
		});

		it('should handle file reading errors', async () => {
			const mockFilePath = '/path/to/nonexistent.sql';
			const readError = new Error('File not found');

			// Setup mock to throw
			mockReadFile.mockRejectedValue(readError);

			const result = await processSqlFile(mockFilePath);

			// Should have basic file path but empty content
			expect(result.filePath).toBe(mockFilePath);
			expect(result.fileName).toBe('nonexistent.sql');
			expect(result.rawFileContent).toBe('');
			expect(result.error).toBeTruthy();
		});
	});
});
