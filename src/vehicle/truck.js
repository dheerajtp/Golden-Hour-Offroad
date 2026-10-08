import * as THREE from 'three';
import { PALETTE, GARAGE, HEADLIGHT } from '../config.js';
import { loadCar } from './assets.js';

const TARGET_LENGTH = 4.3;

const LENS_DARK = [0.16, 0.15, 0.13];
const LENS_LIT = [1.0, 0.94, 0.78];

function addHeadlights(chassis, bb, local) {
  const width = bb.max.x - bb.min.x;
  const z = bb.max.z;
  const y = bb.min.y + (bb.max.y - bb.min.y) * 0.42;
  const lensGeo = new THREE.CircleGeometry(0.1, 12);
  const spots = [];
  const lenses = [];
  for (const sx of [-1, 1]) {
    const x = sx * width * 0.3;
    const lens = new THREE.Mesh(
      lensGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...LENS_DARK) }),
    );
    lens.position.set(x, y, z + 0.03);
    chassis.add(lens);
    lenses.push(lens.material);
    if (local) {
      const s = new THREE.SpotLight(
        0xffe6bc, 0, HEADLIGHT.distance, HEADLIGHT.angle, 0.55, HEADLIGHT.decay,
      );
      s.position.set(x, y, z + 0.06);
      const target = new THREE.Object3D();
      target.position.set(x * 2, y - 1.6, z + 16);
      chassis.add(s, target);
      s.target = target;
      s.visible = false;
      spots.push(s);
    }
  }
  return { spots, lenses };
}

function addAccessories(chassis, bb, entry) {
  const width = bb.max.x - bb.min.x;
  const length = bb.max.z - bb.min.z;
  const top = bb.max.y;
  const zc = (bb.max.z + bb.min.z) / 2;

  if (entry.rack) {
    const rackMat = new THREE.MeshLambertMaterial({ color: PALETTE.rock });
    const railLen = length * 0.72;
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, railLen), rackMat);
      rail.position.set(sx * width * 0.33, top + 0.09, zc + length * 0.02);
      rail.castShadow = true;
      chassis.add(rail);
    }
    const barCount = 3;
    for (let i = 0; i < barCount; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.05, 0.07), rackMat);
      bar.position.set(0, top + 0.13, zc + length * 0.02 + (i / (barCount - 1) - 0.5) * railLen * 0.86);
      bar.castShadow = true;
      chassis.add(bar);
    }
  }

  if (entry.cargo) {
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.56, 0.26, length * 0.34),
      new THREE.MeshLambertMaterial({ color: PALETTE.cabinRoof }),
    );
    cargo.position.set(0, top + 0.27, zc + length * 0.05);
    cargo.castShadow = true;
    chassis.add(cargo);
  }
}

export async function createTruck(entry, local = false) {
  const model = await loadCar(entry.model);
  const scene = model.clone(true);

  scene.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(scene);
  const len = bb.max.z - bb.min.z || 1;
  const scale = TARGET_LENGTH / len;
  scene.scale.setScalar(scale);
  scene.updateMatrixWorld(true);

  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  chassis.add(scene);

  const scaled = new THREE.Box3().setFromObject(scene);
  addAccessories(chassis, scaled, entry);
  const headlight = addHeadlights(chassis, scaled, local);
  let hlLevel = 0;

  const wheels = [];
  const frontWheels = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name.toLowerCase();
    if (n.includes('wheel')) {
      if (n.includes('back') && !n.includes('left') && !n.includes('right')) return;
      o.rotation.order = 'YXZ';
      wheels.push(o);
      if (n.includes('front')) frontWheels.push(o);
    }
  });

  const wheelRadius = 0.3 * scale;
  const wheelBase = 1.35 * scale;
  const track = 0.62 * scale;

  return {
    root,
    chassis,
    scene,
    wheels,
    frontWheels,
    wheelRadius,
    wheelBase,
    track,
    handling: entry.handling,
    entry,
    setHeadlights(nightFactor, manual, dt = 0.016) {
      const want = manual === true ? 1
        : manual === false ? 0
          : (nightFactor > HEADLIGHT.autoOn ? 1 : 0);
      hlLevel += (want - hlLevel) * (1 - Math.exp(-HEADLIGHT.ramp * dt));
      if (Math.abs(want - hlLevel) < 0.004) hlLevel = want;
      for (const s of headlight.spots) {
        s.intensity = hlLevel * HEADLIGHT.intensity;
        s.visible = hlLevel > 0.02;
      }
      for (const m of headlight.lenses) {
        m.color.setRGB(
          LENS_DARK[0] + (LENS_LIT[0] - LENS_DARK[0]) * hlLevel,
          LENS_DARK[1] + (LENS_LIT[1] - LENS_DARK[1]) * hlLevel,
          LENS_DARK[2] + (LENS_LIT[2] - LENS_DARK[2]) * hlLevel,
        );
      }
      return hlLevel;
    },
    spinWheels(dt, speed) {
      const d = (speed / wheelRadius) * dt;
      for (const w of wheels) w.rotation.x += d;
    },
    setSteer(turn) {
      for (const w of frontWheels) w.rotation.y = -turn * 0.5;
    },
    dispose() {
      root.removeFromParent();
    },
  };
}

export { GARAGE };
