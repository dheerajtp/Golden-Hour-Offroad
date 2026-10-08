import * as THREE from 'three';
import { PALETTE, WORLD } from '../config.js';
import { loadCar } from '../vehicle/assets.js';

const START_RADIUS = 7;
const GO_RADIUS = 14;
const FINISH_RADIUS = 4.5;
const COUNTDOWN = 3;
const RACE_TIMEOUT = 300;

function gateGroup(terrain, tp, isFinish) {
  const g = new THREE.Group();
  const yaw = Math.atan2(tp.tan.x, tp.tan.z);
  g.position.set(tp.pos.x, 0, tp.pos.z);
  g.rotation.y = yaw;
  const y = terrain.heightAt(tp.pos.x, tp.pos.z);
  const span = WORLD.trailHalfWidth + 1.4;

  const poleGeo = new THREE.CylinderGeometry(0.13, 0.13, 3.6, 6);
  poleGeo.translate(0, 1.8, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.cabinRoof });
  for (const sx of [-span, span]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(sx, y, 0);
    pole.castShadow = true;
    g.add(pole);
  }

  if (isFinish) {
    const segs = 8;
    const segW = (span * 2) / segs;
    for (let i = 0; i < segs; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(segW, 0.4, 0.3),
        new THREE.MeshLambertMaterial({ color: i % 2 ? 0x2b2b2b : 0xe8e2d0 }),
      );
      m.position.set(-span + segW * (i + 0.5), y + 3.5, 0);
      m.castShadow = true;
      g.add(m);
    }
  } else {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(span * 2, 0.35, 0.3),
      new THREE.MeshLambertMaterial({ color: PALETTE.rock }),
    );
    bar.position.set(0, y + 3.5, 0);
    bar.castShadow = true;
    g.add(bar);
  }
  return g;
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class RaceZone {
  constructor(terrain, scene, uStart = 0.33, uEnd = 0.45) {
    this.terrain = terrain;
    this.start = terrain.trailPoint(uStart);
    this.end = terrain.trailPoint(uEnd);
    this.start.y = terrain.heightAt(this.start.pos.x, this.start.pos.z);
    this.end.y = terrain.heightAt(this.end.pos.x, this.end.pos.z);
    this.state = 'idle';
    this.timer = 0;
    this.raceTime = 0;
    this.cooldown = 0;
    this.goFlash = 0;
    this.pendingNet = null;
    this.onResult = null;
    this.result = null;

    scene.add(gateGroup(terrain, this.start, false));
    scene.add(gateGroup(terrain, this.end, true));
    loadCar('cone.glb').then((cone) => {
      for (const tp of [this.start, this.end]) {
        for (const side of [-1, 1]) {
          const c = cone.clone(true);
          c.scale.setScalar(1.4);
          c.position.set(
            tp.pos.x + Math.cos(Math.atan2(tp.tan.x, tp.tan.z)) * side * (WORLD.trailHalfWidth + 0.6),
            tp.y,
            tp.pos.z - Math.sin(Math.atan2(tp.tan.x, tp.tan.z)) * side * (WORLD.trailHalfWidth + 0.6),
          );
          c.rotation.y = Math.atan2(tp.tan.x, tp.tan.z);
          c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          scene.add(c);
        }
      }
    });
  }

  #near(gate, pos, r) {
    return dist2D(pos, gate.pos) < r;
  }

  #set(state, net) {
    this.state = state;
    if (state === 'done') this.timer = 6;
    if (net) this.pendingNet = { t: 'race', ...net };
  }

  update(dt, actors, canTrigger) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.goFlash = Math.max(0, this.goFlash - dt);

    if (this.state === 'done') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.result = null;
        this.state = 'idle';
        if (canTrigger) this.pendingNet = { t: 'race', st: 'reset' };
      }
      return;
    }

    if (!canTrigger) {
      if (this.state === 'countdown') this.timer -= dt;
      if (this.state === 'racing') this.raceTime += dt;
      return;
    }

    const atStart = actors.some((a) => this.#near(this.start, a.pos, START_RADIUS));

    if (this.state === 'idle') {
      if (this.cooldown <= 0 && atStart) {
        this.timer = COUNTDOWN;
        this.result = null;
        this.#set('countdown', { st: 'cd' });
      }
    } else if (this.state === 'countdown') {
      this.timer -= dt;
      if (this.timer <= 0) {
        const still = actors.some((a) => this.#near(this.start, a.pos, GO_RADIUS));
        if (still) {
          this.raceTime = 0;
          this.goFlash = 1;
          this.#set('racing', { st: 'go' });
        } else {
          this.#set('idle', { st: 'cancel' });
        }
      }
    } else if (this.state === 'racing') {
      this.raceTime += dt;
      for (const a of actors) {
        if (this.#near(this.end, a.pos, FINISH_RADIUS)) {
          this.result = { actorId: a.actorId, veh: a.vehId, time: this.raceTime };
          this.cooldown = 5;
          this.#set('done', {
            st: 'res', actorId: a.actorId, veh: a.vehId, time: +this.raceTime.toFixed(2),
          });
          if (this.onResult) this.onResult(this.result, actors, false);
          break;
        }
      }
      if (this.state === 'racing' && this.raceTime > RACE_TIMEOUT) {
        this.#set('idle', { st: 'cancel' });
      }
    }
  }

  applyNet(msg) {
    if (msg.st === 'cd') {
      this.result = null;
      this.state = 'countdown';
      this.timer = COUNTDOWN;
    } else if (msg.st === 'go') {
      this.state = 'racing';
      this.raceTime = 0;
      this.goFlash = 1;
    } else if (msg.st === 'cancel') {
      this.state = 'idle';
    } else if (msg.st === 'res') {
      this.cooldown = 5;
      this.#set('done', null);
      this.result = { actorId: msg.actorId, veh: msg.veh, time: msg.time };
      if (this.onResult) this.onResult(this.result, null, true);
    } else if (msg.st === 'reset') {
      this.state = 'idle';
    }
  }

  takeNet() {
    const m = this.pendingNet;
    this.pendingNet = null;
    return m;
  }
}
