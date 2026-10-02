'use strict';
/* ═══════════════════════════════════════════════════════════════
   escape.js — 제4막 (시제품) : 연구소 탈출, 1인칭

   엔딩에서 눈을 뜬 피험자 07 의 눈으로 이어집니다. 복도 끝 비상구가
   반쯤 열려 있고, 나갈지 말지를 고릅니다.

     안 한다  → 다시 눕는다. 끝.
     탈출한다 → 경보. 뒤에서 누군가 달려옵니다. 장애물을 넘고, 밑으로
                미끄러지고, 옆으로 피하며 끝없이 이어지는 복도를 달립니다.
                흰 실험실 복도는 달릴수록 누런 벽지의 "백룸"으로 바뀝니다 —
                여기가 정말 현실인지는 알려 주지 않습니다.

   조작
     A D / ← →        옆 칸으로        W / SPACE / ↑   뛰어넘기
     S / SHIFT / ↓    미끄러지기       Q (누르고 있기)  뒤돌아보기
     터치 : 좌우로 쓸기 · 위로 쓸기(점프) · 아래로 쓸기(슬라이드) · 두 손가락(뒤)

   상태 머신
     door ─┬─▶ stay ───────────────────────────────▶ onDone('stay')
           └─▶ open ─▶ run ─┬─▶ free ──────────────▶ onDone('escaped')
                            └─▶ caught ─┬─▶ run (다시)
                                        └──────────▶ onDone('caught')

   그림은 320×180 버퍼에 원근 투영으로 그려 ×3 으로 키워 찍습니다
   (엔딩과 같은 픽셀 질감). 글자만 원래 해상도로 위에 얹습니다.
   ═══════════════════════════════════════════════════════════════ */
(() => {
const W = 960, H = 540;
const LW = 320, LH = 180, SC = W / LW;
const STEP = 1000 / 60;
const MONO = "'DungGeunMo','D2Coding','Nanum Gothic Coding',ui-monospace,Menlo,Consolas,monospace";

/* 세계 (단위 m) */
const FOC = 150;                 // 초점 거리 (픽셀) — 화면 폭 320 에서 시야 약 94°
const HW = 1.9, CH = 3.0;        // 복도 반폭 · 천장 높이
const LANE = 1.2;                // 칸 간격 — 왼쪽 · 가운데 · 오른쪽
const EYE = 1.6, SLIDE_EYE = .72;
const SEG = 2, VIEW = 70, NEAR = .22;
const RUN_LEN = 640;             // 비상구에서 바깥 문까지
const START_Z = -2.6;            // 처음 서 있는 자리 (문 앞)
const JUMP = 42, SLIDE = 46;     // 점프 · 슬라이드 길이 (프레임)
const CHASE0 = 13;               // 추격자와의 처음 거리

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => { k = clamp01(k); return k * k * (3 - 2 * k); };
const hash = n => { n = (n * 374761393) ^ (n >>> 13); n = Math.imul(n, 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/* 색 — 실험실(흰 복도) → 백룸(누런 벽지)로 달릴수록 번져 갑니다 */
const LAB = { wall: [212, 220, 222], wall2: [194, 204, 207], floor: [128, 140, 142], ceil: [198, 206, 208],
              stripe: [80, 168, 146], fog: [6, 9, 11], light: [236, 248, 255] };
const BACK = { wall: [194, 176, 102], wall2: [181, 162, 90], floor: [118, 100, 60], ceil: [212, 202, 146],
               stripe: [150, 128, 70], fog: [26, 22, 9], light: [255, 250, 212] };
const mixC = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/* ═════════════ 소리 ═══════════════════════════════════════ */
class EscSfx {
  constructor(audioFn) { this.audioFn = audioFn; this.ac = null; }
  ctx() {
    if (!this.ac) {
      try {
        this.ac = (this.audioFn && this.audioFn()) || new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ac.createGain(); this.master.gain.value = .9;
        this.master.connect(this.ac.destination);
      } catch (e) { return null; }
    }
    if (this.ac.state === 'suspended' || this.ac.state === 'interrupted') this.ac.resume();
    return this.ac;
  }
  env(g, t, a, d, peak) {
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
  }
  tone(f, dur, type = 'sine', vol = .1, slide = 0, delay = 0) {
    const c = this.ctx(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    this.env(g, t, .006, dur, vol);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + .05);
  }
  noise(dur, vol = .1, hp = 300, lp = 5000, delay = 0) {
    const c = this.ctx(); if (!c) return;
    const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f1 = c.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    const g = c.createGain(); this.env(g, t, .004, dur, vol);
    s.connect(f1).connect(f2).connect(g).connect(this.master); s.start(t);
  }
  step(v = .1)   { this.noise(.06, v, 90, 900); this.tone(72, .07, 'sine', v * 1.1, 46); }
  chase(v)       { this.noise(.09, v, 60, 650); this.tone(52, .1, 'sine', v * 1.5, 34); }
  heart(v)       { this.tone(62, .12, 'sine', v, 40); this.tone(54, .12, 'sine', v * .75, 36, .15); }
  jump()         { this.noise(.2, .07, 900, 5000); }
  land()         { this.step(.16); }
  slide()        { this.noise(.5, .09, 300, 2400); }
  hit()          { this.tone(110, .28, 'square', .16, 48); this.noise(.3, .24, 150, 2200); }
  pick()         { this.tone(880, .05, 'triangle', .08); }
  ok()           { this.tone(660, .07, 'triangle', .1); this.tone(990, .1, 'triangle', .09, 0, .07); }
  door()         { this.noise(1.1, .14, 50, 600); this.tone(84, 1.0, 'sawtooth', .05, 56); }
  slam()         { this.tone(70, .5, 'sine', .3, 32); this.noise(.3, .2, 60, 500); }
  grab()         { [233, 247, 349, 370].forEach((f, i) => this.tone(f, 1.1 - i * .1, 'sawtooth', .08, f * .94));
                   this.tone(44, 1.3, 'sine', .32, 30); this.noise(.5, .2, 900, 9000); }
  inject()       { this.noise(.9, .14, 3000, 11000); this.tone(420, 1.1, 'sine', .18, 48); }
  bird()         { const b = 1900 + Math.random() * 700; this.tone(b, .07, 'sine', .07, b * 1.35); this.tone(b * 1.2, .06, 'sine', .05, b * .85, .09); }
  swell() {
    const c = this.ctx(); if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + 1.6);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + 1.2); g.gain.exponentialRampToValueAtTime(.0001, t + 2.4);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 2.5);
    this.noise(2.2, .08, 2000, 12000);
  }
  /* 계속 울리는 것 — 경보(높낮이가 오르내림), 형광등 웅웅거림 */
  loop(name, on, build) {
    const c = this.ctx(); if (!c) return;
    this.loops = this.loops || {};
    const cur = this.loops[name];
    if (on && !cur) this.loops[name] = build(c);
    if (!on && cur) {
      cur.g.gain.setTargetAtTime(.0001, c.currentTime, .15);
      setTimeout(() => cur.nodes.forEach(n => { try { n.stop(); } catch (e) { /* 이미 멈춤 */ } }), 700);
      delete this.loops[name];
    }
  }
  alarm(on) {
    this.loop('alarm', on, c => {
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'square'; o.frequency.value = 760;
      lfo.frequency.value = 1.4; lg.gain.value = 210;
      lfo.connect(lg).connect(o.frequency);
      g.gain.value = .0001; g.gain.setTargetAtTime(.028, c.currentTime, .1);
      o.connect(g).connect(this.master); o.start(); lfo.start();
      return { g, nodes: [o, lfo] };
    });
  }
  alarmVol(v) { const L = this.loops && this.loops.alarm; if (L && this.ac) L.g.gain.setTargetAtTime(Math.max(.0001, .028 * v), this.ac.currentTime, .3); }
  hum(on) {
    this.loop('hum', on, c => {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 120;
      f.type = 'lowpass'; f.frequency.value = 420;
      g.gain.value = .0001; g.gain.setTargetAtTime(.022, c.currentTime, .4);
      o.connect(f).connect(g).connect(this.master); o.start();
      return { g, nodes: [o] };
    });
  }
  humVol(v) { const L = this.loops && this.loops.hum; if (L && this.ac) L.g.gain.setTargetAtTime(Math.max(.0001, .022 * v), this.ac.currentTime, .4); }
  stopAll() { ['alarm', 'hum'].forEach(n => this.loop(n, false)); }
}

/* ═════════════ 장애물 ═════════════════════════════════════
   kind : low   → 뛰어넘기 (낮은 차단봉 · 들것)
          high  → 미끄러지기 (머리 높이의 배관 · 반쯤 내려온 셔터)
          block → 옆으로 피하기 (선반 카트) — 세 칸을 다 막는 일은 없습니다 */
const OBS = {
  barrier: { kind: 'low',   y0: 0,    y1: .85, d: .25 },
  gurney:  { kind: 'low',   y0: .42,  y1: .95, d: 1.8 },
  pipe:    { kind: 'high',  y0: 1.12, y1: 1.42, d: .35 },
  shutter: { kind: 'high',  y0: 1.12, y1: CH,  d: .15 },
  cart:    { kind: 'block', y0: 0,    y1: 1.95, d: .9 }
};
const ALL = [-1, 0, 1];
function mkObs(type, z, lanes) { return { type, z, lanes, ...OBS[type], done: false, hit: false }; }

function genObstacles() {
  const list = [mkObs('barrier', 42, ALL), mkObs('pipe', 82, ALL), mkObs('cart', 120, [0])];
  let z = 152;
  while (z < RUN_LEN - 34) {
    const p = z / RUN_LEN, r = Math.random();
    const free = ALL[(Math.random() * 3) | 0];
    const others = ALL.filter(l => l !== free);
    const some = Math.random() < .5 ? others : [others[(Math.random() * 2) | 0]];
    if (r < .2)       list.push(mkObs('barrier', z, ALL));
    else if (r < .36) list.push(mkObs('pipe', z, ALL));
    else if (r < .48) list.push(mkObs('shutter', z, ALL));
    else if (r < .74) list.push(mkObs('cart', z, some));
    else              list.push(mkObs('gurney', z, some));
    // 뒤로 갈수록 두 개가 바짝 붙어 나오기도 합니다
    if (p > .45 && Math.random() < .3) { z += 7; list.push(mkObs(Math.random() < .5 ? 'pipe' : 'barrier', z, ALL)); }
    z += lerp(25, 14, p) + Math.random() * 6;
  }
  return list;
}

/* 지나가며 들려오는 목소리 · 혼잣말 — [z, 대사, 누구] */
const RUN_LINES = [
  [8,   '달려.', 'me'],
  [60,  '어디 가요, 07.', 'doc'],
  [180, '거긴 출구가 아니에요.', 'doc'],
  [300, '…이 복도, 이렇게 길었나.', 'me'],
  [420, '돌아와요. 아직 안 끝났어요.', 'doc'],
  [560, '…빛이다.', 'me']
];

/* ═════════════ 상태들 ════════════════════════════════════ */
const DoorState = {
  enter(s) {
    s.z = START_Z; s.x = 0; s.lane = 0; s.view = 'fwd'; s.doorOpen = .06; s.alarm = 0; s.lights = .55;
    s.sfx.hum(true); s.sfx.humVol(.5);
    s.choice = null;
  },
  update(s) {
    const t = s.t;
    if (t === 50)  s.say('…몸이 움직인다.', 'me', 150);
    if (t === 200) s.say('복도 끝, 비상구가 반쯤 열려 있다.', 'me', 170);
    if (t === 380) s.say('…나갈까?', 'me', 9999);
    if (t === 420) s.choose(['탈출한다', '안 한다'], i => s.go(i === 0 ? 'open' : 'stay'));
    s.bob += .012;
  },
  draw(s, b) {
    drawWorld(s, b);
    const o = ease(s.t / 70);                             // 눈을 뜹니다
    if (o < 1) { b.fillStyle = '#000'; const lid = (1 - o) * LH / 2; b.fillRect(0, 0, LW, lid); b.fillRect(0, LH - lid, LW, lid); }
  }
};

const StayState = {
  enter(s) { s.say('…아니. 다시 눕는다.', 'me', 170); },
  update(s) {
    s.doorOpen = Math.max(0, s.doorOpen - .003);
    if (s.t === 90) s.sfx.slam();
    if (s.t === 140) s.say('SESSION 142 — 예약됨', 'sys', 9999);
    s.lights = Math.max(0, s.lights - .004);
    if (s.t >= 280) s.finish('stay');
  },
  draw(s, b) {
    drawWorld(s, b);
    b.fillStyle = `rgba(0,0,0,${clamp01((s.t - 150) / 120)})`; b.fillRect(0, 0, LW, LH);
  }
};

/* 문이 열리고 경보 — 뒤를 한 번 돌아보면 그가 서 있습니다 */
const OpenState = {
  enter(s) {
    s.resetRun();
    s.sfx.door();
  },
  update(s) {
    const t = s.t;
    s.doorOpen = Math.min(1, s.doorOpen + .022);
    if (t === 24) { s.alarm = 1; s.lights = 1; s.sfx.alarm(true); s.sfx.humVol(1); s.shake = 6; s.say('…경보.', 'me', 80); }
    if (t === 76) { s.view = 'back'; s.sfx.chase(.18); s.shake = 4; }      // 휙 돌아봅니다
    if (t === 82) s.say('흰 가운. 안경알이 번뜩인다.', 'me', 90);
    if (t === 150) { s.view = 'fwd'; s.shake = 3; }
    s.chaseX = 0;
    if (t >= 160) s.go('run');
  },
  draw(s, b) { drawWorld(s, b); }
};

const RunState = {
  enter(s) { s.runT = 0; },
  update(s) {
    s.runT++;
    const p = clamp01(s.z / RUN_LEN);
    const base = lerp(8.2, 12, p);
    // 넘어지면 잠깐 느려집니다
    if (s.stumble > 0) s.stumble--;
    if (s.immune > 0) s.immune--;
    const sf = lerp(1, .22, s.stumble / 60);
    const v = base * sf;
    s.z += v / 60;
    s.bob += v * .028;
    // 발소리 — 걸음 박자에 맞춰
    if (Math.floor(s.bob / Math.PI) !== s.lastStep) { s.lastStep = Math.floor(s.bob / Math.PI); if (s.jumpT < 0 && s.slideT < 0) s.sfx.step(.09); }

    // 칸 이동 · 점프 · 슬라이드
    s.x += (s.lane * LANE - s.x) * .24;
    if (s.jumpT >= 0) { s.jumpT++; if (s.jumpT >= JUMP) { s.jumpT = -1; s.sfx.land(); } }
    if (s.slideT >= 0) { s.slideT++; if (s.slideT >= SLIDE) s.slideT = -1; }

    // 추격자 — 너무 멀어지면 고무줄처럼 다시 붙습니다
    const vp = base * (s.dist > 16 ? 1.07 : .972);
    s.dist = Math.min(22, s.dist + (v - vp) / 60);
    s.chaseX += (s.x - s.chaseX) * .03;
    const danger = clamp01((9 - s.dist) / 9);
    s.danger = danger;
    const chaseEvery = Math.round(lerp(19, 13, danger));
    if (s.runT % chaseEvery === 0) s.sfx.chase(.05 + clamp01(1 - s.dist / 18) * .22);
    const heartEvery = Math.round(lerp(64, 24, danger));
    if (danger > 0 && s.runT % heartEvery === 0) s.sfx.heart(.08 + danger * .2);

    // 장애물 — 앞면에 닿는 순간 판정
    for (const o of s.obs) {
      if (o.done || s.z + .3 < o.z) continue;
      o.done = true;
      if (!passes(s, o) && s.immune <= 0) {
        o.hit = true; s.stumble = 60; s.immune = 40; s.shake = 12; s.flash = .7;
        s.sfx.hit();
        if (s.dist < 6) s.say(['넘어지면 안 돼…!', '…가깝다.', '숨소리가 바로 뒤에서.'][(Math.random() * 3) | 0], 'me', 80);
      }
    }
    // 진행하며 들리는 말
    RUN_LINES.forEach(([z, txt, who], i) => { if (!(s.saidMask & (1 << i)) && s.z >= z) { s.saidMask |= 1 << i; s.say(txt, who, who === 'doc' ? 130 : 110); } });

    // 백룸으로 번져 갈수록 경보는 멀어지고 형광등 소리만 남습니다
    const tb = theme(s.z);
    s.sfx.alarmVol(1 - tb * .92); s.sfx.humVol(.7 + tb * .8);
    if (s.z > 150 && hash(Math.floor(s.runT / 7)) < .03) s.flick = 4;   // 가끔 형광등이 깜빡
    if (s.flick > 0) s.flick--;

    if (s.dist <= .5) s.go('caught');
    else if (s.z >= RUN_LEN - 1.2) s.go('free');
  },
  draw(s, b) { drawWorld(s, b); }
};

function passes(s, o) {
  const inLane = o.lanes.some(l => Math.abs(s.x - l * LANE) < LANE * .62);
  if (!inLane) return true;
  if (o.kind === 'low') return jumpH(s) > .45;
  if (o.kind === 'high') return slideK(s) > .55;
  return false;
}
const jumpH  = s => s.jumpT < 0 ? 0 : Math.sin(Math.PI * s.jumpT / JUMP) * 1.1;
const slideK = s => s.slideT < 0 ? 0 : Math.min(1, s.slideT / 6, (SLIDE - s.slideT) / 9);

const CaughtState = {
  enter(s) {
    s.view = 'back'; s.dist = .35; s.shake = 22; s.flash = 1;
    s.sfx.grab(); s.sfx.alarmVol(0);
    s.subs = [];
  },
  update(s) {
    const t = s.t;
    if (t === 26) s.sfx.inject();
    if (t === 60) s.say('쉬이… 괜찮아요. 괜찮아요.', 'doc', 120);
    if (t === 170) s.say('용량 올려.', 'cold', 90);
    if (t === 270) { s.sfx.stopAll(); s.say('SESSION 142', 'sys', 9999); }
    if (t === 320) s.choose(['다시 도망친다', '그만둔다'], i => {
      if (i === 0) { s.subs = []; s.go('open'); } else s.finish('caught');
    });
  },
  draw(s, b) {
    drawWorld(s, b);
    b.fillStyle = `rgba(0,0,0,${clamp01((s.t - 20) / 30)})`; b.fillRect(0, 0, LW, LH);
  }
};

/* 바깥 문 — 빛 속으로. 그리고 들리는 한마디 */
const FreeState = {
  enter(s) { s.sfx.swell(); s.sfx.alarm(false); s.sfx.hum(false); s.subs = []; },
  update(s) {
    const t = s.t;
    if (t < 50) s.z += .12;
    if (t === 70 || t === 96 || t === 150) s.sfx.bird();
    if (t === 90) s.say('…밖이다.', 'me-dark', 150);
    if (t === 260) s.say('…들리세요?', 'far-dark', 140);
    if (t >= 440) s.finish('escaped');
  },
  draw(s, b) {
    drawWorld(s, b);
    const w = clamp01(s.t / 46);
    b.fillStyle = `rgba(255,252,240,${w})`; b.fillRect(0, 0, LW, LH);
    if (s.t > 380) { b.fillStyle = `rgba(0,0,0,${clamp01((s.t - 380) / 60)})`; b.fillRect(0, 0, LW, LH); }
  }
};

/* ═════════════ 그리기 ════════════════════════════════════ */
function theme(z) { return ease((z - 140) / 260); }

/* 카메라 기준 투영 — dz 는 앞으로의 거리, back 이면 좌우가 뒤집힙니다 */
function P(s, x, y, dz) {
  const k = FOC / dz;
  return [s.cx + (x - s.camX) * k, s.cy - (y - s.camY) * k];
}
function quad(b, pts, fill) {
  b.fillStyle = fill;
  b.beginPath(); b.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) b.lineTo(pts[i][0], pts[i][1]);
  b.closePath(); b.fill();
}

function shade(s, base, dz, z) {
  const tb = theme(z);
  const fog = mixC(LAB.fog, BACK.fog, tb);
  let c = base;
  const near = clamp01(1 - dz / 44);
  c = mixC(fog, c, Math.pow(near, 1.25) * (s.lights * .85 + .15));
  // 경보 — 붉은 맥박 (백룸으로 갈수록 옅게)
  const red = s.alarm * (.5 + .5 * Math.sin(s.frame * .16)) * .34 * (1 - tb);
  if (red > .01) c = mixC(c, [210, 26, 26], red * (.4 + near * .6));
  if (s.flick > 0) c = mixC(c, fog, .55);
  return c;
}
function palAt(z) { const tb = theme(z); return tb <= 0 ? LAB : { wall: mixC(LAB.wall, BACK.wall, tb), wall2: mixC(LAB.wall2, BACK.wall2, tb),
  floor: mixC(LAB.floor, BACK.floor, tb), ceil: mixC(LAB.ceil, BACK.ceil, tb), stripe: mixC(LAB.stripe, BACK.stripe, tb),
  fog: mixC(LAB.fog, BACK.fog, tb), light: mixC(LAB.light, BACK.light, tb), tb }; }

function drawWorld(s, b) {
  const back = s.view === 'back';
  // 카메라
  const jh = jumpH(s), sk = slideK(s);
  s.camX = back ? -s.x : s.x;
  s.camY = lerp(EYE, SLIDE_EYE, sk) + jh + Math.sin(s.bob * 2) * .045;
  s.cx = LW / 2 + Math.sin(s.bob) * 1.6;
  s.cy = LH / 2 + (sk * 6);
  const tbHere = theme(s.z);
  const fog = mixC(LAB.fog, BACK.fog, tbHere);
  b.fillStyle = css(fog); b.fillRect(0, 0, LW, LH);

  b.save();
  const roll = (s.lane * LANE - s.x) * .045 * (back ? -1 : 1);
  b.translate(LW / 2, LH / 2); b.rotate(roll); b.translate(-LW / 2, -LH / 2);
  if (s.shake > .3) b.translate((Math.random() - .5) * s.shake * .5, (Math.random() - .5) * s.shake * .5);

  drawCorridor(s, b, back);
  if (!back) {
    drawEndWall(s, b);
    drawObstacles(s, b);
    drawDoorWall(s, b);
    drawChaseShadow(s, b);
  } else {
    drawPursuer(s, b);
  }
  b.restore();

  // 위험할수록 가장자리가 붉게 조여 옵니다
  const dg = s.danger || 0;
  if (dg > .02) {
    const g = b.createRadialGradient(LW / 2, LH / 2, 40, LW / 2, LH / 2, LW * .62);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(150,0,0,${dg * .55 * (.75 + .25 * Math.sin(s.frame * .3))})`);
    b.fillStyle = g; b.fillRect(0, 0, LW, LH);
  }
  if (s.flash > .02) { b.fillStyle = `rgba(255,60,50,${s.flash * .35})`; b.fillRect(0, 0, LW, LH); }
}

/* 복도 — 2m 마디마다 바닥 · 천장 · 양벽, 그리고 형광등 · 문 · 옆 통로 */
function drawCorridor(s, b, back) {
  const segs = [];
  const base = Math.floor(s.z / SEG);
  const n = Math.ceil(VIEW / SEG) + 1;
  for (let i = -n; i <= n; i++) {
    const idx = base + i, z0 = idx * SEG, z1 = z0 + SEG;
    if (z1 <= -40 || z0 >= RUN_LEN) continue;            // 복도는 -40m ~ 바깥 문까지
    let d0 = back ? s.z - z1 : z0 - s.z, d1 = back ? s.z - z0 : z1 - s.z;
    if (d1 <= NEAR || d0 > VIEW) continue;
    segs.push({ idx, z0, d0: Math.max(NEAR, d0), d1 });
  }
  segs.sort((a, c) => c.d1 - a.d1);
  for (const g of segs) {
    const { idx, d0, d1, z0 } = g, pal = palAt(z0), mid = (d0 + d1) / 2;
    const odd = idx & 1;
    // 바닥 · 천장
    quad(b, [P(s, -HW, 0, d0), P(s, HW, 0, d0), P(s, HW, 0, d1), P(s, -HW, 0, d1)], css(shade(s, odd ? pal.floor : mixC(pal.floor, [0, 0, 0], .08), mid, z0)));
    quad(b, [P(s, -HW, CH, d0), P(s, HW, CH, d0), P(s, HW, CH, d1), P(s, -HW, CH, d1)], css(shade(s, pal.ceil, mid, z0)));
    // 양벽
    const wc = css(shade(s, odd ? pal.wall : pal.wall2, mid, z0));
    quad(b, [P(s, -HW, 0, d0), P(s, -HW, CH, d0), P(s, -HW, CH, d1), P(s, -HW, 0, d1)], wc);
    quad(b, [P(s, HW, 0, d0), P(s, HW, CH, d0), P(s, HW, CH, d1), P(s, HW, 0, d1)], wc);
    // 허리 높이 줄 (실험실의 청록 띠 → 백룸의 누런 몰딩)
    const sc = css(shade(s, pal.stripe, mid, z0));
    [-HW, HW].forEach(x => quad(b, [P(s, x, .95, d0), P(s, x, 1.08, d0), P(s, x, 1.08, d1), P(s, x, .95, d1)], sc));
    // 바닥 이음매
    const seam = P(s, -HW, 0, d0), seam2 = P(s, HW, 0, d0);
    b.fillStyle = css(shade(s, [0, 0, 0], mid, z0), .25); b.fillRect(seam[0], seam[1], seam2[0] - seam[0], 1);
    // 문 (실험실) · 어두운 옆 통로 (백룸)
    const h = hash(idx);
    if (h < .22 && idx > -20) {
      const side = h < .11 ? -HW : HW, a = .35, c = 1.55;
      const dd0 = back ? d1 - c : d0 + a, dd1 = back ? d1 - a : d0 + c;
      if (dd0 > NEAR) {
        const dark = (pal.tb || 0) > .5 ? [8, 7, 3] : mixC(pal.wall, [40, 50, 56], .7);
        quad(b, [P(s, side, 0, dd0), P(s, side, 2.15, dd0), P(s, side, 2.15, dd1), P(s, side, 0, dd1)], css(shade(s, dark, mid, z0)));
      }
    }
    // 형광등 — 세 마디에 하나, 몇 개는 나가 있거나 깜빡입니다
    if (idx % 3 === 0) {
      const broken = hash(idx * 7 + 3) < .18 && z0 > 120;
      const flick = broken && Math.sin(s.frame * .9 + idx) > .3;
      const ld0 = back ? d1 - 1.3 : d0 + .7, ld1 = ld0 + .6;
      if (ld0 > NEAR && (!broken || flick)) {
        const red = s.alarm * (1 - (pal.tb || 0)) * (.5 + .5 * Math.sin(s.frame * .16));
        const lc = mixC(pal.light, [255, 70, 60], red * .6);
        quad(b, [P(s, -.55, CH - .01, ld0), P(s, .55, CH - .01, ld0), P(s, .55, CH - .01, ld1), P(s, -.55, CH - .01, ld1)],
             css(mixC(fog_(s), lc, clamp01(1 - ld0 / 60) * (s.flick > 0 ? .3 : 1) * (s.lights * .8 + .2))));
      }
    }
  }
}
const fog_ = s => mixC(LAB.fog, BACK.fog, theme(s.z));

/* 바깥 문 — 복도 끝의 빛. 멀리서도 작게 보입니다 */
function drawEndWall(s, b) {
  const dz = RUN_LEN - s.z;
  if (dz <= NEAR) return;
  const pal = palAt(RUN_LEN);
  if (dz < VIEW) {
    const wc = css(shade(s, pal.wall2, dz, RUN_LEN));
    quad(b, [P(s, -HW, 0, dz), P(s, -1, 0, dz), P(s, -1, CH, dz), P(s, -HW, CH, dz)], wc);
    quad(b, [P(s, 1, 0, dz), P(s, HW, 0, dz), P(s, HW, CH, dz), P(s, 1, CH, dz)], wc);
    quad(b, [P(s, -1, 2.4, dz), P(s, 1, 2.4, dz), P(s, 1, CH, dz), P(s, -1, CH, dz)], wc);
  }
  const a = P(s, -1, 2.4, dz), c = P(s, 1, 0, dz);
  b.fillStyle = '#fffbe8'; b.fillRect(a[0], a[1], c[0] - a[0], c[1] - a[1]);
  // 문에서 번지는 빛
  b.save(); b.globalCompositeOperation = 'lighter';
  const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, r = Math.max(14, (c[0] - a[0]) * 1.6);
  const g = b.createRadialGradient(mx, my, 1, mx, my, r);
  g.addColorStop(0, 'rgba(255,248,220,.5)'); g.addColorStop(1, 'rgba(255,248,220,0)');
  b.fillStyle = g; b.fillRect(mx - r, my - r, r * 2, r * 2);
  b.restore();
}

/* 처음의 비상구 — 벽 한 장과 미닫이 문, 그 위의 녹색 EXIT */
function drawDoorWall(s, b) {
  const dz = 0 - s.z;
  if (dz <= NEAR) return;
  const wc = css(shade(s, [150, 160, 164], dz, -1));
  const L = -.62, R = .62, T = 2.15;
  quad(b, [P(s, -HW, 0, dz), P(s, L, 0, dz), P(s, L, CH, dz), P(s, -HW, CH, dz)], wc);
  quad(b, [P(s, R, 0, dz), P(s, HW, 0, dz), P(s, HW, CH, dz), P(s, R, CH, dz)], wc);
  quad(b, [P(s, L, T, dz), P(s, R, T, dz), P(s, R, CH, dz), P(s, L, CH, dz)], wc);
  // 문짝 — 오른쪽으로 밀려 열립니다 (열린 만큼 문틀 안에서만 보임)
  const lx = L + s.doorOpen * (R - L);
  if (lx < R) {
    const d = css(shade(s, [92, 100, 104], dz, -1));
    quad(b, [P(s, lx, 0, dz), P(s, R, 0, dz), P(s, R, T, dz), P(s, lx, T, dz)], d);
    const w0 = Math.max(lx + .18, lx), win = P(s, w0, 1.85, dz), win2 = P(s, Math.min(R - .05, w0 + .3), 1.35, dz);
    if (win2[0] > win[0]) { b.fillStyle = css(shade(s, [30, 40, 44], dz, -1)); b.fillRect(win[0], win[1], win2[0] - win[0], win2[1] - win[1]); }
    const bar = P(s, lx + .05, 1.02, dz), bar2 = P(s, Math.min(R, lx + .9), .96, dz);
    b.fillStyle = css(shade(s, [190, 196, 198], dz, -1)); b.fillRect(bar[0], bar[1], Math.max(0, bar2[0] - bar[0]), Math.max(1, bar2[1] - bar[1]));
  }
  // 문틈으로 새는 빛
  if (s.doorOpen > 0 && s.doorOpen < .3) {
    const a = P(s, L, T, dz), c = P(s, lx, 0, dz);
    b.fillStyle = 'rgba(236,248,255,.5)'; b.fillRect(a[0], a[1], c[0] - a[0], c[1] - a[1]);
  }
  // EXIT 표지
  const e0 = P(s, -.34, 2.62, dz), e1 = P(s, .34, 2.34, dz);
  b.fillStyle = '#0d3a1e'; b.fillRect(e0[0], e0[1], e1[0] - e0[0], e1[1] - e0[1]);
  b.fillStyle = `rgba(80,255,140,${.7 + .3 * Math.sin(s.frame * .05)})`;
  b.fillRect(e0[0] + 1, e0[1] + 1, e1[0] - e0[0] - 2, e1[1] - e0[1] - 2);
  s.exitSign = { x: (e0[0] + e1[0]) / 2, y: (e0[1] + e1[1]) / 2, h: e1[1] - e0[1] };
  b.save(); b.globalCompositeOperation = 'lighter';
  const gx = s.exitSign.x, gy = s.exitSign.y, gr = (e1[0] - e0[0]) * 1.4;
  const gg = b.createRadialGradient(gx, gy, 1, gx, gy, gr);
  gg.addColorStop(0, 'rgba(60,255,120,.25)'); gg.addColorStop(1, 'rgba(60,255,120,0)');
  b.fillStyle = gg; b.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
  b.restore();
}

/* 상자 하나 — 앞면 · 윗면/밑면 · 옆면을 보이는 것만 */
function box(s, b, x0, x1, y0, y1, d0, d1, col, z) {
  if (d1 <= NEAR) return;
  const n = Math.max(NEAR, d0), mid = (n + d1) / 2;
  const C = (k) => css(shade(s, mixC(col, [0, 0, 0], k), mid, z));
  if (x0 > s.camX) quad(b, [P(s, x0, y0, n), P(s, x0, y1, n), P(s, x0, y1, d1), P(s, x0, y0, d1)], C(.35));
  if (x1 < s.camX) quad(b, [P(s, x1, y0, n), P(s, x1, y1, n), P(s, x1, y1, d1), P(s, x1, y0, d1)], C(.35));
  if (y1 < s.camY) quad(b, [P(s, x0, y1, n), P(s, x1, y1, n), P(s, x1, y1, d1), P(s, x0, y1, d1)], C(-.15));
  if (y0 > s.camY) quad(b, [P(s, x0, y0, n), P(s, x1, y0, n), P(s, x1, y0, d1), P(s, x0, y0, d1)], C(.5));
  if (d0 > NEAR) quad(b, [P(s, x0, y0, n), P(s, x1, y0, n), P(s, x1, y1, n), P(s, x0, y1, n)], C(0));
}

function drawObstacles(s, b) {
  const vis = s.obs.filter(o => o.z + o.d - s.z > NEAR && o.z - s.z < VIEW);
  vis.sort((a, c) => c.z - a.z);
  for (const o of vis) {
    const d0 = o.z - s.z, d1 = d0 + o.d;
    const spans = o.lanes.length === 3 ? [[-HW, HW]] : o.lanes.map(l => [l * LANE - .55, l * LANE + .55]);
    for (const [x0, x1] of spans) {
      if (o.type === 'barrier') {
        box(s, b, x0, x1, .55, .85, d0, d1, [230, 190, 40], o.z);
        // 줄무늬
        if (d0 > NEAR) {
          const a = P(s, x0, .85, d0), c = P(s, x1, .55, d0), w = (c[0] - a[0]) / 9;
          b.fillStyle = css(shade(s, [20, 18, 14], d0, o.z));
          for (let i = 0; i < 9; i += 2) b.fillRect(a[0] + i * w, a[1], w, c[1] - a[1]);
        }
        [x0 + .1, x1 - .16].forEach(lx => box(s, b, lx, lx + .06, 0, .55, d0, d0 + .06, [70, 70, 70], o.z));
      } else if (o.type === 'gurney') {
        [x0 + .08, x1 - .14].forEach(lx => [d0 + .1, d1 - .16].forEach(dz => box(s, b, lx, lx + .06, 0, .42, dz, dz + .06, [60, 64, 66], o.z)));
        box(s, b, x0, x1, .42, .62, d0, d1, [150, 158, 160], o.z);
        box(s, b, x0 + .05, x1 - .05, .62, .95, d0 + .3, d1, [226, 230, 228], o.z);       // 덮인 시트
      } else if (o.type === 'pipe') {
        box(s, b, x0, x1, o.y0, o.y1, d0, d1, [96, 104, 110], o.z);
        if (d0 > NEAR) { const a = P(s, x0, o.y1 - .06, d0), c = P(s, x1, o.y1 - .1, d0); b.fillStyle = css(shade(s, [190, 200, 205], d0, o.z)); b.fillRect(a[0], a[1], c[0] - a[0], Math.max(1, c[1] - a[1])); }
        [x0 + .3, x1 - .36].forEach(lx => box(s, b, lx, lx + .06, o.y1, CH, d0 + .1, d0 + .16, [70, 74, 78], o.z));   // 매단 줄
      } else if (o.type === 'shutter') {
        box(s, b, x0, x1, o.y0, o.y1, d0, d1, [128, 132, 128], o.z);
        if (d0 > NEAR) {
          b.fillStyle = css(shade(s, [70, 72, 70], d0, o.z));
          for (let y = o.y0 + .12; y < o.y1; y += .2) { const a = P(s, x0, y, d0), c = P(s, x1, y, d0); b.fillRect(a[0], a[1], c[0] - a[0], 1); }
          const a = P(s, x0, o.y0 + .06, d0), c = P(s, x1, o.y0, d0);
          b.fillStyle = css(shade(s, [220, 180, 40], d0, o.z)); b.fillRect(a[0], a[1], c[0] - a[0], Math.max(1, c[1] - a[1]));
        }
      } else if (o.type === 'cart') {
        box(s, b, x0, x1, 0, o.y1, d0, d1, [120, 128, 132], o.z);
        if (d0 > NEAR) {
          // 선반 칸과 실린 것들
          [.5, 1.05, 1.6].forEach((y, k) => {
            const a = P(s, x0 + .04, y, d0), c = P(s, x1 - .04, y - .04, d0);
            b.fillStyle = css(shade(s, [60, 66, 70], d0, o.z)); b.fillRect(a[0], a[1], c[0] - a[0], Math.max(1, c[1] - a[1]));
            for (let i = 0; i < 3; i++) {
              const bx0 = x0 + .1 + i * .32, it = P(s, bx0, y + .32, d0), it2 = P(s, bx0 + .22, y, d0);
              b.fillStyle = css(shade(s, [[180, 60, 50], [200, 200, 190], [60, 120, 160]][(i + k) % 3], d0, o.z));
              b.fillRect(it[0], it[1], it2[0] - it[0], it2[1] - it[1]);
            }
          });
        }
      }
    }
  }
}

/* 앞을 보고 있어도 — 가까워지면 뒤의 형광등이 그의 그림자를 발치까지 늘어뜨립니다 */
function drawChaseShadow(s, b) {
  const dg = s.danger || 0;
  if (dg <= 0 || s.z < 0) return;
  const len = .8 + dg * 4.5, sx = s.chaseX;
  const a = P(s, sx - .28, 0, NEAR + .05), c = P(s, sx + .28, 0, NEAR + .05);
  const f = P(s, sx, 0, NEAR + len), fl = P(s, sx - .12, 0, NEAR + len - .3), fr = P(s, sx + .12, 0, NEAR + len - .3);
  b.fillStyle = `rgba(0,0,0,${.25 + dg * .45})`;
  b.beginPath(); b.moveTo(a[0], Math.min(LH + 4, a[1])); b.lineTo(fl[0], fl[1]); b.lineTo(f[0], f[1] - 2); b.lineTo(fr[0], fr[1]);
  b.lineTo(c[0], Math.min(LH + 4, c[1])); b.closePath(); b.fill();
  // 머리 그림자
  b.beginPath(); b.ellipse(f[0], f[1] - 1, Math.max(1.5, (fr[0] - fl[0]) * .7), 1.6, 0, 0, Math.PI * 2); b.fill();
}

/* 뒤돌아보면 — 흰 가운, 안경알. 가까울수록 손이 뻗어 옵니다 */
function drawPursuer(s, b) {
  const dz = Math.max(.32, s.dist);
  const px = -s.chaseX;                       // 뒤를 보면 좌우가 뒤집힙니다
  const run = s.frame * .32, bob = Math.abs(Math.sin(run)) * .05;
  const pt = (x, y) => P(s, px + x, y + bob, dz);
  const k = FOC / dz;
  const coat = css(shade(s, [214, 220, 222], dz * .7, s.z));
  const dark = css(shade(s, [24, 26, 30], dz * .7, s.z));
  b.lineCap = 'round';
  // 다리
  b.strokeStyle = dark; b.lineWidth = Math.max(1, .13 * k);
  [[-.1, 1], [.1, -1]].forEach(([ox, sg]) => {
    const hip = pt(ox, .92), foot = pt(ox + Math.sin(run) * .22 * sg, .02 + Math.max(0, Math.sin(run) * sg) * .18);
    b.beginPath(); b.moveTo(hip[0], hip[1]); b.lineTo(foot[0], foot[1]); b.stroke();
  });
  // 가운
  quad(b, [pt(-.25, 1.52), pt(.25, 1.52), pt(.32, .72), pt(-.32, .72)], coat);
  b.fillStyle = dark; const tie = pt(0, 1.5), tie2 = pt(0, 1.05);
  b.fillRect(tie[0] - Math.max(.5, .02 * k), tie[1], Math.max(1, .04 * k), tie2[1] - tie[1]);
  // 팔 — 가까워질수록 앞으로 뻗습니다
  const reach = clamp01((7 - s.dist) / 6);
  b.strokeStyle = coat; b.lineWidth = Math.max(1, .1 * k);
  [[-.27, 1], [.27, -1]].forEach(([ox, sg]) => {
    const sh = pt(ox, 1.46);
    const hand = pt(ox * (1 - reach * .4) + Math.sin(run) * .12 * sg * (1 - reach), lerp(1.0, 1.42, reach));
    const hy = hand[1] + reach * Math.min(k * .05, 10);
    b.beginPath(); b.moveTo(sh[0], sh[1]); b.lineTo(hand[0], hy); b.stroke();
    // 손 — 손바닥과 벌어진 손가락 (가까이 와도 너무 커지지 않게)
    const hr = Math.min(7, Math.max(1, .05 * k));
    b.fillStyle = css(shade(s, [196, 168, 150], dz * .7, s.z));
    b.beginPath(); b.ellipse(hand[0], hy, hr, hr * .8, 0, 0, Math.PI * 2); b.fill();
    if (hr > 2.5) {
      b.strokeStyle = b.fillStyle; b.lineWidth = Math.max(1, hr * .3);
      for (let f = 0; f < 4; f++) {
        const a = -Math.PI / 2 + (f - 1.5) * .38 * sg;
        b.beginPath(); b.moveTo(hand[0], hy); b.lineTo(hand[0] + Math.cos(a) * hr * 2.1, hy + Math.sin(a) * hr * 2.1); b.stroke();
      }
      b.strokeStyle = coat; b.lineWidth = Math.max(1, .1 * k);
    }
  });
  // 머리 · 안경알
  const hd = pt(0, 1.7);
  b.fillStyle = dark; b.beginPath(); b.arc(hd[0], hd[1], Math.max(1.5, .14 * k), 0, Math.PI * 2); b.fill();
  const gl = .7 + .3 * Math.sin(s.frame * .2);
  b.fillStyle = `rgba(240,250,255,${gl})`;
  [-.055, .055].forEach(ox => { const e = pt(ox, 1.71); b.fillRect(e[0] - Math.max(.5, .025 * k), e[1] - Math.max(.5, .012 * k), Math.max(1, .05 * k), Math.max(1, .025 * k)); });
  b.lineCap = 'butt';
}

/* ═════════════ 글자 · 선택지 (원래 해상도) ═══════════════════ */
const SUB_STYLE = {
  me:   { c: '#e6f1ff', y: H - 70, size: 22 },
  doc:  { c: '#d8e6ef', y: H - 106, size: 18, italic: true },
  cold: { c: '#e8c9c0', y: H - 106, size: 20 },
  sys:  { c: '#00ff00', y: H / 2, size: 26 },
  'me-dark':  { c: '#3a3a36', y: H / 2, size: 26 },
  'far-dark': { c: '#8a8a82', y: H / 2 + 40, size: 18 }
};
function drawText(s, c) {
  c.save();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  s.subs.forEach(u => {
    const age = s.frame - u.t0;
    if (age > u.dur) return;
    const st = SUB_STYLE[u.who] || SUB_STYLE.me;
    const a = Math.min(1, age / 12) * Math.min(1, (u.dur - age) / 14);
    c.globalAlpha = a;
    c.font = `${st.size}px ${MONO}`;
    const n = Math.min(u.text.length, Math.floor(age / 2.2) + 1);   // 한 글자씩
    const txt = u.text.slice(0, n);
    if (u.who === 'doc' || u.who === 'cold') { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillText(txt, W / 2 + 2, st.y + 2); }
    c.fillStyle = st.c;
    if (u.who === 'sys') { c.shadowColor = 'rgba(0,255,0,.6)'; c.shadowBlur = 10; }
    c.fillText(txt, W / 2, st.y);
    c.shadowBlur = 0;
  });
  c.restore();
}

function choiceRects(s) {
  const n = s.choice.opts.length, w = 230, h = 54, gap = 40;
  const x0 = W / 2 - (n * w + (n - 1) * gap) / 2;
  return s.choice.opts.map((_, i) => ({ x: x0 + i * (w + gap), y: H - 200, w, h }));
}
function drawChoice(s, c) {
  const ch = s.choice;
  if (!ch) return;
  ch.a = Math.min(1, ch.a + .05);
  c.save();
  c.globalAlpha = ch.a;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  choiceRects(s).forEach((r, i) => {
    const on = i === ch.sel;
    c.fillStyle = on ? 'rgba(125,227,200,.16)' : 'rgba(0,0,0,.55)';
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = on ? '#7de3c8' : 'rgba(230,241,255,.35)'; c.lineWidth = 2;
    c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    c.font = `22px ${MONO}`;
    c.fillStyle = on ? '#7de3c8' : '#c9d3dc';
    c.fillText((on ? '▶ ' : '') + ch.opts[i], r.x + r.w / 2, r.y + r.h / 2 + 1);
  });
  c.font = `13px ${MONO}`; c.fillStyle = 'rgba(230,241,255,.45)';
  c.fillText(s.touch ? '눌러서 고르기' : '← → 로 고르고 SPACE', W / 2, H - 124);
  c.restore();
}

function drawHud(s, c) {
  if (s.stateName !== 'run') return;
  c.save();
  // 바깥 문까지 — 위쪽 가는 줄
  const p = clamp01(s.z / RUN_LEN);
  c.fillStyle = 'rgba(230,241,255,.18)'; c.fillRect(W / 2 - 160, 22, 320, 3);
  c.fillStyle = '#fffbe8'; c.fillRect(W / 2 - 160, 22, 320 * p, 3);
  // 뒤와의 거리
  const dg = s.danger || 0;
  c.font = `15px ${MONO}`; c.textBaseline = 'middle';
  c.fillStyle = dg > .3 ? `rgba(255,90,80,${.7 + .3 * Math.sin(s.frame * .4)})` : 'rgba(230,241,255,.6)';
  c.fillText(`뒤  ${Math.max(0, s.dist).toFixed(1)}m`, 26, H - 30);
  // 처음 한 번씩 조작 알림
  const next = s.obs.find(o => !o.done);
  const hint = (() => {
    if (s.z > 12 && s.z < 34 && !s.lookedBack) return s.touch ? '두 손가락으로 누르고 있기 — 뒤돌아보기' : 'Q 누르고 있기 — 뒤돌아보기';
    if (!next || next.z - s.z > 20) return null;
    if (next.z === 42) return s.touch ? '위로 쓸기 — 뛰어넘기' : 'SPACE / W — 뛰어넘기';
    if (next.z === 82) return s.touch ? '아래로 쓸기 — 미끄러지기' : 'S / SHIFT — 미끄러지기';
    if (next.z === 120) return s.touch ? '좌우로 쓸기 — 옆으로 피하기' : 'A D / ← → — 옆으로 피하기';
    return null;
  })();
  if (hint) {
    c.textAlign = 'center'; c.font = `16px ${MONO}`;
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(W / 2 - 180, 46, 360, 30);
    c.fillStyle = '#7de3c8'; c.fillText(hint, W / 2, 62);
  }
  if (s.view === 'back') {
    c.textAlign = 'center'; c.font = `14px ${MONO}`; c.fillStyle = 'rgba(255,120,110,.8)';
    c.fillText('— 뒤 —', W / 2, 92);
  }
  c.restore();
}

/* 화면 결 — 가장자리 어둡게 + 옅은 주사선 */
function bakeOverlay() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(0,0,0,.12)';
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  return cv;
}

/* ═════════════ 씬 본체 ═════════════════════════════════════ */
class EscapeScene {
  constructor(canvas, { audio, onDone } = {}) {
    this.canvas = canvas;
    canvas.width = W; canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.buf = document.createElement('canvas'); this.buf.width = LW; this.buf.height = LH;
    this.b = this.buf.getContext('2d');
    this.sfx = new EscSfx(audio);
    this.onDone = onDone || (() => {});
    this.overlay = bakeOverlay();
    this.states = { door: DoorState, stay: StayState, open: OpenState, run: RunState, caught: CaughtState, free: FreeState };
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    ['loop', 'onKey', 'onKeyUp', 'onDown', 'onTouchStart', 'onTouchEnd'].forEach(k => this[k] = this[k].bind(this));
    this.running = false;
  }
  start() {
    this.frame = 0; this.subs = []; this.bob = 0; this.shake = 0; this.flash = 0; this.flick = 0;
    this.z = START_Z; this.x = 0; this.lane = 0; this.jumpT = -1; this.slideT = -1;
    this.dist = CHASE0; this.chaseX = 0; this.danger = 0; this.alarm = 0; this.lights = .55; this.doorOpen = .06;
    this.obs = []; this.view = 'fwd';
    this.go('door');
    this.running = true; this.acc = 0; this.last = performance.now();
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.raf = requestAnimationFrame(this.loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.sfx.stopAll();
  }
  finish(result) { this.stop(); this.onDone(result); }
  resetRun() {
    this.z = START_Z; this.x = 0; this.lane = 0; this.jumpT = -1; this.slideT = -1;
    this.dist = CHASE0; this.chaseX = 0; this.danger = 0; this.stumble = 0; this.immune = 0;
    this.obs = genObstacles(); this.saidMask = 0; this.lookedBack = false; this.view = 'fwd';
    this.doorOpen = .06; this.lights = .55; this.alarm = 0; this.lastStep = 0;
    this.sfx.hum(true);
  }
  go(name) {
    this.state = this.states[name]; this.stateName = name; this.t = 0;
    this.choice = null;
    if (this.state.enter) this.state.enter(this);
  }
  say(text, who = 'me', dur = 120) {
    if (who === 'sys' || who === 'me-dark') this.subs = this.subs.filter(u => u.who !== who);
    this.subs = this.subs.filter(u => this.frame - u.t0 < u.dur && SUB_STYLE[u.who].y !== SUB_STYLE[who].y);
    this.subs.push({ text, who, dur, t0: this.frame });
  }
  choose(opts, cb) { this.choice = { opts, sel: 0, a: 0, cb }; }
  pickChoice(i) {
    const ch = this.choice;
    if (!ch || ch.a < .5) return;
    this.choice = null;
    this.sfx.ok();
    this.subs = this.subs.filter(u => u.who !== 'me' || u.dur < 9999);
    ch.cb(i);
  }
  loop(now) {
    if (!this.running) return;
    this.acc += Math.min(100, now - this.last); this.last = now;
    while (this.acc >= STEP && this.running) { this.update(); this.acc -= STEP; }
    if (!this.running) return;
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }
  update() {
    this.frame++; this.t++;
    this.shake *= .88; this.flash *= .9;
    this.state.update(this);
  }
  draw() {
    const c = this.ctx;
    this.state.draw(this, this.b);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.buf, 0, 0, W, H);
    c.drawImage(this.overlay, 0, 0);
    drawHud(this, c);
    drawText(this, c);
    drawChoice(this, c);
  }

  /* ── 입력 ── */
  act(a) {
    if (this.choice) {
      if (a === 'left')  { this.choice.sel = Math.max(0, this.choice.sel - 1); this.sfx.pick(); }
      if (a === 'right') { this.choice.sel = Math.min(this.choice.opts.length - 1, this.choice.sel + 1); this.sfx.pick(); }
      if (a === 'ok' || a === 'jump') this.pickChoice(this.choice.sel);
      return;
    }
    if (this.stateName !== 'run') return;
    if ((a === 'left' || a === 'right') && this.z < .6) return;   // 문틀을 지날 때까진 한가운데로
    if (a === 'left')  this.lane = Math.max(-1, this.lane - 1);
    if (a === 'right') this.lane = Math.min(1, this.lane + 1);
    if (a === 'jump' && this.jumpT < 0) { this.jumpT = 0; this.slideT = -1; this.sfx.jump(); }
    if (a === 'slide') {
      if (this.jumpT >= 0) this.jumpT = Math.max(this.jumpT, Math.floor(JUMP * .78));   // 공중이면 빨리 내려옵니다
      if (this.slideT < 0) { this.slideT = 0; this.sfx.slide(); }
    }
  }
  look(on) {
    if (this.stateName !== 'run') return;
    this.view = on ? 'back' : 'fwd';
    if (on) this.lookedBack = true;
  }
  onKey(e) {
    const map = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
                  Space: 'jump', KeyW: 'jump', ArrowUp: 'jump', Enter: 'ok',
                  KeyS: 'slide', ArrowDown: 'slide', ShiftLeft: 'slide', ShiftRight: 'slide', KeyC: 'slide' };
    if (map[e.code] || e.code === 'KeyQ' || e.code === 'Digit1' || e.code === 'Digit2') e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyQ') return this.look(true);
    if (this.choice && (e.code === 'Digit1' || e.code === 'Digit2')) return this.pickChoice(e.code === 'Digit1' ? 0 : 1);
    if (map[e.code]) this.act(map[e.code]);
  }
  onKeyUp(e) { if (e.code === 'KeyQ') this.look(false); }
  toLocal(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return [(clientX - r.left) * W / r.width, (clientY - r.top) * H / r.height];
  }
  onDown(e) {
    if (!this.choice || e.pointerType === 'touch') return;
    const [x, y] = this.toLocal(e.clientX, e.clientY);
    choiceRects(this).forEach((r, i) => { if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { this.choice.sel = i; this.pickChoice(i); } });
  }
  onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length >= 2) { this.look(true); this.ts = null; return; }
    const t = e.touches[0]; this.ts = [t.clientX, t.clientY];
  }
  onTouchEnd(e) {
    e.preventDefault();
    if (this.view === 'back' && e.touches.length < 2) { this.look(false); this.ts = null; return; }
    if (!this.ts) return;
    const t = e.changedTouches[0], dx = t.clientX - this.ts[0], dy = t.clientY - this.ts[1];
    this.ts = null;
    if (this.choice) {
      const [x, y] = this.toLocal(t.clientX, t.clientY);
      choiceRects(this).forEach((r, i) => { if (x >= r.x && x <= r.x + r.w && y >= r.y - 20 && y <= r.y + r.h + 20) { this.choice.sel = i; this.pickChoice(i); } });
      return;
    }
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return this.act('jump');   // 톡 — 점프
    if (Math.abs(dx) > Math.abs(dy)) this.act(dx < 0 ? 'left' : 'right');
    else this.act(dy < 0 ? 'jump' : 'slide');
  }
}
window.EscapeScene = EscapeScene;
})();
