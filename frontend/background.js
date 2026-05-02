// Background service worker for LinkFlow

// Initialize storage on installation
browser.runtime.onInstalled.addListener(async () => {
  console.log('LinkFlow installed');

  // Initialize default data structure if not exists
  const data = await browser.storage.local.get(['tabs', 'folders', 'links']);

  if (!data.tabs) {
    const defaultData = {
      tabs: [
        { id: 'all-links', name: 'All Links', isDefault: true },
        { id: 'work', name: 'Work', count: 0 },
        { id: 'personal', name: 'Personal', count: 0 },
        { id: 'inspiration', name: 'Inspiration', count: 0 }
      ],
      folders: {},
      links: {},
      currentView: {
        tabId: 'all-links',
        folderId: null,
        breadcrumbs: []
      },
      settings: {
        theme: 'light',
        autoSave: true
      }
    };

    await browser.storage.local.set(defaultData);
    console.log('Default data initialized');
  }

  await bookmarkSync.init();
});

browser.runtime.onStartup.addListener(async () => {
  await bookmarkSync.init();
});

// Listen for messages from popup/content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_TAB') {
    browser.tabs.query({ active: true, currentWindow: true })
      .then(tabs => {
        if (tabs[0]) {
          sendResponse({
            url: tabs[0].url,
            title: tabs[0].title,
            favIconUrl: tabs[0].favIconUrl
          });
        }
      });
    return true; // Will respond asynchronously
  }

  if (message.type === 'OPEN_DASHBOARD') {
    browser.tabs.create({ url: browser.runtime.getURL('dashboard/dashboard.html') });
  }

  if (message.type === 'OPEN_PLAYGROUND') {
    browser.tabs.create({ url: browser.runtime.getURL('playground/playground.html') });
  }

  if (message.type === 'SYNC_BOOKMARKS') {
    bookmarkSync.run()
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // === Tabs proxy (iframe pages can't access browser.tabs) ===
  if (message.type === 'TABS_QUERY') {
    browser.tabs.query(message.args || {})
      .then(list => sendResponse({ ok: true, tabs: list }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'TABS_REMOVE') {
    browser.tabs.remove(message.args.tabIds)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'TABS_CREATE') {
    browser.tabs.create(message.args || {})
      .then(t => sendResponse({ ok: true, tab: t }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'TABS_SWITCH') {
    (async () => {
      try {
        await browser.tabs.update(message.args.tabId, { active: true });
        if (message.args.windowId !== undefined) {
          await browser.windows.update(message.args.windowId, { focused: true });
        }
        sendResponse({ ok: true });
      } catch (err) { sendResponse({ ok: false, error: err.message }); }
    })();
    return true;
  }
  if (message.type === 'TABS_MOVE') {
    browser.tabs.move(message.args.tabIds, { index: message.args.index })
      .then(t => sendResponse({ ok: true, tab: t }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'TABS_GET') {
    browser.tabs.get(message.args.tabId)
      .then(t => sendResponse({ ok: true, tab: t }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  // Tab grouping (Chrome MV3 only — browser.tabs.group / browser.tabGroups).
  if (message.type === 'TABS_GROUP') {
    if (!browser.tabs?.group) {
      sendResponse({ ok: false, error: 'tabs.group not supported in this browser' });
      return false;
    }
    const opts = { tabIds: message.args.tabIds };
    if (message.args.groupId) opts.groupId = message.args.groupId;
    browser.tabs.group(opts)
      .then(gid => sendResponse({ ok: true, groupId: gid }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'TABS_UNGROUP') {
    if (!browser.tabs?.ungroup) {
      sendResponse({ ok: false, error: 'tabs.ungroup not supported' });
      return false;
    }
    browser.tabs.ungroup(message.args.tabIds)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'TAB_GROUPS_QUERY') {
    if (!browser.tabGroups?.query) {
      sendResponse({ ok: true, groups: [] });
      return false;
    }
    browser.tabGroups.query(message.args || {})
      .then(gs => sendResponse({ ok: true, groups: gs }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'TAB_GROUPS_UPDATE') {
    if (!browser.tabGroups?.update) {
      sendResponse({ ok: false, error: 'tabGroups.update not supported' });
      return false;
    }
    browser.tabGroups.update(message.args.groupId, message.args.props)
      .then(g => sendResponse({ ok: true, group: g }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// Keep service worker alive
browser.alarms.create('keepAlive', { periodInMinutes: 1 });

// === Tab activity + snooze ===
const TAB_ACTIVITY_KEY = 'tabActivity';
const SNOOZE_KEY = 'snoozeSettings';

async function recordActivity(tabId) {
  try {
    const { [TAB_ACTIVITY_KEY]: act = {} } = await browser.storage.local.get(TAB_ACTIVITY_KEY);
    act[tabId] = Date.now();
    await browser.storage.local.set({ [TAB_ACTIVITY_KEY]: act });
  } catch (_) {}
}
async function clearActivity(tabId) {
  try {
    const { [TAB_ACTIVITY_KEY]: act = {} } = await browser.storage.local.get(TAB_ACTIVITY_KEY);
    delete act[tabId];
    await browser.storage.local.set({ [TAB_ACTIVITY_KEY]: act });
  } catch (_) {}
}

if (browser.tabs?.onActivated) {
  browser.tabs.onActivated.addListener(({ tabId }) => recordActivity(tabId));
}
if (browser.tabs?.onUpdated) {
  browser.tabs.onUpdated.addListener((tabId, ch) => {
    if (ch.status === 'complete' || ch.url) recordActivity(tabId);
  });
}
if (browser.tabs?.onRemoved) {
  browser.tabs.onRemoved.addListener(tabId => clearActivity(tabId));
}

browser.alarms.create('snoozeCheck', { periodInMinutes: 1 });

async function snoozedToBookmarks(tab) {
  try {
    const data = await browser.storage.local.get(['auth.accessToken']);
    const token = data['auth.accessToken'];
    if (!token) return;
    const API = 'http://localhost:4000';
    const resp = await fetch(`${API}/bookmarks?tab=root`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!resp.ok) return;
    const list = (await resp.json()).bookmarks || [];
    let snooze = list.find(b => b.kind === 'folder' && !b.parentId && b.name === 'Snoozed');
    if (!snooze) {
      const r = await fetch(`${API}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ tab: 'root', parentId: null, kind: 'folder', name: 'Snoozed' })
      });
      if (r.ok) snooze = (await r.json()).bookmark;
    }
    if (!snooze) return;
    await fetch(`${API}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        tab: 'root', parentId: snooze.id, kind: 'link',
        name: tab.title || tab.url, url: tab.url
      })
    });
  } catch (_) {}
}

async function runSnoozeCheck() {
  try {
    const store = await browser.storage.local.get([SNOOZE_KEY, TAB_ACTIVITY_KEY]);
    const settings = store[SNOOZE_KEY];
    if (!settings || !settings.enabled) return;
    const activity = store[TAB_ACTIVITY_KEY] || {};
    const tabs = await browser.tabs.query({});
    const now = Date.now();
    for (const t of tabs) {
      if (t.active || t.pinned) continue;
      if (!t.url) continue;
      const u = t.url;
      if (u.startsWith('about:') || u.startsWith('chrome:') || u.startsWith('moz-extension:') ||
          u.startsWith('chrome-extension:') || u === 'about:blank') continue;
      let host = '';
      try { host = new URL(u).hostname; } catch (_) {}
      const rules = settings.rules || {};
      const minutes = (rules[host] != null) ? rules[host] : settings.defaultMinutes;
      if (!Number.isFinite(minutes) || minutes <= 0) continue;
      const last = activity[t.id] || t.lastAccessed || 0;
      const idleMin = (now - last) / 60000;
      if (idleMin >= minutes) {
        if (settings.action === 'bookmarkAndClose') {
          await snoozedToBookmarks(t);
        }
        try { await browser.tabs.remove(t.id); } catch (_) {}
      }
    }
  } catch (_) {}
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'snoozeCheck') runSnoozeCheck();
});
