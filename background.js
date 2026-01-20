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
});

// Keep service worker alive
browser.alarms.create('keepAlive', { periodInMinutes: 1 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Simple keepalive ping
    console.log('Service worker alive');
  }
});
