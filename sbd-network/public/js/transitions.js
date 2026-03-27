// transitions.js — Page slide-in animation + exit slide for forward navigation
(function () {
  // Clean up any leftover animation classes when page becomes visible
  // (covers bfcache restore and failed navigations)
  window.addEventListener('pageshow', function () {
    document.body.classList.remove('page-enter', 'page-exit', 'page-exit-back');
  });

  // Slide in on every page load
  document.body.style.animation = 'none';
  requestAnimationFrame(function () {
    document.body.style.animation = '';
    document.body.classList.add('page-enter');
    setTimeout(function () { document.body.classList.remove('page-enter'); }, 320);
  });

  // Intercept forward navigation links so we can slide OUT before navigating
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;
    if (link.target === '_blank') return;
    e.preventDefault();
    document.body.classList.add('page-exit');
    setTimeout(function () {
      document.body.classList.remove('page-exit'); // clean up before navigate
      window.location.href = href;
    }, 240);
  }, true);
}());
