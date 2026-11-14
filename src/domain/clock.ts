/**
 * 单局时钟契约与实现。
 *
 * 需求来源：设计-局内升级系统.md §1「升级选卡时时间冻结（含 Boss 预警计时）——写进 TASK-01 时钟契约」。
 * 时间轴数值来源：总纲-项目规划书V1.md §2.3 + D1（Boss 预警 510s / 登场 600s，Q1 采信为权威值）。
 *
 * 设计要点：
 *   - 时钟是**唯一**的局内时间来源；所有"到达某秒做某事"的系统都读同一个 elapsedSec，
 *     不允许各自用 performance.now() 计时，否则冻结语义会在各系统间不一致。
 *   - 冻结（freeze）不推进 elapsedSec，因此「Boss 预警计时」自动被冻结——
 *     这正是升级文档要求的行为，无需额外开关。
 *   - 阈值事件用**边沿触发标记**（bossWarningStarted / bossSpawned）而不是每帧比较：
 *     比较式写法在跨帧跳过阈值时可能重复触发，标记式只会翻转一次。
 */
import { RUN_TIMELINE_CONST } from '../config/common.ts';
import type { RunPhase } from './runState.ts';

/**
 * 时钟对外可见形状。
 * 单独抽成 interface 是为了让 NEW-01/NEW-03 等模块**只依赖形状**而不依赖 class
 * （可单测性：测试里塞一个假时钟即可，不需要真实时间）。
 */
export interface RunClockApi {
  /** 本局已进行秒数。只在 running 状态下推进（见 runState.ts 状态机）。 */
  readonly elapsedSec: number;
  /** 每帧推进；frozen=true 时直接返回，不累计。 */
  advance(dtSec: number): void;
  /** 升级选卡 / 暂停 / 切后台时调用 */
  freeze(): void;
  /** 解除冻结 */
  resume(): void;
  readonly frozen: boolean;
  /** Boss 预警（8:30 = 510s）是否已触发，供 Spawn Director 与 UI 查询 */
  readonly bossWarningStarted: boolean;
  /** Boss 登场（10:00 = 600s）是否已触发 */
  readonly bossSpawned: boolean;
  /** 本局重开时清零（含解除冻结） */
  reset(): void;
}

export interface RunClockOptions {
  /** 每帧取当前阶段，决定是否推进（默认恒为 'running'，便于单测直接喂 dt）。 */
  readonly phaseProvider?: () => RunPhase;
  /** Boss 预警秒数（默认取 config 的 510s）。 */
  readonly bossWarnSec?: number;
  /** Boss 登场秒数（默认取 config 的 600s）。 */
  readonly bossSpawnSec?: number;
}

/** 需要推进时钟的状态集合：只有 running 推进（upgradePick / paused 一律不推进）。 */
function phaseAdvancesClock(phase: RunPhase): boolean {
  return phase === 'running';
}

/**
 * 单局时钟。
 *
 * 实现说明：本类是**契约层基础设施**（时间累加 + 边沿标记），不含任何游戏规则分支——
 * 它不知道 Boss 是谁，只负责在跨过阈值时把标记翻成 true。
 */
export class RunClock implements RunClockApi {
  private elapsed = 0;
  private isFrozen = false;
  private warned = false;
  private spawned = false;
  private readonly warnSec: number;
  private readonly spawnSec: number;
  private readonly phaseProvider: () => RunPhase;

  constructor(opts: RunClockOptions = {}) {
    this.warnSec = opts.bossWarnSec ?? RUN_TIMELINE_CONST.bossWarnSec;
    this.spawnSec = opts.bossSpawnSec ?? RUN_TIMELINE_CONST.bossSpawnSec;
    this.phaseProvider = opts.phaseProvider ?? (() => 'running');
  }

  /** 本局已进行秒数（只在 running 状态下推进）。 */
  get elapsedSec(): number {
    return this.elapsed;
  }

  get frozen(): boolean {
    return this.isFrozen;
  }

  get bossWarningStarted(): boolean {
    return this.warned;
  }

  get bossSpawned(): boolean {
    return this.spawned;
  }

  /**
   * 每帧推进。
   * @param dtSec 帧间隔秒数；非有限值或 ≤0 一律忽略。
   *              巨大毛刺（切后台回来）由调用方 clamp——时钟不知道性能预算（D-210 OPEN），
   *              不替调用方猜上限。
   */
  advance(dtSec: number): void {
    if (this.isFrozen) return;
    if (!Number.isFinite(dtSec) || dtSec <= 0) return;
    if (!phaseAdvancesClock(this.phaseProvider())) return;

    this.elapsed += dtSec;

    // 边沿标记：跨过阈值即翻牌，之后不再回退（本局内单向）
    if (!this.warned && this.elapsed >= this.warnSec) this.warned = true;
    if (!this.spawned && this.elapsed >= this.spawnSec) this.spawned = true;
  }

  /** 冻结：升级选卡 / 暂停 / 切后台时调用。幂等。 */
  freeze(): void {
    this.isFrozen = true;
  }

  /** 解冻：恢复推进。幂等。 */
  resume(): void {
    this.isFrozen = false;
  }

  /** 本局重开：清零时间与两个 Boss 标记，并解除冻结。 */
  reset(): void {
    this.elapsed = 0;
    this.isFrozen = false;
    this.warned = false;
    this.spawned = false;
  }
}
