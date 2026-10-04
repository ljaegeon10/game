'use strict';
/* ═══════════════════════════════════════════════════════════════
   labroom.js — 깨어난 실험실, 진짜 3D (WebGL)

   엔딩(ending.js 의 Lab)에서 밖에서 내려다본 바로 그 방을, 같은 배치로 입체로
   세웠습니다. 엔딩 그림 1px ≈ 1.9cm 로 옮기면 방 너비가 9.2m 입니다.

     뒷벽 (z = 7, 엔딩에서 보이던 벽) — 왼쪽부터
        문 · 키카드 잠금장치 · 골격 모형 · 뇌파 증폭기 카트 · 높은 관찰창(너머에 관찰실) ·
        벽걸이 모니터 두 대(위 : 심전도)
     그 앞 — 벽과 나란한 침대 (머리는 왼쪽 −x, 발은 오른쪽 +x), 발치 앞에 링거대
     앞벽 (z = 0, 엔딩에선 카메라 쪽이라 안 보이던 벽) — 캐비닛 · 화이트보드 · 시계 ·
        개수대와 붉은 배양액 선반
     천장 — 격자 조명 여덟 (실제로 방을 비추는 빛)

   좌표 (m) : x 오른쪽 · y 위 · z 뒷벽 쪽. 카메라의 yaw 0 은 +z(뒷벽)를 보고,
   +π/2 는 +x(침대 발치 쪽)를 봅니다. 그림은 화면 해상도(960×540) 그대로 —
   다가가도 픽셀이 커지지 않습니다. 외부 라이브러리 없이 WebGL 만 씁니다.

   쓰는 곳 : escape.js 의 깨어남(WakeState)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const VW = 960, VH = 540;
const RX0 = -4.6, RX1 = 4.6, RZ0 = 0, RZ1 = 7, RCH = 3.1;

/* ── 작은 벡터 · 행렬 ── */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

function perspective(fovy, asp, n, f) {
  const t = 1 / Math.tan(fovy / 2);
  return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
}
function lookAt(e, c, up) {
  const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
}
function mat4mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
/* 카메라 — yaw · pitch · roll 로 앞 · 오른쪽 · 위 */
function camBasis(c) {
  const f = [Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)];
  const r0 = norm(cross(f, [0, 1, 0])), u0 = cross(r0, f);
  const cr = Math.cos(c.roll || 0), sr = Math.sin(c.roll || 0);
  return { f, r: add(mul(r0, cr), mul(u0, sr)), u: add(mul(u0, cr), mul(r0, -sr)) };
}

/* ═════════════ 메시 — 위치 · 법선 · 색 · 텍스처 좌표 · 스스로 빛남 ═══════════ */
class Mesh {
  constructor() { this.v = []; }
  tri(a, b, c, n, col, e, uva, uvb, uvc) {
    const push = (p, uv) => this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], uv ? uv[0] : -1, uv ? uv[1] : -1, e ? 1 : 0);
    push(a, uva); push(b, uvb); push(c, uvc);
  }
  quad(a, b, c, d, col, o = {}) {
    const n = norm(cross(sub(b, a), sub(d, a)));
    const uv = o.uv;                                 // [u0, v0, u1, v1] — a 왼위 · b 오른위 · c 오른아래 · d 왼아래
    const A = uv && [uv[0], uv[1]], B = uv && [uv[2], uv[1]], C = uv && [uv[2], uv[3]], D = uv && [uv[0], uv[3]];
    this.tri(a, b, c, n, col, o.e, A, B, C); this.tri(a, c, d, n, col, o.e, A, C, D);
  }
  box(x0, x1, y0, y1, z0, z1, col, o = {}) {
    const P = (x, y, z) => [x, y, z];
    this.quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), col, o);   // 위
    if (!o.noBottom) this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0), P(x0, y0, z0), col, o);
    this.quad(P(x0, y1, z0), P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), col, o);   // −z
    this.quad(P(x1, y1, z1), P(x1, y0, z1), P(x0, y0, z1), P(x0, y1, z1), col, o);   // +z
    this.quad(P(x0, y1, z1), P(x0, y0, z1), P(x0, y0, z0), P(x0, y1, z0), col, o);   // −x
    this.quad(P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), col, o);   // +x
  }
  /* 기울어진 상자 — 가운데 · 반축 세 개 */
  obox(c, U, V, Wv, col, o = {}) {
    const P = (a, b, d) => add(add(add(c, mul(U, a)), mul(V, b)), mul(Wv, d));
    const F = [[[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]],
               [[-1, 1, -1], [-1, -1, -1], [1, -1, -1], [1, 1, -1]], [[1, 1, 1], [1, -1, 1], [-1, -1, 1], [-1, 1, 1]],
               [[-1, 1, 1], [-1, -1, 1], [-1, -1, -1], [-1, 1, -1]], [[1, 1, -1], [1, -1, -1], [1, -1, 1], [1, 1, 1]]];
    F.forEach(f => this.quad(P(...f[0]), P(...f[1]), P(...f[2]), P(...f[3]), col, o));
  }
  /* 타원체 — 가운데 · 반축 세 개 (부드러운 법선) */
  ellipsoid(c, U, V, Wv, col, su = 12, sv = 8, o = {}) {
    const pt = (i, j) => { const th = i / su * Math.PI * 2, ph = j / sv * Math.PI - Math.PI / 2;
      const a = Math.cos(ph) * Math.cos(th), b = Math.sin(ph), d = Math.cos(ph) * Math.sin(th);
      return { p: add(add(add(c, mul(U, a)), mul(V, b)), mul(Wv, d)), n: norm(add(add(mul(U, a / (len(U) ** 2)), mul(V, b / (len(V) ** 2))), mul(Wv, d / (len(Wv) ** 2)))) }; };
    for (let i = 0; i < su; i++) for (let j = 0; j < sv; j++) {
      const A = pt(i, j), B = pt(i + 1, j), C = pt(i + 1, j + 1), D = pt(i, j + 1);
      this.triN(A, B, C, col, o.e); this.triN(A, C, D, col, o.e);
    }
  }
  triN(A, B, C, col, e) {
    for (const X of [A, B, C]) this.v.push(X.p[0], X.p[1], X.p[2], X.n[0], X.n[1], X.n[2], col[0], col[1], col[2], -1, -1, e ? 1 : 0);
  }
  sphere(c, r, col, s = 10) { this.ellipsoid(c, [r, 0, 0], [0, r, 0], [0, 0, r], col, s, Math.max(4, s >> 1)); }
  /* 원기둥 a→b, 반지름 r0→r1 (부드러운 옆면) */
  cyl(a, b, r0, r1, col, seg = 8, caps = false, o = {}) {
    const ax = norm(sub(b, a)), t = Math.abs(ax[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ax, t)), v = cross(ax, u);
    const ring = (p, r, k) => { const th = k / seg * Math.PI * 2, d = add(mul(u, Math.cos(th)), mul(v, Math.sin(th))); return { p: add(p, mul(d, r)), n: d }; };
    for (let k = 0; k < seg; k++) {
      const A = ring(a, r0, k), B = ring(a, r0, k + 1), C = ring(b, r1, k + 1), D = ring(b, r1, k);
      this.triN(A, B, C, col, o.e); this.triN(A, C, D, col, o.e);
      if (caps) {
        const na = mul(ax, -1);
        this.triN({ p: a, n: na }, { p: B.p, n: na }, { p: A.p, n: na }, col, o.e);
        this.triN({ p: b, n: ax }, { p: D.p, n: ax }, { p: C.p, n: ax }, col, o.e);
      }
    }
  }
  /* 점 여러 개를 잇는 가는 관 (전선 · 링거 줄) */
  tube(pts, r, col, seg = 5) { for (let i = 1; i < pts.length; i++) this.cyl(pts[i - 1], pts[i], r, r, col, seg); }
  /* 카메라를 보는 사각 (김 · 반짝) */
  billboard(c, B, w, h, col, o = {}) {
    const R = mul(B.r, w / 2), Uu = mul(B.u, h / 2);
    this.quad(add(sub(c, R), Uu), add(add(c, R), Uu), sub(add(c, R), Uu), sub(sub(c, R), Uu), col, o);
  }
}

/* ═════════════ 셰이더 ═════════════════════════════════════ */
const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute vec2 aUV; attribute float aE;
uniform mat4 uVP;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE;
void main(){ vP=aP; vN=aN; vC=aC; vUV=aUV; vE=aE; gl_Position=uVP*vec4(aP,1.0); }`;
const FS = `
precision mediump float;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE;
uniform vec3 uL[12]; uniform vec3 uLC[12]; uniform int uNL;
uniform vec3 uEye; uniform vec3 uFog; uniform float uFogD; uniform float uDim; uniform float uAlpha;
uniform vec3 uAmb; uniform sampler2D uTex;
void main(){
  vec3 c=vC;
  if(vUV.x>=0.0){ vec4 t=texture2D(uTex,vUV); c*=t.rgb; }
  vec3 col;
  if(vE>0.5){ col=c; }
  else{
    vec3 n=normalize(vN);
    if(dot(n,uEye-vP)<0.0) n=-n;
    vec3 acc=uAmb;
    for(int i=0;i<12;i++){
      if(i>=uNL) break;
      vec3 L=uL[i]-vP; float d=length(L); L/=d;
      float df=max(dot(n,L),0.0)*0.8+0.2;
      acc+=uLC[i]*df/(1.0+d*d*0.16);
    }
    col=c*acc;
  }
  float f=exp(-length(vP-uEye)*uFogD);
  col=mix(uFog,col,f)*uDim;
  gl_FragColor=vec4(col,uAlpha);
}`;

/* ═════════════ 색 ═══════════════════════════════════════ */
const C = {
  wall: hex('#3e4d62'), wall2: hex('#35435a'), floor: hex('#2c3644'), floor2: hex('#28313e'), ceil: hex('#1b222c'),
  seam: hex('#1e2632'), rail: hex('#55657a'), base: hex('#1a212b'), frame: hex('#4a586a'), leaf: hex('#2c3646'),
  dark: hex('#0b1018'), metal: hex('#8e9aa8'), metalD: hex('#5b6674'), bone: hex('#ddd6c4'), boneD: hex('#9d9684'),
  sheet: hex('#d4d9d8'), sheet2: hex('#e6eae8'), stripe: hex('#2f6fb5'), red: hex('#a8232a'), redL: hex('#c43a3e'),
  bag: hex('#d9cfcf'), cart: hex('#2c3644'), cartT: hex('#3e4a5a'), light: [.93, .96, 1.0], yellow: hex('#e3b23c'),
  black: hex('#15141b'), skin: hex('#c79a8a'), skinD: hex('#a77f74'), nail: hex('#ecc8bc'), gown: hex('#7d969c'),
  tape: hex('#f1ece0'), teal: hex('#00b89a'), white: hex('#e9edef'), cab: hex('#465365'), cab2: hex('#3a4656'),
  board: hex('#e8ebe6'), wood: hex('#5a4a3a'), glass: [.55, .7, .85]
};
const WIRE = ['#2f6fb5', '#c2352c', '#e3b23c', '#e9e3d5'].map(hex);

/* 문 · 창 · 모니터 자리 (엔딩 그림에서 옮김) */
const DOOR = { x0: -4.35, x1: -3.35, h: 2.35 };
const LOCK = { x0: -3.24, x1: -3.08, y0: 1.22, y1: 1.6 };
const WIN = { x0: -.9, x1: 1.2, y0: 1.6, y1: 2.75 };
const OBS = { z1: 9.4, floor: 1.5 };                      // 관찰실 — 창 너머, 바닥이 높음
const BED = { x0: -1.5, x1: .65, z0: 5.35, z1: 6.25, top: .78 };
const CART = [-1.95, 6.6];
const SKEL = [-2.75, 6.55];
const IV = [1.0, 5.2];
/* 부딪히는 것 — [x0, x1, z0, z1] */
const SOLID = [
  [BED.x0 - .05, BED.x1 + .05, BED.z0 - .02, BED.z1 + .02],
  [CART[0] - .3, CART[0] + .3, CART[1] - .28, RZ1], [SKEL[0] - .28, SKEL[0] + .28, SKEL[1] - .28, SKEL[1] + .28],
  [IV[0] - .26, IV[0] + .26, IV[1] - .26, IV[1] + .26],
  [-4.5, -1.4, 0, .62], [2.5, 4.6, 0, .62], [4.12, 4.6, 2.3, 4.7]
];

/* 텍스처 한 장 (512×512) — 칸마다 따로 그려 올림 */
const ATL = { ecg: [0, 0, 256, 160], data: [256, 0, 256, 160], board: [0, 160, 320, 160], clock: [320, 160, 128, 128],
              band: [448, 160, 64, 32], obsmon: [448, 192, 64, 48], exit: [0, 320, 128, 48], white: [500, 500, 8, 8] };
const uvOf = k => { const [x, y, w, h] = ATL[k]; return [x / 512, y / 512, (x + w) / 512, (y + h) / 512]; };

/* ═════════════ 방 짓기 (움직이지 않는 것) ═════════════════════════ */
function buildStatic() {
  const m = new Mesh();
  // ── 바닥 — 타일 사이 줄눈이 드러나도록 한 장씩
  m.box(RX0, RX1, -.05, 0, RZ0, RZ1, C.seam);
  for (let x = RX0; x < RX1 - .01; x += .6) for (let z = RZ0; z < RZ1 - .01; z += .6) {
    const k = ((Math.round(x / .6) + Math.round(z / .6)) & 1) ? C.floor : C.floor2;
    m.quad([x + .01, .001, z + .59], [x + .59, .001, z + .59], [x + .59, .001, z + .01], [x + .01, .001, z + .01], k);
  }
  // ── 천장 · 네 벽 (뒷벽은 관찰창 · 문 자리를 비우고 조각으로)
  m.quad([RX0, RCH, RZ0], [RX1, RCH, RZ0], [RX1, RCH, RZ1], [RX0, RCH, RZ1], C.ceil);
  m.quad([RX0, RCH, RZ0], [RX1, RCH, RZ0], [RX1, 0, RZ0], [RX0, 0, RZ0], C.wall);              // 앞벽
  m.quad([RX0, RCH, RZ1], [RX0, RCH, RZ0], [RX0, 0, RZ0], [RX0, 0, RZ1], C.wall2);             // 왼벽
  m.quad([RX1, RCH, RZ0], [RX1, RCH, RZ1], [RX1, 0, RZ1], [RX1, 0, RZ0], C.wall2);             // 오른벽
  const back = (x0, x1, y0, y1) => m.quad([x0, y1, RZ1], [x1, y1, RZ1], [x1, y0, RZ1], [x0, y0, RZ1], C.wall);
  back(RX0, DOOR.x0, 0, RCH); back(DOOR.x0, DOOR.x1, DOOR.h, RCH); back(DOOR.x1, WIN.x0, 0, RCH);
  back(WIN.x0, WIN.x1, 0, WIN.y0); back(WIN.x0, WIN.x1, WIN.y1, RCH); back(WIN.x1, RX1, 0, RCH);
  // 판넬 이음새 · 허리 띠 · 걸레받이
  for (let x = RX0 + .55; x < RX1; x += 1.15) {
    if (!(x > DOOR.x0 - .1 && x < DOOR.x1 + .1) && !(x > WIN.x0 - .1 && x < WIN.x1 + .1)) m.box(x - .006, x + .006, 0, RCH, RZ1 - .01, RZ1, C.seam);
    m.box(x - .006, x + .006, 0, RCH, RZ0, RZ0 + .01, C.seam);
  }
  for (let z = .6; z < RZ1; z += 1.15) { m.box(RX0, RX0 + .01, 0, RCH, z - .006, z + .006, C.seam); m.box(RX1 - .01, RX1, 0, RCH, z - .006, z + .006, C.seam); }
  const railZ = (y0, y1, col, d) => {
    m.box(RX0, RX1, y0, y1, RZ0, RZ0 + d, col);
    m.box(RX0, RX0 + d, y0, y1, RZ0, RZ1, col); m.box(RX1 - d, RX1, y0, y1, RZ0, RZ1, col);
    m.box(RX0, DOOR.x0, y0, y1, RZ1 - d, RZ1, col); m.box(DOOR.x1, RX1, y0, y1, RZ1 - d, RZ1, col);
  };
  railZ(.95, 1.06, C.rail, .03); railZ(0, .12, C.base, .02);
  // ── 천장 조명 여덟 — 격자 (엔딩 · 오프닝과 같은 모양)
  for (const cx of [-3.3, -1.1, 1.1, 3.3]) for (const cz of [2.3, 5.3]) {
    m.box(cx - .8, cx + .8, RCH - .05, RCH, cz - .36, cz + .36, C.seam);
    m.quad([cx - .74, RCH - .052, cz + .3], [cx + .74, RCH - .052, cz + .3], [cx + .74, RCH - .052, cz - .3], [cx - .74, RCH - .052, cz - .3], C.light, { e: true });
    for (let gx = cx - .74 + .148; gx < cx + .74; gx += .148) m.box(gx - .008, gx + .008, RCH - .06, RCH - .05, cz - .3, cz + .3, hex('#9fb0c4'));
    m.box(cx - .74, cx + .74, RCH - .06, RCH - .05, cz - .008, cz + .008, hex('#9fb0c4'));
  }
  // 감시 카메라 (관찰창 위 · 구석)
  m.box(.04, .26, 2.88, 2.98, RZ1 - .18, RZ1, C.dark); m.box(4.1, 4.4, 2.9, 3.0, RZ1 - .3, RZ1, C.dark);

  // ── 문 (뒷벽 왼쪽) — 문틀 · 경고 띠는 고정, 문짝은 매 프레임
  m.box(DOOR.x0 - .08, DOOR.x0, 0, DOOR.h + .08, RZ1 - .06, RZ1, C.frame);
  m.box(DOOR.x1, DOOR.x1 + .08, 0, DOOR.h + .08, RZ1 - .06, RZ1, C.frame);
  m.box(DOOR.x0 - .08, DOOR.x1 + .08, DOOR.h, DOOR.h + .08, RZ1 - .06, RZ1, C.frame);
  m.box(DOOR.x0, DOOR.x1, 0, DOOR.h, RZ1 + .4, RZ1 + .42, C.dark);                              // 문 너머 어둠
  m.box(DOOR.x0, DOOR.x0 + .01, 0, DOOR.h, RZ1, RZ1 + .4, C.dark); m.box(DOOR.x1 - .01, DOOR.x1, 0, DOOR.h, RZ1, RZ1 + .4, C.dark);
  // 키카드 잠금장치
  m.box(LOCK.x0, LOCK.x1, LOCK.y0, LOCK.y1, RZ1 - .05, RZ1, hex('#1a212b'));
  m.box(LOCK.x0 + .015, LOCK.x1 - .015, LOCK.y0 + .02, LOCK.y1 - .1, RZ1 - .052, RZ1 - .05, hex('#3a4656'));
  // ── 관찰창 — 두꺼운 틀, 그 너머 관찰실 (바닥이 높고 어두움)
  m.box(WIN.x0 - .1, WIN.x1 + .1, WIN.y0 - .1, WIN.y0, RZ1 - .1, RZ1 + .25, C.frame);
  m.box(WIN.x0 - .1, WIN.x1 + .1, WIN.y1, WIN.y1 + .1, RZ1 - .1, RZ1 + .25, C.frame);
  m.box(WIN.x0 - .1, WIN.x0, WIN.y0, WIN.y1, RZ1 - .1, RZ1 + .25, C.frame);
  m.box(WIN.x1, WIN.x1 + .1, WIN.y0, WIN.y1, RZ1 - .1, RZ1 + .25, C.frame);
  const ox0 = WIN.x0 - .35, ox1 = WIN.x1 + .35, oz0 = RZ1 + .25;
  m.box(ox0, ox1, OBS.floor - .05, OBS.floor, oz0, OBS.z1, hex('#1a2230'));                     // 관찰실 바닥
  m.quad([ox0, RCH, oz0], [ox1, RCH, oz0], [ox1, RCH, OBS.z1], [ox0, RCH, OBS.z1], hex('#121820'));
  m.quad([ox0, RCH, OBS.z1], [ox1, RCH, OBS.z1], [ox1, OBS.floor, OBS.z1], [ox0, OBS.floor, OBS.z1], hex('#202a38'));
  m.quad([ox0, RCH, oz0], [ox0, RCH, OBS.z1], [ox0, OBS.floor, OBS.z1], [ox0, OBS.floor, oz0], hex('#1c2533'));
  m.quad([ox1, RCH, OBS.z1], [ox1, RCH, oz0], [ox1, OBS.floor, oz0], [ox1, OBS.floor, OBS.z1], hex('#1c2533'));
  m.quad([ox0, OBS.floor, oz0], [ox1, OBS.floor, oz0], [ox1, WIN.y0, oz0], [ox0, WIN.y0, oz0], hex('#1c2533'));
  // 책상 · 빈 의자 · 모니터 · 머그잔 (관찰실)
  const df = OBS.floor;
  m.box(-.7, 1.0, df + .72, df + .76, 8.3, 8.95, hex('#2a3646'));
  for (const [x, z] of [[-.66, 8.34], [.96, 8.34], [-.66, 8.9], [.96, 8.9]]) m.box(x - .02, x + .02, df, df + .72, z - .02, z + .02, hex('#1a212b'));
  m.box(-.25, .2, df + .44, df + .5, 7.75, 8.15, hex('#141b26'));                               // 의자 — 비스듬히 밀려 나 있음
  m.obox([-.03, df + .78, 8.17], [.23, 0, -.04], [0, .28, 0], [.008, 0, .04], hex('#141b26'));
  m.cyl([-.02, df, 7.95], [-.02, df + .44, 7.95], .025, .025, hex('#2a313b'));
  m.box(.42, .88, df + .8, df + 1.12, 8.7, 8.76, hex('#11161d'));
  m.quad([.45, df + 1.09, 8.695], [.85, df + 1.09, 8.695], [.85, df + .83, 8.695], [.45, df + .83, 8.695], [1, 1, 1], { e: true, uv: uvOf('obsmon') });
  m.cyl([-.38, df + .76, 8.45], [-.38, df + .86, 8.45], .035, .035, C.white, 10, true);         // 머그잔
  m.cyl([-.33, df + .8, 8.45], [-.33, df + .83, 8.45], .012, .012, C.white, 6);
  // ── 벽걸이 모니터 두 대 (뒷벽 오른쪽) — 위는 심전도
  m.box(4.05, 4.12, 1.9, 2.75, RZ1 - .1, RZ1, C.metalD); m.box(3.7, 4.12, 2.25, 2.3, RZ1 - .25, RZ1 - .1, C.metalD);
  m.box(2.7, 4.1, 1.88, 2.72, RZ1 - .3, RZ1 - .2, hex('#262d37'));
  m.quad([2.76, 2.66, RZ1 - .302], [4.04, 2.66, RZ1 - .302], [4.04, 1.94, RZ1 - .302], [2.76, 1.94, RZ1 - .302], [1, 1, 1], { e: true, uv: uvOf('ecg') });
  m.box(2.85, 4.0, 1.06, 1.66, RZ1 - .1, RZ1, hex('#262d37'));
  m.quad([2.9, 1.61, RZ1 - .102], [3.95, 1.61, RZ1 - .102], [3.95, 1.11, RZ1 - .102], [2.9, 1.11, RZ1 - .102], [.8, .8, .8], { e: true, uv: uvOf('data') });
  // ── 뇌파 증폭기 카트
  const [cx, cz] = CART;
  m.box(cx - .28, cx + .28, .78, .82, cz - .24, cz + .24, C.metalD);
  m.box(cx - .28, cx + .28, .18, .21, cz - .24, cz + .24, C.metalD);
  for (const [x, z] of [[-.26, -.22], [.24, -.22], [-.26, .2], [.24, .2]]) { m.box(cx + x, cx + x + .025, .05, .82, cz + z, cz + z + .025, C.metal); m.sphere([cx + x + .012, .035, cz + z + .012], .035, hex('#20262e'), 6); }
  m.box(cx - .24, cx + .24, .82, 1.18, cz - .2, cz + .2, C.cart); m.box(cx - .24, cx + .24, 1.18, 1.2, cz - .2, cz + .2, C.cartT);
  for (let i = 0; i < 4; i++) m.box(cx - .16 + i * .09, cx - .1 + i * .09, .96, 1.04, cz - .202, cz - .2, hex('#11161d'));
  for (let i = 0; i < 4; i++) m.sphere([cx - .13 + i * .09, 1.1, cz - .205], .012, WIRE[i], 6);  // 전극선 꽂는 구멍 — 오방색
  // ── 골격 모형 — 던전의 해골
  buildSkeleton(m, SKEL[0], SKEL[1]);
  // ── 링거대와 붉은 배양액 — 던전의 피
  const [ix, iz] = IV;
  m.cyl([ix, .06, iz], [ix, 2.3, iz], .014, .014, C.metal, 8);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; m.cyl([ix, .06, iz], [ix + Math.cos(a) * .28, .03, iz + Math.sin(a) * .28], .012, .012, C.metal, 6); m.sphere([ix + Math.cos(a) * .28, .025, iz + Math.sin(a) * .28], .025, hex('#20262e'), 6); }
  m.cyl([ix - .14, 2.28, iz], [ix + .14, 2.28, iz], .008, .008, C.metal, 6);
  m.obox([ix, 2.02, iz], [.075, 0, 0], [0, .17, 0], [0, 0, .035], C.red);
  m.obox([ix, 2.22, iz], [.075, 0, 0], [0, .035, 0], [0, 0, .036], C.bag);
  m.box(ix - .045, ix + .045, 2.05, 2.1, iz - .037, iz - .035, C.tape);
  m.cyl([ix, 1.85, iz], [ix, 1.72, iz], .012, .008, C.bag, 6);
  // ── 침대 — 머리판 · 발판 · 틀 · 매트리스 · 베개 · 난간 · 바퀴
  const B = BED, bx0 = B.x0, bx1 = B.x1;
  m.box(bx0, bx1, .4, .5, B.z0, B.z1, C.metalD);
  for (const x of [bx0 + .06, bx1 - .06]) for (const z of [B.z0 + .06, B.z1 - .06]) { m.cyl([x, .08, z], [x, .4, z], .025, .025, C.metal, 6); m.sphere([x, .05, z], .05, hex('#20262e'), 6); }
  m.box(bx0 - .05, bx0, .4, 1.28, B.z0, B.z1, C.metal); m.box(bx0 - .05, bx0, 1.28, 1.3, B.z0, B.z1, hex('#b4bfcc'));
  m.box(bx1, bx1 + .05, .4, 1.02, B.z0, B.z1, C.metal); m.box(bx1, bx1 + .05, 1.02, 1.04, B.z0, B.z1, hex('#b4bfcc'));
  m.box(bx0, bx1, .5, .68, B.z0 + .02, B.z1 - .02, hex('#d9dee6'));                             // 매트리스
  for (const z of [B.z0 - .02, B.z1 + .02]) {                                                     // 난간
    m.cyl([bx0 + .25, .98, z], [bx1 - .45, .98, z], .014, .014, hex('#9aa6b4'), 6);
    for (const x of [bx0 + .25, (bx0 + bx1) / 2 - .1, bx1 - .45]) m.cyl([x, .68, z], [x, .98, z], .012, .012, hex('#9aa6b4'), 6);
  }
  return m;
}

/* 골격 모형 — 거치대에 걸린 뼈들. 방 안(−z)을 봄 */
function buildSkeleton(m, sx, sz) {
  const B = C.bone, D = C.boneD;
  m.cyl([sx, .03, sz + .08], [sx, 1.62, sz + .08], .012, .012, C.metalD, 6);                    // 거치대
  m.box(sx - .25, sx + .25, 0, .03, sz - .1, sz + .25, hex('#3d4652'));
  m.cyl([sx, 1.62, sz + .08], [sx, 1.62, sz + .01], .01, .01, C.metalD, 6);
  // 머리뼈 · 턱 · 눈구멍
  m.ellipsoid([sx, 1.72, sz], [.075, 0, 0], [0, .1, 0], [0, 0, .095], B, 12, 8);
  m.ellipsoid([sx, 1.63, sz - .02], [.05, 0, 0], [0, .035, 0], [0, 0, .06], D, 8, 5);
  for (const dx of [-.032, .032]) m.ellipsoid([sx + dx, 1.73, sz - .075], [.022, 0, 0], [0, .02, 0], [0, 0, .02], hex('#141018'), 6, 4);
  m.ellipsoid([sx, 1.69, sz - .088], [.01, 0, 0], [0, .016, 0], [0, 0, .01], hex('#141018'), 5, 3);
  for (let i = 0; i < 6; i++) m.box(sx - .035 + i * .013, sx - .025 + i * .013, 1.6, 1.62, sz - .075, sz - .07, C.white);   // 이
  // 척추 — 마디마디
  for (let i = 0; i < 17; i++) { const y = 1.55 - i * .045; m.ellipsoid([sx, y, sz + .03], [.018, 0, 0], [0, .016, 0], [0, 0, .018], i % 2 ? D : B, 6, 4); }
  // 쇄골 · 갈비 — 등 쪽 척추에서 앞으로 휘어 감음
  m.cyl([sx - .16, 1.46, sz - .02], [sx + .16, 1.46, sz - .02], .009, .009, B, 6);
  for (let i = 0; i < 7; i++) {
    const y = 1.42 - i * .045, rx = .13 - Math.abs(i - 2) * .008, rz = .09 - i * .004;
    for (const s of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 8; k++) { const th = k / 8 * Math.PI * .92; pts.push([sx + s * rx * Math.sin(th), y - .03 * Math.sin(th * .5), sz + .03 - rz * (1 - Math.cos(th)) ]); }
      m.tube(pts, .006, B, 5);
    }
  }
  m.box(sx - .012, sx + .012, 1.12, 1.44, sz - .16, sz - .145, B);                              // 복장뼈
  // 골반
  m.ellipsoid([sx, .86, sz + .01], [.15, 0, 0], [0, .07, 0], [0, 0, .07], B, 10, 6);
  m.ellipsoid([sx, .84, sz - .05], [.06, 0, 0], [0, .04, 0], [0, 0, .02], hex('#141018'), 8, 4);
  // 팔 — 위팔 · 아래팔 · 손
  for (const s of [-1, 1]) {
    const sh = [sx + s * .17, 1.45, sz], el = [sx + s * .21, 1.17, sz - .01], wr = [sx + s * .2, .92, sz - .05];
    m.sphere(sh, .028, B, 6); m.cyl(sh, el, .016, .013, B, 6); m.sphere(el, .022, B, 6);
    m.cyl(el, wr, .012, .01, B, 6); m.cyl(add(el, [s * .012, 0, 0]), add(wr, [s * .01, 0, 0]), .008, .008, D, 5);
    m.ellipsoid(add(wr, [0, -.05, 0]), [.025, 0, 0], [0, .05, 0], [0, 0, .012], B, 6, 4);
  }
  // 다리 — 넙다리 · 무릎 · 정강이 · 발
  for (const s of [-1, 1]) {
    const hp = [sx + s * .09, .84, sz], kn = [sx + s * .1, .47, sz - .02], an = [sx + s * .1, .07, sz];
    m.sphere(hp, .03, B, 6); m.cyl(hp, kn, .02, .016, B, 6); m.sphere(kn, .026, B, 6);
    m.cyl(kn, an, .014, .011, B, 6); m.cyl(add(kn, [s * .02, 0, 0]), add(an, [s * .018, 0, 0]), .008, .008, D, 5);
    m.box(an[0] - .035, an[0] + .035, .035, .06, an[2] - .14, an[2] + .03, B);
  }
}

/* 앞벽 (엔딩에선 안 보이던 쪽) — 캐비닛 · 화이트보드 · 시계 · 개수대 · 배양액 선반, 오른벽 선반 */
function buildFront(m) {
  for (let i = 0; i < 3; i++) {                                                                  // 캐비닛 셋
    const x0 = -4.45 + i * 1.02;
    m.box(x0, x0 + 1.0, 0, 2.1, RZ0, RZ0 + .6, C.cab);
    m.box(x0 + .02, x0 + .49, .1, 2.04, RZ0 + .6, RZ0 + .615, C.cab2); m.box(x0 + .51, x0 + .98, .1, 2.04, RZ0 + .6, RZ0 + .615, C.cab2);
    m.box(x0 + .44, x0 + .46, 1.0, 1.25, RZ0 + .615, RZ0 + .64, C.metal); m.box(x0 + .54, x0 + .56, 1.0, 1.25, RZ0 + .615, RZ0 + .64, C.metal);
  }
  // 화이트보드 — 07 · 세션 141 · 바를 정 자
  m.box(-.85, 1.65, .95, 2.15, RZ0, RZ0 + .03, C.metalD);
  m.quad([1.6, 2.1, RZ0 + .032], [-.8, 2.1, RZ0 + .032], [-.8, 1.0, RZ0 + .032], [1.6, 1.0, RZ0 + .032], [1, 1, 1], { uv: uvOf('board') });   // 앞벽은 −z 를 보며 읽으니 +x → −x
  m.box(-.8, 1.6, .93, .96, RZ0, RZ0 + .08, C.metalD);
  // 시계 (바늘은 그림)
  m.cyl([2.3, 2.45, RZ0], [2.3, 2.45, RZ0 + .04], .2, .2, hex('#20262e'), 16, true);
  m.quad([2.47, 2.62, RZ0 + .043], [2.13, 2.62, RZ0 + .043], [2.13, 2.28, RZ0 + .043], [2.47, 2.28, RZ0 + .043], [1, 1, 1], { uv: uvOf('clock') });
  // 개수대 · 위 선반의 붉은 배양액 병
  m.box(2.55, 4.55, 0, .9, RZ0, RZ0 + .6, C.cab); m.box(2.53, 4.57, .9, .94, RZ0, RZ0 + .62, hex('#9aa6b4'));
  m.box(3.2, 3.8, .86, .941, RZ0 + .15, RZ0 + .45, hex('#5b6674'));
  m.cyl([3.5, .94, RZ0 + .08], [3.5, 1.2, RZ0 + .08], .015, .015, C.metal, 6); m.cyl([3.5, 1.2, RZ0 + .08], [3.5, 1.2, RZ0 + .22], .013, .013, C.metal, 6);
  m.box(2.6, 4.5, 1.48, 1.52, RZ0, RZ0 + .3, C.metalD);
  for (let i = 0; i < 9; i++) { const x = 2.75 + i * .2, h = .16 + (i % 3) * .04;
    m.cyl([x, 1.52, RZ0 + .15], [x, 1.52 + h, RZ0 + .15], .045, .045, i % 4 === 3 ? hex('#cfd6dc') : C.red, 10, true);
    m.cyl([x, 1.52 + h, RZ0 + .15], [x, 1.56 + h, RZ0 + .15], .03, .03, C.metalD, 8, true); }
  // 오른벽 — 키 큰 선반 (상자 · 병)
  m.box(4.15, 4.6, 0, 2.3, 2.3, 4.7, C.cab2);
  for (const y of [.5, 1.0, 1.5, 2.0]) m.box(4.15, 4.6, y, y + .03, 2.3, 4.7, C.metalD);
  for (let i = 0; i < 8; i++) { const y = [.53, 1.03, 1.53, 2.03][i % 4], z = 2.45 + (i * .53) % 2.0;
    m.box(4.2, 4.5, y, y + .25 + (i % 2) * .1, z, z + .35, i % 3 ? hex('#8a7b62') : hex('#5b6674')); }
  // 왼벽 — 소화기 · 비상 안내판
  m.cyl([RX0 + .12, .1, 3.2], [RX0 + .12, .62, 3.2], .08, .08, hex('#b0262a'), 12, true);
  m.cyl([RX0 + .12, .62, 3.2], [RX0 + .12, .7, 3.2], .03, .03, C.black, 8, true);
  m.quad([RX0 + .011, 1.9, 3.6], [RX0 + .011, 1.9, 4.2], [RX0 + .011, 1.66, 4.2], [RX0 + .011, 1.66, 3.6], [1, 1, 1], { uv: uvOf('exit'), e: true });
}

/* ═════════════ 텍스처 칸 그리기 ═════════════════════════════════ */
function drawEcg(x, w, h, t, wires) {
  x.fillStyle = '#04120a'; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(40,120,60,.35)'; x.lineWidth = 1;
  for (let gx = 0; gx < w; gx += 16) { x.beginPath(); x.moveTo(gx + .5, 0); x.lineTo(gx + .5, h); x.stroke(); }
  for (let gy = 0; gy < h; gy += 16) { x.beginPath(); x.moveTo(0, gy + .5); x.lineTo(w, gy + .5); x.stroke(); }
  const flat = wires <= 0, alarm = flat && (t >> 4) % 2;
  x.strokeStyle = flat ? (alarm ? '#ff4848' : '#a03030') : '#46ff78'; x.lineWidth = 2.2;
  x.beginPath();
  for (let i = 0; i < w; i += 2) {
    let y = h * .55;
    if (!flat) {
      const ph = (t * 2.2 + i) % 110, wob = (4 - wires) * 1.6;
      if (ph > 70 && ph < 76) y -= (ph - 70) * 8; else if (ph >= 76 && ph < 80) y += 20 - (ph - 76) * 5; else if (ph >= 80 && ph < 84) y += 8;
      y += (Math.random() - .5) * wob;
    }
    i ? x.lineTo(i, y) : x.moveTo(i, y);
  }
  x.stroke();
  x.font = 'bold 30px monospace'; x.fillStyle = flat ? (alarm ? '#ff6060' : '#803030') : '#46ff78';
  x.fillText(flat ? '---' : String(60 + (4 - wires) * 9), 10, 34);
  x.font = '13px monospace'; x.fillText('HR  · 07', w - 74, 22);
  if (flat && alarm) { x.fillStyle = 'rgba(255,60,60,.25)'; x.fillRect(0, 0, w, h); }
}
function drawData(x, w, h, t) {
  x.fillStyle = '#040c0b'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) { const v = .3 + .6 * Math.abs(Math.sin(t * .02 + i * 1.7));
    x.fillStyle = i % 4 === 3 ? '#e3b23c' : '#3fb7a0'; x.fillRect(12 + i * 19, h - 14 - v * (h - 40), 12, v * (h - 40)); }
  x.font = '12px monospace'; x.fillStyle = '#7de3c8'; x.fillText('EEG  δ θ α β', 12, 18);
}
function drawBoard(x, w, h) {
  x.fillStyle = '#f2f4f0'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 6; i++) x.fillRect(20 + i * 50, 10 + i * 9, 40, 2);
  x.strokeStyle = '#2b4a8a'; x.fillStyle = '#2b4a8a'; x.lineWidth = 2.5; x.font = 'bold 26px sans-serif';
  x.fillText('피험자 07', 18, 40);
  x.font = '17px sans-serif'; x.fillText('세션  141  / 각성  0', 18, 70);
  x.fillStyle = '#a8232a'; x.fillText('※ 우물 서사 유지', 18, 98);
  x.strokeStyle = '#333'; x.lineWidth = 2;                                    // 바를 정 자로 센 세션
  for (let g = 0; g < 6; g++) for (let k = 0; k < 5; k++) {
    const gx = 190 + (g % 3) * 40, gy = 112 + Math.floor(g / 3) * 22;
    x.beginPath();
    if (k === 0) { x.moveTo(gx, gy); x.lineTo(gx + 20, gy); } else if (k === 1) { x.moveTo(gx + 10, gy); x.lineTo(gx + 10, gy + 16); }
    else if (k === 2) { x.moveTo(gx + 10, gy + 8); x.lineTo(gx + 18, gy + 8); } else if (k === 3) { x.moveTo(gx + 4, gy + 6); x.lineTo(gx + 4, gy + 16); }
    else { x.moveTo(gx, gy + 16); x.lineTo(gx + 20, gy + 16); }
    x.stroke();
  }
  x.fillStyle = '#555'; x.font = '13px sans-serif'; x.fillText('5/1 → 5/20', 18, 140);
}
function drawClock(x, w, h, t) {
  x.fillStyle = '#eef0ec'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 2, 0, 7); x.fill();
  x.fillStyle = '#222';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.fillRect(w / 2 + Math.sin(a) * 52 - 2, h / 2 - Math.cos(a) * 52 - 2, 4, 4); }
  const sec = (t / 60) % 60, hand = (a, l, wdt, col) => { x.strokeStyle = col; x.lineWidth = wdt; x.beginPath(); x.moveTo(w / 2, h / 2); x.lineTo(w / 2 + Math.sin(a) * l, h / 2 - Math.cos(a) * l); x.stroke(); };
  hand((3 + 41 / 60) / 12 * Math.PI * 2, 30, 5, '#222'); hand(41 / 60 * Math.PI * 2, 46, 3.5, '#222'); hand(sec / 60 * Math.PI * 2, 50, 1.5, '#c2352c');
}
function drawBand(x, w, h) {
  x.fillStyle = '#eef1f2'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#2a2a30'; x.font = 'bold 20px monospace'; x.fillText('07', 4, 23);
  x.fillStyle = '#999'; x.fillRect(36, 8, 24, 2); x.fillRect(36, 14, 18, 2); x.fillRect(36, 20, 22, 2);
}
function drawObsMon(x, w, h, t) {
  x.fillStyle = '#0d3a1e'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#40ff70'; x.lineWidth = 2; x.beginPath();
  for (let i = 0; i < w; i += 2) { const y = h / 2 + Math.sin((t + i * 3) * .1) * 6; i ? x.lineTo(i, y) : x.moveTo(i, y); }
  x.stroke();
}
function drawExit(x, w, h) {
  x.fillStyle = '#0d3a1e'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#5cff96'; x.fillRect(3, 3, w - 6, h - 6);
  x.fillStyle = '#0d3a1e'; x.font = 'bold 26px sans-serif'; x.fillText('EXIT', 30, 34);
}

/* ═════════════ 내 몸 — 어깨 · 팔꿈치 · 손목 · 손 (관절로 이어 끊기지 않음) ═════════════ */
/* 두 관절 사이를 정해진 길이로 굽혀 잇기 — 팔꿈치 자리 */
function elbowOf(S, Wr, l1, l2, pole) {
  const d = sub(Wr, S), dl = Math.min(len(d), l1 + l2 - 1e-4), dir = norm(d);
  const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const po = norm(sub(pole, mul(dir, dot(pole, dir))));
  return add(add(S, mul(dir, a)), mul(po, h));
}
/* 손 하나 — 손바닥(타원체) · 손가락 넷(세 마디씩 살짝 굽음) · 엄지 · 손톱. fwd 손끝 쪽, up 손등 쪽, side 엄지 반대쪽 */
function buildHand(m, Wr, fwd, up, thumbSide, cannula) {
  const side = norm(cross(fwd, up));                      // 오른손 기준 바깥쪽
  const sk = C.skin, skD = C.skinD;
  const palmC = add(add(Wr, mul(fwd, .055)), mul(up, .004));
  m.ellipsoid(palmC, mul(fwd, .058), mul(up, .02), mul(side, .044), sk, 12, 8);
  // 손목 마디 — 팔뚝과 손바닥 사이를 메움
  m.ellipsoid(add(Wr, mul(fwd, .008)), mul(fwd, .03), mul(up, .02), mul(side, .036), sk, 10, 6);
  const fingers = [[-.03, .86], [-.01, 1.0], [.01, .95], [.031, .76]];   // [옆 위치, 길이 배율] — 검지 → 새끼
  fingers.forEach(([so, k]) => {
    const s = so * thumbSide;
    let p = add(add(add(Wr, mul(fwd, .105)), mul(side, s)), mul(up, .004)), dir = fwd;
    const segs = [.042 * k, .027 * k, .02 * k], rad = [.0095, .0085, .0075];
    for (let i = 0; i < 3; i++) {
      dir = norm(add(dir, mul(up, -.2)));                // 마디마다 살짝 아래로 굽음
      const q = add(p, mul(dir, segs[i]));
      m.sphere(p, rad[i] * 1.06, i === 0 ? skD : sk, 8);
      m.cyl(p, q, rad[i], rad[i] * .92, sk, 8);
      if (i === 2) {
        m.sphere(q, rad[i] * .9, sk, 8);
        const nb = add(add(p, mul(dir, segs[i] * .45)), mul(norm(add(up, mul(dir, .25))), rad[i] * .8));
        m.obox(nb, mul(dir, segs[i] * .42), mul(up, .0012), mul(side, rad[i] * .7), C.nail);   // 손톱
      }
      p = q;
    }
  });
  // 엄지 — 손바닥 안쪽에서 비스듬히
  let tp = add(add(add(Wr, mul(fwd, .035)), mul(side, -.04 * thumbSide)), mul(up, -.004));
  let td = norm(add(add(mul(fwd, .7), mul(side, -.55 * thumbSide)), mul(up, -.15)));
  for (let i = 0; i < 2; i++) {
    const q = add(tp, mul(td, i ? .03 : .04));
    m.sphere(tp, .0115, sk, 8); m.cyl(tp, q, .011, .01, sk, 8);
    if (i === 1) { m.sphere(q, .0095, sk, 8); m.obox(add(add(tp, mul(td, .018)), mul(up, .008)), mul(td, .012), mul(up, .0012), mul(side, .007), C.nail); }
    tp = q; td = norm(add(td, mul(side, .25 * thumbSide)));
  }
  // 손등 힘줄 · 핏줄 (희미하게)
  for (let i = 0; i < 3; i++) {
    const a = add(add(Wr, mul(fwd, .025)), mul(side, (-.016 + i * .016) * thumbSide)), b = add(add(Wr, mul(fwd, .09)), mul(side, (-.026 + i * .02) * thumbSide));
    m.cyl(add(a, mul(up, .021)), add(b, mul(up, .019)), .0022, .002, i === 1 ? hex('#9fa6c0') : skD, 4);
  }
  if (cannula) {                                          // 의료 테이프 · 청록 캐뉼라
    const tc = add(add(Wr, mul(fwd, .05)), mul(up, .024));
    m.obox(tc, mul(fwd, .022), mul(up, .003), mul(side, .03), C.tape);
    m.cyl(add(tc, mul(up, .004)), add(add(tc, mul(up, .012)), mul(fwd, -.03)), .006, .005, C.teal, 6);
  }
}
/* 팔 하나 — 소매(환자복) · 팔뚝 · 팔찌(링거 반대쪽) · 손. 관절 사이를 원기둥으로 이어 끊기지 않음 */
function buildArm(m, S, El, Wr, fwd, up, left, band) {
  const sl = lerp3(El, Wr, .3);
  m.sphere(S, .05, C.gown, 10); m.cyl(S, El, .047, .043, C.gown, 10); m.sphere(El, .043, C.gown, 10);
  m.cyl(El, sl, .043, .04, C.gown, 10);                   // 걷어 올린 소매 끝
  m.cyl(add(sl, mul(norm(sub(sl, El)), -.006)), add(sl, mul(norm(sub(sl, El)), .006)), .046, .046, hex('#9db3b8'), 10);
  m.cyl(lerp3(El, Wr, .2), Wr, .036, .027, C.skin, 10);   // 팔뚝 — 손목으로 갈수록 가늘게
  if (band) {                                             // 환자 팔찌 — 흰 띠, 위에 07
    const bc = lerp3(El, Wr, .87), ax = norm(sub(Wr, El));
    m.cyl(add(bc, mul(ax, -.012)), add(bc, mul(ax, .012)), .032, .032, C.white, 12, true);
    m.quad(add(add(bc, mul(up, .0335)), mul(ax, -.012)), add(add(bc, mul(up, .0335)), mul(ax, .012)),
           add(add(add(bc, mul(up, .03)), mul(ax, .012)), mul(norm(cross(ax, up)), .016)), add(add(add(bc, mul(up, .03)), mul(ax, -.012)), mul(norm(cross(ax, up)), .016)),
           [1, 1, 1], { uv: uvOf('band') });
  }
  buildHand(m, Wr, fwd, up, left ? -1 : 1, left);   // 캐뉼라는 링거대 쪽 손
}

/* ═════════════ 렌더러 ═══════════════════════════════════════ */
class LabRoom {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = VW; this.canvas.height = VH;
    const gl = this.canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }) || this.canvas.getContext('experimental-webgl');
    this.ok = !!gl;
    if (!gl) return;
    this.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr; gl.useProgram(pr);
    this.at = ['aP', 'aN', 'aC', 'aUV', 'aE'].map(n => gl.getAttribLocation(pr, n));
    this.un = {}; ['uVP', 'uL', 'uLC', 'uNL', 'uEye', 'uFog', 'uFogD', 'uDim', 'uAlpha', 'uAmb', 'uTex'].forEach(n => this.un[n] = gl.getUniformLocation(pr, n));
    // 정적 메시
    const m = buildStatic(); buildFront(m);
    this.stat = this.upload(new Float32Array(m.v)); this.statN = m.v.length / 12;
    this.dyn = gl.createBuffer();
    // 텍스처 한 장
    this.atlas = document.createElement('canvas'); this.atlas.width = 512; this.atlas.height = 512;
    const ax = this.atlas.getContext('2d');
    ax.fillStyle = '#fff'; ax.fillRect(0, 0, 512, 512);
    this.region = k => { const [x, y, w, h] = ATL[k]; ax.save(); ax.beginPath(); ax.rect(x, y, w, h); ax.clip(); ax.translate(x, y); return [ax, w, h]; };
    const once = (k, fn) => { const [x, w, h] = this.region(k); fn(x, w, h); ax.restore(); };
    once('board', drawBoard); once('band', drawBand); once('exit', drawExit);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.lights = [];
    for (const cx of [-3.3, -1.1, 1.1, 3.3]) for (const cz of [2.3, 5.3]) this.lights.push([cx, RCH - .2, cz]);
    this.lights.push([.3, 2.4, 8.6]);                     // 관찰실 — 모니터의 초록 빛
    this.lights.push([3.4, 2.3, 6.4]);                    // 심전도 모니터 앞
  }
  upload(arr) { const gl = this.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; }
  bind(buf) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const sz = [3, 3, 3, 2, 1]; let off = 0;
    this.at.forEach((a, i) => { if (a < 0) { off += sz[i]; return; } gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, sz[i], gl.FLOAT, false, 48, off * 4); off += sz[i]; });
  }

  /* 한 장 그리기. st : { cam, t, wires, wirePull[4], ivOut, ivT, rise, sit, doorSlide, dim, steam } */
  render(st) {
    const gl = this.gl, c = st.cam, B = camBasis(c);
    // ── 매 프레임 바뀌는 그림
    const live = (k, fn) => { const [x, w, h] = this.region(k); fn(x, w, h); x.restore(); };
    live('ecg', (x, w, h) => drawEcg(x, w, h, st.t, st.wires));
    live('data', (x, w, h) => drawData(x, w, h, st.t));
    live('clock', (x, w, h) => drawClock(x, w, h, st.t));
    live('obsmon', (x, w, h) => drawObsMon(x, w, h, st.t));
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);
    // ── 매 프레임 바뀌는 모양 — 문짝 · 잠금장치 불빛 · 담요 밑 다리 · 내 몸 · 전극선 · 링거 줄
    const d = new Mesh();
    const ds = st.doorSlide || 0, lx = DOOR.x0 + ds * (DOOR.x1 - DOOR.x0 - .02);
    if (lx < DOOR.x1 - .02) {
      d.box(lx, DOOR.x1, 0, DOOR.h, RZ1 - .04, RZ1 - .01, C.leaf);
      const w0 = Math.max(lx, DOOR.x0 + .25), w1 = Math.min(DOOR.x1, lx + .75);
      if (w1 > w0) d.box(w0, w1, 1.6, 1.9, RZ1 - .042, RZ1 - .04, C.dark);
      for (let i = 0; i < 8; i++) { const a = lx + i * .125, b = Math.min(DOOR.x1, a + .125); if (b > a) d.box(a, b, .06, .16, RZ1 - .043, RZ1 - .041, i % 2 ? C.yellow : C.black); }
      if (lx + .88 < DOOR.x1) d.box(lx + .82, lx + .88, .98, 1.04, RZ1 - .08, RZ1 - .04, hex('#8e9aa8'));
    }
    if (ds > 0) d.quad([DOOR.x0 + .3, 1.9, RZ1 + .38], [DOOR.x1 - .3, 1.9, RZ1 + .38], [DOOR.x1 - .3, 1.75, RZ1 + .38], [DOOR.x0 + .3, 1.75, RZ1 + .38], [.4 * ds, 1 * ds, .6 * ds], { e: true });
    const led = (st.t >> 5) % 2 ? [.25, 1, .44] : [.12, .55, .23];
    d.box(LOCK.x0 + .04, LOCK.x1 - .04, LOCK.y1 - .08, LOCK.y1 - .05, RZ1 - .056, RZ1 - .052, led, { e: true });
    // 담요 — 흰 바탕 · 파란 줄, 밑으로 다리 굴곡 (일어서면 납작해짐)
    const legH = .085 * (1 - (st.rise || 0)) * (st.sit ? 1 : .9);
    d.box(BED.x0 + .01, BED.x1 - .01, .68, .72, BED.z0 + .03, BED.z1 - .03, C.sheet);
    d.box(BED.x0 + .45, BED.x0 + .58, .72, .725, BED.z0 + .03, BED.z1 - .03, C.stripe);
    if (legH > .005) for (const z of [5.68, 5.92]) d.ellipsoid([-.12, .72, z], [.62, 0, 0], [0, legH, 0], [0, 0, .1], C.sheet2, 14, 6);
    d.ellipsoid([BED.x0 + .22, .76, 5.8], [.15, 0, 0], [0, .06, 0], [0, 0, .3], hex('#eef1f5'), 12, 6);   // 베개
    // 링거 줄 — 백에서 오른손 캐뉼라까지 (뽑으면 바닥으로 늘어짐)
    const bagB = [IV[0], 1.72, IV[1]];
    // ── 내 몸
    const body = st.body;
    if (body) {
      body.arms.forEach(a => buildArm(d, a.S, a.E, a.W, a.fwd, a.up, a.left, !a.left));
      const cannula = body.cannula;
      if (!st.ivOut) d.tube(bez(bagB, [lerp(bagB[0], cannula[0], .5), .95, lerp(bagB[2], cannula[2], .6)], cannula, 16), .0035, C.redL);
      else d.tube(bez(bagB, [bagB[0] - .1, .9, bagB[2] - .05], [bagB[0] - .3, .02, bagB[2] - .2], 12), .0035, C.redL);
      if (st.ivOut && (st.ivT || 0) < 200) d.sphere(add(cannula, [0, .006 + Math.min(1, (st.ivT || 0) / 60) * -.0, 0]), .006 + Math.min(1, (st.ivT || 0) / 50) * .003, hex('#9a1822'), 8);
      // 전극선 — 머리에서 무릎 위로, 침대 뒤로 넘어가 카트까지 (떼면 머리 쪽 끝이 떨어져 바닥으로)
      body.wires.forEach((wp, i) => {
        const v = st.wirePull[i];
        const cartP = [CART[0] - .13 + i * .09, 1.1, CART[1] - .21];
        if (v >= 1) { d.tube(bez(cartP, [cartP[0] + .3, .3, cartP[2] - .2], [-.9 + i * .12, .01, 6.35 + i * .05], 10), .0042, WIRE[i]); return; }
        const head = wp.head, lap = wp.lap;
        const loose = add(lerp3(head, [lap[0] + .2, .02, 6.4], v), [0, 0, 0]);
        const a = lerp3(head, loose, v);
        const pts = [...bez(a, lerp3(wp.mid, [lerp(a[0], lap[0], .5), Math.max(a[1], lap[1]) + .02, lerp(a[2], lap[2], .5)], v), lap, 10),
                     ...bez(lap, [lap[0], .9, 6.35], [BED.x0 + .3, .75, 6.32], 6).slice(1),
                     ...bez([BED.x0 + .3, .75, 6.32], [CART[0] + .4, .1, 6.45], cartP, 8).slice(1)];
        d.tube(pts, .0042, WIRE[i]);
        if (v === 0) d.sphere(head, .011, WIRE[i], 6);       // 머리에 붙은 전극
      });
    }
    // 김 — 관찰실 머그잔 위
    const steam = new Mesh();
    for (let i = 0; i < 6; i++) { const ph = ((st.t * .006 + i / 6) % 1);
      steam.billboard([-.38 + Math.sin(ph * 6 + i) * .02, OBS.floor + .9 + ph * .22, 8.45], B, .03 + ph * .05, .05 + ph * .05, [.85, .9, .95]); }
    const glass = new Mesh();
    glass.quad([WIN.x0, WIN.y1, RZ1 + .05], [WIN.x1, WIN.y1, RZ1 + .05], [WIN.x1, WIN.y0, RZ1 + .05], [WIN.x0, WIN.y0, RZ1 + .05], C.glass);
    glass.quad([WIN.x0 + .2, WIN.y1 - .05, RZ1 + .049], [WIN.x0 + .26, WIN.y1 - .05, RZ1 + .049], [WIN.x0 + .1, WIN.y0 + .3, RZ1 + .049], [WIN.x0 + .04, WIN.y0 + .3, RZ1 + .049], [1, 1, 1]);

    // ── 그리기
    gl.viewport(0, 0, VW, VH);
    gl.clearColor(.02, .03, .045, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    const eye = [c.x, c.y, c.z];
    const P = perspective(62 * Math.PI / 180, VW / VH, .02, 40), V = lookAt(eye, add(eye, B.f), B.u);
    for (let k = 0; k < 16; k += 4) V[k] = -V[k];          // 좌우 반전 — 엔딩 컷과 같은 배치 (문 · 해골은 왼쪽, 링거 · 모니터는 오른쪽)
    gl.uniformMatrix4fv(this.un.uVP, false, new Float32Array(mat4mul(P, V)));
    const L = this.lights, flat = [], col = [];
    L.forEach((p, i) => { flat.push(...p); col.push(...(i < 8 ? [.42, .44, .48] : i === 8 ? [.05, .22, .1] : [.06, .2, .1])); });
    gl.uniform3fv(this.un.uL, new Float32Array(flat)); gl.uniform3fv(this.un.uLC, new Float32Array(col)); gl.uniform1i(this.un.uNL, L.length);
    gl.uniform3fv(this.un.uEye, new Float32Array(eye)); gl.uniform3fv(this.un.uFog, new Float32Array([.02, .03, .045]));
    gl.uniform1f(this.un.uFogD, .055); gl.uniform1f(this.un.uDim, st.dim == null ? 1 : st.dim);
    gl.uniform3fv(this.un.uAmb, new Float32Array([.2, .22, .26])); gl.uniform1i(this.un.uTex, 0); gl.uniform1f(this.un.uAlpha, 1);
    gl.disable(gl.BLEND); gl.depthMask(true);
    this.bind(this.stat); gl.drawArrays(gl.TRIANGLES, 0, this.statN);
    const drawDyn = (mesh) => { if (!mesh.v.length) return; gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.v), gl.DYNAMIC_DRAW); this.bind(this.dyn); gl.drawArrays(gl.TRIANGLES, 0, mesh.v.length / 12); };
    drawDyn(d);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(this.un.uAlpha, .12); drawDyn(glass);
    gl.uniform1f(this.un.uAlpha, .1); drawDyn(steam);
    gl.depthMask(true); gl.disable(gl.BLEND);
    return this.canvas;
  }

  /* 걷기 — 벽 · 가구에 부딪히면 밀려남 (원 하나 vs 상자들) */
  static collide(x, z, r = .26) {
    x = Math.max(RX0 + r, Math.min(RX1 - r, x)); z = Math.max(RZ0 + r, Math.min(RZ1 - r, z));
    for (const [x0, x1, z0, z1] of SOLID) {
      const nx = Math.max(x0, Math.min(x1, x)), nz = Math.max(z0, Math.min(z1, z));
      const dx = x - nx, dz = z - nz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-4) { x = nx + dx / d * r; z = nz + dz / d * r; }
        else { const o = [x - x0, x1 - x, z - z0, z1 - z], m = Math.min(...o);
          if (m === o[0]) x = x0 - r; else if (m === o[1]) x = x1 + r; else if (m === o[2]) z = z0 - r; else z = z1 + r; }
      }
    }
    return [x, z];
  }
}
const bez = (a, m, d, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [0, 1, 2].map(k => u * u * a[k] + 2 * u * t * m[k] + t * t * d[k]); });

/* 내 몸의 자세 — 누움(이불 위 팔) → 앉음(무릎 위 손) → 섬(몸 옆에 늘어뜨린 손). 관절은 늘 이어져 있음
   sitK : 0 누움 ‥ 1 앉음,  rise : 0 앉음 ‥ 1 섬 */
function bodyPose(cam, rise, sitK = 1) {
  const B = camBasis({ yaw: cam.yaw, pitch: 0, roll: 0 });
  const eye = [cam.x, cam.y, cam.z], fwdH = norm([B.f[0], 0, B.f[2]]), right = norm(cross(fwdH, [0, 1, 0]));
  const at = (o, f, r, y) => [o[0] + fwdH[0] * f + right[0] * r, y, o[2] + fwdH[2] * f + right[2] * r];
  const arms = [true, false].map(left => {
    const sgn = left ? -1 : 1;
    // 누움 — 어깨는 베개 옆, 팔은 이불 위로 발 쪽을 향해 쭉
    const Slie = at(eye, .16, sgn * .2, .8), Wlie = at(eye, .58, sgn * .25, .765);
    // 앉음 — 손등이 위, 손끝이 앞 (무릎 위)
    const Ssit = add(add(eye, mul(right, sgn * .19)), [0, -.23, 0]);
    const Wsit = add(add(add(eye, mul(fwdH, .44)), mul(right, sgn * .13)), [0, -.42, 0]);
    // 섬 — 손이 몸 옆으로 늘어짐
    const Whang = add(add(Ssit, mul(right, sgn * .06)), [0, -.52, 0]);
    const S = lerp3(Slie, Ssit, sitK);
    const W = lerp3(lerp3(Wlie, Wsit, sitK), Whang, rise);
    const fwd = norm(lerp3(norm(add(fwdH, [0, -.08, 0])), [0, -1, 0], rise));
    const up = norm(lerp3([0, 1, 0], mul(right, sgn), rise));
    const pole = add(mul(right, sgn * .7), [0, -.6 * sitK + .15 * (1 - sitK), 0]);
    const E = elbowOf(S, W, .29, .27, pole);
    return { left, S, E, W, fwd, up };
  });
  const R = arms[0];                                     // 링거대 쪽 팔
  const cannula = add(add(R.W, mul(R.fwd, .045)), mul(R.up, .034));
  const wires = [0, 1, 2, 3].map(i => {
    const ro = (i - 1.5) * .045;
    // 누우면 관자놀이에서 베개 옆으로, 앉으면 정수리에서 무릎 위로
    const headLie = at(eye, -.04, ro * 1.6, eye[1] + .02), headSit = add(add(add(eye, [0, .08, 0]), mul(fwdH, -.05)), mul(right, ro * 2.4));
    const lapR = (i < 2 ? -1 : 1) * (.26 + (i % 2) * .06), lapF = .62 + (i % 2) * .08;
    const lapLie = at(eye, lapF - .1, lapR * 1.25, .78), lapSit = add(add(add(eye, mul(fwdH, lapF)), mul(right, lapR)), [0, -.6, 0]);
    // 머리 옆을 돌아 어깨 바깥으로 흘러내림 — 눈앞을 가로지르지 않게
    const side = Math.sign(lapR), midLie = at(eye, .12, side * .34, .86);
    const midSit = add(add(add(eye, mul(right, side * (.34 + (i % 2) * .05))), mul(fwdH, -.04)), [0, -.2, 0]);
    return { head: lerp3(headLie, headSit, sitK), mid: lerp3(midLie, midSit, sitK), lap: lerp3(lapLie, lapSit, sitK) };
  });
  return { arms, cannula, wires };
}

window.LabRoom = LabRoom;
window.LabRoomGeo = { RX0, RX1, RZ0, RZ1, DOOR, LOCK, WIN, BED, CART, SKEL, IV, camBasis, bodyPose };
})();
