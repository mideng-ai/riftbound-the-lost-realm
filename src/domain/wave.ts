/**
 * 波次阶段 / 精英节奏 / 事件时间轴 / Boss 期硬规则 / 胜利条件。
 *
 * 数值唯一来源：config/waveTimelineConfig.ts（本文件不写死任何数字）。
 * 文档来源：总纲-项目规划书V1.md §2.3 / §2.5、设计-设计总纲.md §8.3–§8.5。
 * 开放问题采信：Q1（510/600 为权威）、Q10（胜利 = 击杀 Boss，无第三结局）。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import { RUN_TIMELINE_CONST } from '../config/common.ts';
import { waveTimelineConfig } from '../config/waveTimelineConfig.ts';
import type { EnemyId, NormalEnemyId, WorldEventId } from './ids.ts';

// ─────────────────────────────────────────────────────────────
// 时间轴常量
// ─────────────────────────────────────────────────────────────

/**
 * 单局时间轴常量（D1 权威值，Q1 采信）。
 *
 * 用法说明：这里 re-export 而不是在 domain 里再写一份数字，
 * 保证「业务代码 import 谁」都不会拿到两份不同的 510/600。
 *
 * - bossWarnSec = 510（8:30）
 * - bossSpawnSec = 600（10:00）
 * - bossWarnCheckpointsSec = [510, 540, 570]（音效表 §3 预警三点）
 */
export const RUN_TIMELINE = RUN_TIMELINE_CONST;

/**
 * 时间轴常量的类型（把 `as const` 的只读字面量类型具名化，
 * 避免下游出现 `typeof RUN_TIMELINE_CONST` 这种冗长写法）。
 */
export type RunTimelineConst = typeof RUN_TIMELINE_CONST;

// ─────────────────────────────────────────────────────────────
// 精英规则
// ─────────────────────────────────────────────────────────────

/**
 * 精英生成规则（逐阶段配置）。
 *
 * 语义：
 *   - firstSpawnSec：本阶段首次可生成精英的时刻（绝对秒）；null = 本阶段无「首次」概念
 *   - repeatEverySec：之后的重复间隔；null = 本阶段不按间隔刷
 *   - bannedAfterSec：该秒数之后完全禁止精英；null = 不禁
 *   - deferRetrySec / maxRetries：同屏精英已满时推迟重试（规划书 §2.5：30s × 3 次）
 */
export interface EliteRule {
  readonly firstSpawnSec: number | null;
  readonly repeatEverySec: number | null;
  readonly bannedAfterSec: number | null;
  readonly deferRetrySec: number;
  readonly maxRetries: number;
}

// ─────────────────────────────────────────────────────────────
// 波次阶段
// ─────────────────────────────────────────────────────────────

/** 阶段语义标签。 */
export type WavePhaseLabel = (typeof waveTimelineConfig.phases)[number]['label'];

/**
 * 波次阶段定义。
 *
 * endSec = null 表示「持续到本局结束」（仅 Boss 阶段）。
 * enemyWeights 的键限定为普通怪 ID 子集——精英与 Boss 不许出现在刷怪权重里（TASK-05 验收）。
 */
export interface WavePhaseDef {
  /** 阶段编号 1–6 */
  readonly index: 1 | 2 | 3 | 4 | 5 | 6;
  readonly label: WavePhaseLabel;
  readonly startSec: number;
  /** null = 持续到本局结束 */
  readonly endSec: number | null;
  readonly spawnIntervalSec: number;
  readonly waveSize: number;
  /** 各阶段可用怪种与权重（非空，权重为正整数） */
  readonly enemyWeights: Partial<Record<NormalEnemyId, number>>;
  readonly maxOnScreen: number;
  readonly hpScale: number;
  readonly damageScale: number;
  readonly eliteRule: EliteRule;
}

// ─────────────────────────────────────────────────────────────
// Boss 期硬规则
// ─────────────────────────────────────────────────────────────

/**
 * Boss 期间硬规则（规划书 §2.3 定案，原文「可调整」已改硬规则）。
 * 不清场、停刷、普通怪同屏 ≤4、每 45s 补 2 只猎犬、精英全禁。
 */
export interface BossPeriodRule {
  readonly clearOnSpawn: false;
  readonly normalCap: number;
  readonly replenish: {
    readonly everySec: number;
    readonly enemyId: EnemyId;
    readonly count: number;
  };
  readonly eliteBanned: true;
}

// ─────────────────────────────────────────────────────────────
// 随机事件
// ─────────────────────────────────────────────────────────────

/** 随机事件时间轴。 */
export interface WorldEventSchedule {
  readonly firstWindowStartSec: number;
  readonly firstWindowEndSec: number;
  readonly intervalSec: number;
  readonly maxConcurrent: number;
  readonly noImmediateRepeat: boolean;
  /** Boss 预警后停刷主要事件（秒） */
  readonly stopAfterSec: number;
}

/** 事件参数联合（每个事件形状不同，按 id 判别）。 */
export type WorldEventParams =
  | { readonly kind: 'lostChest'; readonly openSec: number }
  | { readonly kind: 'elementalAltar'; readonly buffPct: number; readonly durationSec: number }
  | { readonly kind: 'monsterNest'; readonly hp: number }
  | {
      readonly kind: 'ancientAltar';
      readonly hpCostPctOfCurrent: number;
      readonly damageBuffPct: number;
      readonly goldCost: number;
      readonly attackSpeedBuffPct: number;
      readonly durationSec: number;
    }
  | { readonly kind: 'eliteInvasion'; readonly affixCount: number; readonly gemMinCount: number };

/** 事件定义。 */
export interface WorldEventDef {
  readonly id: WorldEventId;
  readonly nameKey: string;
  readonly params: WorldEventParams;
  readonly timeoutSec: number;
}

// ─────────────────────────────────────────────────────────────
// 组装：把 config 变成强类型对象
// ─────────────────────────────────────────────────────────────

/**
 * 六个波次阶段（从 config 组装，索引安全）。
 *
 * 为什么不直接 `export const WAVE_PHASES = waveTimelineConfig.phases`：
 * config 的数组元素类型是六个不同的字面量对象联合，直接导出会让下游拿到
 * 「第 N 阶段可能是任意一个阶段形状」的联合类型；这里逐个映射成统一的 WavePhaseDef，
 * 下游遍历时才有一致的字段访问体验。
 */
export function wavePhases(): readonly WavePhaseDef[] {
  return waveTimelineConfig.phases.map((p) => ({
    index: p.index,
    label: p.label,
    startSec: p.startSec,
    endSec: p.endSec,
    spawnIntervalSec: p.spawnIntervalSec,
    waveSize: p.waveSize,
    enemyWeights: p.enemyWeights,
    maxOnScreen: p.maxOnScreen,
    hpScale: p.hpScale,
    damageScale: p.damageScale,
    eliteRule: p.eliteRule,
  })) as readonly WavePhaseDef[];
}

/**
 * 按已进行秒数查当前阶段。
 *
 * 边界语义：`[startSec, endSec)` 左闭右开；endSec=null 的阶段永远兜底。
 * 超过最大时长后仍返回最后阶段（Boss 期），不会返回 undefined——
 * 让调用方不必写「阶段不存在时怎么办」的分支。
 *
 * @param elapsedSec 本局已进行秒数
 */
export function phaseAtSec(elapsedSec: number): WavePhaseDef {
  const phases = wavePhases();
  const t = Number.isFinite(elapsedSec) ? elapsedSec : 0;
  for (const p of phases) {
    if (p.endSec === null) return p; // 末段无条件兜底
    if (t >= p.startSec && t < p.endSec) return p;
  }
  return phases[phases.length - 1];
}

/**
 * Boss 期硬规则（从 config 组装）。
 *
 * 返回**浅拷贝**（含嵌套的 replenish）：与 {@link controlCapsTable} 的防御策略一致，
 * 避免调用方写 `bossPeriodRule().normalCap = 99` 改坏全局 config 单例。
 * 配置本身是 `as const`，类型层已经 readonly，但运行时仍是可写对象——
 * 类型能挡住 TS 调用者，挡不住 `JSON.parse` 回灌或 `as any` 的调用者，所以这里显式拷贝。
 */
export function bossPeriodRule(): BossPeriodRule {
  const rule = waveTimelineConfig.bossPeriodRule;
  return {
    clearOnSpawn: rule.clearOnSpawn,
    normalCap: rule.normalCap,
    replenish: {
      everySec: rule.replenish.everySec,
      enemyId: rule.replenish.enemyId,
      count: rule.replenish.count,
    },
    eliteBanned: rule.eliteBanned,
  };
}

/** 随机事件时间轴（从 config 组装）。 */
export function worldEventSchedule(): WorldEventSchedule {
  return waveTimelineConfig.eventSchedule;
}

/** 五种事件定义（从 config 组装，params 的 kind 与 id 一一对应）。 */
export function worldEventDefs(): readonly WorldEventDef[] {
  const e = waveTimelineConfig.events;
  return [
    {
      id: 'lostChest',
      nameKey: e.lostChest.nameKey,
      timeoutSec: e.lostChest.timeoutSec,
      params: { kind: 'lostChest', openSec: e.lostChest.openSec },
    },
    {
      id: 'elementalAltar',
      nameKey: e.elementalAltar.nameKey,
      timeoutSec: e.elementalAltar.timeoutSec,
      params: { kind: 'elementalAltar', buffPct: e.elementalAltar.buffPct, durationSec: e.elementalAltar.durationSec },
    },
    {
      id: 'monsterNest',
      nameKey: e.monsterNest.nameKey,
      timeoutSec: e.monsterNest.timeoutSec,
      params: { kind: 'monsterNest', hp: e.monsterNest.hp },
    },
    {
      id: 'ancientAltar',
      nameKey: e.ancientAltar.nameKey,
      timeoutSec: e.ancientAltar.timeoutSec,
      params: {
        kind: 'ancientAltar',
        hpCostPctOfCurrent: e.ancientAltar.hpCostPctOfCurrent,
        damageBuffPct: e.ancientAltar.damageBuffPct,
        goldCost: e.ancientAltar.goldCost,
        attackSpeedBuffPct: e.ancientAltar.attackSpeedBuffPct,
        durationSec: e.ancientAltar.durationSec,
      },
    },
    {
      id: 'eliteInvasion',
      nameKey: e.eliteInvasion.nameKey,
      timeoutSec: e.eliteInvasion.timeoutSec,
      params: {
        kind: 'eliteInvasion',
        affixCount: e.eliteInvasion.affixCount,
        gemMinCount: e.eliteInvasion.gemMinCount,
      },
    },
  ];
}

/**
 * 某一时刻是否还能刷「主要随机事件」。
 * Boss 预警（510s）之后停刷（总纲 §8.5 / 规划书 §2.5）。
 *
 * @param elapsedSec 本局已进行秒数
 */
export function canSpawnWorldEvent(elapsedSec: number): boolean {
  return elapsedSec < waveTimelineConfig.eventSchedule.stopAfterSec;
}

/**
 * 某一时刻是否允许生成精英（按阶段 eliteRule 判定）。
 *
 * 纯判定：只回答"这个秒数允不允许"，不关心同屏已满的重试逻辑
 * （那需要实体计数，属于 TASK-05 的 Spawn Director 职责）。
 *
 * 判定语义（三条，缺一不可）：
 *   1. **阶段无精英来源**：firstSpawnSec === null **且** repeatEverySec === null
 *      → 本阶段根本不刷精英（阶段 1/2 的「0–6 分钟不生成」、阶段 5 的「停刷」、阶段 6 的「全禁」）
 *   2. **未到首刷时刻**：firstSpawnSec !== null 且 elapsedSec < firstSpawnSec → false
 *      （阶段 3 的 6:00 首只：359s 必须为 false，这是 D-01 缺陷的根因）
 *   3. **已过停刷时刻**：bannedAfterSec !== null 且 elapsedSec >= bannedAfterSec → false
 *
 * 三条都不命中时才为 true。顺序上先判"有来源"再判时间窗，是为了让
 * `firstSpawnSec: null, repeatEverySec: null` 的阶段不会因为 `null` 比较而误判为允许。
 *
 * ⚠ 本函数**不**判定 "距上次生成是否满 repeatEverySec"——那需要上次生成时刻，
 * 属 TASK-05 Spawn Director 的有状态职责；这里只回答"该时刻的窗口开没开"。
 *
 * @param elapsedSec 本局已进行秒数
 */
export function eliteAllowedAt(elapsedSec: number): boolean {
  const rule = phaseAtSec(elapsedSec).eliteRule;

  // 1. 本阶段没有任何精英来源 → 永不生成
  if (rule.firstSpawnSec === null && rule.repeatEverySec === null) return false;

  // 2. 尚未到本阶段首刷时刻（repeatEverySec-only 的阶段不设首刷门槛，整段允许）
  if (rule.firstSpawnSec !== null && elapsedSec < rule.firstSpawnSec) return false;

  // 3. 已过停刷时刻（阶段 5 的 510s 起停刷 / 阶段 6 的全禁）
  if (rule.bannedAfterSec !== null && elapsedSec >= rule.bannedAfterSec) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────
// 胜利条件（Q10 采信）
// ─────────────────────────────────────────────────────────────

/**
 * V1.0 胜利条件：击杀 Boss。
 *
 * Q10 采信结论——删除「Boss 为可选遭遇」表述：
 *   - 唯一胜利路径 = 击杀 Boss
 *   - 死亡 / 中途退出 = 失败（总纲 §6.5）
 *   - 无撤离机制、无第三结局
 * 这段注释是给后来人看的：若在代码里看到 `hasExtraction` 相关分支，说明有人把
 * 旧搜打撤方案的残留又加回来了，应视为缺陷而不是特性。
 */
export const VICTORY_CONDITION = {
  kind: waveTimelineConfig.winCondition.kind,
  hasExtraction: waveTimelineConfig.winCondition.hasExtraction,
  hasThirdOutcome: waveTimelineConfig.winCondition.hasThirdOutcome,
} as const;
