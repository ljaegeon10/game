/* ═══════════════════════════════════════════════════════════
   game.js — 우물 아래 / The Well Below
   ═══════════════════════════════════════════════════════════ */
(() => {
'use strict';

const VW = 576, VH = 324, TS = 32;   // 화면 (16:9)
/* 지금 방의 크기. 보통은 화면과 같고, 보스방(심층)만 더 넓습니다 — rooms.js 의 size.
   방이 화면보다 넓으면 카메라(CAM)가 주인공을 따라 움직입니다. */
let W = VW, H = VH;
/* 화면 비율 맞춤 — 창이 16:9 ~ 16:10 이면 화면(캔버스) 세로를 SH 로 늘려 꽉 채웁니다 (fit).
   방은 그대로 576×324 — 위아래로 OY 만큼 늘어난 띠에는 방 바닥 · 벽을 거울처럼 이어 그리고,
   컷신(1인칭 · 추락 등)은 16:9 그림을 살짝 키워 좌우만 조금 잘라 꽉 채웁니다 (baseXf) */
let SH = VH, OY = 0;
let BK = 1, BX = 0, BY = 0;                       // 지금 그리는 장의 기본 변환 (배율 · 밀기) — SR 과 함께
const baseXf = () => g.setTransform(SR * BK, 0, 0, SR * BK, SR * BX, SR * BY);
const CAM = { x: 0, y: 0 };
let cv = document.getElementById('game');
let g  = cv.getContext('2d');
g.imageSmoothingEnabled = false;
/* 고해상도 화면 — 오프닝은 3배 해상도 캔버스(#gamehi)에 그립니다. 그리는 코드는 그대로
   (576×324 좌표), cv · g 만 잠깐 바꿔 끼우고 기본 변환을 SR 배로 둡니다. 그 밖엔 늘 SR = 1 */
const cvMain = cv, gMain = g, HI_R = 3;
let SR = 1, cvHi = null, gHi = null;

const $ = id => document.getElementById(id);
const stage = $('stage');

/* 방향 상수 */
const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
const OPP  = { N: 'S', S: 'N', W: 'E', E: 'W' };

/* ── 화면 정수배 확대 ───────────────────────────────────── */
/* 실제로 보이는 넓이 — 휴대폰은 주소창 · 도구 막대가 나오고 들어갈 때 visualViewport 가 더 정확함 */
const viewW = () => Math.round((window.visualViewport && visualViewport.width) || window.innerWidth);
const viewH = () => Math.round((window.visualViewport && visualViewport.height) || window.innerHeight);
function fit() {
  // 창을 꽉 채웁니다 — 정수배가 아니어도 (테두리 없이 화면 끝까지).
  // 세로는 창 비율을 따라 16:9(324) ~ 16:10(360) 사이로 늘리고, 그보다 더 길쭉한 창만 남는 쪽이 검은 띠
  const sh = Math.round(Math.max(VH, Math.min(VW * 10 / 16, VW * viewH() / viewW())));
  if (sh !== SH) {
    SH = sh; OY = (SH - VH) / 2;
    stage.style.height = SH + 'px';
    cvMain.height = SH; cvMain.style.height = SH + 'px'; gMain.imageSmoothingEnabled = false;
    if (cvHi) { cvHi.height = SH * HI_R; cvHi.style.height = SH + 'px'; }
  }
  if (window.TitleScreen && TitleScreen.resize) TitleScreen.resize(1920 * SH / VW);
  const n = Math.max(.4, Math.min(viewW() / VW, viewH() / SH));
  stage.style.setProperty('--scale', `scale(${n})`);
  stage.style.transform = `scale(${n})`;
  stage.style.margin = `${(n - 1) * SH / 2}px ${(n - 1) * VW / 2}px`;
}
window.addEventListener('resize', fit);
document.body.classList.add('tfill');               // 늘 창 가득 — 브라운관 테두리 · 아래 안내 줄 없이 (css)
if (window.visualViewport) visualViewport.addEventListener('resize', fit);   // 주소창이 접히거나 펴질 때
addEventListener('orientationchange', () => setTimeout(fit, 250));
addEventListener('fullscreenchange', () => setTimeout(fit, 60));
addEventListener('webkitfullscreenchange', () => setTimeout(fit, 60));

/* ── 입력 ───────────────────────────────────────────────── */
/* 아티팩트(iframe)처럼 페이지가 삽입되어 있는 경우, 로드 직후엔 이 문서에
   키보드 포커스가 가 있지 않아 스페이스/방향키가 아예 씹힐 수 있습니다.
   그래서 로드되자마자 한 번, 그리고 어디를 클릭하든 매번 이 문서로
   포커스를 되돌려 둡니다. */
try { window.focus(); } catch (e) {}
document.body.tabIndex = -1;
document.body.style.outline = 'none';
const reclaimFocus = () => { try { window.focus(); document.body.focus({ preventScroll: true }); } catch (e) {} };
addEventListener('pointerdown', reclaimFocus, { capture: true });
addEventListener('load', reclaimFocus);
/* 아이패드 · 휴대폰에서 길게 누르거나 끌 때 뜨는 선택 · 복사 메뉴, 이미지 끌어가기, 오른쪽 클릭 메뉴를 막습니다
   (CSS 의 user-select · touch-callout 만으로는 iPadOS Safari 가 가끔 선택 영역을 띄워서 이벤트에서도 한 번 더) */
const notField = e => !(e.target && e.target.closest && e.target.closest('input, textarea'));
['contextmenu', 'selectstart', 'dragstart'].forEach(n => addEventListener(n, e => { if (notField(e)) e.preventDefault(); }, { capture: true }));
addEventListener('gesturestart', e => e.preventDefault());           // 두 손가락 확대로 화면이 흐려지며 커지는 것도

const key = {};
const AIM = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
let mouse = { x: 0, y: 0, down: false };

addEventListener('keydown', e => {
  if (!notField(e)) return;                         // 이름 · 연락처를 적는 중 — 게임 단축키로 쓰지 않음 (축제판 참가 등록)
  if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  // 같은 자리(물리 키)를 누를 때와 뗄 때 글자가 다를 수 있음 — Shift · Caps Lock · 한/영 전환(w → W · ㅈ).
  // 그래서 "이 키 자리로 누른 글자"를 기억해 두었다가 뗄 때 그 글자를 놓습니다 (예전엔 여기서 키가 눌린 채로 굳었음)
  if (keyOfCode[e.code] && keyOfCode[e.code] !== e.key) key[keyOfCode[e.code]] = false;
  if (e.code) { keyOfCode[e.code] = e.key; codeDown[e.code] = true; }
  key[e.key] = true;
  const k = e.key.toLowerCase();
  konamiKey(e.code);
  if (G.dev) {                                      // 개발자 모드 단축키
    if (e.code === 'Backquote') { devReturn(); return; }
    if (k === 'k' && G.mode === 'play') { devKillAll(); return; }
  }
  if (k === ' ') onConfirm();
  if (k === 'r' && G.mode === 'dead') retry();
  if (k === 'n' && G.mode === 'dead' && !$('fest-next').classList.contains('hidden')) nextPlayer();
  if ((k === 'r' || k === 'enter') && $('endcard').classList.contains('on')) restartFromEnd();   // 엔드 카드 — 처음부터 다시
  if (G.mode === 'title' && $('devpanel').classList.contains('hidden')) {       // 시작 화면 메뉴
    if (k === 'arrowup' || k === 'w') menuMove(-1);
    if (k === 'arrowdown' || k === 's') menuMove(1);
    if (k === 'enter') menuGo();
  }
  if (G.mode === 'modesel') {                       // 모드 선택은 1 / 2 로도 고를 수 있습니다
    if (k === '1') startTimeAttack();
    if (k === '2') openDiffSelect();
    if (k === 'escape' || k === 'backspace') closeModeSelect();
  }
  else if (G.mode === 'diffsel') {                  // 난이도는 1 / 2 / 3
    if (k === '1') startGame(false, 'easy');
    if (k === '2') startGame(false, 'normal');
    if (k === '3') startGame(false, 'hard');
    if (k === 'escape' || k === 'backspace') closeDiffSelect();
  }
});
addEventListener('keyup', e => {
  key[e.key] = false;
  if (keyOfCode[e.code]) key[keyOfCode[e.code]] = false;
  delete keyOfCode[e.code]; codeDown[e.code] = false;
});
/* 창을 벗어나면(알트탭 · 다른 창 클릭 · 탭 전환) 그 사이 뗀 키는 keyup 이 안 옴 — 전부 놓은 걸로 */
const keyOfCode = {}, codeDown = {};
function releaseAll() {
  for (const k in key) key[k] = false;
  for (const c in codeDown) codeDown[c] = false;
  for (const c in keyOfCode) delete keyOfCode[c];
  mouse.down = false;
}
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
addEventListener('contextmenu', releaseAll);
/* 화면을 누르고 있는지 — 컷신 "길게 눌러 건너뛰기" (터치 · 마우스) */
let ptrHeld = false;
addEventListener('pointerdown', () => { ptrHeld = true; });
['pointerup', 'pointercancel', 'blur'].forEach(n => addEventListener(n, () => { ptrHeld = false; }));
const skipHeld = () => !!(key[' '] || key.Enter || key.Escape || ptrHeld);
cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width * VW;     // 화면 좌표 — 쏠 때 카메라만큼 더합니다
  mouse.y = (e.clientY - r.top)  / r.height * SH - OY;   // 늘어난 띠만큼 빼서 방 화면 좌표로
});
cv.addEventListener('mousedown', e => { e.preventDefault(); if (performance.now() - TOUCH.last < 800) return; mouse.down = true; Sfx.unlock(); });

/* ═══════════ 휴대폰 · 태블릿 — 조이스틱 + 적을 누르고 있어 공격 ═══════════════
   손가락이 한 번 닿으면 터치 모드가 켜집니다 (화면을 꽉 채우고, 조작 버튼이 나옴).
   · 적 · 보스 · 항아리를 누르고 있으면 → 그것을 따라가며 계속 쏨 (떼면 멈춤, 쓰러지면 손가락 근처의 다음 것)
   · 화면 왼쪽 절반의 빈 곳을 누르고 끌면 → 그 자리에 조이스틱이 생겨 이동
   · 오른쪽 절반의 빈 곳을 누르고 있으면 → 손가락 쪽으로 쏨 (숲에선 어디든 조이스틱)
   · 오른쪽 아래 [조사] = SPACE, 대화 · 쪽지는 화면 아무 데나 톡 */
const TOUCH = { on: false, last: 0, joy: null, aim: null };
const JOY_R = 46;                                       // 조이스틱이 움직이는 반지름 (CSS 픽셀)
const tEl = {};
function touchSetup() {
  if (TOUCH.on) return;
  TOUCH.on = true;
  document.body.classList.add('touch');
  const mk = (id, html) => { const d = document.createElement('div'); d.id = id; if (html) d.innerHTML = html; document.body.appendChild(d); return d; };
  tEl.joy = mk('tjoy', '<i></i>'); tEl.knob = tEl.joy.firstChild;
  tEl.btn = mk('tbtn', '<b>조사</b>');
  tEl.rot = mk('trot', '화면을 가로로 돌리면 더 크게 보여요');
  tEl.btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sfx.unlock(); onConfirm(); });
  const pb = $('prompt').querySelector('b'); if (pb) pb.textContent = '조사';
  // 전체 화면 — 주소창 · 도구 막대 없이 (안드로이드 · 아이패드). 손가락을 뗄 때 한 번 저절로, 나간 뒤엔 ⛶ 버튼으로
  if (FS.can()) {
    tEl.fs = mk('tfs', '⛶'); tEl.fs.title = '전체 화면';
    tEl.fs.addEventListener('pointerup', e => { e.preventDefault(); e.stopPropagation(); FS.go(); });
    tEl.fs.addEventListener('pointerdown', e => e.stopPropagation());
  } else if (!FS.standalone()) setTimeout(fsTip, 1200);   // 아이폰 — 사파리는 전체 화면이 없어서 '도구 막대 가리기' 안내
  fit();
}
const FS = {
  el: document.documentElement,
  can() { return !!(this.el.requestFullscreen || this.el.webkitRequestFullscreen); },
  on() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  standalone() { return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true; },
  asked: false,
  go() {
    if (this.on() || !this.can()) return;
    try {
      const p = this.el.requestFullscreen ? this.el.requestFullscreen({ navigationUI: 'hide' }) : this.el.webkitRequestFullscreen();
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
    } catch (e) {}
  }
};
// 손가락을 뗄 때(브라우저가 전체 화면을 허락하는 순간) 처음 한 번 저절로 — 입력칸을 누를 땐 키보드 때문에 건너뜀
addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch' || !TOUCH.on || FS.asked || FS.on()) return;
  if (e.target.closest && e.target.closest('input, textarea, label')) return;
  FS.asked = true; FS.go();
}, true);
/* 아이폰 사파리 — 주소창을 숨기는 법을 한 번만 알려 줌 */
function fsTip() {
  if (FS.on() || FS.standalone()) return;
  let seen = false; try { seen = sessionStorage.getItem('wellbelow.fstip') === '1'; sessionStorage.setItem('wellbelow.fstip', '1'); } catch (e) {}
  if (seen) return;
  const d = document.createElement('div'); d.id = 'tfstip';
  d.innerHTML = '화면이 작으면 — 주소창의 <b>가가</b>(aA) → <b>도구 막대 가리기</b><br><small>또는 공유 → 홈 화면에 추가 하면 전체 화면으로</small>';
  d.addEventListener('pointerdown', e => { e.stopPropagation(); d.remove(); });
  document.body.appendChild(d);
  setTimeout(() => d.classList.add('out'), 7000); setTimeout(() => d.remove(), 7600);
}
/* 손가락 → 게임 화면 좌표 (카메라를 더하면 방 좌표) */
function touchPos(e) {
  const r = cv.getBoundingClientRect();
  return { sx: (e.clientX - r.left) / r.width * VW, sy: (e.clientY - r.top) / r.height * SH - OY };
}
/* 손가락 근처의 쏠 것 — 적 · 보스 · 항아리 중 가장 가까운 것 (손가락은 굵으니 넉넉하게) */
function touchPick(wx, wy, pad) {
  let best = null, bd = Infinity;
  const look = (o, r) => { const d = Math.hypot(o.x - wx, o.y - wy) - r; if (d < pad && d < bd) { bd = d; best = o; } };
  G.foes.forEach(f => { if (!f.dead && !f.warp) look(f, f.r || 10); });
  if (G.boss) look(G.boss, G.boss.r || 30);
  G.pots.forEach(p => look(p, 9));
  return best;
}
const touchAlive = t => t && (G.foes.includes(t) ? !t.dead : G.boss === t || G.pots.includes(t));
/* 이번 프레임에 쏠 곳 (방 좌표) — 없으면 null */
function touchAimAt() {
  const a = TOUCH.aim; if (!a) return null;
  const wx = a.sx + CAM.x, wy = a.sy + CAM.y;
  if (a.t && !touchAlive(a.t)) a.t = touchPick(wx, wy, 34);            // 쓰러졌으면 손가락 근처의 다음 것
  return a.t ? { x: a.t.x, y: a.t.y } : { x: wx, y: wy };
}
const touchPlayMode = () => G.mode === 'play' || G.mode === 'forest';
// 휴대폰 · 태블릿이면 처음부터 — 첫 톡에서 켜면 화면이 그 순간 바뀌어 누른 버튼이 빗나가기 때문
if (matchMedia('(hover: none) and (pointer: coarse)').matches) addEventListener('DOMContentLoaded', touchSetup);
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  TOUCH.last = performance.now();
  if (!TOUCH.on) { setTimeout(touchSetup, 400); return; }   // 터치 화면 노트북 등 — 이 톡이 끝난 뒤에 켬
  if (e.target.closest && e.target.closest('button, input, label, a, select, textarea, #fest-board, #fest-entry, #tbtn')) return;
  if (G.mode === 'talk' || G.mode === 'note' || G.mode === 'doc') { e.preventDefault(); onConfirm(); return; }
  if (!touchPlayMode()) return;
  e.preventDefault();                                   // 뒤따르는 마우스 흉내(mousedown) 막기 — 엉뚱한 곳으로 한 발 나가지 않게
  const p = touchPos(e), left = e.clientX < innerWidth / 2;
  const t = G.inForest ? null : touchPick(p.sx + CAM.x, p.sy + CAM.y, 16);
  if (t && !TOUCH.aim) { TOUCH.aim = { id: e.pointerId, t, sx: p.sx, sy: p.sy }; return; }
  if ((left || G.inForest) && !TOUCH.joy) {
    TOUCH.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
    tEl.joy.style.left = e.clientX + 'px'; tEl.joy.style.top = e.clientY + 'px';
    tEl.joy.classList.add('on'); tEl.knob.style.transform = '';
    return;
  }
  if (!G.inForest && !TOUCH.aim) TOUCH.aim = { id: e.pointerId, t: null, sx: p.sx, sy: p.sy };   // 빈 곳 — 손가락 쪽으로
}, { passive: false });
addEventListener('pointermove', e => {
  if (e.pointerType !== 'touch') return;
  const j = TOUCH.joy, a = TOUCH.aim;
  if (j && e.pointerId === j.id) {
    let dx = e.clientX - j.x0, dy = e.clientY - j.y0;
    const l = Math.hypot(dx, dy); if (l > JOY_R) { dx *= JOY_R / l; dy *= JOY_R / l; }
    j.dx = dx; j.dy = dy; tEl.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  if (a && e.pointerId === a.id) { const p = touchPos(e); a.sx = p.sx; a.sy = p.sy; }
}, { passive: true });
['pointerup', 'pointercancel'].forEach(n => addEventListener(n, e => {
  if (e.pointerType !== 'touch') return;
  if (TOUCH.joy && e.pointerId === TOUCH.joy.id) { TOUCH.joy = null; tEl.joy.classList.remove('on'); }
  if (TOUCH.aim && e.pointerId === TOUCH.aim.id) TOUCH.aim = null;
}));
addEventListener('blur', () => { TOUCH.joy = null; TOUCH.aim = null; if (tEl.joy) tEl.joy.classList.remove('on'); });
/* 조사 버튼 · 조이스틱은 걷고 싸울 때만 */
setInterval(() => {
  if (!TOUCH.on) return;
  const play = touchPlayMode() || G.mode === 'talk';
  document.body.classList.toggle('tplay', play);
  if (!touchPlayMode()) { TOUCH.joy = null; TOUCH.aim = null; tEl.joy.classList.remove('on'); }
}, 120);
addEventListener('mouseup', () => { mouse.down = false; });
/* once:true 였던 걸 뺐습니다 — 아티팩트(iframe)처럼 삽입된 페이지는
   첫 클릭에서 아직 "사용자 조작"으로 인정받지 못해 AudioContext 가
   풀리지 않는 경우가 있어서, 건드릴 때마다 계속 풀어 보려고 시도합니다.

   그리고 마우스·터치·키보드 중 뭘로 들어오든 — "시작하기" 버튼까지
   누를 것도 없이, 이 페이지에 처음 닿는 그 순간 숲 앰비언스가 바로
   나오게 합니다. 브라우저 자동재생 정책상 상호작용 없이 완전히
   자동으로 틀 수는 없지만, 잡아 두는 이벤트 종류를 최대한 넓혀서
   사실상 "들어오기만 해도" 로 느껴지게 합니다. */
function kickAudio() {
  Sfx.unlock();
  // 아직 타이틀 · 모드 선택 화면이라면 여기서 바로 틀어 둡니다.
  // startGame() 이 이어서 다시 ambient('forest') 를 걸어도 Sfx.started() 가
  // 이미 true 라 겹쳐 울리지 않고 그대로 이어집니다.
  if (!Sfx.started() && (G.mode === 'title' || G.mode === 'modesel' || G.mode === 'diffsel'))
    Sfx.ambient('forest');
}
/* touchend · pointerup 도 잡습니다 — 오래된 iPad 사파리는 손가락을 뗄 때만
   "사용자 조작"으로 쳐서, touchstart 만으로는 소리가 풀리지 않았습니다. */
['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click', 'wheel']
  .forEach(evt => addEventListener(evt, kickAudio, { capture: true, passive: true }));

const down = (...ks) => ks.some(k => key[k]);

/* ═══════════ 게임 상태 ═════════════════════════════════ */
const G = {
  mode: 'title',        // title | modesel | diffsel | forest | play | talk | note | doc | fall | landing | wakeup | boss-intro | morph | creepy | ending | dead
  timeAttack: true,     // true = 타임어택 모드 · false = 일반 모드
  diff: 'normal',       // 일반 모드에서 고른 난이도 (타임어택은 언제나 'ta' — 보스만 쉬움과 보통 사이)
  diffName: '보통',
  room: null,           // 현재 방 id (숲이면 null)
  inForest: true,
  t: 0, shake: 0, flash: 0,
  seenGlitch: false,
  keys: 0,              // 상자 열쇠 (상자를 열 때 소모)
  doorKeys: 0,          // 관문 열쇠 — 비운 방에서 매번 다시 세는 파생값
  gateOpen: false,
  bossDead: false,
  endWarp: 0,           // 엔딩 직전 화면 일그러짐 (0‥1)
  opening: null,        // 1인칭 오프닝 진행 상태
  finalKey: false,      // 보스를 잡으면 손에 쥐어지는 마지막 열쇠
  visited: new Set(),
  st: {},               // 방별 저장 상태
  floor: null, depth: 1,
  bullets: [], foes: [], fx: [], pickups: [], pots: [], clouds: [],
  rings: [],            // 보스전 충격파 고리
  props: [], theme: '', // 방의 장애물 · 테마 (roomdeco.js)
  glare: 0,             // 보스전 섬광 (0~1)
  chest: null, floorKey: null, boss: null,
  doors: {},            // { N:{open,locked}, ... }
  well: { x: 446, y: 152, glow: 0 },
  oldTree: { x: 132, y: 296 },   // 이스터에그 ① — 늙은 나무 밑동
  gap: { x: 414, y: 26 },        // 이스터에그 ② — 숲 맨 위, 나무 사이의 틈
  sawDoc: false,
  creepyOn: false,
  wellUsed: false, fallT: 0, landT: 0, eyeT: 0, wake: 0,
  morphed: false, morphT: 0, morphX: 0, morphY: 0, morphDark: 0,
  medpack: null,        // 눈이 터질 때 튀어나오는 구급 팩 (페이즈3 직전)
  butterflies: [], plants: []
};

const P = {
  x: 60, y: H / 2, r: 10,
  hp: BALANCE.playerHp, max: BALANCE.playerHp,
  dir: 'down', anim: 0,
  fireCd: 0, inv: 0, slow: 0, walkPhase: 0, walkAmt: 0, stepT: 0, dead: false
};

/* ═══════════ 타임어택 ══════════════════════════════════
   시작 버튼을 누른 순간부터 마지막 열쇠를 꽂는 순간까지 잽니다.
   죽으면 기록은 남지 않고 처음부터 다시 시작합니다.
   ═════════════════════════════════════════════════════ */
const RUN = { start: 0, elapsed: 0, running: false };
const REC_KEY = 'wellbelow.records';
const REC_MAX = 5;
let memRecords = [];                 // localStorage 를 못 쓸 때의 대비책

function startRun() { RUN.start = performance.now(); RUN.elapsed = 0; RUN.running = true; }
function stopRun()  { if (RUN.running) { RUN.elapsed = performance.now() - RUN.start; RUN.running = false; } }
function runTime()  { return RUN.running ? performance.now() - RUN.start : RUN.elapsed; }

function fmtTime(ms) {
  const t = Math.max(0, ms | 0);
  const m = Math.floor(t / 60000);
  const s = Math.floor(t % 60000 / 1000);
  const c = Math.floor(t % 1000 / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function loadRecords() {
  try {
    const v = JSON.parse(localStorage.getItem(REC_KEY));
    return Array.isArray(v) ? v.filter(n => typeof n === 'number') : [];
  } catch (e) { return memRecords; }
}
function saveRecord(ms) {
  const list = loadRecords().concat(ms).sort((a, b) => a - b).slice(0, REC_MAX);
  memRecords = list;
  try { localStorage.setItem(REC_KEY, JSON.stringify(list)); } catch (e) {}
  return list;
}

function fillList(el, list, hi) {
  el.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty'; li.textContent = '아직 기록 없음';
    el.appendChild(li); return;
  }
  list.forEach((ms, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="r-rank">${i + 1}</span><span class="r-time">${fmtTime(ms)}</span>`;
    if (hi !== undefined && ms === hi) li.classList.add('mine');
    el.appendChild(li);
  });
}
function renderBestTimes() {
  const list = loadRecords();
  $('besttimes').classList.toggle('hidden', !list.length);
  if (list.length) fillList($('bestlist'), list.slice(0, 3));
}

/* ═══════════ 자막 ═════════════════════════════════════
   글자가 한 글자씩 박자감 있게 나타납니다. 문장부호에서 살짝 멈춰
   숨을 고르고, `**이렇게**` 감싼 구절은 충격적인 사실/반전을 드러낼 때
   갑자기 팡 하고 커지면서 화면이 살짝 흔들립니다. */
const TALK_CPF = 0.62;                    // 초당 약 37자 — 또박또박 읽히는 속도
const SYS_CPF  = 1.15;                    // 시스템 문구는 숨 고르기 없이 기계적으로 빠르게
const TALK_PAUSE = {                      // 문장부호에서 쉬어가는 박자(프레임)
  ',': 7, '，': 7,
  '.': 16, '!': 16, '?': 16,
  '…': 24, '─': 20, ':': 10
};
const talk = { q: [], cur: null, charI: 0, hold: 0, doneT: 0, shockFired: null, cb: null, back: 'play' };

function parseShock(raw) {
  const ranges = [];
  let plain = '', i = 0;
  while (i < raw.length) {
    if (raw[i] === '*' && raw[i + 1] === '*') {
      const end = raw.indexOf('**', i + 2);
      if (end !== -1) {
        const seg = raw.slice(i + 2, end);
        ranges.push([plain.length, plain.length + seg.length]);
        plain += seg; i = end + 2; continue;
      }
    }
    plain += raw[i]; i++;
  }
  return { plain, ranges };
}

const TOUCH_HINT = { '이동 — W A S D': '이동 — 화면 왼쪽을 누르고 끌기', '공격 — 방향키 / 마우스': '공격 — 적을 누르고 있기' };
function say(lines, cb) {
  if (TOUCH.on) lines = lines.map(l => TOUCH_HINT[l.t] ? { ...l, t: TOUCH_HINT[l.t] } : l);
  talk.q = lines.slice(); talk.cb = cb || null;
  talk.back = G.inForest ? 'forest' : 'play';
  G.mode = 'talk';
  showLine();
}
/* 대사 한 줄이 뜨는 순간에 거는 연출 — 엔딩 직전, 화면이 단계별로 무너집니다 */
const LINE_FX = {
  click: () => { Sfx.door(); G.shake = Math.max(G.shake, 6); },
  warp1: () => { G.endWarp = .35; Sfx.landThump(.35); G.shake = Math.max(G.shake, 8); },
  still: () => { G.endWarp = .12; },              // 한 박자 숨을 죽였다가
  warp2: () => {
    G.endWarp = 1; Sfx.glitch(); Sfx.landThump(.6);
    G.shake = Math.max(G.shake, 16); G.flash = 1; glare(.6);
    $('glitchbar').classList.remove('on'); void $('glitchbar').offsetWidth; $('glitchbar').classList.add('on');
  }
};
function showLine() {
  const l = talk.q[0];
  if (l && l.fx && LINE_FX[l.fx]) LINE_FX[l.fx]();
  if (!l) {
    $('subtitle').classList.add('hidden');
    G.mode = talk.back;
    const cb = talk.cb; talk.cb = null;
    if (cb) cb();
    return;
  }
  const { plain, ranges } = parseShock(l.t);
  talk.cur = { plain, ranges, sys: !!l.sys };
  talk.charI = 0; talk.hold = 0; talk.doneT = 0; talk.shockFired = new Set();
  talk.domN = 0; $('subtext').textContent = '';
  const s = $('subtitle');
  s.classList.remove('hidden');
  s.classList.toggle('whisper', !!l.w);
  s.classList.toggle('sys', !!l.sys);
  $('subtag').classList.toggle('hidden', !l.sys);
  $('subnext').classList.add('hidden');
  renderTalk();
}
/* 글자를 한 자씩 DOM 에 덧붙입니다. 통째로 다시 그리면 글자마다 걸어 둔
   흔들림 애니메이션이 매 프레임 처음으로 되감겨 멈춘 것처럼 보이기 때문에,
   이미 나온 글자는 건드리지 않고 새로 나온 만큼만 이어 붙입니다. */
function renderTalk() {
  const t = talk.cur; if (!t) return;
  const el = $('subtext');
  const n = Math.min(t.plain.length, Math.floor(talk.charI));

  if (n < talk.domN) { el.textContent = ''; talk.domN = 0; }   // 되돌아가면 처음부터

  for (let i = talk.domN; i < n; i++) {
    const ch = t.plain[i];
    if (ch === '\n') { el.appendChild(document.createElement('br')); continue; }
    if (ch === ' ')  { el.appendChild(document.createTextNode(' ')); continue; }

    const sp = document.createElement('span');
    sp.className = t.ranges.some(r => i >= r[0] && i < r[1]) ? 'ch shock' : 'ch';
    sp.textContent = ch;
    // 글자마다 위상을 어긋나게 해서 물결처럼 잘게 떨리도록
    sp.style.animationDelay = `-${((i * 37) % 11) * .06}s`;
    el.appendChild(sp);
  }
  talk.domN = n;
}
/* 대사 진행 : 타이핑 중이면 한 프레임 진행, 다 나왔으면 대기 시간만 잰다 */
function tickTalk() {
  const t = talk.cur;
  if (!t) return;
  if (talk.charI < t.plain.length) {
    if (talk.hold > 0) { talk.hold--; return; }
    const ni = Math.floor(talk.charI);
    const hitRange = t.ranges.find(r => r[0] === ni && !talk.shockFired.has(r));
    if (hitRange) {
      talk.charI = hitRange[1];
      talk.shockFired.add(hitRange);
      G.shake = Math.max(G.shake, 6);
      G.flash = Math.max(G.flash, .32);
      Sfx.reveal();
      talk.hold = 30;
    } else if (t.sys) {
      talk.charI += SYS_CPF;              // 시스템 문구는 숨 고르지 않고 기계적으로
    } else {
      talk.charI += TALK_CPF;
      const ch = t.plain[Math.floor(talk.charI) - 1];
      if (ch && TALK_PAUSE[ch]) talk.hold = TALK_PAUSE[ch];
    }
    renderTalk();
    if (talk.charI >= t.plain.length) $('subnext').classList.remove('hidden');
  } else {
    talk.doneT++;
    if (talk.doneT > 200) nextLine();
  }
}
/* SPACE : 타이핑 중이면 즉시 완성, 다 나왔으면 다음 줄로 */
function advanceTalk() {
  const t = talk.cur;
  if (!t) return;
  if (talk.charI < t.plain.length) {
    talk.charI = t.plain.length; talk.hold = 0;
    renderTalk();
    $('subnext').classList.remove('hidden');
  } else if (talk.doneT > 2) {
    nextLine();
  }
}
function nextLine() { talk.q.shift(); showLine(); }

/* ═══════════ 확인 키 ═══════════════════════════════════ */
function onConfirm() {
  Sfx.unlock();
  if (G.mode === 'title')  { menuGo(); return; }
  if (G.mode === 'modesel') return;            // 모드는 직접 골라야 넘어갑니다
  if (G.mode === 'diffsel') return;            // 난이도도 마찬가지
  if (G.mode === 'creepy') return;             // 이건 건너뛸 수 없습니다
  if (G.mode === 'dead')  { retry(); return; }
  if (G.mode === 'talk')  { advanceTalk(); return; }
  if (G.mode === 'note')  { closeNote(); return; }
  if (G.mode === 'doc')   { closeDoc(); return; }
  if (G.mode === 'play' || G.mode === 'forest') interact();
}

/* ═══════════ 시작 / 초기화 ════════════════════════════ */

/* 시작하기 → 모드 선택. 로고는 그대로 두고 아래쪽만 바뀝니다. */
/* ── 시작 화면의 메뉴 — ↑↓(W · S) 로 고르고 SPACE · ENTER, 또는 그냥 누르기 ── */
const menuItems = () => [...document.querySelectorAll('#startbtn .tm-item:not(.hidden)')];
function menuMove(d) {
  const it = menuItems(), i = Math.max(0, it.findIndex(b => b.classList.contains('sel')));
  it.forEach(b => b.classList.remove('sel'));
  it[(i + d + it.length) % it.length].classList.add('sel'); Sfx.unlock();
}
function menuGo(act) {
  act = act || (menuItems().find(b => b.classList.contains('sel')) || {}).dataset?.act || 'start';
  Sfx.unlock();
  if (act === 'start') { openModeSelect(); openDiffSelect(); }          // 일반 모드 — 바로 난이도
  else if (act === 'time') { openModeSelect(); startTimeAttack(); }
  else if (act === 'board') { if (window.Festival) Festival.openBoard(); }
  else if (act === 'full') {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { try { const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  }
}
function openModeSelect() {
  Sfx.unlock();
  $('startbtn').classList.add('hidden');
  $('besttimes').classList.add('hidden');
  $('modesel').classList.remove('hidden');
  $('title').classList.add('picking');       // 우물이 작아지며 위로 비켜섭니다
  G.mode = 'modesel';
}
function closeModeSelect() {
  $('modesel').classList.add('hidden');
  $('startbtn').classList.remove('hidden');
  $('title').classList.remove('picking');
  renderBestTimes();
  G.mode = 'title';
}

/* 어디까지 갔는지 — 축제판에서 죽은 판을 순위판에 남길 때 (클리어 못 한 사람끼리는 멀리 간 순)
   숲 0 · 던전은 밟은 방 수와 관문 열쇠 · 보스 1 · 2단계(눈) · 3단계(심연) */
function runProgress() {
  const B = G.boss;
  if (G.bossDead) return { score: 2000, stage: '마지막 방' };
  if (B || G.morphed || G.room === 'boss') {
    const ph = (B && B.kind === 'abom') || G.morphed ? 3 : (B && B.phase) || 1;
    return { score: 1000 + ph * 100, stage: `보스 ${ph}단계` };
  }
  if (G.inForest || !G.room) return { score: 0, stage: '숲' };
  const n = G.visited ? G.visited.size : 0;
  return { score: 10 + n * 10 + G.doorKeys * 5, stage: G.doorKeys ? `던전 ${n}곳 · 관문 열쇠 ${G.doorKeys}` : `던전 ${n}곳` };
}

/* 타임어택 — 축제판이면 먼저 이름 · 연락처를 받고 시작 (기록이 순위판에 모입니다, festival.js) */
function startTimeAttack() {
  if (!(window.Festival && Festival.on)) { startGame(true); return; }
  $('modesel').classList.add('hidden');
  G.mode = 'entry';
  Festival.ask(() => startGame(true), () => closeModeSelect());
}

/* 일반 모드는 한 단계 더 — 쉬움 / 보통 / 어려움을 고릅니다.
   (타임어택은 고르지 않고 바로 시작 — 던전은 '보통', 보스만 쉬움과 보통 사이) */
function openDiffSelect() {
  Sfx.unlock();
  $('modesel').classList.add('hidden');
  $('diffsel').classList.remove('hidden');
  G.mode = 'diffsel';
}
function closeDiffSelect() {                    // 메뉴에서 바로 들어왔으니 뒤로도 시작 화면으로
  $('diffsel').classList.add('hidden');
  closeModeSelect();
}

/* timeAttack = true  : 시계가 돌고 기록이 남습니다. 죽으면 처음부터.
   timeAttack = false : 시계 없이 천천히. 죽으면 그 방에서 다시 시작합니다.
   diffId : 'easy' | 'normal' | 'hard' — 일반 모드에서만 고를 수 있습니다. */
function startGame(timeAttack = true, diffId = 'normal') {
  G.timeAttack = timeAttack !== false;
  /* 난이도를 BALANCE 에 얹는 건 방을 만들기 전, 판이 시작되는 이 시점입니다 */
  const d = applyDifficulty(G.timeAttack ? 'ta' : diffId);   // 타임어택 — 보스만 쉬움과 보통 사이 (rooms.js 의 DIFF.ta)
  if (G.konami && !G.timeAttack) { BALANCE.playerHp += 1; BALANCE.abomPlayerMax += 1; }   // 이스터에그 ③
  G.diff = d.id; G.diffName = d.name;
  P.max = BALANCE.playerHp; P.hp = P.max; P.inv = 0; P.slow = 0;
  $('modesel').classList.add('hidden');
  $('diffsel').classList.add('hidden');
  $('startbtn').classList.remove('hidden');
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('timerbox').classList.toggle('hidden', !G.timeAttack);
  { const d = window.WB_DEV, dp = $('devpace'), on = G.timeAttack && d && d.ms > 0;      // 개발자 기록 — 축제판 시계 밑에
    dp.classList.toggle('hidden', !on); dp.classList.remove('over'); if (on) dp.textContent = `DEV ${d.name || ''} ${fmtTime(d.ms)}`; }
  updateHud();
  Sfx.unlock();
  Sfx.preloadDungeonBgm();   // 우물에 떨어질 때 끊기지 않도록 미리 디코딩해 둡니다
  if (G.timeAttack) { startRun(); if (window.Festival) Festival.begin(); }   // 축제판 — 순위판에 "지금 도전 중"
  else { RUN.running = false; RUN.elapsed = 0; }
  loadForest(true);       // 일반 모드는 1인칭 오프닝부터 (타임어택은 loadForest 가 건너뜀)
}

/* 사망 처리 — 모드에 따라 갈립니다 */
function retry() {
  if (G.timeAttack && window.Festival && Festival.on && Festival.player) { resetRun(); startGame(true); }   // 축제판 — 등록한 그 사람 그대로 바로 다시
  else if (G.timeAttack) resetRun();
  else if (abomCheckpoint()) respawnAbom();
  else respawn();
}

/* 심연 체크포인트 — 보통 · 어려움에서 페이즈3 「심연」과 싸우다 죽으면
   눈부터 다시가 아니라 심연부터 다시 싸웁니다. (쉬움은 지금처럼 그 방
   처음부터, 타임어택은 언제나 처음부터) */
const abomCheckpoint = () => !G.timeAttack && G.diff !== 'easy' && !!G.boss && G.boss.kind === 'abom';

function respawnAbom() {
  $('dead').classList.add('hidden');
  ['subtitle', 'prompt', 'noteoverlay'].forEach(id => $(id).classList.add('hidden'));
  G.bullets = []; G.fx = []; G.pickups = []; G.clouds = []; G.rings = []; G.foes = [];
  G.flash = 0; G.shake = 0; G.glare = 0;
  // 구급 팩으로 늘었던 체력칸 그대로, 가득 채워서
  P.max = BALANCE.abomPlayerMax; P.hp = P.max;
  P.dead = false; P.inv = BALANCE.invFrames; P.slow = 0;
  // 심연에서 먼 쪽 벽가에 세웁니다
  P.x = G.morphX > W / 2 ? TS + 40 : W - TS - 40; P.y = H - TS - 44;
  P.dir = P.x < W / 2 ? 'right' : 'left';
  makeAbom();                                  // 체력 가득, 광란 전 상태로
  Sfx.bossBgmStopAll(true);
  Sfx.bossBgm('boss3', true, false, true);     // 조용한 도입은 건너뛰고 바로 격렬한 부분부터
  G.wake = WAKE_DUR;                           // 조리개가 열리듯 방이 드러납니다
  G.mode = 'play';
  updateHud();
}

/* 일반 모드 : 죽은 방을 처음 상태로 되돌리고 체력을 채워 다시 넣어 줍니다 */
function respawn() {
  $('dead').classList.add('hidden');
  ['subtitle', 'prompt', 'noteoverlay'].forEach(id => $(id).classList.add('hidden'));
  G.bullets = []; G.fx = []; G.pickups = []; G.clouds = []; G.rings = [];
  G.flash = 0; G.shake = 0; G.glare = 0;
  P.hp = P.max; P.dead = false; P.inv = BALANCE.invFrames; P.slow = 0;
  Sfx.dungeonBgmDuck(false);   // 보스전 전이라면 브금 볼륨을 되돌립니다 (보스전엔 이미 꺼져 있어 무해)
  Sfx.bossBgmStopAll(true);    // 보스방으로 되돌아가면 queueBoss 가 처음부터 다시 걸어 줍니다
  updateHud();
  if (G.room) loadRoom(G.room, 'W');
  else loadForest();
}

/* 죽으면 진행 상황을 전부 버리고 타이틀로 돌아갑니다 */
function resetRun() {
  Sfx.ring(0);
  stopRun();
  if (window.Festival) Festival.end();
  G.keys = 0; G.doorKeys = 0; G.gateOpen = false; G.bossDead = false;
  G.finalKey = false;
  G.visited = new Set(); G.st = {}; G.seenGlitch = false;
  G.bullets = []; G.foes = []; G.fx = []; G.pickups = []; G.pots = []; G.clouds = [];
  G.rings = []; G.glare = 0; G.wake = 0; G.endWarp = 0; G.opening = null; op3dDispose();
  G.doze = null; G.dozeSeen = false; G.idleT = 0;
  G.awayMsg = null; G.awaySeen = false;
  G.morphed = false; G.morphT = 0; G.morphDark = 0; G.medpack = null;
  G.morphPre = MORPH_PRE; G.eyeMorph = null; G.corpse = null; G.deathT = 0;
  clearMorphSys();
  G.chest = null; G.floorKey = null; G.boss = null; G.doors = {};
  G.flash = 0; G.shake = 0;
  P.max = BALANCE.playerHp;   // 페이즈3에서 늘었던 체력칸도 새 판에선 원래대로
  P.hp = P.max; P.dead = false; P.inv = 0; P.slow = 0;
  RUN.elapsed = 0;
  ['dead', 'subtitle', 'prompt', 'noteoverlay', 'hud'].forEach(id => $(id).classList.add('hidden'));
  Sfx.ambientStop(); Sfx.dungeonBgm(false); Sfx.bossBgmStopAll(true);
  setDate(0); updateHud(); updateTimer();
  renderBestTimes();
  $('modesel').classList.add('hidden');
  $('diffsel').classList.add('hidden');
  $('startbtn').classList.remove('hidden');
  $('title').classList.remove('hidden', 'picking');
  G.mode = 'title';
}

document.querySelectorAll('#startbtn .tm-item').forEach(b => {
  b.addEventListener('click', () => { menuItems().forEach(x => x.classList.remove('sel')); b.classList.add('sel'); menuGo(b.dataset.act); });
  b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { menuItems().forEach(x => x.classList.remove('sel')); b.classList.add('sel'); } });
});
if (window.Festival && Festival.on) document.querySelector('#startbtn [data-act="board"]').classList.remove('hidden');
$('msback').addEventListener('click', closeModeSelect);
$('dsback').addEventListener('click', closeDiffSelect);
document.querySelectorAll('.modebtn').forEach(b =>
  b.addEventListener('click', () =>
    b.dataset.mode === 'time' ? startTimeAttack() : openDiffSelect()));
document.querySelectorAll('.diffbtn').forEach(b =>
  b.addEventListener('click', () => startGame(false, b.dataset.diff)));
$('retrybtn').addEventListener('click', retry);
/* 축제판 — 죽은 뒤 다음 사람에게 넘김 (타이틀로, 다음 사람은 새로 등록) */
function nextPlayer() { if (window.Festival) Festival.clearPlayer(); resetRun(); }
$('fest-next').addEventListener('click', nextPlayer);
$('againbtn').addEventListener('click', () => restartFromEnd());

/* ═══════════ 지상 ═════════════════════════════════════ */
function loadForest(opening) {
  G.inForest = true; G.room = null; G.depth = 0;
  W = VW; H = VH; CAM.x = CAM.y = 0;
  G.bullets = []; G.foes = []; G.fx = []; G.pickups = []; G.pots = []; G.clouds = [];
  G.rings = []; G.glare = 0; G.wake = 0;
  G.morphed = false; G.morphT = 0; G.morphDark = 0; G.medpack = null;
  clearMorphSys();
  G.chest = null; G.floorKey = null; G.boss = null; G.doors = {};
  P.slow = 0; P.x = 52; P.y = H / 2; P.dir = 'right'; P.inv = 40; P.dead = false;
  $('dead').classList.add('hidden');
  G.floor = bakeForest(W, H, TS);
  G.props = []; G.theme = 'forest';
  G.butterflies = Array.from({ length: 7 }, () => ({
    x: 60 + Math.random() * (W - 140), y: 40 + Math.random() * (H - 90),
    a: Math.random() * 6.28, s: .3 + Math.random() * .3,
    c: OBANG_LIST[(Math.random() * 5) | 0], gl: 0
  }));
  G.well.glow = 0; G.wellUsed = false;
  // 타이틀에서 이미 숲 앰비언스가 흐르고 있었다면(kickAudio) 여기서 다시
  // 겹쳐 틀지 않습니다 — 그대로 자연스럽게 이어집니다.
  if (!Sfx.started()) Sfx.ambient('forest');
  setDate(0);
  updateHud();
  if (G.timeAttack) G.mode = 'forest';     // 타임어택은 숲의 첫 독백 없이 바로
  else if (opening) beginOpening();         // 일반 모드의 첫 시작은 1인칭으로
  else { say(FOREST.intro); talk.back = 'forest'; }
}

/* ═══════════ 방 그래프 ════════════════════════════════ */
function neighbourOf(id, d) {
  const r = MAP[id], [dx, dy] = DIRS[d];
  return Object.keys(MAP).find(k =>
    MAP[k].gx === r.gx + dx && MAP[k].gy === r.gy + dy);
}

/* ── 열쇠 / 진행 조건 ───────────────────────────────────────
   관문 열쇠는 "들고 다니다 써서 없어지는 물건"이 아니라, 그 방을 비웠다는
   증표입니다. 예전에는 숫자를 직접 더하고 빼다 보니 (보상 연출 도중에 방을
   넘어가는 등) 분명 두 개를 먹었는데 관문이 안 열리는 일이 생겼습니다.
   그래서 개수를 저장하지 않고 방 상태에서 매번 다시 세도록 바꿨습니다. */
/* ═══════════ 진행 규칙 — 모드별로 완전히 분리 ═══════════
   두 모드가 서로 다른 게임처럼 굴러야 해서, 관문 통과 조건을 한 군데
   표로 몰아 두고 나머지 코드는 이 표만 봅니다.

     타임어택 : 관문 열쇠 2개면 끝. 북쪽 방 · 남쪽 방만 들르면 되므로
                갈림길에서 위아래만 찍고 곧장 중앙 → 관문으로 갑니다.
     일반     : 관문 열쇠 2개 + EXPLORE_ROOMS 전부 밟기.

   ⛨ 열쇠가 나오는 방은 MAP 에서 clear:'doorKey' 로 표시된 방(북·남)
   뿐입니다. 상자 열쇠(✦)는 전혀 다른 물건이라 관문과 무관합니다.
   ═══════════════════════════════════════════════════════ */
const DOOR_KEYS_NEEDED = 2;

const MODE_RULE = {
  time:   { id: 'time',   name: '타임어택',
            keys: DOOR_KEYS_NEEDED, needExplore: false },
  normal: { id: 'normal', name: '일반',
            keys: DOOR_KEYS_NEEDED, needExplore: true }
};
const rule = () => G.timeAttack ? MODE_RULE.time : MODE_RULE.normal;

/* ⛨ 관문 열쇠가 나오는 방들 (MAP 에서 자동으로 뽑습니다) */
const DOOR_KEY_ROOMS = Object.keys(MAP).filter(id => MAP[id].clear === 'doorKey');
const roomHasDoorKey = id => DOOR_KEY_ROOMS.includes(id) && !(G.st[id] && G.st[id].rewarded);

function earnedDoorKeys() {
  return DOOR_KEY_ROOMS.filter(id => G.st[id] && G.st[id].rewarded).length;
}
const syncKeys = () => { G.doorKeys = earnedDoorKeys(); };

/* 일반 모드에서 아직 밟지 않은 방 */
const exploreDone = () => EXPLORE_ROOMS.filter(id => G.visited.has(id)).length;
const exploreAll  = () => exploreDone() >= EXPLORE_ROOMS.length;

/* 관문을 열 수 있는 상태인가 — 모드 규칙표만 봅니다 */
function gateReady() {
  syncKeys();
  const R = rule();
  if (G.doorKeys < R.keys) return false;
  return R.needExplore ? exploreAll() : true;
}

/* 관문이 안 열리는 이유 (프롬프트·대사·문 표시가 전부 이걸 씁니다) */
function gateBlocker() {
  syncKeys();
  const R = rule();
  if (G.doorKeys < R.keys) return 'keys';
  if (R.needExplore && !exploreAll()) return 'explore';
  return null;
}

function doorLockReason(toId) {
  const t = MAP[toId];
  if (t.needKeys && !G.gateOpen) return 'keys';
  if (t.needBoss && !G.bossDead) return 'boss';
  return null;
}

function buildDoors(id) {
  G.doors = {};
  for (const d of Object.keys(DIRS)) {
    const nb = neighbourOf(id, d);
    if (!nb) continue;
    G.doors[d] = { to: nb, lock: doorLockReason(nb) };
  }
}

/* 방 상태 저장소 */
function stateOf(id) {
  if (!G.st[id]) {
    const r = MAP[id];
    G.st[id] = {
      cleared: !(r.enemies && r.enemies.length),
      rewarded: false,
      pots: (r.pots || []).map(() => true),   // true = 아직 안 깨짐
      keyTaken: !r.key,
      chestOpen: !r.chest
    };
  }
  return G.st[id];
}

function loadRoom(id, fromDir) {
  const r = MAP[id], s = stateOf(id);
  G.inForest = false; G.room = id; G.depth = r.depth;
  [W, H] = r.size || [VW, VH];                // 보스방만 더 넓음
  G.bullets = []; G.fx = []; G.pickups = []; G.clouds = []; G.rings = [];
  G.foes = []; G.pots = []; G.chest = null; G.floorKey = null; G.boss = null;
  G.glare = 0; G.medpack = null;
  P.inv = 40; P.slow = 0; P.dead = false;
  $('dead').classList.add('hidden');

  G.theme = roomTheme(id); G.props = buildRoomProps(id);
  G.floor = bakeDungeonFloor(W, H, TS, hash(id), r.depth, G.theme);
  G.plants = bakePlants(hash(id) + 91, r.depth);
  buildDoors(id);

  if (!s.cleared) (r.enemies || []).forEach(e => spawnFoe(e.t, e.x, e.y));
  (r.pots || []).forEach((p, i) => { if (s.pots[i]) G.pots.push({ x: p.x, y: p.y, i }); });
  if (r.key && !s.keyTaken) G.floorKey = { x: r.key.x, y: r.key.y, bob: 0 };
  if (r.chest) G.chest = { ...r.chest, open: s.chestOpen };

  // 입장 위치 : 들어온 문 반대쪽에서 걸어 들어옵니다
  const spawn = {
    W: [TS + 26, H / 2, 'right'], E: [W - TS - 26, H / 2, 'left'],
    N: [W / 2, TS + 26, 'down'],  S: [W / 2, H - TS - 26, 'up']
  }[fromDir] || [TS + 26, H / 2, 'right'];
  P.x = spawn[0]; P.y = spawn[1]; P.dir = spawn[2];
  // 문턱에 바짝 붙어 선 적은 조금 물러나 있게 — 들어서자마자 맞는 일이 없도록 (북쪽 방의 버섯은 문에서 26px).
  // 그리고 들어선 직후 잠깐은 아무도 쏘지 않습니다 (공격 대기 cd 를 넉넉히)
  const SAFE = 120;
  for (const f of G.foes) {
    let dx = f.x - P.x, dy = f.y - P.y, d = Math.hypot(dx, dy);
    if (d < SAFE) {
      if (d < 1) { dx = W / 2 - P.x; dy = H / 2 - P.y; d = Math.hypot(dx, dy) || 1; }
      f.x = Math.max(TS + 16, Math.min(W - TS - 16, P.x + dx / d * SAFE));
      f.y = Math.max(TS + 16, Math.min(H - TS - 16, P.y + dy / d * SAFE));
    }
    f.cd = Math.max(f.cd, 70);
  }
  updateCamera(true);

  const first = !G.visited.has(id);
  G.visited.add(id);
  setDate(G.visited.size);            // 방을 새로 밟을 때마다 날짜가 뛴다
  updateHud();                        // 탐사 진행도(일반 모드) 갱신

  if (Sfx.started && id === 'start') Sfx.ambient('dungeon');
  /* 보스 브금을 미리 디코딩해 둡니다. 착지 직후(start)에 하면 그 요란한
     연출 프레임에 걸려 한 번 덜컥하므로, 첫 방을 벗어난 뒤에 합니다. */
  if (id !== 'start') { Sfx.preloadBossBgm('approach'); Sfx.preloadBossBgm('boss2'); }
  syncRoomBgm(id);

  const after = r.boss && !G.bossDead ? queueBoss : null;
  // 타임어택은 방에 처음 들어설 때의 독백도 건너뜁니다
  if (first && r.intro && r.intro.length && !G.timeAttack) say(r.intro, after);
  else if (after) after();
  else G.mode = 'play';
}

/* 방을 옮길 때마다 어떤 브금이 흘러야 하는지 한 군데서 정합니다 —
   탐사 브금 → (관문) 잔잔한 브금 → (심층) 격렬한 보스 브금 순으로
   조여듭니다. 심층은 queueBoss 가 따로 채기 때문에 여기서 건드리지
   않고, 보스를 잡은 뒤로는 환경음만 남겨 둡니다. */
function syncRoomBgm(id) {
  if (id === 'boss' || G.bossDead) return;
  if (id === 'gate') {                 // 보스방 바로 앞 — 숨을 죽입니다
    Sfx.dungeonBgm(false);
    Sfx.bossBgm('approach', true);
  } else {
    Sfx.bossBgm('approach', false);
    Sfx.dungeonBgm(true);
  }
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function updateTimer() {
  const t = runTime();
  $('timertext').textContent = fmtTime(t);
  const d = window.WB_DEV, dp = $('devpace');                // 축제판 — 시계 밑에 개발자 기록 (넘기면 빨갛게)
  if (dp && d && d.ms > 0) dp.classList.toggle('over', t > d.ms);
}

/* ═══════════ 날짜 HUD ═════════════════════════════════ */
function setDate(i) {
  const d = DATES[Math.min(i, DATES.length - 1)];
  const el = $('datetext');
  if (el.textContent === d) return;
  el.textContent = d;
  $('datebox').classList.remove('tick');
  void $('datebox').offsetWidth;
  $('datebox').classList.add('tick');
  if (i > 1) { G.flash = Math.max(G.flash, .7); Sfx.beep(.10); }
}

/* ═══════════ 적 ═══════════════════════════════════════ */
/* 몹 종류별 기본값 — r(크기) · hp · sp(속도) · hue(색조) · eye(눈빛) */
const FOE = {
  shroom:   { r: 12, hp: 'shroomHp',   sp: 'shroomSpeed',   hue: 0,   eye: '#ff5330' },
  spitter:  { r: 13, hp: 'spitterHp',  sp: 'spitterSpeed',  hue: 85,  eye: '#8de08a' },
  sporer:   { r: 13, hp: 'sporerHp',   sp: 'sporerSpeed',   hue: 42,  eye: '#e8e06a' },
  splitter: { r: 14, hp: 'splitterHp', sp: 'splitterSpeed', hue: 255, eye: '#c79bff' },
  mini:     { r:  8, hp: 'miniHp',     sp: 'miniSpeed',     hue: 255, eye: '#c79bff' },
  charger:  { r: 13, hp: 'chargerHp',  sp: 'chargerSpeed',  hue: 330, eye: '#ff9a4d' },
  blinker:  { r: 12, hp: 'blinkerHp',  sp: 'blinkerSpeed',  hue: 160, eye: '#7de3c8' }
};

function spawnFoe(type, x, y, side = 1) {
  const d = FOE[type] || FOE.shroom;
  G.foes.push({
    type, x, y, r: d.r,
    hp: BALANCE[d.hp], max: BALANCE[d.hp], sp: BALANCE[d.sp],
    cd: 40 + Math.random() * 90,
    wind: 0, dash: 0, dvx: 0, dvy: 0, warp: 0,
    face: 1,          // 바라보는 쪽 — 나팔·머리판이 향할 방향
    side,             // 새끼가 어느 쪽 반쪽이었는지 (찢긴 단면을 그립니다)
    flash: 0, kx: 0, ky: 0, bob: Math.random() * 6.28
  });
}

/* 몹이 죽을 때 — 분열체만 새끼를 남깁니다 */
function killFoe(f) {
  f.dead = true;
  glitchDeath(f.x, f.y, false);
  if (f.type === 'splitter') {
    for (const sd of [-1, 1]) {
      const nx = Math.max(TS + 12, Math.min(W - TS - 12, f.x + sd * 13));
      const ny = Math.max(TS + 12, Math.min(H - TS - 12, f.y + 6));
      spawnFoe('mini', nx, ny, sd);
    }
  }
}

/* 포자 구름 — 안에 있으면 이동이 느려집니다 */
function dropSpore(x, y) {
  G.clouds.push({ x, y, r: 26, life: 210, max: 210, seed: Math.random() * 6.28 });
}

function queueBoss() {
  G.mode = 'boss-intro'; G.bossIntroT = 0;
  $('prompt').classList.add('hidden');
  Sfx.bossRoar(); G.shake = 24; G.flash = 1;
  glare(1);
  G.rings = [];
  // 보스방에 다시 들어오면(죽고 부활 포함) 눈부터 다시 싸웁니다
  G.morphed = false; G.morphT = 0; G.morphDark = 0; G.medpack = null;
  G.morphPre = MORPH_PRE; G.eyeMorph = null; G.corpse = null; G.deathT = 0;
  clearMorphSys();
  // 페이즈3에서 늘었던 체력칸은 눈 보스부터 다시 싸울 땐 원래대로
  if (P.max !== BALANCE.playerHp) { P.max = BALANCE.playerHp; P.hp = Math.min(P.hp, P.max); updateHud(); }
  Sfx.ambientStop();
  /* 던전 탐사 브금은 여기까지 — 버퍼째로 버려서, 보스 브금 두 개를 올릴
     자리를 비워 둡니다 (이 뒤로는 다시 쓰지 않습니다). */
  Sfx.dropDungeonBgm();
  Sfx.bossBgm('approach', false);     // 관문의 잔잔한 브금은 여운을 남기며 걷히고
  Sfx.bossBgm('boss3', false, true);  // 이전 판의 심연 브금이 남아 있으면 즉시 끊고
  Sfx.bossBgm('boss2', false, true);  // 다시 싸우는 경우 자기 자신도 처음부터
  Sfx.bossBgm('boss2', true);         // 싸움이 시작되는 순간부터 격렬한 브금
  Sfx.preloadBossBgm('boss3');        // 눈과 싸우는 동안 심연 브금을 미리 디코딩
  // 타임어택은 눈이 깨어나는 등장 연출 없이 바로 싸웁니다
  if (G.timeAttack) { makeBoss(); G.mode = 'play'; }
}

function makeBoss() {
  G.boss = {
    kind: 'eye',
    x: W / 2, y: 118, r: 34, hp: BALANCE.bossHp, max: BALANCE.bossHp,
    sp: BALANCE.bossSpeed, phase: 1, t: 0, cd: 110, dash: 0, wind: 0,
    spiralA: 0, flash: 0, kx: 0, ky: 0, spawned: false, bob: 0, rayT: 60
  };
}

/* ═══════════ 발사 ═════════════════════════════════════ */
function shoot(dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  G.bullets.push({
    x: P.x + dx / l * 10, y: P.y + dy / l * 10 - 3,
    vx: dx / l * BALANCE.bulletSpeed, vy: dy / l * BALANCE.bulletSpeed,
    life: BALANCE.bulletLife, r: 4, mine: true
  });
  P.fireCd = BALANCE.playerFireCd;
  Sfx.shoot();
}
function foeShot(x, y, dx, dy, sp) {
  const l = Math.hypot(dx, dy) || 1;
  G.bullets.push({ x, y, vx: dx / l * sp, vy: dy / l * sp, life: 220, r: 4.5, mine: false });
}

/* 주인공이 맞을 때와 같은 연출을 몹에게도 */
function damageFoe(f, dmg, vx, vy) {
  f.hp -= dmg;
  f.flash = BALANCE.foeFlash;
  const l = Math.hypot(vx, vy) || 1;
  f.kx += vx / l * BALANCE.knockback;
  f.ky += vy / l * BALANCE.knockback;
  G.shake = Math.max(G.shake, 3.5);
  spark(f.x, f.y, -vx, -vy);
  Sfx.hit();
}
function spark(x, y, vx, vy) {
  const l = Math.hypot(vx, vy) || 1;
  for (let i = 0; i < 7; i++) {
    const a = Math.atan2(vy / l, vx / l) + (Math.random() - .5) * 1.5;
    const sp = 1.2 + Math.random() * 2.2;
    G.fx.push({ k: 'p', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 16, max: 16, c: '#cfeee4' });
  }
}

/* ═══════════ 상호작용 ═════════════════════════════════ */
const nearWell = () => G.inForest && Math.hypot(P.x - G.well.x, P.y - G.well.y + 6) < 52;
const nearChest = () => G.chest && !G.chest.open && Math.hypot(P.x - G.chest.x, P.y - G.chest.y) < 34;
/* 이스터에그 ① — 숲 한구석 늙은 나무 밑동 */
const nearOldTree = () => G.inForest && Math.hypot(P.x - G.oldTree.x, P.y - G.oldTree.y + 10) < 40;
/* 이스터에그 ② — 숲 맨 위, 나무 사이로 난 좁은 틈 (지도 밖) */
const nearCreepyGap = () => G.inForest && !G.creepyOn &&
                            P.y <= G.gap.y + 16 && Math.abs(P.x - G.gap.x) < 26;
const nearFinalLock = () => !G.inForest && MAP[G.room].final &&
                            Math.hypot(P.x - (W - TS - 24), P.y - H / 2) < 46;

/* 잠긴 관문 앞인지 */
function nearLockedGate() {
  for (const d in G.doors) {
    const dr = G.doors[d];
    if (dr.lock !== 'keys') continue;
    const c = doorCenter(d);
    if (Math.hypot(P.x - c[0], P.y - c[1]) < 46) return d;
  }
  return null;
}
function doorCenter(d) {
  return { N: [W / 2, TS], S: [W / 2, H - TS], W: [TS, H / 2], E: [W - TS, H / 2] }[d];
}

/* 지하 첫 방에 들어서는 순간 — 탑뷰로 확 바뀌며 "두둥".
   일반 모드는 눈뜨기 연출 끝에서, 타임어택은 우물을 조사하자마자 옵니다. */
function enterDungeon() {
  Sfx.ring(0);                                  // 귀울림은 눈을 다 뜨면 끝
  loadRoom('start', 'W');
  Sfx.dungeonBgm(true);
  G.wake = G.timeAttack ? 0 : WAKE_DUR;
  G.shake = 28; G.flash = 1; glare(1.4);
  shockRing(W / 2, H / 2, 380, '255,236,198', 9, 46);
  shockRing(W / 2, H / 2, 250, '227,178,60', 6, 36);
}

function interact() {
  if (nearCreepyGap()) { beginCreepy(); return; }
  if (nearOldTree()) { openDoc(); return; }
  if (nearWell() && !G.wellUsed) {
    G.wellUsed = true;
    $('prompt').classList.add('hidden');   // 대사·추락 내내 상호작용 프롬프트가 남아있지 않도록
    // 타임어택은 추락·착지·눈뜨기 연출 없이 곧장 지하로
    if (G.timeAttack) { Sfx.ambientStop(); enterDungeon(); return; }
    say(FALL_LINES, () => {
      G.mode = 'fall'; G.fallT = 0; G.shake = 7;
      Sfx.fall(); Sfx.ambientStop();
      // "두둥" 은 여기서 터뜨리지 않습니다 — 떨어지는 소용돌이가 다 끝나고
      // 던전 안으로 들어서는 순간(암전이 풀리는 순간)에 맞춰 터뜨립니다.
      // (update() 의 'landing' 단계, LAND_BLACK 지점 참고)
    });
    return;
  }
  if (nearChest()) {
    if (G.keys < 1) { say([{ t: '잠겼네. 열쇠가 있어야겠다.', w: false }]); return; }
    G.keys--; G.chest.open = true; stateOf(G.room).chestOpen = true;
    updateHud(); Sfx.chest(); G.shake = 8;
    const heal = G.chest.heal || 0;
    const done = () => {
      if (heal) {
        for (let i = 0; i < heal; i++)
          G.pickups.push({ k: 'heart', x: G.chest.x + (i - (heal - 1) / 2) * 22,
                           y: G.chest.y - 22, bob: i });
        say([{ t: '상자 안이 따뜻하네. 좀 살 것 같다.', w: false }]);
      }
    };
    if (G.chest.note) openNote(NOTES[G.chest.note], done);
    else { Sfx.pickup(); done(); }
    return;
  }
  const gd = nearLockedGate();
  if (gd) {
    /* 관문 열쇠는 소모되지 않습니다 — 두 개를 모았다면 언제 눌러도 열립니다 */
    const blocked = gateBlocker();
    if (blocked === 'keys') {
      say([{ t: '자물쇠가 두 개네. 지금은 꽂을 열쇠가 없어.', w: false }]);
    } else if (blocked === 'explore') {
      say([{ t: '열쇠는 둘 다 꽂았는데 안 돌아가네. **아직 안 가 본 길이 있나 봐.**', w: true }]);
    } else {
      G.gateOpen = true;
      buildDoors(G.room); updateHud();
      Sfx.door(); G.shake = 10;
      say([{ t: '됐다, 풀렸어. 안쪽 길이 열렸다.', w: false }]);
    }
    return;
  }
  if (nearFinalLock()) {
    if (!G.finalKey) {
      say([{ t: '잠겼어. 아직 열쇠가 없는데.', w: false }]); return;
    }
    updateHud();
    if (G.timeAttack) beginEnding();         // 타임어택은 곧장 엔딩
    else say(ENDING_LINES, beginEnding);
  }
}

/* ═══════════ 쪽지 ═════════════════════════════════════ */
const NOTE_CPF = 0.42;                    // 쪽지는 대사보다도 한 박자 느리게, 눌러 쓴 글씨를 읽듯
let noteCb = null, noteTypeT = 0, noteHold = 0, noteFull = '', noteCut = '';
function openNote(n, cb) {
  noteCb = cb || null; G.mode = 'note';
  $('noteoverlay').classList.remove('hidden');
  $('notedate').textContent = n.date;
  $('notebody').innerHTML = '';
  noteFull = n.body; noteCut = n.cut; noteTypeT = 0; noteHold = 0;
}
function closeNote() {
  if (noteTypeT < noteFull.length) { noteTypeT = noteFull.length; noteHold = 0; renderNote(); return; }
  $('noteoverlay').classList.add('hidden');
  G.mode = 'play';
  const cb = noteCb; noteCb = null;
  if (cb) cb();
}
/* ── 이스터에그 서류 ─────────────────────────────────── */
function openDoc() {
  G.sawDoc = true;
  G.mode = 'doc';
  $('docoverlay').classList.remove('hidden');
  $('prompt').classList.add('hidden');
  Sfx.paper(true);                      // 서류철을 펼치는 종이 소리
}
function closeDoc() {
  Sfx.paper(false);                     // 덮는 소리
  $('docoverlay').classList.add('hidden');
  G.mode = 'forest';
}

/* ═══════════ 이스터에그 ② : 지도 밖으로 걸어 나가면 ══════
   숲 맨 위 나무 사이의 틈은 맵 경계입니다. 그 너머로 나가려 하면
   숲이 만들어진 것이라는 게 들통나고, 관찰자(제작진)가 화면에
   직접 끼어들어 세션을 강제로 초기화합니다.
   ═══════════════════════════════════════════════════════ */
let creepyTimers = [];
function beginCreepy() {
  if (G.creepyOn) return;
  G.creepyOn = true;
  G.mode = 'creepy';
  Sfx.ambientStop();
  Sfx.creepDrone(true);
  ['prompt', 'subtitle', 'hud'].forEach(id => $(id).classList.add('hidden'));

  const cr = $('creepy'), body = $('cr-body');
  body.innerHTML = '';
  cr.className = '';                       // hidden 해제 + 상태 클래스 초기화
  cr.classList.add('on');

  let t = 0;
  creepyTimers = CREEPY_SCRIPT.map(step => {
    const at = t; t += step.d;
    return setTimeout(() => creepyStep(step), at);
  });
}

function creepyStep(step) {
  const cr = $('creepy'), body = $('cr-body');
  switch (step.kind) {
    case 'dark':
      Sfx.glitch();
      break;

    case 'line': {
      const p = document.createElement('p');
      p.className = 'cr-line';
      p.textContent = step.t;
      body.appendChild(p);
      // 화면에는 최근 두 줄만 남깁니다 — 말이 쌓이면 공포가 아니라 안내문이 됩니다
      const lines = [...body.querySelectorAll('.cr-line')];
      lines.slice(0, -2).forEach(el => el.remove());
      lines.slice(-2).forEach((el, i, a) => {
        el.style.opacity = i === a.length - 1 ? 1 : .3;
      });
      Sfx.creepType();
      break;
    }

    case 'glitch':
      cr.classList.add('tear');
      Sfx.glitch();
      setTimeout(() => cr.classList.remove('tear'), 420);
      break;

    case 'log': {
      body.innerHTML = '';                 // 명단이 뜰 때는 화면을 비웁니다
      const box = document.createElement('div');
      box.className = 'cr-log';
      box.innerHTML =
        '<span class="cr-log-h">OBSERVATION LOG · DRM-07</span>' +
        '<span class="cr-log-s">관찰자</span>' +
        '<span class="cr-log-n">' + CREEPY_STAFF.join(' · ') + '</span>' +
        '<span class="cr-log-f">SESSION 001 – 141 · 전 구간 기록 보유</span>';
      body.appendChild(box);
      Sfx.reveal();
      break;
    }

    case 'scare':
      cr.classList.add('scare');
      Sfx.scream();
      G.shake = 30;
      break;

    case 'wipe':
      cr.classList.remove('scare');
      cr.classList.add('wipe');
      body.innerHTML = '<p class="cr-wipe-line">SUBJECT 07 — 관찰 사실 인지</p>' +
                       '<p class="cr-wipe-line d">세션 강제 초기화 … </p>';
      Sfx.creepDrone(false);
      Sfx.flatline(true);
      setTimeout(() => Sfx.flatline(false), 1600);
      break;

    case 'end':
      endCreepy();
      break;
  }
}

function endCreepy() {
  creepyTimers.forEach(clearTimeout); creepyTimers = [];
  Sfx.creepDrone(false);
  const cr = $('creepy');
  cr.className = 'hidden';
  $('cr-body').innerHTML = '';
  G.creepyOn = false;
  resetRun();                       // 들킨 세션은 처음부터 다시
}

function renderNote() {
  let html = noteFull.slice(0, Math.floor(noteTypeT)).replace(/\n/g, '<br>');
  if (noteTypeT >= noteFull.length) html += `<br><br><span class="cut">${noteCut}</span>`;
  $('notebody').innerHTML = html;
}

/* ═══════════ HUD ══════════════════════════════════════ */
function updateHud() {
  const h = $('hearts');
  if (h.children.length !== P.max) {
    h.innerHTML = '';
    for (let i = 0; i < P.max; i++) {
      const d = document.createElement('div'); d.className = 'heart'; h.appendChild(d);
    }
  }
  [...h.children].forEach((el, i) => el.classList.toggle('empty', i >= P.hp));
  syncKeys();   // 관문 열쇠는 저장값이 아니라 "비운 방"에서 매번 다시 셉니다
  $('keycount').textContent = G.keys;
  $('gatecount').textContent = `${G.doorKeys}/${DOOR_KEYS_NEEDED}`;
  $('gatekeys').classList.toggle('done', G.doorKeys >= DOOR_KEYS_NEEDED);
  // 일반 모드에서는 시계 대신 "몇 개의 방을 밟았는가"를 보여 줍니다
  const eb = $('explorebox');
  if (eb) {
    eb.classList.toggle('hidden', G.timeAttack || G.inForest || G.mode === 'title');
    $('exploretext').textContent = `${exploreDone()} / ${EXPLORE_ROOMS.length}`;
    eb.classList.toggle('done', exploreAll());
  }
  // 고른 난이도도 같은 자리에 (타임어택은 난이도가 없으므로 숨깁니다)
  const db = $('diffbox');
  if (db) {
    db.classList.toggle('hidden', G.timeAttack || G.inForest || G.mode === 'title');
    $('difftext').textContent = G.diffName;
    db.classList.toggle('d-easy', G.diff === 'easy');
    db.classList.toggle('d-hard', G.diff === 'hard');
  }
}
function bumpKeys(sel) {
  const el = $(sel); el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}

function hurt(n) {
  if (P.inv > 0 || P.dead) return;
  if (G.dev && G.devGod) return;          // 개발자 모드 · 무적
  P.hp -= n; P.inv = BALANCE.invFrames;
  Sfx.hurt(); G.shake = 11; G.flash = Math.max(G.flash, .5);
  updateHud();
  const hs = $('hearts').children[Math.max(0, P.hp)];
  if (hs) { hs.classList.add('hit'); setTimeout(() => hs.classList.remove('hit'), 320); }
  if (P.hp <= 0) {
    P.hp = 0; P.dead = true; G.mode = 'dead';
    stopRun();                       // 기록은 저장하지 않습니다 (축제판은 "어디까지 갔는지"로 순위판에 남김)
    const fest = G.timeAttack && window.Festival && Festival.on && Festival.player;
    $('fest-dead').classList.toggle('hidden', !fest); $('fest-next').classList.toggle('hidden', !fest);
    $('dead').classList.toggle('fest', !!fest);              // "기록이 남지 않습니다" 대신 순위판 줄
    if (fest) {
      const pr = runProgress(), fd = $('fest-dead');
      fd.textContent = `순위판에 「${pr.stage}」까지로 올리는 중…`;
      Festival.fail(RUN.elapsed, pr).then(rank => {
        fd.textContent = rank ? `${Festival.player.name} 님 — 「${pr.stage}」까지, 순위판 ${rank}위` : `「${pr.stage}」까지 — 이 기기에 저장했어요 (연결되면 순위판에)`;
      });
    }
    $('deadtime').textContent = fmtTime(RUN.elapsed);
    // 일반 모드에서는 시간을 재지 않으니 기록 문구도 보여 주지 않습니다
    $('dead').classList.toggle('casual', !G.timeAttack);
    $('retrybtn').textContent = fest ? '같은 사람으로 다시 (R)' : G.timeAttack ? '처음부터 다시 (R)' : abomCheckpoint() ? '심연부터 다시 (R)' : '이어서 다시 (R)';
    $('dead').classList.remove('hidden');
    Sfx.flatline(true);
    Sfx.dungeonBgmDuck(true); Sfx.bossBgmDuck(true);   // 플랫라인 비프가 묻히지 않도록 브금을 낮춥니다
    setTimeout(() => Sfx.flatline(false), 1400);
  }
}

/* ═══════════ 이펙트 ═══════════════════════════════════ */
function glitchDeath(x, y, big) {
  G.fx.push({ k: 'glitch', x, y, life: big ? 58 : 36, max: big ? 58 : 36,
              chars: Array.from({ length: big ? 16 : 9 },
                () => ({ c: '01<>{}#%$&*'[(Math.random() * 11) | 0],
                         dx: (Math.random() - .5) * (big ? 100 : 54),
                         dy: (Math.random() - .5) * (big ? 100 : 54) })) });
  Sfx.glitch();
  G.flash = Math.max(G.flash, big ? 1 : .55);
  $('glitchbar').classList.remove('on');
  void $('glitchbar').offsetWidth;
  $('glitchbar').classList.add('on');
  if (!G.seenGlitch && !big && !G.timeAttack) {
    G.seenGlitch = true;
    setTimeout(() => { if (G.mode === 'play') say(GLITCH_LINES); }, 420);
  }
}
/* ── 보스전 연출 ─────────────────────────────────────────
   퍼져 나가는 충격파 고리 · 화면을 덮는 섬광 · 바닥을 훑는 빛줄기.
   싸움이 "번쩍이고 흔들리는" 구간이 되도록 공격마다 붙여 둡니다. */
function shockRing(x, y, max, c, w = 4, life = 34) {
  G.rings.push({ x, y, r: 6, max, life, maxLife: life, c, w });
}
function glare(v) { G.glare = Math.min(1.4, Math.max(G.glare, v)); }

/* 화면 전체 연출 — 모드와 상관없이 매 프레임 흘러갑니다 (update() 맨 위) */
function tickScreenFx() {
  G.rings = G.rings.filter(r => {
    r.life--;
    const k = 1 - r.life / r.maxLife;
    r.r = 6 + (r.max - 6) * (1 - Math.pow(1 - k, 2.4));   // 처음에 확 퍼지고 끝에서 느려짐
    return r.life > 0;
  });
  if (G.glare > 0) G.glare = Math.max(0, G.glare - .055);
}

/* 월드 파티클 — 실제로 방이 돌아가는 동안에만 흘러갑니다 */
function tickFx() {
  G.fx = G.fx.filter(f => {
    f.life--;
    if (f.k === 'p') { f.x += f.vx; f.y += f.vy; f.vx *= .92; f.vy *= .92; }
    else if (f.k === 'suck') {            // 눈으로 빨려 들어가는 빛 알갱이
      f.x += (f.tx - f.x) * .17;
      f.y += (f.ty - f.y) * .17;
    }
    else if (f.k === 'dust') { f.y += f.vy; f.vy *= 1.01; }   // 어둠 속 흙먼지
    return f.life > 0;
  });
}

function puff(x, y, c) {
  for (let i = 0; i < 6; i++)
    G.fx.push({ k: 'p', x, y, vx: (Math.random() - .5) * 2.4, vy: (Math.random() - .5) * 2.4,
                life: 20, max: 20, c });
}

/* ═══════════ 업데이트 ═════════════════════════════════ */
function update() {
  G.t++;
  /* 화면 전체에 걸리는 연출(흔들림·섬광·충격파·암전 걷힘)은 대사창이 떠
     있든 무슨 모드든 항상 흘러가야 합니다. 예전엔 이것들이 'play' 경로의
     tickFx() 안에만 있어서, 착지 직후 방 인트로 대사가 뜨면 섬광과 충격파
     고리가 그 자리에 얼어붙어 있었습니다. */
  if (G.shake > 0) G.shake *= .86;
  if (G.flash > 0) G.flash = Math.max(0, G.flash - .035);
  if (G.wake > 0) G.wake--;
  tickScreenFx();
  tickAwayMsg();                                   // 이스터에그 ⑤ — 게임을 멈추지 않는 속삭임

  if (G.mode === 'talk') { tickTalk(); return; }
  if (G.mode === 'note') {
    if (noteTypeT < noteFull.length) {
      if (noteHold > 0) { noteHold--; }
      else {
        noteTypeT += NOTE_CPF;
        const ch = noteFull[Math.floor(noteTypeT) - 1];
        if (ch && TALK_PAUSE[ch]) noteHold = TALK_PAUSE[ch];
      }
      renderNote();
    }
    return;
  }
  if (G.mode === 'doc') return;   // 서류를 보는 동안은 시간이 멈춥니다
  if (G.mode === 'opening') { tickOpening(); return; }
  if (G.mode === 'fall') {
    G.fallT++;
    if (G.fallT > FALL_DUR) { G.mode = 'landing'; G.landT = 0; }
    return;
  }
  if (G.mode === 'landing') {
    G.landT++;
    const k = G.landT / LAND_BLACK;
    // 암흑 속에서 울림이 점점 크게 — 뭔가 오고 있다는 예감
    G.shake = Math.max(G.shake, 0.6 + k * k * 4.5);
    if (G.landT === 6)  Sfx.landThump(0.32);     // 바닥에 닿는 둔탁한 충격
    if (G.landT === 30) Sfx.landThump(0.20);     // 한 박자 뒤 되울림
    if (G.landT === 52) Sfx.landThump(0.11);     // 저 위에서 흙이 떨어져 내림
    // 어둠 속으로 흙먼지가 계속 떨어집니다
    if (G.landT % 2 === 0)
      G.fx.push({ k: 'dust', x: Math.random() * W, y: -6,
                  vy: 1.2 + Math.random() * 2.6, life: 70, max: 70 });
    tickFx();

    // 암전이 걷히면 1인칭 — 우물 바닥에 누운 채 천장을 올려다봅니다
    if (G.landT >= LAND_BLACK) { G.mode = 'wakeup'; G.eyeT = 0; }
    return;
  }
  if (G.mode === 'wakeup') {
    G.eyeT++;
    // 눈꺼풀이 실제로 움직이기 시작하는 순간에 맞춰 — 뜰 땐 '쩍' + 들이쉼, 감길 땐 '스윽…톡' + 내쉼
    for (const ev of EYE_SFX) if (ev.t === G.eyeT) {
      Sfx.lid(ev.open, ev.amp, ev.dur);
      if (ev.open && ev.amp > .25) Sfx.inhale(.035 + ev.amp * .05, .45 + ev.amp * .3);
      if (!ev.open && ev.amp > .25 && ev.t < EYE_OPEN_T) Sfx.exhale(.03 + ev.amp * .03, .6);
    }
    // 떨어진 충격의 귀울림 — 눈을 뜰수록 잦아들고, 다 뜨면 사라짐. 그동안 먹먹한 심장이 점점 느려짐
    Sfx.ring(G.eyeT < EYE_OPEN_T + 40 ? Math.max(0, 1 - G.eyeT / (EYE_OPEN_T + 40)) * (.55 + .45 * (1 - eyeOpen(G.eyeT))) : 0);
    if (G.eyeT === 1) G.heartNext = 20;
    if (G.eyeT < EYE_OPEN_T && G.eyeT >= G.heartNext) {      // 처음엔 빠르게, 정신이 들수록 느려짐
      Sfx.heartMuffled(.22 * (1 - G.eyeT / EYE_OPEN_T) + .06); G.heartNext = G.eyeT + Math.round(46 + G.eyeT * .16);
    }
    if (G.eyeT % 3 === 0)
      G.fx.push({ k: 'dust', x: Math.random() * W, y: -6,
                  vy: .6 + Math.random() * 1.5, life: 130, max: 130 });
    tickFx();

    /* 눈을 완전히 뜨는 순간 — 탑뷰로 확 바뀌면서 "두둥" 이 크게 터집니다 */
    if (G.eyeT >= WAKE_EYE) enterDungeon();
    return;
  }
  if (G.mode === 'boss-intro') {
    G.bossIntroT++;
    tickFx();
    // 눈이 뜨이기까지 — 땅이 점점 세게 울리고, 세 번 크게 번쩍입니다
    G.shake = Math.max(G.shake, 1.5 + (G.bossIntroT / 90) * 7);
    if (G.bossIntroT === 30 || G.bossIntroT === 58) {
      Sfx.hit(); glare(.7); G.shake = 16;
      shockRing(W / 2, 118, 200, '194,53,44', 5, 30);
    }
    if (G.bossIntroT === 88) {
      Sfx.bossRoar(); glare(1.3); G.shake = 26; G.flash = 1;
      shockRing(W / 2, 118, 340, '255,255,255', 8, 44);
      shockRing(W / 2, 118, 240, '150,60,220', 6, 36);
    }
    if (G.bossIntroT > 90 && !G.boss) makeBoss();
    if (G.bossIntroT > 130) G.mode = 'play';
    return;
  }
  if (G.mode === 'morph') { tickMorph(); return; }
  if (G.mode === 'abomdeath') { tickAbomDeath(); return; }
  if (G.mode === 'doze') { tickDoze(); return; }
  if (G.mode !== 'play' && G.mode !== 'forest') return;

  const forest = G.inForest;

  /* ── 이동 ─────────────────────────────────────────── */
  let mx = 0, my = 0;
  if (down('a', 'A', 'ㅁ') || codeDown.KeyA) mx--;      // 글자 + 자리(code) 둘 다 — 한/영 · Caps Lock 상관없이
  if (down('d', 'D', 'ㅇ') || codeDown.KeyD) mx++;
  if (down('w', 'W', 'ㅈ') || codeDown.KeyW) my--;
  if (down('s', 'S', 'ㄴ') || codeDown.KeyS) my++;
  if (!mx && !my && forest) {          // 숲에선 방향키로도 이동
    if (key.ArrowLeft) mx--; if (key.ArrowRight) mx++;
    if (key.ArrowUp) my--;   if (key.ArrowDown) my++;
  }
  if (!mx && !my && TOUCH.joy && Math.hypot(TOUCH.joy.dx, TOUCH.joy.dy) > 8) { mx = TOUCH.joy.dx; my = TOUCH.joy.dy; }   // 휴대폰 조이스틱
  const ml = Math.hypot(mx, my);
  // 숲에서는 조금 더 느긋하게 걷습니다 (던전 전투 속도는 그대로 유지)
  const spd = BALANCE.playerSpeed * (forest ? BALANCE.forestSpeedMult : 1)
            * (P.slow > 0 ? BALANCE.slowMult : 1);   // 포자에 닿으면 느려집니다
  if (ml) {
    P.x += mx / ml * spd;
    P.y += my / ml * spd;
    // 보폭(걷는 속도)이 실제 이동 속도에 비례해야 발이 미끄러지지 않고
    // 자연스러운 걸음걸이로 보입니다
    P.walkPhase += spd * 0.1023; P.anim += spd * 0.0744;
    P.walkAmt += (1 - P.walkAmt) * 0.35;        // 걷기 시작 → 부드럽게 리듬 붙기
    P.dir = Math.abs(mx) >= Math.abs(my) ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'down' : 'up');   // 조이스틱은 기운 쪽이 큰 방향
    const stepEvery = Math.round(20 * BALANCE.playerSpeed / spd);
    if (++P.stepT % stepEvery === 0) Sfx.step();
  } else {
    P.walkAmt *= 0.78;                          // 멈춤 → 부드럽게 리듬 가라앉기
    P.anim = 0;
  }

  clampPlayer(forest);
  checkDoze();                                   // 이스터에그 ④ — 가만히 있으면 꿈속에서 졸기 시작

  if (P.inv > 0) P.inv--;
  if (P.fireCd > 0) P.fireCd--;

  /* ── 사격 ─────────────────────────────────────────── */
  if (!forest && P.fireCd <= 0) {
    let ax = 0, ay = 0;
    for (const k in AIM) if (key[k]) { ax += AIM[k][0]; ay += AIM[k][1]; }
    if (!ax && !ay && TOUCH.aim) { const t = touchAimAt(); if (t) { ax = t.x - P.x; ay = t.y - P.y; } }   // 휴대폰 — 누르고 있는 적
    if (!ax && !ay && mouse.down) { ax = mouse.x + CAM.x - P.x; ay = mouse.y + CAM.y - P.y; }
    if (ax || ay) {
      shoot(ax, ay);
      if (!ml) P.dir = Math.abs(ax) > Math.abs(ay)
        ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
    }
  }

  if (forest) { updateForest(); return; }

  /* ── 탄환 ─────────────────────────────────────────── */
  G.bullets = G.bullets.filter(b => {
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0) return false;
    if (b.x < TS - 2 || b.x > W - TS + 2 || b.y < TS - 2 || b.y > H - TS + 2 ||
        (G.props.length && propBlocksShot(G.props, b.x, b.y))) {
      puff(b.x, b.y, b.mine ? '#bfe9dd' : '#c2352c');
      return false;
    }
    if (b.mine) {
      for (const f of G.foes) {
        if (f.warp) continue;                      // 점멸 중에는 맞지 않습니다
        if (Math.hypot(b.x - f.x, b.y - f.y) < f.r + b.r) {
          damageFoe(f, BALANCE.bulletDmg, b.vx, b.vy);
          if (f.hp <= 0) killFoe(f);
          return false;
        }
      }
      for (const p of G.pots) {
        if (p.dead) continue;
        if (Math.abs(b.x - p.x) < 13 && Math.abs(b.y - p.y) < 14) {
          p.dead = true; stateOf(G.room).pots[p.i] = false;
          Sfx.pot(); puff(p.x, p.y, '#b98b1e');
          if (Math.random() < .5 && P.hp < P.max)
            G.pickups.push({ k: 'heart', x: p.x, y: p.y, bob: 0 });
          return false;
        }
      }
      const B = G.boss;
      if (B && Math.hypot(b.x - B.x, b.y - B.y) < B.r + b.r) {
        B.hp -= BALANCE.bulletDmg; B.flash = BALANCE.foeFlash;
        const l = Math.hypot(b.vx, b.vy) || 1;
        // 페이즈3는 덩치가 커서 총알에 잘 밀리지 않습니다
        const kb = B.kind === 'abom' ? .55 : 1.6;
        B.kx += b.vx / l * kb; B.ky += b.vy / l * kb;
        spark(b.x, b.y, -b.vx, -b.vy);
        G.shake = Math.max(G.shake, 2.5); Sfx.hit();
        if (B.hp <= 0) (B.kind === 'abom' ? killBoss : beginMorph)();
        return false;
      }
    } else if (P.inv <= 0 && Math.hypot(b.x - P.x, b.y - P.y) < P.r + b.r) {
      hurt(1); return false;
    }
    return true;
  });

  /* ── 적 ───────────────────────────────────────────── */
  G.foes = G.foes.filter(f => !f.dead);
  G.foes.forEach(f => {
    if (f.flash > 0) f.flash--;
    f.bob += .12;
    f.x += f.kx; f.y += f.ky;               // 넉백
    f.kx *= .78; f.ky *= .78;
    const fx0 = f.x, fy0 = f.y;              // 여기서부터 움직인 만큼이 이번 프레임에 가려던 길 (넉백 빼고)
    const dx = P.x - f.x, dy = P.y - f.y, d = Math.hypot(dx, dy) || 1;
    // 몸이 향하는 쪽 — 돌진 중에는 튀어나간 방향으로 굳습니다
    f.face = f.dash > 0 ? (f.dvx < 0 ? -1 : 1) : (dx < 0 ? -1 : 1);
    if (f.type === 'spitter') {
      // 거리를 재며 침을 뱉습니다
      if (d < 120) { f.x -= dx / d * f.sp; f.y -= dy / d * f.sp; }
      else { f.x += dx / d * f.sp * .5; f.y += dy / d * f.sp * .5; }
      if (--f.cd <= 0) { f.cd = BALANCE.spitterCd; foeShot(f.x, f.y, dx, dy, BALANCE.spore); }

    } else if (f.type === 'sporer') {
      // 느릿하게 따라오며 지나간 자리에 포자를 흘립니다
      f.x += dx / d * f.sp; f.y += dy / d * f.sp;
      if (--f.cd <= 0) { f.cd = BALANCE.sporerCd; dropSpore(f.x, f.y); Sfx.pot(); }

    } else if (f.type === 'charger') {
      if (f.dash > 0) {                       // 돌진 중 — 직선으로 튀어 나갑니다
        f.x += f.dvx; f.y += f.dvy;
        f.dash--;
        if (f.x <= TS + f.r || f.x >= W - TS - f.r ||
            f.y <= TS + f.r || f.y >= H - TS - f.r) f.dash = 0;
      } else if (f.wind > 0) {                // 예비 동작 — 피할 시간을 줍니다
        if (--f.wind === 0) {
          const l = Math.hypot(dx, dy) || 1;
          f.dvx = dx / l * BALANCE.chargerDash;
          f.dvy = dy / l * BALANCE.chargerDash;
          f.dash = 20; Sfx.bossRoar();
        }
      } else {
        f.x += dx / d * f.sp; f.y += dy / d * f.sp;
        if (--f.cd <= 0 && d < 190) { f.cd = BALANCE.chargerCd; f.wind = BALANCE.chargerWind; }
      }

    } else if (f.type === 'blinker') {
      if (f.warp > 0) {                       // 사라졌다 나타나는 중
        if (--f.warp === 0) {
          const a = Math.random() * Math.PI * 2, rr = 52 + Math.random() * 26;
          f.x = Math.max(TS + f.r, Math.min(W - TS - f.r, P.x + Math.cos(a) * rr));
          f.y = Math.max(TS + f.r, Math.min(H - TS - f.r, P.y + Math.sin(a) * rr));
          glitchDeath(f.x, f.y, false);
        }
      } else {
        f.x += dx / d * f.sp; f.y += dy / d * f.sp;
        if (--f.cd <= 0) { f.cd = BALANCE.blinkerCd; f.warp = 26; glitchDeath(f.x, f.y, false); }
      }

    } else {
      f.x += dx / d * f.sp; f.y += dy / d * f.sp;
    }
    const fmx = f.x - fx0, fmy = f.y - fy0;  // 벽 · 장애물에 막히기 전, 가려던 만큼
    f.x = Math.max(TS + f.r, Math.min(W - TS - f.r, f.x));
    f.y = Math.max(TS + f.r, Math.min(H - TS - f.r, f.y));
    if (G.props.length && pushOutOfProps(G.props, f, f.r) && f.dash > 0) f.dash = Math.min(f.dash, 2);   // 돌진하다 부딪히면 멈칫
    if (G.props.length && !(f.dash > 0) && !f.warp)           // 침대 · 기둥에 막히면 모서리를 따라 돌아감
      propSlide(G.props, f, f.r, fmx, fmy, [TS + f.r, TS + f.r], [W - TS - f.r, H - TS - f.r]);
    // 점멸 중(사라진 상태)에는 부딪히지 않습니다
    if (!f.warp && d < f.r + P.r - 2) hurt(1);
  });

  /* ── 포자 구름 ─────────────────────────────────────── */
  G.clouds = G.clouds.filter(c => {
    c.life--;
    const rr = c.r * (0.55 + (1 - c.life / c.max) * 0.45);   // 시간이 지날수록 퍼집니다
    if (Math.hypot(P.x - c.x, P.y - c.y) < rr) P.slow = BALANCE.slowFrames;
    return c.life > 0;
  });
  if (P.slow > 0) P.slow--;
  /* 방을 비웠는지는 "몹이 사라진 그 한 프레임"이 아니라 매 프레임 상태로 봅니다.
     보상 대사가 뜨는 동안 방을 넘어가거나 하면 그 순간을 놓칠 수 있었고,
     그게 열쇠를 분명 먹었는데 관문이 안 열리던 원인이었습니다. */
  /* 'play' 일 때만 봅니다 — 총알이 보스의 마지막 체력을 깎아 변신 컷신으로
     넘어간 그 프레임에, 아래 조건이 "방이 비었다"고 잘못 읽어서 보상 대사가
     컷신 위로 튀어나오는 일이 있었습니다. */
  if (!G.inForest && G.mode === 'play' && !G.boss && !G.foes.length && !stateOf(G.room).cleared)
    onRoomCleared();

  if (G.boss) (G.boss.kind === 'abom' ? updateAbom : updateBoss)();

  /* ── 픽업 ─────────────────────────────────────────── */
  if (G.floorKey) {
    G.floorKey.bob += .07;
    if (Math.hypot(P.x - G.floorKey.x, P.y - G.floorKey.y) < 20) {
      G.floorKey = null; stateOf(G.room).keyTaken = true;
      G.keys++; updateHud(); Sfx.keyGet(); bumpKeys('keys');
      say([{ t: '오방색 매듭이 달린 낡은 열쇠네. …근데 왜 이렇게 낯이 익지.', w: true }]);
    }
  }
  G.pickups = G.pickups.filter(p => {
    p.bob += .09;
    if (Math.hypot(P.x - p.x, P.y - p.y) < 18) {
      if (p.k === 'heart' && P.hp < P.max) { P.hp++; updateHud(); }
      Sfx.pickup(); return false;
    }
    return true;
  });

  tickFx();

  // 이 틱 도중 onRoomCleared() 가 보상 대사를 띄웠다면(모드가 'talk' 로
  // 바뀌었다면) 문턱에 서 있었다는 이유만으로 그 대사를 건너뛰고 곧장
  // 다음 방으로 넘어가 버리는 일이 없도록 여기서 다시 확인합니다.
  if (G.mode === 'play') {
    checkDoorTransit();
    updatePrompt();
  }
}

/* 방을 비웠을 때 보상 */
function onRoomCleared() {
  const s = stateOf(G.room), r = MAP[G.room];
  s.cleared = true;
  if (s.rewarded || !r.clear) return;
  s.rewarded = true;
  if (r.clear === 'doorKey') {
    updateHud(); Sfx.keyGet(); bumpKeys('gatekeys');
    say([{ t: `마지막 하나가 사라진 자리, 관문 열쇠가 남아 있다. (${G.doorKeys}/${DOOR_KEYS_NEEDED})`, w: false }]);
  } else {
    G.keys++; updateHud(); Sfx.keyGet(); bumpKeys('keys');
    say([{ t: '어, 사라진 자리에 열쇠가 떨어져 있네.', w: false }]);
  }
}

/* ── 플레이어 위치 제한 + 문 통로 개방 ─────────────────── */
function clampPlayer(forest) {
  if (forest) {
    P.x = Math.max(12, Math.min(W - 12, P.x));
    P.y = Math.max(26, Math.min(H - 12, P.y));
    // 나무는 배경 그림이 아니라 실제로 막아서는 몸통입니다 — 밑동에서
    // 원형으로 밀어냅니다 (캔버스에 그려지는 좌표를 그대로 씁니다)
    for (const [tx, ty, s] of FOREST_TREES) {
      const r = s * 0.30 + P.r;
      const dx = P.x - tx, dy = P.y - ty;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < r) {
        P.x = tx + dx / dist * r;
        P.y = ty + dy / dist * r;
      }
    }
    return;
  }
  const pad = TS + P.r + 2;
  let minX = pad, maxX = W - pad, minY = pad, maxY = H - pad;
  const bx = Math.abs(P.x - W / 2) < 20, by = Math.abs(P.y - H / 2) < 20;
  const open = d => G.doors[d] && !G.doors[d].lock;
  if (open('W') && by) minX = TS - 8;
  if (open('E') && by) maxX = W - TS + 8;
  if (open('N') && bx) minY = TS - 8;
  if (open('S') && bx) maxY = H - TS + 8;
  P.x = Math.max(minX, Math.min(maxX, P.x));
  P.y = Math.max(minY, Math.min(maxY, P.y));
  if (G.props.length) pushOutOfProps(G.props, P, P.r);   // 침대 · 기둥 · 서류장 같은 장애물
}

function checkDoorTransit() {
  if (G.foes.length || G.boss) return;      // 적이 남아 있으면 문이 막힌다
  const go = (d) => { Sfx.door(); loadRoom(G.doors[d].to, OPP[d]); };
  if (G.doors.W && !G.doors.W.lock && P.x <= TS - 6) return go('W');
  if (G.doors.E && !G.doors.E.lock && P.x >= W - TS + 6) return go('E');
  if (G.doors.N && !G.doors.N.lock && P.y <= TS - 6) return go('N');
  if (G.doors.S && !G.doors.S.lock && P.y >= H - TS + 6) return go('S');
}

function updatePrompt() {
  syncKeys();
  let pr = '';
  if (nearOldTree()) pr = G.sawDoc ? '서류 다시 보기' : '나무 밑동에 낀 무언가';
  else if (nearWell() && !G.wellUsed) pr = '우물 들여다보기';
  else if (nearChest()) pr = G.keys > 0 ? '상자 열기' : '잠긴 상자 (열쇠 필요)';
  else if (nearCreepyGap()) pr = '나무 사이 좁은 틈으로';
  else if (nearFinalLock()) pr = G.finalKey ? '마지막 열쇠 꽂기' : '잠금장치';
  else if (nearLockedGate()) {
    const blocked = gateBlocker();
    if (!blocked) pr = '관문 열기';
    else if (blocked === 'keys') pr = `관문 잠김 · ⛨ ${G.doorKeys}/${rule().keys}`;
    else pr = `관문 잠김 · 탐사 ${exploreDone()}/${EXPLORE_ROOMS.length}`;
  }
  if (pr) { $('prompt').classList.remove('hidden'); $('prompttext').textContent = pr; }
  else $('prompt').classList.add('hidden');
}

/* ═══════════ 지상 업데이트 ════════════════════════════ */
function updateForest() {
  const near = nearWell();
  G.well.glow += ((near ? 1 : .25) - G.well.glow) * .05;
  G.butterflies.forEach(b => {
    b.a += (Math.random() - .5) * .35;
    b.x += Math.cos(b.a) * b.s; b.y += Math.sin(b.a) * b.s * .6;
    if (b.x < 20 || b.x > W - 20) b.a = Math.PI - b.a;
    if (b.y < 30 || b.y > H - 20) b.a = -b.a;
    if (b.gl > 0) b.gl--;
    if (Math.random() < .0007) { b.gl = 8; b.x += (Math.random() - .5) * 40; }
  });
  if (Math.random() < .006) Sfx.bird();
  if (Math.random() < .0035) { Sfx.beep(.065); G.flash = Math.max(G.flash, .12); }
  updatePrompt();
}

/* ═══════════ 보스 AI ══════════════════════════════════ */
function updateBoss() {
  const B = G.boss;
  if (B.hp <= 0) { beginMorph(); return; }
  B.t++; B.bob += .05;
  if (B.flash > 0) B.flash--;
  B.x += B.kx; B.y += B.ky; B.kx *= .8; B.ky *= .8;

  const r = B.hp / B.max;
  const ph = r > .66 ? 1 : r > .33 ? 2 : 3;
  if (ph !== B.phase) {
    B.phase = ph; G.shake = 22; G.flash = 1; Sfx.bossRoar();
    // 단계가 바뀔 때 : 흰 섬광 + 충격파 두 겹 + 바닥을 훑는 빛줄기
    glare(1.2);
    shockRing(B.x, B.y, 300, '255,255,255', 7, 40);
    shockRing(B.x, B.y, 210, '194,53,44', 5, 34);
    B.rayT = 90;
    if (P.hp < P.max) G.pickups.push({ k: 'heart', x: W / 2, y: H - 72, bob: 0 });
    if (ph === 3 && !B.spawned) {
      B.spawned = true;
      spawnFoe('shroom', 90, 90); spawnFoe('shroom', W - 90, 90);
    }
  }

  // 눈이 깨어 있는 동안 바닥이 계속 잘게 떨립니다 (단계가 오를수록 세게)
  G.shake = Math.max(G.shake, 0.9 + ph * 0.55);
  if (B.rayT > 0) B.rayT--;

  const dx = P.x - B.x, dy = P.y - B.y, d = Math.hypot(dx, dy) || 1;
  const sp = B.sp * (ph === 3 ? 1.5 : ph === 2 ? 1.15 : 1);

  if (B.dash > 0) {
    B.dash--; B.x += B.dvx; B.y += B.dvy; B.dvx *= .95; B.dvy *= .95;
    // 돌진 중에는 지나온 자리에 빛 잔상이 남습니다
    if (B.dash % 2 === 0)
      G.fx.push({ k: 'trail', x: B.x, y: B.y, life: 16, max: 16, r: B.r });
    G.shake = Math.max(G.shake, 5);
  }
  else if (B.wind > 0) {
    B.wind--;
    // 예비 동작 — 사방의 빛이 눈 쪽으로 빨려 들어갑니다
    if (B.wind % 3 === 0) {
      const a = Math.random() * 6.28, dist = 70 + Math.random() * 40;
      G.fx.push({ k: 'suck', x: B.x + Math.cos(a) * dist, y: B.y + Math.sin(a) * dist,
                  tx: B.x, ty: B.y, life: 18, max: 18,
                  c: B.windKind === 'dash' ? '#ffb37a' : '#c9a0ff' });
    }
    if (B.wind === 0) {
      if (B.windKind === 'dash') {
        B.dash = 26; B.dvx = dx / d * 4.6; B.dvy = dy / d * 4.6; Sfx.bossRoar();
        G.shake = Math.max(G.shake, 15); glare(.6);
        shockRing(B.x, B.y, 150, '255,179,122', 5, 26);
      } else {
        const n = (ph === 1 ? 8 : 12) + (BALANCE.bossRingAdd || 0), off = Math.random() * 6.28;
        bossRing(B, n, off, ph);
        // 여러 겹 — 첫 고리 뒤로 같은 수의 고리가 반 칸씩 돌아 가며 더 날아옵니다
        B.waveLeft = (ph === 1 ? BALANCE.bossRingWaves1 : BALANCE.bossRingWaves) - 1;
        B.waveT = 14; B.waveN = n; B.waveOff = off; B.wavePh = ph;
        Sfx.glitch();
        G.shake = Math.max(G.shake, 12); glare(.75);
        shockRing(B.x, B.y, 230, '201,160,255', 6, 32);
      }
    }
  } else {
    B.x += dx / d * sp; B.y += dy / d * sp;
    if (--B.cd <= 0) {
      B.cd = Math.round((ph === 1 ? 150 : ph === 2 ? 120 : 96) * BALANCE.bossCdMul);
      B.wind = Math.round(32 * BALANCE.bossWindMul);
      B.windKind = (ph >= 2 && Math.random() < .45) ? 'dash' : 'ring';
    }
  }
  if (B.waveLeft > 0 && --B.waveT <= 0) {           // 남은 겹
    B.waveLeft--; B.waveT = 14;
    B.waveOff += Math.PI / B.waveN;                  // 반 칸 돌려서 — 빠져나갈 틈이 매번 옮겨 감
    bossRing(B, B.waveN, B.waveOff, B.wavePh);
    Sfx.glitch(); G.shake = Math.max(G.shake, 7);
  }
  if (ph === 3 && B.t % Math.round(11 * BALANCE.bossSpiralMul) === 0) {
    B.spiralA += .78;
    foeShot(B.x, B.y, Math.cos(B.spiralA), Math.sin(B.spiralA), 1.5 * BALANCE.bossShotMul);
  }
  B.x = Math.max(TS + B.r, Math.min(W - TS - B.r, B.x));
  B.y = Math.max(TS + B.r, Math.min(H - TS - B.r, B.y));
  if (d < B.r * .72 + P.r) hurt(1);
}

/* 눈의 원형 포자 한 겹 */
function bossRing(B, n, off, ph) {
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    foeShot(B.x, B.y, Math.cos(a), Math.sin(a), (BALANCE.spore + (ph - 1) * .25) * BALANCE.bossShotMul);
  }
}

function killBoss() {
  const B = G.boss;
  // 보스전 정리 — 어느 모드든 똑같이
  G.boss = null; G.bossDead = true;
  G.foes = [];
  G.bullets = G.bullets.filter(b => b.mine);
  stateOf(G.room).cleared = true;
  buildDoors(G.room);
  Sfx.ambient('dungeon');
  if (G.timeAttack) quickAbomDeath(B);
  else beginAbomDeath(B);          // 무너지는 컷신 — 끝에 열쇠와 대사
}

/* ═══════════ 페이즈3 — 「심연」 ═══════════════════════════
   눈을 터뜨렸다고 끝이 아닙니다. 터진 자리의 바닥이 갈라지고,
   눈을 껍데기로 쓰고 있던 것이 쇳덩이와 살점을 끌며 기어 나옵니다.

   변신 컷신(morph) 순서
     ①   0~46  : 눈이 안으로 무너짐. 빛이 중심으로 빨려 들며 암전.
     ②  46~72  : 완전한 어둠과 정적. 낮게 한 번 쿵.
     ③  72~170 : 바닥이 갈라지고 실루엣이 아래에서부터 솟아오름.
     ④ 170~206 : 색이 번지듯 드러나고, 가운데 눈이 붉게 달아오름.
     ⑤ 206~    : 각성 — 포효 · 섬광 · 충격파 3겹. 240프레임에 전투 시작.

   싸움은 1:1 입니다 — 페이즈3에서는 졸개를 절대 부르지 않습니다.
   대신 낫질 · 집게 내리찍기 · 촉수 채찍 · 비명 파동 네 가지를 굵게 씁니다.
   ═════════════════════════════════════════════════════ */
const MORPH_DUR   = 1070;  // 약 17.8초 — 명령을 읽고 심연이 받아 칠 시간
const MORPH_TYPE  = 4;     // 한 글자에 몇 프레임 (클수록 느리게 찍힙니다)
const ABOM_W = 150, ABOM_H = 101;   // 원본 168×113 비율 그대로

/* 각 행동의 [예비 동작, 그 뒤 길이] */
const ABOM_ACT = {
  blade:  { wind: 40, dur: 80, c: '#ffb27a' },   // 왼팔의 녹슨 낫
  claw:   { wind: 52, dur: 46, c: '#ff8a6a' },   // 오른팔의 집게를 내리찍기
  lash:   { wind: 32, dur: 46, c: '#e07fb0' },   // 촉수 채찍
  scream: { wind: 36, dur: 88, c: '#ff6a66' }    // 아래쪽 아가리의 비명
};
/* 내리찍기는 예비 동작 절반쯤에서 자리를 "확정"합니다. 그 전까지는 조준선이
   주인공을 따라다니고, 확정된 뒤로는 더 안 따라옵니다 — 언제 빠져나가야
   하는지가 눈에 보여야 피할 수 있습니다. */
const CLAW_LOCK = 26;
/* 난이도에 따라 늘어난 예비 동작 길이 / 자리 확정 시점 — AI 와 그림이 같이 씁니다 */
const abomWind = act => Math.round(ABOM_ACT[act].wind * BALANCE.abomWindMul);
const abomLock = () => Math.round(CLAW_LOCK * BALANCE.abomWindMul);

/* -π~π 로 접은 각도 차 */
function angDiff(a, b) {
  let x = a - b;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}
/* 점과 선분 사이 거리 — 촉수에 스쳤는지 판정할 때 씁니다 */
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function beginMorph() {
  const B = G.boss;
  // 거체라서 벽에 박히지 않도록 방 안쪽으로 당겨 세웁니다
  G.morphX = Math.max(TS + 86, Math.min(W - TS - 86, B.x));
  G.morphY = Math.max(TS + 64, Math.min(H - TS - 74, B.y));
  G.morphT = 0; G.morphDark = 0; G.morphed = true;
  G.mode = 'morph';
  $('prompt').classList.add('hidden');   // 관측 로그와 자리가 겹칩니다
  G.boss = null;
  G.foes = [];                                   // 페이즈3는 오롯이 1:1
  G.clouds = [];
  G.bullets = [];

  /* 눈이 터질 때 뭔가 하나가 같이 튀어나옵니다 — 낡은 구급 팩.
     암전이 내려앉는 동안 주인공이 이걸 주워 삼키고, 그래서 페이즈3를
     체력칸이 늘어난 채로 시작합니다 (몇 칸이 되는지는 난이도에 따라).
     예전엔 설명 없이 체력만 늘어났습니다. */
  // 주인공 발밑이 아니라, 자리가 넓은 쪽으로 조금 떨어진 곳에 떨어뜨립니다
  const side = (P.x - TS) > (W - TS - P.x) ? -1 : 1;
  const lx = Math.max(TS + 28, Math.min(W - TS - 28, P.x + side * 58));
  const ly = Math.max(TS + 28, Math.min(H - TS - 28, P.y + 16));
  // 팩은 눈이 끌려 들어간 구멍에서 튀어나옵니다
  G.medpack = { x0: G.morphX, y0: G.morphY + 20, lx, ly, x: G.morphX, y: G.morphY + 20, spin: 0, eaten: false };

  /* 눈 브금은 여운을 남기며 걷힙니다. 심연 브금은 여기서 바로 걸지 않고
     BGM3_AT 프레임에 겁니다 — 곡의 조용한 도입이 11.4초라, 그때 걸어야
     터지는 지점이 각성과 맞습니다. (tickMorph 가 챕니다) */
  Sfx.bossBgm('boss2', false);

  if (G.timeAttack) { G.medpack = null; quickMorph(B); return; }
  startEyeMorph(B);          // 먼저 눈이 먹히는 장면 (변이) — 그다음 기존 암전·솟아오름
}

/* 변신 컷신 진행 — update() 에서 매 프레임 호출 */
/* 바닥이 갈라지며 무언가가 올라오는 구간 — 9.2초에 걸쳐 천천히 솟습니다 */
const RISE_FROM = 150, RISE_TO = 700;
const CRACK_AT = [165, 250, 340, 430, 520, 610, 680];
const WAKE_AT = 950;                 // 각성하는 순간
/* 심연 브금은 컷신 시작이 아니라 이 프레임에 걸어야, 곡의 조용한 도입
   11.4초가 흐른 뒤 터지는 지점이 각성과 맞습니다 (11.4초 × 60프레임). */
const BGM3_AT = WAKE_AT - 684;

/* 피팩이 튀어나와 → 바닥에 떨어지고 → 주인공에게 끌려가 → 삼켜지는 시점 */
const PACK_LAND = 45, PACK_PULL = 120, PACK_EAT = 190;

/* 관측 로그 타이핑 상태 — 프레임으로 굴려야 게임 속도와 어긋나지 않습니다 */
let morphSysI = -1, morphSysN = 0;

function clearMorphSys() {
  morphSysI = -1; morphSysN = 0;
  const el = $('morphsys');
  el.classList.remove('on', 'alert', 'abyss');
  $('morphtext').textContent = '';
}

/* 눈이 터질 때 튀어나온 구급 팩 — 포물선으로 날아가 바닥에 떨어지고,
   덜컹거리다가 주인공 쪽으로 끌려가서 삼켜집니다. 암막 위에 따로 그리기
   때문에 화면이 캄캄해진 뒤에도 이것만은 또렷하게 보입니다. */
function tickMedpack(t) {
  const m = G.medpack;
  if (!m || m.eaten) return;

  if (t <= PACK_LAND) {                       // ① 포물선을 그리며 날아갑니다
    const k = t / PACK_LAND;
    m.x = m.x0 + (m.lx - m.x0) * k;
    m.y = m.y0 + (m.ly - m.y0) * k - Math.sin(k * Math.PI) * 46;
    m.spin += .34;
    if (t === PACK_LAND) {
      Sfx.pot(); G.shake = Math.max(G.shake, 5);
      for (let i = 0; i < 8; i++)
        G.fx.push({ k: 'p', x: m.x, y: m.y + 4, vx: (Math.random() - .5) * 2.4,
                    vy: -Math.random() * 1.6, life: 20, max: 20, c: '#8a7c66' });
    }
  } else if (t < PACK_PULL) {                 // ② 바닥에서 덜컹거리다 멈춥니다
    m.spin *= .84;
    const k = (t - PACK_LAND) / (PACK_PULL - PACK_LAND);
    m.y = m.ly - Math.abs(Math.sin((t - PACK_LAND) * .55)) * 3.5 * (1 - k);
  } else if (t < PACK_EAT) {                  // ③ 주인공에게 끌려옵니다
    const k = (t - PACK_PULL) / (PACK_EAT - PACK_PULL);
    m.x += (P.x - m.x) * (.12 + k * .3);
    m.y += (P.y - 6 - m.y) * (.12 + k * .3);
    m.spin += .12;
    if (t % 3 === 0)
      G.fx.push({ k: 'suck', x: m.x + (Math.random() - .5) * 28, y: m.y + (Math.random() - .5) * 28,
                  tx: P.x, ty: P.y - 6, life: 16, max: 16, c: '#ffd6d6' });
  } else {                                    // ④ 삼킵니다
    eatMedpack();
  }
}

/* 구급 팩을 삼키는 순간 — 체력칸이 abomPlayerMax 까지 늘고 가득 찹니다 */
function eatMedpack() {
  const m = G.medpack;
  if (m) m.eaten = true;
  const prev = P.max;
  P.max = BALANCE.abomPlayerMax;
  P.hp = P.max;
  updateHud();
  // 새로 붙은 칸만 하나씩 톡 튀어나오게
  const hs = $('hearts').children;
  for (let i = prev; i < hs.length; i++) {
    const el = hs[i];
    setTimeout(() => {
      el.classList.add('gain');
      setTimeout(() => el.classList.remove('gain'), 520);
    }, (i - prev) * 150);
  }
  Sfx.pickup();
  setTimeout(() => Sfx.keyGet(), 90);
  glare(.5); G.flash = Math.max(G.flash, .45); G.shake = Math.max(G.shake, 7);
  shockRing(P.x, P.y, 150, '255,214,214', 4, 26);
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * 6.28, s = 1 + Math.random() * 2.4;
    G.fx.push({ k: 'p', x: P.x, y: P.y - 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s - .6,
                life: 30, max: 30, c: i % 2 ? '#ff6a7a' : '#ffe8ea' });
  }
}

function tickMorph() {
  if (G.morphPre < MORPH_PRE) { tickEyeMorph(++G.morphPre); return; }
  const t = ++G.morphT;
  tickFx();
  tickMedpack(t);
  // 심연 브금 — 조용한 도입 11.4초가 흐른 뒤 각성과 함께 터집니다
  if (t === BGM3_AT) Sfx.bossBgm('boss3', true);

  /* ── 처분 명령을 읽는 쪽과, 그걸 받아 치는 심연 ── */
  for (let i = 0; i < MORPH_SYS.length; i++) {
    if (t !== MORPH_SYS[i][0]) continue;
    morphSysI = i; morphSysN = 0;
    const voice = MORPH_SYS[i][2];
    const el = $('morphsys');
    el.classList.add('on');
    el.classList.toggle('alert', voice === 'alert');
    el.classList.toggle('abyss', voice === 'abyss');
    $('morphtext').textContent = '';
    if (voice === 'alert') { Sfx.glitch(); G.flash = Math.max(G.flash, .3); }
    // 심연이 입을 열면 바닥부터 낮게 울립니다
    if (voice === 'abyss') { Sfx.landThump(.22); G.shake = Math.max(G.shake, 7); }
  }
  if (morphSysI >= 0) {
    const line = MORPH_SYS[morphSysI][1];
    const abyss = MORPH_SYS[morphSysI][2] === 'abyss';
    // 한 글자에 네 프레임 — 예전(세 프레임)보다 느긋하게 읽힙니다
    if (morphSysN < line.length && t % MORPH_TYPE === 0) {
      morphSysN++;
      $('morphtext').textContent = line.slice(0, morphSysN);
      /* 찍는 소리도 목소리에 따라 갈립니다 — 계기판은 마른 비프,
         심연은 젖은 소리가 낮게 깔립니다. */
      if (abyss) { if (morphSysN % 2 === 0) Sfx.creepType(); }
      else if (morphSysN % 3 === 0) Sfx.beep(.03);
    }
  }
  if (t === WAKE_AT + 30) clearMorphSys();     // 각성하면서 로그가 끊깁니다

  // ① 눈이 안으로 무너지며 빛이 중심으로 빨려 들어갑니다
  if (t < 56) {
    G.morphDark = Math.min(1, t / 46);
    if (t % 2 === 0) {
      const a = Math.random() * 6.28, dist = 120 + Math.random() * 90;
      G.fx.push({ k: 'suck', x: G.morphX + Math.cos(a) * dist, y: G.morphY + Math.sin(a) * dist,
                  tx: G.morphX, ty: G.morphY, life: 20, max: 20, c: '#c9a0ff' });
    }
    G.shake = Math.max(G.shake, 2 + t * .07);
  }
  // ② 어둠과 정적 — 낮게 한 번. 이때부터 로그만 찍힙니다
  else if (t < RISE_FROM) {
    G.morphDark = 1;
    if (t === 100) { Sfx.landThump(.55); G.shake = Math.max(G.shake, 12); }
    G.shake = Math.max(G.shake, 1.2);
  }
  // ③ 바닥이 다섯 번 갈라지고 실루엣이 천천히 솟아오릅니다
  else if (t < RISE_TO) {
    G.morphDark = 1;
    const k = (t - RISE_FROM) / (RISE_TO - RISE_FROM);
    G.shake = Math.max(G.shake, 1.8 + k * 8);
    if (CRACK_AT.includes(t)) {
      Sfx.hit(); Sfx.pot();
      G.shake = Math.max(G.shake, 15);
      shockRing(G.morphX, G.morphY + 34, 120 + k * 200, '194,53,44', 4, 26);
      for (let i = 0; i < 12; i++)
        G.fx.push({ k: 'p', x: G.morphX + (Math.random() - .5) * 90, y: G.morphY + 38,
                    vx: (Math.random() - .5) * 3, vy: -1 - Math.random() * 2.6,
                    life: 30, max: 30, c: '#6b4a3a' });
    }
    if (t % 7 === 0) {
      const a = Math.random() * 6.28;
      G.fx.push({ k: 'suck', x: G.morphX + Math.cos(a) * 160, y: G.morphY + Math.sin(a) * 160,
                  tx: G.morphX, ty: G.morphY, life: 26, max: 26, c: '#ff7a6a' });
    }
  }
  // ④ 색이 번지고 가운데 눈이 달아오릅니다 — 숨을 고르는 구간
  else if (t < WAKE_AT) {
    G.morphDark = 1;
    const k = (t - RISE_TO) / (WAKE_AT - RISE_TO);
    G.shake = Math.max(G.shake, 3 + k * 9);
    // 3.3초를 비워 두지 않도록, 숨을 고르는 소리를 세 번 넣습니다
    if (t === RISE_TO + 34) Sfx.reveal();
    if (t === RISE_TO + 96) { Sfx.breath(); G.shake = Math.max(G.shake, 8); }
    if (t === RISE_TO + 164) { Sfx.breath(); G.shake = Math.max(G.shake, 11); }
    if (t === RISE_TO + 218) { Sfx.hit(); G.shake = Math.max(G.shake, 14); glare(.35); }
    if (t % 9 === 0) {
      const a = Math.random() * 6.28;
      G.fx.push({ k: 'suck', x: G.morphX + Math.cos(a) * 190, y: G.morphY + Math.sin(a) * 190,
                  tx: G.morphX, ty: G.morphY, life: 28, max: 28, c: '#ffd2a8' });
    }
  }
  // ⑤ 각성
  else {
    if (t === WAKE_AT) {
      Sfx.bossRoar(); Sfx.glitch();
      glare(1.4); G.flash = 1; G.shake = 44;
      shockRing(G.morphX, G.morphY, 460, '255,255,255', 11, 54);
      shockRing(G.morphX, G.morphY, 340, '224,72,60', 8, 46);
      shockRing(G.morphX, G.morphY, 230, '255,170,120', 6, 38);
    }
    G.morphDark = Math.max(0, 1 - (t - WAKE_AT) / 40);
    if (t === WAKE_AT + 44 && !G.boss) makeAbom();
  }
  if (t >= MORPH_DUR) { G.morphDark = 0; G.mode = 'play'; clearMorphSys(); }
}

function makeAbom() {
  G.boss = {
    kind: 'abom',
    x: G.morphX, y: G.morphY, r: 46,
    hp: BALANCE.abomHp, max: BALANCE.abomHp, sp: BALANCE.abomSpeed,
    t: 0, cd: 72, stage: 1, bob: 0, flash: 0, kx: 0, ky: 0,
    act: null, actT: 0, last: null, aim: 0, dir: 1,
    bladeFrom: 0, bladeA: 0, lash: [], lashLen: 0, reach: 150,
    gap: 0, tx: 0, ty: 0, rise: 0, spiralA: 0, rayT: 120
  };
}

function updateAbom() {
  const B = G.boss;
  if (B.hp <= 0) { killBoss(); return; }
  B.t++; B.bob += .045;
  if (B.flash > 0) B.flash--;
  if (B.rayT > 0) B.rayT--;
  B.x += B.kx; B.y += B.ky; B.kx *= .84; B.ky *= .84;

  // 반피 아래로 떨어지면 광란 — 예비 동작이 짧아지고 탄이 늘어납니다
  const st = B.hp / B.max > .5 ? 1 : 2;
  if (st !== B.stage) {
    B.stage = st; G.shake = 26; G.flash = 1; Sfx.bossRoar();
    glare(1.25); B.rayT = 110;
    shockRing(B.x, B.y, 340, '255,255,255', 8, 44);
    shockRing(B.x, B.y, 240, '224,72,60', 6, 36);
    if (P.hp < P.max) G.pickups.push({ k: 'heart', x: W / 2, y: H - 72, bob: 0 });
  }
  G.shake = Math.max(G.shake, 1.4 + st * .8);

  const dx = P.x - B.x, dy = P.y - B.y, d = Math.hypot(dx, dy) || 1;

  if (B.act) runAbomAct(B, dx, dy, d);
  else {
    // 일정 거리를 두고 천천히 맴돕니다 (덩치가 커서 붙으면 답이 없으므로)
    const sp = B.sp * (st === 2 ? 1.45 : 1);
    const orbit = 108;
    const pull = Math.max(-1, Math.min(1, (d - orbit) / orbit));
    B.x += (dx / d) * sp * pull + (-dy / d) * sp * .55;
    B.y += (dy / d) * sp * pull + (dx / d) * sp * .55;
    if (--B.cd <= 0) startAbomAct(B);
  }

  // 상시 — 몸에 달린 작은 눈들이 나선으로 뱉는 탄
  if (B.t % Math.round((st === 2 ? 9 : 13) * BALANCE.abomSpiralMul) === 0) {
    B.spiralA += 1.07;
    foeShot(B.x, B.y + 4, Math.cos(B.spiralA), Math.sin(B.spiralA), 1.6 * BALANCE.abomShotMul);
  }

  // 덩치가 커서 벽에 반쯤 박혀 보이지 않도록 안쪽으로 넉넉히 잡습니다
  B.x = Math.max(TS + 64, Math.min(W - TS - 64, B.x));
  B.y = Math.max(TS + 48, Math.min(H - TS - 54, B.y));
  if (d < B.r * .58 + P.r) hurt(1);
}

function startAbomAct(B) {
  const pool = B.stage === 1
    ? ['blade', 'lash', 'claw', 'scream']
    : ['blade', 'scream', 'lash', 'claw', 'blade', 'scream'];
  let k = pool[(Math.random() * pool.length) | 0];
  if (k === B.last && Math.random() < .7) k = pool[(Math.random() * pool.length) | 0];
  B.last = k; B.act = k; B.actT = 0;
  B.aim = Math.atan2(P.y - B.y, P.x - B.x);
  if (k === 'blade') {
    B.dir = Math.random() < .5 ? 1 : -1;
    B.bladeFrom = B.aim - B.dir * .95;
    B.bladeA = B.bladeFrom;
  } else if (k === 'lash') {
    const offs = B.stage === 2 ? [-.72, -.36, 0, .36, .72] : [-.42, 0, .42];
    B.lash = offs.map(o => B.aim + o);
    B.reach = B.stage === 2 ? 172 : 150;
    B.lashLen = 0;
  } else if (k === 'scream') {
    B.gap = Math.random() * 6.283;
  }
  Sfx.beep();
}

function runAbomAct(B, dx, dy, d) {
  const A = ABOM_ACT[B.act];
  const t = ++B.actT, w = abomWind(B.act), fast = B.stage === 2;
  const lock = abomLock(), shot = BALANCE.abomShotMul;

  // 예비 동작 — 빛이 몸으로 빨려 들어가며 "온다"는 걸 보여 줍니다
  if (t <= w) {
    if (t % 3 === 0) {
      const a = Math.random() * 6.28, dist = 80 + Math.random() * 50;
      G.fx.push({ k: 'suck', x: B.x + Math.cos(a) * dist, y: B.y + Math.sin(a) * dist,
                  tx: B.x, ty: B.y, life: 18, max: 18, c: A.c });
    }
    // 낫과 촉수는 예비 동작 중에도 아주 느리게 주인공을 따라 돕니다
    if (B.act === 'blade' || B.act === 'lash') {
      const want = Math.atan2(dy, dx);
      B.aim += angDiff(want, B.aim) * .05;
      if (B.act === 'blade') B.bladeFrom = B.aim - B.dir * .95;
      else B.lash = B.lash.map((a, i) => a + angDiff(want, B.aim) * .05);
    }
  }

  if (B.act === 'blade') {
    const swing = fast ? 44 : 58;
    if (t === w) { Sfx.bossRoar(); G.shake = Math.max(G.shake, 16); glare(.55); }
    if (t > w && t <= w + swing) {
      const k = (t - w) / swing;
      B.bladeA = B.bladeFrom + B.dir * k * Math.PI * 1.62;
      const bx = B.x + Math.cos(B.bladeA) * 98, by = B.y + Math.sin(B.bladeA) * 98;
      G.fx.push({ k: 'trail', x: bx, y: by, life: 14, max: 14, r: 11 });
      G.shake = Math.max(G.shake, 4);
      // 낫날 — 몸통에서 42~132 거리의 좁은 부채꼴
      const pd = Math.hypot(dx, dy);
      if (pd > 42 && pd < 132 && Math.abs(angDiff(Math.atan2(dy, dx), B.bladeA)) < .27) hurt(1);
      if (fast && (t - w) % 13 === 0)
        foeShot(bx, by, Math.cos(B.bladeA + B.dir * 1.57), Math.sin(B.bladeA + B.dir * 1.57), 1.75 * shot);
    }
  }

  else if (B.act === 'claw') {
    /* 예비 동작 — 몸을 크게 들어 올립니다. 그림자가 작아지고 몸이 떠오르는
       것만으로도 "뛰어든다"는 게 읽힙니다. */
    if (t <= w) {
      B.rise = (t / w) * 20;
      if (t < lock) { B.tx = P.x; B.ty = P.y; }           // 아직은 따라다닙니다
      if (t === lock) {                                   // 여기서 자리 확정
        B.tx = P.x; B.ty = P.y;
        Sfx.beep(.18); Sfx.hit();
        G.shake = Math.max(G.shake, 9);
        shockRing(B.tx, B.ty, 130, '255,138,106', 3, 22);
      }
      // 확정된 자리에 흙먼지가 들썩입니다 — 여기 떨어진다는 신호
      if (t > lock && t % 4 === 0)
        G.fx.push({ k: 'p', x: B.tx + (Math.random() - .5) * 40, y: B.ty + (Math.random() - .5) * 22,
                    vx: (Math.random() - .5) * 1.2, vy: -.6 - Math.random(),
                    life: 18, max: 18, c: '#c08a68' });
    }
    if (t === w) { Sfx.bossRoar(); G.shake = Math.max(G.shake, 12); }
    if (t > w && t <= w + 16) {
      B.x += (B.tx - B.x) * .2; B.y += (B.ty - B.y) * .2;
      B.rise = 20 * (1 - (t - w) / 16);          // 들어 올린 몸이 그대로 내려옵니다
      G.shake = Math.max(G.shake, 5);
      G.fx.push({ k: 'trail', x: B.x, y: B.y, life: 14, max: 14, r: 26 });
    }
    if (t === w + 17) {
      B.rise = 0;
      G.shake = Math.max(G.shake, 28); glare(.9); Sfx.glitch(); Sfx.landThump(.4);
      shockRing(B.x, B.y, 270, '236,120,80', 7, 34);
      shockRing(B.x, B.y, 170, '255,255,255', 4, 24);
      const n = fast ? 16 : 12, off = Math.random() * 6.28;
      for (let i = 0; i < n; i++) {
        const a = off + i / n * 6.283;
        foeShot(B.x, B.y, Math.cos(a), Math.sin(a), 1.85 * shot);
      }
      if (Math.hypot(P.x - B.x, P.y - B.y) < 62) hurt(1);
      for (let i = 0; i < 16; i++)
        G.fx.push({ k: 'p', x: B.x, y: B.y + 16, vx: (Math.random() - .5) * 6,
                    vy: (Math.random() - .5) * 5, life: 24, max: 24, c: '#8a6250' });
    }
  }

  else if (B.act === 'lash') {
    if (t === w) { Sfx.hit(); G.shake = Math.max(G.shake, 11); }
    if (t > w && t <= w + 16) {
      B.lashLen = B.reach * Math.min(1, (t - w) / 5);
      for (const a of B.lash) {
        const ex = B.x + Math.cos(a) * B.lashLen, ey = B.y + Math.sin(a) * B.lashLen;
        if (distToSeg(P.x, P.y, B.x, B.y, ex, ey) < 11 + P.r * .4) { hurt(1); break; }
      }
    } else if (t > w + 16) {
      B.lashLen = Math.max(0, B.lashLen - B.reach / 14);
    }
  }

  else if (B.act === 'scream') {
    const beats = fast ? [w, w + 26, w + 52] : [w, w + 34];
    beats.forEach((bt, i) => {
      if (t !== bt) return;
      const n = 22, gapA = B.gap + i * 1.15, gapW = (fast ? .5 : .7) + BALANCE.abomGapAdd;
      for (let j = 0; j < n; j++) {
        const a = j / n * 6.283;
        if (Math.abs(angDiff(a, gapA)) < gapW) continue;   // 빠져나갈 틈 하나
        foeShot(B.x, B.y + 14, Math.cos(a), Math.sin(a), 1.55 * shot);
      }
      Sfx.glitch(); Sfx.bossRoar();
      G.shake = Math.max(G.shake, 16); glare(.6);
      shockRing(B.x, B.y + 14, 250, '255,120,110', 5, 30);
    });
  }

  if (t >= w + A.dur) {
    B.act = null; B.actT = 0; B.lashLen = 0; B.rise = 0;
    B.cd = Math.round((fast ? 50 : 76) * BALANCE.abomCdMul);
  }
}

/* ═══════════ 렌더 ═════════════════════════════════════ */
/* ── 카메라 ─────────────────────────────────────────────
   방이 화면보다 넓을 때(보스방)만 움직입니다. 주인공을 따라가되 보스 쪽으로
   30% 당겨서 보스가 되도록 화면 안에 들어오게 하고, 보스 등장 · 변이 · 심연의 최후
   컷신 동안엔 그 자리 쪽을 봅니다. 부드럽게 따라가고, 방에 들어설 때는 바로 맞춥니다. */
function updateCamera(snap) {
  if (G.inForest || (W <= VW && H <= VH)) { CAM.x = CAM.y = 0; return; }
  let tx = P.x, ty = P.y - 10;
  const B = G.boss;
  const pull = (x, y, k) => { tx += (x - P.x) * k; ty += (y - P.y) * k; };
  if (G.mode === 'morph' && G.morphX) { tx = G.morphX; ty = G.morphY; }
  else if (G.mode === 'boss-intro') pull(W / 2, 118, .5);              // 눈이 솟는 자리
  else if (G.mode === 'abomdeath') { const c = B || G.corpse; if (c) pull(c.x, c.y, .45); }  // 심연의 최후 — 열쇠가 날아올 주인공도 보이게
  else if (B) pull(B.x, B.y, .3);
  else if (G.corpse) pull(G.corpse.x, G.corpse.y, .2);
  tx = Math.max(0, Math.min(W - VW, tx - VW / 2));
  ty = Math.max(0, Math.min(H - VH, ty - VH / 2));
  if (snap) { CAM.x = tx; CAM.y = ty; }
  else { CAM.x += (tx - CAM.x) * .1; CAM.y += (ty - CAM.y) * .1; }
}
const camX = () => Math.round(CAM.x), camY = () => Math.round(CAM.y);   // 픽셀이 번지지 않게 정수로

function useHiRes() {
  const on = !!G.opening;                         // 오프닝은 일반 판 · 개발자 모드 모두 고해상도
  if (!on) { if (cvHi) cvHi.style.display = 'none'; return false; }
  if (!cvHi) {
    cvHi = document.createElement('canvas'); cvHi.id = 'gamehi';
    cvHi.width = VW * HI_R; cvHi.height = SH * HI_R;
    Object.assign(cvHi.style, { position: 'absolute', left: '0', top: '0', width: VW + 'px', height: SH + 'px', zIndex: 2, imageRendering: 'auto', pointerEvents: 'none' });
    cvMain.parentNode.insertBefore(cvHi, cvMain.nextSibling);
    gHi = cvHi.getContext('2d');
  }
  cvHi.style.display = 'block';
  return true;
}
const isCine = () => G.mode === 'fall' || G.mode === 'landing' || G.mode === 'wakeup' || !!G.opening;
function render() {
  const hi = useHiRes();
  if (hi) { cv = cvHi; g = gHi; SR = HI_R; g.imageSmoothingEnabled = true; }
  // 바탕을 먼저 검게 (늘어난 띠까지)
  g.setTransform(SR, 0, 0, SR, 0, 0); g.fillStyle = '#040408'; g.fillRect(0, 0, VW, SH);
  // 컷신 — 16:9 그림을 세로에 맞춰 키움(좌우만 조금 잘림) · 방 — 위아래로 OY 만큼 내려 가운데에
  if (isCine()) { BK = SH / VH; BX = (VW - VW * BK) / 2; BY = 0; } else { BK = 1; BX = 0; BY = OY; }
  baseXf();
  renderFrame();
  BK = 1; BX = 0; BY = 0;
  g.setTransform(SR, 0, 0, SR, 0, 0);
  if (hi) { cv = cvMain; g = gMain; SR = 1; }
}
/* 방 위아래로 늘어난 띠 — 바닥 그림의 가장자리를 거울처럼 이어 붙임 (방 좌표, 카메라 밀기 안에서) */
function drawFloorBands() {
  if (!OY || !G.floor) return;
  const fh = G.floor.height, fw = G.floor.width, b = Math.ceil(OY) + 1;
  g.save(); g.scale(1, -1); g.drawImage(G.floor, 0, 0, fw, b, 0, 0, fw, b); g.restore();
  g.save(); g.translate(0, 2 * H); g.scale(1, -1); g.drawImage(G.floor, 0, fh - b, fw, b, 0, H - b, fw, b); g.restore();
  g.fillStyle = 'rgba(4,4,8,.55)'; g.fillRect(-20, -b - 2, W + 40, b + 2); g.fillRect(-20, H, W + 40, b + 2);   // 띠는 조금 어둡게 — 방 안이 먼저 보이게
}
function renderFrame() {
  g.save();
  if (G.shake > .4) g.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
  g.translate(-camX(), -camY());                 // 방 안의 것은 카메라만큼 밀어서
  g.fillStyle = '#040408'; g.fillRect(-20, -20 - OY, W + 40, H + 40 + 2 * OY);
  // 추락·착지·1인칭 중에는 지상/던전 화면이 뒤로 비쳐 보이면 안 됩니다
  const cine = G.mode === 'fall' || G.mode === 'landing' || G.mode === 'wakeup' || !!G.opening;
  if (!cine) {
    if (G.floor) { g.drawImage(G.floor, 0, 0); drawFloorBands(); }
    if (G.inForest) renderForest(); else renderDungeon();
  }
  if (G.mode === 'morph') renderMorph();         // 변신 컷신의 암막 · 입자도 방 안의 자리에
  g.restore();

  // 여기부터는 화면 위에 얹는 것들 — 방 크기 대신 화면 크기로 그립니다
  // (방일 땐 늘어난 화면 전체 VW × SH 로 — 지도 · 섬광이 진짜 화면 끝에. 컷신은 16:9 그대로 키운 채)
  const roomW = W, roomH = H, cineS = isCine();
  W = VW; H = cineS ? VH : SH;
  if (!cineS) { BY = 0; baseXf(); }
  renderScreen();
  if (!cineS) { BY = OY; baseXf(); }
  W = roomW; H = roomH;
}
function renderScreen() {
  const cine = G.mode === 'fall' || G.mode === 'landing' || G.mode === 'wakeup' || !!G.opening;

  if (G.mode === 'fall') renderFall();
  if (G.mode === 'landing') renderLanding();
  if (G.mode === 'wakeup') renderWakeup();
  if (G.opening) renderOpening();
  if (G.doze) renderDoze();
  if (G.awayMsg) renderAwayMsg();
  // 암전이 걷히는 동안엔 지도도 같이 드러납니다
  if (!G.inForest && !cine && !G.hideHero && G.wake <= 0 && G.mode !== 'morph' && G.mode !== 'abomdeath' && G.mode !== 'doze') drawMinimap();
  if (G.wake > 0 && !cine) renderWake();

  if (G.flash > .02) {
    g.save();
    g.globalAlpha = G.flash * .5;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const y = Math.random() * H, h = 2 + Math.random() * 9;
      g.fillStyle = ['#7de3c8', '#c2352c', '#2f6fb5'][i];
      g.fillRect((Math.random() - .5) * 22, y, W, h);
    }
    g.restore();
  }

  if (G.endWarp > 0) warpScreen(G.endWarp);

  // 보스전 섬광 — 화면 전체가 한 번 하얗게 날아갑니다
  if (G.glare > .02) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, G.glare) * .6;
    const gg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * .72);
    gg.addColorStop(0, 'rgba(255,250,240,.95)');
    gg.addColorStop(.6, 'rgba(255,220,200,.35)');
    gg.addColorStop(1, 'rgba(255,180,160,0)');
    g.fillStyle = gg; g.fillRect(0, 0, W, H);
    g.restore();
  }
}

/* 엔딩 직전 화면이 일그러지는 효과 — 그린 화면을 가로 띠로 잘라 물결처럼
   밀고, 세질수록 띠가 찢어지고 색이 갈라집니다. k : 0‥1 */
let _warpCv = null;
function warpScreen(k) {
  if (!_warpCv || _warpCv.height !== cv.height) { _warpCv = document.createElement('canvas'); _warpCv.width = cv.width; _warpCv.height = cv.height; }
  const w = _warpCv.getContext('2d');
  w.clearRect(0, 0, W, H); w.drawImage(cv, 0, 0);
  g.save();
  g.fillStyle = '#040408'; g.fillRect(0, 0, W, H);
  const band = 4;
  for (let y = 0; y < H; y += band) {
    let dx = Math.sin(y * .045 + G.t * .09) * 9 * k + Math.sin(y * .013 - G.t * .05) * 5 * k;
    if (k > .5 && Math.random() < (k - .5) * .12) dx += (Math.random() - .5) * 60 * k;   // 찢어지는 띠
    g.drawImage(_warpCv, 0, y, W, band, dx, y, W, band);
  }
  if (k > .5) {                                   // 색이 갈라집니다
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = (k - .5) * .5;
    g.drawImage(_warpCv, 3 * k, 0);
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}

/* ── 지상 ──────────────────────────────────────────── */
function renderForest() {
  const t = G.t * 16;
  renderForestProps(g, t);
  drawWell(g, G.well.x, G.well.y, G.t, G.well.glow);
  drawOldTreeDoc();
  drawCreepyGap();
  G.butterflies.forEach(b => {
    g.save();
    if (b.gl > 0) { g.globalAlpha = .55; g.fillStyle = '#7de3c8'; }
    else { g.globalAlpha = .8; g.fillStyle = b.c; }
    const f = Math.sin(G.t * .35 + b.a) * 2;
    g.fillRect(b.x - 3, b.y - f, 3, 2);
    g.fillRect(b.x + 1, b.y - f, 3, 2);
    g.restore();
  });
  drawPlayer();
  drawNightOverlay(g, W, H, P.x, P.y, .34, 172);
}

/* 늙은 나무 밑동에 낀 서류 한 장 — 가까이 가면 살짝 밝아집니다.
   오래 방치된 물건이라 깨끗한 새 종이가 아니라, 흙먼지에 절고
   곰팡이 얼룩이 피고 가장자리가 해진 몰골이어야 자연스럽습니다. */
function drawOldTreeDoc() {
  const o = G.oldTree, near = nearOldTree();
  g.save();
  g.globalAlpha = near ? .95 : .55;
  // 접힌 종이 귀퉁이 — 누렇게 바랜 색
  g.fillStyle = '#c4b998';
  g.beginPath();
  g.moveTo(o.x - 5, o.y + 4); g.lineTo(o.x + 5, o.y + 2);
  g.lineTo(o.x + 4, o.y + 9); g.lineTo(o.x - 6, o.y + 10);
  g.closePath(); g.fill();

  // 곰팡이 · 물얼룩 — 짙은 갈색 반점 몇 개
  g.fillStyle = 'rgba(70,54,30,.55)';
  g.beginPath(); g.ellipse(o.x - 2, o.y + 5, 1.6, 1.1, .4, 0, 6.3); g.fill();
  g.fillStyle = 'rgba(50,40,22,.4)';
  g.beginPath(); g.ellipse(o.x + 2, o.y + 8, 1.2, 0.9, -.3, 0, 6.3); g.fill();
  g.fillStyle = 'rgba(90,70,40,.3)';
  g.fillRect(o.x - 4, o.y + 6, 2, 1);

  // 흙먼지가 앉은 결 (가로 줄무늬처럼 탁하게)
  g.fillStyle = 'rgba(60,48,28,.22)';
  g.fillRect(o.x - 5, o.y + 7, 9, 1);
  g.fillStyle = 'rgba(60,48,28,.14)';
  g.fillRect(o.x - 4, o.y + 5, 7, 1);

  // 가장자리가 해져 삐죽삐죽한 티
  g.strokeStyle = 'rgba(55,44,26,.5)'; g.lineWidth = .6;
  g.beginPath();
  g.moveTo(o.x - 6, o.y + 10); g.lineTo(o.x - 5, o.y + 9.3);
  g.lineTo(o.x - 4.3, o.y + 10); g.lineTo(o.x - 3.4, o.y + 9.4);
  g.stroke();

  if (near) {
    g.globalAlpha = .35 + Math.sin(G.t * .12) * .18;
    g.strokeStyle = '#e3b23c'; g.lineWidth = 1;
    g.strokeRect(o.x - 8, o.y + 1, 15, 11);
  }
  g.restore();
}

/* 숲 맨 위 — 나무 사이로 난 좁은 틈.
   평소엔 나무 그늘처럼만 보이고, 가까이 가면 그 너머가 숲이 아니라
   아무것도 없는 검은 면이라는 게 드러납니다. */
function drawCreepyGap() {
  const { x, y } = G.gap, near = nearCreepyGap();
  const k = near ? 1 : .34;
  g.save();

  // 틈 너머 — 아래로 갈수록 옅어지는 검은 면
  const og = g.createLinearGradient(0, 0, 0, y + 34);
  og.addColorStop(0, `rgba(2,2,4,${.92 * (near ? 1 : .8)})`);
  og.addColorStop(1, 'rgba(2,2,4,0)');
  g.fillStyle = og;
  g.fillRect(x - 17, 0, 34, y + 34);

  // 틈 양쪽 나무 기둥
  g.fillStyle = '#1b2418';
  g.fillRect(x - 27, 0, 11, y + 22);
  g.fillRect(x + 16, 0, 11, y + 26);
  g.fillStyle = 'rgba(12,18,12,.85)';
  g.fillRect(x - 24, 0, 3, y + 20);
  g.fillRect(x + 22, 0, 3, y + 24);

  // 가까이 가면 틈 안쪽에서 아주 옅게 스캔라인이 어른거립니다 (복선)
  if (near) {
    g.globalAlpha = .16 + Math.sin(G.t * .18) * .1;
    g.fillStyle = '#7de3c8';
    for (let i = 0; i < 7; i++) g.fillRect(x - 15, 2 + i * 5 + ((G.t >> 1) % 5), 30, 1);
    g.globalAlpha = 1;
  }

  // 바닥에 난 발자국 — 누군가 이미 이쪽으로 나간 적이 있습니다
  g.globalAlpha = k * .5;
  g.fillStyle = '#6a6558';
  for (let i = 0; i < 4; i++)
    g.fillRect(x - 4 + (i % 2) * 7, y + 26 + i * 9, 3, 5);
  g.restore();
}

/* ── 지하 ──────────────────────────────────────────── */
function renderDungeon() {
  const R = MAP[G.room];
  drawWalls(g, W, H, TS, R.depth, G.t);
  drawDoors();
  drawWallPlants(g, W, H, TS, G.plants, G.t);

  if (R.graffiti !== '' ) {
    // 아랫벽 돌에 손톱으로 긁어 새긴 날짜 — 파인 홈(어둠) 아래로 긁힌 가루(밝음)
    const date = DATES[Math.min(G.visited.size, DATES.length - 1)].split(' / ').slice(1).join(' / ');
    const carve = (txt, x, y, a) => {
      g.globalAlpha = a * .55; g.fillStyle = '#8a7c66'; g.fillText(txt, x, y + 1);
      g.globalAlpha = a; g.fillStyle = '#0b0910'; g.fillText(txt, x, y);
    };
    g.save();
    g.font = '10px DungGeunMo, ui-monospace, monospace'; g.textAlign = 'center';
    carve(date, W * .72, H - 12, .8);
    if (R.boss) {                                  // 보스방 — 윗벽을 따라 같은 날짜를 몇 번이고
      g.font = '8px DungGeunMo, ui-monospace, monospace';
      for (let i = 0; 70 + i * 52 < W - 50; i++) carve('5/20', 70 + i * 52 + (i % 2) * 9, 14 + (i % 3) * 5, .35 + (i % 2) * .15);
    }
    g.restore();
  }

  drawFloorPlants(g, G.plants, G.t);
  drawThemeFloor(g, G.theme, G.t, P.x, P.y, W, H);           // 물방울 · 유리창 아래의 눈
  drawPropsPass(g, G.props, G.t, P.y, false);               // 주인공보다 뒤에 선 장애물
  G.pots.forEach(p => { if (!p.dead) drawPot(p.x, p.y); });
  if (G.chest) drawChest(G.chest);
  if (G.floorKey) drawKey(G.floorKey.x, G.floorKey.y + Math.sin(G.floorKey.bob) * 2.5);
  if (MAP[G.room].final) drawFinalLock();

  G.pickups.forEach(p => {
    const y = p.y + Math.sin(p.bob) * 2.5;
    g.save(); g.fillStyle = '#c2352c';
    g.beginPath();
    g.moveTo(p.x, y + 6); g.lineTo(p.x - 6, y - 1); g.lineTo(p.x - 3, y - 5);
    g.lineTo(p.x, y - 2); g.lineTo(p.x + 3, y - 5); g.lineTo(p.x + 6, y - 1);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(p.x - 3, y - 3, 2, 2);
    g.restore();
  });

  if (G.mode === 'boss-intro' && !G.boss) {
    const k = Math.min(1, G.bossIntroT / 90);
    g.save();
    g.beginPath(); g.rect(TS, TS, W - TS * 2, H - TS * 2); g.clip();
    // 갈라지는 틈에서 새어 나오는 빛
    g.globalCompositeOperation = 'lighter';
    const bg = g.createRadialGradient(W / 2, 118, 2, W / 2, 118, 40 + k * 130);
    bg.addColorStop(0, `rgba(255,120,90,${.5 * k})`);
    bg.addColorStop(.5, `rgba(150,40,90,${.22 * k})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + G.bossIntroT * .012;
      g.globalAlpha = k * .22 * (.5 + Math.sin(G.bossIntroT * .1 + i) * .5);
      g.strokeStyle = '#ff9a6a'; g.lineWidth = 2 + k * 5;
      g.beginPath(); g.moveTo(W / 2, 118);
      g.lineTo(W / 2 + Math.cos(a) * 340, 118 + Math.sin(a) * 340);
      g.stroke();
    }
    g.globalAlpha = k * .85; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#c2352c';
    g.beginPath(); g.arc(W / 2, 118, 4 + k * 30, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  drawClouds();
  if (G.boss) (G.boss.kind === 'abom' ? drawAbomLight : drawBossLight)();
  G.foes.forEach(drawFoe);
  if (G.boss) (G.boss.kind === 'abom' ? drawAbom : drawBoss)();
  if (G.mode === 'morph' && G.morphPre < MORPH_PRE) drawEyeMorph();
  if (G.corpse && R.boss) drawCorpse();
  drawPlayer();
  drawPropsPass(g, G.props, G.t, P.y, true);                // 주인공 앞을 가리는 장애물
  drawRings();

  const g0 = g; if (window.PixFX) g = PixFX.layerBegin(g0);    // 탄 — 도트 겹에 모아 (계단 가장자리 · 디더 빛무리)
  G.bullets.forEach(b => {
    g.save();
    // 도트 탄 — 짙은 테 · 몸 · 왼쪽 위 한 점 빛 (꽉 찬 색이라 디더 없이 또렷)
    const bx = Math.round(b.x), by = Math.round(b.y), r = b.r;
    const dot = (rr, col) => { g.fillStyle = col; g.beginPath(); g.arc(bx, by, rr, 0, Math.PI * 2); g.fill(); };
    if (b.mine) {
      dot(r + 1.6, '#1f6f63'); dot(r + .6, '#7de3c8'); dot(r - .6, '#effffa');
    } else {
      const fl = (G.t >> 2) % 2;                                  // 적 탄은 두 박자로 깜빡이는 속
      dot(r + 1.6, '#5a1414'); dot(r + .4, '#d8453a'); dot(Math.max(1, r - 1.4), fl ? '#ffb39c' : '#ff7a5e');
    }
    g.fillStyle = '#ffffff'; g.fillRect(bx - Math.ceil(r * .5), by - Math.ceil(r * .5), 1, 1);
    g.restore();
  });
  g = g0;

  G.fx.forEach(f => {
    const k = f.life / f.max;
    if (f.k === 'p') {
      g.globalAlpha = k > .5 ? 1 : k * 2; g.fillStyle = f.c;          // 튀는 조각 — 정수 픽셀, 작아지며 사라짐
      const sz = k > .6 ? 3 : k > .3 ? 2 : 1;
      g.fillRect(Math.round(f.x) - (sz >> 1), Math.round(f.y) - (sz >> 1), sz, sz); g.globalAlpha = 1;
    } else if (f.k === 'trail') {            // 보스 돌진 잔상
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = k * .4;
      const tg = g.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r * 1.3);
      tg.addColorStop(0, 'rgba(255,170,120,.8)');
      tg.addColorStop(1, 'rgba(255,120,80,0)');
      g.fillStyle = tg;
      g.beginPath(); g.arc(f.x, f.y, f.r * 1.3, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (f.k === 'suck') {             // 눈으로 빨려 드는 빛 알갱이
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (1 - k) * .9;
      g.fillStyle = f.c;
      g.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3);
      g.restore();
    } else {
      // 죽으면서 흩어지는 숫자/기호 — "피 대신 숫자가 흩어졌다"는 복선이라
      // 눈에 확 띄어야 합니다. 천천히 떠다니듯 퍼지다가 끝에서만 사라집니다.
      const prog = 1 - k;
      const spread = Math.min(1, prog / .9);
      const fade = prog > .7 ? Math.max(0, (1 - prog) / .3) : 1;

      g.save(); g.globalAlpha = k;
      g.strokeStyle = '#7de3c8'; g.lineWidth = 1.4;
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const x = f.x - f.max / 2 + (i / 20) * f.max;
        const y = f.y + Math.sin(i * 1.9 + G.t * .5) * (i % 4 === 0 ? 13 : 3) * k;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.restore();

      g.save();
      g.globalAlpha = fade;
      g.font = 'bold 15px DungGeunMo, ui-monospace, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      // 흐린 빛번짐(shadowBlur) 대신 도트 글자 — 1px 짙은 테 + 청록 그림자 한 칸 + 밝은 속
      f.chars.forEach(c => {
        const cx = Math.round(f.x + c.dx * spread), cy = Math.round(f.y + c.dy * spread);
        g.fillStyle = '#04080a';
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillText(c.c, cx + ox, cy + oy);
        g.fillStyle = '#3fa58c'; g.fillText(c.c, cx + 1, cy + 2);
        g.fillStyle = '#c8f7ec'; g.fillText(c.c, cx, cy);
      });
      g.restore();
    }
  });

  if (window.PixFX) PixFX.layerFlush(g);                      // 탄 · 고리 · 예고선 겹을 도트로 정리해 얹음

  // 포자에 닿아 느려진 동안은 화면 가장자리가 누렇게 물듭니다
  if (P.slow > 0) {
    g.save();
    g.globalAlpha = Math.min(1, P.slow / BALANCE.slowFrames) * .5;
    const sg = g.createRadialGradient(P.x, P.y, 30, P.x, P.y, VW * .55);
    sg.addColorStop(0, 'rgba(190,180,70,0)');
    sg.addColorStop(1, 'rgba(170,160,60,.55)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    g.restore();
  }

  // 어둠 — 주인공 주변만 밝다 (화면 기준으로 — 가장자리 어둠이 화면 가장자리에 오도록)
  g.save(); g.translate(camX(), camY() - OY);                      // 늘어난 띠까지 어둡게
  drawNightOverlay(g, VW, SH, P.x - camX(), P.y - camY() + OY, .40 + G.depth * .022, 150);
  g.restore();
}

/* ── 문 ────────────────────────────────────────────── */
function drawDoors() {
  for (const d in G.doors) {
    const dr = G.doors[d];
    const horiz = d === 'N' || d === 'S';
    const c = doorCenter(d);
    const x = horiz ? W / 2 - 26 : (d === 'W' ? 0 : W - TS);
    const y = horiz ? (d === 'N' ? 0 : H - TS) : H / 2 - 26;
    const w = horiz ? 52 : TS, h = horiz ? TS : 52;
    g.save();
    if (dr.lock) {
      g.fillStyle = '#3a2f22'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#1a1520'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      drawSaekdong(g, x + 2, y + 3, w - 4, 3, false, .5, G.depth);
      // 자물쇠
      g.fillStyle = dr.lock === 'boss' ? '#7a2f2a' : '#e3b23c';
      g.fillRect(c[0] - 5, c[1] - 4, 10, 9);
      g.strokeStyle = g.fillStyle; g.lineWidth = 2;
      g.beginPath(); g.arc(c[0], c[1] - 4, 4, Math.PI, 0); g.stroke();
      g.fillStyle = '#15141b'; g.fillRect(c[0] - 1, c[1], 2, 4);
      if (dr.lock === 'keys') {
        const blocked = gateBlocker();
        g.fillStyle = !blocked ? '#7de3c8' : (blocked === 'keys' ? '#e3b23c' : '#c2352c');
        g.font = 'bold 7px DungGeunMo, ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(!blocked ? 'OPEN'
                   : blocked === 'keys' ? `${G.doorKeys}/${rule().keys}`
                   : `${exploreDone()}/${EXPLORE_ROOMS.length}`,
                   c[0], c[1] + 16);
      }
    } else {
      g.fillStyle = '#07060c'; g.fillRect(x, y, w, h);
      const gr = horiz
        ? g.createLinearGradient(0, d === 'N' ? y + h : y, 0, d === 'N' ? y : y + h)
        : g.createLinearGradient(d === 'W' ? x + w : x, 0, d === 'W' ? x : x + w, 0);
      gr.addColorStop(0, 'rgba(125,227,200,.13)'); gr.addColorStop(1, 'rgba(125,227,200,0)');
      g.fillStyle = gr; g.fillRect(x - 6, y - 6, w + 12, h + 12);
      if (horiz) drawSaekdong(g, x, d === 'N' ? y + h - 3 : y, w, 3, false, .55, G.depth);
      else drawSaekdong(g, d === 'W' ? x + w - 3 : x, y, 3, h, true, .55, G.depth);
    }
    g.restore();
  }
}

/* 마지막 방의 거대한 문 + 잠금장치 */
function drawFinalLock() {
  const x = W - TS, y = 34, w = TS, h = H - 68;
  g.save();
  g.fillStyle = '#2c2419'; g.fillRect(x - 4, y, w + 4, h);
  g.fillStyle = '#3f3320'; g.fillRect(x - 2, y + 3, w + 2, h - 6);
  g.strokeStyle = '#17121a'; g.lineWidth = 2; g.strokeRect(x - 3, y + 1, w + 3, h - 2);
  g.fillStyle = '#4a4a55'; g.fillRect(x + 6, 0, 8, 36);
  drawSaekdong(g, x - 3, y + 8, w + 3, 5, false, .92);
  drawSaekdong(g, x - 3, y + h - 13, w + 3, 5, false, .92, 2);
  drawTaegeuk(g, x + w / 2 - 1, H / 2, 12, G.t * .004);
  const lx = W - TS - 24, ly = H / 2;
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.ellipse(lx, ly + 20, 13, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#232a34'; g.fillRect(lx - 8, ly - 16, 16, 36);
  g.fillStyle = '#2f3945'; g.fillRect(lx - 8, ly - 16, 5, 36);
  g.strokeStyle = '#141920'; g.lineWidth = 1.5; g.strokeRect(lx - 8, ly - 16, 16, 36);
  g.fillStyle = '#0a0d13'; g.fillRect(lx - 5, ly + 2, 10, 3);
  const on = (G.keys + G.doorKeys) > 0;
  g.fillStyle = on ? '#7de3c8' : '#c2352c';
  g.globalAlpha = .55 + Math.sin(G.t * (on ? .12 : .05)) * .4;
  g.fillRect(lx - 3, ly - 11, 6, 6);
  g.globalAlpha = 1;
  drawMaedeup(g, lx, ly + 13, 6, '#e3b23c');
  g.restore();
}

/* ── 미니맵 ────────────────────────────────────────── */
function drawMinimap() {
  const cell = 9, gap = 2, ox = W - 8, oy = H - 8;
  const ids = Object.keys(MAP);
  const maxX = Math.max(...ids.map(i => MAP[i].gx));
  const maxY = Math.max(...ids.map(i => MAP[i].gy));
  const bw = (maxX + 1) * (cell + gap), bh = (maxY + 1) * (cell + gap);
  const x0 = ox - bw, y0 = oy - bh;
  g.save();
  g.fillStyle = 'rgba(6,6,12,.62)';
  g.fillRect(x0 - 4, y0 - 4, bw + 8, bh + 8);
  g.strokeStyle = 'rgba(241,236,224,.10)';
  g.strokeRect(x0 - 4.5, y0 - 4.5, bw + 9, bh + 9);
  ids.forEach(id => {
    const r = MAP[id];
    const x = x0 + r.gx * (cell + gap), y = y0 + r.gy * (cell + gap);
    const seen = G.visited.has(id);
    // 이웃과의 연결선
    ['E', 'S'].forEach(d => {
      const nb = neighbourOf(id, d);
      if (!nb || !(seen || G.visited.has(nb))) return;
      g.fillStyle = 'rgba(150,160,180,.35)';
      if (d === 'E') g.fillRect(x + cell, y + cell / 2 - .5, gap, 1);
      else g.fillRect(x + cell / 2 - .5, y + cell, 1, gap);
    });
    if (id === G.room) { g.fillStyle = '#e3b23c'; g.fillRect(x, y, cell, cell); }
    else if (seen) { g.fillStyle = 'rgba(160,172,192,.55)'; g.fillRect(x, y, cell, cell); }
    else {
      const adj = Object.keys(DIRS).some(d => {
        const nb = neighbourOf(id, d); return nb && G.visited.has(nb);
      });
      if (!adj) return;
      g.strokeStyle = 'rgba(160,172,192,.30)';
      g.strokeRect(x + .5, y + .5, cell - 1, cell - 1);
    }
    if (r.boss && seen) { g.fillStyle = '#c2352c'; g.fillRect(x + 3, y + 3, 3, 3); }
    if (r.final && seen) { g.fillStyle = '#7de3c8'; g.fillRect(x + 3, y + 3, 3, 3); }
    // ⛨ 관문 열쇠가 아직 남아 있는 방 — 어디로 가야 하는지 한눈에 보이도록
    // 깜빡입니다. (상자 열쇠 ✦ 와 헷갈려 헤매지 않게 하는 이정표입니다.)
    if (roomHasDoorKey(id)) {
      g.fillStyle = `rgba(227,178,60,${.55 + Math.sin(G.t * .11) * .45})`;
      g.fillRect(x + 3, y + 2, 3, 5);
      g.fillRect(x + 2, y + 3, 5, 3);
    }
    // 관문 방 자체 : 열리면 초록, 잠겨 있으면 자물쇠색
    if (r.needKeys) {
      g.fillStyle = G.gateOpen ? 'rgba(125,227,200,.9)' : 'rgba(227,178,60,.55)';
      g.fillRect(x + cell / 2 - 1, y + cell / 2 - 1, 2, 2);
    }
  });
  // 타임어택 — 지금 가야 할 곳까지의 가장 짧은 길을 작은 원으로 (다음 방은 크게 깜빡, 그 뒤는 점점 옅게)
  if (G.timeAttack) {
    const path = taRoute();
    path.forEach((id, i) => {
      const r = MAP[id], cx = x0 + r.gx * (cell + gap) + cell / 2, cy = y0 + r.gy * (cell + gap) + cell / 2;
      if (!G.visited.has(id)) { g.strokeStyle = 'rgba(125,227,200,.35)'; g.strokeRect(cx - cell / 2 + .5, cy - cell / 2 + .5, cell - 1, cell - 1); }
      const next = i === 0, pulse = .6 + .4 * Math.sin(G.t * .18);
      g.fillStyle = next ? `rgba(125,227,200,${pulse})` : `rgba(125,227,200,${Math.max(.3, .7 - i * .12)})`;
      g.beginPath(); g.arc(cx, cy, next ? 2.6 : 1.6, 0, Math.PI * 2); g.fill();
      if (next) { g.strokeStyle = `rgba(125,227,200,${pulse * .7})`; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.stroke(); }
    });
  }
  g.restore();
}
/* 타임어택 길잡이 — 지금 방에서 다음 목표(남은 관문 열쇠 방 → 심층 → 탈출구)까지 가장 짧은 방 순서 (지금 방은 빼고) */
function taRoute() {
  if (!G.room || !MAP[G.room]) return [];
  const prev = { [G.room]: null }, q = [G.room], dist = { [G.room]: 0 };
  while (q.length) { const c = q.shift(); for (const d in DIRS) { const nb = neighbourOf(c, d); if (nb && !(nb in prev)) { prev[nb] = c; dist[nb] = dist[c] + 1; q.push(nb); } } }
  const keys = DOOR_KEY_ROOMS.filter(id => roomHasDoorKey(id) && id in prev).sort((a, b) => dist[a] - dist[b]);
  const goal = keys.length ? keys[0] : Object.keys(MAP).find(id => G.bossDead ? MAP[id].final : MAP[id].boss);
  if (!goal || !(goal in prev) || goal === G.room) return [];
  const path = []; for (let c = goal; c && c !== G.room; c = prev[c]) path.unshift(c);
  return path;
}

/* ── 오브젝트 ──────────────────────────────────────── */
function drawPot(x, y) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath(); g.ellipse(x, y + 10, 11, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5e4526';
  g.beginPath(); g.ellipse(x, y, 11, 13, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6f5330';
  g.beginPath(); g.ellipse(x - 2, y - 2, 8, 10, 0, 0, Math.PI * 2); g.fill();
  drawSaekdong(g, x - 10, y - 2, 20, 3, false, .7);
  g.fillStyle = '#46331a'; g.fillRect(x - 6, y - 13, 12, 3);
  g.restore();
}

function drawChest(c) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.ellipse(c.x, c.y + 13, 20, 6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#493320'; g.fillRect(c.x - 18, c.y - 6, 36, 20);
  g.fillStyle = '#5b4028'; g.fillRect(c.x - 18, c.y - 6, 36, 6);
  if (c.open) {
    g.fillStyle = '#20150a'; g.fillRect(c.x - 16, c.y - 4, 32, 8);
    g.fillStyle = 'rgba(227,178,60,.18)'; g.fillRect(c.x - 16, c.y - 22, 32, 18);
  } else {
    g.fillStyle = '#5b4028';
    g.beginPath();
    g.moveTo(c.x - 18, c.y - 6);
    g.quadraticCurveTo(c.x, c.y - 24, c.x + 18, c.y - 6);
    g.closePath(); g.fill();
    drawSaekdong(g, c.x - 18, c.y - 9, 36, 4, false, .8);
    drawMaedeup(g, c.x, c.y + 3, 9, '#e3b23c');
    // 뚜껑 모서리에 맺힌 빛 — 반짝이는 점 몇 개 (예전의 둥근 빛 원판은 방어막처럼 보여서 뺐습니다)
    g.fillStyle = '#f3d27a';
    g.fillRect(c.x - 14, c.y - 7, 9, 1);
    [[-11, -15, 0], [9, -12, 2.1], [15, -3, 4.2]].forEach(([dx, dy, ph]) => {
      const tw = Math.sin(G.t * .07 + ph);
      if (tw < .2) return;
      g.globalAlpha = tw;
      g.fillRect(c.x + dx, c.y + dy - 1, 1, 3); g.fillRect(c.x + dx - 1, c.y + dy, 3, 1);
    });
    g.globalAlpha = 1;
  }
  g.strokeStyle = '#2c1d0e'; g.lineWidth = 1.5;
  g.strokeRect(c.x - 18, c.y - 6, 36, 20);
  g.restore();
}

function drawKey(x, y) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.4)';                       // 바닥 그림자
  g.beginPath(); g.ellipse(x + 2, y + 11, 8, 2.5, 0, 0, Math.PI * 2); g.fill();
  const tw = Math.sin(G.t * .08);                       // 고리에 맺힌 반짝임
  if (tw > .3) { g.globalAlpha = tw; g.fillStyle = '#fff3c4'; g.fillRect(x - 6, y - 10, 1, 3); g.fillRect(x - 7, y - 9, 3, 1); g.globalAlpha = 1; }
  g.strokeStyle = '#e3b23c'; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.arc(x - 3, y - 3, 4, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + 7, y + 7); g.stroke();
  g.beginPath(); g.moveTo(x + 5, y + 7); g.lineTo(x + 7, y + 4); g.stroke();
  drawMaedeup(g, x - 7, y + 8, 5, '#c2352c');
  g.restore();
}

/* ── 캐릭터 ────────────────────────────────────────── */
/* 주인공 생김새 — 시안 G (js/heroart.js).
   예전 노란 주인공 그림(assets/hero.png) 그대로에, 머리 양옆 관자놀이 커넥터에서
   오방색 전극선이 늘어져 바닥에 끌리고, 시뮬레이션이 아바타를 놓치듯 크게 깨지며
   (띠 찢김 · 색 분리 · 찢긴 줄 · 깨진 조각) 그 틈으로 진짜 사람(환자복 · 뇌파 캡을 한
   피험자 07)이 섞여 비칩니다. 깨지는 동안 선에도 빛이 흐릅니다.
   깊이 내려갈수록 자주 깨지고(숲 약 20초 → 심연 약 1초에 한 번), 커넥터와 전극선도
   그제야 하나씩 생깁니다 — 단계는 heroart.js 의 ORIGINAL.depth.
   그림은 처음 그릴 때 한 번 굽고(30×36 · 방향마다 4장), 전극선은 매 프레임 줄로 흉내.
   heroart.js 가 없으면 예전 그대로 그립니다. */
const HERO_G = window.HeroArt ? HeroArt.ORIGINAL : null;
const HERO_REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;   // 움직임 줄이기면 글리치 끔
let heroArtCache = null, heroRigT = -1, heroBurst = false, heroStage = null;
const heroGl = {};
function heroArt() {
  if (!heroArtCache && HERO_G && IMG.hero) heroArtCache = {
    sheet: HeroArt.bakeOriginal(IMG.hero, HERO, true),     // 관자놀이 커넥터 있음
    bare: HeroArt.bakeOriginal(IMG.hero, HERO, false),     // 없음 (숲)
    real: HeroArt.bakeSheet(HeroArt.LOOKS.A),          // 깨진 틈으로 비치는 진짜 사람
    rig: new HeroArt.CableRig(HERO_G.cables, HERO_G.rig)
  };
  return heroArtCache;
}

function drawPlayer() {
  if (G.hideHero) return;                               // 엔딩 — 주인공을 뺀 방 그림을 뜰 때
  // 실제 걸음 사이클(발이 땅에 닿는 타이밍)에 맞춘 통통 튀는 움직임.
  // 위로 뜰 때 살짝 눌리고(squash), 내려올 때 살짝 늘어나는(stretch)
  // 고전 애니메이션 원리로, 프레임이 몇 장 없는 스프라이트에도
  // 걷는 리듬감을 만들어 줍니다. walkAmt 는 걷기 시작/멈춤을 부드럽게
  // 이어주는 값이라, 급격히 꺾이지 않고 자연스럽게 리듬이 붙고 가라앉습니다.
  const phase = P.walkPhase;
  const amt = P.walkAmt;
  const bob = Math.sin(phase) * 1.6 * amt;
  const lift = Math.max(0, Math.sin(phase)) * amt;      // 0(착지)~1(정점)
  const squash = 1 - lift * 0.06;                       // 정점에서 살짝 눌림
  const stretch = 1 + lift * 0.05;
  const tilt = Math.sin(phase) * 0.05 * amt;            // 좌우로 살짝 흔들리는 걸음새

  g.save();
  g.fillStyle = 'rgba(0,0,0,.5)';
  const shadowSquish = 1 + lift * 0.14;                 // 뜰 때 그림자가 살짝 좁아짐
  if (window.PixFX) PixFX.ellipse(g, P.x, P.y + 15, 12 / shadowSquish, 4.5 / shadowSquish, 'rgba(0,0,0,.5)');
  else { g.beginPath(); g.ellipse(P.x, P.y + 15, 12 / shadowSquish, 4.5 / shadowSquish, 0, 0, Math.PI * 2); g.fill(); }

  if (P.inv > 0 && (G.t >> 2) % 2) g.globalAlpha = .35;

  const art = heroArt();
  if (art) {
    const { FW, FH } = HeroArt;
    const fi = HeroArt.frameIndex(P.dir, Math.floor(P.anim) % HeroArt.STEPS);
    const feet = P.y + 10;                               // 발바닥 줄 (칸의 34 줄)
    // 전극선 · 글리치는 한 프레임에 한 번만 움직임 (변이 장면에선 한 프레임에 두 번 그려짐)
    if (heroRigT !== G.t) {
      // 깊이 — 숲 0 · 던전 방 1~5 · 심연(보스 마지막 페이즈) 6
      const depth = G.inForest ? 0 : (G.boss && G.boss.kind === 'abom') ? 6 : G.depth;
      const stage = HeroArt.originalStage(depth, false);
      art.rig.update(P.x, feet - 1, 17 - bob, P.dir, 0);
      heroBurst = HeroArt.glitchTick(heroGl, stage, HERO_REDUCE);
      heroStage = HeroArt.originalStage(depth, heroBurst);
      heroRigT = G.t;
    }
    const st = heroStage, sheet = st.jacks ? art.sheet : art.bare;
    const glow = heroBurst ? .45 : st.glow;
    const behind = n => n.z > 2 || n.y <= feet + 1;      // 매달린 부분은 몸 뒤
    if (P.dir !== 'up') art.rig.draw(g, glow, G.t, behind, st.vis);
    g.save();
    g.translate(P.x, P.y + bob - FH / 2 + 12);
    g.rotate(tilt);
    g.scale(stretch, squash);
    if (heroBurst) HeroArt.drawGlitched(g, sheet, art.real, fi, -FW / 2, -FH / 2, st.power);
    else {
      g.drawImage(sheet, fi * FW, 0, FW, FH, -FW / 2, -FH / 2, FW, FH);
      if (!HERO_REDUCE && Math.random() < .02 * st.power * (st.rate / .008)) {   // 잔떨림 — 띠 하나만 튐 (깊을수록 자주)
        const y0 = 4 + (Math.random() * (FH - 8) | 0), h = 1 + (Math.random() * 3 | 0);
        g.drawImage(sheet, fi * FW, y0, FW, h, -FW / 2 + (Math.random() < .5 ? -2 : 2), -FH / 2 + y0, FW, h);
      }
    }
    g.restore();
    art.rig.draw(g, glow, G.t, P.dir === 'up' ? null : n => !behind(n), st.vis);   // 뒷모습이면 전부 몸 앞
  } else if (IMG.hero) {
    const seq = HERO[P.dir] || HERO.down;
    const idx = seq[Math.floor(P.anim) % seq.length];
    const w = 30, h = Math.round(30 * HERO.fh / HERO.fw);
    g.translate(P.x, P.y + bob - h / 2 + 12);
    g.rotate(tilt);
    g.scale(stretch, squash);
    g.drawImage(IMG.hero, idx * HERO.fw, 0, HERO.fw, HERO.fh, -w / 2, -h / 2, w, h);
  } else {
    g.fillStyle = '#f2e23a';
    g.beginPath(); g.arc(P.x, P.y, 11, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/* 포자 구름 — 바닥에 낮게 깔린 누런 안개. 테두리 없이 몇 덩이가 천천히
   뒤척이고, 홀씨 알갱이가 피어올랐다 사라집니다.
   (예전엔 테두리를 그린 둥근 원판이라 방어막처럼 보였습니다) */
function drawClouds() {
  G.clouds.forEach(c => {
    const k = c.life / c.max;
    const rr = c.r * (0.55 + (1 - k) * 0.45);
    const fade = Math.min(1, k * 3);             // 사라질 때만 옅어집니다
    g.save();
    for (let i = 0; i < 6; i++) {
      const a = c.seed * 3 + i * 1.05 + G.t * .005 * (i % 2 ? 1 : -1);
      const d = i === 0 ? 0 : rr * (.38 + (i % 3) * .1);
      const px = c.x + Math.cos(a) * d, py = c.y + Math.sin(a) * d * .55;
      const pr = rr * (i === 0 ? .75 : .52);
      const gr = g.createRadialGradient(px, py, 0, px, py, pr);
      gr.addColorStop(0, `rgba(160,158,74,${.2 * fade})`);
      gr.addColorStop(.6, `rgba(130,130,60,${.1 * fade})`);
      gr.addColorStop(1, 'rgba(120,120,55,0)');
      g.fillStyle = gr;
      g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    for (let i = 0; i < 16; i++) {               // 피어오르는 홀씨
      const ph = (G.t * .008 + i * .37 + c.seed) % 1;
      const a = c.seed + i * 2.4, d = rr * (((i * 53) % 10) / 10) * .85;
      const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d * .55 - ph * 12;
      g.globalAlpha = fade * (1 - ph) * .85;
      g.fillStyle = i % 3 ? '#cfc874' : '#efe7a2';
      g.fillRect(x | 0, y | 0, 1, 1);
    }
    g.restore();
  });
}

function drawFoe(f) {
  const C = FOE_SKIN[f.type] || FOE_SKIN.shroom;
  const bob = Math.sin(f.bob) * 2;
  const s = f.type === 'mini' ? 19 : f.type === 'splitter' ? 34 : f.type === 'shroom' ? 27 : 30;

  // 점멸체는 사라지는 동안 반쯤 비칩니다
  const warpK = f.warp ? Math.abs(Math.sin(f.warp * .32)) * .5 : 1;

  g.save();
  g.globalAlpha = warpK;
  if (window.PixFX) PixFX.ellipse(g, f.x, f.y + 11, s * .44, s * .17, 'rgba(0,0,0,.42)');      // 도트 그림자
  else { g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(f.x, f.y + 11, s * .38, s * .15, 0, 0, Math.PI * 2); g.fill(); }

  // 발밑에 깔리는 제 빛 — 어두운 방에서 뭐가 다가오는지 색으로 먼저 압니다
  // (둥근 공처럼 떠 보이지 않게 바닥에 납작하게 깐 타원)
  g.globalAlpha = (.5 + Math.sin(f.bob * .7) * .12) * warpK;
  g.save();
  g.translate(f.x, f.y + 10); g.scale(1, .42);
  const ag = g.createRadialGradient(0, 0, 2, 0, 0, s * .8);
  ag.addColorStop(0, `rgba(${C.glow},.34)`);
  ag.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = ag;
  g.beginPath(); g.arc(0, 0, s * .8, 0, Math.PI * 2); g.fill();
  g.restore();
  g.globalAlpha = warpK;

  // 돌진체 : 웅크리는 동안 — 발밑에서 흙먼지가 일고, 달려들 쪽으로 바닥에
  // 화살표가 길어집니다 (피할 신호. 예전의 붉은 고리는 방어막처럼 보였습니다)
  if (f.wind > 0) {
    const k = 1 - f.wind / BALANCE.chargerWind;
    const dx = P.x - f.x, dy = P.y - f.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    g.save();
    g.globalAlpha = .4 + k * .5;
    g.fillStyle = '#ff7a45';
    const len = 14 + k * 34;
    for (let t = 12; t < len; t += 4) g.fillRect((f.x + ux * t - 1) | 0, (f.y + 10 + uy * t * .9 - 1) | 0, 2, 2);
    const hx = f.x + ux * (len + 3), hy = f.y + 10 + uy * (len + 3) * .9;
    for (let i = 0; i < 3; i++) {                                         // 화살촉
      const bx = hx - ux * i * 2, by = hy - uy * i * 2;
      g.fillRect((bx - uy * i * 1.6) | 0, (by + ux * i * 1.6) | 0, 2, 2);
      g.fillRect((bx + uy * i * 1.6) | 0, (by - ux * i * 1.6) | 0, 2, 2);
    }
    g.fillStyle = '#7a6250';                                              // 뒷발에 차인 흙먼지
    for (let i = 0; i < 4; i++) {
      const a = Math.atan2(-uy, -ux) + (i - 1.5) * .45, r = 10 + ((G.t + i * 5) % 9) * 1.4 * k;
      g.globalAlpha = (.3 + k * .4) * (1 - ((G.t + i * 5) % 9) / 9);
      g.fillRect((f.x + Math.cos(a) * r) | 0, (f.y + 10 + Math.sin(a) * r * .5) | 0, 2, 1);
    }
    g.restore();
  }

  // 피격 중에는 주인공처럼 깜빡인다
  if (f.flash > 0 && (G.t >> 1) % 2) g.globalAlpha = .45 * warpK;

  // 몸통은 종류마다 다르게 — foeart.js. 한 장의 도트 그림으로 정리해 찍습니다 (pixfx.js —
  // 계단 가장자리 · 1px 외곽선 · 위 빛 아래 그늘 · 맞으면 흰 실루엣). 조금 크게(1.15배) — 어두운 방에서도 읽히게
  const Z = 1.15, box = Math.ceil(s * 2.2 * Z) + 8, flash = f.flash > 0 ? ((G.t >> 1) % 2 ? .85 : .35) : 0;
  const body = c => {
    c.scale(Z, Z);
    // 돌진 예비 동작 때는 뒤로 움츠렸다가 튀어 나갑니다
    if (f.wind > 0) { const k = 1 - f.wind / BALANCE.chargerWind; c.scale(1 + k * .18, 1 - k * .14); }
    if (f.dash > 0) c.scale(1.14, .90);      // 튀어나가는 동안엔 납작하게 늘어납니다
    drawFoeBody(c, f, s, G.t);
  };
  if (window.PixFX) PixFX.sprite(g, f.x, f.y + Math.round(bob), box, box, box / 2, box * .58, body, { outline: '#0a080e', flash });
  else { g.translate(f.x, f.y + bob); body(g); }
  g.restore();
}

/* 퍼져 나가는 충격파 고리 */
function drawRings() {
  if (!G.rings.length) return;
  const g0 = g; if (window.PixFX) g = PixFX.layerBegin(g0);    // 도트 겹으로
  try { drawRingsIn(); } finally { g = g0; }
}
function drawRingsIn() {
  g.save();
  if (!G.inForest) { g.beginPath(); g.rect(TS, TS, W - TS * 2, H - TS * 2); g.clip(); }
  g.globalCompositeOperation = 'lighter';
  G.rings.forEach(r => {
    const k = r.life / r.maxLife;
    g.globalAlpha = k * k * .85;
    g.strokeStyle = `rgba(${r.c},1)`;
    g.lineWidth = Math.max(.6, r.w * k);
    g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * .82, 0, 0, Math.PI * 2); g.stroke();
    // 고리 안쪽에 옅게 깔리는 빛
    g.globalAlpha = k * k * .12;
    g.beginPath(); g.ellipse(r.x, r.y, r.r * .92, r.r * .76, 0, 0, Math.PI * 2); g.fill();
  });
  g.restore();
}

/* 보스 주변의 빛 — 단계가 오를수록 색이 짙어지고 빛줄기가 돕니다 */
function drawBossLight() {
  const B = G.boss;
  const ph = B.phase;
  const pulse = .5 + Math.sin(G.t * .09) * .5;
  const wind = B.wind > 0 ? (1 - B.wind / 32) : 0;
  const col = ph === 1 ? '150,60,220' : ph === 2 ? '200,60,150' : '224,72,60';
  g.save();
  // 빛은 방 안쪽(바닥)에서만 — 벽 너머로 새면 방이 뚫려 보입니다
  g.beginPath(); g.rect(TS, TS, W - TS * 2, H - TS * 2); g.clip();
  g.globalCompositeOperation = 'lighter';

  // 바닥을 넓게 물들이는 빛
  g.globalAlpha = .16 + pulse * .1 + wind * .2;
  const lg = g.createRadialGradient(B.x, B.y, 8, B.x, B.y, 150 + ph * 22);
  lg.addColorStop(0, `rgba(${col},.85)`);
  lg.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = lg; g.fillRect(0, 0, W, H);

  // 천천히 도는 빛줄기 (단계가 바뀐 직후 한동안 더 밝게)
  const rays = 4 + ph * 2;
  const boost = B.rayT > 0 ? B.rayT / 90 : 0;
  for (let i = 0; i < rays; i++) {
    const a = G.t * (.006 + ph * .002) + (i / rays) * Math.PI * 2;
    g.globalAlpha = (.05 + pulse * .045 + wind * .1 + boost * .22);
    g.strokeStyle = `rgb(${col})`;
    g.lineWidth = 3 + wind * 8 + boost * 6;
    g.beginPath(); g.moveTo(B.x, B.y);
    g.lineTo(B.x + Math.cos(a) * 300, B.y + Math.sin(a) * 300);
    g.stroke();
  }
  g.restore();
}

function drawBoss() {
  const B = G.boss;
  const wind = B.wind > 0 ? (1 - B.wind / 32) : 0;
  const sc = 1 + Math.sin(B.bob) * .04 + wind * .18;
  g.save();
  if (window.PixFX) PixFX.ellipse(g, B.x, B.y + 30, 34, 10, 'rgba(0,0,0,.45)');
  else { g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(B.x, B.y + 30, 34, 10, 0, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = .25 + wind * .5;
  const ag = g.createRadialGradient(B.x, B.y, 10, B.x, B.y, 60 + wind * 26);
  ag.addColorStop(0, 'rgba(150,60,220,.55)'); ag.addColorStop(1, 'rgba(150,60,220,0)');
  g.fillStyle = ag;
  g.beginPath(); g.arc(B.x, B.y, 62 + wind * 26, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  // 눈 — 도트 그림 그대로, 숨 쉬는 크기는 2픽셀 단위로만 (소수 배율로 늘이면 픽셀이 일렁입니다) · 외곽선 · 맞으면 흰 실루엣
  const w = Math.round(96 * sc / 2) * 2, h = Math.round(87 * sc / 2) * 2;
  const eye = c => {
    if (IMG.eye) { c.imageSmoothingEnabled = false; c.drawImage(IMG.eye, -w / 2, -h / 2, w, h); }
    else { c.fillStyle = '#c33'; c.beginPath(); c.arc(0, 0, 34, 0, 6.3); c.fill(); }
  };
  const fl = B.flash > 0 ? ((G.t >> 1) % 2 ? .8 : .3) : 0;
  if (window.PixFX) PixFX.sprite(g, B.x, B.y, w + 6, h + 6, w / 2 + 3, h / 2 + 3, eye, { outline: '#07050c', hi: .12, lo: .18, flash: fl });
  else { g.translate(B.x, B.y); eye(g); }
  g.restore();

  const bw = 220, bx = camX() + (VW - bw) / 2, by = camY() + VH + OY - 18;   // 화면 아래 가운데 (늘어난 띠까지 내려서)
  g.save();
  g.fillStyle = 'rgba(8,8,14,.75)'; g.fillRect(bx - 2, by - 2, bw + 4, 9);
  g.fillStyle = '#3a1c1c'; g.fillRect(bx, by, bw, 5);
  g.fillStyle = '#c2352c'; g.fillRect(bx, by, bw * Math.max(0, B.hp / B.max), 5);
  drawSaekdong(g, bx, by - 4, bw, 2, false, .55);
  g.restore();
}

/* ── 페이즈3 「심연」 그리기 ────────────────────────────
   원본 스프라이트를 실루엣으로 만들거나 색을 얹어야 해서, 작은 보조
   캔버스에 한 번 그린 뒤 source-atop 으로 덮어 씁니다. 크기가 고정이라
   캔버스 하나를 계속 재사용합니다. ── */
let _tintCv = null;
function tintedAbom(w, h, col, amt) {
  if (!IMG.abom) return null;
  if (!_tintCv) _tintCv = document.createElement('canvas');
  const c = _tintCv;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const t = c.getContext('2d');
  t.globalCompositeOperation = 'source-over';
  t.globalAlpha = 1;
  t.clearRect(0, 0, w, h);
  t.drawImage(IMG.abom, 0, 0, w, h);
  if (amt > 0) {
    t.globalCompositeOperation = 'source-atop';
    t.globalAlpha = Math.min(1, amt);
    t.fillStyle = col;
    t.fillRect(0, 0, w, h);
    t.globalAlpha = 1;
  }
  return c;
}

/* 몸통 한 장. sil = 검게 먹인 정도(0 원색 ~ 1 완전 실루엣) */
/* ── 심연의 골격 ───────────────────────────────────────────────────
   그림은 한 장뿐이지만, 캔버스 클립으로 세 조각(왼쪽 낫 팔 · 오른쪽 집게
   팔 · 몸통)으로 나눠 따로 움직입니다. 조각을 파일로 따로 뽑지 않으니
   용량이 늘지 않고, 자르는 자리를 코드에서 바로 만질 수 있습니다.

   몸통에서 지우는 범위(erase)를 팔이 그려지는 범위(draw)보다 좁게 잡아
   관절에 그루터기를 남깁니다 — 그래서 팔이 돌아도 구멍이 안 보입니다.
   좌표는 원본 그림(168×113) 기준이고, 그릴 때 크기에 맞춰 환산합니다. */
const AB_L = { draw: 50,  bot: 72, erase: 40,  px: 46,  py: 30 };   // 왼쪽 낫 팔
const AB_R = { draw: 120, bot: 74, erase: 130, px: 124, py: 26 };   // 오른쪽 집게 팔
const AB_REST = { la: 0, ra: 0, lift: 0, lean: 0, sx: 1, sy: 1 };

function abomBody(x, y, sc, sil, alpha, po, tint) {
  const w = ABOM_W, h = ABOM_H;
  const im = tint ? tintedAbom(w, h, tint[0], tint[1])
                  : sil > .01 ? tintedAbom(w, h, '#1a0608', sil) : IMG.abom;
  po = po || AB_REST;
  const sx = v => -w / 2 + v * (w / 168);          // 원본 px → 그리는 좌표
  const sy = v => -h / 2 + v * (h / 113);

  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  if (po.lean) g.rotate(po.lean * Math.PI / 180);
  g.scale(sc * po.sx, sc * po.sy);

  if (!im) {   // 그림을 못 불러왔을 때를 위한 최소한의 대체
    g.fillStyle = '#3a1418'; g.beginPath(); g.arc(0, 0, 46, 0, 6.3); g.fill();
    g.restore(); return;
  }

  // ① 몸통 — 두 팔 자리를 도려낸 나머지 (evenodd 로 구멍을 냅니다)
  g.save();
  g.beginPath();
  g.rect(-w / 2, -h / 2, w, h);
  g.rect(sx(0), sy(0), sx(AB_L.erase) - sx(0), sy(AB_L.bot - 10) - sy(0));
  g.rect(sx(AB_R.erase), sy(0), sx(168) - sx(AB_R.erase), sy(AB_R.bot - 10) - sy(0));
  g.clip('evenodd');
  g.drawImage(im, -w / 2, -h / 2, w, h);
  g.restore();

  // ② 두 팔 — 각자 관절을 축으로 돌고, 집게는 들어 올리기도 합니다
  [[AB_L, po.la, 0, true], [AB_R, po.ra, -po.lift, false]].forEach(([A, ang, dy, isL]) => {
    if (isL && po.noL) return;          // 죽으면서 뜯겨 나간 낫 팔 (따로 그립니다)
    g.save();
    g.translate(sx(A.px), sy(A.py) + dy);
    g.rotate(ang * Math.PI / 180);
    g.translate(-sx(A.px), -sy(A.py));
    g.beginPath();
    if (isL) g.rect(sx(0), sy(0), sx(A.draw) - sx(0), sy(A.bot) - sy(0));
    else     g.rect(sx(A.draw), sy(0), sx(168) - sx(A.draw), sy(A.bot) - sy(0));
    g.clip();
    g.drawImage(im, -w / 2, -h / 2, w, h);
    g.restore();
  });
  g.restore();
}

/* 지금 무슨 동작 중이냐에 따라 팔과 몸통이 잡는 자세.
   그림이 한 장이라 자세는 전부 조각의 회전 · 들어 올림 · 기울임 · 눌림으로
   냅니다. 가만히 있을 때도 두 팔이 서로 어긋난 주기로 꿈틀거립니다. */
function abomPose(B) {
  const ease = k => (k = Math.max(0, Math.min(1, k))) * k * (3 - 2 * k);
  const idleL = Math.sin(B.bob) * 2.5;
  const idleR = Math.sin(B.bob * .8 + 1.7) * 2;
  const po = { la: idleL, ra: idleR, lift: 0,
               lean: Math.sin(B.bob * .6) * 1.2, sx: 1, sy: 1 };
  const t = B.actT, A = B.act ? ABOM_ACT[B.act] : null;

  if (A && B.act === 'blade') {
    const w = abomWind(B.act), sw = B.stage === 2 ? 44 : 58;
    if (t <= w) {                                  // 낫을 뒤로 크게 당깁니다
      const k = ease(t / w);
      po.la = idleL - 34 * k; po.lean = 5 * k; po.sx = 1 + .04 * k;
    } else if (t <= w + sw) {                      // 훑는 동안 팔이 같이 돕니다
      const k = (t - w) / sw;
      po.la = -34 + 78 * ease(k * 1.25);
      po.lean = 5 - 11 * ease(k * 1.4);
    } else {                                       // 되돌아옵니다
      const k = ease((t - w - sw) / 20);
      po.la = 44 * (1 - k) + idleL * k;
      po.lean = -6 * (1 - k);
    }
  }
  else if (A && B.act === 'claw') {
    const w = abomWind(B.act);
    if (t <= w) {                                  // 집게를 높이 들어 올립니다
      const k = ease(t / w);
      po.ra = idleR + 26 * k; po.lift = 11 * k;
      po.sy = 1 + .06 * k; po.lean = -3 * k;
    } else if (t <= w + 17) {                      // 그대로 내리찍습니다
      const k = ease((t - w) / 17);
      po.ra = 26 - 54 * k; po.lift = 11 - 16 * k;
      po.sy = 1.06 - .14 * k; po.sx = 1 + .08 * k;
    } else {                                       // 찍고 나서 천천히 일어납니다
      const k = ease((t - w - 17) / 26);
      po.ra = -28 * (1 - k) + idleR * k;
      po.lift = -5 * (1 - k);
      po.sy = .92 + .08 * k; po.sx = 1.08 - .08 * k;
    }
  }
  else if (A && B.act === 'lash') {
    const w = abomWind(B.act);
    if (t <= w) {                                  // 웅크리며 양팔을 벌립니다
      const k = ease(t / w);
      po.la = idleL - 13 * k; po.ra = idleR + 15 * k;
      po.sx = 1 + .07 * k; po.sy = 1 - .05 * k;
    } else {                                       // 촉수가 뻗으며 앞으로 쏠립니다
      const k = ease((t - w) / 14);
      po.la = -13 + 13 * k; po.ra = 15 - 15 * k;
      po.sx = 1.07 - .12 * k; po.sy = .95 + .11 * k;
    }
  }
  else if (A && B.act === 'scream') {
    const w = abomWind(B.act), fast = B.stage === 2;
    if (t <= w) {                                  // 숨을 들이켜며 팔을 끌어안습니다
      const k = ease(t / w);
      po.la = idleL + 10 * k; po.ra = idleR - 11 * k;
      po.sx = 1 + .09 * k; po.sy = 1 + .07 * k;
    } else {                                       // 외칠 때마다 확 퍼집니다
      let pulse = 0;
      (fast ? [w, w + 26, w + 52] : [w, w + 34]).forEach(bt => {
        const d = t - bt;
        if (d >= 0 && d < 18) pulse = Math.max(pulse, 1 - d / 18);
      });
      const k = ease((t - w) / 60);
      po.sx = 1.09 + .10 * pulse; po.sy = 1.07 - .06 * pulse;
      po.la = 10 * (1 - k) + idleL * k; po.ra = -11 * (1 - k) + idleR * k;
    }
  }

  if (B.flash > 0) {                               // 맞으면 움찔합니다
    const k = B.flash / BALANCE.foeFlash;
    po.lean += Math.sin(B.flash * 1.9) * 3 * k;
    po.sx *= 1 - .05 * k; po.sy *= 1 + .05 * k;
  }
  return po;
}

/* 변신 도중 — 바닥에서 아래부터 드러나며 솟아오르는 실루엣 */
function drawMorphRise() {
  const t = G.morphT;
  if (t < RISE_FROM) return;
  const rise = Math.min(1, (t - RISE_FROM) / (RISE_TO - RISE_FROM));
  const e = rise * rise * (3 - 2 * rise);                 // 부드럽게
  /* 다 올라온 뒤에야 색이 번집니다. 솟는 동안에도 0.9 까지만 먹여서
     원래 색이 10% 쯤 비치게 뒀습니다 — 완전한 먹색이면 어둠 속에서
     아예 형태가 안 보였습니다. */
  const sil = .9 * (t < RISE_TO ? 1 : Math.max(0, 1 - (t - RISE_TO) / 160));
  const x = G.morphX, y = G.morphY + (1 - e) * 20;
  const bottom = y + ABOM_H / 2;

  g.save();
  // 아직 올라오지 않은 아랫부분은 바닥에 묻혀 있어야 합니다
  g.beginPath();
  g.rect(x - ABOM_W, bottom - ABOM_H * e - 2, ABOM_W * 2, ABOM_H * e + 4);
  g.clip();

  // 가장자리를 훑는 붉은 테두리 빛
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = (.46 + Math.sin(t * .12) * .14) * (.6 + e * .4);
  const rg = g.createRadialGradient(x, y + 10, 8, x, y + 10, 112);
  rg.addColorStop(0, 'rgba(255,120,92,.95)');
  rg.addColorStop(.45, 'rgba(224,72,60,.5)');
  rg.addColorStop(1, 'rgba(224,72,60,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(x, y + 10, 112, 0, Math.PI * 2); g.fill();
  g.restore();

  /* 솟아오르는 동안에도 두 팔이 느리게 꿈틀거립니다 — 가만히 있는
     그림 한 장이 아니라 "살아 있는 것"으로 보여야 합니다. */
  abomBody(x, y, .94 + e * .06, sil, 1, {
    la: Math.sin(t * .035) * 6 - 4, ra: Math.sin(t * .028 + 2.1) * 5 + 3,
    lift: Math.sin(t * .03) * 2, lean: Math.sin(t * .022) * 1.6,
    sx: 1, sy: 1
  });

  // 가운데 눈만 먼저 붉게 달아오릅니다 — 각성 직전까지 천천히 밝아집니다
  if (t > RISE_FROM + 140) {
    const k = Math.min(1, (t - RISE_FROM - 140) / (WAKE_AT - RISE_FROM - 140));
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = k * (.55 + Math.sin(t * .22) * .3);
    const eg = g.createRadialGradient(x, y - 2, 1, x, y - 2, 26 + k * 12);
    eg.addColorStop(0, 'rgba(255,240,235,.95)');
    eg.addColorStop(.35, 'rgba(232,60,52,.75)');
    eg.addColorStop(1, 'rgba(232,60,52,0)');
    g.fillStyle = eg;
    g.beginPath(); g.arc(x, y - 2, 38, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.restore();

  /* 발밑에서 갈라진 바닥 틈 — 별 모양으로 뻗으면 몸통을 뚫고 나온 것처럼
     보여서, 바닥에 눌어붙도록 세로 성분을 눌러 옆으로 기어가게 하고
     마디마다 꺾었습니다. 다 올라오고 나면 서서히 식습니다. */
  const cool = t > RISE_TO ? Math.max(0, 1 - (t - RISE_TO) / 120) : 1;
  const cy = bottom - 5;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .45 * e * cool;
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + .35;
    const len = (26 + e * 58) * (.7 + (i % 3) * .2);
    g.strokeStyle = '#ff7a52'; g.lineWidth = 1 + e * 2.2;
    g.beginPath(); g.moveTo(x, cy);
    // 세 마디로 꺾이며 뻗는 균열 (세로는 0.28 배로 눌러 바닥에 붙입니다)
    for (let k = 1; k <= 3; k++) {
      const ka = a + Math.sin(i * 2.3 + k) * .22;
      g.lineTo(x + Math.cos(ka) * len * (k / 3),
               cy + Math.sin(ka) * len * (k / 3) * .28);
    }
    g.stroke();
  }
  g.lineCap = 'butt';
  g.restore();
}

/* 변신 컷신의 암막과 자막 — 화면 전체에 얹습니다 */
function renderMorph() {
  if (G.morphDark > .002) {
    g.save();
    g.globalAlpha = G.morphDark;
    g.fillStyle = '#040306';
    g.fillRect(0, 0, W, H);
    g.restore();
  }
  /* 암막 아래 깔린 입자들은 거의 보이지 않으므로, 이 연출에 꼭 필요한
     것들(빨려 드는 빛 · 흙 부스러기)만 암막 위에 한 번 더 얹습니다. */
  if (G.morphDark > .02) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    G.fx.forEach(f => {
      const k = f.life / f.max;
      if (f.k === 'suck') {
        g.globalAlpha = (1 - k) * .9 * G.morphDark;
        g.fillStyle = f.c; g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
      } else if (f.k === 'p') {
        g.globalAlpha = k * .8 * G.morphDark;
        g.fillStyle = f.c; g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
      }
    });
    g.restore();
  }

  /* 피팩을 줍는 동안은 주인공도 어둠 위로 드러납니다 — 캄캄한 방에서
     팩 하나만 빛나고, 그 빛에 주인공이 비치는 그림입니다. */
  const mt = G.morphT;
  if (mt <= PACK_EAT + 26 && G.morphDark > .02) {
    const k = mt <= PACK_EAT ? 1 : 1 - (mt - PACK_EAT) / 26;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .3 * k;
    const pg = g.createRadialGradient(P.x, P.y, 2, P.x, P.y, 58);
    pg.addColorStop(0, 'rgba(255,226,214,.9)');
    pg.addColorStop(1, 'rgba(255,160,140,0)');
    g.fillStyle = pg;
    g.beginPath(); g.arc(P.x, P.y, 58, 0, 6.3); g.fill();
    g.restore();
    g.save(); g.globalAlpha = .85 * k; drawPlayer(); g.restore();
  }
  drawMedpack();

  // 어둠 속에서도 몸통과 바닥 틈은 보여야 하므로 암막 위에 그립니다
  if (!G.boss) drawMorphRise();
}

/* 낡은 구급 팩 — 암막 위에 그려야 어둠 속에서도 보입니다 */
function drawMedpack() {
  const m = G.medpack;
  if (!m || m.eaten || G.morphPre < MORPH_PRE) return;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.ellipse(m.x, Math.max(m.y, m.ly) + 7, 7, 2.5, 0, 0, 6.3); g.fill();

  // 어둠 속에서 이것만 은은하게 빛납니다
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .55 + Math.sin(G.t * .16) * .18;
  const lg = g.createRadialGradient(m.x, m.y, 1, m.x, m.y, 28);
  lg.addColorStop(0, 'rgba(255,238,234,.95)');
  lg.addColorStop(1, 'rgba(255,120,110,0)');
  g.fillStyle = lg;
  g.beginPath(); g.arc(m.x, m.y, 28, 0, 6.3); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  g.translate(m.x, m.y); g.rotate(Math.sin(m.spin) * .5);
  g.fillStyle = '#ded6c4'; g.fillRect(-6, -5, 12, 10);          // 팩 몸통
  g.fillStyle = '#9c9384'; g.fillRect(-6, -5, 12, 1); g.fillRect(-6, 4, 12, 1);
  g.fillStyle = '#c2352c'; g.fillRect(-1, -3, 2, 6); g.fillRect(-3, -1, 6, 2);   // 적십자
  g.restore();
}

/* ═══════════ 변이 — 눈이 심연에게 먹히는 장면 ═══════════════
   눈을 쓰러뜨린 순간부터 기존 변신 컷신의 암전(①)까지. 예전엔 눈이 한 번에
   터져 사라지고 어둠 속에서 심연이 솟았는데, 그 사이를 보여 줍니다.
   심연 가슴 한가운데의 붉은 눈이 바로 이 눈입니다.

     0‥36    : 멈춤 — 쓰러진 눈이 그 자리에 굳고 하얗게 번쩍
     36‥214  : 박동 — 점점 빨라지는 심장 소리, 보랏빛이 핏빛으로 번짐
     60‥200  : 균열 — 흰자위에 붉은 금이 퍼짐
     110‥230 : 바닥이 갈라지고 촉수가 올라와 눈을 휘감음
     170·186 : 안쪽에서 녹슨 쇠갈고리가 뚫고 나옴 (심연의 낫·집게)
     214     : 뿔 달린 껍데기가 산산조각 — 맨 눈알만 남음
     236‥320 : 촉수가 눈알을 바닥 속으로 끌어내림
     330     : 구멍에서 빛이 터지고, 기존 암전으로 이어짐 */
const MORPH_PRE = 330;
const EM_BEATS = [40, 80, 114, 142, 166, 186, 202, 214];
const EM_HOOKS = [170, 186];
const EM_SHATTER = 214, EM_SINK = 236, EM_SINK_DUR = 84;
/* 촉수 여섯 가닥 — [바닥 뿌리 x, 뿌리 y, 감아쥘 각도(도)] (눈 중심 기준) */
const EM_TENT = [[-58, 32, 196], [-36, 38, 150], [-12, 40, 112],
                 [14, 40, 70], [38, 37, 30], [58, 30, -14]];
const clamp01g = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth01 = k => (k = clamp01g(k)) * k * (3 - 2 * k);

/* 눈 그림에 색을 얹는 보조 캔버스 (tintedAbom 과 같은 방식) */
let _eyeTintCv = null;
function tintedEye(w, h, col, amt) {
  if (!IMG.eye) return null;
  if (amt <= .01) return IMG.eye;
  if (!_eyeTintCv) _eyeTintCv = document.createElement('canvas');
  const c = _eyeTintCv;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const t = c.getContext('2d');
  t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
  t.clearRect(0, 0, w, h);
  t.drawImage(IMG.eye, 0, 0, w, h);
  t.globalCompositeOperation = 'source-atop';
  t.globalAlpha = Math.min(1, amt); t.fillStyle = col; t.fillRect(0, 0, w, h);
  return c;
}

function startEyeMorph(B) {
  G.morphPre = 0;
  G.eyeMorph = {
    x0: B.x, y0: B.y, x: B.x, y: B.y, beat: 0, shards: [],
    // 흰자위에 퍼질 균열 — 마디마다 꺾이며 뻗습니다
    cracks: Array.from({ length: 7 }, (_, i) => {
      let a = i / 7 * Math.PI * 2 + Math.random() * .5, r = 3;
      const pts = [[Math.cos(a) * r, Math.sin(a) * r]];
      while (r < 34) { r += 5 + Math.random() * 6; a += (Math.random() - .5) * .7; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      return pts;
    })
  };
  Sfx.hit(); Sfx.glitch();
  glare(.9); G.flash = Math.max(G.flash, .8); G.shake = 22;
  shockRing(B.x, B.y, 220, '255,255,255', 6, 30);
}

function tickEyeMorph(t) {
  const M = G.eyeMorph;
  tickFx();
  // 방 안쪽, 심연이 솟을 자리로 천천히 끌려갑니다
  const k = smooth01(t / 60);
  M.x = M.x0 + (G.morphX - M.x0) * k;
  M.y = M.y0 + (G.morphY - M.y0) * k;
  M.beat *= .86;

  const bi = EM_BEATS.indexOf(t);
  if (bi >= 0) {                                      // 점점 빨라지는 박동
    M.beat = 1;
    Sfx.landThump(.16 + bi * .04);
    G.shake = Math.max(G.shake, 5 + bi * 1.5);
    shockRing(M.x, M.y, 90 + bi * 14, '224,72,60', 2 + bi * .3, 18);
  }
  if (t < 36) G.shake = Math.max(G.shake, 6);
  if (t === 110) {                                    // 바닥이 갈라집니다
    Sfx.pot(); Sfx.landThump(.4); G.shake = Math.max(G.shake, 14);
  }
  if (t >= 110 && t < 236) {
    if (t % 13 === 0) Sfx.creepType();                // 젖은 것이 꿈틀대는 소리
    if (t % 4 === 0)
      G.fx.push({ k: 'p', x: M.x + (Math.random() - .5) * 110, y: M.y + 36,
                  vx: (Math.random() - .5) * 1.6, vy: -.6 - Math.random() * 1.8,
                  life: 24, max: 24, c: '#5a3a30' });
  }
  if (EM_HOOKS.includes(t)) {                         // 쇠갈고리가 뚫고 나옵니다
    const sd = t === EM_HOOKS[0] ? -1 : 1;
    Sfx.hit(); G.shake = Math.max(G.shake, 16);
    for (let i = 0; i < 12; i++)
      G.fx.push({ k: 'p', x: M.x + sd * 30, y: M.y - 6, vx: sd * (1 + Math.random() * 3),
                  vy: (Math.random() - .7) * 3, life: 18, max: 18, c: i % 2 ? '#ffb27a' : '#ffe0a0' });
  }
  if (t === EM_SHATTER) {                             // 껍데기가 산산조각
    Sfx.bossRoar(); Sfx.glitch();
    glare(1); G.flash = 1; G.shake = 30;
    shockRing(M.x, M.y, 300, '150,60,220', 7, 40);
    shockRing(M.x, M.y, 200, '255,255,255', 5, 30);
    const floorY = M.y + 34;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = 28 + Math.random() * 12, sp = 1.4 + Math.random() * 3;
      M.shards.push({
        x: M.x + Math.cos(a) * r, y: M.y + Math.sin(a) * r * .9,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.4, rot: Math.random() * 6, vr: (Math.random() - .5) * .5,
        s: 3 + Math.random() * 5, c: ['#2a1f33', '#4a2a62', '#1a1420', '#7d3fb0', '#5b2f86'][i % 5],
        floor: floorY - 4 + Math.random() * 22, life: 0
      });
    }
  }
  M.shards.forEach(s => {                             // 파편은 떨어져 바닥에 흩어집니다
    s.life++;
    if (s.y < s.floor) { s.vy += .22; s.x += s.vx; s.y += s.vy; s.rot += s.vr; }
    else { s.y = s.floor; s.vx = s.vy = s.vr = 0; }
  });
  if (t === EM_SINK + 10) Sfx.breath();
  if (t > EM_SINK && t % 3 === 0) {                   // 빛이 구멍으로 빨려 듭니다
    const a = Math.random() * 6.28, d = 70 + Math.random() * 60;
    G.fx.push({ k: 'suck', x: M.x + Math.cos(a) * d, y: M.y + 30 + Math.sin(a) * d * .5,
                tx: M.x, ty: M.y + 34, life: 18, max: 18, c: '#ff7a6a' });
  }
  if (t > EM_SINK) G.shake = Math.max(G.shake, 3 + (t - EM_SINK) * .1);
  if (t === MORPH_PRE - 12) { Sfx.landThump(.6); G.shake = Math.max(G.shake, 20); }

  if (t === MORPH_PRE) {                              // 끝 — 기존 암전으로
    glitchDeath(G.morphX, G.morphY + 20, true);
    glare(1.4); G.shake = 34; G.flash = 1;
    shockRing(G.morphX, G.morphY, 420, '255,255,255', 10, 52);
    shockRing(G.morphX, G.morphY, 300, '194,53,44', 7, 44);
    Sfx.bossRoar(); Sfx.glitch();
  }
}

/* 촉수 한 가닥 — 뿌리에서 끝으로 가늘어지는 곡선. grow 만큼만 뻗어 있습니다 */
function drawTentacle(x0, y0, cx, cy, x1, y1, grow) {
  const N = 16, n = Math.max(2, Math.ceil(N * grow));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / N, v = 1 - u;
    pts.push([v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1]);
  }
  g.lineCap = 'round';
  [['#2a0c10', 2.4], ['#8a3a40', 0], ['#c76a6e', -2.6]].forEach(([col, extra], pass) => {
    g.strokeStyle = col;
    for (let i = 1; i < pts.length; i++) {
      const w = (7 - 5.5 * (i / N)) + extra;
      if (w <= .4) continue;
      g.lineWidth = w;
      g.beginPath();
      const ox = pass === 2 ? -1 : 0, oy = pass === 2 ? -1 : 0;   // 윗면 윤기
      g.moveTo(pts[i - 1][0] + ox, pts[i - 1][1] + oy);
      g.lineTo(pts[i][0] + ox, pts[i][1] + oy);
      g.stroke();
    }
  });
  g.lineCap = 'butt';
}

function drawEyeMorph() {
  const M = G.eyeMorph;
  if (!M) return;
  const t = G.morphPre;
  const crackK = clamp01g((t - 60) / 140);
  const tentK = clamp01g((t - 110) / 120);
  const sink = smooth01((t - EM_SINK) / EM_SINK_DUR);
  const red = clamp01g((t - 30) / 160);
  const bare = t >= EM_SHATTER;
  const floorY = M.y + 34;
  const jit = t < 36 ? 3 : 1 + crackK * 2 + M.beat * 2;
  const ex = M.x + (Math.random() - .5) * jit;
  const ey = M.y + (Math.random() - .5) * jit + sink * 62;
  const sc = (1 + M.beat * .09) * (bare ? 1 : 1) * (1 - sink * .35);

  g.save();
  g.beginPath(); g.rect(TS, TS, W - TS * 2, H - TS * 2); g.clip();

  // 발밑의 구멍과 갈라진 바닥
  if (tentK > 0) {
    const rx = 12 + tentK * 34 + sink * 10;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .45 * tentK;
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + .3, len = (30 + tentK * 60) * (.7 + (i % 3) * .2);
      g.strokeStyle = '#ff7a52'; g.lineWidth = 1 + tentK * 2;
      g.beginPath(); g.moveTo(M.x, floorY);
      for (let s = 1; s <= 3; s++) {
        const ka = a + Math.sin(i * 2.3 + s) * .22;
        g.lineTo(M.x + Math.cos(ka) * len * s / 3, floorY + Math.sin(ka) * len * s / 3 * .28);
      }
      g.stroke();
    }
    g.restore();
    g.fillStyle = '#050304';
    g.beginPath(); g.ellipse(M.x, floorY, rx, rx * .3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(224,72,60,${.6 * tentK})`; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(M.x, floorY, rx, rx * .3, 0, 0, Math.PI * 2); g.stroke();
  } else {
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(M.x, M.y + 30, 34, 10, 0, 0, Math.PI * 2); g.fill();
  }

  // 아지랑이 — 보랏빛에서 핏빛으로
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = (.3 + M.beat * .35) * (1 - sink * .6);
  const cr = Math.round(150 + 74 * red), cg2 = Math.round(60 + 12 * red), cb = Math.round(220 - 168 * red);
  const ag = g.createRadialGradient(ex, ey, 8, ex, ey, 74 + M.beat * 20);
  ag.addColorStop(0, `rgba(${cr},${cg2},${cb},.7)`); ag.addColorStop(1, `rgba(${cr},${cg2},${cb},0)`);
  g.fillStyle = ag; g.beginPath(); g.arc(ex, ey, 96, 0, Math.PI * 2); g.fill();
  g.restore();

  // 촉수 끝이 붙잡을 자리 (눈 테두리)
  const grabR = bare ? 24 : 34;
  const tip = i => {
    const a = EM_TENT[i][2] * Math.PI / 180 + Math.sin(G.t * .05 + i) * .08;
    return [ex + Math.cos(a) * grabR * sc, ey + Math.sin(a) * grabR * sc * .92];
  };
  const tent = (i) => {
    const [rx, ry] = EM_TENT[i];
    const x0 = M.x + rx, y0 = M.y + ry;
    const [x1, y1] = tip(i);
    const out = rx < 0 ? -1 : 1;
    const cx = (x0 + x1) / 2 + out * (14 + Math.sin(G.t * .09 + i * 1.7) * 7);
    const cy = Math.min(y0, y1) - 10 + Math.cos(G.t * .07 + i) * 6;
    const grow = clamp01g(tentK * 1.5 - i * .08);
    if (grow > 0) drawTentacle(x0, y0, cx, cy, x1, y1, grow);
  };

  // 뒤쪽 촉수
  g.save();
  g.beginPath(); g.rect(TS, TS, W - TS * 2, floorY - TS + 4); g.clip();     // 바닥 아래는 안 보입니다
  for (let i = 0; i < EM_TENT.length; i += 2) tent(i);

  // 눈 — 껍데기째, 또는 껍데기가 깨진 뒤의 맨 눈알
  g.save();
  g.translate(ex, ey); g.scale(sc, sc);
  const w = 96, h = 87;
  const im = tintedEye(w, h, '#7a0a10', red * .32 + M.beat * .18 + (bare ? .18 : 0));
  if (bare) {
    g.save();
    g.beginPath(); g.arc(-1, 0, 23, 0, Math.PI * 2); g.clip();
    if (im) g.drawImage(im, -w / 2, -h / 2, w, h);
    g.restore();
    g.strokeStyle = '#4a1016'; g.lineWidth = 2.5;            // 뜯겨 나간 살점 테두리
    g.beginPath(); g.arc(-1, 0, 23.5, 0, Math.PI * 2); g.stroke();
  } else if (im) {
    g.drawImage(im, -w / 2, -h / 2, w, h);
  }
  if (t < 36) {                                               // 마지막 일격의 하얀 번쩍임
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .7 * (1 - t / 36);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-1, 0, bare ? 23 : 38, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  // 흰자위의 균열 — 안쪽에서 무언가 밀고 나오는 빛
  if (crackK > 0) {
    g.save();
    g.beginPath(); g.arc(-1, 0, bare ? 23 : 30, 0, Math.PI * 2); g.clip();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = '#ff6a4a'; g.lineWidth = 1.4 + M.beat;
    g.globalAlpha = .55 + M.beat * .4;
    M.cracks.forEach(pts => {
      const n = Math.max(1, Math.round((pts.length - 1) * crackK));
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= n; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
    });
    g.restore();
  }
  // 안쪽에서 뚫고 나온 쇠갈고리
  EM_HOOKS.forEach((ht, i) => {
    if (t < ht) return;
    const sd = i === 0 ? -1 : 1, L = 26 * smooth01((t - ht) / 7);
    const bx = sd * (bare ? 20 : 28);
    g.fillStyle = '#5a3a2c';
    g.beginPath();
    g.moveTo(bx, -9); g.lineTo(bx + sd * L, -16 - L * .25); g.lineTo(bx + sd * L * .72, -3); g.lineTo(bx, 2);
    g.closePath(); g.fill();
    g.fillStyle = '#b07a52';
    g.beginPath(); g.moveTo(bx, -9); g.lineTo(bx + sd * L, -16 - L * .25); g.lineTo(bx + sd * L * .5, -9); g.closePath(); g.fill();
  });
  // 핏물이 흘러내립니다
  if (red > .4) {
    g.fillStyle = '#8f1c1c';
    [-9, 3, 12].forEach((dx, i) => {
      const len = ((G.t * .5 + i * 11) % 22) * (red - .3);
      g.fillRect(dx, (bare ? 20 : 26), 2, len | 0);
    });
  }
  g.restore();

  // 앞쪽 촉수
  for (let i = 1; i < EM_TENT.length; i += 2) tent(i);
  g.restore();

  // 깨진 껍데기 조각
  M.shards.forEach(s => {
    g.save();
    g.globalAlpha = Math.max(0, 1 - Math.max(0, s.life - 60) / 90);
    g.translate(s.x, s.y); g.rotate(s.rot);
    g.fillStyle = s.c;
    g.beginPath(); g.moveTo(-s.s, -s.s * .4); g.lineTo(s.s * .6, -s.s * .7); g.lineTo(s.s, s.s * .5); g.lineTo(-s.s * .3, s.s * .6);
    g.closePath(); g.fill();
    g.restore();
  });
  g.restore();
}

/* 타임어택 : 변신 컷신 없이 그 자리에서 바로 심연과 싸웁니다 */
function quickMorph(B) {
  glitchDeath(G.morphX, G.morphY, true);
  glare(1.2); G.shake = 26; G.flash = 1;
  shockRing(G.morphX, G.morphY, 380, '255,255,255', 9, 44);
  shockRing(G.morphX, G.morphY, 260, '194,53,44', 6, 36);
  Sfx.bossRoar();
  eatMedpack();
  makeAbom();
  G.mode = 'play';
  Sfx.bossBgm('boss3', true, false, true);    // 조용한 도입 11.4초는 건너뜁니다
}

/* ═══════════ 심연의 최후 ═══════════════════════════════
     0‥24    : 마지막 일격에 멈춤 — 하얗게 번쩍, 화면이 얼어붙음
     24‥230  : 발악 — 포효, 몸 곳곳이 글리치로 터지고 검붉은 체액이 튐
     160     : 왼팔의 녹슨 낫이 뜯겨 나가 바닥에 나뒹굶
     200     : 오른팔 집게가 축 늘어짐
     230‥304 : 무너짐 — 몸이 주저앉으며 빛이 꺼져 가고, 체액이 고임
     330     : 가슴의 눈이 꺼지는 마지막 폭발
     330‥470 : 정적 — 연기가 피어오르고, 한 번 경련
     470‥570 : 시체에서 마지막 열쇠가 떠올라 주인공에게 날아옴
   시체는 그대로 남습니다 — 방을 나갔다 와도 그 자리에 있습니다. */
const AD = { STILL: 24, ARM: 160, DROOP: 200, FALL: 230, LAND: 304, OUT: 330,
             TWITCH: 410, KEY: 470, KEYGO: 536, END: 590 };
const AD_DONE = 99999;          // 컷신이 끝난 뒤(또는 타임어택)의 "다 죽은" 시점

function makeCorpse(B) {
  return { x: B.x, y: B.y, pool: 0, twitch: 0 };
}

/* 뜯겨 나간 낫 팔의 궤적 — 관절에서 떨어져 왼쪽으로 나뒹굽니다 */
function corpseArm(C, t) {
  if (t < AD.ARM) return null;
  const k = clamp01g((t - AD.ARM) / 34);
  const x0 = C.x - 34, y0 = C.y - 24, x1 = C.x - 84, y1 = C.y + 22;
  let y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 22;
  const bt = t - AD.ARM - 34;
  if (bt > 0 && bt < 12) y -= Math.sin(bt / 12 * Math.PI) * 4;    // 한 번 튀고 멈춤
  return { x: x0 + (x1 - x0) * k, y, rot: -1.45 * smooth01(k) };
}

function corpsePose(C, t) {
  const po = { la: 0, ra: 0, lift: 0, lean: 2, sx: 1, sy: 1, noL: t >= AD.ARM };
  let drop = 0, sil = 0;
  if (t >= AD.STILL && t < AD.LAND) {                  // 발악
    const a = 1 - clamp01g((t - AD.STILL) / (AD.LAND - AD.STILL)) * .7, s = t * .9;
    po.la = (Math.sin(s) * 22 + Math.sin(s * 2.3) * 8) * a;
    po.ra = Math.sin(s * 1.3 + 1) * 24 * a;
    po.lift = Math.sin(s * .7) * 6 * a;
    po.lean = 2 + Math.sin(s * .45) * 7 * a;
    po.sx = 1 + Math.sin(s * 1.1) * .05 * a;
    po.sy = 1 + Math.sin(s * 1.1 + 1.6) * .06 * a;
  }
  if (t >= AD.DROOP) {                                 // 집게가 축 늘어짐
    const k = smooth01((t - AD.DROOP) / 30);
    po.ra += (-38 - po.ra) * k; po.lift += (-10 - po.lift) * k;
  }
  if (t >= AD.FALL) {                                  // 주저앉음
    const k = smooth01((t - AD.FALL) / (AD.LAND - AD.FALL));
    po.sy += (.58 - po.sy) * k; po.sx += (1.16 - po.sx) * k; po.lean += (7 - po.lean) * k;
    drop = 24 * k;
    sil = .62 * smooth01((t - AD.FALL) / 130);
    const bt = t - AD.LAND;
    if (bt >= 0 && bt < 12) po.sy -= .05 * Math.sin(bt / 12 * Math.PI);
  }
  if (C.twitch > 0) { po.ra += Math.sin(C.twitch * 2.2) * 9; po.lean += Math.sin(C.twitch * 1.7) * 1.5; }
  return { po, drop, sil };
}

function beginAbomDeath(B) {
  G.corpse = makeCorpse(B);
  G.deathT = 0;
  G.mode = 'abomdeath';
  $('prompt').classList.add('hidden');
  Sfx.bossBgmStopAll();
}

/* 몸 곳곳에서 터지는 글리치 — glitchDeath 와 같은 입자지만 화면 섬광은 없이 */
function corpseBurst(C, big) {
  const x = C.x + (Math.random() - .5) * 110, y = C.y - 30 + Math.random() * 60;
  G.fx.push({ k: 'glitch', x, y, life: 30, max: 30,
              chars: Array.from({ length: big ? 12 : 7 }, () => ({
                c: '01<>{}#%$&*'[(Math.random() * 11) | 0],
                dx: (Math.random() - .5) * 46, dy: (Math.random() - .5) * 46 })) });
  for (let i = 0; i < 6; i++)
    G.fx.push({ k: 'p', x, y, vx: (Math.random() - .5) * 3.4, vy: -1 - Math.random() * 2.4,
                life: 26, max: 26, c: i % 2 ? '#3a0a10' : '#8a2a30' });
}

function tickAbomDeath() {
  const t = ++G.deathT, C = G.corpse;
  tickFx();
  if (C.twitch > 0) C.twitch--;

  if (t === 1) {                                       // 마지막 일격
    Sfx.hit(); Sfx.glitch();
    glare(1.3); G.flash = 1; G.shake = 30;
    shockRing(C.x, C.y, 360, '255,255,255', 9, 40);
  }
  if (t === AD.STILL + 2) { Sfx.bossRoar(); shockRing(C.x, C.y, 260, '224,72,60', 6, 34); }
  if (t === 110) { Sfx.bossRoar(); G.shake = Math.max(G.shake, 18); }
  if (t > AD.STILL && t < AD.LAND) {
    G.shake = Math.max(G.shake, 4);
    if (t % 8 === 0) { corpseBurst(C, t % 24 === 0); if (t % 24 === 0) Sfx.glitch(); }
    if (t % 3 === 0)                                   // 검붉은 체액
      G.fx.push({ k: 'p', x: C.x + (Math.random() - .5) * 80, y: C.y - 10 + Math.random() * 40,
                  vx: (Math.random() - .5) * 2.6, vy: -1.5 - Math.random() * 2,
                  life: 30, max: 30, c: '#5a0e14' });
  }
  if (t === AD.ARM) {                                  // 낫 팔이 뜯겨 나감
    Sfx.hit(); Sfx.door(); G.shake = Math.max(G.shake, 18);
    for (let i = 0; i < 14; i++)
      G.fx.push({ k: 'p', x: C.x - 34, y: C.y - 24, vx: (Math.random() - .8) * 4,
                  vy: (Math.random() - .5) * 4, life: 22, max: 22, c: i % 2 ? '#ffb27a' : '#8a2a30' });
  }
  if (t === AD.ARM + 34) {                             // 바닥에 떨어짐
    Sfx.hit(); G.shake = Math.max(G.shake, 10);
    for (let i = 0; i < 10; i++)
      G.fx.push({ k: 'p', x: C.x - 84, y: C.y + 30, vx: (Math.random() - .5) * 3,
                  vy: -.6 - Math.random() * 1.6, life: 22, max: 22, c: '#6b5a4a' });
  }
  if (t === AD.DROOP) Sfx.landThump(.3);
  if (t === AD.FALL + 8) Sfx.breath();
  if (t >= AD.FALL) C.pool = Math.min(1, C.pool + .011);
  if (t === AD.LAND) {                                 // 쿵 — 바닥에 무너짐
    Sfx.landThump(.75); G.shake = 26;
    shockRing(C.x, C.y + 40, 220, '140,60,50', 5, 32);
    for (let i = 0; i < 22; i++)
      G.fx.push({ k: 'p', x: C.x + (Math.random() - .5) * 130, y: C.y + 42,
                  vx: (Math.random() - .5) * 3, vy: -.8 - Math.random() * 1.8,
                  life: 28, max: 28, c: '#6b5a4a' });
  }
  if (t === AD.OUT) {                                  // 가슴의 눈이 꺼짐
    glitchDeath(C.x, C.y - 4, true);
    glare(1.2); G.flash = 1; G.shake = 30;
    shockRing(C.x, C.y, 420, '255,255,255', 10, 48);
    shockRing(C.x, C.y, 300, '224,72,60', 7, 40);
  }
  if (t === AD.TWITCH) { C.twitch = 16; Sfx.creepType(); }
  if (t === AD.KEY) Sfx.reveal();
  if (t === AD.KEYGO + 26) {                           // 열쇠를 손에 넣음
    G.finalKey = true; updateHud(); Sfx.keyGet(); bumpKeys('gatekeys');
    shockRing(P.x, P.y, 110, '227,178,60', 4, 24);
  }
  if (t >= AD.END) {
    G.deathT = AD_DONE;
    G.mode = 'play';
    say(BOSS_DEAD_LINES);
  }
}

/* 떨어져 나간 낫 팔 한 조각 — 관절이 (x, y) 에 오도록 그립니다 */
function abomArmPiece(x, y, rot, sil) {
  const w = ABOM_W, h = ABOM_H;
  const im = sil > .01 ? tintedAbom(w, h, '#1a0608', sil) : IMG.abom;
  if (!im) return;
  const sx = v => -w / 2 + v * (w / 168), sy = v => -h / 2 + v * (h / 113);
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.translate(-sx(AB_L.px), -sy(AB_L.py));
  g.beginPath(); g.rect(sx(0), sy(0), sx(AB_L.draw) - sx(0), sy(AB_L.bot) - sy(0)); g.clip();
  g.drawImage(im, -w / 2, -h / 2, w, h);
  g.restore();
}

function drawCorpse() {
  const C = G.corpse;
  if (!C) return;
  const t = G.deathT;
  const { po, drop, sil } = corpsePose(C, t);
  const y = C.y + drop;

  // 검붉은 체액 웅덩이
  if (C.pool > 0) {
    g.save();
    g.globalAlpha = .9;
    g.fillStyle = '#24060a';
    g.beginPath(); g.ellipse(C.x - 6, C.y + 42, 82 * C.pool, 17 * C.pool, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(120,24,30,.45)';
    g.beginPath(); g.ellipse(C.x - 14, C.y + 40, 44 * C.pool, 7 * C.pool, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.save();
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.beginPath(); g.ellipse(C.x, C.y + 44, 56, 13, 0, 0, Math.PI * 2); g.fill();
  g.restore();

  const arm = corpseArm(C, t);
  if (arm) abomArmPiece(arm.x, arm.y, arm.rot, sil * .55);   // 녹슨 날이 바닥에서 보이도록 몸보다 덜 어둡게

  const tint = t < AD.STILL ? ['#ffffff', .85 * (1 - t / AD.STILL)] : null;
  abomBody(C.x, y, 1, sil, 1, po, tint);

  // 가슴의 눈 — 깜빡이며 꺼져 갑니다
  if (t < AD.OUT) {
    const fade = t < AD.FALL ? 1 : 1 - (t - AD.FALL) / (AD.OUT - AD.FALL);
    const a = fade * (.45 + Math.random() * .55);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a;
    const ey = y - 8 * po.sy;
    const eg = g.createRadialGradient(C.x, ey, 1, C.x, ey, 34);
    eg.addColorStop(0, 'rgba(255,236,230,.95)'); eg.addColorStop(.35, 'rgba(232,60,52,.7)'); eg.addColorStop(1, 'rgba(232,60,52,0)');
    g.fillStyle = eg; g.beginPath(); g.arc(C.x, ey, 34, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // 식어 가는 몸에서 피어오르는 연기
  const smoke = t < AD.FALL ? 0 : t >= AD_DONE ? .45 : clamp01g((t - AD.FALL) / 80);
  if (smoke > 0) {
    g.save();
    for (let i = 0; i < 7; i++) {
      const ph = (G.t * .006 + i * .143) % 1;
      const sx = C.x - 50 + i * 16 + Math.sin(G.t * .02 + i) * 5;
      g.globalAlpha = (1 - ph) * .22 * smoke;
      g.fillStyle = '#8a8288';
      g.beginPath(); g.arc(sx, C.y + 10 - ph * 64, 3 + ph * 7, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  // 시체에서 떠오르는 마지막 열쇠
  if (t >= AD.KEY && t < AD.KEYGO + 26) {
    let kx = C.x, ky;
    if (t < AD.KEYGO) ky = y - 6 - smooth01((t - AD.KEY) / 50) * 34 + Math.sin(G.t * .12) * 2;
    else {
      const k = smooth01((t - AD.KEYGO) / 26);
      const sy0 = y - 40;
      kx = C.x + (P.x - C.x) * k; ky = sy0 + (P.y - 8 - sy0) * k - Math.sin(k * Math.PI) * 26;
    }
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .6 + Math.sin(G.t * .2) * .2;
    const kg = g.createRadialGradient(kx, ky, 1, kx, ky, 36);
    kg.addColorStop(0, 'rgba(255,236,170,.9)'); kg.addColorStop(1, 'rgba(227,178,60,0)');
    g.fillStyle = kg; g.beginPath(); g.arc(kx, ky, 36, 0, Math.PI * 2); g.fill();
    g.restore();
    drawKey(kx, ky);
  }
}

/* 타임어택 : 컷신 없이 그 자리에 시체가 남고 열쇠가 바로 손에 들어옵니다 */
function quickAbomDeath(B) {
  G.corpse = makeCorpse(B);
  G.corpse.pool = 1;
  G.deathT = AD_DONE;
  glitchDeath(B.x, B.y, true);
  glare(1.2); G.shake = 26;
  shockRing(B.x, B.y, 380, '255,255,255', 9, 44);
  shockRing(B.x, B.y, 260, '224,72,60', 6, 36);
  Sfx.bossBgmStopAll();
  G.finalKey = true; updateHud(); Sfx.keyGet(); bumpKeys('gatekeys');
}

function drawAbomLight() {
  const B = G.boss;
  const pulse = .5 + Math.sin(G.t * .08) * .5;
  const wind = B.act ? Math.min(1, B.actT / abomWind(B.act)) : 0;
  const col = B.stage === 2 ? '236,60,44' : '198,58,58';
  g.save();
  g.beginPath(); g.rect(TS, TS, W - TS * 2, H - TS * 2); g.clip();
  g.globalCompositeOperation = 'lighter';

  g.globalAlpha = .18 + pulse * .1 + wind * .22;
  const lg = g.createRadialGradient(B.x, B.y, 10, B.x, B.y, 200);
  lg.addColorStop(0, `rgba(${col},.9)`);
  lg.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = lg; g.fillRect(0, 0, W, H);

  const rays = B.stage === 2 ? 10 : 8;
  const boost = B.rayT > 0 ? B.rayT / 110 : 0;
  for (let i = 0; i < rays; i++) {
    const a = G.t * .009 + (i / rays) * Math.PI * 2;
    // 빛줄기는 어디까지나 분위기 — 몸통보다 눈에 띄면 탄이 안 보입니다
    g.globalAlpha = .035 + pulse * .035 + wind * .08 + boost * .12;
    g.strokeStyle = `rgb(${col})`;
    g.lineWidth = 2.5 + wind * 7 + boost * 4;
    g.beginPath(); g.moveTo(B.x, B.y);
    g.lineTo(B.x + Math.cos(a) * 250, B.y + Math.sin(a) * 250);
    g.stroke();
  }
  g.restore();
}

function drawAbom() {
  const B = G.boss;
  const A = B.act ? ABOM_ACT[B.act] : null;
  const wind = A ? Math.min(1, B.actT / abomWind(B.act)) : 0;
  const sc = 1 + Math.sin(B.bob) * .03 + wind * .07;
  const y = B.y - (B.rise || 0);

  // 그림자 — 들어 올릴수록 작고 진해집니다
  g.save();
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.beginPath();
  g.ellipse(B.x, B.y + 44, 52 - (B.rise || 0) * .9, 13, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // 몸을 감싼 핏빛 아지랑이
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .22 + wind * .4;
  const ag = g.createRadialGradient(B.x, y, 14, B.x, y, 92 + wind * 28);
  ag.addColorStop(0, 'rgba(224,72,60,.6)');
  ag.addColorStop(1, 'rgba(224,72,60,0)');
  g.fillStyle = ag;
  g.beginPath(); g.arc(B.x, y, 92 + wind * 28, 0, Math.PI * 2); g.fill();
  g.restore();

  // 예고 고리 · 내리찍기 표시 · 촉수 — 도트 겹(pixfx.js)으로: 점선 · 고리가 벡터처럼 매끈하게 뜨지 않게
  const gA = g; if (window.PixFX) g = PixFX.layerBegin(gA);
  /* 모든 행동 공통 — 예비 동작 동안 몸 주위로 고리가 조여듭니다.
     "지금 뭔가 나온다, 이만큼 남았다"를 한눈에 보여 주는 신호입니다. */
  if (A && B.actT <= abomWind(B.act)) {
    const k = B.actT / abomWind(B.act);
    g.save();
    g.globalAlpha = .25 + k * .45;
    g.strokeStyle = A.c; g.lineWidth = 1.5 + k * 2;
    g.setLineDash([6, 5]); g.lineDashOffset = -G.t * .6;
    g.beginPath(); g.arc(B.x, y, 108 - k * 46, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.restore();
  }

  /* 내리찍기 — 어디에 떨어지는지를 바닥에 그려 줍니다.
     확정 전(점선·따라다님) → 확정 후(굵은 고리가 조여들며 그림자가 커짐). */
  if (B.act === 'claw' && B.actT <= abomWind('claw') + 16) {
    const t = B.actT, w = abomWind('claw');
    const locked = t >= abomLock();
    g.save();
    /* 표시하는 원은 실제 판정(반지름 62)과 정확히 같은 크기입니다 —
       "여기까지가 위험" 이 눈에 보이는 대로여야 피할 수 있습니다. */
    const R = 62;
    if (!locked) {
      // 아직 따라다니는 조준선
      g.globalAlpha = .3 + (t / abomLock()) * .3;
      g.strokeStyle = '#ff8a6a'; g.lineWidth = 1.4;
      g.setLineDash([4, 4]); g.lineDashOffset = -G.t * .8;
      g.beginPath(); g.arc(B.tx, B.ty, R, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(B.x, y); g.lineTo(B.tx, B.ty); g.stroke();
      g.setLineDash([]);
    } else {
      // 확정 — 떨어질 자리에 그림자가 점점 커지고, 고리가 한가운데로 조여듭니다
      const k = Math.min(1, (t - abomLock()) / (w - abomLock()));
      g.globalAlpha = .16 + k * .26;
      g.fillStyle = '#000';
      g.beginPath(); g.arc(B.tx, B.ty, 22 + k * (R - 22), 0, Math.PI * 2); g.fill();

      g.globalAlpha = .85;
      g.strokeStyle = '#ff7a52'; g.lineWidth = 2.4;
      g.beginPath(); g.arc(B.tx, B.ty, R, 0, Math.PI * 2); g.stroke();
      // 조여드는 고리 — 이게 한가운데 닿는 순간 떨어집니다
      g.globalAlpha = .95;
      g.strokeStyle = '#ffe0c8'; g.lineWidth = 2;
      g.beginPath(); g.arc(B.tx, B.ty, R * (1 - k) + 5, 0, Math.PI * 2); g.stroke();
      // 네 귀퉁이 조준 표시
      g.globalAlpha = .8; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const ax = i < 2 ? -1 : 1, ay = i % 2 ? 1 : -1;
        g.beginPath();
        g.moveTo(B.tx + ax * R, B.ty + ay * R * .42);
        g.lineTo(B.tx + ax * R, B.ty + ay * R);
        g.lineTo(B.tx + ax * R * .42, B.ty + ay * R);
        g.stroke();
      }
    }
    g.restore();
  }

  // 촉수 채찍 — 예비 동작 때는 가는 예고선, 칠 때는 굵은 촉수
  if (B.act === 'lash') {
    g.save();
    if (B.actT <= abomWind('lash')) {
      g.globalAlpha = .3 + wind * .5;
      g.strokeStyle = '#e07fb0'; g.lineWidth = 1.5;
      g.setLineDash([5, 5]);
      for (const a of B.lash) {
        g.beginPath(); g.moveTo(B.x, y);
        g.lineTo(B.x + Math.cos(a) * B.reach, y + Math.sin(a) * B.reach);
        g.stroke();
      }
      g.setLineDash([]);
    } else if (B.lashLen > 1) {
      for (const a of B.lash) {
        const ex = B.x + Math.cos(a) * B.lashLen, ey = y + Math.sin(a) * B.lashLen;
        g.strokeStyle = '#7d3346'; g.lineWidth = 9; g.lineCap = 'round';
        g.beginPath(); g.moveTo(B.x, y);
        g.quadraticCurveTo(B.x + Math.cos(a + .4) * B.lashLen * .55,
                           y + Math.sin(a + .4) * B.lashLen * .55, ex, ey);
        g.stroke();
        g.strokeStyle = '#b8596d'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(B.x, y);
        g.quadraticCurveTo(B.x + Math.cos(a + .4) * B.lashLen * .55,
                           y + Math.sin(a + .4) * B.lashLen * .55, ex, ey);
        g.stroke();
        g.fillStyle = '#e8a0b4';
        g.beginPath(); g.arc(ex, ey, 4, 0, 6.3); g.fill();
      }
      g.lineCap = 'butt';
    }
    g.restore();
  }
  g = gA;

  const po = abomPose(B);
  // 몸 — 도트 그림 한 장으로 정리해 찍음 (pixfx.js: 돌아간 팔의 계단 가장자리 · 1px 외곽선 · 위 빛 아래 그늘).
  // 피격 깜빡임은 같은 자세 그대로 흰 실루엣
  if (window.PixFX) {
    const bw = Math.ceil(ABOM_W * sc * 1.9) + 24, bh = Math.ceil(ABOM_H * sc * 2.1) + 24;
    const fl = B.flash > 0 ? ((G.t >> 1) % 2 ? .75 : .25) : 0;
    PixFX.sprite(g, B.x, y, bw, bh, bw / 2, bh / 2, c => { const gg = g; g = c; try { abomBody(0, 0, sc, 0, 1, po); } finally { g = gg; } },
                 { outline: '#080306', hi: .14, lo: .2, flash: fl });
  } else {
    abomBody(B.x, y, sc, 0, 1, po);
    // 피격 깜빡임 — 몸통과 같은 자세로 겹쳐야 팔이 따로 놀지 않습니다
    if (B.flash > 0 && (G.t >> 1) % 2) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      abomBody(B.x, y, sc, 0, .55, po, ['#ffffff', .8]);
      g.restore();
    }
  }

  // 왼팔의 녹슨 낫 — 예비 동작 때는 궤적 예고, 칠 때는 실제 날 (도트 겹으로)
  if (B.act === 'blade') {
    const gB = g; if (window.PixFX) g = PixFX.layerBegin(gB);
    g.save();
    const R0 = 42, R1 = 132;
    if (B.actT <= abomWind('blade')) {
      g.globalAlpha = .12 + wind * .3;
      g.fillStyle = '#ffb27a';
      g.beginPath();
      g.arc(B.x, y, R1, B.bladeFrom, B.bladeFrom + B.dir * Math.PI * 1.62, B.dir < 0);
      g.arc(B.x, y, R0, B.bladeFrom + B.dir * Math.PI * 1.62, B.bladeFrom, B.dir > 0);
      g.closePath(); g.fill();
    } else {
      const a = B.bladeA;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = .55;
      g.strokeStyle = '#ffd2a8'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath();
      g.arc(B.x, y, 96, a - B.dir * .55, a, B.dir < 0);
      g.stroke();
      g.globalAlpha = .95; g.lineWidth = 3;
      g.strokeStyle = '#fff1e0';
      g.beginPath();
      g.moveTo(B.x + Math.cos(a) * R0, y + Math.sin(a) * R0);
      g.lineTo(B.x + Math.cos(a) * R1, y + Math.sin(a) * R1);
      g.stroke();
      g.lineCap = 'butt';
    }
    g.restore();
    g = gB;
  }

  // 아래쪽 아가리 — 비명 직전에 벌겋게 달아오릅니다
  if (B.act === 'scream') {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .25 + wind * .6;
    const mg = g.createRadialGradient(B.x + 16, y + 26, 2, B.x + 16, y + 26, 26);
    mg.addColorStop(0, 'rgba(255,240,220,.9)');
    mg.addColorStop(1, 'rgba(255,90,70,0)');
    g.fillStyle = mg;
    g.beginPath(); g.arc(B.x + 16, y + 26, 26, 0, 6.3); g.fill();
    g.restore();
  }

  // 체력 막대 — 2단계로 넘어가면 눈금이 하나 더 붙습니다
  const bw = 250, bx = camX() + (VW - bw) / 2, by = camY() + VH + OY - 18;   // 화면 아래 가운데 (늘어난 띠까지 내려서)
  g.save();
  g.fillStyle = 'rgba(8,8,14,.78)'; g.fillRect(bx - 2, by - 2, bw + 4, 9);
  g.fillStyle = '#2c1214'; g.fillRect(bx, by, bw, 5);
  const hk = Math.max(0, B.hp / B.max);
  g.fillStyle = B.stage === 2 ? '#e8483a' : '#a8262c';
  g.fillRect(bx, by, bw * hk, 5);
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.fillRect(bx + bw * .5, by - 1, 1, 7);
  drawSaekdong(g, bx, by - 4, bw, 2, false, .55);
  g.font = 'bold 9px DungGeunMo, ui-monospace, monospace';
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#c2352c';
  g.fillText('심연', bx, by - 6);
  g.restore();
}

/* ── 추락 ──────────────────────────────────────────── */
/* 우물 추락 연출 — 화면 중앙으로 빨려 들어가는 소용돌이 우물 통로.
   지상 배경(renderForest)이 이미 그려진 위에, 안쪽으로 좁아지는 돌벽
   고리들 + 회전하는 잔상 줄무늬 + 점점 작아지며 구르는 주인공을 겹칩니다.
   예전(168프레임)보다 살짝 느리게 떨어지도록 늘렸습니다.

   소용돌이가 끝나면 세 단계를 거쳐 던전으로 넘어갑니다 —
   ① landing : 완전한 암전. 울림과 흙먼지, 바닥에 닿는 둔탁한 충격음.
   ② wakeup  : **1인칭** — 우물 바닥에 누운 채 올려다본 천장. 눈을 몇 번
                껌뻑이며 초점이 잡혀 갑니다. 반쯤 감겼을 땐 흐릿합니다.
                다 뜨고 나면, 자신이 떨어진 저 위 입구를 한참 올려다보며
                누워 있습니다 — 숨을 고르는 동안 먼지가 계속 떨어지고,
                자연스러운 깜빡임이 한두 번 더 스칩니다.
   ③ 전환    : 눈을 완전히 뜨는 순간 탑뷰로 확 바뀌면서, 섬광 · 충격파와
                함께 브금의 "두둥"이 크게 터집니다. */
const FALL_DUR   = 300;   // 소용돌이 낙하 (5.0초)
const LAND_BLACK = 66;    // 착지 직후 완전 암전 (1.1초)
const EYE_OPEN_T = 236;   // 여기까지가 "눈을 뜨는" 애니메이션
const GAZE_HOLD  = 210;   // 다 뜬 채로 저 위 입구를 올려다보는 시간 (3.5초)
const WAKE_EYE   = EYE_OPEN_T + GAZE_HOLD;   // 전체 1인칭 구간 (약 7.4초)
const WAKE_DUR   = 66;    // 탑뷰로 바뀐 뒤 암전이 걷히는 구간

/* 눈꺼풀이 열린 정도 (0 = 감김, 1 = 완전히 뜸).
   떴다 감았다를 네 번 반복하며 점점 크게, 점점 오래 뜹니다.
   중간에 한 번은 거의 다 떴다가 도로 감겨서, 정신을 붙잡으려다
   놓치는 느낌을 냅니다. 다 뜬 뒤로도 한참을 그대로 응시하다가,
   자연스러운 깜빡임 두 번이 스치듯 지나갑니다. */
const EYE_KEYS = [
  [0, 0], [26, 0],
  [40, .17], [56, .02],          // ① 실눈
  [78, .03],
  [96, .44], [112, .06],         // ② 조금 더
  [132, .08],
  [152, .78], [168, .30],        // ③ 거의 떴다가 도로 감김
  [182, .22],
  [206, .95], [218, .70],        // ④ 크게
  [EYE_OPEN_T, 1],
  [EYE_OPEN_T + 90,  1], [EYE_OPEN_T + 100, .08], [EYE_OPEN_T + 112, 1],   // 자연스러운 깜빡임 1
  [EYE_OPEN_T + 160, 1], [EYE_OPEN_T + 168, .12], [EYE_OPEN_T + 178, 1],   // 자연스러운 깜빡임 2
  [WAKE_EYE, 1]
];
/* 눈꺼풀 소리를 낼 자리 — EYE_KEYS 에서 크게 오르는(뜨는) · 내리는(감기는) 구간의 시작 */
const EYE_SFX = (() => {
  const out = [];
  for (let i = 1; i < EYE_KEYS.length; i++) {
    const [t0, v0] = EYE_KEYS[i - 1], [t1, v1] = EYE_KEYS[i], dv = v1 - v0;
    if (Math.abs(dv) < .1) continue;
    out.push({ t: Math.max(1, t0), open: dv > 0, amp: Math.min(1, Math.abs(dv)), dur: (t1 - t0) / 60 });
  }
  return out;
})();
function eyeOpen(t) {
  for (let i = 1; i < EYE_KEYS.length; i++) {
    const [t0, v0] = EYE_KEYS[i - 1], [t1, v1] = EYE_KEYS[i];
    if (t <= t1) {
      const k = Math.max(0, (t - t0) / Math.max(1, t1 - t0));
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k));   // smoothstep
    }
  }
  return 1;
}

/* 착지 직후 — 아무것도 보이지 않는 암전. 울림과 흙먼지만 남습니다.
   마지막 몇 프레임에는 가운데가 갈라지듯 빛이 새어 나오며 "두둥" 을
   예고합니다. */
function renderLanding() {
  const t = G.landT, k = Math.min(1, t / LAND_BLACK);
  g.save();
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);

  // 어둠 속에서 스쳐 내리는 흙먼지 (아주 희미하게만)
  g.globalAlpha = .30;
  g.fillStyle = '#6b6256';
  G.fx.forEach(f => {
    if (f.k !== 'dust') return;
    g.globalAlpha = .10 + (f.life / f.max) * .22;
    g.fillRect(f.x, f.y, 1, 2 + f.vy);
  });
  g.globalAlpha = 1;

  // 심장이 뛰듯 아주 어둡게 번지는 붉은 기운
  const beat = Math.max(0, Math.sin(t * .16)) * k;
  if (beat > .02) {
    const bg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 230);
    bg.addColorStop(0, `rgba(90,20,18,${beat * .22})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
  }

  // 마지막 10프레임 — 가운데가 갈라지며 빛이 샙니다
  const left = LAND_BLACK - t;
  if (left <= 10) {
    const s = (10 - left) / 10;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = s * .8;
    const cg = g.createLinearGradient(0, H / 2 - 2, 0, H / 2 + 2);
    cg.addColorStop(0, 'rgba(255,228,170,0)');
    cg.addColorStop(.5, 'rgba(255,228,170,.9)');
    cg.addColorStop(1, 'rgba(255,228,170,0)');
    g.fillStyle = cg;
    g.fillRect(W / 2 - (10 + s * 220) / 2, H / 2 - 2, 10 + s * 220, 4);
  }
  g.restore();
}

/* 1인칭 — 우물 바닥에 누운 채 올려다본 천장.
   저 위로 우물 입구가 작게 뚫려 있고, 그 빛이 먼지 사이로 내려옵니다.
   눈이 덜 떠졌을 때는 초점이 안 맞아 흐릿하게 번집니다. */
/* ═══════════ 오프닝 — 1인칭으로 시작합니다 ═══════════════════
   엔딩(실험실에서 깨어남)과 짝을 이루는 첫 장면입니다. 무엇인지 말해
   주지는 않습니다 — 엔딩을 보고 나서야 무엇이었는지 알게 됩니다.

     LAB   (기준 0‥1570, 실제는 opT 로 늘림) : 잠드는 쪽. 흐릿한 흰 천장과 격자 조명. 귀에 들어오는 건
                    대화의 조각들뿐입니다 — 가까운 목소리(의사), 먼 목소리
                    (조수), 짧고 차가운 지시 하나. 펜라이트가 눈을 훑고,
                    "141번째" (엔딩의 SESSION 141).
       ▸ 각성 552‥694 : 피험자가 깨려 합니다 — 눈이 번쩍 뜨이고 초점이 잡히며
                    경보가 울리고 화면이 붉게 맥박칩니다. 의사가 바짝 들여다보고
                    "용량 올려" — 약이 들어가며 차가운 푸른 물결이 아래서부터
                    시야를 덮고 눈꺼풀이 무너집니다.
                    마지막엔 우물 이야기를 들려줍니다 —
                    숲에서 "우물이 있다고 들었다"는 생각이 여기서 옵니다.
       ▸ 하강 1190‥1556 : 숫자를 거꾸로 세는 동안 천장이 멀어지며 돌로 쌓은
                    통로가 시야를 둘러쌉니다 — 병실 천장이 우물 입구가 됩니다.
                    "7…" 에서 바닥이 꺼지듯 한 번 툭 떨어지고 눈이 감깁니다.
     DARK 1570‥1690 : 정적. 심장 한 번. 새소리가 번져 옵니다.
     WOOD 1690‥1920 : 숲에서 눈을 뜸 — 나뭇가지 사이 해 질 녘 하늘.
                    첫 깜빡임에 천장 격자가 하늘 위로 한 프레임 겹칩니다.
       ▸ 지켜보는 이 : 두 번째 깜빡임 사이, 가지 틈에 방호복 후드(새까만 얼굴창)가 내려다봅니다.
                    다시 눈을 뜨면 없고 — 새들이 그 자리에서 날아오릅니다.
     (대사)        : "…언제 잠들었지." 외 두 줄 — 이동 중엔 시계가 멈춥니다
     RISE 1920‥2000: 몸을 일으킴 — 시야가 아래로 쏠리며 흐려지고 암전
     → 탑뷰 숲. 조리개가 열리듯 화면이 드러나고 조작 안내.
   타임어택은 이 장면 전체를 건너뜁니다. */
/* 이야기의 빠르기 — 숫자 세기 전의 대화는 OP_SLOW 배로 늘려 들려줍니다.
   아래 표들은 "기준 시간"으로 적고, opT() 로 실제 프레임에 옮깁니다.
   (대화 구간은 배로 늘고, 그 뒤는 늘어난 만큼 통째로 밀립니다) */
const OP_SLOW = 2, OP_STORY_END = 1190;
const opT = t => t < OP_STORY_END ? t * OP_SLOW : t + OP_STORY_END * (OP_SLOW - 1);
const OP = { LAB: opT(1570), DARK: opT(1690), LINES: opT(1920), END: opT(2000),
             CR0: opT(552), CR1: opT(694),                   // 각성 위기 — 눈이 번쩍 뜨이고 약이 들어갈 때까지
             SINK0: opT(1190), SINK1: opT(1556), DROP: opT(1522) };   // 우물 아래로 가라앉음 · 툭 떨어짐
const OP_EYE = [
  [0, 0], [30, .58], [90, .62], [118, .14], [140, .55],
  [200, .5], [212, .62], [220, .16], [244, .46],                 // 펜라이트에 움찔
  [300, .52], [400, .48], [420, .12], [440, .5], [530, .44], [548, .4],
  [562, .94], [598, .88], [610, .97], [640, .9], [690, .88],    // 각성 — 번쩍 뜨임
  [700, .8], [712, .5], [720, .08], [734, .16], [750, .32],     // "용량 올려" — 푸른 물결이 차오른 뒤 무너짐
  [830, .28], [850, .08], [870, .3], [950, .26], [975, .06], [1000, .24],
  [1080, .22], [1100, .05], [1120, .2],
  // 숫자 하나에 한 번씩, 점점 무겁게 감겼다가 덜 뜹니다
  // 가라앉는 통로가 보이도록 반쯤은 떠 있고, "7…" 에서 툭 떨어질 때 번쩍 뜨였다 감깁니다
  [1200, .44], [1260, .4], [1282, .1], [1300, .38], [1350, .36], [1366, .08], [1385, .32],
  [1430, .3], [1450, .06], [1470, .28], [1518, .24], [1526, .62], [1538, .4], [1556, 0], [1690, 0],
  [1720, .22], [1736, .03], [1768, .52], [1788, .14], [1820, .86], [1836, .58], [1880, 1], [2000, 1]
].map(([t, v]) => [opT(t), v]);
/* [시작, 끝, 대사, 목소리] — near : 가까이서 말 거는 목소리
                               far  : 저쪽에서 들리는 조수의 목소리 (작고 흐리게)
                               cold : 짧은 지시 하나 */
const OP_TEXT = [
  [40, 140, '…들리세요?', 'near'],
  [200, 290, '반응 있어요. 동공이 느리고.', 'far'],
  [300, 400, '괜찮아요. 오늘도 금방 끝나요.', 'near'],
  [420, 530, '…141번째예요. 기억 안 나시겠지만.', 'near'],
  [552, 606, '수치 튀어요 — 깨려고 해요!', 'urgent'],
  [596, 640, '쉬이… 괜찮아요. 괜찮아요.', 'near'],
  [646, 692, '용량 올려.', 'cold'],
  [720, 830, '자, 오늘은 우물 이야기를 해 드릴게요.', 'near'],
  [840, 950, '숲 끝에, 오래된 우물이 하나 있어요.', 'near'],
  [960, 1060, '그 아래로… 천천히 내려가 보는 거예요.', 'near'],
  [1080, 1180, '숫자를 거꾸로 세어 보세요.', 'near'],
  // 숫자는 하나에 약 1.4초 — 천천히, 점점 멀어지게
  [1200, 1284, '10.', 'near'], [1284, 1368, '9.', 'near'], [1368, 1452, '8.', 'near'], [1452, 1552, '7…', 'near']
].map(([a, b, s, who]) => [opT(a), opT(b), s, who]);
/* 모니터 비프 — 평소엔 고르게, "용량 올려" 뒤로 느려지고, 셀 때는 점점 벌어집니다 */
const OP_BEEPS = (() => {
  const b = [];
  // 심박은 이야기 빠르기와 상관없이 그대로 — 실제 프레임으로 찍습니다
  for (let t = 20; t < opT(1150); t += t < opT(700) ? 64 : 82) if (t < OP.CR0 || t > OP.CR1 + 20) b.push(t);
  for (let t = OP.CR0; t < OP.CR1; t += 18) b.push(t);            // 각성 — 맥이 치솟습니다
  return b.concat([1220, 1312, 1414, 1526].map(opT));
})();

function opEye(t) {
  for (let i = 1; i < OP_EYE.length; i++) {
    const [t0, v0] = OP_EYE[i - 1], [t1, v1] = OP_EYE[i];
    if (t <= t1) {
      const k = Math.max(0, (t - t0) / Math.max(1, t1 - t0));
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k));
    }
  }
  return 1;
}

function beginOpening() {
  G.opening = {
    t: 0,
    // 나뭇잎 덩어리 — 화면 가장자리를 둘러싸고, 덩어리마다 작은 잎 뭉치 여러 개
    clumps: Array.from({ length: 30 }, (_, i) => {
      const a = i / 30 * Math.PI * 2 + Math.random() * .2, d = .62 + Math.random() * .38;
      return { a, d, p: Math.random() * 6.28,
               bits: Array.from({ length: 8 }, () => ({ dx: (Math.random() - .5) * 46, dy: (Math.random() - .5) * 30,
                                                        r: 6 + Math.random() * 11 })) };
    }),
    // 줄기 — [바닥 쪽 x, y (화면 비율), 굵기, 휘는 정도]
    trunks: [[.02, 1.08, 16, .08], [.24, 1.12, 11, -.05], [.8, 1.1, 13, .06], [1.0, .95, 15, -.08], [.96, -.08, 9, .05]]
  };
  G.mode = 'opening';
  $('hud').classList.add('hidden');
  Sfx.ambientStop();
}

/* 오프닝 — 길게 눌러(약 1초) 건너뛰기. 누르기 시작하면 오른쪽 아래에 고리가 차오릅니다 */
const OP_SKIP_T = 60;
function finishOpening() {
  G.opening = null;
  op3dDispose();
  G.mode = 'forest';
  $('hud').classList.remove('hidden');
  G.wake = WAKE_DUR;                    // 조리개가 열리듯 숲이 드러납니다
  say(FOREST_HINT);
}
function tickOpening() {
  const O = G.opening, t = ++O.t;
  if (skipHeld()) { O.skip = (O.skip || 0) + 1; O.skipShow = 120; }
  else { O.skip = Math.max(0, (O.skip || 0) - 3); O.skipShow = Math.max(0, (O.skipShow || 0) - 1); }
  if (O.skip >= OP_SKIP_T && t > 30) { Sfx.ambient('forest'); finishOpening(); return; }
  O.shake = Math.max(0, (O.shake || 0) * .9 - .05);
  // 글리치 — 큰 것은 소리와 함께, 그 사이사이 한두 프레임짜리 잔글리치 (어둠 속에선 없음)
  for (const [a, d, k] of OP_GLITCH_ALL) if (t === a) { Sfx.static(d / 60 + .05, .5 + k * .45); if (k >= 1.4) O.shake = Math.max(O.shake, 8); }
  O.micro = Math.max(0, (O.micro || 0) - 1);
  const lit = (t < OP.LAB) || t > OP.DARK + 20;
  if (lit && !O.micro && Math.random() < 1 / 60) {
    O.micro = 1 + Math.floor(Math.random() * 3);
    O.microKind = ['tear', 'tear rgb', 'pix', 'inv', 'block rgb'][Math.floor(Math.random() * 5)];
    if (Math.random() < .5) Sfx.static(O.micro / 60 + .03, .35);
  }
  if (OP_BEEPS.includes(t)) Sfx.beep(t < opT(1200) ? (t >= OP.CR0 && t < OP.CR1 ? .06 : .045) : .035 - (t - opT(1200)) / 20000);   // 셀수록 멀어지는 비프
  if (t === opT(206) + 6) Sfx.beep(.02);                                   // 펜라이트 딸깍
  // 각성 — 눈이 번쩍, 경보, 흔들림
  if (t === OP.CR0 + 18) { Sfx.breath(); O.shake = 5; }
  if (t > OP.CR0 && t < OP.CR1 - 30 && (t - OP.CR0) % 52 === 8) Sfx.alarm();
  if (t === opT(646)) Sfx.reveal();                                       // "용량 올려."
  if (t === OP.CR1 - 8) { Sfx.inject(); O.shake = 9; }                     // 약이 들어갑니다
  if (t === OP.CR1 + 30) Sfx.landThump(.14);
  // 하강 — 숫자를 세는 동안 가라앉고, 마지막에 툭
  if (t === OP.SINK0 + 20) Sfx.sink((OP.SINK1 - OP.SINK0) / 60);
  if (t === OP.DROP) { Sfx.landThump(.28); Sfx.fall(); O.shake = 10; }
  if (t === OP.LAB + 20) Sfx.landThump(.16);                               // 어둠 속 심장 한 번
  if (t === OP.LAB + 50) Sfx.ambient('forest');                            // 새소리가 번져 옴
  if (t === OP.DARK + 132) Sfx.breath();
  // 지켜보는 이가 사라진 자리에서 새들이 날아오릅니다
  const w = t - OP.DARK;
  if (w === 100 || w === 106 || w === 115) Sfx.bird();
  if (t === OP.LINES) {                                                    // 누운 채로 생각
    say(OPENING_LINES, () => { G.mode = 'opening'; });
    talk.back = 'opening';
  }
  if (t === OP.END - 30) Sfx.landThump(.1);
  if (t >= OP.END) finishOpening();                                       // 탑뷰로
}

/* 위를 올려다본 천장 — 격자 조명 두 장. alpha 로 숲 장면 위에 유령처럼도 씁니다 */
function drawOpCeiling(alpha, tilt) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(W / 2, H / 2); g.rotate(tilt); g.translate(-W / 2, -H / 2);
  g.fillStyle = '#6f7884'; g.fillRect(-60, -60, W + 120, H + 120);
  g.strokeStyle = 'rgba(40,46,56,.7)'; g.lineWidth = 2;
  for (let x = -60; x < W + 60; x += 58) { g.beginPath(); g.moveTo(x, -60); g.lineTo(x, H + 60); g.stroke(); }
  for (let y = -60; y < H + 60; y += 58) { g.beginPath(); g.moveTo(-60, y); g.lineTo(W + 60, y); g.stroke(); }
  [[W / 2 - 145, H / 2 - 80], [W / 2 + 29, H / 2 - 80], [W / 2 - 145, H / 2 + 36], [W / 2 + 29, H / 2 + 36]].forEach(([x, y]) => {
    g.fillStyle = '#e6eef9'; g.fillRect(x, y, 116, 44);
    g.fillStyle = 'rgba(120,136,156,.9)';
    for (let gx = x; gx <= x + 116; gx += 14.5) g.fillRect(gx, y, 1, 44);
    g.fillRect(x, y + 22, 116, 1);
  });
  g.globalCompositeOperation = 'lighter';
  const lg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 300);
  lg.addColorStop(0, 'rgba(255,255,255,.22)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  g.restore();
}

/* 누워서 올려다본 숲 — 가장자리에서 모여드는 나무줄기, 해 질 녘 하늘 */
function drawOpCanopy(O, offY) {
  g.save();
  g.translate(0, offY);
  const sky = g.createRadialGradient(W * .55, H * .42, 8, W / 2, H / 2, W * .62);
  sky.addColorStop(0, '#ffd9a0'); sky.addColorStop(.18, '#f3a46e'); sky.addColorStop(.42, '#b45d6a');
  sky.addColorStop(.7, '#4a2f52'); sky.addColorStop(1, '#17121f');
  g.fillStyle = sky; g.fillRect(0, -H, W, H * 3);

  // 나무줄기 — 화면 가장자리에서 하늘 가운데로 솟으며 가늘어집니다 (아래에서 올려다본 원근)
  const vx = W * .52, vy = H * .44;
  g.lineCap = 'round';
  O.trunks.forEach(([fx, fy, w, bend]) => {
    const bx = fx * W, by = fy * H;
    const tx = bx + (vx - bx) * .62, ty = by + (vy - by) * .62;
    const cx = (bx + tx) / 2 + bend * W, cy = (by + ty) / 2;
    const N = 12;
    for (let k = 0; k < N; k++) {
      const u0 = k / N, u1 = (k + 1) / N;
      const P0 = [(1 - u0) ** 2 * bx + 2 * (1 - u0) * u0 * cx + u0 * u0 * tx, (1 - u0) ** 2 * by + 2 * (1 - u0) * u0 * cy + u0 * u0 * ty];
      const P1 = [(1 - u1) ** 2 * bx + 2 * (1 - u1) * u1 * cx + u1 * u1 * tx, (1 - u1) ** 2 * by + 2 * (1 - u1) * u1 * cy + u1 * u1 * ty];
      g.strokeStyle = '#0d0a11'; g.lineWidth = w * (1 - u0 * .8);
      g.beginPath(); g.moveTo(P0[0], P0[1]); g.lineTo(P1[0], P1[1]); g.stroke();
      g.strokeStyle = 'rgba(214,120,90,.22)'; g.lineWidth = 1;          // 노을을 받은 한쪽 테두리
      const o2 = w * (1 - u0 * .8) * .45;
      g.beginPath(); g.moveTo(P0[0] + o2, P0[1] - o2 * .3); g.lineTo(P1[0] + o2, P1[1] - o2 * .3); g.stroke();
    }
  });
  g.lineCap = 'butt';

  // 잎 덩어리 — 작은 잎 뭉치가 겹쳐 덤불처럼, 바람에 천천히 흔들립니다
  O.clumps.forEach(c => {
    const sw = Math.sin(G.t * .018 + c.p) * 3;
    const x = vx + Math.cos(c.a) * c.d * W * .62 + sw;
    const y = vy + Math.sin(c.a) * c.d * H * .8 + Math.cos(G.t * .015 + c.p) * 2;
    g.fillStyle = '#110e16';
    c.bits.forEach(b => { g.beginPath(); g.arc(x + b.dx, y + b.dy, b.r, 0, Math.PI * 2); g.fill(); });
    // 하늘 쪽 가장자리에 노을빛 — 해에 가까운 잎일수록 밝게
    const toSunX = W * .58 - x, toSunY = H * .38 - y, l = Math.hypot(toSunX, toSunY) || 1;
    g.fillStyle = `rgba(243,150,100,${Math.max(0, .32 - l / 1400)})`;
    c.bits.slice(0, 3).forEach(b => {
      g.beginPath(); g.arc(x + b.dx + toSunX / l * b.r * .45, y + b.dy + toSunY / l * b.r * .45, b.r * .4, 0, Math.PI * 2); g.fill();
    });
  });
  // 덤불 사이로 흩날리는 잎 몇 장
  g.fillStyle = '#18131d';
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39 + G.t * .002, d = .45 + (i % 4) * .06;
    g.save();
    g.translate(vx + Math.cos(a) * d * W * .62, vy + Math.sin(a) * d * H * .8);
    g.rotate(a + Math.sin(G.t * .03 + i) * .4);
    g.beginPath(); g.ellipse(0, 0, 4, 1.6, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // 해 — 잎 사이로 새는 빛
  g.globalCompositeOperation = 'lighter';
  const sg = g.createRadialGradient(W * .58, H * .38, 2, W * .58, H * .38, 120);
  sg.addColorStop(0, 'rgba(255,236,200,.9)'); sg.addColorStop(.3, 'rgba(255,190,130,.25)'); sg.addColorStop(1, 'rgba(255,160,100,0)');
  g.fillStyle = sg; g.fillRect(0, -H, W, H * 3);
  for (let i = 0; i < 5; i++) {                       // 빛줄기
    const a = -.4 + i * .42 + Math.sin(G.t * .006 + i) * .05;
    g.globalAlpha = .06;
    g.fillStyle = '#ffd9a8';
    g.beginPath(); g.moveTo(W * .58, H * .38);
    g.lineTo(W * .58 + Math.cos(a) * 400, H * .38 + Math.sin(a) * 400);
    g.lineTo(W * .58 + Math.cos(a + .08) * 400, H * .38 + Math.sin(a + .08) * 400);
    g.closePath(); g.fill();
  }
  g.restore();
}

/* 화면 전체를 한 번에 흐리게 — 줄였다가 부드럽게 늘려 붙입니다.
   canvas filter:blur 는 도형 하나하나에 따로 걸려서, 잎사귀·돌 수백 개를
   그리는 1인칭 장면에선 한 프레임에 수백 ms 가 걸렸습니다. 이건 그림 두 장. */
let _blurCv = null;
function blurFrame(px) {
  if (px < .3) return;
  const CW = cv.width, CHt = cv.height;
  if (!_blurCv || _blurCv.width !== CW) { _blurCv = document.createElement('canvas'); _blurCv.width = CW; _blurCv.height = CHt; }
  const s = 1 + px * .9 * SR;                      // 흐림은 화면 크기(576) 기준 — 고해상도면 그만큼 크게
  const w = Math.max(2, Math.round(CW / s)), h = Math.max(2, Math.round(CHt / s));
  const b = _blurCv.getContext('2d');
  b.imageSmoothingEnabled = true;
  b.clearRect(0, 0, CW, CHt);
  if (s > 2.5) {                       // 한 번에 크게 줄이면 거칠어서 두 번에 나눠 줄입니다
    b.drawImage(cv, 0, 0, CW / 2, CHt / 2);
    b.drawImage(_blurCv, 0, 0, CW / 2, CHt / 2, 0, 0, w, h);
  } else {
    b.drawImage(cv, 0, 0, w, h);
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = true;
  g.drawImage(_blurCv, 0, 0, w, h, 0, 0, CW, CHt);
  g.restore();
}

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ease01 = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

/* 하강 — 누운 채로 가라앉습니다. 천장 둘레로 돌을 쌓은 통로가 자라나고,
   벽이 바깥으로 흘러 지나가며(가라앉는 쪽에서 올려다본 모습) 천장은
   멀어져 작은 입구가 됩니다 — 우물 바닥에서 깨어날 때 보는 그 모양. */
function drawOpShaft(t, e) {
  const cx = W / 2, cy = H / 2;
  const rx = W * .72 + (36 - W * .72) * e, ry = rx * .72;
  const a = clamp01(e * 5);
  const speed = t > OP.DROP ? 3.2 : 1;                       // 툭 떨어지는 순간엔 벽이 확 스쳐 갑니다
  const ph = ((t - OP.SINK0) * .012 * speed + (t > OP.DROP ? (t - OP.DROP) * .05 : 0)) % 1;
  g.save();
  g.globalAlpha = a;
  // 구멍 밖은 전부 돌벽
  g.fillStyle = '#09080c';
  g.beginPath(); g.rect(-80, -80, W + 160, H + 160);
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill('evenodd');
  // 돌을 쌓은 단 — 구멍 가까이는 빛을 받아 밝고, 바깥으로 흘러나갈수록 어둡습니다
  for (let i = 9; i >= 0; i--) {
    const f = i + ph, rr = rx * Math.pow(1.3, f) + 6;
    if (rr > W * 1.2) continue;
    const seg = 10 + (i % 3) * 2, lit = Math.max(0, 1 - f / 7);
    const base = 6 + lit * 46;
    g.lineWidth = 5 + f * 3.2;
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * 6.283 + i * .71, a1 = a0 + 6.283 / seg * .84;
      const v = base + ((k * 37 + i * 53) % 13) - 6;
      g.strokeStyle = `rgb(${v | 0},${v * .94 | 0},${v * 1.1 | 0})`;
      g.beginPath(); g.ellipse(cx, cy, rr, rr * .72, 0, a0, a1); g.stroke();
    }
  }
  // 입구 테두리
  g.strokeStyle = 'rgba(20,19,25,.95)'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, Math.PI * 2); g.stroke();
  // 위에서 내려오는 빛
  g.globalCompositeOperation = 'lighter';
  const lg = g.createRadialGradient(cx, cy, rx * .3, cx, cy, rx * 2.6);
  lg.addColorStop(0, `rgba(170,186,210,${.18 * a})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  g.restore();
}

/* 오프닝에서 들여다보는 방호복 후드 — figure3d.js 로 한 번만 찍어 둡니다 (없으면 그림으로) */
let OP_HOOD;
function opHoodImage() {
  if (OP_HOOD !== undefined) return OP_HOOD;
  OP_HOOD = null;
  try {
    if (!window.Figure3D) return null;
    const F = new Figure3D(960, 540);
    if (!F.ok) return null;
    const lit = [1.05, 1.08, 1.12];
    const img = F.render({ kind: 'suit', x: 0, y: -1.62, z: 1.0, yaw: .15, stride: 0, reach: 0, lean: .1 }, {
      cam: { f: 450, px: 480, py: 270 }, sky: [.24, .25, .27], gnd: [.05, .05, .06], fog: [0, 0, 0], near: 1, red: [0, 0, 0, 0],
      lights: [[[-.4, 1.4, -1.6], lit], [[.6, 1.2, -1.2], lit.map(v => v * .8)], [[0, -.3, .6], [.12, .12, .13]]] });
    const c = document.createElement('canvas'); c.width = 960; c.height = 540;
    c.getContext('2d').drawImage(img, 0, 0);
    const lose = F.gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    OP_HOOD = c;
  } catch (e) { OP_HOOD = null; }
  return OP_HOOD;
}

/* ── 오프닝 실사 3D — 실험실(labroom.js) · 사람(figure3d.js) · 우물 · 숲(opening3d.js).
   WebGL 이 없으면 아래 그림 함수들(drawOpCeiling · drawOpShaft · drawOpCanopy …)로 그대로 그립니다. */
let OP3 = undefined;
function op3d() {
  if (OP3 !== undefined) return OP3;
  OP3 = null;
  try {
    if (!window.LabRoom || !window.Figure3D || !window.Opening3D) return null;
    const lab = new LabRoom(); if (!lab.ok) return null;
    const FW = cvHi ? cvHi.width : 960, FH = cvHi ? cvHi.height : 540;
    const fig = new Figure3D(FW, FH); if (!fig.ok) return null;    // 방호복도 고해상도 화면 그대로 (늘려 찍으면 흐려졌음)
    fig.k = FW / 960;
    const scene = new Opening3D(cvHi ? cvHi.width : 960, cvHi ? cvHi.height : 540); if (!scene.ok) return null;
    lab.setScale((cvHi ? cvHi.width : 960) / 960);
    OP3 = { lab, fig, scene, ceil: null };
  } catch (e) { OP3 = null; }
  return OP3;
}
function op3dDispose() {
  if (!OP3) return;
  for (const r of [OP3.lab, OP3.fig, OP3.scene]) { const x = r.gl && r.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
  OP3 = undefined;                    // 다음 오프닝에서 새로 만듭니다
}
/* 누운 자리에서 올려다본 실험실 — 엔딩 · 탈출의 그 방, 그 침대 */
function opLabCam(t) {
  const cam = { x: -1.24, y: .98, z: 5.8, yaw: Math.PI / 2, pitch: 1.12 + Math.sin(t * .007) * .015, roll: -.08 + Math.sin(t * .01) * .01 };
  const pe = window.LabRoomGeo && LabRoomGeo.patientEye && LabRoomGeo.patientEye(0);
  if (pe) { cam.x = pe[0]; cam.y = pe[1]; cam.z = pe[2]; }
  return cam;
}
function opLabImage(R, t, dim) {
  const cam = opLabCam(t);
  return R.lab.render({ cam, t, wires: 4, wirePull: [0, 0, 0, 0], ivOut: false, ivT: 0, rise: 0, sit: true, doorSlide: 0,
                        body: LabRoomGeo.bodyPose(cam, 0, 0), dim });
}
const OP_LIT = [[[-.3, 1.4, -1.8], [1.1, 1.12, 1.15]], [[.7, 1.2, -1.2], [.8, .8, .82]], [[0, -.3, .6], [.12, .12, .13]]];
function drawOpLab3D(R, t, cr) {
  g.imageSmoothingEnabled = true;
  const lab = opLabImage(R, t, .9);
  g.drawImage(lab, 0, 0, W, H);
  if (window.PixFX) PixFX.bloom(g, lab, 0, 0, W, H, .42);                 // 형광등 빛이 번짐
  const red = cr > 0 ? [.9, .12, .1, cr * (.12 + .1 * Math.sin((t - OP.CR0) / 52 * Math.PI * 2))] : [0, 0, 0, 0];
  const env = c => ({ cam: { f: 450, px: 480, py: 250, roll: c }, sky: [.22, .23, .25], gnd: [.05, .05, .06], fog: [0, 0, 0], near: 1, red, lights: OP_LIT });
  // 가장자리에서 내려다보는 방호복 — 말을 걸 때마다 들여다봅니다
  [[30, 700], [710, 1190]].forEach(([a0, b0], n) => {
    const a = opT(a0), b = opT(b0);
    if (t <= a || t >= b) return;
    const k = Math.min(1, (t - a) / 40) * Math.min(1, (b - t) / 40);
    const L = n ? 0 : ease01((t - OP.CR0 - 6) / 30) * (1 - ease01((t - OP.CR1 - 4) / 30));   // 깨려 하면 바짝
    const sway = Math.sin(t * .012) * .04 * (1 - L);
    const img = R.fig.render({ kind: 'suit', x: .34 - L * .1 + sway, y: -1.58 + L * .03, z: .98 - L * .12, yaw: -.25 + L * .08, stride: 0,
                               reach: .45 + L * .25 + Math.sin(t * .02) * .03, lean: .35 + L * .15, alpha: Math.min(1, .9 * k + L * .1) }, env(-.55));
    g.drawImage(img, 0, 0, W, H);
  });
}
/* 숫자를 세며 가라앉는 우물 — 입구에 방금까지 보던 천장이 비칩니다 */
function drawOpWell3D(R, t, sink) {
  if (!R.ceil) {
    const img = opLabImage(R, OP.SINK0, .9);
    R.ceil = document.createElement('canvas'); R.ceil.width = img.width; R.ceil.height = img.height;
    R.ceil.getContext('2d').drawImage(img, 0, 0);
    R.ceilUp = false;
  }
  const img = R.scene.renderWell(sink, R.ceilUp ? null : R.ceil, -.08 + sink * .5);
  R.ceilUp = true;
  g.imageSmoothingEnabled = true;
  g.drawImage(img, 0, 0, W, H);
  if (window.PixFX) PixFX.bloom(g, img, 0, 0, W, H, .55, { blur: 4 });   // 저 위 입구의 빛
}
/* 숲에서 눈을 뜸 — 땅에 누워 올려다본 나무 · 하늘, 가지 틈의 방호복 */
function drawOpForest3D(R, t, rise) {
  const gt = t - OP.DARK;
  g.imageSmoothingEnabled = true;
  const wood = R.scene.renderForest(rise, t);
  g.drawImage(wood, 0, 0, W, H);
  if (window.PixFX) PixFX.bloom(g, wood, 0, 0, W, H, .5, { cut: 2.6, blur: 4 });   // 잎 사이로 새는 노을
  if (gt >= 58 && gt < 100) {                               // 노을을 등진 그림자 — 테두리만 빛남
    const k = ease01((gt - 58) / 14), e = rise * rise;
    const img = R.fig.render({ kind: 'suit', x: .55 + (1 - k) * .25, y: -1.45 - e * 1.5, z: 1.2, yaw: -.4, stride: 0, reach: .2, lean: .45 }, {
      cam: { f: 450, px: 480, py: 250, roll: -.35 }, sky: [.07, .05, .06], gnd: [.02, .015, .02], fog: [0, 0, 0], near: 1, red: [0, 0, 0, 0],
      lights: [[[.4, 2.6, -2.6], [1.6, 1.05, .6]], [[-.6, 2.2, -2.4], [.9, .5, .35]], [[0, -.4, .4], [.05, .04, .05]]] });
    g.drawImage(img, 0, 0, W, H);
  }
}

/* ── 오프닝 글리치 — 화면이 순간 찢어지고 · 색이 어긋나고 · 픽셀 그림으로 무너졌다가 돌아옵니다.
   "방금 뭐였지?" 하고 넘어갈 만큼 짧게. 실험실이 또렷이 보이는 순간마다 끼어들어 무엇인지 단정하지 못하게 하고,
   픽셀로 무너지는 순간엔 이 게임(탑뷰 픽셀)의 그림이 언뜻 겹칩니다 — 이어지는 본편과 같은 결.
   [시작(기준 시간), 길이(프레임), 세기, 종류] — tear 찢어짐 · rgb 색 어긋남 · pix 픽셀로 무너짐 · roll 화면이 위아래로 미끄러짐 · block 깨진 조각 */
const OP_GLITCH = [
  [70, 8, .8, 'tear rgb'],
  [96, 9, 1, 'pix tear rgb'],
  [180, 6, .9, 'inv tear'],
  [252, 14, 1.2, 'tear rgb block drop'],          // 펜라이트 뒤
  [330, 8, 1, 'freeze tear rgb'],
  [380, 10, 1.1, 'pix rgb'],
  [440, 6, .9, 'inv block'],
  [468, 18, 1.4, 'pix tear rgb roll'],           // "141번째예요."
  [520, 8, 1, 'freeze block rgb'],
  [566, 14, 1.5, 'rgb tear block inv drop'],     // 각성
  [600, 8, 1.2, 'pix tear'],
  [626, 22, 1.7, 'pix rgb roll block'],          // 바짝 들여다볼 때 — 가장 크게
  [676, 8, 1.1, 'inv tear rgb'],
  [760, 12, 1.1, 'tear rgb drop'],
  [830, 8, 1, 'freeze pix'],
  [880, 14, 1.2, 'pix block'],
  [950, 8, 1, 'inv tear'],
  [1010, 12, 1.1, 'tear rgb roll'],
  [1090, 8, 1, 'pix rgb'],
  [1215, 16, 1.3, 'pix block rgb'],              // 숫자를 세기 시작
  [1320, 12, 1.2, 'tear rgb inv'],
  [1380, 8, 1, 'freeze roll'],
  [1420, 14, 1.3, 'pix tear'],
  [1490, 8, 1.1, 'block rgb'],
  [1522, 20, 1.7, 'roll rgb block inv drop']     // "7…" 툭
].map(([a, d, k, kind]) => [opT(a), d, k, kind]);
/* 숲 — 어둠이 걷힌 뒤(OP.DARK 기준 실제 프레임) */
const OP_GLITCH_WOOD = [[30, 14, 1.3, 'pix tear rgb'], [60, 8, 1, 'inv tear'], [83, 10, 1.2, 'tear rgb roll'], [120, 8, 1, 'freeze block'],
                        [150, 12, 1.1, 'pix rgb'], [190, 6, .9, 'inv'], [214, 10, 1.1, 'tear rgb drop'], [OP.LINES - OP.DARK + 30, 12, 1.2, 'pix roll rgb']]
  .map(([a, d, k, kind]) => [OP.DARK + a, d, k, kind]);
const OP_GLITCH_ALL = OP_GLITCH.concat(OP_GLITCH_WOOD);
function opGlitchAt(O, t) {
  const calm = HERO_REDUCE;                  // "동작 줄이기" 설정 — 번쩍임(반전 · 검은 프레임 · 화면 미끄러짐) 없이 약하게
  for (const [a, d, k, kind] of OP_GLITCH_ALL) if (t >= a && t < a + d) {
    const u = (t - a) / d;
    const kk = k * (u < .7 ? 1 : (1 - u) / .3 * .8 + .2);
    return calm ? { k: kk * .4, kind: kind.replace(/inv|drop|roll|freeze/g, '') || 'tear', u, a, big: true }
                : { k: kk, kind, u, a, big: true };
  }
  if (O.micro > 0 && !calm) return { k: .7, kind: O.microKind, u: 0, a: t, big: false };   // 가끔 한두 프레임 스치는 잔글리치
  return null;
}
let _glCv = null, _glSm = null, _glHold = null;
function opGlitch(G1, t) {
  const CW = cv.width, CH = cv.height;
  if (!_glCv || _glCv.width !== CW || _glCv.height !== CH) { _glCv = document.createElement('canvas'); _glCv.width = CW; _glCv.height = CH; }
  const b = _glCv.getContext('2d'), k = G1.k, has = s => G1.kind.includes(s);
  let seed = (t * 9301 + 49297) % 233280;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.globalAlpha = 1; g.filter = 'none';
  // 멈춤 — 글리치가 시작된 그 한 장에 화면이 걸려 버림 (소리 · 글자는 흘러감)
  if (has('freeze')) {
    if (!_glHold || _glHold.width !== CW || _glHold.height !== CH) { _glHold = document.createElement('canvas'); _glHold.width = CW; _glHold.height = CH; G1.a = t; }
    const h = _glHold.getContext('2d');
    if (t === G1.a || !_glHold._ok) { h.drawImage(cv, 0, 0); _glHold._ok = true; }
    else g.drawImage(_glHold, Math.round((rnd() - .5) * 6 * SR), 0);
  } else if (_glHold) _glHold._ok = false;
  b.globalCompositeOperation = 'copy'; b.drawImage(cv, 0, 0); b.globalCompositeOperation = 'source-over';
  // 픽셀로 무너짐 — 작게 줄여 몇 가지 색으로 눌러 담았다가 계단 그대로 키움 (탑뷰 본편의 그 결)
  if (has('pix')) {
    const ps = Math.round((3 + k * 4) * SR), w = Math.max(8, Math.round(CW / ps)), h = Math.max(6, Math.round(CH / ps));
    if (!_glSm) _glSm = document.createElement('canvas');
    _glSm.width = w; _glSm.height = h;
    const sm = _glSm.getContext('2d', { willReadFrequently: true });
    sm.imageSmoothingEnabled = true; sm.drawImage(_glCv, 0, 0, w, h);
    const id = sm.getImageData(0, 0, w, h), px = id.data, lv = 7;
    for (let i = 0; i < px.length; i += 4) {                                 // 몇 단계 색으로 — 밝기를 조금 올려 어둠 속 덩어리가 보이게
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(Math.min(1, Math.pow(px[i + c] / 255, .8) * 1.1) * (lv - 1)) / (lv - 1) * 255;
      px[i + 1] = Math.min(255, px[i + 1] + 6);                              // 본편 화면처럼 살짝 초록 기
    }
    sm.putImageData(id, 0, 0);
    g.drawImage(_glSm, 0, 0, w, h, 0, 0, CW, CH);
    b.globalCompositeOperation = 'copy'; b.drawImage(cv, 0, 0); b.globalCompositeOperation = 'source-over';
  }
  // 위아래로 미끄러짐 — 수직 동기가 풀린 것처럼
  if (has('roll')) {
    const dy = Math.round((rnd() * .5 + .2) * CH * k) % CH;
    g.drawImage(_glCv, 0, dy - CH); g.drawImage(_glCv, 0, dy);
    g.fillStyle = 'rgba(0,0,0,.85)'; g.fillRect(0, dy - 6 * SR, CW, 5 * SR);
    b.globalCompositeOperation = 'copy'; b.drawImage(cv, 0, 0); b.globalCompositeOperation = 'source-over';
  }
  // 찢어짐 — 가로 띠 몇 줄이 옆으로 밀림
  if (has('tear')) {
    const n = 5 + Math.round(k * 12);
    for (let i = 0; i < n; i++) {
      const y = Math.floor(rnd() * CH), h = Math.max(2, Math.floor((2 + rnd() * 40 * k) * SR)), dx = Math.round((rnd() - .5) * 240 * k * SR);
      g.drawImage(_glCv, 0, y, CW, h, dx, y, CW, h);
      if (rnd() < .4) g.drawImage(_glCv, 0, y, CW, h, dx - Math.sign(dx || 1) * CW, y, CW, h);   // 밀려난 자리 메움
    }
  }
  // 깨진 조각 — 다른 자리의 네모가 끼어들고, 몇 칸은 원색으로
  if (has('block')) {
    const bs = Math.round(16 * SR), n = 8 + Math.round(k * 22);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * CW / bs) * bs, y = Math.floor(rnd() * CH / bs) * bs, w = bs * (1 + Math.floor(rnd() * 4)), h = bs * (1 + Math.floor(rnd() * 2));
      if (rnd() < .3) { g.fillStyle = ['#1fe07a', '#e01f9a', '#20d8e8', '#0b0c10'][Math.floor(rnd() * 4)]; g.globalAlpha = .8; g.fillRect(x, y, w, h); g.globalAlpha = 1; }
      else g.drawImage(_glCv, Math.floor(rnd() * CW / bs) * bs, Math.floor(rnd() * CH / bs) * bs, w, h, x, y, w, h);
    }
  }
  // 색 어긋남 — 빨강만 옆으로
  if (has('rgb')) {
    const dx = Math.round((10 + rnd() * 18) * k * SR) * (rnd() < .5 ? -1 : 1);
    b.globalCompositeOperation = 'multiply'; b.fillStyle = '#ff0000'; b.fillRect(0, 0, CW, CH); b.globalCompositeOperation = 'source-over';
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#00ffff'; g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'lighter'; g.drawImage(_glCv, dx, 0);
    g.globalCompositeOperation = 'source-over';
  }
  // 반전 — 몇 프레임 색이 뒤집힘
  if (has('inv') && (G1.big || (G1.a * 7) % 3)) {          // 한 번 뒤집히면 그 글리치 동안 그대로 (번쩍번쩍 깜빡이지 않게)
    g.globalCompositeOperation = 'difference'; g.fillStyle = '#fff'; g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'source-over';
  }
  // 신호가 끊김 — 한두 프레임 새까맣게, 가운데 가로줄 하나만
  if (has('drop') && rnd() < .35) {
    g.fillStyle = '#000'; g.fillRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(220,235,255,.8)'; g.fillRect(0, CH / 2 - SR, CW, 2 * SR);
  }
  // 흔들림 · 주사선 · 잡음
  if (k > .8) { const sx = Math.round((rnd() - .5) * 14 * k * SR); g.drawImage(cv, sx, 0); }
  g.fillStyle = `rgba(255,255,255,${.1 + k * .12})`;
  for (let i = 0; i < 1 + Math.round(k * 3); i++) g.fillRect(0, Math.floor(rnd() * CH), CW, Math.max(1, Math.round(SR * (1 + rnd() * 2))));
  for (let i = 0; i < 40 * k; i++) { g.fillStyle = rnd() < .5 ? '#fff' : '#000'; g.fillRect(Math.floor(rnd() * CW), Math.floor(rnd() * CH), 2 * SR, SR); }
  g.restore();
}

/* 숲 — 깜빡임 사이 가지 틈에서 내려다보는 방호복 후드 하나, 그리고 날아오르는 새 */
function drawOpWatcher(w) {
  const hx = W * .63, hy = H * .3;
  if (w >= 58 && w < 100) {
    const k = ease01((w - 58) / 14);
    g.save();
    g.translate(hx + (1 - k) * 26, hy + (1 - k) * 8); g.rotate(-.35);
    // 노을을 등진 방호복 — 거의 그림자, 테두리만 노랗게 빛나고 얼굴창에 노을이 비칩니다
    g.fillStyle = '#25241c';
    g.beginPath(); g.ellipse(14, 50, 52, 26, -.2, 0, Math.PI * 2); g.fill();     // 부푼 어깨
    g.beginPath(); g.ellipse(0, 0, 33, 40, 0, 0, Math.PI * 2); g.fill();         // 후드
    g.strokeStyle = 'rgba(214,204,140,.7)'; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(0, 0, 32, 39, 0, Math.PI * 1.1, Math.PI * 1.75); g.stroke();
    g.fillStyle = '#050406';
    g.beginPath(); g.ellipse(-3, 5, 20, 25, 0, 0, Math.PI * 2); g.fill();        // 얼굴창
    g.strokeStyle = `rgba(255,214,170,${.7 + Math.sin(w * .5) * .25})`; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.ellipse(-3, 5, 15, 20, 0, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
    g.lineCap = 'butt';
    g.restore();
  }
  if (w >= 100 && w < 300) {
    const u = w - 100;
    g.save();
    g.strokeStyle = '#0d0a11'; g.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {                       // 새 — 그 자리에서 흩어져 날아갑니다
      const ang = -2.4 + i * .3, sp = 2.1 + (i % 3) * .5;
      const x = hx + Math.cos(ang) * u * sp, y = hy + Math.sin(ang) * u * sp * .8;
      const fl = Math.sin(u * .5 + i) * 4;
      g.beginPath(); g.moveTo(x - 6, y - fl); g.quadraticCurveTo(x - 2, y - 2, x, y);
      g.quadraticCurveTo(x + 2, y - 2, x + 6, y - fl); g.stroke();
    }
    g.fillStyle = '#14101a';
    for (let i = 0; i < 7; i++) {                       // 흔들려 떨어지는 잎
      const x = hx - 20 + i * 8 + Math.sin(u * .04 + i * 1.3) * 16, y = hy + u * (.55 + (i % 3) * .15);
      g.save(); g.translate(x, y); g.rotate(u * .05 + i);
      g.beginPath(); g.ellipse(0, 0, 4.5, 1.8, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.restore();
  }
}

/* 오프닝 3D 해상도 — 한 장 그리는 간격이 길면 낮추고(최저 0.7배), 넉넉하면 되돌림 (최고 1.8배 = 고해상도 화면 그대로) */
function opAdapt(R) {
  const now = performance.now(), dt = R.t0 ? now - R.t0 : 16; R.t0 = now;
  R.dt = R.dt == null ? dt : R.dt * .93 + Math.min(200, dt) * .07;
  if (++R.n % 45) return;
  const k0 = R.k || R.lab.k || 1.8;
  const k = R.dt > 26 ? Math.max(.7, k0 * .8) : R.dt < 17 && k0 < 1.8 ? Math.min(1.8, k0 * 1.12) : k0;
  if (k === k0) return;
  R.k = k; R.lab.setScale(k); R.scene.setSize(Math.round(960 * k), Math.round(540 * k));
  const F = R.fig; F.w = F.canvas.width = Math.round(960 * k); F.h = F.canvas.height = Math.round(540 * k); F.k = k;   // 방호복도 같은 배율
}
function renderOpening() {
  const O = G.opening, t = O.t;
  if (OP3) { OP3.n = OP3.n || 0; opAdapt(OP3); }
  const o = opEye(t);
  g.save();
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (O.shake > .4) g.translate((Math.random() - .5) * O.shake, (Math.random() - .5) * O.shake);

  if (t < OP.LAB) {
    // 각성 위기 — 0‥1 로 차오르고 약이 들어가면 빠집니다
    const cr = ease01((t - OP.CR0) / 24) * (1 - ease01((t - OP.CR1 + 6) / 10));
    // 하강 — 숫자를 세며 가라앉음, "7…" 에서 한 번 툭
    const sink = t > OP.SINK0 ? ease01((t - OP.SINK0) / (OP.SINK1 - OP.SINK0)) * .82 + ease01((t - OP.DROP) / 12) * .18 : 0;
    const R = op3d();
    if (R) {
      if (sink > 0) drawOpWell3D(R, t, sink); else drawOpLab3D(R, t, cr);
    } else {
    // 잠드는 쪽 — 졸려서 초점이 안 맞습니다
    g.save();
    if (sink > 0) { const sc = 1 - .62 * sink; g.translate(W / 2, H / 2); g.scale(sc, sc); g.translate(-W / 2, -H / 2); }
    drawOpCeiling(1, -.08 + Math.sin(t * .01) * .01 + (sink ? sink * .5 : 0));
    g.restore();
    // 가장자리에서 내려다보는 누군가 — 흐릿한 노란 후드와 새까만 얼굴창 (말을 걸 때마다 들여다봅니다)
    [[30, 700], [710, 1190]].forEach(([a0, b0], n) => {
      const a = opT(a0), b = opT(b0);
      if (t <= a || t >= b) return;
      const k = Math.min(1, (t - a) / 40) * Math.min(1, (b - t) / 40);
      // 깨려 하면 바짝 들여다봅니다
      const L = n ? 0 : ease01((t - OP.CR0 - 6) / 30) * (1 - ease01((t - OP.CR1 - 4) / 30));
      const lean = Math.sin(t * .012) * 6 * (1 - L);
      const sc = 1 + L * .55, hx = W * .9 - L * W * .17 + lean, hy = H * .36 + L * H * .05;
      // 방호복의 후드 — 실사 3D (figure3d.js) 로 한 번 찍어 둔 그림. 천장 형광등을 등지고 내려다봅니다
      g.globalAlpha = .85 * k + L * .1;
      const hood = opHoodImage();
      if (hood) {
        g.save(); g.translate(hx - 42 * sc, hy + 8 * sc); g.rotate(-.3);          // 그림 속 보호면 가운데(500, 250)를 여기에
        const z2 = sc * .95; g.drawImage(hood, -500 * z2, -250 * z2, 960 * z2, 540 * z2);
        if (L > .2) { g.strokeStyle = `rgba(255,90,80,${.2 + L * .3})`; g.lineWidth = 2 * sc; g.lineCap = 'round';   // 경보의 붉은 빛이 아래 가장자리에
          g.beginPath(); g.moveTo(-36 * z2, 66 * z2); g.lineTo(36 * z2, 66 * z2); g.stroke(); g.lineCap = 'butt'; }
        g.restore();
      } else {
        g.globalAlpha = .85 * k + L * .1;
        g.fillStyle = '#6c6648';
        g.beginPath(); g.ellipse(hx + 8 * sc, hy + 10 * sc, 104 * sc, 118 * sc, -.3, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#a49660';
        g.beginPath(); g.ellipse(hx, hy, 95 * sc, 110 * sc, -.3, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(hx - 42 * sc, hy + 8 * sc); g.rotate(-.3);
        g.strokeStyle = '#857c54'; g.lineWidth = 4 * sc;                          // 후드 이음선
        g.beginPath(); g.ellipse(46 * sc, -6 * sc, 70 * sc, 96 * sc, 0, Math.PI * .85, Math.PI * 1.25); g.stroke();
        g.fillStyle = '#262c38';                                                  // 얼굴창 고무 테두리
        g.beginPath(); g.roundRect(-60 * sc, -74 * sc, 120 * sc, 150 * sc, 46 * sc); g.fill();
        g.fillStyle = '#07080a';                                                  // 보호면 — 속은 새까맣게
        g.beginPath(); g.roundRect(-51 * sc, -65 * sc, 102 * sc, 132 * sc, 38 * sc); g.fill();
        g.strokeStyle = `rgba(230,240,255,${.45 + L * .4})`; g.lineCap = 'round';   // 비스듬히 스친 형광등
        g.lineWidth = 7 * sc; g.beginPath(); g.moveTo(-34 * sc, -40 * sc); g.lineTo(-12 * sc, -56 * sc); g.stroke();
        g.lineWidth = 3 * sc; g.beginPath(); g.moveTo(-38 * sc, -22 * sc); g.lineTo(-26 * sc, -31 * sc); g.stroke();
        if (L > .2) { g.strokeStyle = `rgba(255,90,80,${.25 + L * .3})`; g.lineWidth = 2 * sc;   // 경보의 붉은 빛이 아래 가장자리에
          g.beginPath(); g.moveTo(-30 * sc, 58 * sc); g.lineTo(30 * sc, 58 * sc); g.stroke(); }
        g.lineCap = 'butt'; g.restore();
      }
      g.globalAlpha = 1;
    });
    }
    // 펜라이트 — 눈을 가로질러 훑고 지나갑니다
    const pl0 = opT(206);                     // 펜라이트는 이야기가 느려져도 휙 지나갑니다
    if (t > pl0 && t < pl0 + 44) {
      const k = (t - pl0) / 44;
      const px = W * (.25 + k * .5), py = H * (.42 + Math.sin(k * Math.PI) * .06);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.sin(k * Math.PI);
      const pl = g.createRadialGradient(px, py, 2, px, py, 120);
      pl.addColorStop(0, 'rgba(255,255,250,1)'); pl.addColorStop(.2, 'rgba(240,248,255,.6)'); pl.addColorStop(1, 'rgba(240,248,255,0)');
      g.fillStyle = pl; g.fillRect(0, 0, W, H);
      g.restore();
    }
    if (sink > 0 && !R) drawOpShaft(t, sink);
    const drug = t > opT(690) ? Math.min(1, (t - opT(690)) / 120) * (1 - sink * .5) : 0;
    blurFrame(Math.max(.2, 1.2 - cr * 1.05) + (1 - o) * 2.4 + drug * 1.6);
    // 경보 — 붉은 맥박이 가장자리부터
    if (cr > 0) {
      const pulse = .5 + .5 * Math.sin((t - OP.CR0) / 52 * Math.PI * 2 - 1.2);
      const rg = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * .6);
      rg.addColorStop(0, `rgba(200,30,30,${cr * .1 * pulse})`);
      rg.addColorStop(1, `rgba(210,20,24,${cr * (.3 + .35 * pulse)})`);
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
    // 약이 들어갑니다 — 차가운 푸른 물결이 아래서부터 차오르고, 상이 두 겹으로 갈라집니다
    const iw = (t - (OP.CR1 - 8)) / 56;
    if (iw > 0 && iw < 1) {
      const front = H * (1.05 - iw * 1.3);
      const wg = g.createLinearGradient(0, front - 40, 0, front + 120);
      wg.addColorStop(0, 'rgba(90,150,230,0)'); wg.addColorStop(.3, `rgba(110,170,240,${.5 * (1 - iw)})`);
      wg.addColorStop(1, `rgba(40,80,150,${.35 * (1 - iw)})`);
      g.fillStyle = wg; g.fillRect(0, front - 40, W, H - front + 40);
      g.save();
      g.globalAlpha = .35 * Math.sin(iw * Math.PI);
      g.globalCompositeOperation = 'screen';
      g.drawImage(cv, 8 * (1 - iw), 0, W, H); g.drawImage(cv, -8 * (1 - iw), 2, W, H);
      g.restore();
    }
    if (drug > 0) { g.fillStyle = `rgba(20,30,48,${drug * .25})`; g.fillRect(0, 0, W, H); }
  } else if (t >= OP.DARK) {
    const rise = t > OP.LINES ? Math.min(1, (t - OP.LINES) / (OP.END - OP.LINES - 16)) : 0;
    const e = rise * rise;
    const gt = t - OP.DARK, R = op3d();
    const ghost = (gt >= 28 && gt <= 36) || (gt >= 82 && gt <= 85);
    if (R) {                                  // 실사 3D — 몸을 일으키면 시선이 하늘에서 앞으로 내려옵니다
      drawOpForest3D(R, t, rise);
      if (gt >= 100) { g.save(); g.translate(0, -e * H * .9); drawOpWatcher(gt); g.restore(); }   // 날아오르는 새
      // 첫 깜빡임 사이로 그 실험실 천장이 하늘 위에 비칩니다 — 무엇인지는 엔딩에서
      if (ghost && R.ceil) { g.globalAlpha = .38; g.drawImage(R.ceil, 0, 0, W, H); g.globalAlpha = 1; }
    } else {
    // 몸을 일으키면 하늘이 위로 빠져나가고 시야가 기웁니다
    g.translate(W / 2, H / 2); g.rotate(e * .12); g.translate(-W / 2, -H / 2);
    drawOpCanopy(O, -e * H * .9);
    g.save(); g.translate(0, -e * H * .9); drawOpWatcher(gt); g.restore();
    // 첫 깜빡임 사이로 천장 격자가 하늘 위에 비칩니다 — 무엇인지는 엔딩에서
    if (ghost) drawOpCeiling(.38, -.08);
    }
    baseXf();
    blurFrame((1 - o) * 5 + e * 6);
    if (rise > .8) { g.fillStyle = `rgba(0,0,0,${(rise - .8) * 5})`; g.fillRect(0, 0, W, H); }
  }

  // 눈꺼풀 (우물 바닥에서 깨어날 때와 같은 모양)
  drawEyelids(o);
  const gl1 = opGlitchAt(O, t);
  if (gl1 && t < OP.END - 20) opGlitch(gl1, t);

  // 멀리서 들리는 목소리 — 귀가 먹먹하게, 흐릿하게
  OP_TEXT.forEach(([a, b, s, who]) => {
    if (t < a || t >= b) return;
    const k = Math.min(1, (t - a) / 14) * Math.min(1, (b - t) / 14);
    const fade = .85 - Math.max(0, t - opT(1200)) / 700;   // 셀수록 목소리가 멀어집니다
    g.save();
    g.textAlign = 'center';
    if (who === 'far') {                                     // 저쪽 — 작고 흐리게, 조금 위에서
      g.globalAlpha = k * .68;
      g.filter = 'blur(.5px)';
      g.font = '9px DungGeunMo, ui-monospace, monospace';
      g.fillStyle = '#9fb0bf';
      g.fillText(s, W * .36, H - 52);
    } else if (who === 'urgent') {                           // 다급한 조수 — 붉고, 떨립니다
      g.globalAlpha = k * .92;
      g.font = '10px DungGeunMo, ui-monospace, monospace';
      g.fillStyle = '#f2a39a';
      g.fillText(s, W * .36 + (Math.random() - .5) * 2, H - 56 + (Math.random() - .5) * 2);
    } else if (who === 'cold') {                             // 짧고 또렷한 지시
      g.globalAlpha = k * .9;
      g.font = '10px DungGeunMo, ui-monospace, monospace';
      g.fillStyle = '#e8c9c0';
      g.fillText(s, W * .64, H - 46);
    } else {
      g.globalAlpha = k * fade;
      g.filter = 'blur(.6px)';
      g.font = '10px DungGeunMo, ui-monospace, monospace';
      g.fillStyle = '#d8e6ef';
      g.fillText(s, W / 2, H - 34);
    }
    g.restore();
  });
  drawSkipRing(O.skip || 0, O.skipShow || 0, OP_SKIP_T);
  g.restore();
}

/* 길게 눌러 건너뛰기 — 오른쪽 아래, 누르는 동안 고리가 차오름 */
function drawSkipRing(k, show, full) {
  if (show <= 0 && k <= 0) return;
  const a = Math.min(1, show / 30, 1) * .85, x = W - 22, y = H - 20;
  g.save();
  baseXf();
  g.globalAlpha = a; g.lineCap = 'round';
  g.strokeStyle = 'rgba(232,238,246,.25)'; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
  if (k > 0) { g.strokeStyle = '#e8eef6'; g.beginPath(); g.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k / full)); g.stroke(); }
  g.font = '8px DungGeunMo, ui-monospace, monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillStyle = '#c9d3df'; g.fillText('길게 눌러 건너뛰기', x - 13, y + .5);
  g.restore();
}

function renderWakeup() {
  const t = G.eyeT, o = eyeOpen(t);
  // 눈을 다 뜬 뒤로는 숨 쉬듯 시야가 아주 미세하게 오르내립니다 —
  // 오래 응시하는 구간이 정지 화면처럼 굳어 보이지 않게 합니다.
  const breathe = t > EYE_OPEN_T ? Math.sin((t - EYE_OPEN_T) * .045) * 2.2 : 0;
  const cx = W / 2, cy = H * .40 + breathe;
  g.save();
  g.fillStyle = '#06050a';
  g.fillRect(0, 0, W, H);

  // 초점 — 눈이 덜 떠졌을수록 흐립니다
  const blur = (1 - o) * 5.5;          // 다 그린 뒤 blurFrame 으로 한 번에

  // 위로 좁아지는 우물 통로 — 돌을 쌓아 올린 단이 입구 쪽으로 모입니다
  const RING_N = 9;
  for (let i = RING_N; i >= 1; i--) {
    const k = i / RING_N;                      // 1 = 가까운 아래쪽, 0 = 저 위
    const rr = 26 + Math.pow(k, 1.3) * 300;
    const oy = cy + k * 30;
    const seg = 9 + (i % 3) * 2;               // 한 단에 박힌 돌 개수
    const base = 9 + (1 - k) * 44;             // 위로 갈수록 빛을 받아 밝습니다
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * 6.283 + i * .43;
      const a1 = a0 + (6.283 / seg) * .84;     // 돌 사이 이음매만큼 띄웁니다
      const v = base + ((s * 37 + i * 53) % 15) - 7;
      g.strokeStyle = `rgb(${v | 0},${v * .94 | 0},${v * 1.08 | 0})`;
      g.lineWidth = 7 + (1 - k) * 8;
      g.beginPath(); g.ellipse(cx, oy, rr, rr * .72, 0, a0, a1); g.stroke();
    }
  }

  // 입구에서 쏟아지는 빛
  const lg = g.createRadialGradient(cx, cy, 4, cx, cy, 200);
  lg.addColorStop(0, 'rgba(170,184,208,.55)');
  lg.addColorStop(.10, 'rgba(98,110,134,.26)');
  lg.addColorStop(.45, 'rgba(40,44,58,.12)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);

  // 저 위의 우물 입구 (해 질 녘 하늘 한 조각)
  g.fillStyle = 'rgba(156,172,196,.95)';
  g.beginPath(); g.ellipse(cx, cy, 22, 15, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(98,112,138,.65)';
  g.beginPath(); g.ellipse(cx, cy + 4, 22, 15, 0, .25, Math.PI - .25); g.fill();
  // 입구 테두리 — 울퉁불퉁한 돌
  g.strokeStyle = 'rgba(26,25,31,.95)'; g.lineWidth = 3;
  g.beginPath();
  for (let a = 0; a <= 6.32; a += .34) {
    const w = 1 + Math.sin(a * 5.1) * .1;
    const px = cx + Math.cos(a) * 23 * w, py = cy + Math.sin(a) * 16.5 * w;
    a ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.stroke();

  // 입구에서 내려오는 빛줄기 (아래로 퍼짐)
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .13 + o * .1;
  const beam = g.createLinearGradient(0, cy, 0, H);
  beam.addColorStop(0, 'rgba(150,168,200,.6)');
  beam.addColorStop(1, 'rgba(150,168,200,0)');
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(cx - 19, cy); g.lineTo(cx + 19, cy);
  g.lineTo(cx + 160, H); g.lineTo(cx - 160, H);
  g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  // 빛줄기 속을 떠도는 먼지
  g.fillStyle = 'rgba(214,220,232,.6)';
  G.fx.forEach(f => {
    if (f.k !== 'dust') return;
    const d = Math.abs(f.x - cx);
    if (d > 150) return;
    g.globalAlpha = (1 - d / 150) * (f.life / f.max) * .75;
    g.fillRect(f.x, f.y, 1, 2);
  });
  g.globalAlpha = 1;
  blurFrame(blur);

  drawEyelids(o);
  g.restore();
}

/* ── 눈꺼풀 ───────────────────────────────────────────
   위아래에서 덮어 오되 안쪽 가장자리를 곡선으로 그려 눈 모양이
   되도록 하고, 좌우 구석도 어둡게 눌러 시야를 좁힙니다.
   (우물 바닥에서 깨어날 때와 오프닝이 같이 씁니다) */
function drawEyelids(o) {
  const cx = W / 2;
  g.save();
  const half = H / 2 + 10;
  const lid = (1 - o) * half;
  g.fillStyle = '#000';
  // 윗눈꺼풀
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, lid);
  g.quadraticCurveTo(cx, lid + 48 * o, 0, lid);
  g.closePath(); g.fill();
  // 아랫눈꺼풀
  g.beginPath();
  g.moveTo(0, H); g.lineTo(W, H); g.lineTo(W, H - lid);
  g.quadraticCurveTo(cx, H - lid - 32 * o, 0, H - lid);
  g.closePath(); g.fill();

  // 좌우 눈초리 — 가운데만 보이도록 양옆을 어둡게
  const sg = g.createLinearGradient(0, 0, W, 0);
  sg.addColorStop(0, 'rgba(0,0,0,1)');
  sg.addColorStop(.30, 'rgba(0,0,0,0)');
  sg.addColorStop(.70, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);

  // 속눈썹 그림자 — 눈꺼풀 안쪽에 옅은 띠
  if (o > .05) {
    g.globalAlpha = .5;
    const eg = g.createLinearGradient(0, lid, 0, lid + 34);
    eg.addColorStop(0, 'rgba(0,0,0,.9)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = eg; g.fillRect(0, lid, W, 34);
    g.globalAlpha = 1;
  }
  g.restore();
}

/* 암전이 걷히며 던전이 드러나는 순간 — 가운데부터 열리는 조리개 */
function renderWake() {
  const k = G.wake / WAKE_DUR;            // 1 → 0
  const cx = W / 2, cy = H / 2;
  g.save();
  // 바깥쪽은 아직 검게 남아 있다가 안쪽부터 서서히 열립니다
  const r = 40 + (1 - k) * (1 - k) * 620;
  const vg = g.createRadialGradient(cx, cy, r * .45, cx, cy, r);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${Math.min(1, k * 1.25)})`);
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  // 열리는 테두리에 남는 잔광
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = k * k * .55;
  g.strokeStyle = 'rgba(255,226,170,.9)';
  g.lineWidth = 1 + k * 6;
  g.beginPath(); g.arc(cx, cy, r * .82, 0, Math.PI * 2); g.stroke();
  g.restore();
}

function renderFall() {
  const dur = FALL_DUR;
  const t = G.fallT, k = t / dur;
  const cx = W / 2, cy = H / 2 - 6;
  g.save();

  // 1) 우물 안쪽 — 가운데 저 아래 어둠으로 빨려 드는 통로 (완전 불투명)
  g.fillStyle = '#07060b';
  g.fillRect(0, 0, W, H);
  const vr = 280 * (1 - k * .3);
  const vg = g.createRadialGradient(cx, cy, vr * .06, cx, cy, vr);
  vg.addColorStop(0, '#000000');
  vg.addColorStop(.45, `rgb(${18 - k * 12 | 0},${15 - k * 10 | 0},${22 - k * 14 | 0})`);
  vg.addColorStop(1, `rgb(${34 - k * 26 | 0},${28 - k * 22 | 0},${24 - k * 18 | 0})`);
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  // 1.5) 저 위 우물 입구 — 떨어질수록 작아지며 멀어집니다.
  //      떨어지고 있다는 게 눈으로 보여야 낙하가 길어도 지루하지 않습니다.
  if (k < .52) {
    const mk = k / .52;                        // 0 → 1
    const mr = 26 * (1 - mk * .90);            // 점점 작아지고
    const my = cy - 46 - mk * 66;              // 주인공 위로, 점점 멀어짐
    const ma = (1 - mk) * .95;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const mg = g.createRadialGradient(cx, my, 0, cx, my, mr * 5 + 10);
    mg.addColorStop(0, `rgba(152,168,196,${ma * .55})`);
    mg.addColorStop(1, 'rgba(152,168,196,0)');
    g.fillStyle = mg;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = ma;
    g.fillStyle = '#b3c4de';
    g.beginPath(); g.ellipse(cx, my, mr, mr * .66, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(20,18,24,${ma})`; g.lineWidth = 2;
    g.beginPath(); g.ellipse(cx, my, mr, mr * .66, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  // 1.6) 같이 떨어지는 흙덩이 · 돌조각 — 위에서 아래로 스쳐 지나갑니다
  for (let i = 0; i < 18; i++) {
    const sp = .55 + ((i * 37) % 11) / 11 * .9;
    const cyc = ((k * 3.1 * sp) + i / 18) % 1;
    const dx = cx + Math.sin(i * 2.3 + k * 3) * (34 + (i % 5) * 46);
    const dy = -14 + cyc * (H + 40);
    const dl = 5 + (i % 4) * 6;
    g.globalAlpha = Math.min(1, (1 - Math.abs(cyc - .5) * 1.4)) * .85;
    g.fillStyle = i % 3 === 0 ? '#c3ae8e' : '#8f8270';
    g.fillRect(dx, dy, 1.5 + (i % 3) * .9, dl);
  }
  g.globalAlpha = 1;

  // 2) 우물 안쪽 돌벽 — 고리가 계속 태어나 화면 밖으로 커지며 지나갑니다
  const spin = k * 2.2;
  for (let i = 0; i < 8; i++) {
    const cycle = ((k * 2.4) + i / 8) % 1;
    const rad = 8 + cycle * 260;
    const a = (1 - cycle) * .55;
    g.save();
    g.translate(cx, cy);
    g.rotate(spin + i * .3);
    g.strokeStyle = `rgba(90,78,68,${a})`;
    g.lineWidth = 3 + cycle * 5;
    g.beginPath(); g.ellipse(0, 0, rad, rad * .68, 0, 0, Math.PI * 2); g.stroke();
    // 돌벽 이음매(단청 색 살짝 스민 돌조각) — 오방색을 아주 옅게 흘려 복선 유지
    if (i % 2 === 0) {
      g.strokeStyle = `rgba(227,178,60,${a * .3})`;
      g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(0, 3, rad * .99, rad * .67, 0, 0, Math.PI); g.stroke();
    }
    g.restore();
  }

  // 3) 빙글빙글 도는 잔상 줄무늬 — 빨려 들어가는 속도감
  g.save();
  g.translate(cx, cy);
  g.rotate(spin * 1.4);
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2;
    const dist = 26 + ((i * 41 + t * 10) % 230);
    const a = Math.max(0, 1 - dist / 230) * .55;
    const len = 26 + (i % 5) * 14;
    g.strokeStyle = `rgba(200,208,228,${a})`;
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(Math.cos(ang) * dist, Math.sin(ang) * dist * .68);
    g.lineTo(Math.cos(ang) * (dist + len), Math.sin(ang) * (dist + len) * .68);
    g.stroke();
  }
  g.restore();

  // 4) 작아지며 구르듯 떨어지는 주인공
  if (IMG.hero) {
    const scale = Math.max(.05, 1 - k * .92);
    g.save();
    g.translate(cx, cy + Math.sin(t * .22) * 3 * (1 - k));
    g.rotate(k * 3.2);
    g.scale(scale, scale);
    g.globalAlpha = Math.min(1, 1.3 - k);
    const seq = HERO.down, idx = seq[Math.floor(t / 6) % seq.length];
    g.drawImage(IMG.hero, idx * HERO.fw, 0, HERO.fw, HERO.fh, -HERO.fw / 2, -HERO.fh / 2, HERO.fw, HERO.fh);
    g.restore();
  }

  // 5) 아주 짧게 스친 글리치 — 반전의 복선 (낙하가 길어진 만큼 두 번)
  if (t === 108 || t === 109 || t === 212) {
    g.fillStyle = 'rgba(125,227,200,.16)';
    g.fillRect(0, 0, W, H);
  }

  // 6) 마지막은 완전한 암전으로 마무리
  const fadeFrom = .72;
  if (k > fadeFrom) {
    g.fillStyle = `rgba(0,0,0,${Math.min(1, (k - fadeFrom) / (1 - fadeFrom))})`;
    g.fillRect(0, 0, W, H);
  }
  g.restore();
}

/* ═══════════ 엔딩 ═════════════════════════════════════
   마지막 자물쇠를 연 바로 그 방이 글리치로 무너지고, 칠흑 속 심전도와
   터미널로 수면 실험이었다는 게 드러납니다 (연출 본체는 ending.js).
   SPACE 를 누르면 클리어 기록이 담긴 엔드 카드로 넘어갑니다. */
let endingScene = null;
function beginEnding() {
  G.mode = 'ending';     // G.endWarp 은 그대로 — 일그러진 화면이 그대로 붕괴로 이어집니다
  stopRun();                                   // 여기서 시계를 멈춥니다

  // 타임어택으로 깬 판만 기록에 남깁니다 (일반 모드는 시계 자체가 없습니다)
  $('endcard').classList.toggle('casual', !G.timeAttack);
  if (G.timeAttack) {
    const ms = RUN.elapsed;
    const prevBest = loadRecords()[0];
    const list = saveRecord(ms);
    $('cleartime').textContent = fmtTime(ms);
    $('recordtag').classList.toggle('hidden', !(prevBest === undefined || ms < prevBest));
    fillList($('records'), list.slice(0, 3), ms);   // 엔드 카드에는 상위 3개만
    if (window.Festival && Festival.on && Festival.player) {      // 축제판 — 순위판에 올리고 등수를 알려 줌
      const fr = $('fest-result');
      fr.textContent = '순위판에 기록을 올리는 중…'; fr.classList.remove('hidden');
      Festival.finish(ms).then(rank => {
        fr.textContent = rank ? `${Festival.player.name} 님, 순위판 ${rank}위!` : '기록을 이 기기에 저장했어요 — 연결되면 순위판에 올라가요';
        const dev = window.WB_DEV;                                // 개발자 기록 (순위와 따로)
        if (dev && dev.ms > 0) fr.textContent += ms < dev.ms ? `  ·  개발자 ${dev.name || ''} 기록을 깼어요! 🔥` : `  ·  개발자 기록까지 ${fmtTime(ms - dev.ms)}`;
      });
    }
  }

  $('prompt').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('subtitle').classList.add('hidden');
  $('ending').classList.remove('hidden');
  Sfx.ambientStop(); Sfx.dungeonBgm(false); Sfx.bossBgmStopAll();

  const world = endingWorld();                  // 마지막 방 — 입체로 일어설 재료 (그리기 전에 떠 둠)
  endingScene = new EndingScene($('endcv'), {
    world: world && (() => world),
    // 메인 루프는 엔딩 동안 화면을 그리지 않으므로, 씬이 원할 때 한 장씩 그려 넘깁니다
    source: () => { render(); return cv; },
    audio: () => Sfx.context(),
    // 공개판은 1부까지 — 눈을 뜬 뒤 SPACE 를 누르면 엔드 카드. 2부(1인칭 탈출)는 숨겨 두고 개발자 화면에서만
    onReturn: () => PART2_OPEN ? beginEscape() : showEndCard()
  });
  endingScene.start();
}

/* 마지막 방을 입체 모형으로 세울 재료 (diorama3d.js) — 주인공을 뺀 방 그림 · 주인공 그림 한 장 · 벽 · 문 자리.
   무너지던 화면(endWarp) · 흔들림 · 번쩍임은 걷어 낸 깨끗한 한 장으로 */
function endingWorld() {
  if (G.inForest || !MAP[G.room] || !window.Diorama3D) return null;
  const keep = { warp: G.endWarp, shake: G.shake, flash: G.flash, glare: G.glare };
  G.endWarp = 0; G.shake = 0; G.flash = 0; G.glare = 0;
  try {
    const cx = camX(), cy = camY();
    const hx = Math.round(P.x - 36), hy = Math.round(P.y - 45), hw = 72, hh = 65;
    const hc = document.createElement('canvas'); hc.width = hw; hc.height = hh;
    const gk = g, inv = P.inv; g = hc.getContext('2d'); g.imageSmoothingEnabled = false; g.translate(-hx, -hy);
    P.inv = 0;                                               // 무적 깜빡임(반투명) 없이 또렷하게
    try { drawPlayer(); } finally { g = gk; P.inv = inv; }
    G.hideHero = true;
    try { render(); } finally { G.hideHero = false; }
    const rc = document.createElement('canvas'); rc.width = VW; rc.height = VH; rc.getContext('2d').drawImage(cv, 0, OY, VW, VH, 0, 0, VW, VH);   // 늘어난 띠는 빼고 방만
    const whole = W === VW && H === VH;                       // 방 전체가 한 화면일 때만 테두리 벽을 세움
    return { room: rc, hero: hc, heroAt: [hx - cx, hy - cy, hw, hh], W: VW, H: VH, TS,
             doors: whole ? Object.keys(G.doors) : ['N', 'S', 'E', 'W'], walls: whole,
             dir: P.dir, final: whole && !!MAP[G.room].final };      // 1인칭은 주인공이 보던 쪽으로 · 마지막 문
  } catch (e) { return null; }
  finally { Object.assign(G, { endWarp: keep.warp, shake: keep.shake, flash: keep.flash, glare: keep.glare }); }
}

/* 공개 범위 — 축제 공개판은 1부 「깨어남」까지. true 로 바꾸면 엔딩 뒤 그대로 2부(탈출)로 이어집니다 */
const PART2_OPEN = false;
/* 엔드 카드의 "처음부터 다시" — 페이지를 새로 고치지 않고 타이틀로.
   (예전엔 location.reload() 였는데, 아티팩트처럼 다른 페이지 안에 들어간 화면에선 새로 고침이 막혀 아무 일도 안 일어났음) */
function restartFromEnd() {
  if (endingScene) { if (endingScene.running) endingScene.stop(); endingScene = null; }
  if (escapeScene) { if (escapeScene.running) escapeScene.stop(); escapeScene = null; }
  escFull(false);
  $('endcard').classList.remove('on');
  $('ending').classList.add('hidden');
  resetRun();
}
function showEndCard() {
  $('endcard').querySelector('.e-sub').textContent = '2145 / 05 / 20 · 실험체 07 · 의식 회복 확인 — 세션 141 종료';
  $('endcard').classList.add('on');
}

/* ═══════════ 제4막 (시제품) — 연구소 탈출, 1인칭 ═══════════════
   엔딩에서 눈을 뜬 뒤, 비상구 앞에서 나갈지 말지를 고릅니다 (js/escape.js).
   어떻게 끝났는지에 따라 엔드 카드의 한 줄이 달라집니다. */
let escapeScene = null;
const END_SUB = {
  stay:    '2145 / 05 / 20 · 실험체 07 · 다시 잠듦 — 세션 142 예약',
  caught:  '2145 / 05 / 20 · 실험체 07 · 이탈 시도 — 세션 142 예약',
  escaped: '2145 / 05 / 20 · 실험체 07 · 이탈 시도 · 진정됨 — 꿈속에서 출구 도달 (세션 142 진행 중)'
};
/* from : 'wake' — 침대에서 깨어나 비상구까지 걸어가는 것부터 (엔딩 뒤 기본) · 'door' — 비상구 앞부터 */
/* 탈출은 창 전체로 — #ending 을 무대 밖(body)으로 꺼냈다가 끝나면 제자리로 */
function escFull(on) {
  const e = $('ending');
  if (on) { if (!e._home) { e._home = { p: e.parentNode, n: e.nextSibling }; document.body.appendChild(e); } document.body.classList.add('escfull'); }
  else { if (e._home) { e._home.p.insertBefore(e, e._home.n); e._home = null; } document.body.classList.remove('escfull'); }
}
function beginEscape(from = 'wake') {
  escFull(true);
  escapeScene = new EscapeScene($('endcv'), {
    audio: () => Sfx.context(),
    onDone: result => {
      escapeScene = null;
      escFull(false);
      $('endcard').querySelector('.e-sub').textContent = END_SUB[result] || END_SUB.stay;
      $('endcard').classList.add('on');
    }
  });
  escapeScene.start(from);
}

/* ═══════════ 이스터에그 ③ — 코나미 코드 (타이틀) ═══════════════
   ↑ ↑ ↓ ↓ ← → ← → B A. 게임이라면 다들 한 번쯤 눌러 보는 그 코드입니다.
   이 게임에선 관측자가 그걸 "규칙 위반"으로 기록하고는, 이번 한 번만
   봐준다며 심장 하나를 더 얹어 줍니다 (일반 모드 다음 판 · 타임어택 제외). */
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
let konamiI = 0;
function konamiKey(code) {
  if (G.mode !== 'title' && G.mode !== 'modesel' && G.mode !== 'diffsel') { konamiI = 0; return; }
  konamiI = code === KONAMI[konamiI] ? konamiI + 1 : (code === KONAMI[0] ? 1 : 0);
  if (konamiI < KONAMI.length) return;
  konamiI = 0;
  if (G.konami) return;
  G.konami = true;
  Sfx.unlock(); Sfx.glitch();
  setTimeout(() => Sfx.keyGet(), 900);
  $('title').classList.add('konami');
  const lines = ['규칙 위반 감지 — 피험자가 코드를 입력했습니다.',
                 '…한 번만 봐 드리죠. 이번 세션, 심장 하나 더. (일반 모드)'];
  let li = 0, n = 0;
  const el = $('t-log');
  const iv = setInterval(() => {
    n++;
    el.textContent = lines[li].slice(0, n);
    if (n % 3 === 0) Sfx.beep(.03);
    if (n >= lines[li].length) {
      if (++li >= lines.length) { clearInterval(iv); setTimeout(() => $('title').classList.remove('konami'), 1600); return; }
      n = 0;
    }
  }, 55);
}

/* ═══════════ 이스터에그 ④ — 꿈속에서 조는 것 ═══════════════════
   적이 없는 방에서 45초 동안 아무것도 누르지 않으면, 꿈속에서 다시
   잠들기 시작합니다. 눈꺼풀이 내려오고 바닥 위로 심전도가 비치다가,
   다급한 목소리에 퍼뜩 깹니다. 한 판에 한 번만 (타임어택 제외). */
const DOZE_AFTER = 60 * 20;                 // 20초 동안 아무것도 안 하면
const DOZE = { CLOSE: 380, SNAP: 560, END: 640 };
const DOZE_TEXT = [
  [40, 170, '…움직임이 없네요.', 'far'],
  [190, 330, '수면 단계, 한 단계 더 내려갑니다.', 'far'],
  [400, 540, '잠깐— 이 안에서 잠들면 안 돼요.', 'near']
];
function dozeEye(t) {                      // 1 = 뜸 → 0 = 감김, 끝에 번쩍 뜸
  if (t >= DOZE.SNAP) return 1;
  const k = Math.min(1, t / DOZE.CLOSE);
  const droop = 1 - k * k;
  const nod = t < DOZE.CLOSE ? Math.max(0, Math.sin(t * .05)) * .18 * k : 0;   // 꾸벅거림
  return Math.max(0, droop + nod);
}
function checkDoze() {
  if (G.dozeSeen || G.timeAttack || G.inForest || G.boss || G.foes.length || G.mode !== 'play') { G.idleT = 0; return; }
  const busy = Object.values(key).some(Boolean) || mouse.down;
  G.idleT = busy ? 0 : (G.idleT || 0) + 1;
  if (G.idleT >= DOZE_AFTER) beginDoze();
}
function beginDoze() {
  G.dozeSeen = true; G.idleT = 0;
  G.doze = { t: 0 };
  G.mode = 'doze';
  $('prompt').classList.add('hidden');
}
function tickDoze() {
  const D = G.doze, t = ++D.t;
  if (t % 70 === 10 && t < DOZE.CLOSE) Sfx.beep(.03);          // 바닥 밑에서 들려오는 비프
  if (t === 400) { Sfx.beep(.06); setTimeout(() => Sfx.beep(.06), 160); }
  if (t === DOZE.SNAP) {                                         // 퍼뜩
    Sfx.landThump(.6); Sfx.glitch();
    G.shake = 18; G.flash = 1; glare(.8);
  }
  if (t >= DOZE.END) {
    G.doze = null;
    G.mode = 'play';
    say([{ t: '…방금 누가 말한 거야?', w: true }]);
  }
}
function renderDoze() {
  const t = G.doze.t, o = dozeEye(t);
  const k = Math.min(1, t / DOZE.CLOSE);
  g.save();
  if (t < DOZE.SNAP) {
    // 현실이 바닥 위로 비쳐 듭니다 — 녹색 심전도 한 줄
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .1 + k * .35;
    g.strokeStyle = '#3cff7a'; g.lineWidth = 1.5;
    g.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const ph = ((x + t * 2.4) % 160) / 160;
      const spike = ph > .48 && ph < .54 ? -26 * Math.sin((ph - .48) / .06 * Math.PI) : 0;
      const y = H / 2 + spike + Math.sin(x * .05) * 1.2;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    blurFrame(k * 3.5);
    drawEyelids(o);
  }
  DOZE_TEXT.forEach(([a, b, s, who]) => {
    if (t < a || t >= b) return;
    const kk = Math.min(1, (t - a) / 14) * Math.min(1, (b - t) / 14);
    g.globalAlpha = kk * (who === 'far' ? .7 : .95);
    g.font = '10px DungGeunMo, ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillStyle = who === 'far' ? '#9fb0bf' : '#ffd0c8';
    g.fillText(s, W / 2, H - 34);
  });
  g.restore();
}

/* ═══════════ 이스터에그 ⑤ — 화면 밖을 본 것 ═════════════════════
   게임 도중 다른 탭이나 앱으로 눈을 돌리면, 브라우저 탭 제목이 대신 말을
   걸어옵니다. 돌아오면 화면이 한 번 튀고, 관측자가 속삭입니다 —
   "괜찮아요. 거기도 꿈이에요." 플레이어의 현실까지 세션 안으로 끌어들이는
   장치입니다. 게임은 멈추지 않고, 속삭임은 한 판에 한 번 (타임어택은 탭
   제목만). 아티팩트처럼 다른 페이지 안에 끼워진 경우엔 탭 제목은 바뀌지
   않고 돌아왔을 때의 속삭임만 나옵니다. */
const AWAY_TITLES = ['…어디 가요?', '피험자 07 — 시선 이탈', '돌아와요. 아직 안 끝났어요.'];
const AWAY_SHORT = ['…방금, 화면 밖을 보셨죠.', '괜찮아요. 거기도 꿈이에요.'];
const AWAY_LONG  = ['…오래 비우셨네요.', '그쪽 세상은 어땠어요? 여기랑 많이 다르던가요.'];
const PLAYING = () => !['title', 'modesel', 'diffsel', 'devsel', 'ending', 'opening', 'dead'].includes(G.mode);
let awayAt = 0, awayIv = null, homeTitle = document.title;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (!PLAYING()) return;
    awayAt = performance.now();
    homeTitle = document.title;
    let i = 0;
    document.title = AWAY_TITLES[0];
    awayIv = setInterval(() => { document.title = AWAY_TITLES[++i % AWAY_TITLES.length]; }, 1500);
  } else {
    if (!awayAt) return;
    clearInterval(awayIv); awayIv = null;
    document.title = homeTitle;
    const gone = (performance.now() - awayAt) / 1000;
    awayAt = 0;
    if (gone < 2 || G.awaySeen || G.timeAttack || !PLAYING()) return;
    G.awaySeen = true;
    G.awayMsg = { t: 0, lines: gone >= 30 ? AWAY_LONG : AWAY_SHORT };
    Sfx.unlock(); Sfx.glitch();
    G.shake = Math.max(G.shake, 8); G.flash = Math.max(G.flash, .6);
    $('glitchbar').classList.remove('on'); void $('glitchbar').offsetWidth; $('glitchbar').classList.add('on');
  }
});
function tickAwayMsg() {
  if (!G.awayMsg) return;
  const t = ++G.awayMsg.t;
  if (t === 30 || t === 170) Sfx.beep(.04);
  if (t > 330) G.awayMsg = null;
}
function renderAwayMsg() {
  const M = G.awayMsg, t = M.t;
  g.save();
  // 돌아온 순간, 화면 위로 녹색 심전도가 한 번 지나갑니다 (현실 쪽 모니터)
  if (t < 60) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = (1 - t / 60) * .6;
    g.strokeStyle = '#3cff7a'; g.lineWidth = 1.5;
    g.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const ph = ((x + t * 9) % 180) / 180;
      const spike = ph > .46 && ph < .52 ? -30 * Math.sin((ph - .46) / .06 * Math.PI) : 0;
      x ? g.lineTo(x, H * .45 + spike) : g.moveTo(x, H * .45 + spike);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
  }
  // 속삭임 두 줄 — 화면 가운데 위쪽, 조금씩 떨리며
  M.lines.forEach((s, i) => {
    const a = 20 + i * 140, b = a + 150;
    if (t < a || t >= b) return;
    const k = Math.min(1, (t - a) / 16) * Math.min(1, (b - t) / 16);
    g.globalAlpha = k * .9;
    g.font = '11px DungGeunMo, ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillStyle = i ? '#d8f0e4' : '#9fb0bf';
    g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 6;
    g.fillText(s, W / 2 + (Math.random() - .5) * 1.2, H * .3 + (Math.random() - .5) * 1.2);
  });
  g.restore();
}

/* ═══════════ 개발자 모드 ═════════════════════════════════
   타이틀의 로고를 세 번 누르면 켜집니다. 어느 방으로든, 어느 컷신으로든
   바로 갑니다 — 검증할 때마다 게임을 처음부터 깰 필요가 없습니다.
   들어가면 일반 모드 · 보통 난이도이고, 모든 길이 열려 있습니다
   (관문 열쇠 · 탐사 조건 충족, 고른 방 말고는 전부 클리어).
   게임 중  K : 방의 적 전부 처치 (보스 포함)   ` : 개발자 화면으로 */
const DEV_STAGES = [
  ['forest', '숲'], ['start', '우물 아래'], ['fork', '갈림길'], ['north', '북쪽 방'],
  ['south', '남쪽 방'], ['mid', '중앙'], ['ne', '북동 통로'], ['se', '남동 통로'],
  ['gate', '관문'], ['boss', '심층 (보스)'], ['exit', '탈출구']
];
const DEV_CINES = [
  ['opening', '오프닝 (1인칭)'], ['fall', '우물 추락'], ['bossintro', '보스 등장'],
  ['morph', '변이 · 변신'], ['abom', '심연 바로'], ['abomdeath', '심연의 최후'],
  ['endlines', '엔딩 대사'], ['ending', '엔딩만'], ['escape', '탈출 (1인칭 · 깨어남부터)'], ['escapedoor', '탈출 — 비상구부터'], ['gunfight', '탈출 — 총격전부터'], ['doze', '이스터에그 : 졸음'],
  ['away', '이스터에그 : 화면 밖']
];

let logoClicks = [];
$('title').querySelector('h1').addEventListener('click', () => {
  const now = performance.now();
  logoClicks = logoClicks.filter(t => now - t < 900);
  logoClicks.push(now);
  if (logoClicks.length >= 3 && (G.mode === 'title' || G.mode === 'modesel' || G.mode === 'diffsel')) {
    logoClicks = [];
    openDevPanel();
  }
});

function openDevPanel() {
  G.dev = true;
  document.body.classList.add('dev');          // 개발자 모드 동안엔 제작진 크레딧을 숨깁니다 (css)
  Sfx.unlock(); Sfx.glitch();
  $('devbadge').classList.remove('hidden');
  ['startbtn', 'besttimes', 'modesel', 'diffsel'].forEach(id => $(id).classList.add('hidden'));
  $('devpanel').classList.remove('hidden');
  $('title').classList.add('picking');
  G.mode = 'devsel';
}
function closeDevPanel() {
  // 개발자 모드를 완전히 끕니다 — DEV 표시 · 무적 · 단축키 · 크레딧 숨김까지
  G.dev = false; G.devGod = false;
  $('dv-god').checked = false;
  $('devbadge').classList.add('hidden');
  document.body.classList.remove('dev');
  $('devpanel').classList.add('hidden');
  $('startbtn').classList.remove('hidden');
  $('title').classList.remove('picking');
  renderBestTimes();
  G.mode = 'title';
}

/* 판을 연 뒤 오프닝을 걷어 내고, 던전이면 모든 길을 열어 둡니다 */
function devPrepare(dungeon) {
  Sfx.ring(0);
  startGame(false, 'normal');
  G.opening = null;
  talk.q = []; talk.cb = null;
  $('subtitle').classList.add('hidden');
  $('hud').classList.remove('hidden');
  G.mode = 'forest';
  if (!dungeon) { Sfx.ambient('forest'); return; }
  Sfx.ambientStop();
  G.doorKeys = DOOR_KEYS_NEEDED; G.gateOpen = true; G.keys = 3;
  Object.keys(MAP).forEach(id => { G.visited.add(id); stateOf(id).cleared = true; });
}
/* 그 방만 처음 상태로 (적이 있음) 들어갑니다 */
function devRoom(id) {
  stateOf(id).cleared = false;
  if (!MAP[id].boss) Sfx.dungeonBgm(true);
  loadRoom(id, id === 'exit' ? 'W' : 'S');
  updateHud();
}
/* 보스방에서 곧장 3페이즈 「심연」으로 */
function devAbom() {
  devPrepare(true); devRoom('boss');
  G.morphX = W / 2; G.morphY = 118; G.morphed = true;
  G.mode = 'play';
  eatMedpack(); makeAbom();
  Sfx.bossBgm('boss2', false, true);
  Sfx.bossBgm('boss3', true, false, true);
}
/* 탈출구 — 보스는 쓰러졌고 마지막 열쇠를 쥔 상태, 자물쇠 앞 */
function devExit() {
  devPrepare(true);
  G.bossDead = true; G.finalKey = true;
  devRoom('exit');
  P.x = W - TS - 24; P.y = H / 2;
}

function devJump(kind) {
  $('devpanel').classList.add('hidden');
  $('title').classList.remove('picking');
  if (kind === 'forest') { devPrepare(false); return; }
  if (MAP[kind]) { devPrepare(true); devRoom(kind); return; }
  switch (kind) {
    case 'opening':   startGame(false, 'normal'); break;
    case 'fall':      devPrepare(false); P.x = G.well.x; P.y = G.well.y + 20; interact(); break;
    case 'bossintro': devPrepare(true); devRoom('boss'); break;
    case 'morph':     devPrepare(true); devRoom('boss'); makeBoss(); G.mode = 'play'; beginMorph(); break;
    case 'abom':      devAbom(); break;
    case 'abomdeath': devAbom(); killBoss(); break;
    case 'endlines':  devExit(); interact(); break;
    case 'ending':    devExit(); beginEnding(); break;
    case 'escape':
    case 'escapedoor':
    case 'gunfight':  devExit(); G.mode = 'ending'; stopRun();
                      ['prompt', 'hud', 'subtitle'].forEach(id => $(id).classList.add('hidden'));
                      $('ending').classList.remove('hidden'); Sfx.ambientStop(); Sfx.dungeonBgm(false);
                      beginEscape(kind === 'escapedoor' ? 'door' : 'wake');
                      if (kind === 'gunfight') escapeScene.jumpTo(270);
                      break;
    case 'away':      devPrepare(true); Sfx.dungeonBgm(true); loadRoom('fork', 'S'); G.mode = 'play';
                      G.awayMsg = { t: 0, lines: AWAY_SHORT }; Sfx.glitch(); G.flash = .6; break;
    case 'doze':      devPrepare(true); Sfx.dungeonBgm(true); loadRoom('fork', 'S'); G.mode = 'play'; beginDoze(); break;
  }
}

/* K — 방의 적을 전부 쓰러뜨립니다 (분열체의 새끼까지, 보스는 그다음 단계로) */
function devKillAll() {
  for (let i = 0; i < 3 && G.foes.length; i++) G.foes.slice().forEach(f => { if (!f.dead) killFoe(f); });
  G.foes = G.foes.filter(f => !f.dead);
  if (G.boss) {
    if (G.boss.kind === 'abom') killBoss();
    else beginMorph();
  }
}
/* ` — 어디서든 개발자 화면으로 */
function devReturn() {
  if (endingScene && endingScene.running) endingScene.stop();
  if (escapeScene && escapeScene.running) { escapeScene.stop(); escapeScene = null; }
  escFull(false);
  $('ending').classList.add('hidden');
  $('endcard').classList.remove('on');
  resetRun();
  openDevPanel();
}

DEV_STAGES.forEach(([id, name]) => {
  const b = document.createElement('button');
  b.className = 'dv-btn'; b.textContent = name; b.type = 'button';
  b.addEventListener('click', () => devJump(id));
  $('dv-stages').appendChild(b);
});
DEV_CINES.forEach(([id, name]) => {
  const b = document.createElement('button');
  b.className = 'dv-btn'; b.textContent = name; b.type = 'button';
  b.addEventListener('click', () => devJump(id));
  $('dv-cines').appendChild(b);
});
$('dvback').addEventListener('click', closeDevPanel);
$('dv-god').addEventListener('change', e => { G.devGod = e.target.checked; });

/* ═══════════ 루프 ═════════════════════════════════════
   모든 움직임이 "1프레임당 몇 픽셀" 로 되어 있어서, 예전처럼 화면
   주사율에 그대로 맡기면 120Hz·144Hz 모니터에서 게임이 2배 넘게 빨라집니다.
   그래서 논리 갱신은 항상 초당 60번으로 고정하고, 화면만 주사율대로 그립니다. */
const STEP = 1000 / 60;
let lastT = 0, acc = 0;

let _topview = null;
function loop(now) {
  requestAnimationFrame(loop);
  if (now === undefined) now = performance.now();
  if (!lastT) lastT = now;
  let dt = now - lastT;
  lastT = now;

  // 탭을 잠깐 벗어났다 돌아온 경우엔 밀린 시간을 한꺼번에 몰아 돌리지 않습니다
  if (dt > 250) dt = STEP;
  acc += dt;

  let steps = 0;
  while (acc >= STEP && steps < 5) { update(); updateCamera(false); acc -= STEP; steps++; }
  if (acc > STEP * 5) acc = 0;

  if (G.mode !== 'ending') render();
  if (RUN.running) updateTimer();
  // 브라운관은 탑뷰 본편에서만 (css body.topview)
  const top = !G.opening && !['wakeup', 'ending', 'title', 'modesel', 'diffsel', 'devsel'].includes(G.mode);
  if (top !== _topview) { _topview = top; document.body.classList.toggle('topview', top); }
}

/* 디버그용 (개발/테스트 편의) */
window.__game = { G, P, RUN, MAP, BALANCE, loadRoom, loadForest, say, beginEnding,
                  startGame, openModeSelect, closeModeSelect,
                  openDiffSelect, closeDiffSelect, applyDifficulty, DIFF, DIFF_ORDER,
                  retry, respawn, respawnAbom, hurt,
                  resetRun, loadRecords, fmtTime,
                  EXPLORE_ROOMS, DOOR_KEYS_NEEDED, DOOR_KEY_ROOMS, MODE_RULE, rule,
                  gateReady, gateBlocker, exploreDone, exploreAll,
                  earnedDoorKeys, beginCreepy, queueBoss, makeBoss,
                  beginMorph, makeAbom, MORPH_DUR, ABOM_ACT, abomPose,
                  spawnFoe, killFoe, drawFoe, FOE, FOE_SKIN,
                  endingScene: () => endingScene, escapeScene: () => escapeScene, beginEscape,
                  killBoss, MORPH_PRE, AD, AD_DONE,
                  taRoute, devJump, openDevPanel, devKillAll, OP, opT, beginDoze, DOZE_AFTER,
                  clearRecords: () => { memRecords = []; try { localStorage.removeItem(REC_KEY); } catch (e) {} } };

/* 소리가 안 나는데 원인을 알 수 없는 상황(브라우저/삽입된 환경이
   오디오를 막고 있는 경우)을 위한 안내. 실제로 상호작용을 시작한
   뒤(타이틀을 벗어난 뒤)에도 AudioContext 가 계속 'suspended' 라면,
   막연히 "고장났나?" 하지 않도록 화면 아래 문구로 알려 줍니다. */
(() => {
  const hintEl = $('hint');
  const original = hintEl.textContent;
  let stuckCount = 0, warned = false;
  setInterval(() => {
    if (G.mode === 'title' || G.mode === 'modesel' || G.mode === 'diffsel') return;   // 아직 상호작용 전
    const st = Sfx.audioState();
    if (st === 'running') {
      stuckCount = 0;
      if (warned) { hintEl.textContent = original; warned = false; }
      return;
    }
    if (st === 'suspended' || st === 'none') {
      stuckCount++;
      if (stuckCount >= 3 && !warned) {
        warned = true;
        hintEl.textContent = '🔇 소리가 막혀 있는 것 같습니다 — 화면을 한 번 더 클릭해 보세요 (브라우저가 소리를 차단했을 수 있습니다)';
      }
    }
  }, 1000);
})();

loadAssets().then(() => { fit(); updateHud(); renderBestTimes(); loop(); });

})();
