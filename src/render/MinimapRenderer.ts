/**
 * KRUNKEDBONK — Crisp Retro-Framed 2D Minimap (110m) & Toggleable Full Map (400m)
 *
 * Pre-bakes a pixelated elevation-contour map from ITerrainSampler on map load, then renders
 * player directional arrow + FOV cone, shrines, chests, boss spawner/portal, pylons, spline rails,
 * jump pads, and nearby enemies/bosses with sleek mobile-responsive sizing (Portrait & Landscape!).
 */

import {
  FULLMAP_ORTHO_SIZE,
  MINIMAP_ORTHO_SIZE,
  type ITerrainSampler,
  type MapId,
  type SimState,
} from '../contracts/index';
import { drawPixelIcon, drawPixelText } from '../assets/PixelBitmapFont';

const TERRAIN_BAKE_RES = 128;
const MINIMAP_SIZE_DESKTOP = 164;
const MINIMAP_SIZE_MOBILE_PORTRAIT = 98;
const MINIMAP_SIZE_MOBILE_LANDSCAPE = 90;

function formatMapTitle(mapId: MapId): string {
  switch (mapId) {
    case 'Forest':
      return 'FOREST';
    case 'Desert':
      return 'DESERT';
    case 'Graveyard':
      return 'GRAVEYARD';
    case 'FinalBossMap':
      return 'CITADEL';
    default:
      return String(mapId).toUpperCase();
  }
}

export class MinimapRenderer {
  private readonly canvas: HTMLCanvasElement | null = null;
  private readonly ctx: CanvasRenderingContext2D | null = null;
  private readonly terrainCanvas: HTMLCanvasElement | null = null;

  private terrainWorldSpan = 320;
  private currentMapId: MapId = 'Forest';
  private visible = true;
  private fullMapOpen = false;
  private viewportW = 1280;
  private viewportH = 720;
  private dpr = 1;

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyM' && !e.repeat) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      this.fullMapOpen = !this.fullMapOpen;
      this.applyCanvasLayout();
    }
  };

  private readonly handleCanvasTap = (e: PointerEvent): void => {
    // Allow tapping the minimap directly on touch devices (or clicking when full map is open) to toggle
    if (e.pointerType === 'touch' || this.fullMapOpen) {
      e.stopPropagation();
      this.fullMapOpen = !this.fullMapOpen;
      this.applyCanvasLayout();
    }
  };

  constructor() {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.style.position = 'absolute';
      c.style.pointerEvents = 'auto';
      c.style.zIndex = '5';
      c.style.imageRendering = 'pixelated';
      c.style.borderRadius = '6px';
      c.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.55)';
      c.setAttribute('data-kb-minimap', 'true');
      this.canvas = c;
      this.ctx = c.getContext('2d');

      const tc = document.createElement('canvas');
      tc.width = TERRAIN_BAKE_RES;
      tc.height = TERRAIN_BAKE_RES;
      this.terrainCanvas = tc;
    }
  }

  public mount(container: HTMLElement): void {
    if (this.canvas && this.canvas.parentElement !== container) {
      container.appendChild(this.canvas);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
    }
    this.canvas?.addEventListener('pointerdown', this.handleCanvasTap);
    this.applyCanvasLayout();
  }

  public unmount(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    this.canvas?.removeEventListener('pointerdown', this.handleCanvasTap);
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }

  public resize(width: number, height: number, dpr = 1): void {
    this.viewportW = Math.max(320, Math.floor(width));
    this.viewportH = Math.max(240, Math.floor(height));
    this.dpr = Math.min(2, Math.max(1, dpr));
    this.applyCanvasLayout();
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.canvas) {
      this.canvas.style.display = visible || this.fullMapOpen ? 'block' : 'none';
    }
  }

  public setFullMapOpen(open: boolean): void {
    if (this.fullMapOpen === open) return;
    this.fullMapOpen = open;
    this.applyCanvasLayout();
  }

  public toggleFullMap(): boolean {
    this.fullMapOpen = !this.fullMapOpen;
    this.applyCanvasLayout();
    return this.fullMapOpen;
  }

  public isFullMapOpen(): boolean {
    return this.fullMapOpen;
  }

  private isMobileLandscape(): boolean {
    return this.viewportH <= 520;
  }

  private isMobilePortrait(): boolean {
    return this.viewportW <= 768 && this.viewportH > 520;
  }

  private getActiveDisplaySize(): number {
    if (this.fullMapOpen) {
      return Math.max(240, Math.min(500, Math.floor(Math.min(this.viewportW, this.viewportH) * 0.78)));
    }
    if (this.isMobileLandscape()) {
      return MINIMAP_SIZE_MOBILE_LANDSCAPE;
    }
    if (this.isMobilePortrait()) {
      return MINIMAP_SIZE_MOBILE_PORTRAIT;
    }
    return MINIMAP_SIZE_DESKTOP;
  }

  private applyCanvasLayout(): void {
    if (!this.canvas) return;
    const size = this.getActiveDisplaySize();
    this.canvas.style.display = this.visible || this.fullMapOpen ? 'block' : 'none';
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    if (this.fullMapOpen) {
      this.canvas.style.top = '50%';
      this.canvas.style.right = 'auto';
      this.canvas.style.left = '50%';
      this.canvas.style.transform = 'translate(-50%, -50%)';
      this.canvas.style.zIndex = '45';
    } else {
      const compact = this.isMobileLandscape() || this.isMobilePortrait();
      this.canvas.style.top = compact ? '16px' : '22px';
      this.canvas.style.right = compact ? '8px' : '14px';
      this.canvas.style.left = 'auto';
      this.canvas.style.transform = 'none';
      // Stay above WebGL/2D gameplay canvas (0..4) and below .kb-ui-root (20) so modals blur & cover cleanly
      this.canvas.style.zIndex = '15';
    }

    this.canvas.width = Math.floor(size * this.dpr);
    this.canvas.height = Math.floor(size * this.dpr);
  }

  /**
   * Pre-bakes crisp pixelated terrain contour tints into an offscreen 128x128 buffer once per map.
   */
  public bakeTerrain(mapId: MapId, terrain: ITerrainSampler): void {
    this.currentMapId = mapId;
    this.terrainWorldSpan = Math.max(320, terrain.arenaRadius * 2 + 24);
    if (!this.terrainCanvas) return;

    const tctx = this.terrainCanvas.getContext('2d');
    if (!tctx) return;

    const img = tctx.createImageData(TERRAIN_BAKE_RES, TERRAIN_BAKE_RES);
    const data = img.data;
    const halfSpan = this.terrainWorldSpan * 0.5;

    for (let py = 0; py < TERRAIN_BAKE_RES; py++) {
      const wz = -halfSpan + ((py + 0.5) / TERRAIN_BAKE_RES) * this.terrainWorldSpan;
      for (let px = 0; px < TERRAIN_BAKE_RES; px++) {
        const wx = -halfSpan + ((px + 0.5) / TERRAIN_BAKE_RES) * this.terrainWorldSpan;
        const s = terrain.sample(wx, wz);
        const idx = (py * TERRAIN_BAKE_RES + px) * 4;

        let r = 14;
        let g = 22;
        let b = 34;

        if (!s.inBounds || s.surfaceTag === 'void') {
          r = 11;
          g = 17;
          b = 27;
        } else {
          const tier = Math.max(0, Math.min(4, Math.floor((s.height + 1.5) / 4.5)));
          const isCliff = s.slopeAngleRad > 0.5;

          if (mapId === 'Desert') {
            if (isCliff) {
              r = 128; g = 74; b = 46;
            } else {
              r = 166 + tier * 18; g = 124 + tier * 15; b = 62 + tier * 9;
            }
          } else if (mapId === 'Graveyard') {
            if (isCliff) {
              r = 42; g = 46; b = 68;
            } else {
              r = 56 + tier * 10; g = 68 + tier * 10; b = 82 + tier * 12;
            }
          } else if (mapId === 'FinalBossMap') {
            if (isCliff) {
              r = 78; g = 34; b = 104;
            } else {
              r = 44 + tier * 12; g = 32 + tier * 10; b = 64 + tier * 14;
            }
          } else {
            if (isCliff) {
              r = 52; g = 88; b = 104;
            } else {
              r = 46 + tier * 18;
              g = 112 + tier * 24;
              b = 64 + tier * 8;
            }
          }
        }

        data[idx] = Math.min(255, r);
        data[idx + 1] = Math.min(255, g);
        data[idx + 2] = Math.min(255, b);
        data[idx + 3] = 255;
      }
    }

    tctx.putImageData(img, 0, 0);
  }

  public render(state: Readonly<SimState>): void {
    if (!this.canvas || !this.ctx) return;
    if (!this.visible && !this.fullMapOpen) return;
    if (
      state.phase === 'boot' ||
      state.phase === 'title' ||
      state.phase === 'character_select' ||
      state.phase === 'map_select' ||
      state.phase === 'shop' ||
      state.phase === 'quests' ||
      state.phase === 'settings' ||
      state.phase === 'victory' ||
      state.phase === 'game_over'
    ) {
      this.canvas.style.display = 'none';
      return;
    }
    this.canvas.style.display = 'block';

    const ctx = this.ctx;
    const size = this.getActiveDisplaySize();
    const isCompact = size <= 106;
    const isTouch =
      typeof document !== 'undefined' && document.body?.classList.contains('kb-touch-active');

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const pad = isCompact ? 4 : 6;
    const inner = size - pad * 2;
    const halfInner = inner * 0.5;
    const cx = size * 0.5;
    const cy = size * 0.5;

    // Sleek dark obsidian-slate beveled frame
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#253147';
    ctx.fillRect(2, 2, size - 4, size - 4);
    ctx.fillStyle = '#0b1320';
    ctx.fillRect(pad, pad, inner, inner);

    const viewWorldSpan = this.fullMapOpen ? FULLMAP_ORTHO_SIZE : MINIMAP_ORTHO_SIZE;
    const centerX = this.fullMapOpen ? 0 : state.player.pos.x;
    const centerZ = this.fullMapOpen ? 0 : state.player.pos.z;
    const scale = inner / viewWorldSpan;

    // Clip to inner map frame
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, inner, inner);
    ctx.clip();

    // 1. Blit pre-baked terrain contours
    if (this.terrainCanvas) {
      const mapLeft = cx + (-this.terrainWorldSpan * 0.5 - centerX) * scale;
      const mapTop = cy + (-this.terrainWorldSpan * 0.5 - centerZ) * scale;
      const mapDrawSize = this.terrainWorldSpan * scale;
      ctx.drawImage(this.terrainCanvas, mapLeft, mapTop, mapDrawSize, mapDrawSize);
    }

    // Subtle radar crosshair + range circle
    ctx.strokeStyle = 'rgba(180, 235, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, pad);
    ctx.lineTo(cx, size - pad);
    ctx.moveTo(pad, cy);
    ctx.lineTo(size - pad, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, inner * 0.34, 0, Math.PI * 2);
    ctx.stroke();

    const toScreenX = (wx: number) => cx + (wx - centerX) * scale;
    const toScreenY = (wz: number) => cy + (wz - centerZ) * scale;

    // 2. Spline Rails
    const rails = state.rails;
    if (rails.length > 0) {
      ctx.strokeStyle = '#5cf7ff';
      ctx.lineWidth = this.fullMapOpen ? 2.5 : isCompact ? 1.5 : 2;
      for (let i = 0; i < rails.length; i++) {
        const pts = rails[i]!.points;
        if (pts.length < 2) continue;
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
          const sx = toScreenX(pts[k]!.x);
          const sy = toScreenY(pts[k]!.z);
          if (k === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
    }

    // 3. Jump Pads
    const pads = state.jumpPads;
    ctx.strokeStyle = '#4df5ff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < pads.length; i++) {
      const jp = pads[i]!;
      const sx = toScreenX(jp.pos.x);
      const sy = toScreenY(jp.pos.z);
      if (Math.abs(sx - cx) > halfInner + 10 || Math.abs(sy - cy) > halfInner + 10) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, isCompact ? 2.4 : 3.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    const iconPx = this.fullMapOpen ? 2 : isCompact ? 1 : 1.5;

    // 4. Interactables
    const interactables = state.interactables;
    for (let i = 0; i < interactables.length; i++) {
      const it = interactables[i]!;
      if (it.kind === 'Pot') continue;
      const sx = toScreenX(it.pos.x);
      const sy = toScreenY(it.pos.z);
      if (Math.abs(sx - cx) > halfInner + 12 || Math.abs(sy - cy) > halfInner + 12) continue;

      if (it.kind === 'BossSpawner') {
        drawPixelIcon(ctx, 'skull', sx, sy, iconPx, it.used ? '#6e7b8f' : '#ff385c');
      } else if (it.kind === 'ChargeShrine') {
        const col = it.used ? '#526275' : it.variant === 'golden' ? '#ffe45e' : '#4df5ff';
        drawPixelIcon(ctx, 'shrine', sx, sy, iconPx, col);
      } else if (it.kind === 'Chest') {
        if (!it.used) {
          drawPixelIcon(ctx, 'chest', sx, sy, iconPx, it.variant === 'golden' ? '#ffe45e' : '#f59e0b');
        }
      } else if (it.kind === 'ShadyGuy' && !it.used) {
        drawPixelIcon(ctx, 'shop', sx, sy, iconPx, '#c084fc');
      } else if (it.kind === 'Microwave' && !it.used) {
        drawPixelIcon(ctx, 'microwave', sx, sy, iconPx, '#38f2ff');
      } else if (it.kind === 'ShrineMoai' && !it.used) {
        drawPixelIcon(ctx, 'moai', sx, sy, iconPx, '#cbd5e1');
      } else if (!it.used) {
        ctx.fillStyle = '#080a10';
        ctx.fillRect(Math.round(sx - 3), Math.round(sy - 3), 6, 6);
        ctx.fillStyle = '#70f5ff';
        ctx.fillRect(Math.round(sx - 2), Math.round(sy - 2), 4, 4);
      }
    }

    // 5. Boss Portal, Boss Pylons & Darkness Lamps
    if (state.bossPortalOpen && state.bossPortalPos) {
      const px = toScreenX(state.bossPortalPos.x);
      const py = toScreenY(state.bossPortalPos.z);
      drawPixelIcon(ctx, 'portal', px, py, Math.max(1.5, iconPx), '#d946ef');
    }

    const pylons = state.pylons;
    for (let i = 0; i < pylons.length; i++) {
      const py = pylons[i]!;
      const sx = toScreenX(py.pos.x);
      const sy = toScreenY(py.pos.z);
      const pCol = py.cleansed ? '#4dff9e' : py.stolenWeaponId ? '#ffe45e' : '#ff2ec4';
      drawPixelIcon(ctx, 'star', sx, sy, py.stolenWeaponId && !py.cleansed ? Math.max(1.5, iconPx) : iconPx, pCol);
    }

    const lamps = state.darknessLamps;
    for (let i = 0; i < lamps.length; i++) {
      const lamp = lamps[i]!;
      const sx = toScreenX(lamp.pos.x);
      const sy = toScreenY(lamp.pos.z);
      if (Math.abs(sx - cx) > halfInner + 10 || Math.abs(sy - cy) > halfInner + 10) continue;
      drawPixelIcon(ctx, 'lamp', sx, sy, iconPx, lamp.lit ? '#ffe45e' : '#7c6a99');
    }

    // 6. Nearby Enemies & Bosses
    const enemies = state.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      const sx = toScreenX(e.pos.x);
      const sy = toScreenY(e.pos.z);
      if (Math.abs(sx - cx) > halfInner + 6 || Math.abs(sy - cy) > halfInner + 6) continue;

      if (e.isBoss || e.role === 'final_swarm') {
        drawPixelIcon(ctx, 'skull', sx, sy, Math.max(1.5, iconPx), '#ff2644');
      } else if (e.isElite || e.role === 'miniboss') {
        ctx.fillStyle = '#080a10';
        ctx.fillRect(Math.round(sx - 3.5), Math.round(sy - 3.5), 7, 7);
        ctx.fillStyle = '#ffb703';
        ctx.fillRect(Math.round(sx - 2.5), Math.round(sy - 2.5), 5, 5);
      } else {
        ctx.fillStyle = '#ff5768';
        ctx.fillRect(Math.round(sx - 1.5), Math.round(sy - 1.5), 3, 3);
      }
    }

    // 7. Player Vision FOV Cone + Directional Arrow
    const plx = toScreenX(state.player.pos.x);
    const ply = toScreenY(state.player.pos.z);
    ctx.save();
    ctx.translate(plx, ply);
    ctx.rotate(-state.player.yaw);

    // Subtle forward FOV cone
    const coneLen = isCompact ? 16 : 24;
    ctx.fillStyle = 'rgba(255, 245, 196, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-coneLen * 0.58, -coneLen);
    ctx.lineTo(coneLen * 0.58, -coneLen);
    ctx.closePath();
    ctx.fill();

    const arrSc = isCompact ? 0.8 : 1.0;
    ctx.fillStyle = '#080a10';
    ctx.beginPath();
    ctx.moveTo(0, -8 * arrSc);
    ctx.lineTo(6.5 * arrSc, 6.5 * arrSc);
    ctx.lineTo(0, 3.2 * arrSc);
    ctx.lineTo(-6.5 * arrSc, 6.5 * arrSc);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff9d6';
    ctx.beginPath();
    ctx.moveTo(0, -6 * arrSc);
    ctx.lineTo(4.5 * arrSc, 4.5 * arrSc);
    ctx.lineTo(0, 2.0 * arrSc);
    ctx.lineTo(-4.5 * arrSc, 4.5 * arrSc);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Soft inner edge shade inside map
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 4;
    ctx.strokeRect(pad + 1, pad + 1, inner - 2, inner - 2);

    ctx.restore();

    // 8. Golden corner brackets & clean header label
    ctx.fillStyle = '#f5c542';
    const b = isCompact ? 7 : 10;
    ctx.fillRect(2, 2, b, 2);
    ctx.fillRect(2, 2, 2, b);
    ctx.fillRect(size - 2 - b, 2, b, 2);
    ctx.fillRect(size - 4, 2, 2, b);
    ctx.fillRect(2, size - 4, b, 2);
    ctx.fillRect(2, size - 2 - b, 2, b);
    ctx.fillRect(size - 2 - b, size - 4, b, 2);
    ctx.fillRect(size - 4, size - 2 - b, 2, b);

    const mapName = formatMapTitle(this.currentMapId);
    const headerLabel = this.fullMapOpen
      ? `${mapName} MAP${isTouch ? ' (TAP)' : ' [M]'}`
      : mapName;
    drawPixelText(ctx, headerLabel, cx, isCompact ? 10 : 13, {
      pixelSize: this.fullMapOpen ? 2 : 1,
      color: '#fff4c2',
      outlineColor: '#080a10',
      outlinePx: 1,
      shadowOffsetPx: 0,
    });

    if (!this.fullMapOpen && !isCompact) {
      drawPixelText(ctx, isTouch ? 'TAP MAP' : '[M] MAP', size - 10, size - 11, {
        pixelSize: 1,
        color: '#a8d5e5',
        outlineColor: '#080a10',
        align: 'right',
        outlinePx: 1,
        shadowOffsetPx: 0,
      });
    }
  }
}
