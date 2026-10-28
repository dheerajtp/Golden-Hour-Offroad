import * as THREE from 'three';
import { CAMERA, FOOT, BOAT } from '../config.js';

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class ChaseCam {
  constructor(camera, terrain) {
    this.camera = camera;
    this.terrain = terrain;
    this.camYaw = 0;
    this.look = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this.t = 0;
    this.mode = null;
  }

  snap(pos, yaw) {
    this.camYaw = yaw;
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.camera.position.set(
      pos.x - f.x * CAMERA.back,
      pos.y + CAMERA.up,
      pos.z - f.z * CAMERA.back,
    );
    this.look.set(pos.x + f.x * 4, pos.y + 1.6, pos.z + f.z * 4);
    this.camera.lookAt(this.look);
  }

  update(dt, pos, yaw, mode = 'drive', frame = null) {
    this.t += dt;
    const fPos = 1 - Math.exp(-6 * dt);
    const snap = this.mode !== mode;
    this.mode = mode;

    if (mode === 'sit' || mode === 'lie' || mode === 'sleep') {
      const eye = frame && frame.eye != null ? frame.eye : (mode === 'lie' ? 0.3 : 1.15);
      const pitch = frame && frame.pitch != null ? frame.pitch : 0;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const water = this.terrain.waterLevelAt(pos.x, pos.z);
      const eyeY = Math.max(pos.y + eye, water == null ? -Infinity : water + 0.15);
      this._desired.set(pos.x, eyeY, pos.z);
      if (snap) this.camera.position.copy(this._desired);
      else this.camera.position.lerp(this._desired, 1 - Math.exp(-16 * dt));
      const cp = Math.cos(pitch);
      this._lookTarget.set(
        this._desired.x + fx * cp * 10,
        this._desired.y + Math.sin(pitch) * 10,
        this._desired.z + fz * cp * 10,
      );
      this.look.copy(this._lookTarget);
      this.camera.lookAt(this.look);
      return;
    }

    if (mode === 'boat') {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      this._desired.set(pos.x - fx * BOAT.camBack, pos.y + BOAT.camUp, pos.z - fz * BOAT.camBack);
      const water = this.terrain.waterLevelAt(this._desired.x, this._desired.z);
      if (water != null && this._desired.y < water + 0.8) this._desired.y = water + 0.8;
      if (snap) this.camera.position.copy(this._desired);
      else this.camera.position.lerp(this._desired, fPos);
      this._lookTarget.set(pos.x + fx * 3, pos.y + 0.9, pos.z + fz * 3);
      this.look.lerp(this._lookTarget, 1 - Math.exp(-8 * dt));
      this.camera.lookAt(this.look);
      return;
    }

    const fYaw = 1 - Math.exp(-3.2 * dt);
    this.camYaw += shortestAngle(this.camYaw, yaw) * fYaw;

    const back = mode === 'walk' ? (frame ? frame.back : FOOT.camBack) : CAMERA.back;
    const up = mode === 'walk' ? (frame ? frame.up : FOOT.camUp) : CAMERA.up;

    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    this._desired.set(
      pos.x - f.x * back,
      pos.y + up,
      pos.z - f.z * back,
    );
    const ground = this.terrain.heightAt(this._desired.x, this._desired.z) + 1.4;
    if (this._desired.y < ground) this._desired.y = ground;

    this.camera.position.lerp(this._desired, fPos);

    this._lookTarget.set(pos.x + f.x * 4.5, pos.y + 1.7, pos.z + f.z * 4.5);
    this.look.lerp(this._lookTarget, 1 - Math.exp(-7 * dt));
    this.camera.lookAt(this.look);
  }
}
