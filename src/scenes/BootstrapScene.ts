/**
 * BootstrapScene — Stage-2 骨架 + TASK-02 真实战斗接线。
 *
 * 分层：本文件是**唯一**认识 Babylon 的接线层。
 *   - 战斗规则全部在 src/combat/CombatRuntime.ts（纯逻辑，可在 node:test 里跑）；
 *   - 这里只做「输入意图 → CombatFrameInput」「逻辑坐标 → Mesh」「攻击 → VFX」。
 *
 * 保留原有返回接口（scene / cameraRig / toon / projectiles / dispose），
 * 另加 combat 供 HUD / 调试读取，main.ts 无需改动即可继续运行。
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
import { defaultSaveV3 } from '../domain/index.ts';
import type { UpgradeId, EnemyId } from '../domain/index.ts';
import { CombatRuntime } from '../combat/CombatRuntime.ts';
import type { AttackRequest } from '../weapons/types.ts';
import { staffProjectileAngles } from '../weapons/staffWeapon.ts';

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
  /** TASK-02 战斗运行时（HUD / 调试面板读取 combat.debugView()） */
  combat: CombatRuntime;
  dispose(): void;
}

/** 演示用散布角：纯视觉参数，非 config 平衡数值。 */
const DEMO_SPREAD_DEG = 10;
/** 演示用目标刷新点（与 dummy 一致）。 */
const DEMO_TARGET_POS = { x: 0, y: 0, z: -4 };
const DEMO_TARGET_ID: EnemyId = 'riftHound';

export function createBootstrapScene(deps: BootstrapSceneDeps): BootstrapSceneResult {
  const { engine, canvas, input, save } = deps;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.043, 0.051, 0.071, 1);

  const cameraRig = new CameraRig(scene, canvas);
  new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene).intensity = 0.6;

  const ground = MeshBuilder.CreateGround('ground', { width: 24, height: 24 }, scene);
  const gm = new StandardMaterial('groundMat', scene);
  gm.diffuseColor = new Color3(0.09, 0.11, 0.14);
  gm.specularColor = Color3.Black();
  ground.material = gm;

  const player = MeshBuilder.CreateSphere('player', { diameter: 0.7, segments: 16 }, scene);
  player.position.y = 0.4;
  const toon = new ToonMaterial('toonPlayer', scene, new Color3(0.45, 0.6, 0.85));
  player.material = toon.material;

  const dummy = MeshBuilder.CreateBox('dummy', { size: 0.8 }, scene);
  dummy.position.set(DEMO_TARGET_POS.x, 0.4, DEMO_TARGET_POS.z);
  const dm = new StandardMaterial('dummyMat', scene);
  dm.diffuseColor = new Color3(0.55, 0.42, 0.3);
  dummy.material = dm;

  const projectiles = new ProjectileSystem(scene);

  // ── TASK-02 组合根 ────────────────────────────────────────────
  // 存档 V3 由 TASK-04 经济系统注入；骨架阶段先用 defaultSaveV3()，
  // 保证「双武器 Lv / 熟练 / 森林生存」有合法来源，不硬编码数值。
  const vfxOnAttack = (req: AttackRequest): void => {
    const origin = new Vector3(req.origin.x, 0.5, req.origin.z);
    if (req.kind === 'staff') {
      for (const offset of staffProjectileAngles(req.projectileCount, DEMO_SPREAD_DEG)) {
        const rad = ((req.facingDeg + offset) * Math.PI) / 180;
        const rangeM = req.speedMps; // 视觉飞行一秒的距离即可，命中由逻辑层判定
        projectiles.launch(origin, {
          target: new Vector3(origin.x + Math.cos(rad) * rangeM, 0.5, origin.z + Math.sin(rad) * rangeM),
          speed: req.speedMps,
        });
      }
    } else {
      // 剑：沿扇形中心线打一记短促闪光作为挥砍反馈
      const rad = (req.facingDeg * Math.PI) / 180;
      projectiles.launch(origin, {
        target: new Vector3(
          origin.x + Math.cos(rad) * req.radiusM,
          0.5,
          origin.z + Math.sin(rad) * req.radiusM,
        ),
        speed: req.radiusM / 0.15,
      });
    }
  };

  const combat = new CombatRuntime({
    save: defaultSaveV3(),
    projectileOptions: { spreadDeg: DEMO_SPREAD_DEG, maxRangeM: 28 },
    onAttack: vfxOnAttack,
  });

  const spawnDemoTarget = (): void => {
    combat.registry.spawn(DEMO_TARGET_ID, DEMO_TARGET_POS, combat.progression.clock.elapsedSec);
    dummy.setEnabled(true);
  };
  spawnDemoTarget();

  // 击杀后重生演示目标，保证战斗循环可连续验证
  const offKilled = combat.bus.subscribe('enemy.killed', () => spawnDemoTarget());

  // 选卡：升级冻结期间用 1/2/3 键选择（生产 UI 会替换这段）
  let offered: readonly UpgradeId[] = [];
  const offOffered = combat.bus.subscribe('upgrade.offered', ({ choices }) => {
    offered = choices.map((c) => c.id);
  });
  let pendingSelection: UpgradeId | null = null;
  const onSelectKey = (e: KeyboardEvent): void => {
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      const idx = Number(e.code.slice(-1)) - 1;
      const id = offered[idx];
      if (id) pendingSelection = id;
    }
  };
  window.addEventListener('keydown', onSelectKey);

  // 鼠标瞄准：以画布中心为原点换算朝向角（domain 约定 0° = +X，俯视 x/z 平面）
  let aimDeg = -90;
  const onPointerMove = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dz = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dz) > 1e-3) aimDeg = (Math.atan2(dz, dx) * 180) / Math.PI;
  };
  canvas.addEventListener('pointermove', onPointerMove);

  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    const mv = input.getMove();

    // 消费一次性意图。单击（pointerdown→pointerup 在同一帧内）也要能触发一次攻击，
    // 所以 normalAttack 的 intent 与 held 取或，避免快速点击漏发。
    const dash = input.consumeIntent('dash');
    const switchWeapon = input.consumeIntent('weaponSwitch');
    input.consumeIntent('skill1');
    input.consumeIntent('skill2');
    const attackEdge = input.consumeIntent('normalAttack');

    combat.step(dt, {
      moveX: mv.x,
      moveZ: mv.y, // 输入 y 映射到世界 z
      facingDeg: aimDeg,
      attack: attackEdge || input.isHeld('normalAttack'),
      dash,
      switchWeapon,
      selectCardId: pendingSelection,
    });
    pendingSelection = null;

    // 逻辑坐标 → 渲染
    const p = combat.player.runtime.transform.position;
    player.position.x = Math.max(-10, Math.min(10, p.x));
    player.position.z = Math.max(-10, Math.min(10, p.z));
    cameraRig.follow(player.position);

    // 冲刺 / 切武器时给一点材质反馈
    const dashing = combat.player.runtime.dashActiveTimerSec > 0;
    const color = dashing
      ? new Color3(0.9, 0.75, 0.4)
      : combat.weapons.current === 'sword'
        ? new Color3(0.85, 0.5, 0.6)
        : new Color3(0.45, 0.6, 0.85);
    toon.material.setColor3('baseColor', color);
  });

  // 持久化接线（V2 mock adapter，与骨架一致；V3 由 TASK-04 接管）
  void save.load().then((data) => {
    if (!data) {
      void save.save(defaultSave());
    }
  });

  return {
    scene,
    cameraRig,
    toon,
    projectiles,
    combat,
    dispose: () => {
      offKilled();
      offOffered();
      window.removeEventListener('keydown', onSelectKey);
      canvas.removeEventListener('pointermove', onPointerMove);
      combat.bus.clearAll();
      scene.dispose();
    },
  };
}
