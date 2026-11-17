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
const DEF = { master: 1, music: 1, sfx: 1, sens: 1, joy: 1, invertY: false };
const S = { ...DEF };
try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) for (const k in DEF) if (typeof v[k] === typeof DEF[k]) S[k] = v[k]; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

/* ── 소리 길목 ── */
const OUT = new WeakMap(), BUS = [];        // BUS : { ac, kind, node }
const vol = k => k === 'music' ? S.music : k === 'sfx' ? S.sfx : S.master;
const curve = v => v * v;                   // 귀에 고르게 들리게 (밀대 반이면 소리 1/4)
function apply() {
  const set = (node, v, ac) => { try { node.gain.setTargetAtTime(curve(v), ac.currentTime, .03); } catch (e) { node.gain.value = curve(v); } };
  for (const b of BUS) set(b.node, vol(b.kind), b.ac);
  OUTS.forEach(o => set(o.node, S.master, o.ac));
  document.documentElement.style.setProperty('--joy', S.joy);   // 휴대폰 조이스틱 크기 (css 의 #tjoy · #tfire)
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
  { k: 'joy',    label: '조이스틱 크기', sub: '휴대폰 · 태블릿 — 움직이면 미리 보여요', min: .7, max: 1.6, step: .05, fmt: v => Math.round(v * 100) + '%' },
];
let el = null, onClose = null, testT = 0, joyT = 0;
function build() {
  el = document.createElement('div'); el.id = 'settings'; el.className = 'hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '설정');
  el.innerHTML = `<div class="st-box">
    <div class="pm-obang" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <p class="pm-title">설정</p><p class="pm-sub">SETTINGS · 이 기기에 저장돼요</p>
    ${ROWS.map(r => `<label class="st-row" data-k="${r.k}"><span class="st-l"><b>${r.label}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</span>
      <input type="range" min="${r.min}" max="${r.max}" step="${r.step}"><output></output></label>`).join('')}
    <label class="st-row st-check"><span class="st-l"><b>상하 반전</b><small>마우스를 올리면 아래를 봄</small></span><input type="checkbox" data-k="invertY"><output></output></label>
    <div class="st-btns"><button class="st-btn" data-act="reset">기본값</button><button class="st-btn st-main" data-act="close">닫기</button></div>
  </div>`;
  document.body.appendChild(el);
  el.querySelectorAll('.st-row[data-k]').forEach(row => {
    const r = ROWS.find(x => x.k === row.dataset.k), inp = row.querySelector('input'), o = row.querySelector('output');
    inp.addEventListener('input', () => {
      S[r.k] = +inp.value; o.textContent = r.fmt(S[r.k]); apply(); save();
      if (r.k === 'joy') { document.body.classList.add('joyprev'); clearTimeout(joyT); joyT = setTimeout(() => document.body.classList.remove('joyprev'), 1500); }
      if (r.k !== 'sens' && r.k !== 'joy') { clearTimeout(testT); testT = setTimeout(() => { try { if (window.Sfx && Sfx.pickup) (r.k === 'music' ? Sfx.beep || Sfx.pickup : Sfx.pickup)(); } catch (e) {} }, 120); }   // 들어 보기
    });
  });
  const ck = el.querySelector('input[data-k=invertY]');
  ck.addEventListener('change', () => { S.invertY = ck.checked; ck.parentNode.querySelector('output').textContent = S.invertY ? '켬' : '끔'; save(); });
  el.querySelector('[data-act=reset]').addEventListener('click', () => { Object.assign(S, DEF); sync(); apply(); save(); });
  el.querySelector('[data-act=close]').addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(n => el.addEventListener(n, e => e.stopPropagation()));
}
function sync() {
  el.querySelectorAll('.st-row[data-k]').forEach(row => { const r = ROWS.find(x => x.k === row.dataset.k), inp = row.querySelector('input'); inp.value = S[r.k]; row.querySelector('output').textContent = r.fmt(S[r.k]); });
  const ck = el.querySelector('input[data-k=invertY]'); ck.checked = S.invertY; ck.parentNode.querySelector('output').textContent = S.invertY ? '켬' : '끔';
}
const focusables = () => [...el.querySelectorAll('input, .st-btn')];
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
  if (!isOpen()) return;
  e.stopImmediatePropagation();
  const k = e.key, f = focusables(), i = f.indexOf(document.activeElement);
  if (k === 'Escape' || e.code === 'KeyP') { e.preventDefault(); if (!e.repeat) close(); return; }
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'Tab') { e.preventDefault(); const d = (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) ? -1 : 1; f[(Math.max(0, i) + d + f.length) % f.length].focus(); return; }
  const a = document.activeElement;
  if ((k === 'Enter' || k === ' ') && a && a.type === 'checkbox') { e.preventDefault(); a.click(); return; }
  if ((k === 'Enter' || k === ' ') && a && a.classList.contains('st-btn')) { e.preventDefault(); a.click(); return; }
  if ((k === 'ArrowLeft' || k === 'ArrowRight') && a && a.type === 'range') return;   // 밀대는 브라우저가 움직임
  if (k.length === 1 || k === 'Enter') e.preventDefault();
}, true);
addEventListener('keyup', e => { if (isOpen()) e.stopImmediatePropagation(); }, true);

document.documentElement.style.setProperty('--joy', S.joy);
window.Settings = {
  get: k => S[k], out, bus, open, close, isOpen,
  look: () => S.sens,                                  // 둘러보기 배율
  lookY: () => S.sens * (S.invertY ? -1 : 1)
};
})();
