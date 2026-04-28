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

  // === TODO ===
  async getTodoData() {
    const { todoData } = await this.get(['todoData']);
    return todoData || { projects: [], statuses: {}, tasks: {} };
  }

  async setTodoData(data) {
    await this.set({ todoData: data });
  }

  async createTodoProject(name) {
    const data = await this.getTodoData();
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    data.projects.push({ id, name, createdAt: new Date().toISOString() });
    data.statuses[id] = [
      { id: `st-${id}-todo`, name: 'Todo', order: 0 },
      { id: `st-${id}-prog`, name: 'In Progress', order: 1 },
      { id: `st-${id}-done`, name: 'Done', order: 2 }
    ];
    data.tasks[id] = [];
    await this.setTodoData(data);
    return id;
  }

  async renameTodoProject(projectId, name) {
    const data = await this.getTodoData();
    const p = data.projects.find(p => p.id === projectId);
    if (p) { p.name = name; await this.setTodoData(data); }
  }

  async deleteTodoProject(projectId) {
    const data = await this.getTodoData();
    data.projects = data.projects.filter(p => p.id !== projectId);
    delete data.statuses[projectId];
    delete data.tasks[projectId];
    await this.setTodoData(data);
  }

  async addTodoStatus(projectId, name) {
    const data = await this.getTodoData();
    const list = data.statuses[projectId] || [];
    list.push({
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      order: list.length
    });
    data.statuses[projectId] = list;
    await this.setTodoData(data);
  }

  async renameTodoStatus(projectId, statusId, name) {
    const data = await this.getTodoData();
    const s = (data.statuses[projectId] || []).find(s => s.id === statusId);
    if (s) { s.name = name; await this.setTodoData(data); }
  }

  async deleteTodoStatus(projectId, statusId) {
    const data = await this.getTodoData();
    data.statuses[projectId] = (data.statuses[projectId] || []).filter(s => s.id !== statusId);
    data.tasks[projectId] = (data.tasks[projectId] || []).filter(t => t.statusId !== statusId);
    await this.setTodoData(data);
  }

  async addTodoTask(projectId, statusId, title) {
    const data = await this.getTodoData();
    const list = data.tasks[projectId] || [];
    list.push({
      id: `tk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      statusId,
      title,
      order: list.filter(t => t.statusId === statusId).length,
      createdAt: new Date().toISOString()
    });
    data.tasks[projectId] = list;
    await this.setTodoData(data);
  }

  async updateTodoTask(projectId, taskId, patch) {
    const data = await this.getTodoData();
    const t = (data.tasks[projectId] || []).find(t => t.id === taskId);
    if (t) { Object.assign(t, patch); await this.setTodoData(data); }
  }

  async deleteTodoTask(projectId, taskId) {
    const data = await this.getTodoData();
    data.tasks[projectId] = (data.tasks[projectId] || []).filter(t => t.id !== taskId);
    await this.setTodoData(data);
  }

  async moveTodoTask(projectId, taskId, newStatusId, newIndex) {
    const data = await this.getTodoData();
    const list = data.tasks[projectId] || [];
    const task = list.find(t => t.id === taskId);
    if (!task) return;
    task.statusId = newStatusId;
    // reorder within new status
    const inStatus = list.filter(t => t.statusId === newStatusId && t.id !== taskId)
      .sort((a, b) => a.order - b.order);
    inStatus.splice(newIndex, 0, task);
    inStatus.forEach((t, i) => { t.order = i; });
    await this.setTodoData(data);
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
