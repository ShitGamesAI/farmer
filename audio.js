'use strict';
// WebAudio synth: a bouncy woodblock groove ("тун тун тун") that speeds up in waves, plus every SFX.
const AudioFX = (() => {
  let ctx = null, master, sfxBus, musBus, noiseBuf;
  let muted = false;
  try { muted = localStorage.getItem('tt_mute') === '1'; } catch (e) { /* storage unavailable */ }
  const VOL = 0.6, MUS = 0.3;
  let level = 0; // -1 silent, 0 calm, 1 wave, 2 boss
  let step = 0, bar = 0, nextT = 0, phrase = [];
  const lastPlay = {};
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    sfxBus = ctx.createGain();
    musBus = ctx.createGain();
    musBus.gain.value = MUS;
    sfxBus.connect(comp);
    musBus.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    newPhrase();
    nextT = ctx.currentTime + 0.15;
    setInterval(schedule, 25);
  }

  function tone(type, f0, f1, t, dur, vol, bus, attack = 0.004) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || sfxBus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(t, dur, vol, type, f0, f1, q, bus) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q || 0.8;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(bus || sfxBus);
    s.start(t, Math.random() * 0.8);
    s.stop(t + dur + 0.03);
  }

  // drop a sound if the same one fired a moment ago (coin storms, chain explosions)
  function gate(name, gap) {
    const n = ctx.currentTime;
    if (lastPlay[name] && n - lastPlay[name] < gap) return false;
    lastPlay[name] = n;
    return true;
  }
  const now = () => ctx.currentTime + 0.01;

  const SFX = {
    slap(lvl = 0) {
      if (!gate('slap', 0.02)) return;
      const t = now();
      noise(t, 0.07 + lvl * 0.02, 0.55, 'bandpass', 2200 - lvl * 250, 500, 1.2);
      tone('sine', 260 - lvl * 30, 70, t, 0.12 + lvl * 0.03, 0.5);
      if (lvl === 2) tone('triangle', 1250, 1180, t, 0.45, 0.12);
      if (lvl >= 3) tone('square', 90, 40, t, 0.15, 0.15);
    },
    tun() {
      if (!gate('tun', 0.03)) return;
      const t = now(), f = 480 + Math.random() * 160;
      tone('sine', f, f * 0.82, t, 0.11, 0.55);
      tone('triangle', f * 2.7, f * 2.5, t, 0.04, 0.12);
      noise(t, 0.02, 0.25, 'highpass', 3000);
    },
    tun3() {
      if (!gate('tun3', 0.2)) return;
      const t = now();
      for (let i = 0; i < 3; i++) {
        tone('sine', 520, 430, t + i * 0.13, 0.1, 0.4);
        noise(t + i * 0.13, 0.02, 0.2, 'highpass', 3000);
      }
      tone('triangle', 330, 300, t + 0.42, 0.25, 0.25);
    },
    boom(size = 1) {
      if (!gate('boom', 0.05)) return;
      const t = now();
      noise(t, 0.35 + 0.3 * size, Math.min(0.9, 0.45 + 0.2 * size), 'lowpass', 1600, 80, 0.7);
      tone('sine', 110, 32, t, 0.3 + 0.2 * size, 0.6);
    },
    pop() {
      if (!gate('pop', 0.03)) return;
      tone('sine', 380, 950, now(), 0.09, 0.3);
    },
    coin() {
      if (!gate('coin', 0.05)) return;
      const t = now();
      tone('square', 988, 0, t, 0.06, 0.08);
      tone('square', 1319, 0, t + 0.06, 0.12, 0.08);
    },
    birth(r = 0) {
      const t = now();
      [72, 76, 79, 84, 88, 91].slice(0, 3 + r).forEach((m, i) => tone('triangle', mtof(m), 0, t + i * 0.07, 0.18, 0.2));
    },
    mutation() {
      const t = now();
      tone('sawtooth', 180, 1400, t, 0.55, 0.12);
      for (let i = 0; i < 6; i++) tone('sine', mtof(84 + i * 3 + Math.floor(Math.random() * 4)), 0, t + 0.3 + i * 0.05, 0.2, 0.12);
    },
    alarm() {
      const t = now();
      for (let i = 0; i < 4; i++) tone('square', i % 2 ? 660 : 880, 0, t + i * 0.18, 0.16, 0.08);
    },
    steal() {
      const t = now();
      tone('sine', 1100, 260, t, 0.55, 0.25);
      tone('square', 300, 150, t + 0.1, 0.3, 0.05);
    },
    lost() {
      tone('triangle', 300, 120, now(), 0.5, 0.2);
    },
    build() {
      const t = now();
      noise(t, 0.15, 0.5, 'lowpass', 700, 120);
      tone('sine', 160, 60, t, 0.18, 0.5);
      tone('triangle', 1046, 0, t + 0.08, 0.25, 0.12);
      tone('triangle', 1568, 0, t + 0.16, 0.3, 0.1);
    },
    buy() {
      const t = now();
      tone('triangle', 784, 0, t, 0.1, 0.2);
      tone('triangle', 1175, 0, t + 0.08, 0.18, 0.2);
    },
    upgrade() {
      const t = now();
      [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone('square', mtof(m), 0, t + i * 0.05, 0.12, 0.07));
    },
    deny() {
      if (!gate('deny', 0.15)) return;
      const t = now();
      tone('square', 150, 0, t, 0.08, 0.1);
      tone('square', 120, 0, t + 0.1, 0.12, 0.1);
    },
    win() {
      const t = now();
      [72, 76, 79, 84].forEach((m, i) => tone('triangle', mtof(m), 0, t + i * 0.1, 0.3, 0.2));
    },
    lose() {
      const t = now();
      [[392, 370], [370, 349], [349, 330], [330, 262]].forEach(([a, b], i) => tone('sawtooth', a, b, t + i * 0.42, i === 3 ? 1.1 : 0.4, 0.12));
    },
    beam() {
      if (!gate('beam', 0.3)) return;
      const t = now();
      tone('sine', 300, 900, t, 0.9, 0.1);
      tone('sine', 310, 880, t, 0.9, 0.06);
    },
    laser() {
      if (!gate('laser', 0.25)) return;
      tone('sawtooth', 1800, 300, now(), 0.35, 0.08);
    },
    event(good) {
      const t = now();
      (good ? [79, 84, 88, 91] : [70, 66, 63, 58]).forEach((m, i) => tone('square', mtof(m), 0, t + i * 0.08, 0.14, 0.07));
    },
    horn() {
      if (!gate('horn', 0.8)) return;
      const t = now();
      for (const f of [98, 147, 196]) tone('sawtooth', f, f * 0.97, t, 0.9, 0.09, null, 0.08);
      tone('sawtooth', 196, 185, t + 0.5, 0.7, 0.06, null, 0.05);
    },
    whistle() {
      if (!gate('whistle', 0.12)) return;
      tone('sine', 1600, 420, now(), 0.45, 0.1);
    },
    ally() {
      const t = now();
      [72, 76, 79, 84, 88].forEach((m, i) => {
        tone('sine', mtof(m), 0, t + i * 0.09, 0.5, 0.18);
        tone('sine', mtof(m) * 3, 0, t + i * 0.09, 0.2, 0.04);
      });
    },
    march() {
      if (!gate('march', 0.5)) return;
      const t = now();
      for (let i = 0; i < 4; i++) {
        tone('sine', 140, 60, t + i * 0.16, 0.12, 0.45);
        noise(t + i * 0.16, 0.05, 0.2, 'bandpass', 900, 0, 1);
      }
    },
    click() {
      if (!gate('click', 0.03)) return;
      tone('sine', 900, 600, now(), 0.04, 0.12);
    },
    miss() {
      if (!gate('miss', 0.05)) return;
      noise(now(), 0.06, 0.15, 'highpass', 1500);
    },
  };

  // --- music: C – Am – F – G, two bars each; the marimba phrase is re-rolled every 4 bars
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
  const ROOTS = [0, 9, 5, 7];
  const BPM = [108, 128, 146];

  function newPhrase() {
    phrase = [];
    for (let i = 0; i < 16; i++) {
      phrase.push(Math.random() < (i % 2 ? 0.3 : 0.6) ? SCALE[Math.floor(Math.random() * SCALE.length)] : null);
    }
  }

  function schedule() {
    if (!ctx) return;
    if (nextT < ctx.currentTime - 0.2) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.12) {
      if (level >= 0 && !muted) playStep(step, nextT);
      nextT += 60 / BPM[Math.max(0, level)] / 4;
      step = (step + 1) % 16;
      if (step === 0) {
        bar++;
        if (bar % 4 === 0) newPhrase();
      }
    }
  }

  function playStep(s, t) {
    const L = level, M = musBus, root = ROOTS[Math.floor(bar / 2) % 4];
    if (s % 8 === 0 || (L >= 1 && s % 4 === 0)) tone('sine', 150, 42, t, 0.22, 0.7, M);
    if (s === 0 || s === 3 || s === 6 || (L >= 1 && s === 10)) {
      const f = s === 0 ? 560 : 500;
      tone('sine', f, f * 0.8, t, 0.09, 0.35, M);
      noise(t, 0.015, 0.12, 'highpass', 3500, 0, 1, M);
    }
    if (L >= 1 && (s === 4 || s === 12)) noise(t, 0.12, 0.3, 'bandpass', 1800, 900, 0.9, M);
    if (L >= 1 ? s % 2 === 1 : s % 4 === 2) noise(t, 0.035, 0.12, 'highpass', 7000, 0, 1, M);
    if (L >= 2 && s % 2 === 0) noise(t, 0.02, 0.07, 'highpass', 9000, 0, 1, M);
    if (s === 0 || s === 6 || s === 8 || s === 11 || s === 14) {
      const m = 36 + root + (s === 11 ? 12 : 0);
      tone(L >= 1 ? 'square' : 'triangle', mtof(m), 0, t, 0.18, L >= 1 ? 0.12 : 0.25, M, 0.006);
    }
    const n = phrase[s];
    if (n !== null && (L >= 1 || s % 2 === 0)) {
      const f = mtof(72 + n);
      tone('sine', f, 0, t, 0.22, 0.16, M, 0.002);
      tone('sine', f * 4, 0, t, 0.05, 0.04, M, 0.001);
    }
  }

  return {
    init,
    play(name, arg) {
      if (ctx && !muted && SFX[name]) SFX[name](arg);
    },
    setLevel(l) { level = l; },
    duck(on) {
      if (musBus) musBus.gain.setTargetAtTime(on ? MUS * 0.3 : MUS, ctx.currentTime, 0.1);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ctx.currentTime, 0.02);
      try { localStorage.setItem('tt_mute', muted ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      return muted;
    },
    isMuted: () => muted,
  };
})();
