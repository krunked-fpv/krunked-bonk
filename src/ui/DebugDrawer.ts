/**
 * KRUNKEDBONK — F9 Playtest Debug Drawer
 *
 * Hidden by default (`display: none`). Press `F9` at any time to toggle a compact
 * retro-styled QA drawer wired directly to `DebugBridge` (`window.__KRUNKED_DEBUG__`).
 */

import type { DebugBridge, MapId, MapTier } from '../contracts/index';

const FLAGSHIP_WEAPONS = [
  'WeaponFireStaff',
  'WeaponBone',
  'WeaponSword',
  'WeaponAura',
  'WeaponRevolver',
  'WeaponChunkers',
  'WeaponLightningBolt',
  'WeaponSniper',
] as const;

export class DebugDrawer {
  private readonly bridge: DebugBridge;
  private root: HTMLDivElement | null = null;
  private statsPre: HTMLPreElement | null = null;
  private godBtn: HTMLButtonElement | null = null;
  private touchBtn: HTMLButtonElement | null = null;
  private snapBtn: HTMLButtonElement | null = null;
  private camBtn: HTMLButtonElement | null = null;

  private visible = false;
  private godMode = false;
  private simulatedTouch = false;
  private nextPylonIndex = 0;
  private refreshIntervalId: number | null = null;

  constructor(bridge: DebugBridge) {
    this.bridge = bridge;
  }

  public mount(host: HTMLElement): void {
    if (this.root || typeof document === 'undefined') return;

    const root = document.createElement('div');
    root.setAttribute('data-kb-debug-drawer', 'true');
    root.style.cssText = [
      'position:fixed',
      'top:12px',
      'left:12px',
      'z-index:9999',
      'width:308px',
      'max-height:calc(100vh - 24px)',
      'overflow-y:auto',
      'background:rgba(11,14,20,0.92)',
      'border:2px solid #f59e0b',
      'box-shadow:0 6px 24px rgba(0,0,0,0.75)',
      'color:#f1f5f9',
      'font-family:ui-monospace,Consolas,monospace',
      'font-size:11px',
      'padding:10px',
      'display:none',
      'pointer-events:auto',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:6px;margin-bottom:8px;font-weight:700;color:#fbbf24;';
    const title = document.createElement('span');
    title.textContent = 'KRUNKEDBONK PLAYTEST [F9]';
    const closeBtn = this.makeBtn('X', () => this.setVisible(false));
    closeBtn.style.padding = '2px 6px';
    header.append(title, closeBtn);

    const statsPre = document.createElement('pre');
    statsPre.style.cssText =
      'margin:0 0 8px 0;padding:6px;background:#070a0f;border:1px solid #1e293b;color:#93c5fd;white-space:pre-wrap;line-height:1.35;font-size:10px;';
    this.statsPre = statsPre;

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:5px;';

    this.godBtn = this.makeBtn('GOD MODE: OFF', () => {
      this.godMode = !this.godMode;
      this.bridge.setInvincible(this.godMode);
      this.syncToggleLabels();
      this.refreshStats();
    });

    this.touchBtn = this.makeBtn('SIM TOUCH: OFF', () => {
      this.simulatedTouch = !this.simulatedTouch;
      this.bridge.simulateTouch(this.simulatedTouch);
      this.syncToggleLabels();
      this.refreshStats();
    });

    this.camBtn = this.makeBtn('CAM: 3RD', () => {
      const curr = this.bridge.getSettings().cameraMode;
      this.bridge.setSettings({ cameraMode: curr === 'third' ? 'first' : 'third' });
      this.syncToggleLabels();
      this.refreshStats();
    });

    this.snapBtn = this.makeBtn('50HZ SNAP: OFF', () => {
      const curr = this.bridge.getSettings().classic50HzSnap;
      this.bridge.setSettings({ classic50HzSnap: !curr });
      this.syncToggleLabels();
      this.refreshStats();
    });

    grid.append(
      this.makeBtn('+XP / LEVEL UP', () => {
        const st = this.bridge.getState();
        this.bridge.grantXp(Math.max(50, st.player.xpToNext));
        this.refreshStats();
      }),
      this.makeBtn('+250 GOLD', () => {
        this.bridge.grantGold(250);
        this.refreshStats();
      }),
      this.makeBtn('SPAWN BOSS', () => {
        this.bridge.triggerBoss();
        this.refreshStats();
      }),
      this.makeBtn('FINAL SWARM', () => {
        this.bridge.triggerFinalSwarm();
        this.refreshStats();
      }),
      this.godBtn,
      this.touchBtn,
      this.makeBtn('FORK+BONK+LAMP', () => {
        this.bridge.grantItem('GiantFork', 1);
        this.bridge.grantItem('Bonker', 2);
        this.bridge.grantItem('OverpoweredLamp', 2);
        this.bridge.grantTome('TomePrecision', 6);
        this.refreshStats();
      }),
      this.makeBtn('ALL 8 WEAPONS', () => {
        for (const wid of FLAGSHIP_WEAPONS) {
          this.bridge.grantWeapon(wid, 3);
        }
        this.refreshStats();
      }),
      this.camBtn,
      this.snapBtn,
      this.makeBtn('WARP FOREST T1', () => this.warp('Forest', 1)),
      this.makeBtn('WARP FOREST T2', () => this.warp('Forest', 2)),
      this.makeBtn('WARP FOREST T3', () => this.warp('Forest', 3)),
      this.makeBtn('WARP FINAL BOSS', () => this.warp('FinalBossMap', 1)),
      this.makeBtn('CLEANSE PYLON', () => {
        this.bridge.cleansePylon(this.nextPylonIndex % 11);
        this.nextPylonIndex += 1;
        this.refreshStats();
      }),
      this.makeBtn('STEP +50 TICKS', () => {
        this.bridge.stepTicks(50, { moveZ: 1 });
        this.refreshStats();
      }),
    );

    root.append(header, statsPre, grid);
    host.appendChild(root);
    this.root = root;

    window.addEventListener('keydown', this.handleKeyDown);
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public setVisible(next: boolean): void {
    this.visible = next;
    if (this.root) {
      this.root.style.display = next ? 'block' : 'none';
    }
    if (next) {
      this.syncToggleLabels();
      this.refreshStats();
      if (this.refreshIntervalId === null) {
        this.refreshIntervalId = window.setInterval(() => this.refreshStats(), 200);
      }
    } else if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    this.root?.remove();
    this.root = null;
    this.statsPre = null;
  }

  private warp(mapId: MapId, tier: MapTier): void {
    this.bridge.warpStage(mapId, tier);
    this.nextPylonIndex = 0;
    this.refreshStats();
  }

  private syncToggleLabels(): void {
    const settings = this.bridge.getSettings();
    if (this.godBtn) this.godBtn.textContent = `GOD MODE: ${this.godMode ? 'ON' : 'OFF'}`;
    if (this.touchBtn) this.touchBtn.textContent = `SIM TOUCH: ${this.simulatedTouch ? 'ON' : 'OFF'}`;
    if (this.camBtn) this.camBtn.textContent = `CAM: ${settings.cameraMode === 'first' ? '1ST' : '3RD'}`;
    if (this.snapBtn) this.snapBtn.textContent = `50HZ SNAP: ${settings.classic50HzSnap ? 'ON' : 'OFF'}`;
  }

  private refreshStats(): void {
    if (!this.visible || !this.statsPre) return;
    const st = this.bridge.getState();
    const perf = this.bridge.getPerfMetrics();
    const p = st.player;
    const hSpeed = Math.hypot(p.vel.x, p.vel.z);
    const hash = this.bridge.getStateHash();
    this.statsPre.textContent = [
      `PHASE: ${st.phase} | MAP: ${st.mapId} T${st.mapTier} | TICK: ${st.tick}`,
      `FPS: ${perf.fps} (${perf.frameTimeMs.toFixed(1)}ms) | SIM: ${perf.simStepMs.toFixed(2)}ms | α=${perf.interpAlpha.toFixed(2)}`,
      `DC: ${perf.drawCalls} | TRIS: ${perf.triangles} | ENEMIES: ${perf.activeEnemies} | PROJ: ${perf.activeProjectiles}`,
      `POS: (${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}, ${p.pos.z.toFixed(1)}) | SPD: ${hSpeed.toFixed(1)} m/s [${p.movementState}]`,
      `HP: ${Math.round(p.hp)}/${Math.round(p.maxHp)} | LVL: ${p.level} | GOLD: ${p.gold} | KILLS: ${p.kills}`,
      `INPUT: ${this.bridge.getActiveInputDevice()} | TOUCH_UI: ${this.bridge.isTouchOverlayVisible()}`,
      `HASH: ${hash}`,
    ].join('\n');
  }

  private makeBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = [
      'background:#1e293b',
      'color:#e2e8f0',
      'border:1px solid #475569',
      'padding:5px 6px',
      'font-family:inherit',
      'font-size:10px',
      'font-weight:700',
      'cursor:pointer',
      'text-align:center',
    ].join(';');
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
    return btn;
  }

  private readonly handleKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'F9') {
      ev.preventDefault();
      this.setVisible(!this.visible);
    }
  };
}
