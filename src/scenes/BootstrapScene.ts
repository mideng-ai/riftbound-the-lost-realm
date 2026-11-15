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
import { createEventBus, createRunSnapshot } from '../domain/index.ts';
import { UiRoot } from '../ui/UiRoot.ts';
import type { UiDataSources } from '../ui/dataSources.ts';
import type { UiCommandSink } from '../ui/commands.ts';
import '../ui/ui.css';

export interface BootstrapSceneDeps {
  engine: Engine;
  canvas: HTMLCanvasElement;
  input: InputSystem;
  save: SavePort;
  /**
   * TASK-07 UI 只读数据源（可选）。
   * 未提供时：用契约工厂创建**骨架数据源**（空快照 + 独立 EventBus），
   * UI 仍完整挂载可验收，但不代表真实玩法状态。
   * 真实系统接线时必须提供 snapshot/bus 与各低频端口。
   */
  ui?: UiDataSources;
  /** UI 命令出口（可选）。未提供时只记录命令，不改动任何领域状态。 */
  onUiCommand?: UiCommandSink;
}

export interface BootstrapSceneResult {
  scene: Scene;
  cameraRig: CameraRig;
  toon: ToonMaterial;
  projectiles: ProjectileSystem;
  ui: UiRoot;
  dispose(): void;
}

export function createBootstrapScene(deps: BootstrapSceneDeps): BootstrapSceneResult {
  const { engine, canvas, input, save } = deps;
  const scene = new Scene(engine);  scene.clearColor = new Color4(0.043, 0.051, 0.071, 1);

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

  // ── TASK-07 UI 接线 ──
  // 真实系统接线：宿主传 deps.ui（含 snapshot/bus 及低频只读端口）与 deps.onUiCommand。
  // 骨架验收：未传时用契约工厂创建独立 bus + 空快照，UI 完整挂载但显示占位。
  const demoBus = createEventBus();
  const demoSnapshot = createRunSnapshot();
  const uiSources: UiDataSources = deps.ui ?? { bus: demoBus, snapshot: () => demoSnapshot };
  const ui = new UiRoot(document.body, {
    ...uiSources,
    // 领域总线是共享的：接线后只做逐层退订，不用 clearAll 清掉其它系统监听器。
    clearAllOnDispose: deps.ui ? false : true,
    onCommand: deps.onUiCommand ?? ((cmd) => console.debug('[ui] command (host not wired):', cmd.type)),
  });

  // gameplay wiring demo: movement via unified input; intents pulse the player
  let dashPulse = 0;
  scene.onBeforeRenderObservable.add(() => {
    ui.tick(); // 高频数值每帧读快照（UI 唯一更新通道）
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
    ui,
    dispose: () => {
      ui.dispose(); // 逐层退订 + clearAll 兜底（防监听器泄漏）
      scene.dispose();
    },
  };
}
