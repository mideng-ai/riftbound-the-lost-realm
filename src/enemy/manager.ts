/**
 * TASK-05 ｜ EnemyManager（对象池 / 投射物 / 毒区 / 光环 / 死亡结算）
 *
 * 职责：
 * - 生成/回收四类普通怪 + 精英（按 defId 池化，activate 原地重置，运行期零容器分配）
 * - 每帧重算滋养体光环（6m / +20%，数值来自 domain 名册）
 * - 驱动投射物与毒区，命中玩家只经 damagePlayer 端口（TASK-02 侧结算免伤）
 * - 死亡结算：掉落、事件广播、分裂/毒区/召唤子体落地，全部受同屏上限约束
 *
 * 红线：不自写伤害公式（敌人受击走 domain.resolveDamageHit，玩家受击走端口）；
 *       不 import Babylon / DOM；随机只走注入 Rng。
 */
import type { EventBusApi, LootRoll } from '../domain/events.ts';
import type { RunClockApi } from '../domain/clock.ts';
import { isEliteEnemyId } from '../domain/enemy.ts';
import type { EliteRank } from '../elites/elite.ts';
import { EliteEnemy } from '../elites/elite.ts';
import type { EnemyId } from '../domain/ids.ts';
import type { EntityId, Rng, Vec3 } from '../domain/types.ts';
import type { Arena } from '../world/arena.ts';
import { SAFE_SPAWN } from '../world/arenaConfig.ts';
import { BEHAVIOR_EXTRA } from './behaviorParams.ts';
import type { Enemy } from './enemy.ts';
import { HoundEnemy } from './hound.ts';
import { SpitterEnemy } from './spitter.ts';
import { DasherEnemy } from './dasher.ts';
import { NourisherEnemy } from './nourisher.ts';
import { defaultDropTable } from './defaultDropTable.ts';
import type { DropVictim } from './defaultDropTable.ts';
import type { EnemyTickContext, PoisonCloud, SpawnRequestPort } from './types.ts';

export interface ProjectileState {
  owner: Enemy | null;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speedMps: number;
  radiusM: number;
  damage: number;
  remainingSec: number;
}

export type DropTablePort = (victim: DropVictim) => readonly LootRoll[];

export interface EnemyManagerDeps {
  readonly bus: EventBusApi;
  readonly clock: RunClockApi;
  readonly rng: Rng;
  readonly arena: Arena;
  readonly dropTable?: DropTablePort;
}

export interface SpawnOptions {
  readonly position: { readonly x: number; readonly z: number };
  readonly hpScale?: number;
  readonly damageScale?: number;
  readonly hpOverride?: number;
  readonly damageOverride?: number;
  /** 尸体分裂/召唤保底：允许有界超上限（+SPLIT_OVERCAP_ALLOWANCE） */
  readonly allowOvercap?: boolean;
}

export class EnemyManager {
  /** 全部在场实体（含本帧待结算的尸体） */
  readonly enemies: Enemy[] = [];
  /** 存活实体视图（同一数组原地刷新，ctx 持有同一引用，零分配） */
  readonly aliveEnemies: Enemy[] = [];
  readonly projectiles: ProjectileState[] = [];
  readonly clouds: PoisonCloud[] = [];

  /** 当前阶段同屏上限（由 SpawnDirector 每帧写入） */
  screenCap = Number.POSITIVE_INFINITY;

  private readonly bus: EventBusApi;
  private readonly clock: RunClockApi;
  private readonly rng: Rng;
  private readonly arena: Arena;
  private readonly dropTable: DropTablePort;
  private readonly pools = new Map<string, Enemy[]>();
  private nextEntityId = 1;
  /** 当前帧玩家位置（tick 注入，供子体生成做安全距离校验） */
  private currentPlayerPos: Vec3 | null = null;

  constructor(deps: EnemyManagerDeps) {
    this.bus = deps.bus;
    this.clock = deps.clock;
    this.rng = deps.rng;
    this.arena = deps.arena;
    this.dropTable = deps.dropTable ?? defaultDropTable;
  }

  get aliveCount(): number {
    return this.aliveEnemies.length;
  }
  get eliteCount(): number {
    let n = 0;
    for (const e of this.aliveEnemies) if (e instanceof EliteEnemy) n++;
    return n;
  }
  get lordCount(): number {
    let n = 0;
    for (const e of this.aliveEnemies) if (e instanceof EliteEnemy && e.rank === 'lord') n++;
    return n;
  }
  get normalCount(): number {
    return this.aliveCount - this.eliteCount;
  }

  isAlive(entityId: EntityId): boolean {
    return this.aliveEnemies.some((e) => e.entityId === entityId);
  }

  /** 生成普通怪（精英走 addElite）；受同屏上限约束 */
  spawn(defId: EnemyId, opts: SpawnOptions): Enemy | null {
    const cap = this.screenCap + (opts.allowOvercap ? BEHAVIOR_EXTRA.splitOvercapAllowance : 0);
    if (this.aliveCount >= cap) return null;
    const e = this.takeFromPool(defId);
    e.activate(defId, this.allocId(), {
      position: { x: opts.position.x, y: 0, z: opts.position.z },
      hpScale: opts.hpScale,
      damageScale: opts.damageScale,
      hpOverride: opts.hpOverride,
      damageOverride: opts.damageOverride,
    });
    if (e instanceof HoundEnemy) e.assignFlank(this.rng);
    this.enemies.push(e);
    this.refreshAlive();
    this.bus.publish('enemy.spawned', { enemyId: e.entityId, defId, isElite: false });
    return e;
  }

  /** 精英由 factory 构建（词缀/乘区已装配），此处登记入池；elite.spawned 由 director 发 */
  addElite(elite: EliteEnemy): EliteEnemy {
    this.enemies.push(elite);
    this.refreshAlive();
    this.bus.publish('enemy.spawned', {
      enemyId: elite.entityId,
      defId: elite.defId,
      isElite: true,
      affixes: elite.affixes,
    });
    return elite;
  }

  /** 事件超时/清场：按 entityId 回收（巢穴清余怪用） */
  despawn(entityId: EntityId): void {
    const idx = this.enemies.findIndex((e) => e.entityId === entityId);
    if (idx < 0) return;
    const e = this.enemies[idx];
    this.enemies.splice(idx, 1);
    this.recycle(e);
    this.refreshAlive();
  }

  /** 词缀/事件子体生成端口：尊重同屏上限，allowOvercap 语义同上 */
  readonly requestSpawn: SpawnRequestPort = (requester, defId, position, opts) => {
    void requester;
    // 尸体分裂 / 召唤 / 事件守巢怪同样遵守「玩家 12m 内不得无预警刷怪」：
    // 父母体贴脸时把子体重定向到合法远点，避免近身凭空冒怪。
    let safePosition = position;
    const player = this.currentPlayerPos;
    if (player && Math.hypot(position.x - player.x, position.z - player.z) < SAFE_SPAWN.minDistanceFromPlayerM) {
      const alt = this.arena.pickSpawnPoint(this.rng, player, this.aliveEnemies);
      if (alt) safePosition = { x: alt.x, y: 0, z: alt.z };
    }
    return this.spawn(defId, {
      position: safePosition,
      hpOverride: opts?.hpOverride,
      damageOverride: opts?.damageOverride,
      allowOvercap: opts?.allowOvercap ?? true,
    });
  };

  /** 投射物发射端口 */
  fireProjectile: EnemyTickContext['projectiles'] = {
    fire: (owner, origin, dirX, dirZ, speedMps, radiusM, damage) => {
      this.projectiles.push({
        owner,
        x: origin.x,
        z: origin.z,
        dirX,
        dirZ,
        speedMps,
        radiusM,
        damage,
        remainingSec: BEHAVIOR_EXTRA.projectileLifetimeSec,
      });
    },
  };

  /** 每帧驱动；ctx 由场景层/facade 注入（端口指向外层结算） */
  tick(ctx: EnemyTickContext, dt: number): void {
    if (!(dt > 0)) return;
    this.currentPlayerPos = ctx.player.position;
    this.recomputeAuras();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.update(ctx, dt);
      this.arena.clampPosition(e.position, e.radiusM);
    }
    this.updateProjectiles(ctx, dt);
    this.updateClouds(ctx, dt);
    this.processDeaths(ctx);
  }

  /** 滋养体光环：6m 内友军移速加成（数值来自名册，manager 只做空间判定） */
  private recomputeAuras(): void {
    for (const e of this.aliveEnemies) e.auraSpeedPct = 0;
    for (const n of this.aliveEnemies) {
      if (!(n instanceof NourisherEnemy)) continue;
      const r2 = n.auraRadius * n.auraRadius;
      for (const e of this.aliveEnemies) {
        if (e === n) continue;
        const dx = e.position.x - n.position.x;
        const dz = e.position.z - n.position.z;
        if (dx * dx + dz * dz <= r2) {
          e.auraSpeedPct = Math.max(e.auraSpeedPct, n.auraSpeedBonusPct);
        }
      }
    }
  }

  private updateProjectiles(ctx: EnemyTickContext, dt: number): void {
    const p = ctx.player.position;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.dirX * proj.speedMps * dt;
      proj.z += proj.dirZ * proj.speedMps * dt;
      proj.remainingSec -= dt;
      const hit = Math.hypot(proj.x - p.x, proj.z - p.z) <= ctx.player.radiusM + proj.radiusM;
      if (hit) {
        ctx.damagePlayer(proj.damage, proj.owner, 'projectile');
        proj.owner?.noteDamageDealt(proj.damage);
      }
      const out =
        Math.abs(proj.x) > this.arena.halfSizeM || Math.abs(proj.z) > this.arena.halfSizeM;
      if (hit || out || proj.remainingSec <= 0) this.projectiles.splice(i, 1);
    }
  }

  private updateClouds(ctx: EnemyTickContext, dt: number): void {
    const p = ctx.player.position;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.remainingSec -= dt;
      c.tickTimer -= dt;
      while (c.tickTimer <= 0 && c.remainingSec > 0) {
        c.tickTimer += 1;
        if (Math.hypot(p.x - c.x, p.z - c.z) <= c.radiusM + ctx.player.radiusM) {
          ctx.damagePlayer(c.dps, c.owner, 'dot');
          c.owner?.noteDamageDealt(c.dps);
        }
      }
      if (c.remainingSec <= 0) this.clouds.splice(i, 1);
    }
  }

  /** 尸体统一结算（先全部行为更新完再落地，避免遍历中改动数组） */
  private processDeaths(ctx: EnemyTickContext): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.alive) continue;

      // 滋养体：死亡分裂（数值来自名册 onDeathSplit）
      if (e instanceof NourisherEnemy) {
        const spec = e.splitSpec;
        for (let k = 0; k < spec.count; k++) {
          const angle = (k / Math.max(1, spec.count)) * Math.PI * 2;
          ctx.requestSpawn(e, 'riftHound', {
            x: e.position.x + Math.cos(angle) * BEHAVIOR_EXTRA.minionScatterRadiusM,
            y: 0,
            z: e.position.z + Math.sin(angle) * BEHAVIOR_EXTRA.minionScatterRadiusM,
          }, {
            hpOverride: spec.hp,
            damageOverride: spec.damage,
            allowOvercap: true,
          });
        }
      }

      // 精英：分裂词缀 / 剧毒毒区
      if (e instanceof EliteEnemy) {
        const effects = e.deathEffects();
        for (const s of effects.splits) {
          ctx.requestSpawn(e, s.defId, s.position, {
            hpOverride: s.hpOverride,
            damageOverride: s.damageOverride,
            allowOvercap: true,
          });
        }
        for (const c of effects.clouds) this.clouds.push(c);
      }

      const drops = this.dropTable({
        defId: e.defId,
        isElite: e instanceof EliteEnemy,
        rank: e instanceof EliteEnemy ? (e.rank as EliteRank) : null,
        position: { x: e.position.x, z: e.position.z },
      });
      this.bus.publish('enemy.killed', { defId: e.defId, atSec: this.clock.elapsedSec, drops });
      for (const d of drops) {
        this.bus.publish('resource.dropped', {
          currencyId: d.currencyId,
          amount: d.amount,
          pos: e.position as Vec3,
        });
      }

      this.enemies.splice(i, 1);
      this.recycle(e);
    }
    this.refreshAlive();
  }

  private refreshAlive(): void {
    this.aliveEnemies.length = 0;
    for (const e of this.enemies) if (e.alive) this.aliveEnemies.push(e);
  }

  private allocId(): EntityId {
    return this.nextEntityId++ as EntityId;
  }

  /** 供 SpawnDirector / 事件侧为工厂构建的精英分配实体 ID（统一自增，不重号） */
  nextId(): EntityId {
    return this.allocId();
  }

  private poolKey(defId: EnemyId): string {
    return isEliteEnemyId(defId) ? 'elite' : defId;
  }

  private takeFromPool(defId: EnemyId): Enemy {
    const key = this.poolKey(defId);
    let pool = this.pools.get(key);
    if (!pool) {
      pool = [];
      this.pools.set(key, pool);
    }
    const reused = pool.pop();
    if (reused) return reused;
    switch (defId) {
      case 'riftHound':
        return new HoundEnemy();
      case 'riftSpitter':
        return new SpitterEnemy();
      case 'umbraDasher':
        return new DasherEnemy();
      case 'riftNourisher':
        return new NourisherEnemy();
      default:
        return new EliteEnemy();
    }
  }

  private recycle(e: Enemy): void {
    e.alive = false;
    const key = this.poolKey(e.defId);
    const pool = this.pools.get(key) ?? [];
    pool.push(e);
    this.pools.set(key, pool);
  }
}
