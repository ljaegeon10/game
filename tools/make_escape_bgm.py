#!/usr/bin/env python3
"""
make_escape_bgm.py — 탈출(복도 추격) 브금을 원곡의 하이라이트만 골라 편집해 내장합니다.

    python3 tools/make_escape_bgm.py <locked_behind_steel.mp3>

원곡은 140 BPM, 8마디(13.71초)가 한 덩어리입니다 (첫 박 0.10초). 마디 경계에서만
잘라 40ms 겹쳐 잇기 때문에 박이 어긋나지 않습니다. 각 경계 직전엔 원곡 자체에
짧은 숨 고르기가 있어 이음매가 들리지 않습니다.

  ① 0:10.4 → 0:41.2   드롭 앞 2마디 빌드업 + 첫 드롭 16마디
                       경보가 울리는 순간 재생 — 뒤돌아보고 달리기 시작할 즈음 터집니다
  ② 1:46.4 → 2:12.1   곡에서 가장 센 15마디 (총격전 즈음 들어옴)
  ③ 2:27.5 → 2:37.8   마지막 고조 6마디
  합 약 66.8초 ≈ 비상구에서 바깥 문까지 달리는 시간. 넘어져 늦어지면 ②~③ 을 반복합니다.

ffmpeg 이 필요합니다. 결과는 js/escape_bgm.js (ESCAPE_BGM_B64) 이고, 반복 구간은
콘솔에 찍힌 값을 escape.js 의 ESC_BGM 에 넣습니다.
"""
import base64, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
BEAT0, BAR = 0.10, 4 * 60 / 140
XF = 0.04                                          # 이음매 겹침 (초)
LEAD = 0.03                                        # 첫 박 어택을 살리려 경계보다 살짝 앞에서 자름
SEGS = [(6, 24), (62, 77), (86, 92)]               # 마디 번호 [시작, 끝)


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
    loop0 = lens[0] - XF
    b64 = base64.b64encode(data).decode()
    (ROOT / 'js' / 'escape_bgm.js').write_text(
        '/* 이 파일은 tools/make_escape_bgm.py 가 생성합니다. 직접 고치지 마세요.\n'
        '   탈출 복도 추격 브금 — 원곡의 하이라이트 세 덩어리를 마디 경계에서 이어 붙임\n'
        f'   (길이 {total:.3f}s · 반복 {loop0:.3f}~{total:.3f}s). */\n'
        f"const ESCAPE_BGM_B64 = '{b64}';\n", encoding='utf-8')
    print(f'js/escape_bgm.js  {len(data) // 1024} KB  길이 {total:.3f}s  loopStart {loop0:.3f}  loopEnd {total:.3f}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
