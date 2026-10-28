import * as THREE from 'three';
import { WORLD, TIME, CAMERA, GARAGE, REST, HEADLIGHT, FOOT, CONFIG, REGIONS } from './config.js';
import { Terrain } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { buildForest } from './world/forest.js';
import { buildProps, updateProps } from './world/props.js';
import { buildWater, updateWater } from './world/water.js';
import { makeAtmosphere } from './world/atmosphere.js';
import { makeAudio } from './audio/sound.js';
import { buildStructures, planSites, updateStructures } from './world/structures.js';
import { buildRegionProps, updateRegionProps } from './world/regionProps.js';
import { regionAt, regionWeights } from './world/regions.js';
import { buildGarage } from './world/garage.js';
import { buildAnimals } from './world/animals.js';
import { Traffic } from './world/traffic.js';
import { RaceZone } from './world/raceZone.js';
import { createTruck } from './vehicle/truck.js';
import { Driver } from './vehicle/drive.js';
import { ChaseCam } from './vehicle/chaseCam.js';
import { Walker } from './vehicle/foot.js';
import { Boat } from './vehicle/boat.js';
import { Session } from './net/session.js';
import { RemoteCars } from './net/remoteCars.js';
import { initHud, updateRaceHud, toast, setHint } from './ui/hud.js';
import { initTouch } from './ui/touchControls.js';
import { initMap } from './ui/map.js';

function vehName(id) {
  const g = GARAGE.find((e) => e.id === id);
  return g ? g.name : 'Friend';
}

async function boot() {
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far,
  );

  const terrain = new Terrain();
  scene.add(terrain.buildMesh());

  const sky = new Sky(scene);
  const garage = buildGarage(terrain, GARAGE);
  scene.add(garage.group);
  const props = buildProps(terrain, garage.slots);
  scene.add(props);
  const avoidSpots = [...props.userData.cabins, ...garage.slots, ...props.userData.tents];
  const sites = planSites(terrain, [...avoidSpots]);
  avoidSpots.push(...Object.values(sites));
  scene.add(buildForest(terrain, avoidSpots));
  const animals = buildAnimals(terrain, avoidSpots);
  scene.add(animals.group);
  const water = buildWater(terrain);
  scene.add(water);
  let structures = null;
  let boat = null;
  buildStructures(terrain, sites).then((g) => { structures = g; scene.add(g); });
  let regionProps = null;
  buildRegionProps(terrain).then((g) => {
    regionProps = g;
    scene.add(g);
    const anchor = g.userData.boatAnchor;
    if (anchor) {
      boat = new Boat(terrain, anchor);
      scene.add(boat.mesh);
    }
  });
  const smokeSources = [];
  for (const c of props.userData.cabins) {
    smokeSources.push({ x: c.x, y: terrain.heightAt(c.x, c.z) + 4.6, z: c.z });
  }
  for (const f of props.userData.fires) {
    smokeSources.push({ x: f.x, y: f.y + 1.0, z: f.z });
  }
  const atmosphere = makeAtmosphere(terrain, smokeSources);
  scene.add(atmosphere.group);

  const audio = makeAudio();
  const audioWake = () => {
    audio.resume();
    window.removeEventListener('pointerdown', audioWake);
    window.removeEventListener('keydown', audioWake);
  };
  window.addEventListener('pointerdown', audioWake);
  window.addEventListener('keydown', audioWake);

  const driver = new Driver(terrain);
  let vehicle = await createTruck(GARAGE[0], true);
  scene.add(vehicle.root);
  driver.attach(vehicle);
  driver.spawn(WORLD.spawnU);

  const chase = new ChaseCam(camera, terrain);
  chase.snap(driver.pos, driver.yaw);
  const walker = new Walker(terrain);
  let foot = false;
  let aboard = false;
  let sleeping = false;

  const traffic = new Traffic(terrain);
  traffic.load();

  const session = new Session();
  const remotes = new RemoteCars(scene, terrain);
  const zone = new RaceZone(terrain, scene);
  initHud(session, driver);

  let currentVehId = GARAGE[0].id;
  const _regionFog = new THREE.Color();
  let currentRegion = 'autumn';
  const seenRegions = new Set();
  let timeOfDay = TIME.startPhase;
  let timeTarget = null;
  session.hostVehicle = currentVehId;
  session.hostTime = () => timeOfDay;

  session.on('join', (id, veh) => { remotes.ensure(id, veh || GARAGE[0].id); });
  session.on('leave', (id) => remotes.remove(id));
  session.on('welcome', (veh, time) => { remotes.ensure('host', veh); timeTarget = time; });
  session.on('time', (ph) => { timeTarget = ph; });
  session.on('state', (id, msg) => remotes.applyState(id, msg));
  session.on('vehicle', (id, vid) => remotes.ensure(id, vid));
  session.on('race', (msg) => zone.applyNet(msg));
  session.on('status', (s) => {
    if (s === 'solo' || s === 'disconnected') { remotes.clear(); timeTarget = null; }
  });

  zone.onResult = (result) => {
    const meId = session.role === 'guest' && session.peer ? session.peer.id : 'host';
    const mine = result.actorId === meId;
    const time = Number(result.time).toFixed(1);
    if (session.role === 'solo') {
      toast(mine ? `Finish — ${time}s` : `${vehName(result.veh)} wins — ${time}s`);
    } else if (mine) {
      toast(`You win! ${time}s`);
    } else {
      toast(`${vehName(result.veh)} wins — ${time}s`);
    }
  };

  let garageIndex = 0;
  let timeScale = 1;
  let lightsManual = null;
  let prevRaceState = 'idle';
  let prevCd = -1;
  let restAvailable = false;
  let hintText = null;
  let hintKind = null;
  let switching = false;
  let landingCache = null;
  let landingCheck = -1;
  const cabins = props.userData.cabins;
  const tents = props.userData.tents;
  const fadeEl = document.getElementById('fade');
  const restHintEl = document.getElementById('restHint');

  const map = initMap({
    terrain,
    garage: garage.slots,
    cabins,
    tents,
    sites,
    getPlayer: () => {
      if (aboard && boat) return { x: boat.pos.x, z: boat.pos.z, yaw: boat.yaw, kind: 'boat' };
      if (foot) return { x: walker.pos.x, z: walker.pos.z, yaw: walker.yaw, kind: 'foot' };
      return { x: driver.pos.x, z: driver.pos.z, yaw: driver.yaw, kind: 'truck' };
    },
    getCanoe: () => (boat ? { x: boat.pos.x, z: boat.pos.z } : null),
    getRemotes: () => {
      if (session.role === 'solo') return [];
      const out = [];
      for (const c of remotes.cars.values()) {
        const p = c.onBoat && c.boatPos ? c.boatPos : c.onFoot && c.footPos ? c.footPos : c.pos;
        out.push({ x: p.x, z: p.z });
      }
      return out;
    },
  });

  async function switchTruck(idx) {
    if (idx === garageIndex || switching) return;
    if (foot) { toast('Get in the truck first'); return; }
    audio.click('truck');
    switching = true;
    garageIndex = idx;
    try {
      const old = vehicle;
      const next = await createTruck(GARAGE[idx], true);
      scene.add(next.root);
      driver.attach(next);
      vehicle = next;
      currentVehId = GARAGE[idx].id;
      session.hostVehicle = currentVehId;
      session.sendVehicle(currentVehId);
      old.root.removeFromParent();
      refreshGarageModels();
    } finally {
      switching = false;
    }
  }

  const parked = new Map();
  let refreshQ = Promise.resolve();

  function refreshGarageModels() {
    refreshQ = refreshQ.then(async () => {
      for (const g of GARAGE) {
        if (g.id === currentVehId) {
          const v = parked.get(g.id);
          if (v) {
            v.root.removeFromParent();
            parked.delete(g.id);
          }
          continue;
        }
        if (parked.has(g.id)) continue;
        const v = await createTruck(g, false);
        if (g.id === currentVehId) continue;
        const slot = garage.slots.find((s) => s.id === g.id);
        v.root.position.set(slot.x, slot.y, slot.z);
        v.root.rotation.y = slot.yaw;
        scene.add(v.root);
        parked.set(g.id, v);
      }
    });
    return refreshQ;
  }

  async function enterGarage(idx) {
    if (switching || !foot) return;
    if (zone.state !== 'idle') { toast('Race in progress'); return; }
    const slot = garage.slots.find((s) => s.index === idx);
    if (!slot || slot.id === currentVehId) return;
    if (Math.hypot(walker.pos.x - slot.x, walker.pos.z - slot.z) >= FOOT.enter) return;
    audio.click('truck');
    switching = true;
    garageIndex = idx;
    try {
      driver.pos.set(slot.x, 0, slot.z);
      driver.y = slot.y;
      driver.yaw = slot.yaw;
      driver.speed = 0;
      driver.vy = 0;
      const old = vehicle;
      const next = await createTruck(GARAGE[idx], true);
      scene.add(next.root);
      driver.attach(next);
      vehicle = next;
      currentVehId = GARAGE[idx].id;
      session.hostVehicle = currentVehId;
      session.sendVehicle(currentVehId);
      old.root.removeFromParent();
      scene.remove(walker.mesh);
      walker.setPose('stand');
      foot = false;
      driver.applyTransform();
      refreshGarageModels();
    } finally {
      switching = false;
    }
  }

  refreshGarageModels();

  function toggleLights() {
    const autoOn = sky.nightFactor > HEADLIGHT.autoOn;
    if (lightsManual === null) lightsManual = !autoOn;
    else lightsManual = null;
    audio.click('lights');
  }

  function fadeThen(cb) {
    fadeEl.classList.add('on');
    setTimeout(() => {
      cb();
      fadeEl.classList.remove('on');
    }, REST.fadeMs);
  }

  function nearestRestAnchor() {
    const pp = playerPos();
    let best = null;
    let bd = REST.radius;
    for (const c of cabins) {
      const d = Math.hypot(c.x - pp.x, c.z - pp.z);
      if (d < bd) { bd = d; best = { kind: 'cabin' }; }
    }
    for (const t of tents) {
      const d = Math.hypot(t.x - pp.x, t.z - pp.z);
      if (d < bd) { bd = d; best = { kind: 'tent' }; }
    }
    return best;
  }

  function beginSleep(kind, onWake) {
    sleeping = true;
    if (foot) {
      walker.setPose('lie');
      walker.lookPitch = 1.42;
    }
    setTimeout(() => {
      if (!sleeping) return;
      fadeThen(() => {
        if (onWake) onWake();
        toast(kind === 'tent' ? 'Camped until morning' : 'Rested until morning');
        sleeping = false;
      });
    }, REST.sleepDwellMs);
  }

  function performRest() {
    if (zone.state !== 'idle' || sleeping) return;
    const kind = nearestRestAnchor()?.kind;
    beginSleep(kind, () => {
      timeOfDay = REST.targetPhase;
      timeTarget = null;
      if (session.role === 'host') session.broadcast({ t: 'tm', ph: +timeOfDay.toFixed(4) });
    });
  }

  function tryRest() {
    if (!restAvailable || sleeping) return;
    if (zone.state !== 'idle') { toast('Race in progress'); return; }
    audio.click('rest');
    const kind = nearestRestAnchor()?.kind;
    if (session.role === 'guest') {
      session.sendRest();
      beginSleep(kind, null);
    } else {
      performRest();
    }
  }

  session.on('rest', performRest);

  function playerPos() {
    if (aboard && boat) return boat.pos;
    return foot ? walker.pos : driver.pos;
  }

  function nearFire() {
    return props.userData.fires.some(
      (f) => Math.hypot(f.x - walker.pos.x, f.z - walker.pos.z) < FOOT.fireSit,
    );
  }

  function nearestEnterable() {
    const dTruck = Math.hypot(walker.pos.x - driver.pos.x, walker.pos.z - driver.pos.z);
    let best = dTruck < FOOT.enter ? { kind: 'truck', d: dTruck } : null;
    for (const s of garage.slots) {
      if (s.id === currentVehId) continue;
      const d = Math.hypot(walker.pos.x - s.x, walker.pos.z - s.z);
      if (d < FOOT.enter && (!best || d < best.d)) best = { kind: 'slot', index: s.index, d };
    }
    return best;
  }

  function exitPoint() {
    const fx = Math.sin(driver.yaw);
    const fz = Math.cos(driver.yaw);
    const rx = -fz;
    const rz = fx;
    const spots = [
      [rx * 1.7, rz * 1.7],
      [-rx * 1.7, -rz * 1.7],
      [-fx * 2.4, -fz * 2.4],
      [fx * 2.4, fz * 2.4],
    ];
    for (const [dx, dz] of spots) {
      const x = driver.pos.x + dx;
      const z = driver.pos.z + dz;
      if (terrain.waterLevelAt(x, z) != null) continue;
      if (terrain.slopeAt(x, z) > 0.6) continue;
      if (Math.abs(x) > 284 || Math.abs(z) > 284) continue;
      return { x, z };
    }
    return null;
  }

  function boardBoat() {
    if (!boat || aboard) return;
    scene.remove(walker.mesh);
    foot = false;
    aboard = true;
    boat.speed = 0;
    sleeping = false;
    audio.click('foot');
    toast('Canoe — W/S row, A/D steer, F step ashore');
  }

  function disembark() {
    if (!boat) return;
    if (zone.state !== 'idle') { toast('Race in progress'); return; }
    const spot = boat.findLanding();
    if (!spot) { toast('Row closer to shore'); return; }
    boat.speed = 0;
    aboard = false;
    foot = true;
    const yaw = Math.atan2(spot.x - boat.pos.x, spot.z - boat.pos.z);
    walker.spawn(spot.x, spot.z, yaw);
    scene.add(walker.mesh);
    audio.click('foot');
  }

  function footAction() {
    if (aboard) { disembark(); return; }
    if (!foot) {
      if (Math.abs(driver.speed) > FOOT.exitMaxSpeed) { toast('Slow down to get out'); return; }
      if (zone.state !== 'idle') { toast('Race in progress'); return; }
      const spot = exitPoint();
      if (!spot) { toast('No room to get out here'); return; }
      driver.speed = 0;
      walker.spawn(spot.x, spot.z, driver.yaw);
      scene.add(walker.mesh);
      foot = true;
      audio.click('foot');
      return;
    }
    if (walker.pose === 'stand') {
      if (boat && boat.canBoard(walker.pos) && zone.state === 'idle') { boardBoat(); return; }
      const ent = nearestEnterable();
      if (ent) {
        if (ent.kind === 'truck') {
          scene.remove(walker.mesh);
          foot = false;
          audio.click('foot');
        } else {
          enterGarage(ent.index);
        }
        return;
      }
      walker.setPose('sit'); // sit anywhere
    } else if (walker.pose === 'sit') {
      walker.setPose('lie');
    } else {
      walker.setPose('stand');
    }
    audio.click('foot');
  }

  restHintEl.addEventListener('click', () => {
    if (hintKind === 'rest') tryRest();
    else footAction();
  });

  const toggleMute = () => {
    audio.toggleMute();
    touch.setMuted(audio.isMuted());
  };

  const nextTruck = () => {
    if (foot) { toast('Get in the truck first'); return; }
    switchTruck((garageIndex + 1) % GARAGE.length);
  };

  const touch = initTouch(driver, {
    switchTruck,
    nextTruck,
    toggleLights,
    footAction,
    setFast: (on) => { timeScale = on ? 25 : 1; },
    togglePanel: () => document.getElementById('panel').classList.toggle('hidden'),
    toggleMute,
    isMuted: () => audio.isMuted(),
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyT') timeScale = 25;
    else if (e.code === 'KeyL') toggleLights();
    else if (e.code === 'KeyE') tryRest();
    else if (e.code === 'KeyF') footAction();
    else if (e.code === 'KeyN') toggleMute();
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) {
      const idx = Number(m[1]) - 1;
      if (idx < GARAGE.length) switchTruck(idx);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyT') timeScale = 1;
  });

  let last = performance.now();
  let sendAcc = 0;
  let timeAcc = 0;
  let waterT = 0;

  function frame(now) {
    const rawDt = Math.min((now - last) / 1000, 0.25);
    const dt = Math.min(rawDt, 0.05);
    last = now;

    if (session.role === 'guest' && timeTarget != null) {
      const d = ((timeTarget - timeOfDay + 1.5) % 1) - 0.5;
      timeOfDay = (timeOfDay + d * (1 - Math.exp(-4 * rawDt)) + 1) % 1;
    } else {
      const still = (foot && walker.pose !== 'stand')
        || (aboard && boat && Math.abs(boat.speed) < 0.5)
        || (!foot && !aboard && Math.abs(driver.speed) < FOOT.exitMaxSpeed);
      timeOfDay = (timeOfDay
        + (rawDt * timeScale * (still ? TIME.stillScale : 1)) / TIME.dayLengthSec) % 1;
    }

    sky.update(timeOfDay, playerPos());
    sky.dome.position.copy(camera.position);
    if (CONFIG.atmosphere.morningFog) {
      let m = 0;
      if (timeOfDay > 0.20 && timeOfDay < 0.40) {
        m = Math.sin(((timeOfDay - 0.20) / 0.20) * Math.PI);
      }
      sky.fog.near = 60 * (1 - 0.37 * m);
      sky.fog.far = 260 * (1 - 0.27 * m);
    }
    {
      const pp = playerPos();
      for (const o of regionWeights(pp.x, pp.z)) {
        const F = REGIONS[o.name].fog;
        if (!F) continue;
        const w = o.w * F.max;
        sky.fog.color.lerp(_regionFog.setHex(F.color), w);
        sky.fog.near += (F.near - sky.fog.near) * w;
        sky.fog.far += (F.far - sky.fog.far) * w;
      }
      const rn = regionAt(pp.x, pp.z);
      if (rn !== currentRegion) {
        currentRegion = rn;
        if (rn !== 'autumn' && !seenRegions.has(rn)) { seenRegions.add(rn); toast(REGIONS[rn].label); }
      }
    }
    if (aboard && boat) boat.update(dt, driver.keys);
    else if (foot) walker.update(dt, driver.keys);
    else driver.update(dt);
    if (foot) walker.mesh.visible = walker.pose === 'stand';

    const camPos = playerPos();
    let camYaw = driver.yaw;
    let camMode = 'drive';
    let camFrame = null;
    if (aboard && boat) {
      camYaw = boat.yaw;
      camMode = 'boat';
    } else if (foot) {
      camYaw = walker.yaw;
      camMode = walker.pose === 'stand' ? 'walk' : walker.pose;
      if (walker.pose !== 'stand') {
        camFrame = { eye: walker.pose === 'lie' ? 0.3 : 1.15, pitch: walker.lookPitch };
      } else {
        let nd = Infinity;
        for (const c of cabins) nd = Math.min(nd, Math.hypot(camPos.x - c.x, camPos.z - c.z));
        for (const t of tents) nd = Math.min(nd, Math.hypot(camPos.x - t.x, camPos.z - t.z));
        if (nd < 7) camFrame = { back: 2.1, up: 1.5 };
      }
    } else if (sleeping) {
      camMode = 'sleep';
      camFrame = { eye: 1.25, pitch: (82 * Math.PI) / 180 };
    }
    chase.update(dt, camPos, camYaw, camMode, camFrame);
    traffic.update(dt, sky.nightFactor);
    remotes.update(dt, sky.nightFactor);
    animals.update(dt, playerPos(), sky.nightFactor);
    updateProps(props, sky.nightFactor, playerPos(), rawDt);
    waterT += rawDt;
    updateWater(water, waterT);
    if (regionProps) updateRegionProps(regionProps, sky.nightFactor);
    if (structures) updateStructures(structures, dt, sky.nightFactor);
    atmosphere.update(dt, {
      camera, timeOfDay, nightFactor: sky.nightFactor,
      fogColor: sky.fog.color, playerPos,
      sunDir: sky.sunDir, sunElev: Math.asin(sky.sunDir.y),
    });
    vehicle.setHeadlights(sky.nightFactor, lightsManual, rawDt);
    audio.update(dt, {
      timeOfDay, nightFactor: sky.nightFactor, playerPos,
      speed: driver.speed, onFoot: foot, nearFire: nearFire(),
    });

    const actors = foot || aboard
      ? []
      : [{ pos: driver.pos, vehId: currentVehId, actorId: 'host' }];
    for (const [id, car] of remotes.cars) {
      actors.push({ pos: car.pos, vehId: car.vehicle.entry.id, actorId: id });
    }
    zone.update(rawDt, actors, session.role !== 'guest');
    const net = zone.takeNet();
    if (net) session.broadcast(net);
    if (zone.state !== prevRaceState) {
      if (zone.state === 'racing') audio.beep('go');
      else if (zone.state === 'done') audio.beep('chime');
      prevRaceState = zone.state;
      prevCd = -1;
    }
    if (zone.state === 'countdown') {
      const cd = Math.ceil(zone.timer);
      if (cd >= 1 && cd <= 3 && cd !== prevCd) {
        audio.beep('tick');
        prevCd = cd;
      }
    }
    updateRaceHud(zone);

    const restAnchor = !aboard && !sleeping && zone.state === 'idle' && sky.nightFactor > REST.nightMin
      ? nearestRestAnchor()
      : null;
    restAvailable = !!restAnchor;
    const atTent = restAnchor && restAnchor.kind === 'tent';

    let nextHint = null;
    let nextKind = null;
    if (aboard && boat) {
      if (now - landingCheck > 250) {
        landingCheck = now;
        landingCache = boat.findLanding();
      }
      nextHint = landingCache ? 'F — step ashore' : 'Row closer to shore to get out';
      nextKind = 'f';
    } else if (foot) {
      if (walker.pose !== 'stand') {
        if (restAvailable) {
          nextHint = touch.isTouch
            ? (atTent ? 'Tap to camp until morning · F — stand' : 'Tap to rest until morning · F — stand')
            : (atTent ? 'E — camp until morning · F — stand' : 'E — rest until morning · F — stand');
          nextKind = 'rest';
        } else {
          nextHint = 'F — stand';
          nextKind = 'f';
        }
      } else if (boat && boat.canBoard(walker.pos) && zone.state === 'idle') {
        nextHint = 'F — board canoe';
        nextKind = 'f';
      } else {
        const ent = nearestEnterable();
        if (ent) {
          nextHint = ent.kind === 'truck' ? 'F — get in' : `F — enter ${vehName(GARAGE[ent.index].id)}`;
          nextKind = 'f';
        } else if (restAvailable) {
          const verb = atTent ? 'camp' : 'rest';
          const fireNear = nearFire() && sky.nightFactor > REST.nightMin;
          nextHint = fireNear
            ? (touch.isTouch ? `Tap to ${verb} · F — sit` : `E — ${verb} until morning · F — sit by the fire`)
            : (touch.isTouch ? `Tap to ${verb} until morning` : `E — ${verb} until morning`);
          nextKind = 'rest';
        } else {
          nextHint = (nearFire() && sky.nightFactor > REST.nightMin)
            ? 'F — sit by the fire' : 'F — sit';
          nextKind = 'f';
        }
      }
    } else if (restAvailable) {
      nextHint = touch.isTouch
        ? (atTent ? 'Tap to camp until morning' : 'Tap to rest until morning')
        : (atTent ? 'E — camp until morning' : 'E — rest until morning');
      nextKind = 'rest';
    } else if (zone.state === 'idle' && Math.abs(driver.speed) < FOOT.exitMaxSpeed) {
      nextHint = 'F — get out';
      nextKind = 'f';
    }
    if (nextHint !== hintText || nextKind !== hintKind) {
      hintText = nextHint;
      hintKind = nextKind;
      setHint(hintText);
    }

    sendAcc += rawDt;
    if (sendAcc >= 1 / 15) {
      sendAcc = 0;
      if (session.role !== 'solo') {
        const msg = {
          t: 's',
          x: +driver.pos.x.toFixed(2), y: +driver.y.toFixed(2), z: +driver.pos.z.toFixed(2),
          yaw: +driver.yaw.toFixed(3), spd: +driver.speed.toFixed(2), veh: currentVehId,
        };
        if (foot) {
          msg.f = 1;
          msg.wx = +walker.pos.x.toFixed(2);
          msg.wy = +walker.pos.y.toFixed(2);
          msg.wz = +walker.pos.z.toFixed(2);
          msg.wyaw = +walker.yaw.toFixed(3);
        } else if (aboard && boat) {
          msg.b = 1;
          msg.bx = +boat.pos.x.toFixed(2);
          msg.by = +boat.pos.y.toFixed(2);
          msg.bz = +boat.pos.z.toFixed(2);
          msg.byaw = +boat.yaw.toFixed(3);
        }
        session.sendState(msg);
      }
    }
    timeAcc += rawDt;
    if (timeAcc >= 0.5) {
      timeAcc = 0;
      if (session.role === 'host') session.broadcast({ t: 'tm', ph: +timeOfDay.toFixed(4) });
    }

    map.update(now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    map.resize();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  document.getElementById('loading').classList.add('hidden');
  window.__game = {
    driver, sky, traffic, scene, camera, renderer,
    session, remotes, zone, animals, touch, walker, terrain, water,
    region: () => currentRegion,
    regionProps: () => regionProps,
    structures: () => structures,
    sites: () => sites,
    getTime: () => timeOfDay,
    setTime: (v) => { timeOfDay = v; timeTarget = null; },
    getVehicle: () => vehicle,
    lightsMode: () => lightsManual,
    restReady: () => restAvailable,
    restKind: () => (restAvailable ? nearestRestAnchor()?.kind ?? null : null),
    restSpots: () => cabins.map((c) => ({ x: c.x, z: c.z })),
    campSpots: () => tents.map((t) => ({ x: t.x, z: t.z })),
    sight: () => ({
      counts: { ...props.userData.counts },
      tents: tents.map((t) => ({ x: t.x, z: t.z })),
      signs: props.userData.signs.map((s) => ({ x: s.x, z: s.z })),
      cabins: cabins.map((c) => ({ x: c.x, z: c.z, yaw: c.cabin.rotation.y })),
    }),
    onFoot: () => foot,
    aboard: () => aboard,
    boat: () => boat,
    landing: () => (boat ? boat.findLanding() : null),
    map,
    footAction,
    fires: () => props.userData.fires.map((f) => ({ x: f.x, z: f.z, y: f.y })),
    flowers: () => {
      const g = props.getObjectByName('flowers');
      return g ? g.count : 0;
    },
    hint: () => hintText,
    audio: () => ({ ...audio.state(), toggle: toggleMute }),
    atmosphere: () => ({
      counts: atmosphere.counts(),
      flags: atmosphere.flags,
      visible: atmosphere.visible(),
      group: atmosphere.group,
      star: atmosphere.starState(),
      fireStar: () => atmosphere.fireStar(),
    }),
    garage: () => garage.slots.map((s) => ({ id: s.id, index: s.index, x: s.x, z: s.z })),
    parked: () => [...parked.keys()],
  };
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  el.textContent = 'Failed to start: ' + err.message;
});
