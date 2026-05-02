// Storage layer — backend-backed.
// Local cache invalidated on mutation; server is source of truth.

const ROOT_TAB = { id: 'root', name: 'Root' };
const DEFAULT_ROOT_FOLDERS = ['Work', 'Personal', 'Inspiration'];

class StorageManager {
  constructor() {
    this.local = browser.storage.local;
    this.cache = {
      bookmarksByTab: new Map(), // tabId -> array of bookmarks
      todoData: null
    };
  }

  invalidate() {
    this.cache.bookmarksByTab.clear();
  }

  async _get(keys) { return this.local.get(keys); }
  async _set(data) { return this.local.set(data); }

  // Internal — fetch all bookmarks for a tab (folders + links) from server.
  async _fetchTabBookmarks(tabId) {
    if (this.cache.bookmarksByTab.has(tabId)) return this.cache.bookmarksByTab.get(tabId);
    try {
      const data = await api.authedFetch(`/bookmarks?tab=${encodeURIComponent(tabId)}`);
      const list = data.bookmarks || [];
      this.cache.bookmarksByTab.set(tabId, list);
      return list;
    } catch (err) {
      console.warn('LinkFlow: bookmarks fetch failed', err);
      return [];
    }
  }

  toFolder(b) {
    return {
      id: b.id,
      name: b.name,
      parentId: b.parentId,
      tabId: b.tab,
      createdAt: b.createdAt
    };
  }

  toLink(b) {
    return {
      id: b.id,
      title: b.name,
      url: b.url,
      platform: b.platform,
      folderId: b.parentId,
      tabId: b.tab,
      createdAt: b.createdAt
    };
  }

  // === TABS (single hidden root) ===
  async getTabs() {
    return [ROOT_TAB ];
  }

  async ensureDefaultRootFolders() {
    if (this._seedAttempted) return;
    this._seedAttempted = true;
    try {
      const all = await this._fetchTabBookmarks(ROOT_TAB.id);
      const rootFolders = all.filter(b => b.kind === 'folder' && !b.parentId);
      if (rootFolders.length > 0) return;
      const { rootSeeded } = await this._get(['rootSeeded']);
      if (rootSeeded) return;
      for (const name of DEFAULT_ROOT_FOLDERS) {
        try {
          await api.authedFetch('/bookmarks', {
            method: 'POST',
            body: { tab: ROOT_TAB.id, parentId: null, kind: 'folder', name }
          });
        } catch (_) {}
      }
      await this._set({ rootSeeded: true });
      this.invalidate();
    } catch (_) {}
  }

  async updateTabCount(_tabId, _count) { /* unused now */ }

  // === FOLDERS ===
  async getFolders(tabId) {
    const all = await this._fetchTabBookmarks(tabId);
    return all.filter(b => b.kind === 'folder').map(b => this.toFolder(b));
  }

  async createFolder(tabId, name, parentId = null) {
    const data = await api.authedFetch('/bookmarks', {
      method: 'POST',
      body: { tab: tabId, parentId, kind: 'folder', name }
    });
    this.invalidate();
    return data.bookmark ? this.toFolder(data.bookmark) : null;
  }

  async deleteFolder(tabId, folderId) {
    await api.authedFetch(`/bookmarks/${folderId}`, { method: 'DELETE' });
    this.invalidate();
  }

  async renameFolder(tabId, folderId, newName) {
    await api.authedFetch(`/bookmarks/${folderId}`, {
      method: 'PATCH',
      body: { name: newName }
    });
    this.invalidate();
  }

  // === LINKS ===
  async getLinks(tabId, folderId = null) {
    const all = await this._fetchTabBookmarks(tabId);
    return all
      .filter(b => b.kind === 'link' && (b.parentId || null) === (folderId || null))
      .map(b => this.toLink(b));
  }

  async getAllLinks(tabId) {
    const all = await this._fetchTabBookmarks(tabId);
    return all.filter(b => b.kind === 'link').map(b => this.toLink(b));
  }

  async createLink(tabId, linkData) {
    const data = await api.authedFetch('/bookmarks', {
      method: 'POST',
      body: {
        tab: tabId,
        parentId: linkData.folderId || null,
        kind: 'link',
        name: linkData.title,
        url: linkData.url,
        platform: linkData.platform || null
      }
    });
    this.invalidate();
    return data.bookmark ? this.toLink(data.bookmark) : null;
  }

  async deleteLink(tabId, linkId) {
    await api.authedFetch(`/bookmarks/${linkId}`, { method: 'DELETE' });
    this.invalidate();
  }

  async updateLink(tabId, linkId, updates) {
    const body = {};
    if (typeof updates.title === 'string') body.name = updates.title;
    if (typeof updates.url === 'string') body.url = updates.url;
    if (typeof updates.platform === 'string') body.platform = updates.platform;
    if (Object.keys(body).length === 0) return;
    await api.authedFetch(`/bookmarks/${linkId}`, { method: 'PATCH', body });
    this.invalidate();
  }

  async moveLink(fromTabId, linkId, toTabId, toFolderId = null) {
    await api.authedFetch(`/bookmarks/${linkId}`, {
      method: 'PATCH',
      body: { tab: toTabId, parentId: toFolderId }
    });
    this.invalidate();
  }

  async moveBookmark(bookmarkId, toTabId, toParentId = null) {
    await api.authedFetch(`/bookmarks/${bookmarkId}`, {
      method: 'PATCH',
      body: { tab: toTabId, parentId: toParentId }
    });
    this.invalidate();
  }

  async reorderBookmarks(tabId, parentId, orderedIds) {
    await api.authedFetch('/bookmarks/reorder', {
      method: 'POST',
      body: { tab: tabId, parentId: parentId || null, orderedIds }
    });
    this.invalidate();
  }

  // === CURRENT VIEW (local cache only) ===
  async getCurrentView() {
    const { currentView } = await this._get(['currentView']);
    return currentView || { tabId: 'work', folderId: null, breadcrumbs: [] };
  }

  async setCurrentView(view) {
    await this._set({ currentView: view });
  }

  // === TODO (server-backed JSON blob) ===
  async getTodoData() {
    if (this.cache.todoData) return this.cache.todoData;
    try {
      const res = await api.authedFetch('/todos');
      this.cache.todoData = res.data || { projects: [], statuses: {}, tasks: {} };
    } catch (err) {
      console.warn('LinkFlow: todo fetch failed', err);
      this.cache.todoData = { projects: [], statuses: {}, tasks: {} };
    }
    return this.cache.todoData;
  }

  async setTodoData(data) {
    this.cache.todoData = data;
    try {
      await api.authedFetch('/todos', { method: 'PUT', body: { data } });
    } catch (err) {
      console.warn('LinkFlow: todo save failed', err);
    }
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
    const inStatus = list.filter(t => t.statusId === newStatusId && t.id !== taskId)
      .sort((a, b) => a.order - b.order);
    inStatus.splice(newIndex, 0, task);
    inStatus.forEach((t, i) => { t.order = i; });
    await this.setTodoData(data);
  }

  // === USER SETTINGS (local) ===
  async getSettings() {
    const { userSettings } = await this._get(['userSettings']);
    return Object.assign({
      textColor: '#181d26',
      bgColor: '#ffffff',
      // 'whitelist-default' = show bubble everywhere, blacklist removes specific hosts.
      // 'blacklist-default' = hide bubble everywhere, whitelist allows specific hosts.
      siteMode: 'whitelist-default',
      whitelist: '',
      blacklist: '',
      notificationsEnabled: true
    }, userSettings || {});
  }

  async saveSettings(patch) {
    const cur = await this.getSettings();
    const next = Object.assign({}, cur, patch);
    await this._set({ userSettings: next });
    return next;
  }

  // === NOTES ===
  async listNotes() {
    const res = await api.authedFetch('/notes');
    return res.notes || [];
  }
  async getNote(id) {
    const res = await api.authedFetch(`/notes/${id}`);
    return res.note;
  }
  async createNote(payload = {}) {
    const res = await api.authedFetch('/notes', { method: 'POST', body: payload });
    return res.note;
  }
  async updateNote(id, patch) {
    const res = await api.authedFetch(`/notes/${id}`, { method: 'PATCH', body: patch });
    return res.note;
  }
  async deleteNote(id) {
    await api.authedFetch(`/notes/${id}`, { method: 'DELETE' });
  }

  // === FEATURE REQUESTS ===
  async listFeatureRequests() {
    const res = await api.authedFetch('/feature-requests');
    return res.requests || [];
  }
  async createFeatureRequest(payload) {
    const res = await api.authedFetch('/feature-requests', { method: 'POST', body: payload });
    return res.request;
  }

  // === SEARCH ===
  async searchLinks(tabId, query) {
    const all = await this.getAllLinks(tabId);
    const q = query.toLowerCase();
    return all.filter(l =>
      (l.title || '').toLowerCase().includes(q) ||
      (l.url || '').toLowerCase().includes(q)
    );
  }
}

const storage = new StorageManager();
