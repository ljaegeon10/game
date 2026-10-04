'use strict';
/* ═══════════════════════════════════════════════════════════════
   corridor3d.js — 탈출 복도, 실사 3D (WebGL)

   비상구에서 바깥 문까지 640m 복도를 화면 해상도로 그립니다. 픽셀 복도(escape.js)와
   같은 자리 · 같은 투영(P)이라 판정 · 글자 · 손에 든 총은 그대로 얹힙니다.

     실험실 (~140m)  청회색 페인트 벽(아래는 짙은 걸레받이 판) · 비닐 타일 바닥(형광등이
                     비침) · 흡음 천장 타일 · 범퍼 레일 · 문(창 · 손잡이 · 발판 · 호실 표찰) ·
                     소화기함 · 손 소독기 · 게시판 · CCTV · 케이블 트레이 · 스프링클러
     넘어가는 길     (140~400m) 벽 · 바닥 · 천장의 무늬가 서서히 섞여 바뀝니다.
                     바닥엔 내 머리에서 나온 전극선 네 가닥이 따라오고, 링거대 · 심전도 ·
                     빈 침대(묶는 끈)가 복도에 서 있습니다 — 이건 탈출이 아니라는 흔적.
     백룸 (~400m~)   누런 벽지 · 축축한 카펫 · 얼룩진 천장 타일 · 빠진 타일 구멍 ·
                     문 대신 어둠으로 이어지는 옆 통로

   복도는 16m 덩어리로 미리 지어 두고 보이는 것만 그립니다. 장애물은 판을 새로 시작할
   때마다 다시 짓고, 사람(figure3d.js)은 같은 화면 · 같은 깊이 버퍼에 그려 가림이 맞습니다.

   좌표 : x 옆(−1.9‥1.9) · y 위(0‥3) · z 복도 앞(−40‥640). 앞을 보면 +x 가 화면 오른쪽.
   ═══════════════════════════════════════════════════════════════ */
(() => {
const L3 = window.Lab3D, FU = window.Fig3DUtil;
if (!L3 || !FU || !window.Figure3D) return;
const { Mesh, hex } = L3;
const { camProj, M4 } = FU;

const HW = 1.9, CH = 3.0, SEG = 2, RUN_LEN = 640, Z0 = -40, CHUNK = 16, LANE = 1.2;
const GUN_Z = 286;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, k) => a + (b - a) * k;
const mixC = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const theme = z => { const k = clamp01((z - 140) / 260); return k * k * (3 - 2 * k); };
const hash = n => { n = (n * 374761393) ^ (n >>> 13); n = Math.imul(n, 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
let RS = 11;
const rnd = () => (RS = (RS * 16807) % 2147483647) / 2147483647;

/* ═════════════ 길 — 곧은 구간과 90° 모퉁이 ═════════════════════
   게임은 복도 좌표(s 앞 · x 옆)로만 생각하고, 그림만 이 길 위에 얹습니다.
   모퉁이 [s, 방향(+1 오른쪽 · −1 왼쪽)] 는 길이 JL(4m) 동안 안쪽 모서리를 축으로 돌아 나갑니다 —
   바깥 벽은 둥글게 휘고, 안쪽 벽은 모서리 한 점으로 모입니다. 좌우를 번갈아 꺾어 길이 겹치지 않습니다. */
const JL = 4;
const CORNERS = [[150, 1], [200, -1], [256, 1], [468, -1], [526, 1], [586, -1]];
const right2 = d => [d[1], -d[0]];
const PATH = (() => {
  const segs = [{ s0: -1e9, sref: 0, O: [0, 0], d: [0, 1] }], juns = [];
  for (const [S, sg] of CORNERS) {
    const A = segs[segs.length - 1], rA = right2(A.d);
    const P = [A.O[0] + A.d[0] * (S - A.sref), A.O[1] + A.d[1] * (S - A.sref)];
    const K = [P[0] + sg * rA[0] * HW, P[1] + sg * rA[1] * HW];
    const dB = [sg * rA[0], sg * rA[1]], J = [P[0] + A.d[0] * HW, P[1] + A.d[1] * HW];
    juns.push({ S, sg, K, dA: A.d, rA });
    segs.push({ s0: S + JL, sref: S + JL, O: [J[0] + dB[0] * HW, J[1] + dB[1] * HW], d: dB });
  }
  return { segs, juns };
})();
const junAt = s => { for (const J of PATH.juns) if (s >= J.S && s < J.S + JL) return J; return null; };
const segAt = s => { let g = PATH.segs[0]; for (const q of PATH.segs) if (s >= q.s0) g = q; return g; };
/* 복도 좌표 (s, x) → 바닥 위 [X, Z] */
function pathPos(s, x) {
  const J = junAt(s);
  if (J) {
    const th = (s - J.S) / JL * Math.PI / 2, c = Math.cos(th), sn = Math.sin(th), rho = HW - J.sg * x;
    return [J.K[0] + (-J.sg * J.rA[0] * c + J.dA[0] * sn) * rho, J.K[1] + (-J.sg * J.rA[1] * c + J.dA[1] * sn) * rho];
  }
  const g = segAt(s), r = right2(g.d);
  return [g.O[0] + g.d[0] * (s - g.sref) + r[0] * x, g.O[1] + g.d[1] * (s - g.sref) + r[1] * x];
}
/* 그 자리에서 앞을 보는 방향 [hx, hz] */
function headingAt(s) {
  const J = junAt(s);
  if (J) { const th = (s - J.S) / JL * Math.PI / 2, c = Math.cos(th), sn = Math.sin(th);
    return [J.dA[0] * c + J.sg * J.rA[0] * sn, J.dA[1] * c + J.sg * J.rA[1] * sn]; }
  return segAt(s).d;
}
/* 곧게 지은 메시를 길 위로 — 꼭짓점마다 옮기고, 셰이더용 복도 좌표(s, x)를 덧붙여 14 개씩 */
function mapMesh(v) {
  const n = v.length / 12, o = new Float32Array(n * 14);
  for (let i = 0; i < n; i++) {
    const a = i * 12, b = i * 14, x = v[a], z = v[a + 2];
    const p = pathPos(z, x), h = headingAt(z), r = right2(h);
    o[b] = p[0]; o[b + 1] = v[a + 1]; o[b + 2] = p[1];
    o[b + 3] = r[0] * v[a + 3] + h[0] * v[a + 5]; o[b + 4] = v[a + 4]; o[b + 5] = r[1] * v[a + 3] + h[1] * v[a + 5];
    for (let k = 6; k < 12; k++) o[b + k] = v[a + k];
    o[b + 12] = z; o[b + 13] = x;
  }
  return o;
}
const nearCorner = (z0, z1, pad = 4) => CORNERS.some(([S]) => z1 > S - pad && z0 < S + JL + pad);

/* ── 재질 번호 — 0 무광 · 1 빛 · 2+s 광택 · 7 바닥(실험실 비닐은 반짝, 백룸 카펫은 무광) ── */
const FLOOR = 7;

/* ═════════════ 무늬 텍스처 (512 × 512, 반복) ═════════════════════ */
function tex(fn) { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); RS = 11; fn(x, 512); return c; }
function grain(x, n, a, cols, wMax = 2) { for (let i = 0; i < n; i++) { x.fillStyle = cols[(rnd() * cols.length) | 0]; x.globalAlpha = a * (.4 + rnd() * .6); x.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * wMax, 1 + rnd() * wMax); } x.globalAlpha = 1; }
function blot(x, n, r0, r1, col, a) { for (let i = 0; i < n; i++) { const cx = rnd() * 512, cy = rnd() * 512, r = r0 + rnd() * (r1 - r0);
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
  x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); } }
const TEX = {
  /* 실험실 벽 — 위는 밝은 청회색 페인트, 1m 아래는 짙은 판(v .667 아래). 2.4m 에 판 이음매 둘 */
  wallLab: x => {
    x.fillStyle = '#9ba9b8'; x.fillRect(0, 0, 512, 512);
    const lg = x.createLinearGradient(0, 0, 0, 340); lg.addColorStop(0, '#8e9cac'); lg.addColorStop(1, '#a3b0be'); x.fillStyle = lg; x.fillRect(0, 0, 512, 340);
    x.fillStyle = '#56657a'; x.fillRect(0, 345, 512, 167);
    grain(x, 9000, .05, ['#000', '#fff']);
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(40,40,40,${.03 + rnd() * .05})`; x.fillRect(rnd() * 512, 360 + rnd() * 140, 6 + rnd() * 30, 1 + rnd() * 2); }   // 아래판 긁힘
    for (const u of [0, 256]) { x.fillStyle = 'rgba(30,38,50,.55)'; x.fillRect(u, 0, 2, 512); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(u + 2, 0, 1, 512); }
    x.fillStyle = 'rgba(20,26,34,.5)'; x.fillRect(0, 343, 512, 3);
    blot(x, 6, 40, 120, 'rgba(60,70,80,A)', .08);
  },
  /* 실험실 바닥 — 60cm 비닐 타일, 이음매 · 테라초 같은 점 · 닳은 자국 */
  floorLab: x => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) & 1 ? '#3e4a5a' : '#46525f'; x.fillRect(i * 128, j * 128, 128, 128); }
    grain(x, 14000, .18, ['#1e2630', '#6a7686', '#8a96a4'], 2);
    blot(x, 10, 30, 90, 'rgba(20,24,30,A)', .12);
    x.fillStyle = 'rgba(14,18,24,.75)'; for (let i = 0; i <= 4; i++) { x.fillRect(i * 128 - 1, 0, 2, 512); x.fillRect(0, i * 128 - 1, 512, 2); }
  },
  /* 실험실 천장 — 60cm 흡음 타일, T 바, 작은 구멍 무늬 */
  ceilLab: x => {
    x.fillStyle = '#cdd2d6'; x.fillRect(0, 0, 512, 512);
    grain(x, 16000, .16, ['#8a9096', '#a0a6ac'], 1.5);
    blot(x, 5, 40, 100, 'rgba(120,110,90,A)', .1);
    x.fillStyle = '#8f979f'; for (let i = 0; i <= 4; i++) { x.fillRect(i * 128 - 3, 0, 6, 512); x.fillRect(0, i * 128 - 3, 512, 6); }
  },
  /* 백룸 벽지 — 누런 바탕에 세로 줄 · 작은 마름모, 물 얼룩 · 떠오른 이음매 */
  wallBack: x => {
    x.fillStyle = '#bca85c'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16; i++) { x.fillStyle = i & 1 ? 'rgba(150,128,58,.22)' : 'rgba(220,206,140,.18)'; x.fillRect(i * 32, 0, 16, 512); }
    x.fillStyle = 'rgba(120,100,40,.25)';
    for (let i = 0; i < 16; i++) for (let j = 0; j < 22; j++) { const cx = i * 32 + 24, cy = j * 24 + (i & 1) * 12; x.beginPath(); x.moveTo(cx, cy - 4); x.lineTo(cx + 3, cy); x.lineTo(cx, cy + 4); x.lineTo(cx - 3, cy); x.fill(); }
    grain(x, 9000, .06, ['#4a3a10', '#fff6c0']);
    blot(x, 9, 30, 140, 'rgba(110,84,30,A)', .22);
    for (let i = 0; i < 4; i++) { const u = (rnd() * 512) | 0; x.fillStyle = 'rgba(90,70,24,.35)'; x.fillRect(u, 0, 1, 512); }
    const lg = x.createLinearGradient(0, 380, 0, 512); lg.addColorStop(0, 'rgba(90,70,20,0)'); lg.addColorStop(1, 'rgba(90,70,20,.35)'); x.fillStyle = lg; x.fillRect(0, 380, 512, 132);
  },
  /* 백룸 카펫 — 누런 갈색 털, 젖어 짙은 얼룩 */
  floorBack: x => {
    x.fillStyle = '#7e6c3e'; x.fillRect(0, 0, 512, 512);
    grain(x, 40000, .22, ['#5a4a24', '#9a8650', '#6a5a30'], 1.6);
    blot(x, 12, 40, 150, 'rgba(50,38,14,A)', .28);
  },
  /* 백룸 천장 — 누렇게 바랜 타일, 갈색 물 얼룩 */
  ceilBack: x => {
    x.fillStyle = '#cfc59a'; x.fillRect(0, 0, 512, 512);
    grain(x, 12000, .14, ['#8a8058', '#e8e0b8'], 1.5);
    blot(x, 8, 30, 110, 'rgba(130,96,40,A)', .25);
    x.fillStyle = '#a69c72'; for (let i = 0; i <= 4; i++) { x.fillRect(i * 128 - 3, 0, 6, 512); x.fillRect(0, i * 128 - 3, 512, 6); }
  }
};

/* ═════════════ 셰이더 ═════════════════════════════════════ */
const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute vec2 aUV; attribute float aE; attribute vec2 aSX;
uniform mat4 uVP;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE; varying vec2 vSX;
void main(){ vP=aP; vN=aN; vC=aC; vUV=aUV; vE=aE; vSX=aSX; gl_Position=uVP*vec4(aP,1.0); }`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE; varying vec2 vSX;
uniform vec3 uEye; uniform vec3 uL[8]; uniform vec3 uLC[8]; uniform int uNL;
uniform vec3 uFogA; uniform vec3 uFogB; uniform vec3 uAmbA; uniform vec3 uAmbB;
uniform float uLights; uniform float uRed; uniform float uFlick; uniform float uTexOn;
uniform sampler2D uTa; uniform sampler2D uTb;
float h3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main(){
  float th=smoothstep(140.0,400.0,vSX.x);                     // 복도 좌표로 — 꺾여도 같은 자리에서 바뀜
  vec3 c=vC;
  if(uTexOn>0.5 && vUV.x>-0.5){
    c*=mix(texture2D(uTa,vUV).rgb, texture2D(uTb,vUV).rgb, th);
    float big=vn(vP*vec3(.35,.5,.35));                         // 넓은 얼룩 — 무늬 반복이 드러나지 않게
    c*=mix(.92+.16*big, .74+.42*big, th);
  }
  vec3 V=normalize(uEye-vP), n=normalize(vN);
  if(dot(n,V)<0.0) n=-n;
  vec3 col;
  float code=vE;
  if(code>0.5 && code<1.5){ col=c; }
  else {
    float spec=0.0, rough=20.0;
    if(code>6.5){ spec=.55*(1.0-th); rough=60.0; }
    else if(code>1.5){ spec=code-2.0; rough=12.0+spec*80.0; }
    vec3 acc=mix(uAmbA,uAmbB,th)*(.7+.3*n.y), sp=vec3(0.0);
    for(int i=0;i<8;i++){
      if(i>=uNL) break;
      vec3 L=uL[i]-vP; float d=length(L); L/=d; float at=1.0/(1.0+d*d*.22);
      acc+=uLC[i]*max(dot(n,L),0.0)*at;
      sp+=uLC[i]*pow(max(dot(n,normalize(L+V)),0.0),rough)*spec*at;
    }
    float ao=(.55+.45*smoothstep(0.0,.55,vP.y))*(.78+.22*smoothstep(0.0,.45,3.0-vP.y));
    if(abs(n.y)>.6) ao=(.7+.3*smoothstep(0.0,.7,1.9-abs(vSX.y)));
    col=c*acc*ao+sp;
  }
  float d=length(vP-uEye), nr=clamp(1.0-d/44.0,0.0,1.0);
  float near=pow(nr,1.25)*(uLights*.85+.15);
  if(code>0.5 && code<1.5) near=max(near, nr*.55);
  vec3 fog=mix(uFogA,uFogB,th);
  col=mix(fog,col,near);
  float red=uRed*(1.0-th)*(.4+nr*.6);
  col=mix(col,vec3(.82,.1,.1),red);
  col=mix(col,fog,uFlick*.55);
  gl_FragColor=vec4(col,1.0);
}`;

/* ═════════════ 복도 짓기 ═══════════════════════════════════ */
const C = {
  rail: [hex('#4f7f86'), hex('#8a6a3a')], base: [hex('#20262e'), hex('#4a3818')], frame: hex('#8994a2'), leaf: hex('#5d6c80'),
  glass: hex('#0e141c'), chrome: hex('#c3ccd5'), red: hex('#a82a28'), white: hex('#e4e8ea'), cork: hex('#8a6a42'), dark: hex('#05060a'),
  tray: hex('#6c7682'), housing: hex('#b9c0c8'), black: hex('#141519'), yel: hex('#d8a83c'), steel: hex('#8c96a2'), sheet: hex('#d8dcd8')
};
const tcol = (pair, z) => mixC(pair[0], pair[1], theme(z));
/* 벽 한 장 (x 고정) — 무늬 좌표는 m 단위 (가로 2.4m · 세로 3m 가 한 장) */
function wallQuad(m, x, za, zb, ya, yb) {
  m.quad([x, yb, za], [x, yb, zb], [x, ya, zb], [x, ya, za], [1, 1, 1], { uv: [100 + za / 2.4, (CH - yb) / CH, 100 + zb / 2.4, (CH - ya) / CH] });   // +100 — 무늬 좌표는 늘 양수 (음수는 '무늬 없음' 표시)
}
function floorQuad(m, xa, xb, za, zb, y = 0) {
  m.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], [1, 1, 1], { uv: [100 + xa / 2.4, 100 + za / 2.4, 100 + xb / 2.4, 100 + zb / 2.4], m: FLOOR });
}
function ceilQuad(m, xa, xb, za, zb, y = CH) {
  m.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], [1, 1, 1], { uv: [100 + xa / 2.4, 100 + za / 2.4, 100 + xb / 2.4, 100 + zb / 2.4] });
}
/* 마디(2m) 하나에 문이 있으면 [쪽(−1/1), 시작 z, 끝 z, 실험실 문인지] */
function doorAt(idx) {
  const h = hash(idx); if (!(h < .22 && idx > -20)) return null;
  const z0 = idx * SEG, lab = theme(z0 + 1) < .5 + (hash(idx * 13 + 5) - .5) * .3;
  return { side: h < .11 ? -1 : 1, za: z0 + .35, zb: z0 + 1.55, lab };
}
const lightAt = idx => idx % 3 === 0;
const brokenAt = idx => hash(idx * 7 + 3) < .18 && idx * SEG > 120;

/* 모퉁이 조각 — 잘게 나눠 지어야 휘어 붙일 때 바깥 벽이 매끈합니다. 안쪽 벽은 한 점으로 모이므로 짓지 않음 */
function buildJunction(F, W, Ce, Pm, J, z0, z1) {
  const n = 10, os = -J.sg, x = os * HW, tb = theme(z0 + 1), rc = tcol(C.rail, z0), bc = tcol(C.base, z0);
  for (let i = 0; i < n; i++) {
    const a = lerp(z0, z1, i / n), b = lerp(z0, z1, (i + 1) / n);
    floorQuad(F, -HW, HW, a, b); ceilQuad(Ce, -HW, HW, a, b); wallQuad(W, x, a, b, 0, CH);
    Pm.rbox(os < 0 ? x : x - .045, os < 0 ? x + .045 : x, .95, 1.08, a, b, rc, .006, { s: tb < .5 ? .35 : .15 });
    Pm.rbox(os < 0 ? x : x - .018, os < 0 ? x + .018 : x, 0, .12, a, b, bc, .004, { s: .2 });
  }
  // 바깥 벽 한가운데 — 꺾는 쪽을 가리키는 표지 (검은 판 · 노란 꺾쇠 셋, 스스로 빛남)
  if (z0 === J.S) {
    const wx = x - os * .012, zc = J.S + JL / 2;
    for (let i = 0; i < 15; i++) { const za = zc - .75 + i * .1, zb = za + .1;      // 판도 잘게 — 휜 벽을 따라
      Pm.quad([wx, 2.0, za], [wx, 2.0, zb], [wx, 1.32, zb], [wx, 1.32, za], hex('#15161b'), { s: .3 }); }
    const fx = wx - os * .003;
    for (let k = -1; k <= 1; k++) {
      const c = zc + k * .38, y = 1.66, t = .05;
      Pm.quad([fx, y + .24, c - .14], [fx, y + .24, c - .14 + t * 2], [fx, y, c + .1 + t], [fx, y, c + .1 - t], C.yel, { e: true });
      Pm.quad([fx, y, c + .1 - t], [fx, y, c + .1 + t], [fx, y - .24, c - .14 + t * 2], [fx, y - .24, c - .14], C.yel, { e: true });
    }
  }
}

function buildChunk(c0) {
  const F = new Mesh(), W = new Mesh(), Ce = new Mesh(), Pm = new Mesh();
  for (let idx = Math.floor(c0 / SEG); idx < Math.floor((c0 + CHUNK) / SEG); idx++) {
    const z0 = idx * SEG, z1 = z0 + SEG, zm = z0 + 1, tb = theme(zm);
    if (z1 <= Z0 || z0 >= RUN_LEN) continue;
    const Jn = junAt(z0 + .01);
    if (Jn) { buildJunction(F, W, Ce, Pm, Jn, z0, z1); if (lightAt(idx)) Pm.rbox(-.6, .6, CH - .035, CH, z0 + .66, z0 + 1.34, C.housing, .012, { s: .3 }); continue; }
    const calm = nearCorner(z0, z1);                                     // 모퉁이 앞뒤는 문 · 소품 없이 깔끔하게
    floorQuad(F, -HW, HW, z0, z1);
    // 천장 — 백룸으로 갈수록 타일이 하나둘 빠져 있습니다
    ceilQuad(Ce, -HW, HW, z0, z1);
    if (tb > .55 && hash(idx * 31 + 7) < .22) { const cx = -1.2 + hash(idx * 3) * 1.8, cz = z0 + .2 + hash(idx * 5) * 1.1;
      Pm.quad([cx, CH - .004, cz], [cx + .6, CH - .004, cz], [cx + .6, CH - .004, cz + .6], [cx, CH - .004, cz + .6], C.dark, { e: true }); }
    const door = calm ? null : doorAt(idx);
    for (const side of [-1, 1]) {
      const x = side * HW;
      if (door && door.side === side) {
        wallQuad(W, x, z0, door.za, 0, CH); wallQuad(W, x, door.zb, z1, 0, CH); wallQuad(W, x, door.za, door.zb, 2.15, CH);
        buildDoor(door, W, F, Ce, Pm, idx);
      } else wallQuad(W, x, z0, z1, 0, CH);
      // 범퍼 레일 (실험실 청록 → 백룸 나무 몰딩) · 걸레받이
      const rc = tcol(C.rail, zm), bc = tcol(C.base, zm);
      const segs = door && door.side === side ? [[z0, door.za - .06], [door.zb + .06, z1]] : [[z0, z1]];
      for (const [a, b] of segs) if (b > a) {
        Pm.rbox(side < 0 ? x : x - .045, side < 0 ? x + .045 : x, .95, 1.08, a, b, rc, .012, { s: tb < .5 ? .35 : .15 });
        Pm.rbox(side < 0 ? x : x - .018, side < 0 ? x + .018 : x, 0, .12, a, b, bc, .006, { s: .2 });
      }
    }
    // 형광등 틀 (빛나는 판은 매 프레임)
    if (lightAt(idx)) Pm.rbox(-.6, .6, CH - .035, CH, z0 + .66, z0 + 1.34, C.housing, .012, { s: .3 });
    // 실험실 소품 — 백룸으로 갈수록 드물어지다 사라집니다
    const labK = tb < .5 + (hash(idx * 17) - .5) * .4;
    if (labK && idx > -20 && !calm) {
      const free = s => !(door && door.side === s);
      if (hash(idx * 41 + 1) < .5) {                                   // 케이블 트레이 (오른쪽 천장 가장자리)
        Pm.rbox(HW - .42, HW - .06, CH - .27, CH - .24, z0, z1, C.tray, .006, { s: .4 });
        Pm.rbox(HW - .42, HW - .4, CH - .27, CH - .19, z0, z1, C.tray, .004); Pm.rbox(HW - .08, HW - .06, CH - .27, CH - .19, z0, z1, C.tray, .004);
        Pm.cyl([HW - .24, CH - .24, z0 + 1], [HW - .24, CH, z0 + 1], .006, .006, C.steel, 6);
        for (let k = 0; k < 3; k++) Pm.cyl([HW - .4 + k * .05, CH - .235, z0], [HW - .4 + k * .05, CH - .235, z1], .012, .012, [hex('#2f6fb5'), hex('#20242a'), hex('#c2352c')][k], 6);
      }
      const hp = hash(idx * 59 + 3);
      if (hp < .14 && free(-1)) extinguisher(Pm, -1, z0 + .8);
      else if (hp < .26 && free(1)) noticeBoard(Pm, 1, z0 + .5);
      else if (hp < .36 && free(-1)) sanitizer(Pm, -1, z0 + 1);
      else if (hp < .44 && free(1)) wallVent(Pm, 1, z0 + .6);
      if (idx % 9 === 4) cctv(Pm, z0 + 1);
      if (idx % 2 === 0) { const sz = z0 + .2; Pm.lathe([.9, CH, sz], [0, -1, 0], [[.025, 0], [.025, .004], [.008, .006], [.008, .035], [0, .036]], C.chrome, 8, { s: .8 }); }
    } else if (tb > .55) {
      if (hash(idx * 23 + 9) < .2) { const s2 = hash(idx * 29) < .5 ? -1 : 1, oz = z0 + .4 + hash(idx * 37) * 1.2;   // 콘센트
        Pm.rbox(s2 < 0 ? -HW : HW - .012, s2 < 0 ? -HW + .012 : HW, .28, .38, oz, oz + .07, hex('#d8d0b0'), .004); }
    }
  }
  return { F, W, Ce, Pm };
}
/* 문 — 실험실은 문틀 · 문짝(창 · 손잡이 · 발판) · 호실 표찰, 백룸은 어둠으로 이어지는 옆 통로 */
function buildDoor(d, W, F, Ce, Pm, idx) {
  const s = d.side, x = s * HW, out = x + s * .14, za = d.za, zb = d.zb, T = 2.15;
  // 문틀 안쪽 면 (벽 두께)
  W.quad([x, T, za], [out, T, za], [out, 0, za], [x, 0, za], [1, 1, 1], { uv: [0, .28, .06, 1] });
  W.quad([x, T, zb], [out, T, zb], [out, 0, zb], [x, 0, zb], [1, 1, 1], { uv: [0, .28, .06, 1] });
  W.quad([x, T, za], [x, T, zb], [out, T, zb], [out, T, za], [1, 1, 1], { uv: [0, 0, .5, .05] });
  if (d.lab) {
    const fx0 = s < 0 ? x : x - .03, fx1 = s < 0 ? x + .03 : x;
    Pm.rbox(fx0, fx1, 0, T + .07, za - .07, za, C.frame, .01, { s: .45 }); Pm.rbox(fx0, fx1, 0, T + .07, zb, zb + .07, C.frame, .01, { s: .45 });
    Pm.rbox(fx0, fx1, T, T + .07, za - .07, zb + .07, C.frame, .01, { s: .45 });
    const lx0 = s < 0 ? out - .04 : out, lx1 = s < 0 ? out : out + .04;
    Pm.rbox(lx0, lx1, 0, T, za, zb, C.leaf, .01, { s: .3 });
    const fx = s < 0 ? out + .002 : out - .002, wz = (za + zb) / 2;
    Pm.quad([fx, 1.85, wz - .16], [fx, 1.85, wz + .16], [fx, 1.3, wz + .16], [fx, 1.3, wz - .16], C.glass, { s: .95 });
    Pm.rbox(s < 0 ? fx : fx - .012, s < 0 ? fx + .012 : fx, 1.28, 1.87, wz - .18, wz + .18, C.frame, .004, { s: .5 });
    Pm.rbox(s < 0 ? fx : fx - .004, s < 0 ? fx + .004 : fx, .02, .22, za + .02, zb - .02, C.steel, .003, { s: .8 });
    const hz = idx & 1 ? za + .1 : zb - .1, hx = fx - s * .045;
    Pm.cyl([fx, 1.02, hz], [hx, 1.02, hz], .01, .01, C.chrome, 8, false, { s: .9 });
    Pm.cyl([hx, 1.02, hz], [hx, 1.02, hz + (idx & 1 ? .13 : -.13)], .011, .011, C.chrome, 8, true, { s: .9 });
    const pz = idx & 1 ? zb + .16 : za - .3;                                 // 호실 표찰
    Pm.rbox(s < 0 ? x : x - .012, s < 0 ? x + .012 : x, 1.5, 1.66, pz, pz + .14, C.white, .004, { s: .4 });
    Pm.rbox(s < 0 ? x + .012 : x - .013, s < 0 ? x + .013 : x - .012, 1.6, 1.64, pz + .02, pz + .12, hex('#2f6fb5'), .002);
  } else {
    const deep = x + s * 2.6;                                                // 옆 통로 — 몇 걸음 안 가 어둠
    W.quad([out, T, za], [deep, T, za], [deep, 0, za], [out, 0, za], [1, 1, 1], { uv: [0, .28, 1, 1] });
    W.quad([out, T, zb], [deep, T, zb], [deep, 0, zb], [out, 0, zb], [1, 1, 1], { uv: [0, .28, 1, 1] });
    floorQuad(F, Math.min(x, deep), Math.max(x, deep), za, zb);
    ceilQuad(Ce, Math.min(x, deep), Math.max(x, deep), za, zb, T);
    Pm.quad([deep, T, za], [deep, T, zb], [deep, 0, zb], [deep, 0, za], C.dark, { e: true });
  }
}
/* 벽걸이 소화기 — 붉은 받침판 · 걸쇠 · 몸통 · 손잡이 · 호스, 위에 붉은 안내판 */
function extinguisher(m, s, z) {
  const x = s * HW, cx = x - s * .1, cz = z + .2;
  m.rbox(s < 0 ? x : x - .012, s < 0 ? x + .012 : x, .95, 1.6, z, z + .4, hex('#9a2422'), .006, { s: .2 });
  m.rbox(s < 0 ? x : x - .04, s < 0 ? x + .04 : x, 1.3, 1.36, cz - .05, cz + .05, C.steel, .006, { s: .6 });
  m.lathe([cx, 1.0, cz], [0, 1, 0], [[0, 0], [.07, 0], [.078, .02], [.078, .4], [.06, .45], [.025, .48]], hex('#c0302c'), 16, { s: .55 });
  m.cyl([cx, 1.15, cz - .0805], [cx, 1.3, cz - .0805], .0815, .0815, C.white, 2);
  m.lathe([cx, 1.48, cz], [0, 1, 0], [[.025, 0], [.025, .04], [.018, .05]], C.black, 10, { s: .5 });
  m.obox([cx, 1.55, cz + .04], [.012, 0, 0], [0, .008, 0], [0, .01, .07], C.black, { s: .4 });
  m.tube([[cx, 1.5, cz - .02], [cx - s * .02, 1.35, cz - .1], [cx - s * .03, 1.12, cz - .09]], .01, C.black, 6);
  m.rbox(s < 0 ? x : x - .01, s < 0 ? x + .01 : x, 1.7, 1.85, z + .05, z + .35, hex('#b0262a'), .004);
}
function noticeBoard(m, s, z) {
  const x = s * HW;
  m.rbox(s < 0 ? x : x - .03, s < 0 ? x + .03 : x, 1.15, 1.85, z, z + 1.0, hex('#6b5a45'), .01);
  m.rbox(s < 0 ? x + .03 : x - .034, s < 0 ? x + .034 : x - .03, 1.2, 1.8, z + .05, z + .95, C.cork, .004);
  for (let i = 0; i < 6; i++) { const pz = z + .1 + (i % 3) * .28 + rnd() * .05, py = 1.32 + Math.floor(i / 3) * .26 + rnd() * .04, fx = s < 0 ? x + .035 : x - .036;
    m.rbox(s < 0 ? fx : fx - .002, s < 0 ? fx + .002 : fx, py, py + .2, pz, pz + .15, i % 4 === 3 ? hex('#e8d890') : C.white, .002);
    m.sphere([fx - s * -.004, py + .18, pz + .075], .007, [hex('#c2352c'), hex('#2f6fb5'), hex('#e3b23c')][i % 3], 6); }
}
function sanitizer(m, s, z) {
  const x = s * HW;
  m.rbox(s < 0 ? x : x - .1, s < 0 ? x + .1 : x, 1.15, 1.42, z, z + .12, C.white, .02, { s: .4 });
  m.rbox(s < 0 ? x + .1 : x - .104, s < 0 ? x + .104 : x - .1, 1.25, 1.36, z + .02, z + .1, hex('#7da0c8'), .006);
}
function wallVent(m, s, z) {
  const x = s * HW;
  m.rbox(s < 0 ? x : x - .015, s < 0 ? x + .015 : x, .25, .55, z, z + .5, C.steel, .006, { s: .4 });
  for (let i = 0; i < 6; i++) m.rbox(s < 0 ? x + .012 : x - .02, s < 0 ? x + .02 : x - .012, .29 + i * .042, .3 + i * .042, z + .03, z + .47, hex('#2a3038'), .002);
}
function cctv(m, z) {
  m.lathe([-HW + .3, CH, z], [0, -1, 0], [[.07, 0], [.07, .02], [.065, .04], [0, .1]], hex('#d8dcdf'), 16, { s: .4 });
  m.ellipsoid([-HW + .3, CH - .055, z], [.055, 0, 0], [0, .045, 0], [0, 0, .055], hex('#15181d'), 14, 8, { s: .95 });
}

/* 처음의 비상구 벽 (z = 0) · 바깥 문 (z = RUN_LEN) */
function buildEnds(W, Pm) {
  const L = -.62, R = .62, T = 2.15;
  for (const z of [0]) {
    W.quad([-HW, CH, z], [L, CH, z], [L, 0, z], [-HW, 0, z], [1, 1, 1], { uv: [0, 0, .53, 1] });
    W.quad([R, CH, z], [HW, CH, z], [HW, 0, z], [R, 0, z], [1, 1, 1], { uv: [0, 0, .53, 1] });
    W.quad([L, CH, z], [R, CH, z], [R, T, z], [L, T, z], [1, 1, 1], { uv: [0, 0, .5, .28] });
    Pm.rbox(L - .07, L, 0, T + .07, z - .04, z + .02, C.frame, .01, { s: .45 }); Pm.rbox(R, R + .07, 0, T + .07, z - .04, z + .02, C.frame, .01, { s: .45 });
    Pm.rbox(L - .07, R + .07, T, T + .07, z - .04, z + .02, C.frame, .01, { s: .45 });
    Pm.rbox(-.36, .36, 2.32, 2.64, z - .06, z, hex('#0d3a1e'), .01);
    Pm.rbox(-.33, .33, 2.35, 2.61, z - .062, z - .058, hex('#5cff96'), .004, { e: true });
    const FONT = { E: ['111', '100', '110', '100', '111'], X: ['101', '101', '010', '101', '101'], I: ['111', '010', '010', '010', '111'], T: ['111', '010', '010', '010', '010'] };
    'EXIT'.split('').forEach((ch, i) => FONT[ch].forEach((row, r) => [...row].forEach((on, q) => {     // 글자 EXIT — 칸마다 작은 판
      if (on === '1') { const x0 = -.25 + i * .135 + q * .03, y0 = 2.55 - r * .03; Pm.rbox(x0, x0 + .03, y0 - .03, y0, z - .064, z - .062, hex('#0d3a1e'), .001, { e: true }); }
    })));
  }
  const z = RUN_LEN;
  W.quad([-HW, CH, z], [-1, CH, z], [-1, 0, z], [-HW, 0, z], [1, 1, 1], { uv: [0, 0, .4, 1] });
  W.quad([1, CH, z], [HW, CH, z], [HW, 0, z], [1, 0, z], [1, 1, 1], { uv: [0, 0, .4, 1] });
  W.quad([-1, CH, z], [1, CH, z], [1, 2.4, z], [-1, 2.4, z], [1, 1, 1], { uv: [0, 0, .8, .2] });
  Pm.quad([-1, 2.4, z + .02], [1, 2.4, z + .02], [1, 0, z + .02], [-1, 0, z + .02], [3.2, 3.15, 2.9], { e: true });
}

/* 이야기의 흔적 — 바닥을 따라오는 전극선 넷, 링거대, 심전도, 빈 침대(묶는 끈) */
function buildStory(Pm) {
  const cols = ['#2f6fb5', '#c2352c', '#e3b23c', '#e9e3d5'].map(hex);
  for (let w = 0; w < 4; w++) {
    const pts = [];
    for (let z = 146 + w * 3; z < RUN_LEN - 3; z += .5) pts.push([-1.55 + w * .045 + Math.sin(z * .21 + w) * .05 + Math.sin(z * .05) * .06, .008, z]);
    Pm.tube(pts, .0075, cols[w], 5, { s: .35 });
  }
  // 링거대 (오른쪽 벽) — 붉은 백, 바닥으로 늘어진 줄
  const ix = HW - .35, iz = 228;
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; Pm.cyl([ix, .08, iz], [ix + Math.cos(a) * .25, .03, iz + Math.sin(a) * .25], .012, .01, C.chrome, 6, false, { s: .8 }); }
  Pm.cyl([ix, .05, iz], [ix, 2.1, iz], .014, .012, C.chrome, 10, false, { s: .9 });
  Pm.ellipsoid([ix - .12, 1.86, iz], [.03, 0, 0], [0, .15, 0], [0, 0, .08], hex('#a8232a'), 14, 10, { s: .6 });
  Pm.tube([[ix - .12, 1.7, iz], [ix - .2, 1.0, iz - .1], [ix - .3, .02, iz - .4], [-1.5, .01, iz - 2]], .004, hex('#c43a3e'), 5);
  // 심전도 모니터 (왼쪽 벽, 기둥) — 화면엔 빛나는 선
  const mz = 480;
  Pm.cyl([-HW + .3, 0, mz], [-HW + .3, 1.3, mz], .02, .02, C.steel, 8, false, { s: .6 });
  Pm.rbox(-HW + .1, -HW + .5, 1.3, 1.62, mz - .2, mz + .2, hex('#262d37'), .02, { s: .4 });
  const sx = -HW + .502;
  Pm.quad([sx, 1.58, mz - .17], [sx, 1.58, mz + .17], [sx, 1.34, mz + .17], [sx, 1.34, mz - .17], hex('#04120a'), { e: true });
  for (let i = 0; i < 12; i++) { const za = mz - .16 + i * .028, y = 1.46 + (i === 5 ? .07 : i === 6 ? -.04 : 0);
    Pm.rbox(sx + .001, sx + .003, y - .004, y + .004, za, za + .028, hex('#46ff78'), .001, { e: true }); }
  // 빈 침대 (왼쪽 벽) — 흐트러진 시트, 손목 · 발목을 묶던 끈
  const bz = 505, bx0 = -HW + .05, bx1 = -HW + .95;
  for (const x of [bx0 + .08, bx1 - .08]) for (const z of [bz + .1, bz + 2.0]) Pm.cyl([x, 0, z], [x, .45, z], .02, .02, C.steel, 6, false, { s: .6 });
  Pm.rbox(bx0, bx1, .45, .55, bz, bz + 2.1, C.steel, .02, { s: .5 });
  Pm.rbox(bx0 + .02, bx1 - .02, .55, .72, bz + .02, bz + 2.08, hex('#d9dee6'), .05);
  Pm.obox([(bx0 + bx1) / 2 + .05, .74, bz + 1.4], [.42, .02, .05], [0, .03, 0], [-.04, 0, .55], C.sheet);
  Pm.ellipsoid([(bx0 + bx1) / 2, .78, bz + .25], [.26, 0, 0], [0, .06, 0], [0, 0, .14], hex('#eef1f5'), 12, 6);
  Pm.rbox(bx0 - .05, bx0, .45, 1.3, bz, bz + .06, C.steel, .01, { s: .6 });
  for (const z of [bz + .75, bz + 1.85]) for (const x of [bx0 + .2, bx1 - .2]) {
    Pm.rbox(x - .03, x + .03, .55, .74, z - .02, z + .05, C.black, .006, { s: .3 });
    Pm.torus([x, .78, z + .02], [1, 0, 0], .05, .012, hex('#1a1d22'), 12, 6, { s: .4 });
  }
}

/* ═════════════ 장애물 ═════════════════════════════════════ */
function buildObstacles(obs) {
  const m = new Mesh();
  for (const o of obs) {
    const spans = o.lanes.length === 3 ? [[-HW, HW]] : o.lanes.map(l => [l * LANE - .55, l * LANE + .55]);
    const z0 = o.z, z1 = o.z + o.d;
    for (const [x0, x1] of spans) {
      if (o.type === 'barrier') {                                       // 접이식 차단대 — 황·흑 사선 판, A 자 다리
        const n = 10, w = (x1 - x0) / n;
        for (let i = 0; i < n; i++) m.rbox(x0 + i * w, x0 + (i + 1) * w, .58, .84, z0 + .08, z0 + .14, i & 1 ? C.black : C.yel, .006, { s: .35 });
        for (const lx of [x0 + .12, x1 - .12]) for (const dz of [-1, 1]) m.obox([lx, .4, z0 + .11 + dz * .1], [.025, 0, 0], [0, .42, -dz * .1], [0, 0, .02], hex('#3a3f48'), { s: .3 });
      } else if (o.type === 'gurney') {                                 // 들것 — 시트 아래 누운 모양
        for (const lx of [x0 + .1, x1 - .1]) for (const z of [z0 + .15, z1 - .15]) { m.cyl([lx, .06, z], [lx, .42, z], .016, .016, C.steel, 6, false, { s: .7 }); m.sphere([lx, .04, z], .04, C.black, 8); }
        m.rbox(x0 + .02, x1 - .02, .42, .5, z0, z1, C.steel, .02, { s: .6 });
        m.rbox(x0 + .05, x1 - .05, .5, .62, z0 + .03, z1 - .03, hex('#cfd5d8'), .04);
        m.ellipsoid([(x0 + x1) / 2, .66, z0 + .25], [.15, 0, 0], [0, .09, 0], [0, 0, .13], C.sheet, 12, 8);
        m.ellipsoid([(x0 + x1) / 2, .68, z0 + .85], [.24, 0, 0], [0, .1, 0], [0, 0, .5], C.sheet, 14, 8);
        m.ellipsoid([(x0 + x1) / 2, .66, z1 - .35], [.2, 0, 0], [0, .08, 0], [0, 0, .32], C.sheet, 12, 8);
        m.obox([(x0 + x1) / 2, .6, (z0 + z1) / 2], [(x1 - x0) / 2 - .02, 0, 0], [0, .1, 0], [0, 0, (z1 - z0) / 2 - .04], C.sheet);
      } else if (o.type === 'pipe') {                                   // 머리 높이 배관 — 보온재 · 이음 고리 · 밸브 · 매단 줄
        const yc = (o.y0 + o.y1) / 2, r = (o.y1 - o.y0) / 2, zc = (z0 + z1) / 2;
        m.cyl([x0, yc, zc], [x1, yc, zc], r, r, hex('#8a949c'), 18, true, { s: .45 });
        for (let x = x0 + .3; x < x1 - .1; x += .9) m.torus([x, yc, zc], [1, 0, 0], r + .005, .016, hex('#5b6674'), 18, 6, { s: .6 });
        for (const lx of [x0 + .35, x1 - .35]) { m.cyl([lx, yc + r, zc], [lx, CH, zc], .01, .01, C.steel, 6); m.torus([lx, yc, zc], [1, 0, 0], r + .02, .008, C.steel, 16, 4); }
        m.cyl([x0 + .8, yc + r, zc], [x0 + .8, yc + r + .12, zc], .02, .02, C.steel, 8); m.torus([x0 + .8, yc + r + .13, zc], [0, 1, 0], .07, .01, C.red, 16, 6, { s: .4 });
      } else if (o.type === 'shutter') {                                // 반쯤 내려온 셔터 — 골판 · 아래 경고 막대 · 옆 레일 · 위 말림통
        for (let y = o.y0 + .08; y < CH - .25; y += .07) m.rbox(x0, x1, y, y + .065, z0 + (Math.round(y * 14) & 1 ? 0 : .012), z0 + .04, hex('#8a8e8a'), .01, { s: .35 });
        m.rbox(x0, x1, o.y0, o.y0 + .08, z0 - .005, z0 + .05, C.yel, .01, { s: .4 });
        for (let i = 0; i < 8; i += 2) m.rbox(x0 + i * (x1 - x0) / 8, x0 + (i + 1) * (x1 - x0) / 8, o.y0 + .005, o.y0 + .075, z0 - .007, z0, C.black, .002);
        m.rbox(x0, x1, CH - .32, CH, z0 - .1, z0 + .14, hex('#6c7682'), .03, { s: .3 });
      } else if (o.type === 'cart') {                                   // 철망 선반 카트 — 기둥 넷 · 선반 다섯 · 실린 것들 · 바퀴
        const za = z0 + .05, zb = z1 - .05;
        for (const lx of [x0 + .04, x1 - .04]) for (const z of [za, zb]) { m.cyl([lx, .08, z], [lx, o.y1, z], .014, .014, C.chrome, 8, false, { s: .85 }); m.sphere([lx, .045, z], .045, C.black, 8, { s: .3 }); }
        for (const y of [.15, .58, 1.04, 1.5, 1.92]) {
          m.rbox(x0 + .02, x1 - .02, y, y + .02, za, zb, hex('#aab4be'), .006, { s: .7 });
          for (let k = 0; k < 7; k++) m.cyl([x0 + .03, y + .024, za + k * (zb - za) / 6], [x1 - .03, y + .024, za + k * (zb - za) / 6], .003, .003, C.chrome, 4);
          if (y < 1.9) { let px = x0 + .06; while (px < x1 - .2) { const w = .14 + rnd() * .16, h = .1 + rnd() * .22;
            if (rnd() < .6) m.rbox(px, px + w, y + .02, y + .02 + h, za + .08, zb - .1 - rnd() * .2, [hex('#c3b79f'), hex('#e9edef'), hex('#5b6674'), hex('#8a7b62')][(rnd() * 4) | 0], .01);
            else m.lathe([px + .05, y + .02, (za + zb) / 2], [0, 1, 0], [[0, 0], [.045, 0], [.045, h * .8], [.02, h], [0, h]], [hex('#a8232a'), hex('#cfd6dc'), hex('#2f6fb5')][(rnd() * 3) | 0], 10, { s: .7 });
            px += w + .04; } }
        }
      }
    }
  }
  return m;
}

/* ═════════════ 렌더러 ═════════════════════════════════════ */
class Corridor3D {
  constructor(w = 960, h = 540) {
    this.w = w; this.h = h; this.k = 1;
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    const gl = this.canvas.getContext('webgl', { antialias: true, alpha: false }) || this.canvas.getContext('experimental-webgl');
    this.ok = !!gl;
    if (!gl) return;
    this.gl = gl;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr;
    this.at = ['aP', 'aN', 'aC', 'aUV', 'aE', 'aSX'].map(n => gl.getAttribLocation(pr, n));
    this.un = {};
    ['uVP', 'uEye', 'uL', 'uLC', 'uNL', 'uFogA', 'uFogB', 'uAmbA', 'uAmbB', 'uLights', 'uRed', 'uFlick', 'uTexOn', 'uTa', 'uTb'].forEach(n => this.un[n] = gl.getUniformLocation(pr, n));
    // 무늬 텍스처
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    this.tex = {};
    for (const k in TEX) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex(TEX[k]));
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      this.tex[k] = t;
    }
    // 복도 덩어리
    RS = 11;
    this.chunks = [];
    for (let c0 = Z0; c0 < RUN_LEN; c0 += CHUNK) {
      const { F, W, Ce, Pm } = buildChunk(c0);
      this.chunks.push({ z0: c0, z1: c0 + CHUNK, F: this.up(F), W: this.up(W), Ce: this.up(Ce), Pm: this.up(Pm) });
    }
    const story = new Mesh(); buildStory(story); this.story = this.up(story);
    const eW = new Mesh(), eP = new Mesh(); buildEnds(eW, eP); this.endW = this.up(eW); this.endP = this.up(eP);   // 비상구 · 바깥 문 — 늘 그림
    this.dynBuf = gl.createBuffer();
    this.obsRef = null; this.obs = null;
    this.fig = new Figure3D(w, h, { canvas: this.canvas, gl });
    // 형광등 자리
    this.lamps = [];
    for (let idx = Math.ceil(Z0 / SEG); idx * SEG < RUN_LEN; idx++) if (lightAt(idx)) this.lamps.push({ idx, z: idx * SEG + 1, broken: brokenAt(idx) });
  }
  /* 해상도 배율 — 느린 기기에선 낮춰 그리고 화면에 늘려 찍습니다 (투영은 그대로) */
  setScale(k) {
    k = Math.max(.4, Math.min(1, k)); if (Math.abs(k - this.k) < .01) return;
    this.k = k; this.canvas.width = Math.round(this.w * k); this.canvas.height = Math.round(this.h * k);
    this.fig.w = this.canvas.width; this.fig.h = this.canvas.height;
  }
  up(m) { const gl = this.gl, b = gl.createBuffer(), arr = mapMesh(m.v); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return { b, n: arr.length / 14 }; }
  draw(p) {
    if (!p || !p.n) return;
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, p.b);
    const sz = [3, 3, 3, 2, 1, 2]; let off = 0;
    this.at.forEach((a, i) => { if (a >= 0) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, sz[i], gl.FLOAT, false, 56, off * 4); } off += sz[i]; });
    gl.drawArrays(gl.TRIANGLES, 0, p.n);
  }
  bindTex(a, b) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a ? this.tex[a] : null);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b ? this.tex[b] : null);
    gl.uniform1f(this.un.uTexOn, a ? 1 : 0);
  }
  /* 한 장 — v : { z, x, back, camX, camY, cx, cy, roll, shx, shy, f, alarm, lights, flick, frame, doorOpen, obs, pickup, figs:[{fig, env}], shadows:[[x, z, r]] } */
  render(v) {
    const gl = this.gl, un = this.un;
    if (v.obs !== this.obsRef) { this.obsRef = v.obs; RS = 99; this.obs = (v.obs || []).map(o => ({ z: o.z, d: o.d, p: this.up(buildObstacles([o])) })); }
    const K = this.k, VW = this.canvas.width, VH = this.canvas.height;
    gl.viewport(0, 0, VW, VH);
    const fogA = [5 / 255, 7 / 255, 11 / 255], fogB = [26 / 255, 22 / 255, 9 / 255], tcam = theme(v.z), fogC = mixC(fogA, fogB, tcam);
    gl.clearColor(fogC[0], fogC[1], fogC[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(this.pr);
    const cam = { f: v.f * K, px: v.cx * K, py: v.cy * K, roll: v.roll, shx: v.shx * K, shy: v.shy * K };
    const P = camProj(cam, VW, VH, 52);
    // 카메라 — 길 위의 그 자리, 그 자리의 앞(뒤돌아보면 반대)을 봄
    const Cw = pathPos(v.z, v.x), h0 = headingAt(v.z), h = v.back ? [-h0[0], -h0[1]] : h0, r = right2(h);
    const view = [r[0], 0, -h[0], 0, 0, 1, 0, 0, r[1], 0, -h[1], 0, -(Cw[0] * r[0] + Cw[1] * r[1]), -v.camY, Cw[0] * h[0] + Cw[1] * h[1], 1];
    const toCam = (X, Y, Z) => { const dx = X - Cw[0], dz = Z - Cw[1]; return [dx * r[0] + dz * r[1], Y - v.camY, -(dx * h[0] + dz * h[1])]; };
    gl.uniformMatrix4fv(un.uVP, false, new Float32Array(M4.mul(P, view)));
    const eye = [Cw[0], v.camY, Cw[1]];
    gl.uniform3fv(un.uEye, new Float32Array(eye));
    // 형광등 — 바라보는 쪽 가까운 것부터 열둘
    const dir = v.back ? -1 : 1, red = v.alarm * (.5 + .5 * Math.sin(v.frame * .16));
    const lamps = this.lamps.map(l => ({ l, d: (l.z - v.z) * dir })).filter(o => o.d > -6 && o.d < 46).sort((a, b) => Math.abs(a.d) - Math.abs(b.d)).slice(0, 8);
    const Ls = [], LC = [], panels = [];
    for (const { l } of lamps) {
      const on = !l.broken || Math.sin(v.frame * .9 + l.idx) > .3;
      const tb = theme(l.z), base = mixC([227, 236, 248], [255, 250, 212], tb).map(c => c / 255);
      const k = (on ? 1 : .05) * (v.flick > 0 ? .3 : 1) * (v.lights * .8 + .2);
      const lc = mixC(base, [1, .27, .23], red * .38 * (1 - tb));
      const lp = pathPos(l.z, 0); Ls.push(lp[0], CH - .25, lp[1]); LC.push(...lc.map(c => c * k * 1.25));
      panels.push({ z: l.z, c: lc.map(c => c * (on ? 1.15 : .12) * (v.flick > 0 ? .4 : 1)) });
    }
    gl.uniform3fv(un.uL, new Float32Array(Ls.length ? Ls : [0, 0, 0])); gl.uniform3fv(un.uLC, new Float32Array(LC.length ? LC : [0, 0, 0]));
    gl.uniform1i(un.uNL, lamps.length);
    gl.uniform3fv(un.uFogA, new Float32Array(fogA)); gl.uniform3fv(un.uFogB, new Float32Array(fogB));
    gl.uniform3fv(un.uAmbA, new Float32Array([.11, .12, .14])); gl.uniform3fv(un.uAmbB, new Float32Array([.14, .12, .07]));
    gl.uniform1f(un.uLights, v.lights); gl.uniform1f(un.uRed, red * .16); gl.uniform1f(un.uFlick, v.flick > 0 ? 1 : 0);
    gl.uniform1i(un.uTa, 0); gl.uniform1i(un.uTb, 1);
    // 복도 — 보이는 덩어리만
    const lo = v.back ? v.z - 50 : v.z - 4, hi = v.back ? v.z + 4 : v.z + 50;   // 안개가 44m 에서 다 덮음
    const vis = this.chunks.filter(c => !(c.z1 < lo || c.z0 > hi));
    if (v.back) vis.reverse();
    for (const c of vis) {
      this.bindTex('floorLab', 'floorBack'); this.draw(c.F);
      this.bindTex('wallLab', 'wallBack'); this.draw(c.W);
      this.bindTex('ceilLab', 'ceilBack'); this.draw(c.Ce);
      this.bindTex(null, null); this.draw(c.Pm);
    }
    this.bindTex('wallLab', 'wallBack'); this.draw(this.endW);
    this.bindTex(null, null);
    this.draw(this.endP);
    this.draw(this.story);
    for (const o of this.obs) if (o.z + o.d > lo && o.z < hi) this.draw(o.p);
    // 매 프레임 바뀌는 것 — 형광등 판 · 비상구 문짝 · 바닥의 권총과 그 빛 · 사람 발밑 그늘
    const d = new Mesh();
    for (const p of panels) d.quad([-.55, CH - .036, p.z - .3], [.55, CH - .036, p.z - .3], [.55, CH - .036, p.z + .3], [-.55, CH - .036, p.z + .3], p.c, { e: true });
    const L = -.62, R = .62, T = 2.15, lx = L + (v.doorOpen || 0) * (R - L);
    if (lx < R - .01) {
      d.rbox(lx, R, 0, T, .005, .045, C.leaf, .01, { s: .3 });
      const w0 = lx + .18, w1 = Math.min(R - .05, w0 + .3);
      if (w1 > w0) d.quad([w0, 1.85, -.001], [w1, 1.85, -.001], [w1, 1.35, -.001], [w0, 1.35, -.001], C.glass, { s: .95 });
      d.rbox(lx + .05, Math.min(R, lx + .9), .96, 1.02, -.03, .005, C.chrome, .01, { s: .9 });
      for (let i = 0; i < 8; i++) { const a = lx + i * (R - lx) / 8; d.rbox(a, a + (R - lx) / 8, .04, .16, -.002, .005, i & 1 ? C.black : C.yel, .002); }
    }
    if (v.pickup) {
      const gl2 = .5 + .5 * Math.sin(v.frame * .2);
      d.rbox(-.09, .09, .005, .035, GUN_Z - .05, GUN_Z + .05, hex('#15161a'), .008, { s: .8 });
      d.rbox(-.02, .02, .005, .03, GUN_Z + .03, GUN_Z + .11, hex('#15161a'), .006, { s: .8 });
      const gc = [1 * (.35 + gl2 * .4), .9 * (.35 + gl2 * .4), .62 * (.35 + gl2 * .4)];
      d.quad([-.32, .002, GUN_Z - .3], [.32, .002, GUN_Z - .3], [.32, .002, GUN_Z + .3], [-.32, .002, GUN_Z + .3], mixC(fogC, gc, .9), { e: true });
    }
    for (const [sx, sz, r] of v.shadows || []) {
      const n = 18, c = [.02, .02, .025];
      for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
        d.tri([sx, .003, sz], [sx + Math.cos(a0) * r, .003, sz + Math.sin(a0) * r * .8], [sx + Math.cos(a1) * r, .003, sz + Math.sin(a1) * r * .8], [0, 1, 0], c, 0); }
    }
    if (d.v.length) { const arr = mapMesh(d.v); gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW); this.draw({ b: this.dynBuf, n: arr.length / 14 }); }
    // 사람 — 같은 깊이 버퍼에, 가까운 형광등을 카메라 기준으로 옮겨 비춤
    const sxIdx = this.at[5]; if (sxIdx >= 0) gl.disableVertexAttribArray(sxIdx);
    for (const q of v.figs || []) {
      const env = q.env, f = q.fig;
      if (f.cs != null) {                                             // 길 위의 자리 → 카메라 기준
        const wp = pathPos(f.cs, f.cx), cp = toCam(wp[0], 0, wp[1]);
        f.x = cp[0]; f.y = cp[1]; f.z = -cp[2]; f.yaw = Math.atan2(-f.x, f.z) * (f.yawK == null ? 1 : f.yawK);
        const ceil = CH - v.camY - .05, L = env.lights;
        env.lights = [[[f.x * .5, ceil, -f.z + 1.2], L[0][1]], [[f.x, ceil, -f.z - 1.5], L[1][1]], L[2], [[f.x, ceil - .2, -f.z + .5], L[3][1]]];
      }
      if (f.z < .05) continue;
      const near = lamps.map((o, i) => ({ i, d: Math.abs(o.l.z - (f.cs != null ? f.cs : v.z)) })).sort((a, b) => a.d - b.d).slice(0, 1);
      const fl = near.map(({ i }) => [toCam(Ls[i * 3], Ls[i * 3 + 1], Ls[i * 3 + 2]), [LC[i * 3] * 1.1, LC[i * 3 + 1] * 1.1, LC[i * 3 + 2] * 1.1]]);
      env.lights = env.lights.slice(0, 4).concat(fl);                  // 인물 둘레의 빛 + 가장 가까운 실제 형광등
      env.cam = cam;
      this.fig.render(q.fig, env, true);
      gl.useProgram(this.pr);
    }
    return this.canvas;
  }
}

window.Corridor3D = Corridor3D;
window.Corr3DPath = { pathPos, headingAt, CORNERS, JL, HW };
})();
