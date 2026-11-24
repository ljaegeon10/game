'use strict';
/* ═══════════════════════════════════════════════════════════════
   hazmat.js — 방호복 모델 (assets/hazmat_runner.glb → js/hazmat_model.js)

   게임에 나오는 방호복은 전부 이 모델 하나입니다 — 시작화면 · 오프닝 · 탈출 추격 · 2부 그림자.
   뼈대 23개에 가중치로 붙은 메시(스키닝)를 정점 셰이더에서 움직이고,
   색 · 법선 · ORM(그늘 · 거칠기 · 금속) 텍스처로 칠합니다.
   자세는 모델에 든 애니메이션(Idle · Walk · Run)을 걸음 위상에 맞춰 섞고,
   그 위에 게임이 주는 값(lean 숙임 · reach 손 뻗기)을 얹습니다.

   쓰는 곳 : figure3d.js — Figure3D 가 kind:'suit' 를 그릴 때
     const hz = Hazmat.attach(gl);  hz.draw(base(4×4), VP(4×4), fig, env)  → 그렸으면 true
     hz.bone(name) → 방금 그린 자세에서 그 뼈의 스킨 행렬 (소품을 뼈에 붙일 때)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const D = window.HAZMAT_DATA;
if (!D) return;
const NB = D.bones.length;

/* ── 자료 풀기 — 처음 그릴 때(attach) 한 번만. 페이지를 열 때 1MB 넘게 풀던 것을 미뤄서
      시작화면 · 타임어택(방호복 3D 를 안 씀)은 이 일을 아예 안 함 ── */
let G = null, IMG = null, loaded = 0;
function unpack() {
  if (G) return;
  const raw = atob(D.bin), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const f32 = k => new Float32Array(bytes.buffer, D.lay[k][0], D.lay[k][1]);
  G = { pos: f32('pos'), nor: f32('nor'), uv: f32('uv'), tan: f32('tan'), jn: f32('jn'), wt: f32('wt'), ibm: f32('ibm'), anim: f32('anim'),
        idx: new Uint16Array(bytes.buffer.slice(D.lay.idx[0], D.lay.idx[0] + D.lay.idx[1] * 2)) };
  G.idx = dropOldMask(G);
  /* 텍스처 — 다 풀리기 전엔 그리지 않고 false 를 돌려줘 예전 방식으로 */
  IMG = {};
  for (const k of ['base', 'normal', 'orm']) { const im = new Image(); im.onload = () => { loaded++; }; im.src = D.tex[k]; IMG[k] = im; }
}
const BI = {}; D.bones.forEach((b, i) => BI[b.name] = i);
/* 연구원 새 디자인 — 예전 방독면(둥근 렌즈 둘 · 앞 정화통 · 얼굴판)을 떼어 냄. 그 자리엔 figure3d.js 의 buildGear 가 원형 바이저 · 심전도 선 · 양쪽 정화통을 붙임.
   모델은 한 덩어리 메시지만 방독면은 몸과 이어지지 않은 조각 다섯(전부 머리뼈에만 붙음)이라, 이어진 조각을 찾아 머리뼈에만 붙은 것을 뺌 (후드는 몸과 한 조각이라 남음) */
function dropOldMask(G) {
  const pos = G.pos, idx = G.idx, nv = pos.length / 3, H = BI.Head;
  const first = new Map(), w = new Int32Array(nv);                 // 같은 자리의 꼭짓점은 하나로 (이음매에서 갈라진 것)
  for (let i = 0; i < nv; i++) { const k = Math.round(pos[i * 3] * 5000) + ',' + Math.round(pos[i * 3 + 1] * 5000) + ',' + Math.round(pos[i * 3 + 2] * 5000); if (!first.has(k)) first.set(k, i); w[i] = first.get(k); }
  const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i;
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(w[idx[t]]); par[find(w[idx[t + 1]])] = a; par[find(w[idx[t + 2]])] = a; }
  const other = new Set();                                           // 머리뼈 말고 다른 뼈에도 붙은 조각
  for (let i = 0; i < nv; i++) for (let q = 0; q < 4; q++) if (G.wt[i * 4 + q] > .01 && G.jn[i * 4 + q] !== H) other.add(find(w[i]));
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) if (other.has(find(w[idx[t]]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  return new Uint16Array(keep);
}
const ready = () => { unpack(); return loaded === 3; };
const whenReady = () => { unpack(); return Promise.all(Object.values(IMG).map(im => im.decode ? im.decode().catch(() => {}) : Promise.resolve())); };

/* ── 사원수 · 행렬 ── */
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
                        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
const qaxis = (ax, a) => { const s = Math.sin(a / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a / 2)]; };
const qrot = (q, v) => { const x = q[0], y = q[1], z = q[2], w = q[3], tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx]; };
const nlerp = (a, b, k) => { const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const o = [a[0] + (b[0] * s - a[0]) * k, a[1] + (b[1] * s - a[1]) * k, a[2] + (b[2] * s - a[2]) * k, a[3] + (b[3] * s - a[3]) * k], l = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
  return [o[0] / l, o[1] / l, o[2] / l, o[3] / l]; };
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/* a 방향을 b 방향으로 돌리는 가장 짧은 회전 */
function qfromTo(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -.9999) return [1, 0, 0, 0];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], q = [c[0], c[1], c[2], 1 + d], l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
function trs(o, k, t, q) {                               // 이동 + 회전 → 4×4 (열 우선) 를 o[k…] 에
  const x = q[0], y = q[1], z = q[2], w = q[3];
  o[k] = 1 - 2 * (y * y + z * z); o[k + 1] = 2 * (x * y + z * w); o[k + 2] = 2 * (x * z - y * w); o[k + 3] = 0;
  o[k + 4] = 2 * (x * y - z * w); o[k + 5] = 1 - 2 * (x * x + z * z); o[k + 6] = 2 * (y * z + x * w); o[k + 7] = 0;
  o[k + 8] = 2 * (x * z + y * w); o[k + 9] = 2 * (y * z - x * w); o[k + 10] = 1 - 2 * (x * x + y * y); o[k + 11] = 0;
  o[k + 12] = t[0]; o[k + 13] = t[1]; o[k + 14] = t[2]; o[k + 15] = 1;
}
function mmul(o, ok, a, ak, b, bk) {                     // o = a · b (4×4, 열 우선)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[ok + c * 4 + r] = a[ak + r] * b[bk + c * 4] + a[ak + 4 + r] * b[bk + c * 4 + 1] + a[ak + 8 + r] * b[bk + c * 4 + 2] + a[ak + 12 + r] * b[bk + c * 4 + 3];
}

/* ── 자세 ── */
const LT = [], LQ = [], GQ = [], GP = [];                 // 뼈마다 : 제 부모 기준 이동 · 회전, 모델 기준 회전 · 자리
const GM = new Float32Array(NB * 16), SK = new Float32Array(NB * 16), TMP = new Float32Array(16);
function sample(name, u) {                                // 애니메이션의 u(0‥1) 지점 — 뼈마다 [이동, 회전]
  const A = D.anims[name], n = A.frames - 1, f = (((u % 1) + 1) % 1) * n, i = Math.floor(f), k = f - i, j = Math.min(n, i + 1), T = [], Q = [];
  for (let b = 0; b < NB; b++) {
    const o = A.off + (i * NB + b) * 7, p = A.off + (j * NB + b) * 7, a = G.anim;
    T.push([a[o] + (a[p] - a[o]) * k, a[o + 1] + (a[p + 1] - a[o + 1]) * k, a[o + 2] + (a[p + 2] - a[o + 2]) * k]);
    Q.push(nlerp([a[o + 3], a[o + 4], a[o + 5], a[o + 6]], [a[p + 3], a[p + 4], a[p + 5], a[p + 6]], k));
  }
  return [T, Q];
}
const X = [1, 0, 0];
function pose(fig) {
  const st = fig.stride == null ? 1 : Math.max(0, Math.min(1, fig.stride)), ph = (fig.run || 0) / (Math.PI * 2), reach = fig.reach || 0;
  // 서 있음 ↔ 걷기 ↔ 달리기 — stride 로 섞음 (선 자세는 fig.t 가 있으면 숨쉬듯 천천히)
  const [iT, iQ] = sample('Idle', fig.t != null ? fig.t / 180 : 0);
  let T = iT, Q = iQ;
  if (st > .001) {
    const [wT, wQ] = sample('Walk', ph), [rT, rQ] = sample('Run', ph);
    const mix = (aT, aQ, bT, bQ, k) => [aT.map((t, b) => [t[0] + (bT[b][0] - t[0]) * k, t[1] + (bT[b][1] - t[1]) * k, t[2] + (bT[b][2] - t[2]) * k]), aQ.map((q, b) => nlerp(q, bQ[b], k))];
    [T, Q] = st < .5 ? mix(iT, iQ, wT, wQ, st * 2) : mix(wT, wQ, rT, rQ, st * 2 - 2 + 1);
  }
  const H = BI.Hips; T[H] = [D.bones[H].t[0], T[H][1], D.bones[H].t[2]];           // 제자리에서 (앞으로 가는 건 게임이 옮김)
  // 얹는 값 — 모델 기준 축으로 돌리는 회전을 그 뼈의 부모 기준으로 바꿔 끼움
  const extra = (fig.lean != null ? fig.lean - .16 * st : 0) + reach * .06;
  const world = {};                                                               // 뼈 → 모델 기준으로 더 돌릴 회전
  if (Math.abs(extra) > .001) { world[BI.Spine] = qaxis(X, extra * .5); world[BI.Chest] = qaxis(X, extra * .5); }
  if (fig.head) world[BI.Head] = qmul(qaxis([0, 1, 0], fig.head[0] || 0), qaxis(X, fig.head[1] || 0));
  for (let b = 0; b < NB; b++) {
    const p = D.bones[b].parent, pq = p < 0 ? [0, 0, 0, 1] : GQ[p];
    let q = Q[b];
    if (reach > .001) {
      const side = b === BI.LeftUpperArm ? 1 : b === BI.RightUpperArm ? -1 : 0;
      if (side) {                                                                  // 팔을 앞으로 — 뼈가 뻗은 쪽(+Y)을 앞 · 살짝 위 · 안쪽으로
        const cur = qrot(qmul(pq, q), [0, 1, 0]), wob = Math.sin((fig.run || 0) * 2 + side) * .06;
        const tgt = norm([-side * .1, .14 + wob + (side > 0 ? 0 : .1), 1]);
        const full = qfromTo(cur, tgt), part = nlerp([0, 0, 0, 1], full, Math.min(1, reach));
        q = qmul(qmul(qinv(pq), qmul(part, pq)), q);
      }
      if (b === BI.LeftLowerArm || b === BI.RightLowerArm) q = nlerp(q, D.bones[b].r, Math.min(1, reach) * .85);   // 팔꿈치를 폄
    }
    if (world[b]) q = qmul(qmul(qinv(pq), qmul(world[b], pq)), q);
    LQ[b] = q; LT[b] = T[b];
    GQ[b] = qmul(pq, q);
    trs(TMP, 0, T[b], q);
    if (p < 0) GM.set(TMP, b * 16); else mmul(GM, b * 16, GM, p * 16, TMP, 0);
    mmul(SK, b * 16, GM, b * 16, G.ibm, b * 16);
  }
}

/* ── 셰이더 ── */
const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec4 aT; attribute vec2 aUV; attribute vec4 aJ; attribute vec4 aW;
uniform mat4 uVP; uniform mat4 uM; uniform mat4 uB[${NB}];
varying vec3 vP; varying vec3 vN; varying vec4 vT; varying vec2 vUV;
void main(){
  mat4 S = aW.x*uB[int(aJ.x)] + aW.y*uB[int(aJ.y)] + aW.z*uB[int(aJ.z)] + aW.w*uB[int(aJ.w)];
  mat4 MS = uM*S;
  vec4 w = MS*vec4(aP,1.0);
  vP = w.xyz; vN = (MS*vec4(aN,0.0)).xyz; vT = vec4((MS*vec4(aT.xyz,0.0)).xyz, aT.w); vUV = aUV;
  gl_Position = uVP*w;
}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vP; varying vec3 vN; varying vec4 vT; varying vec2 vUV;
uniform sampler2D uBase; uniform sampler2D uNormal; uniform sampler2D uORM;
uniform vec3 uL[5]; uniform vec3 uLC[5];
uniform vec3 uSkyC; uniform vec3 uGndC; uniform vec3 uFog; uniform float uNear; uniform vec4 uRed;
uniform float uAlpha; uniform float uHit; uniform float uDark;
void main(){
  vec3 base = texture2D(uBase, vUV).rgb;
  vec3 orm = texture2D(uORM, vUV).rgb;
  float ao = orm.r, rough = clamp(orm.g, 0.06, 1.0), metal = orm.b;
  vec3 V = normalize(-vP), n = normalize(vN);
  vec3 t = normalize(vT.xyz - n*dot(vT.xyz, n)), b = cross(n, t)*vT.w;
  vec3 nm = texture2D(uNormal, vUV).rgb*2.0 - 1.0;
  n = normalize(t*nm.x + b*nm.y + n*nm.z);
  if(dot(n, V) < 0.0) n = reflect(n, V) * -1.0;
  // 렌즈 — 색 텍스처의 청록 유리 : 새까맣게 가라앉히고 천장 등이 비치게
  float lens = smoothstep(0.045, 0.1, base.b - base.r) * step(base.g, 0.5);
  // 연구원 새 디자인 — 노란 천을 윤기 나는 에메랄드로 (밝고 어두운 결 · 얼룩은 그대로 두고 색만). 장갑 · 장화 · 테이프 같은 무채색은 그대로
  float cloth = smoothstep(0.07, 0.2, min(base.r, base.g) - base.b);
  base = mix(base, vec3(0.06, 0.36, 0.2)*(dot(base, vec3(0.35, 0.55, 0.1))/0.6), cloth);
  rough = mix(rough, max(0.07, rough*0.42), cloth);
  base = mix(base, vec3(dot(base, vec3(0.3, 0.59, 0.11))), 0.1)*0.96;         // 게임의 가라앉은 색조에 맞춰 살짝 덜 쨍하게
  base = mix(base, vec3(0.02, 0.028, 0.034), lens);
  rough = mix(rough, 0.06, lens);
  vec3 dif = base*(1.0 - metal*0.8);
  vec3 f0 = mix(vec3(0.04), base, metal);
  float shin = mix(140.0, 5.0, sqrt(rough)), sk = mix(1.1, 0.06, rough);
  float wrap = 0.22;
  vec3 acc = mix(uGndC, uSkyC, n.y*0.5 + 0.5)*ao, sp = vec3(0.0);
  for(int i=0;i<5;i++){
    vec3 L = uL[i] - vP; float d = length(L); L /= d; float at = 1.0/(1.0 + d*d*0.09);
    acc += uLC[i]*max((dot(n, L) + wrap)/(1.0 + wrap), 0.0)*at*mix(1.0, ao, 0.5);
    sp += uLC[i]*pow(max(dot(n, normalize(L + V)), 0.0), shin)*sk*at;
  }
  float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 col = dif*acc + sp*mix(f0*8.0, vec3(1.0), 0.5)*ao + uSkyC*fr*mix(0.3, 0.05, rough)*ao;
  if(lens > 0.01){
    vec3 R = reflect(-V, n);
    float strip = smoothstep(0.05, 0.6, R.y)*smoothstep(0.35, 0.95, sin(R.z*6.0 + R.x*1.5)*0.5 + 0.5);
    col += lens*(uSkyC*(0.25*smoothstep(-0.35, 0.7, R.y) + 2.2*strip)*(0.3 + 0.7*fr) + uSkyC*fr*0.5);
  }
  col *= 1.0 - uDark;
  col = mix(col, vec3(1.0), uHit);
  col = mix(uFog, col, uNear);
  col = mix(col, uRed.rgb, uRed.a);
  gl_FragColor = vec4(col*uAlpha, uAlpha);
}`;

function attach(gl) {
  unpack();
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let pr;
  try {
    pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  } catch (e) { return null; }                                                    // 뼈 행렬이 너무 많다는 기기 등 — 예전 방식으로
  const AT = [['aP', 'pos', 3], ['aN', 'nor', 3], ['aT', 'tan', 4], ['aUV', 'uv', 2], ['aJ', 'jn', 4], ['aW', 'wt', 4]].map(([n, k, sz]) => {
    const loc = gl.getAttribLocation(pr, n), b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, G[k], gl.STATIC_DRAW); return { loc, b, sz }; });
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, G.idx, gl.STATIC_DRAW);
  const un = {}; ['uVP', 'uM', 'uB', 'uBase', 'uNormal', 'uORM', 'uL', 'uLC', 'uSkyC', 'uGndC', 'uFog', 'uNear', 'uRed', 'uAlpha', 'uHit', 'uDark'].forEach(n => un[n] = gl.getUniformLocation(pr, n));
  let tex = null;
  const upload = () => { tex = {}; ['base', 'normal', 'orm'].forEach(k => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, IMG[k]); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); tex[k] = t; }); };
  return {
    /* base : 발밑 원점의 4×4 (자리 · 방향), VP : 투영. 그렸으면 true (텍스처가 아직이면 false) */
    draw(base, VP, fig, env) {
      if (!ready()) return false;
      if (!tex) upload();
      pose(fig);
      gl.useProgram(pr);
      gl.uniformMatrix4fv(un.uVP, false, new Float32Array(VP)); gl.uniformMatrix4fv(un.uM, false, new Float32Array(base)); gl.uniformMatrix4fv(un.uB, false, SK);
      const L = env.lights.slice(0, 5); while (L.length < 5) L.push([[0, 0, 0], [0, 0, 0]]);
      gl.uniform3fv(un.uL, new Float32Array(L.flatMap(l => l[0]))); gl.uniform3fv(un.uLC, new Float32Array(L.flatMap(l => l[1])));
      gl.uniform3fv(un.uSkyC, new Float32Array(env.sky)); gl.uniform3fv(un.uGndC, new Float32Array(env.gnd));
      gl.uniform3fv(un.uFog, new Float32Array(env.fog)); gl.uniform1f(un.uNear, env.near); gl.uniform4fv(un.uRed, new Float32Array(env.red || [0, 0, 0, 0]));
      gl.uniform1f(un.uAlpha, fig.alpha == null ? 1 : fig.alpha); gl.uniform1f(un.uHit, fig.hit || 0); gl.uniform1f(un.uDark, fig.dark || 0);
      [['base', un.uBase], ['normal', un.uNormal], ['orm', un.uORM]].forEach(([k, u], i) => { gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, tex[k]); gl.uniform1i(u, 1 + i); });
      for (const a of AT) if (a.loc >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, a.b); gl.enableVertexAttribArray(a.loc); gl.vertexAttribPointer(a.loc, a.sz, gl.FLOAT, false, 0, 0); }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.drawElements(gl.TRIANGLES, G.idx.length, gl.UNSIGNED_SHORT, 0);
      for (const a of AT) if (a.loc >= 0) gl.disableVertexAttribArray(a.loc);
      gl.activeTexture(gl.TEXTURE0);
      return true;
    },
    /* 방금 그린 자세에서 그 뼈의 스킨 행렬 — 선 자세(바인드) 기준으로 지은 소품을 뼈에 붙임 */
    bone(name) { const b = BI[name]; return b == null ? null : Array.from(SK.subarray(b * 16, b * 16 + 16)); }
  };
}
window.Hazmat = { attach, ready, whenReady, bones: D.bones.map(b => b.name) };
})();
