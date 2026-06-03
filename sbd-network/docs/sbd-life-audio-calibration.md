# SBD Life — Human reference audio calibration

## Purpose
The editorial reference recording (`Human Voice.m4a`) was analyzed to calibrate **free browser listen** pacing — not to clone voice timbre (that requires paid neural TTS).

## Reference recording (analyzed May 2026)
| Metric | Value |
|--------|-------|
| Duration | 62.1 s |
| Speech segments | 25 |
| Pauses (≥250ms) | 28 |
| Speech ratio | ~70% |
| Pause p50 | 566 ms |
| Pause p75 | 813 ms |
| Section pauses (≥1.15s) | ~1.28 s, ~1.82 s |

## Applied to `public/js/sbd-life-tts.js`

| Cue role | Rate (was → now) | Pause after (was → now) |
|----------|------------------|-------------------------|
| Title | 0.78 → **0.76** | 1100 → **1200 ms** |
| Lede | 0.84 → **0.82** | 900 ms |
| Body paragraph | 0.90 → **0.86** | 520 → **820 ms** (end) |
| Section heading | 0.72 → **0.70** | 1300 → **1750 ms** |
| Pull quote | 0.80 → **0.78** | 1000 → **950 ms** |
| Breath / em-dash | 0.88 → **0.86** | 480 → **450 ms** |
| Mid-sentence | — | **570 ms** (p50) |

## What this improves
- Rhythm and breath spacing closer to the human read
- Longer pause after section headings (e.g. “Formation over impression”)
- Slightly slower delivery overall (~12% vs prior defaults)

## What this does not improve
- Voice warmth, stability, or authority (browser engine limit)
- Paid-quality output (ElevenLabs-class) without a paid API

## Re-calibration
If a new reference recording is provided, re-run silence analysis on the `.m4a` and update `HUMAN_CALIBRATION` in `sbd-life-tts.js`.
