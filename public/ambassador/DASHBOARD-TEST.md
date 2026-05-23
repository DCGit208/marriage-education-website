# DOS dashboards

## Production (live)

| Role | URL |
|------|-----|
| Ambassador | https://marriageducation.com/ambassador/dashboard.html |
| Senior | https://marriageducation.com/ambassador/senior-dashboard.html |
| RD | https://marriageducation.com/regional-director/rd-dashboard.html |
| Executive | https://marriageducation.com/executive/dashboard.html |

Login: https://marriageducation.com/ambassador-login.html

Cache bust if needed: `?v=20260523prod`

**Deploy note:** `marriageducation.com` = Firebase site `marriage-education` (`hosting:main`). Always deploy both targets: `firebase deploy --only hosting:main,hosting:marriageducation`

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
