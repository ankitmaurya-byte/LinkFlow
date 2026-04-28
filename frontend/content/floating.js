// Floating LinkFlow widget injected on every page.
// Bubble in bottom-right; hover to expand quick actions + recent links.

(function () {
  if (window.__linkflowFloatingInjected) return;
  window.__linkflowFloatingInjected = true;

  const browserApi = (typeof browser !== 'undefined') ? browser : chrome;

  const STORAGE_KEY = 'floatingPosition';
  const BUBBLE = 48;
  let currentPos = { x: 16, y: 16, anchor: 'tl' }; // anchor: which corner to derive from
  let panelSide = 'right'; // 'right' | 'left' | 'top' | 'bottom' depending on bubble pos

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
    const cx = Math.max(0, Math.min(x, vw - BUBBLE));
    const cy = Math.max(0, Math.min(y, vh - BUBBLE));
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
  });

  const style = document.createElement('style');
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .wrap {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #111827;
      position: relative;
      width: 48px;
      height: 48px;
    }
    .panel {
      position: fixed;
      left: 0;
      top: 0;
    }
    .bubble {
      position: absolute;
      inset: 0;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 22px;
      cursor: grab;
      user-select: none;
      touch-action: none;
      transition: box-shadow 0.2s;
    }
    .bubble:hover {
      box-shadow: 0 6px 20px rgba(124, 58, 237, 0.55);
    }
    .bubble.dragging {
      cursor: grabbing;
      box-shadow: 0 8px 22px rgba(124, 58, 237, 0.6);
    }
    .panel {
      width: 720px;
      height: 560px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      overflow: hidden;
      display: none;
      flex-direction: column;
    }
    .wrap.open .panel { display: flex; }
    .panel-head {
      padding: 8px 12px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      font-size: 14px;
      flex-shrink: 0;
    }
    .panel-frame {
      flex: 1;
      width: 100%;
      border: 0;
    }
    .close-btn {
      background: transparent;
      border: 0;
      cursor: pointer;
      font-size: 20px;
      color: #6b7280;
      padding: 0 6px;
      line-height: 1;
    }
    .close-btn:hover { color: #111827; }
  `;
  root.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `<iframe class="panel-frame" data-frame title="LinkFlow"></iframe>`;
  const frame = panel.querySelector('[data-frame]');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.title = 'LinkFlow';
  bubble.textContent = '⬡';

  wrap.append(panel, bubble);
  root.appendChild(wrap);
  document.documentElement.appendChild(host);

  let closeTimer = null;
  let dragLock = false;
  const PANEL_W = 720;
  const PANEL_H = 560;
  const GAP = 0;

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
      { x: bx + BUBBLE + GAP,           y: by },                       // right of bubble
      { x: bx - GAP - pw,               y: by },                       // left of bubble
      { x: bx,                          y: by + BUBBLE + GAP },        // below bubble
      { x: bx,                          y: by - GAP - ph },            // above bubble
      { x: bx + BUBBLE + GAP,           y: by + BUBBLE - ph },         // right, aligned bottom
      { x: bx - GAP - pw,               y: by + BUBBLE - ph },         // left, aligned bottom
    ];

    const fitsViewport = (c) => c.x >= 0 && c.y >= 0 && c.x + pw <= vw && c.y + ph <= vh;
    let chosen = candidates.find(fitsViewport);

    if (!chosen) {
      // No clean fit — dock panel adjacent to whichever side of bubble has most room
      // so the bubble always sits on panel's outer boundary, never overlapping it.
      const sides = [
        { side: 'left',   space: bx },
        { side: 'right',  space: vw - (bx + BUBBLE) },
        { side: 'top',    space: by },
        { side: 'bottom', space: vh - (by + BUBBLE) }
      ].sort((a, b) => b.space - a.space);
      const best = sides[0];
      let cx, cy;
      if (best.side === 'left') {
        cx = bx - pw;
        cy = Math.max(0, Math.min(by, vh - ph));
      } else if (best.side === 'right') {
        cx = bx + BUBBLE;
        cy = Math.max(0, Math.min(by, vh - ph));
      } else if (best.side === 'top') {
        cx = Math.max(0, Math.min(bx, vw - pw));
        cy = by - ph;
      } else {
        cx = Math.max(0, Math.min(bx, vw - pw));
        cy = by + BUBBLE;
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
    if (dragLock) return;
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
      wrap.classList.remove('open');
    }
    if (dragState.moved) {
      const next = clampToViewport(dragState.origX + dx, dragState.origY + dy);
      applyHostPosition(next);
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
      openPanel();
    }
  };
  bubble.addEventListener('pointerup', endDrag);
  bubble.addEventListener('pointercancel', endDrag);

  bubble.addEventListener('mouseenter', () => { if (!dragState) openPanel(); });
  panel.addEventListener('mouseenter', openPanel);
  wrap.addEventListener('mouseleave', schedClose);

  loadSavedPosition();

})();
