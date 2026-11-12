'use strict';
/* ═══════════════════════════════════════════════════════════════
   festival.js — 동아리 축제판 : 타임어택 참가 등록 · 기록 모으기 · 실시간 순위판

   축제판(window.WB_FESTIVAL = true 로 빌드한 아티팩트)에서만 켜집니다.
   기록은 아티팩트의 공유 데이터베이스(window.claude.db)에 모입니다 —
   같은 아티팩트를 다른 화면(모니터 · 태블릿)에서 열고 "실시간 순위판"을 누르면 바로바로 갱신.

     runs/<id>   한 판의 기록 { name, contact(숫자만), ms, at }
     live/now    지금 도전 중인 사람 { state:'play'|'idle', name, startedAt, ms? }

   연락처는 상품 연락용 — 순위판에는 뒷자리 4개만, 전체 번호는 "관리" 화면에서만 보입니다.
   인터넷이 잠깐 끊겨도 기록을 잃지 않도록 먼저 이 기기에 줄 세워 두고(localStorage), 보내지면 지웁니다.

   쓰는 곳 : game.js (타임어택 시작 · 사망 · 클리어 · 타이틀의 순위판 버튼)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const ON = !!window.WB_FESTIVAL;
const db = () => (window.claude && window.claude.db) || null;
const QKEY = 'wellbelow.fest.queue';
const $ = id => document.getElementById(id);
const digits = s => String(s || '').replace(/\D/g, '');
const phone = d => d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
                 : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
const masked = d => d.length >= 4 ? `···${d.slice(-4)}` : '';
const fmt = ms => {
  const t = Math.max(0, ms | 0), m = Math.floor(t / 60000), s = Math.floor(t % 60000 / 1000), c = Math.floor(t % 1000 / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
};
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const rid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

let player = null;          // 지금 등록한 사람 { name, contact }
let playing = false;

/* ── 이 기기에 줄 세운 기록 → 데이터베이스로 ── */
function loadQ() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } }
function saveQ(q) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {} }
let memQ = null;            // localStorage 를 못 쓰는 창에선 메모리에만
const getQ = () => memQ || (memQ = loadQ());
let flushing = false;
async function flush() {
  const d = db(); if (!d || flushing) return;
  flushing = true;
  try {
    for (const item of getQ().slice()) {
      try { await d.collection('runs').doc(item.id).set(item.data); }
      catch (e) { break; }                                          // 끊겼으면 다음에 다시
      memQ = getQ().filter(x => x.id !== item.id); saveQ(memQ);
    }
  } finally { flushing = false; }
  status();
}
const pending = () => getQ().length;

function setLive(body) {
  const d = db(); if (!d) return;
  d.doc('live/now').set({ ...body, at: Date.now() }).catch(() => {});
}

/* ── 참가 등록 (타임어택을 고르면 모드 선택 자리에) ── */
function buildEntry() {
  const box = mk('div'); box.id = 'fest-entry'; box.className = 'hidden';
  box.innerHTML = `
    <p class="ms-q">타임어택 참가 등록</p>
    <div class="fe-row"><label for="fe-name">이름</label><input id="fe-name" maxlength="10" autocomplete="off" spellcheck="false"></div>
    <div class="fe-row"><label for="fe-contact">연락처</label><input id="fe-contact" inputmode="numeric" maxlength="13" autocomplete="off" placeholder="010-0000-0000"></div>
    <label class="fe-agree"><input type="checkbox" id="fe-agree"> 상품 연락용으로만 쓰고, 축제가 끝나면 지워요. 동의합니다</label>
    <p id="fe-err" aria-live="polite"></p>
    <button id="fe-go" class="fe-go">도전 시작</button>
    <button id="fe-back">← 뒤로</button>`;
  return box;
}
let entryCb = null;
function ask(onGo, onBack) {
  const box = $('fest-entry'); if (!box) { onGo(); return; }
  entryCb = { onGo, onBack };
  $('fe-name').value = ''; $('fe-contact').value = ''; $('fe-agree').checked = false; $('fe-err').textContent = '';
  box.classList.remove('hidden');
  setTimeout(() => $('fe-name').focus(), 30);
}
function closeEntry() { const b = $('fest-entry'); if (b) b.classList.add('hidden'); }
function submitEntry() {
  const name = $('fe-name').value.trim().replace(/\s+/g, ' '), d = digits($('fe-contact').value);
  const err = t => { $('fe-err').textContent = t; };
  if (!name) return err('이름을 적어 주세요.');
  if (d.length < 10 || d.length > 11) return err('연락처(전화번호)를 확인해 주세요.');
  if (!$('fe-agree').checked) return err('상품 연락에 동의해야 순위에 올라가요.');
  player = { name, contact: d };
  closeEntry();
  const cb = entryCb; entryCb = null; if (cb) cb.onGo(player);
}
function wireEntry() {
  $('fe-go').addEventListener('click', submitEntry);
  $('fe-back').addEventListener('click', () => { closeEntry(); const cb = entryCb; entryCb = null; if (cb) cb.onBack(); });
  $('fe-contact').addEventListener('input', e => { const d = digits(e.target.value).slice(0, 11); e.target.value = phone(d); });
  $('fest-entry').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitEntry(); }
    else if (e.key === 'Escape') { e.preventDefault(); $('fe-back').click(); }
  });
}

/* ── 게임에서 부르는 곳 ── */
function begin() {                       // 타임어택 시작
  if (!ON || !player) return;
  playing = true;
  setLive({ state: 'play', name: player.name, startedAt: Date.now() });
}
function end() {                         // 죽음 · 포기 · 타이틀로
  if (!ON || !playing) return;
  playing = false;
  setLive({ state: 'idle', name: player ? player.name : '' });
}
/* 클리어 — 기록을 줄 세우고 보냄. 순위판에서의 등수를 돌려줌(못 구하면 null) */
async function finish(ms) {
  if (!ON || !player) return null;
  playing = false;
  const item = { id: rid(), data: { name: player.name, contact: player.contact, ms: Math.round(ms), at: Date.now() } };
  memQ = getQ().concat(item); saveQ(memQ);
  setLive({ state: 'idle', name: player.name, ms: Math.round(ms) });
  await flush();
  try {
    const snap = await db().collection('runs').orderBy('ms', 'asc').limit(1000).get();
    return rankOf(bestPerPerson(snap.docs.map(x => x.data())), player.contact);
  } catch (e) { return null; }
}

/* 같은 사람(연락처)이 여러 번 했으면 가장 빠른 기록만 */
function bestPerPerson(runs) {
  const best = new Map();
  for (const r of runs) {
    if (!r || typeof r.ms !== 'number') continue;
    const k = digits(r.contact) || ('n:' + r.name);
    const b = best.get(k);
    if (!b || r.ms < b.ms || (r.ms === b.ms && r.at < b.at)) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => a.ms - b.ms || a.at - b.at);   // 같은 기록이면 먼저 세운 사람이 앞
}
function rankOf(list, contact) { const i = list.findIndex(r => digits(r.contact) === contact); return i < 0 ? null : i + 1; }

/* ── 실시간 순위판 (창 전체) ── */
let board = null, unsub = [], tick = 0, runs = [], live = null, admin = false;
function buildBoard() {
  const b = mk('div'); b.id = 'fest-board'; b.className = 'hidden';
  b.innerHTML = `
    <div class="fb-head">
      <div class="fb-club">DITC 동아리 축제 부스</div>
      <h2>우물 아래 <small>타임어택 순위</small></h2>
      <div class="fb-stat" id="fb-stat"></div>
    </div>
    <div class="fb-live" id="fb-live"></div>
    <ol class="fb-list" id="fb-list"></ol>
    <p class="fb-empty" id="fb-empty">아직 기록이 없어요 — 첫 번째 주인공이 되어 보세요!</p>
    <div class="fb-admin hidden" id="fb-admin">
      <div class="fb-admin-bar"><b>관리 — 전체 기록 (연락처 포함)</b><button id="fb-csv">CSV 저장</button></div>
      <table><thead><tr><th>#</th><th>이름</th><th>연락처</th><th>기록</th><th>시각</th><th></th></tr></thead><tbody id="fb-rows"></tbody></table>
    </div>
    <div class="fb-foot">
      <span id="fb-net"></span>
      <button id="fb-adminbtn">관리</button>
      <button id="fb-close">게임으로 ✕</button>
    </div>`;
  document.body.appendChild(b);
  $('fb-close').addEventListener('click', closeBoard);
  $('fb-adminbtn').addEventListener('click', () => {
    if (!admin && !confirm('연락처가 화면에 그대로 보입니다. 관리 화면을 열까요?')) return;
    admin = !admin; $('fb-admin').classList.toggle('hidden', !admin); $('fb-adminbtn').textContent = admin ? '관리 닫기' : '관리';
    render();
  });
  $('fb-csv').addEventListener('click', saveCsv);
  return b;
}
function openBoard() {
  if (!board) board = buildBoard();
  board.classList.remove('hidden');
  const d = db();
  if (!d) { $('fb-net').textContent = '순위판을 불러올 수 없어요'; return; }
  const fail = e => { $('fb-net').textContent = '순위판 연결 끊김 — 새로고침해 주세요'; console.warn('board', e && e.code); };
  unsub.push(d.collection('runs').orderBy('ms', 'asc').limit(1000).onSnapshot(s => { runs = s.docs.map(x => ({ id: x.id, ...x.data() })); render(); }, fail));
  unsub.push(d.doc('live/now').onSnapshot(s => { live = s.exists ? s.data() : null; renderLive(); }, fail));
  tick = setInterval(renderLive, 250);
}
function closeBoard() {
  if (!board) return;
  board.classList.add('hidden');
  unsub.forEach(u => { try { u(); } catch (e) {} }); unsub = []; clearInterval(tick);
  admin = false; $('fb-admin').classList.add('hidden'); $('fb-adminbtn').textContent = '관리';
}
function renderLive() {
  const el = $('fb-live'); if (!el) return;
  const fresh = live && Date.now() - (live.at || 0) < 40 * 60000;
  if (fresh && live.state === 'play' && live.startedAt) {
    el.className = 'fb-live on';
    el.textContent = '';
    el.append(mk('span', 'fb-dot'), mk('span', null, '지금 도전 중 '), mk('b', null, String(live.name || '')), mk('span', 'fb-clock', fmt(Date.now() - live.startedAt)));
  } else if (fresh && live.ms) {
    el.className = 'fb-live done'; el.textContent = '';
    el.append(mk('span', null, '방금 클리어 '), mk('b', null, String(live.name || '')), mk('span', 'fb-clock', fmt(live.ms)));
  } else { el.className = 'fb-live'; el.textContent = '도전자를 기다리는 중…'; }
}
function render() {
  const list = bestPerPerson(runs), ol = $('fb-list');
  ol.textContent = '';
  list.slice(0, 10).forEach((r, i) => {
    const li = mk('li', i < 3 ? 'top top' + (i + 1) : '');
    li.append(mk('span', 'fb-rank', String(i + 1)), mk('span', 'fb-name', String(r.name || '')),
              mk('span', 'fb-tail', masked(digits(r.contact))), mk('span', 'fb-time', fmt(r.ms)));
    ol.appendChild(li);
  });
  $('fb-empty').classList.toggle('hidden', list.length > 0);
  $('fb-stat').textContent = `참가 ${list.length}명 · 클리어 ${runs.length}회`;
  status();
  if (admin) renderAdmin();
}
function renderAdmin() {
  const tb = $('fb-rows'); tb.textContent = '';
  runs.slice().sort((a, b) => a.ms - b.ms || a.at - b.at).forEach((r, i) => {
    const tr = mk('tr');
    const del = mk('button', 'fb-del', '삭제');
    del.addEventListener('click', () => {
      if (!confirm(`${r.name} · ${fmt(r.ms)} 기록을 지울까요? 되돌릴 수 없어요.`)) return;
      db().doc('runs/' + r.id).delete().catch(() => alert('지우지 못했어요. 잠시 뒤에 다시 해 주세요.'));
    });
    const td = t => mk('td', null, t);
    const tdel = mk('td'); tdel.appendChild(del);
    tr.append(td(String(i + 1)), td(String(r.name || '')), td(phone(digits(r.contact))), td(fmt(r.ms)), td(new Date(r.at || 0).toLocaleString('ko-KR')), tdel);
    tb.appendChild(tr);
  });
}
async function saveCsv() {
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['순위(사람별 최고)', '이름', '연락처', '기록', '기록(ms)', '시각']];
  bestPerPerson(runs).forEach((r, i) => rows.push([i + 1, r.name, phone(digits(r.contact)), fmt(r.ms), r.ms, new Date(r.at || 0).toLocaleString('ko-KR')]));
  const text = '﻿' + rows.map(r => r.map(esc).join(',')).join('\n');
  const dl = window.claude && window.claude.downloads;
  if (!dl) return alert('이 화면에서는 파일 저장을 쓸 수 없어요.');
  try { await dl.save({ filename: '우물아래_타임어택_기록.csv', data: text }); }
  catch (e) {
    if (e && e.code === 'extension_not_enabled') {                   // csv 가 막힌 화면이면 같은 내용을 txt 로
      try { await dl.save({ filename: '우물아래_타임어택_기록.txt', data: text }); } catch (e2) {}
    }
  }
}
function status() {
  const n = $('fb-net'); if (!n) return;
  const p = pending();
  n.textContent = p ? `이 기기에서 아직 못 보낸 기록 ${p}개 — 인터넷이 돌아오면 자동으로 올라가요` : '';
}

/* ── 시작 ── */
function init() {
  if (!ON) return;
  document.body.classList.add('festival');
  const title = $('title'), ms = $('modesel');
  if (title && ms) { title.insertBefore(buildEntry(), ms.nextSibling); wireEntry(); }
  const credits = $('credits');
  if (credits) {
    const btn = mk('button', null, '실시간 순위판'); btn.id = 'fest-boardbtn';
    btn.addEventListener('click', openBoard);
    credits.parentNode.insertBefore(btn, credits);
  }
  flush(); setInterval(flush, 20000);
  if (/board/.test(location.hash)) openBoard();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

window.Festival = { on: ON, ask, begin, end, finish, openBoard, closeBoard, get player() { return player; } };
})();
