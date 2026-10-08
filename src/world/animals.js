import * as THREE from 'three';
import { PALETTE, ANIMALS } from '../config.js';
import { mulberry32 } from './terrain.js';
import { mergeGeometries } from '../../vendor/utils/BufferGeometryUtils.js';

function box(w, h, d, x, y, z, hex, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function deerGeometry() {
  const body = 0x8a6238;
  const dark = 0x5a4026;
  const light = 0xb99566;
  return mergeGeometries([
    box(0.52, 0.56, 1.15, 0, 0.74, 0, body),
    box(0.18, 0.5, 0.2, 0, 1.06, 0.52, body, -0.55),
    box(0.2, 0.22, 0.44, 0, 1.24, 0.7, light, -0.1),
    box(0.05, 0.26, 0.05, -0.09, 1.44, 0.62, dark, -0.3),
    box(0.05, 0.26, 0.05, 0.09, 1.44, 0.62, dark, -0.3),
    box(0.1, 0.58, 0.13, -0.17, 0.29, 0.4, dark),
    box(0.1, 0.58, 0.13, 0.17, 0.29, 0.4, dark),
    box(0.1, 0.58, 0.13, -0.17, 0.29, -0.4, dark),
    box(0.1, 0.58, 0.13, 0.17, 0.29, -0.4, dark),
    box(0.1, 0.14, 0.08, 0, 0.78, -0.6, light),
  ]);
}

function rabbitGeometry() {
  const fur = 0x9a9186;
  const pale = 0xd8d2c4;
  return mergeGeometries([
    box(0.26, 0.24, 0.4, 0, 0.2, 0, fur),
    box(0.18, 0.16, 0.16, 0, 0.36, 0.22, fur),
    box(0.05, 0.2, 0.05, -0.06, 0.5, 0.2, pale, -0.15),
    box(0.05, 0.2, 0.05, 0.06, 0.5, 0.2, pale, -0.15),
    box(0.09, 0.1, 0.14, 0, 0.14, -0.24, pale),
  ]);
}

function freeSpot(terrain, rng, cabins, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const x = (rng() - 0.5) * 520;
    const z = (rng() - 0.5) * 520;
    if (Math.abs(x) > 270 || Math.abs(z) > 270) continue;
    if (terrain.trailWeightAt(x, z) > 0.18) continue;
    if (terrain.isWater(x, z) || terrain.slopeAt(x, z) > 0.75) continue;
    let nearCabin = false;
    for (const c of cabins) {
      if (Math.hypot(c.x - x, c.z - z) < 14) { nearCabin = true; break; }
    }
    if (nearCabin) continue;
    return { x, z };
  }
  return null;
}

export function buildAnimals(terrain, cabins) {
  const rng = mulberry32(777);
  const group = new THREE.Group();
  const list = [];
  const geos = { deer: deerGeometry(), rabbit: rabbitGeometry() };
  const mats = {
    deer: new THREE.MeshLambertMaterial({ vertexColors: true }),
    rabbit: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };

  const patches = [
    { species: 'deer', n: 4, spread: 5 },
    { species: 'deer', n: 3, spread: 5 },
    { species: 'rabbit', n: 3, spread: 3 },
    { species: 'rabbit', n: 2, spread: 3 },
    { species: 'rabbit', n: 3, spread: 3 },
    { species: 'rabbit', n: 2, spread: 3 },
  ];

  for (const p of patches) {
    const spot = freeSpot(terrain, rng, cabins);
    if (!spot) continue;
    for (let i = 0; i < p.n; i++) {
      const x = spot.x + (rng() - 0.5) * p.spread * 2;
      const z = spot.z + (rng() - 0.5) * p.spread * 2;
      const mesh = new THREE.Mesh(geos[p.species], mats[p.species]);
      mesh.castShadow = true;
      const y = terrain.heightAt(x, z);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rng() * Math.PI * 2;
      group.add(mesh);
      list.push({
        mesh,
        species: p.species,
        x, z,
        yaw: mesh.rotation.y,
        home: { x: spot.x, z: spot.z },
        target: { x, z },
        state: 'wander',
        pause: 0.5 + rng() * 2.5,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  const despawn = ANIMALS;

  function pickTarget(a) {
    for (let i = 0; i < 8; i++) {
      const ang = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 8;
      const x = a.home.x + Math.cos(ang) * r;
      const z = a.home.z + Math.sin(ang) * r;
      if (Math.abs(x) > 275 || Math.abs(z) > 275) continue;
      if (terrain.trailWeightAt(x, z) > 0.25) continue;
      if (terrain.isWater(x, z)) continue;
      return { x, z };
    }
    return { x: a.home.x, z: a.home.z };
  }

  function update(dt, player, nightFactor) {
    for (const a of list) {
      const dx = a.x - player.x;
      const dz = a.z - player.z;
      const d = Math.hypot(dx, dz) || 1e-6;

      if (a.state === 'flee') {
        if (d > despawn.fleeFar) {
          a.state = 'wander';
          a.target = pickTarget(a);
          a.pause = 0.4 + rng() * 1.5;
        }
      } else if (d < despawn.fleeDist) {
        a.state = 'flee';
      } else if (nightFactor > despawn.nightOn && d >= despawn.nightDist) {
        if (a.state !== 'lie') a.state = 'lie';
      } else if (a.state === 'lie') {
        a.state = 'wander';
        a.target = pickTarget(a);
      }

      let vx = 0;
      let vz = 0;
      if (a.state === 'flee') {
        const sp = a.species === 'deer' ? despawn.deerSpeed : despawn.rabbitSpeed;
        vx = (dx / d) * sp;
        vz = (dz / d) * sp;
      } else if (a.state === 'wander') {
        if (a.pause > 0) {
          a.pause -= dt;
        } else {
          const tx = a.target.x - a.x;
          const tz = a.target.z - a.z;
          const td = Math.hypot(tx, tz);
          if (td < 0.4) {
            a.target = pickTarget(a);
            a.pause = 0.6 + rng() * 2.5;
          } else {
            const sp = a.species === 'deer' ? despawn.deerWander : despawn.rabbitWander;
            vx = (tx / td) * sp;
            vz = (tz / td) * sp;
          }
        }
      }

      const moving = vx !== 0 || vz !== 0;
      if (moving) {
        a.x = Math.max(-275, Math.min(275, a.x + vx * dt));
        a.z = Math.max(-275, Math.min(275, a.z + vz * dt));
        const wantYaw = Math.atan2(vx, vz);
        let dYaw = (wantYaw - a.yaw) % (Math.PI * 2);
        if (dYaw > Math.PI) dYaw -= Math.PI * 2;
        if (dYaw < -Math.PI) dYaw += Math.PI * 2;
        a.yaw += dYaw * (1 - Math.exp(-6 * dt));
        a.phase += dt * (a.species === 'deer' ? 7 : 14);
      }

      const wantScale = a.state === 'lie' ? 0.5 : 1;
      const m = a.mesh;
      m.scale.y += (wantScale - m.scale.y) * (1 - Math.exp(-8 * dt));
      const bob = moving ? Math.abs(Math.sin(a.phase)) * (a.species === 'deer' ? 0.05 : 0.03) : 0;
      m.position.set(a.x, terrain.heightAt(a.x, a.z) + bob, a.z);
      m.rotation.y = a.yaw;
    }
  }

  return { group, list, update };
}
