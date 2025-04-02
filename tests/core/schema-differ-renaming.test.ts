// tests/core/schema-differ-renaming.test.ts
import { diffTableDefinitions } from '../../src/core/schema-differ';
import { TableDefinition, ColumnDefinition } from '../../src/types';

describe('Schema Differ - Column Renaming', () => {
  it('should detect column renaming based on similarity and position', () => {
    const oldTable: TableDefinition = {
      tableName: 'users',
      columns: [
        {
          name: 'id',
          dataType: 'SERIAL',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'user_name', // Original column name
          dataType: 'VARCHAR(50)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: true,
          defaultValue: null,
        },
        {
          name: 'email',
          dataType: 'VARCHAR(100)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: true,
          defaultValue: null,
        },
      ],
    };

    const newTable: TableDefinition = {
      tableName: 'users',
      columns: [
        {
          name: 'id',
          dataType: 'SERIAL',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'username', // Renamed column
          dataType: 'VARCHAR(50)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: true,
          defaultValue: null,
        },
        {
          name: 'email',
          dataType: 'VARCHAR(100)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: true,
          defaultValue: null,
        },
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Should detect rename instead of drop + add
    expect(operations.length).toBe(1);
    expect(operations[0].type).toBe('RENAME_COLUMN');
    expect(operations[0].columnName).toBe('user_name');
    expect(operations[0].newColumnName).toBe('username');
    expect(operations[0].sql).toContain('ALTER TABLE users RENAME COLUMN user_name TO username;');
  });

  it('should handle column renaming with slightly different attributes', () => {
    const oldTable: TableDefinition = {
      tableName: 'products',
      columns: [
        {
          name: 'prod_id',
          dataType: 'INTEGER',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'product_description',
          dataType: 'TEXT',
          isPrimaryKey: false,
          isNullable: true,
          isUnique: false,
          defaultValue: null,
        },
      ],
    };

    const newTable: TableDefinition = {
      tableName: 'products',
      columns: [
        {
          name: 'prod_id',
          dataType: 'INTEGER',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'description', // Renamed with slightly different attributes
          dataType: 'TEXT',
          isPrimaryKey: false,
          isNullable: false, // Changed nullability
          isUnique: false,
          defaultValue: "''", // Added default value
        },
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Should detect rename + modify instead of drop + add
    expect(operations.length).toBe(2);
    
    // First operation should be rename
    expect(operations[0].type).toBe('RENAME_COLUMN');
    expect(operations[0].columnName).toBe('product_description');
    expect(operations[0].newColumnName).toBe('description');
    
    // Second operation should be modify
    expect(operations[1].type).toBe('MODIFY_COLUMN');
    expect(operations[1].columnName).toBe('description');
    expect(operations[1].sql).toContain('ALTER COLUMN description SET NOT NULL');
    expect(operations[1].sql).toContain('ALTER COLUMN description SET DEFAULT');
  });

  it('should handle multiple column changes including renames', () => {
    const oldTable: TableDefinition = {
      tableName: 'orders',
      columns: [
        {
          name: 'id',
          dataType: 'SERIAL',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'customer_id',
          dataType: 'INTEGER',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'order_date',
          dataType: 'DATE',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: 'CURRENT_DATE',
        },
        {
          name: 'total_amount',
          dataType: 'NUMERIC(10,2)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: '0.00',
        },
      ],
    };

    const newTable: TableDefinition = {
      tableName: 'orders',
      columns: [
        {
          name: 'id',
          dataType: 'SERIAL',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'user_id', // Renamed from customer_id
          dataType: 'INTEGER',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'created_at', // Renamed from order_date
          dataType: 'TIMESTAMP', // Changed type
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: 'NOW()', // Changed default
        },
        {
          name: 'amount', // Renamed from total_amount
          dataType: 'NUMERIC(10,2)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: '0.00',
        },
        {
          name: 'status', // New column
          dataType: 'VARCHAR(20)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: "'pending'",
        },
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Should have 5 operations: 3 renames + 1 modify + 1 add
    expect(operations.length).toBe(5);
    
    // Check for rename operations
    const renameOps = operations.filter(op => op.type === 'RENAME_COLUMN');
    expect(renameOps.length).toBe(3);
    
    // Check for the specific rename operations
    expect(renameOps.some(op => 
      op.columnName === 'customer_id' && op.newColumnName === 'user_id'
    )).toBe(true);
    
    expect(renameOps.some(op => 
      op.columnName === 'order_date' && op.newColumnName === 'created_at'
    )).toBe(true);
    
    expect(renameOps.some(op => 
      op.columnName === 'total_amount' && op.newColumnName === 'amount'
    )).toBe(true);
    
    // Check for the modify operation
    const modifyOps = operations.filter(op => op.type === 'MODIFY_COLUMN');
    expect(modifyOps.length).toBe(1);
    expect(modifyOps[0].columnName).toBe('created_at');
    
    // Check for the add operation
    const addOps = operations.filter(op => op.type === 'ADD_COLUMN');
    expect(addOps.length).toBe(1);
    expect(addOps[0].columnName).toBe('status');
  });

  it('should handle the specific tenant table case', () => {
    const oldTable: TableDefinition = {
      tableName: 'public.tenants',
      columns: [
        {
          name: 'id',
          dataType: 'UUID',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: 'functions.uuid_v7()',
        },
        // Include all columns from the original tenants table
        {
          name: 'ext_billing_id', // This gets renamed
          dataType: 'TEXT',
          isPrimaryKey: false,
          isNullable: true,
          isUnique: false,
          defaultValue: 'NULL',
        },
        // Other columns...
      ],
    };

    const newTable: TableDefinition = {
      tableName: 'public.tenants',
      columns: [
        {
          name: 'id',
          dataType: 'UUID',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: 'functions.uuid_v7()',
        },
        // Include all columns from the modified tenants table
        {
          name: 'billing_id', // Renamed from ext_billing_id
          dataType: 'TEXT',
          isPrimaryKey: false,
          isNullable: true,
          isUnique: false,
          defaultValue: 'NULL',
        },
        {
          name: 'fred', // New column
          dataType: 'TEXT',
          isPrimaryKey: false,
          isNullable: true,
          isUnique: false,
          defaultValue: 'NULL',
        },
        // Other columns...
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Should have 2 operations: 1 rename + 1 add
    expect(operations.length).toBe(2);
    
    // Check for rename operation
    const renameOp = operations.find(op => op.type === 'RENAME_COLUMN');
    expect(renameOp).toBeDefined();
    expect(renameOp?.columnName).toBe('ext_billing_id');
    expect(renameOp?.newColumnName).toBe('billing_id');
    
    // Check for add operation
    const addOp = operations.find(op => op.type === 'ADD_COLUMN');
    expect(addOp).toBeDefined();
    expect(addOp?.columnName).toBe('fred');
  });

  it('should ask user for confirmation when rename detection has low confidence', () => {
    // This test simulates the scenario where the system has low confidence
    // in a column rename and would prompt the user, but since we can't
    // actually prompt in tests, we'll just verify it marks the detection
    // as low confidence
    
    const oldTable: TableDefinition = {
      tableName: 'products',
      columns: [
        {
          name: 'id',
          dataType: 'SERIAL',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'price',
          dataType: 'NUMERIC(10,2)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: '0.00',
        },
        {
          name: 'description',
          dataType: 'TEXT',
          isPrimaryKey: false,
          isNullable: true,
          isUnique: false,
          defaultValue: null,
        },
      ],
    };

    const newTable: TableDefinition = {
      tableName: 'products',
      columns: [
        {
          name: 'id',
          dataType: 'SERIAL',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'cost', // Renamed but very different semantically from 'price'
          dataType: 'NUMERIC(10,2)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: '0.00',
        },
        {
          name: 'details', // Renamed but not very similar to 'description'
          dataType: 'JSONB', // Different type
          isPrimaryKey: false,
          isNullable: true,
          isUnique: false,
          defaultValue: "'{}'::JSONB", // Different default
        },
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Check for operations that indicate low confidence
    // The actual operations returned will depend on how you implement confidence scores
    // We'll check for either rename operations with a confidence flag or drop/add pairs
    
    // Example check if you implement confidence scoring:
    const renameOps = operations.filter(op => op.type === 'RENAME_COLUMN');
    if (renameOps.length > 0) {
      // Check if they have confidence scores
      for (const op of renameOps) {
        expect(op.requiresConfirmation).toBeDefined();
      }
    } else {
      // If no renames were detected due to low confidence, should have drop+add pairs
      const dropOps = operations.filter(op => op.type === 'DROP_COLUMN');
      const addOps = operations.filter(op => op.type === 'ADD_COLUMN');
      
      expect(dropOps.length).toBeGreaterThanOrEqual(2);
      expect(addOps.length).toBeGreaterThanOrEqual(2);
    }
  });
});
