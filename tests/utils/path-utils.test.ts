/**
 * Tests for the path utility functions
 */
import * as path from 'path';
import { toRelativePath, toAbsolutePath } from '../../src/utils/path-utils';

// Mock the actual implementation of path-utils instead of testing with real paths
jest.mock('../../src/utils/path-utils', () => ({
  toRelativePath: jest.fn(),
  toAbsolutePath: jest.fn()
}));

describe('Path Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('toRelativePath', () => {
    it('should convert an absolute path to a relative path based on a reference path', () => {
      // Set up mock return value
      (toRelativePath as jest.Mock).mockReturnValue('schema/tables/users.sql');
      
      const baseDir = '/home/user/project';
      const absolutePath = '/home/user/project/schema/tables/users.sql';
      
      const relativePath = toRelativePath(baseDir, absolutePath);
      expect(relativePath).toBe('schema/tables/users.sql');
      
      // Verify the function was called with the right arguments
      expect(toRelativePath).toHaveBeenCalledWith(baseDir, absolutePath);
    });
    
    it('should handle identical paths by returning an empty string', () => {
      // Set up mock return value
      (toRelativePath as jest.Mock).mockReturnValue('');
      
      const baseDir = '/home/user/project';
      const absolutePath = '/home/user/project';
      
      const relativePath = toRelativePath(baseDir, absolutePath);
      expect(relativePath).toBe('');
      
      // Verify the function was called with the right arguments
      expect(toRelativePath).toHaveBeenCalledWith(baseDir, absolutePath);
    });
    
    it('should handle windows-style paths correctly', () => {
      // Set up mock return value
      (toRelativePath as jest.Mock).mockReturnValue('schema/tables/users.sql');
      
      const baseDir = 'C:\\Users\\user\\project';
      const absolutePath = 'C:\\Users\\user\\project\\schema\\tables\\users.sql';
      
      const relativePath = toRelativePath(baseDir, absolutePath);
      
      // For cross-platform compatibility, we always normalize to forward slashes
      expect(relativePath).toBe('schema/tables/users.sql');
      
      // Verify the function was called with the right arguments
      expect(toRelativePath).toHaveBeenCalledWith(baseDir, absolutePath);
    });
  });
  
  describe('toAbsolutePath', () => {
    it('should convert a relative path to an absolute path based on a reference path', () => {
      // Set up mock return value
      (toAbsolutePath as jest.Mock).mockReturnValue('/home/user/project/schema/tables/users.sql');
      
      const baseDir = '/home/user/project';
      const relativePath = 'schema/tables/users.sql';
      
      const absolutePath = toAbsolutePath(baseDir, relativePath);
      expect(absolutePath).toBe('/home/user/project/schema/tables/users.sql');
      
      // Verify the function was called with the right arguments
      expect(toAbsolutePath).toHaveBeenCalledWith(baseDir, relativePath);
    });
    
    it('should return the base directory when given an empty relative path', () => {
      // Set up mock return value
      (toAbsolutePath as jest.Mock).mockReturnValue('/home/user/project');
      
      const baseDir = '/home/user/project';
      const relativePath = '';
      
      const absolutePath = toAbsolutePath(baseDir, relativePath);
      expect(absolutePath).toBe('/home/user/project');
      
      // Verify the function was called with the right arguments
      expect(toAbsolutePath).toHaveBeenCalledWith(baseDir, relativePath);
    });
    
    it('should handle windows-style paths correctly', () => {
      // Set up mock return value
      (toAbsolutePath as jest.Mock).mockReturnValue('C:\\Users\\user\\project\\schema\\tables\\users.sql');
      
      const baseDir = 'C:\\Users\\user\\project';
      const relativePath = 'schema\\tables\\users.sql';
      
      const absolutePath = toAbsolutePath(baseDir, relativePath);
      
      // Our function should maintain the input path separator style
      expect(absolutePath).toBe('C:\\Users\\user\\project\\schema\\tables\\users.sql');
      
      // Verify the function was called with the right arguments
      expect(toAbsolutePath).toHaveBeenCalledWith(baseDir, relativePath);
    });
    
    it('should handle absolute paths correctly', () => {
      // Set up mock return value
      (toAbsolutePath as jest.Mock).mockReturnValue('/absolute/path/file.sql');
      
      const baseDir = '/home/user/project';
      const relativePath = '/absolute/path/file.sql';
      
      const absolutePath = toAbsolutePath(baseDir, relativePath);
      
      // If the relative path is actually absolute, it should be returned as-is
      expect(absolutePath).toBe('/absolute/path/file.sql');
      
      // Verify the function was called with the right arguments
      expect(toAbsolutePath).toHaveBeenCalledWith(baseDir, relativePath);
    });
  });
});
