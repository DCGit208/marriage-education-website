/**
 * SBD Life Phase 5 — quote engine + share cards (sandbox).
 */
(function (global) {
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function shareUrls(quote, articleTitle, articleUrl) {
    var text = '"' + quote + '" — ' + (articleTitle || 'SBD Life');
    var encoded = encodeURIComponent(text + ' ' + articleUrl);
    return {
      whatsapp: 'https://wa.me/?text=' + encoded,
      twitter: 'https://twitter.com/intent/tweet?text=' + encoded,
      copy: text + '\n' + articleUrl
    };
  }

  async function loadQuotes(articleId) {
    var snap = await firebase
      .firestore()
      .collection('sbdLifeQuotes')
      .where('articleId', '==', articleId)
      .limit(12)
      .get();
    var items = [];
    snap.forEach(function (doc) {
      items.push({ id: doc.id, data: doc.data() });
    });
    return items;
  }

  async function recordShare(quoteId) {
    try {
      var ref = firebase.firestore().collection('sbdLifeQuotes').doc(quoteId);
      await ref.update({
        shareCount: firebase.firestore.FieldValue.increment(1)
      });
    } catch (e) {}
  }

  async function mount(container, articleId, article) {
    if (!container) return;
    container.innerHTML = '<p class="life-loading">Loading quotes…</p>';
    var items = [];
    try {
      items = await loadQuotes(articleId);
    } catch (err) {
      console.warn('[SBD Life Quotes] load skipped:', err.message || err.code);
      container.innerHTML = '';
      return;
    }
    if (!items.length) {
      container.innerHTML = '';
      return;
    }

    var baseUrl =
      (window.location.origin || 'https://sbd-network.web.app') +
      (window.SbdLifeRoutes
        ? window.SbdLifeRoutes.article(articleId)
        : '/labs/sbd-life/article.html?slug=' + encodeURIComponent(articleId));

    var html =
      '<section class="life-quotes"><h2 class="life-body-heading">Shareable quotes</h2><div class="life-quote-grid">';
    var sharePayloads = [];
    items.forEach(function (item, idx) {
      var q = item.data.quote || '';
      var links = shareUrls(q, article.title, baseUrl);
      sharePayloads[idx] = links.copy;
      html +=
        '<article class="life-quote-card">' +
        '<blockquote><p>' +
        esc(q) +
        '</p></blockquote>' +
        '<div class="probe-actions">' +
        '<a class="btn-secondary" target="_blank" rel="noopener" href="' +
        esc(links.whatsapp) +
        '">WhatsApp</a>' +
        '<button type="button" class="btn-secondary life-quote-copy" data-idx="' +
        idx +
        '" data-id="' +
        esc(item.id) +
        '">Copy</button>' +
        '</div></article>';
    });
    html += '</div></section>';
    container.innerHTML = html;

    container.querySelectorAll('.life-quote-copy').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var idx = Number(btn.getAttribute('data-idx'));
        var text = sharePayloads[idx] || '';
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = 'Copied';
          recordShare(btn.getAttribute('data-id'));
        } catch (e) {
          alert('Copy failed');
        }
      });
    });
  }

  global.SbdLifeQuotes = { mount: mount, loadQuotes: loadQuotes };
})(window);
