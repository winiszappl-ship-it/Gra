// Generator poziomu. Świat jest nieskończony i składany z "wzorów" (patterns),
// dokładanych po prawej stronie kamery. Każdy wzór musi być PRZECHODZALNY —
// nigdy nie blokujemy obu torów bez pozostawienia okna na przelot.

export const VIEW_W = 960;
export const VIEW_H = 540;
export const WALL = 56;              // grubość podłogi/sufitu
export const TOP = WALL;             // górna krawędź toru
export const BOT = VIEW_H - WALL;    // dolna krawędź toru
export const LANE_H = BOT - TOP;
export const PLAYER_X = 200;
export const PLAYER_SIZE = 26;
export const PX_PER_M = 20;          // 20 px = 1 metr

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function makeSpike(x, side, scale = 1) {
  const w = 34 * scale;
  const h = 40 * scale;
  return {
    type: 'spike', side, x, w, h,
    y: side === 'floor' ? BOT - h : TOP,
    passed: false, minGap: Infinity,
  };
}

const makeBlock = (x, y, w, h) => ({ type: 'block', x, y, w, h, passed: false, minGap: Infinity });

const makeMover = (x, w, h, baseY, amp, speed, phase) => ({
  type: 'mover', x, w, h, y: baseY, baseY, amp, speed, phase, passed: false, minGap: Infinity,
});

// Laser NIGDY nie blokuje całego tunelu. Gracz nie ma wpływu na prędkość poziomą,
// więc pełna zapora byłaby loterią, a nie umiejętnością — beam zajmuje ~56% toru
// przy jednej ścianie, a przeciwny tor zostaje wolny.
const LASER_COVER = 0.56;
const makeLaser = (x, side, cycle, onTime, offset) => {
  const h = LANE_H * LASER_COVER;
  return {
    type: 'laser', side, x, w: 12, h,
    y: side === 'floor' ? BOT - h : TOP,
    cycle, onTime, offset, active: true, passed: false, minGap: Infinity,
  };
};

const makeSaw = (x, side, r = 26) => ({
  type: 'saw', side, x, r, w: r * 2, h: r * 2,
  y: side === 'floor' ? BOT - r * 2 : TOP,
  spin: Math.random() * Math.PI, passed: false, minGap: Infinity,
});

const makeOrb = (x, y) => ({ x, y, r: 9, got: false, phase: Math.random() * 6.283 });

// ---------------------------------------------------------------- wzory

// Rząd kolców na jednej ścianie — druga ściana jest wolna.
function spikeRow(x, diff, out) {
  const side = Math.random() < 0.5 ? 'floor' : 'ceil';
  const n = 2 + Math.floor(rand(0, 2 + diff * 3));
  const gap = 46 - diff * 8;
  for (let i = 0; i < n; i++) out.obstacles.push(makeSpike(x + i * gap, side));
  const oy = side === 'floor' ? TOP + 60 : BOT - 60;
  for (let i = 0; i < n; i++) out.orbs.push(makeOrb(x + i * gap + 17, oy));
  return n * gap + 40;
}

// Naprzemienne grupy kolców — wymusza rytmiczne przełączanie grawitacji.
function zigzag(x, diff, out) {
  const groups = 2 + Math.floor(diff * 2);
  const n = 2 + Math.floor(diff * 2);
  const gap = 46;
  let side = Math.random() < 0.5 ? 'floor' : 'ceil';
  let cx = x;
  for (let g = 0; g < groups; g++) {
    for (let i = 0; i < n; i++) out.obstacles.push(makeSpike(cx + i * gap, side));
    const oy = side === 'floor' ? TOP + 50 : BOT - 50;
    out.orbs.push(makeOrb(cx + (n * gap) / 2, oy));
    cx += n * gap + (170 - diff * 45);
    side = side === 'floor' ? 'ceil' : 'floor';
  }
  return cx - x;
}

// Blok przy ścianie: trzeba być na przeciwnej. Orby nagradzają ciasny przelot.
function wallBlock(x, diff, out) {
  const side = Math.random() < 0.5 ? 'floor' : 'ceil';
  const h = rand(90, 90 + diff * 90);
  const w = rand(60, 110);
  const y = side === 'floor' ? BOT - h : TOP;
  out.obstacles.push(makeBlock(x, y, w, h));
  const oy = side === 'floor' ? y - 34 : y + h + 34;
  out.orbs.push(makeOrb(x + w / 2, oy));
  return w + 150 - diff * 40;
}

// Brama: filary od góry i od dołu, przelot środkiem. Orby prowadzą przez szczelinę.
function pillarGate(x, diff, out) {
  const gap = 168 - diff * 40;             // szczelina nigdy nie schodzi poniżej 128 px
  const w = 54;
  const top = rand(TOP + 30, BOT - gap - 30);
  out.obstacles.push(makeBlock(x, TOP, w, top - TOP));
  out.obstacles.push(makeBlock(x, top + gap, w, BOT - (top + gap)));
  const mid = top + gap / 2;
  for (let i = -2; i <= 2; i++) out.orbs.push(makeOrb(x + w / 2 + i * 46, mid));
  return w + 240 - diff * 50;
}

// Ruchomy blok wahający się w pionie — oba tory bywają chwilowo wolne.
function movers(x, diff, out) {
  const n = 1 + Math.floor(diff * 2);
  let cx = x;
  for (let i = 0; i < n; i++) {
    const h = rand(70, 110);
    const amp = rand(70, 60 + diff * 110);
    const baseY = (TOP + BOT) / 2 - h / 2;
    out.obstacles.push(makeMover(cx, 46, h, baseY, amp, rand(1.1, 1.9), Math.random() * 6.283));
    out.orbs.push(makeOrb(cx + 23, TOP + 34));
    out.orbs.push(makeOrb(cx + 23, BOT - 34));
    cx += 170;
  }
  return cx - x + 90;
}

// Migające lasery na przemian przy podłodze i suficie — trzeba być na wolnym torze.
function laserGate(x, diff, out) {
  const n = 2 + Math.floor(diff * 2);
  const cycle = 2000 - diff * 500;
  let side = Math.random() < 0.5 ? 'floor' : 'ceil';
  let cx = x;
  for (let i = 0; i < n; i++) {
    out.obstacles.push(makeLaser(cx, side, cycle, cycle * 0.4, i * cycle * 0.37));
    // Orb po bezpiecznej stronie — prowadzi wzrok tam, gdzie trzeba być.
    out.orbs.push(makeOrb(cx + 6, side === 'floor' ? TOP + 52 : BOT - 52));
    cx += 250 - diff * 40;
    side = side === 'floor' ? 'ceil' : 'floor';
  }
  return cx - x + 130;
}

// Piły przy jednej ścianie — szybkie, ale druga ściana zawsze wolna.
function sawRow(x, diff, out) {
  const side = Math.random() < 0.5 ? 'floor' : 'ceil';
  const n = 1 + Math.floor(rand(1, 2 + diff * 2));
  const gap = 96;
  for (let i = 0; i < n; i++) out.obstacles.push(makeSaw(x + i * gap, side));
  const oy = side === 'floor' ? TOP + 46 : BOT - 46;
  for (let i = 0; i < n; i++) out.orbs.push(makeOrb(x + i * gap + 26, oy));
  return n * gap + 120;
}

// Korytarz: kolce na obu ścianach, ale przesunięte — trzeba lecieć środkiem "wężykiem".
function weave(x, diff, out) {
  const n = 3 + Math.floor(diff * 3);
  const gap = 130 - diff * 22;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 'floor' : 'ceil';
    out.obstacles.push(makeSpike(x + i * gap, side, 1.15));
    const oy = side === 'floor' ? TOP + 70 : BOT - 70;
    out.orbs.push(makeOrb(x + i * gap + 17, oy));
  }
  return n * gap + 100;
}

// Oddech: sam łuk orbów, żeby gracz mógł odetchnąć i odbudować combo.
function orbArc(x, diff, out) {
  const n = 7;
  const up = Math.random() < 0.5;
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const y = up
      ? BOT - 40 - Math.sin(p * Math.PI) * (LANE_H - 110)
      : TOP + 40 + Math.sin(p * Math.PI) * (LANE_H - 110);
    out.orbs.push(makeOrb(x + i * 54, y));
  }
  return n * 54 + 90;
}

// Wzory z wagami zależnymi od trudności (0..1).
const PATTERNS = [
  { fn: spikeRow,   w: (d) => 1.0 },
  { fn: zigzag,     w: (d) => 0.5 + d * 0.8 },
  { fn: wallBlock,  w: (d) => 0.8 },
  { fn: orbArc,     w: (d) => 0.55 },
  { fn: sawRow,     w: (d) => (d > 0.15 ? 0.6 + d * 0.4 : 0) },
  { fn: movers,     w: (d) => (d > 0.3 ? 0.5 + d * 0.8 : 0) },
  { fn: pillarGate, w: (d) => (d > 0.35 ? 0.4 + d * 0.9 : 0) },
  { fn: weave,      w: (d) => (d > 0.5 ? 0.5 + d * 0.7 : 0) },
  { fn: laserGate,  w: (d) => (d > 0.55 ? 0.4 + d * 0.9 : 0) },
];

function choosePattern(diff, lastFn) {
  const weighted = PATTERNS.map((p) => ({ p, w: p.w(diff) * (p.fn === lastFn ? 0.25 : 1) })).filter((e) => e.w > 0);
  const total = weighted.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of weighted) {
    r -= e.w;
    if (r <= 0) return e.p.fn;
  }
  return weighted[0].p.fn;
}

const POWER_KINDS = ['shield', 'magnet', 'slow', 'x2'];

export class Spawner {
  constructor() { this.reset(); }

  reset() {
    this.cursor = VIEW_W + 260;   // pierwszy wzór dopiero za ekranem — spokojny start
    this.lastFn = null;
    this.sincePower = 0;
  }

  // Dokłada wzory, dopóki nie wypełnią świata do `untilX`.
  fill(untilX, diff, out) {
    let guard = 0;
    while (this.cursor < untilX && guard++ < 40) {
      const fn = choosePattern(diff, this.lastFn);
      const width = fn(this.cursor, diff, out);
      this.lastFn = fn;
      this.cursor += Math.max(160, width) + Math.max(120, 190 - diff * 70);
      this.sincePower++;
      // Bonus mniej więcej co 5-8 wzorów, zawsze w bezpiecznym miejscu między nimi.
      if (this.sincePower >= 5 && Math.random() < 0.4) {
        this.sincePower = 0;
        out.powerups.push({
          x: this.cursor - 90,
          y: rand(TOP + 60, BOT - 60),
          kind: pick(POWER_KINDS),
          r: 16,
          got: false,
          phase: Math.random() * 6.283,
        });
      }
    }
  }
}
