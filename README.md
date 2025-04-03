# SQLSync

> A modern SQL migration tool with declarative schema management

**⚠️ ALPHA STATUS**: SQLSync is currently in alpha testing. The API and features may change significantly between versions.

SQLSync simplifies database schema evolution by allowing a declarative approach to table management, reducing manual SQL migration writing and improving database change reliability.

## Notice
Project is written in conjunction with AI. AI being the main developer.

## Purpose & Approach

SQLSync addresses several key challenges in database schema evolution:

1. **Complements Existing Migration Tools**: SQLSync is not designed to replace or directly migrate changes to a database. Instead, it works alongside existing migration tools (like Supabase migrations or Flyway) to generate migration files that these tools can execute.

2. **Tracks Changes Throughout Development**: A common challenge with database development is losing track of incremental changes during the development lifecycle. SQLSync addresses this by breaking down the structure of your database using SQL, making it easy to see what changed and when.

3. **Leverages Non-Destructive SQL**: Many SQL operations can be written to be non-destructive (e.g., `CREATE INDEX IF NOT EXISTS`). SQLSync takes advantage of this to generate safe migrations that won't disrupt existing data or structures.

4. **Simplifies Table Column Changes**: Tracking alterations to table columns is particularly difficult with traditional approaches. SQLSync's declarative table feature lets you simply edit the `CREATE TABLE` statement, and any changes are automatically detected and translated into the appropriate `ALTER TABLE` statements in the migration file.

## Key Features

### 🔄 Declarative Table Management

Define your database tables once, with automatic migration generation when they change:

```sql
-- sqlsync: declarativeTable=true
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

SQLSync handles declarative tables with incremental schema changes:
- For new tables: The initial migration includes the full CREATE TABLE statement
- For existing tables: Any changes to columns will generate the appropriate ALTER TABLE statements:
  - Added columns → ALTER TABLE ADD COLUMN
  - Modified columns → ALTER TABLE ALTER COLUMN
  - Removed columns → ALTER TABLE DROP COLUMN

### 📝 Statement Splitting for Data Migrations

```sql
-- sqlsync: splitStatements=true

-- Each statement is tracked individually
INSERT INTO categories (name) VALUES ('Electronics');
INSERT INTO categories (name) VALUES ('Books');
INSERT INTO categories (name) VALUES ('Clothing');
```

When you add new statements, only those new statements will be included in the migration. SQLSync will attempt to automatically detect the boundaries between statements, but for complex SQL (such as function definitions with embedded dollar quotes or complex syntax), you can explicitly mark statement boundaries:

```sql
-- sqlsync: splitStatements=true

-- sqlsync: startStatement
CREATE FUNCTION my_complex_function() RETURNS ...
$$ 
BEGIN
  -- Complex code with multiple $$ or nested statements
END;
$$ LANGUAGE plpgsql;
-- sqlsync: endStatement

-- Next statement follows...
```

When statement splitting is disabled (the default behavior), SQLSync treats the entire file as a single unit, and any change to the file will cause the entire file to be included in the migration.

### 🗂️ Sophisticated Directory Structure Support

SQLSync supports complex nested directories with flexible configuration:

```yaml
# sqlsync.yaml
sources:
  schema:  # This is a logical section, not necessarily a physical directory
    order:
      - schemas.sql  # Process this file first
      - functions    # Then process this directory
      - tables       # Then process this directory
    functions:
      order:
        - update_timestamp.sql  # Process specific files in this order
    tables:
      order:
        - users       # Process these subdirectories in this order
        - products
        - categories
      orderedSubdirectoryFileOrder:  # Process files in each subdirectory in this order
        - types.sql
        - table.sql
        - rls.sql
        - indexes.sql
```

This configuration provides several key benefits:
- **Logical Organization**: Define logical sections that can map to physical directories
- **Processing Control**: Specify the exact order for processing files and directories
- **Subdirectory File Ordering**: Use `orderedSubdirectoryFileOrder` to process files in each subdirectory in the same consistent order
- **Optional Files**: Files listed in `orderedSubdirectoryFileOrder` are optional - if they don't exist, SQLSync simply skips them
- **Standardized Structure**: Apply the same file processing order to multiple similar directories (like table subdirectories)

### 👥 Multi-Developer Collaboration

SQLSync supports multiple developers working simultaneously on the same database:

- **Independent Development**: Developers can work independently on different aspects of the database schema
- **Migration Sharing**: Developers can share migrations with teammates by committing them to version control
- **State Synchronization**: The `sync` command updates the local state file to recognize migrations from other team members
- **Schema Comparison**: SQLSync detects when the current schema differs from the locally applied migrations
- **Conflict Resolution**: When conflicts occur (e.g., different developers modifying the same table differently), SQLSync helps identify discrepancies and generates appropriate ALTER statements to resolve them

```bash
# View current status compared to applied migrations
sqlsync status

# Recognize migrations from other developers
sqlsync sync

# Generate new migrations after resolving conflicts
sqlsync generate resolve-conflict
```

SQLSync uses color-coded output to make changes clear:
- 🟢 Green for added items
- 🟡 Yellow for modified items
- 🔴 Red for deleted items

### 🛡️ Safety-First Migrations

- ✅ **Non-destructive changes** (CREATE, ADD, ALTER) are automatically included
- ⚠️ **Destructive operations** require explicit user action
- 🚨 Clear warnings highlight when manual intervention might be needed

### 🔙 Migration Rollback Support

Roll back migrations when needed with built-in protection for critical changes:

```bash
# List available migrations for rollback
sqlsync rollback --list

# Roll back to a specific migration (that migration and all newer ones will be rolled back)
sqlsync rollback 20250401_add_users.sql

# Roll back and delete the rolled back migration files
sqlsync rollback 20250401_add_users.sql --delete-files

# Mark a migration to prevent accidental rollback
sqlsync rollback 20250401_add_users.sql --mark

# Unmark a previously protected migration
sqlsync rollback 20250401_add_users.sql --unmark
```

The system ensures state consistency after rollback, allowing development to continue smoothly.

### 🐞 Debug Support

SQLSync includes a powerful debug utility to help troubleshoot issues:

```bash
# Enable basic debugging information
sqlsync <command> --debug

# Enable verbose debugging with more detailed information
sqlsync <command> --debug verbose
```

Debug output can be controlled through:
- Command-line flag: `--debug [basic|verbose]`
- Environment variable: `SQLSYNC_DEBUG=true`
- Development mode: Automatically enabled when `NODE_ENV=development`

### 🎨 Enhanced CLI Experience

- Color-coded output shows exactly what changed:
  - **Green**: Added items (tables, columns, statements)
  - **Yellow**: Modified items (column types, constraints)
  - **Red**: Deleted items (with warnings about manual intervention)

## Installation

```bash
npm install -g sqlsync
```

## Quick Start

1. Create a configuration file `sqlsync.yaml` in your project root:

```yaml
# sqlsync.yaml
config:
  migrations:
    outputDir: migrations  # Relative to this config file's location

sources:
  schema:
    order:
      - tables
      - functions
    tables:
      order:
        - users
        - products
      orderedSubdirectoryFileOrder:
        - table.sql
        - rls.sql
        - indexes.sql
    functions:
      order:
        - update_timestamp.sql  # Process specific files in this order
```

2. Create your SQL files according to the directory structure defined in your configuration:

```
/project
├── sqlsync.yaml
├── migrations/
└── schema/
    ├── tables/
    │   ├── users/
    │   │   ├── table.sql        # -- sqlsync: declarativeTable=true
    │   │   └── indexes.sql
    │   └── products/
    │       ├── table.sql        # -- sqlsync: declarativeTable=true  
    │       └── data.sql         # -- sqlsync: splitStatements=true
    └── functions/
        └── user_functions.sql   # -- sqlsync: splitStatements=true
```

3. Generate migrations after making changes to your SQL files:

```bash
sqlsync generate add_user_table
```

4. Review the generated migration in the `migrations` directory and apply it using your preferred database migration tool.

## Configuration Options

The `sqlsync.yaml` file supports:

```yaml
config:
  migrations:
    outputDir: './migrations' # Where migrations are saved
    cli: # Optional external tool integration
      latest: 'npx sequelize-cli db:migrate'
      migrate: 'npx sequelize-cli db:migrate --name'
  maxRollbacks: 5 # Optional limit on how many migrations can be rolled back or marked
sources: # Sources of SQL files
  schema: # Source name
    order: # Processing order (files/directories)
      - 'schema/tables' # Directory path
      - 'schema/views'
  data:
    order:
      - 'data/seed'
```

## SQL File Directives

Add these directives as comments in your SQL files:

| Directive                           | Description                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `-- sqlsync: declarativeTable=true` | Treats the file as a declarative table definition. Requires exactly one CREATE TABLE statement per file. |
| `-- sqlsync: splitStatements=true`  | Tracks each SQL statement in the file separately. Ideal for data files with multiple INSERT statements.  |
| `-- sqlsync: startStatement`        | Explicitly marks the start of a statement when using statement splitting with complex SQL.               |
| `-- sqlsync: endStatement`          | Explicitly marks the end of a statement when using statement splitting with complex SQL.                 |

## Commands

| Command                                  | Description                                        |
| ---------------------------------------- | -------------------------------------------------- |
| `sqlsync init`                           | Creates a default configuration                    |
| `sqlsync generate <migration-name>`      | Generates migration files based on changes         |
| `sqlsync generate <n> --no-mark-applied` | Generate without marking as locally applied        |
| `sqlsync status`                         | Shows current status of SQL files vs state         |
| `sqlsync sync`                           | Synchronizes with migrations from other developers |
| `sqlsync rollback <migration-name>`      | Rolls back to a specific migration (inclusive)     |
| `sqlsync rollback --list`                | Lists migrations available for rollback            |
| `sqlsync rollback <n> --mark`            | Marks a migration to prevent accidental rollback   |
| `sqlsync rollback <n> --unmark`          | Unmarks a previously protected migration           |
| `sqlsync rollback <n> --delete-files`    | Deletes the rolled back migration files            |
| `sqlsync rollback <n> --force`           | Skips confirmation prompts during rollback         |
| `sqlsync mark-applied <migration-name>`  | Marks a migration as applied locally               |
| `sqlsync mark-applied all`               | Marks all migrations as applied locally            |
| `sqlsync migrate`                        | Runs migrations (if external tool configured)      |
| `sqlsync --debug [level]`                | Enables debug output (levels: basic, verbose)      |

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run specific test suite
npx jest tests/core/collaboration-manager.test.ts

# Run a specific test case
npx jest -t "should support multiple developers working simultaneously"

# Build
npm run build
```

### Testing Architecture

SQLSync tests are organized into the following categories:

- **Core Tests**: Validate the fundamental components
  - `sql-processor.test.ts`: Tests SQL parsing and validation logic
  - `collaboration-manager.test.ts`: Tests multi-developer workflows
  - `declarative-tables.test.ts`: Tests CREATE TABLE validation and ALTER detection
  - `split-statements.test.ts`: Tests statement-level tracking

- **Command Tests**: Validate the CLI commands
  - `generate.test.ts`: Tests migration generation with color-coded output
  - `sync.test.ts`: Tests synchronization between multiple developers

When adding new features, please ensure all tests pass by running `npm test`.

## License

MIT
