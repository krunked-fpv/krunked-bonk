import {
  FOV_MAX,
  FOV_MIN,
  GAME_TITLE,
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
  type RenderSettings,
  type SaveData,
  type ShopUpgradeId,
  type SimState,
} from '../contracts';

export interface UiCallbacks {
  onPlay: () => void;
  onOpenCharacters: () => void;
  onOpenShop: () => void;
  onOpenOptions: () => void;
  onCloseOptions: () => void;
  onBackToTitle: () => void;
  onSelectCharacter: (characterId: CharacterId) => void;
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
}

export function computeShopUpgradeCost(def: MetaShopUpgradeDef, currentRank: number): number {
  const rank = Math.max(0, Math.floor(currentRank));
  return Math.max(1, Math.round(def.baseSilverCost * Math.pow(def.costGrowthMult, rank)));
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function formatDmg(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
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
          .join(',')}:${state.rerollsLeft}:${state.skipsLeft}:${state.banishesLeft}:${this.banishArmed}`
      : 'none';
    const shopSig = Object.entries(save.shopLevels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    const settingsSig =
      phase === 'settings'
        ? JSON.stringify(settings) + `|${this.calibrationMessage}|${view.gamepadConnected}`
        : String(settings.unlockAll);
    const runSig =
      phase === 'paused' || phase === 'victory' || phase === 'game_over'
        ? `${state?.simTimeSec.toFixed(0)}:${state?.player.level}:${state?.player.kills}:${state?.player.weapons.length}`
        : '';

    return [
      phase,
      save.silver,
      save.selectedCharacter,
      save.selectedMap,
      save.selectedMapTier,
      save.selectedChallenge ?? '',
      save.customPackEnabled,
      view.customPackLoaded,
      view.customPackName ?? '',
      view.activeDevice,
      view.gamepadProfile,
      shopSig,
      offerSig,
      settingsSig,
      runSig,
    ].join('|');
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

    const nav = document.createElement('div');
    nav.className = 'kb-title-nav';

    nav.append(
      this.makeButton('PLAY', 'title-play', 'kb-btn--primary', () => this.callbacks.onPlay()),
      this.makeButton('CHARACTERS', 'title-chars', '', () => this.callbacks.onOpenCharacters()),
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
  // 2. CHARACTER & MAP / TIER SELECT
  // --------------------------------------------------------------------------
  private renderCharacterAndMapSelect(view: MenusViewState): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal kb-modal--wide';

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('h2');
    title.className = 'kb-modal-title';
    title.textContent = 'CHOOSE FIGHTER & ARENA';
    const badge = document.createElement('span');
    badge.className = 'kb-badge';
    badge.textContent = `${view.catalog.characters.length} FIGHTERS`;
    header.append(title, badge);

    const body = document.createElement('div');
    body.className = 'kb-modal-body';

    const layout = document.createElement('div');
    layout.className = 'kb-select-layout';

    // Left column: Character cards
    const charWrap = document.createElement('div');
    const charHeading = document.createElement('div');
    charHeading.className = 'kb-section-label';
    charHeading.textContent = 'CHARACTERS';
    const charGrid = document.createElement('div');
    charGrid.className = 'kb-char-grid';

    const unlockedSet = new Set(view.save.unlockedCharacters);
    const selectedCharDef =
      view.catalog.characters.find((c) => c.id === view.save.selectedCharacter) ??
      view.catalog.characters[0];

    for (const ch of view.catalog.characters) {
      const unlocked =
        view.settings.unlockAll || ch.unlockedByDefault || unlockedSet.has(ch.id);
      const card = this.renderCharacterCard(ch, view.catalog, ch.id === selectedCharDef?.id, unlocked);
      charGrid.appendChild(card);
    }

    charWrap.append(charHeading, charGrid);

    // Right column: Selected fighter inspector + Map & Tier selector
    const inspector = document.createElement('div');
    inspector.className = 'kb-inspector';

    if (selectedCharDef) {
      const startWep = view.catalog.weapons.find((w) => w.id === selectedCharDef.startingWeaponId);
      const inspTitle = document.createElement('div');
      inspTitle.className = 'kb-section-label';
      inspTitle.textContent = `${selectedCharDef.displayName.toUpperCase()} — ${selectedCharDef.title}`;

      const passiveText = document.createElement('div');
      passiveText.className = 'kb-offer-desc';
      passiveText.textContent = `WEAPON: ${startWep?.displayName ?? selectedCharDef.startingWeaponId} | PASSIVE (${selectedCharDef.passive.name}): ${selectedCharDef.passive.description}`;

      const statRow = document.createElement('div');
      statRow.className = 'kb-chip-row';
      for (const [k, v] of Object.entries(selectedCharDef.baseStats).slice(0, 6)) {
        const chip = document.createElement('span');
        chip.className = 'kb-stat-chip';
        chip.textContent = `${k}: ${v}`;
        statRow.appendChild(chip);
      }

      inspector.append(inspTitle, passiveText, statRow);
    }

    // Map selector
    const mapHeading = document.createElement('div');
    mapHeading.className = 'kb-section-label';
    mapHeading.textContent = 'SELECT MAP';
    const mapList = document.createElement('div');
    mapList.className = 'kb-map-list';

    const unlockedMaps = new Set(view.save.unlockedMaps);
    const selectableMaps = view.catalog.maps.filter((m) => !m.isFinalBossMap || view.settings.unlockAll);
    const activeMap: MapDef | undefined =
      selectableMaps.find((m) => m.id === view.save.selectedMap) ?? selectableMaps[0];

    for (const m of selectableMaps) {
      const mapUnlocked = view.settings.unlockAll || m.unlockedByDefault || unlockedMaps.has(m.id);
      const isSelected = m.id === activeMap?.id;
      const btn = this.makeButton(
        mapUnlocked ? `${m.displayName}${isSelected ? ' ★' : ''}` : `${m.displayName} [LOCKED]`,
        `map-${m.id}`,
        isSelected ? 'kb-btn--sm kb-btn--accent' : 'kb-btn--sm',
        () => this.callbacks.onSelectMap(m.id),
      );
      btn.disabled = !mapUnlocked;
      mapList.appendChild(btn);
    }

    // Tier 1 / 2 / 3 selector
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

    inspector.append(mapHeading, mapList, tierHeading, tierRow);

    if (view.catalog.challenges.length > 0 && this.callbacks.onSelectChallenge) {
      const chHeading = document.createElement('div');
      chHeading.className = 'kb-section-label';
      chHeading.textContent = 'CHALLENGE MODIFIER';
      const currentIdx = view.save.selectedChallenge
        ? view.catalog.challenges.findIndex((c) => c.id === view.save.selectedChallenge)
        : -1;
      const activeChallenge = currentIdx >= 0 ? view.catalog.challenges[currentIdx] : null;
      const chBtn = this.makeButton(
        activeChallenge
          ? `${activeChallenge.displayName} (${activeChallenge.silverMultiplier}x SILVER)`
          : 'STANDARD RUN (NO CHALLENGE)',
        'select-challenge',
        'kb-btn--sm',
        () => {
          const nextIdx = currentIdx + 1;
          const nextId =
            nextIdx < view.catalog.challenges.length ? view.catalog.challenges[nextIdx].id : null;
          this.callbacks.onSelectChallenge?.(nextId);
        },
      );
      inspector.append(chHeading, chBtn);
    }

    layout.append(charWrap, inspector);
    body.appendChild(layout);

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';
    const backBtn = this.makeButton('BACK', 'select-back', '', () => this.callbacks.onBackToTitle());
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
    passive.textContent = ch.passive.name;

    const chips = document.createElement('div');
    chips.className = 'kb-chip-row';
    const hp = ch.baseStats.MaxHealth;
    const spd = ch.baseStats.MoveSpeed;
    const arm = ch.baseStats.Armor;
    if (hp !== undefined) chips.appendChild(this.makeStatChip(`HP ${hp}`));
    if (spd !== undefined) chips.appendChild(this.makeStatChip(`SPD ${spd}`));
    if (arm !== undefined) chips.appendChild(this.makeStatChip(`ARM ${arm}`));

    card.append(top, weaponLine, passive, chips);
    card.addEventListener('click', () => {
      if (unlocked) this.callbacks.onSelectCharacter(ch.id);
    });
    return card;
  }

  private makeStatChip(text: string): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = 'kb-stat-chip';
    el.textContent = text;
    return el;
  }

  // --------------------------------------------------------------------------
  // 3. LEVEL-UP / SHRINE / CHEST / MERCHANT / MICROWAVE 3-CARD PICKER MODAL
  // --------------------------------------------------------------------------
  private renderDraftModal(view: MenusViewState): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal';

    const state = view.state;
    const offer = state?.pendingOffer;

    const header = document.createElement('div');
    header.className = 'kb-modal-header';
    const title = document.createElement('h2');
    title.className = 'kb-modal-title';
    title.textContent = this.banishArmed
      ? 'SELECT AN OFFER TO BANISH'
      : offer?.title ?? 'CHOOSE AN UPGRADE';
    if (this.banishArmed) title.classList.add('kb-modal-title--crimson');

    const sourceBadge = document.createElement('span');
    sourceBadge.className = 'kb-badge';
    sourceBadge.textContent = (offer?.source ?? view.phase).replace('_', ' ').toUpperCase();
    header.append(title, sourceBadge);

    const body = document.createElement('div');
    body.className = 'kb-modal-body';

    const grid = document.createElement('div');
    grid.className = 'kb-draft-grid';

    const choices: readonly DraftOfferChoice[] = offer?.choices ?? [];
    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'kb-offer-card';
      card.setAttribute('data-rarity', choice.rarity);
      card.setAttribute('data-kb-focus', 'true');
      card.setAttribute('data-kb-focus-id', `draft-choice-${choice.index}`);
      card.setAttribute('data-kb-draft-index', String(choice.index));
      if (this.banishArmed) card.classList.add('is-banish-armed');

      const cantAfford =
        choice.goldCost !== undefined && state !== null && state.player.gold < choice.goldCost;
      if (cantAfford && !this.banishArmed) {
        card.disabled = true;
      }

      const top = document.createElement('div');
      top.className = 'kb-offer-top';
      const rarity = document.createElement('span');
      rarity.className = 'kb-offer-rarity';
      rarity.textContent = `${choice.rarity} • ${choice.category.replace('_', ' ')}`;
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
        diff.style.color = '#ff5d6c';
      } else if (choice.nextLevel !== undefined) {
        diff.textContent =
          choice.nextLevel <= 1 ? 'NEW UNLOCK (LV 1)' : `LV ${choice.nextLevel - 1} -> LV ${choice.nextLevel}`;
      } else if (choice.goldCost !== undefined) {
        diff.textContent = `COST: ${choice.goldCost} GOLD`;
      } else {
        diff.textContent = '+1 STACK / BOON';
      }

      const desc = document.createElement('div');
      desc.className = 'kb-offer-desc';
      desc.textContent = choice.description;

      card.append(top, name, diff, desc);
      card.addEventListener('click', () => {
        if (this.banishArmed) {
          this.banishArmed = false;
          this.callbacks.onBanishDraftChoice(choice.index);
        } else {
          this.callbacks.onSelectDraftChoice(choice.index);
        }
      });

      grid.appendChild(card);
    }

    body.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';

    const actions = document.createElement('div');
    actions.className = 'kb-draft-actions';

    const rerolls = state?.rerollsLeft ?? 0;
    const skips = state?.skipsLeft ?? 0;
    const banishes = state?.banishesLeft ?? 0;

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

    const hint = document.createElement('div');
    hint.className = 'kb-hint-bar';
    hint.textContent =
      view.activeDevice === 'gamepad'
        ? 'X REFRESH  •  Y BANISH  •  BACK SKIP'
        : '[1-3] PICK  •  [R] REFRESH  •  [B] BANISH  •  [X] SKIP';

    footer.append(actions, hint);
    modal.append(header, body, footer);
    return modal;
  }

  // --------------------------------------------------------------------------
  // 4. META SHOP MODAL (ALL 8 SILVER UPGRADES)
  // --------------------------------------------------------------------------
  private renderMetaShop(view: MenusViewState): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'kb-panel--gothic kb-modal';

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

    for (const upg of view.catalog.shopUpgrades) {
      const rank = view.save.shopLevels[upg.id] ?? 0;
      const maxed = rank >= upg.maxRank;
      const cost = computeShopUpgradeCost(upg, rank);
      const canBuy = !maxed && view.save.silver >= cost;

      const card = document.createElement('div');
      card.className = 'kb-shop-card';

      const name = document.createElement('div');
      name.className = 'kb-char-name';
      name.textContent = upg.displayName;

      const desc = document.createElement('div');
      desc.className = 'kb-char-passive';
      desc.textContent = upg.description;

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

      const buyBtn = this.makeButton(
        maxed ? 'MAXED' : `BUY (${cost} SILVER)`,
        `shop-buy-${upg.id}`,
        canBuy ? 'kb-btn--sm kb-btn--primary' : 'kb-btn--sm',
        () => this.callbacks.onBuyShopUpgrade(upg.id, cost),
      );
      buyBtn.disabled = !canBuy;

      card.append(name, desc, pips, rankText, buyBtn);
      grid.appendChild(card);
    }

    body.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'kb-modal-footer';
    footer.appendChild(
      this.makeButton('BACK TO TITLE', 'shop-back', '', () => this.callbacks.onBackToTitle()),
    );

    modal.append(header, body, footer);
    return modal;
  }

  // --------------------------------------------------------------------------
  // 5. PAUSE MENU
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

    const nav = document.createElement('div');
    nav.className = 'kb-title-nav';
    nav.style.width = '100%';
    nav.append(
      this.makeButton('RESUME', 'pause-resume', 'kb-btn--primary', () => this.callbacks.onResume()),
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
  // 6. OPTIONS MODAL
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
      this.makeToggleRow('CLASSIC 50 HZ SNAP', 'opt-50hz-snap', s.classic50HzSnap, (classic50HzSnap) =>
        this.callbacks.onUpdateSettings({ classic50HzSnap }),
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

    // Section B: Audio, Controls & Gamepad Calibration
    const ctrlSec = document.createElement('div');
    ctrlSec.className = 'kb-options-section';
    const ctrlLabel = document.createElement('div');
    ctrlLabel.className = 'kb-section-label';
    ctrlLabel.textContent = 'AUDIO, CONTROLS & GAMEPAD';
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
    const recalBtn = this.makeButton('RECALIBRATE STICKS', 'opt-recalibrate', 'kb-btn--sm kb-btn--accent', () => {
      const ok = this.callbacks.onRecalibrateGamepad();
      this.calibrationMessage = ok ? 'CALIBRATED!' : 'NO PAD FOUND';
      this.lastSignature = '';
      if (this.render(view)) {
        this.onRerenderCallback?.();
      }
    });
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
    hint.textContent = 'USE LEFT / RIGHT TO ADJUST FOCUSED SLIDERS & OPTIONS';
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

    const btn = this.makeButton(`< ${active.label} >`, focusId, 'kb-btn--sm', () => {
      const next = options[(idx + 1) % options.length];
      onChange(next.value);
    });
    btn.setAttribute('data-kb-stepper', 'cycle');
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
  // 7. VICTORY & GAME OVER SUMMARY SCREENS
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
    footer.append(
      this.makeButton('TITLE SCREEN', 'summary-title', '', () => this.callbacks.onBackToTitle()),
      this.makeButton('META SHOP', 'summary-shop', '', () => this.callbacks.onOpenShop()),
      this.makeButton('PLAY AGAIN', 'summary-replay', 'kb-btn--primary', () =>
        this.callbacks.onRestartRun(),
      ),
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
