/**
 * TASK-05 ｜ EN-N03 影跃者（leapStrike）
 *
 * 行为可辨识点：8m 跃进贴身、CD 4s，且跃进前有可闪避的蓄力窗口。
 * leapRangeM / leapCdSec 从 domain 名册读取（config），不硬编码。
 */
import { normalEnemyDefinition } from '../domain/enemy.ts';
import { BEHAVIOR_EXTRA } from './behaviorParams.ts';
import { Enemy } from './enemy.ts';
import type { EnemyTickContext } from './types.ts';

type LeapState = 'idle' | 'windup' | 'airborne';

export class DasherEnemy extends Enemy {
  private leapRangeM = 0;
  private leapCdSec = 0;
  private leapCd = 0;
  private phase: LeapState = 'idle';
  private phaseTimer = 0;
  private dirX = 0;
  private dirZ = 0;

  protected onReset(): void {
    const behavior = normalEnemyDefinition('umbraDasher').behavior;
    if (behavior.kind !== 'leapStrike') {
      throw new Error('[TASK-05] umbraDasher 的 behavior 应为 leapStrike（契约已变更？）');
    }
    this.leapRangeM = behavior.leapRangeM;
    this.leapCdSec = behavior.leapCdSec;
    this.leapCd = 0;
    this.phase = 'idle';
    this.phaseTimer = 0;
    this.dirX = 0;
    this.dirZ = 0;
  }

  /** 供测试/UI 观察：是否处于可闪避的蓄力窗口 */
  get isTelegraphing(): boolean {
    return this.phase === 'windup';
  }

  protected updateBehavior(ctx: EnemyTickContext, dt: number): void {
    if (this.leapCd > 0) this.leapCd = Math.max(0, this.leapCd - dt);
    const p = ctx.player.position;
    const d = this.distToPlayer(ctx);

    if (this.phase === 'windup') {
      this.phaseTimer -= dt;
      // 蓄力期间锁定方向但原地不动 → 玩家有窗口闪避
      if (this.phaseTimer <= 0) {
        this.phase = 'airborne';
        this.phaseTimer = BEHAVIOR_EXTRA.leapDurationSec;
      }
      return;
    }

    if (this.phase === 'airborne') {
      const speed = this.leapRangeM / BEHAVIOR_EXTRA.leapDurationSec;
      // 跃进落点贴身即止：冲过玩家会让落地判定失效（且不符合「跃进贴身」语义）
      const d = this.distToPlayer(ctx);
      const stopAt = ctx.player.radiusM + this.radiusM + BEHAVIOR_EXTRA.meleeReachMarginM;
      const step = Math.min(speed * dt, Math.max(0, d - stopAt * 0.5));
      this.position.x += this.dirX * step;
      this.position.z += this.dirZ * step;
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'idle';
        if (this.inMeleeReach(ctx)) {
          ctx.damagePlayer(this.damage, this, 'leap');
          this.noteDamageDealt(this.damage);
        }
      }
      return;
    }

    if (
      d > BEHAVIOR_EXTRA.leapMinRangeM &&
      d <= this.leapRangeM &&
      this.leapCd <= 0
    ) {
      this.dirX = (p.x - this.position.x) / d;
      this.dirZ = (p.z - this.position.z) / d;
      this.phase = 'windup';
      this.phaseTimer = BEHAVIOR_EXTRA.leapWindupSec;
      this.leapCd = this.leapCdSec;
      return;
    }

    if (!this.inMeleeReach(ctx)) this.moveToward(p, dt);
    if (this.inMeleeReach(ctx)) this.tryMeleeAttack(ctx);
  }
}
