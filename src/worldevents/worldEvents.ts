/**
 * TASK-05 ｜ 五种世界事件（生命周期：完成 / 超时 / 清理，无泄漏）
 *
 * 数值全部来自 domain.worldEventDefs()（→ config.waveTimelineConfig.events）；
 * 补充交互微参数来自 eventConfig.ts（TASK-05 自有 PROVISIONAL 数据）。
 *
 * 红线：事件不直接改玩家/经济状态，一律经端口（damagePlayer / applyBuff / spendGold /
 *       requestSpawn / despawnEnemy / requestEliteInvasion）交给 TASK-02 / TASK-04；
 *       巢穴受击走 domain.resolveDamageHit；不 import Babylon / DOM。
 */
import { resolveDamageHit } from '../domain/damage.ts';
import type { DamageSource } from '../domain/damage.ts';
import { worldEventDefs } from '../domain/wave.ts';
import type { WorldEventDef, WorldEventParams } from '../domain/wave.ts';
import type { WorldEventId } from '../domain/ids.ts';
import type { EntityId, Vec3 } from '../domain/types.ts';
import type { EventBusApi } from '../domain/events.ts';
import { ELITE_ENEMY_IDS } from '../domain/enemy.ts';
import { EVENT_EXTRA } from './eventConfig.ts';
import type { EventWorldContext } from '../enemy/types.ts';

export type WorldEventState = 'active' | 'completed' | 'expired';

/** 巢穴的可攻击目标：受击走契约结算器（不自写伤害公式） */
export class NestAttackTarget {
  hp: number;
  readonly maxHp: number;
  readonly position: Vec3;

  constructor(hp: number, position: Vec3) {
    this.hp = hp;
    this.maxHp = hp;
    this.position = position;
  }

  takeDamage(panelDamage: number, source: DamageSource): number {
    const res = resolveDamageHit({
      source,
      baseDamage: panelDamage,
      targetId: 0 as EntityId,
      hitPos: this.position,
      targetHp: this.hp,
      targetTier: 'normal',
    });
    this.hp -= res.dealt;
    return this.hp;
  }
}

export abstract class WorldEvent {
  readonly id: WorldEventId;
  readonly def: WorldEventDef;
  state: WorldEventState = 'active';
  protected elapsedSec = 0;
  protected readonly bus: EventBusApi;

  constructor(id: WorldEventId, bus: EventBusApi) {
    this.id = id;
    this.bus = bus;
    const def = worldEventDefs().find((d) => d.id === id);
    if (!def) throw new Error(`[TASK-05] 未知世界事件: ${id}`);
    this.def = def;
  }

  /** 创建后由 scheduler 调用一次（生成实体/落点） */
  start(_ctx: EventWorldContext): void {
    // 默认无启动副作用
  }

  tick(ctx: EventWorldContext, dt: number): void {
    if (this.state !== 'active') return;
    this.elapsedSec += dt;
    if (this.elapsedSec >= this.def.timeoutSec) {
      this.finish(ctx, 'expired');
      return;
    }
    this.onTick(ctx, dt);
  }

  protected abstract onTick(ctx: EventWorldContext, dt: number): void;

  /** 收尾清理（超时清余怪、事件实体归还，防泄漏） */
  protected onEnd(_ctx: EventWorldContext, _state: WorldEventState): void {
    // 默认无对象需清理
  }

  protected complete(ctx: EventWorldContext): void {
    this.finish(ctx, 'completed');
  }

  private finish(ctx: EventWorldContext, state: WorldEventState): void {
    if (this.state !== 'active') return;
    this.state = state;
    this.onEnd(ctx, state);
    this.bus.publish(state === 'completed' ? 'world_event.completed' : 'world_event.expired', { id: this.id });
  }

  /** 从合法点里挑一个距玩家 [min,max] 的落点（无合法点时取最远点） */
  protected pickPropPosition(ctx: EventWorldContext): Vec3 {
    const p = ctx.player.position;
    const { propMinPlayerDistM, propMaxPlayerDistM } = EVENT_EXTRA;
    const candidates = ctx.arena.spawnPoints.filter((s) => {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      return d >= propMinPlayerDistM && d <= propMaxPlayerDistM;
    });
    const chosen = candidates.length > 0
      ? ctx.rng.pick(candidates)
      : ctx.arena.spawnPoints[ctx.arena.spawnPoints.length - 1];
    return { x: chosen.x, y: 0, z: chosen.z };
  }

  protected distanceToPlayer(ctx: EventWorldContext, pos: Vec3): number {
    return Math.hypot(ctx.player.position.x - pos.x, ctx.player.position.z - pos.z);
  }

  protected paramsOf<T extends WorldEventParams['kind']>(kind: T): Extract<WorldEventParams, { kind: T }> {
    if (this.def.params.kind !== kind) {
      throw new Error(`[TASK-05] 事件 ${this.id} 的 params.kind 应为 ${kind}`);
    }
    return this.def.params as Extract<WorldEventParams, { kind: T }>;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 遗落宝箱
// ─────────────────────────────────────────────────────────────
export class LostChestEvent extends WorldEvent {
  readonly chestPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private channelSec = 0;

  override start(ctx: EventWorldContext): void {
    const pos = this.pickPropPosition(ctx);
    this.chestPosition.x = pos.x;
    this.chestPosition.z = pos.z;
  }

  protected onTick(ctx: EventWorldContext, dt: number): void {
    const params = this.paramsOf('lostChest');
    if (this.distanceToPlayer(ctx, this.chestPosition) > EVENT_EXTRA.interactRadiusM) return;
    this.channelSec += dt;
    if (this.channelSec < params.openSec) return;
    // 奖励只发事件，实际入账由 TASK-04 经济侧消费（防重复由该侧保证）
    this.bus.publish('resource.dropped', {
      currencyId: 'gold',
      amount: EVENT_EXTRA.chestGold,
      pos: this.chestPosition,
    });
    this.bus.publish('resource.dropped', {
      currencyId: 'forestMaterial',
      amount: EVENT_EXTRA.chestMaterial,
      pos: this.chestPosition,
    });
    this.complete(ctx);
  }
}

// ─────────────────────────────────────────────────────────────
// 2. 元素祭坛
// ─────────────────────────────────────────────────────────────
export class ElementalAltarEvent extends WorldEvent {
  readonly altarPosition: Vec3 = { x: 0, y: 0, z: 0 };
  channelProgress = 0;

  override start(ctx: EventWorldContext): void {
    const pos = this.pickPropPosition(ctx);
    this.altarPosition.x = pos.x;
    this.altarPosition.z = pos.z;
  }

  protected onTick(ctx: EventWorldContext, dt: number): void {
    const params = this.paramsOf('elementalAltar');
    const inside = this.distanceToPlayer(ctx, this.altarPosition) <= EVENT_EXTRA.interactRadiusM;
    this.channelProgress = inside
      ? this.channelProgress + dt
      : Math.max(0, this.channelProgress - dt * EVENT_EXTRA.channelDecayMult);
    if (this.channelProgress < 1e-6) this.channelProgress = 0;
    if (this.channelProgress < EVENT_EXTRA.elementalAltarChannelSec) return;
    ctx.applyBuff({
      buffId: 'elementalAltar',
      category: 'damage',
      pct: params.buffPct,
      durationSec: params.durationSec,
    });
    this.complete(ctx);
  }
}

// ─────────────────────────────────────────────────────────────
// 3. 怪物巢穴
// ─────────────────────────────────────────────────────────────
export class MonsterNestEvent extends WorldEvent {
  readonly nestPosition: Vec3 = { x: 0, y: 0, z: 0 };
  attackTarget: NestAttackTarget | null = null;
  readonly guardEntityIds: EntityId[] = [];
  private spawnTimer = 0;

  override start(ctx: EventWorldContext): void {
    const pos = this.pickPropPosition(ctx);
    this.nestPosition.x = pos.x;
    this.nestPosition.z = pos.z;
    this.attackTarget = new NestAttackTarget(this.paramsOf('monsterNest').hp, this.nestPosition);
  }

  protected onTick(ctx: EventWorldContext, dt: number): void {
    if (this.attackTarget && this.attackTarget.hp <= 0) {
      this.complete(ctx);
      return;
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer += EVENT_EXTRA.monsterNestSpawnIntervalSec;
    for (let i = 0; i < EVENT_EXTRA.monsterNestSpawnCount; i++) {
      const angle = (i / EVENT_EXTRA.monsterNestSpawnCount) * Math.PI * 2;
      const guard = ctx.requestSpawn(null, 'riftHound', {
        x: this.nestPosition.x + Math.cos(angle) * EVENT_EXTRA.monsterNestSpawnRadiusM,
        y: 0,
        z: this.nestPosition.z + Math.sin(angle) * EVENT_EXTRA.monsterNestSpawnRadiusM,
      });
      if (guard) this.guardEntityIds.push(guard.entityId);
    }
  }

  /** 完成/超时都清余怪：不留孤儿实体 */
  protected override onEnd(ctx: EventWorldContext, _state: WorldEventState): void {
    for (const id of this.guardEntityIds) ctx.despawnEnemy(id);
    this.guardEntityIds.length = 0;
  }
}

// ─────────────────────────────────────────────────────────────
// 4. 古老祭坛（生命献祭 / 金币献祭）
// ─────────────────────────────────────────────────────────────
export class AncientAltarEvent extends WorldEvent {
  readonly altarPosition: Vec3 = { x: 0, y: 0, z: 0 };
  channelProgress = 0;

  override start(ctx: EventWorldContext): void {
    const pos = this.pickPropPosition(ctx);
    this.altarPosition.x = pos.x;
    this.altarPosition.z = pos.z;
  }

  protected onTick(ctx: EventWorldContext, dt: number): void {
    const params = this.paramsOf('ancientAltar');
    const inside = this.distanceToPlayer(ctx, this.altarPosition) <= EVENT_EXTRA.interactRadiusM;
    this.channelProgress = inside
      ? this.channelProgress + dt
      : Math.max(0, this.channelProgress - dt * EVENT_EXTRA.channelDecayMult);
    if (this.channelProgress < 1e-6) this.channelProgress = 0;
    if (this.channelProgress < EVENT_EXTRA.ancientAltarChannelSec) return;

    let anyOffering = false;
    // 生命献祭：扣当前生命的 hpCostPctOfCurrent（经 damagePlayer 端口，免伤由 TASK-02 结算）
    const hpCost = ctx.player.hp * params.hpCostPctOfCurrent;
    if (hpCost > 0 && ctx.player.hp > hpCost) {
      ctx.damagePlayer(hpCost, null, 'zone');
      ctx.applyBuff({
        buffId: 'ancientAltarHp',
        category: 'damage',
        pct: params.damageBuffPct,
        durationSec: params.durationSec,
      });
      anyOffering = true;
    }
    // 金币献祭：余额不足则由 spendGold 返回 false，不影响另一种献祭
    if (ctx.spendGold(params.goldCost)) {
      ctx.applyBuff({
        buffId: 'ancientAltarGold',
        category: 'interval',
        pct: params.attackSpeedBuffPct,
        durationSec: params.durationSec,
      });
      anyOffering = true;
    }
    if (anyOffering) this.complete(ctx);
    else this.channelProgress = EVENT_EXTRA.ancientAltarChannelSec - 0.1; // 无资源可献：继续等待至超时
  }
}

// ─────────────────────────────────────────────────────────────
// 5. 精英入侵
// ─────────────────────────────────────────────────────────────
export class EliteInvasionEvent extends WorldEvent {
  linkedEntityId: EntityId | null = null;
  readonly fallbackEntityIds: EntityId[] = [];

  override start(ctx: EventWorldContext): void {
    const params = this.paramsOf('eliteInvasion');
    const defId = ctx.rng.pick(ELITE_ENEMY_IDS);
    const elite = ctx.requestEliteInvasion(defId, params.affixCount);
    if (elite) {
      this.linkedEntityId = elite.entityId;
      return;
    }
    // 窗口外/同屏已满：降级为精英狼群（不破坏 360s 前零精英的防线）
    const playerPos = ctx.player.position;
    for (let i = 0; i < EVENT_EXTRA.eliteInvasionFallbackPackSize; i++) {
      const point = ctx.arena.pickSpawnPoint(ctx.rng, playerPos, ctx.aliveEnemies);
      if (!point) break;
      const pack = ctx.requestSpawn(null, 'riftHound', { x: point.x, y: 0, z: point.z }, {
        hpOverride: undefined,
        allowOvercap: true,
      });
      if (pack) {
        pack.maxHp *= EVENT_EXTRA.eliteInvasionFallbackHpScale;
        pack.hp = pack.maxHp;
        this.fallbackEntityIds.push(pack.entityId);
      }
    }
  }

  protected onTick(ctx: EventWorldContext, _dt: number): void {
    const targets = this.linkedEntityId !== null ? [this.linkedEntityId] : this.fallbackEntityIds;
    if (targets.length === 0) return;
    const anyAlive = targets.some((id) => ctx.aliveEnemies.some((e) => e.entityId === id));
    if (!anyAlive) this.complete(ctx);
  }

  protected override onEnd(ctx: EventWorldContext, state: WorldEventState): void {
    // 超时未击杀：清理事件关联实体，防止遗留精英/狼群（生命周期无泄漏）
    if (state !== 'expired') return;
    if (this.linkedEntityId !== null) ctx.despawnEnemy(this.linkedEntityId);
    for (const id of this.fallbackEntityIds) ctx.despawnEnemy(id);
  }
}

export function createWorldEvent(id: WorldEventId, bus: EventBusApi): WorldEvent {
  switch (id) {
    case 'lostChest':
      return new LostChestEvent(id, bus);
    case 'elementalAltar':
      return new ElementalAltarEvent(id, bus);
    case 'monsterNest':
      return new MonsterNestEvent(id, bus);
    case 'ancientAltar':
      return new AncientAltarEvent(id, bus);
    case 'eliteInvasion':
      return new EliteInvasionEvent(id, bus);
  }
}
