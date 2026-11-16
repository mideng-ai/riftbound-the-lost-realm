/**
 * 音频运行时 - 全部类型与依赖端口（纯结构类型，无运行时代码）。
 *
 * 设计要点：
 *   - Web Audio 对象用**最小结构接口**表达，而非 DOM 的 `AudioContext` 全类型：
 *     这样 headless 测试只需 spy 对象即可注入，无需真实音频设备（ADR-TD-008「可注入 mock」）。
 *   - 配方形状在此定义；数值唯一来源是 `recipes/` 下的音频总监规格翻译表，本文件不含魔法数字。
 *   - 所有 domain 类型经 `domain/index.ts` 以 `import type` 引入，运行时零依赖、零反向污染。
 */
import type {
  AudioEventId,
  MixerPriorityLevel,
  EventBusApi,
  GameEventType,
  GameEventMap,
  Unsubscribe,
  BossPhase,
  RunPhase,
} from '../domain/index.ts';

export type {
  AudioEventId, MixerPriorityLevel, EventBusApi, GameEventType, GameEventMap,
  Unsubscribe, BossPhase, RunPhase,
};

// ─────────────────────────────────────────────────────────────
// Web Audio 最小结构端口（mock 友好）
// ─────────────────────────────────────────────────────────────

/** AudioParam 的最小可自动化面（含可读写 value，供 LFO / 静态设置）。 */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
  cancelScheduledValues(cancelTime: number): void;
}

/** 可被 connect 的节点最小面。 */
export interface AudioNodeLike {
  /** 真实 Web Audio 允许连到 AudioParam（LFO 调制），本端口同样开放。 */
  connect(destination: AudioNodeLike | AudioParamLike): void;
  disconnect(): void;
}

/** 有 start/stop 生命周期的源节点（振荡器 / 缓冲源）。 */
export interface ScheduledSourceLike extends AudioNodeLike {
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

/** Web Audio 振荡器波形名（原生 API 取值，与配方 Wave 区分）。 */
export type OscWaveLike = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'custom';

/** Biquad 滤波器类型（配方只用 LP/HP/BP；全集保证 DOM AudioContext 结构兼容）。 */
export type BiquadFilterTypeLike =
  | 'lowpass' | 'highpass' | 'bandpass' | 'lowshelf' | 'highshelf'
  | 'peaking' | 'notch' | 'allpass';

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface FilterNodeLike extends AudioNodeLike {
  type: BiquadFilterTypeLike;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

export interface PannerNodeLike extends AudioNodeLike {
  readonly pan: AudioParamLike;
}

export interface OscillatorNodeLike extends ScheduledSourceLike {
  type: OscWaveLike;
  readonly frequency: AudioParamLike;
  readonly detune: AudioParamLike;
  /** `PW:k` 用；mock 可不实现，synth 自动回退基频正弦。 */
  setPeriodicWave?(wave: unknown): void;
}

/** 主总线限制器（规格 §2.2：threshold/knee/ratio/attack/release）。 */
export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  readonly threshold: AudioParamLike;
  readonly knee: AudioParamLike;
  readonly ratio: AudioParamLike;
  readonly attack: AudioParamLike;
  readonly release: AudioParamLike;
}

export interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceLike extends ScheduledSourceLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  readonly playbackRate: AudioParamLike;
}

/** 运行时真正使用的 AudioContext 最小面。 */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createBiquadFilter(): FilterNodeLike;
  createStereoPanner(): PannerNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBufferSource(): BufferSourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  /** `PW:k` 用；mock 可不实现。 */
  createPeriodicWave?(real: Float32Array, imag: Float32Array, disableNormalization?: boolean): unknown;
  /** 主总线限制器；mock 可不实现，缺省直连 destination。 */
  createDynamicsCompressor?(): DynamicsCompressorNodeLike;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/** AudioContext 工厂端口（懒创建，注入 mock）。 */
export type ContextFactory = () => AudioContextLike;

/** 定时器端口：调度器用它做 lookahead tick，测试可注入手动驱动。 */
export interface TimerPort {
  set(fn: () => void, intervalMs: number): unknown;
  clear(handle: unknown): void;
}

/** DOM 事件监听端口：解锁与可见性挂起，headless 下注入 spy。 */
export type DomTarget = 'window' | 'document';

export interface DomPort {
  addEventListener(target: DomTarget, type: string, fn: () => void): void;
  removeEventListener(target: DomTarget, type: string, fn: () => void): void;
  /** 文档是否隐藏（可见性挂起策略）；mock 可省略，默认 false。 */
  isHidden?(): boolean;
}

/** 注入到 AudioRuntime 的可选依赖，全部可缺省以便生产直用、测试注入。 */
export interface AudioRuntimeOptions {
  readonly bus: EventBusApi;
  readonly muted?: boolean;
  readonly contextFactory?: ContextFactory;
  readonly dom?: DomPort;
  readonly timers?: TimerPort;
  /** 返回当前音频时间（秒）；缺省取 `ctx.currentTime`。 */
  readonly now?: () => number;
  /** 覆盖配方表（测试可注入最小配方）；缺省用音频总监规格翻译表。 */
  readonly sfxRecipes?: Readonly<Record<AudioEventId, SynthRecipe>>;
  readonly bgmRecipes?: BgmRecipeSet;
}

// ─────────────────────────────────────────────────────────────
// 合成配方形状（数值来自规格，synth 只解释不发明）
// ─────────────────────────────────────────────────────────────

/** 波形 / 声源（规格 §2.1 的 W 列）。 */
export type Wave = 'sin' | 'tri' | 'saw' | 'sq' | 'white' | 'pink' | 'periodic';

/** ADSR：a/d/r 秒，s 为 0–1 比例电平。 */
export interface Envelope {
  readonly a: number;
  readonly d: number;
  readonly s: number;
  readonly r: number;
}

/** 滤波器（LP/HP/BP + 截止 Hz + Q；sweep 为 DUR 内等分的截止里程碑）。 */
export interface Filter {
  readonly type: BiquadFilterTypeLike;
  readonly freq: number;
  readonly q: number;
  readonly sweep?: readonly number[];
}

/** 基频扫频（from 由 Note.hz 提供，to/秒/ramp 在此）。 */
export interface Sweep {
  readonly to: number;
  readonly sec: number;
  readonly linear?: boolean;
}

/** 一个音符（频率 Hz + 相对该声部起点的秒偏移；单音时 at=0）。 */
export interface Note {
  readonly hz: number;
  readonly at: number;
}

/** 一条声部（osc 或噪声源 → filter → ADSR gain → pan）。 */
export interface OscLayer {
  readonly wave: Wave;
  /** `PW:k` 的前 k 次谐波，仅 wave='periodic' 使用。 */
  readonly harmonics?: number;
  readonly notes: readonly Note[];
  readonly sweep?: Sweep;
  readonly env: Envelope;
  readonly gain: number;
  readonly filter?: Filter;
  /** 失谐（cent）。 */
  readonly detune?: number;
  /** 颤音 [Hz, ±cent]。 */
  readonly vib?: readonly [number, number];
  /**  tremolo [Hz, 0–1 深度]。 */
  readonly trem?: readonly [number, number];
  /** 声像 [起, 终]（-1…1）。 */
  readonly pan?: readonly [number, number];
  /** 该声部相对配方起点的延迟（秒）。 */
  readonly start?: number;
}

/** 单次回声（规格 §2.1 delay `秒 fb<0–1>`，不用 Convolver）。 */
export interface Echo {
  readonly taps: readonly number[];
  readonly feedback: number;
}

/** 一条完整 SFX 配方（对应规格 §3 的一行）。 */
export interface SynthRecipe {
  readonly id: AudioEventId;
  readonly priority: MixerPriorityLevel;
  readonly bus: 'sfx' | 'ui';
  readonly dur: number;
  readonly layers: readonly OscLayer[];
  readonly echo?: Echo;
  /** 闪避 [dB（负值）, 秒]（受击例外，规格 §2.3 规则 5）。 */
  readonly duck?: readonly [number, number];
}

// ─────────────────────────────────────────────────────────────
// BGM 配方形状（规格 §4）
// ─────────────────────────────────────────────────────────────

/** 4 曲目 + 2 环境层。 */
export type BgmTrackId = 'bgm1' | 'bgm2' | 'bgm3' | 'bgm4' | 'amb1' | 'amb2';

/** BGM 音符：小节内拍偏移 + 相对根音的半音；`hz` 给无调式环境层写绝对频率。 */
export interface BgmNote {
  readonly atBeat: number;
  readonly semitone: number;
  readonly hz?: number;
}

/** BGM 分层（Pad / Pluck / Bell / Perc / Drone）。 */
export interface BgmLayer {
  readonly name: string;
  readonly wave: Wave;
  readonly notes: readonly BgmNote[];
  readonly env: Envelope;
  readonly gain: number;
  readonly filter?: Filter;
  readonly detune?: number;
  /** 颤音 [Hz, ±cent] / 振幅颤音 [Hz, 0–1 深度]（环境层 LFO 用）。 */
  readonly vib?: readonly [number, number];
  readonly trem?: readonly [number, number];
  readonly bus: 'music' | 'ambient';
  /** 仅当 Boss 阶段 >= 此层时才激活（BGM-4 三阶段加层）。 */
  readonly minBossPhase?: BossPhase;
}

/** 一首曲目 / 环境层。 */
export interface BgmTrack {
  readonly id: BgmTrackId;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly bars: number;
  /** 根音 MIDI 号（转调 = 根音 + 半音偏移）。 */
  readonly rootMidi: number;
  /** 环境层（bpm=0）的固定循环秒数；音乐曲目留空，由 bpm/bars 推导。 */
  readonly loopSec?: number;
  readonly layers: readonly BgmLayer[];
}

/** BGM 配方集：曲目 + 阶段选曲表 + Boss 转调偏移表。 */
export interface BgmRecipeSet {
  readonly tracks: Readonly<Record<BgmTrackId, BgmTrack>>;
  /** RunPhase 与两个 Boss 离散事件到曲目的映射。 */
  readonly phaseTrack: Readonly<Record<RunPhase, BgmTrackId>>;
  readonly warnTrack: BgmTrackId;
  readonly bossTrack: BgmTrackId;
  /** Boss 三阶段累计转调半音（guardian=0）。 */
  readonly bossTranspose: Readonly<Record<BossPhase, number>>;
  /** 阶段切换时旧层的交叉淡出秒数（规格 §4.5：P2 1.2 s / P3 1.5 s）。 */
  readonly bossPhaseFadeSec: Readonly<Record<BossPhase, number>>;
}

/** 调度器消费的控制事件（由 AudioBridge 从领域事件翻译，非领域层类型）。 */
export type BgmControlEvent =
  | { readonly kind: 'phase'; readonly to: RunPhase }
  | { readonly kind: 'warn' }
  | { readonly kind: 'bossSpawn' }
  | { readonly kind: 'bossPhase'; readonly phase: BossPhase }
  | { readonly kind: 'settled' };
