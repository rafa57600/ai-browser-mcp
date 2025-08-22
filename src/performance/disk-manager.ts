import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { DiskManagerConfig, DiskUsageStats, FileInfo, CleanupResult } from '../types/performance-types.js';

/**
 * DiskManager handles temporary file management and disk space monitoring
 */
export class DiskManager {
  private tempDirs: Map<string, string> = new Map(); // sessionId -> tempDir
  private fileRegistry: Map<string, FileInfo> = new Map(); // filePath -> FileInfo
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly config: Required<DiskManagerConfig>;
  private readonly baseTempDir: string;

  constructor(config: DiskManagerConfig = {}) {
    this.config = {
      maxTotalSizeMB: config.maxTotalSizeMB ?? 1024, // 1GB
      maxSessionSizeMB: config.maxSessionSizeMB ?? 256, // 256MB
      maxFileAgeDays: config.maxFileAgeDays ?? 1,
      cleanupInterval: config.cleanupInterval ?? 10 * 60 * 1000, // 10 minutes
      tempDirPrefix: config.tempDirPrefix ?? 'mcp-browser',
      allowedExtensions: config.allowedExtensions ?? ['.png', '.jpg', '.jpeg', '.pdf', '.html', '.json', '.har', '.zip', '.txt'],
      compressionEnabled: config.compressionEnabled ?? true
    };

    this.baseTempDir = path.join(os.tmpdir(), this.config.tempDirPrefix);
  }

  /**
   * Initializes the disk manager
   */
  async initialize(): Promise<void> {
    // Ensure base temp directory exists
    await fs.mkdir(this.baseTempDir, { recursive: true });
    
    // Start cleanup timer
    this.startCleanupTimer();
    
    // Initial cleanup of old files
    await this.cleanupOldFiles();
  }

  /**
   * Creates a temporary directory for a session
   */
  async createSessionTempDir(sessionId: string): Promise<string> {
    if (this.tempDirs.has(sessionId)) {
      return this.tempDirs.get(sessionId)!;
    }

    const sessionTempDir = path.join(this.baseTempDir, sessionId);
    await fs.mkdir(sessionTempDir, { recursive: true });
    
    this.tempDirs.set(sessionId, sessionTempDir);
    return sessionTempDir;
  }

  /**
   * Stores a temporary file and returns its path
   */
  async storeTemporaryFile(
    sessionId: string,
    filename: string,
    data: Buffer | string,
    metadata?: Record<string, any>
  ): Promise<string> {
    // Validate file extension
    const ext = path.extname(filename).toLowerCase();
    if (!this.config.allowedExtensions.includes(ext)) {
      throw new Error(`File extension '${ext}' is not allowed`);
    }

    // Check session disk usage
    const sessionUsage = await this.getSessionDiskUsage(sessionId);
    const fileSizeMB = Buffer.isBuffer(data) ? data.length / 1024 / 1024 : Buffer.byteLength(data, 'utf8') / 1024 / 1024;
    
    if (sessionUsage.totalSizeMB + fileSizeMB > this.config.maxSessionSizeMB) {
      throw new Error(`Session disk usage would exceed limit (${this.config.maxSessionSizeMB}MB)`);
    }

    // Check total disk usage
    const totalUsage = await this.getTotalDiskUsage();
    if (totalUsage.totalSizeMB + fileSizeMB > this.config.maxTotalSizeMB) {
      // Try to free up space
      await this.cleanupOldFiles();
      
      const newTotalUsage = await this.getTotalDiskUsage();
      if (newTotalUsage.totalSizeMB + fileSizeMB > this.config.maxTotalSizeMB) {
        throw new Error(`Total disk usage would exceed limit (${this.config.maxTotalSizeMB}MB)`);
      }
    }

    // Create session temp directory if it doesn't exist
    const sessionTempDir = await this.createSessionTempDir(sessionId);
    
    // Generate unique filename if file already exists
    let finalFilename = filename;
    let counter = 1;
    let filePath = path.join(sessionTempDir, finalFilename);
    
    while (await this.fileExists(filePath)) {
      const name = path.parse(filename).name;
      const extension = path.parse(filename).ext;
      finalFilename = `${name}_${counter}${extension}`;
      filePath = path.join(sessionTempDir, finalFilename);
      counter++;
    }

    // Write file
    await fs.writeFile(filePath, data);

    // Register file
    const fileInfo: FileInfo = {
      path: filePath,
      sessionId,
      filename: finalFilename,
      sizeMB: fileSizeMB,
      createdAt: new Date(),
      lastAccessed: new Date(),
      metadata: metadata || {}
    };
    
    this.fileRegistry.set(filePath, fileInfo);

    return filePath;
  }

  /**
   * Retrieves a temporary file
   */
  async getTemporaryFile(filePath: string): Promise<Buffer> {
    const fileInfo = this.fileRegistry.get(filePath);
    if (!fileInfo) {
      throw new Error('File not found in registry');
    }

    if (!(await this.fileExists(filePath))) {
      this.fileRegistry.delete(filePath);
      throw new Error('File not found on disk');
    }

    // Update last accessed time
    fileInfo.lastAccessed = new Date();

    return await fs.readFile(filePath);
  }

  /**
   * Deletes a temporary file
   */
  async deleteTemporaryFile(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath);
      this.fileRegistry.delete(filePath);
      return true;
    } catch (error) {
      // File might already be deleted
      this.fileRegistry.delete(filePath);
      return false;
    }
  }

  /**
   * Cleans up all files for a session
   */
  async cleanupSession(sessionId: string): Promise<CleanupResult> {
    const sessionTempDir = this.tempDirs.get(sessionId);
    if (!sessionTempDir) {
      return { filesDeleted: 0, spaceFreesMB: 0 };
    }

    let filesDeleted = 0;
    let spaceFreedMB = 0;

    // Delete all files in session directory
    const filesToDelete = Array.from(this.fileRegistry.entries())
      .filter(([, fileInfo]) => fileInfo.sessionId === sessionId);

    for (const [filePath, fileInfo] of filesToDelete) {
      try {
        await fs.unlink(filePath);
        filesDeleted++;
        spaceFreedMB += fileInfo.sizeMB;
        this.fileRegistry.delete(filePath);
      } catch (error) {
        // File might already be deleted
        this.fileRegistry.delete(filePath);
      }
    }

    // Remove session temp directory
    try {
      await fs.rmdir(sessionTempDir);
    } catch (error) {
      // Directory might not be empty or already deleted
    }

    this.tempDirs.delete(sessionId);

    return { filesDeleted, spaceFreesMB: spaceFreedMB };
  }

  /**
   * Gets disk usage statistics for a session
   */
  getSessionDiskUsage(sessionId: string): {
    sessionId: string;
    fileCount: number;
    totalSizeMB: number;
    oldestFile: Date | null;
    newestFile: Date | null;
  } {
    const sessionFiles = Array.from(this.fileRegistry.values())
      .filter(file => file.sessionId === sessionId);

    const totalSizeMB = sessionFiles.reduce((sum, file) => sum + file.sizeMB, 0);
    const dates = sessionFiles.map(file => file.createdAt);
    
    return {
      sessionId,
      fileCount: sessionFiles.length,
      totalSizeMB,
      oldestFile: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null,
      newestFile: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
    };
  }

  /**
   * Gets total disk usage statistics
   */
  getTotalDiskUsage(): DiskUsageStats {
    const allFiles = Array.from(this.fileRegistry.values());
    const totalSizeMB = allFiles.reduce((sum, file) => sum + file.sizeMB, 0);
    
    const sessionStats = new Map<string, number>();
    for (const file of allFiles) {
      sessionStats.set(file.sessionId, (sessionStats.get(file.sessionId) || 0) + file.sizeMB);
    }

    const dates = allFiles.map(file => file.createdAt);
    
    return {
      totalFiles: allFiles.length,
      totalSizeMB,
      maxTotalSizeMB: this.config.maxTotalSizeMB,
      usagePercent: (totalSizeMB / this.config.maxTotalSizeMB) * 100,
      sessionCount: sessionStats.size,
      averageSessionSizeMB: sessionStats.size > 0 ? totalSizeMB / sessionStats.size : 0,
      oldestFile: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null,
      newestFile: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null,
      sessionsOverLimit: Array.from(sessionStats.entries())
        .filter(([, size]) => size > this.config.maxSessionSizeMB)
        .map(([sessionId]) => sessionId)
    };
  }

  /**
   * Lists files for a session
   */
  getSessionFiles(sessionId: string): FileInfo[] {
    return Array.from(this.fileRegistry.values())
      .filter(file => file.sessionId === sessionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Cleans up old files based on age and usage
   */
  async cleanupOldFiles(): Promise<CleanupResult> {
    const now = Date.now();
    const maxAgeMs = this.config.maxFileAgeDays * 24 * 60 * 60 * 1000;
    
    let filesDeleted = 0;
    let spaceFreedMB = 0;

    const filesToDelete = Array.from(this.fileRegistry.entries())
      .filter(([, fileInfo]) => {
        const age = now - fileInfo.createdAt.getTime();
        return age > maxAgeMs;
      });

    for (const [filePath, fileInfo] of filesToDelete) {
      try {
        await fs.unlink(filePath);
        filesDeleted++;
        spaceFreedMB += fileInfo.sizeMB;
        this.fileRegistry.delete(filePath);
      } catch (error) {
        // File might already be deleted
        this.fileRegistry.delete(filePath);
      }
    }

    return { filesDeleted, spaceFreesMB: spaceFreedMB };
  }

  /**
   * Forces cleanup to free space if needed
   */
  async forceCleanup(targetFreeMB: number): Promise<CleanupResult> {
    let totalFreed = 0;
    let totalDeleted = 0;

    // First, clean up old files
    const oldFilesResult = await this.cleanupOldFiles();
    totalFreed += oldFilesResult.spaceFreesMB;
    totalDeleted += oldFilesResult.filesDeleted;

    if (totalFreed >= targetFreeMB) {
      return { filesDeleted: totalDeleted, spaceFreesMB: totalFreed };
    }

    // If still need more space, delete least recently accessed files
    const allFiles = Array.from(this.fileRegistry.entries())
      .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

    for (const [filePath, fileInfo] of allFiles) {
      if (totalFreed >= targetFreeMB) {
        break;
      }

      try {
        await fs.unlink(filePath);
        totalDeleted++;
        totalFreed += fileInfo.sizeMB;
        this.fileRegistry.delete(filePath);
      } catch (error) {
        this.fileRegistry.delete(filePath);
      }
    }

    return { filesDeleted: totalDeleted, spaceFreesMB: totalFreed };
  }

  /**
   * Shuts down the disk manager
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Optional: Clean up all temporary files
    // await this.cleanupAllFiles();
  }

  /**
   * Checks if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Starts the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupOldFiles();
      } catch (error) {
        console.error('Error during disk cleanup:', error);
      }
    }, this.config.cleanupInterval);
  }
}