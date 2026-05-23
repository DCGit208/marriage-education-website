# DOS dashboards

## Production (live)

| Role | URL |
|------|-----|
| Ambassador | https://marriageducation.com/ambassador/dashboard.html |
| Senior | https://marriageducation.com/ambassador/senior-dashboard.html |
| RD | https://marriageducation.com/regional-director/rd-dashboard.html |
| Executive | https://marriageducation.com/executive/dashboard.html |

| Role | Code format | Login URL |
|------|-------------|-----------|
| Ambassador / Senior | `AMB-…` | https://marriageducation.com/ambassador-login.html |
| Regional Director | `RD-…` (Firestore `regional_directors`) | https://marriageducation.com/rd-login.html |
| Executive | Usually `AMB-…` in `ambassadors` | ambassador-login (routed to executive dashboard) |

Do not use ambassador-login for RD codes — different format, collection, and form.

Cache bust if needed: `?v=20260523prod`

**Deploy note:** `marriageducation.com` is served by **FTP** (GitHub Actions on push to `main`), not Firebase. Push to `main` to update `.com`. Firebase (`firebase deploy --only hosting:main,hosting:marriageducation`) updates `*.web.app` only.

## Preview (-test, optional)

| Role | URL |
|------|-----|
| Ambassador | https://marriageducation.web.app/ambassador/dashboard-test.html |
| Senior | https://marriageducation.web.app/ambassador/senior-dashboard-test.html |
| RD | https://marriageducation.web.app/regional-director/rd-dashboard-test.html |
| Executive | https://marriageducation.web.app/executive/dashboard-test.html |

## Parity & rollback

See [PRODUCTION-CUTOVER.md](./PRODUCTION-CUTOVER.md).

Legacy pre-DOS UI: `*-legacy.html` in the same folders.
