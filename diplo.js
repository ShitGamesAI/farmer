'use strict';
// Neighbour farms: setup, relations (neutral / ally / war), the AI that runs them, envoys,
// raids, bombers, annexation and the diplomacy side panel. Uses helpers from game.js at call time.

function makeFarm(id, def) {
  return {
    id, player: id === 0, name: def.name, mascot: def.mascot || null, color: def.color, wall: def.wall, roof: def.roof,
    likes: def.likes || null, aggr: def.aggr || 1, gx: def.gx, gy: def.gy, cols: def.cols || 3, rows: def.rows || 3,
    coins: 0, sahurLvl: 0, weapon: 0, built: { pen: 0, hut: 0, hangar: 0, land: 0 }, alive: true, barn: null, auto: false,
    ai: { thinkT: rand(1, 3), raid: {}, giftT: rand(40, 70), demandT: rand(70, 130) },
    offer: null, demand: null, mission: null, envoy: false, warT: 0, conqueredBy: null,
  };
}

function initFarms(demo) {
  const me = makeFarm(0, { name: 'Твоя ферма', color: PLAYER_COLOR, wall: '#d8423a', roof: '#6e2a2e', gx: 0, gy: 0, cols: COLS, rows: ROWS, aggr: 1.2 });
  me.coins = demo ? 99999 : 80;
  me.auto = demo;
  if (demo) me.sahurLvl = 1;
  S.me = me;
  S.farms = [me, ...NEIGHBORS.map((n, i) => makeFarm(i + 1, n))];
  S.rel = S.farms.map(() => S.farms.map(() => 'neutral'));
  for (const f of S.farms) {
    for (let r = 0; r < f.rows; r++) {
      for (let c = 0; c < f.cols; c++) {
        const tc = f.gx + c, tr = f.gy + r;
        const unlocked = !f.player || demo || (Math.abs(tc - BARN_C) <= 1 && Math.abs(tr - BARN_R) <= 1);
        S.tiles.set(tkey(tc, tr), { c: tc, r: tr, farm: f, unlocked, b: null });
      }
    }
    f.barn = placeBuilding('barn', f.player ? tileAt(BARN_C, BARN_R) : tileAt(f.gx + 1, f.gy + 1), f);
    f.barn.hq = true;
    // neighbour HQs are sturdier so a conquest takes a real raid, not one lucky bomb
    if (!f.player) f.barn.hp = f.barn.maxHp = 260;
  }
  const pen = placeBuilding('pen', tileAt(2, 2), me);
  addCreature(pen, 'straw');
  addCreature(pen, 'banana');
  for (const f of S.farms) {
    if (f.player) continue;
    f.coins = 60;
    const spots = freeTilesOf(f).sort(() => Math.random() - 0.5);
    // the mascot only lives on the sign: an epic in the starter pen snowballed their economy
    const p = placeBuilding('pen', spots[0], f);
    addCreature(p, f.likes);
    addCreature(p, pick(BY_RARITY[0]));
    const h = placeBuilding('hut', spots[1], f);
    for (let i = 0; i < 2; i++) spawnSahur(f, h, h.x + rand(-0.3, 0.3), h.y + 0.4);
  }
  if (demo) {
    for (const [c, r] of [[4, 2], [2, 1], [4, 3], [1, 2], [5, 1]]) {
      const p = placeBuilding('pen', tileAt(c, r), me);
      for (let i = randi(1, 3); i > 0; i--) addCreature(p, rollSeed(true));
    }
    for (const [c, r] of [[3, 1], [3, 3], [5, 3], [1, 1]]) {
      const h = placeBuilding('hut', tileAt(c, r), me);
      for (let i = 0; i < 3; i++) spawnSahur(me, h, h.x + rand(-0.3, 0.3), h.y + 0.4);
    }
    placeBuilding('hangar', tileAt(5, 2), me).planes = 2;
    for (const f of S.farms) if (!f.player) f.coins = 500;
    setRel(S.farms[1], me, 'war', true);
    setRel(S.farms[2], S.farms[4], 'war', true);
  }
}

// ---------------------------------------------------------------- queries

function freeTilesOf(f) {
  const out = [];
  for (const t of S.tiles.values()) if (t.farm === f && t.unlocked && !t.b) out.push(t);
  return out;
}

function buildingsOf(f, type) {
  return S.buildings.filter(b => b.owner === f && !b.dead && (!type || b.type === type));
}

function nearestBuilding(f, x, y) {
  let best = null, bd = 1e9;
  for (const b of S.buildings) {
    if (b.owner !== f || b.dead) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

const relOf = (a, b) => S.rel[a.id][b.id];
const atWar = f => S.farms.some(o => o !== f && o.alive && relOf(f, o) === 'war');

// wild drones (owner null) are everyone's enemy
function hostile(a, b) {
  if (!a || !b) return true;
  return a !== b && S.rel[a.id][b.id] === 'war';
}

function guardsOf(f) {
  return S.sahurs.filter(s => s.owner === f && s.mode === 'guard' && !s.dead);
}

function planesOf(f) {
  let n = 0;
  for (const b of S.buildings) if (b.owner === f && b.type === 'hangar' && !b.dead) n += b.planes;
  return n;
}

const peacePrice = () => Math.round(50 + S.wave * 25);
const warsWithMe = () => S.farms.filter(f => !f.player && f.alive && relOf(f, S.me) === 'war').length;

// what a neighbour earns per second, shown on its card so its wealth isn't a mystery
function farmRate(f) {
  let r = f.barn.hp > 0 ? (f.player ? 1 : AI_BARN_INCOME) : 0;
  const k = f.player ? 1 : AI_CRITTER_INCOME;
  for (const c of allCritters(f)) r += (RARITY[SPECIES[c.sp].r].income / PROD_TIME) * k;
  for (const b of S.buildings) if (b.trophy && b.owner === f) r += 1.5;
  return r;
}

// Raiders between two neighbours would otherwise march straight through our farm, which looks
// exactly like an attack on us; route them around its corner instead.
function detour(a, b) {
  const box = { l: -0.5, r: COLS + 0.5, t: -0.5, b: ROWS + 0.5 };
  let crosses = false;
  for (let i = 1; i < 20 && !crosses; i++) {
    const x = lerp(a.x, b.x, i / 20), y = lerp(a.y, b.y, i / 20);
    crosses = x > box.l && x < box.r && y > box.t && y < box.b;
  }
  if (!crosses) return null;
  const corners = [[box.l - 1.2, box.t - 1.2], [box.r + 1.2, box.t - 1.2], [box.l - 1.2, box.b + 1.2], [box.r + 1.2, box.b + 1.2]];
  let best = null, bd = 1e9;
  for (const [x, y] of corners) {
    const d = Math.hypot(x - a.x, y - a.y) + Math.hypot(b.x - x, b.y - y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

// ---------------------------------------------------------------- relations

function setRel(a, b, v, quiet) {
  if (a === b || !a.alive || !b.alive) return;
  const old = S.rel[a.id][b.id];
  if (old === v) return;
  S.rel[a.id][b.id] = S.rel[b.id][a.id] = v;
  for (const f of [a, b]) {
    if (f.player) continue;
    f.offer = null;
    f.demand = null;
    if (v === 'war') f.warT = 0;
  }
  if (v === 'war') {
    a.ai.raid[b.id] = rand(20, 28);
    b.ai.raid[a.id] = rand(20, 28);
  }
  if (quiet) return;
  const other = a.player ? b : b.player ? a : null;
  if (other) {
    if (v === 'war') {
      banner(`ВОЙНА: ${other.name.toUpperCase()}`, 'набеги сахуров и бомбардировки', '#ff4f6d');
      sfx('horn');
    } else if (v === 'ally') {
      sfx('ally');
    } else if (old === 'war') {
      banner('МИР', `с ${other.name}`, '#45d0ff');
      sfx('ally');
    } else if (old === 'ally') toast(`💔 Союз с ${other.name} разорван`, 'warn');
  } else if (v === 'war') toast(`⚔️ ${a.name} напали на ${b.name}`, 'warn');
  else if (old === 'war') toast(`🕊 ${a.name} и ${b.name} помирились`);
  if (v !== 'war' || !other) return;
  // our allies join our wars; nobody ever drags us into theirs
  for (const c of S.farms) {
    if (!c.alive || c.player || c === other || relOf(c, S.me) !== 'ally' || relOf(c, other) !== 'neutral') continue;
    setRel(c, other, 'war', true);
    toast(`🤝 ${c.name} вступает в войну за тебя`, 'good');
  }
}

// ---------------------------------------------------------------- AI

function aiBuild(f, type, tiles) {
  const t = pick(tiles);
  f.coins -= price(f, type);
  f.built[type]++;
  const b = placeBuilding(type, t, f);
  if (type === 'hut') spawnSahur(f, b, b.x, b.y + 0.35);
  chips(b.x, b.y, 6);
}

function aiThink(f, dt) {
  if (!f.player) f.coins = Math.min(f.coins, 200 + S.wave * 60);
  f.ai.thinkT -= dt;
  if (f.ai.thinkT > 0) return;
  f.ai.thinkT = rand(2, 3.5);
  const tiles = freeTilesOf(f);
  const pens = buildingsOf(f, 'pen'), huts = buildingsOf(f, 'hut'), hangars = buildingsOf(f, 'hangar');
  const fullPens = pens.every(p => p.creatures.length >= PEN_CAP);
  if (tiles.length && (!pens.length || (fullPens && pens.length < 4)) && f.coins >= price(f, 'pen')) return aiBuild(f, 'pen', tiles);
  const wantHuts = f.player ? 4 : 1 + (f.aggr >= 1.2 ? 1 : 0) + Math.floor(S.wave / 5);
  if (tiles.length && huts.length < wantHuts && f.coins >= price(f, 'hut')) return aiBuild(f, 'hut', tiles);
  if (tiles.length && f.aggr >= 1 && S.wave >= 6 && !hangars.length && f.coins >= price(f, 'hangar')) return aiBuild(f, 'hangar', tiles);
  const room = pens.find(p => p.creatures.length < PEN_CAP);
  if (room && f.coins >= PRICE.seed + 30 && Math.random() < 0.4) {
    f.coins -= PRICE.seed;
    addCreature(room, rollSeed(false), 1);
    return;
  }
  if (room && f.coins >= PRICE.critter) {
    f.coins -= PRICE.critter;
    addCreature(room, pick(['straw', 'banana']), 1);
    return;
  }
  const gym = GYM_COST[f.sahurLvl];
  if (gym != null && f.sahurLvl < Math.floor(S.wave / 4) && f.coins >= gym * 1.5) {
    f.coins -= gym;
    f.sahurLvl++;
  }
}

function aiWar(f, dt) {
  for (const g of S.farms) {
    if (g === f || !g.alive || relOf(f, g) !== 'war') continue;
    f.ai.raid[g.id] = (f.ai.raid[g.id] ?? 15) - dt;
    if (f.ai.raid[g.id] > 0) continue;
    f.ai.raid[g.id] = g.player ? rand(45, 70) / f.aggr : rand(35, 55);
    const n = launchRaid(f, g, f.player ? undefined : 2 + Math.floor(S.wave / 2));
    const p = launchBombers(f, g, f.player ? 99 : 1);
    if (g.player && (n || p)) {
      toast(`⚔️ ${f.name}: набег ${n ? n + ' сахуров' : ''}${n && p ? ' и ' : ''}${p ? p + ' бомбардиро' : ''}!`, 'bad');
      sfx('horn');
    }
  }
}

// send a share of our guards marching at `g`; returns how many went.
// Raiders keep their hut, so the hut doesn't refill behind them: an army is bounded by huts x cap.
function launchRaid(f, g, max) {
  const guards = guardsOf(f).sort((a, b) => Math.hypot(a.x - g.barn.x, a.y - g.barn.y) - Math.hypot(b.x - g.barn.x, b.y - g.barn.y));
  const keep = f.player ? 0 : 2;
  const n = Math.min(max ?? Math.ceil(guards.length * 0.6), Math.ceil(guards.length * (f.player ? 1 : 0.5)), guards.length - keep);
  const wp = f.player || g.player ? null : detour(f.barn, g.barn);
  for (let i = 0; i < n; i++) {
    const s = guards[i];
    s.mode = 'raid';
    s.goal = g;
    s.bTarget = null;
    s.wp = wp;
  }
  return Math.max(0, n);
}

function launchBombers(f, g, max) {
  let sent = 0;
  for (const h of buildingsOf(f, 'hangar')) {
    while (h.planes > 0 && sent < max) {
      h.planes--;
      spawnBomber(f, h, g);
      sent++;
    }
  }
  return sent;
}

function allyGift(f) {
  if (Math.random() < 0.5) {
    const v = Math.round(30 + S.wave * 12);
    addCoins(S.me, v, sx(S.me.barn.x), sy(S.me.barn.y));
    toast(`🎁 ${f.name} прислали ${v} 🪙`, 'good');
  } else {
    const sp = rollSeed(true);
    S.runners.push({ kind: 'home', c: newCritter(sp), owner: S.me, x: f.barn.x, y: f.barn.y + 0.45, z: 0, vz: 0, pen: null, walk: 0 });
    toast(`🎁 ${f.name} прислали зверька: <b style="color:${RARITY[SPECIES[sp].r].color}">${SPECIES[sp].name}</b>`, 'good');
  }
  sfx('ally');
}

function updateDiplo(dt) {
  S.anyWar = false;
  for (const a of S.farms) {
    for (const b of S.farms) if (a.id < b.id && a.alive && b.alive && relOf(a, b) === 'war') S.anyWar = true;
  }
  for (const f of S.farms) {
    if (!f.alive) continue;
    if (!f.player || f.auto) {
      aiThink(f, dt);
      aiWar(f, dt);
    }
    if (f.player) continue;
    if (f.mission) updateMission(f, dt);
    const r = relOf(f, S.me);
    if (r === 'ally') {
      f.ai.giftT -= dt;
      if (f.ai.giftT <= 0) {
        f.ai.giftT = rand(45, 75);
        if (!S.demo) allyGift(f);
      }
    } else if (r === 'war') {
      f.warT += dt;
      if (f.offer) {
        f.offer.t -= dt;
        if (f.offer.t <= 0) f.offer = null;
      } else if (!S.demo && f.warT > 35 && Math.random() < dt * (f.barn.hp < f.barn.maxHp * 0.6 ? 0.08 : 0.02)) {
        f.offer = { coins: Math.round(40 + S.wave * 15), t: 30 };
        toast(`🕊 ${f.name} просят мира и дают ${f.offer.coins} 🪙`, 'good');
      }
    } else if (!S.demo) {
      if (f.demand) {
        f.demand.t -= dt;
        if (f.demand.t <= 0) {
          f.demand = null;
          setRel(f, S.me, 'war');
        }
      } else if ((f.aggr >= 1.2 && S.wave >= 3) || (f.aggr >= 1 && S.wave >= 7)) {
        // one shakedown at a time, and never while we're already fighting someone
        f.ai.demandT -= dt;
        if (f.ai.demandT <= 0 && S.demandCD <= 0 && !warsWithMe() && !S.farms.some(o => o.demand)) {
          f.ai.demandT = rand(150, 240);
          S.demandCD = 120;
          f.demand = { coins: Math.round(40 + S.wave * 15), t: 30 };
          toast(`💰 ${f.name} требуют дань ${f.demand.coins} 🪙. Не заплатишь за 30 с — война`, 'bad');
          sfx('horn');
        }
      }
    }
  }
  S.demandCD -= dt;
  for (const a of S.farms) {
    for (const b of S.farms) {
      if (a.id < b.id && !a.player && !b.player && a.alive && b.alive && relOf(a, b) === 'war' && Math.random() < dt / 90) setRel(a, b, 'neutral');
    }
  }
  updateEnvoys(dt);
}

// ---------------------------------------------------------------- envoys

function sendEnvoy(f, sp) {
  if (f.envoy || f.mission || !f.alive || relOf(f, S.me) !== 'neutral') return;
  const c = allCritters(S.me).find(k => k.sp === sp && !k.grabbedBy);
  if (!c) return;
  const x = c.pen.x + c.ox, y = c.pen.y + c.oy;
  removeCritter(c);
  S.envoys.push({ sp, x, y, to: f, walk: 0, flip: false });
  f.envoy = true;
  toast(`🏳️ ${SPECIES[sp].name} идёт послом к ${f.name}`);
  sfx('click', 0, true);
  closePopup();
}

function updateEnvoys(dt) {
  for (const e of S.envoys) {
    const f = e.to;
    e.walk += dt * 20;
    if (!f.alive || relOf(f, S.me) !== 'neutral') {
      f.envoy = false;
      e.done = true;
      S.runners.push({ kind: 'home', c: newCritter(e.sp), owner: S.me, x: e.x, y: e.y, z: 0, vz: 0, pen: null, walk: 0 });
      continue;
    }
    const dx = f.barn.x - e.x, dy = f.barn.y + 0.45 - e.y, d = Math.hypot(dx, dy);
    e.flip = dx < 0;
    if (d < 0.1) {
      e.done = true;
      f.envoy = false;
      f.mission = { sp: e.sp, t: 0, dur: 6 };
      sfxAt('pop', e.x, e.y);
    } else {
      const v = Math.min(d, 1.8 * dt);
      e.x += (dx / d) * v;
      e.y += (dy / d) * v;
    }
  }
  S.envoys = S.envoys.filter(e => !e.done);
}

function updateMission(f, dt) {
  const m = f.mission;
  m.t += dt;
  if (Math.random() < dt * 3) part({ kind: 'heart', x: f.barn.x + rand(-0.3, 0.3), y: f.barn.y + 0.2, vy: -0.6, life: 1, max: 1, size: 0.07 });
  if (m.t < m.dur) return;
  f.mission = null;
  if (relOf(f, S.me) !== 'neutral') return;
  const top = Math.max(SPECIES[m.sp].r, SPECIES[f.mascot].r);
  const verdict = ch => {
    if (ch === 'SAHUR') return 'sahur';
    if (ch === 'DRONE') return 'drone';
    if (ch === m.sp || ch === f.mascot) return 'ally';
    return SPECIES[ch].r > top ? 'miracle' : 'war';
  };
  let child = rollChild(m.sp, f.mascot), v = verdict(child), second = false;
  if (v === 'war' && m.sp === f.likes) {
    child = rollChild(m.sp, f.mascot);
    v = verdict(child);
    second = true;
  }
  const x = f.barn.x, y = f.barn.y + 0.4;
  chips(x, y - 0.1, 8);
  if (v === 'sahur') {
    spawnSahur(f, null, x, y);
    setRel(f, S.me, 'ally');
    banner(`СОЮЗ: ${f.name.toUpperCase()}`, 'у них вылупился сахур. они в восторге', '#7dff6a');
    return;
  }
  if (v === 'drone') {
    const d = spawnDrone('kami', 0, { x, y });
    d.farm = f;
    setRel(f, S.me, 'war', true);
    banner('ИЗ ЯЙЦА ВЫЛЕЗ ДРОН', `${f.name} считают тебя шпионом. ВОЙНА`, '#ff4f6d');
    sfx('horn');
    return;
  }
  const sp = SPECIES[child], pen = penWithRoom(f);
  if (pen) addCreature(pen, child, 1);
  sparkle(x, y - 0.2, RARITY[sp.r].color, 12);
  if (v === 'war') {
    setRel(f, S.me, 'war', true);
    banner(`${f.name.toUpperCase()} ОБИДЕЛИСЬ`, `у них родился ${sp.name}. «ЭТО НЕ ОТ НАС!» ВОЙНА`, '#ff4f6d');
    sfx('horn');
  } else {
    setRel(f, S.me, 'ally');
    if (v === 'miracle') {
      const gift = Math.round(120 + S.wave * 20);
      addCoins(S.me, gift, sx(x), sy(y));
      banner(`ЧУДО! СОЮЗ: ${f.name.toUpperCase()}`, `родился ${sp.name}. подарок ${gift} 🪙`, '#ffd84a');
    } else banner(`СОЮЗ: ${f.name.toUpperCase()}`, `родился ${sp.name}${second ? ' (любимчик выручил)' : ''}`, '#7dff6a');
  }
}

// ---------------------------------------------------------------- conquest

function annex(F, X) {
  if (!F.alive) return;
  F.alive = false;
  F.conqueredBy = X;
  for (const t of S.tiles.values()) if (t.farm === F) t.farm = X;
  for (const b of S.buildings) if (b.owner === F) b.owner = X;
  F.barn.hq = false;
  F.barn.trophy = true;
  F.barn.hp = F.barn.maxHp * 0.5;
  F.barn.hitT = 0;
  for (const s of S.sahurs) {
    if (s.owner === F) {
      s.owner = X;
      s.mode = 'guard';
      s.goal = null;
      s.maxHp = 5 + X.sahurLvl;
      s.hp = Math.min(s.hp, s.maxHp);
    }
    if (s.goal === F) {
      s.mode = 'guard';
      s.goal = null;
      s.base = F.barn;
    }
  }
  for (const d of S.drones) {
    if (d.owner === F) {
      d.owner = X;
      d.state = 'back';
    }
  }
  X.coins += F.coins;
  F.coins = 0;
  F.offer = F.demand = F.mission = null;
  for (const o of S.farms) if (o !== F) S.rel[F.id][o.id] = S.rel[o.id][F.id] = 'neutral';
  boomFx(F.barn.x, F.barn.y - 0.2, 2, false);
  S.flash = 0.4;
  S.flashColor = X.color;
  if (X.player) {
    S.stats.annexed++;
    for (const c of allCritters(X)) {
      if (SPECIES[c.sp].r < S.stats.bestR) continue;
      S.stats.bestR = SPECIES[c.sp].r;
      S.stats.bestName = SPECIES[c.sp].name;
    }
    banner(`ЗАХВАЧЕНО: ${F.name.toUpperCase()}`, 'земля, зверята и сахуры теперь твои', PLAYER_COLOR);
    sfx('win');
    if (S.farms.every(f => f.player || !f.alive)) setTimeout(winGame, 1500);
  } else toast(`🏴 ${X.name} захватили ${F.name}`, F === S.me ? 'bad' : 'warn');
}

// ---------------------------------------------------------------- side panel

function buildDiplo() {
  const el = $('diplo');
  el.innerHTML = '<div class="dh">🤝 СОСЕДИ</div>' + NEIGHBORS.map((n, i) => `<div class="nb" id="nb-${i + 1}" data-id="${i + 1}" style="--c:${n.color}"></div>`).join('');
  el.addEventListener('mousedown', e => e.preventDefault());
  el.addEventListener('click', e => {
    const card = e.target.closest('.nb');
    if (!card || !S || mode !== 'play') return;
    const f = S.farms[+card.dataset.id];
    const b = e.target.closest('button');
    if (!b) return flyTo(f.gx + f.cols / 2, f.gy + f.rows / 2);
    if (!b.disabled) diploAction(f, b.dataset.act);
  });
}

function diploAction(f, act) {
  if (act === 'envoy') return openPopup('envoy', f, $('nb-' + f.id));
  if (act === 'war') return setRel(f, S.me, 'war');
  if (act === 'unally') return setRel(f, S.me, 'neutral');
  if (act === 'raid') {
    const n = launchRaid(S.me, f);
    if (n) {
      toast(`⚔️ ${n} сахуров идут на ${f.name}`, 'good');
      sfx('march', 0, true);
      S.stats.raids++;
    }
    return;
  }
  if (act === 'bomb') {
    if (launchBombers(S.me, f, 1)) {
      toast(`🐊 Бомбардиро Крокодило вылетел на ${f.name}`, 'good');
      sfx('whistle', 0, true);
    }
    return;
  }
  if (act === 'peace') {
    if (spend(peacePrice())) setRel(f, S.me, 'neutral');
    return;
  }
  if (act === 'accept' && f.offer) {
    const v = f.offer.coins;
    setRel(f, S.me, 'neutral');
    addCoins(S.me, v, sx(f.barn.x), sy(f.barn.y));
    return;
  }
  if (act === 'pay' && f.demand) {
    if (spend(f.demand.coins)) {
      f.demand = null;
      toast(`💰 Заплатил дань ${f.name}`, 'warn');
    }
    return;
  }
  if (act === 'refuse' && f.demand) {
    f.demand = null;
    setRel(f, S.me, 'war');
  }
}

const dBtn = (act, label, disabled, cls = '') => `<button class="${cls}" data-act="${act}" ${disabled ? 'disabled' : ''}>${label}</button>`;

function diploCard(f) {
  const r = f.alive ? relOf(f, S.me) : 'dead';
  const chip = { neutral: 'НЕЙТРАЛЫ', ally: 'СОЮЗ', war: 'ВОЙНА', dead: 'ЗАХВАЧЕНЫ' }[r];
  let btns = '', note = '';
  if (r === 'neutral') {
    if (f.demand) {
      note = `💰 требуют <b>${f.demand.coins}</b> 🪙 · <span class="d-t"></span> с`;
      btns = dBtn('pay', 'Заплатить', S.me.coins < f.demand.coins) + dBtn('refuse', 'Послать', false, 'bad');
    } else {
      const busy = f.envoy || f.mission;
      btns = dBtn('envoy', f.envoy ? '🏳️ посол в пути' : f.mission ? '🥚 смотрят яйцо' : '🎁 Посол', busy) + dBtn('war', '⚔️ Война', false, 'bad');
      note = `любимчик: ${SPECIES[f.likes].e} · маскот: ${SPECIES[f.mascot].e}`;
    }
  } else if (r === 'ally') {
    btns = dBtn('unally', '💔 Разорвать', false, 'ghost');
    note = 'дарят подарки и воюют за тебя';
  } else if (r === 'war') {
    const n = Math.ceil(guardsOf(S.me).length * 0.6), p = planesOf(S.me);
    btns = dBtn('raid', `⚔️ Набег ${n}`, !n) + dBtn('bomb', `🐊 Бомбить ${p}`, !p) +
      (f.offer ? dBtn('accept', `🤝 Мир +${f.offer.coins}`, false, 'good') : dBtn('peace', `🕊 Мир ${peacePrice()}`, S.me.coins < peacePrice(), 'ghost'));
    note = 'сломай их ферму — заберёшь себе';
  } else note = f.conqueredBy && f.conqueredBy.player ? 'земля твоя' : `захватили: ${f.conqueredBy ? f.conqueredBy.name : '?'}`;
  const html = `<div class="nb-top"><span class="nb-m">${SPECIES[f.mascot].e}</span><div class="nb-t"><b>${f.name}</b><i class="chip c-${r}">${chip}</i></div></div>` +
    (f.alive ? '<div class="nb-st" title="сахуры и их уровень · бомбардиро · здоровье амбара">🪵 <span class="d-s"></span> ур.<span class="d-l"></span> · 🐊 <span class="d-p"></span> · ❤ <span class="d-h"></span>%</div>' +
      '<div class="nb-st" title="монеты соседа и доход: амбар + зверята">🪙 <span class="d-c"></span> <span class="d-r"></span></div>' : '') +
    `<div class="nb-btns">${btns}</div><div class="nb-note">${note}</div>`;
  return { key: r + btns + note, html, cls: 'nb s-' + r };
}

function fillDyn(root, f) {
  const q = s => root.querySelector(s);
  if (q('.d-s')) q('.d-s').textContent = S.sahurs.filter(s => s.owner === f).length;
  if (q('.d-p')) q('.d-p').textContent = planesOf(f);
  if (q('.d-l')) q('.d-l').textContent = f.sahurLvl;
  if (q('.d-c')) q('.d-c').textContent = Math.floor(f.coins);
  if (q('.d-r')) q('.d-r').textContent = `(+${farmRate(f).toFixed(1)}/с)`;
  if (q('.d-h')) q('.d-h').textContent = Math.round((100 * f.barn.hp) / f.barn.maxHp);
  if (q('.d-t') && f.demand) q('.d-t').textContent = Math.ceil(f.demand.t);
}

let diploT = 0;
function updateDiploPanel(dt) {
  diploT -= dt;
  if (diploT > 0) return;
  diploT = 0.25;
  for (const f of S.farms) {
    if (f.player) continue;
    const el = $('nb-' + f.id), st = diploCard(f);
    if (el._k !== st.key) {
      el._k = st.key;
      el.innerHTML = st.html;
      el.className = st.cls;
    }
    fillDyn(el, f);
  }
}
