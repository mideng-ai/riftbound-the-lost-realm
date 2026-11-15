/**
 * src/gems/merge.ts — 三合一合成（TASK-03，总纲 §5.6）
 *
 * 规则（CONFIRMED）：
 *   - 三颗相同种类、相同品质 → 一颗同种高一级品质
 *   - 不随机、不失败（确定性）
 *   - 传说（topQuality 来自 config）不可继续合成
 *   - 镶嵌中的宝石不可作材料（须先拆卸）
 *
 * 事件：'gem.merged' payload 由 mergedEvent() 构造，调用方负责 publish。
 */
import type { GemId, GemQuality } from '../domain/ids.ts';
import type { SaveDataV3 } from '../domain/save.ts';
import type { GameEventMap } from '../domain/events.ts';
import { GEM_QUALITY_MULT_CONST } from '../config/common.ts';
import { gemConfig } from '../config/gemConfig.ts';
import { findGem, isSocketed, nextItemInstanceId } from './inventory.ts';

export type MergeErrorCode = 'GEM_MERGE_COUNT' | 'GEM_MERGE_KIND' | 'GEM_MERGE_QUALITY' | 'GEM_MERGE_TOP' | 'GEM_MERGE_SOCKETED' | 'GEM_MERGE_NOT_FOUND' | 'GEM_MERGE_DUP_IDS';
export type MergeResult =
  | { readonly ok: true; readonly save: SaveDataV3; readonly produced: { readonly itemInstanceId: string; readonly gemId: GemId; readonly quality: GemQuality } }
  | { readonly ok: false; readonly code: MergeErrorCode; readonly message: string };

export type MergedEventPayload = GameEventMap['gem.merged'];

/** 品质序列（低→高；与 GEM_QUALITY_MULT_CONST 键序一致）。 */
const QUALITY_ORDER: readonly GemQuality[] = Object.keys(GEM_QUALITY_MULT_CONST) as readonly GemQuality[];

/** 升一级品质；传说返回 null（不可再合）。 */
export function nextQuality(quality: GemQuality): GemQuality | null {
  const idx = QUALITY_ORDER.indexOf(quality);
  if (idx < 0 || idx >= QUALITY_ORDER.length - 1) return null;
  return QUALITY_ORDER[idx + 1]!;
}

/** 静态可合成判定（只读，不产新存档；供 UI 置灰按钮用）。 */
export function canMerge(save: SaveDataV3, itemInstanceIds: readonly string[]): { readonly ok: boolean; readonly reason?: MergeErrorCode; readonly message?: string } {
  const required = gemConfig.merge.requiredCount;
  if (itemInstanceIds.length !== required) {
    return { ok: false, reason: 'GEM_MERGE_COUNT', message: `合成需要恰好 ${required} 颗（收到 ${itemInstanceIds.length}）` };
  }
  if (new Set(itemInstanceIds).size !== itemInstanceIds.length) {
    return { ok: false, reason: 'GEM_MERGE_DUP_IDS', message: '材料实例 ID 重复' };
  }
  const gems = itemInstanceIds.map((id) => findGem(save, id));
  if (gems.some((g) => g === undefined)) {
    return { ok: false, reason: 'GEM_MERGE_NOT_FOUND', message: '部分材料不在库存' };
  }
  const first = gems[0]!;
  if (gems.some((g) => g!.gemId !== first.gemId)) {
    return { ok: false, reason: 'GEM_MERGE_KIND', message: '合成要求同种宝石' };
  }
  if (gems.some((g) => g!.quality !== first.quality)) {
    return { ok: false, reason: 'GEM_MERGE_QUALITY', message: '合成要求同品质宝石' };
  }
  if (first.quality === gemConfig.merge.topQuality) {
    return { ok: false, reason: 'GEM_MERGE_TOP', message: '传说品质不可继续合成' };
  }
  if (itemInstanceIds.some((id) => isSocketed(save, id))) {
    return { ok: false, reason: 'GEM_MERGE_SOCKETED', message: '镶嵌中的宝石不可作材料（须先拆卸）' };
  }
  return { ok: true };
}

/**
 * 执行合成（确定性）：消耗 requiredCount 颗材料，产出同种高一级 1 颗。
 * 拒绝时零副作用（返回原存档引用不成立——本函数是纯函数，拒绝分支不构造新对象）。
 */
export function mergeGems(save: SaveDataV3, itemInstanceIds: readonly string[]): MergeResult {
  const check = canMerge(save, itemInstanceIds);
  if (!check.ok) return { ok: false, code: check.reason!, message: check.message! };

  const materials = itemInstanceIds
    .map((id) => findGem(save, id)!)
    .sort((a, b) => a.itemInstanceId.localeCompare(b.itemInstanceId));
  const fromQuality = materials[0]!.quality;
  const toQuality = nextQuality(fromQuality)!;
  const gemId = materials[0]!.gemId;

  const materialSet = new Set(itemInstanceIds);
  const produced = { itemInstanceId: nextItemInstanceId(save), gemId, quality: toQuality };

  return {
    ok: true,
    produced,
    save: { ...save, gemInventory: [...save.gemInventory.filter((g) => !materialSet.has(g.itemInstanceId)), produced] },
  };
}

/** 合成成功后要发布的 'gem.merged' payload。 */
export function mergedEvent(gemId: GemId, fromQuality: GemQuality, toQuality: GemQuality): MergedEventPayload {
  return { gemId, fromQuality, toQuality };
}
