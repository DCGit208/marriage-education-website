/**
 * SBD Life Phase 3 — structured reflections (sandbox).
 */
(function (global) {
  var REFLECTION_TYPES = [
    'reflection',
    'insight',
    'question',
    'debate',
    'experience'
  ];

  var REACTION_TYPES = [
    'thought-provoking',
    'powerful',
    'challenging',
    'eye-opening',
    'transformative',
    'emotionally-resonant',
    'insightful'
  ];

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function messengerShareUrl(articleId, article) {
    var base = window.location.origin || 'https://sbd-network.web.app';
    var path = window.SbdLifeRoutes
      ? window.SbdLifeRoutes.article(articleId)
      : '/labs/sbd-life/article.html?slug=' + encodeURIComponent(articleId);
    var url = base + path;
    var title = article.title || 'SBD Life';
    var text =
      'Continuing this SBD Life editorial in Messenger — reflections inherit article access.';
  var params = new URLSearchParams({
      title: title,
      text: text,
      url: url
    });
    return '/communication-v2/?' + params.toString();
  }

  async function loadReflections(articleId, ctx) {
    var db = firebase.firestore();
    var items = [];
    if (ctx.isAdmin) {
      var adminSnap = await db
        .collection('sbdLifeDiscussions')
        .where('articleId', '==', articleId)
        .limit(40)
        .get();
      adminSnap.forEach(function (doc) {
        items.push({ id: doc.id, data: doc.data() });
      });
    } else {
      var snap = await db
        .collection('sbdLifeDiscussions')
        .where('articleId', '==', articleId)
        .where('moderationStatus', '==', 'approved')
        .limit(30)
        .get();
      snap.forEach(function (doc) {
        items.push({ id: doc.id, data: doc.data() });
      });
    }
    items.sort(function (a, b) {
      var ta = a.data.createdAt && a.data.createdAt.toMillis ? a.data.createdAt.toMillis() : 0;
      var tb = b.data.createdAt && b.data.createdAt.toMillis ? b.data.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return items;
  }

  async function submitReflection(articleId, ctx, reflectionType, content) {
    return firebase.firestore().collection('sbdLifeDiscussions').add({
      articleId: articleId,
      userId: ctx.user.uid,
      content: content.trim(),
      reflectionType: reflectionType,
      moderationStatus: 'pending',
      tier: ctx.tier || 'foundation',
      engagementScore: 0,
      createdAt: firebase.firestore.Timestamp.now()
    });
  }

  async function submitReaction(articleId, ctx, reactionType) {
    return firebase.firestore().collection('sbdLifeReactions').add({
      articleId: articleId,
      userId: ctx.user.uid,
      reactionType: reactionType,
      createdAt: firebase.firestore.Timestamp.now()
    });
  }

  async function approveReflection(reflectionId) {
    return firebase
      .firestore()
      .collection('sbdLifeDiscussions')
      .doc(reflectionId)
      .update({ moderationStatus: 'approved' });
  }

  function renderReflectionCard(item, ctx) {
    var d = item.data;
    var mod = d.moderationStatus || 'pending';
    var adminActions =
      ctx.isAdmin && mod === 'pending'
        ? '<button type="button" class="life-ref-approve" data-id="' +
          esc(item.id) +
          '">Approve</button>'
        : '';
    return (
      '<article class="life-reflection-card" data-status="' +
      esc(mod) +
      '">' +
      '<header class="life-reflection-head">' +
      '<span class="life-reflection-type">' +
      esc(d.reflectionType) +
      '</span>' +
      (ctx.isAdmin ? '<span class="life-reflection-mod">' + esc(mod) + '</span>' : '') +
      '</header>' +
      '<p>' +
      esc(d.content) +
      '</p>' +
      adminActions +
      '</article>'
    );
  }

  async function mount(container, articleId, article, ctx) {
    if (!container || !article.discussionEnabled) {
      if (container) {
        container.innerHTML =
          '<p class="life-reflections-note">Reflections are closed for this editorial.</p>';
      }
      return;
    }

    container.innerHTML = '<p class="life-loading">Loading reflections…</p>';

    try {
      var items = await loadReflections(articleId, ctx);
      var typeOptions = REFLECTION_TYPES.map(function (t) {
        return '<option value="' + t + '">' + t + '</option>';
      }).join('');
      var reactionChips = REACTION_TYPES.map(function (t) {
        return (
          '<button type="button" class="life-reaction-chip" data-reaction="' +
          t +
          '">' +
          t +
          '</button>'
        );
      }).join('');

      container.innerHTML =
        '<section class="life-reflections">' +
        '<h2 class="life-reflections-title">Structured reflections</h2>' +
        '<p class="life-reflections-note">Not comments — formation reflections. Yours are reviewed before appearing.</p>' +
        '<div class="life-reactions-row">' +
        '<span class="life-reactions-label">Reflection signal</span>' +
        reactionChips +
        '</div>' +
        '<form id="lifeReflectionForm" class="life-reflection-form">' +
        '<label><span>Type</span><select name="reflectionType">' +
        typeOptions +
        '</select></label>' +
        '<label><span>Your reflection</span><textarea name="content" rows="4" maxlength="4000" placeholder="Share insight, question, or experience…" required></textarea></label>' +
        '<button type="submit" class="btn-secondary">Submit reflection</button>' +
        '</form>' +
        '<div class="life-messenger-bridge">' +
        '<a class="btn-secondary" href="' +
        esc(messengerShareUrl(articleId, article)) +
        '">Continue in Messenger</a>' +
        '<span class="life-messenger-note">Share inherits your article access tier (' +
        esc(article.tierRequired || 'public') +
        ').</span>' +
        '</div>' +
        '<div id="lifeReflectionList" class="life-reflection-list">' +
        (items.length
          ? items.map(function (it) {
              return renderReflectionCard(it, ctx);
            }).join('')
          : '<p class="life-reflections-note">No reflections yet.</p>') +
        '</div></section>';

      var form = container.querySelector('#lifeReflectionForm');
      if (form) {
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          var fd = new FormData(form);
          var content = String(fd.get('content') || '');
          var rtype = String(fd.get('reflectionType') || 'reflection');
          if (!content.trim()) return;
          try {
            await submitReflection(articleId, ctx, rtype, content);
            form.reset();
            alert('Reflection submitted for review.');
            mount(container, articleId, article, ctx);
          } catch (err) {
            alert('Could not submit: ' + (err.message || err.code));
          }
        });
      }

      container.querySelectorAll('.life-reaction-chip').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await submitReaction(articleId, ctx, btn.getAttribute('data-reaction'));
            btn.classList.add('is-selected');
          } catch (err) {
            alert('Reaction failed: ' + (err.message || err.code));
          }
        });
      });

      container.querySelectorAll('.life-ref-approve').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await approveReflection(btn.getAttribute('data-id'));
            mount(container, articleId, article, ctx);
          } catch (err) {
            alert('Approve failed: ' + (err.message || err.code));
          }
        });
      });
    } catch (err) {
      console.error(err);
      container.innerHTML =
        '<p class="life-error">Could not load reflections: ' + esc(err.message) + '</p>';
    }
  }

  global.SbdLifeReflections = { mount: mount, messengerShareUrl: messengerShareUrl };
})(window);
