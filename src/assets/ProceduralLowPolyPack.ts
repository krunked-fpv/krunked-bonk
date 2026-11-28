/**
 * KRUNKEDBONK — Built-In Procedural Low-Poly Asset Pack (Wave 2 Full Expansion)
 *
 * Implements IAssetPack with:
 * - Razor-sharp NearestFilter procedural pixel-palette DataTextures for all 4 biomes & materials
 * - Chunky faceted articulated low-poly 3D rigs with seamless inverted-hull ink outlines
 *   for ALL 21 playable characters, dynamic skinId palette overrides, and all 8 wearable hatId meshes
 * - 4 dedicated articulated Boss Rigs (EntStage1/2/3, Pharaoh1/2/3, Big Bob GhostKing, FinalBoss)
 * - Distinct iconic low-poly silhouettes for all Forest, Desert, Graveyard & FinalSwarm enemies
 * - Distinct outlined meshes for all 12 Interactables + CryptAltar, BossPortal, BossPylon & DarknessLamp
 * - Distinct low-poly biome props and all 30 weapon projectile/pickup visual archetypes
 */

import * as THREE from 'three';
import type {
  CharacterId,
  CustomPackFileEntry,
  IAssetPack,
  InteractableKind,
  InteractableVariant,
  PackManifest,
} from '../contracts/index';
import {
  createMkToonMaterial,
  createOutlineMaterial,
  createSmoothOutlineGeometry,
} from '../render/toonShader';
import {
  buildAllPainterlyTextures,
  type PainterlyTextureId,
} from './PainterlyTextures';
import {
  buildSculptedArmParts,
  buildSculptedCapeParts,
  buildSculptedLegParts,
  createCalligraphicSlashGeometry,
  createCraggySpireGeometry,
  createSandstoneArchGeometry,
  createSculptedCanopyCluster,
  extrudePolyPart,
  lathePart,
} from './SculptedMeshes';

// ============================================================================
// HIGH-RESOLUTION PAINTERLY PROCEDURAL TEXTURES (128x128 & 256x256 NearestFilter)
// ============================================================================

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

export type ProceduralTextureId = PainterlyTextureId;

function buildAllProceduralTextures(): Record<ProceduralTextureId, THREE.DataTexture> {
  return buildAllPainterlyTextures();
}

// ============================================================================
// FACETED VERTEX-COLORED LOW-POLY GEOMETRY MERGER + COMPACT PART SHORTHANDS
// ============================================================================

type V3 = [number, number, number];

export interface ColoredPartSpec {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: V3;
  rot?: V3;
  scale?: V3;
}

const box = (w: number, h: number, d: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.BoxGeometry(w, h, d), color, pos, rot, scale });
const cyl = (rt: number, rb: number, h: number, seg: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.CylinderGeometry(rt, rb, h, seg), color, pos, rot, scale });
const cone = (r: number, h: number, seg: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.ConeGeometry(r, h, seg), color, pos, rot, scale });
const dodec = (r: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.DodecahedronGeometry(r, 0), color, pos, rot, scale });
const octa = (r: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.OctahedronGeometry(r, 0), color, pos, rot, scale });
const ico = (r: number, color: number, pos?: V3, rot?: V3, scale?: V3): ColoredPartSpec =>
  ({ geo: new THREE.IcosahedronGeometry(r, 0), color, pos, rot, scale });
const torus = (r: number, t: number, rs: number, ts: number, color: number, pos?: V3, rot?: V3, scale?: V3, arc?: number): ColoredPartSpec =>
  ({ geo: new THREE.TorusGeometry(r, t, rs, ts, arc), color, pos, rot, scale });

const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpPos = new THREE.Vector3();
const _tmpScale = new THREE.Vector3();
const _tmpColor = new THREE.Color();

export function mergeColoredParts(parts: readonly ColoredPartSpec[]): THREE.BufferGeometry {
  const nonIndexedParts: Array<{ geo: THREE.BufferGeometry; color: number }> = [];
  let totalVerts = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const raw = part.geo;
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    raw.dispose();

    _tmpPos.set(part.pos?.[0] ?? 0, part.pos?.[1] ?? 0, part.pos?.[2] ?? 0);
    _tmpEuler.set(part.rot?.[0] ?? 0, part.rot?.[1] ?? 0, part.rot?.[2] ?? 0);
    _tmpQuat.setFromEuler(_tmpEuler);
    _tmpScale.set(part.scale?.[0] ?? 1, part.scale?.[1] ?? 1, part.scale?.[2] ?? 1);
    _tmpMat.compose(_tmpPos, _tmpQuat, _tmpScale);
    g.applyMatrix4(_tmpMat);
    g.computeVertexNormals();

    const posAttr = g.getAttribute('position');
    totalVerts += posAttr.count;
    nonIndexedParts.push({ geo: g, color: part.color });
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);

  let offset = 0;
  for (let i = 0; i < nonIndexedParts.length; i++) {
    const entry = nonIndexedParts[i]!;
    const g = entry.geo;
    const posAttr = g.getAttribute('position');
    const normAttr = g.getAttribute('normal');
    const uvAttr = g.getAttribute('uv');
    const count = posAttr.count;

    _tmpColor.setHex(entry.color);
    const cr = _tmpColor.r;
    const cg = _tmpColor.g;
    const cb = _tmpColor.b;

    for (let v = 0; v < count; v++) {
      const o3 = (offset + v) * 3;
      const o2 = (offset + v) * 2;
      positions[o3] = posAttr.getX(v);
      positions[o3 + 1] = posAttr.getY(v);
      positions[o3 + 2] = posAttr.getZ(v);

      normals[o3] = normAttr.getX(v);
      normals[o3 + 1] = normAttr.getY(v);
      normals[o3 + 2] = normAttr.getZ(v);

      if (uvAttr) {
        uvs[o2] = uvAttr.getX(v);
        uvs[o2 + 1] = uvAttr.getY(v);
      } else {
        uvs[o2] = (positions[o3]! + positions[o3 + 2]!) * 0.5;
        uvs[o2 + 1] = positions[o3 + 1]! * 0.5;
      }

      colors[o3] = cr;
      colors[o3 + 1] = cg;
      colors[o3 + 2] = cb;
    }

    offset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

export interface LowPolyGeometryPair {
  geometry: THREE.BufferGeometry;
  outlineGeometry: THREE.BufferGeometry;
  textureKey: ProceduralTextureId;
  outlineThickness: number;
  emissiveHex?: number;
  emissiveIntensity?: number;
  gloss?: number;
}

function makePair(
  parts: readonly ColoredPartSpec[],
  textureKey: ProceduralTextureId,
  outlineThickness = 0.048,
  extra?: { emissiveHex?: number; emissiveIntensity?: number; gloss?: number; uvScale?: [number, number] },
): LowPolyGeometryPair {
  const geometry = mergeColoredParts(parts);
  if (extra?.uvScale) {
    const uvAttr = geometry.getAttribute('uv');
    if (uvAttr) {
      const [su, sv] = extra.uvScale;
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * su, uvAttr.getY(i) * sv);
      }
      uvAttr.needsUpdate = true;
    }
  }
  const outlineGeometry = createSmoothOutlineGeometry(geometry);
  return {
    geometry,
    outlineGeometry,
    textureKey,
    outlineThickness,
    emissiveHex: extra?.emissiveHex,
    emissiveIntensity: extra?.emissiveIntensity,
    gloss: extra?.gloss,
  };
}

// ============================================================================
// ARTICULATED PLAYABLE CHARACTER RIGS — ALL 21 CHARACTERS + SKINS + 8 HATS
// ============================================================================

export interface CharacterRig {
  characterId: CharacterId;
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  tailPivot: THREE.Group | null;
  capePivot: THREE.Group | null;
  weaponPivot: THREE.Group;
  boardPivot: THREE.Group | null;
  wheelPivots: THREE.Object3D[];
  leftWingPivot: THREE.Group | null;
  rightWingPivot: THREE.Group | null;
  auraRing: THREE.Mesh | null;
  baseScale: number;
  hoverMode: 'none' | 'skateboard' | 'hoverboard' | 'float';
  isDiceHead: boolean;
  toonMaterials: THREE.ShaderMaterial[];
  outlineMeshes: THREE.Mesh[];
  dispose: () => void;
}

export interface ArticulatedBossRig {
  kind: 'Ent' | 'Pharaoh' | 'BigBob' | 'FinalBoss';
  root: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  crownGroup: THREE.Group;
  shieldDome: THREE.Mesh | null;
  toonMaterials: THREE.ShaderMaterial[];
  dispose: () => void;
}

interface CharacterStylePalette {
  primary: number;
  secondary: number;
  accent: number;
  skin: number;
  boots: number;
  weapon: number;
  weaponGlow: number;
  scale: number;
}

const CHARACTER_PALETTES: Record<CharacterId, CharacterStylePalette> = {
  Fox: { primary: 0xf27127, secondary: 0x2e8555, accent: 0xfff1d6, skin: 0xf58438, boots: 0x452d24, weapon: 0x7d4c2a, weaponGlow: 0xff8b1f, scale: 1.0 },
  Calcium: { primary: 0xf5f0de, secondary: 0x232a3b, accent: 0xff3b5c, skin: 0xf7f2e1, boots: 0x3ad5ff, weapon: 0xfcf9ed, weaponGlow: 0xffe89e, scale: 1.0 },
  SirOofie: { primary: 0xd0d9e3, secondary: 0x3b4454, accent: 0xf0be3c, skin: 0x6c7a8f, boots: 0x454f5e, weapon: 0xe3ecf5, weaponGlow: 0x7df9ff, scale: 1.06 },
  Megachad: { primary: 0xe6a67c, secondary: 0x1d2333, accent: 0xffd23f, skin: 0xebae86, boots: 0x252c40, weapon: 0xffd23f, weaponGlow: 0xffd84d, scale: 1.32 },
  Amog: { primary: 0xd93838, secondary: 0x3b2a54, accent: 0x8cff3b, skin: 0x73e069, boots: 0x2a2438, weapon: 0x8cff3b, weaponGlow: 0xaaff00, scale: 1.0 },
  Athena: { primary: 0xf4f1e6, secondary: 0x2a7de0, accent: 0xffd24c, skin: 0xf5cba7, boots: 0xd4a437, weapon: 0xffdf6b, weaponGlow: 0x70e4ff, scale: 1.02 },
  Bandit: { primary: 0x342c42, secondary: 0xa8243a, accent: 0xffc43d, skin: 0xe8ba95, boots: 0x211a2b, weapon: 0xd8dee9, weaponGlow: 0xff4d6d, scale: 0.98 },
  Birdo: { primary: 0x3ebeff, secondary: 0xf5f9ff, accent: 0xffb703, skin: 0x4fc8ff, boots: 0xf29f29, weapon: 0xa6f7ff, weaponGlow: 0x5ef2ff, scale: 0.96 },
  Bush: { primary: 0x45a336, secondary: 0x6b4d32, accent: 0xbef25c, skin: 0x38802c, boots: 0x473322, weapon: 0x4b5866, weaponGlow: 0x70ff98, scale: 1.0 },
  SirChadwell: { primary: 0x432763, secondary: 0x1d132b, accent: 0xd938ff, skin: 0x675080, boots: 0x191124, weapon: 0xc138ff, weaponGlow: 0xe66bff, scale: 1.08 },
  Cl4nk: { primary: 0x1d6de8, secondary: 0x262c38, accent: 0x52d6ff, skin: 0x6b3e1f, boots: 0x5c3318, weapon: 0xa6b8cc, weaponGlow: 0x52f2ff, scale: 1.02 },
  Dicehead: { primary: 0xc92a3e, secondary: 0x1e2436, accent: 0xffd23f, skin: 0xf7f8fc, boots: 0x181d2b, weapon: 0xf7f8fc, weaponGlow: 0xffd23f, scale: 1.0 },
  Monke: { primary: 0x5c361a, secondary: 0x303645, accent: 0xffe03b, skin: 0xcf9f6b, boots: 0xc99663, weapon: 0xffe03b, weaponGlow: 0xfff078, scale: 1.08 },
  Ninja: { primary: 0x1d222e, secondary: 0x2b3447, accent: 0x3a6ec4, skin: 0xe6ba95, boots: 0x141824, weapon: 0xedf4fc, weaponGlow: 0xffe84d, scale: 1.02 },
  Noelle: { primary: 0x64d6ff, secondary: 0xf0f9ff, accent: 0x3b82f6, skin: 0xf7d6c3, boots: 0x2b5eb0, weapon: 0xb8f3ff, weaponGlow: 0x7ae5ff, scale: 0.98 },
  Ogre: { primary: 0x69a842, secondary: 0x734b30, accent: 0xe8d5a8, skin: 0x77b84f, boots: 0x4a301e, weapon: 0xa3b1c2, weaponGlow: 0xff9f43, scale: 1.25 },
  Roberto: { primary: 0x28233b, secondary: 0x622f7d, accent: 0x4dff9e, skin: 0x12101c, boots: 0x181526, weapon: 0xc4d0e0, weaponGlow: 0x4dff9e, scale: 1.02 },
  Robinette: { primary: 0x2b9952, secondary: 0x8a522b, accent: 0xffd242, skin: 0xf5c8a4, boots: 0x5c361d, weapon: 0xb5763a, weaponGlow: 0xffe066, scale: 0.96 },
  Spaceman: { primary: 0xedf2f7, secondary: 0x2e78e6, accent: 0xffa62b, skin: 0x1b2438, boots: 0x4a5568, weapon: 0x7b3fe4, weaponGlow: 0xc05eff, scale: 1.02 },
  TonyMcZoom: { primary: 0xff3d77, secondary: 0x1a2236, accent: 0x38f2ff, skin: 0xf2c29b, boots: 0x38f2ff, weapon: 0x52f2ff, weaponGlow: 0x38f2ff, scale: 0.98 },
  Vlad: { primary: 0x211626, secondary: 0xb81a35, accent: 0xff4567, skin: 0xe2dce6, boots: 0x150e1a, weapon: 0xff2e54, weaponGlow: 0xff3b5c, scale: 1.04 },
};

const KNOWN_SKIN_OVERRIDES: Record<string, Partial<CharacterStylePalette>> = {
  skin_fox_ember: { primary: 0xf06a24, accent: 0xfff0d6, weaponGlow: 0xff8b1f },
  skin_fox_frost: { primary: 0xe0f2fe, secondary: 0x1e5c8a, accent: 0x38bdf8, skin: 0xeef8ff, weaponGlow: 0x5cf7ff },
  skin_calcium_classic: { primary: 0xede6d3, accent: 0xff4d6d },
  skin_calcium_neon: { primary: 0xd8b4fe, secondary: 0x181633, accent: 0x22d3ee, skin: 0xe9d5ff, boots: 0xff2ec4, weaponGlow: 0x22d3ee },
  skin_siroofie_steel: { primary: 0x8d99ae, secondary: 0xd90429, accent: 0xffcb3b },
  skin_siroofie_gilded: { primary: 0xfbbf24, secondary: 0x7c2d12, accent: 0xfef08a, boots: 0xb45309, weapon: 0xfff4c2, weaponGlow: 0xffe45e },
  skin_megachad_gold: { primary: 0xffb703, secondary: 0x78350f, accent: 0xfb8500, skin: 0xffc940, weaponGlow: 0xffe45e },
  skin_megachad_obsidian: { primary: 0x334155, secondary: 0x1e1b4b, accent: 0xc084fc, skin: 0x475569, boots: 0x0f172a, weaponGlow: 0xd946ef },
};

function resolveCharacterPalette(characterId: CharacterId, skinId?: string | null): CharacterStylePalette {
  const base = { ...(CHARACTER_PALETTES[characterId] ?? CHARACTER_PALETTES.Fox) };
  if (!skinId) return base;

  const exact = KNOWN_SKIN_OVERRIDES[skinId];
  if (exact) return { ...base, ...exact };

  const s = skinId.toLowerCase();
  if (s.includes('default') || s.includes('classic') || s.includes('base')) return base;
  if (s.includes('frost') || s.includes('arctic') || s.includes('ice') || s.includes('snow')) {
    return { ...base, primary: 0xdbf4ff, secondary: 0x1e5a8c, accent: 0x38f2ff, weaponGlow: 0x6ef7ff };
  }
  if (s.includes('gold') || s.includes('gilded') || s.includes('royal') || s.includes('solar')) {
    return { ...base, primary: 0xf5c542, secondary: 0x6b2f12, accent: 0xfff4a3, weaponGlow: 0xffe45e };
  }
  if (s.includes('obsidian') || s.includes('shadow') || s.includes('void') || s.includes('dark') || s.includes('eclipse')) {
    return { ...base, primary: 0x2d2640, secondary: 0x141021, accent: 0xc05eff, weaponGlow: 0xd946ef };
  }
  if (s.includes('neon') || s.includes('cyber') || s.includes('synth') || s.includes('plasma')) {
    return { ...base, primary: 0xff2ec4, secondary: 0x161b33, accent: 0x38f2ff, weaponGlow: 0x38f2ff };
  }
  if (s.includes('crimson') || s.includes('blood') || s.includes('inferno') || s.includes('ruby') || s.includes('lava')) {
    return { ...base, primary: 0xd92638, secondary: 0x2b1018, accent: 0xff9f43, weaponGlow: 0xff4d2e };
  }
  if (s.includes('emerald') || s.includes('toxic') || s.includes('jade') || s.includes('plague') || s.includes('forest')) {
    return { ...base, primary: 0x34d364, secondary: 0x1a382c, accent: 0xb8ff3b, weaponGlow: 0x76f562 };
  }
  if (s.includes('ghost') || s.includes('spectral') || s.includes('phantom') || s.includes('spirit')) {
    return { ...base, primary: 0xb8f3ff, secondary: 0x392b66, accent: 0x70ffcf, weaponGlow: 0x5cf7ff };
  }
  if (s.includes('sand') || s.includes('desert') || s.includes('pharaoh') || s.includes('dune')) {
    return { ...base, primary: 0xe6b566, secondary: 0x7d4524, accent: 0x38f2ff, weaponGlow: 0xffd23f };
  }
  if (s.includes('sakura') || s.includes('pink') || s.includes('rose') || s.includes('pastel')) {
    return { ...base, primary: 0xff8fab, secondary: 0x592647, accent: 0xffe5ec, weaponGlow: 0xff66b3 };
  }

  // Deterministic vibrant hue shift for any other custom Wave 2 skinId
  let hash = 2166136261;
  for (let i = 0; i < skinId.length; i++) {
    hash ^= skinId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const shift = ((hash >>> 0) % 360) / 360;
  const c1 = new THREE.Color(base.primary).offsetHSL(shift, 0.08, 0.02);
  const c2 = new THREE.Color(base.accent).offsetHSL(shift * 0.7, 0.06, 0.02);
  return { ...base, primary: c1.getHex(), accent: c2.getHex(), weaponGlow: c2.getHex() };
}

function attachOutlinedParts(
  parent: THREE.Object3D,
  parts: readonly ColoredPartSpec[],
  toonMat: THREE.ShaderMaterial,
  outlineMat: THREE.ShaderMaterial,
  outlines: THREE.Mesh[],
  geometriesToDispose: THREE.BufferGeometry[],
): THREE.Mesh {
  const geo = mergeColoredParts(parts);
  const outGeo = createSmoothOutlineGeometry(geo);
  geometriesToDispose.push(geo, outGeo);

  const mesh = new THREE.Mesh(geo, toonMat);
  const outline = new THREE.Mesh(outGeo, outlineMat);
  mesh.add(outline);
  parent.add(mesh);
  outlines.push(outline);
  return mesh;
}

/** All 8 wearable hatId meshes matching HatDef['meshStyle'] */
function addHatParts(parts: ColoredPartSpec[], hatId: string | null | undefined, headTopY: number): void {
  if (!hatId) return;
  const h = hatId.toLowerCase();
  if (h.includes('crown')) {
    parts.push(
      cyl(0.3, 0.25, 0.22, 6, 0xffd23f, [0, headTopY + 0.11, 0]),
      cone(0.08, 0.16, 4, 0xffe45e, [-0.18, headTopY + 0.26, 0.12]),
      cone(0.08, 0.16, 4, 0xffe45e, [0.18, headTopY + 0.26, 0.12]),
      cone(0.09, 0.2, 4, 0xffe45e, [0, headTopY + 0.28, 0.22]),
      octa(0.08, 0xff385c, [0, headTopY + 0.13, 0.26]),
    );
  } else if (h.includes('wizard')) {
    parts.push(
      cyl(0.48, 0.48, 0.06, 8, 0x4b339e, [0, headTopY + 0.03, 0]),
      cyl(0.3, 0.31, 0.09, 8, 0xffd23f, [0, headTopY + 0.1, 0]),
      cone(0.28, 0.66, 7, 0x6345cc, [0, headTopY + 0.4, -0.05], [-0.18, 0, 0]),
      octa(0.08, 0xffe45e, [0, headTopY + 0.72, -0.16]),
    );
  } else if (h.includes('halo')) {
    parts.push(
      torus(0.3, 0.05, 5, 10, 0xffe875, [0, headTopY + 0.26, 0], [Math.PI * 0.5, 0, 0]),
      octa(0.06, 0xffffff, [0, headTopY + 0.26, 0.3]),
    );
  } else if (h.includes('horn')) {
    parts.push(
      cone(0.09, 0.34, 5, 0xd62839, [-0.22, headTopY + 0.14, 0.04], [0.18, 0, 0.45]),
      cone(0.06, 0.22, 5, 0xff4d6d, [-0.34, headTopY + 0.32, 0.08], [0.05, 0, 0.15]),
      cone(0.09, 0.34, 5, 0xd62839, [0.22, headTopY + 0.14, 0.04], [0.18, 0, -0.45]),
      cone(0.06, 0.22, 5, 0xff4d6d, [0.34, headTopY + 0.32, 0.08], [0.05, 0, -0.15]),
    );
  } else if (h.includes('tophat')) {
    parts.push(
      cyl(0.44, 0.44, 0.06, 8, 0x1d2330, [0, headTopY + 0.03, 0]),
      cyl(0.29, 0.25, 0.48, 8, 0x262d3d, [0, headTopY + 0.28, 0]),
      cyl(0.27, 0.26, 0.1, 8, 0xe63946, [0, headTopY + 0.11, 0]),
      box(0.11, 0.11, 0.08, 0xffd23f, [0, headTopY + 0.11, 0.26]),
    );
  } else if (h.includes('visor')) {
    parts.push(
      cyl(0.39, 0.4, 0.11, 8, 0x1e293b, [0, headTopY - 0.02, 0]),
      box(0.56, 0.11, 0.34, 0x22d3ee, [0, headTopY - 0.03, 0.28], [0.16, 0, 0]),
      box(0.48, 0.04, 0.36, 0xccf8ff, [0, headTopY + 0.01, 0.29], [0.16, 0, 0]),
    );
  } else if (h.includes('bucket')) {
    parts.push(
      cyl(0.35, 0.42, 0.44, 8, 0x94a3b8, [0, headTopY + 0.16, 0], [0, 0, 0.1]),
      cyl(0.44, 0.44, 0.06, 8, 0x64748b, [0, headTopY - 0.02, 0], [0, 0, 0.1]),
      torus(0.38, 0.035, 4, 10, 0x475569, [0, headTopY + 0.14, 0], [0.55, 0, 0.1], undefined, Math.PI),
    );
  } else {
    // Skater Beanie (hat_beanie or fallback)
    parts.push(
      cyl(0.36, 0.39, 0.12, 8, 0xb91c1c, [0, headTopY + 0.02, 0]),
      dodec(0.32, 0xef4444, [0, headTopY + 0.14, -0.02], undefined, [1.05, 0.78, 1.05]),
      octa(0.11, 0xfff4c2, [0, headTopY + 0.38, -0.04]),
    );
  }
}

function addDicePipCluster(parts: ColoredPartSpec[], face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom', pipCount: number, half: number, centerY: number): void {
  const coords: Array<[number, number]> =
    pipCount === 1
      ? [[0, 0]]
      : pipCount === 2
        ? [[-0.17, -0.17], [0.17, 0.17]]
        : pipCount === 3
          ? [[-0.18, -0.18], [0, 0], [0.18, 0.18]]
          : pipCount === 4
            ? [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]
            : pipCount === 5
              ? [[-0.18, -0.18], [0.18, -0.18], [0, 0], [-0.18, 0.18], [0.18, 0.18]]
              : [[-0.18, -0.19], [0.18, -0.19], [-0.18, 0], [0.18, 0], [-0.18, 0.19], [0.18, 0.19]];
  const col = pipCount === 1 ? 0xe63946 : 0x161a26;
  for (let i = 0; i < coords.length; i++) {
    const [u, v] = coords[i]!;
    if (face === 'front') parts.push(box(0.095, 0.095, 0.04, col, [u, centerY + v, half + 0.015]));
    else if (face === 'back') parts.push(box(0.095, 0.095, 0.04, col, [u, centerY + v, -half - 0.015]));
    else if (face === 'right') parts.push(box(0.04, 0.095, 0.095, col, [half + 0.015, centerY + v, u]));
    else if (face === 'left') parts.push(box(0.04, 0.095, 0.095, col, [-half - 0.015, centerY + v, u]));
    else if (face === 'top') parts.push(box(0.095, 0.04, 0.095, col, [u, centerY + half + 0.015, v]));
    else parts.push(box(0.095, 0.04, 0.095, col, [u, centerY - half - 0.015, v]));
  }
}

export type PropKind =
  | 'pine'
  | 'oak'
  | 'boulder'
  | 'ruin_pillar'
  | 'castle_tower'
  | 'castle_wall'
  | 'fallen_log'
  | 'sandstone_arch'
  | 'desert_ruin'
  | 'cactus'
  | 'tombstone'
  | 'desert_boulder'
  | 'sandstone_obelisk'
  | 'dead_tree'
  | 'iron_fence'
  | 'crypt_arch'
  | 'citadel_pillar';

// ============================================================================
// MAIN PROCEDURAL PACK CLASS (IMPLEMENTS IAssetPack)
// ============================================================================

export class ProceduralLowPolyPack implements IAssetPack {
  private readonly textures: Record<ProceduralTextureId, THREE.DataTexture>;
  private readonly manifest: PackManifest;
  private readonly palettes: Record<string, readonly string[]>;
  private readonly localization: Record<string, string>;

  private readonly enemyCache = new Map<string, LowPolyGeometryPair>();
  private readonly propCache = new Map<string, LowPolyGeometryPair>();
  private readonly interactableCache = new Map<string, LowPolyGeometryPair>();
  private readonly projectileCache = new Map<string, LowPolyGeometryPair>();
  private readonly pickupCache = new Map<string, LowPolyGeometryPair>();
  private readonly enemyArchetypeNameCache = new Map<string, string>();
  private readonly projArchetypeNameCache = new Map<string, string>();

  constructor() {
    this.textures = buildAllProceduralTextures();
    this.palettes = {
      forest_stage1: ['#7fd145', '#59b048', '#007a9e', '#fff4d4', '#26345e', '#f5c542'],
      forest_stage2: ['#4b7a78', '#2f525c', '#62489f', '#fff4d4', '#231b45', '#c084fc'],
      forest_stage3: ['#854836', '#5e2c26', '#4d1414', '#ffe0b8', '#290f14', '#ff4d2e'],
      desert_stage1: ['#f2c26b', '#dba14d', '#ecd097', '#fff4d4', '#5c3638', '#4df3ff'],
      desert_stage2: ['#7ea4d9', '#4f72ad', '#6c9ef0', '#99c4ff', '#1f2c5c', '#38f2ff'],
      desert_stage3: ['#b84b39', '#8a2b24', '#933030', '#e0bdb7', '#3b1218', '#ff621f'],
      graveyard_stage1: ['#566275', '#5d4c82', '#7e6a9f', '#f1d7ff', '#1c1730', '#a855f7'],
      citadel_final: ['#3c304f', '#21192e', '#7a3826', '#ffea94', '#160d24', '#ffc83b'],
      fox: ['#f27127', '#fff1d6', '#2e8555', '#ff8b1f'],
      calcium: ['#f5f0de', '#ff3b5c', '#3ad5ff', '#232a3b'],
      siroofie: ['#9aa8ba', '#d62839', '#ffcb3b', '#dbe6f2'],
      megachad: ['#e6a67c', '#ffd23f', '#1d2333', '#52f2ff'],
      amog: ['#d93838', '#8cff3b', '#3b2a54', '#aaff00'],
      athena: ['#f4f1e6', '#2a7de0', '#ffd24c', '#70e4ff'],
      bandit: ['#342c42', '#a8243a', '#ffc43d', '#ff4d6d'],
      birdo: ['#3ebeff', '#f5f9ff', '#ffb703', '#5ef2ff'],
      bush: ['#45a336', '#6b4d32', '#bef25c', '#70ff98'],
      sirchadwell: ['#432763', '#1d132b', '#d938ff', '#e66bff'],
      cl4nk: ['#d19c3b', '#425263', '#52f2ff', '#a6b8cc'],
      dicehead: ['#c92a3e', '#f7f8fc', '#ffd23f', '#1e2436'],
      monke: ['#8f5633', '#2d7a47', '#ffe03b', '#dba06b'],
      ninja: ['#1f2638', '#ff3355', '#e6eef7', '#5cf2ff'],
      noelle: ['#64d6ff', '#f0f9ff', '#3b82f6', '#b8f3ff'],
      ogre: ['#69a842', '#734b30', '#e8d5a8', '#ff9f43'],
      roberto: ['#28233b', '#622f7d', '#4dff9e', '#c4d0e0'],
      robinette: ['#2b9952', '#8a522b', '#ffd242', '#ffe066'],
      spaceman: ['#edf2f7', '#2e78e6', '#ffa62b', '#c05eff'],
      tonymczoom: ['#ff3d77', '#1a2236', '#38f2ff', '#52f2ff'],
      vlad: ['#211626', '#b81a35', '#ff4567', '#e2dce6'],
    };
    this.localization = {
      'game.title': 'KRUNKEDBONK',
      'prompt.interact': '[E] INTERACT',
      'prompt.shrine': 'HOLD RING TO CHARGE',
      'prompt.boss': '[E] SUMMON BOSS',
      'prompt.portal': '[E] ENTER PORTAL',
      'prompt.lamp': 'CHARGE LAMP TO BANISH DARKNESS',
      'prompt.pylon': 'STAND IN RING TO CLEANSE PYLON',
    };

    const textureEntries: PackManifest['textures'] = {};
    for (const key of Object.keys(this.textures) as ProceduralTextureId[]) {
      textureEntries[key] = {
        id: key,
        path: `procedural://${key}`,
        width: this.textures[key].image.width,
        height: this.textures[key].image.height,
        format: 'rgba-procedural-nearest',
        category: key.startsWith('terrain_') ? 'world' : 'palette',
      };
    }

    const paletteEntries: PackManifest['palettes'] = {};
    for (const [id, colors] of Object.entries(this.palettes)) {
      paletteEntries[id] = { id, colors: [...colors] };
    }

    this.manifest = {
      version: '2.0.0-procedural',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVerified: true,
      textures: textureEntries,
      audio: {},
      localization: { ...this.localization },
      palettes: paletteEntries,
    };
  }

  // ---- IAssetPack interface ----

  public isLoaded(): boolean { return true; }
  public getManifest(): PackManifest | null { return this.manifest; }
  public async loadFromDevEndpoint(_prefix?: string): Promise<boolean> { return true; }
  public async loadFromFiles(_files: readonly CustomPackFileEntry[]): Promise<boolean> { return true; }
  public clear(): void { /* built-in pack stays loaded */ }
  public getTextureUrl(_id: string): string | null { return null; }
  public getAudioUrl(_id: string): string | null { return null; }
  public getLocalizedString(key: string, fallback = key): string { return this.localization[key] ?? fallback; }
  public getPalette(id: string): readonly string[] | null { return this.palettes[id] ?? null; }
  public getProceduralTexture(id: ProceduralTextureId): THREE.DataTexture { return this.textures[id]; }

  // ---- Articulated Character Rig Builder (ALL 21 CHARACTERS!) ----

  public buildCharacterRig(
    characterId: CharacterId,
    skinId?: string | null,
    hatId?: string | null,
  ): CharacterRig {
    const pal = resolveCharacterPalette(characterId, skinId);
    const root = new THREE.Group();
    const bodyPivot = new THREE.Group();
    const headPivot = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const weaponPivot = new THREE.Group();
    let tailPivot: THREE.Group | null = null;
    let capePivot: THREE.Group | null = null;
    let boardPivot: THREE.Group | null = null;
    let leftWingPivot: THREE.Group | null = null;
    let rightWingPivot: THREE.Group | null = null;
    const wheelPivots: THREE.Object3D[] = [];
    let auraRing: THREE.Mesh | null = null;
    let hoverMode: CharacterRig['hoverMode'] = 'none';
    const isDiceHead = characterId === 'Dicehead';

    const toonMaterials: THREE.ShaderMaterial[] = [];
    const outlineMeshes: THREE.Mesh[] = [];
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const extraMaterials: THREE.Material[] = [];

    const bodyTex =
      characterId === 'Calcium'
        ? this.textures.bone_ivory
        : characterId === 'SirOofie' || characterId === 'SirChadwell' || characterId === 'Cl4nk' || characterId === 'Athena'
          ? this.textures.metal_armor
          : characterId === 'Bush'
            ? this.textures.foliage_oak
            : characterId === 'Roberto'
              ? this.textures.spectral_ectoplasm
              : this.textures.character_palette;

    const mainMat = createMkToonMaterial({
      color: 0xffffff,
      map: bodyTex,
      mapStrength: 0.78,
      vertexColors: true,
      rimStrength: 0.28,
      rimColor: 0xe6fbff,
      gloss: characterId === 'SirOofie' || characterId === 'Spaceman' || characterId === 'Athena' ? 0.50 : characterId === 'Cl4nk' ? 0.24 : 0.14,
    });
    toonMaterials.push(mainMat);

    const glowMat = createMkToonMaterial({
      color: pal.weaponGlow,
      emissive: pal.weaponGlow,
      emissiveIntensity: 0.95,
      rimStrength: 0.5,
      rimColor: 0xffffff,
      vertexColors: false,
    });
    toonMaterials.push(glowMat);

    const outlineMat = createOutlineMaterial(0.038, 0x0a0b0f);
    extraMaterials.push(outlineMat);

    const add = (parent: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(parent, parts, mainMat, outlineMat, outlineMeshes, geometriesToDispose);

    const addGlowOrb = (parent: THREE.Object3D, geo: THREE.BufferGeometry, pos: V3) => {
      const outGeo = createSmoothOutlineGeometry(geo);
      geometriesToDispose.push(geo, outGeo);
      const m = new THREE.Mesh(geo, glowMat);
      m.position.set(pos[0], pos[1], pos[2]);
      const o = new THREE.Mesh(outGeo, outlineMat);
      m.add(o);
      parent.add(m);
      outlineMeshes.push(o);
      return m;
    };

    const attachStdLimbs = (
      armCol: number,
      handCol: number,
      legCol: number,
      bootCol: number,
      armX = 0.40,
      legX = 0.17,
      hipY = 0.74,
      shoulderY = 1.40,
    ) => {
      const effHipY = Math.max(0.74, hipY);
      const effShoulderY = Math.max(1.36, shoulderY);
      leftArm.position.set(-armX, effShoulderY, 0);
      rightArm.position.set(armX, effShoulderY, 0);
      leftLeg.position.set(-legX, effHipY, 0);
      rightLeg.position.set(legX, effHipY, 0);
      bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
      add(leftArm, buildSculptedArmParts(pal.secondary, armCol, pal.accent, handCol, -1));
      add(rightArm, buildSculptedArmParts(pal.secondary, armCol, pal.accent, handCol, 1));
      add(leftLeg, buildSculptedLegParts(legCol, pal.accent, pal.secondary, bootCol));
      add(rightLeg, buildSculptedLegParts(legCol, pal.accent, pal.secondary, bootCol));
    };

    root.add(bodyPivot);
    bodyPivot.scale.setScalar(pal.scale);

    switch (characterId) {
      case 'Fox': {
        // SCULPTED MYTHIC FOX PYRO-RANGER (Hero Showcase Flagship!)
        add(bodyPivot, [
          // Sculpted hourglass heroic tunic & flared ranger skirt
          lathePart(
            [
              [0.48, 0.52],
              [0.42, 0.72],
              [0.31, 0.94],
              [0.39, 1.30],
              [0.35, 1.44],
              [0.24, 1.50],
            ],
            10,
            pal.secondary,
          ),
          // Gold-hemmed front tabard banner strip
          extrudePolyPart(
            [
              [-0.14, 0.48],
              [0.14, 0.48],
              [0.11, 0.86],
              [-0.11, 0.86],
            ],
            0.06,
            0.014,
            0x1c5939,
            [0, 0, 0.38],
            [-0.08, 0, 0],
          ),
          extrudePolyPart(
            [
              [-0.15, 0.45],
              [0.15, 0.45],
              [0.14, 0.52],
              [-0.14, 0.52],
            ],
            0.07,
            0.01,
            0xf5c542,
            [0, 0, 0.39],
            [-0.08, 0, 0],
          ),
          // Sculpted leather waist belt + forged brass buckle + hip potion pouch
          lathePart(
            [
              [0.34, 0.82],
              [0.37, 0.90],
              [0.34, 0.98],
            ],
            10,
            0x4a291a,
          ),
          box(0.18, 0.16, 0.11, 0xf5c542, [0, 0.90, 0.35]),
          octa(0.06, 0xff5a1f, [0, 0.90, 0.42]),
          box(0.16, 0.20, 0.14, 0x6b3e26, [-0.34, 0.82, 0.12], [0, 0.3, 0.12]),
          // Diagonal leather bandolier strap across chest
          box(0.11, 0.68, 0.44, 0x4a291a, [0, 1.18, 0.02], [0, 0, 0.62]),
          // Layered sculpted shoulder mantle & plush cream fur ruff collar (bottom-to-top for true outward Lathe normals!)
          lathePart(
            [
              [0.40, 1.24],
              [0.50, 1.32],
              [0.44, 1.46],
              [0.24, 1.54],
            ],
            10,
            0x2d784f,
          ),
          lathePart(
            [
              [0.22, 1.34],
              [0.32, 1.36],
              [0.36, 1.48],
              [0.20, 1.56],
            ],
            9,
            pal.accent,
            [0, 0.02, 0.06],
          ),
          // Gilded ranger collar brooch
          octa(0.095, 0xffd24c, [0, 1.40, 0.36]),
        ]);

        // Dramatic billowing split-tail ranger cape behind Fox!
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.44, -0.26);
        bodyPivot.add(capePivot);
        add(capePivot, buildSculptedCapeParts(0x1e5c3c, 0xf5c542, 0.86, 1.12));

        // Trimmer athletic Fox head proportions matching heroic Valheim/PS1 anatomy!
        headPivot.position.set(0, 1.56, 0.03);
        headPivot.scale.setScalar(0.86);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          // Smoother 14-segment sculpted fox cranium
          lathePart(
            [
              [0.14, 0.02],
              [0.34, 0.12],
              [0.41, 0.27],
              [0.36, 0.43],
              [0.24, 0.53],
              [0.08, 0.58],
            ],
            14,
            pal.primary,
            [0, 0, 0],
            undefined,
            [1.08, 1.0, 0.98],
          ),
          // Clean symmetric sweeping cream cheek tufts hugging lower jawline
          extrudePolyPart(
            [
              [0.0, 0.0],
              [0.02, 0.14],
              [-0.16, 0.16],
              [-0.22, 0.04],
            ],
            0.09,
            0.02,
            pal.accent,
            [-0.20, 0.10, 0.10],
            [0, -0.24, -0.26],
          ),
          extrudePolyPart(
            [
              [0.0, 0.0],
              [0.22, 0.04],
              [0.16, 0.16],
              [-0.02, 0.14],
            ],
            0.09,
            0.02,
            pal.accent,
            [0.20, 0.10, 0.10],
            [0, 0.24, 0.26],
          ),
          // Smooth tapered fox muzzle + clean cream muzzle-underbelly + dark glossy nose
          lathePart(
            [
              [0.21, 0.0],
              [0.16, 0.18],
              [0.105, 0.34],
              [0.055, 0.45],
            ],
            10,
            pal.primary,
            [0, 0.22, 0.20],
            [Math.PI * 0.52, 0, 0],
          ),
          lathePart(
            [
              [0.17, 0.0],
              [0.12, 0.16],
              [0.06, 0.34],
            ],
            8,
            pal.accent,
            [0, 0.15, 0.24],
            [Math.PI * 0.52, 0, 0],
          ),
          octa(0.064, 0x0b0a12, [0, 0.20, 0.65]),
          // Dramatic sculpted notched fox ears with cream inner fuzz & obsidian tips!
          extrudePolyPart(
            [
              [-0.14, 0.0],
              [0.12, 0.0],
              [0.04, 0.48],
              [-0.06, 0.34],
              [-0.12, 0.24],
            ],
            0.09,
            0.018,
            pal.primary,
            [-0.23, 0.44, -0.02],
            [0.08, -0.18, 0.28],
          ),
          extrudePolyPart(
            [
              [-0.07, 0.04],
              [0.06, 0.04],
              [0.02, 0.30],
            ],
            0.05,
            0.01,
            pal.accent,
            [-0.22, 0.46, 0.03],
            [0.08, -0.18, 0.28],
          ),
          cone(0.075, 0.20, 5, 0x100e18, [-0.34, 0.86, 0.0], [0.08, 0, 0.28]),
          extrudePolyPart(
            [
              [-0.12, 0.0],
              [0.14, 0.0],
              [0.12, 0.24],
              [0.06, 0.34],
              [-0.04, 0.48],
            ],
            0.09,
            0.018,
            pal.primary,
            [0.23, 0.44, -0.02],
            [0.08, 0.18, -0.28],
          ),
          extrudePolyPart(
            [
              [-0.06, 0.04],
              [0.07, 0.04],
              [-0.02, 0.30],
            ],
            0.05,
            0.01,
            pal.accent,
            [0.22, 0.46, 0.03],
            [0.08, 0.18, -0.28],
          ),
          cone(0.075, 0.20, 5, 0x100e18, [0.34, 0.86, 0.0], [0.08, 0, -0.28]),
          // Clean bold angled eyebrows + crisp glowing amber-gold irises proudly seated on face!
          box(0.16, 0.042, 0.07, 0x100b14, [-0.165, 0.385, 0.37], [0, 0.24, -0.24]),
          box(0.16, 0.042, 0.07, 0x100b14, [0.165, 0.385, 0.37], [0, -0.24, 0.24]),
          box(0.12, 0.105, 0.045, 0x0b0912, [-0.16, 0.315, 0.37], [0, 0.24, -0.06]),
          box(0.12, 0.105, 0.045, 0x0b0912, [0.16, 0.315, 0.37], [0, -0.24, 0.06]),
          box(0.082, 0.076, 0.052, 0xffd23f, [-0.155, 0.315, 0.38], [0, 0.24, 0]),
          box(0.082, 0.076, 0.052, 0xffd23f, [0.155, 0.315, 0.38], [0, -0.24, 0]),
          box(0.026, 0.062, 0.060, 0x0b0912, [-0.152, 0.315, 0.385], [0, 0.24, 0]),
          box(0.026, 0.062, 0.060, 0x0b0912, [0.152, 0.315, 0.385], [0, -0.24, 0]),
          box(0.026, 0.028, 0.065, 0xffffff, [-0.135, 0.334, 0.39]),
          box(0.026, 0.028, 0.065, 0xffffff, [0.175, 0.334, 0.39]),
        ];
        addHatParts(head, hatId, 0.60);
        add(headPivot, head);

        // Plush multi-segmented sweeping fox tail with cream flame-tip!
        tailPivot = new THREE.Group();
        tailPivot.position.set(0, 0.78, -0.34);
        bodyPivot.add(tailPivot);
        add(tailPivot, [
          lathePart(
            [
              [0.09, 0.0],
              [0.24, 0.30],
              [0.28, 0.56],
              [0.18, 0.80],
            ],
            8,
            pal.primary,
            [0, 0.02, -0.04],
            [-1.25, 0, 0],
          ),
          lathePart(
            [
              [0.20, 0.76],
              [0.16, 0.96],
              [0.02, 1.18],
            ],
            8,
            pal.accent,
            [0, 0.02, -0.04],
            [-1.25, 0, 0],
          ),
        ]);

        attachStdLimbs(pal.primary, pal.boots, 0x264d36, pal.boots, 0.41, 0.17, 0.74, 1.40);

        // Fire Staff cleanly held in Fox's athletic hand!
        weaponPivot.position.set(0.04, -0.58, 0.14);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          // Tapered carved hardwood staff with bronze wrap collars
          lathePart(
            [
              [0.03, -0.68],
              [0.06, -0.58],
              [0.048, 0.15],
              [0.068, 1.12],
              [0.11, 1.24],
              [0.06, 1.32],
            ],
            8,
            pal.weapon,
            [0, 0.25, 0.14],
            [0.20, 0, 0],
          ),
          // Bronze grip rings & pommel cap
          cyl(0.072, 0.072, 0.16, 8, 0xd49b2a, [0, 0.25, 0.14], [0.20, 0, 0]),
          cyl(0.095, 0.075, 0.14, 8, 0xf5c542, [0, 1.34, 0.36], [0.20, 0, 0]),
          // Sculpted twin gilded crescent cradle horns holding the fire orb!
          extrudePolyPart(
            [
              [-0.06, 0.0],
              [0.06, 0.0],
              [0.28, 0.26],
              [0.18, 0.56],
              [0.10, 0.46],
              [0.18, 0.26],
            ],
            0.06,
            0.012,
            0xffcb3b,
            [0, 1.36, 0.36],
            [0.20, 0, 0],
          ),
          extrudePolyPart(
            [
              [0.06, 0.0],
              [-0.06, 0.0],
              [-0.28, 0.26],
              [-0.18, 0.56],
              [-0.10, 0.46],
              [-0.18, 0.26],
            ],
            0.06,
            0.012,
            0xffcb3b,
            [0, 1.36, 0.36],
            [0.20, 0, 0],
          ),
          // Orbiting golden arcane halo ring
          torus(0.28, 0.032, 6, 14, 0xffe46b, [0, 1.62, 0.42], [0.20, 0.4, 0]),
        ]);
        addGlowOrb(weaponPivot, new THREE.OctahedronGeometry(0.18, 1), [0, 1.62, 0.42]);
        break;
      }

      case 'Calcium': {
        hoverMode = 'skateboard';
        const deckH = 0.32;
        boardPivot = new THREE.Group();
        boardPivot.position.set(0, 0.14, 0);
        bodyPivot.add(boardPivot);
        add(boardPivot, [
          extrudePolyPart(
            [
              [-0.32, -0.68],
              [0.32, -0.68],
              [0.38, -0.45],
              [0.38, 0.45],
              [0.32, 0.68],
              [0.0, 0.86],
              [-0.32, 0.68],
              [-0.38, 0.45],
              [-0.38, -0.45],
            ],
            0.08,
            0.016,
            0x1b2136,
            [0, 0.15, 0],
            [Math.PI * 0.5, 0, 0],
          ),
          box(0.46, 0.095, 1.38, pal.accent, [0, 0.155, 0]),
          box(0.20, 0.105, 1.36, 0x3ad5ff, [0, 0.16, 0]),
          box(0.64, 0.08, 0.12, 0xc8d6e8, [0, 0.05, 0.48]),
          box(0.64, 0.08, 0.12, 0xc8d6e8, [0, 0.05, -0.48]),
        ]);
        const wheelCoords: V3[] = [[-0.36, 0.04, 0.48], [0.36, 0.04, 0.48], [-0.36, 0.04, -0.48], [0.36, 0.04, -0.48]];
        for (const wc of wheelCoords) {
          const wG = new THREE.Group();
          wG.position.set(wc[0], wc[1], wc[2]);
          boardPivot.add(wG);
          add(wG, [
            cyl(0.115, 0.115, 0.13, 10, 0xffe042, undefined, [0, 0, Math.PI * 0.5]),
            cyl(0.055, 0.055, 0.145, 8, 0x1e2536, undefined, [0, 0, Math.PI * 0.5]),
          ]);
          wheelPivots.push(wG);
        }
        add(bodyPivot, [
          cyl(0.08, 0.095, 0.78, 7, pal.primary, [0, deckH + 1.0, -0.04]),
          box(0.56, 0.095, 0.34, pal.primary, [0, deckH + 1.26, 0.02]),
          box(0.50, 0.09, 0.31, pal.primary, [0, deckH + 1.10, 0.02]),
          box(0.42, 0.085, 0.27, pal.primary, [0, deckH + 0.94, 0.02]),
          box(0.32, 0.44, 0.22, 0x151826, [0, deckH + 1.10, 0.01]),
          // Sculpted tattered skater vest & belt
          lathePart(
            [
              [0.34, deckH + 0.58],
              [0.30, deckH + 0.78],
              [0.36, deckH + 0.84],
            ],
            8,
            pal.secondary,
          ),
          box(0.48, 0.08, 0.35, pal.accent, [0, deckH + 0.80, 0]),
        ]);
        // Glowing cyan soul-core inside Calcium's ribcage!
        addGlowOrb(bodyPivot, new THREE.OctahedronGeometry(0.14, 0), [0, deckH + 1.12, 0.06]);

        // Billowing scarlet reaper-skater scarf behind Calcium!
        capePivot = new THREE.Group();
        capePivot.position.set(0, deckH + 1.38, -0.22);
        bodyPivot.add(capePivot);
        add(capePivot, buildSculptedCapeParts(pal.accent, 0xffd23f, 0.58, 0.96));

        // Sculpted anatomical white skeleton skull with cool dark sunglasses (shot_03)!
        headPivot.position.set(0, deckH + 1.46, 0.02);
        headPivot.scale.setScalar(0.88);
        bodyPivot.add(headPivot);
        const skull: ColoredPartSpec[] = [
          lathePart(
            [
              [0.16, 0.06],
              [0.32, 0.18],
              [0.35, 0.34],
              [0.28, 0.50],
              [0.12, 0.58],
            ],
            10,
            pal.primary,
            [0, 0, 0],
            undefined,
            [1.02, 1.0, 1.04],
          ),
          box(0.28, 0.15, 0.24, pal.primary, [0, 0.04, 0.16]),
          box(0.22, 0.045, 0.06, 0x12151f, [0, 0.04, 0.28]),
          cone(0.045, 0.08, 3, 0x12151f, [0, 0.17, 0.33]),
          // Cool dark skater sunglasses!
          box(0.50, 0.14, 0.10, 0x0b0e14, [0, 0.28, 0.31]),
          box(0.17, 0.09, 0.11, 0x1b2333, [-0.12, 0.28, 0.32]),
          box(0.17, 0.09, 0.11, 0x1b2333, [0.12, 0.28, 0.32]),
          box(0.045, 0.035, 0.12, 0xffffff, [-0.08, 0.30, 0.325]),
          box(0.045, 0.035, 0.12, 0xffffff, [0.16, 0.30, 0.325]),
        ];
        addHatParts(skull, hatId, 0.60);
        add(headPivot, skull);

        leftArm.position.set(-0.38, deckH + 1.28, 0);
        rightArm.position.set(0.38, deckH + 1.28, 0);
        leftLeg.position.set(-0.18, deckH + 0.6, 0.22);
        rightLeg.position.set(0.18, deckH + 0.6, -0.22);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cyl(0.07, 0.06, 0.48, 7, pal.primary, [0, -0.24, 0]), octa(0.10, pal.primary, [0, -0.5, 0])]);
        add(rightArm, [cyl(0.07, 0.06, 0.48, 7, pal.primary, [0, -0.24, 0]), octa(0.10, pal.primary, [0, -0.5, 0])]);
        add(leftLeg, buildSculptedLegParts(pal.primary, pal.accent, pal.secondary, pal.boots));
        add(rightLeg, buildSculptedLegParts(pal.primary, pal.accent, pal.secondary, pal.boots));

        weaponPivot.position.set(0.06, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.075, 0.075, 0.78, 7, pal.weapon, [0, 0.26, 0.1], [0.4, 0, 0]),
          dodec(0.12, pal.weapon, [-0.08, 0.60, 0.25]),
          dodec(0.12, pal.weapon, [0.08, 0.60, 0.25]),
        ]);
        break;
      }

      case 'SirOofie': {
        // HEROIC SILVER-STEEL PLATE KNIGHT (athletic proportions, dark undersuit joints, silver helm & broadsword!)
        add(bodyPivot, [
          // Tapered medieval silver-steel cuirass & hip fauld
          lathePart(
            [
              [0.36, 0.72],
              [0.29, 0.92],
              [0.36, 1.24],
              [0.42, 1.48],
              [0.24, 1.58],
            ],
            8,
            pal.primary,
          ),
          // Dark leather waist belt & iron buckle
          lathePart([[0.32, 0.86], [0.34, 0.93], [0.32, 0.99]], 8, 0x2b2420),
          box(0.14, 0.13, 0.09, pal.accent, [0, 0.93, 0.32]),
          // Articulated front armored waist tasset lames
          extrudePolyPart(
            [[-0.17, 0], [0.17, 0], [0.14, -0.34], [0, -0.40], [-0.14, -0.34]],
            0.05,
            0.01,
            pal.primary,
            [0, 0.88, 0.30],
          ),
          // Clean layered curved steel pauldrons
          dodec(0.19, pal.primary, [-0.42, 1.46, 0], undefined, [1.05, 0.85, 1.0]),
          dodec(0.19, pal.primary, [0.42, 1.46, 0], undefined, [1.05, 0.85, 1.0]),
        ]);
        headPivot.position.set(0, 1.60, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          // Sleek rounded medieval silver great-helm / barbute with crisp dark eye slit!
          lathePart([[0.22, 0.0], [0.27, 0.14], [0.28, 0.34], [0.24, 0.48], [0.12, 0.56]], 8, pal.primary),
          box(0.34, 0.075, 0.10, 0x0b0e14, [0, 0.30, 0.25]),
          box(0.06, 0.20, 0.09, 0x0b0e14, [0, 0.19, 0.25]),
        ];
        addHatParts(head, hatId, 0.58);
        add(headPivot, head);

        attachStdLimbs(pal.primary, 0x3b4454, pal.primary, pal.boots, 0.40, 0.17, 0.74, 1.42);

        // Crisp Knightly Steel Broadsword with golden crossguard & pommel!
        weaponPivot.position.set(0.04, -0.58, 0.14);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.045, 0.045, 0.36, 7, 0x3a2618, [0, -0.02, 0.08], [0.38, 0, 0]),
          octa(0.085, pal.accent, [0, -0.20, 0.01]),
          extrudePolyPart(
            [[-0.30, 0.04], [0.30, 0.04], [0.22, -0.06], [0, -0.09], [-0.22, -0.06]],
            0.09,
            0.014,
            pal.accent,
            [0, 0.18, 0.15],
            [0.38, 0, 0],
          ),
          extrudePolyPart(
            [[-0.12, 0.0], [0.12, 0.0], [0.095, 1.28], [0.0, 1.62], [-0.095, 1.28]],
            0.05,
            0.016,
            pal.weapon,
            [0, 0.20, 0.16],
            [0.38, 0, 0],
          ),
        ]);
        break;
      }

      case 'Megachad': {
        add(bodyPivot, [
          cyl(0.66, 0.36, 0.96, 6, pal.primary, [0, 1.18, 0]),
          box(0.88, 0.44, 0.56, pal.primary, [0, 1.4, 0.08]),
          cyl(0.4, 0.42, 0.34, 6, pal.secondary, [0, 0.68, 0]),
          cyl(0.42, 0.42, 0.14, 8, pal.accent, [0, 0.84, 0]),
          octa(0.16, 0xfff49e, [0, 0.84, 0.4]),
        ]);
        headPivot.position.set(0, 1.72, 0.04);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          box(0.44, 0.48, 0.44, pal.skin, [0, 0.28, 0]),
          box(0.36, 0.18, 0.22, pal.skin, [0, 0.08, 0.18]),
          box(0.48, 0.24, 0.58, 0x1a1e2b, [0, 0.58, 0.08], [-0.14, 0, 0]),
          box(0.5, 0.15, 0.12, 0x0d1018, [0, 0.34, 0.24]),
          box(0.14, 0.05, 0.13, 0x52f2ff, [-0.12, 0.37, 0.245]),
          box(0.14, 0.05, 0.13, 0x52f2ff, [0.12, 0.37, 0.245]),
          box(0.22, 0.06, 0.05, 0xffffff, [0, 0.16, 0.24]),
        ];
        addHatParts(head, hatId, 0.72);
        add(headPivot, head);

        leftArm.position.set(-0.74, 1.48, 0);
        rightArm.position.set(0.74, 1.48, 0);
        leftLeg.position.set(-0.24, 0.56, 0);
        rightLeg.position.set(0.24, 0.56, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [
          dodec(0.26, pal.primary, [0, 0, 0]),
          cyl(0.19, 0.16, 0.52, 6, pal.primary, [-0.04, -0.32, 0.06], [-0.35, 0, 0.12]),
          box(0.24, 0.22, 0.24, pal.accent, [-0.05, -0.58, 0.18]),
        ]);
        add(rightArm, [
          dodec(0.26, pal.primary, [0, 0, 0]),
          cyl(0.19, 0.16, 0.52, 6, pal.primary, [0.04, -0.32, 0.06], [-0.35, 0, -0.12]),
          box(0.24, 0.22, 0.24, pal.accent, [0.05, -0.58, 0.18]),
        ]);
        add(leftLeg, [cyl(0.18, 0.14, 0.42, 6, pal.primary, [0, -0.2, 0]), box(0.28, 0.2, 0.36, pal.boots, [0, -0.46, 0.06])]);
        add(rightLeg, [cyl(0.18, 0.14, 0.42, 6, pal.primary, [0, -0.2, 0]), box(0.28, 0.2, 0.36, pal.boots, [0, -0.46, 0.06])]);
        rightArm.add(weaponPivot);

        const auraGeo = new THREE.TorusGeometry(1.42, 0.085, 6, 18);
        geometriesToDispose.push(auraGeo);
        const auraMat = createMkToonMaterial({
          color: 0xffd84d,
          emissive: 0xffb703,
          emissiveIntensity: 1.15,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        });
        toonMaterials.push(auraMat);
        auraRing = new THREE.Mesh(auraGeo, auraMat);
        auraRing.rotation.x = Math.PI * 0.5;
        auraRing.position.y = 0.26;
        root.add(auraRing);
        break;
      }

      case 'Amog': {
        // Mushroom Plague Cap alchemist with spore pack, potion bandolier & Poison Flask!
        add(bodyPivot, [
          cone(0.48, 0.96, 7, pal.secondary, [0, 1.0, 0]),
          box(0.68, 0.1, 0.48, 0x5c3c24, [0, 1.12, 0.08], [0, 0, 0.35]),
          cyl(0.07, 0.07, 0.2, 6, pal.accent, [-0.14, 1.18, 0.32]),
          cyl(0.07, 0.07, 0.2, 6, 0x4dff77, [0.14, 1.06, 0.32]),
          // Spore canister backpack
          cyl(0.2, 0.22, 0.58, 7, 0x45355e, [0, 1.18, -0.38]),
          dodec(0.18, pal.accent, [0, 1.5, -0.38]),
        ]);
        headPivot.position.set(0, 1.48, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          // Shadowed plague-mask head under overhanging cap
          cyl(0.24, 0.28, 0.36, 7, 0x1a1524, [0, 0.18, 0]),
          box(0.11, 0.09, 0.07, 0xd8ff3b, [-0.11, 0.22, 0.24]),
          box(0.11, 0.09, 0.07, 0xd8ff3b, [0.11, 0.22, 0.24]),
          // Iconic huge spotted mushroom plague cap!
          cyl(0.66, 0.62, 0.1, 8, 0xe8e0c5, [0, 0.36, 0]),
          cone(0.76, 0.58, 8, pal.primary, [0, 0.66, 0]),
          dodec(0.14, pal.accent, [-0.36, 0.58, 0.34], undefined, [1.0, 0.65, 1.0]),
          dodec(0.15, pal.accent, [0.34, 0.62, 0.28], undefined, [1.0, 0.65, 1.0]),
          dodec(0.13, pal.accent, [0.02, 0.72, -0.34], undefined, [1.0, 0.65, 1.0]),
          dodec(0.12, 0xf2ebd9, [-0.28, 0.7, -0.18], undefined, [1.0, 0.65, 1.0]),
        ];
        addHatParts(head, hatId, 0.94);
        add(headPivot, head);
        attachStdLimbs(pal.secondary, pal.skin, pal.secondary, pal.boots, 0.44, 0.18, 0.56, 1.28);
        weaponPivot.position.set(0.06, -0.44, 0.2);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.08, 0.09, 0.22, 6, 0x5c3c24, [0, 0.22, 0.1]),
          dodec(0.24, pal.weapon, [0, 0.02, 0.1]),
        ]);
        addGlowOrb(weaponPivot, new THREE.OctahedronGeometry(0.12, 0), [0, 0.36, 0.1]);
        break;
      }

      case 'Athena': {
        // Crested Greek Hoplite Helm + Golden-Cyan Aegis Shield on left arm + Spear!
        add(bodyPivot, [
          cyl(0.35, 0.44, 0.88, 7, pal.primary, [0, 1.04, 0]),
          box(0.68, 0.48, 0.44, pal.accent, [0, 1.22, 0.04]),
          box(0.24, 0.34, 0.08, pal.secondary, [0, 1.22, 0.28]),
          cyl(0.42, 0.44, 0.14, 8, pal.accent, [0, 0.76, 0]),
          dodec(0.22, pal.accent, [-0.46, 1.38, 0]),
          dodec(0.22, pal.accent, [0.46, 1.38, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.34, pal.skin, [0, 0.26, 0]),
          // Corinthian crested gold helm
          cyl(0.36, 0.38, 0.42, 8, pal.accent, [0, 0.38, -0.02]),
          box(0.1, 0.24, 0.1, pal.accent, [0, 0.26, 0.35]), // noseguard
          box(0.09, 0.09, 0.06, 0x162038, [-0.12, 0.28, 0.32]),
          box(0.09, 0.09, 0.06, 0x162038, [0.12, 0.28, 0.32]),
          // Dramatic sweeping azure horsehair crest!
          box(0.12, 0.36, 0.64, pal.secondary, [0, 0.74, -0.04], [-0.15, 0, 0]),
          cone(0.14, 0.42, 5, 0x62c4ff, [0, 0.62, -0.46], [-1.1, 0, 0]),
        ];
        addHatParts(head, hatId, 0.68);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.44, -0.26);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.76, 1.05, 0.07, pal.secondary, [0, -0.5, -0.06], [0.14, 0, 0]),
          box(0.78, 0.11, 0.08, pal.accent, [0, -0.98, -0.14], [0.14, 0, 0]),
        ]);
        attachStdLimbs(pal.skin, pal.accent, pal.primary, pal.boots, 0.48, 0.19, 0.64, 1.34);
        // Iconic Aegis round buckler shield on leftArm!
        add(leftArm, [
          cyl(0.56, 0.56, 0.1, 8, pal.accent, [-0.18, -0.34, 0.18], [0, 0, Math.PI * 0.5]),
          cyl(0.42, 0.42, 0.13, 8, pal.secondary, [-0.2, -0.34, 0.18], [0, 0, Math.PI * 0.5]),
          octa(0.16, 0x70e4ff, [-0.27, -0.34, 0.18]),
        ]);
        weaponPivot.position.set(0.06, -0.44, 0.16);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.045, 0.05, 2.05, 6, 0x8f562e, [0, 0.55, 0.18], [0.25, 0, 0]),
          cone(0.14, 0.48, 4, pal.weapon, [0, 1.65, 0.45], [0.25, 0, 0]),
        ]);
        break;
      }

      case 'Bandit': {
        // Deep hood + crimson bandana + twin curved daggers!
        add(bodyPivot, [
          cyl(0.32, 0.4, 0.84, 7, pal.primary, [0, 1.04, 0]),
          box(0.68, 0.12, 0.46, 0x5c361d, [0, 1.1, 0.02], [0, 0, -0.45]),
          box(0.44, 0.14, 0.44, pal.secondary, [0, 0.72, 0]),
          dodec(0.22, pal.primary, [-0.46, 1.36, 0]),
        ]);
        headPivot.position.set(0, 1.52, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.37, pal.primary, [0, 0.28, -0.02]),
          cone(0.34, 0.52, 5, pal.primary, [0, 0.44, -0.28], [-0.7, 0, 0]),
          box(0.36, 0.34, 0.24, 0x14121f, [0, 0.24, 0.2]),
          box(0.38, 0.18, 0.2, pal.secondary, [0, 0.14, 0.26]), // crimson rogue mask
          box(0.11, 0.07, 0.07, pal.accent, [-0.11, 0.3, 0.34]),
          box(0.11, 0.07, 0.07, pal.accent, [0.11, 0.3, 0.34]),
        ];
        addHatParts(head, hatId, 0.64);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.4, -0.24);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.7, 0.86, 0.06, pal.secondary, [0, -0.42, -0.06], [0.2, 0, 0]),
          cone(0.18, 0.34, 4, pal.secondary, [-0.22, -0.92, -0.14], [Math.PI, 0, 0.1]),
          cone(0.18, 0.38, 4, pal.secondary, [0.22, -0.94, -0.14], [Math.PI, 0, -0.1]),
        ]);
        attachStdLimbs(pal.primary, 0x262030, pal.primary, pal.boots, 0.42, 0.18, 0.62, 1.32);
        // Twin curved daggers (left hand + right hand weaponPivot!)
        add(leftArm, [
          box(0.08, 0.62, 0.12, pal.weapon, [0, -0.52, 0.34], [1.25, 0, 0.15]),
          box(0.24, 0.07, 0.08, pal.accent, [0, -0.52, 0.12]),
        ]);
        weaponPivot.position.set(0.04, -0.48, 0.12);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          box(0.08, 0.66, 0.12, pal.weapon, [0, 0.02, 0.28], [1.25, 0, -0.15]),
          box(0.24, 0.07, 0.08, pal.accent, [0, 0, 0.04]),
        ]);
        break;
      }

      case 'Birdo': {
        // Winged azure avian hero with golden beak, aviator scarf & articulated gliding wings!
        add(bodyPivot, [
          dodec(0.46, pal.primary, [0, 1.02, 0], undefined, [0.95, 1.15, 0.95]),
          dodec(0.36, pal.secondary, [0, 1.0, 0.18], undefined, [0.82, 0.95, 0.6]),
          cyl(0.36, 0.38, 0.14, 7, 0xff4d5e, [0, 1.44, 0.02]), // aviator scarf
        ]);
        headPivot.position.set(0, 1.54, 0.04);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.36, pal.primary, [0, 0.24, 0]),
          // Bright golden curved beak!
          cone(0.16, 0.46, 5, pal.accent, [0, 0.18, 0.44], [Math.PI * 0.56, 0, 0]),
          cone(0.11, 0.26, 4, 0xe09018, [0, 0.1, 0.36], [Math.PI * 0.58, 0, 0]),
          // Head feather crest plumes
          cone(0.1, 0.36, 4, pal.primary, [0, 0.62, -0.08], [-0.45, 0, 0]),
          cone(0.08, 0.28, 4, pal.secondary, [0, 0.56, -0.22], [-0.75, 0, 0]),
          // Bright bird eyes
          box(0.11, 0.11, 0.07, 0x121622, [-0.18, 0.3, 0.28]),
          box(0.05, 0.05, 0.08, 0xffffff, [-0.16, 0.33, 0.29]),
          box(0.11, 0.11, 0.07, 0x121622, [0.18, 0.3, 0.28]),
          box(0.05, 0.05, 0.08, 0xffffff, [0.2, 0.33, 0.29]),
        ];
        addHatParts(head, hatId, 0.58);
        add(headPivot, head);

        // Articulated feathered wings on back/shoulders (flare wide when gliding!)
        leftWingPivot = new THREE.Group();
        leftWingPivot.position.set(-0.34, 1.24, -0.14);
        rightWingPivot = new THREE.Group();
        rightWingPivot.position.set(0.34, 1.24, -0.14);
        bodyPivot.add(leftWingPivot, rightWingPivot);
        add(leftWingPivot, [
          box(0.86, 0.44, 0.1, pal.primary, [-0.45, 0.05, -0.05], [0, 0.15, 0.18]),
          cone(0.16, 0.48, 4, pal.secondary, [-0.95, 0.16, -0.08], [0, 0, 1.35]),
          cone(0.14, 0.42, 4, pal.secondary, [-0.84, -0.1, -0.08], [0, 0, 1.7]),
        ]);
        add(rightWingPivot, [
          box(0.86, 0.44, 0.1, pal.primary, [0.45, 0.05, -0.05], [0, -0.15, -0.18]),
          cone(0.16, 0.48, 4, pal.secondary, [0.95, 0.16, -0.08], [0, 0, -1.35]),
          cone(0.14, 0.42, 4, pal.secondary, [0.84, -0.1, -0.08], [0, 0, -1.7]),
        ]);

        // Tail feathers
        tailPivot = new THREE.Group();
        tailPivot.position.set(0, 0.78, -0.34);
        bodyPivot.add(tailPivot);
        add(tailPivot, [
          box(0.36, 0.1, 0.54, pal.primary, [0, 0.05, -0.25], [0.2, 0, 0]),
          box(0.24, 0.08, 0.48, pal.secondary, [0, 0.1, -0.32], [0.25, 0, 0]),
        ]);

        leftArm.position.set(-0.42, 1.26, 0.06);
        rightArm.position.set(0.42, 1.26, 0.06);
        leftLeg.position.set(-0.18, 0.58, 0);
        rightLeg.position.set(0.18, 0.58, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cyl(0.09, 0.07, 0.44, 6, pal.primary, [0, -0.2, 0])]);
        add(rightArm, [cyl(0.09, 0.07, 0.44, 6, pal.primary, [0, -0.2, 0])]);
        add(leftLeg, [cyl(0.07, 0.06, 0.44, 5, pal.boots, [0, -0.2, 0]), box(0.24, 0.08, 0.34, pal.boots, [0, -0.46, 0.08])]);
        add(rightLeg, [cyl(0.07, 0.06, 0.44, 5, pal.boots, [0, -0.2, 0]), box(0.24, 0.08, 0.34, pal.boots, [0, -0.46, 0.08])]);

        weaponPivot.position.set(0.04, -0.38, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [cyl(0.045, 0.05, 1.25, 6, pal.secondary, [0, 0.25, 0.14], [0.3, 0, 0])]);
        addGlowOrb(weaponPivot, new THREE.ConeGeometry(0.18, 0.42, 6), [0, 0.92, 0.32]);
        break;
      }

      case 'Bush': {
        // Leafy low-poly Ghillie Sniper with tactical scope goggles & long Sniper Rifle!
        add(bodyPivot, [
          dodec(0.56, pal.primary, [0, 1.02, 0], undefined, [1.08, 1.05, 1.0]),
          dodec(0.38, 0x5cc443, [-0.36, 1.22, 0.16]),
          dodec(0.38, 0x38852b, [0.36, 1.18, -0.14]),
          dodec(0.36, pal.accent, [0.05, 0.86, 0.32], undefined, [1.1, 0.7, 0.7]),
          dodec(0.34, 0x357d29, [0, 1.12, -0.36]),
        ]);
        headPivot.position.set(0, 1.48, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.46, pal.primary, [0, 0.28, 0], undefined, [1.1, 0.95, 1.08]),
          dodec(0.28, 0x6cd44a, [-0.26, 0.46, 0.12]),
          dodec(0.26, 0x35822a, [0.28, 0.44, -0.08]),
          dodec(0.22, pal.accent, [0, 0.58, 0.05]),
          // Peeking dark visor + bright yellow tactical sniper goggles!
          box(0.36, 0.16, 0.12, 0x151a24, [0, 0.26, 0.38]),
          cyl(0.08, 0.08, 0.14, 6, 0xffd23f, [-0.11, 0.26, 0.44], [Math.PI * 0.5, 0, 0]),
          cyl(0.08, 0.08, 0.14, 6, 0x70ff98, [0.11, 0.26, 0.44], [Math.PI * 0.5, 0, 0]),
        ];
        addHatParts(head, hatId, 0.7);
        add(headPivot, head);
        attachStdLimbs(pal.primary, pal.secondary, pal.secondary, pal.boots, 0.48, 0.2, 0.58, 1.28);
        weaponPivot.position.set(0.06, -0.4, 0.28);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          box(0.13, 0.18, 0.92, pal.secondary, [0, 0, 0.15]),
          cyl(0.05, 0.05, 1.55, 6, pal.weapon, [0, 0.04, 0.95], [Math.PI * 0.5, 0, 0]),
          cyl(0.06, 0.06, 0.42, 6, 0x262f3b, [0, 0.18, 0.48], [Math.PI * 0.5, 0, 0]),
        ]);
        addGlowOrb(weaponPivot, new THREE.BoxGeometry(0.07, 0.07, 0.16), [0, 0.18, 0.72]);
        break;
      }

      case 'SirChadwell': {
        // Dark Horned Cursed Knight w/ sweeping obsidian horns, purple cape & Corrupted Greatsword!
        add(bodyPivot, [
          box(0.86, 0.88, 0.56, pal.primary, [0, 1.08, 0]),
          box(0.24, 0.5, 0.1, pal.accent, [0, 1.12, 0.29]),
          dodec(0.32, pal.secondary, [-0.54, 1.42, 0]),
          cone(0.12, 0.38, 4, pal.accent, [-0.66, 1.66, 0], [0, 0, 0.45]),
          dodec(0.32, pal.secondary, [0.54, 1.42, 0]),
          cone(0.12, 0.38, 4, pal.accent, [0.66, 1.66, 0], [0, 0, -0.45]),
        ]);
        headPivot.position.set(0, 1.56, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          cyl(0.34, 0.38, 0.6, 7, pal.secondary, [0, 0.3, 0]),
          box(0.46, 0.1, 0.1, 0x0c0814, [0, 0.32, 0.33]),
          box(0.12, 0.07, 0.08, pal.accent, [-0.12, 0.32, 0.36]),
          box(0.12, 0.07, 0.08, pal.accent, [0.12, 0.32, 0.36]),
          // Huge sweeping cursed obsidian horns!
          cone(0.13, 0.54, 5, 0x160f24, [-0.36, 0.62, 0.04], [0.22, 0, 0.78]),
          cone(0.09, 0.42, 5, pal.accent, [-0.58, 0.88, 0.12], [0.12, 0, 0.22]),
          cone(0.13, 0.54, 5, 0x160f24, [0.36, 0.62, 0.04], [0.22, 0, -0.78]),
          cone(0.09, 0.42, 5, pal.accent, [0.58, 0.88, 0.12], [0.12, 0, -0.22]),
        ];
        addHatParts(head, hatId, 0.64);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.44, -0.3);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.86, 1.15, 0.08, pal.secondary, [0, -0.55, -0.06], [0.18, 0, 0]),
          box(0.88, 0.12, 0.09, pal.accent, [0, -1.08, -0.16], [0.18, 0, 0]),
        ]);
        attachStdLimbs(pal.primary, pal.secondary, pal.primary, pal.boots, 0.56, 0.22, 0.64, 1.34);
        weaponPivot.position.set(0.06, -0.46, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.06, 0.06, 0.44, 6, pal.secondary, [0, -0.04, 0.08], [0.35, 0, 0]),
          box(0.68, 0.14, 0.18, pal.secondary, [0, 0.18, 0.16], [0.35, 0, 0]),
          box(0.32, 1.62, 0.1, 0x2a1842, [0, 1.0, 0.46], [0.35, 0, 0]),
          box(0.12, 1.5, 0.13, pal.weapon, [0, 1.0, 0.46], [0.35, 0, 0]),
          cone(0.22, 0.46, 4, pal.weapon, [0, 1.9, 0.78], [0.35, Math.PI * 0.25, 0]),
        ]);
        break;
      }

      case 'Cl4nk': {
        // SLEEK COBALT-BLUE COWBOY GUNSLINGER AUTOMATON (wide brown cowboy hat, fluttering black cape, boots & twin revolvers!)
        add(bodyPivot, [
          // Athletic tapered royal-blue automaton torso + silver chest rib-core
          lathePart(
            [
              [0.30, 0.74],
              [0.24, 0.96],
              [0.34, 1.32],
              [0.38, 1.48],
              [0.20, 1.56],
            ],
            8,
            pal.primary,
          ),
          box(0.34, 0.30, 0.08, 0x9ecbff, [0, 1.24, 0.30]),
          // Cowboy leather gunbelt + gleaming gold buckle + hip holster!
          lathePart([[0.30, 0.84], [0.32, 0.92], [0.30, 0.98]], 8, pal.skin),
          box(0.15, 0.13, 0.09, 0xf5c542, [0, 0.91, 0.30]),
          box(0.14, 0.26, 0.18, pal.skin, [-0.30, 0.78, 0.06], [0.18, 0, 0.14]),
          // Metallic cyan-blue shoulder joints
          dodec(0.15, pal.accent, [-0.38, 1.42, 0]),
          dodec(0.15, pal.accent, [0.38, 1.42, 0]),
        ]);
        headPivot.position.set(0, 1.56, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          // Sleek cobalt robotic head + glowing sky-cyan eye visor
          lathePart([[0.16, 0.0], [0.24, 0.12], [0.26, 0.28], [0.22, 0.44]], 8, pal.primary),
          box(0.32, 0.10, 0.08, 0x0d1526, [0, 0.26, 0.24]),
          box(0.26, 0.06, 0.09, pal.accent, [0, 0.26, 0.25]),
          // Iconic Wide-Brimmed Leather Cowboy Hat!
          cyl(0.56, 0.58, 0.055, 10, pal.skin, [0, 0.42, 0.0], [0.06, 0, 0]),
          cyl(0.24, 0.30, 0.26, 8, pal.skin, [0, 0.56, -0.02], [0.06, 0, 0]),
          cyl(0.31, 0.31, 0.065, 8, 0x261710, [0, 0.46, -0.01], [0.06, 0, 0]),
          box(0.09, 0.06, 0.05, 0xf5c542, [0, 0.46, 0.30]),
        ];
        addHatParts(head, hatId, 0.72);
        add(headPivot, head);

        // Fluttering deep-charcoal outlaw cape / gunslinger poncho!
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.46, -0.24);
        bodyPivot.add(capePivot);
        add(capePivot, buildSculptedCapeParts(0x131720, 0x242b38, 0.76, 0.92));

        attachStdLimbs(pal.primary, 0x1d2536, pal.primary, pal.boots, 0.39, 0.16, 0.74, 1.42);

        // Twin Gunslinger Revolvers (right hand drawn + left hand secondary iron!)
        add(leftArm, [
          box(0.09, 0.20, 0.12, pal.skin, [0, -0.60, 0.14]),
          cyl(0.085, 0.085, 0.20, 6, pal.weapon, [0, -0.48, 0.28], [Math.PI * 0.5, 0, 0]),
          box(0.08, 0.10, 0.44, 0x364152, [0, -0.46, 0.52]),
        ]);
        weaponPivot.position.set(0.04, -0.58, 0.14);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          box(0.09, 0.20, 0.12, pal.skin, [0, -0.04, 0]),
          cyl(0.09, 0.09, 0.22, 6, pal.weapon, [0, 0.10, 0.16], [Math.PI * 0.5, 0, 0]),
          box(0.08, 0.11, 0.52, 0x364152, [0, 0.13, 0.44]),
        ]);
        break;
      }

      case 'Dicehead': {
        // Dapper gambler suit + GIANT tumbling D6 CUBE HEAD with real 3D pips on ALL 6 faces!
        add(bodyPivot, [
          box(0.7, 0.84, 0.44, pal.primary, [0, 1.04, 0]),
          box(0.24, 0.54, 0.08, 0xffffff, [0, 1.18, 0.22]),
          cone(0.09, 0.42, 4, pal.accent, [0, 1.08, 0.26], [Math.PI, 0, 0]), // golden tie
          box(0.74, 0.12, 0.48, pal.secondary, [0, 0.68, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0);
        bodyPivot.add(headPivot);
        const half = 0.34;
        const cy = 0.38;
        const head: ColoredPartSpec[] = [
          box(half * 2, half * 2, half * 2, pal.skin, [0, cy, 0]),
        ];
        // All 6 faces with genuine D6 pips (opposite faces sum to 7!)
        addDicePipCluster(head, 'front', 6, half, cy);
        addDicePipCluster(head, 'back', 1, half, cy);
        addDicePipCluster(head, 'top', 5, half, cy);
        addDicePipCluster(head, 'bottom', 2, half, cy);
        addDicePipCluster(head, 'right', 3, half, cy);
        addDicePipCluster(head, 'left', 4, half, cy);
        addHatParts(head, hatId, cy + half + 0.02);
        add(headPivot, head);

        attachStdLimbs(pal.primary, 0xffffff, pal.secondary, pal.boots, 0.46, 0.19, 0.62, 1.34);
        weaponPivot.position.set(0.05, -0.44, 0.24);
        rightArm.add(weaponPivot);
        addGlowOrb(weaponPivot, new THREE.BoxGeometry(0.32, 0.32, 0.32), [0, 0.1, 0.12]);
        break;
      }

      case 'Monke': {
        // ICONIC MUSCULAR GORILLA-APE HERO: broad dark-brown shoulders, tan sculpted pecs, charcoal pants,
        // HUGE LONG hanging ape arms with big tan knuckle-fists, tan feet, expressive muzzle & thick BLACK SUNGLASSES!
        add(bodyPivot, [
          // Broad muscular V-tapered ape upper torso & rounded hunched back
          lathePart(
            [
              [0.34, 0.72],
              [0.36, 0.92],
              [0.48, 1.24],
              [0.54, 1.46],
              [0.38, 1.56],
            ],
            8,
            pal.primary,
            [0, 0, -0.02],
            [0.10, 0, 0],
          ),
          // Sculpted tan bare chest pecs!
          dodec(0.26, pal.skin, [-0.14, 1.26, 0.26], undefined, [1.0, 0.85, 0.65]),
          dodec(0.26, pal.skin, [0.14, 1.26, 0.26], undefined, [1.0, 0.85, 0.65]),
          box(0.38, 0.34, 0.16, pal.skin, [0, 1.06, 0.26]),
          // Charcoal-grey primate trousers & dark waistband
          lathePart([[0.37, 0.64], [0.38, 0.84], [0.35, 0.92]], 8, pal.secondary),
          box(0.68, 0.08, 0.54, 0x1a1e26, [0, 0.88, 0]),
        ]);
        headPivot.position.set(0, 1.48, 0.14);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          // Sculpted primate cranium & heavy brow
          dodec(0.34, pal.primary, [0, 0.28, -0.02], undefined, [1.05, 1.0, 1.02]),
          // Rounded ape ears with tan inner cups
          cyl(0.12, 0.12, 0.07, 7, pal.primary, [-0.34, 0.28, 0.02], [Math.PI * 0.5, 0, 0]),
          cyl(0.08, 0.08, 0.085, 7, pal.skin, [-0.34, 0.28, 0.04], [Math.PI * 0.5, 0, 0]),
          cyl(0.12, 0.12, 0.07, 7, pal.primary, [0.34, 0.28, 0.02], [Math.PI * 0.5, 0, 0]),
          cyl(0.08, 0.08, 0.085, 7, pal.skin, [0.34, 0.28, 0.04], [Math.PI * 0.5, 0, 0]),
          // Wide expressive tan muzzle with cheeky smile & nostrils!
          dodec(0.27, pal.skin, [0, 0.16, 0.22], undefined, [1.18, 0.84, 0.92]),
          box(0.24, 0.035, 0.04, 0x5c361a, [0, 0.11, 0.45]),
          box(0.045, 0.035, 0.04, 0x3b2210, [-0.055, 0.22, 0.46]),
          box(0.045, 0.035, 0.04, 0x3b2210, [0.055, 0.22, 0.46]),
          // THICK SHINY BLACK SUNGLASSES with crisp white glint pixels!
          box(0.56, 0.16, 0.12, 0x0b0d12, [0, 0.31, 0.32]),
          box(0.20, 0.11, 0.135, 0x161b26, [-0.14, 0.30, 0.33]),
          box(0.20, 0.11, 0.135, 0x161b26, [0.14, 0.30, 0.33]),
          box(0.05, 0.04, 0.145, 0xffffff, [-0.09, 0.33, 0.335]),
          box(0.05, 0.04, 0.145, 0xffffff, [0.19, 0.33, 0.335]),
        ];
        addHatParts(head, hatId, 0.62);
        add(headPivot, head);

        // Long powerful hanging ape arms reaching down to knees with huge tan hands!
        leftArm.position.set(-0.52, 1.38, 0.02);
        rightArm.position.set(0.52, 1.38, 0.02);
        leftLeg.position.set(-0.22, 0.66, 0);
        rightLeg.position.set(0.22, 0.66, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        const buildApeArm = (sign: -1 | 1): ColoredPartSpec[] => [
          dodec(0.21, pal.primary, [0, 0, 0]),
          cyl(0.16, 0.15, 0.56, 7, pal.primary, [sign * 0.04, -0.28, 0.04], [-0.10, 0, sign * 0.08]),
          cyl(0.16, 0.14, 0.52, 7, pal.primary, [sign * 0.07, -0.74, 0.12], [-0.22, 0, sign * 0.04]),
          // Huge chunky tan ape fist + inner thumb!
          box(0.28, 0.26, 0.30, pal.skin, [sign * 0.07, -1.04, 0.22]),
          box(0.12, 0.14, 0.16, pal.skin, [-sign * 0.08, -1.02, 0.26]),
        ];
        add(leftArm, buildApeArm(-1));
        add(rightArm, buildApeArm(1));
        const buildApeLeg = (): ColoredPartSpec[] => [
          cyl(0.16, 0.14, 0.34, 7, pal.secondary, [0, -0.16, 0.02], [-0.14, 0, 0]),
          cyl(0.14, 0.12, 0.30, 7, pal.secondary, [0, -0.44, -0.02], [0.16, 0, 0]),
          // Broad tan ape foot!
          box(0.28, 0.14, 0.38, pal.boots, [0, -0.60, 0.08]),
        ];
        add(leftLeg, buildApeLeg());
        add(rightLeg, buildApeLeg());

        weaponPivot.position.set(0.08, -1.02, 0.26);
        rightArm.add(weaponPivot);
        // Oversized golden Bananarang!
        add(weaponPivot, [
          torus(0.42, 0.1, 5, 10, pal.weapon, [0, 0.18, 0.2], [0.2, 0.4, 0.6], undefined, Math.PI * 0.85),
          box(0.1, 0.1, 0.1, 0x4f3018, [0.36, 0.38, 0.26]),
        ]);
        break;
      }

      case 'Ninja': {
        // SLEEK ATHLETIC SHINOBI (charcoal stealth suit, dark-blue sash, wrapped shinobi boots & curved silver Katana!)
        add(bodyPivot, [
          lathePart(
            [
              [0.32, 0.72],
              [0.25, 0.94],
              [0.34, 1.32],
              [0.37, 1.48],
              [0.22, 1.56],
            ],
            8,
            pal.primary,
          ),
          // Diagonal stealth chest harness & indigo waist obi sash
          box(0.10, 0.62, 0.36, pal.secondary, [0, 1.24, 0.02], [0, 0, 0.56]),
          lathePart([[0.31, 0.84], [0.33, 0.92], [0.31, 0.98]], 8, pal.accent),
          lathePart([[0.22, 1.54], [0.30, 1.46], [0.28, 1.40]], 8, pal.secondary),
        ]);
        headPivot.position.set(0, 1.56, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          lathePart([[0.18, 0.0], [0.26, 0.14], [0.27, 0.32], [0.22, 0.46], [0.10, 0.52]], 8, pal.primary),
          // Narrow fierce shinobi eye slit across hood mask
          box(0.30, 0.095, 0.08, pal.skin, [0, 0.27, 0.24]),
          box(0.08, 0.05, 0.09, 0x0d1018, [-0.09, 0.27, 0.25]),
          box(0.08, 0.05, 0.09, 0x0d1018, [0.09, 0.27, 0.25]),
          cyl(0.28, 0.28, 0.075, 8, pal.accent, [0, 0.37, 0]),
        ];
        addHatParts(head, hatId, 0.54);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.48, -0.22);
        bodyPivot.add(capePivot);
        add(capePivot, [
          box(0.16, 0.86, 0.05, pal.accent, [-0.06, -0.40, -0.10], [0.28, 0, 0.12]),
          box(0.12, 0.70, 0.05, pal.secondary, [0.08, -0.34, -0.08], [0.22, 0, -0.14]),
        ]);
        attachStdLimbs(pal.primary, 0x141824, pal.primary, pal.boots, 0.38, 0.16, 0.74, 1.42);
        weaponPivot.position.set(0.04, -0.58, 0.14);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.036, 0.036, 0.38, 6, pal.accent, [0, -0.04, 0.06], [0.48, 0, 0]),
          cyl(0.11, 0.11, 0.045, 8, 0xd4a437, [0, 0.14, 0.15], [0.48, 0, 0]),
          // Razor-sharp bright silver curved Katana blade!
          extrudePolyPart(
            [[-0.045, 0.0], [0.045, 0.0], [0.06, 0.92], [0.01, 1.56], [-0.04, 1.42], [-0.025, 0.78]],
            0.028,
            0.008,
            pal.weapon,
            [0, 0.18, 0.17],
            [0.48, 0, 0],
          ),
        ]);
        break;
      }

      case 'Noelle': {
        // Cozy frost-mage parka + pointed frost hood + glowing Crystal Staff!
        add(bodyPivot, [
          cone(0.54, 1.02, 8, pal.primary, [0, 0.96, 0]),
          cyl(0.56, 0.58, 0.14, 8, pal.secondary, [0, 0.52, 0]), // fluffy snow hem
          cyl(0.36, 0.4, 0.18, 8, pal.secondary, [0, 1.44, 0.02]), // fluffy snow collar
          box(0.14, 0.72, 0.1, pal.secondary, [0, 1.0, 0.34]),
        ]);
        headPivot.position.set(0, 1.5, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.33, pal.skin, [0, 0.24, 0.06]),
          // Pointed winter frost hood + snow trim
          dodec(0.42, pal.primary, [0, 0.3, -0.06]),
          cone(0.32, 0.48, 6, pal.primary, [0, 0.54, -0.26], [-0.65, 0, 0]),
          torus(0.34, 0.075, 5, 10, pal.secondary, [0, 0.28, 0.18]),
          // Rosy frost cheeks & ice-blue eyes
          box(0.09, 0.1, 0.06, 0x1d4ed8, [-0.12, 0.28, 0.35]),
          box(0.09, 0.1, 0.06, 0x1d4ed8, [0.12, 0.28, 0.35]),
          octa(0.1, 0xb8f3ff, [0, 0.56, 0.28]), // crystal snowflake hairpin
        ];
        addHatParts(head, hatId, 0.66);
        add(headPivot, head);
        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.38, -0.28);
        bodyPivot.add(capePivot);
        add(capePivot, [box(0.64, 0.92, 0.06, pal.accent, [0, -0.44, -0.06], [0.16, 0, 0])]);
        attachStdLimbs(pal.primary, pal.secondary, pal.secondary, pal.boots, 0.44, 0.18, 0.54, 1.3);
        weaponPivot.position.set(0.05, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.05, 0.06, 1.92, 6, 0xe0f2fe, [0, 0.38, 0.14], [0.22, 0, 0]),
          octa(0.16, pal.accent, [0, 1.24, 0.34]),
        ]);
        addGlowOrb(weaponPivot, new THREE.OctahedronGeometry(0.24, 0), [0, 1.46, 0.38]);
        break;
      }

      case 'Ogre': {
        // Colossal bulky emerald tusker brute w/ protruding ivory tusks & giant Battle Axe!
        add(bodyPivot, [
          dodec(0.68, pal.primary, [0, 1.12, 0], undefined, [1.18, 1.05, 1.04]),
          box(0.92, 0.34, 0.72, pal.secondary, [0, 0.66, 0]),
          box(0.88, 0.14, 0.72, 0x4a301e, [0, 1.18, 0.04], [0, 0, 0.42]),
          dodec(0.32, 0xe8d5a8, [-0.66, 1.48, 0]), // skull/bone pauldron
        ]);
        headPivot.position.set(0, 1.66, 0.08);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.42, pal.skin, [0, 0.26, 0], undefined, [1.12, 0.95, 1.05]),
          box(0.6, 0.16, 0.24, pal.primary, [0, 0.42, 0.28]), // heavy brow ridge
          // Protruding curved ivory tusks!
          cone(0.08, 0.36, 5, 0xfff8e6, [-0.2, 0.14, 0.42], [0.35, 0, 0.22]),
          cone(0.08, 0.36, 5, 0xfff8e6, [0.2, 0.14, 0.42], [0.35, 0, -0.22]),
          box(0.11, 0.08, 0.06, 0xffd23f, [-0.15, 0.32, 0.38]),
          box(0.11, 0.08, 0.06, 0xffd23f, [0.15, 0.32, 0.38]),
          cone(0.1, 0.26, 4, pal.skin, [-0.46, 0.28, 0], [0, 0, 1.2]),
          cone(0.1, 0.26, 4, pal.skin, [0.46, 0.28, 0], [0, 0, -1.2]),
        ];
        addHatParts(head, hatId, 0.66);
        add(headPivot, head);
        leftArm.position.set(-0.74, 1.42, 0);
        rightArm.position.set(0.74, 1.42, 0);
        leftLeg.position.set(-0.28, 0.56, 0);
        rightLeg.position.set(0.28, 0.56, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cyl(0.2, 0.17, 0.58, 6, pal.primary, [0, -0.26, 0]), dodec(0.2, pal.skin, [0, -0.58, 0.04])]);
        add(rightArm, [cyl(0.2, 0.17, 0.58, 6, pal.primary, [0, -0.26, 0]), dodec(0.2, pal.skin, [0, -0.58, 0.04])]);
        add(leftLeg, [cyl(0.22, 0.18, 0.44, 6, pal.primary, [0, -0.2, 0]), box(0.32, 0.2, 0.42, pal.boots, [0, -0.48, 0.08])]);
        add(rightLeg, [cyl(0.22, 0.18, 0.44, 6, pal.primary, [0, -0.2, 0]), box(0.32, 0.2, 0.42, pal.boots, [0, -0.48, 0.08])]);

        weaponPivot.position.set(0.06, -0.5, 0.16);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.07, 0.075, 1.75, 6, pal.secondary, [0, 0.42, 0.18], [0.35, 0, 0]),
          box(0.72, 0.52, 0.12, pal.weapon, [0, 1.15, 0.45], [0.35, 0, 0]),
          box(0.8, 0.44, 0.08, 0xe2e8f0, [0, 1.15, 0.45], [0.35, 0, 0]),
        ]);
        break;
      }

      case 'Roberto': {
        // Floating hooded spectral reaper w/ glowing mint eyes & curved Grim Scythe!
        hoverMode = 'float';
        add(bodyPivot, [
          cone(0.56, 1.38, 7, pal.primary, [0, 0.98, 0]),
          cone(0.2, 0.46, 4, pal.secondary, [-0.34, 0.3, 0.16], [Math.PI, 0, 0.16]),
          cone(0.2, 0.5, 4, pal.secondary, [0.34, 0.28, 0.16], [Math.PI, 0, -0.16]),
          cone(0.22, 0.52, 4, pal.secondary, [0, 0.26, -0.34], [Math.PI, 0, 0]),
          cyl(0.42, 0.46, 0.14, 7, pal.secondary, [0, 1.44, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.4, pal.primary, [0, 0.28, 0]),
          cone(0.32, 0.52, 5, pal.primary, [0, 0.54, -0.22], [-0.6, 0, 0]),
          box(0.38, 0.34, 0.24, 0x090812, [0, 0.24, 0.24]),
          box(0.11, 0.08, 0.08, pal.accent, [-0.11, 0.28, 0.37]),
          box(0.11, 0.08, 0.08, pal.accent, [0.11, 0.28, 0.37]),
        ];
        addHatParts(head, hatId, 0.68);
        add(headPivot, head);
        leftArm.position.set(-0.44, 1.34, 0.04);
        rightArm.position.set(0.44, 1.34, 0.04);
        leftLeg.position.set(-0.16, 0.4, 0);
        rightLeg.position.set(0.16, 0.4, 0);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cone(0.18, 0.56, 5, pal.secondary, [0, -0.26, 0.08], [0.25, 0, 0.15])]);
        add(rightArm, [cone(0.18, 0.56, 5, pal.secondary, [0, -0.26, 0.08], [0.25, 0, -0.15])]);
        weaponPivot.position.set(0.06, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.05, 0.055, 2.2, 6, 0x3b2d4d, [0, 0.5, 0.18], [0.26, 0, 0]),
          // Iconic curved Grim Scythe crescent blade!
          torus(0.56, 0.09, 4, 10, pal.weapon, [-0.46, 1.48, 0.48], [0.26, 0, -0.35], undefined, Math.PI * 0.72),
          torus(0.62, 0.04, 4, 10, pal.accent, [-0.48, 1.48, 0.48], [0.26, 0, -0.35], undefined, Math.PI * 0.68),
        ]);
        break;
      }

      case 'Robinette': {
        // Feathered emerald archer cap + quiver + strung Longbow!
        add(bodyPivot, [
          cyl(0.32, 0.44, 0.88, 7, pal.primary, [0, 1.02, 0]),
          cyl(0.4, 0.42, 0.14, 7, pal.secondary, [0, 0.8, 0]),
          box(0.16, 0.14, 0.1, pal.accent, [0, 0.8, 0.39]),
          // Leather quiver packed with feathered arrows on back!
          cyl(0.16, 0.14, 0.72, 6, pal.secondary, [0.16, 1.18, -0.34], [0.15, 0, -0.35]),
          cone(0.07, 0.18, 4, 0xff4d5e, [0.28, 1.56, -0.38]),
          cone(0.07, 0.18, 4, pal.accent, [0.18, 1.58, -0.3]),
        ]);
        headPivot.position.set(0, 1.52, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.34, pal.skin, [0, 0.24, 0]),
          box(0.09, 0.1, 0.06, 0x161b26, [-0.12, 0.27, 0.3]),
          box(0.09, 0.1, 0.06, 0x161b26, [0.12, 0.27, 0.3]),
          // Iconic jaunty Robin Hood feathered cap!
          cone(0.4, 0.44, 6, pal.primary, [0, 0.56, -0.04], [-0.35, 0, 0]),
          cyl(0.38, 0.36, 0.1, 7, 0x1c6e38, [0, 0.4, 0]),
          cone(0.08, 0.48, 4, 0xff3b5c, [0.26, 0.68, -0.06], [-0.2, 0, -0.52]), // crimson feather!
        ];
        addHatParts(head, hatId, 0.72);
        add(headPivot, head);
        attachStdLimbs(pal.primary, pal.skin, pal.secondary, pal.boots, 0.42, 0.18, 0.62, 1.32);
        weaponPivot.position.set(0.06, -0.4, 0.24);
        rightArm.add(weaponPivot);
        // Strung Longbow + nocked glowing arrow!
        add(weaponPivot, [
          torus(0.62, 0.055, 5, 10, pal.weapon, [0, 0.12, 0.16], [0, Math.PI * 0.5, -Math.PI * 0.45], undefined, Math.PI * 0.9),
          cyl(0.02, 0.02, 1.15, 4, 0xfff4d6, [0, 0.12, -0.02]),
          cyl(0.03, 0.03, 1.05, 5, pal.accent, [0, 0.12, 0.34], [Math.PI * 0.5, 0, 0]),
          cone(0.09, 0.22, 4, 0xffffff, [0, 0.12, 0.88], [Math.PI * 0.5, 0, 0]),
        ]);
        break;
      }

      case 'Spaceman': {
        // Chunky astronaut suit + bubble helmet + twin-thruster Jetpack!
        hoverMode = 'float';
        add(bodyPivot, [
          box(0.76, 0.84, 0.54, pal.primary, [0, 1.06, 0]),
          box(0.46, 0.32, 0.12, pal.secondary, [0, 1.16, 0.28]),
          box(0.14, 0.12, 0.14, pal.accent, [-0.1, 1.16, 0.3]),
          box(0.12, 0.12, 0.14, 0x52f2ff, [0.12, 1.16, 0.3]),
          cyl(0.42, 0.44, 0.14, 8, pal.accent, [0, 0.72, 0]),
          // Twin-thruster Jetpack on back!
          box(0.58, 0.66, 0.26, 0xcbd5e1, [0, 1.14, -0.38]),
          cyl(0.14, 0.16, 0.56, 7, pal.secondary, [-0.22, 1.1, -0.44]),
          cyl(0.14, 0.16, 0.56, 7, pal.secondary, [0.22, 1.1, -0.44]),
          cone(0.13, 0.32, 6, 0xff9f1c, [-0.22, 0.66, -0.44], [Math.PI, 0, 0]),
          cone(0.13, 0.32, 6, 0xff9f1c, [0.22, 0.66, -0.44], [Math.PI, 0, 0]),
        ]);
        headPivot.position.set(0, 1.54, 0);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          cyl(0.38, 0.42, 0.12, 8, pal.accent, [0, 0.04, 0]),
          // Oversized Bubble Helmet + dark reflective faceplate visor!
          ico(0.44, 0x9ee8ff, [0, 0.38, 0]),
          dodec(0.34, 0x162038, [0, 0.38, 0.12], undefined, [1.02, 0.86, 0.9]),
          box(0.16, 0.08, 0.06, 0xffffff, [0.16, 0.5, 0.42], [0, 0.2, -0.3]),
        ];
        addHatParts(head, hatId, 0.82);
        add(headPivot, head);
        attachStdLimbs(pal.primary, pal.accent, pal.primary, pal.boots, 0.5, 0.21, 0.62, 1.34);
        weaponPivot.position.set(0.06, -0.44, 0.2);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          cyl(0.12, 0.1, 0.65, 7, pal.secondary, [0, 0.1, 0.24], [Math.PI * 0.5, 0, 0]),
          torus(0.22, 0.045, 5, 10, pal.accent, [0, 0.1, 0.62]),
        ]);
        addGlowOrb(weaponPivot, new THREE.IcosahedronGeometry(0.17, 0), [0, 0.1, 0.68]);
        break;
      }

      case 'TonyMcZoom': {
        // Neon Cyber-Skater riding a GLOWING NEON HOVERBOARD!
        hoverMode = 'hoverboard';
        const deckH = 0.42;
        boardPivot = new THREE.Group();
        boardPivot.position.set(0, 0.24, 0);
        bodyPivot.add(boardPivot);
        add(boardPivot, [
          box(0.76, 0.09, 1.62, pal.secondary, [0, 0.12, 0]),
          box(0.62, 0.1, 1.48, pal.primary, [0, 0.13, 0]),
          box(0.28, 0.11, 1.54, pal.accent, [0, 0.14, 0]),
          cone(0.38, 0.38, 4, pal.primary, [0, 0.14, 0.96], [Math.PI * 0.5, Math.PI * 0.25, 0]),
        ]);
        // Glowing plasma hover-thruster discs underneath hoverboard!
        addGlowOrb(boardPivot, new THREE.CylinderGeometry(0.24, 0.28, 0.08, 8), [0, 0.02, 0.48]);
        addGlowOrb(boardPivot, new THREE.CylinderGeometry(0.24, 0.28, 0.08, 8), [0, 0.02, -0.48]);

        add(bodyPivot, [
          box(0.68, 0.8, 0.44, pal.primary, [0, deckH + 1.02, 0]),
          box(0.24, 0.78, 0.46, pal.secondary, [0, deckH + 1.02, 0]),
          box(0.72, 0.12, 0.48, pal.accent, [0, deckH + 0.68, 0]),
        ]);
        headPivot.position.set(0, deckH + 1.48, 0.02);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          dodec(0.34, pal.skin, [0, 0.24, 0]),
          // Spiky anime hair!
          cone(0.18, 0.42, 4, pal.primary, [0, 0.56, -0.06], [-0.4, 0, 0]),
          cone(0.14, 0.34, 4, pal.primary, [-0.22, 0.5, -0.08], [-0.3, 0, 0.45]),
          cone(0.14, 0.34, 4, pal.primary, [0.22, 0.5, -0.08], [-0.3, 0, -0.45]),
          // Glowing neon cyber-visor shades!
          box(0.48, 0.15, 0.12, pal.accent, [0, 0.28, 0.3]),
          box(0.42, 0.05, 0.13, 0xffffff, [0, 0.31, 0.31]),
        ];
        addHatParts(head, hatId, 0.68);
        add(headPivot, head);
        leftArm.position.set(-0.44, deckH + 1.32, 0);
        rightArm.position.set(0.44, deckH + 1.32, 0);
        leftLeg.position.set(-0.18, deckH + 0.58, 0.2);
        rightLeg.position.set(0.18, deckH + 0.58, -0.2);
        bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);
        add(leftArm, [cyl(0.1, 0.09, 0.48, 6, pal.primary, [0, -0.22, 0]), box(0.15, 0.15, 0.15, pal.accent, [0, -0.48, 0])]);
        add(rightArm, [cyl(0.1, 0.09, 0.48, 6, pal.primary, [0, -0.22, 0]), box(0.15, 0.15, 0.15, pal.accent, [0, -0.48, 0])]);
        add(leftLeg, [cyl(0.11, 0.1, 0.44, 6, pal.secondary, [0, -0.2, 0]), box(0.24, 0.14, 0.34, pal.boots, [0, -0.48, 0.04])]);
        add(rightLeg, [cyl(0.11, 0.1, 0.44, 6, pal.secondary, [0, -0.2, 0]), box(0.24, 0.14, 0.34, pal.boots, [0, -0.48, 0.04])]);
        weaponPivot.position.set(0.05, -0.42, 0.22);
        rightArm.add(weaponPivot);
        addGlowOrb(weaponPivot, new THREE.ConeGeometry(0.11, 0.68, 4), [0, 0.18, 0.2]);
        break;
      }

      case 'Vlad': {
        // SCULPTED GOTHIC VAMPIRE LORD — dramatic flared baroque coat, jagged high crimson collar & blood chalice!
        hoverMode = 'float';
        add(bodyPivot, [
          lathePart(
            [
              [0.54, 0.48],
              [0.40, 0.76],
              [0.32, 1.02],
              [0.42, 1.38],
              [0.30, 1.52],
            ],
            10,
            pal.primary,
          ),
          box(0.28, 0.64, 0.10, pal.secondary, [0, 1.12, 0.32]),
          box(0.14, 0.24, 0.12, 0xf7eed8, [0, 1.40, 0.34]),
          octa(0.095, pal.accent, [0, 1.34, 0.40]),
          // Dramatic sculpted bat-wing gothic high collar!
          extrudePolyPart(
            [
              [-0.44, 0.0],
              [0.44, 0.0],
              [0.58, 0.56],
              [0.24, 0.48],
              [0.0, 0.62],
              [-0.24, 0.48],
              [-0.58, 0.56],
            ],
            0.07,
            0.015,
            pal.primary,
            [0, 1.42, -0.22],
            [-0.26, 0, 0],
          ),
          extrudePolyPart(
            [
              [-0.36, 0.04],
              [0.36, 0.04],
              [0.46, 0.48],
              [0.0, 0.52],
              [-0.46, 0.48],
            ],
            0.05,
            0.01,
            pal.secondary,
            [0, 1.44, -0.17],
            [-0.26, 0, 0],
          ),
        ]);
        headPivot.position.set(0, 1.54, 0.04);
        bodyPivot.add(headPivot);
        const head: ColoredPartSpec[] = [
          lathePart([[0.16, 0.02], [0.32, 0.18], [0.34, 0.36], [0.24, 0.52]], 10, pal.skin),
          // Swept aristocratic black hair with widow's peak
          dodec(0.36, 0x100b18, [0, 0.38, -0.06], undefined, [1.05, 0.85, 1.05]),
          cone(0.12, 0.22, 3, 0x100b18, [0, 0.48, 0.28], [Math.PI, 0, 0]),
          cone(0.035, 0.11, 3, 0xffffff, [-0.07, 0.12, 0.32], [Math.PI, 0, 0]),
          cone(0.035, 0.11, 3, 0xffffff, [0.07, 0.12, 0.32], [Math.PI, 0, 0]),
        ];
        addHatParts(head, hatId, 0.64);
        add(headPivot, head);
        addGlowOrb(headPivot, new THREE.BoxGeometry(0.11, 0.07, 0.06), [-0.12, 0.28, 0.32]);
        addGlowOrb(headPivot, new THREE.BoxGeometry(0.11, 0.07, 0.06), [0.12, 0.28, 0.32]);

        capePivot = new THREE.Group();
        capePivot.position.set(0, 1.44, -0.28);
        bodyPivot.add(capePivot);
        add(capePivot, buildSculptedCapeParts(pal.primary, pal.secondary, 1.02, 1.32));
        attachStdLimbs(pal.primary, pal.skin, pal.primary, pal.boots, 0.46, 0.19, 0.62, 1.34);

        weaponPivot.position.set(0.05, -0.44, 0.18);
        rightArm.add(weaponPivot);
        add(weaponPivot, [
          lathePart([[0.03, -0.5], [0.055, 0.3], [0.07, 1.05], [0.12, 1.18]], 8, 0x261224, [0, 0.28, 0.14], [0.22, 0, 0]),
          torus(0.24, 0.042, 6, 12, pal.secondary, [0, 1.32, 0.36]),
        ]);
        addGlowOrb(weaponPivot, new THREE.OctahedronGeometry(0.20, 1), [0, 1.32, 0.36]);
        break;
      }
    }

    return {
      characterId,
      root,
      bodyPivot,
      headPivot,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      tailPivot,
      capePivot,
      weaponPivot,
      boardPivot,
      wheelPivots,
      leftWingPivot,
      rightWingPivot,
      auraRing,
      baseScale: pal.scale,
      hoverMode,
      isDiceHead,
      toonMaterials,
      outlineMeshes,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  // ---- 4 DEDICATED ARTICULATED BOSS RIGS ----

  public buildEntBossRig(tier = 1): ArticulatedBossRig {
    // TOWERING GNARLED BARK-GOLEM ENT GIANT (two rooted wooden legs, V-tapered bark torso,
    // carved scowling wooden face with glowing bright CYAN eyes, spiked shoulder branches & colossal blocky fists!)
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const isT2 = tier === 2;
    const isT3 = tier >= 3;
    const barkLight = isT3 ? 0x6e3a28 : isT2 ? 0x5c4c70 : 0x826033;
    const barkMid = isT3 ? 0x52291c : isT2 ? 0x453759 : 0x634723;
    const barkDark = isT3 ? 0x361914 : isT2 ? 0x2f2440 : 0x422e16;
    const mossCol = isT3 ? 0xb83824 : isT2 ? 0x6945a8 : 0x46732a;
    const eyeHex = isT3 ? 0xff2e44 : isT2 ? 0x6ef7ff : 0x00f5ff;

    const barkMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.bark_grain,
      mapStrength: 0.90,
      vertexColors: true,
      rimStrength: 0.24,
      rimColor: eyeHex,
    });
    const eyeMat = createMkToonMaterial({
      color: eyeHex,
      emissive: eyeHex,
      emissiveIntensity: 1.65,
      rimStrength: 0.45,
      rimColor: 0xffffff,
    });
    const outlineMat = createOutlineMaterial(0.068, 0x090a0e);
    toonMaterials.push(barkMat, eyeMat);
    extraMaterials.push(outlineMat);

    const add = (p: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(p, parts, barkMat, outlineMat, outlines, geometriesToDispose);

    // Muscular humanoid wooden legs with splayed tree-root feet + chunky waist block + broad V-tapered bark torso!
    add(root, [
      // Left rooted tree-trunk leg (foot -> shin -> thigh)
      box(0.95, 0.45, 1.35, barkDark, [-0.92, 0.22, 0.14]),
      cone(0.32, 0.85, 5, barkDark, [-1.25, 0.22, 0.65], [0.95, 0, 0.5]),
      box(0.86, 1.55, 0.92, barkMid, [-0.90, 1.15, 0.04], [-0.08, 0, 0.05]),
      box(0.92, 1.45, 0.98, barkLight, [-0.84, 2.45, 0.08], [0.06, 0, -0.04]),
      // Right rooted tree-trunk leg
      box(0.95, 0.45, 1.35, barkDark, [0.92, 0.22, 0.14]),
      cone(0.32, 0.85, 5, barkDark, [1.25, 0.22, 0.65], [0.95, 0, -0.5]),
      box(0.86, 1.55, 0.92, barkMid, [0.90, 1.15, 0.04], [-0.08, 0, -0.05]),
      box(0.92, 1.45, 0.98, barkLight, [0.84, 2.45, 0.08], [0.06, 0, 0.04]),
      // Chunky carved wooden pelvis & waist
      box(2.15, 0.85, 1.28, barkDark, [0, 3.32, 0.0]),
      // Broad muscular V-tapered gnarled bark chest & shoulders!
      box(2.85, 2.35, 1.65, barkLight, [0, 4.82, 0.05]),
      box(3.45, 1.35, 1.55, barkMid, [0, 5.55, 0.0]),
      // Mossy shoulder bark ridges
      box(1.15, 0.36, 1.25, mossCol, [-1.18, 6.26, -0.05], [0, 0, 0.16]),
      box(1.15, 0.36, 1.25, mossCol, [1.18, 6.26, -0.05], [0, 0, -0.16]),
      // Towering carved wooden scowling rectangular Ent Head inset into chest/shoulders!
      box(1.62, 2.15, 1.35, barkLight, [0, 5.55, 0.72]),
      box(1.78, 0.42, 0.56, barkDark, [0, 6.08, 1.26]), // heavy angry carved brow
      box(1.18, 0.58, 0.42, 0x160e0a, [0, 5.05, 1.26]), // deep carved scowling mouth
      box(0.96, 0.16, 0.48, barkMid, [0, 5.26, 1.26]), // wooden tooth lip
      // Mossy forehead crown ridges
      box(0.54, 0.46, 0.52, mossCol, [-0.42, 6.66, 0.65], [0, 0, 0.25]),
      box(0.54, 0.46, 0.52, mossCol, [0.42, 6.66, 0.65], [0, 0, -0.25]),
    ]);

    // Glowing fierce bright CYAN triangular/angled eyes!
    const eyeGeo = new THREE.BoxGeometry(0.36, 0.24, 0.18);
    geometriesToDispose.push(eyeGeo);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.42, 5.78, 1.38);
    leftEye.rotation.z = -0.18;
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.42, 5.78, 1.38);
    rightEye.rotation.z = 0.18;
    root.add(leftEye, rightEye);

    // Jagged sprouting gnarled branch-antler spikes rising dramatically from shoulders & back!
    crownGroup.position.set(0, 6.15, -0.15);
    root.add(crownGroup);
    add(crownGroup, [
      cone(0.34, 2.35, 5, barkDark, [-1.45, 1.05, -0.15], [-0.15, 0, 0.48]),
      cone(0.24, 1.75, 5, barkMid, [-2.45, 0.52, 0.05], [-0.10, 0, 0.92]),
      cone(0.34, 2.25, 5, barkDark, [1.45, 0.98, -0.15], [-0.15, 0, -0.48]),
      cone(0.22, 1.55, 5, barkMid, [2.35, 0.48, 0.05], [-0.10, 0, -0.88]),
      cone(0.26, 1.50, 5, mossCol, [0.0, 0.95, -0.45], [-0.35, 0, 0]),
    ]);

    // COLOSSAL LONG TREE-TRUNK ARMS ending in massive blocky wooden fists!
    leftArm.position.set(-2.12, 5.55, 0.10);
    rightArm.position.set(2.12, 5.55, 0.10);
    root.add(leftArm, rightArm);
    add(leftArm, [
      box(1.05, 2.25, 1.05, barkMid, [-0.24, -1.05, 0.12], [-0.12, 0, -0.18]),
      box(1.18, 2.45, 1.18, barkLight, [-0.62, -2.95, 0.42], [-0.28, 0, -0.06]),
      box(0.55, 0.85, 0.42, mossCol, [-0.88, -2.25, 0.35]),
      // Massive chunky carved wooden knuckle-fist!
      box(1.42, 1.32, 1.48, barkDark, [-0.68, -4.45, 0.72]),
      box(1.36, 0.34, 0.36, barkLight, [-0.68, -4.75, 1.38]),
    ]);
    add(rightArm, [
      box(1.05, 2.25, 1.05, barkMid, [0.24, -1.05, 0.12], [-0.12, 0, 0.18]),
      box(1.18, 2.45, 1.18, barkLight, [0.62, -2.95, 0.42], [-0.28, 0, 0.06]),
      box(0.55, 0.85, 0.42, mossCol, [0.88, -2.25, 0.35]),
      box(1.42, 1.32, 1.48, barkDark, [0.68, -4.45, 0.72]),
      box(1.36, 0.34, 0.36, barkLight, [0.68, -4.75, 1.38]),
    ]);

    return {
      kind: 'Ent',
      root,
      leftArm,
      rightArm,
      crownGroup,
      shieldDome: null,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  public buildPharaohBossRig(tier = 1): ArticulatedBossRig {
    // Golden-crowned Anubis Jackal Pharaoh Boss (Pharaoh1/2/3)!
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const gemHex = tier >= 3 ? 0xff2e54 : tier === 2 ? 0x38f2ff : 0xffd23f;
    const trimHex = tier >= 3 ? 0xd92638 : tier === 2 ? 0x2563eb : 0x1d4ed8;
    const mat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.desert_sandstone,
      mapStrength: 0.4,
      vertexColors: true,
      rimStrength: 0.45,
      rimColor: 0xffe48f,
      gloss: 0.55,
    });
    const glowMat = createMkToonMaterial({
      color: gemHex,
      emissive: gemHex,
      emissiveIntensity: 1.35,
      rimStrength: 0.55,
    });
    const outlineMat = createOutlineMaterial(0.082, 0x0b0d14);
    toonMaterials.push(mat, glowMat);
    extraMaterials.push(outlineMat);

    const add = (p: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(p, parts, mat, outlineMat, outlines, geometriesToDispose);

    // Tall obsidian-and-gold jackal pharaoh body + broad gilded pectoral collar + kilt
    add(root, [
      cyl(0.88, 1.35, 2.2, 8, 0xf2e6c9, [0, 1.2, 0]),
      box(0.56, 1.9, 0.24, trimHex, [0, 1.15, 0.96]),
      box(0.32, 1.85, 0.28, 0xffd23f, [0, 1.15, 0.98]),
      cyl(1.18, 0.78, 1.85, 7, 0x1c1a29, [0, 3.05, 0]),
      cyl(1.38, 1.05, 0.48, 8, 0xffc83b, [0, 3.82, 0]), // broad golden pharaoh collar
      cyl(1.22, 1.1, 0.16, 8, trimHex, [0, 3.9, 0.04]),
      // Jackal head + elongated black canine snout + tall vertical Anubis ears!
      dodec(0.76, 0x191724, [0, 4.65, 0.1]),
      cone(0.34, 1.15, 5, 0x191724, [0, 4.5, 0.88], [Math.PI * 0.52, 0, 0]),
      cone(0.22, 1.25, 4, 0x191724, [-0.42, 5.65, -0.05], [0.05, 0, 0.12]),
      cone(0.22, 1.25, 4, 0x191724, [0.42, 5.65, -0.05], [0.05, 0, -0.12]),
      cone(0.12, 0.95, 4, 0xffc83b, [-0.42, 5.58, 0.04], [0.05, 0, 0.12]),
      cone(0.12, 0.95, 4, 0xffc83b, [0.42, 5.58, 0.04], [0.05, 0, -0.12]),
      // Striped Gold-and-Lapis Nemes Headdress flaps
      box(1.92, 1.12, 0.56, 0xffc83b, [0, 4.45, -0.18]),
      box(1.98, 0.18, 0.6, trimHex, [0, 4.78, -0.18]),
      box(1.98, 0.18, 0.6, trimHex, [0, 4.42, -0.18]),
      box(1.98, 0.18, 0.6, trimHex, [0, 4.08, -0.18]),
    ]);

    const eyeGeo = new THREE.BoxGeometry(0.24, 0.14, 0.16);
    geometriesToDispose.push(eyeGeo);
    const lEye = new THREE.Mesh(eyeGeo, glowMat);
    lEye.position.set(-0.34, 4.76, 0.72);
    const rEye = new THREE.Mesh(eyeGeo, glowMat);
    rEye.position.set(0.34, 4.76, 0.72);
    root.add(lEye, rEye);

    // Floating Golden Sun-Disc Crown!
    crownGroup.position.set(0, 5.95, 0.05);
    root.add(crownGroup);
    add(crownGroup, [
      torus(0.74, 0.12, 6, 12, 0xffd23f, [0, 0.2, 0]),
      octa(0.42, gemHex, [0, 0.2, 0]),
    ]);

    leftArm.position.set(-1.35, 3.75, 0.1);
    rightArm.position.set(1.35, 3.75, 0.1);
    root.add(leftArm, rightArm);
    add(leftArm, [
      dodec(0.45, 0xffc83b, [0, 0, 0]),
      cyl(0.26, 0.22, 1.75, 6, 0x1c1a29, [-0.12, -0.9, 0.22], [-0.35, 0, -0.1]),
      cyl(0.28, 0.28, 0.26, 7, 0xffc83b, [-0.15, -1.52, 0.45], [-0.35, 0, 0]),
    ]);
    add(rightArm, [
      dodec(0.45, 0xffc83b, [0, 0, 0]),
      cyl(0.26, 0.22, 1.75, 6, 0x1c1a29, [0.12, -0.9, 0.22], [-0.35, 0, 0.1]),
      // Towering Golden Ankh-Scepter Staff!
      cyl(0.11, 0.12, 4.8, 6, 0xffc83b, [0.22, 0.2, 0.82], [0.24, 0, 0]),
      torus(0.52, 0.1, 6, 10, 0xffd23f, [0.22, 2.75, 1.42]),
      box(0.88, 0.18, 0.18, 0xffd23f, [0.22, 2.05, 1.25]),
    ]);

    return {
      kind: 'Pharaoh',
      root,
      leftArm,
      rightArm,
      crownGroup,
      shieldDome: null,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  public buildBigBobRig(): ArticulatedBossRig {
    // BIG BOB (GhostKing) — Colossal Crowned Spectral King of the Graveyard!
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const ghostMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.spectral_ectoplasm,
      mapStrength: 0.5,
      vertexColors: true,
      emissive: 0x3b186e,
      emissiveIntensity: 0.42,
      rimStrength: 0.65,
      rimColor: 0x80faff,
    });
    const eyeMat = createMkToonMaterial({
      color: 0xff2ec4,
      emissive: 0xff2ec4,
      emissiveIntensity: 1.6,
      rimStrength: 0.6,
    });
    const outlineMat = createOutlineMaterial(0.095, 0x090714);
    toonMaterials.push(ghostMat, eyeMat);
    extraMaterials.push(outlineMat);

    const add = (p: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(p, parts, ghostMat, outlineMat, outlines, geometriesToDispose);

    // Colossal hovering tattered royal spectral body & giant horned skull head
    add(root, [
      cone(2.25, 5.2, 8, 0x2a1d4a, [0, 3.8, 0]),
      cone(1.65, 3.6, 8, 0x4b2f85, [0, 4.4, 0.25]),
      // Floating jagged ectoplasm robe tails
      cone(0.7, 2.2, 5, 0x5c3aa6, [-1.45, 1.35, 0.6], [Math.PI, 0, 0.16]),
      cone(0.7, 2.4, 5, 0x5c3aa6, [1.45, 1.35, 0.6], [Math.PI, 0, -0.16]),
      cone(0.75, 2.6, 5, 0x3f2475, [0, 1.2, -1.4], [Math.PI, 0, 0]),
      cone(0.65, 2.0, 5, 0x62f5ff, [0, 1.45, 1.4], [Math.PI, 0, 0]),
      // Royal spectral shoulder mantle
      cyl(1.85, 2.15, 0.68, 8, 0x6f32a8, [0, 5.75, 0]),
      // Colossal ghostly skull visage!
      dodec(1.58, 0xd8f3ff, [0, 7.1, 0.2], undefined, [1.08, 1.04, 1.0]),
      box(1.45, 0.72, 1.05, 0xc9e8f5, [0, 5.85, 0.72]),
      box(1.15, 0.24, 0.3, 0x0b0817, [0, 5.8, 1.24]), // gaping spectral maw
      box(0.55, 0.55, 0.36, 0x0b0817, [-0.54, 7.15, 1.44]),
      box(0.55, 0.55, 0.36, 0x0b0817, [0.54, 7.15, 1.44]),
    ]);

    const eyeGeo = new THREE.OctahedronGeometry(0.28, 0);
    geometriesToDispose.push(eyeGeo);
    const lEye = new THREE.Mesh(eyeGeo, eyeMat);
    lEye.position.set(-0.54, 7.18, 1.62);
    const rEye = new THREE.Mesh(eyeGeo, eyeMat);
    rEye.position.set(0.54, 7.18, 1.62);
    root.add(lEye, rEye);

    // Gigantic floating Golden Royal Crown with glowing amethyst jewels!
    crownGroup.position.set(0, 8.85, 0.15);
    root.add(crownGroup);
    add(crownGroup, [
      cyl(1.55, 1.25, 0.95, 8, 0xffd23f, [0, 0.45, 0]),
      cone(0.32, 0.85, 4, 0xffe45e, [0, 1.25, 1.25]),
      cone(0.32, 0.85, 4, 0xffe45e, [-1.1, 1.2, 0.6]),
      cone(0.32, 0.85, 4, 0xffe45e, [1.1, 1.2, 0.6]),
      cone(0.32, 0.85, 4, 0xffe45e, [-0.9, 1.2, -0.9]),
      cone(0.32, 0.85, 4, 0xffe45e, [0.9, 1.2, -0.9]),
      octa(0.38, 0xff2ec4, [0, 0.5, 1.45]),
      torus(2.2, 0.12, 5, 14, 0x70f5ff, [0, 0.2, 0], [Math.PI * 0.5, 0, 0]),
    ]);

    leftArm.position.set(-2.15, 5.45, 0.25);
    rightArm.position.set(2.15, 5.45, 0.25);
    root.add(leftArm, rightArm);
    add(leftArm, [
      cone(0.75, 2.8, 6, 0x3b246e, [-0.5, -1.0, 0.55], [0.7, 0, 0.3]),
      dodec(0.68, 0xd8f3ff, [-0.95, -2.05, 1.45]),
      cone(0.18, 0.95, 4, 0x70f5ff, [-1.15, -2.35, 1.95], [1.1, 0, 0.15]),
      cone(0.18, 0.95, 4, 0x70f5ff, [-0.75, -2.35, 1.95], [1.1, 0, -0.15]),
    ]);
    add(rightArm, [
      cone(0.75, 2.8, 6, 0x3b246e, [0.5, -1.0, 0.55], [0.7, 0, -0.3]),
      dodec(0.68, 0xd8f3ff, [0.95, -2.05, 1.45]),
      cone(0.18, 0.95, 4, 0x70f5ff, [1.15, -2.35, 1.95], [1.1, 0, -0.15]),
      cone(0.18, 0.95, 4, 0x70f5ff, [0.75, -2.35, 1.95], [1.1, 0, 0.15]),
    ]);

    return {
      kind: 'BigBob',
      root,
      leftArm,
      rightArm,
      crownGroup,
      shieldDome: null,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  public buildFinalBossRig(): ArticulatedBossRig {
    // FINAL BOSS — Imposing Dark-Gold Obsidian Citadel Overlord + Toggleable Pylon Shield Dome!
    const root = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const crownGroup = new THREE.Group();
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const toonMaterials: THREE.ShaderMaterial[] = [];
    const extraMaterials: THREE.Material[] = [];
    const outlines: THREE.Mesh[] = [];

    const armorMat = createMkToonMaterial({
      color: 0xffffff,
      map: this.textures.citadel_obsidian,
      mapStrength: 0.55,
      vertexColors: true,
      emissive: 0x360c28,
      emissiveIntensity: 0.35,
      rimStrength: 0.58,
      rimColor: 0xffd24c,
      gloss: 0.7,
    });
    const coreMat = createMkToonMaterial({
      color: 0xff3b5c,
      emissive: 0xff2644,
      emissiveIntensity: 1.6,
      rimStrength: 0.7,
      rimColor: 0xffe45e,
    });
    const shieldMat = createMkToonMaterial({
      color: 0xff2ec4,
      emissive: 0xff2644,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outlineMat = createOutlineMaterial(0.09, 0x08060e);
    toonMaterials.push(armorMat, coreMat, shieldMat);
    extraMaterials.push(outlineMat);

    const add = (p: THREE.Object3D, parts: readonly ColoredPartSpec[]) =>
      attachOutlinedParts(p, parts, armorMat, outlineMat, outlines, geometriesToDispose);

    // Towering Obsidian-Gold Citadel Plate Torso, Cathedral Pauldrons & Horned Sovereign Helm
    add(root, [
      // Armored pillar legs & armored tassets
      box(0.88, 1.9, 0.92, 0x1c1429, [-0.82, 0.95, 0]),
      box(0.88, 1.9, 0.92, 0x1c1429, [0.82, 0.95, 0]),
      box(0.96, 0.35, 1.05, 0xffc83b, [-0.82, 0.25, 0.08]),
      box(0.96, 0.35, 1.05, 0xffc83b, [0.82, 0.25, 0.08]),
      // Imperial crimson-gold waist tabard
      box(2.15, 0.75, 1.45, 0x261a38, [0, 2.05, 0]),
      box(0.86, 1.55, 0.18, 0xb81d38, [0, 1.32, 0.78]),
      box(0.92, 0.2, 0.22, 0xffc83b, [0, 0.6, 0.78]),
      // Massive Obsidian Chestplate with gold cathedral ribs
      box(2.45, 2.25, 1.58, 0x20172e, [0, 3.42, 0]),
      box(2.58, 0.24, 1.66, 0xffc83b, [0, 4.32, 0]),
      box(2.52, 0.2, 1.62, 0xffc83b, [0, 2.48, 0]),
      // Towering spiked cathedral pauldrons!
      dodec(0.96, 0x2a1d40, [-1.72, 4.35, 0]),
      cone(0.32, 1.25, 4, 0xffc83b, [-2.05, 5.25, 0], [0, 0, 0.42]),
      dodec(0.96, 0x2a1d40, [1.72, 4.35, 0]),
      cone(0.32, 1.25, 4, 0xffc83b, [2.05, 5.25, 0], [0, 0, -0.42]),
      // Flowing Sovereign Cape
      box(2.35, 3.45, 0.16, 0x8f152d, [0, 2.75, -0.98], [0.16, 0, 0]),
      box(2.44, 0.26, 0.18, 0xffc83b, [0, 1.05, -1.26], [0.16, 0, 0]),
      // Horned Obsidian Sovereign Helm
      cyl(0.68, 0.76, 1.25, 8, 0x1b1326, [0, 5.25, 0.08]),
      cyl(0.74, 0.74, 0.18, 8, 0xffc83b, [0, 5.75, 0.08]),
      cone(0.24, 1.15, 5, 0xffc83b, [-0.66, 6.0, 0.14], [0.22, 0, 0.65]),
      cone(0.24, 1.15, 5, 0xffc83b, [0.66, 6.0, 0.14], [0.22, 0, -0.65]),
    ]);

    // Glowing Crimson Chest Furnace Core & Visor Eyes
    const coreGeo = new THREE.OctahedronGeometry(0.58, 0);
    const eyeGeo = new THREE.BoxGeometry(0.92, 0.2, 0.18);
    geometriesToDispose.push(coreGeo, eyeGeo);
    const chestCore = new THREE.Mesh(coreGeo, coreMat);
    chestCore.position.set(0, 3.48, 0.88);
    const visorEye = new THREE.Mesh(eyeGeo, coreMat);
    visorEye.position.set(0, 5.26, 0.78);
    root.add(chestCore, visorEye);

    // Floating Rotating Gilded Sovereign Halo Ring behind the head!
    crownGroup.position.set(0, 5.85, -0.32);
    root.add(crownGroup);
    add(crownGroup, [
      torus(1.45, 0.14, 6, 16, 0xffc83b, [0, 0, 0]),
      octa(0.32, 0xff2644, [0, 1.45, 0]),
      octa(0.28, 0xff2644, [-1.45, 0, 0]),
      octa(0.28, 0xff2644, [1.45, 0, 0]),
      octa(0.28, 0xff2644, [0, -1.45, 0]),
    ]);

    leftArm.position.set(-1.95, 4.05, 0.15);
    rightArm.position.set(1.95, 4.05, 0.15);
    root.add(leftArm, rightArm);
    add(leftArm, [
      box(0.68, 1.95, 0.68, 0x261b38, [-0.15, -0.95, 0.15]),
      dodec(0.55, 0xffc83b, [-0.2, -2.05, 0.28]),
      // Pylon Siphon Orb held in left gauntlet
      torus(0.54, 0.08, 5, 10, 0xffc83b, [-0.2, -2.25, 0.85]),
      octa(0.36, 0xff2ec4, [-0.2, -2.25, 0.85]),
    ]);
    add(rightArm, [
      box(0.68, 1.95, 0.68, 0x261b38, [0.15, -0.95, 0.15]),
      dodec(0.55, 0xffc83b, [0.2, -2.05, 0.28]),
      // Colossal Citadel Obsidian-Gold Greatsword!
      box(1.25, 0.28, 0.34, 0xffc83b, [0.25, -1.7, 0.95], [0.55, 0, 0]),
      box(0.54, 4.4, 0.18, 0x1a1226, [0.25, 0.35, 2.2], [0.55, 0, 0]),
      box(0.2, 4.1, 0.24, 0xff3b5c, [0.25, 0.35, 2.2], [0.55, 0, 0]),
      cone(0.38, 0.95, 4, 0xffc83b, [0.25, 2.55, 3.55], [0.55, Math.PI * 0.25, 0]),
    ]);

    // Toggleable Invulnerable Pylon Energy Shield Dome!
    const shieldGeo = new THREE.IcosahedronGeometry(3.85, 1);
    geometriesToDispose.push(shieldGeo);
    const shieldDome = new THREE.Mesh(shieldGeo, shieldMat);
    shieldDome.position.set(0, 3.2, 0);
    shieldDome.visible = false;
    root.add(shieldDome);

    return {
      kind: 'FinalBoss',
      root,
      leftArm,
      rightArm,
      crownGroup,
      shieldDome,
      toonMaterials,
      dispose: () => {
        for (const g of geometriesToDispose) g.dispose();
        for (const m of toonMaterials) m.dispose();
        for (const m of extraMaterials) m.dispose();
      },
    };
  }

  // ---- Enemy Archetype Low-Poly Geometry Pairs (ALL 52 ENEMIES COVERED!) ----

  public normalizeEnemyArchetype(enemyId: string): string {
    const cached = this.enemyArchetypeNameCache.get(enemyId);
    if (cached !== undefined) return cached;
    const resolved = this.resolveEnemyArchetype(enemyId);
    this.enemyArchetypeNameCache.set(enemyId, resolved);
    return resolved;
  }

  private resolveEnemyArchetype(enemyId: string): string {
    const id = enemyId.toLowerCase();
    if (id === 'finalboss' || id === 'final_boss' || id === 'b_finalboss') return 'FinalBoss';
    if (id === 'ghostking' || id === 'ghostkingdata' || id.includes('bigbob') || id.includes('big_bob')) return 'GhostKing';
    if (id.includes('ghostham')) return 'Ghostham';
    if (id.includes('calciumdad') || id.includes('skeletonking')) return 'CalciumDad';
    if (id.includes('pharaoh3') || id.includes('juge')) return 'Pharaoh3';
    if (id.includes('pharaoh2') || id.includes('anubruh')) return 'Pharaoh2';
    if (id.includes('pharaoh') || id.includes('anubis')) return 'Pharaoh1';
    if (id === 'ent3' || id === 'entstage3' || id.includes('vader')) return 'EntStage3';
    if (id === 'ent2' || id === 'entstage2' || id.includes('chadbark')) return 'EntStage2';
    if (id === 'ent1' || id === 'entstage1' || id.includes('ent') || id.includes('bark')) return 'EntStage1';
    if (id.includes('golemsand') || id.includes('sandgolem') || id.includes('desert_golem')) return 'MinibossGolemSand';
    if (id.includes('golem')) return 'MinibossGolem';
    if (id.includes('minibossscorpion') || id.includes('scorpionussy')) return 'MinibossScorpion';
    if (id.includes('scorpion')) return 'Scorpion';
    if (id.includes('minibosspig') || id.includes('pig') || id.includes('boar') || id.includes('chunkham')) return 'MinibossPig';
    if (id.includes('mummytank') || id.includes('mummyancient')) return 'MummyTank';
    if (id.includes('mummy')) return 'Mummy';
    if (id.includes('cactus') || id === 'bush') return 'CactusShooter';
    if (id.includes('tumblebone')) return 'Tumblebone';
    if (id.includes('wisp')) return 'Wisp';
    if (id.includes('boomer') || id.includes('spider')) return 'BoomerSpider';
    if (id.includes('bee')) return 'Bee';
    if (id.includes('frog')) return 'Frog';
    if (id.includes('zombie')) return 'Zombie';
    if (id.includes('ghoul')) return 'Ghoul';
    if (id === 'head') return 'Head';
    if (id.includes('goblintank')) return 'GoblinTank';
    if (id.includes('goblinstrong') || id.includes('strong') || id.includes('brute') || id.includes('orc') || id === 'bandit') return 'GoblinStrong';
    if (id.includes('goblin')) return 'Goblin';
    if (id.includes('goldenskeleton') || id.includes('skeletongold')) return 'GoldenSkeleton';
    if (id.includes('xpskeleton') || id.includes('skeletonxp')) return 'XpSkeleton';
    if (id.includes('armoredskeleton') || id.includes('skeletonarmored')) return 'ArmoredSkeleton';
    if (id.includes('skeletondusty')) return 'SkeletonDusty';
    if (id.includes('skeleton') || id.includes('bone')) return 'Skeleton';
    if (id.includes('slime') || id.includes('blob')) return 'Slime';
    if (id === 'ghostinvincible' || id.includes('steve') || id.includes('invincible')) return 'GhostInvincible';
    if (id.includes('ghostgrave')) return 'GhostGrave';
    if (id.includes('greaterghost') || id.includes('ghostgreater')) return 'GreaterGhost';
    if (id === 'ghostred' || id.includes('redghost')) return 'GhostRed';
    if (id === 'ghostpurple' || id.includes('purple') || id.includes('wraith')) return 'GhostPurple';
    if (id.includes('ghost') || id.includes('specter')) return 'Ghost';
    return 'Goblin';
  }

  public getEnemyGeometryPair(archetypeKey: string): LowPolyGeometryPair {
    const key = this.normalizeEnemyArchetype(archetypeKey);
    const cached = this.enemyCache.get(key);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (key) {
      case 'Goblin':
        // Tall lean hunched vivid-green Goblin humanoid with long pointy ears & ragged brown loincloth!
        pair = makePair([
          // Long lean green goblin legs & feet
          cyl(0.10, 0.08, 0.68, 6, 0x2fa339, [-0.15, 0.34, 0]),
          cyl(0.10, 0.08, 0.68, 6, 0x2fa339, [0.15, 0.34, 0]),
          box(0.16, 0.09, 0.26, 0x26852e, [-0.15, 0.05, 0.05]),
          box(0.16, 0.09, 0.26, 0x26852e, [0.15, 0.05, 0.05]),
          // Ragged brown leather loincloth
          cyl(0.26, 0.30, 0.30, 6, 0x52341c, [0, 0.76, 0]),
          // Hunched lean bright-green torso
          cyl(0.24, 0.28, 0.74, 6, 0x35b83f, [0, 1.18, 0.06], [0.22, 0, 0]),
          // Lanky reaching goblin arms
          cyl(0.075, 0.065, 0.62, 5, 0x35b83f, [-0.34, 1.18, 0.14], [-0.48, 0, 0.18]),
          cyl(0.075, 0.065, 0.62, 5, 0x35b83f, [0.34, 1.18, 0.14], [-0.48, 0, -0.18]),
          // Sculpted goblin head with wide protruding pointed ears & sharp nose!
          dodec(0.26, 0x42c94c, [0, 1.66, 0.14]),
          cone(0.08, 0.22, 4, 0x4ed658, [0, 1.62, 0.40], [Math.PI * 0.5, 0, 0]),
          cone(0.09, 0.44, 4, 0x35b83f, [-0.38, 1.72, 0.10], [0, 0, 1.28]),
          cone(0.09, 0.44, 4, 0x35b83f, [0.38, 1.72, 0.10], [0, 0, -1.28]),
          box(0.09, 0.07, 0.06, 0xffe44d, [-0.10, 1.70, 0.36]),
          box(0.09, 0.07, 0.06, 0xffe44d, [0.10, 1.70, 0.36]),
        ], 'character_palette', 0.038);
        break;

      case 'GoblinStrong':
      case 'GoblinTank': {
        const isTank = key === 'GoblinTank';
        const parts: ColoredPartSpec[] = [
          cyl(0.46, 0.42, 0.96, 6, 0x2c8a43, [0, 1.0, 0]),
          box(0.92, 0.46, 0.56, isTank ? 0x364152 : 0x4d596b, [0, 1.18, 0]),
          dodec(0.28, 0x627085, [-0.56, 1.38, 0]),
          dodec(0.28, 0x627085, [0.56, 1.38, 0]),
          box(0.24, 0.54, 0.26, 0x247337, [-0.22, 0.28, 0]),
          box(0.24, 0.54, 0.26, 0x247337, [0.22, 0.28, 0]),
          dodec(0.36, 0x39a350, [0, 1.66, 0.1]),
          cyl(0.38, 0.4, 0.28, 7, 0x4d596b, [0, 1.84, 0.08]),
          cone(0.1, 0.45, 5, 0xf2ebd9, [-0.36, 2.02, 0.12], [0.2, 0, 0.55]),
          cone(0.1, 0.45, 5, 0xf2ebd9, [0.36, 2.02, 0.12], [0.2, 0, -0.55]),
          box(0.12, 0.08, 0.06, 0xff4d4d, [-0.14, 1.68, 0.42]),
          box(0.12, 0.08, 0.06, 0xff4d4d, [0.14, 1.68, 0.42]),
          cyl(0.06, 0.06, 1.35, 6, 0x6e4326, [0.64, 1.25, 0.42], [0.5, 0, -0.2]),
          box(0.42, 0.36, 0.12, 0xc2d0e0, [0.74, 1.72, 0.72], [0.5, 0, -0.2]),
        ];
        if (isTank) {
          parts.push(box(0.86, 1.15, 0.16, 0x4b5563, [-0.62, 1.05, 0.48], [0, 0.35, 0]), box(0.24, 0.24, 0.2, 0xffc83b, [-0.66, 1.05, 0.56]));
        }
        pair = makePair(parts, 'metal_armor', 0.058, { gloss: 0.35 });
        break;
      }

      case 'Skeleton':
      case 'GoldenSkeleton':
      case 'XpSkeleton':
      case 'ArmoredSkeleton':
      case 'SkeletonDusty': {
        const boneCol =
          key === 'GoldenSkeleton' ? 0xffd23f : key === 'XpSkeleton' ? 0x6ef7ff : key === 'SkeletonDusty' ? 0xd9c298 : 0xf2ebd9;
        const sashCol =
          key === 'GoldenSkeleton' ? 0xd97706 : key === 'XpSkeleton' ? 0x2563eb : key === 'SkeletonDusty' ? 0x9c5a2d : 0x5c377d;
        const parts: ColoredPartSpec[] = [
          cyl(0.07, 0.08, 0.72, 6, boneCol, [0, 1.0, 0]),
          box(0.5, 0.09, 0.3, boneCol, [0, 1.24, 0]),
          box(0.44, 0.08, 0.26, boneCol, [0, 1.08, 0]),
          box(0.36, 0.08, 0.22, boneCol, [0, 0.92, 0]),
          box(0.42, 0.28, 0.3, sashCol, [0, 0.66, 0]),
          cyl(0.065, 0.06, 0.56, 5, boneCol, [-0.16, 0.28, 0]),
          cyl(0.065, 0.06, 0.56, 5, boneCol, [0.16, 0.28, 0]),
          dodec(0.32, boneCol, [0, 1.62, 0.04]),
          box(0.26, 0.14, 0.2, boneCol, [0, 1.4, 0.14]),
          box(0.11, 0.11, 0.08, 0x141724, [-0.11, 1.62, 0.31]),
          box(0.11, 0.11, 0.08, 0x141724, [0.11, 1.62, 0.31]),
          cyl(0.055, 0.055, 0.48, 5, boneCol, [0.38, 1.06, 0.16], [-0.7, 0, -0.2]),
          box(0.14, 0.92, 0.08, 0xb8c5d6, [0.46, 1.44, 0.5], [0.55, 0, 0]),
        ];
        if (key === 'ArmoredSkeleton') {
          parts.push(
            box(0.62, 0.52, 0.38, 0x5c6b7a, [0, 1.1, 0]),
            cyl(0.36, 0.38, 0.26, 7, 0x64748b, [0, 1.78, 0.04]),
          );
        }
        pair = makePair(parts, 'bone_ivory', 0.048, {
          emissiveHex: key === 'GoldenSkeleton' ? 0xb45309 : key === 'XpSkeleton' ? 0x0ea5e9 : 0x000000,
          emissiveIntensity: key === 'GoldenSkeleton' || key === 'XpSkeleton' ? 0.35 : 0,
        });
        break;
      }

      case 'Slime':
        pair = makePair([
          dodec(0.68, 0x3ce8c6, [0, 0.52, 0], undefined, [1.18, 0.85, 1.15]),
          dodec(0.28, 0x2ad1b0, [-0.52, 0.2, 0.3]),
          dodec(0.26, 0x2ad1b0, [0.52, 0.18, -0.22]),
          dodec(0.24, 0x2ad1b0, [0.1, 0.18, -0.58]),
          box(0.14, 0.16, 0.1, 0x121824, [-0.22, 0.58, 0.68]),
          box(0.14, 0.16, 0.1, 0x121824, [0.22, 0.58, 0.68]),
          box(0.06, 0.06, 0.11, 0xffffff, [-0.19, 0.62, 0.69]),
          box(0.06, 0.06, 0.11, 0xffffff, [0.25, 0.62, 0.69]),
          cyl(0.24, 0.18, 0.2, 6, 0xffd23f, [0, 1.12, 0]),
          octa(0.07, 0xff3b5c, [0, 1.16, 0.2]),
        ], 'slime_gel', 0.052, { gloss: 0.72 });
        break;

      case 'Ghoul':
      case 'Zombie': {
        const isZ = key === 'Zombie';
        const skin = isZ ? 0x6ba854 : 0x7a9c86;
        const coat = isZ ? 0x3f475c : 0x2e3342;
        pair = makePair([
          cyl(0.3, 0.36, 0.78, 6, coat, [0, 0.88, 0.06], [0.25, 0, 0]),
          cyl(0.11, 0.1, 0.5, 5, 0x2d3445, [-0.16, 0.26, 0]),
          cyl(0.11, 0.1, 0.5, 5, 0x2d3445, [0.16, 0.26, 0]),
          dodec(0.34, skin, [0, 1.44, 0.18]),
          box(0.11, 0.08, 0.06, isZ ? 0xff4d5e : 0xb8ff3b, [-0.12, 1.48, 0.48]),
          box(0.11, 0.08, 0.06, isZ ? 0xff4d5e : 0xb8ff3b, [0.12, 1.48, 0.48]),
          // Outstretched shambling arms!
          cyl(0.09, 0.08, 0.68, 5, skin, [-0.36, 1.18, 0.42], [1.28, 0, 0]),
          cyl(0.09, 0.08, 0.68, 5, skin, [0.36, 1.18, 0.42], [1.28, 0, 0]),
        ], 'character_palette', 0.05);
        break;
      }

      case 'BoomerSpider':
        // 6-legged explosive spider with glowing volatile amber-crimson abdomen!
        pair = makePair([
          dodec(0.42, 0x262030, [0, 0.58, 0.38]),
          ico(0.66, 0xff4d2e, [0, 0.84, -0.44], undefined, [1.05, 0.92, 1.2]),
          octa(0.24, 0xffe45e, [0, 1.18, -0.48]),
          box(0.12, 0.1, 0.08, 0xffe45e, [-0.16, 0.66, 0.74]),
          box(0.12, 0.1, 0.08, 0xffe45e, [0.16, 0.66, 0.74]),
          // 6 jointed spider legs
          cyl(0.07, 0.05, 0.95, 5, 0x1e1926, [-0.62, 0.42, 0.35], [0.2, 0, 0.85]),
          cyl(0.07, 0.05, 0.95, 5, 0x1e1926, [0.62, 0.42, 0.35], [0.2, 0, -0.85]),
          cyl(0.07, 0.05, 0.98, 5, 0x1e1926, [-0.72, 0.42, -0.05], [0, 0, 0.9]),
          cyl(0.07, 0.05, 0.98, 5, 0x1e1926, [0.72, 0.42, -0.05], [0, 0, -0.9]),
          cyl(0.07, 0.05, 0.95, 5, 0x1e1926, [-0.64, 0.42, -0.48], [-0.25, 0, 0.85]),
          cyl(0.07, 0.05, 0.95, 5, 0x1e1926, [0.64, 0.42, -0.48], [-0.25, 0, -0.85]),
        ], 'character_palette', 0.052, { emissiveHex: 0xcc2818, emissiveIntensity: 0.3 });
        break;

      case 'Bee':
        pair = makePair([
          dodec(0.45, 0xffd23f, [0, 1.0, 0.1], undefined, [0.9, 0.88, 1.35]),
          cyl(0.44, 0.44, 0.18, 7, 0x1a1c26, [0, 1.0, 0.2], [Math.PI * 0.5, 0, 0]),
          cyl(0.42, 0.42, 0.18, 7, 0x1a1c26, [0, 1.0, -0.18], [Math.PI * 0.5, 0, 0]),
          cone(0.14, 0.42, 5, 0x1a1c26, [0, 0.96, -0.78], [-Math.PI * 0.5, 0, 0]),
          box(0.58, 0.06, 0.34, 0xe0f7ff, [-0.46, 1.38, 0.04], [0, 0.15, 0.42]),
          box(0.58, 0.06, 0.34, 0xe0f7ff, [0.46, 1.38, 0.04], [0, -0.15, -0.42]),
          box(0.12, 0.12, 0.08, 0x12151f, [-0.16, 1.08, 0.64]),
          box(0.12, 0.12, 0.08, 0x12151f, [0.16, 1.08, 0.64]),
        ], 'character_palette', 0.046);
        break;

      case 'Frog':
        pair = makePair([
          dodec(0.54, 0x62d952, [0, 0.46, 0], undefined, [1.15, 0.82, 1.1]),
          dodec(0.22, 0xfff5c2, [-0.26, 0.84, 0.24]),
          dodec(0.22, 0xfff5c2, [0.26, 0.84, 0.24]),
          box(0.1, 0.1, 0.08, 0x121622, [-0.26, 0.86, 0.42]),
          box(0.1, 0.1, 0.08, 0x121622, [0.26, 0.86, 0.42]),
          box(0.26, 0.14, 0.42, 0x4cb83e, [-0.48, 0.14, -0.14]),
          box(0.26, 0.14, 0.42, 0x4cb83e, [0.48, 0.14, -0.14]),
        ], 'character_palette', 0.048);
        break;

      case 'Mummy':
      case 'MummyTank': {
        // Tall full-height dusty-grey linen-wrapped Desert Mummy warrior!
        const isTank = key === 'MummyTank';
        const sx = isTank ? 1.32 : 1.0;
        const wrapCol = 0xc9c4b8;
        const wrapDark = 0x999488;
        const parts: ColoredPartSpec[] = [
          // Tall bandaged humanoid legs
          cyl(0.13 * sx, 0.11 * sx, 0.78, 6, wrapDark, [-0.17 * sx, 0.39, 0]),
          cyl(0.13 * sx, 0.11 * sx, 0.78, 6, wrapDark, [0.17 * sx, 0.39, 0]),
          box(0.20 * sx, 0.10, 0.28, wrapDark, [-0.17 * sx, 0.05, 0.05]),
          box(0.20 * sx, 0.10, 0.28, wrapDark, [0.17 * sx, 0.05, 0.05]),
          // Athletic wrapped mummy torso & shoulders
          lathePart(
            [
              [0.30 * sx, 0.76],
              [0.26 * sx, 0.96],
              [0.36 * sx, 1.36],
              [0.40 * sx, 1.54],
              [0.22 * sx, 1.64],
            ],
            7,
            wrapCol,
          ),
          // Wrapped mummy head with dark recessed eye slit!
          dodec(0.27, wrapCol, [0, 1.84, 0.04]),
          box(0.28, 0.10, 0.09, 0x1a1816, [0, 1.85, 0.26]),
          box(0.08, 0.06, 0.08, 0xffc83b, [-0.09, 1.85, 0.29]),
          box(0.08, 0.06, 0.08, 0xffc83b, [0.09, 1.85, 0.29]),
          // Hanging heavy bandaged mummy arms
          cyl(0.10 * sx, 0.09 * sx, 0.74, 6, wrapCol, [-0.42 * sx, 1.24, 0.12], [-0.36, 0, 0.14]),
          cyl(0.10 * sx, 0.09 * sx, 0.74, 6, wrapCol, [0.42 * sx, 1.24, 0.12], [-0.36, 0, -0.14]),
        ];
        if (isTank) {
          parts.push(box(1.06, 0.72, 0.62, 0xc79a36, [0, 1.22, 0]), box(0.36, 0.36, 0.14, 0x38f2ff, [0, 1.26, 0.34]));
        }
        pair = makePair(parts, 'mummy_wraps', isTank ? 0.054 : 0.040);
        break;
      }

      case 'Scorpion':
      case 'MinibossScorpion': {
        const isMb = key === 'MinibossScorpion';
        const shell = isMb ? 0x7a1e2e : 0xa64b2a;
        const accent = isMb ? 0xffc83b : 0xd97a38;
        const venom = 0x76ff3b;
        const parts: ColoredPartSpec[] = [
          // Segmented armored arachnid thorax
          dodec(0.76, shell, [0, 0.56, 0], undefined, [1.18, 0.62, 1.48]),
          box(1.1, 0.24, 0.92, accent, [0, 0.78, -0.05]),
          // Twin snapping scorpion pincers extending forward!
          box(0.28, 0.22, 0.78, shell, [-0.72, 0.56, 0.88], [0, -0.35, 0]),
          cone(0.22, 0.48, 5, accent, [-0.88, 0.58, 1.38], [Math.PI * 0.5, 0.25, 0]),
          box(0.28, 0.22, 0.78, shell, [0.72, 0.56, 0.88], [0, 0.35, 0]),
          cone(0.22, 0.48, 5, accent, [0.88, 0.58, 1.38], [Math.PI * 0.5, -0.25, 0]),
          // Towering curved segmented overhead tail + glowing venom stinger!
          box(0.34, 0.56, 0.34, shell, [0, 1.02, -0.88], [-0.45, 0, 0]),
          box(0.28, 0.64, 0.28, accent, [0, 1.56, -0.96], [0.22, 0, 0]),
          box(0.24, 0.58, 0.24, shell, [0, 2.02, -0.52], [1.1, 0, 0]),
          cone(0.18, 0.62, 5, venom, [0, 2.02, 0.08], [Math.PI * 0.62, 0, 0]),
          // Eyes
          box(0.12, 0.1, 0.08, venom, [-0.22, 0.74, 0.94]),
          box(0.12, 0.1, 0.08, venom, [0.22, 0.74, 0.94]),
          // 6 jointed legs
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [-0.92, 0.32, 0.38], [0, 0, 0.9]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [0.92, 0.32, 0.38], [0, 0, -0.9]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [-0.98, 0.32, -0.05], [0, 0, 0.95]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [0.98, 0.32, -0.05], [0, 0, -0.95]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [-0.9, 0.32, -0.48], [0, 0, 0.9]),
          cyl(0.08, 0.06, 0.85, 5, 0x3b1f18, [0.9, 0.32, -0.48], [0, 0, -0.9]),
        ];
        if (isMb) {
          parts.push(cyl(0.45, 0.35, 0.3, 6, 0xffd23f, [0, 1.05, 0.3]));
        }
        pair = makePair(parts, 'character_palette', isMb ? 0.072 : 0.054, {
          emissiveHex: isMb ? 0x2b6e16 : 0x164a0a,
          emissiveIntensity: 0.25,
          gloss: 0.45,
        });
        break;
      }

      case 'CactusShooter':
        pair = makePair([
          cyl(0.4, 0.46, 1.9, 7, 0x4ca642, [0, 0.95, 0]),
          cyl(0.2, 0.22, 0.78, 6, 0x45993b, [-0.56, 1.15, 0], [0, 0, 0.7]),
          cyl(0.2, 0.22, 0.72, 6, 0x45993b, [0.56, 0.95, 0], [0, 0, -0.7]),
          box(0.14, 0.14, 0.08, 0x141724, [-0.16, 1.32, 0.42]),
          box(0.14, 0.14, 0.08, 0x141724, [0.16, 1.32, 0.42]),
          octa(0.28, 0xff4d88, [0, 2.02, 0]), // cactus blossom cannon!
        ], 'desert_cactus', 0.054);
        break;

      case 'Wisp':
        pair = makePair([
          octa(0.48, 0xffe45e, [0, 1.05, 0], undefined, [1.0, 1.35, 1.0]),
          torus(0.68, 0.07, 5, 10, 0xff8b1f, [0, 1.05, 0], [0.6, 0.4, 0]),
          octa(0.16, 0xffffff, [-0.56, 1.25, 0.3]),
          octa(0.16, 0xffffff, [0.56, 0.85, -0.3]),
        ], 'character_palette', 0.044, { emissiveHex: 0xff8b1f, emissiveIntensity: 0.75 });
        break;

      case 'Tumblebone':
        pair = makePair([
          ico(0.62, 0xd6c39c, [0, 0.65, 0]),
          cone(0.14, 0.42, 4, 0xfaf5e6, [0.55, 0.8, 0.2], [0, 0, -1.2]),
          cone(0.14, 0.42, 4, 0xfaf5e6, [-0.55, 0.75, -0.2], [0, 0, 1.2]),
          cone(0.14, 0.42, 4, 0xfaf5e6, [0, 1.18, 0.2]),
          box(0.14, 0.14, 0.08, 0x141724, [-0.14, 0.72, 0.56]),
          box(0.14, 0.14, 0.08, 0x141724, [0.14, 0.72, 0.56]),
        ], 'bone_ivory', 0.048);
        break;

      case 'Head':
        // Floating cackling graveyard skull-head!
        pair = makePair([
          dodec(0.56, 0xe8e2d5, [0, 1.05, 0]),
          box(0.48, 0.26, 0.36, 0xdcd4c4, [0, 0.62, 0.18]),
          box(0.18, 0.18, 0.12, 0x100c1a, [-0.19, 1.08, 0.48]),
          box(0.18, 0.18, 0.12, 0x100c1a, [0.19, 1.08, 0.48]),
          box(0.08, 0.08, 0.14, 0xc05eff, [-0.19, 1.08, 0.5]),
          box(0.08, 0.08, 0.14, 0xc05eff, [0.19, 1.08, 0.5]),
        ], 'bone_ivory', 0.052, { emissiveHex: 0x6b21a8, emissiveIntensity: 0.22 });
        break;

      case 'MinibossGolem':
      case 'MinibossGolemSand': {
        // SCULPTED ANCIENT MONOLITH TITAN (replaces 6 floating gray blocks!)
        const isSand = key === 'MinibossGolemSand';
        const rockA = isSand ? 0xd99e4e : 0x647585;
        const rockB = isSand ? 0xb37032 : 0x4f6070;
        const rockC = isSand ? 0x874e24 : 0x3b4957;
        const capCol = isSand ? 0xf5c542 : 0x4aa844;
        const coreCol = isSand ? 0xffae19 : 0x52f7ff;
        const parts: ColoredPartSpec[] = [
          // Chiseled monolithic torso carapace housing a blazing recessed energy furnace!
          { geo: createCraggySpireGeometry(1.18, 1.95, isSand ? 21 : 7, 0.72), color: rockA, pos: [0, 1.12, 0] },
          // Carved obsidian-stone chest ribs framing the glowing core
          box(1.52, 0.24, 0.42, rockB, [0, 2.52, 0.68], [0.12, 0, 0]),
          box(1.24, 0.22, 0.38, rockB, [0, 1.56, 0.62], [-0.12, 0, 0]),
          box(0.32, 1.05, 0.36, rockC, [-0.58, 2.04, 0.68]),
          box(0.32, 1.05, 0.36, rockC, [0.58, 2.04, 0.68]),
          // Blazing faceted runic crystal furnace inside the ribs!
          octa(0.46, coreCol, [0, 2.04, 0.66], undefined, [0.95, 1.25, 0.78]),
          torus(0.56, 0.075, 5, 8, coreCol, [0, 2.04, 0.74]),
          // Towering asymmetric craggy cliff-boulder pauldrons with moss/gilded caps & stone spires!
          { geo: createCraggySpireGeometry(0.86, 1.35, 13, 0.45), color: rockB, pos: [-1.42, 2.15, 0.04], rot: [0.06, 0.3, 0.32] },
          { geo: createCraggySpireGeometry(0.92, 1.52, 31, 0.38), color: rockB, pos: [1.46, 2.18, -0.04], rot: [-0.05, -0.4, -0.34] },
          { geo: createSculptedCanopyCluster(0.62, 0.52, 9), color: capCol, pos: [-1.52, 3.22, 0.05] },
          { geo: createSculptedCanopyCluster(0.66, 0.50, 17), color: capCol, pos: [1.56, 3.36, -0.04] },
          // Massive chiselled stone forearms & beveled slam-fists
          { geo: createCraggySpireGeometry(0.52, 1.48, 41, 0.68), color: rockB, pos: [-1.52, 0.68, 0.36], rot: [0.22, 0, 0.08] },
          { geo: createCraggySpireGeometry(0.52, 1.48, 53, 0.68), color: rockB, pos: [1.52, 0.68, 0.36], rot: [0.22, 0, -0.08] },
          box(0.82, 0.72, 0.86, rockC, [-1.58, 0.56, 0.52], [0.1, 0.2, 0]),
          box(0.82, 0.72, 0.86, rockC, [1.58, 0.56, 0.52], [0.1, -0.2, 0]),
          // Banded glowing wrist runes
          box(0.68, 0.14, 0.68, coreCol, [-1.54, 1.06, 0.44]),
          box(0.68, 0.14, 0.68, coreCol, [1.54, 1.06, 0.44]),
          // Pillar legs rooted solidly on the earth
          { geo: createCraggySpireGeometry(0.54, 1.25, 61, 0.78), color: rockC, pos: [-0.58, 0.0, 0] },
          { geo: createCraggySpireGeometry(0.54, 1.25, 67, 0.78), color: rockC, pos: [0.58, 0.0, 0] },
          // Ancient carved monolithic sentinel head with recessed glowing visor & crown horns!
          { geo: createCraggySpireGeometry(0.56, 1.08, 79, 0.66), color: rockA, pos: [0, 2.86, 0.16] },
          box(0.74, 0.22, 0.28, rockC, [0, 3.44, 0.48]),
          box(0.62, 0.14, 0.14, coreCol, [0, 3.28, 0.56]),
          cone(0.18, 0.62, 5, coreCol, [-0.54, 3.68, 0.12], [0, 0, 0.38]),
          cone(0.18, 0.62, 5, coreCol, [0.54, 3.68, 0.12], [0, 0, -0.38]),
        ];
        pair = makePair(parts, isSand ? 'desert_sandstone' : 'stone_golem', 0.068, {
          emissiveHex: isSand ? 0xb55a14 : 0x1aa8cc,
          emissiveIntensity: 0.36,
          gloss: 0.28,
        });
        break;
      }

      case 'MinibossPig':
      case 'Ghostham': {
        const isGhost = key === 'Ghostham';
        const body = isGhost ? 0x80d8ff : 0xc97b70;
        const armor = isGhost ? 0x4b2a85 : 0x4b5563;
        const trim = isGhost ? 0x70f5ff : 0xffc83b;
        const crest = isGhost ? 0xc05eff : 0xd62839;
        pair = makePair([
          dodec(0.95, body, [0, 1.08, 0], undefined, [1.05, 0.92, 1.38]),
          box(1.56, 0.82, 1.15, armor, [0, 1.24, 0.05]),
          box(1.66, 0.16, 1.24, trim, [0, 1.24, 0.05]),
          cone(0.22, 0.52, 4, crest, [0, 1.88, 0.45]),
          cone(0.22, 0.56, 4, crest, [0, 1.9, 0.0]),
          cone(0.2, 0.48, 4, crest, [0, 1.84, -0.45]),
          cyl(0.36, 0.46, 0.52, 7, isGhost ? 0xa6ecff : 0xe6978c, [0, 1.0, 1.34], [Math.PI * 0.5, 0, 0]),
          cone(0.14, 0.72, 5, isGhost ? 0x70f5ff : 0xfff8e6, [-0.46, 1.18, 1.44], [0.75, 0, 0.35]),
          cone(0.14, 0.72, 5, isGhost ? 0x70f5ff : 0xfff8e6, [0.46, 1.18, 1.44], [0.75, 0, -0.35]),
          box(0.18, 0.12, 0.1, isGhost ? 0xff2ec4 : 0xffd23f, [-0.42, 1.38, 1.06]),
          box(0.18, 0.12, 0.1, isGhost ? 0xff2ec4 : 0xffd23f, [0.42, 1.38, 1.06]),
          cyl(0.2, 0.18, 0.62, 6, isGhost ? 0x3b246e : 0x3b3033, [-0.54, 0.31, 0.62]),
          cyl(0.2, 0.18, 0.62, 6, isGhost ? 0x3b246e : 0x3b3033, [0.54, 0.31, 0.62]),
          cyl(0.2, 0.18, 0.62, 6, isGhost ? 0x3b246e : 0x3b3033, [-0.54, 0.31, -0.62]),
          cyl(0.2, 0.18, 0.62, 6, isGhost ? 0x3b246e : 0x3b3033, [0.54, 0.31, -0.62]),
        ], isGhost ? 'spectral_ectoplasm' : 'character_palette', 0.068, {
          emissiveHex: isGhost ? 0x5c2d91 : 0x000000,
          emissiveIntensity: isGhost ? 0.35 : 0,
        });
        break;
      }

      case 'CalciumDad':
        // Crowned Skeleton King Miniboss w/ royal purple cloak & giant bone greatsword!
        pair = makePair([
          cyl(0.18, 0.2, 1.25, 6, 0xf5f0de, [0, 1.65, 0]),
          box(1.12, 0.18, 0.64, 0xf5f0de, [0, 2.05, 0.04]),
          box(0.96, 0.16, 0.56, 0xf5f0de, [0, 1.72, 0.04]),
          box(0.8, 0.16, 0.48, 0xf5f0de, [0, 1.4, 0.04]),
          octa(0.32, 0x5cf7ff, [0, 1.82, 0.12]), // soul-fire ribcage heart
          box(1.22, 2.15, 0.16, 0x592680, [0, 1.25, -0.45], [0.15, 0, 0]),
          cyl(0.16, 0.14, 1.05, 6, 0xf2ebd9, [-0.36, 0.52, 0]),
          cyl(0.16, 0.14, 1.05, 6, 0xf2ebd9, [0.36, 0.52, 0]),
          // Giant crowned skull
          dodec(0.68, 0xfaf5e6, [0, 2.75, 0.06]),
          box(0.54, 0.26, 0.42, 0xf2ebd9, [0, 2.28, 0.26]),
          box(0.22, 0.2, 0.14, 0x100c1a, [-0.22, 2.78, 0.64]),
          box(0.22, 0.2, 0.14, 0x100c1a, [0.22, 2.78, 0.64]),
          box(0.1, 0.1, 0.16, 0x5cf7ff, [-0.22, 2.78, 0.66]),
          box(0.1, 0.1, 0.16, 0x5cf7ff, [0.22, 2.78, 0.66]),
          cyl(0.66, 0.52, 0.42, 6, 0xffd23f, [0, 3.45, 0.06]),
          octa(0.18, 0xff2ec4, [0, 3.48, 0.64]),
          // Giant two-handed bone greatsword
          box(0.34, 2.4, 0.14, 0xfaf5e6, [0.95, 2.1, 0.72], [0.45, 0, -0.15]),
          box(0.86, 0.18, 0.2, 0xffd23f, [0.88, 1.15, 0.28], [0.45, 0, -0.15]),
        ], 'bone_ivory', 0.072, { emissiveHex: 0x3b186e, emissiveIntensity: 0.25 });
        break;

      case 'Ghost':
      case 'GreaterGhost':
      case 'GhostPurple':
      case 'GhostRed':
      case 'GhostGrave':
      case 'GhostInvincible': {
        const isSteve = key === 'GhostInvincible';
        const isRed = key === 'GhostRed';
        const isPurple = key === 'GhostPurple';
        const isGreater = key === 'GreaterGhost';
        const isGrave = key === 'GhostGrave';
        const cloakColor = isSteve
          ? 0xff2e54
          : isRed
            ? 0xe63946
            : isPurple
              ? 0x9b5de5
              : isGreater
                ? 0x221b33
                : isGrave
                  ? 0x4dffbe
                  : 0xbde8ff;
        const eyeColor = isSteve
          ? 0xffe45e
          : isRed
            ? 0xfff0a3
            : isPurple
              ? 0xff66f5
              : isGreater
                ? 0xff3b5c
                : 0xffffff;
        const parts: ColoredPartSpec[] = [
          cone(0.56, 1.45, 7, cloakColor, [0, 1.05, 0]),
          cone(0.2, 0.48, 4, cloakColor, [-0.36, 0.34, 0.16], [Math.PI, 0, 0.15]),
          cone(0.2, 0.54, 4, cloakColor, [0.36, 0.32, 0.16], [Math.PI, 0, -0.15]),
          cone(0.22, 0.56, 4, cloakColor, [0, 0.3, -0.36], [Math.PI, 0, 0]),
          dodec(0.42, cloakColor, [0, 1.72, 0.02]),
          cone(0.32, 0.52, 5, cloakColor, [0, 2.04, -0.18], [-0.55, 0, 0]),
          box(0.42, 0.38, 0.24, 0x0b0c14, [0, 1.66, 0.26]),
          box(0.12, 0.09, 0.08, eyeColor, [-0.12, 1.7, 0.39]),
          box(0.12, 0.09, 0.08, eyeColor, [0.12, 1.7, 0.39]),
          cone(0.18, 0.65, 5, cloakColor, [-0.54, 1.18, 0.24], [1.1, 0, 0.35]),
          cone(0.18, 0.65, 5, cloakColor, [0.54, 1.18, 0.24], [1.1, 0, -0.35]),
        ];
        if (isSteve) {
          parts.push(
            cyl(0.4, 0.32, 0.28, 6, 0xffd23f, [0, 2.18, 0.02]),
            octa(0.14, 0xff2ec4, [0, 2.24, 0.32]),
          );
        } else if (isGreater) {
          parts.push(
            cone(0.1, 0.4, 4, 0xff3b5c, [-0.32, 2.08, 0.04], [0.15, 0, 0.45]),
            cone(0.1, 0.4, 4, 0xff3b5c, [0.32, 2.08, 0.04], [0.15, 0, -0.45]),
          );
        } else if (isGrave) {
          // Tombstone shoulder shackles!
          parts.push(
            box(0.42, 0.62, 0.14, 0x5c647a, [-0.56, 1.56, -0.12], [0, 0.2, 0.25]),
            box(0.42, 0.62, 0.14, 0x5c647a, [0.56, 1.56, -0.12], [0, -0.2, -0.25]),
          );
        }
        pair = makePair(parts, 'spectral_ectoplasm', isSteve ? 0.072 : 0.052, {
          emissiveHex: isSteve ? 0x6b0f32 : cloakColor,
          emissiveIntensity: isSteve ? 0.48 : 0.24,
        });
        break;
      }

      default:
        pair = this.getEnemyGeometryPair('Goblin');
        break;
    }

    this.enemyCache.set(key, pair);
    return pair;
  }

  // ---- Stylized Biome Props (ALL 4 BIOMES!) ----

  public getPropGeometryPair(kind: PropKind): LowPolyGeometryPair {
    const cached = this.propCache.get(kind);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (kind) {
      case 'pine':
        // Valheim / PS1 Tall Woodland Pine: sturdy dark trunk & layered earthy dappled pixel-pine boughs!
        pair = makePair([
          lathePart([[0.64, 0.0], [0.42, 0.8], [0.30, 2.8], [0.20, 4.8]], 7, 0x5c3822),
          lathePart([[0.08, 2.5], [1.35, 1.25], [2.25, 0.25], [1.95, 0.0]], 7, 0xc4d4b8, [0, 2.4, 0], [0.03, 0.2, 0.02]),
          lathePart([[0.06, 2.2], [1.12, 1.08], [1.85, 0.22], [1.60, 0.0]], 7, 0xd1dec4, [0.05, 3.85, -0.04], [-0.03, 0.75, -0.03]),
          lathePart([[0.05, 1.9], [0.88, 0.92], [1.45, 0.18], [1.22, 0.0]], 7, 0xdde8d1, [-0.04, 5.25, 0.05], [0.02, 1.3, 0.02]),
          lathePart([[0.02, 1.65], [0.58, 0.74], [0.95, 0.14], [0.78, 0.0]], 6, 0xe8f2dc, [0.03, 6.45, -0.02], [-0.02, 1.8, 0]),
        ], 'foliage_pine', 0.054);
        break;

      case 'oak':
        // SIGNATURE VALHEIM / PS1 CROOKED WOODLAND TREE: tall lean dark bark trunk, forked limbs & bold dappled pixel-leaf puff clusters!
        pair = makePair([
          // Tall crooked dark trunk with subtle organic bend
          lathePart([[0.68, 0.0], [0.42, 0.85], [0.34, 2.6], [0.28, 4.1]], 7, 0x59341e, [0, 0, 0], [0.05, 0, 0.06]),
          cyl(0.18, 0.28, 2.25, 6, 0x52301b, [-0.72, 4.15, 0.25], [0.18, 0, 0.56]),
          cyl(0.16, 0.26, 2.35, 6, 0x52301b, [0.78, 4.35, -0.22], [-0.15, 0, -0.52]),
          cyl(0.14, 0.22, 1.85, 6, 0x4a2a17, [0.10, 4.55, 0.65], [0.52, 0, -0.08]),
          // Bold Valheim multi-puff dappled leaf clusters (white/pale-sage vertex tint so foliage_oak pixel art shines at 100% fidelity!)
          { geo: createSculptedCanopyCluster(1.85, 0.86, 3), color: 0xd6e0cc, pos: [0.05, 5.55, 0.0] },
          { geo: createSculptedCanopyCluster(1.48, 0.84, 11), color: 0xc9d6be, pos: [-1.48, 4.85, 0.48] },
          { geo: createSculptedCanopyCluster(1.44, 0.82, 19), color: 0xdce6d1, pos: [1.52, 5.05, -0.44] },
          { geo: createSculptedCanopyCluster(1.24, 0.80, 29), color: 0xe6edd8, pos: [0.22, 5.35, 1.18] },
          { geo: createSculptedCanopyCluster(1.32, 0.82, 43), color: 0xf0f5e4, pos: [0.14, 6.55, 0.12] },
        ], 'foliage_oak', 0.058);
        break;

      case 'castle_tower':
        // ICONIC MOSSY RUINED STONE-BRICK CASTLE TOWER DRAPED IN GREEN PIXEL IVY!
        pair = makePair([
          // Wide weathered cylindrical stone base & tall tower body
          cyl(4.15, 4.45, 2.2, 12, 0xc8cfd4, [0, 1.1, 0]),
          cyl(3.85, 4.10, 9.6, 12, 0xd8dfe3, [0, 6.8, 0]),
          // Upper flared parapet gallery collar
          cyl(4.35, 3.95, 1.35, 12, 0xcfd6db, [0, 12.1, 0]),
          // Broken notched medieval crenelated merlon battlements around the crown!
          box(1.55, 1.55, 1.15, 0xd6dde0, [0.0, 13.45, 3.72]),
          box(1.55, 1.45, 1.15, 0xcdd4d9, [3.22, 13.40, 1.86], [0, Math.PI / 3, 0]),
          box(1.55, 1.60, 1.15, 0xd6dde0, [3.22, 13.48, -1.86], [0, (2 * Math.PI) / 3, 0]),
          box(1.45, 1.15, 1.15, 0xc5ccd1, [0.0, 13.25, -3.72]),
          box(1.55, 1.55, 1.15, 0xd6dde0, [-3.22, 13.45, -1.86], [0, Math.PI / 3, 0]),
          box(1.55, 1.40, 1.15, 0xc8cfd4, [-3.22, 13.38, 1.86], [0, (2 * Math.PI) / 3, 0]),
          // Recessed dark medieval arrow-slit windows
          box(0.46, 1.65, 0.35, 0x161a21, [0, 8.2, 3.88]),
          box(0.46, 1.65, 0.35, 0x161a21, [3.88, 7.6, 0], [0, Math.PI * 0.5, 0]),
          box(0.46, 1.65, 0.35, 0x161a21, [-3.88, 8.6, 0], [0, Math.PI * 0.5, 0]),
          // Crumbled mossy base stones
          box(1.85, 1.25, 1.45, 0xb8c0c7, [3.65, 0.62, 2.35], [0.08, 0.5, -0.06]),
          box(1.55, 0.95, 1.35, 0xadb6bd, [-3.85, 0.48, 2.15], [-0.06, -0.4, 0.08]),
        ], 'shrine_rune', 0.088, { uvScale: [4.2, 2.6] });
        break;

      case 'castle_wall':
        // Ruined ivy-draped medieval stone fortress curtain wall segment with broken battlements!
        pair = makePair([
          box(11.5, 5.2, 2.35, 0xd4dbe0, [0, 2.6, 0]),
          box(11.8, 0.85, 2.75, 0xc5cdd4, [0, 5.45, 0]),
          // Broken crenelated merlons along top
          box(1.65, 1.45, 1.05, 0xd8dfe3, [-4.4, 6.55, 0.72]),
          box(1.65, 1.35, 1.05, 0xcfd6db, [-1.5, 6.50, 0.72]),
          box(1.45, 0.85, 1.05, 0xc2cad1, [1.5, 6.25, 0.72]),
          box(1.65, 1.50, 1.05, 0xd8dfe3, [4.4, 6.58, 0.72]),
          // Flanking broken rubble buttress piers
          box(2.55, 6.4, 2.85, 0xcad1d6, [-5.6, 3.2, 0]),
          box(2.45, 5.6, 2.75, 0xc4cbd1, [5.6, 2.8, 0]),
        ], 'shrine_rune', 0.084, { uvScale: [3.2, 1.5] });
        break;

      case 'fallen_log':
        // Thick mossy fallen forest tree log with tan sawed heartwood end-caps!
        pair = makePair([
          cyl(0.46, 0.54, 3.4, 8, 0x8c5e34, [0, 0.44, 0], [0, 0, Math.PI * 0.5]),
          cyl(0.41, 0.41, 0.08, 8, 0xe0c08d, [-1.72, 0.44, 0], [0, 0, Math.PI * 0.5]),
          cyl(0.48, 0.48, 0.08, 8, 0xe0c08d, [1.72, 0.44, 0], [0, 0, Math.PI * 0.5]),
          cone(0.16, 0.65, 5, 0x6b4524, [0.45, 0.76, 0.25], [0.45, 0.2, -0.35]),
        ], 'bark_grain', 0.044);
        break;

      case 'sandstone_arch':
        // MONUMENTAL CURVED DESERT SANDSTONE ROCK ARCH spanning dramatically over dunes!
        pair = makePair([
          { geo: createSandstoneArchGeometry(17.5, 11.8, 2.55, 13), color: 0xe8c48e, pos: [0, 0.0, 0] },
          { geo: createCraggySpireGeometry(3.4, 4.6, 29, 0.62), color: 0xd9ae75, pos: [-8.4, -0.6, 0.3] },
          { geo: createCraggySpireGeometry(3.2, 4.2, 41, 0.64), color: 0xd9ae75, pos: [8.4, -0.6, -0.2] },
        ], 'desert_sandstone', 0.095);
        break;

      case 'desert_ruin':
        // HALF-BURIED TILTED DESERT ADOBE HOUSE RUIN sinking organically into sand dunes!
        pair = makePair([
          // Main weathered flat-roofed sandstone adobe structure tilted into the dune
          box(7.2, 3.8, 4.8, 0xdcb480, [0, 1.35, 0], [0.14, 0.08, -0.18]),
          // Raised roof parapet rim
          box(7.4, 0.48, 0.48, 0xcfa36d, [0, 3.22, 2.15], [0.14, 0.08, -0.18]),
          box(7.4, 0.48, 0.48, 0xcfa36d, [0, 3.22, -2.15], [0.14, 0.08, -0.18]),
          box(0.48, 0.48, 4.6, 0xcfa36d, [-3.4, 3.22, 0], [0.14, 0.08, -0.18]),
          box(0.48, 0.48, 4.6, 0xcfa36d, [3.4, 3.22, 0], [0.14, 0.08, -0.18]),
          // Recessed dark doorway & square desert ventilation windows!
          box(1.15, 1.85, 0.24, 0x3b281c, [-1.4, 0.92, 2.38], [0.14, 0.08, -0.18]),
          box(0.76, 0.76, 0.24, 0x3b281c, [0.85, 1.78, 2.38], [0.14, 0.08, -0.18]),
          box(0.76, 0.76, 0.24, 0x3b281c, [2.25, 1.54, 2.38], [0.14, 0.08, -0.18]),
          box(0.24, 0.72, 0.72, 0x3b281c, [3.58, 1.48, 0.25], [0.14, 0.08, -0.18]),
        ], 'desert_sandstone', 0.072, { uvScale: [2.2, 1.4] });
        break;

      case 'boulder':
        // Clean faceted weathered grey low-poly boulder cluster!
        pair = makePair([
          dodec(1.55, 0x9aa3ab, [0, 0.72, 0], [0.12, 0.4, -0.08], [1.28, 0.78, 1.15]),
          dodec(0.98, 0x828c94, [1.15, 0.46, 0.58], [-0.1, 1.1, 0.14], [1.12, 0.72, 1.05]),
        ], 'terrain_cliff', 0.056);
        break;

      case 'desert_boulder':
        // Wind-carved stepped terracotta canyon spire outcrop!
        pair = makePair([
          { geo: createCraggySpireGeometry(1.55, 2.35, 17, 0.58), color: 0xc9803c, pos: [0, 0.0, 0] },
          { geo: createCraggySpireGeometry(1.08, 1.45, 31, 0.64), color: 0xa8622c, pos: [1.02, 0.0, 0.46], rot: [0, 0.8, 0.08] },
          { geo: createCraggySpireGeometry(1.25, 0.52, 47, 0.86), color: 0xebb76a, pos: [-0.06, 2.15, -0.05] },
        ], 'desert_sandstone', 0.068);
        break;

      case 'sandstone_obelisk':
        // Sculpted Egyptian sandstone obelisk with stepped temple base, inlaid lapis band & gilded solar pyramidion!
        pair = makePair([
          box(2.35, 0.48, 2.35, 0x99582a, [0, 0.24, 0]),
          box(1.85, 0.46, 1.85, 0xbd7338, [0, 0.72, 0]),
          cyl(0.56, 0.94, 5.4, 4, 0xe3a558, [0, 3.65, 0], [0, Math.PI * 0.25, 0]),
          box(1.24, 0.22, 1.24, 0x2688d9, [0, 4.95, 0]),
          box(1.30, 0.12, 1.30, 0xffd23f, [0, 5.14, 0]),
          cone(0.59, 1.28, 4, 0xffd23f, [0, 6.95, 0], [0, Math.PI * 0.25, 0]),
          octa(0.32, 0x5cf7ff, [0, 7.95, 0]),
        ], 'desert_sandstone', 0.074, { emissiveHex: 0x1ca8d9, emissiveIntensity: 0.28, gloss: 0.45 });
        break;

      case 'ruin_pillar':
        // Classical fluted temple column with fractured capital, gold band & cascading emerald moss!
        pair = makePair([
          box(1.65, 0.36, 1.65, 0x5c6b7c, [0, 0.18, 0]),
          lathePart(
            [
              [0.72, 0.36],
              [0.64, 0.62],
              [0.54, 0.78],
              [0.48, 3.45],
              [0.64, 3.68],
              [0.76, 3.88],
            ],
            10,
            0x8c9cad,
          ),
          box(1.48, 0.28, 1.48, 0x6f7f91, [0, 4.02, 0], [0.06, 0.18, 0.05]),
          cyl(0.55, 0.55, 0.14, 10, 0xd4a437, [0, 3.46, 0]),
          { geo: createSculptedCanopyCluster(0.74, 0.42, 5), color: 0x58bd42, pos: [0.35, 4.28, 0.18] },
        ], 'shrine_rune', 0.068);
        break;

      case 'cactus':
        pair = makePair([
          lathePart([[0.48, 0.0], [0.45, 2.2], [0.40, 3.8], [0.22, 4.12]], 8, 0x5c8744),
          cyl(0.24, 0.28, 1.15, 7, 0x4b7537, [-0.62, 2.15, 0], [0, 0, 1.25]),
          lathePart([[0.25, 0], [0.24, 1.28], [0.12, 1.48]], 7, 0x5c8744, [-1.1, 2.35, 0]),
          cyl(0.24, 0.28, 1.05, 7, 0x4b7537, [0.58, 1.72, 0], [0, 0, -1.25]),
          lathePart([[0.24, 0], [0.22, 1.15], [0.10, 1.35]], 7, 0x5c8744, [1.02, 1.88, 0]),
          octa(0.24, 0xe8647c, [0, 4.32, 0]),
        ], 'desert_cactus', 0.058);
        break;

      case 'tombstone':
        // Sculpted gothic pointed-arch gravestone with bevelled plinth & carved chthonic cross!
        pair = makePair([
          box(1.52, 0.34, 0.92, 0x353c4f, [0, 0.17, 0]),
          extrudePolyPart(
            [
              [-0.58, 0.0],
              [0.58, 0.0],
              [0.54, 1.65],
              [0.32, 2.12],
              [0.0, 2.36],
              [-0.32, 2.12],
              [-0.54, 1.65],
            ],
            0.34,
            0.04,
            0x66708a,
            [0, 0.32, 0],
            [0, 0, 0.04],
          ),
          box(0.14, 0.78, 0.09, 0x3b4257, [0, 1.56, 0.22], [0, 0, 0.04]),
          box(0.50, 0.14, 0.09, 0x3b4257, [0, 1.74, 0.22], [0, 0, 0.04]),
          octa(0.14, 0xa855f7, [0, 1.74, 0.28]),
        ], 'graveyard_cobble', 0.062, { emissiveHex: 0x6b21a8, emissiveIntensity: 0.18 });
        break;

      case 'dead_tree':
        // Twisted gothic haunted silhouette tree with clawed roots & eerie glowing violet ember wisps!
        pair = makePair([
          lathePart([[0.82, 0.0], [0.46, 0.9], [0.34, 2.6], [0.22, 3.9]], 7, 0x302638, [0, 0, 0], [0.06, 0, 0.08]),
          cyl(0.16, 0.26, 2.4, 6, 0x261e2e, [0.34, 3.85, 0.12], [-0.14, 0, -0.28]),
          cyl(0.11, 0.22, 2.2, 6, 0x211a29, [-0.95, 3.45, 0.28], [0.22, 0, 0.82]),
          cyl(0.10, 0.20, 2.1, 6, 0x211a29, [1.12, 4.25, -0.25], [-0.26, 0, -0.76]),
          cone(0.13, 1.25, 4, 0x1c1524, [-1.88, 4.28, 0.45], [0.26, 0, 0.58]),
          cone(0.12, 1.25, 4, 0x1c1524, [1.96, 5.02, -0.48], [-0.24, 0, -0.52]),
          cone(0.10, 1.05, 4, 0x1c1524, [0.45, 5.15, 0.42], [0.45, 0, -0.15]),
        ], 'bark_grain', 0.068);
        break;

      case 'iron_fence':
        pair = makePair([
          box(0.92, 2.85, 0.92, 0x454d63, [0, 1.42, 0]),
          box(1.12, 0.34, 1.12, 0x5c6680, [0, 2.94, 0]),
          octa(0.36, 0xa855f7, [0, 3.42, 0]),
          box(2.7, 0.14, 0.14, 0x1f2433, [1.7, 2.12, 0]),
          box(2.7, 0.14, 0.14, 0x1f2433, [1.7, 0.65, 0]),
          cyl(0.06, 0.06, 2.2, 6, 0x1f2433, [0.95, 1.4, 0]),
          cyl(0.06, 0.06, 2.2, 6, 0x1f2433, [1.65, 1.4, 0]),
          cyl(0.06, 0.06, 2.2, 6, 0x1f2433, [2.35, 1.4, 0]),
          cone(0.12, 0.36, 4, 0x55627d, [0.95, 2.62, 0]),
          cone(0.12, 0.36, 4, 0x55627d, [1.65, 2.62, 0]),
          cone(0.12, 0.36, 4, 0x55627d, [2.35, 2.62, 0]),
        ], 'graveyard_iron', 0.062, { emissiveHex: 0x6b21a8, emissiveIntensity: 0.15 });
        break;

      case 'crypt_arch':
        // Sculpted Haunted Gothic Pointed-Arch Crypt Gatehouse!
        pair = makePair([
          box(1.38, 5.4, 1.38, 0x3b4257, [-2.45, 2.7, 0]),
          box(1.38, 5.4, 1.38, 0x3b4257, [2.45, 2.7, 0]),
          extrudePolyPart(
            [
              [-3.35, 0.0],
              [3.35, 0.0],
              [3.15, 1.15],
              [0.0, 2.65],
              [-3.15, 1.15],
            ],
            1.35,
            0.08,
            0x4f5873,
            [0, 5.25, 0],
          ),
          octa(0.62, 0xc05eff, [0, 6.55, 0.78]),
          octa(0.42, 0x70f5ff, [-2.45, 5.85, 0.74]),
          octa(0.42, 0x70f5ff, [2.45, 5.85, 0.74]),
        ], 'graveyard_cobble', 0.082, { emissiveHex: 0x7e22ce, emissiveIntensity: 0.42 });
        break;

      case 'citadel_pillar':
        // Towering Dark Volcanic Basalt & Bronze Fluted Arena Monolith with ember brazier crown!
        pair = makePair([
          lathePart(
            [
              [1.92, 0.0],
              [1.65, 0.72],
              [1.38, 1.05],
              [1.12, 1.35],
              [0.86, 8.2],
              [1.24, 8.65],
              [1.48, 9.15],
              [1.15, 9.35],
            ],
            8,
            0x36282a,
          ),
          cyl(1.42, 1.48, 0.28, 8, 0xd49c3b, [0, 1.05, 0]),
          cyl(1.38, 1.24, 0.34, 8, 0xd49c3b, [0, 8.85, 0]),
          // Sculpted flaming brazier chalice top!
          lathePart([[0.45, 9.35], [0.95, 9.95], [0.65, 10.65], [0.05, 11.45]], 6, 0xff5a1f),
          octa(0.55, 0xffe066, [0, 10.25, 0], undefined, [0.9, 1.4, 0.9]),
        ], 'citadel_obsidian', 0.074, { emissiveHex: 0x8f2414, emissiveIntensity: 0.10, gloss: 0.42, uvScale: [1.8, 3.0] });
        break;
    }

    this.propCache.set(kind, pair);
    return pair;
  }

  // ---- ALL 12 Interactables + World Structures + Darkness Lamps ----

  public getInteractableGeometryPair(
    kind: InteractableKind | 'BossPortal' | 'BossPylon' | 'CryptAltar' | 'DarknessLamp',
    variant: InteractableVariant = 'normal',
    used = false,
  ): LowPolyGeometryPair {
    const cacheKey = `${kind}:${variant}:${used ? '1' : '0'}`;
    const cached = this.interactableCache.get(cacheKey);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    const effectiveKind = kind === 'BossSpawner' && variant === 'crypt_altar' ? 'CryptAltar' : kind;

    switch (effectiveKind) {
      case 'ChargeShrine': {
        const isGold = variant === 'golden';
        const stone = isGold ? 0xd9a73b : 0x768699;
        const crystal = used ? 0x4e6173 : isGold ? 0xffe45e : 0x4df5ff;
        pair = makePair([
          cyl(1.25, 1.48, 0.45, 8, isGold ? 0xb58326 : 0x566475, [0, 0.22, 0]),
          cyl(0.88, 1.05, 0.36, 8, stone, [0, 0.62, 0]),
          cyl(0.42, 0.68, 2.85, 6, stone, [0, 2.2, 0]),
          octa(0.52, crystal, [0, 4.15, 0], undefined, [0.85, 1.38, 0.85]),
          torus(0.74, 0.075, 5, 8, isGold ? 0xffe45e : 0x62f5ff, [0, 4.15, 0], [Math.PI * 0.5, 0, 0]),
        ], 'shrine_rune', 0.068, {
          emissiveHex: used ? 0x000000 : isGold ? 0xffb703 : 0x1fc7e8,
          emissiveIntensity: used ? 0 : 0.35,
        });
        break;
      }

      case 'Chest': {
        const wood =
          variant === 'evil' ? 0x4a1e3d : variant === 'ghost' ? 0x2a6c85 : variant === 'free' ? 0x2d7a47 : variant === 'golden' ? 0xe8b22c : 0x9c5c2d;
        const trim =
          variant === 'evil' ? 0xff3864 : variant === 'ghost' ? 0x70f5ff : variant === 'free' ? 0x7df76d : 0xffd23f;
        const lidRotX = used ? -1.15 : 0;
        const lidY = used ? 1.18 : 0.92;
        const lidZ = used ? -0.34 : 0;
        pair = makePair([
          box(1.36, 0.72, 0.92, wood, [0, 0.36, 0]),
          box(1.42, 0.14, 0.98, trim, [0, 0.68, 0]),
          box(0.24, 0.28, 0.12, trim, [0, 0.66, 0.48]),
          cyl(0.46, 0.46, 1.38, 7, wood, [0, lidY, lidZ], [lidRotX, 0, Math.PI * 0.5]),
          box(0.16, 0.5, 0.96, trim, [-0.46, lidY, lidZ], [lidRotX, 0, 0]),
          box(0.16, 0.5, 0.96, trim, [0.46, lidY, lidZ], [lidRotX, 0, 0]),
        ], 'chest_wood', 0.056, { emissiveHex: used ? 0x000000 : trim, emissiveIntensity: used ? 0 : 0.16, gloss: 0.4 });
        break;
      }

      case 'Pot': {
        if (variant === 'pumpkin') {
          // Carved glowing Jack-O-Lantern Pumpkin!
          pair = makePair([
            dodec(0.64, 0xf27127, [0, 0.55, 0], undefined, [1.14, 0.88, 1.14]),
            cyl(0.08, 0.13, 0.34, 5, 0x3b8532, [0, 1.12, 0], [0.15, 0, 0.22]),
            box(0.16, 0.14, 0.08, 0xffe45e, [-0.22, 0.66, 0.64]),
            box(0.16, 0.14, 0.08, 0xffe45e, [0.22, 0.66, 0.64]),
            box(0.42, 0.12, 0.08, 0xffae19, [0, 0.4, 0.66]),
          ], 'character_palette', 0.05, { emissiveHex: 0xd95814, emissiveIntensity: 0.24 });
        } else if (variant === 'tumbleweed') {
          pair = makePair([
            ico(0.64, 0xc29353, [0, 0.64, 0]),
            cone(0.14, 0.46, 4, 0x9e7138, [0.5, 0.72, 0.2], [0, 0, -1.1]),
            cone(0.14, 0.46, 4, 0x9e7138, [-0.5, 0.68, -0.2], [0, 0, 1.1]),
            cone(0.14, 0.46, 4, 0xa87c42, [0.1, 1.15, 0]),
          ], 'bark_grain', 0.048);
        } else {
          pair = makePair([
            cyl(0.32, 0.42, 0.32, 8, 0xd97a48, [0, 0.16, 0]),
            dodec(0.56, 0xe68a55, [0, 0.62, 0], undefined, [1.0, 1.05, 1.0]),
            cyl(0.36, 0.26, 0.26, 8, 0xc96b3a, [0, 1.12, 0]),
            torus(0.34, 0.07, 5, 8, 0xf2c97e, [0, 1.24, 0], [Math.PI * 0.5, 0, 0]),
          ], 'ceramic_pot', 0.048);
        }
        break;
      }

      case 'ShrineMoai':
        // Iconic Easter Island Carved Moai Head w/ deep brow, long angular nose, glowing eyes & mossy crown!
        pair = makePair([
          box(2.1, 0.42, 1.6, 0x5c6875, [0, 0.21, 0]),
          box(1.55, 2.85, 1.22, 0x808f9e, [0, 1.82, 0]),
          box(1.66, 0.42, 0.64, 0x677585, [0, 2.75, 0.56]), // heavy overhanging brow
          box(0.42, 1.15, 0.58, 0x9aaaba, [0, 2.02, 0.68]), // long angular moai nose
          box(0.95, 0.18, 0.26, 0x4a5568, [0, 1.18, 0.62]), // stoic mouth
          box(0.26, 0.2, 0.16, used ? 0x3b4454 : 0x5cf7ff, [-0.42, 2.42, 0.62]),
          box(0.26, 0.2, 0.16, used ? 0x3b4454 : 0x5cf7ff, [0.42, 2.42, 0.62]),
          box(0.28, 0.92, 0.34, 0x738291, [-0.88, 2.1, 0.08]), // carved side ears
          box(0.28, 0.92, 0.34, 0x738291, [0.88, 2.1, 0.08]),
          dodec(0.75, 0x59b842, [0, 3.32, -0.05], undefined, [1.3, 0.35, 1.1]),
        ], 'terrain_cliff', 0.072, { emissiveHex: used ? 0x000000 : 0x1fc7e8, emissiveIntensity: used ? 0 : 0.2 });
        break;

      case 'ShadyGuy': {
        // Cloaked enigmatic merchant stall w/ wooden cart, striped awning & glowing rarity lantern!
        const lanternHex = variant === 'golden' ? 0xffd23f : variant === 'evil' ? 0xd946ef : 0x52f2ff;
        pair = makePair([
          // Cloaked Shady Guy behind stall
          cone(0.68, 1.85, 7, 0x26203b, [-0.25, 0.92, -0.35]),
          dodec(0.45, 0x362d54, [-0.25, 1.98, -0.35]),
          box(0.12, 0.08, 0.08, 0xffd23f, [-0.39, 2.0, 0.03]),
          box(0.12, 0.08, 0.08, 0xffd23f, [-0.11, 2.0, 0.03]),
          // Timber merchant table + wares crates
          box(2.25, 0.82, 0.95, 0x7d4c2a, [0, 0.41, 0.55]),
          box(2.4, 0.14, 1.08, 0x9c6138, [0, 0.86, 0.55]),
          box(0.46, 0.42, 0.46, 0x5c361d, [-0.62, 1.12, 0.55]),
          octa(0.2, 0xffd23f, [0.05, 1.14, 0.55]),
          // Canopy corner poles & striped awning roof
          cyl(0.08, 0.09, 2.75, 6, 0x5c361d, [-1.05, 1.38, 0.9]),
          cyl(0.08, 0.09, 2.75, 6, 0x5c361d, [1.05, 1.38, 0.9]),
          box(2.45, 0.18, 1.45, 0x4c286b, [0, 2.8, 0.35], [0.22, 0, 0]),
          box(0.8, 0.2, 1.47, 0xffc83b, [0, 2.82, 0.35], [0.22, 0, 0]),
          // Hanging glowing rarity lantern!
          cyl(0.04, 0.04, 0.4, 5, 0x262c3b, [0.95, 2.45, 0.95]),
          octa(0.28, used ? 0x4b5563 : lanternHex, [0.95, 2.1, 0.95]),
        ], 'chest_wood', 0.06, { emissiveHex: used ? 0x000000 : lanternHex, emissiveIntensity: used ? 0 : 0.32 });
        break;
      }

      case 'Microwave':
        // Chunky retro pixel Microwave on crate w/ glowing cyan glass door & keypad!
        pair = makePair([
          box(1.5, 0.72, 1.18, 0x546070, [0, 0.36, 0]),
          box(1.66, 1.04, 1.06, used ? 0x4a4540 : 0xebe4d1, [0, 1.24, 0]),
          // Glowing glass door + inner silhouette
          box(0.96, 0.68, 0.1, used ? 0x1e242e : 0x38f2ff, [-0.22, 1.24, 0.52]),
          box(0.82, 0.54, 0.12, used ? 0x11151c : 0x99faff, [-0.22, 1.24, 0.53]),
          // Control panel + chunky retro buttons & twist dial
          box(0.38, 0.74, 0.1, 0x2a3342, [0.52, 1.24, 0.52]),
          box(0.24, 0.16, 0.12, used ? 0x52525b : 0x4dff77, [0.52, 1.46, 0.54]),
          cyl(0.1, 0.1, 0.12, 6, 0xff4d5e, [0.52, 1.06, 0.56], [Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.058, { emissiveHex: used ? 0x000000 : 0x1fc7e8, emissiveIntensity: used ? 0 : 0.32 });
        break;

      case 'ShrineGreed':
        // Opulent Golden Altar of Greed w/ overflowing chalice & coin mounds!
        pair = makePair([
          cyl(1.18, 1.42, 0.46, 8, 0x6b4c1e, [0, 0.23, 0]),
          cyl(0.68, 0.85, 1.75, 6, 0xc79528, [0, 1.32, 0]),
          cyl(0.98, 0.55, 0.82, 8, 0xffd23f, [0, 2.6, 0]),
          dodec(0.45, 0xffe45e, [-0.85, 0.45, 0.65], undefined, [1.1, 0.65, 1.1]),
          dodec(0.4, 0xffd23f, [0.85, 0.42, -0.5], undefined, [1.1, 0.6, 1.1]),
          octa(0.46, used ? 0x5c5346 : 0xffe45e, [0, 3.45, 0]),
        ], 'chest_wood', 0.064, { emissiveHex: used ? 0x000000 : 0xffb703, emissiveIntensity: used ? 0 : 0.35, gloss: 0.75 });
        break;

      case 'ShrineChallenge':
        // Fierce Crimson War-Challenge Shrine w/ crossed blades & glowing battle crystal!
        pair = makePair([
          box(1.9, 0.52, 1.4, 0x3b2c36, [0, 0.26, 0]),
          box(1.15, 1.75, 0.92, 0x4f3542, [0, 1.38, 0]),
          box(0.24, 2.35, 0.12, 0xcbd5e1, [0, 2.3, 0.48], [0, 0, 0.58]),
          box(0.24, 2.35, 0.12, 0xcbd5e1, [0, 2.3, 0.48], [0, 0, -0.58]),
          octa(0.56, used ? 0x4b5563 : 0xff2e54, [0, 3.35, 0]),
        ], 'metal_armor', 0.066, { emissiveHex: used ? 0x000000 : 0xff2644, emissiveIntensity: used ? 0 : 0.42 });
        break;

      case 'ShrineCursed':
        // Twisted Dark-Violet Cursed Altar w/ horned obsidian crown & floating skulls!
        pair = makePair([
          cyl(1.18, 1.45, 0.48, 7, 0x211430, [0, 0.24, 0]),
          cyl(0.48, 0.78, 2.45, 6, 0x361e52, [0, 1.65, 0]),
          cone(0.2, 0.9, 5, 0x1c1029, [-0.62, 2.75, 0], [0, 0, 0.55]),
          cone(0.2, 0.9, 5, 0x1c1029, [0.62, 2.75, 0], [0, 0, -0.55]),
          octa(0.58, used ? 0x3f374d : 0xd946ef, [0, 3.4, 0]),
          torus(0.86, 0.07, 5, 10, used ? 0x3f374d : 0xb938ff, [0, 3.4, 0], [0.55, 0.35, 0]),
        ], 'citadel_obsidian', 0.068, { emissiveHex: used ? 0x000000 : 0xa855f7, emissiveIntensity: used ? 0 : 0.45 });
        break;

      case 'ShrineMagnet':
        // Shrine of Succ — Iconic Chunky Red-and-Silver U-Shaped Horseshoe Magnet Monument!
        pair = makePair([
          cyl(1.15, 1.35, 0.5, 8, 0x4b596b, [0, 0.25, 0]),
          cyl(0.65, 0.82, 1.25, 8, 0x627387, [0, 1.1, 0]),
          // Iconic Horseshoe Magnet arch
          torus(0.74, 0.22, 6, 12, 0xe63946, [0, 2.55, 0], [0, 0, Math.PI], undefined, Math.PI),
          box(0.42, 0.62, 0.42, 0xe63946, [-0.74, 2.86, 0]),
          box(0.42, 0.62, 0.42, 0xe63946, [0.74, 2.86, 0]),
          box(0.44, 0.38, 0.44, 0xdbe6f2, [-0.74, 3.35, 0]),
          box(0.44, 0.38, 0.44, 0xdbe6f2, [0.74, 3.35, 0]),
          octa(0.26, used ? 0x4b5563 : 0x38f2ff, [0, 3.25, 0]),
        ], 'metal_armor', 0.064, { emissiveHex: used ? 0x000000 : 0x38f2ff, emissiveIntensity: used ? 0 : 0.35 });
        break;

      case 'ShrineBalance':
        // Shrine of Balance — Ancient Pillar topped with Twin Hanging Golden Scales!
        pair = makePair([
          cyl(1.1, 1.32, 0.45, 8, 0x5c6878, [0, 0.22, 0]),
          cyl(0.38, 0.52, 2.65, 8, 0x94a3b8, [0, 1.75, 0]),
          box(2.45, 0.18, 0.18, 0xffd23f, [0, 3.05, 0]),
          cyl(0.04, 0.04, 0.85, 4, 0xffd23f, [-1.1, 2.58, 0]),
          cyl(0.04, 0.04, 0.85, 4, 0xffd23f, [1.1, 2.58, 0]),
          cyl(0.48, 0.26, 0.18, 8, used ? 0x4b5563 : 0xffd23f, [-1.1, 2.1, 0]),
          cyl(0.48, 0.26, 0.18, 8, used ? 0x4b5563 : 0x5cf7ff, [1.1, 2.1, 0]),
          octa(0.32, used ? 0x4b5563 : 0x62f58d, [0, 3.48, 0]),
        ], 'shrine_rune', 0.062, { emissiveHex: used ? 0x000000 : 0x38e88c, emissiveIntensity: used ? 0 : 0.3 });
        break;

      case 'BossSpawner':
        pair = makePair([
          cyl(1.75, 2.05, 0.45, 8, 0x262033, [0, 0.22, 0]),
          cyl(1.25, 1.55, 0.55, 8, 0x382d4a, [0, 0.72, 0]),
          cyl(0.75, 0.92, 1.35, 8, 0x2d243b, [0, 1.62, 0]),
          dodec(0.84, 0xf2ebd9, [0, 2.75, 0.1]),
          box(0.62, 0.34, 0.48, 0xe6dec8, [0, 2.25, 0.32]),
          box(0.24, 0.22, 0.16, 0xff2644, [-0.28, 2.78, 0.78]),
          box(0.24, 0.22, 0.16, 0xff2644, [0.28, 2.78, 0.78]),
          cone(0.2, 0.95, 5, 0x3b2c40, [-0.72, 3.32, 0], [0.1, 0, 0.58]),
          cone(0.2, 0.95, 5, 0x3b2c40, [0.72, 3.32, 0], [0.1, 0, -0.58]),
        ], 'terrain_citadel', 0.075, { emissiveHex: used ? 0x241630 : 0xcc1838, emissiveIntensity: used ? 0.05 : 0.38 });
        break;

      case 'CryptAltar':
        // Haunted Gothic Crypt Altar w/ sarcophagus plinth, twin amethyst braziers & rune arch!
        pair = makePair([
          box(3.4, 0.55, 2.4, 0x343a4d, [0, 0.28, 0]),
          box(2.2, 1.05, 1.2, 0x4b536b, [0, 1.05, 0]),
          box(0.65, 3.6, 0.65, 0x434b63, [-1.45, 2.05, -0.4]),
          box(0.65, 3.6, 0.65, 0x434b63, [1.45, 2.05, -0.4]),
          box(3.8, 0.72, 0.85, 0x555f7a, [0, 4.15, -0.4]),
          octa(0.45, used ? 0x4b5563 : 0xa855f7, [-1.45, 4.25, 0.1]),
          octa(0.45, used ? 0x4b5563 : 0xa855f7, [1.45, 4.25, 0.1]),
          octa(0.62, used ? 0x4b5563 : 0x70f5ff, [0, 2.4, 0]),
        ], 'graveyard_cobble', 0.076, { emissiveHex: used ? 0x000000 : 0x7b2cbf, emissiveIntensity: used ? 0 : 0.4 });
        break;

      case 'BossPortal':
        pair = makePair([
          box(5.6, 0.55, 1.8, 0x2d2642, [0, 0.28, 0]),
          box(0.95, 5.2, 1.05, 0x3f365c, [-2.15, 3.0, 0]),
          box(0.95, 5.2, 1.05, 0x3f365c, [2.15, 3.0, 0]),
          box(5.6, 1.0, 1.2, 0x4c4170, [0, 5.75, 0]),
          octa(0.65, 0x5cf7ff, [0, 6.75, 0]),
          octa(0.36, 0xd946ef, [-2.15, 5.95, 0.55]),
          octa(0.36, 0xd946ef, [2.15, 5.95, 0.55]),
        ], 'shrine_rune', 0.085, { emissiveHex: 0x7b2cbf, emissiveIntensity: 0.4 });
        break;

      case 'BossPylon':
        // Hexagonal Obsidian-Gold FinalBossMap Pylon Pillar w/ glowing energy conduit crystal!
        pair = makePair([
          cyl(1.25, 1.55, 0.65, 6, 0x1e162e, [0, 0.32, 0]),
          cyl(1.02, 1.15, 0.28, 6, 0xffc83b, [0, 0.78, 0]),
          cyl(0.56, 0.86, 4.15, 6, 0x2d2042, [0, 2.95, 0]),
          cyl(0.92, 0.72, 0.32, 6, 0xffc83b, [0, 5.1, 0]),
          octa(0.72, used ? 0x4dff9e : 0xff2ec4, [0, 6.05, 0], undefined, [0.85, 1.45, 0.85]),
          torus(0.92, 0.08, 5, 12, used ? 0x4dff9e : 0xffc83b, [0, 6.05, 0], [Math.PI * 0.5, 0, 0]),
        ], 'citadel_obsidian', 0.075, { emissiveHex: used ? 0x1fc77e : 0xc91e94, emissiveIntensity: 0.45 });
        break;

      case 'DarknessLamp':
        // Ornate Wrought-Iron Gothic Graveyard Lamp Post (Big Bob Darkness Phase!)
        pair = makePair([
          cyl(0.48, 0.64, 0.42, 6, 0x3b4254, [0, 0.21, 0]),
          cyl(0.14, 0.22, 3.8, 6, 0x222736, [0, 2.2, 0]),
          // Curved forged iron hanging crook arm
          box(0.18, 0.18, 1.05, 0x222736, [0, 4.15, 0.44]),
          box(0.16, 0.42, 0.16, 0x222736, [0, 3.92, 0.92]),
          // Ornate hexagonal lantern hood & wrought-iron cage
          cone(0.52, 0.46, 6, 0x1e2230, [0, 3.68, 0.92]),
          cyl(0.38, 0.32, 0.68, 6, used ? 0xffe45e : 0x3d485c, [0, 3.12, 0.92]),
          cone(0.32, 0.28, 6, 0x1e2230, [0, 2.66, 0.92], [Math.PI, 0, 0]),
        ], 'graveyard_iron', 0.058, {
          emissiveHex: used ? 0xffae19 : 0x181c2b,
          emissiveIntensity: used ? 0.65 : 0.08,
        });
        break;
    }

    this.interactableCache.set(cacheKey, pair);
    return pair;
  }

  // ---- Distinct Projectile & Pickup Meshes (ALL 30 WEAPONS!) ----

  public normalizeProjectileArchetype(weaponId: string): string {
    const cached = this.projArchetypeNameCache.get(weaponId);
    if (cached !== undefined) return cached;
    const resolved = this.resolveProjectileArchetype(weaponId);
    this.projArchetypeNameCache.set(weaponId, resolved);
    return resolved;
  }

  private resolveProjectileArchetype(weaponId: string): string {
    const id = weaponId.toLowerCase();
    if (id.includes('dragon')) return 'fire_cone';
    if (id.includes('fire') || id.includes('flame')) return 'fireball';
    if (id.includes('bone')) return 'bone';
    if (id.includes('katana')) return 'katana_arc';
    if (id.includes('herosword') || id.includes('hero_sword')) return 'hero_arc';
    if (id.includes('corrupt') || id.includes('dexecutioner')) return 'corrupt_arc';
    if (id.includes('scythe')) return 'scythe';
    if (id.includes('sword')) return 'sword_arc';
    if (id.includes('axe')) return 'axe';
    if (id.includes('banana')) return 'banana';
    if (id.includes('rocket')) return 'rocket';
    if (id.includes('dagger') || id.includes('bluetooth') || id.includes('wireless')) return 'dagger';
    if (id.includes('dice')) return 'dice';
    if (id.includes('poison') || id.includes('flask')) return 'flask';
    if (id.includes('aegis')) return 'aegis_shield';
    if (id.includes('blood')) return 'blood_orb';
    if (id.includes('frost') || id.includes('ice')) return 'frost_shard';
    if (id.includes('bow') || id.includes('arrow')) return 'arrow';
    if (id.includes('sniper') || id.includes('rail')) return 'sniper';
    if (id.includes('noodle')) return 'noodle';
    if (id.includes('tornado')) return 'tornado_proj';
    if (id.includes('blackhole') || id.includes('black_hole')) return 'blackhole_orb';
    if (id.includes('mine')) return 'mine';
    if (id.includes('revolver') || id.includes('shotgun')) return 'bullet';
    if (id.includes('chunker') || id.includes('rock') || id.includes('boulder')) return 'boulder';
    if (id.includes('lightning') || id.includes('bolt')) return 'lightning';
    return 'orb';
  }

  public getProjectileGeometryPair(kind: string): LowPolyGeometryPair {
    const key = this.normalizeProjectileArchetype(kind);
    const cached = this.projectileCache.get(key);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (key) {
      case 'fireball':
        pair = makePair([
          ico(0.42, 0xffe45e),
          cone(0.44, 0.95, 6, 0xff621f, [0, 0, -0.45], [-Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.036, { emissiveHex: 0xff621f, emissiveIntensity: 0.95 });
        break;

      case 'fire_cone':
        // Dragon's Breath blazing cel flame jet!
        pair = makePair([
          cone(0.62, 1.65, 7, 0xff5a1f, [0, 0, 0.25], [-Math.PI * 0.5, 0, 0]),
          cone(0.38, 1.15, 6, 0xffe45e, [0, 0, 0.05], [-Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.034, { emissiveHex: 0xff621f, emissiveIntensity: 1.1 });
        break;

      case 'bone':
        pair = makePair([
          cyl(0.11, 0.11, 0.85, 6, 0xfaf5e6, undefined, [0, 0, Math.PI * 0.5]),
          octa(0.17, 0xfaf5e6, [-0.44, 0.1, 0]),
          octa(0.17, 0xfaf5e6, [-0.44, -0.1, 0]),
          octa(0.17, 0xfaf5e6, [0.44, 0.1, 0]),
          octa(0.17, 0xfaf5e6, [0.44, -0.1, 0]),
        ], 'bone_ivory', 0.038);
        break;

      case 'sword_arc':
        pair = makePair([
          { geo: createCalligraphicSlashGeometry(0.58, 1.32, Math.PI * 1.08, 18), color: 0x7df9ff },
          { geo: createCalligraphicSlashGeometry(1.12, 1.38, Math.PI * 0.98, 18), color: 0xffffff, pos: [0, 0.03, 0] },
        ], 'character_palette', 0.022, { emissiveHex: 0x5cf7ff, emissiveIntensity: 1.35 });
        break;

      case 'katana_arc':
        pair = makePair([
          { geo: createCalligraphicSlashGeometry(0.76, 1.52, Math.PI * 1.24, 20), color: 0x38f2ff },
          { geo: createCalligraphicSlashGeometry(1.32, 1.56, Math.PI * 1.14, 20), color: 0xffffff, pos: [0, 0.025, 0] },
        ], 'character_palette', 0.018, { emissiveHex: 0x38f2ff, emissiveIntensity: 1.55 });
        break;

      case 'hero_arc':
        pair = makePair([
          { geo: createCalligraphicSlashGeometry(0.62, 1.46, Math.PI * 1.12, 18), color: 0xffc83b },
          { geo: createCalligraphicSlashGeometry(1.22, 1.52, Math.PI * 1.02, 18), color: 0xfff8c2, pos: [0, 0.03, 0] },
        ], 'character_palette', 0.022, { emissiveHex: 0xffb703, emissiveIntensity: 1.45 });
        break;

      case 'corrupt_arc':
        pair = makePair([
          { geo: createCalligraphicSlashGeometry(0.62, 1.44, Math.PI * 1.15, 18), color: 0x9b22d9 },
          { geo: createCalligraphicSlashGeometry(1.20, 1.50, Math.PI * 1.04, 18), color: 0xff385c, pos: [0, 0.03, 0] },
        ], 'character_palette', 0.024, { emissiveHex: 0xd946ef, emissiveIntensity: 1.48 });
        break;

      case 'scythe':
        pair = makePair([
          cyl(0.06, 0.06, 1.35, 5, 0x3b2d4d, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          torus(0.75, 0.11, 4, 10, 0xcbd5e1, [0, 0, 0.45], [Math.PI * 0.5, 0, -0.4], undefined, Math.PI * 0.85),
          torus(0.84, 0.05, 4, 10, 0x4dff9e, [0, 0, 0.45], [Math.PI * 0.5, 0, -0.4], undefined, Math.PI * 0.8),
        ], 'character_palette', 0.034, { emissiveHex: 0x2ecc71, emissiveIntensity: 0.75 });
        break;

      case 'axe':
        pair = makePair([
          cyl(0.07, 0.07, 1.15, 5, 0x7d4c2a),
          box(0.74, 0.48, 0.1, 0xd8e2ee, [0, 0.35, 0]),
          box(0.82, 0.38, 0.06, 0xffffff, [0, 0.35, 0]),
        ], 'metal_armor', 0.036, { gloss: 0.7 });
        break;

      case 'banana':
        // Spinning bright golden Bananarang crescent!
        pair = makePair([
          torus(0.56, 0.14, 5, 10, 0xffe03b, [0, 0, 0], [Math.PI * 0.5, 0, 0], undefined, Math.PI * 0.88),
          box(0.14, 0.12, 0.14, 0x5c371d, [0.56, 0, 0.04]),
          box(0.12, 0.12, 0.12, 0x5c371d, [-0.52, 0, 0.18]),
        ], 'character_palette', 0.036, { emissiveHex: 0xd9a816, emissiveIntensity: 0.35 });
        break;

      case 'rocket':
        // Chunky Homing Rocket missile with red nosecone, white body, fins & blazing exhaust!
        pair = makePair([
          cyl(0.2, 0.2, 0.92, 7, 0xf8fafc, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          cone(0.21, 0.45, 7, 0xff3b5c, [0, 0, 0.68], [Math.PI * 0.5, 0, 0]),
          box(0.66, 0.06, 0.28, 0xff3b5c, [0, 0, -0.36]),
          box(0.06, 0.66, 0.28, 0xff3b5c, [0, 0, -0.36]),
          cone(0.16, 0.42, 6, 0xffb703, [0, 0, -0.66], [-Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.032, { emissiveHex: 0xff621f, emissiveIntensity: 0.55 });
        break;

      case 'arrow':
        pair = makePair([
          cyl(0.05, 0.05, 1.35, 5, 0x9c6138, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          cone(0.14, 0.36, 4, 0xe2e8f0, [0, 0, 0.82], [Math.PI * 0.5, 0, 0]),
          box(0.28, 0.04, 0.32, 0x4dff77, [0, 0, -0.58]),
          box(0.04, 0.28, 0.32, 0x4dff77, [0, 0, -0.58]),
        ], 'character_palette', 0.025, { emissiveHex: 0xffe45e, emissiveIntensity: 0.35 });
        break;

      case 'dagger':
        // Sleek glowing cyan Wireless Dagger!
        pair = makePair([
          cone(0.14, 0.86, 4, 0x5cf7ff, [0, 0, 0.32], [Math.PI * 0.5, 0, 0]),
          box(0.34, 0.08, 0.1, 0xffd23f, [0, 0, -0.1]),
          cyl(0.06, 0.06, 0.32, 5, 0x262f42, [0, 0, -0.28], [Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.028, { emissiveHex: 0x38f2ff, emissiveIntensity: 0.95 });
        break;

      case 'dice': {
        // Giant tumbling white D6 cube projectile with crisp dark pips!
        const h = 0.38;
        const parts: ColoredPartSpec[] = [box(h * 2, h * 2, h * 2, 0xf7f8fc)];
        addDicePipCluster(parts, 'front', 6, h, 0);
        addDicePipCluster(parts, 'back', 1, h, 0);
        addDicePipCluster(parts, 'top', 5, h, 0);
        addDicePipCluster(parts, 'bottom', 2, h, 0);
        addDicePipCluster(parts, 'right', 3, h, 0);
        addDicePipCluster(parts, 'left', 4, h, 0);
        pair = makePair(parts, 'character_palette', 0.036, { emissiveHex: 0xffd23f, emissiveIntensity: 0.25 });
        break;
      }

      case 'flask':
        // Lobbed glowing emerald glass Poison Flask!
        pair = makePair([
          dodec(0.38, 0x52f55a, [0, -0.05, 0]),
          cyl(0.12, 0.14, 0.28, 6, 0x8cff85, [0, 0.38, 0]),
          cyl(0.1, 0.1, 0.12, 6, 0x8f562e, [0, 0.54, 0]),
        ], 'slime_gel', 0.034, { emissiveHex: 0x4dff57, emissiveIntensity: 0.7, gloss: 0.7 });
        break;

      case 'aegis_shield':
        // Orbiting glowing golden-cyan hexagonal Aegis Shield Plate!
        pair = makePair([
          cyl(0.68, 0.68, 0.12, 6, 0xffd23f, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          cyl(0.5, 0.5, 0.16, 6, 0x38bdf8, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          octa(0.22, 0xffffff, [0, 0, 0.12]),
        ], 'metal_armor', 0.038, { emissiveHex: 0x38f2ff, emissiveIntensity: 0.75, gloss: 0.75 });
        break;

      case 'blood_orb':
        pair = makePair([
          ico(0.38, 0xff2644),
          torus(0.54, 0.06, 4, 8, 0xff6b81, [0, 0, 0], [0.7, 0.4, 0]),
        ], 'character_palette', 0.032, { emissiveHex: 0xe61c3a, emissiveIntensity: 0.95 });
        break;

      case 'frost_shard':
        pair = makePair([
          octa(0.38, 0x80f7ff, [0, 0, 0], undefined, [0.7, 0.7, 1.85]),
          octa(0.22, 0xffffff, [0, 0, 0.25]),
        ], 'character_palette', 0.03, { emissiveHex: 0x38e8ff, emissiveIntensity: 0.95, gloss: 0.85 });
        break;

      case 'noodle':
        // Space Noodle neon plasma segment!
        pair = makePair([
          cyl(0.14, 0.14, 2.2, 6, 0xff66f5, [0, 0, 0], [Math.PI * 0.5, 0, 0]),
          torus(0.26, 0.06, 4, 8, 0x5cf7ff, [0, 0, 0]),
        ], 'character_palette', 0.026, { emissiveHex: 0xff38d9, emissiveIntensity: 1.2 });
        break;

      case 'tornado_proj':
        pair = makePair([
          cone(0.72, 1.85, 8, 0xa6f7ff, [0, 0.5, 0], [Math.PI, 0, 0]),
          torus(0.58, 0.08, 4, 10, 0xffffff, [0, 0.9, 0], [Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.032, { emissiveHex: 0x5cf7ff, emissiveIntensity: 0.7 });
        break;

      case 'blackhole_orb':
        pair = makePair([
          ico(0.45, 0x12081f),
          torus(0.78, 0.1, 5, 12, 0xc05eff, [0, 0, 0], [Math.PI * 0.45, 0.2, 0]),
        ], 'character_palette', 0.034, { emissiveHex: 0x8b2ce6, emissiveIntensity: 0.95 });
        break;

      case 'mine':
        pair = makePair([
          cyl(0.54, 0.62, 0.24, 8, 0x334155, [0, 0.12, 0]),
          cyl(0.22, 0.26, 0.16, 6, 0xff2644, [0, 0.28, 0]),
        ], 'metal_armor', 0.036, { emissiveHex: 0xff2644, emissiveIntensity: 0.75 });
        break;

      case 'bullet':
        pair = makePair([
          cone(0.13, 0.45, 5, 0xfff4c2, [0, 0, 0.25], [Math.PI * 0.5, 0, 0]),
          cyl(0.08, 0.03, 1.15, 5, 0xffb703, [0, 0, -0.45], [Math.PI * 0.5, 0, 0]),
        ], 'character_palette', 0.025, { emissiveHex: 0xffbe0b, emissiveIntensity: 0.95 });
        break;

      case 'boulder':
        pair = makePair([
          dodec(0.56, 0x7e8f9e),
          dodec(0.32, 0x69c748, [0.16, 0.34, 0.08]),
        ], 'terrain_cliff', 0.048);
        break;

      case 'lightning':
        pair = makePair([
          box(0.18, 1.1, 0.18, 0x80f7ff, [0.12, 0.45, 0], [0, 0, -0.32]),
          box(0.18, 1.1, 0.18, 0xffffff, [-0.12, -0.35, 0], [0, 0, 0.36]),
        ], 'character_palette', 0.03, { emissiveHex: 0x5cf7ff, emissiveIntensity: 1.2 });
        break;

      case 'sniper':
        pair = makePair([
          cyl(0.09, 0.09, 3.2, 6, 0xffffff, undefined, [Math.PI * 0.5, 0, 0]),
          torus(0.32, 0.05, 5, 8, 0x38f2ff, [0, 0, -0.6]),
        ], 'character_palette', 0.025, { emissiveHex: 0x38f2ff, emissiveIntensity: 1.2 });
        break;

      default:
        pair = makePair([octa(0.34, 0xc56cf0)], 'character_palette', 0.032, { emissiveHex: 0xa855f7, emissiveIntensity: 0.85 });
        break;
    }

    this.projectileCache.set(key, pair);
    return pair;
  }

  public getPickupGeometryPair(kind: 'gem' | 'coin' | 'heart' | 'orb'): LowPolyGeometryPair {
    const cached = this.pickupCache.get(kind);
    if (cached) return cached;

    let pair: LowPolyGeometryPair;
    switch (kind) {
      case 'gem':
        pair = makePair([octa(0.32, 0xffffff, undefined, undefined, [0.85, 1.38, 0.85])], 'character_palette', 0.035, {
          emissiveHex: 0x38f2ff,
          emissiveIntensity: 0.35,
          gloss: 0.7,
        });
        break;
      case 'coin':
        pair = makePair([cyl(0.32, 0.32, 0.12, 8, 0xffffff, undefined, [Math.PI * 0.5, 0, 0])], 'character_palette', 0.032, {
          emissiveHex: 0xffb703,
          emissiveIntensity: 0.3,
          gloss: 0.8,
        });
        break;
      case 'heart':
        pair = makePair([
          octa(0.28, 0xff3b5c, [-0.14, 0.14, 0]),
          octa(0.28, 0xff3b5c, [0.14, 0.14, 0]),
          cone(0.34, 0.44, 4, 0xff3b5c, [0, -0.14, 0], [Math.PI, Math.PI * 0.25, 0]),
        ], 'character_palette', 0.032, { emissiveHex: 0xff2e54, emissiveIntensity: 0.45 });
        break;
      case 'orb':
        pair = makePair([
          ico(0.36, 0xffffff),
          torus(0.5, 0.05, 4, 8, 0xffe45e, undefined, [Math.PI * 0.35, 0, 0]),
        ], 'character_palette', 0.035, { emissiveHex: 0xffffff, emissiveIntensity: 0.4 });
        break;
    }

    this.pickupCache.set(kind, pair);
    return pair;
  }

  public dispose(): void {
    for (const tex of Object.values(this.textures)) {
      tex.dispose();
    }
    for (const map of [
      this.enemyCache,
      this.propCache,
      this.interactableCache,
      this.projectileCache,
      this.pickupCache,
    ]) {
      for (const pair of map.values()) {
        pair.geometry.dispose();
        pair.outlineGeometry.dispose();
      }
      map.clear();
    }
  }
}

export { hexToRgb };
