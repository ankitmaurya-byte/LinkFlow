// Dashboard Controller (similar to popup but with grid/list views)

class DashboardController {
  constructor() {
    this.currentTab = 'all-links';
    this.currentFolder = null;
    this.searchQuery = '';
    this.viewMode = 'grid'; // grid or list
    this.sortBy = 'recent';
    this.breadcrumbsManager = new Breadcrumbs('breadcrumbs');
    this.tempDeleteContext = null;

    this.init();
  }

  async init() {
    await this.loadCurrentView();
    if (typeof hydrateIcons === 'function') hydrateIcons();
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

    // View mode toggle
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchViewMode(btn.dataset.mode);
      });
    });

    // Sort
    document.getElementById('sortBy').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.render();
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });

    // Actions
    document.getElementById('saveCurrentTabBtn').addEventListener('click', () => {
      this.saveCurrentTab();
    });

    document.getElementById('newFolderBtn').addEventListener('click', () => {
      modalManager.open('newFolderModal');
    });

    document.getElementById('pasteUrlBtn').addEventListener('click', () => {
      modalManager.open('pasteUrlModal');
    });

    const fileInput = document.getElementById('bookmarksFileInput');
    document.getElementById('importBookmarksBtn').addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this.importBookmarksFile(file);
    });

    document.getElementById('playgroundBtn').addEventListener('click', () => {
      browser.runtime.sendMessage({ type: 'OPEN_PLAYGROUND' });
    });

    // Modal actions
    document.getElementById('createFolderBtn').addEventListener('click', () => {
      this.createFolder();
    });

    document.getElementById('saveCustomLinkBtn').addEventListener('click', () => {
      this.saveCustomLink();
    });

    document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
      this.confirmDelete();
    });
  }

  switchViewMode(mode) {
    this.viewMode = mode;

    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const container = document.getElementById('itemsContainer');
    container.classList.toggle('grid-view', mode === 'grid');
    container.classList.toggle('list-view', mode === 'list');
  }

  async switchTab(tabId) {
    this.currentTab = tabId;
    this.currentFolder = null;
    this.searchQuery = '';
    document.getElementById('searchInput').value = '';

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

    container.innerHTML = '';

    // Update breadcrumbs
    const breadcrumbs = await this.getBreadcrumbs();
    this.breadcrumbsManager.render(breadcrumbs, (tabId, folderId) => {
      this.navigateUp(tabId, folderId);
    });

    // Get data
    let folders;
    let links;
    if (this.currentTab === 'all-links' && this.currentFolder === null) {
      folders = [];
      const tabs = await storage.getTabs();
      links = [];
      for (const t of tabs) {
        if (t.id === 'all-links') continue;
        const tabLinks = await storage.getAllLinks(t.id);
        links.push(...tabLinks);
      }
    } else {
      folders = await storage.getFolders(this.currentTab);
      links = await storage.getLinks(this.currentTab, this.currentFolder);
      folders = folders.filter(f => f.parentId === this.currentFolder);
    }

    // Apply search
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      folders = folders.filter(f => f.name.toLowerCase().includes(query));
      links = links.filter(l =>
        l.title.toLowerCase().includes(query) ||
        l.url.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    links = this.sortLinks(links);

    // Render folders
    const allTabLinks = await storage.getAllLinks(this.currentTab);
    const allTabFolders = await storage.getFolders(this.currentTab);
    for (const folder of folders) {
      const linkCount = allTabLinks.filter(l => l.folderId === folder.id).length;
      const subCount = allTabFolders.filter(f => f.parentId === folder.id).length;
      const itemCount = linkCount + subCount;

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
          // TODO: Implement rename
          alert('Rename feature - Coming soon!');
        },
        onMove: (link) => {
          alert('Move feature - Coming soon!');
        },
        onDelete: (link) => {
          this.showDeleteModal(link);
        }
      });
      container.appendChild(linkCard);
    }

    // Empty state
    if (folders.length === 0 && links.length === 0) {
      emptyState.style.display = 'block';
      container.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      container.style.display = this.viewMode === 'grid' ? 'grid' : 'flex';
    }

    // Update counts
    await this.updateTabCounts();
  }

  sortLinks(links) {
    switch (this.sortBy) {
      case 'recent':
        return links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'oldest':
        return links.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      case 'name':
        return links.sort((a, b) => a.title.localeCompare(b.title));
      case 'platform':
        return links.sort((a, b) => a.platform.localeCompare(b.platform));
      default:
        return links;
    }
  }

  async updateTabCounts() {
    const tabs = await storage.getTabs();
    let total = 0;

    for (const tab of tabs) {
      if (tab.id === 'all-links') continue;
      const links = await storage.getAllLinks(tab.id);
      total += links.length;
      const count = document.querySelector(`[data-tab="${tab.id}"] .tab-count`);
      if (count) {
        count.textContent = links.length;
      }
    }
    const allCount = document.querySelector('[data-tab="all-links"] .tab-count');
    if (allCount) allCount.textContent = total;
  }

  async saveCurrentTab() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        alert('Could not get current tab');
        return;
      }

      const platform = PlatformDetector.detect(tab.url);
      const title = PlatformDetector.extractTitle(tab.url, tab.title);

      await storage.createLink(this.currentTab, {
        title,
        url: tab.url,
        platform,
        folderId: this.currentFolder
      });

      await this.render();

      const btn = document.getElementById('saveCurrentTabBtn');
      const originalNodes = Array.from(btn.childNodes);
      btn.replaceChildren();
      btn.textContent = '✓ Saved!';
      setTimeout(() => {
        btn.replaceChildren(...originalNodes);
      }, 2000);
    } catch (err) {
      console.error('Error saving tab:', err);
      alert('Failed to save tab');
    }
  }

  async saveCustomLink() {
    const url = document.getElementById('customUrl').value.trim();
    const title = document.getElementById('customTitle').value.trim();

    if (!url) return;

    const platform = PlatformDetector.detect(url);
    const finalTitle = title || PlatformDetector.extractTitle(url);

    await storage.createLink(this.currentTab, {
      title: finalTitle,
      url,
      platform,
      folderId: this.currentFolder
    });

    modalManager.close('pasteUrlModal');
    await this.render();
  }

  async importBookmarksFile(file) {
    const btn = document.getElementById('importBookmarksBtn');
    const originalNodes = Array.from(btn.childNodes);
    btn.replaceChildren();
    btn.textContent = '⏳ Importing...';
    btn.disabled = true;
    try {
      const html = await file.text();
      const stats = await bookmarksImporter.import(html, {
        tabId: this.currentTab
      });
      try { await browser.runtime.sendMessage({ type: 'SYNC_BOOKMARKS' }); } catch (_) {}
      btn.textContent = `✓ ${stats.added} links, ${stats.folders} folders, ${stats.duplicates} dup`;
      await this.render();
    } catch (err) {
      console.error('Import failed:', err);
      btn.textContent = '✗ Import failed';
      alert('Failed to import: ' + err.message);
    } finally {
      setTimeout(() => {
        btn.replaceChildren(...originalNodes);
        btn.disabled = false;
      }, 2500);
    }
  }

  async createFolder() {
    const name = document.getElementById('folderName').value.trim();
    if (!name) return;

    await storage.createFolder(this.currentTab, name, this.currentFolder);
    modalManager.close('newFolderModal');
    await this.render();
  }

  showDeleteModal(link) {
    this.tempDeleteContext = link;
    document.getElementById('deleteMessage').textContent = `Delete "${link.title}"?`;
    modalManager.open('confirmDeleteModal');
  }

  async confirmDelete() {
    if (!this.tempDeleteContext) return;

    await storage.deleteLink(this.currentTab, this.tempDeleteContext.id);
    modalManager.close('confirmDeleteModal');
    this.tempDeleteContext = null;
    await this.render();
  }
}

// Initialize, gated on auth.
async function bootstrapDashboard() {
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
  if (logoutBtn) logoutBtn.hidden = false;
  new DashboardController();
}

document.addEventListener('DOMContentLoaded', bootstrapDashboard);
