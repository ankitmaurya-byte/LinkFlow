// Main Popup Controller

class PopupController {
  constructor() {
    this.currentTab = 'work';
    this.currentFolder = null;
    this.searchQuery = '';
    this.expanded = new Set();

    this.tempRenameContext = null;
    this.tempDeleteContext = null;
    this.tempMoveContext = null;

    this.init();
  }

  async init() {
    await this.loadCurrentView();
    this.bindEvents();
    await this.render();
  }

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

    // Open playground (embedded inside popup) — from settings menu
    document.getElementById('playgroundBtn').addEventListener('click', () => {
      settingsMenu.hidden = true;
      settingsBtn.setAttribute('aria-expanded', 'false');
      this.openPlaygroundEmbedded();
    });

    document.getElementById('closePlaygroundBtn').addEventListener('click', () => {
      this.closePlaygroundEmbedded();
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

  async render() {
    this.ensurePath();
    const container = document.getElementById('itemsContainer');
    const emptyState = document.getElementById('emptyState');
    container.innerHTML = '';

    // Column 0: tabs (root folders)
    const tabs = (await storage.getTabs()).filter(t => t.id !== 'all-links');
    const col0 = document.createElement('div');
    col0.className = 'tree-column';
    for (const tab of tabs) {
      const selected = this.path[0]?.tabId === tab.id;
      col0.appendChild(this.makeColRow({
        label: tab.name,
        icon: '📁',
        isFolder: true,
        selected,
        hasChildren: true,
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
          icon: '📁',
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
          onClick: () => browser.tabs.create({ url: l.url })
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
      { icon: '💾', label: 'Save Current Tab', run: () => this.saveCurrentInto(tabId, folderId) },
      { icon: '🔗', label: 'Paste URL', run: () => this.openPasteAt(tabId, folderId) },
      { icon: '📁', label: 'New Folder', run: () => this.openNewFolderAt(tabId, folderId) },
    ];
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'col-action';
      btn.title = a.label;
      const ic = document.createElement('span');
      ic.className = 'col-action-icon';
      ic.textContent = a.icon;
      const lbl = document.createElement('span');
      lbl.className = 'col-action-label';
      lbl.textContent = a.label;
      btn.append(ic, lbl);
      btn.addEventListener('click', (e) => { e.stopPropagation(); a.run(); });
      row.appendChild(btn);
    }
    return row;
  }

  saveCurrentInto(tabId, folderId) {
    this.currentTab = tabId;
    this.currentFolder = folderId;
    this.saveCurrentTab();
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
    ic.textContent = icon;
    row.appendChild(ic);

    const lbl = document.createElement('span');
    lbl.className = 'col-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    if (isFolder && hasChildren) {
      const arrow = document.createElement('span');
      arrow.className = 'col-arrow';
      arrow.textContent = '›';
      row.appendChild(arrow);
    }

    if (contextItem) {
      const menuBtn = document.createElement('button');
      menuBtn.className = 'tree-menu-btn';
      menuBtn.textContent = '⋮';
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showTreeContextMenu(menuBtn, contextItem);
      });
      row.appendChild(menuBtn);
    }

    row.addEventListener('click', () => {
      if (onClick) onClick();
    });
    return row;
  }

  showTreeContextMenu(button, ctx) {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    if (ctx.type === 'link') {
      menu.innerHTML = `
        <button class="dropdown-item" data-action="rename">✏️ Rename</button>
        <button class="dropdown-item" data-action="move">📁 Move to...</button>
        <button class="dropdown-item danger" data-action="delete">🗑️ Delete</button>
      `;
    } else {
      menu.innerHTML = `
        <button class="dropdown-item" data-action="rename">✏️ Rename</button>
        <button class="dropdown-item danger" data-action="delete">🗑️ Delete</button>
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
        const target = ctx.type === 'link' ? ctx.link : ctx.folder;
        this.currentTab = ctx.tabId;
        if (action === 'rename') this.showRenameModal(target);
        else if (action === 'move' && ctx.type === 'link') this.showMoveModal(target);
        else if (action === 'delete') this.showDeleteModal(target, ctx.type);
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

    const url = urlInput.value.trim();
    if (!url) {
      urlInput.focus();
      return;
    }

    const platform = PlatformDetector.detect(url);
    const title = titleInput.value.trim() || PlatformDetector.extractTitle(url);

    await storage.createLink(this.currentTab, {
      title,
      url,
      platform,
      folderId: this.currentFolder
    });

    modalManager.close('pasteUrlModal');
    await this.render();
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

  openPlaygroundEmbedded() {
    const overlay = document.getElementById('playgroundOverlay');
    const frame = document.getElementById('playgroundFrame');
    if (!frame.src) {
      frame.src = browser.runtime.getURL('playground/playground.html') + '?embed=1';
    }
    overlay.hidden = false;
  }

  closePlaygroundEmbedded() {
    const overlay = document.getElementById('playgroundOverlay');
    overlay.hidden = true;
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
