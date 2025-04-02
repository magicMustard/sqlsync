// tests/core/pg-table-parser.test.ts
import { PostgresTableParser } from '../../src/core/pg-table-parser';

describe('PostgresTableParser', () => {
  describe('parseCreateTable', () => {
    it('should parse a simple CREATE TABLE statement', () => {
      const sql = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) NOT NULL,
          email VARCHAR(100) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `;

      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      expect(result?.tableName).toBe('public.users');
      expect(result?.columns.length).toBe(4);
      
      // Check the id column
      const idColumn = result?.columns.find(c => c.name === 'id');
      expect(idColumn).toBeDefined();
      expect(idColumn?.dataType).toBe('SERIAL');
      expect(idColumn?.isPrimaryKey).toBe(true);
      expect(idColumn?.isNullable).toBe(false);
      
      // Check the email column
      const emailColumn = result?.columns.find(c => c.name === 'email');
      expect(emailColumn).toBeDefined();
      expect(emailColumn?.dataType).toBe('VARCHAR(100)');
      expect(emailColumn?.isUnique).toBe(true);
      expect(emailColumn?.isNullable).toBe(false);
      
      // Check created_at column with default
      const createdAtColumn = result?.columns.find(c => c.name === 'created_at');
      expect(createdAtColumn).toBeDefined();
      expect(createdAtColumn?.dataType).toBe('TIMESTAMP');
      expect(createdAtColumn?.defaultValue).toBe('NOW()');
    });

    it('should handle schema qualified table names', () => {
      const sql = `CREATE TABLE app.users (id SERIAL PRIMARY KEY);`;
      
      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      expect(result?.tableName).toBe('app.users');
    });

    it('should handle quoted identifiers', () => {
      const sql = `CREATE TABLE "User Data" ("User ID" SERIAL PRIMARY KEY);`;
      
      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      expect(result?.tableName).toBe('public.User Data');
      
      const idColumn = result?.columns.find(c => c.name === 'User ID');
      expect(idColumn).toBeDefined();
    });

    it('should handle IF NOT EXISTS clause', () => {
      const sql = `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY);`;
      
      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      expect(result?.tableName).toBe('public.users');
    });

    it('should handle complex column types', () => {
      const sql = `
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          price NUMERIC(10,2) DEFAULT 0.00,
          tags VARCHAR(50)[] DEFAULT '{}'::VARCHAR(50)[],
          details JSONB DEFAULT '{}'::JSONB
        );
      `;
      
      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      expect(result?.columns.length).toBe(5);
      
      const priceColumn = result?.columns.find(c => c.name === 'price');
      expect(priceColumn?.dataType).toBe('NUMERIC(10,2)');
      
      const tagsColumn = result?.columns.find(c => c.name === 'tags');
      expect(tagsColumn?.dataType).toBe('VARCHAR(50)[]');
      
      const detailsColumn = result?.columns.find(c => c.name === 'details');
      expect(detailsColumn?.dataType).toBe('JSONB');
    });

    it('should handle table constraints separate from columns', () => {
      const sql = `
        CREATE TABLE orders (
          id SERIAL,
          user_id INTEGER,
          product_id INTEGER,
          quantity INTEGER NOT NULL,
          PRIMARY KEY (id),
          CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id),
          CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id)
        );
      `;
      
      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      expect(result?.columns.length).toBe(4); // Should not include constraints as columns
      
      // id column should be primary key
      const idColumn = result?.columns.find(c => c.name === 'id');
      expect(idColumn?.isPrimaryKey).toBe(true);
    });

    it('should handle comments in SQL', () => {
      const sql = `
        -- This is a comment
        CREATE TABLE users (
          id SERIAL PRIMARY KEY, -- Primary key column
          /* Multi-line
             comment */
          username VARCHAR(50) NOT NULL
        );
      `;
      
      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      expect(result?.columns.length).toBe(2);
    });

    it('should handle nullable and not nullable columns', () => {
      const sql = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          bio TEXT NULL,
          login_count INTEGER DEFAULT 0
        );
      `;
      
      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      
      const nameColumn = result?.columns.find(c => c.name === 'name');
      expect(nameColumn?.isNullable).toBe(false);
      
      const bioColumn = result?.columns.find(c => c.name === 'bio');
      expect(bioColumn?.isNullable).toBe(true);
      
      const loginCountColumn = result?.columns.find(c => c.name === 'login_count');
      // No explicit NULL/NOT NULL, so should default based on implementation
      expect(loginCountColumn?.isNullable).toBeDefined();
    });

    // Negative test cases
    it('should return null for invalid SQL', () => {
      const invalidSql = `NOT A CREATE TABLE STATEMENT`;
      const result = PostgresTableParser.parseCreateTable(invalidSql);
      expect(result).toBeNull();
    });

    it('should handle a real-world complex table definition', () => {
      const sql = `
      CREATE TABLE public.tenants (
          id UUID NOT NULL PRIMARY KEY DEFAULT functions.uuid_v7(),
          reseller_id UUID REFERENCES public.tenants(id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFAULT NULL,
          domain TEXT DEFAULT NULL,
          root_domain TEXT DEFAULT NULL,
          tenant_type public.tenant_type NOT NULL,
          name TEXT DEFAULT NULL,
          phone TEXT DEFAULT NULL,
          email TEXT DEFAULT NULL,
          context TEXT NOT NULL DEFAULT '',
          billing_address JSONB DEFAULT NULL,
          billing_email TEXT DEFAULT NULL,
          billing_phone TEXT DEFAULT NULL,
          address JSONB DEFAULT NULL,
          timezone TEXT DEFAULT NULL,
          website_url TEXT DEFAULT NULL,
          operating_hours JSONB DEFAULT NULL,
          setup_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
          ext_billing_id TEXT DEFAULT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      `;
      
      const result = PostgresTableParser.parseCreateTable(sql);
      
      expect(result).not.toBeNull();
      expect(result?.tableName).toBe('public.tenants');
      expect(result?.columns.length).toBe(20); // Should match the number of columns in the table
      
      // Check a few specific columns
      const idColumn = result?.columns.find(c => c.name === 'id');
      expect(idColumn?.dataType).toBe('UUID');
      expect(idColumn?.isPrimaryKey).toBe(true);
      expect(idColumn?.defaultValue).toBe('functions.uuid_v7()');
      
      const contextColumn = result?.columns.find(c => c.name === 'context');
      expect(contextColumn?.dataType).toBe('TEXT');
      expect(contextColumn?.isNullable).toBe(false);
      expect(contextColumn?.defaultValue).toBe("''");
      
      const updatedAtColumn = result?.columns.find(c => c.name === 'updated_at');
      expect(updatedAtColumn?.dataType).toBe('TIMESTAMP WITH TIME ZONE');
      expect(updatedAtColumn?.defaultValue).toBe('CURRENT_TIMESTAMP');
    });
  });
});
