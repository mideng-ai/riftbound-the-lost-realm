/**
 * src/boss/types.ts — Boss Agent 端口与运行时类型（TASK-06）
 *
 * 分层合规：
 * - 领域契约（src/domain）与数值配置（src/config）均为【冻结契约，只读引用】。
 *   本文件只 import type / 从 domain 桶取形状，不修改任何契约文件。
 * - 伤害结算走 domain 的 resolveDamageHit（破甲只在此乘一次）；
 *   奖励经 Economy/Reward 端口发放，Boss 不碰存档、不碰 UI；
 *   渲染层从只读快照与反馈回调取数据，Boss 不 import Babylon / DOM。
 */
import type {
  BossAttackDef,
  BossAttackId,
  BossPhase,
  DamageLayers,
  DamageSource,
  ElementId,
  EnemyId,
  EntityId,
  EventBusApi,
  Rng,
  Vec3,
  WeaponId,
} from '../domain/index.ts';
import type { TelegraphShape } from './telegraph.ts';

/** 玩家侧查询 / 结算端口（战斗层接线）。 */
export interface BossPlayerPort {
  playerPos(): Vec3;
  playerAlive(): boolean;
  /** 对玩家施加伤害（来源标注具体 Boss 攻击，供反馈/统计）。 */
  damagePlayer(amount: number, attack: BossAttackId): void;
}

/** 生成端口（TASK-05 Spawn 系统接线；计数含 Boss 期全部普通怪）。 */
export interface BossSummonPort {
  /** 当前场上普通怪数量（含召唤物与补充猎犬）。 */
  normalCount(): number;
  /** 生成一只猎犬（ID 由 bossPeriodRule().replenish.enemyId 提供）。 */
  spawnHound(defId: EnemyId, at: Vec3): void;
  /** 生成一只森林召唤物（ID 由调用方从契约敌人集合给出）。 */
  spawnMinion(defId: EnemyId, at: Vec3): void;
}

/** 奖励端口（Economy/Reward 接口，TASK-04 实现；Boss 不发资源、不改存档）。 */
export interface BossRewardPort {
  grantBossVictory(): void;
}

/** 反馈端口（UI / VFX / 音频接线；事件表未定义的细粒度反馈走回调，不污染契约事件）。 */
export interface BossFeedbackPort {
  onTelegraph?(attack: BossAttackId, shape: TelegraphShape, warningSec: number): void;
  onAttackResolved?(attack: BossAttackId, hitPlayer: boolean): void;
  onCoreExposed?(seconds: number): void;
}

export interface BossPorts {
  /** 本局已进行秒数（接 RunClock.elapsedSec，用于契约事件 atSec 与「误差 ≤ 1 帧」验收）。 */
  clockElapsedSec(): number;
  player: BossPlayerPort;
  summons: BossSummonPort;
  rewards: BossRewardPort;
  /** 契约事件总线（publish 'boss.spawned' / 'boss.phase_changed' / 'boss.defeated' 等）。 */
  bus: EventBusApi;
  rng: Rng;
  feedback?: BossFeedbackPort;
}

export type BossAgentState = 'dormant' | 'active' | 'defeated';

/** 当前地面预警快照（渲染层画贴花的唯一数据源）。 */
export interface TelegraphSnapshot {
  readonly attack: BossAttackId;
  readonly def: BossAttackDef;
  readonly shape: TelegraphShape;
  readonly timeLeftSec: number;
  readonly totalSec: number;
}

/** 持续危险区（腐化藤蔓）。 */
export interface PersistentZone {
  readonly attack: BossAttackId;
  readonly shape: TelegraphShape;
  readonly damagePerSec: number;
  remainingSec: number;
}

/** 玩家武器命中入参。baseDamage = 已乘 A×B×C 的面板值（不含破甲）。 */
export interface WeaponHitInput {
  readonly source: DamageSource;
  readonly weapon: WeaponId;
  readonly element: ElementId | null;
  readonly baseDamage: number;
  readonly layers: DamageLayers;
  readonly hitPos: Vec3;
}

/** 最近一次受击记录（「不免疫」验收的观测面）。 */
export interface LastHitInfo {
  readonly source: DamageSource;
  readonly weapon: WeaponId;
  readonly element: ElementId | null;
  readonly dealt: number;
}

export interface BossAgentOptions {
  /** Boss 实体 ID（由 NEW-01/NEW-02 实体管理器接线；结算器只透传 targetId）。 */
  readonly entityId?: EntityId;
}

/** Boss 期刷怪策略（TASK-05 接线用；全部从冻结契约 bossPeriodRule() 派生）。 */
export interface BossSpawnPolicy {
  /** 停止常规刷怪（契约：Boss 期停刷）。 */
  readonly regularSpawnsEnabled: false;
  /** 精英全禁（契约 eliteBanned）。 */
  readonly eliteAllowed: boolean;
  /** 普通怪同屏上限（契约 normalCap）。 */
  readonly maxNormals: number;
  /** 登场不清场（契约 clearOnSpawn）。 */
  readonly clearOnSpawn: boolean;
}

export type { BossPhase, BossAttackDef };
