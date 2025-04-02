import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
// Use relative paths for potentially better IDE linting
import { loadConfig } from '../../src/core/config-loader'; // Updated import path
import { SqlSyncConfig } from '../../src/types/config';

// Mock process.cwd() to control the base directory for tests
// Use path.join for OS-agnostic path construction
const mockCwd = path.join(__dirname, '..', 'fixtures', 'config');

// Mock fs module
jest.mock('fs');

// Store original process.cwd
const originalCwd = process.cwd;

describe('Config Loader', () => {
	// Explicitly type the mocked functions
	let mockExistsSync: jest.Mock;
	let mockReadFileSync: jest.Mock;
	let mockProcessCwd: jest.Mock;

	beforeAll(() => {
		// Override process.cwd before all tests in this suite
		mockProcessCwd = jest.fn(() => mockCwd);
		process.cwd = mockProcessCwd;
	});

	afterAll(() => {
		// Restore original process.cwd after all tests
		process.cwd = originalCwd;
	});

	beforeEach(() => {
		// Reset mocks before each test
		jest.clearAllMocks();

		// Re-assign typed mocks
		mockExistsSync = fs.existsSync as jest.Mock;
		mockReadFileSync = fs.readFileSync as jest.Mock;

		// Default behavior: file exists unless overridden in test
		mockExistsSync.mockReturnValue(true);
	});

	it('should load configuration from the default location', () => {
		// Basic valid config
		const mockConfig: SqlSyncConfig = {
			config: {
				migrations: {
					outputDir: 'migrations',
					cli: {
						latest: 'migrate-latest',
						migrate: 'migrate-run',
					},
				},
			},
			sources: {
				schema: { order: ['schema'] },
				data: { order: ['data'] },
			},
		};
		const yamlString = yaml.dump(mockConfig);

		// Setup mock for this specific test
		const expectedPath = path.join(mockCwd, 'sqlsync.yaml');
		mockReadFileSync.mockReturnValue(yamlString);

		const config = loadConfig();

		expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
		expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');
		expect(config).toEqual(mockConfig);
		// Should have used process.cwd() for the default path
		expect(mockProcessCwd).toHaveBeenCalled();
	});

	it('should load configuration from a specified path', () => {
		// Basic valid config
		const mockConfig: SqlSyncConfig = {
			config: {
				migrations: {
					outputDir: 'custom_migrations',
				},
			},
			sources: {
				schema: { order: ['schema_custom'] },
			},
		};
		const yamlString = yaml.dump(mockConfig);

		// Use a fully specified path, not relative to cwd
		const specifiedPath = '/custom/path/sqlsync.yaml';
		const expectedPath = specifiedPath; // Should use the exact specified path

		// Setup mock for this specific test
		mockReadFileSync.mockReturnValue(yamlString);

		const config = loadConfig(specifiedPath);

		expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
		expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');
		expect(config).toEqual(mockConfig);
		// Should not have used process.cwd() when path is specified
		expect(mockProcessCwd).not.toHaveBeenCalled();
	});

	it('should throw an error if config file not found', () => {
		// Setup mock for this specific test
		mockExistsSync.mockReturnValueOnce(false);

		expect(() => {
			loadConfig('/path/not/exists.yaml');
		}).toThrow('Configuration file not found at /path/not/exists.yaml');
	});

	it('should throw an error if YAML is invalid', () => {
		// Invalid YAML content
		const invalidYaml = '!@#$%^&*';

		// Setup mock for this specific test
		mockReadFileSync.mockReturnValueOnce(invalidYaml);

		expect(() => {
			loadConfig();
		}).toThrow(/Error parsing YAML file/);
	});

	it('should throw an error if config is not an object', () => {
		// Setup mock for this specific test
		mockReadFileSync.mockReturnValueOnce('just a string');

		expect(() => {
			loadConfig();
		}).toThrow(/Invalid configuration format/);
	});

	it('should throw an error if config.migrations is not an object', () => {
		// Setup mock for this specific test
		const invalidConfig = {
			config: { migrations: 'not an object' },
			sources: { schema: { order: ['schema'] } },
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(invalidConfig));

		expect(() => {
			loadConfig();
		}).toThrow(
			/Invalid configuration in .*: "config.migrations" section should be an object./
		);
	});

	it('should throw an error if config.migrations.outputDir is missing', () => {
		// Setup mock for this specific test
		const invalidConfig = {
			config: { migrations: {} }, // Missing outputDir
			sources: { schema: { order: ['schema'] } },
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(invalidConfig));

		expect(() => {
			loadConfig();
		}).toThrow(/Invalid configuration in .*: "config.migrations.outputDir" is required./);
	});

	it('should throw an error if config.migrations.cli is not an object', () => {
		// Setup mock for this specific test
		const invalidConfig = {
			config: {
				migrations: {
					outputDir: 'migrations',
					cli: 'not an object',
				},
			},
			sources: { schema: { order: ['schema'] } },
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(invalidConfig));

		expect(() => {
			loadConfig();
		}).toThrow(/Invalid configuration in .*: "config.migrations.cli" should be an object./);
	});

	it('should throw an error if a source in sources is not an object', () => {
		// Setup mock for this specific test
		const invalidConfig = {
			config: { migrations: { outputDir: 'migrations' } },
			sources: { schema: 'not an object' },
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(invalidConfig));

		expect(() => {
			loadConfig();
		}).toThrow(/Invalid configuration in .*: Source "schema" should be an object./);
	});

	it('should throw an error if a source.order is not an array', () => {
		// Setup mock for this specific test
		const invalidConfig = {
			config: { migrations: { outputDir: 'migrations' } },
			sources: { schema: { order: 'not an array' } },
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(invalidConfig));

		expect(() => {
			loadConfig();
		}).toThrow(/Invalid configuration in .*: "schema.order" should be an array./);
	});

	// This test checks the behavior with maxRollbacks set to a non-positive value
	it('should throw an error if config.maxRollbacks is not a positive number', () => {
		// Setup mock for this specific test
		const invalidConfig = {
			config: { 
				migrations: { outputDir: 'migrations' },
				maxRollbacks: 0 // Set to a non-positive number
			},
			sources: { schema: { order: ['schema'] } },
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(invalidConfig));

		expect(() => {
			loadConfig();
		}).toThrow(/Invalid configuration in .*: "config.maxRollbacks" should be a positive number./);
	});

	// This test verifies that sources are optional if root-level folder configs exist
	it('should NOT throw an error if sources is missing but root-level folders exist', () => {
		// Define config with root-level folders but no sources
		const configWithRootFolders = {
			config: {
				migrations: {
					outputDir: 'migrations',
				},
			},
			schema: {
				order: ['tables', 'views'],
				tables: {
					order: ['users.sql', 'products.sql']
				}
			}
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(configWithRootFolders));

		// Should not throw an error
		expect(() => {
			loadConfig();
		}).not.toThrow();
	});

	// This test validates the new nested configuration structure
	it('should validate nested folder configurations', () => {
		// Setup mock for this specific test
		const validNestedConfig = {
			config: {
				migrations: { outputDir: 'migrations' },
				maxRollbacks: 3
			},
			schema: {
				order: ['tables', 'views'],
				orderedSubdirectoryFileOrder: ['types.sql', 'table.sql', 'indexes.sql'],
				tables: {
					order: ['users', 'products'],
					users: {
						order: ['types.sql', 'table.sql', 'indexes.sql']
					}
				}
			}
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(validNestedConfig));

		// Should not throw an error for valid nested structure
		expect(() => {
			const config = loadConfig();
			expect(config).toEqual(validNestedConfig);
		}).not.toThrow();
	});

	// This test validates that orderedSubdirectoryFileOrder must be an array
	it('should throw an error if orderedSubdirectoryFileOrder is not an array', () => {
		// Setup mock for this specific test
		const invalidNestedConfig = {
			config: {
				migrations: { outputDir: 'migrations' }
			},
			schema: {
				order: ['tables'],
				orderedSubdirectoryFileOrder: 'not an array'
			}
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(invalidNestedConfig));

		expect(() => {
			loadConfig();
		}).toThrow(/Invalid configuration in .*: "schema.orderedSubdirectoryFileOrder" should be an array./);
	});

	// This test validates deeply nested configuration validation
	it('should validate deeply nested folder configurations', () => {
		// Setup mock for this specific test
		const deeplyNestedConfig = {
			config: {
				migrations: { outputDir: 'migrations' }
			},
			schema: {
				tables: {
					system_config: {
						order: ['types.sql', 'table.sql']
					},
					profiles: {
						order: ['types.sql', 'table.sql', 'indexes.sql']
					}
				}
			}
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(deeplyNestedConfig));

		// Should not throw an error for valid deeply nested structure
		expect(() => {
			const config = loadConfig();
			expect(config).toEqual(deeplyNestedConfig);
		}).not.toThrow();
	});

	// Test that complex configuration matching user's requirements works
	it('should validate complex folder configurations with all features', () => {
		// Setup mock for this specific test - this matches the user's example
		const complexConfig = {
			config: {
				migrations: {
					cli: {
						create: 'supabase migrations new',
						up: 'supabase migrations up'
					},
					outputDir: 'migrations'
				},
				maxRollbacks: 3
			},
			schema: {
				order: [
					'schemas.sql',
					'extensions.sql',
					'roles',
					'functions',
					'tables',
					'seeds'
				],
				roles: {
					order: [
						'roles.sql',
						'grants.sql'
					]
				},
				functions: {
					order: [
						'uuid_v7.sql',
						'update_updated_at_column.sql',
						'company_enforce_tenant_id.sql',
						'reseller_enforce_tenant_id.sql',
						'get_vault_secrets.sql',
						'notify_api.sql'
					]
				},
				tables: {
					order: [
						'system_config',
						'ai_engines',
						'ai_engine_pipelines',
						'integrations',
						'countries',
						'states',
						'subscriptions',
						'tenants',
						'tenant_subscriptions',
						'profiles',
						'agents',
						'agent_routed_profiles',
						'integration_tenants',
						'products',
						'product_integrations',
						'agent_tenant_integrations',
						'caller_contexts',
						'conversations'
					],
					orderedSubdirectoryFileOrder: [
						'types.sql',
						'table.sql',
						'rls.sql',
						'checks.sql',
						'grants.sql',
						'policies.sql',
						'functions.sql',
						'triggers.sql',
						'indexes.sql'
					]
				},
				seeds: {
					order: [
						'system_config.sql',
						'ai_engines.sql',
						'ai_engine_pipelines.sql',
						'integrations.sql',
						'countries.sql',
						'states.sql'
					]
				}
			}
		};
		mockReadFileSync.mockReturnValueOnce(yaml.dump(complexConfig));

		// Should not throw an error for valid complex structure
		expect(() => {
			const config = loadConfig();
			expect(config).toEqual(complexConfig);
		}).not.toThrow();
	});
});
