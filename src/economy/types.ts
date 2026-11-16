/**
 * src/economy/types.ts — 经济模块公共类型
 *
 * 全部领域类型从 domain 桶导入（分层铁律 L5），不在本模块重定义契约。
 */

import type {
  CurrencyId,
  ElementId,
  EnemyId,
  GemId,
  GemQuality,
  Vec3,
  WeaponId,
  WeaponUpgradeLevel,
  LootRoll,
  SaveRunLoot,
  SaveDataV3,
  GemInventoryItem,
  EventBusApi,
  Rng,
} from '../domain/index.ts';

/** 掉落档位 = 冻结 config 的掉落表键（数据驱动，不另立枚举） */
export type LootTier = 'normal' | 'elemental' | 'reinforced' | 'elite' | 'boss';

/** 一次击杀的掉落摇取参数 */
export interface LootRollInput {
  readonly tier: LootTier;
  /** 碎片种类；缺省时按 defId 推导，再缺省则 rng.pick 四元素 */
  readonly element?: ElementId;
  /** 敌人 ID（用于未来按 defId 决定碎片种类；当前只作追溯） */
  readonly defId?: EnemyId;
  /** 掉落位置（resource.dropped 事件需要 pos；缺省 (0,0,0)） */
  readonly pos?: Vec3;
}

/** 地面货币/资源掉落实例（唯一 dropId 是防重复入账的锚点） */
export interface ResourceDrop {
  readonly kind: 'resource';
  readonly dropId: string;
  readonly currencyId: CurrencyId;
  readonly amount: number;
  readonly tier: LootTier;
  readonly pos: Vec3;
  picked: boolean;
}

/** 地面宝石掉落实例（含实例 ID，符合 LootRoll 注释「TASK-04 填入 itemInstanceId」） */
export interface GemDrop {
  readonly kind: 'gem';
  readonly dropId: string;
  readonly item: GemInventoryItem;
  readonly tier: LootTier;
  readonly pos: Vec3;
  picked: boolean;
}

export type DropInstance = ResourceDrop | GemDrop;

/** 一次击杀摇取结果（currency 部分可直接作为 enemy.killed 事件的 drops） */
export interface LootRollResult {
  readonly rolls: readonly LootRoll[];
  readonly drops: readonly DropInstance[];
}

export interface PickupResult {
  readonly ok: boolean;
  readonly reason?: 'unknown-drop' | 'already-picked';
  readonly drop?: DropInstance;
}

/** 结算输入（没有任何 XP / 局内等级入参 —— 结构性杜绝经验误存） */
export interface SettleRunInput {
  readonly victory: boolean;
  /** 本局是否击败 Boss（森林核心与 bossKills 只在 victory && bossDefeated 时入账，总纲 §6.5） */
  readonly bossDefeated?: boolean;
  /** 通关用时（victory 时刷新 bestTimeSec） */
  readonly elapsedSec?: number;
}

export interface SettlementReport {
  readonly victory: boolean;
  /** 结算入账的已拾取资源（SaveRunLoot 契约形状） */
  readonly credited: SaveRunLoot;
  /** 地面未拾取、被丢弃的资源明细 */
  readonly discarded: Readonly<Record<string, number>>;
  /** 胜利击败 Boss 时入账的森林核心数量（非胜利 = 0） */
  readonly forestCoreCredited: number;
  readonly bossKillsCredited: number;
}

/** 存档读写端口（V3 载荷；后端仍由 SavePort 决定，D-207 OPEN） */
export interface EconomyStore {
  /** 返回原始存档（V2 / V3 / null / 畸形数据皆可，由 migrateSave 统一处理） */
  load(): Promise<unknown>;
  save(data: SaveDataV3): Promise<void>;
}

export interface PurchaseResult {
  readonly ok: boolean;
  readonly reason?: 'insufficient-gold' | 'already-max' | 'persist-failed';
  readonly fromLevel?: number;
  readonly toLevel?: number;
  readonly goldSpent?: number;
}

export interface WeaponUpgradeResult {
  readonly ok: boolean;
  readonly reason?: 'insufficient-material' | 'already-max' | 'persist-failed';
  readonly fromLevel?: WeaponUpgradeLevel;
  readonly toLevel?: WeaponUpgradeLevel;
  readonly materialSpent?: number;
}

export interface CraftResult {
  readonly ok: boolean;
  readonly reason?: 'insufficient-shard' | 'insufficient-material' | 'not-craftable' | 'persist-failed';
  readonly shardSpent?: number;
  readonly materialSpent?: number;
  readonly created?: GemInventoryItem;
}

export type {
  CurrencyId,
  ElementId,
  GemId,
  GemQuality,
  WeaponId,
  WeaponUpgradeLevel,
  Vec3,
  LootRoll,
  SaveRunLoot,
  SaveDataV3,
  GemInventoryItem,
  EventBusApi,
  Rng,
};
