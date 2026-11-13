#!/usr/bin/env python3
"""
build.py — 단일 HTML 파일로 묶습니다.

    python3 build.py

결과: dist/우물아래.html       (더블클릭하면 바로 실행)
      dist/우물아래_엔딩.html  (엔딩만 따로 보는 시연 페이지)
      dist/우물아래_피스톨.html (1인칭 피스톨 · 장전 모션 시트 시연)
      dist/우물아래_주인공시안.html (주인공 생김새 시안 비교)
CSS·JS·이미지가 전부 한 파일에 들어가므로 인터넷/서버 없이 동작합니다.

      docs/index.html          GitHub Pages 축제판 — 본편에 docs/festival-config.js 를 붙인 것.
                               기록은 config 의 WB_SERVER(구글 앱스 스크립트, server/) 로 보냅니다.
                               config 는 처음 한 번만 만들고 덮어쓰지 않습니다 (GitHub 웹에서 주소만 고치면 됨).
      docs/board.html          실시간 순위판 (web/board.html 그대로 + 글꼴) — 부스 옆 모니터 · TV 용
"""
import re, pathlib

ROOT = pathlib.Path(__file__).parent
OUT_DIR = ROOT / "dist"

# (원본, 결과) — 게임 본편과, 게임 없이 엔딩만 돌려 보는 시연 페이지
PAGES = [
    (ROOT / "index.html",               OUT_DIR / "우물아래.html"),
    (ROOT / "prototypes" / "ending.html", OUT_DIR / "우물아래_엔딩.html"),
    (ROOT / "prototypes" / "pistol.html", OUT_DIR / "우물아래_피스톨.html"),
    (ROOT / "prototypes" / "hero.html",   OUT_DIR / "우물아래_주인공시안.html"),
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

# ── GitHub Pages 축제판 (docs/) ──
DOCS = ROOT / "docs"
DOCS.mkdir(exist_ok=True)
game = (OUT_DIR / "우물아래.html").read_text(encoding="utf-8")
web = game.replace("<body>", '<body>\n<script src="festival-config.js"></script>', 1)
(DOCS / "index.html").write_text(web, encoding="utf-8")
(DOCS / ".nojekyll").write_text("", encoding="utf-8")          # 밑줄로 시작하는 파일도 그대로 내보내게
cfg = DOCS / "festival-config.js"
if not cfg.exists():
    cfg.write_text(
        "/* 축제판 설정 — GitHub 웹에서 이 파일만 고치면 됩니다 (다시 빌드할 필요 없음) */\n"
        "window.WB_FESTIVAL = true;\n"
        "/* 구글 앱스 스크립트 웹 앱 주소 (https://script.google.com/macros/s/…/exec) — server/README.md 참고.\n"
        "   비워 두면 기록 없이 게임만 됩니다 */\n"
        "window.WB_SERVER = '';\n"
        "/* 순위판 설정을 고치는 구글 시트 탭 주소 — 순위판의 ✏️ 수정 버튼 */\n"
        "window.WB_SHEET = '';\n"
        "/* 개발자 최고 기록 — 순위와 따로 순위판 위에 (예: { name: '장도우', ms: 103757 }) */\n"
        "window.WB_DEV = null;\n", encoding="utf-8")
print(f"✔  {DOCS / 'index.html'}  ({(DOCS / 'index.html').stat().st_size/1024:.0f} KB)  — GitHub Pages")
# 실시간 순위판 (따로 띄우는 화면) — 같은 festival-config.js 의 서버에서 순위를 받아 옴
import shutil
shutil.copyfile(ROOT / "web" / "board.html", DOCS / "board.html")
shutil.copyfile(ROOT / "web" / "qrcode.js", DOCS / "qrcode.js")              # QR 생성 (MIT) — CDN 없이
(DOCS / "fonts").mkdir(exist_ok=True)
shutil.copyfile(ROOT / "assets" / "fonts" / "DungGeunMo.woff2", DOCS / "fonts" / "DungGeunMo.woff2")
print(f"✔  {DOCS / 'board.html'}  — 실시간 순위판")
