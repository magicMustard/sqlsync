/**
 * Configuration related to external migration tools (e.g., Flyway, Liquibase).
 * Defines commands for different migration actions.
 */
export interface MigrationCliCommands {
  create?: string; // Command to create a new migration
  up?: string;     // Command to apply migrations
  latest?: string; // Command to migrate to the latest version
  migrate?: string; // Command to execute a specific migration script
  info?: string; // Command to get current migration status
  // Add other commands as needed (e.g., baseline, repair)
}

/**
 * Interface for folder configuration that can contain child folders
 * with their own configurations
 */
export interface FolderConfig {
  /**
   * Specifies the processing order for files and subdirectories within this folder
   */
  order?: string[];

  /**
   * Specifies the order of files in immediate subdirectories
   */
  orderedSubdirectoryFileOrder?: string[];

  /**
   * Optional child folder configurations
   * This allows for nested folder structures with their own configurations
   */
  [folderName: string]: FolderConfig | string[] | undefined;
}

/**
 * Configuration for a specific directory to be processed within a section.
 * Can potentially hold directory-specific rules in the future.
 */
export interface DirectoryConfig {
  directoryPath: string;
  // Future options: exclude patterns, specific file order within this dir?
}

/**
 * Configuration for a processing source (e.g., "schema", "data").
 * Replaces the old "SectionConfig".
 */
export interface SourceConfig {
  /**
   * Specifies the processing order for files and subdirectories within this source's root.
   * Items can be filenames (string) or DirectoryConfig objects.
   */
  order: (string | DirectoryConfig)[];

  // Flags removed - will be controlled via file comments
  // declarativeTable?: boolean;
  // splitStatements?: boolean;
}

// Main configuration structure loaded from yaml
export interface SqlSyncConfig {
  /**
   * General configuration options for SQLSync itself.
   */
  config?: {
    /**
     * Configuration related to migration file generation.
     */
    migrations?: {
      /**
       * The directory where generated migration SQL files should be saved.
       * Path is relative to the sqlsync.yaml file.
       * Required if the 'config.migrations' section exists.
       */
      outputDir: string;

      /**
       * Optional: Commands for interacting with an external migration tool.
       */
      cli?: MigrationCliCommands;
    };
    
    /**
     * Optional: Maximum number of rollbacks supported.
     * When set, limits how many previous migrations can be rolled back.
     * Default is unlimited if not specified.
     */
    maxRollbacks?: number;
    
    // Add other general config options here if needed
  };

  /**
   * Defines named sources (groups) of SQL files/directories to process.
   * Legacy format - maintained for backward compatibility
   */
  sources?: Record<string, SourceConfig>;

  /**
   * Root-level folders with their own nested configurations
   * This allows for folder structures with configurable ordering
   */
  [folderName: string]: FolderConfig | Record<string, unknown> | undefined;
}
