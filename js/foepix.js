'use strict';
/* ═══════════════════════════════════════════════════════════
   foepix.js — 잡몹 도트 그림 (손으로 찍은 결의 픽셀 스프라이트)

   예전(foeart.js)엔 캔버스 곡선으로 그린 뒤 가장자리만 계단으로 정리해서, 덩어리는 둥글둥글 · 명암은 한두 겹 · 얼굴은 흐릿했습니다.
   여기선 처음부터 게임 픽셀 단위로 「조각」합니다 :
     · 덩어리마다 왼쪽 위에서 드는 빛을 받아 4단계로 딱 끊어지는 명암 (그늘 쪽은 차갑게 · 밝은 쪽은 따뜻하게 색이 돎)
     · 아래 가장자리엔 바닥에서 되비친 빛 한 줄
     · 외곽선은 한 겹 — 빛 받는 쪽은 그 덩어리의 짙은 색, 그늘 쪽은 거의 검정 (selective outline)
     · 눈 · 이빨 · 갓의 점 · 금 간 자리는 글자 그림으로 한 점씩 찍음
   종류마다 실루엣이 하는 짓을 말합니다 (foeart.js 의 설계 그대로) :
     버섯 — 넓은 갓 · 굵은 자루, 그냥 걸어옴          뱉는것 — 앞으로 말린 나팔, 목주머니가 차오르면 뱉음
     포자충 — 뒤집힌 대접에 빛나는 것이 고임, 부풀면 떨굼   분열체 — 둘이 붙은 몸, 맞을수록 틈이 벌어짐 · 새끼 — 그 반쪽
     돌진체 — 머리에 굳은 판, 달아오르면 튀어나옴        점멸체 — 발 없이 뜬 몸이 가로 띠로 어긋남, 커지면 사라짐

   한 번 구워 두고(종류 · 단계마다 작은 캔버스) 게임 중엔 그림 몇 장 찍는 값 — 예전처럼 매 장 픽셀을 읽고 다시 칠하지 않습니다.
   쓰는 곳 : game.js drawFoe → FoePix.draw(g, f, t, flash)
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
    const th = o.th || [-.08, .38, .8], flat = o.flat || 0;
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

/* ── 색 — 덩어리마다 [그늘, 중간, 밝음, 가장 밝음, 되비친 빛] : 그늘은 푸른 쪽으로 · 밝은 곳은 따뜻한 쪽으로 돌려 둠 ── */
const R = (...h) => h.map(hex);
const PAL = {
  ink: hex('#0d0a14'),
  stalk: R('#3a3350', '#74698c', '#b3a9c2', '#e9e2ea', '#4d4a78'),                 // 자루 — 창백한 살
  shroom:   { cap: R('#3f1d55', '#7a3586', '#b85aa6', '#f29ccb', '#553a8c'), spot: hex('#f6e3d4'), spotD: hex('#b98aa8'), lit: hex('#2a123a'), eye: hex('#ff5a36'), eyeH: hex('#ffe2a8') },
  spitter:  { cap: R('#173d2c', '#2f7a44', '#6fba4e', '#d2ec7a', '#1f5560'), lit: hex('#0f2a20'), sac: R('#56701c', '#a4c832', '#e2f26a', '#fbffc4'), hole: hex('#071410'), eye: hex('#b6ff8a'), eyeH: hex('#f4ffd6'),
              stalk: R('#27382f', '#5c7a62', '#a3bd98', '#dfead0', '#2f4f58') },
  sporer:   { cap: R('#4b2f12', '#93661c', '#d6a42e', '#fbe07a', '#6a4a52'), lit: hex('#30200c'), pool: R('#c98a1a', '#ffd23e', '#fff3a6'), eye: hex('#ffe86a'), eyeH: hex('#fffbd0'),
              stalk: R('#3a2c20', '#7a6446', '#b9a274', '#ead9a8', '#51465c') },
  splitter: { cap: R('#26195a', '#4b36a6', '#8262e2', '#c9b2ff', '#2f3f8c'), spot: hex('#e7dcff'), spotD: hex('#7d6ac0'), lit: hex('#170f3c'), flesh: R('#7a1f6e', '#d44aa8', '#ff9ad8'), eye: hex('#d6a8ff'), eyeH: hex('#fbf0ff') },
  charger:  { cap: R('#5a1f10', '#a83e18', '#e87a26', '#ffcf72', '#7a3550'), lit: hex('#3a140a'), hot: R('#ff7a2a', '#ffc45a', '#fff0b8'), eye: hex('#ffa84a'), eyeH: hex('#fff0c0'),
              stalk: R('#241a1c', '#52403c', '#8a6f62', '#c2a892', '#3a3350'), horn: R('#6c5f52', '#b8a88e', '#efe6cc') },
  blinker:  { cap: R('#0f3440', '#187a78', '#3fc8ae', '#b4f8de', '#1c4c7a'), lit: hex('#0a232c'), eye: hex('#8cf6e0'), eyeH: hex('#f0fffa'),
              stalk: R('#12303c', '#2a6a72', '#62b4b0', '#c0eee2', '#1c3f66') }
};

/* ── 한 종 = 층(layer) 몇 장 + 눈 자리. 층마다 따로 구워 두고, 그릴 때 한 픽셀씩 어긋나게 움직여 숨을 쉽니다 ── */
const W = 48, H = 44, GY = 40;                               // 칸 크기 · 발바닥 줄
const mk = () => new Slab(W, H);
const gills = (s, x0, x1, y, col, colD) => { for (let x = x0; x <= x1; x++) s.set(x, y, (x & 1) ? col : colD, 0); };
const spots = (s, list, c, cd) => list.forEach(([x, y, w, h]) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s.over(x + i, y + j, c, 3); for (let i = 0; i < w; i++) s.over(x + i + (w > 1 ? 0 : 0), y + h, cd); });
const under = (s, y, x0, x1, col, half) => { for (let x = x0; x <= x1; x++) { s.over(x, y, col, 0); if (half && x > (x0 + x1) / 2 + 1) s.over(x, y + 1, col, 0); } };   // 갓이 드리운 그늘
const feet = (s, xs, y, col, colD) => xs.forEach(x => { s.rect(x, y, 4, 2, col, 1); s.rect(x, y + 1, 4, 1, colD, 0); });

const BUILD = {
  /* 버섯 — 넓고 둔한 갓 · 굵은 자루 · 성난 붉은 눈 */
  shroom() {
    const P = PAL.shroom, st = PAL.stalk;
    const body = f => { const s = mk();
      feet(s, f ? [16, 27] : [17, 26], GY - 2, st[1], st[0]); if (f) s.rect(16, GY - 3, 4, 1, st[1]);
      s.ell(24, 30.5, 8.6, 9, st, { y1: GY - 2 });
      under(s, 27, 14, 34, st[0], true);
      s.stamp(19, 34, ['kwkwk', '.kkk.'], { k: PAL.ink, w: st[3] });                 // 이빨 드러낸 입
      return s.outline(PAL.ink, hex('#241d36')); };
    const cap = () => { const s = mk();
      s.ell(24, 21, 15.6, 11.4, P.cap, { y1: 24 });
      gills(s, 11, 37, 25, P.cap[0], hex('#24103a')); for (let x = 13; x <= 35; x++) s.set(x, 26, hex('#24103a'), 0);
      spots(s, [[13, 15, 3, 2], [19, 12, 4, 3], [28, 14, 3, 2], [16, 19, 2, 2], [24, 18, 3, 2], [33, 18, 3, 2], [9, 21, 2, 1], [30, 21, 2, 1]], P.spot, P.spotD);
      return s.outline(PAL.ink, P.lit); };
    return { layers: { bodyA: body(0), bodyB: body(1), cap: cap() }, eyes: [[19, 29, 1], [27, 29, -1]], brow: true, P };
  },
  /* 뱉는것 — 앞으로 말린 나팔 갓 · 불룩한 목주머니 (오른쪽을 보는 그림 — 왼쪽은 뒤집어) */
  spitter() {
    const P = PAL.spitter, st = P.stalk;
    const body = () => { const s = mk();
      feet(s, [16, 24], GY - 2, st[1], st[0]);
      s.ell(22, 31, 8.4, 8.6, st, { y1: GY - 2 });
      under(s, 26, 13, 31, st[0], true);
      s.stamp(24, 35, ['kk', '.k'], { k: PAL.ink });                                  // 꾹 다문 입
      return s.outline(PAL.ink, hex('#18251e')); };
    const sac = k => { const s = mk(), r = 3 + k * 1.6;                                // 목주머니 — 차오를수록 크고 밝게
      s.ell(29.5, 32 - k * .4, r, r * .95, k > 1 ? P.sac.slice(1).concat([P.sac[3]]) : P.sac, { th: [-.2, .3, .72] });
      return s.outline(hex('#22300c'), hex('#3a4a12')); };
    const cap = () => { const s = mk();
      for (let x = 13; x <= 31; x++) { const u = (x - 13) / 18, cy = 21 - u * 3.2, hh = 3 + u * 5.2;               // 나팔 몸 — 뒤는 가늘고 앞은 벌어짐
        for (let y = Math.round(cy - hh); y <= Math.round(cy + hh); y++) { const v = (y - cy) / hh; s.set(x, y, P.cap[v < -.55 ? 3 : v < -.1 ? 2 : v < .5 ? 1 : 0], v < -.55 ? 3 : v < -.1 ? 2 : v < .5 ? 1 : 0); } }
      for (let x = 15; x <= 29; x += 3) for (let y = 12; y <= 30; y++) if (s.has(x, y) && s.tone[y * W + x] > 0 && ((y + x) % 3 === 0)) s.over(x, y, P.cap[s.tone[y * W + x] - 1]);   // 결 (세로 주름)
      s.ell(33, 17.5, 4.6, 9.2, [P.cap[1], P.cap[2], P.cap[3], P.cap[3]], { th: [-.3, .1, .6] });   // 나팔 입술
      s.ell(33.6, 17.8, 2.9, 6.6, [P.hole, P.hole, hex('#123a2a')], { th: [-2, .86, 2] });          // 어두운 속
      return s.outline(PAL.ink, P.lit); };
    return { layers: { body: body(), cap: cap(), sac0: sac(0), sac1: sac(1), sac2: sac(2) }, eyes: [[23, 29, 0]], facing: true, P };
  },
  /* 포자충 — 뒤집힌 대접 갓에 빛나는 것이 고이고, 축 늘어진 주머니 몸이 부풀었다 꺼짐 */
  sporer() {
    const P = PAL.sporer, st = P.stalk;
    const body = k => { const s = mk(), rx = 10.4 + k * 1.3, ry = 9.4 + k * 1.1;
      feet(s, [15, 29], GY - 2, st[1], st[0]);
      s.ell(24, 30.5 - k * .5, rx, ry, st, { y1: GY - 2 });
      for (let i = 0; i < 4; i++) s.over(17 + i * 4 + (i & 1), 36 - (i & 1), st[0], 0);     // 늘어진 주름
      under(s, 27, 12, 36, st[0], true);
      s.stamp(21, 34, ['.kkk.', 'k...k'], { k: PAL.ink });                                  // 축 처진 입
      return s.outline(PAL.ink, hex('#2a2018')); };
    const cap = () => { const s = mk();
      s.ell(24, 16, 14.4, 10.4, P.cap, { y0: 16, th: [-.3, .15, .66] });                     // 대접의 바깥 (아래 반)
      s.ell(24, 15.5, 14.4, 5, [P.cap[2], P.cap[3], P.cap[3], P.cap[3]], { th: [-.5, -.1, .4] });   // 두툼한 테두리
      s.ell(24, 16, 12.2, 3.7, [hex('#2a1808'), hex('#4b2f12'), hex('#6e4a14')], { th: [-.3, .5, 2] });   // 안벽 — 어두움
      s.ell(24, 17, 9.8, 2.4, P.pool, { th: [-.4, .3, 2] });                                  // 바닥에 고인 빛
      s.set(18, 16, P.pool[2], 3); s.set(19, 16, P.pool[2], 3); s.set(20, 17, P.pool[2], 3); s.set(28, 18, P.pool[2], 3);
      [[13, 21], [19, 24], [28, 23], [33, 20]].forEach(([x, y]) => { s.over(x, y, P.cap[0]); s.over(x + 1, y, P.cap[0]); s.over(x, y + 1, P.cap[0]); });   // 묵은 얼룩
      s.set(9, 20, P.pool[1], 2); s.set(9, 21, P.pool[1], 2); s.set(9, 22, P.pool[0], 1); s.set(38, 19, P.pool[1], 2); s.set(38, 20, P.pool[0], 1);        // 넘쳐 흐르는 방울
      return s.outline(PAL.ink, P.lit); };
    return { layers: { body0: body(0), body1: body(1), body2: body(2), cap: cap() }, eyes: [[18, 29, 0], [28, 29, 0]], sleepy: true, P };
  },
  /* 분열체 — 둘이 억지로 붙은 몸 (반쪽 두 장을 틈만큼 벌려 그림) */
  splitter() {
    const P = PAL.splitter, st = PAL.stalk;
    const half = () => { const s = mk();                                                  // 왼쪽 반 (오른쪽은 뒤집어)
      feet(s, [13], GY - 2, st[1], st[0]);
      s.ell(18, 31, 7.8, 8.6, st, { y1: GY - 2, x1: 23 });
      under(s, 26, 9, 23, st[0], false);
      s.stamp(15, 34, ['kwk', '.k.'], { k: PAL.ink, w: st[3] });
      s.ell(17, 21, 11.2, 9.6, P.cap, { y1: 24, x1: 23 });
      gills(s, 8, 23, 25, P.cap[0], hex('#150e38'));
      spots(s, [[10, 16, 3, 2], [16, 13, 3, 2], [13, 20, 2, 2], [20, 18, 2, 2]], P.spot, P.spotD);
      for (let y = 12; y <= GY - 3; y++) if (s.has(23, y)) s.set(23, y, P.flesh[(y * 7) % 3 === 0 ? 2 : 1], 2);   // 찢긴 단면 — 속살이 빛남
      for (let y = 13; y <= GY - 3; y += 3) if (s.has(22, y)) s.set(22, y, P.flesh[0], 1);
      return s.outline(PAL.ink, P.lit); };
    const h = half();
    return { layers: { L: h.canvas(), R: flipX(h.canvas()) }, raw: true, eyes: [[15, 29, 1], [31, 29, -1]], brow: true, P };
  },
  /* 새끼 — 분열체의 반쪽 하나. 작고, 찢긴 쪽이 그대로 빛남 */
  mini() {
    const P = PAL.splitter, st = PAL.stalk;
    const s = mk();
    feet(s, [19], GY - 2, st[1], st[0]);
    s.ell(23, 33.5, 5.6, 6, st, { y1: GY - 2, x1: 27 });
    s.ell(22, 26.5, 8.2, 6.8, P.cap, { y1: 28, x1: 27 });
    gills(s, 15, 27, 29, P.cap[0], hex('#150e38'));
    spots(s, [[17, 23, 2, 2], [22, 21, 2, 1], [20, 26, 2, 1]], P.spot, P.spotD);
    for (let y = 20; y <= GY - 3; y++) if (s.has(27, y)) s.set(27, y, P.flesh[(y * 5) % 3 === 0 ? 2 : 1], 2);
    s.outline(PAL.ink, P.lit);
    return { layers: { one: s.canvas(), oneF: flipX(s.canvas()) }, raw: true, eyes: [[21, 32, 0]], small: true, P };
  },
  /* 돌진체 — 머리에 굳은 판(뿔 달린 투구)을 쓰고 낮게 웅크린 몸. 판의 눈구멍 틈에서 눈이 빛남 (오른쪽을 봄) */
  charger() {
    const P = PAL.charger, st = P.stalk;
    const body = lo => { const s = mk();
      s.stamp(8, GY - 5 + lo, ['.dd.', 'dmmd', 'dmm.', 'ddd.'].slice(0, 4 - lo), { d: st[0], m: st[1] });          // 뒷다리 — 땅을 짚음
      feet(s, lo ? [15, 24] : [16, 25], GY - 2, st[1], st[0]);
      s.ell(20, 31.5 + lo, 11.8, 7.4 - lo * .7, st, { y1: GY - 2, th: [-.05, .42, .82] });
      for (const x of [13, 18]) for (let y = 25; y <= GY - 3; y++) if (s.has(x, y)) s.over(x, y, st[0], 0);            // 등딱지 마디
      s.over(14, 27 + lo, st[3], 3); s.over(15, 27 + lo, st[3], 3); s.over(19, 26 + lo, st[3], 3);
      return s.outline(PAL.ink, hex('#1a1214')); };
    const cap = () => { const s = mk();
      s.ell(30, 25.5, 11.6, 10.6, P.cap, { x0: 21, y1: 31, flat: .28, th: [-.12, .32, .74] });              // 이마판
      [[21, 19], [21, 20], [22, 27], [21, 28], [21, 24]].forEach(([x, y]) => s.clear(x, y));                 // 뒷가장자리의 깨진 이
      s.stamp(26, 18, ['d..', '.d.', '.dd', '..d'], { d: P.cap[0] });                                         // 금
      s.stamp(33, 16, ['.d', 'd.', 'dd'], { d: P.cap[0] });
      for (let x = 28; x <= 40; x++) for (let y = 27; y <= 29; y++) if (s.has(x, y)) s.set(x, y, hex('#1c0806'), 0);   // 눈구멍 틈
      for (let x = 27; x <= 41; x++) if (s.has(x, 26) && s.tone[26 * W + x] > 0) s.over(x, 26, P.cap[3], 3);         // 틈 위의 도드라진 눈두덩
      s.stamp(36, 11, ['...h', '..hH', '.hHd', 'hHd.', 'Hd..'], { h: P.horn[1], H: P.horn[2], d: P.horn[0] });         // 앞뿔
      s.stamp(27, 10, ['.h.', '.hH', 'hHd', 'Hd.'], { h: P.horn[1], H: P.horn[2], d: P.horn[0] });                     // 뒷뿔
      for (let x = 25; x <= 40; x++) if (s.has(x, 31)) s.set(x, 32, hex('#2a0d08'), 0);                      // 판 아래 그늘
      return s.outline(PAL.ink, P.lit); };
    const hot = () => { const s = mk();                                                                     // 달아오른 판 — 예비 동작 때 덧그림
      s.ell(30, 25.5, 9.8, 8.8, [P.hot[0], P.hot[0], P.hot[1], P.hot[2]], { x0: 23, y1: 25, flat: .28, th: [-.1, .3, .7] });
      return s; };
    return { layers: { body: body(0), bodyLo: body(1), cap: cap(), hot: hot() }, eyes: [[31, 27, 0], [36, 27, 0]], facing: true, tiny: true, P };
  },
  /* 점멸체 — 발 없이 뜬 몸. 가로 띠로 어긋나며, 어긋남이 커지면 사라짐 */
  blinker() {
    const P = PAL.blinker, st = P.stalk;
    const s = mk();
    for (let y = 24; y <= 38; y++) { const u = (y - 24) / 14, hw = 6.4 * (1 - u * u * .85) + .6, cx = 24 + Math.sin(u * 3.2) * 1.6;      // 아래로 가늘어지는 꼬리
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) { const v = (x - cx) / hw; s.set(x, y, st[v < -.45 ? 2 : v < .35 ? 1 : 0], v < -.45 ? 2 : v < .35 ? 1 : 0); } }
    s.over(23, 37, st[2], 2); s.over(25, 38, st[1]);
    s.ell(24, 20, 12.2, 9.4, P.cap, { y1: 23 });
    gills(s, 14, 34, 24, P.cap[0], hex('#082028'));
    spots(s, [[16, 15, 2, 2], [22, 13, 3, 1], [29, 16, 2, 2], [19, 19, 2, 1], [27, 20, 2, 1]], P.cap[3], P.cap[1]);
    s.outline(PAL.ink, P.lit);
    return { layers: { one: s.canvas() }, raw: true, eyes: [[20, 27, 0], [26, 27, 0]], hollow: true, P };
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
  const x0 = Math.round(f.x) - OX, y0 = Math.round(f.y) - OY + (f.type === 'blinker' ? Math.round(Math.sin((f.bob || 0) * .8) * 2) - 2 : 0);   // 점멸체는 떠서 흔들림
  const ph = f.bob || 0, br = Math.sin(ph) > 0 ? 1 : 0;                        // 숨 — 한 픽셀
  const fc = (f.face || 1) < 0, sfx = fc ? '_f' : '';
  const put = (name, dx, dy) => { const c = B.L[name]; if (!c) return; g.drawImage(c, x0 + dx, y0 + dy); if (flash > 0) { const a = g.globalAlpha; g.globalAlpha = a * flash; g.drawImage(B.Wt[name], x0 + dx, y0 + dy); g.globalAlpha = a; } };
  const mx = x => fc ? W - 1 - x : x;                                          // 좌우 뒤집힌 자리
  const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
  let eyeDy = 0, eyeDx = 0, glowK = .72 + Math.sin(t * .07 + ph) * .28;

  if (f.type === 'shroom') {
    const step = Math.sin(ph * 1.6) > 0;
    put(step ? 'bodyA' : 'bodyB', 0, 0); put('cap', 0, br ? -1 : 0);
  } else if (f.type === 'spitter') {
    const charge = clamp(1 - f.cd / (BALANCE.spitterCd || 138), 0, 1), kick = charge > .93;
    put('body' + sfx, 0, 0);
    put((charge > .72 ? 'sac2' : charge > .4 ? 'sac1' : 'sac0') + sfx, 0, charge > .72 && (t >> 2) % 2 ? -1 : 0);
    put('cap' + sfx, (kick ? -2 : 0) * (fc ? -1 : 1), br ? -1 : 0);
    glowK = .6 + charge * .4;
  } else if (f.type === 'sporer') {
    const ready = clamp(1 - f.cd / (BALANCE.sporerCd || 124), 0, 1), k = ready > .78 ? 2 : (ready > .45 || br) ? 1 : 0;
    put('body' + k, 0, 0); put('cap', 0, -k + (br && k < 2 ? 0 : 0));
    eyeDy = k === 2 ? -1 : 0; glowK = .55 + ready * .45;
    if (ready > .6 && (t >> 3) % 2) { g.fillStyle = `rgb(${P.pool[2]})`; g.fillRect(x0 + 16 + ((t >> 3) % 5) * 3, y0 + 13 - k - ((t >> 2) % 3), 1, 1); }   // 피어오르는 홀씨
  } else if (f.type === 'splitter') {
    const hurt = 1 - clamp(f.hp / (f.max || 1), 0, 1), gap = hurt > .66 ? 3 : hurt > .33 ? 2 : hurt > 0 ? 1 : 0, wob = gap > 1 && (t >> 2) % 2 ? 1 : 0;
    if (gap) { g.fillStyle = `rgb(${P.flesh[1]})`; g.fillRect(x0 + 24 - gap, y0 + 16, gap * 2, 22); g.fillStyle = `rgb(${P.flesh[2]})`; g.fillRect(x0 + 24 - (gap > 1 ? 1 : 0), y0 + 18 + ((t >> 2) % 4), gap > 1 ? 2 : 1, 12); }   // 벌어진 틈으로 비치는 속
    put('L', -gap, br ? -1 : 0); put('R', gap + wob, br ? 0 : -1);
    eyeDx = gap;
  } else if (f.type === 'mini') {
    put((f.side || 1) > 0 ? 'one' : 'oneF', 0, br ? -1 : 0); eyeDy = br ? -1 : 0;
  } else if (f.type === 'charger') {
    const wind = f.wind > 0 ? clamp(1 - f.wind / (BALANCE.chargerWind || 34), 0, 1) : 0, dash = f.dash > 0, sgn = fc ? -1 : 1;
    if (dash) { const a = g.globalAlpha; for (let i = 3; i >= 1; i--) { g.globalAlpha = a * (.34 - i * .08); g.drawImage(B.L['cap' + sfx], x0 - sgn * i * 7, y0); g.drawImage(B.L['body' + sfx], x0 - sgn * i * 7, y0); } g.globalAlpha = a; }   // 잔상
    put((wind > .15 ? 'bodyLo' : 'body') + sfx, wind > .5 ? -sgn : 0, 0);
    put('cap' + sfx, (wind > .5 ? -sgn * 2 : dash ? sgn * 2 : 0), (wind > .15 ? 1 : 0) + (br && !wind && !dash ? -1 : 0));
    if (wind > .05) { const a = g.globalAlpha; g.globalAlpha = a * wind * ((t >> 1) % 2 ? 1 : .7); g.drawImage(B.L['hot' + sfx], x0 + (wind > .5 ? -sgn * 2 : 0), y0 + (wind > .15 ? 1 : 0)); g.globalAlpha = a; }   // 달아오른 판
    eyeDy = wind > .15 ? 1 : 0; eyeDx = wind > .5 ? -2 : dash ? 2 : 0; glowK = .7 + wind * .3;
  } else {                                                                     // blinker — 가로 띠로 어긋남
    const near = clamp(1 - f.cd / (BALANCE.blinkerCd || 150), 0, 1), going = f.warp > 0 ? 1 - f.warp / 26 : 0;
    const amp = Math.round(1 + near * near * 4 + going * 9), c = B.L.one, BH = 6;
    for (let b = 0, y = 6; y < H; y += BH, b++) {
      const off = Math.round(Math.sin(t * .23 + b * 1.9 + ph) * amp * (b % 2 ? 1 : -.7));
      g.drawImage(c, 0, y, W, BH, x0 + off, y0 + y - (br ? 1 : 0), W, BH);
      if (flash > 0) { const a = g.globalAlpha; g.globalAlpha = a * flash; g.drawImage(B.Wt.one, 0, y, W, BH, x0 + off, y0 + y - (br ? 1 : 0), W, BH); g.globalAlpha = a; }
      if (b === 3) eyeDx = off;
    }
    eyeDy = br ? -1 : 0; glowK = .7 + near * .3;
  }

  /* 눈 — 구운 그림 위에 매 장 찍음 (빛이 느리게 뛰고, 가끔 감음). [x, y, 기울기] 는 빛나는 2×3 의 왼쪽 위.
     종류마다 눈매가 다름 : 성난 눈(안쪽 위가 깎임) · 졸린 눈(아래 한 줄만 뜸) · 뻥 뚫린 눈(가운데 검은 점) · 틈새의 불씨(돌진체) */
  const blink = ((t + (ph * 40 | 0)) % 190) < 5, ink = `rgb(${PAL.ink})`;
  const lit = `rgb(${P.eye.map(v => Math.min(255, v * (.5 + glowK * .5)) | 0)})`, dim = `rgb(${P.eye.map(v => v * .4 | 0)})`, hi = `rgb(${P.eyeH})`;
  B.eyes.forEach(([ex, ey, slant], i) => {
    let x = ex, sl = slant;
    if (B.facing && fc) { x = W - 2 - ex; sl = -slant; }
    x += x0 + (f.type === 'blinker' ? eyeDx : f.type === 'splitter' ? (i === 0 ? -eyeDx : eyeDx + ((t >> 2) % 2 && eyeDx > 1 ? 1 : 0)) : B.facing ? (fc ? -eyeDx : eyeDx) : 0);
    const y = ey + y0 + eyeDy;
    if (B.tiny) { if (blink) return; g.fillStyle = lit; g.fillRect(x, y, 2, 2); g.fillStyle = hi; g.fillRect(fc ? x : x + 1, y, 1, 1); return; }
    if (B.sleepy) {                                                            // 무거운 눈꺼풀 아래 한 줄
      g.fillStyle = ink; g.fillRect(x - 1, y, 4, 3); g.fillRect(x, y + 3, 2, 1);
      if (!blink) { g.fillStyle = lit; g.fillRect(x - 1, y + 2, 4, 1); g.fillStyle = hi; g.fillRect(x - 1, y + 2, 1, 1); }
      return;
    }
    g.fillStyle = ink; g.fillRect(x - 1, y, 4, 3); g.fillRect(x, y - 1, 2, 5);   // 눈구멍 — 모서리를 깎아 둥글게
    if (blink || flash > .6) { g.fillStyle = dim; g.fillRect(x, y + 2, 2, 1); return; }
    g.fillStyle = lit; g.fillRect(x, y, 2, 3);
    if (B.brow && sl) { g.fillStyle = ink; g.fillRect(sl > 0 ? x + 1 : x, y, 1, 1); g.fillStyle = hi; g.fillRect(sl > 0 ? x : x + 1, y + 1, 1, 1); }   // 성난 눈 — 안쪽 위를 깎음
    else { g.fillStyle = hi; g.fillRect(x, y, 1, 1); }
    if (B.hollow) { g.fillStyle = ink; g.fillRect(x + 1, y + 1, 1, 1); }
  });
  g.imageSmoothingEnabled = sm;
}
window.FoePix = { draw, bake, W, H };
})();
