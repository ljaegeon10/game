'use strict';
/* ═══════════════════════════════════════════════════════════════
   wellshaft.js — 우물 바닥에서 올려다본 통로 (추락 직후 눈을 뜨는 장면)

   예전엔 타원 호를 겹쳐 그려 종이를 오려 붙인 것처럼 평평했습니다. 이제 진짜 원통 안쪽을
   픽셀마다 계산해(광선 → 벽) 한 장으로 구워 둡니다 — WebGL 없이, 어느 브라우저에서나 같게.

     · 돌 — 켜마다 엇갈려 쌓인 돌, 돌마다 크기 · 빛깔이 다르고 모서리가 깎여 있음.
            빛이 위(입구)에서 오므로 돌의 윗모서리는 빛을 받고 아랫면 · 줄눈은 그늘.
     · 깊이 — 입구에서 멀어질수록 빛이 잦아들어 바닥 쪽은 거의 어둠. 통로는 살짝 찌그러진 원.
     · 세월 — 위쪽에 번진 이끼 · 벽을 타고 내린 물자국(젖은 빛) · 입구 가까이 늘어진 뿌리.
     · 사다리 — 한쪽 벽의 쇠 사다리가 중간에서 끊겨 있음 ("사다리도 부서졌네").
     · 입구 — 해 질 녘 하늘 한 조각, 그 앞을 가로지른 도르래 들보 · 지붕 그림자.
   그 위에 매 장 : 숨(미세한 흔들림) · 입구의 빛 번짐과 빛기둥 · 끊어져 흔들리는 두레박 줄 · 먼지 · 떨어지는 물방울.

   쓰는 곳 : game.js renderWakeup()
   ═══════════════════════════════════════════════════════════════ */
(() => {
const BW = 1344, BH = 756;                 // 구운 그림 (16:9)
const CX = BW / 2, CY = BH * .40;          // 입구가 보이는 자리 — 화면 가운데보다 조금 위
const S = BH * .92, F = 1.1;               // 화면 배율 · 초점
const ZTOP = 12.5;                         // 우물 깊이 (통로 반지름의 배수)
const HC = .40, NS = 15;                   // 돌 한 켜의 높이 · 한 바퀴의 돌 수
const TAU = Math.PI * 2;

const h1 = n => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
const h2 = (x, y) => h1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));
function vn(x, y) {                         // 부드러운 잡음 0‥1
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vn(x, y) * .55 + vn(x * 2.1 + 5.2, y * 2.1 + 1.7) * .3 + vn(x * 4.3 + 9.1, y * 4.3 + 3.3) * .15;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sm = (a, b, x) => { const k = sat((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const radiusAt = th => 1 + .04 * Math.sin(th * 3 + 1.3) + .022 * Math.sin(th * 7 + .4) + .012 * Math.sin(th * 13);

/* 사다리 — 벽의 각도 LA 근처, 입구에서 내려오다 ZBREAK 에서 끊김 (한쪽 난간만 조금 더 내려와 휘어 있음) */
const LA = 2.05, LW = .13, ZBREAK = 5.6, ZBREAK2 = 4.2;

/* 굽기는 줄 단위로 나눠서 — 한꺼번에 하면 0.5초쯤 멈칫하므로, 게임이 시작되면 틈틈이 조금씩 (prebake) */
let JOB = null;
function bakeRows(y0, y1) {
  if (!JOB) { const cv = document.createElement('canvas'); cv.width = BW; cv.height = BH; const c = cv.getContext('2d'); JOB = { cv, c, id: c.createImageData(BW, BH), y: 0 }; }
  const d = JOB.id.data;
  const sun = 5.3;                           // 저녁 해가 드는 쪽 (각도)
  for (let py = y0; py < y1; py++) {
    for (let px = 0; px < BW; px++) {
      const dx = (px - CX) / S, dy = (py - CY) / S, r = Math.hypot(dx, dy) + 1e-6;
      const th = Math.atan2(dy, dx), tw = th < 0 ? th + TAU : th, R = radiusAt(th);
      const z = F * R / r;
      let cr, cg, cb;
      if (z >= ZTOP) {                       // ── 입구 너머 — 해 질 녘 하늘
        const k = sat(.5 + dy / (F / ZTOP) * .5);
        cr = 150 + k * 60; cg = 166 + k * 22; cb = 196 - k * 34;
        const cl = fbm(px * .02, py * .03) ; cr += cl * 26; cg += cl * 18; cb += cl * 10;
      } else {
        // ── 벽 — 돌 켜
        const row = Math.floor(z / HC), fv = z / HC - row;                       // fv 1 = 돌의 위쪽(입구 쪽)
        const off = (row & 1) * .5 + h1(row * 131 + 7) * .35;
        const uu = tw / TAU * NS + off, col = Math.floor(uu), fu = uu - col;
        const sid = ((col % NS) + NS) % NS + row * 977, tint = h1(sid * 3 + 1), tint2 = h1(sid * 7 + 5);
        // 돌마다 줄눈 폭 · 모서리가 조금씩 다름
        const mw = .055 + tint2 * .04, mh = .085 + tint * .05;
        const eu = Math.min(fu, 1 - fu), ev = Math.min(fv, 1 - fv);
        const wob = (vn(tw * 9 + row * 3.1, z * 6) - .5) * .05;
        const inU = sm(mw + wob, mw + .09 + wob, eu), inV = sm(mh + wob, mh + .13 + wob, ev), stone = inU * inV;   // 0 줄눈 · 1 돌
        // 화면에서 한 켜가 너무 얇아지는 먼 곳은 무늬를 평균으로 흐림 (자글거림 방지)
        const rowPx = HC * r * S / z, fade = sat((rowPx - 1.3) / 3.2);
        // 빛 — 입구에서 내려옴. 깊을수록 잦아들고, 해가 드는 쪽 벽이 더 밝음
        const depth = ZTOP - z;
        let L = .075 + 1.5 * Math.exp(-depth / 2.9) + .62 * Math.exp(-depth / 8.5);
        L *= 1 + .38 * Math.cos(th - sun) * Math.exp(-depth / 4);
        // 돌의 굴곡 — 윗모서리는 빛, 아랫모서리는 그늘, 옆모서리는 옅게
        const top = sm(.62, .98, fv) * inU, bot = sm(.38, .02, fv) * inU, side = (1 - inU) * inV;
        let relief = 1 + (top * .85 - bot * .62 - side * .25) * fade;
        const grain = fbm(tw * 26 + sid, z * 30) - .5, pit = sm(.62, .8, vn(tw * 60 + sid * .7, z * 55));
        relief += (grain * .5 - pit * .28) * fade * stone;
        // 돌빛 — 푸르스름한 회색, 돌마다 조금씩 다르게. 줄눈은 어둡게
        const base = (.30 + tint * .2) * (stone * fade + (1 - fade) * .78) + .07 * (1 - stone) * fade;
        cr = base * (.94 + tint2 * .1); cg = base * .97; cb = base * (1.06 + (1 - tint2) * .08);
        // 이끼 — 입구 가까이 · 줄눈과 돌 윗면에 번짐
        const mossN = fbm(tw * 5 + 3, z * 2.2 + 7), mossK = sat((mossN - .52 + sat(1 - depth / 7) * .2) * 3.2) * (.45 + .55 * (1 - stone * .7)) * sat(1.15 - depth / 9.5);
        cr = cr * (1 - mossK) + .12 * mossK; cg = cg * (1 - mossK) + .24 * mossK; cb = cb * (1 - mossK) + .11 * mossK;
        // 물자국 — 세로로 흘러내린 젖은 줄, 어둡고 반들거림
        const wet = sm(.7, .9, vn(tw * 17 + 2, z * .35)) * sat(depth / 2) * (.6 + .4 * vn(tw * 40, z * 3));
        cr *= 1 - wet * .45; cg *= 1 - wet * .4; cb *= 1 - wet * .32;
        let spec = wet * top * 1.2 * Math.exp(-depth / 5);
        // 뿌리 — 입구 가까이서 벽을 타고 늘어짐
        const rootId = Math.floor(tw * 7.2), rootA = (rootId + .5) / 7.2 + (vn(z * 1.4, rootId * 9.1) - .5) * .09, rootLen = 1.4 + h1(rootId * 53 + 3) * 3.4;
        const rw = (.014 + .01 * h1(rootId * 17)) * sat(1 - depth / rootLen) / Math.max(.35, R), rd = Math.abs(tw - rootA);
        if (h1(rootId * 29 + 11) > .35 && depth < rootLen && rd < rw * 2.2) {
          const k = sm(rw * 2.2, rw * .5, rd), sh = .5 + .5 * sm(rw, 0, rd);
          cr = cr * (1 - k) + (.2 * sh) * k; cg = cg * (1 - k) + (.15 * sh) * k; cb = cb * (1 - k) + (.1 * sh) * k; relief = relief * (1 - k) + (1.05 + sh * .3) * k;
        } else if (h1(rootId * 29 + 11) > .35 && depth < rootLen && rd < rw * 4.5 && tw > rootA) { L *= .72; }   // 뿌리 그림자
        // 쇠 사다리 — 난간 둘 · 가로대, 중간에서 끊김
        let da = tw - LA; if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU;
        const railW = .02, ad = Math.abs(Math.abs(da) - LW);
        const onL = da < 0 ? z > ZBREAK2 : z > ZBREAK, between = Math.abs(da) < LW, zr = z / .52, rung = Math.abs(zr - Math.round(zr)) * .52;
        const bend = da < 0 && z < ZBREAK2 + 1 ? (ZBREAK2 + 1 - z) * .035 : 0;
        if (Math.abs(Math.abs(da + bend) - LW) < railW && onL) {
          const k = sm(railW, railW * .3, Math.abs(Math.abs(da + bend) - LW));
          cr = cr * (1 - k) + .3 * k; cg = cg * (1 - k) + .17 * k; cb = cb * (1 - k) + .11 * k; relief = relief * (1 - k) + 1.7 * k; spec += k * .3 * Math.exp(-depth / 6);
        } else if (between && z > ZBREAK && rung < .05 && Math.round(zr) * .52 > ZBREAK + .2) {
          const k = sm(.05, .012, rung);
          cr = cr * (1 - k) + .28 * k; cg = cg * (1 - k) + .16 * k; cb = cb * (1 - k) + .1 * k; relief = relief * (1 - k) + (1.2 + .5 * (zr > Math.round(zr) ? 1 : 0)) * k;
        } else if (onL && da + bend - LW > 0 && da + bend - LW < railW * 5 || (between && z > ZBREAK && rung < .075 && zr < Math.round(zr))) L *= .7;   // 사다리 그림자
        // 입구 테두리 — 맨 위 돌은 하늘빛을 받아 밝게 빛남
        const rim = sm(1.1, 0, depth);
        const li = L * Math.max(.05, relief) + rim * .5 + spec;
        // 빛깔 — 위는 차가운 하늘빛, 깊은 곳은 푸르게 가라앉음
        const cool = sat(depth / 8);
        cr = cr * li * (1.02 - cool * .2) * 255; cg = cg * li * (1.0 - cool * .08) * 255; cb = cb * li * (1.06 + cool * .16) * 255;
        // 아주 가까운 벽(화면 가장자리)은 어둠에 묻힘
        const near = sm(1.15, .62, z);
        cr *= 1 - near * .8; cg *= 1 - near * .8; cb *= 1 - near * .76;
      }
      const i = (py * BW + px) * 4, dn = (h2(px, py) - .5) * 3;                 // 띠 지지 않게 아주 옅은 잡티
      d[i] = cr + dn; d[i + 1] = cg + dn; d[i + 2] = cb + dn; d[i + 3] = 255;
    }
  }
}
function bakeFinish() {
  const { cv, c, id } = JOB;
  c.putImageData(id, 0, 0);
  // ── 입구 앞 — 지붕 그림자와 도르래 들보, 감긴 줄 (하늘을 등진 실루엣)
  const mr = F / ZTOP * S;
  c.save(); c.beginPath(); c.arc(CX, CY, mr * 1.07, 0, TAU); c.clip();
  c.fillStyle = 'rgba(14,13,17,.96)';
  c.beginPath(); c.moveTo(CX - mr * 1.3, CY - mr * 1.2); c.lineTo(CX + mr * 1.3, CY - mr * 1.2); c.lineTo(CX + mr * 1.3, CY - mr * .5); c.lineTo(CX, CY - mr * .78); c.lineTo(CX - mr * 1.3, CY - mr * .42); c.fill();   // 지붕
  c.save(); c.translate(CX, CY + mr * .06); c.rotate(-.1);
  c.fillRect(-mr * 1.3, -mr * .085, mr * 2.6, mr * .17);                                   // 들보
  c.fillStyle = 'rgba(30,26,24,.96)'; c.fillRect(-mr * .2, -mr * .15, mr * .4, mr * .3);    // 감긴 줄
  c.strokeStyle = 'rgba(70,62,54,.7)'; c.lineWidth = 1; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * mr * .055, -mr * .15); c.lineTo(i * mr * .055, mr * .15); c.stroke(); }
  c.restore();
  // 오방색 지붕 띠가 살짝 보임
  ['#2f6fb5', '#f1ece0', '#c2352c', '#15141b', '#e3b23c'].forEach((col, i) => { c.fillStyle = col; c.globalAlpha = .5; c.fillRect(CX - mr * .5 + i * mr * .2, CY - mr * .66 + i * mr * .012, mr * .2, mr * .05); });
  c.restore();
  return cv;
}

let IMG = null;
const W_ = 576, H_ = 324;                   // 게임 화면 좌표
const drops = [];
window.WellShaft = {
  ready: () => !!IMG,
  bake() { if (!IMG) { bakeRows(JOB ? JOB.y : 0, BH); IMG = bakeFinish(); JOB = null; } return IMG; },
  /* 틈틈이 조금씩 구워 둠 — 한 번에 18줄, 다 되면 끝 */
  prebake() {
    if (IMG || (JOB && JOB.busy)) return;
    const step = () => {
      if (IMG) return;
      const y0 = JOB ? JOB.y : 0, y1 = Math.min(BH, y0 + 18);
      bakeRows(y0, y1); JOB.y = y1; JOB.busy = true;
      if (y1 >= BH) { IMG = bakeFinish(); JOB = null; } else setTimeout(step, 30);
    };
    setTimeout(step, 400);
  },
  /* g : 그릴 곳 (576×324 좌표) · t : 프레임 · o : 눈 뜬 정도 0‥1 · breathe : 숨에 따른 세로 흔들림(px) · dust : 먼지 [{x, y, life, max}] */
  draw(g, t, o, breathe, dust) {
    const img = this.bake(), cx = W_ / 2, cy = H_ * .40 + breathe, k = W_ / BW;
    // 숨 — 아주 미세하게 오르내리고 기울어짐 (정지 화면처럼 굳지 않게). 가장자리가 드러나지 않게 살짝 키워서
    const sway = Math.sin(t * .011) * .006, zoom = 1.035 + Math.sin(t * .017) * .004;
    g.save();
    g.translate(cx, cy); g.rotate(sway); g.scale(zoom, zoom);
    g.drawImage(img, -CX * k, -CY * k, BW * k, BH * k);
    g.restore();
    const mr = F / ZTOP * S * k * zoom;
    // 입구의 빛 번짐 — 어둠에 익은 눈엔 하늘이 눈부심
    g.save(); g.globalCompositeOperation = 'lighter';
    let lg = g.createRadialGradient(cx, cy, mr * .4, cx, cy, mr * 7);
    lg.addColorStop(0, `rgba(170,188,220,${.26 + (1 - o) * .3})`); lg.addColorStop(.16, 'rgba(120,136,168,.17)'); lg.addColorStop(.5, 'rgba(50,58,80,.06)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg; g.fillRect(0, 0, W_, H_);
    // 빛기둥 — 입구에서 아래로 퍼지며 먼지를 비춤 (결이 지게 여러 겹)
    for (let i = 0; i < 14; i++) {
      const u = i / 13, w0 = mr * (.9 - u * .75), w1 = 175 - u * 150, sh = Math.sin(t * .006 + i * .9) * (2 + u * 5);
      const bg = g.createLinearGradient(0, cy, 0, H_ + 40);
      bg.addColorStop(0, `rgba(160,178,210,${(.018 + u * .012) * (1 + o * .5)})`); bg.addColorStop(.75, 'rgba(160,178,210,.004)'); bg.addColorStop(1, 'rgba(160,178,210,0)');
      g.fillStyle = bg; g.beginPath(); g.moveTo(cx - w0, cy); g.lineTo(cx + w0, cy); g.lineTo(cx + w1 + sh, H_ + 40); g.lineTo(cx - w1 + sh, H_ + 40); g.closePath(); g.fill();
    }
    g.restore();
    // 끊어진 두레박 줄 — 들보에서 내려와 중간에서 풀린 채 천천히 흔들림 (가까울수록 굵게)
    {
      const ph = Math.sin(t * .021) * .5 + Math.sin(t * .0083 + 1) * .3;
      g.save(); g.lineCap = 'round';
      let prev = null;
      for (let i = 0; i <= 26; i++) {
        const u = i / 26, z = ZTOP - .3 - u * u * 10.4 - u * .3, hang = (ZTOP - z) / ZTOP;                // 줄의 높이 — 위에서 아래로
        const ox = .16 + ph * .1 * hang * hang, oy = .2 + .06 * hang + Math.cos(t * .017) * .03 * hang * hang;
        const sx = cx + ox * F / z * S * k * zoom, sy = cy + oy * F / z * S * k * zoom, wd = Math.max(.5, .02 * F / z * S * k);
        if (prev) {
          g.strokeStyle = `rgba(${(60 + hang * 30) | 0},${(50 + hang * 22) | 0},${(40 + hang * 14) | 0},${.55 + hang * .45})`; g.lineWidth = wd;
          g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(sx, sy); g.stroke();
          if (i % 2) { g.strokeStyle = 'rgba(20,16,12,.5)'; g.lineWidth = Math.max(.3, wd * .3); g.beginPath(); g.moveTo(prev[0] - wd * .3, prev[1]); g.lineTo(sx + wd * .3, sy); g.stroke(); }   // 꼬임
        }
        prev = [sx, sy, wd];
      }
      // 풀린 끝 — 올이 갈라짐
      g.strokeStyle = 'rgba(96,80,58,.85)'; g.lineWidth = Math.max(.4, prev[2] * .28);
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(prev[0] + i * prev[2] * .7 + ph * 2, prev[1] + prev[2] * (2.2 - Math.abs(i) * .4)); g.stroke(); }
      g.restore();
    }
    // 먼지 — 빛기둥 안에서만 반짝임, 가까운 것은 크고 흐리게
    g.save(); g.globalCompositeOperation = 'lighter';
    if (dust) for (const f of dust) {
      if (f.k !== 'dust') continue;
      const dd = Math.abs(f.x - cx) / (40 + (f.y - cy) * .55);
      if (dd > 1 || f.y < cy) continue;
      const big = ((f.max * 7 + (f.vy * 100 | 0)) % 5) === 0;
      g.globalAlpha = (1 - dd) * (f.life / f.max) * (big ? .28 : .7);
      g.fillStyle = 'rgba(220,228,240,1)';
      if (big) { g.beginPath(); g.arc(f.x, f.y, 2.2, 0, TAU); g.fill(); } else g.fillRect(f.x, f.y, 1, 1.6);
    }
    g.restore();
    // 물방울 — 가끔 입구 쪽 돌에서 떨어져 얼굴 쪽으로 (커지며 지나감)
    if (o > .6 && t % 97 === 0) drops.push({ a: Math.random() * TAU, z: ZTOP - 1.5, r0: .55 + Math.random() * .3 });
    g.save();
    for (const dr of drops) {
      dr.z -= .12 + (ZTOP - dr.z) * .035;
      const sx = cx + Math.cos(dr.a) * dr.r0 * F / dr.z * S * k, sy = cy + Math.sin(dr.a) * dr.r0 * F / dr.z * S * k, rr = Math.max(.6, .02 * F / dr.z * S * k);
      g.fillStyle = `rgba(190,206,230,${sat(.2 + (ZTOP - dr.z) / ZTOP * .5)})`;
      g.beginPath(); g.ellipse(sx, sy, rr * .7, rr * 1.5, Math.atan2(sy - cy, sx - cx) + Math.PI / 2, 0, TAU); g.fill();
    }
    g.restore();
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].z < .9) drops.splice(i, 1);
    // 가장자리 어둠 — 누운 채 올려다보는 좁은 시야
    const vg = g.createRadialGradient(cx, cy + 20, 70, cx, cy + 20, 330);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.8)');
    g.fillStyle = vg; g.fillRect(0, 0, W_, H_);
  }
};
})();
