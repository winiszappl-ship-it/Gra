// Cały dźwięk generowany proceduralnie przez WebAudio — zero plików do pobrania.
let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let musicTimer = null;
let step = 0;

const state = { sound: true, music: true, started: false };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.55;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.0;
  musicGain.connect(master);
  return ctx;
}

// Odblokowanie audio wymaga gestu użytkownika (polityka przeglądarek).
export function unlock() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  state.started = true;
}

function tone({ freq = 440, dur = 0.12, type = 'square', vol = 0.3, slide = 0, delay = 0 }) {
  if (!state.sound) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(sfxGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.35, lowpass = 1200 }) {
  if (!state.sound) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(lowpass, c.currentTime);
  filt.frequency.exponentialRampToValueAtTime(120, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(filt).connect(g).connect(sfxGain);
  src.start();
}

export const sfx = {
  flip: () => tone({ freq: 520, dur: 0.08, type: 'triangle', vol: 0.22, slide: 180 }),
  orb: (combo = 1) => {
    const f = 620 * Math.pow(1.0595, Math.min(24, combo * 2));
    tone({ freq: f, dur: 0.09, type: 'sine', vol: 0.28, slide: 120 });
    tone({ freq: f * 2, dur: 0.06, type: 'sine', vol: 0.1, delay: 0.02 });
  },
  near: () => tone({ freq: 900, dur: 0.05, type: 'sine', vol: 0.13, slide: 300 }),
  power: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.2, delay: i * 0.05 }));
  },
  death: () => {
    noise({ dur: 0.5, vol: 0.4, lowpass: 2000 });
    tone({ freq: 220, dur: 0.5, type: 'sawtooth', vol: 0.25, slide: -170 });
  },
  shieldHit: () => {
    tone({ freq: 180, dur: 0.25, type: 'sawtooth', vol: 0.3, slide: 260 });
    noise({ dur: 0.2, vol: 0.2, lowpass: 900 });
  },
  coin: () => tone({ freq: 1100, dur: 0.07, type: 'square', vol: 0.16, slide: 400 }),
  ui: () => tone({ freq: 320, dur: 0.05, type: 'square', vol: 0.12 }),
  buy: () => [440, 587, 880].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'square', vol: 0.18, delay: i * 0.06 })),
  deny: () => tone({ freq: 160, dur: 0.16, type: 'sawtooth', vol: 0.18, slide: -60 }),
  best: () => [659, 784, 988, 1319].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.22, delay: i * 0.09 })),
};

// Prosty arpeggiator w skali molowej — pętla bez pliku audio.
const SCALE = [0, 3, 5, 7, 10, 12, 10, 7];
const ROOTS = [110, 110, 146.83, 130.81];

function musicStep() {
  const c = ensure();
  if (!c || !state.music || c.state !== 'running') return;
  const bar = Math.floor(step / 8) % ROOTS.length;
  const root = ROOTS[bar];
  const semi = SCALE[step % SCALE.length];
  const f = root * Math.pow(2, semi / 12);
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * 2, t0);
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(900 + (step % 8) * 130, t0);
  filt.Q.value = 6;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
  osc.connect(filt).connect(g).connect(musicGain);
  osc.start(t0);
  osc.stop(t0 + 0.3);
  if (step % 8 === 0) {
    const b = c.createOscillator();
    const bg = c.createGain();
    b.type = 'sine';
    b.frequency.setValueAtTime(root / 2, t0);
    bg.gain.setValueAtTime(0.22, t0);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    b.connect(bg).connect(musicGain);
    b.start(t0);
    b.stop(t0 + 0.5);
  }
  step++;
}

export function startMusic() {
  const c = ensure();
  if (!c || musicTimer) return;
  musicGain.gain.setTargetAtTime(state.music ? 0.5 : 0, c.currentTime, 0.4);
  musicTimer = setInterval(musicStep, 190);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (ctx && musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}

export function setSound(on) { state.sound = on; }

export function setMusic(on) {
  state.music = on;
  if (ctx && musicGain) musicGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.25);
  if (on) startMusic();
}

// Delikatny "duck" muzyki w slow-mo, żeby efekt było słychać.
export function setMusicRate(slow) {
  if (ctx && musicGain) musicGain.gain.setTargetAtTime(state.music ? (slow ? 0.28 : 0.5) : 0, ctx.currentTime, 0.2);
}
