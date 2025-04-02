import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { SqlSyncConfig, DirectoryConfig, SourceConfig, FolderConfig } from '@/types/config';
import {
	ProcessedSection,
	ProcessedDirectory,
	ProcessedSqlFile,
	ProcessedStatement,
} from '@/types/processed-sql';
import { processSqlFile } from './sql-processor';
import { logger } from '@/utils/logger';

/**
 * Traverses the directories specified in the configuration, processes SQL files,
 * and returns structured data about the processed files and statements.
 *
 * @param config The loaded SqlSync configuration object.
 * @param baseDir The base directory from which section paths are relative.
 * @returns An array of ProcessedSection objects.
 * @throws Error if any SQL parsing errors are encountered
 */
export async function traverseDirectories(
	config: SqlSyncConfig,
	baseDir: string
): Promise<ProcessedSection[]> {
	console.log('Starting directory traversal...');
	const results: ProcessedSection[] = [];
	const parsingErrors: string[] = [];

	// Process legacy 'sources' configuration if present
	if (config.sources && typeof config.sources === 'object') {
		console.log('Processing legacy sources configuration...');
		try {
			const legacySections = await processLegacySources(config, baseDir, parsingErrors);
			results.push(...legacySections);
		} catch (error) {
			if (error instanceof Error) {
				parsingErrors.push(error.message);
			}
		}
	}

	// Process root-level folder configurations (schema, data, etc.)
	const knownRootProps = ['config', 'sources'];
	for (const [folderName, folderConfig] of Object.entries(config)) {
		if (knownRootProps.includes(folderName) || !folderConfig || typeof folderConfig !== 'object') {
			continue;
		}

		console.log(`Processing root folder: "${folderName}"...`);
		const rootPath = path.join(baseDir, folderName);
		
		if (!fs.existsSync(rootPath)) {
			console.warn(`Root folder does not exist: ${rootPath}. Skipping.`);
			continue;
		}

		const sectionResult: ProcessedSection = {
			sectionName: folderName,
			items: [],
		};
		
		try {
			sectionResult.items = await processFolderConfig(
				folderConfig as FolderConfig,
				rootPath,
				folderName,
				baseDir,
				parsingErrors
			);
			
			results.push(sectionResult);
		} catch (error) {
			if (error instanceof Error) {
				parsingErrors.push(error.message);
			}
		}
	}
	
	// Check if any parsing errors occurred
	if (parsingErrors.length > 0) {
		console.log(chalk.red('\n❌ SQL PARSING ERRORS DETECTED'));
		console.log(chalk.red('Fix the following errors before continuing:'));
		parsingErrors.forEach((error, index) => {
			console.log(chalk.red(`${index + 1}. ${error}`));
		});
		throw new Error('SQL parsing errors detected. Fix the errors before continuing.');
	}

	console.log('Directory traversal complete.');
	return results;
}

/**
 * Process legacy 'sources' configuration
 * 
 * @param config The loaded SqlSync configuration object
 * @param baseDir The base directory from which paths are relative
 * @param parsingErrors Array to collect parsing errors
 * @returns Array of processed sections
 */
async function processLegacySources(
	config: SqlSyncConfig,
	baseDir: string,
	parsingErrors: string[] = []
): Promise<ProcessedSection[]> {
	const results: ProcessedSection[] = [];

	for (const sourceName in config.sources) {
		console.log(`Processing legacy source: "${sourceName}"...`); 
		const sourceConfig: SourceConfig = config.sources![sourceName]; 
		const sectionResult: ProcessedSection = {
			sectionName: sourceName,
			items: [],
		};

		if (!sourceConfig || !Array.isArray(sourceConfig.order)) {
			console.warn(
				`Configuration warning: Source "${sourceName}" is invalid or missing the "order" array. Skipping this source.`
			);
			continue;
		}

		// Process items defined in the source's order array
		for (const item of sourceConfig.order) {
			let currentPath: string;
			let itemConfig: DirectoryConfig | undefined = undefined;

			if (typeof item === 'string') {
				currentPath = item;
			} else if (
				typeof item === 'object' &&
				item !== null &&
				typeof item.directoryPath === 'string'
			) {
				currentPath = item.directoryPath;
				itemConfig = item;
			} else {
				console.warn(
					`  - Skipping invalid item in order for source ${sourceName}:`,
					item
				);
				continue;
			}

			// FIX: Prefix the path with sourceName to make it relative to the source directory
			const prefixedPath = path.join(sourceName, currentPath);
			const absolutePath = path.resolve(baseDir, prefixedPath);
			
			if (fs.existsSync(absolutePath)) {
				const stats = fs.statSync(absolutePath);
				if (stats.isDirectory()) {
					console.log(
						`  - Processing DIRECTORY: ${prefixedPath} (Resolved: ${absolutePath})`
					);
					
					// Check if there's a specific configuration for this directory
					const dirName = path.basename(currentPath);
					const subdirConfig = sourceConfig[dirName as keyof typeof sourceConfig];
					if (subdirConfig && typeof subdirConfig === 'object' && 'order' in subdirConfig) {
						console.log(`    - Found specific configuration for ${dirName}`);
						
						// Process ordered subdirectories if specified
						const orderArray = subdirConfig.order;
						if (orderArray && Array.isArray(orderArray)) {
							console.log(`    - Processing ordered subdirectories for ${prefixedPath}`);
							
							for (const subItem of orderArray) {
								const subItemPath = path.join(absolutePath, subItem);
								const relativeSubItemPath = path.join(prefixedPath, subItem);
								
								if (!fs.existsSync(subItemPath)) {
									console.log(`      - Subdirectory ${relativeSubItemPath} does not exist, skipping.`);
									continue;
								}
								
								const subStats = fs.statSync(subItemPath);
								if (subStats.isDirectory()) {
									console.log(`      - Processing subdirectory: ${relativeSubItemPath}`);
									
									// Use orderedSubdirectoryFileOrder if available
									if ('orderedSubdirectoryFileOrder' in subdirConfig && 
										subdirConfig.orderedSubdirectoryFileOrder && 
										Array.isArray(subdirConfig.orderedSubdirectoryFileOrder)) {
										console.log(`        - Using orderedSubdirectoryFileOrder`);
										const processedSubdir = await processDirectoryWithFileOrder(
											subItemPath,
											relativeSubItemPath,
											subdirConfig.orderedSubdirectoryFileOrder,
											parsingErrors
										);
										
										if (processedSubdir && processedSubdir.files.length > 0) {
											sectionResult.items.push(processedSubdir);
										}
									} else {
										// No specific file ordering for this subdirectory
										const processedSubdir = await processDirectoryAlphabetically(
											subItemPath, 
											relativeSubItemPath,
											parsingErrors
										);
										
										if (processedSubdir && processedSubdir.files.length > 0) {
											sectionResult.items.push(processedSubdir);
										}
									}
								} else if (subStats.isFile() && path.extname(subItemPath).toLowerCase() === '.sql') {
									console.log(`      - Processing file in ordered directory: ${relativeSubItemPath}`);
									
									try {
										const processedFile = await processSqlFile(subItemPath, relativeSubItemPath);
										console.log(
											`        - Processed: ${processedFile.statements.length} statements, raw checksum: ${processedFile.rawFileChecksum.substring(0, 8)}`
										);
										
										const dirPath = path.dirname(relativeSubItemPath);
										let dirItem = sectionResult.items.find(
											(item) => 'files' in item && item.directoryPath === dirPath
										) as ProcessedDirectory | undefined;
										
										if (!dirItem) {
											dirItem = { directoryPath: dirPath, files: [] };
											sectionResult.items.push(dirItem);
										}
										
										dirItem.files.push(processedFile);
									} catch (error: any) {
										parsingErrors.push(`Error processing SQL file ${relativeSubItemPath}: ${error.message}`);
									}
								}
							}
						} else {
							// Fall back to alphabetical processing
							const processedDir = await processDirectoryAlphabetically(absolutePath, prefixedPath, parsingErrors);
							if (processedDir && processedDir.files.length > 0) {
								sectionResult.items.push(processedDir);
							}
						}
					} else {
						// No specific configuration, process alphabetically
						const processedDir = await processDirectoryAlphabetically(absolutePath, prefixedPath, parsingErrors);
						if (processedDir && processedDir.files.length > 0) {
							sectionResult.items.push(processedDir);
						} else {
							console.log(
								`    - Directory ${prefixedPath} resulted in no processed SQL files.`
							);
						}
					}
				} else if (
					stats.isFile() &&
					path.extname(absolutePath).toLowerCase() === '.sql'
				) {
					console.log(
						`  - Processing FILE (explicitly ordered): ${prefixedPath} (Resolved: ${absolutePath})`
					);
					try {
						const processedFile = await processSqlFile(absolutePath, prefixedPath);
						console.log(
							`        - Processed: ${processedFile.statements.length} statements, raw checksum: ${processedFile.rawFileChecksum.substring(0, 8)}`
						);
						
						const dirPath = path.dirname(prefixedPath);
						let dirItem = sectionResult.items.find(
							(item) => 'files' in item && item.directoryPath === dirPath
						) as ProcessedDirectory | undefined;

						if (!dirItem) {
							dirItem = { directoryPath: dirPath, files: [] };
							sectionResult.items.push(dirItem);
						}
						dirItem.files.push(processedFile);
					} catch (error: any) {
						parsingErrors.push(`Error processing SQL file ${prefixedPath}: ${error.message}`);
					}
				} else {
					console.warn(
						`  - Skipping item listed in order (not a directory or .sql file): ${prefixedPath}`
					);
				}
			} else {
				console.warn(
					`  - Skipping item listed in order (does not exist): ${prefixedPath}`
				);
			}
		}
		
		if (sectionResult.items.length > 0) {
			results.push(sectionResult);
		} else {
			console.log(`Source "${sourceName}" resulted in no processed items.`);
		}
	}

	return results;
}

/**
 * Process a folder according to the folder configuration
 * 
 * @param folderConfig The folder configuration object
 * @param folderPath The absolute path to the folder
 * @param relativeFolderPath The relative path to the folder
 * @param baseDir The base directory for resolving paths
 * @param parsingErrors Array to collect parsing errors
 * @returns Array of processed items (directories and files)
 */
async function processFolderConfig(
	folderConfig: FolderConfig,
	folderPath: string,
	relativeFolderPath: string,
	baseDir: string,
	parsingErrors: string[] = []
): Promise<(ProcessedSqlFile | ProcessedDirectory)[]> {
	const results: (ProcessedSqlFile | ProcessedDirectory)[] = [];

	// Check if the folder exists
	if (!fs.existsSync(folderPath)) {
		console.warn(`Folder does not exist: ${folderPath}. Skipping.`);
		return results;
	}

	// Process files/directories according to order if specified
	if (folderConfig.order && Array.isArray(folderConfig.order)) {
		console.log(`  - Processing folder with specified order: ${relativeFolderPath}`);
		
		for (const item of folderConfig.order) {
			const itemPath = path.join(folderPath, item);
			const relativeItemPath = path.join(relativeFolderPath, item);
			
			// Check if the item exists
			if (!fs.existsSync(itemPath)) {
				console.log(`    - Item does not exist (mentioned in order): ${relativeItemPath}. Skipping.`);
				continue;
			}

			const stats = fs.statSync(itemPath);
			
			if (stats.isFile() && path.extname(itemPath).toLowerCase() === '.sql') {
				// Process individual SQL file
				console.log(`    - Processing ordered FILE: ${relativeItemPath}`);
				try {
					const processedFile = await processSqlFile(itemPath, relativeItemPath);
					if (processedFile.error) {
						parsingErrors.push(`Error processing SQL file ${relativeItemPath}: ${processedFile.error}`);
					} else {
						const dirPath = path.dirname(relativeItemPath);
						let dirItem = results.find(
							(item) => 'files' in item && item.directoryPath === dirPath
						) as ProcessedDirectory | undefined;

						if (!dirItem) {
							dirItem = { directoryPath: dirPath, files: [] };
							results.push(dirItem);
						}
						dirItem.files.push(processedFile);
					}
				} catch (error: any) {
					parsingErrors.push(`Error processing SQL file ${relativeItemPath}: ${error.message}`);
				}
			} else if (stats.isDirectory()) {
				// Process subdirectory
				console.log(`    - Processing ordered DIRECTORY: ${relativeItemPath}`);
				
				// Check if there's a nested configuration for this subdirectory
				const subdirName = path.basename(itemPath);
				const subdirConfig = folderConfig[subdirName as keyof typeof folderConfig];
				if (subdirConfig && typeof subdirConfig === 'object' && 'order' in subdirConfig) {
					// Process with nested configuration
					const nestedItems = await processFolderConfig(
						subdirConfig as FolderConfig,
						itemPath,
						relativeItemPath,
						baseDir,
						parsingErrors
					);
					
					// Group files by directory
					for (const item of nestedItems) {
						if ('files' in item) {
							// It's a ProcessedDirectory
							results.push(item);
						} else {
							// It's a ProcessedSqlFile - should be wrapped in a directory
							const dirPath = path.dirname(item.filePath);
							let dirItem = results.find(
								(dirItem) => 'files' in dirItem && dirItem.directoryPath === dirPath
							) as ProcessedDirectory | undefined;

							if (!dirItem) {
								dirItem = { directoryPath: dirPath, files: [] };
								results.push(dirItem);
							}
							
							dirItem.files.push(item);
						}
					}
				} else {
					// Process subdirectory with orderedSubdirectoryFileOrder if specified
					if ('orderedSubdirectoryFileOrder' in folderConfig && 
						folderConfig.orderedSubdirectoryFileOrder && 
						Array.isArray(folderConfig.orderedSubdirectoryFileOrder)) {
						const processedDir = await processDirectoryWithFileOrder(
							itemPath,
							relativeItemPath,
							folderConfig.orderedSubdirectoryFileOrder,
							parsingErrors
						);
						
						if (processedDir && processedDir.files.length > 0) {
							results.push(processedDir);
						}
					} else {
						// No specific file ordering for subdirectory
						const processedDir = await processDirectoryAlphabetically(itemPath, relativeItemPath, parsingErrors);
						
						if (processedDir && processedDir.files.length > 0) {
							results.push(processedDir);
						}
					}
				}
			}
		}
	} else {
		// No order specified, process subdirectories according to their nested configurations
		const knownProps = ['order', 'orderedSubdirectoryFileOrder'];
		for (const [key, value] of Object.entries(folderConfig)) {
			if (knownProps.includes(key) || typeof value !== 'object') {
				continue;
			}
			
			const nestedFolderPath = path.join(folderPath, key);
			const relativeNestedPath = path.join(relativeFolderPath, key);
			
			if (!fs.existsSync(nestedFolderPath)) {
				console.log(`  - Nested folder does not exist: ${relativeNestedPath}. Skipping.`);
				continue;
			}
			
			console.log(`  - Processing nested folder: ${relativeNestedPath}`);
			
			const nestedItems = await processFolderConfig(
				value as FolderConfig, 
				nestedFolderPath, 
				relativeNestedPath, 
				baseDir,
				parsingErrors
			);
			
			results.push(...nestedItems);
		}
	}

	return results;
}

/**
 * Process a directory with specified file ordering
 * 
 * @param dirAbsolutePath The absolute path to the directory
 * @param dirRelativePath The relative path to the directory
 * @param fileOrder Array of file names in the order they should be processed
 * @param parsingErrors Array to collect parsing errors
 * @returns A ProcessedDirectory object
 */
async function processDirectoryWithFileOrder(
	dirAbsolutePath: string,
	dirRelativePath: string,
	fileOrder: string[],
	parsingErrors: string[] = []
): Promise<ProcessedDirectory> {
	console.log(`    - Processing directory with specific file order: ${dirRelativePath}`);
	
	const processedDir: ProcessedDirectory = {
		directoryPath: dirRelativePath,
		files: []
	};
	
	// Process files in the specified order
	for (const fileName of fileOrder) {
		const fileAbsolutePath = path.join(dirAbsolutePath, fileName);
		const fileRelativePath = path.join(dirRelativePath, fileName);
		
		if (!fs.existsSync(fileAbsolutePath)) {
			console.log(`      - File specified in order does not exist: ${fileRelativePath}. Skipping.`);
			continue;
		}
		
		const stats = fs.statSync(fileAbsolutePath);
		
		if (!stats.isFile() || path.extname(fileAbsolutePath).toLowerCase() !== '.sql') {
			console.log(`      - Not a SQL file: ${fileRelativePath}. Skipping.`);
			continue;
		}
		
		console.log(`      - Processing ordered file: ${fileName}`);
		
		try {
			const processedFile = await processSqlFile(fileAbsolutePath, fileRelativePath);
			if (processedFile.error) {
				parsingErrors.push(`Error processing SQL file ${fileRelativePath}: ${processedFile.error}`);
			} else {
				processedDir.files.push(processedFile);
			}
		} catch (error: any) {
			parsingErrors.push(`Error processing SQL file ${fileRelativePath}: ${error.message}`);
		}
	}
	
	return processedDir;
}

/**
 * Processes a single directory alphabetically, finding and processing all .sql files within it.
 * 
 * @param dirAbsolutePath The absolute path to the directory.
 * @param dirRelativePath The relative path to the directory (used for ProcessedFile paths).
 * @param parsingErrors Array to collect parsing errors
 * @returns A ProcessedDirectory object.
 */
async function processDirectoryAlphabetically(
	dirAbsolutePath: string,
	dirRelativePath: string,
	parsingErrors: string[] = []
): Promise<ProcessedDirectory> {
	const processedDir: ProcessedDirectory = {
		directoryPath: dirRelativePath,
		files: []
	};

	console.log(`    - Scanning directory for *.sql files alphabetically.`);
	try {
		const entries = fs.readdirSync(dirAbsolutePath, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.sql') {
				const fileAbsolutePath = path.resolve(dirAbsolutePath, entry.name);
				const fileRelativePath = path.join(dirRelativePath, entry.name);
				console.log(`      - Processing FILE (scanned): ${entry.name}`);
				
				try {
					const processedFile = await processSqlFile(
						fileAbsolutePath,
						fileRelativePath
					);
					if (processedFile.error) {
						parsingErrors.push(`Error processing SQL file ${fileRelativePath}: ${processedFile.error}`);
					} else {
						processedDir.files.push(processedFile);
					}
				} catch (error: any) {
					parsingErrors.push(`Error processing SQL file ${fileRelativePath}: ${error.message}`);
				}
			}
		}
	} catch (error: any) {
		console.error(
			`    - Error reading directory ${dirAbsolutePath}: ${error.message}`
		);
	}

	return processedDir;
}
