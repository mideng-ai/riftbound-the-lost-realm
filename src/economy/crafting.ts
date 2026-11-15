/**
 * src/economy/crafting.ts — 元素碎片制作普通元素宝石
 *
 * 配方数值全部来自冻结 config：gemConfig.craft（shardCost 8 / materialCost 5 /
 * craftableGemIds）。产出品质由 economyConfig.CRAFTED_GEM_QUALITY 给出
 * （设计总纲 §6.3「制作普通元素宝石」= common）。
 * 产出为 GemInventoryItem 实例（唯一 itemInstanceId），与 TASK-03 宝石系统对齐。
 */

import { gemConfig } from '../config/gemConfig.ts';
import type {
  ElementId,
  GemInventoryItem,
  SaveDataV3,
} from '../domain/index.ts';
import { CRAFTED_GEM_QUALITY } from './economyConfig.ts';
import type { CraftResult } from './types.ts';

/** 制作报价（纯判定；成功时创建实例，存档变更由 EconomySystem 应用） */
export function quoteCraftElementGem(
  save: SaveDataV3,
  element: ElementId,
  makeInstanceId: () => string,
): CraftResult {
  if (!gemConfig.craft.craftableGemIds.includes(element)) {
    return { ok: false, reason: 'not-craftable' };
  }
  if (save.currencies.elementalShards[element] < gemConfig.craft.shardCost) {
    return { ok: false, reason: 'insufficient-shard' };
  }
  if (save.currencies.forestMaterial < gemConfig.craft.materialCost) {
    return { ok: false, reason: 'insufficient-material' };
  }
  const created: GemInventoryItem = {
    itemInstanceId: makeInstanceId(),
    gemId: element,
    quality: CRAFTED_GEM_QUALITY,
  };
  return {
    ok: true,
    shardSpent: gemConfig.craft.shardCost,
    materialSpent: gemConfig.craft.materialCost,
    created,
  };
}
