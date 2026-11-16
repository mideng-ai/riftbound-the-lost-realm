/**
 * MockSaveAdapter — 内存 SavePort（测试 / 无 DOM 环境回退用）。
 *
 * D-207 已由 ADR-TD-009 关闭，生产入口使用 LocalStorageSaveAdapter；
 * 本实现保留为可注入测试替身，接口与真后端同为 V3。
 */
import type { SavePort } from './SavePort.ts';
import type { SaveDataV3 } from '../domain/save.ts';
import { defaultSaveV3, validateSaveV3 } from '../domain/save.ts';

export class MockSaveAdapter implements SavePort {
  private data: SaveDataV3 | null = null;

  loadSync(): SaveDataV3 {
    return this.data === null ? defaultSaveV3() : (JSON.parse(JSON.stringify(this.data)) as SaveDataV3);
  }

  async load(): Promise<SaveDataV3> {
    return this.loadSync();
  }

  async save(data: SaveDataV3): Promise<void> {
    const issues = validateSaveV3(data);
    if (issues.length > 0) {
      throw new Error(`[MockSaveAdapter] 拒绝写入非法存档：${issues.join('; ')}`);
    }
    this.data = JSON.parse(JSON.stringify(data)) as SaveDataV3;
  }

  async reset(): Promise<void> {
    this.data = defaultSaveV3();
  }
}
