import { Game } from './game.js';
import { SKINS, getSkin, drawSkin } from './skins.js';
import * as store from './storage.js';
import * as missions from './missions.js';
import { sfx, unlock, startMusic, setSound, setMusic } from './audio.js';

// Starsze Safari nie ma roundRect — dokładamy minimalny odpowiednik.
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}

const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('game'), hud: $('hud'), menu: $('menu'), gameover: $('gameover'), pause: $('pause'),
  shop: $('shop'), missions: $('missions'), stats: $('stats'), how: $('how'), toast: $('toast'),
  hudDist: $('hudDist'), hudScore: $('hudScore'), hudOrbs: $('hudOrbs'),
  comboWrap: $('comboWrap'), comboVal: $('comboVal'), comboFill: $('comboFill'), powerRow: $('powerRow'),
  mBest: $('mBest'), mCoins: $('mCoins'), mStreak: $('mStreak'),
  goScore: $('goScore'), goDist: $('goDist'), goOrbs: $('goOrbs'), goCombo: $('goCombo'),
  goCoins: $('goCoins'), goBest: $('goBest'), goMissions: $('goMissions'),
  shopGrid: $('shopGrid'), shopCoins: $('shopCoins'), missCoins: $('missCoins'),
  missionList: $('missionList'), missionReset: $('missionReset'), missionDot: $('missionDot'),
  statList: $('statList'),
};

const save = store.load();
let game;
let lastStats = null;

// ------------------------------------------------------------ pomocnicze UI
const show = (node) => node.classList.remove('hidden');
const hide = (node) => node.classList.add('hidden');
const SCREENS = [el.menu, el.gameover, el.pause, el.shop, el.missions, el.stats, el.how];
function openScreen(node) {
  SCREENS.forEach((s) => hide(s));
  if (node) show(node);
}
const fmt = (n) => Math.floor(n).toLocaleString('pl-PL');

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  show(el.toast);
  requestAnimationFrame(() => el.toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
    setTimeout(() => hide(el.toast), 250);
  }, 2200);
}

// ------------------------------------------------------------ dzienna seria
function checkDailyStreak() {
  const today = missions.todayKey();
  if (save.lastPlayDay === today) return;
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  save.streak = save.lastPlayDay === yesterday ? (save.streak || 0) + 1 : 1;
  save.lastPlayDay = today;
  const bonus = 25 * Math.min(save.streak, 7);
  save.coins += bonus;
  save.totalCoins += bonus;
  store.save();
  setTimeout(() => toast(`SERIA ${save.streak} DNI — bonus +${bonus} monet`), 700);
}

// ------------------------------------------------------------ HUD
function renderHud(d) {
  el.hudDist.innerHTML = `${fmt(d.distance)}<i>m</i>`;
  el.hudScore.textContent = fmt(d.score);
  el.hudOrbs.textContent = d.orbs;
  if (d.combo > 0) {
    el.comboWrap.classList.add('on');
    el.comboVal.textContent = `x${d.combo}`;
    el.comboFill.style.transform = `scaleX(${Math.max(0, d.comboPct)})`;
  } else {
    el.comboWrap.classList.remove('on');
  }
  const chips = [];
  if (d.active.shield) chips.push(['shield', 'TARCZA']);
  if (d.active.magnet > 0) chips.push(['magnet', `MAGNES ${d.active.magnet.toFixed(1)}s`]);
  if (d.active.slow > 0) chips.push(['slow', `SLOW-MO ${d.active.slow.toFixed(1)}s`]);
  if (d.active.x2 > 0) chips.push(['x2', `x2 ${d.active.x2.toFixed(1)}s`]);
  const sig = chips.map((c) => c[1]).join('|');
  if (sig !== el.powerRow.dataset.sig) {
    el.powerRow.dataset.sig = sig;
    el.powerRow.innerHTML = chips.map(([k, t]) => `<span class="pw-chip ${k}">${t}</span>`).join('');
  }
}

// ------------------------------------------------------------ przepływ gry
function startGame() {
  unlock();
  if (save.music) startMusic();
  checkDailyStreak();
  openScreen(null);
  show(el.hud);
  game.start(save.skin);
}

function onDeath(stats) {
  lastStats = stats;
  save.runs += 1;
  save.deaths += 1;
  save.totalDistance += stats.distance;
  save.totalOrbs += stats.orbs;

  const earned = Math.floor(stats.score / 100) + stats.orbs;
  save.coins += earned;
  save.totalCoins += earned;

  const isBest = stats.score > save.best;
  if (isBest) save.best = stats.score;
  if (stats.distance > save.bestDistance) save.bestDistance = stats.distance;
  if (stats.combo > save.bestCombo) save.bestCombo = stats.combo;

  missions.ensureToday(save);
  const done = missions.applyProgress(save, {
    runDistance: stats.distance,
    runScore: stats.score,
    combo: stats.combo,
    orbs: stats.orbs,
    powerups: stats.powerups,
    nearMiss: stats.nearMiss,
    runs: 1,
  });
  let missionCoins = 0;
  for (const m of done) {
    missionCoins += m.reward;
    m.claimed = true;
  }
  if (missionCoins) {
    save.coins += missionCoins;
    save.totalCoins += missionCoins;
  }
  store.save();

  // Ekran końca pokazujemy z małym opóźnieniem — eksplozja ma się wybrzmieć.
  setTimeout(() => {
    hide(el.hud);
    el.goScore.textContent = fmt(stats.score);
    el.goDist.textContent = `${fmt(stats.distance)}m`;
    el.goOrbs.textContent = stats.orbs;
    el.goCombo.textContent = `x${stats.combo}`;
    el.goCoins.textContent = fmt(earned + missionCoins);
    el.goBest.classList.toggle('hidden', !isBest);
    el.goMissions.innerHTML = done.length
      ? done.map((m) => `<div>✔ ${missions.labelFor(m)} — +${m.reward}</div>`).join('')
      : '';
    if (isBest) sfx.best();
    if (done.length) toast(`Zadanie ukończone! +${missionCoins} monet`);
    openScreen(el.gameover);
    refreshMenu();
  }, 780);
}

function refreshMenu() {
  el.mBest.textContent = fmt(save.best);
  el.mCoins.textContent = fmt(save.coins);
  el.mStreak.textContent = save.streak || 0;
  el.shopCoins.textContent = fmt(save.coins);
  el.missCoins.textContent = fmt(save.coins);
  missions.ensureToday(save);
  el.missionDot.classList.toggle('hidden', missions.allDone(save));
}

// ------------------------------------------------------------ sklep
function renderShop() {
  el.shopGrid.innerHTML = '';
  for (const skin of SKINS) {
    const owned = save.owned.includes(skin.id);
    const active = save.skin === skin.id;
    const card = document.createElement('div');
    card.className = `skin${owned ? ' owned' : ' locked'}${active ? ' active' : ''}`;

    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const cctx = cv.getContext('2d');
    let raf = 0;
    const paint = (t) => {
      cctx.clearRect(0, 0, 128, 128);
      cctx.save();
      cctx.scale(2, 2);
      drawSkin(cctx, skin, 32, 32, 36, t / 700, owned ? 1 : 0.35);
      if (!owned) {
        cctx.fillStyle = 'rgba(5,6,15,.55)';
        cctx.fillRect(0, 0, 64, 64);
      }
      cctx.restore();
      raf = requestAnimationFrame(paint);
    };
    paint(0);
    card._stop = () => cancelAnimationFrame(raf);

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = skin.name;
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = skin.desc;
    const price = document.createElement('div');
    price.className = `price${active ? ' active' : owned ? ' owned' : ''}`;
    price.textContent = active ? 'W UŻYCIU' : owned ? 'WYBIERZ' : `${skin.price} monet`;

    card.append(cv, name, desc, price);
    card.addEventListener('click', () => handleSkinClick(skin));
    el.shopGrid.appendChild(card);
  }
}

function clearShop() {
  [...el.shopGrid.children].forEach((c) => c._stop?.());
  el.shopGrid.innerHTML = '';
}

function handleSkinClick(skin) {
  const owned = save.owned.includes(skin.id);
  if (owned) {
    save.skin = skin.id;
    store.save();
    sfx.ui();
    clearShop();
    renderShop();
    return;
  }
  if (save.coins < skin.price) {
    sfx.deny();
    toast(`Brakuje ${fmt(skin.price - save.coins)} monet`);
    return;
  }
  save.coins -= skin.price;
  save.owned.push(skin.id);
  save.skin = skin.id;
  store.save();
  sfx.buy();
  toast(`Odblokowano ${skin.name}!`);
  refreshMenu();
  clearShop();
  renderShop();
}

// ------------------------------------------------------------ zadania
function renderMissions() {
  missions.ensureToday(save);
  store.save();
  el.missionList.innerHTML = (save.missions || []).map((m) => {
    const pct = Math.min(100, (m.progress / m.target) * 100);
    return `<div class="mission${m.done ? ' done' : ''}">
      <div class="mission-top">
        <span class="mission-name">${missions.labelFor(m)}</span>
        <span class="mission-reward">${m.done ? '✔ ODEBRANE' : `+${m.reward}`}</span>
      </div>
      <div class="mission-bar"><i style="width:${pct}%"></i></div>
      <div class="mission-prog">${fmt(Math.min(m.progress, m.target))} / ${fmt(m.target)}</div>
    </div>`;
  }).join('');
  const ms = missions.msUntilReset();
  const h = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  el.missionReset.textContent = `Nowe zadania za ${h}h ${min}min`;
}

// ------------------------------------------------------------ statystyki
function renderStats() {
  const rows = [
    ['Najlepszy wynik', fmt(save.best)],
    ['Najdalszy bieg', `${fmt(save.bestDistance)} m`],
    ['Najwyższe combo', `x${save.bestCombo}`],
    ['Rozegrane biegi', fmt(save.runs)],
    ['Łączny dystans', `${fmt(save.totalDistance)} m`],
    ['Zebrane orby', fmt(save.totalOrbs)],
    ['Zarobione monety', fmt(save.totalCoins)],
    ['Odblokowane skiny', `${save.owned.length} / ${SKINS.length}`],
    ['Seria dni', `${save.streak || 0}`],
  ];
  el.statList.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  if (!store.isPersistent()) {
    el.statList.insertAdjacentHTML('beforeend',
      '<div><span>Uwaga</span><b>Postęp nie jest zapisywany (tryb prywatny)</b></div>');
  }
}

// ------------------------------------------------------------ przyciski
function bindClick(node, fn) {
  node.addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.ui();
    fn(e);
  });
}

bindClick($('playBtn'), startGame);
bindClick($('againBtn'), startGame);
bindClick($('resumeBtn'), () => { openScreen(null); show(el.hud); game.resume(); });
bindClick($('pauseBtn'), () => { game.pause(); hide(el.hud); openScreen(el.pause); });
bindClick($('pauseRestart'), startGame);
bindClick($('pauseMenu'), () => { game.toMenu(); hide(el.hud); openScreen(el.menu); refreshMenu(); });
bindClick($('goMenuBtn'), () => { game.toMenu(); openScreen(el.menu); refreshMenu(); });

bindClick($('shopBtn'), () => { renderShop(); openScreen(el.shop); refreshMenu(); });
bindClick($('goShopBtn'), () => { renderShop(); openScreen(el.shop); refreshMenu(); });
bindClick($('shopClose'), () => { clearShop(); openScreen(lastStats && game.state === 'dead' ? el.gameover : el.menu); refreshMenu(); });
bindClick($('missionsBtn'), () => { renderMissions(); openScreen(el.missions); });
bindClick($('missionsClose'), () => { openScreen(el.menu); refreshMenu(); });
bindClick($('statsBtn'), () => { renderStats(); openScreen(el.stats); });
bindClick($('statsClose'), () => openScreen(el.menu));
bindClick($('howBtn'), () => openScreen(el.how));
bindClick($('howClose'), () => openScreen(el.menu));

bindClick($('resetBtn'), () => {
  if (!confirm('Na pewno wykasować cały postęp? Tej operacji nie da się cofnąć.')) return;
  const fresh = store.reset();
  Object.assign(save, fresh);
  save.owned = ['flux'];
  save.skin = 'flux';
  missions.ensureToday(save);
  store.save();
  renderStats();
  refreshMenu();
  toast('Postęp wyczyszczony');
});

bindClick($('shareBtn'), async () => {
  const s = lastStats || { score: save.best, distance: save.bestDistance };
  const text = `NEON FLUX — ${fmt(s.score)} pkt (${fmt(s.distance)} m). Pobijesz to?`;
  const url = location.href.split('#')[0];
  try {
    if (navigator.share) {
      await navigator.share({ title: 'NEON FLUX', text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast('Skopiowano do schowka');
    }
  } catch (e) {
    toast('Nie udało się udostępnić');
  }
});

const soundBtn = $('soundBtn');
const musicBtn = $('musicBtn');
function syncAudioButtons() {
  soundBtn.textContent = `DŹWIĘK: ${save.sound ? 'ON' : 'OFF'}`;
  musicBtn.textContent = `MUZYKA: ${save.music ? 'ON' : 'OFF'}`;
}
bindClick(soundBtn, () => { save.sound = !save.sound; setSound(save.sound); store.save(); syncAudioButtons(); });
bindClick(musicBtn, () => {
  save.music = !save.music;
  unlock();
  setMusic(save.music);
  store.save();
  syncAudioButtons();
});

// ------------------------------------------------------------ sterowanie
function handleTap(e) {
  if (game.state !== 'playing') return;
  e.preventDefault();
  unlock();
  game.flip();
}
el.canvas.addEventListener('pointerdown', handleTap);
el.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key;
  if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'w' || k === 'W') {
    e.preventDefault();
    if (game.state === 'playing') { unlock(); game.flip(); }
    else if (game.state === 'menu' && !el.menu.classList.contains('hidden')) startGame();
    else if (game.state === 'dead' && !el.gameover.classList.contains('hidden')) startGame();
  } else if (k === 'Escape' || k === 'p' || k === 'P') {
    if (game.state === 'playing') { game.pause(); hide(el.hud); openScreen(el.pause); }
    else if (game.state === 'paused') { openScreen(null); show(el.hud); game.resume(); }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') {
    game.pause();
    hide(el.hud);
    openScreen(el.pause);
  }
});

// ------------------------------------------------------------ start
game = new Game(el.canvas, { onHud: renderHud, onDeath });
// Uchwyt diagnostyczny — przydatny przy testach automatycznych i debugowaniu w konsoli.
window.__neonflux = { game, save, store, missions };
setSound(save.sound);
setMusic(save.music);
missions.ensureToday(save);
store.save();
syncAudioButtons();
refreshMenu();
openScreen(el.menu);
