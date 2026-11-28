/**
 * KRUNKEDBONK — Procedural Sculpted Low-Poly 3D Geometry Toolkit
 *
 * Generates heroic Valheim/PS1-proportioned low-poly BufferGeometries:
 * - Athletic articulated humanoid arms & legs (thigh, knee, calf, angled boot; shoulder, bicep, forearm, fist)
 * - Lathe-sculpted armor cuirasses, tunics, helmets & flared roots
 * - Extruded chamfered blades, capes, ears & battlements
 * - Monumental curved desert sandstone rock arches & craggy spires
 * - Chunky Valheim faceted leaf canopy puff clusters with clean spherical UVs
 * - Razor-sharp crescent weapon slash ribbons
 */

import * as THREE from 'three';

export type V3 = [number, number, number];

export interface SculptPart {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: V3;
  rot?: V3;
  scale?: V3;
}

/**
 * Creates a smooth lathe-sculpted solid from `[radius, y]` profile control points.
 */
export function lathePart(
  profile: ReadonlyArray<readonly [number, number]>,
  segments: number,
  color: number,
  pos?: V3,
  rot?: V3,
  scale?: V3,
): SculptPart {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!;
    pts.push(new THREE.Vector2(Math.max(0.001, p[0]), p[1]));
  }
  const geo = new THREE.LatheGeometry(pts, Math.max(5, segments));
  return { geo, color, pos, rot, scale };
}

/**
 * Extrudes a 2D polygon silhouette with crisp chamfered bevels (blades, ears, capes, crests).
 */
export function extrudePolyPart(
  points: ReadonlyArray<readonly [number, number]>,
  depth: number,
  bevelSize: number,
  color: number,
  pos?: V3,
  rot?: V3,
  scale?: V3,
): SculptPart {
  const shape = new THREE.Shape();
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i]!;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelSize > 0.0005,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 1,
    curveSegments: 4,
  });
  geo.translate(0, 0, -depth * 0.5);
  return { geo, color, pos, rot, scale };
}

/**
 * Generates an organic jagged craggy monolith boulder / cliff spire.
 */
export function createCraggySpireGeometry(
  radius: number,
  height: number,
  seed: number,
  taperTop = 0.34,
): THREE.BufferGeometry {
  const radialSegs = 7;
  const heightSegs = 4;
  const geo = new THREE.CylinderGeometry(radius * taperTop, radius, height, radialSegs, heightSegs, false);
  geo.translate(0, height * 0.5, 0);

  const pos = geo.getAttribute('position');
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i);
    const hNorm = Math.max(0, Math.min(1, tmp.y / Math.max(0.01, height)));
    const ang = Math.atan2(tmp.z, tmp.x);
    const f1 = Math.sin(ang * 3.0 + seed * 1.7 + hNorm * 2.1) * 0.22;
    const f2 = Math.cos(ang * 5.0 - seed * 2.3 + hNorm * 4.2) * 0.13;
    const shelf = Math.sin(hNorm * Math.PI * 3.0 + seed) * 0.10;
    const radialScale = 1.0 + (f1 + f2 + shelf) * (1.0 - hNorm * 0.35);

    tmp.x *= radialScale;
    tmp.z *= radialScale;
    tmp.x += Math.sin(seed * 3.1) * hNorm * hNorm * radius * 0.38;
    tmp.z += Math.cos(seed * 2.7) * hNorm * hNorm * radius * 0.32;
    if (hNorm > 0.92) {
      tmp.y += Math.sin(ang * 2.0 + seed) * height * 0.07;
    }
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Generates a monumental organic curved Desert Sandstone Rock Arch spanning across dunes!
 */
export function createSandstoneArchGeometry(
  span = 16.0,
  height = 11.5,
  thickness = 2.4,
  seed = 7,
): THREE.BufferGeometry {
  const segs = 14;
  const ringPts = 7;
  const verts = (segs + 1) * (ringPts + 1);
  const positions = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const indices: number[] = [];

  const halfSpan = span * 0.5;
  const center = new THREE.Vector3();
  const nextCenter = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3(0, 0, 1);

  const evalArchCenter = (t: number, out: THREE.Vector3) => {
    // Slightly asymmetric natural wind-carved sandstone arch curve
    const a = t * Math.PI;
    const x = -Math.cos(a) * halfSpan + Math.sin(a * 2.0) * 0.85;
    const y = Math.sin(a) * height - 1.2 + Math.sin(t * Math.PI * 3.0 + seed) * 0.35;
    const z = Math.sin(a) * Math.sin(seed * 1.3) * 1.4;
    out.set(x, y, z);
  };

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    evalArchCenter(t, center);
    evalArchCenter(Math.min(1, t + 0.01), nextCenter);
    if (i === segs) {
      evalArchCenter(t - 0.01, nextCenter);
      tangent.subVectors(center, nextCenter).normalize();
    } else {
      tangent.subVectors(nextCenter, center).normalize();
    }
    normal.crossVectors(binormal, tangent).normalize();

    // Thick flared buttress bases tapering slightly across the upper arch bridge
    const crownTaper = 1.0 - Math.sin(t * Math.PI) * 0.28;
    const radBase = thickness * crownTaper;

    for (let j = 0; j <= ringPts; j++) {
      const ang = (j / ringPts) * Math.PI * 2;
      const rockLobe =
        1.0 +
        Math.sin(ang * 3.0 + t * 7.0 + seed) * 0.18 +
        Math.cos(ang * 2.0 - t * 5.0) * 0.12;
      const rX = radBase * rockLobe * 0.92;
      const rZ = radBase * rockLobe * 1.15;

      const cx = Math.cos(ang) * rX;
      const cz = Math.sin(ang) * rZ;

      const vi = i * (ringPts + 1) + j;
      positions[vi * 3] = center.x + normal.x * cx + binormal.x * cz;
      positions[vi * 3 + 1] = center.y + normal.y * cx + binormal.y * cz;
      positions[vi * 3 + 2] = center.z + normal.z * cx + binormal.z * cz;
      uvs[vi * 2] = t * 4.0;
      uvs[vi * 2 + 1] = (j / ringPts) * 2.0;
    }
  }

  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < ringPts; j++) {
      const a = i * (ringPts + 1) + j;
      const b = a + (ringPts + 1);
      const c = a + 1;
      const d = b + 1;
      // Outward CCW winding: (c - a) x (b - a) points outward along arch cross-section normal
      indices.push(a, c, b, c, d, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Generates a chunky Valheim / PS1 faceted leaf canopy puff cluster with clean tiled UVs
 * so our dappled pixel-art foliage textures map boldly across every canopy lobe!
 */
export function createSculptedCanopyCluster(
  radius: number,
  flattenY: number,
  seed: number,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    const lobe =
      1.0 +
      Math.sin(dir.x * 3.8 + seed) * 0.16 +
      Math.cos(dir.z * 4.1 - seed * 1.4) * 0.15 +
      Math.sin(dir.y * 3.4 + seed * 0.7) * 0.10;
    v.multiplyScalar(lobe);
    v.y *= flattenY;
    if (v.y < 0) v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
    if (uv) {
      // Spherical-triplanar friendly UVs scaled so chunky Valheim leaf pixels show crisply!
      const uVal = (Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5) * 1.6;
      const vVal = (Math.asin(Math.max(-1, Math.min(1, dir.y))) / Math.PI + 0.5) * 1.4;
      uv.setXY(i, uVal, vVal);
    }
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Generates a razor-sharp crescent weapon slash mesh lying in the XZ plane.
 */
export function createCalligraphicSlashGeometry(
  innerRadius = 0.42,
  outerRadius = 1.0,
  arcAngle = Math.PI * 1.18,
  segments = 20,
): THREE.BufferGeometry {
  const verts = (segments + 1) * 2;
  const positions = new Float32Array(verts * 3);
  const normals = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = (t - 0.5) * arcAngle;
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);

    const bell = Math.sin(t * Math.PI);
    const widthScale = Math.pow(bell, 0.72);
    const rOut = outerRadius * (0.94 + 0.08 * bell);
    const rIn = rOut - (outerRadius - innerRadius) * widthScale;
    const liftY = (t - 0.5) * 0.16;

    const i0 = i * 2;
    const i1 = i0 + 1;

    positions[i0 * 3] = sinA * rIn;
    positions[i0 * 3 + 1] = liftY;
    positions[i0 * 3 + 2] = cosA * rIn;
    normals[i0 * 3] = 0;
    normals[i0 * 3 + 1] = 1;
    normals[i0 * 3 + 2] = 0;
    uvs[i0 * 2] = t;
    uvs[i0 * 2 + 1] = 0;

    positions[i1 * 3] = sinA * rOut;
    positions[i1 * 3 + 1] = liftY + 0.04;
    positions[i1 * 3 + 2] = cosA * rOut;
    normals[i1 * 3] = 0;
    normals[i1 * 3 + 1] = 1;
    normals[i1 * 3 + 2] = 0;
    uvs[i1 * 2] = t;
    uvs[i1 * 2 + 1] = 1;

    if (i < segments) {
      const a = i0;
      const b = i1;
      const c = i0 + 2;
      const d = i1 + 2;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Generates an athletic heroic Valheim/PS1 arm (shoulder cap, upper arm, slight forward elbow bend,
 * tapered bracer forearm & sculpted fist — total reach ~0.66m instead of stumpy chibi nubs!).
 */
export function buildSculptedArmParts(
  sleeveCol: number,
  forearmCol: number,
  cuffCol: number,
  handCol: number,
  sideSign: -1 | 1,
): SculptPart[] {
  return [
    // Defined shoulder cap / pauldron
    lathePart(
      [
        [0.03, 0.13],
        [0.135, 0.08],
        [0.145, -0.02],
        [0.11, -0.10],
      ],
      7,
      sleeveCol,
      [sideSign * 0.015, 0.0, 0],
    ),
    // Upper arm (shoulder -> elbow)
    lathePart(
      [
        [0.105, 0.0],
        [0.095, -0.18],
        [0.088, -0.32],
      ],
      7,
      sleeveCol,
    ),
    // Athletic forearm angled slightly forward at elbow (natural action-hero silhouette!)
    lathePart(
      [
        [0.092, 0.0],
        [0.088, -0.16],
        [0.072, -0.30],
      ],
      7,
      forearmCol,
      [0, -0.30, 0.01],
      [-0.24, 0, 0],
    ),
    // Wrist bracer cuff
    lathePart(
      [
        [0.098, -0.10],
        [0.104, -0.17],
        [0.088, -0.26],
      ],
      7,
      cuffCol,
      [0, -0.30, 0.01],
      [-0.24, 0, 0],
    ),
    // Sculpted chunky low-poly gauntlet / fist
    {
      geo: new THREE.DodecahedronGeometry(0.105, 0),
      color: handCol,
      pos: [0, -0.61, 0.09],
      scale: [0.92, 1.05, 1.15],
    },
  ];
}

/**
 * Generates an athletic heroic Valheim/PS1 leg (defined thigh, knee cap, tapered shin & sleek boot —
 * full 0.72m stride length eliminating stumpy chibi proportions across all heroes!).
 */
export function buildSculptedLegParts(
  thighCol: number,
  shinCol: number,
  cuffCol: number,
  bootCol: number,
): SculptPart[] {
  return [
    // Muscular upper thigh
    lathePart(
      [
        [0.128, 0.04],
        [0.122, -0.14],
        [0.102, -0.34],
      ],
      8,
      thighCol,
    ),
    // Sculpted knee joint cap
    {
      geo: new THREE.DodecahedronGeometry(0.098, 0),
      color: shinCol,
      pos: [0, -0.34, 0.03],
      scale: [0.95, 0.95, 0.85],
    },
    // Lower shin & boot shaft
    lathePart(
      [
        [0.102, -0.34],
        [0.112, -0.44],
        [0.090, -0.64],
      ],
      8,
      cuffCol,
      [0, 0, -0.01],
    ),
    // Sleek tapered adventurer boot foot with crisp heel & angled toe
    extrudePolyPart(
      [
        [-0.072, -0.08],
        [0.072, -0.08],
        [0.086, 0.06],
        [0.062, 0.22],
        [0.0, 0.28],
        [-0.062, 0.22],
        [-0.086, 0.06],
      ],
      0.13,
      0.018,
      bootCol,
      [0, -0.68, 0.05],
      [Math.PI * 0.5, 0, 0],
    ),
  ];
}

/**
 * Generates a dramatic sweeping split-tail hero cape / outlaw scarf cloak.
 */
export function buildSculptedCapeParts(
  outerCol: number,
  trimCol: number,
  width = 0.82,
  length = 1.15,
): SculptPart[] {
  const hw = width * 0.5;
  const bw = width * 0.66;
  return [
    extrudePolyPart(
      [
        [-hw, 0],
        [hw, 0],
        [bw, -length * 0.88],
        [bw * 0.42, -length],
        [0, -length * 0.82],
        [-bw * 0.42, -length],
        [-bw, -length * 0.88],
      ],
      0.055,
      0.014,
      outerCol,
      [0, 0, -0.04],
      [0.20, 0, 0],
    ),
    extrudePolyPart(
      [
        [-bw * 0.94, -length * 0.80],
        [bw * 0.94, -length * 0.80],
        [bw * 0.98, -length * 0.87],
        [0, -length * 0.77],
        [-bw * 0.98, -length * 0.87],
      ],
      0.068,
      0.01,
      trimCol,
      [0, 0, -0.04],
      [0.20, 0, 0],
    ),
  ];
}
