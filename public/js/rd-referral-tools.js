/**
 * Regional Director referral and sharing tools (parity with ambassador dashboard).
 */
(function (global) {
  'use strict';

  let rdData = null;

  function getRefCode() {
    if (!rdData) return '';
    return rdData.ambassador_code || rdData.code || '';
  }

  function getRdCode() {
    if (!rdData) return '';
    return rdData.code || '';
  }

  function getPrimaryReferralLink() {
    return 'https://marriageducation.com/sbd-campaign.html?ref=' +
      encodeURIComponent(getRefCode()) + '&rd=' + encodeURIComponent(getRdCode());
  }

  function getRecruitmentLink() {
    return 'https://marriageducation.com/ambassador-register.html?rd=' +
      encodeURIComponent(getRdCode());
  }

  function getPortfolioLinks(refCode) {
    const ref = encodeURIComponent(refCode || getRefCode());
    const rd = encodeURIComponent(getRdCode());
    const rdParam = rd ? '&rd=' + rd : '';
    const base = 'https://marriageducation.com';
    return [
      { key: 'books', label: 'Books', icon: '\uD83D\uDCDA', url: base + '/sbd-campaign.html?ref=' + ref + rdParam + '&category=books' },
      { key: 'schools', label: 'Schools', icon: '\uD83C\uDF93', url: base + '/schools.html?ref=' + ref + rdParam + '&category=schools' },
      { key: 'courses', label: 'Courses', icon: '\uD83D\uDCD6', url: base + '/courses.html?ref=' + ref + rdParam + '&category=courses' },
      { key: 'premium', label: 'Premium', icon: '\uD83D\uDCBC', url: base + '/payment.html?ref=' + ref + rdParam + '&category=premium' },
      { key: 'corporate', label: 'Corporate', icon: '\uD83C\uDFE2', url: base + '/corporate.html?ref=' + ref + rdParam + '&category=corporate' },
      { key: 'community', label: 'Community', icon: '\uD83E\uDD1D', url: base + '/resources.html?ref=' + ref + rdParam + '&category=community' },
      { key: 'recruitment', label: 'Recruitment', icon: '\uD83D\uDC65', url: base + '/ambassador-register.html?rd=' + rd + '&category=recruitment' }
    ];
  }

  function copyText(text, successLabel) {
    const value = String(text || '').trim();
    if (!value) return;
    navigator.clipboard.writeText(value)
      .then(function () { alert(successLabel || '\u2705 Link copied!'); })
      .catch(function () {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert(successLabel || '\u2705 Link copied!');
      });
  }

  function flashCopyButton(evt) {
    const btn = evt && evt.target ? evt.target.closest('.copy-btn') : null;
    if (!btn) return;
    const prev = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    btn.classList.add('copied');
    setTimeout(function () {
      btn.innerHTML = prev;
      btn.classList.remove('copied');
    }, 2000);
  }

  function loadPortfolioReferralLinks() {
    const container = document.getElementById('portfolioReferralLinks');
    if (!container) return;
    container.innerHTML = '';
    const links = getPortfolioLinks(getRefCode());

    links.forEach(function (item) {
      const card = document.createElement('div');
      card.style.cssText = 'background:white;border:1px solid #ecf0f1;border-radius:12px;padding:1rem;box-shadow:0 2px 12px rgba(0,0,0,0.05);display:flex;flex-direction:column;gap:0.75rem;';

      const head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:0.75rem;';

      const title = document.createElement('span');
      title.style.cssText = 'font-weight:700;color:#333;';
      title.textContent = item.icon + ' ' + item.label;

      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:0.75rem;background:#eef2ff;color:#4f46e5;padding:4px 10px;border-radius:999px;';
      badge.textContent = item.key;

      head.appendChild(title);
      head.appendChild(badge);

      const urlBox = document.createElement('div');
      urlBox.style.cssText = 'font-family:monospace;font-size:0.78rem;color:#636e72;word-break:break-all;background:#f8f9fa;border-radius:8px;padding:0.75rem;';
      urlBox.textContent = item.url;

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:0.5rem;flex-wrap:wrap;';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'copy-btn';
      copyBtn.style.cssText = 'flex:1;min-width:110px;';
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
      copyBtn.addEventListener('click', function () {
        copyText(item.url, '\u2705 ' + item.label + ' referral link copied!');
      });

      const openLink = document.createElement('a');
      openLink.className = 'copy-btn';
      openLink.href = item.url;
      openLink.target = '_blank';
      openLink.rel = 'noopener';
      openLink.style.cssText = 'flex:1;min-width:110px;text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;';
      openLink.innerHTML = '<i class="fas fa-arrow-up-right-from-square"></i> Open';

      actions.appendChild(copyBtn);
      actions.appendChild(openLink);
      card.appendChild(head);
      card.appendChild(urlBox);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function loadSBDReferralPanel() {
    const section = document.getElementById('sbdReferralSection');
    if (!section || !rdData) return;
    const sbdCode = rdData.sbdReferralCode;
    if (!sbdCode) {
      section.style.display = 'none';
      return;
    }
    const linkEl = document.getElementById('sbdReferralLink');
    if (linkEl) linkEl.textContent = 'https://sbd-network.web.app/auth?ref=' + sbdCode;
    const referrals = rdData.sbdReferrals || {};
    function setCount(id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    }
    setCount('sbdSignupsCount', referrals.signups || 0);
    setCount('sbdSubscribersCount', referrals.subscribers || 0);
    setCount('sbdFoundationCount', referrals.foundation || 0);
    setCount('sbdPremiumCount', referrals.premium || 0);
    setCount('sbdEliteCount', referrals.elite || 0);
    const login = document.getElementById('sbdLoginLink');
    if (login) login.href = 'https://sbd-network.web.app';
    section.style.display = 'block';
  }

  function bindReferralUI(data) {
    rdData = data || null;
    const primary = document.getElementById('primaryReferralLink');
    const recruitment = document.getElementById('recruitmentLink');
    if (primary) primary.value = getPrimaryReferralLink();
    if (recruitment) recruitment.value = getRecruitmentLink();
    loadPortfolioReferralLinks();
    loadSBDReferralPanel();
  }

  function copyPrimaryReferralLink(evt) {
    copyText(getPrimaryReferralLink(), '\u2705 Primary deployment link copied!');
    flashCopyButton(evt);
  }

  function copyRecruitmentLink(evt) {
    const input = document.getElementById('recruitmentLink');
    if (input) { input.select(); try { document.execCommand('copy'); } catch (e) { /* noop */ } }
    copyText(getRecruitmentLink(), '\u2705 Recruitment link copied!');
    flashCopyButton(evt);
  }

  function copySBDReferralLink() {
    const el = document.getElementById('sbdReferralLink');
    if (el) copyText(el.textContent.trim(), '\u2705 SBD referral link copied!');
  }

  function sharePrimaryWhatsApp() {
    const link = getPrimaryReferralLink();
    const text = '\uD83D\uDD25 Transform your marriage with Sex By Design for Dummies!\n\nGet your copy here: ' + link;
    global.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }

  function sharePrimaryFacebook() {
    global.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(getPrimaryReferralLink()), '_blank');
  }

  function sharePrimaryInstagram() {
    const link = getPrimaryReferralLink();
    copyText(
      '\uD83D\uDD25 Transform your marriage!\n\nSex By Design for Dummies\n\nLink: ' + link + '\n\n#MarriageEducation',
      '\u2705 Instagram caption copied! Paste it with your post.'
    );
  }

  function shareRecruitmentWhatsApp() {
    const link = getRecruitmentLink();
    global.open('https://wa.me/?text=' + encodeURIComponent('Join my ambassador team! Register: ' + link), '_blank');
  }

  function shareRecruitmentFacebook() {
    global.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(getRecruitmentLink()), '_blank');
  }

  function shareRecruitmentInstagram() {
    copyText(
      'Join the Marriage Education ambassador team!\n\nRegister: ' + getRecruitmentLink() + '\n\n#MarriageEducation',
      '\u2705 Instagram caption copied! Paste it with your post.'
    );
  }

  global.RdReferralTools = {
    bindReferralUI: bindReferralUI,
    getPortfolioLinks: getPortfolioLinks,
    getPrimaryReferralLink: getPrimaryReferralLink,
    getRecruitmentLink: getRecruitmentLink
  };

  global.copyPrimaryReferralLink = copyPrimaryReferralLink;
  global.copyRecruitmentLink = copyRecruitmentLink;
  global.copySBDReferralLink = copySBDReferralLink;
  global.sharePrimaryWhatsApp = sharePrimaryWhatsApp;
  global.sharePrimaryFacebook = sharePrimaryFacebook;
  global.sharePrimaryInstagram = sharePrimaryInstagram;
  global.shareRecruitmentWhatsApp = shareRecruitmentWhatsApp;
  global.shareRecruitmentFacebook = shareRecruitmentFacebook;
  global.shareRecruitmentInstagram = shareRecruitmentInstagram;
})(typeof window !== 'undefined' ? window : global);
