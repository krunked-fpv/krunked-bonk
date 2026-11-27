import {
  MAX_TOME_SLOTS,
  MAX_WEAPON_SLOTS,
  type DebugPerfMetrics,
  type EnemyState,
  type GameCatalog,
  type GamepadProfile,
  type InputDeviceKind,
  type InteractableKind,
  type RenderSettings,
  type SimState,
} from '../contracts';

export interface HudUpdateContext {
  state: Readonly<SimState>;
  catalog: Readonly<GameCatalog>;
  settings: Readonly<RenderSettings>;
  activeDevice: InputDeviceKind;
  gamepadProfile: GamepadProfile;
  perf?: Readonly<DebugPerfMetrics>;
  fireHeld?: boolean;
  maxWeaponSlots?: number;
  maxTomeSlots?: number;
}

const ELEMENT_COLORS: Record<string, string> = {
  Physical: '#cbd5e1',
  Fire: '#f97316',
  Ice: '#38bdf8',
  Lightning: '#facc15',
  Poison: '#4ade80',
  Void: '#a855f7',
  Holy: '#fde68a',
};

function formatClock(sec: number): string {
  const clamped = Math.max(0, Math.floor(sec));
  const mins = Math.floor(clamped / 60);
  const rem = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function formatCompact(n: number): string {
  const v = Math.floor(Math.max(0, n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function abbreviate(name: string, maxLen = 6): string {
  const clean = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  if (clean.length <= maxLen) return clean.toUpperCase();
  const words = clean.split(/\s+/);
  if (words.length >= 2) {
    return words
      .map((w) => w.slice(0, Math.max(2, Math.floor(maxLen / words.length))))
      .join('')
      .slice(0, maxLen)
      .toUpperCase();
  }
  return clean.slice(0, maxLen).toUpperCase();
}

function interactGlyphForDevice(device: InputDeviceKind, profile: GamepadProfile): string {
  if (device === 'touch') return 'TAP';
  if (device === 'gamepad') {
    if (profile === 'playstation') return '[SQ]';
    if (profile === 'switch') return '(Y)';
    return '(X)';
  }
  return '[E]';
}

function humanizeInteractKind(kind: InteractableKind): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export class HudOverlay {
  private root: HTMLDivElement | null = null;
  private xpFill: HTMLDivElement | null = null;
  private xpLabel: HTMLSpanElement | null = null;
  private levelBadge: HTMLDivElement | null = null;

  private timerBox: HTMLDivElement | null = null;
  private timerValue: HTMLSpanElement | null = null;
  private timerTag: HTMLSpanElement | null = null;

  private bossBox: HTMLDivElement | null = null;
  private bossName: HTMLSpanElement | null = null;
  private bossHpText: HTMLSpanElement | null = null;
  private bossFill: HTMLDivElement | null = null;
  private bossPylons: HTMLDivElement | null = null;

  private bannerBox: HTMLDivElement | null = null;
  private weaponTray: HTMLDivElement | null = null;
  private tomeTray: HTMLDivElement | null = null;
  private itemStrip: HTMLDivElement | null = null;

  private killsVal: HTMLSpanElement | null = null;
  private goldVal: HTMLSpanElement | null = null;
  private silverVal: HTMLSpanElement | null = null;
  private fpsBox: HTMLDivElement | null = null;

  private hpFill: HTMLDivElement | null = null;
  private hpText: HTMLSpanElement | null = null;
  private shieldTrack: HTMLDivElement | null = null;
  private shieldFill: HTMLDivElement | null = null;
  private shieldText: HTMLSpanElement | null = null;
  private passiveRow: HTMLDivElement | null = null;
  private passiveName: HTMLSpanElement | null = null;
  private passiveVal: HTMLSpanElement | null = null;
  private passiveFill: HTMLDivElement | null = null;

  private speedVal: HTMLSpanElement | null = null;
  private pillSlide: HTMLSpanElement | null = null;
  private pillBhop: HTMLSpanElement | null = null;
  private pillGrind: HTMLSpanElement | null = null;
  private pillWall: HTMLSpanElement | null = null;

  private crosshair: HTMLDivElement | null = null;
  private interactBox: HTMLDivElement | null = null;
  private interactGlyph: HTMLSpanElement | null = null;
  private interactName: HTMLSpanElement | null = null;
  private interactCost: HTMLSpanElement | null = null;
  private interactChargeTrack: HTMLDivElement | null = null;
  private interactChargeFill: HTMLDivElement | null = null;

  private lastWeaponSig = '';
  private lastTomeSig = '';
  private lastItemSig = '';
  private lastBannerText = '';
  private activeInteractLabel: string | null = null;

  public mount(host: HTMLElement): void {
    if (this.root || typeof document === 'undefined') return;

    const root = document.createElement('div');
    root.className = 'kb-hud';
    root.setAttribute('data-kb-hud', 'true');

    // XP Strip
    const xpStrip = document.createElement('div');
    xpStrip.className = 'kb-hud-xp-strip';
    const xpFill = document.createElement('div');
    xpFill.className = 'kb-hud-xp-fill';
    const xpLabel = document.createElement('span');
    xpLabel.className = 'kb-hud-xp-label';
    xpStrip.append(xpFill, xpLabel);

    const levelBadge = document.createElement('div');
    levelBadge.className = 'kb-hud-level-badge';
    levelBadge.textContent = 'LV. 1';

    // Top-Center: Timer, Boss, Banner
    const topCenter = document.createElement('div');
    topCenter.className = 'kb-hud-top-center';

    const timerBox = document.createElement('div');
    timerBox.className = 'kb-hud-timer';
    const timerValue = document.createElement('span');
    timerValue.textContent = '10:00';
    const timerTag = document.createElement('span');
    timerTag.className = 'kb-hud-timer-tag';
    timerTag.textContent = 'STAGE';
    timerBox.append(timerTag, timerValue);

    const bossBox = document.createElement('div');
    bossBox.className = 'kb-hud-boss';
    const bossHeader = document.createElement('div');
    bossHeader.className = 'kb-hud-boss-header';
    const bossName = document.createElement('span');
    const bossHpText = document.createElement('span');
    bossHeader.append(bossName, bossHpText);
    const bossBar = document.createElement('div');
    bossBar.className = 'kb-hud-boss-bar';
    const bossFill = document.createElement('div');
    bossFill.className = 'kb-hud-boss-fill';
    bossBar.appendChild(bossFill);
    const bossPylons = document.createElement('div');
    bossPylons.className = 'kb-hud-boss-pylons';
    bossBox.append(bossHeader, bossBar, bossPylons);

    const bannerBox = document.createElement('div');
    bannerBox.className = 'kb-hud-banner';

    topCenter.append(timerBox, bossBox, bannerBox);

    // Top-Left: Weapon & Tome Trays
    const loadout = document.createElement('div');
    loadout.className = 'kb-hud-loadout';
    const weaponTray = document.createElement('div');
    weaponTray.className = 'kb-hud-tray';
    weaponTray.setAttribute('data-kb-weapons', 'true');
    const tomeTray = document.createElement('div');
    tomeTray.className = 'kb-hud-tray';
    tomeTray.setAttribute('data-kb-tomes', 'true');
    loadout.append(weaponTray, tomeTray);

    // Top-Right: Kills / Gold / Silver + FPS
    const topRight = document.createElement('div');
    topRight.className = 'kb-hud-top-right';
    const counters = document.createElement('div');
    counters.className = 'kb-hud-counters';

    const killsPill = this.makeCounterPill('KILLS', 'kb-counter-pill--kills');
    const goldPill = this.makeCounterPill('GOLD', 'kb-counter-pill--gold');
    const silverPill = this.makeCounterPill('SILVER', 'kb-counter-pill--silver');
    counters.append(killsPill.el, goldPill.el, silverPill.el);

    const fpsBox = document.createElement('div');
    fpsBox.className = 'kb-hud-fps';
    topRight.append(counters, fpsBox);

    // Bottom-Left: HP + Shield + Active Character Passive Bar
    const bottomLeft = document.createElement('div');
    bottomLeft.className = 'kb-hud-bottom-left';
    const vitalCard = document.createElement('div');
    vitalCard.className = 'kb-vital-card';

    const hpTrack = document.createElement('div');
    hpTrack.className = 'kb-bar-track';
    const hpFill = document.createElement('div');
    hpFill.className = 'kb-bar-fill kb-bar-fill--hp';
    const hpText = document.createElement('span');
    hpText.className = 'kb-bar-text';
    hpTrack.append(hpFill, hpText);

    const shieldTrack = document.createElement('div');
    shieldTrack.className = 'kb-bar-track kb-bar-track--thin';
    const shieldFill = document.createElement('div');
    shieldFill.className = 'kb-bar-fill kb-bar-fill--shield';
    const shieldText = document.createElement('span');
    shieldText.className = 'kb-bar-text';
    shieldTrack.append(shieldFill, shieldText);

    const passiveRow = document.createElement('div');
    passiveRow.className = 'kb-passive-row';
    const passiveHeader = document.createElement('div');
    passiveHeader.className = 'kb-passive-header';
    const passiveName = document.createElement('span');
    const passiveVal = document.createElement('span');
    passiveHeader.append(passiveName, passiveVal);
    const passiveTrack = document.createElement('div');
    passiveTrack.className = 'kb-bar-track kb-bar-track--thin';
    const passiveFill = document.createElement('div');
    passiveFill.className = 'kb-bar-fill kb-bar-fill--passive';
    passiveTrack.appendChild(passiveFill);
    passiveRow.append(passiveHeader, passiveTrack);

    vitalCard.append(hpTrack, shieldTrack, passiveRow);
    bottomLeft.appendChild(vitalCard);

    // Bottom-Center: Item Strip
    const itemStrip = document.createElement('div');
    itemStrip.className = 'kb-hud-items';
    itemStrip.setAttribute('data-kb-items', 'true');

    // Bottom-Right: Kinetic Speedometer & Movement State Pills
    const kinetic = document.createElement('div');
    kinetic.className = 'kb-hud-kinetic';
    const pills = document.createElement('div');
    pills.className = 'kb-kinetic-pills';
    const pillSlide = this.makePill('SLIDE', 'kb-kinetic-pill--slide');
    const pillBhop = this.makePill('BHOP x1', 'kb-kinetic-pill--bhop');
    const pillGrind = this.makePill('GRIND', 'kb-kinetic-pill--grind');
    const pillWall = this.makePill('WALL', 'kb-kinetic-pill--wall');
    pills.append(pillSlide, pillBhop, pillGrind, pillWall);

    const speedo = document.createElement('div');
    speedo.className = 'kb-speedometer';
    const speedVal = document.createElement('span');
    speedVal.className = 'kb-speed-val';
    speedVal.textContent = '0.0';
    const speedUnit = document.createElement('span');
    speedUnit.className = 'kb-speed-unit';
    speedUnit.textContent = 'M/S';
    speedo.append(speedVal, speedUnit);

    kinetic.append(pills, speedo);

    // Center Crosshair
    const crosshair = document.createElement('div');
    crosshair.className = 'kb-crosshair';
    const dot = document.createElement('div');
    dot.className = 'kb-crosshair-dot';
    const topArm = document.createElement('div');
    topArm.className = 'kb-crosshair-arm kb-crosshair-arm--top';
    const botArm = document.createElement('div');
    botArm.className = 'kb-crosshair-arm kb-crosshair-arm--bottom';
    const leftArm = document.createElement('div');
    leftArm.className = 'kb-crosshair-arm kb-crosshair-arm--left';
    const rightArm = document.createElement('div');
    rightArm.className = 'kb-crosshair-arm kb-crosshair-arm--right';
    crosshair.append(dot, topArm, botArm, leftArm, rightArm);

    // Contextual Interact Prompt
    const interactBox = document.createElement('div');
    interactBox.className = 'kb-interact-prompt';
    const interactGlyph = document.createElement('span');
    interactGlyph.className = 'kb-prompt-glyph';
    const interactName = document.createElement('span');
    const interactCost = document.createElement('span');
    interactCost.className = 'kb-prompt-cost';
    const interactChargeTrack = document.createElement('div');
    interactChargeTrack.className = 'kb-prompt-charge';
    const interactChargeFill = document.createElement('div');
    interactChargeFill.className = 'kb-prompt-charge-fill';
    interactChargeTrack.appendChild(interactChargeFill);
    interactBox.append(interactGlyph, interactName, interactCost, interactChargeTrack);

    root.append(
      xpStrip,
      levelBadge,
      topCenter,
      loadout,
      topRight,
      bottomLeft,
      itemStrip,
      kinetic,
      crosshair,
      interactBox,
    );
    host.appendChild(root);

    this.root = root;
    this.xpFill = xpFill;
    this.xpLabel = xpLabel;
    this.levelBadge = levelBadge;
    this.timerBox = timerBox;
    this.timerValue = timerValue;
    this.timerTag = timerTag;
    this.bossBox = bossBox;
    this.bossName = bossName;
    this.bossHpText = bossHpText;
    this.bossFill = bossFill;
    this.bossPylons = bossPylons;
    this.bannerBox = bannerBox;
    this.weaponTray = weaponTray;
    this.tomeTray = tomeTray;
    this.itemStrip = itemStrip;
    this.killsVal = killsPill.val;
    this.goldVal = goldPill.val;
    this.silverVal = silverPill.val;
    this.fpsBox = fpsBox;
    this.hpFill = hpFill;
    this.hpText = hpText;
    this.shieldTrack = shieldTrack;
    this.shieldFill = shieldFill;
    this.shieldText = shieldText;
    this.passiveRow = passiveRow;
    this.passiveName = passiveName;
    this.passiveVal = passiveVal;
    this.passiveFill = passiveFill;
    this.speedVal = speedVal;
    this.pillSlide = pillSlide;
    this.pillBhop = pillBhop;
    this.pillGrind = pillGrind;
    this.pillWall = pillWall;
    this.crosshair = crosshair;
    this.interactBox = interactBox;
    this.interactGlyph = interactGlyph;
    this.interactName = interactName;
    this.interactCost = interactCost;
    this.interactChargeTrack = interactChargeTrack;
    this.interactChargeFill = interactChargeFill;
  }

  public setVisible(visible: boolean): void {
    if (!this.root) return;
    this.root.classList.toggle('is-visible', visible);
  }

  public getActiveInteractLabel(): string | null {
    return this.activeInteractLabel;
  }

  public update(ctx: HudUpdateContext): string | null {
    if (!this.root) return null;
    const { state, catalog, settings, activeDevice, gamepadProfile } = ctx;
    const player = state.player;

    // 1. XP Bar & Level
    const xpPct = player.xpToNext > 0 ? Math.min(100, (player.xp / player.xpToNext) * 100) : 0;
    if (this.xpFill) this.xpFill.style.width = `${xpPct.toFixed(1)}%`;
    if (this.xpLabel) {
      this.xpLabel.textContent = `XP ${Math.floor(player.xp)} / ${Math.ceil(player.xpToNext)}`;
    }
    if (this.levelBadge) {
      this.levelBadge.textContent = `LV. ${player.level}`;
    }

    // 2. Stage Countdown Timer (crimson in Final Swarm)
    if (this.timerBox && this.timerValue && this.timerTag) {
      if (state.finalSwarmActive) {
        const overtime = Math.max(0, state.simTimeSec - state.stageDurationSec);
        this.timerBox.classList.add('is-final-swarm');
        this.timerTag.textContent = 'FINAL SWARM';
        this.timerValue.textContent = `+${formatClock(overtime)}`;
      } else {
        const remaining = Math.max(0, state.stageDurationSec - state.simTimeSec);
        this.timerBox.classList.remove('is-final-swarm');
        this.timerTag.textContent = `${state.mapId.toUpperCase()} T${state.mapTier}`;
        this.timerValue.textContent = formatClock(remaining);
      }
    }

    // 3. Counters
    if (this.killsVal) this.killsVal.textContent = formatCompact(player.kills);
    if (this.goldVal) this.goldVal.textContent = formatCompact(player.gold);
    if (this.silverVal) this.silverVal.textContent = formatCompact(player.silverEarned);

    // 4. FPS Counter
    if (this.fpsBox) {
      const showFps = Boolean(settings.showFpsCounter);
      this.fpsBox.classList.toggle('is-active', showFps);
      if (showFps) {
        const fps = ctx.perf ? Math.round(ctx.perf.fps) : 0;
        const ms = ctx.perf ? ctx.perf.frameTimeMs.toFixed(1) : '0.0';
        const snapTag = settings.classic50HzSnap ? ' | 50HZ SNAP' : '';
        this.fpsBox.textContent = `${fps} FPS (${ms}ms)${snapTag}`;
      }
    }

    // 5. HP + Shield + Passive Meter
    const hpRatio = player.maxHp > 0 ? Math.max(0, Math.min(1, player.hp / player.maxHp)) : 0;
    if (this.hpFill) {
      this.hpFill.style.width = `${(hpRatio * 100).toFixed(1)}%`;
      this.hpFill.classList.toggle('is-low', hpRatio < 0.25 && !player.dead);
    }
    if (this.hpText) {
      const overhealTag = player.overheal > 0.5 ? ` (+${Math.floor(player.overheal)})` : '';
      this.hpText.textContent = `HP ${Math.ceil(player.hp)} / ${Math.ceil(player.maxHp)}${overhealTag}`;
    }

    const hasShield = player.maxShield > 0 || player.shield > 0;
    if (this.shieldTrack) {
      this.shieldTrack.style.display = hasShield ? 'block' : 'none';
    }
    if (hasShield && this.shieldFill && this.shieldText) {
      const shMax = Math.max(1, player.maxShield);
      const shRatio = Math.max(0, Math.min(1, player.shield / shMax));
      this.shieldFill.style.width = `${(shRatio * 100).toFixed(1)}%`;
      this.shieldText.textContent = `SHD ${Math.ceil(player.shield)} / ${Math.ceil(player.maxShield)}`;
    }

    if (this.passiveRow && this.passiveName && this.passiveVal && this.passiveFill) {
      const hasPassiveMeter = typeof player.passiveMeter === 'number' && Number.isFinite(player.passiveMeter);
      this.passiveRow.classList.toggle('is-active', hasPassiveMeter);
      if (hasPassiveMeter) {
        const charDef = catalog.characters.find((c) => c.id === state.characterId);
        const raw = Math.max(0, player.passiveMeter as number);
        const pct = raw <= 1 ? raw * 100 : Math.min(100, raw);
        this.passiveName.textContent = charDef?.passive.name ?? 'PASSIVE';
        this.passiveVal.textContent = `${Math.round(pct)}%`;
        this.passiveFill.style.width = `${pct.toFixed(1)}%`;
      }
    }

    // 6. Weapon & Tome Slot Trays
    const maxWeapons = ctx.maxWeaponSlots ?? Math.max(MAX_WEAPON_SLOTS, player.weapons.length);
    const maxTomes = ctx.maxTomeSlots ?? Math.max(MAX_TOME_SLOTS, player.tomes.length);
    this.updateWeaponTray(state, catalog, maxWeapons);
    this.updateTomeTray(state, catalog, maxTomes);
    this.updateItemStrip(state, catalog);

    // 7. Kinetic Speedometer + State Pills
    const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
    if (this.speedVal) {
      this.speedVal.textContent = horizSpeed.toFixed(1);
      this.speedVal.classList.toggle('is-fast', horizSpeed >= 10 && horizSpeed < 16);
      this.speedVal.classList.toggle('is-hyper', horizSpeed >= 16 && horizSpeed < 24);
      this.speedVal.classList.toggle('is-mach', horizSpeed >= 24);
    }

    const isSliding = player.isSliding || player.movementState === 'Sliding';
    const isGrinding = player.railId !== null || player.movementState === 'Grinding';
    const isWall = player.movementState === 'Wallrunning';

    this.pillSlide?.classList.toggle('is-active', isSliding);
    this.pillGrind?.classList.toggle('is-active', isGrinding);
    this.pillWall?.classList.toggle('is-active', isWall);
    if (this.pillBhop) {
      const showBhop = player.bhopStreak > 0;
      this.pillBhop.classList.toggle('is-active', showBhop);
      if (showBhop) {
        this.pillBhop.textContent = `BHOP x${player.bhopStreak}`;
      }
    }

    // 8. Boss HP Bar & Pylons
    this.updateBossBar(state, catalog);

    // 9. Stage Event Banner
    if (this.bannerBox) {
      const text = state.activeBannerText?.trim() ?? '';
      if (text !== this.lastBannerText) {
        this.lastBannerText = text;
        this.bannerBox.textContent = text;
        this.bannerBox.classList.toggle('is-active', text.length > 0);
      }
    }

    // 10. Center Crosshair (expands for manual-aim Sniper/Shotgun + movement/firing)
    if (this.crosshair) {
      const hasManualAimWeapon = player.weapons.some((slot) => {
        const def = catalog.weapons.find((w) => w.id === slot.weaponId);
        return def?.targeting === 'aim';
      });
      this.crosshair.classList.toggle('is-manual-aim', hasManualAimWeapon);
      const speedSpread = Math.min(8, horizSpeed * 0.25);
      const aimExpansion = hasManualAimWeapon ? (ctx.fireHeld ? 10 : 6) : 3;
      const gap = Math.round(aimExpansion + speedSpread);
      this.crosshair.style.setProperty('--kb-reticle-gap', `${gap}px`);
    }

    // 11. Contextual Interact Prompt
    this.activeInteractLabel = this.updateInteractPrompt(state, catalog, activeDevice, gamepadProfile);
    return this.activeInteractLabel;
  }

  public dispose(): void {
    this.root?.remove();
    this.root = null;
    this.lastWeaponSig = '';
    this.lastTomeSig = '';
    this.lastItemSig = '';
    this.activeInteractLabel = null;
  }

  private makeCounterPill(
    label: string,
    extraClass: string,
  ): { el: HTMLDivElement; val: HTMLSpanElement } {
    const el = document.createElement('div');
    el.className = `kb-counter-pill ${extraClass}`;
    const lbl = document.createElement('span');
    lbl.className = 'kb-counter-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'kb-counter-val';
    val.textContent = '0';
    el.append(lbl, val);
    return { el, val };
  }

  private makePill(label: string, extraClass: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = `kb-kinetic-pill ${extraClass}`;
    span.textContent = label;
    return span;
  }

  private updateWeaponTray(
    state: Readonly<SimState>,
    catalog: Readonly<GameCatalog>,
    maxSlots: number,
  ): void {
    if (!this.weaponTray) return;
    const sig = `${maxSlots}|${state.player.weapons
      .map((w) => `${w.weaponId}:${w.level}:${w.stolenByPylonId ?? ''}`)
      .join(',')}`;

    if (sig !== this.lastWeaponSig) {
      this.lastWeaponSig = sig;
      this.weaponTray.replaceChildren();
      for (let i = 0; i < maxSlots; i++) {
        const slot = state.player.weapons[i];
        const box = document.createElement('div');
        box.className = 'kb-slot-box';
        if (!slot) {
          box.classList.add('is-empty');
          const emptyLbl = document.createElement('span');
          emptyLbl.className = 'kb-slot-name';
          emptyLbl.textContent = `W${i + 1}`;
          box.appendChild(emptyLbl);
          this.weaponTray.appendChild(box);
          continue;
        }

        const def = catalog.weapons.find((w) => w.id === slot.weaponId);
        const accent = document.createElement('div');
        accent.className = 'kb-slot-accent';
        accent.style.background = ELEMENT_COLORS[def?.element ?? 'Physical'] ?? '#f5a623';

        const name = document.createElement('div');
        name.className = 'kb-slot-name';
        name.textContent = abbreviate(def?.displayName ?? slot.weaponId, 7);
        box.title = `${def?.displayName ?? slot.weaponId} (Lv ${slot.level})`;

        const meta = document.createElement('div');
        meta.className = 'kb-slot-meta';
        const lvl = document.createElement('span');
        lvl.textContent = `L${slot.level}`;
        const pips = document.createElement('div');
        pips.className = 'kb-slot-pips';
        const pipCount = Math.min(5, slot.level);
        for (let p = 0; p < pipCount; p++) {
          const pip = document.createElement('span');
          pip.className = 'kb-slot-pip';
          pips.appendChild(pip);
        }
        meta.append(lvl, pips);

        const cdVeil = document.createElement('div');
        cdVeil.className = 'kb-slot-cd-veil';
        cdVeil.setAttribute('data-slot-cd', String(i));

        box.append(accent, name, meta, cdVeil);

        if (slot.stolenByPylonId !== null) {
          box.classList.add('is-stolen');
          const tag = document.createElement('div');
          tag.className = 'kb-slot-stolen-tag';
          tag.textContent = `STOLEN\nP#${slot.stolenByPylonId}`;
          box.appendChild(tag);
        }

        this.weaponTray.appendChild(box);
      }
    }

    // Update lightweight cooldown veil heights in place without rebuilding DOM
    for (let i = 0; i < state.player.weapons.length; i++) {
      const slot = state.player.weapons[i];
      const def = catalog.weapons.find((w) => w.id === slot.weaponId);
      const veil = this.weaponTray.querySelector<HTMLDivElement>(`[data-slot-cd="${i}"]`);
      if (veil && def && def.cooldownSec > 0) {
        const pct = Math.max(0, Math.min(100, (slot.cooldownTimer / def.cooldownSec) * 100));
        veil.style.height = `${pct.toFixed(0)}%`;
      }
    }
  }

  private updateTomeTray(
    state: Readonly<SimState>,
    catalog: Readonly<GameCatalog>,
    maxSlots: number,
  ): void {
    if (!this.tomeTray) return;
    const sig = `${maxSlots}|${state.player.tomes.map((t) => `${t.tomeId}:${t.level}`).join(',')}`;
    if (sig === this.lastTomeSig) return;
    this.lastTomeSig = sig;
    this.tomeTray.replaceChildren();

    for (let i = 0; i < maxSlots; i++) {
      const slot = state.player.tomes[i];
      const box = document.createElement('div');
      box.className = 'kb-slot-box';
      if (!slot) {
        box.classList.add('is-empty');
        const emptyLbl = document.createElement('span');
        emptyLbl.className = 'kb-slot-name';
        emptyLbl.textContent = `T${i + 1}`;
        box.appendChild(emptyLbl);
        this.tomeTray.appendChild(box);
        continue;
      }

      const def = catalog.tomes.find((t) => t.id === slot.tomeId);
      const accent = document.createElement('div');
      accent.className = 'kb-slot-accent';
      accent.style.background = def?.colorHex ?? '#38bdf8';

      const name = document.createElement('div');
      name.className = 'kb-slot-name';
      name.textContent = abbreviate(def?.displayName ?? slot.tomeId, 7);
      box.title = `${def?.displayName ?? slot.tomeId} (Lv ${slot.level})`;

      const meta = document.createElement('div');
      meta.className = 'kb-slot-meta';
      const lvl = document.createElement('span');
      lvl.textContent = `L${slot.level}`;
      const pips = document.createElement('div');
      pips.className = 'kb-slot-pips';
      const pipCount = Math.min(5, slot.level);
      for (let p = 0; p < pipCount; p++) {
        const pip = document.createElement('span');
        pip.className = 'kb-slot-pip';
        pips.appendChild(pip);
      }
      meta.append(lvl, pips);

      box.append(accent, name, meta);
      this.tomeTray.appendChild(box);
    }
  }

  private updateItemStrip(state: Readonly<SimState>, catalog: Readonly<GameCatalog>): void {
    if (!this.itemStrip) return;
    const sig = state.player.items.map((it) => `${it.itemId}:${it.stacks}`).join(',');
    if (sig === this.lastItemSig) return;
    this.lastItemSig = sig;
    this.itemStrip.replaceChildren();

    for (const stack of state.player.items) {
      const def = catalog.items.find((i) => i.id === stack.itemId);
      const chip = document.createElement('div');
      chip.className = 'kb-item-chip';
      chip.setAttribute('data-rarity', def?.rarity ?? 'Common');
      chip.textContent = abbreviate(def?.displayName ?? stack.itemId, 4);
      chip.title = def
        ? `${def.displayName} (${def.rarity}) x${stack.stacks}\n${def.description}`
        : `${stack.itemId} x${stack.stacks}`;

      if (stack.stacks > 1) {
        const count = document.createElement('span');
        count.className = 'kb-item-stack';
        count.textContent = `x${stack.stacks}`;
        chip.appendChild(count);
      }
      this.itemStrip.appendChild(chip);
    }
  }

  private updateBossBar(state: Readonly<SimState>, catalog: Readonly<GameCatalog>): void {
    if (!this.bossBox || !this.bossName || !this.bossHpText || !this.bossFill || !this.bossPylons) {
      return;
    }

    const boss = this.findPrimaryBoss(state);
    if (!boss) {
      this.bossBox.classList.remove('is-active');
      return;
    }

    this.bossBox.classList.add('is-active');
    const def = catalog.enemies.find((e) => e.id === boss.enemyId);
    const roleLabel = boss.role.replace('_', ' ').toUpperCase();
    this.bossName.textContent = `${def?.displayName ?? boss.enemyId} [${roleLabel}]`;
    this.bossHpText.textContent = `${formatCompact(Math.ceil(boss.hp))} / ${formatCompact(Math.ceil(boss.maxHp))}`;
    const pct = boss.maxHp > 0 ? Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100)) : 0;
    this.bossFill.style.width = `${pct.toFixed(1)}%`;

    if (state.pylons.length > 0) {
      const cleansed = state.pylons.filter((p) => p.cleansed).length;
      const stolenCount = state.player.weapons.filter((w) => w.stolenByPylonId !== null).length;
      this.bossPylons.classList.add('is-active');
      this.bossPylons.textContent =
        stolenCount > 0
          ? `PYLONS CLEANSED: ${cleansed} / ${state.pylons.length}  |  STOLEN WEAPONS: ${stolenCount}`
          : `BOSS PYLONS CLEANSED: ${cleansed} / ${state.pylons.length}`;
    } else {
      this.bossPylons.classList.remove('is-active');
    }
  }

  private findPrimaryBoss(state: Readonly<SimState>): EnemyState | null {
    const priorityIds = [state.finalBossId, state.bigBobId, state.stageBossId, state.spookySteveId];
    for (const id of priorityIds) {
      if (id !== null) {
        const found = state.enemies.find((e) => e.id === id && e.hp > 0);
        if (found) return found;
      }
    }
    return (
      state.enemies.find(
        (e) =>
          e.hp > 0 &&
          (e.isBoss ||
            e.role === 'final_boss' ||
            e.role === 'stage_boss' ||
            e.role === 'crypt_boss' ||
            e.role === 'miniboss'),
      ) ?? null
    );
  }

  private updateInteractPrompt(
    state: Readonly<SimState>,
    catalog: Readonly<GameCatalog>,
    device: InputDeviceKind,
    profile: GamepadProfile,
  ): string | null {
    if (
      !this.interactBox ||
      !this.interactGlyph ||
      !this.interactName ||
      !this.interactCost ||
      !this.interactChargeTrack ||
      !this.interactChargeFill
    ) {
      return null;
    }

    const px = state.player.pos.x;
    const pz = state.player.pos.z;

    let bestLabel: string | null = null;
    let bestCost = 0;
    let bestChargeRatio: number | null = null;
    let bestDistSq = Infinity;

    for (const obj of state.interactables) {
      if (obj.used || !obj.active) continue;
      const dx = obj.pos.x - px;
      const dz = obj.pos.z - pz;
      const distSq = dx * dx + dz * dz;
      const reach = Math.max(3.5, obj.radius + 2.2);
      if (distSq <= reach * reach && distSq < bestDistSq) {
        bestDistSq = distSq;
        const def = catalog.interactables.find((d) => d.kind === obj.kind);
        bestLabel = def?.displayName ?? humanizeInteractKind(obj.kind);
        bestCost = obj.costGold;
        bestChargeRatio =
          obj.chargeDurationSec > 0 && obj.chargeProgress > 0
            ? Math.min(1, obj.chargeProgress / obj.chargeDurationSec)
            : null;
      }
    }

    // Also check Boss Portal if open
    if (state.bossPortalOpen && state.bossPortalPos) {
      const dx = state.bossPortalPos.x - px;
      const dz = state.bossPortalPos.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq <= 5.5 * 5.5 && distSq < bestDistSq) {
        bestDistSq = distSq;
        bestLabel = 'ENTER BOSS PORTAL';
        bestCost = 0;
        bestChargeRatio = null;
      }
    }

    // Also check active uncleansed Boss Pylons
    for (const pylon of state.pylons) {
      if (!pylon.active || pylon.cleansed) continue;
      const dx = pylon.pos.x - px;
      const dz = pylon.pos.z - pz;
      const distSq = dx * dx + dz * dz;
      const reach = Math.max(4.0, pylon.radius + 1.5);
      if (distSq <= reach * reach && distSq < bestDistSq) {
        bestDistSq = distSq;
        bestLabel = pylon.stolenWeaponId
          ? `CLEANSE PYLON #${pylon.index + 1}`
          : `CHARGE PYLON #${pylon.index + 1}`;
        bestCost = 0;
        bestChargeRatio =
          pylon.chargeDurationSec > 0 ? Math.min(1, pylon.chargeProgress / pylon.chargeDurationSec) : null;
      }
    }

    if (!bestLabel) {
      this.interactBox.classList.remove('is-active');
      return null;
    }

    this.interactBox.classList.add('is-active');
    this.interactGlyph.textContent = interactGlyphForDevice(device, profile);
    this.interactName.textContent = bestLabel;
    this.interactCost.textContent = bestCost > 0 ? `${bestCost}G` : '';

    if (bestChargeRatio !== null) {
      this.interactChargeTrack.classList.add('is-active');
      this.interactChargeFill.style.width = `${(bestChargeRatio * 100).toFixed(1)}%`;
    } else {
      this.interactChargeTrack.classList.remove('is-active');
    }

    return bestLabel;
  }
}
