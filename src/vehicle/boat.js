import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { BOAT, WATER } from '../config.js';

const loader = new GLTFLoader();
let visualPromise = null;

function prepare(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.metalness !== undefined) m.metalness = 0;
      if (m.roughness !== undefined) m.roughness = 0.9;
    }
  });
  const dims = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  return {
    scene,
    scale: 3.8 / Math.max(0.01, Math.max(dims.x, dims.z)),
    alongX: dims.x >= dims.z,
  };
}

export function loadCanoeVisual() {
  if (!visualPromise) {
    visualPromise = new Promise((resolve) => {
      loader.load(
        'assets/kenney/nature-kit/canoe.glb',
        (g) => resolve(prepare(g.scene)),
        undefined,
        () => resolve(null),
      );
    });
  }
  return visualPromise;
}

function fallbackCanoe() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 2.6, 4, 10),
    new THREE.MeshLambertMaterial({ color: 0x9a6a3c }),
  );
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 1, 0.55);
  hull.castShadow = true;
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.08, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xb98a55 }),
  );
  seat.position.y = 0.18;
  g.add(hull, seat);
  return g;
}

function attachVisual(group) {
  loadCanoeVisual().then((v) => {
    if (group.userData.filled) return;
    group.userData.filled = true;
    if (!v) {
      group.add(fallbackCanoe());
      return;
    }
    const m = v.scene.clone(true);
    m.scale.setScalar(v.scale);
    if (v.alongX) m.rotation.y = -Math.PI / 2;
    group.add(m);
  });
}

export function createCanoeMesh() {
  const g = new THREE.Group();
  g.name = 'canoe';
  attachVisual(g);
  return g;
}

export class Boat {
  constructor(terrain, anchor) {
    this.terrain = terrain;
    this.pos = new THREE.Vector3(anchor.x, 0, anchor.z);
    this.yaw = anchor.yaw;
    this.speed = 0;
    this.phase = 0;
    this.lean = 0;
    const level = terrain.waterLevelAt(anchor.x, anchor.z) ?? WATER.lake.level;
    this.pos.y = level + BOAT.floatY;
    this.mesh = createCanoeMesh();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  canBoard(p) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) <= BOAT.boardRadius;
  }

  findLanding() {
    const level = WATER.lake.level;
    for (let r = 1.4; r <= BOAT.exitRadius; r += 0.5) {
      let best = null;
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        const x = this.pos.x + Math.cos(a) * r;
        const z = this.pos.z + Math.sin(a) * r;
        if (this.terrain.waterLevelAt(x, z) != null) continue;
        if (this.terrain.heightAt(x, z) < level + 0.12) continue;
        if (this.terrain.slopeAt(x, z) > BOAT.maxSlope) continue;
        if (Math.abs(x) > 280 || Math.abs(z) > 280) continue;
        if (!best || Math.hypot(x - this.pos.x, z - this.pos.z) < best.d) {
          best = { x, z, d: Math.hypot(x - this.pos.x, z - this.pos.z) };
        }
      }
      if (best) return best;
    }
    return null;
  }

  update(dt, keys) {
    const throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const turn = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const moving = Math.abs(this.speed) > 0.25;
    this.yaw -= turn * BOAT.turn * dt * (moving ? 1 : 0.55);

    if (throttle > 0) this.speed = Math.min(BOAT.maxSpeed, this.speed + BOAT.accel * dt);
    else if (throttle < 0) this.speed = Math.max(-BOAT.reverse, this.speed - BOAT.reverseAccel * dt);
    else this.speed *= Math.exp(-BOAT.drag * dt);
    if (Math.abs(this.speed) < 0.02) this.speed = 0;

    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    const surf = this.terrain.waterLevelAt(nx, nz);
    if (surf != null && surf - this.terrain.heightAt(nx, nz) >= BOAT.minDepth) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else {
      this.speed = 0;
    }

    const level = this.terrain.waterLevelAt(this.pos.x, this.pos.z) ?? surf ?? WATER.lake.level;
    this.pos.y = level + BOAT.floatY;
    this.phase += dt * (1.5 + Math.abs(this.speed) * 0.45);
    this.lean += (turn * Math.min(1, Math.abs(this.speed) / BOAT.maxSpeed) * 0.1 - this.lean) * (1 - Math.exp(-4 * dt));
    this.mesh.position.set(this.pos.x, this.pos.y + Math.sin(this.phase) * 0.025, this.pos.z);
    this.mesh.rotation.set(0, this.yaw, this.lean);
  }
}
