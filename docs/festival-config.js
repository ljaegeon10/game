/* 축제판 설정 — GitHub 웹에서 이 파일만 고치면 됩니다 (다시 빌드할 필요 없음) */
window.WB_FESTIVAL = true;
/* 구글 앱스 스크립트 웹 앱 주소 (https://script.google.com/macros/s/…/exec) — server/README.md 참고.
   비워 두면 기록 없이 게임만 됩니다 */
window.WB_SERVER = 'https://script.google.com/macros/s/AKfycbwQV5gWJWzZK0JzJo6af8_C6iBWySEYNwI78mIWIWDW3tHiF7ZBYDrKKrobyXT69c0/exec';
/* 순위판 설정을 고치는 구글 시트 탭 — 순위판 오른쪽 아래 ✏️ 수정 버튼이 여기로 (시트 주인만 열림) */
window.WB_SHEET = 'https://docs.google.com/spreadsheets/d/1R9yArYjZB_fnC0A_BJ6_JlggOn2QR1qAkD_f7lZ-zfE/edit#gid=518773294';
/* 개발자 최고 기록 — 순위에는 안 들어가고 순위판 위에 '깨 보세요' 로 따로 나옴. 지우면 안 보임
   (구글 시트 '순위판 설정' 탭의 '개발자 기록' 칸이 있으면 그게 먼저) */
/* 명예의 전당 — 순위와 따로, 순위판 개발자 기록 밑에 작게. [{ name, ms }] 를 더 넣으면 줄이 늘어남 (1:21.51 = 81510) */
window.WB_FAME = [{ name: '이시형', ms: 81510 }];
window.WB_DEV = { name: '이재건', ms: 85980 };   // 1:25.98 — 직접 정한 값 (봇 최고는 1:26.98). 이 이름(이재건)의 판은 전부 순위에서 빠지고, 더 빨리 깨면 그 기록이 자동으로 개발자 기록 (tail 은 안 씀)
