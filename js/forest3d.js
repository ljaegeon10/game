'use strict';
/* ═══════════════════════════════════════════════════════════════
   forest3d.js — 1인칭 숲 (WebGL)

   오프닝에서 눈을 뜬 뒤의 숲. 아직 「캐릭터」가 아니라 제 눈으로 보는 세계입니다 —
   해 질 녘 숲길을 걸어 우물까지 가고, 우물을 들여다보다 떨어지는 동안 비로소 도트 캐릭터가 됩니다 (game.js 의 낙하 장면).
   타임어택은 이 장면 없이 예전 그대로 탑뷰 숲에서 시작합니다.

     · 저녁 해가 우물 너머에 낮게 걸려 있어, 숲길을 따라 해 쪽으로 걸어감 (나무 · 우물이 역광으로 보임)
     · 흙길 · 나무 90여 그루(잎은 바람에 흔들림) · 덤불 · 풀 · 돌 · 빛나는 버섯 · 반딧불 · 장승 둘
     · 우물 — 돌로 쌓은 테 · 기둥과 지붕 · 오방색 띠 · 두레박. 가까이 가면 「우물 들여다보기」
     · 길가의 늙은 나무 밑동에 낀 서류 · 숲 가장자리 나무 사이의 좁은 틈 (탑뷰 숲에 있던 것 그대로)

   조작 : WASD 걷기(Shift 빠르게) · 마우스 둘러보기(화면을 누르면 고정) · E / SPACE / 클릭 조사
          손가락 — 왼쪽을 끌어 걷기 · 오른쪽을 끌어 둘러보기 · 톡 하면 조사
   대사 · 조사 안내 · 서류 · 일시정지는 게임(game.js)의 것을 그대로 씀 — 캔버스는 #stage 안에 깔림.
   쓰는 곳 : game.js beginForest3D()
   ═══════════════════════════════════════════════════════════════ */
(() => {
const L3 = window.Lab3D;
if (!L3) return;
const { Mesh, hex } = L3;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = k => (k = clamp(k, 0, 1)) * k * (3 - 2 * k);
function perspective(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
function lookAt(e, c, up) { const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]; }
function mmul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
const DBG = window.F3D_DEBUG || {};                    // 시험용 — { noaa: 계단 다듬기 끔, q: 처음 해상도 배율 }
let RS = 20450501; const rnd = () => (RS = (RS * 16807) % 2147483647) / 2147483647;

/* ── 자리 (m) — x 동쪽(해 지는 쪽) · y 위 · z 남쪽 ── */
const SPAWN = [0, 0], WELL = [17.4, -3.0], OLD = [6.2, 4.4], GAP = [11.5, -12.2];
const PATH = [[-3, .3], [2, .2], [6, 1.1], [10, -.3], [14, -2.1], [16.2, -2.8]];           // 흙길 — 눈 뜬 자리에서 우물까지
const TOTEM = [[9.2, 1.7], [10.6, -2.6]];
const SUN = norm([1, .2, -.22]);                                                           // 해가 있는 쪽 (우물 너머 서쪽 하늘 낮게)
const BOUND = { x0: -7.5, x1: 22.5, z0: -11.2, z1: 9.5 };
const distPath = (x, z) => { let m = 1e9; for (let i = 1; i < PATH.length; i++) { const [ax, az] = PATH[i - 1], [bx, bz] = PATH[i], dx = bx - ax, dz = bz - az;
  const u = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); m = Math.min(m, Math.hypot(x - ax - dx * u, z - az - dz * u)); } return m; };

/* ── 셰이더 — 낮은 해 한 줄기 + 하늘빛/땅빛 + 거리 안개(해 쪽은 따뜻하게) · 잎과 풀은 바람에 흔들림 ──
   꼭짓점의 마지막 값(aE) : 0 무광(땅 · 줄기 · 돌) · 1 스스로 빛남 · 3 잎(흔들림 · 역광이 비침) · 4 풀(흔들림) · 6 하늘 · 7 새까만 어둠 */
const VS = `
invariant gl_Position;
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute vec2 aUV; attribute float aE;
uniform mat4 uVP; uniform vec3 uOff; uniform float uTime;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vE;
void main(){ vec3 p=aP+uOff;
  if(aE>2.5 && aE<3.5){ float k=clamp((aP.y-1.6)*0.25,0.0,1.0); p.x+=sin(uTime*1.1+aP.x*0.6+aP.z*0.8)*0.07*k; p.z+=cos(uTime*0.9+aP.x*0.7-aP.z*0.5)*0.05*k; p.y+=sin(uTime*1.7+aP.x*1.3)*0.02*k; }
  else if(aE>3.5 && aE<4.5){ float k=aUV.x; p.x+=sin(uTime*1.8+aP.x*2.1+aP.z*1.7)*0.06*k; p.z+=cos(uTime*1.5+aP.z*2.3)*0.04*k; }
  vP=p; vN=aN; vC=aC; vE=aE; gl_Position=uVP*vec4(p,1.0); }`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vE;
uniform vec3 uEye; uniform vec3 uSun; uniform vec3 uWell; uniform float uGlow; uniform float uTime; uniform float uFade; uniform vec2 uRes; uniform float uDim;
float h3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 sky(vec3 d){
  float h=clamp(d.y,-0.1,1.0), s=max(dot(normalize(vec3(d.x,0.0,d.z)),normalize(vec3(uSun.x,0.0,uSun.z))),0.0);
  vec3 zen=vec3(0.035,0.05,0.13), mid=vec3(0.22,0.13,0.25), hor=mix(vec3(0.34,0.2,0.26),vec3(1.05,0.46,0.16),pow(s,2.2));
  vec3 c=mix(hor*(0.86+0.14*smoothstep(0.0,0.07,h)),mid,smoothstep(0.0,0.26,h)); c=mix(c,zen,smoothstep(0.16,0.75,h));
  float cl=vn(vec3(d.x*2.6/(h+0.25),h*14.0,d.z*2.6/(h+0.25)+uTime*0.01)); cl=smoothstep(0.52,0.78,cl)*smoothstep(0.02,0.2,h)*(1.0-smoothstep(0.35,0.7,h));
  c=mix(c, mix(vec3(0.3,0.16,0.24),vec3(1.1,0.5,0.28),pow(s,1.5)), cl*0.55);                       // 노을 받은 구름
  float sd=max(dot(d,uSun),0.0); c+=vec3(1.3,0.62,0.22)*(pow(sd,90.0)*1.4+pow(sd,9.0)*0.3);          // 해 · 해무리
  float st=step(0.9988,h3(floor(d*520.0)))*smoothstep(0.3,0.7,h); c+=vec3(0.6,0.65,0.8)*st*(0.6+0.4*sin(uTime*2.0+d.x*40.0));   // 일찍 뜬 별
  return c; }
vec3 haze(vec3 d){
  float s=max(dot(normalize(vec3(d.x,0.001,d.z)),normalize(vec3(uSun.x,0.0,uSun.z))),0.0);
  return mix(vec3(0.34,0.2,0.26),vec3(1.05,0.46,0.16),pow(s,2.2))*0.86+vec3(1.0,0.5,0.18)*pow(max(dot(d,uSun),0.0),8.0)*0.22; }
void main(){
  vec3 V=uEye-vP; float d=length(V); V/=d; vec3 col;
  if(vE>6.5){ col=mix(vec3(0.004,0.004,0.006), haze(-V), (1.0-exp(-d*0.05))*step(0.9,length(vP.xz-uWell.xz))); }                                      // 가까이선 새까맣고, 멀리선 안개에 묻혀 안 보임
  else if(vE>5.5){ col=sky(-V); }
  else if(vE>0.5 && vE<1.5){ col=vC; col=mix(col, haze(-V), (1.0-exp(-d*0.03))*0.6); }
  else {
    vec3 n=normalize(vN); if(dot(n,V)<0.0) n=-n;
    vec3 c=vC; float leaf=step(2.5,vE);
    float g=0.62+0.55*vn(vP*1.6);
    if(d<16.0){                                                                                                  // 잔 무늬는 가까운 데만 (멀면 안개에 묻힘)
      if(leaf>0.5) g*=0.82+0.36*vn(vP*6.5);
      else if(n.y>0.9) g*=(0.78+0.44*vn(vec3(vP.xz*0.4,3.0)))*(0.86+0.28*vn(vec3(vP.xz*11.0,1.0)));              // 땅 — 큰 얼룩 · 잔 알갱이
      else g*=0.72+0.5*vn(vec3(vP.x*9.0,vP.y*1.3,vP.z*9.0));                                                     // 줄기 · 돌 — 세로 결
    }
    c*=g;
    float sn=dot(n,uSun);
    float lit=mix(max(sn,0.0), max((sn+0.55)/1.55,0.0), leaf);
    vec3 skyc=vec3(0.085,0.1,0.2), gnd=vec3(0.05,0.045,0.04), sunc=vec3(1.55,0.72,0.3);
    vec3 acc=mix(gnd,skyc,0.5+0.5*n.y)+sunc*lit*0.8;
    acc+=sunc*pow(max(dot(-V,uSun),0.0),4.0)*0.55*leaf;                                                          // 잎 사이로 비치는 역광
    vec3 Lw=uWell-vP; float dw=length(Lw), inw=smoothstep(0.86,0.78,length(vP.xz-uWell.xz));                        // 우물 속에서 새는 빛 — 속 벽을 주로 밝히고 밖으로는 조금만
    acc+=vec3(0.2,0.85,0.72)*uGlow*(0.3+inw*1.5)/(1.0+dw*dw*0.55)*(0.5+0.5*dot(n,Lw/dw));
    acc*=1.0-inw*smoothstep(-1.6,-5.0,vP.y);                                                                      // 깊은 데는 캄캄
    col=c*acc;
    col+=sunc*pow(max(1.0-dot(n,V),0.0),3.0)*max(dot(-V,uSun),0.0)*0.12*(1.0-leaf);                               // 해를 등진 윤곽에 걸리는 빛
    float f=(1.0-exp(-d*0.05))*(1.0-inw); col=mix(col, haze(-V), f);                                                         // 거리 안개 — 그쪽 하늘빛으로
  }
  col*=uDim;
  vec2 q=gl_FragCoord.xy/uRes-0.5; col*=1.0-dot(q,q)*1.15;
  col=pow(col,vec3(0.86));
  col+=(h3(vec3(gl_FragCoord.xy,uTime*60.0))-0.5)*0.03;
  gl_FragColor=vec4(col*uFade,1.0);
}`;

/* 깊이만 먼저 그리는 셰이더 — 나무가 겹겹이라 같은 자리를 열 번 넘게 칠하게 되므로, 맨 앞 것만 한 번 칠하도록 */
const FS_Z = 'precision mediump float; void main(){ gl_FragColor=vec4(0.0); }';

/* ── 숲 짓기 ── */
const C = { grass: hex('#1f3320'), grassD: hex('#16261a'), dirt: hex('#4a3a2a'), dirtD: hex('#34281e'), bark: hex('#3a2c22'), barkD: hex('#261c16'),
  leaf: [hex('#1f3a26'), hex('#2a4a2c'), hex('#17301f'), hex('#33522a'), hex('#243e30')], bush: [hex('#22402a'), hex('#1a3322'), hex('#2e4a26')],
  stone: hex('#6e6a66'), stoneD: hex('#4c4a4c'), stoneL: hex('#85807a'), wood: hex('#5a4026'), woodD: hex('#3a2818'), roof: hex('#2a2018'), rope: hex('#8a7a5a'),
  ob: [hex('#2f6fb5'), hex('#f1ece0'), hex('#c2352c'), hex('#15131a'), hex('#e3b23c')], paper: hex('#d9d2bf'), glow: hex('#7de3c8'), blade: [hex('#2c4a2a'), hex('#3a5a2e'), hex('#22402a')] };
let BUILT = null;
function buildForest() {
  if (BUILT) return BUILT;
  RS = 20450501;
  const m = new Mesh(), solid = [];                                    // solid : [x, z, 반지름] — 걸리는 것
  // 땅 — 넓은 바닥 한 장 + 흙길 (길은 살짝 위에, 가장자리를 들쭉날쭉하게)
  { const [hx, hz] = WELL, h = .82;                                 // 우물 자리만 네모나게 비움 — 모서리는 돌 테 밑에 가려짐
    m.quad([-70, 0, -70], [hx - h, 0, -70], [hx - h, 0, 70], [-70, 0, 70], C.grass); m.quad([hx + h, 0, -70], [70, 0, -70], [70, 0, 70], [hx + h, 0, 70], C.grass);
    m.quad([hx - h, 0, -70], [hx + h, 0, -70], [hx + h, 0, hz - h], [hx - h, 0, hz - h], C.grass); m.quad([hx - h, 0, hz + h], [hx + h, 0, hz + h], [hx + h, 0, 70], [hx - h, 0, 70], C.grass); }
  for (let i = 1; i < PATH.length; i++) { const [ax, az] = PATH[i - 1], [bx, bz] = PATH[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / .8);
    for (let k = 0; k < n; k++) { const u0 = k / n, u1 = (k + 1) / n, x0 = lerp(ax, bx, u0), z0 = lerp(az, bz, u0), x1 = lerp(ax, bx, u1), z1 = lerp(az, bz, u1);
      const d = norm([x1 - x0, 0, z1 - z0]), s = [-d[2], 0, d[0]], w0 = .7 + rnd() * .35, w1 = .7 + rnd() * .35;
      m.quad([x0 - s[0] * w0, .012, z0 - s[2] * w0], [x1 - s[0] * w1, .012, z1 - s[2] * w1], [x1 + s[0] * w1, .012, z1 + s[2] * w1], [x0 + s[0] * w0, .012, z0 + s[2] * w0], rnd() < .3 ? C.dirtD : C.dirt); } }
  for (let i = 0; i < 16; i++) { const a0 = i / 16 * 6.2832, a1 = (i + 1) / 16 * 6.2832, P = (a, r) => [WELL[0] + Math.cos(a) * r, .014, WELL[1] + Math.sin(a) * r];
    m.quad(P(a0, 1.16), P(a1, 1.16), P(a1, 2.6), P(a0, 2.6), i % 3 ? C.dirt : C.dirtD); }                          // 우물 둘레의 다져진 흙 (고리 — 속은 비움)
  for (let i = 0; i < 46; i++) { const x = -12 + rnd() * 40, z = -16 + rnd() * 30, r = .5 + rnd() * 1.4; if (distPath(x, z) > 1.4) m.disc([x, .008, z], [0, 1, 0], r, C.grassD, 7); }   // 짙은 풀밭 얼룩

  // 나무 — 줄기(밑동이 굵고 살짝 휨) + 잎 뭉치 여럿
  const tree = (x, z, s, big, far) => {
    const h = (3.2 + rnd() * 2.2) * s, r = (big ? .5 : .2 + rnd() * .1) * s, lean = [(rnd() - .5) * .5, 0, (rnd() - .5) * .5];
    const mid = [x + lean[0] * .4, h * .5, z + lean[2] * .4], top = [x + lean[0], h, z + lean[2]];
    m.cyl([x, -.05, z], [x, .5 * s, z], r * 1.7, r * 1.1, C.barkD, 7);                                            // 뿌리목
    m.cyl([x, .5 * s, z], mid, r * 1.1, r * .85, C.bark, 7); m.cyl(mid, top, r * .85, r * .5, C.bark, 7);
    for (let k = 0; k < 2; k++) { const a = rnd() * 6.28, bh = h * (.55 + rnd() * .25), e = [top[0] + Math.cos(a) * 1.4 * s, bh + .9 * s, top[2] + Math.sin(a) * 1.4 * s];
      m.cyl([lerp(x, top[0], bh / h), bh, lerp(z, top[2], bh / h)], e, r * .34, r * .12, C.barkD, 5); }          // 가지
    const n = big ? 8 : 4 + (rnd() * 3 | 0);
    for (let k = 0; k < n; k++) { const a = rnd() * 6.28, d = (k ? .5 + rnd() * 1.3 : 0) * s, rr = (1.0 + rnd() * .9) * s * (big ? 1.3 : 1);
      m.ellipsoid([top[0] + Math.cos(a) * d, h + (rnd() - .25) * 1.3 * s, top[2] + Math.sin(a) * d], [rr, 0, 0], [0, rr * (.62 + rnd() * .2), 0], [0, 0, rr], C.leaf[(rnd() * C.leaf.length) | 0], far ? 6 : 8, far ? 4 : 5, { m: 3 }); }
    solid.push([x, z, r * 1.25 + .12]);
  };
  const placed = [];
  const free = (x, z, gap) => distPath(x, z) > 2.1 && Math.hypot(x - WELL[0], z - WELL[1]) > 4.4 && Math.hypot(x - SPAWN[0], z - SPAWN[1]) > 2.6 &&
    Math.hypot(x - OLD[0], z - OLD[1]) > 2.4 && Math.hypot(x - GAP[0], z - GAP[1]) > 1.6 && !placed.some(p => Math.hypot(x - p[0], z - p[1]) < gap);
  for (let i = 0, n = 0; i < 900 && n < 62; i++) { const x = -13 + rnd() * 44, z = -19 + rnd() * 35; if (!free(x, z, 2.7)) continue; placed.push([x, z]); tree(x, z, .85 + rnd() * .5); n++; }
  // 바깥을 둘러싼 숲 — 더는 못 가게, 그리고 끝이 안 보이게 (촘촘히 두 겹)
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 46; i++) { const a = i / 46 * 6.283 + ring * .07, rx = 21 + ring * 4.5 + rnd() * 2, rz = 15 + ring * 4.5 + rnd() * 2;
    const x = 7.5 + Math.cos(a) * rx, z = -1 + Math.sin(a) * rz; if (Math.hypot(x - GAP[0], z - GAP[1]) < 1.3) continue; placed.push([x, z]); tree(x, z, 1.1 + rnd() * .6, false, true); }
  // 늙은 나무 (밑동에 서류) · 틈 양옆의 나무
  placed.push(OLD); tree(OLD[0], OLD[1], 1.5, true);
  tree(GAP[0] - 1.05, GAP[1] - .2, 1.3, true); tree(GAP[0] + 1.05, GAP[1] - .2, 1.3, true);

  // 덤불 · 돌 · 쓰러진 통나무
  for (let i = 0, n = 0; i < 400 && n < 70; i++) { const x = -10 + rnd() * 36, z = -14 + rnd() * 26; if (distPath(x, z) < 1.3 || Math.hypot(x - WELL[0], z - WELL[1]) < 2.4) continue; n++;
    const r = .35 + rnd() * .5; for (let k = 0; k < 3; k++) m.ellipsoid([x + (rnd() - .5) * r, r * .55 + rnd() * .15, z + (rnd() - .5) * r], [r, 0, 0], [0, r * .7, 0], [0, 0, r], C.bush[(rnd() * 3) | 0], 7, 4, { m: 3 }); }
  for (let i = 0; i < 26; i++) { const x = -8 + rnd() * 32, z = -12 + rnd() * 22, r = .14 + rnd() * .3; if (distPath(x, z) < .5) continue;
    m.ellipsoid([x, r * .35, z], [r, 0, 0], [0, r * .55, 0], [0, 0, r * (.7 + rnd() * .5)], rnd() < .5 ? C.stone : C.stoneD, 7, 4); }
  m.cyl([3.2, .22, -2.6], [5.6, .26, -3.5], .24, .2, C.barkD, 8, true); solid.push([3.8, -2.85, .34], [4.4, -3.05, .34], [5.0, -3.3, .34]);

  // 풀 — 가는 잎 세 가닥씩 (aE 4 · aUV.x 에 끝일수록 큰 흔들림)
  const blade = (x, z, h, a, col) => { const dx = Math.cos(a) * .035, dz = Math.sin(a) * .035, lx = Math.cos(a + 1.3) * h * .35, lz = Math.sin(a + 1.3) * h * .35, n = [Math.sin(a), .3, -Math.cos(a)];
    m.tri([x - dx, 0, z - dz], [x + dx, 0, z + dz], [x + lx, h, z + lz], n, col, 4, [0, 0], [0, 0], [1, 0]); };
  for (let i = 0; i < 2600; i++) { const x = -9 + rnd() * 34, z = -13 + rnd() * 24, dp = distPath(x, z); if (dp < .8 || Math.hypot(x - WELL[0], z - WELL[1]) < 2.2) continue;
    const h = (.16 + rnd() * .3) * (dp < 2 ? .7 : 1), col = C.blade[(rnd() * 3) | 0]; for (let k = 0; k < 3; k++) blade(x + (rnd() - .5) * .12, z + (rnd() - .5) * .12, h * (.7 + rnd() * .5), rnd() * 6.28, col); }

  // 빛나는 버섯 — 던전의 그 버섯이 여기서 먼저 보임
  const shrooms = [[4.6, -1.2], [8.3, 2.3], [12.6, .6], [15.2, -5.2], [1.4, 2.4], [13.4, -9.6]];
  shrooms.forEach(([x, z], i) => { const col = i % 2 ? hex('#9a86e0') : C.glow;
    for (const [dx, dz, s] of [[0, 0, 1], [.11, .05, .7], [-.08, .1, .6]]) { m.cyl([x + dx, 0, z + dz], [x + dx, .09 * s, z + dz], .012, .01, hex('#c8d2d6'), 5);
      m.ellipsoid([x + dx, .1 * s, z + dz], [.05 * s, 0, 0], [0, .03 * s, 0], [0, 0, .05 * s], mul(col, 1.5), 7, 4, { e: 1 }); } });

  // 장승 둘 — 길을 지키는 나무 기둥 (눈 · 입 · 오방색 띠)
  TOTEM.forEach(([x, z], i) => { const yaw = i ? .5 : -.4, c = Math.cos(yaw), s = Math.sin(yaw), U = [c * .15, 0, s * .15], Wv = [-s * .15, 0, c * .15], h = 2.0 + i * .25;
    m.obox([x, h / 2, z], U, [0, h / 2, 0], Wv, C.wood); m.obox([x, h + .06, z], mul(U, 1.25), [0, .07, 0], mul(Wv, 1.25), C.woodD);
    const face = (dy, w, hh, col, e) => m.obox([x - Wv[0] * 1.04 + 0, dy, z - Wv[2] * 1.04], mul(U, w), [0, hh, 0], mul(Wv, .04), col, e ? { e: 1 } : {});
    face(h - .32, .28, .05, hex('#f1ece0')); face(h - .32, .1, .03, hex('#15131a')); face(h - .62, .5, .05, hex('#c2352c')); face(h - .62, .36, .02, hex('#f1ece0'));
    C.ob.forEach((col, k) => face(h - 1.0 - k * .09, .95, .04, col));
    solid.push([x, z, .3]); });

  // 우물 — 돌 테(두 켜를 어긋나게) · 기둥 · 들보 · 지붕 · 오방색 띠 · 두레박
  const [wx, wz] = WELL, R0 = 1.02;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 14; i++) { const a = (i + (row & 1) * .5) / 14 * 6.283, c = Math.cos(a), s = Math.sin(a), w = R0 * 3.14159 / 14 * .94;
    m.obox([wx + c * R0, .16 + row * .28, wz + s * R0], [-s * w, 0, c * w], [0, .13, 0], [c * (.19 + rnd() * .03), 0, s * (.19 + rnd() * .03)], [C.stone, C.stoneD, C.stoneL][((i * 7 + row * 3) % 5) % 3]); }
  m.cyl([wx, 0, wz], [wx, .84, wz], R0 + .02, R0 + .02, mul(C.stoneD, .45), 18);                                   // 돌 사이 틈을 메우는 통 (어두운 줄눈)
  m.cyl([wx, -6, wz], [wx, .86, wz], R0 - .27, R0 - .27, C.stoneD, 18);                                            // 안쪽 벽 — 아래로 깊이 (돌 테보다 안쪽)
  for (let i = 0; i < 18; i++) { const a0 = i / 18 * 6.2832, a1 = (i + 1) / 18 * 6.2832, P = (a, r) => [wx + Math.cos(a) * r, .845, wz + Math.sin(a) * r];
    m.quad(P(a0, R0 - .27), P(a1, R0 - .27), P(a1, R0 - .1), P(a0, R0 - .1), C.stoneD); }                          // 벽과 돌 테 사이를 덮는 턱
  m.disc([wx, -5.98, wz], [0, 1, 0], R0, hex('#010203'), 16, { m: 7 });                                          // 바닥은 안 보임 — 캄캄함
  for (const sd of [-1, 1]) { m.rbox ? m.box(wx - .09, wx + .09, 0, 2.5, wz + sd * 1.3 - .09, wz + sd * 1.3 + .09, C.wood) : 0; solid.push([wx, wz + sd * 1.3, .2]); }
  m.box(wx - .08, wx + .08, 2.36, 2.52, wz - 1.5, wz + 1.5, C.woodD);                                               // 들보
  for (const sd of [-1, 1]) m.quad([wx, 3.15, wz - 1.75], [wx, 3.15, wz + 1.75], [wx + sd * 1.25, 2.42, wz + 1.75], [wx + sd * 1.25, 2.42, wz - 1.75], C.roof);   // 지붕 두 장
  for (const sd of [-1, 1]) m.tri([wx, 3.15, wz + sd * 1.75], [wx - 1.25, 2.42, wz + sd * 1.75], [wx + 1.25, 2.42, wz + sd * 1.75], [0, 0, sd], C.woodD, 0);
  C.ob.forEach((col, k) => m.box(wx - 1.28, wx - 1.22, 2.26, 2.42, wz - 1.25 + k * .5, wz - .75 + k * .5, mul(col, .5), { e: 1 }));        // 오방색 띠 (걸어오는 쪽)
  m.cyl([wx, 2.4, wz + .2], [wx, 1.2, wz + .2], .012, .012, C.rope, 5); m.cyl([wx, 1.2, wz + .2], [wx, .95, wz + .2], .13, .1, C.woodD, 8, true);   // 두레박
  solid.push([wx, wz, R0 + .22]);

  // 늙은 나무 밑동의 서류 · 숲 가장자리의 틈(그 너머는 새까맘)
  m.quad([OLD[0] - .92, .04, OLD[1] - .56], [OLD[0] - .62, .16, OLD[1] - .68], [OLD[0] - .52, .14, OLD[1] - .34], [OLD[0] - .82, .03, OLD[1] - .22], mul(C.paper, .62), { e: 1 });
  m.quad([OLD[0] - 1.02, .02, OLD[1] - .3], [OLD[0] - .8, .025, OLD[1] - .38], [OLD[0] - .74, .02, OLD[1] - .12], [OLD[0] - .96, .02, OLD[1] - .04], mul(C.paper, .45), { e: 1 });
  m.quad([GAP[0] - 1.6, 0, GAP[1] - .9], [GAP[0] + 1.6, 0, GAP[1] - .9], [GAP[0] + 1.6, 8, GAP[1] - .9], [GAP[0] - 1.6, 8, GAP[1] - .9], hex('#010102'), { m: 7 });

  // 하늘 — 안쪽을 보는 큰 공 (색은 셰이더가 보는 방향으로 계산)
  const sk = new Mesh(); sk.ellipsoid([7, 0, -1], [95, 0, 0], [0, 95, 0], [0, 0, 95], [0, 0, 0], 16, 10, { m: 6 });
  const fly = new Mesh(); fly.ellipsoid([0, 0, 0], [.022, 0, 0], [0, .022, 0], [0, 0, .022], [1.6, 1.9, .7], 5, 3, { e: 1 });
  const f32 = x => new Float32Array(x.v);
  return BUILT = { mesh: f32(m), sky: f32(sk), fly: f32(fly), solid, shrooms };
}

const CSS = `
#f3d{ position:absolute; inset:0; z-index:5; background:#000; touch-action:none; }
#f3d canvas{ position:absolute; inset:0; width:100%; height:100%; display:block; }
#f3d-stick{ position:fixed; width:96px; height:96px; margin:-48px 0 0 -48px; border-radius:50%; border:2px solid rgba(241,236,224,.28); background:rgba(10,10,14,.18); pointer-events:none; z-index:60; display:none; }
#f3d-stick i{ position:absolute; left:50%; top:50%; width:36px; height:36px; margin:-18px 0 0 -18px; border-radius:50%; background:rgba(241,236,224,.4); }
#f3d .dot{ position:absolute; left:50%; top:50%; width:2px; height:2px; margin:-1px; background:rgba(241,236,224,.5); pointer-events:none; }
`;

class Forest3D {
  /* o : well() · doc() · gap() — 조사했을 때 · ready() — 몸을 다 일으킴 · prompt(글 | null) — 게임의 조사 안내 · busy() — 대사 · 서류 등으로 멈춰야 하는지
         tap() — 멈춘 동안 화면을 누름(대사 넘기기) · sawDoc() · sfx */
  constructor(o = {}) { this.o = o; this.running = false; this.paused = false; this.held = new Set(); this.loop = this.loop.bind(this); }
  start(stage) {
    if (!document.getElementById('f3d-css')) { const st = document.createElement('style'); st.id = 'f3d-css'; st.textContent = CSS; document.head.appendChild(st); }
    const root = this.root = document.createElement('div'); root.id = 'f3d'; root.innerHTML = '<canvas></canvas><div class="dot"></div>';
    const cv = this.cv = root.querySelector('canvas');
    const gl = this.gl = cv.getContext('webgl', { antialias: !(window.Perf && Perf.low) && !DBG.noaa, alpha: false }) || cv.getContext('experimental-webgl');
    if (!gl) return false;
    try {
      const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const link = fs => { const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
        ['aP', 'aN', 'aC', 'aUV', 'aE'].forEach((n, i) => gl.bindAttribLocation(pr, i, n)); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); return pr; };
      this.pr = link(FS); this.prZ = link(FS_Z);
    } catch (e) { console.warn('forest3d', e && e.message); return false; }
    (stage || document.body).appendChild(root);                                       // (주사선 · HUD 를 치우는 body.fp3d 는 game.js 의 loop 가 켜고 끔)
    const sk = this.stickEl = document.createElement('div'); sk.id = 'f3d-stick'; sk.innerHTML = '<i></i>'; document.body.appendChild(sk);
    gl.useProgram(this.pr);
    this.at = [0, 1, 2, 3, 4];
    this.un = {}; ['uVP', 'uOff', 'uTime', 'uEye', 'uSun', 'uWell', 'uGlow', 'uFade', 'uRes', 'uDim'].forEach(n => this.un[n] = gl.getUniformLocation(this.pr, n));
    this.unZ = {}; ['uVP', 'uOff', 'uTime'].forEach(n => this.unZ[n] = gl.getUniformLocation(this.prZ, n));
    const up = v => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW); return { b, n: v.length / 12 }; };
    const F = buildForest(); this.world = up(F.mesh); this.sky = up(F.sky); this.flyBuf = up(F.fly); this.solid = F.solid;
    // 눈 뜬 자리 — 누운 데서 몸을 일으킴 (처음 2.6초). 우물(해 지는 쪽)을 조금 비껴 봄
    this.cam = { x: SPAWN[0], y: .4, z: SPAWN[1], yaw: -.25, pitch: .85 };
    this.q = DBG.q || 1; this.slow = 0;                                                // 그리는 해상도 배율 — 장이 밀리면 낮춤
    this.t = 0; this.bob = 0; this.stepT = 0; this.look = [0, 0]; this.stick = [0, 0]; this.tch = {}; this.fade = 0; this.glow = 0; this.fall = 0; this.lean = 0; this.dim = 1;
    this.flies = Array.from({ length: 16 }, (_, i) => ({ x: -4 + rnd() * 24, y: .5 + rnd() * 1.6, z: -8 + rnd() * 15, p: rnd() * 6.28, s: .2 + rnd() * .4 }));
    // ── 입력 (2부와 같은 손맛)
    const CODE = { 87: 'KeyW', 65: 'KeyA', 83: 'KeyS', 68: 'KeyD', 69: 'KeyE', 32: 'Space', 13: 'Enter', 16: 'ShiftLeft', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' };
    const code = e => e.code || CODE[e.keyCode] || '';                                     // 한글 입력기가 e.code 를 비워도
    this.onKey = e => { if (!this.running || this.paused) return; const c = code(e);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(c)) { this.held.add(c); e.preventDefault(); }
      if (e.repeat || this.busy()) return;
      if (c === 'KeyE' || c === 'Space' || c === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.interact(); } };
    this.onKeyUp = e => this.held.delete(code(e));
    this.onMove = e => { if (this.paused) return;
      if (document.pointerLockElement === cv) { this.look[0] += e.movementX || 0; this.look[1] += e.movementY || 0; }
      else if (this.drag && e.pointerType !== 'touch') { this.look[0] += (e.clientX - this.drag[0]) * 1.4; this.look[1] += (e.clientY - this.drag[1]) * 1.4; this.drag = [e.clientX, e.clientY]; } };
    this.onDown = e => { if (this.paused || e.pointerType === 'touch') return;
      if (this.o.busy && this.o.busy()) { if (this.o.tap) this.o.tap(); return; }       // 대사가 떠 있으면 누르는 건 넘기기
      if (!this.busy() && this.target()) { this.interact(); return; }                   // 조사할 것이 눈앞에 — 누르면 바로 (포인터 고정이 안 되는 곳에서도)
      if (document.pointerLockElement !== cv) { this.drag = [e.clientX, e.clientY]; try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (er) {} } };
    this.onUp = () => { this.drag = null; };
    this.onBlur = () => { this.held.clear(); this.stick = [0, 0]; };
    this.onTS = e => { e.preventDefault(); for (const t of e.changedTouches) { const left = t.clientX < innerWidth * .45; this.tch[t.identifier] = { left, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t: e.timeStamp, moved: 0 };           // 누른 때는 입력이 들어온 시각으로 (장이 밀려 늦게 처리돼도 톡이 씹히지 않게)
      if (left) { sk.style.left = t.clientX + 'px'; sk.style.top = t.clientY + 'px'; sk.style.display = 'block'; sk.firstChild.style.transform = ''; } } };
    this.onTM = e => { e.preventDefault(); for (const t of e.changedTouches) { const k = this.tch[t.identifier]; if (!k) continue;
      if (k.left) { this.stick = [clamp((t.clientX - k.x0) / 60, -1, 1), clamp((t.clientY - k.y0) / 60, -1, 1)]; sk.firstChild.style.transform = `translate(${this.stick[0] * 30}px,${this.stick[1] * 30}px)`; } else { this.look[0] += (t.clientX - k.x) * 2.2; this.look[1] += (t.clientY - k.y) * 2.2; }
      k.moved += Math.abs(t.clientX - k.x) + Math.abs(t.clientY - k.y); k.x = t.clientX; k.y = t.clientY; } };
    this.onTE = e => { e.preventDefault(); for (const t of e.changedTouches) { const k = this.tch[t.identifier]; if (!k) continue; if (k.left) { this.stick = [0, 0]; sk.style.display = 'none'; }
      if (k.moved < 14 && e.timeStamp - k.t < 450 && !this.busy()) this.interact(); delete this.tch[t.identifier]; } };          // (대사 넘기기는 게임 쪽 손가락 처리가 함)
    addEventListener('keydown', this.onKey, true); addEventListener('keyup', this.onKeyUp); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); addEventListener('blur', this.onBlur);
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('touchstart', this.onTS, { passive: false }); cv.addEventListener('touchmove', this.onTM, { passive: false }); cv.addEventListener('touchend', this.onTE, { passive: false });
    this.running = true; this.last = performance.now(); this.acc = 0;
    this.raf = requestAnimationFrame(this.loop);
    return true;
  }
  stop() {
    this.running = false; cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey, true); removeEventListener('keyup', this.onKeyUp); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('blur', this.onBlur);
    this.unlock();
    try { const ext = this.gl && this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {}
    if (this.root) this.root.remove(); if (this.stickEl) this.stickEl.remove();
    if (this.o.prompt) this.o.prompt(null);
  }
  unlock() { if (this.cv && document.pointerLockElement === this.cv && document.exitPointerLock) document.exitPointerLock(); }
  busy() { return this.t < 150 || this.fall > 0 || this.atWell || (this.o.busy ? this.o.busy() : false); }
  fx(name, ...a) { try { const s = this.o.sfx; if (s && s[name]) s[name](...a); } catch (e) {} }
  hit(x, z) { if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return true; const r = .3; for (const s of this.solid) if (Math.hypot(x - s[0], z - s[1]) < s[2] + r) return true; return false; }
  /* 지금 조사할 수 있는 것 — 가깝고 · 보는 쪽에 있을 때 */
  target() {
    const c = this.cam, see = (p, r) => { const dx = p[0] - c.x, dz = p[1] - c.z, d = Math.hypot(dx, dz); return d < r && (dx * Math.cos(c.yaw) + dz * Math.sin(c.yaw)) / (d || 1) > .45; };
    if (see(WELL, 2.7)) return 'well';
    if (see([OLD[0] - .64, OLD[1] - .4], 1.9)) return 'doc';
    if (see([GAP[0], GAP[1] - .3], 1.9)) return 'gap';
    return null;
  }
  interact() {
    const k = this.target(); if (!k) return;
    if (k === 'well') { this.atWell = true; this.wellT = 0; if (this.o.prompt) this.o.prompt(null); this.unlock(); if (this.o.well) this.o.well(); }
    else if (k === 'doc') { this.unlock(); if (this.o.doc) this.o.doc(); }
    else if (k === 'gap') { this.unlock(); if (this.o.gap) this.o.gap(); }
  }
  /* 우물 앞의 대사가 끝남 → 몸이 기울며 떨어짐. 다 떨어지면 done() */
  drop(done) { this.fall = 1; this.fallDone = done; this.fx('landThump', .14); this.fx('inhale', .09, .35); }
  update() {
    const c = this.cam, t = ++this.t, H = this.held;
    this.fade = Math.min(1, this.fade + .014);
    const sx = window.Settings ? Settings.look() : 1, sy = window.Settings ? Settings.lookY() : 1;
    if (t < 150) {                                                                      // 몸을 일으킴 — 누운 눈높이에서 선 눈높이로, 하늘에서 숲길로
      const k = smooth(t / 150); c.y = lerp(.4, 1.56, k); c.pitch = lerp(.85, .02, k); c.yaw = lerp(-.25, 0, k); this.look = [0, 0];
      if (t === 40 || t === 96) this.fx('step');
      if (t === 149 && this.o.ready) this.o.ready();
    } else if (this.fall > 0) {                                                         // 우물로 — 앞으로 쏠리고, 캄캄한 속으로
      const f = this.fall++, k = f / 70;
      const a = Math.atan2(WELL[1] - c.z, WELL[0] - c.x); c.yaw += Math.atan2(Math.sin(a - c.yaw), Math.cos(a - c.yaw)) * .2;
      c.x += (WELL[0] - c.x) * .06; c.z += (WELL[1] - c.z) * .06; c.pitch = lerp(c.pitch, -1.5, .09);
      if (f === 1) this.y0 = c.y;
      c.y = this.y0 - k * k * 2.4; this.dim = Math.max(0, 1 - Math.max(0, k - .45) * 2.2);
      if (f >= 70) { const d = this.fallDone; this.fallDone = null; if (d) d(); return; }
    } else if (this.atWell) {                                                           // 우물을 들여다보는 중 — 가장자리로 다가가 고개를 숙임 (대사가 흐르는 동안)
      const w = ++this.wellT, a = Math.atan2(WELL[1] - c.z, WELL[0] - c.x), d = Math.hypot(WELL[0] - c.x, WELL[1] - c.z);
      const lean = smooth(w / 480), want = lerp(1.55, .62, lean);                          // 처음엔 테 앞에 서서, 말이 이어질수록 테 위로 몸을 숙임
      c.yaw += Math.atan2(Math.sin(a - c.yaw), Math.cos(a - c.yaw)) * .08;
      c.x += Math.cos(a) * (d - want) * .05; c.z += Math.sin(a) * (d - want) * .05;
      c.pitch = lerp(c.pitch, lerp(-.55, -1.3, lean), .05); c.y = lerp(c.y, lerp(1.54, 1.36, lean) + Math.sin(w * .03) * .006, .05);
      this.look = [0, 0];
    } else {
      c.yaw += this.look[0] * .0023 * sx; c.pitch = clamp(c.pitch - this.look[1] * .0023 * sy, -1.2, 1.2); this.look = [0, 0];
      if (H.has('ArrowLeft')) c.yaw -= .035; if (H.has('ArrowRight')) c.yaw += .035;
      let fw = (H.has('KeyW') || H.has('ArrowUp') ? 1 : 0) - (H.has('KeyS') || H.has('ArrowDown') ? 1 : 0) - this.stick[1], st = (H.has('KeyD') ? 1 : 0) - (H.has('KeyA') ? 1 : 0) + this.stick[0];
      if (this.o.busy && this.o.busy()) fw = st = 0;
      const l = Math.hypot(fw, st), sp = H.has('ShiftLeft') || H.has('ShiftRight') ? .062 : .042;
      if (l > .05) { fw /= Math.max(1, l); st /= Math.max(1, l);
        const dx = (Math.cos(c.yaw) * fw - Math.sin(c.yaw) * st) * sp, dz = (Math.sin(c.yaw) * fw + Math.cos(c.yaw) * st) * sp;
        if (!this.hit(c.x + dx, c.z)) c.x += dx; if (!this.hit(c.x, c.z + dz)) c.z += dz;
        this.bob += sp * 3.0; if ((this.stepT += sp) > .7) { this.stepT = 0; this.fx('step'); } }
      c.y = 1.56 + Math.sin(this.bob * 2) * .024 + Math.sin(t * .03) * .004;
      const k = this.o.busy && this.o.busy() ? null : this.target();
      if (k !== this.shown) { this.shown = k; if (this.o.prompt) this.o.prompt(k === 'well' ? '우물 들여다보기' : k === 'doc' ? (this.o.sawDoc && this.o.sawDoc() ? '서류 다시 보기' : '나무 밑동에 낀 무언가') : k === 'gap' ? '나무 사이 좁은 틈으로' : null); }
    }
    const near = clamp(1 - Math.hypot(WELL[0] - c.x, WELL[1] - c.z) / 9, 0, 1); this.glow += ((.25 + near * .9) - this.glow) * .04;   // 다가갈수록 우물 속 빛이 새어 나옴
    if (t % 420 === 200 && !this.fall) this.fx('bird');
  }
  drawBuf(buf, off) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    const sz = [3, 3, 3, 2, 1]; let o = 0; this.at.forEach((a, i) => { if (a >= 0) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, sz[i], gl.FLOAT, false, 48, o * 4); } o += sz[i]; });
    gl.uniform3fv((this.zpass ? this.unZ : this.un).uOff, off || [0, 0, 0]); gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }
  draw() {
    const gl = this.gl, cv = this.cv, un = this.un, c = this.cam;
    const r = cv.getBoundingClientRect(), dpr = Math.min(window.Perf && Perf.low ? 1 : 1.5, window.devicePixelRatio || 1) * this.q, w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    const f = [Math.cos(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.sin(c.yaw) * Math.cos(c.pitch)], eye = [c.x, c.y, c.z];
    const roll = this.fall > 0 ? Math.min(.5, this.fall / 70 * .6) : 0, upv = [Math.sin(roll) * -Math.sin(c.yaw), Math.cos(roll), Math.sin(roll) * Math.cos(c.yaw)];
    const VP = new Float32Array(mmul(perspective(1.12, w / h, .06, 220), lookAt(eye, add(eye, f), Math.abs(f[1]) > .98 ? [Math.cos(c.yaw), 0, Math.sin(c.yaw)] : upv)));
    // ① 깊이만 — 색은 안 칠함
    gl.useProgram(this.prZ); this.zpass = true;
    gl.uniformMatrix4fv(this.unZ.uVP, false, VP); gl.uniform1f(this.unZ.uTime, this.t / 60);
    gl.colorMask(false, false, false, false); gl.depthMask(true); gl.depthFunc(gl.LESS);
    this.drawBuf(this.world);
    // ② 색 — 맨 앞에 보이는 조각만 한 번씩
    gl.useProgram(this.pr); this.zpass = false;
    gl.colorMask(true, true, true, true); gl.depthFunc(gl.LEQUAL);
    gl.uniformMatrix4fv(un.uVP, false, VP); gl.uniform3fv(un.uEye, eye); gl.uniform3fv(un.uSun, SUN);
    gl.uniform3fv(un.uWell, [WELL[0], -.9, WELL[1]]); gl.uniform1f(un.uGlow, this.glow * (1 + .15 * Math.sin(this.t * .05)));
    gl.uniform1f(un.uTime, this.t / 60); gl.uniform1f(un.uFade, this.fade); gl.uniform2f(un.uRes, w, h); gl.uniform1f(un.uDim, this.dim);
    gl.depthMask(false); this.drawBuf(this.world); gl.depthMask(true);
    for (const fl of this.flies) {                                                       // 반딧불 — 느리게 떠다니며 깜빡
      if (Math.sin(this.t * .03 * (1 + fl.s) + fl.p) < -.2) continue;
      this.drawBuf(this.flyBuf, [fl.x + Math.sin(this.t * .006 + fl.p) * 1.4, fl.y + Math.sin(this.t * .011 + fl.p * 2) * .35, fl.z + Math.cos(this.t * .005 + fl.p) * 1.4]);
    }
    this.drawBuf(this.sky);                                                              // 하늘은 맨 나중 — 가려지지 않은 데만
  }
  loop(now) {
    if (!this.running) return;
    if (this.paused) { this.last = now; this.raf = requestAnimationFrame(this.loop); return; }
    const dt = now - this.last; this.acc += Math.min(100, dt); this.last = now;
    let n = 0;
    while (this.acc >= 1000 / 60 && this.running) { this.update(); this.acc -= 1000 / 60; n++; }
    if (!this.running) return;
    // 장 사이가 30ms 넘게 벌어지는 게 이어지면(초당 33장 아래) 그리는 해상도를 한 단계씩 낮춤 — 가장 낮게 0.4배
    if (dt > 30) { if (++this.slow >= 8 && this.q > .4) { this.q = Math.max(.4, this.q * .78); this.slow = 0; } } else this.slow = Math.max(0, this.slow - 1);
    if (window.Perf ? Perf.draw('forest3d', now, n) : n) this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }
}
Forest3D.SRC = { VS, FS };
Forest3D.warm = () => { try { buildForest(); } catch (e) {} };          // 미리 지어 둠 — 오프닝이 끝나는 순간 멈칫하지 않게 (game.js warmOpening)
window.Forest3D = Forest3D;
})();
