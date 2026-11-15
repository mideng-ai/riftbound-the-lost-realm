/**
 * TASK-05 ｜ 失落森林场地（Arena）
 *
 * 单张固定地图：边界 + 圆形障碍 + 合法生成点网格标记 + 玩家安全生成。
 * 坐标使用 domain 契约的 Vec3（y=0 地面），渲染层负责换算 Babylon Vector3（L3）。
 * 全部随机走注入的 Rng（seed 可复现）。
 */

import {
  ARENA_HALF_SIZE_M,
  ARENA_OBSTACLES,
  PLAYER_SPAWN,
  SAFE_SPAWN,
  SPAWN_GRID,
} from './arenaConfig.ts';
import type { Rng, Vec3 } from '../domain/types.ts';

export interface SpawnPoint {
  readonly x: number;
  readonly z: number;
}

export function dist2D(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export class Arena {
  readonly halfSizeM = ARENA_HALF_SIZE_M;
  readonly obstacles = ARENA_OBSTACLES;
  /** 合法生成点标记（网格扫描 + 障碍/边界净空校验后的固定集合） */
  readonly spawnPoints: readonly SpawnPoint[];
  readonly playerSpawn: Vec3 = { x: PLAYER_SPAWN.x, y: 0, z: PLAYER_SPAWN.z };

  constructor() {
    this.spawnPoints = this.buildSpawnGrid();
  }

  private buildSpawnGrid(): SpawnPoint[] {
    const pts: SpawnPoint[] = [];
    const { stepM, clearanceM, borderClearanceM } = SPAWN_GRID;
    for (let x = -this.halfSizeM + borderClearanceM; x <= this.halfSizeM - borderClearanceM; x += stepM) {
      for (let z = -this.halfSizeM + borderClearanceM; z <= this.halfSizeM - borderClearanceM; z += stepM) {
        if (this.isPointClear(x, z, clearanceM)) {
          pts.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
        }
      }
    }
    return pts;
  }

  /** 点是否在边界内且不与障碍重叠（clearanceM = 侵入净空） */
  isPointClear(x: number, z: number, clearanceM: number): boolean {
    if (Math.abs(x) > this.halfSizeM - clearanceM || Math.abs(z) > this.halfSizeM - clearanceM) return false;
    for (const o of this.obstacles) {
      const dx = x - o.x;
      const dz = z - o.z;
      if (dx * dx + dz * dz < (o.radiusM + clearanceM) * (o.radiusM + clearanceM)) return false;
    }
    return true;
  }

  /**
   * 选一个合法生成点：
   * 1) 距玩家 ≥ minDistanceFromPlayerM（安全生成红线）
   * 2) 与既有敌人保持间隔（防叠怪）
   * 3) 无候选时兜底取「离玩家最远」的合法点
   * 返回 null 仅当场地退化（无任何合法点）。
   */
  pickSpawnPoint(
    rng: Rng,
    playerPos: Vec3,
    enemies: readonly { position: Vec3 }[],
    minDistanceFromPlayerM: number = SAFE_SPAWN.minDistanceFromPlayerM,
  ): SpawnPoint | null {
    const valid = this.spawnPoints.filter((p) => {
      if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < minDistanceFromPlayerM) return false;
      for (const e of enemies) {
        if (Math.hypot(p.x - e.position.x, p.z - e.position.z) < SAFE_SPAWN.minDistanceBetweenEnemiesM) return false;
      }
      return true;
    });
    if (valid.length > 0) return rng.pick(valid);
    // 兜底：最远点（保证仍不无预警近身）
    let best: SpawnPoint | null = null;
    let bestD = -1;
    for (const p of this.spawnPoints) {
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** 把位置夹回边界 + 推出障碍（原地改写，零分配） */
  clampPosition(pos: Vec3, radiusM: number): void {
    pos.x = Math.max(-this.halfSizeM + radiusM, Math.min(this.halfSizeM - radiusM, pos.x));
    pos.z = Math.max(-this.halfSizeM + radiusM, Math.min(this.halfSizeM - radiusM, pos.z));
    for (const o of this.obstacles) {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const min = o.radiusM + radiusM;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        pos.x = o.x + (dx / d) * min;
        pos.z = o.z + (dz / d) * min;
      }
    }
  }
}
