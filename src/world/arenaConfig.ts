/**
 * TASK-05 ｜ 失落森林场地配置（单张固定地图）
 *
 * 任务书 B 节：失落森林单张地图；障碍物、边界、合法生成点标记；
 * 玩家周边安全生成（不得无预警近身刷怪）。
 * 红线：不做区域解锁、不做地图轮换。
 *
 * ⚠ 本文件是 TASK-05 自有模块数据（非 domain/config 冻结契约）：
 * 场地布局是本任务交付的新内容，数值 PROVISIONAL（渲染联调时校准）。
 */

/** 地图半边长（米）：场地 [-size, size]²，共 60×60 */
export const ARENA_HALF_SIZE_M = 30;

/** 障碍物（圆形近似：树干/岩石/遗迹） */
export interface ArenaObstacleDef {
  readonly x: number;
  readonly z: number;
  readonly radiusM: number;
  readonly kind: 'tree' | 'rock' | 'ruin';
}

/** 失落森林障碍布置（手工固化；PROVISIONAL） */
export const ARENA_OBSTACLES: readonly ArenaObstacleDef[] = [
  { x: -12, z: 8, radiusM: 1.2, kind: 'tree' },
  { x: 10, z: 14, radiusM: 1.5, kind: 'tree' },
  { x: 18, z: -6, radiusM: 1.2, kind: 'tree' },
  { x: -20, z: -14, radiusM: 1.8, kind: 'rock' },
  { x: 4, z: -20, radiusM: 1.4, kind: 'rock' },
  { x: -6, z: 22, radiusM: 1.6, kind: 'ruin' },
  { x: 22, z: 18, radiusM: 2.0, kind: 'ruin' },
  { x: -24, z: 4, radiusM: 1.3, kind: 'tree' },
];

/** 生成点网格参数 */
export const SPAWN_GRID = {
  /** 网格步长（米） */
  stepM: 5,
  /** 候选点与障碍物的净空 */
  clearanceM: 0.8,
  /** 候选点与边界的净空 */
  borderClearanceM: 1.5,
} as const;

/** 玩家安全生成参数（任务书：不得无预警近身刷怪） */
export const SAFE_SPAWN = {
  /** 玩家周边最小生成距离（米）— PROVISIONAL（任务书未定数，取 3×玩家射程量级） */
  minDistanceFromPlayerM: 12,
  /** 与既有敌人最小间隔（米，防叠怪） */
  minDistanceBetweenEnemiesM: 1.2,
} as const;

/** 玩家出生点（地图中心空地） */
export const PLAYER_SPAWN = { x: 0, z: 0 } as const;
