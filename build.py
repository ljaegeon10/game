#!/usr/bin/env python3
"""
build.py — 단일 HTML 파일로 묶습니다.

    python3 build.py

결과: dist/우물아래.html  (더블클릭하면 바로 실행)
CSS·JS·이미지가 전부 한 파일에 들어가므로 인터넷/서버 없이 동작합니다.
"""
import os, re, pathlib

ROOT = pathlib.Path(__file__).parent
OUT_DIR = ROOT / "dist"
OUT = OUT_DIR / "우물아래.html"

html = (ROOT / "index.html").read_text(encoding="utf-8")

# <link rel=stylesheet> → <style>
def inline_css(m):
    css = (ROOT / m.group(1)).read_text(encoding="utf-8")
    return "<style>\n" + css + "\n</style>"

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)

# <script src> → <script>
def inline_js(m):
    js = (ROOT / m.group(1)).read_text(encoding="utf-8")
    # </script> 문자열이 JS 안에 있으면 깨지므로 방어
    js = js.replace("</script>", "<\\/script>")
    return "<script>\n" + js + "\n</script>"

html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

OUT_DIR.mkdir(exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"✔  {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")
