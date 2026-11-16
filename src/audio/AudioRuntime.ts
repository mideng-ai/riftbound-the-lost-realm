/**
 * 音频运行时组合根：组装解锁 / 总线 / 音源池 / BGM 调度 / 事件桥，统一生命周期。
 *
 * 对外只暴露 `start / playSfx / setMuted / dispose` 与只读调试端口；外部（main.ts）经 `index.ts`
 * 的 `createAudioRuntime` 使用，不深链内部模块。依赖全部构造注入，无单例（ADR-TD-008）。
 */
import type {
  AudioContextLike,
  AudioEventId,
  AudioNodeLike,
  AudioRuntimeOptions,
  BgmRecipeSet,
  GainNodeLike,
  SynthRecipe,
  TimerPort,
} from './types.ts';
import { createContextUnlock, type UnlockHandle } from './contextUnlock.ts';
import { AudioBridge } from './AudioBridge.ts';
import { VoicePool, type Voice } from './voicePool.ts';
import { BgmScheduler } from './bgmScheduler.ts';
import { sfxRecipes, MIX_CONST } from './recipes/sfxRecipes.ts';
import { bgmRecipes } from './recipes/bgmRecipes.ts';

/** 生产默认定时器（测试注入手动端口）。 */
const defaultTimers: TimerPort = {
  set: (fn, ms) => setInterval(fn, ms),
  clear: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * 生产默认上下文工厂（测试注入 mock）。
 * DOM AudioContext 的完整类型比本项目的最小结构端口更宽（onended 事件签名等），
 * 在本适配边界做一次 unknown 中转；运行时调用的每个方法都是标准 Web Audio API。
 */
const defaultContextFactory = (): AudioContextLike => new AudioContext() as unknown as AudioContextLike;

interface AudioGraph {
  readonly ctx: AudioContextLike;
  readonly master: GainNodeLike;
  readonly buses: Record<'sfx' | 'ui' | 'music' | 'ambient', GainNodeLike>;
  readonly pool: VoicePool;
  readonly bgm: BgmScheduler;
}

/** 主运行时类。 */
export class AudioRuntime {
  private readonly mutedInitial: boolean;
  private muted: boolean;
  private started = false;
  private unlock: UnlockHandle | null = null;
  private bridge: AudioBridge | null = null;
  private graph: AudioGraph | null = null;
  private readonly playTimes = new Map<AudioEventId, number[]>();
  private readonly options: AudioRuntimeOptions;

  constructor(options: AudioRuntimeOptions) {
    this.options = options;
    this.mutedInitial = options.muted ?? false;
    this.muted = this.mutedInitial;
  }

  /** 是否静音（只读调试端口）。 */
  get isMuted(): boolean { return this.muted; }
  /** 当前活跃 SFX 声部数。 */
  get activeVoices(): number { return this.graph?.pool.activeCount ?? 0; }
  /** 当前 BGM 曲目。 */
  get currentTrack(): string | null { return this.graph?.bgm.track ?? null; }
  /** 当前 BGM 累计转调半音。 */
  get transposeSemis(): number { return this.graph?.bgm.transpose ?? 0; }
  /** 事件订阅数（dispose 后 0）。 */
  get subscriptionCount(): number { return this.bridge?.subscriptionCount ?? 0; }
  /** 是否已创建 AudioContext（懒创建断言）。 */
  get contextCreated(): boolean { return this.unlock !== null && this.unlock.context !== null; }

  /** 挂载事件桥；幂等。首次播放/首次 BGM 控制事件才创建 AudioContext（懒创建）。 */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.unlock = createContextUnlock({
      factory: this.options.contextFactory ?? defaultContextFactory,
      dom: this.options.dom,
    });
    this.bridge = new AudioBridge({
      bus: this.options.bus,
      onSfx: (id) => { this.playSfx(id); },
      onBgm: (event) => { this.ensureGraph().bgm.handle(event); },
    });
    this.bridge.start();
  }

  /** 当前音频时间（秒）：注入优先，否则取自已创建的 ctx。 */
  private now(): number {
    return this.options.now?.() ?? this.unlock?.context?.currentTime ?? 0;
  }

  /** 懒创建总线图 + 音源池 + BGM 调度器。 */
  private ensureGraph(): AudioGraph {
    if (this.graph) return this.graph;
    const ctx = this.unlock!.context ?? this.unlock!.ensure();
    const at = this.now();

    const master = ctx.createGain();
    master.gain.setValueAtTime(this.muted ? 0 : MIX_CONST.busGain.master, at);
    let head: AudioNodeLike = master;
    if (ctx.createDynamicsCompressor) {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(MIX_CONST.limiter.thresholdDb, at);
      limiter.knee.setValueAtTime(MIX_CONST.limiter.kneeDb, at);
      limiter.ratio.setValueAtTime(MIX_CONST.limiter.ratio, at);
      limiter.attack.setValueAtTime(MIX_CONST.limiter.attackSec, at);
      limiter.release.setValueAtTime(MIX_CONST.limiter.releaseSec, at);
      limiter.connect(ctx.destination);
      head = limiter;
    } else {
      head = ctx.destination;
    }
    master.connect(head);

    const makeBus = (gain: number): GainNodeLike => {
      const node = ctx.createGain();
      node.gain.setValueAtTime(gain, at);
      node.connect(master);
      return node;
    };
    const buses = {
      sfx: makeBus(MIX_CONST.busGain.sfx),
      ui: makeBus(MIX_CONST.busGain.ui),
      music: makeBus(MIX_CONST.busGain.music),
      ambient: makeBus(MIX_CONST.busGain.ambient),
    };
    const now = () => this.now();
    const pool = new VoicePool({
      ctx,
      now,
      outputFor: (bus) => (bus === 'ui' ? buses.ui : buses.sfx),
    });
    const bgmRecipesInjected: BgmRecipeSet = this.options.bgmRecipes ?? bgmRecipes;
    const bgm = new BgmScheduler({
      ctx,
      recipes: bgmRecipesInjected,
      timers: this.options.timers ?? defaultTimers,
      now,
      outputFor: (bus) => (bus === 'music' ? buses.music : buses.ambient),
    });

    this.graph = { ctx, master, buses, pool, bgm };
    return this.graph;
  }

  /**
   * 显式播放一个音效 ID（供事件映射不触发的配方如 affix / bossAttack 使用）。
   * 静音、80 ms 合并、6 次/秒限流均在此收口（规格 §2.3 规则 4）。
   */
  playSfx(id: AudioEventId): Voice | null {
    if (this.muted) return null;
    const recipe: SynthRecipe | undefined = (this.options.sfxRecipes ?? sfxRecipes)[id];
    if (!recipe) return null;
    const nowSec = this.now();
    if (!this.allowPlay(id, nowSec)) return null;

    const graph = this.ensureGraph();
    const voice = graph.pool.play(recipe);
    if (voice && recipe.duck) this.applyDuck(graph, recipe.duck);
    return voice;
  }

  /** 合并 + 限流：返回本次是否允许真正建声部。 */
  private allowPlay(id: AudioEventId, nowSec: number): boolean {
    const nowMs = nowSec * 1000;
    const recent = (this.playTimes.get(id) ?? []).filter((t) => nowMs - t <= 1000);
    if (recent.length >= MIX_CONST.rateLimitPerSec) {
      this.playTimes.set(id, recent);
      return false;
    }
    const last = recent[recent.length - 1];
    if (last !== undefined && nowMs - last < MIX_CONST.dedupeWindowMs) return false;
    recent.push(nowMs);
    this.playTimes.set(id, recent);
    return true;
  }

  /** 受击 ducking：对 sfx / music 总线短时降 −3 dB 后恢复（规格 §2.3 规则 5）。 */
  private applyDuck(graph: AudioGraph, duck: readonly [number, number]): void {
    const [db, seconds] = duck;
    const factor = 10 ** (db / 20);
    const at = this.now();
    const sfxBase = MIX_CONST.busGain.sfx;
    const musicBase = MIX_CONST.busGain.music;
    graph.buses.sfx.gain.setValueAtTime(sfxBase * factor, at);
    graph.buses.sfx.gain.linearRampToValueAtTime(sfxBase, at + seconds);
    graph.buses.music.gain.setValueAtTime(musicBase * factor, at);
    graph.buses.music.gain.linearRampToValueAtTime(musicBase, at + seconds);
  }

  /** 设置静音（master gain 归零且停止产生新声部）。 */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.graph) {
      this.graph.master.gain.setValueAtTime(muted ? 0 : MIX_CONST.busGain.master, this.now());
    }
  }

  /**
   * 逐层销毁：先退订 → 清 BGM 定时器 → 停 SFX → 移除 DOM 监听 → 关闭 ctx。
   */
  dispose(): void {
    this.bridge?.dispose();
    this.bridge = null;
    this.graph?.bgm.dispose();
    this.graph?.pool.dispose();
    this.graph = null;
    this.unlock?.dispose();
    this.unlock = null;
    this.playTimes.clear();
    this.started = false;
  }

  /** 恢复初始静音配置（测试用；组合根不另行暴露设置面）。 */
  get initialMuted(): boolean { return this.mutedInitial; }
}

/**
 * 工厂：创建并挂载音频运行时（唯一对外入口）。
 */
export function createAudioRuntime(options: AudioRuntimeOptions): AudioRuntime {
  const runtime = new AudioRuntime(options);
  runtime.start();
  return runtime;
}
