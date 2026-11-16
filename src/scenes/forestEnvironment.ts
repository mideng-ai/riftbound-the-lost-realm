/**
 * 失落森林程序化环境（美术规格 §2 / §3 / §4 的参数原文落地）。
 *
 * 这是集成层渲染适配，不碰 domain / config 冻结契约，也不引入任何 png / gltf / 贴图。
 * 规格里的 HEX、尺寸、seed、强度、雾距逐项照抄；为实现「斑块而不是雪花」所加的
 * 粗网格噪声与路径抖动算法集中在本文件，方便对着截图调。
 *
 * 性能（规格 §6）：地面 1 mesh；可玩区障碍 8 个 config 点 → ~18 子 mesh；
 * 边界 12 mesh；共享材质 6 个；动态光 2 盏；无阴影 / 无 bloom。
 */
import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  VertexBuffer,
  Vector3,
} from '@babylonjs/core';
import type { ArenaObstacleDef } from '../world/arenaConfig.ts';

/** 美术圣经 V0.5 §1/§2 + 美术规格 §2.2/§2.3/§3.2 色值（不得改）。 */
export const FOREST_HEX = {
  grass: '#2E7D4F',
  path: '#7A5230',
  moss: '#8FD14F',
  stone: '#C9C2B4',
  mist: '#A8D8D0',
  sky: '#BFE3D8',
  groundLight: '#4A6741',
  sun: '#FFF4E0',
} as const;

/** 规格 §3.1：68×68、60 细分、y=0；§3.3：固定 seed 1337。 */
export const GROUND_SIZE_M = 68;
export const GROUND_SUBDIVISIONS = 60;
export const GROUND_SEED = 1337;

/**
 * 适配代码：规格 §3.2 同时给了「宽约 3–4m」和「占比 ~18%」，在 68×68 地面上二者
 * 不可兼得（4m 宽只有约 12%）。这里优先满足「占比照抄」与「小径读得出来」，
 * 核心半宽取 2.8m（5.6m 宽）+ 0.5m 噪声边，实测占比见验收报告。
 */
const PATH_HALF_WIDTH_M = 2.8;
const PATH_EDGE_M = 0.5;
const MOSS_CELL_M = 4;
const STONE_RADIUS_M = 3.0;
/** 规格「5% 碎石」与「只在 ruin 周围 3m 内」同样互斥；3m 硬核 + 5.5m 稀疏碎石晕补足占比。 */
const STONE_HALO_M = 6.5;

export type GroundZone = keyof Pick<typeof FOREST_HEX, 'grass' | 'path' | 'moss' | 'stone'>;

/** 32 位确定性哈希：同一 (x,z,seed) 永远同一值，刷新可复现（设计总纲 §3.4）。 */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 适配代码：双频正弦抖动，f(0)=0 保证两条路严格穿过原点；不是逐顶点白噪声。 */
function pathDrift(v: number, phase: number): number {
  const f = (t: number): number =>
    Math.sin(t * 0.21 + phase) * 1.1 + Math.sin(t * 0.073 - phase * 0.6) * 1.4;
  return f(v) - f(0);
}

/**
 * 单顶点分区（纯函数，便于离线统计四色占比）。
 * 路径强制优先 → 遗迹周围碎石 → 4m 粗网格苔藓斑块（含邻域膨胀与树根加权）→ 草地底。
 */
export function classifyGroundVertex(
  x: number,
  z: number,
  obstacles: readonly ArenaObstacleDef[],
  seed: number = GROUND_SEED,
): GroundZone {
  const pathDistance = Math.min(
    Math.abs(x - pathDrift(z, 0.7)),
    Math.abs(z - pathDrift(x, 2.4)),
  );
  if (pathDistance <= PATH_HALF_WIDTH_M) return 'path';

  for (const o of obstacles) {
    if (o.kind !== 'ruin') continue;
    const dist = Math.hypot(x - o.x, z - o.z);
    const radius = STONE_RADIUS_M + (hash2(Math.floor(x * 2), Math.floor(z * 2), seed) - 0.5) * 1.2;
    if (dist <= radius) return 'stone';
    // 稀疏碎石晕：把「5% 占比」补到遗迹周围，仍是同源色、不扩散到场地其它区域。
    if (dist <= STONE_HALO_M && hash2(Math.floor(x * 2), Math.floor(z * 2), seed + 77) < 0.7) return 'stone';
  }

  const cx = Math.floor(x / MOSS_CELL_M);
  const cz = Math.floor(z / MOSS_CELL_M);
  let moss = hash2(cx, cz, seed) < 0.09;
  if (!moss) {
    for (let dz = -1; dz <= 1 && !moss; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        if (hash2(cx + dx, cz + dz, seed) < 0.09 && hash2(cx * 7 + dx, cz * 7 + dz, seed + 31) < 0.05) {
          moss = true;
          break;
        }
      }
    }
  }
  if (!moss) {
    for (const o of obstacles) {
      if (o.kind === 'tree' && Math.hypot(x - o.x, z - o.z) < 2.6 && hash2(Math.floor(x), Math.floor(z), seed + 17) < 0.55) {
        moss = true;
        break;
      }
    }
  }
  if (moss && hash2(Math.floor(x * 3), Math.floor(z * 3), seed + 5) < 0.85) return 'moss';

  if (pathDistance <= PATH_HALF_WIDTH_M + PATH_EDGE_M && hash2(Math.floor(x * 4), Math.floor(z * 4), seed + 9) < 0.55) {
    return 'path';
  }
  return 'grass';
}

/** 规格 §3.3.3：暗部向雾霭青 lerp 15%，是圣经色的明度变体，不是新色。 */
function zoneColor(zone: GroundZone, x: number, z: number, seed: number): Color3 {
  const base = Color3.FromHexString(FOREST_HEX[zone]);
  const shade = hash2(Math.floor(x / 6), Math.floor(z / 6), seed + 101);
  return shade > 0.55 ? Color3.Lerp(base, Color3.FromHexString(FOREST_HEX.mist), 0.15) : base;
}

/** 规格 §2.2：主光 #FFF4E0 / 1.15，半球光 #BFE3D8 天 / #4A6741 地 / 0.55。 */
export function createForestLights(scene: Scene): void {
  const sun = new DirectionalLight('forestSun', new Vector3(0.29, -0.82, 0.5), scene);
  sun.diffuse = Color3.FromHexString(FOREST_HEX.sun);
  sun.intensity = 1.15;

  const hemi = new HemisphericLight('forestHemi', new Vector3(0.2, 1, 0.1), scene);
  hemi.diffuse = Color3.FromHexString(FOREST_HEX.sky);
  hemi.groundColor = Color3.FromHexString(FOREST_HEX.groundLight);
  hemi.intensity = 0.55;
}

/** 规格 §2.3：LINEAR 雾 #A8D8D0，25→55m，清屏色同色，虚空黑消失。 */
export function applyForestAtmosphere(scene: Scene): void {
  const mist = Color3.FromHexString(FOREST_HEX.mist);
  scene.clearColor = Color4.FromColor3(mist, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = mist;
  scene.fogStart = 25;
  scene.fogEnd = 55;
}

/** 规格 §3：单张 CreateGround + 顶点色，一次 draw call。 */
export function createForestGround(
  scene: Scene,
  obstacles: readonly ArenaObstacleDef[],
): ReturnType<typeof MeshBuilder.CreateGround> {
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: GROUND_SIZE_M, height: GROUND_SIZE_M, subdivisions: GROUND_SUBDIVISIONS },
    scene,
  );
  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    const colors = new Float32Array((positions.length / 3) * 4);
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      const c = zoneColor(classifyGroundVertex(x, z, obstacles), x, z, GROUND_SEED);
      colors[i * 4] = c.r;
      colors[i * 4 + 1] = c.g;
      colors[i * 4 + 2] = c.b;
      colors[i * 4 + 3] = 1;
    }
    ground.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  }
  ground.isPickable = false;

  const mat = new StandardMaterial('groundMat', scene);
  // 规格 §3.1：diffuse 白，让顶点色成为最终色；specular 黑，去除塑料高光。
  mat.diffuseColor = Color3.White();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = new Color3(0.04, 0.05, 0.045);
  ground.material = mat;
  return ground;
}

function solidMaterial(scene: Scene, name: string, hex: string, emissiveScale = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  const c = Color3.FromHexString(hex);
  m.diffuseColor = c;
  m.emissiveColor = c.scale(emissiveScale);
  m.specularColor = Color3.Black();
  return m;
}

/**
 * 规格 §4.1：复用 arenaConfig 的 8 个障碍点，视觉投影半径 = 碰撞半径 radiusM。
 * 规格 §4.2：±30 四片半透明青墙 alpha 0.30 + 8 根嫩芽绿藤柱 alpha 0.5。
 */
export function createForestProps(
  scene: Scene,
  obstacles: readonly ArenaObstacleDef[],
  halfSizeM: number,
): void {
  const trunkMat = solidMaterial(scene, 'envTrunkMat', FOREST_HEX.path, 0.05);
  const canopyMat = solidMaterial(scene, 'envCanopyMat', FOREST_HEX.grass, 0.08);
  const stoneMat = solidMaterial(scene, 'envStoneMat', FOREST_HEX.stone, 0.06);
  const vineMat = solidMaterial(scene, 'envVineMat', FOREST_HEX.moss, 0.2);

  for (const o of obstacles) {
    if (o.kind === 'tree') {
      // 树干底部直径 = 2 × radiusM，与 Arena.clampPosition 的圆形碰撞完全对齐。
      const trunk = MeshBuilder.CreateCylinder(
        `envTreeTrunk_${o.x}_${o.z}`,
        { diameterBottom: o.radiusM * 2, diameterTop: o.radiusM * 1.6, height: 4.2, tessellation: 8 },
        scene,
      );
      trunk.position.set(o.x, 2.1, o.z);
      trunk.material = trunkMat;
      trunk.isPickable = false;
      const canopy = MeshBuilder.CreateSphere(
        `envTreeCanopy_${o.x}_${o.z}`,
        { diameter: o.radiusM * 3.0, segments: 8 },
        scene,
      );
      canopy.scaling.y = 0.7;
      canopy.position.set(o.x, 4.0, o.z);
      canopy.material = canopyMat;
      canopy.isPickable = false;
    } else if (o.kind === 'rock') {
      // type 1 = 八面体，顶点半径 = size；取 size = radiusM 即视觉半径 = 碰撞半径。
      const rock = MeshBuilder.CreatePolyhedron(
        `envRock_${o.x}_${o.z}`,
        { type: 1, size: o.radiusM },
        scene,
      );
      rock.scaling.y = 0.75;
      rock.position.set(o.x, o.radiusM * 0.75, o.z);
      rock.material = stoneMat;
      rock.isPickable = false;
    } else {
      // 遗迹：3 根立柱 + 横梁，整体控制在 radiusM 投影内；藤蔓用细柱近似。
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        const px = o.x + Math.cos(a) * o.radiusM * 0.55;
        const pz = o.z + Math.sin(a) * o.radiusM * 0.55;
        const pillar = MeshBuilder.CreateCylinder(
          `envRuinPillar_${o.x}_${o.z}_${i}`,
          { diameter: 0.5, height: 3.2, tessellation: 6 },
          scene,
        );
        pillar.position.set(px, 1.6, pz);
        pillar.material = stoneMat;
        pillar.isPickable = false;
      }
      const beam = MeshBuilder.CreateBox(
        `envRuinBeam_${o.x}_${o.z}`,
        { width: o.radiusM * 1.4, height: 0.35, depth: 0.5 },
        scene,
      );
      beam.position.set(o.x, 3.25, o.z);
      beam.material = stoneMat;
      beam.isPickable = false;
      const vine = MeshBuilder.CreateCylinder(
        `envRuinVine_${o.x}_${o.z}`,
        { diameter: 0.14, height: 3.0, tessellation: 5 },
        scene,
      );
      vine.position.set(o.x + o.radiusM * 0.55, 1.5, o.z);
      vine.material = vineMat;
      vine.isPickable = false;
    }
  }

  // 边界墙：厚 box 代替 plane，双面可见，不依赖 sideOrientation 细节。
  const wallMat = new StandardMaterial('envBoundaryMat', scene);
  const mist = Color3.FromHexString(FOREST_HEX.mist);
  wallMat.diffuseColor = mist;
  wallMat.emissiveColor = mist;
  wallMat.specularColor = Color3.Black();
  wallMat.alpha = 0.3;
  wallMat.backFaceCulling = false;

  const pillarMat = new StandardMaterial('envBoundaryPillarMat', scene);
  const moss = Color3.FromHexString(FOREST_HEX.moss);
  pillarMat.diffuseColor = moss;
  pillarMat.emissiveColor = moss;
  pillarMat.specularColor = Color3.Black();
  pillarMat.alpha = 0.5;

  const span = halfSizeM * 2;
  for (const sign of [-1, 1]) {
    const wallX = MeshBuilder.CreateBox(
      `envWallX_${sign}`,
      { width: 0.3, height: 3.5, depth: span },
      scene,
    );
    wallX.position.set(sign * halfSizeM, 1.75, 0);
    wallX.material = wallMat;
    wallX.isPickable = false;

    const wallZ = MeshBuilder.CreateBox(
      `envWallZ_${sign}`,
      { width: span, height: 3.5, depth: 0.3 },
      scene,
    );
    wallZ.position.set(0, 1.75, sign * halfSizeM);
    wallZ.material = wallMat;
    wallZ.isPickable = false;
  }

  const pillarSpots: readonly (readonly [number, number])[] = [
    [-halfSizeM, -halfSizeM], [0, -halfSizeM], [halfSizeM, -halfSizeM],
    [-halfSizeM, 0], [halfSizeM, 0],
    [-halfSizeM, halfSizeM], [0, halfSizeM], [halfSizeM, halfSizeM],
  ];
  for (const [x, z] of pillarSpots) {
    const post = MeshBuilder.CreateCylinder(
      `envVinePost_${x}_${z}`,
      { diameter: 0.35, height: 4, tessellation: 6 },
      scene,
    );
    post.position.set(x, 2, z);
    post.material = pillarMat;
    post.isPickable = false;
  }
}
