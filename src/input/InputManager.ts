import {
  createEmptyInputFrame,
  type GamepadCalibration,
  type GamepadProfile,
  type GamePhase,
  type IInputManager,
  type InputDeviceKind,
  type InputFrame,
  type UiNavAction,
} from '../contracts';
import { GamepadDriver, type GamepadInfo } from './GamepadDriver';
import { KeyboardMouseDriver } from './KeyboardMouseDriver';
import { TouchOverlay } from './TouchOverlay';

const PITCH_LIMIT = 1.45;
const TWO_PI = Math.PI * 2;

function wrapAngleRad(rad: number): number {
  let a = rad % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function resolveHostElement(target: unknown): HTMLElement | null {
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target;
  }
  if (typeof document !== 'undefined') {
    return document.getElementById('app') ?? document.body;
  }
  return null;
}

export class InputManager implements IInputManager {
  private readonly kbMouse = new KeyboardMouseDriver();
  private readonly gamepad = new GamepadDriver();
  private readonly touchOverlay = new TouchOverlay();

  private activeDevice: InputDeviceKind = 'keyboard_mouse';
  private lookYaw = 0;
  private lookPitch = 0;
  private pendingUiActions: UiNavAction[] = [];
  private deviceListeners = new Set<(device: InputDeviceKind) => void>();

  public constructor() {
    this.kbMouse.setOnActivity(() => {
      this.touchOverlay.hideOnNonTouchInput();
      this.setActiveDevice('keyboard_mouse');
    });

    this.gamepad.setOnActivity(() => {
      this.touchOverlay.hideOnNonTouchInput();
      this.setActiveDevice('gamepad');
    });

    this.touchOverlay.setOnTouchActivated((nowMs) => {
      this.kbMouse.notifyRealTouchTimestamp(nowMs);
      this.setActiveDevice('touch');
    });
  }

  public attach(target: unknown): void {
    const host = resolveHostElement(target);
    this.kbMouse.attach(host);
    this.gamepad.attach();
    if (host) {
      this.touchOverlay.mount(host);
    }
  }

  public detach(): void {
    this.kbMouse.detach();
    this.gamepad.detach();
    this.touchOverlay.dispose();
    this.pendingUiActions = [];
  }

  public pollFrame(dtSec: number, phase: GamePhase): InputFrame {
    // Release pointer lock automatically whenever leaving active gameplay
    if (phase !== 'playing' && this.kbMouse.isPointerLocked()) {
      this.kbMouse.exitPointerLock();
    }

    this.touchOverlay.setPhase(phase);

    const kb = this.kbMouse.poll(dtSec, phase);
    const gp = this.gamepad.poll(dtSec, phase);
    const touch = this.touchOverlay.pollTouchInput();

    if (gp.hasActivity) {
      this.touchOverlay.hideOnNonTouchInput();
      this.setActiveDevice('gamepad');
    } else if (kb.hasActivity) {
      this.touchOverlay.hideOnNonTouchInput();
      this.setActiveDevice('keyboard_mouse');
    }

    if (kb.uiActions.length > 0) {
      this.pendingUiActions.push(...kb.uiActions);
    }
    if (gp.uiActions.length > 0) {
      this.pendingUiActions.push(...gp.uiActions);
    }

    if (phase === 'playing') {
      this.lookYaw = wrapAngleRad(this.lookYaw + kb.lookDeltaYaw + gp.lookDeltaYaw + touch.lookDeltaYaw);
      this.lookPitch = clamp(
        this.lookPitch + kb.lookDeltaPitch + gp.lookDeltaPitch + touch.lookDeltaPitch,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    }

    const frame = createEmptyInputFrame(this.lookYaw, this.lookPitch);

    if (phase === 'playing') {
      let moveX = kb.moveX + gp.moveX + touch.moveX;
      let moveZ = kb.moveZ + gp.moveZ + touch.moveZ;
      const mag = Math.hypot(moveX, moveZ);
      if (mag > 1) {
        moveX /= mag;
        moveZ /= mag;
      }

      frame.moveX = moveX;
      frame.moveZ = moveZ;
      frame.jump = kb.jump || gp.jump || touch.jump;
      frame.jumpPressed = kb.jumpPressed || gp.jumpPressed || touch.jumpPressed;
      frame.crouchSlide = kb.crouchSlide || gp.crouchSlide || touch.crouchSlide;
      frame.fireHeld = kb.fireHeld || gp.fireHeld || touch.fireHeld;
      frame.interactPressed = kb.interactPressed || gp.interactPressed || touch.interactPressed;
      frame.cameraTogglePressed =
        kb.cameraTogglePressed || gp.cameraTogglePressed || touch.cameraTogglePressed;
      frame.pausePressed = kb.pausePressed || gp.pausePressed || touch.pausePressed;
      frame.mapTogglePressed = kb.mapTogglePressed || gp.mapTogglePressed || touch.mapTogglePressed;
      frame.activeSkillPressed = kb.activeSkillPressed || gp.activeSkillPressed;
    } else {
      frame.pausePressed = kb.pausePressed || gp.pausePressed || touch.pausePressed;
    }

    frame.draftChoiceIndex = kb.draftChoiceIndex;
    frame.rerollPressed = kb.rerollPressed || gp.rerollPressed;
    frame.banishPressed = kb.banishPressed || gp.banishPressed;
    frame.skipPressed = kb.skipPressed || gp.skipPressed;

    return frame;
  }

  public consumeUiActions(): UiNavAction[] {
    if (this.pendingUiActions.length === 0) return [];
    const actions = this.pendingUiActions;
    this.pendingUiActions = [];
    return actions;
  }

  public getActiveDevice(): InputDeviceKind {
    return this.activeDevice;
  }

  public isTouchOverlayVisible(): boolean {
    return this.touchOverlay.isVisible();
  }

  public setSimulatedTouch(active: boolean): void {
    this.touchOverlay.setSimulatedTouch(active);
    if (active) {
      this.setActiveDevice('touch');
    } else if (this.activeDevice === 'touch') {
      this.setActiveDevice(this.gamepad.isConnected() ? 'gamepad' : 'keyboard_mouse');
    }
  }

  public pulseHaptic(intensity: number, durationMs: number): void {
    this.gamepad.pulseHaptic(intensity, durationMs);
  }

  public calibrateGamepadNeutral(): boolean {
    return this.gamepad.calibrateNeutral();
  }

  public getGamepadInfo(): GamepadInfo {
    return this.gamepad.getInfo();
  }

  public isGamepadConnected(): boolean {
    return this.gamepad.isConnected();
  }

  public getGamepadProfile(): GamepadProfile {
    return this.gamepad.getProfile();
  }

  public setCalibration(calibration: GamepadCalibration): void {
    this.gamepad.setCalibration(calibration);
  }

  public getCalibration(): GamepadCalibration {
    return this.gamepad.getCalibration();
  }

  public setMouseSettings(sensitivity: number, invertY: boolean): void {
    this.kbMouse.setMouseSettings(sensitivity, invertY);
    this.touchOverlay.setLookSettings(sensitivity, invertY);
  }

  public setPointerLockAllowed(allowed: boolean): void {
    this.kbMouse.setPointerLockAllowed(allowed);
  }

  public requestPointerLock(): void {
    this.kbMouse.requestPointerLock();
  }

  public exitPointerLock(): void {
    this.kbMouse.exitPointerLock();
  }

  public isPointerLocked(): boolean {
    return this.kbMouse.isPointerLocked();
  }

  public setInteractPrompt(label: string | null): void {
    this.touchOverlay.setInteractPrompt(label);
  }

  public setLookAngles(yaw: number, pitch: number): void {
    this.lookYaw = wrapAngleRad(Number.isFinite(yaw) ? yaw : 0);
    this.lookPitch = clamp(Number.isFinite(pitch) ? pitch : 0, -PITCH_LIMIT, PITCH_LIMIT);
  }

  public getLookAngles(): { yaw: number; pitch: number } {
    return { yaw: this.lookYaw, pitch: this.lookPitch };
  }

  public onDeviceChange(listener: (device: InputDeviceKind) => void): () => void {
    this.deviceListeners.add(listener);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  public getTouchOverlay(): TouchOverlay {
    return this.touchOverlay;
  }

  public getGamepadDriver(): GamepadDriver {
    return this.gamepad;
  }

  public getKeyboardMouseDriver(): KeyboardMouseDriver {
    return this.kbMouse;
  }

  private setActiveDevice(device: InputDeviceKind): void {
    if (this.activeDevice === device) return;
    this.activeDevice = device;
    for (const listener of this.deviceListeners) {
      listener(device);
    }
  }
}
