import { GARAGE } from '../config.js';
import { createTruck } from '../vehicle/truck.js';
import { makePerson } from '../vehicle/foot.js';

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class RemoteCars {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.cars = new Map();
  }

  async ensure(id, vehicleId) {
    if (this.cars.has(id)) {
      const existing = this.cars.get(id);
      if (existing.vehicle.entry.id === vehicleId) return;
      existing.vehicle.root.removeFromParent();
      existing.avatar.removeFromParent();
      this.cars.delete(id);
    }
    const entry = GARAGE.find((g) => g.id === vehicleId) || GARAGE[0];
    const vehicle = await createTruck(entry);
    this.scene.add(vehicle.root);
    const avatar = makePerson();
    avatar.visible = false;
    this.scene.add(avatar);
    this.cars.set(id, {
      vehicle,
      avatar,
      pos: vehicle.root.position.clone(),
      yaw: 0,
      targetPos: null,
      targetYaw: 0,
      speed: 0,
      seen: false,
      onFoot: false,
      footPos: null,
      footYaw: 0,
      footPhase: 0,
      bob: 0,
    });
  }

  applyState(id, s) {
    const car = this.cars.get(id);
    if (!car) return;
    if (!car.seen) {
      car.pos.set(s.x, s.y, s.z);
      car.yaw = s.yaw;
      car.seen = true;
    }
    car.targetPos = { x: s.x, y: s.y, z: s.z };
    car.targetYaw = s.yaw;
    car.speed = s.spd;
    if (s.f) {
      if (!car.footPos) car.footPos = { x: s.wx, y: s.wy, z: s.wz };
      car.onFoot = true;
      car.footTarget = { x: s.wx, y: s.wy, z: s.wz };
      car.footYaw = s.wyaw;
      if (!car.avatar.visible) {
        car.avatar.visible = true;
        car.avatar.position.set(s.wx, s.wy, s.wz);
        car.avatar.rotation.y = s.wyaw;
      }
    } else if (car.onFoot) {
      car.onFoot = false;
      car.footTarget = null;
      car.avatar.visible = false;
    }
  }

  update(dt, nightFactor = 0) {
    const k = 1 - Math.exp(-9 * dt);
    const ky = 1 - Math.exp(-7 * dt);
    for (const car of this.cars.values()) {
      car.vehicle.setHeadlights(nightFactor, null, dt);
      if (car.targetPos) {
        car.pos.x += (car.targetPos.x - car.pos.x) * k;
        car.pos.y += (car.targetPos.y - car.pos.y) * k;
        car.pos.z += (car.targetPos.z - car.pos.z) * k;
        car.yaw += shortestAngle(car.yaw, car.targetYaw) * ky;
        car.vehicle.root.position.copy(car.pos);
        car.vehicle.root.rotation.y = car.yaw;
        car.vehicle.spinWheels(dt, car.speed);
      }
      if (car.onFoot && car.footPos && car.footTarget) {
        const before = { x: car.footPos.x, z: car.footPos.z };
        car.footPos.x += (car.footTarget.x - car.footPos.x) * k;
        car.footPos.y += (car.footTarget.y - car.footPos.y) * k;
        car.footPos.z += (car.footTarget.z - car.footPos.z) * k;
        const moved = Math.hypot(car.footPos.x - before.x, car.footPos.z - before.z);
        car.footPhase += moved * 4.5;
        const yaw = car.avatar.rotation.y + shortestAngle(car.avatar.rotation.y, car.footYaw) * ky;
        const swing = Math.min(0.7, moved * 18);
        const u = car.avatar.userData;
        u.legs[0].rotation.x = Math.sin(car.footPhase) * swing;
        u.legs[1].rotation.x = -Math.sin(car.footPhase) * swing;
        u.arms[0].rotation.x = -Math.sin(car.footPhase) * swing * 0.5;
        u.arms[1].rotation.x = Math.sin(car.footPhase) * swing * 0.5;
        car.bob += (Math.abs(Math.sin(car.footPhase)) * 0.06 - car.bob) * k;
        car.avatar.position.set(car.footPos.x, car.footPos.y + car.bob, car.footPos.z);
        car.avatar.rotation.y = yaw;
      }
    }
  }

  remove(id) {
    const car = this.cars.get(id);
    if (!car) return;
    car.vehicle.root.removeFromParent();
    car.avatar.removeFromParent();
    this.cars.delete(id);
  }

  clear() {
    for (const id of [...this.cars.keys()]) this.remove(id);
  }
}
