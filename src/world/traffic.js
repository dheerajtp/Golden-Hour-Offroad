import { GARAGE } from '../config.js';
import { createTruck } from '../vehicle/truck.js';

const ROUTES = [
  { u: 0.0, dir: 1, speed: 6.5, entry: 2 },
  { u: 0.33, dir: -1, speed: 5.8, entry: 1 },
  { u: 0.58, dir: 1, speed: 7.2, entry: 2 },
  { u: 0.8, dir: -1, speed: 6.0, entry: 0 },
];

export class Traffic {
  constructor(terrain) {
    this.terrain = terrain;
    this.units = [];
    this.ready = false;
  }

  async load() {
    this.units = [];
    for (const r of ROUTES) {
      const vehicle = await createTruck(GARAGE[r.entry]);
      vehicle.root.scale.setScalar(1);
      this.units.push({ ...r, vehicle, u: r.u });
    }
    this.ready = true;
  }

  update(dt, nightFactor = 0) {
    if (!this.ready) return;
    const L = this.terrain.trailLength;
    for (const unit of this.units) {
      unit.u = (unit.u + (unit.dir * unit.speed * dt) / L + 1) % 1;
      const t = this.terrain.trailPoint(unit.u);
      const dirX = t.tan.x * unit.dir;
      const dirZ = t.tan.z * unit.dir;
      unit.vehicle.root.position.set(t.pos.x, t.y, t.pos.z);
      unit.vehicle.root.rotation.y = Math.atan2(dirX, dirZ);
      unit.vehicle.spinWheels(dt, unit.speed);
      unit.vehicle.setHeadlights(nightFactor, null, dt);
    }
  }
}
