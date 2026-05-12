#!/usr/bin/env bash
# Encode MV House dashboard background variants for <video> fallbacks in dashboard.html
#
# Usage (from repo root or sbd-network/):
#   ./scripts/encode-mv-house-background.sh path/to/master.mov
#   ./scripts/encode-mv-house-background.sh path/to/master.mp4
#
# Requires: ffmpeg with libx264 + libvpx-vp9 (typical Homebrew install).
# Outputs (into sbd-network/public/assets/background/):
#   slide-7-mv-bg.mp4       — H.264 main + yuv420p + faststart (broad Safari/iOS/desktop)
#   slide-7-mv-bg-720.mp4   — scaled max 720px wide, same codec (phones / media query)
#   slide-7-mv-bg.webm    — VP9, no audio (Chromium prefers after MP4 in our markup)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/public/assets/background"
mkdir -p "$OUT_DIR"

if [[ $# -lt 1 ]] || [[ ! -f "$1" ]]; then
  echo "Usage: $0 <input-video-file>" >&2
  exit 1
fi

IN="$1"
echo "Input:  $IN"
echo "Output: $OUT_DIR"

# Full-width hero: H.264 Main, 4.0 level, yuv420p, faststart for progressive download
ffmpeg -y -i "$IN" \
  -an \
  -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p \
  -movflags +faststart \
  -preset slow -crf 22 \
  "${OUT_DIR}/slide-7-mv-bg.mp4"

# Phone / narrow: scale down, slightly higher CRF acceptable
ffmpeg -y -i "$IN" \
  -an \
  -vf "scale='min(720,iw)':-2" \
  -c:v libx264 -profile:v main -level 3.1 -pix_fmt yuv420p \
  -movflags +faststart \
  -preset slow -crf 24 \
  "${OUT_DIR}/slide-7-mv-bg-720.mp4"

# WebM VP9 for browsers that use it after MP4 (optional bandwidth win on desktop Chrome)
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libvpx-vp9; then
  ffmpeg -y -i "$IN" \
    -an \
    -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 \
    "${OUT_DIR}/slide-7-mv-bg.webm"
else
  echo "Skipping WebM: libvpx-vp9 not available in this ffmpeg build." >&2
fi

echo "Done. Files:"
ls -la "${OUT_DIR}/slide-7-mv-bg"* || true
echo
echo "Optional: in dashboard.html MV <video>, uncomment the slide-7-mv-bg-720.mp4 <source> line"
echo "so phones load the smaller encode first when media=\"(max-width: 640px)\" matches."
