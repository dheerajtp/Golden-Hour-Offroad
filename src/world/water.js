import * as THREE from 'three';
import { mulberry32 } from './terrain.js';

const WATER_COL = 0x3f7fae;
const FOAM_COL = 0xf4f8fa;
const ROCK_COLS = [0x8a7f73, 0x7d7266, 0x95897c];
const REED_COL = 0x55703a;
const WOOD_COL = 0x8a7050;
const SHELL_COL = 0xf2ead8;

function posAt(st, s) {
  const { pts, arc } = st;
  if (s <= 0) {
    return {
      x: pts[0].x, z: pts[0].z,
      yaw: Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z),
    };
  }
  for (let i = 1; i < arc.length; i++) {
    if (s <= arc[i]) {
      const t = (s - arc[i - 1]) / (arc[i] - arc[i - 1] || 1);
      const dx = pts[i].x - pts[i - 1].x;
      const dz = pts[i].z - pts[i - 1].z;
      return {
        x: pts[i - 1].x + dx * t, z: pts[i - 1].z + dz * t,
        yaw: Math.atan2(dx, dz),
      };
    }
  }
  const n = pts.length;
  return {
    x: pts[n - 1].x, z: pts[n - 1].z,
    yaw: Math.atan2(pts[n - 1].x - pts[n - 2].x, pts[n - 1].z - pts[n - 2].z),
  };
}

function waterlineAt(terrain, w, a) {
  for (let r = w.r * 1.2; r >= w.r * 0.4; r -= 1.5) {
    const x = w.x + Math.cos(a) * r;
    const z = w.z + Math.sin(a) * r;
    if (Math.abs(x) > 290 || Math.abs(z) > 290) continue;
    if (terrain.heightAt(x, z) < w.level) return { x, z };
  }
  return null;
}

export function buildWater(terrain) {
  const group = new THREE.Group();
  group.name = 'water';
  const w = terrain.water;
  const rng = mulberry32(555);
  const foams = [];
  const reeds = [];
  const falls = [];

  const waterMat = new THREE.MeshPhongMaterial({
    color: WATER_COL,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    shininess: 70,
    specular: 0x9fc4d8,
    flatShading: true,
  });

  const addDisc = (x, y, z, r, sx = 1) => {
    const g = new THREE.CircleGeometry(r, 20);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({
      color: WATER_COL, transparent: true, opacity: 0.8,
      depthWrite: false, shininess: 80, specular: 0xaad4e8,
    }));
    m.position.set(x, y, z);
    m.scale.x = sx;
    m.renderOrder = 1;
    group.add(m);
    return m;
  };

  const addFoam = (x, y, z, r, sx = 1.6) => {
    const g = new THREE.CircleGeometry(r, 12);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: FOAM_COL, transparent: true, opacity: 0.4,
      depthWrite: false,
    }));
    m.position.set(x, y, z);
    m.scale.x = sx;
    m.renderOrder = 2;
    m.userData.phase = rng() * Math.PI * 2;
    m.userData.baseOp = 0.32 + rng() * 0.16;
    foams.push(m);
    group.add(m);
  };

  addDisc(w.lake.x, w.lake.level, w.lake.z, w.lake.r, 1);
  addDisc(w.pond.x, w.pond.level, w.pond.z, w.pond.r, 1);
  for (const tp of w.tidepools) {
    addDisc(tp.x, tp.level, tp.z, tp.r, 1);
    addFoam(tp.x, tp.level + 0.03, tp.z, tp.r * 0.7, 1.1);
  }

  const st = w.stream;
  const keys = st.bedKeys;
  const chute = st.chute;
  const streamFoamY = [];
  for (let k = 1; k < keys.length; k++) {
    const s0 = keys[k - 1].s, s1 = keys[k].s;
    const b0 = keys[k - 1].bed, b1 = keys[k].bed;
    const mid = posAt(st, (s0 + s1) / 2);
    const len = s1 - s0;
    if (Math.abs(s0 - chute[0]) < 1e-6 && Math.abs(s1 - chute[1]) < 1e-6) {
      const box = new THREE.BoxGeometry(st.width - 2.4, 0.3, len + 0.5);
      const mesh = new THREE.Mesh(box, waterMat);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = mid.yaw;
      mesh.rotation.x = Math.atan2(b0 - b1, len);
      mesh.position.set(mid.x, (b0 + b1) / 2 + 0.35, mid.z);
      mesh.renderOrder = 1;
      group.add(mesh);
      falls.push(mesh);

      const dirx = Math.sin(mid.yaw), dirz = Math.cos(mid.yaw);
      const perpx = dirz, perpz = -dirx;
      const rockSpecs = [
        { ox: perpx * 3.8, oz: perpz * 3.8, sx: 4.6, sy: 4.4, sz: 5.2, r: 0.5 },
        { ox: -perpx * 3.6, oz: -perpz * 3.6, sx: 4.0, sy: 3.6, sz: 4.6, r: -0.4 },
        { ox: -dirx * 2.6, oz: -dirz * 2.6, sx: 7.2, sy: 3.6, sz: 4.0, r: 0.2 },
      ];
      for (const rs of rockSpecs) {
        const rx = mid.x + rs.ox;
        const rz = mid.z + rs.oz;
        const rock = new THREE.Mesh(
          new THREE.BoxGeometry(rs.sx, rs.sy, rs.sz),
          new THREE.MeshLambertMaterial({
            color: ROCK_COLS[Math.floor(rng() * ROCK_COLS.length)],
          }),
        );
        const rh = terrain.heightAt(rx, rz);
        rock.position.set(rx, rh + rs.sy * 0.35, rz);
        rock.rotation.y = rs.r;
        rock.castShadow = true;
        group.add(rock);
      }
      streamFoamY.push({ x: mid.x, y: b1 + 0.4, z: mid.z, r: 1.5, sx: 1.4 });
      continue;
    }
    const g = new THREE.PlaneGeometry(st.width, len + 0.4);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, waterMat);
    mesh.rotation.y = mid.yaw;
    mesh.position.set(mid.x, (b0 + b1) / 2 + 0.35, mid.z);
    mesh.renderOrder = 1;
    group.add(mesh);
    if (k % 2 === 0) {
      streamFoamY.push({ x: mid.x, y: (b0 + b1) / 2 + 0.38, z: mid.z, r: 0.9, sx: 1.5 });
    }
  }
  for (const f of streamFoamY) addFoam(f.x, f.y, f.z, f.r, f.sx);

  const waterlinePts = [];
  for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / 36) {
    const pt = waterlineAt(terrain, w.lake, a);
    if (pt) waterlinePts.push({ ...pt, a });
  }
  for (const pt of waterlinePts) {
    addFoam(pt.x, w.lake.level + 0.04, pt.z, 1.5, 1.5);
  }

  const reedSpots = waterlinePts.filter((_, i) => i % 3 === 0);
  for (const pt of reedSpots) {
    for (let i = 0; i < 3; i++) {
      const h = 1.0 + rng() * 0.7;
      const reed = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, h, 0.06),
        new THREE.MeshLambertMaterial({ color: REED_COL }),
      );
      reed.geometry.translate(0, h / 2, 0);
      reed.position.set(
        pt.x + (rng() - 0.5) * 1.6,
        w.lake.level - 0.3,
        pt.z + (rng() - 0.5) * 1.6,
      );
      reed.rotation.y = rng() * Math.PI;
      reed.userData.baseZ = (rng() - 0.5) * 0.24;
      reed.rotation.z = reed.userData.baseZ;
      reed.userData.phase = rng() * Math.PI * 2;
      reeds.push(reed);
      group.add(reed);
    }
  }

  const beachAngles = [-45, -25, 5, 30, 50].map((d) => (d * Math.PI) / 180);
  for (const a of beachAngles) {
    const pt = waterlineAt(terrain, w.lake, a);
    if (!pt) continue;
    const dx = Math.cos(a + 1.57), dz = Math.sin(a + 1.57);
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: WOOD_COL }),
    );
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rng() * Math.PI;
    log.position.set(
      pt.x + dx * 1.6, terrain.heightAt(pt.x + dx * 1.6, pt.z + dz * 1.6) + 0.18,
      pt.z + dz * 1.6,
    );
    log.castShadow = true;
    group.add(log);
  }
  for (let i = 0; i < 8; i++) {
    const a = beachAngles[i % beachAngles.length] + (rng() - 0.5) * 0.14;
    const x = w.lake.x + Math.cos(a) * w.lake.r * (1.0 + rng() * 0.12);
    const z = w.lake.z + Math.sin(a) * w.lake.r * (1.0 + rng() * 0.12);
    const y = terrain.heightAt(x, z);
    if (y < w.lake.level) continue;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 4),
      new THREE.MeshLambertMaterial({ color: SHELL_COL }),
    );
    shell.position.set(x, y + 0.05, z);
    group.add(shell);
  }

  const addRockRow = (u0, u1, step, sides) => {
    for (let u = u0; u <= u1; u += step) {
      const p = terrain.trailPoint(u);
      const out = Math.atan2(p.pos.z, p.pos.x);
      for (const side of sides) {
        const a = out + (side < 0 ? Math.PI : 0) + (rng() - 0.5) * 0.3;
        const d = 11 + rng() * 4;
        const x = p.pos.x + Math.cos(a) * d;
        const z = p.pos.z + Math.sin(a) * d;
        if (Math.abs(x) > 288 || Math.abs(z) > 288) continue;
        if (terrain.isWater(x, z)) continue;
        const s = 1.2 + rng() * 1.8;
        const rock = new THREE.Mesh(
          new THREE.BoxGeometry(s, s * 0.8, s * 1.2),
          new THREE.MeshLambertMaterial({
            color: ROCK_COLS[Math.floor(rng() * ROCK_COLS.length)],
          }),
        );
        const y = terrain.heightAt(x, z);
        rock.position.set(x, y + s * 0.3, z);
        rock.rotation.y = rng() * Math.PI;
        rock.castShadow = true;
        group.add(rock);
      }
    }
  };
  addRockRow(0.72, 0.76, 0.004, [1]);
  addRockRow(0.85, 0.95, 0.005, [1, -1]);

  group.userData.foams = foams;
  group.userData.reeds = reeds;
  group.userData.falls = falls;
  return group;
}

export function updateWater(group, t) {
  for (const f of group.userData.foams) {
    f.material.opacity = f.userData.baseOp + 0.18 * Math.sin(t * 2.6 + f.userData.phase);
  }
  for (const r of group.userData.reeds) {
    r.rotation.z = r.userData.baseZ + 0.07 * Math.sin(t * 1.4 + r.userData.phase);
  }
  for (const m of group.userData.falls) {
    m.material.opacity = 0.72 + 0.14 * Math.sin(t * 7);
  }
}
