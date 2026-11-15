/**
 * TASK-02 命中几何 —— 纯函数、无状态、零依赖（连 domain 都不引，只吃普通坐标）。
 *
 * 俯视角平面 = 世界 x/z；y 是地面接触高度，不参与判定。
 * 单独成文件是为了把「正 60° / 2.5m 整」这类边界钉死在单测里。
 * 本文件禁止 import Babylon / DOM。
 */

/** 平面点（只用 x/z，保留 y 便于直接传 domain.Vec3）。 */
export interface PlanarPos {
  readonly x: number;
  readonly z: number;
}

/** 最短角差（度），结果 ∈ (-180, 180]。 */
export function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  let d = (toDeg - fromDeg) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** 点到线段的最短距离（x/z 平面），用于高速投射物扫掠判定，避免穿模。 */
export function pointSegmentDistanceXZ(point: PlanarPos, a: PlanarPos, b: PlanarPos): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apz = point.z - a.z;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-12) return Math.hypot(apx, apz);
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / lenSq));
  return Math.hypot(point.x - (a.x + abx * t), point.z - (a.z + abz * t));
}

/** 线段扫掠 × 圆。 */
export function segmentHitsCircleXZ(from: PlanarPos, to: PlanarPos, center: PlanarPos, radius: number): boolean {
  return pointSegmentDistanceXZ(center, from, to) <= radius;
}

/**
 * 扇形 × 圆（魔法剑）。
 *
 * 判定式：距离 ≤ 半径 + 目标半径，且「夹角 ≤ 半角 + 目标张角」。
 * 目标张角 `asin(r/d)` 不能省：贴着扇形边缘、半个身子在范围内的怪若判不中，
 * 玩家会认为判定缩水（验收要求「攻击范围可通过测试验证」）。
 *
 * @param facingDeg 朝向角（0 = +X，俯视 x/z 平面）
 * @param arcAngleDeg 扇形总张角（config 120°，可被 #10 扩到 ≤240°）
 */
export function sectorHitsCircle(
  origin: PlanarPos,
  facingDeg: number,
  arcAngleDeg: number,
  radiusM: number,
  targetPos: PlanarPos,
  targetRadius: number,
): boolean {
  const dx = targetPos.x - origin.x;
  const dz = targetPos.z - origin.z;
  const dist = Math.hypot(dx, dz);

  if (dist > radiusM + targetRadius) return false;
  // 目标与原点重合（或完全包住原点）：无条件命中
  if (dist <= Math.max(targetRadius, 1e-6)) return true;

  const angleToTarget = (Math.atan2(dz, dx) * 180) / Math.PI;
  const delta = Math.abs(shortestAngleDeltaDeg(facingDeg, angleToTarget));
  const angularRadius = (Math.asin(Math.min(1, targetRadius / dist)) * 180) / Math.PI;

  return delta <= arcAngleDeg / 2 + angularRadius;
}

/** 命中集合去重：一次挥砍 / 一发子弹对同一目标只结算一次。 */
export function hasHit(hitIds: ReadonlySet<number>, targetId: number): boolean {
  return hitIds.has(targetId);
}
