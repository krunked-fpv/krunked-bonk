/**
 * KRUNKEDBONK — Circular N/E/S/W Compass Radar Minimap (110m) & Toggleable Full Map (400m)
 *
 * Renders an authentic retro-arcade circular compass radar in the top-right corner:
 * - Circular clipped dark-navy radar with metallic iron/stone bezel
 * - Rotating N / E / S / W compass letters hugging the circular rim live with camera heading
 * - Subtle relief terrain backdrop, crisp cobalt-blue center player arrow, green/gold
 *   diamond objective pins (shrines, chests, boss spawner, portals, pylons, lamps)
 * - Tap or press [M] to toggle the full 400m north-up arena map!
 */

import {
  FULLMAP_ORTHO_SIZE,
  MINIMAP_ORTHO_SIZE,
  type ITerrainSampler,
  type MapId,
  type SimState,
} from '../contracts/index';
import { drawPixelIcon, drawPixelText } from '../assets/PixelBitmapFont';

const TERRAIN_BAKE_RES = 144;
const MINIMAP_SIZE_DESKTOP = 158;
const MINIMAP_SIZE_MOBILE_PORTRAIT = 96;
const MINIMAP_SIZE_MOBILE_LANDSCAPE = 88;

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
      c.style.zIndex = '15';
      c.style.imageRendering = 'auto';
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
      this.canvas.style.borderRadius = '4px';
      this.canvas.style.boxShadow = '0 14px 36px rgba(0, 0, 0, 0.85)';
      this.canvas.style.zIndex = '45';
    } else {
      const compact = this.isMobileLandscape() || this.isMobilePortrait();
      // On desktop, leave crisp 34px headroom above circular compass for the bold "LVL 1" stamp!
      this.canvas.style.top = compact ? '14px' : '38px';
      this.canvas.style.right = compact ? '8px' : '14px';
      this.canvas.style.left = 'auto';
      this.canvas.style.transform = 'none';
      this.canvas.style.borderRadius = '50%';
      this.canvas.style.boxShadow = 'none';
      this.canvas.style.zIndex = '15';
    }

    this.canvas.width = Math.floor(size * this.dpr);
    this.canvas.height = Math.floor(size * this.dpr);
  }

  public bakeTerrain(mapId: MapId, terrain: ITerrainSampler): void {
    this.currentMapId = mapId;
    this.terrainWorldSpan = Math.max(320, terrain.arenaRadius * 2 + 24);
    if (!this.terrainCanvas) return;

    const tctx = this.terrainCanvas.getContext('2d');
    if (!tctx) return;

    const img = tctx.createImageData(TERRAIN_BAKE_RES, TERRAIN_BAKE_RES);
    const data = img.data;
    const halfSpan = this.terrainWorldSpan * 0.5;
    const heights = new Float32Array(TERRAIN_BAKE_RES * TERRAIN_BAKE_RES);
    const inBoundsArr = new Uint8Array(TERRAIN_BAKE_RES * TERRAIN_BAKE_RES);
    const slopeArr = new Float32Array(TERRAIN_BAKE_RES * TERRAIN_BAKE_RES);

    for (let py = 0; py < TERRAIN_BAKE_RES; py++) {
      const wz = -halfSpan + ((py + 0.5) / TERRAIN_BAKE_RES) * this.terrainWorldSpan;
      for (let px = 0; px < TERRAIN_BAKE_RES; px++) {
        const wx = -halfSpan + ((px + 0.5) / TERRAIN_BAKE_RES) * this.terrainWorldSpan;
        const s = terrain.sample(wx, wz);
        const i = py * TERRAIN_BAKE_RES + px;
        heights[i] = s.height;
        inBoundsArr[i] = s.inBounds && s.surfaceTag !== 'void' ? 1 : 0;
        slopeArr[i] = s.slopeAngleRad;
      }
    }

    for (let py = 0; py < TERRAIN_BAKE_RES; py++) {
      for (let px = 0; px < TERRAIN_BAKE_RES; px++) {
        const i = py * TERRAIN_BAKE_RES + px;
        const idx = i * 4;

        let r = 8;
        let g = 14;
        let b = 26;

        if (inBoundsArr[i]) {
          const h = heights[i]!;
          const tier = Math.max(0, Math.min(4, Math.floor((h + 1.5) / 4.2)));
          const isCliff = slopeArr[i]! > 0.48;

          const hL = heights[py * TERRAIN_BAKE_RES + Math.max(0, px - 1)]!;
          const hR = heights[py * TERRAIN_BAKE_RES + Math.min(TERRAIN_BAKE_RES - 1, px + 1)]!;
          const hU = heights[Math.max(0, py - 1) * TERRAIN_BAKE_RES + px]!;
          const hD = heights[Math.min(TERRAIN_BAKE_RES - 1, py + 1) * TERRAIN_BAKE_RES + px]!;
          const shade = Math.max(-0.22, Math.min(0.24, ((hL - hR) + (hU - hD)) * 0.14));

          if (mapId === 'Desert') {
            r = isCliff ? 86 : 112 + tier * 14;
            g = isCliff ? 64 : 84 + tier * 11;
            b = isCliff ? 46 : 52 + tier * 7;
          } else if (mapId === 'Graveyard') {
            r = isCliff ? 36 : 44 + tier * 9;
            g = isCliff ? 38 : 48 + tier * 9;
            b = isCliff ? 62 : 70 + tier * 11;
          } else if (mapId === 'FinalBossMap') {
            r = isCliff ? 72 : 96 + tier * 10;
            g = isCliff ? 36 : 54 + tier * 8;
            b = isCliff ? 32 : 42 + tier * 6;
          } else {
            r = isCliff ? 48 : 34 + tier * 10;
            g = isCliff ? 62 : 66 + tier * 13;
            b = isCliff ? 68 : 44 + tier * 8;
          }
          const mult = 1.0 + shade;
          r *= mult;
          g *= mult;
          b *= mult;
        }

        data[idx] = Math.max(0, Math.min(255, Math.round(r)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
        data[idx + 3] = 255;
      }
    }

    tctx.putImageData(img, 0, 0);
  }

  private drawDiamondPin(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    fillHex: string,
    innerDot?: string,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fillStyle = fillHex;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#07090e';
    ctx.stroke();
    if (innerDot) {
      ctx.fillStyle = innerDot;
      ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    }
    ctx.restore();
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
    const isCompact = size <= 104;
    const isTouch =
      typeof document !== 'undefined' && document.body?.classList.contains('kb-touch-active');

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size * 0.5;
    const cy = size * 0.5;

    if (this.fullMapOpen) {
      this.renderFullSquareMap(ctx, state, size, cx, cy, isTouch);
      return;
    }

    // =========================================================================
    // CIRCULAR ROTATING N/E/S/W COMPASS RADAR MINIMAP!
    // =========================================================================
    const rimPad = isCompact ? 7 : 10;
    const radarR = size * 0.5 - rimPad;
    const viewWorldSpan = MINIMAP_ORTHO_SIZE;
    const scale = (radarR * 2) / viewWorldSpan;
    const centerX = state.player.pos.x;
    const centerZ = state.player.pos.z;
    const headingRot = state.player.yaw; // Rotate world so forward is UP!

    // 1. Dark circular radar interior
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radarR, 0, Math.PI * 2);
    ctx.clip();

    const bgGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, radarR);
    bgGrad.addColorStop(0, '#132238');
    bgGrad.addColorStop(0.75, '#0b1424');
    bgGrad.addColorStop(1, '#060b14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle rotated terrain relief backdrop
    if (this.terrainCanvas) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(headingRot);
      ctx.globalAlpha = 0.36;
      const mapLeft = (-this.terrainWorldSpan * 0.5 - centerX) * scale;
      const mapTop = (-this.terrainWorldSpan * 0.5 - centerZ) * scale;
      const mapDrawSize = this.terrainWorldSpan * scale;
      ctx.drawImage(this.terrainCanvas, mapLeft, mapTop, mapDrawSize, mapDrawSize);
      ctx.restore();
    }

    // Subtle radar inner ring & crosshair ticks
    ctx.strokeStyle = 'rgba(180, 210, 240, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radarR * 0.52, 0, Math.PI * 2);
    ctx.stroke();

    const cosH = Math.cos(headingRot);
    const sinH = Math.sin(headingRot);
    const projectRadar = (wx: number, wz: number): [number, number] => {
      const dx = (wx - centerX) * scale;
      const dz = (wz - centerZ) * scale;
      return [cx + dx * cosH - dz * sinH, cy + dx * sinH + dz * cosH];
    };

    // Rails
    const rails = state.rails;
    if (rails.length > 0) {
      ctx.strokeStyle = 'rgba(92, 247, 255, 0.72)';
      ctx.lineWidth = isCompact ? 1.5 : 2;
      for (let i = 0; i < rails.length; i++) {
        const pts = rails[i]!.points;
        if (pts.length < 2) continue;
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
          const [sx, sy] = projectRadar(pts[k]!.x, pts[k]!.z);
          if (k === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
    }

    // Jump Pads
    ctx.strokeStyle = '#38e8ff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < state.jumpPads.length; i++) {
      const jp = state.jumpPads[i]!;
      const [sx, sy] = projectRadar(jp.pos.x, jp.pos.z);
      if (Math.hypot(sx - cx, sy - cy) > radarR - 2) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, isCompact ? 2.2 : 3.0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Interactables (vivid emerald-green diamonds for shrines, warm amber/gold diamonds for chests, crimson skull for Boss Spawner!)
    const pinR = isCompact ? 3.8 : 5.2;
    for (let i = 0; i < state.interactables.length; i++) {
      const it = state.interactables[i]!;
      if (it.kind === 'Pot') continue;
      let [sx, sy] = projectRadar(it.pos.x, it.pos.z);
      const dist = Math.hypot(sx - cx, sy - cy);
      if (it.kind === 'BossSpawner' && !it.used && dist > radarR - 7) {
        // Clamp active boss spawner pin cleanly to radar rim so player can always navigate to it!
        const ang = Math.atan2(sy - cy, sx - cx);
        sx = cx + Math.cos(ang) * (radarR - 7);
        sy = cy + Math.sin(ang) * (radarR - 7);
      } else if (dist > radarR - 3) {
        continue;
      }

      if (it.kind === 'BossSpawner') {
        drawPixelIcon(ctx, 'skull', sx, sy, isCompact ? 1.2 : 1.6, it.used ? '#64748b' : '#ff334b');
      } else if (it.kind === 'ChargeShrine') {
        if (!it.used) {
          this.drawDiamondPin(ctx, sx, sy, pinR, it.variant === 'golden' ? '#fbbf24' : '#22c55e', '#e8ffe8');
        }
      } else if (it.kind === 'Chest' && !it.used) {
        this.drawDiamondPin(ctx, sx, sy, pinR * 0.85, '#f59e0b', '#fff5cc');
      } else if (!it.used) {
        this.drawDiamondPin(ctx, sx, sy, pinR * 0.8, '#38bdf8');
      }
    }

    // Boss Portal, Boss Pylons & Darkness Lamps
    if (state.bossPortalOpen && state.bossPortalPos) {
      let [px, py] = projectRadar(state.bossPortalPos.x, state.bossPortalPos.z);
      const d = Math.hypot(px - cx, py - cy);
      if (d > radarR - 7) {
        const ang = Math.atan2(py - cy, px - cx);
        px = cx + Math.cos(ang) * (radarR - 7);
        py = cy + Math.sin(ang) * (radarR - 7);
      }
      drawPixelIcon(ctx, 'portal', px, py, isCompact ? 1.2 : 1.7, '#d946ef');
    }

    for (let i = 0; i < state.pylons.length; i++) {
      const py = state.pylons[i]!;
      const [sx, sy] = projectRadar(py.pos.x, py.pos.z);
      if (Math.hypot(sx - cx, sy - cy) > radarR - 3) continue;
      this.drawDiamondPin(
        ctx,
        sx,
        sy,
        pinR * 0.9,
        py.cleansed ? '#4ade80' : py.stolenWeaponId ? '#facc15' : '#e879f9',
      );
    }

    for (let i = 0; i < state.darknessLamps.length; i++) {
      const lamp = state.darknessLamps[i]!;
      const [sx, sy] = projectRadar(lamp.pos.x, lamp.pos.z);
      if (Math.hypot(sx - cx, sy - cy) > radarR - 3) continue;
      this.drawDiamondPin(ctx, sx, sy, pinR * 0.85, lamp.lit ? '#fde047' : '#8b7aad');
    }

    // Nearby Enemies & Active Bosses
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      let [sx, sy] = projectRadar(e.pos.x, e.pos.z);
      const dist = Math.hypot(sx - cx, sy - cy);
      if (e.isBoss || e.role === 'final_swarm') {
        if (dist > radarR - 7) {
          const ang = Math.atan2(sy - cy, sx - cx);
          sx = cx + Math.cos(ang) * (radarR - 7);
          sy = cy + Math.sin(ang) * (radarR - 7);
        }
        drawPixelIcon(ctx, 'skull', sx, sy, isCompact ? 1.2 : 1.7, '#ff2644');
      } else if (dist <= radarR - 3) {
        ctx.fillStyle = e.isElite || e.role === 'miniboss' ? '#facc15' : 'rgba(255, 76, 94, 0.88)';
        const dotR = e.isElite || e.role === 'miniboss' ? 2.8 : 1.7;
        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Crisp cobalt-blue Player Center Arrow pointing forward (UP!)
    const arrSc = isCompact ? 0.82 : 1.05;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -8.5 * arrSc);
    ctx.lineTo(6.0 * arrSc, 6.5 * arrSc);
    ctx.lineTo(0, 3.0 * arrSc);
    ctx.lineTo(-6.0 * arrSc, 6.5 * arrSc);
    ctx.closePath();
    ctx.fillStyle = '#1e90ff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#05080f';
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // End circular radar clip

    // 2. Crisp Metallic Stone-Iron Circular Rim Bezel!
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radarR + 1.5, 0, Math.PI * 2);
    ctx.lineWidth = isCompact ? 3.5 : 4.5;
    ctx.strokeStyle = '#080a0f';
    ctx.stroke();

    const bezelGrad = ctx.createLinearGradient(0, 0, size, size);
    bezelGrad.addColorStop(0, '#c4b8a3');
    bezelGrad.addColorStop(0.45, '#7c7468');
    bezelGrad.addColorStop(1, '#9e9380');
    ctx.beginPath();
    ctx.arc(cx, cy, radarR + 1.5, 0, Math.PI * 2);
    ctx.lineWidth = isCompact ? 2.0 : 2.5;
    ctx.strokeStyle = bezelGrad;
    ctx.stroke();

    // 3. Rotating Bold Black-Outlined N / E / S / W Compass Letters RIGHT ON THE RIM!
    const cardinals: Array<{ label: string; angle: number }> = [
      { label: 'N', angle: -Math.PI * 0.5 + headingRot },
      { label: 'E', angle: 0 + headingRot },
      { label: 'S', angle: Math.PI * 0.5 + headingRot },
      { label: 'W', angle: Math.PI + headingRot },
    ];
    const letterR = radarR + (isCompact ? 2.0 : 2.5);
    const fontPx = isCompact ? 10 : 12;
    ctx.font = `900 ${fontPx}px "Palatino Linotype", "Book Antiqua", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#07090e';

    for (let i = 0; i < cardinals.length; i++) {
      const c = cardinals[i]!;
      const lx = cx + Math.cos(c.angle) * letterR;
      const ly = cy + Math.sin(c.angle) * letterR;
      ctx.strokeText(c.label, lx, ly);
      ctx.fillStyle = c.label === 'N' ? '#fde68a' : '#f8fafc';
      ctx.fillText(c.label, lx, ly);
    }
    ctx.restore();
  }

  private renderFullSquareMap(
    ctx: CanvasRenderingContext2D,
    state: Readonly<SimState>,
    size: number,
    cx: number,
    cy: number,
    isTouch: boolean,
  ): void {
    const pad = 8;
    const inner = size - pad * 2;
    const scale = inner / FULLMAP_ORTHO_SIZE;

    ctx.fillStyle = '#090c12';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#9e9380';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, size - 4, size - 4);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, inner, inner);
    ctx.clip();

    if (this.terrainCanvas) {
      const mapLeft = cx - this.terrainWorldSpan * 0.5 * scale;
      const mapTop = cy - this.terrainWorldSpan * 0.5 * scale;
      ctx.drawImage(this.terrainCanvas, mapLeft, mapTop, this.terrainWorldSpan * scale, this.terrainWorldSpan * scale);
    }

    const toX = (wx: number) => cx + wx * scale;
    const toY = (wz: number) => cy + wz * scale;

    for (let i = 0; i < state.interactables.length; i++) {
      const it = state.interactables[i]!;
      if (it.kind === 'Pot') continue;
      const sx = toX(it.pos.x);
      const sy = toY(it.pos.z);
      if (it.kind === 'BossSpawner') {
        drawPixelIcon(ctx, 'skull', sx, sy, 2, it.used ? '#64748b' : '#ff334b');
      } else if (it.kind === 'ChargeShrine' && !it.used) {
        this.drawDiamondPin(ctx, sx, sy, 6, it.variant === 'golden' ? '#fbbf24' : '#22c55e', '#e8ffe8');
      } else if (it.kind === 'Chest' && !it.used) {
        this.drawDiamondPin(ctx, sx, sy, 5, '#f59e0b', '#fff5cc');
      }
    }

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      const sx = toX(e.pos.x);
      const sy = toY(e.pos.z);
      if (e.isBoss) {
        drawPixelIcon(ctx, 'skull', sx, sy, 2, '#ff2644');
      } else {
        ctx.fillStyle = '#ff495c';
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      }
    }

    // Player arrow
    ctx.save();
    ctx.translate(toX(state.player.pos.x), toY(state.player.pos.z));
    ctx.rotate(-state.player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#1e90ff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#05080f';
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    const headerLabel = `${formatMapTitle(this.currentMapId)} MAP${isTouch ? ' (TAP)' : ' [M]'}`;
    ctx.fillStyle = 'rgba(9, 12, 18, 0.86)';
    ctx.fillRect(cx - 115, pad + 6, 230, 24);
    drawPixelText(ctx, headerLabel, cx, pad + 18, {
      pixelSize: 2,
      color: '#f8fafc',
      outlineColor: '#05080f',
      outlinePx: 1,
      shadowOffsetPx: 0,
    });
  }
}
