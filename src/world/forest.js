import * as THREE from 'three';
import { PALETTE, REGIONS } from '../config.js';
import { regionWeights, weightOf } from './regions.js';
import { mulberry32 } from './terrain.js';

const _c = new THREE.Color();

function makeInstances(geo, count) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

function setColor(mesh, i, hex, rng) {
  _c.setHex(hex);
  const l = (rng() - 0.5) * 0.1;
  _c.offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.06, l);
  mesh.setColorAt(i, _c);
}

export function buildForest(terrain, cabinSpots, rng = mulberry32(4242)) {
  const pines = [];
  const autumns = [];

  const addCluster = (cx, cz, radius, count, rng) => {
    for (let k = 0; k < count; k++) {
      const ang = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      const x = cx + Math.cos(ang) * r;
      const z = cz + Math.sin(ang) * r;
      if (Math.abs(x) > 288 || Math.abs(z) > 288) continue;
      if (terrain.trailWeightAt(x, z) > 0.18) continue;
      if (terrain.isWater(x, z) || terrain.slopeAt(x, z) > 0.75) continue;
      let nearCabin = false;
      for (const s of cabinSpots) {
        if (Math.hypot(s.x - x, s.z - z) < 11) { nearCabin = true; break; }
      }
      if (nearCabin) continue;
      // thin out sparse regions with a position hash (keeps the seeded rng stream untouched)
      let keep = 1;
      for (const o of regionWeights(x, z)) keep += (( REGIONS[o.name].keep ?? 1) - 1) * o.w;
      if ((Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) > keep) continue;
      const inPine = weightOf('pine-highlands', x, z) > 0.5;
      const item = {
        x, z,
        y: terrain.heightAt(x, z),
        s: 0.75 + rng() * 0.85,
        rot: rng() * Math.PI * 2,
        autumn: rng() < 0.2 && !inPine,
        pine: inPine ? REGIONS['pine-highlands'].pine : PALETTE.pine,
      };
      (item.autumn ? autumns : pines).push(item);
    }
  };

  for (let c = 0; c < 48; c++) {
    const cx = (rng() - 0.5) * 540;
    const cz = (rng() - 0.5) * 540;
    const radius = 7 + rng() * 9;
    addCluster(cx, cz, radius, 6 + Math.floor(rng() * 12), rng);
  }
  // Extra pine density inside pine-highlands; own rng so the clusters above stay identical.
  const P = REGIONS['pine-highlands'];
  const prng = mulberry32(5150);
  for (let c = 0; c < P.extraClusters; c++) {
    const a = prng() * Math.PI * 2;
    const d = Math.sqrt(prng()) * P.r;
    addCluster(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 7 + prng() * 9, 6 + Math.floor(prng() * 12), prng);
  }

  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.7, 5);
  trunkGeo.translate(0, 0.85, 0);

  const tierGeo = new THREE.ConeGeometry(1, 1, 6);
  const tiers = [
    { r: 1.5, h: 2.5, y: 2.35 },
    { r: 1.12, h: 2.3, y: 3.8 },
    { r: 0.72, h: 2.1, y: 5.2 },
  ];
  const blobGeo = new THREE.IcosahedronGeometry(1, 0);

  const nP = pines.length;
  const nA = autumns.length;

  const pineTrunks = makeInstances(trunkGeo, nP);
  const pineTiers = tiers.map(() => makeInstances(tierGeo, nP));
  const autumnTrunks = makeInstances(trunkGeo, nA);
  const autumnBlobs = [
    makeInstances(blobGeo, nA),
    makeInstances(blobGeo, nA),
  ];
  const autumnBlobT = [
    { r: 1.7, y: 3.3 },
    { r: 1.15, y: 4.6 },
  ];

  pines.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.setScalar(t.s);
    dummy.updateMatrix();
    pineTrunks.setMatrixAt(i, dummy.matrix);
    setColor(pineTrunks, i, PALETTE.trunk, rng);
    pineTiers.forEach((m, ti) => {
      const T = tiers[ti];
      dummy.position.set(t.x, t.y + T.y * t.s, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(T.r * t.s, T.h * t.s, T.r * t.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      setColor(m, i, t.pine, rng);
    });
  });

  autumns.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.setScalar(t.s);
    dummy.updateMatrix();
    autumnTrunks.setMatrixAt(i, dummy.matrix);
    setColor(autumnTrunks, i, PALETTE.trunk, rng);
    autumnBlobs.forEach((m, bi) => {
      const T = autumnBlobT[bi];
      dummy.position.set(t.x, t.y + T.y * t.s, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(T.r * t.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      setColor(m, i, PALETTE.autumn, rng);
    });
  });

  const all = [pineTrunks, ...pineTiers, autumnTrunks, ...autumnBlobs];
  for (const m of all) {
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
  }
  return group;
}
