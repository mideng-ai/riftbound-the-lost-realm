/**
 * ST2-003-F — Performance baseline scenario (D-210 evidence).
 * Reproducible ladder benchmark: N placeholder entities + spell-VFX particles.
 * NOT gameplay. Results go to HUD + console for evidence capture.
 *
 * ?run=ladder  → auto-run levels 0/25/50/100/200 entities, 10s sampling each
 * ?run=fixed&n=100 → hold one level (for manual/device runs)
 */
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  Color4 as C4,
  ArcRotateCamera,
  HemisphericLight,
  PointLight,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  ParticleSystem,
  InstancedMesh,
} from '@babylonjs/core';

const params = new URLSearchParams(location.search);
const run = params.get('run') ?? 'fixed';
const fixedN = Number(params.get('n') ?? '50');
const hud = document.getElementById('hud')!;
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

// ---- engine & scene ----------------------------------------------------------
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.051, 0.071, 1);

const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.0, 18, new Vector3(0, 0, 0), scene);
camera.attachControl(canvas, true);
new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene).intensity = 0.6;
const dl = new PointLight('dl', new Vector3(-6, 10, 6), scene);
dl.intensity = 0.6; dl.diffuse = new Color3(1, 0.95, 0.85);

const ground = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene);
const gm = new StandardMaterial('gm', scene);
gm.diffuseColor = new Color3(0.09, 0.11, 0.14);
gm.specularColor = Color3.Black();
ground.material = gm;

// player placeholder
const player = MeshBuilder.CreateSphere('player', { diameter: 0.7, segments: 12 }, scene);
player.position.y = 0.4;
const pm = new StandardMaterial('pm', scene);
pm.diffuseColor = new Color3(0.3, 0.7, 0.9);
player.material = pm;

// entity master mesh (instanced)
const boxProto = MeshBuilder.CreateBox('entProto', { size: 0.6 }, scene);
const em = new StandardMaterial('em', scene);
em.diffuseColor = new Color3(0.55, 0.42, 0.3);
boxProto.material = em;
boxProto.isVisible = false;
const entities: InstancedMesh[] = [];
function setEntityCount(n: number) {
  while (entities.length < n) {
    const inst = boxProto.createInstance('ent' + entities.length);
    const ring = Math.floor(entities.length / 25) + 1;
    const a = (entities.length % 25) / 25 * Math.PI * 2;
    inst.position.set(Math.cos(a) * ring * 2.2, 0.3, Math.sin(a) * ring * 2.2);
    entities.push(inst);
  }
  for (let i = 0; i < entities.length; i++) entities[i].setEnabled(i < n);
}
setEntityCount(0);

// spell VFX: one continuous particle system (S2-C lightweight path style)
function radialTex(): DynamicTexture {
  const dt = new DynamicTexture('spark', { width: 64, height: 64 }, scene, false);
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  dt.update(); dt.hasAlpha = true;
  return dt;
}
const spark = radialTex();
const vfx = new ParticleSystem('vfx', 2000, scene);
vfx.particleTexture = spark;
vfx.emitter = player;
vfx.color1 = new C4(0.5, 0.9, 1, 0.9);
vfx.color2 = new C4(0.3, 0.6, 0.9, 0.6);
vfx.colorDead = new C4(0.1, 0.15, 0.3, 0);
vfx.minSize = 0.06; vfx.maxSize = 0.18;
vfx.minLifeTime = 0.4; vfx.maxLifeTime = 0.9;
vfx.emitRate = 0; // ramped with entity count
vfx.blendMode = ParticleSystem.BLENDMODE_ADD;
vfx.direction1 = new Vector3(-0.5, 0.5, -0.5);
vfx.direction2 = new Vector3(0.5, 1.5, 0.5);
vfx.gravity = new Vector3(0, -1.5, 0);
vfx.start();

// ---- slow rotation animation (per-entity CPU cost) -----------------------------
scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  for (const e of entities) {
    if (!e.isEnabled()) continue;
    e.rotation.y += dt * 0.5;
  }
});

// ---- frame sampling -------------------------------------------------------------
const frameDts: number[] = [];
let firstFrameMs = -1;
let tStart = performance.now();
scene.onBeforeRenderObservable.add(() => {
  const d = engine.getDeltaTime();
  if (firstFrameMs < 0) {
    firstFrameMs = performance.now() - tStart;
    console.log(`[load] first-render ${firstFrameMs.toFixed(0)}ms after scene script start`);
  }
  frameDts.push(d);
});
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
function heap(): string {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return m ? `${(m.usedJSHeapSize / 1048576).toFixed(0)}MB used / ${(m.jsHeapSizeLimit / 1048576).toFixed(0)}MB limit` : 'n/a (performance.memory unavailable)';
}

const ladder = [0, 25, 50, 100, 200];
const results: string[] = [];
let levelIdx = -1;
let sampleStart = 0;
const SAMPLE_MS = 8000;

function startLevel(i: number) {
  levelIdx = i;
  const n = run === 'ladder' ? ladder[i] : fixedN;
  setEntityCount(n);
  vfx.emitRate = n === 0 ? 60 : 60 + n * 2;
  frameDts.length = 0;
  sampleStart = performance.now();
  console.log(`[level] start n=${n} emitRate=${vfx.emitRate} entities=${entities.filter(e => e.isEnabled()).length}`);
}

function finishLevel() {
  const n = run === 'ladder' ? ladder[levelIdx] : fixedN;
  const p50 = percentile(frameDts, 0.5);
  const p95 = percentile(frameDts, 0.95);
  const mean = frameDts.reduce((a, b) => a + b, 0) / Math.max(1, frameDts.length);
  const fps = 1000 / mean;
  const active = scene.getActiveMeshes().length;
  const tris = Math.round(scene.getActiveIndices() / 3);
  const line = `[result] n=${n} frames=${frameDts.length} fps=${fps.toFixed(1)} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms activeMeshes=${active} tris=${tris} heap=${heap()}`;
  console.log(line);
  results.push(line);
}

if (run === 'ladder') {
  startLevel(0);
  const ladderTimer = setInterval(() => {
    if (performance.now() - sampleStart >= SAMPLE_MS) {
      finishLevel();
      if (levelIdx + 1 < ladder.length) startLevel(levelIdx + 1);
      else clearInterval(ladderTimer); // ladder complete
    }
  }, 500);
} else {
  startLevel(0);
}

// ---- HUD -------------------------------------------------------------------------
setInterval(() => {
  const n = run === 'ladder' ? ladder[levelIdx] : fixedN;
  const recent = frameDts.slice(-120);
  const fps = 1000 / (recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length));
  hud.textContent = [
    `ST2-003-F perf baseline | run=${run} level n=${n} | t=${((performance.now() - tStart) / 1000).toFixed(0)}s`,
    `fps(now,120f)=${fps.toFixed(1)}  activeMeshes=${scene.getActiveMeshes().length}  tris=${Math.round(scene.getActiveIndices() / 3)}  emitRate=${vfx.emitRate}`,
    `frame p50=${percentile(frameDts, 0.5).toFixed(1)}ms p95=${percentile(frameDts, 0.95).toFixed(1)}ms`,
    `heap=${heap()}  firstRender=${firstFrameMs < 0 ? '…' : firstFrameMs.toFixed(0) + 'ms'}`,
    '',
    ...results,
  ].join('\n');
}, 400);

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
console.log('[st2-003-f] perf baseline started', { run, fixedN });
