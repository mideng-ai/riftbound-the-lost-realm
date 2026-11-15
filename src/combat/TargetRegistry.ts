/**
 * TASK-02 敌人目标注册表（TASK-05 Spawn Director 接管前的运行时载体）。
 *
 * 职责边界：只持有「当前场上目标的生命 / 位置 / 档位 / 经验」，
 * 不实现刷怪节奏、AI、掉落（分别属 TASK-05 / TASK-06 / TASK-04）。
 * HP/经验/半径全部从 domain 敌人定义 + wave.phaseAtSec 派生，禁止硬编码。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import {
  normalEnemyDefinition,
  eliteStats,
  bossDefinition,
  enemyTierOf,
  isNormalEnemyId,
  isEliteEnemyId,
  phaseAtSec,
} from '../domain/index.ts';
import type {
  EntityId,
  EnemyId,
  Vec3,
  ControlTier,
  EventBusApi,
} from '../domain/index.ts';

/** 一个场上目标。字段扁平，便于对象池复用。 */
export interface EnemyTarget {
  readonly entityId: EntityId;
  readonly defId: EnemyId;
  readonly tier: ControlTier;
  readonly radiusM: number;
  /** 击杀经验（普通怪 20 / 精英 ×5 / Boss 500，Q-NEW-3 重标定后以 config 为准） */
  readonly xpValue: number;
  hp: number;
  maxHp: number;
  position: Vec3;
  alive: boolean;
}

export interface KillResult {
  readonly entityId: EntityId;
  readonly defId: EnemyId;
  readonly xpValue: number;
  readonly position: Vec3;
}

/** 按定义与波次阶段组装一个目标（不发布事件、不写全局状态）。 */
export function makeEnemyTarget(defId: EnemyId, pos: Vec3, entityId: EntityId, elapsedSec: number): EnemyTarget {
  const phase = phaseAtSec(elapsedSec);
  let baseHp: number;
  let radiusM: number;
  let xpValue: number;

  if (isNormalEnemyId(defId)) {
    const def = normalEnemyDefinition(defId);
    baseHp = def.baseHp;
    radiusM = def.radiusM;
    xpValue = def.xpValue;
  } else if (isEliteEnemyId(defId)) {
    const stats = eliteStats(defId);
    baseHp = stats.baseHp;
    radiusM = stats.radiusM;
    xpValue = stats.xpValue;
  } else {
    const boss = bossDefinition();
    baseHp = boss.baseHp;
    radiusM = boss.radiusM;
    xpValue = boss.xpValue;
  }

  const maxHp = baseHp * phase.hpScale;
  return {
    entityId,
    defId,
    tier: enemyTierOf(defId),
    radiusM,
    xpValue,
    hp: maxHp,
    maxHp,
    position: { ...pos },
    alive: true,
  };
}

/**
 * 目标注册表。提供「查询存活目标 → 命中几何过滤 → 结算伤害 → 击杀回调」所需的全部数据，
 * 但把伤害计算留给 CombatResolver（唯一伤害出口）。
 */
export class TargetRegistry {
  private readonly bus: EventBusApi;
  private nextId = 1;
  private readonly targets = new Map<EntityId, EnemyTarget>();

  constructor(bus: EventBusApi) {
    this.bus = bus;
  }

  /** 生成一个目标并广播 enemy.spawned。 */
  spawn(defId: EnemyId, pos: Vec3, elapsedSec: number): EnemyTarget {
    const id = this.nextId++ as EntityId;
    const target = makeEnemyTarget(defId, pos, id, elapsedSec);
    this.targets.set(id, target);
    this.bus.publish('enemy.spawned', {
      enemyId: id,
      defId,
      isElite: target.tier !== 'normal',
    });
    return target;
  }

  /** 直接注册一个已组装好的目标（测试 / 调试木桩用），不发 spawn 事件。 */
  add(target: EnemyTarget): EnemyTarget {
    this.targets.set(target.entityId, target);
    return target;
  }

  get(entityId: EntityId): EnemyTarget | undefined {
    return this.targets.get(entityId);
  }

  /** 存活目标列表（命中判定遍历用；返回内部引用，零分配）。 */
  alive(): readonly EnemyTarget[] {
    const out: EnemyTarget[] = [];
    for (const t of this.targets.values()) if (t.alive) out.push(t);
    return out;
  }

  get aliveCount(): number {
    let n = 0;
    for (const t of this.targets.values()) if (t.alive) n++;
    return n;
  }

  /**
   * 写入已结算的伤害。注意：dealt 必须来自 CombatResolver（resolveDamageHit 的结果），
   * 本方法不做任何伤害公式，只负责扣血与击杀广播。
   * @returns 击杀信息；未致死返回 null
   */
  applyDamage(entityId: EntityId, dealt: number, atSec: number): KillResult | null {
    const target = this.targets.get(entityId);
    if (!target || !target.alive || dealt <= 0) return null;
    target.hp = Math.max(0, target.hp - dealt);
    if (target.hp > 0) return null;

    target.alive = false;
    const result: KillResult = {
      entityId: target.entityId,
      defId: target.defId,
      xpValue: target.xpValue,
      position: { ...target.position },
    };
    // drops 由 TASK-04 Economy 填充；TASK-02 只保证事件形状完整（空数组）
    this.bus.publish('enemy.killed', { defId: target.defId, atSec, drops: [] });
    return result;
  }

  /** 清空（重开一局）。 */
  clear(): void {
    this.targets.clear();
    this.nextId = 1;
  }
}
