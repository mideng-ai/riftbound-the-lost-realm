/**
 * 伤害三层乘区上限 + 掉落表 + 经济成本。
 *
 * 数值唯一来源：
 *   - 总纲-项目规划书V1.md §2.1 乘区结构、裁决 #1–#4、控制上限表
 *   - 设计-设计总纲.md §6.2 掉落表、§6.4 成长成本
 *
 * 本文件是纯数据叶子：只 import config/common.ts（+ 单向转发 playerConfig 的成本参数，见文末）。
 */
import { DAMAGE_CAPS_CONST } from './common.ts';
import { playerConfig } from './playerConfig.ts';

export const damageConfig = {
  /**
   * 三层乘区上限表。来源：规划书 §2.1 + 升级文档 §2 上限列。状态：CONFIRMED。
   * domain/damage.ts 的 rebuildDamageLayers 用这张表做夹取，业务侧不得自带上限常量。
   */
  caps: {
    /** C 区（局内临时区）总上限 +150%（规划书 §2.1）— CONFIRMED */
    inRunTotalPct: DAMAGE_CAPS_CONST.inRunTotalPct,
    /** C 区伤害类合计上限 +100%（升级池 #5/#6）— CONFIRMED */
    inRunDamagePct: DAMAGE_CAPS_CONST.inRunDamagePct,
    /** 攻击间隔缩短合计上限 −40%（升级池 #2 与 #8 共享）— CONFIRMED */
    intervalReductionPct: DAMAGE_CAPS_CONST.intervalReductionPct,
    /** 元素触发概率绝对加成上限 50%（升级池 #4 / Q4-B）— CONFIRMED */
    procChanceAbs: DAMAGE_CAPS_CONST.procChanceAbs,
    /** 破甲对精英/Boss 上限 +50%（升级池 #9）— CONFIRMED */
    armorBreakPct: DAMAGE_CAPS_CONST.armorBreakPct,
    /** 剑扇形角最终上限 240°（升级池 #10）— CONFIRMED */
    arcAngleDegCap: DAMAGE_CAPS_CONST.arcAngleDegCap,
    /** 移速加成上限 +40%（升级池 #11）— CONFIRMED */
    moveSpeedPct: DAMAGE_CAPS_CONST.moveSpeedPct,
    /** 受伤减免上限 −40%（升级池 #12）— CONFIRMED */
    damageTakenRedPct: DAMAGE_CAPS_CONST.damageTakenRedPct,
    /** 虚空冲刺 CD 下限 0.9s（升级池 #13）— CONFIRMED */
    dashCdFloorSec: DAMAGE_CAPS_CONST.dashCdFloorSec,
    /** 分裂弹弹道上限 4（升级池 #1）— CONFIRMED */
    maxProjectileCount: 4,
  },

  /**
   * 分裂弹单弹伤害累乘系数。来源：升级文档 §2 #1「单弹伤害 ×0.6 累乘（净 DPS +20%）」。
   * 状态：CONFIRMED（N3 已定案）。
   */
  splitShot: {
    multPerExtraShot: 0.6,
  },

  /**
   * 穿透每穿一次后的伤害衰减系数。来源：升级文档 §2 #3「每穿 −30% 伤害」。状态：PROVISIONAL。
   */
  pierce: {
    dmgMultPerTarget: 0.7,
  },

  /**
   * 雷·连锁基础参数兜底（宝石表里已有一份，此处给出结算器默认值以便不带宝石时也能算）。
   * 来源：规划书 §2.1。状态：CONFIRMED。
   */
  chain: {
    /** 每跳 40% 命中伤害 — CONFIRMED */
    jumpDmgPct: 0.4,
    /** 2 跳 — CONFIRMED */
    jumps: 2,
    /** 半径 3m — CONFIRMED */
    radiusM: 3,
  },

  /**
   * 掉落表。来源：设计-设计总纲.md §6.2。状态：PROVISIONAL（需按每局平均击杀数与通胀实测校准）。
   *
   * 概率字段一律为 0–1 绝对值（Pct 后缀表示语义是概率，不表示百分数写法 0–100）。
   */
  loot: {
    /** 普通怪：金币 1 / 材料 8% 掉 1 个 / 无碎片 / 宝石 1% — PROVISIONAL */
    normal: {
      gold: { min: 1, max: 1 },
      material: { chance: 0.08, min: 1, max: 1 },
      shard: { chance: 0, min: 0, max: 0 },
      gem: { chance: 0.01 },
    },
    /** 元素怪：金币 2 / 材料 15% 掉 1 / 碎片 40% 掉对应元素 / 宝石 5% — PROVISIONAL */
    elemental: {
      gold: { min: 2, max: 2 },
      material: { chance: 0.15, min: 1, max: 1 },
      shard: { chance: 0.4, min: 1, max: 1 },
      gem: { chance: 0.05 },
    },
    /** 强化怪：金币 3–4 / 材料 30% 掉 1–2 / 碎片视元素 / 宝石 8% — PROVISIONAL */
    reinforced: {
      gold: { min: 3, max: 4 },
      material: { chance: 0.3, min: 1, max: 2 },
      shard: { chance: 0.4, min: 1, max: 1 }, // 视怪物元素类型，由 TASK-04 按 defId 决定碎片种类
      gem: { chance: 0.08 },
    },
    /** 精英怪：金币 8–12 / 材料保底 2–3 / 碎片可能 / 宝石 30% — PROVISIONAL */
    elite: {
      gold: { min: 8, max: 12 },
      material: { chance: 1.0, min: 2, max: 3 }, // 保底
      shard: { chance: 0.5, min: 1, max: 1 }, // "可能掉落"，按 50% 起测
      gem: { chance: 0.3 },
    },
    /** Boss：金币 80–120 / 材料保底 10–15 / 专属碎片 / 稀有宝石 — PROVISIONAL */
    boss: {
      gold: { min: 80, max: 120 },
      material: { chance: 1.0, min: 10, max: 15 }, // 保底
      shard: { chance: 1.0, min: 1, max: 1 },
      gem: { chance: 1.0 }, // 稀有宝石奖励（品质见 enemyConfig.bossReward.minGemQuality）
    },
  },

  /**
   * 永久成长成本公式参数。来源：总纲 §6.4「C(L) = 100 + 50 × (L − 1)」。状态：PROVISIONAL。
   *
   * **不属于本文件**：成本曲线是成长系统的事实，不是伤害系统的事实。保留这个键只是为了
   * 不破坏已有调用方（TASK-04 经济校准）。它现在是一个**别名**，
   * 转发到唯一的定义处 `playerConfig.metaGrowth.costBase/costStep/maxLevel`
   * （见 playerConfig.ts 的 `metaGrowthCost` 只读视图）。
   *
   * 为什么合并（D-08 落了 milestoneBonus 之后，漂移风险变高）：
   *   此前 `damageConfig.metaGrowthCost = { base: 100, step: 50, maxLevel: 10 }` 与
   *   `playerConfig.metaGrowth = { costBase: 100, costStep: 50, maxLevel: 10 }` 是两份手抄副本。
   *   经济校准（Q-NEW-1）几乎必然只改其中一处，而漂移是静默的——两处都"看起来对"，
   *   但成本曲线只会在其中一条路径上生效，排查成本远高于合并成本。
   *   用 getter 转发后，`damageConfig.metaGrowthCost.step === playerConfig.metaGrowth.costStep`
   *   在结构上不可能不成立，且 `playerConfig` 仍是纯数据叶子（不反向 import）。
   */
  metaGrowthCost: {
    get base(): number {
      return playerConfig.metaGrowth.costBase;
    },
    get step(): number {
      return playerConfig.metaGrowth.costStep;
    },
    get maxLevel(): number {
      return playerConfig.metaGrowth.maxLevel;
    },
  },
} as const;
