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
import { Session } from './net/session.js';
import { RemoteCars } from './net/remoteCars.js';
import { initHud, updateRaceHud, toast, setHint } from './ui/hud.js';
import { initTouch } from './ui/touchControls.js';

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
  buildStructures(terrain, sites).then((g) => { structures = g; scene.add(g); });
  let regionProps = null;
  buildRegionProps(terrain).then((g) => { regionProps = g; scene.add(g); });
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
  const cabins = props.userData.cabins;
  const tents = props.userData.tents;
  const fadeEl = document.getElementById('fade');
  const restHintEl = document.getElementById('restHint');

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
      walker.pose = 'stand';
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

  function performRest() {
    if (zone.state !== 'idle') return;
    const kind = nearestRestAnchor()?.kind;
    fadeThen(() => {
      timeOfDay = REST.targetPhase;
      timeTarget = null;
      if (session.role === 'host') session.broadcast({ t: 'tm', ph: +timeOfDay.toFixed(4) });
      toast(kind === 'tent' ? 'Camped until morning' : 'Rested until morning');
    });
  }

  function tryRest() {
    if (!restAvailable) return;
    if (zone.state !== 'idle') { toast('Race in progress'); return; }
    audio.click('rest');
    const kind = nearestRestAnchor()?.kind;
    if (session.role === 'guest') {
      session.sendRest();
      fadeThen(() => toast(kind === 'tent' ? 'Camped until morning' : 'Rested until morning'));
    } else {
      performRest();
    }
  }

  session.on('rest', performRest);

  function playerPos() {
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

  function footAction() {
    if (!foot) {
      if (Math.abs(driver.speed) > FOOT.exitMaxSpeed) return;
      if (zone.state !== 'idle') { toast('Race in progress'); return; }
      driver.speed = 0;
      const rx = -Math.cos(driver.yaw);
      const rz = Math.sin(driver.yaw);
      walker.spawn(driver.pos.x + rx * 1.7, driver.pos.z + rz * 1.7, driver.yaw);
      scene.add(walker.mesh);
      foot = true;
      audio.click('foot');
      return;
    }
    if (walker.pose === 'stand') {
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
      walker.pose = 'sit'; // sit anywhere
    } else if (walker.pose === 'sit') {
      walker.pose = 'lie';
    } else {
      walker.pose = 'stand';
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

  const touch = initTouch(driver, {
    switchTruck,
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
    const m = /^Digit([1-3])$/.exec(e.code);
    if (m) switchTruck(Number(m[1]) - 1);
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
        || (!foot && Math.abs(driver.speed) < FOOT.exitMaxSpeed);
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
    if (foot) walker.update(dt, driver.keys);
    else driver.update(dt);
    const camPos = playerPos();
    const camYaw = foot ? walker.yaw : driver.yaw;
    const camMode = foot ? (walker.pose === 'stand' ? 'walk' : walker.pose) : 'drive';
    let camFrame = null;
    if (foot && camMode === 'walk') {
      let nd = Infinity;
      for (const c of cabins) nd = Math.min(nd, Math.hypot(camPos.x - c.x, camPos.z - c.z));
      for (const t of tents) nd = Math.min(nd, Math.hypot(camPos.x - t.x, camPos.z - t.z));
      if (nd < 7) camFrame = { back: 2.1, up: 1.5 };
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

    const actors = foot
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

    const restAnchor = zone.state === 'idle' && sky.nightFactor > REST.nightMin
      ? nearestRestAnchor()
      : null;
    restAvailable = !!restAnchor;
    const atTent = restAnchor && restAnchor.kind === 'tent';

    let nextHint = null;
    let nextKind = null;
    if (foot) {
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
        }
        session.sendState(msg);
      }
    }
    timeAcc += rawDt;
    if (timeAcc >= 0.5) {
      timeAcc = 0;
      if (session.role === 'host') session.broadcast({ t: 'tm', ph: +timeOfDay.toFixed(4) });
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

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
