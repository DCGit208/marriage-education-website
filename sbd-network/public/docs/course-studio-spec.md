# Course Studio — Full Premium Specification

**Platform:** SBD Network LMS (`sbd-network.web.app`)  
**Role:** Content Designer (`role: designer` or `staffAccess.contentDesigner`)  
**Data:** Firestore `courses`, `modules`, `modules/{id}/parts/{partId}`

This document defines the **complete** premium Course Studio. Phase 2 and Phase 3 capabilities are marked. Phase 4+ is roadmap.

---

## Design principles

1. **Never break existing courses** — all current Firestore `content` fields remain the learner source of truth until Publish.
2. **Reader parity** — studio preview uses the same `lesson-renderer.js` as `lesson.html`.
3. **Formation-first** — 7-part week scaffold is the default; custom parts supported.
4. **Doctrine-aware** — linter flags integration-law and spine violations before publish.
5. **Designer ≠ admin** — content editing is separate from platform administration.

---

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| **2** | Catalog, split editor, live preview, add/duplicate week/part, new course | **Live** |
| **3** | Toolbar, draft/publish, autosave, doctrine linter, metadata rail, drag reorder, version snapshots | **Live** |
| **4** | Repo sync, media library, cover art, collaboration, analytics | Planned |
| **5** | AI assist, assessments builder, staging environment | Planned |

---

## 1. Access & permissions

- Content Designer gate on `/admin-courses.html`
- Firestore write: `isLmsEditor` (admin or designer) on `modules`, `parts`, `parts/versions`
- Course doc writes for designers (module counts, metadata) via `isLmsEditor`
- Platform admin grants designer role in Admin Panel

---

## 2. Catalog & structure (Phase 2+)

- Searchable tree: courses → weeks → parts
- Expand/collapse courses
- Deep link: `?course={courseId}`
- **+ Add week** — 7-part formation shell + part subcollection
- **+ Part** — append to week metadata + part doc
- **Duplicate week / part**
- **+ New Course** wizard (slug, school, tier, purchase-only, N weeks)
- **Drag reorder parts** (Phase 3) — updates `parts[].order` in module doc

---

## 3. Authoring (Phase 2–3)

### Editor modes
- Split (source + preview)
- Source only
- Preview only
- ⌘/Ctrl+S save draft

### Visual toolbar (Phase 3)
- Bold, italic, H2, bullet list, table template, scripture block, code fence
- Wraps selection or inserts at cursor in markdown textarea

### Draft / publish (Phase 3)
| Field | Purpose |
|-------|---------|
| `content` | **Published** — what learners see in LMS |
| `draftContent` | Working copy in studio |
| `hasDraft` | `true` when draft differs from published |
| `publishedAt` | Last publish timestamp |
| `draftUpdatedAt` | Last draft save |

**Load order in studio:** `draftContent` if `hasDraft`, else `content`.  
**LMS read:** `content` only (designers may use `?preview=draft` on lesson URL).

**Publish** copies draft → `content`, clears `hasDraft`, writes version snapshot.

### Autosave (Phase 3)
- Debounced draft save ~30s when dirty
- Does not publish to learners

### Version snapshots (Phase 3)
- On publish: `parts/{partId}/versions/{versionId}` with `content`, `savedAt`, `savedBy`

---

## 4. Doctrine linter (Phase 3)

Runs on current editor text + course/week context.

| Rule | Severity |
|------|----------|
| Ephesians 5 outside WWM Week 11 | Error |
| Functionalism / wrong integration order | Warning |
| Missing formation H2 for part type | Warning |
| Flagship week &lt; 3,500 words (aggregated) | Info |
| Undefined terms in Core Definitions table | Info |

---

## 5. Metadata rail (Phase 3)

Per open part:
- Course / module / part IDs
- Word count, character count, est. read minutes
- Draft vs published badge
- Lint summary (click to scroll warnings)
- Quick links: Parts index, Open in LMS, Publish part

---

## 6. Preview & LMS

- Live preview via `LessonRenderer.renderMarkdown`
- **Open in LMS →** published content
- **Preview draft in LMS** (designers): `?preview=draft`

---

## 7. Commerce & access (Phase 2; extended in Phase 4)

New course wizard sets: `schoolId`, `accessLevel`, `requiredTier`, `purchaseOnly`, `published`, `isActive`.

Phase 4: shop card editor, price, featured, entitlement simulator.

---

## 8. Import / export (Phase 4)

- Import: repo markdown → Firestore (`seed-wwm-course.js`, `split-wwm-parts.js`)
- Export: Firestore → git markdown
- Dry-run and diff before sync

---

## 9. Media & assets (Phase 4)

- Week `downloads[]`, issue-cover art, Storage uploads, embedded video/audio.

---

## 10. Collaboration & analytics (Phase 4–5)

- Comments, review queue, publish calendar, completion funnel, drop-off heatmap.

---

## Firestore shape (reference)

```
courses/{courseId}
  title, schoolId, accessLevel, purchaseOnly, moduleCount, published, ...

modules/{moduleId}
  courseId, week, title, parts: [{ id, order, title, track, estimatedMinutes }]
  courseFormat: 'formation'
  hasPartSubcollection: true

modules/{moduleId}/parts/{partId}
  content          ← published (LMS)
  draftContent     ← studio working copy
  hasDraft
  publishedAt, draftUpdatedAt, updatedAt

modules/{moduleId}/parts/{partId}/versions/{versionId}
  content, savedAt, savedBy
```

---

## URLs

- Studio: `/admin-courses.html`
- Studio + course: `/admin-courses.html?course=the-woman-the-wife-the-mother`
- LMS part: `/lesson.html?moduleId=wwm-week-1&part=part-1`
- Draft preview: `/lesson.html?moduleId=...&part=...&preview=draft`

---

## Build & deploy

```bash
cd sbd-network && node build.js && firebase deploy --only hosting,firestore:rules
```

Seed (canonical repo → Firestore):

```bash
node scripts/build-wwm-course.js
node sbd-network/scripts/seed-wwm-course.js
```

Export (Firestore → repo backup):

```bash
node sbd-network/scripts/export-wwm-firestore.js
node sbd-network/scripts/export-wwm-firestore.js --week=8
node sbd-network/scripts/export-wwm-firestore.js --draft --dry-run
```
