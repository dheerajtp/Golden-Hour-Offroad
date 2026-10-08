import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { WATER, REGIONS } from '../config.js';
import { mergeGeometries } from '../../vendor/utils/BufferGeometryUtils.js';
import { mulberry32 } from './terrain.js';
import { weightOf } from './regions.js';

const BASE = 'assets/kenney/nature-kit/';
const loader = new GLTFLoader();
const WOOD = 0x7a5a3a;
const REED = 0x6f7f45;

function loadModel(name, height) {
  return new Promise((resolve) => {
    loader.load(BASE + name, (g) => {
      const box = new THREE.Box3().setFromObject(g.scene);
      g.scene.userData.scale = height / Math.max(0.01, box.max.y - box.min.y);
      resolve(g.scene);
    }, undefined, () => resolve(null)); // missing asset -> primitive fallback
  });
}

function fallbackPalm(h) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 5), new THREE.MeshLambertMaterial({ color: WOOD }));
  trunk.position.y = h / 2;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x3f7f4a }));
  crown.position.y = h;
  g.add(trunk, crown);
  return g;
}

// Walk inward along angle `a` from outside the lake to the first point below the waterline.
export function shoreAt(terrain, a) {
  const L = WATER.lake;
  for (let r = L.r + 8; r > 10; r -= 0.5) {
    const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
    if (terrain.heightAt(x, z) < L.level + 0.1) return { x, z, r };
  }
  return null;
}

function buildDock(terrain, a, len) {
  const L = WATER.lake;
  const s = shoreAt(terrain, a);
  if (!s) return null;
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: WOOD });
  const y = L.level + 0.45;
  const planks = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 2.2), mat);
  planks.position.y = y;
  g.add(planks);
  for (let d = -len / 2 + 0.5; d <= len / 2; d += 3) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 5), mat);
      post.position.set(d, y - 0.9, side * 1.0);
      g.add(post);
    }
  }
  // centre the dock so it starts 1.5 inside the bank and runs toward the lake centre
  const rc = s.r + 1.5 - len / 2;
  g.position.set(L.x + Math.cos(a) * rc, 0, L.z + Math.sin(a) * rc);
  g.rotation.y = -(a + Math.PI); // local +x points to the lake centre
  g.userData.len = len;
  g.userData.tip = { x: L.x + Math.cos(a) * (rc - len / 2), z: L.z + Math.sin(a) * (rc - len / 2) };
  return g;
}

const BULB = new THREE.MeshBasicMaterial({ color: 0x40382a });

function boxG(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// Dock-local frame: +x runs out over the water, y is world height. Adds a rowboat and a string of bulbs on end posts.
function dressDock(dock) {
  const y0 = WATER.lake.level;
  const half = dock.userData.len / 2;
  const hull = mergeGeometries([
    boxG(3.4, 0.45, 1.3, 0, 0.1, 0), boxG(1.2, 0.4, 0.9, 2.2, 0.2, 0), // hull + pointed-ish bow block
  ]);
  const boat = new THREE.Mesh(hull, new THREE.MeshLambertMaterial({ color: 0x9a6a3c }));
  const inside = new THREE.Mesh(boxG(2.9, 0.08, 0.95, -0.1, 0.34, 0), new THREE.MeshLambertMaterial({ color: 0x5a3f27 }));
  const seat = new THREE.Mesh(boxG(0.3, 0.1, 1.0, 0.3, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0xb98a55 }));
  const bg = new THREE.Group();
  bg.add(boat, inside, seat);
  bg.position.set(half - 2.4, y0 - 0.1, 2.3);
  bg.rotation.y = 0.12;
  dock.add(bg);
  // string lights between two tall end posts along the z = -1 rail
  const woodM = new THREE.MeshLambertMaterial({ color: WOOD });
  const posts = mergeGeometries([boxG(0.14, 2.4, 0.14, -half + 0.4, y0 + 1.6, -1.0), boxG(0.14, 2.4, 0.14, half - 0.4, y0 + 1.6, -1.0)]);
  dock.add(new THREE.Mesh(posts, woodM));
  const n = 9;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), BULB, n);
  const m = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    m.position.set(-half + 0.4 + t * (dock.userData.len - 0.8), y0 + 2.75 - 0.6 * Math.sin(Math.PI * t), -1.0);
    m.updateMatrix();
    bulbs.setMatrixAt(i, m.matrix);
  }
  dock.add(bulbs);
  return { boat: 1, bulbs: n };
}

function hammock(terrain, jetty) {
  const L = WATER.lake;
  const tip = jetty.userData.tip;
  // 7 m inland (away from lake centre) and 6 m to the side of the jetty root
  const dx = tip.x - L.x, dz = tip.z - L.z, len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const cx = tip.x + ux * (jetty.userData.len + 8) - uz * 7, cz = tip.z + uz * (jetty.userData.len + 8) + ux * 7;
  if (terrain.heightAt(cx, cz) < L.level + 0.8 || terrain.slopeAt(cx, cz) > 0.4) return null;
  const g = new THREE.Group();
  const y = terrain.heightAt(cx, cz);
  const parts = [boxG(0.18, 2.2, 0.18, -1.8, 1.1, 0), boxG(0.18, 2.2, 0.18, 1.8, 1.1, 0)];
  const cloth = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    cloth.push(boxG(0.7, 0.06, 0.8, -1.7 + t * 3.4, 1.9 - 0.55 * Math.sin(Math.PI * t), 0));
  }
  g.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: WOOD })));
  g.add(new THREE.Mesh(mergeGeometries(cloth), new THREE.MeshLambertMaterial({ color: 0xc9573a })));
  g.position.set(cx, y, cz);
  g.rotation.y = Math.atan2(uz, ux) + Math.PI / 2; // hammock axis perpendicular to the shore normal
  return g;
}

export function updateRegionProps(group, nightFactor) {
  const nf = Math.min(1, Math.max(0, (nightFactor - 0.15) / 0.35));
  BULB.color.setRGB(0.25 + 0.75 * nf, 0.22 + 0.63 * nf, 0.16 + 0.29 * nf);
}

export async function buildRegionProps(terrain) {
  const group = new THREE.Group();
  const L = WATER.lake;
  const rng = mulberry32(6001);

  // --- beach-coast: palms, jetty, canoe
  const palmSrc = (await Promise.all(
    [['tree_palm.glb', 6], ['tree_palmBend.glb', 6], ['tree_palmTall.glb', 8], ['tree_palmShort.glb', 4.5]]
      .map(([n, h]) => loadModel(n, h)),
  ));
  let palms = 0;
  for (let tries = 0; tries < 400 && palms < 18; tries++) {
    const ang = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 48;
    const x = 95 + Math.cos(ang) * d, z = 15 + Math.sin(ang) * d;
    const y = terrain.heightAt(x, z);
    if (weightOf('beach-coast', x, z) < 0.9 || y < L.level + 0.8) continue;
    if (terrain.isWater(x, z) || terrain.slopeAt(x, z) > 0.5 || terrain.trailWeightAt(x, z) > 0.18) continue;
    const k = Math.floor(rng() * palmSrc.length);
    const src = palmSrc[k];
    const palm = src ? src.clone(true) : fallbackPalm(6);
    if (src) palm.scale.setScalar(src.userData.scale * (0.85 + rng() * 0.3));
    palm.position.set(x, y, z);
    palm.rotation.y = rng() * Math.PI * 2;
    palm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(palm);
    palms++;
  }
  group.userData.palms = palms;

  const jetty = buildDock(terrain, Math.atan2(15 - L.z, 95 - L.x), 14);
  if (jetty) {
    group.add(jetty);
    const canoe = await loadModel('canoe.glb', 0.8);
    if (canoe) {
      const c = canoe.clone(true);
      c.scale.setScalar(canoe.userData.scale * 3.4); // canoe ~3.4 m long relative to its 0.8 m height
      c.position.set(jetty.userData.tip.x + 1.2, L.level + 0.05, jetty.userData.tip.z + 2.6);
      c.rotation.y = 0.5;
      group.add(c);
    }
  }

  // --- misty-valley: dock + reed clumps along the west shore
  const mistyA = Math.atan2(50 - L.z, -55 - L.x);
  const dock = buildDock(terrain, mistyA, 12);
  if (dock) { group.add(dock); }
  const reedMat = new THREE.MeshLambertMaterial({ color: REED });
  const reedGeo = new THREE.BoxGeometry(0.06, 1.4, 0.06);
  reedGeo.translate(0, 0.7, 0);
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, 90);
  const m = new THREE.Object3D();
  let n = 0;
  for (let a = mistyA - 0.6; a <= mistyA + 0.6 && n < 90; a += 0.06) {
    const s = shoreAt(terrain, a);
    if (!s || Math.abs(a - mistyA) < 0.12) continue; // keep the dock clear
    for (let i = 0; i < 3 && n < 90; i++, n++) {
      m.position.set(s.x + (rng() - 0.5) * 2, L.level - 0.3, s.z + (rng() - 0.5) * 2);
      m.rotation.set((rng() - 0.5) * 0.2, rng() * Math.PI, (rng() - 0.5) * 0.2);
      m.scale.set(1, 0.7 + rng() * 0.8, 1);
      m.updateMatrix();
      reeds.setMatrixAt(n, m.matrix);
    }
  }
  reeds.count = n;
  group.add(reeds);
  group.userData.reeds = n;
  // --- desert-mesa: cacti + red rock formations (stacked kit rocks tinted terracotta)
  const D = REGIONS['desert-mesa'];
  const [cacS, cacT, rkA, rkB, rkC] = await Promise.all(
    [['cactus_short.glb', 1.6], ['cactus_tall.glb', 3.2], ['rock_largeA.glb', 5], ['rock_largeB.glb', 5], ['rock_largeC.glb', 5]]
      .map(([n, h]) => loadModel(n, h)),
  );
  const tint = (o, hex) => o.traverse((m) => {
    if (m.isMesh) { m.material = m.material.clone(); m.material.color.setHex(hex); m.castShadow = true; }
  });
  const spot = (minW, slope) => {
    for (let t = 0; t < 60; t++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * D.r;
      const x = D.x + Math.cos(a) * d, z = D.z + Math.sin(a) * d;
      if (weightOf('desert-mesa', x, z) < minW || terrain.isWater(x, z)) continue;
      if (terrain.slopeAt(x, z) > slope || terrain.trailWeightAt(x, z) > 0.18) continue;
      return { x, z, y: terrain.heightAt(x, z) };
    }
    return null;
  };
  let cacti = 0;
  for (let i = 0; i < 16; i++) {
    const sp = spot(0.9, 0.5), src = rng() < 0.5 ? cacS : cacT;
    if (!sp) continue;
    const c = src ? src.clone(true) : fallbackPalm(2);
    if (src) c.scale.setScalar(src.userData.scale * (0.8 + rng() * 0.5));
    c.position.set(sp.x, sp.y, sp.z);
    c.rotation.y = rng() * Math.PI * 2;
    group.add(c);
    cacti++;
  }
  let rocks = 0;
  for (let i = 0; i < 6; i++) { // each formation = 2-3 stacked rocks
    const sp = spot(0.95, 0.5);
    if (!sp) continue;
    let y = sp.y;
    for (let k = 0, n = 2 + (i % 2); k < n; k++) {
      const src = [rkA, rkB, rkC][(i + k) % 3];
      if (!src) break;
      const r = src.clone(true);
      tint(r, [0xb5643c, 0xa5553a, 0xc2764a][k % 3]);
      const sc = src.userData.scale * (2.4 - k * 0.6) * (0.9 + rng() * 0.3);
      r.scale.set(sc, sc * (1.2 + k * 0.3), sc);
      r.position.set(sp.x + (rng() - 0.5), y - 0.3, sp.z + (rng() - 0.5));
      r.rotation.y = rng() * Math.PI * 2;
      group.add(r);
      y += (5 * sc / src.userData.scale) * (1.2 + k * 0.3) * 0.55;
      rocks++;
    }
  }
  group.userData.cacti = cacti;
  group.userData.rocks = rocks;
  group.userData.dressed = [jetty, dock].filter(Boolean).map(dressDock);
  const ham = jetty && hammock(terrain, jetty);
  if (ham) group.add(ham);
  group.userData.hammock = ham ? 1 : 0;
  group.userData.docks = (jetty ? 1 : 0) + (dock ? 1 : 0);
  return group;
}
