/**
 * TASK-05 ｜ EN-N02 裂隙投射者（rangedKite）
 *
 * 行为可辨识点：8m 远程弹 + 风筝走位 —— 内沿撤退、外沿跟进、带内横移。
 * rangeM 从 domain 名册读取（config 的 8m），不硬编码。
 */
import { normalEnemyDefinition } from '../domain/enemy.ts';
import { BEHAVIOR_EXTRA } from './behaviorParams.ts';
import { Enemy } from './enemy.ts';
import type { EnemyTickContext } from './types.ts';

export class SpitterEnemy extends Enemy {
  private rangeM = 0;
  private strafeSign = 1;

  protected onReset(): void {
    const behavior = normalEnemyDefinition('riftSpitter').behavior;
    if (behavior.kind !== 'rangedKite') {
      throw new Error('[TASK-05] riftSpitter 的 behavior 应为 rangedKite（契约已变更？）');
    }
    this.rangeM = behavior.rangeM;
    this.strafeSign = 1;
  }

  protected updateBehavior(ctx: EnemyTickContext, dt: number): void {
    const p = ctx.player.position;
    const d = this.distToPlayer(ctx);
    const inner = this.rangeM * BEHAVIOR_EXTRA.kiteBandInnerRatio;

    if (d < inner) {
      this.moveAwayFrom(p, dt); // 玩家贴脸 → 拉开
    } else if (d > this.rangeM) {
      this.moveToward(p, dt); // 超出射程 → 跟进
    } else {
      // 交战带内：横向游走（不站桩），到边界换向
      const dx = p.x - this.position.x;
      const dz = p.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const target = {
        x: this.position.x + (-dz / len) * this.strafeSign * 10,
        y: 0,
        z: this.position.z + (dx / len) * this.strafeSign * 10,
      };
      this.moveToward(target, dt, BEHAVIOR_EXTRA.strafeSpeedPct);
      if (ctx.rng.next() < dt * 0.1) this.strafeSign *= -1; // 偶发换向，仍走注入 Rng
    }

    if (d <= this.rangeM && this.attackTimer <= 0) {
      const ux = d > 1e-6 ? (p.x - this.position.x) / d : 1;
      const uz = d > 1e-6 ? (p.z - this.position.z) / d : 0;
      ctx.projectiles.fire(
        this,
        this.position,
        ux,
        uz,
        BEHAVIOR_EXTRA.projectileSpeedMps,
        BEHAVIOR_EXTRA.projectileRadiusM,
        this.damage,
      );
      this.attackTimer = this.attackIntervalSec;
    }
  }
}
