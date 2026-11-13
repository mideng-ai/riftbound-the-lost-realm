/**
 * S2-G formal project — migrated from st2003/d-input — Keyboard + mouse adapter (desktop).
 * Decodes DOM events into InputEvents; owns NO game logic.
 */
import type { InputEvent, InputListener, MoveVector } from './types';

export class KeyboardMouseAdapter {
  private listeners: InputListener[] = [];
  private move: MoveVector = { x: 0, y: 0 };
  private readonly keys = new Set<string>();
  private attached = false;
  private target: HTMLElement | null = null;

  private emit(ev: InputEvent) {
    for (const l of this.listeners) l.onEvent(ev);
  }

  addListener(l: InputListener) {
    this.listeners.push(l);
  }

  attach(canvas: HTMLElement) {
    if (this.attached) return;
    this.attached = true;
    this.target = canvas;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // NOTE: pointer events, not mousedown — Babylon's canvas pointerdown
    // handler calls preventDefault(), which suppresses the synthetic mousedown
    // in Firefox; pointer events are delivered reliably regardless.
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('pointerlockchange', this.onPointerLock);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return; // OS auto-repeat must not re-fire intents
    this.keys.add(e.code);
    this.updateMove();

    // edge-triggered intents
    if (e.code === 'Space') {
      e.preventDefault();
      this.emit({ kind: 'intent', action: 'dash', source: 'kbm' });
    } else if (e.code === 'KeyQ') {
      this.emit({ kind: 'intent', action: 'skill1', source: 'kbm' });
    } else if (e.code === 'KeyE') {
      this.emit({ kind: 'intent', action: 'skill2', source: 'kbm' });
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.updateMove();
  };

  private updateMove() {
    const x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const y = (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0);
    this.move = { x, y };
    this.emit({ kind: 'move', vec: { ...this.move }, source: 'kbm' });
    // WASD also encodes a held attack? No — normal attack is mouse-held only.
    const held = this.mouseDown;
    this.emit({ kind: 'held', action: 'normalAttack', pressed: held, source: 'kbm' });
  }

  private mouseDown = false;

  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 0 && e.pointerType === 'mouse') {
      this.mouseDown = true;
      this.emit({ kind: 'intent', action: 'normalAttack', source: 'kbm' });
      this.emit({ kind: 'held', action: 'normalAttack', pressed: true, source: 'kbm' });
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.button === 0 && e.pointerType === 'mouse') {
      this.mouseDown = false;
      this.emit({ kind: 'held', action: 'normalAttack', pressed: false, source: 'kbm' });
    }
  };

  private onBlur = () => {
    // losing focus must not leave stuck keys/buttons
    this.keys.clear();
    this.mouseDown = false;
    this.move = { x: 0, y: 0 };
    this.emit({ kind: 'move', vec: { x: 0, y: 0 }, source: 'kbm' });
    this.emit({ kind: 'held', action: 'normalAttack', pressed: false, source: 'kbm' });
    this.emit({ kind: 'suspend', reason: 'blur', suspended: true });
  };

  private onFocus = () => {
    // only the real focus-recovery path may clear a blur suspension
    this.emit({ kind: 'suspend', reason: 'focus', suspended: false });
  };

  private onVisibility = () => {
    if (document.hidden) {
      this.keys.clear();
      this.mouseDown = false;
      this.move = { x: 0, y: 0 };
      this.emit({ kind: 'move', vec: { x: 0, y: 0 }, source: 'kbm' });
      this.emit({ kind: 'held', action: 'normalAttack', pressed: false, source: 'kbm' });
    }
    this.emit({ kind: 'suspend', reason: 'visibility', suspended: document.hidden });
  };

  private onPointerLock = () => {
    if (!document.pointerLockElement) {
      this.emit({ kind: 'pointerLockLost' });
    }
  };

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.target?.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('pointerlockchange', this.onPointerLock);
    this.attached = false;
    this.listeners = [];
  }
}
