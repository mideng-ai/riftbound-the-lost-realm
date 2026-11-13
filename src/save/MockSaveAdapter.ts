/**
 * MockSaveAdapter — in-memory SavePort. D-207 decision gate: no real
 * persistence backend is wired until the owner confirms the storage choice.
 * Swap via a future LocalStorageSaveAdapter / IndexedDbSaveAdapter.
 * (Comparison evidence: spikes/ST2-003-E-SAVE/)
 */
import type { SavePort, SaveDataV2 } from './SavePort';
import { defaultSave } from './SavePort';

export class MockSaveAdapter implements SavePort {
  private data: SaveDataV2 | null = null;

  async load(): Promise<SaveDataV2 | null> {
    return this.data;
  }

  async save(data: SaveDataV2): Promise<void> {
    this.data = JSON.parse(JSON.stringify(data)) as SaveDataV2;
  }

  async reset(): Promise<void> {
    this.data = defaultSave();
  }
}
