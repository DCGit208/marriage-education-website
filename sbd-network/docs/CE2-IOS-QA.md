# CE2 iOS / PWA QA checklist

Sign off each item on a physical iPhone (Safari + Home Screen install). Date: __________ Tester: __________

## Install & launch
- [ ] Add to Home Screen from Safari; icon opens standalone (no Safari chrome)
- [ ] Cold start: Messages loads without long empty-state flash
- [ ] `version.json` / SW update does not trap on stale cache (hard refresh recovers)

## Navigation
- [ ] Hamburger drawer: open/close, no overlap with ☰, scroll all sections
- [ ] Dashboard → Messages opens CE2
- [ ] `/dm.html` redirects to CE2
- [ ] Unread badge updates after receiving a DM

## Threads & send
- [ ] Open thread from Discovery; send text; appears without stuck “Sending…”
- [ ] Long-press menu: Reply, Star, Report, Hide (no Block if disabled)
- [ ] Edit message within window; save persists
- [ ] Photo attach (single + multi); voice hold-to-record
- [ ] Board share from board → CE2 card renders; link opens board

## Keyboard & layout
- [ ] Composer stays above keyboard; thread scroll not trapped
- [ ] Back to contacts on mobile; hub tabs switch (Groups / Direct / Discover / Starred)
- [ ] Message menu near bottom flips above finger (not clipped)

## Push & offline
- [ ] Push permission nudge; grant → token (no console errors)
- [ ] Offline banner; text queues; sends after reconnect
- [ ] Share from Safari/Photos → SBD → Messages prefills composer (if share_target supported)

## Admin (optional)
- [ ] Admin Panel tabs visible and scroll horizontally
- [ ] Messages tab: CE2 groups, reports, audit load

## Sign-off
- [ ] **PASS** — ready for production messaging
- [ ] **FAIL** — issues logged below

Notes:
