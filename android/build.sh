#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node android/prepare-assets.mjs
bash android/build-native.sh
android/gradlew -p android :app:assembleRelease
