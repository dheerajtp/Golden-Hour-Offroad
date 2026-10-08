import { REGIONS } from '../config.js';

function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

// Per-region weights at (x,z), normalized when blends overlap. Empty = default autumn.
export function regionWeights(x, z) {
  const out = [];
  let sum = 0;
  for (const [name, R] of Object.entries(REGIONS)) {
    const w = smooth(1 - (Math.hypot(x - R.x, z - R.z) - R.r) / R.blend);
    if (w > 0) { out.push({ name, w }); sum += w; }
  }
  if (sum > 1) for (const o of out) o.w /= sum;
  return out;
}

// Dominant region with w > 0.5, else 'autumn'.
export function regionAt(x, z) {
  let best = { name: 'autumn', w: 0 };
  for (const o of regionWeights(x, z)) if (o.w > 0.5 && o.w > best.w) best = o;
  return best.name;
}

export function weightOf(name, x, z) {
  return regionWeights(x, z).find((o) => o.name === name)?.w ?? 0;
}
