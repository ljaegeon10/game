// 타임어택 자동 플레이 봇 — 가상 시계(1/60초씩 정확히)로 돌려 게임 시간 그대로의 기록을 잼
// 쓰는 법 : python3 build.py && node tools/ta_bot.js [immortal|mortal] [다가갈 거리 px, 기본 120 · 45 가 가장 빠름] [조준 앞서기 0~1] [insta = 던전 적 즉시 처치(걷기만의 하한)]
// 봇은 피하지 않으므로 immortal(안 죽음)로 돌림 — '이론상 기록' 분석용
const { chromium } = require('playwright');
const INSTA = process.argv[5] === 'insta', IMMORTAL = process.argv[2] !== 'mortal', APPROACH = +process.argv[3] || 120, LEAD = process.argv[4] != null ? +process.argv[4] : 1;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
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
  await p.evaluate(([a, l, i]) => { window.__APPROACH = a; window.__LEAD = l; window.__INSTAKILL = i; }, [APPROACH, LEAD, INSTA]);
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
    function bfs(gx, gy) {                              // 격자 6px — 목표에 가장 가까운 닿는 칸까지
      const C = 6, nx = Math.ceil(W / C), ny = Math.ceil(H / C), idx = (i, j) => j * nx + i;
      const si = Math.round(P.x / C), sj = Math.round(P.y / C), prev = new Int32Array(nx * ny).fill(-2);
      const q = [idx(si, sj)]; prev[q[0]] = -1; let best = q[0], bd = 1e9;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], i = c % nx, j = (c / nx) | 0, d = Math.hypot(i * C - gx, j * C - gy);
        if (d < bd) { bd = d; best = c; } if (d < 4) break;
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
    function target() {
      let best = null, bd = 1e9, vis = null, vd = 1e9;
      const look = (o, r = 0) => { if (!o || o.dead || o.warp) return; const d = Math.hypot(o.x - P.x, o.y - P.y) - r;
        if (d < bd) { bd = d; best = o; } if (d < vd && d < 210 && clearShot(o)) { vd = d; vis = o; } };
      (G.foes || []).forEach(o => look(o)); if (G.boss && !G.boss.dead) look(G.boss, G.boss.r || 30);
      return vis ? [vis, vd, true] : best ? [best, bd, false] : null;
    }
    window.__bot = () => {
      ({ W, H } = I());
      if (IMMORTAL) P.inv = Math.max(P.inv, 5);
      if (G.room === 'boss' && ((window.__bt = (window.__bt || 0) + 1) % 60 === 0)) log.push(['B', +(runTime() / 1000).toFixed(1), G.mode, G.boss ? G.boss.kind + ':' + Math.round(G.boss.hp) + (G.boss.inv ? ' inv' + G.boss.inv : '') + (G.boss.phase ? ' ph' + G.boss.phase : '') : 'none', window.__shots]);
      if (G.mode !== window.__lm) { log.push(['mode:' + G.mode, +(runTime() / 1000).toFixed(2), G.boss ? Math.round(G.boss.hp) : '']); window.__lm = G.mode; }
      if (G.room !== lastRoom) { log.push([G.room || (G.inForest ? 'forest' : G.mode), +(runTime() / 1000).toFixed(2), 'shots', window.__shots || 0]); lastRoom = G.room; plan = null; }
      if (['talk', 'note', 'doc'].includes(G.mode)) { onConfirm(); return; }
      if (window.__INSTAKILL && G.mode === 'play' && !G.inForest && G.room !== 'boss' && G.foes.some(f => !f.dead)) g.devKillAll();   // 걷기만의 하한
      if (G.mode !== 'play' && G.mode !== 'forest') { TOUCH.joy = null; mouse.down = false; return; }
      const pt = promptText();
      if (/우물|관문 열기|마지막 열쇠|탈출/.test(pt)) onConfirm();
      // 쏘기 — 가장 가까운 적, 탄이 닿을 때쯤의 자리를 노림
      const t = !G.inForest && target();
      if (t && t[2]) { const o = t[0], d = Math.hypot(o.x - P.x, o.y - P.y), tt = d / BALANCE.bulletSpeed;
        const vx = o.vx || 0, vy = o.vy || 0; mouse.x = o.x + vx * tt * (window.__LEAD ?? 1) - CAM.x; mouse.y = o.y + vy * tt * (window.__LEAD ?? 1) - CAM.y; mouse.down = true; }
      else mouse.down = false;
      // 걷기
      let [gx, gy] = goal();
      if (t && (t[1] > (window.__APPROACH || 120) || !t[2])) { gx = t[0].x; gy = t[0].y; }   // 적이 남으면 문이 막힘 — 멀거나 가려 있으면 다가감
      else if (t && G.boss) { gx = P.x; gy = P.y; }                       // 보스 — 제자리에서 쏨
      if (!plan || --planT <= 0 || planRoom !== G.room) { plan = bfs(gx, gy); planT = 8; planRoom = G.room; }
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
  const r = await p.evaluate(() => ({ el: __game.RUN.elapsed, log: __log, mode: __game.G.mode, hp: __game.P.hp }));
  console.log('RESULT', done ? (r.el / 1000).toFixed(2) + 's' : 'not finished', '| mode', r.mode, '| hp', r.hp);
  console.log("splits", JSON.stringify(r.log.filter(x => x[0] !== "B")));
  const bl = r.log.filter(x => x[0] === "B"); console.log("bossfight", bl.length ? bl[0].slice(1, 4).join(" ") + " … " + bl[bl.length - 1].slice(1, 4).join(" ") : "");
  console.log(errs.slice(0, 5));
  await b.close();
})();
