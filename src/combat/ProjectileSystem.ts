/**
 * TASK-02 逻辑投射物系统（渲染无关）。
 *
 * 与 src/vfx/Projectile.ts 的区别：这里只做「位置推进 + 扫掠命中 + 穿透计数」，
 * 不创建任何 Babylon Mesh；场景层订阅命中事件再播 VFX。
 * 弹速来自 config.staff.projectileSpeedMps（经 AttackRequest 传入），不硬编码。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import { segmentHitsCircleXZ } from './HitDetection.ts';
import type { PlanarPos } from './HitDetection.ts';
import type { EntityId, Vec3 } from '../domain/index.ts';
import type { AttackRequest } from '../weapons/types.ts';
import { staffProjectileAngles } from '../weapons/staffWeapon.ts';
import type { EnemyTarget } from './TargetRegistry.ts';

/** 一次命中事件（未结算；由 CombatRuntime 交给唯一伤害出口）。 */
export interface ProjectileHit {
  readonly target: EnemyTarget;
  readonly hitPos: Vec3;
  /** 该子弹此前已穿透的目标数（决定 ×0.7 衰减次数） */
  readonly pierceDepth: number;
}

export interface LogicalProjectile {
  readonly id: number;
  position: Vec3;
  dirX: number;
  dirZ: number;
  speedMps: number;
  /** 剩余可穿透目标数 */
  pierceLeft: number;
  readonly hitIds: Set<EntityId>;
  traveledM: number;
  alive: boolean;
}

export interface ProjectileSystemOptions {
  /** 分裂弹散开角（纯几何布局，config 未定义，非平衡数值） */
  readonly spreadDeg?: number;
  /**
   * 最大飞行距离（米）。
   * 原型假设：config 未定义法杖射程，默认按「弹速 × 2 秒」推导；
   * 该值是可注入参数，待设计确认射程后由场景传入，不写死在逻辑里。
   */
  readonly maxRangeM?: number;
}

export class ProjectileSystem {
  private readonly projectiles: LogicalProjectile[] = [];
  private nextId = 1;
  private readonly spreadDeg: number;
  private readonly maxRangeM: number | undefined;

  constructor(opts: ProjectileSystemOptions = {}) {
    this.spreadDeg = opts.spreadDeg ?? 0;
    this.maxRangeM = opts.maxRangeM;
  }

  get liveCount(): number {
    return this.projectiles.length;
  }

  /** 读取全部存活弹（调试可视化用，返回内部引用的浅拷贝）。 */
  all(): readonly LogicalProjectile[] {
    return this.projectiles.slice();
  }

  /** 按法杖攻击描述发射 N 发（N = layers.projectileCount，分裂弹 #1）。 */
  launchStaff(req: Extract<AttackRequest, { kind: 'staff' }>): number {
    const angles = staffProjectileAngles(req.projectileCount, this.spreadDeg);
    for (const offset of angles) {
      const rad = ((req.facingDeg + offset) * Math.PI) / 180;
      this.projectiles.push({
        id: this.nextId++,
        position: { ...req.origin },
        dirX: Math.cos(rad),
        dirZ: Math.sin(rad),
        speedMps: req.speedMps,
        pierceLeft: req.pierceTargets,
        hitIds: new Set<EntityId>(),
        traveledM: 0,
        alive: true,
      });
    }
    return angles.length;
  }

  /**
   * 推进一帧：按速度移动，用「上一帧位置 → 本帧位置」的线段做扫掠命中，
   * 避免 14 m/s 高速弹在低帧率下穿过目标。命中回调交给组合根结算。
   */
  step(dtSec: number, targets: readonly EnemyTarget[], onHit: (hit: ProjectileHit) => void): void {
    const stepM = dtSec;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const move = p.speedMps * stepM;
      const from: PlanarPos = { x: p.position.x, z: p.position.z };
      const to: PlanarPos = { x: from.x + p.dirX * move, z: from.z + p.dirZ * move };

      for (const target of targets) {
        if (!target.alive || p.hitIds.has(target.entityId)) continue;
        if (!segmentHitsCircleXZ(from, to, target.position, target.radiusM)) continue;
        p.hitIds.add(target.entityId);
        onHit({
          target,
          hitPos: { x: target.position.x, y: target.position.y, z: target.position.z },
          pierceDepth: p.hitIds.size - 1,
        });
        if (p.pierceLeft <= 0) {
          p.alive = false;
          break;
        }
        p.pierceLeft--;
      }

      p.position.x = to.x;
      p.position.z = to.z;
      p.traveledM += move;
      if (this.maxRangeM !== undefined && p.traveledM >= this.maxRangeM) p.alive = false;
      if (!p.alive) this.projectiles.splice(i, 1);
    }
  }

  clear(): void {
    this.projectiles.length = 0;
  }
}
