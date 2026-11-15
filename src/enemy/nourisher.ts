/**
 * TASK-05 ｜ EN-N04 裂隙滋养体（supportAura）
 *
 * 行为可辨识点：6m 光环给友军 +20% 移速（由 manager 每帧重算），
 * 死亡分裂 2 只幼体（HP5 / 伤4，数值从 config 读，不硬编码）。
 */
import { normalEnemyDefinition } from '../domain/enemy.ts';
import { BEHAVIOR_EXTRA } from './behaviorParams.ts';
import { Enemy } from './enemy.ts';
import type { EnemyTickContext } from './types.ts';

export interface NourisherSplitSpec {
  readonly count: number;
  readonly hp: number;
  readonly damage: number;
}

export class NourisherEnemy extends Enemy {
  private auraRadiusM = 0;
  private allySpeedPct = 0;
  private split: NourisherSplitSpec = { count: 0, hp: 0, damage: 0 };

  protected onReset(): void {
    const behavior = normalEnemyDefinition('riftNourisher').behavior;
    if (behavior.kind !== 'supportAura') {
      throw new Error('[TASK-05] riftNourisher 的 behavior 应为 supportAura（契约已变更？）');
    }
    this.auraRadiusM = behavior.auraRadiusM;
    this.allySpeedPct = behavior.allySpeedPct;
    this.split = {
      count: behavior.onDeathSplit.count,
      hp: behavior.onDeathSplit.hp,
      damage: behavior.onDeathSplit.damage,
    };
    this.followRangeM = BEHAVIOR_EXTRA.nourisherFollowRangeM;
  }

  private followRangeM = 0;

  /** 光环半径（manager 每帧重算友军移速用） */
  get auraRadius(): number {
    return this.auraRadiusM;
  }
  get auraSpeedBonusPct(): number {
    return this.allySpeedPct;
  }
  get splitSpec(): NourisherSplitSpec {
    return this.split;
  }

  protected updateBehavior(ctx: EnemyTickContext, dt: number): void {
    const p = ctx.player.position;
    const d = this.distToPlayer(ctx);
    // 支援型：不贴脸，维持在中距跟随带
    if (d < this.followRangeM * 0.7) this.moveAwayFrom(p, dt);
    else if (d > this.followRangeM) this.moveToward(p, dt);
    if (this.inMeleeReach(ctx)) this.tryMeleeAttack(ctx);
  }
}
