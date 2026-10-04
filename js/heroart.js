'use strict';
/* ═══════════════════════════════════════════════════════════════
   heroart.js — 주인공 시안 (그림 파일 없이 코드로 그리는 픽셀 스프라이트)

   주인공은 실험실 침대에 누워 꿈을 꾸는 '피험자 07' 입니다.
   그래서 생김새에 엔딩의 실험실이 미리 묻어 있습니다.
     · 환자복 · 맨발 · 손목의 환자 팔찌 (1인칭 피스톨의 손과 같은 팔찌)
     · 뇌파 캡 — 머리를 덮은 그물과 오방색 전극
     · 뒤통수에서 늘어진 전극선 네 가닥 (청 · 적 · 황 · 백)
       → 던전을 물들인 오방색이 사실은 이 선의 색이라는 복선

   한 칸 30×36, 게임 화면에 1:1 로 찍히는 크기입니다 (지금 게임은 30px 폭).
   방향마다 4장 걷기 — down 0~3 · up 4~7 · left 8~11 · right 12~15
   (right 는 left 를 좌우로 뒤집어 굽습니다)

   전극선은 시트에 굽지 않고 매 프레임 줄(사슬)로 흉내 냅니다 — 매달려
   있다가 바닥에 닿으면 끌리며 따라오도록. CableRig 를 보세요.

   D · E · F 는 원래 노란 주인공을 살린 시안입니다 — 아래 '아바타' 를 보세요.

   쓰는 곳 : js/game.js (게임 주인공 — 시안 G) · prototypes/hero.html (시안 비교 페이지)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const FW = 30, FH = 36, N = FW * FH;
const DIRS = ['down', 'up', 'left', 'right'];
const STEPS = 4;
const FEET_Y = 34;                       // 발바닥 줄 — 이 줄이 바닥에 닿는 자리
const CX = 15;

/* ── 색 계단 (어두움 → 밝음) ── */
const RAMP = {
  skin:   ['#4a3236', '#7a5653', '#a77f74', '#cda393', '#e8c9b8'],     // 창백한 살결
  hair:   ['#0d0b10', '#19151d', '#29232e', '#3b3343'],
  gown:   ['#22393d', '#36585a', '#55807c', '#80aba3', '#b3d6cc'],     // 연민트 환자복
  pj:     ['#151a2c', '#212a45', '#33416a', '#4b5d91'],                 // 남색 줄무늬 잠옷
  pjLine: ['#4e5c7c', '#7584a8', '#a3b0cc'],
  cap:    ['#5e676c', '#8f999e', '#c3cbcf', '#e8eced'],                 // 뇌파 캡 그물
  blanket:['#4c5257', '#7a8287', '#a9b1b4', '#d4d9d8', '#eef0ec'],     // 병원 담요
  band:   ['#9aa3a8', '#e9edef']
};
const OUT = '#07070b';                    // 바깥 외곽선
const OB = { B: '#2f6fb5', R: '#c2352c', Y: '#e3b23c', W: '#e9e3d5' };
const EYE = '#100d14', SHINE = '#d9efe9', LID = '#5a3a3e', BAG = '#94707c', MOUTH = '#8a5a58';

const LIGHT = (() => { const v = [-.5, -.72, .62], m = Math.hypot(...v); return v.map(a => a / m); })();

/* ═════════════ 색 번호 버퍼 ════════════════════════════════════
   픽셀마다 색 · 부품 번호 · 안쪽 선을 그을지 · 선 색을 기억합니다.
   다 그린 뒤 나중에 그린 부품의 가장자리에 안쪽 선, 바깥에 외곽선. */
function newBuf() {
  return { col: new Array(N).fill(null), part: new Int32Array(N), ln: new Uint8Array(N),
           dk: new Array(N).fill(null), pid: 0, lines: true, dark: OUT };
}
function part(B, lines = true, dark = '#1a1418') { B.pid++; B.lines = lines; B.dark = dark; }
function put(B, x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (!c || x < 0 || y < 0 || x >= FW || y >= FH) return;
  const i = y * FW + x;
  B.col[i] = c; B.part[i] = B.pid; B.ln[i] = B.lines ? 1 : 0; B.dk[i] = B.dark;
}
const has = (B, x, y) => x >= 0 && y >= 0 && x < FW && y < FH && B.col[y * FW + x] !== null;
const pick = (ramp, I) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(I * ramp.length)))];

/* 둥근 덩어리 — 픽셀마다 법선을 세워 왼쪽 위 빛으로 명암 */
function blob(B, cx, cy, rx, ry, ramp, opt = {}) {
  const lift = opt.lift || 0, clip = opt.clip;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      if (clip && !clip(x, y, nx, ny)) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d));
      const I = .18 + .82 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) + lift;
      put(B, x, y, opt.color ? opt.color(x, y, I) : pick(ramp, I));
    }
}
/* 줄마다 [왼, 오른] 폭을 주는 몸통 · 옷 */
function rows(B, y0, y1, span, color) {
  for (let y = y0; y <= y1; y++) {
    const [l, r] = span(y);
    for (let x = Math.round(l); x < Math.round(r); x++) put(B, x, y, color(x, y, l, r));
  }
}
/* 원통 명암 — 왼쪽이 밝고 오른쪽이 어둡게 */
function cyl(ramp, x, y, l, r, base = .62, down = 0) {
  const nx = ((x + .5) - (l + r) / 2) / ((r - l) / 2);
  return pick(ramp, base - .34 * nx - down);
}

/* 마무리 — 안쪽 선과 바깥 외곽선 */
function finish(B, outline = OUT) {
  const col = B.col.slice();
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x;
    if (B.col[i] === null || !B.ln[i]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (!has(B, xx, yy)) continue;
      const j = yy * FW + xx;
      if (B.part[j] < B.part[i] && B.ln[j] !== 2) { col[i] = B.dk[i]; break; }
    }
  }
  const out = col.slice();
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (col[y * FW + x] !== null) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => has(B, x + dx, y + dy))) out[y * FW + x] = outline;
  }
  return out;
}

/* ═════════════ 생김새 ═════════════════════════════════════════
   look.kind  : 'gown' 환자복 · 'pj' 잠옷 · 'blanket' 병원 담요
   look.cap   : 'full' 뇌파 캡 그물 · 'dots' 전극 두 개만 · 없음
   look.band  : 손목 팔찌                                          */

/* 걸음 — step 0 왼발 앞 · 1 모음 · 2 오른발 앞 · 3 모음 */
const STRIDE = [1, 0, -1, 0];

function feet(B, dir, step, look) {
  const s = STRIDE[step];
  part(B, true);
  const foot = (x, y, w) => {
    for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < w; xx++) {
      if (yy === 2 && (xx === 0 || xx === w - 1)) continue;
      put(B, x + xx, y + yy, pick(RAMP.skin, .78 - xx * .12 - yy * .1));
    }
  };
  if (dir === 'down' || dir === 'up') {
    const k = dir === 'down' ? 1 : -1;
    foot(10, 31 + Math.max(0, s * k) - (s * k < 0 ? 1 : 0), 4);
    foot(16, 31 + Math.max(0, -s * k) - (-s * k < 0 ? 1 : 0), 4);
  } else {                                   // 왼쪽을 본 옆모습 — 발끝이 왼쪽
    foot(12 - s * 2, 31, 4);
    if (s !== 0) foot(13 + s * 2, 30, 4);
  }
  // 다리 — 잠옷은 바짓단, 나머지는 맨다리
  part(B, false);
  const leg = look.kind === 'pj' ? RAMP.pj : RAMP.skin;
  if (dir === 'down' || dir === 'up') {
    for (let y = 28; y < 31; y++) { put(B, 11, y, pick(leg, .7)); put(B, 12, y, pick(leg, .5));
                                     put(B, 17, y, pick(leg, .6)); put(B, 18, y, pick(leg, .4)); }
  } else {
    for (let y = 28; y < 31; y++) { put(B, 14 - s, y, pick(leg, .6)); put(B, 15 - s, y, pick(leg, .45)); }
  }
}

/* 환자복 · 잠옷 몸통 */
function torso(B, dir, look) {
  const side = dir === 'left';
  const hw = y => side ? 3.6 + (y - 18) * .22 : 4.6 + (y - 18) * .3;
  const ramp = look.kind === 'pj' ? RAMP.pj : RAMP.gown;
  part(B, true, look.kind === 'pj' ? '#0b0e19' : '#16262a');
  rows(B, 18, 29, y => [CX - hw(y) + (side ? .5 : 0), CX + hw(y) + (side ? .5 : 0) + (y === 29 && (y & 1) ? 0 : 0)],
    (x, y, l, r) => {
      const shade = y < 20 ? .2 : 0;                    // 머리 그늘
      let c = cyl(ramp, x, y, l, r, .66 - shade, (y - 18) * .012);
      if (look.kind === 'gown' && (x * 3 + y * 5) % 7 === 0 && y > 20)  // 환자복 잔무늬
        c = pick(ramp, ramp.indexOf(c) / ramp.length - .02);
      if (look.kind === 'pj' && (x - Math.round(l)) % 3 === 1)          // 세로 줄무늬
        c = pick(RAMP.pjLine, .7 - .3 * ((x - l) / (r - l)));
      if (y === 29) c = pick(ramp, .1);                                  // 단 아래 그늘
      return c;
    });
  if (dir === 'up' && look.kind === 'gown') {          // 등 — 벌어진 여밈과 끈 두 개
    part(B, false);
    for (let y = 20; y < 29; y++) put(B, CX, y, (y & 1) ? pick(RAMP.skin, .45) : pick(RAMP.gown, .15));
    put(B, CX - 1, 22, RAMP.gown[4]); put(B, CX + 1, 22, RAMP.gown[4]);
    put(B, CX - 1, 26, RAMP.gown[4]); put(B, CX + 1, 26, RAMP.gown[4]);
  }
  if (look.kind === 'pj' && dir === 'down') {           // 잠옷 깃 — 흰 파이핑
    part(B, false);
    for (let i = 0; i < 4; i++) { put(B, CX - 3 + i, 20 + i, RAMP.pjLine[2]); put(B, CX + 2 - i, 20 + i, RAMP.pjLine[1]); }
  }
}

/* 팔 — 소매에서 손까지. 걸음과 반대로 흔듭니다 */
function arms(B, dir, step, look) {
  const s = STRIDE[step];
  const sleeve = look.kind === 'pj' ? RAMP.pj : RAMP.gown;
  const long = look.kind === 'pj';
  const arm = (x, y0, lit, band) => {
    part(B, true, '#1a1418');
    for (let y = y0; y < y0 + 8; y++) for (let xx = 0; xx < 3; xx++) {
      const sl = long ? y < y0 + 6 : y < y0 + 3;
      const r = sl ? sleeve : RAMP.skin;
      if (y === y0 + 7 && xx !== 1) continue;               // 둥근 손끝
      put(B, x + xx, y, pick(r, lit - xx * .2 - (y - y0) * .02));
    }
    if (band) { part(B, false); put(B, x, y0 + 5, RAMP.band[1]); put(B, x + 1, y0 + 5, RAMP.band[1]); put(B, x + 2, y0 + 5, RAMP.band[0]); }
  };
  if (dir === 'down') {
    arm(7, 19 - s, .85, look.band);
    arm(20, 19 + s, .6, false);
  } else if (dir === 'up') {
    arm(7, 19 + s, .8, false);
    arm(20, 19 - s, .55, look.band);
  } else {
    arm(14 + s * 2 - (s > 0 ? 1 : 0), 19, .75, look.band);
  }
}

/* 머리 — 얼굴 · 머리카락 · 뇌파 캡 */
function head(B, dir, look) {
  const side = dir === 'left';
  const hx = side ? CX - .5 : CX, hy = 12, rx = side ? 9 : 9.5, ry = 8.8;
  part(B, true, '#2a1b1f');
  blob(B, hx, hy, rx, ry, RAMP.skin, { lift: .08 });
  if (side) put(B, Math.floor(hx - rx) - 0, 14, RAMP.skin[3]);       // 코끝

  // 머리카락 — 자다 깬 듯 삐친 머리
  const fringe = x => [0, 1.6, .6, 2.2, .3, 1.2][((x % 6) + 6) % 6];
  const inHair = (x, y) => {
    const dx = x + .5 - hx;
    if (dir === 'up') return y < 19;
    if (side) return y < 6.5 + fringe(x) * .7 || (dx > .5 + (y - 8) * .35 && y < 18);
    if (Math.abs(dx) > 7.4) return y < 15.5;
    return y < 7.2 + fringe(x) + Math.abs(dx) * .12;
  };
  part(B, false);
  blob(B, hx, hy - .2, rx + .3, ry + .3, RAMP.hair, { color: (x, y, I) => inHair(x, y) ? pick(RAMP.hair, I) : null });
  // 정수리에 삐친 머리 두 가닥
  put(B, hx + 1, 2, RAMP.hair[2]); put(B, hx + 2, 1, RAMP.hair[1]); put(B, hx - 3, 2, RAMP.hair[2]);

  // 뇌파 캡 — 정수리를 덮은 천 모자에 성긴 격자, 앞머리는 캡 아래로 삐져나옴
  if (look.cap === 'full') {
    const inCap = (x, y) => {
      const dx = x + .5 - hx;
      if (dir === 'up') return y < 15.5 - Math.abs(dx) * .1;
      if (side) return y < 6.6 || (dx > 1 + (y - 6) * .5 && y < 12);
      return y < 6.4 + Math.abs(dx) * .28;
    };
    part(B, false);
    blob(B, hx, hy - .4, rx + .6, ry + .5, RAMP.cap, {
      color: (x, y, I) => {
        if (!inCap(x, y)) return null;
        const grid = (x % 4 === 1) || (y % 4 === 3);
        return pick(RAMP.cap, I * .95 + .08 - (grid ? .28 : 0));
      }
    });
    if (dir === 'down') for (let y = 10; y < 16; y++) { put(B, 5, y, RAMP.cap[1]); put(B, 25, y, RAMP.cap[0]); }   // 턱끈
  }
  const dots = {
    down: [[9, 5, OB.B], [17, 3, OB.R], [21, 6, OB.Y], [13, 2, OB.W]],
    up:   [[9, 5, OB.B], [18, 4, OB.R], [7, 11, OB.Y], [21, 11, OB.W], [14, 9, OB.R]],
    left: [[9, 3, OB.B], [15, 4, OB.R], [19, 8, OB.Y], [14, 1, OB.W]]
  }[dir === 'right' ? 'left' : dir];
  if (look.cap === 'full' || look.cap === 'dots') {
    part(B, false);
    (look.cap === 'dots' ? dots.slice(0, 2) : dots).forEach(([x, y, c]) => {
      put(B, x, y, c); put(B, x + 1, y, c); put(B, x, y + 1, c); put(B, x + 1, y + 1, '#1b1a22');
      put(B, x, y, '#f4f0e6');                                            // 반짝
      if (look.cap === 'dots') { put(B, x - 1, y, RAMP.band[1]); put(B, x + 2, y + 1, RAMP.band[1]); }  // 의료 테이프
    });
  }
  // 뒤통수 커넥터 — 전극선이 여기서 나옵니다
  if (look.cables) {
    part(B, false);
    if (dir === 'up') { for (let x = 12; x < 18; x++) { put(B, x, 17, '#2a2f37'); put(B, x, 18, '#16191e'); } put(B, 12, 17, '#59636e'); }
    if (side) { put(B, 22, 15, '#2a2f37'); put(B, 23, 15, '#2a2f37'); put(B, 22, 16, '#16191e'); put(B, 23, 16, '#16191e'); }
  }
  // 얼굴 — 반쯤 감긴 졸린 눈, 눈 밑 그늘
  if (dir === 'down') face(B, [[10, 13], [18, 13]], [14, 17]);
  if (side) { face(B, [[8, 13]], [7, 17]); part(B, false); put(B, 16, 13, RAMP.skin[2]); put(B, 16, 14, RAMP.skin[1]); put(B, 17, 13, RAMP.skin[1]); }
}
function face(B, eyes, mouth) {
  part(B, false);
  eyes.forEach(([x, y]) => {
    put(B, x - 1, y - 1, LID); put(B, x, y - 1, LID); put(B, x + 1, y - 1, LID); put(B, x + 2, y - 1, LID);  // 무거운 눈꺼풀
    put(B, x, y, EYE); put(B, x + 1, y, EYE); put(B, x, y + 1, EYE); put(B, x + 1, y + 1, EYE);
    put(B, x + 1, y + 1, SHINE);
    put(B, x, y + 2, BAG); put(B, x + 1, y + 2, BAG);                                                       // 눈 밑 그늘
  });
  put(B, mouth[0], mouth[1], MOUTH); if (eyes.length > 1) put(B, mouth[0] + 1, mouth[1], MOUTH);
}

/* 병원 담요를 뒤집어쓴 모습 — 후드 · 망토 · 파란 줄 */
function blanketFigure(B, dir, step, look) {
  const side = dir === 'left', s = STRIDE[step];
  const bl = RAMP.blanket;
  const hx = side ? CX - .5 : CX, hy = 12;
  // 망토 몸통 — 발목까지, 단이 걸음 따라 살짝 흔들림
  part(B, true, '#2a2e33');
  rows(B, 14, 30, y => {
    const w = side ? 6.2 + (y - 14) * .1 : 8 + (y - 14) * .12;
    const sway = y > 26 ? s * .6 : 0;
    return [CX - w + sway + (side ? .5 : 0), CX + w + sway + (side ? .5 : 0)];
  }, (x, y, l, r) => {
    let c = cyl(bl, x, y, l, r, .7 - (y < 20 ? .12 : 0), (y - 14) * .01);
    if (y === 24 || y === 25) c = y === 24 ? '#3d7ec4' : OB.B;                    // 담요의 파란 줄
    if (!side && dir === 'down' && Math.abs(x + .5 - CX) < .6 && y > 21) c = pick(bl, .25);   // 여민 자리
    if (y === 30) c = pick(bl, .15);
    if ((x * 7 + y * 3) % 11 === 0 && y !== 24 && y !== 25) c = pick(bl, bl.indexOf(c) / bl.length - .05);  // 보풀
    return c;
  });
  // 후드
  part(B, true, '#2a2e33');
  blob(B, hx, hy, side ? 9.6 : 10.4, 9.8, bl, { lift: .1 });
  if (dir === 'up') {                                  // 뒤에서 본 후드 — 접힌 주름 한 줄
    part(B, false);
    for (let y = 5; y < 20; y++) put(B, CX + (y > 12 ? 1 : 0), y, pick(bl, .35));
  } else {
    // 얼굴이 드러난 구멍
    const fx = side ? hx - 4.2 : hx, frx = side ? 4.4 : 6.6;
    part(B, true, '#3a2a2c');
    blob(B, fx, 13.2, frx, 6, RAMP.skin, { lift: .05 });
    part(B, false);
    blob(B, fx, 13.2, frx, 6, RAMP.hair, { color: (x, y, I) => y < 9.4 + [0, 1, 0, 1.6, .4][(x % 5 + 5) % 5] ? pick(RAMP.hair, I) : null });
    // 후드 가장자리 접힌 테 — 밝게
    part(B, false);
    for (let a = 0; a < Math.PI * 2; a += .05) {
      const x = fx + Math.cos(a) * (frx + .9), y = 13.2 + Math.sin(a) * 6.9;
      if (y < 18.5) put(B, x, y, Math.sin(a) < 0 ? bl[4] : bl[3]);
    }
    if (dir === 'down') face(B, [[10, 13], [17, 13]], [14, 16]);
    else face(B, [[7, 13]], [6, 16]);
    // 담요를 여민 손 — 손목에 팔찌
    part(B, true, '#1a1418');
    const hxs = dir === 'down' ? [12, 16] : [9];
    hxs.forEach((x, k) => {
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 3; xx++) put(B, x + xx, 21 + yy + (k ? -s * .5 : s * .5), pick(RAMP.skin, .8 - xx * .15 - yy * .2));
    });
    if (look.band) { part(B, false); put(B, hxs[0], 23 + s * .5, RAMP.band[1]); put(B, hxs[0] + 1, 23 + s * .5, RAMP.band[1]); }
  }
  // 후드 아래로 삐져나온 전극 두 개 (이마 위)
  if (dir !== 'up') {
    part(B, false);
    const ex = side ? [[5, 8, OB.B]] : [[11, 8, OB.B], [17, 8, OB.R]];
    ex.forEach(([x, y, c]) => { put(B, x, y, c); put(B, x + 1, y, c); put(B, x, y, '#f4f0e6'); });
  }
}

/* ═════════════ 아바타 — 원래 노란 주인공과 사람이 섞인 모습 ═══════════
   게임 속 주인공은 뇌 시뮬레이션이 피험자 07 위에 씌운 '아바타'입니다.
   원래 그림(둥근 노란 머리 · 세로로 긴 검은 눈 · 짙은 갈색 외곽선 · 작은 몸)을
   그대로 따르고, 그 껍데기가 덜 씌워진 자리로 사람이 비칩니다.
     look.peel  0~1 — 노란 껍데기가 벗겨진 정도 (오른쪽부터, 옆모습은 얼굴 쪽부터)
     look.body  'yellow' 아바타 몸 · 'gown' 사람 몸 (환자복 · 맨팔 · 맨발)
     look.feet  'human' 이면 아바타 몸이어도 발만 맨발
   벗겨진 경계는 형광 청록 격자 — 텍스처가 덜 읽힌 자리 (실험실 장비의 색) */
const YEL = { fill: '#ffe92a', shade: '#e8c412', deep: '#c49a08', hi: '#fff7a6', line: '#1c0808' };
const SEAM = ['#00ffd5', '#063a34'];
const peelWob = y => Math.sin(y * 1.7) * 1.1 + (((y * 7) % 3) - 1) * .7;
function peeled(dir, peel, x, y) {
  if (peel <= 0) return false;
  if (dir === 'left') return x + .5 < 3.5 + peel * 21 + peelWob(y);
  return x + .5 > 26.5 - peel * 21 + peelWob(y);
}
function yellowFlat(nx, ny) {                      // 원래 그림처럼 거의 납작 — 오른쪽 아래 테만 어둡게
  const r = nx * .55 + ny * .7;
  return r > .86 ? YEL.deep : r > .7 ? YEL.shade : (nx < -.4 && ny < -.5 && nx > -.66 && ny > -.8) ? YEL.hi : YEL.fill;
}
function yellowBody(B, dir, step, look) {
  const s = STRIDE[step], side = dir === 'left';
  part(B, true, YEL.line);
  // 다리 두 토막 — 원래 그림의 짧은 다리
  const leg = (x, y, h) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < 3; xx++) put(B, x + xx, y + yy, xx === 2 || yy === h - 1 ? YEL.shade : YEL.fill); };
  if (look.feet !== 'human') {
    if (side) { leg(12 - s, 28, 4 + (s ? 0 : 0)); if (s) leg(14 + s, 27, 4); }
    else { leg(10, 28 + Math.max(0, s), 4 - (s < 0 ? 1 : 0)); leg(17, 28 + Math.max(0, -s), 4 - (s > 0 ? 1 : 0)); }
  }
  // 몸통
  part(B, true, YEL.line);
  const [l, r] = side ? [11.5, 19.5] : [9, 21];
  for (let y = 20; y < 29; y++) for (let x = l; x < r; x++)
    put(B, x, y, x >= r - 2 || y === 28 ? YEL.shade : YEL.fill);
  // 팔 토막 — 걸음과 반대로
  part(B, true, YEL.line);
  const nub = (x, y, band) => {
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (!(yy === 4 && xx !== 1)) put(B, x + xx, y + yy, xx === 2 ? YEL.shade : YEL.fill);
    if (band) { part(B, false); put(B, x, y + 3, RAMP.band[1]); put(B, x + 1, y + 3, RAMP.band[1]); put(B, x + 2, y + 3, RAMP.band[0]); part(B, true, YEL.line); }
  };
  if (side) nub(14 + s, 21, look.band);
  else { nub(6, 21 - s, dir === 'down' && look.band); nub(21, 21 + s, dir === 'up' && look.band); }
}
function avatarShell(B, dir, look) {
  const side = dir === 'left', peel = look.peel || 0;
  const hx = 15, hy = 11.6, rx = side ? 10.4 : 11, ry = 10;
  const inShell = (x, y) => { const nx = (x + .5 - hx) / rx, ny = (y + .5 - hy) / ry; return nx * nx + ny * ny <= 1; };
  part(B, true, YEL.line);
  for (let y = 0; y < 23; y++) for (let x = 0; x < FW; x++) {
    if (!inShell(x, y) || peeled(dir, peel, x, y)) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inShell(x + dx, y + dy) && peeled(dir, peel, x + dx, y + dy));
    put(B, x, y, edge ? SEAM[(x + y) & 1] : yellowFlat((x + .5 - hx) / rx, (y + .5 - hy) / ry));
  }
  // 세로로 긴 검은 눈 + 흰 반짝 (원래 그림 그대로)
  part(B, false);
  const eye = (x0, y0, w) => {
    for (let y = 0; y < 6; y++) for (let x = 0; x < w; x++) {
      if ((y === 0 || y === 5) && (x === 0 || x === w - 1)) continue;
      if (peeled(dir, peel, x0 + x, y0 + y) || !inShell(x0 + x, y0 + y)) continue;
      put(B, x0 + x, y0 + y, (x === 1 && (y === 1 || y === 2)) ? '#ffffff' : '#050404');
    }
  };
  if (dir === 'down') { eye(9, 8, 4); eye(17, 8, 4); }
  if (side) eye(5, 8, 3);
  // 탈처럼 쓴 경우 — 뒷모습 아래로 진짜 뒷머리가 삐져나옴
  if (dir === 'up' && look.body === 'gown') { part(B, false); [12, 13, 15, 16, 18].forEach((x, k) => put(B, x, 22 + (k & 1), RAMP.hair[1 + (k % 2)])); }
}
function avatarFigure(B, dir, step, look) {
  const human = { kind: 'gown', cap: 'full', band: look.band, cables: look.cables.length };
  if (look.body === 'gown') { feet(B, dir, step, human); torso(B, dir, human); if (dir !== 'left') arms(B, dir, step, human); }
  else { if (look.feet === 'human') feet(B, dir, step, human); yellowBody(B, dir, step, look); }
  if ((look.peel || 0) > 0) head(B, dir, human);               // 껍데기 밑의 진짜 얼굴
  avatarShell(B, dir, look);
  if (look.body === 'gown' && dir === 'left') arms(B, dir, step, human);
}

/* 한 장 */
function drawFrame(look, dir, step) {
  const B = newBuf();
  const d = dir === 'right' ? 'left' : dir;
  if (look.kind === 'avatar') avatarFigure(B, d, step, look);
  else feet(B, d, step, look);
  if (look.kind === 'avatar') {}
  else if (look.kind === 'blanket') blanketFigure(B, d, step, look);
  else {
    if (d === 'up') { torso(B, d, look); arms(B, d, step, look); head(B, d, look); }
    else if (d === 'left') { torso(B, d, look); head(B, d, look); arms(B, d, step, look); }
    else { torso(B, d, look); arms(B, d, step, look); head(B, d, look); }
  }
  let px = finish(B, look.kind === 'avatar' ? YEL.line : OUT);
  if (dir === 'right') {                                 // 좌우 뒤집기
    const f = new Array(N);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) f[y * FW + x] = px[y * FW + (FW - 1 - x)];
    px = f;
  }
  return px;
}

/* 시트 굽기 — 16칸 한 줄 */
function bakeSheet(look) {
  const cv = document.createElement('canvas');
  cv.width = FW * DIRS.length * STEPS; cv.height = FH;
  const c = cv.getContext('2d');
  const img = c.createImageData(cv.width, FH);
  DIRS.forEach((dir, di) => {
    for (let st = 0; st < STEPS; st++) {
      const px = drawFrame(look, dir, st), ox = (di * STEPS + st) * FW;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const v = px[y * FW + x]; if (!v) continue;
        const n = parseInt(v.slice(1), 16), i = (y * cv.width + ox + x) * 4;
        img.data[i] = n >> 16; img.data[i + 1] = (n >> 8) & 255; img.data[i + 2] = n & 255; img.data[i + 3] = 255;
      }
    }
  });
  c.putImageData(img, 0, 0);
  return cv;
}
const frameIndex = (dir, step) => DIRS.indexOf(dir) * STEPS + (step % STEPS);

/* ═════════════ 전극선 ═════════════════════════════════════════
   선마다 마디 몇 개를 줄로 잇고, 바닥 좌표(x, y)와 높이(z)를 따로 둡니다.
   화면에는 (x, y - z) 로 찍힙니다. 뒤통수에 매달려 늘어지다가 바닥에
   닿으면(z = 0) 마찰로 거의 멈추고, 주인공이 걸으면 끌려옵니다.          */
class CableRig {
  constructor(colors, opt = {}) {
    this.n = opt.nodes || 9;
    this.seg = opt.seg || 3.1;
    this.temple = opt.temple || 0;        // 있으면 뒤통수 대신 머리 양옆(관자놀이)에서 반씩 나옴
    this.cables = colors.map((c, k) => ({
      color: c, off: (k - (colors.length - 1) / 2) * (opt.spread || 1.7),
      seg: this.seg * (1 + ((k * 37) % 5) * .07),
      nodes: Array.from({ length: this.n }, () => ({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 })),
      placed: false
    }));
  }
  /* 매달린 자리 — 바닥 좌표 (fx, fy), 높이 z, 방향, 옆모습일 때 뒤통수까지 거리 */
  update(fx, fy, z, dir, back = 7) {
    const side = dir === 'left' ? 1 : dir === 'right' ? -1 : 0;
    this.cables.forEach((C, k) => {
      const half = k < this.cables.length / 2 ? -1 : 1;
      const ax = side ? fx + side * back : this.temple ? fx + half * (this.temple + (k % 2) * 1.2) : fx + C.off;
      const ay = fy - 1 + (side ? C.off * .4 : 0);
      // 방을 옮기는 등 순간이동하면 처음부터 다시 펼침 (화면을 가로지르는 줄 방지)
      if (C.placed && Math.hypot(ax - C.nodes[0].x, ay - C.nodes[0].y) > 40) C.placed = false;
      if (!C.placed) {                                  // 처음엔 뒤로 부채꼴로 펼쳐 둠
        C.nodes.forEach((p, i) => { const t = i / (this.n - 1);
          p.x = p.px = ax + C.off * t * 6; p.y = p.py = ay - t * 10; p.z = p.pz = Math.max(0, z - i * 3); });
        C.placed = true;
      }
      const N0 = C.nodes[0];
      N0.x = N0.px = ax; N0.y = N0.py = ay; N0.z = N0.pz = z;
      for (let i = 1; i < this.n; i++) {                // 관성 + 중력, 바닥에선 마찰
        const p = C.nodes[i];
        const fr = p.z <= .01 ? .55 : .96;
        const vx = (p.x - p.px) * fr, vy = (p.y - p.py) * fr, vz = (p.z - p.pz) * .96;
        p.px = p.x; p.py = p.y; p.pz = p.z;
        p.x += vx; p.y += vy; p.z += vz - .35;
        if (p.z < 0) p.z = 0;
      }
      // 매달린 마디는 등 뒤에만 — 몸을 뚫고 앞으로 넘어오지 않게
      const bv = dir === 'down' ? [0, -1] : dir === 'up' ? [0, 1] : dir === 'left' ? [1, 0] : [-1, 0];
      for (let i = 1; i < this.n; i++) {
        const p = C.nodes[i];
        if (p.z <= .5) continue;
        const d = (p.x - ax) * bv[0] + (p.y - ay) * bv[1];
        if (d < 0) { p.x -= bv[0] * d; p.y -= bv[1] * d; }
      }
      for (let it = 0; it < 6; it++)                     // 마디 길이 맞추기
        for (let i = 1; i < this.n; i++) {
          const a = C.nodes[i - 1], b = C.nodes[i];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          if (d <= C.seg) continue;                       // 줄은 늘어나지 않고 처지기만
          const k = (d - C.seg) / d;
          if (i === 1) { b.x -= dx * k; b.y -= dy * k; b.z -= dz * k; }
          else { a.x += dx * k * .5; a.y += dy * k * .5; a.z += dz * k * .5; b.x -= dx * k * .5; b.y -= dy * k * .5; b.z -= dz * k * .5; }
          if (b.z < 0) b.z = 0; if (a.z < 0) a.z = 0;
        }
    });
  }
  /* 선을 1px 로 — 외곽선을 먼저 깔고 색을 얹음. glow 면 빛이 번짐.
     keep(마디) 를 주면 그 마디만 — 주인공 앞/뒤를 나눠 그릴 때.
     vis[선 번호] 0~1 을 주면 선마다 진하기 — 0 이면 안 그림 (아직 안 생긴 선) */
  draw(g, glow = 0, t = 0, keep = null, vis = null) {
    const pts = C => {
      const out = [];
      for (let i = 1; i < this.n; i++) {
        const a = C.nodes[i - 1], b = C.nodes[i];
        if (keep && !keep(b)) continue;
        const ax = a.x, ay = a.y - a.z, bx = b.x, by = b.y - b.z;
        const len = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
        for (let s = 0; s < len; s++) out.push([Math.round(ax + (bx - ax) * s / len), Math.round(ay + (by - ay) * s / len), i]);
      }
      return out;
    };
    const all = this.cables.map((C, k) => [C, pts(C), vis ? vis[k] : 1]).filter(([, , v]) => v > 0);
    if (!all.length) return;
    g.save();
    const base = g.globalAlpha;
    g.fillStyle = OUT;
    all.forEach(([, P, v]) => { g.globalAlpha = base * v; P.forEach(([x, y]) => g.fillRect(x - 1, y, 3, 1) || g.fillRect(x, y - 1, 1, 3)); });
    all.forEach(([C, P, v]) => {
      g.globalAlpha = base * v;
      g.fillStyle = C.color;
      P.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
      g.fillStyle = '#05050a';                          // 끊긴 끝
      const e = P[P.length - 1]; if (e && e[2] === this.n - 1) g.fillRect(e[0], e[1], 1, 1);
    });
    if (glow > 0) {                                      // 심연 — 선을 따라 빛이 흘러감
      g.globalCompositeOperation = 'lighter';
      all.forEach(([C, P, v]) => P.forEach(([x, y], k) => {
        const pulse = .5 + .5 * Math.sin(t * .12 - k * .35);
        g.globalAlpha = base * v * glow * (.18 + .3 * pulse);
        g.fillStyle = C.color; g.fillRect(x - 1, y - 1, 3, 3);
      }));
    }
    g.restore();
  }
}

/* ═════════════ 원래 노란 주인공 + 글리치 (시안 G) ══════════════
   예전 주인공 그림(assets/hero.png, 원본 8프레임 56×66)을 시안과 같은 칸(30×36 · 방향마다 4장)으로 다시 굽기.
   게임처럼 가로 30px 로 줄이고(세로 35px), 발바닥이 34 줄에 오도록 한 줄 내림 */
function bakeOriginal(img, meta, plug) {
  const c = document.createElement('canvas'); c.width = FW * 16; c.height = FH;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  const h = Math.round(FW * meta.fh / meta.fw);
  ['down', 'up', 'left', 'right'].forEach((dir, di) => {
    for (let st = 0; st < 4; st++) {
      const seq = meta[dir], idx = seq[st % seq.length], ox = (di * 4 + st) * FW;
      x.drawImage(img, idx * meta.fw, 0, meta.fw, meta.fh, ox, 1, FW, h);
      if (!plug) continue;
      // 관자놀이 커넥터 — 전극선이 여기서 두 가닥씩 나옵니다 (짙은 몸체 · 밝은 윗면 · 청록 표시등)
      const R = (col, px, py, w, hh) => { x.fillStyle = col; x.fillRect(ox + px, py, w, hh); };
      const jack = (px, py) => { R('#1c0808', px - 1, py - 1, 5, 7); R('#2a2f37', px, py, 3, 5); R('#59636e', px, py, 3, 1); R('#00ffd5', px + 1, py + 2, 1, 1); };
      if (dir === 'down' || dir === 'up') { jack(1, 13); jack(26, 13); }
      if (dir === 'left') jack(14, 12);
      if (dir === 'right') jack(13, 12);
    }
  });
  return c;
}

/* 시트를 한 색으로 — 그림자(검정) · 색 분리 잔상(빨강 · 청록) */
const TINT = new WeakMap();
function tinted(sheet, color) {
  if (!TINT.has(sheet)) TINT.set(sheet, {});
  const m = TINT.get(sheet);
  if (!m[color]) {
    const c = document.createElement('canvas'); c.width = sheet.width; c.height = sheet.height;
    const x = c.getContext('2d'); x.drawImage(sheet, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    m[color] = c;
  }
  return m[color];
}

/* ═════════════ 글리치 ═════════════════════════════════════════
   시뮬레이션이 아바타를 놓치는 순간. 8~20프레임 동안 매 프레임 새로 깨집니다.
     · 몸이 2~6px 띠로 찢어져 좌우로 밀리고, 몇 띠는 빠짐
     · 띠마다 진짜 사람(시안 A)이 섞여 비치고, 가끔은 통째로 사람으로 바뀜
     · 빨강 · 청록으로 색이 갈라진 잔상
     · 몸을 가로지르는 찢긴 줄, 둘레에 흩어지는 깨진 픽셀 조각
   터지지 않을 땐 아주 가끔 띠 하나만 1~2px 튑니다.                       */
function glitchTick(st, G, reduce = false) {
  if (reduce || !G) return false;
  st.since = (st.since || 0) + 1;
  if (st.gl > 0) st.gl--;
  else if (Math.random() < G.rate || st.since > G.every) { st.gl = 8 + (Math.random() * 13 | 0); st.since = 0; }
  return st.gl > 0;
}
function drawGlitched(g, sheet, real, fi, sx, sy, power) {
  const R = Math.random;
  const swap = real && R() < .22 * power;                    // 통째로 사람
  const base = swap ? real : sheet;
  // 색 분리 잔상
  g.save(); g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .6 * power;
  g.drawImage(tinted(base, '#ff2050'), fi * FW, 0, FW, FH, sx - 2 - (R() * 3 | 0), sy, FW, FH);
  g.drawImage(tinted(base, '#00ffd5'), fi * FW, 0, FW, FH, sx + 2 + (R() * 3 | 0), sy + (R() < .3 ? 1 : 0), FW, FH);
  g.restore();
  // 찢긴 띠
  for (let y = 0; y < FH;) {
    const h = Math.min(FH - y, 2 + (R() * 5 | 0));
    const off = R() < .4 ? 0 : Math.round((R() - .5) * 12 * power);
    const src = swap ? real : (real && R() < .42 * power ? real : sheet);
    if (R() > .07 * power) g.drawImage(src, fi * FW, y, FW, h, sx + off, sy + y, FW, h);
    y += h;
  }
  // 찢긴 줄 · 깨진 조각
  const COL = ['#00ffd5', '#ffffff', '#ff2050', '#ffe92a'];
  for (let i = 0; i < 2 + power * 5; i++) {
    const len = 4 + R() * 30 * power, yy = sy + 2 + (R() * (FH - 4) | 0);
    g.globalAlpha = .45 + R() * .55; g.fillStyle = COL[R() * 4 | 0];
    g.fillRect(Math.round(sx + FW / 2 + (R() - .5) * FW - len / 2), yy, Math.round(len), 1);
  }
  for (let i = 0; i < power * 7; i++) {
    g.globalAlpha = .5 + R() * .5; g.fillStyle = COL[R() * 4 | 0];
    g.fillRect(Math.round(sx - 8 + R() * (FW + 16)), Math.round(sy + R() * FH), 1 + (R() * 3 | 0), 1 + (R() * 2 | 0));
  }
  g.globalAlpha = 1;
}

/* 시안 G — 지금 게임 주인공. 전극선은 관자놀이 커넥터에서 두 가닥씩 */
const ORIGINAL = {
  cables: [OB.B, OB.R, OB.Y, OB.W],
  rig: { temple: 11.5, nodes: 10 },
  glitch: { rate: .014, every: 170, power: 1 },     // 시안 페이지에서 보여 주는 가장 깊은 모습
  /* 깊이마다 — 내려갈수록 자주 깨지고, 전극선이 그제야 하나씩 생깁니다.
     rate 매 프레임 확률 · every 이만큼 조용하면 반드시 (프레임, 60 = 1초) · power 세기
     jacks 관자놀이 커넥터 · cables 늘 보이는 선 수 (양쪽 번갈아: 청 → 황 → 적 → 백)
     glow 늘 흐르는 빛. 아직 안 생긴 선도 깨지는 순간엔 유령처럼 비칩니다.  */
  depth: [
    { rate: .0008, every: 1e9, power: .5,  jacks: false, cables: 0, glow: 0 },    // 0 숲 — 약 20초에 한 번
    { rate: .0017, every: 900, power: .7,  jacks: true,  cables: 0, glow: 0 },    // 1 우물 아래 · 갈림길 — 약 10초
    { rate: .0028, every: 600, power: .85, jacks: true,  cables: 2, glow: 0 },    // 2 북쪽 · 남쪽 방 — 약 6초
    { rate: .004,  every: 360, power: 1,   jacks: true,  cables: 3, glow: 0 },    // 3 중앙 · 북동 통로 — 약 4초
    { rate: .0055, every: 240, power: 1,   jacks: true,  cables: 4, glow: 0 },    // 4 남동 통로 · 관문 — 약 3초
    { rate: .008,  every: 170, power: 1,   jacks: true,  cables: 4, glow: .15 },  // 5 심층 · 탈출구 — 약 2초
    { rate: .016,  every: 90,  power: 1,   jacks: true,  cables: 4, glow: .3 }    // 6 심연 (보스 마지막 페이즈) — 약 1초
  ],
  order: [0, 2, 1, 3]                                    // 선이 생기는 순서 — 왼쪽 청 · 오른쪽 황 · 왼쪽 적 · 오른쪽 백
};
/* 깊이 → 그 깊이의 모습. vis 는 선마다 진하기 (깨지는 동안엔 아직 없는 선도 반쯤) */
function originalStage(depth, burst) {
  const D = ORIGINAL.depth[Math.max(0, Math.min(ORIGINAL.depth.length - 1, depth | 0))];
  const vis = [0, 0, 0, 0];
  ORIGINAL.order.forEach((k, i) => { vis[k] = i < D.cables ? 1 : burst ? .55 : 0; });
  return { ...D, vis };
}

/* 시안 목록 — 게임에 옮길 땐 이 중 하나만 남깁니다 */
const LOOKS = {
  A:  { kind: 'gown', cap: 'full', band: true, cables: [OB.B, OB.R, OB.Y, OB.W] },
  B0: { kind: 'pj', cap: null, band: true, cables: [] },
  B1: { kind: 'pj', cap: 'dots', band: true, cables: [OB.B, OB.R] },
  B2: { kind: 'gown', cap: 'full', band: true, cables: [OB.B, OB.R, OB.Y, OB.W] },
  B3: { kind: 'gown', cap: 'full', band: true, cables: [OB.B, OB.R, OB.Y, OB.W], glow: 1 },
  C:  { kind: 'blanket', cap: null, band: true, cables: [OB.B, OB.R, OB.Y, OB.W] },

  /* 원래 노란 주인공을 살린 시안 — 시뮬레이션이 씌운 아바타와 진짜 사람이 섞임
     shadow : 그림자를 이 시안(사람)의 실루엣으로
     glitch : 글리치가 터지는 정도 — rate 매 프레임 확률 · every 이만큼 조용하면 반드시 ·
              power 0~1 세기 (띠 밀림 · 색 분리 · 사람이 섞여 비침 · 찢긴 줄)          */
  D:  { kind: 'avatar', peel: 0, body: 'yellow', band: false, cables: [OB.B, OB.R, OB.Y, OB.W], shadow: 'A', glitch: { rate: .012, every: 200, power: 1 } },
  E0: { kind: 'avatar', peel: 0, body: 'yellow', band: true, cables: [], glitch: { rate: .002, every: 1e9, power: .3 } },
  E1: { kind: 'avatar', peel: .24, body: 'yellow', feet: 'human', band: true, cables: [OB.B, OB.R], glitch: { rate: .005, every: 1e9, power: .45 } },
  E2: { kind: 'avatar', peel: .45, body: 'gown', band: true, cables: [OB.B, OB.R, OB.Y, OB.W], glitch: { rate: .01, every: 1e9, power: .65 } },
  E3: { kind: 'avatar', peel: .66, body: 'gown', band: true, cables: [OB.B, OB.R, OB.Y, OB.W], glitch: { rate: .03, every: 140, power: 1 }, glow: 1 },
  F:  { kind: 'avatar', peel: 0, body: 'gown', band: true, cables: [OB.B, OB.R, OB.Y, OB.W], glitch: { rate: .004, every: 1e9, power: .5 } }
};

window.HeroArt = { FW, FH, FEET_Y, DIRS, STEPS, LOOKS, OB, ORIGINAL, originalStage, bakeSheet, bakeOriginal, frameIndex, CableRig,
                   tinted, glitchTick, drawGlitched };
})();
