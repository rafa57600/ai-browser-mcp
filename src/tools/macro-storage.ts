import * as fs from 'fs/promises';
import * as path from 'path';
import type { MacroRecording, MacroStorage } from '../types/macro-types.js';

/**
 * File-based macro storage implementation
 */
export class FileMacroStorage implements MacroStorage {
  private readonly storageDir: string;

  constructor(storageDir: string = path.join(process.cwd(), 'macros')) {
    this.storageDir = storageDir;
  }

  /**
   * Ensures the storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create macro storage directory: ${error}`);
    }
  }

  /**
   * Gets the file path for a macro
   */
  private getMacroFilePath(macroId: string): string {
    return path.join(this.storageDir, `${macroId}.json`);
  }

  /**
   * Saves a macro recording to storage
   */
  async saveMacro(macro: MacroRecording): Promise<void> {
    await this.ensureStorageDir();
    
    try {
      const filePath = this.getMacroFilePath(macro.id);
      const macroData = {
        ...macro,
        // Convert dates to ISO strings for JSON serialization
        startTime: macro.startTime.toISOString(),
        endTime: macro.endTime?.toISOString(),
        actions: macro.actions.map(action => ({
          ...action,
          timestamp: action.timestamp.toISOString()
        }))
      };
      
      await fs.writeFile(filePath, JSON.stringify(macroData, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save macro ${macro.id}: ${error}`);
    }
  }

  /**
   * Retrieves a macro recording from storage
   */
  async getMacro(macroId: string): Promise<MacroRecording | null> {
    try {
      const filePath = this.getMacroFilePath(macroId);
      const data = await fs.readFile(filePath, 'utf-8');
      const macroData = JSON.parse(data);
      
      // Convert ISO strings back to Date objects
      return {
        ...macroData,
        startTime: new Date(macroData.startTime),
        endTime: macroData.endTime ? new Date(macroData.endTime) : undefined,
        actions: macroData.actions.map((action: any) => ({
          ...action,
          timestamp: new Date(action.timestamp)
        }))
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null; // Macro not found
      }
      throw new Error(`Failed to load macro ${macroId}: ${error}`);
    }
  }

  /**
   * Lists all macro recordings, optionally filtered by session ID
   */
  async listMacros(sessionId?: string): Promise<MacroRecording[]> {
    try {
      await this.ensureStorageDir();
      const files = await fs.readdir(this.storageDir);
      const macroFiles = files.filter(file => file.endsWith('.json'));
      
      const macros: MacroRecording[] = [];
      
      for (const file of macroFiles) {
        try {
          const macroId = path.basename(file, '.json');
          const macro = await this.getMacro(macroId);
          
          if (macro && (!sessionId || macro.sessionId === sessionId)) {
            macros.push(macro);
          }
        } catch (error) {
          // Skip corrupted macro files
          console.warn(`Skipping corrupted macro file ${file}: ${error}`);
        }
      }
      
      // Sort by start time (newest first)
      return macros.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    } catch (error) {
      throw new Error(`Failed to list macros: ${error}`);
    }
  }

  /**
   * Deletes a macro recording from storage
   */
  async deleteMacro(macroId: string): Promise<boolean> {
    try {
      const filePath = this.getMacroFilePath(macroId);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return false; // Macro not found
      }
      throw new Error(`Failed to delete macro ${macroId}: ${error}`);
    }
  }

  /**
   * Updates a macro recording in storage
   */
  async updateMacro(macroId: string, updates: Partial<MacroRecording>): Promise<boolean> {
    try {
      const existingMacro = await this.getMacro(macroId);
      if (!existingMacro) {
        return false;
      }
      
      const updatedMacro: MacroRecording = {
        ...existingMacro,
        ...updates,
        id: macroId // Ensure ID cannot be changed
      };
      
      await this.saveMacro(updatedMacro);
      return true;
    } catch (error) {
      throw new Error(`Failed to update macro ${macroId}: ${error}`);
    }
  }
}