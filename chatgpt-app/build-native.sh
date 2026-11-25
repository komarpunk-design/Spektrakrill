#!/usr/bin/env bash
set -euo pipefail
app_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cmake_command=${CMAKE:-cmake}
"$cmake_command" -S "$app_root/native" -B "$app_root/build" -DCMAKE_BUILD_TYPE=Release "$@"
"$cmake_command" --build "$app_root/build" --target spektrafilm-develop --parallel "${BUILD_JOBS:-4}"
