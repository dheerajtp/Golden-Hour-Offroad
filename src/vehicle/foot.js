import * as THREE from 'three';
import { FOOT } from '../config.js';

const SKIN = 0xe8b98a;
const JACKET = 0xb8442e;
const PANTS = 0x4a4238;
const CAP = 0xe8c23a;

function part(w, h, d, hex) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: hex }),
  );
  m.castShadow = true;
  return m;
}

export function makePerson() {
  const g = new THREE.Group();

  const torso = part(0.44, 0.6, 0.26, JACKET);
  torso.position.y = 1.05;
  g.add(torso);

  const head = part(0.26, 0.26, 0.26, SKIN);
  head.position.y = 1.5;
  g.add(head);

  const cap = part(0.29, 0.1, 0.29, CAP);
  cap.position.y = 1.67;
  g.add(cap);

  const legs = [];
  const arms = [];
  for (const sx of [-1, 1]) {
    const leg = part(0.16, 0.75, 0.18, PANTS);
    leg.geometry.translate(0, -0.375, 0);
    leg.position.set(sx * 0.11, 0.75, 0);
    g.add(leg);
    legs.push(leg);

    const arm = part(0.12, 0.55, 0.14, JACKET);
    arm.geometry.translate(0, -0.275, 0);
    arm.position.set(sx * 0.3, 1.32, 0);
    g.add(arm);
    arms.push(arm);
  }
  g.userData = { legs, arms, torso, head };
  return g;
}

export class Walker {
  constructor(terrain) {
    this.terrain = terrain;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pose = 'stand';
    this.phase = 0;
    this.crouch = 1;
    this.tilt = 0;
    this.mesh = makePerson();
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.terrain.heightAt(x, z), z);
    this.yaw = yaw;
    this.pose = 'stand';
    this.phase = 0;
    this.crouch = 1;
    this.tilt = 0;
    this.#poseMesh(0.0001);
  }

  update(dt, keys) {
    let move = 0;
    if (this.pose === 'stand') {
      const turn = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      this.yaw -= turn * 2.4 * dt;
      const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      if (fwd !== 0) {
        move = fwd * FOOT.walk * (fwd < 0 ? 0.6 : 1);
        const sx = Math.sin(this.yaw);
        const sz = Math.cos(this.yaw);
        this.pos.x = Math.max(-285, Math.min(285, this.pos.x + sx * move * dt));
        this.pos.z = Math.max(-285, Math.min(285, this.pos.z + sz * move * dt));
        this.phase += dt * 9 * Math.abs(move) / FOOT.walk;
      }
    }
    this.pos.y = this.terrain.heightAt(this.pos.x, this.pos.z);
    this.#poseMesh(dt, move);
  }

  #poseMesh(dt, move = 0) {
    const u = this.mesh.userData;
    const k = 1 - Math.exp(-10 * dt);
    const wantCrouch = this.pose === 'sit' ? 0.72 : 1;
    const wantTilt = this.pose === 'lie' ? -Math.PI / 2 : 0;
    this.crouch += (wantCrouch - this.crouch) * k;
    this.tilt += (wantTilt - this.tilt) * k;

    const swing = move !== 0 ? Math.sin(this.phase) * 0.6 : 0;
    u.legs[0].rotation.x += (swing - u.legs[0].rotation.x) * k;
    u.legs[1].rotation.x += (-swing - u.legs[1].rotation.x) * k;
    u.arms[0].rotation.x += (-swing * 0.5 - u.arms[0].rotation.x) * k;
    u.arms[1].rotation.x += (swing * 0.5 - u.arms[1].rotation.x) * k;

    const bob = move !== 0 ? Math.abs(Math.sin(this.phase)) * 0.06 : 0;
    this.mesh.position.set(
      this.pos.x,
      this.pos.y + bob + (this.pose === 'lie' ? 0.16 : 0),
      this.pos.z,
    );
    this.mesh.rotation.set(this.tilt, this.yaw, 0);
    this.mesh.scale.y = this.crouch;
  }
}
