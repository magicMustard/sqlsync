import * as fs from 'fs';
import * as path from 'path';
import { Schema } from '../config/types';
import { logger } from '../../utils/logger';

/**
 * FileLoader is responsible for loading and validating files based on the Schema configuration.
 * It ensures that mandatory files and folders specified in the 'order' attribute exist,
 * and prepares an ordered structure for SchemaFiles to process.
 */
export class FileLoader {
	private schema: Schema;
	private basePath: string;

	constructor(schema: Schema, basePath: string = process.cwd()) {
		this.schema = schema;
		this.basePath = basePath;
	}

	/**
	 * Loads and validates the schema configuration, returning an ordered structure of files and folders.
	 * @returns An object representing the ordered structure of files and folders.
	 * @throws Error if mandatory files or folders are missing.
	 */
	public loadSchema(): Record<string, any> {
		const schemaStructure: Record<string, any> = {};

		// Process each top-level key in schema (e.g., roles, tables, seeds)
		for (const [key, value] of Object.entries(this.schema)) {
			if (
				value &&
				typeof value === 'object' &&
				'order' in value &&
				Array.isArray(value.order)
			) {
				schemaStructure[key] = {
					order: this.validateAndResolveOrder(key, value.order, this.basePath),
					orderedSubdirectoryFileOrder:
						value.orderedSubdirectoryFileOrder || [],
				};
			} else {
				schemaStructure[key] = value;
			}
		}

		return schemaStructure;
	}

	/**
	 * Validates the existence of files and folders in the specified order array.
	 * @param category The parent key in the schema for error messaging.
	 * @param orderArray Array of file or folder names to validate.
	 * @param basePath The base path to resolve the files and folders.
	 * @returns Array of resolved paths for the ordered items.
	 * @throws Error if a mandatory file or folder is missing or if a file does not end with .sql.
	 */
	private validateAndResolveOrder(
		category: string,
		orderArray: string[],
		basePath: string
	): string[] {
		return orderArray.map((item) => {
			const resolvedPath = path.resolve(basePath, category, item);
			if (!fs.existsSync(resolvedPath)) {
				const errorMessage = `Missing mandatory file or folder '${item}' in '${category}'`;
				logger.error(errorMessage);
				throw new Error(errorMessage);
			}
			// Check if the item is a file and does not end with .sql
			const stat = fs.statSync(resolvedPath);
			if (stat.isFile() && !item.endsWith('.sql')) {
				const errorMessage = `Invalid file type in '${category}': '${item}' must be a .sql file`;
				logger.error(errorMessage);
				throw new Error(errorMessage);
			}
			return resolvedPath;
		});
	}
}
