#!/usr/bin/env python3
"""
build_artifact.py — Artifact(웹 게시)용 HTML 을 만듭니다.

    python3 build_artifact.py

dist/우물아래.html 과 내용은 같지만, Artifact 는 <head>/<body> 골격을
게시 시점에 직접 감싸므로 <!doctype>·<html>·<head>·<body> 태그를 빼고
<title> 과 <style> 을 파일 맨 위에 두는 형태로 내보냅니다.

결과: dist/우물아래_artifact.html, dist/우물아래_엔딩_artifact.html,
      dist/우물아래_주인공시안_artifact.html
"""
import re, pathlib

ROOT = pathlib.Path(__file__).parent
DIST = ROOT / "dist"

# (build.py 결과, 게시용 결과, 갤러리에 보일 이름)
PAGES = [
    ("우물아래.html",      "우물아래_artifact.html",      "우물 아래"),
    ("우물아래_엔딩.html", "우물아래_엔딩_artifact.html", "우물 아래 깨어남"),
    ("우물아래_주인공시안.html", "우물아래_주인공시안_artifact.html", "주인공 시안"),
]

for src_name, out_name, title in PAGES:
    src, out = DIST / src_name, DIST / out_name
    if not src.exists():
        raise SystemExit("먼저 python3 build.py 를 실행하세요.")
    html = src.read_text(encoding="utf-8")

    # <head> 안에서 <style> 만 챙깁니다 (meta·link 는 게시 시 골격이 담당)
    head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
    styles = re.findall(r"<style>.*?</style>", head, re.S)

    parts = [f"<title>{title}</title>"] + styles + [body.strip()]
    out.write_text("\n".join(parts) + "\n", encoding="utf-8")
    print(f"✔  {out}  ({out.stat().st_size/1024:.0f} KB)")
