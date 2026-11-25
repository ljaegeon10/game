'use strict';
/* ═══════════════════════════════════════════════════════════
   bosspix.js — 「관측자」 도트 그림 (foepix.js 의 조각판 Slab 로)

   관측자는 눈알 괴물이 아니라 **감시 로봇** — 강철 구체 외피 한가운데 붉은 카메라 렌즈, 위로 뻗은 센서 안테나 둘,
   옆의 덧댄 장갑판과 방열구, 아래로 늘어진 케이블, 턱의 노란 경고 띠.
   그 껍데기 안에 든 것(심연의 눈)은 따로 한 장 — 변이 컷신에서 외피가 깨지면 드러남.

     BossPix.shell()  외피째 (96×87 — 예전 눈 그림과 같은 칸 · 가운데가 몸 한가운데)
     BossPix.core()   껍데기가 깨진 뒤의 맨 눈알 (같은 칸, 가운데 반지름 23)
   한 번 구워 두고 다시 씀. 쓰는 곳 : game.js drawBoss · drawEyeMorph
   ═══════════════════════════════════════════════════════════ */
(() => {
const { Slab, hex } = window.FoePix;
const R = (...h) => h.map(hex);
const INK = hex('#07080c');
const STEEL = R('#222932', '#48545f', '#8592a0', '#d5dde4', '#2b3856');       // 외피 — [그늘, 중간, 밝음, 가장 밝음, 되비친 빛]
const DARK = R('#0d1116', '#1a2028', '#333d48', '#5d6975');                   // 렌즈 테 · 방열구
const GLASS = R('#030405', '#080b10', '#121a24', '#2c3d50');
const RED = R('#4a0c10', '#9a1c1c', '#e0382c', '#ff8a6a');
const WARN = hex('#e3b23c'), RUST = hex('#6a4030'), WHITE = hex('#ffffff');
const W = 96, H = 87, CX = 48, CY = 45;

function shell() {
  const s = new Slab(W, H);
  // 아래로 늘어진 케이블 (몸 뒤) — 끝에 단자
  [[37, 68, 13, -1], [48, 70, 15, 0], [59, 68, 12, 1]].forEach(([x, y, len, sw]) => {
    let xx = x;
    for (let i = 0; i < len; i++) { xx = Math.round(x + Math.sin(i * .55) * 1.3 + sw * i * .18); s.set(xx, y + i, DARK[i % 4 === 3 ? 3 : 2], 1); s.set(xx + 1, y + i, DARK[0], 0); }
    s.rect(xx - 1, y + len, 4, 2, STEEL[1], 1); s.rect(xx - 1, y + len, 4, 1, STEEL[2], 2);
  });
  // 센서 안테나 둘 — 밑동이 굵고 끝에 붉은 등
  const mast = (x0, y0, x1, y1) => { const n = Math.abs(y1 - y0);
    for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = y0 + (y1 > y0 ? i : -i), wd = i < n * .45 ? 5 : 3;
      for (let k = 0; k < wd; k++) s.set(x + k, y, k === 0 ? STEEL[3] : k === wd - 1 ? STEEL[0] : STEEL[k === 1 ? 2 : 1], k === 0 ? 3 : k === wd - 1 ? 0 : 1);
      if (i % 5 === 4) for (let k = 0; k < wd; k++) s.set(x + k, y, STEEL[0], 0); }                                  // 마디
    s.rect(x1 - 1, y1 - 3, 5, 3, RED[1], 1); s.rect(x1, y1 - 3, 2, 1, RED[3], 3); s.rect(x1, y1 - 2, 3, 1, RED[2], 2); };
  mast(30, 24, 20, 5); mast(62, 24, 72, 5);
  // 옆 장갑판 + 방열구
  for (const sd of [-1, 1]) { const x = sd < 0 ? 10 : 79;
    s.rect(x, 34, 7, 22, STEEL[1], 1); s.rect(x, 34, 7, 2, STEEL[3], 3); s.rect(x, 54, 7, 2, STEEL[0], 0);
    s.rect(sd < 0 ? x : x + 6, 34, 1, 22, sd < 0 ? STEEL[2] : STEEL[0], sd < 0 ? 2 : 0);
    for (let y = 39; y <= 51; y += 3) s.rect(x + 1, y, 5, 1, DARK[0], 0);
    s.set(x + 1, 36, WARN, 2); s.set(x + 5, 36, WARN, 2); }
  // 몸통 — 강철 구체
  s.ell(CX, CY, 31, 29, STEEL, { th: [-.1, .36, .8] });
  // 판 이음매 — 세로 두 줄(둥글게) · 아래 가로 한 줄
  for (let y = CY - 29; y <= CY + 29; y++) { const dy = (y - CY) / 29, hw = 31 * Math.sqrt(Math.max(0, 1 - dy * dy));
    for (const k of [-.63, .63]) { const x = Math.round(CX + k * hw); s.over(x, y, STEEL[0], 0); if (k < 0) s.over(x + 1, y, STEEL[2]); } }
  for (let x = CX - 26; x <= CX + 26; x++) { s.over(x, CY + 20, STEEL[0], 0); s.over(x, CY + 21, STEEL[2]); }
  // 턱의 경고 띠
  for (let y = CY + 23; y <= CY + 26; y++) for (let x = CX - 13; x <= CX + 13; x++) s.over(x, y, ((x + y) >> 2) & 1 ? WARN : INK, ((x + y) >> 2) & 1 ? 2 : 0);
  // 렌즈 — 두꺼운 테 · 검은 유리 · 붉은 조리개
  s.ell(CX, CY, 19.5, 19.5, [DARK[1], DARK[2], DARK[3], STEEL[3]], { th: [-.15, .35, .82] });
  s.ell(CX, CY, 15.6, 15.6, GLASS, { th: [-.4, .5, .9] });
  s.ell(CX, CY, 9.6, 9.6, RED, { th: [-.3, .2, .72] });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .35; for (let r = 4; r <= 9.4; r += .5) s.over(Math.round(CX + Math.cos(a) * r), Math.round(CY + Math.sin(a) * r), RED[0], 0); }   // 조리개 날
  s.ell(CX, CY, 3.8, 3.8, [hex('#120204')]);
  s.rect(CX - 11, CY - 12, 3, 2, GLASS[3], 3); s.set(CX - 12, CY - 9, GLASS[3], 3); s.set(CX - 6, CY - 6, WHITE, 3);   // 유리에 맺힌 빛
  // 테를 무는 나사
  for (let i = 0; i < 10; i++) { const a = (i + .5) / 10 * Math.PI * 2, x = Math.round(CX + Math.cos(a) * 22.6), y = Math.round(CY + Math.sin(a) * 22.6); s.over(x, y, STEEL[3], 3); s.over(x + 1, y + 1, STEEL[0], 0); }
  // 긁힌 자국 · 녹물 · 표시등
  [[24, 30], [25, 31], [26, 32], [66, 26], [67, 27], [70, 58], [71, 59], [72, 60]].forEach(([x, y]) => s.over(x, y, STEEL[3], 3));
  [[29, 56], [29, 57], [29, 58], [30, 59], [68, 62], [68, 63], [61, 20], [61, 21]].forEach(([x, y]) => s.over(x, y, RUST, 0));
  s.rect(70, 33, 3, 2, hex('#1a0608'), 0); s.set(71, 33, RED[2], 2); s.rect(23, 38, 2, 2, hex('#7de3c8'), 2);
  return s.outline(INK, hex('#141a22')).canvas();
}

function core() {
  const s = new Slab(W, H), SC = R('#5a2030', '#b8726a', '#e8c2b0', '#fff0e0', '#6a2a50');
  s.ell(47, 43.5, 23, 23, SC);
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let v = 0; v < 11; v++) { let a = v / 11 * 6.283 + rnd() * .4, r = 22;                       // 핏줄 — 가장자리에서 안으로
    while (r > 11 + rnd() * 4) { s.over(Math.round(47 + Math.cos(a) * r), Math.round(43.5 + Math.sin(a) * r), RED[r > 17 ? 1 : 2]); r -= 1; a += (rnd() - .5) * .24; } }
  s.ell(47, 43.5, 10.8, 10.8, R('#3a060a', '#8f1414', '#d8302a', '#ff7a5a'), { th: [-.3, .2, .75] });
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; for (let r = 5; r <= 10; r += 1) if ((r + i) % 3) s.over(Math.round(47 + Math.cos(a) * r), Math.round(43.5 + Math.sin(a) * r), hex('#6a0c10'), 0); }
  s.ell(47, 43.5, 2.7, 8.2, [hex('#0a0204')]);
  s.rect(41, 36, 3, 2, WHITE, 3); s.set(44, 39, WHITE, 3);
  return s.outline(hex('#2a0a10'), hex('#4a1016')).canvas();
}

let SH = null, CO = null;
window.BossPix = { W, H, CX, CY, shell: () => SH || (SH = shell()), core: () => CO || (CO = core()),
  METAL: ['#222932', '#48545f', '#8592a0', '#d5dde4', '#333d48'] };
})();
