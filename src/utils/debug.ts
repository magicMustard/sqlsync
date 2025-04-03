/**
 * Debug utility for SQLSync
 * Controls debug output based on environment
 */

// Check for debug mode from environment
const DEBUG_ENV = process.env.SQLSYNC_DEBUG || process.env.NODE_ENV === 'development';

/**
 * Debug level configuration
 */
export interface DebugConfig {
  enabled: boolean;
  level: 'none' | 'basic' | 'verbose';
}

// Default configuration
const defaultConfig: DebugConfig = {
  enabled: DEBUG_ENV ? true : false,
  level: DEBUG_ENV ? 'verbose' : 'none'
};

// Current configuration
let currentConfig: DebugConfig = { ...defaultConfig };

/**
 * Configure debug settings
 * @param config Debug configuration
 */
export function configureDebug(config: Partial<DebugConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Log debug message if debugging is enabled
 * @param message Debug message
 * @param level Minimum level required to show this message
 */
export function debug(message: string, level: 'basic' | 'verbose' = 'basic'): void {
  if (!currentConfig.enabled) return;
  if (level === 'verbose' && currentConfig.level !== 'verbose') return;
  
  console.log(`[DEBUG] ${message}`);
}

/**
 * Check if debugging is enabled
 * @returns True if debugging is enabled
 */
export function isDebugEnabled(): boolean {
  return currentConfig.enabled;
}

/**
 * Enable or disable debugging
 * @param enabled Whether debugging should be enabled
 * @param level Debug level
 */
export function setDebugEnabled(enabled: boolean, level: 'basic' | 'verbose' = 'basic'): void {
  currentConfig.enabled = enabled;
  currentConfig.level = enabled ? level : 'none';
}
