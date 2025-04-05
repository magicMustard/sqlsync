// tests/core/seed-file-handling.test.ts
import { generateMigrationContent } from '../../src/core/migration-generator';
import { StateDifference, FileChange } from '../../src/core/diff-engine';
import { ProcessedSqlFile } from '../../src/types/processed-sql';
import { getHash } from '../../src/utils/crypto';

describe('Migration Generator - SQL Content Handling', () => {
  it('should include complete content in migrations for any SQL file', () => {
    // Create mock SQL file with DML
    const sqlFileContent = `INSERT INTO public.integrations(
        id,
        sys_name,
        name,
        description,
        ai_function,
        image_url
    ) VALUES (
        '0195fe50-6472-728f-818a-43ec83825082',
        'Rezdy',
        'Rezdy',
        'Rezdy is a software that can place bookings and check availability for hotels, tours, and activities.',
        true,
        'rezdy.jpg'
    );`;

    const sqlFilePath = 'schema/data/integrations.sql';
    
    // Mock a file change for the SQL file
    const mockProcessedSqlFile: ProcessedSqlFile = {
      filePath: sqlFilePath,
      fileName: 'integrations.sql',
      statements: [
        { 
          content: sqlFileContent,
          checksum: getHash(sqlFileContent)
        }
      ],
      declarativeTable: false,
      rawFileContent: sqlFileContent,
      rawFileChecksum: getHash(sqlFileContent),
      normalizedChecksum: getHash(sqlFileContent.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim())
    };
    
    // Create a mock state difference
    const mockDifference: StateDifference = {
      fileChanges: [
        {
          type: 'modified',
          filePath: sqlFilePath,
          current: mockProcessedSqlFile,
          previous: undefined,
          statementChanges: [
            {
              type: 'added',
              current: {
                content: sqlFileContent,
                checksum: getHash(sqlFileContent)
              },
              previous: undefined
            }
          ]
        }
      ]
    };
    
    // Generate migration content
    const { content } = generateMigrationContent(mockDifference, 'data_changes');
    
    // Verify the migration includes the file content
    expect(content).toContain(`-- Modified File: ${sqlFilePath}`);
    expect(content).toContain('INSERT INTO public.integrations');
    expect(content).toContain('VALUES');
    expect(content).toContain('Rezdy');
    expect(content).toContain('ai_function');
  });

  it('should handle files with multiple statements correctly', () => {
    // Create mock SQL file with multiple statements (mixed DDL and DML)
    const sqlFileContent = `-- sqlsync: splitStatements=true
-- Create temporary table for data import
CREATE TEMPORARY TABLE temp_import (id UUID, name TEXT);

-- Insert data 
INSERT INTO public.categories(id, name) 
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Category 1'),
  ('22222222-2222-2222-2222-222222222222', 'Category 2');
  
-- Update existing records
UPDATE public.categories SET updated_at = NOW() WHERE id = '11111111-1111-1111-1111-111111111111';`;

    const sqlFilePath = 'schema/data/categories.sql';
    
    // Mock a file change for the SQL file with multiple statements
    const mockProcessedSqlFile: ProcessedSqlFile = {
      filePath: sqlFilePath,
      fileName: 'categories.sql',
      statements: [
        {
          content: 'CREATE TEMPORARY TABLE temp_import (id UUID, name TEXT);',
          checksum: getHash('CREATE TEMPORARY TABLE temp_import (id UUID, name TEXT);')
        },
        {
          content: `INSERT INTO public.categories(id, name) 
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Category 1'),
  ('22222222-2222-2222-2222-222222222222', 'Category 2');`,
          checksum: getHash(`INSERT INTO public.categories(id, name) 
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Category 1'),
  ('22222222-2222-2222-2222-222222222222', 'Category 2');`)
        },
        {
          content: "UPDATE public.categories SET updated_at = NOW() WHERE id = '11111111-1111-1111-1111-111111111111';",
          checksum: getHash("UPDATE public.categories SET updated_at = NOW() WHERE id = '11111111-1111-1111-1111-111111111111';")
        }
      ],
      declarativeTable: false,
      rawFileContent: sqlFileContent,
      rawFileChecksum: getHash(sqlFileContent),
      normalizedChecksum: getHash(sqlFileContent.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim())
    };
    
    // Create a mock state difference
    const mockDifference: StateDifference = {
      fileChanges: [
        {
          type: 'modified',
          filePath: sqlFilePath,
          current: mockProcessedSqlFile,
          previous: undefined,
          statementChanges: [
            {
              type: 'added',
              current: mockProcessedSqlFile.statements[0],
              previous: undefined
            },
            {
              type: 'added',
              current: mockProcessedSqlFile.statements[1],
              previous: undefined
            },
            {
              type: 'added',
              current: mockProcessedSqlFile.statements[2],
              previous: undefined
            }
          ]
        }
      ]
    };
    
    // Generate migration content
    const { content } = generateMigrationContent(mockDifference, 'data_with_multiple_statements');
    
    // Verify the migration includes all statements
    expect(content).toContain(`-- Modified File: ${sqlFilePath}`);
    
    // Check for all statements
    expect(content).toContain('CREATE TEMPORARY TABLE');
    expect(content).toContain('INSERT INTO public.categories');
    expect(content).toContain('UPDATE public.categories');
  });
});
