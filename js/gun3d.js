'use strict';
/* ═══════════════════════════════════════════════════════════════
   gun3d.js — 손에 든 권총과 두 손, 진짜 3D (WebGL)

   탈출 총격전의 1인칭 총입니다. 예전엔 픽셀 시트(js/pistol.js)를 실사 복도 위에 찍어서
   총과 손만 그림처럼 떠 보였는데, 이제 복도 · 사람과 같은 방식으로 빛을 받는 입체 모델입니다.
   (WebGL 이 없으면 escape.js 가 예전 픽셀 시트로 그립니다)

     권총   : 짙은 슬라이드(앞뒤 톱니 · 배출구 · 가늠자) · 폴리머 몸통(레일 · 방아쇠울) · 뒤로 기운 손잡이
              · 탄창. 형광 청록은 가늠자 세 점 · 톱니 골 · 탄창 멈치에만, 오방색 단청은 손잡이 옆판과 탄창에만
              (픽셀 총의 약속 그대로).
     손     : 환자의 맨손 — 손바닥 · 손가락 마디 · 손톱 · 손목의 환자 팔찌 · 환자복 소매.
              오른손은 손잡이를 쥐고, 왼손은 그 위를 감싸 받칩니다.
     움직임 : 숨(흔들림) · 조준을 따라 살짝 · 쏘면 슬라이드가 물러나며 튀고 탄피가 튐 ·
              장전 — 총을 눕힘 → 빈 탄창이 떨어짐 → 왼손이 새 탄창을 밀어 넣음 → 슬라이드를 당겼다 놓음.

   쓰는 곳 : escape.js (drawViewGun · draw)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const L3 = window.Lab3D, FU = window.Fig3DUtil;
if (!L3 || !FU || !window.Figure3D) return;
const { Mesh, hex } = L3, { M4, MAT, surf, curve } = FU;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ss = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const PI = Math.PI, TAU = PI * 2;

/* ── 색 ── */
const C = {
  slide: hex('#262a32'), slideD: hex('#14161b'), poly: hex('#181a20'), polyD: hex('#0d0e12'), steel: hex('#8f98a3'),
  brass: hex('#c9a04a'), copper: hex('#b06a3c'), teal: hex('#00ffd5'), tealD: hex('#00a78c'),
  skin: hex('#bf9a88'), skinD: hex('#a67c6a'), nail: hex('#e3c3b6'), band: hex('#e4e8ea'), gown: hex('#5d7b7e'), gownD: hex('#40595c'),
  ob: ['#2d64a3', '#e2d9c4', '#b0362d', '#141318', '#cfa23b'].map(hex)
};
const G_ = s => ({ m: MAT.gloss(s) });

/* 손잡이 축 — 아래로 갈수록 뒤로 기움. D 아래 · F 앞(축에 수직) · CG(t) 손잡이 가운데 */
const D = norm([0, -1, .28]), F = norm([0, -.28, -1]);
const CG = t => add([0, 0, .008], mul(D, t));

/* 꼭짓점을 행렬로 옮김 (mirror : 손 좌표의 x 를 뒤집어 왼손으로) */
function xform(m, M, mirror) {
  const v = m.v, s = mirror ? -1 : 1;
  for (let i = 0; i < v.length; i += 12) {
    const x = v[i] * s, y = v[i + 1], z = v[i + 2], nx = v[i + 3] * s, ny = v[i + 4], nz = v[i + 5];
    v[i] = M[0] * x + M[4] * y + M[8] * z + M[12]; v[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; v[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    v[i + 3] = M[0] * nx + M[4] * ny + M[8] * nz; v[i + 4] = M[1] * nx + M[5] * ny + M[9] * nz; v[i + 5] = M[2] * nx + M[6] * ny + M[10] * nz;
  }
  return m;
}
/* 축 셋과 원점으로 행렬 — Y(손가락 쪽) · Z(손바닥이 보는 쪽) 를 주면 X 는 알아서 */
function basis(O, Y, Z) {
  Y = norm(Y); let X = norm(cross(Y, Z)); Z = cross(X, Y);
  return [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, O[0], O[1], O[2], 1];
}
const obox = (m, c, hx, hy, hz, ax, ay, az, col, o) => m.obox(c, mul(ax, hx), mul(ay, hy), mul(az, hz), col, o);

/* ═════════════ 권총 ═════════════════════════════════════
   총 좌표 : 총구 −z · 위 +y · 오른쪽 +x. 원점은 손잡이 꼭대기 뒤쪽(손아귀가 닿는 자리) 근처,
   총열 축은 y = .031 */
const SW = .0128;                                             // 슬라이드 반폭
function buildGun() {
  const P = {};
  // ── 몸통 (폴리머) · 총열 · 방아쇠
  const fr = new Mesh();
  fr.cyl([0, .031, -.154], [0, .031, .0], .0071, .0071, C.steel, 16, false, G_(.9));
  fr.lathe([0, .031, -.154], [0, 0, -1], [[.0071, 0], [.0071, .0025], [.0047, .0025], [.0047, -.03, hex('#050506')]], C.steel, 16, G_(.9));
  fr.cyl([0, .0195, -.15], [0, .0195, -.02], .0036, .0036, hex('#3a3f47'), 8, true, G_(.7));        // 복좌 용수철 막대
  fr.rbox(-.0123, .0123, -.003, .0188, -.147, .03, C.poly, .004, G_(.22));                          // 몸통 · 먼지 덮개
  fr.rbox(-.0108, .0108, -.0085, -.002, -.143, -.094, C.poly, .0025, G_(.22));                      // 레일
  for (let i = 0; i < 3; i++) fr.rbox(-.0125, .0125, -.007, -.0035, -.136 + i * .014, -.1325 + i * .014, C.polyD, .0008, G_(.1));
  // 방아쇠울 — 납작한 고리
  { const g = [[0, -.003, -.09], [0, -.02, -.094], [0, -.038, -.089], [0, -.0475, -.074], [0, -.049, -.05], [0, -.043, -.033], [0, -.03, -.024]];
    for (let i = 1; i < g.length; i++) { const a = g[i - 1], b = g[i], d = norm(sub(b, a)), n = cross([1, 0, 0], d), L = Math.hypot(...sub(b, a)) / 2;
      obox(fr, mul(add(a, b), .5), .0085, L + .002, .0026, [1, 0, 0], d, n, C.poly, G_(.22)); } }
  fr.tube([[0, -.004, -.053], [0, -.016, -.0585], [0, -.028, -.058], [0, -.036, -.053]], .0034, hex('#2d3138'), 8, { ...G_(.6), joints: true });   // 방아쇠
  // 손잡이 — 모서리가 둥근 네모 단면, 손바닥 쪽이 살짝 부풂 · 앞에는 손가락 홈
  surf(fr, 26, 36, (u, v) => {
    const t = lerp(-.004, .106, u), th = v * TAU, c = Math.cos(th), s = Math.sin(th), e = .5;
    const a = .0147 + .0008 * Math.sin(u * PI), b = .0262 + .0022 * Math.sin(u * PI * .9);
    const x = Math.sign(c) * Math.pow(Math.abs(c), e) * a;
    let w = Math.sign(s) * Math.pow(Math.abs(s), e) * b;
    if (w > 0) w -= .0022 * Math.max(0, s) * Math.pow(Math.sin(clamp01((t - .012) / .075) * PI * 3), 2);     // 손가락 홈 (앞)
    const tex = .8 + .2 * ((Math.floor(u * 40) + Math.floor(v * 56)) % 2);                              // 미끄럼 방지 무늬
    return [add(add(CG(t), [x, 0, 0]), mul(F, w)), mul(C.poly, Math.abs(c) > .75 && u > .22 && u < .86 ? tex : 1)];
  }, MAT.gloss(.18));
  fr.ellipsoid([0, .008, .033], [.0115, 0, 0], [0, .009, 0], [0, 0, .008], C.poly, 12, 8, G_(.22));     // 손아귀 턱
  // 손잡이 옆판 — 오방색 단청 다섯 줄 (양쪽)
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
    const t0 = .038 + i * .009, t1 = t0 + .0075, x = sx * .0152;
    const q = (t, w) => add(add(CG(t), [x, 0, 0]), mul(F, w));
    fr.quad(q(t0, .012), q(t0, -.013), q(t1, -.013), q(t1, .012), C.ob[i], { m: MAT.cloth });
  }
  // 조작부 (왼쪽) — 슬라이드 멈치 · 분해 레버 · 탄창 멈치(청록)
  fr.rbox(-.0142, -.012, .009, .0145, -.036, -.008, hex('#2d3138'), .0012, G_(.6));
  fr.rbox(-.0136, -.012, .004, .009, -.072, -.06, hex('#2d3138'), .001, G_(.6));
  for (const sx of [-1, 1]) fr.lathe([sx * .0124, -.0115, -.0215], [sx, 0, 0], [[.0042, 0], [.0042, .0022], [.003, .0026, C.tealD], [0, .0026, C.teal]], hex('#2d3138'), 12, { m: MAT.glow });
  P.frame = fr;

  // ── 슬라이드
  const sl = new Mesh();
  sl.rbox(-SW, SW, .0185, .0445, -.151, .0325, C.slide, .0034, G_(.72));
  sl.rbox(-.0075, .0075, .0444, .0449, -.13, .008, mul(C.slide, .8), .0003, G_(.35));                 // 윗면 무광 띠
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) {                                                                       // 뒤 톱니 — 골에 청록 빛
      const z = .0245 - i * .0046;
      sl.rbox(sx * SW - .0006, sx * SW + .0006, .0215, .042, z - .0026, z, C.slideD, .0004, G_(.5));
      if (i < 6) sl.quad([sx * (SW + .0002), .04, z - .0045], [sx * (SW + .0002), .04, z - .0027], [sx * (SW + .0002), .0235, z - .0027], [sx * (SW + .0002), .0235, z - .0045], mul(C.tealD, .55), { m: MAT.glow });
    }
    for (let i = 0; i < 4; i++) { const z = -.118 - i * .0046; sl.rbox(sx * SW - .0005, sx * SW + .0005, .0215, .042, z - .0026, z, C.slideD, .0004, G_(.5)); }
  }
  // 배출구 (오른쪽 위) — 안쪽의 약실
  sl.rbox(.002, SW + .0003, .0345, .0448, -.078, -.036, hex('#08090b'), .0006, G_(.2));
  sl.rbox(.0035, SW + .0005, .0355, .0451, -.0755, -.0385, C.steel, .001, G_(.9));
  sl.rbox(SW - .0004, SW + .0006, .028, .0315, -.036, -.012, hex('#3a3f47'), .0005, G_(.7));         // 갈퀴
  // 가늠자 · 가늠쇠 — 청록 세 점
  sl.rbox(-.0108, .0108, .0444, .0468, .011, .028, C.slideD, .001, G_(.4));
  for (const sx of [-1, 1]) {
    sl.rbox(sx * .0066 - .0034, sx * .0066 + .0034, .0466, .0526, .0155, .027, C.slideD, .0008, G_(.4));
    sl.disc([sx * .0066, .0497, .0272], [0, 0, 1], .0017, C.teal, 10, { m: MAT.glow });
  }
  sl.rbox(-.0021, .0021, .0444, .0518, -.147, -.137, C.slideD, .0008, G_(.4));
  sl.disc([0, .0493, -.1368], [0, 0, 1], .0016, C.teal, 10, { m: MAT.glow });
  sl.rbox(-.0105, .0105, .021, .042, .0322, .0331, C.polyD, .001, G_(.3));                           // 뒷판 · 공이
  sl.disc([0, .031, .0333], [0, 0, 1], .0022, C.steel, 10, G_(.9));
  P.slide = sl;

  // ── 탄창 (꽂힌 자리) — 몸통 · 바닥판 · 맨 위의 탄 · 단청 띠
  const mg = new Mesh(), X = [1, 0, 0];
  obox(mg, CG(.056), .0102, .053, .0175, X, D, F, hex('#2c3038'), G_(.6));
  obox(mg, add(CG(.1105), mul(F, .002)), .0142, .0052, .0275, X, D, F, C.poly, G_(.22));
  for (let i = 0; i < 5; i++) { const q = (t, w) => add(add(CG(t), [-.0104, 0, 0]), mul(F, w)); const w0 = -.013 + i * .0052;
    mg.quad(q(.085, w0), q(.085, w0 + .0046), q(.097, w0 + .0046), q(.097, w0), C.ob[i], { m: MAT.cloth }); }
  { const a = add(CG(.001), mul(F, -.011)), b = add(CG(.001), mul(F, .009));
    mg.cyl(a, b, .0047, .0047, C.brass, 12, true, G_(.9));
    mg.lathe(b, F, [[.0047, 0], [.0044, .003], [.003, .008], [.0012, .011], [0, .0115]], C.copper, 12, G_(.8)); }
  P.mag = mg;

  // ── 탄피
  const cs = new Mesh();
  cs.lathe([0, 0, -.0095], [0, 0, 1], [[0, 0], [.0049, 0], [.0049, .0012], [.0043, .0018], [.0047, .0026], [.0047, .019], [.0038, .019, hex('#3a2a10')], [.0038, .012, hex('#1a1206')]], C.brass, 12, G_(.92));
  P.case = cs;
  return P;
}

/* ═════════════ 손 ═════════════════════════════════════
   손 좌표(오른손) : 손목이 원점 · 손가락 쪽 +y · 엄지 쪽 +x · 손바닥이 보는 쪽 +z.
   o.curl[손가락][마디] 굽힘(라디안) · o.spread[손가락] 벌림 · o.thumb 엄지 세 마디의 방향 ·
   o.arm 팔뚝이 뻗는 방향 · o.sleeve 소매가 시작하는 자리 */
const FX = [.0285, .0095, -.0095, -.0275], FY = [.09, .094, .09, .081], FR = [.0098, .01, .0094, .0084];
const FL = [[.042, .025, .021], [.046, .029, .022], [.042, .027, .021], [.033, .019, .019]];
function buildHand(o) {
  const m = new Mesh(), S = { m: MAT.skin }, sk = C.skin;
  // 손바닥 · 엄지 두덩 · 새끼 두덩 · 손등의 마디
  m.ellipsoid([0, .047, -.003], [.0415, 0, 0], [0, .051, 0], [0, 0, .0155], sk, 20, 12, S);
  m.ellipsoid([.023, .03, .007], [.02, 0, 0], [0, .031, 0], [0, 0, .014], sk, 14, 8, S);
  m.ellipsoid([-.027, .034, .005], [.0135, 0, 0], [0, .033, 0], [0, 0, .0115], sk, 12, 8, S);
  for (let f = 0; f < 4; f++) {
    m.ellipsoid([FX[f], FY[f] - .006, -.0075], [FR[f] * .95, 0, 0], [0, FR[f] * 1.3, 0], [0, 0, FR[f] * .8], [sk[0], sk[1] * .95, sk[2] * .93], 12, 8, S);   // 손등 마디 — 살짝 붉게
    const cu = o.curl[f], sp = (o.spread && o.spread[f]) || 0;
    let p = [FX[f], FY[f], -.002], th = 0, d = [0, 1, 0];
    for (let k = 0; k < 3; k++) {
      th += cu[k]; d = norm([Math.sin(sp) * Math.cos(th), Math.cos(th) * Math.cos(sp), Math.sin(th)]);
      const r0 = FR[f] * [1, .93, .86][k], r1 = FR[f] * [.93, .86, .76][k], q = add(p, mul(d, FL[f][k]));
      m.cyl(p, q, r0, r1, sk, 12, false, S);
      m.sphere(p, r0 * 1.005, k ? [sk[0], sk[1] * .95, sk[2] * .93] : sk, 12, S);                                // 마디
      p = q;
    }
    const rt = FR[f] * .76, dor = [0, Math.sin(th), -Math.cos(th)];
    m.sphere(p, rt, sk, 12, S);
    m.ellipsoid(add(sub(p, mul(d, .0058)), mul(dor, rt * .72)), mul(d, .0064), [rt * .78, 0, 0], mul(dor, .0017), C.nail, 10, 6, G_(.45));   // 손톱
  }
  // 엄지 — 세 마디
  { let p = [.034, .02, .006]; const L = [.04, .031, .026], R = [.0128, .0114, .01, .0088], T = o.thumb.map(norm);
    for (let k = 0; k < 3; k++) { const q = add(p, mul(T[k], L[k])); m.cyl(p, q, R[k], R[k + 1], sk, 12, false, S); m.sphere(p, R[k] * 1.04, sk, 12, S); p = q; }
    m.sphere(p, R[3], sk, 12, S);
    const d = T[2], dor = norm(o.thumbBack || cross(d, cross([0, 0, -1], d)));
    m.ellipsoid(add(sub(p, mul(d, .007)), mul(dor, R[3] * .75)), mul(d, .0075), mul(norm(cross(d, dor)), R[3] * .82), mul(dor, .0018), C.nail, 10, 6, G_(.45));
  }
  // 손목 · 팔뚝 — 타원 단면, 손목 뼈가 살짝 도드라짐
  const A = norm(o.arm || [0, -1, 0]), bx = norm(cross(A, [0, 0, 1])), bz = cross(bx, A), len = o.armLen || .3;
  const AT = [[0, .0275, .0185], [.1, .0285, .021], [.3, .034, .029], [1, .046, .042]];
  const ring = (s, k, th) => { const [, a, b] = curve(AT, clamp01(s / len)); return add(add(add([0, .006, -.002], mul(A, s)), mul(bx, Math.cos(th) * a * k)), mul(bz, Math.sin(th) * b * k)); };
  surf(m, 20, 24, (u, v) => [ring(lerp(-.012, o.sleeve || .1, u) + .002, 1, v * TAU), mul(sk, 1 - .08 * u)], MAT.skin);
  m.sphere(add([0, .004, -.012], mul(bx, -.02)), .0085, sk, 10, S);                                     // 손목뼈
  // 환자 팔찌 — 흰 띠 · 이름표
  surf(m, 3, 24, (u, v) => [ring(lerp(.03, .046, u), 1.06, v * TAU), C.band], MAT.gloss(.35));
  { const c = ring(.038, 1.09, -PI / 2), n = mul(bz, -1); obox(m, c, .011, .0075, .0012, bx, A, n, hex('#f4f6f7'), G_(.4));
    obox(m, add(c, mul(n, .0013)), .007, .0012, .0003, bx, A, n, hex('#3a4048'), { m: MAT.cloth });
    obox(m, add(add(c, mul(n, .0013)), mul(A, .0035)), .0045, .0009, .0003, bx, A, n, hex('#3a4048'), { m: MAT.cloth }); }
  // 환자복 소매 — 헐렁한 끝단 · 잔주름
  surf(m, 14, 28, (u, v) => { const s = lerp((o.sleeve || .1) - .012, len, u), th = v * TAU;
    const k = 1.22 + .12 * (1 - u) + .035 * Math.sin(th * 5 + u * 9) + .025 * Math.sin(th * 3 - u * 14);
    return [ring(s, k, th), mul(u < .07 ? C.gownD : C.gown, .9 + .1 * Math.sin(th * 5 + u * 9))]; }, MAT.cloth);
  return m;
}
/* 쥐는 모양들 */
const WRAP = [[.2, .25, .15], [1.25, 1.45, .7], [1.3, 1.5, .75], [1.35, 1.55, .8]];                    // 오른손 — 검지는 방아쇠 쪽으로 곧게
const SUP  = [[1.05, 1.3, .6], [1.15, 1.4, .65], [1.2, 1.45, .7], [1.25, 1.5, .75]];                   // 왼손 받침
const HOLD = [[1.1, 1.2, .6], [1.15, 1.25, .6], [1.15, 1.3, .65], [1.2, 1.3, .7]];                     // 탄창을 쥠
const OVER = [[1.2, 1.1, .5], [1.25, 1.15, .5], [1.25, 1.15, .55], [1.3, 1.2, .6]];                    // 슬라이드를 위에서 움켜쥠

/* 손을 총 좌표에 놓음 — O 손목 · Y 손가락 쪽 · Z 손바닥이 보는 쪽 · armG 팔뚝이 뻗는 방향(총 좌표) */
function place(o, O, Y, Z, armG, left) {
  const B = basis(O, Y, Z), X = [B[0], B[1], B[2]], Yn = [B[4], B[5], B[6]], Zn = [B[8], B[9], B[10]], a = norm(armG);
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return xform(buildHand({ ...o, arm: [dot(X, a) * (left ? -1 : 1), dot(Yn, a), dot(Zn, a)], armLen: .36, sleeve: .13 }), B, left);
}
/* 장전할 때 총을 눕히는 각 (yaw · pitch · roll) — 그 자세에서 화면 아래로 내려가는 팔 방향을 총 좌표로 */
const CANT = [.2, .5, -.55];
const cantDir = v => { const R = M4.chain(M4.RY(CANT[0]), M4.RX(CANT[1]), M4.RZ(CANT[2]));
  return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[4] * v[0] + R[5] * v[1] + R[6] * v[2], R[8] * v[0] + R[9] * v[1] + R[10] * v[2]]; };
function buildHands() {
  const P = {};
  // 오른손 — 손바닥이 손잡이 오른쪽에, 손가락은 앞을 돌아 왼쪽으로. 엄지는 뒤를 넘어 왼쪽에서 앞으로
  { const Y = F, Z = [-1, 0, 0], K = add(add(CG(.047), [.0262, 0, 0]), mul(F, .0375));
    P.rhand = place({ curl: WRAP, thumb: [[.12, .3, .95], [-.06, .95, .3], [-.12, .99, .02]], thumbBack: [.3, 0, 1] },
      sub(K, mul(Y, .092)), Y, Z, [.32, -.62, .72], false); }
  // 왼손 받침 — 손등이 이쪽, 손가락이 오른손 손가락 위를 감쌈. 엄지는 몸통 옆을 따라 앞으로
  { const Y = norm([.1, -.5, -.86]), Z = norm([1, 0, .12]), K = add(add(CG(.058), [-.036, 0, 0]), mul(F, .05));
    P.lsup = place({ curl: SUP, thumb: [[.8, .5, .25], [.55, .82, .12], [.48, .87, .05]], thumbBack: [1, 0, -.4] },
      sub(K, mul(Y, .092)), Y, Z, [-.5, -.6, .62], true); }
  // 탄창을 든 왼손 — 바닥판을 손바닥으로 받치고 손가락이 앞을 감쌈 (꽂힌 자리 기준)
  { const Y = norm(add(F, mul(D, -.25))), Z = mul(D, -1), O = sub(sub(add(CG(.118), [-.004, 0, 0]), mul(Y, .05)), mul(Z, .017));
    P.lmag = place({ curl: HOLD, thumb: [[.6, .3, .7], [.25, .5, .85], [.05, .45, .9]], thumbBack: [1, 0, 0] }, O, Y, Z, cantDir([-.45, -.88, .05]), true); }
  // 슬라이드를 위에서 움켜쥔 왼손 — 손등이 위, 손가락이 오른쪽 옆으로 감김
  { const Y = norm([1, .12, 0]), Z = norm([.42, -1, 0]), O = sub(add([.0, .058, .012], mul(Z, -.016)), mul(Y, .078));
    P.lrack = place({ curl: OVER, thumb: [[.55, .2, .85], [.15, .55, .85], [0, .5, .9]], thumbBack: [1, 0, 0] }, O, Y, Z, cantDir([-.6, -.8, .02]), true); }
  return P;
}

/* ═════════════ 렌더러 ═════════════════════════════════════ */
const FOV = 50 * PI / 180, NEAR = .012, FAR = 6;
const MUZZLE = [0, .031, -.158], PORT = [.013, .04, -.056];
const tp = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];

class GunView3D extends window.Figure3D {
  constructor(w = 960, h = 540) {
    super(w, h, null, { bodies: false });
    if (!this.ok) return;
    this.gun = this.upload(buildGun());
    this.hands = this.upload(buildHands());
    this.cases = []; this.k = 1; this.bw = w; this.bh = h;
  }
  setScale(k) {
    k = Math.max(.5, Math.min(2, k)); if (k === this.k) return;
    this.k = k; this.w = Math.round(this.bw * k); this.h = Math.round(this.bh * k); this.canvas.width = this.w; this.canvas.height = this.h;
  }
  /* 총의 자리 — o : { t, ax, ay(조준 따라가기 −1‥1), recoil, dy, kick, bob, cant(0‥1), q(장전 0‥12, 아니면 −1), raise(0‥1 꺼내 드는 중) }
     돌려주는 것 : { M(총 좌표 → 눈 좌표), slide, muzzle:[x, y] (960×540 화면 좌표) } */
  pose(o) {
    const q = o.q == null ? -1 : o.q, cant = o.cant || 0, rc = o.recoil || 0;
    const br = Math.sin(o.t * .035), br2 = Math.sin(o.t * .021 + 1);
    const lift = (o.dy || 0) * .004 + (o.kick || 0) * .0025;
    const pos = [lerp(.084, .02, cant) + (o.ax || 0) * .012 + br2 * .0012, lerp(-.062, .028, cant) - (o.ay || 0) * .008 + br * .0018 - lift + Math.sin((o.bob || 0) * 2) * .003 + rc * .008,
                 lerp(-.27, -.3, cant) + rc * .03];
    const M = M4.chain(M4.T(pos[0], pos[1], pos[2]),
      M4.RY(lerp(.24, CANT[0], cant) - (o.ax || 0) * .03), M4.RX(lerp(.1, CANT[1], cant) + rc * .16 + (o.ay || 0) * -.02 + br * .004 - lift * 1.5), M4.RZ(lerp(0, CANT[2], cant) + br2 * .006));
    // 슬라이드 — 쏜 순간 · 당길 때 뒤로
    let slide = Math.min(.04, rc * .055);
    if (q >= 9) slide = Math.max(slide, .04 * (q < 11 ? ss(9, 9.8, q) : 1 - ss(11, 11.2, q)));
    const m = tp(M, MUZZLE), f = 1 / Math.tan(FOV / 2), asp = this.bw / this.bh;
    const mz = [this.bw / 2 + (m[0] * f / asp / -m[2]) * this.bw / 2, this.bh / 2 - (m[1] * f / -m[2]) * this.bh / 2];
    return { M, slide, muzzle: mz, q, cant };
  }
  /* 쏜 순간 — 탄피가 배출구에서 오른쪽 위로 튐 (눈 좌표, 한 장에 한 번 움직임) */
  eject(P) {
    const p = tp(P.M, PORT);
    this.cases.push({ p, v: [.9 + Math.random() * .5, 1.5 + Math.random() * .6, .25 + Math.random() * .3], a: Math.random() * 6, b: Math.random() * 6, life: 50 });
  }
  reset() { this.cases = []; }
  /* env : { key:[r,g,b](머리 위 형광등), amb:[r,g,b], flash(0‥1 총구 섬광), red(0‥1 위험) } */
  render(o, env = {}) {
    if (!this.ok) return null;
    const gl = this.gl, un = this.un, P = o.P || this.pose(o), q = P.q;
    gl.useProgram(this.pr); this.begin();
    const f = 1 / Math.tan(FOV / 2), asp = this.w / this.h;
    gl.uniformMatrix4fv(un.uVP, false, new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (FAR + NEAR) / (NEAR - FAR), -1, 0, 0, 2 * FAR * NEAR / (NEAR - FAR), 0]));
    const key = env.key || [1.1, 1.12, 1.18], amb = env.amb || [.3, .32, .36], fl = env.flash || 0, mz = tp(P.M, MUZZLE);
    const L = [[[.05, .55, -.25], key], [[-.5, .25, .15], mul(key, .35)], [[.45, -.2, -.5], mul(key, .18)],
               [add(mz, [0, .01, -.03]), [3.2 * fl, 2.4 * fl, 1.3 * fl]], [[0, 0, 0], [0, 0, 0]]];
    gl.uniform3fv(un.uL, new Float32Array(L.flatMap(l => l[0]))); gl.uniform3fv(un.uLC, new Float32Array(L.flatMap(l => l[1])));
    gl.uniform3fv(un.uSkyC, new Float32Array(amb)); gl.uniform3fv(un.uGndC, new Float32Array(mul(amb, .35)));
    gl.uniform3fv(un.uFog, new Float32Array([0, 0, 0])); gl.uniform1f(un.uNear, 1);
    gl.uniform4fv(un.uRed, new Float32Array([.6, .05, .04, (env.red || 0) * .22]));
    gl.uniform1f(un.uAlpha, 1); gl.uniform1f(un.uHit, 0); gl.uniform3fv(un.uBand, new Float32Array([0, 1, .84]));
    const M = P.M, g = this.gun, h = this.hands, T = v => M4.T(v[0], v[1], v[2]);
    this.draw(g, 'frame', M);
    this.draw(g, 'slide', M4.mul(M, M4.T(0, 0, P.slide)));
    this.draw(h, 'rhand', M);
    // 탄창 — 꽂혀 있음 → (2‥3) 풀림 → (3‥4) 떨어짐 → (4‥7) 새 탄창이 올라옴
    let magOff = 0, magOn = true;
    if (q >= 2 && q < 4) magOff = .014 * ss(2, 2.6, q) + (q > 3 ? (q - 3) * (q - 3) * .34 : 0);
    else if (q >= 4 && q < 7) magOff = .21 * Math.pow(1 - ss(4, 6.95, q), 1.4);
    this.draw(g, 'mag', M4.mul(M, T(mul(D, magOff))));
    // 왼손 — 받침 / 탄창 / 슬라이드
    const away = q < 0 ? 0 : ss(0, 1.1, q) * (1 - ss(11.35, 12, q));
    if (away < .995) this.draw(h, 'lsup', M4.chain(M, T([-.07 * away, -.2 * away, .1 * away]), M4.RZ(away * .5)));
    if (q >= 4 && q < 8.4) { const lv = ss(7.25, 8.3, q); this.draw(h, 'lmag', M4.mul(M, T(add(mul(D, magOff + lv * .24), [-.06 * lv, 0, .04 * lv])))); }
    if (q >= 8 && q < 11.8) { const inn = 1 - ss(8, 8.9, q), out = ss(11.05, 11.75, q), k = inn + out;
      this.draw(h, 'lrack', M4.chain(M, T([-.16 * k, .07 * k - .05 * out, .06 * k + (out ? 0 : P.slide)]), M4.RZ(-.25 * k))); }
    // 탄피
    for (const c of this.cases) {
      c.v[1] -= 9.8 / 60 * .55; c.p = add(c.p, mul(c.v, 1 / 60)); c.a += .45; c.b += .3; c.life--;
      this.draw(g, 'case', M4.chain(T(c.p), M4.RY(c.a), M4.RX(c.b)));
    }
    this.cases = this.cases.filter(c => c.life > 0 && c.p[1] > -.4);
    return this.canvas;
  }
}
window.GunView3D = GunView3D;
window.Gun3DParts = { buildGun, buildHands };
})();
