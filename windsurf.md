# SQLSync Development Guide

## Current Development Focus

We've successfully enhanced the SQLSync project with improved rollback functionality, debugging capabilities, and fixed several issues with path handling and state management. Our next focus will be on testing these enhancements and cleaning up unused code.

### Fixed Issues (Complete)

- **Multi-developer Workflow Test**: Fixed in `collaboration-manager.test.ts` by properly tracking and accounting for migrations across multiple developers.
- **Declarative Tables Validation**: Fixed in `sql-processor.ts` to correctly validate CREATE TABLE statements when used with other SQL statements.
- **Error Message Format**: Updated in `split-statements.test.ts` to match the correct error message format from the implementation.
- **Mock Implementation**: Fixed `chalk` mock in `generate.test.ts` to properly support chained method calls like `chalk.red.bold()`.
- **Sync Command Tests**: Fixed issues in `sync.test.ts` by properly mocking the `detectPendingChanges` function and updating test assertions to match the actual behavior.
- **Directory Traversal**: Fixed how the directory traverser handles nested directory structures with source names as physical directories.
- **Path Handling**: Resolved inconsistencies between absolute and relative paths that caused false positives in change detection.

### Enhanced Rollback Functionality (Complete)

- **Migration-Name Based Rollback**: Implemented rollback that requires using migration filenames (instead of numeric indices) for clarity and safety.
- **Migration Protection**: Added the ability to mark/unmark migrations to prevent accidental rollbacks of critical changes.
- **Migration Listing**: Added `--list` option to display available migrations for rollback, ordered by timestamp. This can be used without specifying a migration name.
- **Rollback Confirmation**: Added interactive prompts for rollback operations with the option to bypass using `--force`.
- **Configuration Controls**: Added `maxRollbacks` option in config to limit the number of migrations that can be marked.
- **Delete After Rollback**: Added `--delete-files` option to allow physical removal of rolled back migration files with appropriate confirmation prompts.
- **Post-Rollback State Consistency**: Implemented proper file checksum rebuilding to ensure the system can continue operating correctly after rollback.

### Added Debug Capabilities (Complete)

- **Flexible Debug Utility**: Created a dedicated debugging framework that supports different output levels (basic, verbose).
- **Environment Detection**: Debug can be enabled via `SQLSYNC_DEBUG` environment variable or when running in development mode.
- **Command-line Control**: Added `--debug [level]` CLI option to enable debugging for a single command execution.
- **Consistent Debug Output**: Standardized debug output format and organization across the codebase.

### Simplified Merge Process (Complete)
- **Streamlined Sync Command**: Focused on the core capability of tracking migrations from all developers without complex conflict detection.
- **Reliable State Management**: Ensured state file properly records migration history and checksums from all developers.
- **Local vs. Global Tracking**: Maintained separation between all known migrations (state file) and locally applied migrations (local-applied file).

### Configuration Structure

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

### Upcoming Work: Testing and Cleanup

- **Goal**: Ensure all new features have appropriate test coverage
- **Test Cases Needed**:
  - Basic rollback behavior
  - File deletion during rollback
  - Post-rollback state consistency
  - Debug utility functionality
  - Path handling with mixed absolute/relative paths
- **Cleanup Tasks**:
  - Remove redundant code
  - Ensure consistent error handling
  - Standardize command interfaces

## Project Structure

### Core Components

- **SQL Processor** (`src/core/sql-processor.ts`): Handles SQL parsing, validation, and directives processing.
- **Directory Traverser** (`src/core/directory-traverser.ts`): Processes SQL files according to the directory structure defined in the config.
- **Config Loader** (`src/core/config-loader.ts`): Loads and validates the SQLSync configuration.
- **Diff Engine** (`src/core/diff-engine.ts`): Detects changes between current and previous states.
- **State Manager** (`src/core/state-manager.ts`): Maintains state across migrations and rollbacks.
- **Debug Utility** (`src/utils/debug.ts`): Provides configurable debugging capabilities.

### Command Implementations

- **Generate** (`src/commands/generate.ts`): Generates migration files based on detected changes.
- **Sync** (`src/commands/sync.ts`): Synchronizes migrations from other developers.
- **Status** (`src/commands/status.ts`): Shows the current status of SQL files and migrations.
- **Rollback** (`src/commands/rollback.ts`): Reverts previously applied migrations, with support for marking critical migrations and deletion of rolled back files.

## Testing Strategy

### Core Tests

- `sql-processor.test.ts`: Tests SQL parsing and validation logic
- `diff-engine.test.ts`: Tests change detection between states
- `declarative-tables.test.ts`: Tests CREATE TABLE validation and ALTER detection
- `split-statements.test.ts`: Tests statement-level tracking
- `state-manager.test.ts`: Tests state persistence and reconciliation

### Command Tests

- `generate.test.ts`: Tests migration generation with color-coded output
- `sync.test.ts`: Tests synchronization between multiple developers
- `rollback.test.ts`: Tests rollback functionality including migration protection and file deletion
