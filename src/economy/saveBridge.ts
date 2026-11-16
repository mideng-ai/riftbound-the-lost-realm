/**
 * src/economy/saveBridge.ts — SavePort(V3) → EconomyStore 直传适配
 *
 * ADR-TD-009 / D-207 关闭后，SavePort 已直接承载 SaveDataV3，
 * 本桥从「V3 塞进 V2.stash 的绕行方案」退化为直传适配：
 *   - save：原样交给 port.save(V3)，不再构造 V2 外壳；
 *   - load：直传 V3；若读到 Mock 阶段历史套壳档（V2.stash 含 V3_STASH_KEY），
 *     仍解出 V3，保证旧存档不丢；纯 V2 原样交 domain/save.ts 的 migrateSave。
 *
 * 这样业务层只依赖 EconomyStore 抽象，测试用 InMemoryEconomyStore，不碰后端。
 */
import type { SaveDataV3 } from '../domain/index.ts';
import type { SavePort } from '../save/SavePort.ts';
import type { EconomyStore } from './types.ts';

/** 历史套壳档的标记键（仅用于兼容读取，新的写入不再产生此形状）。 */
export const V3_STASH_KEY = '__riftboundSaveV3';

export class SavePortV3Bridge implements EconomyStore {
  private readonly port: SavePort;

  constructor(port: SavePort) {
    this.port = port;
  }

  async load(): Promise<unknown> {
    const raw: unknown = await this.port.load();
    if (isRecord(raw)) {
      const stash = raw.stash;
      if (Array.isArray(stash)) {
        for (const entry of stash) {
          if (isRecord(entry) && V3_STASH_KEY in entry) {
            return entry[V3_STASH_KEY];
          }
        }
      }
    }
    return raw; // V3 直传 / 纯 V2 交 migrateSave / 畸形交 boot 兜底
  }

  async save(data: SaveDataV3): Promise<void> {
    await this.port.save(data);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
