/* ═══════════════════════════════════════════════════════════
   audio.js — WebAudio 로 전부 합성합니다 (외부 음원 파일 없음)
   지상의 "새소리" 밑에 아주 작게 깔리는 기계음 비프/환풍기 소리가
   첫 번째 복선입니다.
   ═══════════════════════════════════════════════════════════ */
const Sfx = (() => {
  let ac = null, master = null, ambGain = null, amb = [], started = false;

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
        master = ac.createGain();
        master.gain.value = 1.35;                 // 최대치 근처까지 올림 (전체 볼륨이 너무 작다는 피드백)
        // 소리를 키운 만큼, 겹쳐 울릴 때 찢어지지 않도록 리미터를 하나 걸어둡니다
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.knee.value = 18;
        comp.ratio.value = 14;
        comp.attack.value = 0.002;
        comp.release.value = 0.18;
        master.connect(comp);
        comp.connect(ac.destination);
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

    shoot()   { tone(720, 0.09, 'square', 0.16, 380); },
    hit()     { noise(0.09, 0.32, 900, 5200); tone(180, 0.07, 'square', 0.18, 90); },
    hurt()    { tone(200, 0.30, 'sawtooth', 0.40, 60); noise(0.2, 0.26, 200, 1800); },
    pickup()  { tone(880, 0.08, 'triangle', 0.32); setTimeout(() => tone(1320, 0.12, 'triangle', 0.28), 70); },
    keyGet()  { [660, 880, 1170].forEach((f, i) => setTimeout(() => tone(f, 0.13, 'triangle', 0.30), i * 85)); },
    chest()   { noise(0.3, 0.32, 120, 1400); tone(140, 0.4, 'sawtooth', 0.20, 70); },
    door()    { noise(0.5, 0.28, 80, 900); tone(90, 0.6, 'sine', 0.24, 50); },
    pot()     { noise(0.16, 0.40, 1400, 9000); },
    step()    { noise(0.05, 0.09, 300, 1400); },

    /* 몬스터가 죽을 때 — 피가 아니라 "코드가 튀는" 소리 */
    glitch() {
      const c = ctx(), t = c.currentTime;
      for (let i = 0; i < 7; i++) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(300 + Math.random() * 2600, t + i * 0.022);
        env(g, t + i * 0.022, 0.002, 0.03, 0.12);
        o.connect(g); g.connect(master);
        o.start(t + i * 0.022); o.stop(t + i * 0.022 + 0.05);
      }
      noise(0.14, 0.20, 2000, 12000);
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

    /* 정신이 들며 몰아쉬는 숨 */
    breath() { noise(0.42, 0.07, 240, 1500); },

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

    bossRoar() {
      tone(70, 1.3, 'sawtooth', 0.42, 40);
      tone(105, 1.1, 'square', 0.20, 55);
      noise(1.0, 0.30, 60, 900);
    },

    /* 지상 : 새소리 (평화로움) */
    bird() {
      const base = 1900 + Math.random() * 700;
      tone(base, 0.07, 'sine', 0.09, base * 1.35);
      setTimeout(() => tone(base * 1.2, 0.06, 'sine', 0.07, base * 0.85), 90);
    },

    /* ⚠ 복선 : 숲속에 어울리지 않는 기계 비프 */
    beep(vol = 0.07) { tone(1046, 0.055, 'square', vol); },

    /* 오프닝 — 피험자가 깨려 할 때 울리는 모니터 경보 (높게-낮게 두 음) */
    alarm() {
      tone(1320, 0.11, 'triangle', 0.13);
      setTimeout(() => tone(990, 0.15, 'triangle', 0.12), 130);
    },

    /* 오프닝 — "용량 올려" 뒤 약이 들어가는 순간: 차가운 쉿 소리와 가라앉는 저음 */
    inject() {
      noise(0.9, 0.16, 3000, 11000);
      tone(420, 1.2, 'sine', 0.22, 48);
      tone(63, 1.0, 'sine', 0.30, 30);
    },

    /* 오프닝 — 어둠 속 눈이 이쪽을 볼 때. 반음끼리 부딪는 날카로운 덩어리 */
    sting() {
      [233, 247, 349, 370].forEach((f, i) => tone(f, 1.3 - i * .1, 'sawtooth', 0.11, f * .94));
      tone(46, 1.4, 'sine', 0.36, 30);
      noise(0.5, 0.22, 900, 9000);
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
        src.connect(lp); lp.connect(g); g.connect(master);
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
        src.connect(g); g.connect(master);
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

    muteAll() { if (master) master.gain.value = 0; },
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
