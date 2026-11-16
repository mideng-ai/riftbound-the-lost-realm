/**
 * src/boss/telegraph.ts — 地面预警 / 碰撞判定的【唯一】几何实现（TASK-06）
 *
 * 红线（设计总纲 §7.5 / 美术圣经 §4.3）：预警贴花几何 = 碰撞判定几何，
 * 同尺寸、同角度、同圆心。结构性保证：本文件是全工程唯一 shape → 命中入口，
 * 渲染层画贴花与战斗层做碰撞都必须调用 pointInTelegraph —— 不允许第二份几何。
 *
 * 形状语言对齐 美术-美术圣经V0.5.md §4.1：
 *   circle 实心圆(AOE) / sector 扇形120° / rect 长条矩形 / ring 环形 /
 *   multiSpot 多个持续危险区 / none 无预警（森林召唤）。
 * ⚠ 六边形持续区（美术圣经）：设计总纲 §7.4 只写「多个地面区域」，
 *   本实现统一用圆形区域，渲染层必须按同一圆绘制，不得改画六边形造成判定欺骗。
 */
import type { Vec3 } from '../domain/index.ts';

/** 地面形状数据（预警与碰撞共用同一对象）。y 恒为地面高度，判定只用 x/z。 */
export type TelegraphShape =
  | { readonly kind: 'none' }
  | { readonly kind: 'circle'; readonly center: Vec3; readonly radiusM: number }
  | {
      readonly kind: 'sector';
      readonly origin: Vec3;
      readonly facingRad: number;
      readonly radiusM: number;
      readonly halfAngleRad: number;
    }
  | {
      readonly kind: 'ring';
      readonly center: Vec3;
      readonly innerRadiusM: number;
      readonly outerRadiusM: number;
    }
  | {
      readonly kind: 'rect';
      readonly origin: Vec3;
      readonly facingRad: number;
      readonly lengthM: number;
      readonly widthM: number;
    }
  | {
      readonly kind: 'multiSpot';
      readonly spots: readonly { readonly center: Vec3; readonly radiusM: number }[];
    };

function dist2(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/** 角度差归一化到 [0, π]。 */
function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** 从 from 指向 to 的方位角（XZ 平面，0 = +X）。 */
export function headingRad(from: Vec3, to: Vec3): number {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

/** 点 p 是否落在预警形状内（边界内含：站在边缘算被命中，提示对玩家严格）。 */
export function pointInTelegraph(shape: TelegraphShape, p: Vec3): boolean {
  switch (shape.kind) {
    case 'none':
      return false;
    case 'circle':
      return dist2(p, shape.center) <= shape.radiusM * shape.radiusM;
    case 'sector': {
      if (dist2(p, shape.origin) > shape.radiusM * shape.radiusM) return false;
      return angleDiff(headingRad(shape.origin, p), shape.facingRad) <= shape.halfAngleRad;
    }
    case 'ring': {
      const d2 = dist2(p, shape.center);
      return d2 >= shape.innerRadiusM * shape.innerRadiusM && d2 <= shape.outerRadiusM * shape.outerRadiusM;
    }
    case 'rect': {
      const dx = p.x - shape.origin.x;
      const dz = p.z - shape.origin.z;
      const cos = Math.cos(shape.facingRad);
      const sin = Math.sin(shape.facingRad);
      const along = dx * cos + dz * sin;
      const side = -dx * sin + dz * cos;
      return along >= 0 && along <= shape.lengthM && Math.abs(side) <= shape.widthM / 2;
    }
    case 'multiSpot':
      return shape.spots.some((s) => dist2(p, s.center) <= s.radiusM * s.radiusM);
  }
}

/** 形状内任取一点（测试与调试用的命中点；nightly 不依赖玩家站位）。 */
export function somePointInside(shape: TelegraphShape): Vec3 {
  switch (shape.kind) {
    case 'none':
      return { x: Number.NaN, y: 0, z: Number.NaN }; // none 无命中点，调用方须先判 kind
    case 'circle':
      return { ...shape.center };
    case 'sector':
      return {
        x: shape.origin.x + Math.cos(shape.facingRad) * (shape.radiusM / 2),
        y: 0,
        z: shape.origin.z + Math.sin(shape.facingRad) * (shape.radiusM / 2),
      };
    case 'ring':
      return {
        x: shape.center.x + (shape.innerRadiusM + shape.outerRadiusM) / 2,
        y: 0,
        z: shape.center.z,
      };
    case 'rect':
      return {
        x: shape.origin.x + Math.cos(shape.facingRad) * (shape.lengthM / 2),
        y: 0,
        z: shape.origin.z + Math.sin(shape.facingRad) * (shape.lengthM / 2),
      };
    case 'multiSpot': {
      const first = shape.spots[0];
      return first ? { ...first.center } : { x: Number.NaN, y: 0, z: Number.NaN };
    }
  }
}
