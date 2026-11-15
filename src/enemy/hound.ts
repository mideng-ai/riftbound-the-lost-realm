/**
 * TASK-05 ｜ EN-N01 裂隙猎犬（meleeChase）
 *
 * 行为可辨识点：群体包抄合围 —— 远距离直追，近距离按固定偏角绕侧翼切向逼近。
 * 数值全部来自 domain 名册；微参数（包抄角）来自 behaviorParams.ts。
 */
import type { Rng } from '../domain/types.ts';
import { BEHAVIOR_EXTRA } from './behaviorParams.ts';
import { Enemy } from './enemy.ts';
import type { EnemyTickContext } from './types.ts';

export class HoundEnemy extends Enemy {
  /** +1 / −1：左右包抄侧，spawn 时由 manager 用注入的 Rng 分配，保证同 seed 可复现 */
  private flankSide = 1;
  private flankAssigned = false;

  protected onReset(): void {
    this.flankSide = 1;
    this.flankAssigned = false;
  }

  assignFlank(rng: Rng): void {
    this.flankSide = rng.next() < 0.5 ? -1 : 1;
    this.flankAssigned = true;
  }

  protected updateBehavior(ctx: EnemyTickContext, dt: number): void {
    if (!this.flankAssigned) this.assignFlank(ctx.rng);

    const p = ctx.player.position;
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    const d = Math.hypot(dx, dz);
    const reach = ctx.player.radiusM + this.radiusM + BEHAVIOR_EXTRA.meleeReachMarginM;

    if (d > reach * 6) {
      // 远距离：直接追击（径向分量最大，快速进入交战）
      this.moveToward(p, dt);
    } else {
      // 近距：绕到玩家侧翼而非直线撞脸（群体包抄）
      const ux = d > 1e-6 ? dx / d : 1;
      const uz = d > 1e-6 ? dz / d : 0;
      const a = (BEHAVIOR_EXTRA.flankAngleDeg * Math.PI * this.flankSide) / 180;
      const rx = ux * Math.cos(a) - uz * Math.sin(a);
      const rz = ux * Math.sin(a) + uz * Math.cos(a);
      const target = { x: p.x - rx * reach, y: 0, z: p.z - rz * reach };
      this.moveToward(target, dt);
    }

    if (this.inMeleeReach(ctx)) this.tryMeleeAttack(ctx);
  }
}
