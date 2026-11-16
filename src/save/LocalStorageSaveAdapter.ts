/**
 * LocalStorageSaveAdapter — D-207 正式后端（ADR-TD-009）。
 *
 * 键协议与三项防护采信 st2003/e-save/README.md §3 的实证建议：
 *   ① 版本字段 + domain/save.ts 的 migrateSave（v2→v3 / v3 直通 / 未知回默认）
 *   ② 损坏 JSON 隔离到 `_corrupt_backup` + 回默认档，绝不抛错、绝不覆盖原档
 *   ③ 写前临时键协议：save_next → 读回校验 → 覆盖 save_main → 删 save_next；
 *      启动发现 save_next 有效优先恢复，损坏则隔离并回退 save_main
 *
 * 依赖方向：save → domain（纯函数迁移/校验）；不 import Babylon / DOM 类型以外的东西。
 * localStorage 通过 StorageLike 注入，headless 测试用内存 mock，零新增 npm 依赖。
 */
import type { SavePort } from './SavePort.ts';
import type { SaveDataV3 } from '../domain/save.ts';
import { defaultSaveV3, migrateSave, validateSaveV3 } from '../domain/save.ts';

/** 可注入的最小存储接口；浏览器 localStorage 天然满足。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 主档键：唯一权威存档。 */
export const SAVE_MAIN_KEY = 'riftbound.save_main';
/** 写前临时键：存在即视为上次写入中断。 */
export const SAVE_NEXT_KEY = 'riftbound.save_next';
/** 损坏隔离键：保留坏档原文供取证，不覆盖。 */
export const SAVE_CORRUPT_BACKUP_KEY = 'riftbound.save_corrupt_backup';

/** 浏览器默认后端；延迟到构造时取，便于 headless 环境只注入 mock。 */
export function browserStorage(): StorageLike {
  const store = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (!store) {
    throw new Error('[LocalStorageSaveAdapter] localStorage 不可用，请显式注入 StorageLike');
  }
  return store;
}

export class LocalStorageSaveAdapter implements SavePort {
  private readonly storage: StorageLike;

  constructor(storage: StorageLike = browserStorage()) {
    this.storage = storage;
  }

  /** 同步读档：供 CombatRuntime 构造时消费，使重载后的成长立即生效。 */
  loadSync(): SaveDataV3 {
    const pending = this.storage.getItem(SAVE_NEXT_KEY);
    if (pending !== null) {
      const recovered = parseMigrateValidate(pending);
      if (recovered !== null) {
        // L6b：临时键有效 → 优先恢复并正式提交主档，再清临时键。
        try {
          this.storage.setItem(SAVE_MAIN_KEY, pending);
        } catch (err) {
          // 恢复已拿到手；主档写失败只告警，不阻断开局（下次仍可从 pending 恢复）。
          console.warn('[save] 恢复 save_next 时写主档失败，本次使用内存中的恢复档', err);
        }
        this.removeNext();
        return recovered;
      }
      // L6c：临时键损坏 → 隔离备份、清临时键、回退主档。
      this.quarantine(pending);
      this.removeNext();
    }
    return this.readMain();
  }

  async load(): Promise<SaveDataV3> {
    return this.loadSync();
  }

  async save(data: SaveDataV3): Promise<void> {
    let issues: readonly string[];
    try {
      issues = validateSaveV3(data);
    } catch (err) {
      throw new Error(`[save] 存档结构不可校验，拒绝写入：${String(err)}`);
    }
    if (issues.length > 0) {
      throw new Error(`[save] 拒绝写入非法存档：${issues.join('; ')}`);
    }
    const serialized = JSON.stringify(data);

    // 1) 写临时键：配额失败在此抛出，主档完全未触碰（e-save L6）。
    this.storage.setItem(SAVE_NEXT_KEY, serialized);

    // 2) 读回校验：临时键必须可解析、可迁移且通过契约校验。
    const written = this.storage.getItem(SAVE_NEXT_KEY);
    if (written === null || parseMigrateValidate(written) === null) {
      this.removeNext();
      throw new Error('[save] 临时键校验失败，主档未改动');
    }

    // 3) 覆盖主档。
    this.storage.setItem(SAVE_MAIN_KEY, serialized);

    // 4) 清理临时键。
    this.removeNext();
  }

  async reset(): Promise<void> {
    this.storage.removeItem(SAVE_NEXT_KEY);
    this.storage.removeItem(SAVE_MAIN_KEY);
    // 损坏隔离备份刻意保留，便于玩家/QA 取证。
  }

  private readMain(): SaveDataV3 {
    const raw = this.storage.getItem(SAVE_MAIN_KEY);
    if (raw === null) return defaultSaveV3();
    const parsed = parseMigrateValidate(raw);
    if (parsed !== null) return parsed;
    // L3：坏主档只隔离，不删除、不覆盖、不抛错。
    this.quarantine(raw);
    return defaultSaveV3();
  }

  /** 隔离坏档原文；已有备份时另存带时间戳的键，绝不覆盖历史取证。 */
  private quarantine(raw: string): void {
    try {
      const existing = this.storage.getItem(SAVE_CORRUPT_BACKUP_KEY);
      const key = existing === null
        ? SAVE_CORRUPT_BACKUP_KEY
        : `${SAVE_CORRUPT_BACKUP_KEY}_${Date.now()}`;
      this.storage.setItem(key, raw);
    } catch (err) {
      console.warn('[save] 损坏隔离写入失败（不影响回默认档）', err);
    }
  }

  private removeNext(): void {
    try {
      this.storage.removeItem(SAVE_NEXT_KEY);
    } catch (err) {
      console.warn('[save] 临时键清理失败', err);
    }
  }
}

/** JSON 解析 → 统一迁移入口 → 契约守门；任一环节失败返回 null（绝不抛错）。 */
function parseMigrateValidate(raw: string): SaveDataV3 | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  try {
    const migrated = migrateSave(value);
    // validateSaveV3 只承诺「合法输入不抛」；对半截对象可能自身抛错。
    // 后端必须把它一律判为坏档，绝不把异常冒到加载路径（L3 铁律：存档坏了也要能开局）。
    return validateSaveV3(migrated).length > 0 ? null : migrated;
  } catch {
    return null;
  }
}
