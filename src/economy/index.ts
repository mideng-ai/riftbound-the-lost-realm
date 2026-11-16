/**
 * src/economy/index.ts — 经济模块桶导出（TASK-04 交付面）
 *
 * 下游（TASK-05 刷怪 / TASK-07 UI / TASK-02 战斗）只从本桶导入，
 * 不深路径 import（分层铁律 L5）。
 */

export * from './economyConfig.ts';
export * from './types.ts';
export * from './drops.ts';
export * from './ledger.ts';
export * from './growth.ts';
export * from './weaponUpgrade.ts';
export * from './crafting.ts';
export * from './saveBridge.ts';
export * from './system.ts';
