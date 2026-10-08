'use strict';
// ТУН ТУН ФЕРМА: breed AI critters, hatch Tun Tun Sahurs, bonk drones, befriend or conquer the neighbours.
// World coordinates are tiles: our farm's grid starts at 0,0 and the neighbour farms sit around it.
// Flying things have a height `alt`; sahurs jump with `z`.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLS = 7, ROWS = 5, BARN_C = 3, BARN_R = 2;
const PEN_CAP = 3, BREED_TIME = 20, PROD_TIME = 5, GRAB_TIME = 1.1, HUT_TIME = 6, HANGAR_TIME = 25, EGG_TIME = 1.6;
const ALT = 0.42, BOMBER_ALT = 0.85, HANGAR_CAP = 2;
const AI_BARN_INCOME = 0.6, AI_CRITTER_INCOME = 0.5;   // neighbours earn less than us
const BUILD_HP = { barn: 200, pen: 70, hut: 90, hangar: 110 };
const TOOLS = [{ id: 'pen', key: '1' }, { id: 'hut', key: '2' }, { id: 'hangar', key: '3' }, { id: 'weapon', key: '4' }, { id: 'gym', key: '5' }];
const WORLD = { l: -8.5, r: 15.5, t: -8.5, b: 13.5 };   // camera limits
const SPAWN = { l: -11, r: 18, t: -11, b: 16 };          // wild drones appear and flee here
const MINI = { w: 190, h: 170 };

const view = { W: 0, H: 0, dpr: 1, T: 80, gx: 0, gy: 0, midY: 0, fitT: 80 };
const cam = { x: COLS / 2, y: ROWS / 2, T: 0, tT: 0, ax: null, ay: null, fly: null, drag: null };
const keys = new Set();
let grassPattern = null, coinTarget = null;
const sx = x => view.gx + x * view.T;
const sy = y => view.gy + y * view.T;
const wxOf = px => (px - view.gx) / view.T;
const wyOf = py => (py - view.gy) / view.T;

const mouse = { x: -999, y: -999, over: false, touch: false, swing: 0, mini: false };
let S = null;            // the running world (a self-playing demo behind the title screen)
let mode = 'title';      // title | play | pause | over | win
let tool = null;         // building type while placing
let hoverTool = null;
let pop = null;          // open popup: { kind, target, key, t, el }
let bubbles = [];
let best = 0;
try { best = +localStorage.getItem('tt_best') || 0; } catch (e) { /* storage unavailable */ }

// ---------------------------------------------------------------- view & camera

function layout() {
  const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  Object.assign(view, { W, H, dpr });
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const top = 76, bottom = 118, oldFit = view.fitT;
  view.fitT = Math.floor(clamp(Math.min((W - 2 * Math.max(250, W * 0.18)) / COLS, (H - top - bottom) / (ROWS + 0.7)), 44, 120));
  view.midY = top + (H - top - bottom) / 2;
  if (!cam.T) cam.T = cam.tT = view.fitT;
  else {
    cam.T *= view.fitT / oldFit;
    cam.tT *= view.fitT / oldFit;
  }
  Art.setDpr(dpr);
  if (!grassPattern) grassPattern = ctx.createPattern(Art.grassTile(), 'repeat');
  applyCam();
  coinTarget = null;
}

function applyCam() {
  view.T = cam.T;
  view.gx = view.W / 2 - cam.x * cam.T;
  view.gy = view.midY - cam.y * cam.T;
}

function zoomAt(factor, px, py) {
  cam.tT = clamp(cam.tT * factor, view.fitT * 0.3, view.fitT * 1.5);
  cam.ax = px;
  cam.ay = py;
}

function flyTo(x, y) {
  cam.fly = { x, y };
}

function updateCam(dt) {
  if (Math.abs(cam.T - cam.tT) > 0.05) {
    const ax = cam.ax ?? view.W / 2, ay = cam.ay ?? view.midY;
    applyCam();
    const wx = wxOf(ax), wy = wyOf(ay);
    cam.T = lerp(cam.T, cam.tT, Math.min(1, dt * 12));
    applyCam();
    cam.x += wx - wxOf(ax);
    cam.y += wy - wyOf(ay);
  }
  if (cam.fly) {
    const k = Math.min(1, dt * 5);
    cam.x = lerp(cam.x, cam.fly.x, k);
    cam.y = lerp(cam.y, cam.fly.y, k);
    if (Math.hypot(cam.x - cam.fly.x, cam.y - cam.fly.y) < 0.02) cam.fly = null;
  }
  const sp = (700 / cam.T) * dt;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) cam.x -= sp;
  if (keys.has('KeyD') || keys.has('ArrowRight')) cam.x += sp;
  if (keys.has('KeyW') || keys.has('ArrowUp')) cam.y -= sp;
  if (keys.has('KeyS') || keys.has('ArrowDown')) cam.y += sp;
  if (mode === 'title') {
    cam.x = 3.5 + Math.sin(S.time * 0.07) * 4;
    cam.y = 2.5 + Math.sin(S.time * 0.05) * 3;
  }
  cam.x = clamp(cam.x, WORLD.l, WORLD.r);
  cam.y = clamp(cam.y, WORLD.t, WORLD.b);
  applyCam();
}

const onScreen = (x, y, m = 1) => {
  const px = sx(x), py = sy(y), M = m * view.T;
  return px > -M && px < view.W + M && py > -M && py < view.H + M;
};
const screenBounds = () => ({ l: wxOf(0), r: wxOf(view.W), t: wyOf(0), b: wyOf(view.H) });

// ---------------------------------------------------------------- tiles & state

const tkey = (c, r) => (c + 64) * 256 + (r + 64);
const tileAt = (c, r) => S.tiles.get(tkey(c, r)) || null;
const tileAtWorld = (x, y) => tileAt(Math.floor(x), Math.floor(y));
const tileAtScreen = (px, py) => tileAtWorld(wxOf(px), wyOf(py));

function newGame(demo) {
  S = {
    demo, time: 0, wave: demo ? 4 : 0, phase: 'prep', phaseT: demo ? 1.5 : 16, phaseMax: 16,
    queue: [], spawnT: 0, spawnInterval: 2, waveTotal: 1, waveT: 0,
    tiles: new Map(), farms: [], rel: [], me: null, anyWar: false,
    buildings: [], sahurs: [], drones: [], bombs: [], runners: [], envoys: [], parts: [], texts: [], flyCoins: [], pickups: [],
    golden: null, banners: [], event: null, eventT: rand(25, 40), lastEvent: null,
    mods: { droneSpeed: 1, breed: 1, mut: 0, income: 1 },
    demandCD: 90, combo: 0, comboT: 0, shake: 0, slowmo: 0, flash: 0, flashColor: '#fff', bumpT: 0, eggNagT: 0, rate: 0, rateT: 0,
    over: false, won: false, uid: 1,
    stats: { kills: 0, born: 0, mutations: 0, stolen: 0, annexed: 0, raids: 0, bestR: 0, bestName: SPECIES.banana.name },
  };
  initFarms(demo);
  tool = null;
  closePopup();
  cam.fly = null;
  cam.x = COLS / 2;
  cam.y = ROWS / 2;
  cam.T = cam.tT = demo ? view.fitT * 0.5 : view.fitT * 0.85;
  applyCam();
}

function placeBuilding(type, t, owner) {
  const b = {
    id: S.uid++, type, owner, c: t.c, r: t.r, x: t.c + 0.5, y: t.r + 0.5,
    hp: BUILD_HP[type], maxHp: BUILD_HP[type], hitT: 99, flash: 0, anim: 0, dead: false,
    seed: (Math.random() * 1e6) | 0, creatures: [], breed: 0, egg: null, spawnT: 0, incT: 0, count: 0, planes: 0,
    hq: false, trophy: false, wall: owner.wall, roof: owner.roof, mascot: owner.mascot,
  };
  t.b = b;
  t.unlocked = true;
  S.buildings.push(b);
  return b;
}

function newCritter(sp) {
  return {
    id: S.uid++, sp, pen: null, ox: rand(-0.25, 0.25), oy: rand(-0.06, 0.25), tx: 0, ty: 0, moveT: 0, walk: 0,
    flip: Math.random() < 0.5, prodT: rand(0, PROD_TIME), sayT: rand(2, 14), say: null, sayLife: 0,
    grabbedBy: null, hunted: null, lift: 0, born: 0, look: null, panic: false,
  };
}

function addCreature(pen, sp, born = 0) {
  const c = newCritter(sp);
  c.pen = pen;
  c.born = born;
  c.tx = c.ox;
  c.ty = c.oy;
  pen.creatures.push(c);
  if (pen.owner === S.me && SPECIES[sp].r >= S.stats.bestR) {
    S.stats.bestR = SPECIES[sp].r;
    S.stats.bestName = SPECIES[sp].name;
  }
  return c;
}

function insertCreature(pen, c, x, y) {
  Object.assign(c, { pen, grabbedBy: null, hunted: null, lift: 0, born: 0.5, moveT: 0 });
  c.ox = c.tx = clamp(x - pen.x, -0.28, 0.28);
  c.oy = c.ty = clamp(y - pen.y, -0.06, 0.27);
  pen.creatures.push(c);
}

function removeCritter(c) {
  const pen = c.pen;
  if (!pen) return;
  pen.creatures.splice(pen.creatures.indexOf(c), 1);
  if (c.hunted && c.hunted.prey === c) c.hunted.prey = null;
  c.pen = null;
}

function penWithRoom(owner, prefer) {
  if (prefer && !prefer.dead && prefer.type === 'pen' && prefer.owner === owner && prefer.creatures.length < PEN_CAP) return prefer;
  const list = S.buildings.filter(b => b.type === 'pen' && b.owner === owner && !b.dead && b.creatures.length < PEN_CAP);
  return list.length ? pick(list) : null;
}

function allCritters(owner) {
  const out = [];
  for (const b of S.buildings) if (b.type === 'pen' && !b.dead && (!owner || b.owner === owner)) out.push(...b.creatures);
  return out;
}

function spawnSahur(owner, home, x, y) {
  const own = S.buildings.filter(b => b.owner === owner && !b.dead);
  const s = {
    id: S.uid++, owner, home, base: home || pick(own) || owner.barn, x, y, z: 0, vz: 0, vx: 0, vy: 0,
    ax: rand(-0.4, 0.4), ay: rand(0, 0.25), hp: 5 + owner.sahurLvl, maxHp: 5 + owner.sahurLvl,
    mode: 'guard', goal: null, bTarget: null, state: 'idle', t: 0, cd: 0.4, target: null,
    fx: 0, fy: 0, tx: 0, ty: 0, z0: 0, arc: 0, dur: 0.3, flip: Math.random() < 0.5, walk: 0, bat: -1.1,
    squash: 0, retarget: rand(1, 3), chain: 0, flash: 0, swingT: 0, isSahur: true, r: 0.16, dead: false, _aim: 0,
  };
  S.sahurs.push(s);
  return s;
}

function pickTargetFarm() {
  if (S.me.alive && !S.demo && Math.random() < 0.62) return S.me;
  return pick(S.farms.filter(f => f.alive));
}

function spawnDrone(type, side, at) {
  const D = DRONES[type];
  let x, y;
  if (at) {
    x = at.x;
    y = at.y;
  } else {
    if (side == null) side = randi(0, 3);
    if (side === 0) { x = rand(SPAWN.l, SPAWN.r); y = SPAWN.t; }
    else if (side === 1) { x = SPAWN.r; y = rand(SPAWN.t, SPAWN.b); }
    else if (side === 2) { x = rand(SPAWN.l, SPAWN.r); y = SPAWN.b; }
    else { x = SPAWN.l; y = rand(SPAWN.t, SPAWN.b); }
  }
  const w = Math.max(1, S.wave), hp = D.hp(w);
  const d = {
    id: S.uid++, type, owner: null, farm: type === 'boss' ? S.me : pickTargetFarm(), x, y, vx: 0, vy: 0, hp, maxHp: hp,
    r: D.r, speed: D.speed(w), state: 'seek', t: 0, seed: Math.random() * 10, flash: 0, stun: 0,
    alt: at ? 0.05 : ALT * (type === 'boss' ? 1.4 : 1), goal: null, prey: null, carry: null, grabT: 0,
    firing: false, wasFiring: false, spawnT: 5, laserT: 0, dead: false, tilt: 0, _aim: 0,
  };
  S.drones.push(d);
  return d;
}

function spawnBomber(owner, hangar, target) {
  const hp = 5 + 2 * owner.sahurLvl;
  const d = {
    id: S.uid++, type: 'bomber', owner, home: hangar, target, x: hangar.x, y: hangar.y, vx: 0, vy: 0, hp, maxHp: hp,
    r: DRONES.bomber.r, speed: 2.1, state: 'go', t: 0, seed: Math.random() * 10, flash: 0, stun: 0, alt: 0.1,
    goal: null, bombs: 3, bombT: 0, dead: false, tilt: 0, _aim: 0,
  };
  S.drones.push(d);
  sfxAt('whistle', hangar.x, hangar.y);
  return d;
}

// ---------------------------------------------------------------- economy & rolls

const price = (f, type) => PRICE[type](f.built[type]);
const sahurCap = f => 3 + Math.floor(f.sahurLvl / 2);

function sahurStats(f) {
  const L = f.sahurLvl, party = f.player && S.event && S.event.id === 'party';
  return { dmg: 1 + L, range: (3 + 0.25 * L) * (party ? 1.4 : 1), cd: (0.75 - 0.07 * L) / (party ? 2.2 : 1), bash: 1 + L * 0.5 };
}

function rollSeed(lucky) {
  const w = lucky ? [20, 35, 28, 13, 4] : [55, 30, 11, 3.4, 0.6];
  let r = Math.random() * w.reduce((a, b) => a + b, 0), tier = 0;
  while (r > w[tier]) r -= w[tier++];
  return pick(BY_RARITY[Math.min(4, tier)]);
}

function rollChild(a, b) {
  let r = Math.random();
  if (r < 0.035) return 'SAHUR';
  if (S.wave >= 2 && r < 0.055) return 'DRONE';
  const rec = RECIPES[[a, b].sort().join('+')];
  if (rec) for (const [out, p] of rec) if (Math.random() < p) return out;
  const top = Math.max(SPECIES[a].r, SPECIES[b].r);
  r = Math.random();
  let tier;
  if (r < 0.03 + S.mods.mut * 0.2) tier = top + 2;
  else if (r < 0.2 + S.mods.mut) tier = top + 1;
  else if (r < 0.6) return Math.random() < 0.5 ? a : b;
  else tier = top - (Math.random() < 0.5 ? 1 : 0);
  return pick(BY_RARITY[clamp(tier, 0, 4)]);
}

function addCoins(f, n, px, py) {
  if (!f) return;
  f.coins += n;
  if (!f.player || px == null || S.demo) return;
  for (let i = 0; i < Math.min(6, Math.ceil(n / 3)); i++) {
    S.flyCoins.push({ x: px + rand(-10, 10), y: py + rand(-10, 10), t: -i * 0.05, dur: rand(0.5, 0.8), cx: px + rand(-90, 90), cy: py - rand(40, 150) });
  }
}

function spend(n) {
  if (S.me.coins < n) {
    deny('Не хватает монет');
    return false;
  }
  S.me.coins -= n;
  return true;
}

// ---------------------------------------------------------------- feedback helpers

function sfx(name, arg, player) {
  if (S && S.demo && !player) return;
  AudioFX.play(name, arg);
}

function sfxAt(name, x, y, arg) {
  if (onScreen(x, y, 0.5)) sfx(name, arg);
}

function part(o) {
  S.parts.push(Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 1, max: 1, size: 0.05, color: '#fff', kind: 'dot', rot: 0, vr: 0, grow: 0 }, o));
}

function floatText(x, y, str, color, size = 0.2, life = 1) {
  if (!onScreen(x, y, 1)) return;
  if (S.texts.length > 60) S.texts.shift();
  S.texts.push({ x, y, str, color, size, life, max: life, t: 0 });
}

function banner(title, sub, color) {
  if (S.demo) return;
  if (S.banners.length > 2) S.banners.splice(1, 1);
  S.banners.push({ title, sub, color, t: 0, dur: 2.6 });
}

function toast(html, cls = '') {
  if (!S || S.demo) return;
  const feed = $('feed');
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.innerHTML = html;
  feed.prepend(el);
  while (feed.children.length > 6) feed.lastChild.remove();
  setTimeout(() => el.remove(), 5200);
}

function deny(msg) {
  S.texts.push({ x: wxOf(mouse.x), y: wyOf(mouse.y) - 0.3, str: msg, color: '#ff8a9a', size: 0.15, life: 1.1, max: 1.1, t: 0 });
  sfx('deny', 0, true);
}

function shakeAt(x, y, amount) {
  if (onScreen(x, y, 2)) S.shake = Math.max(S.shake, amount);
}

function boomFx(x, y, size, metal) {
  if (!onScreen(x, y, 2)) return;
  part({ kind: 'flash', x, y, size: 0.5 * size, life: 0.18, max: 0.18 });
  part({ kind: 'ring', x, y, size: 0.1, grow: 1.2 * size, life: 0.35, max: 0.35, color: '#fff' });
  for (let i = 0; i < 10 * size; i++) {
    const a = rand(0, 6.28), v = rand(1.5, 4.5) * Math.sqrt(size);
    part({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.2, 0.5), max: 0.5, color: pick(['#ffd84a', '#ff8a3d', '#fff']) });
  }
  for (let i = 0; i < 5 * size; i++) {
    part({ kind: 'smoke', x: x + rand(-0.1, 0.1), y, vx: rand(-0.6, 0.6), vy: rand(-0.8, -0.1), life: rand(0.6, 1.1), max: 1.1, size: rand(0.08, 0.16) * Math.sqrt(size) });
  }
  if (metal) {
    for (let i = 0; i < 5 * size; i++) {
      part({ kind: 'debris', x, y, vx: rand(-2.5, 2.5), vy: rand(-3, -0.5), g: 9, life: rand(0.6, 1), max: 1, size: rand(0.03, 0.07), color: pick(['#3f4657', '#8a93a6', '#222', '#3fc1f2']), vr: rand(-15, 15) });
    }
  }
}

function chips(x, y, n = 6) {
  if (!onScreen(x, y, 1)) return;
  for (let i = 0; i < n; i++) {
    part({ kind: 'debris', x, y, vx: rand(-2, 2), vy: rand(-2.5, -0.5), g: 8, life: rand(0.4, 0.8), max: 0.8, size: rand(0.03, 0.05), color: pick(['#c08048', '#87522c', '#efc489']), vr: rand(-15, 15) });
  }
}

function sparkle(x, y, color = '#ffd84a', n = 8) {
  if (!onScreen(x, y, 1)) return;
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.28), v = rand(0.5, 2);
    part({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.5, life: rand(0.4, 0.8), max: 0.8, size: rand(0.03, 0.06), color });
  }
}

function dust(x, y) {
  if (!onScreen(x, y, 1)) return;
  for (let i = 0; i < 4; i++) {
    part({ kind: 'smoke', x: x + rand(-0.1, 0.1), y, vx: rand(-0.5, 0.5), vy: rand(-0.3, 0), life: 0.4, max: 0.4, size: 0.05, color: 'rgba(230,210,170,' });
  }
}

// ---------------------------------------------------------------- waves & events

function makeWave(w) {
  const q = [];
  const n = 5 + Math.floor(w * 3);
  const kamiP = w < 2 ? 0 : Math.min(0.45, 0.28 + w * 0.015);
  for (let i = 0; i < n; i++) q.push(Math.random() < kamiP ? 'kami' : 'thief');
  if (w >= 4) for (let i = 0; i < Math.floor((w - 2) / 2); i++) q.push('tank');
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  if (w % 5 === 0) q.splice(Math.floor(q.length / 3), 0, 'boss');
  return q;
}

function startWave() {
  S.wave++;
  S.phase = 'fight';
  S.queue = makeWave(S.wave);
  S.waveTotal = S.queue.length;
  S.spawnInterval = Math.max(0.25, 1.8 - S.wave * 0.1);
  S.spawnT = 1;
  S.waveT = 0;
  const boss = S.wave % 5 === 0;
  banner(`ВОЛНА ${S.wave}`, boss ? 'ЛЕТИТ МЕГАДРОН-3000' : pick(WAVE_SUBS), boss ? '#ff4f6d' : '#ffd84a');
  sfx('alarm');
  if (!S.demo) AudioFX.setLevel(boss ? 2 : 1);
}

function waveCleared() {
  const bonus = 15 + S.wave * 8;
  addCoins(S.me, bonus, view.W / 2, view.H * 0.3);
  S.phase = 'break';
  S.phaseT = S.phaseMax = S.demo ? 2 : 12;
  banner('ВОЛНА ОТБИТА!', `+${bonus} 🪙`, '#7dff6a');
  sfx('win');
  if (!S.demo) AudioFX.setLevel(0);
}

function nextWaveNow() {
  if (S.phase === 'fight' || S.over) return;
  addCoins(S.me, Math.round(S.phaseT * (2 + S.wave)), view.W / 2, 90);
  startWave();
}

function updateWaves(dt) {
  if (S.phase !== 'fight') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) startWave();
    return;
  }
  S.spawnT -= dt * (S.event && S.event.id === 'energy' ? 1.3 : 1);
  if (S.spawnT <= 0 && S.queue.length) {
    const burst = Math.random() < 0.2 ? randi(2, 4) : 1, side = randi(0, 3);
    for (let i = 0; i < burst && S.queue.length; i++) spawnDrone(S.queue.shift(), side);
    S.spawnT = S.spawnInterval * rand(0.6, 1.4) * (burst > 1 ? 1.8 : 1);
  }
  if (!S.queue.length) {
    S.waveT += dt;
    // stragglers pestering the neighbours shouldn't hold the next wave forever
    if (!S.drones.some(d => !d.owner) || S.waveT > 40) waveCleared();
  }
}

function pickEvent() {
  const ok = id => {
    if (id === S.lastEvent) return false;
    if (id === 'feud') return S.farms.filter(f => !f.player && f.alive).length >= 2;
    if (id === 'betray') return !warsWithMe() && S.farms.some(f => !f.player && f.alive && relOf(f, S.me) === 'ally');
    return true;
  };
  const ids = Object.keys(EVENTS).filter(ok);
  let r = Math.random() * ids.reduce((a, id) => a + EVENTS[id].w, 0);
  for (const id of ids) {
    r -= EVENTS[id].w;
    if (r <= 0) return id;
  }
  return ids[0];
}

function startEvent(id) {
  const E = EVENTS[id];
  let sub = E.sub;
  S.lastEvent = id;
  if (E.dur) S.event = { id, t: E.dur, acc: 0 };
  if (id === 'golden') spawnGolden();
  else if (id === 'swarm') {
    const side = randi(0, 3), n = 8 + S.wave;
    for (let i = 0; i < n; i++) spawnDrone('mini', side).farm = S.me.alive ? S.me : pickTargetFarm();
    S.waveTotal += n;
  } else if (id === 'tax') {
    const lose = Math.floor(S.me.coins * 0.15);
    S.me.coins -= lose;
    sub = `-${lose} 🪙. просто так.`;
  } else if (id === 'wallet') {
    const gain = 40 + S.wave * 15;
    addCoins(S.me, gain, view.W / 2, view.H * 0.3);
    sub = `+${gain} 🪙 лежало в траве`;
  } else if (id === 'sahurrain') {
    for (let i = randi(3, 5); i > 0; i--) {
      const s = spawnSahur(S.me, null, rand(0.5, COLS - 0.5), rand(0.5, ROWS - 0.3));
      s.state = 'fall';
      s.z = rand(5, 8);
    }
  } else if (id === 'zap') {
    const all = allCritters(S.me).filter(c => !c.grabbedBy);
    if (all.length) {
      const c = pick(all), old = SPECIES[c.sp];
      c.sp = rollSeed(true);
      const nw = SPECIES[c.sp];
      sub = `${old.name} → ${nw.name}`;
      sparkle(c.pen.x + c.ox, c.pen.y + c.oy - 0.3, RARITY[nw.r].color, 16);
      if (nw.r >= S.stats.bestR) {
        S.stats.bestR = nw.r;
        S.stats.bestName = nw.name;
      }
    } else sub = 'облучать некого';
  } else if (id === 'feud') {
    const ns = S.farms.filter(f => !f.player && f.alive).sort(() => Math.random() - 0.5);
    const [a, b] = ns;
    setRel(a, b, 'war', true);
    sub = `${a.name} против ${b.name}. можно смотреть`;
  } else if (id === 'betray') {
    const a = pick(S.farms.filter(f => !f.player && f.alive && relOf(f, S.me) === 'ally'));
    setRel(a, S.me, 'war', true);
    sub = `${a.name} нарушили союз. ВОЙНА`;
    sfx('horn');
  }
  banner(E.title, sub, E.color);
  sfx('event', E.good);
}

function updateEvents(dt) {
  if (S.event) {
    S.event.t -= dt;
    const id = S.event.id;
    if (id === 'coinrain') {
      S.event.acc += dt;
      const B = screenBounds();
      while (S.event.acc > 0.12) {
        S.event.acc -= 0.12;
        S.pickups.push({ x: rand(B.l + 0.4, B.r - 0.4), y: rand(B.t + 1, B.b - 1), z: rand(4, 7), vz: 0, life: 5, val: 3 + Math.floor(S.wave / 2) });
      }
    } else if (id === 'radio' && Math.random() < dt * 30) {
      const B = screenBounds();
      part({ kind: 'drop', x: rand(B.l, B.r), y: B.t, vy: 9, life: 2, max: 2, size: 0.04, color: '#8dff5a' });
    } else if (id === 'party' && Math.random() < dt * 20) {
      const B = screenBounds();
      part({ kind: 'debris', x: rand(B.l, B.r), y: B.t, vx: rand(-0.5, 0.5), vy: rand(1, 2), g: 1, life: 4, max: 4, size: 0.05, color: `hsl(${randi(0, 360)},100%,60%)`, vr: rand(-8, 8) });
    }
    if (S.event.t <= 0) S.event = null;
  }
  if (S.phase === 'fight' && (S.wave >= 2 || S.demo) && !S.event) {
    S.eventT -= dt;
    if (S.eventT <= 0) {
      startEvent(pickEvent());
      S.eventT = rand(30, 50);
    }
  }
}

function spawnGolden() {
  const B = screenBounds(), left = Math.random() < 0.5;
  S.golden = { x: left ? B.l - 0.5 : B.r + 0.5, y: rand(B.t + 1.5, B.b - 1.5), vx: (left ? 1 : -1) * 1.5, vy: 0, hp: 4, t: 0, walk: 0 };
}

function updateGolden(dt) {
  const g = S.golden;
  if (!g) return;
  g.t += dt;
  g.walk += dt * 26;
  if (Math.random() < dt * 1.2) g.vy = rand(-1.2, 1.2);
  g.x += g.vx * dt;
  g.y += g.vy * dt;
  if (Math.random() < dt * 6) sparkle(g.x, g.y - 0.3, '#ffd84a', 1);
  if (g.t > 25 || !onScreen(g.x, g.y, 2)) {
    S.golden = null;
    toast('✨ Золотая вишня убежала', 'warn');
  }
}

function hitGolden() {
  const g = S.golden;
  g.hp--;
  if (Math.random() < 0.5) g.vx *= -1;
  g.vx *= 1.12;
  g.vy = rand(-2, 2);
  sparkle(g.x, g.y - 0.3, '#ffd84a', 10);
  sfx('slap', S.me.weapon, true);
  if (g.hp > 0) {
    floatText(g.x, g.y - 0.6, pick(['ЛОВИ!', 'ЕЩЁ!', 'ПОЧТИ!']), '#ffd84a', 0.18);
    return;
  }
  S.golden = null;
  const pen = penWithRoom(S.me);
  if (pen) {
    addCreature(pen, 'gold', 1);
    banner('ЗОЛОТАЯ ВИШНЯ ТВОЯ', `+${RARITY[4].income} 🪙 каждые 5 секунд`, '#ffd84a');
  } else {
    addCoins(S.me, 400, sx(g.x), sy(g.y));
    banner('ЗОЛОТАЯ ВИШНЯ', 'мест нет, продана за 400 🪙', '#ffd84a');
  }
  sfx('mutation');
}

// ---------------------------------------------------------------- buildings, pens, critters

function updateBuildings(dt) {
  for (const b of S.buildings) {
    if (b.dead) continue;
    b.anim += dt;
    b.hitT += dt;
    b.flash = Math.max(0, b.flash - dt * 4);
    if (b.hitT > 5 && b.hp > 0 && b.hp < b.maxHp) {
      // a besieged neighbour HQ heals slowly, otherwise it would be full again before the next raid
      const regen = b.hq && !b.owner.player && atWar(b.owner) ? 0.4 : 2;
      b.hp = Math.min(b.maxHp, b.hp + dt * regen);
    }
    if (b.hp > 0 && b.hp < b.maxHp * 0.4 && Math.random() < dt * 3 && onScreen(b.x, b.y)) {
      part({ kind: 'smoke', x: b.x + rand(-0.25, 0.25), y: b.y - 0.3, vx: rand(-0.1, 0.1), vy: -0.5, life: 1.4, max: 1.4, size: 0.08 });
    }
    if (b.type === 'pen') updatePen(b, dt);
    else if (b.type === 'hut') updateHut(b, dt);
    else if (b.type === 'hangar') updateHangar(b, dt);
    else if (!S.over && b.hp > 0) {
      // barns pay their owner
      const inc = b.trophy ? 1.5 : b.owner.player ? 1 : AI_BARN_INCOME;
      b.owner.coins += inc * dt;
    }
  }
  S.buildings = S.buildings.filter(b => !b.dead);
}

function updatePen(b, dt) {
  const free = b.creatures.filter(c => !c.grabbedBy);
  if (!b.egg && free.length >= 2) {
    b.breed += (dt * S.mods.breed) / BREED_TIME;
    if (Math.random() < dt * 1.2 && onScreen(b.x, b.y)) part({ kind: 'heart', x: b.x + rand(-0.25, 0.25), y: b.y - 0.1, vy: -0.6, life: 1, max: 1, size: 0.07 });
    if (b.breed >= 1) {
      b.breed = 0;
      const [p1, p2] = free.slice().sort(() => Math.random() - 0.5);
      b.egg = { sp: rollChild(p1.sp, p2.sp), pr: Math.max(SPECIES[p1.sp].r, SPECIES[p2.sp].r), t: 0, wait: false };
      sfxAt('pop', b.x, b.y);
    }
  }
  if (b.egg) {
    b.egg.t += dt;
    if (b.egg.t >= EGG_TIME) hatch(b);
  }
  for (const c of b.creatures) updateCreature(c, b, dt);
}

function hatch(pen) {
  const egg = pen.egg, x = pen.x, y = pen.y + 0.15, mine = pen.owner === S.me;
  if (egg.sp === 'SAHUR') {
    pen.egg = null;
    const s = spawnSahur(pen.owner, null, x, y);
    s.base = pen;
    s.state = 'fall';
    s.vz = 4;
    chips(x, y - 0.1, 8);
    if (mine) {
      banner('ВЫЛУПИЛСЯ САХУР?!', 'тун тун тун... он за тебя', '#ffb36b');
      sfx('tun3');
    }
    return;
  }
  if (egg.sp === 'DRONE') {
    pen.egg = null;
    const d = spawnDrone('kami', 0, { x, y });
    d.farm = pen.owner;
    d.goal = pen.owner.barn;
    chips(x, y - 0.1, 8);
    if (mine) {
      banner('ЭТО БЫЛО ЯЙЦО ДРОНА', 'сбей его, быстро!', '#ff4f6d');
      sfx('alarm');
    }
    return;
  }
  const dest = penWithRoom(pen.owner, pen);
  if (!dest) {
    if (mine && !egg.wait && S.eggNagT <= 0) {
      S.eggNagT = 60;
      toast('🥚 Яйцам негде жить. Построй клетку, продай кого-нибудь или отправь послом к соседям', 'warn');
    }
    egg.wait = true;
    return;
  }
  pen.egg = null;
  addCreature(dest, egg.sp, 1);
  chips(x, y - 0.1, 6);
  if (!mine) return;
  S.stats.born++;
  const sp = SPECIES[egg.sp], color = RARITY[sp.r].color;
  sparkle(dest.x, dest.y - 0.2, color, 10 + sp.r * 4);
  if (sp.r > egg.pr) {
    S.stats.mutations++;
    banner(sp.r >= 4 ? 'ЛЕГЕНДА!!!' : 'МУТАЦИЯ!', `${sp.e} ${sp.name}`, color);
    S.flash = 0.5;
    S.flashColor = color;
    sfx('mutation');
  } else {
    floatText(dest.x, dest.y - 0.6, sp.name, color, 0.15, 1.4);
    sfx('birth', sp.r);
  }
  toast(`🐣 Вылупилось: <b style="color:${color}">${sp.name}</b>`, sp.r >= 2 ? 'good' : '');
}

function updateCreature(c, pen, dt) {
  c.born = Math.max(0, c.born - dt * 2.5);
  c.sayLife -= dt;
  const px = pen.x + c.ox, py = pen.y + c.oy;
  let nd = null, ndd = 1e9;
  for (const d of S.drones) {
    if (!hostile(pen.owner, d.owner)) continue;
    const dd = Math.abs(d.x - px) + Math.abs(d.y - py);
    if (dd < ndd) { ndd = dd; nd = d; }
  }
  c.panic = ndd < 2.2;
  c.look = nd && ndd < 6 ? Math.atan2(nd.y - nd.alt - (py - 0.3), nd.x - px) : null;
  if (c.grabbedBy) return;
  c.lift = Math.max(0, c.lift - dt * 3);
  c.moveT -= dt;
  if (c.moveT <= 0 || (c.panic && Math.random() < dt * 2)) {
    c.tx = rand(-0.28, 0.28);
    c.ty = rand(-0.06, 0.27);
    c.moveT = rand(1.2, 4);
  }
  const dx = c.tx - c.ox, dy = c.ty - c.oy, d = Math.hypot(dx, dy);
  if (d > 0.01) {
    const v = Math.min(d, (c.panic ? 0.9 : 0.25) * dt);
    c.ox += (dx / d) * v;
    c.oy += (dy / d) * v;
    c.walk += dt * (c.panic ? 22 : 12);
    if (Math.abs(dx) > 0.01) c.flip = dx < 0;
  }
  if (!S.over) {
    c.prodT += dt * S.mods.income;
    if (c.prodT >= PROD_TIME) {
      c.prodT -= PROD_TIME;
      pen.owner.coins += RARITY[SPECIES[c.sp].r].income * (pen.owner.player ? 1 : AI_CRITTER_INCOME);
      if (pen.owner === S.me) sparkle(px, py - 0.35, '#ffd84a', 1);
    }
  }
  c.sayT -= dt;
  if (c.sayT <= 0) {
    c.sayT = rand(8, 24);
    if (Math.random() < 0.4) say(c, pick(SPECIES[c.sp].say.concat(PHRASES)));
  }
  if (c.panic && c.sayLife < -1 && Math.random() < dt * 0.4) say(c, pick(PANIC));
}

function say(c, str) {
  c.say = str;
  c.sayLife = 2.2;
}

function updateHut(b, dt) {
  const cap = sahurCap(b.owner);
  let n = 0;
  for (const s of S.sahurs) if (s.home === b && !s.dead) n++;
  b.count = n;
  if (n >= cap) {
    b.spawnT = 0;
    return;
  }
  b.spawnT += dt;
  if (b.spawnT >= HUT_TIME) {
    b.spawnT = 0;
    const s = spawnSahur(b.owner, b, b.x, b.y + 0.3);
    s.state = 'fall';
    s.vz = 3.5;
    floatText(b.x, b.y - 0.55, 'ТУН ТУН ТУН', '#ffcf8a', 0.15);
    sfxAt('tun3', b.x, b.y);
  }
}

function updateHangar(b, dt) {
  if (b.planes >= HANGAR_CAP) {
    b.spawnT = 0;
    return;
  }
  b.spawnT += dt;
  if (b.spawnT >= HANGAR_TIME) {
    b.spawnT = 0;
    b.planes++;
    floatText(b.x, b.y - 0.6, 'БОМБАРДИРО!', '#8fd45f', 0.15);
  }
}

function damageBuilding(b, dmg, by) {
  if (b.dead || b.hp <= 0) return;
  b.hitT = 0;
  b.flash = 1;
  const owner = b.owner;
  if (S.demo && owner.player) {
    b.hp = Math.max(b.maxHp * 0.4, b.hp - dmg);
    return;
  }
  // wild drones can bully a neighbour, but only another farm can conquer it
  if (b.hq && !owner.player && !by) {
    b.hp = Math.max(b.maxHp * 0.25, b.hp - dmg);
    return;
  }
  b.hp -= dmg;
  if (b.hp > 0) return;
  if (b.hq) {
    b.hp = 0;
    if (owner.player) return;   // game over is noticed in update()
    if (by && by.alive && hostile(by, owner)) annex(owner, by);
    else b.hp = b.maxHp * 0.25;
  } else destroyBuilding(b);
}

function destroyBuilding(b) {
  b.dead = true;
  tileAt(b.c, b.r).b = null;
  boomFx(b.x, b.y - 0.15, 1.8, false);
  chips(b.x, b.y - 0.1, 16);
  shakeAt(b.x, b.y, 16);
  sfxAt('boom', b.x, b.y, 2);
  const mine = b.owner === S.me;
  if (b.type === 'pen') {
    for (const c of b.creatures) {
      if (c.grabbedBy) {
        c.grabbedBy.state = 'seek';
        c.grabbedBy.prey = null;
      }
      c.grabbedBy = null;
      c.hunted = null;
      c.pen = null;
      S.runners.push({ kind: 'home', c, owner: b.owner, x: b.x + c.ox, y: b.y + c.oy, z: 0, vz: 0, pen: null, walk: 0 });
      say(c, 'АААА');
    }
    b.creatures = [];
    if (mine) toast('💥 Снесли клетку!', 'bad');
  } else {
    for (const s of S.sahurs) if (s.home === b) s.home = null;
    if (mine) toast(b.type === 'hut' ? '💥 Снесли сахурню!' : '💥 Снесли ангар!', 'bad');
  }
}

// critters that fell from a drone, lost their pen or were gifted walk to a pen with room, or run off the map
function updateRunners(dt) {
  for (const r of S.runners) {
    const c = r.c;
    c.sayLife -= dt;
    if (r.kind === 'drop') {
      r.vz -= 10 * dt;
      r.z = Math.max(0, r.z + r.vz * dt);
      if (r.z <= 0) {
        r.kind = 'home';
        dust(r.x, r.y);
      }
    } else if (r.kind === 'home') {
      if (!r.owner.alive && r.owner.conqueredBy) r.owner = r.owner.conqueredBy;
      if (!r.pen || r.pen.dead || r.pen.owner !== r.owner || r.pen.creatures.length >= PEN_CAP) r.pen = penWithRoom(r.owner);
      if (!r.pen) {
        const a = Math.atan2(r.y - ROWS / 2, r.x - COLS / 2);
        r.kind = 'flee';
        r.vx = Math.cos(a) * 2.2;
        r.vy = Math.sin(a) * 2.2;
        say(c, 'ПРОЩАЙТЕ');
        continue;
      }
      const dx = r.pen.x - r.x, dy = r.pen.y + 0.1 - r.y, d = Math.hypot(dx, dy);
      if (d < 0.15) {
        insertCreature(r.pen, c, r.x, r.y);
        sparkle(r.x, r.y - 0.2, '#fff', 5);
        r.done = true;
      } else {
        r.x += (dx / d) * 1.7 * dt;
        r.y += (dy / d) * 1.7 * dt;
        r.flip = dx < 0;
      }
      r.walk += dt * 24;
    } else {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.flip = r.vx < 0;
      r.walk += dt * 26;
      if (r.x < SPAWN.l || r.x > SPAWN.r || r.y < SPAWN.t || r.y > SPAWN.b) {
        r.done = true;
        if (r.owner === S.me) toast(`🏃 Сбежал(а) в лес: <b>${SPECIES[c.sp].name}</b>`, 'warn');
      }
    }
  }
  S.runners = S.runners.filter(r => !r.done);
}

// ---------------------------------------------------------------- sahurs

function anchorOf(s) {
  let b = s.base && !s.base.dead && s.base.owner === s.owner ? s.base : null;
  if (!b) b = s.base = nearestBuilding(s.owner, s.x, s.y) || s.owner.barn;
  return { x: b.x + s.ax, y: b.y + 0.42 + s.ay };
}

const altOf = t => (t.isSahur ? t.z : t.alt);

function sahurTarget(s, range, raiding) {
  let best = null, bs = 1e9;
  for (const d of S.drones) {
    if (d.dead || !hostile(s.owner, d.owner)) continue;
    const dd = Math.hypot(d.x - s.x, d.y - s.y);
    if (dd > range || (raiding && !d.owner && dd > 1.2)) continue;
    const sc = dd + d._aim * 1.3 - (d.carry ? 1.5 : 0) - (d.type === 'kami' ? 0.4 : 0) - (d.type === 'bomber' ? 0.8 : 0);
    if (sc < bs) { bs = sc; best = d; }
  }
  if (S.anyWar) {
    for (const o of S.sahurs) {
      if (o.dead || !o.owner || !hostile(s.owner, o.owner)) continue;
      const dd = Math.hypot(o.x - s.x, o.y - s.y);
      if (dd > range) continue;
      const sc = dd + o._aim * 1.3 - (o.mode === 'raid' ? 0.6 : 0);
      if (sc < bs) { bs = sc; best = o; }
    }
  }
  return best;
}

function leap(s, t) {
  const dist = Math.hypot(t.x - s.x, t.y - s.y);
  s.state = 'leap';
  s.t = 0;
  s.fx = s.x;
  s.fy = s.y;
  s.z0 = s.z;
  s.dur = clamp(dist / 6, 0.18, 0.5);
  s.tx = t.x + t.vx * s.dur * 0.7;
  s.ty = t.y + t.vy * s.dur * 0.7;
  s.arc = 0.2 + dist * 0.12;
  s.target = t;
  s.flip = t.x < s.x;
}

function strike(s, st) {
  const t = s.target;
  s.target = null;
  s.state = 'fall';
  s.vz = 2.2;
  if (!t || t.dead || Math.hypot(t.x - s.x, t.y - s.y) >= t.r + 0.4) {
    s.cd = st.cd;
    return;
  }
  const dx = t.x - s.fx, dy = t.y - s.fy, l = Math.hypot(dx, dy) || 1;
  floatText(t.x, t.y - altOf(t) - 0.3, pick(TUN_WORDS), '#ffcf8a', 0.17, 0.8);
  chips(t.x, t.y - altOf(t), 4);
  sfxAt('tun', t.x, t.y);
  if (t.isSahur) {
    t.x += (dx / l) * 0.25;
    t.y += (dy / l) * 0.25;
    // home turf: guards hit invaders harder, so attacking takes numbers or bombers
    damageSahur(t, st.dmg + (s.mode === 'guard' ? 1 : 0), s.owner);
  } else {
    t.vx += (dx / l) * 2.5;
    t.vy += (dy / l) * 2.5;
    t.stun = 0.3;
    damageDrone(t, st.dmg, s.owner);
  }
  s.cd = st.cd * 0.4;
}

function damageSahur(s, dmg, by) {
  if (s.dead) return;
  s.hp -= dmg;
  s.flash = 1;
  if (s.hp <= 0) killSahur(s, by);
}

function killSahur(s, by, from) {
  if (s.dead) return;
  s.dead = true;
  const a = from ? Math.atan2(s.y - from.y, s.x - from.x) : rand(0, 6.28);
  if (onScreen(s.x, s.y)) {
    part({ kind: 'sahur', x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * 3, vy: Math.sin(a) * 2, vz: 6, vr: rand(-14, 14), life: 1.6, max: 1.6, flip: s.flip, team: s.owner.color });
    floatText(s.x, s.y - 0.6, 'тун...', '#ffcf8a', 0.14);
  }
  if (by === S.me && s.owner !== S.me) addCoins(by, 2);
}

function raidValid(s) {
  return s.goal && s.goal.alive && hostile(s.owner, s.goal);
}

function endRaid(s) {
  s.mode = 'guard';
  s.wp = null;
  s.goal = null;
  s.bTarget = null;
  s.base = nearestBuilding(s.owner, s.x, s.y) || s.owner.barn;
}

function walkTo(s, dx, dy, d, speed, dt) {
  const v = Math.min(d, speed * dt);
  s.x += (dx / d) * v;
  s.y += (dy / d) * v;
  s.walk += dt * 14;
  if (Math.abs(dx) > 0.02) s.flip = dx < 0;
  s.z = Math.abs(Math.sin(s.walk * 0.5)) * 0.05;
}

function idleSahur(s, st, dt) {
  s.cd -= dt;
  s.swingT = Math.max(0, s.swingT - dt);
  s.bat = s.swingT > 0 ? lerp(0.9, -2.4, s.swingT / 0.3) : s.bat + (-1.1 - s.bat) * Math.min(1, dt * 8);
  if (s.mode === 'raid') {
    if (s.cd <= 0) {
      const tg = sahurTarget(s, st.range * 0.75, true);
      if (tg) return leap(s, tg);
    }
    if (s.wp) {
      const wx = s.wp.x - s.x, wy = s.wp.y - s.y, wd = Math.hypot(wx, wy);
      if (wd < 0.3) s.wp = null;
      else return walkTo(s, wx, wy, wd, 1.3, dt);
    }
    let b = s.bTarget;
    if (!b || b.dead || b.owner !== s.goal) b = s.bTarget = nearestBuilding(s.goal, s.x, s.y);
    if (!b) return endRaid(s);
    const dx = b.x - s.x, dy = b.y + 0.3 - s.y, d = Math.hypot(dx, dy);
    if (d > 0.45) return walkTo(s, dx, dy, d, 1.3, dt);
    s.z = 0;
    if (s.cd <= 0) {
      s.cd = 0.8;
      s.swingT = 0.3;
      s.flip = dx < 0;
      damageBuilding(b, st.bash, s.owner);
      chips(b.x + rand(-0.2, 0.2), b.y, 2);
      sfxAt('tun', s.x, s.y);
    }
    return;
  }
  const a = anchorOf(s);
  const dx = a.x - s.x, dy = a.y - s.y, d = Math.hypot(dx, dy);
  if (d > 0.04) walkTo(s, dx, dy, d, d > 1.2 ? 2.4 : 0.8, dt);
  else {
    s.z = 0;
    s.retarget -= dt;
    if (s.retarget <= 0) {
      s.ax = rand(-0.42, 0.42);
      s.ay = rand(-0.05, 0.25);
      s.retarget = rand(1.5, 4);
    }
  }
  if (s.cd <= 0) {
    const tg = sahurTarget(s, st.range);
    if (tg) leap(s, tg);
    else s.cd = 0.15;
  }
}

function updateSahurs(dt) {
  for (const d of S.drones) d._aim = 0;
  for (const s of S.sahurs) s._aim = 0;
  for (const s of S.sahurs) if (s.target && !s.target.dead) s.target._aim++;
  for (const s of S.sahurs) {
    if (s.dead) continue;
    const px = s.x, py = s.y, st = sahurStats(s.owner);
    s.squash = Math.max(0, s.squash - dt * 3);
    s.flash = Math.max(0, s.flash - dt * 5);
    if (s.mode === 'raid' && !raidValid(s)) endRaid(s);
    if (s.state === 'idle') idleSahur(s, st, dt);
    else if (s.state === 'leap') {
      s.t += dt;
      const t = s.target;
      if (t && !t.dead) {
        const k = Math.min(1, dt * 5);
        s.tx += (t.x - s.tx) * k;
        s.ty += (t.y - s.ty) * k;
      }
      const p = Math.min(1, s.t / s.dur);
      s.x = lerp(s.fx, s.tx, p);
      s.y = lerp(s.fy, s.ty, p);
      s.z = s.z0 * (1 - p) + s.arc * Math.sin(Math.PI * p) + (t ? altOf(t) : ALT) * p;
      s.bat = p < 0.75 ? lerp(-1.1, -2.6, p / 0.75) : lerp(-2.6, 0.9, (p - 0.75) / 0.25);
      if (p >= 1) strike(s, st);
    } else {
      s.vz -= 14 * dt;
      s.z += s.vz * dt;
      s.cd -= dt;
      s.bat += (-1.1 - s.bat) * Math.min(1, dt * 3);
      let chained = false;
      if (s.cd <= 0 && s.chain < 3 && s.z > 0.15) {
        const tg = sahurTarget(s, st.range * 0.7, s.mode === 'raid');
        if (tg) {
          s.chain++;
          leap(s, tg);
          chained = true;
        }
      }
      if (!chained && s.z <= 0) {
        s.z = 0;
        s.vz = 0;
        s.state = 'idle';
        s.chain = 0;
        s.squash = 1;
        dust(s.x, s.y);
      }
    }
    s.vx = (s.x - px) / Math.max(dt, 1e-4);
    s.vy = (s.y - py) / Math.max(dt, 1e-4);
  }
  S.sahurs = S.sahurs.filter(s => !s.dead);
}

// ---------------------------------------------------------------- drones & bombers

function steer(d, tx, ty, spd, dt) {
  const dx = tx - d.x, dy = ty - d.y, dd = Math.hypot(dx, dy) || 1e-6;
  const v = Math.min(spd, dd * 4), k = Math.min(1, dt * 3.5);
  d.vx += ((dx / dd) * v - d.vx) * k;
  d.vy += ((dy / dd) * v - d.vy) * k;
  return dd;
}

function pickPrey(d) {
  let best = null, bs = 1e9;
  for (let pass = 0; pass < 3 && !best; pass++) {
    for (const b of S.buildings) {
      if (b.type !== 'pen' || b.dead || (pass < 2 && b.owner !== d.farm)) continue;
      for (const c of b.creatures) {
        if (c.grabbedBy) continue;
        if (pass === 0 && c.hunted && c.hunted !== d && !c.hunted.dead) continue;
        const sc = Math.hypot(b.x + c.ox - d.x, b.y + c.oy - d.y) + Math.random() * 2.5;
        if (sc < bs) { bs = sc; best = c; }
      }
    }
  }
  if (best) best.hunted = d;
  return best;
}

function pickGoal(d) {
  if (!d.farm || !d.farm.alive) d.farm = pickTargetFarm();
  const own = buildingsOf(d.farm);
  if (d.type === 'tank') {
    const huts = own.filter(b => b.type === 'hut' || b.type === 'hangar');
    if (huts.length && Math.random() < 0.65) return pick(huts);
  }
  const others = own.filter(b => !b.hq);
  if (others.length && Math.random() < 0.5) return pick(others);
  return d.farm.barn;
}

function exitPoint(d) {
  const opts = [[d.x - SPAWN.l, SPAWN.l - 1, d.y], [SPAWN.r - d.x, SPAWN.r + 1, d.y], [d.y - SPAWN.t, d.x, SPAWN.t - 1], [SPAWN.b - d.y, d.x, SPAWN.b + 1]];
  opts.sort((a, b) => a[0] - b[0]);
  return { x: opts[0][1], y: opts[0][2] };
}

function thiefAI(d, spd, dt) {
  if (d.state === 'seek') {
    let c = d.prey;
    if (!c || !c.pen || (c.grabbedBy && c.grabbedBy !== d)) c = d.prey = pickPrey(d);
    if (!c) {
      d.state = 'raid';
      return;
    }
    if (steer(d, c.pen.x + c.ox, c.pen.y + c.oy, spd, dt) < 0.12) {
      d.state = 'grab';
      d.grabT = 0;
      c.grabbedBy = d;
      sfxAt('beam', d.x, d.y);
    }
  } else if (d.state === 'grab') {
    const c = d.prey;
    if (!c || !c.pen) {
      d.state = 'seek';
      return;
    }
    steer(d, c.pen.x + c.ox, c.pen.y + c.oy, spd * 0.6, dt);
    d.grabT += dt * (d.stun > 0 ? 0.3 : 1);
    c.lift = Math.min(1, d.grabT / GRAB_TIME);
    if (d.grabT >= GRAB_TIME) {
      const pen = c.pen;
      pen.creatures.splice(pen.creatures.indexOf(c), 1);
      c.home = pen;
      c.homeOwner = pen.owner;
      c.pen = null;
      d.carry = c;
      d.state = 'flee';
      d.exit = exitPoint(d);
      say(c, pick(PANIC));
      if (pen.owner === S.me) {
        toast(`🛸 Дрон тащит: <b>${SPECIES[c.sp].name}</b>. Сбей его!`, 'bad');
        sfx('steal');
      }
    }
  } else if (d.state === 'flee') {
    steer(d, d.exit.x, d.exit.y, spd * 0.75, dt);
    if (d.x < SPAWN.l - 0.5 || d.x > SPAWN.r + 0.5 || d.y < SPAWN.t - 0.5 || d.y > SPAWN.b + 0.5) {
      d.dead = true;
      if (d.carry.homeOwner === S.me) {
        S.stats.stolen++;
        toast(`💀 Украли: <b>${SPECIES[d.carry.sp].name}</b>`, 'bad');
        sfx('lost');
      }
    }
  } else {
    if (!d.farm || !d.farm.alive) d.farm = pickTargetFarm();
    if (steer(d, d.farm.barn.x, d.farm.barn.y, spd, dt) < 0.3) {
      d.dead = true;
      explode(d.x, d.y, 0.6, d.farm.barn, 6, null);
    } else if (allCritters().some(c => !c.grabbedBy)) d.state = 'seek';
  }
}

function kamiAI(d, spd, dt) {
  if (!d.goal || d.goal.dead || d.goal.owner !== d.farm) d.goal = pickGoal(d);
  if (steer(d, d.goal.x, d.goal.y, spd, dt) < 0.3) {
    d.dead = true;
    explode(d.x, d.y, d.type === 'mini' ? 0.5 : 1, d.goal, DRONES[d.type].dmg, null);
  }
}

function heavyAI(d, spd, dt) {
  const boss = d.type === 'boss';
  if (!d.goal || d.goal.dead || d.goal.owner !== d.farm) d.goal = boss ? (d.farm.alive ? d.farm.barn : S.me.barn) : pickGoal(d);
  const range = boss ? 1.5 : 0.75;
  if (Math.hypot(d.goal.x - d.x, d.goal.y - d.y) > range) steer(d, d.goal.x, d.goal.y, spd, dt);
  else {
    steer(d, d.x, d.y, 0, dt);
    d.firing = true;
    damageBuilding(d.goal, DRONES[d.type].dps * dt, null);
    d.laserT -= dt;
    if (d.laserT <= 0 && onScreen(d.x, d.y)) {
      d.laserT = 0.08;
      part({ kind: 'spark', x: d.goal.x + rand(-0.15, 0.15), y: d.goal.y - 0.15, vx: rand(-2, 2), vy: rand(-3, -1), life: 0.3, max: 0.3, color: '#ff8a9a' });
    }
    if (!d.wasFiring) sfxAt('laser', d.x, d.y);
  }
  d.wasFiring = d.firing;
  if (boss) {
    d.spawnT -= dt;
    if (d.spawnT <= 0) {
      d.spawnT = 7;
      for (let i = 0; i < 2; i++) {
        const m = spawnDrone('thief', 0, { x: d.x + rand(-0.5, 0.5), y: d.y + rand(-0.2, 0.3) });
        m.alt = d.alt;
        m.farm = d.farm;
      }
      floatText(d.x, d.y - d.alt - 0.8, 'ДЕСАНТ!', '#ff8a9a', 0.2);
    }
  }
}

function pickBomberGoal(F) {
  const own = buildingsOf(F);
  const mil = own.filter(b => b.type === 'hut' || b.type === 'hangar');
  if (mil.length && Math.random() < 0.6) return pick(mil);
  return Math.random() < 0.5 ? F.barn : pick(own);
}

function bomberAI(d, spd, dt) {
  if (d.state === 'go') {
    if (!d.target.alive || !hostile(d.owner, d.target)) {
      d.state = 'back';
      return;
    }
    if (!d.goal || d.goal.dead || d.goal.owner !== d.target) d.goal = pickBomberGoal(d.target);
    if (steer(d, d.goal.x, d.goal.y, spd, dt) < 0.35) {
      d.state = 'bomb';
      d.bombT = 0;
    }
  } else if (d.state === 'bomb') {
    steer(d, d.goal.x + Math.cos(d.t * 3) * 0.4, d.goal.y + Math.sin(d.t * 3) * 0.3, spd * 0.5, dt);
    d.bombT -= dt;
    if (d.bombT <= 0 && d.bombs > 0) {
      d.bombs--;
      d.bombT = 0.35;
      S.bombs.push({ x: d.x, y: d.y, z: d.alt, vz: 0, owner: d.owner, goal: d.goal });
      sfxAt('whistle', d.x, d.y);
    }
    if (d.bombs <= 0 && d.bombT <= 0) d.state = 'back';
  } else {
    let h = d.home && !d.home.dead && d.home.owner === d.owner ? d.home : null;
    if (!h) h = d.home = buildingsOf(d.owner, 'hangar')[0] || d.owner.barn;
    if (steer(d, h.x, h.y, spd, dt) < 0.25) {
      d.dead = true;
      if (h.type === 'hangar' && h.planes < HANGAR_CAP) h.planes++;
    }
  }
}

function updateDrones(dt) {
  const ds = S.drones;
  for (const d of ds) {
    if (d.dead) continue;
    d.t += dt;
    d.flash = Math.max(0, d.flash - dt * 6);
    d.stun = Math.max(0, d.stun - dt);
    const altT = d.type === 'bomber' ? (d.state === 'back' && d.home && Math.hypot(d.home.x - d.x, d.home.y - d.y) < 0.8 ? 0.1 : BOMBER_ALT) : ALT * (d.type === 'boss' ? 1.4 : 1);
    d.alt += (altT - d.alt) * Math.min(1, dt * 2);
    const spd = d.speed * (d.owner ? 1 : S.mods.droneSpeed) * (d.stun > 0 ? 0.25 : 1);
    d.firing = false;
    if (d.type === 'thief') thiefAI(d, spd, dt);
    else if (d.type === 'kami' || d.type === 'mini') kamiAI(d, spd, dt);
    else if (d.type === 'bomber') bomberAI(d, spd, dt);
    else heavyAI(d, spd, dt);
    const wob = d.owner ? 0 : Math.sin(d.t * 2.3 + d.seed) * 0.35 * spd, vl = Math.hypot(d.vx, d.vy) || 1;
    d.x += (d.vx - (d.vy / vl) * wob) * dt;
    d.y += (d.vy + (d.vx / vl) * wob) * dt;
    d.tilt = clamp(d.vx * 0.15, -0.35, 0.35);
  }
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i], b = ds[j];
      if (a.dead || b.dead || a.owner || b.owner) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > 1.4 || Math.abs(dy) > 1.4) continue;
      const dd = Math.hypot(dx, dy), min = (a.r + b.r) * 1.1;
      if (dd < min && dd > 1e-4) {
        const p = ((min - dd) * 0.5) / dd;
        a.x -= dx * p;
        a.y -= dy * p;
        b.x += dx * p;
        b.y += dy * p;
      }
    }
  }
  S.drones = S.drones.filter(d => !d.dead);
  for (const b of S.bombs) {
    b.vz -= 12 * dt;
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.done = true;
      const hit = b.goal && !b.goal.dead && Math.hypot(b.goal.x - b.x, b.goal.y - b.y) < 0.9 ? b.goal : null;
      explode(b.x, b.y, 1.1, hit, 20, b.owner);
    }
  }
  S.bombs = S.bombs.filter(b => !b.done);
}

// `by` = the farm that caused it (null for wild drones, whose blasts hurt anyone's sahurs)
function explode(x, y, size, building, dmg, by) {
  if (building && !building.dead) damageBuilding(building, dmg, by);
  for (const s of S.sahurs) {
    if (s.dead || s.z > 0.3 || Math.hypot(s.x - x, s.y - y) > 0.6 * size) continue;
    if (by ? hostile(by, s.owner) : Math.random() < 0.6) killSahur(s, by, { x, y });
  }
  boomFx(x, y - ALT * 0.5, size, false);
  shakeAt(x, y, 10 * size);
  sfxAt('boom', x, y, size);
}

function damageDrone(d, dmg, by) {
  if (d.dead) return;
  d.hp -= dmg;
  d.flash = 1;
  if (d.hp <= 0) killDrone(d, by);
}

function killDrone(d, by) {
  d.dead = true;
  const mine = by === S.me;
  if (mine && !d.owner) S.stats.kills++;
  const coins = DRONES[d.type].coins + (mine && S.combo >= 4 ? Math.floor(S.combo / 4) : 0);
  if (by) {
    addCoins(by, mine ? coins : Math.ceil(coins / 2), sx(d.x), sy(d.y - d.alt));
    if (mine) floatText(d.x, d.y - d.alt + 0.15, `+${coins}`, '#ffd84a', 0.15);
  }
  const size = d.type === 'boss' ? 3 : d.type === 'tank' ? 1.4 : 0.7;
  boomFx(d.x, d.y - d.alt, size, true);
  sfxAt('boom', d.x, d.y, size * 0.6);
  if (d.prey && d.prey.hunted === d) d.prey.hunted = null;
  if (d.state === 'grab' && d.prey) d.prey.grabbedBy = null;
  if (d.carry) {
    const c = d.carry, owner = c.homeOwner && c.homeOwner.alive ? c.homeOwner : c.homeOwner && c.homeOwner.conqueredBy;
    if (owner) {
      S.runners.push({ kind: 'drop', c, owner, x: d.x, y: d.y, z: d.alt, vz: 0, pen: c.home, walk: 0 });
      if (owner === S.me) toast(`🙌 Спасён: <b>${SPECIES[c.sp].name}</b>`, 'good');
    }
  }
  if (d.type === 'kami') {
    for (const o of S.drones) if (!o.dead && !o.owner && Math.hypot(o.x - d.x, o.y - d.y) < 1) damageDrone(o, 2, by);
  }
  if (d.type === 'boss') {
    S.slowmo = 1.2;
    S.shake = 30;
    S.flash = 0.7;
    S.flashColor = '#fff';
    const pen = penWithRoom(S.me);
    if (pen) {
      const c = addCreature(pen, pick(BY_RARITY[randi(2, 3)]), 1);
      banner('МЕГАДРОН ПОВЕРЖЕН!', `трофей: ${SPECIES[c.sp].name}`, '#ffd84a');
    } else banner('МЕГАДРОН ПОВЕРЖЕН!', `+${coins} 🪙`, '#ffd84a');
    sfx('win');
  }
}

// ---------------------------------------------------------------- player actions

function handHit(px, py) {
  const T = view.T, W = WEAPONS[S.me.weapon];
  let target = null, bd = 1e9;
  for (const d of S.drones) {
    if (d.dead || !hostile(S.me, d.owner)) continue;
    const dd = Math.hypot(sx(d.x) - px, sy(d.y - d.alt) - py);
    if (dd < d.r * T * 1.25 + 14 && dd < bd) { bd = dd; target = d; }
  }
  if (S.anyWar) {
    for (const s of S.sahurs) {
      if (s.dead || !hostile(S.me, s.owner)) continue;
      const dd = Math.hypot(sx(s.x) - px, sy(s.y) - (s.z + 0.18) * T - py);
      if (dd < T * 0.2 + 10 && dd < bd) { bd = dd; target = s; }
    }
  }
  const g = S.golden;
  if (g && Math.hypot(sx(g.x) - px, sy(g.y) - T * 0.2 - py) < T * 0.35 && (!target || bd > T * 0.2)) {
    hitGolden();
    return true;
  }
  if (!target) return false;
  S.combo = S.comboT > 0 ? S.combo + 1 : 1;
  S.comboT = 1.4;
  const ty = target.y - altOf(target);
  floatText(target.x, ty - 0.3, pick(W.hit), '#fff', 0.19 + Math.min(0.12, S.combo * 0.01), 0.7);
  part({ kind: 'emoji', e: '💥', x: wxOf(px), y: wyOf(py), size: 0.25 + S.me.weapon * 0.05, life: 0.22, max: 0.22 });
  if (target.isSahur) damageSahur(target, W.dmg, S.me);
  else {
    const kx = sx(target.x) - px, ky = sy(ty) - py, kl = Math.hypot(kx, ky) || 1;
    target.vx += (kx / kl) * 2.2;
    target.vy += (ky / kl) * 2.2;
    target.stun = 0.2;
    if (W.splash) {
      part({ kind: 'ring', x: target.x, y: ty, size: 0.05, grow: W.splash, life: 0.25, max: 0.25, color: '#ffd84a' });
      for (const o of S.drones) {
        if (o !== target && !o.dead && hostile(S.me, o.owner) && Math.hypot(o.x - target.x, o.y - target.y) < W.splash) damageDrone(o, Math.ceil(W.dmg / 2), S.me);
      }
    }
    damageDrone(target, W.dmg, S.me);
  }
  S.shake = Math.max(S.shake, 3 + W.dmg * 0.8);
  sfx('slap', S.me.weapon, true);
  return true;
}

function threatNear(px, py, R) {
  if (S.drones.some(d => hostile(S.me, d.owner) && Math.hypot(sx(d.x) - px, sy(d.y - d.alt) - py) < R)) return true;
  return S.anyWar && S.sahurs.some(s => hostile(S.me, s.owner) && Math.hypot(sx(s.x) - px, sy(s.y) - (s.z + 0.18) * view.T - py) < R * 0.6);
}

function creatureAtScreen(px, py) {
  const T = view.T;
  let found = null, bd = T * 0.2;
  for (const c of allCritters()) {
    const d = Math.hypot(sx(c.pen.x + c.ox) - px, sy(c.pen.y + c.oy) - T * 0.17 - py);
    if (d < bd) { bd = d; found = c; }
  }
  return found;
}

function collectAt(px, py, R) {
  let got = false;
  for (const p of S.pickups) {
    if (p.got) continue;
    const cx = sx(p.x), cy = sy(p.y) - p.z * view.T - view.T * 0.1;
    if (Math.hypot(cx - px, cy - py) < R) {
      p.got = true;
      got = true;
      addCoins(S.me, p.val, cx, cy);
      sparkle(p.x, p.y - p.z - 0.1, '#ffd84a', 4);
      sfx('coin', 0, true);
    }
  }
  return got;
}

function canBuy(t) {
  if (!t || t.unlocked || t.farm !== S.me) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
    const n = tileAt(t.c + dc, t.r + dr);
    return n && n.unlocked && n.farm === S.me;
  });
}

function tryBuild(t) {
  if (!t || t.farm !== S.me) return deny('Это не твоя земля');
  if (!t.unlocked) return deny(canBuy(t) ? 'Сначала расчисти участок' : 'Участок слишком далеко');
  if (t.b) return deny('Тут уже занято');
  if (!spend(price(S.me, tool))) return;
  S.me.built[tool]++;
  const b = placeBuilding(tool, t, S.me);
  if (tool === 'hut') {
    const s = spawnSahur(S.me, b, b.x, b.y + 0.3);
    s.state = 'fall';
    s.vz = 3.5;
    floatText(b.x, b.y - 0.6, 'ТУН ТУН ТУН', '#ffcf8a', 0.17);
  }
  chips(b.x, b.y, 10);
  dust(b.x, b.y + 0.3);
  S.shake = Math.max(S.shake, 4);
  sfx('build', 0, true);
  tool = null;
}

function useTool(id) {
  if (mode !== 'play') return;
  if (id === 'pen' || id === 'hut' || id === 'hangar') {
    tool = tool === id ? null : id;
    closePopup();
    sfx('click', 0, true);
    return;
  }
  if (id === 'weapon') {
    const n = WEAPONS[S.me.weapon + 1];
    if (!n) return;
    if (!spend(n.cost)) return shakeTool(id);
    S.me.weapon++;
    banner(`${n.e} ${n.name.toUpperCase()}`, `урон кликом: ${n.dmg}${n.splash ? ', бьёт по площади' : ''}`, '#45d0ff');
    sfx('upgrade');
  } else {
    const cost = GYM_COST[S.me.sahurLvl];
    if (cost == null) return;
    if (!spend(cost)) return shakeTool(id);
    S.me.sahurLvl++;
    for (const s of S.sahurs) {
      if (s.owner !== S.me) continue;
      s.maxHp++;
      s.hp++;
    }
    const st = sahurStats(S.me);
    banner('САХУРЫ ПОДКАЧАЛИСЬ 💪', `урон ${st.dmg}, до ${sahurCap(S.me)} в сахурне`, '#ffb36b');
    sfx('upgrade');
  }
}

function shakeTool(id) {
  const el = $('tool-' + id);
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function buyCreature(pen, kind) {
  if (pen.dead || pen.creatures.length >= PEN_CAP) return;
  if (!spend(kind === 'seed' ? PRICE.seed : PRICE.critter)) return;
  const sp = kind === 'seed' ? rollSeed(false) : kind;
  addCreature(pen, sp, 1);
  const R = SPECIES[sp].r, color = RARITY[R].color;
  sparkle(pen.x, pen.y - 0.2, color, 8 + R * 4);
  if (kind === 'seed') {
    floatText(pen.x, pen.y - 0.7, `🎲 ${SPECIES[sp].name}`, color, 0.16, 1.6);
    if (R >= 3) banner('ДЖЕКПОТ!', `${SPECIES[sp].e} ${SPECIES[sp].name}`, color);
    sfx(R >= 2 ? 'mutation' : 'birth', R, true);
  } else sfx('buy', 0, true);
}

function sellCreature(c) {
  if (!c.pen) return;
  if (c.grabbedBy) return deny('Его уже тащат!');
  const v = RARITY[SPECIES[c.sp].r].sell, pen = c.pen;
  const x = pen.x + c.ox, y = pen.y + c.oy;
  removeCritter(c);
  addCoins(S.me, v, sx(x), sy(y) - view.T * 0.2);
  sparkle(x, y - 0.2, '#ffd84a', 8);
  sfx('coin', 0, true);
  openPopup('pen', pen);
}

function crocToHangar(c) {
  const h = buildingsOf(S.me, 'hangar').find(b => b.planes < HANGAR_CAP);
  if (!h || !c.pen || c.grabbedBy) return deny('Нужен ангар со свободным местом');
  removeCritter(c);
  h.planes++;
  floatText(h.x, h.y - 0.6, 'БОМБАРДИРО В СТРОЮ', '#8fd45f', 0.15);
  sfx('upgrade', 0, true);
  closePopup();
}

function repairBarn(b) {
  if (b.hp >= b.maxHp) return deny('И так целое');
  if (!spend(PRICE.repair)) return;
  b.hp = Math.min(b.maxHp, b.hp + 50);
  sparkle(b.x, b.y - 0.2, '#7dff6a', 14);
  sfx('build', 0, true);
}

function buyLand(t) {
  if (t.unlocked) return;
  if (!spend(price(S.me, 'land'))) return;
  t.unlocked = true;
  S.me.built.land++;
  dust(t.c + 0.5, t.r + 0.6);
  sparkle(t.c + 0.5, t.r + 0.5, '#e8c48a', 10);
  sfx('build', 0, true);
  closePopup();
}

// ---------------------------------------------------------------- popups

const popEl = $('popup');

function openPopup(kind, target, el) {
  pop = { kind, target, key: '', t: 0, el };
  popEl.hidden = false;
  refreshPopup();
  positionPopup();
}

function closePopup() {
  pop = null;
  popEl.hidden = true;
}

const btn = (act, label, cost, extra = '') =>
  `<button class="act" data-act="${act}" ${extra} ${cost != null && S.me.coins < cost ? 'disabled' : ''}><span>${label}</span><b>${cost != null ? cost + ' 🪙' : ''}</b></button>`;

const hpLine = () => '<div class="hpl">❤ <span class="dyn-hp"></span></div>';

function popupState() {
  const t = pop.target, k = pop.kind;
  if (k === 'creature') {
    const sp = SPECIES[t.sp], R = RARITY[sp.r];
    const croc = t.sp === 'croc' && buildingsOf(S.me, 'hangar').some(h => h.planes < HANGAR_CAP);
    return {
      key: t.sp + t.pen.id + croc,
      html: `<h4>${sp.e} ${sp.name}</h4><div class="rar" style="color:${R.color}">${R.name}</div>
        <div class="sub">приносит ${R.income} 🪙 каждые ${PROD_TIME} с</div>
        ${croc ? '<button class="act" data-act="tohangar"><span>✈️ В ангар бомбардиро</span><b></b></button>' : ''}
        <button class="act sell" data-act="sell"><span>Продать</span><b>+${R.sell} 🪙</b></button>`,
    };
  }
  if (k === 'pen') {
    const n = t.creatures.length, room = n < PEN_CAP;
    const afford = [PRICE.critter, PRICE.seed].map(p => S.me.coins >= p).join();
    let html = `<h4>🏠 Клетка <span class="cap">${n}/${PEN_CAP}</span></h4><div class="sub dyn"></div>${hpLine()}
      <div class="row">${t.creatures.map(c => `<span title="${SPECIES[c.sp].name}">${SPECIES[c.sp].e}</span>`).join('')}</div>`;
    if (room) {
      html += btn('buy', '🍓 ИИ Клубника', PRICE.critter, 'data-sp="straw"') +
        btn('buy', '🍌 ИИ Банан', PRICE.critter, 'data-sp="banana"') +
        btn('buy', '🎲 Рандом-семечко', PRICE.seed, 'data-sp="seed"');
    } else html += '<div class="sub">Мест нет. Кликни по зверьку, чтобы продать.</div>';
    return { key: `${n}|${t.creatures.map(c => c.sp).join()}|${afford}`, html };
  }
  if (k === 'hut') {
    return { key: 'hut', html: `<h4>🪵 Сахурня</h4><div class="sub dyn"></div>${hpLine()}<div class="sub">Сахуры прыгают на дронов и вражеских сахуров в радиусе ~${sahurStats(S.me).range.toFixed(1)} клетки. Набеги — в панели соседей.</div>` };
  }
  if (k === 'hangar') {
    return { key: 'hangar', html: `<h4>🛩 Ангар бомбардиро</h4><div class="sub dyn"></div>${hpLine()}<div class="sub">Бомбардиро Крокодило летают бомбить врагов (кнопка «Бомбить» у соседа на войне). Своих крокодилов из клеток тоже можно сюда призвать.</div>` };
  }
  if (k === 'barn') {
    const full = t.hp >= t.maxHp;
    const title = t.trophy ? `🏆 Трофейный амбар` : '🏚️ Ферма';
    const sub = t.trophy ? 'Захваченный амбар соседа. Приносит монеты.' : 'Сердце фермы. Сломают — игра окончена. Сама чинится, если её не трогать 5 с.';
    return {
      key: `${S.me.coins >= PRICE.repair}|${full}`,
      html: `<h4>${title}</h4><div class="sub">${sub}</div>${hpLine()}${btn('repair', '🔧 Починить +50 ❤', PRICE.repair, full ? 'disabled' : '')}`,
    };
  }
  if (k === 'land') {
    const p = price(S.me, 'land');
    return { key: `${S.me.coins >= p}`, html: `<h4>🌱 Пустой участок</h4><div class="sub">Расчисти, чтобы строить тут клетки, сахурни и ангары.</div>${btn('land', 'Расчистить', p)}` };
  }
  if (k === 'farm') {
    const st = diploCard(t);
    return { key: st.key, html: `<div class="${st.cls} inpop" style="--c:${t.color}">${st.html}</div>` };
  }
  // envoy: pick which of our critters goes
  const counts = {};
  for (const c of allCritters(S.me)) if (!c.grabbedBy) counts[c.sp] = (counts[c.sp] || 0) + 1;
  const ids = Object.keys(counts).sort((a, b) => SPECIES[a].r - SPECIES[b].r);
  const list = ids.map(sp => `<button class="act" data-act="envoy" data-sp="${sp}"><span>${SPECIES[sp].e} ${SPECIES[sp].name}${sp === t.likes ? ' ❤' : ''}</span><b>×${counts[sp]}</b></button>`).join('');
  return {
    key: ids.map(i => i + counts[i]).join(),
    html: `<h4>🏳️ Посол к ${t.name}</h4><div class="sub">Твой зверёк заведёт яйцо с их ${SPECIES[t.mascot].e}. Родится кто-то из родителей — союз. Мутация — союз и подарок. Чужой — война. Любимчик (❤) даёт второй шанс.</div>
      ${list || '<div class="sub"><b>Некого отправить.</b></div>'}`,
  };
}

function popupDyn() {
  const t = pop.target;
  if (pop.kind === 'pen') {
    if (t.egg) return t.egg.wait ? '🥚 яйцо ждёт свободное место' : '🥚 яйцо вылупляется…';
    return t.creatures.length >= 2 ? `💞 яйцо через ${Math.ceil(((1 - t.breed) * BREED_TIME) / S.mods.breed)} с` : 'нужно двое, чтобы снести яйцо';
  }
  if (pop.kind === 'hut') {
    const cap = sahurCap(S.me);
    return t.count >= cap ? `сахуров ${t.count}/${cap}, все на месте` : `сахуров ${t.count}/${cap}, следующий через ${Math.ceil(HUT_TIME - t.spawnT)} с`;
  }
  if (pop.kind === 'hangar') return t.planes >= HANGAR_CAP ? `бомбардиро ${t.planes}/${HANGAR_CAP}, готовы` : `бомбардиро ${t.planes}/${HANGAR_CAP}, следующий через ${Math.ceil(HANGAR_TIME - t.spawnT)} с`;
  return '';
}

function refreshPopup() {
  const st = popupState();
  if (st.key !== pop.key) {
    pop.key = st.key;
    popEl.innerHTML = '<button class="x" data-act="close" title="Закрыть">✕</button>' + st.html;
  }
  const dyn = popEl.querySelector('.dyn');
  if (dyn) dyn.textContent = popupDyn();
  const hp = popEl.querySelector('.dyn-hp');
  if (hp && pop.target.hp != null) hp.textContent = `${Math.ceil(pop.target.hp)} / ${pop.target.maxHp}`;
  if (pop.kind === 'farm') fillDyn(popEl, pop.target);
}

function positionPopup() {
  const w = popEl.offsetWidth, h = popEl.offsetHeight;
  let x, y;
  if (pop.kind === 'envoy' && pop.el) {
    const r = pop.el.getBoundingClientRect();
    x = r.left - w - 12;
    y = r.top - 20;
  } else {
    const t = pop.target, T = view.T;
    const a = pop.kind === 'creature' ? { x: t.pen.x, y: t.pen.y } : pop.kind === 'land' ? { x: t.c + 0.5, y: t.r + 0.5 } : pop.kind === 'farm' ? t.barn : t;
    x = sx(a.x) + T * 0.6;
    if (x + w > view.W - 250) x = sx(a.x) - T * 0.6 - w;
    y = sy(a.y) - h / 2;
  }
  popEl.style.left = Math.round(clamp(x, 10, view.W - w - 10)) + 'px';
  popEl.style.top = Math.round(clamp(y, 70, view.H - h - 110)) + 'px';
}

function popupTick(dt) {
  if (!pop) return;
  const t = pop.target, k = pop.kind;
  const gone = mode !== 'play' ||
    (k === 'creature' ? !t.pen || t.pen.owner !== S.me :
      k === 'land' ? t.unlocked :
        k === 'envoy' ? !t.alive || relOf(t, S.me) !== 'neutral' || t.envoy || t.mission :
          k === 'farm' ? false : t.dead || t.owner !== S.me);
  if (gone) return closePopup();
  pop.t += dt;
  if (pop.t > 0.15) {
    pop.t = 0;
    refreshPopup();
  }
  positionPopup();
}

popEl.addEventListener('mousedown', e => e.preventDefault());
popEl.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !pop || b.disabled) return;
  const act = b.dataset.act, t = pop.target;
  if (act === 'close') closePopup();
  else if (act === 'buy') buyCreature(t, b.dataset.sp);
  else if (act === 'sell') sellCreature(t);
  else if (act === 'tohangar') crocToHangar(t);
  else if (act === 'repair') repairBarn(t);
  else if (act === 'land') buyLand(t);
  else if (act === 'envoy' && pop.kind === 'envoy') sendEnvoy(t, b.dataset.sp);
  else if (pop.kind === 'farm') diploAction(t, act);
  if (pop) refreshPopup();
});

// ---------------------------------------------------------------- update

function update(dt) {
  S.time += dt;
  const ev = S.event && S.event.id;
  S.mods.droneSpeed = ev === 'energy' ? 1.6 : 1;
  S.mods.breed = ev === 'radio' ? 3 : 1;
  S.mods.mut = ev === 'radio' ? 0.25 : 0;
  S.mods.income = ev === 'disco' ? 2 : 1;
  S.eggNagT -= dt;
  if (!S.over) {
    updateWaves(dt);
    updateEvents(dt);
    updateDiplo(dt);
  }
  updateBuildings(dt);
  updateSahurs(dt);
  updateDrones(dt);
  updateRunners(dt);
  updatePickups(dt);
  updateGolden(dt);
  updateFx(dt);
  S.comboT -= dt;
  if (S.comboT <= 0) S.combo = 0;
  S.shake = Math.max(0, S.shake - dt * 40);
  S.flash = Math.max(0, S.flash - dt * 1.2);
  S.rateT -= dt;
  if (S.rateT <= 0) {
    S.rateT = 0.5;
    let r = S.me.barn.hp > 0 ? 1 : 0;
    for (const c of allCritters(S.me)) r += (RARITY[SPECIES[c.sp].r].income / PROD_TIME) * S.mods.income;
    for (const b of S.buildings) if (b.trophy && b.owner === S.me) r += 1.5;
    S.rate = r;
  }
  if (S.demo) demoUpkeep();
  else if (!S.over && S.me.barn.hp <= 0) gameOver();
}

function demoUpkeep() {
  for (const f of S.farms) {
    if (allCritters(f).length < 4) {
      const pen = penWithRoom(f);
      if (pen) addCreature(pen, rollSeed(true), 1);
    }
  }
  if (S.wave > 6) S.wave = 4;
}

function updatePickups(dt) {
  for (const p of S.pickups) {
    if (p.z > 0 || p.vz > 0) {
      p.vz -= 14 * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) {
        p.z = 0;
        p.vz = p.vz < -1.5 ? -p.vz * 0.35 : 0;
      }
    } else p.life -= dt;
  }
  if (mouse.over && mode !== 'pause') collectAt(mouse.x, mouse.y, view.T * 0.45);
  S.pickups = S.pickups.filter(p => p.life > 0 && !p.got);
}

function updateFx(dt) {
  for (const p of S.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.g * dt;
    p.rot += p.vr * dt;
    if (p.kind === 'sahur') {
      p.z += p.vz * dt;
      p.vz -= 9 * dt;
    }
  }
  S.parts = S.parts.filter(p => p.life > 0);
  if (S.parts.length > 700) S.parts.splice(0, S.parts.length - 700);
  for (const t of S.texts) {
    t.life -= dt;
    t.t += dt;
    t.y -= dt * 0.5 * (t.life / t.max);
  }
  S.texts = S.texts.filter(t => t.life > 0);
  for (const f of S.flyCoins) {
    f.t += dt;
    if (f.t >= f.dur) {
      f.done = true;
      S.bumpT = 0.01;
    }
  }
  S.flyCoins = S.flyCoins.filter(f => !f.done);
  const b = S.banners[0];
  if (b) {
    b.t += dt;
    if (b.t > b.dur) S.banners.shift();
  }
}

// ---------------------------------------------------------------- render

function render() {
  const { W, H, dpr, T } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  grassPattern.setTransform(new DOMMatrix().translate(view.gx, view.gy).scale(T / Art.GRASS_PX));
  ctx.fillStyle = grassPattern;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (S.shake > 0.5 && !REDUCED) ctx.translate(rand(-1, 1) * S.shake, rand(-1, 1) * S.shake);
  bubbles = [];
  drawRoads();
  drawTiles();
  const ground = [], air = [];
  for (const b of S.buildings) if (onScreen(b.x, b.y)) ground.push([b.y + 0.4, 0, b]);
  for (const s of S.sahurs) if (onScreen(s.x, s.y)) (s.z > 0.12 ? air : ground).push([s.y, 1, s]);
  for (const r of S.runners) if (onScreen(r.x, r.y)) (r.z > 0.1 ? air : ground).push([r.y, 2, r]);
  for (const e of S.envoys) if (onScreen(e.x, e.y)) ground.push([e.y, 6, e]);
  if (S.golden) ground.push([S.golden.y, 3, S.golden]);
  for (const p of S.pickups) ground.push([p.y, 4, p]);
  ground.sort((a, b) => a[0] - b[0]);
  for (const it of ground) drawThing(it);
  for (const d of S.drones) if (onScreen(d.x, d.y)) Art.shadow(ctx, sx(d.x), sy(d.y), d.r * T * 0.85, d.r * T * 0.28, 0.2);
  drawBeams();
  for (const d of S.drones) if (onScreen(d.x, d.y - d.alt)) air.push([d.y, 5, d]);
  for (const b of S.bombs) if (onScreen(b.x, b.y)) air.push([b.y, 7, b]);
  air.sort((a, b) => a[0] - b[0]);
  for (const it of air) drawThing(it);
  drawParts();
  drawFarmLabels();
  drawTexts();
  drawBubbles();
  ctx.restore();
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  vg.addColorStop(0, 'rgba(20,40,10,0)');
  vg.addColorStop(1, 'rgba(20,40,10,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  drawOverlays();
  if (mode !== 'title') {
    drawArrows();
    drawMinimap();
  }
  drawFlyCoins();
  drawBanner();
  drawBossBar();
  drawCursor();
}

function drawRoads() {
  const T = view.T, me = S.me.barn;
  ctx.lineCap = 'round';
  for (const f of S.farms) {
    if (f.player) continue;
    const a = [sx(me.x), sy(me.y + 0.3)], b = [sx(f.barn.x), sy(f.barn.y + 0.3)];
    for (const [w, c] of [[0.5, '#a8814c'], [0.4, '#d2ad74']]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = T * w;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }
}

function drawTiles() {
  const T = view.T, hover = mouse.over && mode === 'play' && !mouse.mini ? tileAtScreen(mouse.x, mouse.y) : null;
  for (const t of S.tiles.values()) {
    const x = sx(t.c), y = sy(t.r);
    if (x < -T || x > view.W || y < -T || y > view.H) continue;
    if (t.unlocked) {
      ctx.fillStyle = t.farm.color + '30';
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, T - 2, T - 2, T * 0.16);
      ctx.fill();
      if (!t.b) Art.soil(ctx, x, y, T);
    } else if (mode === 'play' && canBuy(t)) {
      const hv = t === hover;
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = `rgba(255,255,255,${hv ? 0.85 : 0.3})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(x + T * 0.08, y + T * 0.08, T * 0.84, T * 0.84, T * 0.14);
      ctx.stroke();
      ctx.setLineDash([]);
      if (hv) Art.text(ctx, `🌱 ${price(S.me, 'land')}`, x + T / 2, y + T / 2, T * 0.16, '#fff');
      else Art.text(ctx, '+', x + T / 2, y + T / 2, T * 0.22, 'rgba(255,255,255,0.45)', { stroke: false });
    }
  }
  if (tool && hover) {
    const ok = hover.unlocked && !hover.b && hover.farm === S.me;
    const pulse = 0.5 + 0.5 * Math.sin(S.time * 8);
    ctx.fillStyle = ok ? `rgba(110,240,168,${0.25 + 0.15 * pulse})` : 'rgba(255,79,109,0.3)';
    ctx.beginPath();
    ctx.roundRect(sx(hover.c) + 3, sy(hover.r) + 3, T - 6, T - 6, T * 0.14);
    ctx.fill();
    if (ok) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      const x = sx(hover.c + 0.5), y = sy(hover.r + 0.5);
      if (tool === 'pen') {
        Art.penBack(ctx, x, y, T, 7);
        Art.penFront(ctx, x, y, T);
      } else if (tool === 'hut') Art.hut(ctx, x, y, T);
      else Art.hangar(ctx, x, y, T, 0, HANGAR_CAP);
      ctx.restore();
    }
  }
}

function drawFarmLabels() {
  const T = view.T;
  for (const f of S.farms) {
    if (f.player || !f.alive) continue;
    const x = sx(f.gx + f.cols / 2), y = sy(f.gy) - T * 0.25;
    if (!onScreen(f.gx + f.cols / 2, f.gy, 2)) continue;
    const r = relOf(f, S.me);
    const size = clamp(T * 0.17, 12, 22);
    Art.text(ctx, `${SPECIES[f.mascot].e} ${f.name}`, x, y - size * 1.1, size, f.color);
    const chip = { neutral: 'нейтралы', ally: 'СОЮЗ', war: 'ВОЙНА' }[r], col = { neutral: '#efe8f7', ally: '#7dff6a', war: '#ff4f6d' }[r];
    Art.text(ctx, chip, x, y, size * 0.75, col);
    if (f.mission) Art.text(ctx, '🥚 смотрят яйцо…', x, y + size * 0.95, size * 0.6, '#fff');
  }
}

function drawThing([, kind, o]) {
  const T = view.T;
  if (kind === 0) drawBuilding(o);
  else if (kind === 1) {
    Art.sahur(ctx, sx(o.x), sy(o.y), T * 0.36, {
      z: o.z * T, flip: o.flip, walk: o.walk, bat: o.bat, squash: o.squash, flash: o.flash, t: S.time,
      angry: o.state !== 'idle' || o.mode === 'raid', party: o.owner.player && S.event && S.event.id === 'party', team: o.owner.color,
    });
    if (o.hp < o.maxHp) hpBar(sx(o.x), sy(o.y) - o.z * T - T * 0.48, T * 0.24, o.hp / o.maxHp);
  } else if (kind === 2) {
    const c = o.c;
    Art.creature(ctx, sx(o.x), sy(o.y), T * 0.3, SPECIES[c.sp], { z: o.z * T, flip: o.flip, walk: o.walk, panic: true, t: S.time + c.id });
    if (c.sayLife > 0 && c.say) bubbles.push({ x: sx(o.x), y: sy(o.y) - T * 0.5 - o.z * T, str: c.say, mine: true });
  } else if (kind === 3) {
    Art.creature(ctx, sx(o.x), sy(o.y), T * 0.32, SPECIES.gold, { flip: o.vx < 0, walk: o.walk, t: S.time, look: null });
  } else if (kind === 4) {
    const x = sx(o.x), y = sy(o.y);
    Art.shadow(ctx, x, y, T * 0.1, T * 0.035, 0.25);
    if (!(o.life < 1.5 && Math.floor(o.life * 8) % 2)) Art.emoji(ctx, '🪙', x, y - o.z * T - T * 0.1, T * 0.2);
  } else if (kind === 6) {
    const x = sx(o.x), y = sy(o.y);
    Art.creature(ctx, x, y, T * 0.3, SPECIES[o.sp], { flip: o.flip, walk: o.walk, t: S.time });
    Art.emoji(ctx, '🏳️', x + T * 0.14, y - T * 0.5, T * 0.2);
  } else if (kind === 7) {
    Art.emoji(ctx, '💣', sx(o.x), sy(o.y - o.z), T * 0.2);
  } else drawDrone(o);
}

function drawBuilding(b) {
  const T = view.T, x = sx(b.x), y = sy(b.y);
  const popS = b.anim < 0.4 ? easeBack(b.anim / 0.4) : 1;
  const jig = b.flash > 0 ? Math.sin(S.time * 80) * b.flash * T * 0.02 : 0;
  const tf = () => {
    ctx.translate(x + jig, y + T * 0.4);
    ctx.scale(popS, popS);
    ctx.translate(0, -T * 0.4);
  };
  ctx.save();
  tf();
  if (b.type === 'barn') {
    Art.barn(ctx, 0, 0, T, b.hp / b.maxHp, b.wall, b.roof, b.mascot ? null : 'ФЕРМА');
    if (b.mascot && b.hp > 0) Art.emoji(ctx, SPECIES[b.mascot].e, 0, -T * 0.07, T * 0.14);
  } else if (b.type === 'hut') Art.hut(ctx, 0, 0, T);
  else if (b.type === 'hangar') Art.hangar(ctx, 0, 0, T, b.planes, HANGAR_CAP);
  else Art.penBack(ctx, 0, 0, T, b.seed);
  if (b.type !== 'pen') Art.flag(ctx, T * 0.36, T * 0.3, T * 0.9, b.owner.color, S.time);
  ctx.restore();
  if (b.type === 'pen') {
    const dance = S.event && S.event.id === 'disco' && b.owner === S.me;
    const talk = T > 50;
    for (const c of b.creatures.slice().sort((p, q) => p.oy - q.oy)) {
      const cx = sx(b.x + c.ox), cy = sy(b.y + c.oy);
      Art.creature(ctx, cx, cy, T * 0.3, SPECIES[c.sp], {
        z: c.lift * ALT * T, flip: c.flip, walk: c.walk, look: c.look, panic: c.panic || !!c.grabbedBy,
        scale: c.born > 0 ? easeBack(1 - c.born) : 1, t: S.time + c.id, dance,
      });
      if (talk && c.sayLife > 0 && c.say) bubbles.push({ x: cx, y: cy - T * 0.5 - c.lift * ALT * T, str: c.say, mine: b.owner === S.me });
    }
    if (b.egg) {
      const k = Math.min(1, b.egg.t / EGG_TIME), ey = y + T * 0.16;
      ctx.save();
      ctx.translate(x, ey);
      ctx.rotate(Math.sin(S.time * 22) * 0.25 * (b.egg.wait ? 0.15 : k));
      Art.emoji(ctx, '🥚', 0, -T * 0.1, T * 0.24);
      ctx.restore();
      if (b.egg.wait && b.owner === S.me) Art.text(ctx, '!', x + T * 0.12, ey - T * 0.24, T * 0.16, '#ffd84a');
    }
    ctx.save();
    tf();
    Art.penFront(ctx, 0, 0, T);
    ctx.restore();
    if (b.creatures.length >= 2 && !b.egg) ring(x + T * 0.36, y - T * 0.42, T * 0.09, b.breed, '#ff4f8b', '💗');
  }
  if (b.type === 'hut') {
    const cap = sahurCap(b.owner);
    for (let i = 0; i < cap; i++) {
      ctx.fillStyle = i < b.count ? b.owner.color : 'rgba(0,0,0,0.35)';
      ctx.strokeStyle = Art.INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + (i - (cap - 1) / 2) * T * 0.1, y + T * 0.44, T * 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (b.count < cap) ring(x - T * 0.38, y - T * 0.36, T * 0.07, b.spawnT / HUT_TIME, '#ffcf8a', '');
  }
  if (b.type === 'hangar' && b.planes < HANGAR_CAP) ring(x - T * 0.38, y - T * 0.36, T * 0.07, b.spawnT / HANGAR_TIME, '#8fd45f', '');
  if (b.hp < b.maxHp - 0.5 && b.hp > 0) hpBar(x, y - T * 0.5, T * 0.6, b.hp / b.maxHp);
}

function ring(x, y, r, frac, color, ico) {
  ctx.fillStyle = 'rgba(36,17,51,0.75)';
  ctx.beginPath();
  ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(frac, 0, 1));
  ctx.stroke();
  if (ico) Art.emoji(ctx, ico, x, y, r * 1.1);
}

function hpBar(x, y, w, frac) {
  const h = Math.max(4, view.T * 0.045);
  ctx.fillStyle = Art.INK;
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - 2, y - 2, w + 4, h + 4, h);
  ctx.fill();
  ctx.fillStyle = frac > 0.6 ? '#6ef06a' : frac > 0.3 ? '#ffd84a' : '#ff4f6d';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, Math.max(1, w * frac), h, h / 2);
  ctx.fill();
}

function drawDrone(d) {
  const T = view.T, x = sx(d.x), y = sy(d.y - d.alt) + Math.sin(d.t * 4 + d.seed) * T * 0.02, R = d.r * T;
  if (d.type === 'bomber') {
    const a = Math.atan2(d.vy, d.vx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 4);
    Art.emoji(ctx, '✈️', 0, 0, R * 2.6);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y - R * 0.3);
    if (d.vx < 0) ctx.scale(-1, 1);
    Art.emoji(ctx, '🐊', 0, 0, R * 1.7);
    ctx.restore();
    ctx.fillStyle = d.owner.color;
    ctx.strokeStyle = Art.INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - R * 1.3, R * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (d.flash > 0) {
      ctx.globalAlpha = d.flash * 0.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (d.hp < d.maxHp) hpBar(x, y - R * 1.7, Math.max(26, R * 2), d.hp / d.maxHp);
    return;
  }
  if (d.carry) {
    Art.creature(ctx, x, y + R * 0.8 + T * 0.28, T * 0.26, SPECIES[d.carry.sp], { noShadow: true, panic: true, walk: S.time * 30, t: S.time + d.carry.id });
    if (d.carry.sayLife > 0) {
      d.carry.sayLife -= 0.016;
      bubbles.push({ x, y: y + R * 0.8 + T * 0.02, str: d.carry.say, mine: d.carry.homeOwner === S.me });
    }
  }
  Art.drone(ctx, x, y, R, { type: d.type, t: d.t, tilt: d.tilt, flash: d.flash, seed: d.seed, carry: !!d.carry });
  if (d.hp < d.maxHp && d.type !== 'boss') hpBar(x, y - R * 1.1, Math.max(26, R * 2), d.hp / d.maxHp);
  if ((d.type === 'kami' || d.type === 'mini') && d.goal && Math.hypot(d.goal.x - d.x, d.goal.y - d.y) < 1.4 && Math.floor(S.time * 8) % 2) {
    Art.text(ctx, '!', x, y - R * 1.6, T * 0.2, '#ff4f6d');
  }
}

function drawBeams() {
  const T = view.T;
  for (const d of S.drones) {
    if (!onScreen(d.x, d.y)) continue;
    const x = sx(d.x), y = sy(d.y - d.alt);
    if (d.state === 'grab' && d.prey && d.prey.pen) {
      const c = d.prey, cx = sx(c.pen.x + c.ox), cy = sy(c.pen.y + c.oy);
      const g = ctx.createLinearGradient(0, y, 0, cy);
      g.addColorStop(0, 'rgba(120,230,255,0.55)');
      g.addColorStop(1, 'rgba(120,230,255,0.08)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - T * 0.06, y + T * 0.05);
      ctx.lineTo(x + T * 0.06, y + T * 0.05);
      ctx.lineTo(cx + T * 0.2, cy);
      ctx.lineTo(cx - T * 0.2, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,250,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const k = (S.time * 2 + i / 3) % 1, ly = lerp(cy, y, k), lw = lerp(T * 0.2, T * 0.06, k);
        ctx.beginPath();
        ctx.moveTo(lerp(cx, x, k) - lw, ly);
        ctx.lineTo(lerp(cx, x, k) + lw, ly);
        ctx.stroke();
      }
    }
    if (d.firing && d.goal) {
      const tx = sx(d.goal.x) + rand(-3, 3), ty = sy(d.goal.y) - T * 0.15 + rand(-3, 3), k = d.type === 'boss' ? 1.6 : 1;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,40,80,0.35)';
      ctx.lineWidth = T * 0.09 * k;
      ctx.beginPath();
      ctx.moveTo(x, y + d.r * T * 0.1);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = T * 0.02 * k;
      ctx.stroke();
    }
  }
}

function drawParts() {
  const T = view.T;
  for (const p of S.parts) {
    const a = clamp(p.life / p.max, 0, 1), X = sx(p.x), Y = sy(p.y), R = p.size * T;
    if (X < -60 || X > view.W + 60 || Y < -60 || Y > view.H + 60) continue;
    if (p.kind === 'flash') {
      const r = R * (2 - a);
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, `rgba(255,250,220,${a})`);
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 4 * a + 1;
      ctx.beginPath();
      ctx.arc(X, Y, (p.size + p.grow * (1 - a)) * T, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.lineTo(X - p.vx * T * 0.03, Y - p.vy * T * 0.03);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = (p.color === '#fff' ? 'rgba(70,64,80,' : p.color) + a * 0.45 + ')';
      ctx.beginPath();
      ctx.arc(X, Y, R * (2 - a), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'debris') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.translate(X, Y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-R, -R * 0.6, R * 2, R * 1.2);
      ctx.restore();
    } else if (p.kind === 'star') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(p.life * 6);
      ctx.fillRect(-R, -R * 0.25, R * 2, R * 0.5);
      ctx.fillRect(-R * 0.25, -R, R * 0.5, R * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'heart') {
      ctx.globalAlpha = a;
      Art.emoji(ctx, '💗', X, Y, R * 2.4);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'emoji') {
      ctx.globalAlpha = a;
      Art.emoji(ctx, p.e, X, Y, R * 2 * (1.4 - a * 0.4));
      ctx.globalAlpha = 1;
    } else if (p.kind === 'drop') {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.lineTo(X, Y - T * 0.15);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'sahur') {
      Art.sahur(ctx, X, Y, T * 0.36, { z: p.z * T, rot: p.rot, flip: p.flip, angry: true, alpha: Math.min(1, a * 2), noShadow: true, team: p.team });
    }
  }
}

function drawTexts() {
  const T = view.T;
  for (const t of S.texts) {
    const a = Math.min(1, (t.life / t.max) * 3);
    const sc = t.t < 0.12 ? 0.5 + (t.t / 0.12) * 0.7 : t.t < 0.2 ? 1.2 - ((t.t - 0.12) / 0.08) * 0.2 : 1;
    ctx.globalAlpha = a;
    Art.text(ctx, t.str, sx(t.x), sy(t.y), Math.max(11, t.size * T * sc), t.color);
  }
  ctx.globalAlpha = 1;
}

function drawBubbles() {
  if (view.T < 50) return;
  bubbles.sort((a, b) => b.mine - a.mine);
  const size = Math.max(10, view.T * 0.1);
  for (const b of bubbles.slice(0, 5)) Art.bubble(ctx, b.x, b.y, b.str, size);
}

function drawOverlays() {
  const { W, H } = view, id = S.event && S.event.id;
  if (id === 'energy') {
    ctx.fillStyle = `rgba(255,60,40,${0.07 + 0.04 * Math.sin(S.time * 10)})`;
    ctx.fillRect(0, 0, W, H);
  } else if (id === 'radio') {
    ctx.fillStyle = 'rgba(120,255,60,0.09)';
    ctx.fillRect(0, 0, W, H);
  } else if (id === 'disco') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = Math.sin(S.time * 0.9 + i * 1.7) * 0.9 + Math.PI / 2, hue = (S.time * 90 + i * 60) % 360;
      ctx.fillStyle = `hsla(${hue},100%,60%,0.09)`;
      ctx.beginPath();
      ctx.moveTo(W / 2, -20);
      ctx.lineTo(W / 2 + Math.cos(a - 0.12) * H * 1.6, -20 + Math.sin(a - 0.12) * H * 1.6);
      ctx.lineTo(W / 2 + Math.cos(a + 0.12) * H * 1.6, -20 + Math.sin(a + 0.12) * H * 1.6);
      ctx.fill();
    }
    ctx.restore();
  }
  const f = S.me.barn.hp / S.me.barn.maxHp;
  if (!S.demo && f < 0.35 && mode === 'play') {
    const a = (0.35 - f) * 1.4 * (0.6 + 0.4 * Math.sin(S.time * 6));
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(255,0,40,0)');
    g.addColorStop(1, `rgba(255,0,40,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (S.flash > 0 && !REDUCED) {
    ctx.globalAlpha = S.flash * 0.45;
    ctx.fillStyle = S.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

// screen-edge arrows for anything off-screen that's coming for our farm
function drawArrows() {
  const { W, H } = view, top = 80, bot = H - 110, list = [];
  for (const d of S.drones) {
    const mineTarget = d.owner ? d.target === S.me && d.state !== 'back' : d.farm === S.me && d.state !== 'flee';
    if (mineTarget && !d.dead) list.push([d.x, d.y - d.alt, d.owner ? d.owner.color : '#ff4f6d']);
  }
  for (const s of S.sahurs) if (s.mode === 'raid' && s.goal === S.me) list.push([s.x, s.y, s.owner.color]);
  const cx = W / 2, cy = (top + bot) / 2;
  let n = 0;
  for (const [x, y, col] of list) {
    const px = sx(x), py = sy(y);
    if (px > 0 && px < W && py > top && py < bot) continue;
    if (++n > 14) break;
    const a = Math.atan2(py - cy, px - cx);
    const k = Math.min((W / 2 - 30) / Math.abs(Math.cos(a) || 1e-6), ((bot - top) / 2 - 24) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.fillStyle = col;
    ctx.strokeStyle = Art.INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}

function miniRect() {
  const w = MINI.w, h = MINI.h;
  return { x: view.W - w - 12, y: view.H - h - (view.W < 1150 ? 112 : 14), w, h };
}

function miniToWorld(px, py) {
  const m = miniRect(), k = Math.min(m.w / (WORLD.r - WORLD.l), m.h / (WORLD.b - WORLD.t));
  return { x: WORLD.l + (px - m.x) / k, y: WORLD.t + (py - m.y) / k };
}

function drawMinimap() {
  const m = miniRect(), k = Math.min(m.w / (WORLD.r - WORLD.l), m.h / (WORLD.b - WORLD.t));
  const mx = x => m.x + (x - WORLD.l) * k, my = y => m.y + (y - WORLD.t) * k;
  ctx.fillStyle = 'rgba(36,17,51,0.85)';
  ctx.strokeStyle = Art.INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8, 12);
  ctx.fill();
  ctx.stroke();
  for (const t of S.tiles.values()) {
    if (!t.unlocked) continue;
    ctx.fillStyle = t.farm.color;
    ctx.globalAlpha = t.b ? 0.95 : 0.45;
    ctx.fillRect(mx(t.c) + 0.5, my(t.r) + 0.5, k - 1, k - 1);
  }
  ctx.globalAlpha = 1;
  for (const s of S.sahurs) {
    if (s.mode !== 'raid') continue;
    ctx.fillStyle = s.owner.color;
    ctx.fillRect(mx(s.x) - 1.5, my(s.y) - 1.5, 3, 3);
  }
  for (const d of S.drones) {
    ctx.fillStyle = d.owner ? d.owner.color : d.type === 'boss' ? '#fff' : '#ff3b5c';
    const r = d.type === 'boss' ? 4 : 2;
    ctx.fillRect(mx(d.x) - r / 2, my(d.y) - r / 2, r, r);
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mx(wxOf(0)), my(wyOf(0)), view.W / view.T * k, view.H / view.T * k);
}

function drawFlyCoins() {
  if (!S.flyCoins.length || S.demo) return;
  if (!coinTarget) {
    const r = $('coinIco').getBoundingClientRect();
    coinTarget = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  for (const f of S.flyCoins) {
    if (f.t < 0) continue;
    const e = Math.pow(clamp(f.t / f.dur, 0, 1), 1.6), u = 1 - e;
    Art.emoji(ctx, '🪙', u * u * f.x + 2 * u * e * f.cx + e * e * coinTarget.x, u * u * f.y + 2 * u * e * f.cy + e * e * coinTarget.y, 20);
  }
}

function drawBanner() {
  const b = S.banners[0];
  if (!b) return;
  const { W, H } = view, t = b.t;
  const sc = t < 0.3 ? easeBack(t / 0.3) : 1;
  const a = t > b.dur - 0.4 ? Math.max(0, (b.dur - t) / 0.4) : 1;
  let size = Math.min(W * 0.06, 64);
  ctx.font = `900 ${size}px "Segoe UI Black", "Arial Black", sans-serif`;
  const tw = ctx.measureText(b.title).width;
  if (tw > W * 0.6) size *= (W * 0.6) / tw;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, H * 0.22);
  ctx.scale(sc, sc);
  ctx.rotate(-0.03 + Math.sin(t * 3) * 0.01);
  Art.text(ctx, b.title, 0, 0, size, b.color, { sw: 0.26 });
  if (b.sub) {
    let ss = Math.max(15, size * 0.36);
    ctx.font = `900 ${ss}px "Segoe UI Black", "Arial Black", sans-serif`;
    const sw = ctx.measureText(b.sub).width;
    if (sw > W * 0.6) ss *= (W * 0.6) / sw;
    Art.text(ctx, b.sub, 0, size * 0.85, ss, '#fff', { sw: 0.32 });
  }
  ctx.restore();
}

function drawBossBar() {
  const boss = S.drones.find(d => d.type === 'boss');
  if (!boss || S.demo) return;
  const w = Math.min(460, view.W * 0.4), x = view.W / 2 - w / 2, y = 124;
  Art.text(ctx, 'МЕГАДРОН-3000', view.W / 2, y - 14, 18, '#ff4f6d');
  ctx.fillStyle = Art.INK;
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, w + 6, 20, 10);
  ctx.fill();
  ctx.fillStyle = '#ff2244';
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(2, (w * boss.hp) / boss.maxHp), 14, 7);
  ctx.fill();
}

function drawCursor() {
  if (!mouse.over || mouse.touch || mode === 'pause' || mouse.mini) return;
  const x = mouse.x, y = mouse.y;
  if (tool) {
    Art.emoji(ctx, { pen: '🏠', hut: '🪵', hangar: '🛩' }[tool], x + 16, y + 16, 26);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x + 7, y);
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y + 7);
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = Art.INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  const sw = mouse.swing;
  ctx.save();
  ctx.translate(x + 12, y - 12);
  ctx.rotate(-0.35 + sw * 1.1);
  ctx.scale(1 + sw * 0.3, 1 + sw * 0.3);
  Art.emoji(ctx, WEAPONS[S.me.weapon].e, 0, 0, 36);
  ctx.restore();
  if (S.combo >= 3 && S.comboT > 0) {
    Art.text(ctx, `x${S.combo}`, x + 36, y + 22, 18 + Math.min(18, S.combo), `hsl(${(S.combo * 25) % 360},100%,65%)`);
  }
}

// ---------------------------------------------------------------- HUD & toolbar

const hudCache = {};
function setText(id, v) {
  if (hudCache[id] !== v) {
    hudCache[id] = v;
    $(id).textContent = v;
  }
}
function setStyle(id, prop, v) {
  const k = id + prop;
  if (hudCache[k] !== v) {
    hudCache[k] = v;
    $(id).style[prop] = v;
  }
}

function toolInfo(id) {
  const me = S.me;
  if (id === 'pen') return { ico: '🏠', name: 'Клетка', price: price(me, 'pen'), desc: 'Домик на 3 зверят. Двое в клетке несут яйцо, из яйца вылупляется рандом.' };
  if (id === 'hut') return { ico: '🪵', name: 'Сахурня', price: price(me, 'hut'), desc: `Рожает Тун Тун Сахуров (до ${sahurCap(me)}). Они бьют дронов, защищают от набегов и ходят в набеги сами.` };
  if (id === 'hangar') return { ico: '🛩', name: 'Ангар', price: price(me, 'hangar'), desc: `Раз в ${HANGAR_TIME} с выпускает Бомбардиро Крокодило (до ${HANGAR_CAP}). Бомбит фермы, с которыми ты воюешь.` };
  if (id === 'weapon') {
    const n = WEAPONS[me.weapon + 1], cur = WEAPONS[me.weapon];
    if (!n) return { ico: cur.e, name: cur.name, price: null, desc: 'Лучшее оружие уже у тебя. Ты и есть Сахур.' };
    return { ico: n.e, name: n.name, price: n.cost, desc: `Оружие для кликов: урон ${n.dmg}${n.splash ? ' и по площади' : ''}. Сейчас ${cur.name.toLowerCase()} (${cur.dmg}). Бьёт и дронов, и вражеских сахуров.` };
  }
  const cost = GYM_COST[me.sahurLvl];
  if (cost == null) return { ico: '💪', name: 'Качалка', price: null, desc: 'Сахуры накачаны до предела.' };
  return { ico: '💪', name: `Качалка ${me.sahurLvl + 1}`, price: cost, desc: `Сахуры бьют сильнее (урон ${me.sahurLvl + 2}), живучее, прыгают дальше и чаще.` };
}

function buildToolbar() {
  const bar = $('toolbar');
  bar.innerHTML = TOOLS.map(t => `<button class="tool" id="tool-${t.id}" data-id="${t.id}"><span class="key">${t.key}</span><span class="ico"></span><span class="nm"></span><span class="pr"></span></button>`).join('');
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.addEventListener('click', e => {
    const b = e.target.closest('.tool');
    if (b) useTool(b.dataset.id);
  });
  bar.addEventListener('mouseover', e => {
    const b = e.target.closest('.tool');
    hoverTool = b ? b.dataset.id : null;
  });
  bar.addEventListener('mouseleave', () => { hoverTool = null; });
}

function updateHud(dt) {
  if (mode === 'title') return;
  const me = S.me;
  setText('coins', String(Math.floor(me.coins)));
  setText('rate', `+${S.rate.toFixed(1)}/с`);
  if (S.bumpT > 0) {
    S.bumpT = 0;
    const el = $('coins').parentElement;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  const fight = S.phase === 'fight';
  setText('waveLabel', fight ? `ВОЛНА ${S.wave}` : S.wave === 0 ? 'ПОДГОТОВКА' : 'ПЕРЕДЫШКА');
  const left = S.queue.length + S.drones.filter(d => !d.owner).length;
  setStyle('waveBar', 'width', (fight ? clamp(1 - left / Math.max(1, S.waveTotal), 0, 1) : clamp(1 - S.phaseT / S.phaseMax, 0, 1)) * 100 + '%');
  const f = me.barn.hp / me.barn.maxHp;
  setStyle('hpBar', 'width', f * 100 + '%');
  setStyle('hpBar', 'background', f > 0.6 ? '#6ef06a' : f > 0.3 ? '#ffd84a' : '#ff4f6d');
  setText('hpText', String(Math.ceil(me.barn.hp)));
  setText('nCritters', String(allCritters(me).length));
  let guards = 0, raiders = 0;
  for (const s of S.sahurs) if (s.owner === me) s.mode === 'raid' ? raiders++ : guards++;
  setText('nSahurs', raiders ? `${guards} +${raiders}⚔️` : String(guards));
  setText('nPlanes', String(planesOf(me)));
  const showNext = !fight && !S.over && mode === 'play';
  if ($('nextWave').hidden === showNext) $('nextWave').hidden = !showNext;
  if (showNext) {
    setText('nextNum', String(S.wave + 1));
    setText('nextT', String(Math.ceil(S.phaseT)));
    setText('nextBonus', '+' + Math.round(S.phaseT * (2 + S.wave)));
  }
  for (const t of TOOLS) {
    const info = toolInfo(t.id), el = $('tool-' + t.id);
    const poor = info.price != null && me.coins < info.price;
    const key = `${info.ico}|${info.name}|${info.price}|${poor}|${tool === t.id}`;
    if (el._k === key) continue;
    el._k = key;
    el.querySelector('.ico').textContent = info.ico;
    el.querySelector('.nm').textContent = info.name;
    el.querySelector('.pr').textContent = info.price == null ? 'МАКС' : `${info.price} 🪙`;
    el.classList.toggle('poor', poor);
    el.classList.toggle('max', info.price == null);
    el.classList.toggle('sel', tool === t.id);
  }
  const name = { pen: 'клетку', hut: 'сахурню', hangar: 'ангар' }[tool];
  const hint = tool ? `Кликни по пустой ячейке своей фермы, чтобы поставить ${name} · ПКМ или Esc — отмена` : hoverTool && mode === 'play' ? toolInfo(hoverTool).desc : '';
  setText('hint', hint);
  if ($('hint').hidden === !!hint) $('hint').hidden = !hint;
  updateDiploPanel(dt);
}

// ---------------------------------------------------------------- flow

function showScreen(id) {
  for (const s of ['title', 'pause', 'over', 'win']) $(s).hidden = s !== id;
  const inGame = id !== 'title';
  $('hud').hidden = !inGame;
  $('toolbar').hidden = !inGame;
  $('diplo').hidden = !inGame;
  if (!inGame) {
    $('nextWave').hidden = true;
    $('hint').hidden = true;
    $('feed').innerHTML = '';
  }
}

function startGame() {
  AudioFX.init();
  newGame(false);
  mode = 'play';
  showScreen(null);
  AudioFX.setLevel(0);
  AudioFX.duck(false);
  for (const k in hudCache) delete hudCache[k];
  for (const t of TOOLS) $('tool-' + t.id)._k = null;
  for (let i = 1; i <= 4; i++) $('nb-' + i)._k = null;
  coinTarget = null;
  toast('🍓🍌 Двое в клетке скоро снесут яйцо. Дроны прилетят через 16 секунд!', 'good');
  toast('🤝 Справа соседи: отправь посла — будет союз. Или война. Колесо — зум, ПКМ — двигать карту.');
}

function toMenu() {
  newGame(true);
  mode = 'title';
  showScreen('title');
  $('bestLine').textContent = best ? `Рекорд: волна ${best}` : '';
  AudioFX.setLevel(0);
  AudioFX.duck(false);
}

function togglePause() {
  if (mode === 'play') {
    mode = 'pause';
    tool = null;
    closePopup();
    showScreen('pause');
    AudioFX.duck(true);
  } else if (mode === 'pause') {
    mode = 'play';
    showScreen(null);
    AudioFX.duck(false);
  }
}

function winGame() {
  if (S.won || mode !== 'play') return;
  S.won = true;
  mode = 'win';
  $('winStats').innerHTML = statsHtml();
  showScreen('win');
  sfx('win');
}

function statsHtml() {
  const st = S.stats;
  return `
    <div><span>Волна</span><b>${S.wave}</b></div>
    <div><span>Ферм захвачено</span><b>${st.annexed}</b></div>
    <div><span>Дронов сбито</span><b>${st.kills}</b></div>
    <div><span>Набегов</span><b>${st.raids}</b></div>
    <div><span>Зверят вылупилось</span><b>${st.born}</b></div>
    <div><span>Мутаций</span><b>${st.mutations}</b></div>
    <div><span>Украдено дронами</span><b>${st.stolen}</b></div>
    <div><span>Лучший зверь</span><b>${st.bestName}</b></div>`;
}

function gameOver() {
  S.over = true;
  S.phase = 'over';
  mode = 'over';
  tool = null;
  closePopup();
  const b = S.me.barn;
  flyTo(b.x, b.y);
  for (let i = 0; i < 3; i++) boomFx(b.x + rand(-0.3, 0.3), b.y - rand(0, 0.4), 2.2, false);
  chips(b.x, b.y, 30);
  S.shake = 30;
  S.slowmo = 1.5;
  S.flash = 0.8;
  S.flashColor = '#ff4f6d';
  sfx('boom', 3);
  sfx('lose');
  AudioFX.setLevel(-1);
  const newBest = S.wave > best;
  if (newBest) {
    best = S.wave;
    try { localStorage.setItem('tt_best', String(best)); } catch (e) { /* storage unavailable */ }
  }
  $('overStats').innerHTML = statsHtml() + (newBest ? '<div class="nb">НОВЫЙ РЕКОРД!</div>' : `<div><span>Рекорд</span><b>волна ${best}</b></div>`);
  setTimeout(() => {
    if (mode === 'over') showScreen('over');
  }, 1800);
}

// ---------------------------------------------------------------- input

function inMini(px, py) {
  const m = miniRect();
  return mode !== 'title' && px >= m.x - 4 && px <= m.x + m.w + 4 && py >= m.y - 4 && py <= m.y + m.h + 4;
}

canvas.addEventListener('pointermove', e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.over = true;
  mouse.touch = e.pointerType === 'touch';
  mouse.mini = inMini(e.clientX, e.clientY);
  const d = cam.drag;
  if (d) {
    if (d.mini) {
      const p = miniToWorld(e.clientX, e.clientY);
      cam.x = p.x;
      cam.y = p.y;
    } else {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
      cam.x = d.cx - (e.clientX - d.x) / cam.T;
      cam.y = d.cy - (e.clientY - d.y) / cam.T;
    }
    cam.fly = null;
  }
});
canvas.addEventListener('pointerleave', () => { mouse.over = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (mode === 'title') return;
  zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
}, { passive: false });
canvas.addEventListener('pointerup', e => {
  const d = cam.drag;
  cam.drag = null;
  if (d && !d.mini && !d.moved && e.button === 2) {
    tool = null;
    closePopup();
  }
});
canvas.addEventListener('pointerdown', e => {
  AudioFX.init();
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.over = true;
  mouse.touch = e.pointerType === 'touch';
  if (!S || mode === 'pause' || mode === 'win') return;
  canvas.setPointerCapture(e.pointerId);
  const px = e.clientX, py = e.clientY;
  if (inMini(px, py) && e.button === 0) {
    const p = miniToWorld(px, py);
    cam.x = p.x;
    cam.y = p.y;
    cam.fly = null;
    cam.drag = { mini: true };
    return;
  }
  if (e.button === 1 || e.button === 2) {
    if (mode !== 'title') cam.drag = { x: px, y: py, cx: cam.x, cy: cam.y, moved: false };
    return;
  }
  if (e.button !== 0) return;
  mouse.swing = 1;
  if (handHit(px, py)) return;
  if (collectAt(px, py, view.T * 0.5)) return;
  if (mode !== 'play') return;
  const t = tileAtScreen(px, py);
  if (tool) return tryBuild(t);
  if (threatNear(px, py, view.T * 0.9)) {
    sfx('miss', 0, true);
    return;
  }
  const c = creatureAtScreen(px, py);
  if (c && c.pen.owner === S.me) return openPopup('creature', c);
  if (t && t.b) return t.b.owner === S.me ? openPopup(t.b.type, t.b) : t.farm.player ? null : openFarm(t.b.owner);
  if (t && canBuy(t)) return openPopup('land', t);
  closePopup();
  sfx('miss', 0, true);
});

function openFarm(f) {
  if (f.player) return;
  const orig = S.farms.find(o => !o.player && o.alive && o === f);
  if (orig) openPopup('farm', orig);
}

addEventListener('keydown', e => {
  AudioFX.init();
  const k = e.code;
  if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
  keys.add(k);
  if (e.repeat) return;
  if (k === 'KeyM') {
    $('btnMute').textContent = AudioFX.toggleMute() ? '🔇' : '🔊';
    return;
  }
  if (mode === 'title') {
    if (k === 'Enter' || k === 'Space') startGame();
    return;
  }
  if (mode === 'over') {
    if ((k === 'Enter' || k === 'Space') && !$('over').hidden) startGame();
    return;
  }
  if (mode === 'win') return;
  if (k === 'Escape') {
    if (tool || pop) {
      tool = null;
      closePopup();
    } else togglePause();
    return;
  }
  if (k === 'Space' || k === 'KeyP') return togglePause();
  if (mode !== 'play') return;
  const n = TOOLS.findIndex(t => k === 'Digit' + t.key || k === 'Numpad' + t.key);
  if (n >= 0) useTool(TOOLS[n].id);
  if (k === 'KeyN') nextWaveNow();
  if (k === 'KeyH' || k === 'Home') flyTo(COLS / 2, ROWS / 2);
});
addEventListener('keyup', e => keys.delete(e.code));

for (const id of ['btnPlay', 'btnAgain', 'btnResume', 'btnQuit', 'btnMenu', 'btnNext', 'btnMute', 'btnPause', 'btnHome', 'btnContinue', 'btnWinMenu']) {
  $(id).addEventListener('mousedown', e => e.preventDefault());
}
$('btnPlay').addEventListener('click', startGame);
$('btnAgain').addEventListener('click', startGame);
$('btnResume').addEventListener('click', togglePause);
$('btnQuit').addEventListener('click', toMenu);
$('btnMenu').addEventListener('click', toMenu);
$('btnWinMenu').addEventListener('click', toMenu);
$('btnContinue').addEventListener('click', () => {
  mode = 'play';
  showScreen(null);
});
$('btnNext').addEventListener('click', nextWaveNow);
$('btnPause').addEventListener('click', togglePause);
$('btnHome').addEventListener('click', () => flyTo(COLS / 2, ROWS / 2));
$('btnMute').addEventListener('click', () => {
  AudioFX.init();
  $('btnMute').textContent = AudioFX.toggleMute() ? '🔇' : '🔊';
});
addEventListener('resize', layout);
addEventListener('blur', () => {
  keys.clear();
  if (mode === 'play') togglePause();
});

// ---------------------------------------------------------------- main loop

let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode !== 'pause' && mode !== 'win') {
    let dt = raw;
    if (S.slowmo > 0) {
      S.slowmo -= raw;
      dt *= 0.3;
    }
    update(dt);
  }
  updateCam(raw);
  mouse.swing = Math.max(0, mouse.swing - raw * 6);
  render();
  updateHud(raw);
  popupTick(raw);
  requestAnimationFrame(frame);
}

layout();
buildToolbar();
buildDiplo();
$('btnMute').textContent = AudioFX.isMuted() ? '🔇' : '🔊';
toMenu();
AudioFX.init();
requestAnimationFrame(frame);
