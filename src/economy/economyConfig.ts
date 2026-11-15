/**
 * src/economy/economyConfig.ts — 经济模块自有数据表（仅补冻结 config 的缺口）
 *
 * ⚠ 冻结契约纪律：src/domain/ 与 src/config/ 只读引用，本模块不修改任何契约文件。
 *   凡 config 已有的数值一律从 config 读：
 *     - 掉落表        → damageConfig.loot
 *     - 成长成本/上限 → metaGrowthCost / playerConfig.metaGrowth（经 domain 桶转出）
 *     - 制作配方      → gemConfig.craft
 *     - Boss 奖励     → enemyConfig.bossReward
 *     - 品质轴        → GEM_QUALITY_MULT_CONST
 *
 * ❗ 已知 config 缺口（已在交付报告登记，建议 TA 后续收编进 src/config/）：
 *   「森林材料武器强化成本 10/20/35/55」在设计总纲 §4.3 与 TASK-04 任务书已定案，
 *   但冻结的 src/config/ 中没有对应键。为避免散落硬编码，集中放在本数据表，
 *   业务代码只读它、不写字面量。本表为 PROVISIONAL（设计总纲 §4.3 标注）。
 */

import type { CurrencyId, ElementId } from '../domain/index.ts';

/**
 * 森林材料武器强化成本（下标 = 当前等级 − 1，即 Lv1→2 / 2→3 / 3→4 / 4→5）。
 * 来源：docs/设计-设计总纲.md §4.3 表 + TASK-04 任务书「10/20/35/55，单武器 120，双武器 240」。
 */
export const WEAPON_UPGRADE_MATERIAL_COST: readonly number[] = [10, 20, 35, 55] as const;

/** 元素碎片货币 ID → 存档元素键（结构映射，非数值） */
export const SHARD_ELEMENT_BY_CURRENCY: Readonly<Record<string, ElementId>> = {
  fireShard: 'fire',
  iceShard: 'ice',
  lightningShard: 'lightning',
  shadowShard: 'shadow',
} as const;

/** 存档元素键 → 元素碎片货币 ID（结构映射，非数值） */
export const SHARD_CURRENCY_BY_ELEMENT: Readonly<Record<ElementId, CurrencyId>> = {
  fire: 'fireShard',
  ice: 'iceShard',
  lightning: 'lightningShard',
  shadow: 'shadowShard',
} as const;

/** 四种元素（掉落碎片种类轮询轴，与 domain 的 ElementId 一致） */
export const ELEMENT_IDS: readonly ElementId[] = ['fire', 'ice', 'lightning', 'shadow'] as const;

/** 地面掉落宝石的默认品质（Boss 用 enemyConfig.bossReward.minGemQuality，见 drops.ts） */
export const DEFAULT_DROP_GEM_QUALITY = 'common' as const;

/**
 * 元素碎片制作产出品质（设计总纲 §6.3「制作普通元素宝石」→ common）。
 * gemConfig.craft 只给消耗，不给产出品质，故在此按文档语义补齐并注明来源。
 */
export const CRAFTED_GEM_QUALITY = 'common' as const;
