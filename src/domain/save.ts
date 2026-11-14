/**
 * 存档结构 SaveDataV3 + 迁移 + 默认存档。
 *
 * 结构来源：总纲-项目规划书V1.md §2.6（SaveDataV3）。
 * 后端仍走现有 save/SavePort 抽象，**D-207（localStorage vs IndexedDB）保持 OPEN**——
 * 本文件只定义数据形状与纯函数迁移，不碰任何存储 API。
 *
 * 开放问题采信结论：
 *   - Q6 **签收**：socket 存 `itemInstanceId`，不存 gemId。
 *     规划书原文 `sockets: [gemId|null ×3]` 无法区分「同种宝石不同品质」，
 *     因此正式 schema 存指向 gemInventory 的实例 ID。这是对设计文档的一处技术性修正。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import type { ElementId, GemId, GemQuality, WeaponUpgradeLevel } from './ids.ts';
// SaveDataV2 来自现有 save/SavePort.ts：**type-only 导入**，不产生运行时依赖，
// 保持 save/ 后端可替换（工程-技术架构.md §2 规则 4）。
import type { SaveDataV2 } from '../save/SavePort.ts';

/** 存档 schema 版本号。升级 = 必须写迁移函数。 */
export const SAVE_SCHEMA_VERSION = 3 as const;

// ─────────────────────────────────────────────────────────────
// 结构
// ─────────────────────────────────────────────────────────────

/**
 * 单把武器的存档槽。
 *
 * sockets 存 **itemInstanceId**（Q6 签收），不是 gemId：
 *   库存里可能有两颗 fire 宝石（品质不同），存 gemId 就无法知道槽里镶的是哪一颗。
 *   null = 空槽。
 */
export interface WeaponSaveSlot {
  readonly level: WeaponUpgradeLevel;
  /** 固定 3 槽（总纲 §5.5「每把武器 3 个宝石槽位」）；存 itemInstanceId */
  readonly sockets: readonly (string | null)[];
}

/** 永久宝石库存条目。itemInstanceId 是跨存档稳定的唯一标识。 */
export interface GemInventoryItem {
  readonly itemInstanceId: string;
  readonly gemId: GemId;
  readonly quality: GemQuality;
}

/** 本局结算带出的资源（只含**已拾取**的部分，总纲 §6.5）。 */
export interface SaveRunLoot {
  readonly gold: number;
  readonly forestMaterial: number;
  readonly shards: Record<ElementId, number>;
  readonly gems: readonly GemInventoryItem[];
}

/** 货币账户。碎片是四个独立账户（与元素触发的 ElementId 同键名，但语义是资源）。 */
export interface SaveCurrencies {
  readonly gold: number;
  readonly forestMaterial: number;
  readonly elementalShards: Record<ElementId, number>;
  readonly forestCore: number;
}

/** 局外永久成长（均为 Lv.0–Lv.10，总纲 §6.4）。 */
export interface SaveMetaProgress {
  readonly staffMastery: number;
  readonly swordMastery: number;
  readonly forestSurvival: number;
}

/** 设置项。quality / language 是字符串（具体可选值由 UI 层枚举，存档只存值）。 */
export interface SaveSettings {
  readonly volumes: { readonly sfx: number; readonly music: number };
  readonly quality: string;
  readonly colorblind: boolean;
  readonly language: string;
}

/** 统计。bestTimeSec = null 表示尚无通关记录。 */
export interface SaveStats {
  readonly runsPlayed: number;
  readonly bossKills: number;
  readonly bestTimeSec: number | null;
}

/**
 * V3 正式存档。
 *
 * 字段顺序与规划书 §2.6 保持一致，便于人工比对 diff。
 */
export interface SaveDataV3 {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  /** ISO 8601 时间戳 */
  readonly savedAt: string;
  readonly weapons: { readonly staff: WeaponSaveSlot; readonly sword: WeaponSaveSlot };
  readonly gemInventory: readonly GemInventoryItem[];
  readonly currencies: SaveCurrencies;
  readonly metaProgress: SaveMetaProgress;
  readonly settings: SaveSettings;
  readonly stats: SaveStats;
}

// ─────────────────────────────────────────────────────────────
// 工厂
// ─────────────────────────────────────────────────────────────

/** 空武器槽：Lv.1 + 三个空槽。 */
export function createEmptyWeaponSlot(): WeaponSaveSlot {
  return { level: 1, sockets: [null, null, null] };
}

/**
 * 默认存档（首次运行 / 存档损坏时的兜底）。
 *
 * 所有数值都是「从零开始」的合法状态：
 *   武器 Lv.1 / 无宝石 / 无货币 / 永久成长 Lv.0 / 音量为 1.
 */
export function defaultSaveV3(): SaveDataV3 {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    weapons: { staff: createEmptyWeaponSlot(), sword: createEmptyWeaponSlot() },
    gemInventory: [],
    currencies: {
      gold: 0,
      forestMaterial: 0,
      elementalShards: { fire: 0, ice: 0, lightning: 0, shadow: 0 },
      forestCore: 0,
    },
    metaProgress: { staffMastery: 0, swordMastery: 0, forestSurvival: 0 },
    settings: {
      volumes: { sfx: 1, music: 1 },
      quality: 'high',
      colorblind: false,
      language: 'zh-CN',
    },
    stats: { runsPlayed: 0, bossKills: 0, bestTimeSec: null },
  };
}

// ─────────────────────────────────────────────────────────────
// 迁移
// ─────────────────────────────────────────────────────────────

/**
 * V2 → V3 迁移。
 *
 * 迁移规则（规划书 §2.6）：「gold→gold，其余 v2 字段归档不迁移」。
 *
 * 具体处理：
 *   - `profile.gold` → `currencies.gold`（唯一迁移项）
 *   - `settings.sfx` / `settings.music` 是布尔（开/关），V3 是 0–1 音量：
 *     这是**形状不兼容**，按「归档不迁移」处理，一律用默认音量 1。
 *     （把 true 映射成 1 看似无害，但会在 V2 用户关掉音乐时静默变成全音量，
 *      属于「看起来迁移了其实错了」，不如显式重置——反正 V2 是 Mock 阶段的存档。）
 *   - `inventory` / `stash` / `unlocks`：结构未定义（`Record<string, unknown>[]`），
 *     无法安全迁移，归档不迁移。旧数据由调用方在迁移前自行备份（见 migrateSave）。
 *
 * 幂等性：对同一份 v2 反复调用结果一致；不修改入参（纯函数）。
 *
 * @param v2 旧版存档（SavePort 的 V2 形状）
 * @returns 全新 V3 存档
 */
export function migrateV2toV3(v2: SaveDataV2): SaveDataV3 {
  const base = defaultSaveV3();
  const goldRaw = v2?.profile?.gold;
  const gold = typeof goldRaw === 'number' && Number.isFinite(goldRaw) && goldRaw >= 0 ? goldRaw : 0;

  return {
    ...base,
    // 保留迁移发生的时刻（默认存档刚生成的时间即此刻）
    savedAt: new Date().toISOString(),
    currencies: { ...base.currencies, gold },
  };
}

/**
 * 通用迁移入口：任意版本存档 → V3。
 *
 * 为什么不直接暴露 migrateV2toV3 给上层：存档加载点是唯一入口，
 * 若上层自己判断版本号，将来加 V4 时要改所有调用点。集中在这里，只改一个 switch。
 *
 * @param raw 未知形状的原始存档（可能来自 JSON.parse，可能是 null）
 * @returns 合法的 V3 存档（无法识别时返回默认存档，绝不抛错——存档坏了也不能让游戏起不来）
 */
export function migrateSave(raw: unknown): SaveDataV3 {
  if (raw === null || typeof raw !== 'object') return defaultSaveV3();

  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === SAVE_SCHEMA_VERSION) {
    return raw as SaveDataV3;
  }
  if (version === 2) {
    return migrateV2toV3(raw as SaveDataV2);
  }
  // 未知版本（含无版本号的远古存档）：降级为默认存档，并留痕便于排查
  console.warn(`[domain/save] 无法识别的存档版本 ${String(version)}，已回退为默认存档`);
  return defaultSaveV3();
}

/**
 * 校验 V3 存档是否自洽（供加载后、写入前做一次守门）。
 *
 * 只做**结构级**检查（类型/取值范围/引用完整性），不判断玩法合法性：
 *   - socket 里的 itemInstanceId 必须能在 gemInventory 找到（Q6 的直接后果：
 *     socket 存实例 ID，那么悬空 ID 就是坏存档）
 *   - 永久成长等级在 0–10
 *   - 货币非负
 *
 * @returns 问题列表；空数组 = 通过
 */
export function validateSaveV3(save: SaveDataV3): readonly string[] {
  const issues: string[] = [];

  const ids = new Set(save.gemInventory.map((g) => g.itemInstanceId));
  for (const weaponId of ['staff', 'sword'] as const) {
    const slot = save.weapons[weaponId];
    if (slot.sockets.length !== 3) issues.push(`weapons.${weaponId}.sockets 长度应为 3，实际 ${slot.sockets.length}`);
    if (slot.level < 1 || slot.level > 5) issues.push(`weapons.${weaponId}.level 应在 1–5，实际 ${slot.level}`);
    slot.sockets.forEach((socketId, i) => {
      if (socketId !== null && !ids.has(socketId)) {
        issues.push(`weapons.${weaponId}.sockets[${i}] 引用了不存在的 itemInstanceId: ${socketId}`);
      }
    });
  }

  for (const key of ['staffMastery', 'swordMastery', 'forestSurvival'] as const) {
    const lv = save.metaProgress[key];
    if (lv < 0 || lv > 10) issues.push(`metaProgress.${key} 应在 0–10，实际 ${lv}`);
  }

  const currencies: readonly [string, number][] = [
    ['gold', save.currencies.gold],
    ['forestMaterial', save.currencies.forestMaterial],
    ['forestCore', save.currencies.forestCore],
  ];
  for (const [name, value] of currencies) {
    if (!Number.isFinite(value) || value < 0) issues.push(`currencies.${name} 应为非负数，实际 ${value}`);
  }
  for (const element of ['fire', 'ice', 'lightning', 'shadow'] as const) {
    const value = save.currencies.elementalShards[element];
    if (!Number.isFinite(value) || value < 0) issues.push(`currencies.elementalShards.${element} 应为非负数，实际 ${value}`);
  }

  return issues;
}
