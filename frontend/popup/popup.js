// Main Popup Controller

if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  // eslint-disable-next-line no-global-assign
  window.browser = chrome;
}

function escapeText(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

class PopupController {
  constructor() {
    this.currentTab = 'root';
    this.currentFolder = null;
    this.searchQuery = '';
    this.expanded = new Set();
    this.viewMode = 'links'; // 'links' | 'todo'
    this.currentProjectId = null;

    this.tempRenameContext = null;
    this.tempDeleteContext = null;
    this.tempMoveContext = null;

    this.init();
  }

  async init() {
    await this.loadCurrentView();
    this.hydrateIcons();
    this.bindEvents();
    document.querySelector('.side-item[data-view="links"]')?.classList.add('active');
    try {
      const s = await storage.getSettings();
      await this.applySettings(s);
    } catch (_) {}
    try {
      const user = await auth.getCurrentUser();
      if (user?.username) {
        const lbl = document.getElementById('profileSideLabel');
        if (lbl) lbl.textContent = '@' + user.username;
      }
    } catch (_) {}
    await this.render();
  }

  hydrateIcons() { hydrateIcons(); }

  async loadCurrentView() {
    this.currentTab = 'root';
    this.currentFolder = null;
    this.path = [{ tabId: 'root', folderId: null }];
    await storage.ensureDefaultRootFolders();
  }

  async saveCurrentView() {
    await storage.setCurrentView({
      tabId: this.currentTab,
      folderId: this.currentFolder,
      breadcrumbs: []
    });
  }

  toggleExpand(key) {
    if (this.expanded.has(key)) this.expanded.delete(key);
    else this.expanded.add(key);
  }

  // Column-view path: array of { tabId, folderId } where each entry produces a column showing children
  // path = [] → only root tab column shown
  // path = [{tabId,null}] → tab roots column
  // path = [{tabId,null},{tabId,folderId}] → that folder's column
  ensurePath() { if (!this.path) this.path = []; }

  // If the last path column has at least one folder and nothing past it,
  // auto-extend by selecting the first folder. Loops to drill into the
  // leftmost branch by default.
  async ensureAutoExpand() {
    let safety = 0;
    while (safety++ < 32 && this.path.length > 0) {
      const last = this.path[this.path.length - 1];
      const folders = (await storage.getFolders(last.tabId))
        .filter(f => f.parentId === last.folderId);
      if (folders.length >= 1) {
        this.path.push({ tabId: last.tabId, folderId: folders[0].id });
      } else {
        break;
      }
    }
  }

  bindEvents() {
    // Sidebar view items
    document.querySelectorAll('.side-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.view);
      });
    });

    // Save custom link (modal action)
    document.getElementById('saveCustomLinkBtn').addEventListener('click', () => {
      this.saveCustomLink();
    });

    document.getElementById('sendShareFolderBtn')?.addEventListener('click', () => {
      this.sendShareFolder();
    });

    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => this.saveSettings());

    // Global custom context menu — suppress browser default everywhere in popup.
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Lock floating panel close while custom menu open.
      try { window.parent?.postMessage({ type: 'linkflow-drag', state: 'start' }, '*'); } catch (_) {}
      this.openCustomContextMenu(e);
    });

    document.getElementById('openSettingsBtn')?.addEventListener('click', () => {
      const settingsMenu = document.getElementById('settingsMenu');
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsMenu) settingsMenu.hidden = true;
      if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
      this.switchView('settings');
    });

    document.getElementById('notificationsBtn')?.addEventListener('click', async () => {
      const settingsMenu = document.getElementById('settingsMenu');
      if (settingsMenu) settingsMenu.hidden = true;
      await uiAlert('No notifications yet.');
    });

    // Create folder (modal action)
    document.getElementById('createFolderBtn').addEventListener('click', () => {
      this.createFolder();
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });

    // Settings button — toggle dropdown
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsMenu = document.getElementById('settingsMenu');
    const sidebar = document.getElementById('sidebar');
    let settingsCloseTimer = null;
    const showSettingsMenu = () => {
      if (settingsCloseTimer) { clearTimeout(settingsCloseTimer); settingsCloseTimer = null; }
      settingsMenu.hidden = false;
      settingsBtn.setAttribute('aria-expanded', 'true');
      sidebar?.classList.add('menu-open');
    };
    const scheduleHide = () => {
      if (settingsCloseTimer) clearTimeout(settingsCloseTimer);
      settingsCloseTimer = setTimeout(() => {
        settingsMenu.hidden = true;
        settingsBtn.setAttribute('aria-expanded', 'false');
        sidebar?.classList.remove('menu-open');
      }, 250);
    };
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !settingsMenu.hidden;
      if (isOpen) {
        settingsMenu.hidden = true;
        settingsBtn.setAttribute('aria-expanded', 'false');
      } else {
        showSettingsMenu();
      }
    });
    settingsBtn.addEventListener('mouseenter', showSettingsMenu);
    settingsBtn.addEventListener('mouseleave', scheduleHide);
    settingsMenu.addEventListener('mouseenter', showSettingsMenu);
    settingsMenu.addEventListener('mouseleave', scheduleHide);
    // Belt-and-suspenders: any mousemove inside the menu re-asserts open state.
    settingsMenu.addEventListener('mousemove', showSettingsMenu);
    document.addEventListener('click', (e) => {
      if (!settingsMenu.hidden &&
          !settingsMenu.contains(e.target) &&
          e.target !== settingsBtn) {
        settingsMenu.hidden = true;
        settingsBtn.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('profileBtn').addEventListener('click', async () => {
      settingsMenu.hidden = true;
      settingsBtn.setAttribute('aria-expanded', 'false');
      const user = await auth.getCurrentUser();
      document.getElementById('profileEmail').textContent =
        user?.email || user?.username || 'Unknown';
      modalManager.open('profileModal');
    });

    // Sync bookmarks (manual trigger from settings menu) — runs in background
    // page where browser.bookmarks API is reliably available.
    document.getElementById('syncBookmarksBtn')?.addEventListener('click', async () => {
      settingsMenu.hidden = true;
      settingsBtn.setAttribute('aria-expanded', 'false');
      try {
        const res = await browser.runtime.sendMessage({ type: 'SYNC_BOOKMARKS' });
        if (!res?.ok) throw new Error(res?.error || 'unknown error');
        storage.invalidate?.();
        await this.render();
        await uiAlert('Bookmarks sync complete.');
      } catch (err) {
        await uiAlert('Sync failed: ' + (err?.message || err));
      }
    });

    // Open dashboard (from settings menu)
    document.getElementById('openDashboardBtn').addEventListener('click', () => {
      settingsMenu.hidden = true;
      settingsBtn.setAttribute('aria-expanded', 'false');
      browser.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    });

    // Rename modal save
    document.getElementById('saveRenameBtn').addEventListener('click', () => {
      this.saveRename();
    });

    // Delete confirmation
    document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
      this.confirmDelete();
    });

    // Move link confirmation
    document.getElementById('confirmMoveBtn').addEventListener('click', () => {
      this.confirmMove();
    });

    // Enter key in inputs
    document.getElementById('customUrl').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.saveCustomLink();
    });

    document.getElementById('folderName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.createFolder();
    });

    document.getElementById('renameInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.saveRename();
    });
  }

  matchesSearch(name) {
    if (!this.searchQuery) return true;
    return name.toLowerCase().includes(this.searchQuery.toLowerCase());
  }

  async switchView(mode) {
    this.viewMode = mode;
    document.querySelectorAll('.side-item[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === mode);
    });
    document.getElementById('content').hidden = mode !== 'links';
    document.getElementById('searchContainer').hidden = mode !== 'links';
    document.getElementById('todoView').hidden = mode !== 'todo';
    document.getElementById('chatsView').hidden = mode !== 'chats';
    document.getElementById('playgroundView').hidden = mode !== 'playground';
    document.getElementById('settingsView').hidden = mode !== 'settings';
    document.getElementById('notesView').hidden = mode !== 'notes';
    if (mode === 'todo') await this.renderTodo();
    else if (mode === 'chats') this.ensureChatsFrame();
    else if (mode === 'playground') await this.renderHub();
    else if (mode === 'settings') await this.renderSettings();
    else if (mode === 'notes') await window.notesController?.open();
    else await this.render();
  }

  async applySettings(s) {
    document.documentElement.style.setProperty('--ink', s.textColor);
    document.documentElement.style.setProperty('--text-primary', s.textColor);
    document.documentElement.style.setProperty('--canvas', s.bgColor);
    document.documentElement.style.setProperty('--bg-primary', s.bgColor);
  }

  async renderSettings() {
    const s = await storage.getSettings();
    document.getElementById('setTextColor').value = s.textColor;
    document.getElementById('setBgColor').value = s.bgColor;
    document.getElementById('setWhitelist').value = s.whitelist || '';
    document.getElementById('setBlacklist').value = s.blacklist || '';
    document.getElementById('setNotifications').checked = !!s.notificationsEnabled;
    this.applySiteMode(s.siteMode || 'whitelist-default');

    document.getElementById('blockAllBtn').onclick = async () => {
      await this.saveSettings();
      const next = await storage.saveSettings({ siteMode: 'blacklist-default' });
      this.applySiteMode(next.siteMode);
    };
    document.getElementById('allowAllBtn').onclick = async () => {
      await this.saveSettings();
      const next = await storage.saveSettings({ siteMode: 'whitelist-default' });
      this.applySiteMode(next.siteMode);
    };
    document.getElementById('addCurrentBlacklist').onclick = () => this.addCurrentHostToList('setBlacklist');
    document.getElementById('addCurrentWhitelist').onclick = () => this.addCurrentHostToList('setWhitelist');
  }

  applySiteMode(mode) {
    const useBlacklist = mode !== 'blacklist-default';
    document.getElementById('modeBlacklist').hidden = !useBlacklist;
    document.getElementById('modeWhitelist').hidden = useBlacklist;
    document.getElementById('siteModeStatus').textContent = useBlacklist
      ? 'Bubble shows on every site except those in the blacklist.'
      : 'Bubble is hidden on every site except those in the whitelist.';
  }

  async addCurrentHostToList(textareaId) {
    try {
      // Try direct API first; fall back to background message (works when popup
      // runs inside floating-panel iframe and lacks browser.tabs directly).
      let url = '';
      const tabsApi = (typeof browser !== 'undefined' && browser.tabs) ||
                      (typeof chrome !== 'undefined' && chrome.tabs) || null;
      if (tabsApi?.query) {
        try {
          const result = await tabsApi.query({ active: true, currentWindow: true });
          const tab = Array.isArray(result) ? result[0] : null;
          url = tab?.url || '';
        } catch (_) {}
      }
      if (!url && typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
        try {
          const res = await browser.runtime.sendMessage({ type: 'GET_CURRENT_TAB' });
          url = res?.url || '';
        } catch (_) {}
      }
      // Iframe last resort: parent host.
      if (!url) {
        try { url = window.parent?.location?.href || ''; } catch (_) {}
      }
      if (!url) { await uiAlert('Cannot read current tab.'); return; }
      let host = '';
      try { host = new URL(url).hostname; } catch (_) {}
      if (!host) { await uiAlert('Cannot parse host from: ' + url); return; }
      const ta = document.getElementById(textareaId);
      const lines = (ta.value || '').split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.includes(host)) {
        await uiAlert(`${host} already in list.`);
        return;
      }
      lines.push(host);
      ta.value = lines.join('\n');
    } catch (err) {
      await uiAlert('Failed: ' + (err.message || err));
    }
  }

  async saveSettings() {
    const patch = {
      textColor: document.getElementById('setTextColor').value,
      bgColor: document.getElementById('setBgColor').value,
      whitelist: document.getElementById('setWhitelist').value,
      blacklist: document.getElementById('setBlacklist').value,
      notificationsEnabled: document.getElementById('setNotifications').checked
    };
    const s = await storage.saveSettings(patch);
    await this.applySettings(s);
    const status = document.getElementById('settingsStatus');
    status.textContent = 'Saved';
    setTimeout(() => { status.textContent = ''; }, 1500);
  }

  async renderTodo() {
    const projWrap = document.getElementById('todoProjects');
    projWrap.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'todo-projects-head';
    head.innerHTML = '<span>Projects</span>';
    const addBtn = document.createElement('button');
    addBtn.className = 'todo-projects-add';
    addBtn.textContent = '+';
    addBtn.title = 'New project';
    addBtn.addEventListener('click', async () => {
      const id = await storage.createTodoProject('Untitled');
      this.currentProjectId = id;
      await this.renderTodo();
      this.focusProjectName(id);
    });
    head.appendChild(addBtn);
    projWrap.appendChild(head);

    const data = await storage.getTodoData();
    if (data.projects.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px;color:var(--text-tertiary);font-size:13px;';
      empty.textContent = 'No projects. Click + to add.';
      projWrap.appendChild(empty);
    }

    for (const p of data.projects) {
      const row = document.createElement('div');
      row.className = 'proj-row' + (p.id === this.currentProjectId ? ' selected' : '');
      row.dataset.projectId = p.id;

      const name = document.createElement('span');
      name.className = 'proj-name';
      name.style.flex = '1';
      name.textContent = p.name;
      name.spellcheck = false;
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.makeEditable(name, p.name, async (val) => {
          if (val && val !== p.name) await storage.renameTodoProject(p.id, val);
          await this.renderTodo();
        });
      });

      const edit = document.createElement('button');
      edit.className = 'proj-edit';
      edit.textContent = '✏️';
      edit.title = 'Rename';
      edit.addEventListener('click', (e) => {
        e.stopPropagation();
        this.makeEditable(name, p.name, async (val) => {
          if (val && val !== p.name) await storage.renameTodoProject(p.id, val);
          await this.renderTodo();
        });
      });

      const del = document.createElement('button');
      del.className = 'proj-del';
      del.textContent = '🗑️';
      del.title = 'Delete';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await uiConfirm(`Delete project "${p.name}" and all its tasks?`)) return;
        await storage.deleteTodoProject(p.id);
        if (this.currentProjectId === p.id) this.currentProjectId = null;
        await this.renderTodo();
      });
      row.append(name, edit, del);
      row.addEventListener('click', async () => {
        this.currentProjectId = p.id;
        await this.renderTodo();
      });
      projWrap.appendChild(row);
    }

    await this.renderKanban();
  }

  async renderKanban() {
    const wrap = document.getElementById('todoKanban');
    wrap.innerHTML = '';
    if (!this.currentProjectId) {
      const e = document.createElement('div');
      e.className = 'todo-empty';
      e.textContent = 'Select a project';
      wrap.appendChild(e);
      return;
    }

    const data = await storage.getTodoData();
    const projectId = this.currentProjectId;
    const statuses = (data.statuses[projectId] || []).slice().sort((a, b) => a.order - b.order);
    const tasks = data.tasks[projectId] || [];

    for (const status of statuses) {
      wrap.appendChild(this.renderKanbanCol(projectId, status, tasks));
    }

    // Auto-grow popup width: sidebar(48) + projects(48) + statuses × 220 + add(200).
    const desired = 48 + 48 + statuses.length * 220 + 200;
    document.body.style.minWidth = desired + 'px';
    try {
      window.parent?.postMessage({ type: 'linkflow-resize-request', width: desired }, '*');
    } catch (_) {}

    const addCol = document.createElement('button');
    addCol.className = 'kanban-add-col';
    addCol.textContent = '+ Add status';
    addCol.addEventListener('click', async () => {
      await storage.addTodoStatus(projectId, 'Untitled');
      await this.renderKanban();
      const data = await storage.getTodoData();
      const list = data.statuses[projectId] || [];
      const last = list[list.length - 1];
      if (last) this.focusStatusName(last.id);
    });
    wrap.appendChild(addCol);
  }

  renderKanbanCol(projectId, status, allTasks) {
    const col = document.createElement('div');
    col.className = 'kanban-col';
    col.dataset.statusId = status.id;

    const head = document.createElement('div');
    head.className = 'kanban-col-head';
    const name = document.createElement('span');
    name.className = 'kanban-col-name';
    name.contentEditable = 'true';
    name.spellcheck = false;
    name.textContent = status.name;
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
    });
    name.addEventListener('blur', async () => {
      const v = name.textContent.trim();
      if (v && v !== status.name) await storage.renameTodoStatus(projectId, status.id, v);
    });
    const del = document.createElement('button');
    del.className = 'kanban-col-del';
    del.textContent = '🗑️';
    del.title = 'Delete status';
    del.addEventListener('click', async () => {
      if (!await uiConfirm(`Delete status "${status.name}" and its tasks?`)) return;
      await storage.deleteTodoStatus(projectId, status.id);
      await this.renderKanban();
    });
    head.append(name, del);
    col.appendChild(head);

    const list = document.createElement('div');
    list.className = 'kanban-list';
    list.dataset.statusId = status.id;

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      list.classList.add('drag-over');
    });
    list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
    list.addEventListener('drop', async (e) => {
      e.preventDefault();
      list.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/task');
      if (!taskId) return;
      const afterEl = this.getDragAfterElement(list, e.clientY);
      const tasksInCol = Array.from(list.querySelectorAll('.kanban-task'));
      let newIndex = tasksInCol.length;
      if (afterEl) newIndex = tasksInCol.indexOf(afterEl);
      await storage.moveTodoTask(projectId, taskId, status.id, newIndex);
      await this.renderKanban();
    });

    const colTasks = allTasks
      .filter(t => t.statusId === status.id)
      .sort((a, b) => a.order - b.order);

    for (const task of colTasks) {
      list.appendChild(this.renderTaskCard(projectId, task));
    }
    col.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.className = 'kanban-add';
    addBtn.textContent = '+ Add task';
    addBtn.addEventListener('click', async () => {
      await storage.addTodoTask(projectId, status.id, 'Untitled');
      await this.renderKanban();
      const data = await storage.getTodoData();
      const list = (data.tasks[projectId] || []).filter(t => t.statusId === status.id);
      const last = list[list.length - 1];
      if (last) this.focusTaskCard(last.id);
    });
    col.appendChild(addBtn);
    return col;
  }

  renderTaskCard(projectId, task) {
    const card = document.createElement('div');
    card.className = 'kanban-task';
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.textContent = task.title;
    card._ctx = { __kind: 'task', projectId, task };

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/task', task.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
      try { window.parent?.postMessage({ type: 'linkflow-drag', state: 'start' }, '*'); } catch (_) {}
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      try { window.parent?.postMessage({ type: 'linkflow-drag', state: 'end' }, '*'); } catch (_) {}
    });

    card.addEventListener('dblclick', () => {
      this.makeEditable(card, task.title, async (val) => {
        const finalTitle = val || task.title || 'Untitled';
        if (finalTitle !== task.title) {
          await storage.updateTodoTask(projectId, task.id, { title: finalTitle });
          await this.renderKanban();
        }
      });
    });

    // Right-click to delete
    card.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      if (uiConfirm(`Delete task "${task.title}"?`)) {
        await storage.deleteTodoTask(projectId, task.id);
        await this.renderKanban();
      }
    });

    return card;
  }

  makeEditable(el, originalText, onCommit) {
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const stopClick = (e) => e.stopPropagation();
    el.addEventListener('click', stopClick);
    el.addEventListener('mousedown', stopClick);

    let done = false;
    const finish = async (commit) => {
      if (done) return;
      done = true;
      el.contentEditable = 'false';
      el.removeEventListener('click', stopClick);
      el.removeEventListener('mousedown', stopClick);
      const val = el.textContent.trim();
      if (commit) await onCommit(val);
      else el.textContent = originalText;
    };
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    el.addEventListener('blur', () => finish(true), { once: true });
  }

  focusProjectName(projectId) {
    const row = document.querySelector(`.proj-row[data-project-id="${projectId}"]`);
    if (!row) return;
    const name = row.querySelector('.proj-name');
    if (!name) return;
    this.makeEditable(name, name.textContent, async (val) => {
      const finalName = val || 'Untitled';
      await storage.renameTodoProject(projectId, finalName);
      await this.renderTodo();
    });
  }

  focusStatusName(statusId) {
    const head = document.querySelector(`.kanban-col[data-status-id="${statusId}"] .kanban-col-name`);
    if (!head) return;
    head.focus();
    const range = document.createRange();
    range.selectNodeContents(head);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  focusTaskCard(taskId) {
    const card = document.querySelector(`.kanban-task[data-task-id="${taskId}"]`);
    if (!card) return;
    const original = card.textContent;
    this.makeEditable(card, original, async (val) => {
      const finalTitle = val || 'Untitled';
      await storage.updateTodoTask(this.currentProjectId, taskId, { title: finalTitle });
      await this.renderKanban();
    });
  }

  getDragAfterElement(container, y) {
    const cards = Array.from(container.querySelectorAll('.kanban-task:not(.dragging)'));
    return cards.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  async render() {
    this.ensurePath();
    if (this.path.length === 0) this.path = [{ tabId: 'root', folderId: null }];
    await this.ensureAutoExpand();
    const container = document.getElementById('itemsContainer');
    const emptyState = document.getElementById('emptyState');

    // Capture scroll positions before re-render so nothing jumps.
    const savedScroll = {};
    container.querySelectorAll('.tree-column[data-col-key]').forEach(c => {
      savedScroll[c.dataset.colKey] = c.scrollTop;
    });
    const savedHorizontal = container.scrollLeft;

    container.innerHTML = '';


    // All columns built from path. path[0] is the (hidden) root tab's column.
    for (let i = 0; i < this.path.length; i++) {
      const node = this.path[i];
      const col = document.createElement('div');
      col.className = 'tree-column';
      col.dataset.colKey = `${node.tabId}::${node.folderId || 'root'}`;
      // Animate-in newly opened columns (not in saved scroll map).
      const isNew = !(col.dataset.colKey in savedScroll);
      if (isNew) col.classList.add('col-appearing');

      col.appendChild(this.makeActionRow(node.tabId, node.folderId));

      const allFolders = await storage.getFolders(node.tabId);
      const folders = allFolders.filter(f => f.parentId === node.folderId);
      const links = await storage.getLinks(node.tabId, node.folderId);

      const renderedFolders = folders.filter(f => this.matchesSearch(f.name));
      const renderedLinks = links.filter(l => this.matchesSearch(l.title) || this.matchesSearch(l.url));

      for (const f of renderedFolders) {
        const next = this.path[i + 1];
        const sel = next && next.folderId === f.id && next.tabId === node.tabId;
        const hasKids = allFolders.some(x => x.parentId === f.id) ||
          (await storage.getLinks(node.tabId, f.id)).length > 0;
        col.appendChild(this.makeColRow({
          label: f.name,
          icon: iconSvg('folder'),
          isFolder: true,
          selected: sel,
          hasChildren: hasKids,
          contextItem: { type: 'folder', tabId: node.tabId, folder: f },
          onClick: () => {
            this.path = this.path.slice(0, i + 1).concat([{ tabId: node.tabId, folderId: f.id }]);
            this.currentTab = node.tabId;
            this.currentFolder = f.id;
            this.saveCurrentView();
            this.render();
          }
        }));
      }
      for (const l of renderedLinks) {
        const labelText = (l.title && l.title.trim()) ? l.title : (l.url || 'Untitled');
        col.appendChild(this.makeColRow({
          label: labelText,
          icon: PlatformDetector.getIcon(l.platform),
          isFolder: false,
          contextItem: { type: 'link', tabId: node.tabId, link: l },
          onClick: () => this.openLinkUrl(l.url)
        }));
      }

      if (renderedFolders.length === 0 && renderedLinks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'col-empty';
        empty.textContent = 'Empty';
        col.appendChild(empty);
      }

      container.appendChild(col);
    }

    emptyState.style.display = 'none';

    // Grow popup width to fit all columns: sidebar (~48) + cols × col-w.
    const sidebarW = 48;
    const colW = 220;
    const desired = sidebarW + this.path.length * colW;
    document.body.style.minWidth = desired + 'px';
    // Ask floating-panel parent to resize iframe accordingly.
    try {
      window.parent?.postMessage({ type: 'linkflow-resize-request', width: desired }, '*');
    } catch (_) {}

    // Trigger slide-in transition for newly added columns.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.querySelectorAll('.tree-column.col-appearing').forEach(c => {
          c.classList.remove('col-appearing');
        });
      });
    });

    // Restore vertical scroll per column; horizontal scroll only if newer
    // columns weren't added (else auto-scroll right to reveal new column).
    container.querySelectorAll('.tree-column[data-col-key]').forEach(c => {
      const v = savedScroll[c.dataset.colKey];
      if (typeof v === 'number') c.scrollTop = v;
    });
    const newCount = container.querySelectorAll('.tree-column').length;
    const oldCount = Object.keys(savedScroll).length;
    if (newCount > oldCount) {
      container.scrollLeft = container.scrollWidth;
    } else {
      container.scrollLeft = savedHorizontal;
    }

    await this.updateTabCounts();
  }

  makeActionRow(tabId, folderId, isTabsColumn = false) {
    const row = document.createElement('div');
    row.className = 'col-action-row';
    const actions = [
      { icon: 'save', label: 'Save Current Tab', run: () => this.saveCurrentInto(tabId, folderId) },
      { icon: 'save-close', label: 'Save & Close Tab', run: () => this.saveCurrentAndClose(tabId, folderId) },
      { icon: 'link', label: 'Paste URL', run: () => this.openPasteAt(tabId, folderId) },
      isTabsColumn
        ? { icon: 'folder-plus', label: 'New Tab', run: () => this.createNewTab() }
        : { icon: 'folder-plus', label: 'New Folder', run: () => this.openNewFolderAt(tabId, folderId) },
    ];
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'col-action';
      btn.title = a.label;
      const ic = document.createElement('span');
      ic.className = 'col-action-icon';
      ic.innerHTML = iconSvg(a.icon);
      const lbl = document.createElement('span');
      lbl.className = 'col-action-label';
      lbl.textContent = a.label;
      btn.append(ic, lbl);
      btn.addEventListener('click', (e) => { e.stopPropagation(); a.run(); });
      row.appendChild(btn);
    }
    return row;
  }

  openLinkUrl(url) {
    if (!url) return;
    let safe = url;
    if (!/^[a-z]+:\/\//i.test(safe)) safe = 'https://' + safe;
    try {
      if (typeof browser !== 'undefined' && browser.tabs?.create) {
        browser.tabs.create({ url: safe });
        return;
      }
    } catch (_) {}
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
        chrome.tabs.create({ url: safe });
        return;
      }
    } catch (_) {}
    window.open(safe, '_blank', 'noopener');
  }

  saveCurrentInto(tabId, folderId) {
    this.currentTab = tabId;
    this.currentFolder = folderId;
    this.saveCurrentTab();
  }

  async saveCurrentAndClose(tabId, folderId) {
    this.currentTab = tabId;
    this.currentFolder = folderId;
    try {
      const tabsApi = (typeof browser !== 'undefined' && browser.tabs) ||
                      (typeof chrome !== 'undefined' && chrome.tabs) || null;
      let active = null;
      if (tabsApi?.query) {
        const result = await tabsApi.query({ active: true, currentWindow: true });
        active = Array.isArray(result) ? result[0] : null;
      }
      await this.saveCurrentTab();
      if (active && active.id !== undefined && tabsApi?.remove) {
        await tabsApi.remove(active.id);
      }
    } catch (err) {
      console.error('LinkFlow: save & close failed', err);
    }
  }

  async createNewTab() {
    const id = await storage.createTab('Untitled');
    this.currentTab = id;
    this.currentFolder = null;
    this.path = [{ tabId: id, folderId: null }];
    await this.saveCurrentView();
    await this.render();
    // Focus inline edit on the new tab row
    const row = document.querySelector(`.col-row[data-tab-id="${id}"]`);
    if (row) {
      const labelEl = row.querySelector('.col-label');
      if (labelEl) this.startInlineEdit(row, labelEl, { type: 'tab', tabId: id, tab: { id, name: 'Untitled' } });
    }
  }

  async deleteTabConfirm(tabId, tabName) {
    if (!await uiConfirm(`Delete tab "${tabName}" and all its links/folders?`)) return;
    await storage.deleteTab(tabId);
    if (this.currentTab === tabId) {
      this.currentTab = 'work';
      this.currentFolder = null;
      this.path = [];
    }
    await this.saveCurrentView();
    await this.render();
  }

  openPasteAt(tabId, folderId) {
    this.currentTab = tabId;
    this.currentFolder = folderId;
    modalManager.open('pasteUrlModal');
  }

  openNewFolderAt(tabId, folderId) {
    this.currentTab = tabId;
    this.currentFolder = folderId;
    modalManager.open('newFolderModal');
  }

  makeColRow({ label, icon, isFolder, selected, onClick, contextItem }) {
    const row = document.createElement('div');
    row.className = 'col-row' + (selected ? ' selected' : '') + (isFolder ? ' is-folder' : ' is-link');

    const ic = document.createElement('span');
    ic.className = 'col-icon';
    if (typeof icon === 'string' && icon.trim().startsWith('<')) ic.innerHTML = icon;
    else ic.textContent = icon;
    row.appendChild(ic);

    const lbl = document.createElement('span');
    lbl.className = 'col-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    if (contextItem) {
      if (contextItem.type === 'link') {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'tree-menu-btn grad-btn';
        copyBtn.title = 'Copy URL';
        copyBtn.innerHTML = iconSvg('copy');
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(contextItem.link.url);
            copyBtn.innerHTML = iconSvg('check');
            setTimeout(() => { copyBtn.innerHTML = iconSvg('copy'); }, 1000);
          } catch (_) {}
        });
        row.appendChild(copyBtn);
      }

      const menuBtn = document.createElement('button');
      menuBtn.className = 'tree-menu-btn grad-btn';
      menuBtn.title = 'More';
      menuBtn.innerHTML = iconSvg('more-vert');
      menuBtn.addEventListener('mouseenter', () => {
        this.showTreeContextMenu(menuBtn, contextItem);
      });
      menuBtn.addEventListener('mouseleave', () => {
        this.scheduleMenuClose(menuBtn);
      });
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menuBtn._activeMenu) {
          menuBtn._activeMenu.remove();
          menuBtn._activeMenu = null;
        } else {
          this.showTreeContextMenu(menuBtn, contextItem);
        }
      });
      row.appendChild(menuBtn);

      row.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startInlineEdit(row, lbl, contextItem);
      });
    }

    if (contextItem) row._ctx = { ...contextItem, __kind: 'tree' };

    row.addEventListener('click', () => {
      if (onClick) onClick();
    });

    // Hover-to-select for folder rows (auto-opens next column).
    if (isFolder && !selected && onClick) {
      let hoverTimer = null;
      row.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => onClick(), 180);
      });
      row.addEventListener('mouseleave', () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      });
    }
    return row;
  }

  startInlineEdit(row, labelEl, ctx) {
    if (row.querySelector('.col-label-input')) return;
    let target, oldName;
    if (ctx.type === 'link') { target = ctx.link; oldName = target.title; }
    else if (ctx.type === 'folder') { target = ctx.folder; oldName = target.name; }
    else if (ctx.type === 'tab') { target = ctx.tab; oldName = target.name; }
    const input = document.createElement('input');
    input.className = 'col-label-input';
    input.type = 'text';
    input.value = oldName;
    labelEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (commit) => {
      if (done) return;
      done = true;
      const newName = input.value.trim();
      if (commit && newName && newName !== oldName) {
        if (ctx.type === 'link') {
          await storage.updateLink(ctx.tabId, target.id, { title: newName });
        } else if (ctx.type === 'folder') {
          await storage.renameFolder(ctx.tabId, target.id, newName);
        } else if (ctx.type === 'tab') {
          await storage.renameTab(ctx.tabId, newName);
        }
        await this.render();
      } else {
        input.replaceWith(labelEl);
      }
    };

    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  scheduleMenuClose(button) {
    if (!button._activeMenu) return;
    if (button._closeTimer) clearTimeout(button._closeTimer);
    button._closeTimer = setTimeout(() => {
      if (button._activeMenu) {
        button._activeMenu.remove();
        button._activeMenu = null;
      }
    }, 200);
  }

  openCustomContextMenu(e) {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());

    // Find nearest tagged target (link/folder/tab/task).
    let target = e.target;
    while (target && !target._ctx) target = target.parentElement;
    const ctx = target?._ctx;

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    if (ctx?.__kind === 'task') {
      menu.innerHTML = `
        <button class="dropdown-item" data-act="edit">${iconSvg('edit')} Edit</button>
        <button class="dropdown-item" data-act="share">${iconSvg('share')} Share</button>
        <button class="dropdown-item danger" data-act="delete">${iconSvg('trash')} Delete</button>
      `;
    } else if (ctx?.__kind === 'tree') {
      menu.innerHTML = `
        <button class="dropdown-item" data-act="edit">${iconSvg('edit')} Edit</button>
        <button class="dropdown-item" data-act="share">${iconSvg('share')} Share</button>
        <button class="dropdown-item danger" data-act="delete">${iconSvg('trash')} Delete</button>
      `;
    } else {
      // No target → no menu.
      return;
    }
    document.body.appendChild(menu);
    menu.style.position = 'fixed';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.style.zIndex = '9999';

    menu.addEventListener('click', (ev) => ev.stopPropagation());
    menu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        const act = item.dataset.act;
        menu.remove();
        if (ctx.__kind === 'task') {
          if (act === 'edit') this.focusTaskCard(ctx.task.id);
          else if (act === 'share') {
            await uiAlert('Share task: not implemented yet.');
          } else if (act === 'delete') {
            if (await uiConfirm(`Delete task "${ctx.task.title}"?`)) {
              await storage.deleteTodoTask(ctx.projectId, ctx.task.id);
              await this.renderKanban();
            }
          }
        } else if (ctx.__kind === 'tree') {
          this.currentTab = ctx.tabId;
          if (act === 'edit') {
            const row = target.closest('.col-row');
            const labelEl = row?.querySelector('.col-label');
            if (row && labelEl) this.startInlineEdit(row, labelEl, ctx);
          } else if (act === 'share') {
            if (ctx.type === 'folder') this.showShareFolderModal(ctx.tabId, ctx.folder);
            else await uiAlert('Sharing only supported for folders right now.');
          } else if (act === 'delete') {
            if (ctx.type === 'link') this.showDeleteModal(ctx.link, 'link');
            else if (ctx.type === 'folder') this.showDeleteModal(ctx.folder, 'folder');
            else if (ctx.type === 'tab') this.deleteTabConfirm(ctx.tabId, ctx.tab.name);
          }
        }
      });
    });

    const releaseLock = () => {
      try { window.parent?.postMessage({ type: 'linkflow-drag', state: 'end' }, '*'); } catch (_) {}
    };
    menu.addEventListener('click', releaseLock);

    setTimeout(() => {
      const close = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          releaseLock();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  showTreeContextMenu(button, ctx) {
    if (button._activeMenu) return; // already open
    document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    if (ctx.type === 'link') {
      menu.innerHTML = `
        <button class="dropdown-item" data-action="rename">${iconSvg('edit')} Rename</button>
        <button class="dropdown-item" data-action="move">${iconSvg('move')} Move to...</button>
        <button class="dropdown-item" data-action="properties">${iconSvg('info')} Properties</button>
        <button class="dropdown-item danger" data-action="delete">${iconSvg('trash')} Delete</button>
      `;
    } else if (ctx.type === 'tab') {
      menu.innerHTML = `
        <button class="dropdown-item" data-action="rename">${iconSvg('edit')} Rename</button>
        <button class="dropdown-item danger" data-action="delete-tab">${iconSvg('trash')} Delete tab</button>
      `;
    } else {
      menu.innerHTML = `
        <button class="dropdown-item" data-action="rename">${iconSvg('edit')} Rename</button>
        <button class="dropdown-item" data-action="open-shallow">${iconSvg('external')} Open links (1 level)</button>
        <button class="dropdown-item" data-action="open-deep">${iconSvg('layers')} Open all nested links</button>
        <button class="dropdown-item" data-action="share">${iconSvg('share')} Share folder...</button>
        <button class="dropdown-item danger" data-action="delete">${iconSvg('trash')} Delete</button>
      `;
    }
    document.body.appendChild(menu);
    button._activeMenu = menu;
    const rect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(8, rect.right - 170)}px`;
    menu.style.zIndex = '2000';

    // Hover bridge: keep menu open while cursor over menu, close on leave.
    menu.addEventListener('mouseenter', () => {
      if (button._closeTimer) { clearTimeout(button._closeTimer); button._closeTimer = null; }
    });
    menu.addEventListener('mouseleave', () => this.scheduleMenuClose(button));

    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.currentTab = ctx.tabId;
        if (action === 'rename' && (ctx.type === 'tab' || ctx.type === 'link' || ctx.type === 'folder')) {
          const row = button.closest('.col-row');
          const labelEl = row?.querySelector('.col-label');
          if (row && labelEl) this.startInlineEdit(row, labelEl, ctx);
        } else {
          const target = ctx.type === 'link' ? ctx.link : ctx.folder;
          if (action === 'rename') this.showRenameModal(target);
          else if (action === 'move' && ctx.type === 'link') this.showMoveModal(target);
          else if (action === 'delete') this.showDeleteModal(target, ctx.type);
          else if (action === 'properties' && ctx.type === 'link') this.showPropertiesModal(ctx.link);
          else if (action === 'open-shallow' && ctx.type === 'folder') this.openFolderLinks(ctx.tabId, ctx.folder.id, false);
          else if (action === 'open-deep' && ctx.type === 'folder') this.openFolderLinks(ctx.tabId, ctx.folder.id, true);
          else if (action === 'share' && ctx.type === 'folder') this.showShareFolderModal(ctx.tabId, ctx.folder);
          else if (action === 'delete-tab' && ctx.type === 'tab') this.deleteTabConfirm(ctx.tabId, ctx.tab.name);
        }
        menu.remove();
        button._activeMenu = null;
      });
    });
    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target) && e.target !== button) {
          menu.remove();
          button._activeMenu = null;
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  async updateTabCounts() {
    /* tabs no longer rendered as badges; tree shows everything */
  }

  async saveCurrentTab() {
    try {
      // Get current browser tab
      const response = await browser.runtime.sendMessage({ type: 'GET_CURRENT_TAB' });

      if (!response || !response.url) {
        await uiAlert('Could not get current tab information');
        return;
      }

      const platform = PlatformDetector.detect(response.url);
      const detectedTitle = PlatformDetector.extractTitle(response.url, response.title);
      const title = (detectedTitle && detectedTitle.trim()) || (response.title && response.title.trim()) || response.url;

      await storage.createLink(this.currentTab, {
        title,
        url: response.url,
        platform,
        folderId: this.currentFolder
      });

      await this.render();
    } catch (err) {
      console.error('Error saving tab:', err);
      await uiAlert('Failed to save tab: ' + (err?.message || err));
    }
  }

  async saveCustomLink() {
    const urlInput = document.getElementById('customUrl');
    const titleInput = document.getElementById('customTitle');

    let url = urlInput.value.trim();
    if (!url) {
      urlInput.focus();
      return;
    }
    // Auto-prefix protocol if missing so backend + browser.tabs.create both accept it.
    if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;

    const platform = PlatformDetector.detect(url);
    const title = titleInput.value.trim() || PlatformDetector.extractTitle(url);

    try {
      await storage.createLink(this.currentTab, {
        title,
        url,
        platform,
        folderId: this.currentFolder
      });
      modalManager.close('pasteUrlModal');
      urlInput.value = '';
      titleInput.value = '';
      await this.render();
    } catch (err) {
      await uiAlert('Save URL failed: ' + (err.message || err));
    }
  }

  async createFolder() {
    const nameInput = document.getElementById('folderName');
    const name = nameInput.value.trim();

    if (!name) {
      nameInput.focus();
      return;
    }

    await storage.createFolder(this.currentTab, name, this.currentFolder);
    modalManager.close('newFolderModal');
    await this.render();
  }

  showRenameModal(item) {
    this.tempRenameContext = item;
    document.getElementById('renameInput').value = item.title || item.name;
    modalManager.open('renameModal');
  }

  async saveRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || !this.tempRenameContext) return;

    if (this.tempRenameContext.url) {
      // It's a link
      await storage.updateLink(this.currentTab, this.tempRenameContext.id, {
        title: newName
      });
    } else {
      // It's a folder
      await storage.renameFolder(this.currentTab, this.tempRenameContext.id, newName);
    }

    modalManager.close('renameModal');
    this.tempRenameContext = null;
    await this.render();
  }

  showDeleteModal(item, type) {
    this.tempDeleteContext = { item, type };
    const message = type === 'link'
      ? `Delete "${item.title}"?`
      : `Delete folder "${item.name}" and all its contents?`;

    document.getElementById('deleteMessage').textContent = message;
    modalManager.open('confirmDeleteModal');
  }

  async confirmDelete() {
    if (!this.tempDeleteContext) return;

    const { item, type } = this.tempDeleteContext;

    if (type === 'link') {
      await storage.deleteLink(this.currentTab, item.id);
    } else if (type === 'folder') {
      await storage.deleteFolder(this.currentTab, item.id);
      // If deleted folder lives in current path, truncate so we don't render a stale column.
      const idx = (this.path || []).findIndex(p => p.folderId === item.id);
      if (idx !== -1) {
        this.path = this.path.slice(0, idx);
        this.currentFolder = this.path[this.path.length - 1]?.folderId || null;
      }
    }

    modalManager.close('confirmDeleteModal');
    this.tempDeleteContext = null;
    await this.render();
  }

  async openFolderLinks(tabId, folderId, deep) {
    try {
      const allLinks = await storage.getAllLinks(tabId);
      const allFolders = await storage.getFolders(tabId);
      let targetFolderIds;
      if (deep) {
        targetFolderIds = new Set([folderId]);
        let frontier = [folderId];
        while (frontier.length) {
          const next = [];
          for (const fid of frontier) {
            const subs = allFolders.filter(f => f.parentId === fid).map(f => f.id);
            subs.forEach(s => { if (!targetFolderIds.has(s)) { targetFolderIds.add(s); next.push(s); } });
          }
          frontier = next;
        }
      } else {
        targetFolderIds = new Set([folderId]);
      }
      const links = allLinks.filter(l => targetFolderIds.has(l.folderId));
      if (links.length === 0) { await uiAlert('No links to open.'); return; }
      if (links.length > 20 && !await uiConfirm(`Open ${links.length} tabs?`)) return;
      for (const l of links) this.openLinkUrl(l.url);
    } catch (err) {
      await uiAlert('Failed: ' + (err.message || err));
    }
  }

  async showShareFolderModal(tabId, folder) {
    this.shareCtx = { tabId, folderId: folder.id, folderName: folder.name };

    const groupsList = document.getElementById('shareGroupsList');
    const friendsList = document.getElementById('shareFriendsList');
    document.getElementById('shareFolderTitle').textContent = `Share "${folder.name}"`;
    groupsList.innerHTML = '<div class="empty-state-small">Loading…</div>';
    friendsList.innerHTML = '<div class="empty-state-small">Loading…</div>';

    modalManager.open('shareFolderModal');

    try {
      const [groupsRes, friendsRes] = await Promise.all([
        api.authedFetch('/groups').catch(() => ({ groups: [] })),
        api.authedFetch('/friends').catch(() => ({ friends: [] }))
      ]);
      this.renderShareList(groupsList, groupsRes.groups || [], 'group');
      this.renderShareList(friendsList, friendsRes.friends || [], 'user');
    } catch (err) {
      groupsList.innerHTML = `<div class="empty-state-small">Could not load: ${err.message}</div>`;
    }
  }

  renderShareList(wrap, items, kind) {
    wrap.innerHTML = '';
    if (items.length === 0) {
      wrap.innerHTML = `<div class="empty-state-small">${kind === 'group' ? 'No groups' : 'No friends'}</div>`;
      return;
    }
    for (const it of items) {
      const lab = document.createElement('label');
      lab.className = 'multi-select-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = it.id;
      cb.dataset.kind = kind;
      const span = document.createElement('span');
      span.textContent = kind === 'group' ? it.name : `@${it.username}`;
      lab.append(cb, span);
      wrap.appendChild(lab);
    }
  }

  async sendShareFolder() {
    if (!this.shareCtx) return;
    const groupIds = Array.from(document.querySelectorAll('#shareGroupsList input:checked')).map(c => c.value);
    const userIds = Array.from(document.querySelectorAll('#shareFriendsList input:checked')).map(c => c.value);
    if (groupIds.length === 0 && userIds.length === 0) { await uiAlert('Select at least one target.'); return; }

    const allLinks = await storage.getAllLinks(this.shareCtx.tabId);
    const folderLinks = allLinks.filter(l => l.folderId === this.shareCtx.folderId);
    const payload = {
      folderId: this.shareCtx.folderId,
      links: folderLinks.map(l => ({ title: l.title, url: l.url, platform: l.platform }))
    };

    const note = document.getElementById('shareFolderNote').value.trim();

    try {
      if (groupIds.length) {
        await api.authedFetch('/share', {
          method: 'POST',
          body: {
            groupIds,
            kind: 'folder',
            title: this.shareCtx.folderName,
            text: note || null,
            payload
          }
        });
      }
      if (userIds.length) {
        await api.authedFetch('/share', {
          method: 'POST',
          body: {
            userIds,
            kind: 'folder',
            title: this.shareCtx.folderName,
            text: note || null,
            payload
          }
        });
      }
      modalManager.close('shareFolderModal');
      await uiAlert('Folder shared.');
    } catch (err) {
      await uiAlert('Share failed: ' + (err.message || err));
    }
  }

  async showPropertiesModal(link) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    set('propName', link.title);
    set('propUrl', link.url);
    set('propPlatform', link.platform);
    set('propTab', link.tabId);
    let folderName = 'Root';
    if (link.folderId) {
      try {
        const folders = await storage.getFolders(link.tabId);
        const f = folders.find(f => f.id === link.folderId);
        folderName = f ? f.name : link.folderId;
      } catch (_) { folderName = link.folderId; }
    }
    set('propFolder', folderName);
    set('propCreated', link.createdAt ? new Date(link.createdAt).toLocaleString() : '—');
    set('propId', link.id);

    const openBtn = document.getElementById('propOpenBtn');
    const copyBtn = document.getElementById('propCopyUrlBtn');
    const newOpen = openBtn.cloneNode(true);
    const newCopy = copyBtn.cloneNode(true);
    openBtn.replaceWith(newOpen);
    copyBtn.replaceWith(newCopy);
    newOpen.addEventListener('click', () => this.openLinkUrl(link.url));
    newCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link.url);
        const old = newCopy.textContent;
        newCopy.textContent = '✓ Copied';
        setTimeout(() => { newCopy.textContent = old; }, 1000);
      } catch (_) {}
    });

    modalManager.open('propertiesModal');
  }

  async showMoveModal(link) {
    this.tempMoveContext = link;

    // Populate tabs
    const tabs = await storage.getTabs();
    const tabSelect = document.getElementById('moveToTab');
    tabSelect.replaceChildren();
    for (const tab of tabs) {
      const opt = new Option(tab.name, tab.id, false, tab.id === this.currentTab);
      tabSelect.add(opt);
    }

    // Populate folders for current tab
    await this.updateMoveFolderOptions();

    // Update folders when tab changes
    tabSelect.addEventListener('change', () => {
      this.updateMoveFolderOptions();
    }, { once: true });

    modalManager.open('moveLinkModal');
  }

  async updateMoveFolderOptions() {
    const tabSelect = document.getElementById('moveToTab');
    const folderSelect = document.getElementById('moveToFolder');
    const selectedTab = tabSelect.value;

    const folders = await storage.getFolders(selectedTab);
    folderSelect.replaceChildren();
    folderSelect.add(new Option('No Folder (Root)', ''));
    for (const folder of folders) {
      folderSelect.add(new Option(folder.name, folder.id));
    }
  }

  ensureChatsFrame() {
    const frame = document.getElementById('chatsFrameInline');
    if (frame && !frame.src) {
      frame.src = browser.runtime.getURL('playground/playground.html') + '?embed=1';
    }
  }

  async renderHub() {
    // Default sub-mode: hub page visible, module pane hidden.
    document.getElementById('hubPage').hidden = false;
    document.getElementById('hubModulePane').hidden = true;

    const modules = [
      { name: 'Canvas', desc: 'Drawing board', module: 'canvas/canvas.html' },
      { name: 'GitHub explorer', desc: 'Repos, commits, issues, PRs', module: 'github/github.html' },
      { name: 'Feed', desc: 'Posts, comments, likes', module: 'feed/feed.html' },
      { name: 'Startup explorer', desc: 'HN, Product Hunt, GitHub trending', module: 'startups/startups.html' },
      { name: 'Clocks', desc: 'Multi-timezone clocks', module: 'clocks/clocks.html' },
      { name: 'Timer', desc: 'Pomodoro / countdown', module: 'timer/timer.html' },
      { name: 'Blogs', desc: 'Long-form like Medium', module: 'blogs/blogs.html' },
      { name: 'Newsletters', desc: 'Subscribe + read RSS', module: 'newsletters/newsletters.html' }
    ];
    const grid = document.getElementById('hubModules');
    if (grid) {
      grid.innerHTML = '';
      for (const m of modules) {
        const card = document.createElement('div');
        card.className = 'hub-card' + (m.soon ? ' soon' : ' live');
        card.innerHTML = `
          <strong>${m.name}</strong>
          <div class="hub-card-desc">${m.desc}</div>
          ${m.soon ? '<span class="hub-badge">Soon</span>' : '<span class="hub-badge live-badge">Open</span>'}`;
        if (!m.soon && m.module) {
          card.addEventListener('click', () => this.openHubModule(m.name, m.module));
        } else if (!m.soon && m.external) {
          card.addEventListener('click', () => this.openLinkUrl(m.external));
        }
        grid.appendChild(card);
      }
    }

    const back = document.getElementById('hubBackBtn');
    if (back && !back._wired) {
      back._wired = true;
      back.addEventListener('click', () => {
        document.getElementById('hubPage').hidden = false;
        document.getElementById('hubModulePane').hidden = true;
        const f = document.getElementById('hubModuleFrame');
        if (f) f.src = 'about:blank';
      });
    }

    // Wire request modal triggers
    const addBtn = document.getElementById('addFeatureBtn');
    if (addBtn && !addBtn._wired) {
      addBtn._wired = true;
      addBtn.addEventListener('click', () => {
        document.getElementById('frTitle').value = '';
        document.getElementById('frDesc').value = '';
        modalManager.open('featureRequestModal');
      });
    }
    const submit = document.getElementById('submitFeatureBtn');
    if (submit && !submit._wired) {
      submit._wired = true;
      submit.addEventListener('click', () => this.submitFeatureRequest());
    }

    await this.loadFeatureRequests();
  }

  openHubModule(name, modulePath) {
    document.getElementById('hubPage').hidden = true;
    document.getElementById('hubModulePane').hidden = false;
    document.getElementById('hubModuleTitle').textContent = name;
    const f = document.getElementById('hubModuleFrame');
    f.src = browser.runtime.getURL(modulePath);
  }

  async loadFeatureRequests() {
    const list = document.getElementById('featureReqList');
    if (!list) return;
    list.innerHTML = '<div class="hub-empty">Loading…</div>';
    try {
      const reqs = await storage.listFeatureRequests();
      list.innerHTML = '';
      if (reqs.length === 0) {
        list.innerHTML = '<div class="hub-empty">No requests yet.</div>';
        return;
      }
      for (const r of reqs) {
        const row = document.createElement('div');
        row.className = 'fr-row';
        row.innerHTML = `
          <div class="fr-main">
            <strong>${escapeText(r.title)}</strong>
            <div class="fr-desc">${escapeText(r.description || '')}</div>
            <div class="fr-time">${new Date(r.createdAt).toLocaleString()}</div>
          </div>
          <span class="fr-status fr-${r.status}">${r.status}</span>
        `;
        list.appendChild(row);
      }
    } catch (err) {
      list.innerHTML = `<div class="hub-empty">Failed: ${escapeText(err.message || err)}</div>`;
    }
  }

  async submitFeatureRequest() {
    const title = document.getElementById('frTitle').value.trim();
    const description = document.getElementById('frDesc').value.trim();
    if (!title) { await uiAlert('Title required.'); return; }
    try {
      await storage.createFeatureRequest({ title, description });
      modalManager.close('featureRequestModal');
      await this.loadFeatureRequests();
    } catch (err) {
      await uiAlert('Failed: ' + (err.message || err));
    }
  }

  ensurePlaygroundFrame() {
    // Legacy alias — old name; new code uses ensureChatsFrame.
    this.ensureChatsFrame();
  }

  async confirmMove() {
    if (!this.tempMoveContext) return;

    const toTab = document.getElementById('moveToTab').value;
    const toFolder = document.getElementById('moveToFolder').value || null;

    await storage.moveLink(this.currentTab, this.tempMoveContext.id, toTab, toFolder);

    modalManager.close('moveLinkModal');
    this.tempMoveContext = null;
    await this.render();
  }
}

// Initialize popup when DOM is ready, gated on auth.
async function bootstrapPopup() {
  // Embed-mode flag — popup may be loaded inside floating panel iframe (?embed=1).
  // In that case body fills 100% so the iframe content reflows on resize.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === '1') document.body.classList.add('embed-mode');
  } catch (_) {}

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await auth.logout();
      location.reload();
    });
  }

  const authed = await auth.isAuthed();
  if (!authed) {
    document.body.dataset.authed = 'false';
    const overlay = createLoginOverlay({ onAuthed: () => location.reload() });
    document.body.appendChild(overlay);
    return;
  }

  document.body.dataset.authed = 'true';
  new PopupController();
}

document.addEventListener('DOMContentLoaded', bootstrapPopup);
