/* ═══════════════════════════════════════════════════════════════
   우물 아래 — 축제 타임어택 기록 서버 (구글 앱스 스크립트)

   GitHub Pages 에 올린 게임(docs/)이 여기로 기록을 보내고, 순위판이 여기서 받아 갑니다.
   기록은 이 스크립트가 붙은 구글 시트에 쌓입니다.
     · '기록' 시트   — 이름 · 연락처 뒷자리 · 결과 · 시간 (순위판에 나가는 것)
     · '연락처' 시트 — 전체 연락처 (순위판에는 절대 안 나감, 시트 주인만 봄)
     · '순위판 설정' 시트 — 순위판(docs/board.html)에 나오는 글 · 상품 · 공지 · 등수 · PIN.
                          '값' 칸만 고치면 몇 초 뒤 순위판에 그대로 반영 (다시 배포할 필요 없음)
     · 'TOP 3' 시트   — 지금 1 · 2 · 3등 (클리어한 사람, 개발자 제외). '기록' · '연락처' 탭에도 '순위' 칸과 색으로 표시
   순위판의 🗑 관리 버튼 — '순위판 설정' 의 '관리 PIN' 을 넣으면 그 사람의 기록을 순위판에서 바로 지움 (시트의 줄도 같이)

   설치 · 배포 순서는 server/README.md.
   ═══════════════════════════════════════════════════════════════ */

/* 순위판 PIN — 비워 두면 링크만 있으면 누구나 순위판을 봄. 숫자를 넣으면 그 PIN 을 알아야 봄 */
const BOARD_PIN = '';

/* 기록이 쌓일 구글 시트 — 주소 …/spreadsheets/d/<여기>/edit 의 <여기>.
   시트에서 '확장 프로그램 → Apps Script' 로 열었으면 비워 둬도 되고,
   script.google.com 에서 따로 만든 프로젝트(아이패드 등)면 꼭 넣어야 합니다 */
const SHEET_ID = '1R9yArYjZB_fnC0A_BJ6_JlggOn2QR1qAkD_f7lZ-zfE';

const RUNS = '기록', CONTACTS = '연락처', SETTINGS = '순위판 설정', TOP = 'TOP 3', HARD = '어려움 클리어', PAY = '결제';
/* 순위판 설정 — [항목, 처음 값, 설명]. 시트에 없으면 이대로 만들어 둡니다 (항목 이름은 바꾸지 마세요) */
const SETTING_ROWS = [
  ['동아리 이름', 'DITC 동아리 축제 부스', '맨 위 빨간 띠'],
  ['제목', '우물 아래', '큰 제목'],
  ['부제', '타임어택 순위', '제목 옆 작은 글'],
  ['보여줄 등수', 10, '3 ~ 30'],
  ['상품 안내', '타임어택 TOP 3 상품 증정', 'QR 옆 큰 글'],
  ['1등 상품', '', '비워 두면 안 보임'],
  ['2등 상품', '', ''],
  ['3등 상품', '', ''],
  ['QR 문구', '찍고 바로 도전!', ''],
  ['공지', '', '비워 두면 안 보임 — 화면 아래에 흐르는 공지'],
  ['개발자 기록', '', '예: 장도우 1:43.75 — 순위와 따로 위에 나옴 (비우면 festival-config.js 의 WB_DEV)'],
  ['순위판 PIN', '', '숫자를 넣으면 그 PIN 을 알아야 순위판을 봄 (비우면 누구나)'],
  ['관리 PIN', '', '순위판의 ⚙ 관리 코드 — 기록 지우기 · 글 고치기 (처음에 저절로 만들어짐 · 순위판에는 안 나감)'],
  ['개발자 이름', '장도우', '이 이름의 판은 순위 · TOP 3 에서 빠짐'],
  ['결제 승인', '켬', '켬 — 타임어택 한 판마다 부스에서 승인해야 시작 (docs/approve.html) · 끔 — 그냥 시작'],
  ['도전 비용', '100원', '결제 대기 화면 · 승인 페이지에 나오는 한 판 값 (숫자만 세어 오늘 합계를 냄)']
];
const PRIVATE = ['순위판 PIN', '관리 PIN'];                  // 순위판으로 안 보내는 항목
/* 관리 코드 견주기 — 시트가 069211 을 숫자 69211 로 바꿔 적어도 맞게 (앞의 0 · 빈칸 무시) */
const sameKey_ = (a, b) => { const n = v => String(v == null ? '' : v).trim().replace(/^0+(?=.)/, ''); return !!n(a) && n(a) === n(b); };
const RUN_HEAD = ['id', '시각', '이름', '뒷자리', '결과', '도달', '점수', '시간(ms)', '시간'];
const CONTACT_HEAD = ['id', '시각', '이름', '연락처'];
const HARD_HEAD = ['id', '시각', '이름', '뒷자리', '플레이 시간(ms)', '플레이 시간'];   // 일반 모드 '어려움' 을 깬 사람 — 타임어택 순위와 따로
const PAY_HEAD = ['id', '번호', '요청 시각', '이름', '뒷자리', '상태', '처리 시각'];     // 타임어택 한 판 결제 — 대기 → 승인 / 거절 / 취소 → (승인된 판을 끝내면) 사용

/* 처음 한 번 — 편집기에서 setup 을 골라 ▶ 실행 (시트 두 장과 제목 줄을 만듭니다) */
function setup() {
  sheet_(RUNS, RUN_HEAD); sheet_(CONTACTS, CONTACT_HEAD); settings_();
}
/* 순위판 설정 읽기 — 없으면 시트를 만들고, 빠진 항목은 아래에 채워 넣음 */
function settings_() {
  const sh = sheet_(SETTINGS, ['항목', '값', '설명']);
  const n = sh.getLastRow() - 1, rows = n > 0 ? sh.getRange(2, 1, n, 2).getValues() : [];
  const have = {}; rows.forEach(r => { have[String(r[0]).trim()] = r[1]; });
  const miss = SETTING_ROWS.filter(r => !(r[0] in have));
  if (miss.length) { sh.getRange(sh.getLastRow() + 1, 1, miss.length, 3).setValues(miss); miss.forEach(r => { have[r[0]] = r[1]; }); }
  if (!String(have['관리 PIN'] || '').trim()) {                // 관리 PIN 이 비었으면 6자리를 만들어 시트에 적어 둠 (시트 주인만 봄)
    const pin = String(Math.floor(100000 + Math.random() * 900000)), all = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    const i = all.findIndex(r => String(r[0]).trim() === '관리 PIN'); if (i >= 0) sh.getRange(i + 2, 2).setValue("'" + pin);
    have['관리 PIN'] = pin;
  }
  return have;
}
function setSetting_(name, val) {                                    // 순위판 설정 탭의 한 칸 값만 바꿈 (없으면 settings_ 가 먼저 만들어 둠)
  settings_();
  const sh = sheet_(SETTINGS, ['항목', '값', '설명']), all = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  const i = all.findIndex(r => String(r[0]).trim() === name); if (i >= 0) sh.getRange(i + 2, 2).setValue(val);
}
function sheet_(name, head) {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
const fmt_ = ms => {
  const t = Math.max(0, ms | 0), m = Math.floor(t / 60000), s = Math.floor(t % 60000 / 1000), c = Math.floor(t % 1000 / 10);
  return m + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
};
const str_ = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

/* ── 받기 : 게임이 보냄 ── */
function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'invalid' }); }
  if (b.op === 'check') return out_(sameKey_(settings_()['관리 PIN'], b.key) ? { ok: true } : { ok: false, error: 'key' });   // 읽기만 — 잠금 없이 바로
  if (b.op === 'paylist') return out_(payList_(b));                                                                           // 승인 페이지 — 읽기만
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return out_({ ok: false, error: 'busy' });
  try {
    if (b.op === 'live') return out_(saveLive_(b.body || {}));
    if (b.op === 'run') return out_(saveRun_(b));
    if (b.op === 'delete') return out_(deleteRuns_(b));
    if (b.op === 'hard') return out_(saveHard_(b));
    if (b.op === 'req') return out_(payReq_(b));
    if (b.op === 'reqcancel') return out_(paySet_(b.id, '취소', ['대기']));
    if (b.op === 'payset') { if (!sameKey_(settings_()['관리 PIN'], b.key)) return out_({ ok: false, error: 'key' });
      return out_(paySet_(b.id, b.status === '승인' ? '승인' : '거절', ['대기'])); }
    if (b.op === 'payon') { if (!sameKey_(settings_()['관리 PIN'], b.key)) return out_({ ok: false, error: 'key' });   // 승인 페이지의 유료 켬 / 끔 스위치
      setSetting_('결제 승인', b.on ? '켬' : '끔');
      if (!b.on) payRows_().rows.filter(r => r.status === '대기').forEach(r => paySet_(r.id, '무료', ['대기']));   // 기다리던 손님은 바로 시작
      return out_({ ok: true, on: !!b.on }); }
    return out_({ ok: false, error: 'invalid' });
  } finally { lock.releaseLock(); }
}

/* 지금 도전 중 — 시트 대신 스크립트 속성 한 칸에 (덮어쓰기) */
function saveLive_(x) {
  const live = {
    state: x.state === 'play' ? 'play' : 'idle',
    name: str_(x.name, 10),
    startedAt: Number(x.startedAt) || 0,
    ms: Number(x.ms) || 0,
    clear: x.clear === false ? false : x.clear === true ? true : undefined,
    stage: str_(x.stage, 24),
    at: Date.now()
  };
  PropertiesService.getScriptProperties().setProperty('live', JSON.stringify(live));
  return { ok: true };
}

/* 한 판 — 기록 · 연락처를 한 줄씩. 같은 id 는 한 번만 (게임이 다시 보내도 겹치지 않음). 등수를 돌려줌 */
function saveRun_(b) {
  const id = str_(b.id, 40), r = b.run || {}, c = b.contact || {};
  const name = str_(r.name, 10), tail = str_(r.tail, 4).replace(/\D/g, ''), contact = String(c.contact || '').replace(/\D/g, '');
  const ms = Math.round(Number(r.ms)), clear = r.clear !== false;
  const score = Math.max(0, Math.min(9999, Math.round(Number(r.score) || 0))), stage = str_(r.stage, 24);
  // 말이 안 되는 기록은 거절 — 이름 · 번호 모양, 시간 범위 (클리어가 1분 안이면 조작으로 봄)
  if (!/^[a-z0-9-]{6,40}$/.test(id) || !name || tail.length !== 4 || contact.length < 10 || contact.length > 11 ||
      contact.slice(-4) !== tail || !(ms > 0 && ms < 3 * 3600000) || (clear && ms < 60000)) return { ok: false, error: 'invalid' };
  const runs = sheet_(RUNS, RUN_HEAD), contacts = sheet_(CONTACTS, CONTACT_HEAD);
  const ids = runs.getLastRow() > 1 ? runs.getRange(2, 1, runs.getLastRow() - 1, 1).getValues().map(x => String(x[0])) : [];
  if (ids.indexOf(id) < 0) {
    const now = new Date();
    runs.appendRow([id, now, name, "'" + tail, clear ? '클리어' : '실패', clear ? '클리어' : stage, clear ? 9999 : score, ms, fmt_(ms)]);
    contacts.appendRow([id, now, name, "'" + contact]);     // ' — 앞자리 0 이 숫자로 사라지지 않게
  }
  if (b.ticket) try { paySet_(b.ticket, '사용', ['승인']); } catch (err) {}   // 승인받은 판을 끝냄
  const all = readRuns_();
  markTop_(all, true);
  const list = best_(all);
  const i = list.findIndex(x => x.name === name && x.tail === tail);
  return { ok: true, rank: i < 0 ? null : i + 1 };
}

/* ── 타임어택 결제 (한 판마다 부스 승인) ──
   게임이 'req' → 번호를 받아 크게 띄우고 GET ?op=pay&id= 로 상태를 물어봄. 부스는 docs/approve.html 에서 관리 PIN 으로 승인 · 거절.
   '결제 승인' 이 끔이면 바로 free:true */
const payOn_ = set => String((set || settings_())['결제 승인'] || '켬').trim() !== '끔';
const sameDay_ = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function payRows_() {
  const sh = sheet_(PAY, PAY_HEAD), n = sh.getLastRow() - 1;
  if (n < 1) return { sh, rows: [] };
  const v = sh.getRange(2, 1, n, PAY_HEAD.length).getValues(), d = sh.getRange(2, 5, n, 1).getDisplayValues();
  return { sh, rows: v.map((x, i) => ({ row: i + 2, id: String(x[0]), no: Number(x[1]) || 0, at: new Date(x[2]), name: String(x[3]), tail: String(d[i][0] || x[4]).padStart(4, '0'), status: String(x[5]), done: x[6] ? new Date(x[6]) : null })).filter(r => r.id) };
}
function payReq_(b) {
  const set = settings_();
  if (!payOn_(set)) return { ok: true, free: true };
  const name = str_(b.name, 10), tail = str_(b.tail, 4).replace(/\D/g, '');
  if (!name || tail.length !== 4) return { ok: false, error: 'invalid' };
  const { sh, rows } = payRows_(), now = new Date();
  // 같은 사람이 30분 안에 낸 '대기' 요청이 있으면 그걸 그대로 (새로 고침 · 두 번 누름)
  const same = rows.filter(r => r.status === '대기' && r.name === name && r.tail === tail && now - r.at < 30 * 60000).pop();
  if (same) return { ok: true, id: same.id, no: same.no, price: str_(set['도전 비용'], 20) };
  const no = rows.filter(r => sameDay_(r.at, now)).length + 1;
  const id = 'p' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6);
  sh.appendRow([id, no, now, name, "'" + tail, '대기', '']);
  return { ok: true, id, no, price: str_(set['도전 비용'], 20) };
}
function payStatus_(id) {
  id = str_(id, 40); if (!id) return { ok: false, error: 'invalid' };
  const r = payRows_().rows.find(x => x.id === id);
  return r ? { ok: true, status: r.status, no: r.no } : { ok: false, error: 'none' };
}
function paySet_(id, status, from) {
  id = str_(id, 40);
  const { sh, rows } = payRows_(), r = rows.find(x => x.id === id);
  if (!r) return { ok: false, error: 'none' };
  if (from.indexOf(r.status) < 0) return { ok: true, status: r.status, no: r.no, same: true };   // 이미 처리됨 — 그대로 알려 줌
  sh.getRange(r.row, 6, 1, 2).setValues([[status, new Date()]]);
  return { ok: true, status, no: r.no };
}
function payList_(b) {
  const set = settings_();
  if (!sameKey_(set['관리 PIN'], b.key)) return { ok: false, error: 'key' };
  const now = new Date(), rows = payRows_().rows.filter(r => sameDay_(r.at, now));
  const pend = rows.filter(r => r.status === '대기').map(r => ({ id: r.id, no: r.no, at: r.at.getTime(), name: r.name, tail: r.tail }));
  const recent = rows.filter(r => r.status !== '대기').sort((a, b) => (b.done || b.at) - (a.done || a.at)).slice(0, 40)
                     .map(r => ({ id: r.id, no: r.no, at: r.at.getTime(), done: r.done ? r.done.getTime() : 0, name: r.name, tail: r.tail, status: r.status }));
  const paid = rows.filter(r => r.status === '승인' || r.status === '사용').length;
  return { ok: true, on: payOn_(set), price: str_(set['도전 비용'], 20), pending: pend, recent, paid, used: rows.filter(r => r.status === '사용').length, now: now.getTime() };
}

/* 일반 모드 '어려움' 클리어 — '어려움 클리어' 탭에 한 줄, 연락처는 '연락처' 탭에 (같은 id 는 한 번만) */
function saveHard_(b) {
  const id = str_(b.id, 40), r = b.run || {}, c = b.contact || {};
  const name = str_(r.name, 10), tail = str_(r.tail, 4).replace(/\D/g, ''), contact = String(c.contact || '').replace(/\D/g, ''), ms = Math.round(Number(r.ms));
  if (!/^[a-z0-9-]{6,40}$/.test(id) || !name || tail.length !== 4 || contact.length < 10 || contact.length > 11 ||
      contact.slice(-4) !== tail || !(ms >= 60000 && ms < 6 * 3600000)) return { ok: false, error: 'invalid' };
  const sh = sheet_(HARD, HARD_HEAD);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(x => String(x[0])) : [];
  if (ids.indexOf(id) < 0) {
    const now = new Date();
    sh.appendRow([id, now, name, "'" + tail, ms, fmt_(ms)]);
    sheet_(CONTACTS, CONTACT_HEAD).appendRow([id, now, name + ' (어려움)', "'" + contact]);
  }
  return { ok: true, hard: readHard_().length };
}
function readHard_() {
  const sh = sheet_(HARD, HARD_HEAD), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const rng = sh.getRange(2, 1, n, HARD_HEAD.length), v = rng.getValues(), d = rng.getDisplayValues();
  return v.map((x, i) => ({ id: String(x[0]), at: new Date(x[1]).getTime() || 0, name: String(x[2]), tail: String(d[i][3] || x[3]).padStart(4, '0'), ms: Number(x[4]) || parseT_(d[i][5]) }))
          .filter(x => x.id && x.name);
}

/* 순위판 🗑 — 관리 PIN 이 맞으면 그 사람(이름 + 뒷자리)의 기록을 전부 지움 ('기록' · '연락처' 의 줄 모두). id 만 주면 그 한 판만 */
function deleteRuns_(b) {
  const set = settings_(), key = String(set['관리 PIN'] || '').trim();
  if (!sameKey_(key, b.key)) return { ok: false, error: 'key' };
  const name = str_(b.name, 10), tail = str_(b.tail, 4).replace(/\D/g, '').padStart(4, '0'), one = str_(b.id, 40);
  const ids = {};
  // 남길 줄만 골라 한 번에 다시 씀 — 줄마다 지우면 한 줄에 1초 가까이 걸려 그동안 다른 기록이 'busy' 로 막혔음
  const keep = (sh, hit) => {
    const n = sh.getLastRow() - 1, w = sh.getLastColumn(); if (n < 1) return;
    const rng = sh.getRange(2, 1, n, w), v = rng.getValues(), left = v.filter(r => !hit(r));
    if (left.length === v.length) return;
    rng.clearContent();
    if (left.length) sh.getRange(2, 1, left.length, w).setValues(left);
    sh.getRange(2 + left.length, 1, v.length - left.length, w).setBackground('#ffffff');   // 비워진 아래 줄의 금은동 색도 지움
  };
  keep(sheet_(RUNS, RUN_HEAD), r => {
    const h = one ? String(r[0]) === one : (String(r[2]) === name && String(r[3]).padStart(4, '0') === tail);
    if (h) ids[String(r[0])] = 1; return h;
  });
  if (Object.keys(ids).length) keep(sheet_(CONTACTS, CONTACT_HEAD), r => !!ids[String(r[0])]);
  markTop_(readRuns_(), true, set);
  return { ok: true, deleted: Object.keys(ids).length };
}

/* 1 · 2 · 3등 표시 — 클리어한 사람 중 (개발자 제외). '기록' · '연락처' 의 '순위' 칸 + 줄 색, 'TOP 3' 탭.
   force 가 아니면 지난번과 같을 땐 건너뜀 (순위판이 3초마다 불러도 시트를 매번 고치지 않게) */
const MEDAL = ['🥇 1등', '🥈 2등', '🥉 3등'], MEDAL_BG = ['#fff2c4', '#eceff3', '#f6dfcc'];
function markTop_(all, force, set) {
  const devName = String((set || settings_())['개발자 이름'] || '').trim();
  const top = best_(all.filter(r => r.clear && !(devName && r.name === devName))).slice(0, 3);
  const sig = top.map(r => r.id + ':' + r.ms).join(',');
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('top3') === sig) return top;
  props.setProperty('top3', sig);
  const rankOf = {}; top.forEach((r, i) => { rankOf[r.id] = i; });
  const paint = (sh, head, col) => {
    const n = sh.getLastRow() - 1;
    if (sh.getRange(1, col).getValue() !== '순위') sh.getRange(1, col).setValue('순위');
    if (n < 1) return;
    const ids = sh.getRange(2, 1, n, 1).getValues();
    sh.getRange(2, col, n, 1).setValues(ids.map(x => [String(x[0]) in rankOf ? MEDAL[rankOf[String(x[0])]] : '']));
    sh.getRange(2, 1, n, col).setBackgrounds(ids.map(x => { const k = rankOf[String(x[0])]; return Array(col).fill(k == null ? '#ffffff' : MEDAL_BG[k]); }));
  };
  paint(sheet_(RUNS, RUN_HEAD), RUN_HEAD, RUN_HEAD.length + 1);
  paint(sheet_(CONTACTS, CONTACT_HEAD), CONTACT_HEAD, CONTACT_HEAD.length + 1);
  const t = sheet_(TOP, ['등수', '이름', '뒷자리', '기록', '시각', 'id']);
  if (t.getLastRow() > 1) t.getRange(2, 1, t.getLastRow() - 1, 6).clearContent().setBackground('#ffffff');
  if (top.length) {
    t.getRange(2, 1, top.length, 6).setValues(top.map((r, i) => [MEDAL[i], r.name, "'" + r.tail, fmt_(r.ms), new Date(r.at), r.id]));
    t.getRange(2, 1, top.length, 6).setBackgrounds(top.map((r, i) => Array(6).fill(MEDAL_BG[i])));
  }
  return top;
}
/* 시트 메뉴 — 시트를 손으로 고친 뒤 순위 표시를 다시 (시트에 붙은 스크립트일 때만 메뉴가 보임) */
function onOpen() { try { SpreadsheetApp.getUi().createMenu('우물 아래').addItem('1·2·3등 다시 표시', 'refreshTop').addToUi(); } catch (e) {} }
function refreshTop() { markTop_(readRuns_(), true); }

/* ── 보내기 : 순위판이 받아 감 (연락처는 없음) ── */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.op === 'pay') return out_(payStatus_(p.id));             // 결제 상태 — 게임이 2~3초마다 물어봄 (순위판 PIN 과 상관없이)
  const set = settings_(), pin = String(set['순위판 PIN'] || BOARD_PIN || '').trim();
  if (pin && String(p.pin || '') !== pin) return out_({ ok: false, error: 'pin' });
  const live = JSON.parse(PropertiesService.getScriptProperties().getProperty('live') || 'null');
  const board = {};                                          // PIN 은 빼고 순위판에 보냄
  SETTING_ROWS.forEach(r => { if (PRIVATE.indexOf(r[0]) < 0) board[r[0]] = str_(set[r[0]], 120); });
  const runs = readRuns_();
  const lk = LockService.getScriptLock();
  if (lk.tryLock(0)) { try { markTop_(runs, false, set); } catch (err) {} finally { lk.releaseLock(); } }             // 시트에서 줄을 지웠어도 1 · 2 · 3등 표시가 따라감
  let hard = []; try { hard = readHard_(); } catch (err) {}
  return out_({ ok: true, runs: runs, hard: hard, live: live, settings: board, admin: true });
}
/* '1:35.89' → 95890 (못 읽으면 0) */
const parseT_ = t => { const m = String(t == null ? '' : t).match(/(\d+):(\d{1,2})(?:\.(\d{1,3}))?/); return m ? (+m[1] * 60 + +m[2]) * 1000 + (m[3] ? +m[3].padEnd(3, '0') : 0) : 0; };
function readRuns_() {
  const sh = sheet_(RUNS, RUN_HEAD), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const rng = sh.getRange(2, 1, n, RUN_HEAD.length), vals = rng.getValues(), shown = rng.getDisplayValues();
  return vals.map((v, i) => [v, shown[i]])
    .filter(([v]) => v[0] && v[2])                          // 시트에서 지운 줄은 빼고
    .map(([v, d]) => {
      // 시간 — 사람이 '시간'(1:35.89) 칸만 고쳤으면 그걸 따름 ('시간(ms)' 와 0.01초 넘게 다르면)
      const a = Number(v[7]) || 0, b = parseT_(d[8]);
      return { id: String(v[0]), at: new Date(v[1]).getTime() || 0, name: String(v[2]), tail: String(d[3] || v[3]).padStart(4, '0'),
               clear: v[4] === '클리어', stage: String(v[5]), score: Number(v[6]) || 0, ms: b && Math.abs(b - a) >= 10 ? b : a };
    });
}
/* 시트에서 손으로 고치면 — '시간' ↔ '시간(ms)' 을 서로 맞추고 1 · 2 · 3등 다시 (시트에 붙은 스크립트일 때 저절로) */
function onEdit(e) {
  try {
    const sh = e.range.getSheet(); if (sh.getName() !== RUNS || e.range.getRow() < 2) return;
    const c = e.range.getColumn(), r = e.range.getRow();
    if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1) {
      if (c === 9) { const ms = parseT_(e.range.getDisplayValue()); if (ms) sh.getRange(r, 8).setValue(ms); }
      if (c === 8) { const ms = Number(e.range.getValue()); if (ms > 0) sh.getRange(r, 9).setValue("'" + fmt_(ms)); }
    }
    markTop_(readRuns_(), true);
  } catch (err) {}
}

/* 순서 — 게임(js/festival.js)과 같음: 클리어한 사람이 위(빠른 순), 못 깬 사람은 멀리 간 순 · 같으면 오래 버틴 순.
   같은 사람(이름 + 뒷자리)은 가장 좋은 기록 하나 */
function better_(a, b) {
  if (a.clear !== b.clear) return a.clear;
  if (a.clear) { if (a.ms !== b.ms) return a.ms < b.ms; }
  else { if (a.score !== b.score) return a.score > b.score; if (a.ms !== b.ms) return a.ms > b.ms; }
  return a.at < b.at;
}
function best_(runs) {
  const m = {};
  runs.forEach(r => { const k = r.name + '|' + r.tail; if (!m[k] || better_(r, m[k])) m[k] = r; });
  return Object.keys(m).map(k => m[k]).sort((a, b) => better_(a, b) ? -1 : better_(b, a) ? 1 : 0);
}
