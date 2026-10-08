import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { mulberry32 } from './terrain.js';

const CABIN_US = [0.06, 0.27, 0.55, 0.78, 0.92];
const WINDOW_DIM = new THREE.Color(0x3a2e1e);
const WINDOW_LIT = new THREE.Color(0xffd9a0);
const FLOWER_COLORS = [0xe8c23a, 0xd94f2b, 0xe07a3a, 0xf2e8c9, 0xc2552f];
const WOOD = 0x6b4a2e;
const WOOD_LIGHT = 0x8a6b4a;

function aframeCabin() {
  const group = new THREE.Group();
  const w = 5.2, h = 4.4, d = 6.2;
  const slope = Math.hypot(w / 2, h);
  const theta = Math.atan2(h, w / 2);
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.cabinRoof, emissive: 0x543a24 });
  const wallMat = new THREE.MeshLambertMaterial({ color: PALETTE.cabinRoof, emissive: 0x5c3520 });

  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slope + 0.4, 0.16, d + 0.5), roofMat);
    slab.rotation.z = side < 0 ? theta : Math.PI - theta;
    slab.position.set(
      side * (w / 4) + side * 0.069,
      h / 2 + 0.041,
      0,
    );
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
  }

  const backShape = new THREE.Shape();
  backShape.moveTo(-w / 2, 0);
  backShape.lineTo(w / 2, 0);
  backShape.lineTo(0, h);
  backShape.closePath();
  const backGeo = new THREE.ExtrudeGeometry(backShape, { depth: 0.16, bevelEnabled: false });
  const back = new THREE.Mesh(backGeo, wallMat);
  back.position.z = -d / 2;
  back.castShadow = true;
  back.receiveShadow = true;
  group.add(back);

  const frontShape = new THREE.Shape();
  frontShape.moveTo(-w / 2, 0);
  frontShape.lineTo(-0.56, 0);
  frontShape.lineTo(-0.56, 1.9);
  frontShape.lineTo(0.56, 1.9);
  frontShape.lineTo(0.56, 0);
  frontShape.lineTo(w / 2, 0);
  frontShape.lineTo(0, h);
  frontShape.closePath();
  const frontGeo = new THREE.ExtrudeGeometry(frontShape, { depth: 0.16, bevelEnabled: false });
  const front = new THREE.Mesh(frontGeo, wallMat);
  front.position.z = d / 2 - 0.16;
  front.castShadow = true;
  front.receiveShadow = true;
  group.add(front);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.1, 0.12, d - 0.1),
    new THREE.MeshLambertMaterial({ color: WOOD, emissive: 0x5c4830 }),
  );
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  group.add(floor);

  const windows = [];
  const winMat = () => new THREE.MeshBasicMaterial({ color: WINDOW_DIM.clone() });
  for (const sx of [-1.02, 1.02]) {
    const mat = winMat();
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.24), mat);
    win.position.set(sx, 1.5, d / 2 - 0.08);
    group.add(win);
    windows.push(mat);
  }
  const winHalf = (w / 2) * (1 - 2.1 / h);
  const slopeWins = [
    { x: -winHalf, rz: theta, z: 1.0 },
    { x: winHalf, rz: Math.PI - theta, z: -1.0 },
  ];
  for (const sw of slopeWins) {
    const mat = winMat();
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.7), mat);
    win.rotation.z = sw.rz;
    win.position.set(sw.x, 2.1, sw.z);
    group.add(win);
    windows.push(mat);
  }

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.05, 2.0),
    new THREE.MeshLambertMaterial({ color: 0xc2552f, emissive: 0x3a1808 }),
  );
  rug.position.set(0, 0.14, 0.4);
  group.add(rug);

  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.3, 2.0),
    new THREE.MeshLambertMaterial({ color: WOOD_LIGHT, emissive: 0x3a2818 }),
  );
  bed.position.set(-1.7, 0.28, -1.3);
  group.add(bed);
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0xf2e8c9, emissive: 0x4a452f }),
  );
  pillow.position.set(-1.7, 0.5, -2.0);
  group.add(pillow);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.5, 0.7),
    new THREE.MeshLambertMaterial({ color: WOOD, emissive: 0x3a2814 }),
  );
  table.position.set(1.6, 0.32, 0.6);
  group.add(table);

  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.32, 0.24),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  );
  lamp.position.set(0, 3.1, 0);
  group.add(lamp);
  const cord = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 1.0, 0.04),
    new THREE.MeshLambertMaterial({ color: 0x2a2118 }),
  );
  cord.position.set(0, 3.76, 0);
  group.add(cord);

  group.userData.windows = windows;
  return group;
}

function campfire(terrain, x, z) {
  const group = new THREE.Group();
  group.position.set(x, terrain.heightAt(x, z) - 0.05, z);
  const logMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.16), logMat);
    log.castShadow = true;
    log.position.y = 0.14;
    log.rotation.y = (i / 3) * Math.PI;
    group.add(log);
  }
  const stoneMat = new THREE.MeshLambertMaterial({ color: PALETTE.rock });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.26), stoneMat);
    stone.position.set(Math.sin(a) * 0.9, 0.1, Math.cos(a) * 0.9);
    stone.rotation.y = a;
    stone.castShadow = true;
    group.add(stone);
  }
  const outer = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.5, 0.36),
    new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
  );
  outer.position.y = 0.45;
  group.add(outer);
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.36, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  );
  inner.position.y = 0.5;
  group.add(inner);
  group.userData.flames = [outer, inner];
  return group;
}

function campsite(terrain, x, z, yaw) {
  const group = new THREE.Group();
  group.position.set(x, terrain.heightAt(x, z) - 0.03, z);
  group.rotation.y = yaw;

  const sheet = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.05, 2.8),
    new THREE.MeshLambertMaterial({ color: 0x7a6a55 }),
  );
  sheet.position.set(0, 0.03, -1.6);
  group.add(sheet);

  const tentMat = new THREE.MeshLambertMaterial({ color: PALETTE.cabinRoof });
  const tTheta = Math.atan2(1.6, 1.0);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.08, 2.5), tentMat);
    panel.rotation.z = side < 0 ? tTheta : Math.PI - tTheta;
    panel.position.set(side * 0.5 + side * 0.034, 0.8 + 0.021, -1.6);
    panel.castShadow = true;
    group.add(panel);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 2.6), new THREE.MeshLambertMaterial({ color: WOOD }));
  ridge.position.set(0, 1.62, -1.6);
  group.add(ridge);

  const seatMat = new THREE.MeshLambertMaterial({ color: WOOD });
  for (const sx of [-1.6, 1.6]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 1.7), seatMat);
    seat.position.set(sx, 0.2, 1.4);
    seat.castShadow = true;
    group.add(seat);
  }

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.9), seatMat);
  top.position.set(2.9, 0.75, -1.0);
  top.castShadow = true;
  group.add(top);
  for (const bz of [-0.62, 0.62]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.32), seatMat);
    bench.position.set(2.9, 0.45, -1.0 + bz);
    group.add(bench);
  }
  for (const lx of [-0.7, 0.7]) {
    for (const lz of [-0.35, 0.35]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.1), seatMat);
      leg.position.set(2.9 + lx, 0.37, -1.0 + lz);
      group.add(leg);
    }
  }

  return group;
}

function scatterSpot(rng, terrain, minW, maxW, margin = 280) {
  for (let i = 0; i < 500; i++) {
    const x = (rng() - 0.5) * 540;
    const z = (rng() - 0.5) * 540;
    if (Math.abs(x) > margin || Math.abs(z) > margin) continue;
    const tw = terrain.trailWeightAt(x, z);
    if (tw < minW || tw > maxW) continue;
    if (terrain.isWater(x, z) || terrain.slopeAt(x, z) > 0.75) continue;
    return { x, z };
  }
  return null;
}

function trailSpot(terrain, u, side, off) {
  const t = terrain.trailPoint(u);
  const tx = t.tan.x;
  const tz = t.tan.z;
  const len = Math.hypot(tx, tz) || 1;
  const px = (tz / len) * off * side;
  const pz = (-tx / len) * off * side;
  const x = t.pos.x + px;
  const z = t.pos.z + pz;
  return { x, z, yaw: Math.atan2(tx, tz) };
}

function minDist(x, z, list) {
  let m = Infinity;
  for (const p of list) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < m) m = d;
  }
  return m;
}

function localToWorld(cx, cz, yaw, lx, lz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
}

export function buildProps(terrain, extraAvoid = []) {
  const group = new THREE.Group();
  const rng = mulberry32(9001);
  const cabins = [];
  const tents = [];
  const fires = [];
  const signs = [];
  const counts = {
    logs: 0, stumps: 0, signs: 0, bushes: 0, lanterns: 0,
    mushrooms: 0, benches: 0, deadTrees: 0, hay: 0, pumpkins: 0,
    firewood: 0, mailboxes: 0, markers: 0, campsites: 0,
  };
  const dummy = new THREE.Object3D();

  for (const u of CABIN_US) {
    const t0 = terrain.trailPoint(u);
    const t1 = terrain.trailPoint(u + 0.004);
    const dx = t1.pos.x - t0.pos.x;
    const dz = t1.pos.z - t0.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = rng() < 0.5 ? 1 : -1;
    const off = 13 + rng() * 7;
    const x = t0.pos.x + (-dz / len) * off * side;
    const z = t0.pos.z + (dx / len) * off * side;
    if (terrain.trailWeightAt(x, z) > 0.4) continue;
    const cabin = aframeCabin();
    cabin.position.set(x, terrain.heightAt(x, z) - 0.15, z);
    const yaw = Math.atan2(t0.pos.x - x, t0.pos.z - z);
    cabin.rotation.y = yaw;
    group.add(cabin);
    cabins.push({ x, z, cabin });

    const ndx = (t0.pos.x - x) / Math.hypot(t0.pos.x - x, t0.pos.z - z);
    const ndz = (t0.pos.z - z) / Math.hypot(t0.pos.x - x, t0.pos.z - z);
    let fx = x + ndx * 5.5;
    let fz = z + ndz * 5.5;
    if (terrain.trailWeightAt(fx, fz) > 0.3) {
      fx = x - ndz * 4;
      fz = z + ndx * 4;
    }
    const fire = campfire(terrain, fx, fz);
    group.add(fire);
    fires.push({ x: fx, z: fz, y: terrain.heightAt(fx, fz), fire });

    for (let i = 0; i < 2; i++) {
      const p = localToWorld(x, z, yaw, -2.6 - i * 0.6, -1.6);
      const wood = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.24, 1.1),
        new THREE.MeshLambertMaterial({ color: WOOD }),
      );
      wood.position.set(p.x, terrain.heightAt(p.x, p.z) + 0.14, p.z);
      wood.rotation.y = yaw;
      wood.castShadow = true;
      group.add(wood);
      const wood2 = wood.clone();
      wood2.position.y += 0.26;
      wood2.position.x += 0.1;
      group.add(wood2);
      counts.firewood += 2;
    }
    const cratePos = localToWorld(x, z, yaw, 2.9, 1.2);
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color: WOOD_LIGHT, emissive: 0x241708 }),
    );
    crate.position.set(cratePos.x, terrain.heightAt(cratePos.x, cratePos.z) + 0.35, cratePos.z);
    crate.rotation.y = yaw + 0.4;
    crate.castShadow = true;
    group.add(crate);
    const hayPos = localToWorld(x, z, yaw, 2.7, -1.8);
    const hayBale = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.9),
      new THREE.MeshLambertMaterial({ color: 0xd9b24a }),
    );
    hayBale.position.set(hayPos.x, terrain.heightAt(hayPos.x, hayPos.z) + 0.35, hayPos.z);
    hayBale.rotation.y = yaw;
    hayBale.castShadow = true;
    group.add(hayBale);
    counts.hay += 1;
  }

  const avoid = [
    ...cabins.map((c) => ({ x: c.x, z: c.z })),
    ...extraAvoid,
  ];

  const CAMP_US = [0.4, 0.68];
  for (let ci = 0; ci < CAMP_US.length; ci++) {
    for (let tries = 0; tries < 300; tries++) {
      const u = CAMP_US[ci] + (rng() - 0.5) * 0.05;
      const side = rng() < 0.5 ? 1 : -1;
      const off = 11 + rng() * 9;
      const t0 = terrain.trailPoint(u);
      const t1 = terrain.trailPoint(u + 0.004);
      const dx = t1.pos.x - t0.pos.x;
      const dz = t1.pos.z - t0.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const x = t0.pos.x + (-dz / len) * off * side;
      const z = t0.pos.z + (dx / len) * off * side;
      if (terrain.trailWeightAt(x, z) > 0.35) continue;
      if (minDist(x, z, avoid) < 20) continue;
      if (tents.length && minDist(x, z, tents) < 80) continue;
      const yaw = Math.atan2(t0.pos.x - x, t0.pos.z - z);
      const site = campsite(terrain, x, z, yaw);
      group.add(site);
      tents.push({ x, z });
      const fireOff = localToWorld(x, z, yaw, 0, 1.4);
      const fire = campfire(terrain, fireOff.x, fireOff.z);
      group.add(fire);
      fires.push({ x: fireOff.x, z: fireOff.z, y: terrain.heightAt(fireOff.x, fireOff.z), fire });
      counts.campsites += 1;
      break;
    }
  }

  const fireLight = new THREE.PointLight(0xff9a4a, 0, 16, 1.5);
  if (fires.length) fireLight.position.set(fires[0].x, fires[0].y + 0.8, fires[0].z);
  group.add(fireLight);

  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: PALETTE.rock });
  const placements = [];
  const clusters = 14;
  for (let c = 0; c < clusters; c++) {
    const cx = (rng() - 0.5) * 540;
    const cz = (rng() - 0.5) * 540;
    const n = 3 + Math.floor(rng() * 6);
    for (let k = 0; k < n; k++) {
      const x = cx + (rng() - 0.5) * 12;
      const z = cz + (rng() - 0.5) * 12;
      if (Math.abs(x) > 285 || Math.abs(z) > 285) continue;
      if (terrain.trailWeightAt(x, z) > 0.3) continue;
      placements.push({ x, z, y: terrain.heightAt(x, z) });
    }
  }
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, placements.length);
  rocks.castShadow = true;
  placements.forEach((p, i) => {
    const s = 0.5 + rng() * 1.7;
    dummy.position.set(p.x, p.y + s * 0.15, p.z);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    dummy.scale.set(s * (0.8 + rng() * 0.6), s * (0.55 + rng() * 0.5), s * (0.8 + rng() * 0.6));
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);

  const frng = mulberry32(31337);
  const flowerPos = [];
  for (let i = 0; i < 6000 && flowerPos.length < 300; i++) {
    const x = (frng() - 0.5) * 540;
    const z = (frng() - 0.5) * 540;
    if (Math.abs(x) > 285 || Math.abs(z) > 285) continue;
    const tw = terrain.trailWeightAt(x, z);
    if (tw < 0.04 || tw > 0.3) continue;
    flowerPos.push({ x, z });
  }
  if (flowerPos.length) {
    const fGeo = new THREE.BoxGeometry(0.09, 0.26, 0.09);
    fGeo.translate(0, 0.13, 0);
    const flowers = new THREE.InstancedMesh(
      fGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      flowerPos.length,
    );
    flowers.name = 'flowers';
    flowerPos.forEach((p, i) => {
      dummy.position.set(p.x, terrain.heightAt(p.x, p.z), p.z);
      dummy.rotation.set(0, frng() * Math.PI, 0);
      const s = 0.7 + frng() * 0.8;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
      flowers.setColorAt(
        i,
        new THREE.Color(FLOWER_COLORS[Math.floor(frng() * FLOWER_COLORS.length)]),
      );
    });
    flowers.instanceMatrix.needsUpdate = true;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    group.add(flowers);
  }

  const srng = mulberry32(9021);

  const logMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  for (let i = 0; i < 10; i++) {
    const p = scatterSpot(srng, terrain, 0.15, 0.55);
    if (!p) continue;
    const log = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 2.6), logMat);
    log.position.set(p.x, terrain.heightAt(p.x, p.z) + 0.18, p.z);
    log.rotation.y = srng() * Math.PI;
    log.rotation.z = (srng() - 0.5) * 0.12;
    log.castShadow = true;
    group.add(log);
    counts.logs += 1;
  }

  const stumpMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  for (let i = 0; i < 12; i++) {
    const p = scatterSpot(srng, terrain, 0.15, 0.55);
    if (!p) continue;
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.6, 6), stumpMat);
    stump.position.set(p.x, terrain.heightAt(p.x, p.z) + 0.28, p.z);
    stump.castShadow = true;
    group.add(stump);
    counts.stumps += 1;
  }

  const signGroup = new THREE.Group();
  signGroup.name = 'signs';
  group.add(signGroup);
  const signUs = [0.05, 0.3, 0.6, 0.85];
  signUs.forEach((u, i) => {
    const t0 = terrain.trailPoint(u);
    const t1 = terrain.trailPoint(u + 0.004);
    const dx = t1.pos.x - t0.pos.x;
    const dz = t1.pos.z - t0.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = i % 2 === 0 ? 1 : -1;
    const x = t0.pos.x + (-dz / len) * 4.4 * side;
    const z = t0.pos.z + (dx / len) * 4.4 * side;
    const yaw = Math.atan2(dx, dz);
    const y = terrain.heightAt(x, z);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 2.3, 0.14),
      new THREE.MeshLambertMaterial({ color: WOOD }),
    );
    post.position.set(x, y + 1.15, z);
    post.castShadow = true;
    signGroup.add(post);
    const boardMat = new THREE.MeshLambertMaterial({ color: WOOD_LIGHT, emissive: 0x1c1208 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.08), boardMat);
    b1.position.set(x, y + 2.0, z);
    b1.rotation.y = yaw + 0.35;
    signGroup.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.08), boardMat);
    b2.position.set(x, y + 1.6, z);
    b2.rotation.y = yaw - 0.5;
    signGroup.add(b2);
    signs.push({ x, z });
    counts.signs += 1;
  });

  const lanUs = [0.1, 0.2, 0.45, 0.58, 0.7, 0.8, 0.9, 0.97];
  lanUs.forEach((u, i) => {
    const s = trailSpot(terrain, u, i % 2 === 0 ? 1 : -1, 4.6);
    const y = terrain.heightAt(s.x, s.z);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 2.5, 0.13),
      new THREE.MeshLambertMaterial({ color: WOOD }),
    );
    post.position.set(s.x, y + 1.25, s.z);
    post.castShadow = true;
    group.add(post);
    const lampBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.3, 0.26),
      new THREE.MeshBasicMaterial({ color: 0xffe0a8 }),
    );
    lampBox.position.set(s.x, y + 2.62, s.z);
    group.add(lampBox);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.08, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x2a2118 }),
    );
    cap.position.set(s.x, y + 2.81, s.z);
    group.add(cap);
    counts.lanterns += 1;
  });

  const mushStemMat = new THREE.MeshLambertMaterial({ color: 0xe8dfc9, emissive: 0x24201a });
  const mushCapMat = new THREE.MeshLambertMaterial({ color: PALETTE.cabinRoof, emissive: 0x2a1008 });
  for (let c = 0; c < 10; c++) {
    const p = scatterSpot(srng, terrain, 0.2, 0.6);
    if (!p) continue;
    for (let k = 0; k < 3; k++) {
      const mx = p.x + (srng() - 0.5) * 0.7;
      const mz = p.z + (srng() - 0.5) * 0.7;
      const my = terrain.heightAt(mx, mz);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.09), mushStemMat);
      stem.position.set(mx, my + 0.09, mz);
      group.add(stem);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), mushCapMat);
      cap.position.set(mx, my + 0.23, mz);
      group.add(cap);
    }
    counts.mushrooms += 1;
  }

  {
    let best = null;
    for (let i = 0; i < 300; i++) {
      const p = scatterSpot(srng, terrain, 0.05, 0.3);
      if (!p) continue;
      if (minDist(p.x, p.z, [...avoid, ...tents]) < 20) continue;
      if (!best) { best = p; continue; }
    }
    if (best) {
      let placed = 0;
      for (let i = 0; i < 40 && placed < 12; i++) {
        const r = i < 12 ? 7 : 2.5;
        const px = best.x + (srng() - 0.5) * r * 2;
        const pz = best.z + (srng() - 0.5) * r * 2;
        if (terrain.trailWeightAt(px, pz) > 0.5) continue;
        if (terrain.isWater(px, pz) || terrain.slopeAt(px, pz) > 0.75) continue;
        const pumpkin = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.36, 0.42),
          new THREE.MeshLambertMaterial({ color: 0xe07a3a, emissive: 0x331708 }),
        );
        pumpkin.position.set(px, terrain.heightAt(px, pz) + 0.18, pz);
        pumpkin.rotation.y = srng() * Math.PI;
        pumpkin.castShadow = true;
        group.add(pumpkin);
        counts.pumpkins += 1;
        placed += 1;
      }
      let bales = 0;
      for (let i = 0; i < 10 && bales < 4; i++) {
        const px = best.x + (srng() - 0.5) * 16;
        const pz = best.z + (srng() - 0.5) * 16;
        if (terrain.trailWeightAt(px, pz) > 0.5) continue;
        if (terrain.isWater(px, pz) || terrain.slopeAt(px, pz) > 0.75) continue;
        const bale = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.9, 1.1),
          new THREE.MeshLambertMaterial({ color: 0xd9b24a }),
        );
        bale.position.set(px, terrain.heightAt(px, pz) + 0.45, pz);
        bale.rotation.y = srng() * Math.PI;
        bale.castShadow = true;
        group.add(bale);
        counts.hay += 1;
        bales += 1;
      }
    }
  }

  {
    const candidates = [];
    for (let i = 0; i < 300; i++) {
      const p = scatterSpot(srng, terrain, 0.12, 0.8);
      if (!p) continue;
      if (minDist(p.x, p.z, [...avoid, ...tents]) < 12) continue;
      candidates.push({ ...p, h: terrain.heightAt(p.x, p.z) });
    }
    candidates.sort((a, b) => b.h - a.h);
    const taken = [];
    for (const c of candidates) {
      if (taken.length >= 5) break;
      if (minDist(c.x, c.z, taken) < 15) continue;
      taken.push(c);
      const y = terrain.heightAt(c.x, c.z);
      const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 3.4, 0.35),
        new THREE.MeshLambertMaterial({ color: 0x6b5a4a }),
      );
      trunk.position.set(c.x, y + 1.7, c.z);
      trunk.rotation.z = (srng() - 0.5) * 0.3;
      trunk.castShadow = true;
      group.add(trunk);
      for (let b = 0; b < 2; b++) {
        const branch = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.16, 0.16),
          new THREE.MeshLambertMaterial({ color: 0x6b5a4a }),
        );
        branch.position.set(c.x, y + 2.3 + b * 0.7, c.z);
        branch.rotation.y = srng() * Math.PI;
        branch.rotation.z = 0.3 + srng() * 0.5;
        group.add(branch);
      }
      counts.deadTrees += 1;
    }
  }

  const mailUs = [0.15, 0.5, 0.72];
  for (const u of mailUs) {
    const s = trailSpot(terrain, u, 1, 4.2);
    const y = terrain.heightAt(s.x, s.z);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.15, 0.1),
      new THREE.MeshLambertMaterial({ color: WOOD }),
    );
    post.position.set(s.x, y + 0.57, s.z);
    group.add(post);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.3, 0.55),
      new THREE.MeshLambertMaterial({ color: 0xc2552f, emissive: 0x2a1008 }),
    );
    box.position.set(s.x, y + 1.3, s.z);
    box.rotation.y = s.yaw;
    group.add(box);
    counts.mailboxes += 1;
  }

  const markerUs = [0.08, 0.25, 0.42, 0.63, 0.88];
  for (const u of markerUs) {
    const s = trailSpot(terrain, u, -1, 3.8);
    const y = terrain.heightAt(s.x, s.z);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.75, 0.12),
      new THREE.MeshLambertMaterial({ color: WOOD }),
    );
    post.position.set(s.x, y + 0.37, s.z);
    group.add(post);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.16, 0.08),
      new THREE.MeshLambertMaterial({ color: PALETTE.rock }),
    );
    cap.position.set(s.x, y + 0.82, s.z);
    cap.rotation.y = s.yaw;
    group.add(cap);
    counts.markers += 1;
  }

  const benchUs = [0.4, 0.8];
  for (const u of benchUs) {
    const s = trailSpot(terrain, u, 1, 5.2);
    const y = terrain.heightAt(s.x, s.z);
    const benchMat = new THREE.MeshLambertMaterial({ color: WOOD, emissive: 0x1c1208 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.45), benchMat);
    seat.position.set(s.x, y + 0.45, s.z);
    seat.rotation.y = s.yaw;
    seat.castShadow = true;
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.08), benchMat);
    const bx = Math.sin(s.yaw) * -0.2;
    const bz = Math.cos(s.yaw) * -0.2;
    back.position.set(s.x + bx, y + 0.78, s.z + bz);
    back.rotation.y = s.yaw;
    group.add(back);
    for (const lx of [-0.65, 0.65]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.4), benchMat);
      const ox = Math.cos(s.yaw) * lx;
      const oz = -Math.sin(s.yaw) * lx;
      leg.position.set(s.x + ox, y + 0.22, s.z + oz);
      leg.rotation.y = s.yaw;
      group.add(leg);
    }
    counts.benches += 1;
  }

  const bushPos = [];
  for (let i = 0; i < 14000 && bushPos.length < 300; i++) {
    const x = (srng() - 0.5) * 540;
    const z = (srng() - 0.5) * 540;
    if (Math.abs(x) > 280 || Math.abs(z) > 280) continue;
    const tw = terrain.trailWeightAt(x, z);
    if (tw < 0.06 || tw > 0.5) continue;
    if (terrain.isWater(x, z) || terrain.slopeAt(x, z) > 0.75) continue;
    if (minDist(x, z, [...avoid, ...tents]) < 5) continue;
    bushPos.push({ x, z, fern: srng() < 0.4 });
  }
  if (bushPos.length) {
    const bGeo = new THREE.BoxGeometry(0.8, 0.5, 0.8);
    bGeo.translate(0, 0.25, 0);
    const bushes = new THREE.InstancedMesh(
      bGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      bushPos.length,
    );
    bushes.name = 'bushes';
    const bushColors = [0x3f6b34, 0x5d7a3f, 0x6b8f3a, 0x8a9a45, 0x4a7a3d];
    bushPos.forEach((p, i) => {
      dummy.position.set(p.x, terrain.heightAt(p.x, p.z), p.z);
      dummy.rotation.set(0, srng() * Math.PI, 0);
      if (p.fern) dummy.scale.set(1.1 + srng() * 0.5, 0.5, 1.1 + srng() * 0.5);
      else {
        const s = 0.7 + srng() * 0.9;
        dummy.scale.set(s, s * (0.7 + srng() * 0.7), s);
      }
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
      const ci = p.fern ? 1 : Math.floor(srng() * bushColors.length);
      bushes.setColorAt(i, new THREE.Color(bushColors[ci]));
    });
    bushes.instanceMatrix.needsUpdate = true;
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    group.add(bushes);
    counts.bushes = bushPos.length;
  }

  group.userData.cabins = cabins;
  group.userData.tents = tents;
  group.userData.signs = signs;
  group.userData.counts = counts;
  group.userData.fires = fires;
  group.userData.fireLight = fireLight;
  group.userData.time = 0;
  return group;
}

export function updateProps(props, nightFactor, playerPos, dt) {
  const lit = Math.min(1, nightFactor * 1.4);
  for (const c of props.userData.cabins) {
    for (const mat of c.cabin.userData.windows) {
      mat.color.copy(WINDOW_DIM).lerp(WINDOW_LIT, lit);
    }
  }

  const t = (props.userData.time += dt);
  const fires = props.userData.fires;
  fires.forEach((f, i) => {
    const [outer, inner] = f.fire.userData.flames;
    outer.scale.set(
      1 + 0.1 * Math.sin(t * 11 + i),
      1 + 0.16 * Math.sin(t * 13 + i * 2),
      1 + 0.1 * Math.sin(t * 9 + i),
    );
    inner.scale.set(1 + 0.08 * Math.sin(t * 10 + i), 1 + 0.12 * Math.sin(t * 12 + i * 2), 1 + 0.08 * Math.sin(t * 8 + i));
  });

  const light = props.userData.fireLight;
  if (fires.length && playerPos) {
    let best = fires[0];
    let bd = Infinity;
    for (const f of fires) {
      const d = (f.x - playerPos.x) ** 2 + (f.z - playerPos.z) ** 2;
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    light.position.set(best.x, best.y + 0.8, best.z);
  }
  light.intensity = lit * 42 * (0.9 + 0.1 * Math.sin(t * 9));
  light.visible = lit > 0.02;
}
