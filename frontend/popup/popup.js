// Main Popup Controller

if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  // eslint-disable-next-line no-global-assign
  window.browser = chrome;
}

class PopupController {
  constructor() {
    this.currentTab = 'work';
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
    await this.render();
  }

  hydrateIcons() { hydrateIcons(); }

  async loadCurrentView() {
    const view = await storage.getCurrentView();
    this.currentTab = (view.tabId && view.tabId !== 'all-links') ? view.tabId : 'work';
    this.currentFolder = view.folderId || null;
    this.expanded.add(`tab:${this.currentTab}`);
    this.path = [{ tabId: this.currentTab, folderId: null }];
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
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !settingsMenu.hidden;
      settingsMenu.hidden = isOpen;
      settingsBtn.setAttribute('aria-expanded', String(!isOpen));
    });
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
    document.getElementById('playgroundView').hidden = mode !== 'playground';
    if (mode === 'todo') await this.renderTodo();
    else if (mode === 'playground') this.ensurePlaygroundFrame();
    else await this.render();
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
        if (!confirm(`Delete project "${p.name}" and all its tasks?`)) return;
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
      if (!confirm(`Delete status "${status.name}" and its tasks?`)) return;
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
      if (confirm(`Delete task "${task.title}"?`)) {
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
    const container = document.getElementById('itemsContainer');
    const emptyState = document.getElementById('emptyState');
    container.innerHTML = '';

    // Column 0: tabs (root folders)
    const tabs = (await storage.getTabs()).filter(t => t.id !== 'all-links');
    const col0 = document.createElement('div');
    col0.className = 'tree-column';

    // Action row uses currently-selected tab (or first tab) + root folderId
    const ctxTabId = this.path[0]?.tabId || tabs[0]?.id || 'work';
    col0.appendChild(this.makeActionRow(ctxTabId, null));

    for (const tab of tabs) {
      const selected = this.path[0]?.tabId === tab.id;
      col0.appendChild(this.makeColRow({
        label: tab.name,
        icon: iconSvg('folder'),
        isFolder: true,
        selected,
        hasChildren: true,
        contextItem: { type: 'tab', tabId: tab.id, tab },
        onClick: () => {
          this.path = [{ tabId: tab.id, folderId: null }];
          this.currentTab = tab.id;
          this.currentFolder = null;
          this.saveCurrentView();
          this.render();
        }
      }));
    }
    container.appendChild(col0);

    // Subsequent columns from path
    for (let i = 0; i < this.path.length; i++) {
      const node = this.path[i];
      const col = document.createElement('div');
      col.className = 'tree-column';

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
        col.appendChild(this.makeColRow({
          label: l.title,
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

    if (tabs.length === 0) {
      emptyState.style.display = 'block';
      emptyState.querySelector('.empty-text').textContent = 'No tabs';
      emptyState.querySelector('.empty-subtext').textContent = '';
    } else {
      emptyState.style.display = 'none';
    }

    // Auto-scroll to right so newest column is visible
    container.scrollLeft = container.scrollWidth;

    await this.updateTabCounts();
  }

  makeActionRow(tabId, folderId) {
    const row = document.createElement('div');
    row.className = 'col-action-row';
    const actions = [
      { icon: 'save', label: 'Save Current Tab', run: () => this.saveCurrentInto(tabId, folderId) },
      { icon: 'save-close', label: 'Save & Close Tab', run: () => this.saveCurrentAndClose(tabId, folderId) },
      { icon: 'link', label: 'Paste URL', run: () => this.openPasteAt(tabId, folderId) },
      { icon: 'folder-plus', label: 'New Folder', run: () => this.openNewFolderAt(tabId, folderId) },
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
      const [active] = await browser.tabs.query({ active: true, currentWindow: true });
      await this.saveCurrentTab();
      if (active && active.id !== undefined) {
        await browser.tabs.remove(active.id);
      }
    } catch (err) {
      console.error('LinkFlow: save & close failed', err);
    }
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

  makeColRow({ label, icon, isFolder, selected, hasChildren, onClick, contextItem }) {
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

    if (isFolder && hasChildren) {
      const arrow = document.createElement('span');
      arrow.className = 'col-arrow';
      arrow.innerHTML = iconSvg('chevron');
      row.appendChild(arrow);
    }

    if (contextItem) {
      if (contextItem.type === 'link') {
        const openBtn = document.createElement('button');
        openBtn.className = 'tree-menu-btn';
        openBtn.title = 'Open in new tab';
        openBtn.innerHTML = iconSvg('external');
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openLinkUrl(contextItem.link.url);
        });
        row.appendChild(openBtn);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'tree-menu-btn';
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

      const editBtn = document.createElement('button');
      editBtn.className = 'tree-menu-btn';
      editBtn.title = 'Edit';
      editBtn.innerHTML = iconSvg('edit');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startInlineEdit(row, lbl, contextItem);
      });
      row.appendChild(editBtn);

      const menuBtn = document.createElement('button');
      menuBtn.className = 'tree-menu-btn';
      menuBtn.title = 'More';
      menuBtn.innerHTML = iconSvg('more-vert');
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showTreeContextMenu(menuBtn, contextItem);
      });
      row.appendChild(menuBtn);

      row.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startInlineEdit(row, lbl, contextItem);
      });
    }

    row.addEventListener('click', () => {
      if (onClick) onClick();
    });
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

  showTreeContextMenu(button, ctx) {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    if (ctx.type === 'link') {
      menu.innerHTML = `
        <button class="dropdown-item" data-action="move">${iconSvg('move')} Move to...</button>
        <button class="dropdown-item danger" data-action="delete">${iconSvg('trash')} Delete</button>
        <button class="dropdown-item" data-action="properties">${iconSvg('info')} Properties</button>
      `;
    } else if (ctx.type === 'tab') {
      menu.innerHTML = `
        <button class="dropdown-item" data-action="rename">${iconSvg('edit')} Rename</button>
      `;
    } else {
      menu.innerHTML = `
        <button class="dropdown-item" data-action="rename">${iconSvg('edit')} Rename</button>
        <button class="dropdown-item danger" data-action="delete">${iconSvg('trash')} Delete</button>
      `;
    }
    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left - 120}px`;
    menu.style.zIndex = '2000';

    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.currentTab = ctx.tabId;
        if (action === 'rename' && ctx.type === 'tab') {
          const row = button.closest('.col-row');
          const labelEl = row?.querySelector('.col-label');
          if (row && labelEl) this.startInlineEdit(row, labelEl, ctx);
        } else {
          const target = ctx.type === 'link' ? ctx.link : ctx.folder;
          if (action === 'rename') this.showRenameModal(target);
          else if (action === 'move' && ctx.type === 'link') this.showMoveModal(target);
          else if (action === 'delete') this.showDeleteModal(target, ctx.type);
          else if (action === 'properties' && ctx.type === 'link') this.showPropertiesModal(ctx.link);
        }
        menu.remove();
      });
    });
    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target) && e.target !== button) {
          menu.remove();
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
        alert('Could not get current tab information');
        return;
      }

      const platform = PlatformDetector.detect(response.url);
      const title = PlatformDetector.extractTitle(response.url, response.title);

      await storage.createLink(this.currentTab, {
        title,
        url: response.url,
        platform,
        folderId: this.currentFolder
      });

      await this.render();
    } catch (err) {
      console.error('Error saving tab:', err);
      alert('Failed to save tab');
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
      alert('Save URL failed: ' + (err.message || err));
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
    }

    modalManager.close('confirmDeleteModal');
    this.tempDeleteContext = null;
    await this.render();
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

  ensurePlaygroundFrame() {
    const frame = document.getElementById('playgroundFrameInline');
    if (frame && !frame.src) {
      frame.src = browser.runtime.getURL('playground/playground.html') + '?embed=1';
    }
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
