#!/bin/sh
# 순위판(web/board.html) 순위 목록 뒤에 깔리는 플레이 영상을 다시 만듦 — 타임어택 봇이 한 판을 깨는 화면을 1/30초마다 찍어 mp4 로.
#   쓰는 법 : python3 build.py && sh tools/make_play_video.sh        (결과는 docs/play.mp4 · docs/play.jpg — 깃허브 페이지가 그대로 내보냄)
#   필요 : node + playwright(chromium) · ffmpeg
set -e
cd "$(dirname "$0")/.."
TMP="${TMPDIR:-/tmp}/wb-play-frames"; rm -rf "$TMP"; mkdir -p "$TMP"
REC="$TMP" RW=768 node tools/ta_bot.js immortal 45 1 no door 80 1
# 숲에서 시작해 탈출구까지 — 소리 없음 · 어디서나 틀리는 H.264 · 바로 재생(faststart)
ffmpeg -y -loglevel error -framerate 30 -i "$TMP/f%05d.jpg" -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart -an docs/play.mp4
ffmpeg -y -loglevel error -i "$TMP/f00900.jpg" -q:v 4 docs/play.jpg
ls -la docs/play.mp4 docs/play.jpg
