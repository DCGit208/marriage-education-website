/**
 * SBD Life — shared data access + tier helpers (Phase 2 sandbox).
 */
(function (global) {
  var TIER_RANK = { public: 0, foundation: 1, premium: 2, elite: 3, admin: 4 };

  function tierRank(tier) {
    return TIER_RANK[tier] != null ? TIER_RANK[tier] : 0;
  }

  function canReadTier(required, userTier, isAdmin) {
    if (isAdmin) return true;
    return tierRank(userTier || 'public') >= tierRank(required || 'public');
  }

  function isPublishedArticle(data) {
    return data && data.status === 'published' && data.visibility !== 'hidden';
  }

  async function getViewerContext() {
    var user = firebase.auth().currentUser;
    if (!user) return { user: null, tier: 'public', isAdmin: false };
    var snap = await firebase.firestore().collection('users').doc(user.uid).get();
    var d = snap.exists ? snap.data() : {};
    var role = String(d.role || '').toLowerCase();
    return {
      user: user,
      tier: d.tier || 'foundation',
      isAdmin: role === 'admin'
    };
  }

  async function getArticle(slugOrId) {
    var ctx = await getViewerContext();
    if (!ctx.user) return { error: 'auth', ctx: ctx };
    var ref = firebase.firestore().collection('sbdLifeArticles').doc(slugOrId);
    var snap;
    try {
      snap = await ref.get();
    } catch (err) {
      if (err && err.code === 'permission-denied') {
        return { error: 'tier', ctx: ctx, required: 'restricted' };
      }
      throw err;
    }
    if (!snap.exists) return { error: 'not_found', ctx: ctx };
    var data = snap.data();
    if (!ctx.isAdmin && !isPublishedArticle(data)) {
      return { error: 'unpublished', ctx: ctx };
    }
    if (!data.bookProductId && data.issueId) {
      try {
        var issueSnap = await firebase
          .firestore()
          .collection('sbdLifeIssues')
          .doc(data.issueId)
          .get();
        if (issueSnap.exists) {
          var issueData = issueSnap.data();
          ['bookProductId', 'bookCtaLabel', 'bookCtaDescription', 'bookCtaBundlePrice', 'bookCtaCoursePrice', 'bookCtaBookPrice', 'coverImage'].forEach(
            function (key) {
              if (!data[key] && issueData[key]) data[key] = issueData[key];
            }
          );
        }
      } catch (mergeErr) {
        console.warn('[SbdLifeData] issue book CTA merge:', mergeErr.message || mergeErr);
      }
    }
    var entitlements = null;
    if (global.SbdLifeEntitlements) {
      entitlements = await global.SbdLifeEntitlements.loadEntitlements(ctx.user.uid);
      var access = global.SbdLifeEntitlements.canAccessArticle(data, ctx, entitlements);
      if (!access.allowed) {
        return {
          error: 'tier',
          ctx: ctx,
          required: access.required || data.tierRequired,
          entitlements: entitlements
        };
      }
      return { id: snap.id, data: data, ctx: ctx, entitlements: entitlements, access: access };
    }
    if (!canReadTier(data.tierRequired, ctx.tier, ctx.isAdmin)) {
      return { error: 'tier', ctx: ctx, required: data.tierRequired };
    }
    return { id: snap.id, data: data, ctx: ctx };
  }

  async function getIssue(slugOrId) {
    var ctx = await getViewerContext();
    if (!ctx.user) return { error: 'auth', ctx: ctx };
    var ref = firebase.firestore().collection('sbdLifeIssues').doc(slugOrId);
    var snap;
    try {
      snap = await ref.get();
    } catch (err) {
      if (err && err.code === 'permission-denied') {
        return { error: 'tier', ctx: ctx, required: 'restricted' };
      }
      throw err;
    }
    if (!snap.exists) return { error: 'not_found', ctx: ctx };
    var data = snap.data();
    data.id = snap.id;
    if (!ctx.isAdmin && data.archived === true) {
      return { error: 'archived', ctx: ctx };
    }
    var entitlements = null;
    if (global.SbdLifeEntitlements) {
      entitlements = await global.SbdLifeEntitlements.loadEntitlements(ctx.user.uid);
      var access = global.SbdLifeEntitlements.canAccessIssue(data, ctx, entitlements);
      if (!access.allowed) {
        return {
          error: 'tier',
          ctx: ctx,
          required: access.required || data.tierRequired,
          entitlements: entitlements
        };
      }
      return { id: snap.id, data: data, ctx: ctx, entitlements: entitlements, access: access };
    }
    if (!canReadTier(data.tierRequired, ctx.tier, ctx.isAdmin)) {
      return { error: 'tier', ctx: ctx, required: data.tierRequired };
    }
    return { id: snap.id, data: data, ctx: ctx };
  }

  async function listArticlesAdmin(limit) {
    var ctx = await getViewerContext();
    if (!ctx.isAdmin) return { error: 'forbidden', ctx: ctx, items: [] };
    var snap = await firebase
      .firestore()
      .collection('sbdLifeArticles')
      .limit(limit || 12)
      .get();
    var items = [];
    snap.forEach(function (doc) {
      items.push({ id: doc.id, data: doc.data() });
    });
    return { items: items, ctx: ctx };
  }

  async function listIssuesAdmin(limit) {
    var ctx = await getViewerContext();
    if (!ctx.isAdmin) return { error: 'forbidden', ctx: ctx, items: [] };
    var snap = await firebase
      .firestore()
      .collection('sbdLifeIssues')
      .limit(limit || 8)
      .get();
    var items = [];
    snap.forEach(function (doc) {
      items.push({ id: doc.id, data: doc.data() });
    });
    return { items: items, ctx: ctx };
  }

  async function deleteDocIfExists(ref) {
    try {
      var snap = await ref.get();
      if (snap.exists) await ref.delete();
    } catch (err) {
      /* ignore missing delete permission on absent docs */
    }
  }

  async function publishArticle(ref, article, now) {
    var draftArticle = Object.assign({}, article, { status: 'draft', updatedAt: now });
    await ref.set(draftArticle);
    await ref.update({ status: 'review', updatedAt: now });
    await ref.update({ status: 'scheduled', updatedAt: now });
    await ref.update({ status: 'published', updatedAt: now, publishedAt: now });
  }

  async function seedDemoContent(authorId) {
    var now = firebase.firestore.Timestamp.now();
    var db = firebase.firestore();
    var articleId = 'labs-demo-presence';
    var issueId = 'labs-demo-q1-presence';
    var eliteId = 'labs-demo-elite-covenant';

    // Re-seed: remove prior demo docs (admin) so create/transition rules apply cleanly.
    await deleteDocIfExists(db.collection('sbdLifeArticles').doc(articleId));
    await deleteDocIfExists(db.collection('sbdLifeArticles').doc(eliteId));
    await deleteDocIfExists(db.collection('sbdLifeIssues').doc(issueId));

    var article = {
      title: 'The Psychology of Presence',
      slug: articleId,
      excerpt:
        'Presence is not performance. It is the quiet alignment of identity, attention, and emotional intelligence.',
      contentType: 'feature_article',
      tierRequired: 'public',
      status: 'published',
      visibility: 'public',
      authorId: authorId,
      authorName: 'SBD Life Editorial',
      authorRole: 'editor',
      coverImage: '',
      estimatedReadTime: 8,
      contentBlocks: [
        {
          type: 'paragraph',
          text:
            'In a culture addicted to visibility, presence has become rare. Not because it is difficult — but because it requires integration.'
        },
        {
          type: 'pull_quote',
          text: 'Presence is the discipline of being fully here without needing to be fully seen.',
          attribution: 'SBD Life'
        },
        {
          type: 'paragraph',
          text:
            'When attraction is built on performance, relationships become auditions. Presence reverses that pattern. It invites depth.'
        },
        {
          type: 'heading',
          text: 'Formation over impression'
        },
        {
          type: 'paragraph',
          text:
            'The masculine and feminine archetypes are not costumes. They are expressions of inner order — and presence is how that order becomes visible.'
        }
      ],
      issueId: issueId,
      relatedMVHouseLooks: ['elegance-collection', 'presence-styling'],
      discussionEnabled: true,
      audioVersionAvailable: false,
      publishedAt: now,
      updatedAt: now
    };

    var issue = {
      title: 'The Presence Issue',
      slug: issueId,
      issueNumber: 1,
      theme: 'The Presence Issue',
      description: 'A quarterly formation on identity, attraction, and emotional intelligence.',
      tierRequired: 'public',
      releaseDate: now,
      archived: false,
      editorLetter:
        'Welcome to the first SBD Life quarterly. This issue is an invitation — not to consume more content, but to inhabit a more intelligent way of being.',
      featuredArticles: [articleId],
      issueColorTheme: '#c7a45b',
      printEditionAvailable: true
    };

    var articleRef = db.collection('sbdLifeArticles').doc(articleId);
    var issueRef = db.collection('sbdLifeIssues').doc(issueId);
    var eliteRef = db.collection('sbdLifeArticles').doc(eliteId);

    await publishArticle(articleRef, article, now);
    await issueRef.set(issue);

    var reflectionRef = await db.collection('sbdLifeDiscussions').add({
      articleId: articleId,
      userId: authorId,
      content: 'Presence is not performance — it is integrated identity made visible.',
      reflectionType: 'insight',
      moderationStatus: 'pending',
      tier: 'public',
      engagementScore: 1,
      createdAt: now
    });
    await reflectionRef.update({ moderationStatus: 'approved' });

    var eliteArticle = {
      title: 'The Covenant Frame (Elite Essay)',
      slug: eliteId,
      excerpt: 'Elite editorial — formation depth on covenant, attraction, and legacy.',
      contentType: 'elite_essay',
      tierRequired: 'elite',
      status: 'published',
      visibility: 'public',
      authorId: authorId,
      authorName: 'SBD Life Editorial',
      issueId: issueId,
      contentBlocks: [
        {
          type: 'paragraph',
          text: 'Covenant is not constraint. It is the architecture that makes freedom meaningful.'
        }
      ],
      publishedAt: now,
      updatedAt: now,
      discussionEnabled: true
    };
    await publishArticle(eliteRef, eliteArticle, now);

    await db.collection('sbdLifeAudio').doc(articleId).set({
      articleId: articleId,
      narrationMode: 'browser',
      audioUrl: '',
      narrator: 'SBD Life Editorial Voice',
      tierRequired: 'public',
      updatedAt: now,
      generatedBy: 'browser-tts-v3-editorial',
      cost: 'free'
    });

    await db.collection('sbdLifeQuotes').doc(articleId + '-q1').set({
      articleId: articleId,
      quote: 'Presence is the discipline of being fully here without needing to be fully seen.',
      shareCount: 0,
      engagementScore: 10,
      createdAt: now
    });
    await db.collection('sbdLifeQuotes').doc(articleId + '-q2').set({
      articleId: articleId,
      quote: 'Formation over impression — identity before audience.',
      shareCount: 0,
      engagementScore: 6,
      createdAt: now
    });

    await db.collection('sbdLifeTrending').doc('featured').set({
      title: 'Featured',
      articleIds: [articleId, eliteId],
      weights: { completion: 0.3, saves: 0.25, shares: 0.2, reflections: 0.15, revisits: 0.1 },
      updatedAt: now,
      curated: true
    });
    await db.collection('sbdLifeTrending').doc('culture').set({
      title: 'Culture & Presence',
      articleIds: [articleId],
      updatedAt: now,
      curated: true
    });

    await db.collection('sbdLifeArticles').doc(articleId).update({
      audioVersionAvailable: true,
      shareQuote: 'Presence is the discipline of being fully here without needing to be fully seen.'
    });

    return { articleId: articleId, issueId: issueId, eliteArticleId: eliteId };
  }

  function catalogEntryFromArticle(articleId, data) {
    return {
      id: articleId,
      title: data.title || articleId,
      contentType: data.contentType || 'feature_article',
      tierRequired: data.tierRequired || 'public',
      issueId: data.issueId || null,
      coverImage: data.coverImage || ''
    };
  }

  async function writeMemberDiscoveryRails(catalogEntries, issueId, now) {
    var db = firebase.firestore();
    var articleIds = catalogEntries.map(function (e) {
      return e.id;
    });
    await db.collection('sbdLifeTrending').doc('featured').set({
      title: 'Featured',
      articleIds: articleIds,
      issueIds: issueId ? [issueId] : [],
      catalog: catalogEntries,
      weights: { completion: 0.3, saves: 0.25, shares: 0.2, reflections: 0.15, revisits: 0.1 },
      updatedAt: now,
      curated: true,
      memberSafe: true
    });
    await db.collection('sbdLifeTrending').doc('culture').set({
      title: 'Culture & Attraction',
      articleIds: articleIds.slice(0, 4),
      catalog: catalogEntries.slice(0, 4),
      updatedAt: now,
      curated: true,
      memberSafe: true
    });
  }

  async function syncMemberDiscoveryRails() {
    if (!global.SbdLifeEditorialCrisis) {
      throw new Error('Editorial module not loaded');
    }
    var editorial = global.SbdLifeEditorialCrisis;
    var db = firebase.firestore();
    var snap = await db.collection('sbdLifeArticles').doc(editorial.ARTICLE_ID).get();
    if (!snap.exists) {
      throw new Error('Publish the crisis editorial first.');
    }
    var now = firebase.firestore.Timestamp.now();
    await writeMemberDiscoveryRails(
      [catalogEntryFromArticle(editorial.ARTICLE_ID, snap.data())],
      editorial.ISSUE_ID,
      now
    );
    return { articleId: editorial.ARTICLE_ID, issueId: editorial.ISSUE_ID };
  }

  async function publishEditorialModule(editorial, authorId, options) {
    options = options || {};
    if (!editorial || !editorial.ARTICLE_ID || !editorial.ISSUE_ID) {
      throw new Error('Invalid editorial module');
    }
    var articleId = editorial.ARTICLE_ID;
    var issueId = editorial.ISSUE_ID;
    var now = firebase.firestore.Timestamp.now();
    var db = firebase.firestore();

    await deleteDocIfExists(db.collection('sbdLifeArticles').doc(articleId));
    await deleteDocIfExists(db.collection('sbdLifeIssues').doc(issueId));

    var article = editorial.articlePayload(authorId, now);
    var issue = editorial.issuePayload(now);
    var articleRef = db.collection('sbdLifeArticles').doc(articleId);
    var issueRef = db.collection('sbdLifeIssues').doc(issueId);

    await publishArticle(articleRef, article, now);
    await issueRef.set(issue);

    await db.collection('sbdLifeAudio').doc(articleId).set({
      articleId: articleId,
      narrationMode: 'browser',
      audioUrl: '',
      narrator: 'SBD Life Editorial Voice',
      tierRequired: article.tierRequired || 'public',
      updatedAt: now,
      generatedBy: 'browser-tts-v3-editorial',
      cost: 'free',
    });

    var quoteList =
      typeof editorial.quotes === 'function'
        ? editorial.quotes()
        : options.quotes || [];
    for (var i = 0; i < quoteList.length; i++) {
      var q = quoteList[i];
      await db.collection('sbdLifeQuotes').doc(articleId + '-' + (q.id || 'q' + (i + 1))).set({
        articleId: articleId,
        quote: q.text || q.quote,
        shareCount: 0,
        engagementScore: q.engagementScore || 10 - i,
        createdAt: now,
      });
    }

    if (options.updateDiscovery !== false) {
      await writeMemberDiscoveryRails([catalogEntryFromArticle(articleId, article)], issueId, now);
    }

    return { articleId: articleId, issueId: issueId };
  }

  async function publishCrisisEditorial(authorId) {
    if (!global.SbdLifeEditorialCrisis) {
      throw new Error('Editorial module not loaded');
    }
    return publishEditorialModule(global.SbdLifeEditorialCrisis, authorId);
  }

  async function publishWomanWifeMotherEditorial(authorId) {
    if (!global.SbdLifeEditorialWomanWifeMother) {
      throw new Error('Editorial module not loaded');
    }
    return publishEditorialModule(global.SbdLifeEditorialWomanWifeMother, authorId);
  }

  global.SbdLifeData = {
    tierRank: tierRank,
    canReadTier: canReadTier,
    getViewerContext: getViewerContext,
    getArticle: getArticle,
    getIssue: getIssue,
    listArticlesAdmin: listArticlesAdmin,
    listIssuesAdmin: listIssuesAdmin,
    seedDemoContent: seedDemoContent,
    publishCrisisEditorial: publishCrisisEditorial,
    publishWomanWifeMotherEditorial: publishWomanWifeMotherEditorial,
    syncMemberDiscoveryRails: syncMemberDiscoveryRails
  };
})(window);
