'use strict';
/* ═══════════════════════════════════════════════════════════════
   diorama3d.js — 마지막 방이 입체로 일어섬 (WebGL)

   마지막 자물쇠를 연 그 탑뷰 화면을 그대로 받아, 처음엔 위에서 똑같이 내려다보다가
   벽이 솟고 · 카메라가 주인공에게로 내려앉아 그 눈이 됩니다(1인칭) — 주인공 그림은 흩어져 사라짐.
   2D 로 보던 세계가 사실은 입체였다는 것 — 이어지는 실험실(3D)과 같은 결로 넘어가는 다리.

     바닥   — 주인공을 뺀 방 그림을 판 하나에 (판은 두께가 있어 어둠 속에 떠 있는 모형처럼)
     벽     — 테두리 한 칸(TS) 두께. 윗면은 그 자리의 그림, 옆면은 돌 그림을 늘여 붙임. 문 자리는 비움
     주인공 — 바닥에 누운 그림 한 장(탑뷰 그대로). 카메라가 내려앉을수록 픽셀이 흩어져 사라짐 — 이제 내가 그 눈

   쓰는 곳 : ending.js (RiseState) — game.js 의 beginEnding 이 world() 로 방 정보를 넘깁니다
   ═══════════════════════════════════════════════════════════════ */
(() => {
const L3 = window.Lab3D;
if (!L3) return;
const { Mesh } = L3;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = k => { k = clamp01(k); return k * k * (3 - 2 * k); };

function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
function look(e, f, up) {
  const z = norm(mul(f, -1)), x = norm(cross(up, z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
}
function mmul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }

/* 재질 aE — 0 방 그림(바닥 · 벽 윗면, 빛을 그대로), 1 그림을 늘인 옆면(그늘), 2 판의 바깥 돌(어두운 바위), 3 주인공 그림(투명 부분은 뚫음) */
const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute vec2 aUV; attribute float aE;
uniform mat4 uVP;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE;
void main(){ vP=aP; vN=aN; vC=aC; vUV=aUV; vE=aE; gl_Position=uVP*vec4(aP,1.0); }`;
const FS = `
precision mediump float;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE;
uniform sampler2D uRoom; uniform sampler2D uHero; uniform vec3 uEye; uniform vec3 uLamp; uniform float uFogD; uniform float uDim; uniform float uLit; uniform float uHeroA;
float h2(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec3 c;
  if(vE>2.5){ vec4 h=texture2D(uHero,vUV); if(h.a<.55 || h2(floor(vUV*vec2(24.0,22.0)))>uHeroA) discard; c=h.rgb; }   // 흩어짐 — 픽셀 덩어리째
  else if(vE>1.5){ c=vC*(.75+.5*h2(floor(vP.xz*6.0)+floor(vP.y*6.0))); }
  else { c=texture2D(uRoom,vUV).rgb*vC*(1.0+.6*uLit); }       // 입체가 되면 조금 밝게 — 어둠 속 모형이 읽히게
  // 입체가 드러날수록 — 주인공 머리 위 한 점의 빛이 벽 옆면 · 바닥 가장자리를 비춤 (윗면 그림은 원래 밝기 그대로)
  vec3 L=uLamp-vP; float d=length(L); L/=d;
  float lam=max(dot(normalize(vN),L),0.0)/(1.0+d*d*.018);
  c*=mix(1.0, .55+2.3*lam, uLit*(vE>.5?1.0:.45));
  float f=exp(-length(vP-uEye)*uFogD);
  gl_FragColor=vec4(c*f*uDim,1.0);
}`;

class Diorama3D {
  /* w : { room: 주인공 뺀 방 그림, hero: 주인공 그림(투명 바탕), heroAt: [x, y, w, h] 그 그림이 방 그림의 어디에 놓였나,
           W, H, TS : 방 크기 · 칸 크기(px), doors: ['W', 'E', …] 문이 있는 쪽 } */
  constructor(world, w = 960, h = 540) {
    this.w = w; this.h = h; this.world = world;
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    const gl = this.canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }) || this.canvas.getContext('experimental-webgl');
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
    this.un = {}; ['uVP', 'uRoom', 'uHero', 'uEye', 'uLamp', 'uFogD', 'uDim', 'uLit', 'uHeroA'].forEach(n => this.un[n] = gl.getUniformLocation(pr, n));
    const tex = (img, nearest) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const f = nearest ? gl.NEAREST : gl.LINEAR;                  // 픽셀 그림은 픽셀 그대로
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.texRoom = tex(world.room, true); this.texHero = tex(world.hero, true);
    this.buf = gl.createBuffer(); this.hbuf = gl.createBuffer();
    this.lastWallH = -1;
  }
  /* 1 칸(TS) = 1 m. 방 그림의 (px, py) → 바닥 위 (x, 0, z) */
  px(x, y) { const T = this.world.TS; return [x / T, 0, y / T]; }
  build(wallH) {
    const { W, H, TS, doors } = this.world, m = new Mesh();
    const U = (x, y) => [x / W, y / H];
    const quadUV = (a, b, c, d, ua, ub, uc, ud, col, e) => {   // 꼭짓점마다 UV
      const n = norm(cross(sub(b, a), sub(d, a)));
      const push = (p, uv) => m.v.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], uv[0], uv[1], e);
      push(a, ua); push(b, ub); push(c, uc); push(a, ua); push(c, uc); push(d, ud);
    };
    const nx = W / TS, nz = H / TS, P = (x, y, z) => [x, y, z];
    // 바닥 — 벽 안쪽 (벽 칸 밑은 벽이 덮음)
    quadUV(P(0, 0, 0), P(nx, 0, 0), P(nx, 0, nz), P(0, 0, nz), U(0, 0), U(W, 0), U(W, H), U(0, H), [1, 1, 1], 0);
    // 판의 두께 — 어둠 속에 떠 있는 모형
    const th = .7, rock = [.16, .14, .15];
    quadUV(P(0, 0, nz), P(nx, 0, nz), P(nx, -th, nz), P(0, -th, nz), [0, 1], [1, 1], [1, 1], [0, 1], rock, 2);
    quadUV(P(nx, 0, 0), P(0, 0, 0), P(0, -th, 0), P(nx, -th, 0), [0, 0], [1, 0], [1, 0], [0, 0], rock, 2);
    quadUV(P(0, 0, 0), P(0, 0, nz), P(0, -th, nz), P(0, -th, 0), [0, 0], [0, 1], [0, 1], [0, 0], rock, 2);
    quadUV(P(nx, 0, nz), P(nx, 0, 0), P(nx, -th, 0), P(nx, -th, nz), [1, 1], [1, 0], [1, 0], [1, 1], rock, 2);
    if (wallH > .004 && this.world.walls !== false) {
      // 벽 — 테두리 한 칸, 문 자리(가운데 52px)는 비움. 칸마다 상자 하나
      const gapX = [W / 2 - 26, W / 2 + 26], gapY = [H / 2 - 26, H / 2 + 26];
      const door = (d, a0, a1, g) => doors.includes(d) && a1 > g[0] && a0 < g[1];
      const cell = (x0, y0, x1, y1) => {
        const h = wallH * (.93 + .07 * Math.sin(x0 * .37 + y0 * .71));      // 돌 높이가 조금씩 다름
        const a = this.px(x0, y0), b = this.px(x1, y1), t = [U(x0, y0), U(x1, y0), U(x1, y1), U(x0, y1)];
        const X0 = a[0], X1 = b[0], Z0 = a[2], Z1 = b[2];
        quadUV(P(X0, h, Z0), P(X1, h, Z0), P(X1, h, Z1), P(X0, h, Z1), t[0], t[1], t[2], t[3], [1, 1, 1], 0);       // 윗면 = 그 자리 그림
        const side = [.62, .6, .64];
        // 옆면 — 윗면 그림을 세로로 늘여 (돌 무늬가 이어져 보이게)
        quadUV(P(X0, h, Z1), P(X1, h, Z1), P(X1, 0, Z1), P(X0, 0, Z1), t[3], t[2], t[1], t[0], side, 1);
        quadUV(P(X1, h, Z0), P(X0, h, Z0), P(X0, 0, Z0), P(X1, 0, Z0), t[1], t[0], t[3], t[2], side, 1);
        quadUV(P(X0, h, Z0), P(X0, h, Z1), P(X0, 0, Z1), P(X0, 0, Z0), t[0], t[3], t[2], t[1], side, 1);
        quadUV(P(X1, h, Z1), P(X1, h, Z0), P(X1, 0, Z0), P(X1, 0, Z1), t[2], t[1], t[0], t[3], side, 1);
      };
      for (let x = 0; x < W; x += TS) {
        if (!door('N', x, x + TS, gapX)) cell(x, 0, x + TS, TS);
        if (!door('S', x, x + TS, gapX)) cell(x, H - TS, x + TS, H);
      }
      for (let y = TS; y < H - TS; y += TS) {
        const y1 = Math.min(y + TS, H - TS);
        if (!door('W', y, y1, gapY)) cell(0, y, TS, y1);
        if (!door('E', y, y1, gapY)) cell(W - TS, y, W, y1);
      }
    }
    return m;
  }
  /* k : 0‥1 일어섬 정도 (벽 높이 · 주인공), cam : { eye, at, up } */
  render(k, cam, { dim = 1, lit = 1, heroA = 1 } = {}) {
    if (!this.ok) return null;
    const gl = this.gl, un = this.un, wd = this.world;
    const wallH = smooth(k) * 2.5;                      // 눈높이(1.5m)보다 높게 — 갇힌 방
    if (Math.abs(wallH - this.lastWallH) > .002) {
      const m = this.build(wallH); this.lastWallH = wallH;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.DYNAMIC_DRAW); this.n = m.v.length / 12;
    }
    // 주인공 — 바닥에 누운 그림 그대로 (탑뷰). 카메라가 그 눈으로 내려앉으며 흩어짐
    const [hx, hy, hw, hh] = wd.heroAt, T = wd.TS, fx = (hx + hw / 2) / T, fz = (hy + hh) / T;
    const A = [hx / T, .003, hy / T], B = [(hx + hw) / T, .003, hy / T], C = [(hx + hw) / T, .003, (hy + hh) / T], D = [hx / T, .003, (hy + hh) / T];
    const hm = new Mesh(); hm.quad(A, B, C, D, [1, 1, 1], { uv: [0, 0, 1, 1], m: 3 });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.hbuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hm.v), gl.DYNAMIC_DRAW);
    // 그리기
    gl.viewport(0, 0, this.w, this.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(this.pr);
    const fwd = norm(sub(cam.at, cam.eye));
    gl.uniformMatrix4fv(un.uVP, false, new Float32Array(mmul(persp(cam.fov || .7, this.w / this.h, .05, 120), look(cam.eye, fwd, cam.up))));
    gl.uniform3fv(un.uEye, new Float32Array(cam.eye)); gl.uniform3fv(un.uLamp, new Float32Array([lerp(fx, wd.W / T / 2, .35), 3.2, fz]));
    gl.uniform1f(un.uFogD, cam.fog || 0); gl.uniform1f(un.uDim, dim); gl.uniform1f(un.uLit, lit * smooth(k)); gl.uniform1f(un.uHeroA, heroA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texRoom); gl.uniform1i(un.uRoom, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texHero); gl.uniform1i(un.uHero, 1);
    const draw = (b, n) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); const sz = [3, 3, 3, 2, 1]; let off = 0;
      this.at.forEach((a, i) => { if (a >= 0) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, sz[i], gl.FLOAT, false, 48, off * 4); } off += sz[i]; });
      gl.drawArrays(gl.TRIANGLES, 0, n); };
    draw(this.buf, this.n); draw(this.hbuf, hm.v.length / 12);
    return this.canvas;
  }
  /* 카메라 길 — k 0 : 바로 위에서 탑뷰와 똑같이,  1 : 주인공의 눈(1인칭) — 지나온 방을 돌아봄.
     시야도 실험실(labroom.js)과 같은 넓이로 벌어져, 이어지는 3D 장면과 한 눈으로 이어짐 */
  camAt(k, t) {
    const { W, H, TS } = this.world, [hx, hy, hw, hh] = this.world.heroAt;
    const nx = W / TS, nz = H / TS, fov0 = .7, fov1 = 62 * Math.PI / 180;
    const topH = (nz / 2) / Math.tan(fov0 / 2);
    const fx = (hx + hw / 2) / TS, fz = (hy + hh) / TS - .25;           // 주인공이 선 자리
    const top = { eye: [nx / 2, topH, nz / 2], at: [nx / 2, 0, nz / 2], up: [0, 0, -1] };
    const look = [lerp(fx, nx / 2, .75) - (fx > nx / 2 ? 0 : -nx * .3), .75, nz / 2];          // 방 가운데 너머 — 들어온 쪽
    const end = { eye: [fx, 1.5, fz], at: look, up: [0, 1, 0] };
    const mid = { eye: [lerp(nx / 2, fx, .7), topH * .38, lerp(nz / 2, fz, .7)], at: [lerp(nx / 2, fx, .5), 0, lerp(nz / 2, fz, .5)], up: norm(lerp3([0, 0, -1], norm(sub(look, end.eye)), .5)) };
    const e = smooth(k), a = 1 - e;
    const bz = (p, q, r) => [0, 1, 2].map(i => a * a * p[i] + 2 * a * e * q[i] + e * e * r[i]);
    const bob = [0, Math.sin(t * .05) * .012 * e, 0];                 // 숨 쉬듯
    const fov = lerp(fov0, fov1, smooth((k - .55) / .45));
    return { eye: add(bz(top.eye, mid.eye, end.eye), bob), at: bz(top.at, mid.at, end.at), up: norm(bz(top.up, mid.up, end.up)), fov, fog: .028 * e,
             heroA: 1 - smooth((k - .3) / .35) };
  }
  dispose() { const x = this.gl && this.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); this.ok = false; }
}
window.Diorama3D = Diorama3D;
})();
