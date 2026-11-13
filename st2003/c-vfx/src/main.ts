/**
 * ST2-003-C — Spell VFX Spike (isolated; not production gameplay)
 *
 * Goals (per docs/STAGE2_MASTER_EXECUTION_PLAN.md §3):
 *  1. Minimal projectile lifecycle: launch → flight → hit/dispose.
 *  2. Hit feedback: flash billboard + particles (+ richer extras).
 *  3. Lightweight (L) vs richer (R) path comparison with counts.
 *  4. Resource release / pooling evidence (stress + micro-benchmark).
 *  5. Runs in browser; HUD + console logging for evidence capture.
 *
 * NOT production gameplay: no damage, cooldowns, skill UI or audio.
 */
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  ArcRotateCamera,
  HemisphericLight,
  PointLight,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  DynamicTexture,
  ParticleSystem,
  GlowLayer,
} from '@babylonjs/core';

const params = new URLSearchParams(location.search);
const mode = (params.get('mode') ?? 'both') as 'L' | 'R' | 'both';
const stressN = Number(params.get('stress') ?? '0');
const leak = params.get('leak') === '1';
const bench = params.get('bench') === '1';

const hud = document.getElementById('hud')!;
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.051, 0.071, 1);

// ---- camera & lights -------------------------------------------------------
const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.08, 13, new Vector3(0, 0.8, -1.5), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 6;
camera.upperRadiusLimit = 25;
// exposed for evidence harness only (camera framing during screenshots)
(window as unknown as Record<string, unknown>).__cam = camera;

new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene).intensity = 0.55;
const dir = new PointLight('dir', new Vector3(-4, 8, 4), scene);
dir.intensity = 0.7;
dir.diffuse = new Color3(1, 0.95, 0.85);

// Shared flash light for R-path hits (single instance avoids per-hit shader
// recompilation: adding a NEW light per hit forces StandardMaterial to
// recompile with more light uniforms — a measurable hitch we deliberately
// avoid; this trade-off is recorded in README).
const hitLight = new PointLight('hitLight', new Vector3(0, 1.2, -3), scene);
hitLight.intensity = 0;
hitLight.diffuse = new Color3(0.5, 0.9, 1);

// Richer path only: glow layer
const glow = new GlowLayer('glow', scene, { mainTextureSamples: 2 });
glow.intensity = 0.7;

// ---- static set ------------------------------------------------------------
const ground = MeshBuilder.CreateGround('ground', { width: 24, height: 24 }, scene);
const groundMat = new StandardMaterial('groundMat', scene);
groundMat.diffuseColor = new Color3(0.09, 0.11, 0.14);
groundMat.specularColor = Color3.Black();
ground.material = groundMat;

// target dummy
const dummy = MeshBuilder.CreateBox('dummy', { size: 0.9 }, scene);
dummy.position = new Vector3(0, 0.45, -3);
const dummyMat = new StandardMaterial('dummyMat', scene);
dummyMat.diffuseColor = new Color3(0.55, 0.42, 0.3);
dummyMat.specularColor = new Color3(0.1, 0.1, 0.1);
dummy.material = dummyMat;

// launcher pads (visual markers)
function pad(x: number, name: string, tint: Color3): Mesh {
  const m = MeshBuilder.CreateCylinder(name, { diameter: 0.5, height: 0.12 }, scene);
  m.position = new Vector3(x, 0.06, 2);
  const mat = new StandardMaterial(name + 'Mat', scene);
  mat.diffuseColor = tint;
  mat.emissiveColor = tint.scale(0.5);
  m.material = mat;
  return m;
}
pad(-3.2, 'padL', new Color3(0.2, 0.75, 1));
pad(3.2, 'padR', new Color3(0.55, 0.35, 1));

const LAUNCH_L = new Vector3(-3.2, 1.1, 2);
const LAUNCH_R = new Vector3(3.2, 1.1, 2);
const TARGET = new Vector3(0, 0.7, -3);

// ---- shared generated textures ---------------------------------------------
function radialTexture(inner: string, outer: string, size = 128): DynamicTexture {
  const dt = new DynamicTexture('tex-' + inner + outer, { width: size, height: size }, scene, false);
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dt.update();
  dt.hasAlpha = true;
  return dt;
}
const flashTex = radialTexture('rgba(255,255,255,1)', 'rgba(120,200,255,0.55)');
const sparkTex = radialTexture('rgba(255,255,255,1)', 'rgba(140,190,255,0.6)', 64);

// ---- simple tween list ------------------------------------------------------
type Tween = { t: number; dur: number; tick: (k: number) => void; done?: () => void };
const tweens: Tween[] = [];
scene.onBeforeRenderObservable.add(() => {
  const dtMs = engine.getDeltaTime();
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dtMs;
    const k = Math.min(1, tw.t / tw.dur);
    tw.tick(k);
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.done?.();
    }
  }
});

// ---- projectile lifecycle ----------------------------------------------------
type Path = 'L' | 'R';
interface Projectile {
  mesh: Mesh;
  trail?: ParticleSystem;
  path: Path;
  vel: Vector3;
  alive: boolean;
}

const projectiles: Projectile[] = [];
let firedCount = 0;
let hitCount = 0;
let particlesLive = 0; // live particle systems (for HUD)

const projMatL = new StandardMaterial('projL', scene);
projMatL.emissiveColor = new Color3(0.3, 0.85, 1);
projMatL.diffuseColor = Color3.Black();
projMatL.disableLighting = true;

const projMatR = new StandardMaterial('projR', scene);
projMatR.emissiveColor = new Color3(0.75, 0.5, 1);
projMatR.diffuseColor = Color3.Black();
projMatR.disableLighting = true;

function makeTrail(emitter: Mesh, colorA: Color4, colorB: Color4): ParticleSystem {
  const ps = new ParticleSystem('trail', 160, scene);
  ps.particleTexture = sparkTex;
  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-0.05, -0.05, -0.05);
  ps.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
  ps.color1 = colorA;
  ps.color2 = colorB;
  ps.colorDead = new Color4(0.1, 0.15, 0.3, 0);
  ps.minSize = 0.06;
  ps.maxSize = 0.16;
  ps.minLifeTime = 0.25;
  ps.maxLifeTime = 0.5;
  ps.emitRate = 90;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.gravity = new Vector3(0, -1.5, 0);
  ps.direction1 = new Vector3(-0.3, -0.3, -0.3);
  ps.direction2 = new Vector3(0.3, 0.3, 0.3);
  particlesLive++;
  ps.onDisposeObservable.addOnce(() => { particlesLive--; });
  ps.start();
  return ps;
}

function fire(from: Path, speed = 6): Projectile {
  const origin = from === 'L' ? LAUNCH_L : LAUNCH_R;
  const sphere = MeshBuilder.CreateSphere('proj-' + firedCount++, { diameter: 0.22, segments: 10 }, scene);
  sphere.position.copyFrom(origin);
  sphere.material = from === 'L' ? projMatL : projMatR;

  const p: Projectile = {
    mesh: sphere,
    path: from,
    vel: TARGET.subtract(origin).normalize().scale(speed),
    alive: true,
  };
  // R path adds a continuous trail (transparent additive layer → overdraw cost)
  if (p.path === 'R') {
    p.trail = makeTrail(
      sphere,
      new Color4(0.65, 0.45, 1, 0.9),
      new Color4(0.35, 0.2, 0.7, 0.6),
    );
  }
  projectiles.push(p);
  return p;
}

function updateProjectiles() {
  const dt = engine.getDeltaTime() / 1000;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.addInPlace(p.vel.scale(dt));
    const d = Vector3.Distance(p.mesh.position, TARGET);
    if (d < 0.35) {
      onHit(p);
      projectiles.splice(i, 1);
    }
  }
}

// ---- hit feedback -------------------------------------------------------------
function flashBillboard(colorTint: Color3, scale: number, durMs: number) {
  const plane = MeshBuilder.CreatePlane('flash', { size: scale }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.position = TARGET.clone();
  plane.position.y += 0.05;
  const mat = new StandardMaterial('flashMat', scene);
  mat.emissiveTexture = flashTex;
  mat.opacityTexture = flashTex;
  mat.disableLighting = true;
  mat.emissiveColor = colorTint;
  plane.material = mat;
  plane.isPickable = false;
  tweens.push({
    t: 0,
    dur: durMs,
    tick: (k) => {
      const s = scale * (0.4 + 0.6 * k);
      plane.scaling.setAll(s);
      mat.alpha = 1 - k;
    },
    done: () => {
      plane.dispose(false, true);
    },
  });
}

function burst(count: number, color1: Color4, color2: Color4) {
  const ps = new ParticleSystem('burst', count, scene);
  ps.particleTexture = sparkTex;
  ps.emitter = TARGET.clone().add(new Vector3(0, 0.2, 0));
  ps.minEmitBox = new Vector3(-0.1, 0, -0.1);
  ps.maxEmitBox = new Vector3(0.1, 0.2, 0.1);
  ps.color1 = color1;
  ps.color2 = color2;
  ps.colorDead = new Color4(0.05, 0.08, 0.2, 0);
  ps.minSize = 0.08;
  ps.maxSize = 0.22;
  ps.minLifeTime = 0.3;
  ps.maxLifeTime = 0.7;
  ps.emitRate = 0;
  ps.manualEmitCount = count;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.gravity = new Vector3(0, -4, 0);
  ps.direction1 = new Vector3(-3, 2, -3);
  ps.direction2 = new Vector3(3, 6, 3);
  particlesLive++;
  ps.onDisposeObservable.addOnce(() => { particlesLive--; });
  ps.start();
  // dispose after the longest particle lifetime, fully releasing CPU/GPU side
  setTimeout(() => ps.dispose(), 900);
}

function shockRing() {
  const ring = MeshBuilder.CreateTorus('ring', { diameter: 0.6, thickness: 0.06, tessellation: 24 }, scene);
  ring.position = TARGET.clone();
  ring.position.y += 0.12;
  const mat = new StandardMaterial('ringMat', scene);
  mat.emissiveColor = new Color3(0.5, 0.85, 1);
  mat.disableLighting = true;
  mat.alpha = 0.85;
  ring.material = mat;
  ring.isPickable = false;
  tweens.push({
    t: 0,
    dur: 500,
    tick: (k) => {
      ring.scaling.setAll(1 + 3.2 * k);
      mat.alpha = 0.85 * (1 - k);
    },
    done: () => ring.dispose(false, true),
  });
}

function onHit(p: Projectile) {
  hitCount++;
  if (p.path === 'L') {
    // lightweight: 1 flash billboard + one-shot 12-particle system; no light
    flashBillboard(new Color3(0.6, 0.9, 1), 0.9, 380);
    burst(12, new Color4(0.5, 0.9, 1, 0.9), new Color4(0.3, 0.6, 0.9, 0.6));
  } else {
    // richer: flash + 60-particle burst + shock ring + shared light pulse
    flashBillboard(new Color3(0.85, 0.75, 1), 1.3, 500);
    burst(60, new Color4(0.75, 0.55, 1, 0.95), new Color4(0.45, 0.3, 0.85, 0.6));
    shockRing();
    hitLight.position.copyFrom(TARGET).addInPlace(new Vector3(0, 1, 0));
    tweens.push({
      t: 0,
      dur: 450,
      tick: (k) => {
        hitLight.intensity = 4.5 * (1 - k) * (1 - k);
      },
      done: () => {
        hitLight.intensity = 0;
      },
    });
  }
  p.trail?.stop(); // stop emitting; particles fade naturally
  if (leak) {
    // intentionally retained: mesh kept alive (hidden) to demonstrate leak
    p.mesh.setEnabled(false);
    leakCount++;
  } else {
    p.mesh.dispose();
  }
  if (p.trail) setTimeout(() => p.trail!.dispose(), 600);
}

// ---- auto-fire loop -----------------------------------------------------------
let tick = 0;
scene.onBeforeRenderObservable.add(() => {
  updateProjectiles();
});
setInterval(() => {
  tick++;
  if (mode === 'L') fire('L');
  else if (mode === 'R') fire('R');
  else fire(tick % 2 === 0 ? 'L' : 'R');
}, 900);

// ---- stress experiment (release evidence) -------------------------------------
let leakCount = 0;
let baselineMeshes = 0;
if (stressN > 0) {
  setTimeout(() => {
    baselineMeshes = scene.meshes.length;
    console.log(`[stress] baseline meshes=${baselineMeshes} leak=${leak}`);
    let i = 0;
    const iv = setInterval(() => {
      fire(i % 2 === 0 ? 'L' : 'R', 14); // fast projectiles → hits quickly
      if (++i >= stressN) clearInterval(iv);
    }, 120);
    setTimeout(() => {
      const after = scene.meshes.length;
      const line = `[stress] N=${stressN} leak=${leak} meshes baseline=${baselineMeshes} after=${after} delta=${after - baselineMeshes}`;
      console.log(line);
      stressResult = line;
    }, 8000);
  }, 1000);
}
let stressResult = '';

// ---- pooling micro-benchmark ---------------------------------------------------
let benchResult = '';
if (bench) {
  setTimeout(() => {
    const N = 200;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const m = MeshBuilder.CreateSphere('bench' + i, { diameter: 0.22, segments: 10 }, scene);
      m.position.set(i % 10, 0.2, Math.floor(i / 10));
      m.dispose();
    }
    const createMs = performance.now() - t0;

    // pooled: create once, reposition + hide repeatedly
    const pool: Mesh[] = [];
    for (let i = 0; i < 20; i++) {
      const m = MeshBuilder.CreateSphere('pool' + i, { diameter: 0.22, segments: 10 }, scene);
      m.setEnabled(false);
      pool.push(m);
    }
    const t1 = performance.now();
    for (let i = 0; i < N; i++) {
      const m = pool[i % pool.length];
      m.setEnabled(true);
      m.position.set(i % 10, 0.2, Math.floor(i / 10));
      m.setEnabled(false);
    }
    const poolMs = performance.now() - t1;
    const perCreate = (createMs / N).toFixed(3);
    const perPool = poolMs < 0.005 * N ? '<0.005' : (poolMs / N).toFixed(3);
    const ratio = poolMs < 0.005 * N ? '>60x' : (createMs / poolMs).toFixed(1) + 'x';

    benchResult = `[bench] create+dispose ${N}x total=${createMs.toFixed(1)}ms (${perCreate}ms/op) | pool re-use ${N}x total=${poolMs.toFixed(2)}ms (${perPool}ms/op) | ratio ${ratio}`;
    console.log(benchResult);
  }, 1200);
}

// ---- HUD ----------------------------------------------------------------------
const t0 = performance.now();
setInterval(() => {
  const fps = engine.getFps().toFixed(0);
  const active = scene.getActiveMeshes().length;
  const total = scene.meshes.length;
  const lines = [
    `t=${((performance.now() - t0) / 1000).toFixed(1)}s  fps=${fps}`,
    `activeMeshes=${active}  totalMeshes=${total}  projLive=${projectiles.length}`,
    `particleSystemsLive=${particlesLive}  fired=${firedCount}  hits=${hitCount}`,
    mode !== 'both' ? `mode=${mode}` : `mode=L/R alternate`,
    stressResult,
    benchResult,
    leak ? `LEAK MODE ON (retained meshes: ${leakCount})` : '',
  ].filter(Boolean);
  hud.textContent = lines.join('\n');
}, 250);

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
console.log('[st2-003-c] spike started', { mode, stressN, leak, bench });
