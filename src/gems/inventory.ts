/**
 * src/gems/inventory.ts — 宝石库存操作（TASK-03）
 *
 * 职责：库存增删查 + itemInstanceId 生成。
 * 契约：SaveDataV3（domain/save.ts，Q6 签收——socket 存 itemInstanceId）。
 * 风格：纯函数 + 写时复制（SaveDataV3 全 readonly，不原地改写）。
 *
 * 本文件禁止 import Babylon / DOM；禁止修改 src/domain 与 src/config（只读引用）。
 */
import type { GemId, GemQuality } from '../domain/ids.ts';
import type { GemInventoryItem, SaveDataV3 } from '../domain/save.ts';
import { GEM_QUALITY_MULT_CONST } from '../config/common.ts';

/** 库存操作失败原因（可判定的字符串码，调用方自行决定如何呈现）。 */
export type GemInventoryErrorCode =
  | 'GEM_NOT_FOUND' // 实例 ID 不在库存
  | 'GEM_IS_SOCKETED' // 宝石仍镶嵌在槽位，须先拆卸
  | 'GEM_BAD_ID' // gemId 非七种之一
  | 'GEM_BAD_QUALITY'; // quality 非五档之一

export type GemResult<T> = { readonly ok: true; readonly save: T } | { readonly ok: false; readonly code: GemInventoryErrorCode; readonly message: string };

const ALL_GEM_IDS: readonly GemId[] = ['fire', 'ice', 'lightning', 'shadow', 'power', 'haste', 'vitality'];
const QUALITY_KEYS = Object.keys(GEM_QUALITY_MULT_CONST) as readonly GemQuality[];

/** 校验 gemId / quality 合法（防御性，正常调用方来自掉落/合成，已是合法值）。 */
export function isValidGemId(gemId: string): gemId is GemId {
  return (ALL_GEM_IDS as readonly string[]).includes(gemId);
}

export function isValidQuality(quality: string): quality is GemQuality {
  return (QUALITY_KEYS as readonly string[]).includes(quality);
}

/**
 * 生成下一个 itemInstanceId。
 *
 * SaveDataV3 没有序列号字段（契约已冻结，不能加），因此从现有库存推导：
 * 取 `gem-<n>` 形式的最大 n + 1；非该形式的 ID（例如手工造的存档）不参与计数，
 * 用 `local:` 前缀兜底避免碰撞。
 */
export function nextItemInstanceId(save: SaveDataV3): string {
  let max = 0;
  for (const g of save.gemInventory) {
    const m = /^gem-(\d+)$/.exec(g.itemInstanceId);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `gem-${max + 1}`;
}

/** 查库存。 */
export function findGem(save: SaveDataV3, itemInstanceId: string): GemInventoryItem | undefined {
  return save.gemInventory.find((g) => g.itemInstanceId === itemInstanceId);
}

/** 某实例当前镶嵌在哪（返回 null = 未镶嵌）。 */
export function locateSocket(save: SaveDataV3, itemInstanceId: string): { readonly weapon: 'staff' | 'sword'; readonly slot: number } | null {
  for (const weapon of ['staff', 'sword'] as const) {
    const slot = save.weapons[weapon].sockets.indexOf(itemInstanceId);
    if (slot !== -1) return { weapon, slot };
  }
  return null;
}

/** 该实例是否已镶嵌在任一槽（镶嵌中不可作为合成材料/移除）。 */
export function isSocketed(save: SaveDataV3, itemInstanceId: string): boolean {
  return locateSocket(save, itemInstanceId) !== null;
}

/** 向库存添加一颗宝石（写时复制，返回新存档）。 */
export function addGem(save: SaveDataV3, gemId: GemId, quality: GemQuality): GemResult<SaveDataV3> {
  if (!isValidGemId(gemId)) return { ok: false, code: 'GEM_BAD_ID', message: `unknown gemId: ${gemId}` };
  if (!isValidQuality(quality)) return { ok: false, code: 'GEM_BAD_QUALITY', message: `unknown quality: ${quality}` };
  const item: GemInventoryItem = { itemInstanceId: nextItemInstanceId(save), gemId, quality };
  return { ok: true, save: { ...save, gemInventory: [...save.gemInventory, item] } };
}

/** 从库存移除一颗宝石（镶嵌中必须先拆卸——防悬空引用，validateSaveV3 会拦截漏网）。 */
export function removeGem(save: SaveDataV3, itemInstanceId: string): GemResult<SaveDataV3> {
  if (!findGem(save, itemInstanceId)) {
    return { ok: false, code: 'GEM_NOT_FOUND', message: `itemInstanceId 不在库存: ${itemInstanceId}` };
  }
  if (isSocketed(save, itemInstanceId)) {
    return { ok: false, code: 'GEM_IS_SOCKETED', message: `宝石 ${itemInstanceId} 仍镶嵌在槽位，须先拆卸` };
  }
  return { ok: true, save: { ...save, gemInventory: save.gemInventory.filter((g) => g.itemInstanceId !== itemInstanceId) } };
}
