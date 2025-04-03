import * as path from 'path';
import { Parser } from 'node-sql-parser';
import { getHash } from '../utils/crypto';
import { logger } from '../utils/logger';

/**
 * Interface representing the result of splitting SQL statements
 */
export interface SplitStatementsResult {
  filePath: string;
  fileName: string;
  splitStatements: boolean;
  statements: string[];
  error?: string;
  rawFileContent: string;
  rawFileChecksum: string;
}

/**
 * Split a SQL file's contents into individual statements
 * @param content The SQL file content
 * @param filePath The path to the SQL file
 * @returns A result object containing the split statements and metadata
 */
export async function splitStatements(
  content: string, 
  filePath: string
): Promise<SplitStatementsResult> {
  const fileName = path.basename(filePath);
  const rawFileChecksum = getHash(content);
  
  // Default result structure
  const result: SplitStatementsResult = {
    filePath,
    fileName,
    splitStatements: false,
    statements: [],
    rawFileContent: content,
    rawFileChecksum
  };

  try {
    // Check if splitting is enabled via a comment directive
    const splitStatementsMatch = content.match(/--\s*sqlsync:\s*splitStatements\s*=\s*true/i);
    result.splitStatements = !!splitStatementsMatch;

    if (!result.splitStatements) {
      // If not splitting, treat the entire file as a single statement
      result.statements = [content.trim()];
      return result;
    }

    // Splitting is enabled, use SQL parser to split statements
    const parser = new Parser();
    
    // Basic statement splitting by semicolons
    // This is a simple approach and may not handle all edge cases
    const rawStatements = content
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    // Validate each statement with the SQL parser
    for (const stmt of rawStatements) {
      try {
        // Try to parse the statement
        parser.parse(stmt + ';');
        // If parsing succeeds, add to valid statements
        result.statements.push(stmt + ';');
      } catch (parseError: any) {
        // If any statement fails to parse, record the error
        const errorMsg = `Error parsing SQL statement in ${fileName}: ${parseError.message}`;
        logger.error(errorMsg);
        result.error = errorMsg;
        
        // Empty the statements array since we don't want partial processing
        result.statements = [];
        break;
      }
    }

    return result;
  } catch (error: any) {
    const errorMsg = `Error processing SQL file ${fileName}: ${error.message}`;
    logger.error(errorMsg);
    result.error = errorMsg;
    return result;
  }
}
