'use strict';
/* ═══════════════════════════════════════════════════════════════
   escape.js — 제4막 (시제품) : 연구소 탈출, 1인칭

   엔딩에서 눈을 뜬 피험자 07 의 눈으로 이어집니다. 침대에서 몸을 일으켜
   전극과 링거를 떼고, 방을 나와 복도 끝 비상구까지 걸어갑니다 (깨어남).
   비상구는 반쯤 열려 있고, 나갈지 말지를 고릅니다.

     안 한다  → 다시 눕는다. 끝.
     탈출한다 → 경보. 뒤에서 누군가 달려옵니다. 장애물을 넘고, 밑으로
                미끄러지고, 옆으로 피하며 끝없이 이어지는 복도를 달립니다.
                흰 실험실 복도는 달릴수록 누런 벽지의 "백룸"으로 바뀝니다.
                그런데 이건 탈출이 아닙니다 — 134m 즈음 이미 붙잡혀 침대로 돌아가
                진정제를 맞았고, 달리는 건 그 뒤의 꿈입니다. 넘어가는 동안 몇 프레임씩
                현실이 끼어들고(REAL : 누운 채 올려다본 천장, 들여다보는 방호복, 바늘),
                바닥엔 내 머리의 전극선이 따라오고, 복도엔 링거대 · 심전도 · 묶는 끈 달린
                빈 침대가 서 있으며, 어딘가에서 심전도가 울립니다. 바깥 문의 빛이
                걷히면 침대 위 — "출구까지 갔네요. 이번엔." SESSION 142 진행 중.

   그림 — 복도는 corridor3d.js (실사 WebGL), 사람은 figure3d.js 를 같은 깊이 버퍼에.
   WebGL 이 없으면 아래의 픽셀 복도로 그립니다.

   중간 (286~450m) — 총격전. 바닥에 떨어진 권총을 줍고, 앞을 막아서는
   경비원들과 맞섭니다. 경비원은 붉은 조준선을 겨눈 뒤 쏩니다 — 그사이
   옆 칸으로 비키거나 미끄러지면 빗나갑니다. 맞은 경비원은 피가 아니라
   코드처럼 깨져 흩어집니다 (여기가 아직 꿈인지도 모릅니다).

   조작
     A D / ← →        옆 칸으로        W / SPACE / ↑   뛰어넘기
     S / SHIFT / ↓    미끄러지기       Q (누르고 있기)  뒤돌아보기
     마우스 조준 · 클릭 사격 (F : 가장 가까운 적에게)   R  재장전
     터치 : 좌우로 쓸기 · 위로 쓸기(점프) · 아래로 쓸기(슬라이드) · 두 손가락(뒤)

   상태 머신
     wake ─▶ door ─┬─▶ stay ───────────────────────────────▶ onDone('stay')
                   └─▶ open ─▶ run ─┬─▶ free ──────────────▶ onDone('escaped')
                                    └─▶ caught ─┬─▶ run (다시)
                                                └──────────▶ onDone('caught')
     (start('door') 면 깨어남을 건너뛰고 비상구 앞부터)

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
const GUN_Z = 286, ZONE0 = 300, ZONE1 = 450;   // 총을 줍는 자리 · 총격전 구간
const MAG = 12;                  // 탄창
const AIM_T = 72, LOCK_T = 54;   // 경비원 조준 길이 · 조준선이 고정되는 시점

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => { k = clamp01(k); return k * k * (3 - 2 * k); };
const hash = n => { n = (n * 374761393) ^ (n >>> 13); n = Math.imul(n, 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/* 색 — 실험실 → 백룸(누런 벽지)로 달릴수록 번져 갑니다.
   실험실은 엔딩(ending.js 의 Lab)과 같은 톤 — 짙은 청회색 벽(#2c3747),
   더 어두운 바닥(#252d39) · 천장(#0f131a), 몰딩(#3a4757), 차가운 흰 조명.
   (멀수록 어두워지는 만큼 원본보다 한 단계 밝게 잡았습니다) */
const LAB = { wall: [62, 77, 98], wall2: [52, 65, 84], floor: [50, 60, 76], ceil: [24, 30, 40],
              stripe: [84, 100, 122], fog: [5, 7, 11], light: [227, 236, 248] };
const LAB_DOOR = [70, 84, 104], LAB_LEAF = [46, 57, 74], LAB_DARK = [24, 30, 40];
const BACK = { wall: [194, 176, 102], wall2: [181, 162, 90], floor: [118, 100, 60], ceil: [212, 202, 146],
               stripe: [150, 128, 70], fog: [26, 22, 9], light: [255, 250, 212] };
const mixC = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/* ═════════════ 소리 ═══════════════════════════════════════ */
/* 탈출 브금의 반복 구간 · 음량 — tools/make_escape_bgm.py 가 찍어 준 값 */
const ESC_BGM = { loop0: 38.360, loop1: 73.560, vol: .36 };
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
  shot()         { this.noise(.16, .32, 200, 7000); this.tone(150, .14, 'square', .18, 50); }
  enemyShot()    { this.noise(.12, .22, 600, 9000); this.tone(320, .08, 'square', .1, 120); }
  empty()        { this.tone(1400, .03, 'square', .06); this.noise(.04, .08, 2000, 8000); }
  reloadStart()  { this.noise(.08, .1, 1200, 6000); this.tone(500, .05, 'square', .05, 0, .05); }
  press()        { this.tone(1800, .03, 'square', .05); }
  magOut()       { this.noise(.08, .1, 1500, 8000); this.tone(300, .06, 'triangle', .05); }
  seat()         { this.noise(.05, .18, 2500, 9000); this.tone(520, .05, 'square', .08); }
  rack()         { this.noise(.07, .14, 2000, 9000); this.tone(900, .04, 'square', .05, 600); }
  snap()         { this.noise(.05, .2, 3000, 10000); this.tone(1200, .04, 'square', .07); }
  tink()         { this.tone(3200, .05, 'triangle', .035); }
  reload()       { this.noise(.06, .12, 1500, 7000); this.tone(700, .04, 'square', .07, 0, .06); this.tone(420, .05, 'square', .06, 0, .14); }
  charge()       { this.tone(500, .9, 'sine', .035, 1400); }
  lock()         { this.tone(1760, .07, 'square', .05); this.tone(1760, .07, 'square', .05, 0, .1); }
  thud()         { this.tone(140, .08, 'square', .1, 70); this.noise(.06, .1, 400, 3000); }
  glitch()       { for (let i = 0; i < 6; i++) this.tone(300 + Math.random() * 2400, .03, 'square', .07, 0, i * .022); this.noise(.14, .16, 2000, 12000); }
  beep(v = .05)  { this.tone(988, .09, 'sine', v); }                       // 심전도 한 박
  chime()        { this.tone(659, .5, 'sine', .07); this.tone(523, .7, 'sine', .07, 0, .32); }   // 방송 딩동
  sheet()        { this.noise(.7, .07, 600, 4000); }                       // 이불 스치는 소리
  wince()        { this.tone(180, .2, 'sine', .08, 120); this.noise(.12, .06, 1500, 6000); }
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
  /* 심전도가 끊긴 소리 — 길게 이어지는 삐— */
  flat(on) {
    this.loop('flat', on, c => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 988;
      g.gain.value = .0001; g.gain.setTargetAtTime(.04, c.currentTime, .05);
      o.connect(g).connect(this.master); o.start();
      return { g, nodes: [o] };
    });
  }
  stopAll() { ['alarm', 'hum', 'flat'].forEach(n => this.loop(n, false)); this.bgm(false); }
  /* 탈출 브금 — 복도 추격 (escape_bgm.js, The Firebird 하이라이트 편집). 경보와 함께 처음부터 흐르고,
     넘어져 늦어지면 가장 센 ②~③ 구간만 반복합니다. at : 몇 초 지점부터 */
  loadBgm() {
    if (this.bgmBuf || this.bgmLoading || typeof ESCAPE_BGM_B64 === 'undefined') return;
    const c = this.ctx(); if (!c) return;
    this.bgmLoading = true;
    const bin = atob(ESCAPE_BGM_B64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    c.decodeAudioData(u8.buffer, buf => {
      this.bgmBuf = buf; this.bgmLoading = false;
      if (this.bgmWant) this.bgm(true, this.bgmAt + (c.currentTime - this.bgmAsk));   // 디코딩을 기다린 만큼 앞으로
    }, () => { this.bgmLoading = false; });
  }
  bgm(on, at = 0) {
    const c = this.ctx(); if (!c) return;
    if (!on) {
      this.bgmWant = false;
      const n = this.bgmNode; this.bgmNode = null;
      if (n) { try { n.g.gain.cancelScheduledValues(c.currentTime); n.g.gain.setTargetAtTime(.0001, c.currentTime, .35); n.src.stop(c.currentTime + 1.8); } catch (e) { /* 이미 멈춤 */ } }
      return;
    }
    if (this.bgmNode) return;
    if (!this.bgmBuf) { this.bgmWant = true; this.bgmAt = at; this.bgmAsk = c.currentTime; this.loadBgm(); return; }
    this.bgmWant = false;
    const src = c.createBufferSource(), g = c.createGain(), t = c.currentTime;
    src.buffer = this.bgmBuf; src.loop = true;
    src.loopStart = ESC_BGM.loop0; src.loopEnd = Math.min(ESC_BGM.loop1, this.bgmBuf.duration);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(ESC_BGM.vol, t + (at > 0 ? .6 : .08));
    src.connect(g).connect(this.master);
    src.start(t, at < src.loopEnd ? at : ESC_BGM.loop0);
    this.bgmNode = { src, g };
  }
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
/* 모퉁이 — corridor3d.js 의 길. [s, 방향(+1 오른쪽 · −1 왼쪽)] (실사 복도가 없으면 곧은 복도라 없음) */
const CORNERS = () => (window.Corr3DPath ? window.Corr3DPath.CORNERS : []);
function mkObs(type, z, lanes) { return { type, z, lanes, ...OBS[type], done: false, hit: false }; }

function genObstacles() {
  const list = [mkObs('barrier', 42, ALL), mkObs('pipe', 82, ALL), mkObs('cart', 120, [0])];
  let z = 152;
  while (z < RUN_LEN - 34) {
    if (z > GUN_Z - 16 && z < ZONE1 + 6) { z = ZONE1 + 8; continue; }   // 총격전 구간은 따로
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
  // 총격전 구간 — 경비원 몇은 카트 뒤에 숨어 있습니다 (카트는 피해야 하고)
  GUARDS.forEach(([gz, lane, cover]) => { if (cover) list.push(mkObs('cart', gz - 1.6, [lane])); });
  list.push(mkObs('pipe', 372, ALL), mkObs('barrier', 418, ALL));
  return list.filter(o => !CORNERS().some(([S]) => o.z + o.d > S - 12 && o.z < S + 4 + 8));   // 모퉁이 앞뒤는 비움 (꺾는 데 집중)
}

/* 경비원 — [z, 칸, 엄폐물 뒤인지] */
const GUARDS = [[318, 0, false], [334, -1, true], [350, 1, false], [366, 0, true],
                [384, -1, false], [398, 1, true], [412, 0, false], [430, -1, true], [442, 1, false]];
function genGuards() {
  return GUARDS.map(([z, lane, cover]) => ({ z, x: lane * LANE, cover, hp: 2, st: 'wait', t: 0, lockX: 0, flash: 0, hitT: 0 }));
}

/* 지나가며 들려오는 목소리 · 혼잣말 — [z, 대사, 누구] */
const RUN_LINES = [
  [8,   '달려.', 'me'],
  [60,  '어디 가요, 07.', 'doc'],
  [136, '잡았어요. 진정제 준비.', 'cold'],             // ── 여기서부터 사실은 이미 붙잡혀 침대 위
  [156, '…바닥이 물렁하다.', 'me'],
  [180, '거긴 출구가 아니에요.', 'doc'],
  [208, '용량 올려.', 'cold'],
  [230, '쉬이… 괜찮아요. 꿈에선 마음껏 달려도 돼요.', 'doc'],
  [262, '…벽지가 누렇다.', 'me'],
  [GUN_Z - 6, '…총?', 'me'],
  [ZONE0 + 4, '경비원들이다.', 'me'],
  [ZONE0 + 40, '쏘지 말아요. 그 사람들도 꿈이에요.', 'doc'],
  [ZONE1 + 56, '…이 복도, 이렇게 길었나.', 'me'],   // 빈 총 대사가 충분히 읽힌 뒤
  [520, '돌아와요. 아직 안 끝났어요.', 'doc'],
  [560, '…빛이다.', 'me']
];

/* 현실이 끼어드는 순간 — [z, 프레임, 몇 번째].  실험실이 백룸으로 바뀌기 시작할 즈음,
   몇 프레임씩 침대 위로 돌아갑니다: 누운 채 올려다본 천장, 들여다보는 방호복.
   달리고 있는 건 꿈속이고, 몸은 진작 붙잡혀 진정제를 맞고 있습니다 (세 번째엔 바늘). */
const REAL = [[134, 5, 0], [168, 8, 1], [206, 14, 2], [248, 6, 3]];

/* ═════════════ 깨어남 — 침대에서 비상구까지 ═══════════════════════
   엔딩의 마지막에 눈을 뜬 그 자리, 엔딩에서 밖에서 내려다본 바로 그 실험실을
   이번엔 07 의 눈으로 봅니다. 한 걸음마다 SPACE(터치는 톡) — 걷기는 W / ↑ 를
   누르고 있기(터치는 누르고 있기). 던전에서 본 것들이 무엇이었는지 하나씩 짚고,
   방송이 점점 급해지며 복도의 비상구 앞(DoorState)으로 이어집니다.

     ceil   누운 채 천장 — 격자 조명, 심전도 삐 소리, 방송
     sit    몸을 일으킴 — 텅 빈 관찰창, 아직 김이 오르는 커피
     wires  전극 네 가닥을 하나씩 뗌 → 심전도가 끊김
     iv     링거를 뽑음
     stand  일어섬 — 어지러움
     walk   방을 가로질러 문까지 (누르고 있기)
     hall   복도 — 비상구까지 (누르고 있기)

   방은 입체(labroom.js, WebGL) — 엔딩과 같은 배치. 일어선 뒤엔 방 안을 자유롭게
   걸어 다니고(WASD · 드래그 / ← →, 터치는 왼쪽 끌기 걷기 · 오른쪽 끌기 둘러보기),
   다가가는 것마다 혼잣말이 나오며, 문 앞에서 SPACE 로 나갑니다. */
/* 방은 labroom.js (WebGL) — 엔딩과 같은 배치의 입체 실험실을 화면 해상도로 그립니다.
   WebGL 이 안 되는 기기에선 이 장면을 건너뛰고 복도부터 시작합니다. */
const WAKE_HALL0 = -19;                                  // 복도에서 걷기 시작하는 자리 (비상구 앞까지 약 16m)
const HP = Math.PI / 2;
/* 카메라 자세 — 엔딩에서 누워 있던 그 자리 (머리는 왼쪽, 발은 오른쪽 +x) */
const CAM_LIE  = { x: -1.24, y: .98, z: 5.8, yaw: HP, pitch: 1.25, roll: 0 };
const CAM_SIT  = { x: -1.02, y: 1.36, z: 5.8, yaw: HP, pitch: -.42, roll: 0 };
const CAM_STAND = { x: -.6, y: 1.62, z: 4.55, yaw: -1.0, pitch: -.04, roll: 0 };
const GLANCE = { yaw: .5, pitch: .14 };                 // 앉은 채 고개를 돌려 관찰창 쪽으로
const lerpA = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
const camLerp = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k), yaw: lerpA(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), roll: lerp(a.roll || 0, b.roll || 0, k) });
/* 돌아다니며 다가가면 — 던전에서 본 것이 무엇이었는지 */
const ROAM_SPOTS = [
  { at: [-2.75, 6.55], r: 1.9, lines: [['골격 모형. …해골은 이거였다.', 'me']] },
  { at: [-3.16, 6.95], r: 1.7, lines: [['잠금장치에 초록 불.', 'me'], ['열쇠는… 키카드였다.', 'me']] },
  { at: [.4, .2], r: 2.0, lines: [['피험자 07. 세션 141, 각성 0.', 'me'], ['…각성 1.', 'me']] },
  { at: [3.6, .2], r: 1.8, lines: [['붉은 배양액. 링거와 같은 색.', 'me']] },
  { at: [3.4, 6.6], r: 1.7, lines: [['일자로 그어진 선. 여기선 나는 이미 죽어 있다.', 'me']] },
  { at: [.15, 6.6], r: 1.8, lines: [['빈 의자. 식어 가는 커피.', 'me']] }
];
const DOOR_AT = [-3.85, 6.9];

const WakeState = {
  enter(s) {
    if (!s.lab) { try { s.lab = window.LabRoom ? new LabRoom() : null; } catch (e) { s.lab = null; } }
    s.wk = 'ceil'; s.wt = 0; s.prompt = null;
    s.wires = 4; s.wirePull = [0, 0, 0, 0]; s.ivOut = false; s.ivT = 0;
    s.sitK = 0; s.rise = 0; s.glance = 0; s.dizzy = 0; s.fade = 0; s.saidW = 0; s.doorSlide = 0; s.roamT = 0;
    s.view = 'fwd'; s.alarm = 0; s.lights = .55; s.doorOpen = .06; s.x = 0; s.lane = 0;
    s.lookDX = 0; s.lookDY = 0; s.stick = [0, 0]; s.spotSaid = ROAM_SPOTS.map(() => 0); s.stepAcc = 0;
    s.cam = { ...CAM_LIE };
    s.sfx.hum(true); s.sfx.humVol(.25);
    s.fromWake = true;
    if (!s.lab || !s.lab.ok) { s.lab = null; s.wk = 'hall'; s.z = WAKE_HALL0; }   // WebGL 이 없으면 복도부터
  },
  act(s, a) {
    if (!s.prompt || s.prompt.hold || s.prompt.age < 18 || (a !== 'ok' && a !== 'jump')) return;
    const k = s.prompt.key; s.prompt = null;
    s.sfx.pick();
    if (k === 'sit')   { s.wk = 'sit'; s.wt = 0; s.sfx.sheet(); }
    if (k === 'wire')  { const i = s.wirePull.findIndex(v => v === 0); s.wirePull[i] = .01; s.sfx.snap(); s.shake = 2; }
    if (k === 'iv')    { s.ivOut = true; s.ivT = 0; s.sfx.wince(); s.shake = 4; s.flash = .5; s.wt = 0; }
    if (k === 'stand') { s.wk = 'stand'; s.wt = 0; s.sfx.sheet(); }
    if (k === 'door')  { s.wk = 'leave'; s.wt = 0; s.sfx.door(); }
  },
  ask(s, key, text, hold = false, keyLabel = null) { s.prompt = { key, text, hold, age: 0, keyLabel }; },
  update(s) {
    const t = ++s.wt, held = s.held && s.held.size > 0;
    if (s.prompt) s.prompt.age++;
    s.bob += .01;
    const per = 54 - (4 - s.wires) * 8;                // 심전도 — 전극이 붙어 있는 동안 한 박씩
    if (s.wires > 0 && s.frame % per === 0 && s.wk !== 'hall') s.sfx.beep(.05);

    if (s.wk === 'ceil') {
      if (t === 100) s.say('…천장.', 'me', 150);
      if (t === 260) s.say('격자 조명. 우물 입구가 아니다.', 'me', 190);
      if (t === 470) s.sfx.chime();
      if (t === 500) s.say('07번 피험자, 의식 회복. 담당 연구원은 관찰실로 복귀 바랍니다.', 'pa', 300, 1.6);
      if (t === 720) WakeState.ask(s, 'sit', '몸을 일으킨다');
    }
    else if (s.wk === 'sit') {
      s.sitK = ease(t / 100);
      // 커피 대사 동안 고개를 돌려 관찰창 쪽을 봤다가 다시 무릎으로
      s.glance = t < 250 ? 0 : t < 330 ? ease((t - 250) / 80) : t < 520 ? 1 : t < 600 ? 1 - ease((t - 520) / 80) : 0;
      if (t === 120) s.say('…아무도 없다.', 'me', 150);
      if (t === 300) s.say('관찰창 너머, 아직 김이 오르는 커피 한 잔.', 'me', 200);
      if (t === 470) s.say('방금까지 누군가 있었다.', 'me', 170);
      if (t === 640) { s.wk = 'wires'; s.wt = 0; WakeState.ask(s, 'wire', '전극을 뗀다  (4)'); }
    }
    else if (s.wk === 'wires') {
      s.wirePull.forEach((v, i) => { if (v > 0 && v < 1) s.wirePull[i] = Math.min(1, v + .05); });
      const pulled = s.wirePull.filter(v => v > 0).length;
      if (pulled !== 4 - s.wires) {
        s.wires = 4 - pulled;
        if (s.wires === 3) s.say('…선이 네 가닥.', 'me', 140);
        if (s.wires === 0) { s.sfx.flat(true); s.flash = .3; s.wt = 0; }
        else WakeState.ask(s, 'wire', `전극을 뗀다  (${s.wires})`);
      }
      if (s.wires === 0) {
        if (t === 40) s.say('청 · 적 · 황 · 백.', 'me', 150);
        if (t === 200) s.say('던전을 물들인 색은, 이 선의 색이었다.', 'me', 210);
        if (t === 300) s.sfx.chime();
        if (t === 330) s.say('07번 생체 신호 소실. 관찰실, 확인 바랍니다.', 'pa', 240, 1.6);
        if (t === 420) { s.wk = 'iv'; s.wt = 0; WakeState.ask(s, 'iv', '링거를 뽑는다'); }
      }
    }
    else if (s.wk === 'iv') {
      if (s.ivOut) {
        s.ivT++;
        if (s.wt === 30) s.say('붉은 방울. …던전의 피는 이거였다.', 'me', 200);
        if (s.wt === 240) WakeState.ask(s, 'stand', '일어선다');
      }
    }
    else if (s.wk === 'stand') {
      s.rise = ease(t / 110); s.ivT++;
      s.dizzy = t < 220 ? Math.sin(Math.min(1, t / 40) * HP) * (1 - Math.max(0, t - 140) / 80) : 0;
      if (t === 30) s.sfx.flat(false);
      if (t === 80) s.say('다리가 남의 것 같다.', 'me', 150);
      if (t === 240) s.say('백마흔한 번을 누워 있었으니까.', 'me', 180);
      if (t === 380) {
        s.wk = 'roam'; s.wt = 0;
        s.cam = { ...CAM_STAND };
        WakeState.ask(s, 'roam', '걷기 · 둘러보기 · 문을 찾는다', true, s.touch ? '왼쪽 끌기 · 오른쪽 끌기' : 'WASD · 드래그 / ← →');
      }
    }
    else if (s.wk === 'roam') WakeState.roam(s, t);
    else if (s.wk === 'leave') {                       // 문이 열리고 — 어두운 복도로
      s.doorSlide = Math.min(1, s.doorSlide + .02);
      const tgt = { x: DOOR_AT[0], y: 1.62, z: 6.4, yaw: 0, pitch: -.02, roll: 0 };
      s.cam = camLerp(s.cam, tgt, .06);
      if (s.doorSlide >= 1) { s.fade = Math.min(1, s.fade + .04); if (s.fade >= 1) { s.wk = 'hall'; s.wt = 0; s.z = WAKE_HALL0; s.sfx.humVol(.5); } }
    }
    else if (s.wk === 'hall') {
      s.fade = Math.max(0, s.fade - .04);
      if (t === 20) WakeState.ask(s, 'hall', '걷는다', true);
      if (s.held.has('KeyW') || s.held.has('ArrowUp') || s.held.has('ptr') || s.held.has('touch')) {
        if (s.fade < .5) { s.z = Math.min(START_Z, s.z + .034); s.bob += .09; if (s.frame % 24 === 0) s.sfx.step(.1); if (s.prompt) s.prompt = null; }
      } else s.bob += .01;
      const H_LINES = [[WAKE_HALL0 + 3, '…발소리. 아직 멀다.', 'me'], [-8, '복도 끝에 초록 불빛.', 'me']];
      H_LINES.forEach(([at, txt, who], i) => {
        if (s.z >= at && !(s.saidW & (1 << (8 + i)))) { s.saidW |= 1 << (8 + i); s.say(txt, who, 170); if (i === 0) s.sfx.chase(.05); }
      });
      if (s.z >= START_Z) s.go('door');
    }
    // 앉기 · 일어서기 동안의 카메라 (돌아다닐 땐 roam 이 직접 움직임)
    if (s.wk === 'ceil' || s.wk === 'sit' || s.wk === 'wires' || s.wk === 'iv' || s.wk === 'stand') {
      let c = camLerp(CAM_LIE, CAM_SIT, s.sitK);
      if (s.glance > 0) c = camLerp(c, { ...c, yaw: GLANCE.yaw, pitch: GLANCE.pitch }, s.glance);
      c = camLerp(c, CAM_STAND, s.rise);
      c.roll = Math.sin(s.frame * .07) * .08 * s.dizzy;
      c.y += Math.sin(s.bob * 2) * .004;
      s.cam = c;
    }
  },
  /* 방 안을 자유롭게 — 걷기(벽 · 가구에 막힘) · 둘러보기 · 다가가면 혼잣말 · 문 앞에서 열기 */
  roam(s, t) {
    const H = s.held, c = s.cam;
    let fw = 0, st = 0, turn = 0, tilt = 0;
    if (H.has('KeyW') || H.has('ArrowUp')) fw += 1;
    if (H.has('KeyS') || H.has('ArrowDown')) fw -= 1;
    if (H.has('KeyA')) st -= 1;
    if (H.has('KeyD')) st += 1;
    if (H.has('ArrowLeft')) turn -= 1;
    if (H.has('ArrowRight')) turn += 1;
    fw += -s.stick[1]; st += s.stick[0];                // 터치 — 왼쪽 끌기
    c.yaw += turn * .032 + s.lookDX * .0045; c.pitch = Math.max(-.85, Math.min(.85, c.pitch - s.lookDY * .0045 + tilt));
    s.lookDX = 0; s.lookDY = 0;
    const ml = Math.hypot(fw, st);
    if (ml > .05) {
      const k = Math.min(1, ml), sp = .03 * k / ml;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      const ox = c.x, oz = c.z;
      [c.x, c.z] = LabRoom.collide(c.x + (fx * fw + fz * st) * sp, c.z + (fz * fw - fx * st) * sp);
      const moved = Math.hypot(c.x - ox, c.z - oz);
      s.bob += moved * 9; s.stepAcc += moved;
      if (s.stepAcc > .62) { s.stepAcc = 0; s.sfx.step(.08); }
      if (s.prompt && s.prompt.key === 'roam' && s.prompt.age > 40) s.prompt = null;
    }
    c.y = 1.62 + Math.sin(s.bob * 2) * .022;
    c.roll = Math.sin(s.bob) * .006;
    // 다가가면 혼잣말 (하나씩 차례로)
    ROAM_SPOTS.forEach((sp, i) => {
      if (s.spotSaid[i] >= sp.lines.length || s.busyT > 0) return;
      if (Math.hypot(c.x - sp.at[0], c.z - sp.at[1]) < sp.r) {
        const [txt, who] = sp.lines[s.spotSaid[i]++]; s.say(txt, who, 180); s.busyT = 150;
      }
    });
    if (s.busyT > 0) s.busyT--;
    s.roamT++;
    if (s.roamT === 900) { s.sfx.chime(); s.say('관찰실 응답 없음. 보안 요원, B동 3층으로.', 'pa', 260, 1.6); }
    if (s.roamT === 2400) s.say('…문. 왼쪽 끝, 잠금장치에 초록 불.', 'me', 200);
    // 문 앞 — 열기
    const dd = Math.hypot(c.x - DOOR_AT[0], c.z - DOOR_AT[1]);
    if (dd < 1.45 && (!s.prompt || s.prompt.key === 'roam')) WakeState.ask(s, 'door', '문을 연다', false, s.touch ? '톡' : 'SPACE');
    if (dd >= 1.6 && s.prompt && s.prompt.key === 'door') s.prompt = null;
  },
  /* 방 장면은 화면 해상도로 — labroom.js 의 WebGL 그림 */
  hiRes(s) {
    if (s.wk === 'hall' || !s.lab) return null;
    const sitting = s.wk === 'ceil' || s.wk === 'sit' || s.wk === 'wires' || s.wk === 'iv' || s.wk === 'stand';
    const cam = { ...s.cam };
    if (s.shake > .3) { cam.yaw += (Math.random() - .5) * s.shake * .004; cam.pitch += (Math.random() - .5) * s.shake * .004; }
    const body = sitting && s.rise < .985 ? LabRoomGeo.bodyPose(s.cam, s.rise, s.sitK) : null;
    return s.lab.render({ cam, t: s.frame, wires: s.wires, wirePull: s.wirePull, ivOut: s.ivOut, ivT: s.ivT,
                          rise: s.rise, sit: sitting, doorSlide: s.doorSlide, body, dim: 1 });
  },
  /* 화면 해상도 위에 얹는 것 — 어지러움 · 눈꺼풀 · 붉은 번쩍 · 암전 */
  drawOver(s, c, img) {
    if (s.dizzy > .02) { c.save(); c.globalAlpha = .34 * s.dizzy; c.drawImage(img, Math.sin(s.frame * .07) * 18 * s.dizzy, 0, W, H); c.restore(); }
    if (s.wk === 'ceil') {
      const t = s.wt;
      let o = ease(t / 140);
      if (t > 150 && t < 166) o = 1 - Math.sin((t - 150) / 16 * Math.PI) * .9;
      if (t > 300 && t < 312) o = 1 - Math.sin((t - 300) / 12 * Math.PI) * .7;
      if (o < 1) { c.fillStyle = '#000'; const lid = (1 - o) * H / 2; c.fillRect(0, 0, W, lid); c.fillRect(0, H - lid, W, lid); }
      if (t < 200) { c.fillStyle = `rgba(0,0,0,${.35 * (1 - t / 200)})`; c.fillRect(0, 0, W, H); }
    }
    if (s.flash > .02) { c.fillStyle = `rgba(255,60,50,${s.flash * .3})`; c.fillRect(0, 0, W, H); }
    if (s.fade > 0) { c.fillStyle = `rgba(0,0,0,${s.fade})`; c.fillRect(0, 0, W, H); }
  },
  draw(s, b) {                                        // 복도 (기존 픽셀 그림)
    drawWorld(s, b);
    if (s.fade > 0) { b.fillStyle = `rgba(0,0,0,${s.fade})`; b.fillRect(0, 0, LW, LH); }
  }
};

/* 한 박자 넘기기 안내 — 화면 아래 가운데, 천천히 깜빡임 */
function drawPrompt(s, c) {
  const p = s.prompt;
  if (!p || s.stateName !== 'wake') return;
  const a = Math.min(1, p.age / 20) * (.65 + .35 * Math.sin(s.frame * .08));
  const key = p.keyLabel || (p.hold ? (s.touch ? '누르고 있기' : 'W / ↑ 누르고 있기') : (s.touch ? '톡' : 'SPACE'));
  c.save();
  c.globalAlpha = a;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `15px ${MONO}`;
  const kw = c.measureText(key).width + 18;
  c.font = `19px ${MONO}`;
  const tw = c.measureText(p.text).width;
  const total = kw + 12 + tw, x0 = W / 2 - total / 2, y = H - 30;
  c.fillStyle = 'rgba(4,6,10,.72)'; c.fillRect(x0 - 14, y - 20, total + 28, 40);   // 밝은 담요 위에서도 읽히게
  c.strokeStyle = 'rgba(125,227,200,.8)'; c.lineWidth = 1.5;
  c.strokeRect(x0 + .5, y - 13.5, kw, 27);
  c.font = `15px ${MONO}`; c.fillStyle = '#7de3c8'; c.fillText(key, x0 + kw / 2, y + 1);
  c.font = `19px ${MONO}`; c.fillStyle = '#e6f1ff'; c.textAlign = 'left'; c.fillText(p.text, x0 + kw + 12, y + 1);
  c.restore();
}

/* ═════════════ 상태들 ════════════════════════════════════ */
const DoorState = {
  enter(s) {
    s.z = START_Z; s.x = 0; s.lane = 0; s.view = 'fwd'; s.doorOpen = .06; s.alarm = 0; s.lights = .55;
    s.sfx.hum(true); s.sfx.humVol(.5);
    s.choice = null;
  },
  update(s) {
    const t = s.t, w = s.fromWake;                       // 깨어남에서 걸어왔으면 눈은 이미 떠 있습니다
    if (!w && t === 50) s.say('…몸이 움직인다.', 'me', 150);
    if (t === (w ? 20 : 200)) s.say('비상구가 반쯤 열려 있다. 바깥에서 바람이 든다.', 'me', 190);
    if (t === (w ? 220 : 380)) s.say('…나갈까?', 'me', 9999);
    if (t === (w ? 260 : 420)) s.choose(['탈출한다', '안 한다'], i => s.go(i === 0 ? 'open' : 'stay'));
    s.bob += .012;
  },
  draw(s, b) {
    drawWorld(s, b);
    if (s.fromWake) return;
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
    if (t === 24) { s.alarm = 1; s.lights = 1; s.sfx.alarm(true); s.sfx.humVol(1); s.sfx.bgm(true); s.shake = 6; s.say('…경보.', 'me', 80); }
    if (t === 76) { s.view = 'back'; s.sfx.chase(.18); s.shake = 4; }      // 휙 돌아봅니다
    if (t === 82) s.say('노란 방호복. 얼굴이 있어야 할 자리가 새까맣다.', 'me', 110);
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
    updateGun(s);
    tickGunBits(s);
    // 진행하며 들리는 말
    RUN_LINES.forEach(([z, txt, who], i) => { if (!(s.saidMask & (1 << i)) && s.z >= z) { s.saidMask |= 1 << i; s.say(txt, who, who === 'doc' ? 130 : 110); } });
    // 모퉁이 — 다가가면 안내, 제때 꺾지 않으면 바깥 벽에 부딪힘 (실사 복도에서만)
    s.turnK = -1;
    if (s.mode3d) CORNERS().forEach(([S, sg], i) => {
      if (s.turnDone & (1 << i)) return;
      if (s.z >= S + 1.6) {
        s.turnDone |= 1 << i; s.stumble = 70; s.immune = 40; s.shake = 16; s.flash = .8; s.sfx.hit();
        s.say(['…벽!', '꺾었어야 했다.', '어깨가 벽에 부딪힌다.'][i % 3], 'me', 70);
      } else if (s.z >= S - 16 && s.turnK < 0) s.turnK = i;
    });
    REAL.forEach(([z, dur, k], i) => {
      if (!(s.realMask & (1 << i)) && s.z >= z) { s.realMask |= 1 << i; s.realT = dur; s.realDur = dur; s.realK = k; s.sfx.glitch(); s.sfx.beep(.09); if (k === 2) s.sfx.inject(); }
    });
    if (s.realT > 0) s.realT--;
    if (theme(s.z) > .25 && s.runT % 52 === 0) s.sfx.beep(.012 + theme(s.z) * .02);    // 어딘가에서 심전도가 울립니다

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

/* ═════════════ 총격전 ═════════════════════════════════════
   총은 js/pistol.js 가 구운 픽셀 시트로 그립니다 — 대기 네 장(숨),
   탄을 다 쓰거나 R 을 누르면 장전 열두 장(탄창 배출 → 삽입 → 슬라이드).
   시트가 없으면(모듈을 안 불렀을 때) 장전은 시간만 흐릅니다. */
const PA = window.PistolArt || null;
const RELOAD_SPEED = .8;                       // 시연보다 조금 빠르게 — 달리는 중이니까
const RSEQ = PA ? PA.SEQ.map(([c, r, d, ev]) => [c, r, Math.max(3, Math.round(d * RELOAD_SPEED)), ev]) : [[0, 0, 70, null]];
const RELOAD_LEN = RSEQ.reduce((a, q) => a + q[2], 0);
/* 총의 자리 — 조준할 땐 조준 칸의 소실점(PA.AT.aim)이 화면 한가운데(조준점)에 오도록,
   장전할 땐 옆으로 눕힌 총이 다 보이도록 오른쪽 아래로 */
const AIM_DX = PA ? Math.round(LW / 2 - PA.AT.aim[0]) : LW - 134, AIM_DY = PA ? Math.round(LH / 2 - PA.AT.aim[1]) : LH - 92;
const GUN_DX = LW - 128 - 10, GUN_DY = LH - 96 + 4;

function startReload(s) {
  const G = s.gun;
  if (!G || G.reload > 0 || G.ammo >= MAG) return;
  G.reload = RELOAD_LEN; G.step = -1;
  s.sfx.reloadStart();
}
function tickReload(s) {
  const G = s.gun;
  if (G.reload <= 0) return;
  const el = RELOAD_LEN - G.reload;
  let acc = 0, i = 0;
  while (i < RSEQ.length - 1 && el >= acc + RSEQ[i][2]) { acc += RSEQ[i][2]; i++; }
  if (i !== G.step) { G.step = i; reloadEvent(s, RSEQ[i][3]); }
  if (--G.reload === 0) { G.ammo = MAG; G.step = -1; G.dy = 12; s.sfx.reload(); }
}
/* 장전 중의 순간들 — 탄창이 떨어지고, 탄피가 튀고, 톱니 빛이 흘러갑니다 */
function reloadEvent(s, ev) {
  const G = s.gun, gx = G.x, gy = G.y, A = PA ? PA.AT : null;
  switch (ev) {
    case 'cant': G.dy = 16; break;
    case 'press': s.sfx.press(); break;
    case 'release': s.sfx.magOut(); break;
    case 'drop': if (A) s.drops.push({ k: 'mag', x: gx + A.magDrop[0], y: gy + A.magDrop[1], vx: -.3, vy: .8 }); break;
    case 'bring': case 'grab': s.sfx.tink(); break;
    case 'seat': s.sfx.seat(); G.kick = -3; for (let i = 0; i < 6; i++) s.bits.push({ x: gx + (A ? A.seat[0] : 86) - 6 + Math.random() * 12, y: gy + (A ? A.seat[1] : 79), vx: (Math.random() - .5) * 1.2, vy: -Math.random(), life: 16, c: i % 2 ? '#7b8696' : '#00ffd5' }); break;
    case 'pull': s.sfx.rack(); break;
    case 'eject': if (A) s.drops.push({ k: 'case', x: gx + A.port[0], y: gy + A.port[1], vx: 1.3, vy: -2.2, f: 0 }); break;
    case 'snap': s.sfx.snap(); G.kick = 2;
      for (let i = 0; i < 14; i++) s.bits.push({ x: gx + (A ? A.serr[0] : 82) + Math.random() * 12, y: gy + (A ? A.serr[1] : 30) + Math.random() * 10, vx: 1.6 + Math.random() * 1.8, vy: 0, life: 12 + (Math.random() * 8 | 0), c: '#00ffd5', glow: true });
      break;
  }
}
function tickGunBits(s) {
  for (const d of s.drops) { d.vy += .25; d.x += d.vx; d.y += d.vy; if (d.f !== undefined) d.f++; }
  s.drops = s.drops.filter(d => d.y < LH + 20);
  for (const p of s.bits) { p.vy += p.glow ? 0 : .08; p.x += p.vx; p.y += p.vy; p.life--; }
  s.bits = s.bits.filter(p => p.life > 0);
}

function updateGun(s) {
  // 줍기 — 바닥에 떨어진 권총
  if (!s.gun && !s.gunDone && s.z >= GUN_Z) {
    s.gun = { ammo: MAG, reload: 0, step: -1, recoil: 0, flash: 0, tracer: null, dy: 18, kick: 0, side: 0, x: AIM_DX, y: AIM_DY };
    s.sfx.reload(); s.flash = 0;
    s.gunHint = 1;
  }
  if (s.gun) {
    const G = s.gun;
    if (G.recoil > 0) G.recoil *= .7;
    if (G.flash > 0) G.flash--;
    if (G.tracer && --G.tracer.t <= 0) G.tracer = null;
    G.dy *= .82; G.kick *= .7;
    G.side += ((G.reload > 0 && G.step >= 0 ? 1 : 0) - G.side) * .25;   // 조준 자리 ↔ 장전 자리
    tickReload(s);
    // 구간을 지나면 — 빈 총을 버립니다
    if (s.z >= ZONE1 + 8) { s.gun = null; s.gunDone = true; s.say('…철컥. 빈 총을 버린다.', 'me', 240, 5); s.sfx.empty(); }
  }
  // 경비원
  for (const g of s.guards) {
    const dz = g.z - s.z;
    if (g.flash > 0) g.flash--;
    if (g.hitT > 0) g.hitT--;
    if (g.st === 'gone') continue;
    if (g.st === 'die') { if (++g.t > 26) g.st = 'gone'; continue; }
    if (dz < 3) { g.st = 'gone'; continue; }                       // 지나쳤습니다
    if (g.st === 'wait') { if (dz < 34) { g.st = 'pop'; g.t = 0; } continue; }
    g.t++;
    if (g.st === 'pop' && g.t >= 20) { g.st = 'aim'; g.t = 0; s.sfx.charge(); }
    else if (g.st === 'aim') {
      if (g.t < LOCK_T) g.lockX = s.x;                              // 조준선이 따라옵니다
      if (g.t === LOCK_T) s.sfx.lock();                            // 고정 — 이제 비켜야 합니다
      if (g.t >= AIM_T) {
        g.st = 'cool'; g.t = 0; g.flash = 5;
        s.sfx.enemyShot();
        const dodged = Math.abs(s.x - g.lockX) > .55 || slideK(s) > .5;
        if (!dodged && s.immune <= 0) {
          s.stumble = 40; s.immune = 30; s.shake = 14; s.flash = .9; s.sfx.hit();
          if (!s.shotOnce) { s.shotOnce = true; s.say('맞았다— 조준선이 붉어지면 비켜야 해.', 'me', 120); }
        }
      }
    }
    else if (g.st === 'cool' && g.t >= 46) { g.st = 'aim'; g.t = 0; s.sfx.charge(); }
  }
}

/* 사격 — 버퍼 좌표 (bx, by) 를 겨눕니다. 가까운 것부터 맞습니다 */
function fireAt(s, bx, by) {
  const G = s.gun;
  if (!G || G.reload > 0) return;
  if (G.ammo <= 0) { s.sfx.empty(); startReload(s); return; }
  G.ammo--; G.recoil = 1; G.flash = 4;
  G.tracer = { x: bx, y: by, t: 4 };
  s.sfx.shot();
  if (G.ammo === 0) startReload(s);
  if (s.view === 'back') {                                         // 뒤의 그를 쏘면 — 잠깐 비틀거립니다
    const b = pursuerBox(s);
    if (b && bx > b.x0 && bx < b.x1 && by > b.y0 && by < b.y1) {
      s.dist = Math.min(22, s.dist + 2.4); s.chaseHit = 8; s.sfx.hit();
      if (!s.shotDoc) { s.shotDoc = true; s.say('…그래도 안 끝나요.', 'doc', 120); }
    }
    return;
  }
  const order = s.guards.filter(g => g.st === 'pop' || g.st === 'aim' || g.st === 'cool').sort((a, b) => a.z - b.z);
  for (const g of order) {
    const box = guardBox(s, g);
    if (!box || bx < box.x0 || bx > box.x1 || by < box.y0 || by > box.y1) continue;
    const head = by < box.headY;
    g.hp -= head ? 2 : 1; g.hitT = 6;
    if (g.hp <= 0) { g.st = 'die'; g.t = 0; s.sfx.glitch(); s.kills = (s.kills || 0) + 1; }
    else s.sfx.thud();
    return;
  }
}
function autoFire(s) {
  if (s.view === 'back') { const b = pursuerBox(s); if (b) fireAt(s, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); return; }
  const g = s.guards.filter(g => g.st === 'aim' || g.st === 'pop' || g.st === 'cool').sort((a, b) => a.z - b.z)[0];
  const box = g && guardBox(s, g);
  if (box) fireAt(s, (box.x0 + box.x1) / 2, (box.headY + box.y1) / 2); else fireAt(s, LW / 2, LH / 2);
}
/* 화면에서 경비원이 차지하는 칸 (맞았는지 판정용) */
function guardBox(s, g) {
  const dz = g.z - s.z;
  if (dz <= NEAR) return null;
  const a = P(s, g.x - .3, 1.86, dz), c = P(s, g.x + .3, g.cover ? 1.0 : 0, dz);
  return { x0: a[0], y0: a[1], x1: c[0], y1: c[1], headY: P(s, 0, 1.52, dz)[1] };
}
function pursuerBox(s) {
  const dz = Math.max(.32, s.dist), px = -s.chaseX;
  const a = P(s, px - .34, 1.86, dz), c = P(s, px + .34, 0, dz);
  return { x0: a[0], y0: a[1], x1: c[0], y1: c[1] };
}

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
    s.sfx.grab(); s.sfx.alarmVol(0); s.sfx.bgm(false);
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
  enter(s) { s.sfx.swell(); s.sfx.alarm(false); s.sfx.hum(false); s.sfx.bgm(false); s.subs = []; s.realT = 0; },
  update(s) {
    const t = s.t;
    if (t < 50) s.z += .12;
    if (t === 70 || t === 96 || t === 150) s.sfx.bird();
    if (t === 90) s.say('…밖이다.', 'me-dark', 150);
    if (t === 260) s.say('…들리세요?', 'far-dark', 140);
    // 빛이 걷히면 — 침대 위. 처음부터 어디로도 달린 적이 없었습니다
    if (t === 420) { s.sfx.beep(.1); s.realT = 9999; s.realDur = 200; s.realK = 3; }
    if (t === 450) s.say('진정됐어요. 맥박 정상.', 'cold', 140);
    if (t === 560) s.say('출구까지 갔네요. 이번엔.', 'doc', 150);
    if (t === 690) { s.sfx.beep(.1); s.say('SESSION 142 — 진행 중', 'sys', 9999); }
    if (t >= 800) s.finish('escaped');
  },
  draw(s, b) {
    drawWorld(s, b);
    const w = clamp01(s.t / 46);
    b.fillStyle = `rgba(255,252,240,${w})`; b.fillRect(0, 0, LW, LH);
    if (s.t > 380) { b.fillStyle = `rgba(0,0,0,${clamp01((s.t - 380) / 40)})`; b.fillRect(0, 0, LW, LH); }
  }
};

/* ═════════════ 그리기 ════════════════════════════════════ */
function theme(z) { return ease((z - 140) / 260); }

/* 카메라 기준 투영 — dz 는 앞으로의 거리, back 이면 좌우가 뒤집힙니다 */
function P(s, x, y, dz) {
  if (s.path3) {                                         // 실사 복도 — 꺾인 길 위의 자리를 그대로 투영
    const W3 = s.path3, cs = s.z + (W3.back ? -dz : dz), cx = W3.back ? -x : x;
    const p = W3.pos(cs, cx), dx = p[0] - W3.C[0], dzw = p[1] - W3.C[1];
    const vx = dx * W3.r[0] + dzw * W3.r[1], vz = Math.max(.05, dx * W3.h[0] + dzw * W3.h[1]), k = FOC / vz;
    return [s.cx + vx * k, s.cy - (y - s.camY) * k];
  }
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
  const C3 = !s.no3d && s.corr3d();
  if (C3) return drawWorld3D(s, b, back);                // 실사 복도 (corridor3d.js) — 픽셀은 위에 얹는 것만
  b.fillStyle = css(fog); b.fillRect(0, 0, LW, LH);

  b.save();
  const roll = (s.lane * LANE - s.x) * .045 * (back ? -1 : 1);
  b.translate(LW / 2, LH / 2); b.rotate(roll); b.translate(-LW / 2, -LH / 2);
  s.viewRoll = roll; s.shX = 0; s.shY = 0;                       // 3D 인물도 같은 기울기 · 흔들림으로
  if (s.shake > .3) { s.shX = (Math.random() - .5) * s.shake * .5; s.shY = (Math.random() - .5) * s.shake * .5; b.translate(s.shX, s.shY); }

  drawCorridor(s, b, back);
  if (!back) {
    drawEndWall(s, b);
    drawObstacles(s, b);
    drawDoorWall(s, b);
    drawChaseShadow(s, b);
    drawLasers(s, b);
  } else {
    drawPursuer(s, b);
  }
  b.restore();
  drawViewGun(s, b);

  // 위험할수록 가장자리가 붉게 조여 옵니다
  const dg = s.danger || 0;
  if (dg > .02) {
    const g = b.createRadialGradient(LW / 2, LH / 2, 40, LW / 2, LH / 2, LW * .62);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(150,0,0,${dg * .55 * (.75 + .25 * Math.sin(s.frame * .3))})`);
    b.fillStyle = g; b.fillRect(0, 0, LW, LH);
  }
  if (s.flash > .02) { b.fillStyle = `rgba(255,60,50,${s.flash * .35})`; b.fillRect(0, 0, LW, LH); }
}

/* 실사 복도 — 3D 는 draw() 에서 corridor3d.js 가 그리고, 여기선 그 위에 얹을 픽셀만 (조준선 · 섬광 ·
   그림자 · 문의 빛 · 손의 총 · 붉은 테두리). 사람은 s.figQ 로 모아 같은 깊이 버퍼에 넘깁니다 */
function drawWorld3D(s, b, back) {
  s.mode3d = true; s.shadows3d = [];
  const CP = window.Corr3DPath;
  if (CP) { const h0 = CP.headingAt(s.z), h = back ? [-h0[0], -h0[1]] : h0;
    s.path3 = { pos: CP.pathPos, back, C: CP.pathPos(s.z, s.x), h, r: [h[1], -h[0]] }; }
  b.save(); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, LW, LH); b.restore();
  b.save();
  const roll = (s.lane * LANE - s.x) * .045 * (back ? -1 : 1);
  b.translate(LW / 2, LH / 2); b.rotate(roll); b.translate(-LW / 2, -LH / 2);
  s.viewRoll = roll; s.shX = 0; s.shY = 0;
  if (s.shake > .3) { s.shX = (Math.random() - .5) * s.shake * .5; s.shY = (Math.random() - .5) * s.shake * .5; b.translate(s.shX, s.shY); }
  if (!back) {
    for (const g of s.guards || []) if (g.st !== 'gone' && g.st !== 'wait' && g.z - s.z > NEAR && g.z - s.z < VIEW) drawGuard(s, b, g);
    drawChaseShadow(s, b);
    drawLasers(s, b);
    // 빛 — 비상구의 녹색 EXIT, 복도 끝 바깥 문
    const glow = (wx, wy, wz, r0, col) => { const dz = wz - s.z; if (dz <= NEAR || dz > VIEW) return; const p = P(s, wx, wy, dz), r = Math.max(4, r0 * FOC / dz);
      b.save(); b.globalCompositeOperation = 'lighter'; const g = b.createRadialGradient(p[0], p[1], 1, p[0], p[1], r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = g; b.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); b.restore(); };
    glow(0, 2.48, 0, .7, `rgba(60,255,120,${.22 + .06 * Math.sin(s.frame * .05)})`);
    glow(0, 1.2, RUN_LEN, 2.6, 'rgba(255,248,220,.5)');
    if (!s.gun && !s.gunDone) glow(0, .05, GUN_Z, .5, `rgba(255,230,160,${.25 + .2 * Math.sin(s.frame * .2)})`);
  } else {
    drawPursuer(s, b);
  }
  b.restore();
  s.path3 = null;
  drawViewGun(s, b);
  const dg = s.danger || 0;
  if (dg > .02) {
    const g = b.createRadialGradient(LW / 2, LH / 2, 40, LW / 2, LH / 2, LW * .62);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(150,0,0,${dg * .55 * (.75 + .25 * Math.sin(s.frame * .3))})`);
    b.fillStyle = g; b.fillRect(0, 0, LW, LH);
  }
  if (s.flash > .02) { b.fillStyle = `rgba(255,60,50,${s.flash * .35})`; b.fillRect(0, 0, LW, LH); }
  s.view3d = { z: s.z, x: s.x, back, camY: s.camY, cx: s.cx * SC, cy: s.cy * SC, f: FOC * SC, roll, shx: s.shX * SC, shy: s.shY * SC,
               alarm: s.alarm, lights: s.lights, flick: s.flick, frame: s.frame, doorOpen: s.doorOpen, obs: s.obs,
               pickup: !back && !s.gun && !s.gunDone, figs: s.figQ, shadows: s.shadows3d };
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
    // 바닥 이음매 — 실험실에선 엔딩 바닥처럼 청회색 격자, 백룸으로 갈수록 옅어집니다
    const seam = P(s, -HW, 0, d0), seam2 = P(s, HW, 0, d0);
    const tbz = pal.tb || 0, gridA = (1 - tbz) * .55 * clamp01(1 - mid / 50);
    b.fillStyle = css(shade(s, [0, 0, 0], mid, z0), .25 * tbz);
    if (tbz > 0) b.fillRect(seam[0], seam[1], seam2[0] - seam[0], 1);
    if (gridA > .02) {
      b.fillStyle = `rgba(70,84,102,${gridA})`; b.fillRect(seam[0], seam[1], seam2[0] - seam[0], 1);
      b.strokeStyle = `rgba(70,84,102,${gridA})`; b.lineWidth = 1;
      b.beginPath();
      for (const gx of [-1.27, -.63, 0, .63, 1.27]) { const g0 = P(s, gx, 0, d0), g1 = P(s, gx, 0, d1); b.moveTo(g0[0], g0[1]); b.lineTo(g1[0], g1[1]); }
      b.stroke();
    }
    // 문 (실험실) · 어두운 옆 통로 (백룸)
    const h = hash(idx);
    if (h < .22 && idx > -20) {
      const side = h < .11 ? -HW : HW, a = .35, c = 1.55;
      const dd0 = back ? d1 - c : d0 + a, dd1 = back ? d1 - a : d0 + c;
      if (dd0 > NEAR) {
        const dark = (pal.tb || 0) > .5 ? [8, 7, 3] : LAB_DARK;
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
  const wc = css(shade(s, LAB_DOOR, dz, -1));
  const L = -.62, R = .62, T = 2.15;
  quad(b, [P(s, -HW, 0, dz), P(s, L, 0, dz), P(s, L, CH, dz), P(s, -HW, CH, dz)], wc);
  quad(b, [P(s, R, 0, dz), P(s, HW, 0, dz), P(s, HW, CH, dz), P(s, R, CH, dz)], wc);
  quad(b, [P(s, L, T, dz), P(s, R, T, dz), P(s, R, CH, dz), P(s, L, CH, dz)], wc);
  // 문짝 — 오른쪽으로 밀려 열립니다 (열린 만큼 문틀 안에서만 보임)
  const lx = L + s.doorOpen * (R - L);
  if (lx < R) {
    const d = css(shade(s, LAB_LEAF, dz, -1));
    quad(b, [P(s, lx, 0, dz), P(s, R, 0, dz), P(s, R, T, dz), P(s, lx, T, dz)], d);
    // 엔딩의 실험실 문처럼 — 아래쪽 황·흑 경고 띠
    const h0 = P(s, lx, .16, dz), h1 = P(s, R, .04, dz), hw = (h1[0] - h0[0]) / 8;
    for (let i = 0; i < 8; i++) {
      b.fillStyle = css(shade(s, i % 2 ? [227, 178, 60] : [21, 20, 27], dz, -1));
      b.fillRect(h0[0] + i * hw, h0[1], Math.ceil(hw), Math.max(1, h1[1] - h0[1]));
    }
    const w0 = Math.max(lx + .18, lx), win = P(s, w0, 1.85, dz), win2 = P(s, Math.min(R - .05, w0 + .3), 1.35, dz);
    if (win2[0] > win[0]) { b.fillStyle = css(shade(s, [11, 16, 24], dz, -1)); b.fillRect(win[0], win[1], win2[0] - win[0], win2[1] - win[1]); }
    const bar = P(s, lx + .05, 1.02, dz), bar2 = P(s, Math.min(R, lx + .9), .96, dz);
    b.fillStyle = css(shade(s, [142, 154, 168], dz, -1)); b.fillRect(bar[0], bar[1], Math.max(0, bar2[0] - bar[0]), Math.max(1, bar2[1] - bar[1]));
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
  // 경비원 · 바닥의 권총도 같은 깊이 순서로 섞어 그립니다
  (s.guards || []).forEach(g => { if (g.st !== 'gone' && g.st !== 'wait' && g.z - s.z > NEAR) vis.push({ guard: g, z: g.z }); });
  if (!s.gun && !s.gunDone && GUN_Z - s.z > NEAR && GUN_Z - s.z < VIEW) vis.push({ pickup: true, z: GUN_Z });
  vis.sort((a, c) => c.z - a.z);
  for (const o of vis) {
    if (o.guard) { drawGuard(s, b, o.guard); continue; }
    if (o.pickup) { drawPickup(s, b); continue; }
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

/* 경비원 — 실험실 보안. 청회색 제복 · 모자 챙 아래 바이저(평소 청록) · 출입증 · 황흑 경고 완장.
   겨눌 땐 바이저가 붉게 켜집니다 */
function drawGuard(s, b, g) {
  const dz = g.z - s.z, k = FOC / dz;
  const pop = g.st === 'pop' ? clamp01(g.t / 20) : 1;
  const pt = (x, y) => P(s, g.x + x, y, dz);
  if (g.st === 'die') {                                   // 코드처럼 깨져 흩어집니다
    const a = pt(-.3, 1.86), c = pt(.3, 0), h = c[1] - a[1], n = 7;
    for (let i = 0; i < n; i++) {
      if (hash(i * 31 + g.t * 7 + (g.z | 0)) < g.t / 30) continue;
      const off = (hash(i + g.t * 13) - .5) * g.t * 1.6;
      b.fillStyle = ['#2f6fb5', '#c2352c', '#7de3c8', '#e9e3d5'][(i + g.t) % 4];
      b.globalAlpha = 1 - g.t / 26;
      b.fillRect(a[0] + off, a[1] + h * i / n, c[0] - a[0], Math.max(1, h / n - 1));
    }
    b.globalAlpha = 1;
    return;
  }
  b.save();
  b.globalAlpha = pop;
  {                                           // 실사 3D — 발밑 그림자 · 총구 섬광만 픽셀로
    if (s.mode3d) s.shadows3d.push([g.x, g.z, .32]);
    else { const f0 = pt(-.26, 0), f1 = pt(.26, 0), rw = (f1[0] - f0[0]) / 2;
      b.fillStyle = 'rgba(0,0,0,.35)'; b.beginPath(); b.ellipse(f0[0] + rw, f0[1], Math.max(1, rw), Math.max(1, rw * .14), 0, 0, Math.PI * 2); b.fill(); }
    const X = g.x - s.camX, aiming = g.st === 'aim' || g.st === 'cool';
    const lit3 = g.st === 'aim' ? (g.t >= LOCK_T ? 1 : .5 + .3 * Math.sin(s.frame * .5)) : 0;
    g.aimK = lerp(g.aimK || 0, aiming ? 1 : 0, .2);
    if (figMark(s, b, { kind: 'guard', x: X, y: -s.camY, z: dz, yaw: Math.atan2(-X, dz) * .85, stride: 0, aim: g.aimK, lean: 0, cs: g.z, cx: g.x, yawK: .85,
                        alpha: pop, hit: g.hitT > 0 ? .85 : 0, band: lit3 > 0 ? [1, .25 - lit3 * .15, .2 - lit3 * .1] : [.42, .86, .76] },
                figEnv(s, dz, g.z, X))) {
      if (g.flash > 0) { const m = pt(.06, 1.36);
        b.globalCompositeOperation = 'lighter'; b.fillStyle = 'rgba(255,220,140,.9)';
        b.beginPath(); b.arc(m[0], m[1], Math.max(2, .16 * k), 0, Math.PI * 2); b.fill(); }
      b.restore(); return;
    }
  }
  // 실험실 보안 — 제복은 실험실 문 · 벽과 같은 청회색, 어깨는 한 단 밝게
  const uni = css(shade(s, g.hitT > 0 ? [240, 240, 255] : [58, 72, 94], dz, g.z));
  const uniL = css(shade(s, g.hitT > 0 ? [240, 240, 255] : [84, 100, 122], dz, g.z));
  const dark = css(shade(s, [22, 27, 36], dz, g.z));
  // 다리 · 몸통
  b.fillStyle = dark;
  [[-.16, -.04], [.04, .16]].forEach(([x0, x1]) => { const a = pt(x0, .9), c = pt(x1, 0); b.fillRect(a[0], a[1], c[0] - a[0], c[1] - a[1]); });
  quad(b, [pt(-.26, 1.5), pt(.26, 1.5), pt(.22, .86), pt(-.22, .86)], uni);
  quad(b, [pt(-.26, 1.5), pt(.26, 1.5), pt(.25, 1.43), pt(-.25, 1.43)], uniL);              // 어깨 덧댐
  const bl = pt(-.22, .96), bl2 = pt(.22, .91); b.fillStyle = dark; b.fillRect(bl[0], bl[1], bl2[0] - bl[0], Math.max(1, bl2[1] - bl[1]));   // 벨트
  if (k > 14) {                                                                              // 출입증 — 실험실 카드 (청록 띠)
    const id = pt(.06, 1.36), id2 = pt(.17, 1.22);
    b.fillStyle = css(shade(s, [226, 232, 236], dz, g.z)); b.fillRect(id[0], id[1], Math.max(1, id2[0] - id[0]), Math.max(1, id2[1] - id[1]));
    b.fillStyle = css(shade(s, [63, 183, 160], dz, g.z)); b.fillRect(id[0], id[1], Math.max(1, id2[0] - id[0]), Math.max(1, (id2[1] - id[1]) * .3));
  }
  // 총을 든 팔 — 가슴 앞으로 겨눕니다
  const aiming = g.st === 'aim' || g.st === 'cool';
  b.fillStyle = uni;
  const arm0 = pt(-.22, 1.36), arm1 = pt(.08, aiming ? 1.3 : 1.05);
  b.fillRect(arm0[0], arm0[1], arm1[0] - arm0[0], Math.max(1, .1 * k));
  for (let i = 0; i < 4; i++) {                                                              // 경고 완장 — 실험실 문의 황 · 흑 띠
    const a = pt(-.21 + i * .025, 1.36), c = pt(-.21 + (i + 1) * .025, 1.36);
    b.fillStyle = css(shade(s, i % 2 ? [21, 20, 27] : [227, 178, 60], dz, g.z));
    b.fillRect(a[0], a[1], Math.max(1, c[0] - a[0]), Math.max(1, .1 * k));
  }
  if (aiming) { b.fillStyle = dark; const gn = pt(.02, 1.36), gn2 = pt(.14, 1.28); b.fillRect(gn[0], gn[1], gn2[0] - gn[0], Math.max(1, gn2[1] - gn[1])); }
  // 머리 · 모자 · 바이저
  const hd = pt(0, 1.66);
  b.fillStyle = css(shade(s, [170, 150, 135], dz, g.z));
  b.beginPath(); b.arc(hd[0], hd[1], Math.max(1, .12 * k), 0, Math.PI * 2); b.fill();
  b.fillStyle = dark; const cap = pt(-.15, 1.86), cap2 = pt(.15, 1.74); b.fillRect(cap[0], cap[1], cap2[0] - cap[0], cap2[1] - cap[1]);
  const vz = pt(-.1, 1.7), vz2 = pt(.1, 1.64);
  const lit = g.st === 'aim' ? (g.t >= LOCK_T ? 1 : .5 + .3 * Math.sin(s.frame * .5)) : 0;
  // 평소엔 실험실 모니터 같은 청록, 겨누면 붉게
  b.fillStyle = lit > 0 ? `rgba(255,${60 - lit * 40},${50 - lit * 30},${.4 + lit * .6})` : 'rgba(110,220,195,.55)';
  b.fillRect(vz[0], vz[1], vz2[0] - vz[0], Math.max(1, vz2[1] - vz[1]));
  // 총구 섬광
  if (g.flash > 0) {
    const m = pt(.14, 1.32);
    b.globalCompositeOperation = 'lighter'; b.fillStyle = 'rgba(255,220,140,.9)';
    b.beginPath(); b.arc(m[0], m[1], Math.max(2, .16 * k), 0, Math.PI * 2); b.fill();
  }
  b.restore();
}
/* 경비원의 조준선 — 화면 앞쪽(내가 있던 자리)으로 뻗습니다. 고정되면 굵고 붉게 */
function drawLasers(s, b) {
  for (const g of s.guards || []) {
    if (g.st !== 'aim') continue;
    const dz = g.z - s.z; if (dz <= NEAR) continue;
    const m = P(s, g.x + .14, 1.32, dz), tgt = P(s, g.lockX, s.camY - .25, 1.1);
    const locked = g.t >= LOCK_T;
    b.strokeStyle = locked ? `rgba(255,40,30,${.75 + .25 * Math.sin(s.frame * .9)})` : `rgba(255,70,60,${.25 + g.t / AIM_T * .35})`;
    b.lineWidth = locked ? 2 : 1;
    b.beginPath(); b.moveTo(m[0], m[1]); b.lineTo(tgt[0], tgt[1]); b.stroke();
  }
}
/* 바닥에 떨어진 권총 — 깜빡이며 빛납니다 */
function drawPickup(s, b) {
  const dz = GUN_Z - s.z, a = P(s, -.18, .06, dz), c = P(s, .18, 0, dz);
  const gl = .5 + .5 * Math.sin(s.frame * .2);
  b.save(); b.globalCompositeOperation = 'lighter';
  const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, r = Math.max(4, (c[0] - a[0]) * 1.5);
  const g = b.createRadialGradient(mx, my, 1, mx, my, r);
  g.addColorStop(0, `rgba(255,230,160,${.35 + gl * .3})`); g.addColorStop(1, 'rgba(255,230,160,0)');
  b.fillStyle = g; b.fillRect(mx - r, my - r, r * 2, r * 2);
  b.restore();
  b.fillStyle = '#15161a'; b.fillRect(a[0], a[1] - 1, c[0] - a[0], Math.max(2, c[1] - a[1] + 1));
}
/* 손에 든 권총 — 픽셀 시트(js/pistol.js)에서 지금 칸을 잘라 오른쪽 아래에 찍습니다.
   겨누는 쪽으로 살짝 따라가고, 쏘면 튀고, 장전 중엔 장전 칸을 차례로. */
function drawViewGun(s, b) {
  const G = s.gun;
  // 떨어지는 탄창 · 탄피 · 불티는 총이 없어도 마저
  if (s.pistol) {
    const { sheet } = s.pistol;
    for (const d of s.drops) {
      const r = d.k === 'mag' ? PA.SPR_MAG : PA.SPR_CASE[(d.f >> 2) % 2];
      b.drawImage(sheet, r[0], r[1], r[2], r[3], Math.round(d.x), Math.round(d.y), r[2], r[3]);
    }
  }
  for (const p of s.bits) { b.globalAlpha = Math.min(1, p.life / 8); b.fillStyle = p.c; b.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
  b.globalAlpha = 1;
  if (!G || s.view !== 'fwd') return;
  const ax = (s.mx / SC - LW / 2) * .08, ay = (s.my / SC - LH / 2) * .05;
  const bx = AIM_DX + (GUN_DX - AIM_DX) * G.side, by = AIM_DY + (GUN_DY - AIM_DY) * G.side;
  G.x = Math.round(bx + ax + G.recoil * 3); G.y = Math.round(by + ay + G.recoil * 4 + G.dy + G.kick + Math.sin(s.bob * 2) * 1.2);
  if (!s.pistol) return;
  const { sheet, mask } = s.pistol, FW = PA.FW, FH = PA.FH;
  let col = 0, row = G.flash > 0 ? PA.FIRE_ROW : PA.IDLE_ROWS[Math.floor(s.frame / 18) % 4];   // 조준 — 숨 · 쏜 순간
  if (G.reload > 0 && G.step >= 0) { col = RSEQ[G.step][0]; row = RSEQ[G.step][1]; }
  b.drawImage(sheet, col * FW, row * FH, FW, FH, G.x, G.y, FW, FH);
  // 청록 빛번짐 — 마스크를 한 픽셀씩 비껴 네 번 더합니다
  b.save(); b.globalCompositeOperation = 'lighter'; b.globalAlpha = .28;
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => b.drawImage(mask, col * FW, row * FH, FW, FH, G.x + ox, G.y + oy, FW, FH));
  b.restore();
  // 총구 섬광 — 총구 앞으로
  const mz = col === 0 ? PA.AT.aimMuzzle : PA.AT.muzzle;
  const mx = G.x + mz[0], my = G.y + mz[1];
  if (G.flash > 0) {
    b.save(); b.globalCompositeOperation = 'lighter';
    const fs = col === 0 ? .6 : 1;                                       // 조준 칸은 총구가 멀어서 작게
    b.fillStyle = 'rgba(255,214,140,.95)'; b.beginPath(); b.arc(mx - 3, my, (6 + G.flash * 2) * fs, 0, Math.PI * 2); b.fill();
    b.fillStyle = 'rgba(0,255,213,.5)'; b.beginPath(); b.arc(mx - 4, my, (10 + G.flash * 3) * fs, 0, Math.PI * 2); b.fill();
    b.restore();
  }
  if (G.tracer) {                                                         // 총알 궤적
    b.strokeStyle = `rgba(255,236,190,${G.tracer.t / 4})`; b.lineWidth = 1;
    b.beginPath(); b.moveTo(mx, my); b.lineTo(G.tracer.x, G.tracer.y); b.stroke();
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

/* ═════════════ 방호복 — 박사 ═══════════════════════════════════
   노란 방호복 한 벌 : 부푼 어깨 · 자루 같은 바지(무릎에서 조임) · 후드 속 새까만
   얼굴창 · 검은 장갑과 장화 · 검은 벨트와 파우치 · 가슴의 바이오해저드 마크.
   얼굴은 끝까지 보이지 않습니다 — 얼굴창에 형광등이 스칠 때만 반짝입니다. */
/* 실험실에 맞춘 한 벌 — 노랑은 차가운 형광등 아래 바랜 카키빛, 장갑 · 장화 · 벨트는 실험실
   바닥과 같은 청회색, 손목 · 발목은 회색 밀봉 테이프, 가슴엔 B-07 출입증(청록 띠), 허리엔
   천장 급기선에 꽂던 공기 호스 연결구와 끊어진 노란 코일 호스 (BSL 양압복처럼) */
const SUIT = [190, 172, 96], SUIT_D = [120, 110, 72], SUIT_L = [224, 212, 150], SUIT_K = [30, 36, 48];
const SUIT_TAPE = [150, 160, 172], LAB_TEAL = [63, 183, 160], HAZ_Y = [227, 178, 60];
/* 바이오해저드 마크 — 고리 셋 + 가운데 고리. 작으면 점 하나 */
function bioMark(b, x, y, r, col) {
  b.fillStyle = col; b.strokeStyle = col;
  if (r < 2) { b.fillRect(x - .5, y - .5, 1, 1); return; }
  b.lineWidth = Math.max(.6, r * .26);
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
    b.beginPath(); b.arc(x + Math.cos(a) * r * .5, y + Math.sin(a) * r * .5, r * .48, a + .9, a + Math.PI * 2 - .9); b.stroke(); }
  b.beginPath(); b.arc(x, y, r * .34, 0, Math.PI * 2); b.stroke();
}
/* 방호복 사람 하나. pt(x, y) : 몸 기준 좌표(m) → 화면, k : 1m 의 화면 크기
   o : { run, arms:[[어깨x, 손x, 손y]...], hit, visor(얼굴창 불빛 0‥1 · 붉게), glint } */
function drawSuit(b, s, pt, k, dz, z, o) {
  const sh = c => css(shade(s, o.hit ? [240, 240, 255] : c, dz, z));
  const Y = sh(SUIT), YD = sh(SUIT_D), YL = sh(SUIT_L), K = sh(SUIT_K), TP = sh(SUIT_TAPE);
  const w = v => Math.max(1, v * k);
  b.lineCap = 'round'; b.lineJoin = 'round';
  // 다리 — 무릎까지 부푼 바지, 그 아래 검은 장화
  [[-.11, 1], [.11, -1]].forEach(([ox, sg]) => {
    const ph = (o.run || 0) * sg, swing = Math.sin(ph) * .2, lift = Math.max(0, Math.sin(ph)) * .16;
    const hip = pt(ox, .9), knee = pt(ox + swing * .55, .48 + lift * .5), foot = pt(ox + swing, .05 + lift);
    b.strokeStyle = YD; b.lineWidth = w(.2);
    b.beginPath(); b.moveTo(hip[0], hip[1]); b.lineTo(knee[0], knee[1]); b.stroke();
    b.strokeStyle = Y; b.lineWidth = w(.15);
    b.beginPath(); b.moveTo(hip[0], hip[1]); b.lineTo(knee[0], knee[1]); b.stroke();
    b.strokeStyle = K; b.lineWidth = w(.13);
    b.beginPath(); b.moveTo(knee[0], knee[1]); b.lineTo(foot[0], foot[1]); b.stroke();
    const tp = [lerp(knee[0], foot[0], .12), lerp(knee[1], foot[1], .12)], tp2 = [lerp(knee[0], foot[0], .26), lerp(knee[1], foot[1], .26)];
    b.strokeStyle = TP; b.lineWidth = w(.145); b.beginPath(); b.moveTo(tp[0], tp[1]); b.lineTo(tp2[0], tp2[1]); b.stroke();
    b.fillStyle = K; b.beginPath(); b.ellipse(foot[0], foot[1], w(.09), w(.045), 0, 0, Math.PI * 2); b.fill();
  });
  // 몸통 — 부푼 어깨에서 허리로, 옆은 어둡게 접힘
  quad(b, [pt(-.3, 1.5), pt(.3, 1.5), pt(.25, .86), pt(-.25, .86)], Y);
  quad(b, [pt(-.3, 1.5), pt(-.2, 1.5), pt(-.18, .86), pt(-.25, .86)], YD);
  quad(b, [pt(.22, 1.5), pt(.3, 1.5), pt(.25, .86), pt(.19, .86)], YD);
  if (k > 30) { b.strokeStyle = YD; b.lineWidth = Math.max(.6, .012 * k);
    [[-.12, 1.36, .02, 1.3], [.1, 1.2, -.04, 1.12], [-.08, 1.05, .08, 1.0]].forEach(([x0, y0, x1, y1]) => { const a = pt(x0, y0), c = pt(x1, y1); b.beginPath(); b.moveTo(a[0], a[1]); b.lineTo(c[0], c[1]); b.stroke(); }); }
  // 벨트 · 파우치
  const be = pt(-.26, .96), be2 = pt(.26, .9); b.fillStyle = K; b.fillRect(be[0], be[1], be2[0] - be[0], Math.max(1, be2[1] - be[1]));
  const bu = pt(-.03, .955), bu2 = pt(.03, .905); b.fillStyle = sh([70, 70, 74]); b.fillRect(bu[0], bu[1], Math.max(1, bu2[0] - bu[0]), Math.max(1, bu2[1] - bu[1]));
  const pu = pt(.15, .95), pu2 = pt(.25, .78); b.fillStyle = K; b.fillRect(pu[0], pu[1], Math.max(1, pu2[0] - pu[0]), Math.max(1, pu2[1] - pu[1]));
  // 가슴 — 바이오해저드 (청회색 판 위 경고 노랑) · 왼가슴 출입증
  const bp = pt(-.06, 1.38), bp2 = pt(.06, 1.22);
  b.fillStyle = K; b.fillRect(bp[0], bp[1], Math.max(1, bp2[0] - bp[0]), Math.max(1, bp2[1] - bp[1]));
  const bm = pt(0, 1.3); bioMark(b, bm[0], bm[1], .05 * k, sh(HAZ_Y));
  if (k > 14) {
    const id = pt(.1, 1.4), id2 = pt(.2, 1.27);
    b.fillStyle = sh([226, 232, 236]); b.fillRect(id[0], id[1], Math.max(1, id2[0] - id[0]), Math.max(1, id2[1] - id[1]));
    b.fillStyle = sh(LAB_TEAL); b.fillRect(id[0], id[1], Math.max(1, id2[0] - id[0]), Math.max(1, (id2[1] - id[1]) * .3));
    if (k > 60) { b.fillStyle = sh([40, 46, 56]); const t0 = pt(.115, 1.34), t1 = pt(.185, 1.33); b.fillRect(t0[0], t0[1], t1[0] - t0[0], Math.max(1, t1[1] - t0[1])); }
  }
  // 허리 — 공기 호스 연결구와 끊어진 노란 코일 호스
  const hc = pt(-.27, .98), hc2 = pt(-.19, .88);
  b.fillStyle = sh([70, 80, 96]); b.fillRect(hc[0], hc[1], Math.max(1, hc2[0] - hc[0]), Math.max(1, hc2[1] - hc[1]));
  if (k > 20) {
    b.strokeStyle = sh(HAZ_Y); b.lineWidth = Math.max(1, .022 * k); b.beginPath();
    for (let i = 0; i <= 28; i++) { const u = i / 28, sw = Math.sin((o.run || 0) * .5 + u * 3) * .05;
      const q = pt(-.25 - u * .1 + Math.cos(u * 22) * .035 + sw, .9 - u * .5 + Math.sin(u * 22) * .02); i ? b.lineTo(q[0], q[1]) : b.moveTo(q[0], q[1]); }
    b.stroke();
  }
  // 팔 — 부푼 소매, 검은 장갑
  (o.arms || []).forEach(([sx, hx, hy, open]) => {
    const s0 = pt(sx, 1.45), h = pt(hx, hy), el = pt(lerp(sx, hx, .45) + Math.sign(sx) * .06, lerp(1.45, hy, .5));
    b.strokeStyle = YD; b.lineWidth = w(.17);
    b.beginPath(); b.moveTo(s0[0], s0[1]); b.lineTo(el[0], el[1]); b.lineTo(h[0], h[1]); b.stroke();
    b.strokeStyle = Y; b.lineWidth = w(.12);
    b.beginPath(); b.moveTo(s0[0], s0[1]); b.lineTo(el[0], el[1]); b.lineTo(h[0], h[1]); b.stroke();
    const hr = Math.min(7, Math.max(1, .055 * k));
    const wt = [lerp(el[0], h[0], .72), lerp(el[1], h[1], .72)], wt2 = [lerp(el[0], h[0], .88), lerp(el[1], h[1], .88)];
    b.strokeStyle = TP; b.lineWidth = w(.13); b.beginPath(); b.moveTo(wt[0], wt[1]); b.lineTo(wt2[0], wt2[1]); b.stroke();
    b.fillStyle = K; b.beginPath(); b.ellipse(h[0], h[1], hr, hr * .85, 0, 0, Math.PI * 2); b.fill();
    if (open && hr > 2.5) {                                // 벌린 장갑 손가락
      b.strokeStyle = K; b.lineWidth = Math.max(1, hr * .38);
      for (let f = 0; f < 4; f++) { const an = -Math.PI / 2 + (f - 1.5) * .38 * open;
        b.beginPath(); b.moveTo(h[0], h[1]); b.lineTo(h[0] + Math.cos(an) * hr * 2.1, h[1] + Math.sin(an) * hr * 2.1); b.stroke(); }
    }
  });
  // 후드 — 어깨까지 덮는 둥근 두건, 이음선, 새까만 얼굴창
  const hd = pt(0, 1.68), hr = Math.max(1.5, .17 * k);
  b.fillStyle = YD; b.beginPath(); b.ellipse(hd[0], hd[1] + hr * .25, hr * 1.12, hr * 1.12, 0, 0, Math.PI * 2); b.fill();
  b.fillStyle = Y; b.beginPath(); b.ellipse(hd[0], hd[1], hr, hr * 1.08, 0, 0, Math.PI * 2); b.fill();
  if (hr > 4) { b.fillStyle = YL; b.beginPath(); b.ellipse(hd[0] - hr * .35, hd[1] - hr * .55, hr * .35, hr * .2, -.5, 0, Math.PI * 2); b.fill(); }
  b.fillStyle = sh([7, 9, 12]); b.beginPath(); b.ellipse(hd[0], hd[1] + hr * .1, hr * .62, hr * .72, 0, 0, Math.PI * 2); b.fill();
  if (hr > 5) { b.strokeStyle = K; b.lineWidth = Math.max(1, hr * .1); b.beginPath(); b.ellipse(hd[0], hd[1] + hr * .1, hr * .66, hr * .76, 0, 0, Math.PI * 2); b.stroke(); }
  if (o.visor > 0) {                                       // 얼굴창 속 붉은 불빛 (경비원이 겨눌 때)
    b.fillStyle = `rgba(255,${60 - o.visor * 40},${50 - o.visor * 30},${.35 + o.visor * .6})`;
    b.fillRect(hd[0] - hr * .45, hd[1] - hr * .05, hr * .9, Math.max(1, hr * .16));
  }
  const gl = o.glint == null ? .7 + .3 * Math.sin(s.frame * .2) : o.glint;    // 형광등이 얼굴창을 스침
  if (gl > .05) {
    b.strokeStyle = `rgba(235,245,255,${gl * .85})`; b.lineWidth = Math.max(.6, hr * .1);
    b.beginPath(); b.ellipse(hd[0], hd[1] + hr * .1, hr * .5, hr * .6, 0, Math.PI * 1.08, Math.PI * 1.42); b.stroke();
    if (hr > 6) { b.fillStyle = `rgba(235,245,255,${gl * .7})`; b.beginPath(); b.arc(hd[0] + hr * .28, hd[1] - hr * .3, hr * .07, 0, Math.PI * 2); b.fill(); }
  }
  b.lineCap = 'butt'; b.lineJoin = 'miter';
}

/* ── 실사 3D 인물 끼워 넣기 ──
   지금까지 그린 픽셀을 한 겹으로 떼어 두고 버퍼를 비웁니다. 화면에 찍을 때 그 겹 → 3D 인물 →
   다음 겹 순서로 쌓으므로, 더 가까운 장애물 · 총 · 붉은 테두리는 인물 위에 그대로 덮입니다. */
function figMark(s, b, fig, env) {
  if (s.mode3d) { s.figQ.push({ fig, env }); return true; }            // 실사 복도 — 같은 깊이 버퍼에 함께 그림
  const F = s.fig3d(); if (!F) return false;
  const i = s.figQ.length;
  let L = s.layers[i];
  if (!L) { L = s.layers[i] = document.createElement('canvas'); L.width = LW; L.height = LH; }
  const lx = L.getContext('2d'); lx.clearRect(0, 0, LW, LH); lx.drawImage(s.buf, 0, 0);
  b.save(); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, LW, LH); b.restore();
  s.figQ.push({ fig, env, roll: s.viewRoll || 0, shX: s.shX || 0, shY: s.shY || 0 });
  return true;
}
/* 인물이 선 자리의 빛 — shade() 와 같은 안개 · 경보, 복도 천장 형광등 둘 + 경보등 */
function figEnv(s, dz, z, X) {
  const tb = theme(z), pal = palAt(z), u = c => c.map(v => v / 255);
  const nearRaw = clamp01(1 - dz / 44), near = Math.pow(nearRaw, 1.25) * (s.lights * .85 + .15);
  const red = s.alarm * (.5 + .5 * Math.sin(s.frame * .16)) * .34 * (1 - tb);
  const br = s.flick > 0 ? .45 : 1, lc = u(pal.light), ceil = CH - s.camY - .05;
  return {
    cam: { f: FOC * SC, px: s.cx * SC, py: s.cy * SC },
    sky: lc.map(v => v * .2 * br), gnd: u(pal.floor).map(v => v * .22), fog: u(pal.fog), near,
    red: [210 / 255, 26 / 255, 26 / 255, red * (.4 + nearRaw * .6) * .45],
    lights: [[[X * .5, ceil, -dz + 1.2], lc.map(v => v * 1.55 * br)], [[X, ceil, -dz - 1.5], lc.map(v => v * 1.35 * br)],
             [[0, 0, .4], lc.map(v => v * .18)], [[X, ceil - .2, -dz + .5], [red * 2.6, red * .25, red * .2]]]
  };
}

/* 뒤돌아보면 — 노란 방호복, 새까만 얼굴창. 가까울수록 검은 장갑이 뻗어 옵니다 */
function drawPursuer(s, b) {
  const dz = Math.max(.32, s.dist);
  const px = -s.chaseX;                       // 뒤를 보면 좌우가 뒤집힙니다
  const run = s.frame * .32, bob = Math.abs(Math.sin(run)) * .05;
  {                                           // 실사 3D (figure3d.js) — 발밑 그림자만 픽셀로
    if (s.mode3d) s.shadows3d.push([s.chaseX, s.z - dz, .36]);
    else { const f0 = P(s, px - .32, 0, dz), f1 = P(s, px + .32, 0, dz), rw = (f1[0] - f0[0]) / 2;
      b.fillStyle = 'rgba(0,0,0,.4)'; b.beginPath(); b.ellipse(f0[0] + rw, f0[1], Math.max(1, rw), Math.max(1, rw * .14), 0, 0, Math.PI * 2); b.fill(); }
    const X = px - s.camX;
    if (figMark(s, b, { kind: 'suit', x: X, y: -s.camY, z: dz, yaw: Math.atan2(-X, dz), run, stride: 1, reach: clamp01((7 - s.dist) / 6), cs: s.z - dz, cx: s.chaseX },
                figEnv(s, dz * .7, s.z, X))) return;
  }
  const pt = (x, y) => P(s, px + x, y + bob, dz);
  const k = FOC / dz;
  const reach = clamp01((7 - s.dist) / 6);
  const arms = [[-.3, 1], [.3, -1]].map(([ox, sg]) => [ox, ox * (1 - reach * .4) + Math.sin(run) * .12 * sg * (1 - reach), lerp(1.0, 1.42, reach) - reach * .03, sg]);
  drawSuit(b, s, pt, k, dz * .7, s.z, { run, arms });
}

/* ═════════════ 글자 · 선택지 (원래 해상도) ═══════════════════ */
/* 자막 — 바탕 상자 · 외곽선으로 어떤 화면 위에서도 읽히게. 누가 말하는지는 색과 왼쪽 표시로 */
const SUB_STYLE = {
  me:   { c: '#f2f7ff', y: H - 76, size: 26 },
  doc:  { c: '#cfe6f2', y: H - 130, size: 23, tag: '목소리' },
  cold: { c: '#ffd2c6', y: H - 130, size: 24, tag: '목소리' },
  sys:  { c: '#3dff6a', y: H / 2, size: 30 },
  pa:   { c: '#a8f0d2', y: H - 130, size: 22, tag: '방송' },     // 천장 스피커 방송
  'me-dark':  { c: '#2a2a26', y: H / 2, size: 30, light: true },
  'far-dark': { c: '#4a4a44', y: H / 2 + 44, size: 22, light: true }
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
    c.font = `bold ${st.size}px ${MONO}`;
    const n = Math.min(u.text.length, Math.floor(age / (u.spd || 2.2)) + 1);   // 한 글자씩
    const txt = u.text.slice(0, n);
    // 바탕 상자 — 다 쓴 문장 너비로 미리 잡아 두어 글자가 늘어나도 흔들리지 않게
    const fw = c.measureText(u.text).width, tagW = st.tag ? 16 + st.tag.length * st.size * .55 : 0;
    const bw = fw + tagW + 36, bh = st.size + 18, bx = W / 2 - bw / 2 + tagW / 2, by = st.y - bh / 2;
    if (u.who !== 'sys') {
      c.fillStyle = st.light ? 'rgba(255,252,240,.55)' : 'rgba(4,6,10,.68)';
      c.beginPath(); c.roundRect(bx - tagW, by, bw, bh, 8); c.fill();
      if (st.tag) {                                        // 들려오는 목소리 — 왼쪽 작은 표시
        c.fillStyle = st.c; c.globalAlpha = a * .85;
        c.font = `bold ${Math.round(st.size * .6)}px ${MONO}`; c.textAlign = 'left';
        c.fillText(st.tag, bx - tagW + 14, st.y + 1);
        c.textAlign = 'center'; c.font = `bold ${st.size}px ${MONO}`; c.globalAlpha = a;
      }
    }
    const tx = W / 2 + tagW / 2;
    c.lineJoin = 'round'; c.lineWidth = 4;
    c.strokeStyle = st.light ? 'rgba(255,255,250,.7)' : 'rgba(0,0,0,.85)';
    c.strokeText(txt, tx, st.y);
    c.fillStyle = st.c;
    if (u.who === 'sys') { c.shadowColor = 'rgba(0,255,0,.7)'; c.shadowBlur = 14; }
    c.fillText(txt, tx, st.y);
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
    if (s.turnK >= 0 || !next || next.z - s.z > 20) return null;
    if (next.z === 42) return s.touch ? '위로 쓸기 — 뛰어넘기' : 'SPACE / W — 뛰어넘기';
    if (next.z === 82) return s.touch ? '아래로 쓸기 — 미끄러지기' : 'S / SHIFT — 미끄러지기';
    if (next.z === 120) return s.touch ? '좌우로 쓸기 — 옆으로 피하기' : 'A D / ← → — 옆으로 피하기';
    return null;
  })();
  if (hint) {
    c.textAlign = 'center'; c.font = `bold 18px ${MONO}`;
    const hw = c.measureText(hint).width + 40;
    c.fillStyle = 'rgba(4,6,10,.7)'; c.beginPath(); c.roundRect(W / 2 - hw / 2, 44, hw, 34, 8); c.fill();
    c.fillStyle = '#7de3c8'; c.fillText(hint, W / 2, 62);
  }
  if (s.turnK >= 0 && s.view !== 'back') {                     // 모퉁이 — 꺾는 쪽 꺾쇠, 가까울수록 크게 깜빡
    const [S, sg] = CORNERS()[s.turnK], near = clamp01(1 - (S - s.z) / 16), ready = s.z >= S - 14;
    const cx = W / 2 + sg * (120 + near * 60), cy = H * .42, sz = 22 + near * 18, bl = .55 + .45 * Math.sin(s.frame * (ready ? .45 : .2));
    c.save(); c.globalAlpha = .35 + .65 * bl * (ready ? 1 : .6);
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const x = cx + sg * k * sz * .7;
      c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = sz * .42;
      c.beginPath(); c.moveTo(x - sg * sz * .35, cy - sz * .6); c.lineTo(x + sg * sz * .35, cy); c.lineTo(x - sg * sz * .35, cy + sz * .6); c.stroke();
      c.strokeStyle = '#ffd25a'; c.lineWidth = sz * .24; c.stroke();
    }
    c.restore();
    const first = s.turnK === 0, key = s.touch ? (sg > 0 ? '오른쪽으로 쓸기' : '왼쪽으로 쓸기') : (sg > 0 ? 'D / →' : 'A / ←');
    const txt = first ? `모퉁이 — ${key} 로 꺾기` : `${key}  꺾기`;
    c.textAlign = 'center'; c.font = `bold 18px ${MONO}`;
    const tw = c.measureText(txt).width + 40;
    c.fillStyle = 'rgba(4,6,10,.7)'; c.beginPath(); c.roundRect(W / 2 - tw / 2, 44, tw, 34, 8); c.fill();
    c.fillStyle = '#ffd25a'; c.fillText(txt, W / 2, 62);
  }
  if (s.view === 'back') {
    c.textAlign = 'center'; c.font = `14px ${MONO}`; c.fillStyle = 'rgba(255,120,110,.8)';
    c.fillText('— 뒤 —', W / 2, 92);
  }
  if (s.gun) {
    // 조준점
    const x = s.mx, y = s.my;
    c.strokeStyle = 'rgba(230,241,255,.85)'; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 6, y); c.moveTo(x + 6, y); c.lineTo(x + 16, y);
    c.moveTo(x, y - 16); c.lineTo(x, y - 6); c.moveTo(x, y + 6); c.lineTo(x, y + 16); c.stroke();
    // 탄
    c.textAlign = 'right'; c.font = `15px ${MONO}`;
    if (s.gun.reload > 0) { c.fillStyle = '#e3b23c'; c.fillText('재장전…', W - 26, H - 30); }
    else {
      for (let i = 0; i < MAG; i++) { c.fillStyle = i < s.gun.ammo ? '#e9e3d5' : 'rgba(233,227,213,.18)'; c.fillRect(W - 30 - i * 9, H - 40, 5, 16); }
    }
    c.fillStyle = 'rgba(230,241,255,.5)'; c.font = `12px ${MONO}`;
    c.fillText(`처치 ${s.kills || 0}`, W - 26, H - 56);
    // 처음 줍는 순간 알림
    if (s.gunHint && s.z < ZONE0 + 18) {
      c.textAlign = 'center'; c.font = `16px ${MONO}`;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(W / 2 - 240, 46, 480, 30);
      c.fillStyle = '#e3b23c';
      c.fillText(s.touch ? '적을 눌러 쏘기 · 조준선이 붉어지면 옆으로 비키기' : '마우스 조준 · 클릭 사격 (F 자동 조준) · R 재장전', W / 2, 62);
    }
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
    this.states = { wake: WakeState, door: DoorState, stay: StayState, open: OpenState, run: RunState, caught: CaughtState, free: FreeState };
    this.lab = null;                                     // 깨어남의 입체 실험실 (labroom.js) — 처음 쓸 때 만듦
    this.figQ = []; this.layers = [];                    // 실사 3D 인물 (figure3d.js) — 픽셀 겹 사이에 끼워 넣음
    this.corr3d = () => {                                // 실사 복도 (corridor3d.js) — 처음 쓸 때 지음
      if (this._c3 === undefined) { try { this._c3 = window.Corridor3D ? new Corridor3D(W, H) : null; if (this._c3 && !this._c3.ok) this._c3 = null; } catch (e) { this._c3 = null; } }
      return this._c3;
    };
    this.realT = 0; this._n3 = 0;
    this.fig3d = () => {
      if (this._f3 === undefined) { try { this._f3 = window.Figure3D ? new Figure3D(W, H) : null; if (this._f3 && !this._f3.ok) this._f3 = null; } catch (e) { this._f3 = null; } }
      return this._f3;
    };
    this.held = new Set();                               // 누르고 있는 걷기 키 · 손가락
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    ['loop', 'onKey', 'onKeyUp', 'onDown', 'onUp', 'onMove', 'onTouchStart', 'onTouchMove', 'onTouchEnd'].forEach(k => this[k] = this[k].bind(this));
    this.running = false;
  }
  /* from : 'wake' (침대에서 깨어나기부터 — 기본) · 'door' (비상구 앞부터) */
  start(from = 'wake') {
    this.frame = 0; this.held.clear(); this.prompt = null; this.fromWake = false;
    this.sfx.loadBgm();                                  // 복도 추격 브금 — 미리 풀어 둠 (경보 때 바로 울리게)
    this.drag = null; this.tch = {}; this.stick = [0, 0]; this.lookDX = 0; this.lookDY = 0; this.busyT = 0; this.subs = []; this.bob = 0; this.shake = 0; this.flash = 0; this.flick = 0;
    this.z = START_Z; this.x = 0; this.lane = 0; this.jumpT = -1; this.slideT = -1;
    this.dist = CHASE0; this.chaseX = 0; this.danger = 0; this.alarm = 0; this.lights = .55; this.doorOpen = .06;
    this.obs = []; this.guards = []; this.gun = null; this.drops = []; this.bits = []; this.view = 'fwd';
    this.pistol = PA ? PA.bake() : null;
    this.mx = W / 2; this.my = H / 2;
    this.go(from === 'door' ? 'door' : 'wake');
    this.running = true; this.acc = 0; this.last = performance.now();
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKeyUp);
    addEventListener('pointerup', this.onUp); addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.raf = requestAnimationFrame(this.loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKeyUp);
    removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.style.cursor = '';
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.sfx.stopAll();
  }
  finish(result) { this.stop(); this.onDone(result); }
  /* 현실이 끼어드는 몇 프레임 — 침대에 누운 채 올려다본 실험실(labroom.js), 들여다보는 방호복(figure3d.js) */
  drawReality(c) {
    try {
      if (!this.lab) this.lab = window.LabRoom ? new LabRoom() : null;
      if (!this.lab || !this.lab.ok) return false;
      if (this._rf === undefined) { this._rf = window.Figure3D ? new Figure3D(W, H) : null; if (this._rf && !this._rf.ok) this._rf = null; }
    } catch (e) { return false; }
    const k = this.realK || 0, t = this.realT, calm = t >= 1000;
    const cam = { x: -1.24, y: .98, z: 5.8, yaw: HP, pitch: 1.05 + k * .05, roll: calm ? 0 : Math.sin(this.frame * .7) * .05 };
    const img = this.lab.render({ cam, t: this.frame, wires: 4, wirePull: [0, 0, 0, 0], ivOut: false, ivT: 0, rise: 0, sit: true, doorSlide: 0,
                                  body: LabRoomGeo.bodyPose(cam, 0, 0), dim: .9 });
    c.imageSmoothingEnabled = true; c.drawImage(img, 0, 0, W, H);
    if (this._rf) {
      const fimg = this._rf.render({ kind: 'suit', x: .3 - k * .05, y: -1.58, z: .95 - k * .06, yaw: -.25, stride: 0, reach: .5 + k * .12, lean: .35 }, {
        cam: { f: 450, px: 480, py: 250, roll: -.55 }, sky: [.22, .23, .25], gnd: [.05, .05, .06], fog: [0, 0, 0], near: 1, red: [0, 0, 0, 0],
        lights: [[[-.3, 1.4, -1.8], [1.1, 1.12, 1.15]], [[.7, 1.2, -1.2], [.8, .8, .82]], [[0, -.3, .6], [.12, .12, .13]]] });
      c.drawImage(fimg, 0, 0);
    }
    if (t < 1000) {                                          // 달리는 중 — 찢어지듯 몇 프레임
      for (let i = 0; i < 6; i++) { const y = Math.random() * H, h = 6 + Math.random() * 30; c.drawImage(c.canvas, 0, y, W, h, (Math.random() - .5) * 40, y, W, h); }
      c.fillStyle = `rgba(255,255,255,${t / (this.realDur || 8) * .35})`; c.fillRect(0, 0, W, H);
    } else {                                                 // 끝 — 눈꺼풀이 다시 내려옴
      const ft = this.t - 420, lid = clamp01((ft - 250) / 120) * H / 2;
      c.fillStyle = `rgba(255,252,240,${clamp01(1 - ft / 40)})`; c.fillRect(0, 0, W, H);
      c.fillStyle = '#000'; c.fillRect(0, 0, W, lid); c.fillRect(0, H - lid, W, lid);
    }
    return true;
  }
  resetRun() {
    this.z = START_Z; this.x = 0; this.lane = 0; this.jumpT = -1; this.slideT = -1;
    this.dist = CHASE0; this.chaseX = 0; this.danger = 0; this.stumble = 0; this.immune = 0;
    this.obs = genObstacles(); this.saidMask = 0; this.realMask = 0; this.realT = 0; this.turnDone = 0; this.turnK = -1; this.lookedBack = false; this.view = 'fwd';
    this.guards = genGuards(); this.gun = null; this.drops = []; this.bits = []; this.gunDone = false; this.kills = 0; this.shotOnce = false; this.shotDoc = false;
    this.doorOpen = .06; this.lights = .55; this.alarm = 0; this.lastStep = 0;
    this.sfx.hum(true);
  }
  /* 개발자 모드 — 문을 연 상태로 z 지점부터 바로 달립니다 */
  jumpTo(z) {
    this.resetRun();
    this.z = z; this.doorOpen = 1; this.lights = 1; this.alarm = 1;
    this.sfx.alarm(true); this.sfx.humVol(1); this.sfx.bgm(true, ESC_BGM.loop0);   // 중간부터면 가장 센 구간부터
    RUN_LINES.forEach(([lz], i) => { if (lz < z) this.saidMask |= 1 << i; });
    REAL.forEach(([rz], i) => { if (rz < z) this.realMask |= 1 << i; });
    CORNERS().forEach(([cz], i) => { if (cz < z + 4) this.turnDone |= 1 << i; });
    this.subs = [];
    this.go('run');
  }
  go(name) {
    this.state = this.states[name]; this.stateName = name; this.t = 0;
    this.choice = null;
    if (this.state.enter) this.state.enter(this);
  }
  say(text, who = 'me', dur = 120, spd = 2.2) {   // spd — 한 글자에 몇 프레임
    if (who === 'sys' || who === 'me-dark') this.subs = this.subs.filter(u => u.who !== who);
    this.subs = this.subs.filter(u => this.frame - u.t0 < u.dur && SUB_STYLE[u.who].y !== SUB_STYLE[who].y);
    this.subs.push({ text, who, dur, spd, t0: this.frame });
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
    this.canvas.style.cursor = this.gun ? 'none' : '';
    c.setTransform(1, 0, 0, 1, 0, 0);
    const hi = this.state.hiRes && this.state.hiRes(this);   // 깨어남의 방 — 화면 해상도 그대로
    if (hi) {
      c.imageSmoothingEnabled = true;
      c.drawImage(hi, 0, 0, W, H);
      this.state.drawOver(this, c, hi);
    } else if (this.realT > 0 && this.drawReality(c)) {
      // 현실이 끼어듭니다 — 침대 위, 들여다보는 방호복 (drawReality 가 다 그림)
    } else {
      this.figQ = []; this.mode3d = false;
      this.state.draw(this, this.b);
      c.imageSmoothingEnabled = false;
      if (this.mode3d) {                                      // 실사 복도 → 위에 픽셀 겹
        const C3 = this.corr3d();
        // 느린 기기 — 한 장 그리는 간격이 길면 해상도를 낮추고, 넉넉하면 되돌립니다
        const now = performance.now(), dt = this._t3 ? now - this._t3 : 16; this._t3 = now;
        this._dt3 = this._dt3 == null ? dt : this._dt3 * .95 + Math.min(200, dt) * .05;
        if (++this._n3 % 60 === 0) { if (this._dt3 > 24) C3.setScale(C3.k * .8); else if (this._dt3 < 15 && C3.k < 1) C3.setScale(C3.k * 1.12); }
        const img = C3.render(this.view3d);
        c.imageSmoothingEnabled = true; c.drawImage(img, 0, 0, W, H); c.imageSmoothingEnabled = false;
        c.drawImage(this.buf, 0, 0, W, H);
        this.figQ = [];
      }
      const F = this.figQ.length ? this.fig3d() : null;
      this.figQ.forEach((q, i) => {                          // 픽셀 겹 → 실사 3D 인물 → … → 맨 위 겹
        c.drawImage(this.layers[i], 0, 0, W, H);
        const img = F && F.render(q.fig, q.env);
        if (!img) return;
        c.save(); c.translate(W / 2, H / 2); c.rotate(q.roll); c.translate(-W / 2 + q.shX * SC, -H / 2 + q.shY * SC);
        c.imageSmoothingEnabled = true; c.drawImage(img, 0, 0); c.restore();
        c.imageSmoothingEnabled = false;
      });
      if (!this.mode3d) c.drawImage(this.buf, 0, 0, W, H);
    }
    c.drawImage(this.overlay, 0, 0);
    drawHud(this, c);
    drawText(this, c);
    drawChoice(this, c);
    drawPrompt(this, c);
  }

  /* ── 입력 ── */
  act(a) {
    if (this.choice) {
      if (a === 'left')  { this.choice.sel = Math.max(0, this.choice.sel - 1); this.sfx.pick(); }
      if (a === 'right') { this.choice.sel = Math.min(this.choice.opts.length - 1, this.choice.sel + 1); this.sfx.pick(); }
      if (a === 'ok' || a === 'jump') this.pickChoice(this.choice.sel);
      return;
    }
    if (this.stateName === 'wake') return WakeState.act(this, a);
    if (this.stateName !== 'run') return;
    if ((a === 'left' || a === 'right') && this.turnK >= 0) {        // 모퉁이 — 꺾는 쪽을 누르면 꺾기
      const [S, sg] = CORNERS()[this.turnK];
      if ((a === 'right' ? 1 : -1) === sg && this.z >= S - 14) {
        this.turnDone |= 1 << this.turnK; this.turnK = -1; this.sfx.slide(); this.shake = 3;
        return;
      }
    }
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
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.held.add(e.code);   // 깨어남 — 걷기 · 둘러보기는 누르고 있기
    if (this.stateName === 'wake' && (e.code === 'KeyE' || e.code === 'Enter')) { e.preventDefault(); if (!e.repeat) this.act('ok'); return; }
    if (e.repeat) return;
    if (this.stateName === 'wake') { if (e.code === 'Space' || e.code === 'Enter') this.act('ok'); return; }   // 방에선 SPACE 만 — 나머지 키는 걷기
    if (e.code === 'KeyQ') return this.look(true);
    if (this.gun && this.stateName === 'run') {
      if (e.code === 'KeyF') { e.preventDefault(); return autoFire(this); }
      if (e.code === 'KeyR') { e.preventDefault(); return startReload(this); }
    }
    if (this.choice && (e.code === 'Digit1' || e.code === 'Digit2')) return this.pickChoice(e.code === 'Digit1' ? 0 : 1);
    if (map[e.code]) this.act(map[e.code]);
  }
  onKeyUp(e) { if (e.code === 'KeyQ') this.look(false); this.held.delete(e.code); }
  onUp() { this.held.delete('ptr'); this.drag = null; }
  toLocal(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return [(clientX - r.left) * W / r.width, (clientY - r.top) * H / r.height];
  }
  onMove(e) {
    const [x, y] = this.toLocal(e.clientX, e.clientY); this.mx = x; this.my = y;
    if (this.drag && this.stateName === 'wake' && e.pointerType !== 'touch') {   // 끌어서 둘러보기
      this.lookDX += x - this.drag[0]; this.lookDY += y - this.drag[1]; this.drag = [x, y];
    }
  }
  onDown(e) {
    if (this.stateName === 'wake') {
      if (e.pointerType === 'touch') return;
      const [x, y] = this.toLocal(e.clientX, e.clientY); this.drag = [x, y];
      if (this.wk === 'hall') this.held.add('ptr');
      this.act('ok'); return;
    }
    if (this.gun && this.stateName === 'run' && e.pointerType !== 'touch') {
      const [x, y] = this.toLocal(e.clientX, e.clientY); this.mx = x; this.my = y;
      return fireAt(this, x / SC, y / SC);
    }
    if (!this.choice || e.pointerType === 'touch') return;
    const [x, y] = this.toLocal(e.clientX, e.clientY);
    choiceRects(this).forEach((r, i) => { if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { this.choice.sel = i; this.pickChoice(i); } });
  }
  onTouchStart(e) {
    e.preventDefault();
    if (this.stateName === 'wake') {                       // 왼쪽 손가락 — 걷기, 오른쪽 — 둘러보기
      this.tch = this.tch || {};
      for (const t of e.changedTouches) {
        const [x, y] = this.toLocal(t.clientX, t.clientY);
        this.tch[t.identifier] = { x0: x, y0: y, x, y, left: x < W / 2, t0: performance.now() };
      }
      this.held.add('touch'); return;
    }
    if (e.touches.length >= 2) { this.look(true); this.ts = null; return; }
    const t = e.touches[0]; this.ts = [t.clientX, t.clientY];
  }
  onTouchMove(e) {
    if (this.stateName !== 'wake') return;
    e.preventDefault();
    this.tch = this.tch || {};
    for (const t of e.changedTouches) {
      const T = this.tch[t.identifier]; if (!T) continue;
      const [x, y] = this.toLocal(t.clientX, t.clientY);
      if (T.left) { const dx = x - T.x0, dy = y - T.y0, k = 1 / 80; this.stick = [Math.max(-1, Math.min(1, dx * k)), Math.max(-1, Math.min(1, dy * k))]; }
      else { this.lookDX += (x - T.x) * 1.4; this.lookDY += (y - T.y) * 1.4; }
      T.x = x; T.y = y;
    }
  }
  onTouchEnd(e) {
    e.preventDefault();
    if (this.stateName === 'wake') {
      this.tch = this.tch || {};
      for (const t of e.changedTouches) {
        const T = this.tch[t.identifier]; delete this.tch[t.identifier];
        if (!T) continue;
        if (T.left) this.stick = [0, 0];
        if (Math.hypot(T.x - T.x0, T.y - T.y0) < 18 && performance.now() - T.t0 < 300) this.act('ok');   // 톡
      }
      if (!e.touches.length) this.held.delete('touch');
      return;
    }
    if (this.view === 'back' && e.touches.length < 2) { this.look(false); this.ts = null; return; }
    if (!this.ts) return;
    const t = e.changedTouches[0], dx = t.clientX - this.ts[0], dy = t.clientY - this.ts[1];
    this.ts = null;
    if (this.choice) {
      const [x, y] = this.toLocal(t.clientX, t.clientY);
      choiceRects(this).forEach((r, i) => { if (x >= r.x && x <= r.x + r.w && y >= r.y - 20 && y <= r.y + r.h + 20) { this.choice.sel = i; this.pickChoice(i); } });
      return;
    }
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {                          // 톡 — 총이 있으면 그 자리를 쏘고, 없으면 점프
      if (this.gun && this.stateName === 'run') { const [x, y] = this.toLocal(t.clientX, t.clientY); this.mx = x; this.my = y; return fireAt(this, x / SC, y / SC); }
      return this.act('jump');
    }
    if (Math.abs(dx) > Math.abs(dy)) this.act(dx < 0 ? 'left' : 'right');
    else this.act(dy < 0 ? 'jump' : 'slide');
  }
}
window.EscapeScene = EscapeScene;
})();
