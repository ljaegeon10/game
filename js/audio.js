/* ═══════════════════════════════════════════════════════════
   audio.js — WebAudio 로 전부 합성합니다 (외부 음원 파일 없음)
   지상의 "새소리" 밑에 아주 작게 깔리는 기계음 비프/환풍기 소리가
   첫 번째 복선입니다.
   ═══════════════════════════════════════════════════════════ */
const Sfx = (() => {
  let ac = null, master = null, mix = null, musicIn = null, revIn = null, ambGain = null, amb = [], started = false;

  /* 던전 브금 볼륨 — 환경음(0.12~0.15)보다 확실히 앞에 서도록 올렸습니다 */
  const BGM_VOL = 0.52;
  /* 맨 앞 "두둥" 을 1.5배로 키워 두는 시간 (그 뒤엔 본 곡 크기로 내려옴) */
  const BGM_HIT_HOLD = 1.6;

  /* ── 보스로 가는 길의 브금 세 단계 ────────────────────────────────
     셋 다 "앞부분을 한 번 들려준 뒤 정해진 구간만 반복" 구조라서, 버퍼
     하나에 loopStart / loopEnd 를 걸어 두는 같은 틀로 돌립니다. 아래
     숫자들은 tools/make_boss_bgm.py 가 잘라낸 실제 프레임 경계 값입니다.

     approach (관문)   : 보스방 바로 앞. 무음에서 차오르는 도입을 한 번
                         들려준 뒤 음량이 고른 3.0~12.9s 만 반복합니다.
     boss2 (눈 보스전) : 발소리·리버브 쪽. 본편만 잘라 통째로 반복합니다 —
                         싸움은 시작부터 격렬해야 하므로 도입은 버렸습니다.
     boss3 (심연)      : 산업 소음 쪽. 앞 11초가 조용하다가 11.4s 에서
                         터지는데, 컷신 시작이 아니라 BGM3_AT(각성 -
                         11.4초) 에 걸어야 그 지점이 각성과 맞습니다. */
  const BOSS_BGM = {
    approach: { src: () => (typeof APPROACH_BGM_B64 === 'undefined' ? null : APPROACH_BGM_B64),
                loopStart: 3.000,  loopEnd: 12.900, vol: 0.40, fade: 1.6 },
    boss2:    { src: () => (typeof BOSS2_BGM_B64 === 'undefined' ? null : BOSS2_BGM_B64),
                loopStart: 0,      loopEnd: 43.389, vol: 0.48, fade: 0.5 },
    boss3:    { src: () => (typeof BOSS3_BGM_B64 === 'undefined' ? null : BOSS3_BGM_B64),
                loopStart: 11.700, loopEnd: 54.800, vol: 0.50, fade: 1.8 }
  };
  /* 곡별 상태 : { buf, loading, want, node } */
  const bgmSt = { approach: {}, boss2: {}, boss3: {} };

  /* ── iPhone · iPad 무음 모드 ─────────────────────────────────
     iOS 사파리는 Web Audio 를 "알림음"처럼 다뤄서, 기기가 무음 모드이면
     내장 스피커로는 아무 소리도 내지 않습니다 (이어폰으로는 들림).
     ① iOS 17 이상 : navigator.audioSession.type = 'playback' 한 줄이면
        동영상처럼 "미디어 재생"으로 취급되어 무음 모드에서도 들립니다.
     ② 그보다 오래된 iOS : 무음 <audio> 하나를 반복 재생해 두면 페이지가
        미디어 재생 상태로 바뀌고, 그 덕에 Web Audio 도 함께 들립니다.
        재생은 사용자가 화면을 건드린 순간에만 허락되므로, 실패하면 다음
        터치에 다시 시도합니다. */
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let keepAlive = null, mediaMode = 'none';
  function silentWav() {                       // 0.25초짜리 무음 WAV (16bit · 8kHz · 모노)
    const n = 2000, buf = new Uint8Array(44 + n * 2), dv = new DataView(buf.buffer);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 16000, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, 'data'); dv.setUint32(40, n * 2, true);
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function playThroughSilentMode() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
      if (navigator.audioSession) { mediaMode = 'audioSession'; return; }
    } catch (e) { /* 지원하지 않으면 ② 로 */ }
    if (!IS_IOS || (keepAlive && !keepAlive.paused)) return;
    try {
      if (!keepAlive) {
        keepAlive = new Audio(silentWav());
        keepAlive.loop = true;
        keepAlive.setAttribute('playsinline', '');
        keepAlive.setAttribute('x-webkit-airplay', 'deny');
      }
      const p = keepAlive.play();
      mediaMode = 'keepAlive';
      if (p && p.catch) p.catch(() => { mediaMode = 'none'; });   // 다음 터치에 다시
    } catch (e) { mediaMode = 'none'; }
  }

  function ctx() {
    // 오디오 초기화가 (드물게) 막히거나 던지더라도, 이 때문에 게임 입력 자체가
    // 멈춰서는 안 됩니다 — 방어적으로 감싸 둡니다.
    playThroughSilentMode();
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        mix = ac.createGain();
        mix.gain.value = 1.35;                    // 최대치 근처까지 올림 (전체 볼륨이 너무 작다는 피드백)
        // 설정(settings.js) — 효과음은 master, 브금은 musicIn 으로 들어와 각자 음량을 거친 뒤 mix 에서 만남
        master = window.Settings ? Settings.bus(ac, 'sfx', mix) : mix;
        musicIn = window.Settings ? Settings.bus(ac, 'music', mix) : mix;
        // 소리를 키운 만큼, 겹쳐 울릴 때 찢어지지 않도록 리미터를 하나 걸어둡니다
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.knee.value = 18;
        comp.ratio.value = 14;
        comp.attack.value = 0.002;
        comp.release.value = 0.18;
        mix.connect(comp);
        // 잔향 — 돌방 울림 (기계음이 공간에 붙어 들리게). 효과음이 조금씩 보냄 (send)
        { const sr = ac.sampleRate, n = Math.floor(sr * 1.3), ir = ac.createBuffer(2, n, sr);
          for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < sr * .012 ? i / (sr * .012) : 1); }
          revIn = ac.createGain(); const cv = ac.createConvolver(); cv.buffer = ir; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
          const ro = ac.createGain(); ro.gain.value = .5; revIn.connect(lp); lp.connect(cv); cv.connect(ro); ro.connect(master); }
        comp.connect(window.Settings ? Settings.out(ac) : ac.destination);
      }
      // iOS 는 다른 앱에 다녀오거나 전화가 오면 'interrupted' 로 멈춥니다
      if (ac.state === 'suspended' || ac.state === 'interrupted') ac.resume();
    } catch (e) { /* 소리 없이도 게임은 계속됩니다 */ }
    return ac;
  }

  function env(node, t0, a, d, peak) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tone(freq, dur, type = 'square', vol = 0.16, slideTo = null) {
    const c = ctx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, 0.006, dur, vol);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* ── 효과음 도구 (기계음 · 충격음용) ──
     at : 지금부터 몇 초 뒤 · wet : 잔향으로 보낼 몫 */
  function sendOut(g, wet) { g.connect(master); if (wet && revIn) { const s = ac.createGain(); s.gain.value = wet; g.connect(s); s.connect(revIn); } }
  let NZ = null;
  function nzBuf() { if (!NZ) { const c = ctx(), n = c.sampleRate * 2; NZ = c.createBuffer(1, n, c.sampleRate); const d = NZ.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } return NZ; }
  /* 잡음 조각 — 거르개 모양을 골라서 (hp · lp · bp+q), sweep : 거르개 끝 주파수로 미끄러짐 */
  function burst(at, dur, vol, o = {}) {
    const c = ctx(), t = c.currentTime + at, src = c.createBufferSource(); src.buffer = nzBuf(); src.playbackRate.value = o.rate || 1;
    let node = src;
    const add = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.setValueAtTime(f, t); if (q) b.Q.value = q; if (o.sweep && type === (o.bp ? 'bandpass' : 'lowpass')) b.frequency.exponentialRampToValueAtTime(o.sweep, t + dur); node.connect(b); node = b; };
    if (o.hp) add('highpass', o.hp); if (o.lp) add('lowpass', o.lp); if (o.bp) add('bandpass', o.bp, o.q || 1);
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (o.a || .002)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    node.connect(g); sendOut(g, o.wet); src.start(t, Math.random() * 1.5); src.stop(t + dur + .02);
  }
  /* 몸통 — 음높이가 떨어지는 둔한 울림 (sine · 거른 톱니) */
  function body(at, f0, f1, dur, vol, o = {}) {
    const c = ctx(), t = c.currentTime + at, os = c.createOscillator(), g = c.createGain(); os.type = o.type || 'sine';
    os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * (o.glide || .7));
    let node = os; if (o.lp) { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = o.lp; b.Q.value = o.q || .7; os.connect(b); node = b; }
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (o.a || .004)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    node.connect(g); sendOut(g, o.wet); os.start(t); os.stop(t + dur + .03);
  }
  /* 금속 울림 — 배음이 어긋난 사인 여럿이 저마다 다른 길이로 사그라짐 (쇠 · 열쇠 · 걸쇠) */
  function metal(at, base, dur, vol, o = {}) {
    const ratios = o.ratios || [1, 2.76, 5.4, 8.93, 13.3];
    ratios.forEach((r, i) => body(at, base * r, base * r * (o.bend || 1), dur * (1 - i * .14), vol / (1 + i * .8), { wet: o.wet, a: .001, glide: 1 }));
  }
  /* 모터 — 톱니파를 좁게 걸러 웅 하고 도는 소리 (서보 · 펌프) */
  function servo(at, f0, f1, dur, vol, o = {}) {
    const c = ctx(), t = c.currentTime + at, os = c.createOscillator(), b = c.createBiquadFilter(), g = c.createGain(); os.type = 'sawtooth';
    os.frequency.setValueAtTime(f0, t); os.frequency.linearRampToValueAtTime(f1, t + dur);
    b.type = 'bandpass'; b.frequency.setValueAtTime(f0 * 4, t); b.frequency.linearRampToValueAtTime(f1 * 4, t + dur); b.Q.value = 3;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.04, dur * .2)); g.gain.setValueAtTime(vol, t + dur * .75); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    os.connect(b); b.connect(g); sendOut(g, o.wet); os.start(t); os.stop(t + dur + .03);
  }
  const vary = (k = .08) => 1 - k + Math.random() * k * 2;

  function noise(dur, vol = 0.2, hp = 400, lp = 6000) {
    const c = ctx(), t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f1 = c.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass';  f2.frequency.value = lp;
    const g = c.createGain(); env(g, t, 0.004, dur, vol);
    src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(master);
    src.start(t);
  }

  /* ── 개별 효과음 ─────────────────────────────────────── */
  const api = {
    unlock() { ctx(); },

    /* ── 전투 · 탐험 효과음 — 기계음 · 충격음 (뿅뿅 하는 단음 대신 잡음 · 몸통 · 금속 울림을 겹침) ──
       매번 음높이 · 결을 조금씩 달리해 연사해도 같은 소리가 반복되지 않게 */
    shoot() {                           // 에너지 권총 — 방아쇠 딸깍 · 압축 공기 '퓻' · 코일이 튀는 금속 잔향 · 낮은 반동
      const r = vary(.07);
      burst(0, .016, .3, { hp: 3200, a: .0005 });                         // 딸깍
      burst(.004, .11, .3, { bp: 2000 * r, q: 1.4, sweep: 700, a: .001, wet: .12 });   // 퓻 — 거르개가 내려가며
      body(.002, 190 * r, 58, .13, .42, { lp: 600 });                     // 반동
      metal(.006, 1350 * r, .16, .05, { ratios: [1, 1.53, 2.31], bend: .92, wet: .2 });   // 코일
    },
    hit() {                             // 맞힘 — 둔탁한 '퍽' · 으깨지는 결 · 짧은 금속 튐
      const r = vary(.1);
      body(0, 150 * r, 48, .14, .62, { lp: 420 });
      burst(0, .09, .46, { lp: 2400, hp: 160, a: .001, wet: .1 });
      burst(.006, .045, .22, { hp: 3200, a: .0008 });
      metal(.004, 820 * r, .08, .05, { ratios: [1, 2.4], wet: .15 });
    },
    hurt() {                            // 맞음 — 방호복이 찢기는 쿵 · 찌그러지는 금속 · 짧은 경고음 두 번
      body(0, 120, 34, .45, .72, { lp: 300 });
      body(0, 210, 60, .22, .3, { type: 'sawtooth', lp: 900 });
      burst(0, .3, .42, { lp: 1600, hp: 90, a: .002, wet: .22 });
      burst(.01, .06, .26, { hp: 2800 });
      metal(.01, 310, .32, .07, { ratios: [1, 1.82, 2.97, 4.1], bend: .8, wet: .25 });
      body(.12, 1180, 1180, .06, .05, { type: 'square', lp: 2600 }); body(.21, 880, 880, .08, .045, { type: 'square', lp: 2200 });   // 방호복 경고 삐삐
    },
    pickup()  {                         // 주움 — 걸쇠 딸깍 · 장비에 끼우는 착 · 짧은 확인음
      burst(0, .02, .32, { hp: 2400, a: .0005 });
      metal(.004, 2100, .07, .06, { ratios: [1, 1.7] });
      burst(.05, .03, .28, { bp: 1500, q: 2, a: .0008 });
      body(.07, 740, 980, .1, .07, { lp: 3000 });
    },
    keyGet()  {                         // 열쇠 — 쇠가 부딪쳐 울리는 짤랑 · 자물쇠 톱니 · 낮은 확인 울림
      metal(0, 1480, .55, .14, { wet: .3 }); metal(.07, 1960, .45, .1, { wet: .3 });
      burst(.0, .04, .25, { hp: 2000 });
      for (let i = 0; i < 4; i++) burst(.16 + i * .035, .02, .16, { bp: 2400, q: 3, a: .0005 });
      body(.3, 196, 196, .5, .16, { wet: .3 }); body(.3, 294, 294, .45, .08, { wet: .3 });
    },
    chest()   {                         // 상자 — 녹슨 경첩이 끼익 · 뚜껑이 덜컥
      const c = ctx(), t = c.currentTime, o = c.createOscillator(), b = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 210; lfo.frequency.value = 23; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
      b.type = 'bandpass'; b.frequency.setValueAtTime(1400, t); b.frequency.linearRampToValueAtTime(900, t + .35); b.Q.value = 6;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .05); g.gain.exponentialRampToValueAtTime(.0001, t + .38);
      o.connect(b); b.connect(g); sendOut(g, .2); o.start(t); lfo.start(t); o.stop(t + .4); lfo.stop(t + .4);
      body(.36, 130, 52, .3, .6, { lp: 380, wet: .25 }); burst(.36, .22, .34, { lp: 1300, hp: 80, wet: .25 });
      metal(.37, 520, .3, .06, { ratios: [1, 2.3, 3.9], wet: .3 });
    },
    door()    {                         // 문 — 공압 '치익' · 모터가 도는 웅 · 끝에 쇠가 맞물리는 덜컹
      burst(0, .5, .2, { bp: 3200, q: .6, sweep: 1800, a: .03, wet: .15 });
      servo(.02, 55, 82, .42, .1, { wet: .2 });
      body(.44, 110, 40, .32, .5, { lp: 320, wet: .3 }); burst(.44, .16, .28, { lp: 1800, hp: 60, wet: .3 });
      metal(.45, 240, .4, .07, { ratios: [1, 2.1, 3.4, 5.2], wet: .35 });
    },
    pot()     {                         // 항아리 · 포자 — 도기가 깨지는 쨍그랑 (잘게 갈라지는 조각들)
      const r = vary(.12);
      burst(0, .14, .4, { hp: 1200, a: .001, wet: .15 });
      for (let i = 0; i < 6; i++) metal(.01 + Math.random() * .12, (1800 + Math.random() * 2600) * r, .07 + Math.random() * .06, .045, { ratios: [1, 1.48] });
      body(0, 240 * r, 90, .12, .3, { lp: 700 });
    },
    step()    {                         // 발소리 — 돌바닥의 작은 사각 · 고무 밑창의 둔한 툭
      const r = vary(.15);
      burst(0, .045, .11, { bp: 1100 * r, q: .9, a: .002 });
      body(0, 95 * r, 60, .05, .12, { lp: 300 });
    },
    pick()    { burst(0, .012, .18, { hp: 3000, a: .0005 }); body(.003, 1320, 1320, .03, .04, { lp: 4000 }); },   // 메뉴 — 작은 딸깍

    /* 몬스터가 죽을 때 — 피가 아니라 "코드가 튀는" 소리 */
    glitch(k = 1) {                  // k : 세기 — 데이터가 부서지는 소리 : 잘게 깎인 잡음 덩어리 · 아래로 떨어지는 신호 · 짧은 전기 튐
      const c = ctx(), t = c.currentTime, sr = c.sampleRate, n = Math.floor(sr * .2), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
      let hold = 1, held = 0, amp = 1;
      for (let i = 0; i < n; i++) {
        if (i % 220 === 0) { hold = 2 + (Math.random() * 18 | 0); amp = Math.random() < .3 ? .15 : 1; }     // 덩어리마다 해상도가 깎임
        if (i % hold === 0) held = Math.random() * 2 - 1;
        d[i] = held * amp * Math.pow(1 - i / n, 1.4);
      }
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(3600, t); bp.frequency.exponentialRampToValueAtTime(500, t + .2); bp.Q.value = .8;
      const g = c.createGain(); g.gain.value = .3 * k; src.connect(bp); bp.connect(g); sendOut(g, .15); src.start(t);
      body(0, 900, 70, .18, .12 * k, { type: 'square', lp: 1800 });                 // 신호가 꺼지며 떨어짐
      burst(0, .03, .2 * k, { hp: 4000, a: .0005 });
    },

    /* 치지직 — 전파가 끊긴 TV 잡음. 덩어리째 커졌다 작아지며 갈라지고, 사이사이 탁탁 튀는 소리.
       dur 초 동안 고르게 이어집니다 (오프닝 글리치 길이에 맞춤), k 세기 */
    static(dur = .2, k = 1) {        // 가볍게 — 얇고 높은 "직 · 지직", 듬성듬성 끊기고 짧게 (낮은 웅웅거림 없이)
      const c = ctx(), t = c.currentTime, sr = c.sampleRate;
      dur = Math.min(dur, .16);
      const n = Math.floor(sr * (dur + .02)), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
      let amp = 1, seg = 0, hold = 1, held = 0;
      for (let i = 0; i < n; i++) {
        if (--seg <= 0) {                                    // 2‥10ms 마다 — 반쯤은 비어 있어 "직 · 직" 하고 듬성듬성
          seg = Math.floor(sr * (.002 + Math.random() * .008));
          amp = Math.random() < .45 ? 0 : .3 + Math.random() * .5;
          hold = Math.random() < .7 ? 1 : 2;                 // 거의 깨끗한 잡음 — 무겁게 뭉개지지 않게
        }
        if (i % hold === 0) held = Math.random() * 2 - 1;
        let v = held * amp;
        if (Math.random() < .0008) v = (Math.random() < .5 ? -.6 : .6);   // 아주 가끔 톡
        d[i] = v * Math.min(1, i / (sr * .002), (n - i) / (sr * .015));
      }
      const src = c.createBufferSource(); src.buffer = buf;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 6000; pk.Q.value = .9; pk.gain.value = 4;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000;
      const g = c.createGain(); g.gain.value = .13 * k;
      src.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(g); g.connect(master);
      src.start(t);
    },

    /* 종이 — 오래된 서류철을 펼치는 소리: 손에 쥐는 바스락 → 접힌 종이가 "펄럭" 펴지는 낮은 소리 → 잔잔한 사각거림.
       open=false 면 덮는 소리 (짧게 사각 → 탁) */
    paper(open = true) {
      const c = ctx(), t0 = c.currentTime, sr = c.sampleRate;
      const crinkle = (at, dur, vol, lo, hi) => {                // 바스락 — 잘게 끊긴 잡음 조각들
        const n = Math.floor(sr * dur), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
        let amp = 0, seg = 0;
        for (let i = 0; i < n; i++) {
          if (--seg <= 0) { seg = Math.floor(sr * (.003 + Math.random() * .014)); amp = Math.random() < .35 ? 0 : .25 + Math.random() * .75; }
          d[i] = (Math.random() * 2 - 1) * amp * Math.min(1, i / (sr * .01), (n - i) / (sr * .03));
        }
        const s2 = c.createBufferSource(); s2.buffer = buf;
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = lo;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hi;
        const g = c.createGain(); g.gain.value = vol;
        s2.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master); s2.start(t0 + at);
      };
      const flap = (at, vol) => {                                 // 펄럭 — 종이가 공기를 미는 낮은 바람
        const n = Math.floor(sr * .18), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) { const k = i / n; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * k) * (1 - k * .5); }
        const s2 = c.createBufferSource(); s2.buffer = buf;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = .7;
        const g = c.createGain(); g.gain.value = vol;
        s2.connect(bp); bp.connect(g); g.connect(master); s2.start(t0 + at);
      };
      if (open) {
        crinkle(0, .16, .16, 1800, 7000);        // 쥐고
        flap(.12, .32);                          // 펼치고
        crinkle(.2, .22, .1, 2400, 9000);        // 사각
        crinkle(.5, .14, .06, 3000, 9000);       // 손끝에 남는 잔 바스락
      } else {
        crinkle(0, .12, .12, 2000, 8000);
        flap(.08, .22);
      }
    },

    fall() {
      const c = ctx(), t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 1.9);
      env(g, t, 0.05, 1.9, 0.40);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.1);
      noise(1.6, 0.20, 60, 700);
    },

    /* 1인칭으로 눈을 껌뻑일 때 — 아주 작고 젖은 소리 */
    blink() { noise(0.045, 0.08, 700, 3200); tone(210, 0.05, 'sine', 0.05, 130); },

    /* 눈꺼풀 — 귀 바로 옆에서 나는 것처럼 아주 가깝고 작게.
       open  : 붙어 있던 눈꺼풀이 떨어지는 '쩍' (짧은 젖은 틱 두어 개) + 속눈썹이 스치는 바람
       close : 부드럽게 덮이는 '스윽' 끝에 아주 작은 '톡'
       amp 0‥1 = 얼마나 크게 떴다 감는지, dur = 움직이는 시간(초) */
    lid(open, amp = .5, dur = .25) {
      const c = ctx(), t = c.currentTime, v = .05 + amp * .09;
      const burst = (at, len, vol, f, q) => {           // 띠 거른 짧은 잡음 — 젖은 틱 · 스침
        const n = Math.max(32, Math.floor(c.sampleRate * len)), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) { const e = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - e, 2) * Math.min(1, e * 40); }
        const s = c.createBufferSource(); s.buffer = b;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const g = c.createGain(); g.gain.value = vol;
        s.connect(bp); bp.connect(g); g.connect(master); s.start(t + at);
      };
      const swish = (at, len, vol, f0, f1) => {         // 거른 잡음이 미끄러지는 스침
        const n = Math.floor(c.sampleRate * len), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const s = c.createBufferSource(); s.buffer = b;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
        bp.frequency.setValueAtTime(f0, t + at); bp.frequency.exponentialRampToValueAtTime(f1, t + at + len);
        const g = c.createGain(); g.gain.setValueAtTime(.0001, t + at);
        g.gain.exponentialRampToValueAtTime(vol, t + at + len * .35); g.gain.exponentialRampToValueAtTime(.0001, t + at + len);
        s.connect(bp); bp.connect(g); g.connect(master); s.start(t + at); s.stop(t + at + len + .02);
      };
      if (open) {
        burst(0, .012, v * 1.1, 2600, 3); burst(.018 + Math.random() * .01, .009, v * .7, 3400, 4);
        if (amp > .3) burst(.04, .008, v * .45, 2100, 4);
        swish(.01, Math.max(.12, dur * .8), v * .35, 900, 2600);
      } else {
        swish(0, Math.max(.1, dur * .7), v * .3, 2200, 800);
        burst(Math.max(.08, dur * .65), .01, v * .6, 1800, 3);
      }
    },
    /* 떨어진 뒤의 귀울림 — 높은 삐이 소리가 눈을 뜰수록 잦아듦 (level 0‥1, 0 이면 멈춤) */
    ring(level) {
      const c = ctx();
      if (!api._ring && level > 0) {
        const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = 6200; o2.type = 'sine'; o2.frequency.value = 6213;   // 살짝 맥놀이
        g.gain.value = .0001; o.connect(g); o2.connect(g); g.connect(master); o.start(); o2.start();
        api._ring = { o, o2, g };
      }
      if (!api._ring) return;
      const R = api._ring;
      R.g.gain.setTargetAtTime(Math.max(.0001, level * .016), c.currentTime, .25);
      if (level <= 0) { const r = R; api._ring = null; setTimeout(() => { try { r.o.stop(); r.o2.stop(); } catch (e) {} }, 1500); }
    },
    /* 먹먹하게 들리는 심장 — 귀를 막은 것처럼 낮게 (두 번 뛰기) */
    heartMuffled(vol = .2) {
      const c = ctx(), t = c.currentTime;
      [[0, 1], [.16, .7]].forEach(([d, k]) => {
        const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
        o.type = 'sine'; o.frequency.setValueAtTime(64, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + .14);
        lp.type = 'lowpass'; lp.frequency.value = 140;
        g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(vol * k, t + d + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d + .2);
        o.connect(lp); lp.connect(g); g.connect(master); o.start(t + d); o.stop(t + d + .25);
      });
    },

    /* 정신이 들며 몰아쉬는 숨 */
    breath() { noise(0.42, 0.07, 240, 1500); },
    /* 들이쉼 · 내쉼 — 들이쉼은 점점 커지고 높아지고, 내쉼은 낮게 빠짐 */
    inhale(vol = .07, dur = .55) {
      const c = ctx(), t = c.currentTime, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = b;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .9;
      bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(1500, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * .8); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
    },
    exhale(vol = .06, dur = .7) {
      const c = ctx(), t = c.currentTime, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = b;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .8;
      bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(380, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .08); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
    },

    /* 우물 바닥에 닿는 둔탁한 충격 — 암전 속에서 울리는 저음 */
    landThump(vol = 0.3) {
      const c = ctx(), t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.55);
      env(g, t, 0.006, 0.55, vol);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.7);
      noise(0.28, vol * 0.5, 40, 380);
    },

    bossRoar() {                     // 포효 — 어긋난 낮은 톱니 셋이 떨리며 · 쇠를 긁는 잡음 · 바닥이 울리는 저음
      const c = ctx(), t = c.currentTime, lp = c.createBiquadFilter(), g = c.createGain(), trem = c.createOscillator(), tg = c.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + 1.3); lp.Q.value = 2;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.34, t + .08); g.gain.exponentialRampToValueAtTime(.0001, t + 1.4);
      trem.frequency.value = 13; tg.gain.value = .12; trem.connect(tg); tg.connect(g.gain);
      [68, 71.5, 102].forEach(f => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .62, t + 1.3); o.connect(lp); o.start(t); o.stop(t + 1.45); });
      lp.connect(g); sendOut(g, .35); trem.start(t); trem.stop(t + 1.45);
      burst(0, 1.0, .22, { bp: 1700, q: 1.2, sweep: 600, a: .06, wet: .3 });
      body(0, 52, 30, 1.2, .5, { wet: .2 });
    },

    /* 지상 : 새소리 (평화로움) */
    bird() {
      const base = 1900 + Math.random() * 700;
      tone(base, 0.07, 'sine', 0.09, base * 1.35);
      setTimeout(() => tone(base * 1.2, 0.06, 'sine', 0.07, base * 0.85), 90);
    },

    /* ⚠ 복선 : 숲속에 어울리지 않는 기계 비프 */
    beep(vol = 0.07) { body(0, 1046, 1046, .07, vol * 1.3, { a: .002 }); body(0, 2092, 2092, .05, vol * .25, { a: .002 }); },   // 모니터 삑 — 맑은 사인 + 옅은 배음

    /* 오프닝 — 피험자가 깨려 할 때 울리는 모니터 경보 (높게-낮게 두 음) */
    alarm() {                        // 병원 모니터처럼 맑은 두 음
      body(0, 1320, 1320, .12, .12, { a: .003 }); body(0, 2640, 2640, .08, .02);
      body(.13, 990, 990, .16, .11, { a: .003 }); body(.13, 1980, 1980, .1, .018);
    },

    /* 오프닝 — "용량 올려" 뒤 약이 들어가는 순간: 차가운 쉿 소리와 가라앉는 저음 */
    inject() {
      noise(0.9, 0.16, 3000, 11000);
      tone(420, 1.2, 'sine', 0.22, 48);
      tone(63, 1.0, 'sine', 0.30, 30);
    },

    /* 오프닝 — 숫자를 세며 가라앉을 때. 아주 낮게 길게 꺼져 드는 음과 바람 */
    sink(sec = 6) {
      const c = ctx(), t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(34, t + sec);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + sec * .7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sec + .4);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + sec + .5);
      noise(sec, 0.06, 120, 900);
    },

    /* 대사 중 충격적인 사실이 "팡" 하고 커질 때 */
    reveal() {
      tone(52, 0.32, 'sine', 0.30, 40);
      tone(220, 0.05, 'triangle', 0.14);
      noise(0.1, 0.14, 1200, 7000);
    },

    /* 엔딩으로 넘어갈 때 깔리는 낮은 드론음.
       (예전엔 병원 모니터의 날카로운 "삐——" 였는데, 너무 신경을 긁어서
       가라앉듯 웅웅거리는 저음 두 겹 + 아주 느린 너울로 바꿨습니다.) */
    flatline(on) {
      const c = ctx();
      if (on) {
        if (api._fl) return;
        const t = c.currentTime;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 1.4);

        const o1 = c.createOscillator(), o2 = c.createOscillator();
        o1.type = 'sine'; o1.frequency.value = 54;
        o2.type = 'sine'; o2.frequency.value = 57;      // 살짝 어긋나 은은하게 울립니다

        // 아주 느리게 숨 쉬듯 커졌다 작아지는 너울
        const lfo = c.createOscillator(), lfoGain = c.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 0.12;
        lfoGain.gain.value = 0.06;
        lfo.connect(lfoGain); lfoGain.connect(g.gain);
        lfo.start();

        o1.connect(g); o2.connect(g); g.connect(master);
        o1.start(); o2.start();
        api._fl = { nodes: [o1, o2, lfo], g };
      } else if (api._fl) {
        const { nodes, g } = api._fl;
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.6);
        nodes.forEach(n => n.stop(c.currentTime + 1.8));
        api._fl = null;
      }
    },

    /* ── 이스터에그 ② : 관찰자가 끼어드는 장면 ──────────────
       숲 밖으로 나가려 하면 숨어 있던 장비 소리가 전면에 나옵니다.
       낮은 웅웅거림 + 아주 느린 맥놀이 + 위쪽에서 새는 금속성 배음. */
    creepDrone(on) {
      const c = ctx();
      if (on) {
        if (api._cd) return;
        const t = c.currentTime;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.34, t + 1.1);

        const sub = c.createOscillator();          // 몸으로 느껴지는 저음 무게
        sub.type = 'sine'; sub.frequency.value = 24;
        const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
        o1.type = 'sawtooth'; o1.frequency.value = 32;
        o2.type = 'sine';     o2.frequency.value = 33.2;   // 1.2Hz 맥놀이 — 속이 울렁거리는 간격
        o3.type = 'square';   o3.frequency.value = 1870;   // 형광등처럼 새는 고음
        const subG = c.createGain(); subG.gain.value = 0.55;
        const hi = c.createGain(); hi.gain.value = 0.010;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;

        sub.connect(subG); subG.connect(g);
        o3.connect(hi); hi.connect(g);
        o1.connect(lp); o2.connect(lp); lp.connect(g);
        g.connect(master);
        sub.start(); o1.start(); o2.start(); o3.start();
        api._cd = { nodes: [sub, o1, o2, o3], g };
      } else if (api._cd) {
        const { nodes, g } = api._cd;
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.9);
        nodes.forEach(n => n.stop(c.currentTime + 1.1));
        api._cd = null;
      }
    },

    /* 한 줄씩 찍히는 글씨 — 타자기보다 무전기에 가까운 소리 */
    creepType() {
      noise(0.07, 0.20, 900, 4200);
      tone(64, 0.16, 'square', 0.16, 38);
    },

    /* 점프스케어 — 비명 대신, 귀 바로 옆에서 장비가 터지는 소리.
       더 무겁게 — 화음을 한 옥타브 낮추고, 저음 두 겹 + 긴 꼬리를 깔았습니다. */
    scream() {
      const c = ctx(), t = c.currentTime;
      [65, 70, 98, 104].forEach(f => {          // 일부러 어긋난 화음 (한 옥타브 아래)
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 3, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 1.1);
        env(g, t, 0.004, 1.3, 0.30);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 1.4);
      });
      noise(1.1, 0.48, 90, 8000);
      tone(30, 1.7, 'sine', 0.48, 18);
      tone(20, 1.9, 'sine', 0.30, 14);         // 몸으로 느껴지는 저음 꼬리
    },

    /* ── 던전 탐사 브금 (우물 낙하 ~ 보스전 직전) ────────────
       받은 음원(SANABI OST)을 그대로, MP3 프레임 단위로 잘라 넣었습니다
       (재인코딩 없음). 잘라낸 시작점은 곡의 첫 "두둥" 타격 바로 앞이라,
       우물로 떨어지는 순간 재생을 시작하면 그 타격이 거의 동시에 터집니다.
       탐사 중에는 후렴이 시작되는 지점(원곡 54.343s)부터 다음 순환이
       같은 위상으로 돌아오는 지점(원곡 118.338s, 정확히 64.000s 뒤)까지를
       반복합니다 — 두 지점 모두 다음 타격이 오기 30ms 전이라 이어 붙인
       자리가 들리지 않습니다. 보스방에 들어서면 멈춥니다. */
    preloadDungeonBgm() {
      if (api._dgBuf || api._dgLoading || typeof DUNGEON_BGM_B64 === 'undefined') return;
      api._dgLoading = true;
      const c = ctx();
      const bin = atob(DUNGEON_BGM_B64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      c.decodeAudioData(u8.buffer,
        buf => { api._dgBuf = buf; api._dgLoading = false; if (api._dgWant) api.dungeonBgm(true); },
        ()  => { api._dgLoading = false; });
    },

    dungeonBgm(on) {
      const c = ctx();
      if (on) {
        api._dgWant = true;
        if (api._dg) return;
        if (!api._dgBuf) { api.preloadDungeonBgm(); return; }   // 디코딩 끝나면 자동 재생
        const t = c.currentTime;
        const src = c.createBufferSource();
        src.buffer = api._dgBuf;
        src.loop = true;
        src.loopStart = 48.079;   // 원곡 54.343s (후렴 시작)
        src.loopEnd = 112.074;    // 원곡 118.338s (같은 위상으로 되돌아오는 지점)
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 9500; lp.Q.value = 0.6;
        const g = c.createGain();
        /* 맨 앞의 "두둥" 한 방만 1.5배로 크게 때립니다. 그 울림이 잦아드는
           동안(HIT_HOLD) 크기를 유지했다가, 뒤이어 흐르는 본 곡은 원래
           크기로 내려와 깔립니다. */
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(BGM_VOL * 1.5, t + 0.05);
        g.gain.setValueAtTime(BGM_VOL * 1.5, t + BGM_HIT_HOLD);
        g.gain.exponentialRampToValueAtTime(BGM_VOL, t + BGM_HIT_HOLD + 1.2);
        src.connect(lp); lp.connect(g); g.connect(musicIn);
        src.start(t, 0);
        api._dg = { src, g };
      } else {
        api._dgWant = false;
        if (!api._dg) return;
        const { src, g } = api._dg; api._dg = null;
        try {
          g.gain.cancelScheduledValues(c.currentTime);
          g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), c.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.4);
          src.stop(c.currentTime + 1.6);
        } catch (e) {}
      }
    },

    /* 던전 탐사 브금 버퍼를 버립니다 — 보스전에 들어서면 다시 쓰지 않으므로
       (약 20MB 의 PCM 이라) 보스 브금 두 개를 올리기 전에 비워 둡니다. */
    dropDungeonBgm() {
      api.dungeonBgm(false);
      api._dgBuf = null;
    },

    /* ── 보스전 브금 ───────────────────────────────────── */
    preloadBossBgm(which) {
      const cfg = BOSS_BGM[which], st = bgmSt[which];
      if (!cfg || !st || st.buf || st.loading) return;
      const b64 = cfg.src();
      if (!b64) return;
      st.loading = true;
      const c = ctx();
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      c.decodeAudioData(u8.buffer,
        buf => { st.buf = buf; st.loading = false; if (st.want) api.bossBgm(which, true); },
        ()  => { st.loading = false; });
    },

    /* hard = true 면 여운 없이 즉시 끊습니다 (죽어서 처음부터 다시 싸울 때 —
       페이드로 겹치면 같은 곡이 두 겹으로 울려 이상해집니다)
       skipIntro = true 면 도입부를 건너뛰고 반복 구간부터 (타임어택은 변신
       컷신이 없어서, 조용한 도입을 기다려 줄 시간이 없습니다) */
    bossBgm(which, on, hard, skipIntro) {
      const cfg = BOSS_BGM[which], st = bgmSt[which];
      if (!cfg || !st) return;
      const c = ctx();
      if (on) {
        st.want = true;
        if (skipIntro) st.skip = true;
        if (st.node) return;
        if (!st.buf) { api.preloadBossBgm(which); return; }   // 디코딩 끝나면 자동 재생
        const t = c.currentTime;
        const src = c.createBufferSource();
        src.buffer = st.buf;
        src.loop = true;
        src.loopStart = cfg.loopStart;      // 도입부는 한 번만, 그 뒤로는 본편만
        src.loopEnd = Math.min(cfg.loopEnd, st.buf.duration);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(cfg.vol, t + cfg.fade);
        src.connect(g); g.connect(musicIn);
        src.start(t, st.skip ? cfg.loopStart : 0);
        st.skip = false;
        st.node = { src, g };
      } else {
        st.want = false;
        if (!st.node) return;
        const { src, g } = st.node; st.node = null;
        try {
          g.gain.cancelScheduledValues(c.currentTime);
          if (hard) {
            g.gain.setValueAtTime(0.0001, c.currentTime);
            src.stop(c.currentTime);
          } else {
            g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), c.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.1);
            src.stop(c.currentTime + 1.3);
          }
        } catch (e) {}
      }
    },

    bossBgmStopAll(hard) { Object.keys(BOSS_BGM).forEach(k => api.bossBgm(k, false, hard)); },

    /* 사망 화면에서 플랫라인 비프가 묻히지 않도록, 흐르는 보스 브금을 낮춥니다 */
    bossBgmDuck(down) {
      const c = ctx();
      Object.keys(BOSS_BGM).forEach(k => {
        const st = bgmSt[k];
        if (!st.node) return;
        const g = st.node.g;
        g.gain.cancelScheduledValues(c.currentTime);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), c.currentTime);
        g.gain.exponentialRampToValueAtTime(
          down ? BOSS_BGM[k].vol * 0.2 : BOSS_BGM[k].vol,
          c.currentTime + (down ? 0.4 : 0.9));
      });
    },

    /* 사망 화면 동안 살짝 낮췄다가 되돌립니다 (플랫라인 비프가 묻히지 않도록) */
    dungeonBgmDuck(down) {
      if (!api._dg) return;
      const c = ctx(), g = api._dg.g;
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), c.currentTime);
      g.gain.exponentialRampToValueAtTime(down ? BGM_VOL * 0.22 : BGM_VOL, c.currentTime + (down ? 0.4 : 0.9));
    },

    /* ── 배경 앰비언스 ─────────────────────────────────── */
    ambient(kind) {
      const c = ctx();
      api.ambientStop();
      ambGain = c.createGain();
      ambGain.gain.value = 0;
      ambGain.gain.linearRampToValueAtTime(kind === 'forest' ? 0.12 : 0.15, c.currentTime + 2);
      ambGain.connect(master);

      // 환풍기 / 공조기 소리 : 숲에서도 아주 작게 깔린다 (복선)
      const n = c.createBufferSource();
      const len = c.sampleRate * 2;
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.03) * 0.985; d[i] = last; }
      n.buffer = b; n.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = kind === 'forest' ? 320 : 640;
      n.connect(lp); lp.connect(ambGain); n.start();
      amb.push(n);

      // 지하는 낮은 드론음이 하나 더 깔린다
      if (kind !== 'forest') {
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'sine'; o.frequency.value = 48;
        og.gain.value = 0.09;
        o.connect(og); og.connect(ambGain); o.start();
        amb.push(o);
      }
      started = true;
    },

    ambientStop() {
      amb.forEach(n => { try { n.stop(); } catch (e) {} });
      amb = [];
      if (ambGain) { try { ambGain.disconnect(); } catch (e) {} ambGain = null; }
    },

    muteAll() { if (mix) mix.gain.value = 0; },
    /* 엔딩 씬(ending.js)이 자기 소리를 같은 컨텍스트에 얹을 때 씁니다 —
       새 컨텍스트를 만들면 브라우저 잠금을 다시 풀어야 하니까요. */
    context() { return ctx(); },
    started() { return started; },
    /* 실제 AudioContext 상태를 밖에서 들여다보기 위한 진단용 —
       'running' 이 아니면 브라우저/호스트가 오디오를 막고 있는 겁니다. */
    audioState() { return ac ? ac.state : 'none'; },
    /* 무음 모드 우회가 어떤 방식으로 걸렸는지 (진단용) */
    mediaState() { return { ios: IS_IOS, mode: mediaMode, keepAlive: keepAlive ? !keepAlive.paused : null }; }
  };
  return api;
})();
