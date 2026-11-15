/**
 * TASK-05 ｜ SpawnDirector（时间驱动怪物潮 + 精英调度 + Boss 期硬规则）
 *
 * 全部时间/数值来自冻结契约（domain.wave 组装 config.waveTimelineConfig）：
 * - 六阶段波次：spawnIntervalSec / waveSize / enemyWeights / maxOnScreen / hpScale / damageScale
 * - 精英窗口：判定**只调** domain.eliteAllowedAt（首刷 360 / 每 90s / 510 停刷 / 600 全禁）
 * - 同屏精英 ≤2、领主 ≤1：config.eliteTierRules；满员按 deferRetrySec × maxRetries 推迟
 * - Boss 期：domain.bossPeriodRule（不清场 / 普通怪 ≤4 / 每 45s 补 2 只猎犬 / 精英全禁）
 * - 安全生成：arena.pickSpawnPoint（玩家 12m 内不得无预警刷怪）
 *
 * 不实现区域解锁/地图轮换；随机只走注入 Rng。
 */
import { enemyConfig } from '../config/enemyConfig.ts';
import { bossPeriodRule, eliteAllowedAt, phaseAtSec, wavePhases } from '../domain/wave.ts';
import type { WavePhaseDef } from '../domain/wave.ts';
import type { EventBusApi } from '../domain/events.ts';
import type { RunClockApi } from '../domain/clock.ts';
import type { EliteEnemyId, EnemyId, NormalEnemyId } from '../domain/ids.ts';
import type { Rng, Vec3 } from '../domain/types.ts';
import { BEHAVIOR_EXTRA } from '../enemy/behaviorParams.ts';
import type { EnemyManager } from '../enemy/manager.ts';
import type { Enemy } from '../enemy/enemy.ts';
import type { Arena } from '../world/arena.ts';
import { createElite, rollAffixes } from '../elites/eliteFactory.ts';
import type { EliteEnemy } from '../elites/elite.ts';

export interface SpawnDirectorDeps {
  readonly manager: EnemyManager;
  readonly arena: Arena;
  readonly clock: RunClockApi;
  readonly rng: Rng;
  readonly bus: EventBusApi;
}

/** 首刷时刻从 wavePhases() 派生，禁止在业务侧写 360 这个数字 */
function firstEliteSec(): number | null {
  for (const p of wavePhases()) {
    if (p.eliteRule.firstSpawnSec !== null) return p.eliteRule.firstSpawnSec;
  }
  return null;
}

export class SpawnDirector {
  private readonly manager: EnemyManager;
  private readonly arena: Arena;
  private readonly clock: RunClockApi;
  private readonly rng: Rng;
  private readonly bus: EventBusApi;

  private spawnTimer = 0;
  private bossReplenishTimer = 0;
  private nextEliteAt: number | null = firstEliteSec();
  private eliteRetries = 0;
  private eliteSpawnedCount = 0;

  constructor(deps: SpawnDirectorDeps) {
    this.manager = deps.manager;
    this.arena = deps.arena;
    this.clock = deps.clock;
    this.rng = deps.rng;
    this.bus = deps.bus;
    this.spawnTimer = phaseAtSec(this.clock.elapsedSec).spawnIntervalSec;
  }

  /** 已生成的定时精英数量（测试/UI） */
  get eliteCountSpawned(): number {
    return this.eliteSpawnedCount;
  }
  get nextEliteSec(): number | null {
    return this.nextEliteAt;
  }

  /** 每帧驱动；时钟推进由外层（EnemyWorld）负责，冻结期时钟不前进 */
  tick(dt: number, playerPos: Vec3): void {
    if (!(dt > 0)) return;
    const t = this.clock.elapsedSec;
    const phase = phaseAtSec(t);
    const bossRule = bossPeriodRule();
    this.manager.screenCap = phase.index === 6 ? bossRule.normalCap : phase.maxOnScreen;

    if (phase.index === 6) {
      this.tickBossPeriod(dt, phase, playerPos, bossRule.replenish.everySec, bossRule.replenish.count, bossRule.replenish.enemyId);
    } else {
      this.tickWaves(dt, phase, playerPos);
    }
    this.tickElites(t, phase, playerPos);
  }

  // ── 波次 ────────────────────────────────────────────────────
  private tickWaves(dt: number, phase: WavePhaseDef, playerPos: Vec3): void {
    this.spawnTimer -= dt;
    // 用 while 吸收大 dt，但只按固定间隔出波（不因切后台毛刺放大刷怪量）
    while (this.spawnTimer <= 0) {
      this.spawnTimer += phase.spawnIntervalSec;
      for (let i = 0; i < phase.waveSize; i++) {
        const defId = this.pickWeighted(phase.enemyWeights);
        if (defId) this.spawnOne(defId, phase, playerPos);
      }
    }
  }

  /** Boss 期：停刷主要波次，仅按硬规则补猎犬 */
  private tickBossPeriod(
    dt: number,
    phase: WavePhaseDef,
    playerPos: Vec3,
    everySec: number,
    count: number,
    enemyId: EnemyId,
  ): void {
    this.bossReplenishTimer -= dt;
    if (this.bossReplenishTimer > 0) return;
    this.bossReplenishTimer += everySec;
    for (let i = 0; i < count; i++) this.spawnOne(enemyId, phase, playerPos);
  }

  private pickWeighted(weights: Partial<Record<NormalEnemyId, number>>): NormalEnemyId | null {
    const entries = Object.entries(weights) as [NormalEnemyId, number][];
    const total = entries.reduce((acc, [, w]) => acc + (w > 0 ? w : 0), 0);
    if (total <= 0) return null;
    let r = this.rng.range(0, total);
    for (const [id, w] of entries) {
      r -= w;
      if (r < 0) return id;
    }
    return entries[entries.length - 1][0];
  }

  private spawnOne(defId: EnemyId, phase: WavePhaseDef, playerPos: Vec3): Enemy | null {
    const point = this.arena.pickSpawnPoint(this.rng, playerPos, this.manager.aliveEnemies);
    if (!point) return null;
    return this.manager.spawn(defId, {
      position: point,
      hpScale: phase.hpScale,
      damageScale: phase.damageScale,
    });
  }

  // ── 精英 ────────────────────────────────────────────────────
  private tickElites(t: number, phase: WavePhaseDef, playerPos: Vec3): void {
    if (this.nextEliteAt === null || t < this.nextEliteAt) return;

    // 窗口判定唯一入口（禁止业务侧自己比 360/510）
    if (!eliteAllowedAt(t)) {
      this.advanceEliteSchedule(t);
      return;
    }

    const rules = enemyConfig.eliteTierRules;
    if (this.manager.eliteCount >= rules.maxElitesOnScreen) {
      if (this.eliteRetries < phase.eliteRule.maxRetries) {
        this.eliteRetries++;
        this.nextEliteAt = t + phase.eliteRule.deferRetrySec;
        return;
      }
      // 3 次重试仍满员 → 放弃本轮
      this.eliteRetries = 0;
      this.advanceEliteSchedule(t);
      return;
    }

    this.spawnElite(phase, playerPos, undefined, 1);
    this.eliteRetries = 0;
    this.advanceEliteSchedule(t);
  }

  /** 当前阶段允许后，按 repeatEverySec 推到下一个候选点；停刷阶段置 null */
  private advanceEliteSchedule(t: number): void {
    const rule = phaseAtSec(t).eliteRule;
    if (rule.repeatEverySec === null) {
      this.nextEliteAt = null;
      return;
    }
    this.nextEliteAt = t + rule.repeatEverySec;
  }

  /**
   * 事件「精英入侵」的强制生成入口：
   * 窗口外（t < 360 / t ≥ 510）或同屏已满时返回 null，由事件侧降级为狼群，
   * 从而保证 360s 前零精英（D-01 缺陷防线）。
   */
  forceElite(defId: EliteEnemyId, affixCount: number): Enemy | null {
    const t = this.clock.elapsedSec;
    const rules = enemyConfig.eliteTierRules;
    if (!eliteAllowedAt(t) || this.manager.eliteCount >= rules.maxElitesOnScreen) return null;
    return this.spawnElite(phaseAtSec(t), this.arena.playerSpawn, defId, affixCount);
  }

  private spawnElite(
    phase: WavePhaseDef,
    playerPos: Vec3,
    defId: EliteEnemyId | undefined,
    affixCount: number,
  ): EliteEnemy | null {
    const rules = enemyConfig.eliteTierRules;
    const point = this.arena.pickSpawnPoint(this.rng, playerPos, this.manager.aliveEnemies);
    if (!point) return null;

    // 首只必普通精英；之后无领主在场时按 PROVISIONAL 概率出领主
    let rank: 'normal' | 'lord' = 'normal';
    if (this.eliteSpawnedCount > 0 && this.manager.lordCount < rules.maxEliteLordsOnScreen) {
      if (this.rng.next() < BEHAVIOR_EXTRA.lordSpawnChance) rank = 'lord';
    }
    const affixes = affixCount > 1
      ? rollAffixes(this.rng, Math.min(affixCount, rules.maxAffixCount))
      : undefined;

    const elite = createElite(this.rng, {
      defId,
      rank,
      affixes,
      entityId: this.manager.nextId(),
      position: { x: point.x, y: 0, z: point.z },
      // 规划书 hpScale/damageScale 语义为「普通怪缩放」；精英数值已由 eliteStats 派生
      hpScale: 1,
      damageScale: 1,
    });
    void phase;
    this.manager.addElite(elite);
    this.bus.publish('elite.spawned', { defId: elite.defId, affixes: elite.affixes });
    this.eliteSpawnedCount++;
    return elite;
  }
}
