/**
 * Admin tools — enable zero-cost browser narration for articles (labs).
 */
(function () {
  var btn = document.getElementById('enableNarrationBtn');
  var status = document.getElementById('narrationStatus');
  if (!btn) return;

  btn.addEventListener('click', async function () {
    btn.disabled = true;
    if (status) status.textContent = 'Generating narration config…';
    try {
      var ctx = await window.SbdLifeData.getViewerContext();
      if (!ctx.isAdmin) {
        if (status) status.textContent = 'Admin required.';
        btn.disabled = false;
        return;
      }
      var articleId = 'labs-demo-presence';
      var res = await window.SbdLifeData.getArticle(articleId);
      if (!res.data) {
        if (status) status.textContent = 'Seed demo article first.';
        btn.disabled = false;
        return;
      }
      var chars = await window.SbdLifeTts.enableBrowserNarration(
        articleId,
        res.data,
        res.data.tierRequired
      );
      if (status) {
        status.textContent =
          'Editorial narration enabled (' + chars + ' cues). Open demo article — heading reads alone.';
      }
    } catch (err) {
      console.error(err);
      if (status) status.textContent = 'Failed: ' + (err.message || err.code);
    }
    btn.disabled = false;
  });
})();
