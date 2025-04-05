// tests/core/sql-normalization.test.ts
import { normalizeSQL } from '../../src/core/sql-processor';
import { migrationHasActualContent } from '../../src/core/migration-generator';
import { getHash } from '../../src/utils/crypto';
import { ProcessedSqlFile } from '../../src/types/processed-sql';
import { compareFilesByNormalizedContent } from '../../src/core/diff-engine';

// Mock the compareFilesByNormalizedContent function for testing
jest.mock('../../src/core/diff-engine', () => {
  const original = jest.requireActual('../../src/core/diff-engine');
  return {
    ...original,
    compareFilesByNormalizedContent: jest.fn(),
  };
});

describe('SQL Normalization', () => {
  describe('normalizeSQL function', () => {
    it('should handle null or empty input', () => {
      expect(normalizeSQL('')).toBe('');
      expect(normalizeSQL(null as any)).toBe('');
      expect(normalizeSQL(undefined as any)).toBe('');
    });

    it('should remove single-line comments', () => {
      const sqlWithComments = `
        CREATE TABLE users ( -- This is a comment
          id UUID PRIMARY KEY, -- User ID
          name TEXT NOT NULL -- User's name
        );
      `;
      
      const normalized = normalizeSQL(sqlWithComments);
      
      expect(normalized).not.toContain('--');
      expect(normalized).toContain('CREATE TABLE users');
      expect(normalized).toContain('id UUID PRIMARY KEY');
      expect(normalized).toContain('name TEXT NOT NULL');
    });

    it('should remove multi-line comments', () => {
      const sqlWithComments = `
        CREATE TABLE users (
          /* 
           * This is a multi-line comment
           * that spans multiple lines
           */
          id UUID PRIMARY KEY,
          name TEXT NOT NULL
        );
      `;
      
      const normalized = normalizeSQL(sqlWithComments);
      
      expect(normalized).not.toContain('/*');
      expect(normalized).not.toContain('*/');
      expect(normalized).toContain('CREATE TABLE users');
      expect(normalized).toContain('id UUID PRIMARY KEY');
      expect(normalized).toContain('name TEXT NOT NULL');
    });

    it('should normalize whitespace', () => {
      const sqlWithExtraWhitespace = `
        CREATE    TABLE    users (
          id    UUID    PRIMARY KEY,
          
          name    TEXT    NOT    NULL
        );
      `;
      
      const normalized = normalizeSQL(sqlWithExtraWhitespace);
      
      // Check that multiple spaces are replaced with a single space
      expect(normalized).not.toContain('  ');
      expect(normalized).toContain('CREATE TABLE users');
    });

    it('should produce the same output for functionally identical SQL with different formatting', () => {
      const sql1 = `
        CREATE TABLE users (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL
        );
      `;
      
      const sql2 = `
        -- A differently formatted but functionally identical SQL
        CREATE    TABLE    users (
          id    UUID    PRIMARY KEY, -- ID column
          
          name    TEXT    NOT    NULL -- Name column
        );
      `;
      
      const normalized1 = normalizeSQL(sql1);
      const normalized2 = normalizeSQL(sql2);
      
      expect(normalized1).toBe(normalized2);
      
      // Also verify the checksums would be identical
      const checksum1 = getHash(normalized1);
      const checksum2 = getHash(normalized2);
      
      expect(checksum1).toBe(checksum2);
    });
  });

  describe('migrationHasActualContent function', () => {
    it('should correctly identify migrations with no actual SQL content', () => {
      const emptyMigration = `
        -- SQLSync Migration: empty_migration
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

        -- >>> END MODIFIED FILES <<<
      `;

      expect(migrationHasActualContent(emptyMigration)).toBe(false);
    });

    it('should correctly identify migrations with actual SQL content', () => {
      const realMigration = `
        -- SQLSync Migration: real_migration
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

        -- >>> END MODIFIED FILES <<<
      `;

      expect(migrationHasActualContent(realMigration)).toBe(true);
    });
  });

  describe('Change Detection', () => {
    // Create mock ProcessedSqlFile objects for testing
    const createMockFile = (content: string, normalized: string): ProcessedSqlFile => ({
      filePath: 'test.sql',
      fileName: 'test.sql',
      rawFileContent: content,
      rawFileChecksum: getHash(content),
      normalizedChecksum: getHash(normalized),
      statements: [],
      declarativeTable: false,
    });

    it('should not detect changes when only comments differ', () => {
      const originalSQL = `
        CREATE TABLE users (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL
        );
      `;

      const commentChangedSQL = `
        -- This comment has been added
        CREATE TABLE users (
          id UUID PRIMARY KEY, -- Added comment here
          name TEXT NOT NULL
        );
      `;

      const file1 = createMockFile(originalSQL, normalizeSQL(originalSQL));
      const file2 = createMockFile(commentChangedSQL, normalizeSQL(commentChangedSQL));

      // Verify that normalized checksums are the same
      expect(file1.normalizedChecksum).toBe(file2.normalizedChecksum);
      
      // But raw checksums should be different
      expect(file1.rawFileChecksum).not.toBe(file2.rawFileChecksum);
    });

    it('should not detect changes when only whitespace differs', () => {
      const originalSQL = `
        CREATE TABLE users (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL
        );
      `;

      const whitespaceChangedSQL = `
        CREATE    TABLE    users (
          id    UUID    PRIMARY KEY,
          
          name    TEXT    NOT    NULL
        );
      `;

      const file1 = createMockFile(originalSQL, normalizeSQL(originalSQL));
      const file2 = createMockFile(whitespaceChangedSQL, normalizeSQL(whitespaceChangedSQL));

      // Verify that normalized checksums are the same
      expect(file1.normalizedChecksum).toBe(file2.normalizedChecksum);
      
      // But raw checksums should be different
      expect(file1.rawFileChecksum).not.toBe(file2.rawFileChecksum);
    });

    it('should detect changes when actual SQL content differs', () => {
      const originalSQL = `
        CREATE TABLE users (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL
        );
      `;

      const contentChangedSQL = `
        CREATE TABLE users (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE -- New column added
        );
      `;

      const file1 = createMockFile(originalSQL, normalizeSQL(originalSQL));
      const file2 = createMockFile(contentChangedSQL, normalizeSQL(contentChangedSQL));

      // Verify that normalized checksums are different
      expect(file1.normalizedChecksum).not.toBe(file2.normalizedChecksum);
      
      // And raw checksums should also be different
      expect(file1.rawFileChecksum).not.toBe(file2.rawFileChecksum);
    });
  });
});
