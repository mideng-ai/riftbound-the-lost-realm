/**
 * BGM 配方表 —— 逐行翻译自 `docs/音频-程序化合成规格.md` §4（唯一事实来源）。
 *
 * 4 曲目（BGM-1 准备 / BGM-2 探索林 / BGM-3 高压 / BGM-4 Boss）+ 2 环境层（AMB-1/2）。
 * 调式、BPM、循环小节、分层与 Boss 三阶段转调偏移全部来自规格 §4.1–§4.6；
 * bgmScheduler.ts 只负责选曲/转调/定时，不发明任何音乐数值。
 */
import type { BgmRecipeSet, BgmLayer, BgmNote, Envelope, Filter } from '../types.ts';

const env = (a: number, d: number, s: number, r: number): Envelope => ({ a, d, s, r });
const NT = (atBeat: number, semitone: number, hz?: number): BgmNote => ({ atBeat, semitone, hz });
const LP = (freq: number, q: number, sweep?: readonly number[]): Filter => ({ type: 'lowpass', freq, q, sweep });
const HP = (freq: number, q: number): Filter => ({ type: 'highpass', freq, q });
const BP = (freq: number, q: number): Filter => ({ type: 'bandpass', freq, q });

/** Pad 双振荡 detune 由 synth 的通用 detune 字段表达；这里给每层完整参数。 */
const pad = (
  name: string,
  notes: readonly BgmNote[],
  gain: number,
  filter: Filter,
  minBossPhase?: 'corruption' | 'coreFrenzy',
): BgmLayer => ({ name, wave: 'tri', notes, env: env(0.4, 0.3, 0.7, 0.6), gain, filter, bus: 'music', minBossPhase });

export const bgmRecipes = {
  phaseTrack: {
    boot: 'bgm1',
    menu: 'bgm1',
    metaHub: 'bgm1',
    runStarting: 'bgm2',
    running: 'bgm2',
    upgradePick: 'bgm2',
    paused: 'bgm2',
    victory: 'bgm1',
    defeat: 'bgm1',
  },
  /** `boss.warning_started`（8:30 起）→ 高压曲；`boss.spawned`（10:00）→ Boss 曲。 */
  warnTrack: 'bgm3',
  bossTrack: 'bgm4',
  /** 规格 §4.5：guardian=D 小调基准，P2 +2 半音，P3 自 E 再 +3（累计 +5）。 */
  bossTranspose: { guardian: 0, corruption: 2, coreFrenzy: 5 },
  bossPhaseFadeSec: { guardian: 0, corruption: 1.2, coreFrenzy: 1.5 },
  tracks: {
    // BGM-1 准备：A 自然小调，68 BPM，8 小节（28.24 s），无鼓、无紧张层。
    bgm1: {
      id: 'bgm1', bpm: 68, beatsPerBar: 4, bars: 8, rootMidi: 45, // A2
      layers: [
        pad('L1-pad', [NT(0, 0), NT(0, 7)], 0.35, LP(600, 0.7)), // A2/E3
        { name: 'L2-arp', wave: 'tri', notes: [NT(0, 12), NT(2, 15), NT(3, 19)], env: env(0.01, 0.08, 0.5, 0.2), gain: 0.22, bus: 'music' }, // A3-C4-E4
        { name: 'L3-bell', wave: 'sin', notes: [NT(0, 31)], env: env(0.005, 0.2, 0.4, 0.6), gain: 0.18, bus: 'music' }, // E5 主题动机
      ],
    },
    // BGM-2 探索林：D 多利亚，92 BPM，16 小节（41.74 s）。
    bgm2: {
      id: 'bgm2', bpm: 92, beatsPerBar: 4, bars: 16, rootMidi: 38, // D2
      layers: [
        pad('L1-drone', [NT(0, 0), NT(0, 7)], 0.33, LP(500, 0.7)), // D2+A2
        { name: 'L2-pulse', wave: 'tri', notes: [NT(0, 12), NT(1, 15), NT(2, 19), NT(3, 22)], env: env(0.01, 0.06, 0.5, 0.16), gain: 0.25, bus: 'music' }, // D3-F3-A3-C4
        { name: 'L3-pluck', wave: 'saw', notes: [NT(0.5, 24), NT(1.5, 31), NT(2.5, 34)], env: env(0.005, 0.05, 0.4, 0.1), gain: 0.18, filter: LP(1800, 0.9), bus: 'music' }, // D4-A4-C5
        { name: 'L4-kick', wave: 'sin', notes: [NT(0, -12), NT(2, -12)], env: env(0.005, 0.06, 0.1, 0.12), gain: 0.2, bus: 'music' }, // sin 60→40 近似（低八度）
      ],
    },
    // BGM-3 高压：D 多利亚 + 降 E 经过音，124 BPM，8 小节（15.48 s）。
    bgm3: {
      id: 'bgm3', bpm: 124, beatsPerBar: 4, bars: 8, rootMidi: 38, // D2
      layers: [
        { name: 'L1-bass', wave: 'saw', notes: [NT(0, 0), NT(0.5, 0), NT(1, 1), NT(2, 0), NT(3, -2)], env: env(0.005, 0.08, 0.6, 0.1), gain: 0.38, filter: LP(300, 0.9), bus: 'music' }, // 含降 E 经过音
        { name: 'L2-arp', wave: 'sq', notes: [NT(0, 24), NT(0.5, 27), NT(1, 31), NT(1.5, 34)], env: env(0.005, 0.04, 0.5, 0.08), gain: 0.28, filter: BP(2000, 1.2), bus: 'music' }, // D4-F4-A4-C5
        { name: 'L3-perc', wave: 'white', notes: [NT(0, 0), NT(0.5, 0), NT(1, 0), NT(2, 0), NT(3, 0)], env: env(0.001, 0.02, 0.2, 0.03), gain: 0.26, filter: HP(6000, 0.7), bus: 'music' },
        { name: 'L4-warn-motif', wave: 'sin', notes: [NT(0, 34), NT(2, 34)], env: env(0.003, 0.04, 0.7, 0.1), gain: 0.2, bus: 'music' }, // 880/932/987 预警动机（音高由事件侧 SFX 保证）
      ],
    },
    // BGM-4 Boss：D 小调，132 BPM，8 小节（14.55 s），三阶段加层 + 转调。
    bgm4: {
      id: 'bgm4', bpm: 132, beatsPerBar: 4, bars: 8, rootMidi: 26, // D1/D2 贝斯
      layers: [
        { name: 'L1-bass', wave: 'saw', notes: [NT(0, 0), NT(0.5, 0), NT(1, 12), NT(2, 0), NT(3, 12)], env: env(0.005, 0.1, 0.7, 0.14), gain: 0.42, filter: LP(240, 1.0), bus: 'music' },
        pad('L2-dm-pad', [NT(0, 12), NT(0, 15), NT(0, 19)], 0.36, LP(900, 0.8)),
        { name: 'L3-corruption', wave: 'saw', notes: [NT(0, 19), NT(0.5, 22), NT(1, 26), NT(1.5, 25)], env: env(0.005, 0.06, 0.6, 0.1), gain: 0.3, filter: BP(1200, 1.4), bus: 'music', minBossPhase: 'corruption' }, // Em + B→Bb
        { name: 'L4-rift-choir', wave: 'saw', notes: [NT(0, 24), NT(0, 31), NT(2, 36)], env: env(0.3, 0.3, 0.8, 0.6), gain: 0.32, filter: BP(1200, 1.6), bus: 'music', minBossPhase: 'coreFrenzy' }, // detune saw 堆叠 + swell
      ],
    },
    // AMB-1 森林风声：粉噪声 LP700 + 慢速 LFO（LFO 在 synth 以 vib/trem 近似表达）。
    amb1: {
      id: 'amb1', bpm: 0, beatsPerBar: 4, bars: 2, rootMidi: 0, loopSec: 8,
      layers: [
        { name: 'AMB1-wind', wave: 'pink', notes: [NT(0, 0, 1)], env: env(1.0, 0.5, 1.0, 1.0), gain: 0.12, filter: LP(700, 0.5), bus: 'ambient', trem: [0.05, 0.2] },
      ],
    },
    // AMB-2 裂隙低鸣：sin 48 + sin 72（五度）+ saw 36，LP180，慢速 trem。
    amb2: {
      id: 'amb2', bpm: 0, beatsPerBar: 4, bars: 2, rootMidi: 0, loopSec: 6,
      layers: [
        { name: 'AMB2-48', wave: 'sin', notes: [NT(0, 0, 48)], env: env(1.0, 0.5, 1.0, 1.0), gain: 0.09, filter: LP(180, 0.7), bus: 'ambient', trem: [0.15, 0.35] },
        { name: 'AMB2-72', wave: 'sin', notes: [NT(0, 7, 72)], env: env(1.0, 0.5, 1.0, 1.0), gain: 0.09, filter: LP(180, 0.7), bus: 'ambient' },
        { name: 'AMB2-36', wave: 'saw', notes: [NT(0, -12, 36)], env: env(1.0, 0.5, 1.0, 1.0), gain: 0.09, filter: LP(180, 0.7), bus: 'ambient' },
      ],
    },
  },
} satisfies BgmRecipeSet;

/** 供调度器把半音偏移换算成 detune（cent）：1 半音 = 100 cent。 */
export const CENTS_PER_SEMITONE = 100;
