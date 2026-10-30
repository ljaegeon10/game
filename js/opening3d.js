'use strict';
/* ═══════════════════════════════════════════════════════════════
   opening3d.js — 오프닝, 실사 3D (WebGL)

   오프닝(game.js 의 renderOpening)의 세 장면을 탈출과 같은 결로 입체로 그립니다.
   눈꺼풀 · 흐림 · 경보의 붉은 맥박 · 약이 들어가는 물결 · 목소리 글자는 game.js 가 그 위에 얹습니다.

     LAB   누운 채 올려다본 실험실 — labroom.js 의 방 그대로(엔딩 · 탈출과 같은 방, 같은 침대),
           들여다보는 방호복과 저쪽을 지나가는 조수는 figure3d.js
     SINK  숫자를 거꾸로 세는 동안 — 돌을 쌓은 우물 통로 바닥으로 가라앉습니다. 저 위 입구에는
           방금까지 보던 천장이 그대로 비치고(실험실 그림을 그 자리에 붙임), 점점 작은 빛이 됩니다
     WOOD  숲에서 눈을 뜸 — 땅에 누워 올려다본 나무줄기 · 잎 덩어리 · 해 질 녘 하늘,
           가지 틈에서 내려다보는 방호복 후드(노을을 등진 그림자)

   쓰는 곳 : game.js (오프닝)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const L3 = window.Lab3D;
if (!L3) return;
const { Mesh, hex } = L3;
const PI = Math.PI, TAU = PI * 2;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, k) => a + (b - a) * k;
let RS = 3;
const rnd = () => (RS = (RS * 16807) % 2147483647) / 2147483647;

function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
function look(e, f, up) {
  const z = norm(mul(f, -1)), x = norm(cross(up, z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
}
function mmul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }

/* ── 셰이더 — 재질 0 거친 면(돌 · 나무껍질), 1 빛, 2 잎 카드(잎 모양으로 오려 냄), 3 그림(입구에 비친 천장), 4 하늘 ── */
const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute vec2 aUV; attribute float aE;
uniform mat4 uVP;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE;
void main(){ vP=aP; vN=aN; vC=aC; vUV=aUV; vE=aE; gl_Position=uVP*vec4(aP,1.0); }`;
const FS = `
precision mediump float;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE;
uniform vec3 uEye; uniform vec3 uLP; uniform vec3 uLC; uniform vec3 uSunD; uniform vec3 uSunC; uniform vec3 uAmbT; uniform vec3 uAmbB;
uniform vec3 uFog; uniform float uFogD; uniform sampler2D uTex; uniform float uT; uniform float uDim;
float h3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 sky(vec3 d){                                  // 해 질 녘 — 해 둘레는 희고 노랗게, 바깥으로 주황 · 자주 · 남보라
  float s=max(dot(d,uSunD),0.0), up=clamp(d.y,0.0,1.0);
  vec3 c=mix(vec3(.95,.55,.38), vec3(.30,.18,.34), smoothstep(.2,.95,1.0-s));
  c=mix(c, vec3(.10,.08,.16), smoothstep(.55,1.0,up)*smoothstep(.6,.1,s)*.7);
  c+=vec3(1.0,.86,.62)*pow(s,24.0)*1.6+vec3(1.0,.62,.38)*pow(s,5.0)*.5;
  return c;
}
void main(){
  vec3 V=normalize(uEye-vP);
  if(vE>3.5){ gl_FragColor=vec4(sky(normalize(vP-uEye))*uDim,1.0); return; }
  if(vE>2.5){                                       // 입구에 비친 천장 — 화면 밖은 거울처럼 이어 붙이고 조금 어둡게
    vec2 u=1.0-abs(mod(vUV,2.0)-1.0); vec2 o=max(abs(vUV-.5)-.5,0.0);
    vec3 c=texture2D(uTex,u).rgb*(1.0-.45*clamp(length(o)*2.0,0.0,1.0)); gl_FragColor=vec4(c*uDim,1.0); return; }
  vec3 c=vC, n=normalize(vN);
  if(vE>1.5){                                      // 잎 카드 — 잎사귀 모양으로 오려 냄, 바람에 살랑
    vec2 q=vUV*2.0-1.0; float r=length(q);
    float lv=vn(vec3(vUV*11.0, vC.r*31.0+uT*.25))*.55+vn(vec3(vUV*29.0, vC.g*17.0))*.45;
    if(lv < .38+r*r*.6) discard;
    c=vec3(.06,.07,.06)+vec3(.05,.07,.03)*vn(vec3(vUV*9.0,vC.b*11.0));
  }
  if(vE>0.5 && vE<1.5){ gl_FragColor=vec4(c*uDim,1.0); return; }
  if(dot(n,V)<0.0) n=-n;
  float rough=vn(vP*9.0)*.5+vn(vP*27.0)*.3+vn(vP*3.0)*.2;
  c*=.72+.5*rough;
  float isBark=smoothstep(.035,.05,vC.r-vC.b);     // 갈색(나무껍질)만 — 회색 돌은 그대로
  c*=mix(.82+.36*vn(vP*58.0),1.0,isBark);         // 돌 — 잘게 팬 자국
  if(isBark>0.0){                                   // 세로로 길게 갈라진 껍질 골 + 이끼 낀 아래쪽
    float rid=vn(vec3(vP.x*34.0,vP.y*1.4,vP.z*34.0))*.65+vn(vec3(vP.x*80.0,vP.y*4.0,vP.z*80.0))*.35;
    float groove=smoothstep(.35,.62,rid);
    c=mix(c,c*(.45+.85*groove),isBark);
    n=normalize(n+vec3(rid-.5,0.0,.5-rid)*.35*isBark);
    c=mix(c,vec3(.07,.10,.05),isBark*clamp(1.0-vP.y*.35,0.0,1.0)*.5*vn(vP*6.0));
  }
  vec3 L=uLP-vP; float d=length(L); L/=d;
  vec3 acc=mix(uAmbB,uAmbT,n.y*.5+.5);
  acc+=uLC*max(dot(n,L),0.0)/(1.0+d*d*.02);
  acc+=uSunC*max(dot(n,uSunD),0.0);
  float rim=pow(1.0-max(dot(n,V),0.0),3.0);        // 역광 — 가장자리가 하늘빛을 받음
  vec3 col=c*acc+uSunC*rim*.35*(vE>1.5?1.6:1.0);
  float f=exp(-length(vP-uEye)*uFogD);
  gl_FragColor=vec4(mix(uFog,col,f)*uDim,1.0);
}`;

/* ── 우물 통로 — 입구(y = 0)에서 아래로 쌓은 돌. 안쪽을 보며, 위로 갈수록 빛을 받음 ── */
const WELL_R = 1.15, WELL_D = 26;
function buildWell() {
  const m = new Mesh(); RS = 5;
  const H = .24;
  for (let i = 0; i * H < WELL_D; i++) {
    const y1 = -i * H, y0 = y1 - H + .025, n = 15 + (i % 3), off = (i % 2) * .5 + rnd() * .2;
    for (let s = 0; s < n; s++) {
      const a0 = (s + off) / n * TAU + .012, a1 = (s + 1 + off) / n * TAU - .012 - rnd() * .02;
      const r = WELL_R + (rnd() - .5) * .04;
      const moss = clamp01((i * H - 3) / 14) * rnd();
      const gr = .34 + rnd() * .16, warm = (rnd() - .5) * .03;            // 회색 돌 — 조금씩 따뜻하거나 차갑게, 깊을수록 이끼
      const col = [(gr + warm) * (1 - moss * .45), (gr + warm * .3) * (1 - moss * .2), (gr - warm + .015) * (1 - moss * .5)];
      // 돌 하나 — 안쪽 면은 살짝 둥글게 (가운데가 튀어나옴), 위아래 · 옆은 경사로 이음매에 그늘
      const seg = 4, bulge = .02 + rnd() * .03, yy0 = y0 + rnd() * .015, yy1 = y1 - rnd() * .015;
      for (let k = 0; k < seg; k++) {
        const b0 = lerp(a0, a1, k / seg), b1 = lerp(a0, a1, (k + 1) / seg);
        const bz = t => Math.sin(t * PI) * bulge;
        const P = (a, y, inset) => [Math.cos(a) * (r - inset), y, Math.sin(a) * (r - inset)];
        const e0 = bz(k / seg), e1 = bz((k + 1) / seg), cy0 = yy0 + .02, cy1 = yy1 - .02;
        m.quad(P(b0, cy1, e0), P(b1, cy1, e1), P(b1, cy0, e1), P(b0, cy0, e0), col);
        m.quad(P(b0, yy1, -.01), P(b1, yy1, -.01), P(b1, cy1, e1), P(b0, cy1, e0), col.map(v => v * .9));
        m.quad(P(b0, cy0, e0), P(b1, cy0, e1), P(b1, yy0, -.01), P(b0, yy0, -.01), col.map(v => v * .75));
      }
    }
  }
  // 이음매 사이 뒤판 (벽 안쪽)
  for (let k = 0; k < 40; k++) {
    const a0 = k / 40 * TAU, a1 = (k + 1) / 40 * TAU, R = WELL_R + .06;
    m.quad([Math.cos(a0) * R, 0, Math.sin(a0) * R], [Math.cos(a1) * R, 0, Math.sin(a1) * R], [Math.cos(a1) * R, -WELL_D, Math.sin(a1) * R], [Math.cos(a0) * R, -WELL_D, Math.sin(a0) * R], [.03, .03, .04]);
  }
  // 입구 둘레 — 바깥 돌턱
  for (let k = 0; k < 40; k++) {
    const a0 = k / 40 * TAU, a1 = (k + 1) / 40 * TAU;
    m.quad([Math.cos(a0) * WELL_R, .002, Math.sin(a0) * WELL_R], [Math.cos(a1) * WELL_R, .002, Math.sin(a1) * WELL_R],
           [Math.cos(a1) * 3.5, .002, Math.sin(a1) * 3.5], [Math.cos(a0) * 3.5, .002, Math.sin(a0) * 3.5], [.05, .05, .06]);
  }
  return m;
}

/* ── 숲 — 땅에 누워 올려다봄. 줄기는 둘레에서 하늘 가운데로 모이고, 꼭대기에 잎 덩어리 ── */
function buildForest() {
  const m = new Mesh(), leaves = new Mesh(); RS = 9;
  const bark = [.16, .12, .10];
  const trunks = [[-2.2, -1.2, 1.0], [-1.0, 2.6, .8], [2.4, 1.5, 1.1], [2.9, -1.8, .9], [.3, -3.0, .85], [-3.2, 1.0, .7], [1.4, 3.4, .75], [-1.8, -3.2, .8]];
  for (const [tx, tz, s] of trunks) {
    const lean = norm([-tx * .018, 1, -tz * .018]), h = 11 + rnd() * 7, r0 = .32 * s, r1 = .08 * s;
    const top = add([tx, 0, tz], mul(lean, h));
    // 줄기 — 잘게 나눠 굽이, 껍질 골
    const segs = 12; let prev = [tx, -.5, tz];
    for (let i = 1; i <= segs; i++) {
      const k = i / segs, p = add(add([tx, -.5, tz], mul(lean, h * k)), [Math.sin(k * 5 + tx) * .25 * k, 0, Math.cos(k * 4 + tz) * .25 * k]);
      m.cyl(prev, p, lerp(r0, r1, (i - 1) / segs), lerp(r0, r1, k), bark.map(v => v * (.9 + rnd() * .2)), 18);   // 둘레를 잘게 — 매끈한 원뿔로 안 보이게
      prev = p;
    }
    // 가지 — 위쪽에서 바깥 · 가운데로
    for (let b = 0; b < 5; b++) {
      const k = .45 + b * .1 + rnd() * .05, base = add([tx, 0, tz], mul(lean, h * k)), ang = rnd() * TAU;
      const dir = norm([Math.cos(ang) + tx * .3, .9 + rnd() * .6, Math.sin(ang) + tz * .3]), L = 2 + rnd() * 2.5;
      const mid = add(base, mul(dir, L * .55)), end = add(add(base, mul(dir, L)), [0, -.3, 0]);
      m.cyl(base, mid, r0 * (.35 - b * .04), r0 * .2, bark, 10); m.cyl(mid, end, r0 * .2, r0 * .07, bark, 8);
      clump(leaves, end, 1.1 + rnd() * .9, 40);
    }
    clump(leaves, add(top, [tx * .75, -1, tz * .75]), 2 + rnd() * 1, 70);        // 꼭대기 잎은 바깥으로 — 가운데 하늘이 트이게
  }
  // 하늘 가장자리를 두르는 덤불 · 낮은 잎
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU + rnd() * .3, d = 4.5 + rnd() * 2; clump(leaves, [Math.cos(a) * d, 2.5 + rnd() * 4, Math.sin(a) * d], 1.6 + rnd(), 22); }
  return { m, leaves };
}
/* 잎 덩어리 — 잎 모양 카드 여럿을 공처럼 (카드마다 색 값에 씨앗을 넣어 무늬가 겹치지 않게) */
function clump(m, c, r, n) {
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, a = rnd() * TAU, rr = r * Math.cbrt(rnd());
    const p = add(c, [Math.sqrt(1 - u * u) * Math.cos(a) * rr, u * rr * .7, Math.sqrt(1 - u * u) * Math.sin(a) * rr]);
    const n0 = norm([(rnd() - .5) * .8, 1, (rnd() - .5) * .8]), t = norm(cross(n0, [.3, .2, 1])), b = cross(n0, t), s = .45 + rnd() * .5;   // 아래에서 보면 잎 면이 대개 이쪽을 향함
    const A = add(p, add(mul(t, -s), mul(b, -s))), B = add(p, add(mul(t, s), mul(b, -s))), C = add(p, add(mul(t, s), mul(b, s))), D = add(p, add(mul(t, -s), mul(b, s)));
    m.quad(A, B, C, D, [rnd(), rnd(), rnd()], { uv: [0, 0, 1, 1], m: 2 });
  }
}
function buildSky() {                                   // 큰 상자 — 셰이더가 방향으로 하늘색을 칠함
  const m = new Mesh(), S = 80;
  m.box(-S, S, -S, S, -S, S, [1, 1, 1], { m: 4 });
  return m;
}

/* ═════════════ 렌더러 ═════════════════════════════════════ */
class Opening3D {
  constructor(w = 960, h = 540) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    const gl = this.canvas.getContext('webgl', { antialias: true }) || this.canvas.getContext('experimental-webgl');
    this.ok = !!gl;
    if (!gl) return;
    this.gl = gl;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr; gl.useProgram(pr);
    this.at = ['aP', 'aN', 'aC', 'aUV', 'aE'].map(n => gl.getAttribLocation(pr, n));
    this.un = {}; ['uVP', 'uEye', 'uLP', 'uLC', 'uSunD', 'uSunC', 'uAmbT', 'uAmbB', 'uFog', 'uFogD', 'uTex', 'uT', 'uDim'].forEach(n => this.un[n] = gl.getUniformLocation(pr, n));
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([120, 130, 140, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.well = this.up(buildWell());
    const f = buildForest(); this.forest = this.up(f.m); this.leaves = this.up(f.leaves); this.sky = this.up(buildSky());
    this.quad = gl.createBuffer();
  }
  up(m) { const gl = this.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW); return { b, n: m.v.length / 12 }; }
  draw(p) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, p.b);
    const sz = [3, 3, 3, 2, 1]; let off = 0;
    this.at.forEach((a, i) => { if (a >= 0) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, sz[i], gl.FLOAT, false, 48, off * 4); } off += sz[i]; });
    gl.drawArrays(gl.TRIANGLES, 0, p.n);
  }
  begin(eye, fwd, up, fov, light) {
    const gl = this.gl, un = this.un;
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(this.pr);
    gl.uniformMatrix4fv(un.uVP, false, new Float32Array(mmul(persp(fov, this.w / this.h, .03, 200), look(eye, fwd, up))));
    gl.uniform3fv(un.uEye, new Float32Array(eye));
    for (const k of ['LP', 'LC', 'SunD', 'SunC', 'AmbT', 'AmbB', 'Fog']) gl.uniform3fv(un['u' + k], new Float32Array(light[k]));
    gl.uniform1f(un.uFogD, light.FogD); gl.uniform1f(un.uT, light.T || 0); gl.uniform1f(un.uDim, light.Dim == null ? 1 : light.Dim);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(un.uTex, 0);
  }
  /* 가라앉는 우물 — e 0‥1 (얼마나 가라앉았나), ceil : 입구에 비칠 천장 그림 (그 순간의 실험실), roll : 시야 기울기 */
  renderWell(e, ceil, roll = 0, drop = 0) {
    if (!this.ok) return null;
    const gl = this.gl;
    if (ceil) { gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ceil); }
    const y = -.32 - e * 15 - drop * 4, fov = 62 * PI / 180;
    const up = [Math.sin(roll), 0, Math.cos(roll)];
    this.begin([0, y, 0], [0, 1, 0], up, fov, {
      LP: [0, .9, 0], LC: [2.5, 2.6, 2.8].map(v => v * (1 - e * .2)), SunD: [0, 1, 0], SunC: [0, 0, 0],
      AmbT: [.05, .055, .065], AmbB: [.01, .01, .015], Fog: [0, 0, 0], FogD: .055, T: 0, Dim: 1 });
    // 입구에 비친 천장 — 처음 자리(y = −.32)에서 화면을 꼭 채우는 크기로, 화면의 위아래 · 좌우 그대로
    const d = .32 + .9, hh = d * Math.tan(fov / 2), hw = hh * this.w / this.h, Y = .9;
    const r = [Math.cos(roll), 0, -Math.sin(roll)], u2 = up;
    const P = (sx, sz) => add(add([0, Y, 0], mul(r, sx * hw)), mul(u2, sz * hh));
    const q = new Mesh();
    q.quad(P(-3, 3), P(3, 3), P(3, -3), P(-3, -3), [1, 1, 1], { uv: [-1, -1, 2, 2], m: 3 });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q.v), gl.DYNAMIC_DRAW);
    this.draw({ b: this.quad, n: q.v.length / 12 });
    this.draw(this.well);
    return this.canvas;
  }
  /* 숲 — rise 0‥1 (몸을 일으킴: 시선이 하늘에서 앞으로), t 프레임 */
  renderForest(rise, t) {
    if (!this.ok) return null;
    const e = rise * rise, pitch = lerp(1.38, .25, e), yaw = .35 + e * .25, roll = e * .12;
    const fwd = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const right = norm(cross(fwd, [0, 1, 0])), up0 = cross(right, fwd);
    const up = add(mul(up0, Math.cos(roll)), mul(right, Math.sin(roll)));
    const sunD = norm([.2, .9, .4]);
    this.begin([0, .25 + e * 1.1, 0], fwd, up, 64 * PI / 180, {
      LP: [0, 30, 0], LC: [0, 0, 0], SunD: sunD, SunC: [.55, .34, .24], AmbT: [.26, .18, .22], AmbB: [.04, .03, .05],
      Fog: [.36, .2, .26], FogD: .012, T: t, Dim: 1 });
    this.draw(this.sky); this.draw(this.forest); this.draw(this.leaves);
    return this.canvas;
  }
  /* 해상도 바꾸기 — 느린 기기에서 줄였다가, 넉넉해지면 되돌림 (투영 비율은 그대로) */
  setSize(w, h) { if (w === this.w && h === this.h) return; this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h; }
  dispose() { const x = this.gl && this.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); this.ok = false; }
}

window.Opening3D = Opening3D;
})();
