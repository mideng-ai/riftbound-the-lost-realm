/**
 * 伤害三层乘区管线 + 元素 on-hit 触发 + 控制上限 + 结算入口。
 *
 * 数值与结构唯一来源：总纲-项目规划书V1.md §2.1（B1/B2 裁决，结构不可改）
 *   单发伤害 = 武器基础伤害 × A × B × C
 *   A = 1 + 武器强化% + 金币熟练%       —— 局外基础区，层内加算（裁决 #2）
 *   B = 1 + Σ(属性宝石：最强单颗 × 品质倍率 × 重复倍率)，异属性加算合并（裁决 #3）
 *   C = 1 + Σ 局内临时%                  —— 升级卡/事件 buff，加算合并，总上限 +150%
 * 元素触发效果独立结算，不进乘区。
 *
 * C 区构成裁定（D-02，技术总监 2026-11-14）：
 *   文档两处表述必须同时成立——
 *     ① 设计-局内升级系统.md §2 引言「全部进伤害乘区 C 区（局内临时区）… C 区总上限 +150%」
 *     ② 同文件 §2 表「#5/#6 上限 = C 区伤害类 ≤ +100%」
 *   因此 C 区的项集 ≠ {damage}，而是「**经本模块统一夹取后，最终乘进单发输出的局内百分比**」
 *   （见 {@link C_ZONE_DERIVED_CATEGORIES}）：damage 是其中一类且另有 +100% 单类上限；
 *   其余各类各有自己的维度上限（间隔 −40% / 破甲 +50% …）并派生到独立乘区。
 *   若把 C 的项集缩成 {damage}，②里的「伤害类」就没有对立面、①的总上限永不生效——
 *   这正是 QA 报的 D-02 死代码，也是我拒绝"删常量"方案的理由（见 docs/流程-决策日志.md ADR-TD-007）。
 *
 * 本文件禁止 import Babylon / DOM（分层铁律 L3）。数值一律从 config 取，禁止硬编码。
 */
import { damageConfig } from '../config/damageConfig.ts';
import { gemConfig } from '../config/gemConfig.ts';
import { enemyConfig } from '../config/enemyConfig.ts';
import { playerConfig } from '../config/playerConfig.ts';
import type { ElementId, EnemyId, NormalEnemyId, WeaponId } from './ids.ts';
import type { EntityId, Vec3 } from './types.ts';

// ─────────────────────────────────────────────────────────────
// A 区：局外基础区
// ─────────────────────────────────────────────────────────────

/**
 * A 区输入。
 * 强化表语义按裁决 #1：表中数值即该级**总值**（如 Lv5 = +32%），非逐级平加。
 * 数值来源：playerConfig.weaponUpgradePctByLevel / playerConfig.metaGrowth。
 */
export interface OutrunBaseLayerInput {
  /** 武器强化加成（0 / 0.08 / 0.16 / 0.24 / 0.32，规划书 §2.1 裁决 #1） */
  readonly weaponUpgradePct: number;
  /** 金币熟练加成（每级 +2%，总纲 §6.4） */
  readonly masteryPct: number;
}

// ─────────────────────────────────────────────────────────────
// B 区：宝石属性区
// ─────────────────────────────────────────────────────────────

/**
 * B 区输入：一条属性宝石条目。
 *
 * 裁决 #3 的官方算例：力量传说×3 = 0.06 × 2.4 × 2.0 = 28.8%（规划书 §2.1）。
 * 迅捷（攻速）、生命（最大生命）宝石不进伤害 B 区，分别走武器间隔 / deriveMaxHp。
 */
export interface GemDamageEntry {
  /** V1.0 进伤害乘区的属性宝石只有力量（规划书 §2.1） */
  readonly gemId: 'power';
  /** 普通品质基础值 0.06（总纲 §5.3） */
  readonly basePct: number;
  /** 品质倍率 1.00/1.25/1.55/1.95/2.40（总纲 §5.4） */
  readonly qualityMult: number;
  /** 重复倍率 1 颗 1.0 / 2 颗 1.5 / 3 颗 2.0（总纲 §5.5） */
  readonly repeatMult: number;
}

/**
 * B 区输入容器。
 *
 * 语义（裁决 #3）：**同一宝石种类内取最强单颗**（basePct × qualityMult × repeatMult），
 * 不同种类之间加算合并。V1.0 只有 power 一种，因此实际就是 Σ 各条目的乘积。
 */
export interface GemDamageLayerInput {
  readonly entries: readonly GemDamageEntry[];
}

// ─────────────────────────────────────────────────────────────
// C 区：局内临时区
// ─────────────────────────────────────────────────────────────

/**
 * C 区 buff 类别。按类别分组以便施加**类别上限**（升级文档 §2 上限列）。
 * 注意 armorBreak / arcAngle / dashCd / xpGain / lifesteal 不进 C 伤害乘区，
 * 它们各自派生到 DamageLayers 的对应字段。
 */
export type InRunBuffCategory =
  | 'damage' // C 区伤害类，类别上限 +100%（升级池 #5/#6）
  | 'interval' // 攻速类（= 间隔缩短），合计上限 −40%，#2 与 #8 共享
  | 'moveSpeed' // 疾风步 #11，上限 +40%
  | 'damageTaken' // 石肤 #12，受伤减免上限 −40%
  | 'procChance' // 元素共鸣 #4，概率总上限 +50%（绝对值）
  | 'armorBreak' // 破甲 #9，对精英/Boss 上限 +50%
  | 'arcAngle' // 剑气扩展 #10，扇形上限 240°
  | 'dashCd' // 虚空冲刺 #13，CD 下限 0.9s
  | 'xpGain' // 时之沙 #15
  | 'lifesteal' // 吸血剑气 #7（按最大生命比例回复）
  // ── 以下是「无 caps、也不进 C 乘区」的承载类别（升级文档 §2 上限列为「—」的卡）──
  | 'projectileCount' // 分裂弹 #1：承载弹道总数，rebuildDamageLayers 取最大值
  | 'pierce' // 穿透法术 #3：承载穿透目标数
  | 'killHeal'; // 汲取 #14：承载击杀回复的固定生命值

/** 一条局内 buff（升级卡或事件增益落地后的具体数值）。 */
export interface InRunBuffEntry {
  /** buff 来源 ID（升级卡 UpgradeId 或事件 ID），用于去重与 UI 显示 */
  readonly buffId: string;
  readonly category: InRunBuffCategory;
  /** 数值含义随 category 变：damage/moveSpeed 等为百分比；arcAngle 为度；lifesteal 为比例 */
  readonly pct: number;
}

/**
 * 计入「C 区总量」的类别清单 —— D-02 裁定的可执行形式。
 *
 * 入选口径（两条都必须满足）：
 *   ① 该类别经本模块统一夹取后，**以百分比形式直接放大玩家单发输出**；
 *   ② 它**不是**独立乘区——即它没有自己的 `xxxMul` 派生字段、不改变弹道/间隔等维度。
 *
 * 为什么不把 interval 直接加进 C：
 *   interval 改的是**攻速**（时间维度），不是单发伤害；它已有独立的 intervalMul。
 *   把它加进 C 的百分比总和等于"用攻速去撞伤害上限"，是个量纲错误的双重计价。
 *
 * 因此当前项集 = {damage}。**这不是巧合，而是当前卡池的客观事实**：
 *   15 张卡里，唯一"放大输出且不是独立乘区"的类别就是 damage（#5 重弹 / #6 剑刃强化）；
 *   armorBreak 只对 elite/boss 生效（单体目标维）、procChance 是概率维、
 *   interval/moveSpeed/damageTaken/dashCd/xpGain/lifesteal 各有独立乘区或计量维度。
 *
 * ⚠ 这张表是给**未来**留的：一旦新增"同时满足 ①②、但不属于 damage"的类别
 *   （典型候选：全属性增伤、对特定怪种增伤、技能倍率类事件 buff），
 *   只需把它加进这里，它就会自动计入 C 区总量并受 inRunTotalPct 约束——
 *   不需要再改 rebuildDamageLayers 的计算顺序。
 *
 * 这是 `as const` 的只读元组，遍历它有固定的 1 元素开销，不会随 buff 数量增长。
 *
 * ⚠ **禁止**把 `armorBreak` 加入本表（R-01 裁定）：破甲已由 `resolveDamageHit` 作为
 *   目标维度独立乘区结算，重复计入会导致 Boss 战破甲双计（Boss TTK 从 2.94 分塌到约 1.18 分）。
 *   参考：docs/设计-D09-D08-R01数值锚点仲裁书.md 裁定 3 / §3.1。
 */
export const C_ZONE_DERIVED_CATEGORIES = ['damage'] as const satisfies readonly InRunBuffCategory[];

/** C 区计量的中间结果（供 QA / UI 诊断"离上限还差多少"，也是 D-02 可验证的证据载体）。 */
export interface CZoneBreakdown {
  /** 伤害类原始合计（未夹取），对应升级池 #5/#6 */
  readonly damageRawPct: number;
  /** 伤害类经单类上限（+100%）夹取后的值 */
  readonly damageClampedPct: number;
  /** 伤害类被单类上限削掉的部分（= damageRawPct − damageClampedPct，≥ 0） */
  readonly damageOverflowPct: number;
  /** 计入 C 区总量的原始合计（各类夹取前） */
  readonly cZoneRawPct: number;
  /** 计入 C 区总量、经各类夹取后的合计（**这才是与 inRunTotalPct 比较的量**） */
  readonly cZonePct: number;
  /** C 区总量被总上限削掉的部分（≥ 0；> 0 即证明 inRunTotalPct 真实生效） */
  readonly totalOverflowPct: number;
  /** 实际生效的 C 区百分比（= min(cZonePct, inRunTotalPct)） */
  readonly appliedPct: number;
}

// ─────────────────────────────────────────────────────────────
// caps
// ─────────────────────────────────────────────────────────────

/**
 * 乘区与派生上限表。
 *
 * 落地处理说明（与提案 §2.3 的差异）：提案里写的是字面量类型
 * `interface DamageCaps { inRunTotalPct: 1.5 }`——TS 不允许无值成员，无法编译。
 * 这里改为 `typeof config.caps.xxx` 的只读 number 字面量类型：
 * 既是 number（可用于运算），又由 config 单一定义，且赋错值会报类型错误。
 */
export interface DamageCaps {
  /**
   * C 区总量上限 +150%（规划书 §2.1 / 升级文档 §2 引言）。
   *
   * 作用于 {@link C_ZONE_DERIVED_CATEGORIES} 所列各类（已先各自夹取）之和。
   * 这是**结构性护栏**：当前卡池下 C 区只由 damage 构成，其单类上限（+100%）
   * 已先一步收紧，因此本上限暂时管不到任何真实输入；一旦新增 C 区类别即自动生效。
   * 是否已生效由 {@link CZoneBreakdown.totalOverflowPct} 断言，不是靠注释声称。
   */
  readonly inRunTotalPct: typeof damageConfig.caps.inRunTotalPct;
  /** C 区 damage 单类上限 +100%（升级池 #5/#6） */
  readonly inRunDamagePct: typeof damageConfig.caps.inRunDamagePct;
  /** 间隔类合计 −40%，#2/#8 共享 */
  readonly intervalReductionPct: typeof damageConfig.caps.intervalReductionPct;
  /** 触发概率总上限 50%（升级池 #4 / Q4-B） */
  readonly procChanceAbs: typeof damageConfig.caps.procChanceAbs;
  /** 破甲 +50%（升级池 #9） */
  readonly armorBreakPct: typeof damageConfig.caps.armorBreakPct;
  /** 扇形角最终上限 240°（升级池 #10） */
  readonly arcAngleDegCap: typeof damageConfig.caps.arcAngleDegCap;
  /** 移速 +40%（升级池 #11） */
  readonly moveSpeedPct: typeof damageConfig.caps.moveSpeedPct;
  /** 受伤减免 −40%（升级池 #12） */
  readonly damageTakenRedPct: typeof damageConfig.caps.damageTakenRedPct;
  /** Dash CD 下限 0.9s（升级池 #13） */
  readonly dashCdFloorSec: typeof damageConfig.caps.dashCdFloorSec;
  /** 分裂弹弹道上限 4（升级池 #1） */
  readonly maxProjectileCount: typeof damageConfig.caps.maxProjectileCount;
}

// ─────────────────────────────────────────────────────────────
// 快照
// ─────────────────────────────────────────────────────────────

/**
 * 三层快照：数值只在 buff 变化时重算（dirty 标记由调用方维护），
 * 每发子弹只做乘法——移动端零分配的关键设计。
 *
 * 派生字段与 A/B/C 一起重算，避免每帧再遍历一遍 buff 列表。
 */
export interface DamageLayers {
  /** A 区总乘数 = 1 + 武器强化% + 熟练% */
  readonly A: number;
  /** B 区总乘数 = 1 + Σ 宝石属性% */
  readonly B: number;
  /** C 区总乘数 = 1 + min(Σ C 区各类%, 总上限) */
  readonly C: number;
  /**
   * C 区构成明细（D-02）：C 是由哪些类别、各被夹掉多少构成的。
   * 存在的意义是让"总上限是否生效"变成**可断言的事实**而不是靠反推；
   * UI 的"局内伤害加成 +x%"与 QA 的上限验证都应该读这里，而不是自己再算一遍。
   */
  readonly cZone: CZoneBreakdown;
  /** 攻击间隔乘数 = 1 − min(intervalReductionPct) */
  readonly intervalMul: number;
  /** 移速乘数 = 1 + min(moveSpeedPct) */
  readonly moveSpeedMul: number;
  /** 受伤乘数 = 1 − min(damageTakenRedPct) */
  readonly damageTakenMul: number;
  /** 元素触发概率绝对加成（0–0.5） */
  readonly procChanceBonus: number;
  /** 破甲加成（0–0.5），只对 elite / boss 生效 */
  readonly armorBreakBonus: number;
  /** 剑扇形最终角度（base 120 + Σ，cap 240） */
  readonly arcAngleDeg: number;
  /** Dash CD 乘数 = clamp(1 − Σ dashCd, ≥ dashCdFloorSec / baseCooldown) */
  readonly dashCdMul: number;
  /** 经验获取乘数 = 1 + Σ xpGain */
  readonly xpGainMul: number;
  /** 吸血比例合计（#7 剑命中按最大生命比例回复） */
  readonly lifestealPctMaxHp: number;
  /** 击杀回复固定生命值（#14 汲取，单位是「点生命」不是百分比） */
  readonly killHealHp: number;
  /** 分裂弹弹道数（1 = 未升级） */
  readonly projectileCount: number;
}

// ─────────────────────────────────────────────────────────────
// rebuildDamageLayers —— 真实实现
// ─────────────────────────────────────────────────────────────

/** 按类别汇总 buff 的 pct（同类加算合并）。 */
function sumByCategory(buffs: readonly InRunBuffEntry[], category: InRunBuffCategory): number {
  let sum = 0;
  for (const b of buffs) {
    if (b.category === category && Number.isFinite(b.pct)) sum += b.pct;
  }
  return sum;
}

/** 数值夹取：把非有限值归零后再夹到 [min, max]（防止 NaN 顺着乘法链污染整个伤害）。 */
function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/**
 * 重建三层乘区快照。
 *
 * 计算顺序（与规划书 §2.1 对齐）：
 *   A = 1 + 强化% + 熟练%                        （层内加算，裁决 #2）
 *   B = 1 + Σ entries(base × quality × repeat)    （裁决 #3：取最强 × 重复倍率）
 *   C = 1 + min(Σ C 区各类%, inRunTotalPct)      （总上限 +150%，D-02）
 *
 * C 区**两级夹取**，顺序不可交换：
 *   ① 单类上限：damage 类先夹到 inRunDamagePct（+100%，升级池 #5/#6 要求）
 *   ② 总量上限：把 ① 夹取后的各类值相加，再整体夹到 inRunTotalPct（+150%，规划书 §2.1）
 *
 * 为什么必须"先单类、后总量"：
 *   反过来先夹总量再夹单类，单类上限会把总量又压回去，总量永远只能在 0–100% 区间内活动；
 *   而且 `min(min(x,damageCap),totalCap)` 与 `min(x,damageCap)` 在 damageCap ≤ totalCap 时
 *   恒等于后者——总上限就成了死代码（这正是 QA 报的 D-02）。
 *
 * 为什么"当前卡池下总上限不会触发"不是缺陷：
 *   见 {@link C_ZONE_DERIVED_CATEGORIES}。总上限是**结构性护栏**而非当前可达值：
 *   它约束的是未来新增的 C 区类别与事件 buff，不会因为当前只有一个类别就失去意义。
 *   为了让它可被验证、也为了 UI 能显示"离上限还差多少"，本函数把夹取明细记进
 *   {@link CZoneBreakdown}——**其中 totalOverflowPct 是总上限是否生效的唯一权威判据**。
 *
 * @param a    A 区输入
 * @param b    B 区输入
 * @param c    局内 buff 列表（未过滤；本函数负责按类别与 caps 夹取）
 * @param caps 上限表（生产代码传 damageConfig.caps，测试可传自定义）
 * @returns 新的只读快照（不可变：一次重算一个新对象，调用方自行持有引用）
 */
export function rebuildDamageLayers(
  a: OutrunBaseLayerInput,
  b: GemDamageLayerInput,
  c: readonly InRunBuffEntry[],
  caps: DamageCaps,
): DamageLayers {
  // ── A 区 ──
  const aSum = clampFinite(a.weaponUpgradePct, 0, Number.POSITIVE_INFINITY) + clampFinite(a.masteryPct, 0, Number.POSITIVE_INFINITY);
  const A = 1 + aSum;

  // ── B 区（同一 gemId 取最强，异种加算）──
  const strongestByGem = new Map<string, number>();
  for (const e of b.entries) {
    const value = e.basePct * e.qualityMult * e.repeatMult;
    if (!Number.isFinite(value)) continue;
    const prev = strongestByGem.get(e.gemId);
    if (prev === undefined || value > prev) strongestByGem.set(e.gemId, value);
  }
  let bSum = 0;
  for (const v of strongestByGem.values()) bSum += v;
  const B = 1 + bSum;

  // ── C 区（① 单类上限 → ② 总量上限）──
  // damage 类：既有"单类 +100%"上限，又计入 C 区总和，所以要单独算一次原始值与夹取后值。
  const damageRawPct = clampFinite(sumByCategory(c, 'damage'), 0, Number.POSITIVE_INFINITY);
  const damageClampedPct = Math.min(damageRawPct, caps.inRunDamagePct);

  // 总和 = 已夹取的 damage + 其他被裁定计入 C 区的类别（当前为空，见 C_ZONE_DERIVED_CATEGORIES）。
  // 用循环而不是写死 damageClampedPct，是为了让"往表里加一个类别"就能生效，不需要改这里。
  let cZonePct = 0;
  for (const category of C_ZONE_DERIVED_CATEGORIES) {
    if (category === 'damage') cZonePct += damageClampedPct;
  }
  const cAppliedPct = Math.min(cZonePct, caps.inRunTotalPct);
  const C = 1 + cAppliedPct;

  const cZone: CZoneBreakdown = {
    damageRawPct,
    damageClampedPct,
    damageOverflowPct: damageRawPct - damageClampedPct,
    cZoneRawPct: cZonePct + (damageRawPct - damageClampedPct), // 还原"未经单类夹取"的总量，便于诊断
    cZonePct,
    totalOverflowPct: cZonePct - cAppliedPct,
    appliedPct: cAppliedPct,
  };

  // ── 派生：攻击间隔（−40% 上限）──
  const intervalRed = clampFinite(sumByCategory(c, 'interval'), 0, caps.intervalReductionPct);
  const intervalMul = 1 - intervalRed;

  // ── 派生：移速（+40% 上限）──
  const moveSpeedPct = clampFinite(sumByCategory(c, 'moveSpeed'), 0, caps.moveSpeedPct);
  const moveSpeedMul = 1 + moveSpeedPct;

  // ── 派生：受伤减免（−40% 上限）──
  const takenRed = clampFinite(sumByCategory(c, 'damageTaken'), 0, caps.damageTakenRedPct);
  const damageTakenMul = 1 - takenRed;

  // ── 派生：触发概率（绝对加成，上限 50%）──
  const procChanceBonus = clampFinite(sumByCategory(c, 'procChance'), 0, caps.procChanceAbs);

  // ── 派生：破甲（只对精英/Boss，上限 50%）──
  const armorBreakBonus = clampFinite(sumByCategory(c, 'armorBreak'), 0, caps.armorBreakPct);

  // ── 派生：剑扇形角（base + Σ，最终 cap 240°）──
  const arcAdd = clampFinite(sumByCategory(c, 'arcAngle'), 0, Number.POSITIVE_INFINITY);
  const arcAngleDeg = Math.min(playerConfig.sword.arcAngleDeg + arcAdd, caps.arcAngleDegCap);

  // ── 派生：Dash CD 乘数（下限保护：实际 CD 不得低于 dashCdFloorSec）──
  const dashRed = clampFinite(sumByCategory(c, 'dashCd'), 0, 1);
  const baseDashCd = playerConfig.dash.cooldownSec;
  // 允许的最大缩短比例 = 1 − floor / base（floor=0.9, base=1.5 → 最多缩 40%）
  const maxDashRed = Math.max(0, 1 - caps.dashCdFloorSec / baseDashCd);
  const effectiveDashRed = Math.min(dashRed, maxDashRed);
  const dashCdMul = 1 - effectiveDashRed;

  // ── 派生：经验获取 ──
  const xpGainMul = 1 + clampFinite(sumByCategory(c, 'xpGain'), 0, Number.POSITIVE_INFINITY);

  // ── 派生：吸血（#7 剑命中按最大生命比例）──
  // 只统计吸血剑气卡：'lifesteal' 类别下若混入别的卡（如穿透目标数）会把点数当比例算，
  // 因此这里按 buffId 白名单过滤，而不是按类别求和。
  let lifestealPctMaxHp = 0;
  for (const entry of c) {
    if (entry.buffId === VAMPIRIC_BLADE_BUFF_ID && Number.isFinite(entry.pct)) lifestealPctMaxHp += entry.pct;
  }
  lifestealPctMaxHp = clampFinite(lifestealPctMaxHp, 0, 1);

  // ── 派生：分裂弹弹道数 ──
  // 约定：projectileCount 类 buff 的 pct 字段存放"弹道总数"（由 upgrade.cardToBuffEntry 写入），
  // 取最大而非求和——重复拿同一张卡是叠加 tier 而不是叠加条数。
  let projectileCount = 1;
  for (const entry of c) {
    if (entry.buffId === SPLIT_SHOT_BUFF_ID && Number.isFinite(entry.pct)) {
      projectileCount = Math.max(projectileCount, Math.floor(entry.pct));
    }
  }
  projectileCount = Math.min(projectileCount, caps.maxProjectileCount);

  // ── 派生：击杀回复固定生命（#14 汲取）──
  let killHealHp = 0;
  for (const entry of c) {
    if (entry.buffId === KILL_HEAL_BUFF_ID && Number.isFinite(entry.pct)) killHealHp += entry.pct;
  }

  return {
    A,
    B,
    C,
    cZone,
    intervalMul,
    moveSpeedMul,
    damageTakenMul,
    procChanceBonus,
    armorBreakBonus,
    arcAngleDeg,
    dashCdMul,
    xpGainMul,
    lifestealPctMaxHp,
    projectileCount,
    killHealHp,
  };
}

/**
 * 分裂弹 buff 的固定 buffId（upgradePoolConfig 的卡片键）。
 * 单独导出是为了让 rebuildDamageLayers 与 upgrade 模块共用同一字符串，避免拼写漂移。
 */
export const SPLIT_SHOT_BUFF_ID = 'splitShot';

/** 吸血剑气卡 buffId（#7）：lifestealPctMaxHp 只统计它。 */
export const VAMPIRIC_BLADE_BUFF_ID = 'vampiricBlade';

/** 汲取卡 buffId（#14）：击杀回复固定生命值，pct 语义是「点生命」。 */
export const KILL_HEAL_BUFF_ID = 'leech';

/**
 * 单发面板伤害 = 武器基础 × A × B × C，再按弹道数摊薄（分裂弹 N3 定案：单弹 ×0.6 累乘）。
 *
 * 摊薄公式：单弹伤害 = 面板 × 0.6^(每多一发)，与升级文档 #1「单弹伤害 ×0.6 累乘」一致。
 *
 * @param weaponBaseDamage 武器基础伤害（playerConfig.staff.baseDamage 等）
 * @param layers           已重算的快照
 * @returns 单发实际伤害
 */
export function computeShotDamage(weaponBaseDamage: number, layers: DamageLayers): number {
  const extraShots = Math.max(0, layers.projectileCount - 1);
  const perShotMul = Math.pow(damageConfig.splitShot.multPerExtraShot, extraShots);
  return weaponBaseDamage * layers.A * layers.B * layers.C * perShotMul;
}

/**
 * 基础武器伤害查表（避免业务侧写 switch）。
 * @param weaponId 武器 ID
 */
export function baseWeaponDamage(weaponId: WeaponId): number {
  return weaponId === 'staff' ? playerConfig.staff.baseDamage : playerConfig.sword.baseDamage;
}

/** 基础武器间隔查表（秒）。 */
export function baseWeaponIntervalSec(weaponId: WeaponId): number {
  return weaponId === 'staff' ? playerConfig.staff.intervalSec : playerConfig.sword.intervalSec;
}

// ─────────────────────────────────────────────────────────────
// 元素触发
// ─────────────────────────────────────────────────────────────

/**
 * 四种元素 on-hit 效果。
 *
 * 数值=规划书 §2.1 定案（Q3 采信：总纲 §5.3 旧值作废）。
 * 用 `typeof config` 引用具体数值，保证代码里出现的每个数字都能追到配置行。
 */
export type ElementEffect =
  | {
      /** 燃烧：命中伤害 ×8%/s，持续 3s，命中刷新并 +1 层 */
      readonly kind: 'burn';
      readonly dpsPctOfHit: typeof gemConfig.gems.fire.effect.dpsPctOfHit;
      readonly durationSec: typeof gemConfig.gems.fire.effect.durationSec;
    }
  | {
      /** 减速：不叠加，只刷新时长 */
      readonly kind: 'slow';
      readonly slowPct: typeof gemConfig.gems.ice.effect.slowPct;
      readonly durationSec: typeof gemConfig.gems.ice.effect.durationSec;
    }
  | {
      /** 连锁：每跳 40% 命中伤害，2 跳，半径 3m，每目标每次限 1 跳 */
      readonly kind: 'chain';
      readonly jumpDmgPct: typeof gemConfig.gems.lightning.effect.jumpDmgPct;
      readonly jumps: typeof gemConfig.gems.lightning.effect.jumps;
      readonly radiusM: typeof gemConfig.gems.lightning.effect.radiusM;
    }
  | {
      /** 吸血：回复 5% 命中伤害；每秒回复 ≤5% 最大生命；吸血量不受品质/重复放大 */
      readonly kind: 'lifesteal';
      readonly healPctOfHit: typeof gemConfig.gems.shadow.effect.healPctOfHit;
      readonly perSecCapPctMaxHp: typeof gemConfig.gems.shadow.effect.perSecCapPctMaxHp;
    };

/** 元素触发定义：基础概率 + 效果。 */
export interface ElementProcDef {
  readonly element: ElementId;
  /** 基础触发概率（火 15% / 冰 20% / 雷 12% / 暗 8%） */
  readonly baseChancePct: number;
  readonly effect: ElementEffect;
}

/**
 * 按元素查触发定义（从 gemConfig 组装，保证单一来源）。
 * 每次调用返回新对象是为了避免调用方改写共享配置；若在热路径请自行缓存。
 */
export function elementProcDef(element: ElementId): ElementProcDef {
  switch (element) {
    case 'fire':
      return { element: 'fire', baseChancePct: gemConfig.gems.fire.baseChancePct, effect: gemConfig.gems.fire.effect };
    case 'ice':
      return { element: 'ice', baseChancePct: gemConfig.gems.ice.baseChancePct, effect: gemConfig.gems.ice.effect };
    case 'lightning':
      return {
        element: 'lightning',
        baseChancePct: gemConfig.gems.lightning.baseChancePct,
        effect: gemConfig.gems.lightning.effect,
      };
    case 'shadow':
      return { element: 'shadow', baseChancePct: gemConfig.gems.shadow.baseChancePct, effect: gemConfig.gems.shadow.effect };
  }
}

/**
 * 计算某元素的最终触发概率（Q4 采信 = 方案 B：品质/重复提升概率，上限 50%）。
 *
 * 公式：
 *   chance = baseChancePct
 *          + qualityIndex × procChanceBonusPctPerQualityStep
 *          + (repeatCount − 1) × procChanceBonusPctPerRepeat
 *          + layers.procChanceBonus（升级卡 #4 元素共鸣）
 *   最终夹到 [0, 0.5]
 *
 * @param element     元素
 * @param quality     该元素宝石的品质（决定品质步进）
 * @param repeatCount 同种宝石颗数（1–3）
 * @param procChanceBonus 来自快照的绝对加成（升级卡 #4）
 */
export function elementProcChance(
  element: ElementId,
  quality: (typeof QUALITY_ORDER)[number],
  repeatCount: number,
  procChanceBonus: number,
): number {
  const base = elementProcDef(element).baseChancePct;
  const qStep = QUALITY_ORDER.indexOf(quality);
  const repeatExtra = Math.max(0, Math.min(3, Math.floor(repeatCount)) - 1);
  const raw =
    base +
    qStep * gemConfig.procChanceBonusPctPerQualityStep +
    repeatExtra * gemConfig.procChanceBonusPctPerRepeat +
    clampFinite(procChanceBonus, 0, damageConfig.caps.procChanceAbs);
  return clampFinite(raw, 0, damageConfig.caps.procChanceAbs);
}

/** 品质由低到高的顺序（用于把品质换算成步进数）。与 gemConfig.qualityMult 的键顺序一致。 */
export const QUALITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

// ─────────────────────────────────────────────────────────────
// 控制上限
// ─────────────────────────────────────────────────────────────

/** 控制档位：普通 / 精英 / Boss（决定控制上限查表行）。 */
export type ControlTier = 'normal' | 'elite' | 'boss';

/**
 * 控制上限表（对 Boss 衰减）。数值来源：gemConfig.controlCaps（规划书 §2.1 定案）。
 *
 * 落地处理说明（与提案差异）：提案写法是 `slowMaxPct: Record<ControlTier, number>` 后面跟
 * 注释写死数值，这里保持 Record 形状（因为表本身就是按档位查的），数值类型用 `typeof config`。
 */
export interface ControlCaps {
  readonly slowMaxPct: Record<ControlTier, number>;
  readonly burnMaxStacks: Record<ControlTier, number>;
  readonly chainMaxJumps: Record<ControlTier, number>;
  readonly poisonMaxStacks: Record<ControlTier, number>;
}

/** 敌人运行时状态槽：固定字段、无嵌套数组，配合对象池复用同一实例。 */
export interface StatusSlots {
  burnStacks: number;
  burnTimerSec: number;
  slowPct: number;
  slowTimerSec: number;
  poisonStacks: number;
  poisonTimerSec: number;
  /** 连锁「每目标每次限 1 跳」标记，每次连锁事件重置 */
  chainJumpDone: boolean;
}

/** 空状态槽工厂（对象池在 spawn 时重置用；返回新对象，池化由调用方复制）。 */
export function createEmptyStatusSlots(): StatusSlots {
  return {
    burnStacks: 0,
    burnTimerSec: 0,
    slowPct: 0,
    slowTimerSec: 0,
    poisonStacks: 0,
    poisonTimerSec: 0,
    chainJumpDone: false,
  };
}

/** 某档位实际生效的控制上限（扁平标量，热路径无嵌套分配）。 */
export interface EffectiveControlCaps {
  readonly slowMaxPct: number;
  readonly burnMaxStacks: number;
  readonly chainMaxJumps: number;
  readonly poisonMaxStacks: number;
}

/**
 * 某档位目标**实际生效**的控制上限（对 Boss 衰减，规划书 §2.1）。
 *
 * 返回的是已经按档位选好的四个标量，而不是整张 Record——
 * 因为调用方（状态效果施加处）手上只有一个目标，查四行表毫无意义，
 * 且扁平结构便于放进热路径不产生嵌套对象分配。
 *
 * @param tier 目标档位
 */
export function effectiveControlCaps(tier: ControlTier): EffectiveControlCaps {
  const { controlCaps } = gemConfig;
  return {
    slowMaxPct: controlCaps.slowMaxPct[tier],
    burnMaxStacks: controlCaps.burnMaxStacks[tier],
    chainMaxJumps: controlCaps.chainMaxJumps[tier],
    poisonMaxStacks: controlCaps.poisonMaxStacks[tier],
  };
}

/**
 * 整张控制上限表（按档位查，供 UI/工具 显示"普通/精英/Boss 分别是多少"）。
 * 返回浅拷贝，防止调用方改写共享配置。
 */
export function controlCapsTable(): ControlCaps {
  const { controlCaps } = gemConfig;
  return {
    slowMaxPct: { ...controlCaps.slowMaxPct },
    burnMaxStacks: { ...controlCaps.burnMaxStacks },
    chainMaxJumps: { ...controlCaps.chainMaxJumps },
    poisonMaxStacks: { ...controlCaps.poisonMaxStacks },
  };
}

// ─────────────────────────────────────────────────────────────
// 结算入口
// ─────────────────────────────────────────────────────────────

/** 伤害来源分类（用于统计、音效、免伤判定）。 */
export type DamageSource = 'staff' | 'sword' | 'burnDot' | 'poisonDot' | 'chainLightning' | 'boss' | 'environment';

/** 一次伤害请求。 */
export interface DamageHitRequest {
  readonly source: DamageSource;
  /** 已乘 A/B/C（及弹道摊薄）后的单发面板值，由调用方传入快照乘积结果 */
  readonly baseDamage: number;
  readonly targetId: EntityId;
  readonly hitPos: Vec3;
  /**
   * 目标当前生命。TASK-01 不实现真实血条系统（那是 NEW-01/NEW-02 的范围），
   * 结算器用这个值做「扣血 / 击杀」判定，不维护自己的生命表。
   */
  readonly targetHp: number;
  /** 目标档位（决定破甲与控制上限查表）；缺省按普通怪 */
  readonly targetTier?: ControlTier;
  /** 破甲加成（0–0.5），只对 elite / boss 生效（来自 DamageLayers.armorBreakBonus） */
  readonly armorBreakBonus?: number;
}

/** 一次伤害结算结果。 */
export interface DamageResult {
  readonly targetId: EntityId;
  /** 实际扣减的生命（已夹取到目标剩余生命，不会返回比剩余生命更大的值） */
  readonly dealt: number;
  /** 是否致死 */
  readonly killed: boolean;
}

/**
 * 结算一次伤害：按目标档位查破甲，扣血并返回 dealt / killed。
 *
 * 说明：这是**契约层基础设施**，不含游戏规则分支——它不决定"谁该被打"，
 * 只做「面板值 → 档位修正 → 夹取到剩余生命」这一条纯计算链。
 * 真实血条扣除、受击无敌帧、护盾吸收由 NEW-01/NEW-02 在调用前后处理。
 *
 * @param req 伤害请求
 * @returns 结算结果（dealt 已夹取，killed = dealt ≥ 目标当前生命）
 */
export function resolveDamageHit(req: DamageHitRequest): DamageResult {
  const tier: ControlTier = req.targetTier ?? 'normal';
  const raw = Number.isFinite(req.baseDamage) ? Math.max(0, req.baseDamage) : 0;

  // 破甲只对精英与 Boss 生效（升级池 #9「对精英/Boss 伤害」）
  const armorBreakApplicable = tier === 'elite' || tier === 'boss';
  const armorBonus = armorBreakApplicable ? clampFinite(req.armorBreakBonus ?? 0, 0, damageConfig.caps.armorBreakPct) : 0;
  const outgoing = raw * (1 + armorBonus);

  const targetHp = Number.isFinite(req.targetHp) ? Math.max(0, req.targetHp) : 0;
  const dealt = Math.min(outgoing, targetHp);

  return { targetId: req.targetId, dealt, killed: targetHp > 0 && dealt >= targetHp };
}

// ─────────────────────────────────────────────────────────────
// 敌人档位查询（供 UI / 结算器共用，避免两处 switch）
// ─────────────────────────────────────────────────────────────

/** 敌人 ID → 控制档位。 */
export function enemyTierOf(enemyId: EnemyId): ControlTier {
  if (enemyId === 'riftWarden') return 'boss';
  if (enemyId === 'riftRavager' || enemyId === 'riftCaller') return 'elite';
  return 'normal';
}

/**
 * 精英基底模板 ID（Q2 采信：EN-N01 猎犬）。
 *
 * 返回类型是 {@link NormalEnemyId} 而不是 string（D-07）：
 * 注释里写着"限定为普通怪 ID"，类型就必须真的限定住——否则下游 `eliteStats`
 * 一旦换基底时误填精英/Boss ID，`normalEnemyDefinition` 会在**运行时**抛错，
 * 而现在这种误填在**编译期**就会被拦下。
 *
 * 注意这里**不需要**做类型断言：`enemyConfig.eliteBaseTemplate.baseEnemyId` 在 config 里
 * 是字面量 `'riftHound'`，`as const` 之后它天然属于 NormalEnemyId 的子集，赋给收窄的
 * 返回类型是合法赋值。这也是一个护栏：若有人把基底改成 `'riftWarden'`，
 * 这一行会直接编译失败，而不是等到线上抛错。
 */
export function eliteBaseEnemyId(): NormalEnemyId {
  return enemyConfig.eliteBaseTemplate.baseEnemyId;
}
