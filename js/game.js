/* ═══════════════════════════════════════════════════════════
   game.js — 우물 아래 / The Well Below
   ═══════════════════════════════════════════════════════════ */
(() => {
'use strict';

const W = 576, H = 324, TS = 32;   // 16:9
const cv = document.getElementById('game');
const g  = cv.getContext('2d');
g.imageSmoothingEnabled = false;

const $ = id => document.getElementById(id);
const stage = $('stage');

/* 방향 상수 */
const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
const OPP  = { N: 'S', S: 'N', W: 'E', E: 'W' };

/* ── 화면 정수배 확대 ───────────────────────────────────── */
function fit() {
  const n = Math.max(1, Math.min(
    Math.floor((window.innerWidth  - 40) / W),
    Math.floor((window.innerHeight - 90) / H)
  ));
  stage.style.setProperty('--scale', `scale(${n})`);
  stage.style.transform = `scale(${n})`;
  stage.style.margin = `${(n - 1) * H / 2}px ${(n - 1) * W / 2}px`;
}
window.addEventListener('resize', fit);

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

const key = {};
const AIM = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
let mouse = { x: 0, y: 0, down: false };

addEventListener('keydown', e => {
  if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  key[e.key] = true;
  const k = e.key.toLowerCase();
  if (k === ' ') onConfirm();
  if (k === 'r' && G.mode === 'dead') retry();
  if (G.mode === 'modesel') {                       // 모드 선택은 1 / 2 로도 고를 수 있습니다
    if (k === '1') startGame(true);
    if (k === '2') startGame(false);
    if (k === 'escape' || k === 'backspace') closeModeSelect();
  }
});
addEventListener('keyup', e => { key[e.key] = false; });
cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width * W;
  mouse.y = (e.clientY - r.top)  / r.height * H;
});
cv.addEventListener('mousedown', e => { e.preventDefault(); mouse.down = true; Sfx.unlock(); });
addEventListener('mouseup', () => { mouse.down = false; });
addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

const down = (...ks) => ks.some(k => key[k]);

/* ═══════════ 게임 상태 ═════════════════════════════════ */
const G = {
  mode: 'title',        // title | modesel | forest | play | talk | note | doc | fall | landing | boss-intro | creepy | ending | dead
  timeAttack: true,     // true = 타임어택 모드 · false = 일반 모드
  room: null,           // 현재 방 id (숲이면 null)
  inForest: true,
  t: 0, shake: 0, flash: 0,
  seenGlitch: false,
  keys: 0,              // 상자 열쇠 (상자를 열 때 소모)
  doorKeys: 0,          // 관문 열쇠 — 비운 방에서 매번 다시 세는 파생값
  gateOpen: false,
  bossDead: false,
  finalKey: false,      // 보스를 잡으면 손에 쥐어지는 마지막 열쇠
  visited: new Set(),
  st: {},               // 방별 저장 상태
  floor: null, depth: 1,
  bullets: [], foes: [], fx: [], pickups: [], pots: [], clouds: [],
  rings: [],            // 보스전 충격파 고리
  glare: 0,             // 보스전 섬광 (0~1)
  chest: null, floorKey: null, boss: null,
  doors: {},            // { N:{open,locked}, ... }
  well: { x: 446, y: 152, glow: 0 },
  oldTree: { x: 132, y: 296 },   // 이스터에그 ① — 늙은 나무 밑동
  gap: { x: 414, y: 26 },        // 이스터에그 ② — 숲 맨 위, 나무 사이의 틈
  sawDoc: false,
  creepyOn: false,
  wellUsed: false, fallT: 0, landT: 0,
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

function say(lines, cb) {
  talk.q = lines.slice(); talk.cb = cb || null;
  talk.back = G.inForest ? 'forest' : 'play';
  G.mode = 'talk';
  showLine();
}
function showLine() {
  const l = talk.q[0];
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
  if (G.mode === 'title')  { openModeSelect(); return; }
  if (G.mode === 'modesel') return;            // 모드는 직접 골라야 넘어갑니다
  if (G.mode === 'creepy') return;             // 이건 건너뛸 수 없습니다
  if (G.mode === 'dead')  { retry(); return; }
  if (G.mode === 'talk')  { advanceTalk(); return; }
  if (G.mode === 'note')  { closeNote(); return; }
  if (G.mode === 'doc')   { closeDoc(); return; }
  if (G.mode === 'play' || G.mode === 'forest') interact();
}

/* ═══════════ 시작 / 초기화 ════════════════════════════ */

/* 시작하기 → 모드 선택. 로고는 그대로 두고 아래쪽만 바뀝니다. */
function openModeSelect() {
  Sfx.unlock();
  $('startbtn').classList.add('hidden');
  $('besttimes').classList.add('hidden');
  $('modesel').classList.remove('hidden');
  G.mode = 'modesel';
}
function closeModeSelect() {
  $('modesel').classList.add('hidden');
  $('startbtn').classList.remove('hidden');
  renderBestTimes();
  G.mode = 'title';
}

/* timeAttack = true  : 시계가 돌고 기록이 남습니다. 죽으면 처음부터.
   timeAttack = false : 시계 없이 천천히. 죽으면 그 방에서 다시 시작합니다. */
function startGame(timeAttack = true) {
  G.timeAttack = timeAttack !== false;
  $('modesel').classList.add('hidden');
  $('startbtn').classList.remove('hidden');
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('timerbox').classList.toggle('hidden', !G.timeAttack);
  Sfx.unlock();
  Sfx.preloadDungeonBgm();   // 우물에 떨어질 때 끊기지 않도록 미리 디코딩해 둡니다
  if (G.timeAttack) startRun();
  else { RUN.running = false; RUN.elapsed = 0; }
  loadForest();
}

/* 사망 처리 — 모드에 따라 갈립니다 */
function retry() {
  if (G.timeAttack) resetRun();
  else respawn();
}

/* 일반 모드 : 죽은 방을 처음 상태로 되돌리고 체력을 채워 다시 넣어 줍니다 */
function respawn() {
  $('dead').classList.add('hidden');
  ['subtitle', 'prompt', 'noteoverlay'].forEach(id => $(id).classList.add('hidden'));
  G.bullets = []; G.fx = []; G.pickups = []; G.clouds = []; G.rings = [];
  G.flash = 0; G.shake = 0; G.glare = 0;
  P.hp = P.max; P.dead = false; P.inv = BALANCE.invFrames; P.slow = 0;
  Sfx.dungeonBgmDuck(false);   // 보스전 전이라면 브금 볼륨을 되돌립니다 (보스전엔 이미 꺼져 있어 무해)
  updateHud();
  if (G.room) loadRoom(G.room, 'W');
  else loadForest();
}

/* 죽으면 진행 상황을 전부 버리고 타이틀로 돌아갑니다 */
function resetRun() {
  stopRun();
  G.keys = 0; G.doorKeys = 0; G.gateOpen = false; G.bossDead = false;
  G.finalKey = false;
  G.visited = new Set(); G.st = {}; G.seenGlitch = false;
  G.bullets = []; G.foes = []; G.fx = []; G.pickups = []; G.pots = []; G.clouds = [];
  G.rings = []; G.glare = 0;
  G.chest = null; G.floorKey = null; G.boss = null; G.doors = {};
  G.flash = 0; G.shake = 0;
  P.hp = P.max; P.dead = false; P.inv = 0; P.slow = 0;
  RUN.elapsed = 0;
  ['dead', 'subtitle', 'prompt', 'noteoverlay', 'hud'].forEach(id => $(id).classList.add('hidden'));
  Sfx.ambientStop(); Sfx.dungeonBgm(false);
  setDate(0); updateHud(); updateTimer();
  renderBestTimes();
  $('modesel').classList.add('hidden');
  $('startbtn').classList.remove('hidden');
  $('title').classList.remove('hidden');
  G.mode = 'title';
}

$('startbtn').addEventListener('click', openModeSelect);
$('msback').addEventListener('click', closeModeSelect);
document.querySelectorAll('.modebtn').forEach(b =>
  b.addEventListener('click', () => startGame(b.dataset.mode === 'time')));
$('retrybtn').addEventListener('click', retry);
$('againbtn').addEventListener('click', () => location.reload());

/* ═══════════ 지상 ═════════════════════════════════════ */
function loadForest() {
  G.inForest = true; G.room = null; G.depth = 0;
  G.bullets = []; G.foes = []; G.fx = []; G.pickups = []; G.pots = []; G.clouds = [];
  G.rings = []; G.glare = 0;
  G.chest = null; G.floorKey = null; G.boss = null; G.doors = {};
  P.slow = 0; P.x = 52; P.y = H / 2; P.dir = 'right'; P.inv = 40; P.dead = false;
  $('dead').classList.add('hidden');
  G.floor = bakeForest(W, H, TS);
  G.butterflies = Array.from({ length: 7 }, () => ({
    x: 60 + Math.random() * (W - 140), y: 40 + Math.random() * (H - 90),
    a: Math.random() * 6.28, s: .3 + Math.random() * .3,
    c: OBANG_LIST[(Math.random() * 5) | 0], gl: 0
  }));
  G.well.glow = 0; G.wellUsed = false;
  Sfx.ambient('forest');
  setDate(0);
  updateHud();
  say(FOREST.intro);
  talk.back = 'forest';
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
function earnedDoorKeys() {
  let n = 0;
  for (const id in MAP)
    if (MAP[id].clear === 'doorKey' && G.st[id] && G.st[id].rewarded) n++;
  return n;
}
const DOOR_KEYS_NEEDED = 2;
const syncKeys = () => { G.doorKeys = earnedDoorKeys(); };

/* 일반 모드에서 아직 밟지 않은 방 */
const exploreDone = () => EXPLORE_ROOMS.filter(id => G.visited.has(id)).length;
const exploreAll  = () => exploreDone() >= EXPLORE_ROOMS.length;

/* 관문을 열 수 있는 상태인가 */
function gateReady() {
  syncKeys();
  if (G.doorKeys < DOOR_KEYS_NEEDED) return false;
  return G.timeAttack ? true : exploreAll();
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
  G.bullets = []; G.fx = []; G.pickups = []; G.clouds = []; G.rings = [];
  G.foes = []; G.pots = []; G.chest = null; G.floorKey = null; G.boss = null;
  G.glare = 0;
  P.inv = 40; P.slow = 0; P.dead = false;
  $('dead').classList.add('hidden');

  G.floor = bakeDungeonFloor(W, H, TS, hash(id), r.depth);
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

  const first = !G.visited.has(id);
  G.visited.add(id);
  setDate(G.visited.size);            // 방을 새로 밟을 때마다 날짜가 뛴다
  updateHud();                        // 탐사 진행도(일반 모드) 갱신

  if (Sfx.started && id === 'start') Sfx.ambient('dungeon');

  const after = r.boss && !G.bossDead ? queueBoss : null;
  if (first && r.intro && r.intro.length) say(r.intro, after);
  else if (after) after();
  else G.mode = 'play';
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function updateTimer() { $('timertext').textContent = fmtTime(runTime()); }

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

function spawnFoe(type, x, y) {
  const d = FOE[type] || FOE.shroom;
  G.foes.push({
    type, x, y, r: d.r,
    hp: BALANCE[d.hp], sp: BALANCE[d.sp],
    cd: 40 + Math.random() * 90,
    wind: 0, dash: 0, dvx: 0, dvy: 0, warp: 0,
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
      spawnFoe('mini', nx, ny);
    }
  }
}

/* 포자 구름 — 안에 있으면 이동이 느려집니다 */
function dropSpore(x, y) {
  G.clouds.push({ x, y, r: 26, life: 210, max: 210, seed: Math.random() * 6.28 });
}

function queueBoss() {
  G.mode = 'boss-intro'; G.bossIntroT = 0;
  Sfx.bossRoar(); G.shake = 24; G.flash = 1;
  glare(1);
  G.rings = [];
  Sfx.ambientStop();
  Sfx.dungeonBgm(false);   // 던전 탐사 브금은 여기까지 — 보스전은 무음/효과음 위주로
}

function makeBoss() {
  G.boss = {
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

function interact() {
  if (nearCreepyGap()) { beginCreepy(); return; }
  if (nearOldTree()) { openDoc(); return; }
  if (nearWell() && !G.wellUsed) {
    G.wellUsed = true;
    $('prompt').classList.add('hidden');   // 대사·추락 내내 상호작용 프롬프트가 남아있지 않도록
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
    if (G.keys < 1) { say([{ t: '잠겨 있다. 열쇠가 없다.', w: false }]); return; }
    G.keys--; G.chest.open = true; stateOf(G.room).chestOpen = true;
    updateHud(); Sfx.chest(); G.shake = 8;
    const heal = G.chest.heal || 0;
    const done = () => {
      if (heal) {
        for (let i = 0; i < heal; i++)
          G.pickups.push({ k: 'heart', x: G.chest.x + (i - (heal - 1) / 2) * 22,
                           y: G.chest.y - 22, bob: i });
        say([{ t: '상자 안쪽에서 온기가 새어 나온다. 조금 낫는 기분이다.', w: false }]);
      }
    };
    if (G.chest.note) openNote(NOTES[G.chest.note], done);
    else { Sfx.pickup(); done(); }
    return;
  }
  const gd = nearLockedGate();
  if (gd) {
    /* 관문 열쇠는 소모되지 않습니다 — 두 개를 모았다면 언제 눌러도 열립니다 */
    if (G.doorKeys < DOOR_KEYS_NEEDED) {
      say([{ t: `관문 열쇠 ${G.doorKeys} / ${DOOR_KEYS_NEEDED} — 아직 모자란다.`, sys: true }]);
    } else if (!gateReady()) {
      // 일반 모드 : 아직 둘러보지 않은 방이 남아 있습니다
      say([
        { t: `열쇠는 둘 다 꽂혔는데 잠금장치가 돌지 않는다. **아직 밟지 않은 길이 있다.**`, w: true },
        { t: `탐사 ${exploreDone()} / ${EXPLORE_ROOMS.length}`, sys: true }
      ]);
    } else {
      G.gateOpen = true;
      buildDoors(G.room); updateHud();
      Sfx.door(); G.shake = 10;
      say([{ t: '잠금장치가 풀린다. 안쪽 길이 열렸다.', w: false }]);
    }
    return;
  }
  if (nearFinalLock()) {
    if (!G.finalKey) {
      say([{ t: '잠겨 있다. 아직 열쇠가 없다.', w: false }]); return;
    }
    updateHud();
    say(ENDING_LINES, beginEnding);
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
  Sfx.chest();
}
function closeDoc() {
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
}
function bumpKeys(sel) {
  const el = $(sel); el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}

function hurt(n) {
  if (P.inv > 0 || P.dead) return;
  P.hp -= n; P.inv = BALANCE.invFrames;
  Sfx.hurt(); G.shake = 11; G.flash = Math.max(G.flash, .5);
  updateHud();
  const hs = $('hearts').children[Math.max(0, P.hp)];
  if (hs) { hs.classList.add('hit'); setTimeout(() => hs.classList.remove('hit'), 320); }
  if (P.hp <= 0) {
    P.hp = 0; P.dead = true; G.mode = 'dead';
    stopRun();                       // 기록은 저장하지 않습니다
    $('deadtime').textContent = fmtTime(RUN.elapsed);
    // 일반 모드에서는 시간을 재지 않으니 기록 문구도 보여 주지 않습니다
    $('dead').classList.toggle('casual', !G.timeAttack);
    $('retrybtn').textContent = G.timeAttack ? '처음부터 다시 (R)' : '이어서 다시 (R)';
    $('dead').classList.remove('hidden');
    Sfx.flatline(true); Sfx.dungeonBgmDuck(true);   // 플랫라인 비프가 묻히지 않도록 브금을 낮춥니다
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
  if (!G.seenGlitch && !big) {
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

/* 이펙트 · 충격파 · 섬광은 보스 연출 중에도 계속 돌아야 해서 따로 뺐습니다 */
function tickFx() {
  G.fx = G.fx.filter(f => {
    f.life--;
    if (f.k === 'p') { f.x += f.vx; f.y += f.vy; f.vx *= .92; f.vy *= .92; }
    else if (f.k === 'suck') {            // 눈으로 빨려 들어가는 빛 알갱이
      f.x += (f.tx - f.x) * .17;
      f.y += (f.ty - f.y) * .17;
    }
    return f.life > 0;
  });
  G.rings = G.rings.filter(r => {
    r.life--;
    const k = 1 - r.life / r.maxLife;
    r.r = 6 + (r.max - 6) * (1 - Math.pow(1 - k, 2.4));   // 처음에 확 퍼지고 끝에서 느려짐
    return r.life > 0;
  });
  if (G.glare > 0) G.glare = Math.max(0, G.glare - .055);
}

function puff(x, y, c) {
  for (let i = 0; i < 6; i++)
    G.fx.push({ k: 'p', x, y, vx: (Math.random() - .5) * 2.4, vy: (Math.random() - .5) * 2.4,
                life: 20, max: 20, c });
}

/* ═══════════ 업데이트 ═════════════════════════════════ */
function update() {
  G.t++;
  if (G.shake > 0) G.shake *= .86;
  if (G.flash > 0) G.flash = Math.max(0, G.flash - .035);

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
  if (G.mode === 'fall') {
    G.fallT++;
    if (G.fallT > FALL_DUR) { G.mode = 'landing'; G.landT = 0; }
    return;
  }
  if (G.mode === 'landing') {
    G.landT++;
    // 암전을 잠깐 붙잡아 뒀다가, 풀리는 순간 던전으로 들어서며 브금의
    // "두둥"이 터집니다 — 우물 속으로 완전히 들어선 그 순간입니다.
    if (G.landT === LAND_BLACK) {
      loadRoom('start', 'W');
      Sfx.dungeonBgm(true);
      G.shake = Math.max(G.shake, 9); G.flash = Math.max(G.flash, .6);
    }
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
  if (G.mode !== 'play' && G.mode !== 'forest') return;

  const forest = G.inForest;

  /* ── 이동 ─────────────────────────────────────────── */
  let mx = 0, my = 0;
  if (down('a', 'A', 'ㅁ')) mx--;
  if (down('d', 'D', 'ㅇ')) mx++;
  if (down('w', 'W', 'ㅈ')) my--;
  if (down('s', 'S', 'ㄴ')) my++;
  if (!mx && !my && forest) {          // 숲에선 방향키로도 이동
    if (key.ArrowLeft) mx--; if (key.ArrowRight) mx++;
    if (key.ArrowUp) my--;   if (key.ArrowDown) my++;
  }
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
    P.dir = mx ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'down' : 'up');
    const stepEvery = Math.round(20 * BALANCE.playerSpeed / spd);
    if (++P.stepT % stepEvery === 0) Sfx.step();
  } else {
    P.walkAmt *= 0.78;                          // 멈춤 → 부드럽게 리듬 가라앉기
    P.anim = 0;
  }

  clampPlayer(forest);

  if (P.inv > 0) P.inv--;
  if (P.fireCd > 0) P.fireCd--;

  /* ── 사격 ─────────────────────────────────────────── */
  if (!forest && P.fireCd <= 0) {
    let ax = 0, ay = 0;
    for (const k in AIM) if (key[k]) { ax += AIM[k][0]; ay += AIM[k][1]; }
    if (!ax && !ay && mouse.down) { ax = mouse.x - P.x; ay = mouse.y - P.y; }
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
    if (b.x < TS - 2 || b.x > W - TS + 2 || b.y < TS - 2 || b.y > H - TS + 2) {
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
        B.kx += b.vx / l * 1.6; B.ky += b.vy / l * 1.6;
        spark(b.x, b.y, -b.vx, -b.vy);
        G.shake = Math.max(G.shake, 2.5); Sfx.hit();
        if (B.hp <= 0) killBoss();
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
    const dx = P.x - f.x, dy = P.y - f.y, d = Math.hypot(dx, dy) || 1;
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
    f.x = Math.max(TS + f.r, Math.min(W - TS - f.r, f.x));
    f.y = Math.max(TS + f.r, Math.min(H - TS - f.r, f.y));
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
  if (!G.inForest && !G.boss && !G.foes.length && !stateOf(G.room).cleared)
    onRoomCleared();

  if (G.boss) updateBoss();

  /* ── 픽업 ─────────────────────────────────────────── */
  if (G.floorKey) {
    G.floorKey.bob += .07;
    if (Math.hypot(P.x - G.floorKey.x, P.y - G.floorKey.y) < 20) {
      G.floorKey = null; stateOf(G.room).keyTaken = true;
      G.keys++; updateHud(); Sfx.keyGet(); bumpKeys('keys');
      say([{ t: '오방색 매듭이 달린 낡은 열쇠. …왜 이렇게 익숙하지.', w: true }]);
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
    say([{ t: '흩어진 자리에 열쇠가 남아 있다.', w: false }]);
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
    if (gateReady()) pr = '관문 열기';
    else if (G.doorKeys < DOOR_KEYS_NEEDED) pr = `관문 잠김 · 열쇠 ${G.doorKeys}/${DOOR_KEYS_NEEDED}`;
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
  if (B.hp <= 0) { killBoss(); return; }
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
        const n = ph === 1 ? 8 : 12, off = Math.random() * 6.28;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          foeShot(B.x, B.y, Math.cos(a), Math.sin(a), BALANCE.spore + (ph - 1) * .25);
        }
        Sfx.glitch();
        G.shake = Math.max(G.shake, 12); glare(.75);
        shockRing(B.x, B.y, 230, '201,160,255', 6, 32);
      }
    }
  } else {
    B.x += dx / d * sp; B.y += dy / d * sp;
    if (--B.cd <= 0) {
      B.cd = ph === 1 ? 150 : ph === 2 ? 120 : 96;
      B.wind = 32;
      B.windKind = (ph >= 2 && Math.random() < .45) ? 'dash' : 'ring';
    }
  }
  if (ph === 3 && B.t % 11 === 0) {
    B.spiralA += .78;
    foeShot(B.x, B.y, Math.cos(B.spiralA), Math.sin(B.spiralA), 1.5);
  }
  B.x = Math.max(TS + B.r, Math.min(W - TS - B.r, B.x));
  B.y = Math.max(TS + B.r, Math.min(H - TS - B.r, B.y));
  if (d < B.r * .72 + P.r) hurt(1);
}

function killBoss() {
  const B = G.boss;
  glitchDeath(B.x, B.y, true);
  // 눈이 터지는 순간 — 충격파가 네 겹으로 퍼지고 화면이 하얗게 날아갑니다
  glare(1.4);
  shockRing(B.x, B.y, 420, '255,255,255', 10, 52);
  shockRing(B.x, B.y, 320, '125,227,200', 7, 46);
  shockRing(B.x, B.y, 230, '150,60,220', 6, 40);
  setTimeout(() => { if (G.mode === 'play' || G.mode === 'talk') {
    glare(.9); G.shake = 18; shockRing(B.x, B.y, 300, '255,255,255', 6, 40);
  } }, 260);
  G.shake = 32; G.boss = null; G.bossDead = true;
  Sfx.ambient('dungeon');
  G.foes = [];
  G.bullets = G.bullets.filter(b => b.mine);
  stateOf(G.room).cleared = true;
  buildDoors(G.room);
  setTimeout(() => {
    G.finalKey = true; updateHud(); Sfx.keyGet(); bumpKeys('gatekeys');
    say(BOSS_DEAD_LINES);
  }, 700);
}

/* ═══════════ 렌더 ═════════════════════════════════════ */
function render() {
  g.save();
  if (G.shake > .4) g.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
  g.fillStyle = '#040408'; g.fillRect(-20, -20, W + 40, H + 40);
  // 추락·착지 중에는 지상/던전 화면이 뒤로 비쳐 보이면 안 되므로 아예 건너뜁니다
  if (G.mode !== 'fall' && G.mode !== 'landing') {
    if (G.floor) g.drawImage(G.floor, 0, 0);
    if (G.inForest) renderForest(); else renderDungeon();
  }
  g.restore();

  if (G.mode === 'fall') renderFall();
  if (G.mode === 'landing') { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
  if (!G.inForest && G.mode !== 'fall' && G.mode !== 'landing') drawMinimap();

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

/* 늙은 나무 밑동에 낀 서류 한 장 — 가까이 가면 살짝 밝아집니다 */
function drawOldTreeDoc() {
  const o = G.oldTree, near = nearOldTree();
  g.save();
  g.globalAlpha = near ? .95 : .55;
  // 접힌 종이 귀퉁이
  g.fillStyle = '#d8d4c6';
  g.beginPath();
  g.moveTo(o.x - 5, o.y + 4); g.lineTo(o.x + 5, o.y + 2);
  g.lineTo(o.x + 4, o.y + 9); g.lineTo(o.x - 6, o.y + 10);
  g.closePath(); g.fill();
  g.fillStyle = '#a9a496';
  g.fillRect(o.x - 5, o.y + 7, 9, 1);
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
    const date = DATES[Math.min(G.visited.size, DATES.length - 1)].split(' / ').slice(1).join(' / ');
    g.save();
    g.globalAlpha = .5; g.fillStyle = '#b8352c';
    g.font = 'bold 12px DungGeunMo, ui-monospace, monospace'; g.textAlign = 'center';
    g.fillText(date, W / 2, H - 11);
    if (R.boss) {
      g.globalAlpha = .2; g.font = 'bold 10px DungGeunMo, ui-monospace, monospace';
      for (let i = 0; i < 12; i++)
        g.fillText('5 / 20', 40 + ((i * 97) % (W - 80)), TS + 22 + ((i * 53) % (H - TS * 2 - 30)));
    }
    g.restore();
  }

  drawFloorPlants(g, G.plants, G.t);
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
  if (G.boss) drawBossLight();
  G.foes.forEach(drawFoe);
  if (G.boss) drawBoss();
  drawPlayer();
  drawRings();

  G.bullets.forEach(b => {
    g.save();
    if (b.mine) {
      g.fillStyle = '#dff6ee';
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(125,227,200,.55)';
      g.beginPath(); g.arc(b.x, b.y, b.r + 2.5, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = 'rgba(194,53,44,.4)';
      g.beginPath(); g.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e2604f';
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  });

  G.fx.forEach(f => {
    const k = f.life / f.max;
    if (f.k === 'p') {
      g.globalAlpha = k; g.fillStyle = f.c;
      g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3); g.globalAlpha = 1;
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
      g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
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
      g.shadowColor = 'rgba(125,227,200,.85)'; g.shadowBlur = 9;
      f.chars.forEach(c => {
        const cx = f.x + c.dx * spread, cy = f.y + c.dy * spread;
        g.lineWidth = 3; g.strokeStyle = 'rgba(4,8,10,.85)';
        g.strokeText(c.c, cx, cy);
        g.fillStyle = '#c8f7ec';
        g.fillText(c.c, cx, cy);
      });
      g.restore();
    }
  });

  // 포자에 닿아 느려진 동안은 화면 가장자리가 누렇게 물듭니다
  if (P.slow > 0) {
    g.save();
    g.globalAlpha = Math.min(1, P.slow / BALANCE.slowFrames) * .5;
    const sg = g.createRadialGradient(P.x, P.y, 30, P.x, P.y, W * .55);
    sg.addColorStop(0, 'rgba(190,180,70,0)');
    sg.addColorStop(1, 'rgba(170,160,60,.55)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    g.restore();
  }

  // 어둠 — 주인공 주변만 밝다
  drawNightOverlay(g, W, H, P.x, P.y, .40 + G.depth * .022, 150);
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
        const short = G.doorKeys < DOOR_KEYS_NEEDED;
        g.fillStyle = short ? '#e3b23c' : (gateReady() ? '#7de3c8' : '#c2352c');
        g.font = 'bold 7px DungGeunMo, ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(short ? `${G.doorKeys}/${DOOR_KEYS_NEEDED}`
                         : (gateReady() ? 'OPEN' : `${exploreDone()}/${EXPLORE_ROOMS.length}`),
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
  });
  g.restore();
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
    g.globalAlpha = .35 + Math.sin(G.t * .05) * .2;
    g.fillStyle = '#e3b23c';
    g.beginPath(); g.arc(c.x, c.y - 2, 22, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  g.strokeStyle = '#2c1d0e'; g.lineWidth = 1.5;
  g.strokeRect(c.x - 18, c.y - 6, 36, 20);
  g.restore();
}

function drawKey(x, y) {
  g.save();
  g.globalAlpha = .3; g.fillStyle = '#e3b23c';
  g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = '#e3b23c'; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.arc(x - 3, y - 3, 4, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + 7, y + 7); g.stroke();
  g.beginPath(); g.moveTo(x + 5, y + 7); g.lineTo(x + 7, y + 4); g.stroke();
  drawMaedeup(g, x - 7, y + 8, 5, '#c2352c');
  g.restore();
}

/* ── 캐릭터 ────────────────────────────────────────── */
function drawPlayer() {
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
  g.beginPath(); g.ellipse(P.x, P.y + 15, 12 / shadowSquish, 4.5 / shadowSquish, 0, 0, Math.PI * 2); g.fill();

  if (P.inv > 0 && (G.t >> 2) % 2) g.globalAlpha = .35;

  const seq = HERO[P.dir] || HERO.down;
  const idx = seq[Math.floor(P.anim) % seq.length];
  const w = 30, h = Math.round(30 * HERO.fh / HERO.fw);

  if (IMG.hero) {
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

/* 포자 구름 — 노르스름한 홀씨가 뭉게뭉게 퍼집니다 */
function drawClouds() {
  G.clouds.forEach(c => {
    const k = c.life / c.max;
    const rr = c.r * (0.55 + (1 - k) * 0.45);
    const fade = Math.min(1, k * 3);             // 사라질 때만 옅어집니다
    g.save();
    // 어두운 던전에서도 눈에 띄도록 발광 합성으로 얹습니다
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .62 * fade;
    const cg = g.createRadialGradient(c.x, c.y, 2, c.x, c.y, rr);
    cg.addColorStop(0, 'rgba(226,214,120,.95)');
    cg.addColorStop(.55, 'rgba(170,158,70,.55)');
    cg.addColorStop(1, 'rgba(120,110,50,0)');
    g.fillStyle = cg;
    g.beginPath(); g.arc(c.x, c.y, rr, 0, Math.PI * 2); g.fill();
    // 가장자리 테두리 — 범위를 분명히 알 수 있게
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = .38 * fade;
    g.strokeStyle = '#cdc06a'; g.lineWidth = 1;
    g.beginPath(); g.arc(c.x, c.y, rr, 0, Math.PI * 2); g.stroke();
    // 떠다니는 홀씨
    g.globalAlpha = .75 * fade;
    g.fillStyle = '#e4dc8c';
    for (let i = 0; i < 6; i++) {
      const a = c.seed + i * 1.05 + G.t * .012;
      const d = rr * (.3 + (i % 3) * .22);
      g.fillRect((c.x + Math.cos(a) * d) | 0, (c.y + Math.sin(a * 1.3) * d * .7) | 0, 2, 2);
    }
    g.restore();
  });
}

const FOE_GLOW = {
  shroom: 'rgba(130,60,150,.30)', spitter: 'rgba(90,150,90,.30)',
  sporer: 'rgba(180,170,60,.34)', splitter: 'rgba(140,80,210,.34)',
  mini:   'rgba(140,80,210,.30)', charger: 'rgba(220,90,50,.34)',
  blinker:'rgba(70,200,180,.34)'
};

function drawFoe(f) {
  const dfn = FOE[f.type] || FOE.shroom;
  const bob = Math.sin(f.bob) * 2;
  const s = f.type === 'mini' ? 18 : f.type === 'splitter' ? 32 : f.type === 'shroom' ? 26 : 30;
  const eyeC = dfn.eye;

  // 점멸체는 사라지는 동안 반쯤 비칩니다
  const warpK = f.warp ? Math.abs(Math.sin(f.warp * .32)) * .5 : 1;

  g.save();
  g.globalAlpha = warpK;
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath(); g.ellipse(f.x, f.y + 11, s * .38, s * .15, 0, 0, Math.PI * 2); g.fill();

  g.globalAlpha = (.5 + Math.sin(f.bob * .7) * .12) * warpK;
  const ag = g.createRadialGradient(f.x, f.y + 4, 2, f.x, f.y + 4, s * .8);
  ag.addColorStop(0, FOE_GLOW[f.type] || FOE_GLOW.shroom);
  ag.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = ag;
  g.beginPath(); g.arc(f.x, f.y + 4, s * .8, 0, Math.PI * 2); g.fill();
  g.globalAlpha = warpK;

  // 돌진체 : 웅크리는 동안 붉은 고리가 조여듭니다 (피할 신호)
  if (f.wind > 0) {
    const k = 1 - f.wind / BALANCE.chargerWind;
    g.save();
    g.globalAlpha = .35 + k * .5;
    g.strokeStyle = '#ff7a45'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(f.x, f.y + 2, 30 - k * 16, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  // 피격 중에는 주인공처럼 깜빡인다
  if (f.flash > 0 && (G.t >> 1) % 2) g.globalAlpha = .45 * warpK;

  g.translate(f.x, f.y + bob);
  // 돌진 예비 동작 때는 뒤로 움츠렸다가 튀어 나갑니다
  if (f.wind > 0) { const k = 1 - f.wind / BALANCE.chargerWind; g.scale(1 + k * .18, 1 - k * .14); }
  if (dfn.hue) g.filter = `hue-rotate(${dfn.hue}deg) saturate(1.5) brightness(.92)`;
  if (IMG.mob) g.drawImage(IMG.mob, -s / 2, -s / 2 - 2, s, s);
  else { g.fillStyle = '#4a4055'; g.fillRect(-10, -10, 20, 20); }
  g.filter = 'none';

  // 분열체 : 몸통에 갈라질 금이 가 있습니다
  if (f.type === 'splitter') {
    g.strokeStyle = 'rgba(20,10,30,.65)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, -s / 2); g.lineTo(-2, 0); g.lineTo(1, s / 2 - 2); g.stroke();
  }

  const ex = s * .155, ey = s * .105;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = (.75 + Math.sin(G.t * .07 + f.bob) * .25) * warpK;
  g.fillStyle = eyeC;
  [-1, 1].forEach(sd => { g.beginPath(); g.arc(sd * ex, ey, 2.4, 0, Math.PI * 2); g.fill(); });
  if (f.flash > 0) {
    g.globalAlpha = .6; g.fillStyle = '#ffffff';
    g.fillRect(-s / 2, -s / 2 - 2, s, s);
  }
  g.restore();
}

/* 퍼져 나가는 충격파 고리 */
function drawRings() {
  if (!G.rings.length) return;
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
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.ellipse(B.x, B.y + 30, 34, 10, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = .25 + wind * .5;
  const ag = g.createRadialGradient(B.x, B.y, 10, B.x, B.y, 60 + wind * 26);
  ag.addColorStop(0, 'rgba(150,60,220,.55)'); ag.addColorStop(1, 'rgba(150,60,220,0)');
  g.fillStyle = ag;
  g.beginPath(); g.arc(B.x, B.y, 62 + wind * 26, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  if (B.flash > 0 && (G.t >> 1) % 2) g.globalAlpha = .5;
  g.translate(B.x, B.y); g.scale(sc, sc);
  const w = 96, h = 87;
  if (IMG.eye) g.drawImage(IMG.eye, -w / 2, -h / 2, w, h);
  else { g.fillStyle = '#c33'; g.beginPath(); g.arc(0, 0, 34, 0, 6.3); g.fill(); }
  if (B.flash > 0) {
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = .5;
    g.fillStyle = '#ffffff'; g.fillRect(-w / 2, -h / 2, w, h);
  }
  g.restore();

  const bw = 220, bx = (W - bw) / 2, by = H - 18;
  g.save();
  g.fillStyle = 'rgba(8,8,14,.75)'; g.fillRect(bx - 2, by - 2, bw + 4, 9);
  g.fillStyle = '#3a1c1c'; g.fillRect(bx, by, bw, 5);
  g.fillStyle = '#c2352c'; g.fillRect(bx, by, bw * Math.max(0, B.hp / B.max), 5);
  drawSaekdong(g, bx, by - 4, bw, 2, false, .55);
  g.restore();
}

/* ── 추락 ──────────────────────────────────────────── */
/* 우물 추락 연출 — 화면 중앙으로 빨려 들어가는 소용돌이 우물 통로.
   지상 배경(renderForest)이 이미 그려진 위에, 안쪽으로 좁아지는 돌벽
   고리들 + 회전하는 잔상 줄무늬 + 점점 작아지며 구르는 주인공을 겹칩니다.
   예전(168프레임)보다 살짝 느리게 떨어지도록 늘렸습니다.

   이 소용돌이가 다 끝나면(FALL_DUR) 'landing' 단계로 넘어가 화면을
   잠깐 암전으로 붙잡아 두고, 풀리는 순간 던전으로 들어서며 브금의
   "두둥"이 겹치도록 맞춥니다(update() 의 LAND_BLACK 지점 참고). */
const FALL_DUR = 185;
const LAND_BLACK = 22;

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

  // 5) 아주 짧게 스친 글리치 — 반전의 복선
  if (t === 70) {
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

/* ═══════════ 엔딩 ═════════════════════════════════════ */
function beginEnding() {
  G.mode = 'ending';
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
  }

  $('prompt').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('ending').classList.remove('hidden');
  Sfx.ambientStop(); Sfx.dungeonBgm(false); Sfx.flatline(true);
  $('blackout').classList.add('on');
  G.flash = 1;
  setTimeout(() => { $('sysline').classList.add('on'); typeSys(0); }, 2500);
}
/* 시스템 문구를 한 줄씩 타이핑합니다 (엔딩 도입부·마지막 각성 로그 공용) */
function typeSysLines(lines, i, done) {
  if (i >= lines.length) { setTimeout(done, 1100); return; }
  const line = lines[i];
  let n = 0;
  $('systext').textContent = '';
  const iv = setInterval(() => {
    n++; $('systext').textContent = line.slice(0, n);
    if (n % 3 === 0) Sfx.beep(.03);
    if (n >= line.length) {
      clearInterval(iv);
      setTimeout(() => typeSysLines(lines, i + 1, done), i === lines.length - 1 ? 900 : 700);
    }
  }, 48);
}
function typeSys(i) { typeSysLines(ENDING_SYS, i, openEyes); }
function openEyes() {
  const E = $('ending');
  $('sysline').classList.remove('on');
  Sfx.flatline(false);
  E.classList.add('open');

  const lid = (v, sec) => {
    E.style.setProperty('--lidT', sec + 's');
    E.style.setProperty('--lid', v);
  };
  const at = (ms, fn) => setTimeout(fn, ms);

  /* ① 눈을 뜨는 리듬 — 실눈 → 깜빡 → 반쯤 → 깜빡 → 완전히.
        초점이 안 맞은 채 조명이 확 밀려들었다가 서서히 또렷해집니다. */
  lid(.26, .55);
  E.classList.add('wash');
  at(700,  () => { lid(.04, .26); Sfx.beep(.03); });
  at(1150, () => lid(.48, .6));
  at(1950, () => { lid(.10, .28); Sfx.beep(.03); });
  at(2400, () => lid(1, 2.8));
  at(2600, () => E.classList.add('focus'));      // 초점이 맞기 시작
  at(3200, () => E.classList.add('zoomout'));    // 카메라가 천천히 물러남

  // 심박 — 처음엔 느리다가 깨어나며 조금씩 또렷해집니다
  let beats = 0;
  const hb = setInterval(() => { Sfx.beep(.05); if (++beats > 30) clearInterval(hb); }, 900);

  /* ② 한동안 연구실을 그대로 보여줍니다 — 설명 없이 보게 두는 시간 */
  const T1 = 11500;
  at(T1, () => {
    clearInterval(hb);
    const st = $('monstatus');
    if (st) { st.textContent = 'AWAKE'; st.classList.add('alert'); }
    $('alertwash').classList.add('on');
    Sfx.glitch();
    at(900, () => {
      $('sysline').classList.add('on');
      typeSysLines(ENDING_LAST, 0, () => {
        $('sysline').classList.remove('on');
        at(700, () => $('endcard').classList.add('on'));
      });
    });
  });
}

/* ═══════════ 루프 ═════════════════════════════════════
   모든 움직임이 "1프레임당 몇 픽셀" 로 되어 있어서, 예전처럼 화면
   주사율에 그대로 맡기면 120Hz·144Hz 모니터에서 게임이 2배 넘게 빨라집니다.
   그래서 논리 갱신은 항상 초당 60번으로 고정하고, 화면만 주사율대로 그립니다. */
const STEP = 1000 / 60;
let lastT = 0, acc = 0;

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
  while (acc >= STEP && steps < 5) { update(); acc -= STEP; steps++; }
  if (acc > STEP * 5) acc = 0;

  if (G.mode !== 'ending') render();
  if (RUN.running) updateTimer();
}

/* 디버그용 (개발/테스트 편의) */
window.__game = { G, P, RUN, MAP, BALANCE, loadRoom, loadForest, say, beginEnding,
                  startGame, openModeSelect, closeModeSelect, retry, respawn, hurt,
                  resetRun, loadRecords, fmtTime,
                  EXPLORE_ROOMS, DOOR_KEYS_NEEDED, gateReady, exploreDone, exploreAll,
                  earnedDoorKeys, beginCreepy, queueBoss, makeBoss,
                  clearRecords: () => { memRecords = []; try { localStorage.removeItem(REC_KEY); } catch (e) {} } };

loadAssets().then(() => { fit(); updateHud(); renderBestTimes(); loop(); });

})();
