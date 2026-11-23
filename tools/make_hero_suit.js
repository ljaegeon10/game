/* 게임 안 주인공 — 방호복 3D 모델(assets/hazmat_runner.glb → js/hazmat.js)을 위에서 비스듬히 내려다본 그림으로 미리 굽습니다 → js/hero_suit.js
   (게임 중엔 WebGL 을 쓰지 않음 — 타임어택 · 성능 낮은 기기에서도 그림 한 장 찍는 값)

   한 칸 36×50 (게임 화면 픽셀) · 네 방향(아래 · 위 · 왼 · 오른) × 9장(서 있기 1 + 걷기 8)
     lo : 게임 해상도 그대로의 도트 그림 (가장자리는 계단 · 1px 짙은 외곽선) — 화면 효과가 덮일 때 · 깨질 때 · 컷신
     hi : 4배 해상도 (144×200) — 평소엔 이걸 게임 화면 위의 얇은 층에 얹어 모델링 그대로 또렷하게 (game.js heroHi)

   쓰는 법 :  node tools/make_hero_suit.js [미리보기.png]      (playwright + chromium 필요)
   모델 · 조명 · 비율을 바꿨으면 다시 돌리세요. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FW = 36, FH = 50, K = 4, COLS = 9, FEET = 48, BODY = 45;      // 칸 크기 · 배율 · 한 방향의 장 수 · 발바닥 줄 · 몸 높이(게임 픽셀)
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  for (const f of ['labroom', 'hazmat_model', 'hazmat', 'figure3d']) await p.addScriptTag({ path: path.join(ROOT, 'js/' + f + '.js') });
  const out = await p.evaluate(async ({ FW, FH, K, COLS, FEET, BODY }) => {
    await Hazmat.whenReady(); await new Promise(r => setTimeout(r, 300));
    const { M4 } = Fig3DUtil;
    const S = 960, F = new Figure3D(S, S);
    // 카메라는 그대로 두고(셰이더가 카메라를 원점으로 봄) 사람을 돌려 놓음 — 위에서 약 29° 내려다보는 자리
    const V = M4.chain(M4.T(0, -.78, -3.5), M4.RX(.5));
    const env0 = { cam: { f: 1350, px: S / 2, py: S / 2 }, sky: [0, 0, 0], gnd: [0, 0, 0], fog: [0, 0, 0], near: 1, lights: [] };
    F.render({ kind: 'suit', x: 0, y: 0, z: 0, yaw: 0, stride: 0 }, env0);                    // 뼈대 모델 붙이기
    const hz = F.hz, d0 = hz.draw.bind(hz); hz.draw = (base, VP, fig, env) => d0(M4.mul(V, base), VP, fig, env);
    const g0 = F.drawGear.bind(F); F.drawGear = base => g0(M4.mul(V, base));
    // 조명 — 포스터 · 시작 화면의 그 방호복 : 청록빛 주광, 뒤 위에서 윤곽을 따라 흐르는 밝은 청록, 아래는 가라앉게
    const env = { cam: { f: 1350, px: S / 2, py: S / 2 }, sky: [.16, .36, .37], gnd: [.03, .08, .09], fog: [0, 0, 0], near: 1, red: [0, 0, 0, 0],
      lights: [[[-1.6, 3.0, 3.0], [1.6, 4.0, 3.25]],        // 주광 — 왼쪽 위 앞
               [[2.6, 1.0, 2.6], [.62, 1.7, 1.75]],          // 오른쪽 앞을 옅게 (가슴 · 마스크가 묻히지 않게)
               [[.6, 3.2, -6.2], [.7, 4.2, 4.8]],          // 뒤 위 — 후드 · 어깨 윤곽
               [[-2.2, .2, -5.0], [.1, .9, 1.1]]] };        // 뒤 아래 — 다리 윤곽
    const shape = { head: 1.62, legs: .78 };                 // 작게 찍혀도 알아보게 — 머리 1.6배 · 다리 0.78배
    const yaws = [0, Math.PI, -Math.PI / 2, Math.PI / 2];   // 아래(이쪽을 봄) · 위 · 왼 · 오른
    const shots = [];
    for (let r = 0; r < 4; r++) for (let k = 0; k < COLS; k++) {
      const idle = k === 0;
      const fig = { kind: 'suit', x: 0, y: 0, z: 0, yaw: yaws[r], stride: idle ? 0 : .72, run: idle ? 0 : (k - 1) / (COLS - 1) * Math.PI * 2, reach: 0, lean: idle ? .02 : .13, alpha: 1, t: 0, shape };
      const c = document.createElement('canvas'); c.width = c.height = S; c.getContext('2d').drawImage(F.render(fig, env), 0, 0);
      shots.push(c);
    }
    // 자를 틀 — 서 있는 앞모습의 키를 BODY 픽셀로, 발바닥을 FEET 줄에. 모든 장에 같은 틀 (걸음의 오르내림 · 팔 흔들림이 그대로 남게)
    const bb = c => { const d = c.getContext('2d').getImageData(0, 0, S, S).data; let y0 = S, y1 = 0, x0 = S, x1 = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 40) { if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; } return { x0, y0, x1, y1 }; };
    const b0 = bb(shots[0]), u = (b0.y1 - b0.y0 + 1) / BODY;                // 게임 픽셀 하나 = 찍은 그림의 u 픽셀
    const CW = FW * u, CH = FH * u, CX = S / 2 - CW / 2, CY = b0.y1 + 1 - FEET * u;
    let wide = 0; shots.forEach(c => { const q = bb(c); wide = Math.max(wide, (S / 2 - q.x0) / u, (q.x1 - S / 2) / u); });
    // 색 — 노란 방호복에 청록 조명이라 연두로 나옴 → 포스터처럼 짙은 에메랄드 쪽으로, 그늘은 더 깊게
    const grade = c => { const x = c.getContext('2d'), id = x.getImageData(0, 0, c.width, c.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue;
        let r = d[i], g = d[i + 1], bl = d[i + 2];
        const gr = Math.max(0, g - Math.max(r, bl));                          // 초록이 도드라진 만큼 (방호복 천)
        bl = Math.min(255, bl + gr * .36); r = Math.max(0, r - gr * .42); g = g * .93;
        // 게임 화면엔 색 보정 필터가 걸림 (css body.topview #game · #herohi — contrast 1.14 → saturate 1.3 → brightness 1.2).
        // 그대로 두면 형광으로 날아가 입체감이 묻히므로 거꾸로 풀어 둠 (밝기 → 채도 → 대비의 역순) — 필터를 거친 뒤에 의도한 색
        r /= 255 * 1.2; g /= 255 * 1.2; bl /= 255 * 1.2;
        const L = .213 * r + .715 * g + .072 * bl, k = 1 / 1.3; r = L + (r - L) * k; g = L + (g - L) * k; bl = L + (bl - L) * k;
        r = (r - .5) / 1.14 + .5; g = (g - .5) / 1.14 + .5; bl = (bl - .5) / 1.14 + .5;
        d[i] = Math.max(0, Math.min(255, r * 255)); d[i + 1] = Math.max(0, Math.min(255, g * 255)); d[i + 2] = Math.max(0, Math.min(255, bl * 255)); }
      x.putImageData(id, 0, 0); return c; };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const hi = mk(FW * K * COLS, FH * K * 4), lo = mk(FW * COLS, FH * 4);
    const hx = hi.getContext('2d'), lx = lo.getContext('2d');
    shots.forEach((src, i) => {
      const r = Math.floor(i / COLS), k = i % COLS;
      // 큰 그림 → 4배 칸 : 한 번에 줄이면 거칠어서 두 번에 (8배 → 4배)
      const a = mk(FW * K * 2, FH * K * 2), ax = a.getContext('2d'); ax.imageSmoothingQuality = 'high'; ax.drawImage(src, CX, CY, CW, CH, 0, 0, a.width, a.height);
      const h4 = mk(FW * K, FH * K), h4x = h4.getContext('2d'); h4x.imageSmoothingQuality = 'high'; h4x.drawImage(a, 0, 0, h4.width, h4.height);
      grade(h4);
      // 가장자리 한 겹 짙은 테두리 — 밝은 바닥 · 초록 숲 위에서도 몸이 묻히지 않게 (뒤에 깔고 그 위에 본 그림)
      const ol = mk(FW * K, FH * K), ox = ol.getContext('2d');
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) ox.drawImage(h4, dx * 1.5, dy * 1.5);
      ox.globalCompositeOperation = 'source-in'; ox.fillStyle = 'rgba(4,12,12,.9)'; ox.fillRect(0, 0, ol.width, ol.height);
      hx.drawImage(ol, k * FW * K, r * FH * K); hx.drawImage(h4, k * FW * K, r * FH * K);
      // 게임 해상도 도트 — 4배 칸을 반씩 두 번 (정확한 2×2 평균), 알파는 있음 / 없음으로, 1px 외곽선
      const h2 = mk(FW * 2, FH * 2), h2x = h2.getContext('2d'); h2x.drawImage(h4, 0, 0, h2.width, h2.height);
      const l1 = mk(FW, FH), l1x = l1.getContext('2d'); l1x.drawImage(h2, 0, 0, FW, FH);
      const id = l1x.getImageData(0, 0, FW, FH), d = id.data, m = new Uint8Array(FW * FH);
      for (let j = 0; j < FW * FH; j++) m[j] = d[j * 4 + 3] >= 118 ? 1 : 0;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const j = y * FW + x, q = j * 4;
        if (m[j]) { const a2 = d[q + 3] / 255; for (let c2 = 0; c2 < 3; c2++) d[q + c2] = Math.min(255, Math.round(d[q + c2] / Math.max(a2, .45) * (a2 < 1 ? .96 : 1))); d[q + 3] = 255; }
        else { const e = (x > 0 && m[j - 1]) || (x < FW - 1 && m[j + 1]) || (y > 0 && m[j - FW]) || (y < FH - 1 && m[j + FW]);
          if (e) { d[q] = 5; d[q + 1] = 14; d[q + 2] = 14; d[q + 3] = 255; } else d[q + 3] = 0; } }
      l1x.putImageData(id, 0, 0);
      lx.drawImage(l1, k * FW, r * FH);
    });
    // 미리보기 — 어두운 바닥 위에 4배 그림, 그 아래 도트 그림(4배로 키워)
    const pv = mk(hi.width, hi.height * 2), px = pv.getContext('2d'); px.fillStyle = '#1d1826'; px.fillRect(0, 0, pv.width, pv.height);
    px.fillStyle = '#2f4a2c'; px.fillRect(0, hi.height * .5, pv.width, hi.height * .5); px.fillRect(0, hi.height * 1.5, pv.width, hi.height * .5);
    px.drawImage(hi, 0, 0); px.imageSmoothingEnabled = false; px.drawImage(lo, 0, hi.height, hi.width, hi.height);
    return { hi: hi.toDataURL('image/webp', .93), lo: lo.toDataURL('image/png'), pv: pv.toDataURL('image/png'), wide: wide.toFixed(1), u: u.toFixed(2), box: b0 };
  }, { FW, FH, K, COLS, FEET, BODY });
  await b.close();
  const js = `// 이 파일은 tools/make_hero_suit.js 가 생성합니다. 직접 고치지 마세요.
// 게임 안 주인공 — 방호복 3D 모델을 위에서 비스듬히 내려다본 그림. 한 칸 ${FW}×${FH}(게임 픽셀), 줄 = 아래 · 위 · 왼 · 오른, 칸 = 서 있기 + 걷기 ${COLS - 1}장.
// lo : 게임 해상도 도트 그림 (PNG) · hi : ${K}배 해상도 (WebP) — game.js 의 suitArt · heroHi
window.HERO_SUIT = { fw: ${FW}, fh: ${FH}, k: ${K}, cols: ${COLS}, feet: ${FEET},
  lo: '${out.lo}',
  hi: '${out.hi}' };
`;
  fs.writeFileSync(path.join(ROOT, 'js/hero_suit.js'), js);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], Buffer.from(out.pv.split(',')[1], 'base64'));
  console.log('js/hero_suit.js', (js.length / 1024).toFixed(0) + ' KB', '| 가장 넓은 반폭', out.wide, 'px (칸 반폭 ' + FW / 2 + ') | 배율', out.u, JSON.stringify(out.box));
})();
