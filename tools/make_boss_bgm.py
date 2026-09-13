#!/usr/bin/env python3
"""
make_boss_bgm.py — 보스전 브금 세 개를 원본 음원들에서 잘라 내장합니다.

    python3 tools/make_boss_bgm.py <관문용.mp3> <눈보스전용.mp3> <페이즈3용.mp3>

ffmpeg 이 없는 환경이라, MP3 프레임 경계에서 그대로 잘라 이어 붙입니다
(재인코딩 없음). 세 원본 모두 44100Hz · joint stereo VBR 이라 프레임 단위
연결이 그대로 성립합니다. 이어 붙인 자리에서 비트 리저버(bit reservoir)
때문에 한 프레임(약 26ms) 정도 지글거릴 수 있는데, 어차피 그 지점이
"도입부가 끝나고 본편이 들어오는" 전환점이라 들리지 않습니다.

만드는 것 — 보스방으로 갈수록 조여드는 3단 구성입니다.
  js/approach_bgm.js  보스방 직전(관문) — 관문용 원본의 잔잔한 앞부분만.
                      무음에서 차오르는 도입을 한 번 들려준 뒤, 그 안에서
                      음량이 고른 구간만 반복합니다.
  js/boss2_bgm.js     눈 보스전 — 눈보스전용 원본의 본편만 잘라 통째로
                      반복합니다. 싸움이 시작되는 순간부터 바로 격렬하게.
  js/boss3_bgm.js     심연(페이즈3) — 페이즈3용 원본을 통째로. 조용한 도입이
                      끝나고 터지는 지점을 "각성" 프레임에 맞추기 위해,
                      게임에서 BGM3_AT 프레임에 재생을 겁니다.

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
    calm_src, fight_src, p3_src = sys.argv[1], sys.argv[2], sys.argv[3]

    print('보스전 브금 생성')

    # ── 보스방 직전(관문) : 잔잔한 원본의 앞부분 0~14.0s ────────────────
    # 원본은 무음에서 시작해 14.0s 에서 본편이 들어옵니다 — 그 앞만 씁니다.
    # 그런데 0~3s 는 거의 무음이라, 거기까지 되돌리면 14초마다 소리가 끊긴
    # 것처럼 들립니다. 그래서 반복 구간은 3.0~12.9s 로 잡았습니다 — 후보를
    # 전부 훑어 양 끝의 0.4초 RMS 가 가장 잘 맞는 창을 고른 값입니다
    # (0.0934 / 0.0981, 4.9% 차이). 도입(무음에서 차오름)은 방에 들어설 때
    # 한 번만 들려주고, 그 뒤로는 이 구간만 돕니다.
    calm, c0, c1, fps, sr = slice_mp3(calm_src, 0.0, 14.0)
    print('  관문     %.3f~%.3fs  (반복 3.000~12.900)' % (c0, c1))
    emit('approach_bgm.js', 'APPROACH_BGM_B64', calm,
         "/* 이 파일은 tools/make_boss_bgm.py 가 생성합니다. 직접 고치지 마세요.\n"
         "   보스방 직전(관문)에 깔리는 잔잔한 브금 — 원본 %.3f~%.3fs 를 프레임\n"
         "   단위로 잘라냈습니다(재인코딩 없음). 무음에서 차오르는 도입은 방에\n"
         "   들어설 때 한 번만 들리고, 그 뒤로는 양 끝 음량이 가장 잘 맞는\n"
         "   3.0~12.9s 구간만 반복합니다. 샘플레이트 %dHz.\n"
         "   audio.js : loopStart 3.000 · loopEnd 12.900\n"
         "   오프라인 단일 파일로 돌아가야 해서 base64 로 내장합니다. */\n"
         % (c0, c1, sr))

    # ── 눈 보스전 : 본편 15.7~59.1s 만 잘라 통째로 반복 ────────────────
    # 이 원본도 앞 15초가 잔잔한 도입인데, 싸움은 시작부터 격렬해야 하므로
    # 도입은 버리고 본편만 씁니다. 양 끝을 15.7s / 59.1s 로 잡은 건 후보를
    # 전부 훑어 0.5초 RMS 가 가장 잘 맞는 짝을 고른 값입니다
    # (0.1822 / 0.1823 — 차이 0.0%). 그래서 이음새가 들리지 않습니다.
    body, b0, b1, _, sr2 = slice_mp3(fight_src, 15.7, 59.1)
    print('  눈 보스전 %.3f~%.3fs  (통째로 반복, %.1fs)' % (b0, b1, b1 - b0))
    emit('boss2_bgm.js', 'BOSS2_BGM_B64', body,
         "/* 이 파일은 tools/make_boss_bgm.py 가 생성합니다. 직접 고치지 마세요.\n"
         "   눈 보스전 브금 — 원본 %.3f~%.3fs(본편)를 프레임 단위로 잘라\n"
         "   통째로 반복합니다(재인코딩 없음). 싸움이 시작되는 순간부터 바로\n"
         "   이걸 틉니다 — 원본 앞 15초의 잔잔한 도입은 버렸고, 잔잔한 대목은\n"
         "   관문(보스방 직전)이 따로 맡습니다. 양 끝 RMS 가 0.0%% 차이라\n"
         "   이음새가 들리지 않습니다. 샘플레이트 %dHz.\n"
         "   오프라인 단일 파일로 돌아가야 해서 base64 로 내장합니다. */\n"
         % (b0, b1, sr2))

    # ── 페이즈3 : 터지는 11.4s 를 "각성" 순간에 맞춥니다 ───────────────
    # 이 곡은 앞 11초가 조용하다가 11.4s 에서 3.2배로 터집니다(0.066→0.201).
    # 그 지점을 각성 프레임에 맞추려고, 게임에서 컷신 시작이 아니라
    # BGM3_AT(= 각성 - 11.4초 × 60) 프레임에 재생을 겁니다.
    # 터진 뒤 반복할 창은 11.7~54.8s — 양 끝 0.5초 RMS 가 0.1917 / 0.1917 로
    # 완전히 같아서 이음새가 안 들립니다. 54.8s 뒤쪽은 페이드아웃이라 버립니다.
    DROP = 11.4
    a3, s0, s1, _, sr3 = slice_mp3(p3_src, 0.0, 57.0)
    print('  페이즈3  %.3f~%.3fs (터지는 지점 %.1fs — BGM3_AT 에 재생)'
          % (s0, s1, DROP))
    print('           loopStart 11.700  loopEnd 54.800')
    emit('boss3_bgm.js', 'BOSS3_BGM_B64', a3,
         "/* 이 파일은 tools/make_boss_bgm.py 가 생성합니다. 직접 고치지 마세요.\n"
         "   심연(페이즈3) 브금 — 원본 %.3f~%.3fs 를 프레임 단위로 잘라냈습니다\n"
         "   (재인코딩 없음). 앞 11초가 조용하다가 %.1fs 에서 3.2배로 터지는데,\n"
         "   게임에서는 컷신의 BGM3_AT(= 각성 - %.1f초) 에 재생을 걸어 그\n"
         "   터지는 지점이 각성과 맞아떨어지게 합니다. 그 뒤로는 양 끝 RMS 가\n"
         "   똑같은 11.7~54.8s 만 반복합니다. 샘플레이트 %dHz.\n"
         "   audio.js : loopStart 11.700 · loopEnd 54.800\n"
         "   오프라인 단일 파일로 돌아가야 해서 base64 로 내장합니다. */\n"
         % (s0, s1, DROP, DROP, sr3))


if __name__ == '__main__':
    main()
