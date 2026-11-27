import {
  MAX_TOME_SLOTS,
  MAX_WEAPON_SLOTS,
  type DebugPerfMetrics,
  type EnemyState,
  type GameCatalog,
  type GamepadProfile,
  type InputDeviceKind,
  type InteractableKind,
  type MapId,
  type RenderSettings,
  type SimState,
} from '../contracts';
import {
  createSvgIcon,
  getItemIconSvg,
  getTomeIconSvg,
  getUiIconSvg,
  getWeaponIconSvg,
  type UiIconName,
} from './UiIcons';

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

function shortMapLabel(mapId: MapId): string {
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

/**
 * Crisp <=4-character HUD tags covering ALL 30 weapons, 26 tomes, and 87 items
 * (plus spelling/asset aliases so nothing falls back to ugly raw ID truncation).
 */
export const SHORT_TAG_MAP: Readonly<Record<string, string>> = Object.freeze({
  // --- ALL 30 WEAPONS ---
  WeaponFireStaff: 'FIRE',
  WeaponBone: 'BONE',
  WeaponSword: 'SWRD',
  WeaponRevolver: 'REVO',
  WeaponAura: 'AURA',
  WeaponAxe: 'AXE',
  WeaponBow: 'BOW',
  WeaponAegis: 'AEGS',
  WeaponLightningBolt: 'BOLT',
  WeaponLightningStaff: 'BOLT',
  WeaponFlameWalker: 'FLAM',
  WeaponFlamewalker: 'FLAM',
  WeaponSluttyRocket: 'RCKT',
  WeaponRocket: 'RCKT',
  WeaponRockets: 'RCKT',
  WeaponBananarang: 'BANA',
  WeaponTornado: 'TORN',
  WeaponDexecutioner: 'EXEC',
  WeaponSniper: 'SNIP',
  WeaponFrostWalker: 'FRST',
  WeaponFrostwalker: 'FRST',
  WeaponSpaceNoodle: 'NOOD',
  WeaponDragonsBreath: 'DRGN',
  WeaponChunkers: 'ROCK',
  WeaponMines: 'MINE',
  WeaponMine: 'MINE',
  WeaponPoisonFlask: 'POIS',
  WeaponBlackHole: 'VOID',
  WeaponKatana: 'KTNA',
  WeaponBloodMagic: 'BLOD',
  WeaponWirelessDagger: 'DAGR',
  WeaponBluetoothDagger: 'DAGR',
  WeaponDice: 'DICE',
  WeaponHeroSword: 'HERO',
  WeaponCorruptedSword: 'CURS',
  WeaponCorruptSword: 'CURS',
  WeaponShotgun: 'SHOT',
  WeaponScythe: 'SCYT',

  // --- ALL 26 TOMES ---
  TomeDamage: 'DMG',
  TomeAgility: 'AGI',
  TomeCooldown: 'CD',
  TomeQuantity: 'QTY',
  TomeKnockback: 'KB',
  TomeArmor: 'ARM',
  TomeHealth: 'HP',
  TomeRegen: 'REGN',
  TomeRegeneration: 'REGN',
  TomeSize: 'SIZE',
  TomeProjectileSpeed: 'PSPD',
  TomeDuration: 'DUR',
  TomeEvasion: 'EVAD',
  TomeAttraction: 'MAG',
  TomePickupRange: 'MAG',
  TomeLuck: 'LUCK',
  TomeXP: 'XP',
  TomeXp: 'XP',
  TomeGolden: 'GOLD',
  TomeGold: 'GOLD',
  TomePrecision: 'CRIT',
  TomeShield: 'SHLD',
  TomeBlood: 'LIFE',
  TomeLifesteal: 'LIFE',
  TomeThorns: 'THRN',
  TomeCursed: 'CURS',
  TomeCurse: 'CURS',
  TomeSilver: 'SLVR',
  TomeBalance: 'BAL',
  TomeChaos: 'CHAO',
  TomeGamba: 'GAMB',
  TomeGambler: 'GAMB',
  TomeHoarder: 'HORD',
  // Legacy aliases
  TomeAttackSpeed: 'SPD',
  TomeBounce: 'BNC',
  TomeCritDamage: 'CDMG',

  // --- ALL 87 ITEMS ---
  // Common (22)
  Key: 'KEY',
  SlipperyRing: 'SLIP',
  GymSauce: 'GYM',
  Battery: 'BATT',
  ForbiddenJuice: 'JUIC',
  MoldyCheese: 'CHSE',
  Cheese: 'CHSE',
  GoldenGlove: 'GGLV',
  Ghost: 'GHST',
  TurboSocks: 'SOCK',
  Clover: 'CLVR',
  Skuleg: 'SKUL',
  Oats: 'OATS',
  CursedDoll: 'DOLL',
  Borgar: 'BRGR',
  Medkit: 'MED',
  BossBuster: 'BOSS',
  TacticalGlasses: 'SPEC',
  Cactus: 'CACT',
  IceCrystal: 'ICRY',
  TimeBracelet: 'WTCH',
  Wrench: 'WRNC',
  OldMask: 'MASK',

  // Rare (21)
  Beer: 'BEER',
  CowardsCloak: 'CLOK',
  PhantomShroud: 'SHRD',
  DemonBlade: 'DBLD',
  GoldenSneakers: 'SHOE',
  DemonicBlood: 'BLOD',
  GoldenShield: 'GSHD',
  Feathers: 'FTHR',
  FlappyFeathers: 'FTHR',
  EchoShard: 'ECHO',
  Backpack: 'PACK',
  Campfire: 'CAMP',
  ElectricPlug: 'PLUG',
  BrassKnuckles: 'KNUK',
  IdleJuice: 'IDLE',
  UnstableTransfusion: 'TRNS',
  CreditCardRed: 'RCRD',
  LeechingCrystal: 'LECH',
  GloveLightning: 'ZAPG',
  GlovePoison: 'PGLV',
  MoldyGloves: 'PGLV',
  Beacon: 'BECN',
  Pumpkin: 'PMPK',

  // Epic (20)
  SpikyShield: 'SPIK',
  GrandmasSecretTonic: 'TONC',
  DemonicSoul: 'DSOL',
  BeefyRing: 'BEEF',
  SluttyCannon: 'CNON',
  HomingCannon: 'CNON',
  ShatteredWisdom: 'SHAT',
  ShatteredKnowledge: 'SHAT',
  Rollerblades: 'SKAT',
  TurboSkates: 'SKAT',
  EagleClaw: 'CLAW',
  Scarf: 'SCRF',
  BobDead: 'BOBD',
  Mirror: 'MIRR',
  Gasmask: 'GASM',
  GasMask: 'GASM',
  ToxicBarrel: 'BARL',
  Kevin: 'KEVN',
  GamerGoggles: 'GOGL',
  CreditCardGreen: 'GCRD',
  GloveBlood: 'SLRP',
  SlurpGloves: 'SLRP',
  GloveCurse: 'CGLV',
  CursedGrabbies: 'CGLV',
  QuinsMask: 'QUIN',
  BobsLantern: 'BLIT',
  BobsLight: 'BLIT',

  // Legendary (22)
  Bonker: 'BONK',
  GiantFork: 'FORK',
  SpicyMeatball: 'MEAT',
  Chonkplate: 'CHNK',
  LightningOrb: 'ZAP',
  IceCube: 'ICE',
  Dragonfire: 'DRGF',
  ZaWarudo: 'TIME',
  OverpoweredLamp: 'LAMP',
  SuckyMagnet: 'SMAG',
  Anvil: 'ANVL',
  EnergyCore: 'CORE',
  SoulHarvester: 'SOUL',
  JoesDagger: 'JOE',
  JoeDagger: 'JOE',
  SpeedBoi: 'SBOI',
  HolyBook: 'HOLY',
  BloodyCleaver: 'CLEV',
  GlovePower: 'PWRG',
  PowerGloves: 'PWRG',
  GoldenRing: 'GRNG',
  Snek: 'SNEK',
  Pot: 'POT',
  PotSteel: 'POT',
  WizardsHat: 'WIZ',

  // Quest (2)
  CageKey: 'CKEY',
  CageKeyMonke: 'CKEY',
  CryptKey: 'CRYP',

  // Extra aliases
  PhoenixFeather: 'PHNX',
  CreditCard: 'CARD',
});

export function shortTag(id: string, displayName: string | undefined, maxLen = 4): string {
  const mapped = SHORT_TAG_MAP[id];
  if (mapped) return mapped;
  const source = (displayName ?? id)
    .replace(/^Tome of\s+/i, '')
    .replace(/\s+Tome$/i, '')
    .replace(/^Weapon/i, '')
    .replace(/^Tome/i, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim();
  if (source.length <= maxLen) return source.toUpperCase();
  const words = source.split(/\s+/);
  if (words.length >= 2) {
    return words
      .map((w) => w.slice(0, Math.max(2, Math.floor(maxLen / words.length))))
      .join('')
      .slice(0, maxLen)
      .toUpperCase();
  }
  return source.slice(0, maxLen).toUpperCase();
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

  private pylonBar: HTMLDivElement | null = null;
  private pylonLabel: HTMLSpanElement | null = null;
  private pylonPips: HTMLDivElement | null = null;
  private pylonStolenBadge: HTMLSpanElement | null = null;

  private darknessBox: HTMLDivElement | null = null;
  private darknessCount: HTMLSpanElement | null = null;
  private darknessPips: HTMLDivElement | null = null;

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
  private lastPylonSig = '';
  private lastDarknessSig = '';
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

    // Top-Center: Timer + Boss/Pylon/Darkness/Banner Stack
    const topCenter = document.createElement('div');
    topCenter.className = 'kb-hud-top-center';

    const timerBox = document.createElement('div');
    timerBox.className = 'kb-hud-timer';
    const timerIcon = createSvgIcon(getUiIconSvg('clock', 15), 'kb-hud-timer-icon');
    const timerValue = document.createElement('span');
    timerValue.className = 'kb-hud-timer-val';
    timerValue.textContent = '10:00';
    const timerTag = document.createElement('span');
    timerTag.className = 'kb-hud-timer-tag';
    timerTag.textContent = 'STAGE';
    timerBox.append(timerTag, timerIcon, timerValue);

    const bossStack = document.createElement('div');
    bossStack.className = 'kb-hud-boss-stack';

    const bossBox = document.createElement('div');
    bossBox.className = 'kb-hud-boss';
    bossBox.setAttribute('data-kb-boss-hud', 'true');
    const bossHeader = document.createElement('div');
    bossHeader.className = 'kb-hud-boss-header';
    const bossTitleWrap = document.createElement('span');
    bossTitleWrap.className = 'kb-hud-boss-title';
    const bossSkull = createSvgIcon(getUiIconSvg('skull', 15), 'kb-boss-icon');
    const bossName = document.createElement('span');
    bossTitleWrap.append(bossSkull, bossName);
    const bossHpText = document.createElement('span');
    bossHpText.className = 'kb-hud-boss-hp-text';
    bossHeader.append(bossTitleWrap, bossHpText);
    const bossBar = document.createElement('div');
    bossBar.className = 'kb-hud-boss-bar';
    const bossFill = document.createElement('div');
    bossFill.className = 'kb-hud-boss-fill';
    bossBar.appendChild(bossFill);
    bossBox.append(bossHeader, bossBar);

    // Final Boss 11-Pylon Tracker HUD (positioned cleanly under Boss HP bar)
    const pylonBar = document.createElement('div');
    pylonBar.className = 'kb-hud-pylon-bar';
    pylonBar.setAttribute('data-kb-pylons-hud', 'true');
    const pylonLabel = document.createElement('span');
    pylonLabel.className = 'kb-hud-pylon-label';
    pylonLabel.textContent = 'PYLONS 0/11';
    const pylonPips = document.createElement('div');
    pylonPips.className = 'kb-hud-pylon-pips';
    const pylonStolenBadge = document.createElement('span');
    pylonStolenBadge.className = 'kb-hud-pylon-stolen';
    pylonBar.append(pylonLabel, pylonPips, pylonStolenBadge);

    // Big Bob Darkness HUD Pill (positioned cleanly under Boss HP bar)
    const darknessBox = document.createElement('div');
    darknessBox.className = 'kb-hud-darkness';
    darknessBox.setAttribute('data-kb-darkness-hud', 'true');
    const darknessText = document.createElement('span');
    darknessText.className = 'kb-hud-darkness-text';
    darknessText.textContent = 'DARKNESS ACTIVE — CHARGE LAMPS!';
    const darknessMeta = document.createElement('div');
    darknessMeta.className = 'kb-hud-darkness-meta';
    const darknessPips = document.createElement('div');
    darknessPips.className = 'kb-hud-darkness-pips';
    const darknessCount = document.createElement('span');
    darknessCount.className = 'kb-hud-darkness-count';
    darknessCount.textContent = '0/6 LAMPS';
    darknessMeta.append(darknessPips, darknessCount);
    darknessBox.append(darknessText, darknessMeta);

    const bannerBox = document.createElement('div');
    bannerBox.className = 'kb-hud-banner';

    bossStack.append(bossBox, pylonBar, darknessBox, bannerBox);
    topCenter.append(timerBox, bossStack);

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

    const killsPill = this.makeCounterPill('KILLS', 'skull', 'kb-counter-pill--kills');
    const goldPill = this.makeCounterPill('GOLD', 'gold', 'kb-counter-pill--gold');
    const silverPill = this.makeCounterPill('SILVER', 'silver', 'kb-counter-pill--silver');
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
    hpTrack.className = 'kb-bar-track kb-bar-track--hp';
    const hpFill = document.createElement('div');
    hpFill.className = 'kb-bar-fill kb-bar-fill--hp';
    const hpLabelRow = document.createElement('span');
    hpLabelRow.className = 'kb-bar-text';
    const hpIconWrap = createSvgIcon(getUiIconSvg('heart', 13), 'kb-bar-icon kb-bar-icon--hp');
    const hpText = document.createElement('span');
    hpText.className = 'kb-bar-val';
    hpLabelRow.append(hpIconWrap, hpText);
    hpTrack.append(hpFill, hpLabelRow);

    const shieldTrack = document.createElement('div');
    shieldTrack.className = 'kb-bar-track kb-bar-track--thin';
    const shieldFill = document.createElement('div');
    shieldFill.className = 'kb-bar-fill kb-bar-fill--shield';
    const shieldLabelRow = document.createElement('span');
    shieldLabelRow.className = 'kb-bar-text';
    const shieldIconWrap = createSvgIcon(getUiIconSvg('shield', 11), 'kb-bar-icon kb-bar-icon--shield');
    const shieldText = document.createElement('span');
    shieldText.className = 'kb-bar-val';
    shieldLabelRow.append(shieldIconWrap, shieldText);
    shieldTrack.append(shieldFill, shieldLabelRow);

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
    const speedIcon = createSvgIcon(getUiIconSvg('speed', 16), 'kb-speed-icon');
    const speedVal = document.createElement('span');
    speedVal.className = 'kb-speed-val';
    speedVal.textContent = '0.0';
    const speedUnit = document.createElement('span');
    speedUnit.className = 'kb-speed-unit';
    speedUnit.textContent = 'M/S';
    speedo.append(speedIcon, speedVal, speedUnit);

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
    this.pylonBar = pylonBar;
    this.pylonLabel = pylonLabel;
    this.pylonPips = pylonPips;
    this.pylonStolenBadge = pylonStolenBadge;
    this.darknessBox = darknessBox;
    this.darknessCount = darknessCount;
    this.darknessPips = darknessPips;
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
        this.timerTag.textContent = `${shortMapLabel(state.mapId)} T${state.mapTier}`;
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
      const hasPassiveMeter =
        typeof player.passiveMeter === 'number' && Number.isFinite(player.passiveMeter);
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

    // 6. Weapon & Tome Slot Trays + Item Strip
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

    // 8. Boss HP Bar, Final Boss Pylon HUD, & Big Bob Darkness HUD
    this.updateBossBar(state, catalog);
    this.updatePylonHud(state);
    this.updateDarknessHud(state);

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
    this.activeInteractLabel = this.updateInteractPrompt(
      state,
      catalog,
      activeDevice,
      gamepadProfile,
    );
    return this.activeInteractLabel;
  }

  public dispose(): void {
    this.root?.remove();
    this.root = null;
    this.lastWeaponSig = '';
    this.lastTomeSig = '';
    this.lastItemSig = '';
    this.lastPylonSig = '';
    this.lastDarknessSig = '';
    this.activeInteractLabel = null;
  }

  private makeCounterPill(
    label: string,
    icon: UiIconName,
    extraClass: string,
  ): { el: HTMLDivElement; val: HTMLSpanElement } {
    const el = document.createElement('div');
    el.className = `kb-counter-pill ${extraClass}`;
    el.title = label;
    const iconEl = createSvgIcon(getUiIconSvg(icon, 14), 'kb-counter-icon');
    const lbl = document.createElement('span');
    lbl.className = 'kb-counter-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'kb-counter-val';
    val.textContent = '0';
    el.append(iconEl, lbl, val);
    return { el, val };
  }

  private makePill(label: string, extraClass: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = `kb-kinetic-pill ${extraClass}`;
    span.textContent = label;
    return span;
  }

  private createPixelLockIcon(): HTMLSpanElement {
    const wrap = document.createElement('span');
    wrap.className = 'kb-lock-icon';
    wrap.setAttribute('aria-hidden', 'true');
    const shackle = document.createElement('span');
    shackle.className = 'kb-lock-shackle';
    const body = document.createElement('span');
    body.className = 'kb-lock-body';
    wrap.append(shackle, body);
    return wrap;
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
        const elemCol = ELEMENT_COLORS[def?.element ?? 'Physical'] ?? '#f5a623';
        box.style.setProperty('--kb-slot-color', elemCol);

        const accent = document.createElement('div');
        accent.className = 'kb-slot-accent';
        accent.style.background = elemCol;

        const iconWrap = createSvgIcon(getWeaponIconSvg(slot.weaponId, elemCol, 24), 'kb-slot-icon');

        const name = document.createElement('div');
        name.className = 'kb-slot-name';
        name.textContent = shortTag(slot.weaponId, def?.displayName, 4);

        const lvl = document.createElement('span');
        lvl.className = 'kb-slot-lvl';
        lvl.textContent = `L${slot.level}`;

        const cdVeil = document.createElement('div');
        cdVeil.className = 'kb-slot-cd-veil';
        cdVeil.setAttribute('data-slot-cd', String(i));

        box.append(accent, iconWrap, name, lvl, cdVeil);

        if (slot.stolenByPylonId !== null) {
          box.classList.add('is-stolen');
          box.setAttribute('data-stolen-pylon', String(slot.stolenByPylonId));
          box.title = `${def?.displayName ?? slot.weaponId} — LOCKED ON PYLON #${slot.stolenByPylonId}! Cleanse Pylon to reclaim.`;

          const tag = document.createElement('div');
          tag.className = 'kb-slot-stolen-tag';
          const lockIcon = this.createPixelLockIcon();
          const lockLabel = document.createElement('span');
          lockLabel.textContent = `P#${slot.stolenByPylonId}`;
          tag.append(lockIcon, lockLabel);
          box.appendChild(tag);
        } else {
          box.title = `${def?.displayName ?? slot.weaponId} (Lv ${slot.level})`;
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
      const tomeCol = def?.colorHex ?? '#38bdf8';
      box.style.setProperty('--kb-slot-color', tomeCol);

      const accent = document.createElement('div');
      accent.className = 'kb-slot-accent';
      accent.style.background = tomeCol;

      const iconWrap = createSvgIcon(getTomeIconSvg(slot.tomeId, tomeCol, 24), 'kb-slot-icon');

      const name = document.createElement('div');
      name.className = 'kb-slot-name';
      name.textContent = shortTag(slot.tomeId, def?.displayName, 4);
      box.title = `${def?.displayName ?? slot.tomeId} (Lv ${slot.level})`;

      const lvl = document.createElement('span');
      lvl.className = 'kb-slot-lvl';
      lvl.textContent = `L${slot.level}`;

      box.append(accent, iconWrap, name, lvl);
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
      const rarity = def?.rarity ?? 'Common';
      const chip = document.createElement('div');
      chip.className = 'kb-item-chip';
      chip.setAttribute('data-rarity', rarity);
      chip.appendChild(createSvgIcon(getItemIconSvg(stack.itemId, rarity, 20), 'kb-item-icon'));
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
    if (!this.bossBox || !this.bossName || !this.bossHpText || !this.bossFill) {
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
  }

  private updatePylonHud(state: Readonly<SimState>): void {
    if (!this.pylonBar || !this.pylonLabel || !this.pylonPips || !this.pylonStolenBadge) {
      return;
    }

    if (state.pylons.length === 0) {
      this.pylonBar.classList.remove('is-active');
      this.lastPylonSig = '';
      return;
    }

    this.pylonBar.classList.add('is-active');
    const stolenCount = state.player.weapons.filter((w) => w.stolenByPylonId !== null).length;
    const sig = `${stolenCount}|${state.pylons
      .map((p) => `${p.cleansed ? 2 : p.active ? 1 : 0}:${p.stolenWeaponId ? 1 : 0}`)
      .join(',')}`;

    if (sig === this.lastPylonSig) return;
    this.lastPylonSig = sig;

    const cleansed = state.pylons.filter((p) => p.cleansed).length;
    this.pylonLabel.textContent = `PYLONS ${cleansed}/${state.pylons.length}`;

    this.pylonPips.replaceChildren();
    for (let i = 0; i < state.pylons.length; i++) {
      const p = state.pylons[i]!;
      const pip = document.createElement('span');
      pip.className = 'kb-pylon-pip';
      if (p.cleansed) {
        pip.classList.add('is-cleansed');
      } else if (p.stolenWeaponId !== null) {
        pip.classList.add('is-stolen');
      } else if (p.active) {
        pip.classList.add('is-active');
      }
      this.pylonPips.appendChild(pip);
    }

    if (stolenCount > 0) {
      this.pylonStolenBadge.classList.add('is-active');
      this.pylonStolenBadge.textContent = `LOCKED: ${stolenCount}`;
    } else {
      this.pylonStolenBadge.classList.remove('is-active');
      this.pylonStolenBadge.textContent = '';
    }
  }

  private updateDarknessHud(state: Readonly<SimState>): void {
    if (!this.darknessBox || !this.darknessCount || !this.darknessPips) return;

    if (!state.darknessActive) {
      this.darknessBox.classList.remove('is-active');
      this.lastDarknessSig = '';
      return;
    }

    this.darknessBox.classList.add('is-active');
    const lamps = state.darknessLamps;
    const sig = lamps.map((l) => (l.lit ? '1' : '0')).join('');
    if (sig === this.lastDarknessSig) return;
    this.lastDarknessSig = sig;

    const litCount = lamps.filter((l) => l.lit).length;
    const total = lamps.length;
    this.darknessCount.textContent = total > 0 ? `${litCount}/${total} LAMPS` : 'FIND LAMPS';

    this.darknessPips.replaceChildren();
    for (let i = 0; i < total; i++) {
      const pip = document.createElement('span');
      pip.className = lamps[i]!.lit ? 'kb-lamp-pip is-lit' : 'kb-lamp-pip';
      this.darknessPips.appendChild(pip);
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

    // Check Boss Portal if open
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

    // Check active uncleansed Boss Pylons
    for (const pylon of state.pylons) {
      if (!pylon.active || pylon.cleansed) continue;
      const dx = pylon.pos.x - px;
      const dz = pylon.pos.z - pz;
      const distSq = dx * dx + dz * dz;
      const reach = Math.max(4.0, pylon.radius + 1.5);
      if (distSq <= reach * reach && distSq < bestDistSq) {
        bestDistSq = distSq;
        if (pylon.stolenWeaponId) {
          const wDef = catalog.weapons.find((w) => w.id === pylon.stolenWeaponId);
          bestLabel = `RECLAIM ${shortTag(pylon.stolenWeaponId, wDef?.displayName, 4)} (P#${pylon.index + 1})`;
        } else {
          bestLabel = `CHARGE PYLON #${pylon.index + 1}`;
        }
        bestCost = 0;
        bestChargeRatio =
          pylon.chargeDurationSec > 0
            ? Math.min(1, pylon.chargeProgress / pylon.chargeDurationSec)
            : null;
      }
    }

    // Check unlit Big Bob Darkness Lamps when darkness is active
    if (state.darknessActive && state.darknessLamps.length > 0) {
      for (const lamp of state.darknessLamps) {
        if (lamp.lit) continue;
        const dx = lamp.pos.x - px;
        const dz = lamp.pos.z - pz;
        const distSq = dx * dx + dz * dz;
        const reach = Math.max(4.0, lamp.radius + 1.5);
        if (distSq <= reach * reach && distSq < bestDistSq) {
          bestDistSq = distSq;
          bestLabel = `LIGHT DARKNESS LAMP #${lamp.id}`;
          bestCost = 0;
          bestChargeRatio = Math.max(0, Math.min(1, lamp.chargeProgress));
        }
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
