'use strict';
/* ═══════════════════════════════════════════════════════════════
   festival.js — 동아리 축제판 : 타임어택 참가 등록 · 기록 모으기 · 실시간 순위판

   축제판(window.WB_FESTIVAL = true 로 빌드한 아티팩트)에서만 켜집니다.
   기록은 아티팩트의 공유 데이터베이스(claude.use("db"))에 모입니다 —
   같은 아티팩트를 다른 화면(모니터 · 태블릿)에서 열고 "실시간 순위판"을 누르면 바로바로 갱신.

     runs/<id>       한 판의 기록 { name, tail(연락처 뒷자리 4개), ms, at, clear, score, stage } — 링크로 들어온 누구나 읽음
                     clear:false 는 죽은 판 — ms 는 버틴 시간, score · stage 는 어디까지 갔는지 (game.js 의 runProgress)
     contacts/<id>   그 판의 연락처 { name, contact(숫자만) } — 아티팩트 주인 · 편집자만 읽고 씀
                     (게시할 때 db 규칙 { path: "contacts", read: "admin", write: "admin" })
     live/now        지금 도전 중인 사람 { state:'play'|'idle', name, startedAt, ms? }

   연락처는 상품 연락용 — 순위판에는 뒷자리 4개만, 전체 번호는 "관리" 화면에서만(주인 계정으로 열었을 때) 보입니다.
   인터넷이 잠깐 끊겨도 기록을 잃지 않도록 먼저 이 기기에 줄 세워 두고(localStorage), 보내지면 지웁니다.

   GitHub Pages 판(docs/) — 아티팩트 밖이라 데이터베이스가 없으므로, docs/festival-config.js 의 WB_SERVER
   (구글 앱스 스크립트 웹 앱 주소, server/apps_script.gs) 로 기록을 보내고 순위판도 거기서 받아 옵니다.
   그쪽은 로그인 없이 누구나 기록을 남기고, 연락처는 주인의 구글 시트에만 쌓입니다 (순위판은 PIN 을 걸 수 있음).

   쓰는 곳 : game.js (타임어택 시작 · 사망 · 클리어 · 타이틀의 순위판 버튼)
   ═══════════════════════════════════════════════════════════════ */
(() => {
const ON = !!window.WB_FESTIVAL;
/* 개발자 최고 기록 — festival-config.js 에 WB_DEV 가 없으면(옛 설정 · 캐시) 이 값. 안 보이게 하려면 config 에 WB_DEV = null */
if (ON && window.WB_DEV === undefined) window.WB_DEV = { name: '장도우', tail: '0862', ms: 98788 };
/* 데이터베이스 · 파일 저장 꺼내기 — 지금 런타임은 `await claude.use("db")` (없으면 null).
   예전 런타임(window.claude.db 가 바로 있던 때)도 그대로 받아 줌 */
const caps = {};
function cap(name) {
  if (!caps[name]) {
    const c = window.claude;
    caps[name] = c && typeof c.use === 'function' ? c.use(name).then(x => x || null, () => null)
               : Promise.resolve((c && c[name]) || null);
  }
  return caps[name];
}
const db = () => cap('db');
/* 이 화면에서 기록을 남길 수 있는지 — 데이터베이스에 쓰는 건 아티팩트 주인 · 편집자 · (팀 요금제의) 같은 조직 사람뿐.
   로그인 안 한 방문자는 데이터베이스가 아예 없고(읽기도 못 함), 다른 계정은 읽기만 됩니다 (플랫폼 규칙이라 바꿀 수 없음).
   true · false, 플랫폼이 알려 주지 않으면 null(그땐 써 보고 막히면 그만) */
/* ── 외부 기록 서버 (GitHub Pages 판) ── */
const SERVER = String(window.WB_SERVER || '').trim();
const HTTP = !!SERVER;
const INSIDE = !!window.claude;                   // 아티팩트 안에서 열렸는지
async function post(body) {
  const r = await fetch(SERVER, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j || !j.ok) { const e = new Error((j && j.error) || 'server'); e.code = j && j.error; throw e; }
  return j;
}
async function fetchBoard(pin) {
  const r = await fetch(SERVER + '?' + new URLSearchParams({ op: 'board', pin: pin || '' }), { redirect: 'follow' });
  return r.json();
}
const ranks = {};                                  // 서버가 돌려준 등수 (기록 id → 등수)

let canWriteP = null;
function canWrite() {
  if (!canWriteP) canWriteP = (async () => {
    if (HTTP) return true;                          // 외부 서버 — 누구나
    if (!(await db())) return false;
    try { const u = await cap('user'); const v = u ? await u.can('data.write') : null; return v === false ? false : v === true ? true : null; }
    catch (e) { return null; }
  })();
  return canWriteP;
}
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
/* 한 판 = 공개 기록(runs) + 연락처(contacts) 두 장. 예전 형식({ id, data })도 받아 줌 */
const norm = it => it.data ? { id: it.id,
  run: { name: it.data.name, tail: digits(it.data.contact).slice(-4), ms: it.data.ms, at: it.data.at },
  contact: { name: it.data.name, contact: digits(it.data.contact) } } : it;
const putQ = it => { memQ = getQ().map(x => x.id === it.id ? it : x); saveQ(memQ); };
const dropQ = id => { memQ = getQ().filter(x => x.id !== id); saveQ(memQ); };
async function flush() {
  if (flushing) return;
  if (HTTP) {
    flushing = true;
    try {
      for (const raw of getQ().slice()) {
        const it = norm(raw);
        try {
          const j = await post({ op: 'run', id: it.id, run: it.run, contact: it.contact }); ranks[it.id] = j.rank || null; dropQ(it.id);
          // 서버가 센 등수엔 개발자 판이 섞여 있을 수 있으니 — 순위판을 받아 개발자를 뺀 등수로 다시 셈
          try { const b = await fetchBoard(getPin()); if (b && b.ok && Array.isArray(b.runs)) ranks[it.id] = rankOf(bestPerPerson(b.runs), it.run.name, tailOf(it.run)) || ranks[it.id]; } catch (e2) {}
        }
        catch (e) { if (e.code === 'invalid') dropQ(it.id); else break; }   // 서버가 거절한 기록은 버리고, 끊긴 거면 다음에 다시
      }
    } finally { flushing = false; }
    status(); return;
  }
  const d = await db(); if (!d) return;
  flushing = true;
  try {
    for (const raw of getQ().slice()) {
      const it = norm(raw);
      try { if (!it.runDone) { await d.collection('runs').doc(it.id).set(it.run); it.runDone = true; } }
      catch (e) { putQ(it); break; }                                 // 끊겼으면 다음에 다시
      try { await d.collection('contacts').doc(it.id).set(it.contact); dropQ(it.id); }
      catch (e) { it.tries = (it.tries || 0) + 1; if (it.tries >= 5) dropQ(it.id); else putQ(it); }   // 다섯 번까지
    }
  } finally { flushing = false; }
  status();
}
const pending = () => getQ().length;

async function setLive(body) {
  if (HTTP) { post({ op: 'live', body }).catch(() => {}); return; }
  const d = await db(); if (!d) return;
  d.doc('live/now').set({ ...body, at: Date.now() }).catch(() => {});
}

/* ── 참가 등록 (타임어택을 고르면 모드 선택 자리에) ── */
function buildEntry() {
  const box = mk('div'); box.id = 'fest-entry'; box.className = 'hidden';
  box.innerHTML = `
    <p class="ms-q">타임어택 참가 등록</p>
    <p class="fe-dev hidden" id="fe-dev"></p>
    <p id="fe-nowrite" class="hidden"></p>
    <div class="fe-row"><label for="fe-name">이름</label><input id="fe-name" maxlength="10" autocomplete="off" spellcheck="false"></div>
    <div class="fe-row"><label for="fe-contact">연락처</label><input id="fe-contact" inputmode="numeric" maxlength="13" autocomplete="off" placeholder="010-0000-0000"></div>
    <label class="fe-agree"><input type="checkbox" id="fe-agree"> 상품 연락용으로만 쓰고, 축제가 끝나면 지워요. 동의합니다</label>
    <p id="fe-err" aria-live="polite"></p>
    <button id="fe-go" class="fe-go">도전 시작</button>
    <button id="fe-skip" class="hidden">기록 없이 그냥 도전</button>
    <button id="fe-back">← 뒤로</button>`;
  return box;
}
let entryCb = null;
/* 개발자 최고 기록 — festival-config.js 의 WB_DEV ({ name, ms }). 순위와 따로 화면에만 */
const devRec = () => { const d = window.WB_DEV; return d && d.ms > 0 ? { name: String(d.name || '개발자'), ms: +d.ms } : null; };
function showDev() {
  const d = devRec();
  ['fe-dev', 'fb-dev'].forEach(id => { const el = $(id); if (el) el.classList.toggle('hidden', !d); });
  if (!d) return;
  const fe = $('fe-dev'); if (fe) { fe.textContent = ''; fe.append(mk('span', 'fe-devtag', '개발자 기록'), mk('b', null, d.name), mk('span', 'fe-devtm', fmt(d.ms)), mk('span', null, ' — 깨 보세요!')); }
  const fb = $('fb-dev');
  if (fb) {
    const n = bestPerPerson(runs).filter(r => isClear(r) && r.ms < d.ms).length;
    fb.textContent = ''; fb.append(mk('span', 'fe-devtag', '개발자 기록'), mk('b', null, d.name), mk('span', 'fe-devtm', fmt(d.ms)),
                                   mk('span', 'fb-devsub', n ? `순위 밖 · ${n}명이 깼어요!` : '순위 밖 · 이 기록을 깨 보세요!'));
  }
}
function ask(onGo, onBack) {
  const box = $('fest-entry'); if (!box) { onGo(); return; }
  showDev();
  entryCb = { onGo, onBack };
  $('fe-name').value = ''; $('fe-contact').value = ''; $('fe-agree').checked = false; $('fe-err').textContent = '';
  box.classList.remove('hidden'); box.classList.remove('nowrite');
  setTimeout(() => $('fe-name').focus(), 30);
  canWrite().then(ok => {                                  // 기록을 못 남기는 화면 — 등록 칸 대신 안내 + "기록 없이 도전"
    const no = ok === false;
    $('fe-nowrite').innerHTML = INSIDE ? '이 화면은 로그인하지 않아서 <b>기록이 순위판에 남지 않아요.</b><br>순위에 오르려면 부스 노트북에서 도전해 주세요.'
                                       : '아직 기록 서버가 연결되지 않아서 <b>기록이 순위판에 남지 않아요.</b>';
    box.classList.toggle('nowrite', no);
    ['fe-nowrite', 'fe-skip'].forEach(id => $(id).classList.toggle('hidden', !no));
  });
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
  $('fe-skip').addEventListener('click', () => { player = null; closeEntry(); const cb = entryCb; entryCb = null; if (cb) cb.onGo(null); });
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
  canWrite().then(ok => { if (ok === false) playing = false; });
  playing = true;
  setLive({ state: 'play', name: player.name, startedAt: Date.now() });
}
function end() {                         // 죽음 · 포기 · 타이틀로
  if (!ON || !playing) return;
  playing = false;
  setLive({ state: 'idle', name: player ? player.name : '' });
}
/* 한 판 끝 — 기록을 줄 세우고 보냄. 순위판에서의 등수를 돌려줌(못 구하면 null)
   클리어(finish) · 죽음(fail, 어디까지 갔는지와 함께) 둘 다 남깁니다 — 참가한 사람은 모두 순위판에 */
async function record(ms, res) {
  if (!ON || !player) return null;
  if ((await canWrite()) === false) { playing = false; return null; }   // 남길 수 없는 화면 — 줄 세우지도 않음
  playing = false;
  const tail = player.contact.slice(-4), at = Date.now();
  const item = { id: rid(), run: { name: player.name, tail, ms: Math.round(ms), at, ...res }, contact: { name: player.name, contact: player.contact } };
  memQ = getQ().concat(item); saveQ(memQ);
  setLive({ state: 'idle', name: player.name, ms: Math.round(ms), ...res });
  await flush();
  if (HTTP) return ranks[item.id] || null;
  try {
    const d = await db(); if (!d) return null;
    const snap = await d.collection('runs').orderBy('ms', 'asc').limit(1000).get();
    return rankOf(bestPerPerson(snap.docs.map(x => x.data())), player.name, tail);
  } catch (e) { return null; }
}
const finish = ms => record(ms, { clear: true, score: 9999, stage: '클리어' });
const fail = (ms, pr) => playing ? record(ms, { clear: false, score: pr.score | 0, stage: String(pr.stage || '') }) : Promise.resolve(null);

/* 순서 — 클리어한 사람이 위(빠른 순), 그 아래 못 깬 사람(멀리 간 순, 같으면 오래 버틴 순). 다 같으면 먼저 세운 사람이 앞.
   같은 사람(이름 + 연락처 뒷자리)이 여러 번 했으면 가장 좋은 기록만 */
const tailOf = r => String(r.tail || digits(r.contact).slice(-4));
const who = (name, tail) => String(name || '') + '|' + tail;
const isClear = r => r.clear !== false;
function better(a, b) {
  if (isClear(a) !== isClear(b)) return isClear(a);
  if (isClear(a)) { if (a.ms !== b.ms) return a.ms < b.ms; }
  else {
    if ((a.score || 0) !== (b.score || 0)) return (a.score || 0) > (b.score || 0);
    if (a.ms !== b.ms) return a.ms > b.ms;
  }
  return (a.at || 0) < (b.at || 0);
}
/* 개발자 본인의 판(WB_DEV 의 이름 + 뒷자리)은 순위에서 뺌 — 개발자 기록은 순위 밖에 따로 */
const isDev = r => { const d = window.WB_DEV; return !!(d && d.tail && String(r.name || '') === String(d.name || '') && tailOf(r) === String(d.tail)); };
function bestPerPerson(runs) {
  const best = new Map();
  for (const r of runs) {
    if (!r || typeof r.ms !== 'number' || isDev(r)) continue;
    const k = who(r.name, tailOf(r)), b = best.get(k);
    if (!b || better(r, b)) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => better(a, b) ? -1 : better(b, a) ? 1 : 0);
}
function rankOf(list, name, tail) { const i = list.findIndex(r => who(r.name, tailOf(r)) === who(name, tail)); return i < 0 ? null : i + 1; }

/* ── 실시간 순위판 (창 전체) ── */
let board = null, unsub = [], tick = 0, poll = 0, runs = [], live = null, admin = false, contacts = {}, unsubC = null;
function buildBoard() {
  const b = mk('div'); b.id = 'fest-board'; b.className = 'hidden';
  b.innerHTML = `
    <div class="fb-head">
      <div class="fb-club">DITC 동아리 축제 부스</div>
      <h2>우물 아래 <small>타임어택 순위</small></h2>
      <div class="fb-stat" id="fb-stat"></div>
    </div>
    <div class="fb-dev hidden" id="fb-dev"></div>
    <div class="fb-live" id="fb-live"></div>
    <ol class="fb-list" id="fb-list"></ol>
    <p class="fb-empty" id="fb-empty">아직 기록이 없어요 — 첫 번째 주인공이 되어 보세요!</p>
    <p class="fb-rule">클리어한 사람은 빠른 순 · 못 깬 사람은 멀리 간 순으로 그 아래</p>
    <div class="fb-admin hidden" id="fb-admin">
      <div class="fb-admin-bar"><b>관리 — 전체 기록 (연락처 포함)</b><button id="fb-csv">CSV 저장</button></div>
      <table><thead><tr><th>#</th><th>이름</th><th>연락처</th><th>결과</th><th>시간</th><th>시각</th><th></th></tr></thead><tbody id="fb-rows"></tbody></table>
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
    watchContacts(admin);
    render();
  });
  $('fb-csv').addEventListener('click', saveCsv);
  if (HTTP) $('fb-adminbtn').classList.add('hidden');              // 외부 서버 판 — 연락처는 구글 시트에서 봄
  return b;
}
async function openBoard() {
  if (!board) board = buildBoard();
  board.classList.remove('hidden');
  if (unsub.length || poll) return;                                  // 이미 열려 있음
  $('fb-net').textContent = '순위판에 연결하는 중…';
  if (HTTP) { pollBoard(); poll = setInterval(pollBoard, 4000); tick = setInterval(renderLive, 250); return; }
  if (!INSIDE) { $('fb-net').textContent = '기록 서버가 아직 연결되지 않았어요'; return; }
  const d = await db();
  if (board.classList.contains('hidden')) return;                     // 기다리는 사이 닫힘
  if (!d) { $('fb-net').textContent = '순위판은 claude.ai 에 로그인해야 볼 수 있어요'; return; }
  $('fb-net').textContent = '';
  const fail = e => { $('fb-net').textContent = '순위판 연결 끊김 — 새로고침해 주세요'; console.warn('board', e && e.code); };
  unsub.push(d.collection('runs').orderBy('ms', 'asc').limit(1000).onSnapshot(s => { runs = s.docs.map(x => ({ id: x.id, ...x.data() })); render(); }, fail));
  unsub.push(d.doc('live/now').onSnapshot(s => { live = s.exists ? s.data() : null; renderLive(); }, fail));
  tick = setInterval(renderLive, 250);
}
/* 외부 서버 판 — 4초마다 받아 옴. 순위판 PIN 이 걸려 있으면 한 번 묻고 이 탭에 기억 */
const PKEY = 'wellbelow.board.pin';
const getPin = () => { try { return sessionStorage.getItem(PKEY) || ''; } catch (e) { return ''; } };
const setPin = v => { try { sessionStorage.setItem(PKEY, v); } catch (e) {} };
async function pollBoard() {
  try {
    const j = await fetchBoard(getPin());
    if (!j || !j.ok) {
      if (j && j.error === 'pin') {
        clearInterval(poll); poll = 0;
        const v = prompt(getPin() ? 'PIN 이 맞지 않아요. 순위판 PIN 을 다시 입력해 주세요' : '순위판 PIN 을 입력해 주세요');
        if (v) { setPin(v.trim()); openBoard(); } else $('fb-net').textContent = '순위판은 PIN 을 입력해야 볼 수 있어요';
        return;
      }
      throw new Error('server');
    }
    runs = Array.isArray(j.runs) ? j.runs.filter(r => !isDev(r)) : []; live = j.live || null;   // 개발자 판은 빼고
    $('fb-net').textContent = ''; render(); renderLive();
  } catch (e) { $('fb-net').textContent = '기록 서버에 연결하지 못했어요 — 잠시 뒤 다시 시도해요'; }
}
/* 연락처 — 관리 화면을 열었을 때만 읽음 (주인 · 편집자 계정이 아니면 아무것도 안 옴) */
async function watchContacts(on) {
  if (unsubC) { try { unsubC(); } catch (e) {} unsubC = null; }
  contacts = {};
  if (!on) return;
  const d = await db(); if (!d || !admin) return;
  unsubC = d.collection('contacts').limit(1000).onSnapshot(s => {
    contacts = {}; s.docs.forEach(x => { contacts[x.id] = x.data(); }); if (admin) renderAdmin();
  }, () => {});
}
function closeBoard() {
  if (!board) return;
  board.classList.add('hidden');
  unsub.forEach(u => { try { u(); } catch (e) {} }); unsub = []; clearInterval(tick); clearInterval(poll); poll = 0;
  admin = false; watchContacts(false); $('fb-admin').classList.add('hidden'); $('fb-adminbtn').textContent = '관리';
}
function renderLive() {
  const el = $('fb-live'); if (!el) return;
  const fresh = live && Date.now() - (live.at || 0) < 40 * 60000;
  if (fresh && live.state === 'play' && live.startedAt) {
    el.className = 'fb-live on';
    el.textContent = '';
    el.append(mk('span', 'fb-dot'), mk('span', null, '지금 도전 중 '), mk('b', null, String(live.name || '')), mk('span', 'fb-clock', fmt(Date.now() - live.startedAt)));
  } else if (fresh && live.ms && live.clear === false) {
    el.className = 'fb-live dead'; el.textContent = '';
    el.append(mk('span', null, '방금 도전 끝 '), mk('b', null, String(live.name || '')), mk('span', 'fb-clock', `${live.stage || ''}까지`));
  } else if (fresh && live.ms) {
    el.className = 'fb-live done'; el.textContent = '';
    el.append(mk('span', null, '방금 클리어 '), mk('b', null, String(live.name || '')), mk('span', 'fb-clock', fmt(live.ms)));
  } else { el.className = 'fb-live'; el.textContent = '도전자를 기다리는 중…'; }
}
function render() {
  const list = bestPerPerson(runs), ol = $('fb-list');
  ol.textContent = '';
  list.slice(0, 10).forEach((r, i) => {
    const li = mk('li', (i < 3 ? 'top top' + (i + 1) : '') + (isClear(r) ? '' : ' fail'));
    const res = isClear(r) ? mk('span', 'fb-time', fmt(r.ms)) : mk('span', 'fb-time fb-stage', String(r.stage || '도전'));
    li.append(mk('span', 'fb-rank', String(i + 1)), mk('span', 'fb-name', String(r.name || '')),
              mk('span', 'fb-tail', masked(tailOf(r))), res);
    ol.appendChild(li);
  });
  $('fb-empty').classList.toggle('hidden', list.length > 0);
  $('fb-stat').textContent = `참가 ${list.length}명 · 클리어 ${list.filter(isClear).length}명 · 도전 ${runs.length}판`;
  showDev();
  status();
  if (admin) renderAdmin();
}
function renderAdmin() {
  const tb = $('fb-rows'); tb.textContent = '';
  runs.slice().sort((a, b) => better(a, b) ? -1 : better(b, a) ? 1 : 0).forEach((r, i) => {
    const tr = mk('tr');
    const del = mk('button', 'fb-del', '삭제');
    del.addEventListener('click', () => {
      if (!confirm(`${r.name} · ${fmt(r.ms)} 기록을 지울까요? 되돌릴 수 없어요.`)) return;
      db().then(d => Promise.all([d.doc('runs/' + r.id).delete(), d.doc('contacts/' + r.id).delete()]))
          .catch(() => alert('지우지 못했어요. 잠시 뒤에 다시 해 주세요.'));
    });
    const td = t => mk('td', null, t);
    const tdel = mk('td'); tdel.appendChild(del);
    tr.append(td(String(i + 1)), td(String(r.name || '')), td(contactOf(r)), td(isClear(r) ? '클리어' : String(r.stage || '')), td(fmt(r.ms)), td(new Date(r.at || 0).toLocaleString('ko-KR')), tdel);
    tb.appendChild(tr);
  });
}
const contactOf = r => contacts[r.id] ? phone(digits(contacts[r.id].contact)) : '(볼 수 없음) ···' + tailOf(r);
async function saveCsv() {
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['순위(사람별 최고)', '이름', '연락처', '결과', '시간', '시간(ms)', '시각']];
  bestPerPerson(runs).forEach((r, i) => rows.push([i + 1, r.name, contactOf(r), isClear(r) ? '클리어' : r.stage, fmt(r.ms), r.ms, new Date(r.at || 0).toLocaleString('ko-KR')]));
  const text = '﻿' + rows.map(r => r.map(esc).join(',')).join('\n');
  const dl = await cap('downloads');
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

window.Festival = { on: ON, ask, begin, end, finish, fail, openBoard, closeBoard, clearPlayer() { player = null; playing = false; }, get player() { return player; } };
})();
