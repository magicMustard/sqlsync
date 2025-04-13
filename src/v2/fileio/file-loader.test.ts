import * as fs from 'fs';
import * as path from 'path';
import { FileLoader } from './file-loader';
import { logger } from '../../utils/logger';

jest.mock('fs');
jest.mock('path');
jest.mock('../../utils/logger', () => ({
	logger: {
		error: jest.fn(),
		success: jest.fn(),
	},
}));

describe('FileLoader', () => {
	let fileLoader: FileLoader;
	const mockSchema = {
		tables: {
			order: ['table1.sql', 'subfolder'],
			orderedSubdirectoryFileOrder: ['schema.sql', 'data.sql'],
		},
		seeds: {
			order: ['seed1.sql'],
			orderedSubdirectoryFileOrder: [],
		},
	};
	const mockBasePath = '/mock/base/path';

	beforeEach(() => {
		jest.spyOn(process, 'cwd').mockReturnValue(mockBasePath);
		jest.spyOn(path, 'resolve').mockImplementation((...args) => args.join('/'));
		jest.spyOn(fs, 'existsSync').mockReturnValue(true);
		jest.spyOn(fs, 'statSync').mockImplementation((path: fs.PathLike) => {
			if (typeof path === 'string' && path.includes('subfolder')) {
				return { isFile: () => false, isDirectory: () => true } as fs.Stats;
			} else {
				return { isFile: () => true, isDirectory: () => false } as fs.Stats;
			}
		});
		fileLoader = new FileLoader(mockSchema, mockBasePath);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should load schema and return ordered structure', () => {
		const result = fileLoader.loadSchema();
		expect(result).toBeDefined();
		expect(result.tables).toBeDefined();
		expect(result.tables.order).toEqual([
			'/mock/base/path/tables/table1.sql',
			'/mock/base/path/tables/subfolder',
		]);
		expect(result.tables.orderedSubdirectoryFileOrder).toEqual([
			'schema.sql',
			'data.sql',
		]);
		expect(result.seeds).toBeDefined();
		expect(result.seeds.order).toEqual(['/mock/base/path/seeds/seed1.sql']);
	});

	it('should throw error if mandatory file is missing', () => {
		jest.spyOn(fs, 'existsSync').mockImplementation((path: fs.PathLike) => {
			return typeof path === 'string' && !path.includes('table1.sql');
		});
		expect(() => fileLoader.loadSchema()).toThrow(
			"Missing mandatory file or folder 'table1.sql' in 'tables'"
		);
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining(
				"Missing mandatory file or folder 'table1.sql' in 'tables'"
			)
		);
	});

	it('should throw error if mandatory folder is missing', () => {
		jest.spyOn(fs, 'existsSync').mockImplementation((path: fs.PathLike) => {
			return typeof path === 'string' && !path.includes('subfolder');
		});
		expect(() => fileLoader.loadSchema()).toThrow(
			"Missing mandatory file or folder 'subfolder' in 'tables'"
		);
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining(
				"Missing mandatory file or folder 'subfolder' in 'tables'"
			)
		);
	});

	it('should throw error if file in order list is not a .sql file', () => {
		const mockSchemaWithInvalidFile = {
			tables: {
				order: ['table1.txt'],
				orderedSubdirectoryFileOrder: [],
			},
			seeds: {
				order: ['seed1.sql'],
				orderedSubdirectoryFileOrder: [],
			},
		};
		fileLoader = new FileLoader(mockSchemaWithInvalidFile, mockBasePath);
		jest.spyOn(fs, 'existsSync').mockReturnValue(true);
		jest.spyOn(fs, 'statSync').mockImplementation((path: fs.PathLike) => {
			if (typeof path === 'string' && path.includes('subfolder')) {
				return { isFile: () => false, isDirectory: () => true } as fs.Stats;
			} else {
				return { isFile: () => true, isDirectory: () => false } as fs.Stats;
			}
		});
		expect(() => fileLoader.loadSchema()).toThrow(
			"Invalid file type in 'tables': 'table1.txt' must be a .sql file"
		);
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining(
				"Invalid file type in 'tables': 'table1.txt' must be a .sql file"
			)
		);
	});

	it('should handle schema entries without order attribute', () => {
		const schemaWithNoOrder = {
			tables: {
				order: ['table1.sql'],
				orderedSubdirectoryFileOrder: [],
			},
		} as any;
		fileLoader = new FileLoader(schemaWithNoOrder, mockBasePath);
		const result = fileLoader.loadSchema();
		expect(result).toBeDefined();
		expect(result.tables.order).toEqual(['/mock/base/path/tables/table1.sql']);
	});
});
