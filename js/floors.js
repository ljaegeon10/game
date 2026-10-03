'use strict';
/* ═══════════════════════════════════════════════════════════════
   floors.js — 방마다 다른 바닥 재질

   예전 바닥은 32px 정사각 타일을 반듯하게 깐 격자 하나였습니다. 방이 달라도
   바닥이 같아서 인공적으로 보였습니다. 이제 방 테마(roomdeco.js)마다 재질을
   따로 깔고, 마지막에 픽셀 하나하나에 거칠기와 벽가의 때를 얹습니다.

     flag     판석 — 크기가 제각각, 줄마다 어긋나게 쌓고 금 · 깨진 모서리   (갈림길 · 관문)
     cobble   둥근 자갈 — 젖어서 위쪽이 번들거림                         (우물 아래)
     ceramic  작은 병원 타일 — 줄눈, 빠진 타일, 때                        (병동 · 수조실 · 탈출구)
     plate    철판 — 테두리 빗면, 모서리 리벳, 미끄럼 방지 무늬            (관측실)
     dirt     다져진 흙 — 자잘한 돌, 반쯤 묻힌 판석                       (뿌리 통로)
     plank    나무 마루 — 엇갈린 이음매, 나뭇결, 못                       (기록 보관실)
     radial   가운데를 둘러 쌓은 원형 돌 바닥                            (심층)

   모든 색은 어두운 쪽에 머뭅니다 — 이 게임의 지하는 주인공 둘레만 밝습니다.
   ═══════════════════════════════════════════════════════════════ */

const FLOOR_OF = {
  well: 'well', fork: 'flag', ward: 'ceramic', tank: 'ceramicWet', observe: 'plate',
  roots: 'dirt', archive: 'plank', gate: 'flagBig', arena: 'radial', exit: 'lino', plain: 'flag'
};

/* 색 섞기 · 밝기 */
function fhex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function fcol(rgb, k = 0) { return `rgb(${Math.max(0, Math.min(255, rgb[0] + k)) | 0},${Math.max(0, Math.min(255, rgb[1] + k)) | 0},${Math.max(0, Math.min(255, rgb[2] + k)) | 0})`; }

/* 깎아 놓은 돌 한 장 — 왼쪽 위는 빛을 받아 밝게, 오른쪽 아래는 어둡게, 가끔 금 */
function stoneSlab(g, R, x, y, w, h, base, crack = .12) {
  const v = (R() - .5) * 10;
  g.fillStyle = fcol(base, v); g.fillRect(x, y, w, h);
  g.fillStyle = fcol(base, v + 9); g.fillRect(x, y, w - 1, 1); g.fillRect(x, y, 1, h - 1);
  g.fillStyle = fcol(base, v - 10); g.fillRect(x + 1, y + h - 1, w - 1, 1); g.fillRect(x + w - 1, y + 1, 1, h - 1);
  // 닳은 얼룩 한두 점
  if (R() < .5) { g.fillStyle = fcol(base, v - 5); g.fillRect(x + 2 + R() * (w - 8), y + 2 + R() * (h - 6), 3 + R() * 5, 2 + R() * 3); }
  if (R() < crack) {                            // 금 — 지그재그
    g.fillStyle = 'rgba(0,0,0,.55)';
    let cx = x + 2 + R() * (w - 4), cy = y + 1;
    while (cy < y + h - 1) { g.fillRect(cx | 0, cy | 0, 1, 1); cx += (R() - .5) * 2.2; cy += 1; cx = Math.max(x + 1, Math.min(x + w - 2, cx)); }
  }
  if (R() < .18) {                              // 깨진 모서리
    g.fillStyle = 'rgba(0,0,0,.45)';
    const cx = R() < .5 ? x : x + w - 3, cy = R() < .5 ? y : y + h - 3;
    g.fillRect(cx, cy, 3, 3);
  }
}

function floorFlag(g, R, W, H, TS, big) {
  const base = fhex(big ? '#211f2b' : '#201e2a');
  g.fillStyle = '#0d0c12'; g.fillRect(TS, TS, W - TS * 2, H - TS * 2);   // 줄눈
  let y = TS;
  while (y < H - TS) {
    const rh = Math.min(H - TS - y, (big ? 30 : 22) + ((R() * (big ? 14 : 12)) | 0));
    let x = TS - ((R() * 30) | 0);
    while (x < W - TS) {
      const w = (big ? 40 : 26) + ((R() * (big ? 36 : 28)) | 0);
      const x0 = Math.max(TS, x), x1 = Math.min(W - TS, x + w);
      if (x1 - x0 > 3) stoneSlab(g, R, x0 + 1, y + 1, x1 - x0 - 2, rh - 2, base);
      x += w;
    }
    y += rh;
  }
}

function floorCobble(g, R, W, H, TS) {
  // 픽셀을 하나씩 fillRect 하면 180ms 가 걸려서, 이미지 버퍼에 바로 씁니다
  const w = W - TS * 2, h = H - TS * 2, img = g.createImageData(w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 11; d[i + 1] = 10; d[i + 2] = 16; d[i + 3] = 255; }
  const S = 13;
  for (let gy = 0; gy < h + S; gy += S * .86) for (let gx = ((gy / S) % 2) * S / 2; gx < w + S; gx += S) {
    const cx = gx + (R() - .5) * 4, cy = gy + (R() - .5) * 3, rx = S * .5 + R() * 1.5, ry = S * .42 + R() * 1.2;
    const v = (R() - .5) * 12;
    for (let yy = Math.ceil(-ry); yy <= ry; yy++) for (let xx = Math.ceil(-rx); xx <= rx; xx++) {
      const dd = (xx / rx) ** 2 + (yy / ry) ** 2;
      if (dd > 1) continue;
      const px = (cx + xx) | 0, py = (cy + yy) | 0;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const lit = -(xx / rx) * .5 - (yy / ry) * .7;          // 왼쪽 위가 밝게 — 젖은 돌
      const k = v + lit * 9 + (dd > .7 ? -6 : 0) + (lit > .55 && dd < .5 ? 10 : 0);
      const i = (py * w + px) * 4;
      d[i] = Math.max(0, 36 + k); d[i + 1] = Math.max(0, 34 + k); d[i + 2] = Math.max(0, 46 + k);
    }
  }
  g.putImageData(img, TS, TS);
}

/* 우물 바닥 — 가운데는 떨어진 자리의 얕은 웅덩이(roomdeco 가 그림), 둘레는 둥근
   우물 벽을 따라 동심원으로 쌓은 돌, 우물 밖(방 모서리)은 진흙과 돌무더기 */
const WELL_C = [288, 168], WELL_K = .56;
function floorWell(g, R, W, H, TS) {
  const [cx, cy] = WELL_C;
  // 진흙 바탕 — 알갱이
  g.fillStyle = '#141117'; g.fillRect(TS, TS, W - TS * 2, H - TS * 2);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = fcol([26, 22, 26], (R() - .5) * 14);
    g.fillRect(TS + R() * (W - TS * 2), TS + R() * (H - TS * 2), 1 + (R() < .2), 1);
  }
  // 모서리의 돌무더기
  [[TS + 30, TS + 24], [W - TS - 34, TS + 22], [TS + 26, H - TS - 22], [W - TS - 30, H - TS - 26]].forEach(([x, y]) => {
    for (let i = 0; i < 9; i++) {
      const w = 6 + R() * 10, h = 4 + R() * 6;
      stoneSlab(g, R, (x + (R() - .5) * 40 - w / 2) | 0, (y + (R() - .5) * 24 - h / 2) | 0, w | 0, h | 0, fhex('#2a2732'), 0);
    }
  });
  // 둥근 돌바닥 — 안쪽 고리일수록 젖어 푸르고 밝게
  for (let ring = 0; ring < 9; ring++) {
    const r0 = 62 + ring * 17, r1 = r0 + 16, n = Math.round(2 * Math.PI * (r0 + 8) / 30), off = R() * 6;
    const wet = Math.max(0, 1 - ring / 4);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + off, a1 = ((i + 1) / n) * Math.PI * 2 + off - .025;
      const v = (R() - .5) * 12;
      const base = [34 + wet * 4, 33 + wet * 7, 44 + wet * 12];
      g.beginPath();
      g.ellipse(cx, cy, r1, r1 * WELL_K, 0, a0, a1);
      g.ellipse(cx, cy, r0, r0 * WELL_K, 0, a1, a0, true);
      g.closePath();
      const gone = ring > 1 && R() < .06;                    // 빠져나간 돌 — 진흙이 드러남
      g.fillStyle = gone ? '#17131a' : fcol(base, v); g.fill();
      g.strokeStyle = 'rgba(6,6,10,.85)'; g.lineWidth = 1; g.stroke();
      if (!gone && R() < .12) {                              // 금 간 돌
        const am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
        g.strokeStyle = 'rgba(8,8,12,.7)'; g.beginPath();
        g.moveTo(cx + Math.cos(am - .03) * (r0 + 2), cy + Math.sin(am - .03) * (r0 + 2) * WELL_K);
        g.lineTo(cx + Math.cos(am + .02) * rm, cy + Math.sin(am + .02) * rm * WELL_K);
        g.lineTo(cx + Math.cos(am - .01) * (r1 - 2), cy + Math.sin(am - .01) * (r1 - 2) * WELL_K);
        g.stroke();
      }
      // 안쪽(웅덩이 쪽) 모서리에 맺힌 물기
      if (wet > 0 && R() < .7) {
        g.beginPath(); g.ellipse(cx, cy, r0 + 1.5, (r0 + 1.5) * WELL_K, 0, a0 + .02, a1 - .02);
        g.strokeStyle = `rgba(150,180,210,${.12 + wet * .18})`; g.stroke();
      }
    }
  }
  // 우물 벽이 바닥에 닿는 자리 — 가장 바깥 고리 둘레에 짙은 그늘
  g.beginPath(); g.ellipse(cx, cy, 62 + 9 * 17 + 4, (62 + 9 * 17 + 4) * WELL_K, 0, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 6; g.stroke();
}

function floorCeramic(g, R, W, H, TS, kind) {
  const T = kind === 'lino' ? 16 : 12;
  const base = fhex(kind === 'wet' ? '#1b2530' : kind === 'lino' ? '#262a33' : '#24242e');
  const grout = kind === 'wet' ? '#0a1018' : '#111118';
  g.fillStyle = grout; g.fillRect(TS, TS, W - TS * 2, H - TS * 2);
  for (let y = TS; y < H - TS; y += T) for (let x = TS; x < W - TS; x += T) {
    if (R() < .03) continue;                                       // 빠진 타일 — 줄눈만
    const v = (R() - .5) * 8 + (kind === 'lino' && ((x / T + y / T) % 2) ? 5 : 0);   // 리놀륨은 체크무늬
    const w = Math.min(T - 1, W - TS - x), h = Math.min(T - 1, H - TS - y);
    g.fillStyle = fcol(base, v); g.fillRect(x, y, w, h);
    g.fillStyle = fcol(base, v + 8); g.fillRect(x, y, w, 1);
    if (kind === 'wet' && R() < .25) { g.fillStyle = 'rgba(140,190,220,.12)'; g.fillRect(x + 2, y + 2, w - 5, 1); }   // 젖은 반사
    if (R() < .06) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + (R() * T) | 0, y, 1, h); }                       // 금 간 타일
  }
  // 때 — 줄눈을 따라 번진 얼룩 몇 군데
  for (let i = 0; i < 9; i++) {
    const x = TS + R() * (W - TS * 2), y = TS + R() * (H - TS * 2), r = 10 + R() * 24;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, kind === 'wet' ? 'rgba(10,30,30,.35)' : 'rgba(30,24,14,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function floorPlate(g, R, W, H, TS) {
  const PW = 48, PH = 32, base = fhex('#1f232b');
  g.fillStyle = '#090a0e'; g.fillRect(TS, TS, W - TS * 2, H - TS * 2);
  for (let y = TS; y < H - TS; y += PH) for (let x = TS; x < W - TS; x += PW) {
    const w = Math.min(PW - 2, W - TS - x - 1), h = Math.min(PH - 2, H - TS - y - 1), v = (R() - .5) * 6;
    g.fillStyle = fcol(base, v); g.fillRect(x + 1, y + 1, w, h);
    g.fillStyle = fcol(base, v + 12); g.fillRect(x + 1, y + 1, w, 1); g.fillRect(x + 1, y + 1, 1, h);
    g.fillStyle = fcol(base, v - 9); g.fillRect(x + 1, y + h, w, 1); g.fillRect(x + w, y + 1, 1, h);
    g.fillStyle = fcol(base, v + 5);                               // 미끄럼 방지 무늬 — 엇갈린 짧은 빗금
    for (let yy = y + 5; yy < y + h - 3; yy += 4) for (let xx = x + 5 + ((yy / 4) % 2) * 3; xx < x + w - 3; xx += 6) g.fillRect(xx, yy, 2, 1);
    g.fillStyle = fcol(base, 20);                                  // 리벳
    [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 3], [x + w - 3, y + h - 3]].forEach(([a, b]) => { g.fillRect(a, b, 2, 2); g.fillStyle = fcol(base, -14); g.fillRect(a + 1, b + 1, 1, 1); g.fillStyle = fcol(base, 20); });
    if (R() < .2) { g.fillStyle = 'rgba(80,40,20,.25)'; g.fillRect(x + R() * w * .6, y + R() * h * .6, 8 + R() * 10, 4 + R() * 6); }   // 녹
  }
}

function floorDirt(g, R, W, H, TS) {
  g.fillStyle = '#1c1714'; g.fillRect(TS, TS, W - TS * 2, H - TS * 2);
  for (let i = 0; i < 1600; i++) {                                 // 흙 알갱이
    const v = (R() - .5) * 18;
    g.fillStyle = fcol([30, 24, 20], v);
    g.fillRect(TS + R() * (W - TS * 2), TS + R() * (H - TS * 2), 1 + (R() < .2), 1);
  }
  for (let i = 0; i < 14; i++) {                                   // 반쯤 묻힌 판석
    const w = 18 + R() * 26, h = 12 + R() * 14;
    stoneSlab(g, R, (TS + R() * (W - TS * 2 - w)) | 0, (TS + R() * (H - TS * 2 - h)) | 0, w | 0, h | 0, fhex('#241f22'), .3);
  }
  for (let i = 0; i < 60; i++) { g.fillStyle = fcol([44, 40, 48], (R() - .5) * 10); g.fillRect(TS + R() * (W - TS * 2), TS + R() * (H - TS * 2), 2, 2); }   // 자갈
}

function floorPlank(g, R, W, H, TS) {
  const PH = 11, base = fhex('#261e18');
  g.fillStyle = '#0e0a08'; g.fillRect(TS, TS, W - TS * 2, H - TS * 2);
  for (let y = TS; y < H - TS; y += PH) {
    let x = TS - ((R() * 60) | 0);
    while (x < W - TS) {
      const len = 60 + ((R() * 70) | 0), x0 = Math.max(TS, x), x1 = Math.min(W - TS, x + len), v = (R() - .5) * 10;
      const h = Math.min(PH - 1, H - TS - y);
      g.fillStyle = fcol(base, v); g.fillRect(x0, y, x1 - x0 - 1, h);
      g.fillStyle = fcol(base, v + 9); g.fillRect(x0, y, x1 - x0 - 1, 1);
      g.fillStyle = fcol(base, v - 6);                             // 나뭇결
      for (let k = 0; k < 3; k++) { const gy = y + 2 + ((R() * (h - 3)) | 0), gx = x0 + R() * (x1 - x0) * .5; g.fillRect(gx | 0, gy, (10 + R() * 30) | 0, 1); }
      if (R() < .2) { g.fillStyle = fcol(base, -12); g.beginPath(); g.ellipse(x0 + R() * (x1 - x0), y + h / 2, 2.5, 1.5, 0, 0, Math.PI * 2); g.fill(); }   // 옹이
      g.fillStyle = '#4a4550'; g.fillRect(x0 + 2, y + 4, 1, 1); g.fillRect(x1 - 4, y + 4, 1, 1);                    // 못
      x += len;
    }
  }
}

function floorRadial(g, R, W, H, TS) {
  const cx = W / 2, cy = H / 2;
  g.fillStyle = '#0d0b10'; g.fillRect(TS, TS, W - TS * 2, H - TS * 2);
  floorFlag(g, R, W, H, TS, true);
  g.save();
  g.beginPath(); g.ellipse(cx, cy, 196, 108, 0, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#0d0b10'; g.fillRect(0, 0, W, H);
  for (let ring = 0; ring < 8; ring++) {                            // 고리마다 돌 블록
    const r0 = 14 + ring * 24, r1 = r0 + 23, n = 6 + ring * 5, off = R() * 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + off, a1 = ((i + 1) / n) * Math.PI * 2 + off - .03;
      const v = (R() - .5) * 10, col = fcol([38, 30, 40], v);
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(cx, cy, r1 * 1.0, r1 * .55, 0, a0, a1);
      g.ellipse(cx, cy, r0 * 1.0, r0 * .55, 0, a1, a0, true);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke();
    }
  }
  g.restore();
}

/* 마무리 — 픽셀마다 거칠기(±), 벽가로 갈수록 끼는 때 */
function floorGrit(g, R, W, H, TS, amount = 7) {
  const img = g.getImageData(TS, TS, W - TS * 2, H - TS * 2), d = img.data, w = W - TS * 2, h = H - TS * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    const grime = edge < 18 ? (18 - edge) * .9 : 0;
    const n = (R() - .5) * amount * 2 - grime + (R() < .015 ? -14 : 0);
    d[i] = Math.max(0, d[i] + n); d[i + 1] = Math.max(0, d[i + 1] + n); d[i + 2] = Math.max(0, d[i + 2] + n);
  }
  g.putImageData(img, TS, TS);
}

/* bakeDungeonFloor 가 부릅니다 — 테마의 바닥 재질을 깔고 거칠기를 얹습니다 */
function paintFloorMaterial(g, theme, R, W, H, TS) {
  const m = FLOOR_OF[theme] || 'flag';
  if (m === 'cobble') floorCobble(g, R, W, H, TS);
  else if (m === 'well') floorWell(g, R, W, H, TS);
  else if (m === 'ceramic') floorCeramic(g, R, W, H, TS, 'tile');
  else if (m === 'ceramicWet') floorCeramic(g, R, W, H, TS, 'wet');
  else if (m === 'lino') floorCeramic(g, R, W, H, TS, 'lino');
  else if (m === 'plate') floorPlate(g, R, W, H, TS);
  else if (m === 'dirt') floorDirt(g, R, W, H, TS);
  else if (m === 'plank') floorPlank(g, R, W, H, TS);
  else if (m === 'radial') floorRadial(g, R, W, H, TS);
  else floorFlag(g, R, W, H, TS, m === 'flagBig');
  floorGrit(g, R, W, H, TS, m === 'plate' || m === 'lino' ? 4 : 7);
}
