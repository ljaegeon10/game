'use strict';
/* ═══════════════════════════════════════════════════════════════
   pistol.js — 1인칭 픽셀 피스톨 · 장전 모션 시트 (공용)

   시작할 때 한 번, 128×96 칸에 픽셀 단위로 피스톨을 찍어 시트로 굽습니다.
   쓰는 곳 : 탈출 총격전(js/escape.js) · 시연 페이지(prototypes/pistol.html)

            col 0        col 1          col 2          col 3
     row0   IDLE ★       배출 준비       탄창 아래       손이 슬라이드에
     row1   숨 (위)      버튼 누름       밀어 넣는 중 ★  당기기 시작
     row2   숨 (위)      탄창 빠짐 ★     거의 다         끝까지 — 챔버 열림 ★
     row3   숨           빈 손잡이       철컥 (손바닥)   놓음 — 제자리로
     row4   [낙하 탄창 · 탄피 — 낱개 스프라이트]
     ★ = 대표 프레임 (KEY)

   시트는 두 장 — 본 그림(sheet)과, 형광 청록 픽셀만 담은 글로우 마스크(mask).
   손이 덮은 자리는 마스크에서도 지워지므로 가려진 조준기는 빛나지 않습니다.
   ═══════════════════════════════════════════════════════════════ */
(() => {
const FW = 128, FH = 96;                   // 스프라이트 한 칸
const COLS = 4, SUBS = 4, UTIL_ROW = 4;
const KEY = [0, 2, 1, 2];                  // 단계마다 대표 프레임
const LABEL = [['01', 'IDLE', '대기'], ['02', 'MAG RELEASE', '탄창 배출'],
               ['03', 'INSERT MAG', '새 탄창 삽입'], ['04', 'RACK SLIDE', '슬라이드 당기기']];

/* 팔레트 — 흑·냉회색 본체, 형광 청록 작동부, 오방색 그립 */
const C = {
  K: '#07080b', G1: '#16191f', G2: '#252a33', G3: '#363d49', G4: '#525c6b', G5: '#7b8696',
  T: '#00ffd5', T2: '#00b89a', T3: '#00574b',
  R: '#c2352c', B: '#2f6fb5', Y: '#e3b23c', W: '#e9e3d5', Bk: '#15141b',
  GL1: '#1b1e22', GL2: '#2a2e35', GL3: '#3d434d', GL4: '#565d68', PAD: '#0f1114',
  SL1: '#121826', SL2: '#1c2536', SL3: '#2a364b',
  BR: '#a8842f', BR2: '#e2c272'
};
const OBANG = [C.B, C.W, C.R, C.Bk, C.Y];

/* ═════════════ 픽셀 붓 ═══════════════════════════════════════
   px  : 본 시트에 찍고, 같은 자리의 글로우 마스크는 지웁니다 (가려지면 안 빛남)
   glow: 본 시트와 글로우 마스크 둘 다에 찍습니다 */
function makeBrush(ctx, gctx) {
  let ox = 0, oy = 0;
  const b = {
    at(x, y) { ox = x; oy = y; },
    px(c, x, y, w = 1, h = 1) {
      if (w <= 0 || h <= 0) return;
      x = ox + Math.round(x); y = oy + Math.round(y);
      ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
      gctx.clearRect(x, y, w, h);
    },
    glow(c, x, y, w = 1, h = 1) {
      if (w <= 0 || h <= 0) return;
      x = ox + Math.round(x); y = oy + Math.round(y);
      ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
      gctx.fillStyle = c; gctx.fillRect(x, y, w, h);
    },
    clr(x, y, w = 1, h = 1) { x = ox + Math.round(x); y = oy + Math.round(y); ctx.clearRect(x, y, w, h); gctx.clearRect(x, y, w, h); },
    /* 줄마다 [x0, x1] 을 주는 비스듬한 면 — col(x, y, x0, x1) 이 색을 돌려줍니다 */
    span(y0, y1, edge, col) {
      for (let y = y0; y <= y1; y++) {
        const [a, c] = edge(y), x0 = Math.round(a), x1 = Math.round(c);
        for (let x = x0; x <= x1; x++) { const k = col(x, y, x0, x1); if (k) b.px(k, x, y); }
      }
    },
    box(x, y, w, h, fill, line = C.K) { b.px(line, x, y, w, h); b.px(fill, x + 1, y + 1, w - 2, h - 2); }
  };
  return b;
}

/* 단청 띠 — 황 · 흑 · (적/청 꽃 + 백 테두리) · 흑 · 청 이 7줄마다 되풀이됩니다 */
function dancheong(x, y, x0, phase = 0) {
  const yy = y + phase, r = ((yy % 7) + 7) % 7, cx = (((x - x0) % 6) + 6) % 6;
  if (r === 0) return C.Y;
  if (r === 6) return C.B;
  if (r === 1 || r === 5) return C.Bk;
  const band = Math.floor(yy / 7);
  const d = Math.abs(cx - 2.5) + Math.abs(r - 3);
  if (d <= 1) return band % 2 ? C.R : C.B;
  if (d <= 2) return C.W;
  return C.Bk;
}

/* ═════════════ 장갑 낀 손 · 소매 ════════════════════════════ */
function glove(x, y, x0, x1, top) {          // 비스듬한 면용 — 가장자리 윤곽, 위쪽 밝게
  if (x === x0 || x === x1) return C.K;
  if (y === top) return C.K;
  if (x === x0 + 1 || y === top + 1) return C.GL3;
  return C.GL2;
}
function sleeve(x, y, x0, x1) {
  if (x === x0 || x === x1) return C.K;
  if (x === x0 + 1) return C.SL3;
  return ((x + y) % 9 === 0) ? C.SL1 : C.SL2;
}

/* ═════════════ 뒤에서 본 피스톨 (IDLE) ═══════════════════════ */
function drawRear(b, o) {
  const dy = o.dy || 0, lit = o.lit || 0;
  const Y = v => v + dy;
  // 소매 두 짝 — 아래 모서리에서 손으로
  b.span(Y(74), 95, y => [16 + (95 - y) * 1.1, 52 + (95 - y) * .35], sleeve);
  b.span(Y(74), 95, y => [76 - (95 - y) * .35, 112 - (95 - y) * 1.1], sleeve);
  // 손잡이 뒷면(백스트랩) — 단청이 손 사이로 드러납니다
  b.span(Y(44), 95, () => [58, 70], (x, y, x0, x1) => (x === x0 || x === x1) ? C.K : (x === x0 + 1 ? C.G3 : null));
  b.span(Y(48), 95, () => [60, 68], (x, y, x0) => dancheong(x, y, x0, -dy));
  // 오른손 (쥐는 손) — 손잡이 오른쪽을 감쌉니다
  b.span(Y(56), Y(86), y => [69, 86 - Math.abs(y - Y(70)) * .25], (x, y, x0, x1) => glove(x, y, x0, x1, Y(56)));
  for (let i = 0; i < 3; i++) b.px(C.PAD, 78, Y(61 + i * 7), 6, 2);                  // 손가락 마디 보호대
  // 왼손 (받치는 손) — 앞쪽에서 감싸 올립니다
  b.span(Y(58), Y(88), y => [42 + Math.abs(y - Y(72)) * .25, 59], (x, y, x0, x1) => glove(x, y, x0, x1, Y(58)));
  for (let i = 0; i < 3; i++) b.px(C.PAD, 45, Y(63 + i * 7), 6, 2);
  b.px(C.GL4, 47, Y(60), 8, 1);
  // 손목 띠 — 청록 표시등 (피험자 07)
  b.px(C.K, 64 - 30, Y(84), 18, 4); b.px(C.GL1, 64 - 29, Y(85), 16, 2); b.glow(lit ? C.T : C.T2, 64 - 22, Y(85), 2, 2);
  b.px(C.K, 76, Y(84), 18, 4); b.px(C.GL1, 77, Y(85), 16, 2); b.glow(lit ? C.T : C.T2, 84, Y(85), 2, 2);
  // 엄지 둘 — 프레임 양옆을 따라 앞으로
  b.box(48, Y(46), 6, 13, C.GL3); b.px(C.GL4, 49, Y(47), 1, 10);
  b.box(74, Y(46), 6, 13, C.GL3); b.px(C.GL4, 75, Y(47), 1, 10);
  // 프레임 · 더스트 커버
  b.box(52, Y(43), 25, 6, C.G1); b.px(C.G3, 53, Y(44), 23, 1);
  b.glow(lit > .5 ? C.T : C.T2, 53, Y(46), 1, 2); b.glow(lit > .5 ? C.T : C.T2, 75, Y(46), 1, 2);   // 탄창 멈치 (양손잡이)
  // 슬라이드 뒷면
  b.box(50, Y(28), 29, 16, C.G2);
  b.clr(50, Y(28)); b.clr(78, Y(28));                    // 둥근 모서리
  b.px(C.G4, 51, Y(29), 27, 1); b.px(C.G5, 51, Y(29), 1, 12);   // 차가운 테두리 빛
  b.px(C.G1, 51, Y(40), 27, 3);
  // 옆면 톱니 — 가장자리로 청록이 새어 나옵니다
  for (let y = 31; y <= 41; y += 2) { b.glow(C.T2, 50, Y(y)); b.glow(C.T2, 78, Y(y)); }
  // 스트라이커 판 — 가운데 청록 고리
  b.box(59, Y(33), 11, 8, C.G1);
  b.glow(C.T3, 62, Y(35), 5, 4); b.glow(lit ? C.T : C.T2, 63, Y(36), 3, 2);
  // 가늠자 — 홈 사이로 가늠쇠
  b.box(52, Y(24), 25, 5, C.G1); b.clr(62, Y(24), 5, 3); b.px(C.K, 62, Y(26), 5, 1);
  b.glow(C.T, 55, Y(25), 2, 2); b.glow(C.T, 72, Y(25), 2, 2);
  b.px(C.K, 63, Y(21), 3, 5); b.glow(C.T, 64, Y(22), 1, 2);   // 가늠쇠 — 더 멀어서 작게
}

/* ═════════════ 옆에서 본 피스톨 (장전) ═══════════════════════
   o.so : 슬라이드가 뒤로 밀린 픽셀     o.mo : 탄창이 빠져나온 픽셀 (null = 없음)
   o.thumb : 탄창 멈치를 누름           o.left : 왼손 — low / mag / slap / rack
   o.newMag : 꽉 찬 새 탄창 (윗탄이 보임) o.sg : 톱니 글로우 세기 (0~1) */
const K_SLOPE = .22;
const gx0 = y => 68 + (y - 47) * K_SLOPE, gx1 = y => 88 + (y - 47) * K_SLOPE;

function drawMag(b, mo, full, ox = 0, oy = 0) {
  const top = 49 + mo + oy, bot = 84 + mo + oy;
  const e = y => [gx0(y - mo - oy) + 3 + ox, gx1(y - mo - oy) - 3 + ox];
  b.span(top, bot - 3, e, (x, y, x0, x1) => {
    if (x === x0 || x === x1) return C.K;
    if (x === x0 + 1) return C.G3;
    // 탄창 옆면 — 오방색 가는 띠
    const r = y - top;
    if (r > 6 && r % 3 === 0) return OBANG[Math.floor(r / 3) % 5];
    return C.G2;
  });
  // 바닥판
  const [a, c] = e(bot);
  b.box(Math.round(a) - 1, bot - 3, Math.round(c - a) + 4, 4, C.Bk);
  b.px(C.Y, Math.round(a), bot - 2, Math.round(c - a) + 2, 1);
  b.px(C.R, Math.round(a) + 2, bot - 1, 2, 1); b.px(C.B, Math.round(c) - 2, bot - 1, 2, 1);
  if (full) {                                  // 윗탄 — 놋쇠에 청록 탄두
    const [t0] = e(top);
    b.px(C.BR, Math.round(t0) + 2, top - 2, 9, 3); b.px(C.BR2, Math.round(t0) + 3, top - 2, 7, 1);
    b.glow(C.T, Math.round(t0), top - 2, 2, 3);
  }
}

function drawSide(b, o) {
  const so = o.so || 0, sg = o.sg || 0;
  // ── 왼손이 쉬고 있을 때 — 아래 왼쪽에서 기다립니다
  if (o.left === 'low') {
    b.span(74, 112, y => [-2, 14 + (y - 74) * .35], sleeve);
    b.span(66, 82, y => [6 + Math.abs(y - 74) * .4, 30 - Math.abs(y - 72) * .5], (x, y, x0, x1) => glove(x, y, x0, x1, 66));
    for (let i = 0; i < 3; i++) b.px(C.PAD, 22, 68 + i * 4, 5, 2);
  }
  // ── 오른팔 소매 (손목에서 오른쪽 아래로)
  b.span(70, 112, y => [86 + (y - 70) * .8, 104 + (y - 70) * 1.1], sleeve);
  b.px(C.K, 84, 70, 22, 1);
  // ── 탄창 (손잡이 안에 있으면 바닥판만, 빠지면 몸통이 드러남)
  if (o.mo !== null && o.mo !== undefined) drawMag(b, o.mo, o.newMag);
  // ── 슬라이드가 밀리면 드러나는 총열
  if (so > 0) { b.px(C.G3, 26, 31, so + 1, 7); b.px(C.G4, 26, 31, so + 1, 1); b.px(C.K, 26, 33, 1, 3); }
  // ── 프레임 · 방아쇠울 · 방아쇠
  b.box(30, 41, 59, 7, C.G1); b.px(C.G3, 31, 42, 57, 1);
  for (let x = 33; x <= 51; x += 3) b.px(C.K, x, 46, 1, 2);                // 레일 홈
  b.px(C.K, 52, 47, 1, 10); b.px(C.G2, 53, 47, 1, 9);
  b.px(C.K, 52, 56, 16, 2); b.px(C.G2, 53, 56, 14, 1);
  b.px(C.G3, 60, 47, 2, 4); b.px(C.G3, 59, 51, 2, 3); b.px(C.G4, 60, 47, 1, 3);
  // 탄창 멈치 — 누르면 밝게, 한 칸 안으로
  if (o.thumb) b.glow(C.T, 67, 48, 2, 3); else b.glow(C.T2, 66, 48, 2, 3);
  // ── 손잡이 + 단청 패널
  b.span(47, 82, y => [gx0(y), gx1(y)], (x, y, x0, x1) => (x === x0 || x === x1) ? C.K : (x === x0 + 1 ? C.G3 : C.G1));
  b.span(50, 78, y => [gx0(y) + 3, gx1(y) - 3], (x, y, x0, x1) => (x === x0 || x === x1 || y === 50 || y === 78) ? C.K : dancheong(x, y, x0));
  if (o.mo === null || o.mo === undefined) {   // 빈 손잡이 — 탄창 구멍
    b.span(80, 82, y => [gx0(y) + 3, gx1(y) - 3], () => C.K);
  } else if (o.mo === 0) drawMag(b, 0, false, 0, 0);
  // ── 슬라이드
  const s0 = 26 + so;
  b.box(s0, 28, 67, 14, C.G2);
  b.clr(s0, 28); b.clr(s0, 29); b.clr(s0 + 1, 28);                           // 앞쪽 모따기
  b.px(C.G4, s0 + 2, 29, 63, 1); b.px(C.G5, s0 + 4, 29, 20, 1);
  b.px(C.G1, s0 + 1, 38, 65, 3);
  // 각인 "07"
  [[0, 0, 3, 1], [0, 4, 3, 1], [0, 0, 1, 5], [2, 0, 1, 5], [4, 0, 3, 1], [6, 0, 1, 5]].forEach(([x, y, w, h]) => b.px(C.T3, s0 + 12 + x, 33 + y, w, h));
  // 배출구 — 슬라이드가 끝까지 밀리면 챔버가 열려 다음 탄이 보입니다
  if (o.port) {
    b.px(C.K, s0 + 36, 29, 12, 5);
    b.px(C.BR, s0 + 38 - so, 30, 8, 3); b.px(C.BR2, s0 + 39 - so, 30, 6, 1); b.glow(C.T, s0 + 36 - so + 1, 30, 2, 3);
  } else {
    b.px(C.K, s0 + 36, 29, 1, 5); b.px(C.K, s0 + 47, 29, 1, 5); b.px(C.G3, s0 + 37, 30, 10, 3);
  }
  // 톱니 — 형광 청록 글로우
  for (let i = 0; i < 6; i++) {
    const x = s0 + 52 + i * 2;
    b.px(C.K, x, 30, 1, 10);
    b.glow(sg > .5 ? C.T : C.T2, x + 1, 30, 1, 10);
    if (sg > 0) b.glow(C.T, x + 1, 33, 1, 4);
  }
  // 가늠쇠 · 가늠자
  b.px(C.K, s0 + 3, 25, 4, 3); b.glow(C.T, s0 + 4, 26, 2, 1);
  b.px(C.K, s0 + 57, 25, 8, 3); b.px(C.G2, s0 + 58, 26, 6, 1); b.px(C.K, s0 + 60, 25, 2, 2);
  b.glow(C.T, s0 + 58, 26, 1, 1); b.glow(C.T, s0 + 63, 26, 1, 1);

  // ── 오른손 — 손가락 셋이 앞쪽을 감싸고(단청이 그 사이로 보임), 검지는 방아쇠 밖에 곧게
  b.span(51, 80, y => [gx1(y) - 4, gx1(y) + 5], (x, y, x0, x1) => glove(x, y, x0, x1, 51));   // 손바닥 뒤꿈치
  // 손가락 셋 — 손잡이 앞을 감싼 한 덩어리, 끝마디만 단청 위로 살짝 걸칩니다
  b.span(55, 75, y => [gx0(y) - 7 + Math.max(0, 57 - y) * .8 + Math.max(0, y - 73), gx0(y) + 3 - ((y - 55) % 7 === 6 ? 1 : 0)],
         (x, y, x0, x1) => (x === x0 || x === x1 || y === 55 || y === 75) ? C.K
                         : ((y - 55) % 7 === 6 ? C.K : ((y - 55) % 7 === 1 ? C.GL3 : C.GL2)));
  [56, 63, 70].forEach(fy => b.px(C.PAD, gx0(fy) - 5, fy + 2, 3, 3));                         // 마디 보호대
  b.box(54, 47, 15, 4, C.GL2); b.px(C.GL3, 55, 48, 12, 1); b.px(C.PAD, 56, 48, 3, 2);             // 검지
  // 엄지 — 손잡이 위를 지나 멈치 쪽으로 (누를 땐 한 칸 앞으로)
  const th = o.thumb ? -2 : 0;
  b.box(68 + th, 48, 14 - th, 5, C.GL3); b.px(C.GL4, 69 + th, 49, 10, 1); b.px(C.PAD, 68 + th, 50, 3, 2);
  // 손목 띠
  b.px(C.K, 84, 70, 14, 5); b.px(C.GL1, 85, 71, 12, 3); b.glow(C.T2, 92, 72, 2, 1);

  // ── 왼손
  if (o.left === 'mag' || o.left === 'slap') {
    const mo = o.left === 'slap' ? 0 : o.mo, bot = 84 + mo;
    const cx0 = gx0(82) + 2, cx1 = gx1(82) - 1;
    b.span(bot - 1, Math.min(112, bot + 12), y => [cx0 - 4 + (y - bot) * .15, cx1 + 6 + (y - bot) * .2], (x, y, x0, x1) => glove(x, y, x0, x1, bot - 1));
    for (let i = 0; i < 3; i++) b.box(cx0 - 4 + i * 1, bot - 6 + i * 3, 5, 3, C.GL2);   // 탄창 앞쪽을 감싼 손끝
    b.span(Math.min(112, bot + 8), 112, y => [cx0 - 14 - (y - bot) * .6, cx0 + 6 - (y - bot) * .3], sleeve);
    if (o.left === 'slap') b.px(C.GL4, cx0 - 2, bot, cx1 - cx0 + 6, 1);
  }
  if (o.left === 'rack') {
    const hx = s0 + 48;
    b.span(0, 24, y => [hx + 16 + (24 - y) * .9, 130], sleeve);                         // 위쪽에서 내려오는 팔
    b.span(21, 31, y => [hx - 1 + Math.abs(y - 26) * .3, hx + 24], (x, y, x0, x1) => glove(x, y, x0, x1, 21));
    for (let i = 0; i < 4; i++) {                                                         // 톱니 위로 걸친 손가락
      const fx = hx + 1 + i * 5;
      b.box(fx, 29, 5, 9 - (i === 3 ? 2 : 0), C.GL2); b.px(C.GL3, fx + 1, 30, 1, 5); b.px(C.PAD, fx + 1, 35 - (i === 3 ? 2 : 0), 3, 1);
    }
  }
}

/* ═════════════ 시트 굽기 ═════════════════════════════════════ */
function bakeSheet() {
  const sheet = document.createElement('canvas'), mask = document.createElement('canvas');
  sheet.width = mask.width = FW * COLS; sheet.height = mask.height = FH * (SUBS + 1);
  const sc = sheet.getContext('2d'), mc = mask.getContext('2d');
  const b = makeBrush(sc, mc);
  const cell = (col, row, fn, lift = 0) => {
    [sc, mc].forEach(c => { c.save(); c.beginPath(); c.rect(col * FW, row * FH, FW, FH); c.clip(); });
    b.at(col * FW, row * FH - lift); fn();
    [sc, mc].forEach(c => c.restore());
  };
  // col 0 — IDLE : 숨 쉬듯 한 픽셀씩 오르내림, 표시등이 한 번 밝아짐
  [[0, 0], [-1, .3], [-1, 1], [0, .3]].forEach(([dy, lit], r) => cell(0, r, () => drawRear(b, { dy, lit })));
  // col 1 — 탄창 배출
  cell(1, 0, () => drawSide(b, { mo: 0, left: 'low' }), LIFT);
  cell(1, 1, () => drawSide(b, { mo: 5, thumb: true, left: 'low' }), LIFT);
  cell(1, 2, () => drawSide(b, { mo: 15, thumb: true, left: 'low' }), LIFT);
  cell(1, 3, () => drawSide(b, { mo: null, left: 'low' }), LIFT);
  // col 2 — 새 탄창 삽입
  cell(2, 0, () => drawSide(b, { mo: 20, newMag: true, left: 'mag' }), LIFT);
  cell(2, 1, () => drawSide(b, { mo: 11, newMag: true, left: 'mag' }), LIFT);
  cell(2, 2, () => drawSide(b, { mo: 4, newMag: true, left: 'mag' }), LIFT);
  cell(2, 3, () => drawSide(b, { mo: 0, left: 'slap' }), LIFT);
  // col 3 — 슬라이드 당기기
  cell(3, 0, () => drawSide(b, { mo: 0, left: 'rack', sg: .4 }), LIFT);
  cell(3, 1, () => drawSide(b, { mo: 0, left: 'rack', so: 5, sg: 1 }), LIFT);
  cell(3, 2, () => drawSide(b, { mo: 0, left: 'rack', so: 10, sg: 1, port: true }), LIFT);
  cell(3, 3, () => drawSide(b, { mo: 0, left: 'low', sg: .6 }), LIFT);
  // row 4 — 낱개 : 떨어지는 빈 탄창 (곧게 · 기울게), 탄피 두 장
  cell(0, UTIL_ROW, () => drawMag(b, 0, false, -64, -46));
  cell(1, UTIL_ROW, () => {
    b.px(C.BR, 2, 2, 7, 3); b.px(C.BR2, 3, 2, 5, 1); b.px(C.K, 9, 2, 1, 3);
    b.px(C.BR, 14, 1, 3, 6); b.px(C.BR2, 14, 2, 1, 4); b.px(C.K, 14, 7, 3, 1);
  });
  return { sheet, mask };
}
const LIFT = 16;
/* 낱개 스프라이트의 위치 — [sx, sy, w, h] */
const SPR_MAG = [0 * FW + 4, UTIL_ROW * FH, 24, 44];
const SPR_CASE = [[1 * FW + 2, UTIL_ROW * FH + 1, 8, 5], [1 * FW + 13, UTIL_ROW * FH + 0, 5, 9]];

/* 장전 순서 — [단계, 장, 길이(프레임), 이벤트] · 이벤트는 그 장이 시작되는 순간 */
const SEQ = [
  [1, 0, 9, 'cant'], [1, 1, 12, 'press'], [1, 2, 9, 'release'], [1, 3, 16, 'drop'],
  [2, 0, 12, 'bring'], [2, 1, 8, null], [2, 2, 7, null], [2, 3, 14, 'seat'],
  [3, 0, 10, 'grab'], [3, 1, 5, 'pull'], [3, 2, 12, 'eject'], [3, 3, 12, 'snap']
];

let baked = null;
window.PistolArt = {
  FW, FH, COLS, SUBS, UTIL_ROW, KEY, LABEL, SEQ, LIFT, SPR_MAG, SPR_CASE, C, OBANG, gx0,
  /* 시트는 한 번만 굽고 돌려 씁니다 */
  bake() { return baked || (baked = bakeSheet()); }
};
})();
