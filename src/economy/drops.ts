/**
 * src/economy/drops.ts — 数据驱动掉落摇取 + 地面掉落注册表
 *
 * 验收：掉落表数据驱动，改 src/config/damageConfig.ts 即生效。
 *   本文件不写任何掉落数值/概率字面量：全部读 damageConfig.loot。
 *   Boss 宝石品质读 enemyConfig.bossReward.minGemQuality，
 *   制作/成长/强化数值分别读 gemConfig / playerConfig / economyConfig。
 *
 * Rng.int 契约是 [min, maxExclusive)，而 config 的 min/max 是含端点区间，
 * 因此统一用 rng.int(min, max + 1)（不另造随机数实现）。
 */

import { damageConfig } from '../config/damageConfig.ts';
import { enemyConfig } from '../config/enemyConfig.ts';
import { gemConfig } from '../config/gemConfig.ts';
import type {
  CurrencyId,
  ElementId,
  GemId,
  GemQuality,
  LootRoll,
  Rng,
  Vec3,
} from '../domain/index.ts';
import {
  DEFAULT_DROP_GEM_QUALITY,
  ELEMENT_IDS,
  SHARD_CURRENCY_BY_ELEMENT,
} from './economyConfig.ts';
import type {
  DropInstance,
  LootRollInput,
  LootRollResult,
  LootTier,
} from './types.ts';

export interface DropIdFactory {
  nextDropId(): string;
  nextInstanceId(): string;
}

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * 摇滚一次击杀掉落。
 *
 * - gold：按表必掉（min–max 含端点）
 * - material / shard：按表 chance；shard 种类由 input.element 决定（缺省 rng.pick 四元素）
 * - gem：按表 chance；产出宝石实例（唯一 itemInstanceId）。
 *   普通档默认 common，Boss 档下限取 enemyConfig.bossReward.minGemQuality。
 *
 * 注：enemyConfig 中敌人定义没有元素字段（契约现状），因此 defId 无法推导碎片种类；
 * 由调用方（TASK-05 刷怪侧）传 element，缺省 rng.pick —— 已在交付报告登记。
 */
export function rollLoot(input: LootRollInput, rng: Rng, ids: DropIdFactory): LootRollResult {
  const table = damageConfig.loot[input.tier];
  const pos = input.pos ?? ORIGIN;
  const rolls: LootRoll[] = [];
  const drops: DropInstance[] = [];

  const goldAmount = rng.int(table.gold.min, table.gold.max + 1);
  if (goldAmount > 0) {
    rolls.push({ currencyId: 'gold', amount: goldAmount });
    drops.push(makeResourceDrop(ids, 'gold', goldAmount, input.tier, pos));
  }

  if (rng.next() < table.material.chance) {
    const amount = rng.int(table.material.min, table.material.max + 1);
    if (amount > 0) {
      rolls.push({ currencyId: 'forestMaterial', amount });
      drops.push(makeResourceDrop(ids, 'forestMaterial', amount, input.tier, pos));
    }
  }

  if (rng.next() < table.shard.chance) {
    const element: ElementId = input.element ?? rng.pick(ELEMENT_IDS);
    const amount = rng.int(table.shard.min, table.shard.max + 1);
    if (amount > 0) {
      const currencyId: CurrencyId = SHARD_CURRENCY_BY_ELEMENT[element];
      rolls.push({ currencyId, amount });
      drops.push(makeResourceDrop(ids, currencyId, amount, input.tier, pos));
    }
  }

  if (rng.next() < table.gem.chance) {
    const quality: GemQuality =
      input.tier === 'boss' ? enemyConfig.bossReward.minGemQuality : DEFAULT_DROP_GEM_QUALITY;
    const gemIds = Object.keys(gemConfig.gems) as GemId[];
    const gemId = rng.pick(gemIds);
    drops.push({
      kind: 'gem',
      dropId: ids.nextDropId(),
      item: {
        itemInstanceId: ids.nextInstanceId(),
        gemId,
        quality,
      },
      tier: input.tier,
      pos,
      picked: false,
    });
  }

  return { rolls, drops };
}

function makeResourceDrop(
  ids: DropIdFactory,
  currencyId: CurrencyId,
  amount: number,
  tier: LootTier,
  pos: Vec3,
): DropInstance {
  return {
    kind: 'resource',
    dropId: ids.nextDropId(),
    currencyId,
    amount,
    tier,
    pos,
    picked: false,
  };
}

/** 地面掉落注册表（本局生命周期；picked 记录保留以便防重入判定） */
export class DropRegistry {
  private readonly drops = new Map<string, DropInstance>();
  private readonly order: string[] = [];

  register(drops: readonly DropInstance[]): void {
    for (const drop of drops) {
      this.drops.set(drop.dropId, drop);
      this.order.push(drop.dropId);
    }
  }

  get(dropId: string): DropInstance | undefined {
    return this.drops.get(dropId);
  }

  get all(): readonly DropInstance[] {
    return this.order.map((id) => this.drops.get(id) as DropInstance);
  }

  get onGround(): readonly DropInstance[] {
    return this.all.filter((d) => !d.picked);
  }

  /** 地面未拾取物明细（结算丢弃项） */
  get discardedSummary(): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const drop of this.onGround) {
      const key = drop.kind === 'resource' ? drop.currencyId : 'gem';
      out[key] = (out[key] ?? 0) + (drop.kind === 'resource' ? drop.amount : 1);
    }
    return out;
  }
}
