const BASE = 600; // one base pixel per world metre
const MINI_METRES = 56;
const REDRAW_MS = 100;

const COLORS = {
  garage: '#f0c060',
  cabin: '#e6c79a',
  tent: '#e8915a',
  site: '#f4e6cc',
  canoe: '#74d8ea',
  remote: '#c39bf0',
  player: '#fff4dc',
  ink: '#1a2238',
};

function worldToBase(v, half) {
  return v + half;
}

export function initMap(opts) {
  const { terrain } = opts;
  const mini = document.getElementById('minimap');
  const full = document.getElementById('mapFull');
  const fullCanvas = document.getElementById('mapCanvas');
  const closeBtn = document.getElementById('mapClose');
  if (!mini || !full || !fullCanvas || !closeBtn) {
    return { update() {}, toggle() {}, resize() {}, isOpen: () => false };
  }

  const half = terrain.size / 2;
  const n = terrain.n;
  const cell = terrain.cell;
  const colors = terrain.colors;

  const staticMarks = [];
  for (const s of opts.garage || []) staticMarks.push({ x: s.x, z: s.z, kind: 'garage' });
  for (const c of opts.cabins || []) staticMarks.push({ x: c.x, z: c.z, kind: 'cabin' });
  for (const t of opts.tents || []) staticMarks.push({ x: t.x, z: t.z, kind: 'tent' });
  for (const [name, s] of Object.entries(opts.sites || {})) {
    if (s) staticMarks.push({ x: s.x, z: s.z, kind: 'site', label: name[0].toUpperCase() + name.slice(1) });
  }
  let garageX = 0;
  let garageZ = 0;
  let garageN = 0;
  for (const s of opts.garage || []) { garageX += s.x; garageZ += s.z; garageN++; }
  if (garageN) {
    garageX /= garageN;
    garageZ /= garageN;
    staticMarks.push({ x: garageX, z: garageZ, kind: 'garage', label: 'Garage' });
  }

  const base = document.createElement('canvas');
  base.width = BASE;
  base.height = BASE;
  const bctx = base.getContext('2d');
  const img = bctx.createImageData(BASE, BASE);
  const data = img.data;
  const heights = new Float32Array(BASE * BASE);

  for (let py = 0; py < BASE; py++) {
    const z = -half + py + 0.5;
    for (let px = 0; px < BASE; px++) {
      const x = -half + px + 0.5;
      heights[py * BASE + px] = terrain.heightAt(x, z);
    }
  }

  for (let py = 0; py < BASE; py++) {
    const z = -half + py + 0.5;
    for (let px = 0; px < BASE; px++) {
      const x = -half + px + 0.5;
      const idx = py * BASE + px;
      const h = heights[idx];
      const gx = Math.max(0, Math.min(n - 1, Math.round((x + half) / cell)));
      const gz = Math.max(0, Math.min(n - 1, Math.round((z + half) / cell)));
      const k = (gz * n + gx) * 3;
      let r = Math.pow(colors[k], 0.4545);
      let g = Math.pow(colors[k + 1], 0.4545);
      let b = Math.pow(colors[k + 2], 0.4545);

      const hx0 = heights[px > 0 ? idx - 1 : idx];
      const hx1 = heights[px < BASE - 1 ? idx + 1 : idx];
      const hz0 = heights[py > 0 ? idx - BASE : idx];
      const hz1 = heights[py < BASE - 1 ? idx + BASE : idx];
      const shade = Math.max(0.7, Math.min(1.22, 1 - ((hx1 - hx0) + (hz1 - hz0)) * 0.09));
      r *= shade;
      g *= shade;
      b *= shade;

      const tw = terrain.trailWeightAt(x, z);
      if (tw > 0.05) {
        const t = Math.min(0.85, tw * 1.1);
        r = r * (1 - t) + 0.52 * t;
        g = g * (1 - t) + 0.42 * t;
        b = b * (1 - t) + 0.29 * t;
      }

      const surf = terrain.waterLevelAt(x, z);
      if (surf != null) {
        const depth = Math.min(1, Math.max(0, (surf - h) / 2.2));
        r = 0.12 + 0.16 * (1 - depth);
        g = 0.31 + 0.23 * (1 - depth);
        b = 0.45 + 0.26 * (1 - depth);
      }

      const o = idx * 4;
      data[o] = Math.min(255, r * 255);
      data[o + 1] = Math.min(255, g * 255);
      data[o + 2] = Math.min(255, b * 255);
      data[o + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);

  let open = false;
  let last = 0;

  function dpr() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  function marker(ctx, x, y, kind, size, dim) {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(12, 16, 28, 0.75)';
    if (kind === 'garage') {
      ctx.fillStyle = COLORS.garage;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    } else if (kind === 'cabin') {
      ctx.fillStyle = COLORS.cabin;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'tent') {
      ctx.fillStyle = COLORS.tent;
      ctx.beginPath();
      ctx.moveTo(x, y - size * 0.55);
      ctx.lineTo(x + size * 0.55, y + size * 0.4);
      ctx.lineTo(x - size * 0.55, y + size * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'site') {
      ctx.fillStyle = COLORS.site;
      ctx.beginPath();
      ctx.moveTo(x, y - size * 0.62);
      ctx.lineTo(x + size * 0.62, y);
      ctx.lineTo(x, y + size * 0.62);
      ctx.lineTo(x - size * 0.62, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'canoe') {
      ctx.fillStyle = COLORS.canoe;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'remote') {
      ctx.fillStyle = COLORS.remote;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (dim) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function arrow(ctx, x, y, yaw, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - yaw);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.62, size * 0.7);
    ctx.lineTo(0, size * 0.35);
    ctx.lineTo(-size * 0.62, size * 0.7);
    ctx.closePath();
    ctx.fillStyle = COLORS.player;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(20, 24, 38, 0.85)';
    ctx.stroke();
    ctx.restore();
  }

  function drawMini() {
    const css = mini.getBoundingClientRect().width || 132;
    const d = dpr();
    const px = Math.max(1, Math.round(css * d));
    if (mini.width !== px) {
      mini.width = px;
      mini.height = px;
    }
    const ctx = mini.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, css, css);

    const p = opts.getPlayer();
    const scale = css / MINI_METRES;
    const bx = worldToBase(p.x, half);
    const bz = worldToBase(p.z, half);
    const sw = Math.min(MINI_METRES, BASE);
    const sx = Math.max(0, Math.min(BASE - sw, bx - sw / 2));
    const sy = Math.max(0, Math.min(BASE - sw, bz - sw / 2));
    ctx.drawImage(base, sx, sy, sw, sw, 0, 0, css, css);

    const mapX = (x) => (worldToBase(x, half) - sx) * scale;
    const mapY = (z) => (worldToBase(z, half) - sy) * scale;

    for (const m of staticMarks) {
      const x = mapX(m.x);
      const y = mapY(m.z);
      if (x < -6 || y < -6 || x > css + 6 || y > css + 6) continue;
      marker(ctx, x, y, m.kind, m.kind === 'garage' ? 5 : 4.5);
    }
    const canoe = opts.getCanoe();
    if (canoe) {
      const x = mapX(canoe.x);
      const y = mapY(canoe.z);
      if (x > -6 && y > -6 && x < css + 6 && y < css + 6) marker(ctx, x, y, 'canoe', 5.5);
    }
    for (const r of opts.getRemotes() || []) {
      const x = mapX(r.x);
      const y = mapY(r.z);
      if (x > -6 && y > -6 && x < css + 6 && y < css + 6) marker(ctx, x, y, 'remote', 4.5);
    }
    arrow(ctx, mapX(p.x), mapY(p.z), p.yaw, 7);

    ctx.strokeStyle = 'rgba(255, 220, 180, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, css - 1, css - 1);
  }

  function fullSize() {
    const w = window.innerWidth - 40;
    const h = window.innerHeight - 96;
    return Math.max(220, Math.min(920, Math.min(w, h)));
  }

  function drawFull() {
    const css = fullSize();
    const d = dpr();
    const px = Math.round(css * d);
    if (fullCanvas.width !== px) {
      fullCanvas.width = px;
      fullCanvas.height = px;
      fullCanvas.style.width = css + 'px';
      fullCanvas.style.height = css + 'px';
    }
    const ctx = fullCanvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, css, css);
    ctx.drawImage(base, 0, 0, BASE, BASE, 0, 0, css, css);
    const scale = css / BASE;
    const mapX = (x) => worldToBase(x, half) * scale;
    const mapY = (z) => worldToBase(z, half) * scale;

    for (const m of staticMarks) {
      const x = mapX(m.x);
      const y = mapY(m.z);
      marker(ctx, x, y, m.kind, m.kind === 'site' ? 8 : 6.5);
      if (m.label && m.kind === 'site') {
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(12, 16, 28, 0.72)';
        ctx.fillText(m.label, x + 8, y + 4);
        ctx.fillStyle = '#f4e6cc';
        ctx.fillText(m.label, x + 7, y + 3);
      }
    }
    const garage = staticMarks.find((m) => m.kind === 'garage' && m.label);
    if (garage) {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(12, 16, 28, 0.72)';
      ctx.fillText('Garage', mapX(garage.x) + 8, mapY(garage.z) + 4);
      ctx.fillStyle = '#f4e6cc';
      ctx.fillText('Garage', mapX(garage.x) + 7, mapY(garage.z) + 3);
    }
    const canoe = opts.getCanoe();
    if (canoe) {
      marker(ctx, mapX(canoe.x), mapY(canoe.z), 'canoe', 7);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(12, 16, 28, 0.72)';
      ctx.fillText('Canoe', mapX(canoe.x) + 8, mapY(canoe.z) + 4);
      ctx.fillStyle = '#f4e6cc';
      ctx.fillText('Canoe', mapX(canoe.x) + 7, mapY(canoe.z) + 3);
    }
    for (const r of opts.getRemotes() || []) {
      marker(ctx, mapX(r.x), mapY(r.z), 'remote', 6.5);
    }
    const p = opts.getPlayer();
    arrow(ctx, mapX(p.x), mapY(p.z), p.yaw, 10);

    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 240, 220, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('N', css / 2, 16);
    ctx.beginPath();
    ctx.moveTo(css / 2, 20);
    ctx.lineTo(css / 2 - 4, 28);
    ctx.lineTo(css / 2 + 4, 28);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = 'start';
  }

  function draw() {
    drawMini();
    if (open) drawFull();
  }

  function update(now) {
    if (now - last < REDRAW_MS) return;
    last = now;
    draw();
  }

  function show() {
    open = true;
    full.classList.remove('hidden');
    document.body.classList.add('map-open');
    drawFull();
  }

  function hide() {
    open = false;
    full.classList.add('hidden');
    document.body.classList.remove('map-open');
  }

  function toggle() {
    if (open) hide();
    else show();
  }

  mini.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  mini.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    show();
  });
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    hide();
  });
  full.addEventListener('click', (e) => {
    if (e.target === full) hide();
  });
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.repeat) return;
    if (e.code === 'KeyP') {
      e.preventDefault();
      toggle();
    } else if (e.code === 'Escape' && open) {
      hide();
    }
  });

  drawMini();

  return {
    update,
    toggle,
    resize: () => { last = 0; draw(); },
    isOpen: () => open,
    base: () => base,
  };
}
