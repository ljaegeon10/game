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
  g.globalAlpha *= alpha;          // 바깥 투명도를 덮어쓰지 않고 곱합니다
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
  g.globalAlpha *= alpha;          // 바깥 투명도를 덮어쓰지 않고 곱합니다
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

/* ═══════════ 식물 ═════════════════════════════════════════
   지상·지하 모두 어둡게 깔고, 그 위에 식물을 얹어 습하고
   버려진 느낌을 만듭니다.
   ═════════════════════════════════════════════════════════ */

/* 고사리 — 부채꼴로 퍼지는 잎 */
function drawFern(g, x, y, s, col = '#2c4630', dark = '#1b2d1e') {
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.34;
    const len = s * (1 - Math.abs(i - 3) * .12);
    g.strokeStyle = i % 2 ? col : dark;
    g.lineWidth = Math.max(1, s * .07);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(Math.cos(a) * len * .5, Math.sin(a) * len * .75,
                       Math.cos(a) * len, Math.sin(a) * len * .9);
    g.stroke();
    // 잎맥
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const px = Math.cos(a) * len * t, py = Math.sin(a) * len * t * .9;
      g.lineWidth = Math.max(1, s * .04);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(a + 1.2) * s * .14, py + Math.sin(a + 1.2) * s * .14);
      g.stroke();
    }
  }
  g.restore();
}

/* 풀 다발 */
function drawGrassTuft(g, x, y, s, col = '#33482c', t = 0) {
  g.save();
  g.strokeStyle = col;
  g.lineWidth = Math.max(1, s * .1);
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * .32;
    const sway = Math.sin(t * .0013 + x + i) * s * .12;
    g.beginPath();
    g.moveTo(0 + x, y);
    g.quadraticCurveTo(x + Math.cos(a) * s * .4, y + Math.sin(a) * s * .6,
                       x + Math.cos(a) * s * .8 + sway, y + Math.sin(a) * s);
    g.stroke();
  }
  g.restore();
}

/* 덤불 */
function drawBush(g, x, y, s, col = '#22351f', hi = '#2e4529') {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.ellipse(x, y + s * .2, s * .8, s * .25, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = col;
  [[-.45, 0, .55], [.45, .05, .5], [0, -.2, .68]].forEach(([dx, dy, r]) => {
    g.beginPath(); g.ellipse(x + dx * s, y + dy * s, s * r, s * r * .78, 0, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = hi;
  g.beginPath(); g.ellipse(x - s * .12, y - s * .3, s * .34, s * .24, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

/* 늘어진 덩굴 / 뿌리 — 천장(윗벽)에서 내려옵니다 */
function drawVine(g, x, y, len, s, t, col = '#2a3a26') {
  g.save();
  g.strokeStyle = col;
  g.lineWidth = Math.max(1, s * .5);
  g.lineCap = 'round';
  const sway = Math.sin(t * .0009 + x * .3) * 3;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + sway, y + len * .55, x + sway * 1.6, y + len);
  g.stroke();
  // 잎
  g.fillStyle = col;
  for (let i = 1; i <= 3; i++) {
    const p = i / 3.6;
    const lx = x + sway * p * 1.4, ly = y + len * p;
    const d = i % 2 ? 1 : -1;
    g.beginPath();
    g.ellipse(lx + d * s * 1.3, ly, s * 1.5, s * .75, d * .5, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/* 이끼 얼룩 */
function drawMoss(g, x, y, r, R) {
  // 이끼 — 픽셀 한 알씩 번져 자란 덩어리 (가장자리가 성기고 군데군데 비어 있음)
  const tones = ['rgba(30,48,32,.62)', 'rgba(40,62,40,.55)', 'rgba(52,78,48,.5)'];
  const cx = Math.round(x), cy = Math.round(y), rr = Math.max(3, Math.round(r * .8));
  for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++) {
    const d = Math.hypot(xx, yy * 1.4) / rr;
    if (d > .55 + R() * .5 || R() < .18 + d * .35) continue;
    g.fillStyle = tones[d < .4 && R() > .5 ? 2 : d < .75 ? 1 : 0];
    g.fillRect(cx + xx, cy + yy, 1, 1);
  }
}

/* 빛나는 작은 버섯 무리 — 어두운 곳의 유일한 광원 */
function drawGlowShrooms(g, x, y, s, t, hue = '#6fd9c8') {
  g.save();
  const pulse = .55 + Math.sin(t * .0022 + x) * .25;
  g.globalAlpha = pulse * .5;
  const gr = g.createRadialGradient(x, y, 1, x, y, s * 3.2);
  gr.addColorStop(0, hue); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, s * 3.2, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  [[0, 0, 1], [-s * 1.1, s * .35, .72], [s * 1.05, s * .5, .6]].forEach(([dx, dy, k]) => {
    g.fillStyle = '#3c4a52';
    g.fillRect(x + dx - s * .12 * k, y + dy - s * .5 * k, s * .24 * k, s * .55 * k);
    g.fillStyle = hue;
    g.beginPath();
    g.ellipse(x + dx, y + dy - s * .5 * k, s * .5 * k, s * .34 * k, 0, Math.PI, 0);
    g.fill();
  });
  g.restore();
}

/* ═══════════ 지상 : 어두운 숲 ═════════════════════════════ */
function bakeForest(W, H, TS) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const R = rng(20450501);

  // 해가 진 뒤의 어두운 잔디
  g.fillStyle = '#1c2a1b'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) {
    const x = R() * W, y = R() * H, v = R();
    g.fillStyle = v > .78 ? '#26361f' : v > .44 ? '#182417' : '#213022';
    g.fillRect(x | 0, y | 0, 2, 2);
  }
  // 나무 사이로 새어드는 마지막 빛
  const lg = g.createRadialGradient(W * .30, H * .26, 10, W * .30, H * .26, 210);
  lg.addColorStop(0, 'rgba(150,180,205,.10)'); lg.addColorStop(1, 'rgba(150,180,205,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);

  // 흙길 — 우물로 이어진다
  g.strokeStyle = '#3b3222'; g.lineWidth = 26; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-10, H * .68); g.quadraticCurveTo(W * .45, H * .78, W * .74, H * .52); g.stroke();
  g.strokeStyle = '#463c29'; g.lineWidth = 18;
  g.beginPath(); g.moveTo(-10, H * .68); g.quadraticCurveTo(W * .45, H * .78, W * .74, H * .52); g.stroke();
  for (let i = 0; i < 130; i++) {
    const t = R();
    const x = -10 + t * (W * .8) + (R() - .5) * 16;
    const y = H * .68 + Math.sin(t * 2.4) * 26 - t * t * 60 + (R() - .5) * 14;
    g.fillStyle = R() > .5 ? '#544733' : '#332b1e';
    g.fillRect(x | 0, y | 0, 2, 2);
  }

  // 이끼
  for (let i = 0; i < 22; i++)
    drawMoss(g, R() * W, R() * H, 10 + R() * 16, R, 'rgba(38,58,36,.5)');

  // 오방색 들꽃 — 어두워진 만큼 채도를 낮춰 은은하게
  for (let i = 0; i < 70; i++) {
    const x = R() * W, y = 20 + R() * (H - 40);
    g.fillStyle = OBANG_LIST[(R() * 5) | 0];
    g.globalAlpha = .38;
    g.fillRect(x | 0, y | 0, 2, 2);
    g.fillRect((x | 0) + 2, (y | 0) + 1, 1, 1);
    g.globalAlpha = 1;
  }

  // 바닥 식물 — 고사리와 풀 다발
  for (let i = 0; i < 26; i++)
    drawFern(g, 14 + R() * (W - 28), 30 + R() * (H - 50), 9 + R() * 9);

  return c;
}

/* 숲의 나무 배치 — [x, y, s]. 게임 로직(js/game.js)이 이 좌표를 그대로
   가져다 몸통 위치에 충돌 판정을 걸어 실제로 지나갈 수 없게 막습니다. */
const FOREST_TREES = [[48, 70, 46], [144, 46, 38], [300, 40, 42], [516, 62, 44],
                       [36, 202, 48], [132, 296, 44], [360, 304, 46], [546, 243, 42],
                       [228, 121, 34], [480, 162, 36], [400, 286, 40], [244, 250, 36]];

/* 숲의 나무·장승·솟대·덤불 (매 프레임) */
function renderForestProps(g, t) {
  FOREST_TREES.forEach(([x, y, s]) => drawTree(g, x, y, s, t));

  [[84, 117, 13], [252, 198, 12], [427, 97, 11], [343, 265, 13], [178, 77, 10]]
    .forEach(([x, y, s]) => drawBush(g, x, y, s));
  [[96, 172], [268, 132], [330, 250], [180, 300], [420, 122]]
    .forEach(([x, y]) => drawGrassTuft(g, x, y, 12, '#2b3f25', t));

  drawJangseung(g, 158, 258, 26);
  drawJangseung(g, 196, 262, 24);
  drawSotdae(g, 92, 148, 20, t);

  // 우물 근처의 빛나는 버섯 — 유일한 밝은 지점
  drawGlowShrooms(g, 318, 196, 6, t);
  drawGlowShrooms(g, 146, 214, 5, t, '#8fd0e8');
}

/* 어둠 오버레이 — 주인공 주변만 밝게 남깁니다 */
function drawNightOverlay(g, W, H, px, py, strength, radius) {
  g.save();
  const gr = g.createRadialGradient(px, py, radius * .22, px, py, radius);
  gr.addColorStop(0, `rgba(4,5,10,0)`);
  gr.addColorStop(.55, `rgba(4,5,10,${strength * .45})`);
  gr.addColorStop(1, `rgba(4,5,10,${strength})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // 화면 가장자리를 한 번 더
  const vg = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .68);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${strength * .8})`);
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  g.restore();
}

/* 나무 한 그루 */
function drawTree(g, x, y, s, t) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.ellipse(x, y + s * .12, s * .55, s * .18, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2e2416'; g.fillRect(x - s * .09, y - s * .34, s * .18, s * .42);
  const sway = Math.sin(t * .0011 + x) * s * .03;
  g.fillStyle = '#16281a';
  g.beginPath(); g.ellipse(x + sway, y - s * .62, s * .52, s * .40, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1d3522';
  g.beginPath(); g.ellipse(x - s * .14 + sway, y - s * .72, s * .34, s * .27, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#264229';
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
  const decay = Math.max(0.10, 0.32 - depth * 0.045);

  g.fillStyle = '#1b1a27'; g.fillRect(0, 0, W, H);

  // 돌 타일
  for (let y = TS; y < H - TS; y += TS) {
    for (let x = TS; x < W - TS; x += TS) {
      const v = R();
      g.fillStyle = v > .78 ? '#252334' : v > .45 ? '#201e2c' : '#1a1925';
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

  // 오방색 단청 바닥 장식 — 방 중앙 + 네 모서리. 가운데 것은 바닥에 박힌 오래된
  // 상감처럼 옅게, 둘레에 팔각 돌 테두리 (진한 원으로 두면 상자를 감싼 막처럼 보였습니다)
  g.save();
  g.strokeStyle = 'rgba(8,8,14,.6)'; g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; g.lineTo(W / 2 + Math.cos(a) * 31, H / 2 + Math.sin(a) * 31); }
  g.stroke();
  g.restore();
  drawDancheong(g, W / 2, H / 2, 26, warp, decay * .5);
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
  for (let i = 0; i < 7; i++) {
    g.fillStyle = OBANG_LIST[(R() * 5) | 0];
    g.globalAlpha = decay * (.12 + R() * .16);
    const x = TS + R() * (W - TS * 2), y = TS + R() * (H - TS * 2);
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    g.fillRect(-2, -2, 4, 4); g.restore();
  }
  g.globalAlpha = 1;

  // 뼈 — 현실에서는 인체 골격 모형. 방 한가운데 고르게 뿌리지 않고,
  // 벽가 한두 군데에 무더기로 쌓여 있습니다 (휩쓸려 밀려난 것처럼)
  const edgeSpot = () => {
    const side = (R() * 4) | 0, t = .12 + R() * .76;
    return side === 0 ? [TS + t * (W - TS * 2), TS + 8 + R() * 10]
         : side === 1 ? [TS + t * (W - TS * 2), H - TS - 8 - R() * 10]
         : side === 2 ? [TS + 8 + R() * 10, TS + t * (H - TS * 2)]
         :              [W - TS - 8 - R() * 10, TS + t * (H - TS * 2)];
  };
  const piles = 1 + (depth > 2 ? 1 : 0);
  for (let p = 0; p < piles; p++) {
    const [px, py] = edgeSpot();
    const n = 2 + ((R() * (2 + depth)) | 0);
    for (let i = 0; i < n; i++)
      drawBone(g, px + (R() - .5) * 26, py + (R() - .5) * 12, R() * Math.PI, .5 + R() * .3);
    if (depth > 0 && R() > .35) drawSkull(g, px + (R() - .5) * 14, py + (R() - .5) * 6, .75 + R() * .3);
  }
  if (depth > 1) { const [bx, by] = edgeSpot(); drawBone(g, bx, by, R() * Math.PI, .55); }

  // 핏자국 — 현실에서는 링거의 붉은 배양액. 매끈한 타원 대신 픽셀로 번진
  // 웅덩이 하나 + 한 방향으로 튄 방울, 끌린 자국
  for (let i = 0; i < 2 + depth * 2; i++) {
    const x = TS + 10 + R() * (W - TS * 2 - 20), y = TS + 10 + R() * (H - TS * 2 - 20);
    const r = 3 + R() * 6, a = .3 + R() * .25, dir = R() * Math.PI * 2;
    for (let yy = -r; yy <= r; yy++) for (let xx = -r * 1.6; xx <= r * 1.6; xx++) {
      const d = (xx / 1.6) ** 2 + yy * yy, edge = r * r * (.7 + R() * .5);
      if (d > edge) continue;
      g.fillStyle = d < r * r * .3 ? `rgba(84,12,12,${a + .12})` : `rgba(112,20,18,${a})`;
      g.fillRect((x + xx) | 0, (y + yy) | 0, 1, 1);
    }
    for (let k = 0; k < 6; k++) {                  // 한쪽으로 튄 방울
      const d = r + 3 + R() * 14, s = R() > .7 ? 2 : 1;
      g.fillStyle = `rgba(112,20,18,${a * (.6 + R() * .4)})`;
      g.fillRect((x + Math.cos(dir + (R() - .5) * .7) * d * 1.4) | 0, (y + Math.sin(dir + (R() - .5) * .7) * d) | 0, s, s);
    }
    if (R() > .55) {                               // 끌린 자국
      g.fillStyle = `rgba(90,16,15,${a * .55})`;
      const len = 14 + R() * 26;
      for (let t = 0; t < len; t += 1) g.fillRect((x + Math.cos(dir + Math.PI) * (r + t)) | 0, (y + Math.sin(dir + Math.PI) * (r + t) * .7 + Math.sin(t * .4)) | 0, 2, 1);
    }
  }

  // 이끼 — 습하고 버려진 느낌
  for (let i = 0; i < 8 + depth * 3; i++)
    drawMoss(g, TS + R() * (W - TS * 2), TS + R() * (H - TS * 2),
             8 + R() * 16, R, 'rgba(38,60,40,.42)');

  // 어둠 (가장자리로 갈수록)
  const vg = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * .62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${.34 + depth * .05})`);
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

/* ── 던전 식물 배치 (방마다 고정) ───────────────────────── */
function bakePlants(seed, depth) {
  const R = rng(seed);
  const W = 576, H = 324, TS = 32;
  const p = { vines: [], ferns: [], glow: [], grass: [] };

  // 윗벽에서 내려오는 덩굴·뿌리
  const nv = 5 + depth;
  for (let i = 0; i < nv; i++) {
    const x = TS + 8 + R() * (W - TS * 2 - 16);
    if (Math.abs(x - W / 2) < 32) continue;              // 문 앞은 비워둡니다
    p.vines.push({ x, len: 12 + R() * 30, s: 1.4 + R() * 1.4 });
  }
  // 벽 밑동의 고사리
  for (let i = 0; i < 8 + depth * 2; i++) {
    const edge = (R() * 4) | 0;
    let x, y;
    if (edge === 0)      { x = TS + 6 + R() * (W - TS * 2 - 12); y = TS + 8 + R() * 10; }
    else if (edge === 1) { x = TS + 6 + R() * (W - TS * 2 - 12); y = H - TS - 6 - R() * 10; }
    else if (edge === 2) { x = TS + 6 + R() * 14; y = TS + 10 + R() * (H - TS * 2 - 20); }
    else                 { x = W - TS - 6 - R() * 14; y = TS + 10 + R() * (H - TS * 2 - 20); }
    if (Math.abs(x - W / 2) < 30 && (edge === 0 || edge === 1)) continue;
    if (Math.abs(y - H / 2) < 30 && (edge === 2 || edge === 3)) continue;
    p.ferns.push({ x, y, s: 7 + R() * 7 });
  }
  // 빛나는 버섯 무리 — 어두운 방의 광원
  for (let i = 0; i < 2 + (depth > 2 ? 2 : 1); i++) {
    p.glow.push({
      x: TS + 20 + R() * (W - TS * 2 - 40),
      y: TS + 20 + R() * (H - TS * 2 - 40),
      s: 4 + R() * 3,
      c: R() > .45 ? '#6fd9c8' : '#9a86e0'
    });
  }
  for (let i = 0; i < 10; i++)
    p.grass.push({ x: TS + 10 + R() * (W - TS * 2 - 20),
                   y: TS + 14 + R() * (H - TS * 2 - 28), s: 7 + R() * 5 });
  return p;
}

/* 바닥 식물 (플레이어 아래) */
function drawFloorPlants(g, p, t) {
  if (!p) return;
  p.grass.forEach(q => drawGrassTuft(g, q.x, q.y, q.s, '#28382a', t));
  p.ferns.forEach(q => drawFern(g, q.x, q.y, q.s, '#27392a', '#18261a'));
  p.glow.forEach(q => drawGlowShrooms(g, q.x, q.y, q.s, t, q.c));
}

/* 벽에 붙은 식물 (벽 위에 겹쳐 그립니다) */
function drawWallPlants(g, W, H, TS, p, t) {
  if (!p) return;
  p.vines.forEach(v => drawVine(g, v.x, TS - 2, v.len, v.s, t, '#22321f'));
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
  const a = Math.max(.08, .30 - depth * .04);
  g.save();
  g.globalAlpha = a;
  drawSaekdong(g, 0, TS - 4, W, 2, false, 1, depth);          // 윗벽 밑단
  drawSaekdong(g, 0, H - TS + 2, W, 2, false, 1, depth + 2);  // 아랫벽 윗단
  g.globalAlpha = 1;
  g.restore();

  // (좌우 벽의 작은 단청 원문양은 뺐습니다 — 흐릿한 동그라미가 떠 있는 것처럼 보였습니다)
}
