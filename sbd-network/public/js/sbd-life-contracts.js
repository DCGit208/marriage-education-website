/**
 * SBD Life Phase 1 — canonical enums + client-side contract validation (mirrors Firestore rules intent).
 */
(function (global) {
  var ENUMS = {
    articleStatus: ['draft', 'review', 'scheduled', 'published', 'archived', 'hidden'],
    accessTier: ['public', 'foundation', 'premium', 'elite', 'admin'],
    reflectionType: ['reflection', 'insight', 'question', 'debate', 'experience', 'mentor_response'],
    moderationStatus: ['pending', 'approved', 'hidden', 'flagged'],
    reactionType: [
      'thought-provoking',
      'powerful',
      'challenging',
      'eye-opening',
      'transformative',
      'emotionally-resonant',
      'insightful'
    ],
    contentType: [
      'feature_article',
      'hot_topic',
      'elite_essay',
      'audio_essay',
      'visual_editorial',
      'debate',
      'confession',
      'dating_analysis',
      'style_feature',
      'cultural_commentary',
      'sbd_life_now',
      'issue'
    ]
  };

  var STATUS_TRANSITIONS = {
    draft: ['draft', 'review'],
    review: ['review', 'draft', 'scheduled'],
    scheduled: ['scheduled', 'review', 'published'],
    published: ['published', 'archived', 'hidden'],
    archived: ['archived', 'published', 'hidden'],
    hidden: ['hidden', 'published', 'archived']
  };

  function hasRequired(data, fields) {
    if (!data || typeof data !== 'object') return false;
    return fields.every(function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) && data[key] != null && data[key] !== '';
    });
  }

  function canTransition(fromStatus, toStatus) {
    var allowed = STATUS_TRANSITIONS[fromStatus];
    if (!allowed) return false;
    return allowed.indexOf(toStatus) !== -1;
  }

  function validateArticlePayload(data, options) {
    options = options || {};
    var errors = [];
    var required = [
      'title',
      'slug',
      'contentType',
      'tierRequired',
      'status',
      'authorId',
      'updatedAt'
    ];

    if (!hasRequired(data, required)) {
      errors.push('Missing required article fields.');
    }
    if (data.title && String(data.title).length > 240) errors.push('title too long');
    if (data.slug && String(data.slug).length > 160) errors.push('slug too long');
    if (data.contentType && ENUMS.contentType.indexOf(data.contentType) === -1) {
      errors.push('invalid contentType');
    }
    if (data.tierRequired && ENUMS.accessTier.indexOf(data.tierRequired) === -1) {
      errors.push('invalid tierRequired');
    }
    if (data.status && ENUMS.articleStatus.indexOf(data.status) === -1) {
      errors.push('invalid status');
    }

    if (!options.isUpdate && data.status && ['draft', 'review'].indexOf(data.status) === -1) {
      errors.push('new articles must start as draft or review');
    }

    if (options.isUpdate && options.previousStatus && data.status) {
      if (!canTransition(options.previousStatus, data.status)) {
        errors.push('invalid status transition: ' + options.previousStatus + ' -> ' + data.status);
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function validateDiscussionPayload(data) {
    var errors = [];
    var required = [
      'articleId',
      'userId',
      'content',
      'reflectionType',
      'moderationStatus',
      'createdAt',
      'tier'
    ];
    if (!hasRequired(data, required)) errors.push('Missing required discussion fields.');
    if (data.reflectionType && ENUMS.reflectionType.indexOf(data.reflectionType) === -1) {
      errors.push('invalid reflectionType');
    }
    if (data.moderationStatus && ENUMS.moderationStatus.indexOf(data.moderationStatus) === -1) {
      errors.push('invalid moderationStatus');
    }
    if (data.content && String(data.content).length > 4000) errors.push('content too long');
    return { ok: errors.length === 0, errors: errors };
  }

  global.SbdLifeContracts = {
    ENUMS: ENUMS,
    STATUS_TRANSITIONS: STATUS_TRANSITIONS,
    canTransition: canTransition,
    validateArticlePayload: validateArticlePayload,
    validateDiscussionPayload: validateDiscussionPayload
  };
})(window);
