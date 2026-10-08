import * as THREE from 'three';
import { PALETTE, WORLD, WATER, REGIONS } from '../config.js';
import { regionWeights } from './regions.js';

const TRAIL_PTS = [
  [-180, -140], [-90, -195], [25, -170], [125, -205], [215, -140],
  [245, -40], [190, 45], [225, 135], [140, 205], [30, 175],
  [-65, 215], [-165, 185], [-235, 105], [-205, 10], [-245, -70],
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function baseHeight(x, z) {
  return 5.5 * Math.sin(x * 0.017) * Math.cos(z * 0.014)
    + 3.2 * Math.sin((x * 0.9 + z * 1.1) * 0.023 + 1.7)
    + 1.6 * Math.sin(x * 0.041 + 2.1) * Math.cos(z * 0.037 - 0.8)
    + 0.7 * Math.sin(x * 0.11) * Math.sin(z * 0.093);
}

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class Terrain {
  constructor() {
    this.size = WORLD.size;
    this.n = WORLD.gridN;
    this.cell = this.size / (this.n - 1);
    this.height = new Float32Array(this.n * this.n);
    this.mask = new Float32Array(this.n * this.n);
    this.colors = new Float32Array(this.n * this.n * 3);
    this.curve = new THREE.CatmullRomCurve3(
      TRAIL_PTS.map((p) => new THREE.Vector3(p[0], 0, p[1])),
      true, 'catmullrom', 0.5,
    );
    this.trailLength = this.curve.getLength();
    this.#build();
  }

  #build() {
    const { n, cell, size } = this;
    const half = size / 2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + i * cell;
        const z = -half + j * cell;
        this.height[j * n + i] = baseHeight(x, z);
      }
    }

    const sampleCount = Math.ceil(this.trailLength);
    this.samples = [];
    for (let k = 0; k < sampleCount; k++) {
      const u = k / sampleCount;
      const p = this.curve.getPointAt(u);
      this.samples.push({ x: p.x, z: p.z, u, y: baseHeight(p.x, p.z) });
    }
    for (let pass = 0; pass < 3; pass++) {
      const src = this.samples.map((s) => s.y);
      const w = 6;
      for (let k = 0; k < this.samples.length; k++) {
        let sum = 0, cnt = 0;
        for (let d = -w; d <= w; d++) {
          const idx = (k + d + this.samples.length) % this.samples.length;
          sum += src[idx]; cnt++;
        }
        this.samples[k].y = sum / cnt;
      }
    }

    const halfW = WORLD.trailHalfWidth;
    const edge = halfW + WORLD.trailFeather;
    for (const s of this.samples) {
      const i0 = Math.max(0, Math.floor((s.x - edge + half) / cell));
      const i1 = Math.min(n - 1, Math.ceil((s.x + edge + half) / cell));
      const j0 = Math.max(0, Math.floor((s.z - edge + half) / cell));
      const j1 = Math.min(n - 1, Math.ceil((s.z + edge + half) / cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = -half + i * cell;
          const cz = -half + j * cell;
          const d = Math.hypot(cx - s.x, cz - s.z);
          if (d > edge) continue;
          const w = d <= halfW ? 1 : 1 - smoothstep(halfW, edge, d);
          const idx = j * n + i;
          this.height[idx] += ((s.y - 0.14) - this.height[idx]) * w * 0.9;
          if (w > this.mask[idx]) this.mask[idx] = w;
        }
      }
    }

    this.#prepareWater();
    this.#rimRaise();
    this.#carveLake();
    this.#carvePonds();
    this.#carveTidepools();
    this.#carveStream();
    this.#carveCliffGorge();
    this.#beachDunes();

    const grass = new THREE.Color(PALETTE.grass);
    const dirt = new THREE.Color(PALETTE.dirt);
    const sand = new THREE.Color(PALETTE.sand);
    const sandDark = new THREE.Color(PALETTE.sandDark);
    const gravel = new THREE.Color(PALETTE.gravel);
    const snowC = new THREE.Color(PALETTE.snow);
    const rockC = new THREE.Color(PALETTE.rock);
    const deepC = new THREE.Color(0x35485a);
    const regionGrass = Object.fromEntries(Object.entries(REGIONS).map(([k, R]) => [k, new THREE.Color(R.grass)]));
    const c = new THREE.Color();
    const rng = mulberry32(1337);
    const L = WATER.lake;
    const P = WATER.pond;
    for (let idx = 0; idx < n * n; idx++) {
      const i = idx % n;
      const j = (idx / n) | 0;
      const x = -half + i * cell;
      const z = -half + j * cell;
      const h = this.height[idx];
      const v = (rng() - 0.5) * 0.1;
      c.copy(grass).offsetHSL(0, v * 0.3, v);
      const m = smoothstep(0.08, 0.75, this.mask[idx]);
      if (m > 0) {
        const d = dirt.clone().offsetHSL(0, 0, v * 0.6);
        c.lerp(d, m);
      }
      if (m > 0.6 && rng() < 0.35) c.lerp(gravel, 0.3);
      const dl = Math.hypot(x - L.x, z - L.z);
      const dp = Math.hypot(x - P.x, z - P.z);
      if (dl < L.r * 1.18 && h < L.level + 3
        && Math.cos(Math.atan2(z - L.z, x - L.x)) > 0.4) c.lerp(sand, 0.85);
      if (dl < L.r && h < L.level + 0.6) c.copy(sandDark);
      if (dp < P.r && h < P.level + 0.6) c.copy(sandDark);
      const hL = this.height[j * n + Math.max(0, i - 1)];
      const hR = this.height[j * n + Math.min(n - 1, i + 1)];
      const hU = this.height[Math.max(0, j - 1) * n + i];
      const hD = this.height[Math.min(n - 1, j + 1) * n + i];
      const slope = Math.hypot(hR - hL, hD - hU) / (2 * cell);
      if (slope > 0.75) c.lerp(rockC, smoothstep(0.75, 1.25, slope) * 0.9);
      const ro = Math.hypot(x, z);
      if (ro > 250 && h > 7.5) c.lerp(snowC, smoothstep(7.5, 10.5, h) * 0.85);
      if (m < 0.5) {
        for (const o of regionWeights(x, z)) {
          const R = REGIONS[o.name];
          c.lerp(regionGrass[o.name], o.w);
          if (R.snowFrom != null) c.lerp(snowC, smoothstep(R.snowFrom, R.snowTo, h) * o.w);
        }
      }
      let sub = -1;
      if (dl < L.r && h < L.level) sub = Math.min(1, (L.level - h) / 1.2);
      if (dp < P.r && h < P.level) sub = Math.max(sub, Math.min(1, (P.level - h) / 1.2));
      for (const tp of this.water.tidepools) {
        if (Math.hypot(x - tp.x, z - tp.z) < tp.r && h < tp.level) {
          sub = Math.max(sub, Math.min(1, (tp.level - h) / 1.2));
        }
      }
      if (this.streamSurf[idx] < 900 && h < this.streamSurf[idx]) {
        sub = Math.max(sub, Math.min(1, (this.streamSurf[idx] - h) / 1.2));
      }
      if (sub >= 0) c.lerp(deepC, 0.2 + sub * 0.7);
      this.colors[idx * 3] = c.r;
      this.colors[idx * 3 + 1] = c.g;
      this.colors[idx * 3 + 2] = c.b;
    }
  }

  #prepareWater() {
    const path = WATER.stream.path.map((p) => ({ x: p[0], z: p[1] }));
    const arc = [0];
    for (let i = 1; i < path.length; i++) {
      arc.push(arc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    }
    const fi = WATER.stream.fordIdx;
    const bedFord = this.heightAt(path[fi].x, path[fi].z) - 0.11;
    const bedAtIdx = [];
    bedAtIdx[0] = this.heightAt(path[0].x, path[0].z) - 0.6;
    for (const i of [1, 2, 3]) {
      bedAtIdx[i] = this.heightAt(path[i].x, path[i].z) - 0.6;
    }
    bedAtIdx[4] = this.heightAt(path[4].x, path[4].z) - 0.6;
    const pf = 0.4;
    const px = path[4].x + (path[5].x - path[4].x) * pf;
    const pz = path[4].z + (path[5].z - path[4].z) * pf;
    const plungeBed = this.heightAt(px, pz) - 3.5;
    const sPlunge = arc[4] + (arc[5] - arc[4]) * pf;
    bedAtIdx[5] = this.heightAt(path[5].x, path[5].z) - 3.8;
    for (const i of [6, 7]) {
      const t = (arc[i] - arc[5]) / (arc[fi] - arc[5]);
      bedAtIdx[i] = bedAtIdx[5] + (bedFord - bedAtIdx[5]) * t;
    }
    bedAtIdx[fi] = bedFord;
    const bedEnd = WATER.lake.level - 0.35;
    const sEnd = arc[arc.length - 1];
    for (let i = fi + 1; i < path.length; i++) {
      const t = (arc[i] - arc[fi]) / (sEnd - arc[fi]);
      bedAtIdx[i] = bedFord + (bedEnd - bedFord) * t;
    }
    const bedKeys = [];
    for (let i = 0; i < path.length; i++) {
      if (i === 5) {
        bedKeys.push({ s: sPlunge, bed: plungeBed });
        bedKeys.push({ s: arc[5], bed: bedAtIdx[5] });
      } else {
        bedKeys.push({ s: arc[i], bed: bedAtIdx[i] });
      }
    }
    this.water = {
      lake: { ...WATER.lake },
      pond: { ...WATER.pond },
      stream: { pts: path, arc, bedKeys, width: WATER.stream.width, chute: [arc[4], sPlunge] },
      ford: { x: path[fi].x, z: path[fi].z, bed: bedFord },
      tidepools: [],
    };
  }

  #bedAt(s) {
    const k = this.water.stream.bedKeys;
    if (s <= k[0].s) return k[0].bed;
    for (let i = 1; i < k.length; i++) {
      if (s <= k[i].s) {
        const t = (s - k[i - 1].s) / (k[i].s - k[i - 1].s || 1);
        return k[i - 1].bed + (k[i].bed - k[i - 1].bed) * t;
      }
    }
    return k[k.length - 1].bed;
  }

  #carveLake() {
    const { n, cell } = this;
    const half = this.size / 2;
    const L = WATER.lake;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + i * cell;
        const z = -half + j * cell;
        const r = Math.hypot(x - L.x, z - L.z);
        if (r > L.r) continue;
        const t = smoothstep(L.r, L.r * 0.35, r);
        if (t <= 0) continue;
        const q = r / L.r;
        const prof = L.level - (0.3 + (L.depth - 0.3) * (1 - q * q));
        const idx = j * n + i;
        if (prof < this.height[idx]) {
          this.height[idx] += (prof - this.height[idx]) * t;
        }
      }
    }
  }

  #carvePonds() {
    const { n, cell } = this;
    const half = this.size / 2;
    const P = WATER.pond;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + i * cell;
        const z = -half + j * cell;
        const r = Math.hypot(x - P.x, z - P.z);
        if (r > P.r) continue;
        const t = smoothstep(P.r, P.r * 0.4, r);
        if (t <= 0) continue;
        const q = r / P.r;
        const prof = P.level - P.depth * (1 - q * q);
        const idx = j * n + i;
        if (prof < this.height[idx]) {
          this.height[idx] += (prof - this.height[idx]) * t;
        }
      }
    }
  }

  #carveTidepools() {
    const { n, cell } = this;
    const half = this.size / 2;
    const L = WATER.lake;
    for (const adeg of [105, 140, 175]) {
      const a = (adeg * Math.PI) / 180;
      const cx = L.x + Math.cos(a) * L.r * 1.06;
      const cz = L.z + Math.sin(a) * L.r * 1.06;
      if (Math.abs(cx) > half - 6 || Math.abs(cz) > half - 6) continue;
      const h0 = this.heightAt(cx, cz);
      if (h0 < L.level + 0.6) continue;
      const i0 = Math.max(0, Math.floor((cx - 4 + half) / cell));
      const i1 = Math.min(n - 1, Math.ceil((cx + 4 + half) / cell));
      const j0 = Math.max(0, Math.floor((cz - 4 + half) / cell));
      const j1 = Math.min(n - 1, Math.ceil((cz + 4 + half) / cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = -half + i * cell;
          const z = -half + j * cell;
          const d = Math.hypot(x - cx, z - cz);
          if (d > 3) continue;
          const idx = j * n + i;
          const prof = h0 - 0.6 + 0.6 * smoothstep(1.0, 3.0, d);
          if (prof < this.height[idx]) this.height[idx] = prof;
        }
      }
      this.water.tidepools.push({ x: cx, z: cz, level: h0 - 0.25, r: 1.8 });
    }
  }

  #carveStream() {
    const { n, cell } = this;
    const half = this.size / 2;
    const st = this.water.stream;
    const path = st.pts;
    const arc = st.arc;
    const Wd = st.width;
    const reach = Wd + 4;
    const sd = new Float32Array(n * n).fill(999);
    const ss = new Float32Array(n * n);
    for (let k = 1; k < path.length; k++) {
      const ax = path[k - 1].x, az = path[k - 1].z;
      const bx = path[k].x, bz = path[k].z;
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + half) / cell));
      const i1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + reach + half) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + half) / cell));
      const j1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + reach + half) / cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = -half + i * cell;
          const cz = -half + j * cell;
          let t = ((cx - ax) * dx + (cz - az) * dz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(cx - (ax + dx * t), cz - (az + dz * t));
          const idx = j * n + i;
          if (d < sd[idx]) {
            sd[idx] = d;
            ss[idx] = arc[k - 1] + (arc[k] - arc[k - 1]) * t;
          }
        }
      }
    }
    const halfW = Wd / 2;
    this.streamSurf = new Float32Array(n * n).fill(999);
    for (let idx = 0; idx < n * n; idx++) {
      const d = sd[idx];
      if (d >= Wd + 0.5) continue;
      const bed = this.#bedAt(ss[idx]);
      const q = Math.min(1, d / halfW);
      let prof = bed + 1.2 * q * q;
      if (d > halfW) prof += (d - halfW) * 0.35;
      const w = smoothstep(Wd + 0.5, 1.5, d);
      this.height[idx] += (prof - this.height[idx]) * w;
      this.streamSurf[idx] = bed + 0.38;
    }
  }

  #carveCliffGorge() {
    const { n, cell, samples } = this;
    const half = this.size / 2;
    const segs = [
      { ...WATER.gorge, outerOnly: false },
      { ...WATER.cliff, outerOnly: true },
    ];
    const bestD = new Float32Array(n * n);
    const bestX = new Float32Array(n * n);
    const bestZ = new Float32Array(n * n);
    const bestU = new Float32Array(n * n);
    for (const seg of segs) {
      bestD.fill(999);
      for (const s of samples) {
        if (s.u < seg.u0 || s.u > seg.u1) continue;
        const i0 = Math.max(0, Math.floor((s.x - seg.dOut + half) / cell));
        const i1 = Math.min(n - 1, Math.ceil((s.x + seg.dOut + half) / cell));
        const j0 = Math.max(0, Math.floor((s.z - seg.dOut + half) / cell));
        const j1 = Math.min(n - 1, Math.ceil((s.z + seg.dOut + half) / cell));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const cx = -half + i * cell;
            const cz = -half + j * cell;
            const d = Math.hypot(cx - s.x, cz - s.z);
            const idx = j * n + i;
            if (d < bestD[idx]) {
              bestD[idx] = d;
              bestX[idx] = s.x;
              bestZ[idx] = s.z;
              bestU[idx] = s.u;
            }
          }
        }
      }
      for (let idx = 0; idx < n * n; idx++) {
        const d = bestD[idx];
        if (d < seg.dIn || d > seg.dOut) continue;
        const sx = bestX[idx], sz = bestZ[idx];
        const i = idx % n;
        const j = (idx / n) | 0;
        const cx = -half + i * cell;
        const cz = -half + j * cell;
        if (seg.outerOnly && (cx - sx) * sx + (cz - sz) * sz < 0) continue;
        const uF = smoothstep(seg.u0, seg.u0 + 0.015, bestU[idx])
          * (1 - smoothstep(seg.u1 - 0.015, seg.u1, bestU[idx]));
        const g = smoothstep(seg.dIn, seg.dIn + 8, d)
          * (1 - smoothstep(seg.dOut - 12, seg.dOut, d)) * uF;
        this.height[idx] -= g * seg.depth;
      }
    }
  }

  #beachDunes() {
    const { n, cell } = this;
    const half = this.size / 2;
    const L = WATER.lake;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const x = -half + i * cell;
        const z = -half + j * cell;
        const r = Math.hypot(x - L.x, z - L.z);
        if (r < L.r * 0.6 || r > L.r * 1.3) continue;
        if (Math.cos(Math.atan2(z - L.z, x - L.x)) < 0.4) continue;
        if (this.height[idx] > L.level + 5) continue;
        const damp = 1 - smoothstep(0.3, 0.6, this.mask[idx]);
        this.height[idx] += 0.35 * Math.sin(x * 0.13 + 1) * Math.cos(z * 0.11) * damp;
      }
    }
  }

  #rimRaise() {
    const { n, cell } = this;
    const half = this.size / 2;
    const R = WATER.rim;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const x = -half + i * cell;
        const z = -half + j * cell;
        const r = Math.hypot(x, z);
        if (r < R.start) continue;
        const t = smoothstep(R.start, R.end, r);
        const a = Math.atan2(z, x);
        const lift = t * (R.lift + 1.8 * Math.sin(a * 6 + 1.2));
        this.height[idx] += lift * (1 - smoothstep(0.3, 0.6, this.mask[idx]));
      }
    }
  }

  #streamDist(x, z) {
    const pts = this.water.stream.pts;
    let m = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x, az = pts[i - 1].z;
      const dx = pts[i].x - ax, dz = pts[i].z - az;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < m) m = d;
    }
    return m;
  }

  isWater(x, z) {
    const w = this.water;
    if (Math.hypot(x - w.lake.x, z - w.lake.z) < w.lake.r + 2) return true;
    if (Math.hypot(x - w.pond.x, z - w.pond.z) < w.pond.r + 2) return true;
    for (const p of w.tidepools) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + 2) return true;
    }
    if (this.#streamDist(x, z) < 7) return true;
    return false;
  }

  slopeAt(x, z) {
    const e = this.cell * 2;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  #index(x, z) {
    const { n, cell, size } = this;
    const gx = Math.min(n - 1.001, Math.max(0, (x + size / 2) / cell));
    const gz = Math.min(n - 1.001, Math.max(0, (z + size / 2) / cell));
    return { i: Math.floor(gx), j: Math.floor(gz), fx: gx % 1, fz: gz % 1 };
  }

  heightAt(x, z) {
    const { i, j, fx, fz } = this.#index(x, z);
    const n = this.n;
    const h = this.height;
    const a = h[j * n + i], b = h[j * n + i + 1];
    const c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  trailWeightAt(x, z) {
    const { i, j, fx, fz } = this.#index(x, z);
    const n = this.n;
    const m = this.mask;
    const a = m[j * n + i], b = m[j * n + i + 1];
    const c = m[(j + 1) * n + i], d = m[(j + 1) * n + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  trailPoint(u) {
    const p = this.curve.getPointAt(((u % 1) + 1) % 1);
    const t = this.curve.getTangentAt(((u % 1) + 1) % 1);
    return { pos: p, tan: t, y: this.heightAt(p.x, p.z) };
  }

  buildMesh() {
    const { n, cell, size } = this;
    const half = size / 2;
    const verts = n * n;
    const positions = new Float32Array(verts * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        positions[idx * 3] = -half + i * cell;
        positions[idx * 3 + 1] = this.height[idx];
        positions[idx * 3 + 2] = -half + j * cell;
      }
    }
    const index = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        index[k++] = a; index[k++] = c; index[k++] = b;
        index[k++] = b; index[k++] = c; index[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }
}
