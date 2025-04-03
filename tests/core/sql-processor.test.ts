import * as fs from 'fs/promises';
import * as path from 'path';
import { processSqlFile } from '../../src/core/sql-processor';
import { getHash } from '../../src/utils/crypto';

// Mock the fs/promises module
jest.mock('fs/promises');
const mockReadFile = fs.readFile as jest.Mock;

// Mock the crypto utils module
jest.mock('../../src/utils/crypto');
const mockGetHash = getHash as jest.Mock;

// Mock the split-statements module
jest.mock('../../src/core/split-statements', () => ({
  splitStatements: jest.fn()
}));

// Import after mocking
import { splitStatements } from '../../src/core/split-statements';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
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
    
    // Setup the default behavior for the splitStatements mock
    (splitStatements as jest.Mock).mockImplementation(async (content, filePath) => {
      return {
        filePath,
        fileName: path.basename(filePath),
        splitStatements: false,
        statements: [content],
        rawFileContent: content,
        rawFileChecksum: 'mock-checksum'
      };
    });
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
        filePath: 'test.sql',
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
        filePath: 'declarative.sql',
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
      // Setup test with content that looks like CREATE TABLE but has invalid syntax/multiple statements
      const mockFilePath = '/path/to/invalid-create.sql';
      // This content will pass isCreateTableStatement, forcing the multi-statement check
      // The check uses splitByStatementBoundaries. 
      // If splitByStatementBoundaries returns > 1 statement OR throws an error during split, 
      // processSqlFile should catch it and report an error.
      // We use a simple multi-statement case here.
      const invalidSqlContent = 'CREATE TABLE test (id int); INVALID SQL;'; 
      const mockChecksum = 'invalid123hash';

      // Mock fs.readFile
      mockReadFile.mockResolvedValue(invalidSqlContent);
      mockGetHash.mockReturnValue(mockChecksum);
      
      // Process the file
      const result = await processSqlFile(mockFilePath);

      // Verify the error is caught and reported by processSqlFile
      // This should be caught by the initial multi-statement check for CREATE TABLE files
      expect(result.error).not.toBeUndefined();
      // The error should mention the multi-statement violation or potentially a syntax error if splitting failed
      expect(result.error).toMatch(/must not contain other executable SQL statements|Invalid SQL syntax/i);

      // No statements should be returned on error
      expect(result.statements.length).toBe(0);
    });

    it('should detect and enforce multiple statements not allowed with CREATE TABLE', async () => {
      const mockFilePath = '/path/to/mixed.sql';
      const mockFileContent = `CREATE TABLE users (id INT PRIMARY KEY);\nINSERT INTO users VALUES (1);`;
      const mockChecksum = 'mixed123hash';

      // Setup mocks - Explicitly set readFile for THIS test to avoid pollution
      mockReadFile.mockResolvedValue(mockFileContent); 
      mockGetHash.mockReturnValue(mockChecksum);

      const result = await processSqlFile(mockFilePath);

      // Should have an error about multiple statements
      expect(result.error).not.toBeUndefined(); // Check if error exists first
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
      expect(result.filePath).toBe('nonexistent.sql');
      expect(result.fileName).toBe('nonexistent.sql');
      expect(result.rawFileContent).toBe('');
      expect(result.error).toBeTruthy();
    });
  });
});
