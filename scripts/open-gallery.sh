#!/usr/bin/env bash
# 갤러리 서버가 없으면 켜고, 주소를 한 줄로 출력한다. (고양이가 이 주소를 브라우저로 연다)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=4517

# bash 내장 /dev/tcp 로 포트가 열렸는지 확인 (curl 불필요)
up() { (exec 3<>"/dev/tcp/localhost/$PORT") 2>/dev/null; }

if ! up; then
  nohup npm run --silent gallery >/tmp/promptcat-gallery.log 2>&1 &
  for _ in $(seq 1 30); do
    up && break
    sleep 0.3
  done
fi

echo "http://localhost:$PORT"
