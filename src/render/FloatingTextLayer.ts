/**
 * KRUNKEDBONK — Zero-GC 2D Arcade Overlay: Floating Damage Numbers, Elite HP Bars,
 * Off-Screen Boss/Portal Indicators & Screen-Edge Kinetic Feedback (Speed Lines / Vignette)
 *
 * Renders directly onto an aligned 2D overlay canvas with zero DOM churn:
 * - Clean, readable, de-overlapped damage numbers scaled gracefully for desktop & mobile
 * - Projected overhead HP bars above wounded elites & minibosses
 * - Off-screen directional edge arrows for active Bosses & open Boss Portals
 * - Subtle atmospheric depth vignette, high-speed kinetic streaks (>14.5 m/s),
 *   damage-hit / low-HP crimson pulse, and level-up golden flash
 */

import * as THREE from 'three';
import type { ElementType, SimEvent, SimState } from '../contracts/index';
import { drawPixelIcon } from '../assets/PixelBitmapFont';

const MAX_FLOATING_TEXTS = 96;
const MAX_RENDERED_TEXTS = 18;

interface FloatingEntry {
  active: boolean;
  text: string;
  wx: number;
  wy: number;
  wz: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  pixelSize: number;
  colorTop: string;
  colorBottom: string;
  shakeAmp: number;
  priority: number;
}

const ELEMENT_COLORS: Record<ElementType, [string, string]> = {
  Physical: ['#ffffff', '#dce6f5'],
  Fire: ['#ffe07d', '#ff6b2b'],
  Ice: ['#e0fcff', '#4ce6ff'],
  Lightning: ['#fff9a6', '#ffd23f'],
  Poison: ['#d8ff9e', '#52e05a'],
  Void: ['#f2c2ff', '#b94dff'],
  Holy: ['#ffffff', '#ffe875'],
};

export class FloatingTextLayer {
  private readonly canvas: HTMLCanvasElement | null = null;
  private readonly ctx: CanvasRenderingContext2D | null = null;
  private readonly pool: FloatingEntry[] = [];
  private cursor = 0;

  private width = 1280;
  private height = 720;
  private dpr = 1;
  private enabled = true;
  private wasClearedWhenDisabled = true;
  private jitterSeed = 0x1a2b3c4d;

  // Screen-edge feedback timers
  private hurtFlash = 0;
  private levelFlash = 0;
  private speedLinesAlpha = 0;
  private clockSec = 0;

  // Pre-allocated scratch Vector3 & screen-space de-overlap buffers (ZERO per-frame allocs)
  private readonly _proj = new THREE.Vector3();
  private readonly _camFwd = new THREE.Vector3();
  private readonly _camRight = new THREE.Vector3();
  private readonly _camUp = new THREE.Vector3();
  private readonly _toTarget = new THREE.Vector3();
  private readonly placedX = new Float32Array(MAX_FLOATING_TEXTS);
  private readonly placedY = new Float32Array(MAX_FLOATING_TEXTS);
  private readonly placedW = new Float32Array(MAX_FLOATING_TEXTS);
  private readonly placedH = new Float32Array(MAX_FLOATING_TEXTS);
  private readonly activeIndices = new Int32Array(MAX_FLOATING_TEXTS);

  constructor() {
    for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
      this.pool.push({
        active: false,
        text: '',
        wx: 0,
        wy: 0,
        wz: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 0.7,
        pixelSize: 2,
        colorTop: '#ffffff',
        colorBottom: '#dce6f5',
        shakeAmp: 0,
        priority: 0,
      });
    }

    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.style.position = 'absolute';
      c.style.inset = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.pointerEvents = 'none';
      c.style.zIndex = '4';
      this.canvas = c;
      this.ctx = c.getContext('2d');
    }
  }

  public mount(container: HTMLElement): void {
    if (this.canvas && this.canvas.parentElement !== container) {
      container.appendChild(this.canvas);
    }
  }

  public unmount(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.clear();
  }

  public resize(width: number, height: number, dpr = 1): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.dpr = Math.min(2, Math.max(1, dpr));
    if (this.canvas) {
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.wasClearedWhenDisabled = false;
    }
  }

  public clear(): void {
    for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
      this.pool[i]!.active = false;
    }
    this.hurtFlash = 0;
    this.levelFlash = 0;
    this.speedLinesAlpha = 0;
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private nextJitter(): number {
    let x = this.jitterSeed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.jitterSeed = x >>> 0;
    return (this.jitterSeed / 4294967296) * 2 - 1;
  }

  private countActiveLowPriority(): number {
    let n = 0;
    for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
      const p = this.pool[i]!;
      if (p.active && p.priority <= 1) n++;
    }
    return n;
  }

  private spawn(
    text: string,
    x: number,
    y: number,
    z: number,
    pixelSize: number,
    colorTop: string,
    colorBottom: string,
    maxAge: number,
    vy: number,
    shakeAmp: number,
    priority: number,
  ): void {
    // Keep dense swarms clean and readable by capping excess normal-hit spam
    if (priority <= 1 && this.countActiveLowPriority() >= 12) {
      return;
    }

    // Deduplicate rapid consecutive LEVEL UP callouts by refreshing the existing banner entry
    if (priority === 4 && text.startsWith('LEVEL UP')) {
      for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
        const cur = this.pool[i]!;
        if (cur.active && cur.text.startsWith('LEVEL UP')) {
          cur.text = text;
          cur.wx = x;
          cur.wy = y;
          cur.wz = z;
          cur.age = 0;
          cur.maxAge = maxAge;
          return;
        }
      }
    }

    let slot = this.pool[this.cursor]!;
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = this.pool[(this.cursor + attempt) % MAX_FLOATING_TEXTS]!;
      if (!candidate.active || candidate.priority <= priority) {
        slot = candidate;
        this.cursor = (this.cursor + attempt + 1) % MAX_FLOATING_TEXTS;
        break;
      }
    }

    slot.active = true;
    slot.text = text;
    slot.wx = x + this.nextJitter() * 1.15;
    slot.wy = y + this.nextJitter() * 0.35;
    slot.wz = z + this.nextJitter() * 1.15;
    slot.vx = this.nextJitter() * 2.5;
    slot.vy = vy;
    slot.vz = this.nextJitter() * 2.5;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.pixelSize = pixelSize;
    slot.colorTop = colorTop;
    slot.colorBottom = colorBottom;
    slot.shakeAmp = shakeAmp;
    slot.priority = priority;
  }

  public consumeEvents(events: readonly SimEvent[]): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.type === 'player_hurt') {
        this.hurtFlash = Math.min(1, this.hurtFlash + 0.72);
      } else if (ev.type === 'player_level_up') {
        this.levelFlash = 0.85;
      }

      if (!this.enabled) continue;

      switch (ev.type) {
        case 'damage_dealt': {
          const dmg = Math.max(1, Math.round(ev.amount));
          if (ev.isBonker) {
            this.spawn(
              `BONK ${dmg}!`,
              ev.pos.x,
              ev.pos.y + 2.35,
              ev.pos.z,
              21,
              '#ff85f2',
              '#ffd84d',
              0.92,
              2.9,
              2.6,
              4,
            );
          } else if (ev.isMegacrit) {
            this.spawn(
              `★${dmg}!`,
              ev.pos.x,
              ev.pos.y + 2.05,
              ev.pos.z,
              18,
              '#fff08a',
              '#ff5b36',
              0.78,
              2.55,
              1.4,
              3,
            );
          } else if (ev.isExecute) {
            this.spawn(
              `EXEC ${dmg}`,
              ev.pos.x,
              ev.pos.y + 1.95,
              ev.pos.z,
              17,
              '#ffb3c1',
              '#ff2448',
              0.76,
              2.4,
              1.1,
              3,
            );
          } else if (ev.critTier >= 1) {
            this.spawn(
              `${dmg}!`,
              ev.pos.x,
              ev.pos.y + 1.65,
              ev.pos.z,
              15.5,
              '#fff7ad',
              '#ffb703',
              0.66,
              2.2,
              0.5,
              2,
            );
          } else {
            const cols = ELEMENT_COLORS[ev.element] ?? ELEMENT_COLORS.Physical;
            this.spawn(
              `${dmg}`,
              ev.pos.x,
              ev.pos.y + 1.45,
              ev.pos.z,
              12.5,
              cols[0],
              cols[1],
              0.52,
              1.95,
              0,
              1,
            );
          }
          break;
        }

        case 'player_level_up':
          this.spawn(
            `LEVEL UP! LV.${ev.level}`,
            ev.pos.x,
            ev.pos.y + 3.5,
            ev.pos.z,
            20,
            '#ffffff',
            '#38f2ff',
            1.1,
            2.1,
            1.0,
            4,
          );
          break;

        case 'player_heal': {
          const amt = Math.round(ev.amount);
          if (amt >= 1) {
            this.spawn(
              `+${amt} HP`,
              ev.pos.x,
              ev.pos.y + 2.4,
              ev.pos.z,
              14,
              '#c9ff9e',
              '#34eb64',
              0.7,
              1.95,
              0,
              2,
            );
          }
          break;
        }

        case 'player_dodge':
          this.spawn(
            'DODGE!',
            ev.pos.x,
            ev.pos.y + 2.5,
            ev.pos.z,
            14,
            '#ffffff',
            '#62e8ff',
            0.66,
            2.0,
            0,
            2,
          );
          break;

        case 'player_jump':
          if (ev.isBhop && ev.streak >= 2) {
            this.spawn(
              `BHOP x${ev.streak}`,
              ev.pos.x,
              ev.pos.y + 2.3,
              ev.pos.z,
              14.5,
              '#fff4a3',
              '#ffae19',
              0.64,
              2.0,
              0,
              2,
            );
          }
          break;

        case 'pylon_charged':
          this.spawn(
            `PYLON ${ev.cleansedCount}/${ev.totalPylons}!`,
            ev.pos.x,
            ev.pos.y + 4.5,
            ev.pos.z,
            19,
            '#a6ffcb',
            '#34eb64',
            1.05,
            2.1,
            0.9,
            4,
          );
          break;

        default:
          break;
      }
    }
  }

  public render(camera: THREE.Camera, dtSec: number, state?: Readonly<SimState>): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const dt = Math.min(0.05, Math.max(0, dtSec));
    this.clockSec += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.6);
    this.levelFlash = Math.max(0, this.levelFlash - dt * 1.9);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = false;

    const inGameplay = state?.phase === 'playing';
    const isCompactViewport = this.width <= 640 || this.height <= 460;

    // 1. Subtle screen-edge kinetic vignette, speed lines, hurt & level-up feedback
    if (state && (inGameplay || state.phase === 'title')) {
      this.renderScreenFeedback(ctx, state, dt, inGameplay);
    }

    // 2. Projected world-space overhead HP bars for wounded Elites/Minibosses & off-screen Boss/Portal arrows
    if (state && inGameplay) {
      this.renderWorldIndicators(ctx, camera, state, isCompactViewport);
    }

    // 3. Floating Damage Numbers & Combat Callouts (sleek bold outlined display typography)
    if (!this.enabled) {
      if (!this.wasClearedWhenDisabled) {
        this.wasClearedWhenDisabled = true;
      }
      return;
    }

    const halfW = this.width * 0.5;
    const halfH = this.height * 0.5;
    const scaleMult = isCompactViewport ? 0.8 : 1.0;

    // Advance physics & collect active entries sorted by priority descending (highest impact on top)
    let activeCount = 0;
    for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
      const e = this.pool[i]!;
      if (!e.active) continue;
      e.age += dt;
      if (e.age >= e.maxAge) {
        e.active = false;
        continue;
      }
      e.wx += e.vx * dt;
      e.wy += e.vy * dt;
      e.wz += e.vz * dt;
      e.vy = Math.max(0.25, e.vy - 3.6 * dt);
      this.activeIndices[activeCount++] = i;
    }

    // Insertion-sort active indices by priority desc, age asc (tiny array, zero allocs)
    for (let i = 1; i < activeCount; i++) {
      const idx = this.activeIndices[i]!;
      const cur = this.pool[idx]!;
      let j = i - 1;
      while (j >= 0) {
        const prev = this.pool[this.activeIndices[j]!]!;
        if (prev.priority > cur.priority || (prev.priority === cur.priority && prev.age <= cur.age)) {
          break;
        }
        this.activeIndices[j + 1] = this.activeIndices[j]!;
        j--;
      }
      this.activeIndices[j + 1] = idx;
    }

    const renderLimit = Math.min(activeCount, isCompactViewport ? 12 : MAX_RENDERED_TEXTS);
    let placedCount = 0;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    for (let n = 0; n < renderLimit; n++) {
      const e = this.pool[this.activeIndices[n]!]!;
      this._proj.set(e.wx, e.wy, e.wz).project(camera);
      if (this._proj.z > 1.0 || this._proj.z < -1.0) continue;

      let sx = (this._proj.x + 1) * halfW;
      let sy = (1 - this._proj.y) * halfH;
      if (sx < -80 || sx > this.width + 80 || sy < 40 || sy > this.height - 40) continue;

      const t = e.age / e.maxAge;
      let scaleBoost = 1.0;
      if (t < 0.14) {
        const p = t / 0.14;
        scaleBoost = 0.78 + Math.sin(p * Math.PI * 0.65) * 0.34;
      } else if (t < 0.28) {
        const p = (t - 0.14) / 0.14;
        scaleBoost = 1.08 - p * 0.08;
      }

      const fontPx = Math.max(11, Math.round(e.pixelSize * scaleBoost * scaleMult));
      const isEpicCallout = e.priority >= 2;
      ctx.font = isEpicCallout
        ? `900 italic ${fontPx}px "Palatino Linotype", "Book Antiqua", Georgia, serif`
        : `900 ${fontPx}px "Trebuchet MS", "Segoe UI Black", sans-serif`;
      const halfLabelW = ctx.measureText(e.text).width * 0.5 + 8;
      const halfLabelH = fontPx * 0.58 + 4;

      // Exact bounding-box de-overlap so combat numbers fan out cleanly without colliding
      for (let nudge = 0; nudge < 8; nudge++) {
        let collided = false;
        for (let k = 0; k < placedCount; k++) {
          const dx = Math.abs(sx - this.placedX[k]!);
          const dy = Math.abs(sy - this.placedY[k]!);
          if (dx < halfLabelW + this.placedW[k]! && dy < halfLabelH + this.placedH[k]!) {
            sy -= halfLabelH + this.placedH[k]! + 2;
            sx += (nudge % 2 === 0 ? 1 : -1) * (10 + nudge * 4);
            collided = true;
            break;
          }
        }
        if (!collided) break;
      }

      if (placedCount < MAX_FLOATING_TEXTS) {
        this.placedX[placedCount] = sx;
        this.placedY[placedCount] = sy;
        this.placedW[placedCount] = halfLabelW;
        this.placedH[placedCount] = halfLabelH;
        placedCount++;
      }

      if (e.shakeAmp > 0 && t < 0.32) {
        sx += Math.sin(e.age * 74) * e.shakeAmp * (1 - t / 0.32);
      }

      const alpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1.0;
      ctx.globalAlpha = alpha;

      // Crisp bold black-outlined retro-arcade damage numbers (clean & high-contrast!)
      ctx.lineWidth = Math.max(3.4, fontPx * 0.28);
      ctx.strokeStyle = '#08090d';
      ctx.strokeText(e.text, sx + 1.0, sy + 1.6);
      ctx.strokeText(e.text, sx, sy);

      const grad = ctx.createLinearGradient(sx, sy - fontPx * 0.52, sx, sy + fontPx * 0.52);
      grad.addColorStop(0, e.colorTop);
      grad.addColorStop(1, e.colorBottom);
      ctx.fillStyle = grad;
      ctx.fillText(e.text, sx, sy);
    }

    ctx.restore();
    ctx.globalAlpha = 1.0;
  }

  private renderScreenFeedback(
    ctx: CanvasRenderingContext2D,
    state: Readonly<SimState>,
    dt: number,
    inGameplay: boolean,
  ): void {
    const w = this.width;
    const h = this.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const outerR = Math.hypot(cx, cy);

    if (!inGameplay) return;

    // Kinetic high-speed streaks when sliding downhill / grinding rails / bhopping fast!
    const hSpeed = Math.hypot(state.player.vel.x, state.player.vel.z);
    const targetLines =
      state.player.isSliding || state.player.railId !== null
        ? Math.min(1, Math.max(0.25, (hSpeed - 10) / 14))
        : Math.max(0, Math.min(1, (hSpeed - 15) / 12));
    this.speedLinesAlpha += (targetLines - this.speedLinesAlpha) * Math.min(1, dt * 8);

    if (this.speedLinesAlpha > 0.04) {
      const lineCount = 16;
      ctx.save();
      ctx.strokeStyle =
        state.player.railId !== null
          ? `rgba(92, 247, 255, ${(this.speedLinesAlpha * 0.36).toFixed(3)})`
          : `rgba(255, 244, 200, ${(this.speedLinesAlpha * 0.28).toFixed(3)})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < lineCount; i++) {
        const ang = (i / lineCount) * Math.PI * 2 + Math.sin(this.clockSec * 9 + i * 2.3) * 0.06;
        const jitter = ((this.clockSec * 14 + i * 0.61) % 1.0) * 0.14;
        const r0 = outerR * (0.64 + jitter);
        const r1 = outerR * 1.06;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Low-HP heartbeat / damage-hit crimson edge pulse
    const hpRatio = state.player.maxHp > 0 ? state.player.hp / state.player.maxHp : 1;
    const lowHpPulse =
      hpRatio < 0.28 && !state.player.dead
        ? (0.22 + Math.sin(this.clockSec * 7.5) * 0.12) * (1 - hpRatio / 0.28)
        : 0;
    const redAmt = Math.min(0.62, this.hurtFlash * 0.48 + lowHpPulse);
    if (redAmt > 0.01) {
      const redGrad = ctx.createRadialGradient(cx, cy, outerR * 0.45, cx, cy, outerR);
      redGrad.addColorStop(0, 'rgba(220, 38, 38, 0)');
      redGrad.addColorStop(1, `rgba(220, 38, 38, ${redAmt.toFixed(3)})`);
      ctx.fillStyle = redGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Level-up golden-cyan radiance pulse
    if (this.levelFlash > 0.01) {
      const goldGrad = ctx.createRadialGradient(cx, cy, outerR * 0.4, cx, cy, outerR);
      goldGrad.addColorStop(0, 'rgba(255, 214, 92, 0)');
      goldGrad.addColorStop(1, `rgba(255, 214, 92, ${(this.levelFlash * 0.34).toFixed(3)})`);
      ctx.fillStyle = goldGrad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private renderWorldIndicators(
    ctx: CanvasRenderingContext2D,
    camera: THREE.Camera,
    state: Readonly<SimState>,
    isCompact: boolean,
  ): void {
    const halfW = this.width * 0.5;
    const halfH = this.height * 0.5;
    const pPos = state.player.pos;
    const enemies = state.enemies;

    // 0. Iconic compact world-space Red/Black HP Bar (+ Cyan Shield Bar) right beneath the hero's boots!
    if (!state.player.dead) {
      this._proj.set(pPos.x, pPos.y - 0.08, pPos.z).project(camera);
      if (this._proj.z >= -1.0 && this._proj.z <= 1.0) {
        const px = (this._proj.x + 1) * halfW;
        const py = (1 - this._proj.y) * halfH + (isCompact ? 10 : 14);
        if (px > 40 && px < this.width - 40 && py > 40 && py < this.height - 24) {
          const barW = isCompact ? 46 : 58;
          const hpH = isCompact ? 5 : 6;
          const bx = Math.round(px - barW * 0.5);
          const by = Math.round(py);
          const hpRatio = state.player.maxHp > 0 ? Math.max(0, Math.min(1, state.player.hp / state.player.maxHp)) : 0;

          if (state.player.maxShield > 0) {
            const shH = 3;
            const shRatio = Math.max(0, Math.min(1, state.player.shield / Math.max(1, state.player.maxShield)));
            ctx.fillStyle = '#090b10';
            ctx.fillRect(bx - 1, by - shH - 2, barW + 2, shH + 2);
            ctx.fillStyle = '#14a3f5';
            ctx.fillRect(bx, by - shH - 1, Math.round(barW * shRatio), shH);
          }

          ctx.fillStyle = '#090b10';
          ctx.fillRect(bx - 1, by - 1, barW + 2, hpH + 2);
          ctx.fillStyle = '#e81e1e';
          ctx.fillRect(bx, by, Math.round(barW * hpRatio), hpH);
        }
      }
    }

    // A. Slim crisp overhead HP bars above wounded Elites & Minibosses (max 10 nearest)
    let barsDrawn = 0;
    for (let i = 0; i < enemies.length && barsDrawn < 10; i++) {
      const e = enemies[i]!;
      if (e.hp <= 0 || e.hp >= e.maxHp || e.isBoss) continue;
      if (!e.isElite && e.role !== 'miniboss') continue;

      const dx = e.pos.x - pPos.x;
      const dz = e.pos.z - pPos.z;
      if (dx * dx + dz * dz > 58 * 58) continue;

      this._proj.set(e.pos.x, e.pos.y + Math.max(2.2, e.radius * 2.5 + 0.7), e.pos.z).project(camera);
      if (this._proj.z > 1.0 || this._proj.z < -1.0) continue;

      const sx = (this._proj.x + 1) * halfW;
      const sy = (1 - this._proj.y) * halfH;
      if (sx < 24 || sx > this.width - 24 || sy < 48 || sy > this.height - 48) continue;

      const barW = e.role === 'miniboss' ? (isCompact ? 46 : 58) : (isCompact ? 34 : 44);
      const barH = 5;
      const ratio = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
      const bx = Math.round(sx - barW * 0.5);
      const by = Math.round(sy - barH * 0.5);

      ctx.fillStyle = '#070910';
      ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
      ctx.fillStyle = '#1f1626';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = e.role === 'miniboss' ? '#ff4d6d' : '#fbbf24';
      ctx.fillRect(bx, by, Math.max(1, Math.round(barW * ratio)), barH);
      barsDrawn++;
    }

    // B. Off-screen directional indicator arrow for Primary Boss & Open Boss Portal!
    camera.matrixWorld.extractBasis(this._camRight, this._camUp, this._camFwd);
    // Three.js camera looks down -Z
    this._camFwd.negate();

    const drawEdgePointer = (
      wx: number,
      wy: number,
      wz: number,
      color: string,
      icon: 'skull' | 'portal',
    ) => {
      this._proj.set(wx, wy, wz).project(camera);
      const onScreen =
        this._proj.z >= -1.0 &&
        this._proj.z <= 1.0 &&
        Math.abs(this._proj.x) <= 0.92 &&
        Math.abs(this._proj.y) <= 0.88;
      if (onScreen) return;

      this._toTarget.set(wx - camera.position.x, wy - camera.position.y, wz - camera.position.z);
      const rx = this._toTarget.dot(this._camRight);
      const ry = this._toTarget.dot(this._camUp);
      const ang = Math.atan2(-ry, rx);

      const padX = isCompact ? 30 : 44;
      const padY = isCompact ? 62 : 76;
      const maxX = halfW - padX;
      const maxY = halfH - padY;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const scale = Math.min(
        Math.abs(cos) > 0.001 ? maxX / Math.abs(cos) : 9999,
        Math.abs(sin) > 0.001 ? maxY / Math.abs(sin) : 9999,
      );
      const ex = halfW + cos * scale;
      const ey = halfH + sin * scale;

      // Outer badge pill + directional chevron
      ctx.save();
      ctx.translate(ex, ey);
      ctx.fillStyle = 'rgba(10, 14, 24, 0.82)';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(13, -6);
      ctx.lineTo(13, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      drawPixelIcon(ctx, icon, 0, 0, 1.5, color);
      ctx.restore();
    };

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (e.isBoss && e.hp > 0) {
        drawEdgePointer(e.pos.x, e.pos.y + 3.0, e.pos.z, '#ff4d6d', 'skull');
        break;
      }
    }

    if (state.bossPortalOpen && state.bossPortalPos) {
      drawEdgePointer(
        state.bossPortalPos.x,
        state.bossPortalPos.y + 3.0,
        state.bossPortalPos.z,
        '#d946ef',
        'portal',
      );
    }
  }
}
