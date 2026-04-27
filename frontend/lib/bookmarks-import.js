// Netscape Bookmark File Format importer.
// Preserves folder hierarchy. Skips URLs already present anywhere in extension.

class BookmarksImporter {
  parse(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rootDL = doc.querySelector('dl');
    if (!rootDL) return [];
    return this.parseDL(rootDL);
  }

  parseDL(dl) {
    const items = [];
    for (const dt of dl.children) {
      if (dt.tagName !== 'DT') continue;
      const header = dt.querySelector(':scope > h3');
      const anchor = dt.querySelector(':scope > a');
      if (header) {
        const nestedDL = dt.querySelector(':scope > dl');
        items.push({
          type: 'folder',
          name: header.textContent.trim() || 'Untitled Folder',
          isSystem:
            header.hasAttribute('personal_toolbar_folder') ||
            header.hasAttribute('unfiled_bookmarks_folder'),
          children: nestedDL ? this.parseDL(nestedDL) : []
        });
      } else if (anchor && anchor.href) {
        items.push({
          type: 'link',
          title: anchor.textContent.trim() || anchor.href,
          url: anchor.href
        });
      }
    }
    return items;
  }

  unwrapSystemFolders(tree) {
    const wrapperNames = new Set([
      'bookmarks toolbar',
      'bookmarks menu',
      'other bookmarks',
      'mobile bookmarks',
      'bookmarks bar'
    ]);
    const out = [];
    for (const item of tree) {
      if (item.type === 'folder') {
        const norm = item.name.toLowerCase().replace(/[^a-z ]/g, '').trim();
        if (item.isSystem || wrapperNames.has(norm)) {
          out.push(...item.children);
          continue;
        }
      }
      out.push(item);
    }
    return out;
  }

  normalizeUrl(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      let s = u.toString();
      if (s.endsWith('/')) s = s.slice(0, -1);
      return s.toLowerCase();
    } catch (_) {
      return url.trim().toLowerCase();
    }
  }

  async import(html, options = {}) {
    const tree = this.unwrapSystemFolders(this.parse(html));
    const stats = { total: 0, added: 0, duplicates: 0, folders: 0 };
    if (!tree.length) return stats;

    const data = await browser.storage.local.get(['tabs', 'folders', 'links']);
    const tabs = data.tabs || [];
    const folders = data.folders || {};
    const links = data.links || {};

    // Seen URLs across all tabs
    const seen = new Set();
    for (const list of Object.values(links)) {
      for (const l of list) seen.add(this.normalizeUrl(l.url));
    }

    // Pick destination tab
    let destTabId = options.tabId;
    if (!destTabId || destTabId === 'all-links') {
      const firstReal = tabs.find(t => t.id !== 'all-links');
      if (firstReal) {
        destTabId = firstReal.id;
      } else {
        destTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        tabs.push({ id: destTabId, name: 'Imported', count: 0 });
      }
    }
    folders[destTabId] ||= [];
    links[destTabId] ||= [];

    // Existing folder-name-by-parent index for merging
    const folderByKey = new Map();
    for (const f of folders[destTabId]) {
      folderByKey.set(`${f.parentId || 'root'}::${f.name}`, f.id);
    }

    let uid = 0;
    const newId = (prefix) =>
      `${prefix}-${Date.now()}-${uid++}-${Math.random().toString(36).slice(2, 7)}`;

    const ensureFolder = (name, parentId) => {
      const key = `${parentId || 'root'}::${name}`;
      if (folderByKey.has(key)) return folderByKey.get(key);
      const id = newId('folder');
      folders[destTabId].push({
        id,
        name,
        parentId,
        tabId: destTabId,
        createdAt: new Date().toISOString()
      });
      folderByKey.set(key, id);
      stats.folders++;
      return id;
    };

    const addLink = (item, folderId) => {
      stats.total++;
      const key = this.normalizeUrl(item.url);
      if (seen.has(key)) {
        stats.duplicates++;
        return;
      }
      seen.add(key);
      const platform = typeof PlatformDetector !== 'undefined'
        ? PlatformDetector.detect(item.url)
        : 'other';
      links[destTabId].push({
        id: newId('link'),
        title: item.title,
        url: item.url,
        platform,
        folderId,
        tabId: destTabId,
        createdAt: new Date().toISOString()
      });
      stats.added++;
    };

    const walk = (items, parentFolderId) => {
      for (const item of items) {
        if (item.type === 'link') {
          addLink(item, parentFolderId);
        } else {
          const fid = ensureFolder(item.name, parentFolderId);
          walk(item.children, fid);
        }
      }
    };
    walk(tree, null);

    // Update counts
    for (const tab of tabs) {
      if (tab.id === 'all-links') continue;
      tab.count = (links[tab.id] || []).length;
    }

    await browser.storage.local.set({ tabs, folders, links });
    stats.destTabId = destTabId;
    return stats;
  }
}

const bookmarksImporter = new BookmarksImporter();
