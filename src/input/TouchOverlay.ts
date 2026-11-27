import type { GamePhase } from '../contracts';

export interface TouchInputSnapshot {
  moveX: number;
  moveZ: number;
  lookDeltaYaw: number;
  lookDeltaPitch: number;
  jump: boolean;
  jumpPressed: boolean;
  crouchSlide: boolean;
  fireHeld: boolean;
  interactPressed: boolean;
  mapTogglePressed: boolean;
  pausePressed: boolean;
  active: boolean;
}

const STICK_MAX_RADIUS_PX = 52;
const STICK_DEADZONE = 0.12;
const TOUCH_LOOK_RAD_PER_PX = 0.0046;

export class TouchOverlay {
  private host: HTMLElement | null = null;
  private root: HTMLDivElement | null = null;
  private stickZone: HTMLDivElement | null = null;
  private stickBase: HTMLDivElement | null = null;
  private stickKnob: HTMLDivElement | null = null;
  private lookZone: HTMLDivElement | null = null;
  private jumpBtn: HTMLButtonElement | null = null;
  private slideBtn: HTMLButtonElement | null = null;
  private interactBtn: HTMLButtonElement | null = null;
  private interactLabelEl: HTMLSpanElement | null = null;
  private fireBtn: HTMLButtonElement | null = null;
  private mapBtn: HTMLButtonElement | null = null;
  private pauseBtn: HTMLButtonElement | null = null;

  private touchActive = false;
  private phase: GamePhase = 'playing';
  private interactPrompt: string | null = null;
  private lookSensitivity = 1.0;
  private invertY = false;

  // Multi-touch pointer tracking
  private stickPointerId: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private moveX = 0;
  private moveZ = 0;

  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private lookDeltaX = 0;
  private lookDeltaY = 0;

  private jumpPointers = new Set<number>();
  private slidePointers = new Set<number>();
  private firePointers = new Set<number>();
  private fireDragPointerId: number | null = null;
  private fireLastX = 0;
  private fireLastY = 0;

  private jumpPressed = false;
  private interactPressed = false;
  private mapTogglePressed = false;
  private pausePressed = false;

  private onTouchActivatedCallback: ((nowMs: number) => void) | null = null;
  private attached = false;

  public constructor(host?: HTMLElement | null) {
    if (host) {
      this.mount(host);
    }
  }

  public setOnTouchActivated(cb: ((nowMs: number) => void) | null): void {
    this.onTouchActivatedCallback = cb;
  }

  public setLookSettings(sensitivity: number, invertY: boolean): void {
    this.lookSensitivity = Number.isFinite(sensitivity) ? Math.max(0.1, Math.min(5.0, sensitivity)) : 1.0;
    this.invertY = Boolean(invertY);
  }

  public mount(host: HTMLElement): void {
    if (this.attached && this.host === host) return;
    if (this.attached) this.dispose();
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    this.host = host;
    this.attached = true;

    const root = document.createElement('div');
    root.className = 'kb-touch-overlay';
    root.setAttribute('data-kb-touch-overlay', 'true');
    root.setAttribute('aria-hidden', 'true');
    // Strictly hidden and click-through until real touch event or setSimulatedTouch(true)
    root.style.display = 'none';
    root.style.pointerEvents = 'none';

    // Left virtual analog stick zone
    const stickZone = document.createElement('div');
    stickZone.className = 'kb-touch-stick-zone';
    const stickBase = document.createElement('div');
    stickBase.className = 'kb-touch-control kb-touch-stick-base';
    const stickKnob = document.createElement('div');
    stickKnob.className = 'kb-touch-stick-knob';
    stickBase.appendChild(stickKnob);
    stickZone.appendChild(stickBase);

    // Right drag-look zone
    const lookZone = document.createElement('div');
    lookZone.className = 'kb-touch-look-zone';

    // Top-right compact pills
    const topPills = document.createElement('div');
    topPills.className = 'kb-touch-top-pills';

    const mapBtn = document.createElement('button');
    mapBtn.type = 'button';
    mapBtn.className = 'kb-touch-control kb-touch-pill';
    mapBtn.textContent = 'MAP';
    mapBtn.setAttribute('data-kb-touch-btn', 'map');

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'kb-touch-control kb-touch-pill';
    pauseBtn.textContent = 'PAUSE';
    pauseBtn.setAttribute('data-kb-touch-btn', 'pause');

    topPills.append(mapBtn, pauseBtn);

    // Bottom-right translucent action cluster
    const actions = document.createElement('div');
    actions.className = 'kb-touch-actions';

    const interactBtn = document.createElement('button');
    interactBtn.type = 'button';
    interactBtn.className = 'kb-touch-control kb-touch-btn kb-touch-btn--interact';
    interactBtn.setAttribute('data-kb-touch-btn', 'interact');
    const interactLabelEl = document.createElement('span');
    interactLabelEl.className = 'kb-touch-btn-label';
    interactLabelEl.textContent = 'USE';
    interactBtn.appendChild(interactLabelEl);

    const fireBtn = document.createElement('button');
    fireBtn.type = 'button';
    fireBtn.className = 'kb-touch-control kb-touch-btn kb-touch-btn--fire';
    fireBtn.textContent = 'AIM/FIRE';
    fireBtn.setAttribute('data-kb-touch-btn', 'fire');

    const slideBtn = document.createElement('button');
    slideBtn.type = 'button';
    slideBtn.className = 'kb-touch-control kb-touch-btn kb-touch-btn--slide';
    slideBtn.textContent = 'SLIDE';
    slideBtn.setAttribute('data-kb-touch-btn', 'slide');

    const jumpBtn = document.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.className = 'kb-touch-control kb-touch-btn kb-touch-btn--jump';
    jumpBtn.textContent = 'JUMP';
    jumpBtn.setAttribute('data-kb-touch-btn', 'jump');

    actions.append(interactBtn, fireBtn, slideBtn, jumpBtn);

    root.append(stickZone, lookZone, topPills, actions);
    host.appendChild(root);

    this.root = root;
    this.stickZone = stickZone;
    this.stickBase = stickBase;
    this.stickKnob = stickKnob;
    this.lookZone = lookZone;
    this.jumpBtn = jumpBtn;
    this.slideBtn = slideBtn;
    this.interactBtn = interactBtn;
    this.interactLabelEl = interactLabelEl;
    this.fireBtn = fireBtn;
    this.mapBtn = mapBtn;
    this.pauseBtn = pauseBtn;

    // Global real-touch activation detectors
    window.addEventListener('touchstart', this.handleWindowTouchStart, { passive: true });
    window.addEventListener('pointerdown', this.handleWindowPointerDown, { passive: true });
    window.addEventListener('blur', this.handleWindowBlur);

    // Control multi-touch handlers
    stickZone.addEventListener('pointerdown', this.handleStickDown);
    stickZone.addEventListener('pointermove', this.handleStickMove);
    stickZone.addEventListener('pointerup', this.handleStickUp);
    stickZone.addEventListener('pointercancel', this.handleStickUp);

    lookZone.addEventListener('pointerdown', this.handleLookDown);
    lookZone.addEventListener('pointermove', this.handleLookMove);
    lookZone.addEventListener('pointerup', this.handleLookUp);
    lookZone.addEventListener('pointercancel', this.handleLookUp);

    jumpBtn.addEventListener('pointerdown', this.handleJumpDown);
    jumpBtn.addEventListener('pointerup', this.handleJumpUp);
    jumpBtn.addEventListener('pointercancel', this.handleJumpUp);

    slideBtn.addEventListener('pointerdown', this.handleSlideDown);
    slideBtn.addEventListener('pointerup', this.handleSlideUp);
    slideBtn.addEventListener('pointercancel', this.handleSlideUp);

    fireBtn.addEventListener('pointerdown', this.handleFireDown);
    fireBtn.addEventListener('pointermove', this.handleFireMove);
    fireBtn.addEventListener('pointerup', this.handleFireUp);
    fireBtn.addEventListener('pointercancel', this.handleFireUp);

    interactBtn.addEventListener('pointerdown', this.handleInteractDown);
    interactBtn.addEventListener('pointerup', this.handleTapUp);
    interactBtn.addEventListener('pointercancel', this.handleTapUp);

    mapBtn.addEventListener('pointerdown', this.handleMapDown);
    mapBtn.addEventListener('pointerup', this.handleTapUp);
    mapBtn.addEventListener('pointercancel', this.handleTapUp);

    pauseBtn.addEventListener('pointerdown', this.handlePauseDown);
    pauseBtn.addEventListener('pointerup', this.handleTapUp);
    pauseBtn.addEventListener('pointercancel', this.handleTapUp);

    this.syncDomVisibility();
    this.syncInteractButton();
  }

  public isVisible(): boolean {
    return this.touchActive;
  }

  public setSimulatedTouch(active: boolean): void {
    const next = Boolean(active);
    if (this.touchActive === next) {
      this.syncDomVisibility();
      return;
    }
    this.touchActive = next;
    if (!next) {
      this.releaseAllTouches();
    }
    this.syncDomVisibility();
  }

  public setInteractPrompt(label: string | null): void {
    const normalized = label && label.trim().length > 0 ? label.trim() : null;
    if (this.interactPrompt === normalized) return;
    this.interactPrompt = normalized;
    this.syncInteractButton();
  }

  public setPhase(phase: GamePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    if (phase !== 'playing') {
      this.releaseAllTouches();
    }
    this.syncDomVisibility();
  }

  public hideOnNonTouchInput(): void {
    if (!this.touchActive) return;
    this.touchActive = false;
    this.releaseAllTouches();
    this.syncDomVisibility();
  }

  public pollTouchInput(): TouchInputSnapshot {
    const scale = TOUCH_LOOK_RAD_PER_PX * this.lookSensitivity;
    const isPlaying = this.touchActive && this.phase === 'playing';

    const snapshot: TouchInputSnapshot = {
      moveX: isPlaying ? this.moveX || 0 : 0,
      moveZ: isPlaying ? this.moveZ || 0 : 0,
      lookDeltaYaw: isPlaying ? (-this.lookDeltaX * scale) || 0 : 0,
      lookDeltaPitch: isPlaying ? ((this.invertY ? this.lookDeltaY : -this.lookDeltaY) * scale) || 0 : 0,
      jump: isPlaying && this.jumpPointers.size > 0,
      jumpPressed: isPlaying && this.jumpPressed,
      crouchSlide: isPlaying && this.slidePointers.size > 0,
      fireHeld: isPlaying && this.firePointers.size > 0,
      interactPressed: isPlaying && this.interactPressed,
      mapTogglePressed: isPlaying && this.mapTogglePressed,
      pausePressed: this.touchActive && this.pausePressed,
      active: this.touchActive,
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.jumpPressed = false;
    this.interactPressed = false;
    this.mapTogglePressed = false;
    this.pausePressed = false;

    return snapshot;
  }

  public dispose(): void {
    if (!this.attached) return;
    this.attached = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('touchstart', this.handleWindowTouchStart);
      window.removeEventListener('pointerdown', this.handleWindowPointerDown);
      window.removeEventListener('blur', this.handleWindowBlur);
    }

    this.stickZone?.removeEventListener('pointerdown', this.handleStickDown);
    this.stickZone?.removeEventListener('pointermove', this.handleStickMove);
    this.stickZone?.removeEventListener('pointerup', this.handleStickUp);
    this.stickZone?.removeEventListener('pointercancel', this.handleStickUp);

    this.lookZone?.removeEventListener('pointerdown', this.handleLookDown);
    this.lookZone?.removeEventListener('pointermove', this.handleLookMove);
    this.lookZone?.removeEventListener('pointerup', this.handleLookUp);
    this.lookZone?.removeEventListener('pointercancel', this.handleLookUp);

    this.jumpBtn?.removeEventListener('pointerdown', this.handleJumpDown);
    this.jumpBtn?.removeEventListener('pointerup', this.handleJumpUp);
    this.jumpBtn?.removeEventListener('pointercancel', this.handleJumpUp);

    this.slideBtn?.removeEventListener('pointerdown', this.handleSlideDown);
    this.slideBtn?.removeEventListener('pointerup', this.handleSlideUp);
    this.slideBtn?.removeEventListener('pointercancel', this.handleSlideUp);

    this.fireBtn?.removeEventListener('pointerdown', this.handleFireDown);
    this.fireBtn?.removeEventListener('pointermove', this.handleFireMove);
    this.fireBtn?.removeEventListener('pointerup', this.handleFireUp);
    this.fireBtn?.removeEventListener('pointercancel', this.handleFireUp);

    this.interactBtn?.removeEventListener('pointerdown', this.handleInteractDown);
    this.interactBtn?.removeEventListener('pointerup', this.handleTapUp);
    this.interactBtn?.removeEventListener('pointercancel', this.handleTapUp);

    this.mapBtn?.removeEventListener('pointerdown', this.handleMapDown);
    this.mapBtn?.removeEventListener('pointerup', this.handleTapUp);
    this.mapBtn?.removeEventListener('pointercancel', this.handleTapUp);

    this.pauseBtn?.removeEventListener('pointerdown', this.handlePauseDown);
    this.pauseBtn?.removeEventListener('pointerup', this.handleTapUp);
    this.pauseBtn?.removeEventListener('pointercancel', this.handleTapUp);

    this.root?.remove();
    this.root = null;
    this.stickZone = null;
    this.stickBase = null;
    this.stickKnob = null;
    this.lookZone = null;
    this.jumpBtn = null;
    this.slideBtn = null;
    this.interactBtn = null;
    this.interactLabelEl = null;
    this.fireBtn = null;
    this.mapBtn = null;
    this.pauseBtn = null;
    this.host = null;
    this.touchActive = false;
    this.releaseAllTouches();
  }

  private activateFromRealTouch(): void {
    const now = performance.now();
    this.onTouchActivatedCallback?.(now);
    if (!this.touchActive) {
      this.touchActive = true;
      this.syncDomVisibility();
    }
  }

  private syncDomVisibility(): void {
    if (!this.root) return;
    if (!this.touchActive) {
      this.root.classList.remove('is-active', 'is-gameplay');
      this.root.style.display = 'none';
      this.root.style.pointerEvents = 'none';
      this.root.setAttribute('aria-hidden', 'true');
      return;
    }

    this.root.classList.add('is-active');
    this.root.classList.toggle('is-gameplay', this.phase === 'playing');
    this.root.style.display = 'block';
    this.root.style.pointerEvents = 'none';
    this.root.setAttribute('aria-hidden', this.phase === 'playing' ? 'false' : 'true');
  }

  private syncInteractButton(): void {
    if (!this.interactBtn || !this.interactLabelEl) return;
    if (this.interactPrompt) {
      this.interactBtn.classList.add('has-prompt');
      this.interactLabelEl.textContent = this.interactPrompt.length > 14
        ? `${this.interactPrompt.slice(0, 12)}..`
        : this.interactPrompt;
    } else {
      this.interactBtn.classList.remove('has-prompt');
      this.interactLabelEl.textContent = 'USE';
    }
  }

  private releaseAllTouches(): void {
    this.stickPointerId = null;
    this.moveX = 0;
    this.moveZ = 0;
    this.resetStickVisual();

    this.lookPointerId = null;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;

    this.jumpPointers.clear();
    this.slidePointers.clear();
    this.firePointers.clear();
    this.fireDragPointerId = null;

    this.jumpBtn?.classList.remove('is-pressed');
    this.slideBtn?.classList.remove('is-pressed');
    this.fireBtn?.classList.remove('is-pressed');
    this.interactBtn?.classList.remove('is-pressed');
    this.mapBtn?.classList.remove('is-pressed');
    this.pauseBtn?.classList.remove('is-pressed');
  }

  private resetStickVisual(): void {
    if (this.stickBase) {
      this.stickBase.classList.remove('is-pressed');
      this.stickBase.style.left = '';
      this.stickBase.style.top = '';
    }
    if (this.stickKnob) {
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
    }
  }

  private updateStickFromPoint(clientX: number, clientY: number): void {
    const dx = clientX - this.stickOriginX;
    const dy = clientY - this.stickOriginY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, STICK_MAX_RADIUS_PX);
    const angle = Math.atan2(dy, dx);
    const knobX = dist > 0 ? Math.cos(angle) * clampedDist : 0;
    const knobY = dist > 0 ? Math.sin(angle) * clampedDist : 0;

    if (this.stickKnob) {
      this.stickKnob.style.transform = `translate(calc(-50% + ${knobX.toFixed(1)}px), calc(-50% + ${knobY.toFixed(1)}px))`;
    }

    const normMag = clampedDist / STICK_MAX_RADIUS_PX;
    if (normMag <= STICK_DEADZONE) {
      this.moveX = 0;
      this.moveZ = 0;
      return;
    }

    const rescaled = Math.min(1, (normMag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
    this.moveX = Math.cos(angle) * rescaled;
    // Screen Y down -> negative moveZ; dragging up -> +1 forward
    this.moveZ = -Math.sin(angle) * rescaled;
  }

  private isControlEventAllowed(ev: PointerEvent): boolean {
    if (!this.touchActive || this.phase !== 'playing') return false;
    return ev.pointerType === 'touch' || this.touchActive;
  }

  private readonly handleWindowTouchStart = (): void => {
    this.activateFromRealTouch();
  };

  private readonly handleWindowPointerDown = (ev: PointerEvent): void => {
    if (ev.pointerType === 'touch') {
      this.activateFromRealTouch();
    }
  };

  private readonly handleWindowBlur = (): void => {
    this.releaseAllTouches();
  };

  private readonly handleStickDown = (ev: PointerEvent): void => {
    if (!this.isControlEventAllowed(ev) || this.stickPointerId !== null) return;
    ev.preventDefault();
    this.stickPointerId = ev.pointerId;
    this.stickZone?.setPointerCapture?.(ev.pointerId);

    const rect = this.stickZone?.getBoundingClientRect();
    if (rect && this.stickBase) {
      const pad = STICK_MAX_RADIUS_PX + 10;
      const localX = Math.max(pad, Math.min(rect.width - pad, ev.clientX - rect.left));
      const localY = Math.max(pad, Math.min(rect.height - pad, ev.clientY - rect.top));
      this.stickOriginX = rect.left + localX;
      this.stickOriginY = rect.top + localY;
      this.stickBase.style.left = `${localX}px`;
      this.stickBase.style.top = `${localY}px`;
      this.stickBase.classList.add('is-pressed');
    } else {
      this.stickOriginX = ev.clientX;
      this.stickOriginY = ev.clientY;
    }

    this.updateStickFromPoint(ev.clientX, ev.clientY);
  };

  private readonly handleStickMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.stickPointerId) return;
    ev.preventDefault();
    this.updateStickFromPoint(ev.clientX, ev.clientY);
  };

  private readonly handleStickUp = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.stickPointerId) return;
    this.stickPointerId = null;
    this.moveX = 0;
    this.moveZ = 0;
    this.resetStickVisual();
  };

  private readonly handleLookDown = (ev: PointerEvent): void => {
    if (!this.isControlEventAllowed(ev) || this.lookPointerId !== null) return;
    ev.preventDefault();
    this.lookPointerId = ev.pointerId;
    this.lookLastX = ev.clientX;
    this.lookLastY = ev.clientY;
    this.lookZone?.setPointerCapture?.(ev.pointerId);
  };

  private readonly handleLookMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.lookPointerId) return;
    ev.preventDefault();
    this.lookDeltaX += ev.clientX - this.lookLastX;
    this.lookDeltaY += ev.clientY - this.lookLastY;
    this.lookLastX = ev.clientX;
    this.lookLastY = ev.clientY;
  };

  private readonly handleLookUp = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.lookPointerId) return;
    this.lookPointerId = null;
  };

  private readonly handleJumpDown = (ev: PointerEvent): void => {
    if (!this.isControlEventAllowed(ev)) return;
    ev.preventDefault();
    this.jumpPointers.add(ev.pointerId);
    this.jumpPressed = true;
    this.jumpBtn?.classList.add('is-pressed');
    this.jumpBtn?.setPointerCapture?.(ev.pointerId);
  };

  private readonly handleJumpUp = (ev: PointerEvent): void => {
    this.jumpPointers.delete(ev.pointerId);
    if (this.jumpPointers.size === 0) {
      this.jumpBtn?.classList.remove('is-pressed');
    }
  };

  private readonly handleSlideDown = (ev: PointerEvent): void => {
    if (!this.isControlEventAllowed(ev)) return;
    ev.preventDefault();
    this.slidePointers.add(ev.pointerId);
    this.slideBtn?.classList.add('is-pressed');
    this.slideBtn?.setPointerCapture?.(ev.pointerId);
  };

  private readonly handleSlideUp = (ev: PointerEvent): void => {
    this.slidePointers.delete(ev.pointerId);
    if (this.slidePointers.size === 0) {
      this.slideBtn?.classList.remove('is-pressed');
    }
  };

  private readonly handleFireDown = (ev: PointerEvent): void => {
    if (!this.isControlEventAllowed(ev)) return;
    ev.preventDefault();
    this.firePointers.add(ev.pointerId);
    if (this.fireDragPointerId === null) {
      this.fireDragPointerId = ev.pointerId;
      this.fireLastX = ev.clientX;
      this.fireLastY = ev.clientY;
    }
    this.fireBtn?.classList.add('is-pressed');
    this.fireBtn?.setPointerCapture?.(ev.pointerId);
  };

  private readonly handleFireMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.fireDragPointerId) return;
    ev.preventDefault();
    // Allow aiming while holding the AIM/FIRE button
    this.lookDeltaX += ev.clientX - this.fireLastX;
    this.lookDeltaY += ev.clientY - this.fireLastY;
    this.fireLastX = ev.clientX;
    this.fireLastY = ev.clientY;
  };

  private readonly handleFireUp = (ev: PointerEvent): void => {
    this.firePointers.delete(ev.pointerId);
    if (ev.pointerId === this.fireDragPointerId) {
      this.fireDragPointerId = null;
    }
    if (this.firePointers.size === 0) {
      this.fireBtn?.classList.remove('is-pressed');
    }
  };

  private readonly handleInteractDown = (ev: PointerEvent): void => {
    if (!this.isControlEventAllowed(ev)) return;
    ev.preventDefault();
    this.interactPressed = true;
    this.interactBtn?.classList.add('is-pressed');
  };

  private readonly handleMapDown = (ev: PointerEvent): void => {
    if (!this.isControlEventAllowed(ev)) return;
    ev.preventDefault();
    this.mapTogglePressed = true;
    this.mapBtn?.classList.add('is-pressed');
  };

  private readonly handlePauseDown = (ev: PointerEvent): void => {
    if (!this.isControlEventAllowed(ev)) return;
    ev.preventDefault();
    this.pausePressed = true;
    this.pauseBtn?.classList.add('is-pressed');
  };

  private readonly handleTapUp = (ev: PointerEvent): void => {
    const target = ev.currentTarget;
    if (target instanceof HTMLElement) {
      target.classList.remove('is-pressed');
    }
  };
}
