#!/usr/bin/env python3
"""
make_bgm.py — 보스전 BGM 을 원본 음원에서 잘라 js/bgm.js 로 내장합니다.

    python3 tools/make_bgm.py <원본.mp3> [시작초] [길이초]

ffmpeg 없이 MP3 프레임 경계에서 그대로 잘라내므로 재인코딩 손실이 없습니다.
(VBR 헤더는 잘린 파일과 맞지 않아 자동으로 빠집니다.)
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
                out.append((i, flen)); i += flen; continue
        i += 1
    return out

def main():
    src = pathlib.Path(sys.argv[1])
    start = float(sys.argv[2]) if len(sys.argv) > 2 else 33.0
    dur   = float(sys.argv[3]) if len(sys.argv) > 3 else 72.0
    d = src.read_bytes()
    fr = frames(d)
    fps = 44100 / 1152
    a, b = int(start*fps), int((start+dur)*fps)
    cut = b''.join(d[o:o+l] for o, l in fr[a:b])

    root = pathlib.Path(__file__).parent.parent
    (root/'assets'/'audio').mkdir(parents=True, exist_ok=True)
    (root/'assets'/'audio'/'boss.mp3').write_bytes(cut)

    b64 = base64.b64encode(cut).decode('ascii')
    (root/'js'/'bgm.js').write_text(
        "/* 이 파일은 tools/make_bgm.py 가 생성합니다. 직접 고치지 마세요.\n"
        "   보스전 BGM — 원본에서 가장 밀도 높은 구간을 MP3 프레임 단위로\n"
        "   그대로 잘라냈습니다(재인코딩 없음).\n"
        "   오프라인 단일 파일로 돌아가야 해서 base64 로 내장합니다. */\n"
        "const BGM_BOSS_B64 = '" + b64 + "';\n", encoding='utf-8')
    print("✔  %.1f초 · %.2f MB → js/bgm.js" % ((b-a)*1152/44100, len(cut)/1048576))

if __name__ == '__main__':
    main()
