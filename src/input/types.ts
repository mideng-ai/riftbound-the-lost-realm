/**
 * S2-G formal project — migrated from st2003/d-input — Unified typed input contract.
 * Game logic consumes ONLY this interface — never DOM keyboard/mouse/touch events.
 */

/** Continuous movement intent, normalized to [-1, 1] per axis. */
export interface MoveVector {
  x: number;
  y: number;
}

/** Instantaneous (edge-triggered) action intents, consumed once per fire. */
export type InstantAction = 'normalAttack' | 'skill1' | 'skill2' | 'dash';

/** Actions that can be held (continuous state). */
export type HeldAction = 'normalAttack';

/** System-level state the game must react to (pause / focus policy). */
export interface SystemState {
  /**
   * window lost focus or page hidden — gameplay should pause/idle inputs.
   * Only `blur` (→true), `focus` (→false) and `visibility` (→document.hidden)
   * may change this; `touchcancel` never does.
   */
  suspended: boolean;
  /** pointer lock lost while it was expected (desktop aim modes) */
  pointerLockLost: boolean;
}

/** A single decoded input event the adapters push into the system. */
export type InputEvent =
  | { kind: 'move'; vec: MoveVector; source: 'kbm' | 'touch' }
  | { kind: 'intent'; action: InstantAction; source: 'kbm' | 'touch' }
  | { kind: 'held'; action: HeldAction; pressed: boolean; source: 'kbm' | 'touch' }
  /**
   * System-level transitions:
   * - `blur` (suspended=true) / `focus` (suspended=false): window focus lost/regained
   * - `visibility` (suspended=document.hidden): page hidden/shown
   * - `touchcancel`: gesture interruption — releases input only, MUST NOT change suspension
   */
  | { kind: 'suspend'; reason: 'blur' | 'focus' | 'visibility' | 'touchcancel'; suspended: boolean }
  | { kind: 'pointerLockLost' };

export interface InputListener {
  onEvent(ev: InputEvent): void;
}

/** The one interface game logic consumes. */
export interface InputSystemFacade {
  /** current movement vector (merged, last-writer-wins per source) */
  getMove(): MoveVector;
  /** poll an instantaneous intent; returns true once per fire */
  consumeIntent(action: InstantAction): boolean;
  /** is a holdable action currently held */
  isHeld(action: HeldAction): boolean;
  /** current system/suspension state */
  getSystemState(): SystemState;
  /** subscribe to raw decoded events (logging/debug/HUD) */
  addListener(l: InputListener): void;
  /** release all listeners/DOM hooks */
  dispose(): void;
}
