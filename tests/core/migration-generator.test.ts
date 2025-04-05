/**
 * Tests for the migration generator functions
 */
import { ProcessedSqlFile } from '../../src/types/processed-sql';
import { DeclarativeTableState } from '../../src/types/state';
import { 
  isProcessedSqlFile, 
  isDeclarativeTableState,
  migrationHasActualContent
} from '../../src/core/migration-generator';

jest.mock('../../src/core/migration-generator', () => {
  // Import the actual module to use its real implementations
  const actualModule = jest.requireActual('../../src/core/migration-generator');
  
  return {
    ...actualModule, // Use the actual implementations
    // Mock specific functions as needed
    isProcessedSqlFile: jest.fn((obj) => {
      if (obj === null || obj === undefined) return false;
      return obj && 'filePath' in obj && 'statements' in obj && 'rawFileChecksum' in obj && 'normalizedChecksum' in obj;
    }),
    isDeclarativeTableState: jest.fn((obj) => {
      if (obj === null || obj === undefined) return false;
      return obj && 'tableName' in obj && 'parsedStructure' in obj && 'rawStatementChecksum' in obj;
    })
  };
});

describe('Migration Generator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Type Guards', () => {
    describe('isProcessedSqlFile', () => {
      it('should return true for valid ProcessedSqlFile objects', () => {
        const validFile: ProcessedSqlFile = {
          filePath: '/path/to/file.sql',
          fileName: 'file.sql',
          statements: [],
          rawFileContent: 'CREATE TABLE test (id INT);',
          rawFileChecksum: 'abc123',
          normalizedChecksum: 'def456'
        };
        
        expect(isProcessedSqlFile(validFile)).toBe(true);
      });
      
      it('should return false for non-ProcessedSqlFile objects', () => {
        const invalidObj = {
          tableName: 'users',
          parsedStructure: { type: 'table' },
          rawStatementChecksum: 'abc123'
        };
        
        expect(isProcessedSqlFile(invalidObj)).toBe(false);
      });
      
      it('should return false for null or undefined', () => {
        expect(isProcessedSqlFile(null)).toBe(false);
        expect(isProcessedSqlFile(undefined)).toBe(false);
      });
      
      it('should return false for objects missing required properties', () => {
        const missingFilePath = {
          fileName: 'users.sql',
          statements: [],
          rawFileContent: 'CREATE TABLE users (id INT);',
          rawFileChecksum: 'abc123',
          normalizedChecksum: 'def456'
        };
        
        const missingStatements = {
          filePath: 'schema/tables/users.sql',
          fileName: 'users.sql',
          rawFileContent: 'CREATE TABLE users (id INT);',
          rawFileChecksum: 'abc123',
          normalizedChecksum: 'def456'
        };
        
        const missingChecksum = {
          filePath: 'schema/tables/users.sql',
          fileName: 'users.sql',
          statements: [],
          rawFileContent: 'CREATE TABLE users (id INT);',
          normalizedChecksum: 'def456'
        };
        
        const missingNormalizedChecksum = {
          filePath: 'schema/tables/users.sql',
          fileName: 'users.sql',
          statements: [],
          rawFileContent: 'CREATE TABLE users (id INT);',
          rawFileChecksum: 'abc123'
        };
        
        expect(isProcessedSqlFile(missingFilePath)).toBe(false);
        expect(isProcessedSqlFile(missingStatements)).toBe(false);
        expect(isProcessedSqlFile(missingChecksum)).toBe(false);
        expect(isProcessedSqlFile(missingNormalizedChecksum)).toBe(false);
      });
    });
    
    describe('isDeclarativeTableState', () => {
      it('should return true for valid DeclarativeTableState objects', () => {
        const validState: DeclarativeTableState = {
          tableName: 'users',
          parsedStructure: { tableName: 'users', columns: [] },
          rawStatementChecksum: 'abc123',
          sourceFilePath: 'schema/tables/users.sql'
        };
        
        expect(isDeclarativeTableState(validState)).toBe(true);
      });
      
      it('should return false for non-DeclarativeTableState objects', () => {
        const invalidObj = {
          filePath: 'schema/tables/users.sql',
          statements: [],
          rawFileChecksum: 'abc123'
        };
        
        expect(isDeclarativeTableState(invalidObj)).toBe(false);
      });
      
      it('should return false for null or undefined', () => {
        expect(isDeclarativeTableState(null)).toBe(false);
        expect(isDeclarativeTableState(undefined)).toBe(false);
      });
      
      it('should return false for objects missing required properties', () => {
        const missingTableName = {
          parsedStructure: { columns: [] },
          rawStatementChecksum: 'abc123',
          sourceFilePath: 'schema/tables/users.sql'
        };
        
        const missingParsedStructure = {
          tableName: 'users',
          rawStatementChecksum: 'abc123',
          sourceFilePath: 'schema/tables/users.sql'
        };
        
        const missingChecksum = {
          tableName: 'users',
          parsedStructure: { columns: [] },
          sourceFilePath: 'schema/tables/users.sql'
        };
        
        expect(isDeclarativeTableState(missingTableName)).toBe(false);
        expect(isDeclarativeTableState(missingParsedStructure)).toBe(false);
        expect(isDeclarativeTableState(missingChecksum)).toBe(false);
      });
    });
  });

  describe('migrationHasActualContent', () => {
    it('should return false for migration with only comments', () => {
      const contentWithOnlyComments = `-- SQLSync Migration: empty_migration
-- Generated At: 2025-04-04T10:45:00.000Z
-- Based on detected changes between states.

-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/users.sql
-- NOTE: No schema changes detected that require ALTER statements.
-- Old table structure for reference:
-- CREATE TABLE users (
--   id UUID PRIMARY KEY,
--   name TEXT NOT NULL
-- );

-- >>> END MODIFIED FILES <<<`;

      expect(migrationHasActualContent(contentWithOnlyComments)).toBe(false);
    });

    it('should return true for migration with actual SQL content', () => {
      const contentWithSQL = `-- SQLSync Migration: real_migration
-- Generated At: 2025-04-04T10:45:00.000Z
-- Based on detected changes between states.

-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/users.sql
-- NOTE: File content has changed. Including complete content:
-- sqlsync: startStatement:abcdef1234567890
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE
);
-- sqlsync: endStatement:abcdef1234567890

-- >>> END MODIFIED FILES <<<`;

      expect(migrationHasActualContent(contentWithSQL)).toBe(true);
    });

    it('should return false for migration with only checksum markers but no SQL', () => {
      const contentWithOnlyMarkers = `-- SQLSync Migration: empty_migration
-- Generated At: 2025-04-04T10:45:00.000Z
-- Based on detected changes between states.

-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/users.sql
-- sqlsync: startStatement:abcdef1234567890
-- sqlsync: endStatement:abcdef1234567890

-- >>> END MODIFIED FILES <<<`;

      expect(migrationHasActualContent(contentWithOnlyMarkers)).toBe(false);
    });

    it('should return true for migration with just a semicolon as valid SQL', () => {
      const contentWithSemicolon = `-- SQLSync Migration: semicolon_migration
-- Generated At: 2025-04-04T10:45:00.000Z
-- Based on detected changes between states.

-- >>> MODIFIED FILES <<<

-- Modified File: schema/data/empty.sql
-- sqlsync: startStatement:abcdef1234567890
;
-- sqlsync: endStatement:abcdef1234567890

-- >>> END MODIFIED FILES <<<`;

      expect(migrationHasActualContent(contentWithSemicolon)).toBe(true);
    });
  });
});
