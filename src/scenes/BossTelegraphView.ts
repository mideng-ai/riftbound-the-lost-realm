/**
 * src/scenes/BossTelegraphView.ts — Boss 地面预警的程序化渲染（美术圣经 §4.1 / §4.3）。
 *
 * 【集成层渲染适配，不是玩法逻辑】几何数据 100% 来自 BossAgent.currentTelegraph /
 * activeZones（TelegraphShape），与 pointInTelegraph 判定共用同一 shape 对象：
 * 同圆心、同半径、同角度、同长宽 —— 画什么就判什么，不做第二份几何。
 *
 * 美术圣经 §4.1 配色（无贴图，纯几何体 + 自发光半透明）：
 *  - 危险红 #E0453A：circle / sector / rect / ring（AOE / 横扫 / 突刺 / 冲击波）
 *  - 中毒绿 #A3E635：multiSpot（腐化藤蔓持续区）
 *  - forestSummon 的 shape.kind === 'none' → 不画（契约：无预警无伤害）
 *
 * 顶点直接在 x/z 平面生成（atan2(z,x) 方位约定与 telegraph.ts 一致），
 * 完全不依赖 Babylon 的旋转顺序，杜绝「画出来的扇形与判定扇形差 90°」。
 */
import { Scene, Mesh, VertexData, StandardMaterial, Color3 } from '@babylonjs/core';
import type { TelegraphShape } from '../boss/index.ts';

const DANGER = Color3.FromHexString('#E0453A');
const POISON = Color3.FromHexString('#A3E635');
const TESSELLATION = 40;
const LIFT_Y = 0.03; // 抬离地面，避免 z-fighting（纯视觉，不参与判定）

export interface TelegraphViewSource {
  readonly currentTelegraph: { readonly shape: TelegraphShape; readonly timeLeftSec: number; readonly totalSec: number } | null;
  readonly activeZones: readonly { readonly shape: TelegraphShape }[];
}

interface DrawSpec {
  readonly sig: string;
  readonly color: Color3;
  readonly alpha: number;
}

interface DrawEntry {
  readonly mesh: Mesh;
  readonly mat: StandardMaterial;
  sig: string;
}

function circleVerts(center: { x: number; z: number }, radius: number): { positions: number[]; indices: number[] } {
  const positions = [center.x, 0, center.z];
  const indices: number[] = [];
  for (let i = 0; i <= TESSELLATION; i++) {
    const a = (i / TESSELLATION) * Math.PI * 2;
    positions.push(center.x + Math.cos(a) * radius, 0, center.z + Math.sin(a) * radius);
  }
  for (let i = 1; i <= TESSELLATION; i++) indices.push(0, i, i + 1);
  return { positions, indices };
}

function sectorVerts(
  origin: { x: number; z: number },
  facingRad: number,
  radius: number,
  halfAngleRad: number,
): { positions: number[]; indices: number[] } {
  const positions = [origin.x, 0, origin.z];
  const indices: number[] = [];
  for (let i = 0; i <= TESSELLATION; i++) {
    const a = facingRad - halfAngleRad + (2 * halfAngleRad * i) / TESSELLATION;
    positions.push(origin.x + Math.cos(a) * radius, 0, origin.z + Math.sin(a) * radius);
  }
  for (let i = 1; i <= TESSELLATION; i++) indices.push(0, i, i + 1);
  return { positions, indices };
}

function ringVerts(
  center: { x: number; z: number },
  inner: number,
  outer: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= TESSELLATION; i++) {
    const a = (i / TESSELLATION) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    positions.push(center.x + c * inner, 0, center.z + s * inner);
    positions.push(center.x + c * outer, 0, center.z + s * outer);
  }
  for (let i = 0; i < TESSELLATION; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { positions, indices };
}

function rectVerts(
  origin: { x: number; z: number },
  facingRad: number,
  length: number,
  width: number,
): { positions: number[]; indices: number[] } {
  const c = Math.cos(facingRad);
  const s = Math.sin(facingRad);
  // perpendicular = (-sin, cos) — 与 telegraph.ts rect 的 side = -dx*sin + dz*cos 完全same
  const px = -s * (width / 2);
  const pz = c * (width / 2);
  const fx = origin.x + c * length;
  const fz = origin.z + s * length;
  const positions = [
    origin.x, 0, origin.z,
    fx + px, 0, fz + pz,
    fx - px, 0, fz - pz,
  ];
  return { positions, indices: [0, 1, 2] };
}

/** shape → 顶点（唯一映射；none 返回 null 即不渲染）。 */
function shapeVerts(shape: TelegraphShape): { positions: number[]; indices: number[] } | null {
  switch (shape.kind) {
    case 'none':
      return null;
    case 'circle':
      return circleVerts(shape.center, shape.radiusM);
    case 'sector':
      return sectorVerts(shape.origin, shape.facingRad, shape.radiusM, shape.halfAngleRad);
    case 'ring':
      return ringVerts(shape.center, shape.innerRadiusM, shape.outerRadiusM);
    case 'rect':
      return rectVerts(shape.origin, shape.facingRad, shape.lengthM, shape.widthM);
    case 'multiSpot': {
      const positions: number[] = [];
      const indices: number[] = [];
      for (const spot of shape.spots) {
        const part = circleVerts(spot.center, spot.radiusM);
        const base = positions.length / 3;
        positions.push(...part.positions);
        for (const idx of part.indices) indices.push(base + idx);
      }
      return positions.length > 0 ? { positions, indices } : null;
    }
  }
}

export class BossTelegraphView {
  private readonly entries = new Map<string, DrawEntry>();

  constructor(
    private readonly scene: Scene,
    private readonly source: () => TelegraphViewSource,
  ) {}

  /** 每帧调用：按 shape 签名增量重建，避免每帧分配 Mesh / Material。 */
  update(): void {
    const src = this.source();
    const wanted = new Map<string, DrawSpec>();

    const tg = src.currentTelegraph;
    if (tg && tg.shape.kind !== 'none') {
      const left = tg.totalSec > 0 ? Math.max(0, Math.min(1, tg.timeLeftSec / tg.totalSec)) : 1;
      wanted.set('telegraph', {
        sig: tg.shape.kind + ':' + JSON.stringify(tg.shape),
        color: DANGER,
        // 描边随前摇收拢：越接近命中越亮（美术圣经 §4.3「贴花仅做时间可视化」）
        alpha: 0.28 + 0.22 * left,
      });
    }
    src.activeZones.forEach((zone, i) => {
      if (zone.shape.kind === 'none') return;
      wanted.set(`zone:${i}`, {
        sig: zone.shape.kind + ':' + JSON.stringify(zone.shape),
        color: POISON,
        alpha: 0.34,
      });
    });

    for (const [key, entry] of this.entries) {
      const spec = wanted.get(key);
      if (!spec || spec.sig !== entry.sig) {
        entry.mat.dispose();
        entry.mesh.dispose();
        this.entries.delete(key);
      }
    }

    for (const [key, spec] of wanted) {
      const existing = this.entries.get(key);
      if (existing) {
        existing.mat.alpha = spec.alpha;
        continue;
      }
      const shape = this.shapeOf(key, src);
      if (!shape) continue;
      const verts = shapeVerts(shape);
      if (!verts) continue;
      const mesh = new Mesh(`bossTelegraph_${key}`, this.scene);
      const vd = new VertexData();
      vd.positions = verts.positions;
      vd.indices = verts.indices;
      vd.applyToMesh(mesh);
      const mat = new StandardMaterial(`bossTelegraphMat_${key}`, this.scene);
      mat.diffuseColor = spec.color;
      mat.emissiveColor = spec.color;
      mat.specularColor = Color3.Black();
      mat.alpha = spec.alpha;
      mat.backFaceCulling = false;
      mat.disableLighting = true;
      mesh.material = mat;
      mesh.position.y = LIFT_Y;
      mesh.isPickable = false;
      this.entries.set(key, { mesh, mat, sig: spec.sig });
    }
  }

  private shapeOf(key: string, src: TelegraphViewSource): TelegraphShape | null {
    if (key === 'telegraph') return src.currentTelegraph?.shape ?? null;
    const idx = Number(key.slice('zone:'.length));
    return src.activeZones[idx]?.shape ?? null;
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.mat.dispose();
      entry.mesh.dispose();
    }
    this.entries.clear();
  }
}
