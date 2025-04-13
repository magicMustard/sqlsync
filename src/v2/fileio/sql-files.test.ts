import * as fs from 'fs';
import { SqlFiles } from './sql-files';

jest.mock('fs');

describe('SqlFiles', () => {
	let sqlFiles: SqlFiles;
	const mockSchemaStructure = {
		tables: {
			order: ['/path/to/tables/table1.sql', '/path/to/tables/subfolder'],
			orderedSubdirectoryFileOrder: ['schema.sql', 'data.sql'],
		},
		seeds: {
			order: ['/path/to/seeds/seed1.sql'],
			orderedSubdirectoryFileOrder: [],
		},
	};

	beforeEach(() => {
		jest.spyOn(fs, 'statSync').mockImplementation((path: fs.PathLike) => {
			if (typeof path === 'string' && path.endsWith('/subfolder')) {
				return { isFile: () => false, isDirectory: () => true } as fs.Stats;
			} else {
				return { isFile: () => true, isDirectory: () => false } as fs.Stats;
			}
		});
		jest.spyOn(fs, 'existsSync').mockImplementation((path: fs.PathLike) => {
			return (
				typeof path === 'string' &&
				(path.includes('schema.sql') || path.includes('data.sql'))
			);
		});
		jest
			.spyOn(fs, 'readFileSync')
			.mockImplementation((path: fs.PathOrFileDescriptor) => {
				return typeof path === 'string'
					? `Contents of ${path}`
					: 'Contents of unknown path';
			});
		sqlFiles = new SqlFiles(mockSchemaStructure);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('should return the first SQL file in the order', () => {
		const result = sqlFiles.next();
		expect(result).not.toBeNull();
		expect(result?.location).toBe('/path/to/tables/table1.sql');
		expect(result?.contents).toBe('Contents of /path/to/tables/table1.sql');
	});

	it('should handle directories and return subdirectory files if they exist', () => {
		// First call should return table1.sql
		sqlFiles.next();
		// Second call should process the subfolder and return schema.sql
		const result = sqlFiles.next();
		expect(result).not.toBeNull();
		expect(result?.location).toBe('/path/to/tables/subfolder/schema.sql');
		expect(result?.contents).toBe(
			'Contents of /path/to/tables/subfolder/schema.sql'
		);
	});

	it('should move to the next category after exhausting the current one', () => {
		// Process tables category
		sqlFiles.next(); // table1.sql
		sqlFiles.next(); // subfolder/schema.sql
		sqlFiles.next(); // subfolder/data.sql
		// Should move to seeds category
		const result = sqlFiles.next();
		expect(result).not.toBeNull();
		expect(result?.location).toBe('/path/to/seeds/seed1.sql');
		expect(result?.contents).toBe('Contents of /path/to/seeds/seed1.sql');
	});

	it('should return null when there are no more files', () => {
		// Process all files
		sqlFiles.next(); // table1.sql
		sqlFiles.next(); // subfolder/schema.sql
		sqlFiles.next(); // subfolder/data.sql
		sqlFiles.next(); // seed1.sql
		const result = sqlFiles.next();
		expect(result).toBeNull();
	});

	it('should skip subdirectory files that do not exist', () => {
		jest.spyOn(fs, 'existsSync').mockImplementation((path: fs.PathLike) => {
			return (
				typeof path === 'string' &&
				path.includes('schema.sql') &&
				!path.includes('data.sql')
			);
		});
		sqlFiles = new SqlFiles(mockSchemaStructure);
		// Process table1.sql
		sqlFiles.next();
		// Should return schema.sql, skip data.sql as it doesn't exist
		const result = sqlFiles.next();
		expect(result).not.toBeNull();
		expect(result?.location).toBe('/path/to/tables/subfolder/schema.sql');
		// Next should be seeds as data.sql is skipped
		const nextResult = sqlFiles.next();
		expect(nextResult).not.toBeNull();
		expect(nextResult?.location).toBe('/path/to/seeds/seed1.sql');
	});
});
