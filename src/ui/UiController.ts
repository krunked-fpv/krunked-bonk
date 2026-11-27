import './styles.css';
import type {
  DebugPerfMetrics,
  GameCatalog,
  GamepadProfile,
  GamePhase,
  InputDeviceKind,
  RenderSettings,
  SaveData,
  SimState,
  UiNavAction,
} from '../contracts';
import { HudOverlay } from './HudOverlay';
import { MenusOverlay, type MenusViewState, type UiCallbacks } from './MenusOverlay';

export type { UiCallbacks, MenusViewState };

export interface UiUpdateParams {
  phase: GamePhase;
  state: Readonly<SimState> | null;
  catalog: Readonly<GameCatalog>;
  save: Readonly<SaveData>;
  settings: Readonly<RenderSettings>;
  activeDevice: InputDeviceKind;
  gamepadProfile: GamepadProfile;
  gamepadConnected: boolean;
  customPackLoaded: boolean;
  customPackName?: string | null;
  perf?: Readonly<DebugPerfMetrics>;
  fireHeld?: boolean;
  maxWeaponSlots?: number;
  maxTomeSlots?: number;
}

const HUD_VISIBLE_PHASES: ReadonlySet<GamePhase> = new Set([
  'playing',
  'paused',
  'level_up',
  'chest_open',
  'merchant',
  'microwave',
]);

const DRAFT_PHASES: ReadonlySet<GamePhase> = new Set([
  'level_up',
  'chest_open',
  'merchant',
  'microwave',
]);

export class UiController {
  private readonly callbacks: UiCallbacks;
  private readonly hud = new HudOverlay();
  private readonly menus: MenusOverlay;

  private root: HTMLDivElement | null = null;
  private currentPhase: GamePhase = 'boot';
  private focusedId: string | null = null;
  private focusedEl: HTMLElement | null = null;
  private lastInteractPrompt: string | null = null;

  public constructor(callbacks: UiCallbacks) {
    this.callbacks = callbacks;
    this.menus = new MenusOverlay(callbacks);
    this.menus.setOnRerender(() => this.restoreOrInitFocus());
  }

  public mount(host: HTMLElement): void {
    if (this.root || typeof document === 'undefined') return;
    const root = document.createElement('div');
    root.className = 'kb-ui-root';
    root.setAttribute('data-kb-ui-root', 'true');
    host.appendChild(root);

    this.hud.mount(root);
    this.menus.mount(root);

    root.addEventListener('pointerover', this.handlePointerOver);
    this.root = root;
  }

  /**
   * Updates both HUD and Menus for the current frame.
   * Returns the contextual interact prompt string (if any) so InputManager / TouchOverlay can sync it.
   */
  public update(params: UiUpdateParams): string | null {
    this.currentPhase = params.phase;

    const showHud = params.state !== null && HUD_VISIBLE_PHASES.has(params.phase);
    this.hud.setVisible(showHud);

    if (showHud && params.state) {
      this.lastInteractPrompt = this.hud.update({
        state: params.state,
        catalog: params.catalog,
        settings: params.settings,
        activeDevice: params.activeDevice,
        gamepadProfile: params.gamepadProfile,
        perf: params.perf,
        fireHeld: params.fireHeld,
        maxWeaponSlots: params.maxWeaponSlots,
        maxTomeSlots: params.maxTomeSlots,
      });
    } else {
      this.lastInteractPrompt = null;
    }

    const rebuilt = this.menus.render({
      phase: params.phase,
      state: params.state,
      catalog: params.catalog,
      save: params.save,
      settings: params.settings,
      activeDevice: params.activeDevice,
      gamepadProfile: params.gamepadProfile,
      gamepadConnected: params.gamepadConnected,
      customPackLoaded: params.customPackLoaded,
      customPackName: params.customPackName,
    });

    if (rebuilt) {
      this.restoreOrInitFocus();
    } else if (!this.menus.isMenuPhase(params.phase)) {
      this.clearFocus();
    }

    return params.phase === 'playing' ? this.lastInteractPrompt : null;
  }

  public handleNavActions(actions: readonly UiNavAction[]): void {
    if (actions.length === 0) return;
    if (!this.menus.isMenuPhase(this.currentPhase)) return;

    for (const action of actions) {
      this.dispatchNavAction(action);
    }
  }

  public getFocusedElement(): HTMLElement | null {
    return this.focusedEl;
  }

  public getActiveInteractLabel(): string | null {
    return this.lastInteractPrompt;
  }

  public getHudOverlay(): HudOverlay {
    return this.hud;
  }

  public getMenusOverlay(): MenusOverlay {
    return this.menus;
  }

  public dispose(): void {
    this.root?.removeEventListener('pointerover', this.handlePointerOver);
    this.hud.dispose();
    this.menus.dispose();
    this.root?.remove();
    this.root = null;
    this.clearFocus();
  }

  private dispatchNavAction(action: UiNavAction): void {
    // Ensure a valid control is focused before directional or confirm operations
    if (!this.focusedEl || !this.focusedEl.isConnected) {
      this.restoreOrInitFocus();
    }

    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right': {
        if ((action === 'left' || action === 'right') && this.tryAdjustFocusedControl(action === 'right' ? 1 : -1)) {
          return;
        }
        this.moveFocus(action);
        return;
      }

      case 'confirm': {
        if (this.focusedEl) {
          if (this.focusedEl.hasAttribute('data-kb-slider')) {
            // Confirm on a slider advances focus cleanly to the next control
            this.moveFocus('down');
            return;
          }
          this.focusedEl.click();
        }
        return;
      }

      case 'cancel': {
        if (this.menus.isBanishArmed()) {
          this.menus.setBanishArmed(false);
          return;
        }
        this.handleCancelForPhase();
        return;
      }

      case 'pause': {
        if (this.currentPhase === 'paused') {
          this.callbacks.onResume();
        }
        return;
      }

      case 'reroll': {
        if (DRAFT_PHASES.has(this.currentPhase)) {
          this.menus.setBanishArmed(false);
          this.callbacks.onRerollDraft();
        }
        return;
      }

      case 'banish': {
        if (DRAFT_PHASES.has(this.currentPhase)) {
          const draftIdxAttr = this.focusedEl?.getAttribute('data-kb-draft-index');
          if (draftIdxAttr !== null && draftIdxAttr !== undefined) {
            const idx = Number(draftIdxAttr);
            if (Number.isInteger(idx)) {
              this.menus.setBanishArmed(false);
              this.callbacks.onBanishDraftChoice(idx);
              return;
            }
          }
          // Otherwise toggle banish mode via button
          const banishBtn = this.menus
            .getRoot()
            ?.querySelector<HTMLButtonElement>('[data-kb-focus-id="draft-banish"]');
          if (banishBtn && !banishBtn.disabled) {
            banishBtn.click();
          }
        }
        return;
      }

      case 'skip': {
        if (DRAFT_PHASES.has(this.currentPhase)) {
          this.menus.setBanishArmed(false);
          this.callbacks.onSkipDraft();
        }
        return;
      }

      case 'tab_prev':
      case 'tab_next': {
        this.stepFocusLinear(action === 'tab_next' ? 1 : -1);
        return;
      }
    }
  }

  private handleCancelForPhase(): void {
    switch (this.currentPhase) {
      case 'paused':
        this.callbacks.onResume();
        break;
      case 'settings':
        this.callbacks.onCloseOptions();
        break;
      case 'character_select':
      case 'map_select':
      case 'shop':
        this.callbacks.onBackToTitle();
        break;
      default:
        break;
    }
  }

  private tryAdjustFocusedControl(delta: -1 | 1): boolean {
    const el = this.focusedEl;
    if (!el) return false;

    if (el instanceof HTMLInputElement && el.type === 'range') {
      const min = Number(el.min || '0');
      const max = Number(el.max || '100');
      const step = Number(el.step || '1');
      const curr = Number(el.value || '0');
      const next = Math.max(min, Math.min(max, Math.round((curr + delta * step) * 1000) / 1000));
      if (next !== curr) {
        el.value = String(next);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    }

    const stepper = el.getAttribute('data-kb-stepper');
    if (stepper === 'toggle') {
      el.click();
      return true;
    }
    if (stepper === 'cycle') {
      el.dispatchEvent(new CustomEvent('kb-step', { detail: { delta } }));
      return true;
    }
    return false;
  }

  private getFocusables(): HTMLElement[] {
    const menuRoot = this.menus.getRoot();
    if (!menuRoot) return [];
    const nodes = Array.from(menuRoot.querySelectorAll<HTMLElement>('[data-kb-focus="true"]'));
    return nodes.filter((el) => {
      if ((el as HTMLButtonElement).disabled) return false;
      if (el.getAttribute('aria-disabled') === 'true') return false;
      return true;
    });
  }

  private restoreOrInitFocus(): void {
    const focusables = this.getFocusables();
    if (focusables.length === 0) {
      this.clearFocus();
      return;
    }

    if (this.focusedId) {
      const match = focusables.find((el) => el.getAttribute('data-kb-focus-id') === this.focusedId);
      if (match) {
        this.setFocus(match, false);
        return;
      }
    }

    this.setFocus(focusables[0], false);
  }

  private clearFocus(): void {
    if (this.focusedEl) {
      this.focusedEl.classList.remove('kb-focused');
    }
    this.focusedEl = null;
  }

  private setFocus(el: HTMLElement, scrollIntoView = true): void {
    if (this.focusedEl && this.focusedEl !== el) {
      this.focusedEl.classList.remove('kb-focused');
    }
    this.focusedEl = el;
    this.focusedId = el.getAttribute('data-kb-focus-id');
    el.classList.add('kb-focused');
    if (scrollIntoView && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        // Ignore in headless/non-layout environments
      }
    }
  }

  private stepFocusLinear(delta: -1 | 1): void {
    const focusables = this.getFocusables();
    if (focusables.length === 0) return;
    const currIdx = this.focusedEl ? focusables.indexOf(this.focusedEl) : -1;
    const nextIdx =
      currIdx < 0
        ? 0
        : (currIdx + delta + focusables.length) % focusables.length;
    this.setFocus(focusables[nextIdx]);
  }

  /**
   * 2D spatial nearest-neighbor navigation with clean linear fallback when layout
   * geometry is collapsed (e.g. headless DOM tests) or at screen edges.
   */
  private moveFocus(dir: 'up' | 'down' | 'left' | 'right'): void {
    const focusables = this.getFocusables();
    if (focusables.length === 0) return;
    if (!this.focusedEl || !focusables.includes(this.focusedEl)) {
      this.setFocus(focusables[0]);
      return;
    }

    const currRect = this.focusedEl.getBoundingClientRect();
    const hasGeometry = currRect.width > 0 || currRect.height > 0;
    if (!hasGeometry) {
      this.stepFocusLinear(dir === 'down' || dir === 'right' ? 1 : -1);
      return;
    }

    const cx = currRect.left + currRect.width * 0.5;
    const cy = currRect.top + currRect.height * 0.5;

    let best: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const candidate of focusables) {
      if (candidate === this.focusedEl) continue;
      const r = candidate.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      const tx = r.left + r.width * 0.5;
      const ty = r.top + r.height * 0.5;
      const dx = tx - cx;
      const dy = ty - cy;

      let primary = 0;
      let cross = 0;
      if (dir === 'right') {
        if (dx <= 6) continue;
        primary = dx;
        cross = Math.abs(dy);
      } else if (dir === 'left') {
        if (dx >= -6) continue;
        primary = -dx;
        cross = Math.abs(dy);
      } else if (dir === 'down') {
        if (dy <= 6) continue;
        primary = dy;
        cross = Math.abs(dx);
      } else {
        if (dy >= -6) continue;
        primary = -dy;
        cross = Math.abs(dx);
      }

      // Strongly prefer aligned controls along the travel axis
      const score = primary + cross * 2.4;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best) {
      this.setFocus(best);
      return;
    }

    // Wrap cleanly when reaching an edge in up/down navigation
    if (dir === 'down' || dir === 'right') {
      this.stepFocusLinear(1);
    } else {
      this.stepFocusLinear(-1);
    }
  }

  private readonly handlePointerOver = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const focusable = target.closest<HTMLElement>('[data-kb-focus="true"]');
    if (focusable && !(focusable as HTMLButtonElement).disabled) {
      this.setFocus(focusable, false);
    }
  };
}
