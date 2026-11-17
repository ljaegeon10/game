// 타임어택 자동 플레이 봇 — 가상 시계(1/60초씩 정확히)로 돌려 게임 시간 그대로의 기록을 잼
// 쓰는 법 : python3 build.py && node tools/ta_bot.js [immortal|mortal] [다가갈 거리 px, 기본 120 · 45 가 가장 빠름] [조준 앞서기 0~1] [insta = 던전 적 즉시 처치(걷기만의 하한)]
// 봇은 피하지 않으므로 immortal(안 죽음)로 돌림 — '이론상 기록' 분석용
const { chromium } = require('playwright');
const BOSSLEFT = process.env.BOSSLEFT === '1', ICPT = process.env.ICPT === '1', SEEK = process.env.SEEK === '1', INSTA = process.argv[5] === 'insta', MODE = process.argv[6] || 'chase', HOLD = +process.argv[7] || 150, SEED = +process.argv[8] || 0, IMMORTAL = process.argv[2] !== 'mortal', APPROACH = +process.argv[3] || 120, LEAD = process.argv[4] != null ? +process.argv[4] : 1;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  if (SEED) await p.addInitScript(seed => { let x = seed >>> 0 || 1; Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }, SEED);
  await p.addInitScript(() => {
    let vt = 1000; const STEP = 1000 / 60;
    performance.now = () => vt;
    let raf = new Map(), rid = 0, timers = [], tid = 0;
    window.requestAnimationFrame = f => { raf.set(++rid, f); return rid; };
    window.cancelAnimationFrame = id => raf.delete(id);
    const realST = window.setTimeout.bind(window);
    window.setTimeout = (f, ms = 0, ...a) => { timers.push({ id: ++tid, at: vt + (+ms || 0), f, a }); return tid; };
    window.setInterval = (f, ms = 0, ...a) => { timers.push({ id: ++tid, at: vt + Math.max(1, +ms || 0), f, a, every: Math.max(1, +ms || 0) }); return tid; };
    window.clearTimeout = window.clearInterval = id => { timers = timers.filter(t => t.id !== id); };
    window.__vt = () => vt;
    window.__step = n => {
      for (let i = 0; i < n; i++) {
        vt += STEP;
        for (let k = 0; k < 50; k++) {                  // 이번 칸까지 된 타이머
          timers.sort((a, b) => a.at - b.at); const t = timers[0];
          if (!t || t.at > vt) break;
          if (t.every) t.at += t.every; else timers.shift();
          try { typeof t.f === 'function' ? t.f(...t.a) : 0; } catch (e) { console.error(e); }
        }
        if (window.__bot) try { window.__bot(); } catch (e) { console.error('bot ' + e.message); }
        const fs = [...raf.values()]; raf = new Map();
        for (const f of fs) try { f(vt); } catch (e) { console.error(e); }
      }
    };
  });
  await p.goto('file://' + require('path').resolve(__dirname, '../dist/우물아래.html'));
  await p.evaluate(([a, l, i, m, h, bl, ic, sk]) => { window.__APPROACH = a; window.__LEAD = l; window.__INSTAKILL = i; window.__MODE = m; window.__HOLD = h; window.__OVERKILL = true; window.__BOSSLEFT = !!bl; window.__ICPT = ic; window.__SEEK = sk; window.__DIAG = true; window.__diag = {}; }, [APPROACH, LEAD, INSTA, MODE, HOLD, BOSSLEFT, ICPT, SEEK]);
  await p.evaluate(() => __step(90));
  await p.evaluate(IMMORTAL => {
    const g = __game, G = g.G, P = g.P, MAP = g.MAP, BALANCE = g.BALANCE, I = () => g.bot();
    const { TS, CAM, TOUCH, doorCenter, onConfirm, runTime } = I(); let W, H; const mouse = I().mouse;
    window.runTime = runTime;
    const PATH = ['start', 'fork', 'north', 'fork', 'south', 'fork', 'mid', 'gate', 'boss', 'exit'];
    let ptr = 0, plan = null, planT = 0, planRoom = null, log = [], lastRoom = null, stuck = 0, lastP = [0, 0];
    window.__log = log;
    const dirTo = (a, b) => { const A = MAP[a], B = MAP[b]; return B.gx > A.gx ? 'E' : B.gx < A.gx ? 'W' : B.gy > A.gy ? 'S' : 'N'; };
    const promptText = () => { const e = document.getElementById('prompt'); return e && !e.classList.contains('hidden') ? e.textContent : ''; };
    function walkable(x, y) {
      if (G.inForest) {
        if (x < 12 || x > W - 12 || y < 26 || y > H - 12) return false;
        for (const [tx, ty, s] of FOREST_TREES) if (Math.hypot(x - tx, y - ty) < s * .3 + P.r + 2) return false;
        return true;
      }
      const pad = TS + P.r + 2, open = d => G.doors[d] && !G.doors[d].lock;
      let ok = x >= pad && x <= W - pad && y >= pad && y <= H - pad;
      if (!ok) { const by = Math.abs(y - H / 2) < 14, bx = Math.abs(x - W / 2) < 14;
        ok = (open('W') && by && x >= TS - 8 && x < pad + 1) || (open('E') && by && x <= W - TS + 8 && x > W - pad - 1) ||
             (open('N') && bx && y >= TS - 8 && y < pad + 1) || (open('S') && bx && y <= H - TS + 8 && y > H - pad - 1); }
      if (!ok) return false;
      if (G.props && G.props.length) { const o = { x, y }; if (pushOutOfProps(G.props, o, P.r + 2)) return false; }
      return true;
    }
    function bfs(gx, gy, ok) {                          // 격자 6px — 목표에 가장 가까운 닿는 칸까지 (ok(x, y) 가 있으면 그걸 처음 만족하는 칸까지)
      const C = 6, nx = Math.ceil(W / C), ny = Math.ceil(H / C), idx = (i, j) => j * nx + i;
      const si = Math.round(P.x / C), sj = Math.round(P.y / C), prev = new Int32Array(nx * ny).fill(-2);
      const q = [idx(si, sj)]; prev[q[0]] = -1; let best = q[0], bd = 1e9;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], i = c % nx, j = (c / nx) | 0, d = Math.hypot(i * C - gx, j * C - gy);
        if (ok) { if (ok(i * C, j * C)) { best = c; break; } } else { if (d < bd) { bd = d; best = c; } if (d < 4) break; }
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const a = i + di, bb = j + dj; if (a < 0 || bb < 0 || a >= nx || bb >= ny) continue;
          const n = idx(a, bb); if (prev[n] !== -2) continue;
          if (!walkable(a * C, bb * C)) continue;
          if (di && dj && (!walkable(i * C + di * C, j * C) || !walkable(i * C, j * C + dj * C))) continue;
          prev[n] = c; q.push(n);
        }
      }
      const pts = []; for (let c = best; c >= 0 && c !== q[0]; c = prev[c]) pts.push([(c % nx) * C, ((c / nx) | 0) * C]);
      return pts.reverse();
    }
    function goal() {
      if (G.inForest) return [G.well ? G.well.x : 446, (G.well ? G.well.y : 152) + 14];
      while (ptr < PATH.length - 1 && PATH[ptr] !== G.room) ptr++;
      if (G.room === 'exit' || ptr >= PATH.length - 1) return [W - TS - 30, H / 2];
      const d = dirTo(PATH[ptr], PATH[ptr + 1]), [cx, cy] = doorCenter(d);
      return [cx + (d === 'E' ? 20 : d === 'W' ? -20 : 0), cy + (d === 'S' ? 20 : d === 'N' ? -20 : 0)];
    }
    function clearShot(o) {
      const dx = o.x - P.x, dy = o.y - P.y, l = Math.hypot(dx, dy) || 1;
      for (let d = 10; d < l - (o.r || 10) * .6; d += 6) { const x = P.x + dx / l * d, y = P.y - 3 + dy / l * d; if (G.props && G.props.length && propBlocksShot(G.props, x, y)) return false; }
      return true;
    }
    /* 날아가는 내 탄 중 그 적에게 맞을 것 — 이미 죽을 만큼 날아가고 있으면 다른 적을 쏨 (헛방 줄이기) */
    function incoming(o) {
      let n = 0;
      for (const b of G.bullets) { if (!b.mine) continue;
        const rx = o.x - b.x, ry = o.y - b.y, v2 = b.vx * b.vx + b.vy * b.vy, t = (rx * b.vx + ry * b.vy) / v2;
        if (t < 0 || t > b.life) continue;
        const cx = b.x + b.vx * t - o.x, cy = b.y + b.vy * t - o.y;
        if (Math.hypot(cx, cy) < (o.r || 10) + b.r) n++; }
      return n;
    }
    /* 몹이 실제로 움직이는 속도 (한 칸 = 1/60초) — 맞아서 밀려난 칸은 빼고 부드럽게 */
    function track() {
      const all = (G.foes || []).concat(G.boss ? [G.boss] : []);
      for (const o of all) {
        if (o.__px != null) { const vx = o.x - o.__px, vy = o.y - o.__py;
          if (Math.hypot(vx, vy) < 3.2) { o.__vx = (o.__vx || 0) * .6 + vx * .4; o.__vy = (o.__vy || 0) * .6 + vy * .4; } }
        o.__px = o.x; o.__py = o.y;
      }
    }
    window.__track = track;
    /* 탄과 몹이 만나는 점 — |몹 + v·t − 쏘는 자리| = 탄속·t 를 풀어 가장 이른 t */
    function intercept(o) {
      const S = BALANCE.bulletSpeed, vx = o.__vx || 0, vy = o.__vy || 0;
      const dx0 = o.x - P.x, dy0 = o.y - P.y, l0 = Math.hypot(dx0, dy0) || 1;
      const sx = P.x + dx0 / l0 * 10, sy = P.y - 3 + dy0 / l0 * 10;          // 탄이 나오는 자리 (shoot 과 같게)
      const rx = o.x - sx, ry = o.y - sy, a = vx * vx + vy * vy - S * S, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
      let t = -c / b;
      if (Math.abs(a) > 1e-6) { const D = b * b - 4 * a * c; if (D < 0) return [o.x, o.y]; const q = Math.sqrt(D), t1 = (-b - q) / (2 * a), t2 = (-b + q) / (2 * a);
        t = Math.min(...[t1, t2].filter(x => x > 0)); }
      if (!isFinite(t) || t <= 0) return [o.x, o.y];
      t += 1;                                                              // 쏘기까지 한 칸
      return [o.x + vx * t, o.y + vy * t];
    }
    function target() {
      let best = null, bd = 1e9, vis = null, vd = 1e9;
      const look = (o, r = 0) => { if (!o || o.dead || o.warp) return; if (!o.kind && window.__OVERKILL && o.hp - incoming(o) <= 0) return; const d = Math.hypot(o.x - P.x, o.y - P.y) - r;
        if (d < bd) { bd = d; best = o; } if (d < vd && d < 210 && clearShot(o)) { vd = d; vis = o; } };
      (G.foes || []).forEach(o => look(o)); if (G.boss && !G.boss.dead) look(G.boss, G.boss.r || 30);
      return vis ? [vis, vd, true] : best ? [best, bd, false] : null;
    }
    window.__bot = () => {
      ({ W, H } = I());
      if (IMMORTAL) P.inv = Math.max(P.inv, 5);
      track();
      /* 탄 추적 — 사라질 때 어디였나 (몹 맞음 · 항아리 · 장애물 · 벽 · 사거리 끝) */
      if (window.__DIAG) {
        const live = new Set(G.bullets.filter(b => b.mine));
        for (const b of (window.__prevB || [])) if (!live.has(b)) {
          const near = (G.foes || []).concat(G.boss ? [G.boss] : []).some(o => Math.hypot(o.x - b.x, o.y - b.y) < (o.r || 10) + 12);
          const pot = (G.pots || []).some(q => Math.abs(b.x - q.x) < 18 && Math.abs(b.y - q.y) < 18);
          const k = near ? 'hit' : pot ? 'pot' : b.life <= 1 ? 'range' : (G.props && G.props.length && propBlocksShot(G.props, b.x + b.vx, b.y + b.vy)) ? 'prop' : 'wall';
          const R = (window.__diag[G.room] = window.__diag[G.room] || {}); R[k] = (R[k] || 0) + 1;
        }
        window.__prevB = [...live].map(b => b);
      }
      if (G.room === 'boss' && ((window.__bt = (window.__bt || 0) + 1) % 60 === 0)) log.push(['B', +(runTime() / 1000).toFixed(1), G.mode, G.boss ? G.boss.kind + ':' + Math.round(G.boss.hp) + (G.boss.inv ? ' inv' + G.boss.inv : '') + (G.boss.phase ? ' ph' + G.boss.phase : '') : 'none', window.__shots]);
      if (G.mode !== window.__lm) { log.push(['mode:' + G.mode, +(runTime() / 1000).toFixed(2), G.boss ? Math.round(G.boss.hp) : '']); window.__lm = G.mode; }
      if (G.room !== lastRoom) { log.push([G.room || (G.inForest ? 'forest' : G.mode), +(runTime() / 1000).toFixed(2), 'shots', window.__shots || 0, (G.foes || []).reduce((a, f) => a + Math.max(0, f.hp), 0)]); lastRoom = G.room; plan = null; }
      if (['talk', 'note', 'doc'].includes(G.mode)) { onConfirm(); return; }
      if (window.__INSTAKILL && G.mode === 'play' && !G.inForest && G.room !== 'boss' && G.foes.some(f => !f.dead)) g.devKillAll();   // 걷기만의 하한
      if (G.mode !== 'play' && G.mode !== 'forest') { TOUCH.joy = null; mouse.down = false; return; }
      const pt = promptText();
      if (/우물|관문 열기|마지막 열쇠|탈출/.test(pt)) onConfirm();
      // 쏘기 — 가장 가까운 적, 탄이 닿을 때쯤의 자리를 노림
      const t = !G.inForest && target();
      if (t && t[2] && window.__ICPT) { const [ax, ay] = intercept(t[0]); mouse.x = ax - CAM.x; mouse.y = ay - CAM.y; mouse.down = true; }
      else if (t && t[2]) { const o = t[0], d = Math.hypot(o.x - P.x, o.y - P.y), tt = d / BALANCE.bulletSpeed;
        const vx = o.vx || 0, vy = o.vy || 0; mouse.x = o.x + vx * tt * (window.__LEAD ?? 1) - CAM.x; mouse.y = o.y + vy * tt * (window.__LEAD ?? 1) - CAM.y; mouse.down = true; }
      else mouse.down = false;
      // 걷기
      let [gx, gy] = goal();
      if (window.__MODE === 'door') {                                       // 문으로 걸으면서 쏨 — 문 앞에서도 남아 있으면 그때 다가감
        const atDoor = Math.hypot(gx - P.x, gy - P.y) < 40;
        const dead = G.room === 'north' || G.room === 'south';            // 들어온 문으로 다시 나가는 방 — 문 앞에서 버팀
        const ap = dead ? (window.__HOLD || 150) : (window.__APPROACH || 120);
        if (t && (atDoor || !t[2]) && (t[1] > ap || !t[2])) { gx = t[0].x; gy = t[0].y; }
      } else if (t && (t[1] > (window.__APPROACH || 120) || !t[2])) { gx = t[0].x; gy = t[0].y; }   // 적이 남으면 문이 막힘 — 멀거나 가려 있으면 다가감
      else if (t && G.boss) { gx = P.x; gy = P.y; }                       // 보스 — 제자리에서 쏨
      if (window.__BOSSLEFT && G.boss) { gx = P.x; gy = P.y; }            // 비교용 — 보스방에서 제자리
      let ok = null;
      if (window.__SEEK && t && !t[2] && !G.boss) {                       // 가려서 못 쏨 — 가장 가까운 '쏠 수 있는 자리'까지만 비켜 섬
        const live = G.foes.filter(o => !o.dead && !o.warp);
        ok = (x, y) => live.some(o => { const dx = o.x - x, dy = o.y - y, l = Math.hypot(dx, dy); if (l > 190) return false;
          for (let d = 10; d < l - (o.r || 10) * .6; d += 7) if (propBlocksShot(G.props, x + dx / l * d, y - 3 + dy / l * d)) return false; return true; });
      }
      if (!plan || --planT <= 0 || planRoom !== G.room || ok) { plan = ok ? bfs(gx, gy, ok) : bfs(gx, gy); planT = 8; planRoom = G.room; }
      while (plan.length && Math.hypot(plan[0][0] - P.x, plan[0][1] - P.y) < 5) plan.shift();
      const wp = plan[0] || [gx, gy], dx = wp[0] - P.x, dy = wp[1] - P.y, l = Math.hypot(dx, dy);
      TOUCH.joy = l > 2 ? { dx: dx / l * 40, dy: dy / l * 40 } : null;
    };
    { let v = P.fireCd; Object.defineProperty(P, 'fireCd', { configurable: true, get: () => v, set: x => { if (x === BALANCE.playerFireCd && v <= 0) window.__shots = (window.__shots || 0) + 1; v = x; } }); }
    g.startGame(true);
  }, IMMORTAL);
  let done = false, frames = 0;
  while (!done && frames < 60 * 400) {
    await p.evaluate(() => __step(30)); frames += 30;
    const s = await p.evaluate(() => ({ mode: __game.G.mode, room: __game.G.room, running: __game.RUN.running, el: __game.RUN.elapsed, t: __game.bot().runTime() }));
    if (!s.running && s.el > 0) done = true;
    if (frames % 1800 === 0) console.log('…', (frames / 60).toFixed(0) + 's', s.mode, s.room, (s.t / 1000).toFixed(1));
  }
  const r = await p.evaluate(() => ({ diag: window.__diag, el: __game.RUN.elapsed, log: __log, mode: __game.G.mode, hp: __game.P.hp }));
  console.log('RESULT', done ? (r.el / 1000).toFixed(2) + 's' : 'not finished', '| mode', r.mode, '| hp', r.hp);
  console.log("splits", JSON.stringify(r.log.filter(x => x[0] !== "B")));
  const bl = r.log.filter(x => x[0] === "B"); console.log("bossfight", bl.length ? bl[0].slice(1, 4).join(" ") + " … " + bl[bl.length - 1].slice(1, 4).join(" ") : "");
  console.log('diag', JSON.stringify(r.diag));
  console.log(errs.slice(0, 5));
  await b.close();
})();
