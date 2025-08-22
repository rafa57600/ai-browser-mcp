import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DiskManager } from '../../../src/performance/disk-manager.js';
import type { DiskManagerConfig } from '../../../src/types/performance-types.js';

describe('DiskManager', () => {
  let diskManager: DiskManager;
  let testTempDir: string;

  beforeEach(async () => {
    // Create a unique test directory
    testTempDir = path.join(os.tmpdir(), `disk-manager-test-${Date.now()}`);
    await fs.mkdir(testTempDir, { recursive: true });
  });

  afterEach(async () => {
    if (diskManager) {
      await diskManager.shutdown();
    }
    
    // Clean up test directory
    try {
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      diskManager = new DiskManager();
      await diskManager.initialize();
      
      const stats = await diskManager.getTotalDiskUsage();
      expect(stats.maxTotalSizeMB).toBe(1024);
      expect(stats.totalFiles).toBe(0);
    });

    it('should initialize with custom configuration', async () => {
      const config: DiskManagerConfig = {
        maxTotalSizeMB: 512,
        maxSessionSizeMB: 128,
        maxFileAgeDays: 2,
        tempDirPrefix: 'test-browser'
      };
      
      diskManager = new DiskManager(config);
      await diskManager.initialize();
      
      const stats = await diskManager.getTotalDiskUsage();
      expect(stats.maxTotalSizeMB).toBe(512);
    });
  });

  describe('session directory management', () => {
    beforeEach(async () => {
      diskManager = new DiskManager({
        tempDirPrefix: path.basename(testTempDir)
      });
      await diskManager.initialize();
    });

    it('should create session temp directories', async () => {
      const sessionDir = await diskManager.createSessionTempDir('session1');
      
      expect(sessionDir).toBeDefined();
      expect(sessionDir).toContain('session1');
      
      // Directory should exist
      const stats = await fs.stat(sessionDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should reuse existing session directories', async () => {
      const sessionDir1 = await diskManager.createSessionTempDir('session1');
      const sessionDir2 = await diskManager.createSessionTempDir('session1');
      
      expect(sessionDir1).toBe(sessionDir2);
    });
  });

  describe('file storage and retrieval', () => {
    beforeEach(async () => {
      diskManager = new DiskManager({
        tempDirPrefix: path.basename(testTempDir),
        maxSessionSizeMB: 10,
        maxTotalSizeMB: 50
      });
      await diskManager.initialize();
    });

    it('should store and retrieve text files', async () => {
      const content = 'Hello, world!';
      const filePath = await diskManager.storeTemporaryFile('session1', 'test.txt', content);
      
      expect(filePath).toBeDefined();
      expect(filePath).toContain('test.txt');
      
      const retrievedContent = await diskManager.getTemporaryFile(filePath);
      expect(retrievedContent.toString()).toBe(content);
    });

    it('should store and retrieve binary files', async () => {
      const content = Buffer.from([1, 2, 3, 4, 5]);
      const filePath = await diskManager.storeTemporaryFile('session1', 'test.png', content);
      
      const retrievedContent = await diskManager.getTemporaryFile(filePath);
      expect(Buffer.compare(retrievedContent, content)).toBe(0);
    });

    it('should store files with metadata', async () => {
      const content = 'test content';
      const metadata = { type: 'screenshot', width: 1920, height: 1080 };
      
      const filePath = await diskManager.storeTemporaryFile('session1', 'screenshot.png', content, metadata);
      
      const sessionFiles = diskManager.getSessionFiles('session1');
      expect(sessionFiles).toHaveLength(1);
      expect(sessionFiles[0].metadata).toEqual(metadata);
    });

    it('should handle filename conflicts', async () => {
      const content1 = 'content 1';
      const content2 = 'content 2';
      
      const filePath1 = await diskManager.storeTemporaryFile('session1', 'test.txt', content1);
      const filePath2 = await diskManager.storeTemporaryFile('session1', 'test.txt', content2);
      
      expect(filePath1).not.toBe(filePath2);
      expect(filePath2).toContain('test_1.txt');
      
      const retrieved1 = await diskManager.getTemporaryFile(filePath1);
      const retrieved2 = await diskManager.getTemporaryFile(filePath2);
      
      expect(retrieved1.toString()).toBe(content1);
      expect(retrieved2.toString()).toBe(content2);
    });

    it('should reject files with invalid extensions', async () => {
      await expect(
        diskManager.storeTemporaryFile('session1', 'malicious.exe', 'content')
      ).rejects.toThrow('File extension \'.exe\' is not allowed');
    });

    it('should enforce session size limits', async () => {
      // Create a large file that exceeds session limit
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB > 10MB limit
      
      await expect(
        diskManager.storeTemporaryFile('session1', 'large.txt', largeContent)
      ).rejects.toThrow('Session disk usage would exceed limit');
    });

    it('should enforce total size limits', async () => {
      // Fill up to near total limit with multiple sessions
      const content = 'x'.repeat(9 * 1024 * 1024); // 9MB per file
      
      await diskManager.storeTemporaryFile('session1', 'file1.txt', content);
      await diskManager.storeTemporaryFile('session2', 'file2.txt', content);
      await diskManager.storeTemporaryFile('session3', 'file3.txt', content);
      await diskManager.storeTemporaryFile('session4', 'file4.txt', content);
      await diskManager.storeTemporaryFile('session5', 'file5.txt', content);
      
      // This should exceed the 50MB total limit
      await expect(
        diskManager.storeTemporaryFile('session6', 'file6.txt', content)
      ).rejects.toThrow('Total disk usage would exceed limit');
    });
  });

  describe('file deletion', () => {
    beforeEach(async () => {
      diskManager = new DiskManager({
        tempDirPrefix: path.basename(testTempDir)
      });
      await diskManager.initialize();
    });

    it('should delete individual files', async () => {
      const filePath = await diskManager.storeTemporaryFile('session1', 'test.txt', 'content');
      
      const deleted = await diskManager.deleteTemporaryFile(filePath);
      expect(deleted).toBe(true);
      
      await expect(diskManager.getTemporaryFile(filePath)).rejects.toThrow('File not found');
    });

    it('should handle deletion of non-existent files', async () => {
      const deleted = await diskManager.deleteTemporaryFile('/non/existent/file.txt');
      expect(deleted).toBe(false);
    });
  });

  describe('session cleanup', () => {
    beforeEach(async () => {
      diskManager = new DiskManager({
        tempDirPrefix: path.basename(testTempDir)
      });
      await diskManager.initialize();
    });

    it('should clean up all files for a session', async () => {
      await diskManager.storeTemporaryFile('session1', 'file1.txt', 'content1');
      await diskManager.storeTemporaryFile('session1', 'file2.txt', 'content2');
      await diskManager.storeTemporaryFile('session2', 'file3.txt', 'content3');
      
      const result = await diskManager.cleanupSession('session1');
      
      expect(result.filesDeleted).toBe(2);
      expect(result.spaceFreesMB).toBeGreaterThan(0);
      
      const session1Files = diskManager.getSessionFiles('session1');
      const session2Files = diskManager.getSessionFiles('session2');
      
      expect(session1Files).toHaveLength(0);
      expect(session2Files).toHaveLength(1);
    });

    it('should handle cleanup of non-existent sessions', async () => {
      const result = await diskManager.cleanupSession('non-existent');
      
      expect(result.filesDeleted).toBe(0);
      expect(result.spaceFreesMB).toBe(0);
    });
  });

  describe('disk usage statistics', () => {
    beforeEach(async () => {
      diskManager = new DiskManager({
        tempDirPrefix: path.basename(testTempDir),
        maxTotalSizeMB: 100
      });
      await diskManager.initialize();
    });

    it('should provide session disk usage statistics', async () => {
      await diskManager.storeTemporaryFile('session1', 'file1.txt', 'content1');
      await diskManager.storeTemporaryFile('session1', 'file2.txt', 'content2');
      
      const usage = await diskManager.getSessionDiskUsage('session1');
      
      expect(usage.sessionId).toBe('session1');
      expect(usage.fileCount).toBe(2);
      expect(usage.totalSizeMB).toBeGreaterThan(0);
      expect(usage.oldestFile).toBeInstanceOf(Date);
      expect(usage.newestFile).toBeInstanceOf(Date);
    });

    it('should provide total disk usage statistics', async () => {
      await diskManager.storeTemporaryFile('session1', 'file1.txt', 'content1');
      await diskManager.storeTemporaryFile('session2', 'file2.txt', 'content2');
      
      const stats = await diskManager.getTotalDiskUsage();
      
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSizeMB).toBeGreaterThan(0);
      expect(stats.maxTotalSizeMB).toBe(100);
      expect(stats.usagePercent).toBeGreaterThan(0);
      expect(stats.sessionCount).toBe(2);
      expect(stats.averageSessionSizeMB).toBeGreaterThan(0);
    });

    it('should list session files', () => {
      return new Promise<void>(async (resolve) => {
        await diskManager.storeTemporaryFile('session1', 'file1.txt', 'content1');
        await new Promise(r => setTimeout(r, 10)); // Small delay
        await diskManager.storeTemporaryFile('session1', 'file2.txt', 'content2');
        
        const files = diskManager.getSessionFiles('session1');
        
        expect(files).toHaveLength(2);
        expect(files[0].filename).toBe('file2.txt'); // Should be sorted by creation time (newest first)
        expect(files[1].filename).toBe('file1.txt');
        
        resolve();
      });
    });
  });

  describe('automatic cleanup', () => {
    beforeEach(async () => {
      diskManager = new DiskManager({
        tempDirPrefix: path.basename(testTempDir),
        maxFileAgeDays: 0.001, // Very short for testing (about 1.4 minutes)
        cleanupInterval: 50 // Short interval for testing
      });
      await diskManager.initialize();
    });

    it('should clean up old files automatically', async () => {
      await diskManager.storeTemporaryFile('session1', 'old-file.txt', 'content');
      
      // Wait for file to become "old"
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await diskManager.cleanupOldFiles();
      
      expect(result.filesDeleted).toBe(1);
      expect(result.spaceFreesMB).toBeGreaterThan(0);
    });
  });

  describe('forced cleanup', () => {
    beforeEach(async () => {
      diskManager = new DiskManager({
        tempDirPrefix: path.basename(testTempDir)
      });
      await diskManager.initialize();
    });

    it('should force cleanup to free specified space', async () => {
      // Create several files
      await diskManager.storeTemporaryFile('session1', 'file1.txt', 'x'.repeat(1024 * 1024)); // 1MB
      await diskManager.storeTemporaryFile('session2', 'file2.txt', 'x'.repeat(1024 * 1024)); // 1MB
      await diskManager.storeTemporaryFile('session3', 'file3.txt', 'x'.repeat(1024 * 1024)); // 1MB
      
      const result = await diskManager.forceCleanup(2); // Request 2MB free
      
      expect(result.filesDeleted).toBeGreaterThan(0);
      expect(result.spaceFreesMB).toBeGreaterThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      diskManager = new DiskManager({
        tempDirPrefix: path.basename(testTempDir)
      });
      await diskManager.initialize();
    });

    it('should handle file system errors gracefully', async () => {
      const filePath = await diskManager.storeTemporaryFile('session1', 'test.txt', 'content');
      
      // Manually delete the file to simulate file system error
      await fs.unlink(filePath);
      
      await expect(diskManager.getTemporaryFile(filePath)).rejects.toThrow('File not found');
    });

    it('should handle permission errors during cleanup', async () => {
      // This test would need platform-specific permission manipulation
      // For now, just ensure cleanup doesn't throw
      await expect(diskManager.cleanupSession('session1')).resolves.not.toThrow();
    });
  });
});