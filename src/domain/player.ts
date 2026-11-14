/**
 * 玩家定义 / 运行时状态 / 派生函数。
 *
 * 数值唯一来源：config/playerConfig.ts（本文件不写死任何数字）。
 *   - 规划书 §2.2 战斗基准表（100 HP / 5.0 m/s / 0.5s 无敌帧 / Dash 3.5m CD 1.5s / 法杖 8-0.5-14 / 剑 6-120°-2.5-0.8）
 *   - 总纲 §6.4 金币永久成长（森林生存每级 +1% 最大生命，Lv.10 里程碑 +5%）
 *   - Q9 采信：Dash = 0.15s 匀速冲刺（PROVISIONAL）
 *
 * 本文件禁止 import Babylon / DOM。
 */
import { metaGrowthPctOfLevel, playerConfig } from '../config/playerConfig.ts';
import type { WeaponId } from './ids.ts';
import type { StatusSlots } from './damage.ts';
import type { EntityId, Transform } from './types.ts';

// ─────────────────────────────────────────────────────────────
// 静态定义
// ─────────────────────────────────────────────────────────────

/** 玩家静态定义（不随局内变化的部分）。 */
export interface PlayerDefinition {
  /** 基准最大生命 100；**最终值必须用 deriveMaxHp 派生**，不要直接读这个字段当血条上限 */
  readonly maxHpBase: number;
  /** 移动速度 m/s */
  readonly moveSpeedMps: number;
  /** 受击无敌帧时长（秒） */
  readonly hitInvulnSec: number;
  readonly dash: {
    readonly distanceM: number;
    readonly cooldownSec: number;
    /** 冲刺期间无敌帧（规划书原样保留：无） */
    readonly invulnSec: number;
    /** 冲刺持续时长（Q9 PROVISIONAL：0.15s 匀速） */
    readonly durationSec: number;
  };
  readonly staff: {
    readonly baseDamage: number;
    readonly intervalSec: number;
    readonly projectileSpeedMps: number;
  };
  readonly sword: {
    readonly baseDamage: number;
    readonly arcAngleDeg: number;
    readonly radiusM: number;
    readonly intervalSec: number;
  };
}

/** 从 config 组装玩家定义（避免各模块各自读 config 的字段名）。 */
export function playerDefinition(): PlayerDefinition {
  const c = playerConfig;
  return {
    maxHpBase: c.base.maxHpBase,
    moveSpeedMps: c.base.moveSpeedMps,
    hitInvulnSec: c.base.hitInvulnSec,
    dash: {
      distanceM: c.dash.distanceM,
      cooldownSec: c.dash.cooldownSec,
      invulnSec: c.dash.invulnSec,
      durationSec: c.dash.durationSec,
    },
    staff: {
      baseDamage: c.staff.baseDamage,
      intervalSec: c.staff.intervalSec,
      projectileSpeedMps: c.staff.projectileSpeedMps,
    },
    sword: {
      baseDamage: c.sword.baseDamage,
      arcAngleDeg: c.sword.arcAngleDeg,
      radiusM: c.sword.radiusM,
      intervalSec: c.sword.intervalSec,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 派生：最大生命
// ─────────────────────────────────────────────────────────────

/**
 * 派生玩家最大生命。
 *
 * 公式（规划书 §2.2 + 总纲 §6.4 + D-08 里程碑）：
 *   maxHp = maxHpBase × (1 + gemVitalityPct + forestSurvivalPct)
 *
 * 其中：
 *   gemVitalityPct    = 生命宝石加成（普通 8% × 品质 × 重复，规划书 §2.1 B 区语义按同样规则计算）
 *   forestSurvivalPct = 森林生存总加成，**必须由 {@link forestSurvivalPctOfLevel} 传入**
 *                       （Lv.9 = 9%，Lv.10 = 15%——含 Lv.10 里程碑 +5%）。
 *                       直接写 `level × 0.01` 会漏掉里程碑，Lv.10 只得到 10%。
 *
 * 两个加成是**加算合并**再乘基数，不是两次独立乘——与总纲「玩家最大生命 +8%」的
 * 单项语义一致，也避免 8% × 1% 的双指数膨胀。
 *
 * @param gemVitalityPct    生命宝石总加成（0.08 = +8%）
 * @param forestSurvivalPct 森林生存总加成（Lv.9 = 0.09，Lv.10 = 0.15，用 forestSurvivalPctOfLevel 取）
 * @returns 最大生命（未取整，保持浮点精度；显示取整由 UI 负责）
 */
export function deriveMaxHp(gemVitalityPct: number, forestSurvivalPct: number): number {
  const base = playerConfig.base.maxHpBase;
  const g = Number.isFinite(gemVitalityPct) ? Math.max(0, gemVitalityPct) : 0;
  const f = Number.isFinite(forestSurvivalPct) ? Math.max(0, forestSurvivalPct) : 0;
  return base * (1 + g + f);
}

/**
 * 森林生存等级 → 最大生命加成比例。
 * 总纲 §6.4 每级 +1%；D-08 裁定 Lv.10 里程碑额外 +5% → Lv.10 = 10 × 1% + 5% = 15%。
 *
 * 实现转发到 `playerConfig.metaGrowthPctOfLevel('forestSurvival', level)`，
 * 以保证与 A 区熟练用到**同一条**里程碑规则。业务侧不要自己乘 perLevel。
 *
 * @param level 森林生存等级（0–10），越界自动夹取
 */
export function forestSurvivalPctOfLevel(level: number): number {
  return metaGrowthPctOfLevel('forestSurvival', level);
}

/**
 * 武器实际攻击间隔 = 基础间隔 × 间隔乘数（1 − 间隔类缩短，已由 caps 夹过 −40%）。
 *
 * 间隔上限的控制在 damage.rebuildDamageLayers 里做了（intervalMul），
 * 这里只做乘法，避免两处各夹一次导致语义不一致。
 *
 * @param weaponId   武器
 * @param intervalMul 来自 DamageLayers.intervalMul
 * @returns 实际间隔（秒）
 */
export function weaponIntervalSec(weaponId: WeaponId, intervalMul: number): number {
  const base = weaponId === 'staff' ? playerConfig.staff.intervalSec : playerConfig.sword.intervalSec;
  const mul = Number.isFinite(intervalMul) ? Math.max(0, intervalMul) : 1;
  return base * mul;
}

/**
 * Dash 实际冷却 = 基础 CD × dashCdMul（dashCdMul 已保证不低于 dashCdFloorSec）。
 * @param dashCdMul 来自 DamageLayers.dashCdMul
 */
export function dashCooldownSec(dashCdMul: number): number {
  const mul = Number.isFinite(dashCdMul) ? Math.max(0, dashCdMul) : 1;
  return playerConfig.dash.cooldownSec * mul;
}

/**
 * Dash 冲刺速度（m/s）= 距离 / 时长。
 * Q9 采信：0.15s 匀速冲刺 → 3.5 / 0.15 ≈ 23.33 m/s。
 * 单独导出是为了让 NEW-01 不用自己除，且改动 distance 或 duration 时两处自动同步。
 */
export function dashSpeedMps(): number {
  const { distanceM, durationSec } = playerConfig.dash;
  return durationSec > 0 ? distanceM / durationSec : 0;
}

// ─────────────────────────────────────────────────────────────
// 运行时状态
// ─────────────────────────────────────────────────────────────

/**
 * 玩家运行时状态。
 *
 * 设计约束（对象池友好）：字段全部扁平、无嵌套数组、无 Map，
 * 复用同一实例原地改写，避免每帧分配（移动端 GC 压力的主要来源之一）。
 */
export interface PlayerRuntime {
  entityId: EntityId;
  hp: number;
  maxHp: number;
  transform: Transform;
  /** >0 期间免疫伤害（受击无敌帧） */
  invulnTimerSec: number;
  /** Dash 冷却剩余（秒） */
  dashTimerSec: number;
  /** Dash 冲刺进行中剩余时长（秒）；>0 表示正在冲刺（Q9 匀速位移） */
  dashActiveTimerSec: number;
  currentWeapon: WeaponId;
  /** 玩家也可中毒 / 减速（毒区、剧毒词缀） */
  statusSlots: StatusSlots;
}

/**
 * 创建初始玩家运行时状态。
 *
 * @param entityId  领域层分配的实体 ID
 * @param spawnPos  出生点（渲染层坐标由场景传入，领域层只存三元组）
 * @param maxHp     初始最大生命（应来自 deriveMaxHp，而不是硬编码 100）
 */
export function createPlayerRuntime(
  entityId: EntityId,
  spawnPos: { x: number; y: number; z: number },
  maxHp: number,
): PlayerRuntime {
  return {
    entityId,
    hp: maxHp,
    maxHp,
    transform: { position: { ...spawnPos }, facingDeg: 0 },
    invulnTimerSec: 0,
    dashTimerSec: 0,
    dashActiveTimerSec: 0,
    currentWeapon: 'staff', // 默认起手法杖（法杖是基础远程手段，规划书 §2.2 列在首位）
    statusSlots: {
      burnStacks: 0,
      burnTimerSec: 0,
      slowPct: 0,
      slowTimerSec: 0,
      poisonStacks: 0,
      poisonTimerSec: 0,
      chainJumpDone: false,
    },
  };
}

/**
 * 玩家受伤：应用受伤乘区（石肤）、无敌帧判定，返回实际扣减。
 *
 * 说明：这是契约层的**纯计算**辅助（不持有状态、不改入参），
 * 真实的状态写入由 NEW-01 调用后自行完成——保持 domain 无副作用，可单测。
 *
 * @param runtime     当前玩家状态（只读使用）
 * @param rawDamage   未经受伤乘区的伤害
 * @param damageTakenMul 来自 DamageLayers.damageTakenMul（1 = 无减免）
 * @returns 实际应扣的生命（0 = 无敌帧内或已死亡）
 */
export function applyPlayerDamage(runtime: PlayerRuntime, rawDamage: number, damageTakenMul: number): number {
  if (runtime.invulnTimerSec > 0 || runtime.hp <= 0) return 0;
  const mul = Number.isFinite(damageTakenMul) ? Math.max(0, damageTakenMul) : 1;
  const raw = Number.isFinite(rawDamage) ? Math.max(0, rawDamage) : 0;
  return Math.min(raw * mul, runtime.hp);
}
