/**
 * Section router for DOS test dashboards (hash: #overview, #links, …).
 */
(function (global) {
  'use strict';

  var currentSection = 'overview';

  function setSection(id) {
    if (!id) id = 'overview';
    currentSection = id;

    document.querySelectorAll('.dos-section').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-section') === id);
    });

    document.querySelectorAll('[data-dos-nav]').forEach(function (btn) {
      var navId = btn.getAttribute('data-dos-nav');
      btn.classList.toggle('active', navId === id);
    });

    var titleEl = document.getElementById('dosPageTitle');
    if (titleEl && global.DOSConfig) {
      var rank = document.body.getAttribute('data-dos-rank') || 'ambassador';
      titleEl.textContent = global.DOSConfig.getSectionTitle(id, rank);
    }

    if (location.hash !== '#' + id) {
      history.replaceState(null, '', '#' + id);
    }

    global.dispatchEvent(new CustomEvent('dos-section-change', { detail: { section: id } }));
  }

  function initFromHash() {
    var hash = (location.hash || '#overview').replace('#', '');
    if (!document.querySelector('[data-section="' + hash + '"]')) hash = 'overview';
    setSection(hash);
  }

  function buildSidebarNav() {
    if (!global.DOSConfig) return;
    var sidebar = document.getElementById('dosSidebarNav');
    var mobile = document.getElementById('dosMobileNav');
    if (!sidebar || sidebar.getAttribute('data-built') === '1') return;

    var rank = document.body.getAttribute('data-dos-rank') || 'ambassador';
    var nav = global.DOSConfig.getNavForRank(rank).filter(function (item) {
      return !!document.querySelector('[data-section="' + item.id + '"]');
    });
    nav.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-dos-nav', item.id);
      btn.innerHTML = '<i class="' + item.icon + ' dos-nav-ico" aria-hidden="true"></i><span>' + item.label + '</span>';
      sidebar.appendChild(btn);

      if (mobile) {
        var m = document.createElement('button');
        m.type = 'button';
        m.setAttribute('data-dos-nav', item.id);
        m.setAttribute('title', item.label);
        m.innerHTML = '<i class="' + item.icon + '" aria-hidden="true"></i>';
        mobile.appendChild(m);
      }
    });

    sidebar.setAttribute('data-built', '1');
    bindNav();

    var brand = document.querySelector('.dos-brand');
    if (brand && !document.getElementById('dosSidebarToggle')) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'dosSidebarToggle';
      toggle.className = 'dos-btn dos-sidebar-toggle';
      toggle.textContent = 'Menu';
      toggle.onclick = function () { sidebar.classList.toggle('open'); };
      brand.appendChild(toggle);
    }
  }

  var hashListenerBound = false;

  function bindNav() {
    document.querySelectorAll('[data-dos-nav]').forEach(function (btn) {
      if (btn.getAttribute('data-dos-bound') === '1') return;
      btn.setAttribute('data-dos-bound', '1');
      btn.addEventListener('click', function () {
        setSection(btn.getAttribute('data-dos-nav'));
      });
    });
    if (!hashListenerBound) {
      window.addEventListener('hashchange', initFromHash);
      hashListenerBound = true;
    }
  }

  global.DOSRouter = {
    setSection: setSection,
    getSection: function () { return currentSection; },
    init: function () {
      buildSidebarNav();
      bindNav();
      initFromHash();
    }
  };
})(typeof window !== 'undefined' ? window : global);
