/**
 * src/boss/index.ts — Boss Agent 桶导出（TASK-06）
 *
 * TASK-05（Spawn 系统）、TASK-07（HUD/预警渲染）、编排层从本桶导入。
 */
export type {
  BossPlayerPort,
  BossSummonPort,
  BossRewardPort,
  BossFeedbackPort,
  BossPorts,
  BossAgentState,
  TelegraphSnapshot,
  PersistentZone,
  WeaponHitInput,
  LastHitInfo,
  BossAgentOptions,
  BossSpawnPolicy,
} from './types.ts';
export { BossAgent } from './bossAgent.ts';
export type { TelegraphShape } from './telegraph.ts';
export { pointInTelegraph, somePointInside, headingRad } from './telegraph.ts';
export type { AttackKind, ShapeContext } from './attacks.ts';
export { attackKind, buildAttackShape, vineZoneDurationSec, summonCountOf } from './attacks.ts';
export type { DodgeabilityRow } from './tempo.ts';
export { phaseAttackPool, attackIntervalSec, maxTelegraphSec, dodgeabilityReport } from './tempo.ts';
export { SummonDirector } from './summons.ts';
export { VictorySettler } from './victory.ts';
