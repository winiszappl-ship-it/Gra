import {
  VIEW_H, TOP, BOT, LANE_H, PLAYER_SIZE, PX_PER_M, Spawner,
} from './world.js';
import { getSkin, drawSkin, skinColor, trailColor } from './skins.js';
import { sfx, setMusicRate } from './audio.js';

const MIN_VIEW_W = 560;
const MAX_VIEW_W = 2400;

const GRAVITY = 3050;
const MAX_VY = 1750;
const BASE_SPEED = 355;
const SPEED_GAIN = 10.5;      // px/s przyrostu na sekundę
const MAX_SPEED = 790;
const COMBO_TIME = 3.4;
const NEAR_MISS_GAP = 34;
const MAGNET_RANGE = 230;

const POWER_META = {
  shield: { label: 'TARCZA', dur: 0,    color: '#22e5ff' },
  magnet: { label: 'MAGNES', dur: 7.0,  color: '#ff3ea5' },
  slow:   { label: 'SLOW-MO', dur: 4.5, color: '#a78bfa' },
  x2:     { label: 'x2',     dur: 8.0,  color: '#ffd166' },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hooks = hooks;
    this.state = 'menu';          // menu | playing | paused | dead
    this.skinId = 'flux';
    this.reduceFx = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.viewW = 960;
    this.viewH = VIEW_H;
    this.scale = 1;
    this.offsetY = 0;
    this.playerX = 200;

    this.spawner = new Spawner();
    this.stars = [];
    this.resetRun();
    this.buildStars();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.resize();

    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  buildStars() {
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random() * 3000,
        y: Math.random() * VIEW_H,
        r: Math.random() * 1.7 + 0.4,
        p: 0.08 + Math.random() * 0.28,
        tw: Math.random() * 6.283,
      });
    }
  }

  resize() {
    const cw = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const ch = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    // Wysokość tunelu jest stała; szerokość widoku dopasowuje się do ekranu,
    // dzięki czemu gra działa i na telefonie w pionie, i na szerokim monitorze.
    this.scale = clamp(ch / VIEW_H, cw / MAX_VIEW_W, cw / MIN_VIEW_W);
    this.viewW = cw / this.scale;
    this.viewH = ch / this.scale;
    this.offsetY = (this.viewH - VIEW_H) / 2;
    this.dpr = dpr;
    this.playerX = Math.min(200, this.viewW * 0.26);
  }

  resetRun() {
    this.camX = 0;
    this.time = 0;
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.score = 0;
    this.orbsCollected = 0;
    this.powerupsTaken = 0;
    this.nearMisses = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.shake = 0;
    this.freeze = 0;
    this.timeScale = 1;
    this.hitFlash = 0;

    this.player = {
      y: BOT - PLAYER_SIZE / 2,
      vy: 0,
      grav: 1,
      grounded: true,
      rot: 0,
      alive: true,
    };
    this.trail = [];
    this.obstacles = [];
    this.orbs = [];
    this.powerups = [];
    this.particles = [];
    this.texts = [];
    this.active = { shield: 0, magnet: 0, slow: 0, x2: 0 };
    this.hasShield = false;
    this.spawner.reset();
    this.spawner.fill(this.camX + this.viewW + 900, 0, this);
  }

  start(skinId) {
    if (skinId) this.skinId = skinId;
    this.resetRun();
    this.state = 'playing';
    this.hooks.onHud?.(this.hudData());
  }

  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.lastT = performance.now(); } }
  toMenu() { this.state = 'menu'; this.resetRun(); }

  get difficulty() { return clamp(this.distance / 2600, 0, 1); }

  // ------------------------------------------------------------- wejście
  flip() {
    if (this.state !== 'playing' || !this.player.alive) return;
    this.player.grav *= -1;
    this.player.vy = this.player.grav * 90;
    this.player.grounded = false;
    sfx.flip();
    const p = this.player;
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: this.camX + this.playerX, y: p.y,
        vx: -this.speed * 0.25 + (Math.random() - 0.5) * 130,
        vy: -p.grav * (60 + Math.random() * 160),
        life: 0.4, max: 0.4, size: 3 + Math.random() * 3,
        color: trailColor(getSkin(this.skinId), this.time),
      });
    }
  }

  // ------------------------------------------------------------- pętla
  frame = (now) => {
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (!isFinite(dt)) dt = 0;
    dt = Math.min(dt, 0.05);

    if (this.state === 'playing' || this.state === 'dead') {
      if (this.freeze > 0) {
        this.freeze -= dt;
      } else {
        const scaled = dt * this.timeScale;
        // Krok fizyki dzielony na podkroki — stabilny przy niskim FPS.
        let left = scaled;
        while (left > 0) {
          const s = Math.min(left, 1 / 120);
          this.update(s);
          left -= s;
        }
      }
      // HUD to DOM — dotykamy go raz na klatkę, nie w każdym podkroku fizyki.
      if (this.state === 'playing') this.hooks.onHud?.(this.hudData());
    }
    this.render();
  };

  update(dt) {
    const p = this.player;
    this.time += dt;

    if (p.alive) {
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.time * SPEED_GAIN);
      const dx = this.speed * dt;
      this.camX += dx;
      this.distance += dx / PX_PER_M;

      const mult = this.scoreMultiplier;
      this.score += (dx / PX_PER_M) * mult * (this.active.x2 > 0 ? 2 : 1);

      // grawitacja
      p.vy = clamp(p.vy + p.grav * GRAVITY * dt, -MAX_VY, MAX_VY);
      p.y += p.vy * dt;

      const half = PLAYER_SIZE / 2;
      if (p.y > BOT - half) { p.y = BOT - half; if (p.grav > 0) { p.vy = 0; p.grounded = true; } else p.vy = Math.min(p.vy, 0); }
      else if (p.y < TOP + half) { p.y = TOP + half; if (p.grav < 0) { p.vy = 0; p.grounded = true; } else p.vy = Math.max(p.vy, 0); }
      else p.grounded = false;

      p.rot += (p.grounded ? 0 : p.grav * dt * 5);

      // combo wygasa, jeśli gracz przestaje ryzykować
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) { this.combo = 0; this.comboTimer = 0; }
      }

      this.trail.push({ x: this.camX + this.playerX, y: p.y, t: this.time });
      if (this.trail.length > 26) this.trail.shift();
    }

    // bonusy
    for (const k of Object.keys(this.active)) {
      if (this.active[k] > 0) {
        this.active[k] = Math.max(0, this.active[k] - dt);
        if (this.active[k] === 0 && k === 'slow') { this.timeScale = 1; setMusicRate(false); }
      }
    }

    this.spawner.fill(this.camX + this.viewW + 700, this.difficulty, this);
    this.updateEntities(dt);
    this.cull();

    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 900 * dt * (pt.grav ?? 1);
      pt.vx *= 0.99;
    }
    this.particles = this.particles.filter((x) => x.life > 0);

    for (const t of this.texts) { t.life -= dt; t.y -= 34 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);

    this.shake = Math.max(0, this.shake - dt * 3.4);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.6);
  }

  get scoreMultiplier() {
    return Math.min(6, 1 + this.combo * 0.18);
  }

  updateEntities(dt) {
    const p = this.player;
    const px = this.camX + this.playerX;
    const half = PLAYER_SIZE / 2;
    const pr = { x: px - half, y: p.y - half, w: PLAYER_SIZE, h: PLAYER_SIZE };

    for (const o of this.obstacles) {
      if (o.type === 'mover') {
        o.phase += dt * o.speed;
        o.y = clamp(o.baseY + Math.sin(o.phase) * o.amp, TOP + 4, BOT - o.h - 4);
      } else if (o.type === 'laser') {
        const t = (this.time * 1000 + o.offset) % o.cycle;
        o.active = t < o.onTime;
        o.warn = !o.active && t > o.cycle - 340;
      } else if (o.type === 'saw') {
        o.spin += dt * 9;
      }

      if (!p.alive) continue;

      const dxRel = o.x + o.w / 2 - px;
      if (Math.abs(dxRel) < 90) {
        if (this.hitsObstacle(pr, o)) { this.kill(o); return; }
        const gap = this.vertGap(pr, o);
        if (gap < o.minGap) o.minGap = gap;
      }
      if (!o.passed && o.x + o.w < px - half) {
        o.passed = true;
        if (o.minGap < NEAR_MISS_GAP) this.registerNearMiss(o);
      }
    }

    // orby
    const magnet = this.active.magnet > 0;
    for (const orb of this.orbs) {
      if (orb.got) continue;
      orb.phase += dt * 3;
      const dx = px - orb.x;
      const dy = p.y - orb.y;
      const d2 = dx * dx + dy * dy;
      if (magnet && d2 < MAGNET_RANGE * MAGNET_RANGE) {
        const d = Math.sqrt(d2) || 1;
        const pull = (1 - d / MAGNET_RANGE) * 900 * dt;
        orb.x += (dx / d) * pull;
        orb.y += (dy / d) * pull;
      }
      if (p.alive && d2 < (half + orb.r + 4) ** 2) this.collectOrb(orb);
    }

    for (const pw of this.powerups) {
      if (pw.got) continue;
      pw.phase += dt * 2.4;
      const dx = px - pw.x;
      const dy = p.y - pw.y;
      if (p.alive && dx * dx + dy * dy < (half + pw.r + 6) ** 2) this.collectPower(pw);
    }
  }

  hitsObstacle(pr, o) {
    if (o.type === 'laser' && !o.active) return false;
    if (!(pr.x < o.x + o.w && pr.x + pr.w > o.x && pr.y < o.y + o.h && pr.y + pr.h > o.y)) return false;

    if (o.type === 'spike') {
      // Kolec to trójkąt — liczymy realną wysokość powierzchni pod graczem.
      const cx = o.x + o.w / 2;
      const nearest = Math.max(0, Math.min(Math.abs(pr.x + pr.w / 2 - cx) - pr.w / 2, o.w / 2));
      const frac = 1 - nearest / (o.w / 2);
      const height = o.h * frac;
      return o.side === 'floor' ? pr.y + pr.h > BOT - height : pr.y < TOP + height;
    }
    if (o.type === 'saw') {
      const cx = o.x + o.r;
      const cy = o.y + o.r;
      const nx = clamp(cx, pr.x, pr.x + pr.w);
      const ny = clamp(cy, pr.y, pr.y + pr.h);
      const dx = cx - nx;
      const dy = cy - ny;
      return dx * dx + dy * dy < (o.r * 0.86) ** 2;
    }
    return true;
  }

  vertGap(pr, o) {
    if (o.type === 'laser' && !o.active) return 999;
    const above = o.y - (pr.y + pr.h);
    const below = pr.y - (o.y + o.h);
    return Math.max(0, Math.max(above, below));
  }

  registerNearMiss(o) {
    this.nearMisses++;
    this.combo++;
    this.comboTimer = COMBO_TIME;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    sfx.near();
    if (this.combo % 5 === 0) {
      this.texts.push({
        x: this.camX + this.playerX + 40, y: this.player.y - 40,
        text: `COMBO x${this.combo}!`, color: '#ffd166', life: 1.1, max: 1.1, size: 20,
      });
      this.shake = Math.min(0.5, this.shake + 0.18);
    }
  }

  collectOrb(orb) {
    orb.got = true;
    this.orbsCollected++;
    this.combo++;
    this.comboTimer = COMBO_TIME;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const pts = Math.round(12 * this.scoreMultiplier * (this.active.x2 > 0 ? 2 : 1));
    this.score += pts;
    sfx.orb(this.combo);
    this.texts.push({ x: orb.x, y: orb.y, text: `+${pts}`, color: '#22e5ff', life: 0.7, max: 0.7, size: 14 });
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 6.283;
      this.particles.push({
        x: orb.x, y: orb.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130,
        life: 0.35, max: 0.35, size: 2 + Math.random() * 2.5, color: '#22e5ff', grav: 0,
      });
    }
  }

  collectPower(pw) {
    pw.got = true;
    this.powerupsTaken++;
    const meta = POWER_META[pw.kind];
    if (pw.kind === 'shield') {
      this.hasShield = true;
      this.active.shield = 1;
    } else {
      this.active[pw.kind] = meta.dur;
      if (pw.kind === 'slow') { this.timeScale = 0.58; setMusicRate(true); }
    }
    sfx.power();
    this.texts.push({ x: pw.x, y: pw.y, text: meta.label, color: meta.color, life: 1.0, max: 1.0, size: 17 });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.283;
      const sp = 90 + Math.random() * 220;
      this.particles.push({
        x: pw.x, y: pw.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.6, max: 0.6, size: 2 + Math.random() * 3, color: meta.color, grav: 0.2,
      });
    }
  }

  kill(source) {
    const p = this.player;
    if (this.hasShield) {
      // Tarcza pochłania jedno trafienie i odrzuca gracza na wolny tor.
      this.hasShield = false;
      this.active.shield = 0;
      this.shake = 0.7;
      this.hitFlash = 1;
      this.freeze = 0.08;
      sfx.shieldHit();
      if (source) source.passed = true;
      p.grav = source && source.side === 'ceil' ? 1 : -1;
      if (source && source.type !== 'spike' && source.type !== 'saw') p.grav = p.y > (TOP + BOT) / 2 ? -1 : 1;
      p.vy = p.grav * 340;
      this.texts.push({ x: this.camX + this.playerX, y: p.y - 46, text: 'TARCZA!', color: '#22e5ff', life: 1, max: 1, size: 20 });
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.283;
        this.particles.push({
          x: this.camX + this.playerX, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
          life: 0.5, max: 0.5, size: 2 + Math.random() * 3, color: '#22e5ff', grav: 0.1,
        });
      }
      return;
    }

    p.alive = false;
    this.state = 'dead';
    this.shake = 1;
    this.freeze = 0.16;
    this.hitFlash = 1;
    this.timeScale = 1;
    setMusicRate(false);
    sfx.death();
    const skin = getSkin(this.skinId);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * 6.283;
      const sp = 60 + Math.random() * 460;
      this.particles.push({
        x: this.camX + this.playerX, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.7, max: 1.2, size: 2 + Math.random() * 4,
        color: Math.random() < 0.5 ? skinColor(skin, this.time) : '#ff5470', grav: 0.7,
      });
    }
    this.hooks.onDeath?.(this.runStats());
  }

  runStats() {
    return {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      orbs: this.orbsCollected,
      combo: this.maxCombo,
      powerups: this.powerupsTaken,
      nearMiss: this.nearMisses,
    };
  }

  hudData() {
    return {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      orbs: this.orbsCollected,
      combo: this.combo,
      comboPct: this.combo > 0 ? this.comboTimer / COMBO_TIME : 0,
      active: { ...this.active, shield: this.hasShield ? 1 : 0 },
    };
  }

  cull() {
    const min = this.camX - 260;
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > min);
    this.orbs = this.orbs.filter((o) => !o.got && o.x + 40 > min);
    this.powerups = this.powerups.filter((o) => !o.got && o.x + 40 > min);
  }

  // ------------------------------------------------------------- render
  render() {
    const ctx = this.ctx;
    const s = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(s, 0, 0, s, 0, this.offsetY * s);

    const shakeAmp = this.reduceFx ? 0 : this.shake * 16;
    const sx = (Math.random() - 0.5) * shakeAmp;
    const sy = (Math.random() - 0.5) * shakeAmp;

    ctx.save();
    ctx.translate(sx, sy);
    this.drawBackground(ctx);
    ctx.save();
    ctx.translate(-this.camX, 0);
    this.drawOrbs(ctx);
    this.drawPowerups(ctx);
    this.drawObstacles(ctx);
    this.drawTrail(ctx);
    this.drawPlayer(ctx);
    this.drawParticles(ctx);
    this.drawTexts(ctx);
    ctx.restore();
    this.drawWalls(ctx);
    ctx.restore();

    if (this.hitFlash > 0.01) {
      ctx.fillStyle = `rgba(255,84,112,${this.hitFlash * 0.32})`;
      ctx.fillRect(0, -this.offsetY, this.viewW, this.viewH);
    }
    this.drawVignette(ctx);
  }

  drawBackground(ctx) {
    const top = -this.offsetY;
    const g = ctx.createLinearGradient(0, top, 0, top + this.viewH);
    g.addColorStop(0, '#080a1c');
    g.addColorStop(0.5, '#0d0a24');
    g.addColorStop(1, '#06060f');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, this.viewW, this.viewH);

    // gwiazdy (paralaksa)
    for (const st of this.stars) {
      const x = ((st.x - this.camX * st.p) % (this.viewW + 200) + this.viewW + 200) % (this.viewW + 200) - 100;
      const a = 0.25 + Math.abs(Math.sin(this.time * 1.5 + st.tw)) * 0.5;
      ctx.fillStyle = `rgba(150,190,255,${a * st.p * 2.4})`;
      ctx.fillRect(x, st.y, st.r, st.r);
    }

    // siatka perspektywiczna
    ctx.strokeStyle = 'rgba(90,120,255,.10)';
    ctx.lineWidth = 1;
    const gp = 0.4;
    const step = 90;
    const off = (this.camX * gp) % step;
    ctx.beginPath();
    for (let x = -off; x < this.viewW + step; x += step) {
      ctx.moveTo(x, TOP);
      ctx.lineTo(x, BOT);
    }
    for (let y = TOP; y <= BOT; y += 71.3) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.viewW, y);
    }
    ctx.stroke();

    // smugi prędkości
    const streaks = this.reduceFx ? 0 : 16;
    ctx.strokeStyle = 'rgba(34,229,255,.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < streaks; i++) {
      const y = TOP + ((i * 137.5 + this.time * 40) % LANE_H);
      const len = 60 + ((i * 53) % 120);
      const x = ((this.camX * 1.6 + i * 311) % (this.viewW + 300)) - 150;
      ctx.moveTo(this.viewW - x, y);
      ctx.lineTo(this.viewW - x - len, y);
    }
    ctx.stroke();
  }

  drawWalls(ctx) {
    const top = -this.offsetY;
    const bottomEdge = top + this.viewH;
    for (const band of [[top, TOP], [BOT, bottomEdge]]) {
      const [y0, y1] = band;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      const down = y0 === BOT;
      g.addColorStop(down ? 0 : 1, '#141a3d');
      g.addColorStop(down ? 1 : 0, '#070818');
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, this.viewW, y1 - y0);
    }
    // neonowe krawędzie toru
    ctx.save();
    ctx.shadowColor = '#22e5ff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#22e5ff';
    ctx.fillRect(0, TOP - 3, this.viewW, 3);
    ctx.fillRect(0, BOT, this.viewW, 3);
    ctx.restore();

    // pasy na ścianach — czytelne odczucie prędkości
    ctx.fillStyle = 'rgba(120,150,255,.16)';
    const step = 64;
    const off = this.camX % step;
    for (let x = -off; x < this.viewW + step; x += step) {
      ctx.fillRect(x, TOP - 22, 30, 8);
      ctx.fillRect(x + 16, BOT + 14, 30, 8);
    }

    // Na wysokich ekranach (telefon w pionie) poza tunelem zostaje sporo miejsca —
    // wypełniamy je uciekającymi w głąb liniami, żeby kadr nie był pustą czernią.
    const margin = this.offsetY;
    if (margin > 24) {
      ctx.save();
      const rows = Math.min(9, Math.floor(margin / 26));
      for (let i = 1; i <= rows; i++) {
        const t = i / rows;
        const alpha = 0.12 * (1 - t);
        const spacing = 90 + i * 34;
        const drift = (this.camX * (0.5 - t * 0.4)) % spacing;
        ctx.strokeStyle = `rgba(90,130,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const y of [TOP - 30 - i * 26, BOT + 30 + i * 26]) {
          ctx.moveTo(0, y);
          ctx.lineTo(this.viewW, y);
        }
        ctx.stroke();
        ctx.fillStyle = `rgba(34,229,255,${(alpha * 1.6).toFixed(3)})`;
        for (let x = -drift; x < this.viewW + spacing; x += spacing) {
          ctx.fillRect(x, TOP - 33 - i * 26, 22, 3);
          ctx.fillRect(x + spacing / 2, BOT + 30 + i * 26, 22, 3);
        }
      }
      ctx.restore();
    }
  }

  drawObstacles(ctx) {
    const left = this.camX - 80;
    const right = this.camX + this.viewW + 80;
    for (const o of this.obstacles) {
      if (o.x > right || o.x + o.w < left) continue;
      switch (o.type) {
        case 'spike': this.drawSpike(ctx, o); break;
        case 'saw': this.drawSaw(ctx, o); break;
        case 'laser': this.drawLaser(ctx, o); break;
        default: this.drawBlock(ctx, o);
      }
    }
  }

  drawSpike(ctx, o) {
    const cx = o.x + o.w / 2;
    ctx.save();
    ctx.shadowColor = '#ff5470';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff5470';
    ctx.beginPath();
    if (o.side === 'floor') {
      ctx.moveTo(o.x, BOT);
      ctx.lineTo(cx, BOT - o.h);
      ctx.lineTo(o.x + o.w, BOT);
    } else {
      ctx.moveTo(o.x, TOP);
      ctx.lineTo(cx, TOP + o.h);
      ctx.lineTo(o.x + o.w, TOP);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    if (o.side === 'floor') {
      ctx.moveTo(cx - 4, BOT - 4);
      ctx.lineTo(cx, BOT - o.h);
      ctx.lineTo(cx + 2, BOT - 4);
    } else {
      ctx.moveTo(cx - 4, TOP + 4);
      ctx.lineTo(cx, TOP + o.h);
      ctx.lineTo(cx + 2, TOP + 4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawBlock(ctx, o) {
    ctx.save();
    ctx.shadowColor = '#ff3ea5';
    ctx.shadowBlur = 18;
    const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
    g.addColorStop(0, '#3a1046');
    g.addColorStop(1, '#1b0a2c');
    ctx.fillStyle = g;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = '#ff3ea5';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,62,165,.35)';
    ctx.lineWidth = 1;
    for (let y = o.y + 10; y < o.y + o.h - 6; y += 14) {
      ctx.beginPath();
      ctx.moveTo(o.x + 5, y);
      ctx.lineTo(o.x + o.w - 5, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSaw(ctx, o) {
    const cx = o.x + o.r;
    const cy = o.y + o.r;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(o.spin);
    ctx.shadowColor = '#ff5470';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#c9d2ff';
    ctx.beginPath();
    const teeth = 10;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? o.r : o.r * 0.72;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff5470';
    ctx.beginPath();
    ctx.arc(0, 0, o.r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLaser(ctx, o) {
    const base = o.side === 'floor' ? BOT : TOP;
    const tip = o.side === 'floor' ? BOT - o.h : TOP + o.h;
    ctx.save();
    if (o.active) {
      ctx.shadowColor = '#ff5470';
      ctx.shadowBlur = 26;
      const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
      g.addColorStop(0, 'rgba(255,84,112,.25)');
      g.addColorStop(0.5, '#fff');
      g.addColorStop(1, 'rgba(255,84,112,.25)');
      ctx.fillStyle = g;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,84,112,.5)';
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, tip, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Faza ostrzegawcza: kreska gęstnieje tuż przed zapłonem.
      ctx.setLineDash([9, 11]);
      ctx.strokeStyle = o.warn ? 'rgba(255,84,112,.9)' : 'rgba(255,84,112,.25)';
      ctx.lineWidth = o.warn ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(o.x + o.w / 2, base);
      ctx.lineTo(o.x + o.w / 2, tip);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = o.active ? '#ff5470' : o.warn ? '#a03a58' : '#5b3050';
    const ey = o.side === 'floor' ? BOT : TOP - 12;
    ctx.fillRect(o.x - 6, ey, o.w + 12, 12);
    ctx.restore();
  }

  drawOrbs(ctx) {
    const left = this.camX - 60;
    const right = this.camX + this.viewW + 60;
    ctx.save();
    for (const o of this.orbs) {
      if (o.got || o.x < left || o.x > right) continue;
      const pulse = 1 + Math.sin(o.phase) * 0.14;
      ctx.shadowColor = '#22e5ff';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#22e5ff';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(o.x - 2, o.y - 2, o.r * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPowerups(ctx) {
    const left = this.camX - 60;
    const right = this.camX + this.viewW + 60;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pw of this.powerups) {
      if (pw.got || pw.x < left || pw.x > right) continue;
      const meta = POWER_META[pw.kind];
      const bob = Math.sin(pw.phase) * 6;
      ctx.save();
      ctx.translate(pw.x, pw.y + bob);
      ctx.rotate(Math.sin(pw.phase * 0.6) * 0.25);
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(6,8,20,.9)';
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-pw.r, -pw.r, pw.r * 2, pw.r * 2, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = meta.color;
      ctx.font = 'bold 15px system-ui,sans-serif';
      ctx.fillText(pw.kind === 'shield' ? 'S' : pw.kind === 'magnet' ? 'M' : pw.kind === 'slow' ? '⏱' : '2', 0, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  drawTrail(ctx) {
    if (this.trail.length < 2) return;
    const skin = getSkin(this.skinId);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = i / this.trail.length;
      const p0 = this.trail[i - 1];
      const p1 = this.trail[i];
      ctx.strokeStyle = trailColor(skin, this.time + i * 0.05);
      ctx.globalAlpha = a * 0.5;
      ctx.lineWidth = a * PLAYER_SIZE * 0.8;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx) {
    const p = this.player;
    if (!p.alive) return;
    const x = this.camX + this.playerX;
    const skin = getSkin(this.skinId);
    if (this.hasShield) {
      ctx.save();
      ctx.strokeStyle = '#22e5ff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#22e5ff';
      ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.75 + Math.sin(this.time * 8) * 0.2;
      ctx.beginPath();
      ctx.arc(x, p.y, PLAYER_SIZE * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const glow = 1 + Math.min(1.2, this.combo * 0.08);
    drawSkin(ctx, skin, x, p.y, PLAYER_SIZE, this.time, glow);
  }

  drawParticles(ctx) {
    ctx.save();
    for (const pt of this.particles) {
      const a = Math.max(0, pt.life / pt.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = Math.max(0, t.life / t.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      ctx.font = `900 ${t.size}px system-ui,'Segoe UI',sans-serif`;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawVignette(ctx) {
    const top = -this.offsetY;
    const g = ctx.createRadialGradient(
      this.viewW / 2, top + this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.32,
      this.viewW / 2, top + this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.72,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, this.viewW, this.viewH);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
  }
}
