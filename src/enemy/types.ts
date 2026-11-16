/**
 * TASK-05 ｜ Enemy 系统公共类型（上下文 / 端口）
 *
 * 职责边界（分层铁律）：
 * - 敌人受击伤害一律走 domain.resolveDamageHit（红线：不得自写伤害公式）
 * - 对玩家伤害 / buff / 金币扣减只经端口交给调用方（TASK-02 战斗侧 / TASK-04 经济侧结算）
 * - 敌人实体不 import Babylon / DOM
 */

import type { EnemyId, WorldEventId } from '../domain/ids.ts';
import type { EntityId, Rng, Vec3 } from '../domain/types.ts';
import type { RunClockApi } from '../domain/clock.ts';
import type { Arena } from '../world/arena.ts';
import type { Enemy } from './enemy.ts';

/** 玩家快照（Enemy AI / 事件感知的最小玩家形状；由 TASK-02 场景层灌入） */
export interface PlayerSnapshot {
  position: Vec3;
  radiusM: number;
  hp: number;
  maxHp: number;
  gold: number;
}

/** 对玩家结算伤害的唯一出口（无敌帧/闪避由 TASK-02 侧结算） */
export type PlayerDamagePort = (
  amount: number,
  attacker: Enemy | null,
  kind: 'melee' | 'projectile' | 'leap' | 'zone' | 'dot',
) => void;

/** 局内 buff 落地端口（元素/古老祭坛事件 → TASK-02 的 rebuildDamageLayers 输入） */
export type InRunBuffPort = (buff: {
  buffId: string;
  category: 'damage' | 'moveSpeed' | 'interval' | 'damageTaken';
  pct: number;
  durationSec: number;
}) => void;

/** 金币扣减端口（古老祭坛金币献祭；返回 false = 余额不足） */
export type GoldSpendPort = (amount: number) => boolean;

/** 行为内子体生成端口（分裂/召唤），由 EnemyManager 实现，尊重同屏上限 */
export type SpawnRequestPort = (
  requester: Enemy | null,
  defId: EnemyId,
  position: Vec3,
  opts?: { hpOverride?: number; damageOverride?: number; allowOvercap?: boolean },
) => Enemy | null;

/** 投射物发射端口 */
export interface ProjectileSink {
  fire(
    owner: Enemy,
    origin: Vec3,
    dirX: number,
    dirZ: number,
    speedMps: number,
    radiusM: number,
    damage: number,
  ): void;
}

/** 每帧注入的敌人世界上下文 */
export interface EnemyTickContext {
  readonly clock: RunClockApi;
  readonly rng: Rng;
  readonly player: PlayerSnapshot;
  readonly damagePlayer: PlayerDamagePort;
  readonly aliveEnemies: readonly Enemy[];
  readonly projectiles: ProjectileSink;
  readonly requestSpawn: SpawnRequestPort;
  readonly arena: Arena;
}

/** 世界事件上下文（事件侧消费的端口集合；调度器注入） */
export interface EventWorldContext extends EnemyTickContext {
  readonly applyBuff: InRunBuffPort;
  readonly spendGold: GoldSpendPort;
  /** 请求生成双词缀精英（走 director 的窗口/上限/重试判定） */
  readonly requestEliteInvasion: (defId: 'riftRavager' | 'riftCaller', affixCount: number) => Enemy | null;
  /** 当前活动事件 ID（供事件互斥断言/调试） */
  readonly activeEventId: WorldEventId | null;
  /** 事件收尾清理实体（巢穴超时清余怪，防泄漏） */
  readonly despawnEnemy: (entityId: EntityId) => void;
}

/** 毒区（剧毒词缀死亡遗留 / 投射者弹道落地可选；DoT 经 damagePlayer 端口结算） */
export interface PoisonCloud {
  readonly x: number;
  readonly z: number;
  readonly radiusM: number;
  remainingSec: number;
  /** 每秒伤害（来自 config 词缀 dps） */
  dps: number;
  tickTimer: number;
  owner: Enemy | null;
}
