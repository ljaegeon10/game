#!/usr/bin/env python3
"""
make_assets.py — 업로드된 Piskel 원본에서 게임용 PNG 를 만듭니다.

    python3 tools/make_assets.py <업로드폴더>

만드는 것
  assets/hero.png    주인공 스프라이트 시트 (8프레임 × 56×66)
                     0~2 정면 걷기 · 3~5 뒷모습 걷기 · 6 좌 · 7 우
  assets/mushroom.png  원본 버섯 (참고용 보관)
  assets/mob.png     버섯을 어둡게 물들인 '잡몹' 버전
  assets/eye.png     보스
  assets/brick.png   벽 텍스처

Piskel 파일에는 투명 대신 체크무늬가 픽셀로 구워져 있는 경우가 있어,
가장자리에서 플러드 필로 배경을 걷어냅니다.
"""
import base64, io, json, sys, pathlib
from collections import deque
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)


def layers(path):
    """piskel 파일의 레이어들을 PIL 이미지 리스트로."""
    d = json.loads(pathlib.Path(path).read_text())["piskel"]
    res = []
    for lay in d["layers"]:
        L = json.loads(lay)
        for c in L["chunks"]:
            raw = base64.b64decode(c["base64PNG"].split(",", 1)[1])
            res.append((Image.open(io.BytesIO(raw)).convert("RGBA"), L["frameCount"]))
    return d["width"], d["height"], res


def strip_checker(im):
    """가장자리에서 시작해 밝은 회색 체크무늬 배경을 투명하게."""
    im = im.copy()
    w, h = im.size
    px = im.load()

    def is_bg(p):
        r, g, b, a = p
        return a > 0 and min(r, g, b) >= 238 and max(r, g, b) - min(r, g, b) <= 6

    seen = [[False] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]):
                seen[x][y] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]) and not seen[x][y]:
                seen[x][y] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and is_bg(px[nx, ny]):
                seen[nx][ny] = True
                q.append((nx, ny))
    return im


def build_hero(src):
    """주인공: 8프레임 가로 스트립을 공통 bbox 로 잘라 다시 묶습니다."""
    w, h, ls = layers(src)
    sheet, frames = max(ls, key=lambda t: t[0].getbbox() is not None and
                        (t[0].getbbox()[2] - t[0].getbbox()[0]) or 0)
    fw = sheet.width // frames
    # 프레임별 bbox 의 합집합 → 모든 프레임을 같은 기준으로 정렬
    boxes = [sheet.crop((i * fw, 0, (i + 1) * fw, sheet.height)).getbbox()
             for i in range(frames)]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    cw, ch = x1 - x0, y1 - y0
    out = Image.new("RGBA", (cw * frames, ch), (0, 0, 0, 0))
    for i in range(frames):
        out.paste(sheet.crop((i * fw + x0, y0, i * fw + x1, y1)), (i * cw, 0))
    out.save(OUT / "hero.png")
    print(f"  hero.png      {out.size}  ({frames}프레임 × {cw}×{ch})")
    return cw, ch, frames


def lum(r, g, b):
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255.0


def face_area(im):
    """버섯 아래쪽의 밝은 '대(얼굴)' 영역을 연결 요소로 찾습니다.
    갓의 밝은 반점이 섞이지 않도록 가장 큰 덩어리만 취합니다."""
    px = im.load()
    W, H = im.size
    light = [[px[x, y][3] > 200 and lum(*px[x, y][:3]) > .52
              for y in range(H)] for x in range(W)]
    seen = [[False] * H for _ in range(W)]
    best = []
    for sx in range(W):
        for sy in range(int(H * .40), H):
            if not light[sx][sy] or seen[sx][sy]:
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sx][sy] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and light[nx][ny] and not seen[nx][ny]:
                        seen[nx][ny] = True
                        q.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    if not best:
        return None, None
    xs = [p[0] for p in best]; ys = [p[1] for p in best]
    return set(best), (min(xs), min(ys), max(xs), max(ys))


def wipe_cute_face(im, mask, box):
    """얼굴 영역 '안쪽에 갇힌' 구멍(눈·미소·볼터치)만 살색으로 메웁니다.
    바깥(갓 밑면)과 이어진 어두운 부분은 건드리지 않습니다."""
    from collections import Counter
    px = im.load()
    x0, y0, x1, y1 = box
    base = Counter(px[x, y][:3] for (x, y) in mask).most_common(1)[0][0]

    # bbox 안에서 얼굴이 아닌 칸들 중, 테두리와 이어지지 않는 것 = 구멍
    outside = set()
    q = deque()
    for x in range(x0, x1 + 1):
        for y in (y0, y1):
            if (x, y) not in mask:
                outside.add((x, y)); q.append((x, y))
    for y in range(y0, y1 + 1):
        for x in (x0, x1):
            if (x, y) not in mask:
                outside.add((x, y)); q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if x0 <= n[0] <= x1 and y0 <= n[1] <= y1 and n not in mask and n not in outside:
                outside.add(n); q.append(n)

    holes = 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if (x, y) in mask or (x, y) in outside:
                continue
            if px[x, y][3] > 0:
                px[x, y] = (*base, 255)
                holes += 1
    return base, holes


def tint_dark(im):
    """어둡게 + 보랏빛 슬레이트로 물들이기."""
    px = im.load()
    TINT = (84, 68, 102)
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            k = (lum(r, g, b) ** 1.5) * 0.66
            px[x, y] = (min(int(TINT[0] * k + r * .32 * k), 255),
                        min(int(TINT[1] * k + g * .32 * k), 255),
                        min(int(TINT[2] * k + b * .40 * k), 255), a)


def draw_monster_face(im, box):
    """사나운 눈매와 톱니 입을 픽셀로 새로 그립니다."""
    px = im.load()
    x0, y0, x1, y1 = box
    fw, fh = x1 - x0, y1 - y0
    cx = (x0 + x1) // 2
    ey  = y0 + int(fh * .24)                # 눈높이
    ew  = max(5, int(fw * .20))             # 눈 너비
    eh  = max(3, int(fw * .11))             # 눈 높이
    gap = max(3, int(fw * .16))             # 눈 사이

    SOCKET = (10, 7, 13)
    IRIS   = (228, 58, 40)
    CORE   = (255, 198, 132)
    TOOTH  = (226, 219, 205)

    def put(x, y, c):
        if 0 <= x < im.width and 0 <= y < im.height and px[x, y][3] > 120:
            px[x, y] = (*c, 255)

    # 안쪽이 아래로 처진 사나운 눈매 (∖ ∕ 모양)
    for side in (-1, 1):
        ox = cx + side * (gap + ew // 2)
        for i in range(ew):
            t = i / (ew - 1)
            # 바깥쪽이 위, 안쪽(가운데)이 아래로 처진다 →  ＼  ／
            drop = int(round((t if side < 0 else 1 - t) * eh * 1.1))
            for j in range(eh):
                put(ox - ew // 2 + i, ey + drop + j, SOCKET)
            # 홍채는 눈매 아래쪽 절반에
            if 1 <= i <= ew - 2:
                for j in range(eh - 2, eh):
                    put(ox - ew // 2 + i, ey + drop + j, IRIS)
        put(ox + side * (ew // 4), ey + eh, CORE)

    # 톱니 입 : 아래로 뾰족한 이빨
    my = y0 + int(fh * .66)
    mw = max(8, int(fw * .48))
    step = max(2, mw // 7)
    for i in range(mw):
        depth = 3 + (2 if (i // step) % 2 == 0 else 0)
        for j in range(depth):
            put(cx - mw // 2 + i, my + j, SOCKET)
    for i in range(step // 2, mw, step * 2):
        put(cx - mw // 2 + i, my + 1, TOOTH)
        put(cx - mw // 2 + i, my + 2, TOOTH)


def to_mob(src):
    """귀여운 버섯 → 잡몹."""
    im = src.convert("RGBA").copy()
    mask, box = face_area(im)
    holes = 0
    if box:
        _, holes = wipe_cute_face(im, mask, box)
    tint_dark(im)
    if box:
        draw_monster_face(im, box)
    return im, box, holes


def embed(names, hero_meta):
    """게임이 file:// 로도 돌아가도록 PNG 를 base64 로 js/assets.js 에 넣습니다."""
    out = [
        "// 이 파일은 tools/make_assets.py 가 생성합니다. 직접 고치지 마세요.",
        "// 스프라이트 원본: 사용자가 제공한 Piskel 픽셀아트.",
        "// file:// 로 바로 열어도 동작하도록 base64 data URI 로 내장했습니다.",
        "// (같은 PNG 가 /assets 폴더에도 들어 있습니다.)",
        "",
        "// 주인공 스프라이트 시트 정보",
        f"const HERO = {{ fw: {hero_meta[0]}, fh: {hero_meta[1]}, frames: {hero_meta[2]},",
        "  // 방향별 프레임 순서 (원본 8프레임 구성 그대로)",
        "  down: [0, 1, 2], up: [3, 4, 5], left: [6], right: [7] };",
        "",
        "const ASSET_SRC = {",
    ]
    for n in names:
        b = base64.b64encode((OUT / f"{n}.png").read_bytes()).decode()
        out.append(f"  {n}: 'data:image/png;base64,{b}',")
    out += ["};", """
const IMG = {};
function loadAssets() {
  const keys = Object.keys(ASSET_SRC);
  return Promise.all(keys.map(k => new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[k] = im; res(); };
    im.onerror = () => { IMG[k] = null; res(); };
    im.src = ASSET_SRC[k];
  })));
}
"""]
    p = ROOT / "js" / "assets.js"
    p.write_text("\n".join(out))
    print(f"  js/assets.js  {p.stat().st_size / 1024:.0f} KB  ({', '.join(names)})")


def main():
    up = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    print("에셋 생성")

    # 주인공
    hero_src = next(up.glob("*New_Piskel*.piskel"))
    hero_meta = build_hero(hero_src)

    # 버섯 / 보스 / 벽
    for pat, name, crop in (("*11_51_17*115156*", "mushroom", True),
                            ("*11_28_05*",        "eye",      True),
                            ("*11_00_46*",        "brick",    False)):
        f = next(up.glob(pat + ".piskel"), None) or next(up.glob(pat))
        _, _, ls = layers(f)
        im = strip_checker(ls[0][0])
        if crop:
            im = im.crop(im.getbbox())
        im.save(OUT / f"{name}.png")
        print(f"  {name}.png{' ' * (13 - len(name))}{im.size}")

    # 잡몹 = 어둡게 물들이고 얼굴을 다시 그린 버섯
    src = Image.open(OUT / "mushroom.png")
    mob, box, holes = to_mob(src)
    mob.save(OUT / "mob.png")
    print(f"  mob.png       {mob.size}   얼굴영역 {box} · 지운 구멍 {holes}px")

    # abom.png 는 tools/make_abom.py 가 따로 만들어 둡니다 (Piskel 원본이 아님)
    embed(["hero", "mob", "eye", "brick", "abom"], hero_meta)


if __name__ == "__main__":
    main()
