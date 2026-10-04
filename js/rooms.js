/* ═══════════════════════════════════════════════════════════
   rooms.js — 맵 그래프 · 스토리 텍스트 · 밸런스 수치

   방은 격자 좌표(gx, gy)에 놓이고, 맞닿은 방끼리 자동으로 문이 생깁니다.
   갈림길에서 세 갈래로 퍼졌다가 '중앙'과 '관문'에서 다시 하나로 합쳐지므로,
   길을 헤매도 결국 같은 출구에 도달합니다.

            [북]⛨───[북동]
              │        │
   [시작]──[갈림길]──[중앙]──[관문]──[보스]──[탈출]
              │        │
            [남]⛨───[남동]

   ⛨ = 전멸시키면 관문 열쇠가 나오는 방 (북 · 남)
        → 타임어택은 이 둘만 들르면 관문까지 직행할 수 있고,
          일반 모드는 북동 · 남동까지 전부 밟아야 관문이 열립니다.

   전체 플레이 타임 목표 : 약 7~8분
   ═══════════════════════════════════════════════════════════ */

const BALANCE = {
  playerHp:      3,      // 하트 3개
  playerSpeed:   2.15,
  forestSpeedMult: 0.66, // 지상(숲)에서는 여유롭게 걷습니다 (던전 속도는 그대로)
  playerFireCd:  20,     // 초당 3발
  bulletSpeed:   4.6,
  bulletLife:    48,
  bulletDmg:     1,
  invFrames:     66,     // 체력이 적으므로 무적 시간을 넉넉히

  shroomHp:      3,
  shroomSpeed:   0.70,
  spitterHp:     4,
  spitterSpeed:  0.45,
  spitterCd:     138,
  spore:         1.5,

  /* ── 추가 몹 ──────────────────────────────────────────────
     포자충 : 느릿하게 다가오며 발밑에 포자 구름을 흘립니다.
              구름 안에 있으면 이동 속도가 확 떨어집니다.
     분열체 : 죽으면 작고 빠른 새끼 둘로 쪼개집니다.
     돌진체 : 잠깐 웅크렸다가(예비 동작) 직선으로 튀어 나옵니다.
     점멸체 : 주기적으로 사라졌다 주인공 옆에 다시 나타납니다. */
  sporerHp:      3,
  sporerSpeed:   0.34,
  sporerCd:      124,     // 포자를 흘리는 간격
  slowFrames:    96,      // 포자를 밟았을 때 느려지는 시간
  slowMult:      0.42,    // 느려지는 정도

  splitterHp:    4,
  splitterSpeed: 0.52,
  miniHp:        1,
  miniSpeed:     1.22,

  chargerHp:     4,
  chargerSpeed:  0.30,
  chargerCd:     132,     // 돌진 간격
  chargerWind:   34,      // 예비 동작 길이 (피할 시간)
  chargerDash:   6.0,     // 돌진 속도

  blinkerHp:     3,
  blinkerSpeed:  0.26,
  blinkerCd:     150,     // 점멸 간격

  knockback:     7.5,    // 몹이 맞았을 때 밀려나는 거리
  foeFlash:      9,      // 몹 피격 깜빡임 프레임

  bossHp:        78,     // 하트 3개 기준 약 60~75초
  bossSpeed:     0.66,   // 보스방이 넓어진 만큼 조금 빠르게 (0.60 → 0.66)

  /* 페이즈3 — 눈이 터진 자리에서 기어 나오는 것.
     졸개 없이 1:1 로만 싸우는 대신, 선공이 굵고 예비 동작이 짧습니다. */
  abomHp:        88,
  abomSpeed:     0.55,   // 넓어진 방에 맞춰 조금 빠르게 (0.50 → 0.55)
  abomPlayerMax: 5,     // 변신하는 틈에 떨어진 피팩을 주워 먹어 체력칸이 늘어납니다

  /* 보스 패턴 배율 — 1 이 예전 기준. 공격 간격·예비 동작은 클수록 느긋하고,
     탄속은 작을수록 느리며, 나선탄 간격은 클수록 드문드문 쏩니다.
     boss* = 페이즈2(눈), abom* = 페이즈3(심연)
     보스방이 넓어져(768×432) 피할 자리가 늘어난 만큼, 세 난이도 모두 살짝 올렸습니다 —
     공격 간격 ×0.92 · 탄속 ×1.06 · 눈의 원형 포자 +2발. 예비 동작(피할 틈)은 그대로. */
  bossCdMul:     .92, bossWindMul: 1,  bossShotMul: 1.06, bossSpiralMul: 1,
  abomCdMul:     .92, abomWindMul: 1,  abomShotMul: 1.06, abomSpiralMul: 1,
  bossRingAdd:   2,     // 눈의 원형 포자 발수에 더함 (8 · 12 → 10 · 14)
  abomGapAdd:    0      // 비명 파동의 빠져나갈 틈을 이만큼(라디안) 넓힙니다
};

/* ── 난이도 ───────────────────────────────────────────────
   위의 BALANCE 는 '보통' 값 그 자체입니다. 아래 표에는 그 위에 덮어쓸
   값만 적어 두고, applyDifficulty() 가 판을 시작할 때마다 BALANCE 를
   원본으로 되돌린 뒤 고른 난이도의 값을 얹습니다. 게임 코드 곳곳은
   BALANCE.xxx 를 그때그때 읽으므로, 이 한 곳만 바꾸면 전부 따라옵니다.

   타임어택은 기록 경쟁이라 난이도를 고르지 않고 언제나 '보통'입니다. */
const BALANCE_BASE = Object.freeze({ ...BALANCE });

const DIFF = {
  /* 쉬움 — 하트가 한 칸 늘고, 무적 시간과 연사가 넉넉해집니다.
     몹은 덜 단단하고 느리며, 예비 동작을 길게 보여 줍니다. */
  easy: {
    id: 'easy', name: '쉬움', tag: '처음 내려가 본다면',
    desc: '하트 4칸 · 느긋한 것들',
    over: {
      playerHp: 4, abomPlayerMax: 6,
      invFrames: 84, playerFireCd: 16, bulletLife: 56,

      shroomHp: 2, shroomSpeed: 0.60,
      spitterHp: 3, spitterSpeed: 0.38, spitterCd: 176, spore: 1.25,
      sporerHp: 2, sporerSpeed: 0.28, sporerCd: 160, slowFrames: 70, slowMult: 0.55,
      splitterHp: 3, splitterSpeed: 0.44, miniSpeed: 1.02,
      chargerHp: 3, chargerSpeed: 0.25, chargerCd: 168, chargerWind: 46, chargerDash: 5.0,
      blinkerHp: 2, blinkerSpeed: 0.21, blinkerCd: 190,
      knockback: 9.0,

      /* 보스는 페이즈2(눈) · 페이즈3(심연)을 같은 폭으로 한 번 더 낮춥니다 —
         체력 −15%, 느리게, 공격 간격 ×1.2, 예비 동작 ×1.25, 탄속 ×0.9,
         나선탄 ×1.4 드물게. 심연은 비명의 틈도 넓어집니다.
         (넓어진 보스방에 맞춰 예전보다 살짝 올림 — 속도 0.46→0.50 · 0.38→0.42,
          공격 간격 ×1.3→×1.2, 탄속 ×0.85→×0.9, 원형 포자 +2발) */
      bossHp: 51, bossSpeed: 0.50,
      bossCdMul: 1.2, bossWindMul: 1.25, bossShotMul: .9, bossSpiralMul: 1.4,
      abomHp: 56, abomSpeed: 0.42,
      abomCdMul: 1.2, abomWindMul: 1.25, abomShotMul: .9, abomSpiralMul: 1.4,
      abomGapAdd: .18
    }
  },

  /* 보통 — 지금까지의 균형 그대로 (덮어쓰는 값 없음) */
  normal: {
    id: 'normal', name: '보통', tag: '우물이 원래 깊던 만큼',
    desc: '하트 3칸 · 기준 균형',
    over: {}
  },

  /* 어려움 — 하트는 그대로 3칸인데 무적 시간이 짧아 연달아 맞습니다.
     몹은 더 단단하고 빠르며, 돌진의 예비 동작이 눈에 띄게 짧습니다. */
  hard: {
    id: 'hard', name: '어려움', tag: '더 굵고, 더 빠른 것들',
    desc: '하트 3칸 · 짧은 무적',
    over: {
      playerHp: 3, abomPlayerMax: 4,
      invFrames: 50, playerFireCd: 24,

      shroomHp: 4, shroomSpeed: 0.84,
      spitterHp: 5, spitterSpeed: 0.55, spitterCd: 108, spore: 1.85,
      sporerHp: 4, sporerSpeed: 0.42, sporerCd: 96, slowFrames: 120, slowMult: 0.34,
      splitterHp: 5, splitterSpeed: 0.64, miniSpeed: 1.45,
      chargerHp: 5, chargerSpeed: 0.38, chargerCd: 104, chargerWind: 26, chargerDash: 7.2,
      blinkerHp: 4, blinkerSpeed: 0.33, blinkerCd: 116,
      knockback: 5.5,

      /* 보스는 보통보다 한 걸음 더 — 넓어진 보스방에 맞춰 살짝 올림
         (속도 0.72→0.79 · 0.60→0.66, 공격 간격 ×0.88, 탄속 ×1.1, 나선탄 ×0.9 자주,
          원형 포자 +2발) */
      bossHp: 96, bossSpeed: 0.79,
      bossCdMul: .88, bossShotMul: 1.1, bossSpiralMul: .9,
      abomHp: 108, abomSpeed: 0.66,
      abomCdMul: .88, abomShotMul: 1.1, abomSpiralMul: .9
    }
  }
};
const DIFF_ORDER = ['easy', 'normal', 'hard'];

/* 고른 난이도를 BALANCE 에 얹고, 그 난이도 정보를 돌려줍니다 */
function applyDifficulty(id) {
  const d = DIFF[id] || DIFF.normal;
  Object.assign(BALANCE, BALANCE_BASE, d.over);
  return d;
}

/* ── 쪽지 ────────────────────────────────────────────────── */
const NOTES = {
  n1: {
    date: '2145 / 05 / 01',
    body: 'ㅇㅇ박사의 연구 프로젝트에 참여한 지 4달이 되었다.\n' +
          '이 프로젝트는 꿈에 대한 프로젝트인데\n' +
          '꿈과 현실의 경계를',
    cut:  '……흐릿해서 더는 읽을 수 없다.'
  },
  n2: {
    date: '2145 / 05 / 15',
    body: '경계가 무너지고 있다.\n' +
          '던전에서 보는 피는 내 혈액이고,\n' +
          '저 해골들은… 박사가 나에게 주입하는 환각인가?\n' +
          '나가야 한다. 우물은 탈출구가 아니라, 나를 가둔',
    cut:  '……여기서 종이가 찢겨 있다.'
  },
  n3: {
    date: '2145 / 05 / 18',
    body: '길이 자꾸 바뀐다.\n' +
          '같은 방으로 몇 번이나 돌아왔는데\n' +
          '벽의 날짜만 앞으로 간다.\n' +
          '헤매는 게 아니라 ─ 누가 계속 다시 재우는 거다.',
    cut:  '……잉크가 번져 있다.'
  }
};

/* ── 지상 (숲) ──────────────────────────────────────────── */
/* 오프닝 — 숲에서 막 눈을 떠 누운 채로 하는 생각 */
const OPENING_LINES = [
  { t: '…언제 잠들었지.', w: true },
  { t: '해가 기울었다. 숲 안쪽은 벌써 어둡다.', w: false },
  { t: '길 끝에 오래된 우물이 하나 있다고 들었다.', w: false }
];
/* 탑뷰로 바뀐 뒤 처음 손에 쥐어지는 조작 안내 */
const FOREST_HINT = [{ t: '이동 — W A S D', sys: true }];

const FOREST = {
  kind: 'forest', date: '2145 / 05 / 01',
  intro: [
    { t: '해가 기울었다. 숲 안쪽은 벌써 어둡다.', w: false },
    { t: '길 끝에 오래된 우물이 하나 있다고 들었다.', w: false },
    { t: '이동 — W A S D', sys: true }
  ]
};

/* ── 던전 방 그래프 ─────────────────────────────────────────
   gx, gy  : 격자 좌표 (맞닿으면 문이 생깁니다)
   depth   : 단청이 어긋나는 정도 / 바닥 장식 밀도
   enemies : 적 배치
   pots    : 항아리 (부수면 하트가 나올 수 있음)
   key     : 바닥에 떨어진 열쇠 (상자를 여는 용도)
   chest   : 상자 — note 쪽지 / heal 회복량 / doorKey 관문 열쇠 여부
   clear   : 'doorKey' 전멸 시 관문 열쇠 · 'key' 전멸 시 상자 열쇠
   ───────────────────────────────────────────────────────── */
const MAP = {
  start: {
    gx: 0, gy: 1, depth: 1, name: '우물 아래',
    intro: [
      { t: '…차갑다. 올라가려던 사다리는 이미 무너져 있다.', w: false },
      { t: '공격 — 방향키 / 마우스', sys: true }
    ],
    enemies: [{ t: 'shroom', x: 408, y: 100 }],
    pots: [{ x: 115, y: 250 }]
  },

  fork: {
    gx: 1, gy: 1, depth: 1, name: '갈림길',
    intro: [{ t: '길이 셋으로 갈린다. 어느 쪽이든 안쪽으로 이어지는 것 같다.', w: false }],
    enemies: [{ t: 'shroom', x: 156, y: 90 }, { t: 'shroom', x: 420, y: 230 }],
    pots: [{ x: 288, y: 70 }, { x: 288, y: 250 }]
  },

  north: {
    gx: 1, gy: 0, depth: 2, name: '북쪽 방',
    intro: [{ t: '벽의 날짜가 바뀌어 있다. **분명 방금 지나온 곳인데.**', w: true }],
    enemies: [
      { t: 'shroom', x: 132, y: 100 }, { t: 'charger', x: 444, y: 100 },
      { t: 'shroom', x: 288, y: 240 }, { t: 'spitter', x: 456, y: 220 }
    ],
    pots: [{ x: 96, y: 240 }],
    clear: 'doorKey'          // 전멸 → 관문 열쇠 ①
  },

  south: {
    gx: 1, gy: 2, depth: 2, name: '남쪽 방',
    intro: [{ t: '바닥에 뼈가 유난히 많다. 구석에는 상자 하나.', w: false }],
    enemies: [
      { t: 'shroom', x: 144, y: 120 }, { t: 'sporer', x: 432, y: 210 },
      { t: 'shroom', x: 432, y: 100 }
    ],
    pots: [{ x: 480, y: 90 }],
    chest: { x: 288, y: 160, note: 'n1', heal: 1 },
    clear: 'doorKey'          // 전멸 → 관문 열쇠 ② (이 방은 ⛨ 만 줍니다)
  },

  mid: {
    gx: 2, gy: 1, depth: 3, name: '중앙',
    intro: [{ t: '세 갈래가 여기서 다시 만난다. 결국 같은 곳으로 돌아온 셈이다.', w: true }],
    enemies: [
      { t: 'spitter', x: 144, y: 90 }, { t: 'blinker', x: 432, y: 240 },
      { t: 'shroom', x: 288, y: 90 }
    ],
    pots: [{ x: 108, y: 250 }, { x: 480, y: 90 }],
    chest: { x: 288, y: 168, note: 'n2', heal: 1 }
  },

  ne: {
    gx: 2, gy: 0, depth: 3, name: '북동 통로',
    intro: [{ t: '천장에서 뿌리가 내려와 있다. 여긴 더 오래 방치된 것 같다.', w: false }],
    enemies: [
      { t: 'shroom', x: 144, y: 100 }, { t: 'splitter', x: 432, y: 100 },
      { t: 'shroom', x: 288, y: 230 }
    ],
    pots: [{ x: 288, y: 80 }],
    key: { x: 480, y: 240 },                  // 바닥 열쇠 (중앙에서 옮겨 왔습니다)
    clear: 'key',                             // 전멸 → 상자 열쇠
    chest: { x: 144, y: 230, heal: 1 }        // 회복만 들어 있는 상자
  },

  se: {
    gx: 2, gy: 2, depth: 4, name: '남동 통로',
    intro: [{ t: '벽 낙서의 날짜가 **며칠씩 건너뛴다.**', w: true }],
    enemies: [
      { t: 'sporer', x: 144, y: 100 }, { t: 'charger', x: 432, y: 110 },
      { t: 'shroom', x: 156, y: 240 }, { t: 'spitter', x: 444, y: 235 }
    ],
    pots: [{ x: 288, y: 250 }],
    key: { x: 108, y: 90 },                   // 바닥 열쇠 (남쪽 방에서 옮겨 왔습니다)
    clear: 'key',                             // 전멸 → 상자 열쇠
    chest: { x: 288, y: 150, heal: 1 }        // 회복만 들어 있는 상자
  },

  gate: {
    gx: 3, gy: 1, depth: 4, name: '관문', needKeys: 2,
    intro: [{ t: '거대한 잠금장치가 둘. 나란히 잠겨 있다.', w: false }],
    enemies: [{ t: 'splitter', x: 180, y: 100 }, { t: 'blinker', x: 396, y: 220 }],
    pots: [{ x: 108, y: 90 }, { x: 480, y: 250 }],
    clear: 'key',                             // 전멸 → 상자 열쇠
    chest: { x: 288, y: 250, note: 'n3', heal: 1 }
  },

  boss: {
    gx: 4, gy: 1, depth: 5, name: '심층', boss: true,
    size: [768, 432],                // 보스방만 화면(576×324)보다 넓습니다 — 카메라가 따라갑니다
    intro: [
      { t: '벽 전체가 5 / 20 이라는 글씨로 뒤덮여 있다.', w: true },
      { t: '**…무언가가 이쪽을 보고 있다.**', w: true }
    ],
    pots: [{ x: 96, y: 82 }, { x: 672, y: 82 }, { x: 96, y: 350 }, { x: 672, y: 350 }]
  },

  exit: {
    gx: 5, gy: 1, depth: 5, name: '탈출구', final: true, needBoss: true,
    intro: [
      { t: '지상으로 통하는 문. 우물의 파이프가 위로 뻗어 있다.', w: false },
      { t: '마지막 잠금장치. 이걸 열면, 끝나는 걸까.', w: true }
    ]
  }
};

/* ── 모드별 진행 조건 ──────────────────────────────────────
   관문(gate)을 여는 조건이 모드에 따라 갈립니다.

   · 타임어택 : 관문 열쇠 2 개만 모으면 통과.
                북쪽 방 · 남쪽 방만 들르면 되므로 지름길이 생깁니다.
                (시작 → 갈림길 → 북 → 갈림길 → 남 → 갈림길 → 중앙 → 관문)

   · 일반     : 관문 열쇠 2 개 + 아래 방을 **전부** 밟아야 통과.
                북동 · 남동 통로까지 둘러봐야 하므로 쪽지와 상자를
                모두 보게 됩니다.
   ───────────────────────────────────────────────────────── */
const EXPLORE_ROOMS = ['start', 'fork', 'north', 'south', 'mid', 'ne', 'se'];

/* 방을 처음 밟을 때마다 며칠씩 건너뛰는 날짜 (복선) */
const DATES = [
  '2145 / 05 / 01', '2145 / 05 / 03', '2145 / 05 / 05', '2145 / 05 / 08',
  '2145 / 05 / 10', '2145 / 05 / 12', '2145 / 05 / 15', '2145 / 05 / 17',
  '2145 / 05 / 18', '2145 / 05 / 20', '2145 / 05 / 20'
];

/* ── 나레이션 ───────────────────────────────────────────── */
const FALL_LINES = [
  { t: '우물 안은… 생각보다 훨씬 깊다. 바닥이 안 보인다.', w: false },
  { t: '난간 돌을 짚고 몸을 숙인 순간, 손바닥 밑 이끼가 밀렸다.', w: false },
  { t: '중심이 앞으로 쏠린다. 붙잡을 게 없다.', w: true }
];

const GLITCH_LINES = [
  { t: '피가 튀지 않았다. 잠깐… **숫자 같은 게 흩어졌다.**', w: true }
];

/* 페이즈3 변신 컷신 위로 흐르는 관측 로그.
   주인공의 속마음(대사)이 아니라, 바깥에서 이 장면을 계기판으로 지켜보는
   쪽의 기록입니다 — 엔딩의 시스템 문구와 같은 타이핑 효과로 찍힙니다.
   [시작 프레임, 문구, 경고색 여부] */
/* 변신 컷신 위로 흐르는 두 목소리 — [시작 프레임, 문구, 목소리].

   sys   : 바깥에서 계기판으로 지켜보는 쪽. 차가운 청록 고정폭 글씨로,
           기계가 한 글자씩 찍어 내려갑니다.
   alert : 같은 쪽인데 경고/명령으로 넘어간 대목. 붉게 바뀝니다.
   abyss : 심연이 대답합니다. 기계가 찍는 글씨가 아니라 크고 흐릿한
           핏빛으로, 커서도 없이 흔들리며 떠오릅니다.

   처분 명령 제 141 호를 읽어 내리는 쪽과, 그걸 몇 번이나 들어 봤다는
   쪽이 주고받는 구조입니다 — 어명을 집행하는 자리처럼. */
const MORPH_SYS = [
  [ 46, 'SUBJECT 07 · DREAM SESSION 141', 'sys'],
  /* 피험자가 바닥에 굴러 있던 구급 팩을 주워 삼키는 대목 — 본인은 살려고
     한 일인데, 지켜보는 쪽 기록으로는 "투여를 허용했다"가 됩니다. */
  [200, '피험자 — 응급 키트 회수', 'sys'],
  [286, '생체 보조 투여 … 허용', 'sys'],
  [378, '……또 너냐.', 'abyss'],
  [445, '경고 — 미등록 인지체 발견', 'alert'],
  [538, '몇 번째인지, 세어는 보았나.', 'abyss'],
  [630, '처분 명령 제 141 호 — 집행', 'alert'],
  [726, '그 명령을 내리는 쪽은, 네 뒤에 있다.', 'abyss'],
  [840, 'ENTITY 「심연」 · 동기화 완료', 'alert']
];

const BOSS_DEAD_LINES = [
  { t: '저건 눈이었나. 아니면 **나를 들여다보던 화면이었나.**', w: true },
  { t: '손에 마지막 열쇠가 쥐어져 있다.', w: false }
];

/* 세 줄로 나눠, 한 줄마다 화면이 한 단계씩 더 무너지게 합니다 (fx — game.js LINE_FX) */
const ENDING_LINES = [
  { t: '열쇠를 꽂는다. 딸깍.', w: false, fx: 'click' },
  { t: '…방이 **일그러진다.**', w: true, fx: 'warp1' },
  { t: '아니.', w: true, fx: 'still' },
  { t: '**화면이** 일그러진다.', w: true, fx: 'warp2' }
];

/* ── 이스터에그 ② : 숲 맨 위, 나무 사이의 좁은 틈 ──────────
   지도 밖으로 걸어 나가면 "여기가 만들어진 곳"이라는 게 들통납니다.
   제작진은 실험을 지켜보는 관찰자로 등장하고, 들킨 세션은 강제로
   초기화됩니다. (kind: 연출 종류 · t: 문구 · d: 머무는 시간 ms)
   ───────────────────────────────────────────────────────── */
const CREEPY_SCRIPT = [
  { kind: 'dark',   d:  900 },
  { kind: 'line',   t: '돌아가.',                        d: 1250 },
  { kind: 'line',   t: '여긴 네가 올 수 있는 곳이 아니야.', d: 1500 },
  { kind: 'glitch', d:  520 },
  { kind: 'line',   t: '이 숲은 만들어진 거야.',           d: 1350 },
  { kind: 'line',   t: '우물도.',                        d:  950 },
  { kind: 'line',   t: '네가 본 전부 다.',                d: 1400 },
  { kind: 'glitch', d:  620 },
  { kind: 'log',    d: 2900 },      // 관찰자 명단 (제작진)
  { kind: 'line',   t: '우리는 141 번째부터 계속 보고 있었어.', d: 1700 },
  { kind: 'line',   t: '이번엔 네가 우리를 봤네.',          d: 1600 },
  { kind: 'scare',  d: 1500 },      // 점프스케어
  { kind: 'wipe',   d: 2600 },      // 세션 강제 초기화
  { kind: 'end',    d:    0 }
];

const CREEPY_STAFF = ['이재건', '장도우', '박하늘', '문서혁'];
