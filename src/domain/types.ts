/**
 * 领域基础原语：实体 ID、坐标、变换、随机数、对象池模板工具。
 *
 * 本文件是全项目最底层契约：禁止 import Babylon / DOM 模块（分层铁律 L3），
 * 也不 import config（它连数值都不需要，只定义形状）。
 *
 * 为什么 EntityId 用「品牌类型」而不是裸 number：
 *   裸 number 会被 TS 当成万能下标，`enemies[playerId]` 这种手误编译期抓不到。
 *   加上 `__brand` 后，必须显式 `as EntityId` 才能转换，把错误挡在编译期。
 */

/**
 * 实体唯一 ID：连续整数（非字符串），对象池友好，可直接作数组下标。
 * 分配由 realm 层（NEW-01/NEW-02 的实体管理器）负责，本契约只定义类型。
 */
export type EntityId = number & { readonly __brand: 'EntityId' };

/** 无效 / 空实体 ID（对象池的空槽标记）。 -1 不会与自增分配的正整数冲突。 */
export const INVALID_ENTITY_ID = -1 as EntityId;

/**
 * 世界坐标（米）。领域层用普通数字三元组；
 * 渲染层负责换算成 Babylon `Vector3`（L3：领域层不得持有引擎类型）。
 * y 固定为地面接触高度，俯视角主要用 x/z。
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 实体空间状态。字段固定、可复用同一对象原地改写（避免每帧分配）。 */
export interface Transform {
  /** 世界坐标；y 固定为地面接触高度，俯视角主要用 x/z */
  position: Vec3;
  /** 朝向角（0–360 度，俯视角平面内，0 = +X 方向） */
  facingDeg: number;
}

/** 可种子化随机数。TASK-01 验收要求「随机生成支持 seed」。 */
export interface Rng {
  /** [0, 1) 均匀分布 */
  next(): number;
  /** [min, max) 均匀分布 */
  range(min: number, max: number): number;
  /** [minInclusive, maxExclusive) 均匀整数 */
  int(minInclusive: number, maxExclusive: number): number;
  /**
   * 从非空数组等概率取一个元素。
   * @throws 传入空数组时抛错——空池取元素是调用方的逻辑错误，静默返回 undefined 会把 bug 推迟到运行时更深处。
   */
  pick<T>(arr: readonly T[]): T;
  /** 导出内部状态，便于 QA 复现平衡问题（总纲 §3.4 / 设计原则「可复现」） */
  snapshot(): number;
  /** 从快照恢复内部状态（`snapshot()` 的逆操作，用于复现某一帧之后的随机序列） */
  restore(state: number): void;
}

/** 随机数工厂：给定 seed 产出确定性序列，同 seed 必得同序列。 */
export type RngFactory = (seed: number) => Rng;

// ─────────────────────────────────────────────────────────────
// 零分配工具（createPoolTemplate）
// ─────────────────────────────────────────────────────────────

/** 去掉 readonly 修饰的映射类型：用于把 `as const` 模板复制成可写实例。 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * 对象池模板复制：把 config 里的只读模板（`as const`）浅拷贝成可写实例。
 *
 * 为什么需要它：数值在 config 里必须是只读的（防业务侧改配置污染全局），
 * 但运行时实体状态必须可写（受击扣血、计时器递减）。TS 的 `readonly` 是可写实例
 * 的反向约束，不能互相赋值，所以用 `Mutable<T>` 显式把**结构**转成可写，
 * 数值来源仍是模板本身（不写第二份数字）。
 *
 * 只做浅拷贝：嵌套对象仍与模板共享引用。实体运行时状态一律设计成「无嵌套对象、
 * 无数组」的扁平面板（见 StatusSlots），所以浅拷贝已足够。
 *
 * @param template config 中 `as const` 的只读模板
 * @returns 同结构的新对象（可写）
 */
export function createPoolTemplate<T extends object>(template: T): Mutable<T> {
  return { ...template };
}
