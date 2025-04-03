// src/utils/logger.ts
import chalk from 'chalk';

// Enhanced console logger implementation with colors
// Could be replaced with a more sophisticated library like Winston or Pino later.

const log = (level: string, message: string, ...args: any[]) => {
  // Only display timestamp in debug mode to make normal logs cleaner
  const timestamp = process.env.DEBUG ? `[${new Date().toISOString()}] ` : '';
  
  const colorize = (text: string) => {
    switch (level.toLowerCase()) {
      case 'debug':
        return chalk.gray(text);
      case 'info':
        return chalk.blue(text);
      case 'warn':
        return chalk.yellow(text);
      case 'error':
        return chalk.red(text);
      case 'success':
        return chalk.green(text);
      default:
        return text;
    }
  };
  
  const levelDisplay = `[${level.toUpperCase()}]`;
  
  // Format the log message with appropriate colors
  console.log(`${timestamp}${colorize(levelDisplay)} ${message}`, ...args);
};

export const logger = {
  debug: (message: string, ...args: any[]) => log('debug', message, ...args),
  info: (message: string, ...args: any[]) => log('info', message, ...args),
  warn: (message: string, ...args: any[]) => log('warn', message, ...args),
  error: (message: string, ...args: any[]) => log('error', message, ...args),
  success: (message: string, ...args: any[]) => log('success', message, ...args), // Add success level with green color
};
