import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/utils/BufferGeometryUtils.js';
import { STRUCTURES } from '../config.js';
import { regionWeights } from './regions.js';
import { shoreAt } from './regionProps.js';
import { WATER } from '../config.js';

const WOOD = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
const STONE = new THREE.MeshLambertMaterial({ color: 0x8a8378 });

// Collects boxes in trail-local space (x = across, z = along the trail) and merges them into one mesh per material.
class Parts {
  constructor() { this.geos = new Map(); }
  box(mat, w, h, d, x, y, z, rotX = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotX) g.rotateX(rotX);
    g.translate(x, y, z);
    if (!this.geos.has(mat)) this.geos.set(mat, []);
    this.geos.get(mat).push(g);
  }
  arm(mat, w, h, d, x, y, z, ang) { // box rotated about the local origin (rotor hub)
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z); g.rotateZ(ang);
    if (!this.geos.has(mat)) this.geos.set(mat, []);
    this.geos.get(mat).push(g);
  }
  build(group) {
    for (const [mat, list] of this.geos) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = true;
      group.add(m);
    }
  }
}

function frame(terrain, u) {
  const t = terrain.trailPoint(u);
  const g = new THREE.Group();
  g.position.set(t.pos.x, t.y, t.pos.z);
  g.rotation.y = Math.atan2(t.tan.x, t.tan.z); // local +z = trail forward
  return g;
}

// Deck sits at/just above trail height (truck height is heightAt only, so bridges are visual-only).
function bridge(terrain, S, mat, deckLift, pierDepth) {
  const g = frame(terrain, S.u);
  const p = new Parts();
  const L = S.length, W = 6.4, y = deckLift;
  p.box(mat, W, 0.3, L, 0, y - 0.15, 0);
  const rail = mat === WOOD ? 0.14 : 0.5;
  for (const sx of [-1, 1]) {
    p.box(mat, rail, mat === WOOD ? 0.14 : 0.9, L, sx * (W / 2 - rail / 2), y + (mat === WOOD ? 0.95 : 0.45), 0);
    if (mat === WOOD) {
      for (let z = -L / 2; z <= L / 2 + 0.01; z += L / 4) p.box(mat, 0.2, 1.1, 0.2, sx * (W / 2 - 0.1), y + 0.55, z);
    }
    for (const sz of [-1, 1]) p.box(STONE, 1.2, pierDepth + deckLift, 1.4, sx * (W / 2 - 0.6), y - (pierDepth + deckLift) / 2, sz * (L / 2 - 0.7));
  }
  p.build(g);
  return g;
}

function tunnel(terrain, S) {
  const g = frame(terrain, S.u);
  const p = new Parts();
  const D = S.length, H = 8.6, side = 5.2;
  for (const sx of [-1, 1]) {
    p.box(STONE, 3, H + 4, D, sx * side, (H - 4) / 2, 0); // pillar, base buried below trail level
    p.box(STONE, 4.2, 3.2, D + 1.4, sx * (side - 0.2), H + 0.9, 0, 0); // shoulder
  }
  p.box(STONE, side * 2 + 3, 3, D + 1.4, 0, H + 1.5, 0); // lintel
  p.box(STONE, side * 2 + 6, 3.5, D + 4, 0, H + 4.2, 0); // rock mass on top
  p.build(g);
  return g;
}

// Finds valid off-trail sites for windmill/barn near their configured u; call before the forest so trees avoid them.
export function planSites(terrain, avoid) {
  const gates = STRUCTURES.gateUs.map((u) => terrain.trailPoint(u).pos);
  const placed = [];
  const valid = (x, z) => {
    if (Math.abs(x) > 250 || Math.abs(z) > 250) return false;
    if (terrain.isWater(x, z) || terrain.trailWeightAt(x, z) > 0.02) return false;
    if (regionWeights(x, z).some((o) => o.w > 0.05)) return false;
    for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) {
      if (terrain.slopeAt(x + dx, z + dz) > 0.35 || terrain.isWater(x + dx, z + dz)) return false;
    }
    for (const a of [...avoid, ...placed]) if (Math.hypot(a.x - x, a.z - z) < STRUCTURES.clear) return false;
    for (const g of gates) if (Math.hypot(g.x - x, g.z - z) < STRUCTURES.gateClear) return false;
    return true;
  };
  const sites = {};
  for (const name of ['windmill', 'barn', 'ruins']) {
    const S = STRUCTURES[name];
    search: for (let du = 0; du <= 0.06; du += 0.01) {
      for (const sd of [1, -1]) for (const dsgn of [1, -1]) {
        const u = S.u + du * dsgn;
        for (let off = S.off; off <= S.off + 30; off += 6) {
          const t0 = terrain.trailPoint(u), t1 = terrain.trailPoint(u + 0.004);
          const dx = t1.pos.x - t0.pos.x, dz = t1.pos.z - t0.pos.z, len = Math.hypot(dx, dz) || 1;
          const side = S.side * sd;
          const x = t0.pos.x + (-dz / len) * off * side, z = t0.pos.z + (dx / len) * off * side;
          if (!valid(x, z)) continue;
          sites[name] = { x, z, yaw: Math.atan2(t0.pos.x - x, t0.pos.z - z) };
          placed.push(sites[name]);
          break search;
        }
      }
    }
  }
  // lighthouse: on the lake shore, facing the lake (land check by height, since isWater covers the whole lake disc)
  const L = WATER.lake, LH = STRUCTURES.lighthouse;
  for (let da = 0; da <= 0.6 && !sites.lighthouse; da += 0.1) {
    for (const sg of [1, -1]) {
      const a = LH.angle + da * sg, sh = shoreAt(terrain, a);
      if (!sh) continue;
      const r = sh.r + LH.inland;
      const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      if (terrain.heightAt(x, z) < L.level + 0.8 || terrain.trailWeightAt(x, z) > 0.02) continue;
      if (avoid.some((v) => Math.hypot(v.x - x, v.z - z) < STRUCTURES.clear)) continue;
      sites.lighthouse = { x, z, yaw: Math.atan2(L.x - x, L.z - z) };
      break;
    }
  }
  return sites;
}

function at(group, terrain, site) {
  group.position.set(site.x, terrain.heightAt(site.x, site.z), site.z);
  group.rotation.y = site.yaw;
  return group;
}

const RED = new THREE.MeshLambertMaterial({ color: 0x9c3b2a });
const ROOF = new THREE.MeshLambertMaterial({ color: 0x4a3a30 });
const CREAM = new THREE.MeshLambertMaterial({ color: 0xe9dcc0 });
const DARK = new THREE.MeshLambertMaterial({ color: 0x2a1d16 });

function windmill(terrain, site) {
  const g = at(new THREE.Group(), terrain, site);
  const p = new Parts();
  p.box(STONE, 6, 1.2, 6, 0, -0.2, 0);
  build(g, p);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3, 11, 8), CREAM);
  tower.position.y = 5.5; tower.castShadow = true;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.6, 8), ROOF);
  cap.position.y = 12.3;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.3), DARK);
  door.position.set(0, 1.1, 2.9);
  g.add(tower, cap, door);
  const rotor = new THREE.Group();
  rotor.position.set(0, 10.5, 2.6); // hub on the +z (trail-facing) side
  const bp = new Parts();
  for (let k = 0; k < 4; k++) {
    bp.arm(WOOD, 0.35, 8, 0.2, 0, 4.4, 0, (k * Math.PI) / 2);
    bp.arm(CREAM, 1.5, 5, 0.1, 0.9, 5, 0.12, (k * Math.PI) / 2);
  }
  bp.build(rotor);
  g.add(rotor);
  g.userData.rotor = rotor;
  return g;
}

function barn(terrain, site) {
  const g = at(new THREE.Group(), terrain, site);
  const W = 10, L = 14, H = 5.5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H + 1, L), RED);
  body.position.y = H / 2 - 0.5; body.castShadow = true;
  // gabled roof: triangular prism along z
  const shape = new THREE.Shape([new THREE.Vector2(-W / 2 - 0.5, 0), new THREE.Vector2(W / 2 + 0.5, 0), new THREE.Vector2(0, 3.6)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: L + 1, bevelEnabled: false }), ROOF);
  roof.position.set(0, H, -(L + 1) / 2); roof.castShadow = true;
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4, 0.3), CREAM);
  door.position.set(0, 2, L / 2 + 0.02);
  const dark = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.6, 0.32), DARK);
  dark.position.set(0, 1.9, L / 2 + 0.03);
  g.add(body, roof, door, dark);
  // paddock fence in front: posts + two rails, merged
  const p = new Parts();
  const fz = L / 2 + 7, fw = 9;
  for (const sx of [-1, 1]) p.box(WOOD, 0.14, 0.14, fz - L / 2, sx * fw, 0.9, (fz + L / 2) / 2);
  p.box(WOOD, fw * 2, 0.14, 0.14, 0, 0.9, fz);
  p.box(WOOD, fw * 2, 0.14, 0.14, 0, 0.45, fz);
  for (let x = -fw; x <= fw + 0.01; x += fw / 3) p.box(WOOD, 0.2, 1.2, 0.2, x, 0.6, fz);
  for (let z = L / 2; z <= fz; z += 3.5) for (const sx of [-1, 1]) p.box(WOOD, 0.2, 1.2, 0.2, sx * fw, 0.6, z);
  p.box(WOOD, 2.2, 1.0, 1.4, 6, 0.5, -2); // hay bale stack
  build(g, p);
  return g;
}

const MOSS = new THREE.MeshLambertMaterial({ color: 0x5d6b45 });

function ruins(terrain, site) {
  const g = at(new THREE.Group(), terrain, site);
  const p = new Parts();
  // broken perimeter walls 16 x 11 with gaps and uneven heights
  const walls = [[-8, 0, 0.8, 11, 3.2], [8, 0, 0.8, 11, 1.4], [-3, -5.5, 6, 0.8, 2.4], [5.5, -5.5, 4, 0.8, 0.9], [0, 5.5, 5, 0.8, 1.8]];
  for (const [x, z, w, d, h] of walls) { p.box(STONE, w, h, d, x, h / 2 - 0.3, z); p.box(MOSS, w + 0.1, 0.25, d + 0.1, x, h - 0.3, z); }
  for (const [x, z, r] of [[-2, 1, 0.3], [3, -1, 0.9], [6, 3, 0.1], [-5, 3.5, 0.6]]) p.box(STONE, 1.4, 0.9, 1.1, x, 0.15, z);
  // watchtower in the ruined corner: hollow square shaft with crenellations and a plank floor
  const tx = -8, tz = 9;
  for (const [x, z, w, d] of [[0, -2, 4.4, 0.8], [0, 2, 4.4, 0.8], [-2, 0, 0.8, 4.4], [2, 0, 0.8, 4.4]]) p.box(STONE, w, 11, d, tx + x, 5.2, tz + z);
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -2], [0, 2], [-2, 0], [2, 0]]) p.box(STONE, 0.9, 1, 0.9, tx + x, 11.2, tz + z);
  p.box(WOOD, 3.6, 0.25, 3.6, tx, 6.5, tz);
  p.build(g);
  return g;
}

function lighthouse(terrain, site) {
  const g = at(new THREE.Group(), terrain, site);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 14, 10), CREAM);
  tower.position.y = 6.4; tower.castShadow = true;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 3, 10), RED);
  band.position.y = 5;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.4, 10), DARK);
  gallery.position.y = 13.6;
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x8a8460 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 8), lampMat);
  lamp.position.y = 14.7;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 10), RED);
  roof.position.y = 16.5;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.4, 10), STONE);
  base.position.y = -0.2;
  g.add(tower, band, gallery, lamp, roof, base);
  // rotating beam: long additive box, night only
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 60), beamMat);
  beam.geometry.translate(0, 0, 30);
  const pivot = new THREE.Group();
  pivot.position.y = 14.7;
  pivot.add(beam);
  pivot.visible = false;
  g.add(pivot);
  g.userData.lamp = { mat: lampMat, beamMat, pivot };
  return g;
}

function build(g, p) { p.build(g); }

export function updateStructures(group, dt, nightFactor = 0) {
  const r = group.userData.windmillRotor;
  if (r) r.rotation.z += 0.6 * dt;
  const L = group.userData.lighthouseLamp;
  if (L) {
    const nf = Math.min(1, Math.max(0, (nightFactor - 0.15) / 0.35));
    L.mat.color.setRGB(0.54 + 0.46 * nf, 0.52 + 0.43 * nf, 0.38 + 0.2 * nf);
    L.pivot.visible = nf > 0.02;
    L.beamMat.opacity = 0.5 * nf;
    L.pivot.rotation.y += 0.8 * dt;
  }
}

export async function buildStructures(terrain, sites = {}) {
  const group = new THREE.Group();
  const out = {};
  const { woodBridge, stoneBridge, tunnel: T } = STRUCTURES;
  out.woodBridge = bridge(terrain, woodBridge, WOOD, woodBridge.lift, 0.2);
  out.stoneBridge = bridge(terrain, stoneBridge, STONE, stoneBridge.lift, stoneBridge.pier);
  out.tunnel = tunnel(terrain, T);
  if (sites.windmill) { out.windmill = windmill(terrain, sites.windmill); group.userData.windmillRotor = out.windmill.userData.rotor; }
  if (sites.barn) out.barn = barn(terrain, sites.barn);
  if (sites.ruins) out.ruins = ruins(terrain, sites.ruins);
  if (sites.lighthouse) { out.lighthouse = lighthouse(terrain, sites.lighthouse); group.userData.lighthouseLamp = out.lighthouse.userData.lamp; }
  for (const k of Object.keys(out)) group.add(out[k]);
  group.userData.items = Object.fromEntries(
    Object.entries(out).map(([k, g]) => [k, { x: g.position.x, y: g.position.y, z: g.position.z, yaw: g.rotation.y, meshes: g.children.length, rotor: !!g.userData.rotor }]),
  );
  return group;
}
