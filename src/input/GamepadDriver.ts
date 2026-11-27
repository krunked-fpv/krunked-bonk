import {
  DEFAULT_RENDER_SETTINGS,
  GAMEPAD_DEADZONE_DEFAULT,
  type GamepadCalibration,
  type GamepadProfile,
  type GamePhase,
  type UiNavAction,
} from '../contracts';

export interface GamepadNeutralOffset {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

export interface GamepadInfo {
  connected: boolean;
  index: number | null;
  id: string;
  profile: GamepadProfile;
  neutralOffset: GamepadNeutralOffset;
}

export interface GamepadPollResult {
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

// Standard Gamepad API button indices
const BTN_SOUTH = 0; // Xbox A / PS Cross / Switch B
const BTN_EAST = 1; // Xbox B / PS Circle / Switch A
const BTN_WEST = 2; // Xbox X / PS Square / Switch Y
const BTN_NORTH = 3; // Xbox Y / PS Triangle / Switch X
const BTN_LB = 4;
const BTN_RB = 5;
const BTN_LT = 6;
const BTN_RT = 7;
const BTN_BACK = 8; // Back / View / Select / Share
const BTN_START = 9; // Start / Menu / Options
const BTN_L3 = 10;
const BTN_R3 = 11;
const BTN_DPAD_UP = 12;
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;

const TRIGGER_THRESHOLD = 0.25;
const MAX_NEUTRAL_CLAMP = 0.25;
const AUTO_CALIBRATION_SAMPLES = 8;
const RIGHT_STICK_YAW_RAD_PER_SEC = 3.1;
const RIGHT_STICK_PITCH_RAD_PER_SEC = 2.25;
const STICK_NAV_THRESHOLD = 0.55;
const NAV_INITIAL_DELAY_SEC = 0.38;
const NAV_REPEAT_INTERVAL_SEC = 0.11;

interface HapticActuatorLike {
  playEffect?: (
    type: string,
    params: {
      startDelay?: number;
      duration: number;
      weakMagnitude?: number;
      strongMagnitude?: number;
    },
  ) => Promise<string> | void;
  pulse?: (value: number, duration: number) => Promise<boolean> | void;
}

type ExtendedGamepad = Gamepad & {
  vibrationActuator?: HapticActuatorLike | null;
  hapticActuators?: readonly HapticActuatorLike[];
};

export function detectGamepadProfile(id: string, userAgent?: string): GamepadProfile {
  const lower = id.toLowerCase();
  if (lower.includes('tesla')) return 'tesla';
  if (
    lower.includes('steam deck') ||
    lower.includes('steamdeck') ||
    lower.includes('valve') ||
    lower.includes('28de') ||
    lower.includes('neptune')
  ) {
    return 'steam_deck';
  }
  if (
    lower.includes('xbox') ||
    lower.includes('x-box') ||
    lower.includes('xinput') ||
    lower.includes('microsoft') ||
    lower.includes('045e')
  ) {
    return 'xbox';
  }
  if (
    lower.includes('nintendo') ||
    lower.includes('switch') ||
    lower.includes('pro controller') ||
    lower.includes('joy-con') ||
    lower.includes('057e')
  ) {
    return 'switch';
  }
  if (
    lower.includes('dualsense') ||
    lower.includes('dualshock') ||
    lower.includes('playstation') ||
    lower.includes('sony') ||
    lower.includes('054c') ||
    lower.includes('ps4') ||
    lower.includes('ps5') ||
    lower.includes('wireless controller')
  ) {
    return 'playstation';
  }
  const ua = (userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')).toLowerCase();
  if (ua.includes('tesla')) {
    return 'tesla';
  }
  return 'generic';
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function readButtonValue(gp: Gamepad, index: number): number {
  const btn = gp.buttons[index];
  if (!btn) return 0;
  if (typeof btn.value === 'number' && Number.isFinite(btn.value)) {
    return btn.value;
  }
  return btn.pressed ? 1 : 0;
}

function isButtonDown(gp: Gamepad, index: number, threshold = 0.5): boolean {
  const btn = gp.buttons[index];
  if (!btn) return false;
  if (btn.pressed) return true;
  return typeof btn.value === 'number' && btn.value >= threshold;
}

function applyRadialDeadzone(x: number, y: number, deadzone: number): [number, number, number] {
  const dz = clamp(deadzone, 0.02, 0.65);
  const mag = Math.hypot(x, y);
  if (mag <= dz) return [0, 0, 0];
  const scaled = Math.min(1, (mag - dz) / Math.max(0.01, 1 - dz));
  const inv = scaled / mag;
  return [x * inv, y * inv, scaled];
}

function applyExponentialOrbitCurve(x: number, y: number, deadzone: number): [number, number] {
  const [dx, dy, mag] = applyRadialDeadzone(x, y, deadzone);
  if (mag <= 0) return [0, 0];
  // Smooth blend of linear micro-aim (20%) + exponential precision curve (80%, power 2.2)
  const curved = 0.2 * mag + 0.8 * Math.pow(mag, 2.2);
  const scale = curved / mag;
  return [dx * scale, dy * scale];
}

type NavDir = 'up' | 'down' | 'left' | 'right';

export class GamepadDriver {
  private calibration: GamepadCalibration = {
    ...DEFAULT_RENDER_SETTINGS.gamepad,
    deadzone: GAMEPAD_DEADZONE_DEFAULT,
  };

  private attached = false;
  private activeIndex: number | null = null;
  private activeId = '';
  private detectedProfile: GamepadProfile = 'xbox';

  private neutralOffset: GamepadNeutralOffset = { lx: 0, ly: 0, rx: 0, ry: 0 };
  private autoCalibSamples: GamepadNeutralOffset[] = [];
  private autoCalibrated = false;

  private prevButtons: boolean[] = [];
  private navHoldDir: NavDir | null = null;
  private navHoldTimer = 0;
  private navRepeatTimer = 0;

  private onActivityCallback: (() => void) | null = null;

  public setOnActivity(cb: (() => void) | null): void {
    this.onActivityCallback = cb;
  }

  public attach(): void {
    if (this.attached) return;
    this.attached = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.handleGamepadConnected);
      window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    }
    this.refreshConnectedPad();
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    }
    this.prevButtons = [];
    this.navHoldDir = null;
  }

  public setCalibration(calibration: GamepadCalibration): void {
    this.calibration = {
      ...calibration,
      deadzone: clamp(
        Number.isFinite(calibration.deadzone) ? calibration.deadzone : GAMEPAD_DEADZONE_DEFAULT,
        0.02,
        0.65,
      ),
      sensitivityX: clamp(Number.isFinite(calibration.sensitivityX) ? calibration.sensitivityX : 1.0, 0.1, 5.0),
      sensitivityY: clamp(Number.isFinite(calibration.sensitivityY) ? calibration.sensitivityY : 1.0, 0.1, 5.0),
    };
  }

  public getCalibration(): GamepadCalibration {
    return {
      ...this.calibration,
      profile: this.isConnected() ? this.detectedProfile : this.calibration.profile,
    };
  }

  public isConnected(): boolean {
    return this.getActiveGamepad() !== null;
  }

  public getProfile(): GamepadProfile {
    return this.isConnected() ? this.detectedProfile : this.calibration.profile;
  }

  public getInfo(): GamepadInfo {
    const gp = this.getActiveGamepad();
    return {
      connected: gp !== null,
      index: gp ? gp.index : null,
      id: gp ? gp.id : '',
      profile: this.getProfile(),
      neutralOffset: { ...this.neutralOffset },
    };
  }

  /**
   * Captures current resting stick axis positions to eliminate baseline stick drift.
   * Clamps offsets to [-0.25, 0.25] so holding a stick full-tilt cannot corrupt calibration.
   */
  public calibrateNeutral(): boolean {
    const gp = this.getActiveGamepad();
    if (!gp) return false;
    this.neutralOffset = {
      lx: clamp(gp.axes[0] ?? 0, -MAX_NEUTRAL_CLAMP, MAX_NEUTRAL_CLAMP),
      ly: clamp(gp.axes[1] ?? 0, -MAX_NEUTRAL_CLAMP, MAX_NEUTRAL_CLAMP),
      rx: clamp(gp.axes[2] ?? 0, -MAX_NEUTRAL_CLAMP, MAX_NEUTRAL_CLAMP),
      ry: clamp(gp.axes[3] ?? 0, -MAX_NEUTRAL_CLAMP, MAX_NEUTRAL_CLAMP),
    };
    this.autoCalibrated = true;
    this.autoCalibSamples = [];
    return true;
  }

  public pulseHaptic(intensity: number, durationMs: number): void {
    if (!this.calibration.vibration) return;
    const gp = this.getActiveGamepad() as ExtendedGamepad | null;
    if (!gp) return;

    const strength = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
    const duration = clamp(Number.isFinite(durationMs) ? durationMs : 0, 10, 2000);
    if (strength <= 0.01) return;

    try {
      const actuator = gp.vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        const res = actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration,
          weakMagnitude: clamp(strength * 0.7, 0, 1),
          strongMagnitude: strength,
        });
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
        return;
      }
      if (actuator && typeof actuator.pulse === 'function') {
        const res = actuator.pulse(strength, duration);
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
        return;
      }
      const legacy = gp.hapticActuators?.[0];
      if (legacy && typeof legacy.pulse === 'function') {
        const res = legacy.pulse(strength, duration);
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch {
      // Gracefully ignore unsupported haptic environments
    }
  }

  public poll(dtSec: number, phase: GamePhase): GamepadPollResult {
    const empty: GamepadPollResult = {
      moveX: 0,
      moveZ: 0,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
      jump: false,
      jumpPressed: false,
      crouchSlide: false,
      fireHeld: false,
      interactPressed: false,
      cameraTogglePressed: false,
      pausePressed: false,
      mapTogglePressed: false,
      rerollPressed: false,
      banishPressed: false,
      skipPressed: false,
      activeSkillPressed: false,
      uiActions: [],
      hasActivity: false,
    };

    const gp = this.getActiveGamepad();
    if (!gp) {
      this.prevButtons = [];
      this.navHoldDir = null;
      return empty;
    }

    this.sampleAutoNeutral(gp);

    const rawLx = (gp.axes[0] ?? 0) - this.neutralOffset.lx;
    const rawLy = (gp.axes[1] ?? 0) - this.neutralOffset.ly;
    const rawRx = (gp.axes[2] ?? 0) - this.neutralOffset.rx;
    const rawRy = (gp.axes[3] ?? 0) - this.neutralOffset.ry;

    const dz = this.calibration.deadzone;
    const [lx, ly, lMag] = applyRadialDeadzone(rawLx, rawLy, dz);
    const [rx, ry] = applyExponentialOrbitCurve(rawRx, rawRy, dz);

    const btnCount = Math.max(16, gp.buttons.length);
    const currButtons: boolean[] = new Array(btnCount);
    const pressedButtons: boolean[] = new Array(btnCount);
    let anyButtonDown = false;

    for (let i = 0; i < btnCount; i++) {
      const threshold = i === BTN_LT || i === BTN_RT ? TRIGGER_THRESHOLD : 0.5;
      const down = isButtonDown(gp, i, threshold);
      currButtons[i] = down;
      pressedButtons[i] = down && !(this.prevButtons[i] ?? false);
      if (down) anyButtonDown = true;
    }
    this.prevButtons = currButtons;

    const hasStickActivity = lMag > 0 || Math.hypot(rx, ry) > 0;
    const hasActivity = anyButtonDown || hasStickActivity;
    if (hasActivity) {
      this.onActivityCallback?.();
    }

    const dt = clamp(dtSec, 0, 0.1);
    const uiActions: UiNavAction[] = [];

    if (phase === 'playing') {
      // Reset menu repeat timers while playing
      this.navHoldDir = null;
      this.navHoldTimer = 0;
      this.navRepeatTimer = 0;

      // Forward is -Y on standard left stick
      const moveX = lx || 0;
      const moveZ = -ly || 0;

      // Right stick exponential 3D orbit
      const lookDeltaYaw = (-rx * RIGHT_STICK_YAW_RAD_PER_SEC * this.calibration.sensitivityX * dt) || 0;
      const lookDeltaPitch =
        ((this.calibration.invertY ? ry : -ry) * RIGHT_STICK_PITCH_RAD_PER_SEC * this.calibration.sensitivityY * dt) || 0;

      const ltHeld = readButtonValue(gp, BTN_LT) >= TRIGGER_THRESHOLD || currButtons[BTN_LT];
      const rtHeld = readButtonValue(gp, BTN_RT) >= TRIGGER_THRESHOLD || currButtons[BTN_RT];

      return {
        moveX,
        moveZ,
        lookDeltaYaw,
        lookDeltaPitch,
        jump: currButtons[BTN_SOUTH],
        jumpPressed: pressedButtons[BTN_SOUTH],
        crouchSlide: currButtons[BTN_EAST] || ltHeld || currButtons[BTN_L3],
        fireHeld: rtHeld,
        interactPressed: pressedButtons[BTN_WEST],
        cameraTogglePressed: pressedButtons[BTN_R3] || pressedButtons[BTN_BACK],
        pausePressed: pressedButtons[BTN_START],
        mapTogglePressed: pressedButtons[BTN_NORTH],
        rerollPressed: false,
        banishPressed: false,
        skipPressed: false,
        activeSkillPressed: pressedButtons[BTN_LB] || pressedButtons[BTN_RB],
        uiActions,
        hasActivity,
      };
    }

    // Non-playing phases: repeat-gated D-pad & left-stick navigation
    let dir: NavDir | null = null;
    if (currButtons[BTN_DPAD_UP] || ly < -STICK_NAV_THRESHOLD) dir = 'up';
    else if (currButtons[BTN_DPAD_DOWN] || ly > STICK_NAV_THRESHOLD) dir = 'down';
    else if (currButtons[BTN_DPAD_LEFT] || lx < -STICK_NAV_THRESHOLD) dir = 'left';
    else if (currButtons[BTN_DPAD_RIGHT] || lx > STICK_NAV_THRESHOLD) dir = 'right';

    if (dir !== null) {
      if (dir !== this.navHoldDir) {
        this.navHoldDir = dir;
        this.navHoldTimer = 0;
        this.navRepeatTimer = 0;
        uiActions.push(dir);
      } else {
        this.navHoldTimer += dt;
        if (this.navHoldTimer >= NAV_INITIAL_DELAY_SEC) {
          this.navRepeatTimer += dt;
          while (this.navRepeatTimer >= NAV_REPEAT_INTERVAL_SEC) {
            this.navRepeatTimer -= NAV_REPEAT_INTERVAL_SEC;
            uiActions.push(dir);
          }
        }
      }
    } else {
      this.navHoldDir = null;
      this.navHoldTimer = 0;
      this.navRepeatTimer = 0;
    }

    const confirmIdx = this.calibration.swapConfirmCancel ? BTN_EAST : BTN_SOUTH;
    const cancelIdx = this.calibration.swapConfirmCancel ? BTN_SOUTH : BTN_EAST;

    if (pressedButtons[confirmIdx]) uiActions.push('confirm');
    if (pressedButtons[cancelIdx]) uiActions.push('cancel');
    if (pressedButtons[BTN_LB]) uiActions.push('tab_prev');
    if (pressedButtons[BTN_RB]) uiActions.push('tab_next');
    if (pressedButtons[BTN_START]) uiActions.push('pause');

    let rerollPressed = false;
    let banishPressed = false;
    let skipPressed = false;

    if (pressedButtons[BTN_WEST]) {
      uiActions.push('reroll');
      if (DRAFT_PHASES.has(phase)) rerollPressed = true;
    }
    if (pressedButtons[BTN_NORTH]) {
      uiActions.push('banish');
      if (DRAFT_PHASES.has(phase)) banishPressed = true;
    }
    if (pressedButtons[BTN_BACK]) {
      uiActions.push('skip');
      if (DRAFT_PHASES.has(phase)) skipPressed = true;
    }

    return {
      ...empty,
      rerollPressed,
      banishPressed,
      skipPressed,
      uiActions,
      hasActivity,
    };
  }

  private sampleAutoNeutral(gp: Gamepad): void {
    if (this.autoCalibrated) return;
    const lx = gp.axes[0] ?? 0;
    const ly = gp.axes[1] ?? 0;
    const rx = gp.axes[2] ?? 0;
    const ry = gp.axes[3] ?? 0;

    // Only collect samples when both sticks appear to be at rest (inside drift ceiling)
    if (Math.hypot(lx, ly) < MAX_NEUTRAL_CLAMP && Math.hypot(rx, ry) < MAX_NEUTRAL_CLAMP) {
      this.autoCalibSamples.push({ lx, ly, rx, ry });
      if (this.autoCalibSamples.length >= AUTO_CALIBRATION_SAMPLES) {
        let slx = 0;
        let sly = 0;
        let srx = 0;
        let sry = 0;
        for (const s of this.autoCalibSamples) {
          slx += s.lx;
          sly += s.ly;
          srx += s.rx;
          sry += s.ry;
        }
        const n = this.autoCalibSamples.length;
        this.neutralOffset = {
          lx: clamp(slx / n, -MAX_NEUTRAL_CLAMP, MAX_NEUTRAL_CLAMP),
          ly: clamp(sly / n, -MAX_NEUTRAL_CLAMP, MAX_NEUTRAL_CLAMP),
          rx: clamp(srx / n, -MAX_NEUTRAL_CLAMP, MAX_NEUTRAL_CLAMP),
          ry: clamp(sry / n, -MAX_NEUTRAL_CLAMP, MAX_NEUTRAL_CLAMP),
        };
        this.autoCalibrated = true;
      }
    }
  }

  private getActiveGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return null;
    }
    let pads: (Gamepad | null)[];
    try {
      pads = Array.from(navigator.getGamepads());
    } catch {
      return null;
    }

    if (this.activeIndex !== null) {
      const current = pads[this.activeIndex];
      if (current && current.connected) {
        if (current.id !== this.activeId) {
          this.selectPad(current);
        }
        return current;
      }
      this.activeIndex = null;
      this.activeId = '';
    }

    for (const pad of pads) {
      if (pad && pad.connected) {
        this.selectPad(pad);
        return pad;
      }
    }
    return null;
  }

  private selectPad(pad: Gamepad): void {
    this.activeIndex = pad.index;
    this.activeId = pad.id;
    this.detectedProfile = detectGamepadProfile(pad.id);
    this.calibration.profile = this.detectedProfile;
    this.neutralOffset = { lx: 0, ly: 0, rx: 0, ry: 0 };
    this.autoCalibSamples = [];
    this.autoCalibrated = false;
    this.prevButtons = [];
  }

  private refreshConnectedPad(): void {
    this.getActiveGamepad();
  }

  private readonly handleGamepadConnected = (ev: GamepadEvent): void => {
    if (ev.gamepad && ev.gamepad.connected && this.activeIndex === null) {
      this.selectPad(ev.gamepad);
    }
  };

  private readonly handleGamepadDisconnected = (ev: GamepadEvent): void => {
    if (ev.gamepad && ev.gamepad.index === this.activeIndex) {
      this.activeIndex = null;
      this.activeId = '';
      this.prevButtons = [];
      this.navHoldDir = null;
      this.refreshConnectedPad();
    }
  };
}
