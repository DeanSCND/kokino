/**
 * FileLoader - Safe file loading for bootstrap context
 * Phase 3: Bootstrap System
 *
 * Provides secure file loading with path traversal protection
 * and graceful handling of missing files.
 */

import fs from 'fs/promises';
import path from 'path';

export class FileLoader {
  constructor(workingDirectory) {
    this.workingDir = workingDirectory;
  }

  /**
   * Validate file path to prevent directory traversal attacks
   * @param {string} filePath - Relative file path to validate
   * @returns {string} Normalized path
   * @throws {Error} If path is invalid or attempts traversal
   */
  validatePath(filePath) {
    // Normalize the path
    const normalized = path.normalize(filePath);

    // Check for directory traversal attempts
    if (normalized.includes('..') || path.isAbsolute(normalized)) {
      throw new Error(`Invalid file path: ${filePath}. Path traversal not allowed.`);
    }

    // Additional security: check for null bytes
    if (normalized.includes('\0')) {
      throw new Error(`Invalid file path: ${filePath}. Null bytes not allowed.`);
    }

    return normalized;
  }

  /**
   * Load a single file
   * @param {string} filePath - Relative path to file
   * @returns {Promise<object>} File load result
   */
  async loadFile(filePath) {
    try {
      const safePath = this.validatePath(filePath);
      const absolutePath = path.resolve(this.workingDir, safePath);

      const content = await fs.readFile(absolutePath, 'utf-8');
      return {
        path: filePath,
        absolutePath,
        content,
        size: content.length,
        loaded: true
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          path: filePath,
          content: null,
          size: 0,
          loaded: false,
          error: 'File not found'
        };
      }

      // Re-throw validation errors
      if (error.message.includes('Invalid file path')) {
        throw error;
      }

      // Other errors (permissions, etc.)
      return {
        path: filePath,
        content: null,
        size: 0,
        loaded: false,
        error: error.message
      };
    }
  }

  /**
   * Load multiple files in order
   * @param {string[]} paths - Array of file paths
   * @returns {Promise<Array>} Array of loaded files (only successful ones)
   */
  async loadAutoFiles(paths) {
    const results = [];

    for (const filePath of paths) {
      const result = await this.loadFile(filePath);
      if (result.loaded) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Find CLAUDE.md by checking multiple locations
   * @returns {Promise<object|null>} File result or null if not found
   */
  async findClaudeMd() {
    // Check multiple locations for CLAUDE.md
    const locations = [
      'CLAUDE.md',
      '../CLAUDE.md',
      '../../CLAUDE.md'
    ];

    for (const location of locations) {
      try {
        const result = await this.loadFile(location);
        if (result.loaded) {
          return result;
        }
      } catch (error) {
        // Skip invalid paths, continue searching
        continue;
      }
    }

    return null;
  }

  /**
   * Check if a file exists
   * @param {string} filePath - Relative path to file
   * @returns {Promise<boolean>} True if file exists
   */
  async exists(filePath) {
    try {
      const safePath = this.validatePath(filePath);
      const absolutePath = path.resolve(this.workingDir, safePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}

export default FileLoader;
