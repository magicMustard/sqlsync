import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Interface representing a file to create in the test directory
 */
export interface TestFile {
  path: string;
  content: string;
}

/**
 * Creates a test directory with the specified files
 */
export async function createTestDirectory(baseDir: string, files: TestFile[]) {
  for (const file of files) {
    const filePath = path.join(baseDir, file.path);
    const dirPath = path.dirname(filePath);
    
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, file.content);
  }
}

/**
 * Modifies a schema file using the provided transform function
 */
export async function modifySchema(filePath: string, transform: (content: string) => string) {
  const content = await fs.readFile(filePath, 'utf8');
  const modifiedContent = transform(content);
  await fs.writeFile(filePath, modifiedContent);
  return modifiedContent;
}

/**
 * Lists all migration files in the specified directory
 */
export async function listMigrations(baseDir: string) {
  const migrationsDir = path.join(baseDir, 'migrations');
  try {
    const files = await fs.readdir(migrationsDir);
    return files.filter(file => file.endsWith('.sql')).sort();
  } catch (error) {
    return [];
  }
}

/**
 * Clones a directory to simulate multiple developers working
 * on the same codebase
 */
export async function cloneDevelopmentEnvironment(sourceDir: string, targetName: string) {
  const parentDir = path.dirname(sourceDir);
  const targetDir = path.join(parentDir, targetName);
  
  // Create target directory
  await fs.mkdir(targetDir, { recursive: true });
  
  // Copy all files recursively
  const copyFiles = async (dir: string, targetBase: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(dir, entry.name);
      const targetPath = path.join(
        targetBase, 
        path.relative(sourceDir, sourcePath)
      );
      
      if (entry.isDirectory()) {
        await fs.mkdir(targetPath, { recursive: true });
        await copyFiles(sourcePath, targetBase);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  };
  
  await copyFiles(sourceDir, targetDir);
  
  return targetDir;
}

/**
 * Copy migrations from one environment to another
 * to simulate pulling changes
 */
export async function copyMigrations(sourceDir: string, targetDir: string) {
  const sourceMigrationsDir = path.join(sourceDir, 'migrations');
  const targetMigrationsDir = path.join(targetDir, 'migrations');
  
  // Ensure target migrations directory exists
  await fs.mkdir(targetMigrationsDir, { recursive: true });
  
  // Get all source migrations
  const migrations = await fs.readdir(sourceMigrationsDir);
  
  // Copy each migration file
  for (const migration of migrations) {
    const sourcePath = path.join(sourceMigrationsDir, migration);
    const targetPath = path.join(targetMigrationsDir, migration);
    
    // Only copy if it doesn't exist in target
    try {
      await fs.access(targetPath);
    } catch {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}
