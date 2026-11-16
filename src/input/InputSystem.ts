/**
 * S2-G formal project — migrated from st2003/d-input — InputSystem facade. The ONLY object game logic consumes.
 * Merges adapter streams; buffers instant intents for one poll.
 */
import { KeyboardMouseAdapter } from './KeyboardMouseAdapter';
import { TouchAdapter } from './TouchAdapter';
import type { HeldAction, InputEvent, InputListener, InstantAction, MoveVector, SystemState } from './types';

export class InputSystem {
  private moveKbm: MoveVector = { x: 0, y: 0 };
  private moveTouch: MoveVector = { x: 0, y: 0 };
  private held = new Map<HeldAction, boolean>();
  private pending = new Set<InstantAction>();
  private system: SystemState = { suspended: false, pointerLockLost: false };
  private listeners: InputListener[] = [];
  private kbm = new KeyboardMouseAdapter();
  private touch = new TouchAdapter();
  /** DOM action buttons wired by bindActionButton — retained so dispose() can unbind them (R2). */
  private boundButtons: Array<{ el: HTMLElement; onDown: (e: Event) => void }> = [];

  attachKeyboardMouse(canvas: HTMLElement) {
    this.kbm.addListener({ onEvent: (ev: InputEvent) => this.route(ev) });
    this.kbm.attach(canvas);
  }

  attachTouch(zone: HTMLElement, ui?: Parameters<TouchAdapter['setUi']>[0]) {
    if (ui) this.touch.setUi(ui);
    this.touch.addListener({ onEvent: (ev: InputEvent) => this.route(ev) });
    this.touch.attach(zone);
  }

  /** wire DOM action buttons (mobile right zone); TASK-02: 现在也接受 weaponSwitch */
  bindActionButton(id: string, action: InstantAction) {
    const el = document.getElementById(id);
    if (!el) return;
    // One shared handler for touch + mouse preview; the reference is retained so
    // dispose() can remove it from both event types (previously anonymous → leak).
    const onDown = (e: Event) => {
      e.preventDefault();
      this.touch.buttonIntent(action);
    };
    el.addEventListener('touchstart', onDown, { passive: false });
    el.addEventListener('mousedown', onDown);
    this.boundButtons.push({ el, onDown });
  }

  private route(ev: InputEvent) {
    switch (ev.kind) {
      case 'move':
        if (ev.source === 'kbm') this.moveKbm = ev.vec;
        else this.moveTouch = ev.vec;
        break;
      case 'intent':
        this.pending.add(ev.action);
        break;
      case 'held':
        this.held.set(ev.action, ev.pressed);
        break;
      case 'suspend':
        // Only real focus/visibility transitions may change the suspended state.
        // touchcancel is an input-release (gesture interruption), never a resume.
        if (ev.reason === 'blur') this.system.suspended = true;
        else if (ev.reason === 'focus') this.system.suspended = false;
        else if (ev.reason === 'visibility') this.system.suspended = ev.suspended;
        break;
      case 'pointerLockLost':
        this.system.pointerLockLost = true;
        break;
    }
    for (const l of this.listeners) l.onEvent(ev);
  }

  /** subscribe to raw decoded events (logging/debug/HUD) */
  addListener(fn: (ev: InputEvent) => void) {
    this.listeners.push({ onEvent: fn });
  }

  getMove(): MoveVector {
    // touch joystick wins when active (non-zero); else keyboard
    if (this.moveTouch.x !== 0 || this.moveTouch.y !== 0) return this.moveTouch;
    return this.moveKbm;
  }

  consumeIntent(action: InstantAction): boolean {
    if (this.pending.has(action)) {
      this.pending.delete(action);
      return true;
    }
    return false;
  }

  isHeld(action: HeldAction): boolean {
    return this.held.get(action) ?? false;
  }

  getSystemState(): SystemState {
    return { ...this.system };
  }

  /** test hook: simulate blur/cancel reset (used by automated evidence) */
  forceSuspend() {
    this.system.suspended = true;
    this.moveKbm = { x: 0, y: 0 };
    this.moveTouch = { x: 0, y: 0 };
    this.held.clear();
  }

  dispose() {
    for (const { el, onDown } of this.boundButtons) {
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('mousedown', onDown);
    }
    this.boundButtons = [];
    this.kbm.dispose();
    this.touch.dispose();
    this.listeners = [];
  }
}
