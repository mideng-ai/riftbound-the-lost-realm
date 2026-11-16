/**
 * 事件桥：订阅共享 `EventBusApi`，把领域事件翻译成 SFX 播放与 BGM 控制。
 *
 * 关键纪律：
 *   - 「播什么」一律用冻结契约 `resolveSfxForEvent(type, payload)` 解析，本文件不复制动态映射逻辑；
 *   - 每个 subscribe 返回的 `Unsubscribe` 逐条保存，dispose 逐条调用；**绝不 `bus.clearAll()`**
 *     （会误伤 UI / combat 的监听，见架构蓝图 §4）；
 *   - 同一事件（boss.phase_changed / run.phaseChanged）同时喂给 SFX 与 BGM 两条消费路径，天然对齐。
 */
import { AUDIO_EVENT_MAP, resolveSfxForEvent } from '../domain/index.ts';
import type {
  AudioEventId,
  BgmControlEvent,
  EventBusApi,
  GameEventMap,
  GameEventType,
  Unsubscribe,
} from './types.ts';

/** AudioBridge 依赖（注入，无单例）。 */
export interface AudioBridgeOptions {
  readonly bus: EventBusApi;
  /** 每个可达音效 ID 的播放回调（由 AudioRuntime 接到 voicePool）。 */
  readonly onSfx: (id: AudioEventId, sourceEvent: GameEventType) => void;
  /** BGM 控制回调（由 AudioRuntime 接到 scheduler）。 */
  readonly onBgm: (event: BgmControlEvent) => void;
}

/** 事件 → 音频的只读桥。 */
export class AudioBridge {
  private readonly unsubs: Unsubscribe[] = [];
  private unsubscribeCalls = 0;
  private started = false;
  private readonly options: AudioBridgeOptions;

  constructor(options: AudioBridgeOptions) {
    this.options = options;
  }

  /** 已建立的订阅数（测试断言用）。 */
  get subscriptionCount(): number {
    return this.unsubs.length;
  }

  /** 已执行的退订次数（测试断言 == subscriptionCount）。 */
  get unsubscribeCallCount(): number {
    return this.unsubscribeCalls;
  }

  /** 订阅全部音频相关领域事件；幂等。 */
  start(): void {
    if (this.started) return;
    this.started = true;
    const types = Object.keys(AUDIO_EVENT_MAP) as GameEventType[];
    for (const type of types) this.unsubs.push(this.wire(type));
  }

  private wire<K extends GameEventType>(type: K): Unsubscribe {
    return this.options.bus.subscribe(type, (payload: GameEventMap[K]) => {
      this.onEvent(type, payload);
    });
  }

  /** 单条事件的翻译入口（SFX + BGM 双路径）。 */
  private onEvent(type: GameEventType, payload: GameEventMap[GameEventType]): void {
    switch (type) {
      case 'run.phaseChanged':
        this.options.onBgm({ kind: 'phase', to: (payload as GameEventMap['run.phaseChanged']).to });
        break;
      case 'boss.warning_started':
        this.options.onBgm({ kind: 'warn' });
        break;
      case 'boss.spawned':
        this.options.onBgm({ kind: 'bossSpawn' });
        break;
      case 'boss.phase_changed':
        this.options.onBgm({ kind: 'bossPhase', phase: (payload as GameEventMap['boss.phase_changed']).phase });
        break;
      case 'run.settled':
        this.options.onBgm({ kind: 'settled' });
        break;
      default:
        break;
    }
    for (const id of resolveSfxForEvent(type, payload)) this.options.onSfx(id, type);
  }

  /** 逐条退订（不调用 clearAll，避免误伤其他系统）。 */
  dispose(): void {
    for (const unsubscribe of this.unsubs) {
      unsubscribe();
      this.unsubscribeCalls += 1;
    }
    this.unsubs.length = 0;
    this.started = false;
  }
}
