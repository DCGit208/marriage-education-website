# DOS production cutover (Phase 8)

**Date:** 2026-05-23  
**Status:** Live on production URLs

## What changed

| Role | Production URL | Legacy backup |
|------|----------------|---------------|
| Ambassador | `/ambassador/dashboard.html` | `dashboard-legacy.html` |
| Senior | `/ambassador/senior-dashboard.html` | `senior-dashboard-legacy.html` |
| Regional Director | `/regional-director/rd-dashboard.html` | `rd-dashboard-legacy.html` |
| Executive | `/executive/dashboard.html` | *(new; no prior file)* |

Login (`ambassador-login.html`) routes by role to the production paths above.

**Two hosting paths:**

| URL | How it updates |
|-----|----------------|
| `marriageducation.com` | Git push to `main` → `.github/workflows/deploy-to-ftp.yml` uploads `public/` to FTP |
| `marriageducation.web.app` | `firebase deploy --only hosting:marriageducation` |
| `marriage-education.web.app` | `firebase deploy --only hosting:main` |

After dashboard changes, **push to `main`** (for `.com`) and run Firebase deploy (for `.web.app`).

Preview URLs (`*-test.html`) remain for side-by-side comparison.

## Parity checklist (verify with real accounts)

After deploy, log in on **https://marriageducation.com** (or web.app) and confirm:

### Ambassador (regular code)
- [ ] **Role & targets** — sidebar #2; charter loads; PDF download (`/documents/sbd-ops/AMBASSADOR.pdf`)
- [ ] Guide tour (v3) includes Role & targets; Map guide lists it
- [ ] Overview KPIs match expectations (sales, recruits, commission totals)
- [ ] Primary referral link copies correctly
- [ ] Commission history loads from `sales`
- [ ] Network / recruits list populated when `recruitedBy` links exist
- [ ] Daily ops saves to `dos_daily_logs`
- [ ] Pipeline / retention sections load (may be empty if no prospects)

### Senior (`AMB-…` with `ambassador_type: senior`)
- [ ] Lands on `senior-dashboard.html` (not ambassador shell)
- [ ] Team command shows downline
- [ ] Personal KPIs still load for senior’s own code

### Regional Director (`RD-…` in `regional_directors`)
- [ ] Lands on `rd-dashboard.html`
- [ ] Regional command shows seniors / territory stats
- [ ] Login works with RD code (not only email)

### Executive
- [ ] Lands on `executive/dashboard.html`
- [ ] Global command aggregates network

## Rollback

Rename legacy files back if needed:

```bash
cd public/ambassador
mv dashboard.html dashboard-dos.html
mv dashboard-legacy.html dashboard.html
# repeat for senior; same pattern under regional-director/
```

Then redeploy hosting.

## Cache

Hard refresh or append `?v=20260526prod` if an old dashboard appears.

## Role & targets (Phase 6 — 2026-05-26)

Production `dashboard.html` now includes **Role & targets** (Phases 1–5): hosted charter PDF, in-dashboard blueprint, tour v3, navigation guide v3.

**Deploy when ready** (not automatic): push `main` for marriageducation.com FTP; `firebase deploy --only hosting:main,hosting:marriageducation` for web.app.
