/**
 * src/gems/socket.ts — 镶嵌 / 拆卸（TASK-03）
 *
 * 规则（任务书 + 总纲 §5.5）：
 *   - 每把武器 3 槽（slotsPerWeapon 来自 config，不硬编码）
 *   - 槽存 itemInstanceId（Q6 签收）
 *   - 镶嵌宝石在局内不被意外替换：目标槽非空必须先显式拆卸，不做隐式顶替
 *   - 同一实例同一时刻只能在一个槽（跨武器也不行）
 *   - 同种多颗（不同实例）允许重复镶嵌 → 效果走重复倍率（effects.ts）
 *
 * 事件：domain 事件表已定义 'gem.socketed' / 'gem.unsocketed'（events.ts），
 * 本模块返回事件 payload，由调用方（场景接线层）负责 publish——领域纯函数不持有总线。
 */
import type { WeaponId } from '../domain/ids.ts';
import type { SaveDataV3 } from '../domain/save.ts';
import type { GameEventMap } from '../domain/events.ts';
import { gemConfig } from '../config/gemConfig.ts';
import { findGem, isSocketed, type GemInventoryErrorCode, type GemResult } from './inventory.ts';

export type SocketErrorCode = GemInventoryErrorCode | 'GEM_BAD_SLOT' | 'GEM_SLOT_OCCUPIED' | 'GEM_ALREADY_SOCKETED' | 'GEM_SLOT_EMPTY';
export type SocketResult = GemResult<SaveDataV3> | { readonly ok: false; readonly code: SocketErrorCode; readonly message: string };

/** 镶嵌成功后应发布的事件 payload（'gem.socketed'）。 */
export type SocketedEventPayload = GameEventMap['gem.socketed'];
export type UnsocketedEventPayload = GameEventMap['gem.unsocketed'];

const SLOT_VALUES: readonly (0 | 1 | 2)[] = [0, 1, 2];

/** 槽位合法性（0–slotsPerWeapon−1，当前契约 = 0/1/2）。 */
export function isValidSlot(slot: number): slot is 0 | 1 | 2 {
  return SLOT_VALUES.includes(slot as 0 | 1 | 2) && slot < gemConfig.slotsPerWeapon;
}

/**
 * 镶嵌一颗库存宝石到指定武器槽位。
 *
 * 拒绝条件（全部显式报错，绝不静默换槽/顶替）：
 *   - 槽位越界
 *   - 实例不在库存
 *   - 实例已镶嵌（任意武器任意槽）
 *   - 目标槽非空（须先 unsocketGem）
 */
export function socketGem(save: SaveDataV3, weaponId: WeaponId, slot: number, itemInstanceId: string): SocketResult {
  if (!isValidSlot(slot)) {
    return { ok: false, code: 'GEM_BAD_SLOT', message: `槽位 ${slot} 越界（合法 0–${gemConfig.slotsPerWeapon - 1}）` };
  }
  const gem = findGem(save, itemInstanceId);
  if (!gem) {
    return { ok: false, code: 'GEM_NOT_FOUND', message: `itemInstanceId 不在库存: ${itemInstanceId}` };
  }
  if (isSocketed(save, itemInstanceId)) {
    return { ok: false, code: 'GEM_ALREADY_SOCKETED', message: `宝石 ${itemInstanceId} 已镶嵌，不可重复进槽` };
  }
  const current = save.weapons[weaponId].sockets[slot];
  if (current !== null) {
    return { ok: false, code: 'GEM_SLOT_OCCUPIED', message: `槽位被 ${current} 占用，须先拆卸（禁止隐式顶替）` };
  }
  const sockets = [...save.weapons[weaponId].sockets] as (string | null)[];
  sockets[slot] = itemInstanceId;
  return {
    ok: true,
    save: { ...save, weapons: { ...save.weapons, [weaponId]: { ...save.weapons[weaponId], sockets } } },
  };
}

/** 镶嵌成功后要发布的 'gem.socketed' payload。 */
export function socketedEvent(saveAfter: SaveDataV3, weaponId: WeaponId, slot: 0 | 1 | 2): SocketedEventPayload {
  return { weaponId, slot, itemInstanceId: saveAfter.weapons[weaponId].sockets[slot]! };
}

/** 拆卸指定槽（空槽报错）。返回拆卸后的存档与被拆实例 ID。 */
export function unsocketGem(
  save: SaveDataV3,
  weaponId: WeaponId,
  slot: number,
): { readonly ok: true; readonly save: SaveDataV3; readonly removed: string } | { readonly ok: false; readonly code: SocketErrorCode; readonly message: string } {
  if (!isValidSlot(slot)) {
    return { ok: false, code: 'GEM_BAD_SLOT', message: `槽位 ${slot} 越界` };
  }
  const removed = save.weapons[weaponId].sockets[slot];
  if (removed === null) {
    return { ok: false, code: 'GEM_SLOT_EMPTY', message: `${weaponId} 槽 ${slot} 为空` };
  }
  const sockets = [...save.weapons[weaponId].sockets] as (string | null)[];
  sockets[slot] = null;
  return {
    ok: true,
    removed,
    save: { ...save, weapons: { ...save.weapons, [weaponId]: { ...save.weapons[weaponId], sockets } } },
  };
}

/** 拆卸后要发布的 'gem.unsocketed' payload。 */
export function unsocketedEvent(weaponId: WeaponId, slot: 0 | 1 | 2): UnsocketedEventPayload {
  return { weaponId, slot };
}

/** 某武器当前镶嵌的宝石列表（按槽序，跳过空槽）。 */
export function socketedGemsOf(save: SaveDataV3, weaponId: WeaponId): readonly { readonly slot: number; readonly gem: SaveDataV3['gemInventory'][number] }[] {
  const byId = new Map(save.gemInventory.map((g) => [g.itemInstanceId, g] as const));
  const out: { slot: number; gem: SaveDataV3['gemInventory'][number] }[] = [];
  save.weapons[weaponId].sockets.forEach((id, slot) => {
    const gem = id === null ? undefined : byId.get(id);
    if (gem) out.push({ slot, gem });
  });
  return out;
}
