'use strict';
/* ═══════════════════════════════════════════════════════════════
   roomdeco.js — 방마다 다른 얼굴 (맵 디자인)

   지하는 피험자 07 이 누워 있는 실험실이 꿈에 비친 곳입니다. 그래서 방
   하나하나가 실험실의 어느 한 곳이 꿈속에서 일그러진 모습입니다.

     우물 아래  well    둥근 우물 바닥 · 고인 물 · 무너진 사다리 · 위에서 새는 빛
     갈림길    fork    갈라진 돌 틈으로 실험실의 흰 바닥 타일이 비침 · 기둥 넷
     북쪽 방   ward    병동 — 돌로 굳은 침대 넷, 시트 · 링거대 그림자
     남쪽 방   tank    수조실 — 물이 고인 바닥 · 배수구 · 수조 둘
     중앙     observe  관측실 — 바닥 유리창 아래 커다란 눈이 올려다봄 · 감시 책상 둘
     북동 통로  roots   뿌리 통로 — 천장에서 내려와 바닥을 기는 뿌리 덩어리
     남동 통로  archive 기록 보관실 — 서류장 · 쓰러진 서류장 · 날짜 적힌 종이
     관문     gate    의식처럼 대칭인 돌기둥 넷 · 문에서 문으로 이어진 단청 길
     심층     arena   둥근 의식 바닥 · 가운데로 모이는 케이블 · 실험실 격자
     탈출구    exit    실험실 바닥이 거의 드러남 · 위로 뻗은 배관

   장애물(props)은 실제로 막아섭니다 — 바닥에 닿는 발자리(footprint)로
   주인공 · 적을 밀어내고, 총알은 부딪혀 사라집니다. 문 앞길과 적 · 상자 ·
   열쇠 자리는 비워 두었습니다 (scratchpad 의 길 찾기 검사로 확인).
   ═══════════════════════════════════════════════════════════════ */

/* ── 방마다 테마 · 장애물 ─────────────────────────────────────
   장애물 : { k, x, y } — x, y 는 발자리 가운데. 종류마다 크기는 PROP_SIZE */
const ROOM_DECO = {
  start:   { theme: 'well',    props: [{ k: 'ladder', x: 168, y: 104 }, { k: 'rock', x: 430, y: 236 }] },
  fork:    { theme: 'fork',    props: [{ k: 'pillar', x: 186, y: 112 }, { k: 'pillar', x: 390, y: 112 },
                                       { k: 'pillar', x: 186, y: 218 }, { k: 'pillar', x: 390, y: 218 }] },
  north:   { theme: 'ward',    props: [{ k: 'bed', x: 204, y: 124 }, { k: 'bed', x: 372, y: 124 },
                                       { k: 'bed', x: 204, y: 222 }, { k: 'bed', x: 372, y: 222 }] },
  south:   { theme: 'tank',    props: [{ k: 'tank', x: 130, y: 236 }, { k: 'tankS', x: 452, y: 262 }] },
  mid:     { theme: 'observe', props: [{ k: 'console', x: 176, y: 244 }, { k: 'console', x: 404, y: 96 }] },
  ne:      { theme: 'roots',   props: [{ k: 'roots', x: 216, y: 168 }, { k: 'roots', x: 380, y: 170 }] },
  se:      { theme: 'archive', props: [{ k: 'shelf', x: 214, y: 178 }, { k: 'shelf', x: 374, y: 178 },
                                       { k: 'fallen', x: 498, y: 168 }] },
  gate:    { theme: 'gate',    props: [{ k: 'pillar', x: 214, y: 94 }, { k: 'pillar', x: 362, y: 94 },
                                       { k: 'pillar', x: 214, y: 232 }, { k: 'pillar', x: 362, y: 232 }] },
  boss:    { theme: 'arena',   props: [] },
  exit:    { theme: 'exit',    props: [] }
};
/* 발자리 [가로, 세로] 와 위로 솟은 높이 (가림 · 총알 판정에 씀) */
const PROP_SIZE = {
  ladder:  { w: 52, h: 14, tall: 6 },
  rock:    { w: 34, h: 18, tall: 10 },
  pillar:  { w: 22, h: 12, tall: 34 },
  bed:     { w: 30, h: 52, tall: 8 },
  tank:    { w: 86, h: 46, tall: 8 },
  tankS:   { w: 72, h: 34, tall: 8 },
  console: { w: 44, h: 18, tall: 18 },
  roots:   { w: 42, h: 24, tall: 16 },
  shelf:   { w: 20, h: 56, tall: 26 },
  fallen:  { w: 64, h: 16, tall: 7 }
};

function buildRoomProps(id) {
  const d = ROOM_DECO[id];
  if (!d) return [];
  return d.props.map(p => {
    const S = PROP_SIZE[p.k];
    return { ...p, ...S, x0: p.x - S.w / 2, x1: p.x + S.w / 2, y0: p.y - S.h / 2, y1: p.y + S.h / 2 };
  });
}
const roomTheme = id => (ROOM_DECO[id] || {}).theme || 'plain';

/* ── 충돌 ──────────────────────────────────────────────────── */
/* 둥근 몸(o.x, o.y, 반지름 r)을 장애물 발자리 밖으로 밀어냅니다. 밀렸으면 true */
function pushOutOfProps(props, o, r) {
  let hit = false;
  for (const p of props) {
    const cx = Math.max(p.x0, Math.min(p.x1, o.x)), cy = Math.max(p.y0, Math.min(p.y1, o.y));
    let dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d >= r) continue;
    hit = true;
    if (d < .001) {                              // 가운데가 안에 들어왔으면 가장 얕은 쪽으로
      const l = o.x - p.x0, rr = p.x1 - o.x, t = o.y - p.y0, b = p.y1 - o.y, m = Math.min(l, rr, t, b);
      if (m === l) o.x = p.x0 - r; else if (m === rr) o.x = p.x1 + r; else if (m === t) o.y = p.y0 - r; else o.y = p.y1 + r;
    } else { o.x = cx + dx / d * r; o.y = cy + dy / d * r; }
  }
  return hit;
}
/* 총알 — 발자리에 위로 솟은 높이(최대 12)만큼 더한 칸에 들어가면 막힘 */
function propBlocksShot(props, x, y) {
  for (const p of props) if (x > p.x0 && x < p.x1 && y > p.y0 - Math.min(12, p.tall) && y < p.y1) return true;
  return false;
}

/* ═════════════ 바닥 (굽기) ═════════════════════════════════════ */
/* 테마마다 돌 타일 색 — 실험실의 어느 곳이 비쳤는지에 따라 */
const THEME_TILES = {
  well:    ['#1a1922', '#1e1d27', '#22212c'],
  fork:    ['#1b1a27', '#201e2c', '#252334'],
  ward:    ['#1d1d27', '#22222d', '#272733'],
  tank:    ['#161b24', '#19202a', '#1d2530'],
  observe: ['#191b26', '#1d202c', '#222534'],
  roots:   ['#1c1a20', '#211e24', '#26222a'],
  archive: ['#1e1b20', '#232026', '#28242b'],
  gate:    ['#1b1a27', '#201e2c', '#252334'],
  arena:   ['#1c1720', '#211b25', '#271f2b'],
  exit:    ['#1d2027', '#23262e', '#2a2e37']
};

/* 실험실 바닥 타일 조각 — 꿈의 바닥이 갈라진 틈으로 비치는 현실.
   돌이 깨져 나간 구멍 아래로 한 단 낮게 흰 타일이 보입니다 — 들쭉날쭉한 깨진 가장자리(짙은 테 · 깨진 면의 밝은 돌),
   위쪽 가장자리엔 돌이 드리운 그늘, 타일은 줄눈 · 얼룩 · 금. 전부 1픽셀 단위 (벡터 선 없이) */
function labPatch(g, R, cx, cy, rw, rh, a = .55) {
  const N = 28, jit = Array.from({ length: N }, () => .78 + R() * .34);       // 둘레를 따라 깨진 정도
  const thr = (x, y) => { let an = Math.atan2(y / rh, x / rw) / (Math.PI * 2) * N; if (an < 0) an += N;
    const i = an | 0, f = an - i; return jit[i % N] * (1 - f) + jit[(i + 1) % N] * f; };
  const inside = (x, y) => { const nx = x / rw, ny = y / rh; return Math.sqrt(nx * nx + ny * ny) < thr(x, y); };
  const T = 8, op = Math.min(1, .45 + a);                                     // 타일 크기 · 얼마나 또렷이 비치나
  const tileV = {};
  for (let y = -rh - 3; y <= rh + 3; y++) for (let x = -rw - 3; x <= rw + 3; x++) {
    const px = (cx + x) | 0, py = (cy + y) | 0;
    if (inside(x, y)) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T), key = tx + ',' + ty;
      if (tileV[key] == null) tileV[key] = R() < .12 ? -26 : R() < .25 ? 10 : (R() - .5) * 10;   // 얼룩진 타일 · 밝은 타일
      const grout = (px % T === T - 1) || (py % T === T - 1);
      let v = grout ? 78 : 148 + tileV[key];
      if (!grout && (px % T === 0 || py % T === 0)) v += 12;                  // 타일 위 · 왼 모서리 — 빛
      const shade = !inside(x, y - 1) ? .45 : !inside(x, y - 2) ? .62 : !inside(x, y - 3) ? .8 : 1;   // 돌이 드리운 그늘
      v *= shade;
      g.globalAlpha = op;
      g.fillStyle = `rgb(${v * .9 | 0},${v * .96 | 0},${v | 0})`;            // 차가운 흰빛
      g.fillRect(px, py, 1, 1);
    } else {
      const n1 = inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1);
      const n2 = !n1 && (inside(x + 2, y) || inside(x - 2, y) || inside(x, y + 2) || inside(x, y - 2));
      if (n1) { g.globalAlpha = 1; g.fillStyle = '#08070b'; g.fillRect(px, py, 1, 1); }                     // 깨진 가장자리 — 짙은 테
      else if (n2 && inside(x, y + 2)) { g.globalAlpha = .85; g.fillStyle = '#5a5566'; g.fillRect(px, py, 1, 1); }   // 위쪽 깨진 면 — 빛 받은 돌
      else if (n2) { g.globalAlpha = .5; g.fillStyle = '#16141c'; g.fillRect(px, py, 1, 1); }
    }
  }
  // 금 — 타일 위로 가는 한 줄
  if (R() < .7) {
    let x = cx - rw * .4, y = cy - rh * .2;
    g.globalAlpha = op * .8; g.fillStyle = '#4a5260';
    for (let i = 0; i < rw; i++) { x += 1; y += R() < .35 ? (R() < .5 ? -1 : 1) : 0; if (inside(x - cx, y - cy)) g.fillRect(x | 0, y | 0, 1, 1); }
  }
  g.globalAlpha = 1;
}
/* 픽셀 웅덩이 (물) */
function puddle(g, R, cx, cy, rw, rh, deep = false) {
  for (let y = -rh; y <= rh; y++) for (let x = -rw; x <= rw; x++) {
    const d = (x / rw) ** 2 + (y / rh) ** 2;
    if (d > .8 + R() * .25) continue;
    g.fillStyle = d < .35 && deep ? '#0b1420' : d < .6 ? '#122030' : '#18283a';
    g.fillRect((cx + x) | 0, (cy + y) | 0, 1, 1);
  }
  g.fillStyle = 'rgba(150,180,210,.25)';                 // 물가 반사
  for (let i = 0; i < rw; i += 3) g.fillRect((cx - rw * .5 + i) | 0, (cy - rh * .55) | 0, 2, 1);
}
/* 쇠창살 배수구 */
function drain(g, x, y) {
  g.fillStyle = '#0a0c10'; g.fillRect(x - 9, y - 6, 18, 12);
  g.fillStyle = '#3a4250';
  for (let i = 0; i < 5; i++) g.fillRect(x - 8 + i * 4, y - 5, 1, 10);
  g.fillRect(x - 9, y - 6, 18, 1); g.fillRect(x - 9, y + 5, 18, 1);
}
/* 흩어진 종이 — 날짜가 적힌 */
function paper(g, R, x, y) {
  g.save(); g.translate(x, y); g.rotate((R() - .5) * 1.2);
  g.fillStyle = '#b9b2a2'; g.fillRect(-5, -4, 10, 8);
  g.fillStyle = '#d7d0bf'; g.fillRect(-5, -4, 10, 1);
  g.fillStyle = 'rgba(40,36,48,.7)';
  for (let i = 0; i < 3; i++) g.fillRect(-4, -2 + i * 2, 4 + ((R() * 4) | 0), 1);
  if (R() > .6) { g.fillStyle = 'rgba(150,30,28,.8)'; g.fillRect(1, -2, 3, 1); }   // 붉은 날짜
  g.restore();
}
/* 굵은 뿌리 한 가닥 — 벽에서 바닥으로 기어 나옴 */
function rootLine(g, R, x0, y0, x1, y1, w) {
  const n = 18, mx = (x0 + x1) / 2 + (R() - .5) * 60, my = (y0 + y1) / 2 + (R() - .5) * 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const r = Math.max(1, w * (1 - t * .8));
    g.fillStyle = '#21160f'; g.fillRect((x - r) | 0, (y - r * .6) | 0, (r * 2) | 0, Math.max(1, (r * 1.2) | 0));
    g.fillStyle = '#3a2a1c'; g.fillRect((x - r * .6) | 0, (y - r * .6) | 0, Math.max(1, (r * .9) | 0), 1);
  }
}
/* 케이블 — 의식 바닥 가운데로 모임 */
function cable(g, x0, y0, x1, y1, sag, col = '#11131a') {
  g.strokeStyle = col; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1); g.stroke();
  g.strokeStyle = 'rgba(120,130,150,.18)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x0, y0 - 1); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag - 1, x1, y1 - 1); g.stroke();
}

/* 바닥 굽기 때 테마 장식을 얹습니다 (bakeDungeonFloor 가 어둠을 씌우기 전에 부름) */
function decorateFloor(g, theme, R, depth, W, H, TS) {
  const cx = W / 2, cy = H / 2;
  g.save();
  switch (theme) {
    case 'well': {
      // 떨어진 자리 — 얕은 웅덩이. 가장자리는 진흙과 젖은 돌, 물은 거의 검고
      // 위쪽 우물 입구가 물에 비칩니다 (비친 상은 매 프레임 일렁이게 따로 그림)
      const [wx, wy] = WELL_C;
      for (let y = -36; y <= 36; y++) for (let x = -76; x <= 76; x++) {
        const a = Math.atan2(y, x), jag = 1 + Math.sin(a * 5 + 1.3) * .06 + Math.sin(a * 11) * .04;
        const d = Math.hypot(x / 70, y / 32) / jag;
        if (d > 1.06) continue;
        g.fillStyle = d > .97 ? 'rgba(20,24,30,.9)' : d > .9 ? '#0f1822' : d > .6 ? '#0b121b' : '#080d14';
        g.fillRect(wx + x, wy + y, 1, 1);
      }
      g.fillStyle = 'rgba(150,180,210,.22)';                 // 물가의 젖은 반짝임
      for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; if (R() < .55) g.fillRect((wx + Math.cos(a) * 71) | 0, (wy + Math.sin(a) * 33) | 0, 2, 1); }
      // 위에서 새는 찬 빛 — 웅덩이를 중심으로
      const lg = g.createRadialGradient(wx, wy, 8, wx, wy, 150);
      lg.addColorStop(0, 'rgba(150,170,210,.14)'); lg.addColorStop(.5, 'rgba(120,140,180,.05)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      // 엎어진 녹슨 양동이
      g.save(); g.translate(312, 244); g.rotate(-.35);
      g.fillStyle = '#3a2a20'; g.fillRect(-9, -6, 16, 12);
      g.fillStyle = '#5a3f2c'; g.fillRect(-9, -6, 16, 2); g.fillRect(-9, 3, 16, 1);
      g.fillStyle = '#120e0c'; g.beginPath(); g.ellipse(8, 0, 3, 7, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6a6470'; g.lineWidth = 1; g.beginPath(); g.arc(-1, -6, 7, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.restore();
      g.fillStyle = 'rgba(90,40,28,.35)'; g.fillRect(320, 248, 7, 2);   // 녹물
      // 감긴 밧줄 — 사다리에서 끊어진
      g.strokeStyle = '#4a3a28'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(214, 132, 10 - i * 3, 5 - i * 1.5, 0, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = '#5c4a34'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(224, 132); g.quadraticCurveTo(250, 150, 262, 146); g.stroke();
      // 돌 틈 이끼
      for (let i = 0; i < 6; i++) {
        const a = R() * Math.PI * 2, rr = 100 + R() * 90;
        g.fillStyle = 'rgba(40,62,40,.55)';
        for (let k = 0; k < 10; k++) g.fillRect((wx + Math.cos(a) * rr + (R() - .5) * 8) | 0, (wy + Math.sin(a) * rr * WELL_K + (R() - .5) * 4) | 0, 1, 1);
      }
      break;
    }
    case 'fork':
      labPatch(g, R, 124, 238, 34, 20, .5);
      labPatch(g, R, 460, 86, 30, 18, .45);
      labPatch(g, R, cx + 6, cy + 4, 24, 14, .35);
      break;
    case 'ward': {
      // 병동 — 가운데 통로 깔개, 침대 자리 아래 바랜 바닥, 바닥의 링거대 그림자
      g.fillStyle = 'rgba(160,170,185,.06)'; g.fillRect(cx - 26, TS, 52, H - TS * 2);
      g.fillStyle = 'rgba(0,0,0,.25)';
      for (let y = TS + 6; y < H - TS; y += 12) g.fillRect(cx - 26, y, 52, 1);
      labPatch(g, R, 460, 250, 26, 14, .35);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
      [[248, 96], [416, 96], [248, 196], [416, 196]].forEach(([x, y]) => {   // 링거대 그림자
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y + 22); g.stroke();
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 12, y + 20, 6, 2);
      });
      break;
    }
    case 'tank':
      // 수조실 — 바닥에 고인 물, 배수구
      puddle(g, R, 250, 96, 40, 12, true); puddle(g, R, 330, 230, 52, 16, true);
      puddle(g, R, 470, 150, 22, 9);
      drain(g, cx, cy + 56); drain(g, 96, 96);
      g.fillStyle = 'rgba(80,120,160,.05)'; g.fillRect(TS, TS, W - TS * 2, H - TS * 2);
      break;
    case 'observe': {
      // 관측실 — 바닥 유리창 (눈은 매 프레임 그립니다), 모니터 선
      const gx = cx - 74, gy = cy - 40;
      g.fillStyle = '#05070b'; g.fillRect(gx, gy, 148, 84);
      g.fillStyle = '#3a4250'; g.fillRect(gx - 4, gy - 4, 156, 4); g.fillRect(gx - 4, gy + 84, 156, 4);
      g.fillRect(gx - 4, gy, 4, 84); g.fillRect(gx + 148, gy, 4, 84);
      g.fillStyle = '#596474'; g.fillRect(gx - 4, gy - 4, 156, 1);
      g.fillStyle = '#2a313c'; g.fillRect(gx + 73, gy, 2, 84); g.fillRect(gx, gy + 41, 148, 2);   // 창살
      [[gx - 4, gy - 4], [gx + 148, gy - 4], [gx - 4, gy + 84], [gx + 148, gy + 84]].forEach(([x, y]) => { g.fillStyle = '#7b8696'; g.fillRect(x + 1, y + 1, 2, 2); });
      cable(g, 176, 236, gx + 10, gy + 84, 10); cable(g, 404, 104, gx + 138, gy - 4, -12);
      break;
    }
    case 'roots':
      rootLine(g, R, TS, 70, 210, 172, 5); rootLine(g, R, 230, TS, 220, 160, 4);
      rootLine(g, R, W - TS, 120, 384, 176, 5); rootLine(g, R, 420, H - TS, 384, 180, 3);
      rootLine(g, R, 140, H - TS, 218, 176, 3);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(40,30,22,.35)'; g.fillRect(TS + R() * (W - TS * 2), TS + R() * (H - TS * 2), 10 + R() * 14, 3 + R() * 3); }
      break;
    case 'archive':
      for (let i = 0; i < 26; i++) paper(g, R, TS + 14 + R() * (W - TS * 2 - 28), TS + 14 + R() * (H - TS * 2 - 28));
      g.fillStyle = 'rgba(10,8,14,.55)';                                   // 엎질러진 잉크
      g.beginPath(); g.ellipse(470, 196, 16, 6, .2, 0, Math.PI * 2); g.fill();
      break;
    case 'gate': {
      // 문에서 문으로 이어진 단청 길 (좌우 대칭)
      const yy = cy - 7;
      g.fillStyle = 'rgba(20,18,28,.8)'; g.fillRect(TS, yy - 2, W - TS * 2, 18);
      const ob = ['#2f6fb5', '#e9e3d5', '#c2352c', '#15141b', '#e3b23c'];
      for (let x = TS; x < W - TS; x += 10) { g.globalAlpha = .22; g.fillStyle = ob[((x - TS) / 10) % 5 | 0]; g.fillRect(x, yy, 9, 2); g.fillRect(x, yy + 12, 9, 2); }
      g.globalAlpha = 1;
      break;
    }
    case 'arena': {
      // 둥근 의식 바닥 — 가운데로 모이는 케이블, 틈으로 비치는 실험실 격자
      // 방이 넓으면(보스방) 원 · 케이블 자리도 그만큼 넓게
      const sx = W / 576, sy = H / 324, k = Math.min(sx, sy);
      g.strokeStyle = 'rgba(194,53,44,.16)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(cx, cy, 170 * k, 98 * k, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(cx, cy, 120 * k, 68 * k, 0, 0, Math.PI * 2); g.stroke();
      [[TS, 70 * sy], [W - TS, 70 * sy], [TS, 250 * sy], [W - TS, 250 * sy], [160 * sx, TS], [416 * sx, TS]].forEach(([x, y], i) => cable(g, x, y, cx + (i % 2 ? 14 : -14), cy, (i % 3 - 1) * 24));
      labPatch(g, R, 120 * sx, 230 * sy, 30, 18, .4); labPatch(g, R, 460 * sx, 100 * sy, 30, 18, .4);
      break;
    }
    case 'exit':
      [[150, 110, 34, 20], [250, 220, 40, 22], [380, 120, 30, 18], [440, 230, 36, 20], [300, 150, 26, 16]]
        .forEach(([x, y, w, h]) => labPatch(g, R, x, y, w, h, .38));
      for (let i = 0; i < 3; i++) { g.fillStyle = '#272d36'; g.fillRect(W - TS - 30 - i * 14, TS, 6, H - TS * 2); g.fillStyle = '#3c4552'; g.fillRect(W - TS - 30 - i * 14, TS, 1, H - TS * 2); }
      break;
  }
  g.restore();
}

/* ═════════════ 매 프레임 — 움직이는 바닥 · 장애물 ═══════════════ */
/* 바닥에 붙은 움직임 (플레이어 아래) — 물결, 유리창 아래의 눈 */
function drawThemeFloor(g, theme, t, px, py, W, H) {
  if (theme === 'observe') {
    const cx = W / 2, cy = H / 2 + 2;
    // 유리창 아래 — 커다란 눈이 주인공을 따라 굴립니다. 가끔 감깁니다.
    g.save();
    g.beginPath(); g.rect(cx - 74, cy - 42, 148, 84); g.clip();
    const blink = (t % 420) > 404 ? 1 - Math.abs((t % 420) - 412) / 8 : 0;
    const open = 1 - blink;
    g.fillStyle = '#12090b';
    g.beginPath(); g.ellipse(cx, cy, 66, 30 * open + .1, 0, 0, Math.PI * 2); g.fill();
    if (open > .15) {
      const lx = Math.max(-26, Math.min(26, (px - cx) * .12)), ly = Math.max(-8, Math.min(8, (py - cy) * .1));
      g.fillStyle = '#3d1416'; g.beginPath(); g.ellipse(cx, cy, 60, 26 * open, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0c3a34'; g.beginPath(); g.arc(cx + lx, cy + ly, 17 * open, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#16655a'; g.beginPath(); g.arc(cx + lx, cy + ly, 13 * open, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#020203'; g.beginPath(); g.arc(cx + lx, cy + ly, 6 * open, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(200,240,230,.5)'; g.fillRect((cx + lx - 7) | 0, (cy + ly - 8) | 0, 3, 2);
    }
    g.restore();
    // 유리 반사 — 사선 두 줄
    g.save(); g.globalAlpha = .1; g.fillStyle = '#cfe3ff';
    for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(cx - 60 + i * 30, cy - 42); g.lineTo(cx - 48 + i * 30, cy - 42); g.lineTo(cx - 92 + i * 30, cy + 42); g.lineTo(cx - 104 + i * 30, cy + 42); g.closePath(); g.fill(); }
    g.restore();
  } else if (theme === 'tank' || theme === 'well') {
    if (theme === 'well') {
      // 물에 비친 우물 입구 — 해 질 녘 하늘 한 조각이 물결 따라 일렁입니다
      const [wx, wy] = WELL_C, wob = Math.sin(t * .05) * 1.2, wob2 = Math.cos(t * .037) * .8;
      g.save();
      g.globalAlpha = .55;
      g.fillStyle = '#5b5f7a'; g.beginPath(); g.ellipse(wx + wob, wy - 2, 22 + wob2, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8d8fb0'; g.beginPath(); g.ellipse(wx + wob * 1.4, wy - 3, 15, 5.5 + wob2 * .4, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = .8; g.fillStyle = '#c9b8b8';
      for (let i = -12; i <= 12; i += 3) g.fillRect((wx + i + Math.sin(t * .08 + i) * 1.5) | 0, (wy - 3 + Math.sin(i) * 2) | 0, 2, 1);
      g.globalAlpha = .9; g.strokeStyle = '#1a1a24'; g.lineWidth = 2;                 // 우물 입구 테 그림자
      g.beginPath(); g.ellipse(wx + wob, wy - 2, 23 + wob2, 10, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    // 고인 물 위로 이따금 떨어지는 물방울 — 동심원 픽셀
    const drops = theme === 'tank' ? [[250, 96], [330, 230], [470, 150]] : [[WELL_C[0] + 14, WELL_C[1] + 4], [WELL_C[0] - 34, WELL_C[1] + 12]];
    drops.forEach(([x, y], i) => {
      const k = ((t + i * 97) % 180) / 180;
      if (k > .5) return;
      const r = 2 + k * 22;
      g.save(); g.globalAlpha = (1 - k * 2) * .5; g.strokeStyle = '#9cc2e0'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(x, y, r, r * .35, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    });
  }
}

/* 장애물 하나 — 앞면이 보이는 위에서 본 모습 */
function drawProp(g, p, t) {
  const { x, y, x0, x1, y0, y1 } = p;
  const R = (c, a, b, w, h) => { g.fillStyle = c; g.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(h)); };
  g.save();
  // 바닥 그림자
  g.fillStyle = 'rgba(0,0,0,.42)';
  g.beginPath(); g.ellipse(x + 2, y1 - 1, p.w * .58, Math.max(4, p.h * .32), 0, 0, Math.PI * 2); g.fill();
  switch (p.k) {
    case 'pillar': {                                 // 돌기둥 — 받침, 몸통, 머리, 단청 띠
      const top = y1 - p.tall - 8;
      R('#1b1922', x0 - 2, y1 - 6, p.w + 4, 6);
      R('#3a3644', x0 + 2, top + 6, p.w - 4, y1 - top - 12);
      R('#4d4858', x0 + 3, top + 6, 3, y1 - top - 12);
      R('#26232e', x1 - 6, top + 6, 3, y1 - top - 12);
      R('#2f2c38', x0 - 1, top, p.w + 2, 7);
      R('#57516a', x0 - 1, top, p.w + 2, 1);
      ['#2f6fb5', '#e9e3d5', '#c2352c', '#15141b', '#e3b23c'].forEach((c, i) => { g.globalAlpha = .55; R(c, x0 + 2 + i * ((p.w - 4) / 5), top + 9, (p.w - 4) / 5, 2); });
      g.globalAlpha = 1;
      R('rgba(0,0,0,.35)', x0 + 2, y1 - 10, p.w - 4, 4);
      break;
    }
    case 'bed': {                                    // 돌로 굳은 병상 — 석판, 베개, 흘러내린 시트
      R('#1c1a22', x0, y0 + 4, p.w, p.h);              // 석판 두께 (앞면)
      R('#2e2b36', x0, y0, p.w, p.h - 2);               // 윗면 석판
      R('#3d3947', x0, y0, p.w, 1);
      R('#15141b', x0 - 1, y0 - 5, p.w + 2, 6);         // 머리판 (쇠)
      R('#4a5361', x0 - 1, y0 - 5, p.w + 2, 1);
      R('#5c5866', x0 + 4, y0 + 3, p.w - 8, 7);         // 베개
      R('#6c6878', x0 + 5, y0 + 3, p.w - 10, 2);
      R('#4b4858', x0 + 2, y0 + 13, p.w - 4, p.h - 17); // 시트
      R('#3b3846', x0 + 2, y0 + 13, p.w - 4, 1);
      if ((x * 7 + y) % 3 !== 0) {                      // 시트 아래 — 누군가 누운 모양
        g.fillStyle = '#5a5668'; g.beginPath(); g.ellipse(x, y0 + 13, 5, 4, 0, 0, Math.PI * 2); g.fill();      // 머리
        g.beginPath(); g.ellipse(x, y0 + 28, 8, 12, 0, 0, Math.PI * 2); g.fill();                              // 몸
        g.beginPath(); g.ellipse(x - 3, y1 - 9, 3, 7, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x + 3, y1 - 9, 3, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#6a6678'; g.fillRect(x - 6, y0 + 19, 6, 1); g.fillRect(x - 3, y0 + 11, 3, 1);       // 빛 받은 주름
      }
      R('rgba(110,20,18,.5)', x0 + 6, y0 + 30, 5, 3);   // 얼룩
      R('#4b4858', x1 - 2, y0 + 16, 3, p.h - 12);      // 옆으로 흘러내린 시트
      break;
    }
    case 'tank': case 'tankS': {                     // 수조 — 돌 테, 안에 고인 검은 물, 물결
      R('#211f29', x0, y0 + 6, p.w, p.h - 2);          // 테 두께
      R('#34303d', x0, y0, p.w, p.h - 4);               // 돌 테
      R('#4a4556', x0, y0, p.w, 1);
      R('#0d1d26', x0 + 5, y0 + 5, p.w - 10, p.h - 14); // 물
      R('#123040', x0 + 5, y0 + 5, p.w - 10, 3);        // 테 그림자 아래 물빛
      R('rgba(0,0,0,.45)', x0 + 5, y0 + 5, p.w - 10, 1);
      g.fillStyle = 'rgba(140,190,210,.22)';            // 수면 반사
      for (let i = 0; i < p.w - 20; i += 6) g.fillRect(x0 + 9 + i, y0 + 9 + ((i * 7) % 5), 3, 1);
      R('#2a2733', x0 + 2, y0 + 2, 3, 3); R('#2a2733', x1 - 5, y0 + 2, 3, 3);
      const k = (t % 120) / 120;
      g.globalAlpha = .35 * (1 - k); g.strokeStyle = '#9cc2e0'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(x, y0 + 4 + (p.h - 12) / 2, 4 + k * (p.w * .3), 1.5 + k * 4, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
      R('#5f6a7a', x1 - 10, y0 - 6, 3, 8); R('#7b8696', x1 - 12, y0 - 7, 7, 2);   // 수도꼭지
      break;
    }
    case 'console': {                                // 감시 책상 — 모니터에 심전도
      R('#1c2028', x0, y0 + 4, p.w, p.h);
      R('#2c323d', x0, y0, p.w, p.h - 4);
      R('#3d4552', x0, y0, p.w, 1);
      R('#14181f', x0 + 6, y0 - p.tall, p.w - 12, p.tall);
      R('#03110e', x0 + 8, y0 - p.tall + 2, p.w - 16, p.tall - 5);
      g.fillStyle = '#00ffd5';
      for (let i = 0; i < p.w - 16; i++) {
        const ph = (i + (t >> 1)) % 24, yy = ph === 10 ? -5 : ph === 11 ? 3 : ph === 12 ? -2 : 0;
        if (((t >> 1) - i + 400) % 40 < 30) g.fillRect(x0 + 8 + i, y0 - p.tall / 2 + yy, 1, 1);
      }
      R('#4a5361', x0 + 4, y0 + 3, 10, 2); R('#4a5361', x1 - 14, y0 + 3, 10, 2);  // 손잡이 · 버튼
      R(Math.floor(t / 30) % 2 ? '#c2352c' : '#4a1512', x1 - 6, y0 + 6, 2, 2);
      break;
    }
    case 'roots': {                                  // 뿌리 덩어리 — 바닥에서 솟아 엉킴
      g.lineCap = 'round';
      for (let i = 0; i < 8; i++) {                    // 바닥으로 기어 나가는 뿌리
        const a = i / 8 * Math.PI * 2 + .3, l = p.w * (.6 + ((i * 37) % 10) / 25);
        const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l * .45;
        g.strokeStyle = '#21160f'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + .5) * l * .5, y + Math.sin(a + .5) * l * .25, ex, ey); g.stroke();
        g.strokeStyle = '#3a2a1c'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y - 1); g.quadraticCurveTo(x + Math.cos(a + .5) * l * .5, y + Math.sin(a + .5) * l * .25 - 1, ex, ey - 1); g.stroke();
      }
      g.fillStyle = '#21160f'; g.beginPath(); g.ellipse(x, y, p.w * .42, p.h * .5, 0, 0, Math.PI * 2); g.fill();   // 뿌리 덩이
      g.fillStyle = '#2f2116'; g.beginPath(); g.ellipse(x - 2, y - 3, p.w * .32, p.h * .34, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 4; i++) {                    // 덩이에서 솟아 휘어진 뿌리
        const sx = x - 12 + i * 8, h = p.tall * (.6 + (i % 2) * .4);
        g.strokeStyle = i % 2 ? '#3c2a1b' : '#2a1d13'; g.lineWidth = 3 - (i % 2);
        g.beginPath(); g.moveTo(sx, y - 2); g.quadraticCurveTo(sx + (i % 2 ? 8 : -8), y - h, sx + (i % 2 ? -2 : 4), y - h - 4); g.stroke();
      }
      g.fillStyle = '#4a3522'; g.fillRect(x - 8, y - 6, 10, 1);
      g.lineCap = 'butt';
      break;
    }
    case 'shelf': {                                  // 서류장 — 서랍 칸, 삐져나온 서류
      const top = y1 - p.h - p.tall;
      R('#2d2620', x0, top, p.w, p.tall + p.h);
      R('#3b322a', x0, top, p.w, 2);
      for (let i = 0; i < 4; i++) {
        const dy = top + 4 + i * ((p.tall + p.h - 8) / 4);
        R('#241e19', x0 + 2, dy, p.w - 4, (p.tall + p.h - 8) / 4 - 2);
        R('#6a5c4c', x + -2, dy + 3, 4, 1);
        if (i % 2) R('#b9b2a2', x0 + 3, dy - 1, p.w - 8, 2);
      }
      R('#1a1511', x1 - 3, top, 3, p.tall + p.h);
      break;
    }
    case 'fallen': {                                 // 쓰러진 서류장 — 쏟아진 종이
      R('#241e19', x0, y0 + 4, p.w, p.h - 2);
      R('#3b322a', x0, y0, p.w, p.h - 4);
      for (let i = 0; i < 4; i++) R('#2d2620', x0 + 3 + i * (p.w / 4), y0 + 2, p.w / 4 - 3, p.h - 8);
      [[-30, 10], [-18, 13], [8, 12], [22, 9]].forEach(([dx, dy]) => R('#b9b2a2', x + dx, y1 + dy - 6, 9, 5));
      break;
    }
    case 'ladder': {                                 // 무너진 사다리 — 부러진 장대와 가로대, 돌무더기
      g.save(); g.translate(x, y); g.rotate(-.18);
      R('#3a2c1e', -26, -6, 52, 3); R('#3a2c1e', -24, 3, 48, 3);
      for (let i = -20; i <= 20; i += 8) R('#4d3b28', i, -4, 3, 8);
      g.restore();
      R('#2e2b36', x0 - 4, y1 - 6, 10, 6); R('#3a3644', x1 - 6, y1 - 7, 12, 7); R('#4b4656', x1 - 6, y1 - 7, 12, 1);
      break;
    }
    case 'rock': {                                   // 무너져 내린 돌
      [[-10, 0, 14, 10], [2, -4, 16, 13], [-2, 4, 12, 8]].forEach(([dx, dy, w, h]) => {
        R('#2e2b36', x + dx, y + dy - h / 2, w, h); R('#45404f', x + dx, y + dy - h / 2, w, 1);
      });
      break;
    }
  }
  g.restore();
}

/* 장애물 — 주인공보다 뒤(발자리가 위쪽)에 있는 것 먼저, 앞에 있는 것은 나중에 */
function drawPropsPass(g, props, t, refY, front) {
  for (const p of props) if ((p.y1 > refY) === front) drawProp(g, p, t);
}
