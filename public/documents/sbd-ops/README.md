# SBD operational charters (hosted documents)

Static deployment blueprints for DOS **Role & targets** (Phase 1+). No dashboard code in this folder.

## Ambassador (Phase 1)

| File | Purpose |
|------|---------|
| `AMBASSADOR.pdf` | Primary download for ambassadors |
| `AMBASSADOR.md` | Source-aligned markdown (canonical text) |
| `AMBASSADOR.html` | Read in browser |

**Source:** `SBD OPERATIONAL INFRASTRUCTURE/AMBASSADOR.md` (BTH documents).

## Local verification

```bash
cd public
python3 -m http.server 8765
```

- PDF: http://localhost:8765/documents/sbd-ops/AMBASSADOR.pdf
- Web: http://localhost:8765/documents/sbd-ops/AMBASSADOR.html

## Replace PDF

If you have a designed PDF from InDesign/Word, replace `AMBASSADOR.pdf` in this folder (keep the filename).

Regenerate from the HTML page (macOS, Chrome installed):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$(pwd)/AMBASSADOR.pdf" \
  "file://$(pwd)/AMBASSADOR.html"
```

Or edit `AMBASSADOR.md` and re-run the Chrome command after updating `AMBASSADOR.html`.

## Senior Ambassador (Phase 7)

| File | Purpose |
|------|---------|
| `SENIOR_AMBASSADOR.pdf` | Primary download for seniors |
| `SENIOR_AMBASSADOR.md` | Source markdown |
| `SENIOR_AMBASSADOR.html` | Read in browser |

## Regional Director (Phase 8)

| File | Purpose |
|------|---------|
| `REGIONAL_DIRECTOR.pdf` | Primary download for RDs |
| `REGIONAL_DIRECTOR.md` | Source markdown |
| `REGIONAL_DIRECTOR.html` | Read in browser |

## Executive Network Director (Phase 9)

| File | Purpose |
|------|---------|
| `EXECUTIVE_NETWORK_DIRECTOR.pdf` | Primary download for executives |
| `EXECUTIVE_NETWORK_DIRECTOR.md` | Source markdown |
| `EXECUTIVE_NETWORK_DIRECTOR.html` | Read in browser |
