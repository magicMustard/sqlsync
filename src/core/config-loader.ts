import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SqlSyncConfig, FolderConfig, SourceConfig } from '@/types/config'; // Using path alias

const DEFAULT_CONFIG_FILENAME = 'sqlsync.yaml';

/**
 * Loads and parses the sqlsync configuration file.
 *
 * @param configPath Path to a specific config file. If not provided, looks for sqlsync.yaml in the current directory.
 * @returns The parsed and validated configuration object.
 * @throws Error if the file is not found, cannot be parsed, or is invalid.
 */
export function loadConfig(
	configPath: string = path.join(process.cwd(), DEFAULT_CONFIG_FILENAME)
): SqlSyncConfig {
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

	// Validate optional 'config' section
	if (parsedConfig.config) {
		if (typeof parsedConfig.config !== 'object') {
			throw new Error(
				`Invalid configuration in ${absoluteConfigPath}: "config" section should be an object.`
			);
		}
		
		// Validate migrations subsection if present
		if (parsedConfig.config.migrations) {
			if (typeof parsedConfig.config.migrations !== 'object') {
				throw new Error(
					`Invalid configuration in ${absoluteConfigPath}: "config.migrations" section should be an object.`
				);
			}
			
			// Ensure outputDir is specified for migrations
			if (!parsedConfig.config.migrations.outputDir) {
				throw new Error(
					`Invalid configuration in ${absoluteConfigPath}: "config.migrations.outputDir" is required.`
				);
			}
			
			// Validate cli section if present
			if (parsedConfig.config.migrations.cli) {
				if (typeof parsedConfig.config.migrations.cli !== 'object') {
					throw new Error(
						`Invalid configuration in ${absoluteConfigPath}: "config.migrations.cli" should be an object.`
					);
				}
			}
		}
		
		// Validate maxRollbacks if present
		if (parsedConfig.config.maxRollbacks !== undefined) {
			if (typeof parsedConfig.config.maxRollbacks !== 'number' || 
				parsedConfig.config.maxRollbacks < 1) {
				throw new Error(
					`Invalid configuration in ${absoluteConfigPath}: "config.maxRollbacks" should be a positive number.`
				);
			}
		}
	}

	// Validate sources if present (legacy format)
	if (parsedConfig.sources) {
		if (typeof parsedConfig.sources !== 'object') {
			throw new Error(
				`Invalid configuration in ${absoluteConfigPath}: "sources" should be an object.`
			);
		}
		
		// Check each source
		for (const [sourceName, source] of Object.entries(parsedConfig.sources)) {
			// Check source exists
			if (!source) {
				throw new Error(
					`Invalid configuration in ${absoluteConfigPath}: Source "${sourceName}" is null or undefined.`
				);
			}
			
			// Check if source is an object
			if (typeof source !== 'object') {
				throw new Error(
					`Invalid configuration in ${absoluteConfigPath}: Source "${sourceName}" should be an object.`
				);
			}
			
			// Check order array
			if (!Array.isArray((source as SourceConfig).order)) {
				throw new Error(
					`Invalid configuration in ${absoluteConfigPath}: "${sourceName}.order" should be an array.`
				);
			}
		}
	}
	
	// Validate root-level folder configurations
	// Skip known root properties like 'config' and 'sources'
	const knownRootProps = ['config', 'sources'];
	for (const [key, value] of Object.entries(parsedConfig)) {
		if (knownRootProps.includes(key)) {
			continue;
		}
		
		// Validate folder configuration
		validateFolderConfig(key, value, absoluteConfigPath);
	}

	return parsedConfig as SqlSyncConfig;
}

/**
 * Recursively validates a folder configuration
 * 
 * @param folderPath Path to the folder being validated (for error messages)
 * @param folderConfig The folder configuration to validate
 * @param configFilePath Path to the config file (for error messages)
 */
function validateFolderConfig(
	folderPath: string, 
	folderConfig: any, 
	configFilePath: string
): void {
	if (typeof folderConfig !== 'object') {
		throw new Error(
			`Invalid configuration in ${configFilePath}: "${folderPath}" should be an object.`
		);
	}
	
	// Validate order array if present
	if (folderConfig.order !== undefined) {
		if (!Array.isArray(folderConfig.order)) {
			throw new Error(
				`Invalid configuration in ${configFilePath}: "${folderPath}.order" should be an array.`
			);
		}
		
		// Check each item in the order array
		for (const item of folderConfig.order) {
			if (typeof item !== 'string') {
				throw new Error(
					`Invalid configuration in ${configFilePath}: Each item in "${folderPath}.order" should be a string.`
				);
			}
		}
	}
	
	// Validate orderedSubdirectoryFileOrder if present
	if (folderConfig.orderedSubdirectoryFileOrder !== undefined) {
		if (!Array.isArray(folderConfig.orderedSubdirectoryFileOrder)) {
			throw new Error(
				`Invalid configuration in ${configFilePath}: "${folderPath}.orderedSubdirectoryFileOrder" should be an array.`
			);
		}
		
		// Check each item in the order array
		for (const item of folderConfig.orderedSubdirectoryFileOrder) {
			if (typeof item !== 'string') {
				throw new Error(
					`Invalid configuration in ${configFilePath}: Each item in "${folderPath}.orderedSubdirectoryFileOrder" should be a string.`
				);
			}
		}
	}
	
	// Recursively validate child folders
	// Skip known properties like 'order' and 'orderedSubdirectoryFileOrder'
	const knownProps = ['order', 'orderedSubdirectoryFileOrder'];
	for (const [key, value] of Object.entries(folderConfig)) {
		if (knownProps.includes(key)) {
			continue;
		}
		
		// Recursively validate child folder
		validateFolderConfig(`${folderPath}.${key}`, value, configFilePath);
	}
}
