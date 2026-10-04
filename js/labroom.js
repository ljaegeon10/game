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
/* 꼭짓점의 마지막 값 : 0 무광 · 1 스스로 빛남 · 2+s 광택 (s 0‥1, 금속일수록 큼) */
const ecode = o => o.m != null ? o.m : o.e ? 1 : o.s ? 2 + Math.min(.99, o.s) : 0;   // o.m : 재질 번호를 직접 (figure3d.js)
class Mesh {
  constructor() { this.v = []; }
  tri(a, b, c, n, col, e, uva, uvb, uvc) {
    const push = (p, uv) => this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], uv ? uv[0] : -1, uv ? uv[1] : -1, +e || 0);
    push(a, uva); push(b, uvb); push(c, uvc);
  }
  quad(a, b, c, d, col, o = {}) {
    const n = norm(cross(sub(b, a), sub(d, a)));
    const uv = o.uv;                                 // [u0, v0, u1, v1] — a 왼위 · b 오른위 · c 오른아래 · d 왼아래
    const A = uv && [uv[0], uv[1]], B = uv && [uv[2], uv[1]], C = uv && [uv[2], uv[3]], D = uv && [uv[0], uv[3]];
    const e = ecode(o); this.tri(a, b, c, n, col, e, A, B, C); this.tri(a, c, d, n, col, e, A, C, D);
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
      this.triN(A, B, C, col, ecode(o)); this.triN(A, C, D, col, ecode(o));
    }
  }
  triN(A, B, C, col, e) {
    for (const X of [A, B, C]) this.v.push(X.p[0], X.p[1], X.p[2], X.n[0], X.n[1], X.n[2], col[0], col[1], col[2], -1, -1, +e || 0);
  }
  sphere(c, r, col, s = 10, o = {}) { this.ellipsoid(c, [r, 0, 0], [0, r, 0], [0, 0, r], col, s, Math.max(4, s >> 1), o); }
  /* 원기둥 a→b, 반지름 r0→r1 (부드러운 옆면) */
  cyl(a, b, r0, r1, col, seg = 8, caps = false, o = {}) {
    const ax = norm(sub(b, a)), t = Math.abs(ax[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ax, t)), v = cross(ax, u);
    const ring = (p, r, k) => { const th = k / seg * Math.PI * 2, d = add(mul(u, Math.cos(th)), mul(v, Math.sin(th))); return { p: add(p, mul(d, r)), n: d }; };
    for (let k = 0; k < seg; k++) {
      const A = ring(a, r0, k), B = ring(a, r0, k + 1), C = ring(b, r1, k + 1), D = ring(b, r1, k);
      const e = ecode(o);
      this.triN(A, B, C, col, e); this.triN(A, C, D, col, e);
      if (caps) {
        const na = mul(ax, -1);
        this.triN({ p: a, n: na }, { p: B.p, n: na }, { p: A.p, n: na }, col, e);
        this.triN({ p: b, n: ax }, { p: D.p, n: ax }, { p: C.p, n: ax }, col, e);
      }
    }
  }
  /* 점 여러 개를 잇는 가는 관 (전선 · 링거 줄) */
  tube(pts, r, col, seg = 5, o = {}) {
    for (let i = 1; i < pts.length; i++) this.cyl(pts[i - 1], pts[i], r, r, col, seg, false, o);
    if (o.joints) for (let i = 1; i < pts.length - 1; i++) this.sphere(pts[i], r, col, seg, o);
  }
  /* 모서리를 깎은 상자 — 깎인 면이 빛을 받아 테두리가 또렷해짐 */
  rbox(x0, x1, y0, y1, z0, z1, col, b = .012, o = {}) {
    b = Math.min(b, (x1 - x0) * .45, (y1 - y0) * .45, (z1 - z0) * .45);
    const X = [x0, x0 + b, x1 - b, x1], Y = [y0, y0 + b, y1 - b, y1], Z = [z0, z0 + b, z1 - b, z1];
    const V = (i, j, k) => [X[i], Y[j], Z[k]], q = (a, b2, c, d) => this.quad(a, b2, c, d, col, o), I = t => t ? 2 : 1;
    for (const t of [0, 3]) {
      q(V(t, 1, 1), V(t, 2, 1), V(t, 2, 2), V(t, 1, 2));
      if (!(t === 0 && o.noBottom)) q(V(1, t, 1), V(2, t, 1), V(2, t, 2), V(1, t, 2));
      q(V(1, 1, t), V(2, 1, t), V(2, 2, t), V(1, 2, t));
    }
    for (const a of [0, 3]) for (const c of [0, 3]) {
      q(V(a, I(c), 1), V(a, I(c), 2), V(I(a), c, 2), V(I(a), c, 1));       // z 방향 모서리
      q(V(a, 1, I(c)), V(a, 2, I(c)), V(I(a), 2, c), V(I(a), 1, c));       // y 방향
      q(V(1, a, I(c)), V(2, a, I(c)), V(2, I(a), c), V(1, I(a), c));       // x 방향
    }
    const e = ecode(o);
    for (const sx of [0, 3]) for (const sy of [0, 3]) for (const sz of [0, 3]) {
      const a = V(sx, I(sy), I(sz)), b2 = V(I(sx), sy, I(sz)), c = V(I(sx), I(sy), sz);
      this.tri(a, b2, c, norm(cross(sub(b2, a), sub(c, a))), col, e);
    }
  }
  /* 돌림체 — base 에서 axis 방향으로 [반지름, 높이(, 색)] 윤곽을 한 바퀴 돌림 (병 · 손잡이 · 바퀴통) */
  lathe(base, axis, prof, col, seg = 14, o = {}) {
    const ax = norm(axis), t = Math.abs(ax[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ax, t)), v = cross(ax, u), e = ecode(o);
    const P = (r, h, k, nr, nh) => { const th = k / seg * Math.PI * 2, d = add(mul(u, Math.cos(th)), mul(v, Math.sin(th)));
      return { p: add(add(base, mul(ax, h)), mul(d, r)), n: norm(add(mul(d, nr), mul(ax, nh))) }; };
    for (let i = 1; i < prof.length; i++) {
      const [r0, h0] = prof[i - 1], [r1, h1, c1] = prof[i], L = Math.hypot(r1 - r0, h1 - h0) || 1;
      const nr = (h1 - h0) / L, nh = -(r1 - r0) / L, cc = c1 || col;
      for (let k = 0; k < seg; k++) {
        const A = P(r0, h0, k, nr, nh), B = P(r0, h0, k + 1, nr, nh), Cc = P(r1, h1, k + 1, nr, nh), D = P(r1, h1, k, nr, nh);
        this.triN(A, B, Cc, cc, e); this.triN(A, Cc, D, cc, e);
      }
    }
  }
  /* 고리 — 가운데 c, 축 axis, 큰 반지름 R, 굵기 r */
  torus(c, axis, R, r, col, seg = 16, sides = 6, o = {}) {
    const ax = norm(axis), t = Math.abs(ax[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ax, t)), v = cross(ax, u), e = ecode(o);
    const P = (i, j) => { const th = i / seg * Math.PI * 2, ph = j / sides * Math.PI * 2;
      const d = add(mul(u, Math.cos(th)), mul(v, Math.sin(th))), n = add(mul(d, Math.cos(ph)), mul(ax, Math.sin(ph)));
      return { p: add(add(c, mul(d, R)), mul(n, r)), n }; };
    for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
      const A = P(i, j), B = P(i + 1, j), Cc = P(i + 1, j + 1), D = P(i, j + 1); this.triN(A, B, Cc, col, e); this.triN(A, Cc, D, col, e);
    }
  }
  /* 원판 */
  disc(c, axis, r, col, seg = 16, o = {}) {
    const n = norm(axis), t = Math.abs(n[1]) < .9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(n, t)), v = cross(n, u), e = ecode(o);
    const p = k => { const th = k / seg * Math.PI * 2; return add(c, add(mul(u, Math.cos(th) * r), mul(v, Math.sin(th) * r))); };
    for (let k = 0; k < seg; k++) this.tri(c, p(k), p(k + 1), n, col, e);
  }
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
uniform vec3 uAmb; uniform sampler2D uTex; uniform vec4 uRoom; uniform float uPB[8];
float h3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
/* 천장 형광등 판 i 의 밝기 (깜빡임) */
float panelB(vec3 p){ float b=1.0; for(int i=0;i<8;i++){ vec3 d=p-uL[i]; if(abs(d.x)<0.8 && abs(d.z)<0.4) b=uPB[i]; } return b; }
/* 형광등 판 아래로 떨어지는 빛 — 판 바로 밑이 가장 밝고 둘레로 갈수록 빠르게 어두워짐 (추격 복도의 빛 고임) */
float pool(vec3 p, vec3 L){ vec2 d=abs(p.xz-L.xz); d=max(d-vec2(0.7,0.25),0.0); float r=length(d); return 1.0/(1.0+r*r*1.6); }
void main(){
  vec3 c=vC;
  if(vUV.x>=0.0){ vec4 t=texture2D(uTex,vUV); c*=t.rgb; }
  vec3 col;
  if(vE>0.5 && vE<1.5){ col=c; if(vP.y>2.85) col*=panelB(vP); }
  else{
    vec3 n=normalize(vN), V=normalize(uEye-vP);
    if(dot(n,V)<0.0) n=-n;
    float sp=vE>1.5 ? vE-2.0 : 0.0;
    bool floorF = n.y>0.9 && vP.y<0.02 && vP.z<uRoom.w;
    if(floorF) sp=0.5;                                    // 비닐 바닥 — 형광등이 비침 (추격 복도와 같은 결)
    if(sp<0.05) c*=0.9+0.2*vn(vP*vec3(1.6,1.6,1.6));       // 넓은 얼룩 — 고른 색이 평평해 보이지 않게
    vec3 acc=uAmb*(0.7+0.3*n.y), spec=vec3(0.0);
    for(int i=0;i<12;i++){
      if(i>=uNL) break;
      vec3 L=uL[i]-vP; float d=length(L); L/=d;
      float df=max(dot(n,L),0.0)*0.92+0.08, at=1.0/(1.0+d*d*0.3);
      if(i<8) at*=0.18+0.82*pool(vP,uL[i]);              // 천장등은 아래로 고이게
      acc+=uLC[i]*df*at;
      if(sp>0.0) spec+=uLC[i]*pow(max(dot(n,normalize(L+V)),0.0),12.0+sp*90.0)*sp*1.6*at;
    }
    col=c*acc+spec;
    if(floorF){                                           // 바닥에 비친 천장 형광등 — 반사 광선이 판에 닿으면 번진 빛
      vec3 R=reflect(-V,n); float t=(3.04-vP.y)/max(R.y,0.05); vec3 hp=vP+R*t;
      float blur=0.06+t*0.05; vec3 rf=vec3(0.0);
      for(int i=0;i<8;i++){
        vec3 d=hp-uL[i];
        float k=(1.0-smoothstep(0.74-blur,0.74+blur,abs(d.x)))*(1.0-smoothstep(0.3-blur,0.3+blur,abs(d.z)));
        rf+=uLC[i]*k*uPB[i];
      }
      float fr=0.22+0.5*pow(1.0-max(dot(n,V),0.0),3.0);
      col+=rf*fr*(0.6+0.4*vn(vP*vec3(9.0,1.0,9.0)));
    }
    // 그늘 — 바닥에 가까운 옆면 · 벽 가까운 바닥 · 천장 구석 (간이 차폐)
    float wd=min(min(vP.x-uRoom.x,uRoom.y-vP.x),min(vP.z-uRoom.z,uRoom.w-vP.z));
    float ao=1.0;
    if(abs(n.y)<0.6) ao*=0.62+0.38*smoothstep(0.0,0.42,vP.y);
    else ao*=0.72+0.28*smoothstep(0.0,0.75,wd);
    ao*=0.8+0.2*smoothstep(0.0,0.35,3.1-vP.y);
    col*=ao;
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
  board: hex('#e8ebe6'), wood: hex('#5a4a3a'), glass: [.55, .7, .85],
  chrome: hex('#c3ccd5'), rubber: hex('#1c2027'), paper: hex('#f1efe6')
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
  [-4.5, -1.4, 0, .62], [2.5, 4.6, 0, .62], [4.12, 4.6, 2.3, 4.7],
  [2.0, 2.5, 5.7, 6.2], [2.12, 2.48, 0, .5], [4.15, 4.6, .68, 1.12], [2.8, 4.05, 6.65, RZ1], [RX0, RX0 + .22, 3.05, 3.35]
];

/* 텍스처 한 장 (512×512) — 칸마다 따로 그려 올림 */
const ATL = { ecg: [0, 0, 256, 160], data: [256, 0, 256, 160], board: [0, 160, 320, 160], clock: [320, 160, 128, 128],
              band: [448, 160, 64, 32], obsmon: [448, 192, 64, 48], exit: [0, 320, 128, 48], white: [500, 500, 8, 8],
              chart: [128, 320, 96, 128], sign: [224, 320, 128, 40], pump: [224, 360, 96, 48], poster: [224, 408, 96, 96],
              baglabel: [320, 416, 64, 48], bio: [416, 320, 64, 64], cartscr: [128, 448, 96, 48] };
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
  // ── 천장 조명 여덟 — 격자 (엔딩 · 오프닝과 같은 모양) : 테두리 · 안쪽 턱 · 확산판 · 격자 · 고정 나사
  for (const cx of [-3.3, -1.1, 1.1, 3.3]) for (const cz of [2.3, 5.3]) {
    m.rbox(cx - .8, cx + .8, RCH - .06, RCH + .01, cz - .36, cz + .36, hex('#2a323d'), .02);
    m.box(cx - .76, cx + .76, RCH - .064, RCH - .06, cz - .32, cz + .32, hex('#3a4554'));
    m.quad([cx - .74, RCH - .066, cz + .3], [cx + .74, RCH - .066, cz + .3], [cx + .74, RCH - .066, cz - .3], [cx - .74, RCH - .066, cz - .3], C.light, { e: true });
    for (let gx = cx - .74 + .148; gx < cx + .74; gx += .148) m.box(gx - .007, gx + .007, RCH - .074, RCH - .065, cz - .3, cz + .3, hex('#9fb0c4'), { s: .4 });
    m.box(cx - .74, cx + .74, RCH - .074, RCH - .065, cz - .007, cz + .007, hex('#9fb0c4'), { s: .4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.lathe([cx + sx * .775, RCH - .06, cz + sz * .335], [0, -1, 0], [[.008, 0], [.008, .003], [0, .004]], C.metal, 6, { s: .5 });
  }
  // 천장 둘레 몰딩
  m.box(RX0, RX1, RCH - .06, RCH, RZ0, RZ0 + .04, C.rail); m.box(RX0, RX1, RCH - .06, RCH, RZ1 - .04, RZ1, C.rail);
  m.box(RX0, RX0 + .04, RCH - .06, RCH, RZ0, RZ1, C.rail); m.box(RX1 - .04, RX1, RCH - .06, RCH, RZ0, RZ1, C.rail);
  // 환기구 둘 — 틀 · 비스듬한 날개
  for (const [vx, vz] of [[0, 3.8], [-2.2, 1.0]]) {
    m.rbox(vx - .3, vx + .3, RCH - .03, RCH + .005, vz - .3, vz + .3, hex('#56606c'), .01);
    m.box(vx - .26, vx + .26, RCH - .031, RCH - .029, vz - .26, vz + .26, hex('#0c1016'));
    for (let i = 0; i < 9; i++) m.obox([vx, RCH - .045, vz - .24 + i * .06], [.26, 0, 0], [0, .012, .012], [0, -.003, .003], hex('#6c7682'), { s: .3 });
  }
  // 천장 스피커 — 방송이 나오는 곳 (동심원 그릴)
  m.lathe([1.2, RCH, 3.6], [0, -1, 0], [[.17, 0], [.17, .015], [.16, .022], [0, .024]], hex('#c9ced3'), 24);
  for (let k = 1; k <= 5; k++) m.torus([1.2, RCH - .025, 3.6], [0, 1, 0], k * .026, .0035, hex('#7d868f'), 24, 4);
  // 연기 감지기 · 스프링클러
  m.lathe([-1.1, RCH, 3.8], [0, -1, 0], [[.07, 0], [.07, .02], [.06, .034], [.02, .04], [0, .04]], hex('#e3e6e8'), 18);
  m.sphere([-1.07, RCH - .036, 3.8], .005, [1, .15, .1], 6, { e: true });
  for (const [x, z] of [[-3.3, 3.8], [3.3, 3.8], [-1.1, .9], [1.1, .9], [2.2, 6.3]]) {
    m.lathe([x, RCH, z], [0, -1, 0], [[.03, 0], [.03, .004], [.009, .006], [.009, .04], [0, .042]], C.chrome, 10, { s: .8 });
    m.disc([x, RCH - .045, z], [0, -1, 0], .022, C.chrome, 10, { s: .8 });
  }
  // 감시 카메라 — 관찰창 위 · 오른쪽 구석. 렌즈가 침대를 봄
  const camera = (base, dir) => {
    dir = norm(dir); const side = norm(cross(dir, [0, 1, 0])), up = cross(side, dir);
    m.lathe(base, mul(norm([base[0] > 4 ? -1 : 0, 0, -1]), 1), [[.045, 0], [.045, .015], [0, .016]], hex('#20262e'), 12);
    const c = add(base, add(mul(dir, .1), [0, -.04, 0]));
    m.cyl(base, c, .012, .012, hex('#2a313b'), 6);
    m.obox(add(c, mul(dir, .03)), mul(side, .045), mul(up, .04), mul(dir, .1), hex('#d6dadd'), { s: .4 });
    m.obox(add(add(c, mul(dir, .04)), mul(up, .05)), mul(side, .055), mul(up, .006), mul(dir, .12), hex('#b8bdc2'));   // 차양
    const lb = add(c, mul(dir, .13));
    m.lathe(lb, dir, [[.032, 0], [.032, .012], [.026, .018], [0, .018]], hex('#15181d'), 14);
    m.disc(add(lb, mul(dir, .0185)), dir, .018, hex('#1b2a44'), 12, { s: .99 });
    m.sphere(add(add(lb, mul(side, .025)), mul(up, .025)), .004, [1, .1, .1], 6, { e: true });
  };
  camera([.15, 2.92, RZ1], [0, -.45, -1]); camera([4.45, 2.95, RZ1 - .15], [-1, -.5, -.9]);

  // ── 침대 머리 쪽 벽 — 의료 가스 (산소 · 공기 · 흡인) · 콘센트 · 호출 단추
  m.rbox(-1.78, -1.12, 1.22, 1.72, RZ1 - .035, RZ1, hex('#cdd3d8'), .01, { s: .2 });
  m.box(-1.78, -1.12, 1.47, 1.475, RZ1 - .036, RZ1 - .035, hex('#9aa4ae'));
  [['#2f9e5a', -1.68], ['#e7c22c', -1.58], ['#e9edef', -1.48]].forEach(([col, x]) => {
    m.lathe([x, 1.6, RZ1 - .035], [0, 0, -1], [[.03, 0], [.03, .01, hex(col)], [.024, .02, hex(col)], [.012, .026], [.008, .026, hex('#1a1d22')], [0, .02, hex('#1a1d22')]], C.chrome, 14, { s: .7 });
  });
  for (const x of [-1.68, -1.52]) { m.rbox(x - .045, x + .045, 1.27, 1.39, RZ1 - .045, RZ1 - .035, hex('#f2f3f1'), .008); for (const dx of [-.015, .015]) m.box(x + dx - .003, x + dx + .003, 1.32, 1.345, RZ1 - .046, RZ1 - .045, hex('#20242a')); }
  m.lathe([-1.33, 1.33, RZ1 - .035], [0, 0, -1], [[.03, 0], [.03, .01], [.022, .018, hex('#c2352c')], [0, .022, hex('#c2352c')]], hex('#e6e8ea'), 14, { s: .5 });
  m.rbox(-1.25, -1.17, 1.6, 1.68, RZ1 - .04, RZ1 - .035, hex('#2a313b'), .005);
  m.sphere([-1.21, 1.64, RZ1 - .042], .006, [.2, 1, .4], 6, { e: true });
  // 문 옆 스위치 · 바닥 가까운 콘센트들
  m.rbox(-2.96, -2.86, 1.22, 1.36, RZ1 - .012, RZ1, hex('#eceeed'), .006); m.rbox(-2.93, -2.89, 1.26, 1.32, RZ1 - .02, RZ1 - .012, hex('#d7dad8'), .004);
  for (const x of [-2.3, .9, 3.95]) { m.rbox(x - .05, x + .05, .26, .36, RZ1 - .012, RZ1, hex('#eceeed'), .006); for (const dx of [-.016, .016]) m.disc([x + dx, .31, RZ1 - .0125], [0, 0, -1], .007, hex('#20242a'), 8); }

  // ── 문 (뒷벽 왼쪽) — 둥근 문틀 · 미닫이 레일 덮개 · 문턱 · 바닥 경고 띠 · 비상등. 문짝은 매 프레임
  m.rbox(DOOR.x0 - .1, DOOR.x0, 0, DOOR.h + .1, RZ1 - .07, RZ1 + .02, C.frame, .018, { s: .25 });
  m.rbox(DOOR.x1, DOOR.x1 + .1, 0, DOOR.h + .1, RZ1 - .07, RZ1 + .02, C.frame, .018, { s: .25 });
  m.rbox(DOOR.x0 - .1, DOOR.x1 + .1, DOOR.h, DOOR.h + .1, RZ1 - .07, RZ1 + .02, C.frame, .018, { s: .25 });
  m.rbox(DOOR.x0 - .14, DOOR.x1 + 1.05, DOOR.h + .13, DOOR.h + .3, RZ1 - .1, RZ1, hex('#3c4858'), .025, { s: .2 });
  for (let i = 0; i < 6; i++) m.lathe([DOOR.x0 + i * .3, DOOR.h + .215, RZ1 - .1], [0, 0, -1], [[.008, 0], [.008, .003], [0, .004]], C.metal, 6, { s: .6 });
  m.rbox(DOOR.x0 - .04, DOOR.x1 + .04, 0, .012, RZ1 - .1, RZ1 + .06, C.metal, .004, { s: .7 });
  for (let i = 0; i < 9; i++) { const x = DOOR.x0 - .15 + i * .145; m.quad([x, .0025, RZ1 - .12], [x + .145, .0025, RZ1 - .12], [x + .145, .0025, RZ1 - .3], [x, .0025, RZ1 - .3], i % 2 ? C.yellow : C.black); }
  m.box(DOOR.x0 - .15, DOOR.x0 - .15 + 9 * .145, 0, .0026, RZ1 - .3, RZ1 - .12, hex('#1b1f25'));
  m.rbox(DOOR.x0 + .2, DOOR.x1 - .2, DOOR.h + .34, DOOR.h + .44, RZ1 - .08, RZ1, hex('#e3e6e8'), .015);
  for (const sx of [-1, 1]) m.lathe([(DOOR.x0 + DOOR.x1) / 2 + sx * .17, DOOR.h + .39, RZ1 - .08], [sx * .5, -.2, -1], [[.03, 0], [.03, .03], [.024, .045], [0, .046, hex('#f4e9c8')]], hex('#d8dcdf'), 12);
  // 문 너머 어둠 · 옆벽
  m.box(DOOR.x0, DOOR.x1, 0, DOOR.h, RZ1 + .4, RZ1 + .42, C.dark);
  m.box(DOOR.x0, DOOR.x0 + .01, 0, DOOR.h, RZ1, RZ1 + .4, C.dark); m.box(DOOR.x1 - .01, DOOR.x1, 0, DOOR.h, RZ1 + .06, RZ1 + .4, C.dark);
  m.box(DOOR.x0, DOOR.x1, DOOR.h - .01, DOOR.h, RZ1, RZ1 + .4, C.dark);
  // 키카드 잠금장치 — 몸통 · 카드 읽는 칸 · 숫자 단추 열둘 (불빛은 매 프레임)
  m.rbox(LOCK.x0, LOCK.x1, LOCK.y0, LOCK.y1, RZ1 - .05, RZ1, hex('#1a212b'), .01, { s: .3 });
  m.rbox(LOCK.x0 + .015, LOCK.x1 - .015, LOCK.y1 - .2, LOCK.y1 - .1, RZ1 - .054, RZ1 - .048, hex('#2a3442'), .006, { s: .5 });
  m.box(LOCK.x0 + .03, LOCK.x1 - .03, LOCK.y1 - .17, LOCK.y1 - .13, RZ1 - .055, RZ1 - .054, hex('#3c4a5c'));
  m.torus([(LOCK.x0 + LOCK.x1) / 2, LOCK.y1 - .15, RZ1 - .0555], [0, 0, 1], .014, .0015, hex('#7da0c8'), 12, 4);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    const bx = LOCK.x0 + .024 + c * .041, by = LOCK.y0 + .025 + r * .036;
    m.rbox(bx, bx + .03, by, by + .026, RZ1 - .058, RZ1 - .05, r === 0 && c !== 1 ? hex(c ? '#3c8a52' : '#a33a36') : hex('#3a4656'), .005, { s: .4 });
  }
  // ── 관찰창 — 두꺼운 틀 · 안쪽 고무 · 창턱, 너머 블라인드와 관찰실
  m.rbox(WIN.x0 - .12, WIN.x1 + .12, WIN.y0 - .12, WIN.y0, RZ1 - .1, RZ1 + .25, C.frame, .02, { s: .2 });
  m.rbox(WIN.x0 - .12, WIN.x1 + .12, WIN.y1, WIN.y1 + .12, RZ1 - .1, RZ1 + .25, C.frame, .02, { s: .2 });
  m.rbox(WIN.x0 - .12, WIN.x0, WIN.y0, WIN.y1, RZ1 - .1, RZ1 + .25, C.frame, .02, { s: .2 });
  m.rbox(WIN.x1, WIN.x1 + .12, WIN.y0, WIN.y1, RZ1 - .1, RZ1 + .25, C.frame, .02, { s: .2 });
  m.rbox(WIN.x0 - .16, WIN.x1 + .16, WIN.y0 - .14, WIN.y0 - .1, RZ1 - .16, RZ1, hex('#56677b'), .012, { s: .3 });   // 창턱
  for (const [a, b, c2, d2] of [[WIN.x0, WIN.x1, WIN.y0, WIN.y0 + .012], [WIN.x0, WIN.x1, WIN.y1 - .012, WIN.y1], [WIN.x0, WIN.x0 + .012, WIN.y0, WIN.y1], [WIN.x1 - .012, WIN.x1, WIN.y0, WIN.y1]])
    m.box(a, b, c2, d2, RZ1 + .03, RZ1 + .07, hex('#14181e'));
  // 블라인드 — 위쪽 반만 내려와 있음 (날개 · 줄 · 손잡이 막대)
  for (let i = 0; i < 9; i++) m.obox([(WIN.x0 + WIN.x1) / 2, WIN.y1 - .03 - i * .04, RZ1 + .12], [(WIN.x1 - WIN.x0) / 2 - .02, 0, 0], [0, .016, -.008], [0, .0015, .003], hex('#c3c9cf'), { s: .3 });
  m.rbox(WIN.x0 + .02, WIN.x1 - .02, WIN.y1 - .015, WIN.y1, RZ1 + .1, RZ1 + .15, hex('#9aa2ab'), .005);
  m.rbox(WIN.x0 + .02, WIN.x1 - .02, WIN.y1 - .4, WIN.y1 - .385, RZ1 + .11, RZ1 + .13, hex('#9aa2ab'), .005);
  for (const x of [WIN.x0 + .4, WIN.x1 - .4]) m.cyl([x, WIN.y1, RZ1 + .12], [x, WIN.y1 - .39, RZ1 + .12], .002, .002, hex('#e0e0d8'), 4);
  m.cyl([WIN.x1 - .08, WIN.y1 - .02, RZ1 + .1], [WIN.x1 - .08, WIN.y1 - .55, RZ1 + .1], .004, .004, hex('#d0d4d8'), 6);
  // ── 관찰실 (창 너머, 바닥이 높고 어두움)
  const ox0 = WIN.x0 - .35, ox1 = WIN.x1 + .35, oz0 = RZ1 + .25, df = OBS.floor;
  m.box(ox0, ox1, df - .05, df, oz0, OBS.z1, hex('#1a2230'));
  m.quad([ox0, RCH, oz0], [ox1, RCH, oz0], [ox1, RCH, OBS.z1], [ox0, RCH, OBS.z1], hex('#121820'));
  m.quad([ox0, RCH, OBS.z1], [ox1, RCH, OBS.z1], [ox1, df, OBS.z1], [ox0, df, OBS.z1], hex('#202a38'));
  m.quad([ox0, RCH, oz0], [ox0, RCH, OBS.z1], [ox0, df, OBS.z1], [ox0, df, oz0], hex('#1c2533'));
  m.quad([ox1, RCH, OBS.z1], [ox1, RCH, oz0], [ox1, df, oz0], [ox1, df, OBS.z1], hex('#1c2533'));
  m.quad([ox0, df, oz0], [ox1, df, oz0], [ox1, WIN.y0, oz0], [ox0, WIN.y0, oz0], hex('#1c2533'));
  m.box(ox0, ox1, df, df + .08, OBS.z1 - .02, OBS.z1, hex('#141a22'));
  // 책상 — 상판 · 옆판 · 가림판 · 서랍
  m.rbox(-.72, 1.02, df + .72, df + .76, 8.28, 8.97, hex('#2e3a4b'), .012, { s: .25 });
  for (const x of [-.7, .98]) m.rbox(x - .02, x + .02, df, df + .72, 8.32, 8.94, hex('#232c3a'), .008);
  m.rbox(-.68, .96, df + .3, df + .72, 8.92, 8.94, hex('#232c3a'), .006);
  m.rbox(.62, .96, df + .4, df + .72, 8.34, 8.92, hex('#283242'), .008);
  for (let i = 0; i < 2; i++) { m.rbox(.64, .94, df + .43 + i * .14, df + .55 + i * .14, 8.325, 8.34, hex('#303b4c'), .005); m.cyl([.74, df + .49 + i * .14, 8.32], [.84, df + .49 + i * .14, 8.32], .005, .005, C.metal, 6, false, { s: .7 }); }
  // 모니터 둘 — 하나는 켜져 있음 (초록 파형), 하나는 꺼짐
  m.rbox(.4, .9, df + .79, df + 1.13, 8.7, 8.77, hex('#11161d'), .012, { s: .4 });
  m.quad([.43, df + 1.1, 8.695], [.87, df + 1.1, 8.695], [.87, df + .83, 8.695], [.43, df + .83, 8.695], [1, 1, 1], { e: true, uv: uvOf('obsmon') });
  m.rbox(.62, .68, df + .76, df + .82, 8.76, 8.8, hex('#1a1f26'), .006); m.rbox(.55, .75, df + .76, df + .77, 8.68, 8.86, hex('#1a1f26'), .005);
  m.obox([.1, df + .95, 8.74], [.2, 0, .05], [0, .15, 0], [-.01, 0, .04], hex('#11161d'), { s: .4 });
  m.obox([.1, df + .95, 8.7], [.185, 0, .046], [0, .135, 0], [-.001, 0, .004], hex('#0a0e14'), { s: .9 });
  m.rbox(.07, .13, df + .76, df + .82, 8.76, 8.8, hex('#1a1f26'), .006);
  // 자판 · 마우스 · 서류 · 펜
  m.rbox(.32, .78, df + .76, df + .78, 8.42, 8.58, hex('#1d232b'), .006);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 13; k++) m.rbox(.335 + k * .034, .362 + k * .034, df + .78, df + .788, 8.435 + r * .035, 8.46 + r * .035, hex('#2c343f'), .002);
  m.ellipsoid([.86, df + .775, 8.5], [.025, 0, 0], [0, .014, 0], [0, 0, .04], hex('#1d232b'), 10, 6, { s: .4 });
  for (let i = 0; i < 4; i++) { const a = -.15 + i * .09, cx = -.42 + i * .03, cz = 8.55 + i * .02;
    m.obox([cx, df + .762 + i * .002, cz], [Math.cos(a) * .105, 0, Math.sin(a) * .105], [0, .001, 0], [-Math.sin(a) * .148, 0, Math.cos(a) * .148], C.paper); }
  m.cyl([-.2, df + .768, 8.45], [-.08, df + .768, 8.5], .004, .004, hex('#2f6fb5'), 6, true);
  // 머그잔 — 손잡이 · 커피 (김은 매 프레임)
  m.lathe([-.38, df + .76, 8.45], [0, 1, 0], [[0, 0], [.03, 0], [.034, .006], [.036, .1], [.032, .1], [.03, .085, hex('#2a1810')], [0, .085, hex('#2a1810')]], C.white, 16, { s: .5 });
  m.torus([-.336, df + .81, 8.45], [0, 0, 1], .022, .006, C.white, 12, 6, { s: .5 });
  // 스탠드 — 받침 · 두 마디 팔 · 갓
  m.lathe([-.6, df + .76, 8.85], [0, 1, 0], [[.07, 0], [.07, .012], [.05, .02], [.01, .025]], hex('#1c2128'), 16);
  m.cyl([-.6, df + .78, 8.85], [-.55, df + 1.08, 8.8], .008, .008, hex('#5b6674'), 6, false, { s: .6 });
  m.cyl([-.55, df + 1.08, 8.8], [-.4, df + 1.12, 8.7], .008, .008, hex('#5b6674'), 6, false, { s: .6 });
  m.lathe([-.38, df + 1.12, 8.69], [.3, -1, -.2], [[.015, 0], [.02, .02], [.06, .08], [.058, .085]], hex('#1c2128'), 16);
  // 의자 — 다섯 다리 · 바퀴 · 가스 기둥 · 방석 · 등받이 · 팔걸이 (비스듬히 밀려 나 있음), 등받이에 걸친 가운
  const chx = -.05, chz = 7.98;
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + .3, fx = chx + Math.cos(a) * .27, fz = chz + Math.sin(a) * .27;
    m.cyl([chx, df + .09, chz], [fx, df + .065, fz], .014, .01, hex('#20262e'), 6); caster(m, fx, fz, .7, df + .065, df); }
  m.cyl([chx, df + .09, chz], [chx, df + .42, chz], .022, .018, hex('#5b6674'), 10, false, { s: .7 });
  m.rbox(chx - .24, chx + .24, df + .42, df + .5, chz - .23, chz + .23, hex('#141b26'), .035);
  m.obox([chx + .02, df + .8, chz + .24], [.22, 0, -.03], [0, .27, .03], [.004, -.004, .035], hex('#141b26'), { s: .1 });
  for (const sx of [-1, 1]) { m.cyl([chx + sx * .22, df + .48, chz + .05], [chx + sx * .22, df + .64, chz + .05], .012, .012, hex('#20262e'), 6); m.rbox(chx + sx * .22 - .03, chx + sx * .22 + .03, df + .64, df + .67, chz - .12, chz + .14, hex('#20262e'), .012); }
  // 등받이에 걸쳐 둔 노란 방호복 — 어깨 · 늘어진 자락 · 소매 · 검은 장갑, 의자 위 후드 (새까만 얼굴창)
  m.obox([chx + .03, df + .86, chz + .29], [.25, 0, -.03], [0, .045, .01], [.003, -.01, .045], hex('#b4a464'), { s: .3 });
  m.obox([chx + .04, df + .62, chz + .31], [.22, 0, -.03], [0, .22, .02], [.002, -.002, .014], hex('#a89a5c'), { s: .3 });
  m.obox([chx - .2, df + .55, chz + .2], [.04, 0, 0], [0, .2, -.06], [0, .02, .06], hex('#9e9256'), { s: .3 });
  m.ellipsoid([chx - .2, df + .34, chz + .14], [.035, 0, 0], [0, .045, 0], [0, 0, .03], hex('#1e2430'), 8, 6);
  m.torus([chx - .2, df + .4, chz + .14], [0, 1, 0], .037, .008, hex('#96a0ac'), 12, 4);                                   // 손목 밀봉 테이프
  m.ellipsoid([chx + .08, df + .62, chz - .05], [.13, 0, 0], [0, .1, 0], [0, 0, .12], hex('#b4a464'), 12, 8, { s: .3 });
  m.ellipsoid([chx + .08, df + .61, chz - .145], [.08, 0, 0], [0, .085, 0], [0, 0, .04], hex('#060708'), 12, 8, { s: .95 });
  m.torus([chx + .08, df + .61, chz - .16], [0, 0, 1], .082, .012, hex('#2a3040'), 18, 6);
  // 관찰실 뒷벽 선반 — 바인더
  m.rbox(ox0 + .2, ox1 - .2, df + 1.25, df + 1.28, OBS.z1 - .25, OBS.z1, hex('#2a3442'), .008);
  for (let i = 0; i < 16; i++) { const x = ox0 + .25 + i * .07, hh = .22 + (i % 3) * .03;
    m.rbox(x, x + .055, df + 1.28, df + 1.28 + hh, OBS.z1 - .23, OBS.z1 - .03, hex(['#2f4f7a', '#7a2f2f', '#3d5e3a', '#5a4a30'][i % 4]), .006); }

  // ── 벽걸이 모니터 두 대 (뒷벽 오른쪽)
  // 위 — 심전도 : 벽판 · 두 마디 팔 · 관절 · 화면 테두리 · 안쪽 턱 · 단추 · 전원 불빛 · 늘어진 선
  m.rbox(3.97, 4.17, 2.08, 2.52, RZ1 - .02, RZ1, C.metalD, .008, { s: .4 });
  m.rbox(4.04, 4.1, 2.28, 2.32, RZ1 - .2, RZ1 - .02, C.metalD, .01, { s: .4 });
  m.cyl([4.07, 2.25, RZ1 - .2], [4.07, 2.35, RZ1 - .2], .026, .026, hex('#3a4350'), 12, true, { s: .5 });
  m.rbox(3.4, 4.07, 2.285, 2.315, RZ1 - .215, RZ1 - .185, C.metalD, .01, { s: .4 });
  m.rbox(3.25, 3.55, 2.15, 2.45, RZ1 - .225, RZ1 - .21, hex('#3a4350'), .005);
  m.rbox(2.7, 4.1, 1.88, 2.72, RZ1 - .3, RZ1 - .225, hex('#262d37'), .028, { s: .35 });
  for (const [a, b, c2, d2] of [[2.73, 4.07, 2.665, 2.69], [2.73, 4.07, 1.915, 1.94], [2.73, 2.76, 1.915, 2.69], [4.04, 4.07, 1.915, 2.69]]) m.box(a, b, c2, d2, RZ1 - .312, RZ1 - .298, hex('#1a1f27'));
  for (let i = 0; i < 5; i++) m.rbox(3.62 + i * .07, 3.67 + i * .07, 1.892, 1.91, RZ1 - .305, RZ1 - .295, hex('#3a4350'), .003, { s: .5 });
  m.quad([2.76, 2.665, RZ1 - .305], [4.04, 2.665, RZ1 - .305], [4.04, 1.94, RZ1 - .305], [2.76, 1.94, RZ1 - .305], [1, 1, 1], { e: true, uv: uvOf('ecg') });
  m.sphere([4.02, 1.901, RZ1 - .302], .005, [.2, 1, .45], 6, { e: true });
  m.box(2.8, 2.98, 1.896, 1.906, RZ1 - .302, RZ1 - .3, hex('#8a96a4'));
  m.tube(bez([3.9, 1.9, RZ1 - .24], [3.95, .9, RZ1 - .1], [3.95, .31, RZ1 - .012], 12), .006, hex('#15181d'));
  // 아래 — 뇌파 화면 (벽걸이) : 테두리 · 턱 · 단추
  m.rbox(2.85, 4.0, 1.06, 1.66, RZ1 - .1, RZ1, hex('#262d37'), .022, { s: .35 });
  for (const [a, b, c2, d2] of [[2.88, 3.97, 1.605, 1.625], [2.88, 3.97, 1.095, 1.115], [2.88, 2.9, 1.095, 1.625], [3.95, 3.97, 1.095, 1.625]]) m.box(a, b, c2, d2, RZ1 - .108, RZ1 - .099, hex('#1a1f27'));
  m.quad([2.9, 1.605, RZ1 - .104], [3.95, 1.605, RZ1 - .104], [3.95, 1.115, RZ1 - .104], [2.9, 1.115, RZ1 - .104], [.8, .8, .8], { e: true, uv: uvOf('data') });
  for (let i = 0; i < 4; i++) m.rbox(3.6 + i * .08, 3.65 + i * .08, 1.068, 1.088, RZ1 - .106, RZ1 - .098, hex('#3a4350'), .003, { s: .5 });
  // 생체 신호 모듈 선반 — 받침 · 모듈 셋 (손잡이 · 커넥터 · 불빛)
  m.rbox(2.85, 4.0, .78, .81, RZ1 - .32, RZ1, C.metalD, .008, { s: .4 });
  for (const x of [2.9, 3.95]) m.obox([x, .72, RZ1 - .08], [.008, 0, 0], [0, .08, 0], [0, 0, .07], C.metalD);
  for (let i = 0; i < 3; i++) { const x0 = 2.92 + i * .36;
    m.rbox(x0, x0 + .33, .81, 1.0, RZ1 - .3, RZ1 - .04, hex(i === 1 ? '#d6dadd' : '#c3c9cf'), .015, { s: .3 });
    m.rbox(x0 + .02, x0 + .31, .83, .98, RZ1 - .305, RZ1 - .298, hex('#2a313b'), .006);
    for (let k = 0; k < 3; k++) { m.lathe([x0 + .06 + k * .1, .87, RZ1 - .305], [0, 0, -1], [[.016, 0], [.016, .012], [.009, .012], [.009, .004, hex('#0b0d10')]], hex(['#2f6fb5', '#c2352c', '#e3b23c'][(i + k) % 3]), 10, { s: .5 }); }
    m.sphere([x0 + .28, .95, RZ1 - .306], .005, (i + Math.floor(i / 2)) % 2 ? [1, .7, .15] : [.2, 1, .45], 6, { e: true });
    m.cyl([x0 + .05, .985, RZ1 - .32], [x0 + .28, .985, RZ1 - .32], .006, .006, C.metal, 6, false, { s: .8 });
  }
  m.tube(bez([3.0, .85, RZ1 - .31], [2.6, .5, RZ1 - .4], [2.95, .03, RZ1 - .2], 10), .005, WIRE[0]);
  m.tube(bez([3.4, .85, RZ1 - .31], [3.2, .4, RZ1 - .5], [3.5, .03, RZ1 - .15], 10), .005, hex('#c8ccd0'));
  // ── 골격 모형 — 던전의 해골
  buildSkeleton(m, SKEL[0], SKEL[1]);
  // ── 뇌파 증폭기 카트 — 바퀴 · 기둥 · 아래 선반(젤 상자 · 감긴 예비선) · 쟁반 · 증폭기(화면 · 단추 · 불빛 · 환기구 · 손잡이) · 전원선
  const [cx, cz] = CART;
  for (const [x, z] of [[-.25, -.21], [.25, -.21], [-.25, .21], [.25, .21]]) {
    caster(m, cx + x, cz + z, 1, .1);
    m.rbox(cx + x - .015, cx + x + .015, .1, .8, cz + z - .015, cz + z + .015, hex('#6b7684'), .006, { s: .6 });
  }
  m.rbox(cx - .29, cx + .29, .15, .18, cz - .25, cz + .25, C.metalD, .008, { s: .3 });
  for (const [a, b, c2, d2] of [[-.29, .29, -.25, -.235], [-.29, .29, .235, .25], [-.29, -.275, -.25, .25], [.275, .29, -.25, .25]]) m.box(cx + a, cx + b, .18, .2, cz + c2, cz + d2, C.metalD);
  m.rbox(cx - .22, cx - .03, .18, .3, cz - .14, cz + .08, hex('#e9edef'), .01);
  m.box(cx - .22, cx - .03, .25, .27, cz - .142, cz - .14, hex('#2f6fb5'));
  for (let k = 0; k < 4; k++) m.torus([cx + .13, .19 + k * .011, cz + .02], [0, 1, 0], .085 - k * .006, .0055, WIRE[k], 20, 5);
  m.rbox(cx - .3, cx + .3, .78, .82, cz - .26, cz + .26, C.metalD, .012, { s: .3 });
  for (const [a, b, c2, d2] of [[-.3, .3, -.26, -.245], [-.3, .3, .245, .26], [-.3, -.285, -.26, .26], [.285, .3, -.26, .26]]) m.rbox(cx + a, cx + b, .82, .845, cz + c2, cz + d2, C.metalD, .004);
  m.rbox(cx - .24, cx + .24, .82, 1.18, cz - .2, cz + .2, C.cart, .022, { s: .25 });
  m.rbox(cx - .225, cx + .225, .835, 1.165, cz - .207, cz - .19, hex('#344052'), .01, { s: .3 });
  m.rbox(cx - .21, cx + .01, .975, 1.065, cz - .211, cz - .205, hex('#0b1018'), .004);
  m.quad([cx - .2, 1.058, cz - .2115], [cx, 1.058, cz - .2115], [cx, .982, cz - .2115], [cx - .2, .982, cz - .2115], [1, 1, 1], { e: true, uv: uvOf('cartscr') });
  for (let i = 0; i < 4; i++) {                                                                  // 전극선 꽂는 구멍 — 오방색 고리
    const p = [cx - .13 + i * .09, 1.1, cz - .207];
    m.lathe(p, [0, 0, -1], [[.02, 0], [.02, .006], [.012, .008], [.007, .008, hex('#0b0d10')], [.007, 0, hex('#0b0d10')]], WIRE[i], 14, { s: .5 });
  }
  for (const x of [cx + .07, cx + .15]) {
    m.lathe([x, 1.02, cz - .207], [0, 0, -1], [[.024, 0], [.024, .008], [.02, .028], [.016, .032], [0, .032]], hex('#20252c'), 16, { s: .4 });
    m.box(x - .002, x + .002, 1.032, 1.042, cz - .24, cz - .238, hex('#e9edef'));
  }
  for (let i = 0; i < 5; i++) m.sphere([cx - .19 + i * .03, .9, cz - .208], .0045, i === 2 ? [1, .7, .15] : [.2, 1, .45], 6, { e: true });
  m.rbox(cx + .13, cx + .2, .86, .93, cz - .212, cz - .205, hex('#1a1f26'), .005); m.obox([cx + .165, .9, cz - .216], [.025, 0, 0], [0, .022, -.005], [0, .004, .01], hex('#c2352c'));
  m.rbox(cx - .2, cx + .2, 1.135, 1.155, cz - .209, cz - .206, hex('#b9c2cc'), .003);
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) m.box(cx + sx * .2405 - .001, cx + sx * .2405 + .001, .88 + k * .035, .9 + k * .035, cz - .12, cz + .12, hex('#141a22'));
  for (const x of [cx - .2, cx + .2]) m.cyl([x, 1.18, cz + .15], [x, 1.26, cz + .15], .01, .01, C.chrome, 8, false, { s: .9 });
  m.cyl([cx - .21, 1.26, cz + .15], [cx + .21, 1.26, cz + .15], .013, .013, C.chrome, 10, true, { s: .9 });
  m.tube(bez([cx + .1, .95, cz + .2], [cx + .2, -.05, cz + .32], [-2.3, .31, RZ1 - .012], 12), .006, hex('#1a1d22'));

  // ── 링거대 — 다리 다섯 · 바퀴 · 굵은/가는 기둥 · 조임 나사 · 위 고리 넷 · 수액 펌프 · 배양액 백 · 점적통
  const [ix, iz] = IV, bx = ix - .14;
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + .4, fx = ix + Math.cos(a) * .27, fz = iz + Math.sin(a) * .27;
    m.cyl([ix, .1, iz], [fx, .075, fz], .013, .009, C.chrome, 8, false, { s: .8 }); caster(m, fx, fz, .8, .075); }
  m.lathe([ix, .06, iz], [0, 1, 0], [[.05, 0], [.05, .035], [.032, .06], [.017, .07]], hex('#3a4350'), 16, { s: .3 });
  m.cyl([ix, .12, iz], [ix, 1.32, iz], .016, .016, C.chrome, 12, false, { s: .9 });
  m.lathe([ix, 1.3, iz], [0, 1, 0], [[.026, 0], [.026, .05], [.012, .065]], hex('#2a313b'), 14, { s: .3 });
  m.cyl([ix, 1.33, iz], [ix + .05, 1.33, iz], .006, .006, C.metalD, 6);
  m.lathe([ix + .05, 1.33, iz], [1, 0, 0], [[.018, 0], [.018, .022], [0, .024]], hex('#2a313b'), 10);
  m.cyl([ix, 1.36, iz], [ix, 2.3, iz], .011, .011, C.chrome, 10, false, { s: .9 });
  m.sphere([ix, 2.31, iz], .015, C.chrome, 8, { s: .9 });
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2, dx = -Math.cos(a), dz = Math.sin(a), P = (r, y) => [ix + dx * r, y, iz + dz * r];
    m.tube([P(0, 2.29), P(.12, 2.29), P(.145, 2.3), P(.155, 2.325), P(.148, 2.345)], .005, C.chrome, 6, { s: .9, joints: true }); }
  // 수액 펌프 — 침대 쪽(−x)을 봄 : 몸통 · 화면 · 단추 · 불빛 · 기둥 조임쇠
  m.rbox(ix - .13, ix - .02, 1.0, 1.25, iz - .11, iz + .11, hex('#e6e9ec'), .02, { s: .3 });
  m.rbox(ix - .135, ix - .128, 1.14, 1.23, iz - .1, iz + .1, hex('#2a313b'), .006);
  m.quad([ix - .1355, 1.215, iz + .09], [ix - .1355, 1.215, iz - .09], [ix - .1355, 1.155, iz - .09], [ix - .1355, 1.155, iz + .09], [1, 1, 1], { e: true, uv: uvOf('pump') });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) m.rbox(ix - .137, ix - .128, 1.03 + r * .045, 1.065 + r * .045, iz + .06 - c * .055, iz + .095 - c * .055, hex(r === 0 && c === 0 ? '#3c8a52' : r === 0 && c === 2 ? '#a33a36' : '#c3c9cf'), .005, { s: .4 });
  m.sphere([ix - .135, 1.236, iz + .09], .005, [1, .7, .15], 6, { e: true });
  m.rbox(ix - .03, ix + .04, 1.08, 1.17, iz - .035, iz + .035, hex('#2a313b'), .01, { s: .4 });
  m.lathe([ix + .04, 1.125, iz], [1, 0, 0], [[.014, 0], [.014, .03], [.022, .032], [.022, .045], [0, .045]], hex('#2a313b'), 10);
  // 배양액 백 — 붉은 액 · 투명한 테두리 · 거는 고리 · 이름표 · 꽂는 구멍 둘 · 점적통
  m.rbox(bx - .006, bx + .006, 1.9, 2.27, iz - .095, iz + .095, hex('#e6dede'), .006, { s: .7 });
  m.ellipsoid([bx, 2.08, iz], [.03, 0, 0], [0, .165, 0], [0, 0, .082], C.red, 16, 10, { s: .6 });
  m.rbox(bx - .004, bx + .004, 2.255, 2.31, iz - .025, iz + .025, hex('#e6dede'), .004);
  m.torus([bx, 2.295, iz], [1, 0, 0], .009, .0025, hex('#c9c2c2'), 10, 4);
  m.quad([bx - .031, 2.15, iz + .05], [bx - .031, 2.15, iz - .05], [bx - .031, 2.03, iz - .05], [bx - .031, 2.03, iz + .05], [1, 1, 1], { uv: uvOf('baglabel') });
  for (const dz of [-.025, .025]) m.cyl([bx, 1.9, iz + dz], [bx, 1.86, iz + dz], .006, .006, hex('#e6dede'), 8, true, { s: .6 });
  m.cyl([bx, 1.86, iz + .025], [bx, 1.845, iz + .025], .008, .008, hex('#2f6fb5'), 8, true);
  m.lathe([bx, 1.865, iz - .025], [0, -1, 0], [[.004, 0], [.015, .012], [.015, .05], [.015, .085, hex('#a8232a')], [.012, .095, hex('#a8232a')], [.005, .1]], hex('#cfd8e0'), 12, { s: .9 });
  m.cyl([bx, 1.765, iz - .025], [bx, 1.76, iz - .025], .005, .005, hex('#cfd8e0'), 6);
  // ── 침대 — 바퀴 · 다리 · 아래 틀 · 승강 장치 · 네 마디 받침 · 매트리스 · 관 틀 머리판/발판 · 차트 · 두 마디 난간 · 조작판 · 호출기
  const Bd = BED, x0 = Bd.x0, x1 = Bd.x1, z0 = Bd.z0, z1 = Bd.z1, zm = (z0 + z1) / 2;
  const frameC = hex('#7d8995'), tubeC = hex('#b4bfcc'), panelC = hex('#dfe4e8');
  for (const x of [x0 + .1, x1 - .1]) for (const z of [z0 + .08, z1 - .08]) {
    m.rbox(x - .03, x + .03, .14, .44, z - .03, z + .03, frameC, .008, { s: .4 });
    caster(m, x, z, 1.3, .14);
  }
  m.rbox(x1 - .16, x1 - .12, .16, .19, z0 + .05, z1 - .05, hex('#3a4350'), .008);                              // 브레이크 막대
  for (const z of [z0 + .05, z1 - .05]) m.rbox(x1 - .2, x1 - .08, .17, .2, z - .03, z + .03, hex('#c2352c'), .008, { s: .3 });
  for (const z of [z0 + .08, z1 - .08]) m.rbox(x0 + .05, x1 - .05, .41, .47, z - .025, z + .025, frameC, .012, { s: .4 });
  for (const x of [x0 + .1, (x0 + x1) / 2, x1 - .1]) m.rbox(x - .02, x + .02, .42, .46, z0 + .08, z1 - .08, frameC, .008);
  m.rbox(x0 + .2, x0 + .44, .22, .37, zm - .1, zm + .1, hex('#3a4350'), .02, { s: .2 });                        // 모터
  m.cyl([x0 + .44, .3, zm], [x0 + .98, .43, zm], .028, .028, hex('#9aa4ae'), 12, true, { s: .6 });             // 승강 실린더
  m.cyl([x0 + .7, .365, zm], [x0 + 1.05, .45, zm], .015, .015, C.chrome, 10, false, { s: .9 });
  m.rbox(x1 - .62, x1 - .22, .32, .4, zm - .12, zm + .12, hex('#3a4350'), .015, { s: .2 });                     // 배터리
  m.tube(bez([x0 + .3, .3, zm + .1], [x0 + .5, .15, zm + .2], [x1 - .5, .33, zm + .12], 8), .006, hex('#15181d'));
  [[x0, x0 + .75], [x0 + .76, x0 + 1.05], [x0 + 1.06, x0 + 1.5], [x0 + 1.51, x1]].forEach(([a, b]) => m.rbox(a + .005, b - .005, .47, .5, z0 + .01, z1 - .01, hex('#aab4be'), .008, { s: .3 }));
  m.rbox(x0 + .01, x1 - .01, .5, .68, z0 + .015, z1 - .015, hex('#d9dee6'), .045);                                // 매트리스
  for (const z of [z0 + .018, z1 - .018]) m.cyl([x0 + .06, .655, z], [x1 - .06, .655, z], .006, .006, hex('#9eb0c4'), 6);
  for (const z of [z0 + .013, z1 - .013]) m.box(x0 + .08, x1 - .08, .574, .58, z - .001, z + .001, hex('#8f9aa8'));
  // 머리판 — 관 틀 · 판 · 손잡이 홈 · 번호판
  const tubeFrame = (x, top, lo) => {
    const pts = [[x, lo, z0 + .03], [x, top - .06, z0 + .03], [x, top - .018, z0 + .042], [x, top, z0 + .08], [x, top, z1 - .08], [x, top - .018, z1 - .042], [x, top - .06, z1 - .03], [x, lo, z1 - .03]];
    m.tube(pts, .02, tubeC, 10, { s: .7, joints: true });
  };
  tubeFrame(x0 - .025, 1.26, .42);
  m.rbox(x0 - .04, x0 - .01, .55, 1.2, z0 + .055, z1 - .055, panelC, .015, { s: .3 });
  for (const sx of [-.0415, -.0085]) m.rbox(x0 + sx - .002, x0 + sx + .002, 1.04, 1.12, zm - .14, zm + .14, hex('#8f9aa8'), .01);
  m.quad([x0 - .0415, .78, zm + .06], [x0 - .0415, .78, zm - .06], [x0 - .0415, .72, zm - .06], [x0 - .0415, .72, zm + .06], [1, 1, 1], { uv: uvOf('band') });
  // 발판 — 낮게 · 차트 꽂이(나무판 · 종이 · 집게)
  tubeFrame(x1 + .025, 1.02, .42);
  m.rbox(x1 + .01, x1 + .04, .55, .97, z0 + .055, z1 - .055, panelC, .015, { s: .3 });
  m.rbox(x1 + .042, x1 + .052, .62, .93, zm - .125, zm + .125, hex('#6b5a45'), .006);
  m.quad([x1 + .053, .9, zm - .11], [x1 + .053, .9, zm + .11], [x1 + .053, .64, zm + .11], [x1 + .053, .64, zm - .11], [1, 1, 1], { uv: uvOf('chart') });
  m.rbox(x1 + .05, x1 + .068, .885, .94, zm - .045, zm + .045, C.chrome, .006, { s: .9 });
  m.cyl([x1 + .07, .94, zm - .02], [x1 + .07, .94, zm + .02], .006, .006, C.chrome, 6, false, { s: .9 });
  // 옆 난간 — 머리 쪽 · 가운데 두 마디, 경첩 받침, 머리 쪽 바깥에 조작 단추판
  for (const [z, out] of [[z0 - .025, -1], [z1 + .025, 1]]) {
    for (const [a, b] of [[x0 + .08, x0 + .78], [x0 + .84, x1 - .3]]) {
      m.tube([[a, .98, z], [b, .98, z]], .016, tubeC, 10, { s: .7 }); m.sphere([a, .98, z], .016, tubeC, 8, { s: .7 }); m.sphere([b, .98, z], .016, tubeC, 8, { s: .7 });
      m.cyl([a, .835, z], [b, .835, z], .011, .011, tubeC, 8, false, { s: .7 });
      for (let k = 0; k < 4; k++) { const x = a + .03 + k * (b - a - .06) / 3; m.cyl([x, .7, z], [x, .98, z], .011, .011, tubeC, 8, false, { s: .7 }); }
      m.cyl([a + .03, .7, z], [b - .03, .7, z], .011, .011, tubeC, 8, false, { s: .7 });
    }
    for (const x of [x0 + .3, x0 + 1.2]) { m.rbox(x - .025, x + .025, .45, .72, z - .012, z + .012, frameC, .008, { s: .4 }); m.cyl([x, .7, z - .02], [x, .7, z + .02], .018, .018, hex('#5b6674'), 10, true, { s: .5 }); }
    m.rbox(x0 + .32, x0 + .56, .85, .96, z - .016, z + .016, hex('#e6e9ec'), .01, { s: .3 });
    for (let k = 0; k < 4; k++) m.rbox(x0 + .345 + k * .05, x0 + .38 + k * .05, .885, .925, z + out * .016, z + out * .02, hex(k === 3 ? '#c2352c' : '#5b6674'), .004, { s: .4 });
  }
  // 호출기 — 난간에 걸린 리모컨과 꼬인 줄
  const rmX = x0 + 1.05, rmZ = z0 - .06;
  m.rbox(rmX - .025, rmX + .025, .8, .94, rmZ - .012, rmZ + .012, hex('#e6e9ec'), .01, { s: .3 });
  m.sphere([rmX, .91, rmZ - .013], .009, hex('#c2352c'), 8, { s: .5 });
  for (let k = 0; k < 3; k++) m.sphere([rmX, .86 - k * .02, rmZ - .012], .005, hex('#5b6674'), 6);
  m.tube([[rmX, .94, rmZ], [rmX, .985, rmZ + .02], [rmX, .99, rmZ + .035]], .004, hex('#c3c9cf'), 5);
  m.tube(Array.from({ length: 41 }, (_, i) => { const t = i / 40, th = t * 26; return [rmX + Math.cos(th) * .012 - t * .3, .8 - t * .35 + Math.sin(t * Math.PI) * -.05, rmZ + Math.sin(th) * .012 + t * .04]; }), .0025, hex('#c3c9cf'), 4);

  // ── 의사용 둥근 의자 (모니터 앞) — 다섯 다리 · 바퀴 · 가스 기둥 · 발 고리 · 방석
  const stx = 2.25, stz = 5.95;
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + .2, fx = stx + Math.cos(a) * .25, fz = stz + Math.sin(a) * .25;
    m.cyl([stx, .1, stz], [fx, .075, fz], .014, .01, hex('#20262e'), 6, false, { s: .3 }); caster(m, fx, fz, .75, .075); }
  m.cyl([stx, .1, stz], [stx, .5, stz], .022, .018, C.chrome, 12, false, { s: .9 });
  m.torus([stx, .3, stz], [0, 1, 0], .17, .009, C.chrome, 20, 6, { s: .9 });
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; m.cyl([stx, .3, stz], [stx + Math.cos(a) * .17, .3, stz + Math.sin(a) * .17], .006, .006, C.chrome, 6, false, { s: .9 }); }
  m.lathe([stx, .5, stz], [0, 1, 0], [[.04, 0], [.2, .01], [.205, .04, hex('#2a3a5a')], [.19, .065, hex('#2a3a5a')], [0, .07, hex('#2a3a5a')]], hex('#20262e'), 22, { s: .25 });
  // ── 휴지통 (발판) · 의료 폐기물 통
  m.lathe([2.3, 0, .32], [0, 1, 0], [[0, 0], [.13, 0], [.15, .02], [.15, .42], [.155, .44], [.155, .47], [.13, .48], [0, .49]], hex('#9aa4ae'), 20, { s: .7 });
  m.rbox(2.27, 2.33, .02, .05, .1, .2, hex('#2a313b'), .006);
  m.rbox(4.18, 4.52, 0, .45, .72, 1.08, hex('#c2352c'), .02, { s: .25 });
  m.rbox(4.16, 4.54, .45, .5, .7, 1.1, hex('#e3b23c'), .015, { s: .3 });
  m.quad([4.178, .38, 1.0], [4.178, .38, .8], [4.178, .18, .8], [4.178, .18, 1.0], [1, 1, 1], { uv: uvOf('bio') });
  // ── 바닥 그늘
  shadow(m, (x0 + x1) / 2, zm, 1.25, .58); shadow(m, cx, cz + .05, .42, .36); shadow(m, ix, iz, .36, .36);
  shadow(m, SKEL[0], SKEL[1] + .05, .32, .3); shadow(m, stx, stz, .3, .3); shadow(m, 2.3, .32, .22, .22);
  // 바닥 배수구
  m.disc([3.3, .0028, 1.4], [0, 1, 0], .09, hex('#4a5462'), 18, { s: .6 });
  for (let k = -3; k <= 3; k++) m.box(3.3 + k * .02 - .004, 3.3 + k * .02 + .004, .0029, .003, 1.4 - Math.sqrt(Math.max(0, .0049 - (k * .02) ** 2)), 1.4 + Math.sqrt(Math.max(0, .0049 - (k * .02) ** 2)), hex('#0d1116'));
  return m;
}

/* 골격 모형 — 바퀴 달린 거치대에 걸린 뼈 이백여 조각. 방 안(−z)을 봄 */
function buildSkeleton(m, sx, sz) {
  const B = C.bone, D = C.boneD, H = hex('#141018');
  // 거치대 — 다리 다섯 · 바퀴 · 기둥 · 머리를 거는 고리 · 골반 받침
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + .6, fx = sx + Math.cos(a) * .24, fz = sz + .1 + Math.sin(a) * .24;
    m.cyl([sx, .08, sz + .1], [fx, .06, fz], .012, .009, C.metalD, 6, false, { s: .5 }); caster(m, fx, fz, .65, .06); }
  m.lathe([sx, .045, sz + .1], [0, 1, 0], [[.045, 0], [.045, .03], [.016, .055]], C.metalD, 14, { s: .4 });
  m.cyl([sx, .08, sz + .1], [sx, 1.9, sz + .1], .011, .011, C.metal, 8, false, { s: .7 });
  m.tube([[sx, 1.9, sz + .1], [sx, 1.935, sz + .07], [sx, 1.93, sz + .03], [sx, 1.84, sz + .01]], .006, C.metal, 6, { s: .7, joints: true });
  m.cyl([sx, .95, sz + .1], [sx, .95, sz + .05], .008, .008, C.metal, 6);
  // 머리뼈 — 머리덮개 · 이마 · 눈썹 뼈 · 광대 · 눈구멍 · 콧구멍 · 위턱 · 이 · 아래턱
  m.ellipsoid([sx, 1.76, sz + .015], [.073, 0, 0], [0, .083, 0], [0, 0, .096], B, 16, 12, { s: .2 });
  m.ellipsoid([sx, 1.71, sz - .05], [.063, 0, 0], [0, .058, 0], [0, 0, .042], B, 14, 10, { s: .2 });
  m.ellipsoid([sx, 1.731, sz - .072], [.058, 0, 0], [0, .009, 0], [0, 0, .016], B, 12, 5);
  for (const s of [-1, 1]) {
    m.ellipsoid([sx + s * .058, 1.68, sz - .052], [.02, 0, 0], [0, .016, 0], [0, 0, .032], B, 8, 6);
    m.cyl([sx + s * .062, 1.68, sz - .03], [sx + s * .07, 1.675, sz + .01], .007, .006, B, 6);
    m.ellipsoid([sx + s * .029, 1.707, sz - .079], [.021, 0, 0], [0, .02, 0], [0, 0, .012], H, 10, 6);
    m.ellipsoid([sx + s * .029, 1.707, sz - .084], [.023, 0, 0], [0, .022, 0], [0, 0, .004], hex('#3a3428'), 10, 5);
  }
  m.ellipsoid([sx, 1.677, sz - .093], [.011, 0, 0], [0, .017, 0], [0, 0, .007], H, 8, 5);
  m.ellipsoid([sx, 1.647, sz - .07], [.042, 0, 0], [0, .022, 0], [0, 0, .032], B, 12, 8);
  for (const [y, rr] of [[1.628, .03], [1.611, .027]]) for (let i = 0; i < 10; i++) {
    const th = -1.05 + i / 9 * 2.1, x = sx + Math.sin(th) * rr, z = sz - .066 - Math.cos(th) * rr * .95;
    m.rbox(x - .0045, x + .0045, y - .007, y + .007, z - .004, z + .004, C.white, .002, { s: .5 });
  }
  m.tube([[sx - .06, 1.68, sz - .01], [sx - .055, 1.62, sz - .02], [sx - .045, 1.6, sz - .06], [sx - .02, 1.594, sz - .09], [sx, 1.592, sz - .097], [sx + .02, 1.594, sz - .09], [sx + .045, 1.6, sz - .06], [sx + .055, 1.62, sz - .02], [sx + .06, 1.68, sz - .01]], .009, B, 6, { joints: true });
  m.ellipsoid([sx, 1.595, sz - .092], [.018, 0, 0], [0, .01, 0], [0, 0, .008], B, 8, 5);
  // 등뼈 — 목 · 등 · 허리 스물넷 : 몸통 · 원판 · 가시돌기 · 가로돌기
  for (let i = 0; i < 24; i++) {
    const y = 1.6 - i * .0285, r = .013 + i * .0006, c = [sx, y, sz + .03 + Math.sin(i / 23 * Math.PI) * .012];
    m.ellipsoid(c, [r, 0, 0], [0, .0095, 0], [0, 0, r], B, 8, 4);
    m.ellipsoid(add(c, [0, -.0142, 0]), [r * .9, 0, 0], [0, .0035, 0], [0, 0, r * .9], D, 8, 3);
    m.obox(add(c, [0, -.004, r + .009]), [.003, 0, 0], [0, .006, .002], [0, -.002, .01], B);
    if (i > 6) m.box(c[0] - r - .014, c[0] + r + .014, y - .003, y + .003, c[2] - .002, c[2] + .006, B);
  }
  // 쇄골 (S자) · 어깨뼈 (가시 · 봉우리)
  for (const s of [-1, 1]) {
    m.tube([[sx + s * .015, 1.465, sz - .05], [sx + s * .07, 1.472, sz - .048], [sx + s * .125, 1.476, sz - .02], [sx + s * .165, 1.47, sz + .005]], .008, B, 6, { joints: true });
    for (let k = 0; k < 5; k++) { const t = k / 4; m.obox([sx + s * (.075 + .03 * (1 - t)), 1.42 - t * .1, sz + .085], [s * (.045 * (1 - t) + .008), 0, -.008], [0, .013, .002], [s * .002, 0, .004], D); }
    m.cyl([sx + s * .05, 1.42, sz + .095], [sx + s * .16, 1.455, sz + .03], .007, .007, B, 6);
  }
  // 갈비 열두 쌍 — 등에서 휘어 앞 복장뼈로 (아래 쌍은 연골 · 마지막 둘은 떠 있음) · 복장뼈
  for (let i = 0; i < 12; i++) {
    const y = 1.43 - i * .031, f = Math.sin(Math.min(1, (i + 2) / 8) * Math.PI / 2);
    const rx = .06 + .075 * f - (i > 8 ? (i - 8) * .012 : 0), rz = .065 + .025 * f, end = i >= 10 ? .62 : i >= 7 ? .8 : .93;
    for (const s of [-1, 1]) {
      const pt = th => [sx + s * rx * Math.sin(th), y - .035 * Math.sin(th * .5) - .012 * th, sz + .03 - rz * (1 - Math.cos(th))];
      const bone = [], cart = [];
      for (let k = 0; k <= 12; k++) bone.push(pt(k / 12 * Math.PI * end));
      m.tube(bone, .0055, B, 5, { joints: true });
      if (i < 10 && end < .93) { for (let k = 0; k <= 4; k++) cart.push(pt(Math.PI * (end + (.93 - end) * k / 4))); cart.push([sx + s * .012, 1.13, sz - .152]); m.tube(cart, .0045, D, 5); }
    }
  }
  m.rbox(sx - .02, sx + .02, 1.36, 1.445, sz - .162, sz - .145, B, .006);
  m.rbox(sx - .015, sx + .015, 1.12, 1.365, sz - .16, sz - .146, B, .005);
  m.obox([sx, 1.1, sz - .15], [.007, 0, 0], [0, .022, -.004], [0, 0, .004], B);
  // 골반 — 엉덩뼈 날개 · 엉치뼈 · 꼬리뼈 · 두덩 · 폐쇄 구멍 · 엉덩관절 오목
  for (const s of [-1, 1]) {
    m.ellipsoid([sx + s * .088, .93, sz + .012], [s * .06, 0, -.026], [0, .068, 0], [s * .01, 0, .024], B, 12, 8, { s: .2 });
    m.torus([sx + s * .05, .835, sz - .03], [0, 0, 1], .021, .0085, B, 12, 5);
    m.ellipsoid([sx + s * .075, .87, sz], [.02, 0, 0], [0, .02, 0], [0, 0, .016], D, 8, 5);
  }
  m.ellipsoid([sx, .9, sz + .052], [.036, 0, 0], [0, .062, 0], [0, 0, .016], B, 10, 6);
  m.cyl([sx, .84, sz + .055], [sx, .81, sz + .04], .008, .004, B, 6);
  m.tube([[sx - .08, .865, sz - .015], [sx - .045, .82, sz - .048], [sx, .812, sz - .056], [sx + .045, .82, sz - .048], [sx + .08, .865, sz - .015]], .013, B, 6, { joints: true });
  // 팔 — 위팔뼈(머리 · 몸통 · 관절융기) · 노뼈 · 자뼈 · 손목 · 손바닥뼈 · 손가락 마디
  for (const s of [-1, 1]) {
    const sh = [sx + s * .175, 1.445, sz + .005], el = [sx + s * .2, 1.16, sz], wr = [sx + s * .19, .92, sz - .04];
    m.sphere(sh, .026, B, 10); m.cyl(sh, el, .014, .012, B, 8); m.ellipsoid(el, [.026, 0, 0], [0, .014, 0], [0, 0, .017], B, 10, 6);
    m.cyl(add(el, [-s * .01, 0, 0]), add(wr, [-s * .012, 0, 0]), .008, .011, B, 6);
    m.cyl(add(el, [s * .012, .01, .006]), add(wr, [s * .014, 0, 0]), .01, .007, D, 6);
    m.ellipsoid(add(wr, [0, -.014, 0]), [.024, 0, 0], [0, .013, 0], [0, 0, .011], B, 8, 5);
    for (let f = 0; f < 5; f++) {
      const thumb = f === 0, bx = -s * .022 + s * f * .011;
      let p = add(wr, [thumb ? -s * .022 : bx, thumb ? -.02 : -.026, thumb ? -.012 : -.004]);
      let dir = thumb ? norm([-s * .35, -1, -.55]) : norm([s * (f - 2) * .06, -1, -.06]);
      const segs = thumb ? [.035, .026, .02] : [.045, .028 - Math.abs(f - 2.5) * .002, .02, .015];
      segs.forEach((l, j) => { const q = add(p, mul(dir, l)); m.cyl(p, q, .0052 - j * .0007, .0045 - j * .0007, j ? B : D, 5); m.sphere(q, .0055 - j * .0007, B, 5); p = q; dir = norm(add(dir, [0, 0, -.18])); });
    }
  }
  // 다리 — 넙다리뼈(머리 · 목 · 큰돌기 · 관절융기) · 무릎뼈 · 정강이뼈 · 종아리뼈 · 복사뼈 · 발목 · 발바닥뼈 · 발가락
  for (const s of [-1, 1]) {
    const kn = [sx + s * .1, .47, sz - .02], an = [sx + s * .1, .085, sz];
    m.sphere([sx + s * .078, .872, sz], .022, B, 10); m.cyl([sx + s * .078, .872, sz], [sx + s * .115, .85, sz], .011, .013, B, 6);
    m.sphere([sx + s * .125, .853, sz + .005], .02, B, 8);
    m.cyl([sx + s * .115, .84, sz], kn, .015, .012, B, 8);
    for (const d of [-1, 1]) m.sphere(add(kn, [d * .017, -.004, .004]), .02, B, 8);
    m.ellipsoid(add(kn, [0, .01, -.03]), [.017, 0, 0], [0, .022, 0], [0, 0, .008], B, 8, 6);
    m.cyl(add(kn, [0, -.025, 0]), an, .016, .011, B, 8);
    m.cyl(add(kn, [s * .026, -.035, .01]), add(an, [s * .024, 0, .008]), .007, .006, D, 6);
    m.sphere(add(an, [s * .026, 0, .008]), .01, B, 6); m.sphere(add(an, [-s * .012, .004, 0]), .011, B, 6);
    m.ellipsoid(add(an, [0, -.03, .01]), [.024, 0, 0], [0, .02, 0], [0, 0, .035], B, 8, 6);
    for (let t = 0; t < 5; t++) {
      const off = s * (-.022 + t * .011), a = add(an, [off, -.04, -.01]), b = add(an, [off * 1.3, -.055, -.1 + Math.abs(t - 1) * .006]);
      m.cyl(a, b, .005, .004, B, 5); m.sphere(b, .005, B, 5);
      m.cyl(b, add(b, [off * .2, -.004, t === 0 ? -.035 : -.025]), .0045, .0035, B, 5);
    }
  }
}

/* 바퀴 하나 — 축 · 위판 · 포크 · 고무 바퀴 · 바퀴통.  top : 축 윗끝 높이, fl : 바닥 높이 */
function caster(m, x, z, s = 1, top = .1, fl = 0) {
  const r = .03 * s, w = .011 * s, F = hex('#2a313b');
  m.cyl([x, top, z], [x, fl + 2 * r + .012 * s, z], .008 * s, .008 * s, C.metal, 6, false, { s: .6 });
  m.rbox(x - .02 * s, x + .02 * s, fl + 2 * r + .002 * s, fl + 2 * r + .014 * s, z - .024 * s, z + .024 * s, F, .004 * s, { s: .3 });
  for (const sg of [-1, 1]) m.rbox(x + sg * (w + .004 * s) - .002 * s, x + sg * (w + .004 * s) + .002 * s, fl + r * .9, fl + 2 * r + .004 * s, z - .018 * s, z + .02 * s, F, .0015 * s);
  m.cyl([x - w, fl + r, z + .006 * s], [x + w, fl + r, z + .006 * s], r, r, C.rubber, 14, true, { s: .15 });
  m.cyl([x - w - .003 * s, fl + r, z + .006 * s], [x + w + .003 * s, fl + r, z + .006 * s], r * .38, r * .38, C.metal, 8, true, { s: .7 });
}
/* 바닥 그늘 — 겹친 납작 타원 셋 */
function shadow(m, x, z, rx, rz) {
  [['#222a35', 1, .0012], ['#1b222c', .78, .0016], ['#161c25', .55, .002]].forEach(([col, k, y]) => {
    const c = hex(col), n = [0, 1, 0], seg = 24, P = i => { const th = i / seg * Math.PI * 2; return [x + Math.cos(th) * rx * k, y, z + Math.sin(th) * rz * k]; };
    for (let i = 0; i < seg; i++) m.tri([x, y, z], P(i), P(i + 1), n, c, 0);
  });
}
/* 고정된 난수 (소품 배치가 늘 같게) */
let RS = 7;
const rnd = () => (RS = (RS * 16807) % 2147483647) / 2147483647;
/* 선반 위 잡동사니 — 병 · 바인더 · 상자.  face : 사람 쪽 방향 (+1 = +z 또는 −x 쪽을 보는 면) */
function shelfItems(m, xa, xb, y, za, zb, alongX, depth) {
  let p = alongX ? xa : za; const end = alongX ? xb : zb;
  while (p < end - .06) {
    const k = rnd(), at = (w, fn) => { if (p + w <= end) fn(p, p + w); p += w + .01 + rnd() * .03; };
    const bodyAt = (a, b, h, col, bev, o) => alongX ? m.rbox(a, b, y, y + h, za, za + depth, col, bev, o) : m.rbox(xa, xa + depth, y, y + h, a, b, col, bev, o);
    if (k < .35) {                                                        // 바인더 서너 권
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) at(.045, (a, b) => bodyAt(a, b, .24 + rnd() * .04, hex(['#2f4f7a', '#7a2f2f', '#3d5e3a', '#5a4a30', '#4a4f5a'][Math.floor(rnd() * 5)]), .006));
    } else if (k < .65) {                                                 // 병
      at(.08, (a, b) => { const c = (a + b) / 2, h = .1 + rnd() * .09, col = hex(['#6b4a2a', '#2f6fb5', '#cfd6dc', '#3d5e3a'][Math.floor(rnd() * 4)]);
        const base = alongX ? [c, y, za + depth / 2] : [xa + depth / 2, y, c];
        m.lathe(base, [0, 1, 0], [[0, 0], [.032, 0], [.034, .006], [.034, h], [.016, h + .03], [.014, h + .04], [.016, h + .042, hex('#20242a')], [.016, h + .06, hex('#20242a')], [0, h + .06, hex('#20242a')]], col, 12, { s: .8 });
        m.cyl(add(base, [0, h * .35, 0]), add(base, [0, h * .7, 0]), .0345, .0345, C.paper, 12); });
    } else {                                                              // 상자 — 이름표
      at(.12 + rnd() * .08, (a, b) => { const h = .08 + rnd() * .12; bodyAt(a, b, h, hex(['#8a7b62', '#c3b79f', '#5b6674', '#e9edef'][Math.floor(rnd() * 4)]), .008);
        if (alongX) m.box(a + .02, b - .02, y + h * .4, y + h * .7, za + depth, za + depth + .002, C.paper);
        else m.box(xa - .002, xa, y + h * .4, y + h * .7, a + .02, b - .02, C.paper); });
    }
  }
}

/* 앞벽 (엔딩에선 안 보이던 쪽) — 캐비닛 · 화이트보드 · 시계 · 개수대 · 배양액 선반, 오른벽 선반, 왼벽 소화기 */
function buildFront(m, g) {
  RS = 7;
  // ── 캐비닛 셋 — 아래는 문짝(판 홈 · 막대 손잡이 · 열쇠 구멍), 위는 유리문 (안에 선반 · 병 · 바인더)
  for (let i = 0; i < 3; i++) {
    const x0 = -4.45 + i * 1.02, x1 = x0 + 1.0, zf = RZ0 + .6;
    m.rbox(x0, x1, .08, 1.06, RZ0, zf - .01, C.cab, .015, { s: .15 });
    m.box(x0 + .02, x1 - .02, 0, .08, RZ0, zf - .06, hex('#1e252f'));
    for (const [a, b] of [[x0 + .02, x0 + .495], [x0 + .505, x1 - .02]]) {
      m.rbox(a, b, .1, 1.0, zf - .01, zf + .012, C.cab2, .012, { s: .15 });
      m.rbox(a + .045, b - .045, .17, .93, zf + .012, zf + .016, hex('#404d5f'), .006, { s: .15 });
    }
    for (const hx of [x0 + .45, x0 + .55]) { m.cyl([hx, .7, zf + .045], [hx, .92, zf + .045], .008, .008, C.chrome, 8, true, { s: .9 }); for (const hy of [.72, .9]) m.cyl([hx, hy, zf + .012], [hx, hy, zf + .045], .006, .006, C.chrome, 6, false, { s: .9 }); }
    m.lathe([x0 + .5, .97, zf + .012], [0, 0, 1], [[.011, 0], [.011, .006], [.004, .007, hex('#20242a')], [0, .007, hex('#20242a')]], C.chrome, 10, { s: .9 });
    // 위 칸 — 속이 보이게 옆판 · 뒤판 · 천장 · 선반을 따로
    m.rbox(x0, x0 + .02, 1.06, 2.1, RZ0, zf - .01, C.cab, .006); m.rbox(x1 - .02, x1, 1.06, 2.1, RZ0, zf - .01, C.cab, .006);
    m.box(x0 + .02, x1 - .02, 1.06, 2.1, RZ0, RZ0 + .02, hex('#232b36'));
    m.rbox(x0 - .005, x1 + .005, 2.1, 2.14, RZ0, zf + .01, C.cab2, .01);
    m.rbox(x0 + .02, x1 - .02, 1.04, 1.08, RZ0, zf - .005, C.cab, .008);
    for (const y of [1.45, 1.78]) m.box(x0 + .02, x1 - .02, y, y + .02, RZ0 + .02, zf - .03, hex('#56606c'));
    for (const y of [1.08, 1.47, 1.8]) shelfItems(m, x0 + .05, x1 - .05, y, RZ0 + .08, zf - .1, true, .3);
    for (const [a, b] of [[x0 + .02, x0 + .495], [x0 + .505, x1 - .02]]) {
      for (const [p, q, r, s2] of [[a, a + .045, 1.09, 2.08], [b - .045, b, 1.09, 2.08], [a, b, 1.09, 1.135], [a, b, 2.035, 2.08]]) m.rbox(p, q, r, s2, zf - .01, zf + .012, C.cab2, .008, { s: .15 });
      g.quad([a + .045, 2.035, zf], [b - .045, 2.035, zf], [b - .045, 1.135, zf], [a + .045, 1.135, zf], C.glass);
      const hx = a < x0 + .3 ? b - .07 : a + .07;
      m.cyl([hx, 1.2, zf + .035], [hx, 1.32, zf + .035], .006, .006, C.chrome, 8, true, { s: .9 });
    }
    m.rbox(x0 + .38, x0 + .62, 1.9, 1.96, zf + .012, zf + .016, C.paper, .004);                                // 이름표
  }
  // ── 화이트보드 — 알루미늄 테두리 · 마커 받침(마커 셋 · 지우개)
  m.rbox(-.85, 1.65, .95, 2.15, RZ0, RZ0 + .02, C.metalD, .008);
  m.quad([1.6, 2.1, RZ0 + .032], [-.8, 2.1, RZ0 + .032], [-.8, 1.0, RZ0 + .032], [1.6, 1.0, RZ0 + .032], [1, 1, 1], { uv: uvOf('board') });   // 앞벽은 −z 를 보며 읽으니 +x → −x
  for (const [a, b, c2, d2] of [[-.85, 1.65, 2.1, 2.15], [-.85, 1.65, .95, 1.0], [-.85, -.8, .95, 2.15], [1.6, 1.65, .95, 2.15]]) m.rbox(a, b, c2, d2, RZ0, RZ0 + .04, hex('#b9c2cc'), .008, { s: .7 });
  m.rbox(-.8, 1.6, .9, .955, RZ0, RZ0 + .09, hex('#b9c2cc'), .01, { s: .7 });
  m.box(-.78, 1.58, .945, .956, RZ0 + .02, RZ0 + .08, hex('#8a939c'));
  [['#2b4a8a', .9], ['#a8232a', 1.05], ['#20242a', 1.15]].forEach(([col, x]) => { m.cyl([x, .968, RZ0 + .05], [x + .12, .968, RZ0 + .05], .009, .009, C.white, 8, true); m.cyl([x + .12, .968, RZ0 + .05], [x + .14, .968, RZ0 + .05], .0095, .0095, hex(col), 8, true); });
  m.rbox(.2, .34, .955, .99, RZ0 + .03, RZ0 + .08, hex('#3a4350'), .008); m.box(.2, .34, .955, .965, RZ0 + .03, RZ0 + .08, hex('#d8d4c8'));
  // 시계 — 테두리 · 유리 반짝
  m.lathe([2.3, 2.45, RZ0], [0, 0, 1], [[.21, 0], [.21, .03], [.2, .045], [.18, .045]], hex('#20262e'), 28, { s: .5 });
  m.quad([2.47, 2.62, RZ0 + .043], [2.13, 2.62, RZ0 + .043], [2.13, 2.28, RZ0 + .043], [2.47, 2.28, RZ0 + .043], [1, 1, 1], { uv: uvOf('clock') });
  g.disc([2.3, 2.45, RZ0 + .046], [0, 0, 1], .18, [1, 1, 1], 24);
  // ── 개수대 — 아래 장(문짝 넷 · 손잡이) · 상판(움푹한 볼 · 배수구) · 뒷판 · 수도꼭지(거위목 · 레버) · 비누 · 종이 수건 · 장갑 · 주사침 통
  m.rbox(2.55, 4.55, .08, .9, RZ0, .58, C.cab, .015, { s: .15 }); m.box(2.57, 4.53, 0, .08, RZ0, .53, hex('#1e252f'));
  for (let k = 0; k < 4; k++) { const a = 2.57 + k * .495; m.rbox(a, a + .485, .1, .86, .57, .592, C.cab2, .012, { s: .15 }); m.rbox(a + .04, a + .445, .16, .8, .592, .596, hex('#404d5f'), .006);
    const hx = k % 2 ? a + .06 : a + .425; m.cyl([hx, .64, .625], [hx, .8, .625], .007, .007, C.chrome, 8, true, { s: .9 }); for (const hy of [.66, .78]) m.cyl([hx, hy, .592], [hx, hy, .625], .005, .005, C.chrome, 6, false, { s: .9 }); }
  const TOP = hex('#9aa6b4'), STEEL = hex('#aab4be');
  m.rbox(2.53, 3.2, .9, .94, RZ0, .62, TOP, .01, { s: .5 }); m.rbox(3.8, 4.57, .9, .94, RZ0, .62, TOP, .01, { s: .5 });
  m.rbox(3.2, 3.8, .9, .94, RZ0, .15, TOP, .006, { s: .5 }); m.rbox(3.2, 3.8, .9, .94, .45, .62, TOP, .01, { s: .5 });
  m.box(3.2, 3.8, .74, .9, .15, .152, STEEL, { s: .8 }); m.box(3.2, 3.8, .74, .9, .448, .45, STEEL, { s: .8 });
  m.box(3.2, 3.202, .74, .9, .15, .45, STEEL, { s: .8 }); m.box(3.798, 3.8, .74, .9, .15, .45, STEEL, { s: .8 });
  m.box(3.2, 3.8, .738, .742, .15, .45, hex('#8a949e'), { s: .8 });
  m.lathe([3.5, .743, .3], [0, 1, 0], [[.035, 0], [.03, .002], [0, .002, hex('#1a1d22')]], C.chrome, 14, { s: .9 });
  m.rbox(2.53, 4.57, .94, 1.08, RZ0, .02, TOP, .006, { s: .4 });
  m.lathe([3.5, .94, .07], [0, 1, 0], [[.03, 0], [.03, .015], [.016, .03], [.016, .05]], C.chrome, 12, { s: .95 });
  m.tube([[3.5, .99, .07], [3.5, 1.2, .07], [3.5, 1.24, .1], [3.5, 1.235, .15], [3.5, 1.2, .2], [3.5, 1.15, .22]], .013, C.chrome, 10, { s: .95, joints: true });
  m.lathe([3.5, 1.15, .22], [0, -1, 0], [[.013, 0], [.016, .015], [.012, .02]], C.chrome, 10, { s: .95 });
  for (const sx of [-1, 1]) { m.cyl([3.5 + sx * .035, 1.0, .07], [3.5 + sx * .11, 1.04, .1], .007, .006, C.chrome, 8, true, { s: .95 }); m.lathe([3.5 + sx * .03, .95, .07], [sx, 0, 0], [[.016, 0], [.016, .018], [0, .02]], C.chrome, 10, { s: .95 }); }
  m.rbox(3.95, 4.07, 1.0, 1.22, RZ0, .075, hex('#e9edef'), .015, { s: .3 }); m.rbox(3.98, 4.04, 1.03, 1.12, .074, .078, hex('#7da0c8'), .005); m.rbox(3.995, 4.025, .98, 1.0, .04, .07, hex('#bcc3ca'), .004);
  m.rbox(2.65, 2.97, 1.12, 1.42, RZ0, .12, hex('#e9edef'), .02, { s: .3 }); m.box(2.7, 2.92, 1.118, 1.122, .03, .1, hex('#1a1f26'));
  m.obox([2.81, 1.09, .07], [.09, 0, 0], [0, .03, .004], [0, -.0004, .003], C.paper);
  m.rbox(4.12, 4.52, 1.12, 1.4, RZ0, .11, hex('#b9c2cc'), .008, { s: .6 });
  [['#4f7fd0', 4.13], ['#8a6fc8', 4.26], ['#e9edef', 4.39]].forEach(([col, x]) => { m.rbox(x, x + .12, 1.13, 1.39, .01, .1, hex(col), .008); m.ellipsoid([x + .06, 1.33, .1], [.035, 0, 0], [0, .018, 0], [0, 0, .003], hex('#1a1f26'), 10, 4); m.ellipsoid([x + .06, 1.34, .11], [.02, 0, 0], [0, .012, 0], [0, 0, .015], hex('#bfe0f0'), 8, 5); });
  m.rbox(2.08, 2.38, .98, 1.26, RZ0, .13, hex('#e7c22c'), .015, { s: .3 }); m.rbox(2.07, 2.39, 1.26, 1.3, RZ0, .14, hex('#c2352c'), .012, { s: .3 }); m.box(2.15, 2.31, 1.299, 1.302, .04, .1, hex('#1a1f26'));
  m.box(2.12, 2.34, 1.08, 1.16, .13, .132, C.paper);
  // 배양액 병 선반 — 받침대 · 병(유리 + 붉은 액 + 뚜껑 + 이름표)
  m.rbox(2.6, 4.5, 1.48, 1.52, RZ0, .3, C.metalD, .008, { s: .4 });
  for (const x of [2.75, 4.35]) m.obox([x, 1.42, .12], [.008, 0, 0], [0, .06, 0], [0, 0, .1], C.metalD);
  for (let i = 0; i < 9; i++) { const x = 2.75 + i * .2, h = .16 + (i % 3) * .04, liq = i % 4 === 3 ? hex('#cfd6dc') : C.red, b = [x, 1.52, .15];
    m.lathe(b, [0, 1, 0], [[0, .004], [.04, .004], [.04, h * (.6 + (i % 2) * .25)], [0, h * (.6 + (i % 2) * .25)]], liq, 12, { s: .4 });
    g.lathe(b, [0, 1, 0], [[.045, 0], [.046, h], [.03, h + .015]], [1, 1, 1], 14);
    m.lathe(add(b, [0, h + .012, 0]), [0, 1, 0], [[.032, 0], [.034, .004], [.034, .038], [.03, .042], [0, .042]], hex('#3a4350'), 12, { s: .5 });
    m.cyl(add(b, [0, h * .32, 0]), add(b, [0, h * .58, 0]), .0465, .0465, C.paper, 14); }
  // ── 오른벽 — 키 큰 선반 : 기둥 · 선반 턱 · 뒤판 · 상자 · 바인더 · 병 · 접힌 시트 · 예비 뇌파 모자
  for (const z of [2.3, 4.67]) for (const x of [4.15, 4.57]) m.rbox(x, x + .03, 0, 2.32, z, z + .03, C.metalD, .006, { s: .4 });
  m.box(4.585, 4.6, 0, 2.3, 2.3, 4.7, hex('#2a323d'));
  for (const y of [.1, .6, 1.1, 1.6, 2.1]) { m.rbox(4.15, 4.6, y, y + .03, 2.3, 4.7, C.metalD, .006, { s: .4 }); m.rbox(4.145, 4.165, y + .03, y + .06, 2.3, 4.7, C.metalD, .004, { s: .4 }); }
  for (const y of [.13, .63, 1.13, 1.63]) shelfItems(m, 4.22, 4.58, y, 2.36, 4.64, false, .32);
  for (let k = 0; k < 5; k++) m.rbox(4.24 + rnd() * .02, 4.54, 2.13 + k * .035, 2.162 + k * .035, 2.4 + rnd() * .02, 2.95, hex(k % 2 ? '#e6eae8' : '#dfe4e2'), .012);
  m.ellipsoid([4.4, 2.13, 3.5], [.1, 0, 0], [0, .09, 0], [0, 0, .1], hex('#3a4a5e'), 14, 8);
  for (let k = 0; k < 10; k++) { const a = k * 2.4, e = .4 + (k % 3) * .35; m.sphere([4.4 + Math.cos(a) * Math.cos(e) * .1, 2.13 + Math.sin(e) * .09, 3.5 + Math.sin(a) * Math.cos(e) * .1], .012, WIRE[k % 4], 6); }
  // ── 오른벽 포스터 — 수면 단계 (계단처럼 내려가는 선)
  m.rbox(RX1 - .012, RX1, 1.27, 2.03, 5.27, 6.03, hex('#b9c2cc'), .006, { s: .5 });
  m.quad([RX1 - .013, 2.0, 6.0], [RX1 - .013, 2.0, 5.3], [RX1 - .013, 1.3, 5.3], [RX1 - .013, 1.3, 6.0], [1, 1, 1], { uv: uvOf('poster') });
  // ── 왼벽 — 소화기(몸통 · 손잡이 · 압력계 · 호스 · 걸쇠) · 안내판 · 온도 조절기
  const fx = RX0 + .12, fz = 3.2;
  m.rbox(RX0, RX0 + .03, .45, .62, fz - .06, fz + .06, C.metalD, .008); m.rbox(RX0 + .03, RX0 + .05, .5, .57, fz - .08, fz + .08, C.metalD, .006);
  m.lathe([fx, .1, fz], [0, 1, 0], [[0, 0], [.07, 0], [.08, .015], [.08, .44], [.07, .5], [.035, .53], [.026, .55]], hex('#b0262a'), 18, { s: .55 });
  m.cyl([fx, .3, fz], [fx, .4, fz], .0805, .0805, C.paper, 18);
  m.lathe([fx, .55, fz], [0, 1, 0], [[.028, 0], [.028, .04], [.02, .05]], hex('#20242a'), 10, { s: .5 });
  m.obox([fx + .04, .63, fz], [.07, .01, 0], [0, .008, 0], [0, 0, .015], hex('#20242a'), { s: .4 });
  m.obox([fx + .035, .6, fz], [.065, -.012, 0], [0, .007, 0], [0, 0, .015], hex('#20242a'), { s: .4 });
  m.lathe([fx, .585, fz - .03], [0, 0, -1], [[.018, 0], [.018, .008], [0, .009, hex('#e9edef')]], C.chrome, 12, { s: .8 });
  m.tube(bez([fx + .02, .56, fz + .03], [fx + .1, .4, fz + .13], [fx + .05, .18, fz + .06], 10), .009, hex('#1a1d22'));
  m.lathe([fx + .05, .18, fz + .06], [0, -1, 0], [[.012, 0], [.016, .05], [.012, .06]], hex('#1a1d22'), 8);
  m.rbox(RX0, RX0 + .008, .78, 1.0, fz - .1, fz + .1, hex('#b0262a'), .004); m.box(RX0 + .008, RX0 + .009, .82, .96, fz - .07, fz + .07, hex('#e9edef'));
  m.quad([RX0 + .011, 1.9, 3.6], [RX0 + .011, 1.9, 4.2], [RX0 + .011, 1.66, 4.2], [RX0 + .011, 1.66, 3.6], [1, 1, 1], { uv: uvOf('exit'), e: true });
  m.rbox(RX0, RX0 + .02, 1.62, 1.94, 3.56, 4.24, hex('#1a2a20'), .006);
  m.rbox(RX0, RX0 + .03, 1.38, 1.52, 5.0, 5.12, hex('#e6e2d6'), .01); m.box(RX0 + .03, RX0 + .031, 1.44, 1.49, 5.02, 5.1, [.3, .8, .55], { e: true });
}

/* 문짝 — 벽 두께 속에 들어가 있는 미닫이. 판 홈 · 철망 유리 · 움푹한 손잡이 · 걷어차기 판 · 경고 띠 · 문패
   ox 만큼 오른쪽(+x)으로 밀려 벽 뒤로 숨음 (방 쪽으로 튀어나온 것이 없어야 벽을 뚫지 않음) */
function buildDoorLeaf(m, ox) {
  const x0 = DOOR.x0 + ox, x1 = DOOR.x1 + ox, h = DOOR.h, zf = RZ1 + .02;
  m.rbox(x0, x1, 0, h - .005, zf, zf + .045, C.leaf, .012, { s: .2 });
  m.rbox(x0 + .07, x1 - .07, .3, h - .1, zf - .006, zf, hex('#323d4e'), .008, { s: .2 });
  m.rbox(x0 + .3, x1 - .3, 1.5, 1.98, zf - .014, zf - .006, C.frame, .008, { s: .3 });
  m.box(x0 + .33, x1 - .33, 1.53, 1.95, zf - .0145, zf - .014, hex('#0e141c'), { s: .99 });
  for (let k = 1; k < 7; k++) { m.box(x0 + .33 + k * .049, x0 + .332 + k * .049, 1.53, 1.95, zf - .015, zf - .0145, hex('#5b6674')); m.box(x0 + .33, x1 - .33, 1.53 + k * .06, 1.532 + k * .06, zf - .015, zf - .0145, hex('#5b6674')); }
  m.rbox(x0 + .05, x0 + .13, .85, 1.25, zf - .008, zf, hex('#1a212b'), .01);
  m.rbox(x0 + .07, x0 + .11, .88, 1.22, zf - .006, zf - .002, C.chrome, .008, { s: .9 });
  m.rbox(x0 + .02, x1 - .02, .02, .26, zf - .008, zf - .004, C.chrome, .006, { s: .8 });
  for (let i = 0; i < 8; i++) { const a = x0 + .02 + i * .12, b = Math.min(x1 - .02, a + .12); if (b > a) m.box(a, b, .28, .36, zf - .0085, zf - .004, i % 2 ? C.yellow : C.black); }
  m.quad([x0 + .3, 1.44, zf - .0095], [x1 - .3, 1.44, zf - .0095], [x1 - .3, 1.315, zf - .0095], [x0 + .3, 1.315, zf - .0095], [1, 1, 1], { uv: uvOf('sign') });
  m.rbox(x0 + .29, x1 - .29, 1.305, 1.45, zf - .009, zf - .006, hex('#9aa4ae'), .004, { s: .6 });
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
/* 발판에 꽂힌 경과 기록 — 수면 단계가 회차마다 깊어짐 */
function drawChart(x, w, h) {
  x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#2b4a8a'; x.fillRect(0, 0, w, 16);
  x.fillStyle = '#fff'; x.font = 'bold 10px sans-serif'; x.fillText('경과 기록 · 07', 5, 12);
  x.fillStyle = '#333'; x.font = '8px sans-serif';
  ['세션 138  N2', '세션 139  N3', '세션 140  N3+', '세션 141  —'].forEach((t, i) => x.fillText(t, 5, 30 + i * 11));
  x.strokeStyle = '#bbb'; x.lineWidth = 1;
  for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(5, 33 + i * 11); x.lineTo(w - 5, 33 + i * 11); x.stroke(); }
  x.strokeStyle = '#a8232a'; x.lineWidth = 1.5; x.beginPath();
  [[8, 84], [24, 92], [40, 100], [56, 108], [72, 116], [88, 122]].forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke();
  x.fillStyle = '#a8232a'; x.font = 'bold 8px sans-serif'; x.fillText('각성 시도 금지', 5, 78);
}
/* 문패 */
function drawSign(x, w, h) {
  x.fillStyle = '#1f3552'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#e9edef'; x.font = 'bold 15px sans-serif'; x.fillText('B-07  수면 연구실', 8, 18);
  x.fillStyle = '#e3b23c'; x.font = '10px sans-serif'; x.fillText('관계자 외 출입 금지', 8, 33);
}
/* 수액 펌프 화면 — 링거를 뽑으면 '막힘' 경보 */
function drawPump(x, w, h, t, out) {
  const al = out && (t >> 4) % 2;
  x.fillStyle = out ? (al ? '#3a0c0c' : '#1a0606') : '#06140f'; x.fillRect(0, 0, w, h);
  x.fillStyle = out ? '#ff6a5a' : '#7de3c8'; x.font = 'bold 14px monospace';
  x.fillText(out ? '막힘 !' : '12.0', 6, 20); x.font = '9px monospace'; x.fillText(out ? 'OCCLUSION' : 'mL/h  R-7', 6, 34);
  if (!out) for (let i = 0; i < 4; i++) { x.fillStyle = ((t >> 3) + i) % 4 === 0 ? '#7de3c8' : '#1f5a48'; x.fillRect(64 + i * 7, 26, 5, 8); }
}
/* 오른벽 포스터 — 수면 단계, 계단처럼 내려감 */
function drawPoster(x, w, h) {
  x.fillStyle = '#eef0ea'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#1f3552'; x.font = 'bold 11px sans-serif'; x.fillText('수면 단계', 6, 14);
  x.font = '8px sans-serif'; x.fillStyle = '#555';
  ['깸', 'REM', 'N1', 'N2', 'N3'].forEach((t, i) => { x.fillText(t, 4, 30 + i * 12); x.fillStyle = '#ccc'; x.fillRect(22, 27 + i * 12, w - 26, 1); x.fillStyle = '#555'; });
  x.strokeStyle = '#2b4a8a'; x.lineWidth = 2; x.beginPath();
  let px = 22, lv = 0; x.moveTo(px, 27);
  [1, 2, 3, 4, 4, 3, 4, 4].forEach(v => { x.lineTo(px, 27 + lv * 12); px += 9; x.lineTo(px, 27 + lv * 12); lv = v; x.lineTo(px, 27 + lv * 12); });
  x.lineTo(w - 4, 27 + lv * 12); x.stroke();
  x.fillStyle = '#a8232a'; x.font = 'bold 8px sans-serif'; x.fillText('한 단계 더 내려갑니다', 6, h - 8);
}
function drawBagLabel(x, w, h) {
  x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#a8232a'; x.fillRect(0, 0, w, 12);
  x.fillStyle = '#fff'; x.font = 'bold 9px sans-serif'; x.fillText('배양액 R-7', 4, 10);
  x.fillStyle = '#333'; x.font = '8px monospace'; x.fillText('500 mL', 4, 25); x.fillText('피험자 07', 4, 37);
  x.fillStyle = '#222'; for (let i = 0; i < 14; i++) x.fillRect(40 + i * 1.6, 18, i % 3 ? 1 : .6, 20);
}
/* 의료 폐기물 표 — 세 고리 */
function drawBio(x, w, h) {
  x.fillStyle = '#e7c22c'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#111'; x.lineWidth = 4;
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 - Math.PI / 2; x.beginPath(); x.arc(32 + Math.cos(a) * 9, 28 + Math.sin(a) * 9, 10, 0, 7); x.stroke(); }
  x.fillStyle = '#111'; x.beginPath(); x.arc(32, 28, 4, 0, 7); x.fill();
  x.font = 'bold 9px sans-serif'; x.fillText('의료 폐기물', 6, 58);
}
/* 증폭기 작은 화면 — 꽂힌 채널 수 */
function drawCartScr(x, w, h, t, wires) {
  x.fillStyle = '#06100c'; x.fillRect(0, 0, w, h);
  x.fillStyle = wires ? '#7de3c8' : '#ff6a5a'; x.font = 'bold 11px monospace'; x.fillText('EEG AMP', 5, 14);
  x.font = '9px monospace'; x.fillText(`CH ${wires}/4`, 5, 28);
  for (let i = 0; i < 4; i++) { const on = i < wires, v = on ? .3 + .6 * Math.abs(Math.sin(t * .05 + i)) : .05;
    x.fillStyle = on ? ['#2f6fb5', '#c2352c', '#e3b23c', '#e9e3d5'][i] : '#333'; x.fillRect(60 + i * 8, 40 - v * 30, 6, v * 30); }
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
    this.un = {}; ['uVP', 'uL', 'uLC', 'uNL', 'uEye', 'uFog', 'uFogD', 'uDim', 'uAlpha', 'uAmb', 'uTex', 'uRoom', 'uPB'].forEach(n => this.un[n] = gl.getUniformLocation(pr, n));
    // 정적 메시
    const m = buildStatic(), g = new Mesh(); buildFront(m, g);
    this.stat = this.upload(new Float32Array(m.v)); this.statN = m.v.length / 12;
    this.glassS = this.upload(new Float32Array(g.v)); this.glassN = g.v.length / 12;          // 유리 — 캐비닛 문 · 병 · 시계
    this.dyn = gl.createBuffer();
    // 텍스처 한 장
    this.atlas = document.createElement('canvas'); this.atlas.width = 512; this.atlas.height = 512;
    const ax = this.atlas.getContext('2d');
    ax.fillStyle = '#fff'; ax.fillRect(0, 0, 512, 512);
    this.region = k => { const [x, y, w, h] = ATL[k]; ax.save(); ax.beginPath(); ax.rect(x, y, w, h); ax.clip(); ax.translate(x, y); return [ax, w, h]; };
    const once = (k, fn) => { const [x, w, h] = this.region(k); fn(x, w, h); ax.restore(); };
    once('board', drawBoard); once('band', drawBand); once('exit', drawExit);
    once('chart', drawChart); once('sign', drawSign); once('poster', drawPoster); once('baglabel', drawBagLabel); once('bio', drawBio);
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
    live('pump', (x, w, h) => drawPump(x, w, h, st.t, st.ivOut));
    live('cartscr', (x, w, h) => drawCartScr(x, w, h, st.t, st.wires));
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);
    // ── 매 프레임 바뀌는 모양 — 문짝 · 잠금장치 불빛 · 담요 밑 다리 · 내 몸 · 전극선 · 링거 줄
    const d = new Mesh();
    const ds = st.doorSlide || 0;
    buildDoorLeaf(d, ds * (DOOR.x1 - DOOR.x0 - .02));                                   // 벽 속으로 미끄러져 들어감
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
    const bagB = [IV[0] - .14, 1.76, IV[1] - .025];
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
    const pb = [1, 1, 1, 1, 1, 1, 1, 1], fl = Math.sin(st.t * .9) > .2 && (Math.floor(st.t / 23) % 7 < 2);
    const pb7 = fl ? .12 : 1;
    // 형광등 아래 빛 기둥 — 먼지 낀 공기에 비친 옅은 원뿔 (추격 복도의 형광등과 같은 느낌)
    const beams = new Mesh();
    // 겹겹의 옅은 원뿔 — 바깥 겹일수록 넓고 옅어서 가장자리가 흐려짐 (빛은 위에서 밝고 아래로 사라짐)
    for (let i = 0; i < 8; i++) {
      const p = this.lights[i], k = (i === 7 && pb7 < .5) ? .12 : 1, top = RCH - .07;
      for (let layer = 0; layer < 4; layer++) {
        const sp = 1.15 + layer * .3, bot = 1.3 - layer * .35, col = [.8 * k, .86 * k, .95 * k].map(v => v * (1 - layer * .2));
        for (const [a, b] of [[[-.74, -.3], [.74, -.3]], [[.74, -.3], [.74, .3]], [[.74, .3], [-.74, .3]], [[-.74, .3], [-.74, -.3]]])
          beams.quad([p[0] + a[0], top, p[2] + a[1]], [p[0] + b[0], top, p[2] + b[1]], [p[0] + b[0] * sp, bot, p[2] + b[1] * sp * 1.5], [p[0] + a[0] * sp, bot, p[2] + a[1] * sp * 1.5], col, { e: true });
      }
    }
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
    // 천장 형광등 — 하나(오른쪽 안쪽)는 가끔 깜빡임. 빛은 추격 복도처럼 진하게 떨어지고, 판 아래로 고임
    pb[7] = fl ? .12 : 1;
    L.forEach((p, i) => { if (i < 8) p[1] = RCH - .066; });            // 빛의 자리 = 판 높이 (판 깜빡임 판정과 같게)
    L.forEach((p, i) => { flat.push(...p); col.push(...(i < 8 ? [1.85, 1.9, 2.0].map(v => v * pb[i]) : i === 8 ? [.07, .3, .14] : [.09, .3, .15])); });
    gl.uniform1fv(this.un.uPB, new Float32Array(pb));
    gl.uniform3fv(this.un.uL, new Float32Array(flat)); gl.uniform3fv(this.un.uLC, new Float32Array(col)); gl.uniform1i(this.un.uNL, L.length);
    gl.uniform3fv(this.un.uEye, new Float32Array(eye)); gl.uniform3fv(this.un.uFog, new Float32Array([.02, .03, .045]));
    gl.uniform1f(this.un.uFogD, .075); gl.uniform1f(this.un.uDim, st.dim == null ? 1 : st.dim);
    gl.uniform3fv(this.un.uAmb, new Float32Array([.085, .095, .115])); gl.uniform1i(this.un.uTex, 0); gl.uniform1f(this.un.uAlpha, 1);
    gl.uniform4f(this.un.uRoom, RX0, RX1, RZ0, RZ1);
    gl.disable(gl.BLEND); gl.depthMask(true);
    this.bind(this.stat); gl.drawArrays(gl.TRIANGLES, 0, this.statN);
    const drawDyn = (mesh) => { if (!mesh.v.length) return; gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.v), gl.DYNAMIC_DRAW); this.bind(this.dyn); gl.drawArrays(gl.TRIANGLES, 0, mesh.v.length / 12); };
    drawDyn(d);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.uniform1f(this.un.uAlpha, .012); drawDyn(beams);   // 더하기 — 빛
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(this.un.uAlpha, .12); drawDyn(glass);
    gl.uniform1f(this.un.uAlpha, .14); this.bind(this.glassS); gl.drawArrays(gl.TRIANGLES, 0, this.glassN);
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
window.Lab3D = { Mesh, hex };                                 // 인물 3D (figure3d.js) 가 같은 메시 도구를 씁니다
window.LabRoomGeo = { RX0, RX1, RZ0, RZ1, DOOR, LOCK, WIN, BED, CART, SKEL, IV, camBasis, bodyPose };
})();
