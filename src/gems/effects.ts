/**
 * src/gems/effects.ts — 宝石效果结算查询（TASK-03）
 *
 * 职责：把「某武器的镶嵌状态」翻译成可供战斗/属性系统消费的数值接口。
 * 红线：只提供效果数值，不直接修改武器攻击内部算法（B 区乘积由武器侧自行并入）。
 *
 * 数值来源（全部只读引用，禁止硬编码）：
 *   - 触发概率：domain/damage.ts elementProcChance（Q4-B 公式，上限 50%）
 *   - 控制上限：domain/damage.ts effectiveControlCaps（按 normal/elite/boss 衰减）
 *   - 属性效果：gemConfig.gems.{power,haste,vitality}.basePct × qualityMult × repeatMultByCount
 *
 * 口径声明（本模块明确的两个语义，未在契约中写死）：
 *   1. 同种多颗但品质不同：品质取最高那颗（触发概率的 qualityStep 与属性倍率同用该品质），
 *      重复颗数按全部计入——「重复」定义是同种（Q6 的精神：种类与品质是两个维度）。
 *   2. 元素效果强度（燃烧 8%/s、减速 20% 等）不随品质/重复放大——
 *      Q4-B 裁定品质/重复提升的是**触发概率**；控制上限按敌档衰减。
 */
import type { GemQuality, WeaponId } from '../domain/ids.ts';
import type { SaveDataV3 } from '../domain/save.ts';
import { elementProcDef, elementProcChance, QUALITY_ORDER, type ElementEffect } from '../domain/damage.ts';
import { gemConfig } from '../config/gemConfig.ts';
import { socketedGemsOf } from './socket.ts';

/** 属性宝石加成（每武器）。 */
export interface WeaponGemStatBonuses {
  /** 力量（power）：对应武器伤害 +%（进伤害 B 区，由武器侧乘入） */
  readonly powerPct: number;
  /** 迅捷（haste）：对应武器攻速 +%（走武器间隔派生） */
  readonly hastePct: number;
}

/** 某武器上元素宝石的触发信息（结算口径见文件头）。 */
export interface ElementProcState {
  readonly element: 'fire' | 'ice' | 'lightning' | 'shadow';
  /** 最终触发概率（已含品质/重复加成，夹在 [0, 0.5]） */
  readonly chance: number;
  /** 参与结算的颗数与品质（诊断/展示用） */
  readonly repeatCount: number;
  readonly quality: GemQuality;
  /** 效果定义（强度不随品质/重复放大） */
  readonly effect: ElementEffect;
  /** 贡献该效果的宝石实例 ID（按槽序） */
  readonly sourceItemInstanceIds: readonly string[];
}

/** 品质提升取「最高品质那颗」（口径见文件头）。 */
function bestQuality(qualities: readonly GemQuality[]): GemQuality {
  let best = qualities[0]!;
  for (const q of qualities) {
    if (QUALITY_ORDER.indexOf(q) > QUALITY_ORDER.indexOf(best)) best = q;
  }
  return best;
}

/** 某武器上按 gemId 分组（保留槽序）。 */
function groupByGemId(save: SaveDataV3, weaponId: WeaponId): Map<string, { itemInstanceId: string; quality: GemQuality }[]> {
  const groups = new Map<string, { itemInstanceId: string; quality: GemQuality }[]>();
  for (const { gem } of socketedGemsOf(save, weaponId)) {
    const arr = groups.get(gem.gemId) ?? [];
    arr.push({ itemInstanceId: gem.itemInstanceId, quality: gem.quality });
    groups.set(gem.gemId, arr);
  }
  return groups;
}

/** 属性宝石加成（power/haste 走武器；vitality 是玩家全局，见 vitalityPct）。 */
export function weaponGemStatBonuses(save: SaveDataV3, weaponId: WeaponId): WeaponGemStatBonuses {
  const groups = groupByGemId(save, weaponId);
  const bonusOf = (gemId: 'power' | 'haste'): number => {
    const group = groups.get(gemId);
    if (!group || group.length === 0) return 0;
    const def = gemConfig.gems[gemId];
    if (def.kind !== 'attribute') return 0;
    const mult = gemConfig.qualityMult[bestQuality(group.map((g) => g.quality))] * gemConfig.repeatMultByCount[Math.min(group.length, gemConfig.repeatMultByCount.length) - 1]!;
    return def.basePct * mult;
  };
  return { powerPct: bonusOf('power'), hastePct: bonusOf('haste') };
}

/** 生命（vitality）宝石：玩家最大生命 +%（全局，任一武器槽都计入）。 */
export function vitalityPct(save: SaveDataV3): number {
  let total = 0;
  for (const weaponId of ['staff', 'sword'] as const) {
    const group = groupByGemId(save, weaponId).get('vitality');
    if (!group || group.length === 0) continue;
    const def = gemConfig.gems.vitality;
    if (def.kind !== 'attribute') continue;
    const mult = gemConfig.qualityMult[bestQuality(group.map((g) => g.quality))] * gemConfig.repeatMultByCount[Math.min(group.length, gemConfig.repeatMultByCount.length) - 1]!;
    total += def.basePct * mult;
  }
  return total;
}

/** 某武器上全部元素宝石的触发状态（元素宝石按命中触发，属性宝石不在此列）。 */
export function elementProcStates(save: SaveDataV3, weaponId: WeaponId): readonly ElementProcState[] {
  const groups = groupByGemId(save, weaponId);
  const out: ElementProcState[] = [];
  for (const gemId of ['fire', 'ice', 'lightning', 'shadow'] as const) {
    const group = groups.get(gemId);
    if (!group || group.length === 0) continue;
    const def = gemConfig.gems[gemId];
    if (def.kind !== 'element') continue;
    const quality = bestQuality(group.map((g) => g.quality));
    const chance = elementProcChance(def.element, quality, group.length, 0);
    out.push({
      element: def.element,
      chance,
      repeatCount: group.length,
      quality,
      effect: elementProcDef(def.element).effect,
      sourceItemInstanceIds: group.map((g) => g.itemInstanceId),
    });
  }
  return out;
}

/** 暗影吸血治疗量：命中伤害 ×healPctOfHit，受每秒 ≤perSecCapPctMaxHp×最大生命 上限约束。 */
export function lifestealHeal(hitDamage: number, maxHp: number, healedThisSecond: number): number {
  const effect = elementProcDef('shadow').effect;
  if (effect.kind !== 'lifesteal') return 0;
  const raw = hitDamage * effect.healPctOfHit;
  const cap = maxHp * effect.perSecCapPctMaxHp;
  return Math.max(0, Math.min(raw, cap - healedThisSecond));
}
