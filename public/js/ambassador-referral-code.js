/**
 * Canonical recruiter code format for ambassador registration (AMB- / RD- / SNR-).
 * Does not create accounts or skip admin approval — only normalizes text before save.
 */
(function (global) {
  'use strict';

  var PREFIX_RE = /^(AMB|RD|SNR)([_-]|$)/;

  /**
   * @param {string} raw
   * @returns {string}
   */
  function normalizeReferralCode(raw) {
    var c = String(raw || '').trim().toUpperCase();
    if (!c) return '';
    if (PREFIX_RE.test(c)) {
      c = c.replace(/_/g, '-');
    }
    return c.replace(/-+/g, '-');
  }

  /**
   * @param {object} data ambassador session / ambassador_data payload
   * @param {string} [recruiterRaw] optional explicit recruiter code
   * @returns {object}
   */
  function applyRecruiterToAmbassadorData(data, recruiterRaw) {
    var out = Object.assign({}, data || {});
    var recruiter = normalizeReferralCode(
      recruiterRaw || out.recruitedBy || out.regional_director_code || out.regional_director || ''
    );
    if (!recruiter) {
      out.recruitedBy = '';
      return out;
    }

    out.recruitedBy = recruiter;
    if (recruiter.indexOf('RD-') === 0) {
      out.regional_director_code = recruiter;
      out.regional_director = recruiter;
      out.senior_code = out.senior_code || '';
      out.recruited_by_type = out.recruited_by_type || 'regional_director';
    } else if (recruiter.indexOf('AMB-') === 0 || recruiter.indexOf('SNR-') === 0) {
      out.senior_code = recruiter;
      out.regional_director_code = out.regional_director_code || '';
      out.regional_director = out.regional_director || '';
      out.recruited_by_type = out.recruited_by_type || 'senior_ambassador';
    }
    return out;
  }

  global.MEAmbassadorReferralCode = {
    normalizeReferralCode: normalizeReferralCode,
    applyRecruiterToAmbassadorData: applyRecruiterToAmbassadorData
  };
})(typeof window !== 'undefined' ? window : global);
