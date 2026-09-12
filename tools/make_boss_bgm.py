#!/usr/bin/env python3
"""
make_boss_bgm.py — 보스전 브금 두 개를 원본 음원들에서 잘라 내장합니다.

    python3 tools/make_boss_bgm.py <페이즈2원본.mp3> <track06.mp3> <페이즈3원본.mp3>

ffmpeg 이 없는 환경이라, MP3 프레임 경계에서 그대로 잘라 이어 붙입니다
(재인코딩 없음). 세 원본 모두 44100Hz · joint stereo VBR 이라 프레임 단위
연결이 그대로 성립합니다. 이어 붙인 자리에서 비트 리저버(bit reservoir)
때문에 한 프레임(약 26ms) 정도 지글거릴 수 있는데, 어차피 그 지점이
"도입부가 끝나고 본편이 들어오는" 전환점이라 들리지 않습니다.

만드는 것
  js/boss2_bgm.js   눈 보스전(페이즈2) — [페이즈2원본의 잔잔한 도입부]
                    뒤에 [track06] 을 이어 붙였습니다. loopStart 를 도입부
                    끝으로 잡아서, 도입부는 한 번만 흐르고 그 뒤로는
                    track06 만 반복됩니다.
  js/boss3_bgm.js   심연(페이즈3) — 페이즈3원본에서 잔잔한 앞부분의 뒤쪽
                    일부와 본편 전체를 잘라냈습니다. 변신 컷신이 시작될 때
                    재생을 걸면, 본편이 터지는 순간이 "각성" 프레임과
                    맞아떨어집니다.

프레임 경계로 반올림되므로 실제 잘린 시각을 콘솔에 출력합니다 —
이 값을 audio.js 의 loopStart / loopEnd 에 그대로 넣어야 합니다.
"""
import base64, pathlib, sys

BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]   # MPEG1 Layer3
SR = [44100, 48000, 32000, 0]

ROOT = pathlib.Path(__file__).resolve().parent.parent


def frames(d):
    """MP3 프레임 목록 [(오프셋, 길이, 샘플레이트)] — ID3 태그는 건너뜁니다."""
    off = 0
    if d[:3] == b'ID3':
        off = 10 + ((d[6] & 0x7f) << 21 | (d[7] & 0x7f) << 14 |
                    (d[8] & 0x7f) << 7 | (d[9] & 0x7f))
    out, i = [], off
    while i < len(d) - 4:
        if d[i] == 0xFF and (d[i + 1] & 0xE0) == 0xE0:
            ver, layer = (d[i + 1] >> 3) & 3, (d[i + 1] >> 1) & 3
            bri, sri, pad = (d[i + 2] >> 4) & 0xF, (d[i + 2] >> 2) & 3, (d[i + 2] >> 1) & 1
            if ver == 3 and layer == 1 and bri not in (0, 15) and sri != 3:
                flen = 144 * BR[bri] * 1000 // SR[sri] + pad
                out.append((i, flen, SR[sri]))
                i += flen
                continue
        i += 1
    return out


def slice_mp3(path, start, end):
    """[start, end) 초 구간을 프레임 경계에서 잘라 (바이트, 실제시작, 실제끝, fps)."""
    d = pathlib.Path(path).read_bytes()
    fr = frames(d)
    # 첫 프레임은 Xing/LAME 헤더 프레임일 수 있어 둘째 걸 신뢰합니다
    sr = fr[1][2] if len(fr) > 1 else fr[0][2]
    fps = sr / 1152
    a = max(0, min(int(round(start * fps)), len(fr) - 1))
    b = max(a + 1, min(int(round(end * fps)), len(fr)))
    cut = b''.join(d[o:o + l] for o, l, _ in fr[a:b])
    return cut, a / fps, b / fps, fps, sr


def emit(js_name, const_name, blob, header):
    (ROOT / 'assets' / 'audio').mkdir(parents=True, exist_ok=True)
    (ROOT / 'assets' / 'audio' / (js_name.replace('_bgm.js', '.mp3'))).write_bytes(blob)
    b64 = base64.b64encode(blob).decode('ascii')
    p = ROOT / 'js' / js_name
    p.write_text(header + "const %s = '%s';\n" % (const_name, b64))
    print('  js/%-16s %5.0f KB' % (js_name, p.stat().st_size / 1024))


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    p2_src, t6_src, p3_src = sys.argv[1], sys.argv[2], sys.argv[3]

    print('보스전 브금 생성')

    # ── 페이즈2 : [도입부 0~14.0s] + [track06 0~57.0s] ─────────────────
    # 도입부는 무음에서 시작해 14.0s 에서 본편이 들어옵니다 — 그 앞만 씁니다.
    # track06 은 57.8s 부터 페이드아웃이라 57.0s 에서 끊었습니다. 이 지점의
    # 1초 RMS(0.0752)가 곡 도입 1초(0.0727)와 거의 같아서, 반복 이음새가
    # 거의 들리지 않습니다.
    intro, i0, i1, fps, sr = slice_mp3(p2_src, 0.0, 14.0)
    body,  b0, b1, _,   _  = slice_mp3(t6_src, 0.0, 57.0)
    loop_start = i1 - i0                     # 이어 붙인 파일 안에서의 도입부 끝
    loop_end = loop_start + (b1 - b0)
    print('  페이즈2  도입부 %.3f~%.3fs + track06 %.3f~%.3fs' % (i0, i1, b0, b1))
    print('           loopStart %.3f  loopEnd %.3f  (총 %.3fs)' % (loop_start, loop_end, loop_end))
    emit('boss2_bgm.js', 'BOSS2_BGM_B64', intro + body,
         "/* 이 파일은 tools/make_boss_bgm.py 가 생성합니다. 직접 고치지 마세요.\n"
         "   눈 보스전(페이즈2) 브금 — 잔잔한 도입부(%.3f~%.3fs)를 한 번 흘린 뒤\n"
         "   track06(%.3f~%.3fs)을 반복합니다. MP3 프레임 단위로 이어 붙였고\n"
         "   재인코딩은 없습니다. 샘플레이트 %dHz.\n"
         "   audio.js : loopStart %.3f · loopEnd %.3f\n"
         "   오프라인 단일 파일로 돌아가야 해서 base64 로 내장합니다. */\n"
         % (i0, i1, b0, b1, sr, loop_start, loop_end))

    # ── 페이즈3 : 본편이 터지는 15.0s 를 "각성" 순간에 맞춥니다 ─────────
    # 변신 컷신은 620프레임(60Hz)이고 각성은 520프레임 = 8.667s 지점입니다.
    # 그래서 원본 15.0 - 8.667 = 6.333s 부터 잘라 두면, 컷신이 시작될 때
    # 재생을 걸어도 본편이 정확히 각성과 함께 터집니다. 끝은 페이드아웃이
    # 없어서 원본 끝까지 그대로 씁니다.
    WAKE_SEC = 520 / 60.0
    DROP = 15.0
    a3, s0, s1, _, sr3 = slice_mp3(p3_src, DROP - WAKE_SEC, 60.0)
    drop_in_clip = DROP - s0
    print('  페이즈3  %.3f~%.3fs (본편 진입 = 클립 %.3fs, 각성 %.3fs)'
          % (s0, s1, drop_in_clip, WAKE_SEC))
    print('           loopStart %.3f  loopEnd %.3f' % (drop_in_clip, s1 - s0))
    emit('boss3_bgm.js', 'BOSS3_BGM_B64', a3,
         "/* 이 파일은 tools/make_boss_bgm.py 가 생성합니다. 직접 고치지 마세요.\n"
         "   심연(페이즈3) 브금 — 원본 %.3f~%.3fs 를 프레임 단위로 잘라냈습니다\n"
         "   (재인코딩 없음). 변신 컷신이 시작될 때 재생을 걸면 클립 %.3fs 의\n"
         "   본편 진입이 각성 프레임(%.3fs)과 맞아떨어집니다. 그 뒤로는 본편만\n"
         "   반복합니다. 샘플레이트 %dHz.\n"
         "   audio.js : loopStart %.3f · loopEnd %.3f\n"
         "   오프라인 단일 파일로 돌아가야 해서 base64 로 내장합니다. */\n"
         % (s0, s1, drop_in_clip, WAKE_SEC, sr3, drop_in_clip, s1 - s0))


if __name__ == '__main__':
    main()
