// tests/core/schema-differ-foreign-keys.test.ts
import { diffTableDefinitions } from '../../src/core/schema-differ';
import { TableDefinition } from '../../src/types';

describe('Schema Differ - Foreign Key Handling', () => {
  it('should generate correct SQL for adding a column with foreign key reference', () => {
    const oldTable: TableDefinition = {
      tableName: 'tenant_subscriptions',
      columns: [
        {
          name: 'id',
          dataType: 'UUID',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'tenant_id',
          dataType: 'UUID',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        }
      ],
    };

    const newTable: TableDefinition = {
      tableName: 'tenant_subscriptions',
      columns: [
        {
          name: 'id',
          dataType: 'UUID',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'tenant_id',
          dataType: 'UUID',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
        },
        {
          name: 'subscription_id',
          dataType: 'UUID',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
          foreignKey: {
            referencedTable: 'public.subscriptions',
            referencedColumn: 'id',
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION'
          }
        }
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Should generate an ADD COLUMN operation with foreign key
    expect(operations.length).toBe(1);
    expect(operations[0].type).toBe('ADD_COLUMN');
    expect(operations[0].columnName).toBe('subscription_id');
    expect(operations[0].sql).toContain('ADD COLUMN subscription_id UUID NOT NULL');
    expect(operations[0].sql).toContain('REFERENCES public.subscriptions(id)');
    expect(operations[0].sql).toContain('ON DELETE NO ACTION');
    expect(operations[0].sql).toContain('ON UPDATE NO ACTION');
  });

  it('should generate correct SQL for modifying a column to add foreign key', () => {
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
        }
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
          name: 'customer_id',
          dataType: 'INTEGER',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
          foreignKey: {
            referencedTable: 'customers',
            referencedColumn: 'id',
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
          }
        }
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Should generate a MODIFY_COLUMN operation to add foreign key constraint
    expect(operations.length).toBe(1);
    expect(operations[0].type).toBe('MODIFY_COLUMN');
    expect(operations[0].columnName).toBe('customer_id');
    expect(operations[0].sql).toContain('ADD CONSTRAINT orders_customer_id_fk');
    expect(operations[0].sql).toContain('FOREIGN KEY (customer_id)');
    expect(operations[0].sql).toContain('REFERENCES customers(id)');
    expect(operations[0].sql).toContain('ON DELETE CASCADE');
    expect(operations[0].sql).toContain('ON UPDATE CASCADE');
  });

  it('should generate correct SQL for modifying a foreign key reference', () => {
    const oldTable: TableDefinition = {
      tableName: 'comments',
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
          name: 'post_id',
          dataType: 'INTEGER',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
          foreignKey: {
            referencedTable: 'posts',
            referencedColumn: 'id',
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
          }
        }
      ],
    };

    const newTable: TableDefinition = {
      tableName: 'comments',
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
          name: 'post_id',
          dataType: 'INTEGER',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
          foreignKey: {
            referencedTable: 'posts',
            referencedColumn: 'id',
            onDelete: 'CASCADE', // Changed from RESTRICT to CASCADE
            onUpdate: 'CASCADE'  // Changed from RESTRICT to CASCADE
          }
        }
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Should generate a MODIFY_COLUMN operation to change foreign key constraint
    expect(operations.length).toBe(1);
    expect(operations[0].type).toBe('MODIFY_COLUMN');
    expect(operations[0].columnName).toBe('post_id');
    expect(operations[0].sql).toContain('DROP CONSTRAINT IF EXISTS comments_post_id_fk');
    expect(operations[0].sql).toContain('ADD CONSTRAINT comments_post_id_fk');
    expect(operations[0].sql).toContain('ON DELETE CASCADE');
    expect(operations[0].sql).toContain('ON UPDATE CASCADE');
  });
  
  it('should handle check constraints correctly', () => {
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
          dataType: 'DECIMAL(10,2)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null
        }
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
          name: 'price',
          dataType: 'DECIMAL(10,2)',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
          checkConstraint: 'price > 0'
        }
      ],
    };

    const operations = diffTableDefinitions(oldTable, newTable);

    // Should generate a MODIFY_COLUMN operation to add check constraint
    expect(operations.length).toBe(1);
    expect(operations[0].type).toBe('MODIFY_COLUMN');
    expect(operations[0].columnName).toBe('price');
    expect(operations[0].sql).toContain('ADD CONSTRAINT products_price_check CHECK (price > 0)');
  });
});
