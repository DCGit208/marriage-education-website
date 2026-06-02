# Admin dashboard — preview & access gate

## URLs

| Environment | URL |
|-------------|-----|
| **Preview (test gate)** | `/admin-dashboard-test.html` |
| **Production** | `/admin-dashboard.html` |

Local: `python3 -m http.server 8765` from `public/`, then open the paths above.

Deployed: `https://marriageducation.com/admin-dashboard-test.html`

## What changed (Phase 0 + 1)

- **Phase 0:** Preview page with orange banner; same UI and payment workflows as production.
- **Production (`admin-dashboard.html`):** Login works as before — **any valid Firebase sign-in** opens the dashboard (no role block).
- **Preview strict mode (`admin-dashboard-test.html?strictAdmin=1` only):** Optional role gate for testing:
  - Firebase custom claim `admin: true`, **or**
  - Firestore `users/{uid}.role === 'admin'`
- Payment tab logic (approve/reject, RD payments, tables) is **unchanged**.

## QA checklist (run on preview first)

1. **Admin login** — Sign in with a known admin account → dashboard loads, Payments tab works (list loads, refresh works).
2. **Non-admin login** — Sign in with a valid non-admin account (e.g. ambassador) → denied message, no dashboard data visible.
3. **Logout** — Admin logs out → login overlay returns.
4. **Payments smoke test** — On preview, open Payments: pending list loads; do **not** approve/reject real payments unless you intend to (same Firestore as production).
5. **Production link** — Banner link opens `/admin-dashboard.html` (live page; gate applies there too after deploy).

## Deploy

- Push/deploy `public/admin-dashboard.html` and `public/admin-dashboard-test.html` together.
- Cache bust if needed: `?v=admin-gate-20260602`

## Approve for production

When preview QA passes, treat production `/admin-dashboard.html` as approved. Keep `-test` for future admin changes.

## Granting admin access

Ensure the account has either:

- Custom claim: `admin: true` (Firebase Admin SDK), or
- Firestore document `users/{uid}` with field `role: "admin"`
