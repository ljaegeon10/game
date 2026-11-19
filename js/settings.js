'use strict';
/* ═══════════════════════════════════════════════════════════════
   settings.js — 세부 설정 : 소리(전체 · 배경음악 · 효과음) · 카메라 감도(1인칭) · 상하 반전

   이 기기에 기억합니다 (localStorage 'wellbelow.settings').
   소리 — 모든 소리가 지나가는 길목에 음량 노드를 하나씩 끼움:
     Settings.out(ac)              전체 음량 → 스피커 (ac.destination 대신 여기로 연결)
     Settings.bus(ac, kind, to)    'music' · 'sfx' 음량 → to (같은 ac · to · kind 면 같은 노드)
   카메라 — escape.js(탈출 1인칭) · part2.js(2부)가 마우스 · 손가락으로 둘러볼 때 Settings.look() 을 곱함
   화면 — Settings.open(onClose) : 시작화면 메뉴 「설정」 · 일시정지 메뉴 「설정」
   ═══════════════════════════════════════════════════════════════ */
(() => {
const KEY = 'wellbelow.settings';
const DEF = { master: 1, music: 1, sfx: 1, sens: 1, invertY: false, layout: null, lite: 'auto', fps: 60 };   // fps : 30 · 60 · 0(최대 = 화면 주사율)   // lite : 가벼운 화면 auto | on | off   // layout : 휴대폰 조작 배치 (아래 TouchLayout)
const S = { ...DEF };
try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) for (const k in DEF) if (typeof v[k] === typeof DEF[k]) S[k] = v[k]; } catch (e) {}
if (S.layout && !(S.layout.joy && S.layout.fire && S.layout.btn)) S.layout = null;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

/* ── 소리 길목 ── */
const OUT = new WeakMap(), BUS = [];        // BUS : { ac, kind, node }
const vol = k => k === 'music' ? S.music : k === 'sfx' ? S.sfx : S.master;
const curve = v => v * v;                   // 귀에 고르게 들리게 (밀대 반이면 소리 1/4)
function apply() {
  const set = (node, v, ac) => { try { node.gain.setTargetAtTime(curve(v), ac.currentTime, .03); } catch (e) { node.gain.value = curve(v); } };
  for (const b of BUS) set(b.node, vol(b.kind), b.ac);
  OUTS.forEach(o => set(o.node, S.master, o.ac));
}
const OUTS = [];
function out(ac) {
  let n = OUT.get(ac);
  if (!n) { n = ac.createGain(); n.gain.value = curve(S.master); n.connect(ac.destination); OUT.set(ac, n); OUTS.push({ ac, node: n }); }
  return n;
}
function bus(ac, kind, to) {
  to = to || out(ac);
  let b = BUS.find(x => x.ac === ac && x.kind === kind && x.to === to);
  if (!b) { const node = ac.createGain(); node.gain.value = curve(vol(kind)); node.connect(to); b = { ac, kind, to, node }; BUS.push(b); }
  return b.node;
}

/* ── 화면 ── */
const ROWS = [
  { k: 'master', label: '전체 음량', min: 0, max: 1, step: .05, fmt: v => Math.round(v * 100) + '%' },
  { k: 'music',  label: '배경음악',  min: 0, max: 1, step: .05, fmt: v => Math.round(v * 100) + '%' },
  { k: 'sfx',    label: '효과음',    min: 0, max: 1, step: .05, fmt: v => Math.round(v * 100) + '%' },
  { k: 'sens',   label: '카메라 감도', sub: '1인칭에서 둘러보는 빠르기', min: .3, max: 3, step: .1, fmt: v => v.toFixed(1) + '×' },
];
let el = null, onClose = null, testT = 0;
function build() {
  el = document.createElement('div'); el.id = 'settings'; el.className = 'hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '설정');
  el.innerHTML = `<div class="st-box">
    <div class="pm-obang" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <p class="pm-title">설정</p><p class="pm-sub">SETTINGS · 이 기기에 저장돼요</p>
    ${ROWS.map(r => `<label class="st-row" data-k="${r.k}"><span class="st-l"><b>${r.label}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</span>
      <input type="range" min="${r.min}" max="${r.max}" step="${r.step}"><output></output></label>`).join('')}
    <div class="st-row st-seg"><span class="st-l"><b>프레임</b><small>초당 그리는 장 수 — 게임 속도는 같아요</small></span>
      <div class="st-segs" role="radiogroup" aria-label="프레임">${[[30, '30'], [60, '60'], [0, '최대']].map(([v, l]) => `<button type="button" class="st-segb" role="radio" data-fps="${v}">${l}</button>`).join('')}</div></div>
    <label class="st-row st-check"><span class="st-l"><b>가벼운 화면</b><small id="st-lite-sub">끊기면 저절로 켜져요 — 화면 효과를 줄여 부드럽게</small></span><input type="checkbox" data-k="lite"><output></output></label>
    <div class="st-row st-layout"><span class="st-l"><b>조작 배치</b><small>휴대폰 · 태블릿 — 조이스틱 · 조사 버튼의 위치와 크기</small></span><button class="st-btn" data-act="layout" type="button">바꾸기</button></div>
    <label class="st-row st-check"><span class="st-l"><b>상하 반전</b><small>마우스를 올리면 아래를 봄</small></span><input type="checkbox" data-k="invertY"><output></output></label>
    <div class="st-btns"><button class="st-btn" data-act="reset">기본값</button><button class="st-btn st-main" data-act="close">닫기</button></div>
  </div>`;
  document.body.appendChild(el);
  el.querySelectorAll('.st-row[data-k]').forEach(row => {
    const r = ROWS.find(x => x.k === row.dataset.k), inp = row.querySelector('input'), o = row.querySelector('output');
    inp.addEventListener('input', () => {
      S[r.k] = +inp.value; o.textContent = r.fmt(S[r.k]); apply(); save();
      if (r.k !== 'sens') { clearTimeout(testT); testT = setTimeout(() => { try { if (window.Sfx && Sfx.pickup) (r.k === 'music' ? Sfx.beep || Sfx.pickup : Sfx.pickup)(); } catch (e) {} }, 120); }   // 들어 보기
    });
  });
  el.querySelectorAll('[data-fps]').forEach(b => b.addEventListener('click', () => { S.fps = +b.dataset.fps; save(); sync(); }));
  const lk = el.querySelector('input[data-k=lite]');
  lk.addEventListener('change', () => { S.lite = lk.checked ? 'on' : 'off'; Perf.set(lk.checked); save(); sync(); });
  const ck = el.querySelector('input[data-k=invertY]');
  ck.addEventListener('change', () => { S.invertY = ck.checked; ck.parentNode.querySelector('output').textContent = S.invertY ? '켬' : '끔'; save(); });
  el.querySelector('[data-act=reset]').addEventListener('click', () => { Object.assign(S, DEF); Perf.set(false); sync(); apply(); save(); applyLayout(); });
  el.querySelector('[data-act=close]').addEventListener('click', close);
  el.querySelector('[data-act=layout]').addEventListener('click', () => TL.open());
  el.addEventListener('click', e => { if (e.target === el) close(); });
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(n => el.addEventListener(n, e => e.stopPropagation()));
}
function sync() {
  el.querySelectorAll('.st-row[data-k]').forEach(row => { const r = ROWS.find(x => x.k === row.dataset.k), inp = row.querySelector('input'); inp.value = S[r.k]; row.querySelector('output').textContent = r.fmt(S[r.k]); });
  el.querySelectorAll('[data-fps]').forEach(b => { const on = +b.dataset.fps === S.fps; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const lk = el.querySelector('input[data-k=lite]'); lk.checked = Perf.low; lk.parentNode.querySelector('output').textContent = (Perf.low ? '켬' : '끔') + (S.lite === 'auto' ? ' · 자동' : '');
  const ck = el.querySelector('input[data-k=invertY]'); ck.checked = S.invertY; ck.parentNode.querySelector('output').textContent = S.invertY ? '켬' : '끔';
}
const focusables = () => [...el.querySelectorAll('input, .st-btn, .st-segb')];
function open(cb) {
  if (!el) build();
  onClose = cb || null; sync();
  el.classList.remove('hidden'); document.body.classList.add('settings-open');
  setTimeout(() => focusables()[0].focus(), 0);
}
function close() {
  if (!el || el.classList.contains('hidden')) return;
  el.classList.add('hidden'); document.body.classList.remove('settings-open');
  const f = onClose; onClose = null; if (f) f();
}
const isOpen = () => !!el && !el.classList.contains('hidden');
/* 키 — 게임 · 일시정지 메뉴보다 먼저 (이 파일이 먼저 읽힘). 열려 있으면 여기서만 */
addEventListener('keydown', e => {
  if (!isOpen() || document.body.classList.contains('tledit')) return;
  e.stopImmediatePropagation();
  const k = e.key, f = focusables(), i = f.indexOf(document.activeElement);
  if (k === 'Escape' || e.code === 'KeyP') { e.preventDefault(); if (!e.repeat) close(); return; }
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'Tab') { e.preventDefault(); const d = (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) ? -1 : 1; f[(Math.max(0, i) + d + f.length) % f.length].focus(); return; }
  const a = document.activeElement;
  if ((k === 'Enter' || k === ' ') && a && a.type === 'checkbox') { e.preventDefault(); a.click(); return; }
  if ((k === 'Enter' || k === ' ') && a && (a.classList.contains('st-btn') || a.classList.contains('st-segb'))) { e.preventDefault(); a.click(); return; }
  if ((k === 'ArrowLeft' || k === 'ArrowRight') && a && a.type === 'range') return;   // 밀대는 브라우저가 움직임
  if (k.length === 1 || k === 'Enter') e.preventDefault();
}, true);
addEventListener('keyup', e => { if (isOpen() && !document.body.classList.contains('tledit')) e.stopImmediatePropagation(); }, true);

/* ── 가벼운 화면 (Perf) ──
   120 · 144Hz 화면(갤럭시탭 · 게이밍 노트북)이나 약한 그래픽에서 끊기면 — 화면 효과(색 보정 필터 · 브라운관 줄 · 베젤 그림자 ·
   제목 번짐)를 끄고 3D 장면 해상도를 낮춤 (css body.lowfx · escape.js · part2.js 가 Perf.low 를 봄).
   각 장면의 루프가 그릴 때마다 Perf.frame() — 2초씩 재서 세 번 연달아(6초) 초당 45장이 안 되면 저절로 켬 (설정에서 직접 켜고 끌 수도). */
const Perf = (() => {
  const P = { low: false, set(on) { P.low = !!on; document.documentElement.classList.toggle('lowfx', P.low); }, frame, draw };
  /* 이번 rAF 에 그릴지 — steps : 이번에 게임이 움직인 칸 수(초당 60칸). 60 : 움직인 장만 · 30 : 두 칸마다 한 장 · 0(최대) : 매번 */
  const accSteps = {};
  function draw(key, now, steps) {
    steps = +steps || 0;
    const f = S.fps;
    if (f === 0) { frame(now); return true; }
    if (!steps) return false;
    if (f === 30) { const a = Math.min(4, (accSteps[key] || 0) + steps); if (a < 2) { accSteps[key] = a; return false; } accSteps[key] = a - 2; }
    frame(now); return true;
  }
  let t0 = 0, n = 0, last = 0, bad = 0, hitch = 0;
  function frame(now) {
    if (S.lite !== 'auto' || P.low) return;
    now = now || performance.now();
    if (!t0 || now - last > 300 || document.hidden) { t0 = now; n = 0; hitch = 0; last = now; return; }   // 멈췄다 돌아온 틈은 빼고
    if (now - last > (S.fps === 30 ? 75 : 40)) hitch++;  // 툭 멈춘 장 (60 기준 두 장 반 넘게 걸림) — 평균은 괜찮아도 끊겨 보이는 것
    last = now; n++;
    if (now - t0 < 2000) return;
    const fps = n * 1000 / (now - t0); t0 = now; n = 0;
    bad = fps < (S.fps === 30 ? 24 : 45) || hitch >= 6 ? bad + 1 : 0;   // 30 으로 정했으면 그 기준 · 2초에 6번 넘게 툭툭 멈춰도
    hitch = 0;
    if (bad >= 2) { P.set(true); try { localStorage.setItem('wellbelow.lowfx', '1'); } catch (e) {} }   // 이 기기는 다음에도 가볍게 시작
  }
  let mem = false; try { mem = localStorage.getItem('wellbelow.lowfx') === '1'; } catch (e) {}
  P.set(S.lite === 'on' || (S.lite === 'auto' && mem));
  return P;
})();
window.Perf = Perf;

/* ── 조작 배치 (휴대폰) — 예시 게임 화면 위에서 이동 조이스틱 · 공격 조이스틱 · [조사] 버튼을 끌어 옮기고 크기를 바꿈 ──
   실제 조작 요소(#tjoy · #tfire · #tbtn, game.js 가 터치 모드에서 만듦)를 그대로 끌어 올려 쓰므로 보이는 그대로 게임에 나옴.
   S.layout = { joy|fire|btn : { x, y (화면 가운데 위치, 0~1), s (크기 배율) } } — 없으면 css 의 기본 자리 · 크기 */
const TL_KEYS = [['joy', 'tjoy', '이동 조이스틱'], ['fire', 'tfire', '공격 조이스틱'], ['btn', 'tbtn', '조사 버튼']];
const TL_MIN = .6, TL_MAX = 1.8;
function applyLayout(L) {
  L = L === undefined ? S.layout : L;
  for (const [k, id] of TL_KEYS) {
    const e = document.getElementById(id); if (!e) continue;
    const p = L && L[k];
    e.style.setProperty('--s', p ? p.s : 1);
    if (p) Object.assign(e.style, { left: p.x * 100 + '%', top: p.y * 100 + '%', right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)' });
    else ['left', 'top', 'right', 'bottom', 'transform'].forEach(n => e.style.removeProperty(n));
  }
}
const TL = (() => {
  let box = null, draft = null, sel = 'joy', drag = null;
  const get = id => document.getElementById(id);
  function snapshot() {                      // 지금 화면에 놓인 그대로를 숫자로
    const o = {};
    for (const [k, id] of TL_KEYS) { const e = get(id), r = e.getBoundingClientRect(); o[k] = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight, s: +(e.style.getPropertyValue('--s') || 1) }; }
    return o;
  }
  function build() {
    box = document.createElement('div'); box.id = 'tledit'; box.className = 'hidden';
    box.innerHTML = `<div class="tl-bg"></div>
      <div class="tl-bar" role="dialog" aria-label="조작 배치">
        <p class="tl-t"><b>조작 배치</b><span>끌어서 옮기고, 고른 것의 크기를 바꾸세요</span></p>
        <div class="tl-row"><span class="tl-sel" id="tl-sel"></span>
          <button type="button" class="tl-mini" data-d="-1" aria-label="작게">－</button>
          <input type="range" id="tl-size" min="${TL_MIN}" max="${TL_MAX}" step=".05" aria-label="크기"><output id="tl-out"></output>
          <button type="button" class="tl-mini" data-d="1" aria-label="크게">＋</button></div>
        <div class="tl-row tl-btns"><button type="button" data-a="reset">기본값</button><button type="button" data-a="cancel">취소</button><button type="button" class="tl-main" data-a="save">저장</button></div>
      </div>`;
    box.querySelector('.tl-bg').style.backgroundImage = window.TL_BG ? `url(${window.TL_BG})` : '';
    document.body.appendChild(box);
    const size = get('tl-size');
    size.addEventListener('input', () => setSize(+size.value));
    box.querySelectorAll('.tl-mini').forEach(b => b.addEventListener('click', () => setSize(draft[sel].s + .1 * b.dataset.d)));
    box.querySelector('[data-a=reset]').addEventListener('click', () => { applyLayout(null); draft = snapshot(); pick(sel); });
    box.querySelector('[data-a=cancel]').addEventListener('click', () => close(false));
    box.querySelector('[data-a=save]').addEventListener('click', () => close(true));
    ['click', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(n => box.addEventListener(n, e => e.stopPropagation()));
  }
  function setSize(v) {
    v = Math.max(TL_MIN, Math.min(TL_MAX, Math.round(v * 20) / 20));
    draft[sel].s = v; applyLayout(draft); pick(sel);
  }
  function pick(k) {
    sel = k; const name = TL_KEYS.find(x => x[0] === k)[2];
    get('tl-sel').textContent = name; get('tl-size').value = draft[k].s; get('tl-out').textContent = Math.round(draft[k].s * 100) + '%';
    TL_KEYS.forEach(([kk, id]) => get(id).classList.toggle('tl-on', kk === k));
    dodge();
  }
  /* 편집 창이 고른 것을 가리지 않게 — 고른 것이 위쪽에 있으면 창은 아래로 */
  const dodge = () => { if (box && draft) box.classList.toggle('tl-low', draft[sel].y < .5); };
  function open() {
    if (!get('tjoy')) return;                 // 터치 모드가 아니면 (컴퓨터) 조작 요소가 없음
    if (!box) build();
    document.body.classList.add('tledit'); box.classList.remove('hidden');
    applyLayout(); draft = snapshot(); applyLayout(draft); pick('joy');
  }
  function close(save) {
    document.body.classList.remove('tledit'); box.classList.add('hidden');
    TL_KEYS.forEach(([, id]) => get(id).classList.remove('tl-on'));
    if (save) { S.layout = draft; window.Settings && save_(); }
    applyLayout(); drag = null;
  }
  const save_ = () => save();
  /* 끌기 — 다른 모든 손가락 처리(게임 · 조사 버튼)보다 먼저 */
  addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('tledit')) return;
    const hit = TL_KEYS.find(([, id]) => { const el = get(id); return el && (e.target === el || el.contains(e.target)); });
    if (!hit) return;
    e.preventDefault(); e.stopImmediatePropagation();
    pick(hit[0]);
    const p = draft[hit[0]]; drag = { k: hit[0], id: e.pointerId, ox: p.x * innerWidth - e.clientX, oy: p.y * innerHeight - e.clientY };
  }, true);
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const r = get(TL_KEYS.find(x => x[0] === drag.k)[1]).getBoundingClientRect(), hw = r.width / 2, hh = r.height / 2;
    const x = Math.max(hw, Math.min(innerWidth - hw, e.clientX + drag.ox)), y = Math.max(hh, Math.min(innerHeight - hh, e.clientY + drag.oy));
    draft[drag.k].x = x / innerWidth; draft[drag.k].y = y / innerHeight; applyLayout(draft); dodge();
  }, true);
  ['pointerup', 'pointercancel'].forEach(n => addEventListener(n, e => { if (drag && e.pointerId === drag.id) { drag = null; e.stopImmediatePropagation(); } }, true));
  addEventListener('keydown', e => {
    if (!document.body.classList.contains('tledit')) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
    else if (e.key === 'Enter') { e.preventDefault(); close(true); }
  }, true);
  return { open, close };
})();
window.Settings = {
  get: k => S[k], out, bus, open, close, isOpen, applyLayout, openLayout: () => TL.open(),
  look: () => S.sens,                                  // 둘러보기 배율
  lookY: () => S.sens * (S.invertY ? -1 : 1)
};
})();
