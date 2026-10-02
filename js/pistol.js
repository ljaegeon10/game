'use strict';
/* ═══════════════════════════════════════════════════════════════
   pistol.js — 1인칭 픽셀 피스톨 · 장전 모션 시트 (공용)

   시작할 때 한 번, 128×96 칸마다 피스톨을 "색 번호 버퍼"에 그린 뒤
   외곽선을 자동으로 둘러 시트로 굽습니다.
   쓰는 곳 : 탈출 총격전(js/escape.js) · 시연 페이지(prototypes/pistol.html)

   그리는 법 — 픽셀 아트의 기본기를 코드로
     · 금속 · 폴리머는 면마다 명암 함수 → 4~6단 색 계단으로 양자화
       (경계는 4×4 베이어 디더로 부드럽게)
     · 손가락 · 손바닥 · 팔은 캡슐/타원 — 픽셀마다 둥근 법선을 세워
       왼쪽 위에서 오는 빛으로 명암 (그래서 덩어리가 아니라 둥글게 보임)
     · 다 그린 뒤 바깥 외곽선 1px, 나중에 그린 부품의 가장자리엔 안쪽 선
     · 형광 청록(#00FFD5)은 가늠자 · 톱니 · 탄창 멈치 · 손목 표시등에만
     · 오방색 단청은 손잡이 안쪽 패널 하나와 탄창에만

            col 0        col 1          col 2          col 3
     row0   조준 ★       배출 준비       탄창 아래       손이 슬라이드에
     row1   숨 (위)      멈치 누름       밀어 넣는 중 ★  당기기 시작
     row2   숨 (위)      탄창 빠짐 ★     거의 다         끝까지 — 챔버 열림 ★
     row3   쏜 순간      빈 손잡이       철컥 (손바닥)   놓음 — 제자리로
     조준 칸(col 0)은 뒤쪽 비스듬한 위에서 본 원근 — 총구가 조준점(AT.aim)을
     향합니다. 장전 칸(col 1~3)은 총을 옆으로 눕혀 보여 줍니다.
     row4   [낙하 탄창 · 탄피 — 낱개 스프라이트]
     ★ = 대표 프레임 (KEY)

   시트는 두 장 — 본 그림(sheet)과 형광 청록만 담은 글로우 마스크(mask).
   ═══════════════════════════════════════════════════════════════ */
(() => {
const FW = 128, FH = 96, N = FW * FH;
const COLS = 4, SUBS = 4, UTIL_ROW = 4;
const KEY = [0, 2, 1, 2];
const IDLE_ROWS = [0, 1, 2, 1], FIRE_ROW = 3;      // 조준 칸 — 숨 순서 · 쏜 순간
const LABEL = [['01', 'IDLE', '대기'], ['02', 'MAG RELEASE', '탄창 배출'],
               ['03', 'INSERT MAG', '새 탄창 삽입'], ['04', 'RACK SLIDE', '슬라이드 당기기']];

/* ── 색 계단 (어두움 → 밝음) ── */
const RAMP = {
  metal: ['#0b0d11', '#171b22', '#242a33', '#353d49', '#4f5967', '#7c8899', '#aeb9c7'],
  poly:  ['#090a0d', '#111318', '#1a1d24', '#242831', '#30353f', '#404652'],
  glove: ['#0c0d10', '#16171b', '#202228', '#2d3037', '#3e424b', '#565b66'],
  pad:   ['#07080a', '#0f1013', '#181a1e', '#24262c'],
  gown:  ['#101719', '#1a2629', '#273739', '#384c4f', '#506a6d', '#6d8a8d'],
  brass: ['#36260e', '#6a4e1e', '#a3802d', '#d2ad55', '#f0d891'],
  void:  ['#030405']
};
const OUT = '#040507';
const T = '#00ffd5', T2 = '#00b89a', T3 = '#00574b';
const OB = { R: '#b0362d', B: '#2d64a3', Y: '#cfa23b', W: '#e2d9c4', Bk: '#141318' };
const OBANG = [OB.B, OB.W, OB.R, OB.Bk, OB.Y];
const C = { ...OB, T, T2, T3, OUT };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LIGHT = (() => { const v = [-.48, -.74, .47], m = Math.hypot(...v); return v.map(a => a / m); })();
const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/* ═════════════ 색 번호 버퍼 ════════════════════════════════════ */
function newBuf() {
  return { col: new Array(N).fill(null), dk: new Array(N).fill(null), part: new Int32Array(N),
           ln: new Uint8Array(N), gl: new Uint8Array(N), pid: 0, ox: 0, oy: 0, lines: true, glow: false };
}
function part(B, lines = true, glow = false) { B.pid++; B.lines = lines; B.glow = glow; }
function put(B, x, y, c, dk) {
  x = Math.floor(x + B.ox); y = Math.floor(y + B.oy);
  if (x < 0 || y < 0 || x >= FW || y >= FH) return;
  const i = y * FW + x;
  B.col[i] = c; B.dk[i] = dk || c; B.part[i] = B.pid; B.ln[i] = B.lines ? 1 : 0; B.gl[i] = B.glow ? 1 : 0;
}
/* 명암(0~1) → 색 계단, 경계는 디더 */
function q(ramp, I, x, y, dither = true) {
  const n = ramp.length - 1;
  const v = Math.max(0, Math.min(1, I)) * n;
  let b = Math.floor(v);
  const f = v - b;
  if (dither ? f > (BAYER[((y & 3) << 2) | (x & 3)] + .5) / 16 : f > .5) b++;
  return ramp[Math.min(n, b)];
}

/* 다각형 — 픽셀 중심으로 채움. shade(x, y) 는 명암 숫자나 색 문자열 */
function poly(B, pts, ramp, shade, o = {}) {
  part(B, o.lines !== false, !!o.glow);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const cy = y + .5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k] - .5); x <= Math.floor(xs[k + 1] - .5); x++) {
        const s = shade(x + .5, cy);
        put(B, x, y, typeof s === 'string' ? s : q(ramp, s, x, y, o.dither !== false), o.dk || ramp[0]);
      }
  }
}
const rect = (B, x, y, w, h, ramp, shade, o) => poly(B, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], ramp, shade, o);

/* 둥근 덩어리 — 픽셀마다 구면 법선을 세워 빛을 받습니다 */
function lit(nx, ny, bias = 0) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return .12 + .88 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) + bias;
}
function capsule(B, ax, ay, bx, by, r, ramp, o = {}) {
  part(B, o.lines !== false, !!o.glow);
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  for (let y = Math.floor(Math.min(ay, by) - r); y <= Math.ceil(Math.max(ay, by) + r); y++)
    for (let x = Math.floor(Math.min(ax, bx) - r); x <= Math.ceil(Math.max(ax, bx) + r); x++) {
      const px = x + .5, py = y + .5;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
      const nx = (px - (ax + t * dx)) / r, ny = (py - (ay + t * dy)) / r;
      if (nx * nx + ny * ny > 1) continue;
      put(B, x, y, q(ramp, lit(nx, ny, o.bias || 0), x, y), ramp[0]);
    }
}
function ellipse(B, cx, cy, rx, ry, ramp, o = {}) {
  part(B, o.lines !== false, !!o.glow);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      put(B, x, y, q(ramp, lit(nx, ny, o.bias || 0), x, y), ramp[0]);
    }
}
/* 장식 픽셀 (선 없음) */
function dot(B, x, y, c, glow = false) { part(B, false, glow); put(B, x, y, c); }

/* 다 그린 뒤 — 바깥 외곽선 · 안쪽 선을 둘러 이미지로 */
const RGBA = {};
function rgba(hex) {
  if (RGBA[hex]) return RGBA[hex];
  const n = parseInt(hex.slice(1), 16);
  return (RGBA[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}
function finalize(B, ctx, mctx, cx, cy) {
  const img = ctx.createImageData(FW, FH), mimg = mctx.createImageData(FW, FH);
  const d = img.data, md = mimg.data;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x;
    let c = B.col[i], glow = B.gl[i];
    const nb = [x > 0 ? i - 1 : -1, x < FW - 1 ? i + 1 : -1, y > 0 ? i - FW : -1, y < FH - 1 ? i + FW : -1];
    if (!c) {
      if (nb.some(j => j >= 0 && B.col[j])) c = OUT; else continue;
    } else if (B.ln[i] && nb.some(j => j >= 0 && B.col[j] && B.part[j] < B.part[i] && B.ln[j] !== 2)) {
      c = B.dk[i]; glow = 0;                       // 위에 얹힌 부품의 가장자리 — 안쪽 선
    }
    const [r, g, b] = rgba(c), k = i * 4;
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
    if (glow) { md[k] = r; md[k + 1] = g; md[k + 2] = b; md[k + 3] = 255; }
  }
  ctx.putImageData(img, cx, cy); mctx.putImageData(mimg, cx, cy);
}

/* ═════════════ 피스톨 — 옆모습, 총구는 왼쪽 ═════════════════════
   좌표는 칸 안의 픽셀. 슬라이드 위 27.5 · 아래 41.5, 손잡이는 47~77. */
const gripFrontL = y => 69 + (y - 47) * .3;                 // 손잡이 앞선 (손가락 홈 빼고)
const gripBack = y => 90 + (y - 47) * (8.6 / 30);
const magF = y => 73 + (y - 48) * .3, magB = y => magF(y) + 15;
const GROOVES = [[67, 47], [69.5, 53], [68.5, 56], [71.5, 59], [70.5, 62], [73.5, 65], [72.5, 68], [75.5, 71], [78, 77.5]];

/* 단청 — 흑 · 색 · (백 꽃잎 지그재그) · 색 · 금선, 띠마다 청 / 적 */
function dancheong(x, y, top, left) {
  const yy = Math.floor(y - top), r = ((yy % 6) + 6) % 6, band = Math.floor(yy / 6);
  const xx = Math.floor(x - left), base = band % 2 ? OB.R : OB.B;
  if (r === 0) return OB.Bk;
  if (r === 5) return OB.Y;
  if ((r === 2 && xx % 4 === 1) || (r === 3 && xx % 4 === 3)) return OB.W;
  return base;
}

function drawMag(B, mo, full, plateOnly = false) {
  const top = 48 + mo, bot = 77 + mo;
  if (!plateOnly) {
  poly(B, [[magF(top), top], [magB(top), top], [magB(bot), bot], [magF(bot), bot]], RAMP.metal,
       (x, y) => .3 + (x - magF(y)) / 15 * .22 - (x - magF(y) < 1.5 ? .12 : 0));
  // 옆면 단청 띠 (손잡이 패널과 같은 무늬, 한 줄)
  poly(B, [[magF(bot - 9) + 2.5, bot - 9], [magB(bot - 9) - 2.5, bot - 9], [magB(bot - 3) - 2.5, bot - 3], [magF(bot - 3) + 2.5, bot - 3]],
       [OB.Bk], (x, y) => dancheong(x, y, bot - 9, magF(bot - 9)), { dk: OB.Bk });
  }
  // 바닥판 — 오방색 줄
  const bx0 = magF(bot) - 1.5, bx1 = magB(bot) + 2;
  poly(B, [[bx0, bot], [bx1, bot], [bx1 + .6, bot + 3.5], [bx0 + .3, bot + 3.5]], RAMP.poly, (x, y) => .55 - (y - bot) * .1);
  part(B, false);
  for (let x = Math.ceil(bx0 + 1); x < bx1 - .5; x++) put(B, x, bot + 1, OBANG[Math.floor((x - bx0) / 3) % 5]);
  if (full) {                                   // 윗탄 — 놋쇠, 청록 탄두
    capsule(B, magF(top) + 2.5, top - 1.5, magB(top) - 3, top - 1.5, 1.7, RAMP.brass);
    part(B, false, true); put(B, magF(top) + .5, top - 2, T); put(B, magF(top) + .5, top - 1, T2);
  }
}

function drawPistol(B, o) {
  const so = o.so || 0, sg = o.sg || 0, S0 = 20 + so, S1 = 96 + so;
  // ── 총열 (슬라이드가 밀리면 앞으로 드러남)
  if (so > 0) {
    rect(B, 20, 31, so + .5, 6.5, RAMP.metal, (x, y) => .62 - (y - 31) * .05);
    part(B, false); for (let y = 33; y <= 35; y++) put(B, 20, y, RAMP.void[0]);
  }
  // ── 프레임 (폴리머) — 더스트 커버 · 레일 홈
  poly(B, [[24, 41.5], [89, 41.5], [89, 47.5], [44, 47.5], [30, 46.6], [24, 44.2]], RAMP.poly,
       (x, y) => .55 - (y - 41.5) / 6 * .3);
  part(B, false); for (let x = 30; x <= 44; x += 3) { put(B, x, 46, RAMP.poly[0]); put(B, x + 1, 46, RAMP.poly[3]); }
  // 방아쇠울 — 둥근 막대 다섯 토막, 방아쇠
  [[46.5, 46.5, 46.5, 53], [46.5, 53, 49.2, 56], [49.2, 56, 62, 56], [62, 56, 66.5, 52.5], [66.5, 52.5, 68, 49]]
    .forEach(([a, b, c, d]) => capsule(B, a, b, c, d, 1.35, RAMP.poly, { lines: false, bias: .1 }));
  capsule(B, 57.6, 47.6, 56.6, 53.2, .95, RAMP.metal, { lines: false });
  // ── 손잡이 — 손가락 홈, 비버테일, 오돌토돌한 질감
  const gp = [[66, 47], [89, 46.5], [96.5, 43.6], [97.4, 45.6], [92, 49.6], [98.6, 77.4], [78, 77.8], ...GROOVES.slice(0, -1).reverse()];
  poly(B, gp, RAMP.poly, (x, y) => {
    const h = hash(x | 0, y | 0);
    let I = .42 + (x - gripFrontL(y)) / 22 * .14 - (y - 47) / 30 * .1;
    if (h < .11) I += .2; else if (h > .9) I -= .16;
    return I;
  });
  // 단청 패널 — 금테 안에 한 장
  const pt = 53, pb = 71.5, pl = y => gripFrontL(y) + 5.2, pr = y => gripBack(y) - 4.2;
  poly(B, [[pl(pt) - 1, pt - 1], [pr(pt) + 1, pt - 1], [pr(pb) + 1, pb + 1], [pl(pb) - 1, pb + 1]], [OB.Y], () => OB.Y, { dk: '#5a4416' });
  poly(B, [[pl(pt), pt], [pr(pt), pt], [pr(pb), pb], [pl(pb), pb]], [OB.Bk], (x, y) => dancheong(x, y, pt, pl(pt)), { lines: false });
  // ── 탄창 — 끼워져 있으면 바닥판만, 빠졌으면 빈 구멍
  if (o.mo === 0) drawMag(B, 0, false, true);            // 손잡이 안에 끼워져 있으면 바닥판만
  else if (o.mo === null || o.mo === undefined)
    poly(B, [[magF(73.5) + 1, 73.5], [magB(73.5) - 1, 73.5], [magB(77.8) - .6, 77.8], [magF(77.8) + 1, 77.8]], RAMP.void, () => 0, { lines: false });
  // 슬라이드 멈치 · 탄창 멈치 (청록)
  rect(B, 58, 42.4, 8, 1.8, RAMP.metal, () => .7);
  dot(B, 67, 47, o.thumb ? T : T2, true); dot(B, 68, 47, o.thumb ? T : T2, true);
  dot(B, 67, 48, o.thumb ? T2 : T3, true); dot(B, 68, 48, o.thumb ? T2 : T3, true);

  // ── 슬라이드 (금속) — 위 모서리를 밝게 깎고, 아래로 갈수록 어둡게
  poly(B, [[S0 + 4, 27.5], [S1 - 2, 27.5], [S1, 29.5], [S1, 41.5], [S0, 41.5], [S0, 31.5]], RAMP.metal, (x, y) => {
    const v = (y - 27.5) / 14;
    let I = v < .1 ? .97 : v < .2 ? .8 : v < .72 ? .56 - (v - .2) * .3 : .2;
    I += (x - S0) / 76 * .05;
    if (v >= .2 && v < .27 && (x | 0) % 7 < 3) I += .12;              // 길게 흐르는 반사
    return I;
  });
  // 배출구 — 닫혀 있으면 총열 덮개, 끝까지 밀리면 챔버의 다음 탄
  if (o.port) {
    rect(B, S0 + 40, 27.5, 13, 4.5, RAMP.void, () => 0, { lines: false });
    capsule(B, S0 + 44, 29.6, S0 + 50, 29.6, 1.6, RAMP.brass);
    part(B, false, true); put(B, S0 + 42.5, 29, T); put(B, S0 + 42.5, 30, T2);
  } else rect(B, S0 + 40, 27.5, 13, 4.5, RAMP.metal, (x, y) => .82 - (y - 27.5) * .06);
  // 톱니 — 비스듬한 홈, 홈 바닥이 청록으로 (당길 땐 환하게)
  part(B, false);
  for (let i = 0; i < 6; i++) {
    const gx = S1 - 16 + i * 2.3;
    for (let y = 30; y <= 39; y++) {
      const x = gx + (y - 30) * .16;
      part(B, false, true);
      put(B, x, y, sg > .5 ? T : sg > 0 ? T2 : (y > 32 && y < 37 ? T3 : RAMP.metal[1]));
      part(B, false); put(B, x + 1, y, RAMP.metal[5]);
    }
  }
  // 가늠쇠 · 가늠자 · 청록 점
  rect(B, S0 + 3, 25, 3, 2.6, RAMP.metal, () => .55);
  dot(B, S0 + 4, 25, T, true);
  poly(B, [[S1 - 13, 24.6], [S1 - 5.5, 24.6], [S1 - 4.5, 27.6], [S1 - 13, 27.6]], RAMP.metal, () => .4);
  dot(B, S1 - 12, 25, T, true); dot(B, S1 - 7, 25, T2, true);
  // 각인 "07"
  part(B, false);
  [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [2, 3], [0, 4], [1, 4], [2, 4],
   [4, 0], [5, 0], [6, 0], [6, 1], [5, 2], [5, 3], [5, 4]].forEach(([x, y]) => put(B, S0 + 14 + x, 33 + y, RAMP.metal[5]));
}

/* ═════════════ 손 · 팔 ═══════════════════════════════════════ */
function rightArm(B) {                       // 오른팔 — 손목에서 오른쪽 아래로 (환자복 소매)
  capsule(B, 107, 92, 146, 124, 12.5, RAMP.gown);
  capsule(B, 99, 80, 109, 92, 9, RAMP.glove);
  capsule(B, 101.5, 86, 110, 82.5, 2.2, RAMP.pad, { lines: false });   // 손목 띠
  dot(B, 105, 84, T, true); dot(B, 106, 84, T2, true);
}
function rightHand(B, thumbPress) {
  capsule(B, 94.5, 52, 99.5, 74, 5.2, RAMP.glove);                      // 손바닥 뒤꿈치
  [58, 64, 70].forEach(y => {                                            // 손잡이 앞을 감싼 손끝 셋
    const f = gripFrontL(y);
    capsule(B, f - 4.5, y - .5, f + 4.5, y + .8, 2.7, RAMP.glove);
    capsule(B, f - 3.6, y - 1, f - 1.2, y - .6, 1.5, RAMP.pad, { lines: false });
  });
  const tx = thumbPress ? 67.5 : 73;                                    // 엄지 — 프레임을 따라 앞으로
  capsule(B, 95, 49.2, tx, 48.6, 2.7, RAMP.glove);
  capsule(B, tx + 1, 47.8, tx + 4, 47.8, 1.2, RAMP.pad, { lines: false });
}
function leftSupport(B) {                    // 두 손 파지 — 왼손이 오른손가락을 덮고, 엄지는 앞으로
  capsule(B, 58, 80, 40, 106, 8.5, RAMP.glove);
  capsule(B, 40, 106, 14, 136, 14, RAMP.gown);
  ellipse(B, 62, 67, 6.8, 9.5, RAMP.glove);
  [61, 67, 73].forEach(y => {
    const f = gripFrontL(y);
    capsule(B, f - 9, y, f + 3.2, y + 1.6, 3, RAMP.glove);
    capsule(B, f - 7.5, y - .8, f - 4.5, y - .3, 1.6, RAMP.pad, { lines: false });
  });
  capsule(B, 68, 45.4, 50, 44.8, 2.3, RAMP.glove);
}
function leftAway(B) {                       // 왼손이 비어 있을 때 — 아래 왼쪽에서 대기
  capsule(B, -8, 122, 10, 100, 14, RAMP.gown);
  ellipse(B, 19, 91, 8.5, 7.5, RAMP.glove);
  capsule(B, 14, 87, 24, 86.5, 1.8, RAMP.pad, { lines: false });
}
function leftMag(B, mo, slap) {              // 탄창 바닥을 손바닥으로 받쳐 밀어 올림
  const bot = 77 + mo, cx = (magF(bot) + magB(bot)) / 2;
  capsule(B, cx - 4, bot + 8, cx - 26, bot + 36, 8.5, RAMP.glove);
  capsule(B, cx - 26, bot + 36, cx - 52, bot + 70, 14, RAMP.gown);
  ellipse(B, cx, bot + (slap ? 4.5 : 6), slap ? 11.5 : 10, slap ? 4.4 : 5.6, RAMP.glove);
  if (!slap) [0, 1, 2].forEach(i => {
    const y = bot - 3 - i * 4.6;
    if (y < 48 + mo + 4) return;
    capsule(B, magF(y) - 4.2, y, magF(y) + 3.4, y + .6, 2.2, RAMP.glove);
  });
  else capsule(B, cx - 13, bot + 3, cx - 5, bot + 2.4, 2.2, RAMP.glove);
  capsule(B, magB(bot) + 1.8, bot, magB(bot - 10) + 1, bot - 10, 2.2, RAMP.glove);
}
function leftRack(B, so) {                   // 위에서 덮어 슬라이드 뒤쪽을 움켜쥠
  const S1 = 96 + so;
  capsule(B, S1 + 2, 20, S1 + 30, -8, 9.5, RAMP.glove);
  capsule(B, S1 + 30, -8, S1 + 52, -34, 14, RAMP.gown);
  ellipse(B, S1 - 7, 23.4, 11.5, 5.8, RAMP.glove);
  for (let i = 0; i < 4; i++) {
    const x = S1 - 15.5 + i * 3.7;
    capsule(B, x, 25.5, x - 1, 36.4 - (i === 3 ? 2 : 0), 1.95, RAMP.glove);
    capsule(B, x - 1.6, 34.6 - (i === 3 ? 2 : 0), x - .4, 35.4 - (i === 3 ? 2 : 0), 1, RAMP.pad, { lines: false });
  }
}

/* ═════════════ 조준 시점 — 뒤쪽 비스듬한 위에서, 총구는 화면 안쪽으로 ═════
   작은 원근 투영 : 총 뒷면 가운데(RX, RY)에서 앞으로 Z 만큼 들어갈수록
   소실점(VP — 조준점)으로 모입니다. 그래서 총이 조준점을 겨눕니다.
   보이는 면은 뒷면 · 윗면 · 왼쪽 면 셋, 손잡이는 왼쪽 면에 단청 패널. */
const RX = 88, RY = 44, VPX = -14, VPY = 16, FOC = 150, SL = 96;
function P3(X, Y, Z) { const s = FOC / (FOC + Z); return [VPX + (RX + X - VPX) * s, VPY + (RY + Y - VPY) * s]; }
const quad3 = (pts) => pts.map(p => P3(...p));
/* 화면 위 두 점 사이 진행도 (면 명암을 깊이에 따라 줄 때) */
const along = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; return Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); };

function drawAimGun(B, o) {
  const k = o.recoil ? -7 : 0;                     // 쏜 순간 — 슬라이드가 뒤로 밀려 나옴
  const Z0 = k, Z1 = SL + k;
  // ── 총열 끝 (슬라이드가 밀리면 앞에 드러남)
  if (o.recoil) {
    poly(B, quad3([[-4, -6, SL - 8], [4, -6, SL - 8], [4, -6, SL + 1], [-4, -6, SL + 1]]), RAMP.metal, () => .7);
    poly(B, quad3([[-4, -6, SL - 8], [-4, -6, SL + 1], [-4, 2, SL + 1], [-4, 2, SL - 8]]), RAMP.metal, () => .42);
  }
  // ── 프레임 (폴리머) — 왼쪽 면, 뒷면
  const fr0 = P3(-9, 6, 3), fr1 = P3(-9, 6, 78);
  poly(B, quad3([[-9, 6, 3], [-9, 6, 78], [-9, 12, 78], [-9, 12, 3]]), RAMP.poly, (x, y) => .5 - along(x, y, fr0, fr1) * .2);
  part(B, false);
  for (let z = 30; z <= 62; z += 5) { const p = P3(-9.2, 10.5, z); put(B, p[0], p[1], RAMP.poly[0]); }   // 레일 홈
  // 방아쇠울 (왼쪽 옆으로 보이는 고리)
  [[[-9, 12, 44], [-9, 18, 45]], [[-9, 18, 45], [-9, 19.5, 52]], [[-9, 19.5, 52], [-9, 17, 62]], [[-9, 17, 62], [-9, 12, 62]]]
    .forEach(([a, b]) => { const A = P3(...a), Bp = P3(...b); capsule(B, A[0], A[1], Bp[0], Bp[1], 1.05, RAMP.poly, { lines: false, bias: .1 }); });
  // ── 손잡이 — 아래로 갈수록 몸 쪽으로 기울어집니다
  const zb = y => 3 - (y - 12) * .3, zf = y => 27 - (y - 12) * .3;
  const g0 = P3(-8.5, 12, zb(12)), g1 = P3(-8.5, 46, zb(46));
  poly(B, quad3([[-8.5, 12, zb(12)], [-8.5, 12, zf(12)], [-8.5, 46, zf(46)], [-8.5, 46, zb(46)]]), RAMP.poly, (x, y) => {
    const h = hash(x | 0, y | 0); let I = .4 - along(x, y, g0, g1) * .1;
    if (h < .11) I += .2; else if (h > .9) I -= .16;
    return I;
  });
  poly(B, quad3([[-8.5, 12, zb(12)], [8.5, 12, zb(12)], [8.5, 46, zb(46)], [-8.5, 46, zb(46)]]), RAMP.poly, (x, y) => {
    const h = hash(x | 0, y | 0); let I = .3; if (h < .1) I += .18; return I;
  });
  // 단청 패널 — 손잡이 왼쪽 면 위쪽, 금테
  const pz0 = y => zb(y) + 3, pz1 = y => zf(y) - 4;
  const pq = quad3([[-8.6, 14, pz0(14)], [-8.6, 14, pz1(14)], [-8.6, 30, pz1(30)], [-8.6, 30, pz0(30)]]);
  const pq2 = quad3([[-8.6, 13.2, pz0(13.2) - .9], [-8.6, 13.2, pz1(13.2) + .9], [-8.6, 30.8, pz1(30.8) + .9], [-8.6, 30.8, pz0(30.8) - .9]]);
  poly(B, pq2, [OB.Y], () => OB.Y, { dk: '#5a4416' });
  const top = Math.min(...pq.map(p => p[1])), left = Math.min(...pq.map(p => p[0]));
  poly(B, pq, [OB.Bk], (x, y) => dancheong(x, y, top, left), { lines: false });

  // ── 슬라이드 — 윗면 · 왼쪽 면 · 뒷면
  const t0 = P3(0, -10, Z0), t1 = P3(0, -10, Z1);
  poly(B, quad3([[-10, -10, Z0], [10, -10, Z0], [10, -10, Z1], [-10, -10, Z1]]), RAMP.metal, (x, y) => {
    const a = along(x, y, t0, t1); let I = .9 - a * .32;
    if (a > .04 && a < .5 && ((x - y) | 0) % 9 === 0) I += .1;
    return I;
  });
  const l0 = P3(-10, -2, Z0), l1 = P3(-10, -2, Z1);
  poly(B, quad3([[-10, -10, Z0], [-10, -10, Z1], [-10, 6, Z1], [-10, 6, Z0]]), RAMP.metal, (x, y) => {
    const a = along(x, y, l0, l1);
    const v = along(x, y, P3(-10, -10, Z0 + a * SL), P3(-10, 6, Z0 + a * SL));
    let I = (v < .12 ? .78 : .5 - v * .2) - a * .12;
    return I;
  });
  // 배출구 (윗면 오른쪽)
  poly(B, quad3([[1.5, -10.05, Z0 + 30], [9, -10.05, Z0 + 30], [9, -10.05, Z0 + 45], [1.5, -10.05, Z0 + 45]]),
       o.recoil ? RAMP.void : RAMP.metal, () => o.recoil ? 0 : .66);
  // 톱니 (왼쪽 면 뒤쪽) — 홈 바닥이 청록
  for (let i = 0; i < 7; i++) {
    const z = Z0 + 3 + i * 2.4;
    for (let t = 0; t <= 1; t += .08) {
      const p = P3(-10.05, -8.5 + t * 12.5, z + t * 1.3);
      part(B, false, true); put(B, p[0], p[1], o.recoil ? T : (t > .25 && t < .75 ? T3 : RAMP.metal[1]));
      part(B, false); put(B, p[0] + 1, p[1], RAMP.metal[5]);
    }
  }
  // 각인 "07" (왼쪽 면)
  part(B, false);
  [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [2, 3], [0, 4], [1, 4], [2, 4],
   [4, 0], [5, 0], [6, 0], [6, 1], [5, 2], [5, 3], [5, 4]].forEach(([u, v]) => { const p = P3(-10.1, -5.5 + v * 2, Z0 + 66 - u * 2.4); put(B, p[0], p[1], RAMP.metal[5]); });
  // 가늠쇠 (멀리, 작게) · 청록 점
  poly(B, quad3([[-1.6, -13, Z1 - 6], [1.6, -13, Z1 - 6], [1.6, -10, Z1 - 6], [-1.6, -10, Z1 - 6]]), RAMP.metal, () => .4);
  { const p = P3(0, -12, Z1 - 6.2); dot(B, p[0], p[1], T, true); }
  // 뒷면 — 가운데 스트라이커 판, 청록 고리
  poly(B, quad3([[-10, -10, Z0], [10, -10, Z0], [10, 6, Z0], [-10, 6, Z0]]), RAMP.metal, (x, y) => {
    const r0 = P3(0, -10, Z0)[1]; return y - r0 < 1.6 ? .66 : .36;
  });
  poly(B, quad3([[-4.5, -5, Z0 - .1], [4.5, -5, Z0 - .1], [4.5, 2.5, Z0 - .1], [-4.5, 2.5, Z0 - .1]]), RAMP.metal, () => .2);
  { const c = P3(0, -1.5, Z0 - .2); part(B, false, true);
    put(B, c[0] - 1, c[1] - 1, T3); put(B, c[0], c[1] - 1, T2); put(B, c[0] - 1, c[1], T2); put(B, c[0], c[1], o.lit ? T : T2); }
  // 프레임 뒷면 (슬라이드 아래)
  poly(B, quad3([[-9, 6, 3], [9, 6, 3], [9, 12, 3], [-9, 12, 3]]), RAMP.poly, () => .32);
  // 가늠자 — 뒷면 위 블록, 가운데 홈, 청록 점 둘
  poly(B, quad3([[-9, -13.5, Z0 + 1], [9, -13.5, Z0 + 1], [9, -13.5, Z0 + 5], [-9, -13.5, Z0 + 5]]), RAMP.metal, () => .7);
  poly(B, quad3([[-9, -13.5, Z0 + 1], [9, -13.5, Z0 + 1], [9, -10, Z0 + 1], [-9, -10, Z0 + 1]]), RAMP.metal, () => .32);
  poly(B, quad3([[-1.8, -13.6, Z0 + .9], [1.8, -13.6, Z0 + .9], [1.8, -11.2, Z0 + .9], [-1.8, -11.2, Z0 + .9]]), RAMP.void, () => 0, { lines: false });
  [-5.5, 5.5].forEach(X => { const p = P3(X, -12, Z0 + .8); part(B, false, true); put(B, p[0] - .5, p[1], T); put(B, p[0] + .5, p[1], T); });
}

/* 조준 시점의 손 — 한 손 파지. 오른손 엄지는 프레임 왼쪽을 따라 앞으로,
   손끝 셋은 손잡이 앞을 감아 왼쪽 면 앞가장자리에 걸리고, 손바닥 뒤꿈치는
   등판(백스트랩)에. 그 사이로 단청 패널이 보입니다. 왼손은 장전 때만. */
function aimHands(B, o) {
  const zb = y => 3 - (y - 12) * .3, zf = y => 27 - (y - 12) * .3;
  const at = (X, Y, Z) => P3(X, Y, Z);
  // 오른팔 — 손목에서 오른쪽 아래 모서리로
  const w0 = at(4, 46, zb(46) - 6), w1 = at(7, 60, zb(60) - 12);
  capsule(B, w1[0], w1[1], 132, 118, 15, RAMP.gown);
  capsule(B, w0[0], w0[1], w1[0], w1[1], 9.5, RAMP.glove);
  capsule(B, w1[0] - 7, w1[1] - 3, w1[0] + 6, w1[1] - 8, 2.4, RAMP.pad, { lines: false });   // 손목 띠
  dot(B, w1[0], w1[1] - 6, o.lit ? T : T2, true); dot(B, w1[0] + 1, w1[1] - 6, T2, true);
  // 손바닥 뒤꿈치 — 등판을 감쌈 (몸 쪽)
  const h0 = at(3, 18, zb(18) - 3), h1 = at(4, 41, zb(41) - 4);
  capsule(B, h0[0], h0[1], h1[0], h1[1], 7, RAMP.glove);
  const hp = at(6, 27, zb(27) - 5);                                   // 손등 마디 보호판
  ellipse(B, hp[0] + 2, hp[1] - 2, 4.6, 6.5, RAMP.glove, { bias: .18 });
  [0, 1, 2].forEach(i => capsule(B, hp[0] - 1, hp[1] - 7 + i * 4.5, hp[0] + 5, hp[1] - 6 + i * 4.5, 1, RAMP.pad, { lines: false }));
  capsule(B, h0[0] - 4, h0[1] + 2, h1[0] - 5, h1[1] - 2, .6, RAMP.pad, { lines: false });   // 솔기
  // 손끝 셋 — 손잡이 앞을 감아 왼쪽 면에
  [22, 30, 38].forEach(y => {
    const a0 = at(-8.6, y, zf(y) + 3), a1 = at(-9.4, y + 1, zf(y) - 7);
    capsule(B, a0[0], a0[1], a1[0], a1[1], 3, RAMP.glove);
    const p0 = at(-9.6, y - .6, zf(y) - 4.5), p1 = at(-9.6, y, zf(y) - 7);
    capsule(B, p0[0], p0[1], p1[0], p1[1], 1.4, RAMP.pad, { lines: false });
  });
  // 엄지 — 프레임 옆을 따라 앞으로
  const t0 = at(-8, 17, 2), tm = at(-10, 13.5, 20), t1 = at(-10.6, 11.5, 36);
  capsule(B, t0[0], t0[1], tm[0], tm[1], 3.4, RAMP.glove);
  capsule(B, tm[0], tm[1], t1[0], t1[1], 2.7, RAMP.glove);
  capsule(B, t1[0] + 1.5, t1[1] - .4, t1[0] + 3.5, t1[1] - .2, 1.2, RAMP.pad, { lines: false });
}

/* 한 장 — 상태에 맞춰 순서대로 겹쳐 그립니다 */
function drawFrame(B, o) {
  if (o.aim) { drawAimGun(B, o); aimHands(B, o); return; }
  if (o.left === 'away') leftAway(B);
  rightArm(B);
  if (o.mo > 0) drawMag(B, o.mo, o.newMag);
  drawPistol(B, o);
  rightHand(B, o.thumb);
  if (o.left === 'support') leftSupport(B);
  if (o.left === 'mag') leftMag(B, o.mo, false);
  if (o.left === 'slap') leftMag(B, 0, true);
  if (o.left === 'rack') leftRack(B, o.so || 0);
}

/* ═════════════ 시트 굽기 ═════════════════════════════════════ */
function bakeSheet() {
  const sheet = document.createElement('canvas'), mask = document.createElement('canvas');
  sheet.width = mask.width = FW * COLS; sheet.height = mask.height = FH * (SUBS + 1);
  const sc = sheet.getContext('2d'), mc = mask.getContext('2d');
  const cell = (col, row, fn) => { const B = newBuf(); fn(B); finalize(B, sc, mc, col * FW, row * FH); };
  // col 0 — 조준 : 숨 세 장(0~2) + 쏜 순간(3, 슬라이드가 밀림)
  [[0, 0], [-1, .5], [-1, 1]].forEach(([dy, l], r) => cell(0, r, B => { B.oy = dy; drawFrame(B, { aim: true, lit: l > .5 }); }));
  cell(0, 3, B => { B.oy = 1; B.ox = 1; drawFrame(B, { aim: true, recoil: true, lit: true }); });
  // col 1 — 탄창 배출
  cell(1, 0, B => drawFrame(B, { mo: 0, left: 'away' }));
  cell(1, 1, B => drawFrame(B, { mo: 5, thumb: true, left: 'away' }));
  cell(1, 2, B => drawFrame(B, { mo: 15, thumb: true, left: 'away' }));
  cell(1, 3, B => drawFrame(B, { mo: null, left: 'away' }));
  // col 2 — 새 탄창 삽입
  cell(2, 0, B => drawFrame(B, { mo: 18, newMag: true, left: 'mag' }));
  cell(2, 1, B => drawFrame(B, { mo: 10, newMag: true, left: 'mag' }));
  cell(2, 2, B => drawFrame(B, { mo: 4, newMag: true, left: 'mag' }));
  cell(2, 3, B => drawFrame(B, { mo: 0, left: 'slap' }));
  // col 3 — 슬라이드 당기기
  cell(3, 0, B => drawFrame(B, { mo: 0, left: 'rack', sg: .4 }));
  cell(3, 1, B => drawFrame(B, { mo: 0, left: 'rack', so: 5, sg: 1 }));
  cell(3, 2, B => drawFrame(B, { mo: 0, left: 'rack', so: 10, sg: 1, port: true }));
  cell(3, 3, B => drawFrame(B, { mo: 0, left: 'support', sg: .6 }));
  // row 4 — 낱개 : 떨어지는 빈 탄창, 탄피 둘 (눕힘 · 세움)
  cell(0, UTIL_ROW, B => { B.ox = -71; B.oy = -46; drawMag(B, 0, false); });
  cell(1, UTIL_ROW, B => { capsule(B, 2.5, 3, 8.5, 3, 1.7, RAMP.brass); capsule(B, 16, 2, 16, 8, 1.7, RAMP.brass); });
  return { sheet, mask };
}

const LIFT = 0;                                  // (예전 그림의 세로 보정 — 이제 안 씀)
/* 낱개 스프라이트 — [sx, sy, w, h] */
const SPR_MAG = [0, UTIL_ROW * FH, 30, 40];
const SPR_CASE = [[FW + 0, UTIL_ROW * FH, 12, 7], [FW + 13, UTIL_ROW * FH, 7, 11]];
/* 연출이 붙는 자리 (칸 안의 좌표) */
const AT = {
  release: [67, 47],           // 탄창 멈치
  magDrop: [75, 61],           // 빠진 탄창 스프라이트를 놓을 자리 (빠짐 칸과 이어지게)
  seat:    [86, 79],           // 탄창 바닥판
  port:    [80, 29],           // 배출구 (탄피가 튀는 곳)
  serr:    [82, 30],           // 톱니 (빛 잔상이 흐르는 곳, 폭 12 · 높이 10)
  muzzle:  [19, 34],           // 총구 (옆모습)
  aim:     [VPX, VPY],         // 조준점 — 총이 겨누는 곳 (조준 칸의 소실점)
  aimMuzzle: P3(0, -2, SL + 2) // 총구 (조준 칸)
};

/* 장전 순서 — [단계, 장, 길이(프레임), 이벤트] · 이벤트는 그 장이 시작되는 순간 */
const SEQ = [
  [1, 0, 9, 'cant'], [1, 1, 12, 'press'], [1, 2, 9, 'release'], [1, 3, 16, 'drop'],
  [2, 0, 12, 'bring'], [2, 1, 8, null], [2, 2, 7, null], [2, 3, 14, 'seat'],
  [3, 0, 10, 'grab'], [3, 1, 5, 'pull'], [3, 2, 12, 'eject'], [3, 3, 12, 'snap']
];

let baked = null;
window.PistolArt = {
  FW, FH, COLS, SUBS, UTIL_ROW, KEY, IDLE_ROWS, FIRE_ROW, LABEL, SEQ, LIFT, SPR_MAG, SPR_CASE, AT, C, OBANG,
  gx0: gripFrontL,
  bake() { return baked || (baked = bakeSheet()); }
};
})();
