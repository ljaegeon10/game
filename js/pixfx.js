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

/* ── 몸 하나 ── */
let sCv = null, sX = null;
function spriteCtx(w, h) {
  if (!sCv) { sCv = document.createElement('canvas'); sX = sCv.getContext('2d', { willReadFrequently: true }); }
  if (sCv.width < w || sCv.height < h) { sCv.width = Math.max(sCv.width, w); sCv.height = Math.max(sCv.height, h); }
  sX.setTransform(1, 0, 0, 1, 0, 0); sX.globalAlpha = 1; sX.globalCompositeOperation = 'source-over'; sX.filter = 'none';
  sX.clearRect(0, 0, w, h);
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
  const id = c.getImageData(0, 0, w, h), d = id.data, n = w * h;
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
  c.putImageData(id, 0, 0);
  const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
  g.drawImage(sCv, 0, 0, w, h, Math.round(x - ox), Math.round(y - oy), w, h);
  g.imageSmoothingEnabled = sm;
}

/* ── 겹 하나 (탑뷰 화면 전체) — 탄 · 고리 · 예고선 ── */
let lCv = null, lX = null, lHost = null, lUsed = false;
function layerBegin(g) {
  const cv = g.canvas;
  if (!lCv) { lCv = document.createElement('canvas'); lX = lCv.getContext('2d', { willReadFrequently: true }); }
  if (lCv.width !== cv.width || lCv.height !== cv.height) { lCv.width = cv.width; lCv.height = cv.height; }
  if (!lUsed) { lX.setTransform(1, 0, 0, 1, 0, 0); lX.clearRect(0, 0, lCv.width, lCv.height); }
  lX.setTransform(g.getTransform()); lX.globalAlpha = 1; lX.globalCompositeOperation = 'source-over'; lX.lineCap = 'butt';
  lHost = g; lUsed = true;
  return lX;
}
/* 모아 둔 겹을 도트로 정리해 g 에 얹습니다 (한 프레임에 한 번) */
function layerFlush(g) {
  if (!lUsed) return;
  lUsed = false;
  const W = lCv.width, H = lCv.height, id = lX.getImageData(0, 0, W, H), d = id.data;
  for (let y = 0; y < H; y++) {
    const row = (y & 3) * 4;
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4, a = d[p + 3];
      if (!a) continue;
      const k = (a / 255 - .2) / .6;                                // 아주 옅은 건 버리고(점 무늬로 지저분해짐), 짙은 건 꽉 채움
      d[p + 3] = k > BAYER[row + (x & 3)] ? 255 : 0;                // 그 사이 반투명 → 체크 디더, 가장자리 → 계단
    }
  }
  lX.putImageData(id, 0, 0);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = false; g.drawImage(lCv, 0, 0);
  g.restore();
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
