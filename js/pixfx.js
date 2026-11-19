'use strict';
/* ═══════════════════════════════════════════════════════════════
   pixfx.js — 본편(탑뷰) 도트 정리

   잡몹 · 보스 · 탄 · 경고 고리는 캔버스의 곡선(타원 · 호)으로 그려서, 그대로 두면 가장자리가
   반투명하게 번지고(안티에일리어싱) 도트 배경 위에서 벡터 그림처럼 떠 보였습니다.
   여기서 그 그림들을 "한 장의 도트 그림"으로 정리합니다.

     sprite(…) — 몸 하나를 작은 캔버스에 그린 뒤
                 · 가장자리를 계단으로 (반투명 → 있음 / 없음)
                 · 1px 짙은 외곽선
                 · 위쪽 가장자리엔 빛, 아래쪽 가장자리엔 그늘 (도트 그림의 기본 음영)
                 · 맞았을 땐 흰 실루엣
                 그리고 정수 픽셀 자리에 찍습니다.
     layer…  — 탄 · 충격파 고리 · 보스의 예고선을 한 겹에 모아 그린 뒤,
                 반투명은 4×4 체크 디더(옛 도트 게임의 반투명)로, 가장자리는 계단으로.

   쓰는 곳 : game.js (drawFoe · drawBoss · 탄 · drawRings · 심연의 예고 표시)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);

/* ── 화면으로 옮길 작은 캔버스 ──
   크롬은 CPU 캔버스(getImageData 를 쓰는 작업 캔버스)를 GPU 화면 캔버스에 그릴 때 「원본 캔버스 전체」를 매번 올림.
   작업 캔버스는 가장 큰 몸(심연 ≈ 400×450)에 맞춰 커져 있어서, 작은 몹 하나를 찍어도 큰 그림을 통째로 올렸음 (파이어폭스는 괜찮고 크롬만 렉).
   그래서 결과는 32px 단위 크기의 작은 캔버스에 옮겨 그것만 올림 */
const blits = new Map();
function blitCtx(w, h) {
  const bw = Math.ceil(w / 32) * 32, bh = Math.ceil(h / 32) * 32, k = bw * 8192 + bh;
  let c = blits.get(k);
  if (!c) { const cv = document.createElement('canvas'); cv.width = bw; cv.height = bh; c = cv.getContext('2d'); blits.set(k, c); }
  return c;
}

/* ── 몸 하나 ── */
let sCv = null, sX = null;
function spriteCtx(w, h) {
  if (!sCv) { sCv = document.createElement('canvas'); sX = sCv.getContext('2d', { willReadFrequently: true }); trackCtx(sX); }
  if (sCv.width < w || sCv.height < h) { sCv.width = Math.max(sCv.width, w); sCv.height = Math.max(sCv.height, h); }
  sX.setTransform(1, 0, 0, 1, 0, 0); sX.globalAlpha = 1; sX.globalCompositeOperation = 'source-over'; sX.filter = 'none';
  sX.clearRect(0, 0, w, h); bbReset(sX);
  return sX;
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
/* g 의 (x, y) 에 — 캔버스 w×h, 그 안의 (ox, oy) 가 (x, y) 에 오도록.
   draw(ctx) 는 (ox, oy) 를 원점으로 그립니다.
   opt : outline '#rrggbb' · hi 위 빛 세기(0‥1) · lo 아래 그늘 · flash 흰 실루엣 0‥1 · cut 남길 알파 문턱 */
function sprite(g, x, y, w, h, ox, oy, draw, opt = {}) {
  w = Math.ceil(w); h = Math.ceil(h);
  const c = spriteCtx(w, h);
  c.save(); c.translate(ox, oy); draw(c); c.restore();
  // 그린 곳 상자만 (+1 외곽선 자리) — 큰 몸(심연)은 넉넉히 잡은 칸의 절반 넘게 비어 있었음
  const bb = c._bb, sx = Math.max(0, Math.floor(bb[0]) - 1), sy = Math.max(0, Math.floor(bb[1]) - 1);
  const ex = Math.min(w, Math.ceil(bb[2]) + 1), ey = Math.min(h, Math.ceil(bb[3]) + 1);
  if (ex <= sx || ey <= sy) return;
  x += sx; y += sy; w = ex - sx; h = ey - sy;
  const id = c.getImageData(sx, sy, w, h), d = id.data, n = w * h;
  const cut = opt.cut == null ? 96 : opt.cut;
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = d[i * 4 + 3] >= cut ? 1 : 0;
  const ol = hexRgb(opt.outline || '#0b0910'), hi = opt.hi == null ? .32 : opt.hi, lo = opt.lo == null ? .3 : opt.lo, fl = opt.flash || 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx, p = i * 4;
    if (m[i]) {
      let r = d[p], gg = d[p + 1], b = d[p + 2];
      const up = yy > 0 && m[i - w], dn = yy < h - 1 && m[i + w];
      if (!up && hi) { r += (255 - r) * hi * .55; gg += (255 - gg) * hi * .55; b += (255 - b) * hi * .55; }       // 위 가장자리 — 빛
      else if (!dn && lo) { r *= 1 - lo; gg *= 1 - lo; b *= 1 - lo; }                                           // 아래 가장자리 — 그늘
      if (fl) { r += (255 - r) * fl; gg += (255 - gg) * fl; b += (255 - b) * fl; }
      d[p] = r; d[p + 1] = gg; d[p + 2] = b; d[p + 3] = 255;
    } else {
      const edge = (xx > 0 && m[i - 1]) || (xx < w - 1 && m[i + 1]) || (yy > 0 && m[i - w]) || (yy < h - 1 && m[i + w]);
      if (edge && !opt.noOutline) { d[p] = ol[0]; d[p + 1] = ol[1]; d[p + 2] = ol[2]; d[p + 3] = fl ? 255 * (1 - fl * .5) : 255; }
      else d[p + 3] = 0;
    }
  }
  const bc = blitCtx(w, h); bc.putImageData(id, 0, 0);
  const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
  g.drawImage(bc.canvas, 0, 0, w, h, Math.round(x - ox), Math.round(y - oy), w, h);
  g.imageSmoothingEnabled = sm;
}

/* ── 겹 하나 (탑뷰 화면 전체) — 탄 · 고리 · 예고선 ──
   예전엔 매 장 화면 전체(576×360 ≈ 20만 점)를 읽어 다시 칠했음 — 탄 몇 개뿐이어도. 프로파일에서 한 장 시간의 절반.
   이제 겹에 그린 곳의 테두리 상자(bbox)를 그리는 함수에서 바로 모아(현재 변환 · 선 굵기 · 그림자 포함) 그 상자만 처리.
   상자 밖에 무언가 그려졌더라도(모르는 그리기 함수) 겹은 통째로 얹으므로 사라지지 않음 — 그 부분만 도트 정리가 빠질 뿐 */
let lCv = null, lX = null, lHost = null, lUsed = false;
const bbReset = c => { c._bb[0] = c._bb[1] = 1e9; c._bb[2] = c._bb[3] = -1e9; };
function addBox(c, x0, y0, x1, y1) {                              // c 에 그린 곳을 화면(캔버스) 좌표 상자 c._bb 에 더함
  const m = c.getTransform(), sc = Math.hypot(m.a, m.b) || 1, b = c._bb;
  const lw = (c.lineWidth || 1) / 2 * (c.lineJoin === 'miter' ? Math.min(c.miterLimit || 10, 10) : 1.5);   // 뾰족한 이음(miter)은 선 굵기보다 멀리 튀어나옴
  const pad = (lw + (c.shadowBlur || 0) * 2 + Math.abs(c.shadowOffsetX || 0) + Math.abs(c.shadowOffsetY || 0)) * sc + 2;
  for (let k = 0; k < 4; k++) {
    const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
    if (X - pad < b[0]) b[0] = X - pad; if (X + pad > b[2]) b[2] = X + pad;
    if (Y - pad < b[1]) b[1] = Y - pad; if (Y + pad > b[3]) b[3] = Y + pad;
  }
}
const TRACK = {
  arc: (c, a) => addBox(c, a[0] - a[2], a[1] - a[2], a[0] + a[2], a[1] + a[2]),
  ellipse: (c, a) => { const r = Math.max(a[2], a[3]); addBox(c, a[0] - r, a[1] - r, a[0] + r, a[1] + r); },
  rect: (c, a) => addBox(c, a[0], a[1], a[0] + a[2], a[1] + a[3]), fillRect: (c, a) => addBox(c, a[0], a[1], a[0] + a[2], a[1] + a[3]),
  strokeRect: (c, a) => addBox(c, a[0], a[1], a[0] + a[2], a[1] + a[3]), roundRect: (c, a) => addBox(c, a[0], a[1], a[0] + a[2], a[1] + a[3]),
  moveTo: (c, a) => addBox(c, a[0], a[1], a[0], a[1]), lineTo: (c, a) => addBox(c, a[0], a[1], a[0], a[1]),
  arcTo: (c, a) => addBox(c, Math.min(a[0], a[2]) - a[4], Math.min(a[1], a[3]) - a[4], Math.max(a[0], a[2]) + a[4], Math.max(a[1], a[3]) + a[4]),
  quadraticCurveTo: (c, a) => addBox(c, Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])),
  bezierCurveTo: (c, a) => addBox(c, Math.min(a[0], a[2], a[4]), Math.min(a[1], a[3], a[5]), Math.max(a[0], a[2], a[4]), Math.max(a[1], a[3], a[5])),
  drawImage: (c, a) => { const n = a.length, im = a[0], w = im.width || 0, h = im.height || 0;
    if (n === 3) addBox(c, a[1], a[2], a[1] + w, a[2] + h); else if (n === 5) addBox(c, a[1], a[2], a[1] + a[3], a[2] + a[4]); else addBox(c, a[5], a[6], a[5] + a[7], a[6] + a[8]); },
  fillText: (c, a) => { const w = a[3] || c.measureText(a[0]).width, f = parseFloat(c.font) || 12; addBox(c, a[1] - w, a[2] - f * 1.5, a[1] + w, a[2] + f); },
  strokeText: (c, a) => TRACK.fillText(c, a)
};
function trackCtx(x) {
  x._bb = [1e9, 1e9, -1e9, -1e9];
  for (const k in TRACK) { if (typeof x[k] !== 'function') continue; const orig = x[k], f = TRACK[k];
    x[k] = function () { f(x, arguments); return orig.apply(this, arguments); }; }
  // 모르는 그리기(채우기 패턴으로 전체 칠하기 등)를 놓치지 않게 — 경로 없이 칠하는 함수는 위에서 다 잡음
}
function layerBegin(g) {
  if (window.Perf && Perf.low && !lUsed) return g;             // 가벼운 화면 — 정리를 건너뛰고 바로 그림
  const cv = g.canvas;
  if (!lCv) { lCv = document.createElement('canvas'); lX = lCv.getContext('2d', { willReadFrequently: true }); trackCtx(lX); }
  if (lCv.width !== cv.width || lCv.height !== cv.height) { lCv.width = cv.width; lCv.height = cv.height; }
  if (!lUsed) bbReset(lX);
  lX.setTransform(g.getTransform()); lX.globalAlpha = 1; lX.globalCompositeOperation = 'source-over'; lX.lineCap = 'butt';
  lHost = g; lUsed = true;
  return lX;
}
/* 모아 둔 겹을 도트로 정리해 g 에 얹습니다 (한 프레임에 한 번) — 그린 상자만 */
function layerFlush(g) {
  if (!lUsed) return;
  lUsed = false;
  const b = lX._bb, x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1]));
  const x1 = Math.min(lCv.width, Math.ceil(b[2])), y1 = Math.min(lCv.height, Math.ceil(b[3]));
  if (x1 <= x0 || y1 <= y0) { lX.setTransform(1, 0, 0, 1, 0, 0); lX.clearRect(0, 0, lCv.width, lCv.height); return; }   // 아무것도 안 그림
  const W = x1 - x0, H = y1 - y0, id = lX.getImageData(x0, y0, W, H), d = id.data;
  for (let y = 0; y < H; y++) {
    const row = ((y + y0) & 3) * 4;                                  // 체크 무늬는 화면 자리 기준 — 상자가 움직여도 무늬는 그대로
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4, a = d[p + 3];
      if (!a) continue;
      const k = (a / 255 - .2) / .6;                                // 아주 옅은 건 버리고(점 무늬로 지저분해짐), 짙은 건 꽉 채움
      d[p + 3] = k > BAYER[row + ((x + x0) & 3)] ? 255 : 0;         // 그 사이 반투명 → 체크 디더, 가장자리 → 계단
    }
  }
  const bc = blitCtx(W, H); bc.putImageData(id, 0, 0);               // 상자만 올림 (예전엔 화면 크기 겹을 통째로)
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = false; g.drawImage(bc.canvas, 0, 0, W, H, x0, y0, W, H);
  g.restore();
  lX.setTransform(1, 0, 0, 1, 0, 0); lX.clearRect(0, 0, lCv.width, lCv.height);   // 다음 장을 위해 비움 (상자 밖에 그린 것까지)
}

/* 도트 타원 — 그림자처럼 바닥에 깔리는 것. 줄마다 정수 폭으로 채워 가장자리가 계단 (반투명은 고르게) */
function ellipse(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  const R = Math.max(1, Math.round(ry)), X = Math.round(cx), Y = Math.round(cy);
  for (let y = -R; y < R; y++) {
    const v = (y + .5) / R, hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v)));
    if (hw > 0) g.fillRect(X - hw, Y + y, hw * 2, 1);
  }
}

/* 빛 번짐(블룸) — 3D 컷신용. 밝은 곳만 남겨(대비를 크게 올려 어두운 곳은 검게) 작게 줄여 흐린 뒤 'screen' 으로 얹습니다.
   캔버스 filter 를 못 쓰는 브라우저(옛 사파리)에선 하지 않음 — 화면 전체가 하얗게 뜨는 걸 막으려고 */
let bA = null, bB = null, bOK = null;
function bloom(g, src, dx, dy, dw, dh, amt = .5, opt = {}) {
  if (bOK === null) { try { const t = document.createElement('canvas').getContext('2d'); t.filter = 'blur(2px)'; bOK = t.filter === 'blur(2px)'; } catch (e) { bOK = false; } }
  if (!bOK || amt <= 0) return;
  const sw = Math.max(16, Math.round((src.width || dw) / 6)), sh = Math.max(9, Math.round((src.height || dh) / 6));
  if (!bA) { bA = document.createElement('canvas'); bB = document.createElement('canvas'); }
  for (const c of [bA, bB]) if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; }
  const a = bA.getContext('2d'), b = bB.getContext('2d');
  a.filter = `brightness(${opt.gain || 1.05}) contrast(${opt.cut || 3.2}) saturate(1.15)`;    // 밝은 곳만
  a.clearRect(0, 0, sw, sh); a.drawImage(src, 0, 0, sw, sh); a.filter = 'none';
  b.filter = `blur(${opt.blur || 3}px)`; b.clearRect(0, 0, sw, sh); b.drawImage(bA, 0, 0); b.filter = 'none';
  g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = amt; g.imageSmoothingEnabled = true;
  g.drawImage(bB, dx, dy, dw, dh);
  g.globalAlpha = amt * .5; b.filter = `blur(${(opt.blur || 3) * 2.5}px)`; b.drawImage(bA, 0, 0); b.filter = 'none';   // 넓게 한 겹 더
  g.drawImage(bB, dx, dy, dw, dh);
  g.restore();
}

window.PixFX = { sprite, layerBegin, layerFlush, ellipse, bloom };
})();
