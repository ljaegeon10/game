'use strict';
/* ═══════════════════════════════════════════════════════════════
   ending.js — 제3막 : 실험실 깨어남 (엔딩 씬)

   마지막 자물쇠를 연 순간의 방을 그대로 받아 글리치로 무너뜨리고,
   칠흑 속 심전도와 터미널로 "이 모든 게 수면 실험이었다"를 밝힙니다.
   Canvas 2D 와 WebAudio 만 쓰고, 본 게임 전역을 더럽히지 않도록
   전체를 즉시 실행 함수로 감싸 EndingScene 하나만 밖으로 냅니다.

   상태 머신
     (rise ─▶) crash ─▶ awaken ─▶ reveal ─▶ truth ─▶ standby ─▶ exit ─▶ onReturn()
      입체로 일어섬  현실 붕괴   심전도     모니터→실험실  타자기·눈 뜸  SPACE 대기   페이드

   rise   — world 를 받으면(게임 안) 마지막 방이 그대로 입체가 되어 일어서고, 주인공의 눈(1인칭)으로 내려앉습니다 (diorama3d.js)
   reveal · truth — labroom.js 가 있으면 오프닝 · 탈출과 같은 3D 실험실을 07 의 눈으로 (침대에 누운 채).
            마지막엔 천장을 올려다본 그 자리 — 탈출(escape.js)이 바로 그 화면에서 이어집니다.
            WebGL 이 없으면 예전 픽셀 실험실 그대로.

   쓰는 법 (game.js 의 beginEnding)
     new EndingScene(canvas, {
       source:   () => 게임 화면 캔버스,   // 매 프레임 이걸 받아 무너뜨림 (없으면 대역 던전)
       audio:    () => AudioContext,       // 게임과 같은 오디오 컨텍스트
       onReturn: () => 엔드 카드 띄우기,
       world:    () => { room, hero, heroAt, W, H, TS, doors, walls }   // 있으면 rise 부터 (diorama3d.js)
     }).start();
   ═══════════════════════════════════════════════════════════════ */
(() => {
const W = 960, H = 540;        // 표시 해상도
const LW = 320, LH = 180;      // 픽셀 연출 버퍼 — ×3 으로 키워 찍습니다
const STEP = 1000 / 60;        // 논리는 60Hz 고정
const MONO = "'DungGeunMo','D2Coding','Nanum Gothic Coding',ui-monospace,Menlo,Consolas,monospace";

const PAL = {
  teal: '#7de3c8', term: '#00ff00', cold: '#e6f1ff',
  cheong: '#2f6fb5', baek: '#e9e3d5', jeok: '#c2352c', heuk: '#15141b', hwang: '#e3b23c'
};
const OBANG = [PAL.cheong, PAL.baek, PAL.jeok, PAL.heuk, PAL.hwang];

const rand  = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const ri    = (a, b) => Math.floor(rand(a, b + 1));
const pick  = arr => arr[(Math.random() * arr.length) | 0];
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp  = (a, b, k) => a + (b - a) * k;
const easeIn  = k => k * k;
const easeOut = k => 1 - (1 - k) * (1 - k);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
function mixHex(a, b, k) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], k))).join(',')})`;
}

/* ═════════════ 소리 ═════════════════════════════════════════
   파일 없이 오실레이터와 노이즈 버퍼만으로 만듭니다.
   본 게임의 AudioContext 를 빌려, 브라우저 잠금이 이미 풀린 상태로 시작합니다. */
class EndSfx {
  constructor(getContext) { this.getContext = getContext; }
  unlock() {
    EndSfx.silentModeFix();
    if (this.ac) { this.ac.resume(); return; }
    try { this.ac = this.getContext ? this.getContext() : null; } catch (e) { this.ac = null; }
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
    }
    this.master = this.ac.createGain();
    this.master.gain.value = .55;
    this.master.connect(this.ac.destination);
    const len = this.ac.sampleRate * 2;
    this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  /* iPhone · iPad 무음 모드에서도 내장 스피커로 들리게 — 게임 안에서는 audio.js 가
     이미 해 두지만, 엔딩만 따로 보는 페이지에선 여기서 직접 겁니다.
     iOS 17+ 는 audioSession, 그보다 오래된 iOS 는 무음 <audio> 반복 재생. */
  static silentModeFix() {
    try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; } } catch (e) { /* 아래로 */ }
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios || (EndSfx.keep && !EndSfx.keep.paused)) return;
    try {
      if (!EndSfx.keep) {
        const n = 2000, buf = new Uint8Array(44 + n * 2), dv = new DataView(buf.buffer);
        const w = (o, t) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
        w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
        dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
        dv.setUint32(24, 8000, true); dv.setUint32(28, 16000, true);
        dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
        w(36, 'data'); dv.setUint32(40, n * 2, true);
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        EndSfx.keep = new Audio('data:audio/wav;base64,' + btoa(bin));
        EndSfx.keep.loop = true;
        EndSfx.keep.setAttribute('playsinline', '');
      }
      const pr = EndSfx.keep.play();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) { /* 소리 없이도 연출은 계속 */ }
  }
  /* 글리치 바탕의 지직거림 — 한 번 틀어 두고 크기만 움직입니다 */
  startNoise() {
    if (!this.ac || this.nSrc) return;
    const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bp = this.ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .8; bp.frequency.value = 1200;
    const g = this.ac.createGain(); g.gain.value = 0;
    s.connect(bp).connect(g).connect(this.master); s.start();
    this.nSrc = s; this.nGain = g; this.nBp = bp;
  }
  setNoise(level, freq) {
    if (!this.nGain) return;
    const t = this.ac.currentTime;
    this.nGain.gain.setTargetAtTime(level, t, .012);
    if (freq) this.nBp.frequency.setTargetAtTime(freq, t, .02);
  }
  stopNoise() {
    if (!this.nSrc) return;
    try { this.nSrc.stop(); } catch (e) { /* 이미 멈춤 */ }
    this.nSrc = this.nGain = this.nBp = null;
  }
  tone(freq, dur, { type = 'sine', vol = .2, slideTo = 0, attack = .004 } = {}) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + .03);
  }
  /* 치지직 — 오프닝 글리치와 같은 TV 잡음 (덩어리째 커졌다 작아지며 갈라지고 탁탁 튐) */
  crackle(dur = .2, k = 1) {
    if (!this.ac) return;
    const c = this.ac, t = c.currentTime, sr = c.sampleRate;
    const n = Math.floor(sr * (dur + .03)), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let amp = 1, seg = 0, hold = 1, held = 0;
    for (let i = 0; i < n; i++) {
      if (--seg <= 0) { seg = Math.floor(sr * (.004 + Math.random() * .024)); amp = Math.random() < .18 ? .08 : .45 + Math.random() * .55; hold = 1 + Math.floor(Math.random() * 6); }
      if (i % hold === 0) held = Math.random() * 2 - 1;
      let v = held * amp; if (Math.random() < .0016) v = Math.random() < .5 ? -1 : 1;
      d[i] = v * Math.min(1, i / (sr * .004), (n - i) / (sr * .02));
    }
    const s = c.createBufferSource(); s.buffer = buf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 3200; pk.Q.value = .8; pk.gain.value = 6;
    const g = c.createGain(); g.gain.value = .3 * k;
    s.connect(hp).connect(pk).connect(g).connect(this.master); s.start(t);
  }
  beep()     { this.tone(988, .12, { vol: .15 }); }
  tick()     { this.tone(rand(2100, 2600), .016, { type: 'square', vol: .02, attack: .001 }); }
  rip()      { this.tone(160, 1.0, { type: 'sawtooth', vol: .22, slideTo: 28 }); }
  powerOff() { this.tone(1400, .4, { vol: .1, slideTo: 50 }); }
  confirm()  { this.tone(660, .3, { vol: .1, slideTo: 330 }); }
  /* 형광등이 튀며 켜지는 소리 */
  tink()     { this.tone(2600, .05, { type: 'square', vol: .045, attack: .001 });
               this.tone(170, .09, { type: 'square', vol: .035, attack: .001 }); }
  /* 불 켜진 실험실의 낮은 웅웅거림 */
  humStart() {
    if (!this.ac || this.hum) return;
    const g = this.ac.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(1, this.ac.currentTime, .4);
    g.connect(this.master);
    this.hum = [[100, 'sine', .035], [200, 'sine', .012], [120, 'square', .004]].map(([f, type, v]) => {
      const o = this.ac.createOscillator(), og = this.ac.createGain();
      o.type = type; o.frequency.value = f; og.gain.value = v;
      o.connect(og).connect(g); o.start();
      return o;
    });
    this.humGain = g;
  }
  humStop() {
    if (!this.hum) return;
    this.hum.forEach(o => { try { o.stop(); } catch (e) { /* 이미 멈춤 */ } });
    this.hum = null;
  }
  /* 눈을 뜨는 순간 — 짧게 들이쉬는 숨 */
  gasp() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf;
    const lp = this.ac.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 1100; lp.Q.value = .6;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3, t + .18); g.gain.exponentialRampToValueAtTime(.0001, t + .7);
    s.connect(lp).connect(g).connect(this.master);
    s.start(t); s.stop(t + .75);
  }
}

/* ═════════════ 대역 던전 ═══════════════════════════════════
   게임 밖에서 엔딩만 돌릴 때(source 없음) 무너뜨릴 장면입니다.
   보스(거대한 눈)가 무너지는 순간. 바닥과 벽은 한 번 구워 두고,
   매 프레임엔 눈과 빛과 포자만 다시 그립니다. */
class Dungeon {
  constructor() {
    const [bg, b] = makeCanvas(LW, LH);
    this.bg = bg;
    b.fillStyle = '#0c0b10'; b.fillRect(0, 0, LW, LH);
    for (let y = 16; y < LH - 16; y += 16) for (let x = 16; x < LW - 16; x += 16) {
      b.fillStyle = ((x + y) >> 4) & 1 ? '#1a1922' : '#16151d'; b.fillRect(x, y, 16, 16);
      b.fillStyle = '#0e0d13'; b.fillRect(x, y, 16, 1); b.fillRect(x, y, 1, 16);
      if (Math.random() < .18) { b.fillStyle = '#25232f'; b.fillRect(x + ri(3, 11), y + ri(3, 11), ri(1, 3), 1); }
    }
    const wall = (x0, y0, w, h) => {
      b.fillStyle = '#262130'; b.fillRect(x0, y0, w, h);
      b.fillStyle = '#1a1622';
      for (let y = y0; y < y0 + h; y += 5) {
        b.fillRect(x0, y, w, 1);
        for (let x = x0 + (((y - y0) / 5) & 1 ? 0 : 5); x < x0 + w; x += 10) b.fillRect(x, y, 1, 5);
      }
    };
    wall(0, 0, LW, 16); wall(0, LH - 16, LW, 16); wall(0, 0, 16, LH); wall(LW - 16, 0, 16, LH);
    // 단청 띠 — 오방색이 줄지어 벽을 두릅니다
    for (let x = 16, i = 0; x < LW - 16; x += 6, i++) {
      b.fillStyle = OBANG[i % 5];
      b.fillRect(x, 12, 6, 3); b.fillRect(x, LH - 15, 6, 3);
    }
    for (let i = 0; i < 8; i++) {
      b.fillStyle = 'rgba(120,20,24,.35)';
      b.beginPath(); b.ellipse(rand(30, LW - 30), rand(30, LH - 30), rand(3, 9), rand(2, 5), rand(3), 0, 7); b.fill();
    }
    this.shrooms = Array.from({ length: 10 }, () => ({
      x: rand(26, LW - 26), y: Math.random() < .5 ? rand(22, 40) : rand(LH - 40, LH - 24), p: rand(6.28)
    }));
    for (const m of this.shrooms) {
      b.fillStyle = '#2b3b3a'; b.fillRect(m.x | 0, m.y | 0, 1, 3);
      b.fillStyle = PAL.teal;  b.fillRect((m.x | 0) - 1, (m.y | 0) - 1, 3, 1);
    }
    this.glow    = glowSprite('125,227,200');
    this.redGlow = glowSprite('194,53,44');
    this.veins = Array.from({ length: 8 }, () => ({ a: rand(6.28), len: rand(.45, .8), bend: rand(-.35, .35) }));
    this.cracks = Array.from({ length: 7 }, () => {
      let a = rand(6.28), r = 2; const pts = [[0, 0]];
      while (r < 30) { r += rand(4, 8); a += rand(-.5, .5); pts.push([Math.cos(a) * r, Math.sin(a) * r * .75]); }
      return pts;
    });
    this.spores = Array.from({ length: 44 }, () => ({ x: rand(LW), y: rand(LH), v: rand(.1, .35), p: rand(6.28) }));
  }
  /* k : 무너지는 정도 0‥1 */
  draw(x, t, k) {
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.drawImage(this.bg, 0, 0);

    x.globalCompositeOperation = 'lighter';
    for (const m of this.shrooms) {
      x.globalAlpha = .35 + .25 * Math.sin(t * .05 + m.p);
      x.drawImage(this.glow, m.x - 10, m.y - 10, 20, 20);
    }
    const cx = 160, cy = 78;
    x.globalAlpha = clamp01(.5 + .2 * Math.sin(t * .12) + k * .4);
    x.drawImage(this.redGlow, cx - 72, cy - 56, 144, 112);
    x.globalAlpha = .2 + k * .45;
    x.drawImage(this.glow, cx - 56, cy - 44, 112, 88);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;

    x.fillStyle = 'rgba(0,0,0,.45)';
    x.beginPath(); x.ellipse(cx, cy + 31, 26, 5, 0, 0, 7); x.fill();

    const jx = Math.round(rand(-1, 1) * k * 3), jy = Math.round(rand(-1, 1) * k * 2);
    const ex = cx + jx, ey = cy + jy, RX = 30, RY = 22;

    x.save();
    x.beginPath(); x.ellipse(ex, ey, RX, RY, 0, 0, 7); x.clip();
    x.fillStyle = '#d8d0bf'; x.fillRect(ex - RX, ey - RY, RX * 2, RY * 2);
    x.fillStyle = '#b3a893'; x.fillRect(ex - RX, ey + RY * .35, RX * 2, RY);
    x.strokeStyle = 'rgba(170,30,30,.85)'; x.lineWidth = 1;
    for (const v of this.veins) {
      x.beginPath();
      x.moveTo(ex + Math.cos(v.a) * RX, ey + Math.sin(v.a) * RY);
      x.quadraticCurveTo(ex + Math.cos(v.a + v.bend) * RX * .75, ey + Math.sin(v.a + v.bend) * RY * .75,
                         ex + Math.cos(v.a) * RX * (1 - v.len), ey + Math.sin(v.a) * RY * (1 - v.len));
      x.stroke();
    }
    // 홍채 — 처음엔 주인공을 노리다가, 무너질수록 마구 굴러갑니다
    const lx = k < .45 ? Math.sin(t * .03) * 6 : rand(-1, 1) * 13 * k;
    const ly = k < .45 ? 6 + Math.sin(t * .05) * 2 : rand(-1, 1) * 9 * k;
    const ix = ex + lx, iy = ey + ly;
    const disc = (px, py, r, c) => { x.fillStyle = c; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); };
    disc(ix, iy, 12, PAL.teal);
    disc(ix, iy, 10.5, PAL.jeok);
    disc(ix, iy + 2, 7.5, '#7d1d18');
    disc(ix, iy, 4 + k * 2 + Math.sin(t * .2) * k * 2, '#08070b');
    x.fillStyle = '#fff'; x.fillRect((ix - 5) | 0, (iy - 6) | 0, 2, 2);
    if (k > .3) {
      const n = Math.ceil((k - .3) / .7 * this.cracks.length);
      x.strokeStyle = PAL.teal; x.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const pts = this.cracks[i];
        x.beginPath(); x.moveTo(ex + pts[0][0], ey + pts[0][1]);
        for (const [px, py] of pts) x.lineTo(ex + px, ey + py);
        x.stroke();
      }
    }
    const blink = Math.max(Math.pow(Math.max(0, Math.sin(t * .045)), 30), k > .6 && Math.random() < .08 ? 1 : 0);
    const lid = blink * RY * 2;
    x.fillStyle = '#2a2333';
    x.fillRect(ex - RX, ey - RY, RX * 2, lid * .7);
    x.fillRect(ex - RX, ey + RY - lid * .3, RX * 2, lid * .3);
    x.restore();

    x.strokeStyle = '#3a2e3a';
    x.beginPath(); x.ellipse(ex, ey, RX, RY, 0, 0, 7); x.stroke();
    // 피눈물
    x.fillStyle = '#8f1c1c';
    [-12, 5, 15].forEach((dx, i) => {
      const len = ((t * .4 + i * 13) % 26) * (.4 + k);
      x.fillRect(ex + dx, ey + RY - 3, 1, len | 0);
    });
    // 주인공
    const px = 160, py = 146;
    x.fillStyle = 'rgba(0,0,0,.5)';
    x.beginPath(); x.ellipse(px, py + 6, 6, 2, 0, 0, 7); x.fill();
    disc(px, py, 5, '#f2c94c');
    x.fillStyle = PAL.heuk; x.fillRect(px + 1, py - 2, 2, 2);
    // 떠다니는 포자
    x.fillStyle = PAL.teal;
    for (const p of this.spores) {
      const yy = ((p.y - t * p.v) % LH + LH) % LH;
      const xx = p.x + Math.sin(t * .02 + p.p) * 4;
      x.globalAlpha = .5 + .5 * Math.sin(t * .07 + p.p);
      x.fillRect(xx | 0, yy | 0, 1, 1);
    }
    x.globalAlpha = 1;
  }
}

/* ═════════════ 실험실 ═══════════════════════════════════════
   심전도는 사실 벽에 걸린 모니터 화면이었습니다. 카메라가 그 화면에서
   물러나면 피험자가 누운 방이 드러납니다. 던전에서 본 것들의 진짜 모습이
   여기 다 있습니다 — 해골은 골격 모형, 피는 링거의 붉은 배양액, 열쇠는
   문의 키카드, 단청 격자는 천장 조명, 오방색은 전극선의 색.

   480×270 버퍼에 그리고 ×2 로 키웁니다. 움직이지 않는 것은 한 번 굽고,
   매 프레임엔 숨·눈·링거 방울·불빛·관찰자만 다시 그립니다. */
const LBW = 480, LBH = 270;
const SCR = { x: 388, y: 42, w: 64, h: 36 };    // 벽걸이 모니터의 화면 (16:9)
const FACE = { x: 184, y: 124 };                // 마지막에 카메라가 다가갈 얼굴
const ELECTRODES = [[176, 121], [178, 117], [182, 116], [177, 126]];

function glowSprite(rgb) {
  const [c, g] = makeCanvas(32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, `rgba(${rgb},.9)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return c;
}

class Lab {
  constructor() {
    [this.cv, this.cx] = makeCanvas(LBW, LBH);
    this.base = Lab.bake();
    this.monGlow = glowSprite('40,255,90');
    this.winGlow = glowSprite('90,140,200');
    const [cone, k] = makeCanvas(64, 150);          // 형광등 아래 빛기둥
    const lg = k.createLinearGradient(0, 0, 0, 150);
    lg.addColorStop(0, 'rgba(225,238,255,.6)'); lg.addColorStop(1, 'rgba(225,238,255,0)');
    k.fillStyle = lg;
    k.beginPath(); k.moveTo(10, 0); k.lineTo(54, 0); k.lineTo(64, 150); k.lineTo(0, 150); k.closePath(); k.fill();
    this.cone = cone;
  }

  static bake() {
    const [c, x] = makeCanvas(LBW, LBH);
    const R = (col, X, Y, w, h) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };

    // 천장과 조명 격자 (던전 벽의 단청 격자 → 천장 조명 격자)
    R('#0f131a', 0, 0, LBW, 22);
    for (let i = 0; i < 4; i++) {
      const lx = 22 + i * 118, lw = 86;
      R('#262e39', lx - 2, 6, lw + 4, 13);
      R('#e3ecf8', lx, 8, lw, 9);
      x.fillStyle = '#9fb0c4';
      for (let gx = lx; gx <= lx + lw; gx += 11) x.fillRect(gx, 8, 1, 9);
      x.fillRect(lx, 12, lw, 1);
    }
    R('#1a212b', 0, 21, LBW, 2);

    // 벽 — 판넬 이음새와 난간
    const wg = x.createLinearGradient(0, 23, 0, 178);
    wg.addColorStop(0, '#2c3747'); wg.addColorStop(1, '#1b222c');
    x.fillStyle = wg; x.fillRect(0, 23, LBW, 155);
    for (let px = 34; px < LBW; px += 58) R('#171e27', px, 23, 1, 151);
    R('#3a4757', 0, 130, LBW, 3); R('#131920', 0, 133, LBW, 1);
    R('#0e1218', 0, 174, LBW, 6);

    // 바닥 — 앞으로 벌어지는 타일 줄
    const fg = x.createLinearGradient(0, 180, 0, LBH);
    fg.addColorStop(0, '#252d39'); fg.addColorStop(1, '#10151b');
    x.fillStyle = fg; x.fillRect(0, 180, LBW, LBH - 180);
    x.strokeStyle = 'rgba(70,84,102,.45)'; x.lineWidth = 1;
    for (let i = 0, y = 184; y < LBH; i++, y += 4 + i * 3) { x.beginPath(); x.moveTo(0, y + .5); x.lineTo(LBW, y + .5); x.stroke(); }
    for (let i = -14; i <= 14; i++) { x.beginPath(); x.moveTo(240 + i * 20 + .5, 180); x.lineTo(240 + i * 64 + .5, LBH); x.stroke(); }

    // 문과 키카드 잠금장치 (열쇠·상자 → 키카드)
    R('#3a4656', 10, 50, 52, 126); R('#283140', 13, 53, 46, 123);
    R('#0b1018', 20, 60, 32, 14); R('#1e2a38', 21, 61, 30, 4);
    R('#4c5868', 50, 108, 6, 3);
    for (let i = 0; i < 6; i++) R(i % 2 ? '#e3b23c' : '#15141b', 13 + i * 8, 168, 8, 5);   // 황·흑 경고 띠
    R('#1a212b', 66, 96, 10, 18); R('#3a4656', 67, 97, 8, 16); R('#0b0f14', 69, 108, 4, 1);

    Lab.skeleton(x);

    // 관찰창 틀과 감시 카메라 (유리 안쪽은 매 프레임 — 어둠 속에서도 보여야 해서)
    R('#3a4656', 192, 32, 112, 64);
    R('#1a212b', 242, 24, 10, 5); R('#0b0f14', 250, 25, 3, 3);

    // 뇌파 증폭기 카트
    R('#5b6674', 128, 140, 26, 2); R('#3d4652', 130, 142, 2, 34); R('#3d4652', 150, 142, 2, 34);
    R('#20262e', 129, 176, 4, 3); R('#20262e', 149, 176, 4, 3);
    R('#2c3644', 130, 118, 22, 22); R('#3e4a5a', 130, 118, 22, 2);
    for (let i = 0; i < 4; i++) R('#11161d', 132 + i * 5, 132, 3, 4);

    // 링거대와 붉은 배양액 (던전의 피 → 링거)
    R('#8e9aa8', 351, 52, 2, 144); R('#8e9aa8', 345, 52, 14, 1);
    x.strokeStyle = '#6b7684';
    x.beginPath(); x.moveTo(352, 195.5); x.lineTo(340, 199.5); x.moveTo(352, 195.5); x.lineTo(364, 199.5); x.stroke();
    R('#20262e', 338, 199, 4, 3); R('#20262e', 362, 199, 4, 3);
    R('#d9cfcf', 345, 56, 15, 6); R('#a8232a', 345, 62, 15, 16); R('#c43a3e', 346, 63, 4, 13);
    R('#7d1b20', 357, 62, 3, 16); R('#f1ece0', 348, 66, 9, 4);
    R('#a8232a', 351, 78, 3, 2); R('#d9dee6', 351, 80, 3, 8);

    Lab.bed(x);
    Lab.subject(x);

    // 링거 줄 — 백에서 팔의 반창고까지
    x.strokeStyle = 'rgba(196,58,62,.9)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(352.5, 88); x.bezierCurveTo(352, 150, 300, 160, 239, 134); x.stroke();
    // 전극선 — 청·적·황·백. 던전을 물들인 오방색은 여기서 왔습니다
    ['#2f6fb5', '#c2352c', '#e3b23c', '#e9e3d5'].forEach((col, i) => {
      const [ex, ey] = ELECTRODES[i];
      x.strokeStyle = col;
      x.beginPath(); x.moveTo(151, 121 + i * 3);
      x.bezierCurveTo(160, 100 + i * 4, 168, 104 + i * 3, ex, ey + 1);
      x.stroke();
    });

    // 사이드 레일 — 이불보다 앞쪽
    R('#9aa6b4', 214, 140, 96, 1);
    for (const px of [214, 262, 309]) R('#9aa6b4', px, 140, 1, 8);

    // 벽걸이 모니터 두 대
    R('#2a313b', 456, 52, 18, 4); R('#2a313b', 468, 56, 4, 46);
    R('#262d37', 384, 38, 72, 44); R('#465262', 384, 38, 72, 1); R('#11161d', 386, 40, 68, 40);
    R('#262d37', 390, 92, 62, 32); R('#465262', 390, 92, 62, 1);
    return c;
  }

  /* 골격 모형 — 던전 바닥에 굴러다니던 해골의 진짜 모습 */
  static skeleton(x) {
    const B = '#ddd6c4', D = '#9d9684';
    const R = (col, X, Y, w, h) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    const L = (pts, w = 1.5) => {
      x.strokeStyle = B; x.lineWidth = w;
      x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) x.lineTo(px, py);
      x.stroke();
    };
    R('#5b6674', 93, 74, 2, 100); R('#3d4652', 84, 173, 20, 3);      // 거치대
    x.fillStyle = B; x.beginPath(); x.ellipse(94, 62, 6, 7, 0, 0, 7); x.fill();
    R(B, 90, 67, 8, 4);
    R('#141018', 91, 61, 2, 3); R('#141018', 95, 61, 2, 3); R('#141018', 93, 65, 2, 1);
    R(D, 91, 70, 6, 1);
    for (let y = 72; y < 112; y += 3) R(B, 93, y, 2, 2);               // 척추
    R(B, 85, 75, 18, 1);                                               // 쇄골
    x.strokeStyle = B; x.lineWidth = 1;
    for (let i = 0; i < 6; i++) {                                       // 갈비
      const yy = 79 + i * 4, rx = 9 - i * .8;
      x.beginPath(); x.moveTo(93, yy); x.quadraticCurveTo(94 - rx, yy - 1, 95 - rx, yy + 3); x.stroke();
      x.beginPath(); x.moveTo(95, yy); x.quadraticCurveTo(94 + rx, yy - 1, 93 + rx, yy + 3); x.stroke();
    }
    L([[85, 76], [82, 96], [83, 114]]); L([[103, 76], [106, 96], [105, 114]]);   // 팔
    R(B, 82, 114, 2, 4); R(B, 104, 114, 2, 4);
    R(B, 88, 112, 12, 3); R(B, 87, 115, 4, 3); R(B, 97, 115, 4, 3);             // 골반
    L([[90, 118], [89, 145], [90, 170]]); L([[98, 118], [99, 145], [98, 170]]);  // 다리
    R(B, 87, 170, 4, 2); R(B, 97, 170, 4, 2);
  }

  static bed(x) {
    const R = (col, X, Y, w, h) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    for (const lx of [170, 330]) { R('#6b7684', lx, 152, 3, 42); R('#20262e', lx - 2, 194, 7, 4); }
    R('#8e9aa8', 160, 100, 5, 54); R('#b4bfcc', 160, 100, 5, 1);     // 머리판
    R('#8e9aa8', 337, 116, 5, 38); R('#b4bfcc', 337, 116, 5, 1);     // 발판
    R('#8e9aa8', 160, 148, 182, 5); R('#5b6674', 160, 152, 182, 1);  // 틀
    R('#d9dee6', 165, 137, 172, 11); R('#b4bcc8', 165, 146, 172, 2);   // 매트리스
    x.fillStyle = '#eef1f5';
    x.beginPath(); x.ellipse(184, 133, 17, 5, 0, 0, 7); x.fill();
    R('#ccd3dc', 170, 135, 30, 2);
  }

  /* 피험자 — 반듯이 누워 얼굴은 천장을 향합니다 (눈은 매 프레임) */
  static subject(x) {
    const R = (col, X, Y, w, h) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    const SKIN = '#d6b49a', SKIND = '#b8927a';
    // 이불 — 어깨 · 가슴 · 배 · 무릎 · 발끝
    const blanket = () => {
      x.beginPath(); x.moveTo(194, 147); x.lineTo(194, 138); x.lineTo(197, 130);
      x.quadraticCurveTo(206, 126, 222, 127);
      x.quadraticCurveTo(246, 129, 262, 130);
      x.quadraticCurveTo(282, 123, 296, 126);
      x.quadraticCurveTo(316, 130, 324, 127);
      x.lineTo(332, 128); x.lineTo(336, 140); x.lineTo(336, 147); x.closePath();
    };
    x.fillStyle = '#7f93a8'; blanket(); x.fill();
    x.strokeStyle = '#a3b5c8'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(197, 130);
    x.quadraticCurveTo(206, 126, 222, 127); x.quadraticCurveTo(246, 129, 262, 130);
    x.quadraticCurveTo(282, 123, 296, 126); x.quadraticCurveTo(316, 130, 324, 127);
    x.stroke();
    x.strokeStyle = '#62768c';
    [[250, 135, 256, 145], [288, 132, 284, 144], [312, 133, 318, 144]].forEach(([a, b, c2, d]) => {
      x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke();
    });
    R('#e9edf2', 196, 129, 12, 3);                       // 접어 내린 홑청

    // 이불 밖으로 나온 팔 — 링거 바늘이 여기 꽂혀 있습니다
    R('#9fb3c6', 198, 131, 10, 4);
    x.strokeStyle = SKIN; x.lineWidth = 3;
    x.beginPath(); x.moveTo(208, 133); x.lineTo(244, 135); x.stroke();
    x.fillStyle = SKIN; x.beginPath(); x.ellipse(246, 135, 3, 2, 0, 0, 7); x.fill();
    R('#f1ece0', 236, 133, 4, 3);

    // 머리
    R(SKIN, 190, 124, 6, 5);                            // 목
    x.fillStyle = SKIN; x.beginPath(); x.ellipse(184, 124, 8, 6.5, 0, 0, 7); x.fill();
    x.fillStyle = '#2b2420';                            // 정수리 · 뒤통수의 머리칼
    x.beginPath(); x.ellipse(183, 125, 8, 6.5, 0, Math.PI * .55, Math.PI * 1.42); x.lineTo(183, 125); x.fill();
    R(SKIN, 187, 115, 2, 3);                             // 코
    R(SKIND, 188, 117, 1, 1);
    R('#3a2b26', 182, 117, 4, 1);                        // 눈썹
    R(SKIND, 190, 120, 2, 1);                            // 입
    R(SKIND, 181, 123, 2, 3);                            // 귀
    // 뇌파 캡 — 머리띠와 전극
    x.strokeStyle = '#cfd6de'; x.lineWidth = 1;
    x.beginPath(); x.ellipse(184, 124, 9, 7.5, 0, Math.PI * .95, Math.PI * 1.6); x.stroke();
    ['#2f6fb5', '#c2352c', '#e3b23c', '#e9e3d5'].forEach((col, i) => {
      const [ex, ey] = ELECTRODES[i]; R(col, ex - 1, ey - 1, 2, 2);
    });
  }

  /* L : 형광등 밝기 0‥1,  awake : 눈을 떴는가 */
  draw(t, L, awake) {
    const x = this.cx;
    const R = (col, X, Y, w, h) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.drawImage(this.base, 0, 0);

    // 숨 — 가슴께 이불이 아주 조금 오르내립니다 (깬 뒤엔 가빠집니다)
    if (Math.sin(t * (awake ? .09 : .035)) > .2) { R('#8a9db1', 209, 125, 16, 2); R('#a3b5c8', 209, 125, 16, 1); }
    // 눈
    if (awake) {
      R('#f1ece4', 183, 118, 3, 2); R('#1a1210', 185, 118, 1, 2); R('#4a3530', 183, 117, 3, 1);
    } else {
      R('#4a3530', 183, 119, 3, 1);
    }
    // 링거 방울
    R('#c43a3e', 352, 81 + ((t * .025) % 1) * 6 | 0, 1, 1);

    // 불이 꺼져 있으면 방 전체가 가라앉습니다
    if (L < 1) { x.fillStyle = `rgba(3,5,10,${(1 - L) * .9})`; x.fillRect(0, 0, LBW, LBH); }

    x.globalCompositeOperation = 'lighter';
    if (L > 0) {
      x.globalAlpha = L * .16;
      for (let i = 0; i < 4; i++) x.drawImage(this.cone, 22 + i * 118 - 10, 18, 106, 160);
    }
    x.globalAlpha = .5;  x.drawImage(this.monGlow, 340, -10, 160, 140);     // 모니터 빛
    x.globalAlpha = .22; x.drawImage(this.monGlow, 240, 10, 280, 220);      // 침대까지 번지는 빛
    x.globalAlpha = .4;  x.drawImage(this.winGlow, 176, 14, 144, 100);      // 관찰창 너머
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;

    // 관찰창 — 유리 너머 누군가 늘 지켜보고 있습니다 (어둠 속에서도 보입니다)
    const gl = x.createLinearGradient(0, 35, 0, 93);
    gl.addColorStop(0, '#1d3046'); gl.addColorStop(1, '#0c141e');
    x.fillStyle = gl; x.fillRect(195, 35, 106, 58);
    const ox = 262 + Math.sin(t * .006) * 3 | 0;
    // 노란 방호복 — 부푼 어깨 · 벨트 · 가슴의 마크, 후드 속 새까만 얼굴창 (어두운 관찰실이라 탁한 노랑)
    x.fillStyle = '#46442f';
    x.beginPath(); x.moveTo(ox - 12, 93); x.lineTo(ox - 11, 70); x.quadraticCurveTo(ox - 10, 65, ox - 5, 65); x.lineTo(ox + 5, 65);
    x.quadraticCurveTo(ox + 10, 65, ox + 11, 70); x.lineTo(ox + 12, 93); x.closePath(); x.fill();
    x.fillStyle = '#66613f'; x.fillRect(ox - 7, 67, 13, 26);
    R('#1a1f28', ox - 11, 84, 23, 2); R('#1a1f28', ox + 6, 85, 3, 4); R('#dfe4e8', ox + 3, 70, 3, 3); R('#3fb7a0', ox + 3, 70, 3, 1);
    R('#1a1f28', ox - 2, 71, 4, 4); R('#c9a040', ox - 1, 72, 2, 2);
    x.fillStyle = '#46442f'; x.beginPath(); x.ellipse(ox, 59, 6.5, 7.5, 0, 0, 7); x.fill();
    x.fillStyle = '#706a45'; x.beginPath(); x.ellipse(ox, 58, 5.8, 6.6, 0, 0, 7); x.fill();
    x.fillStyle = '#040507'; x.beginPath(); x.ellipse(ox, 59, 3.4, 4.3, 0, 0, 7); x.fill();
    R('#101a25', ox - 15, 74, 6, 9);                     // 클립보드
    R('#1a1f28', ox - 13, 78, 3, 3);                     // 청회색 장갑
    if (Math.sin(t * .021) > .93) R('rgba(200,230,255,.8)', ox - 2, 56, 2, 1);   // 얼굴창에 빛이 스침
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(205, 92); x.lineTo(230, 36); x.moveTo(222, 92); x.lineTo(240, 52); x.stroke();

    // 스스로 빛나는 것들 — LED 와 둘째 모니터
    if ((t >> 5) & 1) R('#ff3030', 250, 25, 2, 2);                       // 감시 카메라
    R('#d0302a', 70, 100, 2, 2);                                         // 키카드 : 잠김
    for (let i = 0; i < 4; i++) if (Math.sin(t * .3 + i * 1.7) > 0) R('#5bff8a', 133 + i * 5, 122, 2, 2);
    R('#40ff70', 450, 79, 1, 1);
    R('#000', 393, 95, 56, 26);
    // 세포 영상 — 던전의 버섯들이 이 색이었습니다
    [['#8a60bd', 400, 101], ['#6ea15f', 406, 113], ['#4fa39b', 412, 103]].forEach(([col, cx, cy], i) => {
      x.fillStyle = col; x.globalAlpha = .6 + .4 * Math.sin(t * .05 + i * 2);
      x.beginPath(); x.arc(cx, cy, 3 + Math.sin(t * .04 + i) * .8, 0, 7); x.fill();
    });
    x.globalAlpha = 1;
    x.fillStyle = '#5fe0b0';
    for (let i = 0; i < 3; i++) for (let xx = 0; xx < 29; xx++)
      x.fillRect(418 + xx, 100 + i * 8 + Math.round(Math.sin(xx * .7 + t * .15 + i * 2) * 2), 1, 1);

    // 주 모니터 화면 자리 — 심전도는 화면 공간에서 따로, 선명하게 그립니다
    R('#000', SCR.x, SCR.y, SCR.w, SCR.h);
  }
}

/* 카메라 — 실험실 버퍼에서 어디를 화면 가득 보여 줄지 */
const smooth = k => k * k * (3 - 2 * k);
/* 모니터 화면에서 방 전체로 — 배율은 로그로 줄여야 일정한 속도로 물러납니다 */
function revealView(e) {
  const z = Math.exp(lerp(Math.log(LBW / SCR.w), 0, e));
  const w = LBW / z, h = LBH / z;
  const q = (w - SCR.w) / (LBW - SCR.w);
  return { x: lerp(SCR.x, 0, q), y: lerp(SCR.y, 0, q), w, h };
}
/* 방 전체에서 얼굴로 — 얼굴이 터미널 위쪽에 오도록 */
const FACE_VIEW = (() => {
  const w = LBW / 3, h = LBH / 3;
  return { x: FACE.x - w * .5, y: FACE.y - h * .42, w, h };
})();
function lerpView(a, b, k) {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
}
const FULL_VIEW = { x: 0, y: 0, w: LBW, h: LBH };

/* ═════════════ 글리치 ══════════════════════════════════════
   모든 연산을 320×180 버퍼에서 하고 마지막에 한 번만 키웁니다.
   RGB 분리는 getImageData 대신 합성 모드로 처리합니다 —
   픽셀을 CPU 로 읽어 오면 GPU 가 그때마다 멈추기 때문입니다. */
class GlitchFX {
  constructor() {
    [this.cv, this.cx] = makeCanvas(LW, LH);
    [this.rCv, this.rx] = makeCanvas(LW, LH);
    [this.gbCv, this.gbx] = makeCanvas(LW, LH);
    // 노이즈는 처음에 여섯 장만 구워서 돌려 씁니다 (매 프레임 픽셀 난수 생성 없음)
    const NW = LW * 1.5 | 0, NH = LH * 1.5 | 0;
    this.noise = Array.from({ length: 6 }, () => {
      const [c, x] = makeCanvas(NW, NH);
      const id = x.createImageData(NW, NH), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255 | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = Math.random() < .5 ? 255 : 0;
      }
      x.putImageData(id, 0, 0);
      return c;
    });
  }
  /* k : 세기 0‥1 */
  apply(src, k, t) {
    const x = this.cx;
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.drawImage(src, 0, 0);
    if (k <= 0) return this.cv;

    // ① 가로 띠 밀림 — 화면이 수평 동기를 잃습니다
    const strips = Math.floor(k * 16);
    for (let i = 0; i < strips; i++) {
      const y = ri(0, LH - 1), h = ri(1, 2 + (k * 14 | 0)), dx = (rand(-1, 1) * k * 42) | 0;
      x.drawImage(src, 0, y, LW, h, dx, y, LW, h);
    }
    // ② 블록 손상 — 다른 자리를 떼어 붙이거나 오방색·청록으로 덧칠
    const blocks = Math.floor(k * k * 12);
    for (let i = 0; i < blocks; i++) {
      const w = ri(6, 44), h = ri(2, 14);
      const dx = ri(0, LW - w), dy = ri(0, LH - h);
      if (Math.random() < .6) {
        x.drawImage(this.cv, ri(0, LW - w), ri(0, LH - h), w, h, dx, dy, w, h);
      } else {
        x.globalAlpha = rand(.3, .9);
        x.fillStyle = Math.random() < .45 ? PAL.teal : pick(OBANG);
        x.fillRect(dx, dy, w, h);
        x.globalAlpha = 1;
      }
    }
    // ③ RGB 분리 — 빨강과 청록 채널을 따로 떠서 반대로 밀어 겹칩니다
    if (k > .12) {
      const off = Math.max(1, Math.round(k * 6 * rand(.5, 1.3)));
      const r = this.rx, gb = this.gbx;
      r.globalCompositeOperation = 'source-over'; r.drawImage(this.cv, 0, 0);
      r.globalCompositeOperation = 'multiply'; r.fillStyle = '#f00'; r.fillRect(0, 0, LW, LH);
      gb.globalCompositeOperation = 'source-over'; gb.drawImage(this.cv, 0, 0);
      gb.globalCompositeOperation = 'multiply'; gb.fillStyle = '#0ff'; gb.fillRect(0, 0, LW, LH);
      x.fillStyle = '#000'; x.fillRect(0, 0, LW, LH);
      x.drawImage(this.gbCv, -off, 0);
      x.globalCompositeOperation = 'lighter';
      x.drawImage(this.rCv, off, 0);
      x.globalCompositeOperation = 'source-over';
    }
    // ④ 노이즈 — 미리 구운 장을 무작위 위치로 덮어씁니다
    x.globalAlpha = k * .42;
    x.drawImage(this.noise[t % 6], -ri(0, LW / 2), -ri(0, LH / 2));
    x.globalAlpha = 1;
    // ⑤ 아래로 흐르는 밝은 띠와 순간적인 동기 선
    const by = ((t * 2.3) % (LH + 24)) - 12;
    x.fillStyle = `rgba(255,255,255,${.03 + k * .08})`;
    x.fillRect(0, by, LW, 7);
    if (Math.random() < k * .5) {
      x.fillStyle = `rgba(230,255,245,${rand(.3, .8)})`;
      x.fillRect(0, ri(0, LH - 1), LW, 1);
    }
    // ⑥ 색 반전 섬광 — 강할 때만 드물게
    if (k > .5 && Math.random() < k * .06) {
      x.globalCompositeOperation = 'difference';
      x.fillStyle = '#fff'; x.fillRect(0, 0, LW, LH);
      x.globalCompositeOperation = 'source-over';
    }
    return this.cv;
  }
}

/* ═════════════ 심전도 모니터 ═══════════════════════════════
   흔적은 저해상도 버퍼에 남아 있고, 진짜 모니터처럼 머리 앞쪽을
   조금씩 지우며 지나갑니다. 선은 던전의 청록에서 시작해 터미널
   녹색으로 식어 갑니다 — 꿈의 색이 기계의 색으로 바뀌는 순간입니다. */
class EKGMonitor {
  constructor(sfx) {
    this.sfx = sfx;
    [this.cv, this.cx] = makeCanvas(LW, LH);
    [this.bloomCv, this.bx] = makeCanvas(LW / 4, LH / 4);
    const [hg, h] = makeCanvas(48, 48);
    const gr = h.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, 'rgba(200,255,200,.8)'); gr.addColorStop(1, 'rgba(0,255,0,0)');
    h.fillStyle = gr; h.fillRect(0, 0, 48, 48);
    this.headGlow = hg;
    this.reset();
  }
  reset() {
    this.cx.clearRect(0, 0, LW, LH);
    this.running = false; this.time = 0; this.prev = null;
    this.beats = []; this.nextBeat = 0; this.period = 0; this.target = 60;
    this.beatCount = 0; this.bpm = 0; this.pulse = 0;
  }
  start() {
    this.running = true;
    this.nextBeat = 110;   // 첫 박동 전 1.8초 동안은 납작한 선
    this.period = 86;      // 처음엔 느리게, 점점 제 박자를 찾습니다
  }
  /* 박동 하나의 모양 — P · Q · R · S · T 파를 가우시안 다섯 개로 */
  static shape(d) {
    const g = (c, s) => Math.exp(-((d - c) * (d - c)) / (2 * s * s));
    return 3 * g(9, 1.8) - 2.5 * g(14.2, .55) + 27 * g(15.6, .6) - 8 * g(17.1, .65) + 6 * g(29, 3.4);
  }
  value(t) {
    let v = 0;
    for (const b of this.beats) { const d = t - b; if (d > -3 && d < 48) v += EKGMonitor.shape(d); }
    return v;
  }
  update() {
    if (this.pulse > 0) this.pulse -= .05;
    if (!this.running) return;
    const SPEED = 1.6, SUB = 4, BASE = LH * .5 + .5;   // +.5 : 1px 선이 픽셀 한 줄에 정확히 앉도록

    while (this.nextBeat <= this.time + 1) {
      this.beats.push(this.nextBeat);
      this.lastPeriod = this.period;
      this.nextBeat += this.period;
      this.period = lerp(this.period, this.target, .35) + rand(-1.5, 1.5);
    }
    this.beats = this.beats.filter(b => this.time - b < 60);
    for (const b of this.beats) {
      const r = b + 15.6;
      if (r > this.time && r <= this.time + 1) {
        this.sfx.beep(); this.pulse = 1; this.beatCount++;
        if (this.beatCount >= 2) this.bpm = Math.round(3600 / this.lastPeriod);
      }
    }

    const x = this.cx;
    const colorK = easeOut(clamp01(this.time / 160));
    x.strokeStyle = mixHex(PAL.teal, PAL.term, colorK);
    x.lineWidth = 1;
    x.lineCap = 'round';
    for (let s = 1; s <= SUB; s++) {
      const t = this.time + s / SUB;
      const hx = (t * SPEED) % LW;
      const hy = BASE - this.value(t);
      if (this.prev && hx > this.prev.x) {
        x.beginPath(); x.moveTo(this.prev.x, this.prev.y); x.lineTo(hx, hy); x.stroke();
      }
      this.prev = { x: hx, y: hy };
    }
    // 머리 바로 앞을 지워 다음 바퀴 자리를 마련합니다
    const ex = this.prev.x + 2, ew = 16;
    x.clearRect(ex, 0, ew, LH);
    if (ex + ew > LW) x.clearRect(0, 0, ex + ew - LW, LH);
    this.time++;
  }
  draw(c, dy) {
    const b = this.bx;
    b.clearRect(0, 0, LW / 4, LH / 4);
    b.imageSmoothingEnabled = true;
    b.drawImage(this.cv, 0, 0, LW / 4, LH / 4);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.imageSmoothingEnabled = true;
    c.globalAlpha = .9;
    c.drawImage(this.bloomCv, 0, dy, W, H);      // 잔광
    c.globalAlpha = 1;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.cv, 0, dy, W, H);           // 선명한 선
    if (this.running && this.prev) {
      const hx = this.prev.x * 3, hy = this.prev.y * 3 + dy;
      c.drawImage(this.headGlow, hx - 24, hy - 24);
      c.fillStyle = '#eaffea';
      c.fillRect(hx - 3, hy - 3, 6, 6);
    }
    c.restore();
  }
}

/* ═════════════ 타자기 터미널 ═══════════════════════════════ */
const TRUTH_LINES = [
  { text: '수면 상태 해제 중...',                          color: PAL.cold },
  { text: '뇌파 연결 차단 완료.',                          color: PAL.cold },
  { text: '수면 실험 종료. 피험자 07번, 의식 회복 확인.',  color: PAL.term }
];

class Terminal {
  constructor(lines, sfx) { this.lines = lines; this.sfx = sfx; this.reset(); }
  reset() {
    this.li = 0; this.ci = 0; this.wait = 34;
    this.shown = this.lines.map(() => '');
    this.done = false; this.doneT = 0;
  }
  update() {
    if (this.done) { this.doneT++; return; }
    if (--this.wait > 0) return;
    const chars = Array.from(this.lines[this.li].text);
    if (this.ci < chars.length) {
      const ch = chars[this.ci++];
      this.shown[this.li] = chars.slice(0, this.ci).join('');
      if (ch !== ' ') this.sfx.tick();
      const next = chars[this.ci];
      this.wait = ch === '.' ? (next === '.' || chars[this.ci - 2] === '.' ? 22 : 18)
                : ch === ',' ? 12
                : 3 + (Math.random() < .08 ? 7 : 0);    // 가끔 머뭇거림
    } else if (this.li < this.lines.length - 1) {
      this.li++; this.ci = 0; this.wait = 42;
    } else {
      this.done = true;
    }
  }
}

/* ═════════════ 화면 덧칠 (주사선 + 비네트) — 한 번만 굽습니다 ═══ */
function bakeOverlay() {
  const [c, x] = makeCanvas(W, H);
  x.fillStyle = 'rgba(0,0,0,.18)';
  for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
  const g = x.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  return c;
}
function bakeGrid() {
  const [c, x] = makeCanvas(W, H);
  x.fillStyle = 'rgba(0,255,0,.09)';
  for (let y = 30; y < H; y += 30) for (let gx = 30; gx < W; gx += 30) x.fillRect(gx, y, 2, 2);
  return c;
}

const GLITCH_WORDS = ['SIGNAL LOST', 'DREAM DEPTH 4 → 0', 'ERR 0x07', 'REM ▓▓▓▓', '깨어나', '세션 강제 종료',
                      'SUBJECT 07', '뇌파 동기 이탈', 'WELL.EXE', '0x00FF00', '여기는 우물이 아니다'];

/* ═════════════ 상태들 ══════════════════════════════════════
   각 상태는 enter · update · draw · input 을 가진 평범한 객체입니다.
   s.t 는 상태에 들어온 뒤 지난 프레임 수입니다. */

/* Phase 0 — 일어섬 (약 5.5초, world 가 있을 때만)
   자물쇠를 연 그 탑뷰 화면이 그대로 멈춘 채로 시작해 — 벽이 솟고, 카메라가 위에서
   주인공에게로 내려앉아 그 눈이 됩니다(1인칭). 2D 로 보던 곳이 입체였다는 것.
     0‥45   : 탑뷰 그대로, 찢어진 화면이 가라앉음
     40‥190 : 벽이 솟음 (낮게 우르릉)
     70‥300 : 카메라가 주인공의 눈으로 — 주인공 그림은 흩어지고, 지나온 방을 1인칭으로 돌아봄 (쉬익)
     300‥330: 멈칫 — 그리고 무너짐(crash) */
const RISE_DUR = 330;
/* 일어서는 동안의 글리치 — 무너지던 화면(붕괴)의 그 잡음이 사이사이 튐. [시작, 길이, 세기] */
const RISE_GLITCH = [[0, 14, .9], [48, 7, .55], [92, 10, .7], [138, 6, .5], [176, 12, .8], [226, 8, .6], [262, 10, .75], [296, 34, .95]];
const RiseState = {
  enter(s) { s.riseK = 0; s.camK = 0; s.rg = 0; s.rgMicro = 0; s.sfx.startNoise(); },
  update(s) {
    const t = s.t;
    // 글리치 — 정해 둔 자리 + 가끔 한두 프레임
    s.rgMicro = Math.max(0, s.rgMicro - 1);
    if (!s.rgMicro && Math.random() < 1 / 45) { s.rgMicro = ri(1, 3); s.sfx.crackle(s.rgMicro / 60 + .03, .4); }
    s.rg = 0;
    for (const [a, d, k] of RISE_GLITCH) {
      if (t === a) s.sfx.crackle(d / 60 + .05, .55 + k * .5);
      if (t >= a && t < a + d) s.rg = k * (t > 296 ? .6 + (t - 296) / 34 * .4 : (Math.random() < .8 ? 1 : .3));
    }
    if (!s.rg && s.rgMicro) s.rg = .45;
    s.riseK = clamp01((t - 40) / 150);
    s.camK = clamp01((t - 70) / 230);
    if (t === 40) { s.sfx.tone(46, 3.2, { type: 'sawtooth', vol: .14, slideTo: 64, attack: .4 }); s.sfx.tone(92, 2.6, { type: 'triangle', vol: .06, slideTo: 130, attack: .3 }); }
    if (t === 190) s.sfx.tone(60, .5, { type: 'sine', vol: .2, slideTo: 38 });           // 다 일어선 벽이 쿵
    const sw = Math.sin(clamp01((t - 70) / 230) * Math.PI);
    s.sfx.setNoise(s.rg ? s.rg * .32 : .02 + sw * .08, s.rg ? 500 + s.rg * 3200 : 250 + s.camK * 1100);   // 붕괴의 그 지직거림
    if (t >= RISE_DUR) {
      const d = s.dio;
      s.source = () => d.render(1, d.camAt(1, s.frame + Math.random() * 40), { lit: 1, heroA: 0 });   // 무너지는 동안에도 그 눈 그대로
      s.go('crash');
    }
  },
  draw(s, c) {
    const t = s.t, d = s.dio;
    const cm = d.camAt(s.camK, s.frame), img = d.render(s.riseK, cm, { heroA: cm.heroA });
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = true; c.drawImage(img, 0, 0, W, H);
    // 글리치 — 붕괴(crash)와 같은 효과: 320×180 으로 눌러 띠 밀림 · 블록 손상 · RGB 분리 · 노이즈
    if (s.rg > 0) {
      s.sx.imageSmoothingEnabled = true; s.sx.drawImage(img, 0, 0, LW, LH);
      const out = s.glitch.apply(s.src, s.rg, s.frame), sh = s.rg * 9;
      c.imageSmoothingEnabled = false;
      c.drawImage(out, (rand(-1, 1) * sh) | 0, (rand(-1, 1) * sh * .6) | 0, W, H);
      if (Math.random() < s.rg * .4) {                                   // 터져 나오는 시스템 문구
        c.font = `${ri(12, 26)}px ${MONO}`; c.fillStyle = pick([PAL.teal, PAL.term, PAL.jeok, PAL.baek]); c.globalAlpha = rand(.5, .95);
        c.fillText(pick(GLITCH_WORDS), ri(0, W - 260), ri(30, H - 20)); c.globalAlpha = 1;
      }
    }
  }
};

/* ── 3D 실험실 (labroom.js) — 오프닝 · 탈출과 같은 방, 같은 침대. 07 의 눈으로 ── */
const HP = Math.PI / 2;
const LIE = { x: -1.24, y: .98, z: 5.8, yaw: HP, pitch: 1.25, roll: 0 };        // 탈출(escape.js)의 CAM_LIE 와 같음
const LOOK_MON = { yaw: 1.36, pitch: .2 };                                       // 발치 너머 — 벽의 심전도 모니터 쪽
function lieCam() {
  const pe = window.LabRoomGeo && LabRoomGeo.patientEye && LabRoomGeo.patientEye(0);
  return pe ? { ...LIE, x: pe[0], y: pe[1], z: pe[2] } : { ...LIE };
}
/* look : 0 모니터 쪽 ‥ 1 천장,  open : 눈꺼풀 (0 감김 ‥ 1),  blur : 초점 */
function drawLab3D(s, c, look, open, blur) {
  const base = lieCam(), k = smooth(look);
  const cam = { ...base, yaw: lerp(LOOK_MON.yaw, LIE.yaw, k), pitch: lerp(LOOK_MON.pitch, LIE.pitch, k) + Math.sin(s.frame * .02) * .006, roll: 0 };
  const img = s.lab3.render({ cam, t: s.frame, wires: 4, wirePull: [0, 0, 0, 0], ivOut: false, ivT: 0, rise: 0, sit: true, doorSlide: 0,
                              body: LabRoomGeo.bodyPose(base, 0, 0), dim: .14 + s.light * .8 });
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  c.save(); c.imageSmoothingEnabled = true;
  if (blur > .3) c.filter = `blur(${blur.toFixed(1)}px)`;
  c.drawImage(img, 0, 0, W, H);
  c.restore();
  if (open < 1) {                                          // 눈꺼풀 — 위아래에서 부드럽게
    const lid = (1 - open) * H * .52;
    for (const top of [true, false]) {
      const gr = c.createLinearGradient(0, top ? lid - 60 : H - lid + 60, 0, top ? lid + 10 : H - lid - 10);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = '#000';
      if (top) c.fillRect(0, 0, W, Math.max(0, lid - 60)); else c.fillRect(0, H - lid + 60, W, lid);
      c.fillStyle = gr;
      if (top) c.fillRect(0, lid - 60, W, 70); else c.fillRect(0, H - lid - 10, W, 70);
    }
  }
}

/* Phase 1 — 현실 붕괴 (약 5초)
     0‥50   : 마지막 방 그대로, 가끔 튀는 글리치
     50‥170 : 글리치가 차오름
     170‥215: 화면이 가로로 찢어지며 하얗게
     215‥235: 완전한 백색
     235‥265: 브라운관이 꺼지듯 선 → 점으로
     265‥305: 점이 사라지고 정적 */
const CrashState = {
  enter(s) {
    s.gk = 0; s.tears = [];
    s.sfx.startNoise();
  },
  intensity(t) {
    if (t < 50)  return .05 + (Math.random() < .07 ? .45 : 0);
    if (t < 170) return clamp01(.12 + easeIn((t - 50) / 120) * .95 + (Math.random() < .1 ? .3 : 0));
    return 1;
  },
  update(s) {
    const t = s.t;
    s.gk = CrashState.intensity(t);
    if (t < 170)      s.sfx.setNoise(Math.random() < .12 ? 0 : s.gk * .32, 500 + s.gk * 3200);
    else if (t < 235) s.sfx.setNoise(.45, 5200);
    if (t === 170) s.sfx.rip();
    if (t === 235) { s.sfx.setNoise(0); s.sfx.powerOff(); }
    if (t === 260) s.sfx.stopNoise();
    if (t >= 170 && t < 215) {
      if (Math.random() < .7) s.tears.push({ y: ri(0, LH - 1), h: 1, grow: rand(.25, 1.1) });
      for (const r of s.tears) r.h += r.grow * (1 + (t - 170) * .06);
    }
    if (t >= 305) s.go('awaken');
  },
  draw(s, c) {
    const t = s.t;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);

    if (t < 215) {
      // 마지막 방을 매 프레임 받아 와 320×180 으로 줄여 담습니다
      if (s.source) {
        s.sx.imageSmoothingEnabled = true;
        s.sx.drawImage(s.source(), 0, 0, LW, LH);
      } else {
        s.dungeon.draw(s.sx, s.frame, clamp01(t / 170));
      }
      const out = s.glitch.apply(s.src, s.gk, s.frame);
      if (t >= 170) {
        // 가로로 찢어지는 틈 — 들쭉날쭉한 흰 띠가 번져 화면을 먹습니다
        const g = s.glitch.cx;
        g.fillStyle = '#fff';
        for (const r of s.tears) {
          for (let x = 0; x < LW; x += 6) {
            const h = r.h * rand(.55, 1.35);
            g.fillRect(x, r.y - h / 2, 6, h);
          }
        }
        g.globalAlpha = easeIn((t - 170) / 45) * .85;
        g.fillRect(0, 0, LW, LH);
        g.globalAlpha = 1;
      }
      const shake = s.gk * 10;
      c.imageSmoothingEnabled = false;
      c.drawImage(out, (rand(-1, 1) * shake) | 0, (rand(-1, 1) * shake * .6) | 0, W, H);

      // 터져 나오는 시스템 문구 — 녹색이 섞여 들기 시작합니다
      if (Math.random() < s.gk * .55) {
        for (let i = ri(1, 3); i > 0; i--) {
          c.font = `${ri(12, 30)}px ${MONO}`;
          c.fillStyle = Math.random() < s.gk * .5 ? PAL.term : pick([PAL.teal, PAL.jeok, PAL.baek, PAL.hwang]);
          c.globalAlpha = rand(.5, 1);
          c.fillText(pick(GLITCH_WORDS), ri(0, W - 260), ri(30, H - 20));
        }
        c.globalAlpha = 1;
      }
    } else if (t < 235) {
      c.fillStyle = (t & 2) ? '#ffffff' : '#ecfff8';
      c.fillRect(0, 0, W, H);
    } else if (t < 265) {
      // 브라운관 꺼짐 — 위아래가 먼저 접히고, 그다음 좌우가 접힙니다
      const k = (t - 235) / 30;
      let w = W, h = 4;
      if (k < .55) h = lerp(H, 4, easeIn(k / .55));
      else         w = lerp(W, 6, easeIn((k - .55) / .45));
      c.fillStyle = 'rgba(220,255,240,.18)';
      c.fillRect((W - w) / 2 - 10, (H - h) / 2 - 10, w + 20, h + 20);
      c.fillStyle = '#fff';
      c.fillRect((W - w) / 2, (H - h) / 2, w, h);
    } else {
      const a = clamp01(1 - (t - 265) / 36);
      c.globalAlpha = a;
      c.fillStyle = 'rgba(200,255,230,.25)'; c.fillRect(W / 2 - 9, H / 2 - 9, 18, 18);
      c.fillStyle = '#fff'; c.fillRect(W / 2 - 3, H / 2 - 3, 6, 6);
      c.globalAlpha = 1;
    }
  }
};

/* Phase 2 — 바이탈 사인 (약 6.5초)
   칠흑 속에서 청록 점 하나가 납작한 선을 긋다가, 첫 박동과 함께
   삐— 소리가 납니다. 선의 색은 터미널 녹색으로 식어 갑니다. */
const AwakenState = {
  enter(s) { s.ekg.reset(); s.hudA = 0; },
  update(s) {
    if (s.t === 40) s.ekg.start();
    s.ekg.update();
    if (s.t > 150) s.hudA = Math.min(1, s.hudA + .015);
    if (s.t >= 390) s.go('reveal');
  },
  draw(s, c) {
    drawMonitorScreen(s, c, { x: 0, y: 0, w: W, h: H });
  }
};

/* Phase 3 — 모니터 밖 (약 6초)
   카메라가 화면에서 물러나면 그 심전도가 벽에 걸린 모니터였다는 게
   드러납니다. 어두운 방엔 모니터 빛과 관찰창만 보이다가, 형광등이
   두어 번 튀고 켜지며 누워 있는 피험자가 드러납니다. */
const RevealState = {
  enter(s) { s.camP = 0; s.light = 0; s.view = revealView(0); },
  light(t) {
    if (t < 170) return 0;
    if (t < 172) return 1;
    if (t < 179) return 0;
    if (t < 181) return .9;
    if (t < 192) return .12;
    return clamp01(.12 + (t - 192) / 45 * .88);
  },
  update(s) {
    const t = s.t;
    s.ekg.update();
    s.camP = clamp01((t - 30) / 290);
    s.view = revealView(smooth(s.camP));
    s.light = RevealState.light(t);
    if (t === 170 || t === 179 || t === 192) s.sfx.tink();
    if (t === 192) s.sfx.humStart();
    if (t >= 350) s.go('truth');
  },
  draw(s, c) {
    if (!s.lab3) { drawLabView(s, c); return; }
    // 심전도 화면이 걷히면 — 누운 채 발치 너머로 본 실험실. 반쯤 감긴 눈, 형광등이 튀며 켜짐
    drawLab3D(s, c, 0, .42 + Math.sin(s.frame * .03) * .03, 2.6 - s.light * 1.2);
    const a = 1 - smooth(clamp01((s.t - 20) / 110));
    if (a > 0) { c.globalAlpha = a; drawMonitorScreen(s, c, { x: 0, y: 0, w: W, h: H }); c.globalAlpha = 1; }
  }
};

/* Phase 4 — 진실 : 터미널이 떠오르고, 다 찍히면 카메라가 얼굴로 다가가
   피험자가 눈을 뜹니다. 심박이 빨라집니다. */
const TruthState = {
  enter(s) { s.term.reset(); s.panelA = 0; s.pushT = 0; },
  update(s) {
    s.ekg.update();
    s.panelA = Math.min(1, s.panelA + .025);
    if (s.panelA > .6) s.term.update();
    if (s.term.done) {
      s.pushT++;
      if (s.pushT === 130) { s.awake = true; s.sfx.gasp(); s.ekg.target = 46; }
    }
    s.view = lerpView(FULL_VIEW, FACE_VIEW, smooth(clamp01((s.pushT - 20) / 180)));
    if (s.pushT >= 220) s.go('standby');
  },
  draw(s, c) {
    if (s.lab3) {
      // 다 찍히면 고개가 천장 쪽으로 넘어가고, 숨을 들이쉬며 눈이 번쩍 — 오프닝의 첫 화면, 탈출의 첫 화면
      const look = clamp01((s.pushT - 20) / 180), op = s.awake ? .42 + smooth(clamp01((s.pushT - 130) / 26)) * .58 : .42 + Math.sin(s.frame * .03) * .03;
      drawLab3D(s, c, look, op, s.awake ? Math.max(0, 1.4 - (s.pushT - 130) * .03) : 1.4);
    } else drawLabView(s, c);
    drawTerminal(s, c);
  }
};

/* 씬 종료 — 깜빡이는 커서와 함께 SPACE 를 기다립니다 */
const StandbyState = {
  enter(s) { s.promptA = 0; },
  update(s) {
    s.ekg.update(); s.term.update();
    s.promptA = Math.min(1, s.promptA + 1 / 90);
  },
  draw(s, c) {
    TruthState.draw(s, c);
    const a = easeOut(s.promptA) * (.65 + .35 * Math.sin(s.frame * .06));
    c.save();
    c.globalAlpha = a;
    c.font = `15px ${MONO}`;
    if ('letterSpacing' in c) c.letterSpacing = '5px';
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = PAL.cold;
    c.fillText('PRESS SPACE TO RETURN', W / 2, H - 16);
    c.restore();
  },
  input(s, key) { if (key === 'space' && s.promptA > .5) s.go('exit'); }
};

/* 모니터 화면 하나 (격자 + 심전도 + 수치) — 화면 전체든 벽의 작은 모니터든
   960×540 기준으로 그린 뒤 그 사각형에 맞춰 줄여 넣습니다. */
function drawMonitorScreen(s, c, r) {
  c.save();
  c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.translate(r.x, r.y);
  c.scale(r.w / W, r.h / H);
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  if (s.hudA > 0) { c.globalAlpha = s.hudA; c.drawImage(s.grid, 0, 0); c.globalAlpha = 1; }
  s.ekg.draw(c, 0);
  drawVitalsHud(s, c);
  // 작아질수록 유리 한 장이 앞에 있는 게 보입니다
  const glass = 1 - r.w / W;
  if (glass > 0) {
    c.globalAlpha = glass * .5;
    c.fillStyle = 'rgba(200,230,255,.10)';
    c.beginPath(); c.moveTo(W * .1, 0); c.lineTo(W * .38, 0); c.lineTo(W * .12, H); c.lineTo(-W * .16, H); c.fill();
  }
  c.restore();
}

/* 실험실 한 장면 — 버퍼를 카메라 사각형만큼 잘라 키우고, 그 위 모니터 자리에
   심전도 화면을 정확히 겹쳐 그립니다. */
function drawLabView(s, c) {
  const V = s.view;
  s.lab.draw(s.frame, s.light, s.awake);
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  c.imageSmoothingEnabled = false;
  c.drawImage(s.lab.cv, V.x, V.y, V.w, V.h, 0, 0, W, H);
  const r = {
    x: (SCR.x - V.x) * W / V.w, y: (SCR.y - V.y) * H / V.h,
    w: SCR.w * W / V.w,         h: SCR.h * H / V.h
  };
  if (r.x < W && r.y < H && r.x + r.w > 0 && r.y + r.h > 0) drawMonitorScreen(s, c, r);
}

const ExitState = {
  enter(s) { s.sfx.confirm(); },
  update(s) {
    s.ekg.update();
    if (s.t >= 50) { s.stop(); s.onReturn(); }
  },
  draw(s, c) {
    StandbyState.draw(s, c);
    c.fillStyle = `rgba(0,0,0,${Math.min(1, s.t / 45)})`;
    c.fillRect(0, 0, W, H);
  }
};

function drawVitalsHud(s, c) {
  const a = s.hudA;
  if (a <= 0) return;
  const e = s.ekg;
  c.save();
  c.globalAlpha = a;
  c.textBaseline = 'top';
  c.font = `13px ${MONO}`;
  c.fillStyle = 'rgba(230,241,255,.5)';
  c.fillText('VITAL MONITOR · CELL 07 · 2145.05.20', 32, 26);
  c.textAlign = 'right';
  c.fillText('HR', W - 32, 26);
  c.font = `44px ${MONO}`;
  c.fillStyle = PAL.term;
  c.fillText(e.bpm ? String(e.bpm) : '--', W - 32, 44);
  c.font = `13px ${MONO}`;
  c.fillStyle = 'rgba(230,241,255,.5)';
  c.fillText('bpm', W - 32, 94);
  if (e.pulse > 0) {
    c.globalAlpha = a * e.pulse;
    c.fillStyle = PAL.term;
    c.font = `20px ${MONO}`;
    c.fillText('♥', W - 110, 54);
  }
  c.restore();
}

function drawTerminal(s, c) {
  const a = easeOut(s.panelA);
  if (a <= 0) return;
  const T = s.term;
  const pw = 640, ph = 150, px = (W - pw) / 2, py = H - ph - 40 + (1 - a) * 16;
  c.save();
  c.globalAlpha = a;
  c.fillStyle = 'rgba(2,12,6,.88)';
  c.fillRect(px, py, pw, ph);
  c.strokeStyle = 'rgba(0,255,0,.38)'; c.lineWidth = 1;
  c.strokeRect(px + .5, py + .5, pw - 1, ph - 1);
  c.fillStyle = 'rgba(0,255,0,.1)';
  c.fillRect(px, py, pw, 26);

  const sec = 5 * 3600 + 20 * 60 + 14 + Math.floor(s.frame / 60);
  const clock = [sec / 3600 | 0, (sec / 60 | 0) % 60, sec % 60].map(v => String(v).padStart(2, '0')).join(':');
  c.font = `13px ${MONO}`;
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(230,241,255,.6)';
  c.fillText('SLEEP-LAB TERMINAL  //  SUBJECT 07  //  SESSION 141', px + 14, py + 13);
  c.textAlign = 'right';
  c.fillText(clock, px + pw - 14, py + 13);
  c.textAlign = 'left';

  c.font = `21px ${MONO}`;
  c.textBaseline = 'alphabetic';
  let curX = px + 46, curY = py + 58;
  for (let i = 0; i <= T.li; i++) {
    const y = py + 58 + i * 34;
    c.fillStyle = 'rgba(0,255,0,.55)';
    c.fillText('>', px + 20, y);
    c.fillStyle = T.lines[i].color;
    c.fillText(T.shown[i], px + 46, y);
    if (i === T.li) { curX = px + 46 + c.measureText(T.shown[i]).width; curY = y; }
  }
  c.fillStyle = PAL.term;
  if (!T.done) {
    c.fillRect(curX + 4, curY - 18, 11, 22);                 // 입력 중 : 꽉 찬 블록
  } else if (((s.frame >> 5) & 1) === 0) {
    c.fillText('_', curX + 4, curY);                         // 끝 : 깜빡이는 밑줄
  }
  c.restore();
}

/* ═════════════ 씬 본체 ═════════════════════════════════════ */
class EndingScene {
  constructor(canvas, { source, audio, onReturn, world } = {}) {
    this.canvas = canvas;
    canvas.width = W; canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.source = source;
    this.onReturn = onReturn || (() => {});
    this.sfx = new EndSfx(audio);
    [this.src, this.sx] = makeCanvas(LW, LH);
    if (!source) this.dungeon = new Dungeon();
    this.lab = new Lab();
    // 입체 — 마지막 방(diorama3d.js) · 실험실(labroom.js). 안 되면 예전 그림으로
    try { const wd = world && window.Diorama3D && world(); if (wd) { this.dio = new Diorama3D(wd, W, H); if (!this.dio.ok) this.dio = null; } } catch (e) { this.dio = null; }
    try { if (window.LabRoom) { this.lab3 = new LabRoom(); if (!this.lab3.ok) this.lab3 = null; } } catch (e) { this.lab3 = null; }
    this.glitch = new GlitchFX();
    this.ekg = new EKGMonitor(this.sfx);
    this.term = new Terminal(TRUTH_LINES, this.sfx);
    this.overlay = bakeOverlay();
    this.grid = bakeGrid();
    this.states = { rise: RiseState, crash: CrashState, awaken: AwakenState, reveal: RevealState,
                    truth: TruthState, standby: StandbyState, exit: ExitState };
    this.loop = this.loop.bind(this);
    this.onKey = this.onKey.bind(this);
    // 길게 눌러 건너뛰기 — SPACE · Enter 나 화면을 약 1초 누르고 있으면 마지막(SPACE 대기)으로
    this.onKeyUp = e => { if (e.code === 'Space' || e.code === 'Enter') this.holdK = false; };
    this.onPtr = e => { this.holdP = e.type === 'pointerdown'; };
    this.running = false;
  }
  start() {
    this.sfx.unlock();
    this.frame = 0;
    this.awake = false; this.light = 0; this.view = FULL_VIEW;
    this.go(this.dio ? 'rise' : 'crash');
    this.running = true;
    this.acc = 0;
    this.last = performance.now();
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('pointerdown', this.onPtr); addEventListener('pointerup', this.onPtr); addEventListener('pointercancel', this.onPtr);
    this.holdK = this.holdP = false; this.skipT = 0; this.skipShow = 0;
    this.raf = requestAnimationFrame(this.loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey);
    removeEventListener('keyup', this.onKeyUp);
    ['pointerdown', 'pointerup', 'pointercancel'].forEach(n => removeEventListener(n, this.onPtr));
    this.sfx.stopNoise();
    this.sfx.humStop();
    for (const r of [this.dio, this.lab3]) { const x = r && r.gl && r.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
    this.dio = this.lab3 = null;
  }
  go(name) {
    if (this.state && this.state.exit) this.state.exit(this);
    this.state = this.states[name];
    this.stateName = name;
    this.t = 0;
    if (this.state.enter) this.state.enter(this);
  }
  /* 고정 시간 간격 루프 — 화면 주사율이 달라도 연출 시간은 같습니다 */
  loop(now) {
    if (!this.running) return;
    this.acc += Math.min(100, now - this.last);
    this.last = now;
    while (this.acc >= STEP && this.running) {
      this.update();
      this.acc -= STEP;
    }
    if (!this.running) return;
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }
  update() {
    this.frame++;
    this.t++;
    if (/^(rise|crash|awaken|reveal|truth)$/.test(this.stateName)) {
      if (this.holdK || this.holdP) { this.skipT++; this.skipShow = 120; }
      else { this.skipT = Math.max(0, this.skipT - 3); this.skipShow = Math.max(0, this.skipShow - 1); }
      if (this.skipT >= 60 && this.frame > 30) { this.skipToEnd(); return; }
    } else this.skipShow = 0;
    this.state.update(this);
  }
  /* 건너뛰기 — 눈을 뜬 마지막 장면(SPACE 대기)으로. 터미널은 다 찍힌 채, 불은 켜진 채 */
  skipToEnd() {
    this.skipT = 0; this.skipShow = 0; this.holdK = this.holdP = false;
    this.sfx.setNoise(0); this.sfx.stopNoise(); this.sfx.humStart();
    if (!this.ekg.running) { this.ekg.start(); this.ekg.nextBeat = 4; this.ekg.period = 70; }
    this.ekg.target = 46; this.hudA = 1; this.light = 1; this.awake = true;
    const T = this.term; T.shown = T.lines.map(l => l.text); T.li = T.lines.length - 1; T.done = true;
    this.panelA = 1; this.pushT = 220; this.view = FACE_VIEW; this.source = null;
    this.go('standby');
  }
  draw() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
    this.state.draw(this, c);
    // 주사선 · 가장자리 그늘 — 3D 실험실(탈출과 같은 화면)에선 걷어 냄
    if (!(this.lab3 && /^(reveal|truth|standby|exit)$/.test(this.stateName))) c.drawImage(this.overlay, 0, 0);
    if (this.skipShow > 0) {                                     // 길게 눌러 건너뛰기 — 오른쪽 아래 고리
      const x = W - 36, y = H - 32, k = Math.min(1, this.skipT / 60);
      c.save(); c.globalAlpha = Math.min(1, this.skipShow / 30) * .85; c.lineCap = 'round'; c.lineWidth = 3;
      c.strokeStyle = 'rgba(232,238,246,.25)'; c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.stroke();
      if (k > 0) { c.strokeStyle = '#e8eef6'; c.beginPath(); c.arc(x, y, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke(); }
      c.font = `13px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = '#c9d3df';
      c.fillText('길게 눌러 건너뛰기', x - 20, y + 1); c.restore();
    }
  }
  onKey(e) {
    if (e.code === 'Enter' && !e.repeat) this.holdK = true;
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (e.repeat) return;                    // 길게 누르는 동안의 반복 입력으로 넘어가지 않게
    this.holdK = true;
    if (this.state.input) this.state.input(this, 'space');
  }
}
window.EndingScene = EndingScene;
})();
