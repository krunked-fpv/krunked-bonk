import type { GamePhase, UiNavAction } from '../contracts';

export interface KeyboardMousePollResult {
  moveX: number;
  moveZ: number;
  lookDeltaYaw: number;
  lookDeltaPitch: number;
  jump: boolean;
  jumpPressed: boolean;
  crouchSlide: boolean;
  fireHeld: boolean;
  interactPressed: boolean;
  cameraTogglePressed: boolean;
  pausePressed: boolean;
  mapTogglePressed: boolean;
  draftChoiceIndex: number | null;
  rerollPressed: boolean;
  banishPressed: boolean;
  skipPressed: boolean;
  activeSkillPressed: boolean;
  uiActions: UiNavAction[];
  hasActivity: boolean;
}

const DRAFT_PHASES: ReadonlySet<GamePhase> = new Set([
  'level_up',
  'chest_open',
  'merchant',
  'microwave',
]);

const BASE_MOUSE_RAD_PER_PX = 0.0022;
const MAX_MOUSE_DELTA_PX = 250;
const TOUCH_MOUSE_GUARD_MS = 650;

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return type === 'text' || type === 'search' || type === 'email' || type === 'password' || type === 'url';
  }
  return target.isContentEditable;
}

function isTouchEmulatedMouseEvent(ev: MouseEvent): boolean {
  const withCap = ev as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } };
  return Boolean(withCap.sourceCapabilities?.firesTouchEvents);
}

export class KeyboardMouseDriver {
  private target: HTMLElement | null = null;
  private attached = false;

  private readonly keysDown = new Set<string>();
  private sensitivity = 1.0;
  private invertY = false;
  private pointerLockAllowed = true;
  private currentPhase: GamePhase = 'boot';

  private lookDeltaX = 0;
  private lookDeltaY = 0;

  private lmbHeld = false;
  private rmbHeld = false;

  private jumpPressed = false;
  private interactPressed = false;
  private cameraTogglePressed = false;
  private pausePressed = false;
  private mapTogglePressed = false;
  private draftChoiceIndex: number | null = null;
  private rerollPressed = false;
  private banishPressed = false;
  private skipPressed = false;
  private activeSkillPressed = false;

  private uiActions: UiNavAction[] = [];
  private activitySincePoll = false;
  private lastTouchTimestampMs = -Infinity;

  private onActivityCallback: (() => void) | null = null;

  public setOnActivity(cb: (() => void) | null): void {
    this.onActivityCallback = cb;
  }

  public notifyRealTouchTimestamp(nowMs: number): void {
    this.lastTouchTimestampMs = nowMs;
  }

  public setMouseSettings(sensitivity: number, invertY: boolean): void {
    this.sensitivity = Number.isFinite(sensitivity) ? Math.max(0.05, Math.min(5.0, sensitivity)) : 1.0;
    this.invertY = Boolean(invertY);
  }

  public setPointerLockAllowed(allowed: boolean): void {
    this.pointerLockAllowed = Boolean(allowed);
    if (!this.pointerLockAllowed && this.isPointerLocked()) {
      this.exitPointerLock();
    }
  }

  public requestPointerLock(): void {
    if (!this.pointerLockAllowed || !this.target) return;
    if (typeof document === 'undefined') return;
    if (this.isPointerLocked()) return;
    const req = this.target.requestPointerLock as (() => Promise<void> | void) | undefined;
    if (typeof req === 'function') {
      try {
        const result = req.call(this.target);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(() => {
            // Pointer lock may be rejected outside direct user gestures
          });
        }
      } catch {
        // Gracefully ignore in environments without pointer lock support
      }
    }
  }

  public exitPointerLock(): void {
    if (typeof document === 'undefined') return;
    if (document.pointerLockElement && typeof document.exitPointerLock === 'function') {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore
      }
    }
  }

  public isPointerLocked(): boolean {
    if (typeof document === 'undefined' || !this.target) return false;
    return document.pointerLockElement === this.target;
  }

  public attach(target: HTMLElement | null): void {
    if (this.attached) {
      this.detach();
    }
    this.target = target;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    this.attached = true;
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointermove', this.handlePointerMove);
    if (this.target) {
      this.target.addEventListener('mousedown', this.handleTargetMouseDown);
      this.target.addEventListener('contextmenu', this.handleContextMenu);
    }
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('blur', this.handleBlur);
      document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
      document.removeEventListener('mousemove', this.handleMouseMove);
      window.removeEventListener('pointerdown', this.handlePointerDown);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointermove', this.handlePointerMove);
    }
    if (this.target) {
      this.target.removeEventListener('mousedown', this.handleTargetMouseDown);
      this.target.removeEventListener('contextmenu', this.handleContextMenu);
    }
    this.exitPointerLock();
    this.clearHeldState();
    this.target = null;
  }

  public poll(_dtSec: number, phase: GamePhase): KeyboardMousePollResult {
    this.currentPhase = phase;

    let moveX = 0;
    let moveZ = 0;
    if (phase === 'playing') {
      if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) moveX += 1;
      if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) moveX -= 1;
      if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) moveZ += 1;
      if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) moveZ -= 1;

      const mag = Math.hypot(moveX, moveZ);
      if (mag > 1) {
        moveX /= mag;
        moveZ /= mag;
      }
    }

    const scale = BASE_MOUSE_RAD_PER_PX * this.sensitivity;
    const lookDeltaYaw = phase === 'playing' ? (-this.lookDeltaX * scale) || 0 : 0;
    const lookDeltaPitch =
      phase === 'playing' ? ((this.invertY ? this.lookDeltaY : -this.lookDeltaY) * scale) || 0 : 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;

    const jump = phase === 'playing' && this.keysDown.has('Space');
    const crouchSlide =
      phase === 'playing' &&
      (this.keysDown.has('ShiftLeft') ||
        this.keysDown.has('ShiftRight') ||
        this.keysDown.has('ControlLeft') ||
        this.keysDown.has('ControlRight') ||
        this.keysDown.has('KeyC'));
    const fireHeld = phase === 'playing' && this.lmbHeld;

    const result: KeyboardMousePollResult = {
      moveX,
      moveZ,
      lookDeltaYaw,
      lookDeltaPitch,
      jump,
      jumpPressed: phase === 'playing' ? this.jumpPressed : false,
      crouchSlide,
      fireHeld,
      interactPressed: phase === 'playing' ? this.interactPressed : false,
      cameraTogglePressed: phase === 'playing' ? this.cameraTogglePressed : false,
      pausePressed: this.pausePressed,
      mapTogglePressed: phase === 'playing' ? this.mapTogglePressed : false,
      draftChoiceIndex: this.draftChoiceIndex,
      rerollPressed: this.rerollPressed,
      banishPressed: this.banishPressed,
      skipPressed: this.skipPressed,
      activeSkillPressed: phase === 'playing' ? this.activeSkillPressed : false,
      uiActions: this.uiActions,
      hasActivity: this.activitySincePoll,
    };

    // Reset edge-triggered buffers
    this.jumpPressed = false;
    this.interactPressed = false;
    this.cameraTogglePressed = false;
    this.pausePressed = false;
    this.mapTogglePressed = false;
    this.draftChoiceIndex = null;
    this.rerollPressed = false;
    this.banishPressed = false;
    this.skipPressed = false;
    this.activeSkillPressed = false;
    this.uiActions = [];
    this.activitySincePoll = false;

    return result;
  }

  private clearHeldState(): void {
    this.keysDown.clear();
    this.lmbHeld = false;
    this.rmbHeld = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
  }

  private markActivity(): void {
    this.activitySincePoll = true;
    this.onActivityCallback?.();
  }

  private isWithinTouchGuard(): boolean {
    return performance.now() - this.lastTouchTimestampMs < TOUCH_MOUSE_GUARD_MS;
  }

  private readonly handleBlur = (): void => {
    this.clearHeldState();
  };

  private readonly handlePointerLockChange = (): void => {
    if (!this.isPointerLocked()) {
      this.lmbHeld = false;
      this.rmbHeld = false;
    }
  };

  private readonly handleContextMenu = (ev: MouseEvent): void => {
    if (this.currentPhase === 'playing') {
      ev.preventDefault();
    }
  };

  private readonly handleTargetMouseDown = (ev: MouseEvent): void => {
    if (isTouchEmulatedMouseEvent(ev) || this.isWithinTouchGuard()) return;
    if (this.currentPhase === 'playing' && ev.button === 0 && this.pointerLockAllowed && !this.isPointerLocked()) {
      this.requestPointerLock();
    }
  };

  private readonly handlePointerDown = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    if (this.isWithinTouchGuard()) return;
    if (ev.target instanceof Element && ev.target.closest('[data-kb-touch-overlay="true"]')) return;

    this.markActivity();
    if (ev.button === 0) {
      this.lmbHeld = true;
    } else if (ev.button === 2) {
      this.rmbHeld = true;
    }
  };

  private readonly handlePointerUp = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    if (ev.button === 0) {
      this.lmbHeld = false;
    } else if (ev.button === 2) {
      this.rmbHeld = false;
    }
  };

  private readonly handlePointerMove = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    if (this.isWithinTouchGuard()) return;
    if (ev.target instanceof Element && ev.target.closest('[data-kb-touch-overlay="true"]')) return;
    if (Math.abs(ev.movementX) > 2 || Math.abs(ev.movementY) > 2) {
      this.markActivity();
    }
  };

  private readonly handleMouseMove = (ev: MouseEvent): void => {
    if (isTouchEmulatedMouseEvent(ev) || this.isWithinTouchGuard()) return;
    if (this.currentPhase !== 'playing') return;

    const canLook = this.isPointerLocked() || this.rmbHeld;
    if (!canLook) return;

    const dx = Math.max(-MAX_MOUSE_DELTA_PX, Math.min(MAX_MOUSE_DELTA_PX, ev.movementX || 0));
    const dy = Math.max(-MAX_MOUSE_DELTA_PX, Math.min(MAX_MOUSE_DELTA_PX, ev.movementY || 0));
    if (dx !== 0 || dy !== 0) {
      this.lookDeltaX += dx;
      this.lookDeltaY += dy;
      this.markActivity();
    }
  };

  private readonly handleKeyDown = (ev: KeyboardEvent): void => {
    if (isEditableElement(ev.target)) return;

    const code = ev.code;
    const isRepeat = ev.repeat || this.keysDown.has(code);
    this.keysDown.add(code);
    this.markActivity();

    if (this.currentPhase === 'playing') {
      if (
        code === 'Space' ||
        code === 'Tab' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'F5'
      ) {
        ev.preventDefault();
      }

      if (!isRepeat) {
        if (code === 'Space') this.jumpPressed = true;
        else if (code === 'KeyE') this.interactPressed = true;
        else if (code === 'KeyV' || code === 'Tab' || code === 'F5') this.cameraTogglePressed = true;
        else if (code === 'KeyM') this.mapTogglePressed = true;
        else if (code === 'Escape') this.pausePressed = true;
        else if (code === 'KeyQ' || code === 'KeyF') this.activeSkillPressed = true;
        else if (code === 'Digit1') this.draftChoiceIndex = 0;
        else if (code === 'Digit2') this.draftChoiceIndex = 1;
        else if (code === 'Digit3') this.draftChoiceIndex = 2;
      }
      return;
    }

    // Menu & modal navigation
    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space' ||
      code === 'Tab'
    ) {
      ev.preventDefault();
    }

    // Directional keys allow keyboard auto-repeat for smooth scrolling/slider scrubbing
    if (code === 'ArrowUp' || code === 'KeyW') {
      this.uiActions.push('up');
      return;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      this.uiActions.push('down');
      return;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') {
      this.uiActions.push('left');
      return;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      this.uiActions.push('right');
      return;
    }

    if (isRepeat) return;

    if (code === 'Enter' || code === 'Space') {
      this.uiActions.push('confirm');
    } else if (code === 'Escape' || code === 'Backspace') {
      this.uiActions.push('cancel');
    } else if (code === 'BracketLeft' || code === 'KeyQ') {
      this.uiActions.push('tab_prev');
    } else if (code === 'BracketRight' || code === 'KeyE') {
      this.uiActions.push('tab_next');
    } else if (DRAFT_PHASES.has(this.currentPhase)) {
      if (code === 'Digit1') this.draftChoiceIndex = 0;
      else if (code === 'Digit2') this.draftChoiceIndex = 1;
      else if (code === 'Digit3') this.draftChoiceIndex = 2;
      else if (code === 'KeyR') {
        this.rerollPressed = true;
        this.uiActions.push('reroll');
      } else if (code === 'KeyB') {
        this.banishPressed = true;
        this.uiActions.push('banish');
      } else if (code === 'KeyX') {
        this.skipPressed = true;
        this.uiActions.push('skip');
      }
    }
  };

  private readonly handleKeyUp = (ev: KeyboardEvent): void => {
    this.keysDown.delete(ev.code);
  };
}
