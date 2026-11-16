/**
 * SavePort — v3 持久化接口（ADR-TD-009；D-207 已由负责人拍板关闭）。
 *
 * 后端：localStorage（实证见 st2003/e-save/README.md；决策见 docs/流程-决策日志.md ADR-TD-009）。
 * 载荷：直接承载冻结契约 SaveDataV3（src/domain/save.ts），不再经 V2.stash 套壳绕行。
 *
 * SaveDataV2 仅保留为历史迁移入参类型 —— 冻结契约 migrateV2toV3(v2) 依赖它；
 * 它不再是 SavePort 的读写载荷。修改本文件不得触碰 src/domain/**。
 */
import type { SaveDataV3 } from '../domain/save.ts';

/**
 * V2 历史存档形状（唯一用途：migrateV2toV3 的入参）。
 * 字段与原 SavePort v2 完全一致，保证旧档迁移行为逐字不变。
 */
export interface SaveDataV2 {
  schemaVersion: number;
  savedAt: string;
  profile: { gold: number; unlocks: string[] };
  inventory: Array<Record<string, unknown>>;
  stash: Array<Record<string, unknown>>;
  settings: { sfx: boolean; music: boolean };
}

export interface SavePort {
  /**
   * 载入当前档。首次运行 / 损坏 / 不可识别版本一律返回合法默认 V3 档，
   * 绝不抛错（存档坏了也不能让游戏起不来）。
   */
  load(): Promise<SaveDataV3>;

  /**
   * 原子持久化一份 V3 存档（实现须走「写临时键 → 校验 → 覆盖主档 → 删临时键」）。
   * 畸形档或存储写失败时抛错，且不得改动主档。
   */
  save(data: SaveDataV3): Promise<void>;

  /** 清空用户存档（设置菜单「重置」）；损坏隔离备份保留取证。 */
  reset(): Promise<void>;

  /**
   * 可选同步读档：localStorage 是同步 API，供同步构造 CombatRuntime 使用，
   * 使永久成长 / 武器等级在重载后立即生效。mock 后端同样实现，便于一致测试。
   * 不实现的后端走 defaultSaveV3() 兜底，不影响接口兼容。
   */
  loadSync?(): SaveDataV3;
}

/** 导出给需要声明 V3 载荷的适配层，避免各文件重复从 domain 取类型。 */
export type { SaveDataV3 };
