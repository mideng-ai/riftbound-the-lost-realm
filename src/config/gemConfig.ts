/**
 * 宝石基础效果 / 品质与重复倍率 / 元素触发 / 控制上限表。
 *
 * 数值唯一来源：
 *   - 总纲-项目规划书V1.md §2.1「元素触发结算」+「控制上限表」（B2 裁决，后出且为定案）
 *   - 设计-设计总纲.md §5.4 品质倍率 / §5.5 重复镶嵌 / §5.3 普通品质初始效果
 *
 * 开放问题采信结论：
 *   - Q3：元素触发按规划书 §2.1（燃烧 8%/s、3 秒、叠层），总纲 §5.3 旧值作废。
 *   - Q4 选 B：品质/重复提升元素**触发概率**（上限 50%），因此本表给出
 *            `procChancePctByQuality` 与 `procChanceBonusPctPerRepeat`（见 domain/damage.ts 说明）。
 *   - Q7：音效文件名不动（sfx_proc_frost / sfx_proc_storm），在 audioEventMapConfig 做映射。
 *
 * 本文件是纯数据叶子：只 import config/common.ts。
 */
import { GEM_QUALITY_MULT_CONST, GEM_REPEAT_MULT_BY_COUNT_CONST } from './common.ts';

export const gemConfig = {
  /** 每把武器宝石槽位数。来源：总纲 §5.5。状态：CONFIRMED。 */
  slotsPerWeapon: 3,

  /**
   * 7 种宝石基础效果。
   * 来源：规划书 §2.1（元素四条）+ 总纲 §5.3（属性三条）。状态：CONFIRMED（规则）/ PROVISIONAL（数值）。
   *
   * 元素宝石：效果强度会被「品质倍率 × 重复倍率」放大（总纲 §5.5），触发概率按 Q4-B 由品质与重复提升。
   * 属性宝石：力量进伤害 B 区；迅捷改攻速；生命改最大生命（不进 B 区）。
   */
  gems: {
    // ── 四种元素宝石（规划书 §2.1 定案，Q3：总纲 §5.3 旧值作废）──────
    /** 火·燃烧：命中 15%，命中伤害 ×8%/s 持续 3s，命中刷新并 +1 层 — CONFIRMED */
    fire: {
      kind: 'element',
      element: 'fire',
      nameKey: 'gem.fire.name',
      /** 基础触发概率 15%（规划书 §2.1）— CONFIRMED */
      baseChancePct: 0.15,
      effect: { kind: 'burn', dpsPctOfHit: 0.08, durationSec: 3 },
    },
    /** 冰·减速：命中 20%，减速 20% 持续 1.5s，不叠加只刷新 — CONFIRMED */
    ice: {
      kind: 'element',
      element: 'ice',
      nameKey: 'gem.ice.name',
      baseChancePct: 0.2, // 20%（规划书 §2.1）— CONFIRMED
      effect: { kind: 'slow', slowPct: 0.2, durationSec: 1.5 },
    },
    /** 雷·连锁：命中 12%，每跳 40% 命中伤害，2 跳，半径 3m，每目标每次限 1 跳 — CONFIRMED */
    lightning: {
      kind: 'element',
      element: 'lightning',
      nameKey: 'gem.lightning.name',
      baseChancePct: 0.12, // 12%（规划书 §2.1）— CONFIRMED
      effect: { kind: 'chain', jumpDmgPct: 0.4, jumps: 2, radiusM: 3 },
    },
    /** 暗·吸血：命中 8%，回复 5% 命中伤害，每秒回复 ≤5% 最大生命；吸血量不受品质/重复放大 — CONFIRMED */
    shadow: {
      kind: 'element',
      element: 'shadow',
      nameKey: 'gem.shadow.name',
      baseChancePct: 0.08, // 8%（规划书 §2.1）— CONFIRMED
      effect: { kind: 'lifesteal', healPctOfHit: 0.05, perSecCapPctMaxHp: 0.05 },
    },

    // ── 三种属性宝石（总纲 §5.3，数值 PROVISIONAL）──────────────
    /** 力量：对应武器伤害 +6%（进伤害 B 区）— PROVISIONAL */
    power: {
      kind: 'attribute',
      nameKey: 'gem.power.name',
      /** 普通品质基础值 6%（总纲 §5.3）— PROVISIONAL */
      basePct: 0.06,
      /** 进伤害乘区 B 区 — CONFIRMED（规划书 §2.1） */
      entersDamageLayer: true,
    },
    /** 迅捷：对应武器攻击速度 +5%（走武器间隔派生，不进 B 区）— PROVISIONAL */
    haste: {
      kind: 'attribute',
      nameKey: 'gem.haste.name',
      basePct: 0.05, // 5%（总纲 §5.3）— PROVISIONAL
      entersDamageLayer: false,
    },
    /** 生命：玩家最大生命 +8%（进 deriveMaxHp，不进 B 区）— PROVISIONAL */
    vitality: {
      kind: 'attribute',
      nameKey: 'gem.vitality.name',
      basePct: 0.08, // 8%（总纲 §5.3）— PROVISIONAL
      entersDamageLayer: false,
    },
  },

  /**
   * 品质效果倍率。来源：总纲 §5.4。状态：CONFIRMED（品阶顺序）/ PROVISIONAL（倍率数值）。
   * 复用 common 的共享事实，避免两处漂移。
   */
  qualityMult: GEM_QUALITY_MULT_CONST,

  /**
   * 品质对外显名（文本外置 key 前缀）。状态：CONFIRMED（总纲 §5.4 品阶顺序）。
   */
  qualityNameKey: {
    common: 'gem.quality.common',
    uncommon: 'gem.quality.uncommon',
    rare: 'gem.quality.rare',
    epic: 'gem.quality.epic',
    legendary: 'gem.quality.legendary',
  },

  /**
   * 同种重复镶嵌倍率。来源：总纲 §5.5。状态：CONFIRMED。
   * 1 颗 1.0 / 2 颗 1.5 / 3 颗 2.0（下标 = 颗数 − 1）。
   */
  repeatMultByCount: GEM_REPEAT_MULT_BY_COUNT_CONST,

  /**
   * 触发概率随品质/重复的提升方式（Q4 采信 = 方案 B）。
   * 状态：CONFIRMED（采信结论）/ PROVISIONAL（步长）。
   *
   * 语义：元素触发概率 = baseChancePct
   *          + Σ(品质序号) × procChanceBonusPctPerQualityStep     （品质提升）
   *          + (重复颗数 − 1) × procChanceBonusPctPerRepeat        （重复提升）
   *       硬上限 = common.DAMAGE_CAPS_CONST.procChanceAbs（50%，升级池 #4 同表）
   *
   * 注：暗影的**吸血量**仍不受品质/重复放大（规划书 §2.1 明文），只有概率受放大。
   */
  procChanceBonusPctPerQualityStep: 0.02, // 每提升一个品质 +2% 绝对值 — PROVISIONAL
  procChanceBonusPctPerRepeat: 0.02, // 同种每多 1 颗 +2% 绝对值 — PROVISIONAL

  /**
   * 控制上限表（对 Boss 衰减）。来源：规划书 §2.1 控制上限表。状态：CONFIRMED。
   * 按敌人档位（normal / elite / boss）查表；domain/damage.ts 的 resolveDamageHit 消费。
   */
  controlCaps: {
    /** 减速幅度上限：普通 20% / 精英 15% / Boss 10% — CONFIRMED */
    slowMaxPct: { normal: 0.2, elite: 0.15, boss: 0.1 },
    /** 燃烧层数上限：3 / 3 / 2 — CONFIRMED */
    burnMaxStacks: { normal: 3, elite: 3, boss: 2 },
    /** 连锁跳数上限：2 / 2 / 1 — CONFIRMED */
    chainMaxJumps: { normal: 2, elite: 2, boss: 1 },
    /** 毒层数上限：5 / 3 / 2（毒 4%/s，4s 刷新）— CONFIRMED */
    poisonMaxStacks: { normal: 5, elite: 3, boss: 2 },
    /** 毒伤害 4%/s，持续 4s 刷新 — PROVISIONAL（规划书 §2.1 表内注） */
    poisonDpsPct: 0.04,
    poisonDurationSec: 4,
  },

  /**
   * 宝石合成配方。来源：总纲 §5.6。状态：CONFIRMED。
   * 三颗相同种类、相同品质 → 一颗同种高一级品质；不随机、不失败、传说不可再合。
   */
  merge: {
    requiredCount: 3,
    /** 传说品质不可继续合成 — CONFIRMED */
    topQuality: 'legendary',
  },

  /**
   * 元素碎片制作普通元素宝石的配方。来源：总纲 §6.3。状态：PROVISIONAL。
   * 每颗普通元素宝石 = 对应元素碎片 8 个 + 森林材料 5 个；属性宝石不走此配方。
   */
  craft: {
    shardCost: 8,
    materialCost: 5,
    craftableGemIds: ['fire', 'ice', 'lightning', 'shadow'],
  },
} as const;
