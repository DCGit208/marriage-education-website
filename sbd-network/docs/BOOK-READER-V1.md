# SBD Network Book Reader V1 — Reference Specification

**Status:** Frozen for Version 1 (product) · Milestone 8 approved & deployed · Milestone 9 in progress  
**Last updated:** 2026-07-17  
**Role of implementer:** Lead Frontend Engineer — implement approved design only; do not redesign.

---

## 1. Product intent

Premium distraction-free reading for SBD Network Library books. This reader is the foundation for future educational surfaces (interactive books, journals, devotionals, manuals, study guides, EPUB, AI-assisted reading, notes/highlights). V1 prioritizes **content integrity**, readability, accessibility, and maintainability over visual effects.

---

## 2. Governance (mandatory)

- Do not redesign the reader or invent UX.
- Do not simplify features without approval.
- Do not silently change layouts or interactions.
- On technical limitation: **stop and explain** — do not invent alternatives.
- Do not modify unrelated application areas.
- **Do not deploy to production** unless explicitly instructed.
- Any product change requires explicit approval.
- Implement **one milestone at a time**; stop and wait for review.

---

## 3. Frozen V1 reading model

| Decision | Value |
|----------|--------|
| Reading model | **Immersive continuous vertical scroll per chapter** |
| Not used | Kindle pagination, fake page flip, CSS columns, viewport clipping, overflow-based “pages” |
| Absolute rule | **No content may ever be lost** (never clip, truncate, hide, overlap, or make text inaccessible) |
| Chapter unit | Each chapter is independent; do **not** infinite-scroll the whole book |
| Content width | Controlled by CSS variable `--br-content-max` (default **620px**), centered |
| Viewport | Prefer `100dvh`; `width: 100%`; `overflow-x: hidden` |
| Stack | Vanilla JS + HTML + CSS + Firebase Auth/Firestore + IndexedDB — **no React/Vue for V1** |

---

## 4. Frozen product decisions (from architecture review)

| Topic | Decision |
|-------|----------|
| Framework | Stay vanilla JS |
| Module style | Thin bootstrap + `public/js/reader/*.js` helpers (IIFE / `window.SBDReader`) |
| Position storage (later) | Prefer `progressRatio` + `chapterId` (not raw px alone) |
| Reading speed (later) | Default **220 wpm** for ETA |
| Firestore sync | Deferred to a later milestone (local-first first) |
| Virtualization | **Not in V1** (breaks progress/restore) |
| Pixel values | No arbitrary layout px; design tokens / CSS vars allowed for hairlines and hit slop |

### Center-tap (Milestone 4 — conflict resolutions)

- Toggle chrome only on **tap** (movement &lt; ~8–10px), not pan.
- Ignore if text selection is active.
- Ignore clicks on `a, button, input, [data-no-chrome-toggle]`.
- Center zone = middle **60%** of viewport height; top/bottom **20%** = scroll only.
- Escape / first Tab while hidden reveals chrome.

---

## 5. Deferred (do not implement until approved milestone)

Search (full book) · AI · EPUB · Dictionary offline · TTS

~~Themes~~ — **M2** · ~~Font switching / sizing~~ — **M3** · ~~Immersive chrome / center-tap~~ — **M4** · ~~Chapter progress / % / ETA~~ — **M5** · ~~Position restore + saved places (local)~~ — **M6** · ~~Firestore sync (position + saved places)~~ — **M7** · ~~Highlights + notes~~ — **M8** · ~~Chapter search + Define~~ — **M9 (in review)**

---

## 6. Milestone roadmap

| ID | Scope | Status |
|----|--------|--------|
| **M1** | Reading foundation | **Approved** |
| **M2** | Themes (Light / Sepia / Dark) | **Approved** |
| **M3** | Typography: Serif/Sans + Small–XL, persisted | **Approved** |
| **M4** | Immersive chrome + center-tap | **Approved** |
| **M5** | Chapter progress bar, reading %, ETA (220 wpm) | **Approved** |
| **M6** | Position restore + saved places (localStorage) | **Approved** |
| **M7** | Firestore sync (position + saved places) | **Approved** |
| **M8** | Highlights + notes (selection toolbar) | **Approved & deployed** |
| **M9** | Search in chapter + Define (selection) | **In progress** |
| M10+ | TTS, a11y polish, AI | Blocked until M9 approved |

---

## 7. Milestone 1 scope (approved to implement)

1. Full-viewport immersive reading layout (`100dvh`, no horizontal scroll).  
2. Semantic `<article>` reading column; margins; `--br-content-max`.  
3. Continuous chapter reading only.  
4. Content integrity (scroll; never clip).  
5. Remove legacy pagination / clipping / page-number logic.  
6. End-of-chapter: “End of Chapter”, “Continue Reading”, Next Chapter (no auto-concat).  
7. Pipeline: load book → chapter → markdown → sanitize → HTML → article → layout → ready.  
8. Errors: missing book/chapter, malformed, denied, empty.  
9. A11y foundation: semantic HTML, headings, ARIA, keyboard structure.  
10. Modular code — not a monolith; no placeholder future modules.

**M1 explicitly does not:** scroll restoration, themes, fonts, center-tap, progress, bookmarks, Firestore.

---

## 8. Key files

| Path | Role |
|------|------|
| `docs/BOOK-READER-V1.md` | This reference |
| `src/pages/book.html` | Reader page template |
| `public/css/book-reader.css` | Reader styles |
| `public/js/book-reader.js` | Bootstrap / ownership / load wiring |
| `public/js/reader/*.js` | M1–M9 helpers (`reader-annotations.js` = M8; search/define = M9) |
| `public/data/books/{id}.json` | Published book packs |

---

## 9. Acceptance (M1)

- [x] Books/chapters render (implemented; awaiting product review)
- [x] Continuous reading; no clipping
- [x] No fake pagination remaining
- [x] Responsive layout
- [x] End-of-chapter transition
- [x] Clean maintainable structure
- [x] Unrelated library/shop flows untouched

**Gate:** Product owner must approve before Milestone 2.

---

## 9b. Acceptance (M4)

- [x] Chrome hidden by default while reading
- [x] Center-tap (middle 60%) toggles chrome; top/bottom 20% scroll only
- [x] Tap ≠ pan; ignore selection; ignore interactive targets
- [x] Escape / Tab reveal chrome; Contents opens with chrome visible
- [x] Cover / denied keep chrome visible (tools usable)
- [x] Product owner review

**Gate:** Product owner must approve before Milestone 5 (progress / %).

---

## 9c. Acceptance (M5)

- [x] Thin chapter progress bar while reading (scroll-synced, never clips content)
- [x] Reading % for current chapter
- [x] ETA to finish chapter (220 wpm default)
- [x] Hidden on cover / denied / loading
- [x] Product owner review

**Gate:** Product owner must approve before Milestone 6 (bookmarks / restore).

---

## 9d. Acceptance (M6)

- [x] Reading position saved as `chapterId` + `progressRatio` in `localStorage`
- [x] Auto-save on scroll; flush on leave/back
- [x] Cover shows **Continue reading** when a saved position exists
- [x] **Save place** pins current scroll position; **Saved places** panel lists and jumps
- [x] Saved places stored locally per book (no Firestore)
- [x] Product owner review

**Gate:** Product owner must approve before Milestone 7 (Firestore sync).

---

## 9e. Acceptance (M7)

- [x] Signed-in users sync position + saved places to `users/{uid}/bookReader/{bookId}`
- [x] Local-first: localStorage remains source during read; merge on open (newer `updatedAt` wins)
- [x] Debounced push on scroll / save place / remove place
- [x] Offline / signed-out unchanged (local only)
- [x] Firestore rules: owner read/write only
- [x] Product owner review

**Gate:** Product owner must approve before Milestone 8 (annotations).

---

## 9f. Acceptance (M8)

- [x] Select text → floating toolbar: **Highlight**, **Note**, **Remove** (on existing mark)
- [x] Highlights: theme-aware fill on passage text only
- [x] Notes: normal passage text with inline **note icon at start of selection** (Olive Tree–style anchor)
- [x] Tap note anchor → popover with note text (not hover-only)
- [x] **Highlights & notes** drawer lists all marks; tap jumps and pulses anchor/highlight
- [x] Stored as `chapterId` + character offsets + `kind` + optional `note`
- [x] Synced via Firestore `highlights` on same `bookReader` doc (M7 pattern)
- [x] Center-tap still ignores active selection (M4 rule preserved)
- [x] Search / Define / Save-as-quote deferred to M9+
- [x] Product owner review

**Gate:** Product owner approved — Milestone 9 open.

---

## 9g. Acceptance (M9) — scope for implementation

1. **Search (in current chapter):** find query matches in the open chapter body; jump to next/previous; clear visual mark on active match; does not clip content.  
2. **Define (selection):** from selection toolbar, **Define** looks up the selected word/phrase (Free Dictionary API or equivalent) and shows a compact definition panel (same chrome language as note popover). Offline / failure → clear message.  
3. **Not in M9:** TTS, AI explain, EPUB, full-book search across chapters (may list as follow-on), Save-as-quote.  
4. Preserve M4 center-tap rules; selection toolbar remains the entry for Define.  
5. Modular helper: `reader-search.js` / extend annotations toolbar — no monolith.  

**Gate:** Product owner must approve before TTS / M10.

---

## 10. Non-functional requirements (V1 target — enforce across milestones)

- First content render &lt; 300ms excluding network (local/cached).  
- Maintain smooth scroll on modern mobile.  
- Theme switch &lt; 100ms (when themes land).  
- Minimal CLS on font/theme change.  
- Chrome, Safari, Firefox, Edge + modern iOS/Android.  
- No memory leaks in long sessions.  
- WCAG-oriented touch targets.  
- Preferences/position survive refresh (when persistence milestones land).

---

*End of reference. Product changes require explicit approval.*
