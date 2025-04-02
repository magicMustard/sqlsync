import { TableDefinition, ColumnDefinition } from '@/types';

/**
 * A specialized parser for PostgreSQL CREATE TABLE statements
 * Much more robust than node-sql-parser for PostgreSQL syntax
 */
export class PostgresTableParser {
  /**
   * Parse a PostgreSQL CREATE TABLE statement and extract table definition
   * 
   * @param sql The CREATE TABLE SQL statement
   * @returns TableDefinition object or null if parsing fails
   */
  public static parseCreateTable(sql: string): TableDefinition | null {
    try {
      // Normalize whitespace and remove comments to simplify parsing
      const normalizedSql = this.normalizeSQL(sql);
      
      // Check if this is a CREATE TABLE statement
      if (!/^\s*CREATE\s+TABLE/i.test(normalizedSql)) {
        return null;
      }
      
      // Extract table name
      const tableInfo = this.extractTableInfo(normalizedSql);
      if (!tableInfo) return null;
      
      // Extract column definitions
      const columns = this.extractColumns(normalizedSql);
      
      // For debugging - log any issues with parsing
      if (columns.length === 0) {
        console.warn('No columns found in CREATE TABLE statement:', sql);
      }
      
      // Create a fully qualified table name if a schema is specified
      const fullTableName = tableInfo.schema ? `${tableInfo.schema}.${tableInfo.tableName}` : tableInfo.tableName;
      
      return {
        tableName: fullTableName,
        columns,
      };
    } catch (error) {
      console.error('Error parsing CREATE TABLE statement:', error);
      return null;
    }
  }
  
  /**
   * Normalize SQL by removing comments and standardizing whitespace
   */
  private static normalizeSQL(sql: string): string {
    // Remove SQL comments
    let normalizedSql = sql
      .replace(/--.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//gm, '') // Remove multi-line comments
      .trim();
    
    // Normalize whitespace but preserve spaces in quoted identifiers
    normalizedSql = normalizedSql.replace(/\s+/g, ' ');
    
    return normalizedSql;
  }
  
  /**
   * Extract table schema and name from CREATE TABLE statement
   */
  private static extractTableInfo(sql: string): { schema: string, tableName: string } | null {
    // First, handle quoted identifiers with spaces
    const quotedTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?(?:\s+"([^"]+)"(?:\.?"([^"]+)")?|\s+([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?)/i;
    const match = sql.match(quotedTableRegex);
    
    if (!match) return null;
    
    let schema = 'public';
    let tableName;
    
    if (match[2]) {
      // We have "schema"."table" format
      schema = match[1];
      tableName = match[2];
    } else if (match[4]) {
      // We have schema.table format (no quotes)
      schema = match[3];
      tableName = match[4];
    } else if (match[3]) {
      // We have just table name (no quotes)
      tableName = match[3];
    } else {
      // We have just quoted table name
      tableName = match[1];
    }
    
    return { schema, tableName };
  }
  
  /**
   * Extract column definitions from CREATE TABLE statement
   */
  private static extractColumns(sql: string): ColumnDefinition[] {
    const columns: ColumnDefinition[] = [];
    
    // Extract the content between parentheses in the CREATE TABLE statement
    const columnsMatch = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?(?:\s+(?:"[^"]+"|[a-zA-Z0-9_]+)(?:\.(?:"[^"]+"|[a-zA-Z0-9_]+))?)\s*\(([\s\S]*)\)\s*;?\s*$/i);
    
    if (!columnsMatch || !columnsMatch[1]) {
      console.error('Failed to extract column definitions from CREATE TABLE statement:', sql);
      return [];
    }
    
    let columnsPart = columnsMatch[1].trim();
    
    // Split column definitions, being careful about nested parentheses for array types, etc.
    const columnDefs = this.splitColumnDefinitions(columnsPart);
    
    // Track primary key columns defined in separate constraints
    const primaryKeyColumns = new Set<string>();
    
    // First pass to find table-level PRIMARY KEY constraints
    for (const columnDef of columnDefs) {
      const trimmedDef = columnDef.trim();
      // Look for PRIMARY KEY (col1, col2, ...)
      const pkMatch = trimmedDef.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        // Extract column names from the PRIMARY KEY constraint
        const pkColumns = pkMatch[1].split(',').map(col => 
          col.trim().replace(/^"([^"]+)"$/, '$1') // Remove quotes if present
        );
        
        // Add each column to the set
        pkColumns.forEach(col => primaryKeyColumns.add(col));
      }
      
      // Also check for CONSTRAINT ... PRIMARY KEY format
      const constraintPkMatch = trimmedDef.match(/^CONSTRAINT\s+\w+\s+PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (constraintPkMatch) {
        const pkColumns = constraintPkMatch[1].split(',').map(col => 
          col.trim().replace(/^"([^"]+)"$/, '$1')
        );
        
        pkColumns.forEach(col => primaryKeyColumns.add(col));
      }
    }
    
    // Second pass for column definitions
    for (const columnDef of columnDefs) {
      // Skip constraints and keys that aren't column definitions
      if (/^(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)/i.test(columnDef.trim())) {
        continue;
      }
      
      const parsedColumn = this.parseColumnDefinition(columnDef.trim(), primaryKeyColumns);
      if (parsedColumn) {
        columns.push(parsedColumn);
      } else {
        // Log if we failed to parse a column definition
        console.warn('Failed to parse column definition:', columnDef);
      }
    }
    
    return columns;
  }
  
  /**
   * Split column definitions while respecting nested parentheses
   */
  private static splitColumnDefinitions(columnsPart: string): string[] {
    const columnDefs: string[] = [];
    let currentDef = '';
    let parenLevel = 0;
    let inQuotes = false;
    let bracketLevel = 0; // For array types like VARCHAR(50)[]
    
    for (let i = 0; i < columnsPart.length; i++) {
      const char = columnsPart[i];
      
      // Handle quoted identifiers
      if (char === '"' && (i === 0 || columnsPart[i-1] !== '\\')) {
        inQuotes = !inQuotes;
        currentDef += char;
        continue;
      }
      
      // Track parenthesis and bracket nesting level
      if (!inQuotes) {
        if (char === '(') {
          parenLevel++;
        } else if (char === ')') {
          parenLevel--;
        } else if (char === '[') {
          bracketLevel++;
        } else if (char === ']') {
          bracketLevel--;
        }
      }
      
      // Split definitions on comma at the top level (not within parens, brackets, or quotes)
      if (char === ',' && parenLevel === 0 && bracketLevel === 0 && !inQuotes) {
        columnDefs.push(currentDef.trim());
        currentDef = '';
      } else {
        currentDef += char;
      }
    }
    
    // Add the last definition if there is one
    if (currentDef.trim()) {
      columnDefs.push(currentDef.trim());
    }
    
    return columnDefs;
  }
  
  /**
   * Parse an individual column definition
   */
  private static parseColumnDefinition(columnDef: string, primaryKeyColumns: Set<string>): ColumnDefinition | null {
    // Handle column names with spaces in quotes
    const columnNameMatch = columnDef.match(/^(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+/);
    if (!columnNameMatch) return null;
    
    const name = columnNameMatch[1] || columnNameMatch[2];
    
    // Extract the rest of the definition after the column name
    const restOfDef = columnDef.substring(columnNameMatch[0].length).trim();
    
    // Extract data type - handle complex types including arrays and types with params
    let dataType: string;
    
    // Special case for data types with spaces like "TIMESTAMP WITH TIME ZONE"
    const timeWithZoneMatch = restOfDef.match(/^(TIMESTAMP\s+WITH\s+TIME\s+ZONE|TIME\s+WITH\s+TIME\s+ZONE)/i);
    if (timeWithZoneMatch) {
      dataType = timeWithZoneMatch[1].toUpperCase();
    }
    // Special case for array types
    else if (restOfDef.includes('[]')) {
      const arrayTypeMatch = restOfDef.match(/^([^[(]+(?:\([^)]+\))?)\[\]/);
      if (arrayTypeMatch) {
        dataType = `${arrayTypeMatch[1]}[]`;
      } else {
        // Fallback - take until the first space
        dataType = restOfDef.split(/\s+/)[0];
      }
    } 
    // Types with parameters like VARCHAR(50)
    else if (restOfDef.includes('(')) {
      const typeWithParamsMatch = restOfDef.match(/^([a-zA-Z0-9_]+\([^)]+\))/);
      if (typeWithParamsMatch) {
        dataType = typeWithParamsMatch[1];
      } else {
        // Fallback - take until the first space
        dataType = restOfDef.split(/\s+/)[0];
      }
    }
    // Simple types
    else {
      dataType = restOfDef.split(/\s+/)[0];
    }
    
    // Set default nullability based on SQL standards - columns are nullable by default
    // unless explicitly marked as NOT NULL or they are part of PRIMARY KEY
    const notNullInDef = /\bNOT\s+NULL\b/i.test(columnDef);
    const nullableInDef = /\bNULL\b/i.test(columnDef) && !notNullInDef;
    
    // PRIMARY KEY columns are implicitly NOT NULL
    const pkInDef = /\bPRIMARY\s+KEY\b/i.test(columnDef) || primaryKeyColumns.has(name);
    
    // Determine nullability - true if explicitly NULL or neither specified and not PK
    // false if explicitly NOT NULL or it's a PRIMARY KEY
    const isNullable = nullableInDef || (!notNullInDef && !pkInDef);
    
    // Extract default value
    let defaultValue: string | null = null;
    const defaultMatch = columnDef.match(/DEFAULT\s+([^,]+?)(?:\s+(?:NOT\s+NULL|NULL|CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|REFERENCES).*)?$/i);
    if (defaultMatch) {
      defaultValue = defaultMatch[1].trim();
    }
    
    // Extract unique constraint
    const isUnique = /\bUNIQUE\b/i.test(columnDef);
    
    return {
      name,
      dataType,
      isNullable,
      defaultValue,
      isPrimaryKey: pkInDef,
      isUnique: isUnique || pkInDef // PRIMARY KEY columns are implicitly UNIQUE
    };
  }
}
