// Storage management layer for LinkFlow

class StorageManager {
  constructor() {
    this.storage = browser.storage.local;
  }

  // Get all data
  async getAll() {
    return await this.storage.get(null);
  }

  // Get specific keys
  async get(keys) {
    return await this.storage.get(keys);
  }

  // Set data
  async set(data) {
    return await this.storage.set(data);
  }

  // === TABS ===
  async getTabs() {
    const { tabs } = await this.get(['tabs']);
    return tabs || [];
  }

  async updateTabCount(tabId, count) {
    const tabs = await this.getTabs();
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.count = count;
      await this.set({ tabs });
    }
  }

  // === FOLDERS ===
  async getFolders(tabId) {
    const { folders } = await this.get(['folders']);
    return folders?.[tabId] || [];
  }

  async createFolder(tabId, name, parentId = null) {
    const { folders } = await this.get(['folders']);
    const tabFolders = folders?.[tabId] || [];

    const newFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      parentId,
      tabId,
      createdAt: new Date().toISOString()
    };

    tabFolders.push(newFolder);

    const updatedFolders = { ...folders, [tabId]: tabFolders };
    await this.set({ folders: updatedFolders });

    return newFolder;
  }

  async deleteFolder(tabId, folderId) {
    const { folders, links } = await this.get(['folders', 'links']);

    // Remove folder
    const tabFolders = folders?.[tabId] || [];
    const updatedFolders = tabFolders.filter(f => f.id !== folderId && f.parentId !== folderId);

    // Remove links in folder
    const tabLinks = links?.[tabId] || [];
    const updatedLinks = tabLinks.filter(l => l.folderId !== folderId);

    await this.set({
      folders: { ...folders, [tabId]: updatedFolders },
      links: { ...links, [tabId]: updatedLinks }
    });
  }

  async renameFolder(tabId, folderId, newName) {
    const { folders } = await this.get(['folders']);
    const tabFolders = folders?.[tabId] || [];
    const folder = tabFolders.find(f => f.id === folderId);

    if (folder) {
      folder.name = newName;
      await this.set({ folders: { ...folders, [tabId]: tabFolders } });
    }
  }

  // === LINKS ===
  async getLinks(tabId, folderId = null) {
    const { links } = await this.get(['links']);
    const tabLinks = links?.[tabId] || [];

    if (folderId === null) {
      return tabLinks.filter(l => !l.folderId);
    }

    return tabLinks.filter(l => l.folderId === folderId);
  }

  async getAllLinks(tabId) {
    const { links } = await this.get(['links']);
    return links?.[tabId] || [];
  }

  async createLink(tabId, linkData) {
    const { links } = await this.get(['links']);
    const tabLinks = links?.[tabId] || [];

    const newLink = {
      id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: linkData.title,
      url: linkData.url,
      platform: linkData.platform,
      folderId: linkData.folderId || null,
      tabId,
      createdAt: new Date().toISOString()
    };

    tabLinks.push(newLink);

    const updatedLinks = { ...links, [tabId]: tabLinks };
    await this.set({ links: updatedLinks });

    // Update tab count
    await this.updateTabCount(tabId, tabLinks.length);

    return newLink;
  }

  async deleteLink(tabId, linkId) {
    const { links } = await this.get(['links']);
    const tabLinks = links?.[tabId] || [];
    const updatedLinks = tabLinks.filter(l => l.id !== linkId);

    await this.set({ links: { ...links, [tabId]: updatedLinks } });
    await this.updateTabCount(tabId, updatedLinks.length);
  }

  async updateLink(tabId, linkId, updates) {
    const { links } = await this.get(['links']);
    const tabLinks = links?.[tabId] || [];
    const link = tabLinks.find(l => l.id === linkId);

    if (link) {
      Object.assign(link, updates);
      await this.set({ links: { ...links, [tabId]: tabLinks } });
    }
  }

  async moveLink(fromTabId, linkId, toTabId, toFolderId = null) {
    const { links } = await this.get(['links']);
    const fromLinks = links?.[fromTabId] || [];
    const linkIndex = fromLinks.findIndex(l => l.id === linkId);

    if (linkIndex !== -1) {
      const link = fromLinks[linkIndex];
      fromLinks.splice(linkIndex, 1);

      const toLinks = links?.[toTabId] || [];
      link.tabId = toTabId;
      link.folderId = toFolderId;
      toLinks.push(link);

      await this.set({
        links: {
          ...links,
          [fromTabId]: fromLinks,
          [toTabId]: toLinks
        }
      });

      await this.updateTabCount(fromTabId, fromLinks.length);
      await this.updateTabCount(toTabId, toLinks.length);
    }
  }

  // === CURRENT VIEW ===
  async getCurrentView() {
    const { currentView } = await this.get(['currentView']);
    return currentView || { tabId: 'all-links', folderId: null, breadcrumbs: [] };
  }

  async setCurrentView(view) {
    await this.set({ currentView: view });
  }

  // === SEARCH ===
  async searchLinks(tabId, query) {
    const allLinks = await this.getAllLinks(tabId);
    const lowerQuery = query.toLowerCase();

    return allLinks.filter(link =>
      link.title.toLowerCase().includes(lowerQuery) ||
      link.url.toLowerCase().includes(lowerQuery)
    );
  }
}

// Export singleton instance
const storage = new StorageManager();
