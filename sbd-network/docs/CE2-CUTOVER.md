# CE2 cutover (May 2026)

## What changed

- Primary **Messages** nav → `/communication-v2/`
- Legacy `/dm.html` → HTTP redirect to CE2
- Unread badge (`dm-badge.js`) counts **CE2** `unreadCount` only (+ app icon badge when supported)
- PWA manifest shortcut **Messages** → `/communication-v2/`
- Member profile **Message** button → CE2 with `?uid=`

## Legacy data

- `conversations` / `messages` collections are **read-only** for members via `/dm.html` redirect
- No migration of historical DMs into CE2 in this release
- Admins can still use Firestore console for legacy moderation if needed

## Rollback

1. Revert `src/partials/nav.html` Messages link to `/dm.html`
2. Restore `public/dm.html` from git (full legacy UI)
3. Run `node build.js` and redeploy hosting
4. Revert `dm-badge.js` to legacy-only listener if desired

## Post-cutover QA

- [ ] Hamburger Messages on dashboard, boards, learn
- [ ] Unread badge updates on new CE2 DM
- [ ] Board Share via DM lands in CE2 thread
- [ ] `/dm.html` redirects
- [ ] Admin report → Open thread deep link
