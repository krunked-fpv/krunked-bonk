import {
  FOV_MAX,
  FOV_MIN,
  GAME_TITLE,
  type ChallengeDef,
  type CharacterDef,
  type CharacterId,
  type DraftOfferChoice,
  type FpsCap,
  type GameCatalog,
  type GamepadProfile,
  type GamePhase,
  type GrassQuality,
  type InputDeviceKind,
  type MapDef,
  type MapId,
  type MapTier,
  type MetaShopUpgradeDef,
  type QuestDef,
  type RenderSettings,
  type SaveData,
  type ShopUpgradeId,
  type SimState,
} from '../contracts';

export interface BoomboxTrackOption {
  readonly id: string;
  readonly label: string;
}

export interface UiCallbacks {
  onPlay: () => void;
  onOpenCharacters: () => void;
  onOpenQuests?: () => void;
  onOpenShop: () => void;
  onOpenOptions: () => void;
  onCloseOptions: () => void;
  onBackToTitle: () => void;
  onSelectCharacter: (characterId: CharacterId) => void;
  onSelectSkin?: (skinId: string | null) => void;
  onSelectHat?: (hatId: string | null) => void;
  onSelectMap: (mapId: MapId) => void;
  onSelectMapTier: (tier: MapTier) => void;
  onSelectChallenge?: (challengeId: string | null) => void;
  onStartRun: () => void;
  onResume: () => void;
  onRestartRun: () => void;
  onAbandonRun: () => void;
  onSelectDraftChoice: (choiceIndex: number) => void;
  onRerollDraft: () => void;
  onBanishDraftChoice: (choiceIndex: number) => void;
  onSkipDraft: () => void;
  onBuyShopUpgrade: (upgradeId: ShopUpgradeId, costSilver: number) => void;
  onRefundShopUpgrade?: (upgradeId: ShopUpgradeId) => void;
  onRefundAllShopUpgrades?: () => void;
  onClaimQuest?: (questId: string) => void;
  onSelectBoomboxTrack?: (trackId: string) => void;
  onUpdateSettings: (patch: Partial<RenderSettings>) => void;
  onRecalibrateGamepad: () => boolean;
  onLoadCustomPack: () => void;
  onToggleCustomPack: (enabled: boolean) => void;
}

export interface MenusViewState {
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
  boomboxTracks?: readonly BoomboxTrackOption[];
}

export const DEFAULT_BOOMBOX_TRACKS: readonly BoomboxTrackOption[] = Object.freeze([
  { id: 'auto', label: 'AUTO (ADAPTIVE)' },
  { id: 'title', label: 'TITLE — GOTHIC SYNTH' },
  { id: 'forest_1', label: 'GREEN FOREST (T1)' },
  { id: 'forest_2', label: 'DEEP FOREST (T2)' },
  { id: 'forest_3', label: 'CURSED FOREST (T3)' },
  { id: 'forest_boss', label: 'FOREST BOSS — LIL BARK' },
  { id: 'desert_1', label: 'CRUSTY DESERT (T1)' },
  { id: 'desert_2', label: 'TWILIGHT DESERT (T2)' },
  { id: 'desert_3', label: 'SCORCHED DESERT (T3)' },
  { id: 'desert_boss', label: 'DESERT BOSS — PHARAOH' },
  { id: 'graveyard', label: 'HOLLOW GRAVEYARD' },
  { id: 'graveyard_boss', label: 'GRAVEYARD BOSS — BIG BOB' },
  { id: 'final_boss', label: 'FINAL BOSS CITADEL' },
  { id: 'final_swarm', label: 'FINAL SWARM OVERDRIVE' },
  { id: 'calcium', label: 'CALCIUM — SKATE PUNK' },
  { id: 'megachad', label: 'MEGACHAD — FLEX ANTHEM' },
  { id: 'dicy', label: 'DICEHEAD — FUNKY CHIP' },
  { id: 'space', label: 'SPACEMAN — COSMIC SYNTH' },
  { id: 'victory', label: 'VICTORY FANFARE' },
  { id: 'game_over', label: 'GAME OVER DIRGE' },
]);

export function computeShopUpgradeCost(def: MetaShopUpgradeDef, currentRank: number): number {
  const rank = Math.max(0, Math.floor(currentRank));
  return Math.max(1, Math.round(def.baseSilverCost * Math.pow(def.costGrowthMult, rank)));
}

function computeTotalUpgradeSpent(def: MetaShopUpgradeDef, rank: number): number {
  const clamped = Math.max(0, Math.min(def.maxRank, Math.floor(rank)));
  let total = 0;
  for (let r = 0; r < clamped; r++) {
    total += computeShopUpgradeCost(def, r);
  }
  return total;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

const PERCENT_STAT_LABELS: Record<string, string> = {
  Evasion: 'Evasion',
  MoveSpeed: 'Move Speed',
  Luck: 'Luck',
  Armor: 'Armor',
  CritChance: 'Crit Chance',
  CritDamage: 'Crit Damage',
  MegacritMultiplier: 'Megacrit',
  BonkerChance: 'Bonker Chance',
  ExecuteThreshold: 'Execute',
  DamageMultiplier: 'Damage',
  AttackSpeed: 'Attack Speed',
  CooldownReduction: 'Cooldown',
  Lifesteal: 'Lifesteal',
  DamageReduction: 'Dmg Resist',
  FallDamageReduction: 'Fall Resist',
  EliteDamageMultiplier: 'Elite Dmg',
  BossDamageMultiplier: 'Boss Dmg',
  MeleeDamageMultiplier: 'Melee Dmg',
  SummonDamageMultiplier: 'Summon Dmg',
  FireDamageMultiplier: 'Fire Dmg',
  IceDamageMultiplier: 'Ice Dmg',
  LightningDamageMultiplier: 'Lightning Dmg',
  PoisonDamageMultiplier: 'Poison Dmg',
  VoidDamageMultiplier: 'Void Dmg',
  HolyDamageMultiplier: 'Holy Dmg',
  StatusChance: 'Status Chance',
  StatusDuration: 'Status Dur',
  StatusDamageMultiplier: 'Status Dmg',
  ProcCoefficientBonus: 'Proc Coeff',
  Knockback: 'Knockback',
  AreaSize: 'Area Size',
  ProjectileSpeed: 'Proj Speed',
  Duration: 'Duration',
  AttackRange: 'Range',
  AirControl: 'Air Control',
  SlideSpeedMultiplier: 'Slide Speed',
  SlideAcceleration: 'Slide Accel',
  XpMultiplier: 'XP Gain',
  GoldMultiplier: 'Gold Gain',
  SilverMultiplier: 'Silver Gain',
  Difficulty: 'Difficulty',
};

const FLAT_STAT_META: Record<string, { label: string; unit?: string }> = {
  MaxHealth: { label: 'Max HP' },
  HealthRegen: { label: 'HP/s' },
  Overheal: { label: 'Overheal' },
  Shield: { label: 'Shield' },
  ShieldRegen: { label: 'Shield/s' },
  JumpHeight: { label: 'Jump' },
  ExtraJumps: { label: 'Extra Jump' },
  PickupRange: { label: 'Pickup', unit: 'm' },
  ProjectileCount: { label: 'Proj' },
  ProjectileBounces: { label: 'Bounces' },
  ProjectilePierce: { label: 'Pierce' },
  ChainCount: { label: 'Chains' },
  SummonLimit: { label: 'Summons' },
  ExtraProcRolls: { label: 'Proc Rolls' },
  Thorns: { label: 'Thorns' },
  WallClimbLimit: { label: 'Wall Climbs' },
};

function formatStatChip(key: string, value: number): string {
  const sign = value >= 0 ? '+' : '';
  if (key in PERCENT_STAT_LABELS) {
    const pct = Math.round(value * 100);
    return `${sign}${pct}% ${PERCENT_STAT_LABELS[key]}`;
  }
  const flat = FLAT_STAT_META[key];
  const numStr = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  if (flat) {
    return `${sign}${numStr}${flat.unit ?? ''} ${flat.label}`;
  }
  const friendly = key.replace(/([a-z])([A-Z])/g, '$1 $2');
  return `${sign}${numStr} ${friendly}`;
}

function formatDmg(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function formatShopEffectPreview(upg: MetaShopUpgradeDef, rank: number): string {
  const maxed = rank >= upg.maxRank;
  switch (upg.id) {
    case 'Weapons':
      return maxed
        ? `ACTIVE: ${2 + rank} WEAPON SLOTS (MAX)`
        : `NOW: ${2 + rank} SLOTS -> NEXT: ${2 + rank + 1} SLOTS`;
    case 'Tomes':
      return maxed
        ? `ACTIVE: ${2 + rank} TOME SLOTS (MAX)`
        : `NOW: ${2 + rank} SLOTS -> NEXT: ${2 + rank + 1} SLOTS`;
    case 'Refresh':
      return maxed
        ? `ACTIVE: ${rank} REROLLS / RUN (MAX)`
        : `NOW: ${rank} REROLLS -> NEXT: ${rank + 1} / RUN`;
    case 'Skip':
      return maxed
        ? `ACTIVE: ${rank} SKIPS / RUN (MAX)`
        : `NOW: ${rank} SKIPS -> NEXT: ${rank + 1} / RUN`;
    case 'Banish':
      return maxed
        ? `ACTIVE: ${rank} BANISHES / RUN (MAX)`
        : `NOW: ${rank} BANISHES -> NEXT: ${rank + 1} / RUN`;
    case 'SilverMultiplier':
      return maxed
        ? `ACTIVE: +${rank * 5}% SILVER GAIN (MAX)`
        : `NOW: +${rank * 5}% -> NEXT: +${(rank + 1) * 5}% SILVER`;
    case 'Boombox':
      return rank >= 1
        ? 'UNLOCKED — CUSTOM OST IN PAUSE & OPTIONS'
        : 'UNLOCKS 18+ TRACKS IN PAUSE & OPTIONS';
    case 'Toggler':
      return rank >= 1
        ? 'UNLOCKED — CATALOG POOL TOGGLER ACTIVE'
        : 'UNLOCKS RUN POOL ITEM/WEAPON TOGGLING';
    default:
      return `RANK ${rank} / ${upg.maxRank}`;
  }
}

function formatChallengeRuleBadges(ch: ChallengeDef): string[] {
  const badges: string[] = [];
  if (ch.mapId) {
    badges.push(`${ch.mapId.toUpperCase()} ONLY`);
  }
  const r = ch.rules;
  if (r.oneHpMode) badges.push('1 HP');
  if (r.maxWeapons !== undefined) badges.push(`${r.maxWeapons} WPN MAX`);
  if (r.disableTomes) badges.push('NO TOMES');
  if (r.timerScale !== undefined && r.timerScale !== 1) {
    const pace = Math.round((1 / Math.max(0.1, r.timerScale)) * 10) / 10;
    badges.push(`${pace}x CLOCK`);
  }
  if (r.speedMultiplier !== undefined && r.speedMultiplier !== 1) {
    badges.push(`SPD x${r.speedMultiplier}`);
  }
  if (r.enemyHpMultiplier !== undefined && r.enemyHpMultiplier !== 1) {
    badges.push(`FOE HP x${r.enemyHpMultiplier}`);
  }
  if (r.enemyDamageMultiplier !== undefined && r.enemyDamageMultiplier !== 1) {
    badges.push(`FOE DMG x${r.enemyDamageMultiplier}`);
  }
  if (badges.length === 0 && ch.statModifiers && ch.statModifiers.length > 0) {
    for (const m of ch.statModifiers.slice(0, 2)) {
      const val = m.mult ?? m.add ?? m.flat ?? 0;
      if (val !== 0) badges.push(formatStatChip(m.stat, val).toUpperCase());
    }
  }
  if (badges.length === 0) {
    badges.push('SPECIAL RULES');
  }
  return badges;
}

function getQuestMetricValue(save: Readonly<SaveData>, metricKey: string): number {
  const direct = save.questProgress[metricKey];
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    if (metricKey === 'totalKills' || metricKey === 'total_kills') {
      return Math.max(direct, save.totalKills);
    }
    return direct;
  }

  // Cross-match camelCase <-> snake_case progress keys gracefully
  const snake = metricKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const camel = metricKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const aliasVal =
    save.questProgress[snake] ??
    save.questProgress[camel] ??
    (metricKey === 'megacritsLanded' ? save.questProgress.megacrits : undefined) ??
    (metricKey === 'bonkersLanded' ? save.questProgress.bonkers : undefined);

  const base = typeof aliasVal === 'number' && Number.isFinite(aliasVal) ? aliasVal : 0;
  if (metricKey === 'totalKills' || metricKey === 'total_kills') {
    return Math.max(base, save.totalKills);
  }
  return base;
}

function resolveQuestUnlockBadges(
  quest: QuestDef,
  catalog: Readonly<GameCatalog>,
): { kind: string; label: string }[] {
  const out: { kind: string; label: string }[] = [];
  const u = quest.unlocks;
  if (!u) return out;
  if (u.characterId) {
    const c = catalog.characters.find((x) => x.id === u.characterId);
    out.push({ kind: 'CHAR', label: c?.displayName ?? u.characterId });
  }
  if (u.weaponId) {
    const w = catalog.weapons.find((x) => x.id === u.weaponId);
    out.push({ kind: 'WPN', label: w?.displayName ?? u.weaponId });
  }
  if (u.tomeId) {
    const t = catalog.tomes.find((x) => x.id === u.tomeId);
    out.push({ kind: 'TOME', label: t?.displayName ?? u.tomeId });
  }
  if (u.itemId) {
    const it = catalog.items.find((x) => x.id === u.itemId);
    out.push({ kind: 'ITEM', label: it?.displayName ?? u.itemId });
  }
  if (u.mapId) {
    const m = catalog.maps.find((x) => x.id === u.mapId);
    out.push({ kind: 'MAP', label: m?.displayName ?? u.mapId });
  }
  if (u.skinId) {
    const sk = catalog.skins.find((x) => x.id === u.skinId);
    out.push({ kind: 'SKIN', label: sk?.displayName ?? u.skinId });
  }
  if (u.hatId) {
    const h = catalog.hats.find((x) => x.id === u.hatId);
    out.push({ kind: 'HAT', label: h?.displayName ?? u.hatId });
  }
  return out;
}

function profileLabel(profile: GamepadProfile): string {
  switch (profile) {
    case 'xbox':
      return 'XBOX';
    case 'playstation':
      return 'PLAYSTATION';
    case 'switch':
      return 'NINTENDO SWITCH';
    case 'steam_deck':
      return 'STEAM DECK';
    case 'tesla':
      return 'TESLA GAMEPAD';
    default:
      return 'GAMEPAD';
  }
}

function deviceHintText(device: InputDeviceKind, profile: GamepadProfile): string {
  if (device === 'touch') {
    return 'TAP CONTROLS TO NAVIGATE  •  TOUCH CONTROLS AUTO-ACTIVATE IN RUN';
  }
  if (device === 'gamepad') {
    const confirm = profile === 'playstation' ? 'CROSS' : profile === 'switch' ? 'B' : 'A';
    const cancel = profile === 'playstation' ? 'CIRCLE' : profile === 'switch' ? 'A' : 'B';
    return `${profileLabel(profile)}: D-PAD / L-STICK MOVE  •  ${confirm} CONFIRM  •  ${cancel} BACK`;
  }
  return 'WASD / ARROWS NAVIGATE  •  ENTER / SPACE CONFIRM  •  ESC BACK';
}

const MENU_PHASES: ReadonlySet<GamePhase> = new Set([
  'title',
  'character_select',
  'map_select',
  'shop',
  'quests',
  'settings',
  'paused',
  'level_up',
  'chest_open',
  'merchant',
  'microwave',
  'victory',
  'game_over',
]);

export class MenusOverlay {
  private readonly callbacks: UiCallbacks;
  private root: HTMLDivElement | null = null;
  private lastSignature = '';
  private banishArmed = false;
  private calibrationMessage = '';
  private onRerenderCallback: (() => void) | null = null;

  public constructor(callbacks: UiCallbacks) {
    this.callbacks = callbacks;
  }

  public setOnRerender(cb: (() => void) | null): void {
    this.onRerenderCallback = cb;
  }

  public mount(host: HTMLElement): void {
    if (this.root || typeof document === 'undefined') return;
    const root = document.createElement('div');
    root.className = 'kb-menus';
    root.setAttribute('data-kb-menus', 'true');
    host.appendChild(root);
    this.root = root;
  }

  public getRoot(): HTMLDivElement | null {
    return this.root;
  }

  public isBanishArmed(): boolean {
    return this.banishArmed;
  }

  public setBanishArmed(armed: boolean): void {
    if (this.banishArmed === armed) return;
    this.banishArmed = armed;
    this.lastSignature = '';
  }

  public isMenuPhase(phase: GamePhase): boolean {
    return MENU_PHASES.has(phase);
  }

  /**
   * Renders the current menu screen only when relevant view state changes.
   * Returns true if DOM was rebuilt (so UiController can restore/assign focus).
   */
  public render(view: MenusViewState): boolean {
    if (!this.root) return false;
    const visible = this.isMenuPhase(view.phase);
    this.root.classList.toggle('is-visible', visible);
    this.root.classList.toggle('is-title', visible && view.phase === 'title');
    if (!visible) {
      this.banishArmed = false;
      if (this.lastSignature !== '') {
        this.root.replaceChildren();
        this.lastSignature = '';
      }
      return false;
    }

    const sig = this.buildSignature(view);
    if (sig === this.lastSignature) {
      return false;
    }
    this.lastSignature = sig;
    this.root.replaceChildren();

    switch (view.phase) {
      case 'title':
        this.root.appendChild(this.renderTitle(view));
        break;
      case 'character_select':
      case 'map_select':
        this.root.appendChild(this.renderCharacterAndMapSelect(view));
        break;
      case 'quests':
        this.root.appendChild(this.renderQuestsScreen(view));
        break;
      case 'level_up':
      case 'chest_open':
      case 'merchant':
      case 'microwave':
        this.root.appendChild(this.renderDraftModal(view));
        break;
      case 'shop':
        this.root.appendChild(this.renderMetaShop(view));
        break;
      case 'paused':
        this.root.appendChild(this.renderPauseMenu(view));
        break;
      case 'settings':
        this.root.appendChild(this.renderOptionsModal(view));
        break;
      case 'victory':
      case 'game_over':
        this.root.appendChild(this.renderSummaryScreen(view));
        break;
      default:
        break;
    }

    return true;
  }

  public dispose(): void {
    this.root?.remove();
    this.root = null;
    this.lastSignature = '';
    this.banishArmed = false;
  }

  private buildSignature(view: MenusViewState): string {
    const { phase, save, settings, state } = view;
    const offerSig = state?.pendingOffer
      ? `${state.pendingOffer.source}:${state.pendingOffer.title}:${state.pendingOffer.choices
          .map((c) => `${c.index}-${c.refId}-${c.nextLevel ?? 0}-${c.goldCost ?? 0}`)
          .join(',')}:${state.rerollsLeft}:${state.skipsLeft}:${state.banishesLeft}:${Math.floor(state.player.gold)}:${this.banishArmed}`
      : 'none';
    const shopSig = Object.entries(save.shopLevels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    const settingsSig =
      phase === 'settings'
        ? JSON.stringify(settings) + `|${this.calibrationMessage}|${view.gamepadConnected}`
        : `${settings.unlockAll}|${settings.boomboxTrack}`;
    const runSig =
      phase === 'paused' || phase === 'victory' || phase === 'game_over'
        ? `${state?.simTimeSec.toFixed(0)}:${state?.player.level}:${state?.player.kills}:${state?.player.weapons.length}`
        : phase === 'microwave'
          ? state?.player.items.map((it) => `${it.itemId}:${it.stacks}`).join(',') ?? ''
          : '';
    const questSig =
      phase === 'quests' || phase === 'title'
        ? `${save.claimedQuests.join(',')}:${save.totalKills}:${JSON.stringify(save.questProgress)}`
        : '';
    const unlockSig =
      phase === 'character_select' || phase === 'map_select'
        ? `${save.unlockedCharacters.length}:${save.unlockedSkins.length}:${save.unlockedHats.length}:${save.unlockedMaps.length}:${save.completedChallenges.length}`
        : '';

    return [
      phase,
      save.silver,
      save.selectedCharacter,
      save.selectedSkin ?? '',
      save.selectedHat ?? '',
      save.selectedMap,
      save.selectedMapTier,
      save.selectedChallenge ?? '',
      save.customPackEnabled,
      view.customPackLoaded,
      view.customPackName ?? '',
      view.activeDevice,
      view.gamepadProfile,
      view.catalog.characters.length,
      view.catalog.challenges.length,
      view.catalog.quests.length,
      view.boomboxTracks?.length ?? 0,
      shopSig,
      offerSig,
      settingsSig,
      runSig,
      questSig,
      unlockSig,
    ].join('|');
  }

  private getBoomboxOptions(view: MenusViewState): readonly { value: string; label: string }[] {
    const tracks = view.boomboxTracks;
    if (tracks && tracks.length > 0) {
      const seen = new Set<string>(['auto']);
      const list: { value: string; label: string }[] = [{ value: 'auto', label: 'AUTO (ADAPTIVE)' }];
      for (const t of tracks) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          list.push({ value: t.id, label: t.label.toUpperCase() });
        }
      }
      return list;
    }
    return DEFAULT_BOOMBOX_TRACKS.map((t) => ({ value: t.id, label: t.label }));
  }

  private handleSelectBoomboxTrack(trackId: string): void {
    if (this.callbacks.onSelectBoomboxTrack) {
      this.callbacks.onSelectBoomboxTrack(trackId);
    } else {
      this.callbacks.onUpdateSettings({ boomboxTrack: trackId });
    }
  }

  private renderBoomboxRow(view: MenusViewState, focusId: string): HTMLDivElement {
    const unlocked = (view.save.shopLevels.Boombox ?? 0) >= 1 || Boolean(view.settings.unlockAll);
    if (!unlocked) {
      const row = document.createElement('div');
      row.className = 'kb-opt-row kb-opt-row--locked';
      const lbl = document.createElement('span');
      lbl.className = 'kb-opt-label';
      lbl.textContent = 'BOOMBOX TRACK';
      const lockedBtn = this.makeButton(
        'LOCKED (META SHOP)',
        focusId,
        'kb-btn--sm',
        () => {},
      );
      lockedBtn.disabled = true;
      row.append(lbl, lockedBtn);
      return row;
    }

    const options = this.getBoomboxOptions(view);
    const current = view.settings.boomboxTrack || 'auto';
    return this.makeCycleRow('BOOMBOX TRACK', focusId, options, current, (nextTrack) =>
      this.handleSelectBoomboxTrack(nextTrack),
    );
  }

  // --------------------------------------------------------------------------
  // 1. TITLE SCREEN
  // --------------------------------------------------------------------------
  private renderTitle(view: MenusViewState): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'kb-panel--gothic kb-title-screen';

    const logo = document.createElement('h1');
    logo.className = 'kb-logo';
    logo.textContent = GAME_TITLE;

    const sub = document.createElement('p');
    sub.className = 'kb-logo-sub';
    sub.textContent = '3D KINETIC PIXEL-GOTHIC HORDE SURVIVOR';

    const statusRow = document.createElement('div');
    statusRow.className = 'kb-hint-bar';
    const silverBadge = document.createElement('span');
    silverBadge.className = 'kb-badge kb-badge--silver';
    silverBadge.textContent = `SILVER: ${view.save.silver}`;
    const deviceBadge = document.createElement('span');
    deviceBadge.className = 'kb-badge kb-badge--cyan';
    deviceBadge.textContent =
      view.activeDevice === 'gamepad'
        ? `CONTROLLER: ${profileLabel(view.gamepadProfile)}`
        : view.activeDevice === 'touch'
          ? 'INPUT: TOUCH'
          : 'INPUT: KEYBOARD & MOUSE';
    statusRow.append(silverBadge, deviceBadge);

    // Count claimable quests for live Title indicator
    const claimedSet = new Set(view.save.claimedQuests);
    let claimableCount = 0;
    for (const q of view.catalog.quests) {
      if (!claimedSet.has(q.id) && getQuestMetricValue(view.save, q.metricKey) >= q.targetValue) {
        claimableCount += 1;
      }
    }

    const nav = document.createElement('div');
    nav.className = 'kb-title-nav';

    const playBtn = this.makeButton('PLAY', 'title-play', 'kb-btn--primary', () =>
      this.callbacks.onPlay(),
    );
    playBtn.setAttribute('data-kb-focus-default', 'true');

    const questsLabel =
      claimableCount > 0
        ? `QUESTS (${claimableCount} READY!)`
        : `QUESTS (${view.save.claimedQuests.length}/${view.catalog.quests.length})`;

    nav.append(
      playBtn,
      this.makeButton('CHARACTERS', 'title-chars', '', () =>
        this.callbacks.onOpenCharacters(),
      ),
      this.makeButton(
        questsLabel,
        'title-quests',
        claimableCount > 0 ? 'kb-btn--accent' : '',
        () => this.callbacks.onOpenQuests?.(),
      ),
      this.makeButton(`META SHOP (${view.save.silver} SILVER)`, 'title-shop', '', () =>
        this.callbacks.onOpenShop(),
      ),
      this.makeButton('OPTIONS', 'title-options', '', () => this.callbacks.onOpenOptions()),
    );

    // Custom Pack Loader + Live Art Source Toggle
    const packRow = document.createElement('div');
    packRow.className = 'kb-pack-row';

    const loadPackBtn = this.makeButton(
      view.customPackLoaded ? 'RELOAD CUSTOM PACK' : 'LOAD CUSTOM PACK',
      'title-load-pack',
      'kb-btn--sm',
      () => this.callbacks.onLoadCustomPack(),
    );

    const usingCustom = Boolean(view.save.customPackEnabled && view.customPackLoaded);
    const artToggleBtn = this.makeButton(
      usingCustom ? 'USE CUSTOM PACK' : 'USE BUILT-IN ART',
      'title-toggle-pack',
      usingCustom ? 'kb-btn--sm kb-btn--accent' : 'kb-btn--sm',
      () => this.callbacks.onToggleCustomPack(!view.save.customPackEnabled),
    );
    artToggleBtn.setAttribute('data-kb-art-toggle', usingCustom ? 'custom' : 'builtin');

    packRow.append(loadPackBtn, artToggleBtn);

    const hints = document.createElement('div');
    hints.className = 'kb-hint-bar';
    hints.textContent = deviceHintText(view.activeDevice, view.gamepadProfile);

    panel.append(logo, sub, statusRow, nav, packRow, hints);
    return panel;
  }

  // --------------------------------------------------------------------------
  // 2. 21-CHARACTER SELECT + SKINS & HATS + MAP, TIER & CHALLENGES
  // --------------------------------------------------------------------------
  private renderCharacterAndMapSelect(view: MenusViewState): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal kb-modal--wide';

    const unlockedChars = new Set(view.save.unlockedCharacters);
    const unlockedCount = view.catalog.characters.filter(
      (c) => view.settings.unlockAll || c.unlockedByDefault || unlockedChars.has(c.id),
    ).length;

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('h2');
    title.className = 'kb-modal-title';
    title.textContent = 'CHOOSE FIGHTER & ARENA';
    const badgeWrap = document.createElement('div');
    badgeWrap.className = 'kb-header-badges';
    const countBadge = document.createElement('span');
    countBadge.className = 'kb-badge';
    countBadge.textContent = `${unlockedCount} / ${view.catalog.characters.length} FIGHTERS`;
    badgeWrap.appendChild(countBadge);
    if (view.settings.unlockAll) {
      const unlockBadge = document.createElement('span');
      unlockBadge.className = 'kb-badge kb-badge--cyan';
      unlockBadge.textContent = 'UNLOCK ALL';
      badgeWrap.appendChild(unlockBadge);
    }
    header.append(title, badgeWrap);

    const body = document.createElement('div');
    body.className = 'kb-modal-body kb-modal-body--compact';

    const layout = document.createElement('div');
    layout.className = 'kb-select-layout';

    // Left column: 21-Character Compact Scrollable Grid
    const charWrap = document.createElement('div');
    charWrap.className = 'kb-char-column';
    const charHeading = document.createElement('div');
    charHeading.className = 'kb-section-label';
    charHeading.textContent = `FIGHTERS (${view.catalog.characters.length})`;
    const charGrid = document.createElement('div');
    charGrid.className = 'kb-char-grid';
    charGrid.setAttribute('data-kb-char-grid', 'true');

    const selectedCharDef =
      view.catalog.characters.find((c) => c.id === view.save.selectedCharacter) ??
      view.catalog.characters[0];

    for (const ch of view.catalog.characters) {
      const unlocked =
        view.settings.unlockAll || ch.unlockedByDefault || unlockedChars.has(ch.id);
      const isSelected = ch.id === selectedCharDef?.id;
      const card = this.renderCharacterCard(ch, view.catalog, isSelected, unlocked);
      if (isSelected && unlocked) {
        card.setAttribute('data-kb-focus-default', 'true');
      }
      charGrid.appendChild(card);
    }

    charWrap.append(charHeading, charGrid);

    // Right column: Fighter Inspector + Skins/Hats + Map/Tier + Challenges
    const inspector = document.createElement('div');
    inspector.className = 'kb-inspector';

    if (selectedCharDef) {
      const startWep = view.catalog.weapons.find((w) => w.id === selectedCharDef.startingWeaponId);
      const fighterHead = document.createElement('div');
      fighterHead.className = 'kb-inspector-head';

      const swatch = document.createElement('span');
      swatch.className = 'kb-swatch kb-swatch--lg';
      swatch.style.background = `linear-gradient(135deg, ${selectedCharDef.primaryColorHex} 55%, ${selectedCharDef.accentColorHex} 55%)`;

      const headText = document.createElement('div');
      headText.className = 'kb-inspector-title-wrap';
      const inspTitle = document.createElement('div');
      inspTitle.className = 'kb-inspector-name';
      inspTitle.textContent = `${selectedCharDef.displayName.toUpperCase()} — ${selectedCharDef.title}`;
      const wepLine = document.createElement('div');
      wepLine.className = 'kb-char-weapon';
      wepLine.textContent = `STARTER: ${startWep?.displayName ?? selectedCharDef.startingWeaponId}`;
      headText.append(inspTitle, wepLine);
      fighterHead.append(swatch, headText);

      // Passive Card
      const passiveCard = document.createElement('div');
      passiveCard.className = 'kb-passive-card';
      const passiveTitle = document.createElement('div');
      passiveTitle.className = 'kb-passive-card-title';
      passiveTitle.textContent = `PASSIVE: ${selectedCharDef.passive.name}`;
      const passiveDesc = document.createElement('div');
      passiveDesc.className = 'kb-passive-card-desc';
      passiveDesc.textContent = selectedCharDef.passive.description;
      passiveCard.append(passiveTitle, passiveDesc);

      // Human-formatted stat badges
      const statRow = document.createElement('div');
      statRow.className = 'kb-chip-row';
      for (const [k, v] of Object.entries(selectedCharDef.baseStats)) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v === 0) continue;
        const chip = document.createElement('span');
        chip.className = v > 0 ? 'kb-stat-chip kb-stat-chip--pos' : 'kb-stat-chip kb-stat-chip--neg';
        chip.textContent = formatStatChip(k, v);
        statRow.appendChild(chip);
      }

      inspector.append(fighterHead, passiveCard, statRow);

      // Inline Skin Selector Pills for selected character
      const charSkins = view.catalog.skins.filter((sk) => sk.characterId === selectedCharDef.id);
      const unlockedSkins = new Set(view.save.unlockedSkins);
      const skinSec = document.createElement('div');
      skinSec.className = 'kb-cosmetic-sec';
      const skinHeading = document.createElement('div');
      skinHeading.className = 'kb-section-label';
      skinHeading.textContent = 'SKIN';
      const skinPills = document.createElement('div');
      skinPills.className = 'kb-cosmetic-pills';

      const defaultSkinSelected =
        !view.save.selectedSkin || !charSkins.some((sk) => sk.id === view.save.selectedSkin);
      skinPills.appendChild(
        this.makeCosmeticPill(
          'DEFAULT',
          'skin-default',
          selectedCharDef.primaryColorHex,
          selectedCharDef.accentColorHex,
          defaultSkinSelected,
          true,
          () => this.callbacks.onSelectSkin?.(null),
        ),
      );

      for (const sk of charSkins) {
        const skUnlocked =
          view.settings.unlockAll || !sk.unlockQuestId || unlockedSkins.has(sk.id);
        const skSelected = view.save.selectedSkin === sk.id;
        skinPills.appendChild(
          this.makeCosmeticPill(
            skUnlocked ? sk.displayName : `${sk.displayName} [LOCK]`,
            `skin-${sk.id}`,
            sk.primaryColorHex,
            sk.accentColorHex,
            skSelected,
            skUnlocked,
            () => this.callbacks.onSelectSkin?.(sk.id),
          ),
        );
      }

      skinSec.append(skinHeading, skinPills);
      inspector.appendChild(skinSec);

      // Inline Hat Selector Pills
      if (view.catalog.hats.length > 0) {
        const unlockedHats = new Set(view.save.unlockedHats);
        const hatSec = document.createElement('div');
        hatSec.className = 'kb-cosmetic-sec';
        const hatHeading = document.createElement('div');
        hatHeading.className = 'kb-section-label';
        hatHeading.textContent = 'HAT';
        const hatPills = document.createElement('div');
        hatPills.className = 'kb-cosmetic-pills';

        hatPills.appendChild(
          this.makeCosmeticPill(
            'NONE',
            'hat-none',
            '#475569',
            '#1e293b',
            view.save.selectedHat === null,
            true,
            () => this.callbacks.onSelectHat?.(null),
          ),
        );

        for (const hat of view.catalog.hats) {
          const hatUnlocked =
            view.settings.unlockAll || !hat.unlockQuestId || unlockedHats.has(hat.id);
          const hatSelected = view.save.selectedHat === hat.id;
          hatPills.appendChild(
            this.makeCosmeticPill(
              hatUnlocked ? hat.displayName : `${hat.displayName} [LOCK]`,
              `hat-${hat.id}`,
              hat.colorHex,
              hat.colorHex,
              hatSelected,
              hatUnlocked,
              () => this.callbacks.onSelectHat?.(hat.id),
            ),
          );
        }

        hatSec.append(hatHeading, hatPills);
        inspector.appendChild(hatSec);
      }
    }

    // Map Selector: All 3 active biomes + FinalBossMap (when unlocked or unlockAll)
    const mapHeading = document.createElement('div');
    mapHeading.className = 'kb-section-label';
    mapHeading.textContent = 'SELECT ARENA';
    const mapGrid = document.createElement('div');
    mapGrid.className = 'kb-map-grid';

    const unlockedMaps = new Set(view.save.unlockedMaps);
    const selectableMaps = view.catalog.maps.filter(
      (m) =>
        !m.isFinalBossMap ||
        view.settings.unlockAll ||
        m.unlockedByDefault ||
        unlockedMaps.has(m.id),
    );
    const activeMap: MapDef | undefined =
      selectableMaps.find((m) => m.id === view.save.selectedMap) ?? selectableMaps[0];

    for (const m of selectableMaps) {
      const mapUnlocked = view.settings.unlockAll || m.unlockedByDefault || unlockedMaps.has(m.id);
      const isSelected = m.id === activeMap?.id;
      const label = mapUnlocked
        ? `${m.displayName}${isSelected ? ' ★' : ''}`
        : `${m.displayName} [LOCK]`;
      const btn = this.makeButton(
        label,
        `map-${m.id}`,
        isSelected ? 'kb-btn--sm kb-btn--accent' : 'kb-btn--sm',
        () => this.callbacks.onSelectMap(m.id),
      );
      btn.disabled = !mapUnlocked;
      btn.title = m.description;
      mapGrid.appendChild(btn);
    }

    const mapDesc = document.createElement('div');
    mapDesc.className = 'kb-map-desc';
    mapDesc.textContent = activeMap?.description ?? '';

    // Tier 1 / 2 / 3 Selector
    const tierHeading = document.createElement('div');
    tierHeading.className = 'kb-section-label';
    tierHeading.textContent = 'SELECT TIER';
    const tierRow = document.createElement('div');
    tierRow.className = 'kb-tier-row';

    const tiers: readonly MapTier[] = activeMap?.tiers?.length ? activeMap.tiers : [1, 2, 3];
    for (const t of [1, 2, 3] as const) {
      const supported = tiers.includes(t);
      const isSelected = view.save.selectedMapTier === t;
      const btn = this.makeButton(
        `TIER ${t}`,
        `tier-${t}`,
        isSelected ? 'kb-btn--sm kb-btn--primary' : 'kb-btn--sm',
        () => this.callbacks.onSelectMapTier(t),
      );
      btn.disabled = !supported;
      tierRow.appendChild(btn);
    }

    inspector.append(mapHeading, mapGrid, mapDesc, tierHeading, tierRow);

    // Challenges Selector List (Name + Rules Badges + Silver Multiplier)
    if (view.catalog.challenges.length > 0) {
      const chHeading = document.createElement('div');
      chHeading.className = 'kb-section-label';
      chHeading.textContent = `CHALLENGES (${view.catalog.challenges.length})`;

      const chList = document.createElement('div');
      chList.className = 'kb-challenge-list';
      chList.setAttribute('data-kb-challenge-list', 'true');

      const completedSet = new Set(view.save.completedChallenges);

      // Standard Run option (no challenge)
      chList.appendChild(
        this.makeChallengeRow(
          'STANDARD RUN',
          ['NORMAL RULES'],
          1.0,
          'Classic run with no extra modifiers.',
          view.save.selectedChallenge === null,
          false,
          'challenge-none',
          () => this.callbacks.onSelectChallenge?.(null),
        ),
      );

      for (const ch of view.catalog.challenges) {
        const isSelected = view.save.selectedChallenge === ch.id;
        const isDone = completedSet.has(ch.id);
        chList.appendChild(
          this.makeChallengeRow(
            ch.displayName,
            formatChallengeRuleBadges(ch),
            ch.silverMultiplier,
            ch.description,
            isSelected,
            isDone,
            `challenge-${ch.id}`,
            () => this.callbacks.onSelectChallenge?.(ch.id),
          ),
        );
      }

      inspector.append(chHeading, chList);
    }

    layout.append(charWrap, inspector);
    body.appendChild(layout);

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';
    const backBtn = this.makeButton('BACK', 'select-back', '', () =>
      this.callbacks.onBackToTitle(),
    );
    const startBtn = this.makeButton('START RUN', 'select-start', 'kb-btn--primary', () =>
      this.callbacks.onStartRun(),
    );
    footer.append(backBtn, startBtn);

    modal.append(header, body, footer);
    return modal;
  }

  private renderCharacterCard(
    ch: CharacterDef,
    catalog: Readonly<GameCatalog>,
    selected: boolean,
    unlocked: boolean,
  ): HTMLButtonElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'kb-char-card';
    if (selected) card.classList.add('is-selected');
    if (!unlocked) card.classList.add('is-locked');
    card.disabled = !unlocked;
    card.setAttribute('data-kb-focus', 'true');
    card.setAttribute('data-kb-focus-id', `char-${ch.id}`);

    const top = document.createElement('div');
    top.className = 'kb-char-top';
    const swatch = document.createElement('span');
    swatch.className = 'kb-swatch';
    swatch.style.background = `linear-gradient(135deg, ${ch.primaryColorHex} 55%, ${ch.accentColorHex} 55%)`;
    const name = document.createElement('span');
    name.className = 'kb-char-name';
    name.textContent = unlocked ? ch.displayName : `${ch.displayName} [LOCK]`;
    top.append(swatch, name);

    const wep = catalog.weapons.find((w) => w.id === ch.startingWeaponId);
    const weaponLine = document.createElement('div');
    weaponLine.className = 'kb-char-weapon';
    weaponLine.textContent = wep?.displayName ?? ch.startingWeaponId;

    const passive = document.createElement('div');
    passive.className = 'kb-char-passive';
    passive.textContent = unlocked ? ch.passive.name : 'QUEST LOCKED';

    card.append(top, weaponLine, passive);
    card.addEventListener('click', () => {
      if (unlocked) this.callbacks.onSelectCharacter(ch.id);
    });
    return card;
  }

  private makeCosmeticPill(
    label: string,
    focusId: string,
    primaryHex: string,
    accentHex: string,
    selected: boolean,
    unlocked: boolean,
    onClick: () => void,
  ): HTMLButtonElement {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'kb-cosmetic-pill';
    if (selected) pill.classList.add('is-selected');
    if (!unlocked) pill.classList.add('is-locked');
    pill.disabled = !unlocked;
    pill.setAttribute('data-kb-focus', 'true');
    pill.setAttribute('data-kb-focus-id', focusId);

    const dot = document.createElement('span');
    dot.className = 'kb-cosmetic-dot';
    dot.style.background = `linear-gradient(135deg, ${primaryHex} 50%, ${accentHex} 50%)`;

    const text = document.createElement('span');
    text.textContent = label;
    pill.append(dot, text);
    pill.addEventListener('click', () => {
      if (unlocked) onClick();
    });
    return pill;
  }

  private makeChallengeRow(
    name: string,
    ruleBadges: readonly string[],
    silverMult: number,
    description: string,
    selected: boolean,
    completed: boolean,
    focusId: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kb-challenge-row';
    if (selected) btn.classList.add('is-selected');
    btn.setAttribute('data-kb-focus', 'true');
    btn.setAttribute('data-kb-focus-id', focusId);
    btn.title = description;

    const top = document.createElement('div');
    top.className = 'kb-challenge-top';

    const titleEl = document.createElement('span');
    titleEl.className = 'kb-challenge-name';
    titleEl.textContent = completed ? `${name} ✓` : name;

    const multBadge = document.createElement('span');
    multBadge.className =
      silverMult > 1 ? 'kb-challenge-mult kb-challenge-mult--boost' : 'kb-challenge-mult';
    const formattedMult = silverMult
      .toFixed(2)
      .replace(/(\.\d)0$/, '$1');
    multBadge.textContent = `${formattedMult}x SILVER`;

    top.append(titleEl, multBadge);

    const badgesWrap = document.createElement('div');
    badgesWrap.className = 'kb-chip-row';
    for (const rule of ruleBadges) {
      const b = document.createElement('span');
      b.className = 'kb-rule-badge';
      b.textContent = rule;
      badgesWrap.appendChild(b);
    }

    btn.append(top, badgesWrap);

    if (selected && description) {
      const descEl = document.createElement('div');
      descEl.className = 'kb-challenge-desc';
      descEl.textContent = description;
      btn.appendChild(descEl);
    }

    btn.addEventListener('click', onClick);
    return btn;
  }

  // --------------------------------------------------------------------------
  // 3. ENCOUNTER & DRAFT MODALS (LEVEL-UP / SHADY GUY / MICROWAVE / MOAI / SHRINE / CHEST)
  // --------------------------------------------------------------------------
  private renderDraftModal(view: MenusViewState): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal';

    const state = view.state;
    const offer = state?.pendingOffer;
    const source =
      offer?.source ??
      (view.phase === 'merchant'
        ? 'merchant'
        : view.phase === 'microwave'
          ? 'microwave'
          : view.phase === 'chest_open'
            ? 'chest'
            : 'level_up');

    const isMerchant = source === 'merchant' || view.phase === 'merchant';
    const isMicrowave = source === 'microwave' || view.phase === 'microwave';
    const isMoai = source === 'moai';
    const isChest = source === 'chest' || view.phase === 'chest_open';
    const isBalance =
      source === 'shrine' && Boolean(offer?.title.toUpperCase().includes('BALANCE'));
    const playerGold = state ? Math.floor(state.player.gold) : 0;

    modal.setAttribute('data-kb-encounter', source);

    const header = document.createElement('div');
    header.className = 'kb-modal-header';

    const title = document.createElement('h2');
    title.className = 'kb-modal-title';
    if (this.banishArmed) {
      title.textContent = 'SELECT AN OFFER TO BANISH';
      title.classList.add('kb-modal-title--crimson');
    } else if (offer?.title) {
      title.textContent = offer.title;
    } else if (isMerchant) {
      title.textContent = 'SHADY GUY — BLACK MARKET';
    } else if (isMicrowave) {
      title.textContent = 'MICROWAVE — ITEM CLONER';
    } else if (isMoai) {
      title.textContent = 'MOAI STATUE — ANCIENT OFFERING';
    } else if (isChest) {
      title.textContent = 'TREASURE CHEST';
    } else {
      title.textContent = 'CHOOSE AN UPGRADE';
    }

    const headerBadges = document.createElement('div');
    headerBadges.className = 'kb-header-badges';

    const choices: readonly DraftOfferChoice[] = offer?.choices ?? [];
    const hasGoldCosts =
      isMerchant || isMicrowave || choices.some((c) => c.goldCost !== undefined && c.goldCost > 0);
    if (hasGoldCosts && state) {
      const goldBadge = document.createElement('span');
      goldBadge.className = 'kb-badge kb-badge--gold';
      goldBadge.setAttribute('data-kb-player-gold', String(playerGold));
      goldBadge.textContent = `GOLD: ${playerGold}`;
      headerBadges.appendChild(goldBadge);
    }

    const sourceBadge = document.createElement('span');
    sourceBadge.className = 'kb-badge';
    sourceBadge.textContent = isMerchant
      ? 'SHADY GUY'
      : isMicrowave
        ? 'MICROWAVE'
        : isMoai
          ? 'MOAI SHRINE'
          : isBalance
            ? 'BALANCE SHRINE'
            : isChest
              ? 'CHEST'
              : source.replace('_', ' ').toUpperCase();
    headerBadges.appendChild(sourceBadge);
    header.append(title, headerBadges);

    const body = document.createElement('div');
    body.className = 'kb-modal-body';

    // Encounter contextual banner / warning
    if (isMicrowave) {
      const warn = document.createElement('div');
      warn.className = 'kb-encounter-warning';
      warn.textContent =
        'WARNING: Sacrifices 1 random same-tier item — explodes after max uses!';
      body.appendChild(warn);
    } else if (isMerchant) {
      const note = document.createElement('div');
      note.className = 'kb-encounter-note';
      note.textContent =
        'Spend Gold on a rare shady deal. Items you cannot afford are locked.';
      body.appendChild(note);
    } else if (isMoai) {
      const note = document.createElement('div');
      note.className = 'kb-encounter-note kb-encounter-note--cyan';
      note.textContent = 'Choose 1 relic from the ancient Moai carving.';
      body.appendChild(note);
    } else if (isBalance) {
      const note = document.createElement('div');
      note.className = 'kb-encounter-note kb-encounter-note--violet';
      note.textContent = 'Trade one stat down to amplify another permanently.';
      body.appendChild(note);
    }

    const grid = document.createElement('div');
    grid.className =
      choices.length > 3 ? 'kb-draft-grid kb-draft-grid--scroll' : 'kb-draft-grid';

    let affordableCount = 0;
    let firstFocusableAssigned = false;

    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i]!;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'kb-offer-card';
      card.setAttribute('data-rarity', choice.rarity);
      card.setAttribute('data-kb-focus', 'true');
      card.setAttribute('data-kb-focus-id', `draft-choice-${choice.index}`);
      card.setAttribute('data-kb-draft-index', String(choice.index));
      if (this.banishArmed) card.classList.add('is-banish-armed');

      const goldCost = choice.goldCost ?? 0;
      const cantAfford = goldCost > 0 && state !== null && state.player.gold < goldCost;
      if (cantAfford && !this.banishArmed) {
        card.disabled = true;
        card.classList.add('is-unaffordable');
      } else {
        affordableCount += 1;
        if (!firstFocusableAssigned) {
          card.setAttribute('data-kb-focus-default', 'true');
          firstFocusableAssigned = true;
        }
      }

      const top = document.createElement('div');
      top.className = 'kb-offer-top';
      const rarity = document.createElement('span');
      rarity.className = 'kb-offer-rarity';
      const catLabel =
        choice.category === 'duplicate_item'
          ? 'CLONE'
          : choice.category === 'stat_blessing'
            ? isBalance
              ? 'TRADE'
              : 'BLESSING'
            : choice.category.replace('_', ' ');
      rarity.textContent = `${choice.rarity} • ${catLabel}`;
      const key = document.createElement('span');
      key.className = 'kb-offer-key';
      key.textContent = `[${i + 1}]`;
      top.append(rarity, key);

      const name = document.createElement('div');
      name.className = 'kb-offer-name';
      name.textContent = choice.displayName;

      const diff = document.createElement('div');
      diff.className = 'kb-offer-diff';

      if (this.banishArmed) {
        diff.textContent = 'CLICK / CONFIRM TO BANISH FROM RUN';
        diff.classList.add('is-danger');
      } else if (isMicrowave || choice.category === 'duplicate_item') {
        const ownedStacks =
          state?.player.items.find((it) => it.itemId === choice.refId)?.stacks ?? 1;
        diff.textContent = `CLONE ITEM: x${ownedStacks} -> x${ownedStacks + 1}`;
      } else if (choice.nextLevel !== undefined) {
        diff.textContent =
          choice.nextLevel <= 1
            ? 'NEW UNLOCK (LV 1)'
            : `LV ${choice.nextLevel - 1} -> LV ${choice.nextLevel}`;
      } else if (choice.category === 'item') {
        const ownedStacks =
          state?.player.items.find((it) => it.itemId === choice.refId)?.stacks ?? 0;
        diff.textContent =
          ownedStacks > 0 ? `STACK x${ownedStacks} -> x${ownedStacks + 1}` : 'NEW ITEM (+1 STACK)';
      } else if (choice.category === 'stat_blessing') {
        diff.textContent = isBalance ? 'PERMANENT STAT TRADE' : 'PERMANENT BLESSING';
      } else {
        diff.textContent = '+1 STACK / BOON';
      }

      const desc = document.createElement('div');
      desc.className = 'kb-offer-desc';
      desc.textContent = choice.description;

      card.append(top, name, diff, desc);

      // Explicit Gold price tag footer on Merchant / Microwave / paid offers
      if (choice.goldCost !== undefined) {
        const priceTag = document.createElement('div');
        priceTag.className = cantAfford
          ? 'kb-offer-price kb-offer-price--locked'
          : 'kb-offer-price';
        priceTag.textContent =
          goldCost <= 0
            ? 'FREE'
            : cantAfford
              ? `COST: ${goldCost} GOLD (INSUFFICIENT)`
              : `COST: ${goldCost} GOLD`;
        card.appendChild(priceTag);
      }

      card.addEventListener('click', () => {
        if (this.banishArmed) {
          this.banishArmed = false;
          this.callbacks.onBanishDraftChoice(choice.index);
        } else if (!cantAfford) {
          this.callbacks.onSelectDraftChoice(choice.index);
        }
      });

      grid.appendChild(card);
    }

    if (choices.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'kb-encounter-note';
      empty.textContent = isMicrowave
        ? 'No eligible owned items available to clone.'
        : 'No offers available right now.';
      body.appendChild(empty);
    } else {
      body.appendChild(grid);
    }

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';

    const actions = document.createElement('div');
    actions.className = 'kb-draft-actions';

    const rerolls = state?.rerollsLeft ?? 0;
    const skips = state?.skipsLeft ?? 0;
    const banishes = state?.banishesLeft ?? 0;

    if (isMerchant || isMicrowave) {
      if (offer?.canReroll) {
        const refreshBtn = this.makeButton(
          `REFRESH (${rerolls})`,
          'draft-reroll',
          'kb-btn--sm kb-btn--accent',
          () => this.callbacks.onRerollDraft(),
        );
        refreshBtn.disabled = rerolls <= 0;
        actions.appendChild(refreshBtn);
      }

      const leaveLabel = isMerchant ? 'LEAVE SHOP' : 'LEAVE MICROWAVE';
      const leaveBtn = this.makeButton(leaveLabel, 'draft-leave', 'kb-btn--sm', () => {
        this.banishArmed = false;
        this.callbacks.onSkipDraft();
      });
      if (!firstFocusableAssigned || affordableCount === 0) {
        leaveBtn.setAttribute('data-kb-focus-default', 'true');
      }
      actions.appendChild(leaveBtn);
    } else {
      const refreshBtn = this.makeButton(
        `REFRESH (${rerolls})`,
        'draft-reroll',
        'kb-btn--sm kb-btn--accent',
        () => {
          this.banishArmed = false;
          this.callbacks.onRerollDraft();
        },
      );
      refreshBtn.disabled = !offer?.canReroll || rerolls <= 0;

      const skipBtn = this.makeButton(`SKIP (${skips})`, 'draft-skip', 'kb-btn--sm', () => {
        this.banishArmed = false;
        this.callbacks.onSkipDraft();
      });
      skipBtn.disabled = !offer?.canSkip || skips <= 0;

      const banishBtn = this.makeButton(
        this.banishArmed ? 'CANCEL BANISH' : `BANISH (${banishes})`,
        'draft-banish',
        'kb-btn--sm kb-btn--danger',
        () => {
          this.banishArmed = !this.banishArmed;
          this.lastSignature = '';
          if (this.render(view)) {
            this.onRerenderCallback?.();
          }
        },
      );
      banishBtn.disabled = !this.banishArmed && (!offer?.canBanish || banishes <= 0);

      actions.append(refreshBtn, skipBtn, banishBtn);
    }

    const hint = document.createElement('div');
    hint.className = 'kb-hint-bar';
    if (isMerchant || isMicrowave) {
      hint.textContent =
        view.activeDevice === 'gamepad'
          ? 'L-STICK / D-PAD SELECT  •  A BUY/CLONE  •  B LEAVE'
          : 'CLICK / ENTER SELECT  •  ESC LEAVE';
    } else {
      hint.textContent =
        view.activeDevice === 'gamepad'
          ? 'X REFRESH  •  Y BANISH  •  BACK SKIP'
          : '[1-3] PICK  •  [R] REFRESH  •  [B] BANISH  •  [X] SKIP';
    }

    footer.append(actions, hint);
    modal.append(header, body, footer);
    return modal;
  }

  // --------------------------------------------------------------------------
  // 4. QUESTS / UNLOCKS SCREEN (phase === 'quests')
  // --------------------------------------------------------------------------
  private renderQuestsScreen(view: MenusViewState): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal';

    const claimedSet = new Set(view.save.claimedQuests);
    const enriched = view.catalog.quests.map((q) => {
      const current = getQuestMetricValue(view.save, q.metricKey);
      const claimed = claimedSet.has(q.id);
      const ready = !claimed && current >= q.targetValue;
      return { quest: q, current, claimed, ready };
    });

    // Sort Ready-to-Claim first, then In-Progress, then Claimed
    enriched.sort((a, b) => {
      const rankA = a.ready ? 0 : a.claimed ? 2 : 1;
      const rankB = b.ready ? 0 : b.claimed ? 2 : 1;
      return rankA - rankB;
    });

    const readyCount = enriched.filter((e) => e.ready).length;
    const claimedCount = enriched.filter((e) => e.claimed).length;

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('h2');
    title.className = 'kb-modal-title';
    title.textContent = 'QUESTS & UNLOCKS';

    const headerBadges = document.createElement('div');
    headerBadges.className = 'kb-header-badges';
    if (readyCount > 0) {
      const readyBadge = document.createElement('span');
      readyBadge.className = 'kb-badge kb-badge--lime';
      readyBadge.textContent = `${readyCount} CLAIMABLE`;
      headerBadges.appendChild(readyBadge);
    }
    const progressBadge = document.createElement('span');
    progressBadge.className = 'kb-badge';
    progressBadge.textContent = `${claimedCount} / ${enriched.length} CLAIMED`;
    const silverBadge = document.createElement('span');
    silverBadge.className = 'kb-badge kb-badge--silver';
    silverBadge.textContent = `SILVER: ${view.save.silver}`;
    headerBadges.append(progressBadge, silverBadge);
    header.append(title, headerBadges);

    const body = document.createElement('div');
    body.className = 'kb-modal-body';

    const list = document.createElement('div');
    list.className = 'kb-quest-list';
    list.setAttribute('data-kb-quest-list', 'true');

    let defaultAssigned = false;

    for (const item of enriched) {
      const { quest, current, claimed, ready } = item;
      const card = document.createElement('div');
      card.className = 'kb-quest-card';
      if (ready) card.classList.add('is-ready');
      if (claimed) card.classList.add('is-claimed');

      const main = document.createElement('div');
      main.className = 'kb-quest-main';

      const head = document.createElement('div');
      head.className = 'kb-quest-head';
      const qName = document.createElement('span');
      qName.className = 'kb-quest-name';
      qName.textContent = quest.displayName;

      const rewardBadge = document.createElement('span');
      rewardBadge.className = 'kb-badge kb-badge--silver';
      rewardBadge.textContent = `+${quest.rewardSilver} SILVER`;
      head.append(qName, rewardBadge);

      const qDesc = document.createElement('div');
      qDesc.className = 'kb-quest-desc';
      qDesc.textContent = quest.description;

      // Progress bar (current / target)
      const clampedCurrent = Math.min(quest.targetValue, Math.floor(current));
      const pct =
        quest.targetValue > 0 ? Math.min(100, (clampedCurrent / quest.targetValue) * 100) : 100;

      const barWrap = document.createElement('div');
      barWrap.className = 'kb-quest-progress-wrap';
      const barTrack = document.createElement('div');
      barTrack.className = 'kb-quest-bar';
      const barFill = document.createElement('div');
      barFill.className = claimed
        ? 'kb-quest-bar-fill is-claimed'
        : ready
          ? 'kb-quest-bar-fill is-ready'
          : 'kb-quest-bar-fill';
      barFill.style.width = `${pct.toFixed(1)}%`;
      barTrack.appendChild(barFill);

      const barLabel = document.createElement('span');
      barLabel.className = 'kb-quest-progress-text';
      barLabel.textContent = `${clampedCurrent} / ${quest.targetValue}`;
      barWrap.append(barTrack, barLabel);

      // Unlock badges
      const unlocks = resolveQuestUnlockBadges(quest, view.catalog);
      main.append(head, qDesc, barWrap);
      if (unlocks.length > 0) {
        const unlockRow = document.createElement('div');
        unlockRow.className = 'kb-chip-row';
        for (const u of unlocks) {
          const pill = document.createElement('span');
          pill.className = 'kb-unlock-pill';
          pill.textContent = `[${u.kind}] ${u.label}`;
          unlockRow.appendChild(pill);
        }
        main.appendChild(unlockRow);
      }

      // Claim button column
      const actionCol = document.createElement('div');
      actionCol.className = 'kb-quest-action';
      const claimBtn = this.makeButton(
        claimed ? 'CLAIMED ✓' : ready ? 'CLAIM' : `${Math.floor(pct)}%`,
        `quest-claim-${quest.id}`,
        ready ? 'kb-btn--sm kb-btn--primary' : 'kb-btn--sm',
        () => {
          if (ready) this.callbacks.onClaimQuest?.(quest.id);
        },
      );
      claimBtn.disabled = !ready;
      if (ready && !defaultAssigned) {
        claimBtn.setAttribute('data-kb-focus-default', 'true');
        defaultAssigned = true;
      }
      actionCol.appendChild(claimBtn);

      card.append(main, actionCol);
      list.appendChild(card);
    }

    if (enriched.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'kb-encounter-note';
      empty.textContent = 'No quests registered in catalog.';
      list.appendChild(empty);
    }

    body.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';
    const hint = document.createElement('div');
    hint.className = 'kb-hint-bar';
    hint.textContent = 'COMPLETE MILESTONES IN RUNS TO UNLOCK FIGHTERS, ARENAS, SKINS & HATS';
    const backBtn = this.makeButton('BACK TO TITLE', 'quests-back', '', () =>
      this.callbacks.onBackToTitle(),
    );
    if (!defaultAssigned) {
      backBtn.setAttribute('data-kb-focus-default', 'true');
    }
    footer.append(hint, backBtn);

    modal.append(header, body, footer);
    return modal;
  }

  // --------------------------------------------------------------------------
  // 5. META SHOP MODAL (ALL 8 SILVER UPGRADES + LIVE PREVIEWS + REFUND)
  // --------------------------------------------------------------------------
  private renderMetaShop(view: MenusViewState): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal kb-modal--wide';

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('h2');
    title.className = 'kb-modal-title';
    title.textContent = 'META SHOP';
    const silverBadge = document.createElement('span');
    silverBadge.className = 'kb-badge kb-badge--silver';
    silverBadge.textContent = `SILVER: ${view.save.silver}`;
    header.append(title, silverBadge);

    const body = document.createElement('div');
    body.className = 'kb-modal-body';

    const grid = document.createElement('div');
    grid.className = 'kb-shop-grid';

    let totalSpentSilver = 0;

    for (const upg of view.catalog.shopUpgrades) {
      const rank = view.save.shopLevels[upg.id] ?? 0;
      const maxed = rank >= upg.maxRank;
      const cost = computeShopUpgradeCost(upg, rank);
      const canBuy = !maxed && view.save.silver >= cost;
      const refundVal = rank > 0 ? computeShopUpgradeCost(upg, rank - 1) : 0;
      totalSpentSilver += computeTotalUpgradeSpent(upg, rank);

      const card = document.createElement('div');
      card.className = 'kb-shop-card';
      if (maxed) card.classList.add('is-maxed');

      const name = document.createElement('div');
      name.className = 'kb-char-name';
      name.textContent = upg.displayName;

      const desc = document.createElement('div');
      desc.className = 'kb-char-passive';
      desc.textContent = upg.description;

      const preview = document.createElement('div');
      preview.className = rank > 0 ? 'kb-shop-preview is-active' : 'kb-shop-preview';
      preview.textContent = formatShopEffectPreview(upg, rank);

      const pips = document.createElement('div');
      pips.className = 'kb-shop-pips';
      const displayPips = Math.min(10, upg.maxRank);
      for (let i = 0; i < displayPips; i++) {
        const pip = document.createElement('span');
        pip.className = 'kb-shop-pip';
        if (i < rank) pip.classList.add('is-filled');
        pips.appendChild(pip);
      }

      const rankText = document.createElement('div');
      rankText.className = 'kb-char-weapon';
      rankText.textContent = `RANK ${rank} / ${upg.maxRank}`;

      const btnRow = document.createElement('div');
      btnRow.className = 'kb-shop-actions';

      const buyBtn = this.makeButton(
        maxed ? 'MAXED' : `BUY (${cost}S)`,
        `shop-buy-${upg.id}`,
        canBuy ? 'kb-btn--sm kb-btn--primary' : 'kb-btn--sm',
        () => this.callbacks.onBuyShopUpgrade(upg.id, cost),
      );
      buyBtn.disabled = !canBuy;

      const refundBtn = this.makeButton(
        rank > 0 ? `REFUND (+${refundVal}S)` : 'REFUND',
        `shop-refund-${upg.id}`,
        'kb-btn--sm',
        () => this.callbacks.onRefundShopUpgrade?.(upg.id),
      );
      refundBtn.disabled = rank <= 0;

      btnRow.append(buyBtn, refundBtn);
      card.append(name, desc, preview, pips, rankText, btnRow);
      grid.appendChild(card);
    }

    body.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';

    const backBtn = this.makeButton('BACK TO TITLE', 'shop-back', '', () =>
      this.callbacks.onBackToTitle(),
    );

    const refundAllBtn = this.makeButton(
      totalSpentSilver > 0 ? `REFUND ALL (+${totalSpentSilver} SILVER)` : 'REFUND ALL',
      'shop-refund-all',
      totalSpentSilver > 0 ? 'kb-btn--sm kb-btn--danger' : 'kb-btn--sm',
      () => {
        if (this.callbacks.onRefundAllShopUpgrades) {
          this.callbacks.onRefundAllShopUpgrades();
        } else if (this.callbacks.onRefundShopUpgrade) {
          for (const upg of view.catalog.shopUpgrades) {
            const rank = view.save.shopLevels[upg.id] ?? 0;
            for (let r = 0; r < rank; r++) {
              this.callbacks.onRefundShopUpgrade(upg.id);
            }
          }
        }
      },
    );
    refundAllBtn.disabled = totalSpentSilver <= 0;

    footer.append(backBtn, refundAllBtn);
    modal.append(header, body, footer);
    return modal;
  }

  // --------------------------------------------------------------------------
  // 6. PAUSE MENU (WITH BOOMBOX TRACK SELECTOR)
  // --------------------------------------------------------------------------
  private renderPauseMenu(view: MenusViewState): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal kb-modal--narrow';

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('h2');
    title.className = 'kb-modal-title';
    title.textContent = 'PAUSED';
    const stageBadge = document.createElement('span');
    stageBadge.className = 'kb-badge';
    stageBadge.textContent = view.state
      ? `${view.state.mapId.toUpperCase()} T${view.state.mapTier} • LV ${view.state.player.level}`
      : 'IN RUN';
    header.append(title, stageBadge);

    const body = document.createElement('div');
    body.className = 'kb-modal-body';

    if (view.state) {
      const mini = document.createElement('div');
      mini.className = 'kb-summary-stats';
      mini.append(
        this.makeSummaryTile('TIME', formatClock(view.state.simTimeSec)),
        this.makeSummaryTile('KILLS', String(view.state.player.kills)),
        this.makeSummaryTile('GOLD', String(Math.floor(view.state.player.gold))),
      );
      body.appendChild(mini);
    }

    // Boombox Track Selector right inside Pause Menu
    body.appendChild(this.renderBoomboxRow(view, 'pause-boombox'));

    const nav = document.createElement('div');
    nav.className = 'kb-title-nav';
    nav.style.width = '100%';
    const resumeBtn = this.makeButton('RESUME', 'pause-resume', 'kb-btn--primary', () =>
      this.callbacks.onResume(),
    );
    resumeBtn.setAttribute('data-kb-focus-default', 'true');
    nav.append(
      resumeBtn,
      this.makeButton('OPTIONS', 'pause-options', '', () => this.callbacks.onOpenOptions()),
      this.makeButton('RESTART RUN', 'pause-restart', '', () => this.callbacks.onRestartRun()),
      this.makeButton('ABANDON TO TITLE', 'pause-abandon', 'kb-btn--danger', () =>
        this.callbacks.onAbandonRun(),
      ),
    );
    body.appendChild(nav);

    modal.append(header, body);
    return modal;
  }

  // --------------------------------------------------------------------------
  // 7. OPTIONS MODAL (WITH BOOMBOX TRACK SELECTOR)
  // --------------------------------------------------------------------------
  private renderOptionsModal(view: MenusViewState): HTMLElement {
    const s = view.settings;
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal kb-modal--wide';

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('h2');
    title.className = 'kb-modal-title';
    title.textContent = 'OPTIONS & CALIBRATION';
    const gpBadge = document.createElement('span');
    gpBadge.className = 'kb-badge kb-badge--cyan';
    gpBadge.textContent = view.gamepadConnected
      ? `CONNECTED: ${profileLabel(view.gamepadProfile)}`
      : 'NO GAMEPAD DETECTED';
    header.append(title, gpBadge);

    const body = document.createElement('div');
    body.className = 'kb-modal-body';

    const grid = document.createElement('div');
    grid.className = 'kb-options-grid';

    // Section A: Display & Graphics
    const displaySec = document.createElement('div');
    displaySec.className = 'kb-options-section';
    const dispLabel = document.createElement('div');
    dispLabel.className = 'kb-section-label';
    dispLabel.textContent = 'VIDEO, CAMERA & RENDERING';
    displaySec.appendChild(dispLabel);

    const fpsOptions: readonly { value: FpsCap; label: string }[] = [
      { value: 30, label: '30 FPS' },
      { value: 60, label: '60 FPS' },
      { value: 120, label: '120 FPS' },
      { value: 0, label: 'UNLIMITED' },
    ];
    displaySec.appendChild(
      this.makeCycleRow('FPS CAP', 'opt-fps-cap', fpsOptions, s.fpsCap, (fpsCap) =>
        this.callbacks.onUpdateSettings({ fpsCap }),
      ),
    );

    displaySec.appendChild(
      this.makeToggleRow(
        'CLASSIC 50 HZ SNAP',
        'opt-50hz-snap',
        s.classic50HzSnap,
        (classic50HzSnap) => this.callbacks.onUpdateSettings({ classic50HzSnap }),
      ),
    );

    displaySec.appendChild(
      this.makeSliderRow(
        'FIELD OF VIEW',
        'opt-fov',
        FOV_MIN,
        FOV_MAX,
        1,
        s.fov,
        (v) => `${Math.round(v)}°`,
        (fov) => this.callbacks.onUpdateSettings({ fov }),
      ),
    );

    displaySec.appendChild(
      this.makeCycleRow(
        'CAMERA VIEW',
        'opt-camera-mode',
        [
          { value: 'third' as const, label: '3RD PERSON' },
          { value: 'first' as const, label: '1ST PERSON' },
        ],
        s.cameraMode,
        (cameraMode) => this.callbacks.onUpdateSettings({ cameraMode }),
      ),
    );

    displaySec.appendChild(
      this.makeToggleRow('INK OUTLINES', 'opt-outlines', s.outlineEnabled, (outlineEnabled) =>
        this.callbacks.onUpdateSettings({ outlineEnabled }),
      ),
    );

    displaySec.appendChild(
      this.makeCycleRow(
        'CEL BANDS',
        'opt-cel-bands',
        [
          { value: 2 as const, label: '2 BANDS' },
          { value: 3 as const, label: '3 BANDS' },
        ],
        s.celBands,
        (celBands) => this.callbacks.onUpdateSettings({ celBands }),
      ),
    );

    const grassOpts: readonly { value: GrassQuality; label: string }[] = [
      { value: 'low', label: 'LOW' },
      { value: 'med', label: 'MED' },
      { value: 'high', label: 'HIGH' },
    ];
    displaySec.appendChild(
      this.makeCycleRow('GRASS QUALITY', 'opt-grass', grassOpts, s.grassQuality, (grassQuality) =>
        this.callbacks.onUpdateSettings({ grassQuality }),
      ),
    );

    displaySec.appendChild(
      this.makeToggleRow('SHOW FPS COUNTER', 'opt-show-fps', s.showFpsCounter, (showFpsCounter) =>
        this.callbacks.onUpdateSettings({ showFpsCounter }),
      ),
    );

    // Section B: Audio, Boombox, Controls & Gamepad Calibration
    const ctrlSec = document.createElement('div');
    ctrlSec.className = 'kb-options-section';
    const ctrlLabel = document.createElement('div');
    ctrlLabel.className = 'kb-section-label';
    ctrlLabel.textContent = 'AUDIO, BOOMBOX & GAMEPAD';
    ctrlSec.appendChild(ctrlLabel);

    ctrlSec.appendChild(
      this.makeSliderRow(
        'AUDIO MASTER',
        'opt-audio-master',
        0,
        1,
        0.05,
        s.audioMaster,
        (v) => `${Math.round(v * 100)}%`,
        (audioMaster) => this.callbacks.onUpdateSettings({ audioMaster }),
      ),
    );

    ctrlSec.appendChild(
      this.makeSliderRow(
        'AUDIO MUSIC',
        'opt-audio-music',
        0,
        1,
        0.05,
        s.audioMusic,
        (v) => `${Math.round(v * 100)}%`,
        (audioMusic) => this.callbacks.onUpdateSettings({ audioMusic }),
      ),
    );

    ctrlSec.appendChild(
      this.makeSliderRow(
        'AUDIO SFX',
        'opt-audio-sfx',
        0,
        1,
        0.05,
        s.audioSfx,
        (v) => `${Math.round(v * 100)}%`,
        (audioSfx) => this.callbacks.onUpdateSettings({ audioSfx }),
      ),
    );

    ctrlSec.appendChild(
      this.makeToggleRow('MUTE AUDIO', 'opt-audio-mute', s.audioMuted, (audioMuted) =>
        this.callbacks.onUpdateSettings({ audioMuted }),
      ),
    );

    // Boombox Track Selector in Options
    ctrlSec.appendChild(this.renderBoomboxRow(view, 'opt-boombox'));

    ctrlSec.appendChild(
      this.makeSliderRow(
        'MOUSE SENSITIVITY',
        'opt-mouse-sens',
        0.2,
        3.0,
        0.1,
        s.mouseSensitivity,
        (v) => `${v.toFixed(1)}x`,
        (mouseSensitivity) => this.callbacks.onUpdateSettings({ mouseSensitivity }),
      ),
    );

    ctrlSec.appendChild(
      this.makeToggleRow('INVERT MOUSE Y', 'opt-mouse-invert', s.invertMouseY, (invertMouseY) =>
        this.callbacks.onUpdateSettings({ invertMouseY }),
      ),
    );

    ctrlSec.appendChild(
      this.makeSliderRow(
        'GAMEPAD SENSITIVITY',
        'opt-gp-sens',
        0.2,
        3.0,
        0.1,
        s.gamepad.sensitivityX,
        (v) => `${v.toFixed(1)}x`,
        (val) =>
          this.callbacks.onUpdateSettings({
            gamepad: { ...s.gamepad, sensitivityX: val, sensitivityY: val },
          }),
      ),
    );

    ctrlSec.appendChild(
      this.makeSliderRow(
        'GAMEPAD DEADZONE',
        'opt-gp-deadzone',
        0.05,
        0.4,
        0.01,
        s.gamepad.deadzone,
        (v) => v.toFixed(2),
        (deadzone) =>
          this.callbacks.onUpdateSettings({
            gamepad: { ...s.gamepad, deadzone },
          }),
      ),
    );

    ctrlSec.appendChild(
      this.makeToggleRow('GAMEPAD INVERT Y', 'opt-gp-invert', s.gamepad.invertY, (invertY) =>
        this.callbacks.onUpdateSettings({
          gamepad: { ...s.gamepad, invertY },
        }),
      ),
    );

    ctrlSec.appendChild(
      this.makeToggleRow('GAMEPAD RUMBLE', 'opt-gp-rumble', s.gamepad.vibration, (vibration) =>
        this.callbacks.onUpdateSettings({
          gamepad: { ...s.gamepad, vibration },
        }),
      ),
    );

    // Recalibrate sticks row
    const recalRow = document.createElement('div');
    recalRow.className = 'kb-opt-row';
    const recalLbl = document.createElement('span');
    recalLbl.className = 'kb-opt-label';
    recalLbl.textContent = this.calibrationMessage
      ? `STICK CALIBRATION (${this.calibrationMessage})`
      : 'STICK DRIFT CALIBRATION';
    const recalBtn = this.makeButton(
      'RECALIBRATE STICKS',
      'opt-recalibrate',
      'kb-btn--sm kb-btn--accent',
      () => {
        const ok = this.callbacks.onRecalibrateGamepad();
        this.calibrationMessage = ok ? 'CALIBRATED!' : 'NO PAD FOUND';
        this.lastSignature = '';
        if (this.render(view)) {
          this.onRerenderCallback?.();
        }
      },
    );
    recalRow.append(recalLbl, recalBtn);
    ctrlSec.appendChild(recalRow);

    ctrlSec.appendChild(
      this.makeToggleRow('UNLOCK ALL CONTENT', 'opt-unlock-all', s.unlockAll, (unlockAll) =>
        this.callbacks.onUpdateSettings({ unlockAll }),
      ),
    );

    grid.append(displaySec, ctrlSec);
    body.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';
    const hint = document.createElement('div');
    hint.className = 'kb-hint-bar';
    hint.textContent = 'USE LEFT / RIGHT TO ADJUST FOCUSED SLIDERS, OPTIONS & BOOMBOX';
    const backBtn = this.makeButton('BACK', 'options-back', 'kb-btn--primary', () => {
      this.calibrationMessage = '';
      this.callbacks.onCloseOptions();
    });
    footer.append(hint, backBtn);

    modal.append(header, body, footer);
    return modal;
  }

  private makeToggleRow(
    label: string,
    focusId: string,
    checked: boolean,
    onChange: (next: boolean) => void,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'kb-opt-row';
    const lbl = document.createElement('span');
    lbl.className = 'kb-opt-label';
    lbl.textContent = label;
    const btn = this.makeButton(
      checked ? 'ON' : 'OFF',
      focusId,
      checked ? 'kb-btn--sm kb-btn--primary' : 'kb-btn--sm',
      () => onChange(!checked),
    );
    btn.setAttribute('data-kb-stepper', 'toggle');
    row.append(lbl, btn);
    return row;
  }

  private makeCycleRow<T>(
    label: string,
    focusId: string,
    options: readonly { value: T; label: string }[],
    current: T,
    onChange: (next: T) => void,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'kb-opt-row';
    const lbl = document.createElement('span');
    lbl.className = 'kb-opt-label';
    lbl.textContent = label;

    const idx = Math.max(
      0,
      options.findIndex((o) => o.value === current),
    );
    const active = options[idx] ?? options[0];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kb-btn kb-btn--sm kb-btn--cycle';
    btn.textContent = `< ${active.label} >`;
    btn.setAttribute('data-kb-focus', 'true');
    btn.setAttribute('data-kb-focus-id', focusId);
    btn.setAttribute('data-kb-stepper', 'cycle');

    btn.addEventListener('click', (ev: MouseEvent) => {
      let delta = 1;
      if (ev.clientX > 0) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && ev.clientX - rect.left < rect.width * 0.32) {
          delta = -1;
        }
      }
      const nextIdx = (idx + delta + options.length) % options.length;
      onChange(options[nextIdx].value);
    });
    btn.addEventListener('kb-step', ((ev: CustomEvent<{ delta: number }>) => {
      const delta = ev.detail?.delta ?? 1;
      const nextIdx = (idx + delta + options.length) % options.length;
      onChange(options[nextIdx].value);
    }) as EventListener);

    row.append(lbl, btn);
    return row;
  }

  private makeSliderRow(
    label: string,
    focusId: string,
    min: number,
    max: number,
    step: number,
    value: number,
    format: (v: number) => string,
    onChange: (v: number) => void,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'kb-opt-row';
    const lbl = document.createElement('span');
    lbl.className = 'kb-opt-label';
    lbl.textContent = label;

    const ctrl = document.createElement('div');
    ctrl.className = 'kb-opt-control';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'kb-range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('data-kb-focus', 'true');
    input.setAttribute('data-kb-focus-id', focusId);
    input.setAttribute('data-kb-slider', 'true');

    const valSpan = document.createElement('span');
    valSpan.className = 'kb-opt-val';
    valSpan.textContent = format(value);

    input.addEventListener('input', () => {
      const num = Number(input.value);
      valSpan.textContent = format(num);
      onChange(num);
    });

    ctrl.append(input, valSpan);
    row.append(lbl, ctrl);
    return row;
  }

  // --------------------------------------------------------------------------
  // 8. VICTORY & GAME OVER SUMMARY SCREENS
  // --------------------------------------------------------------------------
  private renderSummaryScreen(view: MenusViewState): HTMLElement {
    const isVictory = view.phase === 'victory';
    const state = view.state;
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal';

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('h2');
    title.className = isVictory ? 'kb-modal-title' : 'kb-modal-title kb-modal-title--crimson';
    title.textContent = isVictory ? 'VICTORY!' : 'GAME OVER — BONKED';
    const charBadge = document.createElement('span');
    charBadge.className = 'kb-badge';
    charBadge.textContent = state
      ? `${state.characterId.toUpperCase()} • ${state.mapId.toUpperCase()} T${state.mapTier}`
      : 'RUN SUMMARY';
    header.append(title, charBadge);

    const body = document.createElement('div');
    body.className = 'kb-modal-body';

    const statsGrid = document.createElement('div');
    statsGrid.className = 'kb-summary-stats';
    if (state) {
      statsGrid.append(
        this.makeSummaryTile('TIME', formatClock(state.simTimeSec)),
        this.makeSummaryTile('LEVEL', String(state.player.level)),
        this.makeSummaryTile('KILLS', String(state.summary.enemiesKilled || state.player.kills)),
        this.makeSummaryTile('SILVER EARNED', `+${state.player.silverEarned}`),
        this.makeSummaryTile('HIGHEST HIT', formatDmg(state.summary.highestSingleHit)),
        this.makeSummaryTile('TOP SPEED', `${state.summary.topSpeedReached.toFixed(1)} m/s`),
        this.makeSummaryTile('MAX BHOP', `x${state.summary.longestBhopStreak}`),
        this.makeSummaryTile(
          'CRITS / BONKERS',
          `${state.summary.critsLanded} / ${state.summary.bonkersLanded}`,
        ),
      );
    }
    body.appendChild(statsGrid);

    // Per-Weapon Damage Breakdown
    const dmgHeading = document.createElement('div');
    dmgHeading.className = 'kb-section-label';
    dmgHeading.textContent = 'PER-WEAPON DAMAGE BREAKDOWN';
    const dmgList = document.createElement('div');
    dmgList.className = 'kb-dmg-list';

    if (state && state.player.weapons.length > 0) {
      const sorted = [...state.player.weapons].sort((a, b) => b.totalDamage - a.totalDamage);
      const totalDmg = Math.max(
        1,
        sorted.reduce((sum, w) => sum + Math.max(0, w.totalDamage), 0),
      );
      for (const slot of sorted) {
        const def = view.catalog.weapons.find((w) => w.id === slot.weaponId);
        const pct = Math.min(100, (Math.max(0, slot.totalDamage) / totalDmg) * 100);
        const row = document.createElement('div');
        row.className = 'kb-dmg-row';

        const head = document.createElement('div');
        head.className = 'kb-dmg-row-head';
        const left = document.createElement('span');
        left.textContent = `${def?.displayName ?? slot.weaponId} (LV ${slot.level})`;
        const right = document.createElement('span');
        right.textContent = `${formatDmg(slot.totalDamage)} DMG (${pct.toFixed(0)}%) • ${slot.kills} KILLS`;
        head.append(left, right);

        const barBg = document.createElement('div');
        barBg.className = 'kb-dmg-bar-bg';
        const barFill = document.createElement('div');
        barFill.className = 'kb-dmg-bar-fill';
        barFill.style.width = `${pct.toFixed(1)}%`;
        barBg.appendChild(barFill);

        row.append(head, barBg);
        dmgList.appendChild(row);
      }
    } else {
      const empty = document.createElement('div');
      empty.className = 'kb-offer-desc';
      empty.textContent = 'No weapon damage recorded.';
      dmgList.appendChild(empty);
    }

    body.append(dmgHeading, dmgList);

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';
    const replayBtn = this.makeButton('PLAY AGAIN', 'summary-replay', 'kb-btn--primary', () =>
      this.callbacks.onRestartRun(),
    );
    replayBtn.setAttribute('data-kb-focus-default', 'true');
    footer.append(
      this.makeButton('TITLE SCREEN', 'summary-title', '', () => this.callbacks.onBackToTitle()),
      this.makeButton('META SHOP', 'summary-shop', '', () => this.callbacks.onOpenShop()),
      replayBtn,
    );

    modal.append(header, body, footer);
    return modal;
  }

  private makeSummaryTile(label: string, val: string): HTMLDivElement {
    const tile = document.createElement('div');
    tile.className = 'kb-summary-tile';
    const l = document.createElement('span');
    l.className = 'kb-summary-tile-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'kb-summary-tile-val';
    v.textContent = val;
    tile.append(l, v);
    return tile;
  }

  private makeButton(
    text: string,
    focusId: string,
    extraClass: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = extraClass ? `kb-btn ${extraClass}` : 'kb-btn';
    btn.textContent = text;
    btn.setAttribute('data-kb-focus', 'true');
    btn.setAttribute('data-kb-focus-id', focusId);
    btn.addEventListener('click', onClick);
    return btn;
  }
}
