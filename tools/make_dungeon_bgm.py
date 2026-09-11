#!/usr/bin/env python3
"""
make_dungeon_bgm.py — 던전 탐사 브금(우물 낙하 ~ 보스전 직전)을 원본 음원에서
잘라 js/dungeon_bgm.js 로 내장합니다.

    python3 tools/make_dungeon_bgm.py <원본.mp3> <시작초> <끝초>

ffmpeg 없이 MP3 프레임 경계에서 그대로 잘라내므로 재인코딩 손실이 없습니다.
프레임 헤더에서 실제 샘플레이트를 읽어오므로(고정값 아님) 44.1k/48k 모두
정확히 동작합니다. 프레임 경계로 반올림되므로, 실제로 잘린 시작 시각을
콘솔에 출력합니다 — 이 값을 기준으로 audio.js 의 loopStart/loopEnd 를
다시 계산해야 합니다.
"""
import base64, pathlib, sys

BR = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0]   # MPEG1 Layer3
SR = [44100,48000,32000,0]

def frames(d):
    off = 0
    if d[:3] == b'ID3':
        off = 10 + ((d[6]&0x7f)<<21 | (d[7]&0x7f)<<14 | (d[8]&0x7f)<<7 | (d[9]&0x7f))
    out, i = [], off
    while i < len(d) - 4:
        if d[i] == 0xFF and (d[i+1] & 0xE0) == 0xE0:
            ver, layer = (d[i+1]>>3)&3, (d[i+1]>>1)&3
            bri, sri, pad = (d[i+2]>>4)&0xF, (d[i+2]>>2)&3, (d[i+2]>>1)&1
            if ver == 3 and layer == 1 and bri not in (0,15) and sri != 3:
                flen = 144*BR[bri]*1000//SR[sri] + pad
                out.append((i, flen, SR[sri])); i += flen; continue
        i += 1
    return out

def main():
    src = pathlib.Path(sys.argv[1])
    start = float(sys.argv[2])
    end   = float(sys.argv[3])
    d = src.read_bytes()
    fr = frames(d)
    sr = fr[1][2] if len(fr) > 1 else fr[0][2]   # 첫 프레임은 Xing/헤더 프레임일 수 있어 둘째 걸 신뢰
    fps = sr / 1152

    a, b = int(start*fps), int(end*fps)
    a = max(0, min(a, len(fr)-1)); b = max(a+1, min(b, len(fr)))
    cut = b''.join(d[o:o+l] for o, l, _ in fr[a:b])

    actual_start = a / fps
    actual_end   = b / fps

    root = pathlib.Path(__file__).parent.parent
    (root/'assets'/'audio').mkdir(parents=True, exist_ok=True)
    (root/'assets'/'audio'/'dungeon.mp3').write_bytes(cut)

    b64 = base64.b64encode(cut).decode('ascii')
    (root/'js'/'dungeon_bgm.js').write_text(
        "/* 이 파일은 tools/make_dungeon_bgm.py 가 생성합니다. 직접 고치지 마세요.\n"
        "   던전 탐사 브금 — 원본에서 %.3fs ~ %.3fs 구간을 MP3 프레임 단위로\n"
        "   그대로 잘라냈습니다(재인코딩 없음). 샘플레이트 %dHz.\n"
        "   오프라인 단일 파일로 돌아가야 해서 base64 로 내장합니다. */\n"
        "const DUNGEON_BGM_B64 = '%s';\n" % (actual_start, actual_end, sr, b64),
        encoding='utf-8')
    print("✔  %.3fs ~ %.3fs (%.1fs, %.2fMB, %dHz) → js/dungeon_bgm.js" %
          (actual_start, actual_end, actual_end-actual_start, len(cut)/1048576, sr))
    print("   실제 잘린 시작 시각 = %.4fs  (원본 기준, loopStart/loopEnd 재계산에 사용)" % actual_start)

if __name__ == '__main__':
    main()
