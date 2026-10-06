#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-}"
if [[ -z "$ZIP_PATH" || ! -f "$ZIP_PATH" ]]; then
  echo "Usage: $0 /path/to/Selected\ Core\ Personal\ Development\ Programs\ Artwork.zip"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

unzip -q "$ZIP_PATH" -d "$TMP_DIR"
ROOT="$(find "$TMP_DIR" -type d -name 'Selected Core Personal Development Programs Artwork' -print -quit)"
if [[ -z "$ROOT" ]]; then
  echo "Artwork folder not found in ZIP."
  exit 1
fi

DEST="$(cd "$(dirname "$0")/.." && pwd)/public/images/school1/series-a"
mkdir -p "$DEST"

copy_art() {
  local src="$1"
  local dest="$2"
  if [[ ! -f "$ROOT/$src" ]]; then
    echo "Missing source artwork: $src"
    exit 1
  fi
  cp "$ROOT/$src" "$DEST/$dest"
  echo "✓ $dest"
}

copy_art "Core Personal Development Programs.PNG" "collection-series-a.png"
copy_art "Teleios Blueprint/Teleios blueprint 3.png" "teleios-blueprint.png"
copy_art "Teleios Blueprint/Teleios Blueprint Book and Courseware 2.png" "teleios-blueprint-bundle.png"
copy_art "Identity Mastery/Identity Mastery.png" "identity-mastery.png"
copy_art "The Four Faculty Training/The Four Faculty Training.png" "four-faculties-training.png"
copy_art "Anthropocentric Development/Anthropocentric development 5.png" "anthropocentric-development.png"
copy_art "Anthropocentric Development/Anthropocentric Development Bundle.png" "anthropocentric-development-bundle.png"
copy_art "Anthropocentric Development/anthropocentric development courseware 2.png" "anthropocentric-development-courseware.png"
copy_art "Personal Development Masterclass/Personal Development Masterclass 2.png" "personal-development-masterclass.png"
copy_art "Science of Self Command/The Science of Self Command 2.png" "science-of-self-command.png"
copy_art "Science of Self Command/The Science of Self-Command Courseware.png" "science-of-self-command-courseware.png"
copy_art "Science of Self Command/The Science of Self-Command Coaching.png" "science-of-self-command-coaching.png"

echo
echo "Series A artwork installed in:"
echo "$DEST"
echo
echo "Next:"
echo "  git add sbd-network/public/images/school1/series-a"
echo "  git commit -m \"feat(school1): add approved Series A artwork\""
echo "  git push origin main"
