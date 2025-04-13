// config/types.ts

/**
 * Configuration related to external migration tools (e.g., Flyway, Liquibase).
 * Defines commands for different migration actions.
 */
export interface MigrationCliCommands {
	create?: string; // Command to create a new migration
	up?: string; // Command to apply migrations
}

/**
 * The root directory containing the SQL structure of the database.
 */
export interface Schema {
	[folderName: string]: FolderConfig;
}

/**
 * Interface for folder configuration that can contain child folders
 * with their own configurations.
 */
export interface FolderConfig {
	/**
	 * Specifies the processing order for files and subdirectories within this folder.
	 */
	order?: string[];

	/**
	 * Specifies the order of files in immediate subdirectories.
	 */
	orderedSubdirectoryFileOrder?: string[];

	/**
	 * Optional child folder configurations.
	 * This allows for nested folder structures with their own configurations.
	 */
	[folderName: string]: FolderConfig | string[] | undefined;
}

/**
 * Main configuration structure loaded from sqlsync.yaml.
 */
export interface SqlSyncConfig {
	/**
	 * General configuration options.
	 */
	config: {
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
	};

	schema: Schema;
}

export interface ConfigLoader {
	loadConfig(configPath: string): SqlSyncConfig;
}
