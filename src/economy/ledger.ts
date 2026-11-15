/**
 * src/economy/ledger.ts — 本局资源账本（防重复入账）
 *
 * 验收：拾取一次只入账一次。
 *   dropId 唯一锚点 + picked 状态：重复拾取返回 already-picked，
 *   账本/流水/事件均只记一次。
 *
 * 累计形状直接用领域契约 SaveRunLoot：
 *   { gold, forestMaterial, shards: Record<ElementId, number>, gems: GemInventoryItem[] }
 */

import type {
  EventBusApi,
  GemInventoryItem,
  SaveRunLoot,
} from '../domain/index.ts';
import { SHARD_ELEMENT_BY_CURRENCY } from './economyConfig.ts';
import type { DropInstance, PickupResult } from './types.ts';

export class RunLedger {
  private readonly pickedIds = new Set<string>();
  private readonly pickedLog: DropInstance[] = [];
  private gold = 0;
  private forestMaterial = 0;
  private readonly shards: Record<string, number> = {
    fire: 0,
    ice: 0,
    lightning: 0,
    shadow: 0,
  };
  private readonly gems: GemInventoryItem[] = [];
  private readonly bus: EventBusApi;

  constructor(bus: EventBusApi) {
    this.bus = bus;
  }

  /** 拾取入账（防重入核心） */
  pickup(drop: DropInstance): PickupResult {
    if (this.pickedIds.has(drop.dropId)) {
      return { ok: false, reason: 'already-picked' };
    }
    this.pickedIds.add(drop.dropId);
    drop.picked = true;
    this.pickedLog.push(drop);

    if (drop.kind === 'gem') {
      this.gems.push(drop.item);
    } else {
      switch (drop.currencyId) {
        case 'gold':
          this.gold += drop.amount;
          break;
        case 'forestMaterial':
          this.forestMaterial += drop.amount;
          break;
        case 'forestCore':
          // 森林核心只由 Boss 胜利奖励入账（总纲 §6.5），地面不产出；
          // 若未来出现地面核心掉落，此处也不入账，避免绕过胜利条件。
          break;
        default: {
          const element = SHARD_ELEMENT_BY_CURRENCY[drop.currencyId];
          if (element !== undefined) {
            this.shards[element] = (this.shards[element] ?? 0) + drop.amount;
          }
        }
      }
      this.bus.publish('resource.picked_up', {
        currencyId: drop.currencyId,
        amount: drop.amount,
      });
    }
    return { ok: true, drop };
  }

  /** 本局已拾取资源（结算入账与 run.settled 事件的 pickedResources） */
  buildRunLoot(): SaveRunLoot {
    return {
      gold: this.gold,
      forestMaterial: this.forestMaterial,
      shards: {
        fire: this.shards.fire,
        ice: this.shards.ice,
        lightning: this.shards.lightning,
        shadow: this.shards.shadow,
      },
      gems: [...this.gems],
    };
  }

  get pickedCount(): number {
    return this.pickedIds.size;
  }

  get pickedDrops(): readonly DropInstance[] {
    return this.pickedLog;
  }
}
