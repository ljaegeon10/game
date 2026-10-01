'use strict';
/* ═══════════════════════════════════════════════════════════════
   ending.js — 제3막 : 실험실 깨어남 (엔딩 씬)

   마지막 자물쇠를 연 순간의 방을 그대로 받아 글리치로 무너뜨리고,
   칠흑 속 심전도와 터미널로 "이 모든 게 수면 실험이었다"를 밝힙니다.
   Canvas 2D 와 WebAudio 만 쓰고, 본 게임 전역을 더럽히지 않도록
   전체를 즉시 실행 함수로 감싸 EndingScene 하나만 밖으로 냅니다.

   상태 머신
     crash   ─▶ awaken ─▶ truth ─▶ standby ─▶ exit ─▶ onReturn()
     (현실 붕괴)  (바이탈)   (진실)    (SPACE 대기)  (페이드)

   쓰는 법 (game.js 의 beginEnding)
     new EndingScene(canvas, {
       source:   () => 게임 화면 캔버스,   // 매 프레임 이걸 받아 무너뜨림
       audio:    () => AudioContext,       // 게임과 같은 오디오 컨텍스트
       onReturn: () => 엔드 카드 띄우기
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
  beep()     { this.tone(988, .12, { vol: .15 }); }
  tick()     { this.tone(rand(2100, 2600), .016, { type: 'square', vol: .02, attack: .001 }); }
  rip()      { this.tone(160, 1.0, { type: 'sawtooth', vol: .22, slideTo: 28 }); }
  powerOff() { this.tone(1400, .4, { vol: .1, slideTo: 50 }); }
  confirm()  { this.tone(660, .3, { vol: .1, slideTo: 330 }); }
}

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
    this.beats = []; this.nextBeat = 0; this.period = 0;
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
      this.period = lerp(this.period, 60, .35) + rand(-1.5, 1.5);
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
      s.sx.imageSmoothingEnabled = true;
      s.sx.drawImage(s.source(), 0, 0, LW, LH);
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

/* Phase 2 — 바이탈 사인 (약 7초)
   칠흑 속에서 청록 점 하나가 납작한 선을 긋다가, 첫 박동과 함께
   삐— 소리가 납니다. 선의 색은 터미널 녹색으로 식어 갑니다. */
const AwakenState = {
  enter(s) { s.ekg.reset(); s.ekgDy = 0; s.hudA = 0; },
  update(s) {
    if (s.t === 40) s.ekg.start();
    s.ekg.update();
    if (s.t > 150) s.hudA = Math.min(1, s.hudA + .015);
    if (s.t >= 430) s.go('truth');
  },
  draw(s, c) {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (s.hudA > 0) { c.globalAlpha = s.hudA; c.drawImage(s.grid, 0, 0); c.globalAlpha = 1; }
    s.ekg.draw(c, s.ekgDy);
    drawVitalsHud(s, c);
  }
};

/* Phase 3 — 진실 : 심전도가 위로 비켜 서고, 터미널이 떠오릅니다 */
const TruthState = {
  enter(s) { s.term.reset(); s.panelA = 0; },
  update(s) {
    s.ekg.update();
    s.ekgDy = lerp(s.ekgDy, -H * .17, .035);
    s.panelA = Math.min(1, s.panelA + .025);
    if (s.panelA > .6) s.term.update();
    if (s.term.done && s.term.doneT > 70) s.go('standby');
  },
  draw(s, c) {
    AwakenState.draw(s, c);
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
    c.fillText('PRESS SPACE TO RETURN', W / 2, H - 22);
    c.restore();
  },
  input(s, key) { if (key === 'space' && s.promptA > .5) s.go('exit'); }
};

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
  const pw = 680, ph = 172, px = (W - pw) / 2, py = H - ph - 54 + (1 - a) * 16;
  c.save();
  c.globalAlpha = a;
  c.fillStyle = 'rgba(2,12,6,.9)';
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
  let curX = px + 46, curY = py + 64;
  for (let i = 0; i <= T.li; i++) {
    const y = py + 64 + i * 36;
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
  constructor(canvas, { source, audio, onReturn } = {}) {
    this.canvas = canvas;
    canvas.width = W; canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.source = source;
    this.onReturn = onReturn || (() => {});
    this.sfx = new EndSfx(audio);
    [this.src, this.sx] = makeCanvas(LW, LH);
    this.glitch = new GlitchFX();
    this.ekg = new EKGMonitor(this.sfx);
    this.term = new Terminal(TRUTH_LINES, this.sfx);
    this.overlay = bakeOverlay();
    this.grid = bakeGrid();
    this.states = { crash: CrashState, awaken: AwakenState, truth: TruthState, standby: StandbyState, exit: ExitState };
    this.loop = this.loop.bind(this);
    this.onKey = this.onKey.bind(this);
    this.running = false;
  }
  start() {
    this.sfx.unlock();
    this.frame = 0;
    this.go('crash');
    this.running = true;
    this.acc = 0;
    this.last = performance.now();
    addEventListener('keydown', this.onKey);
    this.raf = requestAnimationFrame(this.loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey);
    this.sfx.stopNoise();
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
    this.state.update(this);
  }
  draw() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
    this.state.draw(this, c);
    c.drawImage(this.overlay, 0, 0);
  }
  onKey(e) {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (this.state.input) this.state.input(this, 'space');
  }
}
window.EndingScene = EndingScene;
})();
