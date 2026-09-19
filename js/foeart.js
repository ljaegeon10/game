/* ═══════════════════════════════════════════════════════════
   foeart.js — 잡몹 생김새

   전에는 일곱 종이 한 장의 그림을 색만 돌려 쓰고 있어서, 무엇이
   달려들고 무엇이 뱉는지 색으로만 구별해야 했습니다. 이제는 몸이
   사는 방식대로 자랐습니다 — 실루엣만 봐도 뭘 할 놈인지 압니다.

     버섯   : 기본형. 넓고 둔한 갓에 굵은 자루. 그냥 다가옵니다.
     뱉는것 : 갓이 앞으로 말려 나팔이 되었고, 목주머니가 차오릅니다.
              → 주머니가 부풀면 곧 뱉습니다.
     포자충 : 갓이 뒤집힌 대접이라 늘 무언가 고여 있고, 몸이 부풀었다
              꺼지며 아래로 흘립니다. → 부풀면 곧 포자를 떨굽니다.
     분열체 : 애초에 둘이 억지로 붙은 몸. 맞을수록 가운데 틈이 벌어지고
              속이 비칩니다. → 틈이 벌면 곧 둘로 갈라집니다.
     새끼   : 그 둘 중 하나. 찢긴 단면이 그대로 남아 빛납니다.
     돌진체 : 머리에 굳은 판을 뒤집어쓰고 뒷다리로 땅을 짚습니다.
              → 판이 달아오르고 다리가 박히면 곧 튀어나옵니다.
     점멸체 : 여기 온전히 있지 않아 몸이 몇 겹으로 어긋나 있습니다.
              → 어긋남이 커지면 곧 사라집니다.

   그림은 전부 이 자리에서 그립니다(그림 파일 없음). 몸 자체가
   예고 동작을 겸하므로, 화면이 아무리 어두워도 다음 수가 보입니다.
   ═══════════════════════════════════════════════════════════ */

/* 같은 우물에서 자란 것들이라 살결의 뿌리는 하나입니다 —
   어두운 몸, 짙은 그늘, 갓만 저마다 다른 빛으로 물들었습니다. */
const FOE_SKIN = {
  shroom:   { cap:'#7a4677', capD:'#43254a', capL:'#a3669b',
              body:'#463c53', bodyD:'#282233', rim:'#6e5f81',
              eye:'#ff5330', glow:'130,60,150' },
  spitter:  { cap:'#4d7647', capD:'#284523', capL:'#6ea15f',
              body:'#3b4a41', bodyD:'#1f2b23', rim:'#627a65',
              eye:'#8de08a', glow:'90,150,90' },
  sporer:   { cap:'#8c7a34', capD:'#4f4419', capL:'#b49f47',
              body:'#4f4835', bodyD:'#2c281b', rim:'#7e7251',
              eye:'#e8e06a', glow:'180,170,60' },
  splitter: { cap:'#62448c', capD:'#352153', capL:'#8a60bd',
              body:'#433858', bodyD:'#261f36', rim:'#6b5c8e',
              eye:'#c79bff', glow:'140,80,210' },
  mini:     { cap:'#62448c', capD:'#352153', capL:'#8a60bd',
              body:'#433858', bodyD:'#261f36', rim:'#6b5c8e',
              eye:'#c79bff', glow:'140,80,210' },
  charger:  { cap:'#8e4426', capD:'#4f2110', capL:'#c46234',
              body:'#4e3b34', bodyD:'#2b1e1a', rim:'#7d5e50',
              eye:'#ff9a4d', glow:'220,90,50' },
  blinker:  { cap:'#337069', capD:'#194144', capL:'#4fa39b',
              body:'#344c50', bodyD:'#1b2b2e', rim:'#567c7f',
              eye:'#7de3c8', glow:'70,200,180' }
};

/* ── 밑그림 조각들 ───────────────────────────────────────── */

/* 갓 — 위로 볼록한 반타원 (아래는 평평) */
function fxCap(g, w, h, y, col) {
  g.beginPath();
  g.ellipse(0, y, w * .5, h, 0, Math.PI, Math.PI * 2);
  g.closePath();
  g.fillStyle = col; g.fill();
}
/* 뒤집힌 갓 — 아래로 오목한 대접 */
function fxBowl(g, w, h, y, col) {
  g.beginPath();
  g.ellipse(0, y, w * .5, h, 0, 0, Math.PI);
  g.closePath();
  g.fillStyle = col; g.fill();
}
function fxBlob(g, x, y, rx, ry, col) {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.2832);
  g.fillStyle = col; g.fill();
}
/* 갓 위의 얼룩 — 종마다 늘 같은 자리에 찍히도록 고정값 */
const FX_SPOT = [[-.30, .62, .075], [-.02, .80, .095], [.28, .58, .065], [.13, .34, .05]];
function fxSpots(g, w, h, y, col, k = 1) {
  g.fillStyle = col;
  FX_SPOT.forEach(([sx, sy, sr]) => {
    g.beginPath();
    g.ellipse(sx * w * k, y - sy * h, sr * w * k, sr * w * .82 * k, 0, 0, 6.2832);
    g.fill();
  });
}
/* 갓 아래 주름 */
function fxGills(g, w, y, len, col, n = 5) {
  g.strokeStyle = col; g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = (-.5 + (i + .5) / n) * w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + len); g.stroke();
  }
}
/* 빛나는 눈 — 어두운 방에서 이것만 먼저 보입니다 */
function fxEyes(g, y, gap, r, col, a) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = a;
  g.fillStyle = col;
  for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * gap, y, r, 0, 6.2832); g.fill(); }
  g.restore();
}
function fxEye1(g, x, y, r, col, a) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = a; g.fillStyle = col;
  g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  g.restore();
}
/* 몸 왼쪽 위에 얹는 테두리 빛 — 어두운 바닥에서 실루엣이 끊기지 않게 */
function fxRim(g, x, y, rx, ry, col, a = .5) {
  g.save();
  g.globalAlpha = a;
  g.strokeStyle = col; g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, Math.PI * .75, Math.PI * 1.75);
  g.stroke();
  g.restore();
}
const fxClamp = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* ═══════════ 버섯 — 기본형 ════════════════════════════════
   특별할 게 없다는 것이 이 녀석의 특징입니다. 넓고 둔한 갓,
   굵은 자루, 어슬렁대는 걸음. 다른 종을 재는 기준자입니다. */
function drawShroom(g, f, s, t, C, blink) {
  const sway = Math.sin(f.bob * .8) * .05;
  g.rotate(sway);

  // 자루 — 아래가 조금 더 굵은 사다리꼴
  g.beginPath();
  g.moveTo(-s * .21, -s * .05); g.lineTo(s * .21, -s * .05);
  g.lineTo(s * .27, s * .40);   g.lineTo(-s * .27, s * .40);
  g.closePath(); g.fillStyle = C.body; g.fill();
  g.fillStyle = C.bodyD;
  g.fillRect(s * .10, -s * .05, s * .17, s * .45);      // 오른쪽 그늘
  g.save();                                              // 왼쪽 테두리 빛
  g.globalAlpha = .5; g.strokeStyle = C.rim; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-s * .21, -s * .03); g.lineTo(-s * .27, s * .39); g.stroke();
  g.restore();

  fxCap(g, s * .98, s * .31, -s * .04, C.cap);
  fxCap(g, s * .98, s * .31, -s * .07, C.capL);         // 위쪽 빛
  fxCap(g, s * .92, s * .27, -s * .04, C.cap);
  fxSpots(g, s * .98, s * .31, -s * .04, C.capD);
  g.fillStyle = C.capD;                                  // 갓 테두리 그늘
  g.fillRect(-s * .49, -s * .06, s * .98, s * .025);
  fxGills(g, s * .78, -s * .03, s * .05, C.bodyD, 7);

  fxEyes(g, s * .13, s * .15, s * .082, C.eye, blink);
}

/* ═══════════ 뱉는 것 — 원거리 ═════════════════════════════
   갓이 앞으로 말려 나팔이 되었습니다. 목주머니가 차오르는 게
   보이면 곧 뱉습니다 — 쿨타임을 몸으로 알려 주는 셈입니다. */
function drawSpitter(g, f, s, t, C, blink) {
  const fc = f.face || 1;
  const charge = fxClamp(1 - f.cd / (BALANCE.spitterCd || 138));
  const kick = charge > .93 ? (charge - .93) * 8 : 0;    // 뱉기 직전의 반동

  g.rotate(-fc * .09);                                    // 살짝 뒤로 젖힌 자세

  // 자루 — 짧고 뭉툭하게, 뱉을 것을 담느라 배가 나왔습니다
  fxBlob(g, 0, s * .17, s * .29, s * .27, C.body);
  fxBlob(g, fc * s * .10, s * .21, s * .19, s * .22, C.bodyD);
  fxRim(g, 0, s * .17, s * .29, s * .27, C.rim, .55);

  // 나팔 — 뿌리에서 앞으로 벌어지는 원뿔
  const bx = fc * s * (.46 - kick * .04), by = -s * .08;
  g.beginPath();
  g.moveTo(0, -s * .19); g.lineTo(0, s * .06);
  g.lineTo(bx, by + s * .21); g.lineTo(bx, by - s * .21);
  g.closePath(); g.fillStyle = C.cap; g.fill();
  g.beginPath();                                          // 나팔 윗면 빛
  g.moveTo(0, -s * .19); g.lineTo(bx, by - s * .21);
  g.lineTo(bx, by - s * .09); g.lineTo(0, -s * .09);
  g.closePath(); g.fillStyle = C.capL; g.fill();
  fxBlob(g, bx, by, s * .055, s * .21, C.capD);           // 벌어진 주둥이
  fxBlob(g, bx, by, s * .03, s * .14, '#0d0f0c');
  if (charge > .55) {                                     // 안쪽이 차오릅니다
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = (charge - .55) * 1.6;
    fxBlob(g, bx, by, s * .028, s * .13, C.eye);
    g.restore();
  }

  // 목주머니 — 차오를수록 부풀고 밝아집니다
  const sac = s * (.115 + charge * .085);
  fxBlob(g, fc * s * .13, s * .04, sac, sac * .92, C.capD);
  g.save(); g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .18 + charge * .55;
  fxBlob(g, fc * s * .13, s * .04, sac * .66, sac * .60, C.eye);
  g.restore();

  fxEyes(g, -s * .02, s * .12, s * .07, C.eye, blink);
}

/* ═══════════ 포자충 — 장판 ════════════════════════════════
   갓이 뒤집힌 대접이라 늘 무언가 고여 있고, 몸이 크게 부풀었다
   꺼지면서 발밑으로 흘립니다. 부푼 순간이 곧 떨구는 순간입니다. */
function drawSporer(g, f, s, t, C, blink) {
  const ready = fxClamp(1 - f.cd / (BALANCE.sporerCd || 124));
  const breath = Math.sin(f.bob * .55) * .05;
  const k = 1 + breath + ready * ready * .16;             // 떨구기 직전에 크게 부풉니다

  // 축 늘어진 주머니 몸 — 부푼 정도가 한눈에 보여야 합니다
  fxBlob(g, 0, s * .16, s * .33 * k, s * .30 * k, C.body);
  fxBlob(g, s * .10, s * .20, s * .21 * k, s * .22 * k, C.bodyD);
  fxRim(g, 0, s * .16, s * .33 * k, s * .30 * k, C.rim, .45 + ready * .4);
  g.save();                                               // 아래로 비치는 고인 빛
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .10 + ready * .28;
  fxBlob(g, 0, s * .26, s * .22 * k, s * .14 * k, C.eye);
  g.restore();
  fxGills(g, s * .46, s * .30, s * .10, C.bodyD, 5);

  // 뒤집힌 갓 — 대접처럼 벌어져 무언가 고여 있습니다
  fxBowl(g, s * .86, s * .24, -s * .18, C.cap);
  fxBowl(g, s * .74, s * .17, -s * .18, C.capD);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .22 + ready * .45;
  fxBowl(g, s * .66, s * .13, -s * .17, C.eye);
  g.restore();
  g.fillStyle = C.capL;                                   // 대접 테두리
  g.fillRect(-s * .43, -s * .20, s * .86, s * .035);

  // 흘러내리는 홀씨 — 늘 조금씩 새고 있습니다
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = C.eye;
  for (let i = 0; i < 3; i++) {
    const ph = ((t * .012 + i * .37) % 1);
    g.globalAlpha = (1 - ph) * (.30 + ready * .35);
    g.fillRect(((-.18 + i * .17) * s) | 0, (s * .30 + ph * s * .26) | 0, 2, 2);
  }
  g.restore();

  // 반쯤 감긴 눈 — 굼뜬 놈입니다
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = blink * .9; g.fillStyle = C.eye;
  for (const sd of [-1, 1]) g.fillRect(sd * s * .16 - s * .05, s * .02, s * .10, s * .045);
  g.restore();
}

/* ═══════════ 분열체 — 죽으면 둘 ═══════════════════════════
   애초에 둘이 억지로 붙어 있는 몸입니다. 맞을수록 가운데 틈이
   벌어지고 속이 비쳐서, 언제 갈라질지 눈으로 셀 수 있습니다. */
function drawSplitter(g, f, s, t, C, blink) {
  const hurt = fxClamp(1 - f.hp / (f.max || f.hp || 1));
  const gap = s * (.035 + hurt * .075);

  // 벌어진 틈 속 — 먼저 깔아 두고 두 덩이로 덮습니다
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = .20 + hurt * .55;
  fxBlob(g, 0, s * .04, gap * 1.5, s * .34, C.eye);
  g.restore();

  for (const sd of [-1, 1]) {
    const wob = Math.sin(f.bob * .9 + (sd < 0 ? 0 : 2.1)) * s * .018;
    g.save();
    g.translate(sd * (s * .19 + gap), wob);

    fxBlob(g, 0, s * .17, s * .17, s * .22, C.body);      // 반쪽 자루
    g.fillStyle = C.bodyD;
    g.fillRect(-sd * s * .17, -s * .02, s * .17, s * .40);

    fxCap(g, s * .52, s * .24, -s * .02, C.cap);          // 반쪽 갓
    fxCap(g, s * .52, s * .24, -s * .05, C.capL);
    fxCap(g, s * .46, s * .20, -s * .02, C.cap);
    fxSpots(g, s * .52, s * .24, -s * .02, C.capD, .8);

    fxEye1(g, -sd * s * .05, s * .10, s * .075, C.eye, blink);
    g.restore();
  }

  // 갈라질 금 — 상처가 깊을수록 또렷해집니다
  g.strokeStyle = `rgba(${C.glow},${.35 + hurt * .5})`;
  g.lineWidth = 1 + hurt;
  g.beginPath();
  g.moveTo(0, -s * .26); g.lineTo(-gap * .5, 0); g.lineTo(gap * .4, s * .38);
  g.stroke();
}

/* ═══════════ 새끼 — 분열체의 반쪽 ═════════════════════════
   갈라진 단면이 아물지 않은 채로 굴러다닙니다. 작고 빠릅니다. */
function drawMini(g, f, s, t, C, blink) {
  const sd = f.side || 1;
  g.rotate(Math.sin(f.bob * 1.6) * .10);                  // 종종거림

  fxBlob(g, sd * s * .05, s * .16, s * .24, s * .25, C.body);
  fxRim(g, sd * s * .05, s * .16, s * .24, s * .25, C.rim, .55);
  // 갓도 반쪽만 남아 성한 쪽으로 쏠려 있습니다
  g.save(); g.translate(sd * s * .07, 0);
  fxCap(g, s * .80, s * .28, -s * .02, C.cap);
  fxCap(g, s * .80, s * .28, -s * .06, C.capL);
  fxCap(g, s * .72, s * .23, -s * .02, C.cap);
  g.restore();

  // 찢긴 단면 — 톱니처럼 잘린 자리가 아직 아물지 않아 빛이 샙니다
  const cut = -sd * s * .30;
  g.save();
  g.beginPath();
  g.moveTo(cut - sd * s * .16, -s * .34);
  for (let i = 0; i <= 5; i++) g.lineTo(cut + sd * (i % 2) * s * .10, -s * .34 + i * s * .16);
  g.lineTo(cut - sd * s * .16, s * .46); g.closePath();
  g.fillStyle = C.bodyD; g.fill();
  g.restore();
  g.save();                                               // 단면에서 새는 빛
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = .55;
  g.strokeStyle = C.eye; g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(cut, -s * .30);
  for (let i = 1; i <= 5; i++) g.lineTo(cut + sd * (i % 2) * s * .10, -s * .34 + i * s * .16);
  g.stroke();
  g.restore();

  fxEye1(g, sd * s * .10, s * .09, s * .095, C.eye, blink);
}

/* ═══════════ 돌진체 — 예고 후 직선 돌진 ═══════════════════
   머리에 굳은 판을 뒤집어쓰고 뒷다리로 땅을 짚습니다. 판이
   달아오르고 다리가 깊이 박히면 곧 튀어나옵니다. */
function drawCharger(g, f, s, t, C, blink) {
  const fc = f.face || 1;
  const wind = f.wind > 0 ? 1 - f.wind / (BALANCE.chargerWind || 34) : 0;
  const dashing = f.dash > 0;

  // 돌진 중에는 뒤로 잔상이 끌립니다
  if (dashing) {
    g.save();
    g.globalAlpha = .22;
    for (let i = 1; i <= 3; i++) {
      g.fillStyle = C.capD;
      g.fillRect(-fc * s * (.20 + i * .22), -s * .10, s * .18, s * .26);
    }
    g.restore();
  }

  // 뒷다리 — 땅을 짚고 버팁니다. 예비 동작 때 더 깊이 박힙니다
  g.strokeStyle = C.rim; g.lineWidth = Math.max(2.4, s * .085);
  g.lineCap = 'round';
  for (const sd of [-1, 1]) {
    g.beginPath();
    g.moveTo(-fc * s * .10, s * .12 + sd * s * .05);
    g.lineTo(-fc * s * (.34 + wind * .12), s * (.42 + wind * .06) + sd * s * .10);
    g.stroke();
  }
  g.lineCap = 'butt';

  // 낮게 웅크린 몸 — 앞이 무겁습니다
  fxBlob(g, -fc * s * .03, s * .12, s * .32, s * .23, C.body);
  fxBlob(g, -fc * s * .12, s * .16, s * .20, s * .17, C.bodyD);
  fxRim(g, -fc * s * .03, s * .12, s * .32, s * .23, C.rim, .55);

  // 머리판 — 앞으로 기울어 굳은 갓
  g.save();
  g.translate(fc * s * .14, -s * .06);      // 몸에 얹혀 있어야지, 떠 있으면 안 됩니다
  g.rotate(fc * (.30 + wind * .20));
  g.beginPath();                                          // 판 아래 그늘
  g.moveTo(-s * .40, s * .02); g.lineTo(s * .40, s * .02);
  g.lineTo(s * .38, s * .17);  g.lineTo(-s * .38, s * .15);
  g.closePath(); g.fillStyle = C.capD; g.fill();
  g.beginPath();                                          // 굳은 머리판
  g.moveTo(-s * .40, -s * .11); g.lineTo(s * .34, -s * .17);
  g.lineTo(s * .40, s * .06);   g.lineTo(-s * .38, s * .12);
  g.closePath();
  g.fillStyle = C.cap; g.fill();
  g.beginPath();                                          // 부딪히는 앞모서리
  g.moveTo(s * .34, -s * .17); g.lineTo(s * .40, s * .06);
  g.lineTo(s * .22, s * .08);  g.lineTo(s * .19, -s * .15);
  g.closePath(); g.fillStyle = C.capL; g.fill();
  g.strokeStyle = C.capD; g.lineWidth = 1;                // 판에 팬 골
  g.beginPath(); g.moveTo(-s * .30, -s * .04); g.lineTo(s * .20, -s * .09); g.stroke();
  if (wind > 0 || dashing) {                              // 달아오른 판
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = dashing ? .6 : wind * .75;
    g.fillStyle = '#ff7a45';
    g.beginPath();
    g.moveTo(s * .34, -s * .17); g.lineTo(s * .40, s * .06);
    g.lineTo(s * .20, s * .08);  g.lineTo(s * .17, -s * .15);
    g.closePath(); g.fill();
    g.restore();
  }
  g.restore();

  // 판 밑 좁은 틈으로 보이는 눈
  fxEyes(g, s * .15, s * .10, s * .058, C.eye, blink * (1 + wind * .5));

  // 버티는 동안 발밑에서 먼지가 일어납니다
  if (wind > 0) {
    g.save();
    g.globalAlpha = wind * .5; g.fillStyle = '#8a7f74';
    for (let i = 0; i < 4; i++) {
      const a = t * .09 + i * 1.6;
      g.fillRect((-fc * s * .30 + Math.cos(a) * s * .16) | 0,
                 (s * .38 + Math.sin(a * 1.4) * s * .06) | 0, 2, 2);
    }
    g.restore();
  }
}

/* ═══════════ 점멸체 — 순간이동 ════════════════════════════
   여기 온전히 있지 않아서 몸이 몇 겹으로 어긋나 있습니다.
   어긋남이 커질수록 곧 사라진다는 뜻입니다. */
function drawBlinker(g, f, s, t, C, blink) {
  const near = fxClamp(1 - f.cd / (BALANCE.blinkerCd || 150));
  const going = f.warp > 0 ? 1 - f.warp / 26 : 0;
  const amp = s * (.035 + near * near * .13 + going * .34);
  const BANDS = 5, top = -s * .38, bh = s * .17;

  // 아래로 끌리는 옅은 꼬리 — 발이 없습니다
  g.save();
  g.globalAlpha = .22;
  fxBlob(g, 0, s * .40, s * .20, s * .07, C.bodyD);
  g.restore();

  for (let i = 0; i < BANDS; i++) {
    const off = Math.sin(t * .075 + i * 1.7) * amp;
    g.save();
    g.beginPath();
    g.rect(-s, top + i * bh, s * 2, bh + .5);
    g.clip();
    g.translate(off, 0);
    g.globalAlpha *= 1 - i * .06;

    fxBlob(g, 0, s * .16, s * .22, s * .24, C.body);       // 자루
    fxCap(g, s * .88, s * .28, -s * .05, C.cap);           // 갓
    fxCap(g, s * .88, s * .28, -s * .08, C.capL);
    fxCap(g, s * .80, s * .24, -s * .05, C.cap);

    // 어긋난 자리마다 실금이 번집니다
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(.85, Math.abs(off) / (s * .12) * .5);
    g.fillStyle = C.eye;
    g.fillRect(-s * .5, top + i * bh, s, 1);
    g.restore();
    g.restore();
  }

  // 눈은 가운데 띠를 따라 같이 어긋납니다
  const eoff = Math.sin(t * .075 + 2 * 1.7) * amp;
  g.save(); g.translate(eoff, 0);
  fxEyes(g, s * .09, s * .14, s * .075, C.eye, blink);
  g.restore();
}

/* ── 배분 ─────────────────────────────────────────────────
   drawFoe 가 위치·그림자·피격 깜빡임까지 맞춰 놓은 뒤, 몸통만
   여기서 그립니다. 좌표 원점은 몹의 한가운데입니다. */
const FOE_DRAW = {
  shroom: drawShroom, spitter: drawSpitter, sporer: drawSporer,
  splitter: drawSplitter, mini: drawMini, charger: drawCharger,
  blinker: drawBlinker
};

function drawFoeBody(g, f, s, t) {
  const C = FOE_SKIN[f.type] || FOE_SKIN.shroom;
  const blink = .72 + Math.sin(t * .07 + f.bob) * .28;    // 눈빛이 느리게 뜁니다
  (FOE_DRAW[f.type] || drawShroom)(g, f, s, t, C, blink);
}
