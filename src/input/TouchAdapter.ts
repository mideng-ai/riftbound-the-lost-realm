/**
 * S2-G formal project — migrated from spikes/ST2-003-D-INPUT — Touch adapter (mobile).
 * Multi-touch zone policy (anti-cross-talk):
 *   - A touch is assigned a zone ONCE at touchstart and keeps it until
 *     touchend/touchcancel — dragging across zones never migrates it.
 *   - LEFT half  → movement zone: dynamic virtual joystick (origin = first
 *     contact point), one finger only; a second move-zone finger is ignored.
 *   - RIGHT half → action zone: only DOM buttons react; canvas touches here
 *     (not on a button) are ignored for gameplay purposes.
 *   - touchcancel (browser gesture/interruption) releases the joystick.
 */
import type { InputEvent, InputListener } from './types';

interface JoystickFinger {
  id: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

export class TouchAdapter {
  private listeners: InputListener[] = [];
  private moveFinger: JoystickFinger | null = null;
  private attached = false;
  private zone: HTMLElement | null = null;
  private ui: TouchUiHooks | null = null;

  /** Visual joystick callbacks (HUD rendering), optional. */
  setUi(hooks: TouchUiHooks) {
    this.ui = hooks;
  }

  addListener(l: InputListener) {
    this.listeners.push(l);
  }

  private emit(ev: InputEvent) {
    for (const l of this.listeners) l.onEvent(ev);
  }

  attach(zone: HTMLElement) {
    if (this.attached) return;
    this.attached = true;
    this.zone = zone;
    zone.addEventListener('touchstart', this.onTouchStart, { passive: false });
    zone.addEventListener('touchmove', this.onTouchMove, { passive: false });
    zone.addEventListener('touchend', this.onTouchEnd);
    zone.addEventListener('touchcancel', this.onTouchCancel);
  }

  private onTouchStart = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const half = t.clientX < window.innerWidth / 2 ? 'left' : 'right';
      if (half === 'left' && !this.moveFinger) {
        this.moveFinger = { id: t.identifier, originX: t.clientX, originY: t.clientY, x: t.clientX, y: t.clientY };
        this.ui?.onJoystickShow?.(t.clientX, t.clientY);
        this.emitMove(0, 0);
      }
      // right-half canvas touches: ignored (buttons are DOM elements above canvas)
    }
    e.preventDefault();
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.moveFinger) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.moveFinger.id) continue;
      this.moveFinger.x = t.clientX;
      this.moveFinger.y = t.clientY;
      const dx = this.moveFinger.x - this.moveFinger.originX;
      const dy = this.moveFinger.y - this.moveFinger.originY;
      const R = 48; // joystick radius in px
      const len = Math.hypot(dx, dy);
      const nx = len > 0 ? dx / Math.max(len, R) : 0;
      const ny = len > 0 ? dy / Math.max(len, R) : 0;
      const clamped = Math.min(1, len / R);
      const ux = len > 0 ? (dx / len) * clamped : 0;
      const uy = len > 0 ? (dy / len) * clamped : 0;
      void nx; void ny;
      this.ui?.onJoystickMove?.(dx, dy);
      this.emitMove(ux, uy);
    }
    e.preventDefault();
  };

  private onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (this.moveFinger && t.identifier === this.moveFinger.id) {
        this.moveFinger = null;
        this.ui?.onJoystickHide?.();
        this.emitMove(0, 0);
      }
    }
  };

  private onTouchCancel = (e: TouchEvent) => {
    let released = false;
    for (const t of Array.from(e.changedTouches)) {
      if (this.moveFinger && t.identifier === this.moveFinger.id) {
        this.moveFinger = null;
        released = true;
      }
    }
    if (released || this.moveFinger) {
      this.moveFinger = null;
      this.ui?.onJoystickHide?.();
      this.emitMove(0, 0);
      this.emit({ kind: 'suspend', reason: 'touchcancel', suspended: false });
    }
  };

  private emitMove(x: number, y: number) {
    this.emit({ kind: 'move', vec: { x, y }, source: 'touch' });
  }

  /** called by DOM action buttons (right zone) */
  buttonIntent(action: 'normalAttack' | 'skill1' | 'skill2' | 'dash') {
    this.emit({ kind: 'intent', action, source: 'touch' });
    if (action === 'normalAttack') {
      // mobile normal attack is auto-triggered per design; button also acts as hold
      this.emit({ kind: 'held', action: 'normalAttack', pressed: true, source: 'touch' });
      setTimeout(() => this.emit({ kind: 'held', action: 'normalAttack', pressed: false, source: 'touch' }), 120);
    }
  }

  dispose() {
    this.zone?.removeEventListener('touchstart', this.onTouchStart);
    this.zone?.removeEventListener('touchmove', this.onTouchMove);
    this.zone?.removeEventListener('touchend', this.onTouchEnd);
    this.zone?.removeEventListener('touchcancel', this.onTouchCancel);
    this.attached = false;
    this.listeners = [];
  }
}

export interface TouchUiHooks {
  onJoystickShow?(x: number, y: number): void;
  onJoystickMove?(dx: number, dy: number): void;
  onJoystickHide?(): void;
}
