'use strict';
/* ═══════════════════════════════════════════════════════════════
   titlescreen.js — 시작 화면의 그림 (#titlecv)

   어두운 실험실 벽 앞, 왼쪽에 방호복 하나가 서서 제목의 빛을 받고 있습니다.
     · 벽 — 세로 패널 이음 · 배관 · 볼트를 2D 로 한 번 그려 둠
     · 방호복 — figure3d.js 의 3D 모델을 한 번만 찍어 그림으로 가져오고(WebGL 문맥은 바로 내려놓음),
       그 뒤로는 숨 쉬듯 살짝 오르내리게만 움직임. WebGL 이 없으면 벽과 빛만.
     · 제목 쪽에서 번지는 청록 빛(깜빡임) · 떠다니는 먼지 · 가장자리 어둠
   시작 화면이 보일 때만 돕니다.
   ═══════════════════════════════════════════════════════════════ */
(() => {
const cv = document.getElementById('titlecv'), title = document.getElementById('title');
if (!cv || !title) return;
let W = cv.width, H = cv.height, K = W / 576; const c = cv.getContext('2d');
const rnd = (() => { let s = 20450520; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

/* ── 벽 — 한 번만 ── */
function bakeWall() {
  const b = document.createElement('canvas'); b.width = W; b.height = H;
  const x = b.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#05090c'); g.addColorStop(.55, '#0a1216'); g.addColorStop(1, '#060a0d');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 세로 패널 — 폭이 제각각, 이음마다 어두운 홈과 밝은 모서리
  let px = -20 * K;
  while (px < W) {
    const w = (60 + rnd() * 70) * K;
    x.fillStyle = `rgba(${14 + rnd() * 10 | 0},${24 + rnd() * 12 | 0},${30 + rnd() * 12 | 0},${.35 + rnd() * .3})`;
    x.fillRect(px, 0, w, H);
    x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(px, 0, 2 * K, H);
    x.fillStyle = 'rgba(120,170,185,.07)'; x.fillRect(px + 2 * K, 0, K, H);
    if (rnd() < .6) for (let y = 14 * K; y < H; y += (26 + rnd() * 10) * K) {                       // 볼트
      x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.arc(px + 8 * K, y, 1.7 * K, 0, 7); x.fill();
      x.fillStyle = 'rgba(140,190,205,.12)'; x.beginPath(); x.arc(px + 7.6 * K, y - .4 * K, .8 * K, 0, 7); x.fill();
    }
    if (rnd() < .35) { const y = (40 + rnd() * 200) * K; x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(px + 4 * K, y, w - 6 * K, 1.5 * K); }
    px += w;
  }
  // 가로 배관 둘 · 걸레받이
  for (const [y, r] of [[58, 5], [71, 2.5]]) {
    const pg = x.createLinearGradient(0, (y - r) * K, 0, (y + r) * K);
    pg.addColorStop(0, 'rgba(70,100,112,.5)'); pg.addColorStop(.4, 'rgba(22,36,42,.9)'); pg.addColorStop(1, 'rgba(0,0,0,.9)');
    x.fillStyle = pg; x.fillRect(0, (y - r) * K, W, r * 2 * K);
    for (let bx = 40 * K; bx < W; bx += 150 * K) { x.fillStyle = 'rgba(8,14,17,.95)'; x.fillRect(bx, (y - r - 1.5) * K, 7 * K, (r * 2 + 3) * K); }
  }
  x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, H - 34 * K, W, 34 * K);
  x.fillStyle = 'rgba(110,214,232,.06)'; x.fillRect(0, H - 34 * K, W, K);
  // 얼룩 · 잡티
  for (let i = 0; i < 5000; i++) { x.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.14)' : 'rgba(150,200,215,.035)'; x.fillRect(rnd() * W, rnd() * H, (1 + rnd() * 2) * K * .5, (1 + rnd() * 5) * K * .5); }
  return b;
}

/* ── 방호복 — 3D 로 한 번 찍어 옴 ── */
function bakeFigure() {
  if (!window.Figure3D) return null;
  let F;
  try { F = new Figure3D(W, H); } catch (e) { return null; }
  if (!F.ok) return null;
  F.k = W / 960;
  const ex = (H / W * 960 - 540) / 2;                     // 16:10 처럼 세로가 더 길면 — 인물을 그만큼 아래로 (가운데 맞춤)
  const img = F.render({ kind: 'suit', x: -.02, y: -1.47, z: 1.06, yaw: .62, stride: 0, reach: 0, lean: .2, alpha: 1 }, {
    cam: { f: 560, px: 262, py: 272 + ex }, sky: [.022, .04, .05], gnd: [.006, .01, .012], fog: [0, 0, 0], near: 1, red: [0, 0, 0, 0],
    lights: [[[1.5, .75, -1.75], [.3, 1.5, 1.65]],        // 제목 쪽 뒤에서 — 윤곽을 따라 흐르는 청록
             [[1.1, .2, -.55], [.03, .16, .18]],          // 앞을 아주 옅게
             [[-.9, 1.6, -1.6], [.07, .1, .13]],          // 반대편 위 — 어깨선만
             [[.35, -.5, -.6], [.0, .05, .05]]] });
  // 3D 화면 → 2D 그림으로. 픽셀을 직접 읽어 옮깁니다 (readPixels) —
  // 예전처럼 drawImage 로 옮기고 곧바로 3D 문맥을 내려놓으면, 그래픽카드로 그리는 브라우저에선 복사가 끝나기 전에
  // 원본이 사라져 인물이 통째로 안 보일 수 있었음 (소프트웨어 렌더링에선 멀쩡해서 놓쳤던 것)
  const o = document.createElement('canvas'); o.width = W; o.height = H;
  const oc = o.getContext('2d');
  let ok = false;
  try {
    const gl = F.gl, px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const id = oc.createImageData(W, H), d = id.data, row = W * 4;
    for (let y = 0; y < H; y++) {                         // 위아래 뒤집기 + 미리 곱한 알파 풀기
      const src = (H - 1 - y) * row, dst = y * row;
      for (let i = 0; i < row; i += 4) {
        const a = px[src + i + 3];
        if (!a) continue;
        ok = true;
        const k = 255 / a;
        d[dst + i] = Math.min(255, px[src + i] * k); d[dst + i + 1] = Math.min(255, px[src + i + 1] * k); d[dst + i + 2] = Math.min(255, px[src + i + 2] * k); d[dst + i + 3] = a;
      }
    }
    if (ok) oc.putImageData(id, 0, 0);
  } catch (e) { ok = false; }
  if (!ok) {                                              // 못 읽었으면 예전 방식 — 문맥은 잠시 살려 둠
    try { oc.drawImage(img, 0, 0); ok = true; } catch (e) {}
    setTimeout(() => { try { const ext = F.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {} }, 4000);
    return ok ? o : null;
  }
  try { const ext = F.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {}
  return o;
}

let wall = null, fig = null, raf = 0, t = 0, figTry = 0, figAt = 0, figWait = 0;
/* 인물은 미리 구워 둔 그림(js/title_figure.js — tools/make_title_figure.js)을 먼저 씁니다.
   브라우저의 WebGL 에 기대지 않으므로 파이어폭스 · 3D 가 꺼진 기기에서도 늘 보임. 그림이 없을 때만 그 자리에서 3D 로 구움 */
const PRE = window.TITLE_FIG || null;
let preImg = null;
if (PRE && PRE.src) { const im = new Image(); im.onload = () => { preImg = im; }; im.onerror = () => { preImg = false; }; im.src = PRE.src; }
const dust = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * H, r: (.5 + rnd() * 1.3) * K * .5, v: .08 + rnd() * .25, p: rnd() * 6.28, a: .15 + rnd() * .5 }));
function draw() {
  t++;
  const fl = .86 + .14 * Math.sin(t * .013) - (t % 311 > 300 ? .35 * rnd() : 0);       // 제목 빛의 숨 · 가끔 깜빡
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.drawImage(wall, 0, 0);
  // 제목 쪽에서 벽으로 번지는 빛
  c.globalCompositeOperation = 'lighter';
  let g = c.createRadialGradient(W * .74, H * .26, 0, W * .74, H * .26, W * .52);
  g.addColorStop(0, `rgba(60,170,200,${.22 * fl})`); g.addColorStop(.45, `rgba(30,110,130,${.09 * fl})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  const by = Math.sin(t * .018) * 2.2 * K;                                              // 숨 — 살짝 오르내림
  if (preImg) {                                                                        // 미리 구운 그림 — 16:10 틀 기준이라 세로 차이의 절반만큼 올려서
    c.globalAlpha = .9 + .1 * fl;
    c.drawImage(preImg, PRE.x, PRE.y - (PRE.fh - H) / 2 + by, PRE.w, PRE.h);
    c.globalAlpha = 1;
  } else if (fig) {
    c.globalAlpha = .9 + .1 * fl;
    c.drawImage(fig, 0, by);
    c.globalAlpha = 1;
  }
  // 먼지 — 빛 쪽에서 더 잘 보임
  c.globalCompositeOperation = 'lighter';
  for (const d of dust) {
    d.y -= d.v * K * .5; d.x += Math.sin(t * .01 + d.p) * .15 * K; if (d.y < -4) { d.y = H + 4; d.x = rnd() * W; }
    const near = Math.max(0, 1 - Math.hypot(d.x - W * .7, d.y - H * .35) / (W * .6));
    c.fillStyle = `rgba(140,225,240,${d.a * (.12 + near * .5) * fl})`;
    c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  // 아래에서 올라오는 안개 · 가장자리 어둠
  g = c.createLinearGradient(0, H * .62, 0, H);
  g.addColorStop(0, 'rgba(4,8,10,0)'); g.addColorStop(1, 'rgba(4,8,10,.88)');
  c.fillStyle = g; c.fillRect(0, H * .62, W, H * .38);
  g = c.createRadialGradient(W * .52, H * .45, H * .3, W * .52, H * .45, W * .72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.72)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function loop() {
  raf = 0;
  if (title.classList.contains('hidden') || document.hidden) return;          // 안 보이면 쉼 — sync() 가 다시 깨움
  if (!wall) wall = bakeWall();
  // 인물 — 없으면 굽기. 실패하면(3D 가 아직 준비 안 됨 등) 1초 간격으로 몇 번 더 해 봄. 창 크기를 끄는 동안엔 멈출 때까지 기다림
  const now = performance.now();
  if (!fig && (!PRE || preImg === false) && figTry < 5 && now >= figAt && now >= figWait) { fig = bakeFigure(); figTry++; figAt = now + 1000; }
  if (!(t & 1) || t < 3) draw(); else t++;                                     // 한 장 건너 한 장 (30fps)
  raf = requestAnimationFrame(loop);
}
const sync = () => { if (!raf && !title.classList.contains('hidden') && !document.hidden) raf = requestAnimationFrame(loop); };
new MutationObserver(sync).observe(title, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', sync);
addEventListener('load', sync);
sync();
/* 화면 비율이 바뀌면(16:9 ↔ 16:10) — 캔버스 크기를 맞추고 벽 · 인물을 다시 굽습니다 (game.js 의 fit) */
function resize(h) {
  h = Math.round(h); if (h === H) return;
  cv.height = H = h; W = cv.width; K = W / 576; wall = null; fig = null; figTry = 0; figAt = 0; figWait = performance.now() + 220;
  for (const d of dust) d.y = rnd() * H;
  sync();
}
window.TitleScreen = { redraw: sync, resize };
})();
