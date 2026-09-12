/* ═══════════════════════════════════════════════════════════
   audio.js — WebAudio 로 전부 합성합니다 (외부 음원 파일 없음)
   지상의 "새소리" 밑에 아주 작게 깔리는 기계음 비프/환풍기 소리가
   첫 번째 복선입니다.
   ═══════════════════════════════════════════════════════════ */
const Sfx = (() => {
  let ac = null, master = null, ambGain = null, amb = [], started = false;

  /* 던전 브금 볼륨 — 환경음(0.12~0.15)보다 확실히 앞에 서도록 올렸습니다 */
  const BGM_VOL = 0.52;

  function ctx() {
    // 오디오 초기화가 (드물게) 막히거나 던지더라도, 이 때문에 게임 입력 자체가
    // 멈춰서는 안 됩니다 — 방어적으로 감싸 둡니다.
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
      if (ac.state === 'suspended') ac.resume();
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
        g.gain.exponentialRampToValueAtTime(0.30, t + 1.1);

        const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
        o1.type = 'sawtooth'; o1.frequency.value = 38;
        o2.type = 'sine';     o2.frequency.value = 39.4;   // 1.4Hz 맥놀이 — 속이 울렁거리는 간격
        o3.type = 'square';   o3.frequency.value = 1870;   // 형광등처럼 새는 고음
        const hi = c.createGain(); hi.gain.value = 0.012;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;

        o3.connect(hi); hi.connect(g);
        o1.connect(lp); o2.connect(lp); lp.connect(g);
        g.connect(master);
        o1.start(); o2.start(); o3.start();
        api._cd = { nodes: [o1, o2, o3], g };
      } else if (api._cd) {
        const { nodes, g } = api._cd;
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.9);
        nodes.forEach(n => n.stop(c.currentTime + 1.1));
        api._cd = null;
      }
    },

    /* 한 줄씩 찍히는 글씨 — 타자기보다 무전기에 가까운 소리 */
    creepType() {
      noise(0.05, 0.16, 1800, 7000);
      tone(96, 0.10, 'square', 0.10, 62);
    },

    /* 점프스케어 — 비명 대신, 귀 바로 옆에서 장비가 터지는 소리 */
    scream() {
      const c = ctx(), t = c.currentTime;
      [131, 139, 196, 208].forEach(f => {          // 일부러 어긋난 화음
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 3, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.9);
        env(g, t, 0.004, 0.9, 0.26);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 1.0);
      });
      noise(0.9, 0.42, 200, 11000);
      tone(44, 1.2, 'sine', 0.40, 28);
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
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(BGM_VOL, t + 0.35);
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
    started() { return started; }
  };
  return api;
})();
