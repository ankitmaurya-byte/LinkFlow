// Main Popup Controller

class PopupController {
  constructor() {
    this.currentTab = 'all-links';
    this.currentFolder = null;
    this.searchQuery = '';
    this.breadcrumbsManager = new Breadcrumbs('breadcrumbs');

    // State for context actions
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
    this.currentTab = view.tabId || 'all-links';
    this.currentFolder = view.folderId || null;
  }

  async saveCurrentView() {
    await storage.setCurrentView({
      tabId: this.currentTab,
      folderId: this.currentFolder,
      breadcrumbs: await this.getBreadcrumbs()
    });
  }

  bindEvents() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    // Save current tab button
    document.getElementById('saveCurrentTabBtn').addEventListener('click', () => {
      this.saveCurrentTab();
    });

    // Paste URL button
    document.getElementById('pasteUrlBtn').addEventListener('click', () => {
      modalManager.open('pasteUrlModal');
    });

    // Save custom link
    document.getElementById('saveCustomLinkBtn').addEventListener('click', () => {
      this.saveCustomLink();
    });

    // New folder button
    document.getElementById('newFolderBtn').addEventListener('click', () => {
      modalManager.open('newFolderModal');
    });

    // Create folder
    document.getElementById('createFolderBtn').addEventListener('click', () => {
      this.createFolder();
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      // Future: open settings
      alert('Settings coming soon!');
    });

    // Open dashboard
    document.getElementById('openDashboardBtn').addEventListener('click', () => {
      browser.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    });

    // Open playground
    document.getElementById('playgroundBtn').addEventListener('click', () => {
      browser.runtime.sendMessage({ type: 'OPEN_PLAYGROUND' });
    });

    // Folder actions (inside folder)
    document.getElementById('addLinkInFolderBtn')?.addEventListener('click', () => {
      modalManager.open('pasteUrlModal');
    });

    document.getElementById('addSubFolderBtn')?.addEventListener('click', () => {
      modalManager.open('newFolderModal');
    });

    document.getElementById('deleteFolderBtn')?.addEventListener('click', () => {
      this.deleteCurrentFolder();
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

  async switchTab(tabId) {
    this.currentTab = tabId;
    this.currentFolder = null;
    this.searchQuery = '';
    document.getElementById('searchInput').value = '';

    // Update active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    await this.saveCurrentView();
    await this.render();
  }

  async navigateToFolder(folderId) {
    this.currentFolder = folderId;
    await this.saveCurrentView();
    await this.render();
  }

  async navigateUp(tabId, folderId) {
    this.currentTab = tabId;
    this.currentFolder = folderId;
    await this.saveCurrentView();
    await this.render();
  }

  async getBreadcrumbs() {
    if (!this.currentFolder) return [];

    const breadcrumbs = [];
    const tabs = await storage.getTabs();
    const currentTabObj = tabs.find(t => t.id === this.currentTab);

    if (currentTabObj) {
      breadcrumbs.push({
        name: currentTabObj.name,
        tabId: this.currentTab,
        folderId: null
      });
    }

    // Build folder path
    const folders = await storage.getFolders(this.currentTab);
    let folderId = this.currentFolder;
    const folderPath = [];

    while (folderId) {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        folderPath.unshift(folder);
        folderId = folder.parentId;
      } else {
        break;
      }
    }

    folderPath.forEach(folder => {
      breadcrumbs.push({
        name: folder.name,
        tabId: this.currentTab,
        folderId: folder.id
      });
    });

    return breadcrumbs;
  }

  async render() {
    const container = document.getElementById('itemsContainer');
    const emptyState = document.getElementById('emptyState');
    const folderActions = document.getElementById('folderActions');

    container.innerHTML = '';

    // Update breadcrumbs
    const breadcrumbs = await this.getBreadcrumbs();
    this.breadcrumbsManager.render(breadcrumbs, (tabId, folderId) => {
      this.navigateUp(tabId, folderId);
    });

    // Show/hide folder actions
    if (this.currentFolder) {
      folderActions.style.display = 'flex';
    } else {
      folderActions.style.display = 'none';
    }

    // Get folders and links
    let folders = await storage.getFolders(this.currentTab);
    let links = await storage.getLinks(this.currentTab, this.currentFolder);

    // Filter by current folder
    folders = folders.filter(f => f.parentId === this.currentFolder);

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      folders = folders.filter(f => f.name.toLowerCase().includes(query));
      links = links.filter(l =>
        l.title.toLowerCase().includes(query) ||
        l.url.toLowerCase().includes(query)
      );
    }

    // Render folders
    for (const folder of folders) {
      const allLinks = await storage.getAllLinks(this.currentTab);
      const itemCount = allLinks.filter(l => l.folderId === folder.id).length;

      const folderCard = createFolderCard(folder, itemCount, () => {
        this.navigateToFolder(folder.id);
      });
      container.appendChild(folderCard);
    }

    // Render links
    for (const link of links) {
      const linkCard = createLinkCard(link, {
        onOpen: (link) => {
          browser.tabs.create({ url: link.url });
        },
        onRename: (link) => {
          this.showRenameModal(link);
        },
        onMove: (link) => {
          this.showMoveModal(link);
        },
        onDelete: (link) => {
          this.showDeleteModal(link, 'link');
        }
      });
      container.appendChild(linkCard);
    }

    // Show empty state if no items
    if (folders.length === 0 && links.length === 0) {
      emptyState.style.display = 'block';
      if (this.searchQuery) {
        emptyState.querySelector('.empty-text').textContent = 'No results found';
        emptyState.querySelector('.empty-subtext').textContent = 'Try a different search term';
      } else {
        emptyState.querySelector('.empty-text').textContent = 'No links yet';
        emptyState.querySelector('.empty-subtext').textContent = 'Save your first link to get started';
      }
    } else {
      emptyState.style.display = 'none';
    }

    // Update tab counts
    await this.updateTabCounts();
  }

  async updateTabCounts() {
    const tabs = await storage.getTabs();

    for (const tab of tabs) {
      const links = await storage.getAllLinks(tab.id);
      const badge = document.querySelector(`[data-tab="${tab.id}"] .tab-badge`);
      if (badge) {
        badge.textContent = links.length;
        badge.dataset.count = links.length;
      }
    }
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

      // Visual feedback
      const btn = document.getElementById('saveCurrentTabBtn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="btn-icon">✓</span> Saved!';
      btn.style.background = 'var(--success)';

      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '';
      }, 1500);
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

  async deleteCurrentFolder() {
    if (!this.currentFolder) return;

    const folders = await storage.getFolders(this.currentTab);
    const folder = folders.find(f => f.id === this.currentFolder);

    if (folder) {
      this.showDeleteModal(folder, 'folder');

      // After deletion, navigate up
      const originalFolder = this.currentFolder;
      setTimeout(async () => {
        if (!this.tempDeleteContext && this.currentFolder === originalFolder) {
          this.currentFolder = folder.parentId;
          await this.saveCurrentView();
          await this.render();
        }
      }, 100);
    }
  }

  async showMoveModal(link) {
    this.tempMoveContext = link;

    // Populate tabs
    const tabs = await storage.getTabs();
    const tabSelect = document.getElementById('moveToTab');
    tabSelect.innerHTML = tabs.map(tab =>
      `<option value="${tab.id}" ${tab.id === this.currentTab ? 'selected' : ''}>${tab.name}</option>`
    ).join('');

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
    folderSelect.innerHTML = '<option value="">No Folder (Root)</option>' +
      folders.map(folder =>
        `<option value="${folder.id}">${folder.name}</option>`
      ).join('');
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

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
