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
      position: absolute;
    }
    /* Panel anchors based on free-position bubble */
    :host([data-side="right"])  .panel { top: 0;    left: 56px; }
    :host([data-side="left"])   .panel { top: 0;    right: 56px; }
    :host([data-side="tr"])     .panel { bottom: 56px; left: 0; }
    :host([data-side="tl"])     .panel { bottom: 56px; right: 0; }
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
  let savedDisplayPos = null; // bubble position before panel-fit nudge
  const PANEL_W = 720;
  const PANEL_H = 560;
  const GAP = 8;

  const ensureFrameLoaded = () => {
    if (!frame.src) {
      frame.src = browserApi.runtime.getURL('popup/popup.html') + '?embed=1';
    }
  };

  function fitPanelToViewport() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pos = currentPos;

    // Side ordering by available space — try the one with most room first
    const sides = [
      { id: 'right', space: vw - (pos.x + BUBBLE) },
      { id: 'left',  space: pos.x },
      { id: 'tr',    space: pos.y },     // panel above
      { id: 'tl',    space: pos.y }
    ].sort((a, b) => b.space - a.space);

    for (const s of sides) {
      const fit = tryFit(s.id, pos, vw, vh);
      if (fit.ok) {
        applyHostPosition(fit.pos);
        host.setAttribute('data-side', s.id);
        return;
      }
    }
    // Fallback: pick widest side and nudge bubble fully into viewport
    const best = sides[0];
    const fallback = forceFit(best.id, pos, vw, vh);
    applyHostPosition(fallback);
    host.setAttribute('data-side', best.id);
  }

  function tryFit(side, pos, vw, vh) {
    let { x, y } = pos;
    const okPos = (px, py) => ({ ok: true, pos: { x: px, y: py } });
    if (side === 'right') {
      if (x + BUBBLE + GAP + PANEL_W <= vw && y + PANEL_H <= vh) return okPos(x, y);
    } else if (side === 'left') {
      if (x - GAP - PANEL_W >= 0 && y + PANEL_H <= vh) return okPos(x, y);
    } else if (side === 'tr') {
      if (y - GAP - PANEL_H >= 0 && x + PANEL_W <= vw) return okPos(x, y);
    } else if (side === 'tl') {
      if (y - GAP - PANEL_H >= 0 && x + BUBBLE - PANEL_W >= 0) return okPos(x, y);
    }
    return { ok: false };
  }

  function forceFit(side, pos, vw, vh) {
    let { x, y } = pos;
    if (side === 'right') {
      x = Math.max(0, Math.min(x, vw - BUBBLE - GAP - PANEL_W));
      y = Math.max(0, Math.min(y, vh - Math.max(BUBBLE, PANEL_H)));
    } else if (side === 'left') {
      x = Math.max(GAP + PANEL_W, Math.min(x, vw - BUBBLE));
      y = Math.max(0, Math.min(y, vh - Math.max(BUBBLE, PANEL_H)));
    } else if (side === 'tr') {
      x = Math.max(0, Math.min(x, vw - PANEL_W));
      y = Math.max(GAP + PANEL_H, Math.min(y, vh - BUBBLE));
    } else if (side === 'tl') {
      x = Math.max(PANEL_W - BUBBLE, Math.min(x, vw - BUBBLE));
      y = Math.max(GAP + PANEL_H, Math.min(y, vh - BUBBLE));
    }
    return clampToViewport(x, y);
  }

  const openPanel = () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (!savedDisplayPos) savedDisplayPos = { x: currentPos.x, y: currentPos.y };
    fitPanelToViewport();
    wrap.classList.add('open');
    ensureFrameLoaded();
  };
  const schedClose = () => {
    if (dragLock) return;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      wrap.classList.remove('open');
      if (savedDisplayPos) {
        applyHostPosition(clampToViewport(savedDisplayPos.x, savedDisplayPos.y));
        savedDisplayPos = null;
      }
    }, 350);
  };

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
      savedDisplayPos = null;
      savePosition(currentPos);
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
