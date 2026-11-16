/**
 * AudioContext 解锁与生命周期（规格 §5.1）。
 *
 * 懒创建：页面加载时不建 ctx；首次用户手势（pointerdown/touchstart/keydown）或首次播放请求
 * 才 `factory()` + `resume()`，手势内附一帧静音 buffer 兜底旧 WebKit 首声锁。
 * visibilitychange 隐藏时 suspend、可见时 resume；dispose 时全部监听移除并关闭 ctx。
 * DOM 访问经 `DomPort` 注入，headless 无 window/document 时自动退化为 no-op。
 */
import type { AudioContextLike, ContextFactory, DomPort } from './types.ts';

/** 手势事件（创建后即移除监听）。 */
const GESTURE_EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const;

/** 无 DOM 环境（node:test）下的空实现；生产自动使用真实 window/document。 */
const noopDom: DomPort = {
  addEventListener: () => {},
  removeEventListener: () => {},
  isHidden: () => false,
};

function defaultDom(): DomPort {
  if (typeof window === 'undefined' || typeof document === 'undefined') return noopDom;
  return {
    addEventListener(target, type, fn) {
      (target === 'window' ? window : document).addEventListener(type, fn);
    },
    removeEventListener(target, type, fn) {
      (target === 'window' ? window : document).removeEventListener(type, fn);
    },
    isHidden: () => document.hidden,
  };
}

/** 解锁句柄（供 AudioRuntime 组合根持有）。 */
export interface UnlockHandle {
  /** 当前上下文（未创建时 null）。 */
  readonly context: AudioContextLike | null;
  /** 仍挂着手势监听的数量（测试断言解锁后归零）。 */
  readonly gestureListenerCount: number;
  /** 懒取得 ctx；首次调用创建并 resume。 */
  ensure(): AudioContextLike;
  /** 手动触发一次手势解锁（真机由监听自动调用；headless 测试可直接调）。 */
  unlockFromGesture(): void;
  dispose(): void;
}

/** 依赖注入选项。 */
export interface UnlockOptions {
  readonly factory: ContextFactory;
  readonly dom?: DomPort;
}

/**
 * 创建解锁句柄；不在此刻创建 AudioContext。
 */
export function createContextUnlock(options: UnlockOptions): UnlockHandle {
  const dom = options.dom ?? defaultDom();
  let ctx: AudioContextLike | null = null;
  let gestureArmed = true;
  let activeGestureListeners = 0;
  let visibilityHandler: (() => void) | null = null;

  const removeGestureListeners = (): void => {
    if (!gestureArmed) return;
    for (const type of GESTURE_EVENTS) dom.removeEventListener('window', type, onGesture);
    gestureArmed = false;
    activeGestureListeners = 0;
  };

  const ensure = (): AudioContextLike => {
    if (ctx) return ctx;
    ctx = options.factory();
    // 首个手势内播放 1 帧静音 buffer，兼容旧 WebKit 首声锁（规格 §5.1 步骤 2）。
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = silent;
    source.connect(ctx.destination);
    source.start(0);
    source.stop(ctx.currentTime);
    return ctx;
  };

  function onGesture(): void {
    const context = ensure();
    void context.resume();
    removeGestureListeners();
  }

  for (const type of GESTURE_EVENTS) {
    dom.addEventListener('window', type, onGesture);
    activeGestureListeners += 1;
  }
  visibilityHandler = () => {
    if (!ctx) return;
    if (dom.isHidden?.()) void ctx.suspend();
    else void ctx.resume();
  };
  dom.addEventListener('document', 'visibilitychange', visibilityHandler);

  return {
    get context() { return ctx; },
    get gestureListenerCount() { return activeGestureListeners; },
    ensure,
    unlockFromGesture: onGesture,
    dispose(): void {
      removeGestureListeners();
      if (visibilityHandler) {
        dom.removeEventListener('document', 'visibilitychange', visibilityHandler);
        visibilityHandler = null;
      }
      if (ctx) {
        void ctx.close();
        ctx = null;
      }
    },
  };
}
