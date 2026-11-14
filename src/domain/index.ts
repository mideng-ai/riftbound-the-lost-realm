/**
 * 领域层桶导出（barrel）。
 *
 * 对外契约：**外部模块只允许从 `domain` 导入**（提案 §1 分层铁律 L5），
 * 不允许深路径 `import ... from '../domain/damage'`。好处是：
 *   - 重组内部文件不破坏下游导入；
 *   - 一眼能看出谁依赖了领域层。
 *
 * 导出纪律：
 *   - `export type` 导出纯类型（verbatimModuleSyntax 下不会产生运行时 import）；
 *   - `export` 导出**函数/类/常量**（有运行时实现）。
 *
 * 注意：本文件不导出任何 Babylon / DOM 相关内容（L3）。
 */

// ── 基础原语 ─────────────────────────────────────────────────
export {
  INVALID_ENTITY_ID,
  createPoolTemplate,
} from './types.ts';
export type { EntityId, Vec3, Transform, Rng, RngFactory, Mutable } from './types.ts';

// ── 标识符 ───────────────────────────────────────────────────
export type {
  WeaponId,
  WeaponUpgradeLevel,
  GemId,
  GemQuality,
  CurrencyId,
  EliteAffixId,
  WorldEventId,
  BossPhase,
  ElementId,
  EnemyId,
  NormalEnemyId,
  EliteEnemyId,
  EntityKind,
} from './ids.ts';

// ── 时钟 ─────────────────────────────────────────────────────
export { RunClock } from './clock.ts';
export type { RunClockApi, RunClockOptions } from './clock.ts';

// ── 伤害 ─────────────────────────────────────────────────────
export {
  rebuildDamageLayers,
  resolveDamageHit,
  computeShotDamage,
  baseWeaponDamage,
  baseWeaponIntervalSec,
  elementProcDef,
  elementProcChance,
  QUALITY_ORDER,
  createEmptyStatusSlots,
  effectiveControlCaps,
  controlCapsTable,
  enemyTierOf,
  eliteBaseEnemyId,
  C_ZONE_DERIVED_CATEGORIES,
  SPLIT_SHOT_BUFF_ID,
  VAMPIRIC_BLADE_BUFF_ID,
  KILL_HEAL_BUFF_ID,
} from './damage.ts';
export type {
  OutrunBaseLayerInput,
  GemDamageEntry,
  GemDamageLayerInput,
  InRunBuffCategory,
  InRunBuffEntry,
  DamageLayers,
  CZoneBreakdown,
  DamageCaps,
  ElementEffect,
  ElementProcDef,
  ControlTier,
  ControlCaps,
  EffectiveControlCaps,
  StatusSlots,
  DamageSource,
  DamageHitRequest,
  DamageResult,
} from './damage.ts';

// ── 敌人 ─────────────────────────────────────────────────────
export {
  eliteAffixDef,
  FORBIDDEN_AFFIX_PAIRS,
  isForbiddenAffixPair,
  bossDefinition,
  bossPhaseAtHp,
  isNormalEnemyId,
  isEliteEnemyId,
  normalEnemyDefinition,
  eliteStats,
  NORMAL_ENEMY_IDS,
  ELITE_ENEMY_IDS,
} from './enemy.ts';
export type {
  EnemyBehavior,
  EnemyDefinition,
  EliteAffixParams,
  EliteAffixDef,
  EliteStatMultipliers,
  BossAttackId,
  BossAttackDef,
  BossPhaseRange,
  BossDefinition,
  EliteDerivedStats,
} from './enemy.ts';

// ── 波次 / 时间轴 ────────────────────────────────────────────
export {
  RUN_TIMELINE,
  VICTORY_CONDITION,
  wavePhases,
  phaseAtSec,
  bossPeriodRule,
  worldEventSchedule,
  worldEventDefs,
  canSpawnWorldEvent,
  eliteAllowedAt,
} from './wave.ts';
export type {
  RunTimelineConst,
  EliteRule,
  WavePhaseLabel,
  WavePhaseDef,
  BossPeriodRule,
  WorldEventSchedule,
  WorldEventParams,
  WorldEventDef,
} from './wave.ts';

// ── 玩家 ─────────────────────────────────────────────────────
export {
  playerDefinition,
  deriveMaxHp,
  forestSurvivalPctOfLevel,
  weaponIntervalSec,
  dashCooldownSec,
  dashSpeedMps,
  createPlayerRuntime,
  applyPlayerDamage,
} from './player.ts';
export type { PlayerDefinition, PlayerRuntime } from './player.ts';

// ── 局外永久成长等级换算（D-08 里程碑的唯一入口） ────────────
// 放在 domain 桶里导出，业务侧（NEW-03 结算 / metaHub UI / TASK-04 经济）都能从 'domain' 取，
// 不需要深路径 import 到 config（提案 L5）。
export { metaGrowthPctOfLevel, masteryPctOfLevel, metaGrowthCost } from '../config/playerConfig.ts';
export type { MetaGrowthTrack } from '../config/playerConfig.ts';

// ── 状态机 ───────────────────────────────────────────────────
export {
  RUN_PHASE_TRANSITIONS,
  canTransition,
  transitionPhase,
  xpToNextLevel,
  buildXpCurveTable,
} from './runState.ts';
export type { RunPhase } from './runState.ts';

// ── 升级 ─────────────────────────────────────────────────────
export {
  allUpgradeCards,
  upgradeCard,
  isCardAtCap,
  isCardMaxed,
  rollUpgradeChoices,
  cardToBuffEntry,
} from './upgrade.ts';
export type { UpgradeId, UpgradeTier, UpgradeEffect, UpgradeCardDef, UpgradeRollContext } from './upgrade.ts';

// ── 事件 ─────────────────────────────────────────────────────
export {
  EventBus,
  createEventBus,
  createRunSnapshot,
  updateRunSnapshot,
  createMulberry32,
  rngFactory,
} from './events.ts';
export type {
  GameEventMap,
  GameEventType,
  GameEvent,
  Unsubscribe,
  EventBusApi,
  LootRoll,
  RunSnapshot,
} from './events.ts';

// ── 存档 ─────────────────────────────────────────────────────
export {
  SAVE_SCHEMA_VERSION,
  createEmptyWeaponSlot,
  defaultSaveV3,
  migrateV2toV3,
  migrateSave,
  validateSaveV3,
} from './save.ts';
export type {
  WeaponSaveSlot,
  GemInventoryItem,
  SaveRunLoot,
  SaveCurrencies,
  SaveMetaProgress,
  SaveSettings,
  SaveStats,
  SaveDataV3,
} from './save.ts';

// ── 音频 ─────────────────────────────────────────────────────
export {
  AUDIO_EVENT_MAP,
  sfxForEvent,
  sfxForProc,
  sfxForPickup,
  sfxForBossPhase,
  sfxForBossWarnCheckpoint,
  sfxForAffix,
  mixerPriorityOf,
  resolveSfxForEvent,
} from './audio.ts';
export type { AudioEventId, MixerPriorityLevel, AudioEventMap } from './audio.ts';
