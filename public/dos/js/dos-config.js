/**
 * DOS nav config per rank (test v2 dashboards).
 * DOS nav config per rank (production + preview dashboards).
 */
(function (global) {
  'use strict';

  var AMBASSADOR_NAV = [
    { id: 'overview', label: 'Overview', icon: 'fa-solid fa-gauge-high' },
    { id: 'role-targets', label: 'Role & targets', icon: 'fa-solid fa-book-open' },
    { id: 'daily-ops', label: 'Daily ops', icon: 'fa-solid fa-sun' },
    { id: 'field-deploy', label: 'Field deploy', icon: 'fa-solid fa-map-location-dot' },
    { id: 'links', label: 'Deployment links', icon: 'fa-solid fa-link' },
    { id: 'subscribers', label: 'Subscribers & pipeline', icon: 'fa-solid fa-user-group' },
    { id: 'retention', label: 'Retention', icon: 'fa-solid fa-heart-pulse' },
    { id: 'commissions', label: 'Commissions', icon: 'fa-solid fa-coins' },
    { id: 'social-deploy', label: 'Social deploy', icon: 'fa-solid fa-share-nodes' },
    { id: 'reporting', label: 'Reports', icon: 'fa-solid fa-file-export' },
    { id: 'network', label: 'Network', icon: 'fa-solid fa-sitemap' },
    { id: 'formation', label: 'Formation', icon: 'fa-solid fa-graduation-cap' },
    { id: 'performance', label: 'Performance', icon: 'fa-solid fa-trophy' }
  ];

  var SENIOR_EXTRA = [
    { id: 'team', label: 'Team command', icon: 'fa-solid fa-bolt' }
  ];

  var RD_EXTRA = [
    { id: 'region', label: 'Regional command', icon: 'fa-solid fa-globe' }
  ];

  var EXECUTIVE_EXTRA = [
    { id: 'global', label: 'Global command', icon: 'fa-solid fa-earth-americas' }
  ];

  /** Deployment unit milestones (not Senior rank — Senior = 10 recruits). */
  var UNIT_MILESTONES = [
    { level: 'Bronze', threshold: 50, icon: 'fa-medal', color: '#CD7F32' },
    { level: 'Silver', threshold: 150, icon: 'fa-medal', color: '#C0C0C0' },
    { level: 'Gold', threshold: 300, icon: 'fa-medal', color: '#D4AF37' },
    { level: 'Platinum', threshold: 500, icon: 'fa-gem', color: '#71717a' }
  ];

  global.DOSConfig = {
    PHASE: { current: 8, total: 8, label: 'Phase 8 — Production DOS (all ranks)' },
    SENIOR_RECRUIT_TARGET: 10,
    RD_SENIOR_TARGET: 50,
    UNIT_MILESTONES: UNIT_MILESTONES,
    AMBASSADOR_NAV: AMBASSADOR_NAV,
    getNavForRank: function (rank) {
      var nav = AMBASSADOR_NAV.slice();
      if (rank === 'senior' || rank === 'regional_director' || rank === 'executive') {
        nav = nav.concat(SENIOR_EXTRA);
      }
      if (rank === 'regional_director' || rank === 'executive') {
        nav = nav.concat(RD_EXTRA);
      }
      if (rank === 'executive') {
        nav = nav.concat(EXECUTIVE_EXTRA);
      }
      return nav;
    },
    getSectionTitle: function (id, rank) {
      var nav = this.getNavForRank(rank || 'ambassador');
      var item = nav.find(function (n) { return n.id === id; });
      return item ? item.label : 'Dashboard';
    }
  };
})(typeof window !== 'undefined' ? window : global);
