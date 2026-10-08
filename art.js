'use strict';
// Canvas painting: grass, soil, barn, pens, sahur huts, critters, Tun Tun Sahurs, drones, text.
const Art = (() => {
  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const UI_FONT = '"Segoe UI Black", "Segoe UI", "Arial Black", sans-serif';
  const INK = '#241133';
  const TAU = Math.PI * 2;
  let dpr = 1;
  const cache = new Map();

  function setDpr(v) {
    if (v !== dpr) {
      dpr = v;
      cache.clear();
    }
  }

  function emojiCanvas(ch, px, gold) {
    const key = ch + '|' + px + '|' + (gold ? 1 : 0);
    let c = cache.get(key);
    if (c) return c;
    if (cache.size > 600) cache.clear();
    const pad = Math.ceil(px * 0.2);
    c = document.createElement('canvas');
    c.width = c.height = px + pad * 2;
    const g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${px}px ${EMOJI_FONT}`;
    if (gold) g.filter = 'sepia(1) saturate(6) hue-rotate(-10deg) brightness(1.2)';
    g.fillText(ch, c.width / 2, c.height / 2 + px * 0.05);
    cache.set(key, c);
    return c;
  }

  // Emoji centered on (x, y), roughly `size` CSS px tall. Sizes snap to 2 device px so the cache stays small.
  function emoji(ctx, ch, x, y, size, gold) {
    const px = Math.max(6, Math.round(size * dpr / 2) * 2);
    const c = emojiCanvas(ch, px, gold);
    const s = c.width / dpr;
    ctx.drawImage(c, x - s / 2, y - s / 2, s, s);
  }

  function text(ctx, str, x, y, size, fill, o = {}) {
    ctx.font = `900 ${Math.round(size)}px ${UI_FONT}`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (o.stroke !== false) {
      ctx.lineWidth = Math.max(2, size * (o.sw || 0.22));
      ctx.strokeStyle = o.stroke || INK;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  function bubble(ctx, x, y, str, size) {
    ctx.font = `800 ${Math.round(size)}px ${UI_FONT}`;
    const w = ctx.measureText(str).width + size * 1.1, h = size * 1.7;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h - 6, w, h, h / 2);
    ctx.moveTo(x - 5, y - 7);
    ctx.lineTo(x, y);
    ctx.lineTo(x + 6, y - 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 4, y - 9, 9, 4);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y - 6 - h / 2);
  }

  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  }

  function shadow(ctx, x, y, rx, ry, a = 0.25) {
    ctx.fillStyle = `rgba(20,40,10,${a})`;
    ellipse(ctx, x, y, rx, ry);
    ctx.fill();
  }

  function mulberry(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seamless grass swatch covering GRASS_TILES x GRASS_TILES world tiles, used as a repeating pattern.
  const GRASS_PX = 96, GRASS_TILES = 4;
  function grassTile() {
    const N = GRASS_PX * GRASS_TILES;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const R = mulberry(1337);
    const wrap = fn => {
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy);
    };
    g.fillStyle = '#7cc653';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 46; i++) {
      const x = R() * N, y = R() * N, rx = 20 + R() * 80, ry = 10 + R() * 45, rot = R() * 3;
      g.fillStyle = R() < 0.5 ? 'rgba(40,110,30,0.08)' : 'rgba(210,255,150,0.07)';
      wrap((ox, oy) => {
        g.beginPath();
        g.ellipse(x + ox, y + oy, rx, ry, rot, 0, TAU);
        g.fill();
      });
    }
    g.lineCap = 'round';
    g.lineWidth = 1.4;
    for (let i = 0; i < (N * N) / 230; i++) {
      const x = R() * N, y = R() * N, h = 3 + R() * 6, lean = (R() - 0.5) * 4;
      g.strokeStyle = R() < 0.6 ? 'rgba(46,120,40,0.45)' : 'rgba(200,245,140,0.45)';
      wrap((ox, oy) => {
        if (x + ox < -10 || x + ox > N + 10 || y + oy < -10 || y + oy > N + 10) return;
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + lean, y + oy - h);
        g.stroke();
      });
    }
    const cols = ['#ffffff', '#ffe066', '#ff8fb1', '#b9a6ff'];
    for (let i = 0; i < (N * N) / 7000; i++) {
      const x = 6 + R() * (N - 12), y = 6 + R() * (N - 12);
      g.fillStyle = cols[Math.floor(R() * cols.length)];
      for (let k = 0; k < 5; k++) {
        const a = k * 1.2566;
        g.beginPath();
        g.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.8, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#ffb703';
      g.beginPath();
      g.arc(x, y, 1.4, 0, TAU);
      g.fill();
    }
    return c;
  }

  function flag(ctx, x, y, T, color, t) {
    const h = T * 0.3, w = T * 0.16, wave = Math.sin(t * 6 + x * 0.05) * T * 0.015;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, T * 0.018);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.quadraticCurveTo(x + w * 0.5, y - h - wave, x + w, y - h + T * 0.04);
    ctx.lineTo(x + w, y - h + T * 0.1);
    ctx.quadraticCurveTo(x + w * 0.5, y - h + T * 0.1 + wave, x, y - h + T * 0.11);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(1, T * 0.01);
    ctx.stroke();
  }

  // Bombardiro hangar: a corrugated half-barrel with parked planes counted by `planes`.
  function hangar(ctx, x, y, T, planes, cap) {
    const w = T * 0.8, h = T * 0.42, base = y + T * 0.32;
    shadow(ctx, x, base, w * 0.6, T * 0.08);
    ctx.fillStyle = '#7b8a6a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = T * 0.025;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, base);
    ctx.lineTo(x - w / 2, base - h * 0.35);
    ctx.ellipse(x, base - h * 0.35, w / 2, h * 0.65, 0, Math.PI, 0);
    ctx.lineTo(x + w / 2, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,40,20,0.35)';
    ctx.lineWidth = Math.max(1, T * 0.012);
    ctx.beginPath();
    for (let i = 1; i < 7; i++) {
      const px = x - w / 2 + (i * w) / 7;
      const top = base - h * 0.35 - Math.sqrt(Math.max(0, 1 - Math.pow((px - x) / (w / 2), 2))) * h * 0.65;
      ctx.moveTo(px, top);
      ctx.lineTo(px, base);
    }
    ctx.stroke();
    const dw = w * 0.5, dh = h * 0.62;
    ctx.fillStyle = '#2a2f24';
    ctx.beginPath();
    ctx.roundRect(x - dw / 2, base - dh, dw, dh, [dw * 0.3, dw * 0.3, 0, 0]);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = T * 0.02;
    ctx.stroke();
    ctx.fillStyle = '#ffd84a';
    for (let i = 0; i < 4; i++) ctx.fillRect(x - dw / 2 + (i * dw) / 4 + 1, base - T * 0.03, dw / 8, T * 0.03);
    for (let i = 0; i < cap; i++) {
      const px = x + (i - (cap - 1) / 2) * T * 0.24;
      ctx.globalAlpha = i < planes ? 1 : 0.25;
      emoji(ctx, '🐊', px, base - h - T * 0.1, T * 0.18);
    }
    ctx.globalAlpha = 1;
  }

  // tilled plot, (x, y) is the tile's top-left corner
  function soil(ctx, x, y, T) {
    const p = T * 0.05;
    ctx.fillStyle = '#9a6a3e';
    ctx.beginPath();
    ctx.roundRect(x + p, y + p, T - 2 * p, T - 2 * p, T * 0.14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,10,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const fy = y + T * (0.2 + i * 0.19);
      ctx.fillStyle = 'rgba(60,30,10,0.22)';
      ctx.beginPath();
      ctx.roundRect(x + T * 0.13, fy + T * 0.05, T * 0.74, T * 0.06, T * 0.03);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,215,160,0.16)';
      ctx.beginPath();
      ctx.roundRect(x + T * 0.13, fy, T * 0.74, T * 0.06, T * 0.03);
      ctx.fill();
    }
  }

  function barn(ctx, x, y, T, hpFrac, wall = '#d8423a', roof = '#6e2a2e', label = 'ФЕРМА') {
    const w = T * 0.84, h = T * 0.46, base = y + T * 0.34, top = base - h;
    shadow(ctx, x, base, w * 0.62, T * 0.09);
    if (hpFrac <= 0) {
      // smoking ruin
      ctx.fillStyle = '#3b2420';
      ctx.beginPath();
      ctx.moveTo(x - w / 2, base);
      ctx.lineTo(x - w * 0.3, base - h * 0.5);
      ctx.lineTo(x - w * 0.05, base - h * 0.25);
      ctx.lineTo(x + w * 0.15, base - h * 0.6);
      ctx.lineTo(x + w / 2, base);
      ctx.closePath();
      ctx.fill();
      return;
    }
    ctx.fillStyle = wall;
    ctx.fillRect(x - w / 2, top, w, h);
    ctx.strokeStyle = 'rgba(110,20,20,0.35)';
    ctx.lineWidth = Math.max(1, T * 0.012);
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const px = x - w / 2 + (i * w) / 8;
      ctx.moveTo(px, top);
      ctx.lineTo(px, base);
    }
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = T * 0.025;
    ctx.strokeRect(x - w / 2, top, w, h);
    // gambrel roof
    const rh = T * 0.36, eave = T * 0.05;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - eave, top + 2);
    ctx.lineTo(x - w * 0.4, top - rh * 0.55);
    ctx.lineTo(x, top - rh);
    ctx.lineTo(x + w * 0.4, top - rh * 0.55);
    ctx.lineTo(x + w / 2 + eave, top + 2);
    ctx.closePath();
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.lineWidth = T * 0.035;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = T * 0.015;
    ctx.strokeStyle = '#fff3e6';
    ctx.stroke();
    // hayloft
    const ly = top - rh * 0.42;
    ctx.fillStyle = '#fff3e6';
    ctx.beginPath();
    ctx.arc(x, ly, T * 0.075, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3a1d10';
    ctx.beginPath();
    ctx.arc(x, ly, T * 0.055, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(x, ly, T * 0.055, 0.2, Math.PI - 0.2);
    ctx.fill();
    // door with white X
    const dw = w * 0.36, dh = h * 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x - dw / 2, base - dh, dw, dh);
    ctx.strokeStyle = '#fff3e6';
    ctx.lineWidth = T * 0.022;
    ctx.strokeRect(x - dw / 2, base - dh, dw, dh);
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, base - dh);
    ctx.lineTo(x + dw / 2, base);
    ctx.moveTo(x + dw / 2, base - dh);
    ctx.lineTo(x - dw / 2, base);
    ctx.stroke();
    if (label) text(ctx, label, x, top + h * 0.15, T * 0.085, '#fff3e6', { sw: 0.3 });
    if (hpFrac < 0.5) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = T * 0.015;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.42, top + h * 0.2);
      ctx.lineTo(x - w * 0.3, top + h * 0.45);
      ctx.lineTo(x - w * 0.36, top + h * 0.6);
      ctx.moveTo(x + w * 0.38, top + h * 0.1);
      ctx.lineTo(x + w * 0.3, top + h * 0.35);
      ctx.stroke();
    }
  }

  function fenceRow(ctx, x0, x1, y, T, ph) {
    const pw = T * 0.055;
    for (const ry of [y - ph * 0.72, y - ph * 0.32]) {
      ctx.fillStyle = '#b57d45';
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, T * 0.012);
      ctx.beginPath();
      ctx.roundRect(x0, ry - T * 0.018, x1 - x0, T * 0.036, T * 0.018);
      ctx.fill();
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const px = x0 + ((x1 - x0) * i) / 2;
      ctx.fillStyle = '#8a5a2e';
      ctx.beginPath();
      ctx.roundRect(px - pw / 2, y - ph, pw, ph, pw * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c99560';
      ctx.fillRect(px - pw / 2 + 1, y - ph + 1, pw - 2, pw * 0.4);
    }
  }

  function penBack(ctx, x, y, T, seed) {
    const L = x - T * 0.43, R = x + T * 0.43, Tp = y - T * 0.32, B = y + T * 0.4;
    shadow(ctx, x, B, T * 0.46, T * 0.07, 0.18);
    ctx.fillStyle = '#e7c46a';
    ctx.beginPath();
    ctx.roundRect(L, Tp, R - L, B - Tp, T * 0.08);
    ctx.fill();
    const rnd = mulberry(seed);
    ctx.lineWidth = Math.max(1, T * 0.012);
    ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const sx = L + T * 0.05 + rnd() * (R - L - T * 0.1), sy = Tp + T * 0.05 + rnd() * (B - Tp - T * 0.1), a = rnd() * 3;
      ctx.strokeStyle = rnd() < 0.5 ? '#c99a3a' : '#f8e29a';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * T * 0.06, sy + Math.sin(a) * T * 0.03);
      ctx.stroke();
    }
    // side rails
    ctx.strokeStyle = INK;
    for (const sx of [L, R]) {
      ctx.fillStyle = '#b57d45';
      ctx.beginPath();
      ctx.roundRect(sx - T * 0.018, Tp - T * 0.1, T * 0.036, B - Tp + T * 0.05, T * 0.018);
      ctx.fill();
      ctx.stroke();
    }
    fenceRow(ctx, L, R, Tp, T, T * 0.2);
  }

  function penFront(ctx, x, y, T) {
    fenceRow(ctx, x - T * 0.43, x + T * 0.43, y + T * 0.42, T, T * 0.14);
  }

  function hut(ctx, x, y, T) {
    const w = T * 0.7, h = T * 0.4, base = y + T * 0.32, top = base - h;
    shadow(ctx, x, base, w * 0.62, T * 0.08);
    const n = 4, lh = h / n;
    ctx.lineWidth = Math.max(1, T * 0.014);
    ctx.strokeStyle = INK;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#a86b36' : '#bf7f43';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, top + i * lh, w, lh + 0.5, lh * 0.5);
      ctx.fill();
      ctx.stroke();
      for (const ex of [x - w / 2, x + w / 2]) {
        ctx.fillStyle = '#e8bb7f';
        ctx.beginPath();
        ctx.arc(ex, top + i * lh + lh / 2, lh * 0.46, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#a7783f';
        ctx.beginPath();
        ctx.arc(ex, top + i * lh + lh / 2, lh * 0.22, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = INK;
      }
    }
    // roof
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - T * 0.09, top + T * 0.03);
    ctx.lineTo(x, top - T * 0.3);
    ctx.lineTo(x + w / 2 + T * 0.09, top + T * 0.03);
    ctx.closePath();
    ctx.fillStyle = '#5c3b22';
    ctx.fill();
    ctx.lineWidth = T * 0.025;
    ctx.stroke();
    ctx.strokeStyle = '#6aa84f';
    ctx.lineWidth = T * 0.03;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - T * 0.06, top + T * 0.005);
    ctx.lineTo(x, top - T * 0.26);
    ctx.lineTo(x + w / 2 + T * 0.06, top + T * 0.005);
    ctx.stroke();
    // arched door
    const dw = w * 0.3, dh = h * 0.75;
    ctx.fillStyle = '#2b170b';
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, base);
    ctx.lineTo(x - dw / 2, base - dh + dw / 2);
    ctx.arc(x, base - dh + dw / 2, dw / 2, Math.PI, 0);
    ctx.lineTo(x + dw / 2, base);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = T * 0.02;
    ctx.stroke();
    // sign
    const sy = top - T * 0.08;
    ctx.fillStyle = '#e8bb7f';
    ctx.beginPath();
    ctx.roundRect(x - T * 0.15, sy - T * 0.055, T * 0.3, T * 0.11, T * 0.02);
    ctx.fill();
    ctx.stroke();
    text(ctx, 'ТУН', x, sy + 1, T * 0.075, '#5c2a12', { stroke: false });
  }

  function creature(ctx, x, y, s, sp, o) {
    const z = o.z || 0, t = o.t || 0;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (!o.noShadow) {
      const k = 1 / (1 + z / s);
      shadow(ctx, x, y, s * 0.3 * k, s * 0.09 * k, 0.22);
    }
    ctx.translate(x, y - z);
    const sc = o.scale == null ? 1 : o.scale;
    ctx.scale(sc, sc);
    const walk = o.walk || 0;
    const hop = Math.abs(Math.sin(walk * 0.5)) * s * 0.08 + (o.dance ? Math.abs(Math.sin(t * 9)) * s * 0.22 : 0);
    if (sp.at !== 'feet') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, s * 0.065);
      ctx.lineCap = 'round';
      const st = Math.sin(walk) * s * 0.08;
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, -s * 0.24 - hop);
      ctx.lineTo(-s * 0.14 + st, 0);
      ctx.moveTo(s * 0.12, -s * 0.24 - hop);
      ctx.lineTo(s * 0.14 - st, 0);
      ctx.stroke();
    }
    ctx.translate(0, -s * 0.55 - hop);
    if (o.dance) ctx.rotate(Math.sin(t * 9) * 0.3);
    else if (o.panic) ctx.rotate(Math.sin(t * 40) * 0.08);
    const R = RARITY[sp.r];
    if (R.glow) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      const g = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 0.8);
      g.addColorStop(0, `rgba(${R.glow},${0.4 + 0.2 * pulse})`);
      g.addColorStop(1, `rgba(${R.glow},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    if (o.flip) ctx.scale(-1, 1);
    if (sp.acc && sp.at === 'hand') emoji(ctx, sp.acc, s * 0.44, s * 0.12, s * 0.46);
    if (sp.acc && sp.at === 'feet') emoji(ctx, sp.acc, 0, s * 0.44, s * 0.46);
    emoji(ctx, sp.e, 0, 0, s, sp.gold);
    if (sp.acc && sp.at === 'hat') emoji(ctx, sp.acc, 0, -s * 0.52, s * 0.5);
    ctx.restore();
    // googly eyes, pupils track the nearest drone
    const er = s * 0.12, ey = -s * 0.04;
    for (const ex of [-s * 0.14, s * 0.14]) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TAU);
      ctx.fill();
      ctx.stroke();
      let px, py;
      if (o.look != null) {
        px = Math.cos(o.look) * er * 0.45;
        py = Math.sin(o.look) * er * 0.45;
      } else {
        px = Math.sin(t * 0.7 + ex) * er * 0.3;
        py = er * 0.15;
      }
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ex + px, ey + py, o.panic ? er * 0.3 : er * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Tun Tun Sahur: a wooden log with a bat. (x, y) = feet on the ground, s = height in px.
  function sahur(ctx, x, y, s, o) {
    const z = o.z || 0;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (!o.noShadow) {
      const k = Math.max(0.35, 1 - z / (s * 4));
      shadow(ctx, x, y, s * 0.24 * k, s * 0.07 * k, 0.25 * k);
    }
    ctx.translate(x, y - z);
    if (o.rot) ctx.rotate(o.rot);
    const sq = o.squash || 0;
    ctx.scale((o.flip ? -1 : 1) * (1 + sq * 0.35), 1 - sq * 0.3);
    const w = s * 0.44, h = s;
    const walk = o.walk || 0, step = Math.sin(walk) * s * 0.07;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = s * 0.075;
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -h * 0.14);
    ctx.lineTo(-w * 0.22 + step, 0);
    ctx.moveTo(w * 0.2, -h * 0.14);
    ctx.lineTo(w * 0.22 - step, 0);
    ctx.moveTo(-w * 0.46, -h * 0.5);
    ctx.lineTo(-w * 0.78, -h * 0.3 + step * 0.5);
    ctx.stroke();
    // log body
    const bt = -h * 0.94, bb = -h * 0.12;
    const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    grad.addColorStop(0, '#87522c');
    grad.addColorStop(0.35, '#d69d61');
    grad.addColorStop(0.7, '#c08048');
    grad.addColorStop(1, '#774523');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-w / 2, bt, w, bb - bt, w * 0.28);
    ctx.fill();
    ctx.lineWidth = s * 0.035;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90,50,20,0.45)';
    ctx.lineWidth = s * 0.018;
    ctx.beginPath();
    for (const gx of [-0.3, 0.06, 0.3]) {
      ctx.moveTo(gx * w, bt + h * 0.14);
      ctx.quadraticCurveTo(gx * w + w * 0.07, (bt + bb) / 2, gx * w - w * 0.02, bb - h * 0.04);
    }
    ctx.stroke();
    // cut top with rings
    ctx.fillStyle = '#efc489';
    ctx.strokeStyle = INK;
    ctx.lineWidth = s * 0.028;
    ellipse(ctx, 0, bt + w * 0.14, w * 0.44, w * 0.14);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#b98a52';
    ctx.lineWidth = s * 0.015;
    ellipse(ctx, 0, bt + w * 0.14, w * 0.24, w * 0.07);
    ctx.stroke();
    if (o.team) {
      // team bandana with tails fluttering behind
      const by = -h * 0.84, bh = h * 0.075, fl = Math.sin((o.walk || 0) * 0.7 + (o.t || 0) * 8) * h * 0.04;
      ctx.fillStyle = o.team;
      ctx.strokeStyle = INK;
      ctx.lineWidth = s * 0.018;
      ctx.beginPath();
      ctx.moveTo(-w * 0.48, by + bh * 0.3);
      ctx.lineTo(-w * 0.85, by + bh * 0.2 + fl);
      ctx.lineTo(-w * 0.8, by + bh * 1.4 + fl);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-w * 0.5, by, w, bh, bh * 0.3);
      ctx.fill();
      ctx.stroke();
    }
    if (o.flash > 0) {
      ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * o.flash * 0.8;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(-w / 2, bt, w, bb - bt, w * 0.28);
      ctx.fill();
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    }
    if (o.party) {
      ctx.fillStyle = '#ff4f8b';
      ctx.strokeStyle = INK;
      ctx.lineWidth = s * 0.02;
      ctx.beginPath();
      ctx.moveTo(-w * 0.22, bt + w * 0.1);
      ctx.lineTo(w * 0.05, bt - h * 0.32);
      ctx.lineTo(w * 0.26, bt + w * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.arc(w * 0.05, bt - h * 0.32, s * 0.05, 0, TAU);
      ctx.fill();
    }
    // face
    const ey = -h * 0.6;
    for (const ex of [-w * 0.19, w * 0.19]) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = s * 0.022;
      ellipse(ctx, ex, ey, w * 0.15, w * 0.19);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(ex + w * 0.04, ey + w * 0.02, w * 0.055, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    if (o.angry) {
      ctx.moveTo(-w * 0.36, ey - w * 0.3);
      ctx.lineTo(-w * 0.06, ey - w * 0.17);
      ctx.moveTo(w * 0.36, ey - w * 0.3);
      ctx.lineTo(w * 0.06, ey - w * 0.17);
    } else {
      ctx.moveTo(-w * 0.32, ey - w * 0.26);
      ctx.lineTo(-w * 0.08, ey - w * 0.27);
      ctx.moveTo(w * 0.32, ey - w * 0.26);
      ctx.lineTo(w * 0.08, ey - w * 0.27);
    }
    ctx.stroke();
    if (o.angry) {
      ctx.fillStyle = '#3a0f0f';
      ellipse(ctx, w * 0.03, -h * 0.38, w * 0.11, w * 0.09);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-w * 0.12, -h * 0.38);
      ctx.lineTo(w * 0.14, -h * 0.38);
      ctx.stroke();
    }
    // arm + bat
    ctx.save();
    ctx.translate(w * 0.42, -h * 0.5);
    ctx.rotate(o.bat == null ? -1.1 : o.bat);
    ctx.strokeStyle = INK;
    ctx.lineWidth = s * 0.075;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.13, 0);
    ctx.stroke();
    ctx.fillStyle = '#5e3317';
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.moveTo(s * 0.08, -s * 0.025);
    ctx.lineTo(s * 0.62, -s * 0.06);
    ctx.arc(s * 0.62, 0, s * 0.06, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(s * 0.08, s * 0.025);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,140,0.5)';
    ctx.lineWidth = s * 0.015;
    ctx.beginPath();
    ctx.moveTo(s * 0.3, -s * 0.025);
    ctx.lineTo(s * 0.6, -s * 0.035);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  const DRONE_LOOK = {
    thief: { body: '#3fc1f2', dark: '#1d6d93', eye: '#ff3b5c' },
    kami: { body: '#ff5a4e', dark: '#9b1d1d', eye: '#ffe14a' },
    tank: { body: '#8a93a6', dark: '#3f4657', eye: '#ff3b5c' },
    boss: { body: '#3a3d5c', dark: '#14152a', eye: '#ff2244' },
    mini: { body: '#ffb703', dark: '#9a6200', eye: '#ff3b5c' },
  };

  function drone(ctx, x, y, R, o) {
    const L = DRONE_LOOK[o.type], t = o.t;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.tilt || 0);
    ctx.lineCap = 'round';
    const ax = R, ay = R * 0.55;
    const ends = [[-ax, -ay], [ax, -ay], [-ax, ay], [ax, ay]];
    ctx.strokeStyle = INK;
    ctx.lineWidth = R * 0.22;
    ctx.beginPath();
    for (const [px, py] of ends) {
      ctx.moveTo(0, 0);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = L.dark;
    ctx.lineWidth = R * 0.11;
    ctx.stroke();
    ends.forEach(([px, py], i) => {
      const ry = py - R * 0.12;
      ctx.fillStyle = 'rgba(230,240,255,0.3)';
      ellipse(ctx, px, ry, R * 0.52, R * 0.16);
      ctx.fill();
      const a = t * 50 + i * 1.3;
      ctx.strokeStyle = 'rgba(30,30,40,0.6)';
      ctx.lineWidth = R * 0.06;
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(a) * R * 0.5, ry - Math.sin(a) * R * 0.15);
      ctx.lineTo(px + Math.cos(a) * R * 0.5, ry + Math.sin(a) * R * 0.15);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(px, ry, R * 0.07, 0, TAU);
      ctx.fill();
    });
    const bw = R * 1.25, bh = R * 0.8;
    if (o.type === 'kami') {
      // the payload
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(0, bh * 0.62, R * 0.24, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffb703';
      ctx.lineWidth = R * 0.06;
      ctx.beginPath();
      ctx.moveTo(R * 0.12, bh * 0.45);
      ctx.lineTo(R * 0.28, bh * 0.3);
      ctx.stroke();
      if (Math.floor(t * 12) % 2) {
        ctx.fillStyle = '#fff3a0';
        ctx.beginPath();
        ctx.arc(R * 0.3, bh * 0.28, R * 0.08, 0, TAU);
        ctx.fill();
      }
    }
    if (o.type === 'thief') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = R * 0.08;
      const open = o.carry ? 0.05 : 0.2;
      ctx.beginPath();
      ctx.moveTo(-R * 0.15, bh * 0.4);
      ctx.quadraticCurveTo(-R * (0.25 + open), bh * 0.75, -R * 0.06, bh * 0.95);
      ctx.moveTo(R * 0.15, bh * 0.4);
      ctx.quadraticCurveTo(R * (0.25 + open), bh * 0.75, R * 0.06, bh * 0.95);
      ctx.stroke();
    }
    if (o.type === 'boss') {
      ctx.fillStyle = '#ff2244';
      ctx.strokeStyle = INK;
      ctx.lineWidth = R * 0.05;
      for (const k of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(k * R * 0.32 - R * 0.1, -bh * 0.45);
        ctx.lineTo(k * R * 0.32, -bh * (k ? 0.85 : 1.05));
        ctx.lineTo(k * R * 0.32 + R * 0.1, -bh * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.fillStyle = L.body;
    ctx.strokeStyle = INK;
    ctx.lineWidth = R * 0.09;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh * 0.4);
    ctx.fill();
    ctx.stroke();
    if (o.type === 'kami') {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh * 0.4);
      ctx.clip();
      ctx.fillStyle = '#ffd84a';
      for (let i = -4; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(i * R * 0.3, bh * 0.15);
        ctx.lineTo(i * R * 0.3 + R * 0.15, bh * 0.15);
        ctx.lineTo(i * R * 0.3 + R * 0.35, bh * 0.5);
        ctx.lineTo(i * R * 0.3 + R * 0.2, bh * 0.5);
        ctx.fill();
      }
      ctx.restore();
    }
    if (o.type === 'tank' || o.type === 'boss') {
      ctx.fillStyle = L.dark;
      ctx.beginPath();
      ctx.roundRect(-bw * 0.4, -bh * 0.48, bw * 0.8, bh * 0.28, bh * 0.1);
      ctx.fill();
      ctx.fillStyle = '#c9d0de';
      for (const k of [-0.32, -0.11, 0.11, 0.32]) {
        ctx.beginPath();
        ctx.arc(bw * k, bh * 0.32, R * 0.04, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.roundRect(-bw * 0.36, -bh * 0.36, bw * 0.45, bh * 0.16, bh * 0.08);
    ctx.fill();
    // camera eye
    const er = R * (o.type === 'boss' ? 0.3 : 0.24);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, R * 0.05, er, 0, TAU);
    ctx.fill();
    const eg = ctx.createRadialGradient(0, R * 0.05, 0, 0, R * 0.05, er * 0.75);
    eg.addColorStop(0, '#fff');
    eg.addColorStop(0.35, L.eye);
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, R * 0.05, er * 0.75, 0, TAU);
    ctx.fill();
    if (Math.floor(t * 3 + o.seed) % 2) {
      ctx.fillStyle = o.type === 'thief' ? '#7dff6a' : '#ff3b5c';
      ctx.beginPath();
      ctx.arc(bw * 0.32, -bh * 0.3, R * 0.07, 0, TAU);
      ctx.fill();
    }
    if (o.flash > 0) {
      ctx.globalAlpha = o.flash;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh * 0.4);
      ctx.fill();
    }
    ctx.restore();
  }

  return { setDpr, emoji, text, bubble, ellipse, shadow, grassTile, GRASS_PX, flag, soil, barn, penBack, penFront, hut, hangar, creature, sahur, drone, INK };
})();
