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

Cache bust: `?v=20260524b`

## Preview (-test)

| Role | Dashboard test URL |
|------|-------------------|
| Ambassador | /ambassador/dashboard-test.html |
| Senior | /ambassador/senior-dashboard-test.html |
| RD | /regional-director/rd-dashboard-test.html |
| Executive | /executive/dashboard-test.html |
