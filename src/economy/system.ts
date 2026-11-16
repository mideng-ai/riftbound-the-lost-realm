/**
 * src/economy/system.ts — 经济系统聚合（TASK-04 核心集成层）
 *
 * 启动：EconomyStore.load → migrateSave / 温和修复 → validateSaveV3 → 内存权威存档
 * 局内：掉落铺场（读 damageConfig.loot）→ 地面拾取（dropId 防重入）→ 本局账本
 * 结算：已拾取资源入账（胜负皆保留）；地面未拾取丢弃；
 *       森林核心与 Boss 击败进度只在 victory && bossDefeated 入账（总纲 §6.5）；
 *       本局经验不入存档（存档无 XP 字段、结算接口无 XP 入参）
 * 局外：金币成长 / 材料强化 / 碎片制作，均即时持久化
 *
 * 红线：不触碰战斗伤害与敌人 AI；不改冻结契约；存储后端仍由 SavePort 决定（D-207 OPEN）。
 */

import { enemyConfig } from '../config/enemyConfig.ts';
import {
  defaultSaveV3,
  migrateSave,
  validateSaveV3,
  type EventBusApi,
  type GemInventoryItem,
  type Rng,
  type SaveDataV3,
  type SaveRunLoot,
  type WeaponSaveSlot,
} from '../domain/index.ts';
import { rollLoot, DropRegistry } from './drops.ts';
import { RunLedger } from './ledger.ts';
import { quoteMetaGrowth, type MetaGrowthTrackId } from './growth.ts';
import { quoteWeaponUpgrade } from './weaponUpgrade.ts';
import { quoteCraftElementGem } from './crafting.ts';
import type {
  CraftResult,
  EconomyStore,
  LootRollInput,
  LootRollResult,
  PickupResult,
  PurchaseResult,
  SettlementReport,
  SettleRunInput,
  WeaponUpgradeResult,
} from './types.ts';
import type { ElementId, WeaponId, WeaponUpgradeLevel } from '../domain/index.ts';

export interface BootReport {
  readonly source: 'fresh' | 'v2-migrated' | 'v3-loaded' | 'v3-fallback';
  /** 校验/修复期间发现的问题（不抛错，只登记） */
  readonly issues: readonly string[];
}

export interface PersistResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

let instanceSeq = 0;

export class EconomySystem {
  private readonly store: EconomyStore;
  private readonly bus: EventBusApi;
  private readonly rng: Rng;

  /** 内存权威存档；SaveDataV3 字段 readonly，所有变更都构造新对象（不可变更新） */
  private save: SaveDataV3 = defaultSaveV3();
  private registry = new DropRegistry();
  private ledger: RunLedger;
  private dropSeq = 0;
  private runSeq = 0;
  private bossDefeatedThisRun = false;

  constructor(store: EconomyStore, bus: EventBusApi, rng: Rng) {
    this.store = store;
    this.bus = bus;
    this.rng = rng;
    this.ledger = new RunLedger(bus);
  }

  // ── 启动 ────────────────────────────────────────────────

  async boot(): Promise<BootReport> {
    const raw = await this.store.load();
    if (isRecord(raw) && raw.schemaVersion === 3) {
      const repaired = normalizeV3(raw);
      const issues = validateSaveV3(repaired);
      if (issues.length === 0) {
        this.save = repaired;
        return { source: 'v3-loaded', issues: [] };
      }
      // 修复后仍不合法 → 兜底默认档（畸形存档不抛错、不放行脏数据）
      this.save = defaultSaveV3();
      return { source: 'v3-fallback', issues };
    }

    // V2 / 未知版本 / 畸形：domain/save.ts 的 migrateSave 保证绝不抛错
    const migrated = migrateSave(raw);
    const issues = validateSaveV3(migrated);
    if (issues.length > 0) {
      this.save = defaultSaveV3();
      return { source: 'fresh', issues };
    }
    this.save = migrated;
    const isV2 = isRecord(raw) && raw.schemaVersion === 2;
    return { source: isV2 ? 'v2-migrated' : 'fresh', issues: [] };
  }

  // ── 局内 ────────────────────────────────────────────────

  beginRun(): void {
    this.registry = new DropRegistry();
    this.ledger = new RunLedger(this.bus);
    this.dropSeq = 0;
    this.bossDefeatedThisRun = false;
    this.runSeq += 1;
  }

  /** 击杀掉落：读冻结 config 的掉落表，铺到地面并发布 resource.dropped */
  rollDropsForKill(input: LootRollInput): LootRollResult {
    const result = rollLoot(input, this.rng, {
      nextDropId: () => this.nextDropId(),
      nextInstanceId: () => this.nextInstanceId(),
    });
    this.registry.register(result.drops);
    for (const drop of result.drops) {
      if (drop.kind === 'resource') {
        this.bus.publish('resource.dropped', {
          currencyId: drop.currencyId,
          amount: drop.amount,
          pos: drop.pos,
        });
      }
    }
    return result;
  }

  /** 拾取（一个 dropId 只入账一次） */
  pickup(dropId: string): PickupResult {
    const drop = this.registry.get(dropId);
    if (!drop) return { ok: false, reason: 'unknown-drop' };
    if (drop.picked) return { ok: false, reason: 'already-picked' };
    return this.ledger.pickup(drop);
  }

  /** 本局 Boss 击败（每局一次；核心与进度在结算时按胜利条件入账） */
  onBossDefeated(atSec: number): boolean {
    if (this.bossDefeatedThisRun) return false;
    this.bossDefeatedThisRun = true;
    this.bus.publish('boss.defeated', { atSec });
    return true;
  }

  // ── 结算 ────────────────────────────────────────────────

  /**
   * 结束一局（victory / defeat 同规则保留已拾取资源）。
   * 森林核心只由 Boss 胜利奖励（总纲 §6.5），失败结算不给 core、不加 bossKills。
   */
  async settleRun(input: SettleRunInput): Promise<SettlementReport> {
    const credited = this.ledger.buildRunLoot();
    const discarded = this.registry.discardedSummary;
    const bossCredited = input.victory && this.bossDefeatedThisRun;
    const forestCoreCredited = bossCredited ? enemyConfig.bossReward.forestCore : 0;
    const bossKillsCredited = bossCredited ? 1 : 0;

    const prev = this.save;
    const bestTimeSec =
      input.victory && typeof input.elapsedSec === 'number' && Number.isFinite(input.elapsedSec)
        ? prev.stats.bestTimeSec === null
          ? input.elapsedSec
          : Math.min(prev.stats.bestTimeSec, input.elapsedSec)
        : prev.stats.bestTimeSec;

    const next: SaveDataV3 = {
      ...prev,
      savedAt: new Date().toISOString(),
      currencies: {
        ...prev.currencies,
        gold: prev.currencies.gold + credited.gold,
        forestMaterial: prev.currencies.forestMaterial + credited.forestMaterial,
        elementalShards: {
          fire: prev.currencies.elementalShards.fire + credited.shards.fire,
          ice: prev.currencies.elementalShards.ice + credited.shards.ice,
          lightning: prev.currencies.elementalShards.lightning + credited.shards.lightning,
          shadow: prev.currencies.elementalShards.shadow + credited.shards.shadow,
        },
        forestCore: prev.currencies.forestCore + forestCoreCredited,
      },
      gemInventory: [...prev.gemInventory, ...credited.gems],
      stats: {
        ...prev.stats,
        runsPlayed: prev.stats.runsPlayed + 1,
        bossKills: prev.stats.bossKills + bossKillsCredited,
        bestTimeSec,
      },
    };

    const committed = await this.commit(next);
    const report: SettlementReport = {
      victory: input.victory,
      credited,
      discarded,
      forestCoreCredited: committed ? forestCoreCredited : 0,
      bossKillsCredited: committed ? bossKillsCredited : 0,
    };
    if (committed) {
      this.bus.publish('run.settled', {
        victory: input.victory,
        pickedResources: credited,
      });
    }
    return report;
  }

  // ── 局外永久消费 ─────────────────────────────────────────

  /** 金币购买成长 +1 级（成本读冻结 config；上限 Lv.10） */
  async purchaseMetaGrowth(track: MetaGrowthTrackId): Promise<PurchaseResult> {
    const quote = quoteMetaGrowth(this.save, track);
    if (!quote.ok) return quote;
    const prev = this.save;
    const next: SaveDataV3 = {
      ...prev,
      currencies: {
        ...prev.currencies,
        gold: prev.currencies.gold - (quote.goldSpent ?? 0),
      },
      metaProgress: {
        ...prev.metaProgress,
        [track]: quote.toLevel ?? prev.metaProgress[track],
      },
    };
    if (!(await this.commit(next))) return { ...quote, ok: false, reason: 'persist-failed' };
    return quote;
  }

  /** 森林材料强化武器 +1 级（Lv.5 封顶） */
  async upgradeWeapon(weapon: WeaponId): Promise<WeaponUpgradeResult> {
    const quote = quoteWeaponUpgrade(this.save, weapon);
    if (!quote.ok) return quote;
    const prev = this.save;
    const level = (quote.toLevel ?? 1) as WeaponUpgradeLevel;
    const nextSlot: WeaponSaveSlot = { ...prev.weapons[weapon], level };
    const next: SaveDataV3 = {
      ...prev,
      currencies: {
        ...prev.currencies,
        forestMaterial: prev.currencies.forestMaterial - (quote.materialSpent ?? 0),
      },
      weapons: { ...prev.weapons, [weapon]: nextSlot },
    };
    if (!(await this.commit(next))) return { ...quote, ok: false, reason: 'persist-failed' };
    this.bus.publish('weapon.upgraded', { weaponId: weapon, level });
    return quote;
  }

  /** 元素碎片 + 材料制作普通元素宝石（数值读 gemConfig.craft） */
  async craftGem(element: ElementId): Promise<CraftResult> {
    const quote = quoteCraftElementGem(this.save, element, () => this.nextInstanceId());
    if (!quote.ok || !quote.created) return quote;
    const prev = this.save;
    const next: SaveDataV3 = {
      ...prev,
      currencies: {
        ...prev.currencies,
        forestMaterial: prev.currencies.forestMaterial - (quote.materialSpent ?? 0),
        elementalShards: {
          ...prev.currencies.elementalShards,
          [element]: prev.currencies.elementalShards[element] - (quote.shardSpent ?? 0),
        },
      },
      gemInventory: [...prev.gemInventory, quote.created],
    };
    if (!(await this.commit(next))) return { ...quote, ok: false, reason: 'persist-failed' };
    return quote;
  }

  // ── 持久化 ──────────────────────────────────────────────

  /** 校验通过才落盘；失败拒绝写入（保护存档），不抛错 */
  async persist(): Promise<PersistResult> {
    const issues = validateSaveV3(this.save);
    if (issues.length > 0) return { ok: false, issues };
    await this.store.save(this.save);
    return { ok: true, issues: [] };
  }

  private async commit(next: SaveDataV3): Promise<boolean> {
    const issues = validateSaveV3(next);
    if (issues.length > 0) return false;
    await this.store.save(next);
    this.save = next;
    return true;
  }

  // ── 只读视图 ────────────────────────────────────────────

  get saveView(): Readonly<SaveDataV3> {
    return this.save;
  }

  get gold(): number {
    return this.save.currencies.gold;
  }

  get material(): number {
    return this.save.currencies.forestMaterial;
  }

  shardBalance(element: ElementId): number {
    return this.save.currencies.elementalShards[element];
  }

  get forestCore(): number {
    return this.save.currencies.forestCore;
  }

  /** Boss 击败进度 = SaveStats.bossKills（冻结契约字段） */
  get bossKills(): number {
    return this.save.stats.bossKills;
  }

  metaLevel(track: MetaGrowthTrackId): number {
    return this.save.metaProgress[track];
  }

  weaponLevel(weapon: WeaponId): number {
    return this.save.weapons[weapon].level;
  }

  get registryView(): DropRegistry {
    return this.registry;
  }

  get ledgerView(): RunLedger {
    return this.ledger;
  }

  /** 结算预览（不写存档，供 UI 显示本局已拾取） */
  get runLootView(): SaveRunLoot {
    return this.ledger.buildRunLoot();
  }

  private nextDropId(): string {
    this.dropSeq += 1;
    return `run${this.runSeq}-drop${this.dropSeq}`;
  }

  private nextInstanceId(): string {
    instanceSeq += 1;
    return `inst-${Date.now().toString(36)}-${instanceSeq.toString(36)}`;
  }
}

// ── 温和修复（畸形 V3 不抛错；合法字段保留、缺字段补默认、保 gold） ──

function normalizeV3(raw: unknown): SaveDataV3 {
  const base = defaultSaveV3();
  if (!isRecord(raw)) return base;
  const s = raw;
  const currencies = isRecord(s.currencies) ? s.currencies : {};
  const shards = isRecord(currencies.elementalShards) ? currencies.elementalShards : {};
  const weapons = isRecord(s.weapons) ? s.weapons : {};
  const meta = isRecord(s.metaProgress) ? s.metaProgress : {};
  const settings = isRecord(s.settings) ? s.settings : {};
  const volumes = isRecord(settings.volumes) ? settings.volumes : {};
  const stats = isRecord(s.stats) ? s.stats : {};

  return {
    schemaVersion: 3,
    savedAt: typeof s.savedAt === 'string' ? s.savedAt : base.savedAt,
    weapons: {
      staff: normalizeSlot(weapons.staff, base.weapons.staff),
      sword: normalizeSlot(weapons.sword, base.weapons.sword),
    },
    gemInventory: Array.isArray(s.gemInventory)
      ? (s.gemInventory as GemInventoryItem[])
      : [],
    currencies: {
      gold: nonNegNum(currencies.gold),
      forestMaterial: nonNegNum(currencies.forestMaterial),
      elementalShards: {
        fire: nonNegNum(shards.fire),
        ice: nonNegNum(shards.ice),
        lightning: nonNegNum(shards.lightning),
        shadow: nonNegNum(shards.shadow),
      },
      forestCore: nonNegNum(currencies.forestCore),
    },
    metaProgress: {
      staffMastery: nonNegNum(meta.staffMastery),
      swordMastery: nonNegNum(meta.swordMastery),
      forestSurvival: nonNegNum(meta.forestSurvival),
    },
    settings: {
      volumes: {
        sfx: nonNegNum(volumes.sfx, 1),
        music: nonNegNum(volumes.music, 1),
      },
      quality: typeof settings.quality === 'string' ? settings.quality : base.settings.quality,
      colorblind: typeof settings.colorblind === 'boolean' ? settings.colorblind : base.settings.colorblind,
      language: typeof settings.language === 'string' ? settings.language : base.settings.language,
    },
    stats: {
      runsPlayed: nonNegNum(stats.runsPlayed),
      bossKills: nonNegNum(stats.bossKills),
      bestTimeSec:
        typeof stats.bestTimeSec === 'number' && Number.isFinite(stats.bestTimeSec)
          ? stats.bestTimeSec
          : null,
    },
  };
}

function normalizeSlot(value: unknown, fallback: WeaponSaveSlot): WeaponSaveSlot {
  if (!isRecord(value)) return fallback;
  const level = typeof value.level === 'number' && value.level >= 1 && value.level <= 5
    ? (Math.floor(value.level) as WeaponUpgradeLevel)
    : fallback.level;
  const sockets = Array.isArray(value.sockets) && value.sockets.length === 3
    ? value.sockets.map((id) => (typeof id === 'string' ? id : null))
    : fallback.sockets;
  return { level, sockets };
}

function nonNegNum(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
