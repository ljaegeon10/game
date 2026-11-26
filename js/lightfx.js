'use strict';
/* ═══════════════════════════════════════════════════════════
   lightfx.js — 1부(탑뷰)의 빛

   예전엔 「주인공 둘레만 밝은 둥근 어둠」 한 겹이었습니다. 이제 빛이 여럿 :
   주인공 · 벽의 등롱 · 빛나는 버섯 · 탄 · 몹의 눈 · 보스 · 떨어진 하트와 열쇠 · 맞는 순간의 번쩍임.
   빛마다 어둠에 구멍을 내고(밝기), 색이 있는 빛은 그 위로 옅게 번집니다(색).

   방식 (값싸게 — 화면 해상도와 무관) :
     ① 1/4 크기 캔버스를 어둠 색으로 칠하고, 빛마다 부드러운 원을 'destination-out' 으로 뚫음
     ② 그걸 화면에 그냥(source-over) 늘려 얹음 — 곱하기 같은 무거운 섞기는 안 씀
     ③ 색 있는 빛은 구워 둔 둥근 번짐 그림을 '더하기(lighter)'로 한 장씩
   빛은 그리는 도중 어디서든 LightFX.add(...) 로 모으고, 방을 다 그린 뒤 LightFX.flush(...) 한 번.
   가벼운 화면(Perf.low)에선 ③ 과 먼지를 뺌.
   ═══════════════════════════════════════════════════════════ */
(() => {
const S = 4;
let cv = null, x = null, bw = 0, bh = 0;
let HOLE = null;
const HALO = {};
const disc = stops => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; };
const hole = () => HOLE || (HOLE = disc([[0, 'rgba(0,0,0,1)'], [.28, 'rgba(0,0,0,.94)'], [.55, 'rgba(0,0,0,.55)'], [.8, 'rgba(0,0,0,.16)'], [1, 'rgba(0,0,0,0)']]));
const halo = c => HALO[c] || (HALO[c] = disc([[0, `rgba(${c},.9)`], [.3, `rgba(${c},.42)`], [.65, `rgba(${c},.1)`], [1, `rgba(${c},0)`]]));

const L = [];                                        // [x, y, 반지름, 세기, 색('r,g,b' 또는 null), 색 번짐 세기] × n
/* 빛 하나 — (x, y) 방 좌표 · r 닿는 거리 · a 밝히는 세기 0‥1 · col 색('r,g,b') · glow 색이 번지는 세기 0‥1 */
function add(px, py, r, a, col, glow) { L.push(px, py, r, a == null ? 1 : a, col || null, glow || 0); }

/* g : 방 좌표로 옮겨진 그리기 문맥 · (vx, vy, vw, vh) 지금 보이는 곳(방 좌표) · dark 어둠 세기 0‥1 · tint 어둠 색 'r,g,b' */
function flush(g, vx, vy, vw, vh, dark, tint, lite) {
  const w = Math.ceil(vw / S) + 1, h = Math.ceil(vh / S) + 1;
  if (!cv) { cv = document.createElement('canvas'); x = cv.getContext('2d'); }
  if (bw !== w || bh !== h) { cv.width = bw = w; cv.height = bh = h; }
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  x.clearRect(0, 0, w, h);
  x.fillStyle = `rgba(${tint || '5,7,16'},${Math.max(0, Math.min(1, dark)).toFixed(3)})`; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'destination-out';
  const H = hole();
  for (let i = 0; i < L.length; i += 6) {
    const r = L[i + 2]; x.globalAlpha = L[i + 3];
    x.drawImage(H, (L[i] - vx - r) / S, (L[i + 1] - vy - r) / S, r * 2 / S, r * 2 / S);
  }
  const sm = g.imageSmoothingEnabled, ga = g.globalAlpha, op = g.globalCompositeOperation;
  g.imageSmoothingEnabled = true; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.drawImage(cv, 0, 0, w, h, vx, vy, w * S, h * S);
  if (!lite) {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < L.length; i += 6) {
      const gl = L[i + 5]; if (!gl || !L[i + 4]) continue;
      const r = L[i + 2] * .8; g.globalAlpha = gl > 1 ? 1 : gl;
      g.drawImage(halo(L[i + 4]), L[i] - r, L[i + 1] - r, r * 2, r * 2);
    }
  }
  g.imageSmoothingEnabled = sm; g.globalAlpha = ga; g.globalCompositeOperation = op;
  L.length = 0;
}

/* ── 빛 속에 떠다니는 먼지 — 화면에 고정된 몇 점이 천천히 흐르고, 빛(주인공 · 등롱) 가까이에서만 반짝임 ── */
const DUST = Array.from({ length: 34 }, (_, i) => ({ x: (i * 97.3) % 576, y: (i * 53.7) % 360, v: .05 + (i % 5) * .03, p: i * 1.7, s: i % 7 === 0 ? 2 : 1 }));
function dust(g, t, vx, vy, vw, vh, lights) {
  const ga = g.globalAlpha, op = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  for (const d of DUST) {
    d.y -= d.v; d.x += Math.sin(t * .011 + d.p) * .12;
    if (d.y < -2) { d.y = vh + 2; d.x = (d.x * 7.13 + 31) % vw; }
    let k = 0; const wx = vx + d.x, wy = vy + d.y;
    for (let i = 0; i < lights.length; i += 3) { const q = 1 - Math.hypot(wx - lights[i], wy - lights[i + 1]) / lights[i + 2]; if (q > k) k = q; }
    if (k <= .05) continue;
    g.globalAlpha = k * (.3 + .25 * Math.sin(t * .05 + d.p));
    g.fillStyle = '#ffe9c4'; g.fillRect(Math.round(wx), Math.round(wy), d.s, d.s);
  }
  g.globalAlpha = ga; g.globalCompositeOperation = op;
}

/* ── 바닥에 낮게 깔려 흐르는 안개 — 구워 둔 뭉게 그림 두 장이 저마다 다른 빠르기로 옆으로 흐름 (어둠을 얹기 전에 — 빛 가까이에서만 보임) ── */
let FOG = null;
function fogTex() {
  if (FOG) return FOG;
  FOG = document.createElement('canvas'); FOG.width = 256; FOG.height = 96; const g = FOG.getContext('2d');
  let s = 91; const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 26; i++) { const cx = R() * 256, cy = 20 + R() * 56, r = 18 + R() * 30;
    for (const ox of [-256, 0, 256]) { const gr = g.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, r);        // 좌우로 이어지게
      gr.addColorStop(0, 'rgba(150,170,205,.2)'); gr.addColorStop(1, 'rgba(150,170,205,0)'); g.fillStyle = gr; g.fillRect(cx + ox - r, cy - r, r * 2, r * 2); } }
  return FOG;
}
function fog(g, t, vx, vy, vw, vh, k) {
  const T = fogTex(), ga = g.globalAlpha, sm = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;                    // 늘려 찍되 부드럽게 섞지 않음 — 큰 그림을 매 장 부드럽게 늘리는 건 비쌈 (도트 화면이라 티도 안 남)
  for (let i = 0; i < 2; i++) {
    const w = 512, h = 192, sp = (.07 + i * .05) * (i % 2 ? -1 : 1);
    const ox = ((t * sp + i * 173) % w + w) % w, y = Math.round(vy + vh * (.3 + i * .38) - h / 2 + Math.sin(t * .004 + i * 2) * 8);
    g.globalAlpha = k * (.5 + .2 * Math.sin(t * .006 + i));
    for (let x = Math.round(vx - ox); x < vx + vw; x += w) g.drawImage(T, x, y, w, h);
  }
  g.globalAlpha = ga; g.imageSmoothingEnabled = sm;
}
/* ── 숲의 저녁 햇살 — 왼쪽 위에서 비스듬히 드는 빛줄기 몇 가닥 (어둠을 얹은 뒤 '더하기'로) ── */
let RAY = null;
function rays(g, t, vx, vy, vw, vh, k) {
  if (!RAY) { RAY = document.createElement('canvas'); RAY.width = 64; RAY.height = 256; const c = RAY.getContext('2d');
    const a = c.createLinearGradient(0, 0, 64, 0); a.addColorStop(0, 'rgba(255,190,110,0)'); a.addColorStop(.5, 'rgba(255,196,120,.5)'); a.addColorStop(1, 'rgba(255,190,110,0)');
    c.fillStyle = a; c.fillRect(0, 0, 64, 256);
    c.globalCompositeOperation = 'destination-in'; const b = c.createLinearGradient(0, 0, 0, 256); b.addColorStop(0, 'rgba(0,0,0,.9)'); b.addColorStop(.6, 'rgba(0,0,0,.5)'); b.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = b; c.fillRect(0, 0, 64, 256); }
  const ga = g.globalAlpha, op = g.globalCompositeOperation, sm = g.imageSmoothingEnabled;
  g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
  [[.08, 46, 1.0], [.3, 70, .7], [.52, 38, .9], [.74, 84, .6], [.93, 50, .8]].forEach(([u, w, a], i) => {
    g.save(); g.translate(vx + vw * u + Math.sin(t * .003 + i * 1.7) * 10, vy - 20); g.rotate(.42);
    g.globalAlpha = k * a * (.55 + .45 * Math.sin(t * .008 + i * 2.1));
    g.drawImage(RAY, -w / 2, 0, w, vh * 1.25); g.restore();
  });
  g.globalAlpha = ga; g.globalCompositeOperation = op; g.imageSmoothingEnabled = sm;
}
/* ── 하트가 한 칸 남았을 때 — 화면 가장자리가 붉게 뜀 ── */
let LOW = null;
function lowHp(g, w, h, k) {
  if (!LOW) { LOW = document.createElement('canvas'); LOW.width = 144; LOW.height = 90; const c = LOW.getContext('2d');
    const gr = c.createRadialGradient(72, 45, 34, 72, 45, 88); gr.addColorStop(0, 'rgba(200,30,30,0)'); gr.addColorStop(.7, 'rgba(200,30,30,.28)'); gr.addColorStop(1, 'rgba(160,10,16,.7)');
    c.fillStyle = gr; c.fillRect(0, 0, 144, 90); }
  const ga = g.globalAlpha, sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = true; g.globalAlpha = k;
  g.drawImage(LOW, 0, 0, w, h); g.globalAlpha = ga; g.imageSmoothingEnabled = sm;
}
window.LightFX = { add, flush, dust, fog, rays, lowHp, count: () => L.length / 6 };
})();
