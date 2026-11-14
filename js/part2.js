'use strict';
/* ═══════════════════════════════════════════════════════════════
   part2.js — 2부 「연구동」 : 1인칭 3D 공포 탐색 (WebGL)

   1부에서 깨어난 주인공(피험자 07)이 병실을 나서면 불 꺼진 연구동 B동 3층입니다.
   비상구는 번호 네 자리로 잠겨 있고, 연구동을 뒤져 단서를 모아야 열립니다.
   전반은 추격 없이 분위기로(깜빡이는 불 · 정전 · 스쳐 가는 방호복), 비상구를 여는 순간
   경보가 울리며 후반 — 기존 달리기 추격(escape.js) — 으로 넘어갑니다.

     복도 ─ 서쪽 끝 CELL 07(나온 곳) … 동쪽 끝 비상구(번호 자물쇠)
     관찰실   : 연구원 일지(사물함 번호의 단서) · 손전등
     탈의실   : 담당 연구원 사물함(번호 0520) → 출입 카드
     자료 보관실 : 카드로 열림 · 배양조 여섯 · 피험자 07 기록(비상구 번호 2145)
   순서 : 관찰실 → (정전) → 탈의실 → 자료 보관실 → 비상구

   조작 : WASD 걷기(Shift 빠르게) · 마우스 둘러보기(화면을 누르면 고정) · E / SPACE / 클릭 조사 · F 손전등
   쓰는 곳 : game.js beginPart2() — 개발자 모드의 「2부」, 깨어남(escape.js)에서 병실 문을 나설 때
   ═══════════════════════════════════════════════════════════════ */
(() => {
const L3 = window.Lab3D;
if (!L3) return;
const { Mesh, hex } = L3;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
function perspective(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
function lookAt(e, c, up) { const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]; }
function mmul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }

/* ── 치수 (m) — x 동쪽 · y 위 · z 복도를 가로질러 ── */
const HALL = { x0: 0, x1: 26, z0: -1.5, z1: 1.5, h: 2.8 };
const OBS = { x0: 3, x1: 10, z0: 1.5, z1: 7.5, door: 6 };            // 관찰실
const REC = { x0: 13, x1: 22.5, z0: 1.5, z1: 8, door: 17.5 };        // 자료 보관실
const LOC = { x0: 7, x1: 14, z0: -7.5, z1: -1.5, door: 10.5 };       // 탈의실
const DW = 1.1, DH = 2.15, WT = .16;
const CODE_LOCKER = '0520', CODE_EXIT = '2145';

const C = {
  wall: hex('#56646f'), wallD: hex('#333d46'), floor: hex('#3a424a'), ceil: hex('#1c2126'), trim: hex('#232a31'),
  door: hex('#3c4852'), metal: hex('#6b7682'), dark: hex('#14181c'), desk: hex('#4a525b'), locker: hex('#4d6170'), lockerD: hex('#354653'),
  paper: hex('#d9d2bf'), red: hex('#7a1418'), blood: hex('#3a0b0d'), glass: hex('#1b2a30'), yellow: hex('#7d6f38'), teal: hex('#3fe0c8'),
  green: hex('#3cff86'), lampOn: hex('#eef4ff'), lampOff: hex('#2a2f35'), sheet: hex('#aab2b8'), wood: hex('#4a3b2c'), rust: hex('#5a3a26')
};

/* ── 무늬 텍스처 — 문패 · 화이트보드 · 화면 · 사물함 번호 · 종이 ── */
const AT = 1024, UV = {};
function paintAtlas(figImg) {
  const cv = document.createElement('canvas'); cv.width = AT; cv.height = AT;
  const x = cv.getContext('2d'), F = (px, w = '') => `${w} ${px}px DungGeunMo, 'Malgun Gothic', monospace`;
  const reg = (name, X, Y, W, H) => { UV[name] = [X / AT, Y / AT, (X + W) / AT, (Y + H) / AT]; return [X, Y, W, H]; };
  const plate = (name, X, Y, W, H, txt, sub, bg = '#1d2a33', fg = '#dfe9ee') => {
    reg(name, X, Y, W, H); x.fillStyle = bg; x.fillRect(X, Y, W, H); x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 3; x.strokeRect(X + 4, Y + 4, W - 8, H - 8);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = F(H * .42); x.fillText(txt, X + W / 2, Y + H * (sub ? .4 : .52));
    if (sub) { x.font = F(H * .2); x.fillStyle = 'rgba(223,233,238,.6)'; x.fillText(sub, X + W / 2, Y + H * .78); }
  };
  plate('pCell', 0, 0, 256, 96, 'CELL 07', '수면 실험실');
  plate('pObs', 256, 0, 256, 96, '관찰실', 'OBSERVATION');
  plate('pLoc', 512, 0, 256, 96, '탈의실', 'LOCKER ROOM');
  plate('pRec', 768, 0, 256, 96, '자료 보관실', 'RECORDS · 카드 필요');
  plate('pMech', 0, 96, 256, 96, '기계실', '출입 금지', '#3a2a12', '#e3b23c');
  plate('pExit', 256, 96, 256, 96, '비상구', 'EXIT', '#0d3a22', '#7dffb0');
  plate('pB3', 512, 96, 256, 96, 'B동 3층', 'SLEEP LAB', '#161b20', '#8fa3b0');
  // 화이트보드 — 일정표 (5/20 에 동그라미)
  { const [X, Y, W, H] = reg('board', 0, 192, 512, 288); x.fillStyle = '#e8ebe6'; x.fillRect(X, Y, W, H);
    x.fillStyle = '#26303a'; x.textAlign = 'left'; x.font = F(26); x.fillText('세션 일정 — 피험자 07', X + 20, Y + 34);
    x.font = F(19); ['5/18  139회차 — 각성 반응 없음', '5/19  140회차 — 각성 반응 없음', '5/20  141회차 — 「우물」 시나리오', '5/21  142회차 — 예약'].forEach((s, i) => x.fillText(s, X + 24, Y + 86 + i * 40));
    x.strokeStyle = '#c2352c'; x.lineWidth = 4; x.beginPath(); x.ellipse(X + 52, Y + 166, 40, 20, -.05, 0, 7); x.stroke();
    x.fillStyle = '#c2352c'; x.font = F(18); x.fillText('← 그날. 잊지 말 것', X + 300, Y + 200);
    x.fillStyle = '#2f6fb5'; x.font = F(16); x.fillText('* 깨어나려 하면 용량 올릴 것', X + 24, Y + 262); }
  // 화면들
  { const [X, Y, W, H] = reg('ecg', 512, 192, 256, 160); x.fillStyle = '#04100c'; x.fillRect(X, Y, W, H); x.strokeStyle = '#3cff86'; x.lineWidth = 3; x.beginPath(); x.moveTo(X + 8, Y + 90); x.lineTo(X + W - 8, Y + 90); x.stroke();
    x.fillStyle = '#3cff86'; x.textAlign = 'left'; x.font = F(18); x.fillText('CELL 07 — 신호 없음', X + 12, Y + 28); x.fillStyle = '#ff5a4a'; x.fillText('■ 피험자 이탈', X + 12, Y + 140); }
  { const [X, Y, W, H] = reg('cam', 768, 192, 256, 160); x.fillStyle = '#0a0d10'; x.fillRect(X, Y, W, H); x.fillStyle = '#1b242b'; x.fillRect(X + 20, Y + 60, 216, 70); x.fillStyle = '#39454f'; x.fillRect(X + 60, Y + 84, 110, 30);
    x.fillStyle = '#8fa3b0'; x.textAlign = 'left'; x.font = F(16); x.fillText('CAM 03 · CELL 07 — 빈 침대', X + 10, Y + 24); x.fillStyle = '#ff5a4a'; x.fillText('● REC', X + 190, Y + 150); }
  { const [X, Y, W, H] = reg('term', 512, 352, 256, 128); x.fillStyle = '#031006'; x.fillRect(X, Y, W, H); x.fillStyle = '#3cff86'; x.textAlign = 'left'; x.font = F(15);
    ['> SUBJECT 07', '> SESSION 141 / 141', '> 각성 횟수 : 1', '> 상태 : 이탈 — 추적 중_'].forEach((s, i) => x.fillText(s, X + 10, Y + 26 + i * 26)); }
  { const [X, Y, W, H] = reg('keypad', 768, 352, 128, 128); x.fillStyle = '#12161a'; x.fillRect(X, Y, W, H); x.fillStyle = '#04100c'; x.fillRect(X + 14, Y + 12, 100, 26);
    x.fillStyle = '#ff5a4a'; x.font = F(18); x.textAlign = 'center'; x.fillText('- - - -', X + 64, Y + 26);
    for (let i = 0; i < 12; i++) { x.fillStyle = '#39454f'; x.fillRect(X + 16 + (i % 3) * 34, Y + 46 + (i / 3 | 0) * 20, 28, 15); } }
  { const [X, Y, W, H] = reg('card', 896, 352, 128, 128); x.fillStyle = '#12161a'; x.fillRect(X, Y, W, H); x.fillStyle = '#04100c'; x.fillRect(X + 20, Y + 16, 88, 60); x.fillStyle = '#ff5a4a'; x.fillRect(X + 54, Y + 92, 20, 12);
    x.fillStyle = '#8fa3b0'; x.font = F(15); x.textAlign = 'center'; x.fillText('CARD', X + 64, Y + 50); }
  // 사물함 번호 여덟 · 이름표
  for (let i = 0; i < 8; i++) { const [X, Y, W, H] = reg('lk' + i, i * 128, 480, 128, 64); x.fillStyle = '#d9d2bf'; x.fillRect(X + 24, Y + 12, 80, 40); x.fillStyle = '#20262c'; x.font = F(24); x.textAlign = 'center';
    x.fillText(i === 5 ? 'B-07' : 'B-0' + (i + 1 + (i > 5 ? 1 : 0)), X + 64, Y + 33); }
  // 종이 · 파일 · 배양조 번호
  { const [X, Y, W, H] = reg('note', 0, 544, 192, 256); x.fillStyle = '#d9d2bf'; x.fillRect(X, Y, W, H); x.fillStyle = '#3a3f44'; for (let i = 0; i < 9; i++) x.fillRect(X + 18, Y + 34 + i * 22, 110 + (i * 37 % 50), 4); }
  { const [X, Y, W, H] = reg('file', 192, 544, 192, 256); x.fillStyle = '#8a6a3a'; x.fillRect(X, Y, W, H); x.fillStyle = '#d9d2bf'; x.fillRect(X + 26, Y + 40, 140, 60); x.fillStyle = '#7a1418'; x.font = F(26); x.textAlign = 'center'; x.fillText('피험자 07', X + 96, Y + 72); x.font = F(20); x.fillText('대외비', X + 96, Y + 160); }
  for (let i = 0; i < 6; i++) { const [X, Y, W, H] = reg('pod' + i, 384 + i * 96, 544, 96, 64); x.fillStyle = '#12161a'; x.fillRect(X, Y, W, H); x.fillStyle = i < 5 ? '#ff5a4a' : '#3cff86'; x.font = F(22); x.textAlign = 'center'; x.fillText('0' + (i + 1), X + 28, Y + 34);
    x.font = F(14); x.fillText(i < 5 ? '폐기' : '보류', X + 66, Y + 34); }
  { const [X, Y, W, H] = reg('smear', 384, 608, 320, 192); const g = x.createRadialGradient(X + 160, Y + 96, 4, X + 160, Y + 96, 150); g.addColorStop(0, 'rgba(70,8,10,.9)'); g.addColorStop(1, 'rgba(70,8,10,0)'); x.fillStyle = g; x.fillRect(X, Y, W, H); }
  // 방호복 (멀리 선 그림자) — 3D 모델을 찍어 온 그림, 없으면 사람 모양 덩어리
  { const [X, Y, W, H] = reg('fig', 704, 608, 320, 416); if (figImg) x.drawImage(figImg, X, Y, W, H);
    else { x.fillStyle = '#0a0c0e'; x.beginPath(); x.ellipse(X + 160, Y + 70, 46, 60, 0, 0, 7); x.fill(); x.fillRect(X + 90, Y + 120, 140, 290); } }
  return cv;
}
/* 방호복 그림 — figure3d.js 로 한 번 찍어 옴 (서 있는 정면, 거의 그림자) */
function bakeFigure() {
  if (!window.Figure3D) return null;
  try {
    const F = new Figure3D(320, 416); if (!F.ok) return null;
    const img = F.render({ kind: 'suit', x: 0, y: -.92, z: 2.7, yaw: 0, stride: 0, reach: 0, lean: .08, alpha: 1 }, {
      cam: { f: 560, px: 160, py: 222 }, sky: [.03, .035, .04], gnd: [.01, .01, .012], fog: [0, 0, 0], near: 1, red: [0, 0, 0, 0],
      lights: [[[.6, 2.4, -1.2], [.5, .52, .5]], [[-1.2, 1.6, -3.4], [.25, .3, .34]]] });
    const o = document.createElement('canvas'); o.width = 320; o.height = 416; o.getContext('2d').drawImage(img, 0, 0);
    setTimeout(() => { try { const e = F.gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } catch (er) {} }, 3000);
    return o;
  } catch (e) { return null; }
}

/* ── 셰이더 — 점광원 여덟 + 손전등, 얼룩 · 타일 줄눈은 그 자리에서 계산 ── */
const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute vec2 aUV; attribute float aE;
uniform mat4 uVP; uniform vec3 uOff; uniform float uRot;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE;
void main(){ float c=cos(uRot), s=sin(uRot); vec3 p=vec3(aP.x*c-aP.z*s, aP.y, aP.x*s+aP.z*c)+uOff; vec3 n=vec3(aN.x*c-aN.z*s, aN.y, aN.x*s+aN.z*c);
  vP=p; vN=n; vC=aC; vUV=aUV; vE=aE; gl_Position=uVP*vec4(p,1.0); }`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying vec2 vUV; varying float vE;
uniform vec3 uEye; uniform vec3 uL[8]; uniform vec3 uLC[8]; uniform vec3 uSpot; uniform float uSpotOn; uniform vec3 uAmb;
uniform sampler2D uTex; uniform float uTime; uniform float uRed; uniform float uFade; uniform vec2 uRes;
float h3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main(){
  vec3 c=vC; float a=1.0;
  if(vUV.x>=0.0){ vec4 t=texture2D(uTex,vUV); if(vE>8.5){ if(t.a<0.4) discard; c=t.rgb; } else c*=t.rgb; }
  vec3 n=normalize(vN), V=normalize(uEye-vP); if(dot(n,V)<0.0) n=-n;
  float d=length(uEye-vP);
  vec3 col;
  if(vE>0.5 && vE<1.5){ col=c*(0.92+0.08*sin(uTime*40.0+vP.x*3.0)); }
  else {
    // 얼룩 · 때 — 바닥은 타일 줄눈, 벽은 아래쪽 띠와 판 이음
    float grime=0.72+0.4*vn(vP*2.3)-0.22*smoothstep(0.55,0.85,vn(vP*0.7+7.0));
    if(n.y>0.9){ vec2 g=abs(fract(vP.xz/0.6)-0.5); float ln=smoothstep(0.47,0.5,max(g.x,g.y)); grime*=1.0-ln*0.45; }
    else if(abs(n.y)<0.3 && vE<0.5){ grime*=mix(0.7,1.0,smoothstep(0.95,1.05,vP.y)); grime*=1.0-0.25*smoothstep(0.985,1.0,abs(fract((vP.x+vP.z)/1.2)*2.0-1.0));
      grime*=1.0-0.35*smoothstep(0.6,1.0,vn(vec3(vP.x*6.0,vP.y*0.6,vP.z*6.0)))*smoothstep(2.6,0.4,vP.y)*0.6; }
    c*=grime;
    float spec=vE>=2.0 && vE<8.5 ? (vE-2.0) : 0.04; float rough=10.0+spec*70.0;
    vec3 acc=uAmb*(0.6+0.4*n.y), sp=vec3(0.0);
    for(int i=0;i<8;i++){ vec3 L=uL[i]-vP; float dl=length(L); L/=dl; float at=1.0/(1.0+dl*dl*0.42);
      acc+=uLC[i]*max((dot(n,L)+0.25)/1.25,0.0)*at; sp+=uLC[i]*pow(max(dot(n,normalize(L+V)),0.0),rough)*spec*at; }
    // 손전등 — 눈에서 보는 쪽으로, 가운데가 밝고 테가 지는 원뿔
    if(uSpotOn>0.0){ vec3 L=uEye-vP; float dl=length(L); L/=dl; float cs=dot(-L,uSpot);
      float cone=smoothstep(0.86,0.975,cs)+0.25*smoothstep(0.80,0.86,cs)*(1.0-smoothstep(0.86,0.9,cs));
      float at=uSpotOn*cone/(1.0+dl*dl*0.045); vec3 lc=vec3(1.0,0.96,0.86)*2.2;
      acc+=lc*max(dot(n,L),0.0)*at; sp+=lc*pow(max(dot(n,normalize(L+V)),0.0),rough)*spec*at; }
    col=c*acc+sp;
    if(vE>8.5) col*=0.55;
  }
  col=mix(col, vec3(0.0), 1.0-exp(-d*0.055));
  col=mix(col, col*vec3(1.0,0.25,0.22)+c*vec3(0.55,0.03,0.03)*exp(-d*0.06), uRed*(0.45+0.55*(0.5+0.5*sin(uTime*7.0)))*(vE>0.5&&vE<1.5?0.0:1.0));
  // 가장자리 어둠 · 필름 잡티
  vec2 q=gl_FragCoord.xy/uRes-0.5; col*=1.0-dot(q,q)*1.25;
  col+=(h3(vec3(gl_FragCoord.xy,uTime*60.0))-0.5)*0.035;
  gl_FragColor=vec4(col*uFade,1.0);
}`;

/* ── 맵 짓기 ── */
function buildLevel() {
  const m = new Mesh(), solid = [], lights = [];
  const S = (x0, x1, z0, z1) => solid.push({ x0, x1, z0, z1 });
  const H = HALL.h;
  /* 벽 — x 방향(z 고정) · z 방향(x 고정). gaps : 문 자리 [가운데] */
  const wallX = (z, x0, x1, gaps = []) => { let a = x0; const gs = gaps.slice().sort((p, q) => p - q);
    for (const gc of gs) { const g0 = gc - DW / 2, g1 = gc + DW / 2; if (g0 > a) { m.box(a, g0, 0, H, z - WT / 2, z + WT / 2, C.wall); S(a, g0, z - WT / 2, z + WT / 2); }
      m.box(g0, g1, DH, H, z - WT / 2, z + WT / 2, C.wall);
      m.box(g0 - .06, g0, 0, DH + .06, z - WT / 2 - .02, z + WT / 2 + .02, C.trim); m.box(g1, g1 + .06, 0, DH + .06, z - WT / 2 - .02, z + WT / 2 + .02, C.trim); m.box(g0, g1, DH, DH + .06, z - WT / 2 - .02, z + WT / 2 + .02, C.trim);
      a = g1; }
    if (x1 > a) { m.box(a, x1, 0, H, z - WT / 2, z + WT / 2, C.wall); S(a, x1, z - WT / 2, z + WT / 2); } };
  const wallZ = (x, z0, z1) => { m.box(x - WT / 2, x + WT / 2, 0, H, z0, z1, C.wall); S(x - WT / 2, x + WT / 2, z0, z1); };
  const room = (R, far) => { wallZ(R.x0, Math.min(R.z0, R.z1), Math.max(R.z0, R.z1)); wallZ(R.x1, Math.min(R.z0, R.z1), Math.max(R.z0, R.z1)); wallX(far, R.x0, R.x1);
    m.quad([R.x0, 0, R.z0], [R.x1, 0, R.z0], [R.x1, 0, R.z1], [R.x0, 0, R.z1], C.floor); m.quad([R.x0, H, R.z0], [R.x1, H, R.z0], [R.x1, H, R.z1], [R.x0, H, R.z1], C.ceil); };
  const lamp = (x, z, on, flick = 0, col = [1.05, 1.1, 1.2]) => { m.box(x - .55, x + .55, H - .05, H - .01, z - .16, z + .16, on ? C.lampOn : C.lampOff, on ? { e: 1 } : {}); m.box(x - .6, x + .6, H - .07, H, z - .2, z + .2, C.trim);
    const L = { p: [x, H - .3, z], c: col, on: on ? 1 : 0, flick, k: 1 }; lights.push(L); return L; };
  const plate = (uv, x, y, z, w, h, nz) => nz ? m.quad([x - w / 2 * nz, y + h / 2, z], [x + w / 2 * nz, y + h / 2, z], [x + w / 2 * nz, y - h / 2, z], [x - w / 2 * nz, y - h / 2, z], [1, 1, 1], { uv })
                                                : m.quad([x, y + h / 2, z + w / 2], [x, y + h / 2, z - w / 2], [x, y - h / 2, z - w / 2], [x, y - h / 2, z + w / 2], [1, 1, 1], { uv });

  // ── 복도
  m.quad([HALL.x0, 0, HALL.z0], [HALL.x1, 0, HALL.z0], [HALL.x1, 0, HALL.z1], [HALL.x0, 0, HALL.z1], C.floor);
  m.quad([HALL.x0, H, HALL.z0], [HALL.x1, H, HALL.z0], [HALL.x1, H, HALL.z1], [HALL.x0, H, HALL.z1], C.ceil);
  wallX(HALL.z1, HALL.x0, HALL.x1, [OBS.door, REC.door]);
  wallX(HALL.z0, HALL.x0, HALL.x1, [LOC.door]);
  wallZ(HALL.x0, HALL.z0, HALL.z1); wallZ(HALL.x1, HALL.z0, HALL.z1);
  for (const z of [HALL.z0 + WT / 2 + .01, HALL.z1 - WT / 2 - .01]) m.box(HALL.x0, HALL.x1, 0, .12, z - .012, z + .012, C.trim);      // 걸레받이
  m.box(HALL.x0, HALL.x1, .9, .96, HALL.z0 + WT / 2, HALL.z0 + WT / 2 + .05, C.metal, { s: .5 });                                   // 손잡이 난간
  // 서쪽 끝 — 나온 병실 문 (닫힘)
  m.box(.09, .13, 0, DH, -.55, .55, C.door, { s: .3 }); plate(UV.pCell, .14, 2.4, 0, .9, .34, 0);
  // 동쪽 끝 — 비상구
  plate(UV.pExit, HALL.x1 - .14, 2.42, 0, -1.0, .36, 0);
  m.box(HALL.x1 - .1, HALL.x1 - .085, 2.2, 2.62, -.55, .55, C.green, { e: 1 });
  m.box(HALL.x1 - .2, HALL.x1 - .1, 1.1, 1.5, .78, 1.05, C.dark); plate(UV.keypad, HALL.x1 - .205, 1.3, .915, -.25, .36, 0);
  // 문패 · 표지
  plate(UV.pObs, OBS.door, 2.42, HALL.z1 - WT / 2 - .012, .9, .32, -1); plate(UV.pRec, REC.door, 2.42, HALL.z1 - WT / 2 - .012, .9, .32, -1);
  plate(UV.pLoc, LOC.door, 2.42, HALL.z0 + WT / 2 + .012, .9, .32, 1); plate(UV.pB3, 2, 1.9, HALL.z0 + WT / 2 + .012, 1.0, .36, 1);
  // 기계실 — 잠긴 문 (장식)
  m.box(19 - DW / 2, 19 + DW / 2, 0, DH, HALL.z0 + WT / 2, HALL.z0 + WT / 2 + .05, C.door, { s: .3 }); plate(UV.pMech, 19, 2.42, HALL.z0 + WT / 2 + .06, .9, .32, 1);
  m.box(19 + .3, 19 + .38, 1.0, 1.08, HALL.z0 + WT / 2 + .05, HALL.z0 + WT / 2 + .12, C.metal, { s: .8 });
  // 자료 보관실 카드 단말
  m.box(REC.door + .75, REC.door + 1.0, 1.15, 1.5, HALL.z1 - WT / 2 - .07, HALL.z1 - WT / 2, C.dark); plate(UV.card, REC.door + .875, 1.325, HALL.z1 - WT / 2 - .075, .22, .3, -1);
  // 들것(시트 덮임) · 넘어진 카트 · 바닥의 끌린 자국
  { const gx = 12.6, gz = -.95; m.box(gx - .95, gx + .95, .7, .76, gz - .32, gz + .32, C.metal, { s: .5 }); m.rbox(gx - .9, gx + .9, .76, .93, gz - .3, gz + .3, C.sheet, .06);
    m.ellipsoid([gx - .1, .95, gz], [.62, 0, 0], [0, .13, 0], [0, 0, .24], C.sheet, 14, 8); m.ellipsoid([gx + .62, .97, gz], [.14, 0, 0], [0, .12, 0], [0, 0, .13], C.sheet, 10, 6);
    for (const [ax, az] of [[-.85, -.28], [.85, -.28], [-.85, .28], [.85, .28]]) m.cyl([gx + ax, 0, gz + az], [gx + ax, .7, gz + az], .02, .02, C.metal, 6, false, { s: .6 });
    S(gx - .95, gx + .95, gz - .34, gz + .34); }
  { const cx = 21.2, cz = .7; m.obox([cx, .28, cz], [.42, 0, .12], [0, .28, 0], [-.07, 0, .25], C.metal, { s: .5 }); S(cx - .45, cx + .45, cz - .3, cz + .3);
    for (let i = 0; i < 5; i++) m.quad([cx - 1.4 + i * .33, .006, cz - .9 + (i % 2) * .3], [cx - 1.2 + i * .33, .006, cz - .95 + (i % 2) * .3], [cx - 1.18 + i * .33, .006, cz - .68 + (i % 2) * .3], [cx - 1.38 + i * .33, .006, cz - .64 + (i % 2) * .3], C.paper); }
  for (let i = 0; i < 6; i++) { const x0 = 13.2 + i * .78, z = -.5 + i * .34; m.quad([x0, .004, z - .3], [x0 + 1.1, .004, z - .12], [x0 + 1.1, .004, z + .42], [x0, .004, z + .3], [1, 1, 1], { uv: UV.smear, m: 9 }); }
  // 천장 등 — 몇 개는 죽었고, 몇 개는 깜빡임
  const hallL = [lamp(2.5, 0, 1), lamp(6.5, 0, 1, .5), lamp(10.5, 0, 0), lamp(14.5, 0, 1, .9), lamp(18.5, 0, 0), lamp(22.5, 0, 1, .25)];
  const exitL = { p: [HALL.x1 - .6, 2.3, 0], c: [.08, .5, .22], on: 1, flick: 0, k: 1 }; lights.push(exitL);

  // ── 관찰실
  room(OBS, OBS.z1);
  const obsL = [lamp(6.5, 4.4, 1, .15, [.9, 1.0, 1.1])];
  { const z = OBS.z1 - WT / 2;                                                   // 뒷벽 — 책상 · 모니터 셋
    m.box(4, 9, .72, .78, z - .85, z - .02, C.desk, { s: .3 }); m.box(4.05, 4.13, 0, .72, z - .8, z - .1, C.trim); m.box(8.87, 8.95, 0, .72, z - .8, z - .1, C.trim); S(4, 9, z - .85, z);
    [[4.9, UV.cam], [6.5, UV.ecg], [8.1, UV.term]].forEach(([x, uv]) => { m.box(x - .42, x + .42, .98, 1.5, z - .2, z - .14, C.dark); m.quad([x + .38, 1.47, z - .201], [x - .38, 1.47, z - .201], [x - .38, 1.01, z - .201], [x + .38, 1.01, z - .201], [1, 1, 1], { uv, e: 1 });
      m.box(x - .05, x + .05, .78, .98, z - .19, z - .15, C.dark); });
    m.cyl([5.7, .78, z - .55], [5.7, .88, z - .55], .04, .045, hex('#c9c2b0'), 10, true);                                   // 식은 커피
    m.rbox(6.2, 6.75, .0, .46, z - 1.75, z - 1.25, C.dark, .04); m.box(6.2, 6.75, .46, .95, z - 1.3, z - 1.25, C.dark); S(6.15, 6.8, z - 1.8, z - 1.2);   // 의자
    lights.push({ p: [6.5, 1.3, z - .9], c: [.1, .5, .3], on: 1, flick: .1, k: 1 }); }
  // 화이트보드 (동쪽 벽) · 선반 (서쪽 벽)
  m.box(OBS.x1 - WT / 2 - .04, OBS.x1 - WT / 2, 1.0, 2.15, 3.2, 5.6, C.metal); m.quad([OBS.x1 - WT / 2 - .045, 2.1, 3.3], [OBS.x1 - WT / 2 - .045, 2.1, 5.5], [OBS.x1 - WT / 2 - .045, 1.05, 5.5], [OBS.x1 - WT / 2 - .045, 1.05, 3.3], [1, 1, 1], { uv: UV.board });
  m.box(OBS.x0 + WT / 2, OBS.x0 + WT / 2 + .4, 0, 1.9, 3.0, 5.2, C.desk); S(OBS.x0, OBS.x0 + .5, 3.0, 5.2);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) m.box(OBS.x0 + WT / 2 + .05, OBS.x0 + WT / 2 + .36, .12 + i * .46, .42 + i * .46, 3.08 + j * .42, 3.4 + j * .42, [(.25 + (i * 7 + j * 3) % 5 * .05), .26, .24]);

  // ── 탈의실
  room(LOC, LOC.z0);
  const locL = [lamp(10.5, -4.4, 1, .6, [.95, .95, .9])];
  { const z = LOC.z0 + WT / 2;                                                   // 뒷벽 — 사물함 여덟 (여섯째가 담당 연구원 것)
    for (let i = 0; i < 8; i++) { const x0 = 7.5 + i * .78, x1 = x0 + .74;
      if (i === 5) { m.box(x0, x1, 0, 2.0, z, z + .04, C.dark); m.box(x0, x0 + .03, 0, 2.0, z, z + .5, C.lockerD); m.box(x1 - .03, x1, 0, 2.0, z, z + .5, C.lockerD);
        m.box(x0, x1, 1.97, 2.0, z, z + .5, C.lockerD); m.box(x0, x1, 0, .06, z, z + .5, C.lockerD); }
      else m.box(x0, x1, 0, 2.0, z, z + .5, C.lockerD);
      if (i !== 5) m.box(x0 + .02, x1 - .02, .04, 1.96, z + .5, z + .52, C.locker, { s: .35 });
      if (i === 5) continue;                                                   // 그 사물함의 문은 따로 (열림)
      plate(UV['lk' + i], (x0 + x1) / 2, 1.72, z + .525, .5, .25, 1);
      for (let k = 0; k < 4; k++) m.box(x0 + .16, x1 - .16, 1.42 - k * .05, 1.44 - k * .05, z + .52, z + .525, C.dark);
      m.box(x1 - .12, x1 - .07, .95, 1.1, z + .52, z + .55, C.metal, { s: .8 }); }
    S(7.5, 13.75, z, z + .55);
    m.box(9, 12, .42, .48, -4.9, -4.45, C.wood); for (const x of [9.15, 11.85]) m.box(x - .04, x + .04, 0, .42, -4.86, -4.5, C.trim); S(9, 12, -4.92, -4.42);   // 긴 의자
    m.box(LOC.x1 - WT / 2 - .5, LOC.x1 - WT / 2, 0, .85, -6.6, -5.6, hex('#c9ced2'), { s: .5 }); S(LOC.x1 - .6, LOC.x1, -6.6, -5.6);                         // 세면대
    m.box(LOC.x1 - WT / 2 - .03, LOC.x1 - WT / 2, 1.1, 1.8, -6.5, -5.7, hex('#26323a'), { s: .95 }); }

  // ── 자료 보관실
  room(REC, REC.z1);
  const recL = [lamp(17.5, 4.6, 1, .35, [.6, .2, .2])];
  const pods = [];
  { const z = REC.z1 - WT / 2;                                                   // 뒷벽 — 배양조 여섯
    for (let i = 0; i < 6; i++) { const x = 14.1 + i * 1.5, pz = z - .7;
      m.cyl([x, 0, pz], [x, .3, pz], .5, .46, C.metal, 16, true, { s: .6 }); m.cyl([x, 2.25, pz], [x, 2.5, pz], .46, .5, C.metal, 16, true, { s: .6 });
      m.cyl([x, .3, pz], [x, 2.25, pz], .43, .43, i < 5 ? hex('#3a0d10') : hex('#0d2a26'), 18, false, { s: .95 });
      plate(UV['pod' + i], x, .16, pz - .51, .5, .22, -1);
      S(x - .5, x + .5, pz - .5, pz + .5); pods.push([x, pz, i]);
      lights.push({ p: [x, 1.3, pz - .75], c: i < 5 ? [.34, .03, .04] : [.03, .3, .22], on: 1, flick: i === 2 ? .7 : .05, k: 1 }); }
    for (const x0 of [13.3, 13.3]) { m.box(REC.x0 + WT / 2, REC.x0 + WT / 2 + .45, 0, 2.1, 2.2, 5.6, C.desk); S(REC.x0, REC.x0 + .55, 2.2, 5.6); }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) m.box(REC.x0 + WT / 2 + .06, REC.x0 + WT / 2 + .4, .1 + i * .5, .44 + i * .5, 2.3 + j * .41, 2.62 + j * .41, [.3 + (i + j) % 3 * .05, .24, .16]);
    m.box(19.6, 21.6, .72, .78, 2.4, 3.3, C.desk, { s: .3 }); m.box(19.65, 19.73, 0, .72, 2.45, 3.25, C.trim); m.box(21.47, 21.55, 0, .72, 2.45, 3.25, C.trim); S(19.6, 21.6, 2.4, 3.3);   // 책상
    m.box(20.9, 21.4, .78, 1.16, 3.05, 3.1, C.dark); m.quad([21.36, 1.13, 3.049], [20.94, 1.13, 3.049], [20.94, .81, 3.049], [21.36, .81, 3.049], [1, 1, 1], { uv: UV.term, e: 1 }); }
  return { mesh: m, solid, lights, hallL, obsL, locL, recL, exitL, pods };
}
/* 움직이는 것들 — 따로 그림 (자리 · 회전은 그릴 때) */
function buildDyn() {
  const P = {};
  const box = (fn) => { const m = new Mesh(); fn(m); return m; };
  P.recDoor = box(m => { m.box(-DW / 2, DW / 2, 0, DH, -.03, .03, C.door, { s: .35 }); m.box(-.3, .3, 1.3, 1.75, -.035, .035, C.glass, { s: .95 }); m.box(DW / 2 - .16, DW / 2 - .1, .95, 1.1, -.07, .07, C.metal, { s: .8 }); });
  P.exitDoor = box(m => { m.box(-.03, .03, 0, DH, -.55, .55, hex('#2c4a3a'), { s: .35 }); m.box(-.06, .06, 1.0, 1.06, -.45, .45, C.metal, { s: .8 }); });
  P.lockDoor = box(m => { m.box(.02, .72, .04, 1.96, 0, .02, C.locker, { s: .35 }); m.box(.62, .67, .95, 1.1, .02, .05, C.metal, { s: .8 }); for (let k = 0; k < 4; k++) m.box(.16, .58, 1.42 - k * .05, 1.44 - k * .05, .02, .025, C.dark); 
    m.quad([.12, 1.845, .026], [.62, 1.845, .026], [.62, 1.595, .026], [.12, 1.595, .026], [1, 1, 1], { uv: UV.lk5 }); m.box(.52, .7, 1.12, 1.36, .02, .06, C.dark); });
  P.flash = box(m => { m.cyl([-.09, 0, 0], [.05, 0, 0], .018, .018, hex('#22262b'), 10, true, { s: .6 }); m.cyl([.05, 0, 0], [.1, 0, 0], .018, .03, hex('#30363d'), 10, true, { s: .7 }); m.disc([.101, 0, 0], [1, 0, 0], .026, hex('#fff4d0'), 10, { e: 1 }); });
  P.card = box(m => { m.box(-.045, .045, 0, .004, -.03, .03, hex('#e2e6e9'), { s: .5 }); m.box(-.045, .045, .0041, .0045, .012, .03, C.teal); });
  P.note = box(m => { m.quad([-.11, .001, -.15], [.11, .001, -.15], [.11, .001, .15], [-.11, .001, .15], [1, 1, 1], { uv: UV.note }); });
  P.file = box(m => { m.box(-.12, .12, 0, .012, -.16, .16, hex('#8a6a3a')); m.quad([-.12, .0125, -.16], [.12, .0125, -.16], [.12, .0125, .16], [-.12, .0125, .16], [1, 1, 1], { uv: UV.file }); });
  P.suit = box(m => { m.box(-.3, .3, 1.86, 1.88, .22, .26, C.metal); m.ellipsoid([0, 1.35, .24], [.24, 0, 0], [0, .5, 0], [0, 0, .09], C.yellow, 12, 8); m.ellipsoid([0, 1.78, .24], [.13, 0, 0], [0, .15, 0], [0, 0, .09], C.yellow, 10, 6);
    m.ellipsoid([0, 1.76, .31], [.08, 0, 0], [0, .09, 0], [0, 0, .03], hex('#07090c'), 10, 6, { s: .95 }); m.box(-.2, .2, .1, .9, .2, .28, C.yellow); });
  P.fig = box(m => { m.quad([-.52, 1.94, 0], [.52, 1.94, 0], [.52, 0, 0], [-.52, 0, 0], [1, 1, 1], { uv: UV.fig, m: 9 }); });
  P.body = box(m => { for (let i = 0; i < 3; i++) m.ellipsoid([0, .9 + i * .42, 0], [.16 - i * .02, 0, 0], [0, .26, 0], [0, 0, .13], hex('#0a0606'), 10, 8); m.sphere([0, 2.0, 0], .12, hex('#0a0606'), 10); });
  return P;
}

/* ── 문서 ── */
const DOCS = {
  log: { title: '연구원 일지 — 5월 20일', body: [
    '141회차. 오늘도 「우물」 시나리오로 내려보냈다.',
    '07번은 꿈속에서 계속 날짜를 본다. 벽에, 낙서에, 돌에 — 5월 20일.',
    '처음 잠든 날을 기억하는 걸까. 지워도 지워도 그 날짜만 남는다.',
    '',
    '…나도 못 잊어서 사물함 번호를 그날로 바꿔 버렸다. 0 5 2 0.',
    '출입 카드는 방호복 주머니에 두고 다닐 것. 자료 보관실은 카드 없이는 못 연다.',
    '',
    '추신 — 관찰실 손전등 건전지 갈았음. 요즘 정전이 잦다.' ] },
  file: { title: '피험자 07 — 수면 유도 기록 (대외비)', body: [
    '입소 2145. 05. 20 · 세션 141회 · 각성 0회.',
    '01 ~ 05번 — 각성 실패, 폐기. 06번 — 보류.',
    '07번은 꿈을 「게임」으로 받아들인다. 그래서 가장 오래 버틴다.',
    '',
    '각성 시 절차 : 진정제 증량 → 실패하면 B동 봉쇄.',
    '비상구 개방 번호는 입소 연도 네 자리로 통일함 — 2 1 4 5.',
    '(봉쇄 중에는 경보와 함께 보안 요원이 자동 호출됨)',
    '',
    '— 맨 아래, 손글씨 —',
    '「이 아이를 내보내면 안 된다. 깨어 있는 건 142번째 꿈일지도 모르니까.」' ] }
};

const CSS = `
#p2{ position:fixed; inset:0; z-index:1500; background:#000; overflow:hidden; font-family:'DungGeunMo', ui-monospace, monospace; color:#e9eef2; user-select:none; -webkit-user-select:none; touch-action:none; }
#p2 canvas{ position:absolute; inset:0; width:100%; height:100%; display:block; }
#p2 .dot{ position:absolute; left:50%; top:50%; width:4px; height:4px; margin:-2px; border-radius:50%; background:rgba(233,238,242,.55); pointer-events:none; }
#p2 .prompt{ position:absolute; left:50%; top:58%; transform:translateX(-50%); padding:6px 14px; font-size:clamp(13px,1.5vw,19px); background:rgba(8,12,15,.72); border:1px solid rgba(125,227,200,.6); pointer-events:none; white-space:nowrap; }
#p2 .prompt b{ color:#7de3c8; font-weight:400; margin-right:.5em; }
#p2 .obj{ position:absolute; left:2.2vw; top:2.4vh; font-size:clamp(12px,1.25vw,17px); color:rgba(233,238,242,.75); letter-spacing:.04em; pointer-events:none; text-shadow:0 1px 3px #000; }
#p2 .obj small{ display:block; margin-bottom:4px; font-size:.72em; letter-spacing:.3em; color:rgba(125,227,200,.7); }
#p2 .inv{ position:absolute; right:2.2vw; top:2.4vh; display:flex; gap:8px; pointer-events:none; }
#p2 .inv span{ padding:5px 10px; font-size:clamp(11px,1.1vw,15px); border:1px solid rgba(233,238,242,.3); background:rgba(8,12,15,.6); }
#p2 .inv span.on{ border-color:#e3b23c; color:#e3b23c; }
#p2 .sub{ position:absolute; left:0; right:0; bottom:9vh; text-align:center; font-size:clamp(15px,1.9vw,26px); line-height:1.5; pointer-events:none; text-shadow:0 2px 6px #000, 0 0 2px #000; padding:0 6vw; }
#p2 .sub.pa{ color:#8fe8d8; letter-spacing:.06em; } #p2 .sub.doc{ color:#ffd0c8; } #p2 .sub.sys{ color:#ff6a5a; letter-spacing:.2em; }
#p2 .help{ position:absolute; left:0; right:0; bottom:2.2vh; text-align:center; font-size:clamp(10px,1vw,13px); color:rgba(233,238,242,.35); letter-spacing:.08em; pointer-events:none; }
#p2 .fade{ position:absolute; inset:0; background:#000; pointer-events:none; opacity:1; transition:opacity 1.2s; }
#p2 .modal{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.72); }
#p2 .modal.hidden{ display:none; }
#p2 .paper{ width:min(620px,86vw); max-height:84vh; overflow:auto; padding:34px 38px 26px; background:#d9d2bf; color:#26221c; box-shadow:0 20px 60px #000; transform:rotate(-.6deg); }
#p2 .paper h3{ margin:0 0 16px; font-weight:400; font-size:clamp(17px,2vw,24px); border-bottom:2px solid #26221c; padding-bottom:8px; }
#p2 .paper p{ margin:0 0 9px; font-size:clamp(14px,1.55vw,19px); line-height:1.65; min-height:.6em; }
#p2 .paper p.hl{ color:#8a1418; }
#p2 .paper .close{ margin-top:14px; font-size:13px; color:#6a6256; text-align:right; }
#p2 .pad{ padding:22px; background:#12161a; border:1px solid #39454f; box-shadow:0 20px 60px #000; text-align:center; }
#p2 .pad h4{ margin:0 0 10px; font-weight:400; font-size:15px; letter-spacing:.2em; color:#8fa3b0; }
#p2 .pad .disp{ margin:0 auto 14px; width:210px; padding:10px 0; font-size:34px; letter-spacing:.4em; text-indent:.4em; background:#04100c; color:#3cff86; border:1px solid #1f3a2c; }
#p2 .pad .disp.bad{ color:#ff5a4a; }
#p2 .pad .keys{ display:grid; grid-template-columns:repeat(3,64px); gap:8px; justify-content:center; }
#p2 .pad button{ margin:0; padding:0; height:52px; font-family:inherit; font-size:22px; font-weight:400; color:#e9eef2; background:#2a333b; border:1px solid #46525d; box-shadow:none; cursor:pointer; letter-spacing:0; }
#p2 .pad button:active{ background:#3f4b56; transform:none; }
#p2 .pad .tip{ margin-top:12px; font-size:12px; color:#6f7f8b; }
`;

class Part2 {
  constructor({ sfx, audio, onDone } = {}) {
    this.sfx = sfx || {}; this.audio = audio || (() => null); this.onDone = onDone || (() => {});
    this.running = false; this.paused = false; this.modalOpen = false; this.held = new Set();
    this.loop = this.loop.bind(this);
  }
  start() {
    // ── 화면
    if (!document.getElementById('p2-css')) { const st = document.createElement('style'); st.id = 'p2-css'; st.textContent = CSS; document.head.appendChild(st); }
    const root = this.root = document.createElement('div'); root.id = 'p2';
    root.innerHTML = `<canvas></canvas><div class="dot"></div><div class="obj"><small>OBJECTIVE</small><span></span></div><div class="inv"></div>
      <div class="prompt" style="display:none"></div><div class="sub"></div><div class="help"></div><div class="fade"></div>
      <div class="modal hidden" data-m="doc"><div class="paper"><h3></h3><div class="txt"></div><div class="close"></div></div></div>
      <div class="modal hidden" data-m="pad"><div class="pad"><h4></h4><div class="disp">----</div><div class="keys"></div><div class="tip">숫자 키 · ENTER 확인 · ESC 닫기</div></div></div>`;
    document.body.appendChild(root);
    const $ = s => root.querySelector(s);
    this.el = { cv: $('canvas'), obj: $('.obj span'), inv: $('.inv'), prompt: $('.prompt'), sub: $('.sub'), help: $('.help'), fade: $('.fade'), doc: $('[data-m=doc]'), pad: $('[data-m=pad]'), disp: $('.disp'), keys: $('.keys') };
    this.touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
    this.el.help.textContent = this.touch ? '왼쪽을 끌어 걷기 · 오른쪽을 끌어 둘러보기 · 톡 하면 조사' : 'WASD 걷기 · 마우스 둘러보기 · E 조사 · F 손전등 · ESC 일시정지';
    '123456789⌫0✓'.split('').forEach(k => { const b = document.createElement('button'); b.textContent = k; b.addEventListener('click', e => { e.stopPropagation(); this.padKey(k === '⌫' ? 'Backspace' : k === '✓' ? 'Enter' : k); }); this.el.keys.appendChild(b); });
    this.el.doc.addEventListener('click', () => this.closeModal());
    this.el.pad.addEventListener('click', e => { if (e.target === this.el.pad) this.closeModal(); });
    // ── WebGL
    const cv = this.el.cv, gl = this.gl = cv.getContext('webgl', { antialias: true, alpha: false }) || cv.getContext('experimental-webgl');
    if (!gl) { this.fail(); return false; }
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    try {
      const pr = this.pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    } catch (e) { this.fail(); return false; }
    gl.useProgram(this.pr);
    this.at = ['aP', 'aN', 'aC', 'aUV', 'aE'].map(n => gl.getAttribLocation(this.pr, n));
    this.un = {}; ['uVP', 'uOff', 'uRot', 'uEye', 'uL', 'uLC', 'uSpot', 'uSpotOn', 'uAmb', 'uTex', 'uTime', 'uRed', 'uFade', 'uRes'].forEach(n => this.un[n] = gl.getUniformLocation(this.pr, n));
    const atlas = this.atlas = paintAtlas(bakeFigure());
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const up = m => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW); return { b, n: m.v.length / 12 }; };
    const LV = this.lv = buildLevel(); this.world = up(LV.mesh);
    const D = buildDyn(); this.dyn = {}; for (const k in D) this.dyn[k] = up(D[k]);
    // ── 상태
    this.solid = LV.solid.slice();
    this.recBlock = { x0: REC.door - DW / 2, x1: REC.door + DW / 2, z0: HALL.z1 - .1, z1: HALL.z1 + .1 }; this.solid.push(this.recBlock);
    this.cam = { x: 1.3, y: 1.62, z: 0, yaw: 0, pitch: 0 };
    this.S = { light: false, lightOn: false, card: false, locker: false, rec: false, code: false, blackout: 0, exitTried: false, readLog: false, readFile: false, ending: 0 };
    this.t = 0; this.bob = 0; this.recSlide = 0; this.exitSlide = 0; this.lockSwing = 0; this.red = 0; this.fadeK = 0; this.hintT = 0; this.shake = 0; this.heartT = 0;
    this.fig = null; this.subs = []; this.events = {}; this.stepT = 0; this.look = [0, 0]; this.stick = [0, 0]; this.tch = {};
    this.items = this.makeItems();
    this.setObj('연구동을 살펴보자');
    this.inv();
    // ── 입력
    this.onKey = e => {
      if (!this.running || this.paused) return;
      if (this.modalOpen) { e.preventDefault(); if (this.modal === 'pad') this.padKey(e.key); else if (['Escape', 'Enter', ' ', 'e', 'E'].includes(e.key)) this.closeModal(); return; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { this.held.add(e.code); e.preventDefault(); }
      if (e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.interact(); }
      if (e.code === 'KeyF' && this.S.light) { this.S.lightOn = !this.S.lightOn; this.fx('beep', .03); }
    };
    this.onKeyUp = e => this.held.delete(e.code);
    this.onMove = e => { if (this.modalOpen || this.paused) return;
      if (document.pointerLockElement === cv) { this.look[0] += e.movementX || 0; this.look[1] += e.movementY || 0; }
      else if (this.drag && e.pointerType !== 'touch') { this.look[0] += (e.clientX - this.drag[0]) * 1.4; this.look[1] += (e.clientY - this.drag[1]) * 1.4; this.drag = [e.clientX, e.clientY]; } };
    this.onDown = e => { if (this.modalOpen || this.paused || e.pointerType === 'touch') return;
      if (document.pointerLockElement !== cv) { this.drag = [e.clientX, e.clientY]; try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (er) {} }
      else this.interact(); };
    this.onUp = () => { this.drag = null; };
    this.onBlur = () => { this.held.clear(); this.stick = [0, 0]; };
    this.onTS = e => { e.preventDefault(); for (const t of e.changedTouches) { const left = t.clientX < innerWidth * .45; this.tch[t.identifier] = { left, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t: performance.now(), moved: 0 }; } };
    this.onTM = e => { e.preventDefault(); for (const t of e.changedTouches) { const k = this.tch[t.identifier]; if (!k) continue;
      if (k.left) { this.stick = [clamp((t.clientX - k.x0) / 60, -1, 1), clamp((t.clientY - k.y0) / 60, -1, 1)]; } else { this.look[0] += (t.clientX - k.x) * 2.2; this.look[1] += (t.clientY - k.y) * 2.2; }
      k.moved += Math.abs(t.clientX - k.x) + Math.abs(t.clientY - k.y); k.x = t.clientX; k.y = t.clientY; } };
    this.onTE = e => { e.preventDefault(); for (const t of e.changedTouches) { const k = this.tch[t.identifier]; if (!k) continue; if (k.left) this.stick = [0, 0];
      if (k.moved < 14 && performance.now() - k.t < 350) { if (this.modalOpen) { if (this.modal === 'doc') this.closeModal(); } else this.interact(); } delete this.tch[t.identifier]; } };
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKeyUp); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); addEventListener('blur', this.onBlur);
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('touchstart', this.onTS, { passive: false }); cv.addEventListener('touchmove', this.onTM, { passive: false }); cv.addEventListener('touchend', this.onTE, { passive: false });
    // ── 소리 — 낮게 깔리는 웅웅거림
    this.hum();
    this.running = true; this.last = performance.now(); this.acc = 0;
    requestAnimationFrame(() => { this.el.fade.style.opacity = 0; });
    this.raf = requestAnimationFrame(this.loop);
    this.say('…복도다. 불이 반쯤 나갔네.', 'me', 200, 60);
    this.say('아무도 없어. 다들 어디 간 거야.', 'me', 200, 300);
    return true;
  }
  fail() { if (this.root) this.root.remove(); this.running = false; this.onDone('nogl'); }
  stop() {
    this.running = false; cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKeyUp); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('blur', this.onBlur);
    if (document.pointerLockElement === this.el.cv && document.exitPointerLock) document.exitPointerLock();
    try { if (this.humN) { this.humN.g.gain.value = 0; this.humN.o.stop(); this.humN.o2.stop(); } } catch (e) {}
    try { if (this.sfx.creepDrone) this.sfx.creepDrone(false); } catch (e) {}
    try { const ext = this.gl && this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {}
    if (this.root) this.root.remove();
  }
  unlock() { if (document.pointerLockElement === this.el.cv && document.exitPointerLock) document.exitPointerLock(); }
  fx(name, ...a) { try { if (this.sfx[name]) this.sfx[name](...a); } catch (e) {} }
  hum() {
    try { const ac = this.audio(); if (!ac) return; const g = ac.createGain(); g.gain.value = .0001; g.connect(ac.destination);
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 49; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140; o.connect(f); f.connect(g);
      const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = 73.6; const g2 = ac.createGain(); g2.gain.value = .5; o2.connect(g2); g2.connect(g);
      o.start(); o2.start(); g.gain.exponentialRampToValueAtTime(.05, ac.currentTime + 3); this.humN = { g, o, o2 }; } catch (e) {}
  }
  /* ── 글자 ── */
  say(txt, who = 'me', dur = 180, delay = 0) { this.subs.push({ txt, who, at: this.t + delay, end: this.t + delay + dur }); }
  setObj(s) { this.el.obj.textContent = s; this.hintT = 0; }
  inv() { const S = this.S; this.el.inv.innerHTML = [['손전등 (F)', S.light], ['출입 카드', S.card], ['비상구 번호', S.code]].map(([n, on]) => `<span class="${on ? 'on' : ''}">${on ? n : '— — —'}</span>`).join(''); }
  openDoc(id) {
    const d = DOCS[id]; this.modalOpen = true; this.modal = 'doc'; this.unlock(); this.held.clear();
    this.el.doc.querySelector('h3').textContent = d.title;
    this.el.doc.querySelector('.txt').innerHTML = d.body.map(l => `<p class="${/0 5 2 0|2 1 4 5/.test(l) ? 'hl' : ''}">${l}</p>`).join('');
    this.el.doc.querySelector('.close').textContent = this.touch ? '톡 하면 닫기' : 'E · ESC 닫기';
    this.el.doc.classList.remove('hidden'); this.fx('paper', true); this.docId = id;
  }
  openPad(id, title) { this.modalOpen = true; this.modal = 'pad'; this.padId = id; this.padV = ''; this.unlock(); this.held.clear(); this.el.pad.querySelector('h4').textContent = title; this.el.disp.textContent = '----'; this.el.disp.classList.remove('bad'); this.el.pad.classList.remove('hidden'); }
  padKey(k) {
    if (k === 'Escape') return this.closeModal();
    if (k === 'Backspace') this.padV = this.padV.slice(0, -1);
    else if (/^[0-9]$/.test(k) && this.padV.length < 4) { this.padV += k; this.fx('beep', .04); }
    else if (k !== 'Enter') return;
    this.el.disp.classList.remove('bad'); this.el.disp.textContent = (this.padV + '----').slice(0, 4);
    if (k === 'Enter' || this.padV.length === 4) {
      if (this.padV.length < 4) return;
      const ok = this.padV === (this.padId === 'locker' ? CODE_LOCKER : CODE_EXIT);
      if (!ok) { this.el.disp.classList.add('bad'); this.fx('static', .15, .6); this.padV = ''; setTimeout(() => { if (this.modal === 'pad') { this.el.disp.textContent = '----'; this.el.disp.classList.remove('bad'); } }, 500); return; }
      const id = this.padId; this.closeModal(); if (id === 'locker') this.openLocker(); else this.openExit();
    }
  }
  closeModal() {
    const id = this.modal === 'doc' ? this.docId : null;
    this.modalOpen = false; this.modal = null; this.el.doc.classList.add('hidden'); this.el.pad.classList.add('hidden');
    if (id === 'log' && !this.S.readLog) { this.S.readLog = true; this.say('사물함 번호가 0520… 그리고 카드는 방호복 주머니.', 'me', 220, 20); this.setObj('탈의실에서 담당 연구원의 사물함을 열자 (B-07)'); }
    if (id === 'file' && !this.S.readFile) { this.S.readFile = true; this.S.code = true; this.inv(); this.fx('keyGet'); this.say('2145. 비상구 번호다.', 'me', 170, 20); this.say('…142번째 꿈이라니. 무슨 소리야.', 'me', 200, 230); this.setObj('복도 동쪽 끝 — 비상구에 번호를 넣자');
      this.events.behind = this.t + 40; }
  }
  /* ── 조사할 것들 ── */
  makeItems() {
    const S = this.S, z = OBS.z1 - WT / 2, lz = LOC.z0 + WT / 2, lx = 7.5 + 5 * .78;
    return [
      { id: 'log', p: [7.3, .8, z - .5], label: '일지를 읽는다', on: () => true, act: () => this.openDoc('log') },
      { id: 'flash', p: [5.2, .82, z - .45], label: '손전등을 집는다', on: () => !S.light, act: () => { S.light = true; S.lightOn = true; this.inv(); this.fx('pickup'); this.say('손전등. 건전지는 새 거라고 했지.', 'me', 170); this.events.blackout = this.t + 150; } },
      { id: 'board', p: [OBS.x1 - .3, 1.55, 4.4], label: '화이트보드를 본다', on: () => true, act: () => { this.say('세션 일정… 5월 20일에 동그라미. 「그날. 잊지 말 것」', 'me', 230); } },
      { id: 'mon', p: [6.5, 1.25, z - .3], label: '화면을 본다', on: () => true, act: () => { this.say('CELL 07 — 신호 없음. 피험자 이탈… 나잖아.', 'me', 220); } },
      { id: 'locker', p: [lx + .37, 1.25, lz + .6], label: () => S.locker ? (S.card ? '빈 사물함' : '방호복 주머니를 뒤진다') : 'B-07 사물함 — 번호를 넣는다', on: () => !S.card,
        act: () => { if (!S.locker) this.openPad('locker', 'B-07 · 번호 네 자리'); else { S.card = true; this.inv(); this.fx('keyGet'); this.say('출입 카드. 자료 보관실을 열 수 있어.', 'me', 190); this.setObj('자료 보관실 — 카드로 문을 열자'); this.events.bang = this.t + 90; } } },
      { id: 'mirror', p: [LOC.x1 - .3, 1.45, -6.1], label: '거울을 본다', on: () => true, act: () => { this.say('…환자복. 손목에 07. 내 얼굴이 낯설어.', 'me', 220); if (!this.events.mirrorDone) { this.events.mirrorDone = 1; this.events.mirror = this.t + 120; } } },
      { id: 'rec', p: [REC.door + .875, 1.33, HALL.z1 - .3], label: () => S.card ? '카드를 댄다' : '카드 단말 — 잠겨 있다', on: () => !S.rec,
        act: () => { if (!S.card) { this.fx('static', .12, .5); this.say('카드가 있어야 열려.', 'me', 150); if (!S.readLog) this.setObj('관찰실부터 살펴보자'); } else { S.rec = true; this.fx('beep', .08); this.fx('door'); this.solid.splice(this.solid.indexOf(this.recBlock), 1); this.say('…열렸다.', 'me', 120, 30); } } },
      { id: 'file', p: [20.2, .8, 2.85], label: '「피험자 07」 파일을 읽는다', on: () => S.rec, act: () => this.openDoc('file') },
      { id: 'pod', p: [14.1 + 5 * 1.5, 1.4, REC.z1 - WT / 2 - 1.3], label: '06번 배양조를 본다', on: () => S.rec, act: () => { this.say('06 — 보류. …안에서 뭔가 움직였어.', 'me', 200); this.fx('landThump', .25); this.shake = 6; } },
      { id: 'pod1', p: [14.1 + 1.5, 1.4, REC.z1 - WT / 2 - 1.3], label: '배양조를 본다', on: () => S.rec, act: () => { this.say('01부터 05까지 전부 「폐기」. 나보다 먼저 온 애들.', 'me', 220); } },
      { id: 'gurney', p: [12.6, .95, -.95], label: '시트를 들춰 본다', on: () => !this.events.gurneyDone, act: () => { this.events.gurneyDone = 1; this.say('…비어 있어. 베개만 사람처럼 놓여 있네.', 'me', 200); this.fx('paper', false); } },
      { id: 'mech', p: [19, 1.1, HALL.z0 + .3], label: '기계실 — 잠겨 있다', on: () => true, act: () => { this.fx('static', .1, .4); this.say('잠겼어. 안에서 뭐가 윙윙거려.', 'me', 170); } },
      { id: 'cell', p: [.3, 1.2, 0], label: 'CELL 07 — 돌아간다?', on: () => true, act: () => { this.say('…다시 눕진 않을 거야.', 'me', 160); } },
      { id: 'exit', p: [HALL.x1 - .3, 1.3, .9], label: '비상구 — 번호를 넣는다', on: () => !S.ending,
        act: () => { if (!S.exitTried) { S.exitTried = true; if (!S.code) { this.say('번호 네 자리. 모르는데…', 'me', 160); if (!S.readLog) this.setObj('비상구 번호를 찾자 — 방들을 뒤져 보자'); } } this.openPad('exit', '비상구 · 개방 번호'); } }
    ];
  }
  interact() {
    if (this.S.ending || this.modalOpen) return;
    const it = this.target; if (!it) return;
    it.act();
  }
  openLocker() { this.S.locker = true; this.fx('door'); this.say('열렸다. …방호복이 걸려 있어.', 'me', 180, 20); this.shake = 3; }
  openExit() {
    const S = this.S; S.ending = 1; this.endT = this.t; this.fx('door'); this.el.prompt.style.display = 'none';
    this.say('열렸다—', 'me', 60, 10);
  }
  /* ── 한 틱 ── */
  update() {
    const S = this.S, c = this.cam, t = ++this.t, H = this.held, E = this.events, LV = this.lv;
    // 둘러보기
    c.yaw += this.look[0] * .0023; c.pitch = clamp(c.pitch - this.look[1] * .0023, -1.25, 1.25); this.look = [0, 0];
    if (H.has('ArrowLeft')) c.yaw -= .035; if (H.has('ArrowRight')) c.yaw += .035;
    // 걷기 — 벽 · 가구에 막힘
    let fw = (H.has('KeyW') || H.has('ArrowUp') ? 1 : 0) - (H.has('KeyS') || H.has('ArrowDown') ? 1 : 0) - this.stick[1], st = (H.has('KeyD') ? 1 : 0) - (H.has('KeyA') ? 1 : 0) + this.stick[0];
    if (this.modalOpen || S.ending > 1) fw = st = 0;
    const l = Math.hypot(fw, st), sp = (H.has('ShiftLeft') || H.has('ShiftRight') ? .052 : .034) * (S.ending ? 1.25 : 1);
    if (l > .05) {
      fw /= Math.max(1, l); st /= Math.max(1, l);
      const dx = (Math.cos(c.yaw) * fw - Math.sin(c.yaw) * st) * sp, dz = (Math.sin(c.yaw) * fw + Math.cos(c.yaw) * st) * sp;
      if (!this.hit(c.x + dx, c.z)) c.x += dx; if (!this.hit(c.x, c.z + dz)) c.z += dz;
      this.bob += sp * 3.1; if ((this.stepT += sp) > .62) { this.stepT = 0; this.fx('step'); }
    }
    c.y = 1.62 + Math.sin(this.bob * 2) * .022 + Math.sin(t * .03) * .004;
    this.shake *= .9;
    // 문 · 사물함
    if (S.rec) this.recSlide = Math.min(1, this.recSlide + .025);
    if (S.locker) this.lockSwing = Math.min(1, this.lockSwing + .05);
    // 불 — 깜빡임, 정전
    for (const L of LV.lights) { if (!L.flick) { L.k = 1; continue; } const n = Math.sin(t * .37 + L.p[0] * 3.1) + Math.sin(t * .113 + L.p[2]); L.k = (n > 1.9 - L.flick * 1.4 && (t >> 1) % 3) ? .12 : 1; }
    if (E.blackout && t === E.blackout) { S.blackout = 1; this.fx('landThump', .5); this.fx('static', .5, 1); this.shake = 8; this.say('…정전?', 'me', 130, 30);
      this.say('B동 3층 주 전원 차단. 피험자 07, 병실로 돌아가십시오.', 'pa', 300, 170); this.fx('creepDrone', true); if (!S.readLog) this.setObj('관찰실 책상의 일지를 읽어 보자'); E.far = t + 420; }
    if (S.blackout) { for (const L of [...LV.hallL, ...LV.obsL, ...LV.locL]) L.on = Math.max(0, L.on - .04); }
    // 스쳐 가는 그림자들
    if (E.far && t >= E.far && !E.farDone && Math.abs(c.z) < 1.4 && Math.cos(c.yaw) > .5 && c.x < 17) { E.farDone = 1; this.fig = { x: Math.min(HALL.x1 - 1.5, c.x + 11), z: 0, until: t + 34, lit: 1 }; this.fx('glitch', .7); this.fx('heartMuffled', .3); this.say('…방금, 저기 누가 서 있었어.', 'me', 180, 50); }
    if (E.bang && t === E.bang) { this.fx('landThump', .7); this.shake = 9; this.say('…복도에서 난 소리야.', 'me', 150, 30); this.say('보안 요원, B동 3층 도착. 수색을 시작합니다.', 'pa', 280, 200); E.cart = 1; }
    if (E.mirror && t === E.mirror) { this.fig = { x: 10.5, z: -2.6, until: t + 26, lit: 1 }; this.fx('glitch', .5); }
    if (E.behind && t >= E.behind && !E.behindDone) {                          // 파일을 읽고 돌아서면 — 문간에 서 있다
      if (!E.behindSet) { E.behindSet = 1; this.fig = { x: REC.door, z: HALL.z1 + .5, until: t + 9999, lit: 1 }; }
      const d = norm([REC.door - c.x, 0, HALL.z1 + .5 - c.z]);
      if (d[0] * Math.cos(c.yaw) + d[2] * Math.sin(c.yaw) > .82) { E.behindDone = 1; this.fig.until = t + 16; this.fx('glitch', 1); this.fx('landThump', .6); this.fx('heartMuffled', .35); this.shake = 12; this.say('!!', 'me', 50); this.say('…갔어. 빨리 나가야 해.', 'me', 170, 90); }
    }
    if (this.fig && t > this.fig.until) this.fig = null;
    // 정전 뒤 — 심장 소리, 멀리서 발소리
    if (S.blackout && (this.heartT -= 1) < 0) { this.heartT = this.fig ? 34 : 95; this.fx('heartMuffled', this.fig ? .28 : .1); }
    if (S.blackout && t % 530 === 200) this.fx('step'); if (S.blackout && t % 530 === 222) this.fx('step');
    // 방에 처음 들어설 때
    const inR = (R, pad = 0) => c.x > R.x0 && c.x < R.x1 && Math.abs(c.z) > 1.6 + pad && (R.z1 > 2 ? c.z > 0 : c.z < 0);
    if (!E.obsIn && inR(OBS)) { E.obsIn = 1; this.say('관찰실. 여기서 날 지켜봤구나.', 'me', 190); this.setObj('관찰실을 뒤져 보자'); }
    if (!E.locIn && inR(LOC)) { E.locIn = 1; this.say('탈의실… 사물함마다 이름표가 있어.', 'me', 190); }
    if (!E.recIn && inR(REC)) { E.recIn = 1; this.fx('creepDrone', true); this.say('…이 통들, 전부 사람 크기야.', 'me', 200, 40); this.setObj('책상 위의 파일을 찾자'); }
    // 막혔을 때 혼잣말 힌트
    if (++this.hintT > 4200 && !this.modalOpen && !S.ending) { this.hintT = 0;
      this.say(!S.readLog ? '관찰실 책상에 뭔가 있었던 것 같은데.' : !S.card ? '사물함 B-07, 번호는 0520.' : !S.rec ? '자료 보관실 — 문 옆 단말에 카드를 대자.' : !S.code ? '보관실 책상 위에 파일이 있었어.' : '복도 동쪽 끝, 비상구. 2145.', 'me', 220); }
    // 조사 대상 — 가까이 · 보는 쪽
    const f = [Math.cos(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.sin(c.yaw) * Math.cos(c.pitch)];
    let best = null, bd = .9;
    if (!this.modalOpen && !S.ending) for (const it of this.items) { if (!it.on()) continue; const v = sub(it.p, [c.x, c.y, c.z]), d = Math.hypot(...v); if (d > 2.0) continue; const k = dot(v, f) / d; if (k > bd) { bd = k; best = it; } }
    if (best !== this.target || t % 30 === 0) { this.target = best; const p = this.el.prompt; if (best) { p.style.display = ''; p.innerHTML = `<b>${this.touch ? '톡' : 'E'}</b>${typeof best.label === 'function' ? best.label() : best.label}`; } else p.style.display = 'none'; }
    // 끝 — 문이 열리고, 경보, 뒤에서
    if (S.ending) { const e = t - this.endT; this.exitSlide = Math.min(1, this.exitSlide + .02);
      if (e === 40) { this.red = 1; this.fx('alarm', true); this.shake = 10; this.say('B동 봉쇄. B동 봉쇄.', 'sys', 200); for (const L of LV.lights) L.on = 0; }
      if (e === 110) { this.fig = { x: Math.max(1.5, c.x - 14), z: 0, until: t + 9999, lit: 1, run: 1 }; this.say('어디 가요, 07.', 'doc', 150); this.fx('glitch', 1); }
      if (this.fig && this.fig.run) this.fig.x += .09;
      if (e === 200) { S.ending = 2; this.el.fade.style.transition = 'opacity .7s'; this.el.fade.style.opacity = 1; }
      if (e === 250) { this.stop(); this.onDone('exit'); return; }
    }
    // 자막
    const now = this.subs.filter(s => t >= s.at && t < s.end).pop(); this.subs = this.subs.filter(s => t < s.end);
    const key = now ? now.txt : ''; if (key !== this._subK) { this._subK = key; this.el.sub.textContent = key; this.el.sub.className = 'sub ' + (now ? now.who : ''); }
  }
  hit(x, z) { const r = .27; for (const b of this.solid) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    if (!this.S.ending && x > HALL.x1 - .5) return true; if (this.S.ending && x > HALL.x1 - .45 && Math.abs(z) > .5) return true; return x > HALL.x1 + .6; }
  /* ── 그리기 ── */
  drawBuf(buf, off = [0, 0, 0], rot = 0) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    const sz = [3, 3, 3, 2, 1]; let o = 0; this.at.forEach((a, i) => { if (a >= 0) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, sz[i], gl.FLOAT, false, 48, o * 4); } o += sz[i]; });
    gl.uniform3fv(this.un.uOff, off); gl.uniform1f(this.un.uRot, rot); gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }
  draw() {
    const gl = this.gl, cv = this.el.cv, un = this.un, c = this.cam, S = this.S, LV = this.lv;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.useProgram(this.pr);
    const sh = this.shake > .3 ? [(Math.random() - .5) * this.shake * .003, (Math.random() - .5) * this.shake * .003] : [0, 0];
    const yaw = c.yaw + sh[0], pitch = c.pitch + sh[1];
    const f = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)], eye = [c.x, c.y, c.z];
    const VP = mmul(perspective(1.15, w / h, .05, 60), lookAt(eye, add(eye, f), [0, 1, 0]));
    gl.uniformMatrix4fv(un.uVP, false, new Float32Array(VP)); gl.uniform3fv(un.uEye, eye);
    // 가까운 불 여덟
    const Ls = LV.lights.filter(L => L.on > .01).map(L => ({ L, d: (L.p[0] - c.x) ** 2 + (L.p[2] - c.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 8);
    const lp = new Float32Array(24), lc = new Float32Array(24);
    Ls.forEach(({ L }, i) => { lp.set(L.p, i * 3); const k = L.on * L.k * 1.5; lc.set([L.c[0] * k, L.c[1] * k, L.c[2] * k], i * 3); });
    gl.uniform3fv(un.uL, lp); gl.uniform3fv(un.uLC, lc);
    gl.uniform3fv(un.uSpot, f); gl.uniform1f(un.uSpotOn, S.light && S.lightOn ? (.92 + .08 * Math.sin(this.t * .9)) * ((this.fig && !this.fig.run && this.t % 7 < 2) ? .25 : 1) : 0);
    const amb = S.blackout ? .012 : .05; gl.uniform3fv(un.uAmb, [amb, amb * 1.08, amb * 1.2]);
    gl.uniform1f(un.uTime, this.t / 60); gl.uniform1f(un.uRed, this.red); gl.uniform1f(un.uFade, 1); gl.uniform2f(un.uRes, w, h); gl.uniform1i(un.uTex, 0);
    this.drawBuf(this.world);
    const D = this.dyn, z = OBS.z1 - WT / 2, lz = LOC.z0 + WT / 2, lx = 7.5 + 5 * .78;
    this.drawBuf(D.recDoor, [REC.door + this.recSlide * (DW + .02), 0, HALL.z1]);
    this.drawBuf(D.exitDoor, [HALL.x1 - .12, 0, -this.exitSlide * 1.05]);
    this.drawBuf(D.lockDoor, [lx, 0, lz + .5], this.lockSwing * 1.9);
    if (S.locker) this.drawBuf(D.suit, [lx + .37, 0, lz]);
    if (!S.light) this.drawBuf(D.flash, [5.2, .8, z - .45], .5);
    this.drawBuf(D.note, [7.3, .781, z - .5], .25);
    if (S.locker && !S.card) this.drawBuf(D.card, [lx + .37, .5, lz + .3]);
    this.drawBuf(D.file, [20.2, .781, 2.85], -.2);
    for (const [px, pz, i] of LV.pods) this.drawBuf(D.body, [px, .1 + Math.sin(this.t * .012 + i) * .04, pz], i + Math.sin(this.t * .006 + i * 2) * .3);
    if (this.fig) this.drawBuf(D.fig, [this.fig.x, 0, this.fig.z], Math.atan2(c.x - this.fig.x, c.z - this.fig.z) * -1);
  }
  loop(now) {
    if (!this.running) return;
    if (this.paused) { this.last = now; this.raf = requestAnimationFrame(this.loop); return; }
    this.acc += Math.min(100, now - this.last); this.last = now;
    while (this.acc >= 1000 / 60 && this.running) { this.update(); this.acc -= 1000 / 60; }
    if (!this.running) return;
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }
}
window.Part2 = Part2;
})();
