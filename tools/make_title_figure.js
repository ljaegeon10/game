/* 시작 화면의 방호복 그림을 미리 굽습니다 → js/title_figure.js
   (브라우저의 WebGL 에 기대지 않도록 — 파이어폭스 등에서 3D 가 안 나와도 시작 화면엔 늘 보이게)

   쓰는 법 :  node tools/make_title_figure.js      (playwright + chromium 필요)
   인물 모델(js/figure3d.js)이나 시작 화면의 조명을 바꿨으면 다시 돌리세요. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await p.addScriptTag({ path: path.join(ROOT, 'js/labroom.js') });
  await p.addScriptTag({ path: path.join(ROOT, 'js/figure3d.js') });
  const out = await p.evaluate(() => {
    const W = 1920, H = 1200;                              // 16:10 틀 — 16:9 에선 위아래를 60px 씩 잘라 씀
    const F = new Figure3D(W, H); F.k = W / 960;
    const ex = (H / W * 960 - 540) / 2;
    const img = F.render({ kind: 'suit', x: -.02, y: -1.47, z: 1.06, yaw: .62, stride: 0, reach: 0, lean: .2, alpha: 1 }, {
      cam: { f: 560, px: 262, py: 272 + ex }, sky: [.022, .04, .05], gnd: [.006, .01, .012], fog: [0, 0, 0], near: 1, red: [0, 0, 0, 0],
      lights: [[[1.5, .75, -1.75], [.3, 1.5, 1.65]],        // 제목 쪽 뒤에서 — 윤곽을 따라 흐르는 청록
               [[1.1, .2, -.55], [.03, .16, .18]],          // 앞을 아주 옅게
               [[-.9, 1.6, -1.6], [.07, .1, .13]],          // 반대편 위 — 어깨선만
               [[.35, -.5, -.6], [.0, .05, .05]]] });
    const o = document.createElement('canvas'); o.width = W; o.height = H;
    const c = o.getContext('2d'); c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, k = document.createElement('canvas'); k.width = w; k.height = h;
    k.getContext('2d').drawImage(o, x0, y0, w, h, 0, 0, w, h);
    return { src: k.toDataURL('image/webp', .92), x: x0, y: y0, w, h, fw: W, fh: H };
  });
  await b.close();
  const js = `// 이 파일은 tools/make_title_figure.js 가 생성합니다. 직접 고치지 마세요.
// 시작 화면의 방호복 — figure3d.js 의 3D 모델을 미리 찍어 둔 그림 (투명 배경 WebP).
// 1920×1200(16:10) 틀 안의 자리 (x, y, w, h). 16:9 에선 틀 위아래를 잘라 씁니다 (titlescreen.js).
window.TITLE_FIG = { x: ${out.x}, y: ${out.y}, w: ${out.w}, h: ${out.h}, fw: ${out.fw}, fh: ${out.fh},
  src: '${out.src}' };
`;
  fs.writeFileSync(path.join(ROOT, 'js/title_figure.js'), js);
  console.log('js/title_figure.js', (js.length / 1024).toFixed(0) + ' KB', out.x, out.y, out.w, out.h);
})();
