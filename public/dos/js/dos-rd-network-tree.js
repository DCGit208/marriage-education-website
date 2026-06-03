/**
 * RD regional genealogy — subtree layout, scroll default, optional zoom (tree only).
 */
(function (global) {
  'use strict';

  var SESSION_VIEW_PREFIX = 'dos_tree_view_';
  var SESSION_MODE_KEY = 'dos_rd_tree_mode'; /* scroll | fullpage */
  var NODE_W = 168;
  var NODE_H = 96;
  var NODE_GAP = 32;
  var RANK_GAP = 72;
  var PAD = 48;
  var RD_W = 188;
  var RD_H = 108;
  var SENIOR_TARGET = (global.DOSConfig && global.DOSConfig.SENIOR_RECRUIT_TARGET) ||
    (global.DOSRdNetwork && global.DOSRdNetwork.SENIOR_RECRUIT_TARGET) || 10;
  var LARGE_NETWORK_THRESHOLD = 80;
  var SESSION_FOCUS_KEY = 'dos_rd_tree_focus';
  var ZOOM_MIN = 0.4;
  var ZOOM_MAX = 2;

  function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) { /* ignore */ }
    return 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  }

  function normCode(c) {
    if (global.DOSRdNetwork && global.DOSRdNetwork.normCode) return global.DOSRdNetwork.normCode(c);
    return String(c || '').trim().toUpperCase();
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function shortName(name, n) {
    n = n || 22;
    var s = String(name || '').trim();
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  function visibleChildren(parentId, membersById, childrenMap, collapsed) {
    if (collapsed[parentId]) return [];
    return (childrenMap[parentId] || []).filter(function (m) { return membersById[m.id]; })
      .sort(function (a, b) { return (b.recruits - a.recruits) || String(a.name).localeCompare(String(b.name)); });
  }

  function buildEdges(rdCode, membersById, childrenMap, collapsed) {
    var edges = [];
    function walk(parentId) {
      visibleChildren(parentId, membersById, childrenMap, collapsed).forEach(function (m) {
        edges.push({ from: parentId, to: m.id });
        walk(m.id);
      });
    }
    walk(rdCode);
    return edges;
  }

  /**
   * Subtree layout: each parent centered above its own children (fixes cross-branch placement).
   */
  function computeSubtreeLayout(rdCode, membersById, childrenMap, collapsed) {
    function layoutNode(id, isRoot) {
      var w = isRoot ? RD_W : NODE_W;
      var h = isRoot ? RD_H : NODE_H;
      var kids = visibleChildren(id, membersById, childrenMap, collapsed);

      if (!kids.length) {
        return {
          width: w,
          height: h,
          nodes: [{ id: id, x: 0, y: 0, w: w, h: h, isRoot: !!isRoot }]
        };
      }

      var childSubs = kids.map(function (m) { return layoutNode(m.id, false); });
      var totalW = 0;
      childSubs.forEach(function (sub, i) {
        totalW += sub.width;
        if (i < childSubs.length - 1) totalW += NODE_GAP;
      });

      var treeW = Math.max(w, totalW);
      var parentX = (treeW - w) / 2;
      var nodes = [{ id: id, x: parentX, y: 0, w: w, h: h, isRoot: !!isRoot }];
      var childY = h + RANK_GAP;
      var xOff = (treeW - totalW) / 2;
      var maxChildH = 0;

      childSubs.forEach(function (sub, i) {
        var ox = xOff;
        xOff += sub.width + NODE_GAP;
        maxChildH = Math.max(maxChildH, sub.height);
        sub.nodes.forEach(function (n) {
          nodes.push({
            id: n.id,
            x: n.x + ox,
            y: n.y + childY,
            w: n.w,
            h: n.h,
            isRoot: !!n.isRoot
          });
        });
      });

      return {
        width: treeW,
        height: h + RANK_GAP + maxChildH,
        nodes: nodes
      };
    }

    var tree = layoutNode(rdCode, true);
    tree.nodes.forEach(function (n) {
      n.x += PAD;
      n.y += PAD;
    });

    var pos = {};
    tree.nodes.forEach(function (n) { pos[n.id] = n; });

    var edgeList = buildEdges(rdCode, membersById, childrenMap, collapsed);
    var layoutEdges = edgeList.map(function (e) {
      var f = pos[e.from];
      var t = pos[e.to];
      if (!f || !t) return null;
      return {
        from: e.from,
        to: e.to,
        sourceX: f.x + f.w / 2,
        sourceY: f.y + f.h,
        targetX: t.x + t.w / 2,
        targetY: t.y
      };
    }).filter(Boolean);

    return {
      nodes: tree.nodes,
      edges: layoutEdges,
      width: tree.width + PAD * 2,
      height: tree.height + PAD * 2
    };
  }

  function edgePath(sx, sy, tx, ty) {
    var midY = (sy + ty) / 2;
    return 'M' + sx + ',' + sy + ' C' + sx + ',' + midY + ' ' + tx + ',' + midY + ' ' + tx + ',' + ty;
  }

  /** Ancestors + node + all descendants (for focus drill-down). */
  function membersInFocusSubtree(focusId, rdCode, allMembers, graph) {
    var byId = graph.byId || {};
    var children = graph.children || {};
    var visible = {};
    var fid = normCode(focusId);
    var rd = normCode(rdCode);

    function markDescendants(id) {
      if (!byId[id]) return;
      visible[id] = true;
      (children[id] || []).forEach(function (c) { markDescendants(c.id); });
    }
    function markAncestors(id) {
      if (!id || id === rd) {
        visible[rd] = true;
        return;
      }
      var m = byId[id];
      if (!m) return;
      visible[id] = true;
      markAncestors(normCode(m.recruitedBy));
    }

    if (!fid || !byId[fid]) return allMembers.slice();
    markAncestors(fid);
    markDescendants(fid);
    return allMembers.filter(function (m) { return visible[m.id]; });
  }

  function uncollapsePathToNode(nodeId, rdCode, graph, collapsed) {
    var byId = graph.byId || {};
    var cur = normCode(nodeId);
    var rd = normCode(rdCode);
    while (cur && cur !== rd) {
      delete collapsed[cur];
      var m = byId[cur];
      cur = m ? normCode(m.recruitedBy) : '';
    }
  }

  function applyFullNetworkDefaultCollapse(rdCode, members, graph, collapsed) {
    var byId = graph.byId || {};
    var children = graph.children || {};
    members.forEach(function (m) {
      var kids = (children[m.id] || []).filter(function (c) { return byId[c.id]; });
      if (kids.length > 0) collapsed[m.id] = true;
    });
    delete collapsed[rdCode];
  }

  function viewSessionKey(rootCode) {
    return SESSION_VIEW_PREFIX + normCode(rootCode);
  }

  function loadViewPreference(rootCode) {
    try {
      var v = sessionStorage.getItem(viewSessionKey(rootCode));
      if (v === 'full' || v === 'leaders' || v === 'direct') return v;
    } catch (e) { /* ignore */ }
    return null;
  }

  function TreeController(mountEl, options) {
    this.mountEl = mountEl;
    options = options || {};
    this.rootCode = normCode(options.rootCode || options.rdCode);
    this.rdCode = this.rootCode;
    this.rootKind = options.rootKind || (this.rootCode.indexOf('RD-') === 0 ? 'rd' : 'leader');
    this.rootName = options.rootName || options.rdName || (this.rootKind === 'rd' ? 'Regional Director' : 'Leader');
    this.rootMember = options.rootMember || null;
    this.rootProfile = options.rootProfile || (this.rootMember && this.rootMember.data) || null;
    this.allMembers = options.members || [];
    this.pipelineMembers = options.pipelineMembers || [];
    this.showPipeline = options.showPipeline !== false;
    this.graph = options.graph || { children: {}, byId: {} };
    this.stats = options.stats || {};
    this.view = options.defaultView || loadViewPreference(this.rootCode) ||
      (this.rootKind === 'rd' ? 'leaders' : 'full');
    this.interactionMode = 'scroll';
    clearStoredFullpageMode();
    this.collapsed = {};
    this.selectedId = this.rootCode;
    this.searchQuery = '';
    this.panX = 0;
    this.panY = 0;
    this.zoomLevel = 1;
    this.focusRootId = '';
    this.forceFullTree = false;
    this.shellEl = null;
    this._destroyed = false;
    if (this.view === 'full') {
      applyFullNetworkDefaultCollapse(this.rootCode, this.allMembers, this.graph, this.collapsed);
    }
    this._buildShell();
    this.refresh(this.allMembers, this.graph, this.pipelineMembers);
  }

  TreeController.prototype._buildShell = function () {
    var self = this;
    var title = this.rootKind === 'rd' ? 'Regional genealogy' : 'Your organization';
    var sub = this.rootKind === 'rd'
      ? 'Who recruited whom · verified <code>AMB-</code> links · pending signups optional'
      : 'Verified downline by default · include pending signups when needed';
    var fullLabel = this.rootKind === 'rd' ? 'Full network' : 'My organization';
    var directLabel = 'Direct to me';
    var rootLegend = this.rootKind === 'rd' ? 'You (RD)' : 'You (Leader)';
    var pipelineCount = this.pipelineMembers.length || 0;
    var showPipelineUi = pipelineCount > 0;
    var pipelineToggle = showPipelineUi
      ? '<label class="dos-tree-pipeline-toggle" title="Pending signups are in payment/approval flow and are not counted as verified recruits yet">' +
        '<input type="checkbox" class="dos-tree-show-pipeline" checked> Include pending signups' +
        '<span class="dos-tree-pipeline-count">' + pipelineCount + '</span></label>' +
        '<span class="dos-tree-pipeline-help">Pending signups are not counted as verified recruits yet.</span>'
      : '';

    this.mountEl.innerHTML =
      '<div class="dos-tree-shell">' +
      '<div class="dos-tree-toolbar">' +
      '<div class="dos-tree-toolbar-title"><h4>' + title + '</h4>' +
      '<p class="dos-tree-toolbar-sub">' + sub + '</p></div>' +
      '<div class="dos-tree-toggle-group" role="group" aria-label="Tree view">' +
      '<button type="button" class="dos-tree-toggle" data-view="full">' + fullLabel + '</button>' +
      '<button type="button" class="dos-tree-toggle" data-view="leaders">Leaders only</button>' +
      '<button type="button" class="dos-tree-toggle" data-view="direct">' + directLabel + '</button>' +
      '</div>' +
      pipelineToggle +
      '<div class="dos-tree-search-wrap">' +
      '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
      '<input type="search" id="dosTreeSearch" class="dos-tree-search" placeholder="Search name or code" autocomplete="off">' +
      '</div></div>' +
      '<div class="dos-tree-body">' +
      '<div class="dos-tree-canvas-wrap">' +
      '<div class="dos-tree-canvas-tools" aria-label="Diagram navigation">' +
      '<button type="button" class="dos-tree-mode-btn" data-mode="scroll" title="Scroll in panel (default)">' +
      '<i class="fa-solid fa-arrows-up-down-left-right"></i> Scroll</button>' +
      '<button type="button" class="dos-tree-mode-btn" data-mode="fullpage" title="Expand diagram full screen — drag to reach off-screen nodes">' +
      '<i class="fa-solid fa-expand"></i> Full page</button>' +
      '<span class="dos-tree-zoom-group" aria-label="Zoom">' +
      '<button type="button" class="dos-tree-zoom-btn" data-zoom="out" title="Zoom out">−</button>' +
      '<span class="dos-tree-zoom-label">100%</span>' +
      '<button type="button" class="dos-tree-zoom-btn" data-zoom="in" title="Zoom in">+</button>' +
      '<button type="button" class="dos-tree-zoom-btn" data-zoom="reset" title="Reset zoom">1:1</button>' +
      '</span>' +
      '<label class="dos-tree-focus-wrap"><span class="visually-hidden">Focus subtree</span>' +
      '<select class="dos-tree-focus-select" aria-label="Focus on one ambassador organization">' +
      '<option value="">Focus: full diagram</option></select></label>' +
      '<button type="button" class="dos-tree-tool-btn dos-tree-tool-btn--collapse" data-action="collapse-all" title="Collapse all branches">Collapse</button>' +
      '<button type="button" class="dos-tree-tool-btn" data-action="expand-all" title="Expand all branches">Expand</button>' +
      '<button type="button" class="dos-tree-tools-more" aria-expanded="false" aria-label="More diagram tools">' +
      '<i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>' +
      '<span class="dos-tree-touch-hint">Pinch to zoom · tap ▸ on a card for branch</span>' +
      '<span class="dos-tree-fullpage-hint">Drag diagram · Esc to exit</span></div>' +
      '<div class="dos-tree-scale-banner" id="dosTreeScaleBanner" hidden></div>' +
      '<div class="dos-tree-canvas is-scroll-mode" role="application" aria-label="Genealogy diagram">' +
      '<div class="dos-tree-scaler"></div>' +
      '<div class="dos-tree-scroll-sizer" aria-hidden="true"></div></div>' +
      '<p class="dos-tree-legend"><span class="dos-tree-legend-item dos-tree-legend-rd">' + rootLegend + '</span>' +
      '<span class="dos-tree-legend-item dos-tree-legend-dev">Developing</span>' +
      '<span class="dos-tree-legend-item dos-tree-legend-amb">Ambassador</span>' +
      (showPipelineUi ? '<span class="dos-tree-legend-item dos-tree-legend-pipeline">Pending signup</span>' : '') +
      '<span class="dos-tree-legend-arrow">↓ recruited</span></p></div>' +
      '<aside class="dos-tree-detail" id="dosTreeDetail"></aside></div></div>';

    this.shellEl = this.mountEl.querySelector('.dos-tree-shell');
    this.isTouchUI = isTouchDevice();
    if (this.isTouchUI) this.shellEl.classList.add('is-touch-ui');
    if (this.rootKind !== 'rd') this.shellEl.classList.add('is-leader-root');
    this.canvasEl = this.mountEl.querySelector('.dos-tree-canvas');
    this.scalerEl = this.mountEl.querySelector('.dos-tree-scaler');
    this.scrollSizerEl = this.mountEl.querySelector('.dos-tree-scroll-sizer');
    this.zoomLabelEl = this.mountEl.querySelector('.dos-tree-zoom-label');
    this.detailEl = this.mountEl.querySelector('.dos-tree-detail');
    this.toolsEl = this.mountEl.querySelector('.dos-tree-canvas-tools');
    this.focusSelectEl = this.mountEl.querySelector('.dos-tree-focus-select');
    this.scaleBannerEl = this.mountEl.querySelector('.dos-tree-scale-banner');
    this.pipelineToggleEl = this.mountEl.querySelector('.dos-tree-show-pipeline');
    if (this.pipelineToggleEl) {
      this.pipelineToggleEl.addEventListener('change', function () {
        self.showPipeline = self.pipelineToggleEl.checked;
        self._paint(false);
      });
    }

    if (this.focusSelectEl) {
      this.focusSelectEl.addEventListener('change', function () {
        self.setFocusRoot(self.focusSelectEl.value);
      });
    }
    this.toolsEl.querySelectorAll('.dos-tree-tool-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        if (action === 'collapse-all') self._collapseAllBranches();
        else if (action === 'expand-all') self._expandAllBranches();
        self.toolsEl.classList.remove('is-tools-expanded');
        var moreBtn = self.toolsEl.querySelector('.dos-tree-tools-more');
        if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
      });
    });
    var toolsMoreBtn = this.toolsEl.querySelector('.dos-tree-tools-more');
    if (toolsMoreBtn) {
      toolsMoreBtn.addEventListener('click', function () {
        var open = self.toolsEl.classList.toggle('is-tools-expanded');
        toolsMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    this.mountEl.querySelectorAll('.dos-tree-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () { self.setView(btn.getAttribute('data-view')); });
    });
    this.mountEl.querySelector('#dosTreeSearch').addEventListener('input', function (ev) {
      self.searchQuery = ev.target.value.trim().toLowerCase();
      self._paint(false);
    });

    this.toolsEl.querySelectorAll('.dos-tree-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.setInteractionMode(btn.getAttribute('data-mode'));
      });
    });
    this.toolsEl.querySelectorAll('.dos-tree-zoom-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var z = btn.getAttribute('data-zoom');
        if (z === 'in') self._zoomStep(1.12);
        else if (z === 'out') self._zoomStep(1 / 1.12);
        else self._resetZoom();
      });
    });

    this._onKeyDown = function (ev) {
      if (ev.key === 'Escape' && self.interactionMode === 'fullpage') {
        self.setInteractionMode('scroll');
      }
    };
    document.addEventListener('keydown', this._onKeyDown);

    this.scalerEl.addEventListener('click', function (ev) {
      var branch = ev.target.closest('[data-branch-toggle]');
      if (branch) {
        ev.preventDefault();
        ev.stopPropagation();
        self._toggleBranch(branch.getAttribute('data-branch-toggle'));
        return;
      }
      var node = ev.target.closest('[data-tree-id]');
      if (!node) return;
      self.selectNode(node.getAttribute('data-tree-id'));
    });
    this.scalerEl.addEventListener('dblclick', function (ev) {
      var node = ev.target.closest('[data-tree-id]');
      if (!node || node.getAttribute('data-tree-root')) return;
      self._toggleBranch(node.getAttribute('data-tree-id'));
    });

    this._initDragPan();
    this._initTouchGestures();
    this.setView(this.view);
    this.setInteractionMode('scroll');
  };

  TreeController.prototype.setInteractionMode = function (mode) {
    this.interactionMode = mode === 'fullpage' ? 'fullpage' : 'scroll';
    try {
      if (this.interactionMode === 'scroll') {
        sessionStorage.setItem(SESSION_MODE_KEY, 'scroll');
      }
    } catch (e) { /* ignore */ }

    this.shellEl.classList.toggle('is-tree-fullpage', this.interactionMode === 'fullpage');
    this.canvasEl.classList.toggle('is-scroll-mode', this.interactionMode === 'scroll');
    this.canvasEl.classList.toggle('is-fullpage-mode', this.interactionMode === 'fullpage');
    document.body.classList.toggle('dos-tree-fullpage-open', this.interactionMode === 'fullpage');

    this.toolsEl.querySelectorAll('.dos-tree-mode-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === this.interactionMode ? 'true' : 'false');
    }.bind(this));

    this.panX = 0;
    this.panY = 0;
    if (this.interactionMode === 'scroll') {
      this._applyDiagramTransform();
      this._scrollToRoot();
    } else {
      var self = this;
      requestAnimationFrame(function () { self._centerDiagramInFullpage(); });
    }
  };

  TreeController.prototype._clearPanTransform = function () {
    this.scalerEl.style.transform = '';
    this.scalerEl.style.marginLeft = '';
    this.scalerEl.style.marginTop = '';
    this.panX = 0;
    this.panY = 0;
    this.zoomLevel = 1;
    this._updateScrollSizer();
    this._updateZoomLabel();
  };

  TreeController.prototype._updateZoomLabel = function () {
    if (!this.zoomLabelEl) return;
    this.zoomLabelEl.textContent = Math.round((this.zoomLevel || 1) * 100) + '%';
  };

  TreeController.prototype._updateScrollSizer = function () {
    if (!this.scrollSizerEl || !this._layout) return;
    if (this.interactionMode === 'fullpage') {
      this.scrollSizerEl.style.width = '0';
      this.scrollSizerEl.style.height = '0';
      return;
    }
    var z = this.zoomLevel || 1;
    this.scrollSizerEl.style.width = Math.ceil(this._layout.width * z) + 'px';
    this.scrollSizerEl.style.height = Math.ceil(this._layout.height * z) + 'px';
  };

  TreeController.prototype._applyDiagramTransform = function () {
    var z = this.zoomLevel || 1;
    this.scalerEl.style.marginLeft = '0';
    this.scalerEl.style.marginTop = '0';
    this.scalerEl.style.transformOrigin = '0 0';
    if (this.interactionMode === 'fullpage') {
      this.scalerEl.style.transform = 'translate(' + this.panX + 'px,' + this.panY + 'px) scale(' + z + ')';
    } else {
      this.scalerEl.style.transform = z === 1 ? '' : 'scale(' + z + ')';
      if (this._layout && this.canvasEl) {
        var contentW = this._layout.width * z;
        var contentH = this._layout.height * z;
        var centerX = Math.max(0, Math.floor((this.canvasEl.clientWidth - contentW) / 2));
        var centerY = Math.max(0, Math.floor((this.canvasEl.clientHeight - contentH) / 2));
        this.scalerEl.style.marginLeft = centerX ? centerX + 'px' : '0';
        this.scalerEl.style.marginTop = centerY ? centerY + 'px' : '0';
      }
      this._updateScrollSizer();
    }
    this._updateZoomLabel();
  };

  TreeController.prototype._zoomStep = function (factor) {
    var rect = this.canvasEl.getBoundingClientRect();
    this._setZoomLevel((this.zoomLevel || 1) * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  /** Zoom while keeping anchorX/Y (viewport client coords) fixed under the finger. */
  TreeController.prototype._setZoomLevel = function (newZoom, anchorX, anchorY) {
    var z0 = this.zoomLevel || 1;
    newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
    if (!this.canvasEl) {
      this.zoomLevel = newZoom;
      this._applyDiagramTransform();
      return;
    }
    var rect = this.canvasEl.getBoundingClientRect();
    var vx = anchorX - rect.left;
    var vy = anchorY - rect.top;
    if (this.interactionMode === 'fullpage') {
      var wx = (vx - this.panX) / z0;
      var wy = (vy - this.panY) / z0;
      this.zoomLevel = newZoom;
      this.panX = vx - wx * newZoom;
      this.panY = vy - wy * newZoom;
    } else {
      var scrollX = this.canvasEl.scrollLeft;
      var scrollY = this.canvasEl.scrollTop;
      var cx = (scrollX + vx) / z0;
      var cy = (scrollY + vy) / z0;
      this.zoomLevel = newZoom;
      this._applyDiagramTransform();
      this.canvasEl.scrollLeft = Math.max(0, cx * newZoom - vx);
      this.canvasEl.scrollTop = Math.max(0, cy * newZoom - vy);
      return;
    }
    this._applyDiagramTransform();
  };

  TreeController.prototype._resetZoom = function () {
    this.zoomLevel = 1;
    if (this.interactionMode === 'fullpage') {
      this._centerDiagramInFullpage();
    } else {
      this._applyDiagramTransform();
      this._scrollToRoot();
    }
  };

  /** Position diagram so RD root is near top-center; drag reaches anything off-screen. */
  TreeController.prototype._centerDiagramInFullpage = function () {
    if (!this._layout || !this.canvasEl) return;
    var rect = this.canvasEl.getBoundingClientRect();
    var root = this._layout.nodes.filter(function (n) { return n.isRoot; })[0];
    if (!root) return;
    var rootCx = root.x + root.w / 2;
    this.panX = rect.width / 2 - rootCx * (this.zoomLevel || 1);
    this.panY = 32;
    this._applyDiagramTransform();
  };

  TreeController.prototype._initTouchGestures = function () {
    var self = this;
    var pinching = false;
    var pinchStartDist = 0;
    var pinchStartZoom = 1;

    function touchDistance(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    }
    function touchMidpoint(touches) {
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
      };
    }

    this._onTouchStart = function (ev) {
      if (ev.touches.length === 2) {
        pinching = true;
        pinchStartDist = touchDistance(ev.touches);
        pinchStartZoom = self.zoomLevel || 1;
      }
    };
    this._onTouchMove = function (ev) {
      if (!pinching || ev.touches.length < 2 || pinchStartDist < 8) return;
      ev.preventDefault();
      var dist = touchDistance(ev.touches);
      var mid = touchMidpoint(ev.touches);
      var newZoom = pinchStartZoom * (dist / pinchStartDist);
      self._setZoomLevel(newZoom, mid.x, mid.y);
    };
    this._onTouchEnd = function (ev) {
      if (ev.touches.length < 2) {
        pinching = false;
        pinchStartDist = 0;
        pinchStartZoom = self.zoomLevel || 1;
      }
    };

    this.canvasEl.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.canvasEl.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvasEl.addEventListener('touchend', this._onTouchEnd, { passive: true });
    this.canvasEl.addEventListener('touchcancel', this._onTouchEnd, { passive: true });
  };

  TreeController.prototype._toggleBranch = function (id) {
    var nid = normCode(id);
    if (!nid || nid === this.rdCode) return;
    if (this.collapsed[nid]) delete this.collapsed[nid];
    else this.collapsed[nid] = true;
    this._paint(true);
  };

  TreeController.prototype._nodeHasBranchChildren = function (id, membersById) {
    var kids = (this.graph.children && this.graph.children[id]) || [];
    for (var i = 0; i < kids.length; i++) {
      if (membersById[kids[i].id]) return true;
    }
    return false;
  };

  TreeController.prototype._initDragPan = function () {
    var self = this;
    var panning = false;
    var lastX = 0;
    var lastY = 0;

    this.canvasEl.addEventListener('pointerdown', function (ev) {
      if (self.interactionMode !== 'fullpage') return;
      if (ev.pointerType === 'touch' && ev.isPrimary === false) return;
      if (ev.target.closest('[data-tree-id]') || ev.target.closest('[data-branch-toggle]')) return;
      panning = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      self.canvasEl.classList.add('is-panning');
      self.canvasEl.setPointerCapture(ev.pointerId);
    });
    this.canvasEl.addEventListener('pointermove', function (ev) {
      if (!panning) return;
      self.panX += ev.clientX - lastX;
      self.panY += ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      self._applyDiagramTransform();
    });
    function endPan() {
      panning = false;
      self.canvasEl.classList.remove('is-panning');
    }
    this.canvasEl.addEventListener('pointerup', endPan);
    this.canvasEl.addEventListener('pointercancel', endPan);
  };

  TreeController.prototype._scrollToRoot = function () {
    if (!this.canvasEl || !this._layout) return;
    var root = this._layout.nodes.filter(function (n) { return n.isRoot; })[0];
    if (!root) return;
    var self = this;
    requestAnimationFrame(function () {
      var z = self.zoomLevel || 1;
      var rootCx = root.x * z + (root.w * z) / 2;
      var rootCy = root.y * z + (root.h * z) / 2;
      var targetLeft = rootCx - self.canvasEl.clientWidth / 2;
      var targetTop = rootCy - self.canvasEl.clientHeight / 2;
      self.canvasEl.scrollLeft = Math.max(0, targetLeft);
      self.canvasEl.scrollTop = Math.max(0, targetTop);
    });
  };

  TreeController.prototype._filteredMembers = function () {
    if (this.focusRootId) {
      return membersInFocusSubtree(this.focusRootId, this.rdCode, this.allMembers, this.graph);
    }
    if (!global.DOSRdNetwork || !global.DOSRdNetwork.filterMembersByView) return this.allMembers.slice();
    return global.DOSRdNetwork.filterMembersByView(this.allMembers, this.graph, this.rdCode, this.view);
  };

  TreeController.prototype._shouldShowScaleGuard = function () {
    return this.rootKind === 'rd' && this.view === 'full' && !this.focusRootId && !this.forceFullTree &&
      this.allMembers.length >= LARGE_NETWORK_THRESHOLD;
  };

  TreeController.prototype._filteredPipeline = function () {
    if (!this.showPipeline || !this.pipelineMembers.length) return [];
    var root = this.rootCode;
    if (this.view === 'direct') {
      return this.pipelineMembers.filter(function (p) { return normCode(p.recruitedBy) === root; });
    }
    if (this.view === 'full') return this.pipelineMembers.slice();
    var verified = global.DOSRdNetwork.filterMembersByView(this.allMembers, this.graph, root, 'leaders');
    var leaderIds = {};
    leaderIds[root] = true;
    verified.forEach(function (m) {
      if (m.recruits > 0) leaderIds[m.id] = true;
    });
    return this.pipelineMembers.filter(function (p) { return leaderIds[normCode(p.recruitedBy)]; });
  };

  TreeController.prototype._populateFocusSelect = function () {
    if (!this.focusSelectEl) return;
    if (this.rootKind !== 'rd') {
      this.focusSelectEl.parentElement.style.display = 'none';
      return;
    }
    var self = this;
    var leaders = this.allMembers.filter(function (m) { return m.recruits > 0; })
      .sort(function (a, b) { return b.recruits - a.recruits || String(a.name).localeCompare(String(b.name)); });
    var html = '<option value="">Focus: full diagram</option>';
    leaders.forEach(function (m) {
      html += '<option value="' + escapeHtml(m.id) + '"' +
        (self.focusRootId === m.id ? ' selected' : '') + '>' +
        escapeHtml(shortName(m.name, 28)) + ' (' + m.recruits + ')</option>';
    });
    this.focusSelectEl.innerHTML = html;
    this.focusSelectEl.parentElement.style.display = this.allMembers.length >= 12 ? '' : 'none';
  };

  TreeController.prototype.setFocusRoot = function (id) {
    if (this.rootKind !== 'rd') return;
    this.focusRootId = normCode(id);
    try {
      if (this.focusRootId) sessionStorage.setItem(SESSION_FOCUS_KEY, this.focusRootId);
      else sessionStorage.removeItem(SESSION_FOCUS_KEY);
    } catch (e) { /* ignore */ }
    if (this.focusRootId) {
      this.view = 'full';
      this.forceFullTree = true;
      try { sessionStorage.setItem(viewSessionKey(this.rootCode), 'full'); } catch (e) { /* ignore */ }
      this.mountEl.querySelectorAll('.dos-tree-toggle').forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-view') === 'full' ? 'true' : 'false');
      });
      uncollapsePathToNode(this.focusRootId, this.rdCode, this.graph, this.collapsed);
      this.selectedId = this.focusRootId;
    } else {
      this.forceFullTree = false;
    }
    this._populateFocusSelect();
    this._updateScaleBanner();
    this._paint(true);
  };

  TreeController.prototype._collapseAllBranches = function () {
    var members = this._filteredMembers();
    applyFullNetworkDefaultCollapse(this.rdCode, members, this.graph, this.collapsed);
    this._paint(false);
  };

  TreeController.prototype._expandAllBranches = function () {
    this.collapsed = {};
    this._paint(true);
  };

  TreeController.prototype._updateScaleBanner = function () {
    if (!this.scaleBannerEl) return;
    if (this._shouldShowScaleGuard()) {
      this.scaleBannerEl.hidden = false;
      this.scaleBannerEl.innerHTML =
        '<strong>Large region (' + this.allMembers.length + ' ambassadors).</strong> ' +
        'Use <em>Focus</em> to view one leader’s organization, or <em>Leaders only</em>. ' +
        '<button type="button" class="dos-tree-scale-link" data-action="show-full">Show full tree anyway</button>';
      var self = this;
      var link = this.scaleBannerEl.querySelector('[data-action="show-full"]');
      if (link) {
        link.onclick = function () {
          self.forceFullTree = true;
          applyFullNetworkDefaultCollapse(self.rdCode, self.allMembers, self.graph, self.collapsed);
          self._updateScaleBanner();
          self._paint(true);
        };
      }
    } else if (this.focusRootId) {
      this.scaleBannerEl.hidden = false;
      var m = this.graph.byId[this.focusRootId];
      this.scaleBannerEl.innerHTML =
        'Showing organization for <strong>' + escapeHtml(m ? m.name : this.focusRootId) + '</strong> ' +
        '<button type="button" class="dos-tree-scale-link" data-action="clear-focus">Show full diagram</button>';
      var clearBtn = this.scaleBannerEl.querySelector('[data-action="clear-focus"]');
      if (clearBtn) clearBtn.onclick = function () { self.setFocusRoot(''); };
    } else {
      this.scaleBannerEl.hidden = true;
      this.scaleBannerEl.innerHTML = '';
    }
  };

  TreeController.prototype._renderScaleGuard = function () {
    var self = this;
    var leaders = this.allMembers.filter(function (m) { return m.recruits > 0; })
      .sort(function (a, b) { return b.recruits - a.recruits; });
    var html = '<div class="dos-tree-scale-panel">' +
      '<h5>Large regional network</h5>' +
      '<p>' + this.allMembers.length + ' paid ambassadors — opening the full tree at once is slow and hard to read.</p>' +
      '<p class="dos-tree-scale-panel-sub">Pick a recruitment leader to view their organization, or switch to <strong>Leaders only</strong>.</p>' +
      '<div class="dos-tree-scale-leaders">';
    leaders.forEach(function (m) {
      html += '<button type="button" class="dos-tree-scale-leader-btn" data-focus-id="' + escapeHtml(m.id) + '">' +
        '<strong>' + escapeHtml(shortName(m.name, 32)) + '</strong>' +
        '<span>' + escapeHtml(m.id) + ' · ' + m.recruits + ' recruit' + (m.recruits === 1 ? '' : 's') + '</span></button>';
    });
    html += '</div>' +
      '<button type="button" class="dos-tree-scale-show-full" data-action="show-full">Show full tree anyway (collapsed)</button>' +
      '</div>';
    this.scalerEl.innerHTML = html;
    this.scalerEl.style.width = '';
    this.scalerEl.style.height = '';
    this.scalerEl.querySelectorAll('[data-focus-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.setFocusRoot(btn.getAttribute('data-focus-id'));
      });
    });
    var showFull = this.scalerEl.querySelector('[data-action="show-full"]');
    if (showFull) {
      showFull.addEventListener('click', function () {
        self.forceFullTree = true;
        applyFullNetworkDefaultCollapse(self.rdCode, self.allMembers, self.graph, self.collapsed);
        self._updateScaleBanner();
        self._paint(true);
      });
    }
    this._renderDetail(this.selectedId);
  };

  TreeController.prototype._nodeHtml = function (id, m, ln, selected, dimmed, membersById) {
    var isRoot = id === this.rootCode;
    var classes = ['dos-genealogy-node'];
    if (m && m.isPipeline) {
      classes.push('is-pipeline');
    } else if (isRoot) {
      classes.push(this.rootKind === 'rd' ? 'is-rd' : (this.rootMember && this.rootMember.isSenior ? 'is-senior' : 'is-developing'));
    } else if (m && m.isSenior) classes.push('is-senior');
    else if (m && m.isDeveloping) classes.push('is-developing');
    else classes.push('is-ambassador');
    if (selected) classes.push('is-selected');
    if (dimmed) classes.push('is-dimmed');

    var name = isRoot ? this.rootName : (m && m.name);
    var wrapStyle = 'left:' + ln.x + 'px;top:' + ln.y + 'px;width:' + ln.w + 'px;min-height:' + ln.h + 'px';
    var hasBranch = !isRoot && !m.isPipeline && this._nodeHasBranchChildren(id, membersById);
    var isCollapsed = !!this.collapsed[id];

    var html = '<div class="dos-genealogy-node-wrap" style="' + wrapStyle + '">' +
      '<button type="button" class="' + classes.join(' ') + '" data-tree-id="' + escapeHtml(id) + '"' +
      (isRoot ? ' data-tree-root="1"' : '') + '>';

    if (m && m.isPipeline) {
      html += '<span class="dos-gn-badge dos-gn-badge--pipeline">Onboarding</span>';
    } else if (isRoot) {
      html += '<span class="dos-gn-role">' + (this.rootKind === 'rd' ? 'Regional Director' :
        (this.rootMember && this.rootMember.isSenior ? 'Senior Ambassador' : 'Ambassador')) + '</span>';
    } else if (m) {
      html += '<span class="dos-gn-badge">' + escapeHtml(m.isSenior ? 'Senior' : (m.isDeveloping ? 'Developing' : 'Ambassador')) + '</span>';
    }

    html += '<span class="dos-gn-name">' + escapeHtml(shortName(name)) + '</span>';
    html += '<span class="dos-gn-code">' + escapeHtml(m && m.isPipeline ? 'Pending' : id) + '</span>';

    if (m && m.isPipeline) {
      html += '<span class="dos-gn-recruits dos-gn-recruits--muted">Awaiting payment / approval</span>';
    } else if (!isRoot && m) {
      if (m.recruits > 0) {
        html += '<span class="dos-gn-recruits">' + m.recruits + ' verified · ' + m.recruits + '/' + SENIOR_TARGET + ' to Senior</span>';
        if (m.isDeveloping && !m.isSenior) {
          var pct = Math.min(100, Math.round((m.recruits / SENIOR_TARGET) * 100));
          html += '<div class="dos-gn-bar"><div class="dos-gn-bar-fill" style="width:' + pct + '%"></div></div>';
        }
      } else {
        html += '<span class="dos-gn-recruits dos-gn-recruits--muted">No recruits yet</span>';
      }
    }

    html += '</button>';
    if (hasBranch) {
      html += '<button type="button" class="dos-gn-branch-btn" data-branch-toggle="' + escapeHtml(id) + '" aria-label="' +
        (isCollapsed ? 'Expand branch' : 'Collapse branch') + '">' +
        (isCollapsed ? '▸' : '▾') + '</button>';
    }
    html += '</div>';
    return html;
  };

  TreeController.prototype._paint = function (resetView) {
    this._populateFocusSelect();
    this._updateScaleBanner();
    this._syncFocusToolsVisibility();

    if (this._shouldShowScaleGuard()) {
      this._renderScaleGuard();
      if (resetView) this._resetZoom();
      return;
    }

    var members = this._filteredMembers().concat(this._filteredPipeline());
    var membersById = {};
    members.forEach(function (m) { membersById[m.id] = m; });
    if (!membersById[this.rootCode] && this.rootKind === 'leader' && this.rootMember) {
      membersById[this.rootCode] = this.rootMember;
    }

    if (!members.length && !membersById[this.rootCode]) {
      this.scalerEl.innerHTML = '<div class="dos-tree-empty-state">No ambassadors to show for this view.</div>';
      this.scalerEl.style.width = '';
      this.scalerEl.style.height = '';
      this._renderDetail(this.selectedId);
      return;
    }

    var layout = computeSubtreeLayout(this.rootCode, membersById, this.graph.children, this.collapsed);
    this._layout = layout;

    var paths = layout.edges.map(function (e) {
      var em = membersById[e.to];
      var edgeClass = em && em.isPipeline ? 'dos-genealogy-edge is-pipeline-edge' : 'dos-genealogy-edge';
      return '<path class="' + edgeClass + '" d="' + edgePath(e.sourceX, e.sourceY, e.targetX, e.targetY) +
        '" marker-end="url(#dosGenealogyArrow)"/>';
    }).join('');

    var nodesHtml = layout.nodes.map(function (ln) {
      var m = ln.id === this.rootCode ? (this.rootMember || membersById[ln.id] || null) : membersById[ln.id];
      var name = ln.id === this.rootCode ? this.rootName : (m && m.name);
      var match = !this.searchQuery || ln.id.toLowerCase().indexOf(this.searchQuery) >= 0 ||
        String(name).toLowerCase().indexOf(this.searchQuery) >= 0;
      return this._nodeHtml(ln.id, m, ln, this.selectedId === ln.id, this.searchQuery && !match, membersById);
    }.bind(this)).join('');

    this.scalerEl.innerHTML =
      '<svg class="dos-genealogy-svg" width="' + layout.width + '" height="' + layout.height + '" aria-hidden="true">' +
      '<defs>' +
      '<marker id="dosGenealogyArrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto">' +
      '<path d="M2 2 L10 6 L2 10 Z" class="dos-genealogy-arrowhead"/>' +
      '</marker>' +
      '<linearGradient id="dosEdgeGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#34d399"/>' +
      '<stop offset="100%" stop-color="#6ee7b7" stop-opacity="0.85"/>' +
      '</linearGradient></defs>' +
      paths + '</svg>' +
      '<div class="dos-genealogy-nodes">' + nodesHtml + '</div>';

    this.scalerEl.style.width = layout.width + 'px';
    this.scalerEl.style.height = layout.height + 'px';
    this._applyDiagramTransform();

    this._renderDetail(this.selectedId);

    if (resetView) {
      this.zoomLevel = 1;
      var self = this;
      requestAnimationFrame(function () {
        if (self.interactionMode === 'scroll') {
          self.panX = 0;
          self.panY = 0;
          self._applyDiagramTransform();
          self._scrollToRoot();
        } else {
          self._centerDiagramInFullpage();
        }
      });
    }
  };

  TreeController.prototype.refresh = function (members, graph, pipelineMembers) {
    if (this._destroyed) return;
    this.allMembers = members || this.allMembers;
    if (graph) this.graph = graph;
    if (pipelineMembers) this.pipelineMembers = pipelineMembers;
    this._paint(false);
  };

  TreeController.prototype.setView = function (viewId) {
    this.view = viewId || 'leaders';
    this.collapsed = {};
    this.focusRootId = '';
    this.forceFullTree = false;
    try { sessionStorage.removeItem(SESSION_FOCUS_KEY); } catch (e) { /* ignore */ }
    if (this.view === 'full') {
      applyFullNetworkDefaultCollapse(this.rdCode, this.allMembers, this.graph, this.collapsed);
    }
    var stayFullpage = this.interactionMode === 'fullpage';
    this.zoomLevel = 1;
    try {
      sessionStorage.setItem(viewSessionKey(this.rootCode), this.view);
      if (!stayFullpage) sessionStorage.setItem(SESSION_MODE_KEY, 'scroll');
    } catch (e) { /* ignore */ }
    this.mountEl.querySelectorAll('.dos-tree-toggle').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-view') === this.view ? 'true' : 'false');
    }.bind(this));
    if (!stayFullpage) {
      this.interactionMode = 'scroll';
      this.shellEl.classList.remove('is-tree-fullpage');
      document.body.classList.remove('dos-tree-fullpage-open');
      this.canvasEl.classList.add('is-scroll-mode');
      this.canvasEl.classList.remove('is-fullpage-mode');
      this.toolsEl.querySelectorAll('.dos-tree-mode-btn').forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === 'scroll' ? 'true' : 'false');
      });
    }
    this._paint(true);
  };

  TreeController.prototype._syncFocusToolsVisibility = function () {
    var showBranchTools = this.view === 'full' && !this._shouldShowScaleGuard();
    this.toolsEl.querySelectorAll('.dos-tree-tool-btn').forEach(function (btn) {
      btn.style.display = showBranchTools ? '' : 'none';
    });
  };

  TreeController.prototype.selectNode = function (id) {
    this.selectedId = normCode(id) || this.rdCode;
    this._paint(false);
    var cards = this.scalerEl.querySelectorAll('[data-tree-id]');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-tree-id') === this.selectedId) {
        cards[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        break;
      }
    }
  };

  TreeController.prototype.focusNode = function (id) { this.selectNode(id); };

  /** Scale 2 explorer — reveal ambassador in genealogy and scroll diagram to them. */
  TreeController.prototype.openAmbassadorInTree = function (id) {
    var nid = normCode(id);
    var m = this.graph.byId && this.graph.byId[nid];
    if (!m) return;

    if (m.recruits > 0) {
      this.setFocusRoot(nid);
      var self = this;
      requestAnimationFrame(function () { self.selectNode(nid); });
    } else {
      this.focusRootId = '';
      this.forceFullTree = true;
      this.view = 'full';
      try { sessionStorage.setItem(viewSessionKey(this.rootCode), 'full'); } catch (e) { /* ignore */ }
      this.mountEl.querySelectorAll('.dos-tree-toggle').forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-view') === 'full' ? 'true' : 'false');
      });
      applyFullNetworkDefaultCollapse(this.rdCode, this.allMembers, this.graph, this.collapsed);
      uncollapsePathToNode(nid, this.rdCode, this.graph, this.collapsed);
      this._populateFocusSelect();
      this._updateScaleBanner();
      this._paint(true);
      this.selectNode(nid);
    }

    var treeMount = this.mountEl;
    if (treeMount && treeMount.scrollIntoView) {
      treeMount.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  TreeController.prototype.destroy = function () {
    this._destroyed = true;
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    if (this.canvasEl && this._onTouchStart) {
      this.canvasEl.removeEventListener('touchstart', this._onTouchStart);
      this.canvasEl.removeEventListener('touchmove', this._onTouchMove);
      this.canvasEl.removeEventListener('touchend', this._onTouchEnd);
      this.canvasEl.removeEventListener('touchcancel', this._onTouchEnd);
    }
    exitFullpageDomState();
    clearStoredFullpageMode();
    this.mountEl.innerHTML = '';
  };

  TreeController.prototype._renderDetail = function (id) {
    if (!this.detailEl) return;
    var nid = normCode(id);

    if (nid === this.rootCode) {
      var leaders = this.allMembers.filter(function (m) { return m.recruits > 0; });
      var pipelineN = this.pipelineMembers.length;
      var rootView = memberViewForRoot(this);
      var rootKicker = this.rootKind === 'rd' ? 'Regional Director' : 'Your organization';
      var metricsHtml = this.rootKind === 'rd'
        ? '<div><span class="val">' + (this.stats.totalAmbassadors || this.allMembers.length) + '</span><span class="lbl">in region</span></div>' +
          '<div><span class="val">' + (this.stats.directToRd || 0) + '</span><span class="lbl">direct</span></div>' +
          '<div><span class="val">' + leaders.length + '</span><span class="lbl">leaders</span></div>' +
          (pipelineN ? '<div><span class="val">' + pipelineN + '</span><span class="lbl">onboarding</span></div>' : '')
        : '<div><span class="val">' + this.allMembers.length + '</span><span class="lbl">in org</span></div>' +
          '<div><span class="val">' + leaders.length + '</span><span class="lbl">leaders</span></div>' +
          (pipelineN ? '<div><span class="val">' + pipelineN + '</span><span class="lbl">onboarding</span></div>' : '');
      this.detailEl.innerHTML =
        '<div class="dos-tree-detail-card">' +
        '<p class="dos-tree-detail-kicker">' + rootKicker + '</p>' +
        '<h5>' + escapeHtml(this.rootName) + '</h5>' +
        '<code class="dos-tree-detail-id">' + escapeHtml(this.rootCode) + '</code>' +
        renderContactSection(rootView) +
        renderProfileSection(rootView) +
        '<p class="dos-tree-detail-h">Network</p>' +
        '<div class="dos-tree-detail-metrics">' + metricsHtml + '</div>' +
        (this.rootKind === 'rd' && leaders.length
          ? '<p class="dos-tree-detail-h">Recruitment leaders</p><ul class="dos-tree-leader-list">' +
            leaders.map(function (l) {
              return '<li><strong>' + escapeHtml(l.name) + '</strong> <em>' + l.recruits + '</em></li>';
            }).join('') + '</ul>'
          : '') +
        '</div>';
      return;
    }

    var m = this.graph.byId && this.graph.byId[nid];
    if (!m) {
      this.detailEl.innerHTML = '<p class="dos-tree-detail-muted">Click a node in the diagram.</p>';
      return;
    }

    if (m.isPipeline) {
      this.detailEl.innerHTML =
        '<div class="dos-tree-detail-card">' +
        '<p class="dos-tree-detail-kicker">Onboarding</p>' +
        '<h5>' + escapeHtml(m.name) + '</h5>' +
        '<code class="dos-tree-detail-id">' + escapeHtml(m.pipelineRef || m.id) + '</code>' +
        renderContactSection(m) +
        renderProfileSection(m) +
        '<p class="dos-tree-detail-line">Recruited by <code>' + escapeHtml(m.recruitedBy === this.rootCode ? 'You' : m.recruitedBy) + '</code></p>' +
        '<p class="dos-tree-detail-muted">Not counted toward Senior rank until activated.</p></div>';
      return;
    }

    var recruitedBy = m.recruitedBy === this.rootCode ? 'You' : m.recruitedBy;
    var recruitsHtml = '';
    if (m.directRecruitList && m.directRecruitList.length) {
      recruitsHtml = '<p class="dos-tree-detail-h">Direct recruits</p><ul class="dos-tree-recruit-list">' +
        m.directRecruitList.map(function (c) {
          return '<li><strong>' + escapeHtml(c.name) + '</strong><code>' + escapeHtml(c.id) + '</code></li>';
        }).join('') + '</ul>';
    }

    var focusBtn = '';
    if (m.recruits > 0) {
      focusBtn = '<button type="button" class="dos-tree-detail-focus-btn" data-focus-id="' + escapeHtml(m.id) +
        '">View this organization in tree</button>';
    }

    var pct = Math.min(100, Math.round((m.recruits / SENIOR_TARGET) * 100));
    this.detailEl.innerHTML =
      '<div class="dos-tree-detail-card">' +
      '<p class="dos-tree-detail-kicker">' + escapeHtml(m.isSenior ? 'Senior' : (m.isDeveloping ? 'Developing' : 'Ambassador')) + '</p>' +
      '<h5>' + escapeHtml(m.name) + '</h5>' +
      '<code class="dos-tree-detail-id">' + escapeHtml(m.id) + '</code>' +
      renderContactSection(m) +
      renderProfileSection(m) +
      '<p class="dos-tree-detail-line">Recruited by <code>' + escapeHtml(recruitedBy) + '</code></p>' +
      focusBtn +
      (m.isDeveloping && !m.isSenior
        ? '<div class="dos-tree-senior-progress"><div class="dos-tree-senior-bar"><div style="width:' + pct + '%"></div></div>' +
          '<span>' + m.recruits + ' of ' + SENIOR_TARGET + ' to Senior</span></div>'
        : '<p class="dos-tree-detail-line"><strong>' + m.recruits + '</strong> verified recruits · <strong>' + m.units + '</strong> units</p>') +
      recruitsHtml + '</div>';

    var focusDetailBtn = this.detailEl.querySelector('.dos-tree-detail-focus-btn');
    if (focusDetailBtn) {
      var self = this;
      focusDetailBtn.addEventListener('click', function () {
        self.setFocusRoot(focusDetailBtn.getAttribute('data-focus-id'));
      });
    }
  };

  function memberViewForRoot(ctrl) {
    if (ctrl.rootMember) return ctrl.rootMember;
    if (ctrl.rootProfile) {
      return { id: ctrl.rootCode, name: ctrl.rootName, data: ctrl.rootProfile };
    }
    return { id: ctrl.rootCode, name: ctrl.rootName, data: {} };
  }

  function memberEmail(m) {
    if (m && m.email && !m.data) return String(m.email).trim();
    return (m.data && (m.data.email || m.data.contactEmail)) || '';
  }

  function memberPhone(m) {
    if (m && m.phone && !m.data) return String(m.phone).trim();
    var d = m && m.data;
    return String((d && (d.phoneE164 || d.phone || d.phoneNumber)) || '').trim();
  }

  function memberCity(m) {
    var d = m && m.data;
    return String((d && (d.city || d.town)) || '').trim();
  }

  function memberRegion(m) {
    var d = m && m.data;
    return String((d && (d.region || d.state || d.province)) || '').trim();
  }

  function memberStatusLabel(m) {
    if (m && m.isPipeline) {
      var pending = String((m.pipelineStatus || (m.data && m.data.status) || 'pending')).trim();
      return pending.charAt(0).toUpperCase() + pending.slice(1).replace(/_/g, ' ');
    }
    var status = String((m.data && m.data.status) || 'active').trim();
    if (!status) return 'Active';
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  }

  function formatActivatedDate(m) {
    if (m && m.isPipeline) return '';
    var d = m && m.data;
    var ts = d && (d.activated_at || d.activatedAt || d.activation_date || d.activatedOn || d.created_at || d.createdAt);
    if (!ts) return '';
    var date = null;
    if (typeof ts.toDate === 'function') date = ts.toDate();
    else if (ts.seconds) date = new Date(ts.seconds * 1000);
    else if (typeof ts === 'string' || typeof ts === 'number') date = new Date(ts);
    if (!date || isNaN(date.getTime())) return '';
    try {
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  function phoneDigits(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function renderPhoneValue(phone) {
    if (!phone) {
      return '<span class="dos-tree-detail-muted-inline">Not on file</span>';
    }
    var esc = escapeHtml(phone);
    var digits = phoneDigits(phone);
    var links = '';
    if (digits.length >= 8) {
      var waDigits = digits.indexOf('237') === 0 ? digits : digits;
      links = ' <a class="dos-tree-detail-link" href="https://wa.me/' + waDigits + '" target="_blank" rel="noopener">WhatsApp</a>' +
        ' <a class="dos-tree-detail-link" href="tel:+' + waDigits + '">Call</a>';
    }
    return '<code>' + esc + '</code>' + links;
  }

  function renderEmailValue(email) {
    if (!email) {
      return '<span class="dos-tree-detail-muted-inline">Not on file</span>';
    }
    var esc = escapeHtml(email);
    return '<a class="dos-tree-detail-link" href="mailto:' + esc + '">' + esc + '</a>';
  }

  function renderDetailRow(label, valueHtml) {
    return '<p class="dos-tree-detail-line"><span class="dos-tree-detail-label">' + escapeHtml(label) + '</span> ' + valueHtml + '</p>';
  }

  function renderContactSection(m) {
    return '<p class="dos-tree-detail-h">Contact</p>' +
      renderDetailRow('Phone', renderPhoneValue(memberPhone(m))) +
      renderDetailRow('Email', renderEmailValue(memberEmail(m)));
  }

  function renderProfileSection(m) {
    var city = memberCity(m);
    var region = memberRegion(m);
    var location = city && region ? city + ', ' + region : (city || region || '');
    var activated = formatActivatedDate(m);
    var statusNote = m && m.isPipeline ? 'Pending payment / admin approval' : memberStatusLabel(m);
    return '<p class="dos-tree-detail-h">Profile</p>' +
      renderDetailRow('Location', location
        ? escapeHtml(location)
        : '<span class="dos-tree-detail-muted-inline">Not on file</span>') +
      renderDetailRow('Status', escapeHtml(statusNote)) +
      (activated ? renderDetailRow('Activated', escapeHtml(activated)) : '');
  }

  function clearStoredFullpageMode() {
    try { sessionStorage.setItem(SESSION_MODE_KEY, 'scroll'); } catch (e) { /* ignore */ }
  }

  function exitFullpageDomState() {
    document.body.classList.remove('dos-tree-fullpage-open');
  }

  var html2canvasLoadPromise = null;

  function loadHtml2Canvas() {
    if (global.html2canvas) return Promise.resolve(global.html2canvas);
    if (html2canvasLoadPromise) return html2canvasLoadPromise;
    html2canvasLoadPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = function () { resolve(global.html2canvas); };
      script.onerror = function () {
        html2canvasLoadPromise = null;
        reject(new Error('Could not load image export library.'));
      };
      document.head.appendChild(script);
    });
    return html2canvasLoadPromise;
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  TreeController.prototype.exportDiagramPng = function (triggerBtn) {
    var self = this;
    if (!this.scalerEl || !this._layout) {
      window.alert('Open the genealogy tree first, then export.');
      return Promise.reject(new Error('No diagram'));
    }
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.setAttribute('aria-busy', 'true');
    }
    return loadHtml2Canvas().then(function (html2canvas) {
      return html2canvas(self.scalerEl, {
        backgroundColor: '#121214',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        logging: false
      });
    }).then(function (canvas) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob) throw new Error('PNG export failed');
          var stamp = new Date().toISOString().slice(0, 10);
          downloadBlob(blob, 'genealogy-' + self.rdCode + '-' + stamp + '.png');
          resolve();
        }, 'image/png');
      });
    }).catch(function (err) {
      window.alert(err.message || 'Could not export diagram image.');
    }).finally(function () {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.removeAttribute('aria-busy');
      }
    });
  };

  var activeController = null;

  function init(mountEl, options) {
    if (!mountEl) return null;
    if (activeController) activeController.destroy();
    activeController = new TreeController(mountEl, options);
    return activeController;
  }

  function destroy() {
    if (activeController) { activeController.destroy(); activeController = null; }
    else exitFullpageDomState();
  }

  function focusSubtree(id) {
    if (activeController) activeController.setFocusRoot(id);
  }

  function openAmbassadorInTree(id) {
    if (activeController) activeController.openAmbassadorInTree(id);
  }

  function exportDiagramPng(triggerBtn) {
    if (!activeController) {
      window.alert('Genealogy tree is not loaded yet.');
      return Promise.reject(new Error('No tree'));
    }
    return activeController.exportDiagramPng(triggerBtn);
  }

  global.DOSRdNetworkTree = {
    init: init,
    destroy: destroy,
    focusSubtree: focusSubtree,
    openAmbassadorInTree: openAmbassadorInTree,
    exportDiagramPng: exportDiagramPng
  };
})(typeof window !== 'undefined' ? window : global);
