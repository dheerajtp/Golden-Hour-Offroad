import * as THREE from 'three';
import { CAMERA, FOOT } from '../config.js';

const SIT_PITCH = (40 * Math.PI) / 180;
const LIE_PITCH = (65 * Math.PI) / 180;

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

    if (mode === 'sit' || mode === 'lie') {
      const pitch = mode === 'lie' ? LIE_PITCH : SIT_PITCH;
      const dist = mode === 'lie' ? 0.9 : 1.9;
      const drift = mode === 'lie' ? Math.sin(this.t * 0.06) * (8 * Math.PI) / 180 : 0;
      const cy = yaw + drift;
      const fx = Math.sin(cy);
      const fz = Math.cos(cy);
      const ground = this.terrain.heightAt(pos.x - fx * dist, pos.z - fz * dist);
      this._desired.set(
        pos.x - fx * dist,
        ground + (mode === 'lie' ? 0.35 : 0.65),
        pos.z - fz * dist,
      );
      this.camera.position.lerp(this._desired, fPos);
      this._lookTarget.set(
        this._desired.x + fx * Math.cos(pitch) * 10,
        this._desired.y + Math.sin(pitch) * 10,
        this._desired.z + fz * Math.cos(pitch) * 10,
      );
      this.look.lerp(this._lookTarget, 1 - Math.exp(-5 * dt));
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
