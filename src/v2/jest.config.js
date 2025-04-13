// jest.config.js

module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
	},
	testMatch: ['**/*.test.ts', '**/*.spec.ts'],
	collectCoverage: true,
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.test.ts',
		'!src/**/*.spec.ts',
	],
	coverageDirectory: 'coverage',
	coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
	verbose: true,
};
