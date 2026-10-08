import { AUDIO, WATER } from '../config.js';

const MUTE_KEY = 'gh4x-muted';

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
  let waterGain, lapDepth;
  let fireGain;
  let natureGain, uiGain;
  let noise = null;
  let started = false;
  let birdNext = 4 + Math.random() * 6;
  let cricketNext = 2 + Math.random() * 4;
  let fireNext = 0;
  let gustPhase = Math.random() * 10;

  function build() {
    ac = new AC();
    noise = noiseBuffer(ac);

    // Master -> gentle compressor (nothing ever jumps out) -> speakers
    master = ac.createGain();
    master.gain.value = muted ? 0 : AUDIO.master;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;
    master.connect(comp);
    comp.connect(ac.destination);

    const cat = (v) => {
      const g = ac.createGain();
      g.gain.value = v;
      g.connect(master);
      return g;
    };
    natureGain = cat(AUDIO.nature);
    uiGain = cat(AUDIO.ui * 0.5);

    // Warm grounding pad: two detuned sines (fifth) -> lowpass -> breathing gain
    const padGain = cat(AUDIO.pad * 0.5);
    const padLp = ac.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 500;
    const padMix = ac.createGain();
    padMix.gain.value = 0.4;
    const padOsc1 = ac.createOscillator();
    padOsc1.type = 'sine';
    padOsc1.frequency.value = 96.4;
    const padOsc2 = ac.createOscillator();
    padOsc2.type = 'sine';
    padOsc2.frequency.value = 143.7;
    padOsc1.connect(padMix);
    padOsc2.connect(padMix);
    padMix.connect(padLp);
    padLp.connect(padGain);
    const padLfo = ac.createOscillator();
    padLfo.frequency.value = 0.04;
    const padDepth = ac.createGain();
    padDepth.gain.value = AUDIO.pad * 0.15;
    padLfo.connect(padDepth);
    padDepth.connect(padGain.gain);
    padOsc1.start();
    padOsc2.start();
    padLfo.start();

    // Wind: looped brown noise -> lowpass (gust-swept) -> gain + breathing LFO
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
    const windBreath = ac.createOscillator();
    windBreath.frequency.value = 0.05;
    const windBreathAmt = ac.createGain();
    windBreathAmt.gain.value = AUDIO.wind * 0.12;
    windBreath.connect(windBreathAmt);
    windBreathAmt.connect(windGain.gain);
    windSrc.start();
    windLfo.start();
    windBreath.start();

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
    const waterLp = ac.createBiquadFilter();
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

  // Soft mallet/bell tone: sine, 8 ms attack, long exponential release
  function tone(freq, dur, vol, attack = 0.008) {
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(uiGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // Soft coo-like bird note: sine with gentle downward gliss
  function coo(f0, f1, dur, vol) {
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(natureGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function birdMotif() {
    const n = 2 + Math.floor(Math.random() * 2);
    const f0 = 1100 + Math.random() * 1100;
    let delay = 0;
    for (let i = 0; i < n; i++) {
      const dur = 0.25 + Math.random() * 0.2;
      const f = f0 * (0.96 + Math.random() * 0.08);
      setTimeout(() => coo(f, f * 0.82, dur, 0.08), delay * 1000);
      delay += 0.3 + Math.random() * 0.2;
    }
  }

  // Sparse cricket chirp: 3-5 soft pulses, then long rest
  function cricketBurst() {
    const n = 3 + Math.floor(Math.random() * 3);
    const f = 3600 + Math.random() * 600;
    let delay = 0;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (!ac || ac.state !== 'running') return;
        const t0 = ac.currentTime;
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
        o.connect(g);
        g.connect(natureGain);
        o.start(t0);
        o.stop(t0 + 0.05);
      }, delay * 1000);
      delay += 0.05;
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
      const m = { truck: [294, 0.18], lights: [440, 0.18], foot: [330, 0.16], rest: [392, 0.35] };
      const [f, d] = m[kind] || [294, 0.18];
      tone(f, d, 0.5);
    },
    beep(kind) {
      if (kind === 'tick') tone(660, 0.25, 0.45);
      else if (kind === 'go') tone(880, 0.4, 0.5);
      else if (kind === 'chime') {
        tone(523, 0.7, 0.45);
        setTimeout(() => tone(784, 0.7, 0.45), 220);
      }
    },
    state: () => ({ muted, ctxState: ac ? ac.state : 'none', started }),
    update(dt, env) {
      if (!ac || ac.state !== 'running') return;
      if (!started) started = true;
      const t = ac.currentTime;

      // Wind: stronger by day, gusting, breathing
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

      // Sparse doves by day, sparse crickets by night — both pause, both quiet
      if (env.nightFactor < 0.5) {
        birdNext -= dt;
        if (birdNext <= 0) {
          birdMotif();
          birdNext = 5 + Math.random() * 9;
        }
      }
      if (env.nightFactor > 0.55) {
        cricketNext -= dt;
        if (cricketNext <= 0) {
          cricketBurst();
          cricketNext = 2.5 + Math.random() * 6.5;
        }
      }

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
