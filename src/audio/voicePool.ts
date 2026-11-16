/**
 * SFX 音源池：上限 16（数值来自冻结 config），满池按混音优先级抢占，同级抢占最老。
 *
 * 数值纪律：
 *   - `maxConcurrentVoices` 直接读 `audioEventMapConfig`（冻结唯一来源；domain 桶未导出该字段，
 *     故音频层只读取、不修改、不重定义——见实现回报的蓝图偏离说明）。
 *   - 优先级数值经冻结函数 `mixerPriorityOf(档位)` 读取，档位来自配方表，不在本文件硬编码。
 */
import { mixerPriorityOf } from '../domain/index.ts';
import { audioEventMapConfig } from '../config/audioEventMapConfig.ts';
import type { AudioContextLike, AudioNodeLike, SynthRecipe } from './types.ts';
import { synthesize, type PlaybackHandle } from './synth.ts';
import { MIX_CONST } from './recipes/sfxRecipes.ts';

/** 池内一条活跃声部。 */
export interface Voice {
  readonly seq: number;
  readonly recipe: SynthRecipe;
  readonly priority: number;
  /** 入池时间（秒，来自注入时钟），用于同级抢占时判定「最老」。 */
  readonly startedAt: number;
  readonly handle: PlaybackHandle;
}

/** 音源池依赖（全部注入，无单例）。 */
export interface VoicePoolOptions {
  readonly ctx: AudioContextLike;
  /** 当前音频时间（秒）。 */
  readonly now: () => number;
  /** 按配方总线取输出节点（由 AudioRuntime 提供 master/bus 图）。 */
  readonly outputFor: (bus: SynthRecipe['bus']) => AudioNodeLike;
  /** 仅测试可覆盖；缺省读冻结 config 的 16。 */
  readonly maxVoices?: number;
}

/** 16 声部 SFX 池。 */
export class VoicePool {
  private voices: Voice[] = [];
  private nextSeq = 1;
  private readonly max: number;
  private readonly opts: VoicePoolOptions;

  constructor(opts: VoicePoolOptions) {
    this.opts = opts;
    this.max = opts.maxVoices ?? audioEventMapConfig.maxConcurrentVoices;
  }

  /** 当前活跃声部数（不得 > max）。 */
  get activeCount(): number {
    return this.voices.length;
  }

  /** 活跃声部快照（只读数组，供测试与调试端口断言）。 */
  get snapshot(): readonly Voice[] {
    return [...this.voices];
  }

  /**
   * 播放一条配方。池未满直接入池；池满时仅在「新优先级严格大于最弱声部」时抢占。
   *
   * 抢占目标 = 优先级最低者，同级取最老（startedAt 最小、seq 最小）。
   * 被抢占者走 30 ms 快速释音后立即回收 slot，禁止硬停（防爆音 click，规格 §2.3）。
   *
   * @returns 新声部；被限流/不抢占时返回 null。
   */
  play(recipe: SynthRecipe): Voice | null {
    const priority = mixerPriorityOf(recipe.priority);
    if (this.voices.length >= this.max) {
      let victimIndex = 0;
      for (let i = 1; i < this.voices.length; i++) {
        const candidate = this.voices[i];
        const victim = this.voices[victimIndex];
        if (
          candidate.priority < victim.priority ||
          (candidate.priority === victim.priority && candidate.startedAt < victim.startedAt) ||
          (candidate.priority === victim.priority && candidate.startedAt === victim.startedAt && candidate.seq < victim.seq)
        ) {
          victimIndex = i;
        }
      }
      const victim = this.voices[victimIndex];
      if (priority <= victim.priority) return null;
      victim.handle.fadeStop(MIX_CONST.preemptFadeSec);
      this.voices.splice(victimIndex, 1);
    }

    const seq = this.nextSeq++;
    const startedAt = this.opts.now();
    const handle = synthesize(this.opts.ctx, recipe, {
      now: startedAt,
      output: this.opts.outputFor(recipe.bus),
      onended: () => this.reclaim(seq),
    });
    const voice: Voice = { seq, recipe, priority, startedAt, handle };
    this.voices.push(voice);
    return voice;
  }

  /** 自然结束回调：按 seq 幂等回收，不影响后入池的同优先级声部。 */
  private reclaim(seq: number): void {
    const idx = this.voices.findIndex((v) => v.seq === seq);
    if (idx >= 0) this.voices.splice(idx, 1);
  }

  /** 停全部声部并清空池（组合根 dispose 用）。 */
  dispose(): void {
    for (const voice of this.voices) voice.handle.fadeStop(MIX_CONST.preemptFadeSec);
    this.voices = [];
  }
}
