import * as THREE from 'three';
import { PALETTE, WORLD } from '../config.js';

function localToWorld(cx, cz, yaw, lx, lz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
}

export function buildGarage(terrain, garageList) {
  const t0 = terrain.trailPoint(WORLD.spawnU);
  const t1 = terrain.trailPoint(WORLD.spawnU + 0.004);
  const dx = t1.pos.x - t0.pos.x;
  const dz = t1.pos.z - t0.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len;
  const pz = dx / len;

  const checks = [];
  for (const lx of [-9.6, 0, 9.6]) {
    for (const lz of [-4.7, 0, 4.7]) checks.push([lx, lz]);
  }
  for (const lx of [-5.6, 0, 5.6]) checks.push([lx, 1]);

  let cx = 0;
  let cz = 0;
  let yaw = 0;
  let found = false;
  for (const side of [1, -1]) {
    for (let off = 18; off <= 30 && !found; off += 2) {
      const tx = t0.pos.x + px * off * side;
      const tz = t0.pos.z + pz * off * side;
      const tyaw = Math.atan2(t0.pos.x - tx, t0.pos.z - tz);
      let ok = true;
      for (const [lx, lz] of checks) {
        const w = localToWorld(tx, tz, tyaw, lx, lz);
        if (Math.abs(w.x) > 283 || Math.abs(w.z) > 283) { ok = false; break; }
        if (terrain.trailWeightAt(w.x, w.z) > 0.25) { ok = false; break; }
      }
      if (ok) {
        cx = tx;
        cz = tz;
        yaw = tyaw;
        found = true;
      }
    }
  }
  if (!found) {
    cx = t0.pos.x + px * 22;
    cz = t0.pos.z + pz * 22;
    yaw = Math.atan2(t0.pos.x - cx, t0.pos.z - cz);
  }

  const group = new THREE.Group();
  const baseY = terrain.heightAt(cx, cz);
  group.position.set(cx, baseY, cz);
  group.rotation.y = yaw;

  const place = (mesh, lx, ly, lz) => {
    const w = localToWorld(cx, cz, yaw, lx, lz);
    mesh.position.set(lx, terrain.heightAt(w.x, w.z) - baseY + ly, lz);
    group.add(mesh);
  };

  const box = (w, h, d, hex, basic = false) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      basic
        ? new THREE.MeshBasicMaterial({ color: hex })
        : new THREE.MeshLambertMaterial({ color: hex }),
    );
    m.castShadow = !basic;
    m.receiveShadow = !basic;
    return m;
  };

  const wood = 0x6b4a2e;
  for (const [lx, lz, h] of [
    [-9.1, 4.1, 4.3], [9.1, 4.1, 4.3],
    [-9.1, -4.1, 3.4], [9.1, -4.1, 3.4], [0, -4.1, 3.4],
  ]) {
    place(box(0.35, h, 0.35, wood), lx, h / 2, lz);
  }

  const roof = box(19.4, 0.32, 9.6, PALETTE.cabinRoof);
  roof.rotation.x = -0.109;
  place(roof, 0, 3.85, 0);

  place(box(18.6, 3.3, 0.28, wood), 0, 1.65, -4.35);
  place(box(0.28, 2.6, 8.4, wood), -9.25, 1.3, -0.1);
  place(box(0.28, 2.6, 8.4, wood), 9.25, 1.3, -0.1);
  place(box(1.4, 0.16, 0.5, PALETTE.sun, true), 0, 4.1, 3.9);

  const slots = garageList.map((g, i) => {
    const lx = (i - 1) * 5.6;
    place(box(5.2, 0.14, 6.8, PALETTE.rock), lx, 0.07, 0.5);
    const w = localToWorld(cx, cz, yaw, lx, 0.5);
    return { id: g.id, index: i, x: w.x, y: terrain.heightAt(w.x, w.z), z: w.z, yaw };
  });

  return { group, slots, x: cx, z: cz };
}
