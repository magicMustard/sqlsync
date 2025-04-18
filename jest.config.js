/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests', '<rootDir>/src'], // Look for tests in both tests and src directories
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1', // Map @/ alias for tests
	},
	transformIgnorePatterns: [
		"node_modules/(?!(chalk)/)" // Allow transforming chalk package for ESM compatibility
	],
};
