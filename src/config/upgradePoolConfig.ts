/**
 * 局内升级池（15 条）+ XP 曲线数值。
 *
 * 数值唯一来源：设计-局内升级系统.md §1 经验规则、§2 升级池 15 条表。
 * 状态：文档标注 PROVISIONAL，数值进配置表（规则结构 CONFIRMED）。
 *
 * 开放问题采信结论：
 *   - Q4 选 B：品质/重复提升元素**触发概率**（上限 50%），保留 procChanceBonus 语义。
 *     → 本条影响 #4 元素共鸣的 capGroup 归类（procChance）。
 *
 * 本文件是纯数据叶子：只 import config/common.ts。
 */
import { DAMAGE_CAPS_CONST } from './common.ts';

export const upgradePoolConfig = {
  /**
   * 经验曲线：升到 L+1 级所需 XP(L) = 40 × L^1.35。
   * 来源：设计-局内升级系统.md §1。状态：PROVISIONAL。
   * baseXp = 40，exponent = 1.35；L1–10 逐级 = 40/102/176/260/312/449/553/662/777/896。
   */
  xpCurve: {
    baseXp: 40,
    exponent: 1.35,
    /** 局内等级上限（升级池共 15 条 × 3 级，但文档未定义硬上限；按 1–10 曲线表给出可算范围）— PROVISIONAL */
    maxRunLevel: 10,
  },

  /**
   * 每级升级选项数量。来源：升级文档 §1「每级 3 选 1」。状态：CONFIRMED。
   */
  choicesPerLevel: 3,

  /**
   * V1.0 明确不做（升级文档 §1）：稀有度、重抽、进化/合成。
   * 状态：CONFIRMED。UI/NEW-03 不得实现这些入口。
   */
  excludedFeatures: { rarity: false, reroll: false, evolution: false },

  /**
   * 各类上限（选卡生成时用于过滤已达上限的卡）。
   * 来源：设计-局内升级系统.md §2「上限」列。状态：CONFIRMED。
   * 数值统一从 common.DAMAGE_CAPS_CONST 取，避免与伤害乘区表漂移。
   */
  caps: {
    inRunDamagePct: DAMAGE_CAPS_CONST.inRunDamagePct, // C 区伤害类 ≤ +100%（#5/#6）— CONFIRMED
    intervalReductionPct: DAMAGE_CAPS_CONST.intervalReductionPct, // 间隔类合计 −40%（#2/#8 共享）— CONFIRMED
    procChanceAbs: DAMAGE_CAPS_CONST.procChanceAbs, // 触发概率总上限 50%（#4）— CONFIRMED
    armorBreakPct: DAMAGE_CAPS_CONST.armorBreakPct, // 破甲 ≤ +50%（#9）— CONFIRMED
    moveSpeedPct: DAMAGE_CAPS_CONST.moveSpeedPct, // 移速 ≤ +40%（#11）— CONFIRMED
    damageTakenRedPct: DAMAGE_CAPS_CONST.damageTakenRedPct, // 受伤减免 ≤ −40%（#12）— CONFIRMED
    dashCdFloorSec: DAMAGE_CAPS_CONST.dashCdFloorSec, // Dash CD ≥ 0.9s（#13）— CONFIRMED
    /** 剑气扩展扇形角上限 240°（#10）— CONFIRMED。注意这是「最终角度上限」，不是「加成量上限」 */
    arcAngleDegCap: DAMAGE_CAPS_CONST.arcAngleDegCap,
    /** 分裂弹弹道上限 4（#1）— CONFIRMED */
    maxProjectileCount: 4,
  },

  /**
   * 15 条升级卡。来源：设计-局内升级系统.md §2 全表。状态：PROVISIONAL。
   *
   * 字段：
   *   scope      杖 / 剑 / 通用（选卡时按当前武器过滤）
   *   tiers      I / II / III 定案值（含义由 effect.kind 决定：
   *              damagePct 类为百分比，arcAngleDeg 为度，killHealHp 为固定生命，projectileCount 为弹道总数）
   *   maxTier    可升到的最高 tier
   *   capGroup   所属上限类别（达上限后不再出现在 3 选 1 池；null = 无上限）
   */
  cards: {
    // ── 法杖 1–5 ──────────────────────────────────────────
    /** #1 分裂弹：+1 弹道，单弹伤害 ×0.6 累乘（净 DPS +20%）；弹道 2/3/4，上限 ≤4 — PROVISIONAL */
    splitShot: {
      nameKey: 'upgrade.splitShot.name',
      descKey: 'upgrade.splitShot.desc',
      scope: 'staff',
      tiers: [2, 3, 4],
      maxTier: 3,
      capGroup: null, // 上限由 caps.maxProjectileCount 表达，见 rollUpgradeChoices 专项判断
      /** 每多一发，单弹伤害 ×0.6 累乘（N3 已定案）— CONFIRMED */
      effect: { kind: 'projectileCount', multPerExtraShot: 0.6 },
    },
    /** #2 充能加速：攻击间隔 −8/14/20%；与 #8 共享 −40% 上限 — PROVISIONAL */
    chargeHaste: {
      nameKey: 'upgrade.chargeHaste.name',
      descKey: 'upgrade.chargeHaste.desc',
      scope: 'staff',
      tiers: [0.08, 0.14, 0.2],
      maxTier: 3,
      capGroup: 'interval',
      effect: { kind: 'intervalReduction' },
    },
    /** #3 穿透法术：穿透 1/2/3 目标，每穿 −30% 伤害 — PROVISIONAL */
    pierceShot: {
      nameKey: 'upgrade.pierceShot.name',
      descKey: 'upgrade.pierceShot.desc',
      scope: 'staff',
      tiers: [1, 2, 3],
      maxTier: 3,
      capGroup: null,
      effect: { kind: 'pierce', dmgMultPerTarget: 0.7 },
    },
    /** #4 元素共鸣：全系触发概率 +5/10/15%（绝对值）；概率总上限 50% — PROVISIONAL */
    elementalResonance: {
      nameKey: 'upgrade.elementalResonance.name',
      descKey: 'upgrade.elementalResonance.desc',
      scope: 'staff',
      tiers: [0.05, 0.1, 0.15],
      maxTier: 3,
      capGroup: 'procChance',
      effect: { kind: 'procChanceAbs' },
    },
    /** #5 重弹：单发伤害 +12/18/25%；C 区伤害类 ≤ +100% — PROVISIONAL */
    heavyShot: {
      nameKey: 'upgrade.heavyShot.name',
      descKey: 'upgrade.heavyShot.desc',
      scope: 'staff',
      tiers: [0.12, 0.18, 0.25],
      maxTier: 3,
      capGroup: 'damage',
      effect: { kind: 'damagePct' },
    },

    // ── 魔法剑 6–10 ───────────────────────────────────────
    /** #6 剑刃强化：剑伤害 +12/18/25%；同 C 区伤害类上限 — PROVISIONAL */
    bladeEnhance: {
      nameKey: 'upgrade.bladeEnhance.name',
      descKey: 'upgrade.bladeEnhance.desc',
      scope: 'sword',
      tiers: [0.12, 0.18, 0.25],
      maxTier: 3,
      capGroup: 'damage',
      effect: { kind: 'damagePct' },
    },
    /** #7 吸血剑气：剑命中回复 1/1.5/2% 最大生命 — PROVISIONAL */
    vampiricBlade: {
      nameKey: 'upgrade.vampiricBlade.name',
      descKey: 'upgrade.vampiricBlade.desc',
      scope: 'sword',
      tiers: [0.01, 0.015, 0.02],
      maxTier: 3,
      capGroup: null,
      effect: { kind: 'swordLifestealPctMaxHp' },
    },
    /** #8 旋风：剑间隔 −10/15/20%；与 #2 共享 −40% 上限 — PROVISIONAL */
    whirlwind: {
      nameKey: 'upgrade.whirlwind.name',
      descKey: 'upgrade.whirlwind.desc',
      scope: 'sword',
      tiers: [0.1, 0.15, 0.2],
      maxTier: 3,
      capGroup: 'interval',
      effect: { kind: 'intervalReduction' },
    },
    /** #9 破甲：对精英/Boss 伤害 +15/20/25%；≤ +50% — PROVISIONAL */
    armorBreak: {
      nameKey: 'upgrade.armorBreak.name',
      descKey: 'upgrade.armorBreak.desc',
      scope: 'sword',
      tiers: [0.15, 0.2, 0.25],
      maxTier: 3,
      capGroup: 'armorBreak',
      effect: { kind: 'armorBreakPct' },
    },
    /** #10 剑气扩展：扇形 +30/45/60°；最终角度 ≤ 240° — PROVISIONAL */
    arcExtend: {
      nameKey: 'upgrade.arcExtend.name',
      descKey: 'upgrade.arcExtend.desc',
      scope: 'sword',
      tiers: [30, 45, 60],
      maxTier: 3,
      capGroup: 'arcAngle',
      effect: { kind: 'arcAngleDeg' },
    },

    // ── 通用 11–15 ────────────────────────────────────────
    /** #11 疾风步：移速 +10/15/20%；≤ +40% — PROVISIONAL */
    swiftStep: {
      nameKey: 'upgrade.swiftStep.name',
      descKey: 'upgrade.swiftStep.desc',
      scope: 'generic',
      tiers: [0.1, 0.15, 0.2],
      maxTier: 3,
      capGroup: 'moveSpeed',
      effect: { kind: 'moveSpeedPct' },
    },
    /** #12 石肤：受伤 −10/15/20%；≤ −40% — PROVISIONAL */
    stoneSkin: {
      nameKey: 'upgrade.stoneSkin.name',
      descKey: 'upgrade.stoneSkin.desc',
      scope: 'generic',
      tiers: [0.1, 0.15, 0.2],
      maxTier: 3,
      capGroup: 'damageTaken',
      effect: { kind: 'damageTakenRedPct' },
    },
    /** #13 虚空冲刺：Dash CD −10/18/25%；CD 下限 0.9s — PROVISIONAL */
    voidDash: {
      nameKey: 'upgrade.voidDash.name',
      descKey: 'upgrade.voidDash.desc',
      scope: 'generic',
      tiers: [0.1, 0.18, 0.25],
      maxTier: 3,
      capGroup: 'dashCd',
      effect: { kind: 'dashCdReduction' },
    },
    /** #14 汲取：击杀回复 1/2/3 生命 — PROVISIONAL */
    leech: {
      nameKey: 'upgrade.leech.name',
      descKey: 'upgrade.leech.desc',
      scope: 'generic',
      tiers: [1, 2, 3],
      maxTier: 3,
      capGroup: null,
      effect: { kind: 'killHealHp' },
    },
    /** #15 时之沙：经验获取 +15/22/30% — PROVISIONAL */
    timeSand: {
      nameKey: 'upgrade.timeSand.name',
      descKey: 'upgrade.timeSand.desc',
      scope: 'generic',
      tiers: [0.15, 0.22, 0.3],
      maxTier: 3,
      capGroup: 'xpGain',
      effect: { kind: 'xpGainPct' },
    },
  },
} as const;
