import { AUDIO, WATER } from '../config.js';

const MUTE_KEY = 'gh4x-muted';
const TAU = Math.PI * 2;

function noiseBuffer(ac, seconds = 4) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02; // brown-ish noise
    d[i] = last * 3.2;
  }
  return buf;
}

export function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* private mode */ }

  let ac = null;
  let master = null;
  let windGain, windLp;
  let engGain, engOsc, engOsc2;
  let waterGain, waterLp, lapDepth;
  let fireGain;
  let cricketGate;
  let natureGain, uiGain;
  let noise = null;
  let started = false;
  let birdNext = 2 + Math.random() * 3;
  let fireNext = 0;
  let gustPhase = Math.random() * 10;

  function build() {
    ac = new AC();
    noise = noiseBuffer(ac);
    master = ac.createGain();
    master.gain.value = muted ? 0 : AUDIO.master;
    master.connect(ac.destination);

    const cat = (v) => {
      const g = ac.createGain();
      g.gain.value = v;
      g.connect(master);
      return g;
    };
    natureGain = cat(AUDIO.nature);
    uiGain = cat(AUDIO.ui * 0.3);

    // Wind: looped brown noise -> lowpass (gust-swept) -> gain
    windGain = cat(0);
    windLp = ac.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 320;
    windLp.Q.value = 0.4;
    const windSrc = ac.createBufferSource();
    windSrc.buffer = noise;
    windSrc.loop = true;
    windSrc.connect(windLp);
    windLp.connect(windGain);
    const windLfo = ac.createOscillator();
    windLfo.frequency.value = 0.05;
    const windLfoAmt = ac.createGain();
    windLfoAmt.gain.value = 140;
    windLfo.connect(windLfoAmt);
    windLfoAmt.connect(windLp.frequency);
    windSrc.start();
    windLfo.start();

    // Engine: saw + octave saw + filtered noise -> gain
    engGain = cat(0);
    engOsc = ac.createOscillator();
    engOsc.type = 'sawtooth';
    engOsc.frequency.value = 42;
    engOsc2 = ac.createOscillator();
    engOsc2.type = 'sawtooth';
    engOsc2.frequency.value = 84;
    const engLp = ac.createBiquadFilter();
    engLp.type = 'lowpass';
    engLp.frequency.value = 420;
    const engMix = ac.createGain();
    engMix.gain.value = 0.6;
    engOsc.connect(engMix);
    engOsc2.connect(engMix);
    engMix.connect(engLp);
    const engNoise = ac.createBufferSource();
    engNoise.buffer = noise;
    engNoise.loop = true;
    const engBp = ac.createBiquadFilter();
    engBp.type = 'bandpass';
    engBp.frequency.value = 700;
    engBp.Q.value = 0.7;
    const engNoiseAmt = ac.createGain();
    engNoiseAmt.gain.value = 0.35;
    engNoise.connect(engBp);
    engBp.connect(engNoiseAmt);
    engNoiseAmt.connect(engLp);
    engLp.connect(engGain);
    engOsc.start();
    engOsc2.start();
    engNoise.start();

    // Water: looped noise -> lowpass -> gain (lap LFO scaled by proximity)
    waterGain = cat(0);
    waterLp = ac.createBiquadFilter();
    waterLp.type = 'lowpass';
    waterLp.frequency.value = 520;
    const waterSrc = ac.createBufferSource();
    waterSrc.buffer = noise;
    waterSrc.loop = true;
    waterSrc.connect(waterLp);
    waterLp.connect(waterGain);
    const lapLfo = ac.createOscillator();
    lapLfo.frequency.value = 0.24;
    lapDepth = ac.createGain();
    lapDepth.gain.value = 0;
    lapLfo.connect(lapDepth);
    lapDepth.connect(waterGain.gain);
    waterSrc.start();
    lapLfo.start();

    // Crickets: sine pulse train (gain gated by night, modulated by square LFO)
    const crickets = ac.createOscillator();
    crickets.type = 'sine';
    crickets.frequency.value = 4300;
    cricketGate = ac.createGain();
    cricketGate.gain.value = 0;
    const crLfo = ac.createOscillator();
    crLfo.type = 'square';
    crLfo.frequency.value = 26;
    const crDepth = ac.createGain();
    crDepth.gain.value = 0.5;
    crLfo.connect(crDepth);
    crDepth.connect(cricketGate.gain);
    crickets.connect(cricketGate);
    cricketGate.connect(natureGain);
    crickets.start();
    crLfo.start();

    // Fire crackle: shared by short-lived bursts
    fireGain = cat(0);

    started = false;
  }

  function ensure() {
    if (!ac) build();
    if (ac.state === 'suspended') ac.resume();
  }

  function applyMute() {
    if (!ac) return;
    master.gain.setTargetAtTime(muted ? 0 : AUDIO.master, ac.currentTime, 0.05);
  }

  function resume() {
    ensure();
    applyMute();
  }

  function blip(freq, dur, vol, type = 'triangle') {
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(uiGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function chirp(f0, f1, dur, vol) {
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(natureGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function birdMotif() {
    const n = 2 + Math.floor(Math.random() * 3);
    const f0 = 2200 + Math.random() * 1900;
    let delay = 0;
    for (let i = 0; i < n; i++) {
      const dur = 0.06 + Math.random() * 0.09;
      const f = f0 * (0.94 + Math.random() * 0.12);
      setTimeout(() => chirp(f, f * (1.15 + Math.random() * 0.3), dur, 0.16), delay * 1000);
      delay += 0.11 + Math.random() * 0.12;
    }
  }

  function crackle() {
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.start(t0, Math.random() * 3, 0.06);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200 + Math.random() * 2000;
    bp.Q.value = 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.35 + Math.random() * 0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    src.connect(bp);
    bp.connect(g);
    g.connect(fireGain);
    src.stop(t0 + 0.08);
  }

  function waterAmt(px, pz) {
    let d = Math.hypot(px - WATER.lake.x, pz - WATER.lake.z) - WATER.lake.r;
    d = Math.min(d, Math.hypot(px - WATER.pond.x, pz - WATER.pond.z) - WATER.pond.r);
    for (const p of WATER.stream.path) {
      d = Math.min(d, Math.hypot(px - p[0], pz - p[1]) - WATER.stream.width);
    }
    return Math.max(0, Math.min(1, 1 - d / 22));
  }

  return {
    isMuted: () => muted,
    resume,
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
      if (!ac) return;
      applyMute();
      if (muted) setTimeout(() => { if (muted && ac) ac.suspend(); }, 200);
      else if (ac.state === 'suspended') ac.resume();
    },
    click(kind) {
      const m = { truck: [440, 0.07], lights: [620, 0.07], foot: [380, 0.06], rest: [300, 0.12] };
      const [f, d] = m[kind] || [440, 0.06];
      blip(f, d, 0.5, 'square');
    },
    beep(kind) {
      if (kind === 'tick') blip(880, 0.09, 0.5, 'square');
      else if (kind === 'go') blip(1320, 0.22, 0.6, 'square');
      else if (kind === 'chime') {
        blip(988, 0.18, 0.5, 'triangle');
        setTimeout(() => blip(1319, 0.3, 0.5, 'triangle'), 140);
      }
    },
    state: () => ({ muted, ctxState: ac ? ac.state : 'none', started }),
    update(dt, env) {
      if (!ac || ac.state !== 'running') return;
      if (!started) started = true;
      const t = ac.currentTime;

      // Wind: stronger by day, gusting
      gustPhase += dt * 0.11;
      const gust = 0.5 + 0.5 * (Math.sin(gustPhase) * 0.6 + Math.sin(gustPhase * 2.7 + 1.3) * 0.4);
      const windAmt = AUDIO.wind * (0.09 + 0.15 * (1 - env.nightFactor) + 0.13 * gust);
      windGain.gain.setTargetAtTime(windAmt, t, 0.9);

      // Engine: pitch & gain from speed; idle rumble in truck; silent on foot
      const spd = Math.abs(env.speed);
      const engAmt = env.onFoot ? 0 : (spd > 0.4 ? 0.12 + 0.5 * Math.min(1, spd / 34) : 0.06);
      const f = 40 + spd * 6.0;
      engOsc.frequency.setTargetAtTime(f, t, 0.12);
      engOsc2.frequency.setTargetAtTime(f * 2, t, 0.12);
      engGain.gain.setTargetAtTime(AUDIO.engine * engAmt, t, 0.15);

      // Birds by day, crickets by night
      if (env.nightFactor < 0.5) {
        birdNext -= dt;
        if (birdNext <= 0) {
          birdMotif();
          birdNext = 1.3 + Math.random() * 3.5;
        }
      }
      cricketGate.gain.setTargetAtTime(
        env.nightFactor > 0.55 ? AUDIO.nature * 0.09 : 0, t, 0.8,
      );

      // Water proximity
      const pp = env.playerPos();
      const wamt = waterAmt(pp.x, pp.z);
      waterGain.gain.setTargetAtTime(AUDIO.water * 0.45 * wamt, t, 0.5);
      lapDepth.gain.setTargetAtTime(0.3 * wamt, t, 0.5);

      // Campfire crackle near fires
      fireGain.gain.setTargetAtTime(env.nearFire ? AUDIO.fire * 0.35 : 0, t, 0.4);
      if (env.nearFire) {
        fireNext -= dt;
        if (fireNext <= 0) {
          crackle();
          fireNext = 0.04 + Math.random() * 0.16;
        }
      }
    },
  };
}
