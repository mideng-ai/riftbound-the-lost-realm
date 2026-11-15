/**
 * src/gems/proc.ts — 命中事件 → 元素触发结算（TASK-03）
 *
 * 职责：消费「某把武器的命中」，按该武器元素宝石的触发概率独立掷骰，
 * 产出触发结果（含按敌档衰减后的控制上限）与 'proc.triggered' 事件 payload。
 *
 * 红线（任务书验收）：
 *   - 元素效果**从正确武器的命中事件触发**：hit.weaponId 必须与查询的武器一致，错配一律零触发
 *   - 只提供效果接口：返回数值与事件 payload，由战斗侧施加 debuff / 回血，本模块不改攻击算法
 *
 * 随机数：注入 domain Rng（mulberry32，可 seed 复现），不使用 Math.random。
 * TASK-02 命中事件（weapon.hit / DamageSource）落地后，由场景接线层把命中参数翻译成本模块的
 * GemHitInput —— 字段刻意只取结算必需的三项，避免与 TASK-02 契约耦合过深。
 */
import type { WeaponId } from '../domain/ids.ts';
import type { EntityId } from '../domain/types.ts';
import type { GameEventMap } from '../domain/events.ts';
import type { Rng } from '../domain/types.ts';
import type { ControlTier } from '../domain/damage.ts';
import { effectiveControlCaps, type EffectiveControlCaps } from '../domain/damage.ts';
import type { SaveDataV3 } from '../domain/save.ts';
import { elementProcStates, lifestealHeal, type ElementProcState } from './effects.ts';

/** 一次命中（结算必需的最小输入；由武器/战斗系统在命中时提供）。 */
export interface GemHitInput {
  /** 造成命中的武器——必须与查询侧一致，否则零触发 */
  readonly weaponId: WeaponId;
  /** 本次命中的伤害（燃烧按命中伤害百分比、吸血按命中伤害百分比结算） */
  readonly hitDamage: number;
  /** 命中目标 */
  readonly target: {
    readonly id: EntityId;
    /** 敌档位：普通/精英/Boss（控制上限查表行） */
    readonly tier: ControlTier;
  };
  /** 玩家当前最大生命（吸血每秒上限用） */
  readonly playerMaxHp: number;
  /** 本秒已吸血量（吸血每秒上限口径） */
  readonly healedThisSecond: number;
}

/** 一次元素的触发结果（数值已按敌档衰减，可直接被战斗侧消费）。 */
export interface ProcOutcome {
  readonly element: ElementProcState['element'];
  /** 参与结算的宝石实例（诊断/掉落归属） */
  readonly sourceItemInstanceIds: readonly string[];
  /** 该敌档实际生效的控制上限（燃烧层数/减速幅度/连锁跳数） */
  readonly controlCaps: EffectiveControlCaps;
  /** 暗影吸血：本次治疗量（非暗影为 0） */
  readonly lifestealHealAmount: number;
  /** 'proc.triggered' 事件 payload（调用方负责 publish） */
  readonly event: GameEventMap['proc.triggered'];
}

/** 一次命中的完整结算结果。 */
export interface HitProcResolution {
  readonly outcomes: readonly ProcOutcome[];
}

/**
 * 结算一次武器命中的元素触发。
 *
 * 每个元素独立掷骰（rng.next() < chance 即触发）；
 * 触发的效果强度不随品质/重复放大（Q4-B），控制上限按目标档位衰减。
 */
export function resolveGemHit(save: SaveDataV3, hit: GemHitInput, rng: Rng): HitProcResolution {
  const outcomes: ProcOutcome[] = [];
  for (const proc of elementProcStates(save, hit.weaponId)) {
    if (rng.next() >= proc.chance) continue;

    const caps = effectiveControlCaps(hit.target.tier);
    outcomes.push({
      element: proc.element,
      sourceItemInstanceIds: proc.sourceItemInstanceIds,
      controlCaps: caps,
      lifestealHealAmount:
        proc.element === 'shadow' ? lifestealHeal(hit.hitDamage, hit.playerMaxHp, hit.healedThisSecond) : 0,
      event: { element: proc.element, targetId: hit.target.id },
    });
  }
  return { outcomes };
}
