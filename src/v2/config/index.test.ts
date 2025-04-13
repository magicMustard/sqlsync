// config/index.test.ts

/**
 * Unit tests for ConfigLoader class.
 */

import { ConfigLoader } from './index';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

jest.mock('fs');
jest.mock('path');
jest.mock('js-yaml');
jest.mock('../utils/logger', () => ({
	logger: {
		success: jest.fn(),
	},
}));

describe('ConfigLoader', () => {
	let configLoader: ConfigLoader;
	const mockCwd = '/home/user/project';
	const defaultConfigPath = path.join(mockCwd, 'sqlsync.yaml');

	beforeEach(() => {
		configLoader = new ConfigLoader();
		jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);
		jest.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
		jest.spyOn(path, 'resolve').mockImplementation((p) => `/resolved/${p}`);
		jest.spyOn(fs, 'existsSync').mockReturnValue(true);
		jest.spyOn(fs, 'readFileSync').mockReturnValue('mocked content');
		jest.spyOn(yaml, 'load').mockReturnValue({
			config: {
				migrations: {
					outputDir: 'migrations',
				},
			},
			schema: {
				tables: { order: ['create_table.sql'] },
			},
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should load configuration from default path if none provided', () => {
		const result = configLoader.loadConfig();
		expect(fs.readFileSync).toHaveBeenCalledWith(
			'/resolved//home/user/project/sqlsync.yaml',
			'utf8'
		);
		expect(result).toBeDefined();
		expect(result.config).toBeDefined();
		expect(result.schema).toBeDefined();
	});

	it('should load configuration from specified path', () => {
		const customPath = '/path/to/custom.yaml';
		const result = configLoader.loadConfig(customPath);
		expect(fs.readFileSync).toHaveBeenCalledWith(
			`/resolved/${customPath}`,
			'utf8'
		);
		expect(result).toBeDefined();
		expect(result.config).toBeDefined();
		expect(result.schema).toBeDefined();
	});

	it('should throw error if configuration file does not exist', () => {
		jest.spyOn(fs, 'existsSync').mockReturnValue(false);
		expect(() => configLoader.loadConfig('/nonexistent.yaml')).toThrow(
			'Configuration file not found at /resolved//nonexistent.yaml'
		);
	});

	it('should throw error if YAML parsing fails', () => {
		jest.spyOn(yaml, 'load').mockImplementation(() => {
			throw new Error('YAML parse error');
		});
		expect(() => configLoader.loadConfig('/invalid.yaml')).toThrow(
			'Error parsing YAML file /resolved//invalid.yaml: YAML parse error'
		);
	});

	it('should throw error if configuration is not an object', () => {
		jest.spyOn(yaml, 'load').mockReturnValue('not an object');
		expect(() => configLoader.loadConfig('/notobject.yaml')).toThrow(
			'Invalid configuration format in /resolved//notobject.yaml: Expected an object.'
		);
	});

	it('should throw error if config object is missing', () => {
		jest.spyOn(yaml, 'load').mockReturnValue({ schema: {} });
		expect(() => configLoader.loadConfig('/noconfig.yaml')).toThrow(
			'Invalid configuration in /resolved//noconfig.yaml: "config" object is required.'
		);
	});

	it('should throw error if migrations object is missing', () => {
		jest.spyOn(yaml, 'load').mockReturnValue({ config: {}, schema: {} });
		expect(() => configLoader.loadConfig('/nomigrations.yaml')).toThrow(
			'Invalid configuration in /resolved//nomigrations.yaml: "config.migrations" object is required.'
		);
	});

	it('should throw error if migrations outputDir is missing', () => {
		jest
			.spyOn(yaml, 'load')
			.mockReturnValue({ config: { migrations: {} }, schema: {} });
		expect(() => configLoader.loadConfig('/nooutputdir.yaml')).toThrow(
			'Invalid configuration in /resolved//nooutputdir.yaml: "config.migrations.outputDir" is required.'
		);
	});

	it('should throw error if migrations outputDir is not a string', () => {
		jest.spyOn(yaml, 'load').mockReturnValue({
			config: { migrations: { outputDir: 123 } },
			schema: {},
		});
		expect(() => configLoader.loadConfig('/invalidoutputdir.yaml')).toThrow(
			'Invalid configuration in /resolved//invalidoutputdir.yaml: "config.migrations.outputDir" should be a string.'
		);
	});

	it('should throw error if maxRollbacks is not a number', () => {
		jest.spyOn(yaml, 'load').mockReturnValue({
			config: {
				migrations: { outputDir: 'migrations', maxRollbacks: 'not a number' },
			},
			schema: {},
		});
		expect(() => configLoader.loadConfig('/invalidmaxrollbacks.yaml')).toThrow(
			'Invalid configuration in /resolved//invalidmaxrollbacks.yaml: "config.migrations.maxRollbacks" should be a number.'
		);
	});

	it('should throw error if schema object is missing', () => {
		jest
			.spyOn(yaml, 'load')
			.mockReturnValue({ config: { migrations: { outputDir: 'migrations' } } });
		expect(() => configLoader.loadConfig('/noschema.yaml')).toThrow(
			'Invalid configuration in /resolved//noschema.yaml: "schema" object is required.'
		);
	});

	it('should successfully validate and return a minimal valid configuration', () => {
		jest.spyOn(yaml, 'load').mockReturnValue({
			config: { migrations: { outputDir: 'migrations' } },
			schema: {},
		});
		const result = configLoader.loadConfig('/minimal.yaml');
		expect(result).toEqual({
			config: { migrations: { outputDir: 'migrations' } },
			schema: {},
		});
	});

	it('should successfully validate and return a configuration with maxRollbacks', () => {
		jest.spyOn(yaml, 'load').mockReturnValue({
			config: { migrations: { outputDir: 'migrations', maxRollbacks: 5 } },
			schema: { tables: { order: ['create.sql'] } },
		});
		const result = configLoader.loadConfig('/maxrollbacks.yaml');
		expect(result).toEqual({
			config: { migrations: { outputDir: 'migrations', maxRollbacks: 5 } },
			schema: { tables: { order: ['create.sql'] } },
		});
	});
});
