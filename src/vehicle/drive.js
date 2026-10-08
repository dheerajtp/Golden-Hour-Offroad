import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class Driver {
  constructor(terrain) {
    this.terrain = terrain;
    this.vehicle = null;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.turn = 0;
    this.y = 0;
    this.vy = 0;
    this.pitch = 0;
    this.roll = 0;
    this.travel = 0;
    this.keys = new Set();
    this.onKeyDown = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      this.keys.delete(e.code);
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  attach(vehicle) {
    this.vehicle = vehicle;
  }

  spawn(u) {
    const t = this.terrain.trailPoint(u);
    this.pos.set(t.pos.x, t.y, t.pos.z);
    this.yaw = Math.atan2(t.tan.x, t.tan.z);
    this.y = t.y;
    this.speed = 0;
    this.vy = 0;
    this.applyTransform();
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get right() {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  applyTransform() {
    if (!this.vehicle) return;
    this.vehicle.root.position.set(this.pos.x, this.y, this.pos.z);
    this.vehicle.root.rotation.y = this.yaw;
    this.vehicle.chassis.rotation.x = this.pitch;
    this.vehicle.chassis.rotation.z = this.roll;
  }

  update(dt) {
    if (!this.vehicle) return;
    const h = this.vehicle.handling;
    const k = this.keys;
    const up = k.has('KeyW') || k.has('ArrowUp');
    const down = k.has('KeyS') || k.has('ArrowDown');
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');

    const steerIn = (right ? 1 : 0) - (left ? 1 : 0);
    this.turn += (steerIn - this.turn) * (1 - Math.exp(-9 * dt));

    const trail = this.terrain.trailWeightAt(this.pos.x, this.pos.z);
    const grip = 0.55 + 0.45 * Math.min(1, trail * 1.6);
    const maxF = h.maxSpeed * grip;
    const maxR = -h.maxSpeed * 0.32;

    if (up) {
      this.speed += h.accel * grip * dt * Math.max(0, 1 - this.speed / maxF);
    } else if (down) {
      if (this.speed > 0.4) this.speed -= h.brake * dt;
      else this.speed -= h.reverseAccel * dt;
    } else {
      const eb = h.engineBrake * dt;
      if (Math.abs(this.speed) <= eb) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * eb;
    }
    this.speed -= this.speed * h.drag * dt;
    this.speed = Math.min(maxF, Math.max(maxR, this.speed));

    const moving = Math.abs(this.speed);
    const steerAuth = Math.min(1, moving / 6) * (moving > 0.25 ? 1 : moving / 0.25);
    if (moving > 0.05) {
      this.yaw -= this.turn * h.steerRate * steerAuth * dt * Math.sign(this.speed);
    }

    const f = this.forward;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.pos.x = Math.max(-285, Math.min(285, this.pos.x));
    this.pos.z = Math.max(-285, Math.min(285, this.pos.z));
    this.travel += moving * dt;

    const wb = this.vehicle.wheelBase;
    const tr = this.vehicle.track;
    const hf = this.terrain.heightAt(this.pos.x + f.x * wb * 0.5, this.pos.z + f.z * wb * 0.5);
    const hb = this.terrain.heightAt(this.pos.x - f.x * wb * 0.5, this.pos.z - f.z * wb * 0.5);
    const r = this.right;
    const hr = this.terrain.heightAt(this.pos.x + r.x * tr * 0.5, this.pos.z + r.z * tr * 0.5);
    const hl = this.terrain.heightAt(this.pos.x - r.x * tr * 0.5, this.pos.z - r.z * tr * 0.5);
    const avg = (hf + hb + hr + hl) / 4;

    const onTrail = trail > 0.5;
    const bump = Math.min(1, moving / 9) * (onTrail ? 0.25 : 1);
    const targetY = avg + Math.sin(this.travel * 6.5) * 0.09 * bump;

    this.vy += (targetY - this.y) * 130 * dt;
    this.vy *= Math.exp(-8.5 * dt);
    this.y += this.vy * dt;

    const pitchT = -Math.atan2(hf - hb, wb);
    const rollT = -Math.atan2(hr - hl, tr);
    const sm = 1 - Math.exp(-11 * dt);
    this.pitch += (pitchT - this.pitch) * sm;
    const lean = -this.turn * 0.055 * Math.min(1, moving / 10);
    this.roll += ((rollT + lean) - this.roll) * sm;

    this.pos.y = avg;
    this.applyTransform();
    this.vehicle.spinWheels(dt, this.speed);
    this.vehicle.setSteer(this.turn);
  }
}
