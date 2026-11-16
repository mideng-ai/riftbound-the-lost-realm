/**
 * src/economy/weaponUpgrade.ts — 森林材料武器永久强化（Lv.1–Lv.5）
 *
 * 成本表：src/economy/economyConfig.ts WEAPON_UPGRADE_MATERIAL_COST
 *   [10, 20, 35, 55]，来源设计总纲 §4.3（冻结 src/config/ 暂无此键，已在报告登记）。
 * 百分比效果（weaponUpgradePctByLevel，Lv5=+32%）由战斗侧从 playerConfig 读取，
 * 本模块不触碰伤害计算。
 */

import type { SaveDataV3, WeaponId, WeaponUpgradeLevel } from '../domain/index.ts';
import { WEAPON_UPGRADE_MATERIAL_COST } from './economyConfig.ts';
import type { WeaponUpgradeResult } from './types.ts';

export const WEAPON_MAX_LEVEL: WeaponUpgradeLevel = (WEAPON_UPGRADE_MATERIAL_COST.length + 1) as WeaponUpgradeLevel;

/** 双武器全部升满的材料合计（验收锚点 240） */
export function fullDualWeaponMaterialTotal(): number {
  let total = 0;
  for (const cost of WEAPON_UPGRADE_MATERIAL_COST) total += cost * 2;
  return total;
}

export function quoteWeaponUpgrade(save: SaveDataV3, weapon: WeaponId): WeaponUpgradeResult {
  const fromLevel = save.weapons[weapon].level;
  if (fromLevel >= WEAPON_MAX_LEVEL) {
    return { ok: false, reason: 'already-max', fromLevel };
  }
  const materialSpent = WEAPON_UPGRADE_MATERIAL_COST[fromLevel - 1] ?? 0;
  const toLevel = (fromLevel + 1) as WeaponUpgradeLevel;
  if (save.currencies.forestMaterial < materialSpent) {
    return { ok: false, reason: 'insufficient-material', fromLevel, toLevel };
  }
  return { ok: true, fromLevel, toLevel, materialSpent };
}
