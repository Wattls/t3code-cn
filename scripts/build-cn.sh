#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_VERSION="${1:-0.1.7-zh-test.1}"
OUTPUT_DIR="${T3CODE_CN_OUTPUT_DIR:-"$REPO_ROOT/release-cn"}"
export PATH="$REPO_ROOT/node_modules/.bin:$PATH"
cd "$REPO_ROOT"

if [ ! -f .env ] && [ ! -f .env.local ]; then
  cp .env.example .env
fi
node --input-type=module -e '
import { loadRepoEnv } from "./scripts/lib/public-config.ts";
const env = loadRepoEnv();
const required = ["T3CODE_CLERK_PUBLISHABLE_KEY", "VITE_CLERK_PUBLISHABLE_KEY", "VITE_CLERK_JWT_TEMPLATE", "VITE_T3CODE_RELAY_URL"];
const missing = required.filter((key) => !env[key]?.trim());
if (missing.length) {
  console.error("Missing T3 Connect public build configuration: " + missing.join(", "));
  process.exit(1);
}
'

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR=$(CDPATH= cd -- "$OUTPUT_DIR" && pwd)
STAGE_DIR=$(mktemp -d "$OUTPUT_DIR/.cn-build-XXXXXX")
trap 'rm -rf "$STAGE_DIR"' EXIT
trap 'exit 1' HUP INT TERM

vp run dist:desktop:dmg:arm64 --build-version "$BUILD_VERSION" --output-dir "$STAGE_DIR" --verbose
DMG="$STAGE_DIR/T3-Code-$BUILD_VERSION-arm64.dmg"
hdiutil verify "$DMG"
mv "$DMG" "$OUTPUT_DIR/T3-Code-CN-arm64.dmg"
(
  cd "$OUTPUT_DIR"
  shasum -a 256 T3-Code-CN-arm64.dmg > SHA256SUMS.txt
)
printf '%s\n' "$BUILD_VERSION" > "$OUTPUT_DIR/VERSION"
