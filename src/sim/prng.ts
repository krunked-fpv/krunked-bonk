/**
 * KRUNKEDBONK — Deterministic Seeded PRNG (Mulberry32 / SplitMix32)
 *
 * 100% pure TypeScript. Zero Math.random(), zero DOM, zero Three.js.
 * Operates purely on a mutable `{ rngState: number }` holder (such as `SimState`).
 */

export interface RngStateHolder {
  rngState: number;
}

/**
 * Mix an arbitrary numeric seed (int, float, negative, or 0) into a well-distributed
 * unsigned 32-bit SplitMix32 initial state.
 */
export function normalizeSeed(seed: number): number {
  let x: number;
  if (!Number.isFinite(seed)) {
    x = 0x9e3779b9;
  } else if (Number.isInteger(seed)) {
    x = seed >>> 0;
  } else {
    // Mix fractional component deterministically for non-integer seeds
    x = (Math.floor(seed) ^ Math.floor((seed % 1) * 0x100000000)) >>> 0;
  }

  // SplitMix32 finalizer avalanche so consecutive seeds (1, 2, 3) diverge immediately
  x = (x + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Derive a deterministic unsigned 32-bit sub-seed from a base seed and numeric/string salt.
 */
export function deriveSeed(seed: number, salt: number | string): number {
  let h = normalizeSeed(seed);
  if (typeof salt === 'number') {
    h ^= normalizeSeed(salt);
  } else {
    for (let i = 0; i < salt.length; i++) {
      h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
    }
  }
  return normalizeSeed(h);
}

/**
 * Create a standalone mutable PRNG state holder seeded deterministically.
 */
export function createSeededRng(seed: number): RngStateHolder {
  return { rngState: normalizeSeed(seed) };
}

/**
 * Wrap a mutable `RngStateHolder` (e.g. `SimState`) as a `() => number` callback in `[0, 1)`.
 */
export function createRngCallback(state: RngStateHolder): () => number {
  return () => nextFloat(state);
}

/**
 * Advance the Mulberry32 generator and return an unsigned 32-bit integer in `[0, 0xFFFFFFFF]`.
 */
export function nextUint32(state: RngStateHolder): number {
  const next = ((state.rngState >>> 0) + 0x6d2b79f5) >>> 0;
  state.rngState = next;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/**
 * Return a deterministic uniform float in `[0, 1)`.
 */
export function nextFloat(state: RngStateHolder): number {
  return nextUint32(state) / 4294967296;
}

/**
 * Return a deterministic uniform float in `[min, max)`.
 */
export function nextRange(state: RngStateHolder, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }
  if (max <= min) {
    return min;
  }
  return min + (max - min) * nextFloat(state);
}

/**
 * Return a deterministic uniform integer in `[min, maxInclusive]`.
 */
export function nextInt(state: RngStateHolder, min: number, maxInclusive: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(maxInclusive);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return 0;
  }
  if (hi <= lo) {
    return lo;
  }
  const span = hi - lo + 1;
  const idx = Math.floor(nextFloat(state) * span);
  return lo + Math.min(span - 1, idx);
}

/**
 * Bernoulli trial returning `true` with probability `p` in `[0, 1]`.
 */
export function chance(state: RngStateHolder, p: number): boolean {
  if (!Number.isFinite(p) || p <= 0) {
    return false;
  }
  if (p >= 1) {
    return true;
  }
  return nextFloat(state) < p;
}

/**
 * Pick a uniformly random element from `items`, or `undefined` if empty.
 */
export function pick<T>(state: RngStateHolder, items: readonly T[]): T | undefined {
  const len = items.length;
  if (len === 0) {
    return undefined;
  }
  if (len === 1) {
    // Still advance RNG consistently when sampling a 1-element pool
    nextUint32(state);
    return items[0];
  }
  return items[nextInt(state, 0, len - 1)];
}

/**
 * Pick an element from `items` proportional to non-negative weights returned by `weightFn`.
 * Returns `undefined` if `items` is empty or total positive weight is `<= 0`.
 */
export function weightedPick<T>(
  state: RngStateHolder,
  items: readonly T[],
  weightFn: (item: T, index: number) => number,
): T | undefined {
  const len = items.length;
  if (len === 0) {
    return undefined;
  }

  let totalWeight = 0;
  let lastPositiveIndex = -1;
  for (let i = 0; i < len; i++) {
    const raw = weightFn(items[i], i);
    const w = Number.isFinite(raw) && raw > 0 ? raw : 0;
    if (w > 0) {
      totalWeight += w;
      lastPositiveIndex = i;
    }
  }

  if (totalWeight <= 0 || lastPositiveIndex < 0) {
    return undefined;
  }

  let target = nextFloat(state) * totalWeight;
  for (let i = 0; i < len; i++) {
    const raw = weightFn(items[i], i);
    const w = Number.isFinite(raw) && raw > 0 ? raw : 0;
    if (w <= 0) {
      continue;
    }
    target -= w;
    if (target < 0) {
      return items[i];
    }
  }

  return items[lastPositiveIndex];
}

/**
 * Deterministic Fisher-Yates in-place shuffle.
 */
export function shuffleInPlace<T>(state: RngStateHolder, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(state, 0, i);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}
