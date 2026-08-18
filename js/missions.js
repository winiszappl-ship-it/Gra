// Zadania dnia — lekka pętla retencji. Losowane deterministycznie z daty,
// więc wszyscy gracze mają tego samego dnia ten sam zestaw.
const POOL = [
  { id: 'dist',    label: (n) => `Przebiegnij ${n} m w jednym biegu`, targets: [800, 1200, 1800, 2500], reward: 60,  track: 'runDistance' },
  { id: 'orbs',    label: (n) => `Zbierz ${n} orbów łącznie`,          targets: [40, 60, 90, 130],      reward: 50,  track: 'orbs' },
  { id: 'combo',   label: (n) => `Osiągnij combo x${n}`,               targets: [6, 8, 12, 16],         reward: 80,  track: 'combo' },
  { id: 'score',   label: (n) => `Zdobądź ${n} punktów w jednym biegu`, targets: [1500, 3000, 5000, 8000], reward: 70, track: 'runScore' },
  { id: 'runs',    label: (n) => `Rozegraj ${n} biegów`,               targets: [3, 5, 8, 12],          reward: 40,  track: 'runs' },
  { id: 'power',   label: (n) => `Złap ${n} bonusów`,                  targets: [4, 6, 10, 14],         reward: 55,  track: 'powerups' },
  { id: 'near',    label: (n) => `Zrób ${n} muśnięć o włos`,           targets: [15, 25, 40, 60],       reward: 65,  track: 'nearMiss' },
];

export const todayKey = () => new Date().toISOString().slice(0, 10);

// Mały deterministyczny PRNG (mulberry32) zasilany datą.
function seeded(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generate(dayKey, playerBest = 0) {
  const rnd = seeded(dayKey);
  const pool = [...POOL];
  // Trudność skalowana rekordem gracza — nowi gracze nie dostają zadań nie do zrobienia.
  const tier = playerBest > 8000 ? 3 : playerBest > 4000 ? 2 : playerBest > 1500 ? 1 : 0;
  const picked = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const idx = Math.floor(rnd() * pool.length);
    const m = pool.splice(idx, 1)[0];
    const target = m.targets[Math.min(tier + (rnd() < 0.3 ? 1 : 0), m.targets.length - 1)];
    picked.push({ id: m.id, track: m.track, target, reward: m.reward, progress: 0, done: false, claimed: false });
  }
  return picked;
}

export function labelFor(m) {
  const def = POOL.find((p) => p.id === m.id);
  return def ? def.label(m.target) : m.id;
}

export function ensureToday(state) {
  const day = todayKey();
  if (state.missionDay !== day || !Array.isArray(state.missions) || !state.missions.length) {
    state.missionDay = day;
    state.missions = generate(day, state.best);
    return true;
  }
  return false;
}

// Aktualizuje postęp. `stats` to metryki z jednego biegu + liczniki globalne.
// Zwraca listę zadań ukończonych właśnie teraz (do wypłaty nagrody).
export function applyProgress(state, stats) {
  const completed = [];
  for (const m of state.missions || []) {
    if (m.done) continue;
    const val = stats[m.track];
    if (typeof val !== 'number') continue;
    // Zadania "w jednym biegu" biorą maksimum, kumulacyjne — sumę.
    if (m.track === 'runDistance' || m.track === 'runScore' || m.track === 'combo') {
      m.progress = Math.max(m.progress, val);
    } else {
      m.progress += val;
    }
    if (m.progress >= m.target) {
      m.progress = m.target;
      m.done = true;
      completed.push(m);
    }
  }
  return completed;
}

export const allDone = (state) => (state.missions || []).every((m) => m.done);

export function msUntilReset() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next - now;
}
