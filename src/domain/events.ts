/**
 * 领域事件总线 + 只读轮询快照 + 可种子化随机数实现。
 *
 * 设计原则（工程-技术架构.md §5 / 提案 §2.7）：
 *   - **离散事件**（死了一只怪、Boss 换阶段）走广播；
 *   - **每帧连续变化的数值**（血条、计时器）走 RunSnapshot 轮询，绝不广播——
 *     否则每帧制造海量临时对象，是移动端 GC 抖动的主因。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import type {
  BossPhase,
  CurrencyId,
  ElementId,
  EliteAffixId,
  EnemyId,
  GemId,
  GemQuality,
  WeaponId,
  WeaponUpgradeLevel,
  WorldEventId,
} from './ids.ts';
import type { RunPhase } from './runState.ts';
import type { DamageSource } from './damage.ts';
import type { UpgradeCardDef, UpgradeId } from './upgrade.ts';
import type { EntityId, Rng, RngFactory, Vec3 } from './types.ts';
import type { SaveRunLoot } from './save.ts';

// ─────────────────────────────────────────────────────────────
// 事件表
// ─────────────────────────────────────────────────────────────

/** 一次掉落摇取结果（未指定的品质/宝石由 TASK-04 填入具体 itemInstanceId 后入账）。 */
export interface LootRoll {
  readonly currencyId: CurrencyId;
  readonly amount: number;
}

/**
 * 全部领域事件及其 payload。
 *
 * 事件名与 设计-Agent任务分配.md TASK-01「建议领域事件」原文对齐
 * （weapon.* / gem.* / resource.* / run.settled / elite.spawned / world_event.* / boss.*）。
 */
export interface GameEventMap {
  // ── 局流程 ──
  'run.started': { readonly seed: number };
  'run.phaseChanged': { readonly from: RunPhase; readonly to: RunPhase };
  'run.settled': { readonly victory: boolean; readonly pickedResources: SaveRunLoot };

  // ── 玩家 ──
  'player.damaged': { readonly amount: number; readonly source: DamageSource; readonly hpLeft: number };
  'player.died': { readonly atSec: number };
  'player.leveledUp': { readonly level: number };
  'upgrade.offered': { readonly level: number; readonly choices: readonly UpgradeCardDef[] /* 每级 3 选 1 */ };
  'upgrade.selected': { readonly cardId: UpgradeId; readonly tier: 1 | 2 | 3 };

  // ── 武器 / 宝石（TASK-01 建议事件名原文采纳）──
  'weapon.switched': { readonly from: WeaponId; readonly to: WeaponId };
  'weapon.upgraded': { readonly weaponId: WeaponId; readonly level: WeaponUpgradeLevel };
  /** slot 存 itemInstanceId（Q6 签收），不存 gemId——否则同种宝石不同品质无法区分 */
  'gem.socketed': { readonly weaponId: WeaponId; readonly slot: 0 | 1 | 2; readonly itemInstanceId: string };
  'gem.unsocketed': { readonly weaponId: WeaponId; readonly slot: 0 | 1 | 2 };
  'gem.merged': { readonly gemId: GemId; readonly fromQuality: GemQuality; readonly toQuality: GemQuality };

  // ── 敌人 / 战斗 ──
  'enemy.spawned': {
    readonly enemyId: EntityId;
    readonly defId: EnemyId;
    readonly isElite: boolean;
    readonly affixes?: readonly EliteAffixId[];
  };
  'enemy.killed': { readonly defId: EnemyId; readonly atSec: number; readonly drops: readonly LootRoll[] };
  'proc.triggered': { readonly element: ElementId; readonly targetId: EntityId };
  'elite.spawned': { readonly defId: EnemyId; readonly affixes: readonly EliteAffixId[] };

  // ── 资源 / 事件 / Boss（TASK-01 建议事件名原文采纳）──
  'resource.dropped': { readonly currencyId: CurrencyId; readonly amount: number; readonly pos: Vec3 };
  /** 防重复入账由 Economy 侧保证（同一掉落不可被两名玩家/两次碰撞各记一次） */
  'resource.picked_up': { readonly currencyId: CurrencyId; readonly amount: number };
  'world_event.started': { readonly id: WorldEventId };
  'world_event.completed': { readonly id: WorldEventId };
  'world_event.expired': { readonly id: WorldEventId };
  /** 预警时刻 510s（8:30，D1 权威值） */
  'boss.warning_started': { readonly atSec: number };
  /** 登场时刻 600s（10:00，D1 权威值） */
  'boss.spawned': { readonly atSec: number };
  'boss.phase_changed': { readonly phase: BossPhase; readonly hpPct: number };
  'boss.defeated': { readonly atSec: number };
}

/** 事件名联合（用于遍历/日志/测试断言）。 */
export type GameEventType = keyof GameEventMap;

/** 一条事件信封（type + payload 成对出现，便于队列化与日志）。 */
export type GameEvent<K extends GameEventType = GameEventType> = {
  readonly type: K;
  readonly payload: GameEventMap[K];
};

/** 退订函数（调用一次即移除对应监听器，幂等）。 */
export type Unsubscribe = () => void;

/** 事件总线契约。 */
export interface EventBusApi {
  /** 广播一条事件；同步分发给当前所有监听器 */
  publish<K extends GameEventType>(type: K, payload: GameEventMap[K]): void;
  /** 订阅；返回退订函数 */
  subscribe<K extends GameEventType>(type: K, handler: (payload: GameEventMap[K]) => void): Unsubscribe;
  /** 场景销毁时统一退订，防监听器泄漏（合并门槛 §5.6 的清理要求） */
  clearAll(): void;
  /** 某事件当前监听器数量（调试/泄漏排查用） */
  listenerCount(type: GameEventType): number;
}

/**
 * 事件总线实现。
 *
 * 实现细节与理由：
 *   1. **分发用数组快照**：publish 时对监听器列表做浅拷贝再遍历，
 *      允许监听器在回调里退订自己/别人而不破坏本次遍历（这是最常见的手雷）。
 *   2. **同步分发**：领域事件量小且需要与状态变更同帧生效；异步化会引入
 *      "事件到了但状态已变"的时序坑。
 *   3. **监听器异常隔离**：单个 handler 抛错不应中断其余 handler，
 *      否则一个 UI bug 会吞掉 Boss 阶段切换事件。异常打 console.error 后继续分发。
 *   4. **泛型内部用 any 逃逸**：Map 无法表达"键与 payload 类型相关"，
 *      这是 TS 的已知限制。仅在本文件内部用 `as unknown` 转换，对外 API 100% 强类型。
 */
export class EventBus implements EventBusApi {
  private readonly listeners = new Map<GameEventType, Set<(payload: never) => void>>();

  publish<K extends GameEventType>(type: K, payload: GameEventMap[K]): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;
    // 快照：回调中退订不会影响本次遍历
    const snapshot = Array.from(set);
    for (const handler of snapshot) {
      try {
        (handler as (p: GameEventMap[K]) => void)(payload);
      } catch (err) {
        console.error(`[EventBus] handler 抛错（事件 ${type}），已隔离以免中断其余监听:`, err);
      }
    }
  }

  subscribe<K extends GameEventType>(type: K, handler: (payload: GameEventMap[K]) => void): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const stored = handler as (payload: never) => void;
    set.add(stored);
    return () => {
      const current = this.listeners.get(type);
      if (!current) return;
      current.delete(stored);
      if (current.size === 0) this.listeners.delete(type);
    };
  }

  clearAll(): void {
    this.listeners.clear();
  }

  listenerCount(type: GameEventType): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

/**
 * 创建事件总线（工厂函数，便于测试注入与将来替换实现）。
 */
export function createEventBus(): EventBusApi {
  return new EventBus();
}

// ─────────────────────────────────────────────────────────────
// 轮询快照
// ─────────────────────────────────────────────────────────────

/**
 * 每帧轮询用的只读快照（HUD / UI 的数据源，替代高频事件）。
 * 由领域层每帧原地改写同一个对象（见 createRunSnapshot / updateRunSnapshot），
 * UI 侧只读，不允许写。
 */
export interface RunSnapshot {
  phase: RunPhase;
  elapsedSec: number;
  playerHp: number;
  playerMaxHp: number;
  currentWeapon: WeaponId;
  xp: number;
  level: number;
  aliveEnemyCount: number;
  /** null = Boss 未登场 */
  bossHpPct: number | null;
  bossPhase: BossPhase | null;
  /** Boss 预警期标志（510s 起为 true） */
  bossWarning: boolean;
}

/** 创建初始快照（原地改写对象的第一份）。 */
export function createRunSnapshot(): RunSnapshot {
  return {
    phase: 'boot',
    elapsedSec: 0,
    playerHp: 0,
    playerMaxHp: 0,
    currentWeapon: 'staff',
    xp: 0,
    level: 1,
    aliveEnemyCount: 0,
    bossHpPct: null,
    bossPhase: null,
    bossWarning: false,
  };
}

/**
 * 原地更新快照（不分配新对象）。返回同一引用，便于 UI 持有不变。
 * @param target 目标快照（原地改写）
 * @param next   新值（部分字段）
 */
export function updateRunSnapshot(target: RunSnapshot, next: Partial<RunSnapshot>): RunSnapshot {
  Object.assign(target, next);
  return target;
}

// ─────────────────────────────────────────────────────────────
// 可种子化随机数（mulberry32）
// ─────────────────────────────────────────────────────────────

/**
 * mulberry32：32 位状态的快速确定性 PRNG。
 *
 * 选它的理由：
 *   - 状态只有一个 uint32，`snapshot()` 返回单个 number 即可完整复原，符合契约里
 *     `snapshot(): number` 的形状（xorshift128 需要 4 个 word，得另设计序列化）；
 *   - 周期 2^32、分布质量对"刷怪权重 / 抽卡 / 掉落概率"足够；
 *   - 不用 Math.random：TASK-01 验收要求"随机生成支持 seed"，Math.random 无法复现。
 *
 * 注意：**不是密码学安全随机**，不可用于任何安全目的（存档防篡改等见 security 维度）。
 */
export function createMulberry32(seed: number): Rng {
  // 归一到 uint32，保证同 seed 同序列；NaN/Infinity 归 0
  let state = Number.isFinite(seed) ? seed >>> 0 : 0;

  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  return {
    next(): number {
      // 除以 2^32 得到 [0, 1)
      return nextUint32() / 4294967296;
    },
    range(min: number, max: number): number {
      if (max <= min) return min;
      return min + this.next() * (max - min);
    },
    int(minInclusive: number, maxExclusive: number): number {
      const lo = Math.ceil(minInclusive);
      const hi = Math.floor(maxExclusive);
      if (hi <= lo) return lo;
      return lo + Math.floor(this.next() * (hi - lo));
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('[Rng.pick] 不能从空数组取元素');
      return arr[this.int(0, arr.length)];
    },
    snapshot(): number {
      return state;
    },
    restore(snapshot: number): void {
      state = Number.isFinite(snapshot) ? snapshot >>> 0 : 0;
    },
  };
}

/** 随机数工厂（契约形状 `(seed) => Rng`）。 */
export const rngFactory: RngFactory = (seed: number) => createMulberry32(seed);
