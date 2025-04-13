// index.ts

/**
 * Entry point for SQLSync v0.2.0
 * This file initializes the orchestrator which manages the CLI, configuration, and command execution.
 */

import { SqlSyncOrchestrator } from './orchestrator';

// Create an instance of the orchestrator and run it
function main(): void {
	const orchestrator = new SqlSyncOrchestrator();
	orchestrator.initialize();
}

// Execute the main function if this file is run directly
if (require.main === module) {
	main();
}
