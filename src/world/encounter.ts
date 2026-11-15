/**
 * TASK-05 ｜ EnemyWorld 顶层装配（场景层唯一入口）
 *
 * 把时钟 / 事件总线 / Rng / 场地 / 敌人管理器 / SpawnDirector / 事件调度器串成一条帧链：
 *   clock.advance → director.tick（波次/精英/Boss 期） → manager.tick（行为/投射物/死亡）
 *   → scheduler.tick（世界事件）
 *
 * 场景层（TASK-02/06）只需 `new EnemyWorld({ seed })` + 每帧 `tick(dt)`，
 * 所有对玩家/经济/UI 的副作用经端口注入替换；默认端口是无头测试夹具（纯逻辑可跑）。
 */
import { PLAYER_BASE_MAX_HP } from '../config/common.ts';
import { RunClock } from '../domain/clock.ts';
import type { RunClockApi } from '../domain/clock.ts';
import { createEventBus, createMulberry32 } from '../domain/events.ts';
import type { EventBusApi } from '../domain/events.ts';
import type { EntityId, Rng } from '../domain/types.ts';
import { Arena } from './arena.ts';
import { EnemyManager } from '../enemy/manager.ts';
import type { EnemyTickContext, EventWorldContext, GoldSpendPort, InRunBuffPort, PlayerDamagePort, PlayerSnapshot } from '../enemy/types.ts';
import { SpawnDirector } from '../spawn/spawnDirector.ts';
import { WorldEventScheduler } from '../worldevents/scheduler.ts';

export interface DamageLogEntry {
  readonly amount: number;
  readonly kind: 'melee' | 'projectile' | 'leap' | 'zone' | 'dot';
  readonly sourceDefId: string | null;
}

export interface BuffLogEntry {
  readonly buffId: string;
  readonly category: 'damage' | 'moveSpeed' | 'interval' | 'damageTaken';
  readonly pct: number;
  readonly durationSec: number;
}

/** 测试夹具默认玩家数值（PROVISIONAL；实际由 TASK-02 场景层灌入） */
const FIXTURE_DEFAULTS = {
  radiusM: 0.45,
  gold: 200,
} as const;

export interface EnemyWorldOptions {
  readonly seed: number;
  readonly bus?: EventBusApi;
  readonly clock?: RunClockApi;
  readonly player?: PlayerSnapshot;
  readonly damagePlayer?: PlayerDamagePort;
  readonly applyBuff?: InRunBuffPort;
  readonly spendGold?: GoldSpendPort;
  /** 关闭事件调度（隔离测试波次/精英时使用） */
  readonly events?: boolean;
}

export class EnemyWorld {
  readonly bus: EventBusApi;
  readonly clock: RunClockApi;
  readonly rng: Rng;
  readonly arena: Arena;
  readonly manager: EnemyManager;
  readonly director: SpawnDirector;
  readonly scheduler: WorldEventScheduler;
  readonly player: PlayerSnapshot;

  readonly damageLog: DamageLogEntry[] = [];
  readonly buffLog: BuffLogEntry[] = [];
  readonly goldSpendLog: number[] = [];

  private readonly ctx: EventWorldContext;
  private readonly eventsEnabled: boolean;
  private readonly damagePlayer: PlayerDamagePort;
  private readonly applyBuff: InRunBuffPort;
  private readonly spendGold: GoldSpendPort;

  constructor(opts: EnemyWorldOptions) {
    this.bus = opts.bus ?? createEventBus();
    this.clock = opts.clock ?? new RunClock();
    this.rng = createMulberry32(opts.seed);
    this.arena = new Arena();
    this.eventsEnabled = opts.events ?? true;
    this.player = opts.player ?? {
      position: { x: 0, y: 0, z: 0 },
      radiusM: FIXTURE_DEFAULTS.radiusM,
      hp: PLAYER_BASE_MAX_HP,
      maxHp: PLAYER_BASE_MAX_HP,
      gold: FIXTURE_DEFAULTS.gold,
    };

    this.damagePlayer = opts.damagePlayer ?? ((amount, attacker, kind) => {
      this.damageLog.push({ amount, kind, sourceDefId: attacker?.defId ?? null });
      this.player.hp = Math.max(0, this.player.hp - amount);
    });
    this.applyBuff = opts.applyBuff ?? ((buff) => {
      this.buffLog.push({
        buffId: buff.buffId,
        category: buff.category,
        pct: buff.pct,
        durationSec: buff.durationSec,
      });
    });
    this.spendGold = opts.spendGold ?? ((amount) => {
      if (this.player.gold < amount) return false;
      this.player.gold -= amount;
      this.goldSpendLog.push(amount);
      return true;
    });

    this.manager = new EnemyManager({
      bus: this.bus,
      clock: this.clock,
      rng: this.rng,
      arena: this.arena,
    });
    this.director = new SpawnDirector({
      manager: this.manager,
      arena: this.arena,
      clock: this.clock,
      rng: this.rng,
      bus: this.bus,
    });
    this.scheduler = new WorldEventScheduler(this.bus, this.rng);

    const self = this;
    const base: EnemyTickContext = {
      clock: this.clock,
      rng: this.rng,
      player: this.player,
      damagePlayer: this.damagePlayer,
      aliveEnemies: this.manager.aliveEnemies, // 同一数组原地刷新，零分配
      projectiles: this.manager.fireProjectile,
      requestSpawn: this.manager.requestSpawn,
      arena: this.arena,
    };
    this.ctx = {
      ...base,
      applyBuff: this.applyBuff,
      spendGold: this.spendGold,
      requestEliteInvasion: (defId, affixCount) => this.director.forceElite(defId, affixCount),
      despawnEnemy: (entityId: EntityId) => this.manager.despawn(entityId),
      get activeEventId() {
        return self.eventsEnabled ? self.scheduler.activeEventId : null;
      },
    };
  }

  /** 事件侧上下文（手动驱动单个事件时用） */
  eventCtx(): EventWorldContext {
    return this.ctx;
  }

  /** 每帧推进（dt 秒）。冻结期由 clock 自行停止 elapsedSec，本方法仍可安全调用 */
  tick(dt: number): void {
    if (!(dt > 0)) return;
    this.clock.advance(dt);
    this.director.tick(dt, this.player.position);
    this.manager.tick(this.ctx, dt);
    if (this.eventsEnabled) this.scheduler.tick(this.ctx, dt);
  }

  /** 快进（测试/模拟用；按固定步长保证同 seed 可复现） */
  fastForward(seconds: number, dt = 0.25): void {
    let remaining = seconds;
    while (remaining > 1e-9) {
      const step = Math.min(dt, remaining);
      this.tick(step);
      remaining -= step;
    }
  }
}
