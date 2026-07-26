/**
 * SBD §F1 Ontology — reusable formation spine (visual + author reference).
 * Embed in markdown: [[f1-spine]] | [[f1-spine:recall]] | [[f1-spine:reference]] | [[integration-law]]
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var TREE_SVG = '<svg class="f1-tree-svg" viewBox="0 0 120 100" aria-hidden="true" focusable="false">'
    + '<path class="f1-tree-trunk" d="M60 72 L60 48" />'
    + '<circle class="f1-tree-crown" cx="60" cy="36" r="22" />'
    + '<circle class="f1-tree-fruit" cx="78" cy="58" r="7" />'
    + '<path class="f1-tree-stem" d="M68 52 Q74 54 78 58" />'
    + '</svg>';

  function layerCard(num, title, bodyHtml, extraClass) {
    return '<div class="f1-layer f1-layer--' + esc(num) + (extraClass ? ' ' + extraClass : '') + '">'
      + '<div class="f1-layer-badge">Layer ' + esc(num) + '</div>'
      + '<h4 class="f1-layer-title">' + esc(title) + '</h4>'
      + '<div class="f1-layer-body">' + bodyHtml + '</div>'
      + '</div>';
  }

  function renderDesignLayer(compact) {
    var treeBlock = compact
      ? '<p class="f1-lead"><strong>Sexuality</strong> is the tree — identity, body, and covenant lifestyle. <strong>Sex</strong> is the fruit — the conjugal act. Identity donates the act; never the reverse.</p>'
      : '<div class="f1-tree-row">' + TREE_SVG
        + '<div class="f1-tree-copy">'
        + '<p><span class="f1-term">Sexuality</span> = the <strong>tree</strong> — state, nature, lifestyle, atmosphere (Gen 1:27).</p>'
        + '<p><span class="f1-term">Sex</span> = the <strong>fruit</strong> — conjugal act, harvest from the tree.</p>'
        + '<p class="f1-rule">Sexuality <em>donates</em> sex — not the reverse.</p>'
        + '</div></div>';
    return layerCard('0', 'Design — what you are', treeBlock);
  }

  function renderMarriageLayer(compact) {
    var body = compact
      ? '<p>Marriage <strong>is</strong> conjugal-sexual covenant from the start — not cohabitation, not certificate then sex later.</p>'
        + '<ul class="f1-equations">'
        + '<li><span>Marriage</span> = <span>Sexuality</span> = <span>Nakedness</span></li>'
        + '<li><span>Sex</span> = marriage enacted in the body (Gen 2:24; 1 Cor 6:16)</li>'
        + '</ul>'
      : '<p class="f1-lead">Marriage <strong>is</strong> conjugal-sexual covenant — not roommates with a certificate, not a pre-sexual partnership “completed” later by sex. The certificate <em>witnesses</em>; it does not invent marriage.</p>'
        + '<div class="f1-equation-grid">'
        + '<div class="f1-eq-card"><span class="f1-eq-label">Marriage = Sexuality</span><span class="f1-eq-desc">Total sharing of sexual life between spouses</span></div>'
        + '<div class="f1-eq-card"><span class="f1-eq-label">Marriage = Nakedness</span><span class="f1-eq-desc">Covenant openness — Gen 2:25 order</span></div>'
        + '<div class="f1-eq-card f1-eq-card--wide"><span class="f1-eq-label">Sex = Marriage enacted</span><span class="f1-eq-desc">The conjugal act is one-flesh covenant lived in the body (Gen 2:24; 1 Cor 6:16)</span></div>'
        + '</div>';
    return layerCard('1', 'Marriage — what marriage is', body);
  }

  function renderIntegrationLayer(compact) {
    var body = '<div class="f1-stack">'
      + '<div class="f1-stack-item f1-stack-item--woman"><span class="f1-stack-label">Muliebrity</span><span class="f1-stack-desc">Teleios woman in full conscious female operation — fit for covenant</span></div>'
      + '<div class="f1-stack-arrow" aria-hidden="true">↓</div>'
      + '<div class="f1-stack-item f1-stack-item--wife"><span class="f1-stack-label">Wife</span><span class="f1-stack-desc">Womanhood in one-flesh matrimony — conjugal sexuality, due benevolence, covenant helper (Gen 2:18; 1 Cor 7:3–4)</span></div>'
      + '<div class="f1-stack-arrow" aria-hidden="true">↓</div>'
      + '<div class="f1-stack-item f1-stack-item--mother"><span class="f1-stack-label">Mother</span><span class="f1-stack-desc">Wifehood extended in the generative family unit</span></div>'
      + '</div>';
    if (!compact) {
      body += '<p class="f1-footnote">One teleios woman; three covenant <em>expressions</em> — not three competing identities. Lose womanhood and wifehood and motherhood lose covenant meaning.</p>';
    }
    return layerCard('2', 'Integration — Woman → Wife → Mother', body);
  }

  function renderF1Spine(variant) {
    var v = (variant || 'full').toLowerCase();
    var compact = v === 'recall';
    var showRef = v === 'full';
    var html = '<figure class="f1-spine" role="group" aria-labelledby="f1-spine-title-' + v + '">'
      + '<figcaption class="f1-spine-header" id="f1-spine-title-' + v + '">'
      + '<span class="f1-spine-kicker">§F1 Program Spine</span>'
      + '<span class="f1-spine-title">' + (compact ? 'Integration recall' : 'Sex by Design — read top to bottom') + '</span>'
      + '</figcaption>'
      + '<div class="f1-spine-layers">'
      + renderDesignLayer(compact)
      + '<div class="f1-connector" aria-hidden="true"><span></span></div>'
      + renderMarriageLayer(compact)
      + '<div class="f1-connector" aria-hidden="true"><span></span></div>'
      + renderIntegrationLayer(compact)
      + '</div>';
    if (showRef) {
      html += renderAuthorReference(true);
    }
    html += '</figure>';
    return html;
  }

  function renderAuthorReference(inline) {
    var inner = '<pre class="f1-ref-pre"><code>'
      + 'DESIGN:     Sexuality = TREE  →  Sex = FRUIT  (sexuality donates sex)\n'
      + 'MARRIAGE:   Marriage IS conjugal-sexual covenant — not cohabitation, not certificate + sex later\n'
      + 'EQUATIONS:  Marriage = Sexuality = Nakedness  |  Sex = Marriage enacted (Gen 2:24; 1 Cor 6:16)\n'
      + 'MULIEBRITY: Teleios woman in full conscious female operation — fit for covenant\n'
      + 'WIFE:       Womanhood in one-flesh matrimony — conjugal sexuality, due benevolence, covenant life\n'
      + 'MOTHER:     Wifehood extended in the generative family unit'
      + '</code></pre>';
    if (inline) {
      return '<details class="f1-author-ref">'
        + '<summary>Author / Canon AI reference (compressed spine)</summary>'
        + inner
        + '</details>';
    }
    return '<details class="f1-author-ref f1-author-ref--solo">'
      + '<summary>§F1 compressed reference</summary>'
      + inner
      + '</details>';
  }

  function renderIntegrationLaw() {
    return '<figure class="f1-spine f1-integration-law" role="group" aria-labelledby="f1-integration-title">'
      + '<figcaption class="f1-spine-header" id="f1-integration-title">'
      + '<span class="f1-spine-kicker">Integration law</span>'
      + '<span class="f1-spine-title">One woman — three expressions</span>'
      + '</figcaption>'
      + '<div class="f1-stack f1-stack--law">'
      + '<div class="f1-stack-item f1-stack-item--woman"><span class="f1-stack-label">Womanhood</span><span class="f1-stack-desc">Foundation — teleios female design</span></div>'
      + '<div class="f1-stack-arrow" aria-hidden="true">↓</div>'
      + '<div class="f1-stack-item f1-stack-item--wife"><span class="f1-stack-label">Wife</span><span class="f1-stack-desc">Lives <em>in</em> the woman — one-flesh conjugal union</span></div>'
      + '<div class="f1-stack-arrow" aria-hidden="true">↓</div>'
      + '<div class="f1-stack-item f1-stack-item--mother"><span class="f1-stack-label">Mother</span><span class="f1-stack-desc">Lives <em>in</em> the wife — generative family</span></div>'
      + '</div>'
      + '<p class="f1-law-warning">Lose womanhood to “wife” or “mother” alone → lose woman, wife, <em>and</em> mother. Period.</p>'
      + '</figure>';
  }

  var SHORTCODE_MARKERS = {
    '__SHORTCODE_F1_FULL__': function () { return renderF1Spine('full'); },
    '__SHORTCODE_F1_RECALL__': function () { return renderF1Spine('recall'); },
    '__SHORTCODE_F1_REFERENCE__': function () { return renderAuthorReference(false); },
    '__SHORTCODE_INTEGRATION_LAW__': function () { return renderIntegrationLaw(); },
  };

  function expandShortcodes(md) {
    if (!md) return '';
    var text = String(md);
    text = text.replace(/\[\[f1-spine(?::(full|recall|reference))?\]\]/gi, function (_m, variant) {
      var v = (variant || 'full').toLowerCase();
      return '\n\n__SHORTCODE_F1_' + v.toUpperCase() + '__\n\n';
    });
    text = text.replace(/\[\[integration-law\]\]/gi, '\n\n__SHORTCODE_INTEGRATION_LAW__\n\n');
    return text;
  }

  function renderShortcodeLine(trimmed) {
    if (SHORTCODE_MARKERS[trimmed]) return SHORTCODE_MARKERS[trimmed]();
    return null;
  }

  global.CanonF1Spine = {
    render: renderF1Spine,
    renderIntegrationLaw: renderIntegrationLaw,
    renderAuthorReference: renderAuthorReference,
    expandShortcodes: expandShortcodes,
    renderShortcodeLine: renderShortcodeLine,
  };
})(typeof window !== 'undefined' ? window : global);
