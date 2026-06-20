#!/usr/bin/env bash
# 갤러리 서버가 없으면 켜고, 주소를 한 줄로 출력한다. (고양이가 이 주소를 브라우저로 연다)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=4517

# bash 내장 /dev/tcp 로 포트가 열렸는지 확인 (curl 불필요)
up() { (exec 3<>"/dev/tcp/localhost/$PORT") 2>/dev/null; }

if ! up; then
  # setsid 로 완전히 독립된 세션에 띄운다. 안 그러면 펫의 wsl 명령이 끝날 때 서버도 같이 죽는다.
  setsid npm run --silent gallery >/tmp/promptcat-gallery.log 2>&1 </dev/null &
  # 처음 WSL이 깨어날 땐 tsx 시동에 시간이 걸려서 넉넉히(최대 30초) 기다린다
  for _ in $(seq 1 60); do
    up && break
    sleep 0.5
  done
fi

echo "http://localhost:$PORT"
