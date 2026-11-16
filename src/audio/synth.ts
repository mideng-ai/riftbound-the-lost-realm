/**
 * 合成器：把 `SynthRecipe` 纯解释成 Web Audio 节点图（osc/noise → filter → ADSR gain → pan → 输出）。
 *
 * 硬约束（ADR-TD-008）：本文件**不含任何音色魔法数字**——波形、频率、ADSR、滤波、扫频、
 * 电平、延迟、颤音数值全部来自 `recipes/` 的音频总监规格；这里只负责翻译成 AudioParam 调用。
 * 所有节点都登记到 `PlaybackHandle`，由 voicePool 统一 fadeStop / 回收，杜绝泄漏。
 */
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  AudioBufferLike,
  Echo,
  OscLayer,
  OscWaveLike,
  ScheduledSourceLike,
  SynthRecipe,
} from './types.ts';
import { MIX_CONST } from './recipes/sfxRecipes.ts';

/** 白/粉噪声缓冲（按 ctx.sampleRate 运行时生成一次并复用）。 */
export interface NoiseBuffers {
  readonly white: AudioBufferLike;
  readonly pink: AudioBufferLike;
}

/** 层集选项：BGM/环境层与 SFX 共用同一解释器。 */
export interface LayerSetOptions extends SynthOptions {
  readonly echo?: Echo;
}

/** 合成选项：全部可注入，便于 headless 断言。 */
export interface SynthOptions {
  /** 起始音频时间（秒）；缺省 `ctx.currentTime`。 */
  readonly now?: number;
  /** 输出节点（总线增益）；缺省 `ctx.destination`。 */
  readonly output?: AudioNodeLike;
  /** 外部注入的噪声缓冲；缺省按 ctx 缓存生成。 */
  readonly buffers?: NoiseBuffers;
  /** 全部主声部自然结束后的回调（voicePool 用它回收 slot）。 */
  readonly onended?: () => void;
}

/** 可停止的播放句柄（幂等 fadeStop）。 */
export interface PlaybackHandle {
  readonly sources: readonly ScheduledSourceLike[];
  readonly stopped: boolean;
  /** 30 ms 快速释音（默认，来自规格 §2.3），供抢占/销毁使用。 */
  fadeStop(fadeSec?: number): void;
}

const OSC_WAVE: Readonly<Record<'sin' | 'tri' | 'saw' | 'sq', OscWaveLike>> = {
  sin: 'sine', tri: 'triangle', saw: 'sawtooth', sq: 'square',
};

const noiseCache = new WeakMap<AudioContextLike, NoiseBuffers>();

/**
 * 取得（或首次生成）该 ctx 的白/粉噪声缓冲。
 * 生成用确定性 LCG + Paul Kellet 粉噪近似，避免测试里引入 Math.random 的不确定性；
 * 听感与随机噪声等价，且缓冲只生成一次复用（规格 §2.1）。
 */
export function getNoiseBuffers(ctx: AudioContextLike): NoiseBuffers {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(ctx.sampleRate * MIX_CONST.noiseBufferSec));
  const white = ctx.createBuffer(1, length, ctx.sampleRate);
  const pink = ctx.createBuffer(1, length, ctx.sampleRate);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  let seed = 0x9e3779b9;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const wn = (seed / 4294967296) * 2 - 1;
    w[i] = wn;
    b0 = 0.99886 * b0 + wn * 0.0555179;
    b1 = 0.99332 * b1 + wn * 0.0750759;
    b2 = 0.96900 * b2 + wn * 0.1538520;
    p[i] = (b0 + b1 + b2 + wn * 0.5362) * 0.11;
  }
  const buffers: NoiseBuffers = { white, pink };
  noiseCache.set(ctx, buffers);
  return buffers;
}

/**
 * 解释一组声部（SFX 配方或 BGM 动机），构造节点图并返回可停止句柄。
 * 纯函数式：不修改输入、不持有全局状态（噪声缓冲按 ctx 缓存除外）。
 */
export function synthesizeLayers(
  ctx: AudioContextLike,
  layers: readonly OscLayer[],
  durationSec: number,
  opts: LayerSetOptions = {},
): PlaybackHandle {
  const t0 = opts.now ?? ctx.currentTime;
  const output = opts.output ?? ctx.destination;
  const buffers = opts.buffers ?? getNoiseBuffers(ctx);
  const sources: ScheduledSourceLike[] = [];
  const gains: AudioParamLike[] = [];
  let expectedEnded = 0;
  let endedCount = 0;
  let stopped = false;

  const noteEnded = (): void => {
    endedCount += 1;
    if (endedCount === expectedEnded) opts.onended?.();
  };

  // 回声展开为「延迟一档、增益 ×feedback」的额外声部实例（单次回声，不做反馈环）。
  interface Instance { readonly layer: OscLayer; readonly offset: number; readonly gainScale: number }
  const instances: Instance[] = layers.map((layer) => ({ layer, offset: layer.start ?? 0, gainScale: 1 }));
  if (opts.echo) {
    for (const tap of opts.echo.taps) {
      for (const layer of layers) {
        instances.push({ layer, offset: (layer.start ?? 0) + tap, gainScale: opts.echo.feedback });
      }
    }
  }

  // 需 NumberOfEnded 的主声部数量（LFO 不计，随主声部一起 stop）。
  for (const inst of instances) expectedEnded += inst.layer.notes.length;

  for (const inst of instances) {
    const { layer, offset, gainScale } = inst;
    const isNoise = layer.wave === 'white' || layer.wave === 'pink';
    for (const note of layer.notes) {
      const startAt = t0 + offset + note.at;
      const timeLeft = Math.max(0.001, t0 + durationSec - startAt);
      const { a, d, s: sustain, r } = layer.env;
      const hold = Math.max(0, timeLeft - a - d - r);
      const level = layer.gain * gainScale;
      const endAt = startAt + a + d + hold + r;
      const stopAt = Math.min(t0 + durationSec, Math.max(startAt + 0.001, endAt));

      // ADSR：setValue(0) → A → D → hold → R → 0（规格 §2.1）。
      const gain = ctx.createGain();
      const gp = gain.gain;
      gains.push(gp);
      gp.setValueAtTime(0, startAt);
      gp.linearRampToValueAtTime(level, startAt + a);
      gp.linearRampToValueAtTime(level * sustain, startAt + a + d);
      gp.setValueAtTime(level * sustain, startAt + a + d + hold);
      gp.linearRampToValueAtTime(0, endAt);

      let head: AudioNodeLike = gain;
      if (layer.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = layer.filter.type;
        filter.frequency.setValueAtTime(layer.filter.freq, startAt);
        filter.Q.setValueAtTime(layer.filter.q, startAt);
        const sweep = layer.filter.sweep;
        if (sweep) {
          const denominator = sweep.length + 1;
          sweep.forEach((hz, i) => {
            filter.frequency.linearRampToValueAtTime(hz, startAt + (durationSec * (i + 1)) / denominator);
          });
        }
        filter.connect(gain);
        head = filter;
      }

      if (layer.pan) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(layer.pan[0], startAt);
        panner.pan.linearRampToValueAtTime(layer.pan[1], startAt + durationSec);
        panner.connect(output);
        gain.connect(panner);
      } else {
        gain.connect(output);
      }

      let source: ScheduledSourceLike;
      if (isNoise) {
        const bs = ctx.createBufferSource();
        bs.buffer = layer.wave === 'pink' ? buffers.pink : buffers.white;
        bs.loop = true;
        source = bs;
      } else {
        const osc = ctx.createOscillator();
        if (layer.wave === 'periodic' && layer.harmonics && ctx.createPeriodicWave && osc.setPeriodicWave) {
          const harmonics = layer.harmonics;
          const real = new Float32Array(harmonics + 1);
          const imag = new Float32Array(harmonics + 1);
          for (let h = 1; h <= harmonics; h++) imag[h] = 1 / h;
          osc.setPeriodicWave(ctx.createPeriodicWave(real, imag, true));
        } else {
          osc.type = OSC_WAVE[layer.wave === 'periodic' ? 'sin' : layer.wave];
        }
        osc.frequency.setValueAtTime(note.hz, startAt);
        if (layer.sweep) {
          const target = layer.sweep.to;
          const at = startAt + layer.sweep.sec;
          if (layer.sweep.linear) osc.frequency.linearRampToValueAtTime(target, at);
          else osc.frequency.exponentialRampToValueAtTime(target, at);
        }
        osc.detune.setValueAtTime(layer.detune ?? 0, startAt);
        if (layer.vib) {
          // 颤音：LFO(sin) → 深度 gain → osc.detune（AudioParam 调制）。
          const lfo = ctx.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.setValueAtTime(layer.vib[0], startAt);
          const depth = ctx.createGain();
          depth.gain.setValueAtTime(layer.vib[1], startAt);
          lfo.connect(depth);
          depth.connect(osc.detune);
          lfo.start(startAt);
          lfo.stop(stopAt);
          sources.push(lfo);
        }
        source = osc;
      }

      if (layer.trem) {
        // 振幅颤音：LFO(sin) → 深度×电平 gain → ADSR gain.gain（与自动化值叠加）。
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(layer.trem[0], startAt);
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(level * layer.trem[1], startAt);
        lfo.connect(depth);
        depth.connect(gp);
        lfo.start(startAt);
        lfo.stop(stopAt);
        sources.push(lfo);
      }

      source.connect(head);
      source.start(startAt);
      source.stop(stopAt);
      source.onended = noteEnded;
      sources.push(source);
    }
  }

  return {
    sources,
    get stopped() { return stopped; },
    fadeStop(fadeSec: number = MIX_CONST.preemptFadeSec): void {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      const end = now + Math.max(0, fadeSec);
      for (const param of gains) {
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(0, end);
      }
      for (const source of sources) {
        try { source.stop(end); } catch { /* 已自然结束的源重复 stop 抛错，幂等忽略 */ }
      }
    },
  };
}

/** 解释一条 SFX 配方（synth 的常用入口，委托给层集解释器）。 */
export function synthesize(
  ctx: AudioContextLike,
  recipe: SynthRecipe,
  opts: SynthOptions = {},
): PlaybackHandle {
  return synthesizeLayers(ctx, recipe.layers, recipe.dur, { ...opts, echo: recipe.echo });
}
