'use strict';
/* ═══════════════════════════════════════════════════════════
   foepix.js — 잡몹 도트 그림 (손으로 찍은 결의 픽셀 스프라이트)

   알록달록한 버섯 대신 — 창백한 살덩이 · 텅 빈 눈구멍 · 흘러내리는 눈물과 피 · 꿰맨 자국.
   (꿈 실험에서 버려진 「이전 피험자들」이라는 설정. 귀엽지 않고 기괴하게, 그래도 한눈에 구별되게)
   처음부터 게임 픽셀 단위로 「조각」합니다 :
     · 덩어리마다 왼쪽 위에서 드는 빛을 받아 4단계로 딱 끊어지는 명암 · 아래 가장자리엔 되비친 빛 한 줄
     · 굵은 먹 외곽선 한 겹 (빛 받는 쪽만 그 덩어리의 짙은 색)
     · 이빨 · 실밥 · 흉터 · 단면은 글자 그림으로 한 점씩
   종류(이름은 예전 그대로 — 하는 짓이 같음)마다 실루엣이 하는 짓을 말합니다 :
     shroom   우는 것     — 몸보다 큰 대머리, 뻥 뚫린 눈에서 핏물이 흐름. 그냥 걸어옴
     spitter  게우는 것   — 얼굴 절반이 입. 턱 밑 담즙 주머니가 차오르면 뱉음 (한쪽 눈은 꿰매짐)
     sporer   고름 단지   — 정수리가 열린 부은 머리에 누런 것이 고임. 부풀면 흘림 (입은 꿰매짐)
     splitter 붙은 쌍둥이 — 가운데를 실로 꿰맨 두 머리, 맞을수록 솔기가 벌어짐 · mini 그 반쪽
     charger  뼈 가면     — 날고기 몸에 뿔 달린 뼈 가면. 달아오르면 튀어나옴
     blinker  뜬 머리     — 척추를 늘어뜨리고 뜬 머리가 가로 띠로 어긋남, 커지면 사라짐

   한 번 구워 두고(종류 · 단계마다 작은 캔버스) 게임 중엔 그림 몇 장 찍는 값.
   쓰는 곳 : game.js drawFoe → FoePix.draw(g, f, t, flash) · 보스 그림(bosspix.js)도 여기 조각판(Slab)을 씀
   ═══════════════════════════════════════════════════════════ */
(() => {
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const LIGHT = (() => { const v = [-.52, -.7, .49], l = Math.hypot(...v); return v.map(x => x / l); })();

/* ── 조각판 — 픽셀마다 색(RGB) · 칠해졌는지 ── */
class Slab {
  constructor(w, h) { this.w = w; this.h = h; this.c = new Uint8ClampedArray(w * h * 4); this.tone = new Int8Array(w * h).fill(-1); }
  set(x, y, col, tone = 1) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4; this.c[i] = col[0]; this.c[i + 1] = col[1]; this.c[i + 2] = col[2]; this.c[i + 3] = 255; this.tone[y * this.w + x] = tone; }
  has(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.c[(y * this.w + x) * 4 + 3] > 0; }
  clear(x, y) { if (this.has(x, y)) { this.c[(y * this.w + x) * 4 + 3] = 0; this.tone[y * this.w + x] = -1; } }
  /* 둥근 덩어리 — 타원체로 보고 빛을 받아 ramp[0 그늘 · 1 중간 · 2 밝음 · 3 가장 밝음] 로 끊음. ramp[4] 가 있으면 아래 가장자리의 되비친 빛.
     o.y0 · o.y1 · o.x0 · o.x1 : 이 범위만 (갓의 반구 · 잘린 몸), o.th : 단계 문턱, o.flat : 0‥1 납작하게 (앞면이 평평한 판) */
  ell(cx, cy, rx, ry, ramp, o = {}) {
    const th = o.th || [.1, .56, .9], flat = o.flat || 0;      // 그늘이 넓고 밝은 면은 왼쪽 위 조금만 (어두운 방의 것들)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if ((o.y0 != null && y < o.y0) || (o.y1 != null && y > o.y1) || (o.x0 != null && x < o.x0) || (o.x1 != null && x > o.x1)) continue;
      const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry, d2 = dx * dx + dy * dy; if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2) * (1 - flat) + flat, l = Math.hypot(dx, dy, nz) || 1;
      const v = (dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2]) / l;
      let t = v > th[2] ? 3 : v > th[1] ? 2 : v > th[0] ? 1 : 0;
      if (ramp.length < 4 && t > ramp.length - 1) t = ramp.length - 1;
      if (ramp[4] && t === 0 && d2 > .72 && dy > .25 && dx > -.5) { this.set(x, y, ramp[4], 0); continue; }   // 되비친 빛
      this.set(x, y, ramp[t], t);
    }
  }
  rect(x, y, w, h, col, tone = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col, tone); }
  /* 글자 그림 찍기 — rows 의 글자를 key 의 색으로 ('.' 은 건너뜀 · ' ' 는 지움). flip 이면 좌우 뒤집어 */
  stamp(x, y, rows, key, flip) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[flip ? r.length - 1 - i : i]; if (ch === '.') continue; if (ch === ' ') { this.clear(x + i, y + j); continue; } const c = key[ch]; if (c) this.set(x + i, y + j, c, 1); } });
  }
  /* 이미 칠해진 곳에만 덧칠 (점 · 얼룩 · 금) */
  over(x, y, col, tone) { if (this.has(x, y)) this.set(x, y, col, tone == null ? this.tone[y * this.w + x] : tone); }
  /* 외곽선 한 겹 — 빛 받는 쪽(왼쪽 · 위)은 lit, 그늘 쪽은 dark */
  outline(dark, lit) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.has(x, y)) continue;
      const r = this.has(x + 1, y), d = this.has(x, y + 1), l = this.has(x - 1, y), u = this.has(x, y - 1);
      if (!(r || d || l || u)) continue;
      add.push([x, y, (lit && (r || d) && !(l || u)) ? lit : dark]);
    }
    add.forEach(([x, y, c]) => this.set(x, y, c, -2));
    return this;
  }
  canvas() { const c = document.createElement('canvas'); c.width = this.w; c.height = this.h; c.getContext('2d').putImageData(new ImageData(this.c, this.w, this.h), 0, 0); return c; }
}
const white = cv => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.drawImage(cv, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); return c; };
const flipX = cv => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d'); x.translate(cv.width, 0); x.scale(-1, 1); x.drawImage(cv, 0, 0); return c; };

/* ── 색 — 덩어리마다 [그늘, 중간, 밝음, 가장 밝음, 되비친 빛] : 그늘은 푸른 · 보라 쪽으로, 밝은 곳은 따뜻한 쪽으로 돌려 둠 ── */
const R = (...h) => h.map(hex);
const BONE = R('#3a302c', '#7c6e5a', '#b0a384', '#d6caa8', '#463c5c'), BLOOD = R('#30060c', '#6e1216', '#a02420', '#d8483c');
const PAL = {
  ink: hex('#07050b'), tooth: hex('#c9bd9e'), toothD: hex('#75684f'),
  shroom:   { skin: R('#281620', '#57383c', '#876257', '#b08c76', '#342444'), lit: hex('#1a0e16'), mouth: hex('#12040a'), tear: hex('#7a1418'), eye: hex('#ff3a2a'), eyeH: hex('#ffb89a') },
  spitter:  { skin: R('#18201c', '#3e4a3a', '#687358', '#939a76', '#222e44'), lit: hex('#0e1410'), mouth: hex('#0a0306'), gum: R('#30080e', '#641a22', '#963a40'),
              sac: R('#3e5214', '#7c9a24', '#bcd048', '#e8f09a'), tear: hex('#6e8a1e'), eye: hex('#b4f050'), eyeH: hex('#e8ffc0') },
  sporer:   { skin: R('#2a1a16', '#5e4432', '#8c6e4c', '#b4966c', '#362640'), lit: hex('#1a100c'), pool: R('#806a12', '#c4ae2c', '#f0e080'), tear: hex('#a48a20'), eye: hex('#f0d850'), eyeH: hex('#fff6c0') },
  splitter: { skin: R('#1e1528', '#4a3a54', '#776078', '#a48a98', '#2a2850'), lit: hex('#120c1a'), mouth: hex('#12040e'), flesh: R('#560e16', '#a02420', '#e85a4a'), tear: hex('#7a1418'), eye: hex('#ff4a6a'), eyeH: hex('#ffd0d8') },
  charger:  { skin: R('#20080e', '#4c161a', '#782826', '#9c463e', '#2c1434'), mask: BONE, lit: hex('#1e1814'), hot: R('#a02420', '#f06a22', '#ffd890'), eye: hex('#ff2a1a'), eyeH: hex('#ffc090') },
  blinker:  { skin: R('#121a26', '#384856', '#667884', '#98a8b0', '#1e2a4c'), lit: hex('#0a1018'), mouth: hex('#04060a'), tear: hex('#101a2e'), eye: hex('#7ae8d0'), eyeH: hex('#e0fff6') }
};
/* 발밑에 깔리는 제 빛 (game.js drawFoe) — 색은 탁하게 */
const SKIN = { shroom: { glow: '120,30,30' }, spitter: { glow: '80,110,40' }, sporer: { glow: '130,110,40' }, splitter: { glow: '110,40,70' },
               mini: { glow: '110,40,70' }, charger: { glow: '150,50,24' }, blinker: { glow: '50,90,120' } };

/* ── 한 종 = 층(layer) 몇 장 + 눈 자리. 층마다 따로 구워 두고, 그릴 때 한 픽셀씩 어긋나게 움직여 숨을 쉽니다 ── */
const W = 48, H = 44, GY = 40;                               // 칸 크기 · 발바닥 줄
const mk = () => new Slab(W, H);
const feet = (s, xs, y, col, colD) => xs.forEach(x => { s.rect(x, y, 4, 2, col, 1); s.rect(x, y + 1, 4, 1, colD, 0); });
const dots = (s, list, col, tone) => list.forEach(([x, y]) => s.over(x, y, col, tone));
/* 꿰맨 자국 — 가로 실 한 줄에 세로 땀 */
/* 썩은 얼룩 — 한 단계 어두운 색으로 번진 자국 (seed 로 늘 같은 자리) */
const rot = (s, cx, cy, rx, ry, col, n, seed) => { let k = seed; const rnd = () => ((k = (k * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * .86, x = Math.round(cx + Math.cos(a) * r * rx), y = Math.round(cy + Math.sin(a) * r * ry); s.over(x, y, col, 0); if (rnd() < .6) s.over(x + 1, y, col, 0); if (rnd() < .4) s.over(x, y + 1, col, 0); } };
const stitchH = (s, x0, x1, y, col) => { for (let x = x0; x <= x1; x++) s.over(x, y, col, 0); for (let x = x0 + 1; x <= x1; x += 3) { s.over(x, y - 1, col, 0); s.over(x, y + 1, col, 0); } };

const BUILD = {
  /* 우는 것 — 몸보다 큰 대머리 · 벌어진 입 · 정수리의 꿰맨 흉터. 눈(구멍)과 핏물은 그릴 때마다 */
  shroom() {
    const P = PAL.shroom, sk = P.skin;
    const body = f => { const s = mk();
      feet(s, f ? [17, 27] : [18, 26], GY - 2, sk[1], sk[0]); if (f) s.rect(17, GY - 3, 4, 1, sk[1]);
      s.ell(24, 34, 6.4, 5.2, sk, { y1: GY - 2 });
      dots(s, [[21, 35], [22, 36], [26, 35], [27, 36]], sk[0], 0);                    // 앙상한 갈비
      return s.outline(PAL.ink, P.lit); };
    const head = () => { const s = mk();
      s.ell(24, 21.5, 13.8, 12.2, sk);
      rot(s, 24, 22, 13, 11, sk[0], 9, 11); rot(s, 30, 26, 4, 4, BLOOD[0], 4, 5);
      stitchH(s, 26, 33, 13, PAL.ink);                                                  // 정수리의 흉터
      dots(s, [[13, 24], [14, 25], [34, 25], [35, 24]], sk[0], 0);                    // 꺼진 볼
      s.stamp(19, 27, ['.mmmmmmmm.', 'mwmmwwmmwm', 'mmmmmmmmmm', '.mmwmmmwm.'], { m: P.mouth, w: PAL.tooth });   // 벌어진 입 · 듬성듬성한 이
      s.over(21, 31, BLOOD[1]); s.over(21, 32, BLOOD[1]);                             // 입가의 핏물
      s.outline(PAL.ink, P.lit);
      [[20, 8], [21, 7], [25, 7], [26, 6], [29, 8]].forEach(([x, y]) => s.set(x, y, PAL.ink, -2));   // 몇 가닥 남은 머리카락
      return s; };
    return { layers: { bodyA: body(0), bodyB: body(1), cap: head() }, eyes: [[17, 19, 0], [29, 19, 0]], tears: true, P };
  },
  /* 게우는 것 — 얼굴 절반이 입. 턱 밑 담즙 주머니 (오른쪽을 보는 그림 — 왼쪽은 뒤집어) */
  spitter() {
    const P = PAL.spitter, sk = P.skin;
    const body = () => { const s = mk();
      feet(s, [17, 24], GY - 2, sk[1], sk[0]);
      s.ell(21, 34, 6.6, 5.2, sk, { y1: GY - 2 });
      return s.outline(PAL.ink, P.lit); };
    const sac = k => { const s = mk(), r = 3 + k * 1.6;                                // 담즙 주머니 — 차오를수록 크고 밝게
      s.ell(28.5, 33 - k * .4, r, r * .95, k > 1 ? P.sac.slice(1).concat([P.sac[3]]) : P.sac, { th: [-.2, .3, .72] });
      return s.outline(hex('#22300c'), hex('#3a4a12')); };
    const head = () => { const s = mk();
      s.ell(22, 20.5, 12.6, 11.2, sk);
      rot(s, 20, 21, 11, 10, sk[0], 10, 23);
      dots(s, [[12, 14], [13, 15], [14, 15], [16, 26], [17, 27]], sk[0], 0);          // 핏줄
      s.stamp(12, 18, ['k.k', '.k.', 'k.k'], { k: PAL.ink });                         // 꿰매 버린 뒤쪽 눈
      s.ell(30.5, 23.5, 6.4, 7.2, [P.gum[0], P.gum[1], P.gum[2], P.gum[2]], { th: [-.3, .2, .7] });   // 까뒤집힌 잇몸
      s.ell(30.8, 23.6, 4.4, 5.2, [P.mouth]);                                          // 목구멍
      [[28, 19], [31, 18], [34, 20], [28, 28], [31, 29], [34, 27]].forEach(([x, y]) => { s.set(x, y, PAL.tooth, 3); s.set(x, y + (y < 23 ? 1 : -1), PAL.toothD, 1); });   // 이빨
      s.set(33, 30, P.sac[1], 2); s.set(33, 31, P.sac[1], 2); s.set(33, 32, P.sac[0], 1);   // 흘러내리는 담즙
      return s.outline(PAL.ink, P.lit); };
    return { layers: { body: body(), cap: head(), sac0: sac(0), sac1: sac(1), sac2: sac(2) }, eyes: [[20, 17, 0]], facing: true, tears: true, P };
  },
  /* 고름 단지 — 정수리가 열린 부은 머리. 고인 것이 부풀면 넘침. 입은 꿰매짐 */
  sporer() {
    const P = PAL.sporer, sk = P.skin;
    const body = k => { const s = mk(), rx = 10.8 + k * 1.3, ry = 9.6 + k * 1.1;
      feet(s, [15, 29], GY - 2, sk[1], sk[0]);
      s.ell(24, 30.5 - k * .5, rx, ry, sk, { y1: GY - 2 });
      rot(s, 24, 31, rx - 1, ry - 2, sk[0], 10, 37);
      dots(s, [[15, 31], [16, 32], [32, 30], [33, 31], [19, 37], [29, 37]], sk[0], 0);     // 늘어진 살
      s.over(14, 29, sk[3], 3); s.over(34, 28, sk[3], 3);                                  // 부푼 종기
      stitchH(s, 20, 28, 35, PAL.ink);                                                     // 꿰맨 입
      return s.outline(PAL.ink, P.lit); };
    const cap = () => { const s = mk();
      s.ell(24, 17, 12.8, 7, sk, { y0: 17, th: [-.3, .15, .66] });                         // 벌어진 머리 가죽
      s.ell(24, 16.5, 12.8, 4.2, [BONE[1], BONE[2], BONE[3], BONE[3]], { th: [-.5, -.1, .4] });   // 두개골 단면
      s.ell(24, 17, 10.8, 3, [hex('#2a0c10'), hex('#4a141a'), hex('#6a2024')], { th: [-.3, .5, 2] });   // 안쪽 — 어두운 살
      s.ell(24, 17.6, 8.8, 2, P.pool, { th: [-.4, .3, 2] });                               // 고인 고름
      s.set(19, 17, P.pool[2], 3); s.set(20, 17, P.pool[2], 3); s.set(28, 18, P.pool[2], 3);
      [[13, 13], [16, 12], [31, 12], [35, 14]].forEach(([x, y]) => s.set(x, y, BONE[2], 2));   // 깨진 뼈 가장자리
      s.set(11, 19, P.pool[1], 2); s.set(11, 20, P.pool[1], 2); s.set(11, 21, P.pool[0], 1); s.set(37, 19, P.pool[1], 2); s.set(37, 20, P.pool[0], 1);   // 넘쳐 흐름
      return s.outline(PAL.ink, P.lit); };
    return { layers: { body0: body(0), body1: body(1), body2: body(2), cap: cap() }, eyes: [[18, 28, 0], [28, 28, 0]], sleepy: true, tears: true, P };
  },
  /* 붙은 쌍둥이 — 가운데를 실로 꿰맨 두 머리 (반쪽 두 장을 틈만큼 벌려 그림) */
  splitter() {
    const P = PAL.splitter, sk = P.skin;
    const half = () => { const s = mk();                                                  // 왼쪽 반 (오른쪽은 뒤집어)
      feet(s, [14], GY - 2, sk[1], sk[0]);
      s.ell(18, 35, 5.4, 4.2, sk, { y1: GY - 2, x1: 23 });
      s.ell(17, 23.5, 11.6, 12.4, sk, { x1: 23 });
      rot(s, 15, 24, 8, 10, sk[0], 8, 51); rot(s, 20, 30, 3, 5, BLOOD[0], 4, 9);
      dots(s, [[9, 27], [10, 28], [12, 14], [13, 13]], sk[0], 0);
      s.stamp(17, 30, ['.mmmmmm', 'mwmmwmm', '.mmmmmm'], { m: P.mouth, w: PAL.tooth });    // 반쪽 입 — 붙으면 하나로 이어짐
      for (let y = 11; y <= GY - 3; y++) if (s.has(23, y)) s.set(23, y, P.flesh[(y * 7) % 3 === 0 ? 2 : 1], 2);   // 솔기 — 속살이 비침
      for (let y = 14; y <= 28; y += 5) { s.over(21, y, PAL.ink, 0); s.over(22, y, PAL.ink, 0); s.over(22, y + 1, sk[0], 0); }   // 실밥
      return s.outline(PAL.ink, P.lit); };
    const h = half();
    return { layers: { L: h.canvas(), R: flipX(h.canvas()) }, raw: true, eyes: [[14, 21, 0], [32, 21, 0]], tears: true, P };
  },
  /* 반쪽 — 쌍둥이의 한쪽. 뜯긴 쪽이 그대로 드러남 */
  mini() {
    const P = PAL.splitter, sk = P.skin;
    const s = mk();
    feet(s, [19], GY - 2, sk[1], sk[0]);
    s.ell(22, 30.5, 8.6, 8.4, sk, { y1: GY - 2, x1: 27 });
    rot(s, 21, 31, 6, 6, sk[0], 5, 63);
    s.stamp(22, 35, ['mmm', '.m.'], { m: P.mouth });
    for (let y = 22; y <= GY - 3; y++) if (s.has(27, y)) s.set(27, y, P.flesh[(y * 5) % 3 === 0 ? 2 : 1], 2);
    dots(s, [[26, 25], [26, 30], [26, 34]], P.flesh[0], 1);
    s.outline(PAL.ink, P.lit);
    s.set(28, 33, BLOOD[2], 2); s.set(28, 34, BLOOD[1], 1);                                // 떨어지는 피
    return { layers: { one: s.canvas(), oneF: flipX(s.canvas()) }, raw: true, eyes: [[20, 28, 0]], small: true, tears: true, P };
  },
  /* 뼈 가면 — 날고기 몸에 뿔 달린 뼈 가면을 쓰고 낮게 웅크림. 눈구멍 틈에서 불씨가 빛남 (오른쪽을 봄) */
  charger() {
    const P = PAL.charger, sk = P.skin, mk2 = P.mask;
    const body = lo => { const s = mk();
      s.stamp(8, GY - 5 + lo, ['.dd.', 'dmmd', 'dmm.', 'ddd.'].slice(0, 4 - lo), { d: sk[0], m: sk[1] });          // 뒷다리 — 땅을 짚음
      feet(s, lo ? [15, 24] : [16, 25], GY - 2, sk[1], sk[0]);
      s.ell(20, 31.5 + lo, 11.8, 7.4 - lo * .7, sk, { y1: GY - 2, th: [.1, .56, .9] });
      for (const x of [13, 18]) for (let y = 25; y <= GY - 3; y++) if (s.has(x, y)) s.over(x, y, sk[0], 0);            // 근육 결
      dots(s, [[10, 30 + lo], [15, 28 + lo], [16, 33 + lo]], BONE[2], 3);                                               // 살을 뚫고 나온 뼛조각
      return s.outline(PAL.ink, hex('#1a0a0e')); };
    const cap = () => { const s = mk();
      s.ell(30, 25.5, 11.6, 10.6, mk2, { x0: 21, y1: 31, flat: .28, th: [0, .46, .86] });                // 뼈 가면
      rot(s, 30, 23, 8, 6, mk2[0], 7, 77); rot(s, 33, 21, 4, 3, BLOOD[0], 5, 3);
      [[21, 19], [21, 20], [22, 27], [21, 28], [21, 24]].forEach(([x, y]) => s.clear(x, y));                 // 뒷가장자리의 깨진 이
      s.stamp(26, 18, ['d..', '.d.', '.dd', '..d'], { d: mk2[0] });                                           // 금
      s.stamp(33, 16, ['.d', 'd.', 'dd'], { d: mk2[0] });
      for (let x = 28; x <= 40; x++) for (let y = 27; y <= 29; y++) if (s.has(x, y)) s.set(x, y, hex('#12060a'), 0);   // 눈구멍 틈
      for (let x = 27; x <= 41; x++) if (s.has(x, 26) && s.tone[26 * W + x] > 0) s.over(x, 26, mk2[3], 3);          // 틈 위의 도드라진 눈두덩
      for (let x = 27; x <= 39; x++) if (s.has(x, 31)) s.set(x, 31, (x & 1) ? PAL.tooth : PAL.ink, (x & 1) ? 3 : 0);  // 윗니 한 줄
      dots(s, [[24, 22], [25, 23], [25, 24], [36, 22], [37, 23]], BLOOD[1], 1);                                       // 말라붙은 피
      s.stamp(36, 11, ['...h', '..hH', '.hHd', 'hHd.', 'Hd..'], { h: mk2[1], H: mk2[2], d: mk2[0] });                  // 앞뿔
      s.stamp(27, 11, ['.hH', 'hHd', 'Hd.'], { h: mk2[1], H: mk2[2], d: mk2[0] });                                     // 부러진 뒷뿔
      for (let x = 25; x <= 40; x++) if (s.has(x, 31)) s.set(x, 32, hex('#2a0a0e'), 0);                      // 가면 아래 그늘
      return s.outline(PAL.ink, P.lit); };
    const hot = () => { const s = mk();                                                                     // 달아오른 가면 — 예비 동작 때 덧그림
      s.ell(30, 25.5, 9.8, 8.8, [P.hot[0], P.hot[0], P.hot[1], P.hot[2]], { x0: 23, y1: 25, flat: .28, th: [-.1, .3, .7] });
      return s; };
    return { layers: { body: body(0), bodyLo: body(1), cap: cap(), hot: hot() }, eyes: [[31, 27, 0], [36, 27, 0]], facing: true, tiny: true, P };
  },
  /* 뜬 머리 — 척추를 늘어뜨리고 뜬 머리. 가로 띠로 어긋나며, 어긋남이 커지면 사라짐 */
  blinker() {
    const P = PAL.blinker, sk = P.skin;
    const s = mk();
    for (let y = 28; y <= 38; y++) { const u = (y - 28) / 10, hw = 2.4 * (1 - u * .7) + .5, cx = 24 + Math.sin(u * 3.4) * 1.8, bone = (y % 3) !== 0;     // 늘어진 척추 — 마디마다 끊김
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) s.set(x, y, bone ? BONE[x < cx ? 2 : 1] : BLOOD[1], bone ? 2 : 0); }
    [[19, 29], [19, 30], [20, 31], [29, 29], [29, 30], [28, 31], [28, 32]].forEach(([x, y]) => s.set(x, y, BLOOD[(x + y) & 1 ? 1 : 2], 1));   // 뜯긴 힘줄
    s.ell(24, 19.5, 11.8, 10.6, sk);
    rot(s, 24, 20, 10, 9, sk[0], 9, 91);
    for (let x = 18; x <= 30; x++) s.over(x, 29, BLOOD[(x & 1) ? 1 : 0], 0);                 // 목의 단면
    s.ell(24, 26, 2.4, 2.6, [P.mouth]);                                                      // 벌린 입
    dots(s, [[14, 22], [15, 23], [33, 23], [34, 22]], sk[0], 0);
    s.outline(PAL.ink, P.lit);
    return { layers: { one: s.canvas() }, raw: true, eyes: [[19, 18, 0], [27, 18, 0]], tears: true, P };
  }
};

/* ── 굽기 ── */
let BAKED = null;
function bake() {
  if (BAKED) return BAKED;
  BAKED = {};
  for (const k in BUILD) {
    const d = BUILD[k](), L = {}, Wt = {};
    for (const n in d.layers) { const cv = d.raw ? d.layers[n] : d.layers[n].canvas(); L[n] = cv; Wt[n] = white(cv); if (d.facing) { L[n + '_f'] = flipX(cv); Wt[n + '_f'] = white(L[n + '_f']); } }
    BAKED[k] = { ...d, L, Wt };
  }
  return BAKED;
}

/* ── 그리기 — (f.x, f.y) 가 몸 한가운데. 발바닥은 그 아래 12px ── */
const OX = W / 2, OY = GY - 12;
function draw(g, f, t, flash) {
  const B = bake()[f.type] || bake().shroom, P = B.P;
  const x0 = Math.round(f.x) - OX, y0 = Math.round(f.y) - OY + (f.type === 'blinker' ? Math.round(Math.sin((f.bob || 0) * .8) * 2) - 2 : 0);   // 뜬 머리는 떠서 흔들림
  const ph = f.bob || 0, br = Math.sin(ph) > 0 ? 1 : 0;                        // 숨 — 한 픽셀
  const fc = (f.face || 1) < 0, sfx = fc ? '_f' : '';
  const put = (name, dx, dy) => { const c = B.L[name]; if (!c) return; g.drawImage(c, x0 + dx, y0 + dy); if (flash > 0) { const a = g.globalAlpha; g.globalAlpha = a * flash; g.drawImage(B.Wt[name], x0 + dx, y0 + dy); g.globalAlpha = a; } };
  const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
  let eyeDy = 0, eyeDx = 0, glowK = .72 + Math.sin(t * .07 + ph) * .28;

  if (f.type === 'shroom') {
    const step = Math.sin(ph * 1.6) > 0;
    put(step ? 'bodyA' : 'bodyB', 0, 0); put('cap', 0, br ? -1 : 0); eyeDy = br ? -1 : 0;
  } else if (f.type === 'spitter') {
    const charge = clamp(1 - f.cd / (BALANCE.spitterCd || 138), 0, 1), kick = charge > .93;
    put('body' + sfx, 0, 0);
    put((charge > .72 ? 'sac2' : charge > .4 ? 'sac1' : 'sac0') + sfx, 0, charge > .72 && (t >> 2) % 2 ? -1 : 0);
    put('cap' + sfx, (kick ? -2 : 0) * (fc ? -1 : 1), br ? -1 : 0);
    eyeDy = br ? -1 : 0; eyeDx = kick ? -2 : 0; glowK = .6 + charge * .4;
  } else if (f.type === 'sporer') {
    const ready = clamp(1 - f.cd / (BALANCE.sporerCd || 124), 0, 1), k = ready > .78 ? 2 : (ready > .45 || br) ? 1 : 0;
    put('body' + k, 0, 0); put('cap', 0, -k);
    eyeDy = k === 2 ? -1 : 0; glowK = .55 + ready * .45;
    if (ready > .6 && (t >> 3) % 2) { g.fillStyle = `rgb(${P.pool[2]})`; g.fillRect(x0 + 16 + ((t >> 3) % 5) * 3, y0 + 13 - k - ((t >> 2) % 3), 1, 1); }   // 끓어오르는 방울
  } else if (f.type === 'splitter') {
    const hurt = 1 - clamp(f.hp / (f.max || 1), 0, 1), gap = hurt > .66 ? 3 : hurt > .33 ? 2 : hurt > 0 ? 1 : 0, wob = gap > 1 && (t >> 2) % 2 ? 1 : 0;
    if (gap) { g.fillStyle = `rgb(${P.flesh[0]})`; g.fillRect(x0 + 24 - gap, y0 + 14, gap * 2, 22); g.fillStyle = `rgb(${P.flesh[2]})`; g.fillRect(x0 + 24 - (gap > 1 ? 1 : 0), y0 + 16 + ((t >> 2) % 4), gap > 1 ? 2 : 1, 14);   // 벌어진 솔기로 비치는 속
      g.fillStyle = `rgb(${PAL.ink})`; for (let y = 14; y <= 28; y += 5) g.fillRect(x0 + 24 - gap - 1, y0 + y, gap * 2 + 2, 1); }                                                                                                    // 팽팽해진 실
    put('L', -gap, br ? -1 : 0); put('R', gap + wob, br ? 0 : -1);
    eyeDx = gap;
  } else if (f.type === 'mini') {
    put((f.side || 1) > 0 ? 'one' : 'oneF', 0, br ? -1 : 0); eyeDy = br ? -1 : 0;
  } else if (f.type === 'charger') {
    const wind = f.wind > 0 ? clamp(1 - f.wind / (BALANCE.chargerWind || 34), 0, 1) : 0, dash = f.dash > 0, sgn = fc ? -1 : 1;
    if (dash) { const a = g.globalAlpha; for (let i = 3; i >= 1; i--) { g.globalAlpha = a * (.34 - i * .08); g.drawImage(B.L['cap' + sfx], x0 - sgn * i * 7, y0); g.drawImage(B.L['body' + sfx], x0 - sgn * i * 7, y0); } g.globalAlpha = a; }   // 잔상
    put((wind > .15 ? 'bodyLo' : 'body') + sfx, wind > .5 ? -sgn : 0, 0);
    put('cap' + sfx, (wind > .5 ? -sgn * 2 : dash ? sgn * 2 : 0), (wind > .15 ? 1 : 0) + (br && !wind && !dash ? -1 : 0));
    if (wind > .05) { const a = g.globalAlpha; g.globalAlpha = a * wind * ((t >> 1) % 2 ? 1 : .7); g.drawImage(B.L['hot' + sfx], x0 + (wind > .5 ? -sgn * 2 : 0), y0 + (wind > .15 ? 1 : 0)); g.globalAlpha = a; }   // 달아오른 가면
    eyeDy = wind > .15 ? 1 : 0; eyeDx = wind > .5 ? -2 : dash ? 2 : 0; glowK = .7 + wind * .3;
  } else {                                                                     // blinker — 가로 띠로 어긋남
    const near = clamp(1 - f.cd / (BALANCE.blinkerCd || 150), 0, 1), going = f.warp > 0 ? 1 - f.warp / 26 : 0;
    const amp = Math.round(1 + near * near * 4 + going * 9), c = B.L.one, BH = 6;
    for (let b = 0, y = 6; y < H; y += BH, b++) {
      const off = Math.round(Math.sin(t * .23 + b * 1.9 + ph) * amp * (b % 2 ? 1 : -.7));
      g.drawImage(c, 0, y, W, BH, x0 + off, y0 + y - (br ? 1 : 0), W, BH);
      if (flash > 0) { const a = g.globalAlpha; g.globalAlpha = a * flash; g.drawImage(B.Wt.one, 0, y, W, BH, x0 + off, y0 + y - (br ? 1 : 0), W, BH); g.globalAlpha = a; }
      if (b === 2) eyeDx = off;
    }
    eyeDy = br ? -1 : 0; glowK = .7 + near * .3;
  }

  /* 눈 — 구운 그림 위에 매 장 찍음. [x, y] 는 눈구멍 가운데 두 칸의 왼쪽 위.
     뻥 뚫린 검은 구멍(세로로 긴 타원) 안에 희미한 불씨 한 점 — 공격이 가까우면 밝아짐. 구멍 아래로 눈물 · 핏물이 흘러내림.
     졸린 눈(고름 단지) — 무거운 눈꺼풀 아래 한 줄 · 틈새의 불씨(뼈 가면) */
  const ink = `rgb(${PAL.ink})`, sh = `rgb(${P.skin[0]})`;
  const lit = `rgb(${P.eye.map(v => Math.min(255, v * (.2 + glowK * .7)) | 0)})`, hi = `rgb(${P.eyeH})`, tear = P.tear ? `rgb(${P.tear})` : null;
  B.eyes.forEach(([ex, ey], i) => {
    let x = ex;
    if (B.facing && fc) x = W - 2 - ex;
    x += x0 + (f.type === 'blinker' ? eyeDx : f.type === 'splitter' ? (i === 0 ? -eyeDx : eyeDx + ((t >> 2) % 2 && eyeDx > 1 ? 1 : 0)) : B.facing ? (fc ? -eyeDx : eyeDx) : 0);
    const y = ey + y0 + eyeDy;
    if (B.tiny) { g.fillStyle = lit; g.fillRect(x, y, 2, 2); g.fillStyle = hi; g.fillRect(fc ? x : x + 1, y, 1, 1); return; }
    let bot;                                                                   // 구멍의 맨 아래 줄
    if (B.sleepy) {                                                            // 무거운 눈꺼풀 아래 한 줄
      g.fillStyle = ink; g.fillRect(x - 1, y, 4, 3); g.fillRect(x, y + 3, 2, 1);
      g.fillStyle = lit; g.fillRect(x - 1, y + 2, 4, 1); bot = y + 3;
    } else if (B.small) {
      g.fillStyle = sh; g.fillRect(x - 2, y - 1, 6, 5);
      g.fillStyle = ink; g.fillRect(x - 1, y, 4, 3); g.fillRect(x, y - 1, 2, 5); bot = y + 3;
      if (glowK > .8) { g.fillStyle = lit; g.fillRect(x + 1, y + 1, 1, 1); }
    } else {
      g.fillStyle = sh; g.fillRect(x - 2, y - 2, 6, 7); g.fillRect(x - 1, y - 3, 4, 9);       // 푹 꺼진 눈두덩
      g.fillStyle = ink; g.fillRect(x - 1, y - 1, 4, 5); g.fillRect(x, y - 2, 2, 7); bot = y + 4;
      g.fillStyle = lit; g.fillRect(x + (i ? 0 : 1), y + 1, 1, glowK > .85 ? 2 : 1);   // 구멍 속의 불씨
    }
    if (tear && B.tears) {                                                     // 흘러내리는 눈물 — 길어졌다 떨어짐
      const cyc = (t + i * 23 + (ph * 9 | 0)) % 64, len = 2 + (cyc >> 4), tx = x + (i % 2);
      g.fillStyle = tear; g.fillRect(tx, bot + 1, 1, len);
      if (cyc > 44) g.fillRect(tx, bot + len + 2 + ((cyc - 44) >> 2), 1, 1);
    }
  });
  g.imageSmoothingEnabled = sm;
}
window.FoePix = { draw, bake, W, H, SKIN, Slab, hex, white, flipX };
})();
