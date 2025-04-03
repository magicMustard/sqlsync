/**
 * Tests for the migration generator functions
 */
import { ProcessedSqlFile } from '../../src/types/processed-sql';
import { DeclarativeTableState } from '../../src/types/state';
import { 
  isProcessedSqlFile, 
  isDeclarativeTableState 
} from '../../src/core/migration-generator';

jest.mock('../../src/core/migration-generator', () => {
  const original = jest.requireActual('../../src/core/migration-generator');
  return {
    ...original,
    isProcessedSqlFile: jest.fn((obj) => {
      if (obj === null || obj === undefined) return false;
      return obj && 'filePath' in obj && 'statements' in obj && 'rawFileChecksum' in obj;
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
          filePath: 'schema/tables/users.sql',
          fileName: 'users.sql',
          statements: [],
          rawFileContent: 'CREATE TABLE users (id INT);',
          tableDefinition: null,
          rawFileChecksum: 'abc123',
          declarativeTable: false
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
          rawFileChecksum: 'abc123'
        };
        
        const missingStatements = {
          filePath: 'schema/tables/users.sql',
          fileName: 'users.sql',
          rawFileContent: 'CREATE TABLE users (id INT);',
          rawFileChecksum: 'abc123'
        };
        
        const missingChecksum = {
          filePath: 'schema/tables/users.sql',
          fileName: 'users.sql',
          statements: [],
          rawFileContent: 'CREATE TABLE users (id INT);'
        };
        
        expect(isProcessedSqlFile(missingFilePath)).toBe(false);
        expect(isProcessedSqlFile(missingStatements)).toBe(false);
        expect(isProcessedSqlFile(missingChecksum)).toBe(false);
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
});
