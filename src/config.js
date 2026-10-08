export const PALETTE = {
  grass: 0xd9a441,
  dirt: 0x7a5a3a,
  pine: 0x2f6b4a,
  autumn: 0xe8c23a,
  cabinRoof: 0xb8442e,
  rock: 0x8a7f73,
  trunk: 0x7a5a3a,
  sun: 0xffd9a0,
  hemiSky: 0xffb88a,
  hemiGround: 0xc9a24b,
  horizon: 0xffc9a0,
  zenith: 0xf08a5d,
  sand: 0xe6d2a0,
  sandDark: 0xbfa070,
  gravel: 0x9a8d7a,
  snow: 0xf4f6f8,
};

export const WORLD = {
  size: 600,
  gridN: 257,
  trailHalfWidth: 2.8,
  trailFeather: 3.4,
  spawnU: 0.12,
  bounds: 285,
};

export const WATER = {
  lake: { x: 20, z: 20, r: 55, level: -0.9, depth: 2.5 },
  pond: { x: -195, z: -255, r: 16, level: -3.0, depth: 1.6 },
  stream: {
    path: [
      [-60, 270], [-49, 258], [-38, 246], [-28, 234], [-17, 223],
      [-6, 211], [5, 199], [16, 187], [26.6, 175.3],
      [22, 150], [16, 110], [18, 85], [20, 75],
    ],
    fordIdx: 8,
    width: 6,
  },
  gorge: { u0: 0.84, u1: 0.96, depth: 7, dIn: 5, dOut: 36 },
  cliff: { u0: 0.7, u1: 0.77, depth: 9, dIn: 6, dOut: 40 },
  rim: { start: 270, end: 380, lift: 4.5 },
};

export const TIME = {
  dayLengthSec: 1200,
  startPhase: 0.74,
};

export const LIGHT_GAIN = 3.5;

export const CONFIG = {
  quality: 'high',
  atmosphere: {
    clouds: true, birds: true, mist: false, morningFog: true,
    moon: true, shootingStars: true, fireflies: false,
    rain: false, rainbow: true, leaves: false, smoke: false, butterflies: false,
  },
};

export const HEADLIGHT = {
  autoOn: 0.2,
  ramp: 6,
  intensity: 200,
  distance: 60,
  angle: 0.5,
  decay: 1.3,
};

export const REST = {
  radius: 9,
  targetPhase: 0.3,
  nightMin: 0.3,
  fadeMs: 550,
};

export const AUDIO = {
  master: 0.8,
  wind: 0.55, nature: 0.6, engine: 0.5, water: 0.55, fire: 0.5, ui: 0.5,
};

export const ANIMALS = {
  fleeDist: 12,
  fleeFar: 40,
  nightDist: 15,
  nightOn: 0.7,
  deerSpeed: 8,
  rabbitSpeed: 10,
  deerWander: 1.2,
  rabbitWander: 2.5,
};

export const FOOT = {
  walk: 3.4,
  enter: 3.5,
  exitMaxSpeed: 0.8,
  fireSit: 4.5,
  camBack: 4.2,
  camUp: 2.1,
};

export const CAMERA = {
  fov: 58,
  back: 7,
  up: 3,
  near: 0.5,
  far: 1200,
};

export const KEYS = [
  {
    t: 0.0,
    skyTop: 0x0a1024, skyBot: 0x1a2440, fog: 0x141c33,
    sun: 0x9fb4e0, sunI: 0.12,
    hemiSky: 0x24304f, hemiGround: 0x12141f, hemiI: 0.3,
    elev: -18, stars: 1,
  },
  {
    t: 0.18,
    skyTop: 0x141c3b, skyBot: 0x4a3a55, fog: 0x3a3050,
    sun: 0xc0a0b0, sunI: 0.15,
    hemiSky: 0x3a3555, hemiGround: 0x1a1826, hemiI: 0.35,
    elev: -6, stars: 0.7,
  },
  {
    t: 0.25,
    skyTop: 0x5a6a9e, skyBot: 0xe8a07a, fog: 0xe8a07a,
    sun: 0xffb88a, sunI: 0.55,
    hemiSky: 0xe8a07a, hemiGround: 0x6b5a3a, hemiI: 0.5,
    elev: 7, stars: 0,
  },
  {
    t: 0.36,
    skyTop: 0x7faee0, skyBot: 0xffc9a0, fog: 0xffc9a0,
    sun: 0xfff3e2, sunI: 1.15,
    hemiSky: 0xbfd8f0, hemiGround: 0xc9a24b, hemiI: 0.55,
    elev: 35, stars: 0,
  },
  {
    t: 0.5,
    skyTop: 0x6fa8e0, skyBot: 0xdce8f0, fog: 0xdce8f0,
    sun: 0xffffff, sunI: 1.3,
    hemiSky: 0xcfe2f5, hemiGround: 0xc9a24b, hemiI: 0.6,
    elev: 62, stars: 0,
  },
  {
    t: 0.64,
    skyTop: 0x7faee0, skyBot: 0xf5d9b0, fog: 0xf5d9b0,
    sun: 0xffe8c0, sunI: 1.15,
    hemiSky: 0xbfd8f0, hemiGround: 0xc9a24b, hemiI: 0.55,
    elev: 38, stars: 0,
  },
  {
    t: 0.74,
    skyTop: 0xf08a5d, skyBot: 0xffc9a0, fog: 0xffc9a0,
    sun: 0xffd9a0, sunI: 1.0,
    hemiSky: 0xffb88a, hemiGround: 0xc9a24b, hemiI: 0.5,
    elev: 9, stars: 0,
  },
  {
    t: 0.81,
    skyTop: 0x6b4470, skyBot: 0xd8725a, fog: 0xc06a55,
    sun: 0xff9a6a, sunI: 0.45,
    hemiSky: 0x8a5a70, hemiGround: 0x4a3a3a, hemiI: 0.4,
    elev: 1, stars: 0.15,
  },
  {
    t: 0.88,
    skyTop: 0x141c3b, skyBot: 0x2a2e50, fog: 0x1e2440,
    sun: 0x9fb4e0, sunI: 0.15,
    hemiSky: 0x24304f, hemiGround: 0x12141f, hemiI: 0.3,
    elev: -10, stars: 0.8,
  },
  {
    t: 1.0,
    skyTop: 0x0a1024, skyBot: 0x1a2440, fog: 0x141c33,
    sun: 0x9fb4e0, sunI: 0.12,
    hemiSky: 0x24304f, hemiGround: 0x12141f, hemiI: 0.3,
    elev: -18, stars: 1,
  },
];

export const GARAGE = [
  {
    id: 'scout',
    era: '1960s',
    name: 'Trail Scout',
    model: 'suv.glb',
    rack: true,
    cargo: true,
    handling: {
      maxSpeed: 17, accel: 7.5, brake: 14, reverseAccel: 5,
      drag: 0.55, engineBrake: 3.2, steerRate: 1.9,
    },
  },
  {
    id: 'van',
    era: '1970s',
    name: 'Dune Van',
    model: 'van.glb',
    rack: true,
    cargo: false,
    handling: {
      maxSpeed: 15.5, accel: 6.4, brake: 12.5, reverseAccel: 4.5,
      drag: 0.6, engineBrake: 3.4, steerRate: 1.65,
    },
  },
  {
    id: 'haul',
    era: '1980s',
    name: 'Ridge Hauler',
    model: 'truck.glb',
    rack: false,
    cargo: false,
    handling: {
      maxSpeed: 18.5, accel: 6.8, brake: 13, reverseAccel: 4.8,
      drag: 0.5, engineBrake: 3.0, steerRate: 1.5,
    },
  },
];

// Special regions (Stage E+). Autumn is the default everywhere else. Weight = smoothstep over `blend` units past `r`.
export const REGIONS = {
  'pine-highlands': {
    label: 'Pine Highlands', x: -40, z: 255, r: 50, blend: 40,
    grass: 0x5a7a4a, snowFrom: 5.0, snowTo: 6.5,
    pine: 0x24523a, extraClusters: 8,
    fog: { color: 0xd8e4ee, near: 50, far: 220, max: 0.5 },
  },
  'beach-coast': {
    label: 'Sunny Coast', x: 95, z: 15, r: 50, blend: 40,
    grass: 0xe6d2a0, keep: 0.3,
  },
  'misty-valley': {
    label: 'Misty Valley', x: -55, z: 50, r: 55, blend: 40,
    grass: 0x8a9a5a, keep: 0.7,
    fog: { color: 0xe8eef2, near: 25, far: 170, max: 0.85 },
  },
  'desert-mesa': {
    label: 'Desert Mesa', x: -140, z: 90, r: 45, blend: 40,
    grass: 0xc9a86a, keep: 0.15,
    fog: { color: 0xffcf9e, near: 55, far: 230, max: 0.45 },
  },
};

// Trail-aligned structures (Phase 3). u = trail parameter; lift = deck height above trail (wood sits above the 0.22 ford water).
export const STRUCTURES = {
  woodBridge: { u: 0.62, length: 12, lift: 0.26 },
  stoneBridge: { u: 0.90, length: 14, lift: 0.06, pier: 7 },
  tunnel: { u: 0.73, length: 9 },
  // Off-trail landmarks: searched near (u, off, side) and kept >= clear from cabins/tents/garage and the race gates.
  windmill: { u: 0.20, off: 26, side: 1 },
  barn: { u: 0.24, off: 30, side: -1 },
  ruins: { u: 0.50, off: 32, side: 1 },
  lighthouse: { angle: 0.7, inland: 5 }, // lake-shore angle (rad); metres inland of the waterline
  clear: 24, gateClear: 30, gateUs: [0.33, 0.45],
};
