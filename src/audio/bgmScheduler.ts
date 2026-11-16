/**
 * BGM 调度器：4 曲目 + 2 环境层分层、lookahead 排程、Boss 三阶段转调。
 *
 * 依赖注入：`AudioClock` 用 `now()`（缺省 ctx.currentTime）+ `TimerPort`（headless 可手动驱动）；
 * 曲目的音乐性数值一律来自 `recipes/bgmRecipes.ts`，本文件只做「选曲 / 换层 / 转调 / 定时」。
 * BGM 声部与 SFX 的 16 池物理隔离（规格 §5.2），自身上限 12 声部。
 */
import type {
  AudioContextLike,
  AudioNodeLike,
  BgmControlEvent,
  BgmRecipeSet,
  BgmTrack,
  BgmTrackId,
  BossPhase,
  OscLayer,
  TimerPort,
} from './types.ts';
import { CENTS_PER_SEMITONE } from './recipes/bgmRecipes.ts';
import { MIX_CONST } from './recipes/sfxRecipes.ts';
import { synthesizeLayers, type PlaybackHandle } from './synth.ts';

/** MIDI 标准调音（非玩法数值）。 */
const MIDI_A4_HZ = 440;
const MIDI_A4_NOTE = 69;
/** 规格 §5.2：BGM 声部自身上限 12。 */
const MAX_BGM_VOICES = 12;
/** Boss 阶段加层的先后顺序（规格 §4.5：P1→P2→P3）。 */
const PHASE_ORDER: Readonly<Record<BossPhase, number>> = { guardian: 0, corruption: 1, coreFrenzy: 2 };

const hzOfMidi = (midi: number): number => MIDI_A4_HZ * 2 ** ((midi - MIDI_A4_NOTE) / 12);

/** 调度器依赖。 */
export interface BgmSchedulerOptions {
  readonly ctx: AudioContextLike;
  readonly recipes: BgmRecipeSet;
  readonly timers: TimerPort;
  readonly now: () => number;
  readonly outputFor: (bus: 'music' | 'ambient') => AudioNodeLike;
}

/**
 * BGM 调度器。start() 幂等；dispose() 清定时器、停声部、归零句柄。
 */
export class BgmScheduler {
  private currentTrack: BgmTrackId | null = null;
  private bossPhase: BossPhase = 'guardian';
  private transposeSemis = 0;
  private timer: unknown = null;
  private active: PlaybackHandle[] = [];
  private nextMusicAt = 0;
  private readonly nextAmbientAt = new Map<BgmTrackId, number>();
  private readonly options: BgmSchedulerOptions;

  constructor(options: BgmSchedulerOptions) {
    this.options = options;
  }

  /** 当前曲目（未 start 时 null）。 */
  get track(): BgmTrackId | null { return this.currentTrack; }
  /** 当前累计转调半音（guardian=0 / corruption=+2 / coreFrenzy=+5）。 */
  get transpose(): number { return this.transposeSemis; }
  /** 当前定时器句柄；dispose 后为 null（测试断言）。 */
  get timerHandle(): unknown { return this.timer; }
  /** 活跃 BGM/环境声部数（不得超过 12）。 */
  get activeVoiceCount(): number { return this.active.length; }

  /** 启动 lookahead 定时器并切到准备曲（幂等）。 */
  start(): void {
    if (this.timer !== null) return;
    this.nextMusicAt = this.options.now() + MIX_CONST.bgmTickMs / 1000;
    this.timer = this.options.timers.set(() => this.tick(), MIX_CONST.bgmTickMs);
    this.selectTrack('bgm1');
  }

  /** 消费一条 BGM 控制事件（与 SFX 消费同一条领域事件，天然对齐）。 */
  handle(event: BgmControlEvent): void {
    switch (event.kind) {
      case 'phase':
        this.selectTrack(this.options.recipes.phaseTrack[event.to]);
        break;
      case 'warn':
        this.selectTrack(this.options.recipes.warnTrack);
        break;
      case 'bossSpawn':
        this.selectTrack(this.options.recipes.bossTrack);
        this.ambientIds().add('amb2');
        break;
      case 'bossPhase': {
        const previous = this.bossPhase;
        this.bossPhase = event.phase;
        this.transposeSemis = this.options.recipes.bossTranspose[event.phase];
        if (this.bossPhase !== previous) {
          // 旧层按规格 §4.5 的 1.2/1.5 s 淡出，新层在下一 tick 以新 detune 起音。
          this.fadeActive(this.options.recipes.bossPhaseFadeSec[event.phase]);
        }
        if (this.currentTrack !== this.options.recipes.bossTrack) {
          this.selectTrack(this.options.recipes.bossTrack);
        }
        break;
      }
      case 'settled':
        this.selectTrack('bgm1');
        this.ambientIds().delete('amb2');
        break;
    }
  }

  /** 当前启用的环境层（AMB-1 常驻，AMB-2 由 bossSpawn 开启）。 */
  private ambientIds(): Set<BgmTrackId> {
    if (!this.enabledAmbient) this.enabledAmbient = new Set<BgmTrackId>(['amb1']);
    return this.enabledAmbient;
  }
  private enabledAmbient: Set<BgmTrackId> | null = null;

  /** 切换曲目：淡出旧声部、重置排程指针。 */
  private selectTrack(id: BgmTrackId): void {
    if (this.currentTrack === id) return;
    this.currentTrack = id;
    this.fadeActive(MIX_CONST.bgmCrossfadeSec);
    this.nextMusicAt = this.options.now() + MIX_CONST.bgmTickMs / 1000;
  }

  /** lookahead tick：预排 100 ms 内的下一循环/小节。 */
  private tick(): void {
    const now = this.options.now();
    const ahead = now + MIX_CONST.bgmScheduleAheadSec;
    if (this.currentTrack) {
      const track = this.options.recipes.tracks[this.currentTrack];
      const loopSec = this.loopSecOf(track);
      if (this.nextMusicAt < now) this.nextMusicAt = now + MIX_CONST.bgmTickMs / 1000;
      while (this.nextMusicAt < ahead) {
        this.scheduleLoop(track, this.nextMusicAt);
        this.nextMusicAt += loopSec;
      }
    }
    for (const id of this.ambientIds()) {
      const track = this.options.recipes.tracks[id];
      let at = this.nextAmbientAt.get(id) ?? now + MIX_CONST.bgmTickMs / 1000;
      if (at < now) at = now + MIX_CONST.bgmTickMs / 1000;
      while (at < ahead) {
        this.scheduleLoop(track, at);
        at += this.loopSecOf(track);
      }
      this.nextAmbientAt.set(id, at);
    }
    // 上限保护：防止异常 tick 频率累积声部（正常自然结束由浏览器回收）。
    while (this.active.length > MAX_BGM_VOICES) {
      const oldest = this.active.shift();
      oldest?.fadeStop(MIX_CONST.bgmCrossfadeSec);
    }
  }

  /** 一个循环内的所有层、所有音符排程。 */
  private scheduleLoop(track: BgmTrack, at: number): void {
    const secPerBeat = track.bpm > 0 ? 60 / track.bpm : 0;
    for (const layer of track.layers) {
      if (layer.minBossPhase && PHASE_ORDER[this.bossPhase] < PHASE_ORDER[layer.minBossPhase]) continue;
      for (const note of layer.notes) {
        const layers: OscLayer[] = [{
          wave: layer.wave,
          notes: [{ hz: note.hz ?? hzOfMidi(track.rootMidi + note.semitone), at: note.atBeat * secPerBeat }],
          env: layer.env,
          gain: layer.gain,
          filter: layer.filter,
          detune: (layer.detune ?? 0) + this.transposeSemis * CENTS_PER_SEMITONE,
          vib: layer.vib,
          trem: layer.trem,
        }];
        const handle = synthesizeLayers(this.options.ctx, layers, this.loopSecOf(track), {
          now: at,
          output: this.options.outputFor(layer.bus),
        });
        this.active.push(handle);
      }
    }
  }

  private loopSecOf(track: BgmTrack): number {
    return track.loopSec ?? (60 / track.bpm) * track.beatsPerBar * track.bars;
  }

  /** 按给定秒数淡出全部活跃声部并清空列表（不硬停，防 click）。 */
  private fadeActive(seconds: number): void {
    for (const handle of this.active) handle.fadeStop(seconds);
    this.active = [];
  }

  /** 清定时器 + 停全部 BGM/环境声部。 */
  dispose(): void {
    if (this.timer !== null) {
      this.options.timers.clear(this.timer);
      this.timer = null;
    }
    this.fadeActive(MIX_CONST.bgmCrossfadeSec);
    this.enabledAmbient = null;
    this.nextAmbientAt.clear();
    this.currentTrack = null;
  }
}
