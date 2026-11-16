/**
 * 48 音效配方表 —— 逐行翻译自 `docs/音频-程序化合成规格.md` §3（唯一事实来源）。
 *
 * 编译期 `satisfies Record<AudioEventId, SynthRecipe>` 保证冻结契约的 48 个 ID 零遗漏、零越界。
 * 本文件是**数据**：所有数值来自音频总监规格；synth.ts 只是解释器，不含任何音色魔法数字。
 *
 * 口径：主理人裁定以冻结契约的 48 个具体 ID 为准（42 字面量 + 6 词缀模板实例）。
 * 规格 §3 的 48 行与本表一一对应；`sfx_staff_cast_a` 仅为规格里的命名示例，不进实体。
 */
import type { AudioEventId, SynthRecipe, OscLayer, Envelope, Filter, Note, Sweep } from '../types.ts';

// ── 形状辅助（只组装数据，不产生数值） ──────────────────────────
const env = (a: number, d: number, s: number, r: number): Envelope => ({ a, d, s, r });
const N = (hz: number, at = 0): Note => ({ hz, at });
const SW = (to: number, sec: number, linear = false): Sweep => ({ to, sec, linear });
const LP = (freq: number, q: number, sweep?: readonly number[]): Filter => ({ type: 'lowpass', freq, q, sweep });
const HP = (freq: number, q: number, sweep?: readonly number[]): Filter => ({ type: 'highpass', freq, q, sweep });
const BP = (freq: number, q: number, sweep?: readonly number[]): Filter => ({ type: 'bandpass', freq, q, sweep });
/** 噪声声部：频率无意义，用 1 Hz 占位（synth 对 noise 不设 frequency）。 */
const NOISE_HZ = 1;
const noise = (wave: 'white' | 'pink', filter: Filter, gain: number, e: Envelope, start = 0): OscLayer => ({
  wave, notes: [N(NOISE_HZ)], filter, gain, env: e, start,
});

/**
 * 混音常量（全部来自规格 §2.2 / §2.3 / §4 通用调度），音频层唯一数值落点。
 */
export const MIX_CONST = {
  /** 总线标称增益（规格 §2.2）。 */
  busGain: { master: 0.9, music: 0.5, sfx: 0.8, ui: 0.6, ambient: 0.18 } as const,
  /** 主总线限制器（threshold/knee dB, ratio, attack/release s）。 */
  limiter: { thresholdDb: -3, kneeDb: 6, ratio: 12, attackSec: 0.003, releaseSec: 0.12 } as const,
  /** 池满抢占释音时长（规格 §2.3 规则 3：30 ms 快速释音，防爆音 click）。 */
  preemptFadeSec: 0.03,
  /** 同 ID 合并窗口（规格 §2.3 规则 4）。 */
  dedupeWindowMs: 80,
  /** 单一 ID 限流（规格 §2.3 规则 4：6 次/秒）。 */
  rateLimitPerSec: 6,
  /** BGM lookahead 调度（规格 §4：25 ms tick、100 ms 预排）。 */
  bgmTickMs: 25,
  bgmScheduleAheadSec: 0.1,
  /** 白/粉噪声缓冲时长（规格 §2.1：各 2 s，按 ctx.sampleRate 运行时生成一次复用）。 */
  noiseBufferSec: 2,
  /** BGM 常态交叉淡入淡出（规格 §4.2/§4.3：2 s 淡入；阶段切换用各自的 1.2/1.5 s）。 */
  bgmCrossfadeSec: 2,
} as const;

/** 48 条 SFX 配方（键集合 = 冻结 `AudioEventId` 全集）。 */
export const sfxRecipes = {
  // ── §3.1 武器与战斗（11） ──────────────────────────────────
  'sfx_staff_cast': {
    id: 'sfx_staff_cast', priority: 'normal', bus: 'sfx', dur: 0.22,
    layers: [
      { wave: 'saw', notes: [N(660)], sweep: SW(1760, 0.12), env: env(0.004, 0.06, 0.45, 0.09), gain: 0.55, filter: BP(1800, 2.0) },
      { wave: 'tri', notes: [N(660)], env: env(0.004, 0.06, 0.45, 0.09), gain: 0.55, detune: -7 },
      noise('white', HP(4000, 0.7), 0.55, env(0, 0.01, 0.3, 0.01)),
    ],
  },
  'sfx_staff_hit': {
    id: 'sfx_staff_hit', priority: 'normal', bus: 'sfx', dur: 0.14,
    layers: [
      { wave: 'tri', notes: [N(1320)], sweep: SW(220, 0.09), env: env(0.001, 0.04, 0.3, 0.08), gain: 0.5, filter: LP(2800, 1.0) },
      noise('white', LP(1200, 0.7), 0.5, env(0, 0.015, 0.3, 0.015)),
    ],
  },
  'sfx_sword_swing': {
    id: 'sfx_sword_swing', priority: 'normal', bus: 'sfx', dur: 0.24,
    layers: [
      noise('white', BP(800, 1.6, [3500, 900]), 0.42, env(0.02, 0.05, 0.5, 0.1)),
      { wave: 'sin', notes: [N(80)], sweep: SW(50, 0.12, true), env: env(0.02, 0.05, 0.5, 0.1), gain: 0.42, pan: [-0.3, 0.3] },
    ],
  },
  'sfx_sword_hit': {
    id: 'sfx_sword_hit', priority: 'normal', bus: 'sfx', dur: 0.12,
    layers: [
      { wave: 'sq', notes: [N(220)], sweep: SW(110, 0.05), env: env(0.001, 0.03, 0.25, 0.07), gain: 0.6, filter: LP(2400, 0.9) },
      { wave: 'tri', notes: [N(1760)], env: env(0.001, 0.03, 0.25, 0.07), gain: 0.6 },
      noise('white', LP(2200, 0.7), 0.6, env(0, 0.01, 0.3, 0.01)),
    ],
  },
  'sfx_proc_fire': {
    id: 'sfx_proc_fire', priority: 'normal', bus: 'sfx', dur: 0.55,
    layers: [
      noise('pink', LP(1200, 0.8), 0.5, env(0.01, 0.18, 0.6, 0.28)),
      { wave: 'saw', notes: [N(90)], sweep: SW(60, 0.3), env: env(0.01, 0.18, 0.6, 0.28), gain: 0.5 },
      noise('white', HP(3000, 0.7), 0.5, env(0.002, 0.02, 0.4, 0.02), 0.05),
      noise('white', HP(3000, 0.7), 0.5, env(0.002, 0.02, 0.4, 0.02), 0.17),
      noise('white', HP(3000, 0.7), 0.5, env(0.002, 0.02, 0.4, 0.02), 0.29),
      noise('white', HP(3000, 0.7), 0.5, env(0.002, 0.02, 0.4, 0.02), 0.41),
    ],
  },
  'sfx_proc_frost': {
    id: 'sfx_proc_frost', priority: 'normal', bus: 'sfx', dur: 0.55,
    layers: [
      { wave: 'sin', notes: [N(2400)], sweep: SW(1800, 0.4), env: env(0.002, 0.12, 0.4, 0.35), gain: 0.42, filter: HP(1500, 0.7) },
      { wave: 'sin', notes: [N(3600)], env: env(0.002, 0.12, 0.4, 0.35), gain: 0.42, start: 0.01 },
      noise('white', HP(6000, 0.7), 0.42, env(0.002, 0.15, 0.4, 0.15)),
    ],
  },
  'sfx_proc_storm': {
    id: 'sfx_proc_storm', priority: 'normal', bus: 'sfx', dur: 0.3,
    layers: [
      { wave: 'sq', notes: [N(120)], sweep: SW(60, 0.08), env: env(0.001, 0.02, 0.35, 0.05), gain: 0.55, filter: BP(2600, 3.0) },
      noise('white', HP(2000, 0.7), 0.55, env(0.001, 0.015, 0.3, 0.015), 0),
      noise('white', HP(2000, 0.7), 0.55, env(0.001, 0.015, 0.3, 0.015), 0.06),
      noise('white', HP(2000, 0.7), 0.55, env(0.001, 0.015, 0.3, 0.015), 0.12),
    ],
    echo: { taps: [0.06], feedback: 0.3 },
  },
  'sfx_proc_shadow': {
    id: 'sfx_proc_shadow', priority: 'normal', bus: 'sfx', dur: 0.65,
    layers: [
      { wave: 'sin', notes: [N(320)], sweep: SW(160, 0.35), env: env(0.03, 0.12, 0.7, 0.3), gain: 0.45, filter: LP(900, 1.4, [300]), trem: [4, 0.6] },
      { wave: 'periodic', harmonics: 5, notes: [N(160)], env: env(0.03, 0.12, 0.7, 0.3), gain: 0.45 },
    ],
  },
  'sfx_player_hurt': {
    id: 'sfx_player_hurt', priority: 'normal', bus: 'sfx', dur: 0.22,
    layers: [
      { wave: 'saw', notes: [N(440)], sweep: SW(110, 0.12), env: env(0.001, 0.05, 0.4, 0.14), gain: 0.7, filter: LP(2000, 1.2) },
      noise('white', LP(1600, 0.7), 0.7, env(0, 0.025, 0.3, 0.025)),
    ],
    duck: [-3, 0.2],
  },
  'sfx_player_death': {
    id: 'sfx_player_death', priority: 'normal', bus: 'sfx', dur: 1.8,
    layers: [
      { wave: 'saw', notes: [N(220)], sweep: SW(55, 1.2), env: env(0.01, 0.3, 0.6, 0.85), gain: 0.65, filter: LP(1200, 1.0, [300]) },
      { wave: 'tri', notes: [N(220)], env: env(0.01, 0.3, 0.6, 0.85), gain: 0.65, detune: -12 },
      noise('pink', LP(300, 0.7), 0.65, env(0.01, 0.3, 0.6, 0.3)),
    ],
    echo: { taps: [0.22], feedback: 0.4 },
  },
  'sfx_dash': {
    id: 'sfx_dash', priority: 'normal', bus: 'sfx', dur: 0.2,
    layers: [
      noise('white', BP(500, 2.2, [4000, 1200]), 0.48, env(0.008, 0.04, 0.6, 0.1)),
      { wave: 'sin', notes: [N(80)], sweep: SW(50, 0.1, true), env: env(0.008, 0.04, 0.6, 0.1), gain: 0.48, pan: [-0.5, 0.5] },
    ],
  },

  // ── §3.2 成长与资源（12） ──────────────────────────────────
  'sfx_pickup_gold': {
    id: 'sfx_pickup_gold', priority: 'normal', bus: 'sfx', dur: 0.28,
    layers: [
      { wave: 'tri', notes: [N(1046)], env: env(0.001, 0.05, 0.35, 0.16), gain: 0.45, filter: HP(600, 0.7) },
      { wave: 'tri', notes: [N(1568)], env: env(0.001, 0.05, 0.35, 0.16), gain: 0.45, start: 0.006 },
      { wave: 'tri', notes: [N(2093)], env: env(0.001, 0.05, 0.35, 0.16), gain: 0.45, start: 0.012 },
    ],
  },
  'sfx_pickup_material': {
    id: 'sfx_pickup_material', priority: 'normal', bus: 'sfx', dur: 0.32,
    layers: [
      { wave: 'sin', notes: [N(523)], sweep: SW(784, 0.1), env: env(0.006, 0.06, 0.4, 0.18), gain: 0.38, filter: LP(2200, 0.6) },
      { wave: 'tri', notes: [N(523)], env: env(0.006, 0.06, 0.4, 0.18), gain: 0.38, detune: 5 },
      noise('white', LP(800, 0.7), 0.38, env(0, 0.02, 0.3, 0.02)),
    ],
  },
  'sfx_pickup_shard': {
    id: 'sfx_pickup_shard', priority: 'normal', bus: 'sfx', dur: 0.22,
    layers: [
      { wave: 'sin', notes: [N(880)], sweep: SW(1320, 0.07), env: env(0.002, 0.04, 0.35, 0.14), gain: 0.42, filter: HP(900, 0.7), vib: [8, 20] },
      { wave: 'sin', notes: [N(1760)], env: env(0.002, 0.04, 0.35, 0.14), gain: 0.42 },
    ],
  },
  'sfx_pickup_core': {
    id: 'sfx_pickup_core', priority: 'normal', bus: 'sfx', dur: 0.65,
    layers: [
      { wave: 'sin', notes: [N(196)], sweep: SW(392, 0.25), env: env(0.02, 0.12, 0.6, 0.3), gain: 0.5, filter: LP(1400, 0.9), trem: [3, 0.15] },
      { wave: 'saw', notes: [N(98)], env: env(0.02, 0.12, 0.6, 0.3), gain: 0.5 },
    ],
  },
  'sfx_levelup': {
    id: 'sfx_levelup', priority: 'normal', bus: 'sfx', dur: 0.65,
    layers: [
      { wave: 'tri', notes: [N(523, 0), N(659, 0.07), N(784, 0.14), N(1046, 0.21)], env: env(0.002, 0.05, 0.6, 0.12), gain: 0.55, filter: HP(400, 0.7) },
      { wave: 'sin', notes: [N(2093)], env: env(0.002, 0.05, 0.6, 0.12), gain: 0.55, start: 0.28 },
    ],
  },
  'sfx_upgrade_pick': {
    id: 'sfx_upgrade_pick', priority: 'normal', bus: 'ui', dur: 0.26,
    layers: [
      { wave: 'sin', notes: [N(659)], sweep: SW(988, 0.08), env: env(0.003, 0.06, 0.5, 0.14), gain: 0.5, filter: HP(500, 0.7) },
      { wave: 'sin', notes: [N(1318)], env: env(0.003, 0.06, 0.5, 0.14), gain: 0.5 },
      noise('white', HP(4000, 0.7), 0.5, env(0, 0.001, 0.2, 0.001)),
    ],
  },
  'sfx_gem_socket': {
    id: 'sfx_gem_socket', priority: 'normal', bus: 'sfx', dur: 0.24,
    layers: [
      { wave: 'sq', notes: [N(392)], sweep: SW(196, 0.06), env: env(0.001, 0.04, 0.4, 0.12), gain: 0.5, filter: LP(3000, 1.2) },
      { wave: 'sin', notes: [N(784)], sweep: SW(1175, 0.06), env: env(0.001, 0.04, 0.4, 0.12), gain: 0.5, start: 0.03 },
      noise('white', LP(1800, 0.7), 0.5, env(0, 0.015, 0.3, 0.015)),
    ],
  },
  'sfx_gem_unsocket': {
    id: 'sfx_gem_unsocket', priority: 'normal', bus: 'sfx', dur: 0.26,
    layers: [
      { wave: 'sq', notes: [N(196)], sweep: SW(98, 0.06), env: env(0.002, 0.05, 0.35, 0.14), gain: 0.48, filter: LP(2600, 1.0) },
      { wave: 'sin', notes: [N(1175)], sweep: SW(784, 0.06), env: env(0.002, 0.05, 0.35, 0.14), gain: 0.48, start: 0.03 },
      noise('white', LP(1500, 0.7), 0.48, env(0, 0.015, 0.3, 0.015)),
    ],
  },
  'sfx_gem_merge': {
    id: 'sfx_gem_merge', priority: 'normal', bus: 'sfx', dur: 0.62,
    layers: [
      { wave: 'tri', notes: [N(523)], sweep: SW(659, 0.3), env: env(0.01, 0.1, 0.7, 0.28), gain: 0.55, filter: BP(1600, 1.4) },
      { wave: 'tri', notes: [N(784)], sweep: SW(988, 0.3), env: env(0.01, 0.1, 0.7, 0.28), gain: 0.55, filter: BP(1600, 1.4) },
      { wave: 'tri', notes: [N(1046)], sweep: SW(1318, 0.3), env: env(0.01, 0.1, 0.7, 0.28), gain: 0.55, filter: BP(1600, 1.4) },
      noise('white', HP(5000, 0.7), 0.55, env(0.01, 0.1, 0.7, 0.15)),
    ],
  },
  'sfx_weapon_upgrade': {
    id: 'sfx_weapon_upgrade', priority: 'normal', bus: 'sfx', dur: 0.48,
    layers: [
      { wave: 'saw', notes: [N(220)], sweep: SW(660, 0.2), env: env(0.005, 0.08, 0.6, 0.2), gain: 0.55, filter: LP(3200, 1.6) },
      { wave: 'tri', notes: [N(1320)], env: env(0.005, 0.08, 0.6, 0.2), gain: 0.55 },
      noise('white', HP(2500, 0.7), 0.55, env(0.002, 0.02, 0.3, 0.02), 0),
      noise('white', HP(2500, 0.7), 0.55, env(0.002, 0.02, 0.3, 0.02), 0.09),
      noise('white', HP(2500, 0.7), 0.55, env(0.002, 0.02, 0.3, 0.02), 0.18),
    ],
  },
  'sfx_weapon_switch': {
    id: 'sfx_weapon_switch', priority: 'normal', bus: 'sfx', dur: 0.14,
    layers: [
      { wave: 'tri', notes: [N(330)], sweep: SW(440, 0.05), env: env(0.002, 0.025, 0.3, 0.07), gain: 0.42, filter: BP(1200, 1.8, [2600]) },
      noise('white', BP(1800, 0.7), 0.42, env(0, 0.02, 0.3, 0.02)),
      { wave: 'sin', notes: [N(110)], env: env(0.002, 0.025, 0.3, 0.07), gain: 0.42 },
    ],
  },
  'sfx_purchase': {
    id: 'sfx_purchase', priority: 'normal', bus: 'ui', dur: 0.3,
    layers: [
      { wave: 'tri', notes: [N(784)], sweep: SW(1046, 0.08), env: env(0.001, 0.05, 0.4, 0.18), gain: 0.5, filter: HP(600, 0.7) },
      { wave: 'tri', notes: [N(1176)], env: env(0.001, 0.05, 0.4, 0.18), gain: 0.5, start: 0.04 },
      noise('white', HP(4000, 0.7), 0.5, env(0, 0.001, 0.2, 0.001), 0),
      noise('white', HP(4000, 0.7), 0.5, env(0, 0.001, 0.2, 0.001), 0.04),
    ],
  },

  // ── §3.3 精英与 Boss（19） ─────────────────────────────────
  'sfx_elite_spawn': {
    id: 'sfx_elite_spawn', priority: 'normal', bus: 'sfx', dur: 0.9,
    layers: [
      { wave: 'saw', notes: [N(110)], sweep: SW(165, 0.4), env: env(0.08, 0.15, 0.75, 0.35), gain: 0.6, filter: LP(900, 1.2) },
      { wave: 'sin', notes: [N(55)], env: env(0.08, 0.15, 0.75, 0.35), gain: 0.6 },
      noise('pink', LP(600, 0.7), 0.6, env(0.08, 0.2, 0.75, 0.22)),
      { wave: 'tri', notes: [N(440)], env: env(0.08, 0.15, 0.75, 0.35), gain: 0.6, start: 0.3 },
    ],
  },
  'sfx_affix_berserk': {
    id: 'sfx_affix_berserk', priority: 'affix', bus: 'sfx', dur: 0.46,
    layers: [
      { wave: 'saw', notes: [N(165)], sweep: SW(330, 0.25), env: env(0.005, 0.08, 0.8, 0.18), gain: 0.55, filter: LP(1800, 2.0), trem: [12, 0.5] },
      { wave: 'sin', notes: [N(82)], env: env(0.005, 0.08, 0.8, 0.18), gain: 0.55 },
    ],
  },
  'sfx_affix_split': {
    id: 'sfx_affix_split', priority: 'affix', bus: 'sfx', dur: 0.42,
    layers: [
      { wave: 'tri', notes: [N(523)], env: env(0.003, 0.06, 0.5, 0.16), gain: 0.5, filter: BP(1400, 2.5), detune: -30, pan: [-0.4, -0.4] },
      { wave: 'tri', notes: [N(523)], env: env(0.003, 0.06, 0.5, 0.16), gain: 0.5, filter: BP(1400, 2.5), detune: 30, pan: [0.4, 0.4] },
    ],
  },
  'sfx_affix_vampiric': {
    id: 'sfx_affix_vampiric', priority: 'affix', bus: 'sfx', dur: 0.7,
    layers: [
      { wave: 'sin', notes: [N(300)], sweep: SW(120, 0.4), env: env(0.02, 0.12, 0.7, 0.3), gain: 0.5, filter: LP(900, 1.6, [300]), trem: [4, 0.6] },
      noise('pink', LP(500, 0.7), 0.5, env(0.02, 0.12, 0.7, 0.2)),
    ],
  },
  'sfx_affix_shielded': {
    id: 'sfx_affix_shielded', priority: 'affix', bus: 'sfx', dur: 0.6,
    layers: [
      { wave: 'sin', notes: [N(440)], env: env(0.06, 0.1, 0.8, 0.28), gain: 0.5, filter: BP(1100, 3.0), trem: [90, 0.25] },
      { wave: 'sin', notes: [N(660)], env: env(0.06, 0.1, 0.8, 0.28), gain: 0.5 },
      { wave: 'sin', notes: [N(880)], env: env(0.06, 0.1, 0.8, 0.28), gain: 0.5 },
    ],
  },
  'sfx_affix_summoner': {
    id: 'sfx_affix_summoner', priority: 'affix', bus: 'sfx', dur: 0.75,
    layers: [
      { wave: 'sin', notes: [N(392)], sweep: SW(587, 0.3), env: env(0.04, 0.1, 0.6, 0.32), gain: 0.5, filter: LP(2400, 1.0) },
      { wave: 'tri', notes: [N(784)], env: env(0.04, 0.1, 0.6, 0.32), gain: 0.5, trem: [6, 0.3] },
    ],
    echo: { taps: [0.15, 0.3, 0.45], feedback: 0.3 },
  },
  'sfx_affix_toxic': {
    id: 'sfx_affix_toxic', priority: 'affix', bus: 'sfx', dur: 0.6,
    layers: [
      { wave: 'sin', notes: [N(220)], env: env(0.01, 0.08, 0.6, 0.24), gain: 0.48, filter: BP(800, 2.2), trem: [7, 0.5] },
      { wave: 'sin', notes: [N(600, 0.1), N(720, 0.18), N(840, 0.26), N(900, 0.34)], env: env(0.005, 0.02, 0.4, 0.02), gain: 0.48 },
      noise('white', BP(700, 0.7), 0.48, env(0.01, 0.2, 0.6, 0.2)),
    ],
  },
  'sfx_boss_warn_1': {
    id: 'sfx_boss_warn_1', priority: 'bossWarn', bus: 'sfx', dur: 0.42,
    layers: [
      { wave: 'sin', notes: [N(880, 0), N(880, 0.18)], env: env(0.003, 0.04, 0.7, 0.1), gain: 0.6, filter: BP(1200, 1.5) },
      { wave: 'sin', notes: [N(1320, 0), N(1320, 0.18)], env: env(0.003, 0.04, 0.7, 0.1), gain: 0.6 },
      { wave: 'sin', notes: [N(110)], env: env(0.003, 0.04, 0.7, 0.1), gain: 0.6 },
    ],
  },
  'sfx_boss_warn_2': {
    id: 'sfx_boss_warn_2', priority: 'bossWarn', bus: 'sfx', dur: 0.56,
    layers: [
      { wave: 'sin', notes: [N(932, 0), N(932, 0.16), N(932, 0.32)], env: env(0.003, 0.04, 0.7, 0.1), gain: 0.65, filter: BP(1270, 1.5) },
      { wave: 'sin', notes: [N(1397, 0), N(1397, 0.16), N(1397, 0.32)], env: env(0.003, 0.04, 0.7, 0.1), gain: 0.65 },
      { wave: 'sin', notes: [N(116)], env: env(0.003, 0.04, 0.7, 0.1), gain: 0.65 },
    ],
  },
  'sfx_boss_warn_3': {
    id: 'sfx_boss_warn_3', priority: 'bossWarn', bus: 'sfx', dur: 0.72,
    layers: [
      { wave: 'sin', notes: [N(987, 0), N(987, 0.14), N(987, 0.28), N(987, 0.42)], env: env(0.003, 0.04, 0.75, 0.1), gain: 0.7, filter: BP(1350, 1.5) },
      { wave: 'sin', notes: [N(1480, 0), N(1480, 0.14), N(1480, 0.28), N(1480, 0.42)], env: env(0.003, 0.04, 0.75, 0.1), gain: 0.7 },
      { wave: 'saw', notes: [N(165)], env: env(0.003, 0.04, 0.75, 0.1), gain: 0.7 },
    ],
  },
  'sfx_boss_attack_1': {
    id: 'sfx_boss_attack_1', priority: 'bossAttack', bus: 'sfx', dur: 0.22,
    layers: [
      { wave: 'saw', notes: [N(90)], sweep: SW(45, 0.12), env: env(0.001, 0.04, 0.5, 0.12), gain: 0.6, filter: LP(900, 1.8) },
      noise('white', HP(2000, 0.7), 0.6, env(0, 0.015, 0.3, 0.015)),
    ],
  },
  'sfx_boss_attack_2': {
    id: 'sfx_boss_attack_2', priority: 'bossAttack', bus: 'sfx', dur: 0.32,
    layers: [
      noise('white', BP(400, 1.2, [2200]), 0.58, env(0.01, 0.06, 0.6, 0.14)),
      { wave: 'saw', notes: [N(120)], env: env(0.01, 0.06, 0.6, 0.14), gain: 0.58, pan: [-0.6, 0.6] },
    ],
  },
  'sfx_boss_attack_3': {
    id: 'sfx_boss_attack_3', priority: 'bossAttack', bus: 'sfx', dur: 0.55,
    layers: [
      { wave: 'sin', notes: [N(70, 0), N(70, 0.12), N(70, 0.24)], sweep: SW(35, 0.3), env: env(0.002, 0.1, 0.7, 0.28), gain: 0.68, filter: LP(400, 1.0) },
      noise('pink', LP(300, 0.7), 0.68, env(0.002, 0.1, 0.7, 0.1)),
    ],
  },
  'sfx_boss_attack_4': {
    id: 'sfx_boss_attack_4', priority: 'bossAttack', bus: 'sfx', dur: 0.62,
    layers: [
      { wave: 'saw', notes: [N(165)], sweep: SW(110, 0.4), env: env(0.03, 0.12, 0.7, 0.26), gain: 0.55, filter: BP(700, 2.0), trem: [5, 0.4] },
      noise('pink', BP(500, 0.7), 0.55, env(0.03, 0.15, 0.7, 0.2)),
    ],
  },
  'sfx_boss_attack_5': {
    id: 'sfx_boss_attack_5', priority: 'bossAttack', bus: 'sfx', dur: 0.8,
    layers: [
      { wave: 'tri', notes: [N(262, 0), N(330, 0), N(392, 0)], sweep: SW(440, 0.35), env: env(0.06, 0.12, 0.7, 0.34), gain: 0.55, filter: LP(1800, 0.9) },
    ],
    echo: { taps: [0.2], feedback: 0.35 },
  },
  'sfx_boss_attack_6': {
    id: 'sfx_boss_attack_6', priority: 'bossAttack', bus: 'sfx', dur: 1.1,
    layers: [
      { wave: 'saw', notes: [N(220)], sweep: SW(55, 0.5), env: env(0.001, 0.15, 0.85, 0.45), gain: 0.75, filter: LP(4000, 1.4, [400]) },
      noise('white', LP(4000, 0.7), 0.75, env(0.001, 0.1, 0.6, 0.15)),
      { wave: 'sin', notes: [N(55)], env: env(0.001, 0.15, 0.85, 0.45), gain: 0.75 },
    ],
    echo: { taps: [0.18], feedback: 0.5 },
  },
  'sfx_boss_phase_2': {
    id: 'sfx_boss_phase_2', priority: 'bossWarn', bus: 'sfx', dur: 1.2,
    layers: [
      { wave: 'saw', notes: [N(110)], sweep: SW(165, 0.6), env: env(0.1, 0.2, 0.85, 0.4), gain: 0.7, filter: LP(1200, 1.2, [2600]) },
      { wave: 'tri', notes: [N(440, 0), N(466, 0.18), N(494, 0.36), N(554, 0.54)], env: env(0.1, 0.2, 0.85, 0.4), gain: 0.7 },
    ],
    echo: { taps: [0.25], feedback: 0.45 },
  },
  'sfx_boss_phase_3': {
    id: 'sfx_boss_phase_3', priority: 'bossWarn', bus: 'sfx', dur: 1.5,
    layers: [
      { wave: 'saw', notes: [N(165)], sweep: SW(220, 0.7), env: env(0.06, 0.18, 0.9, 0.55), gain: 0.78, filter: BP(1800, 2.0, [4200]) },
      { wave: 'tri', notes: [N(554, 0), N(587, 0.1), N(622, 0.2), N(659, 0.3), N(698, 0.4), N(740, 0.5)], env: env(0.06, 0.18, 0.9, 0.55), gain: 0.78 },
      noise('white', HP(4000, 0.7), 0.78, env(0.06, 0.3, 0.9, 0.4)),
    ],
    echo: { taps: [0.2], feedback: 0.5 },
  },
  'sfx_boss_defeat': {
    id: 'sfx_boss_defeat', priority: 'bossWarn', bus: 'sfx', dur: 2.6,
    layers: [
      { wave: 'saw', notes: [N(220)], sweep: SW(55, 1.5), env: env(0.01, 0.4, 0.7, 1.2), gain: 0.7, filter: LP(3000, 1.0, [200]) },
      { wave: 'tri', notes: [N(440, 0.2), N(349, 0.5), N(294, 0.8)], env: env(0.01, 0.4, 0.7, 1.2), gain: 0.7 },
      noise('pink', LP(400, 0.7), 0.7, env(0.01, 0.4, 0.7, 0.8)),
    ],
    echo: { taps: [0.3, 0.6, 0.9], feedback: 0.4 },
  },

  // ── §3.4 事件与 UI（6） ────────────────────────────────────
  'sfx_event_start': {
    id: 'sfx_event_start', priority: 'normal', bus: 'sfx', dur: 0.58,
    layers: [
      { wave: 'tri', notes: [N(392, 0), N(587, 0.12), N(784, 0.25)], env: env(0.02, 0.08, 0.6, 0.2), gain: 0.5, filter: BP(1400, 1.2) },
      noise('white', LP(1500, 0.7), 0.5, env(0.02, 0.06, 0.6, 0.07)),
    ],
    echo: { taps: [0.12], feedback: 0.3 },
  },
  'sfx_event_done': {
    id: 'sfx_event_done', priority: 'normal', bus: 'sfx', dur: 0.4,
    layers: [
      { wave: 'tri', notes: [N(784, 0), N(1046, 0.1), N(1318, 0.2)], env: env(0.003, 0.06, 0.5, 0.18), gain: 0.5, filter: HP(600, 0.7) },
      { wave: 'sin', notes: [N(2093)], env: env(0.003, 0.06, 0.5, 0.18), gain: 0.5, start: 0.2 },
    ],
  },
  'sfx_ui_click': {
    id: 'sfx_ui_click', priority: 'normal', bus: 'ui', dur: 0.06,
    layers: [
      { wave: 'sin', notes: [N(1200)], sweep: SW(900, 0.03), env: env(0.001, 0.012, 0.3, 0.025), gain: 0.35, filter: HP(800, 0.7) },
      noise('white', HP(4000, 0.7), 0.35, env(0, 0.001, 0.2, 0.001)),
    ],
  },
  'sfx_ui_error': {
    id: 'sfx_ui_error', priority: 'normal', bus: 'ui', dur: 0.28,
    layers: [
      { wave: 'sq', notes: [N(220, 0), N(220, 0.14)], sweep: SW(165, 0.12), env: env(0.002, 0.03, 0.5, 0.06), gain: 0.42, filter: LP(1200, 1.5) },
      { wave: 'tri', notes: [N(233)], env: env(0.002, 0.03, 0.5, 0.06), gain: 0.42 },
    ],
  },
  'sfx_run_win': {
    id: 'sfx_run_win', priority: 'bossWarn', bus: 'sfx', dur: 1.3,
    layers: [
      { wave: 'tri', notes: [N(523, 0), N(659, 0.1), N(784, 0.2), N(1046, 0.3), N(1318, 0.4)], env: env(0.003, 0.08, 0.7, 0.3), gain: 0.6, filter: HP(300, 0.7) },
      { wave: 'sin', notes: [N(1046, 0.7), N(1318, 0.7), N(1568, 0.7)], env: env(0.003, 0.08, 0.7, 0.6), gain: 0.6 },
    ],
  },
  'sfx_run_lose': {
    id: 'sfx_run_lose', priority: 'bossWarn', bus: 'sfx', dur: 1.6,
    layers: [
      { wave: 'saw', notes: [N(220)], sweep: SW(55, 0.8), env: env(0.02, 0.2, 0.6, 0.6), gain: 0.58, filter: LP(1400, 1.0, [300]) },
      { wave: 'tri', notes: [N(349, 0.2), N(415, 0.2), N(523, 0.2)], env: env(0.02, 0.2, 0.6, 0.6), gain: 0.58 },
    ],
    echo: { taps: [0.3], feedback: 0.4 },
  },
} satisfies Record<AudioEventId, SynthRecipe>;
