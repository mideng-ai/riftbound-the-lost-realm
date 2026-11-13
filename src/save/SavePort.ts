/**
 * SavePort — persistence interface. DECISION GATE (D-207): the concrete
 * backend (localStorage vs IndexedDB) is NOT decided. Until the owner
 * confirms, only this interface and the MockSaveAdapter are wired.
 * See st2003/e-save/README.md for the comparison & recommendation.
 */

export interface SaveDataV2 {
  schemaVersion: number;
  savedAt: string;
  profile: { gold: number; unlocks: string[] };
  inventory: Array<Record<string, unknown>>;
  stash: Array<Record<string, unknown>>;
  settings: { sfx: boolean; music: boolean };
}

export interface SavePort {
  /** load the current save; returns null when absent/first run */
  load(): Promise<SaveDataV2 | null>;
  /** persist a save atomically (implementation must not leave partial state) */
  save(data: SaveDataV2): Promise<void>;
  /** wipe user data (settings menu "reset") */
  reset(): Promise<void>;
}

export const CURRENT_SCHEMA_VERSION = 2;

export function defaultSave(): SaveDataV2 {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    profile: { gold: 0, unlocks: [] },
    inventory: [],
    stash: [],
    settings: { sfx: true, music: true },
  };
}
