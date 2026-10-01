#!/usr/bin/env python3
"""
build.py — 단일 HTML 파일로 묶습니다.

    python3 build.py

결과: dist/우물아래.html       (더블클릭하면 바로 실행)
      dist/우물아래_엔딩.html  (엔딩만 따로 보는 시연 페이지)
CSS·JS·이미지가 전부 한 파일에 들어가므로 인터넷/서버 없이 동작합니다.
"""
import re, pathlib

ROOT = pathlib.Path(__file__).parent
OUT_DIR = ROOT / "dist"

# (원본, 결과) — 게임 본편과, 게임 없이 엔딩만 돌려 보는 시연 페이지
PAGES = [
    (ROOT / "index.html",               OUT_DIR / "우물아래.html"),
    (ROOT / "prototypes" / "ending.html", OUT_DIR / "우물아래_엔딩.html"),
]


def build(src, out):
    base = src.parent                      # 경로는 원본 파일 기준으로 풉니다
    html = src.read_text(encoding="utf-8")

    # <link rel=stylesheet> → <style>
    def inline_css(m):
        css = (base / m.group(1)).read_text(encoding="utf-8")
        return "<style>\n" + css + "\n</style>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)

    # <script src> → <script>
    def inline_js(m):
        js = (base / m.group(1)).read_text(encoding="utf-8")
        # </script> 문자열이 JS 안에 있으면 깨지므로 방어
        js = js.replace("</script>", "<\\/script>")
        return "<script>\n" + js + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

    OUT_DIR.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"✔  {out}  ({out.stat().st_size/1024:.0f} KB)")


for src, out in PAGES:
    build(src, out)
