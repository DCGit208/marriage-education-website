# RD Network Genealogy Tree — Build Reference & Guardrails

**Status:** Phase 1 implemented (2026-06-02)  
**Approved:** Concept A (Unilevel Regional Genealogy Tree) + three view toggles + adopted UX/data guardrails below  
**Primary user:** Regional Director (`RD-…`) on Deployment Operations dashboard  
**Reference RD (QA):** `RD-AYIN-5087` (Ayinwi Promise Imbih)  
**Last updated:** 2026-06-02  

---

## 1. Purpose

Replace the text-heavy **Recruitment tree** block on the RD **Network** tab with an **interactive, visually clear unilevel genealogy tree** that:

- Shows who recruited whom using **verified Firestore links** (not inflated counters).
- Supports three filtered views (Full / Leaders / Direct to RD).
- Pan, zoom, search, minimap, expand/collapse, and click-for-detail.
- Keeps the **ambassador table** below as an audit-friendly secondary view.

This document is the **single source of truth** for implementation. Do not ship features marked **Out of scope** or violate **Guardrails** without explicit product approval.

---

## 2. Compensation & tree model (terminology)

| Term | This project |
|------|----------------|
| **Model** | **Unilevel regional genealogy** |
| **Root** | Regional Director (`RD-…`) |
| **Edge** | `recruitedBy` / `recruited_by` → parent ambassador code |
| **Region scope** | `rdCode` OR `regional_director_code` OR direct `recruitedBy == RD` |
| **Senior rank** | `ambassador_type == senior` OR developing: verified recruits ≥ 1 and &lt; 10 |

**Not in scope (do not implement UI for):**

- Binary (left/right legs, spillover)
- Matrix (fixed width slots)
- Forced symmetrical binary layout

**Internal product name:** *Unilevel Regional Genealogy Tree*

---

## 3. Approved feature set

### 3.1 Core layout (Concept A)

- Top-down hierarchy: RD → direct ambassadors → downline chains.
- **SVG** render layer (preferred) with pan + zoom; avoid thousands of DOM nodes.
- Curved Bézier (or smooth orthogonal) edges parent → child.
- Rounded **card nodes** (not table rows as the tree).
- Depth-based visual weight (RD accent root → lighter fills by depth).
- **Detail panel** on click: name, code, email, recruited-by, verified direct recruits (name + code).
- **Hover tooltip**: short summary (name, code, recruit count).

### 3.2 Three view toggles

| ID | Label | Default? | Visibility rule |
|----|--------|----------|-----------------|
| `full` | **Full network** | No | All members passing [§5 Member inclusion](#5-member-inclusion-guardrails) |
| `leaders` | **Leaders only** | **Yes** | RD + any member with `verifiedDirectRecruits >= 1` + entire subtree under those leaders |
| `direct` | **Direct to me** | No | RD + members with `recruitedBy === rdCode` only (no deeper levels on canvas; optional badge “+N in chain” if they have downline not shown) |

Toggle state persists for session (optional `sessionStorage` key `dos_rd_tree_view`).

### 3.3 Navigation & interaction (consultant brief, adapted)

| Feature | Required v1 | Notes |
|---------|-------------|--------|
| Pan / zoom | Yes | Wheel + pinch; toolbar +/- optional |
| Mini-map | Yes | Bottom-right overlay on tree viewport |
| Search (code/name) | Yes | Filter loaded members; recenter + select node |
| Expand / collapse node | Yes | Hide/show children; default expanded depth 2 for `full` |
| Click → detail panel | Yes | Right on desktop; below tree on mobile (`max-width: 900px`) |
| Connector draw-in animation | Phase 2 | Optional; do not block v1 |

### 3.4 Status & visual coding

| State | Condition | Node treatment |
|-------|-----------|----------------|
| RD root | `id` is effective RD code | `--dos-accent` fill/border, larger node |
| Active | `status` in `active`, `approved`, `activated`, `confirmed` + activated | Standard card |
| Developing | Not senior; `verifiedDirectRecruits` 1–9 | Amber ring + `X/10` progress bar on node |
| Senior | `ambassador_type === senior` | Purple/emphasis label “Senior” |
| Selected | User click | Accent border 2px |
| Excluded | Fails §5 | Never rendered |

### 3.5 Data display rules (verified only)

- **Recruit count on node and table** = count of **in-region, activated `AMB-…`** docs where `recruitedBy === thisMember.id`.
- **Never** display raw `recruits_count` / `directAmbassadorCount` if it differs from verified count (optional small “profile had N” only during admin debug, not production UI).
- **Senior progress** = `verifiedDirectRecruits / SENIOR_RECRUIT_TARGET` (`SENIOR_RECRUIT_TARGET` from `DOSConfig`, default 10).

### 3.6 What remains on Network tab

| Block | Action |
|-------|--------|
| `#dosNetworkSummary` | Keep KPIs; stats from verified graph |
| `#dosRecruitmentTree` | **Replace** inner content with new tree shell (toolbar, canvas, minimap, detail) |
| `#dosRecruitList` | Keep table; columns align with verified recruits; optional recruit names under count |
| Old bullet-list `renderRecruitmentTree` HTML | **Remove** after tree ships |

---

## 4. Explicitly out of scope (v1)

- 3D / WebGL / Three.js / “bubble chart” as primary tree
- Binary legs, matrix slots, spillover animations
- React / Next.js rewrite of RD dashboard
- New REST API / Prisma / SQL CTE (data stays **Firestore client** via existing compat SDK)
- PV/GV fields unless added to `ambassadors` schema later (use recruits, units, SBD subs, `activated_at`, email, phone)
- Editing downline or reassigning `recruitedBy` from UI
- Real-time listeners on entire region (batch load on tab open + on toggle change is enough at current scale)
- Executive / Senior dashboards (RD only unless `data-dos-rank` extended later)

---

## 5. Member inclusion guardrails

A person appears in the regional network **only if all** are true:

1. Document id matches `^AMB-[A-Z0-9-]+$` (paid activation path).
2. `activated_at` is present (Firestore timestamp).
3. `status !== 'merged_duplicate'` and no `merged_into` / not `is_form_intake_only`.
4. Not RD self-record: not `is_rd_linked_account`, not excluded via `getEffectiveRdCode` / linked ambassador email match.
5. Linked to RD region: any of  
   `rdCode == RD`, `regional_director_code == RD`, `recruitedBy == RD` (or in chain under someone who satisfies 1–4).

**Deduping:** Same person once via `person:phone|name` or `email:` key (see `dedupeNetworkMembers` in `dos-rd-network.js`).

**Parent link:** Child’s parent = `norm(recruitedBy || recruited_by)`. Edge only drawn if parent is also visible in current toggle (except `direct` view truncates depth).

---

## 6. Tech stack (actual — not consultant template)

| Layer | Technology |
|-------|------------|
| Dashboard | Static HTML `public/regional-director/rd-dashboard.html` |
| Logic | Vanilla JS IIFE modules under `public/dos/js/` |
| Styling | `public/dos/dos-theme.css` + scoped tree CSS |
| Data | Firebase Firestore compat (`ambassadors`, `regional_directors`) |
| Auth/session | `ambassador-session.js`, `ambassador-account-resolve.js` |
| RD detection | `body[data-dos-rank="regional_director"]`, `isRdPreview()` in `ambassador-dashboard-v2.js` |

**Do not** add npm dependencies for v1 unless already in project. Prefer vanilla SVG + layout math (port `computeDAGLayout` logic or lightweight copy).

---

## 7. File plan

### 7.1 New files

| Path | Responsibility |
|------|----------------|
| `public/dos/js/dos-rd-network-tree.js` | SVG tree render, pan/zoom, minimap, toggles, search, expand/collapse, detail panel binding |
| `public/dos/css/dos-rd-network-tree.css` | Tree viewport, nodes, edges, minimap, toolbar, mobile detail stack |

### 7.2 Modified files

| Path | Changes |
|------|---------|
| `public/dos/js/dos-rd-network.js` | Export graph builder, view filters, `attachRecruitmentGraph`; remove legacy HTML `renderRecruitmentTree` when tree owns UI |
| `public/dos/js/ambassador-dashboard-v2.js` | `loadRecruits`: mount tree via `DOSRdNetworkTree.init(...)`; pass `state.rdNetwork` |
| `public/regional-director/rd-dashboard.html` | Tree mount structure inside `#dosRecruitmentTree`; link CSS + JS; cache-bust query |
| `public/regional-director/rd-dashboard-test.html` | Mirror mounts for preview |
| `public/dos/dos-theme.css` | Optional CSS variables for tree if needed (`--dos-tree-*`) |

### 7.3 Scripts (ops, not runtime)

| Path | Purpose |
|------|---------|
| `scripts/sync-rd-recruit-counts.js` | Align Firestore `recruits_count` with verified downline (run after data fixes) |

### 7.4 Documentation

| Path | Purpose |
|------|---------|
| `public/dos/RD-NETWORK-GENEALOGY-TREE-BUILD.md` | This file |
| `public/ambassador/DASHBOARD-TEST.md` | Add Network tree QA steps (after implementation) |

---

## 8. DOM contract (`#dosRecruitmentTree`)

After build, `#dosRecruitmentTree` should contain (generated by JS):

```html
<div class="dos-tree-shell">
  <div class="dos-tree-toolbar"><!-- toggles, search, zoom --></div>
  <div class="dos-tree-stage">
    <svg class="dos-tree-svg" role="img" aria-label="Regional genealogy tree"></svg>
    <div class="dos-tree-minimap"></div>
  </div>
  <aside class="dos-tree-detail" id="dosTreeDetail"><!-- click detail --></aside>
</div>
```

Mobile: `.dos-tree-detail` moves below `.dos-tree-stage` via CSS grid/flex.

---

## 9. JavaScript API (modules)

### 9.1 `DOSRdNetwork` (data — existing + extensions)

```text
loadRdNetwork(db, rdCode, options) → { rdCode, members[], stats, graph, loadError? }
attachRecruitmentGraph(members, rdCode) → { children, recruiters, byId }
filterMembersByView(members, graph, rdCode, viewId) → members[]
computeVerifiedRecruitCounts(members) → void (mutates .recruits, .directRecruitList)
renderNetworkSummary(container, stats, rdDoc)
renderNetworkList(container, members)
```

### 9.2 `DOSRdNetworkTree` (new — presentation)

```text
init(mountEl, options) → controller
  options: { rdCode, members, graph, stats, onSelect?, defaultView?: 'leaders' }
destroy()
setView('full' | 'leaders' | 'direct')
focusNode(ambassadorId)
refresh(members, graph)  // after reload
```

**Guardrail:** Tree module must **not** query Firestore directly; only receives data from `loadRdNetwork`.

---

## 10. Firestore queries (unchanged pattern)

On Network tab load (RD):

1. `ambassadors` where `rdCode == RD`
2. `ambassadors` where `regional_director_code == RD`
3. `ambassadors` where `recruitedBy == RD`

Merge unique doc ids → filter §5 → dedupe → `attachRecruitmentGraph`.

**Expand node (lazy, optional v1.1):** `ambassadors` where `recruitedBy == nodeId` (client-side filter against §5).

**Rules deploy:** `dos_metrics`, `dos_pipeline`, `dos_daily_logs` must remain readable (`firestore.rules` deployed).

---

## 11. Layout algorithm

- Direction: **vertical** (top = RD).
- Use layered layout: assign ranks by BFS depth from RD; order siblings by name or recruit count desc.
- Node size: ~148×88px (adjust for mobile).
- Rank gap ~72px, sibling gap ~28px, padding ~32px.
- Re-layout on toggle change and window resize (debounced 150ms).

---

## 12. UX copy guardrails

| Element | Copy |
|---------|------|
| Section title | Your network · **N** ambassadors |
| Blurb | Everyone linked to your RD code — verified paid ambassadors only. Regional target: **50 seniors**. |
| Toggle full | Full network |
| Toggle leaders | Leaders only |
| Toggle direct | Direct to me |
| Empty leaders | No ambassadors in your region have verified recruits yet. |
| Search placeholder | Search by name or AMB- code |
| Detail recruited-by | Recruited by `{code}` |
| Direct recruits heading | Direct recruits (verified) |

Avoid: “binary”, “matrix”, “legs”, “spillover”.

---

## 13. Performance guardrails

| Guardrail | Limit |
|-----------|--------|
| Max nodes rendered without cluster | 200 (current region &lt; 20; safe) |
| Re-layout frequency | Debounce resize; no layout in tight pointermove loop |
| Firestore reads per Network visit | ≤ 3 ambassador queries + 1 RD doc optional |
| SVG nodes | Use `<g transform>` per node; single `<path>` layer for edges |
| Minimap | Simplified rects; update only on layout end |

---

## 14. Accessibility guardrails

- `role="img"` + `aria-label` on SVG canvas.
- Nodes focusable (`tabindex="0"`) + Enter selects.
- Toggle buttons are `<button type="button">` with `aria-pressed`.
- Search input has `<label>` or `aria-label`.
- Color not sole indicator: Developing shows numeric `X/10` text.
- Respect `prefers-reduced-motion`: disable connector animation if added in Phase 2.

---

## 15. Security & privacy guardrails

- Only show data already readable via Firestore rules for authenticated dashboard user.
- Do not expose emails in minimap; detail panel only.
- RD must not see merged_duplicate / form-only records.
- No cross-RD leakage: filter strictly by resolved `rdCode` on load.

---

## 16. Regression guardrails (do not break)

- [ ] RD login with `RD-…` code still resolves via `MEAmbassadorAccountResolve`.
- [ ] Overview / Regional command KPIs still use same `loadRdNetwork` stats.
- [ ] `loadRecruits` errors show user-visible message, not silent zero.
- [ ] Logout, section router (`dos-router.js`), other tabs unchanged.
- [ ] `regional_director` rank redirect logic unchanged.
- [ ] Cache-bust query on changed JS/CSS only.
- [ ] iOS Safari: pan/zoom does not trap page scroll (use `touch-action: none` on `.dos-tree-stage` only).

---

## 17. QA checklist (RD-AYIN-5087)

### Data correctness

- [ ] Eileen shows **2** recruits (AMAH, NYAH), not 4.
- [ ] Ngonga shows **1** (Acha).
- [ ] Perpetua shows **1** (Patience); Leinyuy shows Perpetua as direct child in full/leaders.
- [ ] Ayinwi `AMB-AYIN-1156` **never** appears.
- [ ] Form-only auto-ids (Kuku, Ajaga, etc.) **never** appear.
- [ ] Total paid ambassadors **13** in Full view.

### Toggles

- [ ] **Leaders only**: 4 leader subtrees + RD (Eileen, Ngonga, Leinyuy, Perpetua chains).
- [ ] **Direct to me**: 7 direct ambassadors (no Patience/AMAH unless direct—should not).
- [ ] **Full**: all 13 + hierarchy.

### Interaction

- [ ] Pan, zoom, minimap, search `AMB-EILE-5969`, click detail updates.
- [ ] Table below matches tree counts.

### Deploy

- [ ] `firebase deploy --only hosting:main`
- [ ] Hard refresh `?v=` bump on rd-dashboard scripts

---

## 18. Implementation phases

### Phase 1 (this build — required)

- `dos-rd-network-tree.js` + CSS
- Three toggles, pan/zoom, minimap, search, click detail
- Verified counts only; integrate with `loadRecruits`
- Remove legacy list-style recruitment HTML renderer
- Deploy hosting + update `DASHBOARD-TEST.md` snippet

### Phase 2 (optional later)

- Connector stroke animation (`prefers-reduced-motion` aware)
- Lazy fetch children on expand if region grows
- `sessionStorage` remember zoom/pan
- Export tree PNG for RD reports

---

## 19. Cache-bust convention

When shipping tree build, bump on `rd-dashboard.html`:

- `dos-rd-network-tree.js?v=YYYYMMDDtree`
- `dos-rd-network-tree.css?v=YYYYMMDDtree`
- `dos-rd-network.js` + `ambassador-dashboard-v2.js` if logic changed

---

## 20. Approval log

| Item | Status |
|------|--------|
| Concept A genealogy tree | Approved |
| Toggles: Full / Leaders / Direct | Approved |
| Pan, zoom, minimap, search, expand/collapse | Approved |
| Verified recruit counts only | Approved |
| Consultant brief (adapted, not binary/matrix/3D) | Approved |
| This reference doc before coding | **Complete** |
| Phase 1 implementation | **Shipped** |

**Deploy:** `firebase deploy --only hosting:main` then hard-refresh with `?v=20260602tree2`.

---

## 21. Quick reference — current regional leaders (verified)

| Code | Name | Verified recruits |
|------|------|-------------------|
| AMB-EILE-5969 | Eileen Akwo | 2 |
| AMB-NGON-4524 | Ngonga Linda | 1 |
| AMB-LEIN-4793 | Leinyuy Saber | 1 → Perpetua → Patience |
| AMB-PERP-0181 | Perpetua Kona | 1 |

Use this table as golden QA expected values after each deploy.
