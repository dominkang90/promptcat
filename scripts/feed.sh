#!/usr/bin/env bash
# 바탕화면 바로가기(프롬냥이.bat)가 부르는 스크립트.
# Windows 경로로 들어온 사진을 WSL 경로로 바꿔서 추출 엔진에 먹인다.
set -euo pipefail

cd "$(dirname "$0")/.."

WINPATH="${1:-}"
if [ -z "$WINPATH" ]; then
  echo "🐱 사진 파일을 프롬냥이 아이콘 위로 끌어다 놓아 주세요!"
  exit 1
fi

IMG="$(wslpath "$WINPATH")"
echo "🐱 냠냠... ($IMG)"
npm run --silent extract -- "$IMG"
