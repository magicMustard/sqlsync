# SQLSync Development Guide

## Current Development Focus

We've successfully fixed all test failures in the SQLSync project and implemented rollback functionality. Our next focus will be on adding comprehensive tests for the new rollback features.

### ✅ Fixed Issues (Complete)

- **Multi-developer Workflow Test**: Fixed in `collaboration-manager.test.ts` by properly tracking and accounting for migrations across multiple developers.
- **Declarative Tables Validation**: Fixed in `sql-processor.ts` to correctly validate CREATE TABLE statements when used with other SQL statements.
- **Error Message Format**: Updated in `split-statements.test.ts` to match the correct error message format from the implementation.
- **Mock Implementation**: Fixed `chalk` mock in `generate.test.ts` to properly support chained method calls like `chalk.red.bold()`.
- **Sync Command Tests**: Fixed issues in `sync.test.ts` by properly mocking the `detectPendingChanges` function and updating test assertions to match the actual behavior.
- **Directory Traversal**: Fixed how the directory traverser handles nested directory structures with source names as physical directories.

### ✅ Implemented Rollback Functionality (Complete)

- **Migration-Name Based Rollback**: Implemented rollback that requires using migration filenames (instead of numeric indices) for clarity and safety.
- **Migration Protection**: Added the ability to mark/unmark migrations to prevent accidental rollbacks of critical changes.
- **Migration Listing**: Added `--list` option to display available migrations for rollback, ordered by timestamp. This can be used without specifying a migration name.
- **Rollback Confirmation**: Added interactive prompts for rollback operations with the option to bypass using `--force`.
- **Configuration Controls**: Added `maxRollbacks` option in config to limit the number of migrations that can be marked.
- **Improved CLI Interface**: Updated the command to make migration names optional when listing migrations (`sqlsync rollback --list`).

### 🏗️ Configuration Structure

SQLSync uses a sophisticated configuration structure to support complex nested directories:

```yaml
# sqlsync.yaml
config:
  migrations:
    outputDir: ./migrations
    maxRollbacks: 3
sources:
  schema:  # Logical section name
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

**Key Configuration Elements:**

1. **Sources**: The top-level `sources` key defines logical sections for organizing SQL files. Each section name (like "schema") can correspond to a physical directory but doesn't have to.

2. **Order Arrays**: The `order` arrays specify the exact processing sequence for files and directories. Items in these arrays are mandatory - SQLSync will warn if they don't exist.

3. **orderedSubdirectoryFileOrder**: This powerful feature defines a consistent file processing order across multiple similar subdirectories. For example, when applied to the `tables` section, it ensures that all table subdirectories (users, products, etc.) process their files in the same order (types → table → rls → indexes). Files in this array are optional - if they don't exist in a particular subdirectory, SQLSync will simply skip them.

4. **Nested Configurations**: Each subdirectory can have its own configuration for further customization.

### 🚧 Upcoming Work: Rollback Testing

- **Goal**: Create comprehensive tests for the rollback functionality
- **Test Cases Needed**:
  - Basic rollback behavior
  - Marking/unmarking migrations
  - Listing available migrations
  - Handling errors (marked migrations, invalid names)
  - Configuration limits (maxRollbacks)

## Project Structure

### Core Components

- **SQL Processor** (`src/core/sql-processor.ts`): Handles SQL parsing, validation, and directives processing.
- **Collaboration Manager** (`src/core/collaboration-manager.ts`): Manages multi-developer collaboration, including synchronization and conflict detection.
- **Directory Traverser** (`src/core/directory-traverser.ts`): Processes SQL files according to the directory structure defined in the config.
- **Config Loader** (`src/core/config-loader.ts`): Loads and validates the SQLSync configuration.

### Command Implementations

- **Generate** (`src/commands/generate.ts`): Generates migration files based on detected changes.
- **Sync** (`src/commands/sync.ts`): Synchronizes migrations from other developers.
- **Status** (`src/commands/status.ts`): Shows the current status of SQL files and migrations.
- **Rollback** (`src/commands/rollback.ts`): Reverts previously applied migrations, with support for marking critical migrations.

## Testing Strategy

### Core Tests

- `sql-processor.test.ts`: Tests SQL parsing and validation logic
- `collaboration-manager.test.ts`: Tests multi-developer workflows
- `declarative-tables.test.ts`: Tests CREATE TABLE validation and ALTER detection
- `split-statements.test.ts`: Tests statement-level tracking

### Command Tests

- `generate.test.ts`: Tests migration generation with color-coded output
- `sync.test.ts`: Tests synchronization between multiple developers
- `rollback.test.ts` (to be created): Will test the rollback functionality

## Key Features Implementation

### Declarative Tables

Files with `-- sqlsync: declarativeTable=true` are processed to:
1. Validate they contain exactly one CREATE TABLE statement
2. Track the table structure
3. Generate ALTER TABLE statements when the structure changes

### Multi-developer Collaboration

The `collaboration-manager.ts` implements:
1. State tracking with checksums for each SQL file
2. Migration synchronization across developers
3. Conflict detection when multiple developers change the same file

### Color-coded Output

The `generate` command uses chalk to provide color-coded output:
- 🟢 Green for added items
- 🟡 Yellow for modified items
- 🔴 Red for deleted items with explicit warnings about DROP statements

### Rollback Functionality

The `rollback` command implements:
1. Migration-based rollback that requires explicit migration names
2. Protection of critical migrations through marking
3. Interactive confirmation for safety with `--force` override
4. Clear listing of available migrations for rollback

## Development Workflow

1. Make changes to code or tests
2. Run specific tests: `npx jest tests/path/to/test.ts`
3. Fix failing tests
4. Run all tests: `npm test`
5. Build the project: `npm run build`

## Testing Tips

- Use `console.log()` statements inside tests for debugging
- Run individual test cases with: `npx jest -t "test case description"`
- Check the actual vs. expected outputs in test failure messages
