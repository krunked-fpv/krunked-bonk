/**
 * KRUNKEDBONK — Zero-GC 3D-Projected Outlined Arcade Floating Damage Numbers & Callouts
 *
 * Renders bold retro pixel-outlined floating damage numbers directly onto an aligned
 * 2D overlay canvas with zero DOM element churn and zero per-hit allocations:
 * - Normal hit: crisp white (or subtle elemental accent)
 * - CRIT!: bright gold
 * - MEGACRIT!!: blazing orange-red gradient punch
 * - BONK!: giant magenta-gold starburst callout with horizontal punch shake
 * - LEVEL UP!: radiant cyan rising banner
 * - +HP: bright lime heal numbers
 */

import * as THREE from 'three';
import type { ElementType, SimEvent } from '../contracts/index';
import { drawPixelText } from '../assets/PixelBitmapFont';

const MAX_FLOATING_TEXTS = 160;

interface FloatingEntry {
  active: boolean;
  text: string;
  wx: number;
  wy: number;
  wz: number;
  vx: number;
  vy: number;
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

  // Pre-allocated scratch Vector3 & screen-space de-overlap buffers (ZERO per-frame allocs)
  private readonly _proj = new THREE.Vector3();
  private readonly placedX = new Float32Array(MAX_FLOATING_TEXTS);
  private readonly placedY = new Float32Array(MAX_FLOATING_TEXTS);

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
        age: 0,
        maxAge: 0.7,
        pixelSize: 3,
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
    // Pick an inactive slot or overwrite the oldest lower-priority slot
    let slot = this.pool[this.cursor]!;
    for (let attempt = 0; attempt < 8; attempt++) {
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
    slot.vx = this.nextJitter() * 1.75;
    slot.vy = vy;
    slot.age = 0;
    slot.maxAge = maxAge;
    slot.pixelSize = pixelSize;
    slot.colorTop = colorTop;
    slot.colorBottom = colorBottom;
    slot.shakeAmp = shakeAmp;
    slot.priority = priority;
  }

  public consumeEvents(events: readonly SimEvent[]): void {
    if (!this.enabled) return;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      switch (ev.type) {
        case 'damage_dealt': {
          const dmg = Math.max(1, Math.round(ev.amount));
          if (ev.isBonker) {
            this.spawn(
              `BONK! ${dmg}`,
              ev.pos.x,
              ev.pos.y + 2.2,
              ev.pos.z,
              3.5,
              '#ff4de8',
              '#ffd84d',
              1.15,
              2.6,
              3.5,
              4,
            );
          } else if (ev.isMegacrit) {
            this.spawn(
              `MEGA! ${dmg}`,
              ev.pos.x,
              ev.pos.y + 1.9,
              ev.pos.z,
              3.0,
              '#ffde59',
              '#ff4d2e',
              0.95,
              2.4,
              2.0,
              3,
            );
          } else if (ev.isExecute) {
            this.spawn(
              `EXEC! ${dmg}`,
              ev.pos.x,
              ev.pos.y + 1.8,
              ev.pos.z,
              2.75,
              '#ff8fa3',
              '#ff1e42',
              0.9,
              2.3,
              1.5,
              3,
            );
          } else if (ev.critTier >= 1) {
            this.spawn(
              `${dmg}!`,
              ev.pos.x,
              ev.pos.y + 1.6,
              ev.pos.z,
              2.5,
              '#fff3a1',
              '#ffb703',
              0.8,
              2.1,
              0.8,
              2,
            );
          } else {
            const cols = ELEMENT_COLORS[ev.element] ?? ELEMENT_COLORS.Physical;
            this.spawn(
              `${dmg}`,
              ev.pos.x,
              ev.pos.y + 1.4,
              ev.pos.z,
              2.0,
              cols[0],
              cols[1],
              0.64,
              1.85,
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
            ev.pos.y + 3.4,
            ev.pos.z,
            3.5,
            '#ffffff',
            '#38f2ff',
            1.35,
            2.1,
            1.5,
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
              2.25,
              '#c9ff9e',
              '#34eb64',
              0.78,
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
            2.25,
            '#ffffff',
            '#62e8ff',
            0.75,
            2.0,
            0,
            2,
          );
          break;

        case 'player_jump':
          if (ev.isBhop && ev.streak >= 2) {
            this.spawn(
              `BHOP X${ev.streak}!`,
              ev.pos.x,
              ev.pos.y + 2.3,
              ev.pos.z,
              2.25,
              '#fff4a3',
              '#ffae19',
              0.7,
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
            3.0,
            '#a6ffcb',
            '#34eb64',
            1.2,
            2.1,
            1.4,
            4,
          );
          break;

        default:
          break;
      }
    }
  }

  public render(camera: THREE.Camera, dtSec: number): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    if (!this.enabled) {
      if (!this.wasClearedWhenDisabled) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.wasClearedWhenDisabled = true;
      }
      return;
    }

    const dt = Math.min(0.05, Math.max(0, dtSec));
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = false;

    const halfW = this.width * 0.5;
    const halfH = this.height * 0.5;
    let placedCount = 0;

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
      e.vy = Math.max(0.25, e.vy - 3.4 * dt);

      // Project 3D world position to screen
      this._proj.set(e.wx, e.wy, e.wz).project(camera);
      if (this._proj.z > 1.0 || this._proj.z < -1.0) continue;

      let sx = (this._proj.x + 1) * halfW;
      let sy = (1 - this._proj.y) * halfH;
      if (sx < -120 || sx > this.width + 120 || sy < -60 || sy > this.height + 60) continue;

      // Lightweight screen-space de-overlap (stagger vertically so rapid crits never stack)
      for (let nudge = 0; nudge < 6; nudge++) {
        let collided = false;
        for (let k = 0; k < placedCount; k++) {
          if (Math.abs(sx - this.placedX[k]!) < 52 && Math.abs(sy - this.placedY[k]!) < 20) {
            sy -= 20;
            collided = true;
            break;
          }
        }
        if (!collided) break;
      }

      if (placedCount < MAX_FLOATING_TEXTS) {
        this.placedX[placedCount] = sx;
        this.placedY[placedCount] = sy;
        placedCount++;
      }

      const t = e.age / e.maxAge;
      // Subtle arcade pop-in overshoot -> crisp readable plateau -> clean fade
      let scaleBoost = 1.0;
      if (t < 0.14) {
        const p = t / 0.14;
        scaleBoost = 0.78 + Math.sin(p * Math.PI * 0.65) * 0.34;
      } else if (t < 0.28) {
        const p = (t - 0.14) / 0.14;
        scaleBoost = 1.08 - p * 0.08;
      }

      if (e.shakeAmp > 0 && t < 0.35) {
        sx += Math.sin(e.age * 78) * e.shakeAmp * (1 - t / 0.35);
      }

      const alpha = t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1.0;
      const px = Math.max(1.5, Math.round(e.pixelSize * scaleBoost * 2) / 2);

      ctx.globalAlpha = alpha;
      drawPixelText(ctx, e.text, sx, sy, {
        pixelSize: px,
        color: e.colorTop,
        colorBottom: e.colorBottom,
        outlineColor: '#080a10',
        outlinePx: 1,
        shadowOffsetPx: 1,
      });
    }

    ctx.globalAlpha = 1.0;
  }
}
