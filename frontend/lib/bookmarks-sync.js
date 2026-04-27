// LinkFlow -> browser.bookmarks one-way sync.
// Mirrors extension tabs/folders/links into a "LinkFlow" root folder
// under the browser's "Other Bookmarks" (Firefox: unfiled_____, Chrome: "2").

const ROOT_TITLE = 'LinkFlow';

class BookmarkSync {
  constructor() {
    this.running = false;
    this.pending = false;
    this.initialized = false;
  }

  async init() {
    if (!this.initialized) {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes.tabs && !changes.folders && !changes.links) return;
        this.schedule();
      });
      this.initialized = true;
    }
    await this.schedule();
  }

  schedule() {
    if (this.running) {
      this.pending = true;
      return;
    }
    return this.run();
  }

  async run() {
    this.running = true;
    try {
      do {
        this.pending = false;
        await this.syncAll();
      } while (this.pending);
    } catch (err) {
      console.error('BookmarkSync error:', err);
    } finally {
      this.running = false;
    }
  }

  async findUnfiledParent() {
    for (const id of ['unfiled_____', '2']) {
      try {
        await browser.bookmarks.get(id);
        return id;
      } catch (_) { /* not this platform */ }
    }
    const tree = await browser.bookmarks.getTree();
    return tree[0].children[tree[0].children.length - 1].id;
  }

  async ensureRoot() {
    const { bookmarkMap = {} } = await browser.storage.local.get('bookmarkMap');
    if (bookmarkMap.rootId) {
      try {
        await browser.bookmarks.get(bookmarkMap.rootId);
        return bookmarkMap.rootId;
      } catch (_) { /* stale, recreate */ }
    }
    const parentId = await this.findUnfiledParent();
    const root = await browser.bookmarks.create({ parentId, title: ROOT_TITLE });
    bookmarkMap.rootId = root.id;
    bookmarkMap.tabs ??= {};
    bookmarkMap.folders ??= {};
    bookmarkMap.links ??= {};
    await browser.storage.local.set({ bookmarkMap });
    return root.id;
  }

  async getNode(id) {
    try {
      const [node] = await browser.bookmarks.get(id);
      return node;
    } catch (_) {
      return null;
    }
  }

  async syncAll() {
    const rootId = await this.ensureRoot();
    const state = await browser.storage.local.get([
      'tabs', 'folders', 'links', 'bookmarkMap'
    ]);
    const tabs = state.tabs || [];
    const folders = state.folders || {};
    const links = state.links || {};
    const bookmarkMap = state.bookmarkMap || {};
    bookmarkMap.tabs ??= {};
    bookmarkMap.folders ??= {};
    bookmarkMap.links ??= {};

    await this.syncTabs(tabs, rootId, bookmarkMap);
    await this.syncFolders(folders, bookmarkMap);
    await this.syncLinks(links, bookmarkMap);

    await browser.storage.local.set({ bookmarkMap });
  }

  async syncTabs(tabs, rootId, bookmarkMap) {
    const live = new Set();
    for (const tab of tabs) {
      if (tab.id === 'all-links') continue;
      live.add(tab.id);
      const existing = bookmarkMap.tabs[tab.id];
      const node = existing ? await this.getNode(existing) : null;
      if (!node) {
        const created = await browser.bookmarks.create({
          parentId: rootId,
          title: tab.name
        });
        bookmarkMap.tabs[tab.id] = created.id;
      } else {
        if (node.title !== tab.name) {
          await browser.bookmarks.update(existing, { title: tab.name });
        }
        if (node.parentId !== rootId) {
          await browser.bookmarks.move(existing, { parentId: rootId });
        }
      }
    }
    for (const [tabId, bmId] of Object.entries(bookmarkMap.tabs)) {
      if (!live.has(tabId)) {
        try { await browser.bookmarks.removeTree(bmId); } catch (_) {}
        delete bookmarkMap.tabs[tabId];
      }
    }
  }

  async syncFolders(foldersByTab, bookmarkMap) {
    const live = new Set();
    const tabIdByFolder = {};
    const topoByTab = {};

    for (const [tabId, list] of Object.entries(foldersByTab)) {
      if (tabId === 'all-links') continue;
      if (!bookmarkMap.tabs[tabId]) continue;
      topoByTab[tabId] = this.topoSort(list);
      for (const f of topoByTab[tabId]) tabIdByFolder[f.id] = tabId;
    }

    for (const [tabId, ordered] of Object.entries(topoByTab)) {
      const tabBmId = bookmarkMap.tabs[tabId];
      for (const folder of ordered) {
        live.add(folder.id);
        const parentBmId = folder.parentId
          ? bookmarkMap.folders[folder.parentId]
          : tabBmId;
        if (!parentBmId) continue;
        const existing = bookmarkMap.folders[folder.id];
        const node = existing ? await this.getNode(existing) : null;
        if (!node) {
          const created = await browser.bookmarks.create({
            parentId: parentBmId,
            title: folder.name
          });
          bookmarkMap.folders[folder.id] = created.id;
        } else {
          if (node.title !== folder.name) {
            await browser.bookmarks.update(existing, { title: folder.name });
          }
          if (node.parentId !== parentBmId) {
            await browser.bookmarks.move(existing, { parentId: parentBmId });
          }
        }
      }
    }
    for (const [fid, bmId] of Object.entries(bookmarkMap.folders)) {
      if (!live.has(fid)) {
        try { await browser.bookmarks.removeTree(bmId); } catch (_) {}
        delete bookmarkMap.folders[fid];
      }
    }
  }

  topoSort(folders) {
    const byId = new Map(folders.map(f => [f.id, f]));
    const visited = new Set();
    const out = [];
    const visit = (f) => {
      if (!f || visited.has(f.id)) return;
      if (f.parentId && byId.has(f.parentId)) visit(byId.get(f.parentId));
      visited.add(f.id);
      out.push(f);
    };
    for (const f of folders) visit(f);
    return out;
  }

  async syncLinks(linksByTab, bookmarkMap) {
    const live = new Set();
    for (const [tabId, list] of Object.entries(linksByTab)) {
      if (tabId === 'all-links') continue;
      const tabBmId = bookmarkMap.tabs[tabId];
      if (!tabBmId) continue;
      for (const link of list) {
        live.add(link.id);
        const parentBmId = link.folderId
          ? bookmarkMap.folders[link.folderId]
          : tabBmId;
        if (!parentBmId) continue;
        const existing = bookmarkMap.links[link.id];
        const node = existing ? await this.getNode(existing) : null;
        if (!node) {
          const created = await browser.bookmarks.create({
            parentId: parentBmId,
            title: link.title,
            url: link.url
          });
          bookmarkMap.links[link.id] = created.id;
        } else {
          const updates = {};
          if (node.title !== link.title) updates.title = link.title;
          if (node.url !== link.url) updates.url = link.url;
          if (Object.keys(updates).length) {
            await browser.bookmarks.update(existing, updates);
          }
          if (node.parentId !== parentBmId) {
            await browser.bookmarks.move(existing, { parentId: parentBmId });
          }
        }
      }
    }
    for (const [lid, bmId] of Object.entries(bookmarkMap.links)) {
      if (!live.has(lid)) {
        try { await browser.bookmarks.remove(bmId); } catch (_) {}
        delete bookmarkMap.links[lid];
      }
    }
  }
}

const bookmarkSync = new BookmarkSync();
