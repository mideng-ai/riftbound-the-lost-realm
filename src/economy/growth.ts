/**
 * src/economy/growth.ts — 金币永久成长（三条线 Lv.0–Lv.10）
 *
 * 数值单一来源：冻结 config（playerConfig.metaGrowth / metaGrowthCost）。
 * 成长效果从 domain 桶的 metaGrowthPctOfLevel / masteryPctOfLevel 读取，
 * 本模块只负责等级与金币规则，不重算百分比（D-08 里程碑唯一入口在 config）。
 */

import { metaGrowthCost } from '../domain/index.ts';
import type { SaveDataV3 } from '../domain/index.ts';
import type { PurchaseResult } from './types.ts';

/** 存档里的三条成长线键（SaveMetaProgress） */
export type MetaGrowthTrackId = 'staffMastery' | 'swordMastery' | 'forestSurvival';

export const META_GROWTH_TRACKS: readonly MetaGrowthTrackId[] = [
  'staffMastery',
  'swordMastery',
  'forestSurvival',
] as const;

/** 升到目标等级 L 的成本：C(L) = base + step × (L − 1)（base/step 读冻结 config） */
export function metaGrowthCostOfLevel(level: number): number {
  if (level <= 0) return 0;
  return metaGrowthCost.base + metaGrowthCost.step * (level - 1);
}

/** 单条线买满的总投入（PROVISIONAL = 3250，Q-NEW-1） */
export function metaGrowthTotalInvestment(): number {
  let total = 0;
  for (let l = 1; l <= metaGrowthCost.maxLevel; l += 1) total += metaGrowthCostOfLevel(l);
  return total;
}

/** 购买报价（纯判定，不改存档；由 EconomySystem 统一构造不可变新存档） */
export function quoteMetaGrowth(save: SaveDataV3, track: MetaGrowthTrackId): PurchaseResult {
  const fromLevel = save.metaProgress[track];
  if (fromLevel >= metaGrowthCost.maxLevel) {
    return { ok: false, reason: 'already-max', fromLevel };
  }
  const toLevel = fromLevel + 1;
  const goldSpent = metaGrowthCostOfLevel(toLevel);
  if (save.currencies.gold < goldSpent) {
    return { ok: false, reason: 'insufficient-gold', fromLevel, toLevel };
  }
  return { ok: true, fromLevel, toLevel, goldSpent };
}
