// Trwały stan gracza — localStorage z bezpiecznym fallbackiem (tryb prywatny / brak zgody).
const KEY = 'neonflux.save.v1';

const DEFAULTS = {
  coins: 0,
  best: 0,
  bestDistance: 0,
  bestCombo: 1,
  runs: 0,
  totalDistance: 0,
  totalOrbs: 0,
  totalCoins: 0,
  deaths: 0,
  skin: 'flux',
  owned: ['flux'],
  sound: true,
  music: true,
  missions: null,
  missionDay: null,
  lastPlayDay: null,
  streak: 0,
};

let memoryOnly = false;
let cache = null;

function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    memoryOnly = true;
    return null;
  }
}

export function load() {
  if (cache) return cache;
  const stored = readRaw() || {};
  cache = { ...DEFAULTS, ...stored };
  // Sanityzacja — plik zapisu mógł zostać ręcznie zepsuty.
  if (!Array.isArray(cache.owned) || !cache.owned.length) cache.owned = ['flux'];
  if (!cache.owned.includes('flux')) cache.owned.unshift('flux');
  for (const k of ['coins', 'best', 'bestDistance', 'runs', 'totalDistance', 'totalOrbs', 'totalCoins', 'deaths']) {
    if (typeof cache[k] !== 'number' || !isFinite(cache[k]) || cache[k] < 0) cache[k] = 0;
  }
  if (typeof cache.bestCombo !== 'number' || cache.bestCombo < 1) cache.bestCombo = 1;
  return cache;
}

export function save() {
  if (memoryOnly || !cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) {
    memoryOnly = true;
  }
}

export function reset() {
  const fresh = { ...DEFAULTS, owned: ['flux'] };
  if (cache) {
    // Mutujemy w miejscu — moduły trzymają referencję do tego samego obiektu.
    for (const k of Object.keys(cache)) delete cache[k];
    Object.assign(cache, fresh);
  } else {
    cache = fresh;
  }
  save();
  return cache;
}

export const isPersistent = () => !memoryOnly;
