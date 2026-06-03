// ================================================================
// DM BADGE — CE2 unread count + optional app icon badge
// ================================================================

let _ce2Unsub = null;
let _ce2Unread = 0;

function _paintDmBadge() {
  var total = _ce2Unread;
  document.querySelectorAll('.dm-badge').forEach(function (b) {
    b.textContent = total > 99 ? '99+' : String(total);
    b.style.display = total > 0 ? 'flex' : 'none';
  });
  if (navigator.setAppBadge) {
    if (total > 0) {
      navigator.setAppBadge(total > 99 ? 99 : total).catch(function () {});
    } else {
      navigator.clearAppBadge().catch(function () {});
    }
  }
}

function initDmBadge(userId) {
  if (_ce2Unsub) {
    _ce2Unsub();
    _ce2Unsub = null;
  }
  _ce2Unread = 0;

  _ce2Unsub = db
    .collection('ce2_conversations')
    .where('participantIds', 'array-contains', userId)
    .onSnapshot(
      function (snap) {
        var unread = 0;
        snap.forEach(function (doc) {
          var n = (doc.data().unreadCount || {})[userId];
          if (typeof n === 'number' && n > 0) unread += n;
        });
        _ce2Unread = unread;
        _paintDmBadge();
      },
      function () {}
    );
}
