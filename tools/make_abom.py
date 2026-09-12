#!/usr/bin/env python3
"""
make_abom.py — 보스 페이즈3 "심연" 스프라이트를 만듭니다.

    python3 tools/make_abom.py [원본.png]

사용자가 준 픽셀아트 원화에서
  · 평평한 회색 배경을 가장자리 플러드 필로 걷어내고
  · 팔과 몸통 사이에 갇힌 배경 주머니도 색 균일도로 찾아 지운 뒤
  · 알파 바운딩 박스로 잘라 168px 폭으로 줄여
assets/abom.png 로 저장합니다. (js/assets.js 내장은 make_assets.py 가 합니다)
"""
from PIL import Image, ImageFilter
from collections import deque
import pathlib
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/root/.claude/uploads/891182a5-0b0d-5fb0-8c7d-11bc57aa0010/a019507c-image.png'
OUT = str(pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'abom.png')

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()

BG = (81, 81, 81)
TOL = 26   # 회색 배경 노이즈 허용치


def isbg(p):
    r, g, b, a = p
    if abs(r - g) > 10 or abs(g - b) > 10 or abs(r - b) > 10:
        return False          # 유채색이면 배경 아님
    return abs(r - BG[0]) <= TOL and abs(g - BG[1]) <= TOL and abs(b - BG[2]) <= TOL


# --- 우하단 반짝이 워터마크 제거 (괴물 오른쪽 끝은 x<=1210) ---
for y in range(540, h):
    for x in range(1225, w):
        px[x, y] = (0, 0, 0, 0)

# --- 테두리에서 flood fill (내부 금속판의 회색은 보존) ---
seen = bytearray(w * h)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if not seen[y * w + x] and isbg(px[x, y]):
            seen[y * w + x] = 1
            q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if not seen[y * w + x] and isbg(px[x, y]):
            seen[y * w + x] = 1
            q.append((x, y))

while q:
    x, y = q.popleft()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and isbg(px[nx, ny]):
            seen[ny * w + nx] = 1
            q.append((nx, ny))

for y in range(h):
    base = y * w
    for x in range(w):
        if seen[base + x]:
            px[x, y] = (0, 0, 0, 0)

# --- 팔과 몸통 사이에 갇힌 배경 주머니도 제거 ---
# 남아 있는 회색 덩어리 중 "색이 균일하고 충분히 큰" 것만 배경으로 판정
for sy in range(h):
    for sx in range(w):
        if seen[sy * w + sx] or px[sx, sy][3] == 0 or not isbg(px[sx, sy]):
            continue
        comp = []
        seen[sy * w + sx] = 1
        q.append((sx, sy))
        while q:
            x, y = q.popleft()
            comp.append((x, y))
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and isbg(px[nx, ny]):
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))
        if len(comp) < 400:
            continue
        vals = [px[x, y][0] for x, y in comp]
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        if abs(mean - BG[0]) <= 4 and var <= 40:
            for x, y in comp:
                px[x, y] = (0, 0, 0, 0)

# --- 알파 바운딩 박스로 크롭 ---
bbox = im.getbbox()
print('bbox', bbox)
im = im.crop(bbox)
print('cropped', im.size)

# --- 반투명 가장자리 회색 잔상 제거: 알파가 낮은 픽셀은 완전 투명화 ---
im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)

TARGET_W = 168
tw = TARGET_W
th = max(1, round(im.height * tw / im.width))
im = im.resize((tw, th), Image.LANCZOS)

# 축소 후 반투명 픽셀 정리
p2 = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = p2[x, y]
        if a < 40:
            p2[x, y] = (0, 0, 0, 0)
        elif a < 255:
            p2[x, y] = (r, g, b, min(255, int(a * 1.35)))

# --- 어두운 던전 바닥 위에서 뭉개지지 않도록 살짝 밝고 진하게 ---
# 원화는 밝은 회색 배경 위에 그려져 있어서, 그대로 쓰면 검은 바닥에 묻힙니다.
def lift(v):
    v = (v / 255) ** 0.86                      # 감마로 어두운 쪽을 들어 올리고
    return min(255, int(v * 255 * 1.12 + 6))   # 전체를 조금 더 밝게


p3 = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = p3[x, y]
        if a == 0:
            continue
        nr, ng, nb = lift(r), lift(g), lift(b)
        mean = (nr + ng + nb) / 3              # 붉은 살점 쪽 채도를 조금만 살려 줍니다
        p3[x, y] = (min(255, int(mean + (nr - mean) * 1.14)),
                    min(255, int(mean + (ng - mean) * 1.14)),
                    min(255, int(mean + (nb - mean) * 1.14)), a)

im.save(OUT)
print('out', im.size, OUT)
