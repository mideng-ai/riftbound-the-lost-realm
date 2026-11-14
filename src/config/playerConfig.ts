/**
 * 玩家与双武器基准数值。
 * 数值唯一来源：总纲-项目规划书V1.md §2.2 战斗基准表（CONFIRMED）
 *             + 开放问题 Q9（Dash 冲刺时长，PROVISIONAL）
 *             + 设计-设计总纲.md §6.4 金币永久成长（每级 +2% / +1%，Lv.10 里程碑 +5%）
 *             + docs/设计-D09-D08-R01数值锚点仲裁书.md 裁定 2（D-08 里程碑落地）
 *
 * 本文件是纯数据叶子：只 import config/common.ts，不 import domain / 任何运行时模块。
 * 派生函数（metaGrowthPctOfLevel / masteryPctOfLevel）是**纯数值换算**，
 * 不触碰任何运行时状态，因此留在 config 层不违反分层铁律 L2。
 */
import { PLAYER_BASE_MAX_HP } from './common.ts';

export const playerConfig = {
  /**
   * 玩家基础属性。来源：规划书 §2.2。状态：CONFIRMED。
   * 注意：maxHpBase 是基数，实际最大生命由 domain/player.ts 的 deriveMaxHp 派生
   *      （100 × (1 + 生命宝石 Σ + 森林生存等级 × 1%)），业务侧禁止直接读它当最终值。
   */
  base: {
    maxHpBase: PLAYER_BASE_MAX_HP, // 100（规划书 §2.2）— CONFIRMED
    moveSpeedMps: 5.0, // m/s（规划书 §2.2）— CONFIRMED
    hitInvulnSec: 0.5, // 受击无敌帧 0.5s（规划书 §2.2）— CONFIRMED
  },

  /**
   * Dash 参数。来源：规划书 §2.2「3.5m，CD 1.5s，无敌帧：无（原样保留待原型验证）」。
   * 状态：距离/CD/无敌帧 = CONFIRMED；冲刺时长 = PROVISIONAL（Q9 采信：0.15s 匀速冲刺，
   *       由 NEW-01 原型验证后定案；改这个值不触发变更流程）。
   */
  dash: {
    distanceM: 3.5, // 冲刺位移 3.5m — CONFIRMED（规划书 §2.2）
    cooldownSec: 1.5, // 冷却 1.5s — CONFIRMED（规划书 §2.2）
    invulnSec: 0, // 冲刺期间无无敌帧 — CONFIRMED（规划书 §2.2，原样保留待原型验证）
    /** 冲刺持续时长 0.15s，匀速位移 = distanceM / durationSec ≈ 23.3 m/s — PROVISIONAL（Q9） */
    durationSec: 0.15,
  },

  /**
   * 法杖（staff）基准。来源：规划书 §2.2「8 / 发，弹速 14 m/s，间隔 0.50s」。状态：CONFIRMED。
   */
  staff: {
    baseDamage: 8, // 单发基础伤害 — CONFIRMED
    intervalSec: 0.5, // 攻击间隔 0.50s — CONFIRMED
    projectileSpeedMps: 14, // 弹速 14 m/s — CONFIRMED
  },

  /**
   * 魔法剑（sword）基准。来源：规划书 §2.2「6 / 次，扇形 120°（D-104 已载），半径 2.5m，间隔 0.80s」。
   * 状态：CONFIRMED。扇形角不可被设计变更随意改动（TASK-02 验收「不改变已确认的魔法剑攻击形状」）。
   */
  sword: {
    baseDamage: 6, // 单次伤害 — CONFIRMED
    arcAngleDeg: 120, // 扇形张角 120°（D-104 B 方案）— CONFIRMED
    radiusM: 2.5, // 扇形半径 2.5m — CONFIRMED
    intervalSec: 0.8, // 攻击间隔 0.80s — CONFIRMED
  },

  /**
   * 局外永久成长（金币购买）。来源：设计-设计总纲.md §6.4。状态：规则 CONFIRMED / 数值 PROVISIONAL。
   * 玩家最大生命派生只需要 forestSurvivalPctPerLevel + milestoneBonus.forestSurvivalPct。
   *
   * 满级里程碑（D-08 裁定，仲裁书 §2.2）：Lv.10 额外 +5%，
   *   熟练 Lv.10 总加成 = 10 × 2% + 5% = 25%（A 区满配 1 + 32% + 25% = 1.57）
   *   森林生存 Lv.10 总加成 = 10 × 1% + 5% = 15%（最大生命 100 → 115）
   * 所以 Lv.9 → Lv.10 是显式断层（熟练 +18% → +25%，森林生存 +9% → +15%）。
   */
  metaGrowth: {
    /** 每个熟练度等级 = 对应武器基础伤害 +2% — PROVISIONAL（总纲 §6.4） */
    masteryPctPerLevel: 0.02,
    /** 每级森林生存 = 玩家最大生命 +1% — PROVISIONAL（总纲 §6.4） */
    forestSurvivalPctPerLevel: 0.01,
    /** 三个成长方向均为 Lv.0–Lv.10 — CONFIRMED（总纲 §6.4） */
    maxLevel: 10,
    /**
     * Lv.10 里程碑额外加成（D-08 裁定）：熟练 +5%、森林生存 +5%。
     * 达到 level 级时一次性追加，不随等级线性增长。
     * 约束：masteryPctPerLevel × maxLevel + milestoneBonus.masteryPct = 0.25（AC-3）。
     */
    milestoneBonus: { level: 10, masteryPct: 0.05, forestSurvivalPct: 0.05 },
    /**
     * 下一等级成本 C(L) = 100 + 50 × (L − 1)，L 为准备购买的下一级。
     * 例：Lv.0→1 = 100 金币，之后每级 +50，最高 Lv.10。— PROVISIONAL（总纲 §6.4）
     *
     * 注意：costBase / costStep / maxLevel 与 damageConfig.metaGrowthCost 是**同一事实**，
     *   由下方 metaGrowthCost 只读视图转出（单一事实来源 = 本文件），不要在别处重复写字面量。
     */
    costBase: 100,
    costStep: 50,
  },

  /**
   * 武器永久强化表（森林材料升级 Lv.1–Lv.5）。
   * 来源：规划书 §2.1 裁决 #1「表中数值即该级总值（百分比加成），奇数级线性插值 +4%/级」。
   * 状态：CONFIRMED（语义）/ PROVISIONAL（数值）。
   * 下标 = 等级 − 1；Lv.1 对应 +0%（未强化），Lv.5 = +32%。
   */
  weaponUpgradePctByLevel: [0, 0.08, 0.16, 0.24, 0.32] as const,
} as const;

// ─────────────────────────────────────────────────────────────
// 永久成长成本：单一事实来源
// ─────────────────────────────────────────────────────────────

/**
 * 永久成长成本表的只读视图（供 TASK-04 经济校准取用）。
 *
 * **为什么不直接写字面量**：`playerConfig.metaGrowth.costBase / costStep / maxLevel` 与
 * `damageConfig.metaGrowthCost.base / step / maxLevel` 描述的是同一个事实
 * （总纲 §6.4「C(L) = 100 + 50 × (L − 1)」）。此前是两份手抄副本，
 * 一旦有人只改其中一处（比如把 step 调成 60 做经济校准），两处就漂移，
 * 且漂移是静默的——没有任何编译期或运行期信号。
 *
 * **合并方案**：唯一事实来源放在 `playerConfig.metaGrowth`（它是完整成长规则的宿主，
 * 含熟练/森林生存/里程碑），本常量用 getter 从它派生。
 * `damageConfig.metaGrowthCost` 反过来指向这里，于是
 * `damageConfig.metaGrowthCost.step === playerConfig.metaGrowth.costStep` 恒成立（结构上不可能不一致）。
 * 用 getter 而不是快照对象，是为了让"读到的永远是最新值"这一点成立。
 */
export const metaGrowthCost = {
  get base(): number {
    return playerConfig.metaGrowth.costBase;
  },
  get step(): number {
    return playerConfig.metaGrowth.costStep;
  },
  get maxLevel(): number {
    return playerConfig.metaGrowth.maxLevel;
  },
} as const;

// ─────────────────────────────────────────────────────────────
// 成长等级 → 百分比派生（D-08 单一入口）
// ─────────────────────────────────────────────────────────────

/** 成长方向：两条互不相干的曲线，各自的里程碑 bonus 字段名不同。 */
export type MetaGrowthTrack = 'mastery' | 'forestSurvival';

/**
 * 成长等级 → 该方向的总百分比加成。
 *
 * 公式（D-08 裁定，仲裁书 §2.2）：
 *   pct = min(level, maxLevel) × perLevelPct + (level ≥ milestone.level ? milestonePct : 0)
 *
 * 语义要点：里程碑是**一次性跨越**，不是"每级多给"。
 *   Lv.9 熟练 = 9 × 2% = 0.18，Lv.10 熟练 = 10 × 2% + 5% = 0.25（断层 +0.07）
 *   Lv.9 森林生存 = 9 × 1% = 0.09，Lv.10 森林生存 = 10 × 1% + 5% = 0.15
 *   ⚠ 里程碑必须加在「满级的线性值」上，不是加在「Lv.9 的值」上：
 *     森林生存若是 9% + 5% = 14% 就错了（那等于只升了 9 级）。正确是 10% + 5% = 15%。
 *   所以实现必须用 `min(level, maxLevel) × perLevel`（先算满级线性值），
 *   而不能用 `(level - 1) × perLevel`。
 *
 * 越界与非法输入一律夹取到 [0, maxLevel]，非有限值按 0 处理（与 damage.ts 的夹取风格一致）。
 *
 * @param track 成长方向
 * @param level 等级（0–maxLevel，传浮点会向下取整）
 * @returns 该等级的总百分比加成（0.25 = +25%）
 */
export function metaGrowthPctOfLevel(track: MetaGrowthTrack, level: number): number {
  const { masteryPctPerLevel, forestSurvivalPctPerLevel, maxLevel, milestoneBonus } = playerConfig.metaGrowth;
  const perLevelPct = track === 'mastery' ? masteryPctPerLevel : forestSurvivalPctPerLevel;
  const milestonePct = track === 'mastery' ? milestoneBonus.masteryPct : milestoneBonus.forestSurvivalPct;
  const lv = Number.isFinite(level) ? Math.min(maxLevel, Math.max(0, Math.floor(level))) : 0;
  const levelPct = lv * perLevelPct;
  const milestone = lv >= milestoneBonus.level ? milestonePct : 0;
  return levelPct + milestone;
}

/**
 * 熟练度等级 → 武器基础伤害加成（A 区第二项）。
 * @param level 熟练度等级（0–10）
 */
export function masteryPctOfLevel(level: number): number {
  return metaGrowthPctOfLevel('mastery', level);
}
