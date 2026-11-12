/* ═══════════════════════════════════════════════════════════════
   우물 아래 — 축제 타임어택 기록 서버 (구글 앱스 스크립트)

   GitHub Pages 에 올린 게임(docs/)이 여기로 기록을 보내고, 순위판이 여기서 받아 갑니다.
   기록은 이 스크립트가 붙은 구글 시트에 쌓입니다.
     · '기록' 시트   — 이름 · 연락처 뒷자리 · 결과 · 시간 (순위판에 나가는 것)
     · '연락처' 시트 — 전체 연락처 (순위판에는 절대 안 나감, 시트 주인만 봄)

   설치 · 배포 순서는 server/README.md.
   ═══════════════════════════════════════════════════════════════ */

/* 순위판 PIN — 비워 두면 링크만 있으면 누구나 순위판을 봄. 숫자를 넣으면 그 PIN 을 알아야 봄 */
const BOARD_PIN = '';

const RUNS = '기록', CONTACTS = '연락처';
const RUN_HEAD = ['id', '시각', '이름', '뒷자리', '결과', '도달', '점수', '시간(ms)', '시간'];
const CONTACT_HEAD = ['id', '시각', '이름', '연락처'];

/* 처음 한 번 — 편집기에서 setup 을 골라 ▶ 실행 (시트 두 장과 제목 줄을 만듭니다) */
function setup() {
  sheet_(RUNS, RUN_HEAD); sheet_(CONTACTS, CONTACT_HEAD);
}
function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    runs.appendRow([id, now, name, tail, clear ? '클리어' : '실패', clear ? '클리어' : stage, clear ? 9999 : score, ms, fmt_(ms)]);
    contacts.appendRow([id, now, name, "'" + contact]);     // ' — 앞자리 0 이 숫자로 사라지지 않게
  }
  const list = best_(readRuns_());
  const i = list.findIndex(x => x.name === name && x.tail === tail);
  return { ok: true, rank: i < 0 ? null : i + 1 };
}

/* ── 보내기 : 순위판이 받아 감 (연락처는 없음) ── */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (BOARD_PIN && String(p.pin || '') !== String(BOARD_PIN)) return out_({ ok: false, error: 'pin' });
  const live = JSON.parse(PropertiesService.getScriptProperties().getProperty('live') || 'null');
  return out_({ ok: true, runs: readRuns_(), live: live });
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
