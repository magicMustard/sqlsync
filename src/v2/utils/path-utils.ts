import * as path from 'path';

/**
 * Converts an absolute path to a project-relative path
 * @param configFilePath Absolute path to the config file
 * @param absolutePath Absolute path to convert
 * @returns Path relative to the config directory
 */
export function toRelativePath(
	configFilePath: string,
	absolutePath: string
): string {
	const configDir = path.dirname(configFilePath);
	return path.relative(configDir, absolutePath);
}

/**
 * Converts a project-relative path to an absolute path
 * @param configFilePath Absolute path to the config file
 * @param relativePath Path relative to the config directory
 * @returns Absolute path
 */
export function toAbsolutePath(
	configFilePath: string,
	relativePath: string
): string {
	const configDir = path.dirname(configFilePath);
	return path.join(configDir, relativePath);
}
