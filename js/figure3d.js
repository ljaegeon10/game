'use strict';
/* ═══════════════════════════════════════════════════════════════
   figure3d.js — 연구소 사람들, 진짜 3D (WebGL)

   탈출에서 쫓아오는 방호복의 박사와 앞을 막는 경비원을 화면 해상도 그대로
   입체로 그립니다. 픽셀 복도 위에 사람만 실제 조명으로 얹는 방식입니다.

     방호복 : 바랜 카키 노랑 원단 — 소매 · 바짓단은 아코디언처럼 접히고, 접힌
              골짜기는 어둡게. 후드 속 새까만 보호면에는 복도 형광등이 비스듬히
              비칩니다. 청회색 고무 장갑 · 장화(광택), 손목 · 발목 회색 밀봉 테이프,
              가슴의 바이오해저드 패치 · B-07 출입증, 허리의 공기 호스 연결구와
              끊어진 노란 코일 호스.
     경비원 : 원래 디자인 그대로 — 청회색 제복(어깨 덧댐 · 황흑 경고 완장 · 출입증),
              짙은 바지 · 군화, 모자와 챙 아래 바이저(평소 청록, 겨누면 붉게), 권총.

   몸은 마디(몸통 · 위팔 · 아래팔 · 넓적다리 · 정강이)마다 따로 만든 메시를 관절
   행렬로 움직입니다. 원단의 잔주름은 셰이더의 잡음으로, 큰 주름은 모양 자체로.

   쓰는 곳 : escape.js (추격자 · 경비원), game.js (오프닝의 들여다보는 후드)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const L3 = window.Lab3D;
if (!L3) return;
const { Mesh, hex } = L3;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const PI = Math.PI, TAU = PI * 2;

/* ── 4×4 행렬 (열 우선) ── */
const M4 = {
  I: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  T: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  RX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  RY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  RZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  chain(...ms) { return ms.reduce((a, b) => M4.mul(a, b)); }
};

/* ── 재질 번호 (꼭짓점의 마지막 값) ──
   0 방호복 원단 · 1 스스로 빛남 · 2+s 광택(고무 · 플라스틱 · 금속) · 3 보호면 유리
   4 제복 천 · 5 피부 · 6 바이저(색은 매 프레임 uniform) */
const MAT = { suit: 0, glow: 1, gloss: s => 2 + s, visor: 3, cloth: 4, skin: 5, band: 6 };

/* ── 색 ── */
const C = {
  suit: hex('#beac60'), suitD: hex('#8c7e46'), rubber: hex('#262d3a'), tape: hex('#8e98a4'), gasket: hex('#2a303c'),
  hose: hex('#c89a3c'), plate: hex('#2a3140'), black: hex('#16191f'),
  uni: hex('#3a485e'), uniL: hex('#55657d'), pants: hex('#1e2430'), boot: hex('#121418'), skin: hex('#c49a84'),
  cap: hex('#1a1f28'), metal: hex('#5b6674'), gun: hex('#22252b'), yel: hex('#d8a83c')
};

/* ── 격자 곡면 — fn(u, v) → [점, 색]. u 길이 방향(0‥1), v 둘레(0‥1, 닫힘) ── */
function surf(m, rows, cols, fn, code, uvFn) {
  const P = [], K = [];
  for (let i = 0; i <= rows; i++) { P.push([]); K.push([]); for (let j = 0; j <= cols; j++) { const [p, c] = fn(i / rows, j / cols); P[i].push(p); K[i].push(c); } }
  const N = P.map((row, i) => row.map((p, j) => {
    const du = sub(P[Math.min(rows, i + 1)][j], P[Math.max(0, i - 1)][j]);
    const jn = j === cols ? 1 : j + 1, jp = j === 0 ? cols - 1 : j - 1;
    const dv = sub(P[i][jn], P[i][jp]);
    return norm(cross(dv, du));
  }));
  const V = (i, j) => { const p = P[i][j], n = N[i][j], c = K[i][j], uv = uvFn ? uvFn(i / rows, j / cols) : [-1, -1];
    m.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], uv[0], uv[1], code); };
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { V(i, j); V(i + 1, j); V(i + 1, j + 1); V(i, j); V(i + 1, j + 1); V(i, j + 1); }
}
/* 관 — 마디의 아래(−y)로 뻗는 타원 단면. prof(u) → { y, a, b, x?, z? }, fold(u, θ) → 반지름 증감 (주름) */
function tube(m, rows, cols, prof, fold, col, code, aoK = 4) {
  surf(m, rows, cols, (u, v) => {
    const th = v * TAU, q = prof(u), f = fold ? fold(u, th) : 0, k = 1 + f;
    const p = [(q.x || 0) + Math.cos(th) * q.a * k, q.y, (q.z || 0) + Math.sin(th) * q.b * k];
    const ao = clamp01(1 + f * aoK);
    return [p, mul(q.col || col, .5 + .5 * ao)];
  }, code);
}
/* 날카로운 주름 — 넓은 둔덕 사이로 좁게 꺾여 들어가는 골 */
const crease = x => .6 - Math.pow(Math.abs(Math.sin(x)), .35) * 1.2;
/* 표의 값 사이를 부드럽게 — tab : [[u, ...값]] */
const curve = (tab, u) => {
  let i = 0; while (i < tab.length - 2 && u > tab[i + 1][0]) i++;
  const a = tab[i], b = tab[i + 1], k = clamp01((u - a[0]) / (b[0] - a[0])), e = k * k * (3 - 2 * k);
  return a.map((v, n) => lerp(v, b[n], e));
};
/* 타원 고리 (보호면 고무 테두리 같은) — 가운데 c, 반지름 ax · ay (xy 평면), 굵기 r */
function ring(m, c, ax, ay, r, col, code, tilt = 0) {
  surf(m, 40, 8, (u, v) => {
    const th = u * TAU, ph = v * TAU, d = [Math.cos(th), Math.sin(th), 0];
    const base = [c[0] + d[0] * ax, c[1] + d[1] * ay, c[2] - Math.sin(th) * tilt];
    return [add(base, add(mul(d, Math.cos(ph) * r), [0, 0, Math.sin(ph) * r])), col];
  }, code);
}

/* ═════════════ 방호복 ═════════════════════════════════════ */
/* 몸통 원점 = 골반 가운데(땅에서 .94m), 앞은 +z */
function buildSuit() {
  const P = {};
  // ── 몸통 — 엉덩이에서 어깨까지, 세로로 늘어진 큰 주름 · 벨트 아래위로 부푼 자락
  const torso = new Mesh();
  const TT = [[0, -.14, .13, .1], [.08, -.08, .18, .13], [.2, 0, .2, .145], [.3, .05, .19, .138], [.42, .13, .186, .132],
              [.58, .24, .205, .143], [.74, .34, .218, .15], [.86, .42, .222, .148], [.94, .47, .19, .135], [1, .52, .14, .11]];
  tube(torso, 44, 52, u => { const [, y, a, b] = curve(TT, u); return { y, a, b, z: .005 }; },
    (u, th) => {
      const belt = Math.exp(-Math.pow((u - .3) / .05, 2));
      return .032 * crease(th * 3.5 + u * 5 + Math.sin(th * 3) * 1.5) * Math.sin(u * PI) + .016 * crease(th * 2 - u * 2 + 1.3)
           - .03 * belt + .02 * Math.exp(-Math.pow((u - .38) / .05, 2)) + .02 * Math.exp(-Math.pow((u - .22) / .05, 2));
    }, C.suit, MAT.suit);
  torso.ellipsoid([0, -.1, .005], [.16, 0, 0], [0, .08, 0], [0, 0, .11], C.suitD, 16, 10, { m: MAT.suit });
  // 어깨 — 부푼 원단
  for (const sx of [-1, 1]) torso.ellipsoid([sx * .195, .44, 0], [.105, 0, 0], [0, .09, 0], [0, 0, .105], C.suit, 16, 12, { m: MAT.suit });
  // 후드 — 어깨까지 덮어 흘러내리는 두건, 머리 둘레는 둥글게, 정수리는 살짝 뾰족
  const HT = [[0, .38, .205, .178], [.12, .46, .185, .17], [.25, .55, .158, .155], [.38, .63, .162, .152], [.55, .73, .158, .15],
              [.72, .82, .135, .142], [.86, .88, .095, .1], [.95, .915, .045, .05], [1, .925, .004, .004]];
  tube(torso, 46, 56, u => { const [, y, a, b] = curve(HT, u); return { y, a, b, z: .012 }; },
    (u, th) => .016 * crease(th * 2.5 + u * 2) * Math.sin(u * PI) + .04 * Math.exp(-Math.pow((u - .2) / .08, 2)) * crease(th * 4.5 + Math.sin(th * 2) * 2)
             + .008 * Math.sin(th * 3 - u * 5)
             - .012 * Math.exp(-Math.pow((u - .25) / .04, 2)), C.suit, MAT.suit);
  // 보호면 — 후드 앞으로 살짝 튀어나온 새까만 유리, 둘레 고무 테두리 (얼굴은 보이지 않음)
  torso.ellipsoid([0, .725, .1], [.1, 0, 0], [0, .122, 0], [0, 0, .118], hex('#07090c'), 28, 20, { m: MAT.visor });
  ring(torso, [0, .725, .166], .09, .109, .013, C.gasket, MAT.gloss(.35), .008);
  // 앞 지퍼 덮개 — 목에서 가랑이까지 (테이프 붙인 이음선)
  const zip = []; for (let i = 0; i <= 16; i++) { const u = i / 16, [, y, , b] = curve(TT, lerp(.94, .05, u)); zip.push([0, y, b + .012]); }
  torso.tube(zip, .009, C.suitD, 6, { m: MAT.suit });
  torso.tube(zip.map(p => add(p, [.016, 0, -.002])), .004, C.tape, 5, { m: MAT.gloss(.2) });
  // 벨트 · 버클 · 파우치 · 공기 호스 연결구
  tube(torso, 2, 36, u => ({ y: lerp(.075, .025, u), a: .2, b: .146, z: .005 }), null, C.black, MAT.gloss(.35));
  torso.rbox(-.035, .035, .03, .07, .14, .158, C.metal, .006, { m: MAT.gloss(.8) });
  torso.rbox(.13, .225, -.06, .06, .06, .135, C.black, .02, { m: MAT.gloss(.25) });
  torso.rbox(.135, .22, .02, .055, .095, .14, hex('#20242c'), .012, { m: MAT.gloss(.25) });
  torso.lathe([-.2, 0, .075], [-1, -.25, .3], [[.03, 0], [.03, .025], [.022, .035], [.022, .06], [.026, .065], [.026, .08]], hex('#46505e'), 14, { m: MAT.gloss(.6) });
  // 끊어진 노란 코일 호스 — 연결구에서 다리를 따라 늘어짐
  const coil = []; for (let i = 0; i <= 220; i++) { const u = i / 220, th = u * TAU * 11;
    coil.push([-.245 - u * .05 + Math.cos(th) * .032, -.02 - u * .52, .1 - u * .04 + Math.sin(th) * .032]); }
  torso.tube(coil, .0085, C.hose, 6, { m: MAT.gloss(.45) });
  torso.lathe(coil[coil.length - 1], [0, -1, 0], [[.011, 0], [.011, .02], [.006, .022, hex('#111')], [0, .022, hex('#111')]], hex('#3a3f48'), 8, { m: MAT.gloss(.5) });
  // 가슴 — 청회색 패치(바이오해저드) · 출입증과 집게
  torso.rbox(-.06, .06, .2, .32, .143, .153, C.plate, .008, { m: MAT.cloth });
  torso.quad([-.052, .312, .1545], [.052, .312, .1545], [.052, .208, .1545], [-.052, .208, .1545], [1, 1, 1], { m: MAT.gloss(.1), uv: UV.bio });
  torso.rbox(.085, .17, .27, .325, .147, .152, hex('#e2e6e9'), .004, { m: MAT.gloss(.5) });
  torso.quad([.087, .323, .1525], [.168, .323, .1525], [.168, .272, .1525], [.087, .272, .1525], [1, 1, 1], { m: MAT.gloss(.5), uv: UV.card });
  torso.rbox(.118, .137, .32, .345, .146, .156, C.metal, .003, { m: MAT.gloss(.8) });
  P.torso = torso;

  // ── 위팔 · 아래팔 · 장갑 (오른팔 기준 +x, side = ±1)
  for (const side of [-1, 1]) {
    const ua = new Mesh();
    tube(ua, 32, 32, u => ({ y: -u * .31, a: lerp(.085, .07, u), b: lerp(.08, .066, u) }),
      (u, th) => .055 * Math.pow(Math.sin(u * PI * 5 + .6 * Math.sin(th * 2)), 2) - .03 + .012 * Math.sin(th * 4 + u * 13), C.suit, MAT.suit);
    ua.ellipsoid([0, -.305, 0], [.07, 0, 0], [0, .065, 0], [0, 0, .072], C.suit, 14, 10, { m: MAT.suit });
    P['ua' + side] = ua;
    const fa = new Mesh();
    tube(fa, 26, 32, u => ({ y: -u * .23, a: lerp(.07, .058, u), b: lerp(.068, .056, u) }),
      (u, th) => .05 * Math.pow(Math.sin(u * PI * 4 + .5 * Math.sin(th * 3)), 2) - .028 + .01 * Math.sin(th * 5 + u * 9), C.suit, MAT.suit);
    fa.torus([0, -.212, 0], [0, 1, 0], .058, .013, C.tape, 22, 8, { m: MAT.gloss(.3) });
    fa.lathe([0, -.2, 0], [0, -1, 0], [[.054, 0], [.056, .012], [.05, .05], [.046, .06]], C.rubber, 18, { m: MAT.gloss(.55) });
    P['fa' + side] = fa;
    // 장갑 손 — 손바닥 · 손가락 넷 · 엄지 (손목 원점, 아래로)
    for (const open of [0, 1]) {
      const h = new Mesh(), g = C.rubber, o = { m: MAT.gloss(.6) };
      h.ellipsoid([0, -.052, .004], [.023, 0, 0], [0, .05, 0], [0, 0, .041], g, 14, 10, o);
      for (let f = 0; f < 4; f++) {
        const z0 = -.027 + f * .018, spread = open ? (f - 1.5) * .12 : (f - 1.5) * .03, lenF = [.066, .074, .07, .056][f];
        const pts = []; let p = [0, -.1, z0], d = norm([0, -1, spread]);
        for (let k = 0; k <= 3; k++) { pts.push(p); const curl = open ? .12 : .42; d = norm(add(d, [-side * curl * .5, 0, 0])); p = add(p, mul(d, lenF / 3)); }
        h.tube(pts, .0086 - f * .0005, g, 8, { ...o, joints: true }); h.sphere(pts[pts.length - 1], .0078, g, 8, o);
      }
      const tp = []; let tp0 = [-side * .015, -.045, .04], td = norm([-side * .5, -.6, .6]);
      for (let k = 0; k <= 2; k++) { tp.push(tp0); td = norm(add(td, [-side * .2 * (open ? .3 : 1), -.1, 0])); tp0 = add(tp0, mul(td, .025)); }
      h.tube(tp, .0098, g, 8, { ...o, joints: true }); h.sphere(tp[tp.length - 1], .009, g, 8, o);
      P['hand' + side + open] = h;
    }
  }
  // ── 넓적다리 · 정강이 · 장화
  for (const side of [-1, 1]) {
    const th = new Mesh();
    tube(th, 34, 34, u => ({ y: -u * .46, a: lerp(.11, .092, u), b: lerp(.105, .088, u), col: mul(C.suit, 1 - u * .1) }),
      (u, t) => .04 * crease(t * 1.5 + u * 6 + side) + .018 * Math.sin(t * 6 - u * 20) + .03 * Math.pow(Math.sin(u * 15 + t), 2) * u - .012, C.suit, MAT.suit);
    th.ellipsoid([0, -.455, .01], [.09, 0, 0], [0, .075, 0], [0, 0, .096], C.suit, 14, 10, { m: MAT.suit });
    P['th' + side] = th;
    const sh = new Mesh();
    tube(sh, 26, 34, u => ({ y: -u * .25, a: lerp(.092, .08, u), b: lerp(.09, .078, u), col: mul(C.suit, .9 - u * .18) }),
      (u, t) => .055 * Math.pow(Math.sin(u * PI * 3.5 + .5 * Math.sin(t * 2)), 2) * u - .02 + .015 * Math.sin(t * 4 + u * 9), C.suit, MAT.suit);
    sh.torus([0, -.245, 0], [0, 1, 0], .073, .014, C.tape, 22, 8, { m: MAT.gloss(.3) });
    sh.lathe([0, -.235, 0], [0, -1, 0], [[.07, 0], [.072, .02], [.066, .15], [.064, .18]], C.rubber, 20, { m: MAT.gloss(.55) });
    sh.ellipsoid([0, -.39, .045], [.062, 0, 0], [0, .042, 0], [0, 0, .12], C.rubber, 18, 10, { m: MAT.gloss(.55) });
    sh.rbox(-.064, .064, -.437, -.405, -.075, .17, hex('#0c0e12'), .015, { m: MAT.gloss(.15) });
    P['sh' + side] = sh;
  }
  return P;
}

/* ═════════════ 경비원 — 원래 디자인 그대로 ═══════════════════════ */
function buildGuard() {
  const P = {};
  const torso = new Mesh();
  // 제복 윗옷 — 허리에서 어깨, 잔주름
  const TT = [[0, -.1, .15, .11], [.2, 0, .168, .118], [.35, .07, .165, .115], [.6, .25, .19, .125], [.82, .4, .2, .125], [.93, .46, .17, .115], [1, .5, .07, .065]];
  tube(torso, 26, 32, u => { const [, y, a, b] = curve(TT, u); return { y, a, b }; },
    (u, th) => .012 * Math.sin(th * 6 + u * 9) * Math.sin(u * PI) + .006 * Math.sin(u * 30 + th), C.uni, MAT.cloth, 9);
  torso.ellipsoid([0, -.08, 0], [.15, 0, 0], [0, .08, 0], [0, 0, .11], C.pants, 14, 8, { m: MAT.cloth });
  for (const sx of [-1, 1]) {
    torso.ellipsoid([sx * .18, .44, 0], [.085, 0, 0], [0, .06, 0], [0, 0, .085], C.uniL, 14, 8, { m: MAT.cloth });       // 어깨 덧댐
    torso.rbox(sx * .17 - .05, sx * .17 + .05, .47, .49, -.04, .04, C.uniL, .008, { m: MAT.cloth });                       // 견장
  }
  // 깃 · 앞섶 단추 · 가슴 주머니 · 출입증
  tube(torso, 3, 24, u => ({ y: lerp(.5, .56, u), a: lerp(.075, .065, u), b: lerp(.072, .062, u), z: .005 }), null, C.uni, MAT.cloth);
  for (let i = 0; i < 5; i++) torso.sphere([0, .38 - i * .085, .128 - Math.abs(i - 2) * .003], .008, C.metal, 8, { m: MAT.gloss(.8) });
  for (const sx of [-1, 1]) torso.rbox(sx * .09 - .045, sx * .09 + .045, .25, .33, .118, .132, C.uni, .01, { m: MAT.cloth });
  torso.rbox(.05, .135, .27, .33, .133, .138, hex('#e2e6e9'), .004, { m: MAT.gloss(.5) });
  torso.quad([.052, .328, .1385], [.133, .328, .1385], [.133, .272, .1385], [.052, .272, .1385], [1, 1, 1], { m: MAT.gloss(.5), uv: UV.card });
  // 벨트 · 버클 · 권총집
  tube(torso, 2, 32, u => ({ y: lerp(.075, .03, u), a: .172, b: .122 }), null, C.black, MAT.gloss(.4));
  torso.rbox(-.03, .03, .033, .072, .118, .13, C.metal, .005, { m: MAT.gloss(.85) });
  torso.rbox(.15, .21, -.08, .07, -.02, .07, C.black, .015, { m: MAT.gloss(.35) });
  // 목 · 머리(피부) · 귀 · 코 · 턱
  torso.lathe([0, .52, .005], [0, 1, 0], [[.052, 0], [.05, .1]], C.skin, 16, { m: MAT.skin });
  torso.ellipsoid([0, .7, .01], [.085, 0, 0], [0, .11, 0], [0, 0, .1], C.skin, 22, 16, { m: MAT.skin });
  torso.ellipsoid([0, .64, .04], [.07, 0, 0], [0, .05, 0], [0, 0, .07], C.skin, 16, 10, { m: MAT.skin });
  torso.ellipsoid([0, .69, .108], [.014, 0, 0], [0, .025, 0], [0, 0, .016], C.skin, 10, 8, { m: MAT.skin });
  for (const sx of [-1, 1]) torso.ellipsoid([sx * .085, .695, -.005], [.012, 0, 0], [0, .026, 0], [0, 0, .018], C.skin, 8, 6, { m: MAT.skin });
  torso.ellipsoid([0, .618, .075], [.03, 0, 0], [0, .006, 0], [0, 0, .01], hex('#7a5448'), 10, 4, { m: MAT.skin });
  // 모자 아래로 보이는 짧은 머리 · 구레나룻
  torso.ellipsoid([0, .735, -.012], [.09, 0, 0], [0, .06, 0], [0, 0, .1], hex('#2a2018'), 18, 10, { m: MAT.cloth });
  for (const sx of [-1, 1]) torso.ellipsoid([sx * .082, .71, .02], [.01, 0, 0], [0, .03, 0], [0, 0, .02], hex('#2a2018'), 8, 6, { m: MAT.cloth });
  // 바이저 — 눈높이를 감싸는 띠 (색은 매 프레임)
  surf(torso, 2, 24, (u, v) => { const th = lerp(-1.25, 1.25, v), y = lerp(.725, .69, u), r = .093;
    return [[Math.sin(th) * r, y, .012 + Math.cos(th) * r * 1.06], [1, 1, 1]]; }, MAT.band);
  // 모자 — 둥근 정수리 · 띠 · 챙
  torso.lathe([0, .74, .0], [0, 1, 0], [[.098, 0], [.098, .03], [.094, .07], [.07, .1], [.03, .112], [0, .114]], C.cap, 24, { m: MAT.cloth });
  tube(torso, 1, 24, u => ({ y: lerp(.745, .77, u), a: .1, b: .1 }), null, hex('#0f1218'), MAT.gloss(.3));
  torso.ellipsoid([0, .748, .1], [.1, 0, 0], [0, .009, 0], [0, 0, .075], C.cap, 18, 6, { m: MAT.gloss(.3) });
  torso.rbox(-.022, .022, .79, .82, .088, .1, C.yel, .005, { m: MAT.gloss(.7) });
  P.torso = torso;
  for (const side of [-1, 1]) {
    const ua = new Mesh();
    tube(ua, 16, 22, u => ({ y: -u * .3, a: lerp(.062, .052, u), b: lerp(.06, .05, u) }),
      (u, th) => .012 * Math.sin(th * 3 + u * 14) + .008 * Math.sin(u * 30), C.uni, MAT.cloth, 9);
    if (side < 0) surf(ua, 3, 28, (u, v) => { const th = v * TAU, y = lerp(-.06, -.12, u);
      return [[Math.cos(th) * .066, y, Math.sin(th) * .064], (Math.floor(v * 14 + u * 2) % 2) ? C.black : C.yel]; }, MAT.cloth);
    ua.ellipsoid([0, -.3, 0], [.054, 0, 0], [0, .05, 0], [0, 0, .054], C.uni, 12, 8, { m: MAT.cloth });
    P['ua' + side] = ua;
    const fa = new Mesh();
    tube(fa, 14, 22, u => ({ y: -u * .25, a: lerp(.052, .044, u), b: lerp(.05, .042, u) }),
      (u, th) => .01 * Math.sin(th * 4 + u * 12), C.uni, MAT.cloth, 9);
    fa.lathe([0, -.235, 0], [0, -1, 0], [[.046, 0], [.046, .02]], C.uniL, 16, { m: MAT.cloth });
    P['fa' + side] = fa;
    for (const open of [0, 1]) {
      const h = new Mesh(), o = { m: MAT.gloss(.35) }, g = C.black;     // 전술 장갑
      h.ellipsoid([0, -.05, .004], [.024, 0, 0], [0, .05, 0], [0, 0, .042], g, 12, 8, o);
      for (let f = 0; f < 4; f++) { const z0 = -.027 + f * .018, pts = []; let p = [0, -.09, z0], d = [0, -1, 0];
        for (let k = 0; k <= 3; k++) { pts.push(p); d = norm(add(d, [-side * .25, 0, 0])); p = add(p, mul(d, .022)); }
        h.tube(pts, .0095, g, 6, { ...o, joints: true }); }
      h.tube([[-side * .012, -.04, .036], [-side * .03, -.065, .05], [-side * .04, -.085, .05]], .011, g, 6, { ...o, joints: true });
      P['hand' + side + open] = h;
    }
  }
  for (const side of [-1, 1]) {
    const th = new Mesh();
    tube(th, 16, 22, u => ({ y: -u * .46, a: lerp(.085, .068, u), b: lerp(.082, .066, u) }),
      (u, t) => .012 * Math.sin(t * 3 + u * 10) + .006 * Math.sin(u * 26), C.pants, MAT.cloth, 9);
    P['th' + side] = th;
    const sh = new Mesh();
    tube(sh, 14, 22, u => ({ y: -u * .24, a: lerp(.068, .06, u), b: lerp(.066, .058, u) }),
      (u, t) => .012 * Math.sin(t * 2 + u * 9) + .02 * Math.pow(Math.sin(u * 9), 2) * u, C.pants, MAT.cloth, 9);
    sh.lathe([0, -.22, 0], [0, -1, 0], [[.062, 0], [.064, .02], [.06, .17], [.058, .19]], C.boot, 18, { m: MAT.gloss(.6) });
    sh.ellipsoid([0, -.385, .04], [.058, 0, 0], [0, .04, 0], [0, 0, .115], C.boot, 16, 8, { m: MAT.gloss(.6) });
    sh.rbox(-.06, .06, -.432, -.405, -.07, .16, hex('#08090b'), .012, { m: MAT.gloss(.15) });
    P['sh' + side] = sh;
  }
  // 권총 — 오른손에 (손목 원점, 총구는 손가락 방향)
  const gun = new Mesh(), go = { m: MAT.gloss(.7) };
  gun.rbox(-.016, .016, -.12, -.03, -.03, .02, C.gun, .006, go);          // 손잡이
  gun.rbox(-.017, .017, -.13, -.1, .02, .17, C.gun, .006, go);            // 몸통 · 슬라이드 (손가락 방향 +z 로 놓은 뒤 돌림)
  gun.cyl([0, -.115, .17], [0, -.115, .18], .006, .006, hex('#050505'), 8, true);
  P.gun = gun;
  return P;
}

/* ═════════════ 그늘 굽기 — 몸을 캡슐 몇 개로 어림해, 서로 가리는 만큼 꼭짓점 색을 어둡게 ═════════════
   rest : 마디 이름 → 차렷 자세에서의 위치(몸통 기준), caps : [[a, b, r]] */
function bakeAO(parts, rest, caps) {
  const near = (p, a, b) => { const ab = sub(b, a), t = clamp01(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / Math.max(1e-6, ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2])); return add(a, mul(ab, t)); };
  for (const key in parts) {
    const off = rest(key); if (!off) continue;
    const v = parts[key].v;
    for (let i = 0; i < v.length; i += 12) {
      const p = [v[i] + off[0], v[i + 1] + off[1], v[i + 2] + off[2]];
      let n = [v[i + 3], v[i + 4], v[i + 5]];
      // 바깥을 보게 — 가장 가까운 캡슐 축에서 멀어지는 쪽
      let best = null, bd = 1e9;
      for (const [a, b] of caps) { const q = near(p, a, b), d = len(sub(p, q)); if (d < bd) { bd = d; best = q; } }
      const out = sub(p, best); if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = mul(n, -1);
      let occ = 0;
      for (const [a, b, r] of caps) {
        const q = near(p, a, b), dv = sub(q, p), d = len(dv);
        if (d < r * 1.02) continue;                                  // 제 몸통
        const cosv = (dv[0] * n[0] + dv[1] * n[1] + dv[2] * n[2]) / d;
        if (cosv > 0) occ += Math.min(1, (r * r) / (d * d)) * cosv;
      }
      const ao = 1 - Math.min(.62, occ * .85);
      v[i + 6] *= ao; v[i + 7] *= ao; v[i + 8] *= ao;
    }
  }
}
function suitRest(key) {
  const sd = key.includes('-1') ? -1 : 1;
  if (key === 'torso') return [0, 0, 0];
  if (key.startsWith('ua')) return [sd * .215, .42, 0];
  if (key.startsWith('fa')) return [sd * .215, .11, 0];
  if (key.startsWith('hand')) return [sd * .215, -.145, 0];
  if (key.startsWith('th')) return [sd * .1, -.03, 0];
  if (key.startsWith('sh')) return [sd * .1, -.49, 0];
  return null;
}
const SUIT_CAPS = [[[0, -.08, 0], [0, .42, 0], .16], [[0, .56, .01], [0, .84, .01], .14],
  ...[-1, 1].flatMap(sd => [[[sd * .215, .42, 0], [sd * .215, .12, 0], .072], [[sd * .215, .1, 0], [sd * .215, -.12, 0], .06], [[sd * .215, -.15, 0], [sd * .215, -.25, 0], .04],
                            [[sd * .1, -.03, 0], [sd * .1, -.49, 0], .095], [[sd * .1, -.5, 0], [sd * .1, -.9, 0], .08]])];

/* ═════════════ 무늬 텍스처 (바이오해저드 패치 · 출입증) ═════════════ */
const ATL = 256, UV = {};
const uvr = (x, y, w, h) => [x / ATL, y / ATL, (x + w) / ATL, (y + h) / ATL];
UV.bio = uvr(0, 0, 128, 128); UV.card = uvr(128, 0, 128, 80);
function paintAtlas() {
  const cv = document.createElement('canvas'); cv.width = ATL; cv.height = ATL;
  const x = cv.getContext('2d');
  x.fillStyle = '#2a3140'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 2; x.strokeRect(6, 6, 116, 116);
  x.strokeStyle = '#d8a83c'; x.lineWidth = 9;
  for (let i = 0; i < 3; i++) { const a = -PI / 2 + i * TAU / 3; x.beginPath(); x.arc(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20, 20, a + .9, a + TAU - .9); x.stroke(); }
  x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 13, 0, TAU); x.stroke();
  x.fillStyle = '#e8e4da'; x.fillRect(128, 0, 128, 80);
  x.fillStyle = '#3fb7a0'; x.fillRect(128, 0, 128, 22);
  x.fillStyle = '#fff'; x.font = 'bold 15px sans-serif'; x.fillText('B-07', 136, 17);
  x.fillStyle = '#7d8590'; x.fillRect(136, 30, 30, 38);
  x.fillStyle = '#2a2f38'; x.font = 'bold 12px sans-serif'; x.fillText('수면 연구실', 172, 44); x.font = '10px monospace'; x.fillText('ID 0141', 172, 62);
  return cv;
}

/* ═════════════ 셰이더 ═════════════════════════════════════ */
const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute vec2 aUV; attribute float aE;
uniform mat4 uVP; uniform mat4 uM;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE; varying vec3 vO;
void main(){ vec4 w=uM*vec4(aP,1.0); vP=w.xyz; vN=(uM*vec4(aN,0.0)).xyz; vC=aC; vUV=aUV; vE=aE; vO=aP; gl_Position=uVP*w; }`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE; varying vec3 vO;
uniform vec3 uL[5]; uniform vec3 uLC[5];
uniform vec3 uSkyC; uniform vec3 uGndC; uniform vec3 uFog; uniform float uNear; uniform vec4 uRed;
uniform float uAlpha; uniform float uHit; uniform vec3 uBand; uniform sampler2D uTex;
float h3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 bump(vec3 o, float sc, float k){
  float e=0.35/sc, b=vn(o*sc);
  return vec3(vn((o+vec3(e,0,0))*sc)-b, vn((o+vec3(0,e,0))*sc)-b, vn((o+vec3(0,0,e))*sc)-b)*k;
}
void main(){
  vec3 c=vC;
  if(vUV.x>=0.0) c*=texture2D(uTex,vUV).rgb;
  vec3 V=normalize(-vP), n=normalize(vN);
  if(dot(n,V)<0.0) n=-n;
  float code=vE, spec=0.0, rough=24.0, wrap=0.25, sheen=0.0;
  vec3 col;
  if(code>0.5 && code<1.5){ col=c; }
  else if(code>5.5){ col=uBand; }
  else {
    if(code<0.5){                                 // 방호복 원단 — 굵은 구김 + 잔결, 코팅이라 약한 광택 · 묵은 얼룩
      c*=.82+.22*vn(vO*4.0+3.1)-.08*smoothstep(.55,.9,vn(vO*9.0));
      n=normalize(n+bump(vO,8.0,.6)+bump(vO,30.0,.14)+bump(vO,90.0,.05)); spec=.3; rough=16.0; sheen=.28;
    } else if(code<3.0){ spec=(code-2.0); rough=10.0+spec*90.0; n=normalize(n+bump(vO,90.0,.12)); }
    else if(code<3.5){ spec=1.0; rough=160.0; }
    else if(code<4.5){ n=normalize(n+bump(vO,60.0,.35)); spec=.08; rough=8.0; sheen=.18; }
    else { wrap=.55; spec=.15; rough=20.0; n=normalize(n+bump(vO,120.0,.08)); }
    vec3 acc=mix(uGndC,uSkyC,n.y*.5+.5), sp=vec3(0.0);
    for(int i=0;i<5;i++){
      vec3 L=uL[i]-vP; float d=length(L); L/=d; float at=1.0/(1.0+d*d*.09);
      acc+=uLC[i]*max((dot(n,L)+wrap)/(1.0+wrap),0.0)*at;
      sp+=uLC[i]*pow(max(dot(n,normalize(L+V)),0.0),rough)*spec*at;
    }
    float fr=pow(1.0-max(dot(n,V),0.0),3.0);
    col=c*acc+sp+uSkyC*fr*sheen;
    if(code>2.9 && code<3.5){                    // 보호면 — 새까만 유리에 복도 천장 형광등이 비침
      vec3 R=reflect(-V,n);
      float sky=smoothstep(-.35,.7,R.y);
      float strip=smoothstep(.05,.6,R.y)*smoothstep(.35,.95,sin(R.z*6.0+R.x*1.5)*.5+.5);
      col=c*.3+uSkyC*(.25*sky+2.2*strip)*(.3+.7*fr)+sp*.8+uSkyC*fr*.5;
    }
  }
  col=mix(col,vec3(1.0),uHit);
  col=mix(uFog,col,uNear);
  col=mix(col,uRed.rgb,uRed.a);
  gl_FragColor=vec4(col*uAlpha,uAlpha);
}`;

/* ═════════════ 렌더러 ═════════════════════════════════════ */
class Figure3D {
  constructor(w = 960, h = 540) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    const gl = this.canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }) || this.canvas.getContext('experimental-webgl', { alpha: true });
    this.ok = !!gl;
    if (!gl) return;
    this.gl = gl;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr); this.pr = pr;
    this.at = ['aP', 'aN', 'aC', 'aUV', 'aE'].map(n => gl.getAttribLocation(pr, n));
    this.un = {};
    ['uVP', 'uM', 'uL', 'uLC', 'uSkyC', 'uGndC', 'uFog', 'uNear', 'uRed', 'uAlpha', 'uHit', 'uBand', 'uTex'].forEach(n => this.un[n] = gl.getUniformLocation(pr, n));
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintAtlas());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.un.uTex, 0);
    const up = parts => { const o = {}; for (const k in parts) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(parts[k].v), gl.STATIC_DRAW); o[k] = { b, n: parts[k].v.length / 12 }; } return o; };
    const sp = buildSuit(), gp = buildGuard();
    bakeAO(sp, suitRest, SUIT_CAPS);
    bakeAO(gp, k => k === 'gun' ? null : suitRest(k), SUIT_CAPS.map(([a, b, r]) => [a, b, r * .82]));
    this.suit = up(sp);
    this.guard = up(gp);
  }
  /* cam : { f, px, py } — 초점 거리 · 주점(화면 픽셀) */
  proj(cam) {
    const W = this.w, H = this.h, n = .03, fa = 60;
    const sx = 2 * cam.f / W, sy = 2 * cam.f / H, ox = -(2 * cam.px / W - 1), oy = -(1 - 2 * cam.py / H);
    return [sx, 0, 0, 0, 0, sy, 0, 0, ox, oy, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
  }
  draw(set, key, m) {
    const gl = this.gl, p = set[key]; if (!p) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, p.b);
    const sz = [3, 3, 3, 2, 1]; let off = 0;
    this.at.forEach((a, i) => { if (a >= 0) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, sz[i], gl.FLOAT, false, 48, off * 4); } off += sz[i]; });
    gl.uniformMatrix4fv(this.un.uM, false, new Float32Array(m));
    gl.drawArrays(gl.TRIANGLES, 0, p.n);
  }
  begin() {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }
  /* 사람 하나 — fig : { kind:'suit'|'guard', x, y, z(카메라 앞 거리), yaw, run(달리기 위상), stride(0‥1),
       reach(손 뻗기 0‥1), aim(겨눔 0‥1), lean, alpha, hit, band:[r,g,b] }
     env : { cam, sky, gnd, key, fog, near, red:[r,g,b,a], lights:[[x,y,z],[r,g,b]]... } (색은 0‥1) */
  render(fig, env, keep) {
    if (!this.ok) return null;
    const gl = this.gl, un = this.un;
    if (!keep) this.begin();
    gl.uniformMatrix4fv(un.uVP, false, new Float32Array(this.proj(env.cam)));
    const L = env.lights.slice(0, 5); while (L.length < 5) L.push([[0, 0, 0], [0, 0, 0]]);
    gl.uniform3fv(un.uL, new Float32Array(L.flatMap(l => l[0]))); gl.uniform3fv(un.uLC, new Float32Array(L.flatMap(l => l[1])));
    gl.uniform3fv(un.uSkyC, new Float32Array(env.sky)); gl.uniform3fv(un.uGndC, new Float32Array(env.gnd));
    gl.uniform3fv(un.uFog, new Float32Array(env.fog)); gl.uniform1f(un.uNear, env.near);
    gl.uniform4fv(un.uRed, new Float32Array(env.red || [0, 0, 0, 0]));
    gl.uniform1f(un.uAlpha, fig.alpha == null ? 1 : fig.alpha); gl.uniform1f(un.uHit, fig.hit || 0);
    gl.uniform3fv(un.uBand, new Float32Array(fig.band || [.4, .85, .75]));
    const set = fig.kind === 'guard' ? this.guard : this.suit, G = fig.kind === 'guard';
    const run = fig.run || 0, st = fig.stride == null ? 1 : fig.stride, reach = fig.reach || 0, aim = fig.aim || 0;
    const bob = Math.abs(Math.sin(run)) * .045 * st;
    const base = M4.chain(M4.T(fig.x, fig.y, -fig.z), M4.RY(fig.yaw || 0));
    const hipY = (G ? .93 : .94) + bob - .02 * st;
    const torso = M4.chain(base, M4.T(0, hipY, 0), M4.RX((fig.lean != null ? fig.lean : .16 * st) + reach * .06), M4.RZ(Math.sin(run) * .05 * st), M4.RY(Math.sin(run) * .12 * st));
    this.draw(set, 'torso', torso);
    // 다리
    for (const side of [-1, 1]) {
      const ph = run + (side > 0 ? 0 : PI), sw = Math.sin(ph) * .62 * st;
      const knee = (.15 + Math.max(0, Math.sin(ph + 1.3)) * 1.15) * st + (1 - st) * .05;
      const thigh = M4.chain(base, M4.T(side * .1, hipY - .03, 0), M4.RX(-sw - .1 * st), M4.RZ(side * .03));
      this.draw(set, 'th' + side, thigh);
      this.draw(set, 'sh' + side, M4.chain(thigh, M4.T(0, -.46, 0), M4.RX(knee)));
    }
    // 팔
    for (const side of [-1, 1]) {
      const ph = run + (side > 0 ? PI : 0);
      let pitch = Math.sin(ph) * .55 * st, elbow = (.85 + Math.sin(ph) * .25) * st + .15, roll = side * .12, yaw = 0;
      pitch = lerp(pitch, -1.72 - (side > 0 ? .12 : 0) + Math.sin(run * 2 + side) * .06, reach); elbow = lerp(elbow, .12, reach); roll = lerp(roll, side * -.05, reach);
      if (aim > 0) {                                           // 두 손으로 권총 — 가슴 높이로 겨눔
        pitch = lerp(lerp(.15, -.25, 0), -1.42, aim); elbow = lerp(.45, .12, aim); yaw = lerp(0, side * -.32, aim); roll = lerp(side * .1, side * .02, aim);
      } else if (G) { pitch = -.35; elbow = .6; yaw = side * -.15; }
      const sh = M4.chain(torso, M4.T(side * (G ? .2 : .215), G ? .43 : .42, 0), M4.RY(yaw), M4.RZ(roll), M4.RX(pitch));
      this.draw(set, 'ua' + side, sh);
      const fa = M4.chain(sh, M4.T(0, -.3, 0), M4.RX(-elbow));
      this.draw(set, 'fa' + side, fa);
      const hand = M4.chain(fa, M4.T(0, G ? -.25 : -.255, 0), M4.RX(reach * -.2));
      this.draw(set, 'hand' + side + (reach > .35 ? 1 : 0), hand);
      if (G && side > 0) this.draw(set, 'gun', M4.chain(hand, M4.T(0, .02, 0), M4.RX(PI / 2 - .1)));
    }
    return this.canvas;
  }
}

window.Figure3D = Figure3D;
})();
