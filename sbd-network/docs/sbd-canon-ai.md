# SBD Canon AI — Course Studio Writing Agent

Doctrine-grounded AI for Course Studio: drafts formation parts from your full SBD corpus.

## What it indexes (exhaustive corpus)

| Source | Type |
|--------|------|
| `SBD-UNIFIED-CANON.md` | Authoritative doctrine |
| `docs/canon/*.md` | Treatises (WWM, etc.) |
| `docs/content/**/*.md` | Repo course markdown |
| `courses-catalogue.json` | All seeded module bodies |
| `schoolcourses.json` | 44-course master metadata |
| `shop-catalog.json` | Book/product copy |
| Root `WEEK-*.md` | Legacy week drafts |
| **Firestore** `modules/*/parts/*` | Published LMS content (live) |

Chunks are embedded (Gemini `text-embedding-004`) into `canon_chunks`.  
**On Publish** → `onCanonPartPublished` re-indexes that part automatically.

## Setup

### 1. Gemini API key

```bash
firebase functions:config:set gemini.api_key="YOUR_GOOGLE_AI_API_KEY"
```

Or set `GEMINI_API_KEY` when running the local indexer.

### 2. Full index (first time + after major canon edits)

From repo root:

```bash
export GEMINI_API_KEY=...
node sbd-network/scripts/index-sbd-canon.js
# or force refresh all chunks:
node sbd-network/scripts/index-sbd-canon.js --force
```

### 3. Deploy functions + hosting

```bash
cd sbd-network && npm run deploy
firebase deploy --only functions:studioCanonAssist,functions:reindexSbdCanon,functions:getCanonIndexStatus,functions:onCanonPartPublished,firestore:rules
```

## Studio UI

Open **Course Studio** → edit a part → right rail **✦ Canon AI**:

- **Draft part** — full formation section from canon
- **Expand** — deepen selection or draft
- **Rewrite** — editorial pass
- **Align canon** — fix doctrine drift
- **Outline** — structure + scriptures
- **Reindex corpus (admin)** — cloud reindex (bundled canon + Firestore)

Output goes to **draft only**. Run doctrine linter → Save draft → Publish.

## Cloud Functions

| Function | Who | Purpose |
|----------|-----|---------|
| `studioCanonAssist` | Content Designer | RAG + generate markdown |
| `reindexSbdCanon` | Admin | Full reindex |
| `getCanonIndexStatus` | Content Designer | Chunk count / last run |
| `onCanonPartPublished` | System | Incremental index on publish |

## Growth model

- New published parts → auto-indexed
- New repo markdown → re-run local `index-sbd-canon.js`
- Canon amendments → update `SBD-UNIFIED-CANON.md` → reindex
- Functions predeploy copies canon bundle for cloud reindex
