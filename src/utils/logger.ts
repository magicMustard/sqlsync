// src/utils/logger.ts

// Basic console logger implementation
// Could be replaced with a more sophisticated library like Winston or Pino later.

const log = (level: string, message: string, ...args: any[]) => {
	const timestamp = new Date().toISOString();
	console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
};

export const logger = {
	debug: (message: string, ...args: any[]) => log('debug', message, ...args),
	info: (message: string, ...args: any[]) => log('info', message, ...args),
	warn: (message: string, ...args: any[]) => log('warn', message, ...args),
	error: (message: string, ...args: any[]) => log('error', message, ...args),
};
