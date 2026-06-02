# RD Genealogy — Interaction Rules (stable build)

**Applies to:** Network tab · all DOS ranks · cache `tree15+`

This document defines **normal (scroll)** vs **full page** behavior. Full page is **never** restored automatically when you open the Network tab.

---

## Terms

| Term | Meaning |
|------|---------|
| **Normal / Scroll mode** | Default. The diagram sits in the Network section with **scrollbars** (trackpad, mouse wheel, or drag scrollbar). |
| **Full page mode** | Optional. The genealogy block expands to **fill the screen**. The diagram is **not** scrolled — you **drag** it. |
| **Drag** | In full page only: click and hold **empty dark background** (not a card), move the pointer, release. Moves the whole tree. |
| **Scroll** | In normal mode only: use the diagram area’s scrollbars or trackpad scroll inside that panel. |

**Drag ≠ scroll.** They are used in different modes, not together.

---

## Rules — always

1. Opening the **Network** tab (or reloading the dashboard) → **always starts in Scroll mode**, never full page.
2. **Full network / Leaders only / Direct to me** → only changes **which ambassadors** appear; does not change scroll vs full page by itself.
3. Switching those three views **while in full page** → **stays in full page**, tree redraws, view recenters on you.
4. Switching those three views **while in scroll** → **stays in scroll**.
5. Leaving the Network tab (or destroying the tree) → **exits full page** if it was open; body scroll restored.
6. **Esc** → exits full page → back to scroll (only when full page is active).
7. Clicking a **card** → selects ambassador; detail panel updates (unchanged).
8. **Double-click** a card (not RD) → collapse/expand that branch’s children.

---

## Rules — Scroll mode (default)

| Action | Result |
|--------|--------|
| Open Network | Scroll mode, diagram at readable size, scroll if wider/taller than panel |
| Click **Scroll** (on diagram tools) | Stays in scroll (already active) |
| Click **Full page** | Enters full page |
| Wheel / trackpad on diagram | Scrolls the panel |
| Drag on background | Does nothing (use scrollbars) |

---

## Rules — Full page mode

| Action | Result |
|--------|--------|
| Click **Full page** | Genealogy expands full screen; side detail panel remains |
| Click **Scroll** | Exits full page → normal scroll |
| Press **Esc** | Exits full page → normal scroll |
| Change Full / Leaders / Direct | **Stays** full page; tree updates |
| Drag dark background | Pans diagram to reach off-screen nodes |
| Wheel on diagram | Does not scroll (use drag) |
| Click card | Selects node (does not start drag) |

---

## Zoom (− / % / + / 1:1)

- On the **diagram tools** (dark area, top-left): **−** zoom out, **+** zoom in, **1:1** reset.
- Works in **both** scroll and full page (40%–200%).
- **Full page:** zoom + drag together.
- **Scroll:** zoom scales the diagram; use scrollbars to move.
- Changing **Full / Leaders / Direct** resets zoom to **100%** (stable layout).

---

## Scale: 50 seniors × 10 downlines each?

| Question | Answer |
|----------|--------|
| **Can data load?** | Yes — Firestore queries are per region, not limited by tree UI. |
| **Can the tree show all ~550 paid ambassadors at once?** | Technically yes, but the canvas becomes **very wide/tall** (50 branches × 10 children). |
| **Is it ideal at that size today?** | **No** — best for current regions (~13–50 ambassadors). At 500+ nodes expect slower paint and heavy scrolling. |
| **Recommended before 50×10** | Default **Leaders only**; collapse branches; **search**; optional Phase 2: row cap/wrap, virtual render, or table-only fallback for mega-regions. |

---

## Scale 1 (tree11) — large regions & focus

| Feature | Behavior |
|---------|----------|
| **Full network default** | All branches **collapsed** under you; double-click or **Expand** to open one line at a time. |
| **Focus dropdown** | On diagram tools (dark bar): pick a recruitment leader → tree shows **their org only** (ancestors + descendants). |
| **Detail panel** | Leaders with recruits: **View this organization in tree** (same as Focus). |
| **80+ ambassadors + Full** | Explorer panel instead of expanded tree; pick a leader or **Show full tree anyway (collapsed)**. |
| **Collapse / Expand** | Diagram tools, **Full network** view only. |

**Not changed:** top toolbar layout, tree search field, side detail panel structure (one new button on leader cards only).

---

## Mobile touch (tree12)

| Gesture | Scroll mode | Full page |
|---------|-------------|-----------|
| **1 finger** | Scroll diagram panel | Drag background to pan |
| **2-finger pinch** | Zoom tree (40–200%), anchored under fingers | Zoom + pan |
| **Tap card** | Select · detail below (stacked layout) | Select |
| **Tap ▸ / ▾** on card | Collapse / expand that branch | Same |
| **− / + / 1:1** | Still available (larger on phone) | Same |
| **⋯ menu** (touch only) | Collapse / Expand all | Same |

- Touch UI detected via coarse pointer / touch support → class `is-touch-ui`.
- Pinch uses `preventDefault` on two-finger move so the **page** does not zoom (diagram only).
- Desktop: double-click card or small ▸ control on nodes with children.

---

## Scale 2 — Network explorer (tree13)

Below the genealogy diagram: **Network explorer** (`DOSRdNetworkExplorer`).

| Feature | Behavior |
|---------|----------|
| **Search** | Name, `AMB-` code, or recruiter code |
| **Filter** | All · Direct to me · Leaders · Senior · Developing |
| **Sort** | Recruits · Name · Units · Rank |
| **Open in tree** | Scrolls to diagram; leaders → focus subtree; others → full tree with path expanded |
| **Phone** | Card list instead of table (≤720px) |

Genealogy toolbar and tree search are unchanged.

---

## Multi-role network (tree15)

| Role | Root | Scope | Pipeline |
|------|------|-------|----------|
| **RD** | `RD-…` | Full region | Ghost nodes from `pending_payments` |
| **Senior** | Self `AMB-…` | Verified downline org | Same toggle |
| **Developing ambassador** | Self | Team when recruits or pending exist | Pending under you |

**Onboarding nodes:** dashed amber — not counted toward Senior rank.

---

## Scale 3 — cache, exports, rollups (tree14)

| Feature | Behavior |
|---------|----------|
| **Session cache** | Network data cached **5 minutes** per RD code (`sessionStorage`). Blurb shows “Cached … ago” or “Live from Firestore”. |
| **Refresh data** | Explorer button clears cache and reloads from Firestore. |
| **Leader rollups** | Collapsible table: direct recruits + **total downline** per leader. |
| **CSV — all** | Every ambassador (verified fields). |
| **CSV — leaders** | Rollup export. |
| **PNG — tree** | Snapshot of current diagram (loads html2canvas on demand). |

---

## What we do **not** persist

- **Full page is not saved** in `sessionStorage`. A past visit will **not** reopen full page when you return to Network.
- **View toggle** (Full / Leaders / Direct) **is** remembered for the session.
- **Zoom level** is not saved across visits; resets to 100% when you change network view.
- **Network Firestore payload** is cached **5 min** in session only (not across browser restarts indefinitely).

---

## QA checklist

- [ ] Open Network → **not** full screen.
- [ ] Full page → switch Leaders → Direct → Full → still full screen.
- [ ] Full page → Scroll → normal panel.
- [ ] Full page → Esc → normal panel.
- [ ] Overview → Network again → **not** full screen.
- [ ] Full page → drag background moves tree; click card selects.

---

## Code guardrails (for developers)

- `TreeController` init: `interactionMode = 'scroll'` only; `clearStoredFullpageMode()`.
- `setInteractionMode`: persist **scroll** only; never persist `fullpage`.
- `destroy()` / `DOSRdNetworkTree.destroy()`: `exitFullpageDomState()` + clear stored mode.
- Do not call `setInteractionMode('fullpage')` from `setView` or `loadRecruits`.
