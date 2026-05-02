// Tab manager — active tabs, sessions, groups, snooze settings.

(function () {
  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    window.browser = chrome;
  }

  // browser.tabs may be unavailable in iframe context — proxy via background.
  async function bgSend(type, args) {
    if (browser.tabs && type === 'TABS_QUERY') return { ok: true, tabs: await browser.tabs.query(args || {}) };
    if (browser.tabs && type === 'TABS_REMOVE') { await browser.tabs.remove(args.tabIds); return { ok: true }; }
    if (browser.tabs && type === 'TABS_CREATE') return { ok: true, tab: await browser.tabs.create(args || {}) };
    if (browser.tabs && type === 'TABS_SWITCH') {
      await browser.tabs.update(args.tabId, { active: true });
      if (args.windowId !== undefined && browser.windows) await browser.windows.update(args.windowId, { focused: true });
      return { ok: true };
    }
    return browser.runtime.sendMessage({ type, args });
  }
  async function tabsQuery(q) {
    const r = await bgSend('TABS_QUERY', q);
    if (!r?.ok) throw new Error(r?.error || 'tabs.query failed');
    return r.tabs || [];
  }
  async function tabsRemove(ids) {
    const r = await bgSend('TABS_REMOVE', { tabIds: ids });
    if (!r?.ok) throw new Error(r?.error || 'tabs.remove failed');
  }
  async function tabsCreate(opts) {
    const r = await bgSend('TABS_CREATE', opts);
    if (!r?.ok) throw new Error(r?.error || 'tabs.create failed');
    return r.tab;
  }
  async function tabsSwitch(tabId, windowId) {
    const r = await bgSend('TABS_SWITCH', { tabId, windowId });
    if (!r?.ok) throw new Error(r?.error || 'tabs.switch failed');
  }
  async function tabsMove(tabIds, index) {
    const r = await browser.runtime.sendMessage({ type: 'TABS_MOVE', args: { tabIds, index } });
    if (!r?.ok) throw new Error(r?.error || 'tabs.move failed');
    return r.tab;
  }
  async function tabsGroup(tabIds, groupId) {
    const args = { tabIds };
    if (groupId) args.groupId = groupId;
    const r = await browser.runtime.sendMessage({ type: 'TABS_GROUP', args });
    if (!r?.ok) throw new Error(r?.error || 'tabs.group failed');
    return r.groupId;
  }
  async function tabGroupsQuery() {
    const r = await browser.runtime.sendMessage({ type: 'TAB_GROUPS_QUERY', args: {} });
    if (!r?.ok) return [];
    return r.groups || [];
  }
  async function tabGroupsUpdate(groupId, props) {
    const r = await browser.runtime.sendMessage({ type: 'TAB_GROUPS_UPDATE', args: { groupId, props } });
    if (!r?.ok) throw new Error(r?.error || 'tabGroups.update failed');
    return r.group;
  }

  const SESSIONS_KEY = 'tabSessions';
  const GROUPS_KEY = 'tabGroups';
  const SNOOZE_KEY = 'snoozeSettings';

  function escText(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function host(u) { try { return new URL(u).hostname; } catch { return ''; } }

  // === Pane switching ===
  document.querySelectorAll('.tb-tab').forEach(b => {
    b.addEventListener('click', () => {
      const p = b.dataset.pane;
      document.querySelectorAll('.tb-tab').forEach(x => x.classList.toggle('active', x === b));
      document.querySelectorAll('.tb-pane').forEach(s => s.hidden = s.dataset.pane !== p);
      if (p === 'active') loadActive();
      else if (p === 'sessions') loadSessions();
      else if (p === 'settings') loadSnooze();
    });
  });

  // === ACTIVE TABS ===
  let cachedTabs = [];
  let cachedGroups = [];
  async function loadActive() {
    const wrap = document.getElementById('tbActiveList');
    wrap.innerHTML = '<div class="tb-empty">Loading…</div>';
    try {
      const [tabs, groups] = await Promise.all([tabsQuery({}), tabGroupsQuery()]);
      cachedTabs = tabs;
      cachedGroups = groups;
      renderActive(filterTabs());
    } catch (err) {
      wrap.innerHTML = `<div class="tb-empty">Failed: ${escText(err.message || err)}</div>`;
    }
  }

  function makeTabRow(t) {
    const row = document.createElement('div');
    row.className = 'tb-row-tab';
    row.draggable = true;
    row.dataset.tabId = String(t.id);
    row.dataset.windowId = String(t.windowId ?? '');
    row.dataset.index = String(t.index ?? 0);
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/tab-id', String(t.id));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
      try { window.top?.postMessage({ type: 'linkflow-drag', state: 'start' }, '*'); } catch (_) {}
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      try { window.top?.postMessage({ type: 'linkflow-drag', state: 'end' }, '*'); } catch (_) {}
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (y < 14) { row.classList.add('drop-above'); row.classList.remove('drop-below', 'drop-center'); }
      else if (y > rect.height - 14) { row.classList.add('drop-below'); row.classList.remove('drop-above', 'drop-center'); }
      else { row.classList.add('drop-center'); row.classList.remove('drop-above', 'drop-below'); }
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below', 'drop-center'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      const sourceId = parseInt(e.dataTransfer.getData('text/tab-id'), 10);
      const mode = row.classList.contains('drop-center') ? 'group'
                 : row.classList.contains('drop-below') ? 'after' : 'before';
      row.classList.remove('drop-above', 'drop-below', 'drop-center');
      if (!sourceId || sourceId === t.id) return;
      if (mode === 'group') {
        await dropToGroup(sourceId, t);
      } else {
        await dropToReorder(sourceId, t, mode);
      }
    });
    row.innerHTML = `
      <img class="tb-favicon" src="${t.favIconUrl || ''}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="tb-tab-info">
        <div class="tb-tab-title">${escText(t.title || '(no title)')}</div>
        <div class="tb-tab-url">${escText(t.url || '')}</div>
      </div>
      <div class="tb-actions">
        <button data-act="switch" title="Switch">↗</button>
        <button data-act="bookmark" title="Bookmark + close">💾</button>
        <button data-act="close" title="Close">×</button>
      </div>
    `;
    row.querySelector('[data-act="switch"]').addEventListener('click', async () => {
      try { await tabsSwitch(t.id, t.windowId); } catch (_) {}
    });
    row.querySelector('[data-act="close"]').addEventListener('click', async () => {
      try { await tabsRemove([t.id]); } catch (_) {}
      cachedTabs = cachedTabs.filter(x => x.id !== t.id);
      renderActive(filterTabs());
    });
    row.querySelector('[data-act="bookmark"]').addEventListener('click', () => {
      openFolderPicker(async (parentId) => {
        await saveTabAsBookmark(t, parentId);
        try { await tabsRemove([t.id]); } catch (_) {}
        cachedTabs = cachedTabs.filter(x => x.id !== t.id);
        renderActive(filterTabs());
      });
    });
    return row;
  }

  function renderActive(tabs) {
    const wrap = document.getElementById('tbActiveList');
    wrap.innerHTML = '';
    if (!tabs.length) { wrap.innerHTML = '<div class="tb-empty">No tabs.</div>'; return; }

    // Group tabs by groupId; preserve order: tabs are already index-sorted by browser.
    const groupMap = new Map(cachedGroups.map(g => [g.id, g]));
    const seenGid = new Set();
    let currentContainer = null;
    let currentGid = null;

    const flushUngroupedHeader = () => {
      currentContainer = null; currentGid = null;
    };

    tabs.sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));
    for (const t of tabs) {
      const gid = t.groupId && t.groupId > 0 ? t.groupId : null;
      if (gid !== currentGid) {
        flushUngroupedHeader();
        if (gid) {
          const g = groupMap.get(gid);
          const container = document.createElement('div');
          container.className = 'tb-group-container color-' + (g?.color || 'grey');
          const head = document.createElement('div');
          head.className = 'tb-group-header';
          head.innerHTML = `
            <span class="tb-group-title" contenteditable="true" spellcheck="false">${escText(g?.title || 'Group')}</span>
            <span class="tb-group-color" data-color="${g?.color || 'grey'}"></span>
            <button class="tb-group-ungroup" title="Ungroup">×</button>
          `;
          // Inline rename
          const titleEl = head.querySelector('.tb-group-title');
          titleEl.addEventListener('blur', async () => {
            const newTitle = titleEl.textContent.trim() || 'Group';
            try { await tabGroupsUpdate(gid, { title: newTitle }); }
            catch (err) { console.warn(err); }
          });
          titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
          // Color cycle
          head.querySelector('.tb-group-color').addEventListener('click', async () => {
            const colors = ['grey','blue','red','yellow','green','pink','purple','cyan','orange'];
            const cur = g?.color || 'grey';
            const next = colors[(colors.indexOf(cur) + 1) % colors.length];
            try { await tabGroupsUpdate(gid, { color: next }); await loadActive(); } catch (err) { uiAlert(err.message); }
          });
          head.querySelector('.tb-group-ungroup').addEventListener('click', async () => {
            const groupTabIds = cachedTabs.filter(x => x.groupId === gid).map(x => x.id);
            try {
              const r = await browser.runtime.sendMessage({ type: 'TABS_UNGROUP', args: { tabIds: groupTabIds } });
              if (!r?.ok) throw new Error(r?.error);
              await loadActive();
            } catch (err) { uiAlert('Ungroup failed: ' + (err.message || err)); }
          });
          container.appendChild(head);
          wrap.appendChild(container);
          currentContainer = container;
          currentGid = gid;
          seenGid.add(gid);
        }
      }
      const row = makeTabRow(t);
      if (currentContainer) currentContainer.appendChild(row);
      else wrap.appendChild(row);
    }
  }
  function filterTabs() {
    const q = (document.getElementById('tbSearch').value || '').toLowerCase().trim();
    if (!q) return cachedTabs;
    return cachedTabs.filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.url || '').toLowerCase().includes(q)
    );
  }
  document.getElementById('tbSearch').addEventListener('input', () => renderActive(filterTabs()));
  document.getElementById('tbCloseAll').addEventListener('click', async () => {
    if (!await uiConfirm(`Close ${cachedTabs.length} tabs? Active + pinned will be skipped.`)) return;
    const ids = cachedTabs.filter(t => !t.active && !t.pinned).map(t => t.id);
    try { await tabsRemove(ids); } catch (_) {}
    await loadActive();
  });

  async function dropToReorder(sourceId, targetTab, mode) {
    const sourceTab = cachedTabs.find(t => t.id === sourceId);
    if (!sourceTab) return;
    if (sourceTab.windowId !== targetTab.windowId) {
      uiAlert('Cannot reorder across windows yet.');
      return;
    }
    let newIndex = targetTab.index;
    if (mode === 'after') newIndex = targetTab.index + (sourceTab.index < targetTab.index ? 0 : 1);
    else if (mode === 'before') newIndex = targetTab.index - (sourceTab.index < targetTab.index ? 1 : 0);
    if (newIndex < 0) newIndex = 0;
    try {
      await tabsMove([sourceId], newIndex);
      await loadActive();
    } catch (err) { uiAlert('Reorder failed: ' + (err.message || err)); }
  }

  async function dropToGroup(sourceId, targetTab) {
    const sourceTab = cachedTabs.find(t => t.id === sourceId);
    if (!sourceTab) return;
    if (sourceTab.windowId !== targetTab.windowId) {
      uiAlert('Tabs must be in the same window to group.');
      return;
    }
    try {
      const targetGid = (targetTab.groupId && targetTab.groupId > 0) ? targetTab.groupId : null;
      let groupId;
      if (targetGid) {
        // Add source into target's existing group.
        groupId = await tabsGroup([sourceId], targetGid);
      } else {
        // Create new group with both tabs; pick a random color.
        groupId = await tabsGroup([sourceTab.id, targetTab.id]);
        const colors = ['blue','red','yellow','green','pink','purple','cyan','orange'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const title = (sourceTab.title || '').split(/\s|—|-|\|/)[0] || 'Group';
        try { await tabGroupsUpdate(groupId, { title, color }); } catch (_) {}
      }
      await loadActive();
    } catch (err) {
      uiAlert('Group failed: ' + (err.message || err) + '\n(Note: tab grouping is Chrome-only; Firefox lacks the API.)');
    }
  }

  async function saveTabAsBookmark(tab, parentId) {
    try {
      await api.authedFetch('/bookmarks', {
        method: 'POST',
        body: {
          tab: 'root', parentId,
          kind: 'link',
          name: tab.title || tab.url, url: tab.url
        }
      });
    } catch (err) { uiAlert('Save failed: ' + (err.message || err)); }
  }

  // === FOLDER PICKER ===
  let pickedFolderId = null;
  let pickerCallback = null;
  async function openFolderPicker(cb) {
    pickerCallback = cb;
    pickedFolderId = null;
    const tree = document.getElementById('tbFolderTree');
    tree.innerHTML = '<div class="tb-empty">Loading…</div>';
    document.getElementById('tbFolderPicker').hidden = false;
    try {
      const data = await api.authedFetch('/bookmarks?tab=root');
      const folders = (data.bookmarks || []).filter(b => b.kind === 'folder');
      tree.innerHTML = '';
      const root = document.createElement('div');
      root.className = 'tb-folder-row selected';
      root.dataset.folderId = '';
      root.textContent = '📁 (root)';
      root.addEventListener('click', () => selectFolder(root, null));
      tree.appendChild(root);
      pickedFolderId = null;
      const byParent = new Map();
      for (const f of folders) {
        const pid = f.parentId || null;
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(f);
      }
      const drawAt = (pid, depth) => {
        const kids = byParent.get(pid) || [];
        for (const f of kids) {
          const r = document.createElement('div');
          r.className = 'tb-folder-row';
          r.dataset.folderId = f.id;
          r.style.paddingLeft = (8 + depth * 16) + 'px';
          r.textContent = '📁 ' + f.name;
          r.addEventListener('click', () => selectFolder(r, f.id));
          tree.appendChild(r);
          drawAt(f.id, depth + 1);
        }
      };
      drawAt(null, 0);
    } catch (err) {
      tree.innerHTML = `<div class="tb-empty">Failed: ${escText(err.message || err)}</div>`;
    }
  }
  function selectFolder(rowEl, id) {
    document.querySelectorAll('.tb-folder-row').forEach(r => r.classList.remove('selected'));
    rowEl.classList.add('selected');
    pickedFolderId = id;
  }
  document.getElementById('tbModalClose').addEventListener('click', () => { document.getElementById('tbFolderPicker').hidden = true; });
  document.getElementById('tbCancelSave').addEventListener('click', () => { document.getElementById('tbFolderPicker').hidden = true; });
  document.getElementById('tbConfirmSave').addEventListener('click', async () => {
    document.getElementById('tbFolderPicker').hidden = true;
    if (pickerCallback) await pickerCallback(pickedFolderId);
    pickerCallback = null;
  });

  // === SESSIONS ===
  async function loadSessions() {
    const list = document.getElementById('tbSessionList');
    const data = await browser.storage.local.get(SESSIONS_KEY);
    const sessions = data[SESSIONS_KEY] || [];
    list.innerHTML = '';
    if (!sessions.length) { list.innerHTML = '<div class="tb-empty">No sessions saved.</div>'; return; }
    for (const s of sessions) {
      const card = document.createElement('div');
      card.className = 'tb-session';
      card.innerHTML = `
        <div class="tb-session-head">
          <span class="tb-session-name">${escText(s.name)}</span>
          <span class="tb-session-meta">${s.tabs.length} tabs · ${new Date(s.savedAt).toLocaleString()}</span>
          <button data-act="restore">Restore</button>
          <button data-act="delete" class="tb-danger">Delete</button>
        </div>
        <ul class="tb-session-tabs">${s.tabs.slice(0, 5).map(t => `<li>${escText(t.title || t.url)}</li>`).join('')}</ul>
      `;
      card.querySelector('[data-act="restore"]').addEventListener('click', async () => {
        for (const t of s.tabs) {
          try { await tabsCreate({ url: t.url, active: false }); } catch (_) {}
        }
      });
      card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!await uiConfirm(`Delete session "${s.name}"?`)) return;
        const cur = (await browser.storage.local.get(SESSIONS_KEY))[SESSIONS_KEY] || [];
        await browser.storage.local.set({ [SESSIONS_KEY]: cur.filter(x => x.id !== s.id) });
        loadSessions();
      });
      list.appendChild(card);
    }
  }
  document.getElementById('tbSaveSession').addEventListener('click', async () => {
    const nameEl = document.getElementById('tbSessionName');
    const name = nameEl.value.trim() || `Session ${new Date().toLocaleString()}`;
    const tabs = await tabsQuery({ currentWindow: true });
    const data = await browser.storage.local.get(SESSIONS_KEY);
    const list = data[SESSIONS_KEY] || [];
    list.unshift({
      id: 's-' + Date.now(),
      name,
      savedAt: Date.now(),
      tabs: tabs.map(t => ({ url: t.url, title: t.title }))
    });
    await browser.storage.local.set({ [SESSIONS_KEY]: list });
    nameEl.value = '';
    loadSessions();
  });


  // === SNOOZE SETTINGS ===
  function defaultSnooze() {
    return { enabled: false, defaultMinutes: 60, action: 'close', rules: {} };
  }
  let currentSnooze = defaultSnooze();
  async function loadSnooze() {
    const data = await browser.storage.local.get(SNOOZE_KEY);
    currentSnooze = Object.assign(defaultSnooze(), data[SNOOZE_KEY] || {});
    document.getElementById('tbSnoozeOn').checked = !!currentSnooze.enabled;
    document.getElementById('tbDefaultMin').value = currentSnooze.defaultMinutes;
    document.getElementById('tbAction').value = currentSnooze.action;
    renderRules();
  }
  function renderRules() {
    const wrap = document.getElementById('tbRulesList');
    wrap.innerHTML = '';
    const entries = Object.entries(currentSnooze.rules || {});
    if (!entries.length) {
      const e = document.createElement('div');
      e.className = 'tb-empty';
      e.style.padding = '8px';
      e.textContent = 'No host rules. Defaults apply.';
      wrap.appendChild(e);
      return;
    }
    for (const [h, m] of entries) {
      const row = document.createElement('div');
      row.className = 'tb-rule';
      row.innerHTML = `
        <span class="tb-rule-host">${escText(h)}</span>
        <span>${m} min</span>
        <button title="Remove">×</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        delete currentSnooze.rules[h];
        renderRules();
      });
      wrap.appendChild(row);
    }
  }
  document.getElementById('tbAddHostRule').addEventListener('click', () => {
    const h = document.getElementById('tbHostRuleHost').value.trim().toLowerCase();
    const m = parseInt(document.getElementById('tbHostRuleMin').value, 10);
    if (!h || !Number.isFinite(m) || m <= 0) return;
    currentSnooze.rules = currentSnooze.rules || {};
    currentSnooze.rules[h] = m;
    document.getElementById('tbHostRuleHost').value = '';
    document.getElementById('tbHostRuleMin').value = '';
    renderRules();
  });
  document.getElementById('tbSaveSnooze').addEventListener('click', async () => {
    currentSnooze.enabled = document.getElementById('tbSnoozeOn').checked;
    currentSnooze.defaultMinutes = parseInt(document.getElementById('tbDefaultMin').value, 10) || 60;
    currentSnooze.action = document.getElementById('tbAction').value;
    await browser.storage.local.set({ [SNOOZE_KEY]: currentSnooze });
    const status = document.getElementById('tbSaveStatus');
    status.textContent = '✓ Saved';
    setTimeout(() => { status.textContent = ''; }, 1500);
  });

  // Initial pane
  loadActive();
})();
