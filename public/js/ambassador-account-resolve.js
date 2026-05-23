/**
 * Resolve login code → Firestore account (ambassadors and/or regional_directors).
 */
(function (global) {
  'use strict';

  function normEmail(e) {
    return (e || '').toString().trim().toLowerCase();
  }

  function emailsMatch(a, b) {
    return normEmail(a) === normEmail(b);
  }

  function normalizeRdStats(rdId, rd) {
    var stats = Object.assign({}, rd);
    stats.ambassador_type = stats.ambassador_type || 'regional_director';
    stats.code = stats.code || rdId;
    stats.rd_code = stats.rd_code || rdId;
    stats.rdCode = stats.rdCode || rdId;
    stats.regional_director_code = stats.regional_director_code || rdId;
    stats.fullName = stats.fullName || stats.name || 'Regional Director';
    stats.name = stats.name || stats.fullName;
    if (stats.commission_earned == null && stats.override_commission != null) {
      stats.commission_earned = stats.override_commission;
    }
    if (stats.sales_count == null && stats.team_books_sold != null) {
      stats.sales_count = stats.team_books_sold;
    }
    return stats;
  }

  async function tryAmbassadorDoc(db, code) {
    var doc = await db.collection('ambassadors').doc(code).get();
    if (doc.exists) {
      return { id: doc.id, stats: doc.data(), source: 'ambassadors' };
    }
    return null;
  }

  async function tryAmbassadorByField(db, code) {
    var fields = ['code', 'ambassador_code', 'rd_code', 'rdCode'];
    for (var i = 0; i < fields.length; i++) {
      var snap = await db.collection('ambassadors').where(fields[i], '==', code).limit(1).get();
      if (!snap.empty) {
        var d = snap.docs[0];
        return { id: d.id, stats: d.data(), source: 'ambassadors' };
      }
    }
    return null;
  }

  async function tryRegionalDirector(db, code) {
    var doc = await db.collection('regional_directors').doc(code).get();
    if (doc.exists) {
      return { id: doc.id, stats: normalizeRdStats(doc.id, doc.data()), source: 'regional_directors' };
    }
    var queries = [
      db.collection('regional_directors').where('code', '==', code).limit(1).get(),
      db.collection('regional_directors').where('rd_code', '==', code).limit(1).get()
    ];
    var snaps = await Promise.all(queries);
    for (var j = 0; j < snaps.length; j++) {
      if (!snaps[j].empty) {
        var d2 = snaps[j].docs[0];
        return { id: d2.id, stats: normalizeRdStats(d2.id, d2.data()), source: 'regional_directors' };
      }
    }
    return null;
  }

  async function mergeLinkedAmbassador(db, resolved) {
    if (!resolved || resolved.source !== 'regional_directors') return resolved;
    var ambCode = (resolved.stats.ambassador_code || resolved.stats.existingAmbCode || '').toString().trim();
    if (!ambCode && resolved.id.indexOf('RD-') === 0) {
      ambCode = resolved.id.replace(/^RD-/, 'AMB-');
    }
    if (!ambCode) return resolved;
    try {
      var snap = await db.collection('ambassadors').doc(ambCode).get();
      if (snap.exists) {
        var a = snap.data();
        resolved.stats = Object.assign({}, a, resolved.stats, {
          ambassador_type: 'regional_director',
          ambassador_code: ambCode,
          sbdReferrals: a.sbdReferrals || resolved.stats.sbdReferrals,
          sbdReferralCode: a.sbdReferralCode || resolved.stats.sbdReferralCode
        });
        resolved.linkedAmbassadorId = snap.id;
      }
    } catch (e) {
      console.warn('mergeLinkedAmbassador', e);
    }
    return resolved;
  }

  /**
   * @returns {Promise<{id:string, stats:Object, source:string}|null>}
   */
  async function resolveAccount(db, code, email) {
    if (!db || !code) return null;
    var upper = code.toString().trim().toUpperCase();
    var resolved = null;

    if (upper.indexOf('RD-') === 0) {
      resolved = await tryRegionalDirector(db, upper);
      if (!resolved) resolved = await tryAmbassadorDoc(db, upper);
      if (!resolved) resolved = await tryAmbassadorByField(db, upper);
    } else {
      resolved = await tryAmbassadorDoc(db, upper);
      if (!resolved) resolved = await tryAmbassadorByField(db, upper);
      if (!resolved) resolved = await tryRegionalDirector(db, upper);
    }

    if (!resolved) return null;
    if (email && resolved.stats.email && !emailsMatch(resolved.stats.email, email)) {
      return null;
    }
    return mergeLinkedAmbassador(db, resolved);
  }

  global.MEAmbassadorAccountResolve = {
    resolveAccount: resolveAccount,
    normalizeRdStats: normalizeRdStats
  };
})(typeof window !== 'undefined' ? window : global);
