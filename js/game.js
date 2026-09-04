/* ═══════════════════════════════════════════════════════════
   game.js — 우물 아래 / The Well Below
   ═══════════════════════════════════════════════════════════ */
(() => {
'use strict';

const W = 480, H = 320, TS = 32;
const cv = document.getElementById('game');
const g  = cv.getContext('2d');
g.imageSmoothingEnabled = false;

const $ = id => document.getElementById(id);
const stage = $('stage');

/* ── 화면 정수배 확대 ───────────────────────────────────── */
function fit() {
  const pad = 90;
  const n = Math.max(1, Math.min(
    Math.floor((window.innerWidth  - 40)  / W),
    Math.floor((window.innerHeight - pad) / H)
  ));
  stage.style.setProperty('--scale', `scale(${n})`);
  stage.style.transform = `scale(${n})`;
  stage.style.margin = `${(n - 1) * H / 2}px ${(n - 1) * W / 2}px`;
}
window.addEventListener('resize', fit);

/* ── 입력 ───────────────────────────────────────────────── */
const key = {};
const AIM = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
let mouse = { x: 0, y: 0, down: false };

addEventListener('keydown', e => {
  if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  key[e.key] = true;
  const k = e.key.toLowerCase();
  if (k === ' ') onConfirm();
  if (k === 'r') restartRoom();
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
  mode: 'title',        // title | play | talk | note | fall | boss-intro | ending | dead
  stage: 0,
  t: 0,
  shake: 0,
  flash: 0,             // 화면 글리치 강도 0~1
  seenGlitch: false,
  keys: 0,
  floor: null,
  bullets: [], foes: [], fx: [], pickups: [], pots: [],
  chest: null, floorKey: null, door: { open: false, x: W - TS, y: H / 2 - 26, w: TS, h: 52 },
  boss: null,
  well: { x: 372, y: 150, glow: 0 },
  wellUsed: false,
  fallT: 0,
  butterflies: []
};

const P = {
  x: 60, y: H / 2, r: 10,
  hp: BALANCE.playerHp, max: BALANCE.playerHp,
  face: -1, fireCd: 0, inv: 0, walkT: 0, stepT: 0, dead: false
};

/* ═══════════ 자막 시스템 ═══════════════════════════════ */
const talk = { q: [], t: 0, cb: null };
function say(lines, cb) {
  talk.q = lines.slice(); talk.cb = cb || null; talk.t = 0;
  G.mode = 'talk';
  showLine();
}
function showLine() {
  const l = talk.q[0];
  if (!l) {
    $('subtitle').classList.add('hidden');
    G.mode = 'play';
    const cb = talk.cb; talk.cb = null;
    if (cb) cb();
    return;
  }
  const s = $('subtitle');
  s.classList.remove('hidden');
  s.classList.toggle('whisper', !!l.w);
  $('subtext').textContent = l.t;
  talk.t = 0;
}
function nextLine() { talk.q.shift(); showLine(); }

/* ═══════════ 확인 키 ═══════════════════════════════════ */
function onConfirm() {
  Sfx.unlock();
  if (G.mode === 'title')  { startGame(); return; }
  if (G.mode === 'talk')   { if (talk.t > 12) nextLine(); return; }
  if (G.mode === 'note')   { closeNote(); return; }
  if (G.mode === 'play')   { interact(); return; }
}

/* ═══════════ 시작 ═════════════════════════════════════ */
function startGame() {
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  Sfx.unlock();
  loadStage(0);
}
$('startbtn').addEventListener('click', startGame);
$('retrybtn').addEventListener('click', restartRoom);
$('againbtn').addEventListener('click', () => location.reload());

/* ═══════════ 스테이지 로드 ═════════════════════════════ */
function loadStage(i) {
  G.stage = i;
  const S = STAGES[i];
  G.bullets = []; G.foes = []; G.fx = []; G.pickups = []; G.pots = [];
  G.chest = null; G.floorKey = null; G.boss = null;
  G.door.open = false;
  G.gotDoorKey = false;      // 다음 방 열쇠를 얻었는가
  G.clearGiven = false;
  G.flash = 0;
  P.x = S.kind === 'forest' ? 52 : TS + 26;
  P.y = H / 2; P.inv = 40; P.dead = false;
  $('dead').classList.add('hidden');

  if (S.kind === 'forest') {
    G.floor = bakeForest(W, H, TS);
    G.butterflies = Array.from({ length: 7 }, () => ({
      x: 60 + Math.random() * 340, y: 40 + Math.random() * 240,
      a: Math.random() * 6.28, s: .35 + Math.random() * .35,
      c: OBANG_LIST[(Math.random() * 5) | 0], gl: 0
    }));
    G.well.glow = 0; G.wellUsed = false;
    Sfx.ambient('forest');
  } else {
    G.floor = bakeDungeonFloor(W, H, TS, 7717 + i * 913, S.depth);
    if (i === 1) Sfx.ambient('dungeon');

    (S.enemies || []).forEach(e => spawnFoe(e.t, e.x, e.y));
    (S.pots || []).forEach(p => G.pots.push({ x: p.x, y: p.y, hp: 1 }));
    if (S.key)   G.floorKey = { x: S.key.x, y: S.key.y, bob: 0 };
    if (S.chest) G.chest = { x: S.chest.x, y: S.chest.y, open: false, note: S.chest.note, givesKey: S.chest.givesKey };
  }

  // 날짜 HUD 갱신 (방을 옮길 때마다 날짜가 뛴다 = 복선)
  const dt = $('datetext');
  if (dt.textContent !== S.date) {
    dt.textContent = S.date;
    $('datebox').classList.remove('tick');
    void $('datebox').offsetWidth;
    $('datebox').classList.add('tick');
    if (i > 1) { G.flash = .8; Sfx.beep(.05); }
  }
  updateHud();

  // 보스방은 대사가 끝난 뒤에 등장 연출을 시작합니다
  const after = S.boss ? queueBoss : null;
  if (S.intro && S.intro.length) say(S.intro, after);
  else if (after) after();
  else G.mode = 'play';
}

function restartRoom() {
  if (G.mode === 'ending' || G.mode === 'title') return;
  P.hp = P.max;
  loadStage(G.stage);
}

/* ═══════════ 적 ═══════════════════════════════════════ */
function spawnFoe(type, x, y) {
  const b = BALANCE;
  G.foes.push({
    type, x, y, r: type === 'spitter' ? 13 : 12,
    hp: type === 'spitter' ? b.spitterHp : b.shroomHp,
    sp: type === 'spitter' ? b.spitterSpeed : b.shroomSpeed,
    cd: 40 + Math.random() * 90, flash: 0, bob: Math.random() * 6.28
  });
}

function queueBoss() {
  G.mode = 'boss-intro';
  G.bossIntroT = 0;
  Sfx.bossRoar();
  G.shake = 22;
  G.flash = 1;
}

function makeBoss() {
  G.boss = {
    x: W / 2, y: 118, r: 34, hp: BALANCE.bossHp, max: BALANCE.bossHp,
    sp: BALANCE.bossSpeed, phase: 1, t: 0, cd: 110, dash: 0, wind: 0,
    spiral: 0, spiralA: 0, flash: 0, spawned: false, bob: 0
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
  G.bullets.push({ x, y, vx: dx / l * sp, vy: dy / l * sp, life: 200, r: 4.5, mine: false });
}

/* ═══════════ 상호작용 ═════════════════════════════════ */
function nearWell() {
  return STAGES[G.stage].kind === 'forest' &&
         Math.hypot(P.x - G.well.x, P.y - G.well.y + 6) < 52;
}
function nearChest() {
  return G.chest && !G.chest.open && Math.hypot(P.x - G.chest.x, P.y - G.chest.y) < 34;
}
function nearFinalLock() {
  return STAGES[G.stage].final && Math.hypot(P.x - (W - TS - 24), P.y - H / 2) < 46;
}

function interact() {
  if (nearWell() && !G.wellUsed) {
    G.wellUsed = true;
    say(FALL_LINES, () => { G.mode = 'fall'; G.fallT = 0; Sfx.fall(); Sfx.ambientStop(); });
    return;
  }
  if (nearChest()) {
    if (G.keys < 1) { say([{ t: '잠겨 있다. 열쇠가 필요하다.', w: false }]); return; }
    G.keys--; updateHud();
    G.chest.open = true;
    Sfx.chest(); G.shake = 8;
    const n = NOTES[G.chest.note];
    openNote(n, () => {
      if (G.chest.givesKey) {
        giveKey(true);
        say([{ t: '쪽지 밑에 열쇠가 하나 더 들어 있다.', w: false }], checkDoor);
      } else checkDoor();
    });
    return;
  }
  if (nearFinalLock()) {
    if (G.keys < 1) { say([{ t: '거대한 잠금장치. 마지막 열쇠가 필요하다.', w: false }]); return; }
    G.keys--; updateHud();
    say(ENDING_LINES, beginEnding);
    return;
  }
}

/* ═══════════ 쪽지 ═════════════════════════════════════ */
let noteCb = null, noteTypeT = 0, noteFull = '', noteCut = '';
function openNote(n, cb) {
  noteCb = cb || null;
  G.mode = 'note';
  $('noteoverlay').classList.remove('hidden');
  $('notedate').textContent = n.date;
  $('notebody').innerHTML = '';
  noteFull = n.body; noteCut = n.cut; noteTypeT = 0;
}
function closeNote() {
  if (noteTypeT < noteFull.length) { noteTypeT = noteFull.length; renderNote(); return; }
  $('noteoverlay').classList.add('hidden');
  G.mode = 'play';
  const cb = noteCb; noteCb = null;
  if (cb) cb();
}
function renderNote() {
  const shown = noteFull.slice(0, Math.floor(noteTypeT));
  let html = shown.replace(/\n/g, '<br>');
  if (noteTypeT >= noteFull.length) {
    html += `<br><br><span class="cut">${noteCut}</span>`;
  }
  $('notebody').innerHTML = html;
}

/* ═══════════ 문 / 진행 ════════════════════════════════ */
/* 문은 "다음 방 열쇠"를 손에 넣었을 때만 열립니다.
   (바닥에서 주운 열쇠는 상자용이므로 문을 열지 않습니다) */
function checkDoor() {
  const S = STAGES[G.stage];
  if (S.final || S.kind === 'forest') return;
  if (G.gotDoorKey && !G.boss && !G.door.open) {
    G.door.open = true;
    Sfx.door(); G.shake = 6;
  }
}

/* 열쇠 획득 연출 */
function giveKey(isDoorKey) {
  G.keys++;
  if (isDoorKey) G.gotDoorKey = true;
  updateHud(); Sfx.keyGet();
  $('keys').classList.add('bump');
  setTimeout(() => $('keys').classList.remove('bump'), 400);
}

function nextStage() {
  if (G.stage + 1 < STAGES.length) loadStage(G.stage + 1);
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
  $('keycount').textContent = G.keys;
}

function hurt(n) {
  if (P.inv > 0 || P.dead) return;
  P.hp -= n; P.inv = BALANCE.invFrames;
  Sfx.hurt(); G.shake = 10; G.flash = Math.max(G.flash, .5);
  updateHud();
  const hs = $('hearts').children[Math.max(0, P.hp)];
  if (hs) { hs.classList.add('hit'); setTimeout(() => hs.classList.remove('hit'), 320); }
  if (P.hp <= 0) {
    P.hp = 0; P.dead = true; G.mode = 'dead';
    $('dead').classList.remove('hidden');
    Sfx.flatline(true);
    setTimeout(() => Sfx.flatline(false), 1400);
  }
}

/* ═══════════ 이펙트 ═══════════════════════════════════ */
function glitchDeath(x, y, big) {
  G.fx.push({ k: 'glitch', x, y, life: big ? 44 : 26, max: big ? 44 : 26,
              chars: Array.from({ length: big ? 14 : 7 },
                () => ({ c: '01<>{}#%$&*'[(Math.random() * 11) | 0],
                         dx: (Math.random() - .5) * (big ? 70 : 34),
                         dy: (Math.random() - .5) * (big ? 70 : 34) })) });
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

  if (G.mode === 'talk') { talk.t++; if (talk.t > 260) nextLine(); return; }
  if (G.mode === 'note') {
    if (noteTypeT < noteFull.length) { noteTypeT += .9; renderNote(); }
    return;
  }
  if (G.mode === 'fall') { G.fallT++; if (G.fallT > 150) loadStage(1); return; }
  if (G.mode === 'boss-intro') {
    G.bossIntroT++;
    if (G.bossIntroT > 90 && !G.boss) makeBoss();
    if (G.bossIntroT > 130) G.mode = 'play';
    return;
  }
  if (G.mode !== 'play') return;

  const S = STAGES[G.stage];

  /* ── 플레이어 이동 ─────────────────────────────────── */
  let mx = 0, my = 0;
  if (down('a', 'A', 'ㅁ')) mx--;
  if (down('d', 'D', 'ㅇ')) mx++;
  if (down('w', 'W', 'ㅈ')) my--;
  if (down('s', 'S', 'ㄴ')) my++;
  // WASD 를 안 쓰면 방향키로도 이동
  const aiming = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].some(k => key[k]);
  if (!mx && !my && aiming && S.kind === 'forest') {
    if (key.ArrowLeft) mx--; if (key.ArrowRight) mx++;
    if (key.ArrowUp) my--;   if (key.ArrowDown) my++;
  }
  const ml = Math.hypot(mx, my);
  if (ml) {
    P.x += mx / ml * BALANCE.playerSpeed;
    P.y += my / ml * BALANCE.playerSpeed;
    P.walkT += .22;
    if (mx) P.face = mx > 0 ? 1 : -1;
    if (++P.stepT % 20 === 0) Sfx.step();
  } else P.walkT *= .8;

  const pad = S.kind === 'forest' ? 12 : TS + P.r + 2;
  P.x = Math.max(pad, Math.min(W - pad, P.x));
  P.y = Math.max(S.kind === 'forest' ? 26 : pad, Math.min(H - pad, P.y));

  if (P.inv > 0) P.inv--;
  if (P.fireCd > 0) P.fireCd--;

  /* ── 사격 ─────────────────────────────────────────── */
  if (S.kind !== 'forest' && P.fireCd <= 0) {
    let ax = 0, ay = 0;
    for (const k in AIM) if (key[k]) { ax += AIM[k][0]; ay += AIM[k][1]; }
    if (ax || ay) shoot(ax, ay);
    else if (mouse.down) shoot(mouse.x - P.x, mouse.y - P.y);
  }

  /* ── 지상 : 우물 ──────────────────────────────────── */
  if (S.kind === 'forest') {
    const near = nearWell();
    G.well.glow += ((near ? 1 : .25) - G.well.glow) * .05;
    G.butterflies.forEach(b => {
      b.a += (Math.random() - .5) * .35;
      b.x += Math.cos(b.a) * b.s; b.y += Math.sin(b.a) * b.s * .6;
      if (b.x < 20 || b.x > W - 20) b.a = Math.PI - b.a;
      if (b.y < 30 || b.y > H - 20) b.a = -b.a;
      if (b.gl > 0) b.gl--;
      // ⚠ 복선 : 나비가 아주 가끔 한 프레임 튄다
      if (Math.random() < .0007) { b.gl = 8; b.x += (Math.random() - .5) * 40; }
    });
    if (Math.random() < .006) Sfx.bird();
    // ⚠ 복선 : 숲에 어울리지 않는 기계 비프
    if (Math.random() < .0035) { Sfx.beep(.028); G.flash = Math.max(G.flash, .12); }
  }

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
        if (Math.hypot(b.x - f.x, b.y - f.y) < f.r + b.r) {
          f.hp -= BALANCE.bulletDmg; f.flash = 6; Sfx.hit();
          if (f.hp <= 0) { f.dead = true; glitchDeath(f.x, f.y, false); }
          return false;
        }
      }
      for (const p of G.pots) {
        if (!p.hp) continue;
        if (Math.abs(b.x - p.x) < 13 && Math.abs(b.y - p.y) < 14) {
          p.hp = 0; Sfx.pot(); puff(p.x, p.y, '#b98b1e');
          if (Math.random() < .5 && P.hp < P.max)
            G.pickups.push({ k: 'heart', x: p.x, y: p.y, bob: 0 });
          return false;
        }
      }
      const B = G.boss;
      if (B && Math.hypot(b.x - B.x, b.y - B.y) < B.r + b.r) {
        B.hp -= BALANCE.bulletDmg; B.flash = 6; Sfx.hit();
        if (B.hp <= 0) killBoss();
        return false;
      }
    } else if (P.inv <= 0 && Math.hypot(b.x - P.x, b.y - P.y) < P.r + b.r) {
      hurt(1); return false;
    }
    return true;
  });

  /* ── 적 ───────────────────────────────────────────── */
  const wasFoes = G.foes.length;
  G.foes = G.foes.filter(f => !f.dead);
  G.foes.forEach(f => {
    if (f.flash > 0) f.flash--;
    f.bob += .12;
    const dx = P.x - f.x, dy = P.y - f.y, d = Math.hypot(dx, dy) || 1;
    if (f.type === 'spitter') {
      if (d < 120) { f.x -= dx / d * f.sp; f.y -= dy / d * f.sp; }
      else { f.x += dx / d * f.sp * .5; f.y += dy / d * f.sp * .5; }
      if (--f.cd <= 0) {
        f.cd = BALANCE.spitterCd;
        foeShot(f.x, f.y, dx, dy, BALANCE.spore);
      }
    } else {
      f.x += dx / d * f.sp; f.y += dy / d * f.sp;
    }
    f.x = Math.max(TS + f.r, Math.min(W - TS - f.r, f.x));
    f.y = Math.max(TS + f.r, Math.min(H - TS - f.r, f.y));
    if (d < f.r + P.r - 2) hurt(1);
  });
  if (wasFoes && !G.foes.length && S.clearKey && !G.clearGiven && !G.boss) {
    G.clearGiven = true;
    // 이 방에 상자가 있으면 그 열쇠는 상자용, 없으면 곧바로 문 열쇠
    giveKey(!G.chest);
    say([{ t: '마지막 하나가 흩어진 자리에 열쇠가 남았다.', w: false }], checkDoor);
  }

  /* ── 보스 ─────────────────────────────────────────── */
  if (G.boss) updateBoss();

  /* ── 픽업 ─────────────────────────────────────────── */
  if (G.floorKey) {
    G.floorKey.bob += .07;
    if (Math.hypot(P.x - G.floorKey.x, P.y - G.floorKey.y) < 20) {
      G.floorKey = null;
      giveKey(false);            // 상자를 여는 열쇠
      say([{ t: '오방색 매듭이 달린 낡은 열쇠. …왜 이렇게 익숙하지.', w: true }]);
    }
  }
  G.pickups = G.pickups.filter(p => {
    p.bob += .09;
    if (Math.hypot(P.x - p.x, P.y - p.y) < 18) {
      if (p.k === 'heart' && P.hp < P.max) { P.hp++; updateHud(); }
      Sfx.pickup();
      return false;
    }
    return true;
  });

  /* ── 이펙트 ───────────────────────────────────────── */
  G.fx = G.fx.filter(f => {
    f.life--;
    if (f.k === 'p') { f.x += f.vx; f.y += f.vy; f.vx *= .92; f.vy *= .92; }
    return f.life > 0;
  });

  /* ── 문 통과 ──────────────────────────────────────── */
  checkDoor();
  if (G.door.open && P.x >= W - TS - P.r - 6 &&
      Math.abs(P.y - H / 2) < 30 && S.kind !== 'forest' && !S.final) {
    nextStage();
  }

  /* ── 프롬프트 ─────────────────────────────────────── */
  let pr = '';
  if (nearWell() && !G.wellUsed) pr = '우물 들여다보기';
  else if (nearChest()) pr = G.keys > 0 ? '상자 열기' : '잠긴 상자';
  else if (nearFinalLock()) pr = G.keys > 0 ? '마지막 열쇠 꽂기' : '잠금장치';
  if (pr) { $('prompt').classList.remove('hidden'); $('prompttext').textContent = pr; }
  else $('prompt').classList.add('hidden');
}

/* ═══════════ 보스 AI ══════════════════════════════════ */
function updateBoss() {
  const B = G.boss;
  if (B.hp <= 0) { killBoss(); return; }
  B.t++; B.bob += .05;
  if (B.flash > 0) B.flash--;

  const r = B.hp / B.max;
  const ph = r > .66 ? 1 : r > .33 ? 2 : 3;
  if (ph !== B.phase) {
    B.phase = ph;
    G.shake = 14; G.flash = .9; Sfx.bossRoar();
    // 페이즈 전환 시 회복 아이템을 하나 흘린다 (4분 밸런스)
    if (P.hp < P.max) G.pickups.push({ k: 'heart', x: W / 2, y: H - 72, bob: 0 });
    if (ph === 3 && !B.spawned) {
      B.spawned = true;
      spawnFoe('shroom', 90, 90); spawnFoe('shroom', W - 90, 90);
    }
  }

  const dx = P.x - B.x, dy = P.y - B.y, d = Math.hypot(dx, dy) || 1;
  const sp = B.sp * (ph === 3 ? 1.5 : ph === 2 ? 1.15 : 1);

  if (B.dash > 0) {
    B.dash--;
    B.x += B.dvx; B.y += B.dvy;
    B.dvx *= .95; B.dvy *= .95;
  } else if (B.wind > 0) {
    B.wind--;
    if (B.wind === 0) {
      if (B.windKind === 'dash') {
        B.dash = 26; B.dvx = dx / d * 4.6; B.dvy = dy / d * 4.6;
        Sfx.bossRoar();
      } else {
        const n = ph === 1 ? 8 : 12;
        const off = Math.random() * 6.28;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          foeShot(B.x, B.y, Math.cos(a), Math.sin(a), BALANCE.spore + (ph - 1) * .25);
        }
        Sfx.glitch();
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

  // 3페이즈 : 나선탄
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
  G.shake = 26;
  G.boss = null;
  G.foes = [];
  G.bullets = G.bullets.filter(b => b.mine);
  setTimeout(() => {
    giveKey(true);
    say(BOSS_DEAD_LINES, checkDoor);
  }, 700);
}

/* ═══════════ 렌더 ═════════════════════════════════════ */
function render() {
  const S = STAGES[G.stage];
  g.save();
  const sh = G.shake;
  if (sh > .4) g.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);

  g.fillStyle = '#05040a'; g.fillRect(-20, -20, W + 40, H + 40);
  if (G.floor) g.drawImage(G.floor, 0, 0);

  if (S.kind === 'forest') renderForest();
  else renderDungeon(S);

  g.restore();

  // 추락 연출
  if (G.mode === 'fall') renderFall();

  // 화면 글리치
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
}

/* ── 지상 ──────────────────────────────────────────── */
function renderForest() {
  const t = G.t * 16;
  // 뒤쪽 나무
  const trees = [[40, 70, 46], [120, 46, 38], [250, 40, 42], [430, 62, 44],
                 [30, 200, 48], [110, 292, 44], [300, 300, 46], [455, 240, 42],
                 [190, 120, 34], [400, 160, 36]];
  trees.forEach(([x, y, s]) => drawTree(g, x, y, s, t));

  drawJangseung(g, 158, 258, 26);
  drawJangseung(g, 196, 262, 24);
  drawSotdae(g, 92, 148, 20, t);

  // 우물
  drawWell(g, G.well.x, G.well.y, G.t, G.well.glow);

  // 나비
  G.butterflies.forEach(b => {
    g.save();
    if (b.gl > 0) { g.globalAlpha = .55; g.fillStyle = '#7de3c8'; }
    else g.fillStyle = b.c;
    const f = Math.sin(G.t * .35 + b.a) * 2;
    g.fillRect(b.x - 3, b.y - f, 3, 2);
    g.fillRect(b.x + 1, b.y - f, 3, 2);
    g.fillStyle = '#2b2b33'; g.fillRect(b.x, b.y - 1, 1, 3);
    g.restore();
  });

  drawPlayer();

  // 살짝 어두운 나뭇잎 그림자
  g.fillStyle = 'rgba(10,20,6,.10)';
  for (let i = 0; i < 5; i++)
    g.fillRect(0, (i * 71 + ((G.t * .2) % 71)) | 0, W, 6);
}

/* ── 지하 ──────────────────────────────────────────── */
function renderDungeon(S) {
  drawWalls(g, W, H, TS, S.depth, G.t);

  // 벽 낙서 (날짜)
  if (S.graffiti) {
    g.save();
    g.globalAlpha = .55;
    g.fillStyle = '#b8352c';
    g.font = 'bold 13px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(S.graffiti, W / 2, H - 10);        // 아랫벽 (HUD 를 피해서)
    if (S.boss) {
      g.globalAlpha = .22;
      g.font = 'bold 10px ui-monospace, monospace';
      for (let i = 0; i < 12; i++) {
        g.fillText(S.graffiti,
          40 + ((i * 97) % (W - 80)),
          TS + 14 + ((i * 53) % (H - TS * 2 - 20)));
      }
    }
    g.restore();
  }

  // 문
  drawDoor(S);

  // 항아리
  G.pots.forEach(p => { if (p.hp) drawPot(p.x, p.y); });

  // 상자
  if (G.chest) drawChest(G.chest);

  // 바닥 열쇠
  if (G.floorKey) drawKey(G.floorKey.x, G.floorKey.y + Math.sin(G.floorKey.bob) * 2.5);

  // 픽업
  G.pickups.forEach(p => {
    const y = p.y + Math.sin(p.bob) * 2.5;
    g.save();
    g.fillStyle = '#c2352c';
    g.beginPath();
    g.moveTo(p.x, y + 6); g.lineTo(p.x - 6, y - 1); g.lineTo(p.x - 3, y - 5);
    g.lineTo(p.x, y - 2); g.lineTo(p.x + 3, y - 5); g.lineTo(p.x + 6, y - 1);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(p.x - 3, y - 3, 2, 2);
    g.restore();
  });

  // 보스 등장 연출
  if (G.mode === 'boss-intro' && !G.boss) {
    const k = Math.min(1, G.bossIntroT / 90);
    g.save();
    g.globalAlpha = k * .8;
    g.fillStyle = '#c2352c';
    g.beginPath(); g.arc(W / 2, 118, 4 + k * 30, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // 적
  G.foes.forEach(drawFoe);
  if (G.boss) drawBoss();

  drawPlayer();

  // 탄환
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
      g.fillStyle = '#3a1010';
      g.beginPath(); g.arc(b.x - 1, b.y - 1, b.r * .4, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  });

  // 이펙트
  G.fx.forEach(f => {
    const k = f.life / f.max;
    if (f.k === 'p') {
      g.globalAlpha = k; g.fillStyle = f.c;
      g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3); g.globalAlpha = 1;
    } else {
      // 글리치 : 코드 조각 + 뇌파 그래프
      g.save();
      g.globalAlpha = k;
      g.strokeStyle = '#7de3c8'; g.lineWidth = 1.4;
      g.beginPath();
      const wdt = f.max;
      for (let i = 0; i <= 20; i++) {
        const x = f.x - wdt / 2 + (i / 20) * wdt;
        const y = f.y + Math.sin(i * 1.9 + G.t * .5) * (i % 4 === 0 ? 13 : 3) * k;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.font = '9px ui-monospace, monospace';
      g.fillStyle = '#7de3c8';
      f.chars.forEach(c => g.fillText(c.c, f.x + c.dx * (1 - k), f.y + c.dy * (1 - k)));
      g.restore();
    }
  });
}

/* ── 문 ────────────────────────────────────────────── */
function drawDoor(S) {
  const d = G.door;
  const fin = !!S.final;

  if (fin) {
    // ── 거대한 문 : 오른쪽 벽 전체를 차지한다 ──────────────
    const x = W - TS, y = 34, w = TS, h = H - 68;
    g.save();
    g.fillStyle = '#2c2419'; g.fillRect(x - 4, y, w + 4, h);
    g.fillStyle = '#3f3320'; g.fillRect(x - 2, y + 3, w + 2, h - 6);
    g.strokeStyle = '#17121a'; g.lineWidth = 2;
    g.strokeRect(x - 3, y + 1, w + 3, h - 2);
    // 위로 뻗은 우물 파이프
    g.fillStyle = '#4a4a55'; g.fillRect(x + 6, 0, 8, 36);
    g.fillStyle = '#5e5e6b'; g.fillRect(x + 6, 0, 3, 36);
    // 오방색 단청 + 태극
    drawSaekdong(g, x - 3, y + 8, w + 3, 5, false, .92);
    drawSaekdong(g, x - 3, y + h - 13, w + 3, 5, false, .92, 2);
    drawTaegeuk(g, x + w / 2 - 1, H / 2, 12, G.t * .004);
    g.restore();

    // ── 잠금장치 (문 앞 받침대) ──────────────────────────
    const lx = W - TS - 24, ly = H / 2;
    g.save();
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(lx, ly + 20, 13, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#232a34'; g.fillRect(lx - 8, ly - 16, 16, 36);
    g.fillStyle = '#2f3945'; g.fillRect(lx - 8, ly - 16, 5, 36);
    g.strokeStyle = '#141920'; g.lineWidth = 1.5; g.strokeRect(lx - 8, ly - 16, 16, 36);
    // 열쇠 구멍
    g.fillStyle = '#0a0d13'; g.fillRect(lx - 5, ly + 2, 10, 3);
    // 상태 LED
    const on = G.keys > 0;
    g.fillStyle = on ? '#7de3c8' : '#c2352c';
    g.globalAlpha = .55 + Math.sin(G.t * (on ? .12 : .05)) * .4;
    g.fillRect(lx - 3, ly - 11, 6, 6);
    g.globalAlpha = 1;
    drawMaedeup(g, lx, ly + 13, 6, '#e3b23c');
    g.restore();
    return;
  }

  const x = d.x, y = d.y, w = d.w, h = d.h;
  g.save();
  g.fillStyle = d.open ? '#0a0910' : '#3a2f22';
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#1a1520'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  if (d.open) {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(125,227,200,.16)'); gr.addColorStop(1, 'rgba(125,227,200,0)');
    g.fillStyle = gr; g.fillRect(x - 10, y, w + 10, h);
    drawSaekdong(g, x, y, 3, h, true, .7, G.stage);
    g.fillStyle = '#7de3c8'; g.globalAlpha = .5 + Math.sin(G.t * .08) * .3;
    g.fillRect(x + w - 3, y + h / 2 - 8, 3, 16);
  } else {
    drawSaekdong(g, x + 2, y + 4, w - 4, 4, false, .55, G.stage);
    // 잠긴 자물쇠
    g.fillStyle = '#e3b23c';
    g.fillRect(x + w / 2 - 5, y + h / 2 - 4, 10, 9);
    g.strokeStyle = '#e3b23c'; g.lineWidth = 2;
    g.beginPath(); g.arc(x + w / 2, y + h / 2 - 4, 4, Math.PI, 0); g.stroke();
    g.fillStyle = '#15141b'; g.fillRect(x + w / 2 - 1, y + h / 2, 2, 4);
  }
  g.restore();
}

/* ── 오브젝트 ──────────────────────────────────────── */
function drawPot(x, y) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.ellipse(x, y + 10, 11, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7a5a34';
  g.beginPath(); g.ellipse(x, y, 11, 13, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8f6b3e';
  g.beginPath(); g.ellipse(x - 2, y - 2, 8, 10, 0, 0, Math.PI * 2); g.fill();
  drawSaekdong(g, x - 10, y - 2, 20, 3, false, .85);   // 오방색 띠
  g.fillStyle = '#5d431f'; g.fillRect(x - 6, y - 13, 12, 3);
  g.restore();
}

function drawChest(c) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath(); g.ellipse(c.x, c.y + 13, 20, 6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a3f22'; g.fillRect(c.x - 18, c.y - 6, 36, 20);
  g.fillStyle = '#6d4d2a'; g.fillRect(c.x - 18, c.y - 6, 36, 6);
  if (c.open) {
    g.fillStyle = '#2a1c0e'; g.fillRect(c.x - 16, c.y - 4, 32, 8);
    g.fillStyle = 'rgba(227,178,60,.25)';
    g.fillRect(c.x - 16, c.y - 22, 32, 18);
  } else {
    g.fillStyle = '#6d4d2a';
    g.beginPath();
    g.moveTo(c.x - 18, c.y - 6);
    g.quadraticCurveTo(c.x, c.y - 24, c.x + 18, c.y - 6);
    g.closePath(); g.fill();
    drawSaekdong(g, c.x - 18, c.y - 9, 36, 4, false, .9);
    drawMaedeup(g, c.x, c.y + 3, 9, '#e3b23c');   // 오방색 매듭 장식
  }
  g.strokeStyle = '#3a2712'; g.lineWidth = 1.5;
  g.strokeRect(c.x - 18, c.y - 6, 36, 20);
  g.restore();
}

function drawKey(x, y) {
  g.save();
  g.globalAlpha = .35;
  g.fillStyle = '#e3b23c';
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
  const bob = Math.sin(P.walkT) * 1.6;
  const dungeon = STAGES[G.stage].kind !== 'forest';
  g.save();
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.ellipse(P.x, P.y + 14, 14, 5, 0, 0, Math.PI * 2); g.fill();
  // 어두운 던전에서 실루엣이 묻히지 않도록 약한 림라이트
  if (dungeon) {
    const rg = g.createRadialGradient(P.x, P.y, 4, P.x, P.y, 30);
    rg.addColorStop(0, 'rgba(255,228,196,.16)');
    rg.addColorStop(1, 'rgba(255,228,196,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(P.x, P.y, 30, 0, Math.PI * 2); g.fill();
  }
  if (P.inv > 0 && (G.t >> 2) % 2) g.globalAlpha = .35;
  const w = 38, h = 33;
  g.translate(P.x, P.y + bob);
  if (P.face > 0) g.scale(-1, 1);          // 원본 스프라이트는 왼쪽을 봅니다
  if (IMG.pig) g.drawImage(IMG.pig, -w / 2, -h / 2 - 2, w, h);
  else { g.fillStyle = '#f0b0ae'; g.fillRect(-10, -10, 20, 20); }
  g.restore();
}

function drawFoe(f) {
  const bob = Math.sin(f.bob) * 2;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.ellipse(f.x, f.y + 11, 10, 4, 0, 0, Math.PI * 2); g.fill();
  const s = f.type === 'spitter' ? 30 : 26;
  g.translate(f.x, f.y + bob);
  if (f.type === 'spitter') {
    g.globalAlpha = .9;
    g.filter = 'hue-rotate(200deg) saturate(1.4)';
  }
  if (IMG.mushroom) g.drawImage(IMG.mushroom, -s / 2, -s / 2 - 2, s, s);
  else { g.fillStyle = '#e08030'; g.fillRect(-10, -10, 20, 20); }
  g.filter = 'none';
  if (f.flash > 0) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .55;
    g.fillStyle = '#7de3c8';
    g.fillRect(-s / 2, -s / 2 - 2, s, s);
  }
  g.restore();
}

function drawBoss() {
  const B = G.boss;
  const wind = B.wind > 0 ? (1 - B.wind / 32) : 0;
  const sc = 1 + Math.sin(B.bob) * .04 + wind * .18;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath(); g.ellipse(B.x, B.y + 30, 34, 10, 0, 0, Math.PI * 2); g.fill();
  // 위협 오라
  g.globalAlpha = .25 + wind * .5;
  const ag = g.createRadialGradient(B.x, B.y, 10, B.x, B.y, 60 + wind * 26);
  ag.addColorStop(0, 'rgba(150,60,220,.55)'); ag.addColorStop(1, 'rgba(150,60,220,0)');
  g.fillStyle = ag;
  g.beginPath(); g.arc(B.x, B.y, 62 + wind * 26, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;

  g.translate(B.x, B.y);
  g.scale(sc, sc);
  const w = 96, h = 87;
  if (IMG.eye) g.drawImage(IMG.eye, -w / 2, -h / 2, w, h);
  else { g.fillStyle = '#c33'; g.beginPath(); g.arc(0, 0, 34, 0, 6.3); g.fill(); }
  if (B.flash > 0) {
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = .5;
    g.fillStyle = '#7de3c8'; g.fillRect(-w / 2, -h / 2, w, h);
  }
  g.restore();

  // 체력 바
  const bw = 220, bx = (W - bw) / 2, by = H - 18;
  g.save();
  g.fillStyle = 'rgba(8,8,14,.75)'; g.fillRect(bx - 2, by - 2, bw + 4, 9);
  g.fillStyle = '#3a1c1c'; g.fillRect(bx, by, bw, 5);
  g.fillStyle = '#c2352c'; g.fillRect(bx, by, bw * Math.max(0, B.hp / B.max), 5);
  drawSaekdong(g, bx, by - 4, bw, 2, false, .55);
  g.restore();
}

/* ── 추락 연출 ─────────────────────────────────────── */
function renderFall() {
  const k = G.fallT / 150;
  g.save();
  // 좁아지는 우물 입구 : 타원 바깥쪽만 검게 (evenodd)
  const r = Math.max(0, 165 * (1 - k) ** 1.5);
  g.fillStyle = '#000';
  g.beginPath();
  g.rect(0, 0, W, H);
  g.ellipse(W / 2, H / 2, r, r * .62, 0, 0, Math.PI * 2);
  g.fill('evenodd');
  // 마지막엔 완전 암전
  g.fillStyle = `rgba(0,0,0,${Math.min(1, Math.max(0, (k - .55) / .35))})`;
  g.fillRect(0, 0, W, H);
  // 스쳐 지나가는 돌
  g.fillStyle = 'rgba(120,110,130,.5)';
  for (let i = 0; i < 26; i++) {
    const y = ((i * 53 + G.fallT * 14) % (H + 60)) - 30;
    g.fillRect((i * 97) % W, y, 3, 12 + (i % 4) * 6);
  }
  g.restore();
}

/* ═══════════ 엔딩 ═════════════════════════════════════ */
function beginEnding() {
  G.mode = 'ending';
  $('prompt').classList.add('hidden');
  $('hud').classList.add('hidden');
  const E = $('ending');
  E.classList.remove('hidden');
  Sfx.ambientStop();
  Sfx.flatline(true);                        // 삐————
  $('blackout').classList.add('on');
  G.flash = 1;

  setTimeout(() => {
    $('sysline').classList.add('on');
    typeSys(0);
  }, 2500);
}

function typeSys(i) {
  if (i >= ENDING_SYS.length) {
    setTimeout(openEyes, 1100);
    return;
  }
  const line = ENDING_SYS[i];
  let n = 0;
  $('systext').textContent = '';
  const iv = setInterval(() => {
    n++;
    $('systext').textContent = line.slice(0, n);
    if (n % 3 === 0) Sfx.beep(.012);
    if (n >= line.length) {
      clearInterval(iv);
      setTimeout(() => typeSys(i + 1), i === ENDING_SYS.length - 1 ? 900 : 700);
    }
  }, 48);
}

function openEyes() {
  const E = $('ending');
  $('sysline').classList.remove('on');
  Sfx.flatline(false);
  E.classList.add('open');                   // 눈꺼풀이 스르륵 열린다
  setTimeout(() => E.classList.add('zoomout'), 500);   // 카메라 줌아웃

  // 심박 비프 (안정화)
  let beats = 0;
  const hb = setInterval(() => {
    Sfx.beep(.02);
    if (++beats > 26) clearInterval(hb);
  }, 900);

  // 줌아웃이 끝난 뒤 복선을 한 줄씩 짚어준다
  const order = ['bed', 'blood', 'skull', 'mon', 'key'];
  const T0 = 6200;                                  // 카메라가 멈춘 뒤
  setTimeout(() => $('callouts').classList.add('on'), T0 - 500);
  const GAP = 1850;
  order.forEach((k, i) => setTimeout(() => {
    document.querySelectorAll('.co').forEach(e => e.classList.remove('on'));
    const el = document.querySelector(`.co[data-for="${k}"]`);
    if (el) el.classList.add('on');
    Sfx.beep(.016);
  }, T0 + i * GAP));

  setTimeout(() => {
    $('callouts').classList.remove('on');       // 자막을 먼저 걷어낸다
    $('endcard').classList.add('on');
  }, T0 + order.length * GAP + 900);
}

/* ═══════════ 루프 ═════════════════════════════════════ */
function loop() {
  update();
  if (G.mode !== 'ending') render();
  requestAnimationFrame(loop);
}

/* 디버그용 핸들 (개발/테스트 편의. 게임 진행에는 쓰이지 않습니다)
   콘솔에서 __game.loadStage(4) 처럼 특정 방으로 바로 갈 수 있습니다. */
window.__game = { G, P, STAGES, BALANCE, loadStage, giveKey, say, beginEnding };

/* ═══════════ 부팅 ═════════════════════════════════════ */
loadAssets().then(() => {
  fit();
  updateHud();
  loop();
});

})();
