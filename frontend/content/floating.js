// Floating LinkFlow widget injected on every page.
// Bubble in bottom-right; hover to expand quick actions + recent links.

(function () {
  if (window.__linkflowFloatingInjected) return;
  window.__linkflowFloatingInjected = true;

  const browserApi = (typeof browser !== 'undefined') ? browser : chrome;

  const STORAGE_KEY = 'floatingPosition';
  const BUBBLE_W = 100;
  const BUBBLE_H = 79;
  let currentPos = { x: 16, y: 16, anchor: 'tl' }; // anchor: which corner to derive from

  const host = document.createElement('div');
  host.id = 'linkflow-floating-host';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  applyHostPosition(currentPos);

  function applyHostPosition(pos) {
    currentPos = pos;
    host.style.left = `${pos.x}px`;
    host.style.top = `${pos.y}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    if (!host.getAttribute('data-side')) host.setAttribute('data-side', 'right');
  }

  function clampToViewport(x, y) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = Math.max(0, Math.min(x, vw - BUBBLE_W));
    const cy = Math.max(0, Math.min(y, vh - BUBBLE_H));
    return { x: cx, y: cy };
  }

  async function loadSavedPosition() {
    try {
      const data = await browserApi.storage.local.get([STORAGE_KEY]);
      const saved = data[STORAGE_KEY];
      if (saved && typeof saved === 'object' && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        applyHostPosition(clampToViewport(saved.x, saved.y));
      }
    } catch (_) {}
  }

  async function savePosition(pos) {
    try { await browserApi.storage.local.set({ [STORAGE_KEY]: { x: pos.x, y: pos.y } }); } catch (_) {}
  }

  window.addEventListener('resize', () => {
    applyHostPosition(clampToViewport(currentPos.x, currentPos.y));
    // Clamp panel to new viewport
    PANEL_W = clampSize(PANEL_W, PANEL_MIN_W, window.innerWidth - 16);
    PANEL_H = clampSize(PANEL_H, PANEL_MIN_H, window.innerHeight - 16);
    if (wrap.classList.contains('open')) positionPanel();
  });

  const style = document.createElement('style');
  style.textContent = `
    :host, * { box-sizing: border-box; border-radius: 0 !important; }
    .wrap {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #111827;
      position: relative;
      width: 100px;
      height: 79px;
    }
    .panel {
      position: fixed;
      left: 0;
      top: 0;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(24, 29, 38, 0.12), 0 0 0 1px #dddddd;
      overflow: hidden;
    }
    .bubble {
      position: absolute;
      inset: 0;
      width: 100px;
      height: 79px;
      background: transparent;
      display: block;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }
    .bubble img {
      width: 100px;
      height: 79px;
      display: block;
      pointer-events: none;
    }
    .bubble.dragging {
      cursor: grabbing;
    }
    .bubble.locked::after {
      content: '';
      position: absolute;
      inset: 0;
      background-color: rgba(24, 29, 38, 0.55);
      background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='28' height='28' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0110 0v4'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: center;
      pointer-events: none;
    }
    .panel {
      width: 720px;
      height: 560px;
      min-width: 400px;
      min-height: 300px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
      background: #ffffff;
      box-shadow: 0 10px 30px rgba(24, 29, 38, 0.12), 0 0 0 1px #dddddd;
      overflow: hidden;
      display: none;
      flex-direction: column;
    }
    .wrap.open .panel { display: flex; }
    .panel-frame {
      flex: 1;
      width: 100%;
      border: 0;
    }
    .resize-handle {
      position: absolute;
      width: 16px;
      height: 16px;
      z-index: 10;
      background: transparent;
    }
    .resize-handle.br { right: 0; bottom: 0; cursor: nwse-resize; }
    .resize-handle::after {
      content: '';
      position: absolute;
      width: 8px; height: 8px;
      background: linear-gradient(135deg, transparent 50%, #9297a0 50%);
    }
    .resize-handle.br::after { right: 2px; bottom: 2px; }
  `;
  root.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <iframe class="panel-frame" data-frame title="LinkFlow"></iframe>
    <div class="resize-handle br" data-corner="br"></div>
  `;
  const frame = panel.querySelector('[data-frame]');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.title = 'LinkFlow';
  const bubbleIcon = document.createElement('img');
  bubbleIcon.src = browserApi.runtime.getURL('icons/float.svg');
  bubbleIcon.alt = 'LinkFlow';
  bubbleIcon.draggable = false;
  bubble.appendChild(bubbleIcon);

  wrap.append(panel, bubble);
  root.appendChild(wrap);
  document.documentElement.appendChild(host);

  let closeTimer = null;
  let dragLock = false;
  let userLock = false;
  let dismissedByClick = false;
  const DEFAULT_PANEL_W = 720;
  const DEFAULT_PANEL_H = 560;
  const PANEL_MIN_W = 400;
  const PANEL_MIN_H = 300;
  let PANEL_W = DEFAULT_PANEL_W;
  let PANEL_H = DEFAULT_PANEL_H;
  const SIZE_KEY = 'floatingPanelSize';
  const GAP = 0;

  async function loadSavedSize() {
    try {
      const data = await browserApi.storage.local.get([SIZE_KEY]);
      const s = data[SIZE_KEY];
      if (s && Number.isFinite(s.w) && Number.isFinite(s.h)) {
        PANEL_W = clampSize(s.w, PANEL_MIN_W, window.innerWidth - 16);
        PANEL_H = clampSize(s.h, PANEL_MIN_H, window.innerHeight - 16);
      }
    } catch (_) {}
  }
  function clampSize(v, lo, hi) { return Math.max(lo, Math.min(v, hi)); }
  async function saveSize(w, h) {
    try { await browserApi.storage.local.set({ [SIZE_KEY]: { w, h } }); } catch (_) {}
  }

  const ensureFrameLoaded = () => {
    if (!frame.src) {
      frame.src = browserApi.runtime.getURL('popup/popup.html') + '?embed=1';
    }
  };

  // Position panel in viewport coords near bubble; bubble doesn't move.
  function positionPanel() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bx = currentPos.x;
    const by = currentPos.y;
    const pw = Math.min(PANEL_W, vw - 16);
    const ph = Math.min(PANEL_H, vh - 16);

    // Candidates relative to bubble, in priority order.
    const candidates = [
      { x: bx + BUBBLE_W + GAP,         y: by },                         // right of bubble
      { x: bx - GAP - pw,               y: by },                         // left of bubble
      { x: bx,                          y: by + BUBBLE_H + GAP },        // below bubble
      { x: bx,                          y: by - GAP - ph },              // above bubble
      { x: bx + BUBBLE_W + GAP,         y: by + BUBBLE_H - ph },         // right, aligned bottom
      { x: bx - GAP - pw,               y: by + BUBBLE_H - ph },         // left, aligned bottom
    ];

    const fitsViewport = (c) => c.x >= 0 && c.y >= 0 && c.x + pw <= vw && c.y + ph <= vh;
    let chosen = candidates.find(fitsViewport);

    if (!chosen) {
      const sides = [
        { side: 'left',   space: bx },
        { side: 'right',  space: vw - (bx + BUBBLE_W) },
        { side: 'top',    space: by },
        { side: 'bottom', space: vh - (by + BUBBLE_H) }
      ].sort((a, b) => b.space - a.space);
      const best = sides[0];
      let cx, cy;
      if (best.side === 'left') {
        cx = bx - pw;
        cy = Math.max(0, Math.min(by, vh - ph));
      } else if (best.side === 'right') {
        cx = bx + BUBBLE_W;
        cy = Math.max(0, Math.min(by, vh - ph));
      } else if (best.side === 'top') {
        cx = Math.max(0, Math.min(bx, vw - pw));
        cy = by - ph;
      } else {
        cx = Math.max(0, Math.min(bx, vw - pw));
        cy = by + BUBBLE_H;
      }
      chosen = { x: cx, y: cy };
    }

    panel.style.left = `${chosen.x}px`;
    panel.style.top = `${chosen.y}px`;
    panel.style.width = `${pw}px`;
    panel.style.height = `${ph}px`;
  }

  const openPanel = () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    positionPanel();
    wrap.classList.add('open');
    ensureFrameLoaded();
  };
  const schedClose = () => {
    if (dragLock || userLock || dragState || resizeState) return;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => wrap.classList.remove('open'), 350);
  };

  window.addEventListener('scroll', () => {
    if (wrap.classList.contains('open')) positionPanel();
  }, true);

  window.addEventListener('message', (e) => {
    if (e?.data?.type !== 'linkflow-drag') return;
    if (e.data.state === 'start') {
      dragLock = true;
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    } else {
      dragLock = false;
    }
  });

  // Drag-to-position
  let dragState = null;
  bubble.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    bubble.setPointerCapture(e.pointerId);
    dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: currentPos.x,
      origY: currentPos.y,
      moved: false
    };
  });
  bubble.addEventListener('pointermove', (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      dragState.moved = true;
      bubble.classList.add('dragging');
      // Keep panel open while dragging so it follows the bubble.
    }
    if (dragState.moved) {
      const next = clampToViewport(dragState.origX + dx, dragState.origY + dy);
      applyHostPosition(next);
      if (wrap.classList.contains('open')) positionPanel();
    }
  });
  const endDrag = (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const moved = dragState.moved;
    dragState = null;
    bubble.classList.remove('dragging');
    if (moved) {
      const clamped = clampToViewport(currentPos.x, currentPos.y);
      applyHostPosition(clamped);
      savePosition(clamped);
    } else {
      // Click toggles panel. If in lock mode → unlock + close.
      if (userLock) {
        userLock = false;
        bubble.classList.remove('locked');
        wrap.classList.remove('open');
        dismissedByClick = true;
      } else if (wrap.classList.contains('open')) {
        wrap.classList.remove('open');
        dismissedByClick = true;
      } else {
        dismissedByClick = false;
        openPanel();
      }
    }
  };
  bubble.addEventListener('pointerup', endDrag);
  bubble.addEventListener('pointercancel', endDrag);

  bubble.addEventListener('mouseenter', () => {
    if (!dragState && !dismissedByClick) openPanel();
  });
  panel.addEventListener('mouseenter', openPanel);
  wrap.addEventListener('mouseleave', () => {
    dismissedByClick = false;
    schedClose();
  });

  // Double-click bubble toggles lock — while locked, mouseleave never closes panel.
  bubble.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    e.preventDefault();
    userLock = !userLock;
    bubble.classList.toggle('locked', userLock);
    if (userLock) {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      openPanel();
    }
  });

  loadSavedPosition();
  loadSavedSize();

  // === Resize handles ===
  let resizeState = null;
  panel.querySelectorAll('.resize-handle').forEach(h => {
    h.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      resizeState = {
        pointerId: e.pointerId,
        corner: h.dataset.corner,
        startX: e.clientX,
        startY: e.clientY,
        startW: PANEL_W,
        startH: PANEL_H
      };
    });
    h.addEventListener('pointermove', (e) => {
      if (!resizeState || resizeState.pointerId !== e.pointerId) return;
      const dx = e.clientX - resizeState.startX;
      const dy = e.clientY - resizeState.startY;
      const c = resizeState.corner;
      let w = resizeState.startW;
      let hh = resizeState.startH;
      if (c === 'br' || c === 'tr') w = resizeState.startW + dx;
      if (c === 'bl' || c === 'tl') w = resizeState.startW - dx;
      if (c === 'br' || c === 'bl') hh = resizeState.startH + dy;
      if (c === 'tr' || c === 'tl') hh = resizeState.startH - dy;
      PANEL_W = clampSize(w, PANEL_MIN_W, window.innerWidth - 16);
      PANEL_H = clampSize(hh, PANEL_MIN_H, window.innerHeight - 16);
      positionPanel();
    });
    const endResize = (e) => {
      if (!resizeState || resizeState.pointerId !== e.pointerId) return;
      resizeState = null;
      saveSize(PANEL_W, PANEL_H);
    };
    h.addEventListener('pointerup', endResize);
    h.addEventListener('pointercancel', endResize);
  });

})();
