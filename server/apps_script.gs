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

const RUNS = '기록', CONTACTS = '연락처', SETTINGS = '순위판 설정', TOP = 'TOP 3';
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
  ['개발자 이름', '장도우', '이 이름의 판은 순위 · TOP 3 에서 빠짐']
];
const PRIVATE = ['순위판 PIN', '관리 PIN'];                  // 순위판으로 안 보내는 항목
/* 관리 코드 견주기 — 시트가 069211 을 숫자 69211 로 바꿔 적어도 맞게 (앞의 0 · 빈칸 무시) */
const sameKey_ = (a, b) => { const n = v => String(v == null ? '' : v).trim().replace(/^0+(?=.)/, ''); return !!n(a) && n(a) === n(b); };
const RUN_HEAD = ['id', '시각', '이름', '뒷자리', '결과', '도달', '점수', '시간(ms)', '시간'];
const CONTACT_HEAD = ['id', '시각', '이름', '연락처'];

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
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return out_({ ok: false, error: 'busy' });
  try {
    if (b.op === 'live') return out_(saveLive_(b.body || {}));
    if (b.op === 'run') return out_(saveRun_(b));
    if (b.op === 'delete') return out_(deleteRuns_(b));
    if (b.op === 'check') return out_(sameKey_(settings_()['관리 PIN'], b.key) ? { ok: true } : { ok: false, error: 'key' });
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
  const all = readRuns_();
  markTop_(all, true);
  const list = best_(all);
  const i = list.findIndex(x => x.name === name && x.tail === tail);
  return { ok: true, rank: i < 0 ? null : i + 1 };
}

/* 순위판 🗑 — 관리 PIN 이 맞으면 그 사람(이름 + 뒷자리)의 기록을 전부 지움 ('기록' · '연락처' 의 줄 모두). id 만 주면 그 한 판만 */
function deleteRuns_(b) {
  const set = settings_(), key = String(set['관리 PIN'] || '').trim();
  if (!sameKey_(key, b.key)) return { ok: false, error: 'key' };
  const name = str_(b.name, 10), tail = str_(b.tail, 4).replace(/\D/g, '').padStart(4, '0'), one = str_(b.id, 40);
  const runs = sheet_(RUNS, RUN_HEAD), n = runs.getLastRow() - 1;
  const ids = {};
  if (n > 0) {
    const v = runs.getRange(2, 1, n, 4).getValues();
    for (let i = v.length - 1; i >= 0; i--) {
      const hit = one ? String(v[i][0]) === one : (String(v[i][2]) === name && String(v[i][3]).padStart(4, '0') === tail);
      if (hit) { ids[String(v[i][0])] = 1; runs.deleteRow(i + 2); }
    }
  }
  const contacts = sheet_(CONTACTS, CONTACT_HEAD), m = contacts.getLastRow() - 1;
  if (m > 0) { const c = contacts.getRange(2, 1, m, 1).getValues(); for (let i = c.length - 1; i >= 0; i--) if (ids[String(c[i][0])]) contacts.deleteRow(i + 2); }
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
  const set = settings_(), pin = String(set['순위판 PIN'] || BOARD_PIN || '').trim();
  if (pin && String(p.pin || '') !== pin) return out_({ ok: false, error: 'pin' });
  const live = JSON.parse(PropertiesService.getScriptProperties().getProperty('live') || 'null');
  const board = {};                                          // PIN 은 빼고 순위판에 보냄
  SETTING_ROWS.forEach(r => { if (PRIVATE.indexOf(r[0]) < 0) board[r[0]] = str_(set[r[0]], 120); });
  const runs = readRuns_();
  try { markTop_(runs, false, set); } catch (err) {}             // 시트에서 줄을 지웠어도 1 · 2 · 3등 표시가 따라감
  return out_({ ok: true, runs: runs, live: live, settings: board, admin: true });
}
function readRuns_() {
  const sh = sheet_(RUNS, RUN_HEAD), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, RUN_HEAD.length).getValues()
    .filter(v => v[0] && v[2])                              // 시트에서 지운 줄은 빼고
    .map(v => ({ id: String(v[0]), at: new Date(v[1]).getTime() || 0, name: String(v[2]), tail: String(v[3]).padStart(4, '0'),
                 clear: v[4] === '클리어', stage: String(v[5]), score: Number(v[6]) || 0, ms: Number(v[7]) || 0 }));
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
