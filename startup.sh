#!/bin/sh
set -eu
cd /workspace
# Huge toolchain trees exhaust inotify and kill the preview ("reconnecting").
echo 524288 > /proc/sys/fs/inotify/max_user_watches 2>/dev/null || true
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
