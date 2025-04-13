// config/index.ts

/**
 * ConfigLoader class for loading and validating sqlsync.yaml configuration files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { logger } from '../utils/logger';
import {
	SqlSyncConfig,
	FolderConfig,
	ConfigLoader as ConfigLoaderInterface,
} from './types';

/**
 * Default configuration filename.
 */
const DEFAULT_CONFIG_FILENAME = 'sqlsync.yaml';

/**
 * ConfigLoader implements the ConfigLoader interface from CLI types,
 * providing functionality to load and validate configuration from a yaml file.
 */
export class ConfigLoader implements ConfigLoaderInterface {
	/**
	 * Loads the configuration from the specified path or defaults to sqlsync.yaml in the current directory.
	 * @param configPath Path to the configuration file. If not provided, defaults to sqlsync.yaml in the current directory.
	 * @returns The parsed and validated SqlSyncConfig object.
	 * @throws Error if the file is not found, cannot be parsed, or is invalid.
	 */
	public loadConfig(
		configPath: string = path.join(process.cwd(), DEFAULT_CONFIG_FILENAME)
	): SqlSyncConfig {
		console.log(
			`[DEBUG config/index.ts] loadConfig received raw configPath: ${configPath}`
		);
		const absoluteConfigPath = path.resolve(configPath);
		console.log(`Loading config from: ${absoluteConfigPath}`);
		if (!fs.existsSync(absoluteConfigPath)) {
			throw new Error(`Configuration file not found at ${absoluteConfigPath}`);
		}

		const fileContents = fs.readFileSync(absoluteConfigPath, 'utf8');
		let parsedConfig: any;
		try {
			parsedConfig = yaml.load(fileContents);
		} catch (e: any) {
			throw new Error(
				`Error parsing YAML file ${absoluteConfigPath}: ${e.message}`
			);
		}

		if (!parsedConfig || typeof parsedConfig !== 'object') {
			throw new Error(
				`Invalid configuration format in ${absoluteConfigPath}: Expected an object.`
			);
		}

		// Perform validation
		this.validateConfig(parsedConfig, absoluteConfigPath);

		// Log success message in green
		logger.success(
			`Configuration successfully loaded from ${absoluteConfigPath}`
		);

		return parsedConfig as SqlSyncConfig;
	}

	/**
	 * Validates the configuration object to ensure it meets the required structure and types.
	 * @param config The configuration object to validate.
	 * @param configPath The path to the configuration file (for error messages).
	 * @throws Error if the configuration is invalid.
	 */
	private validateConfig(config: any, configPath: string): void {
		// Validate top-level config object
		if (!config.config || typeof config.config !== 'object') {
			throw new Error(
				`Invalid configuration in ${configPath}: "config" object is required.`
			);
		}

		// Validate config.migrations
		if (
			!config.config.migrations ||
			typeof config.config.migrations !== 'object'
		) {
			throw new Error(
				`Invalid configuration in ${configPath}: "config.migrations" object is required.`
			);
		}

		if (!config.config.migrations.outputDir) {
			throw new Error(
				`Invalid configuration in ${configPath}: "config.migrations.outputDir" is required.`
			);
		}

		if (typeof config.config.migrations.outputDir !== 'string') {
			throw new Error(
				`Invalid configuration in ${configPath}: "config.migrations.outputDir" should be a string.`
			);
		}

		if (
			config.config.migrations.maxRollbacks !== undefined &&
			typeof config.config.migrations.maxRollbacks !== 'number'
		) {
			throw new Error(
				`Invalid configuration in ${configPath}: "config.migrations.maxRollbacks" should be a number.`
			);
		}

		// Validate schema
		if (!config.schema || typeof config.schema !== 'object') {
			throw new Error(
				`Invalid configuration in ${configPath}: "schema" object is required.`
			);
		}
	}

	/**
	 * Validates a folder configuration to ensure it meets the required structure and does not contain nested folders.
	 * @param folderConfig The folder configuration to validate.
	 * @param folderPath The path to the folder in the configuration (for error messages).
	 * @param configPath The path to the configuration file (for error messages).
	 * @throws Error if the folder configuration is invalid.
	 */
	private validateFolderConfig(
		folderConfig: any,
		folderPath: string,
		configPath: string
	): void {
		if (typeof folderConfig !== 'object') {
			throw new Error(
				`Invalid configuration in ${configPath}: "${folderPath}" should be an object.`
			);
		}

		if (folderConfig.order) {
			if (!Array.isArray(folderConfig.order)) {
				throw new Error(
					`Invalid configuration in ${configPath}: "${folderPath}.order" should be an array.`
				);
			}

			if (!folderConfig.order.every((item: any) => typeof item === 'string')) {
				throw new Error(
					`Invalid configuration in ${configPath}: All elements in "${folderPath}.order" should be strings.`
				);
			}
		}

		if (folderConfig.folders) {
			throw new Error(
				`Invalid configuration in ${configPath}: Nested folders are not allowed in "${folderPath}".`
			);
		}
	}
}
