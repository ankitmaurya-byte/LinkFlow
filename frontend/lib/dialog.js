// Tiny custom alert/confirm dialog. Replaces native alert()/confirm() with
// styled UI. Returns a Promise.

(function () {
  // Inject styles once.
  function ensureStyles() {
    if (document.getElementById('ui-dialog-styles')) return;
    const css = `
      .ui-dialog-overlay { position: fixed; inset: 0; background: rgba(24,29,38,0.4);
        display: flex; align-items: center; justify-content: center; z-index: 99999; }
      .ui-dialog { background: #ffffff; border: 1px solid #dddddd; padding: 24px;
        max-width: 420px; width: 90%; display: flex; flex-direction: column; gap: 16px;
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif); }
      .ui-dialog-title { font-size: 18px; font-weight: 500; color: #181d26; }
      .ui-dialog-body { font-size: 14px; color: #333840; white-space: pre-wrap; line-height: 1.4; }
      .ui-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
    `;
    const style = document.createElement('style');
    style.id = 'ui-dialog-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  let nextId = 0;

  function buildDialog({ message, title, confirm }) {
    ensureStyles();
    return new Promise((resolve) => {
      const id = `ui-dlg-${++nextId}`;
      const overlay = document.createElement('div');
      overlay.className = 'ui-dialog-overlay';
      overlay.id = id;
      overlay.innerHTML = `
        <div class="ui-dialog">
          <div class="ui-dialog-title">${escapeHtml(title)}</div>
          <div class="ui-dialog-body">${escapeHtml(message)}</div>
          <div class="ui-dialog-actions">
            ${confirm ? '<button class="btn btn-secondary" data-act="cancel">Cancel</button>' : ''}
            <button class="btn btn-primary" data-act="ok">${confirm ? 'OK' : 'Got it'}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = (val) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(confirm ? false : true);
        else if (e.key === 'Enter') close(true);
      };

      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
      if (confirm) {
        overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
      }
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(confirm ? false : true);
      });
      document.addEventListener('keydown', onKey);
      setTimeout(() => overlay.querySelector('[data-act="ok"]')?.focus(), 0);
    });
  }

  window.uiAlert = function (message, title = 'Notice') {
    return buildDialog({ message, title, confirm: false });
  };
  window.uiConfirm = function (message, title = 'Confirm') {
    return buildDialog({ message, title, confirm: true });
  };
})();
