/**
 * KRUNKEDBONK — Procedural Inline SVG Icon & Character Portrait Library
 *
 * 100% standalone, zero external images, crisp at every desktop/Retina/mobile DPI:
 * - Stylized KRUNKEDBONK crest emblem
 * - Distinct expressive vector portraits for ALL 21 playable characters
 * - Crisp icons for ALL 30 weapons, ALL 26 tomes, ALL 87 items, and ALL 8 meta shop upgrades
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
  Common: '#cbd5e1',
  Rare: '#60a5fa',
  Epic: '#c084fc',
  Legendary: '#fbbf24',
  Quest: '#2dd4bf',
};

// ============================================================================
// 1. BRAND CREST EMBLEM
// ============================================================================

export function getBrandCrestSvg(size = 44): string {
  return `<svg class="kb-svg kb-brand-crest-svg" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M24 3L42 10V23C42 34.2 34.4 41.8 24 45C13.6 41.8 6 34.2 6 23V10L24 3Z" fill="#182034" stroke="#fbbf24" stroke-width="2.5"/>
    <path d="M24 7L38 12.6V23C38 31.8 32 37.8 24 40.6C16 37.8 10 31.8 10 23V12.6L24 7Z" fill="#0d1322" stroke="#f59e0b" stroke-opacity="0.45" stroke-width="1.2"/>
    <path d="M16 14L33 31M32 14L15 31" stroke="#fde047" stroke-width="3.2" stroke-linecap="square"/>
    <path d="M14 29L19 34M29 34L34 29" stroke="#fb923c" stroke-width="3" stroke-linecap="square"/>
    <path d="M24 13L29 21L24 26L19 21L24 13Z" fill="#ff5d6c" stroke="#080a12" stroke-width="1.6"/>
    <circle cx="24" cy="20" r="2" fill="#fff7cc"/>
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
  play: '<path d="M7 4.5L20 12L7 19.5V4.5Z" fill="currentColor" stroke="#080a12" stroke-width="1.4" stroke-linejoin="round"/>',
  fighters:
    '<circle cx="12" cy="7.5" r="3.8" fill="currentColor"/><path d="M5 20C5 15.8 8.1 13 12 13C15.9 13 19 15.8 19 20H5Z" fill="currentColor"/>',
  quests:
    '<path d="M6 3H18V21L12 17.2L6 21V3Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6.5L13.3 9.2L16.2 9.6L14.1 11.6L14.6 14.4L12 13L9.4 14.4L9.9 11.6L7.8 9.6L10.7 9.2L12 6.5Z" fill="currentColor"/>',
  shop:
    '<path d="M4 9H20L18.5 20H5.5L4 9Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 9V7A3.5 3.5 0 0 1 15.5 7V9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="14.5" r="2.2" fill="currentColor"/>',
  settings:
    '<circle cx="12" cy="12" r="3.4" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.5V5.2M12 18.8V21.5M2.5 12H5.2M18.8 12H21.5M5.3 5.3L7.2 7.2M16.8 16.8L18.7 18.7M18.7 5.3L16.8 7.2M7.2 16.8L5.3 18.7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  skull:
    '<path d="M12 3C7.6 3 4.5 6.2 4.5 10.3C4.5 12.8 5.8 14.9 7.6 16.1V19.5H16.4V16.1C18.2 14.9 19.5 12.8 19.5 10.3C19.5 6.2 16.4 3 12 3Z" fill="currentColor"/><circle cx="9.2" cy="10.8" r="1.7" fill="#080a12"/><circle cx="14.8" cy="10.8" r="1.7" fill="#080a12"/><path d="M10.5 17V19.5M13.5 17V19.5" stroke="#080a12" stroke-width="1.5"/>',
  gold:
    '<circle cx="12" cy="12" r="8.5" fill="#fbbf24" stroke="#78350f" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="#fde047" stroke="#b45309" stroke-width="1.2"/><path d="M12 8.2L13.5 12L12 15.8L10.5 12L12 8.2Z" fill="#b45309"/>',
  silver:
    '<polygon points="12,3 20,8 20,16 12,21 4,16 4,8" fill="#cbd5e1" stroke="#334155" stroke-width="1.8"/><polygon points="12,6.5 16.8,9.4 16.8,14.6 12,17.5 7.2,14.6 7.2,9.4" fill="#f8fafc" fill-opacity="0.65"/>',
  heart:
    '<path d="M12 20.5L4.5 13.2C2.3 11 2.4 7.4 4.7 5.4C6.9 3.5 10.1 4 12 6.3C13.9 4 17.1 3.5 19.3 5.4C21.6 7.4 21.7 11 19.5 13.2L12 20.5Z" fill="currentColor"/>',
  shield:
    '<path d="M12 3L20 6.5V12.2C20 16.8 16.6 20.1 12 21.5C7.4 20.1 4 16.8 4 12.2V6.5L12 3Z" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="2"/>',
  speed:
    '<path d="M13.5 2.5L5.5 13H11.5L10.5 21.5L18.5 11H12.5L13.5 2.5Z" fill="currentColor"/>',
  refresh:
    '<path d="M19 8A7.5 7.5 0 1 0 19.4 13.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M19.5 3.5V8.5H14.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  skip:
    '<path d="M5 6L13 12L5 18V6Z" fill="currentColor"/><path d="M13 6L21 12L13 18V6Z" fill="currentColor"/>',
  banish:
    '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2.2"/><path d="M6.2 6.2L17.8 17.8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  lock:
    '<rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10.5V7.5A4 4 0 0 1 16 7.5V10.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="15.2" r="1.4" fill="#080a12"/>',
  crown:
    '<path d="M3 18L5 7L10 11.5L12 5.5L14 11.5L19 7L21 18H3Z" fill="currentColor" stroke="#080a12" stroke-width="1.3" stroke-linejoin="round"/>',
  star:
    '<path d="M12 2.5L14.8 8.4L21.3 9.3L16.6 13.8L17.7 20.3L12 17.2L6.3 20.3L7.4 13.8L2.7 9.3L9.2 8.4L12 2.5Z" fill="currentColor"/>',
  map:
    '<path d="M3 6L9 3.5L15 6L21 3.5V18L15 20.5L9 18L3 20.5V6Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 3.5V18M15 6V20.5" stroke="currentColor" stroke-width="1.6"/>',
  pause:
    '<rect x="6" y="4.5" width="4.5" height="15" rx="1" fill="currentColor"/><rect x="13.5" y="4.5" width="4.5" height="15" rx="1" fill="currentColor"/>',
  camera:
    '<rect x="3" y="7" width="18" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M8 7L9.5 4.5H14.5L16 7" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" fill="currentColor"/>',
  jump:
    '<path d="M12 4L5.5 11.5H10V19.5H14V11.5H18.5L12 4Z" fill="currentColor"/><path d="M6 21.5H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  slide:
    '<path d="M4 17.5L12 9.5L15.5 13L20 8.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20.5H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 8.5H20V14.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  aim:
    '<circle cx="12" cy="12" r="6.5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2.5V6M12 18V21.5M2.5 12H6M18 12H21.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  interact:
    '<path d="M12 3L19.5 9.5L12 21L4.5 9.5L12 3Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="10.5" r="2.2" fill="currentColor"/>',
  trophy:
    '<path d="M7 4H17V9.5C17 12.6 14.8 15 12 15C9.2 15 7 12.6 7 9.5V4Z" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="2"/><path d="M7 6H4V8.5C4 10.2 5.3 11.4 7 11.5M17 6H20V8.5C20 10.2 18.7 11.4 17 11.5" stroke="currentColor" stroke-width="2"/><path d="M12 15V19M8.5 19.5H15.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  check:
    '<path d="M4.5 12.5L9.5 17.5L19.5 6.5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  back:
    '<path d="M14.5 5.5L8 12L14.5 18.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  pack:
    '<path d="M4 7.5L12 3.5L20 7.5V16.5L12 20.5L4 16.5V7.5Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 7.5L12 11.5L20 7.5M12 11.5V20.5" stroke="currentColor" stroke-width="1.8"/>',
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
    '<path d="M12.5 2.5C14.5 6.2 18.5 8.8 18.5 13.5C18.5 17.4 15.6 20.5 12 20.5C8.4 20.5 5.5 17.4 5.5 13.5C5.5 10.4 7.5 8 9 6.5C9.2 8.2 10.2 9.4 11 9.8C10.5 7 11.4 4.3 12.5 2.5Z" fill="currentColor"/>',
  bolt:
    '<path d="M13 2L5 13H11.5L10.5 22L19 11H12.5L13 2Z" fill="currentColor"/>',
};

export function getUiIconSvg(name: UiIconName, size = 18): string {
  return svgWrap(UI_PATHS[name] ?? UI_PATHS.star, size);
}

// ============================================================================
// 3. ALL 30 WEAPON ICONS
// ============================================================================

export function getWeaponIconSvg(weaponId: string, color = '#fbbf24', size = 24): string {
  const id = weaponId.toLowerCase();
  let body = '';

  if (id.includes('firestaff')) {
    body = `<path d="M5 19L15 9" stroke="#c08457" stroke-width="2.6" stroke-linecap="round"/><path d="M16 4C18.2 6.5 19.5 8.4 18.8 10.8C18.2 12.6 16.4 13.5 14.7 13C13 12.4 12.3 10.5 13.2 8.7C14 7.1 15.2 5.7 16 4Z" fill="${color}" stroke="#080a12" stroke-width="1.2"/><circle cx="15.8" cy="10.2" r="1.4" fill="#fff7cc"/>`;
  } else if (id.includes('bone')) {
    body = `<path d="M7.5 6.5A2.2 2.2 0 1 1 5.5 9.8L14.2 18.5A2.2 2.2 0 1 1 17.5 16.5A2.2 2.2 0 1 1 15.5 13.2L6.8 4.5A2.2 2.2 0 1 1 7.5 6.5Z" fill="#f8f5e6" stroke="#080a12" stroke-width="1.4"/>`;
  } else if (id.includes('katana')) {
    body = `<path d="M4.5 19.5L8.2 15.8M9 15L19.5 4.5C18.5 7.5 15.5 11.5 11.2 15.8L9 15Z" fill="#e2e8f0" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.8 14.2L9.8 17.2" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('herosword')) {
    body = `<path d="M12 3L15 8V15H9V8L12 3Z" fill="#fef08a" stroke="#080a12" stroke-width="1.3"/><path d="M6.5 15H17.5" stroke="#38bdf8" stroke-width="2.6" stroke-linecap="round"/><path d="M12 15V21" stroke="#b45309" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="15" r="1.6" fill="#fff"/>`;
  } else if (id.includes('corrupt')) {
    body = `<path d="M12 2.5L15.5 7.5L13.5 10.5L15.5 14H8.5L10.5 10.5L8.5 7.5L12 2.5Z" fill="#c084fc" stroke="#080a12" stroke-width="1.3"/><path d="M6.5 14.5H17.5M12 14.5V21" stroke="#7e22ce" stroke-width="2.6" stroke-linecap="round"/>`;
  } else if (id.includes('sword')) {
    body = `<path d="M18.5 4.5L14 5.5L6.5 13L11 17.5L18.5 10L19.5 5.5L18.5 4.5Z" fill="#e2e8f0" stroke="#080a12" stroke-width="1.3"/><path d="M5 12L12 19M4.5 19.5L8.5 15.5" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`;
  } else if (id.includes('revolver')) {
    body = `<path d="M3.5 9.5H19.5V12.5H13.5L11.5 14.5H8.5L7 19.5H4L5.5 13.5H3.5V9.5Z" fill="#cbd5e1" stroke="#080a12" stroke-width="1.4" stroke-linejoin="round"/><circle cx="10.5" cy="11" r="2" fill="${color}"/>`;
  } else if (id.includes('shotgun')) {
    body = `<path d="M3 13.5L8.5 12L19.5 8.5L20.5 11.2L10.5 14.5L7.5 18.5L4 17.5L6.5 14.5L3 13.5Z" fill="#94a3b8" stroke="#080a12" stroke-width="1.3"/><path d="M11 11.2L16 9.6" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`;
  } else if (id.includes('sniper')) {
    body = `<path d="M2.5 13H21.5M7 13L5.5 17.5H8.5L10.5 13" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.5" y="7.5" width="7" height="3" rx="1" fill="${color}" stroke="#080a12" stroke-width="1.1"/><path d="M12 10.5V13" stroke="#94a3b8" stroke-width="1.8"/>`;
  } else if (id.includes('aura')) {
    body = `<circle cx="12" cy="12" r="8.5" stroke="${color}" stroke-width="2" stroke-dasharray="4 2"/><circle cx="12" cy="12" r="4.8" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="#fff"/>`;
  } else if (id.includes('dexecutioner') || id.includes('axe')) {
    body = `<path d="M6 19L16 9" stroke="#a16207" stroke-width="2.6" stroke-linecap="round"/><path d="M11 6.5C14.5 5 18.5 6.8 19.5 10.5C17 11.8 14.5 12 12.2 10.8L11 6.5Z" fill="${color}" stroke="#080a12" stroke-width="1.3"/>`;
  } else if (id.includes('bow')) {
    body = `<path d="M7.5 4.5C14.5 5.5 18.5 10 19.5 16.5" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/><path d="M7.5 4.5L19.5 16.5" stroke="#e2e8f0" stroke-width="1.2"/><path d="M5 19L17.5 6.5M14 6.5H17.5V10" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (id.includes('aegis')) {
    body = `<path d="M12 3L19.5 6.5V12.5C19.5 16.8 16.2 20 12 21.5C7.8 20 4.5 16.8 4.5 12.5V6.5L12 3Z" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="2"/><path d="M12 7V17M8 11H16" stroke="#fff7cc" stroke-width="2" stroke-linecap="round"/>`;
  } else if (id.includes('lightning')) {
    body = `<path d="M13.5 2.5L5.5 13H11.5L10 21.5L18.5 10.8H12.5L13.5 2.5Z" fill="#fde047" stroke="#080a12" stroke-width="1.3" stroke-linejoin="round"/>`;
  } else if (id.includes('flame') || id.includes('dragon')) {
    body = `<path d="M12.5 3C15.5 6.5 19 9.5 18.5 14C18 17.8 15.2 20.5 12 20.5C8.5 20.5 5.5 17.6 5.5 13.8C5.5 10.6 7.5 8 9.2 6.4C9.5 8.5 10.5 9.8 11.4 10.2C10.9 7.4 11.5 4.8 12.5 3Z" fill="${color}" stroke="#080a12" stroke-width="1.2"/><path d="M12 12.5C13.6 14 14.5 15.5 14 17.2C13.6 18.5 12.8 19 12 19C10.7 19 9.8 17.8 10.1 16.2C10.4 14.8 11.2 13.6 12 12.5Z" fill="#fef08a"/>`;
  } else if (id.includes('rocket')) {
    body = `<path d="M18.5 5.5C14 5.5 10 8 7.5 11.5L12.5 16.5C16 14 18.5 10 18.5 5.5Z" fill="#f87171" stroke="#080a12" stroke-width="1.3"/><circle cx="13.8" cy="10.2" r="1.6" fill="#fef08a"/><path d="M6.5 13.5L4 17.5L8 16.5M10.5 17.5L6.5 20L7.5 16" stroke="#fb923c" stroke-width="2" stroke-linecap="round"/>`;
  } else if (id.includes('banana')) {
    body = `<path d="M17.5 5.5C18.5 11.5 14.5 17.5 7 18.5C5.5 18.7 5 17.2 6.2 16.3C11 13.5 14 9.5 15.5 5.2C15.9 4.2 17.3 4.3 17.5 5.5Z" fill="#fde047" stroke="#080a12" stroke-width="1.4"/>`;
  } else if (id.includes('tornado')) {
    body = `<path d="M4.5 6.5H19.5M6.5 10.5H17.5M8.5 14.5H15.5M10.5 18.5H13.5" stroke="#67e8f9" stroke-width="2.4" stroke-linecap="round"/>`;
  } else if (id.includes('frost')) {
    body = `<path d="M12 3V21M4.2 7.5L19.8 16.5M19.8 7.5L4.2 16.5" stroke="#67e8f9" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.6" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.4"/>`;
  } else if (id.includes('noodle')) {
    body = `<path d="M4 17C7 8 11 19 14 10C16 4 19 9 20 7" stroke="#f472b6" stroke-width="3" stroke-linecap="round"/><path d="M4 17C7 8 11 19 14 10C16 4 19 9 20 7" stroke="#67e8f9" stroke-width="1.2" stroke-linecap="round"/>`;
  } else if (id.includes('chunker')) {
    body = `<polygon points="12,3.5 19,7.5 19.5,15.5 13,20.5 5.5,17 4.5,9" fill="#94a3b8" stroke="#080a12" stroke-width="1.5"/><path d="M12 3.5L13 11.5L19.5 15.5M13 11.5L5.5 17" stroke="#cbd5e1" stroke-width="1.2"/>`;
  } else if (id.includes('mine')) {
    body = `<circle cx="12" cy="13" r="6" fill="#475569" stroke="#080a12" stroke-width="1.5"/><circle cx="12" cy="13" r="2.4" fill="#ef4444"/><path d="M12 4.5V7M5.5 8.5L7.5 10M18.5 8.5L16.5 10M4 15H6.5M17.5 15H20" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>`;
  } else if (id.includes('poison')) {
    body = `<path d="M9.5 4H14.5M10.5 4V8.5L5.5 16.5C4.8 17.8 5.7 19.5 7.2 19.5H16.8C18.3 19.5 19.2 17.8 18.5 16.5L13.5 8.5V4" fill="#4ade80" fill-opacity="0.32" stroke="#4ade80" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.5 15H16.5L17.5 17.5H6.5L7.5 15Z" fill="#4ade80"/>`;
  } else if (id.includes('blackhole')) {
    body = `<ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-24 12 12)" stroke="#d946ef" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#090414" stroke="#c084fc" stroke-width="1.6"/>`;
  } else if (id.includes('blood')) {
    body = `<path d="M12 3.5C12 3.5 6 10.2 6 14.5A6 6 0 0 0 18 14.5C18 10.2 12 3.5 12 3.5Z" fill="#ef4444" stroke="#080a12" stroke-width="1.4"/><path d="M9.5 14.5A2.5 2.5 0 0 0 12 17" stroke="#fecaca" stroke-width="1.5" stroke-linecap="round"/>`;
  } else if (id.includes('dagger')) {
    body = `<path d="M18.5 5.5L11.5 14.5L9.5 12.5L18.5 5.5Z" fill="#7dd3fc" stroke="#080a12" stroke-width="1.2"/><path d="M8 11L13 16M5.5 18.5L9.5 14.5" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/><path d="M5 7A6 6 0 0 1 11 4" stroke="#67e8f9" stroke-width="1.5" stroke-linecap="round"/>`;
  } else if (id.includes('dice')) {
    body = `<rect x="4.5" y="4.5" width="15" height="15" rx="2.5" fill="#f8fafc" stroke="#080a12" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.3" fill="#0f172a"/><circle cx="15.5" cy="8.5" r="1.3" fill="#0f172a"/><circle cx="12" cy="12" r="1.4" fill="#ef4444"/><circle cx="8.5" cy="15.5" r="1.3" fill="#0f172a"/><circle cx="15.5" cy="15.5" r="1.3" fill="#0f172a"/>`;
  } else if (id.includes('scythe')) {
    body = `<path d="M6.5 19.5L16.5 6" stroke="#64748b" stroke-width="2.4" stroke-linecap="round"/><path d="M16.5 5.5C12 4 7 6 5 10.5C8.5 9 12.5 9.2 15.5 11.2L16.5 5.5Z" fill="#4ade80" stroke="#080a12" stroke-width="1.3"/>`;
  } else {
    body = `<circle cx="12" cy="12" r="7" fill="${color}" stroke="#080a12" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="#fff"/>`;
  }

  return svgWrap(body, size);
}

// ============================================================================
// 4. ALL 26 TOME ICONS (ORNATE SPELLBOOK + STAT EMBLEM)
// ============================================================================

export function getTomeIconSvg(tomeId: string, color = '#38bdf8', size = 24): string {
  const id = tomeId.toLowerCase();
  let glyph = '<circle cx="13" cy="11.5" r="2.6" fill="#fff"/>';

  if (id.includes('damage')) {
    glyph = '<path d="M10.5 14.5L15.8 8.8M13.5 8.8H16V11.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
  } else if (id.includes('agility') || id.includes('speed')) {
    glyph = '<path d="M13.5 7.5L10 12H13L12.2 16L16 11.2H13L13.5 7.5Z" fill="#fff"/>';
  } else if (id.includes('cooldown')) {
    glyph = '<circle cx="13" cy="11.5" r="3.4" stroke="#fff" stroke-width="1.6"/><path d="M13 9.5V11.8L14.6 12.8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>';
  } else if (id.includes('quantity')) {
    glyph = '<circle cx="10.5" cy="10" r="1.4" fill="#fff"/><circle cx="15.2" cy="10" r="1.4" fill="#fff"/><circle cx="12.8" cy="14" r="1.4" fill="#fff"/>';
  } else if (id.includes('armor') || id.includes('shield')) {
    glyph = '<path d="M13 7.5L16.5 9V12C16.5 14.2 14.9 15.6 13 16.3C11.1 15.6 9.5 14.2 9.5 12V9L13 7.5Z" fill="#fff"/>';
  } else if (id.includes('health') || id.includes('regen') || id.includes('blood')) {
    glyph = '<path d="M13 15.5L9.8 12.4C9 11.5 9.1 10 10.1 9.3C11 8.6 12.2 8.9 13 9.9C13.8 8.9 15 8.6 15.9 9.3C16.9 10 17 11.5 16.2 12.4L13 15.5Z" fill="#fff"/>';
  } else if (id.includes('precision') || id.includes('crit')) {
    glyph = '<circle cx="13" cy="11.5" r="3" stroke="#fff" stroke-width="1.5"/><circle cx="13" cy="11.5" r="1" fill="#fff"/>';
  } else if (id.includes('luck') || id.includes('gamba')) {
    glyph = '<path d="M13 7.2L14.2 10L17.2 10.3L14.9 12.3L15.6 15.2L13 13.7L10.4 15.2L11.1 12.3L8.8 10.3L11.8 10L13 7.2Z" fill="#fff"/>';
  } else if (id.includes('gold') || id.includes('silver') || id.includes('hoarder')) {
    glyph = '<circle cx="13" cy="11.5" r="3.4" fill="#fef08a" stroke="#78350f" stroke-width="1.2"/>';
  } else if (id.includes('xp')) {
    glyph = '<polygon points="13,7 16.8,11.5 13,16 9.2,11.5" fill="#fff"/>';
  } else if (id.includes('cursed') || id.includes('chaos')) {
    glyph = '<path d="M10 9.5L16 14.5M16 9.5L10 14.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
  } else if (id.includes('size') || id.includes('knockback')) {
    glyph = '<path d="M9.5 11.5H16.5M13 8V15" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
  }

  const body = `
    <path d="M5 4.5C5 3.7 5.7 3 6.5 3H18.5C19.3 3 20 3.7 20 4.5V19.5C20 20.3 19.3 21 18.5 21H6.5C5.7 21 5 20.3 5 19.5V4.5Z" fill="${color}" stroke="#080a12" stroke-width="1.6"/>
    <path d="M5 4.5H8V21H6.5C5.7 21 5 20.3 5 19.5V4.5Z" fill="#0b0f1c" fill-opacity="0.45"/>
    <path d="M8 18H19" stroke="#fef3c7" stroke-width="1.5"/>
    ${glyph}
  `;
  return svgWrap(body, size);
}

// ============================================================================
// 5. ALL 87 ITEM ICONS (SEMANTIC SILHOUETTES BY ITEM FAMILY)
// ============================================================================

export function getItemIconSvg(itemId: string, rarity: Rarity = 'Common', size = 22): string {
  const id = itemId.toLowerCase();
  const col = RARITY_COLOR_HEX[rarity] ?? '#cbd5e1';
  let body = '';

  if (id.includes('bonker')) {
    body = `<path d="M6 18.5L14 10.5" stroke="#b45309" stroke-width="2.8" stroke-linecap="round"/><rect x="10.5" y="4" width="9" height="6" rx="1.4" transform="rotate(42 15 7)" fill="#f472b6" stroke="#080a12" stroke-width="1.3"/>`;
  } else if (id.includes('fork')) {
    body = `<path d="M12 12V20.5M8.5 4V10C8.5 11.8 10 12.8 12 12.8C14 12.8 15.5 11.8 15.5 10V4M12 4V12" stroke="#fde047" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('meatball')) {
    body = `<circle cx="12" cy="12" r="7.5" fill="#ea580c" stroke="#080a12" stroke-width="1.5"/><circle cx="9.5" cy="9.5" r="1.4" fill="#fed7aa"/><circle cx="14.5" cy="11" r="1.2" fill="#9a3412"/><circle cx="11.5" cy="15" r="1.4" fill="#9a3412"/>`;
  } else if (id.includes('cheese')) {
    body = `<path d="M3.5 16.5L13 5.5L20.5 11.5V17.5H3.5V16.5Z" fill="#fde047" stroke="#080a12" stroke-width="1.4" stroke-linejoin="round"/><circle cx="11" cy="13.5" r="1.6" fill="#ca8a04"/><circle cx="16" cy="14.5" r="1.2" fill="#ca8a04"/>`;
  } else if (id.includes('key')) {
    body = `<circle cx="8.5" cy="10" r="4.2" stroke="${col}" stroke-width="2.4"/><path d="M12 12.8L19.5 19.5M16.5 16.8L18.5 14.8" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/>`;
  } else if (id.includes('anvil')) {
    body = `<path d="M4 8H20L17.5 12.5H14.5V16H18.5V19H5.5V16H9.5V12.5H6.5L4 8Z" fill="#94a3b8" stroke="#080a12" stroke-width="1.4" stroke-linejoin="round"/>`;
  } else if (id.includes('lamp') || id.includes('lantern') || id.includes('light')) {
    body = `<path d="M8 7H16L17.5 14.5L12 18.5L6.5 14.5L8 7Z" fill="#fde047" stroke="#080a12" stroke-width="1.4"/><path d="M9.5 7V5H14.5V7M9 20H15" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>`;
  } else if (id.includes('ring')) {
    body = `<circle cx="12" cy="13.5" r="6" stroke="${col}" stroke-width="2.6"/><polygon points="12,3.5 15.2,7 12,9.8 8.8,7" fill="#fef08a" stroke="#080a12" stroke-width="1.2"/>`;
  } else if (id.includes('glove') || id.includes('knuckle')) {
    body = `<path d="M7 12V6.5C7 5.7 7.7 5 8.5 5C9.3 5 10 5.7 10 6.5V10M10 6.5C10 5.7 10.7 5 11.5 5C12.3 5 13 5.7 13 6.5V10M13 7C13 6.2 13.7 5.5 14.5 5.5C15.3 5.5 16 6.2 16 7V11.5L17.5 10.5C18.2 10 19 10.7 18.5 11.5L16.5 17.5C16 19 14.5 20 12.5 20H9.5C7.8 20 7 18.8 7 17V12Z" fill="${col}" stroke="#080a12" stroke-width="1.3"/>`;
  } else if (id.includes('sock') || id.includes('sneaker') || id.includes('skate') || id.includes('roller') || id.includes('speed')) {
    body = `<path d="M6 6H12V13L18.5 14.5C19.5 14.8 20 15.8 19.5 17L19 18.5H6V6Z" fill="${col}" stroke="#080a12" stroke-width="1.4" stroke-linejoin="round"/><path d="M4.5 19.5H20" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>`;
  } else if (id.includes('shield') || id.includes('chonkplate') || id.includes('mirror')) {
    body = `<path d="M12 3L19.5 6.5V12.5C19.5 16.8 16.2 20 12 21.5C7.8 20 4.5 16.8 4.5 12.5V6.5L12 3Z" fill="${col}" fill-opacity="0.35" stroke="${col}" stroke-width="2"/>`;
  } else if (id.includes('blade') || id.includes('dagger') || id.includes('cleaver') || id.includes('claw')) {
    body = `<path d="M18 5L10.5 14.5L8.5 12.5L18 5Z" fill="${col}" stroke="#080a12" stroke-width="1.3"/><path d="M7 11L12 16M5 19L9 15" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('lightning') || id.includes('battery') || id.includes('plug') || id.includes('core')) {
    body = `<path d="M13 2.5L5.5 13H11.5L10.5 21.5L18.5 11H12.5L13 2.5Z" fill="#fde047" stroke="#080a12" stroke-width="1.3"/>`;
  } else if (id.includes('ice') || id.includes('crystal')) {
    body = `<polygon points="12,3 19,8.5 17,18.5 7,18.5 5,8.5" fill="#67e8f9" stroke="#080a12" stroke-width="1.4"/><path d="M12 3V18.5M5 8.5L19 8.5" stroke="#e0f2fe" stroke-width="1.2"/>`;
  } else if (id.includes('time') || id.includes('warudo') || id.includes('bracelet')) {
    body = `<circle cx="12" cy="12" r="8" fill="#1e293b" stroke="${col}" stroke-width="2.2"/><path d="M12 7.5V12L15.5 14" stroke="#fde047" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('magnet')) {
    body = `<path d="M6.5 5V12.5A5.5 5.5 0 0 0 17.5 12.5V5" stroke="#ef4444" stroke-width="3.6" stroke-linecap="butt"/><path d="M4.7 5H8.3M15.7 5H19.3" stroke="#e2e8f0" stroke-width="3"/>`;
  } else if (id.includes('clover')) {
    body = `<circle cx="9.2" cy="9" r="3.4" fill="#4ade80"/><circle cx="14.8" cy="9" r="3.4" fill="#4ade80"/><circle cx="9.2" cy="14" r="3.4" fill="#22c55e"/><circle cx="14.8" cy="14" r="3.4" fill="#22c55e"/><path d="M12 15V21" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (id.includes('book') || id.includes('wisdom')) {
    body = `<rect x="5" y="4" width="14" height="16" rx="1.8" fill="${col}" stroke="#080a12" stroke-width="1.5"/><path d="M12 7.5V15.5M8.5 11.5H15.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
  } else if (id.includes('ghost') || id.includes('soul') || id.includes('bob') || id.includes('skull') || id.includes('mask')) {
    body = `<path d="M12 3.5C7.8 3.5 5 6.8 5 11V19.5L8.5 17.2L12 19.5L15.5 17.2L19 19.5V11C19 6.8 16.2 3.5 12 3.5Z" fill="${col}" stroke="#080a12" stroke-width="1.4"/><circle cx="9.5" cy="11" r="1.4" fill="#080a12"/><circle cx="14.5" cy="11" r="1.4" fill="#080a12"/>`;
  } else if (id.includes('card')) {
    body = `<rect x="3.5" y="6" width="17" height="12" rx="2" fill="${id.includes('green') ? '#22c55e' : '#ef4444'}" stroke="#080a12" stroke-width="1.4"/><rect x="3.5" y="9.2" width="17" height="2.6" fill="#080a12"/><rect x="6" y="13.5" width="4.5" height="2" fill="#fde047"/>`;
  } else if (id.includes('juice') || id.includes('tonic') || id.includes('beer') || id.includes('medkit') || id.includes('sauce') || id.includes('blood')) {
    body = `<rect x="7" y="7" width="10" height="13" rx="2" fill="${col}" fill-opacity="0.35" stroke="${col}" stroke-width="1.8"/><path d="M9.5 4H14.5V7H9.5V4Z" fill="${col}"/><path d="M12 10.5V16.5M9 13.5H15" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
  } else if (id.includes('hat') || id.includes('crown')) {
    body = `<path d="M4 18.5H20L17.5 15.5L12 4L6.5 15.5L4 18.5Z" fill="${col}" stroke="#080a12" stroke-width="1.4" stroke-linejoin="round"/><path d="M6.8 15H17.2" stroke="#fde047" stroke-width="2"/>`;
  } else {
    body = `<polygon points="12,3 20,9.5 17,20 7,20 4,9.5" fill="${col}" fill-opacity="0.32" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/><polygon points="12,7 16,11.5 12,16 8,11.5" fill="${col}"/>`;
  }

  return svgWrap(body, size);
}

// ============================================================================
// 6. ALL 8 META SHOP UPGRADE ICONS
// ============================================================================

export function getShopIconSvg(upgradeId: ShopUpgradeId, size = 24): string {
  switch (upgradeId) {
    case 'Weapons':
      return getWeaponIconSvg('WeaponSword', '#fbbf24', size);
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
// 7. ALL 21 PLAYABLE CHARACTER PORTRAIT AVATARS
// ============================================================================

export function getCharacterAvatarSvg(charDef: CharacterDef, size = 36): string {
  const p = charDef.primaryColorHex;
  const a = charDef.accentColorHex;
  let head = '';

  switch (charDef.id) {
    case 'Fox':
      head = `
        <polygon points="7,12 10,4 14,10" fill="${p}" stroke="#080a12" stroke-width="1.5"/>
        <polygon points="25,12 22,4 18,10" fill="${p}" stroke="#080a12" stroke-width="1.5"/>
        <ellipse cx="16" cy="17" rx="9" ry="7.8" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
        <path d="M9.5 19C11.5 22.5 20.5 22.5 22.5 19L16 17L9.5 19Z" fill="${a}"/>
        <circle cx="12.5" cy="15.5" r="1.6" fill="#080a12"/><circle cx="19.5" cy="15.5" r="1.6" fill="#080a12"/>
        <circle cx="12.9" cy="15" r="0.6" fill="#fff"/><circle cx="19.9" cy="15" r="0.6" fill="#fff"/>
        <polygon points="14.6,18 17.4,18 16,19.8" fill="#080a12"/>
        <rect x="9" y="23.5" width="14" height="4.5" rx="2" fill="#2e8555" stroke="#080a12" stroke-width="1.4"/>
      `;
      break;
    case 'Calcium':
      head = `
        <path d="M8 14C8 8.5 11.4 5.5 16 5.5C20.6 5.5 24 8.5 24 14C24 17.4 22 19.6 20.5 20.6V24H11.5V20.6C10 19.6 8 17.4 8 14Z" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
        <rect x="9.5" y="12" width="5.5" height="3.6" rx="1" fill="#080a12"/>
        <rect x="17" y="12" width="5.5" height="3.6" rx="1" fill="#080a12"/>
        <path d="M15 13.5H17" stroke="#080a12" stroke-width="1.6"/>
        <path d="M10.5 12.8H14M18 12.8H21.5" stroke="${a}" stroke-width="1.2"/>
        <path d="M14 21V24M18 21V24" stroke="#080a12" stroke-width="1.4"/>
      `;
      break;
    case 'SirOofie':
      head = `
        <path d="M13 4C16 2.5 20.5 4.2 21.5 8H13V4Z" fill="#e63946" stroke="#080a12" stroke-width="1.3"/>
        <rect x="8.5" y="8" width="15" height="16" rx="4" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
        <rect x="10.5" y="13.5" width="11" height="3.6" rx="1" fill="#0f172a"/>
        <path d="M16 8V24" stroke="${a}" stroke-width="1.6"/>
        <circle cx="13.5" cy="15.3" r="1" fill="#7df9ff"/><circle cx="18.5" cy="15.3" r="1" fill="#7df9ff"/>
      `;
      break;
    case 'Megachad':
      head = `
        <path d="M8.5 8H23.5L22.5 21L16 25.5L9.5 21L8.5 8Z" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
        <path d="M8 9C10 4.5 22 4.5 24 9H8Z" fill="#1e293b" stroke="#080a12" stroke-width="1.3"/>
        <rect x="9.2" y="11.5" width="6" height="3.6" fill="#0f172a" stroke="${a}" stroke-width="1.2"/>
        <rect x="16.8" y="11.5" width="6" height="3.6" fill="#0f172a" stroke="${a}" stroke-width="1.2"/>
        <path d="M15.2 13H16.8" stroke="${a}" stroke-width="1.5"/>
        <path d="M12.5 19.2C14.5 20.6 17.5 20.6 19.5 19.2" stroke="#080a12" stroke-width="1.6" stroke-linecap="round"/>
      `;
      break;
    case 'Dicehead':
      head = `
        <rect x="7.5" y="6.5" width="17" height="17" rx="3" fill="#f8fafc" stroke="#080a12" stroke-width="1.8"/>
        <circle cx="11.5" cy="10.5" r="1.5" fill="#0f172a"/><circle cx="20.5" cy="10.5" r="1.5" fill="#0f172a"/>
        <circle cx="16" cy="15" r="1.8" fill="#e63946"/>
        <circle cx="11.5" cy="19.5" r="1.5" fill="#0f172a"/><circle cx="20.5" cy="19.5" r="1.5" fill="#0f172a"/>
        <path d="M11 24.5H21" stroke="${p}" stroke-width="3" stroke-linecap="round"/>
      `;
      break;
    case 'Spaceman':
      head = `
        <circle cx="16" cy="15.5" r="9.5" fill="#eef2f7" stroke="#080a12" stroke-width="1.6"/>
        <rect x="9.5" y="11" width="13" height="8" rx="3.8" fill="#1b263b" stroke="${a}" stroke-width="1.5"/>
        <path d="M12 13.5H15.5" stroke="#67e8f9" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M16 4V6.2" stroke="${a}" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="3.5" r="1.4" fill="#38bdf8"/>
      `;
      break;
    case 'Birdo':
      head = `
        <path d="M14 4L17 8.5L20 5.5L19 10" stroke="${p}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="16" cy="16" r="8.5" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
        <circle cx="12.5" cy="14" r="1.6" fill="#080a12"/><circle cx="19.5" cy="14" r="1.6" fill="#080a12"/>
        <polygon points="12.5,17 19.5,17 16,21.5" fill="${a}" stroke="#080a12" stroke-width="1.3"/>
      `;
      break;
    case 'Cl4nk':
      head = `
        <path d="M16 4V7.5" stroke="#94a3b8" stroke-width="2"/><circle cx="16" cy="3.8" r="1.5" fill="${a}"/>
        <rect x="8" y="8" width="16" height="15" rx="2.5" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
        <rect x="10.2" y="11.5" width="11.6" height="4.5" rx="1.2" fill="#0f172a"/>
        <rect x="11.5" y="12.7" width="3.5" height="2" fill="${a}"/><rect x="17" y="12.7" width="3.5" height="2" fill="${a}"/>
        <path d="M11.5 19.2H20.5" stroke="#080a12" stroke-width="1.8" stroke-linecap="round"/>
      `;
      break;
    case 'Bush':
      head = `
        <circle cx="11" cy="12" r="5.5" fill="${p}" stroke="#080a12" stroke-width="1.4"/>
        <circle cx="21" cy="12" r="5.5" fill="${p}" stroke="#080a12" stroke-width="1.4"/>
        <circle cx="16" cy="10" r="6" fill="${a}" stroke="#080a12" stroke-width="1.4"/>
        <ellipse cx="16" cy="18" rx="9" ry="6.5" fill="${p}" stroke="#080a12" stroke-width="1.5"/>
        <rect x="10.5" y="14.5" width="11" height="4.2" rx="2" fill="#0b1320"/>
        <circle cx="13.2" cy="16.6" r="1.3" fill="#fef08a"/><circle cx="18.8" cy="16.6" r="1.3" fill="#fef08a"/>
      `;
      break;
    case 'Ninja':
      head = `
        <circle cx="16" cy="16" r="8.8" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
        <rect x="8.2" y="10.2" width="15.6" height="2.8" fill="${a}"/>
        <rect x="10" y="13.5" width="12" height="4.5" rx="1.6" fill="#f1c6a0"/>
        <path d="M11.5 15.5L14.2 16M20.5 15.5L17.8 16" stroke="#080a12" stroke-width="1.8" stroke-linecap="round"/>
      `;
      break;
    case 'Vlad':
      head = `
        <polygon points="6,25 10,14 22,14 26,25" fill="${a}" stroke="#080a12" stroke-width="1.4"/>
        <ellipse cx="16" cy="15.5" rx="7.5" ry="8.2" fill="#e5deec" stroke="#080a12" stroke-width="1.5"/>
        <path d="M9 11L16 14L23 11C22 7 10 7 9 11Z" fill="#181124"/>
        <circle cx="13" cy="15.5" r="1.3" fill="#ef4444"/><circle cx="19" cy="15.5" r="1.3" fill="#ef4444"/>
        <path d="M13 20.5H19M14 20.5L14.6 22.3M18 20.5L17.4 22.3" stroke="#080a12" stroke-width="1.3" stroke-linecap="round"/>
      `;
      break;
    default: {
      // Expressive signature silhouette portrait tailored by primary + accent colors
      const isHooded = charDef.id === 'Amog' || charDef.id === 'Roberto' || charDef.id === 'Robinette';
      const isHeavy = charDef.id === 'Ogre' || charDef.id === 'SirChadwell';
      head = isHooded
        ? `
          <path d="M7 22L10 8L16 4.5L22 8L25 22H7Z" fill="${p}" stroke="#080a12" stroke-width="1.6" stroke-linejoin="round"/>
          <ellipse cx="16" cy="16.5" rx="5.5" ry="5" fill="#0d1220"/>
          <circle cx="13.8" cy="16" r="1.5" fill="${a}"/><circle cx="18.2" cy="16" r="1.5" fill="${a}"/>
        `
        : isHeavy
          ? `
            <rect x="7" y="7" width="18" height="17" rx="3.5" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
            <path d="M9.5 13H22.5" stroke="#080a12" stroke-width="2.4" stroke-linecap="round"/>
            <circle cx="12.5" cy="15.8" r="1.5" fill="${a}"/><circle cx="19.5" cy="15.8" r="1.5" fill="${a}"/>
            <path d="M11 21H21M12.5 21V18.8M19.5 21V18.8" stroke="#fef9c3" stroke-width="1.7" stroke-linecap="round"/>
          `
          : `
            <circle cx="16" cy="16" r="8.6" fill="${p}" stroke="#080a12" stroke-width="1.6"/>
            <path d="M8.5 12.5C11 7.5 21 7.5 23.5 12.5Z" fill="${a}" stroke="#080a12" stroke-width="1.3"/>
            <circle cx="12.8" cy="16.2" r="1.5" fill="#080a12"/><circle cx="19.2" cy="16.2" r="1.5" fill="#080a12"/>
            <circle cx="13.2" cy="15.7" r="0.5" fill="#fff"/><circle cx="19.6" cy="15.7" r="0.5" fill="#fff"/>
            <path d="M13 20C14.8 21.4 17.2 21.4 19 20" stroke="#080a12" stroke-width="1.5" stroke-linecap="round"/>
          `;
      break;
    }
  }

  return `<svg class="kb-svg kb-avatar-svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="1.5" y="1.5" width="29" height="29" rx="5" fill="#101626" stroke="${a}" stroke-opacity="0.55" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="11" fill="${p}" fill-opacity="0.16"/>
    ${head}
  </svg>`;
}
