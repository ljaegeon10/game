#!/usr/bin/env python3
"""
build_artifact.py — Artifact(웹 게시)용 HTML 을 만듭니다.

    python3 build_artifact.py

dist/우물아래.html 과 내용은 같지만, Artifact 는 <head>/<body> 골격을
게시 시점에 직접 감싸므로 <!doctype>·<html>·<head>·<body> 태그를 빼고
<title> 과 <style> 을 파일 맨 위에 두는 형태로 내보냅니다.

결과: dist/우물아래_artifact.html
"""
import re, pathlib

ROOT = pathlib.Path(__file__).parent
SRC  = ROOT / "dist" / "우물아래.html"
OUT  = ROOT / "dist" / "우물아래_artifact.html"

if not SRC.exists():
    raise SystemExit("먼저 python3 build.py 를 실행하세요.")

html = SRC.read_text(encoding="utf-8")

# <head> 안에서 <title>/<style> 만 챙깁니다 (meta·link 는 게시 시 골격이 담당)
head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)

styles = re.findall(r"<style>.*?</style>", head, re.S)

parts = ["<title>우물 아래</title>"] + styles + [body.strip()]
OUT.write_text("\n".join(parts) + "\n", encoding="utf-8")
print(f"✔  {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")
