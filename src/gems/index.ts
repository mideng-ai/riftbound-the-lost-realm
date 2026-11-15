/** src/gems/index.ts — TASK-03 宝石系统桶导出 */
export {
  addGem,
  findGem,
  isSocketed,
  isValidGemId,
  isValidQuality,
  locateSocket,
  nextItemInstanceId,
  removeGem,
  type GemInventoryErrorCode,
  type GemResult,
} from './inventory.ts';
export {
  socketedEvent,
  socketedGemsOf,
  socketGem,
  unsocketedEvent,
  unsocketGem,
  isValidSlot,
  type SocketErrorCode,
  type SocketResult,
  type SocketedEventPayload,
  type UnsocketedEventPayload,
} from './socket.ts';
export { canMerge, mergeGems, mergedEvent, nextQuality, type MergeErrorCode, type MergeResult, type MergedEventPayload } from './merge.ts';
export {
  elementProcStates,
  lifestealHeal,
  vitalityPct,
  weaponGemStatBonuses,
  type ElementProcState,
  type WeaponGemStatBonuses,
} from './effects.ts';
export { resolveGemHit, type GemHitInput, type HitProcResolution, type ProcOutcome } from './proc.ts';
