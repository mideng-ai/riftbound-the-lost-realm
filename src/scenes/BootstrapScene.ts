/**
 * BootstrapScene — minimal 3D assembly for the Stage-2 skeleton.
 * Demonstrates module wiring only; NOT gameplay (no combat/enemies/loot).
 */
import {
  Scene,
  Engine,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  HemisphericLight,
} from '@babylonjs/core';
import { CameraRig } from '../render/CameraRig';
import { ToonMaterial } from '../render/ToonMaterial';
import { InputSystem } from '../input/InputSystem';
import { ProjectileSystem } from '../vfx/Projectile';
import type { SavePort } from '../save/SavePort';
import { defaultSave } from '../save/SavePort';
import { gameConfig } from '../config/gameConfig';

export interface BootstrapSceneDeps {
  engine: Engine;
  canvas: HTMLCanvasElement;
  input: InputSystem;
  save: SavePort;
}

export interface BootstrapSceneResult {
  scene: Scene;
  cameraRig: CameraRig;
  toon: ToonMaterial;
  projectiles: ProjectileSystem;
  dispose(): void;
}

export function createBootstrapScene(deps: BootstrapSceneDeps): BootstrapSceneResult {
  const { engine, canvas, input, save } = deps;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.043, 0.051, 0.071, 1);

  // camera (top-down-ish framing; gameplay never touches camera internals)
  const cameraRig = new CameraRig(scene, canvas);

  // lighting: hemi for StandardMaterial props; toon shader uses its own uniforms
  new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene).intensity = 0.6;

  // ground
  const ground = MeshBuilder.CreateGround('ground', { width: 24, height: 24 }, scene);
  const gm = new StandardMaterial('groundMat', scene);
  gm.diffuseColor = new Color3(0.09, 0.11, 0.14);
  gm.specularColor = Color3.Black();
  ground.material = gm;

  // player placeholder with PROVISIONAL toon material (swap point for final render decision)
  const player = MeshBuilder.CreateSphere('player', { diameter: 0.7, segments: 16 }, scene);
  player.position.y = 0.4;
  const toon = new ToonMaterial('toonPlayer', scene, new Color3(0.45, 0.6, 0.85));
  player.material = toon.material;

  // target dummy (VFX demo only)
  const dummy = MeshBuilder.CreateBox('dummy', { size: 0.8 }, scene);
  dummy.position.set(0, 0.4, -4);
  const dm = new StandardMaterial('dummyMat', scene);
  dm.diffuseColor = new Color3(0.55, 0.42, 0.3);
  dummy.material = dm;

  // VFX (S2-C lightweight path, migrated)
  const projectiles = new ProjectileSystem(scene);

  // gameplay wiring demo: movement via unified input; intents pulse the player
  let dashPulse = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    const mv = input.getMove();
    const speed = 4;
    player.position.x += mv.x * speed * dt;
    player.position.z += mv.y * speed * dt;
    player.position.x = Math.max(-10, Math.min(10, player.position.x));
    player.position.z = Math.max(-10, Math.min(10, player.position.z));
    cameraRig.follow(player.position);

    if (input.consumeIntent('dash')) {
      dashPulse = 1;
      // dash feel placeholder: a short forward impulse, NOT final dash rules (D-204 tuning pending)
      player.position.x += mv.x * 1.2;
      player.position.z += mv.y * 1.2;
    }
    for (const a of ['normalAttack', 'skill1', 'skill2'] as const) {
      if (input.consumeIntent(a)) dashPulse = 1;
    }
    if (dashPulse > 0) {
      dashPulse -= dt * 2;
      toon.material.setColor3('baseColor', dashPulse > 0 ? new Color3(0.9, 0.75, 0.4) : new Color3(0.45, 0.6, 0.85));
    }

    // VFX demo: auto-fire at the dummy (visual lifecycle demo, not combat)
    if (performance.now() - lastFire > gameConfig.vfx.autoFireIntervalMs) {
      lastFire = performance.now();
      projectiles.launch(player.position.clone().add(new Vector3(0, 0.5, 0)), {
        target: dummy.position.clone(),
        onHit: (pos) => void pos,
      });
    }
  });
  let lastFire = 0;

  // persistence wiring: load at start (mock adapter until D-207), save a touch marker
  void save.load().then((data) => {
    if (!data) {
      const fresh = defaultSave();
      void save.save(fresh);
      console.log('[save] first run — default save written via mock adapter');
    } else {
      console.log('[save] loaded save, schemaVersion =', data.schemaVersion);
    }
  });

  return {
    scene,
    cameraRig,
    toon,
    projectiles,
    dispose: () => scene.dispose(),
  };
}
