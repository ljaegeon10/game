/* ═══════════════════════════════════════════════════════════
   audio.js — WebAudio 로 전부 합성합니다 (외부 음원 파일 없음)
   지상의 "새소리" 밑에 아주 작게 깔리는 기계음 비프/환풍기 소리가
   첫 번째 복선입니다.
   ═══════════════════════════════════════════════════════════ */
const Sfx = (() => {
  let ac = null, master = null, ambGain = null, amb = [], started = false;

  function ctx() {
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

    /* 엔딩의 지속 기계음 (삐——) */
    flatline(on) {
      const c = ctx();
      if (on) {
        if (api._fl) return;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = 1000;
        g.gain.setValueAtTime(0.0001, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.28, c.currentTime + 0.35);
        o.connect(g); g.connect(master); o.start();
        api._fl = { o, g };
      } else if (api._fl) {
        const { o, g } = api._fl;
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
        o.stop(c.currentTime + 1.4);
        api._fl = null;
      }
    },

    /* ── 배경 앰비언스 ─────────────────────────────────── */
    ambient(kind) {
      const c = ctx();
      api.ambientStop();
      ambGain = c.createGain();
      ambGain.gain.value = 0;
      ambGain.gain.linearRampToValueAtTime(kind === 'forest' ? 0.20 : 0.30, c.currentTime + 2);
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
        og.gain.value = 0.16;
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
