// ================================================================
// DM BADGE — tiny script included on all pages to show unread DM count
// ================================================================

let _dmUnsubscribe = null;

function initDmBadge(userId) {
  if (_dmUnsubscribe) { _dmUnsubscribe(); _dmUnsubscribe = null; }

  // Listen to conversations where this user is a participant and has unread messages
  _dmUnsubscribe = db.collection('conversations')
    .where('participantIds', 'array-contains', userId)
    .onSnapshot(snap => {
      let unread = 0;
      snap.forEach(doc => {
        const d = doc.data();
        const lastReadAt = (d.lastRead || {})[userId] || null;
        const lastMsg    = d.lastMessageAt || null;
        if (lastMsg && (!lastReadAt || lastMsg.seconds > lastReadAt.seconds)) unread++;
      });
      document.querySelectorAll('.dm-badge').forEach(b => {
        b.textContent   = unread > 99 ? '99+' : String(unread);
        b.style.display = unread > 0 ? 'flex' : 'none';
      });
    }, () => {});
}
