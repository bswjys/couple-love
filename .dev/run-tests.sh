#!/usr/bin/env bash
# 로컬 정적 서버를 띄우고 하트노트 Playwright 검증을 돌린다.
set -e
cd "$(dirname "$0")/.."
python3 -m http.server 8770 --bind 127.0.0.1 >/tmp/couple_love_http.log 2>&1 &
H=$!
trap 'kill $H 2>/dev/null' EXIT
sleep 1.2
export LD_LIBRARY_PATH=/workspace/tmp/libroot/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH}
python3 .dev/test_app.py
