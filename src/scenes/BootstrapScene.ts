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
  MeshBuilder,
  StandardMaterial,
} from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { CameraRig } from '../render/CameraRig';
import { ToonMaterial } from '../render/ToonMaterial';
// 美术规格 §2/§3/§4 的参数原文落地（色值/尺寸/seed/光雾/障碍/边界）。
import {
  FOREST_HEX,
  applyForestAtmosphere,
  createForestGround,
  createForestLights,
  createForestProps,
} from './forestEnvironment.ts';
import { InputSystem } from '../input/InputSystem';
import { ProjectileSystem } from '../vfx/Projectile';
import type { SavePort } from '../save/SavePort.ts';
// ── TASK-02 战斗运行时 ──
import {
  defaultSaveV3,
  type EventBusApi,
  type GameEventMap,
  type GameEventType,
  type UpgradeId,
  type EnemyId,
  type EntityId,
  type Vec3,
  type SaveDataV3,
} from '../domain/index.ts';
// ── TASK-04 经济系统：ADR-TD-009 / D-207 运行时接线 ──
import { EconomySystem } from '../economy/system.ts';
import { SavePortV3Bridge } from '../economy/saveBridge.ts';
import type { DropInstance, LootTier } from '../economy/types.ts';
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
import type { TextResolver } from '../ui/uiText.ts';
// 文案表接线：场景作为 UI 组合根，宿主未显式传 resolver 时也默认注入正式英文表。
import { enResolver } from '../text/resolver.ts';
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
  /**
   * 玩家可见文本解析器。宿主（main.ts）注入 enResolver；
   * 兜底也用正式文案表，绝不退回 keyLabel 调试标签。
   * ?debug=1 只控制旧 #hud 调试面板显示，不改变真 UI 的文案来源。
   */
  text?: TextResolver;
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
    /** DEF-004：economyView() 的只读取证消费者——QA 可在运行时读到真实落盘经济状态。 */
    economy: {
      gold: number;
      forestMaterial: number;
      gems: number;
      runsPlayed: number;
      bossKills: number;
    };
  };
  /** TASK-04 经济系统只读视图（ADR-TD-009：UI / 重开的数据源之一） */
  economyView(): Readonly<SaveDataV3>;
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
/** 美术圣经 §9 推荐案：玩家焰橙主体 + 米白点缀（待所有者拍板，此处取规格默认值）。 */
const PLAYER_BODY_HEX = '#FF7A2F';
const PLAYER_ACCENT_HEX = '#F5EFE0';
/** 集成层几何参数：domain/config 未定义玩家碰撞半径，取渲染球半径，仅供 TASK-05 AI 接触判定。 */
const INTEGRATION_PLAYER_RADIUS_M = PLAYER_MESH_DIAMETER_M / 2;
/** 集成层：Boss 站位距离（米），非平衡数值。 */
const BOSS_STANDOFF_M = 8;
/** Boss 镜像目标 id 段复用适配层常量（避免与 EnemyManager 的 entityId 自增相撞）。 */

/** 实体辨识色（美术规格 §5.1 原文 HEX；纯渲染，不是玩法数值）。 */
interface EnemyLook {
  readonly hex: string;
  readonly emissiveScale: number;
  readonly alpha: number;
}
function enemyLook(defId: EnemyId): EnemyLook {
  switch (defId) {
    case 'riftHound': return { hex: '#1E2A24', emissiveScale: 0.35, alpha: 1 }; // 炭黑绿（紫条纹未做，见报告）
    case 'riftSpitter': return { hex: '#8FD14F', emissiveScale: 0.2, alpha: 1 }; // 嫩芽绿
    case 'umbraDasher': return { hex: '#8B5CF6', emissiveScale: 0.2, alpha: 0.7 }; // 裂隙紫半透明
    case 'riftNourisher': return { hex: '#7A5230', emissiveScale: 0.25, alpha: 1 }; // 泥土棕
    case 'riftRavager': return { hex: '#2E7D4F', emissiveScale: 0.3, alpha: 1 }; // 精英：深林绿
    case 'riftCaller': return { hex: '#8B5CF6', emissiveScale: 0.3, alpha: 1 }; // 精英：裂隙紫
    case 'riftWarden': return { hex: '#2E7D4F', emissiveScale: 0.25, alpha: 1 }; // Boss：树皮绿 + 紫核
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
  // 美术规格 §2.3：雾霭青清屏 + LINEAR 雾 25→55m，虚空黑底彻底消失。
  applyForestAtmosphere(scene);

  const cameraRig = new CameraRig(scene, canvas);
  // 美术规格 §2.1：beta 0.3→0.56（俯角 72.8°→58°），radius 34→30；
  // 收紧 beta 上下限锁定俯视角。只改相机实例参数，不改 CameraRig 模块内部。
  cameraRig.camera.upperRadiusLimit = 48;
  cameraRig.camera.radius = 30;
  cameraRig.camera.beta = 0.56;
  cameraRig.camera.lowerBetaLimit = 0.45;
  cameraRig.camera.upperBetaLimit = 0.75;
  // 美术规格 §2.2：补主光（旧场景只有一盏白色 hemi，是平涂根因）。
  createForestLights(scene);

  const arena = new Arena();
  // 美术规格 §3/§4：单张 68×68 顶点色地面 + 8 个固定障碍 + ±30 边界可视化。
  const ground = createForestGround(scene, arena.obstacles);
  ground.isPickable = false;
  createForestProps(scene, arena.obstacles, arena.halfSizeM);

  const player = MeshBuilder.CreateSphere('player', { diameter: PLAYER_MESH_DIAMETER_M, segments: 16 }, scene);
  player.position.y = INTEGRATION_PLAYER_RADIUS_M;
  // 圣经 §9 推荐案：玩家焰橙主体 + 米白点缀。三档阈值用圣经定案 [0.22,0.55,0.85]，
  // 通过构造参数覆盖冻结 config 的 PROVISIONAL 旧值，不碰 src/config/。
  const sunLightDir = new Vector3(0.29, -0.82, 0.5);
  const toon = new ToonMaterial('toonPlayer', scene, Color3.FromHexString(PLAYER_BODY_HEX), {
    bands: [0.22, 0.55, 0.85],
    ambientColor: new Color3(0.28, 0.33, 0.32),
    lightColor: Color3.FromHexString(FOREST_HEX.sun),
  });
  // 适配：DirectionalLight 的 direction 是「光传播方向」，而 toon shader 的 N·L 需要
  // 「指向光源的向量」，两者相反；不取反会让所有朝上法线 band=0，玩家发黑。
  toon.bindLight(sunLightDir.scale(-1));
  player.material = toon.material;
  // 米白点缀：不重新设计剪影，只加一顶小「兜帽」，仍受 toon 主光统一方向驱动。
  const accent = MeshBuilder.CreateSphere('playerAccent', { diameter: 0.28, segments: 10 }, scene);
  const accentMat = new StandardMaterial('playerAccentMat', scene);
  accentMat.diffuseColor = Color3.FromHexString(PLAYER_ACCENT_HEX);
  accentMat.emissiveColor = Color3.FromHexString(PLAYER_ACCENT_HEX).scale(0.2);
  accentMat.specularColor = Color3.Black();
  accent.material = accentMat;
  accent.parent = player;
  accent.position.y = 0.24;
  accent.isPickable = false;

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
  // ADR-TD-009：localStorage 是同步 API，同步读档让永久成长 / 武器等级在重载后立即生效。
  const initialSave: SaveDataV3 = save.loadSync?.() ?? defaultSaveV3();
  const combat = new CombatRuntime({
    save: initialSave,
    bus: sharedBus,
    projectileOptions: { spreadDeg: DEMO_PROJECTILE_SPREAD_DEG, maxRangeM: DEMO_MAX_RANGE_M },
    onAttack: vfxOnAttack,
  });

  // ── TASK-04 经济系统运行时接线（ADR-TD-009 / D-207）────────────
  // bus 适配：EconomySystem 自己发的 run.settled / boss.defeated 由本场景唯一发布，
  // 避免结算屏重复弹出与 Boss 胜利链重入；其余事件照常进入共享总线。
  const economyBus: EventBusApi = {
    publish: <K extends GameEventType>(type: K, payload: GameEventMap[K]): void => {
      if (type === 'run.settled' || type === 'boss.defeated') return;
      combat.bus.publish(type, payload);
    },
    subscribe: <K extends GameEventType>(type: K, handler: (payload: GameEventMap[K]) => void) =>
      combat.bus.subscribe(type, handler),
    clearAll: () => undefined,
    listenerCount: (type: GameEventType) => combat.bus.listenerCount(type),
  };
  const economy = new EconomySystem(new SavePortV3Bridge(save), economyBus, combat.rng);
  // DEF-004：economyView 的本地别名，供本场景的局内读档 / QA 取证 / 对外出口共用，
  // 使 ADR「UI / 重开数据源」有真实消费者，而非只暴露不用。
  const economyView = (): Readonly<SaveDataV3> => economy.saveView;
  void economy.boot().then((report) => {
    if (report.issues.length > 0) {
      console.warn('[save] 启动存档校验问题，已按兜底档启动：', report.issues);
    }
  }).catch((err: unknown) => {
    // DEF-005：读档异步兜底，避免极端时序下产生 unhandled rejection。
    console.error('[save] 启动读档失败：', err);
  });
  // 显式初始化局内状态（registry / ledger / Boss 登记）；重开走整页重建，
  // 同实例内若未来接入局内重置也以本方法为唯一入口。
  economy.beginRun();

  // ── 统一掉落权威（方案 A）：EconomySystem 摇取 + 地面标记 + 最小自动拾取 ──
  // 集成层常量：domain/config 未定义拾取半径，取玩家直径的 3 倍；非平衡数值，不进 config。
  const PICKUP_RADIUS_M = PLAYER_MESH_DIAMETER_M * 3;
  const groundDrops = new Map<string, Mesh>();
  const groundDropHex = (drop: DropInstance): string => {
    if (drop.kind === 'gem') return '#8B5CF6';
    switch (drop.currencyId) {
      case 'gold': return '#F2C14E';
      case 'forestMaterial': return '#8FD14F';
      case 'forestCore': return '#5FD3BC';
      default: return '#6BA8FF'; // 四元素碎片共用冷色（纯视觉标记，不参与判定）
    }
  };
  /** 由 EconomySystem 的摇取结果铺地面可视标记；dropId 唯一锚点在 economy registry 内。 */
  const spawnGroundDrops = (drops: readonly DropInstance[]): void => {
    for (const drop of drops) {
      const mesh = MeshBuilder.CreateSphere(`drop_${drop.dropId}`, { diameter: 0.3, segments: 8 }, scene);
      const mat = new StandardMaterial(`dropMat_${drop.dropId}`, scene);
      const hex = groundDropHex(drop);
      mat.diffuseColor = Color3.FromHexString(hex);
      mat.emissiveColor = Color3.FromHexString(hex).scale(0.55);
      mat.specularColor = Color3.Black();
      mesh.material = mat;
      mesh.position.set(drop.pos.x, 0.2, drop.pos.z);
      mesh.isPickable = false;
      groundDrops.set(drop.dropId, mesh);
    }
  };
  /**
   * 击杀 → 经济摇取。掉落数值全部读冻结 config（damageConfig.loot），
   * 这里只把 defId / 控制档位映射成掉落表键（分类，不是平衡数值）。
   */
  const rollKillDrops = (defId: EnemyId, controlTier: 'normal' | 'elite' | 'boss', pos: Vec3): void => {
    let tier: LootTier = 'normal';
    if (controlTier === 'boss') tier = 'boss';
    else if (controlTier === 'elite') tier = 'elite';
    else if (defId === 'riftSpitter') tier = 'elemental';
    else if (defId === 'umbraDasher' || defId === 'riftNourisher') tier = 'reinforced';
    spawnGroundDrops(economy.rollDropsForKill({ tier, defId, pos }).drops);
  };

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
    // 方案 A：停用 TASK-05 的 defaultDropTable（另有硬编码 DROP_BASE，与 damageConfig.loot
    // 形成两张竞争掉落表）。保留 enemy.killed 事件形状不变，drops 恒空；
    // 唯一掉落来源改为场景层调 economy.rollDropsForKill，杜绝重复掉落。
    dropTable: () => [],
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
    // 美术规格 §5.1：圣经辨识色 + 低强度 emissive 微光；受主光/半球光产生明暗，
    // 不再 disableLighting 平涂（旧红方块/蓝球的根因）。
    const look = enemyLook(defId);
    const color = Color3.FromHexString(look.hex);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(look.emissiveScale);
    mat.specularColor = Color3.Black();
    mat.alpha = look.alpha;
    mesh.material = mat;
    mesh.position.set(pos.x, radiusM, pos.z);

    if (defId === 'riftWarden') {
      // 规格 §5.1：树皮躯干 + 裂隙紫发光核心。核心只做视觉，不参与任何判定。
      const core = MeshBuilder.CreateSphere('bossCore', { diameter: radiusM * 0.8, segments: 12 }, scene);
      const coreMat = new StandardMaterial('bossCoreMat', scene);
      coreMat.diffuseColor = Color3.Black();
      coreMat.emissiveColor = Color3.FromHexString('#8B5CF6').scale(0.8);
      coreMat.specularColor = Color3.Black();
      core.material = coreMat;
      core.parent = mesh;
      // 相机在 -z 侧且俯视（alpha=-π/2, beta=0.56），核心朝 -z 并抬高才不被球体挡住。
      core.position.set(0, radiusM * 0.25, -radiusM * 0.75);
      core.isPickable = false;
    }
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
      // 击杀/奖励已由 BossAgent.defeat → VictorySettler 处理，不再广播 enemy.killed；
      // Boss 掉落由 EconomySystem 构造时的 boss.defeated 订阅直接入账（DEF-006，不铺地面）。
      return null;
    }
    const target = combat.registry.get(entityId);
    const kill = applyDamageNormal(entityId, dealt, _atSec);
    // 方案 A：registry 是击杀判定权威，EconomySystem 是掉落权威。
    // 击杀这一帧生成地面掉落（dropId 由 economy registry 分配，防重入由 ledger 保证）。
    if (kill) rollKillDrops(kill.defId, target?.tier ?? 'normal', kill.position);
    return kill;
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
    // ADR-TD-009：结算落盘交给 EconomySystem；UI 的 run.settled 仍由本场景唯一发布。
    // 风险1 修复：bossDefeated 由入参显式表达，删除原先 onBossDefeated() 置位绕过；
    // settleRun 内部与「内部标志」取或，兼容既有调用点且不重复记 bossKills。
    void economy.settleRun({
      victory,
      bossDefeated: victory,
      elapsedSec: combat.progression.clock.elapsedSec,
    }).then((report) => {
      // DEF-002：落盘失败不误报成功；EconomySystem 已吞掉存储异常，这里只做可见提示。
      if (!report.persisted) {
        console.error('[save] 结算落盘失败，本局进度未保存（金币/宝石/成长保持上一档）');
      }
    }).catch((err: unknown) => {
      console.error('[save] 结算出现未预期错误：', err);
    });
    // 结算屏读本局账本真实数据（与 settleRun 入账同源），不再硬编码 0。
    combat.bus.publish('run.settled', { victory, pickedResources: economy.runLootView });
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
  // DEF-006：Boss 掉落不再在此处铺地面。原先本订阅晚于 bossBridge 的
  // boss.defeated→setPhase('victory')→settleRun 快照注册，掉落生成永远晚于结算账本快照，
  // 且 Boss 在 z=-8、拾取半径 2.1m 玩家拾不到，导致 Boss 掉落永不入账。
  // 现将 Boss 掉落改由 EconomySystem 构造时抢先订阅 boss.defeated 并直接入账（跳过地面）；
  // 普通击杀的地面拾取链（rollKillDrops → spawnGroundDrops → 半径拾取）不受影响。
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
    // 文案 resolver 优先级：宿主显式注入 > 数据源自带 > 正式英文表兜底。
    // 不接 ?debug=1：调试标签只属于骨架验收路径，正式画面必须是玩家可见英文。
    text: deps.text ?? uiSources.text ?? enResolver,
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
    // DEF-004：局内玩家金币初值来自 economyView()（已落盘的永久档），不再是写死的 0。
    gold: economyView().currencies.gold,
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
    // 圣经色反馈：法杖=焰橙主体，剑=米白点缀，冲刺=雾霭青高亮；不再是蓝球/粉球。
    const color = dashPulse > 0 || dashing
      ? Color3.FromHexString(FOREST_HEX.mist)
      : combat.weapons.current === 'sword'
        ? Color3.FromHexString(PLAYER_ACCENT_HEX)
        : Color3.FromHexString(PLAYER_BODY_HEX);
    toon.material.setColor3('baseColor', color);

    // 8) ⚠ DEMO 桩：纯视觉自动开火，仅 ?demo=1 启用（默认关闭，不产生伤害）
    if (demoMode && performance.now() - lastFire > gameConfig.vfx.autoFireIntervalMs) {
      lastFire = performance.now();
      projectiles.launch(player.position.clone().add(new Vector3(0, 0.5, 0)), {
        target: dummy.position.clone(),
        onHit: (pos) => void pos,
      });
    }

    // 8.5) 最小可用地面拾取：玩家半径内自动 pickup，不引入复杂物理。
    //      dropId 防重入由 EconomySystem + RunLedger 保证；重复拾取只入账一次。
    for (const [dropId, mesh] of groundDrops) {
      const drop = economy.registryView.get(dropId);
      if (!drop || drop.picked) {
        mesh.dispose();
        groundDrops.delete(dropId);
        continue;
      }
      if (Math.hypot(drop.pos.x - p.x, drop.pos.z - p.z) <= PICKUP_RADIUS_M) {
        economy.pickup(dropId);
        mesh.dispose();
        groundDrops.delete(dropId);
      }
    }

    // 9) TASK-07 UI：放在 combat.step 之后，读本帧最新快照
    ui.tick();
  });

  return {
    scene,
    cameraRig,
    toon,
    projectiles,
    combat,
    ui,
    economyView,
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
      economy: {
        gold: economyView().currencies.gold,
        forestMaterial: economyView().currencies.forestMaterial,
        gems: economyView().gemInventory.length,
        runsPlayed: economyView().stats.runsPlayed,
        bossKills: economyView().stats.bossKills,
      },
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
      for (const mesh of groundDrops.values()) mesh.dispose();
      groundDrops.clear();
      for (const mesh of enemyMeshes.values()) mesh.dispose();
      enemyMeshes.clear();
      scene.dispose();
    },
  };
}
