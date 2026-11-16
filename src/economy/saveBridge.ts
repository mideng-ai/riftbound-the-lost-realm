/**
 * src/economy/saveBridge.ts — SavePort（V2 抽象）→ SaveDataV3 持久化桥
 *
 * D-207 仍 OPEN：后端（localStorage / IndexedDB）**未决定**。
 * 现有 src/save/SavePort.ts 接口只接受 SaveDataV2，因此本桥把 V3 存档
 * 原样装进 V2 的 stash（Array<Record<string, unknown>>）中并加标记键；
 * load 时优先解出 V3，否则把 V2 原样交给 domain/save.ts 的 migrateSave
 * （profile.gold → currencies.gold 迁移）。
 *
 * 这样：① 不修改冻结契约与 SavePort.ts；② 不决定任何存储后端；
 *       ③ 业务层只依赖 EconomyStore 抽象（测试用内存实现）。
 */

import type { SaveDataV3 } from '../domain/index.ts';
import type { SaveDataV2, SavePort } from '../save/SavePort.ts';
import type { EconomyStore } from './types.ts';

/** V3 存档在 V2.stash 中的标记键 */
export const V3_STASH_KEY = '__riftboundSaveV3';

export class SavePortV3Bridge implements EconomyStore {
  private readonly port: SavePort;

  constructor(port: SavePort) {
    this.port = port;
  }

  async load(): Promise<unknown> {
    const raw = await this.port.load();
    if (raw === null || typeof raw !== 'object') return null;
    const stash = (raw as SaveDataV2).stash;
    if (Array.isArray(stash)) {
      for (const entry of stash) {
        if (entry && typeof entry === 'object' && V3_STASH_KEY in entry) {
          return (entry as Record<string, unknown>)[V3_STASH_KEY];
        }
      }
    }
    return raw; // 纯 V2 → migrateSave 处理 gold 迁移
  }

  async save(data: SaveDataV3): Promise<void> {
    const shell: SaveDataV2 = {
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      // 冗余保留 gold 便于旧读取路径；权威值仍在 V3 data.currencies.gold
      profile: { gold: data.currencies.gold, unlocks: [] },
      inventory: [],
      stash: [{ [V3_STASH_KEY]: data as unknown as Record<string, unknown> }],
      settings: { sfx: true, music: true },
    };
    await this.port.save(shell);
  }
}

/** 测试用内存实现（只存在于测试，不构成后端决定） */
export class InMemoryEconomyStore implements EconomyStore {
  private data: unknown;
  private writes = 0;

  constructor(initial: unknown = null) {
    this.data = initial;
  }

  async load(): Promise<unknown> {
    return this.data;
  }

  async save(data: SaveDataV3): Promise<void> {
    this.data = JSON.parse(JSON.stringify(data)) as SaveDataV3;
    this.writes += 1;
  }

  get writeCount(): number {
    return this.writes;
  }
}
