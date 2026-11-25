#!/usr/bin/env bash
# 로컬 정적 서버 + 가짜 Firebase 를 띄우고 하트노트 부부 공유 검증만 돌린다.
set -e
cd "$(dirname "$0")/.."
python3 -m http.server 8770 --bind 127.0.0.1 >/tmp/couple_love_http.log 2>&1 &
H=$!
python3 .dev/mock-firebase.py 8775 >/tmp/couple_love_mock.log 2>&1 &
M=$!
trap 'kill $H $M 2>/dev/null' EXIT
sleep 1.5
export LD_LIBRARY_PATH=/workspace/tmp/libroot/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH}
python3 .dev/test_share.py
