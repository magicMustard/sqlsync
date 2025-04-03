// Export commands that exist
export { syncCommand } from './commands/sync';
export { rollbackCommand } from './commands/rollback';
export { generateCommand } from './commands/generate';

// Export core functionality
export * from './core/sql-processor';
export * from './core/config-loader';
export * from './core/directory-traverser';
export * from './core/state-manager';
export * from './core/diff-engine';

// Export types
export * from './types/config';
export * from './types/processed-sql';
export * from './types/state';
