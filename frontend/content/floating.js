// Floating LinkFlow widget injected on every page.
// Bubble in bottom-right; hover to expand quick actions + recent links.

(function () {
  if (window.__linkflowFloatingInjected) return;
  window.__linkflowFloatingInjected = true;

  const browserApi = (typeof browser !== 'undefined') ? browser : chrome;

  const POSITIONS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  const STORAGE_KEY = 'floatingPosition';
  let currentPos = 'top-left';

  const host = document.createElement('div');
  host.id = 'linkflow-floating-host';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  applyHostPosition('top-left');
  const root = host.attachShadow({ mode: 'open' });

  function applyHostPosition(pos) {
    currentPos = pos;
    host.setAttribute('data-pos', pos);
    host.style.top = (pos === 'top-left' || pos === 'top-right') ? '16px' : 'auto';
    host.style.bottom = (pos === 'bottom-left' || pos === 'bottom-right') ? '16px' : 'auto';
    host.style.left = (pos === 'top-left' || pos === 'bottom-left') ? '16px' : 'auto';
    host.style.right = (pos === 'top-right' || pos === 'bottom-right') ? '16px' : 'auto';
  }

  async function loadSavedPosition() {
    try {
      const data = await browserApi.storage.local.get([STORAGE_KEY]);
      const saved = data[STORAGE_KEY];
      if (saved && POSITIONS.includes(saved)) applyHostPosition(saved);
    } catch (_) {}
  }

  async function savePosition(pos) {
    try { await browserApi.storage.local.set({ [STORAGE_KEY]: pos }); } catch (_) {}
  }

  function cyclePosition() {
    const idx = POSITIONS.indexOf(currentPos);
    const next = POSITIONS[(idx + 1) % POSITIONS.length];
    applyHostPosition(next);
    savePosition(next);
  }

  const style = document.createElement('style');
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .wrap {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #111827;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;
    }
    :host([data-pos="top-left"]) .wrap { align-items: flex-start; flex-direction: column-reverse; }
    :host([data-pos="top-right"]) .wrap { align-items: flex-end; flex-direction: column-reverse; }
    :host([data-pos="bottom-left"]) .wrap { align-items: flex-start; flex-direction: column; }
    :host([data-pos="bottom-right"]) .wrap { align-items: flex-end; flex-direction: column; }
    .bubble {
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
      cursor: pointer;
      user-select: none;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(124, 58, 237, 0.55);
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
  const ensureFrameLoaded = () => {
    if (!frame.src) {
      frame.src = browserApi.runtime.getURL('popup/popup.html') + '?embed=1';
    }
  };
  const openPanel = () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    wrap.classList.add('open');
    ensureFrameLoaded();
  };
  const schedClose = () => {
    if (dragLock) return;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => wrap.classList.remove('open'), 350);
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

  bubble.addEventListener('mouseenter', openPanel);
  bubble.addEventListener('click', openPanel);
  bubble.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    e.preventDefault();
    cyclePosition();
    wrap.classList.remove('open');
  });
  panel.addEventListener('mouseenter', openPanel);
  wrap.addEventListener('mouseleave', schedClose);

  loadSavedPosition();

})();
