import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileMacroStorage } from '../../../src/tools/macro-storage.js';
import type { MacroRecording } from '../../../src/types/macro-types.js';

describe('FileMacroStorage', () => {
  let storage: FileMacroStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'test-macros-' + Date.now());
    storage = new FileMacroStorage(testDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  const createTestMacro = (): MacroRecording => ({
    id: 'test-macro-1',
    name: 'Test Macro',
    sessionId: 'session-1',
    startTime: new Date('2023-01-01T10:00:00Z'),
    endTime: new Date('2023-01-01T10:05:00Z'),
    actions: [
      {
        id: 'action-1',
        type: 'navigation',
        timestamp: new Date('2023-01-01T10:00:00Z'),
        url: 'https://example.com'
      },
      {
        id: 'action-2',
        type: 'click',
        timestamp: new Date('2023-01-01T10:01:00Z'),
        selector: '#button1'
      }
    ],
    isActive: false,
    metadata: {
      description: 'A test macro',
      startUrl: 'https://example.com'
    }
  });

  describe('saveMacro', () => {
    it('should save a macro to storage', async () => {
      const macro = createTestMacro();
      
      await storage.saveMacro(macro);
      
      const filePath = path.join(testDir, `${macro.id}.json`);
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should create storage directory if it does not exist', async () => {
      const macro = createTestMacro();
      
      await storage.saveMacro(macro);
      
      const dirExists = await fs.access(testDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('getMacro', () => {
    it('should retrieve a saved macro', async () => {
      const macro = createTestMacro();
      await storage.saveMacro(macro);
      
      const retrieved = await storage.getMacro(macro.id);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(macro.id);
      expect(retrieved!.name).toBe(macro.name);
      expect(retrieved!.actions).toHaveLength(2);
      expect(retrieved!.startTime).toEqual(macro.startTime);
      expect(retrieved!.endTime).toEqual(macro.endTime);
    });

    it('should return null for non-existent macro', async () => {
      const retrieved = await storage.getMacro('non-existent');
      
      expect(retrieved).toBeNull();
    });
  });

  describe('listMacros', () => {
    it('should list all macros', async () => {
      const macro1 = createTestMacro();
      const macro2 = { ...createTestMacro(), id: 'test-macro-2', name: 'Test Macro 2' };
      
      await storage.saveMacro(macro1);
      await storage.saveMacro(macro2);
      
      const macros = await storage.listMacros();
      
      expect(macros).toHaveLength(2);
      expect(macros.map(m => m.id)).toContain(macro1.id);
      expect(macros.map(m => m.id)).toContain(macro2.id);
    });

    it('should filter macros by session ID', async () => {
      const macro1 = createTestMacro();
      const macro2 = { ...createTestMacro(), id: 'test-macro-2', sessionId: 'session-2' };
      
      await storage.saveMacro(macro1);
      await storage.saveMacro(macro2);
      
      const macros = await storage.listMacros('session-1');
      
      expect(macros).toHaveLength(1);
      expect(macros[0].id).toBe(macro1.id);
    });

    it('should return empty array when no macros exist', async () => {
      const macros = await storage.listMacros();
      
      expect(macros).toHaveLength(0);
    });
  });

  describe('deleteMacro', () => {
    it('should delete an existing macro', async () => {
      const macro = createTestMacro();
      await storage.saveMacro(macro);
      
      const deleted = await storage.deleteMacro(macro.id);
      
      expect(deleted).toBe(true);
      
      const retrieved = await storage.getMacro(macro.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent macro', async () => {
      const deleted = await storage.deleteMacro('non-existent');
      
      expect(deleted).toBe(false);
    });
  });

  describe('updateMacro', () => {
    it('should update an existing macro', async () => {
      const macro = createTestMacro();
      await storage.saveMacro(macro);
      
      const updated = await storage.updateMacro(macro.id, {
        name: 'Updated Macro Name',
        metadata: { ...macro.metadata, description: 'Updated description' }
      });
      
      expect(updated).toBe(true);
      
      const retrieved = await storage.getMacro(macro.id);
      expect(retrieved!.name).toBe('Updated Macro Name');
      expect(retrieved!.metadata.description).toBe('Updated description');
    });

    it('should return false for non-existent macro', async () => {
      const updated = await storage.updateMacro('non-existent', { name: 'New Name' });
      
      expect(updated).toBe(false);
    });

    it('should not allow changing the macro ID', async () => {
      const macro = createTestMacro();
      await storage.saveMacro(macro);
      
      await storage.updateMacro(macro.id, { id: 'different-id' } as any);
      
      const retrieved = await storage.getMacro(macro.id);
      expect(retrieved!.id).toBe(macro.id);
    });
  });
});