#!/usr/bin/env python3
"""
make_escape_bgm.py — 탈출(복도 추격) 브금을 원곡의 하이라이트만 골라 편집해 내장합니다.

    python3 tools/make_escape_bgm.py <The_Firebird.mp3>

원곡(SANABI OST — The Firebird)은 150 BPM, 한 마디 1.6초, 첫 강박 0.28초. 마디 경계에서만
잘라 40ms 겹쳐 잇기 때문에 박이 어긋나지 않습니다.

  ① 0:38.7 → 1:13.9   마디 24~46 — 2마디 빌드업 뒤 0:41.9 에서 밝은 본편이 터짐
                       경보가 울리는 순간 재생 — 뒤돌아보고 달리기 시작할 즈음 터집니다
  ② 1:50.7 → 2:29.1   마디 69~93 — 2마디 끌어올림 뒤 1:53.9 에서 곡의 절정
                       (총격전 · 백룸 즈음). 넘어져 늦어지면 절정(마디 71~93)만 반복
  합 약 73.6초 ≈ 비상구에서 바깥 문까지 달리는 시간.

ffmpeg 이 필요합니다. 결과는 js/escape_bgm.js (ESCAPE_BGM_B64) 이고, 반복 구간은
콘솔에 찍힌 값을 escape.js 의 ESC_BGM 에 넣습니다.
"""

import base64, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
BEAT0, BAR = 0.28, 4 * 60 / 150
XF = 0.04                                          # 이음매 겹침 (초)
LEAD = 0.03                                        # 첫 박 어택을 살리려 경계보다 살짝 앞에서 자름
SEGS = [(24, 46), (69, 93)]                        # 마디 번호 [시작, 끝)
LOOP_AT = (1, 71)                                  # 반복 시작 — (몇 번째 덩어리, 마디)


def at(bar):
    return BEAT0 + bar * BAR - LEAD


def main(src):
    parts, chains = [], []
    for i, (a, b) in enumerate(SEGS):
        chains.append(f'[0:a]atrim=start={at(a):.4f}:end={at(b):.4f},asetpts=PTS-STARTPTS[s{i}]')
    cur = 's0'
    for i in range(1, len(SEGS)):
        nxt = f'x{i}'
        chains.append(f'[{cur}][s{i}]acrossfade=d={XF}:c1=tri:c2=tri[{nxt}]')
        cur = nxt
    chains.append(f'[{cur}]afade=t=in:d=0.02[out]')
    with tempfile.TemporaryDirectory() as td:
        out = pathlib.Path(td) / 'esc.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-filter_complex', ';'.join(chains),
                        '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '128k', str(out)], check=True)
        data = out.read_bytes()
    lens = [(b - a) * BAR for a, b in SEGS]
    total = sum(lens) - XF * (len(SEGS) - 1)
    li, lb = LOOP_AT
    loop0 = sum(lens[:li]) - XF * li + (lb - SEGS[li][0]) * BAR
    b64 = base64.b64encode(data).decode()
    (ROOT / 'js' / 'escape_bgm.js').write_text(
        '/* 이 파일은 tools/make_escape_bgm.py 가 생성합니다. 직접 고치지 마세요.\n'
        '   탈출 복도 추격 브금 — The Firebird 의 하이라이트 두 덩어리를 마디 경계에서 이어 붙임\n'
        f'   (길이 {total:.3f}s · 반복 {loop0:.3f}~{total:.3f}s). */\n'
        f"const ESCAPE_BGM_B64 = '{b64}';\n", encoding='utf-8')
    print(f'js/escape_bgm.js  {len(data) // 1024} KB  길이 {total:.3f}s  loopStart {loop0:.3f}  loopEnd {total:.3f}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
