// Manual two-way merge between LinkFlow (server) and browser bookmarks toolbar.
//
// Rules:
//  - Sync target is the browser's bookmarks toolbar only (Firefox `toolbar_____` /
//    Chrome `1`). Other roots (Other Bookmarks, Mobile, etc.) are ignored.
//  - LinkFlow → browser: create missing nodes, update title/url for mapped nodes.
//  - Browser → LinkFlow: create missing entries (additive only). Browser-side
//    edits to mapped nodes are NOT pushed back to LinkFlow.
//  - No deletes either way. "No loss" guarantee.
//  - Idempotent — clicking Sync after everything is in sync is a no-op.

const SYNC_ROOT_TITLE = 'LinkFlow';

class BookmarkSync {
  constructor() {
    this.running = false;
  }

  // Compat stubs for older code paths.
  async init() { /* no-op */ }
  async schedule() { return this.run(); }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const toolbarId = await this.getToolbarRoot();
      if (!toolbarId) throw new Error('Could not find browser bookmarks toolbar');

      const map = await this.loadMap();
      const rootId = await this.ensureLinkFlowRoot(toolbarId, map);

      const lfList = await this.fetchLinkFlowList();

      await this.pushLinkFlow(lfList, rootId, map);
      await this.pullBrowser(rootId, null, map);

      await this.saveMap(map);
    } finally {
      this.running = false;
    }
  }

  // === toolbar resolution ===
  async getToolbarRoot() {
    if (typeof browser === 'undefined' || !browser.bookmarks) {
      throw new Error('browser.bookmarks API unavailable (bookmarks permission?)');
    }
    // 1. Known well-known ids.
    for (const id of ['toolbar_____', '1']) {
      try { await browser.bookmarks.get(id); return id; } catch (_) {}
    }
    // 2. Title match (locale-dependent).
    try {
      const tree = await browser.bookmarks.getTree();
      const tops = tree[0]?.children || [];
      const byTitle = tops.find(n => !n.url && /toolbar|bookmarks bar/i.test(n.title || ''));
      if (byTitle) return byTitle.id;
      // 3. Last resort: first non-url top-level child (toolbar is conventionally first).
      const firstFolder = tops.find(n => !n.url);
      if (firstFolder) return firstFolder.id;
    } catch (_) {}
    return null;
  }

  async ensureLinkFlowRoot(toolbarId, map) {
    if (map.rootId) {
      const node = await this.getNode(map.rootId);
      if (node && node.parentId === toolbarId) return map.rootId;
    }
    // Look for an existing top-level LinkFlow folder under toolbar.
    const children = await browser.bookmarks.getChildren(toolbarId);
    const found = children.find(c => !c.url && c.title === SYNC_ROOT_TITLE);
    if (found) {
      map.rootId = found.id;
      return found.id;
    }
    const created = await browser.bookmarks.create({ parentId: toolbarId, title: SYNC_ROOT_TITLE });
    map.rootId = created.id;
    return created.id;
  }

  // === map storage ===
  async loadMap() {
    const { bookmarkMap = {} } = await browser.storage.local.get('bookmarkMap');
    bookmarkMap.folders ??= {};        // linkflowId -> browserBmId
    bookmarkMap.links ??= {};
    bookmarkMap.reverseFolders ??= {}; // browserBmId -> linkflowId
    bookmarkMap.reverseLinks ??= {};
    return bookmarkMap;
  }

  async saveMap(map) {
    await browser.storage.local.set({ bookmarkMap: map });
  }

  async getNode(id) {
    try { const [n] = await browser.bookmarks.get(id); return n; }
    catch (_) { return null; }
  }

  // === LinkFlow → browser ===
  async fetchLinkFlowList() {
    const data = await api.authedFetch('/bookmarks?tab=root');
    return data.bookmarks || [];
  }

  topoFolders(folders) {
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

  async pushLinkFlow(items, rootId, map) {
    const folders = items.filter(b => b.kind === 'folder');
    const links = items.filter(b => b.kind === 'link');

    for (const f of this.topoFolders(folders)) {
      const parentBmId = f.parentId ? map.folders[f.parentId] : rootId;
      if (!parentBmId) continue;
      const existing = map.folders[f.id];
      const node = existing ? await this.getNode(existing) : null;
      if (!node) {
        const created = await browser.bookmarks.create({ parentId: parentBmId, title: f.name });
        map.folders[f.id] = created.id;
        map.reverseFolders[created.id] = f.id;
      } else {
        if (node.title !== f.name) {
          try { await browser.bookmarks.update(existing, { title: f.name }); } catch (_) {}
        }
      }
    }

    for (const l of links) {
      const parentBmId = l.parentId ? map.folders[l.parentId] : rootId;
      if (!parentBmId) continue;
      const existing = map.links[l.id];
      const node = existing ? await this.getNode(existing) : null;
      if (!node) {
        const created = await browser.bookmarks.create({
          parentId: parentBmId,
          title: l.name || l.url,
          url: l.url
        });
        map.links[l.id] = created.id;
        map.reverseLinks[created.id] = l.id;
      } else {
        const updates = {};
        if (node.title !== (l.name || l.url)) updates.title = l.name || l.url;
        if (node.url !== l.url) updates.url = l.url;
        if (Object.keys(updates).length) {
          try { await browser.bookmarks.update(existing, updates); } catch (_) {}
        }
      }
    }
  }

  // === browser → LinkFlow (additive only) ===
  async pullBrowser(browserParentId, lfParentId, map) {
    const children = await browser.bookmarks.getChildren(browserParentId);
    for (const ch of children) {
      if (ch.url) {
        if (map.reverseLinks[ch.id]) continue;
        try {
          const data = await api.authedFetch('/bookmarks', {
            method: 'POST',
            body: {
              tab: 'root',
              parentId: lfParentId,
              kind: 'link',
              name: (ch.title && ch.title.trim()) || ch.url,
              url: ch.url
            }
          });
          const newId = data?.bookmark?.id;
          if (newId) {
            map.links[newId] = ch.id;
            map.reverseLinks[ch.id] = newId;
          }
        } catch (err) {
          console.warn('LinkFlow sync: failed to import link', ch.url, err);
        }
      } else {
        // folder
        let lfId = map.reverseFolders[ch.id];
        if (!lfId) {
          try {
            const data = await api.authedFetch('/bookmarks', {
              method: 'POST',
              body: {
                tab: 'root',
                parentId: lfParentId,
                kind: 'folder',
                name: ch.title || 'Untitled'
              }
            });
            lfId = data?.bookmark?.id;
            if (lfId) {
              map.folders[lfId] = ch.id;
              map.reverseFolders[ch.id] = lfId;
            }
          } catch (err) {
            console.warn('LinkFlow sync: failed to import folder', ch.title, err);
          }
        }
        if (lfId) {
          await this.pullBrowser(ch.id, lfId, map);
        }
      }
    }
  }
}

const bookmarkSync = new BookmarkSync();
