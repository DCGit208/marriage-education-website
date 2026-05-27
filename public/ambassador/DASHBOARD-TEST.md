# DOS dashboards & login

## Production dashboards

| Role | Dashboard |
|------|-----------|
| Ambassador | https://marriageducation.com/ambassador/dashboard.html |
| Senior | https://marriageducation.com/ambassador/senior-dashboard.html |
| RD | https://marriageducation.com/regional-director/rd-dashboard.html |
| Executive | https://marriageducation.com/executive/dashboard.html |

## Separate login pages (required)

Each role has its **own** login screen — do not use “Ambassador Login” for Senior or RD.

| Role | Code | Login URL |
|------|------|-----------|
| **Ambassador** | `AMB-…` | https://marriageducation.com/ambassador-login.html |
| **Senior Ambassador** | `AMB-…` (senior account) | https://marriageducation.com/senior-login.html |
| **Regional Director** | `RD-…` | https://marriageducation.com/rd-login.html |
| **Executive** | `AMB-…` (executive account) | https://marriageducation.com/executive-login.html |

Logout from each DOS dashboard returns you to **that role’s** login page.

## Dashboard walkthrough (rank-specific v2)

- **Per role** — Ambassador, Senior, RD, and Executive each get a tailored tour (e.g. RD includes Regional command; all include Foundation School / Resources / Leaderboard footer links).
- **First login** — auto-starts once per account (`dos_tour_v2_{code}`).
- **Replay** — **Guide** in the top bar.
- **Full sitemap** — **Map** or [navigation-guide.html](../dos/navigation-guide.html?rank=ambassador) (use `?rank=senior`, `regional_director`, `executive` as needed).

## Deploy

- **marriageducation.com** → push to `main` (FTP)
- **\*.web.app** → `firebase deploy --only hosting:main,hosting:marriageducation`

Cache bust: `?v=20260526prod` (production), `?v=20260526c` (preview test)

## Preview (-test)

| Role | Dashboard test URL |
|------|-------------------|
| Ambassador | /ambassador/dashboard-test.html |
| Senior | /ambassador/senior-dashboard-test.html |
| RD | /regional-director/rd-dashboard-test.html |
| Executive | /executive/dashboard-test.html |

## Role charter documents (Phase 1 — static only)

Hosted under `/documents/sbd-ops/` (no dashboard tab yet).

| File | URL (after local server or deploy) |
|------|-------------------------------------|
| PDF download | `/documents/sbd-ops/AMBASSADOR.pdf` |
| Read in browser | `/documents/sbd-ops/AMBASSADOR.html` |
| Markdown source | `/documents/sbd-ops/AMBASSADOR.md` |

Local check: `python3 -m http.server 8765` from `public/`, then open the paths above.

## Phase 2 — Role & targets tab (preview only)

| What | Where |
|------|--------|
| New sidebar item | **Role & targets** (#2, after Overview) on `dashboard-test.html` only |
| Section | `#role-targets` → `#dosRoleTargetsMount` (placeholder + PDF/HTML links) |
| Production `dashboard.html` | **Unchanged** — tab hidden until section exists (router filters nav) |

Preview: `/ambassador/dashboard-test.html?v=20260526a#role-targets`

**Phase 6:** Tab is in production `dashboard.html` locally; **marriageducation.com** shows it after you deploy.

Verify: sidebar order, hash routing, other sections still load, live `dashboard.html` has no new tab.

### Can't find the tab?

1. URL must end with **`dashboard-test.html`** (not `dashboard.html`).
2. Hard refresh: add `?v=20260526b` or Cmd+Shift+R.
3. Top orange banner: click **→ Role & targets tab (NEW)**.
4. Overview quick action: **Role & targets** button.

## Phase 3 — Full charter in tab (preview only)

| What | Detail |
|------|--------|
| Module | `public/dos/js/dos-role-charter.js` |
| Content | Role, targets table, blueprint vs dashboard economics, commission, daily rhythm, promotion, dashboard links |
| Live progress | Recruits, active subscribers, est. recurring (after login loads Firestore) |
| PDF | Download from tab → `/documents/sbd-ops/AMBASSADOR.pdf` |

Preview: `/ambassador/dashboard-test.html?v=20260526b#role-targets`

## Phase 5 — Tour & navigation (preview)

| What | Detail |
|------|--------|
| Tour | `dos-tour.js` v3 — Role & targets steps for Ambassador (sidebar + charter content) |
| Map | `navigation-guide.html` v3 — Role & targets in sitemap & daily flow |
| Overview | Hint + button to open Role & targets; Guide / Map called out |

Preview: `/ambassador/dashboard-test.html?v=20260526c` — click **Guide** or wait for auto-tour (v3 runs once per account; new key `dos_tour_v3_{code}`).

Verify: Replay Guide includes Role & targets; Map lists it; Overview button opens the tab.

## Phase 6 — Production Ambassador dashboard

**Status:** Code in `dashboard.html` (not deployed until you push / Firebase).

| File | Change |
|------|--------|
| `dashboard.html` | Role & targets section + scripts (`?v=20260526prod`) |
| `dos-config.js`, `dos-router.js`, `dos-role-charter.js`, `ambassador-dashboard-v2.js`, `dos-tour.js` | Shared modules (already updated in Phases 2–5) |
| `documents/sbd-ops/` | PDF + HTML charter (Phase 1) |

Local production shell: http://127.0.0.1:9292/ambassador/dashboard.html?v=20260526prod#role-targets

Deploy (you run when validated): `git push origin main` + Firebase hosting both targets.

## Phase 7 — Senior Ambassador Role & targets

| What | Detail |
|------|--------|
| Documents | `/documents/sbd-ops/SENIOR_AMBASSADOR.{pdf,html,md}` |
| Dashboards | `senior-dashboard.html` + `senior-dashboard-test.html` |
| Charter | `DOSRoleCharter.renderSenior()` — team model, 5% override, live team stats |
| Tour | v4 — Senior Role & targets steps |

Preview: `/ambassador/senior-dashboard-test.html?v=20260527b#role-targets`  
Production: `/ambassador/senior-dashboard.html?v=20260528prod#role-targets`

## Phase 8 — Regional Director Role & targets

| What | Detail |
|------|--------|
| Documents | `/documents/sbd-ops/REGIONAL_DIRECTOR.{pdf,html,md}` |
| Dashboards | `rd-dashboard.html` + `rd-dashboard-test.html` |
| Charter | `DOSRoleCharter.renderRegionalDirector()` — 50 seniors, 100k/mo model, 5% override |
| Tour | v5 — RD Role & targets steps |

Preview: `/regional-director/rd-dashboard-test.html?v=20260528b#role-targets`  
Production: `/regional-director/rd-dashboard.html?v=20260528prod#role-targets`

Deploy when validated: `git push origin main` + Firebase hosting both targets.

## Phase 9 — Executive Network Director Role & targets

| What | Detail |
|------|--------|
| Documents | `/documents/sbd-ops/EXECUTIVE_NETWORK_DIRECTOR.{pdf,html,md}` |
| Dashboards | `executive/dashboard.html` + `executive/dashboard-test.html` |
| Charter | `DOSRoleCharter.renderExecutive()` — global structure, 10-month target, executive mandate |
| Tour | v6 — Executive Role & targets steps |

Preview: `/executive/dashboard-test.html?v=20260529b#role-targets`  
Production: `/executive/dashboard.html?v=20260529prod#role-targets`

Deploy when validated: `git push origin main` + Firebase hosting both targets.
