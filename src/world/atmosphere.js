import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/utils/BufferGeometryUtils.js';
import { CONFIG, WATER } from '../config.js';

const WHITE = new THREE.Color(0xffffff);

const TIER = CONFIG.quality === 'low' ? 0 : CONFIG.quality === 'medium' ? 1 : 2;
const COUNTS = {
  clouds: [6, 10, 14],
  flocks: [1, 2, 3],
  birdsPerFlock: [5, 6, 7],
  mist: [4, 7, 10],
  fireflies: [16, 26, 40],
  rain: [100, 200, 300],
  leaves: [20, 34, 48],
  smokePuffsPerSrc: [1, 2, 2],
  butterflies: [16, 22, 28],
};

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloudletGeometry() {
  const parts = [
    [10, 2.5, 6, 0, 0, 0],
    [6, 2.2, 4.5, -3, 0.8, 1],
    [5, 1.8, 4, 3.2, 0.9, -1.2],
    [4, 1.6, 3.4, 0.5, 1.1, 2],
    [4.5, 1.5, 3.6, -1.5, 1.0, -2],
  ].map(([w, h, d, x, y, z]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  });
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 0.4, -0.8, 0.25, -0.4, -0.15, 0, -0.35,
    0, 0, 0.4, 0.15, 0, -0.35, 0.8, 0.25, -0.4,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  return g;
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function mistAnchors() {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pts.push([
      WATER.lake.x + Math.cos(a) * WATER.lake.r * 0.85,
      WATER.lake.z + Math.sin(a) * WATER.lake.r * 0.85,
    ]);
  }
  for (const i of [2, 5, 8, 11]) pts.push([WATER.stream.path[i][0], WATER.stream.path[i][1]]);
  pts.push([-95, 70], [-40, 200], [140, 60]);
  return pts;
}

export function makeAtmosphere(terrain, smokeSources = []) {
  const group = new THREE.Group();
  group.name = 'atmosphere';
  const flags = CONFIG.atmosphere;
  const rand = rng(20261008);
  const dummy = new THREE.Object3D();

  const nClouds = COUNTS.clouds[TIER];
  const nFlocks = COUNTS.flocks[TIER];
  const birdsPerFlock = COUNTS.birdsPerFlock[TIER];
  const nBirds = nFlocks * birdsPerFlock;
  const nMist = COUNTS.mist[TIER];

  const cloudMat = new THREE.MeshLambertMaterial({
    transparent: true, opacity: 0.92, fog: true,
  });
  const cloudMesh = new THREE.InstancedMesh(cloudletGeometry(), cloudMat, nClouds);
  cloudMesh.frustumCulled = false;
  const cx = [], cy = [], cz = [], csc = [], crot = [];
  for (let i = 0; i < nClouds; i++) {
    cx.push(rand() * 400 - 200);
    cz.push(rand() * 400 - 200);
    cy.push(85 + rand() * 35);
    csc.push(0.8 + rand() * 1.4);
    crot.push(rand() * Math.PI * 2);
  }
  group.add(cloudMesh);

  const birdMat = new THREE.MeshBasicMaterial({
    color: 0x2a2620, side: THREE.DoubleSide, transparent: true, fog: true,
  });
  const birdMesh = new THREE.InstancedMesh(birdGeometry(), birdMat, nBirds);
  birdMesh.frustumCulled = false;
  const flocks = [];
  for (let f = 0; f < nFlocks; f++) {
    flocks.push({
      ax: (rand() * 2 - 1) * 240,
      az: (rand() * 2 - 1) * 240,
      y: 45 + rand() * 25,
      phase: rand() * Math.PI * 2,
    });
  }
  group.add(birdMesh);

  const mistMat = new THREE.MeshBasicMaterial({
    map: mistTexture(), transparent: true, opacity: 0.22,
    depthWrite: false, fog: true, color: 0xffffff, side: THREE.DoubleSide,
  });
  const mistGeo = new THREE.PlaneGeometry(24, 8);
  mistGeo.rotateX(-Math.PI / 2);
  const mistMesh = new THREE.InstancedMesh(mistGeo, mistMat, nMist);
  mistMesh.frustumCulled = false;
  const anchors = mistAnchors();
  const mx = new Float32Array(nMist);
  const mz = new Float32Array(nMist);
  let mistReady = false;
  group.add(mistMesh);

  const starMat = new THREE.MeshBasicMaterial({
    color: 0xeaf2ff, transparent: true, opacity: 0, fog: false, depthWrite: false,
  });
  const starMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 14), starMat);
  starMesh.visible = false;
  starMesh.frustumCulled = false;
  group.add(starMesh);
  const starVel = new THREE.Vector3();
  const lastCam = new THREE.Vector3();
  let starLife = 0;
  let starNext = 25 + rand() * 35;
  let starsFired = 0;

  function spawnStar() {
    const az = rand() * Math.PI * 2;
    const el = 0.35 + rand() * 0.5;
    starMesh.position.set(
      Math.cos(az) * Math.cos(el),
      Math.sin(el),
      Math.sin(az) * Math.cos(el),
    ).multiplyScalar(400).add(lastCam);
    const tAz = az + (rand() < 0.5 ? 1 : -1) * Math.PI / 2;
    starVel.set(Math.cos(tAz), -0.15 - rand() * 0.2, Math.sin(tAz)).multiplyScalar(90);
    starMesh.lookAt(starMesh.position.clone().add(starVel));
    starLife = 0.9;
    starMat.opacity = 0;
    starMesh.visible = true;
    starsFired++;
  }

  const nFlies = COUNTS.fireflies[TIER];
  const flyMat = new THREE.MeshBasicMaterial({
    map: mistTexture(), color: 0xd8ff9a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const flyMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 0.6), flyMat, nFlies);
  flyMesh.frustumCulled = false;
  flyMesh.visible = false;
  const flyCol = new THREE.Color();
  const flies = [];
  let flyReady = false;
  let flyT = 0;
  group.add(flyMesh);

  function spawnFly(i, px, pz) {
    let x = px, z = pz;
    for (let a = 0; a < 16; a++) {
      const ang = rand() * Math.PI * 2;
      const r = 8 + rand() * 47;
      x = px + Math.cos(ang) * r;
      z = pz + Math.sin(ang) * r;
      if (Math.abs(x) > 280 || Math.abs(z) > 280) continue;
      if (terrain.isWater(x, z)) continue;
      const nearWater = terrain.isWater(x + 10, z) || terrain.isWater(x - 10, z)
        || terrain.isWater(x, z + 10) || terrain.isWater(x, z - 10);
      if (nearWater || terrain.trailWeightAt(x, z) < 0.6) break;
    }
    const f = flies[i] || (flies[i] = {});
    f.bx = x;
    f.bz = z;
    f.y = terrain.heightAt(x, z) + 0.6 + rand() * 1.6;
    f.ph = rand() * Math.PI * 2;
    f.blinkPh = rand() * Math.PI * 2;
    f.blinkRate = 0.4 + rand() * 0.7;
    f.wt = rand() * Math.PI * 2;
  }

  const RAIN_R = 42, RAIN_H = 46;
  const nRain = COUNTS.rain[TIER];
  const rainMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, fog: false, depthWrite: false,
  });
  const rainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), rainMat, nRain);
  rainMesh.frustumCulled = false;
  const rxo = new Float32Array(nRain);
  const rzo = new Float32Array(nRain);
  const rph = new Float32Array(nRain);
  const rtil = new Float32Array(nRain);
  for (let i = 0; i < nRain; i++) {
    const ang = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * RAIN_R;
    rxo[i] = Math.cos(ang) * r;
    rzo[i] = Math.sin(ang) * r;
    rph[i] = rand() * RAIN_H;
    rtil[i] = (rand() - 0.5) * 0.15;
  }
  let rainT = 0;
  group.add(rainMesh);

  function rainAmount(t) {
    const w1 = sstep(0.22, 0.27, t) * (1 - sstep(0.38, 0.44, t));
    const w2 = sstep(0.68, 0.73, t) * (1 - sstep(0.82, 0.88, t));
    return Math.max(w1, w2);
  }

  const RBY = 118;
  const rbCanvas = document.createElement('canvas');
  rbCanvas.width = 4;
  rbCanvas.height = 64;
  const rbx = rbCanvas.getContext('2d');
  const rbBands = ['#d8432e', '#ec7b2e', '#eec743', '#8fbd4a', '#3f7fd0', '#6a4fc8', '#b05ad0', '#8a93b8'];
  for (let i = 0; i < 8; i++) {
    rbx.fillStyle = rbBands[i];
    rbx.fillRect(0, i * 8, 4, 8);
  }
  const rbTex = new THREE.CanvasTexture(rbCanvas);
  rbTex.wrapT = THREE.ClampToEdgeWrapping;
  const rainbow = new THREE.Group();
  const rainbowMesh = new THREE.Mesh(
    new THREE.TorusGeometry(RBY, 1.3, 8, 64, Math.PI),
    new THREE.MeshBasicMaterial({
      map: rbTex, transparent: true, opacity: 0, fog: false, depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  rainbowMesh.frustumCulled = false;
  rainbow.add(rainbowMesh);
  rainbow.visible = false;
  group.add(rainbow);

  const LEAF_COLORS = [0xd9cc55, 0xe8c23a, 0xb8442e];
  const nLeaves = COUNTS.leaves[TIER];
  const leafMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, fog: false, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.42), leafMat, nLeaves);
  leafMesh.frustumCulled = false;
  leafMesh.visible = false;
  const leafCol = new THREE.Color();
  const leaves = [];
  let leafReady = false;
  const leafAmt = { v: 0 };
  group.add(leafMesh);

  function spawnLeaf(i, px, pz) {
    const l = leaves[i] || (leaves[i] = {});
    l.r = 6 + rand() * 16;
    l.ph = rand() * Math.PI * 2;
    l.sp = (0.5 + rand() * 0.6) * (rand() < 0.5 ? 1 : -1);
    l.yo = (rand() - 0.5) * 1.4;
    l.col = LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)];
    l.cx = px + (rand() * 8 - 2);
    l.cz = pz + (rand() * 10 - 5);
  }

  const puffsPerSrc = COUNTS.smokePuffsPerSrc[TIER];
  const nSmoke = smokeSources.length * puffsPerSrc;
  const smokeMat = new THREE.MeshBasicMaterial({
    map: mistTexture(), transparent: true, opacity: 0, fog: false, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const smokeMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.3, 1.7), smokeMat, Math.max(nSmoke, 1),
  );
  smokeMesh.frustumCulled = false;
  smokeMesh.visible = false;
  const spuffs = [];
  for (const s of smokeSources) {
    for (let p = 0; p < puffsPerSrc; p++) {
      spuffs.push({
        sx: s.x, sy: s.y, sz: s.z,
        ph: rand(), speed: 1 / (6 + rand() * 3),
        rise: 6 + rand() * 3, sway: 0.8 + rand() * 0.7, sw: rand() * Math.PI * 2,
      });
    }
  }
  let smokeT = 0;
  group.add(smokeMesh);

  const BF_COLORS = [0xf2e8c9, 0xe8a33a, 0xd94f2b];
  const nBfly = COUNTS.butterflies[TIER];
  const bfMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, fog: false, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bfMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.36, 0.26), bfMat, nBfly);
  bfMesh.frustumCulled = false;
  bfMesh.visible = false;
  const bfCol = new THREE.Color();
  const bflies = [];
  let bflyReady = false;
  let bflyT = 0;
  group.add(bfMesh);

  function spawnBfly(i, px, pz) {
    const b = bflies[i] || (bflies[i] = {});
    let x = px, z = pz;
    for (let a = 0; a < 14; a++) {
      const ang = rand() * Math.PI * 2;
      const r = 6 + rand() * 24;
      x = px + Math.cos(ang) * r;
      z = pz + Math.sin(ang) * r;
      if (Math.abs(x) > 280 || Math.abs(z) > 280) continue;
      if (terrain.isWater(x, z)) continue;
      if (terrain.trailWeightAt(x, z) < 0.65) break;
    }
    b.bx = x;
    b.bz = z;
    b.by = terrain.heightAt(x, z) + 0.8 + rand() * 1.6;
    b.ph = rand() * Math.PI * 2;
    b.t = rand() * Math.PI * 2;
    b.rw = 3 + rand() * 4;
    b.sp = 0.5 + rand() * 0.5;
    b.col = BF_COLORS[Math.floor(rand() * BF_COLORS.length)];
  }

  let bt = 0;

  function respawnMist(i, px, pz) {
    const a = anchors[Math.floor(rand() * anchors.length)];
    mx[i] = Math.max(-280, Math.min(280, a[0] + (rand() * 28 - 14)));
    mz[i] = Math.max(-280, Math.min(280, a[1] + (rand() * 28 - 14)));
    if (Math.hypot(mx[i] - px, mz[i] - pz) > 90) {
      mx[i] = Math.max(-280, Math.min(280, px + (rand() * 60 - 30)));
      mz[i] = Math.max(-280, Math.min(280, pz + (rand() * 60 - 30)));
    }
    const y = Math.max(terrain.heightAt(mx[i], mz[i]), WATER.lake.level) + 1.0;
    dummy.position.set(mx[i], y, mz[i]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mistMesh.setMatrixAt(i, dummy.matrix);
  }

  return {
    group,
    flags,
    counts: () => ({
      clouds: nClouds, birds: nBirds, mist: nMist, fireflies: nFlies,
      rain: nRain, rainbow: 1, leaves: nLeaves,
      smoke: nSmoke, butterflies: nBfly,
    }),
    visible: () => ({
      clouds: cloudMesh.visible, birds: birdMesh.visible, mist: mistMesh.visible,
      star: starMesh.visible, fireflies: flyMesh.visible,
      rain: rainMesh.visible, rainbow: rainbow.visible, leaves: leafMesh.visible,
      smoke: smokeMesh.visible, butterflies: bfMesh.visible,
    }),
    starState: () => ({
      active: starLife > 0, fired: starsFired,
      pos: [starMesh.position.x, starMesh.position.y, starMesh.position.z],
    }),
    fireStar: () => {
      if (flags.shootingStars && starLife <= 0) spawnStar();
    },
    update(dt, ctx) {
      if (dt > 0.1) dt = 0.1;
      const t = ctx.timeOfDay;
      const cam = ctx.camera.position;

      cloudMesh.visible = flags.clouds;
      if (flags.clouds) {
        cloudMat.color.copy(ctx.fogColor).lerp(WHITE, 0.45);
        for (let i = 0; i < nClouds; i++) {
          cx[i] += 1.2 * dt;
          if (cx[i] > 200) cx[i] -= 400;
          else if (cx[i] < -200) cx[i] += 400;
          dummy.position.set(cam.x + cx[i], cy[i], cam.z + cz[i]);
          dummy.rotation.set(0, crot[i], 0);
          dummy.scale.setScalar(csc[i]);
          dummy.updateMatrix();
          cloudMesh.setMatrixAt(i, dummy.matrix);
        }
        cloudMesh.instanceMatrix.needsUpdate = true;
      }

      birdMesh.visible = flags.birds;
      if (flags.birds) {
        bt += dt;
        const special = (t > 0.22 && t < 0.42) || (t > 0.66 && t < 0.86);
        const day = t >= 0.42 && t <= 0.66;
        const flocksOn = special ? nFlocks : day ? Math.min(nFlocks, 2) : 1;
        birdMesh.count = flocksOn * birdsPerFlock;
        birdMat.opacity = special || day ? 1 : 0.5;
        let idx = 0;
        for (let f = 0; f < flocksOn; f++) {
          const fl = flocks[f];
          for (let b = 0; b < birdsPerFlock; b++) {
            const r = 70 + (b % 3) * 2 - 2;
            const ang = fl.phase + (bt * 9) / 70 + b * 0.12;
            const px = fl.ax + Math.cos(ang) * r;
            const pz = fl.az + Math.sin(ang) * r;
            dummy.position.set(px, fl.y + (b % 2) * 1.5, pz);
            dummy.rotation.set(0, Math.atan2(-Math.sin(ang), Math.cos(ang)), 0);
            dummy.scale.set(1, 0.6 + 0.4 * Math.sin(bt * Math.PI * 2 * 6 + b), 1);
            dummy.updateMatrix();
            birdMesh.setMatrixAt(idx++, dummy.matrix);
          }
        }
        birdMesh.instanceMatrix.needsUpdate = true;
      }

      mistMesh.visible = flags.mist;
      if (flags.mist) {
        const px = ctx.playerPos().x;
        const pz = ctx.playerPos().z;
        if (!mistReady) {
          mistReady = true;
          for (let i = 0; i < nMist; i++) respawnMist(i, px, pz);
        }
        for (let i = 0; i < nMist; i++) {
          mx[i] += 0.35 * dt;
          if (Math.hypot(mx[i] - px, mz[i] - pz) > 90) {
            respawnMist(i, px, pz);
          } else {
            const y = Math.max(terrain.heightAt(mx[i], mz[i]), WATER.lake.level) + 1.0;
            dummy.position.set(mx[i], y, mz[i]);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            mistMesh.setMatrixAt(i, dummy.matrix);
          }
        }
        mistMesh.instanceMatrix.needsUpdate = true;
      }

      lastCam.copy(cam);

      if (!flags.shootingStars) {
        starMesh.visible = false;
        starLife = 0;
      } else {
        if (ctx.nightFactor > 0.3) {
          starNext -= dt;
          if (starNext <= 0 && starLife <= 0) {
            spawnStar();
            starNext = 25 + rand() * 35;
          }
        }
        if (starLife > 0) {
          starLife -= dt;
          if (starLife <= 0) {
            starMesh.visible = false;
            starMat.opacity = 0;
          } else {
            starMesh.position.addScaledVector(starVel, dt);
            starMat.opacity = Math.sin(Math.PI * (0.9 - starLife) / 0.9);
          }
        } else {
          starMesh.visible = false;
        }
      }

      if (!flags.fireflies) {
        flyMesh.visible = false;
      } else {
        flyT += dt;
        flyMat.opacity = Math.max(0, Math.min(1, (ctx.nightFactor - 0.25) / 0.3));
        flyMesh.visible = flyMat.opacity > 0.02;
        if (flyMesh.visible) {
          const px = ctx.playerPos().x;
          const pz = ctx.playerPos().z;
          if (!flyReady) {
            flyReady = true;
            for (let i = 0; i < nFlies; i++) spawnFly(i, px, pz);
          }
          const camQuat = ctx.camera.quaternion;
          for (let i = 0; i < nFlies; i++) {
            const f = flies[i];
            f.wt += dt * 0.6;
            if (Math.hypot(f.bx - px, f.bz - pz) > 70) spawnFly(i, px, pz);
            const blink = 0.15 + 0.85 * Math.pow(
              0.5 + 0.5 * Math.sin(flyT * f.blinkRate * Math.PI * 2 + f.blinkPh), 2,
            );
            dummy.position.set(
              f.bx + Math.sin(f.wt) * 1.6,
              f.y + Math.sin(f.wt * 1.3 + f.ph) * 0.3,
              f.bz + Math.cos(f.wt * 0.8 + f.ph) * 1.6,
            );
            dummy.quaternion.copy(camQuat);
            dummy.scale.setScalar(0.6 + blink * 0.5);
            dummy.updateMatrix();
            flyMesh.setMatrixAt(i, dummy.matrix);
            flyCol.setScalar(0.25 + 0.75 * blink);
            flyMesh.setColorAt(i, flyCol);
          }
          flyMesh.instanceMatrix.needsUpdate = true;
          if (flyMesh.instanceColor) flyMesh.instanceColor.needsUpdate = true;
        }
      }

      rainT = rainAmount(t);
      rainMesh.visible = flags.rain && rainT > 0.01;
      if (rainMesh.visible) {
        rainMat.color.copy(ctx.fogColor).lerp(WHITE, 0.4);
        rainMat.opacity = 0.35 * rainT;
        for (let i = 0; i < nRain; i++) {
          rph[i] -= 30 * dt;
          if (rph[i] < 0) rph[i] += RAIN_H;
          rxo[i] += 1.6 * dt;
          if (rxo[i] > RAIN_R) rxo[i] -= RAIN_R * 2;
          else if (rxo[i] < -RAIN_R) rxo[i] += RAIN_R * 2;
          dummy.position.set(
            cam.x + rxo[i],
            cam.y + RAIN_H / 2 - rph[i],
            cam.z + rzo[i],
          );
          dummy.rotation.set(0, 0, 0.35 + rtil[i]);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          rainMesh.setMatrixAt(i, dummy.matrix);
        }
        rainMesh.instanceMatrix.needsUpdate = true;
      }

      const sunElevDeg = ctx.sunElev ? ctx.sunElev * 180 / Math.PI : -30;
      const lowSun = 1 - sstep(12, 28, sunElevDeg);
      const rb = flags.rainbow && rainT > 0.05 ? Math.min(rainT / 0.5, 1) * lowSun : 0;
      rainbow.visible = rb > 0.03;
      if (rainbow.visible) {
        const pp = ctx.playerPos();
        rainbow.position.copy(pp).addScaledVector(ctx.sunDir, -125);
        rainbow.position.y = 6;
        rainbow.rotation.y = Math.atan2(-ctx.sunDir.x, -ctx.sunDir.z);
        rainbowMesh.material.opacity = 0.55 * rb;
      }

      leafAmt.v = sstep(0.60, 0.64, t) * (1 - sstep(0.82, 0.87, t));
      leafMesh.visible = flags.leaves && leafAmt.v > 0.02;
      if (leafMesh.visible) {
        leafMat.opacity = leafAmt.v * 0.85;
        const pp = ctx.playerPos();
        if (!leafReady) {
          leafReady = true;
          for (let i = 0; i < nLeaves; i++) spawnLeaf(i, pp.x, pp.z);
        }
        for (let i = 0; i < nLeaves; i++) {
          const l = leaves[i];
          l.ph += dt * l.sp;
          dummy.position.set(
            l.cx + Math.cos(l.ph) * l.r,
            pp.y + 0.3 + Math.sin(l.ph * 1.7 + 1) * 1.2 + l.yo,
            l.cz + Math.sin(l.ph) * l.r,
          );
          dummy.rotation.set(0.5, Math.sin(l.ph * 2) * 0.7, l.ph * 3);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          leafMesh.setMatrixAt(i, dummy.matrix);
          leafCol.setHex(l.col);
          leafMesh.setColorAt(i, leafCol);
        }
        leafMesh.instanceMatrix.needsUpdate = true;
        if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
      }

      const smokeSt = sstep(0.16, 0.24, t) * (1 - sstep(0.42, 0.50, t))
        + sstep(0.60, 0.68, t) * (1 - sstep(0.90, 0.96, t));
      smokeMesh.visible = flags.smoke && nSmoke > 0 && smokeSt > 0.02;
      if (smokeMesh.visible) {
        smokeT += dt;
        smokeMat.color.copy(ctx.fogColor).lerp(WHITE, 0.35);
        smokeMat.opacity = 0.22 * smokeSt;
        const camQuat = ctx.camera.quaternion;
        for (let i = 0; i < nSmoke; i++) {
          const p = spuffs[i];
          const frac = (smokeT * p.speed + p.ph) % 1;
          dummy.position.set(
            p.sx + Math.sin(frac * Math.PI * 3 + p.sw) * p.sway * frac,
            p.sy + frac * p.rise,
            p.sz + Math.cos(frac * Math.PI * 2.6 + p.sw) * p.sway * frac * 0.7,
          );
          dummy.quaternion.copy(camQuat);
          dummy.scale.setScalar(0.5 + 2.0 * frac);
          dummy.updateMatrix();
          smokeMesh.setMatrixAt(i, dummy.matrix);
        }
        smokeMesh.instanceMatrix.needsUpdate = true;
      }

      const bfVis = flags.butterflies && ctx.nightFactor < 0.55;
      bfMesh.visible = bfVis;
      bfMat.opacity = Math.max(0, Math.min(1, (0.55 - ctx.nightFactor) / 0.1));
      if (bfVis) {
        bflyT += dt;
        const pp = ctx.playerPos();
        if (!bflyReady) {
          bflyReady = true;
          for (let i = 0; i < nBfly; i++) spawnBfly(i, pp.x, pp.z);
        }
        const camQuat = ctx.camera.quaternion;
        for (let i = 0; i < nBfly; i++) {
          const b = bflies[i];
          b.t += dt * b.sp;
          if (Math.hypot(b.bx - pp.x, b.bz - pp.z) > 40) spawnBfly(i, pp.x, pp.z);
          dummy.position.set(
            b.bx + Math.sin(b.t) * b.rw,
            b.by + Math.sin(b.t * 1.3 + b.ph) * 2.2,
            b.bz + Math.cos(b.t * 0.9 + b.ph) * b.rw,
          );
          dummy.quaternion.copy(camQuat);
          dummy.rotateZ(Math.sin(b.t * 2) * 0.35 + 0.2);
          dummy.scale.set(0.45 + 0.55 * Math.abs(Math.sin(b.t * 24)), 1, 1);
          dummy.updateMatrix();
          bfMesh.setMatrixAt(i, dummy.matrix);
          bfCol.setHex(b.col);
          bfMesh.setColorAt(i, bfCol);
        }
        bfMesh.instanceMatrix.needsUpdate = true;
        if (bfMesh.instanceColor) bfMesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
