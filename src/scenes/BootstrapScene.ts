/**
 * BootstrapScene — 集成层（本仓库唯一认识 Babylon 的接线层）。
 *
 * ══ 真模块逻辑 vs 集成层适配 vs 演示桩（本轮接线结论，供追溯）══
 *
 * 【真模块逻辑，未改任何模块内部】
 *  - TASK-02 CombatRuntime：玩家/武器/唯一伤害出口/XP/升级冻结/RunClock/RunSnapshot/阶段机
 *  - TASK-05 Arena + EnemyManager + SpawnDirector：六阶段波次、四类怪完整 AI
 *    （猎犬包抄 / 投射者风筝 / 影跃者跃进 / 滋养体光环）、接触与弹道伤害端口、同屏上限
 *  - TASK-07 UiRoot：纯展示（高频快照 + 离散事件 + 低频只读端口）
 *
 * 【集成层适配（不是桩，是把两个模块接起来的胶水）】
 *  - CombatUiBridge：combat → UiDataSources 的 adapter（Boss 字段补齐 / 低频端口 / 命令队列）
 *  - 刷怪事件 → combat.registry 镜像目标 + Babylon Mesh；逻辑坐标 → Mesh
 *  - EnemyManager 的 damagePlayer 端口 → CombatRuntime.step(incomingDamage)
 *  - RunClock 边沿标记 → BossAgent.syncFromClock 统一发 boss.warning_started / boss.spawned
 *  - registry.applyDamage(Boss) → BossAgent.receiveHit（HP 权威在 agent，破甲只乘一次）
 *  - run.phaseChanged(终局) → run.settled 事件（SettlementScreen 的唯一入口）
 *  - ?t=<秒> 快进：复用 RunClock + RUN_TIMELINE（510s 预警 / 600s Boss）
 *
 * 【集成层演示桩 DEMO，明确待替换】
 *  - 开局预热一波：仍走 SpawnDirector 真规则，但把 spawnTimer 一次推过阈值，
 *    避免试玩等首波 30s（config 的 phase[0].spawnIntervalSec）
 *  - Boss 实体：TASK-06 BossAgent 真 AI 已桥接（三阶段 / 六攻击 / 预警 / 召唤 / 胜利）；
 *    ⚠ 但 Boss 站桩不移动、不预判走位 —— 攻击只在预警开始瞬间朝玩家锁定一次
 *  - 玩家碰撞半径：domain/config 未定义，取渲染球半径（仅用于 TASK-05 接触判定）
 *  - ?demo=1：静止木桩 + 纯视觉 autoFire VFX（默认关闭）
 *  - DEMO 分裂弹散布角：⚠ 实际影响逻辑命中角，config 未定义，见常量注释
 *
 * 权威分工：combat.registry 是敌人 HP 权威（击杀 → XP → 升级全走 CombatRuntime 真逻辑），
 *           EnemyManager 是敌人 AI / 位置权威。两者按 entityId 一对一镜像，每帧同步位置。
 *           注册表判定死亡后，集成层回收 AI 实体并销毁 Mesh。
 *
 * 硬约束：不修改 src/domain/、src/config/、tests/，不改任何模块内部实现。
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
import type { Mesh } from '@babylonjs/core';
import { CameraRig } from '../render/CameraRig';
import { ToonMaterial } from '../render/ToonMaterial';
import { InputSystem } from '../input/InputSystem';
import { ProjectileSystem } from '../vfx/Projectile';
import type { SavePort } from '../save/SavePort';
import { defaultSave } from '../save/SavePort';
// ── TASK-02 战斗运行时 ──
import { defaultSaveV3 } from '../domain/index.ts';
import type { UpgradeId, EnemyId, EntityId, Vec3, SaveRunLoot } from '../domain/index.ts';
import { CombatRuntime } from '../combat/CombatRuntime.ts';
import { makeEnemyTarget } from '../combat/TargetRegistry.ts';
import type { EnemyTarget } from '../combat/TargetRegistry.ts';
import type { AttackRequest } from '../weapons/types.ts';
import { staffProjectileAngles } from '../weapons/staffWeapon.ts';
// ── TASK-05 怪物潮 ──
import { Arena } from '../world/arena.ts';
import { EnemyManager } from '../enemy/manager.ts';
import type { EnemyTickContext, PlayerSnapshot } from '../enemy/types.ts';
import { SpawnDirector } from '../spawn/spawnDirector.ts';
// ── 配置（只读） ──
import { gameConfig } from '../config/gameConfig';
import { enemyConfig } from '../config/enemyConfig.ts';
import { waveTimelineConfig } from '../config/waveTimelineConfig.ts';
// ── TASK-07 UI ──
import { UiRoot } from '../ui/UiRoot.ts';
import type { UiDataSources } from '../ui/dataSources.ts';
import type { UiCommandSink } from '../ui/commands.ts';
import { CombatUiBridge } from './CombatUiBridge.ts';
// ── TASK-06 Boss 真 AI 接线（适配层 + 预警渲染） ──
import { BossCombatBridge, BOSS_BRIDGE_ENTITY_ID } from '../combat/BossCombatBridge.ts';
import { BossTelegraphView } from './BossTelegraphView.ts';
import '../ui/ui.css';

export interface BootstrapSceneDeps {
  engine: Engine;
  canvas: HTMLCanvasElement;
  input: InputSystem;
  save: SavePort;
  /**
   * TASK-07 UI 只读数据源。真实接线时必须传（main.ts 传 CombatUiBridge.sources）：
   * bus 必须与 CombatRuntime.bus 同一条，snapshot 必须是 combat 运行时状态。
   * 未传时兜底也直接指向 combat 真状态，不再出现「静态空快照」。
   */
  ui?: UiDataSources;
  /** UI 命令出口（真实接线时传 CombatUiBridge.onCommand）。 */
  onUiCommand?: UiCommandSink;
  /** 集成层 adapter：注入 combat 引用、提供 Boss 血条来源、消费 UI 命令队列。 */
  uiBridge?: CombatUiBridge;
}

export interface BootstrapSceneResult {
  scene: Scene;
  cameraRig: CameraRig;
  toon: ToonMaterial;
  projectiles: ProjectileSystem;
  /** TASK-02 战斗运行时（旧 #hud 调试面板读取 combat.debugView()） */
  combat: CombatRuntime;
  /** TASK-07 UI 总装配 */
  ui: UiRoot;
  /** 集成层：当前 Boss 镜像目标（未登场 / 已击败为 null），供 adapter 与取证读取。 */
  bossTarget: () => EnemyTarget | null;
  /**
   * 只读取证端口（集成层调试设施，**不参与任何玩法结算**）。
   * 供 Playwright / QA 直接读逻辑状态与敌人坐标，避免只靠像素猜「怪有没有动」。
   */
  probe(): {
    phase: string;
    elapsedSec: number;
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
    aliveEnemies: number;
    player: { x: number; z: number };
    enemies: readonly { id: number; defId: EnemyId; x: number; z: number }[];
    bossHpPct: number | null;
    /** TASK-06 取证：BossAgent 生命周期 / 阶段 / 当前预警攻击 / 权威 HP。 */
    bossState: 'dormant' | 'active' | 'defeated';
    bossPhase: string | null;
    bossTelegraph: string | null;
    bossHp: number;
    /** 只读取证：Boss 累计对玩家造成的原始伤害（证明预警判定真的生效）。 */
    bossDamageDealt: number;
    choices: readonly UpgradeId[];
  };
  dispose(): void;
}

/**
 * ⚠ DEMO 桩（如实标注）：法杖分裂弹散布角（度）。
 * 上一轮注释写「纯视觉」是错的 —— 该值注入 CombatRuntime.projectileOptions.spreadDeg，
 * 由 CombatRuntime.projectiles.launchStaff 与场景 VFX 共用，**直接影响逻辑命中角**。
 * config/domain 冻结契约未定义此值，本轮禁止改 config，故保留集成层 DEMO 常量，
 * 待补契约后由 config 提供（不要让 UI 或战斗模块自己写死）。
 */
const DEMO_PROJECTILE_SPREAD_DEG = 10;
/** ⚠ DEMO 桩：法杖最大射程（米），config 未定义，同上待补契约。 */
const DEMO_MAX_RANGE_M = 28;
/** ⚠ DEMO 桩：静止木桩（仅 ?demo=1 显示），本轮起由真实怪潮替代。 */
const DEMO_TARGET_POS = { x: 0, y: 0, z: -4 };
const DEMO_TARGET_ID: EnemyId = 'riftHound';

const PLAYER_MESH_DIAMETER_M = 0.7;
/** 集成层几何参数：domain/config 未定义玩家碰撞半径，取渲染球半径，仅供 TASK-05 AI 接触判定。 */
const INTEGRATION_PLAYER_RADIUS_M = PLAYER_MESH_DIAMETER_M / 2;
/** 集成层：Boss 站位距离（米），非平衡数值。 */
const BOSS_STANDOFF_M = 8;
/** Boss 镜像目标 id 段复用适配层常量（避免与 EnemyManager 的 entityId 自增相撞）。 */

/** 视觉配色（纯渲染，不是玩法数值）。 */
function enemyColor(defId: EnemyId): Color3 {
  switch (defId) {
    case 'riftSpitter': return new Color3(0.45, 0.8, 0.45);
    case 'umbraDasher': return new Color3(0.65, 0.4, 0.82);
    case 'riftNourisher': return new Color3(0.85, 0.7, 0.35);
    case 'riftRavager':
    case 'riftCaller': return new Color3(0.92, 0.45, 0.22);
    case 'riftWarden': return new Color3(0.95, 0.22, 0.28);
    default: return new Color3(0.85, 0.32, 0.32); // riftHound
  }
}

export function createBootstrapScene(deps: BootstrapSceneDeps): BootstrapSceneResult {
  const { engine, canvas, input, save } = deps;
  const params = new URLSearchParams(window.location.search);
  /** ?demo=1：启用旧静止木桩 + 纯视觉 autoFire（默认关闭）。 */
  const demoMode = params.get('demo') === '1';
  /** ?t=<秒>：快进单局时钟；上限取 config 的 maxRunSec，不硬编码 510/600。 */
  const rawSkip = Number(params.get('t') ?? '');
  const skipSec = Number.isFinite(rawSkip) && rawSkip > 0
    ? Math.min(rawSkip, waveTimelineConfig.timeline.maxRunSec)
    : 0;
  /**
   * ⚠ 测试用调试开关（仅验证胜利链路，默认游戏完全不触发）：
   *  ?bossHP=<n>  → Boss 登场后把 HP 削到 n（仍走 receiveHit → resolveDamageHit）
   *  ?killboss=1  → Boss 登场后直接击杀
   */
  const rawBossHp = Number(params.get('bossHP') ?? '');
  const debugBossHp = params.has('bossHP') && Number.isFinite(rawBossHp)
    ? Math.max(0, rawBossHp)
    : null;
  const debugKillBoss = params.get('killboss') === '1';

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.043, 0.051, 0.071, 1);

  const cameraRig = new CameraRig(scene, canvas);
  // 集成层取景：TASK-05 的安全生成红线是「距玩家 ≥12m」，旧取景（radius 14 / beta 0.9）
  // 只能看见 ±10m，怪会刷在画面外。放宽相机上限并改为近俯视，让 12–20m 的怪潮可见。
  // 只改相机实例参数，不改 CameraRig 模块内部。
  cameraRig.camera.upperRadiusLimit = 48;
  cameraRig.camera.radius = 34;
  cameraRig.camera.beta = 0.3;
  new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene).intensity = 0.6;

  const arena = new Arena();
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: arena.halfSizeM * 2, height: arena.halfSizeM * 2 },
    scene,
  );
  const gm = new StandardMaterial('groundMat', scene);
  gm.diffuseColor = new Color3(0.09, 0.11, 0.14);
  gm.specularColor = Color3.Black();
  ground.material = gm;

  const player = MeshBuilder.CreateSphere('player', { diameter: PLAYER_MESH_DIAMETER_M, segments: 16 }, scene);
  player.position.y = INTEGRATION_PLAYER_RADIUS_M;
  const toon = new ToonMaterial('toonPlayer', scene, new Color3(0.45, 0.6, 0.85));
  player.material = toon.material;

  const dummy = MeshBuilder.CreateBox('dummy', { size: 0.8 }, scene);
  dummy.position.set(DEMO_TARGET_POS.x, 0.4, DEMO_TARGET_POS.z);
  const dm = new StandardMaterial('dummyMat', scene);
  dm.diffuseColor = new Color3(0.55, 0.42, 0.3);
  dummy.material = dm;
  dummy.setEnabled(demoMode);

  const projectiles = new ProjectileSystem(scene);

  // ── TASK-02 组合根 ────────────────────────────────────────────
  const vfxOnAttack = (req: AttackRequest): void => {
    const origin = new Vector3(req.origin.x, 0.5, req.origin.z);
    if (req.kind === 'staff') {
      for (const offset of staffProjectileAngles(req.projectileCount, DEMO_PROJECTILE_SPREAD_DEG)) {
        const rad = ((req.facingDeg + offset) * Math.PI) / 180;
        const rangeM = req.speedMps;
        projectiles.launch(origin, {
          target: new Vector3(origin.x + Math.cos(rad) * rangeM, 0.5, origin.z + Math.sin(rad) * rangeM),
          speed: req.speedMps,
        });
      }
    } else {
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

  // 共享领域总线：deps.ui.bus 必须与 CombatRuntime.bus 是同一条实例。
  const sharedBus = deps.ui?.bus ?? deps.uiBridge?.bus ?? undefined;
  const combat = new CombatRuntime({
    save: defaultSaveV3(),
    bus: sharedBus,
    projectileOptions: { spreadDeg: DEMO_PROJECTILE_SPREAD_DEG, maxRangeM: DEMO_MAX_RANGE_M },
    onAttack: vfxOnAttack,
  });

  // ?t= 快进：只推进唯一权威时钟，RunClock 会自行翻转 510/600 边沿标记（RUN_TIMELINE）。
  // SpawnDirector 在下方构造，因此它读到的 elapsedSec 已是快进后的值。
  if (skipSec > 0) combat.progression.clock.advance(skipSec);

  let bossTargetRef: EnemyTarget | null = null;
  // attach 移到 BossAgent 构造之后（下方），血条数据源优先读 BossAgent 权威值。

  // ── TASK-05 组合根（真模块，非演示 AI） ─────────────────────────
  const manager = new EnemyManager({
    bus: combat.bus,
    clock: combat.progression.clock,
    rng: combat.rng,
    arena,
  });
  const director = new SpawnDirector({
    manager,
    arena,
    clock: combat.progression.clock,
    rng: combat.rng,
    bus: combat.bus,
  });

  const enemyMeshes = new Map<EntityId, Mesh>();
  let meshSeq = 0;
  const createEnemyMesh = (defId: EnemyId, pos: Vec3, radiusM: number): Mesh => {
    const size = radiusM * 2;
    const mesh = defId === 'riftWarden'
      ? MeshBuilder.CreateSphere('boss', { diameter: size, segments: 20 }, scene)
      : MeshBuilder.CreateBox('enemy', { size }, scene);
    const mat = new StandardMaterial(`enemyMat_${defId}_${meshSeq++}`, scene);
    // 自发光纯色：暗色场地 + 0.6 强度半球光下，纯 diffuse 的怪几乎看不见。
    // 这是渲染层可见性修正，不影响任何玩法数值。
    const color = enemyColor(defId);
    mat.diffuseColor = color;
    mat.emissiveColor = color;
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mesh.material = mat;
    mesh.position.set(pos.x, radiusM, pos.z);
    return mesh;
  };

  // ── TASK-06 BossAgent 接线（真 AI + 集成层适配） ────────────────
  const bossSpawnPos: Vec3 = { x: 0, y: 0, z: -BOSS_STANDOFF_M };
  const bossBridge = new BossCombatBridge({
    combat,
    bus: combat.bus,
    rng: combat.rng,
    spawnPos: bossSpawnPos,
    summons: {
      // 普通怪总数由 EnemyManager 权威计数；SummonDirector 在此之上执行
      // min(summonCap, normalCap) 上限，森林召唤/猎犬补充都绝不无限生成。
      normalCount: () => manager.normalCount,
      spawnHound: (defId, at) => { manager.spawn(defId, { position: at }); },
      spawnMinion: (defId, at) => { manager.spawn(defId, { position: at }); },
    },
  });

  // UI 血条直接读 BossAgent 权威 HP / 阶段（不再读集成层伪造的固定血条）。
  deps.uiBridge?.attach(combat, () => bossTargetRef, () => ({
    hp: bossBridge.agent.hp,
    maxHp: bossBridge.agent.maxHpValue,
    phase: bossBridge.agent.phase,
    active: bossBridge.agent.state === 'active',
  }));

  // 预警贴花：程序化几何，shape 与 pointInTelegraph 判定同源（美术圣经 §4.3 红线）。
  const bossTelegraph = new BossTelegraphView(scene, () => ({
    currentTelegraph: bossBridge.agent.currentTelegraph,
    activeZones: bossBridge.agent.activeZones,
  }));

  // 玩家攻击命中 Boss：CombatResolver 已按 boss 档位结算一次（破甲含在内），
  // 这里把 registry 的扣血转交 BossAgent.receiveHit —— HP 权威回到 agent，破甲不双计。
  const applyDamageNormal = combat.registry.applyDamage.bind(combat.registry);
  combat.registry.applyDamage = (entityId, dealt, _atSec) => {
    if (entityId === BOSS_BRIDGE_ENTITY_ID && bossBridge.agent.state === 'active') {
      bossBridge.applyResolvedDamage(dealt, combat.weapons.current);
      // 击杀/奖励已由 BossAgent.defeat → VictorySettler 处理，不再广播 enemy.killed。
      return null;
    }
    return applyDamageNormal(entityId, dealt, _atSec);
  };

  // 刷怪事件 → combat.registry 镜像目标 + Mesh。
  // 用 registry.add（不广播）而不是 spawn，避免与 manager 的 enemy.spawned 形成事件回环。
  // 镜像目标的 entityId 与 AI 实体一致，HP/半径/经验由 makeEnemyTarget 从 config 派生。
  const offSpawned = combat.bus.subscribe('enemy.spawned', (p) => {
    const e = manager.enemies.find((x) => x.entityId === p.enemyId);
    if (!e || enemyMeshes.has(p.enemyId)) return;
    const target = makeEnemyTarget(p.defId, e.position, p.enemyId, combat.progression.clock.elapsedSec);
    combat.registry.add(target);
    enemyMeshes.set(p.enemyId, createEnemyMesh(p.defId, e.position, target.radiusM));
  });

  // ── 胜负闭环（事件适配） ──────────────────────────────────────
  let settled = false;
  const publishSettlement = (victory: boolean): void => {
    if (settled) return;
    settled = true;
    // 本试玩未接 TASK-04 经济系统：本局确实没有「已拾取」资源，如实给 0，不伪造战利品。
    const loot: SaveRunLoot = {
      gold: 0,
      forestMaterial: 0,
      shards: { fire: 0, ice: 0, lightning: 0, shadow: 0 },
      gems: [],
    };
    combat.bus.publish('run.settled', { victory, pickedResources: loot });
  };
  const offPhase = combat.bus.subscribe('run.phaseChanged', (p) => {
    if (p.to === 'defeat') publishSettlement(false);
    else if (p.to === 'victory') publishSettlement(true);
  });
  // Boss 胜利链路由 BossAgent.defeat → VictorySettler 发 boss.defeated（一次性），
  // BossCombatBridge 订阅它并把 run.phaseChanged 推到 'victory' → 上面的 offPhase 发结算屏。

  // ── 时间轴事件 + Boss 实体 ────────────────────────────────────
  // boss.warning_started / boss.spawned 由 BossAgent.syncFromClock 统一发（各一次），
  // 集成层只监听 boss.spawned 建 registry 镜像目标 + Mesh，不再自己发第二遍。
  const spawnBoss = (): void => {
    if (bossTargetRef) return;
    const agent = bossBridge.agent;
    const radiusM = enemyConfig.boss.radiusM; // 半径仍从冻结 config 读
    const pos = agent.position; // 逻辑位置权威在 BossAgent
    const target: EnemyTarget = {
      entityId: BOSS_BRIDGE_ENTITY_ID,
      defId: 'riftWarden',
      tier: 'boss',
      radiusM,
      xpValue: enemyConfig.boss.xpValue,
      hp: agent.hp, // HP 权威在 BossAgent，镜像而非另造 6000
      maxHp: agent.maxHpValue,
      position: { ...pos },
      alive: true,
    };
    combat.registry.add(target);
    bossTargetRef = target;
    bossBridge.attachTarget(target);
    enemyMeshes.set(BOSS_BRIDGE_ENTITY_ID, createEnemyMesh('riftWarden', pos, radiusM));
    // ⚠ 测试用调试开关：只在显式查询参数下削血 / 击杀，正常游戏不触发。
    if (debugKillBoss) bossBridge.debugSetHp(0);
    else if (debugBossHp !== null) bossBridge.debugSetHp(debugBossHp);
  };
  const offBossSpawned = combat.bus.subscribe('boss.spawned', () => spawnBoss());
  const syncTimeline = (): void => {
    bossBridge.syncClock();
  };

  // ── 旧 TASK-02 静止木桩（默认关闭，仅 ?demo=1 用于对照） ────────
  const spawnDemoTarget = (): void => {
    combat.registry.spawn(DEMO_TARGET_ID, DEMO_TARGET_POS, combat.progression.clock.elapsedSec);
    dummy.setEnabled(true);
  };
  const offKilled = demoMode
    ? combat.bus.subscribe('enemy.killed', (p) => {
        if (p.defId === DEMO_TARGET_ID) spawnDemoTarget();
      })
    : null;
  if (demoMode) spawnDemoTarget();

  // ── 升级选卡：键盘 1/2/3 兜底（UI 点击走 bridge 命令队列） ──────
  let offered: readonly UpgradeId[] = [];
  const offOffered = combat.bus.subscribe('upgrade.offered', ({ choices }) => {
    offered = choices.map((c) => c.id);
  });
  let keyboardSelection: UpgradeId | null = null;
  const onSelectKey = (e: KeyboardEvent): void => {
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      const idx = Number(e.code.slice(-1)) - 1;
      const id = offered[idx];
      if (id) keyboardSelection = id;
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

  // ── TASK-07 UI 接线 ──────────────────────────────────────────
  // main.ts 传 deps.ui（CombatUiBridge.sources）：snapshot 是 combat 运行时状态的 adapter，
  // bus 就是 combat.bus，onUiCommand 转成 combat 命令。骨架兜底也指向真状态，不再是空快照。
  const uiSources: UiDataSources = deps.ui ?? { bus: combat.bus, snapshot: () => combat.snapshot };
  const ui = new UiRoot(document.body, {
    ...uiSources,
    // 领域总线是共享的：接线后只做逐层退订，不用 clearAll 清掉其它系统监听器。
    clearAllOnDispose: deps.ui ? false : true,
    onCommand: deps.onUiCommand ?? ((cmd) => console.debug('[ui] command (host not wired):', cmd.type)),
  });

  // ── TASK-05 AI 上下文（端口全部指向真模块 / combat 结算） ─────────
  const playerSnapshot: PlayerSnapshot = {
    position: { x: 0, y: 0, z: 0 },
    radiusM: INTEGRATION_PLAYER_RADIUS_M,
    hp: 0,
    maxHp: 0,
    gold: 0,
  };
  let pendingDamage = 0;
  const tickCtx: EnemyTickContext = {
    clock: combat.progression.clock,
    rng: combat.rng,
    player: playerSnapshot,
    // 端口：敌人造成的伤害累积到本帧，交给 CombatRuntime.step(incomingDamage) 走唯一结算器。
    // 不在此处自写扣血 / 免伤，避免绕过 TASK-02 的 0.5s 无敌帧与 damageTakenMul。
    damagePlayer: (amount) => { pendingDamage += amount; },
    aliveEnemies: manager.aliveEnemies,
    projectiles: manager.fireProjectile,
    requestSpawn: manager.requestSpawn,
    arena,
  };

  // 开局预热：SpawnDirector 首波间隔取自 config（30s），试玩不能等 30 秒。
  // 用一次大 dt 把 spawnTimer 推过阈值，仍完全走真模块的波次规则 / waveSize / 安全生成。
  director.tick(waveTimelineConfig.phases[0].spawnIntervalSec, playerSnapshot.position);

  let dashPulse = 0;
  let lastFire = 0;

  scene.onBeforeRenderObservable.add(() => {
    // 切后台/软件渲染的巨大帧毛刺 clamp：不让一帧走完 30 秒波次。
    const dt = Math.min(Math.max(engine.getDeltaTime() / 1000, 0), 0.1);
    const mv = input.getMove();
    const dash = input.consumeIntent('dash');
    const switchKey = input.consumeIntent('weaponSwitch');
    const skill1 = input.consumeIntent('skill1');
    const skill2 = input.consumeIntent('skill2');
    const attackEdge = input.consumeIntent('normalAttack');

    const uiCard = deps.uiBridge?.consumeCard() ?? null;
    const uiSwitch = deps.uiBridge?.consumeSwitch() ?? false;
    const selectCardId = uiCard ?? keyboardSelection;
    keyboardSelection = null;

    const p = combat.player.runtime.transform.position;
    const running = combat.progression.phase === 'running';
    let bossDamageThisFrame = 0;

    syncTimeline();

    if (running) {
      // 1) 真模块：波次生成
      director.tick(dt, p);
      // 2) 真模块：四类怪 AI / 弹道 / 光环 / 接触伤害（伤害经端口累积）
      pendingDamage = 0;
      playerSnapshot.position.x = p.x;
      playerSnapshot.position.y = 0;
      playerSnapshot.position.z = p.z;
      playerSnapshot.hp = combat.player.hp;
      playerSnapshot.maxHp = combat.player.maxHp;
      manager.tick(tickCtx, dt);
      // 2.5) TASK-06 BossAgent 真 AI：三阶段 / 六攻击 / 预警 / 召唤 / 核心暴露。
      //      Boss 对玩家的伤害仍并入唯一受击出口 combat.step（保留无敌帧与减伤）。
      bossDamageThisFrame = bossBridge.step(dt);
      pendingDamage += bossDamageThisFrame;
      // 3) 逻辑坐标同步：AI 位置 → registry 镜像目标（命中判定读的是 registry）
      for (const e of manager.aliveEnemies) {
        const t = combat.registry.get(e.entityId);
        if (t) {
          t.position.x = e.position.x;
          t.position.z = e.position.z;
        }
      }
    }

    // 4) TASK-02 唯一战斗帧：移动 / 攻击 / 命中 / 击杀 XP / 升级 / 受击 / 阶段 / 快照
    combat.step(dt, {
      moveX: mv.x,
      moveZ: mv.y, // 输入 y 映射到世界 z
      facingDeg: aimDeg,
      attack: attackEdge || input.isHeld('normalAttack'),
      dash,
      switchWeapon: switchKey || uiSwitch,
      selectCardId,
      incomingDamage: pendingDamage > 0 ? pendingDamage : undefined,
      incomingSource: bossDamageThisFrame > 0 ? 'boss' : undefined,
    });

    // 4.5) Boss HP 权威镜像 → registry（血条 UI 与命中几何都读这份镜像，不另造血量）
    bossBridge.syncTarget();
    // 4.6) 预警贴花：与 pointInTelegraph 判定同源的程序化几何（美术圣经 §4.3）
    bossTelegraph.update();

    // 5) 击杀清理：registry 判定死亡的镜像目标 → Mesh 消失 + AI 实体回收。
    //    XP / 升级已由 CombatRuntime 在 step 内走完（真模块逻辑），此处不再补发。
    for (const [id, mesh] of enemyMeshes) {
      const t = combat.registry.get(id);
      if (t && !t.alive) {
        mesh.dispose();
        enemyMeshes.delete(id);
        manager.despawn(id); // Boss id 不在 manager 内，despawn 会安全空转
        if (id === BOSS_BRIDGE_ENTITY_ID) bossTargetRef = null;
      }
    }

    // 6) 逻辑坐标 → 渲染（唯一权威；玩家边界/障碍用真 Arena 夹取）
    arena.clampPosition(p, INTEGRATION_PLAYER_RADIUS_M);
    player.position.set(p.x, INTEGRATION_PLAYER_RADIUS_M, p.z);
    cameraRig.follow(player.position);
    for (const e of manager.aliveEnemies) {
      const mesh = enemyMeshes.get(e.entityId);
      if (mesh) {
        mesh.position.x = e.position.x;
        mesh.position.z = e.position.z;
      }
    }
    // Boss 逻辑位置同样由 BossAgent 权威驱动（当前实现站桩，但同步链路已接通）
    const bossMesh = enemyMeshes.get(BOSS_BRIDGE_ENTITY_ID);
    if (bossMesh) {
      const bp = bossBridge.agent.position;
      bossMesh.position.x = bp.x;
      bossMesh.position.z = bp.z;
    }

    // 7) 冲刺 / 攻击材质反馈
    if (dash || attackEdge || skill1 || skill2) dashPulse = 1;
    if (dashPulse > 0) dashPulse = Math.max(0, dashPulse - dt * 2);
    const dashing = combat.player.runtime.dashActiveTimerSec > 0;
    const color = dashPulse > 0 || dashing
      ? new Color3(0.9, 0.75, 0.4)
      : combat.weapons.current === 'sword'
        ? new Color3(0.85, 0.5, 0.6)
        : new Color3(0.45, 0.6, 0.85);
    toon.material.setColor3('baseColor', color);

    // 8) ⚠ DEMO 桩：纯视觉自动开火，仅 ?demo=1 启用（默认关闭，不产生伤害）
    if (demoMode && performance.now() - lastFire > gameConfig.vfx.autoFireIntervalMs) {
      lastFire = performance.now();
      projectiles.launch(player.position.clone().add(new Vector3(0, 0.5, 0)), {
        target: dummy.position.clone(),
        onHit: (pos) => void pos,
      });
    }

    // 9) TASK-07 UI：放在 combat.step 之后，读本帧最新快照
    ui.tick();
  });

  // 持久化接线（V2 mock adapter，与骨架一致；V3 由 TASK-04 接管）
  void save.load().then((data) => {
    if (!data) void save.save(defaultSave());
  });

  return {
    scene,
    cameraRig,
    toon,
    projectiles,
    combat,
    ui,
    bossTarget: () => bossTargetRef,
    probe: () => ({
      phase: combat.progression.phase,
      elapsedSec: combat.progression.clock.elapsedSec,
      hp: combat.player.hp,
      maxHp: combat.player.maxHp,
      level: combat.progression.level,
      xp: combat.progression.xp,
      aliveEnemies: combat.registry.aliveCount,
      player: { x: combat.player.runtime.transform.position.x, z: combat.player.runtime.transform.position.z },
      enemies: manager.aliveEnemies.map((e) => ({
        id: e.entityId as number,
        defId: e.defId,
        x: e.position.x,
        z: e.position.z,
      })),
      bossHpPct: bossTargetRef && bossTargetRef.maxHp > 0
        ? bossTargetRef.hp / bossTargetRef.maxHp
        : null,
      bossState: bossBridge.agent.state,
      bossPhase: bossBridge.agent.state === 'dormant' ? null : bossBridge.agent.phase,
      bossTelegraph: bossBridge.agent.currentTelegraph?.attack ?? null,
      bossHp: bossBridge.agent.hp,
      bossDamageDealt: bossBridge.playerDamageDealt,
      choices: combat.progression.choices.map((c) => c.id),
    }),
    dispose: () => {
      // 战斗 / 场景 / boss / UI 事件订阅逐层退订
      offSpawned();
      offPhase();
      offBossSpawned();
      offOffered();
      offKilled?.();
      bossBridge.dispose();
      bossTelegraph.dispose();
      window.removeEventListener('keydown', onSelectKey);
      canvas.removeEventListener('pointermove', onPointerMove);
      ui.dispose();
      combat.bus.clearAll();
      for (const mesh of enemyMeshes.values()) mesh.dispose();
      enemyMeshes.clear();
      scene.dispose();
    },
  };
}
