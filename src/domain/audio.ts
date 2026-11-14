/**
 * 音频事件契约：AudioEventId 联合 + 领域事件 → 音效映射类型 + 解析函数。
 *
 * 事件名 = 音频-音效事件表.md §1–§4 原文；前缀规范 `sfx_<系统>_<动作>_<变体>`。
 * 映射数据在 config/audioEventMapConfig.ts（本文件只定义类型与查询逻辑）。
 *
 * 开放问题采信结论（Q7）：音效文件名**不动**（保留 sfx_proc_frost / sfx_proc_storm），
 * 契约侧统一用元素 ID（ice / lightning），由本文件的 resolveProcSfx 做转换。
 *
 * 音频引擎选型（Babylon AudioEngine vs 裸 Web Audio）是 D-OPEN，S6 前关闭——
 * 本契约不绑定引擎，只表达「何时该响什么音」。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import { audioEventMapConfig } from '../config/audioEventMapConfig.ts';
import type { BossPhase, CurrencyId, ElementId, EliteAffixId } from './ids.ts';
import type { GameEventMap, GameEventType } from './events.ts';

// ─────────────────────────────────────────────────────────────
// 音效 ID
// ─────────────────────────────────────────────────────────────

/**
 * 全部音效 ID（音效事件表 §1–§4 原文）。
 * 加了 `sfx_affix_${EliteAffixId}` 模板字面量，保证六种词缀音效无需手写六遍。
 */
export type AudioEventId =
  // 武器与战斗（§1）
  | 'sfx_staff_cast'
  | 'sfx_staff_hit'
  | 'sfx_sword_swing'
  | 'sfx_sword_hit'
  | 'sfx_proc_fire'
  | 'sfx_proc_frost' // 音效表原文 frost（Q7：文件名不动）
  | 'sfx_proc_storm' // 音效表原文 storm（Q7）
  | 'sfx_proc_shadow'
  | 'sfx_player_hurt'
  | 'sfx_player_death'
  | 'sfx_dash'
  // 成长与资源（§2）
  | 'sfx_pickup_gold'
  | 'sfx_pickup_material'
  | 'sfx_pickup_shard'
  | 'sfx_pickup_core'
  | 'sfx_levelup'
  | 'sfx_upgrade_pick'
  | 'sfx_gem_socket'
  | 'sfx_gem_unsocket'
  | 'sfx_gem_merge'
  | 'sfx_weapon_upgrade'
  | 'sfx_weapon_switch'
  | 'sfx_purchase'
  // 精英与 Boss（§3）
  | 'sfx_elite_spawn'
  | `sfx_affix_${EliteAffixId}`
  | 'sfx_boss_warn_1'
  | 'sfx_boss_warn_2'
  | 'sfx_boss_warn_3'
  | 'sfx_boss_attack_1'
  | 'sfx_boss_attack_2'
  | 'sfx_boss_attack_3'
  | 'sfx_boss_attack_4'
  | 'sfx_boss_attack_5'
  | 'sfx_boss_attack_6'
  | 'sfx_boss_phase_2'
  | 'sfx_boss_phase_3'
  | 'sfx_boss_defeat'
  // 事件与 UI（§4）
  | 'sfx_event_start'
  | 'sfx_event_done'
  | 'sfx_ui_click'
  | 'sfx_ui_error'
  | 'sfx_run_win'
  | 'sfx_run_lose';

/** 混音优先级档位。 */
export type MixerPriorityLevel = keyof typeof audioEventMapConfig.mixerPriority;

/**
 * 领域事件 → 音频 ID 的映射表类型。
 * 键为 GameEventMap 的子集（并非每个事件都有声音），值为音效 ID 数组（可为空）。
 */
export type AudioEventMap = Readonly<Partial<Record<GameEventType, readonly AudioEventId[]>>>;

/** 实际映射表（数据来自 config，类型在此收窄）。 */
export const AUDIO_EVENT_MAP: AudioEventMap = audioEventMapConfig.eventToSfx;

// ─────────────────────────────────────────────────────────────
// 解析函数
// ─────────────────────────────────────────────────────────────

/**
 * 某个领域事件应播放哪些音效（一般表查询）。
 *
 * @param type 事件名
 * @returns 音效 ID 数组（可能为空 = 该事件无音效）
 */
export function sfxForEvent<K extends GameEventType>(type: K): readonly AudioEventId[] {
  return audioEventMapConfig.eventToSfx[type] ?? [];
}

/**
 * 元素触发 → 音效（Q7 的映射点）。
 *
 * 契约用 ice / lightning，音效表用 frost / storm；转换表在 config 里，
 * 调用方永远不需要知道这层差异。
 *
 * @param element 元素 ID
 */
export function sfxForProc(element: ElementId): AudioEventId {
  return audioEventMapConfig.elementToProcSfx[element];
}

/**
 * 资源拾取 → 音效。四种元素碎片共用 sfx_pickup_shard。
 * @param currencyId 货币 / 资源 ID
 */
export function sfxForPickup(currencyId: CurrencyId): AudioEventId {
  return audioEventMapConfig.currencyToPickupSfx[currencyId];
}

/**
 * Boss 阶段切换 → 音效。guardian 是初始阶段，无切换音（返回 null）。
 * @param phase 新阶段
 */
export function sfxForBossPhase(phase: BossPhase): AudioEventId | null {
  return audioEventMapConfig.bossPhaseToSfx[phase];
}

/**
 * Boss 预警检查点 → 音效。
 * @param checkpointIndex 0 / 1 / 2 对应 8:30 / 9:00 / 9:30
 * @returns 音效 ID；越界返回 null
 */
export function sfxForBossWarnCheckpoint(checkpointIndex: number): AudioEventId | null {
  const table = audioEventMapConfig.bossWarnSfxByCheckpoint;
  return checkpointIndex >= 0 && checkpointIndex < table.length ? table[checkpointIndex] : null;
}

/**
 * 精英词缀提示音效。
 * @param affix 词缀 ID
 */
export function sfxForAffix(affix: EliteAffixId): AudioEventId {
  return audioEventMapConfig.affixToSfx[affix];
}

/**
 * 混音优先级数值（数值越大越不容易被抢占）。
 * @param level 优先级档位
 */
export function mixerPriorityOf(level: MixerPriorityLevel): number {
  return audioEventMapConfig.mixerPriority[level];
}

/**
 * 把事件 payload 解析成「实际要播的音效列表」，处理需要看 payload 的动态事件。
 *
 * 为什么需要它：`proc.triggered` / `resource.picked_up` / `boss.phase_changed`
 * 的静音取决于 payload（元素种类、货币种类、阶段），单靠事件名查不出音效。
 *
 * @param type    事件名
 * @param payload 事件 payload
 * @returns 音效 ID 列表
 */
export function resolveSfxForEvent<K extends GameEventType>(type: K, payload: GameEventMap[K]): readonly AudioEventId[] {
  switch (type) {
    case 'proc.triggered': {
      const p = payload as GameEventMap['proc.triggered'];
      return [sfxForProc(p.element)];
    }
    case 'resource.picked_up': {
      const p = payload as GameEventMap['resource.picked_up'];
      return [sfxForPickup(p.currencyId)];
    }
    case 'boss.phase_changed': {
      const p = payload as GameEventMap['boss.phase_changed'];
      const sfx = sfxForBossPhase(p.phase);
      return sfx ? [sfx] : [];
    }
    default:
      return sfxForEvent(type);
  }
}
