/**
 * 局内状态机 + 合法迁移表 + XP 曲线。
 *
 * 需求来源：
 *   - 设计-局内升级系统.md §1（升级选卡冻结 / 每级 3 选 1 / XP(L) = 40 × L^1.35）
 *   - 设计-设计总纲.md §6.5（中途退出按失败结算）
 *   - 总纲-项目规划书V1.md §2.6（metaProgress 0–10 级）
 *   - Q10 采信：V1.0 胜利 = 击杀 Boss，无第三结局
 *
 * 本文件禁止 import Babylon / DOM。
 */
import { upgradePoolConfig } from '../config/upgradePoolConfig.ts';

/**
 * 局内阶段。
 *
 * 状态图（→ 表示合法迁移）：
 *   boot → menu
 *   menu ⇄ metaHub
 *   menu|metaHub → runStarting → running
 *   running → upgradePick → running          （选卡期间时钟冻结）
 *   running → paused → running | menu        （暂停 / 切后台）
 *   running → victory | defeat               ← Q10：胜负唯一出口
 *   victory|defeat → metaHub | menu
 */
export type RunPhase =
  | 'boot' // 资源/存档加载
  | 'menu' // 主菜单
  | 'metaHub' // 局外准备：宝石镶嵌/合成/强化/金币成长（总纲 §9）
  | 'runStarting' // 选 seed、生成局面
  | 'running' // 战斗中，唯一推进 RunClock 的状态
  | 'upgradePick' // 升级三选一：时间冻结（升级文档 §1）+ 暂停语义
  | 'paused' // 手动暂停 / 切后台（input SystemState.suspended 映射到这里）
  | 'victory' // Boss 击败（Q10：唯一胜利路径）
  | 'defeat'; // 生命归零 / 中途退出按失败结算（总纲 §6.5）

/**
 * 合法迁移表（数据驱动）。非法迁移在开发期由 transitionPhase 打 console.error 并拒绝。
 *
 * 为什么 paused 允许回 menu：暂停菜单里通常有"退出到主菜单"，退出按失败结算
 * （总纲 §6.5），所以真实路径是 paused → defeat → menu；这里的 paused → menu
 * 仅用于**尚未开局**的暂停（如局外准备界面被系统暂停），由调用方保证语义。
 */
export const RUN_PHASE_TRANSITIONS: Readonly<Record<RunPhase, readonly RunPhase[]>> = {
  boot: ['menu'],
  menu: ['metaHub', 'runStarting'],
  metaHub: ['menu', 'runStarting'],
  runStarting: ['running'],
  running: ['upgradePick', 'paused', 'victory', 'defeat'],
  upgradePick: ['running'],
  paused: ['running', 'menu', 'defeat'],
  victory: ['metaHub', 'menu'],
  defeat: ['metaHub', 'menu'],
};

/** 判断某条迁移是否合法。 */
export function canTransition(from: RunPhase, to: RunPhase): boolean {
  return RUN_PHASE_TRANSITIONS[from].includes(to);
}

/**
 * 执行迁移：合法则返回新阶段，非法则在开发期打 console.error 并**保持原阶段**。
 *
 * 为什么要 console.error 而不是抛异常：非法迁移是开发期缺陷，但线上抛异常会让整个
 * 游戏黑屏（比停滞更糟）。开发期靠 error 日志暴露，线上靠停滞保护。
 */
export function transitionPhase(from: RunPhase, to: RunPhase): RunPhase {
  if (canTransition(from, to)) return to;
  console.error(`[runState] illegal phase transition: ${from} → ${to}`);
  return from;
}

/**
 * 升级所需经验：升到 L+1 级所需的 XP(L)。
 *
 * 公式：XP(L) = 40 × L^1.35（设计-局内升级系统.md §1，PROVISIONAL）
 *
 * ✅ **已裁定（玩法设计总监，经主理人转达）：以公式 `round(40 × L^1.35)` 为准**，
 *    文档 §1 附表 L1–10 的逐级需求仅为手算四舍五入的示例，附表偏差一律不修文档、不改实现。
 *
 * 差异明细（仅供比对，不构成缺陷）：
 *   附表 40 / 102 / 176 / 260 / **312** / 449 / 553 / **662** / 777 / **896**
 *   公式 40 / 102 / 176 / 260 / **351** / 449 / 553 / **663** / 777 / **895**
 *   → 5 处一致；L5 差 39、L8 差 1、L10 差 1（均为附表手算误差，L5 的 312 明显破坏单调增幅规律）。
 *
 * 本实现按**公式**执行（公式是规则，表是示例），并保留文档表作为
 * `DOC_XP_TABLE_L1_L10` 常量供 UI/QA 比对。**不要再把此处当作"待裁定分歧"上报**。
 *
 * @param level 当前等级（从 1 开始）；≤0 或非有限值按 1 处理（防止 NaN 污染经验条）
 * @returns 升到下一级所需经验（四舍五入到整数）
 */
export function xpToNextLevel(level: number): number {
  const lv = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  const { baseXp, exponent } = upgradePoolConfig.xpCurve;
  return Math.round(baseXp * Math.pow(lv, exponent));
}

/**
 * 文档 §1 附表原值（仅供比对/显示，**不参与计算**）。
 * 与 xpToNextLevel 的差异见该函数注释；该差异已由玩法设计总监裁定「以公式为准」，
 * 本常量保留只为让 UI/QA 能对照展示，**不得**被用作真实经验需求。
 */
export const DOC_XP_TABLE_L1_L10 = [40, 102, 176, 260, 312, 449, 553, 662, 777, 896] as const;

/**
 * 累积经验表（L1→L2 … L9→L10），供经济/UI 预计算用，避免每帧 Math.pow。
 * 长度 = maxRunLevel − 1 = 9。
 */
export function buildXpCurveTable(): readonly number[] {
  const table: number[] = [];
  for (let lv = 1; lv < upgradePoolConfig.xpCurve.maxRunLevel; lv++) {
    table.push(xpToNextLevel(lv));
  }
  return table;
}
