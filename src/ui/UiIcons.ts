/**
 * KRUNKEDBONK — Graphic-Novel Chiaroscuro SVG Portrait & Ornate Icon Library
 *
 * 100% standalone procedural vector art (zero external images), inspired by
 * classic underworld graphic-novel chiaroscuro inkwork:
 * - Winged obsidian-gold-crimson Underworld Brand Crest
 * - Bespoke 64x64 heavy-inked chiaroscuro illustrated portraits for ALL 21 playable characters
 * - Layered metallic & inked icons for ALL 30 weapons, ALL 26 tomes, ALL 87 items, and 8 shop upgrades
 * - Unified UI, HUD, and Touch Control glyphs
 */

import type { CharacterDef, Rarity, ShopUpgradeId } from '../contracts';

function svgWrap(body: string, size = 24, extraClass = ''): string {
  const cls = extraClass ? ` class="kb-svg ${extraClass}"` : ' class="kb-svg"';
  return `<svg${cls} viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

export function createSvgIcon(svgMarkup: string, className = 'kb-icon'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svgMarkup;
  return span;
}

export const RARITY_COLOR_HEX: Record<Rarity, string> = {
  Common: '#d6cbb8',
  Rare: '#60a5fa',
  Epic: '#c084fc',
  Legendary: '#f6c453',
  Quest: '#2dd4bf',
};

// ============================================================================
// 1. UNDERWORLD WINGED HERALDIC BRAND CREST
// ============================================================================

export function getBrandCrestSvg(size = 54): string {
  return `<svg class="kb-svg kb-brand-crest-svg" viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="kbCrestGold" x1="12" y1="4" x2="52" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#fff4c4"/>
        <stop offset="38%" stop-color="#f0bd4f"/>
        <stop offset="78%" stop-color="#a66b18"/>
        <stop offset="100%" stop-color="#5d3608"/>
      </linearGradient>
      <linearGradient id="kbCrestObsidian" x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#2a1932"/>
        <stop offset="55%" stop-color="#110a18"/>
        <stop offset="100%" stop-color="#050308"/>
      </linearGradient>
      <linearGradient id="kbCrestRuby" x1="32" y1="16" x2="32" y2="44" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ff8a95"/>
        <stop offset="45%" stop-color="#e11d38"/>
        <stop offset="100%" stop-color="#690818"/>
      </linearGradient>
    </defs>
    <!-- Flanked stylized bronze/gold wing blades -->
    <path d="M12 18L2 14L7 24L3 30L13 34Z" fill="url(#kbCrestGold)" stroke="#06040a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M52 18L62 14L57 24L61 30L51 34Z" fill="url(#kbCrestGold)" stroke="#06040a" stroke-width="2" stroke-linejoin="round"/>
    <!-- Crown spire -->
    <path d="M24 10L32 2L40 10L36 14H28L24 10Z" fill="url(#kbCrestGold)" stroke="#06040a" stroke-width="2" stroke-linejoin="round"/>
    <!-- Outer gilded hexagonal shield -->
    <path d="M32 6L53 14.5V31.5C53 45.2 43.8 54.8 32 60C20.2 54.8 11 45.2 11 31.5V14.5L32 6Z" fill="url(#kbCrestObsidian)" stroke="url(#kbCrestGold)" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 6L53 14.5V31.5C53 45.2 43.8 54.8 32 60C20.2 54.8 11 45.2 11 31.5V14.5L32 6Z" stroke="#06040a" stroke-width="1.2"/>
    <!-- Inner filigree border -->
    <path d="M32 11L48 17.6V31.5C48 42.2 40.9 50.1 32 54.4C23.1 50.1 16 42.2 16 31.5V17.6L32 11Z" stroke="#f0bd4f" stroke-opacity="0.55" stroke-width="1.2"/>
    <!-- Crossed gilded war-blades -->
    <path d="M19 19L45 45M45 19L19 45" stroke="#06040a" stroke-width="6.2" stroke-linecap="square"/>
    <path d="M19 19L45 45M45 19L19 45" stroke="url(#kbCrestGold)" stroke-width="3.6" stroke-linecap="square"/>
    <path d="M17 40L24 47M40 47L47 40" stroke="#e11d38" stroke-width="3.2" stroke-linecap="square"/>
    <!-- Faceted underworld blood-ruby centerpiece -->
    <polygon points="32,16 40,28 32,42 24,28" fill="url(#kbCrestRuby)" stroke="#06040a" stroke-width="2.2" stroke-linejoin="round"/>
    <polygon points="32,18.5 36.8,28 32,33.5 27.2,28" fill="#ff9ca6" fill-opacity="0.55"/>
    <polygon points="32,22 34.5,27 32,30 29.5,27" fill="#fff7d6"/>
    <!-- Bottom golden spear tip -->
    <polygon points="32,54 35.5,58 32,62 28.5,58" fill="#fce181" stroke="#06040a" stroke-width="1.4"/>
  </svg>`;
}

// ============================================================================
// 2. UI, HUD & TOUCH CONTROL GLYPHS
// ============================================================================

export type UiIconName =
  | 'play'
  | 'fighters'
  | 'quests'
  | 'shop'
  | 'settings'
  | 'skull'
  | 'gold'
  | 'silver'
  | 'heart'
  | 'shield'
  | 'speed'
  | 'refresh'
  | 'skip'
  | 'banish'
  | 'lock'
  | 'crown'
  | 'star'
  | 'map'
  | 'pause'
  | 'camera'
  | 'jump'
  | 'slide'
  | 'aim'
  | 'interact'
  | 'trophy'
  | 'check'
  | 'back'
  | 'pack'
  | 'music'
  | 'gamepad'
  | 'touch'
  | 'keyboard'
  | 'clock'
  | 'flame'
  | 'bolt';

const UI_PATHS: Record<UiIconName, string> = {
  play: '<path d="M7 4.2L20.5 12L7 19.8V4.2Z" fill="currentColor" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.8 7.5L16.5 12L8.8 16.5V7.5Z" fill="#fff8dc" fill-opacity="0.28"/>',
  fighters:
    '<path d="M12 3L16 7.5L15 11H9L8 7.5L12 3Z" fill="currentColor" stroke="#06040a" stroke-width="1.3"/><path d="M4.5 20.5C5 15.8 8 13.2 12 13.2C16 13.2 19 15.8 19.5 20.5H4.5Z" fill="currentColor" stroke="#06040a" stroke-width="1.3"/>',
  quests:
    '<path d="M6 2.5H18V21.5L12 17.5L6 21.5V2.5Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6L13.5 9.2L16.8 9.6L14.3 11.9L14.9 15.1L12 13.5L9.1 15.1L9.7 11.9L7.2 9.6L10.5 9.2L12 6Z" fill="currentColor"/>',
  shop:
    '<path d="M4 9H20L18.4 20.5H5.6L4 9Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 9V6.8A3.5 3.5 0 0 1 15.5 6.8V9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polygon points="12,12 14.8,14.8 12,17.6 9.2,14.8" fill="currentColor"/>',
  settings:
    '<circle cx="12" cy="12" r="3.4" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.5V5.2M12 18.8V21.5M2.5 12H5.2M18.8 12H21.5M5.3 5.3L7.2 7.2M16.8 16.8L18.7 18.7M18.7 5.3L16.8 7.2M7.2 16.8L5.3 18.7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  skull:
    '<path d="M12 2.5C7.4 2.5 4.2 5.9 4.2 10.2C4.2 12.9 5.6 15.1 7.6 16.4V20H16.4V16.4C18.4 15.1 19.8 12.9 19.8 10.2C19.8 5.9 16.6 2.5 12 2.5Z" fill="currentColor" stroke="#06040a" stroke-width="1.4"/><polygon points="7.5,9.5 11,10.8 8.5,13" fill="#06040a"/><polygon points="16.5,9.5 13,10.8 15.5,13" fill="#06040a"/><path d="M10.4 17V20M13.6 17V20" stroke="#06040a" stroke-width="1.6"/>',
  gold:
    '<polygon points="12,2.5 19.5,7 19.5,17 12,21.5 4.5,17 4.5,7" fill="#f0bd4f" stroke="#5d3608" stroke-width="1.8"/><polygon points="12,5.5 16.8,8.5 16.8,15.5 12,18.5 7.2,15.5 7.2,8.5" fill="#fff0a6" stroke="#a66b18" stroke-width="1.1"/><polygon points="12,8 14,12 12,16 10,12" fill="#a66b18"/>',
  silver:
    '<polygon points="12,2.5 20,7.5 20,16.5 12,21.5 4,16.5 4,7.5" fill="#cbd5e1" stroke="#1e293b" stroke-width="1.8"/><polygon points="12,6 17,9.2 17,14.8 12,18 7,14.8 7,9.2" fill="#f8fafc" fill-opacity="0.72"/><path d="M12 6V18" stroke="#64748b" stroke-width="1.1"/>',
  heart:
    '<path d="M12 20.8L4.2 13.1C2 10.9 2.2 7.2 4.6 5.2C6.8 3.3 10.1 3.9 12 6.2C13.9 3.9 17.2 3.3 19.4 5.2C21.8 7.2 22 10.9 19.8 13.1L12 20.8Z" fill="currentColor" stroke="#06040a" stroke-width="1.3"/><path d="M6.5 7.5C7.6 6.4 9.2 6.4 10.2 7.4" stroke="#fff" stroke-opacity="0.45" stroke-width="1.4" stroke-linecap="round"/>',
  shield:
    '<path d="M12 2.8L20 6.4V12.2C20 16.9 16.6 20.2 12 21.6C7.4 20.2 4 16.9 4 12.2V6.4L12 2.8Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 5.5V19" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.3"/>',
  speed:
    '<path d="M13.5 2.2L5 13H11.5L10.3 21.8L19 11H12.5L13.5 2.2Z" fill="currentColor" stroke="#06040a" stroke-width="1.2" stroke-linejoin="round"/>',
  refresh:
    '<path d="M19 8A7.5 7.5 0 1 0 19.4 13.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M19.5 3.5V8.5H14.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  skip:
    '<path d="M5 6L13 12L5 18V6Z" fill="currentColor"/><path d="M13 6L21 12L13 18V6Z" fill="currentColor"/>',
  banish:
    '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2.2"/><path d="M6.2 6.2L17.8 17.8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  lock:
    '<rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" stroke="#06040a" stroke-width="1.2"/><path d="M8 10.5V7.5A4 4 0 0 1 16 7.5V10.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="15.2" r="1.4" fill="#06040a"/>',
  crown:
    '<path d="M3 18.5L5 6.5L10 11.5L12 5L14 11.5L19 6.5L21 18.5H3Z" fill="currentColor" stroke="#06040a" stroke-width="1.4" stroke-linejoin="round"/>',
  star:
    '<path d="M12 2.2L14.7 8.4L21.3 9.2L16.5 13.7L17.7 20.5L12 17.2L6.3 20.5L7.5 13.7L2.7 9.2L9.3 8.4L12 2.2Z" fill="currentColor" stroke="#06040a" stroke-width="1.1" stroke-linejoin="round"/>',
  map:
    '<path d="M3 6L9 3.5L15 6L21 3.5V18L15 20.5L9 18L3 20.5V6Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 3.5V18M15 6V20.5" stroke="currentColor" stroke-width="1.6"/>',
  pause:
    '<rect x="6" y="4.5" width="4.5" height="15" rx="1" fill="currentColor"/><rect x="13.5" y="4.5" width="4.5" height="15" rx="1" fill="currentColor"/>',
  camera:
    '<rect x="3" y="7" width="18" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M8 7L9.5 4.5H14.5L16 7" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" fill="currentColor"/>',
  jump:
    '<path d="M12 3.8L5.2 11.5H10V19.5H14V11.5H18.8L12 3.8Z" fill="currentColor"/><path d="M6 21.5H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  slide:
    '<path d="M4 17.5L12 9.5L15.5 13L20 8.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20.5H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 8.5H20V14.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  aim:
    '<circle cx="12" cy="12" r="6.5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2.5V6M12 18V21.5M2.5 12H6M18 12H21.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  interact:
    '<path d="M12 2.8L19.8 9.5L12 21.2L4.2 9.5L12 2.8Z" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="10.5" r="2.2" fill="currentColor"/>',
  trophy:
    '<path d="M7 4H17V9.5C17 12.6 14.8 15 12 15C9.2 15 7 12.6 7 9.5V4Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2"/><path d="M7 6H4V8.5C4 10.2 5.3 11.4 7 11.5M17 6H20V8.5C20 10.2 18.7 11.4 17 11.5" stroke="currentColor" stroke-width="2"/><path d="M12 15V19M8.5 19.5H15.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  check:
    '<path d="M4.5 12.5L9.5 17.5L19.5 6.5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  back:
    '<path d="M14.5 5.5L8 12L14.5 18.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  pack:
    '<path d="M4 7.5L12 3.5L20 7.5V16.5L12 20.5L4 16.5V7.5Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 7.5L12 11.5L20 7.5M12 11.5V20.5" stroke="currentColor" stroke-width="1.8"/>',
  music:
    '<path d="M9 17.5V6.5L19 4.5V15.5" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.5" fill="currentColor"/>',
  gamepad:
    '<path d="M6.5 8H17.5C19.8 8 21.5 10.2 21 13.5L20.3 16.8C19.9 18.3 18.2 18.9 17 17.9L14.8 16H9.2L7 17.9C5.8 18.9 4.1 18.3 3.7 16.8L3 13.5C2.5 10.2 4.2 8 6.5 8Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V13.5M6.5 12H9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="15.5" cy="11.2" r="1" fill="currentColor"/><circle cx="17.5" cy="12.8" r="1" fill="currentColor"/>',
  touch:
    '<rect x="7" y="2.5" width="10" height="19" rx="2" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/>',
  keyboard:
    '<rect x="2.5" y="6" width="19" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M6 10H8M10 10H12M14 10H16M18 10H18.5M6 14H15M17 14H18.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  clock:
    '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12L15.2 14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  flame:
    '<path d="M12.5 2.2C14.8 6.2 18.8 8.8 18.8 13.5C18.8 17.5 15.7 20.8 12 20.8C8.3 20.8 5.2 17.5 5.2 13.5C5.2 10.4 7.3 8 9 6.3C9.2 8.2 10.2 9.4 11 9.8C10.5 7 11.4 4.2 12.5 2.2Z" fill="currentColor" stroke="#06040a" stroke-width="1.1"/><path d="M12 12.2C13.5 13.8 14.3 15.2 13.8 17C13.4 18.4 12.6 19 12 19C10.8 19 10 17.8 10.3 16.1C10.6 14.6 11.3 13.4 12 12.2Z" fill="#fff6c7" fill-opacity="0.72"/>',
  bolt:
    '<path d="M13 2L4.8 13H11.5L10.3 22L19.2 11H12.5L13 2Z" fill="currentColor" stroke="#06040a" stroke-width="1.2" stroke-linejoin="round"/>',
};

export function getUiIconSvg(name: UiIconName, size = 18): string {
  return svgWrap(UI_PATHS[name] ?? UI_PATHS.star, size);
}

// ============================================================================
// 3. ALL 30 WEAPON ICONS (INKED METALLIC GRAPHIC-NOVEL STYLING)
// ============================================================================

export function getWeaponIconSvg(weaponId: string, color = '#f0bd4f', size = 24): string {
  const id = weaponId.toLowerCase();
  const aura = `<circle cx="12" cy="12" r="9.5" fill="${color}" fill-opacity="0.14"/>`;
  let body = '';

  if (id.includes('firestaff')) {
    body = `<path d="M4.5 19.5L14.8 9.2" stroke="#06040a" stroke-width="4.4" stroke-linecap="round"/><path d="M4.5 19.5L14.8 9.2" stroke="#b97843" stroke-width="2.4" stroke-linecap="round"/><path d="M12.2 10.5C13.8 8.8 15.2 10.2 13.8 11.8" stroke="#f0bd4f" stroke-width="1.6"/><path d="M16.4 3.2C19.2 6.2 20.5 8.5 19.4 11.4C18.5 13.5 16.3 14.4 14.3 13.6C12.3 12.8 11.6 10.5 12.7 8.4C13.6 6.6 15.1 5 16.4 3.2Z" fill="${color}" stroke="#06040a" stroke-width="1.5"/><path d="M16.2 7.4C17.2 8.8 17.6 10.2 17 11.4C16.5 12.3 15.4 12.6 14.6 12C13.9 11.4 13.8 10.2 14.5 9.1C15 8.4 15.6 7.8 16.2 7.4Z" fill="#fff6c7"/>`;
  } else if (id.includes('bone')) {
    body = `<path d="M7.5 6.5A2.3 2.3 0 1 1 5.3 10L14 18.7A2.3 2.3 0 1 1 17.5 16.5A2.3 2.3 0 1 1 15.5 13L6.8 4.3A2.3 2.3 0 1 1 7.5 6.5Z" fill="#f7eed8" stroke="#06040a" stroke-width="1.6"/><path d="M8.5 9.5L14.5 15.5" stroke="#c8b89a" stroke-width="1.3" stroke-linecap="round"/>`;
  } else if (id.includes('katana')) {
    body = `<path d="M4 20L8.2 15.8" stroke="#06040a" stroke-width="4" stroke-linecap="round"/><path d="M4 20L8.2 15.8" stroke="#991b1b" stroke-width="2.1" stroke-linecap="round"/><path d="M8.8 15.2L20 3.8C19 7.6 15.8 11.8 11.2 16.2L8.8 15.2Z" fill="#f1f5f9" stroke="#06040a" stroke-width="1.5" stroke-linejoin="round"/><path d="M10.4 14.6L18.2 6.6" stroke="${color}" stroke-width="1.1"/><path d="M6.5 13.8L10.2 17.5" stroke="#f0bd4f" stroke-width="2.4" stroke-linecap="round"/>`;
  } else if (id.includes('herosword')) {
    body = `<path d="M12 2.2L15.4 7.6V15.2H8.6V7.6L12 2.2Z" fill="#fef08a" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 4.5V14.5" stroke="#f59e0b" stroke-width="1.4"/><path d="M6 15.2H18" stroke="#06040a" stroke-width="4.4" stroke-linecap="round"/><path d="M6 15.2H18" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round"/><path d="M12 15.5V21.5" stroke="#b45309" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="15.2" r="1.8" fill="#fff8dc" stroke="#06040a" stroke-width="1"/>`;
  } else if (id.includes('corrupt')) {
    body = `<path d="M12 2L15.8 7.4L13.5 10.6L15.8 14.5H8.2L10.5 10.6L8.2 7.4L12 2Z" fill="#c084fc" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 5V13.5" stroke="#faf5ff" stroke-width="1.3"/><path d="M6 14.8H18M12 14.8V21.5" stroke="#6b21a8" stroke-width="2.8" stroke-linecap="round"/>`;
  } else if (id.includes('sword')) {
    body = `<path d="M19.2 3.8L14.2 5L6.5 12.8L11.2 17.5L19 9.8L20.2 4.8L19.2 3.8Z" fill="#e2e8f0" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M17.5 6.5L9.5 14.5" stroke="#94a3b8" stroke-width="1.4"/><path d="M5 11.8L12.2 19M4.2 19.8L8.5 15.5" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
  } else if (id.includes('revolver')) {
    body = `<path d="M3.2 9.2H20V12.5H13.6L11.5 14.6H8.4L6.8 20H3.8L5.4 13.6H3.2V9.2Z" fill="#cbd5e1" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10.6" cy="11" r="2.2" fill="${color}" stroke="#06040a" stroke-width="1.1"/>`;
  } else if (id.includes('shotgun')) {
    body = `<path d="M2.8 13.6L8.5 12L19.8 8.2L21 11.2L10.5 14.6L7.5 18.8L3.8 17.6L6.4 14.6L2.8 13.6Z" fill="#94a3b8" stroke="#06040a" stroke-width="1.5" stroke-linejoin="round"/><path d="M11 11.2L16.4 9.4" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
  } else if (id.includes('sniper')) {
    body = `<path d="M2.2 13.2H21.8M7 13.2L5.4 18H8.6L10.6 13.2" stroke="#06040a" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.2 13.2H21.8M7 13.2L5.4 18H8.6L10.6 13.2" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.2" y="7.2" width="7.4" height="3.2" rx="1" fill="${color}" stroke="#06040a" stroke-width="1.3"/><path d="M12 10.4V13.2" stroke="#94a3b8" stroke-width="1.8"/>`;
  } else if (id.includes('aura')) {
    body = `<circle cx="12" cy="12" r="8.8" stroke="${color}" stroke-width="2.1" stroke-dasharray="4 2"/><circle cx="12" cy="12" r="5.2" fill="${color}" fill-opacity="0.38" stroke="${color}" stroke-width="1.8"/><polygon points="12,8.2 15.8,12 12,15.8 8.2,12" fill="#fff8dc" stroke="#06040a" stroke-width="1"/>`;
  } else if (id.includes('dexecutioner') || id.includes('axe')) {
    body = `<path d="M5.5 19.5L16.5 8.5" stroke="#06040a" stroke-width="4.4" stroke-linecap="round"/><path d="M5.5 19.5L16.5 8.5" stroke="#a16207" stroke-width="2.4" stroke-linecap="round"/><path d="M10.6 6.2C14.5 4.4 18.8 6.4 19.8 10.6C17.2 12 14.5 12.2 12 10.8L10.6 6.2Z" fill="${color}" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M14.2 6.8C16.4 6.6 17.8 7.8 18.3 9.8" stroke="#fff8dc" stroke-width="1.2" stroke-linecap="round"/>`;
  } else if (id.includes('bow')) {
    body = `<path d="M7 4.2C14.8 5.2 18.8 9.8 19.8 17" stroke="#06040a" stroke-width="4.2" stroke-linecap="round"/><path d="M7 4.2C14.8 5.2 18.8 9.8 19.8 17" stroke="#d97706" stroke-width="2.4" stroke-linecap="round"/><path d="M7.2 4.4L19.6 16.8" stroke="#f7eed8" stroke-width="1.2"/><path d="M4.8 19.2L17.8 6.2M13.8 6.2H17.8V10.2" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (id.includes('aegis')) {
    body = `<path d="M12 2.6L19.8 6.4V12.5C19.8 17 16.4 20.2 12 21.8C7.6 20.2 4.2 17 4.2 12.5V6.4L12 2.6Z" fill="${color}" fill-opacity="0.4" stroke="#06040a" stroke-width="2.8" stroke-linejoin="round"/><path d="M12 2.6L19.8 6.4V12.5C19.8 17 16.4 20.2 12 21.8C7.6 20.2 4.2 17 4.2 12.5V6.4L12 2.6Z" stroke="${color}" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 6.8V17.2M7.8 11H16.2" stroke="#fff7cc" stroke-width="2.1" stroke-linecap="round"/>`;
  } else if (id.includes('lightning')) {
    body = `<path d="M13.8 2L5 13H11.5L9.8 22L19 10.8H12.5L13.8 2Z" fill="#fde047" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M12.5 5.8L8.2 11.6H12.8" stroke="#fffbeb" stroke-width="1.2" stroke-linecap="round"/>`;
  } else if (id.includes('flame') || id.includes('dragon')) {
    body = `<path d="M12.5 2.5C15.8 6.3 19.2 9.4 18.8 14C18.3 18 15.4 20.8 12 20.8C8.3 20.8 5.2 17.8 5.2 13.8C5.2 10.5 7.4 7.8 9.2 6.2C9.5 8.4 10.5 9.8 11.4 10.2C10.9 7.2 11.5 4.5 12.5 2.5Z" fill="${color}" stroke="#06040a" stroke-width="1.5"/><path d="M12 12.2C13.8 13.8 14.6 15.4 14.1 17.2C13.7 18.6 12.8 19.2 12 19.2C10.6 19.2 9.7 17.9 10 16.2C10.3 14.7 11.2 13.4 12 12.2Z" fill="#fff4b8"/>`;
  } else if (id.includes('rocket')) {
    body = `<path d="M18.8 5.2C14.2 5.2 10 7.8 7.3 11.5L12.5 16.7C16.2 14 18.8 9.8 18.8 5.2Z" fill="#ef4444" stroke="#06040a" stroke-width="1.5" stroke-linejoin="round"/><circle cx="13.8" cy="10.2" r="1.7" fill="#fef08a" stroke="#06040a" stroke-width="1"/><path d="M6.4 13.6L3.8 17.8L8 16.6M10.4 17.6L6.4 20.2L7.4 16" stroke="#fb923c" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('banana')) {
    body = `<path d="M17.8 5.2C18.8 11.6 14.6 17.8 6.8 18.8C5.2 19 4.8 17.4 6 16.4C11 13.5 14 9.4 15.6 5C16 4 17.6 4 17.8 5.2Z" fill="#fde047" stroke="#06040a" stroke-width="1.6"/>`;
  } else if (id.includes('tornado')) {
    body = `<path d="M4.2 6.2H19.8M6.2 10.3H17.8M8.4 14.4H15.6M10.4 18.6H13.6" stroke="#06040a" stroke-width="4.2" stroke-linecap="round"/><path d="M4.2 6.2H19.8M6.2 10.3H17.8M8.4 14.4H15.6M10.4 18.6H13.6" stroke="#67e8f9" stroke-width="2.3" stroke-linecap="round"/>`;
  } else if (id.includes('frost')) {
    body = `<path d="M12 2.8V21.2M4 7.4L20 16.6M20 7.4L4 16.6" stroke="#06040a" stroke-width="3.8" stroke-linecap="round"/><path d="M12 2.8V21.2M4 7.4L20 16.6M20 7.4L4 16.6" stroke="#67e8f9" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.8" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5"/>`;
  } else if (id.includes('noodle')) {
    body = `<path d="M3.8 17.2C6.8 8 11 19 14 10C16 4 19 9 20.2 6.8" stroke="#06040a" stroke-width="5" stroke-linecap="round"/><path d="M3.8 17.2C6.8 8 11 19 14 10C16 4 19 9 20.2 6.8" stroke="#f472b6" stroke-width="3" stroke-linecap="round"/><path d="M3.8 17.2C6.8 8 11 19 14 10C16 4 19 9 20.2 6.8" stroke="#67e8f9" stroke-width="1.1" stroke-linecap="round"/>`;
  } else if (id.includes('chunker')) {
    body = `<polygon points="12,3 19.4,7.4 19.8,15.6 13,20.8 5.2,17.2 4.2,8.8" fill="#94a3b8" stroke="#06040a" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 3L13 11.6L19.8 15.6M13 11.6L5.2 17.2" stroke="#e2e8f0" stroke-width="1.3"/>`;
  } else if (id.includes('mine')) {
    body = `<circle cx="12" cy="13" r="6.2" fill="#475569" stroke="#06040a" stroke-width="1.7"/><circle cx="12" cy="13" r="2.5" fill="#ef4444" stroke="#06040a" stroke-width="1"/><path d="M12 4.2V7M5.2 8.4L7.4 10M18.8 8.4L16.6 10M3.8 15H6.5M17.5 15H20.2" stroke="#cbd5e1" stroke-width="2.1" stroke-linecap="round"/>`;
  } else if (id.includes('poison')) {
    body = `<path d="M9.4 3.8H14.6M10.4 3.8V8.5L5.2 16.6C4.5 18 5.5 19.8 7.1 19.8H16.9C18.5 19.8 19.5 18 18.8 16.6L13.6 8.5V3.8" fill="#4ade80" fill-opacity="0.34" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/><path d="M9.4 3.8H14.6M10.4 3.8V8.5L5.2 16.6C4.5 18 5.5 19.8 7.1 19.8H16.9C18.5 19.8 19.5 18 18.8 16.6L13.6 8.5V3.8" stroke="#4ade80" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.4 15H16.6L17.6 17.8H6.4L7.4 15Z" fill="#4ade80"/>`;
  } else if (id.includes('blackhole')) {
    body = `<ellipse cx="12" cy="12" rx="9.2" ry="4.2" transform="rotate(-24 12 12)" stroke="#e879f9" stroke-width="2.2"/><circle cx="12" cy="12" r="4.6" fill="#06040a" stroke="#c084fc" stroke-width="1.8"/>`;
  } else if (id.includes('blood')) {
    body = `<path d="M12 3.2C12 3.2 5.8 10.2 5.8 14.6A6.2 6.2 0 0 0 18.2 14.6C18.2 10.2 12 3.2 12 3.2Z" fill="#dc2626" stroke="#06040a" stroke-width="1.6"/><path d="M9.4 14.5A2.6 2.6 0 0 0 12 17.2" stroke="#fecaca" stroke-width="1.6" stroke-linecap="round"/>`;
  } else if (id.includes('dagger')) {
    body = `<path d="M18.8 5.2L11.5 14.6L9.4 12.5L18.8 5.2Z" fill="#7dd3fc" stroke="#06040a" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.8 11L13.2 16.4M5.2 18.8L9.5 14.5" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round"/><path d="M4.8 7.2A6.2 6.2 0 0 1 11.2 3.8" stroke="#67e8f9" stroke-width="1.6" stroke-linecap="round"/>`;
  } else if (id.includes('dice')) {
    body = `<rect x="4.2" y="4.2" width="15.6" height="15.6" rx="2.5" fill="#f7eed8" stroke="#06040a" stroke-width="1.7"/><circle cx="8.5" cy="8.5" r="1.4" fill="#0f172a"/><circle cx="15.5" cy="8.5" r="1.4" fill="#0f172a"/><circle cx="12" cy="12" r="1.6" fill="#dc2626"/><circle cx="8.5" cy="15.5" r="1.4" fill="#0f172a"/><circle cx="15.5" cy="15.5" r="1.4" fill="#0f172a"/>`;
  } else if (id.includes('scythe')) {
    body = `<path d="M6.2 19.8L16.6 5.8" stroke="#06040a" stroke-width="4.2" stroke-linecap="round"/><path d="M6.2 19.8L16.6 5.8" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round"/><path d="M16.8 5.2C12 3.8 6.8 6 4.8 10.6C8.4 9 12.6 9.3 15.6 11.4L16.8 5.2Z" fill="#34d399" stroke="#06040a" stroke-width="1.5" stroke-linejoin="round"/>`;
  } else {
    body = `<circle cx="12" cy="12" r="7.2" fill="${color}" stroke="#06040a" stroke-width="1.7"/><circle cx="12" cy="12" r="3.2" fill="#fff8dc"/>`;
  }

  return svgWrap(`${aura}${body}`, size);
}

// ============================================================================
// 4. ALL 26 TOME ICONS (GILDED GRIMOIRE + EMBOSSED STAT SIGIL)
// ============================================================================

export function getTomeIconSvg(tomeId: string, color = '#38bdf8', size = 24): string {
  const id = tomeId.toLowerCase();
  let glyph = '<circle cx="13.2" cy="11.4" r="2.7" fill="#fff8dc"/>';

  if (id.includes('damage')) {
    glyph = '<path d="M10.4 14.5L16 8.6M13.5 8.6H16.2V11.2" stroke="#fff8dc" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (id.includes('agility') || id.includes('speed')) {
    glyph = '<path d="M13.6 7.2L10 12H13L12.2 16L16.2 11H13L13.6 7.2Z" fill="#fff8dc"/>';
  } else if (id.includes('cooldown')) {
    glyph = '<circle cx="13.2" cy="11.4" r="3.4" stroke="#fff8dc" stroke-width="1.7"/><path d="M13.2 9.4V11.8L14.8 12.8" stroke="#fff8dc" stroke-width="1.5" stroke-linecap="round"/>';
  } else if (id.includes('quantity')) {
    glyph = '<circle cx="10.6" cy="9.8" r="1.4" fill="#fff8dc"/><circle cx="15.4" cy="9.8" r="1.4" fill="#fff8dc"/><circle cx="13" cy="14" r="1.4" fill="#fff8dc"/>';
  } else if (id.includes('armor') || id.includes('shield')) {
    glyph = '<path d="M13.2 7.4L16.6 9V12C16.6 14.2 15 15.6 13.2 16.3C11.4 15.6 9.8 14.2 9.8 12V9L13.2 7.4Z" fill="#fff8dc"/>';
  } else if (id.includes('health') || id.includes('regen') || id.includes('blood')) {
    glyph = '<path d="M13.2 15.6L9.9 12.4C9.1 11.5 9.2 10 10.2 9.3C11.1 8.6 12.3 8.9 13.2 9.9C14 8.9 15.2 8.6 16.1 9.3C17.1 10 17.2 11.5 16.4 12.4L13.2 15.6Z" fill="#fff8dc"/>';
  } else if (id.includes('precision') || id.includes('crit')) {
    glyph = '<circle cx="13.2" cy="11.4" r="3.1" stroke="#fff8dc" stroke-width="1.6"/><circle cx="13.2" cy="11.4" r="1.1" fill="#fff8dc"/>';
  } else if (id.includes('luck') || id.includes('gamba')) {
    glyph = '<path d="M13.2 7L14.4 9.8L17.4 10.2L15.1 12.2L15.8 15.2L13.2 13.7L10.6 15.2L11.3 12.2L9 10.2L12 9.8L13.2 7Z" fill="#fff8dc"/>';
  } else if (id.includes('gold') || id.includes('silver') || id.includes('hoarder')) {
    glyph = '<polygon points="13.2,7.6 16.6,11.4 13.2,15.2 9.8,11.4" fill="#fef08a" stroke="#78350f" stroke-width="1.2"/>';
  } else if (id.includes('xp')) {
    glyph = '<polygon points="13.2,7 17,11.4 13.2,15.8 9.4,11.4" fill="#fff8dc"/>';
  } else if (id.includes('cursed') || id.includes('chaos')) {
    glyph = '<path d="M10.2 9.2L16.2 14.4M16.2 9.2L10.2 14.4" stroke="#fff8dc" stroke-width="2.1" stroke-linecap="round"/>';
  } else if (id.includes('size') || id.includes('knockback')) {
    glyph = '<path d="M9.6 11.4H16.8M13.2 7.8V15" stroke="#fff8dc" stroke-width="2.1" stroke-linecap="round"/>';
  }

  const body = `
    <path d="M4.5 4.2C4.5 3.3 5.3 2.6 6.2 2.6H18.8C19.6 2.6 20.4 3.3 20.4 4.2V19.8C20.4 20.7 19.6 21.4 18.8 21.4H6.2C5.3 21.4 4.5 20.7 4.5 19.8V4.2Z" fill="${color}" stroke="#06040a" stroke-width="1.8"/>
    <path d="M4.5 4.2H8.2V21.4H6.2C5.3 21.4 4.5 20.7 4.5 19.8V4.2Z" fill="#06040a" fill-opacity="0.52"/>
    <path d="M8.2 4.6H18.4V17.4H8.2" stroke="#f6d478" stroke-opacity="0.55" stroke-width="1"/>
    <path d="M8 18.2H19.4" stroke="#f7eed8" stroke-width="1.8"/>
    <path d="M18.2 3.4L19.8 5M18.2 19.6L19.8 18" stroke="#fce181" stroke-width="1.3"/>
    ${glyph}
  `;
  return svgWrap(body, size);
}

// ============================================================================
// 5. ALL 87 ITEM ICONS (SEMANTIC SILHOUETTES WITH HEAVY INK + SPECULAR)
// ============================================================================

export function getItemIconSvg(itemId: string, rarity: Rarity = 'Common', size = 22): string {
  const id = itemId.toLowerCase();
  const col = RARITY_COLOR_HEX[rarity] ?? '#d6cbb8';
  const aura = `<circle cx="12" cy="12" r="9.4" fill="${col}" fill-opacity="0.13"/>`;
  let body = '';

  if (id.includes('bonker')) {
    body = `<path d="M5.5 18.8L14 10.3" stroke="#06040a" stroke-width="4.4" stroke-linecap="round"/><path d="M5.5 18.8L14 10.3" stroke="#b45309" stroke-width="2.5" stroke-linecap="round"/><rect x="10.2" y="3.8" width="9.4" height="6.2" rx="1.4" transform="rotate(42 15 7)" fill="#f472b6" stroke="#06040a" stroke-width="1.5"/>`;
  } else if (id.includes('fork')) {
    body = `<path d="M12 12V20.5M8.4 3.8V10C8.4 11.9 10 13 12 13C14 13 15.6 11.9 15.6 10V3.8M12 3.8V12" stroke="#06040a" stroke-width="4" stroke-linecap="round"/><path d="M12 12V20.5M8.4 3.8V10C8.4 11.9 10 13 12 13C14 13 15.6 11.9 15.6 10V3.8M12 3.8V12" stroke="#fde047" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('meatball')) {
    body = `<circle cx="12" cy="12" r="7.8" fill="#ea580c" stroke="#06040a" stroke-width="1.7"/><circle cx="9.4" cy="9.4" r="1.6" fill="#fed7aa"/><circle cx="14.6" cy="11" r="1.3" fill="#9a3412"/><circle cx="11.5" cy="15.2" r="1.5" fill="#9a3412"/>`;
  } else if (id.includes('cheese')) {
    body = `<path d="M3.2 16.6L13 5.2L20.8 11.4V17.8H3.2V16.6Z" fill="#fde047" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="11" cy="13.6" r="1.7" fill="#ca8a04"/><circle cx="16.2" cy="14.6" r="1.3" fill="#ca8a04"/>`;
  } else if (id.includes('key')) {
    body = `<circle cx="8.4" cy="9.8" r="4.3" stroke="${col}" stroke-width="2.5"/><path d="M12 12.8L19.6 19.6M16.4 16.8L18.6 14.6" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
  } else if (id.includes('anvil')) {
    body = `<path d="M3.8 7.8H20.2L17.6 12.5H14.6V16H18.8V19.2H5.2V16H9.4V12.5H6.4L3.8 7.8Z" fill="#94a3b8" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.2 9.4H17.8" stroke="#e2e8f0" stroke-width="1.2"/>`;
  } else if (id.includes('lamp') || id.includes('lantern') || id.includes('light')) {
    body = `<path d="M7.8 6.8H16.2L17.8 14.5L12 18.8L6.2 14.5L7.8 6.8Z" fill="#fde047" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 6.8V4.6H14.5V6.8M8.8 20.2H15.2" stroke="#f0bd4f" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('ring')) {
    body = `<circle cx="12" cy="13.6" r="6" stroke="#06040a" stroke-width="4.4"/><circle cx="12" cy="13.6" r="6" stroke="${col}" stroke-width="2.5"/><polygon points="12,3.2 15.6,7 12,10 8.4,7" fill="#fef08a" stroke="#06040a" stroke-width="1.4"/>`;
  } else if (id.includes('glove') || id.includes('knuckle')) {
    body = `<path d="M6.8 12V6.4C6.8 5.6 7.5 4.8 8.4 4.8C9.2 4.8 10 5.6 10 6.4V10M10 6.4C10 5.6 10.7 4.8 11.5 4.8C12.4 4.8 13.1 5.6 13.1 6.4V10M13.1 6.8C13.1 6 13.8 5.3 14.6 5.3C15.5 5.3 16.2 6 16.2 6.8V11.4L17.7 10.4C18.4 9.9 19.2 10.6 18.7 11.5L16.6 17.6C16.1 19.2 14.5 20.2 12.5 20.2H9.4C7.6 20.2 6.8 19 6.8 17.2V12Z" fill="${col}" stroke="#06040a" stroke-width="1.5"/>`;
  } else if (id.includes('sock') || id.includes('sneaker') || id.includes('skate') || id.includes('roller') || id.includes('speed')) {
    body = `<path d="M5.8 5.8H12V13L18.6 14.6C19.6 14.9 20.2 15.9 19.6 17.2L19 18.8H5.8V5.8Z" fill="${col}" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M4.2 19.8H20.2" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('shield') || id.includes('chonkplate') || id.includes('mirror')) {
    body = `<path d="M12 2.8L19.8 6.4V12.5C19.8 17 16.4 20.2 12 21.8C7.6 20.2 4.2 17 4.2 12.5V6.4L12 2.8Z" fill="${col}" fill-opacity="0.38" stroke="${col}" stroke-width="2.1" stroke-linejoin="round"/>`;
  } else if (id.includes('blade') || id.includes('dagger') || id.includes('cleaver') || id.includes('claw')) {
    body = `<path d="M18.4 4.6L10.4 14.6L8.4 12.6L18.4 4.6Z" fill="${col}" stroke="#06040a" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.8 11L12.2 16.4M4.8 19.2L9 15" stroke="#f7eed8" stroke-width="2.3" stroke-linecap="round"/>`;
  } else if (id.includes('lightning') || id.includes('battery') || id.includes('plug') || id.includes('core')) {
    body = `<path d="M13.2 2.2L5.2 13H11.5L10.3 21.8L18.8 11H12.5L13.2 2.2Z" fill="#fde047" stroke="#06040a" stroke-width="1.5" stroke-linejoin="round"/>`;
  } else if (id.includes('ice') || id.includes('crystal')) {
    body = `<polygon points="12,2.8 19.2,8.4 17.2,18.8 6.8,18.8 4.8,8.4" fill="#67e8f9" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 2.8V18.8M4.8 8.4L19.2 8.4" stroke="#e0f2fe" stroke-width="1.3"/>`;
  } else if (id.includes('time') || id.includes('warudo') || id.includes('bracelet')) {
    body = `<circle cx="12" cy="12" r="8.2" fill="#171022" stroke="${col}" stroke-width="2.3"/><path d="M12 7.2V12L15.6 14.2" stroke="#fde047" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('magnet')) {
    body = `<path d="M6.4 4.8V12.5A5.6 5.6 0 0 0 17.6 12.5V4.8" stroke="#ef4444" stroke-width="3.8" stroke-linecap="butt"/><path d="M4.5 4.8H8.3M15.7 4.8H19.5" stroke="#e2e8f0" stroke-width="3.2"/>`;
  } else if (id.includes('clover')) {
    body = `<circle cx="9.2" cy="9" r="3.5" fill="#4ade80" stroke="#06040a" stroke-width="1.2"/><circle cx="14.8" cy="9" r="3.5" fill="#4ade80" stroke="#06040a" stroke-width="1.2"/><circle cx="9.2" cy="14" r="3.5" fill="#22c55e" stroke="#06040a" stroke-width="1.2"/><circle cx="14.8" cy="14" r="3.5" fill="#22c55e" stroke="#06040a" stroke-width="1.2"/><path d="M12 15V21.2" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round"/>`;
  } else if (id.includes('book') || id.includes('wisdom')) {
    body = `<rect x="4.8" y="3.8" width="14.4" height="16.4" rx="1.8" fill="${col}" stroke="#06040a" stroke-width="1.6"/><path d="M12 7.4V15.6M8.4 11.5H15.6" stroke="#fff8dc" stroke-width="2.1" stroke-linecap="round"/>`;
  } else if (id.includes('ghost') || id.includes('soul') || id.includes('bob') || id.includes('skull') || id.includes('mask')) {
    body = `<path d="M12 3.2C7.6 3.2 4.8 6.6 4.8 11V19.8L8.4 17.4L12 19.8L15.6 17.4L19.2 19.8V11C19.2 6.6 16.4 3.2 12 3.2Z" fill="${col}" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9.4" cy="11" r="1.5" fill="#06040a"/><circle cx="14.6" cy="11" r="1.5" fill="#06040a"/>`;
  } else if (id.includes('card')) {
    body = `<rect x="3.2" y="5.8" width="17.6" height="12.4" rx="2" fill="${id.includes('green') ? '#22c55e' : '#dc2626'}" stroke="#06040a" stroke-width="1.6"/><rect x="3.2" y="9" width="17.6" height="2.8" fill="#06040a"/><rect x="6" y="13.5" width="4.8" height="2.2" fill="#fde047"/>`;
  } else if (id.includes('juice') || id.includes('tonic') || id.includes('beer') || id.includes('medkit') || id.includes('sauce') || id.includes('blood')) {
    body = `<rect x="6.8" y="6.8" width="10.4" height="13.4" rx="2" fill="${col}" fill-opacity="0.38" stroke="${col}" stroke-width="1.9"/><path d="M9.4 3.8H14.6V6.8H9.4V3.8Z" fill="${col}" stroke="#06040a" stroke-width="1.2"/><path d="M12 10.5V16.6M8.9 13.5H15.1" stroke="#fff8dc" stroke-width="2.1" stroke-linecap="round"/>`;
  } else if (id.includes('hat') || id.includes('crown')) {
    body = `<path d="M3.8 18.8H20.2L17.6 15.5L12 3.6L6.4 15.5L3.8 18.8Z" fill="${col}" stroke="#06040a" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.6 15H17.4" stroke="#fde047" stroke-width="2.1"/>`;
  } else {
    body = `<polygon points="12,2.8 20.2,9.4 17.2,20.2 6.8,20.2 3.8,9.4" fill="${col}" fill-opacity="0.35" stroke="${col}" stroke-width="1.9" stroke-linejoin="round"/><polygon points="12,6.8 16.2,11.5 12,16.2 7.8,11.5" fill="${col}" stroke="#06040a" stroke-width="1.2"/>`;
  }

  return svgWrap(`${aura}${body}`, size);
}

// ============================================================================
// 6. ALL 8 META SHOP UPGRADE ICONS
// ============================================================================

export function getShopIconSvg(upgradeId: ShopUpgradeId, size = 24): string {
  switch (upgradeId) {
    case 'Weapons':
      return getWeaponIconSvg('WeaponSword', '#f0bd4f', size);
    case 'Tomes':
      return getTomeIconSvg('TomeDamage', '#38bdf8', size);
    case 'Refresh':
      return getUiIconSvg('refresh', size);
    case 'Skip':
      return getUiIconSvg('skip', size);
    case 'Banish':
      return getUiIconSvg('banish', size);
    case 'SilverMultiplier':
      return getUiIconSvg('silver', size);
    case 'Boombox':
      return getUiIconSvg('music', size);
    case 'Toggler':
      return getUiIconSvg('settings', size);
    default:
      return getUiIconSvg('star', size);
  }
}

// ============================================================================
// 7. ALL 21 PLAYABLE CHARACTER PORTRAITS (64x64 CHIAROSCURO GRAPHIC NOVEL)
// ============================================================================

export function getCharacterAvatarSvg(charDef: CharacterDef, size = 44): string {
  const p = charDef.primaryColorHex;
  const a = charDef.accentColorHex;
  const uid = `kbAv_${charDef.id}`;
  let art = '';

  switch (charDef.id) {
    case 'Fox':
      // Hooded Ranger Pyromancer Fox — dramatic chiaroscuro, notched ears, blazing golden eyes, ranger hood
      art = `
        <!-- Emerald ranger mantle & hood silhouette -->
        <path d="M4 60L12 36L20 26H44L52 36L60 60H4Z" fill="#1c5c3c" stroke="#06040a" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M32 44L52 36L60 60H32V44Z" fill="#06040a" fill-opacity="0.55"/>
        <!-- Gilded bronze cloak clasp -->
        <polygon points="32,45 38,51 32,57 26,51" fill="#f0bd4f" stroke="#06040a" stroke-width="1.8"/>
        <circle cx="32" cy="51" r="2.2" fill="#e11d38"/>
        <!-- Sweeping tall fox ears with black tips & inner cream -->
        <polygon points="12,30 15,7 26,20" fill="${p}" stroke="#06040a" stroke-width="2.4" stroke-linejoin="round"/>
        <polygon points="15,7 20,14 14,17" fill="#06040a"/>
        <polygon points="16.5,24 17.5,15 22.5,21" fill="${a}"/>
        <polygon points="52,30 49,7 38,20" fill="${p}" stroke="#06040a" stroke-width="2.4" stroke-linejoin="round"/>
        <polygon points="49,7 44,14 50,17" fill="#06040a"/>
        <polygon points="47.5,24 46.5,15 41.5,21" fill="#c98e54"/>
        <!-- Sculpted angular vulpine head & cheek ruffs -->
        <path d="M13 30L18 19H46L51 30L55 37L43 43L32 48L21 43L9 37L13 30Z" fill="${p}" stroke="#06040a" stroke-width="2.5" stroke-linejoin="round"/>
        <!-- Mignola right-side ink chiaroscuro shadow across face -->
        <path d="M32 19H46L51 30L55 37L43 43L32 48V19Z" fill="#06040a" fill-opacity="0.46"/>
        <!-- Cream lower cheeks & tapered snout bridge -->
        <path d="M11 37L24 35L32 46L40 35L53 37L43 43L32 48L21 43L11 37Z" fill="${a}" stroke="#06040a" stroke-width="1.5"/>
        <path d="M32 36L40 35L53 37L43 43L32 48V36Z" fill="#06040a" fill-opacity="0.28"/>
        <!-- Fierce angled eyebrows & glowing ember-gold eyes -->
        <path d="M17 27L28 31M47 27L36 31" stroke="#06040a" stroke-width="3" stroke-linecap="round"/>
        <polygon points="19,30 27,32 24,35 19,33.5" fill="#fde047" stroke="#06040a" stroke-width="1.4"/>
        <polygon points="45,30 37,32 40,35 45,33.5" fill="#fde047" stroke="#06040a" stroke-width="1.4"/>
        <circle cx="23.2" cy="32.2" r="1.1" fill="#06040a"/>
        <circle cx="40.8" cy="32.2" r="1.1" fill="#06040a"/>
        <!-- Sharp black vulpine nose -->
        <polygon points="28.5,39.5 35.5,39.5 32,43.8" fill="#06040a"/>
        <!-- Rim highlight slash on left ear/cheek -->
        <path d="M15 9L13.2 28M11 36L19 41.5" stroke="#fff4c4" stroke-width="1.4" stroke-linecap="round"/>
      `;
      break;

    case 'Calcium':
      // Undead Skater Skeleton — crimson windswept scarf, sharp skull chiaroscuro, glowing rose eyes
      art = `
        <!-- Crimson flying skater scarf -->
        <path d="M5 59L14 42H50L59 59H5Z" fill="#b91c2e" stroke="#06040a" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M35 42H50L59 59H38L35 42Z" fill="#06040a" fill-opacity="0.48"/>
        <path d="M46 44L61 36L58 47L48 51Z" fill="${a}" stroke="#06040a" stroke-width="2"/>
        <!-- Sculpted angular cranium & jaw -->
        <path d="M15 26C15 13 22 8 32 8C42 8 49 13 49 26C49 33 45 37 42 39V47H22V39C19 37 15 33 15 26Z" fill="${p}" stroke="#06040a" stroke-width="2.5" stroke-linejoin="round"/>
        <!-- Heavy right-side Mignola skull ink shadow -->
        <path d="M33 8C42.5 8.5 49 13.5 49 26C49 33 45 37 42 39V47H33V8Z" fill="#06040a" fill-opacity="0.34"/>
        <!-- Dark aviator brow visor / shades with crimson flash -->
        <polygon points="17,22 30.5,24 29,33 18.5,31.5" fill="#06040a" stroke="${a}" stroke-width="1.5"/>
        <polygon points="47,22 33.5,24 35,33 45.5,31.5" fill="#06040a" stroke="${a}" stroke-width="1.5"/>
        <path d="M19.5 25.5L28 26.8M36 26.8L44.5 25.5" stroke="${a}" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="24" cy="28.5" r="1.6" fill="#ff758f"/>
        <circle cx="40" cy="28.5" r="1.6" fill="#ff758f"/>
        <!-- Sharp nasal cavity & grinning teeth -->
        <polygon points="32,33 35,38 29,38" fill="#06040a"/>
        <path d="M24 42H40M27 40V47M32 40V47M37 40V47" stroke="#06040a" stroke-width="2"/>
        <!-- Left bone rim glint -->
        <path d="M17.5 22C18.5 14 23 10.5 30 10.2" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
      `;
      break;

    case 'SirOofie':
      // Ironclad Knight — sweeping crimson plume, chiseled steel greathelm, glowing icy-cyan visor eyes
      art = `
        <!-- Massive pauldrons & crimson cape -->
        <path d="M4 60L12 43H52L60 60H4Z" fill="#525f75" stroke="#06040a" stroke-width="2.4"/>
        <path d="M32 43H52L60 60H32V43Z" fill="#06040a" fill-opacity="0.45"/>
        <path d="M12 44L22 54L32 47L42 54L52 44" stroke="#f0bd4f" stroke-width="2.2" fill="none"/>
        <!-- Sweeping crimson horsehair plume -->
        <path d="M26 15C28 5 42 4 53 12C45 14 42 18 40 22H26V15Z" fill="${a}" stroke="#06040a" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M31 11C38 8 44 9 49 12" stroke="#ff7a8a" stroke-width="1.5" stroke-linecap="round"/>
        <!-- Angular beveled Greathelm -->
        <path d="M16 20L32 13L48 20V44L32 51L16 44V20Z" fill="${p}" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M32 13L48 20V44L32 51V13Z" fill="#06040a" fill-opacity="0.44"/>
        <!-- Gold center ridge & brow crown -->
        <path d="M32 14V50M16 24L32 20L48 24" stroke="#f0bd4f" stroke-width="2.4"/>
        <!-- Pitch-black T-visor slit + blazing cyan eyes -->
        <path d="M19 28H45V34H34.5V44H29.5V34H19V28Z" fill="#06040a"/>
        <polygon points="22,30 28.5,31 27,33 22,32.5" fill="#67e8f9"/>
        <polygon points="42,30 35.5,31 37,33 42,32.5" fill="#67e8f9"/>
        <!-- Left metallic steel highlight -->
        <path d="M19 22V41" stroke="#e2e8f0" stroke-width="1.6" stroke-linecap="round"/>
      `;
      break;

    case 'Cl4nk':
      // Precision Automaton — angular steel head, glowing golden targeting optics, brass antenna
      art = `
        <!-- Armored robotic collar -->
        <path d="M7 60L15 44H49L57 60H7Z" fill="#2c3e58" stroke="#06040a" stroke-width="2.4"/>
        <path d="M22 46H42V55H22Z" fill="#06040a" stroke="${a}" stroke-width="1.5"/>
        <path d="M25 50.5H39" stroke="${a}" stroke-width="2"/>
        <!-- Brass precision antenna -->
        <path d="M32 6V16" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>
        <circle cx="32" cy="6.5" r="3.4" fill="${a}" stroke="#06040a" stroke-width="1.8"/>
        <!-- Angular robot chassis head -->
        <polygon points="15,17 49,17 52,25 48,44 16,44 12,25" fill="${p}" stroke="#06040a" stroke-width="2.5" stroke-linejoin="round"/>
        <polygon points="32,17 49,17 52,25 48,44 32,44" fill="#06040a" fill-opacity="0.42"/>
        <!-- Deep obsidian visor plate -->
        <rect x="17" y="23" width="30" height="12" rx="2" fill="#06040a" stroke="#f0bd4f" stroke-width="1.4"/>
        <!-- Twin precision crosshair optics -->
        <circle cx="24.5" cy="29" r="3.6" fill="${a}"/>
        <circle cx="24.5" cy="29" r="1.4" fill="#06040a"/>
        <circle cx="39.5" cy="29" r="3.6" fill="${a}"/>
        <circle cx="39.5" cy="29" r="1.4" fill="#06040a"/>
        <!-- Vented steel jaw grille -->
        <path d="M22 39H42M26 37V41M32 37V41M38 37V41" stroke="#06040a" stroke-width="1.8"/>
        <path d="M16 19.5H29" stroke="#dbeafe" stroke-width="1.6" stroke-linecap="round"/>
      `;
      break;

    case 'Megachad':
      // Absolute Unit — chiseled angular jawline, pompadour hair, gold-rimmed shades, solar rim
      art = `
        <!-- Colossal trapezius & golden aura collar -->
        <path d="M3 60L12 43H52L61 60H3Z" fill="#d97706" stroke="#06040a" stroke-width="2.5"/>
        <path d="M32 43H52L61 60H32V43Z" fill="#06040a" fill-opacity="0.45"/>
        <!-- Hyper-chiseled hexagonal gigachad face -->
        <polygon points="16,17 48,17 47,39 39,49 25,49 17,39" fill="${p}" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/>
        <!-- Iconic right-half heavy comic ink shadow -->
        <polygon points="32,17 48,17 47,39 39,49 32,49" fill="#06040a" fill-opacity="0.42"/>
        <!-- Sweeping ink-black pompadour hair -->
        <path d="M14 21C13 10 24 6 38 7C47 8 52 13 50 22L44 17H20L14 21Z" fill="#0f0b18" stroke="#06040a" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M21 11C28 9 36 9 43 11.5" stroke="#fde047" stroke-width="1.4" stroke-linecap="round"/>
        <!-- Angular dark shades with golden bridge -->
        <polygon points="16,23 30.5,24 29,31.5 17.5,31" fill="#06040a" stroke="#fef08a" stroke-width="1.6"/>
        <polygon points="48,23 33.5,24 35,31.5 46.5,31" fill="#06040a" stroke="#fef08a" stroke-width="1.6"/>
        <path d="M30.5 25.5H33.5" stroke="#fef08a" stroke-width="2"/>
        <path d="M19 25.5L25 29.5M37 25.5L43 29.5" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.5"/>
        <!-- Confident sculpted chin cleft & smirk -->
        <path d="M25 39C29 41.5 35 41.5 39 38.5" stroke="#06040a" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M32 45V48.5" stroke="#06040a" stroke-width="2"/>
      `;
      break;

    case 'Ogre':
      // Swamp Bruiser — heavy beetling brow, ivory upturned tusks, iron studded leather
      art = `
        <!-- Massive hunched shoulders & studded strap -->
        <path d="M2 60L10 40H54L62 60H2Z" fill="#5b3a1a" stroke="#06040a" stroke-width="2.5"/>
        <path d="M12 42L26 60M52 42L38 60" stroke="#06040a" stroke-width="3"/>
        <circle cx="17" cy="49" r="2.2" fill="#cbd5e1" stroke="#06040a" stroke-width="1.2"/>
        <circle cx="47" cy="49" r="2.2" fill="#cbd5e1" stroke="#06040a" stroke-width="1.2"/>
        <!-- Broad blunt ogre cranium & ears -->
        <polygon points="9,26 15,23 15,33" fill="${p}" stroke="#06040a" stroke-width="2.2"/>
        <polygon points="55,26 49,23 49,33" fill="${p}" stroke="#06040a" stroke-width="2.2"/>
        <path d="M14 21C14 12 21 9 32 9C43 9 50 12 50 21L52 38L43 49H21L12 38L14 21Z" fill="${p}" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M32 9C43 9 50 12 50 21L52 38L43 49H32V9Z" fill="#06040a" fill-opacity="0.42"/>
        <!-- Heavy overhanging Mignola brow shadow -->
        <path d="M14 22L32 26L50 22V29L32 32L14 29V22Z" fill="#06040a"/>
        <!-- Fierce amber eyes beneath dark brow -->
        <polygon points="18,26.5 27,28.5 25,31 19,30" fill="#fde047"/>
        <polygon points="46,26.5 37,28.5 39,31 45,30" fill="#fde047"/>
        <!-- Snarling jaw & massive ivory tusks -->
        <path d="M19 41H45" stroke="#06040a" stroke-width="3.2" stroke-linecap="round"/>
        <polygon points="21,42 24,33 27.5,42" fill="#fffbeb" stroke="#06040a" stroke-width="1.8" stroke-linejoin="round"/>
        <polygon points="43,42 40,33 36.5,42" fill="#fffbeb" stroke="#06040a" stroke-width="1.8" stroke-linejoin="round"/>
      `;
      break;

    case 'Robinette':
      // Gilded Archer — sweeping emerald hood, golden plume feather, sly glowing eyes, arrow quiver
      art = `
        <!-- Quiver & gold-fletched arrows behind shoulder -->
        <path d="M46 16L54 8M49 20L58 13" stroke="#f0bd4f" stroke-width="2.6" stroke-linecap="round"/>
        <!-- Emerald archer cloak -->
        <path d="M6 60L15 41H49L58 60H6Z" fill="#14532d" stroke="#06040a" stroke-width="2.4"/>
        <!-- Golden feather sweeping from hood -->
        <path d="M22 14C15 7 9 9 7 16C13 15 17 17 20 20Z" fill="${a}" stroke="#06040a" stroke-width="2" stroke-linejoin="round"/>
        <!-- Pointed ranger hood -->
        <path d="M12 43L17 17L32 7L47 17L52 43L32 49L12 43Z" fill="${p}" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M32 7L47 17L52 43L32 49V7Z" fill="#06040a" fill-opacity="0.38"/>
        <!-- Deep obsidian hood interior & face -->
        <path d="M20 23L32 16L44 23L42 42L32 46L22 42L20 23Z" fill="#0c0814" stroke="#f0bd4f" stroke-width="1.5"/>
        <path d="M22 30H42L40 42L32 46L24 42L22 30Z" fill="#e7c29f"/>
        <path d="M32 30H42L40 42L32 46V30Z" fill="#06040a" fill-opacity="0.35"/>
        <!-- Keen golden archer eyes & smirk -->
        <polygon points="23,28 29.5,29.5 28,32 23.5,31" fill="${a}"/>
        <polygon points="41,28 34.5,29.5 36,32 40.5,31" fill="${a}"/>
        <path d="M28 39C31 41 34.5 40.5 37 38.5" stroke="#06040a" stroke-width="1.9" stroke-linecap="round"/>
      `;
      break;

    case 'Athena':
      // Olympian Aegis Vanguard — classical Corinthian bronze-and-gold crested helm, crimson horsehair, glowing ivory eyes
      art = `
        <!-- Classical shoulder mantle & Aegis brooch -->
        <path d="M5 60L14 44H50L59 60H5Z" fill="#92400e" stroke="#06040a" stroke-width="2.4"/>
        <circle cx="32" cy="52" r="5" fill="#f0bd4f" stroke="#06040a" stroke-width="1.8"/>
        <!-- Towering classical Corinthian crest -->
        <path d="M22 14C24 4 40 4 42 14L38 19H26L22 14Z" fill="#dc2626" stroke="#06040a" stroke-width="2.4"/>
        <path d="M26 9C30 7 34 7 38 9" stroke="#fca5a5" stroke-width="1.5" stroke-linecap="round"/>
        <!-- Sculpted gilded Corinthian helm -->
        <path d="M16 24C16 14 23 11 32 11C41 11 48 14 48 24V46L39 49L35 38H29L25 49L16 46V24Z" fill="${p}" stroke="#06040a" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M32 11C41 11 48 14 48 24V46L39 49L35 38H32V11Z" fill="#06040a" fill-opacity="0.38"/>
        <!-- Cheek guards & dark shadow interior -->
        <path d="M20 26H44V35L35 38L32 47L29 38L20 35V26Z" fill="#06040a"/>
        <!-- Nasal bar -->
        <rect x="30.2" y="23" width="3.6" height="16" fill="#fef08a" stroke="#06040a" stroke-width="1.2"/>
        <!-- Blazing Olympian ivory-gold eyes -->
        <polygon points="21.5,29 28.5,30 27.5,33 22,32.5" fill="#fffbeb"/>
        <polygon points="42.5,29 35.5,30 36.5,33 42,32.5" fill="#fffbeb"/>
        <!-- Laurel highlight -->
        <path d="M19 20C22 15 27 13.5 31 13.5" stroke="#fffbeb" stroke-width="1.6" stroke-linecap="round"/>
      `;
      break;

    case 'Birdo':
      // Sky Glider — cobalt feathered raptor crest, tinted amber shades, sharp hooked golden beak
      art = `
        <!-- Winged sky cloak -->
        <path d="M5 60L14 43H50L59 60H5Z" fill="#0369a1" stroke="#06040a" stroke-width="2.4"/>
        <!-- Swept feathered crest -->
        <path d="M20 17L24 5L31 13L37 6L41 16L48 11L46 22Z" fill="${p}" stroke="#06040a" stroke-width="2.2" stroke-linejoin="round"/>
        <!-- Sleek avian head -->
        <ellipse cx="32" cy="31" rx="16.5" ry="15.5" fill="${p}" stroke="#06040a" stroke-width="2.5"/>
        <path d="M32 15.5A16.5 15.5 0 0 1 32 46.5Z" fill="#06040a" fill-opacity="0.32"/>
        <!-- Sleek dark-tinted aviator shades -->
        <path d="M14 25H50L47 33.5H35L32 29.5L29 33.5H17L14 25Z" fill="#0c0814" stroke="#fb923c" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M18 27.5L26 31.5M38 27.5L45 31.5" stroke="#7dd3fc" stroke-width="1.6" stroke-linecap="round"/>
        <!-- Sharp hooked amber raptor beak -->
        <polygon points="24,35 40,35 32,48" fill="${a}" stroke="#06040a" stroke-width="2.2" stroke-linejoin="round"/>
        <polygon points="32,35 40,35 32,48" fill="#06040a" fill-opacity="0.32"/>
        <path d="M26 37.5H38" stroke="#fef08a" stroke-width="1.3"/>
      `;
      break;

    case 'Bush':
      // Tactical Foliage — multi-layered inked leaf crown, dark shadow ambush slit, golden sniper eyes & scope
      art = `
        <!-- Sniper rifle barrel & glint peeking right -->
        <path d="M44 46L61 28" stroke="#06040a" stroke-width="5" stroke-linecap="round"/>
        <path d="M44 46L61 28" stroke="#94a3b8" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="55" cy="34" r="3" fill="#38bdf8" stroke="#06040a" stroke-width="1.4"/>
        <!-- Lush multi-lobed bush foliage crown -->
        <circle cx="20" cy="24" r="12" fill="${p}" stroke="#06040a" stroke-width="2.4"/>
        <circle cx="44" cy="24" r="12" fill="#15803d" stroke="#06040a" stroke-width="2.4"/>
        <circle cx="32" cy="18" r="12.5" fill="#4ade80" stroke="#06040a" stroke-width="2.4"/>
        <path d="M10 38C10 26 19 20 32 20C45 20 54 26 54 38C54 49 45 55 32 55C19 55 10 49 10 38Z" fill="${p}" stroke="#06040a" stroke-width="2.6"/>
        <path d="M32 20C45 20 54 26 54 38C54 49 45 55 32 55V20Z" fill="#06040a" fill-opacity="0.4"/>
        <!-- Pitch-black ambush void inside foliage -->
        <rect x="17" y="31" width="30" height="11" rx="5" fill="#06040a" stroke="#14532d" stroke-width="1.6"/>
        <!-- Piercing golden marksman eyes -->
        <polygon points="21,34.5 28.5,36 26.5,39 21.5,38" fill="#fde047"/>
        <polygon points="43,34.5 35.5,36 37.5,39 42.5,38" fill="#fde047"/>
        <path d="M22 14C25 11 29 10 34 10.5" stroke="#bbf7d0" stroke-width="1.8" stroke-linecap="round"/>
      `;
      break;

    case 'Bandit':
      // Blade Hustler — tattered crimson face scarf, swept slate hood, razor gleam
      art = `
        <!-- Steel execution blade behind shoulder -->
        <polygon points="48,12 58,8 52,44 45,42" fill="#cbd5e1" stroke="#06040a" stroke-width="2"/>
        <!-- Dark rogue coat -->
        <path d="M6 60L15 42H49L58 60H6Z" fill="#1e293b" stroke="#06040a" stroke-width="2.4"/>
        <!-- Swept slate assassin hood -->
        <path d="M13 38L17 15L32 8L47 15L51 38L32 48L13 38Z" fill="${p}" stroke="#06040a" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M32 8L47 15L51 38L32 48V8Z" fill="#06040a" fill-opacity="0.45"/>
        <!-- Face opening & crimson cutthroat bandanna -->
        <path d="M19 23H45V35L32 45L19 35V23Z" fill="#06040a"/>
        <path d="M17 33L32 30L47 33L45 45L32 50L19 45L17 33Z" fill="${a}" stroke="#06040a" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M32 30L47 33L45 45L32 50V30Z" fill="#06040a" fill-opacity="0.4"/>
        <!-- Narrowed glowing white-gold eyes -->
        <polygon points="21,26 29.5,28 27.5,30 21.5,29" fill="#fef08a"/>
        <polygon points="43,26 34.5,28 36.5,30 42.5,29" fill="#fef08a"/>
      `;
      break;

    case 'Monke':
      // Canopy Climber — bold primate brow, golden shades, banana collar accent
      art = `
        <!-- Jungle adventurer collar -->
        <path d="M6 60L15 44H49L58 60H6Z" fill="#713f12" stroke="#06040a" stroke-width="2.4"/>
        <!-- Rounded primate ears -->
        <circle cx="12" cy="30" r="6" fill="${p}" stroke="#06040a" stroke-width="2.4"/>
        <circle cx="12" cy="30" r="2.8" fill="#d6a26e"/>
        <circle cx="52" cy="30" r="6" fill="${p}" stroke="#06040a" stroke-width="2.4"/>
        <circle cx="52" cy="30" r="2.8" fill="#8f643c"/>
        <!-- Furred cranium & tan muzzle -->
        <ellipse cx="32" cy="29" rx="16.5" ry="17" fill="${p}" stroke="#06040a" stroke-width="2.6"/>
        <path d="M32 12A16.5 17 0 0 1 32 46Z" fill="#06040a" fill-opacity="0.36"/>
        <ellipse cx="32" cy="38" rx="13" ry="9.5" fill="#e2b483" stroke="#06040a" stroke-width="2"/>
        <path d="M32 28.5A13 9.5 0 0 1 32 47.5Z" fill="#06040a" fill-opacity="0.26"/>
        <!-- Iconic gold-rimmed cool shades -->
        <rect x="16" y="21.5" width="14" height="9" rx="2.2" fill="#06040a" stroke="${a}" stroke-width="2"/>
        <rect x="34" y="21.5" width="14" height="9" rx="2.2" fill="#06040a" stroke="${a}" stroke-width="2"/>
        <path d="M30 25H34" stroke="${a}" stroke-width="2.2"/>
        <path d="M18.5 24L24.5 28.5M36.5 24L42.5 28.5" stroke="#fffbeb" stroke-opacity="0.55" stroke-width="1.6"/>
        <!-- Cocky grin -->
        <path d="M24 39.5C28 43 36 43 40 39" stroke="#06040a" stroke-width="2.4" stroke-linecap="round"/>
      `;
      break;

    case 'Noelle':
      // Frost Weaver — crystalline ice crown, sweeping silver-blue hair, glowing glacial eyes, fur mantle
      art = `
        <!-- Frost fur mantle -->
        <path d="M4 60L12 43C18 40 46 40 52 43L60 60H4Z" fill="#e0f2fe" stroke="#06040a" stroke-width="2.4"/>
        <path d="M32 41C41 41 48 42 52 43L60 60H32V41Z" fill="#0284c7" fill-opacity="0.35"/>
        <!-- Flowing glacial hair backdrop -->
        <path d="M11 46L14 19C16 10 48 10 50 19L53 46H11Z" fill="${p}" stroke="#06040a" stroke-width="2.4"/>
        <!-- Crystalline ice tiara -->
        <polygon points="21,17 25,8 30,15 32,5 34,15 39,8 43,17" fill="#e0f2fe" stroke="#06040a" stroke-width="1.8" stroke-linejoin="round"/>
        <!-- Sculpted pale face -->
        <path d="M20 22H44L42 39L32 46L22 39L20 22Z" fill="#f1f5f9" stroke="#06040a" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M32 22H44L42 39L32 46V22Z" fill="#0c4a6e" fill-opacity="0.28"/>
        <!-- Swept bangs -->
        <path d="M18 22L28 17L32 25L38 17L46 23L44 15H20L18 22Z" fill="${p}" stroke="#06040a" stroke-width="1.8"/>
        <!-- Piercing glacial cyan eyes -->
        <polygon points="22.5,29.5 29,30.5 27.5,33.5 23,32.5" fill="#06040a"/>
        <circle cx="26" cy="31.5" r="1.5" fill="#38bdf8"/>
        <polygon points="41.5,29.5 35,30.5 36.5,33.5 41,32.5" fill="#06040a"/>
        <circle cx="38" cy="31.5" r="1.5" fill="#38bdf8"/>
        <path d="M29 39.5H35" stroke="#06040a" stroke-width="1.7" stroke-linecap="round"/>
      `;
      break;

    case 'TonyMcZoom':
      // Hoverboard Ace — wild electric hair, neon magenta-cyan cyber visor, high tech collar
      art = `
        <!-- High neon collar -->
        <path d="M6 60L12 39L24 46H40L52 39L58 60H6Z" fill="#0f172a" stroke="${a}" stroke-width="2.2" stroke-linejoin="round"/>
        <!-- Wild windswept spiky hair -->
        <path d="M13 26L9 14L20 17L24 6L33 14L42 5L45 16L56 12L50 26Z" fill="#0f172a" stroke="#06040a" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M24 9L31 15M42 8L44 16" stroke="${p}" stroke-width="1.6" stroke-linecap="round"/>
        <!-- Angular runner face -->
        <polygon points="18,22 46,22 44,40 32,47 20,40" fill="#f3cfa8" stroke="#06040a" stroke-width="2.3" stroke-linejoin="round"/>
        <polygon points="32,22 46,22 44,40 32,47" fill="#06040a" fill-opacity="0.32"/>
        <!-- Full wraparound neon cyan cyber visor -->
        <polygon points="14,25 50,25 47,34 32,32 17,34" fill="${p}" stroke="#06040a" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M18 28.5H31L36 30.5H45" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
        <!-- Grin & electric spark -->
        <path d="M26 39C30 42 35 41.5 39 38.5" stroke="#06040a" stroke-width="2.2" stroke-linecap="round"/>
      `;
      break;

    case 'Amog':
      // Spore Alchemist — glowing spotted mushroom cap hood, toxic emerald eyes in shadow
      art = `
        <!-- Alchemist robe -->
        <path d="M7 60L16 42H48L57 60H7Z" fill="#3b0764" stroke="#06040a" stroke-width="2.4"/>
        <path d="M24 44L32 54L40 44" stroke="${p}" stroke-width="2.4" fill="none"/>
        <!-- Deep dark spore-hood shadow face -->
        <ellipse cx="32" cy="36" rx="14" ry="12" fill="#090412" stroke="#06040a" stroke-width="2.4"/>
        <!-- Wide bioluminescent mushroom cap -->
        <path d="M6 31C6 14 18 7 32 7C46 7 58 14 58 31C48 27 16 27 6 31Z" fill="${a}" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M32 7C46 7 58 14 58 31C49 28 40 27.5 32 27.5V7Z" fill="#06040a" fill-opacity="0.4"/>
        <!-- Glowing toxic-lime mushroom spots -->
        <circle cx="19" cy="19" r="4" fill="${p}" stroke="#06040a" stroke-width="1.4"/>
        <circle cx="33" cy="13.5" r="3.4" fill="${p}" stroke="#06040a" stroke-width="1.4"/>
        <circle cx="45" cy="20" r="3.8" fill="${p}" stroke="#06040a" stroke-width="1.4"/>
        <!-- Luminous toxic eyes peering from beneath gills -->
        <polygon points="21,34 29,35.5 27,39 22,38" fill="${p}"/>
        <polygon points="43,34 35,35.5 37,39 42,38" fill="${p}"/>
      `;
      break;

    case 'Spaceman':
      // Void Cosmonaut — glossy obsidian-violet dome visor, gold collar ring, starlight reflection
      art = `
        <!-- Spacesuit torso & gold collar ring -->
        <path d="M5 60L14 44H50L59 60H5Z" fill="#e2e8f0" stroke="#06040a" stroke-width="2.4"/>
        <path d="M32 44H50L59 60H32V44Z" fill="#06040a" fill-opacity="0.32"/>
        <rect x="17" y="42" width="30" height="6" rx="2.5" fill="#f0bd4f" stroke="#06040a" stroke-width="2"/>
        <!-- Comms antenna -->
        <path d="M47 16L51 6" stroke="#94a3b8" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="51.5" cy="5.5" r="2.6" fill="#38bdf8" stroke="#06040a" stroke-width="1.4"/>
        <!-- Outer pressurized helmet shell -->
        <circle cx="32" cy="28" r="18" fill="${p}" stroke="#06040a" stroke-width="2.6"/>
        <path d="M32 10A18 18 0 0 1 32 46Z" fill="#06040a" fill-opacity="0.28"/>
        <!-- Deep cosmic obsidian-indigo visor -->
        <rect x="18" y="18" width="28" height="20" rx="9" fill="#0e0924" stroke="${a}" stroke-width="2.2"/>
        <!-- Nebula glint & starlight specular slash -->
        <path d="M22 23C25 20.5 30 20.5 34 22" stroke="#67e8f9" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="38" cy="24" r="1.4" fill="#ffffff"/>
        <circle cx="35" cy="31" r="1.1" fill="#c084fc"/>
      `;
      break;

    case 'Ninja':
      // Phantom Blade — indigo shinobi cowl, crimson headband with trailing sash, intense eyes
      art = `
        <!-- Trailing crimson headband tails -->
        <path d="M46 21L60 15L57 24L47 26Z" fill="${a}" stroke="#06040a" stroke-width="1.8"/>
        <!-- Shinobi scarf & vest -->
        <path d="M6 60L14 43H50L58 60H6Z" fill="#0f172a" stroke="#06040a" stroke-width="2.4"/>
        <path d="M18 44L32 54L46 44" stroke="${a}" stroke-width="2.6" fill="none"/>
        <!-- Sleek cowl head -->
        <ellipse cx="32" cy="29" rx="16.5" ry="17.5" fill="${p}" stroke="#06040a" stroke-width="2.6"/>
        <path d="M32 11.5A16.5 17.5 0 0 1 32 46.5Z" fill="#06040a" fill-opacity="0.45"/>
        <!-- Crimson forehead tie & steel forehead plate -->
        <rect x="15.5" y="18.5" width="33" height="5.5" fill="${a}" stroke="#06040a" stroke-width="1.8"/>
        <rect x="24" y="18" width="16" height="6.5" rx="1" fill="#94a3b8" stroke="#06040a" stroke-width="1.6"/>
        <!-- Narrow eye opening with fierce brows -->
        <path d="M18 26.5H46L44 34.5H20L18 26.5Z" fill="#efc39b" stroke="#06040a" stroke-width="2"/>
        <path d="M21 28.5L29 31M43 28.5L35 31" stroke="#06040a" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="25.5" cy="31.5" r="1.5" fill="#06040a"/>
        <circle cx="38.5" cy="31.5" r="1.5" fill="#06040a"/>
      `;
      break;

    case 'Vlad':
      // Crimson Lord — towering Dracula bat-wing high collar, widow's peak hair, pale cheekbones, ruby eyes, fangs
      art = `
        <!-- Towering baroque crimson-and-black Dracula collar -->
        <polygon points="4,58 10,20 25,36 39,36 54,20 60,58" fill="#0b0612" stroke="#06040a" stroke-width="2.5" stroke-linejoin="round"/>
        <polygon points="8,54 13,26 26,39 38,39 51,26 56,54" fill="${p}" stroke="#f0bd4f" stroke-width="1.3" stroke-linejoin="round"/>
        <!-- Aristocratic pale gaunt face -->
        <path d="M19 20C19 12 24.5 9 32 9C39.5 9 45 12 45 20L43 38L32 47L21 38L19 20Z" fill="#ebe3f2" stroke="#06040a" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M32 9C39.5 9 45 12 45 20L43 38L32 47V9Z" fill="#1e1030" fill-opacity="0.34"/>
        <!-- Sharp ink-black widow's peak hair -->
        <path d="M18 22C17 11 24 7 32 7C40 7 47 11 46 22L39 17L32 25L25 17L18 22Z" fill="#0d0814" stroke="#06040a" stroke-width="2"/>
        <!-- Burning ruby vampire eyes -->
        <path d="M21 26L29.5 29M43 26L34.5 29" stroke="#06040a" stroke-width="2.4" stroke-linecap="round"/>
        <polygon points="22.5,28.5 29,30 27.5,32.5 23,31.5" fill="#ff2a4b"/>
        <polygon points="41.5,28.5 35,30 36.5,32.5 41,31.5" fill="#ff2a4b"/>
        <!-- Sinister smile & twin white fangs -->
        <path d="M25 38.5H39" stroke="#06040a" stroke-width="2.2" stroke-linecap="round"/>
        <polygon points="27,38.5 29.5,38.5 28.2,43" fill="#ffffff" stroke="#06040a" stroke-width="1"/>
        <polygon points="37,38.5 34.5,38.5 35.8,43" fill="#ffffff" stroke="#06040a" stroke-width="1"/>
        <!-- Ruby cravat jewel -->
        <polygon points="32,48 36,53 32,58 28,53" fill="#ef4444" stroke="#f0bd4f" stroke-width="1.5"/>
      `;
      break;

    case 'Dicehead':
      // High Roller — tilted ivory-gold beveled die head, glowing crimson center pip, crimson tuxedo & gold bow tie
      art = `
        <!-- Velvet crimson high-roller tuxedo -->
        <path d="M6 60L15 44H49L58 60H6Z" fill="#7f1d28" stroke="#06040a" stroke-width="2.4"/>
        <polygon points="24,47 32,51 24,55" fill="#f0bd4f" stroke="#06040a" stroke-width="1.6"/>
        <polygon points="40,47 32,51 40,55" fill="#f0bd4f" stroke="#06040a" stroke-width="1.6"/>
        <circle cx="32" cy="51" r="2.4" fill="#ef4444" stroke="#06040a" stroke-width="1.3"/>
        <!-- 3D beveled die cube head -->
        <polygon points="15,15 45,12 51,18 49,43 19,46 13,40" fill="#f7eed8" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/>
        <!-- Shaded right bevel face of die -->
        <polygon points="45,12 51,18 49,43 43,39" fill="#b8a88a" stroke="#06040a" stroke-width="1.8"/>
        <!-- Crisp die pips (crimson burning center eye pip) -->
        <circle cx="22.5" cy="22" r="2.8" fill="#06040a"/>
        <circle cx="37.5" cy="20.8" r="2.8" fill="#06040a"/>
        <circle cx="30" cy="29.5" r="4" fill="${a}" stroke="#06040a" stroke-width="1.5"/>
        <circle cx="29" cy="28.5" r="1.2" fill="#fff4c4"/>
        <circle cx="23.5" cy="38" r="2.8" fill="#06040a"/>
        <circle cx="38.5" cy="36.8" r="2.8" fill="#06040a"/>
      `;
      break;

    case 'SirChadwell':
      // Cursed Champion — horned obsidian dark-knight helm, cracked violet runes, blazing amethyst eyes
      art = `
        <!-- Jagged spiked gorget -->
        <path d="M4 60L12 41L22 48L32 42L42 48L52 41L60 60H4Z" fill="#1e1b4b" stroke="#06040a" stroke-width="2.5"/>
        <!-- Sweeping curved obsidian bull horns -->
        <path d="M18 22C9 18 7 10 13 5C13 11 16 14 22 16Z" fill="#312e81" stroke="#06040a" stroke-width="2.3" stroke-linejoin="round"/>
        <path d="M46 22C55 18 57 10 51 5C51 11 48 14 42 16Z" fill="#1e1b4b" stroke="#06040a" stroke-width="2.3" stroke-linejoin="round"/>
        <!-- Angular cursed helm -->
        <path d="M16 21L32 13L48 21L46 43L32 50L18 43L16 21Z" fill="${p}" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M32 13L48 21L46 43L32 50V13Z" fill="#06040a" fill-opacity="0.48"/>
        <!-- Glowing violet rune crack -->
        <path d="M32 14V25M28 19L32 23L36 19" stroke="${a}" stroke-width="1.8" stroke-linecap="round"/>
        <!-- Pitch-black visor & blazing amethyst eyes -->
        <polygon points="18,28 32,31 46,28 44,35 32,37 20,35" fill="#06040a"/>
        <polygon points="21,30 29,32 27,34.5 21.5,33" fill="#e879f9"/>
        <polygon points="43,30 35,32 37,34.5 42.5,33" fill="#e879f9"/>
      `;
      break;

    case 'Roberto':
    default:
      // Spectral Scavenger — floating tattered amethyst wraith hood, void face, glowing jade eyes, crescent scythe
      art = `
        <!-- Crescent spectral scythe blade behind -->
        <path d="M48 10C34 4 20 8 11 18C22 14 34 15 44 21L48 10Z" fill="${a}" stroke="#06040a" stroke-width="2" stroke-linejoin="round"/>
        <!-- Floating spectral mantle -->
        <path d="M7 60L14 40H50L57 60L47 55L39 60L32 55L25 60L17 55L7 60Z" fill="#4c1d95" stroke="#06040a" stroke-width="2.4" stroke-linejoin="round"/>
        <!-- Tall pointed wraith cowl -->
        <path d="M12 43L17 17L32 7L47 17L52 43L32 49L12 43Z" fill="${p}" stroke="#06040a" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M32 7L47 17L52 43L32 49V7Z" fill="#06040a" fill-opacity="0.45"/>
        <!-- Pitch-black spectral void inside hood -->
        <path d="M20 23L32 16L44 23L42 42L32 46L22 42L20 23Z" fill="#06040a" stroke="${a}" stroke-opacity="0.6" stroke-width="1.5"/>
        <!-- Glowing ethereal jade wraith eyes -->
        <polygon points="22.5,29 29.5,31 27.5,34.5 23,33" fill="${a}"/>
        <polygon points="41.5,29 34.5,31 36.5,34.5 41,33" fill="${a}"/>
        <circle cx="26.5" cy="31.5" r="1.2" fill="#ecfdf5"/>
        <circle cx="37.5" cy="31.5" r="1.2" fill="#ecfdf5"/>
      `;
      break;
  }

  return `<svg class="kb-svg kb-avatar-svg" viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}_bg" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${p}" stop-opacity="0.44"/>
        <stop offset="48%" stop-color="#140d20" stop-opacity="0.96"/>
        <stop offset="100%" stop-color="#06040a"/>
      </linearGradient>
      <clipPath id="${uid}_clip">
        <polygon points="7,2 57,2 62,7 62,57 57,62 7,62 2,57 2,7"/>
      </clipPath>
    </defs>
    <!-- Chamfered obsidian backdrop with dramatic comic rim-light slash -->
    <g clip-path="url(#${uid}_clip)">
      <rect x="0" y="0" width="64" height="64" fill="url(#${uid}_bg)"/>
      <polygon points="0,0 38,0 14,64 0,64" fill="${a}" fill-opacity="0.14"/>
      <!-- Subtle diagonal comic ink hatching in backdrop shadow -->
      <path d="M40 4L60 24M48 4L60 16M36 8L60 32" stroke="#06040a" stroke-opacity="0.38" stroke-width="1.6"/>
      ${art}
    </g>
    <!-- Ornate chamfered hammered-gold frame & corner rivets -->
    <polygon points="7,2 57,2 62,7 62,57 57,62 7,62 2,57 2,7" stroke="#06040a" stroke-width="3.6" fill="none"/>
    <polygon points="7.5,2.8 56.5,2.8 61.2,7.5 61.2,56.5 56.5,61.2 7.5,61.2 2.8,56.5 2.8,7.5" stroke="#d4a23c" stroke-width="1.7" fill="none"/>
    <polygon points="9,5 55,5 59,9 59,55 55,59 9,59 5,55 5,9" stroke="${a}" stroke-opacity="0.32" stroke-width="0.9" fill="none"/>
  </svg>`;
}
