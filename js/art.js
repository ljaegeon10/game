/* ═══════════════════════════════════════════════════════════
   art.js — 절차적 배경/장식 그리기
   한국 전통 오방색(五方色)을 맵 곳곳의 장식 요소로 사용합니다.
     청(靑) 동 · 백(白) 서 · 적(赤) 남 · 흑(黑) 북 · 황(黃) 중앙
   지하로 깊이 들어갈수록 이 단청 무늬가 조금씩 어긋나고 번집니다.
   ═══════════════════════════════════════════════════════════ */

const OBANG = {
  cheong: '#2f6fb5',
  baek:   '#e9e3d5',
  jeok:   '#c2352c',
  heuk:   '#15141b',
  hwang:  '#e3b23c'
};
const OBANG_LIST = [OBANG.cheong, OBANG.baek, OBANG.jeok, OBANG.heuk, OBANG.hwang];

/* 결정론적 난수 — 방마다 항상 같은 모양이 나오도록 */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/* ── 단청 꽃무늬 (연화문 단순화) ────────────────────────── */
function drawDancheong(g, cx, cy, r, warp = 0, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(cx, cy);
  if (warp) g.rotate((Math.random() - 0.5) * warp * 0.5);

  // 바깥 청색 테
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = OBANG.cheong; g.fill();

  // 백색 테
  g.beginPath(); g.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  g.fillStyle = OBANG.baek; g.fill();

  // 적색 꽃잎 6장
  g.fillStyle = OBANG.jeok;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (warp ? Math.random() * warp : 0);
    g.beginPath();
    g.ellipse(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.26, r * 0.16, a, 0, Math.PI * 2);
    g.fill();
  }

  // 중앙 황색 (중앙=土=黃)
  g.beginPath(); g.arc(0, 0, r * 0.24, 0, Math.PI * 2);
  g.fillStyle = OBANG.hwang; g.fill();
  g.beginPath(); g.arc(0, 0, r * 0.1, 0, Math.PI * 2);
  g.fillStyle = OBANG.heuk; g.fill();
  g.restore();
}

/* ── 색동 띠 (오방색 줄무늬) ────────────────────────────── */
function drawSaekdong(g, x, y, w, h, vertical = false, alpha = 1, offset = 0) {
  g.save();
  g.globalAlpha = alpha;
  const n = OBANG_LIST.length;
  const step = (vertical ? h : w) / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = OBANG_LIST[(i + offset) % n];
    if (vertical) g.fillRect(x, y + i * step, w, step + 0.6);
    else          g.fillRect(x + i * step, y, step + 0.6, h);
  }
  g.restore();
}

/* ── 오방색 매듭(전통 매듭) 아이콘 : 열쇠·주머니에 사용 ──── */
function drawMaedeup(g, cx, cy, s, color) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = color; g.lineWidth = Math.max(1.4, s * 0.16);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-s * 0.5, 0); g.lineTo(0, -s * 0.5); g.lineTo(s * 0.5, 0); g.lineTo(0, s * 0.5); g.closePath();
  g.stroke();
  g.beginPath();
  g.moveTo(-s * 0.28, 0); g.lineTo(0, -s * 0.28); g.lineTo(s * 0.28, 0); g.lineTo(0, s * 0.28); g.closePath();
  g.stroke();
  g.restore();
}

/* ── 태극 문양 : 마지막 문에 사용 ──────────────────────── */
function drawTaegeuk(g, cx, cy, r, rot = 0) {
  g.save();
  g.translate(cx, cy); g.rotate(rot);
  g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  g.arc(0, r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true);
  g.arc(0, -r / 2, r / 2, Math.PI / 2, -Math.PI / 2);
  g.fillStyle = OBANG.jeok; g.fill();
  g.beginPath(); g.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
  g.arc(0, -r / 2, r / 2, -Math.PI / 2, Math.PI / 2, true);
  g.arc(0, r / 2, r / 2, -Math.PI / 2, Math.PI / 2);
  g.fillStyle = OBANG.cheong; g.fill();
  g.restore();
}

/* ═══════════ 지상 : 평화로운 숲 ═══════════════════════════ */
function bakeForest(W, H, TS) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = rng(20450501);

  // 잔디
  g.fillStyle = '#4e7c3e'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    const x = R() * W, y = R() * H, v = R();
    g.fillStyle = v > .72 ? '#5c8c46' : v > .4 ? '#456f37' : '#568742';
    g.fillRect(x | 0, y | 0, 2, 2);
  }
  // 밝은 빛 웅덩이
  const lg = g.createRadialGradient(W * .35, H * .3, 10, W * .35, H * .3, 220);
  lg.addColorStop(0, 'rgba(255,246,190,.20)'); lg.addColorStop(1, 'rgba(255,246,190,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);

  // 흙길 — 우물로 이어진다
  g.strokeStyle = '#8a7452'; g.lineWidth = 26; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-10, H * .68); g.quadraticCurveTo(W * .45, H * .78, W * .74, H * .52); g.stroke();
  g.strokeStyle = '#9c8560'; g.lineWidth = 18;
  g.beginPath(); g.moveTo(-10, H * .68); g.quadraticCurveTo(W * .45, H * .78, W * .74, H * .52); g.stroke();
  for (let i = 0; i < 130; i++) {
    const t = R();
    const x = -10 + t * (W * .8) + (R() - .5) * 16;
    const y = H * .68 + Math.sin(t * 2.4) * 26 - t * t * 60 + (R() - .5) * 14;
    g.fillStyle = R() > .5 ? '#b09a72' : '#7d6a4c';
    g.fillRect(x | 0, y | 0, 2, 2);
  }

  // 꽃 — 오방색으로 흩뿌린다
  for (let i = 0; i < 80; i++) {
    const x = R() * W, y = 20 + R() * (H - 40);
    g.fillStyle = OBANG_LIST[(R() * 5) | 0];
    g.globalAlpha = .85;
    g.fillRect(x | 0, y | 0, 2, 2);
    g.fillRect((x | 0) + 2, (y | 0) + 1, 1, 1);
    g.globalAlpha = 1;
  }
  return c;
}

/* 나무 한 그루 */
function drawTree(g, x, y, s, t) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.beginPath(); g.ellipse(x, y + s * .12, s * .55, s * .18, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a4326'; g.fillRect(x - s * .09, y - s * .34, s * .18, s * .42);
  const sway = Math.sin(t * .0011 + x) * s * .03;
  g.fillStyle = '#2f5a2b';
  g.beginPath(); g.ellipse(x + sway, y - s * .62, s * .52, s * .40, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3d7134';
  g.beginPath(); g.ellipse(x - s * .14 + sway, y - s * .72, s * .34, s * .27, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4d8a3f';
  g.beginPath(); g.ellipse(x + s * .16 + sway, y - s * .78, s * .22, s * .17, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

/* 장승 — 오방색 띠를 두른 마을 수호신 */
function drawJangseung(g, x, y, s) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.beginPath(); g.ellipse(x, y + 2, s * .5, s * .16, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6b543a'; g.fillRect(x - s * .18, y - s * 1.5, s * .36, s * 1.5);
  g.fillStyle = '#7d6444'; g.fillRect(x - s * .18, y - s * 1.5, s * .12, s * 1.5);
  // 얼굴
  g.fillStyle = '#e9e3d5';
  g.fillRect(x - s * .12, y - s * 1.32, s * .08, s * .07);
  g.fillRect(x + s * .04, y - s * 1.32, s * .08, s * .07);
  g.fillStyle = '#15141b';
  g.fillRect(x - s * .10, y - s * 1.31, s * .04, s * .05);
  g.fillRect(x + s * .06, y - s * 1.31, s * .04, s * .05);
  g.fillStyle = OBANG.jeok;
  g.fillRect(x - s * .10, y - s * 1.16, s * .20, s * .05);
  // 오방색 띠
  drawSaekdong(g, x - s * .18, y - s * .82, s * .36, s * .10, false, .95);
  drawSaekdong(g, x - s * .18, y - s * .50, s * .36, s * .08, false, .8, 2);
  g.restore();
}

/* 솟대 — 장대 위의 새 */
function drawSotdae(g, x, y, s, t) {
  g.save();
  g.strokeStyle = '#6b543a'; g.lineWidth = Math.max(2, s * .09);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 1.7); g.stroke();
  drawSaekdong(g, x - s * .1, y - s * .9, s * .2, s * .1, false, .9, 1);
  const bob = Math.sin(t * .002 + x) * s * .04;
  g.fillStyle = '#2b2b33';
  g.beginPath();
  g.ellipse(x + s * .12, y - s * 1.75 + bob, s * .26, s * .11, -.15, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(x + s * .34, y - s * 1.83 + bob, s * .09, 0, Math.PI * 2); g.fill();
  g.fillStyle = OBANG.hwang;
  g.fillRect(x + s * .42, y - s * 1.85 + bob, s * .12, s * .04);
  g.restore();
}

/* 우물 */
function drawWell(g, x, y, t, glow) {
  g.save();
  // 그림자
  g.fillStyle = 'rgba(0,0,0,.3)';
  g.beginPath(); g.ellipse(x, y + 6, 40, 15, 0, 0, Math.PI * 2); g.fill();
  // 돌 테두리
  g.fillStyle = '#6f6a63';
  g.beginPath(); g.ellipse(x, y, 38, 22, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8a847b';
  g.beginPath(); g.ellipse(x, y - 2, 38, 22, 0, 0, Math.PI * 2); g.fill();
  // 돌 이음매
  g.strokeStyle = '#5d5850'; g.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * 26, y - 2 + Math.sin(a) * 15);
    g.lineTo(x + Math.cos(a) * 38, y - 2 + Math.sin(a) * 22);
    g.stroke();
  }
  // 구멍 — 끝이 보이지 않는다
  const gr = g.createRadialGradient(x, y - 2, 2, x, y - 2, 27);
  gr.addColorStop(0, '#000'); gr.addColorStop(.7, '#050409'); gr.addColorStop(1, '#171420');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(x, y - 2, 27, 15, 0, 0, Math.PI * 2); g.fill();
  // 홀린 듯한 푸른 빛 (복선)
  if (glow > 0) {
    g.globalAlpha = glow * (.20 + Math.sin(t * .006) * .12);
    const bg = g.createRadialGradient(x, y - 2, 1, x, y - 2, 26);
    bg.addColorStop(0, 'rgba(125,227,200,.75)');
    bg.addColorStop(.55, 'rgba(125,227,200,.18)');
    bg.addColorStop(1, 'rgba(125,227,200,0)');
    g.fillStyle = bg;
    g.beginPath(); g.ellipse(x, y - 2, 26, 15, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  // 지붕 기둥 + 오방색 단청
  g.fillStyle = '#5a4326';
  g.fillRect(x - 34, y - 46, 5, 44);
  g.fillRect(x + 29, y - 46, 5, 44);
  g.fillStyle = '#3b2c1a';
  g.beginPath();
  g.moveTo(x - 46, y - 44); g.lineTo(x, y - 62); g.lineTo(x + 46, y - 44);
  g.lineTo(x + 38, y - 40); g.lineTo(x, y - 55); g.lineTo(x - 38, y - 40);
  g.closePath(); g.fill();
  drawSaekdong(g, x - 42, y - 42, 84, 4, false, .9);
  drawDancheong(g, x, y - 50, 5, 0, .95);
  g.restore();
}

/* ═══════════ 지하 : 던전 바닥 ═════════════════════════════ */
function bakeDungeonFloor(W, H, TS, seed, depth) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = rng(seed);
  const warp = depth * 0.16;               // 깊이가 깊을수록 무늬가 어긋난다
  const decay = Math.max(0.18, 0.8 - depth * 0.14);

  g.fillStyle = '#22202b'; g.fillRect(0, 0, W, H);

  // 돌 타일
  for (let y = TS; y < H - TS; y += TS) {
    for (let x = TS; x < W - TS; x += TS) {
      const v = R();
      g.fillStyle = v > .78 ? '#2b2836' : v > .45 ? '#262330' : '#1f1d28';
      g.fillRect(x, y, TS, TS);
      g.strokeStyle = 'rgba(0,0,0,.36)'; g.lineWidth = 1;
      g.strokeRect(x + .5, y + .5, TS - 1, TS - 1);
      // 균열
      if (v > .9) {
        g.strokeStyle = 'rgba(0,0,0,.5)';
        g.beginPath();
        g.moveTo(x + R() * TS, y);
        g.lineTo(x + R() * TS, y + TS);
        g.stroke();
      }
    }
  }

  // 오방색 단청 바닥 장식 — 방 중앙 + 네 모서리
  drawDancheong(g, W / 2, H / 2, 26, warp, decay);
  const inset = TS * 2.5;
  [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]]
    .forEach(([x, y], i) => {
      if (R() > .18) drawDancheong(g, x, y, 8, warp, decay * (.5 - i * .03));
    });

  // 중앙 단청을 둘러싼 오방색 마름모 (조각보 느낌으로 옅게)
  g.globalAlpha = decay * .34;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + warp;
    const dx = W / 2 + Math.cos(a) * 48, dy = H / 2 + Math.sin(a) * 44;
    g.save(); g.translate(dx, dy); g.rotate(Math.PI / 4);
    g.fillStyle = OBANG_LIST[i % 5];
    g.fillRect(-3, -3, 6, 6);
    g.restore();
  }
  // 바닥 곳곳에 흩어진 작은 오방색 조각
  for (let i = 0; i < 26; i++) {
    g.fillStyle = OBANG_LIST[(R() * 5) | 0];
    g.globalAlpha = decay * (.12 + R() * .16);
    const x = TS + R() * (W - TS * 2), y = TS + R() * (H - TS * 2);
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    g.fillRect(-2, -2, 4, 4); g.restore();
  }
  g.globalAlpha = 1;

  // 뼈 — 현실에서는 인체 골격 모형
  const bones = 4 + depth * 3;
  for (let i = 0; i < bones; i++) {
    const x = TS * 1.6 + R() * (W - TS * 3.2);
    const y = TS * 1.6 + R() * (H - TS * 3.2);
    drawBone(g, x, y, R() * Math.PI, .55 + R() * .3);
  }
  // 해골
  for (let i = 0; i < 1 + depth; i++) {
    drawSkull(g, TS * 1.6 + R() * (W - TS * 3.2), TS * 1.6 + R() * (H - TS * 3.2), .8 + R() * .4);
  }

  // 핏자국 — 현실에서는 링거의 붉은 배양액
  for (let i = 0; i < 3 + depth * 4; i++) {
    const x = TS + R() * (W - TS * 2), y = TS + R() * (H - TS * 2);
    g.fillStyle = `rgba(120,20,18,${.16 + R() * .26})`;
    g.beginPath(); g.ellipse(x, y, 5 + R() * 16, 3 + R() * 9, R() * 3, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(x + (R() - .5) * 40, y + (R() - .5) * 26, .8 + R() * 2, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 어둠 (가장자리로 갈수록)
  const vg = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * .62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${.30 + depth * .06})`);
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  return c;
}

function drawBone(g, x, y, a, s) {
  g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
  g.fillStyle = '#cec7b4';
  g.fillRect(-9, -1.5, 18, 3);
  [[-9, -2.6], [-9, 2.6], [9, -2.6], [9, 2.6]].forEach(([bx, by]) => {
    g.beginPath(); g.arc(bx, by, 2.4, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(-9, .6, 18, 1);
  g.restore();
}

function drawSkull(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#d4cdba';
  g.beginPath(); g.ellipse(0, 0, 7, 6, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(-3.5, 4, 7, 3.5);
  g.fillStyle = '#141219';
  g.beginPath(); g.arc(-2.7, -.8, 2.1, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(2.7, -.8, 2.1, 0, Math.PI * 2); g.fill();
  g.fillRect(-.8, 2.4, 1.6, 2);
  g.fillStyle = 'rgba(0,0,0,.2)';
  g.fillRect(-3.5, 5.6, 7, .8);
  g.restore();
}

/* ── 벽 (벽돌 텍스처 + 오방색 띠) ───────────────────────── */
let _brickPat = null;
function drawWalls(g, W, H, TS, depth, t) {
  if (_brickPat === null) _brickPat = IMG.brick ? g.createPattern(IMG.brick, 'repeat') : false;
  const ring = (x, y, w, h) => {
    g.fillStyle = _brickPat || '#3a3128';
    g.fillRect(x, y, w, h);
  };
  ring(0, 0, W, TS);
  ring(0, H - TS, W, TS);
  ring(0, 0, TS, H);
  ring(W - TS, 0, TS, H);

  // 벽을 어둡게 + 아래쪽 그림자
  g.fillStyle = 'rgba(8,6,12,.42)';
  g.fillRect(0, 0, W, TS); g.fillRect(0, H - TS, W, TS);
  g.fillRect(0, 0, TS, H); g.fillRect(W - TS, 0, TS, H);
  const sh = g.createLinearGradient(0, TS, 0, TS + 14);
  sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.fillRect(0, TS, W, 14);

  // 오방색 단청 띠 — 깊어질수록 흐려지고 어긋난다
  const a = Math.max(.12, .55 - depth * .09);
  g.save();
  g.globalAlpha = a;
  drawSaekdong(g, 0, TS - 5, W, 3, false, 1, depth);          // 윗벽 밑단
  drawSaekdong(g, 0, H - TS + 2, W, 3, false, 1, depth + 2);  // 아랫벽 윗단
  g.globalAlpha = 1;
  g.restore();

  // 단청 원문양은 좌우 벽에만 (위쪽 HUD 를 가리지 않도록)
  [TS * .5, W - TS * .5].forEach((x, s) => {
    for (let i = 1; i < 4; i++) {
      drawDancheong(g, x, TS + ((H - TS * 2) / 4) * i, 7, depth * .2, a * .9);
    }
  });
}
