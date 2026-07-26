/**
 * SBD Life Phase 4 — entitlement resolver (tier + subscription + issue purchase).
 */
(function (global) {
  var SHOP_PRODUCTS = {
    annual: 'sbd-magazine-annual-subscription',
    singleIssue: 'sbd-magazine-single-issue',
    archive: 'sbd-digital-archive-access',
    womanWifeMotherBook: 'the-woman-the-wife-the-mother-book',
    womanWifeMotherCourse: 'the-woman-the-wife-the-mother-course',
    womanWifeMotherBundle: 'the-woman-the-wife-the-mother-bundle',
  };

  var WWM_ACCESS_PRODUCT_IDS = [
    'the-woman-the-wife-the-mother-book',
    'the-woman-the-wife-the-mother-course',
    'the-woman-the-wife-the-mother-bundle',
    'the-woman-the-wife-the-mother',
  ];

  var WWM_ISSUE_ID = 'issue-woman-wife-mother-2026';
  var WWM_ARTICLE_SLUG = 'the-woman-the-wife-the-mother';

  function hasWwmProductAccess(entitlements) {
    var owned = (entitlements && entitlements.ownedProducts) || [];
    for (var i = 0; i < WWM_ACCESS_PRODUCT_IDS.length; i++) {
      if (owned.indexOf(WWM_ACCESS_PRODUCT_IDS[i]) !== -1) return true;
    }
    return false;
  }

  function isWwmEditorial(articleOrIssue) {
    if (!articleOrIssue) return false;
    return (
      articleOrIssue.slug === WWM_ARTICLE_SLUG ||
      articleOrIssue.id === WWM_ARTICLE_SLUG ||
      articleOrIssue.issueId === WWM_ISSUE_ID ||
      articleOrIssue.slug === WWM_ISSUE_ID ||
      articleOrIssue.id === WWM_ISSUE_ID
    );
  }

  function renderBookCta(data, esc) {
    if (!data || !data.bookProductId) return '';
    var escFn =
      typeof esc === 'function'
        ? esc
        : function (s) {
            var d = document.createElement('div');
            d.textContent = s || '';
            return d.innerHTML;
          };
    var label = data.bookCtaLabel || 'The Woman, The Wife, The Mother';
    var desc = data.bookCtaDescription || '';
    var bundlePrice = data.bookCtaBundlePrice || '$300';
    var coursePrice = data.bookCtaCoursePrice || '$250';
    var bookPrice = data.bookCtaBookPrice || '$50';
    var bundleId = data.bookProductId || SHOP_PRODUCTS.womanWifeMotherBundle;
    return (
      '<section class="life-book-cta">' +
      '<div class="life-book-cta-body">' +
      '<p class="kicker">Formation</p>' +
      '<h2 class="life-book-cta-title">' +
      escFn(label) +
      '</h2>' +
      (desc ? '<p class="life-book-cta-desc">' + escFn(desc) + '</p>' : '') +
      '<div class="life-book-cta-actions">' +
      '<a class="btn-primary life-book-cta-btn" href="' +
      checkoutUrl(bundleId) +
      '">Book + Course — ' +
      escFn(bundlePrice) +
      '</a>' +
      '<a class="btn-secondary life-book-cta-btn" href="' +
      checkoutUrl(SHOP_PRODUCTS.womanWifeMotherCourse) +
      '">Course — ' +
      escFn(coursePrice) +
      '</a>' +
      '<a class="btn-secondary life-book-cta-btn" href="' +
      checkoutUrl(SHOP_PRODUCTS.womanWifeMotherBook) +
      '">Book — ' +
      escFn(bookPrice) +
      '</a>' +
      '</div></div></section>'
    );
  }

  function tierRank(tier) {
    var map = { public: 0, foundation: 1, premium: 2, elite: 3, admin: 4 };
    return map[tier] != null ? map[tier] : 0;
  }

  async function loadEntitlements(uid) {
    var db = firebase.firestore();
    var subSnap;
    var userSnap;
    var purchaseSnap;
    try {
      subSnap = await db.collection('sbdLifeSubscriptions').doc(uid).get();
      userSnap = await db.collection('users').doc(uid).get();
      purchaseSnap = await db
        .collection('users')
        .doc(uid)
        .collection('sbdLifePurchasedIssues')
        .get();
    } catch (err) {
      console.warn('[SbdLifeEntitlements] load failed', err);
      return {
        annualActive: false,
        archiveActive: false,
        purchasedIssueIds: {},
        subscription: null,
        ownedProducts: []
      };
    }

    var purchasedIssueIds = {};
    purchaseSnap.forEach(function (doc) {
      purchasedIssueIds[doc.id] = true;
    });

    var sub = subSnap.exists ? subSnap.data() : null;
    var annualActive =
      sub &&
      sub.status === 'active' &&
      sub.userId === uid &&
      (!sub.expiresAt || sub.expiresAt.toMillis() > Date.now());

    var owned = userSnap.exists && Array.isArray(userSnap.data().ownedProducts)
      ? userSnap.data().ownedProducts
      : [];

    if (!annualActive && owned.indexOf(SHOP_PRODUCTS.annual) !== -1) {
      annualActive = true;
    }
    if (!annualActive && owned.indexOf(SHOP_PRODUCTS.archive) !== -1) {
      annualActive = true;
    }

    var archiveActive = annualActive || !!(sub && sub.archiveAccess) || owned.indexOf(SHOP_PRODUCTS.archive) !== -1;

    return {
      annualActive: annualActive,
      archiveActive: archiveActive,
      purchasedIssueIds: purchasedIssueIds,
      subscription: sub,
      ownedProducts: owned
    };
  }

  async function syncFromCheckoutSession(sessionId, productId) {
    if (!sessionId || !productId) return null;
    var fn = firebase.functions().httpsCallable('syncSbdLifeShopEntitlement');
    return fn({ sessionId: sessionId, productId: productId });
  }

  function canAccessByTier(tierRequired, userTier, isAdmin) {
    if (isAdmin) return true;
    return tierRank(userTier || 'public') >= tierRank(tierRequired || 'public');
  }

  function canAccessArticle(article, ctx, entitlements) {
    if (!article) return { allowed: false, reason: 'missing' };
    if (ctx.isAdmin) return { allowed: true, reason: 'admin' };
    if (article.status !== 'published' || article.visibility === 'hidden') {
      return { allowed: false, reason: 'unpublished' };
    }
    if (isWwmEditorial(article)) {
      if (hasWwmProductAccess(entitlements)) {
        return { allowed: true, reason: 'product' };
      }
      if (article.issueId && entitlements.purchasedIssueIds[article.issueId]) {
        return { allowed: true, reason: 'issue_purchase' };
      }
      return { allowed: false, reason: 'purchase_required' };
    }
    if (canAccessByTier(article.tierRequired, ctx.tier, false)) {
      return { allowed: true, reason: 'tier' };
    }
    if (entitlements.annualActive) {
      return { allowed: true, reason: 'annual_subscription' };
    }
    if (article.issueId && entitlements.purchasedIssueIds[article.issueId]) {
      return { allowed: true, reason: 'issue_purchase' };
    }
    return { allowed: false, reason: 'tier', required: article.tierRequired || 'public' };
  }

  function canAccessIssue(issue, ctx, entitlements) {
    if (!issue) return { allowed: false, reason: 'missing' };
    if (ctx.isAdmin) return { allowed: true, reason: 'admin' };
    if (issue.archived) return { allowed: false, reason: 'archived' };
    if (isWwmEditorial(issue)) {
      if (hasWwmProductAccess(entitlements)) {
        return { allowed: true, reason: 'product' };
      }
      if (entitlements.purchasedIssueIds[issue.id || issue.slug]) {
        return { allowed: true, reason: 'issue_purchase' };
      }
      return { allowed: false, reason: 'purchase_required' };
    }
    if (canAccessByTier(issue.tierRequired, ctx.tier, false)) {
      return { allowed: true, reason: 'tier' };
    }
    if (entitlements.annualActive) {
      return { allowed: true, reason: 'annual_subscription' };
    }
    if (entitlements.purchasedIssueIds[issue.id || issue.slug]) {
      return { allowed: true, reason: 'issue_purchase' };
    }
    return { allowed: false, reason: 'tier', required: issue.tierRequired || 'public' };
  }

  function checkoutUrl(productId) {
    return '/checkout.html?product=' + encodeURIComponent(productId);
  }

  async function grantAnnualSubscription(uid, plan) {
    var now = firebase.firestore.Timestamp.now();
    var expires = firebase.firestore.Timestamp.fromMillis(
      Date.now() + 365 * 24 * 60 * 60 * 1000
    );
    return firebase
      .firestore()
      .collection('sbdLifeSubscriptions')
      .doc(uid)
      .set({
        userId: uid,
        plan: plan || 'annual',
        status: 'active',
        productId: SHOP_PRODUCTS.annual,
        archiveAccess: plan === 'archive',
        source: 'labs_grant',
        startedAt: now,
        expiresAt: expires,
        updatedAt: now
      });
  }

  async function grantIssuePurchase(uid, issueId) {
    var now = firebase.firestore.Timestamp.now();
    return firebase
      .firestore()
      .collection('users')
      .doc(uid)
      .collection('sbdLifePurchasedIssues')
      .doc(issueId)
      .set({
        userId: uid,
        issueId: issueId,
        productId: SHOP_PRODUCTS.singleIssue,
        status: 'active',
        source: 'labs_grant',
        purchasedAt: now
      });
  }

  global.SbdLifeEntitlements = {
    SHOP_PRODUCTS: SHOP_PRODUCTS,
    loadEntitlements: loadEntitlements,
    canAccessArticle: canAccessArticle,
    canAccessIssue: canAccessIssue,
    checkoutUrl: checkoutUrl,
    renderBookCta: renderBookCta,
    syncFromCheckoutSession: syncFromCheckoutSession,
    grantAnnualSubscription: grantAnnualSubscription,
    grantIssuePurchase: grantIssuePurchase
  };
})(window);
