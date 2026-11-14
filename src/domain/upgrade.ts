/**
 * 局内升级卡（15 条）+ 3 选 1 生成器。
 *
 * 数值唯一来源：config/upgradePoolConfig.ts（本文件不写死任何数值）。
 * 文档来源：设计-局内升级系统.md §1–§3。
 * 开放问题采信：Q4 选 B（品质/重复提升触发概率，保留 procChanceBonus 语义）。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import { upgradePoolConfig } from '../config/upgradePoolConfig.ts';
import { damageConfig } from '../config/damageConfig.ts';
import { playerConfig } from '../config/playerConfig.ts';
import type { InRunBuffCategory, InRunBuffEntry } from './damage.ts';
import { SPLIT_SHOT_BUFF_ID } from './damage.ts';
import type { WeaponId } from './ids.ts';
import type { Rng } from './types.ts';

// ─────────────────────────────────────────────────────────────
// 卡牌定义
// ─────────────────────────────────────────────────────────────

/** 15 条升级卡 ID（升级文档 §2 表，按杖 1–5 / 剑 6–10 / 通用 11–15 排列）。 */
export type UpgradeId =
  | 'splitShot' // 1 分裂弹（杖）
  | 'chargeHaste' // 2 充能加速（杖）
  | 'pierceShot' // 3 穿透法术（杖）
  | 'elementalResonance' // 4 元素共鸣（杖）
  | 'heavyShot' // 5 重弹（杖）
  | 'bladeEnhance' // 6 剑刃强化（剑）
  | 'vampiricBlade' // 7 吸血剑气（剑）
  | 'whirlwind' // 8 旋风（剑）
  | 'armorBreak' // 9 破甲（剑）
  | 'arcExtend' // 10 剑气扩展（剑）
  | 'swiftStep' // 11 疾风步（通用）
  | 'stoneSkin' // 12 石肤（通用）
  | 'voidDash' // 13 虚空冲刺（通用）
  | 'leech' // 14 汲取（通用）
  | 'timeSand'; // 15 时之沙（通用）

/** 可选等级 I / II / III。 */
export type UpgradeTier = 1 | 2 | 3;

/**
 * 升级效果（判别联合）。
 *
 * 每个分支的固定参数（如 multPerExtraShot / dmgMultPerTarget）来自 config，
 * 用 `typeof` 引用，保证类型与配置数值一致。
 */
export type UpgradeEffect =
  | {
      /** #1 单弹伤害 ×0.6 累乘（N3 已定案） */
      readonly kind: 'projectileCount';
      readonly multPerExtraShot: typeof damageConfig.splitShot.multPerExtraShot;
    }
  | { readonly kind: 'intervalReduction' }
  | { readonly kind: 'damagePct' }
  | {
      /** #3 每穿 −30% 伤害 */
      readonly kind: 'pierce';
      readonly dmgMultPerTarget: typeof damageConfig.pierce.dmgMultPerTarget;
    }
  | { readonly kind: 'procChanceAbs' }
  | { readonly kind: 'swordLifestealPctMaxHp' }
  | { readonly kind: 'armorBreakPct' }
  | { readonly kind: 'arcAngleDeg' }
  | { readonly kind: 'moveSpeedPct' }
  | { readonly kind: 'damageTakenRedPct' }
  | { readonly kind: 'dashCdReduction' }
  | { readonly kind: 'killHealHp' }
  | { readonly kind: 'xpGainPct' };

/** 一张升级卡的定义。 */
export interface UpgradeCardDef {
  readonly id: UpgradeId;
  /** 文本外置（升级文档 §3，对齐叙事文案 §6） */
  readonly nameKey: string;
  readonly descKey: string;
  /** 作用域：杖 / 剑 / 通用（选卡时按当前武器过滤） */
  readonly scope: WeaponId | 'generic';
  /** I / II / III 定案值（含义由 effect.kind 决定） */
  readonly tiers: readonly [number, number, number];
  readonly maxTier: UpgradeTier;
  /** 所属上限类别（达上限的卡在生成 3 选 1 时被过滤）；null = 无上限 */
  readonly capGroup: InRunBuffCategory | null;
  readonly effect: UpgradeEffect;
}

// ─────────────────────────────────────────────────────────────
// 组装：config → 15 张卡
// ─────────────────────────────────────────────────────────────

/** 卡牌定义在 config 里的键顺序（= 升级文档表序）。 */
const CARD_ORDER = [
  'splitShot',
  'chargeHaste',
  'pierceShot',
  'elementalResonance',
  'heavyShot',
  'bladeEnhance',
  'vampiricBlade',
  'whirlwind',
  'armorBreak',
  'arcExtend',
  'swiftStep',
  'stoneSkin',
  'voidDash',
  'leech',
  'timeSand',
] as const satisfies readonly UpgradeId[];

/**
 * 全部 15 张卡（从 config 组装）。
 * 每次调用返回新数组，避免调用方排序污染共享数据。
 */
export function allUpgradeCards(): readonly UpgradeCardDef[] {
  return CARD_ORDER.map((id) => {
    const c = upgradePoolConfig.cards[id];
    return {
      id,
      nameKey: c.nameKey,
      descKey: c.descKey,
      scope: c.scope,
      tiers: c.tiers,
      maxTier: c.maxTier,
      capGroup: c.capGroup,
      effect: c.effect,
    } as UpgradeCardDef;
  });
}

/** 按 ID 查一张卡。 */
export function upgradeCard(id: UpgradeId): UpgradeCardDef {
  const card = allUpgradeCards().find((c) => c.id === id);
  if (!card) throw new Error(`[domain/upgrade] 未知升级卡 ID: ${id}`);
  return card;
}

// ─────────────────────────────────────────────────────────────
// 上限判定
// ─────────────────────────────────────────────────────────────

/** 某类别当前已累积的百分比（同类加算）。 */
function sumCategory(current: readonly InRunBuffEntry[], category: InRunBuffCategory): number {
  let sum = 0;
  for (const b of current) {
    if (b.category === category && Number.isFinite(b.pct)) sum += b.pct;
  }
  return sum;
}

/** 当前分裂弹弹道数（从 buff 列表读，未拿过则为 1）。 */
function currentProjectileCount(current: readonly InRunBuffEntry[]): number {
  let count = 1;
  for (const b of current) {
    if (b.buffId === SPLIT_SHOT_BUFF_ID && Number.isFinite(b.pct)) count = Math.max(count, Math.floor(b.pct));
  }
  return count;
}

/**
 * 某张卡当前是否**已达上限**（达上限则不再出现在 3 选 1 池中，升级文档 §3）。
 *
 * 逐类别判定，阈值全部来自 config：
 *   damage          伤害类合计 ≥ +100%          → 封顶
 *   interval        间隔类合计 ≥ −40%（共享）    → 封顶
 *   procChance      概率合计 ≥ 50%（绝对值）     → 封顶
 *   armorBreak      破甲合计 ≥ +50%              → 封顶
 *   moveSpeed       移速合计 ≥ +40%              → 封顶
 *   damageTaken     受伤减免合计 ≥ 40%           → 封顶
 *   dashCd          Dash CD 已到下限 0.9s        → 封顶（按等效缩短比例判定）
 *   arcAngle        扇形角已达 240°              → 封顶（按斩击最终角度判定，不是加成量）
 *   xpGain          无上限                       → 不封顶
 *   splitShot      弹道数已达 4                  → 封顶（专项判定）
 *
 * @param card    卡牌
 * @param current 当前已获得的 buff 列表
 */
export function isCardAtCap(card: UpgradeCardDef, current: readonly InRunBuffEntry[]): boolean {
  const caps = upgradePoolConfig.caps;

  // 分裂弹：专项按弹道总数判定（capGroup 为 null，因为上限不是"百分比合计"）
  if (card.id === 'splitShot') {
    return currentProjectileCount(current) >= caps.maxProjectileCount;
  }

  switch (card.capGroup) {
    case null:
      return false;
    case 'damage':
      return sumCategory(current, 'damage') >= caps.inRunDamagePct;
    case 'interval':
      return sumCategory(current, 'interval') >= caps.intervalReductionPct;
    case 'procChance':
      return sumCategory(current, 'procChance') >= caps.procChanceAbs;
    case 'armorBreak':
      return sumCategory(current, 'armorBreak') >= caps.armorBreakPct;
    case 'moveSpeed':
      return sumCategory(current, 'moveSpeed') >= caps.moveSpeedPct;
    case 'damageTaken':
      return sumCategory(current, 'damageTaken') >= caps.damageTakenRedPct;
    case 'dashCd': {
      // 允许的最大缩短比例 = 1 − floor / base；达到即封顶
      const base = playerConfig.dash.cooldownSec;
      const maxRed = Math.max(0, 1 - caps.dashCdFloorSec / base);
      return sumCategory(current, 'dashCd') >= maxRed;
    }
    case 'arcAngle': {
      // 按"最终角度"判定：基础 120° + 已加成 ≥ 240° 即封顶。
      // 用 1e-9 容差而不是直接 >=：角度数值若将来改成小数（如 37.5°），
      // 浮点累加 120 + 37.5 + 37.5 + 37.5 = 232.5 这种边界会因误差判错。
      const reached = playerConfig.sword.arcAngleDeg + sumCategory(current, 'arcAngle');
      return reached >= caps.arcAngleDegCap - 1e-9;
    }
    case 'xpGain':
      return false; // 无上限（升级文档 §2 #15「—」）
    case 'lifesteal':
      return false; // 无上限（#7 「—」）
    case 'projectileCount':
      return currentProjectileCount(current) >= caps.maxProjectileCount; // 已由上方专项处理，此处兜底
    case 'pierce':
      return false; // 无上限（#3 「—」）
    case 'killHeal':
      return false; // 无上限（#14 「—」）
  }
}

/**
 * 某张卡已经拿到过几次（= 当前 tier 数）。
 *
 * 说明：TASK-01 只用 buff 列表表达"拿到过什么"，没有单独的 tier 账本，
 * 因此按「同 buffId 出现次数」推断。
 * 注意：`pierceShot` 的 buffId 也是 'pierceShot'（与卡 ID 同名），可被正确计数；
 *      只有 `splitShot` 的 buffId 统一为常量 SPLIT_SHOT_BUFF_ID，值恰好等于 'splitShot'，
 *      所以同样成立——这里是刻意的命名一致，改名时两处必须同步。
 *
 * @param card    卡牌
 * @param current 当前 buff 列表
 */
export function takenTierCount(card: UpgradeCardDef, current: readonly InRunBuffEntry[]): number {
  let count = 0;
  for (const b of current) {
    if (b.buffId === card.id) count++;
  }
  return count;
}

/**
 * 某张卡是否已满级（已达 maxTier）。满级卡不再出现在 3 选 1 池中。
 * @param card    卡牌
 * @param current 当前 buff 列表
 */
export function isCardMaxed(card: UpgradeCardDef, current: readonly InRunBuffEntry[]): boolean {
  return takenTierCount(card, current) >= card.maxTier;
}

// ─────────────────────────────────────────────────────────────
// 3 选 1
// ─────────────────────────────────────────────────────────────

/** 选卡上下文：玩家当前状态（用于过滤 scope 与已有 tier）。 */
export interface UpgradeRollContext {
  /** 当前武器：决定哪些卡进池（另一把武器的卡本轮不出现） */
  readonly currentWeapon: WeaponId;
  /** 玩家当前等级（仅用于事件 payload，不影响池子过滤） */
  readonly level?: number;
}

/**
 * 生成 3 张升级卡。
 *
 * 流程（升级文档 §3）：
 *   1. 过滤 scope：通用卡始终可用；专用卡只在当前武器匹配时可用
 *   2. 过滤已满级：已升到 maxTier 的卡不再出现
 *   3. 过滤已达上限：capGroup 已封顶的卡不再出现
 *   4. 从剩余池用传入 Rng **无放回**抽 min(3, 池大小) 张
 *
 * 为什么无放回：3 选 1 里出现两张重复卡是明确的体验缺陷，且 upgrade.selected
 * 只带一个 cardId，重复卡在数据结构上也无法区分。
 *
 * 池子不足 3 张时返回实际数量（不补重复、不抛错）——后期所有卡满级是正常状态，
 * UI 需要能处理"只有 1 张卡"的降级显示。
 *
 * @param rng     可复现随机源（TASK-01 验收：随机生成支持 seed）
 * @param current 当前已获得的 buff 列表（做上限与满级过滤）
 * @param ctx     选卡上下文
 * @returns 1–3 张卡（通常 3 张）
 */
export function rollUpgradeChoices(
  rng: Rng,
  current: readonly InRunBuffEntry[],
  ctx: UpgradeRollContext,
): UpgradeCardDef[] {
  const eligible = allUpgradeCards().filter((card) => {
    const scopeOk = card.scope === 'generic' || card.scope === ctx.currentWeapon;
    if (!scopeOk) return false;
    if (isCardMaxed(card, current)) return false;
    if (isCardAtCap(card, current)) return false;
    return true;
  });

  // Fisher–Yates 部分洗牌：只洗到需要的张数，O(k) 而非 O(n log n)
  const target = Math.min(upgradePoolConfig.choicesPerLevel, eligible.length);
  const pool = eligible.slice();
  for (let i = 0; i < target; i++) {
    const j = rng.int(i, pool.length);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, target);
}

/**
 * 把一次选择落地成 buff 条目（NEW-03 选卡后调用，喂给 rebuildDamageLayers）。
 *
 * 语义映射（card.effect.kind → InRunBuffEntry.category / pct）：
 *   - damagePct / intervalReduction / procChanceAbs / armorBreakPct / arcAngleDeg /
 *     moveSpeedPct / damageTakenRedPct / dashCdReduction / xpGainPct / swordLifestealPctMaxHp
 *       → 直接用 tiers[tier-1] 作为 pct，类别取 card.capGroup
 *   - projectileCount（#1）→ pct 存**弹道总数**（2/3/4），类别 'projectileCount'
 *   - pierce（#3）→ pct 存穿透目标数，类别 'pierce'
 *   - killHealHp（#14）→ pct 存**固定生命值**（1/2/3 点），类别 'killHeal'
 *
 * 为什么给无上限卡单独分配 category（而不是都塞进 'lifesteal'）：
 *   'lifesteal' 在 rebuildDamageLayers 里会累加成「按最大生命比例回复」的系数，
 *   若把"穿透 2 个目标"或"回复 3 点生命"塞进去，会被当成 200% / 300% 的最大生命回复，
 *   这是个会直接让玩家无敌的 bug。所以无上限卡各用独立类别，且不参与任何 caps 求和。
 *
 * 为什么用「card.id 当 buffId」：同一张卡的多个 tier 需要被识别为同一条成长线
 * （isCardMaxed 靠计数），而 rebuildDamageLayers 只需要类别与数值。
 *
 * @param card 已选中的卡
 * @param tier 选中时的 tier（1–3）
 * @returns 可直接 push 进 buff 列表的条目
 */
export function cardToBuffEntry(card: UpgradeCardDef, tier: UpgradeTier): InRunBuffEntry {
  const value = card.tiers[tier - 1];

  switch (card.effect.kind) {
    case 'projectileCount':
      // #1 分裂弹：pct = 弹道总数（rebuildDamageLayers 取最大值 + caps 夹到 4）
      return { buffId: card.id, category: 'projectileCount', pct: value };
    case 'pierce':
      // #3 穿透：pct = 穿透目标数
      return { buffId: card.id, category: 'pierce', pct: value };
    case 'killHealHp':
      // #14 汲取：pct = 击杀回复的固定生命值
      return { buffId: card.id, category: 'killHeal', pct: value };
    case 'swordLifestealPctMaxHp':
      // #7 吸血剑气：pct = 最大生命比例
      return { buffId: card.id, category: 'lifesteal', pct: value };
    default: {
      // 其余 9 类都带 capGroup（damage / interval / procChance / armorBreak /
      // arcAngle / moveSpeed / damageTaken / dashCd / xpGain）
      if (card.capGroup === null) {
        throw new Error(`[domain/upgrade] 卡 ${card.id} 的 effect.kind=${card.effect.kind} 没有 capGroup，契约不完整`);
      }
      return { buffId: card.id, category: card.capGroup, pct: value };
    }
  }
}
