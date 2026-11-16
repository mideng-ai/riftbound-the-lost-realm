/** TASK-05 Enemy 系统桶导出 */
export { Enemy } from './enemy.ts';
export { HoundEnemy } from './hound.ts';
export { SpitterEnemy } from './spitter.ts';
export { DasherEnemy } from './dasher.ts';
export { NourisherEnemy } from './nourisher.ts';
export { EnemyManager } from './manager.ts';
export { BEHAVIOR_EXTRA } from './behaviorParams.ts';
export { defaultDropTable } from './defaultDropTable.ts';
export type { EnemyActivateOptions } from './enemy.ts';
export type { EnemyManagerDeps, SpawnOptions, ProjectileState, DropTablePort } from './manager.ts';
export type {
  PlayerSnapshot, PlayerDamagePort, InRunBuffPort, GoldSpendPort, SpawnRequestPort,
  ProjectileSink, EnemyTickContext, EventWorldContext, PoisonCloud,
} from './types.ts';
